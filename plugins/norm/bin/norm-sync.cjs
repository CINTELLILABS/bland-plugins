#!/usr/bin/env node
"use strict";

/**
 * norm-sync — Phase 4a sync engine (no-backend MVP spike).
 *
 * A git-style sync engine between a Bland pathway (server JSON: nodes/edges) and a
 * canonical local file tree under $CLAUDE_PROJECT_DIR/pathway/. State lives under
 * $CLAUDE_PROJECT_DIR/.norm/ (manifest.json + baseline/ snapshot).
 *
 * Subcommands:
 *   clone <id> | clone --new "<name>"   pull a pathway (or create a shell) into pathway/
 *   commit                              3-way drift -> ONE batched POST /v1/pathway/:id -> re-pull baseline
 *   validate                            send current tree to server inline validation, map errors -> files
 *   test                                local round-trip self-check (parse tree -> rebuild nodes/edges)
 *   status                              local hash diff vs manifest (0 network) [+ --server version check]
 *   touch <file>                        bump a file's mtime/normalize so status notices it (helper)
 *
 * Transport: a small adapter interface. The REST adapter (this file) hits /v1/pathway.
 * An MCP adapter is stubbed for when the set_* shims land (manifest.transport: 'rest' | 'mcp').
 *
 * All output is structured JSON on stdout. Errors fail-soft:
 *   { "ok": false, "error": { "code": "...", "message": "...", "details"?: ... } }
 * Process exit code is non-zero on failure so callers can branch on $?.
 *
 * Node >= 18 (uses global fetch). Zero runtime deps — a hand-rolled minimal YAML
 * emitter/parser keeps this self-contained for the spike.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ============================================================================
// Config / env
// ============================================================================

function readEnvUrl() {
	const raw = (
		process.env.BLAND_API_URL ||
		process.env.CLAUDE_PLUGIN_OPTION_bland_api_url ||
		"https://api.bland.ai"
	).trim();
	return raw.replace(/\/+$/, "");
}

function readEnvKey() {
	return (
		process.env.BLAND_API_KEY ||
		process.env.CLAUDE_PLUGIN_OPTION_bland_api_key ||
		""
	).trim();
}

function projectDir() {
	return (process.env.CLAUDE_PROJECT_DIR || process.cwd()).trim();
}

const API_URL = readEnvUrl();
const API_KEY = readEnvKey();
const PROJECT_DIR = projectDir();
const PATHWAY_DIR = path.join(PROJECT_DIR, "pathway");
const NORM_DIR = path.join(PROJECT_DIR, ".norm");
const MANIFEST_PATH = path.join(NORM_DIR, "manifest.json");
const BASELINE_DIR = path.join(NORM_DIR, "baseline");

// Respect 120 req/min — minimum spacing between outbound calls.
const MIN_REQUEST_SPACING_MS = Math.ceil(60000 / 120); // 500ms

// ============================================================================
// Structured output helpers
// ============================================================================

function emit(obj) {
	process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function fail(code, message, details) {
	emit({
		ok: false,
		error: details === undefined ? { code, message } : { code, message, details },
	});
	process.exitCode = 1;
}

function ok(payload) {
	emit({ ok: true, ...payload });
}

class NormError extends Error {
	constructor(code, message, details) {
		super(message);
		this.code = code;
		this.details = details;
	}
}

// ============================================================================
// Minimal YAML (emit + parse). Sufficient for our frontmatter/config files.
// Not a general YAML implementation; covers scalars, nested maps, and arrays of
// scalars or flat objects — which is all the generator layout uses. Anything
// richer is JSON-encoded inline so it round-trips losslessly.
// ============================================================================

function yamlScalar(v) {
	if (v === null || v === undefined) return "null";
	if (typeof v === "boolean") return v ? "true" : "false";
	if (typeof v === "number") return String(v);
	const s = String(v);
	if (s === "") return '""';
	// Quote anything that could be misparsed.
	if (/^[\s]|[\s]$|[:#\-?\[\]{}&*!|>'"%@`,]|^(true|false|null|~)$|^[0-9]/.test(s) || s.includes("\n")) {
		return JSON.stringify(s);
	}
	return s;
}

function yamlEmit(obj, indent) {
	indent = indent || 0;
	const pad = "  ".repeat(indent);
	const lines = [];
	if (Array.isArray(obj)) {
		if (obj.length === 0) return `${pad}[]\n`;
		for (const item of obj) {
			if (item !== null && typeof item === "object") {
				// Inline-encode non-trivial array items as JSON for lossless round-trip.
				lines.push(`${pad}- ${JSON.stringify(item)}`);
			} else {
				lines.push(`${pad}- ${yamlScalar(item)}`);
			}
		}
		return `${lines.join("\n")}\n`;
	}
	const keys = Object.keys(obj);
	if (keys.length === 0) return `${pad}{}\n`;
	for (const k of keys) {
		const v = obj[k];
		if (v !== null && typeof v === "object") {
			if (Array.isArray(v) && v.every((x) => x === null || typeof x !== "object")) {
				lines.push(`${pad}${k}:`);
				lines.push(yamlEmit(v, indent + 1).replace(/\n$/, ""));
			} else {
				// JSON-inline objects/complex arrays to guarantee round-trip fidelity.
				lines.push(`${pad}${k}: ${JSON.stringify(v)}`);
			}
		} else {
			lines.push(`${pad}${k}: ${yamlScalar(v)}`);
		}
	}
	return `${lines.join("\n")}\n`;
}

function yamlParseScalar(raw) {
	const s = raw.trim();
	if (s === "" || s === "null" || s === "~") return null;
	if (s === "true") return true;
	if (s === "false") return false;
	if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
	if ((s.startsWith('"') || s.startsWith("[") || s.startsWith("{")) ) {
		try {
			return JSON.parse(s);
		} catch {
			/* fall through */
		}
	}
	return s;
}

/**
 * Parse the subset of YAML the generator emits: top-level key: value, nested
 * one-level maps, and `- item` arrays. JSON-inlined values are decoded by
 * yamlParseScalar. Good enough for the spike's structured surfaces.
 */
function yamlParse(text) {
	const root = {};
	const lines = text.split("\n");
	let i = 0;
	function parseBlock(baseIndent) {
		const out = {};
		let arr = null;
		while (i < lines.length) {
			const line = lines[i];
			if (line.trim() === "" || line.trim().startsWith("#")) {
				i++;
				continue;
			}
			const indent = line.length - line.replace(/^\s+/, "").length;
			if (indent < baseIndent) break;
			if (indent > baseIndent) {
				i++;
				continue;
			}
			const content = line.slice(indent);
			if (content.startsWith("- ")) {
				if (arr === null) arr = [];
				arr.push(yamlParseScalar(content.slice(2)));
				i++;
				continue;
			}
			const ci = content.indexOf(":");
			if (ci === -1) {
				i++;
				continue;
			}
			const key = content.slice(0, ci).trim();
			const rest = content.slice(ci + 1).trim();
			if (rest === "") {
				i++;
				// Could be a nested map/array.
				const nextIndent =
					i < lines.length && lines[i].trim() !== ""
						? lines[i].length - lines[i].replace(/^\s+/, "").length
						: baseIndent;
				if (nextIndent > baseIndent) {
					out[key] = parseBlock(nextIndent);
				} else {
					out[key] = null;
				}
			} else {
				out[key] = yamlParseScalar(rest);
				i++;
			}
		}
		return arr !== null ? arr : out;
	}
	const result = parseBlock(0);
	return result && typeof result === "object" ? result : root;
}

// ============================================================================
// Markdown frontmatter parse (mirrors engine/parser.ts parseFile)
// ============================================================================

function parseFrontmatter(content) {
	const match = content.match(/^---\n([\s\S]*?)\n?---\n?([\s\S]*)$/);
	if (!match) {
		return { frontmatter: {}, body: content.trim() };
	}
	return {
		frontmatter: yamlParse(match[1]) || {},
		body: match[2].replace(/\n+$/, "").trim(),
	};
}

// ============================================================================
// File / hash helpers
// ============================================================================

function sha256(content) {
	return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true });
}

function writeFileTree(root, files) {
	for (const f of files) {
		const abs = path.join(root, f.path);
		ensureDir(path.dirname(abs));
		fs.writeFileSync(abs, f.content, "utf8");
	}
}

function walkFiles(root) {
	const out = [];
	if (!fs.existsSync(root)) return out;
	function rec(dir) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				rec(abs);
			} else if (entry.isFile()) {
				out.push(path.relative(root, abs).split(path.sep).join("/"));
			}
		}
	}
	rec(root);
	return out.sort();
}

function readTree(root) {
	const map = {};
	for (const rel of walkFiles(root)) {
		map[rel] = fs.readFileSync(path.join(root, rel), "utf8");
	}
	return map;
}

function hashTree(treeMap) {
	const hashes = {};
	for (const [rel, content] of Object.entries(treeMap)) {
		hashes[rel] = sha256(content);
	}
	return hashes;
}

// ============================================================================
// Manifest
// ============================================================================

function readManifest() {
	if (!fs.existsSync(MANIFEST_PATH)) {
		throw new NormError(
			"NO_MANIFEST",
			`No pathway cloned. Run 'norm-sync clone <id>' first (missing ${MANIFEST_PATH}).`,
		);
	}
	return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function writeManifest(m) {
	ensureDir(NORM_DIR);
	fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(m, null, 2)}\n`, "utf8");
}

function writeBaseline(treeMap) {
	if (fs.existsSync(BASELINE_DIR)) {
		fs.rmSync(BASELINE_DIR, { recursive: true, force: true });
	}
	ensureDir(BASELINE_DIR);
	writeFileTree(
		BASELINE_DIR,
		Object.entries(treeMap).map(([p, content]) => ({ path: p, content })),
	);
}

// ============================================================================
// Generator (ported subset of engine/generator.ts) — nodes/edges JSON -> files
// ============================================================================

function nodeShortId(uuid) {
	return String(uuid).replace(/-/g, "").substring(0, 8).toLowerCase();
}

function isGlobalConfigNode(node) {
	return node && typeof node === "object" && "globalConfig" in node;
}

function buildSlugMap(nodes) {
	const idToSlug = new Map();
	const used = new Set();
	for (const node of nodes) {
		if (isGlobalConfigNode(node)) continue;
		if (!node.data) continue;
		const shortId = nodeShortId(node.id);
		let slug = shortId;
		let counter = 1;
		while (used.has(slug)) {
			slug = `${shortId}-${counter++}`;
		}
		used.add(slug);
		idToSlug.set(node.id, slug);
	}
	return idToSlug;
}

function frontmatterBlock(frontmatter, body) {
	return `---\n${yamlEmit(frontmatter)}---\n\n${body || ""}\n`;
}

function generateNodeMd(node) {
	const data = node.data || {};
	const frontmatter = { id: node.id, type: node.type, name: data.name };
	if (data.isStart) frontmatter.isStart = true;
	if (data.isGlobal) frontmatter.isGlobal = true;
	if (data.globalLabel) frontmatter.globalLabel = data.globalLabel;

	// Type-specific structured surfaces are passthrough — JSON-inlined for fidelity.
	// (These are owned by set_* MCP tools / the agent, not hand-edited prose.)
	const passthroughByType = {
		Webhook: ["url", "method", "body", "headers", "auth", "timeoutValue", "max_retries", "responseData", "responsePathways"],
		"Knowledge Base": ["kb"],
		"Vector DB Knowledge Base": ["kb"],
		"Transfer Call": ["transferNumber", "warmTransferFields", "twilioAppTransferFields"],
		SMS: ["phoneNumber", "smsBody"],
		"Custom Tool": ["tool", "speech", "responsePathways"],
		"Custom Code": ["code", "snippetId", "snippetVersion", "snippetVariables"],
		"Transfer Pathway": ["transferPathway", "version", "transferType", "transferPathwayNode"],
		"Press Button": ["mode", "digit", "sequence", "digitPrompt"],
		Route: ["routes", "fallbackNodeId"],
		"Schedule Meeting": ["calendarId"],
		Scheduling: ["calendarId"],
	};
	const fields = passthroughByType[node.type] || [];
	for (const key of fields) {
		if (data[key] !== undefined && data[key] !== null) {
			frontmatter[key] = data[key];
		}
	}
	if (Array.isArray(data.dialogueExamples) && data.dialogueExamples.length > 0) {
		frontmatter.dialogueExamples = data.dialogueExamples;
	}

	const body = data.prompt != null ? data.prompt : data.text != null ? data.text : "";
	return frontmatterBlock(frontmatter, body);
}

function generateConditionMd(condition, conditionExamples) {
	const frontmatter = {};
	if (Array.isArray(conditionExamples) && conditionExamples.length > 0) {
		frontmatter.conditionExamples = conditionExamples;
	}
	return frontmatterBlock(frontmatter, condition);
}

function generateVariablesYaml(extractVars) {
	const variables = extractVars.map((v) => {
		const entry = { name: v[0], type: v[1], description: v[2] };
		if (v.length > 3) entry._extra = v.slice(3);
		return entry;
	});
	return yamlEmit({ variables });
}

function generateEdgeMd(edge, idToSlug, idToName) {
	const sourceSlug = idToSlug.get(edge.source) || edge.source;
	const targetSlug = idToSlug.get(edge.target) || edge.target;
	const frontmatter = {
		id: edge.id || `${edge.source}-to-${edge.target}`,
		source: sourceSlug,
		target: targetSlug,
		sourceName: idToName.get(edge.source) || sourceSlug,
		targetName: idToName.get(edge.target) || targetSlug,
		// Originating ids preserved so commit can reconstruct the graph exactly.
		_sourceId: edge.source,
		_targetId: edge.target,
	};
	// GET nests under edge.data; the POST-update shape (and our rebuilt graph)
	// carries label/description at the top level. Accept both.
	const data = edge.data || {};
	const description = data.description !== undefined ? data.description : edge.description;
	if (description !== undefined) frontmatter.description = description;
	const label = (data.label != null ? data.label : edge.label) || "";
	return frontmatterBlock(frontmatter, label);
}

/**
 * Materialize the canonical local file tree from server nodes/edges.
 * Returns an array of { path, content }.
 */
function generateFiles(nodes, edges) {
	const files = [];
	const idToSlug = buildSlugMap(nodes);

	const idToName = new Map();
	for (const node of nodes) {
		if (isGlobalConfigNode(node)) continue;
		if (node.data && node.data.name) idToName.set(node.id, node.data.name);
	}

	let globalPrompt = "";
	for (const node of nodes) {
		if (isGlobalConfigNode(node)) {
			const prompt = (node.globalConfig && node.globalConfig.globalPrompt) || "";
			if (prompt && !globalPrompt) globalPrompt = prompt;
		}
	}

	for (const node of nodes) {
		if (isGlobalConfigNode(node)) continue;
		const data = node.data;
		if (!data) continue;
		const slug = idToSlug.get(node.id);
		if (!slug) continue;

		files.push({ path: `nodes/${slug}/node.md`, content: generateNodeMd(node) });

		if (data.condition) {
			files.push({
				path: `nodes/${slug}/condition.md`,
				content: generateConditionMd(data.condition, data.conditionExamples),
			});
		}
		if (Array.isArray(data.extractVars) && data.extractVars.length > 0) {
			files.push({
				path: `nodes/${slug}/variables.yaml`,
				content: generateVariablesYaml(data.extractVars),
			});
		}
		if (data.modelOptions && Object.keys(data.modelOptions).length > 0) {
			files.push({ path: `nodes/${slug}/model.yaml`, content: yamlEmit(data.modelOptions) });
		}
		if (data.unitTests && Object.keys(data.unitTests).length > 0) {
			files.push({ path: `nodes/${slug}/unit-tests.yaml`, content: yamlEmit(data.unitTests) });
		}
		if (data.tag && data.tag.name) {
			files.push({ path: `nodes/${slug}/tag.yaml`, content: yamlEmit(data.tag) });
		}
		if (Array.isArray(data.tools) && data.tools.length > 0) {
			files.push({ path: `nodes/${slug}/tools.yaml`, content: yamlEmit({ tools: data.tools }) });
		}
	}

	for (const edge of edges) {
		const sourceSlug = idToSlug.get(edge.source) || edge.source;
		const targetSlug = idToSlug.get(edge.target) || edge.target;
		files.push({
			path: `edges/${sourceSlug}-to-${targetSlug}.md`,
			content: generateEdgeMd(edge, idToSlug, idToName),
		});
	}

	// Derived / layout — written for the human, ignored on commit (rebuilt server-side).
	files.push({ path: ".pathways/config.yaml", content: yamlEmit({}) });
	const positions = {};
	for (const node of nodes) {
		if (isGlobalConfigNode(node)) continue;
		if (!node.position) continue;
		const slug = idToSlug.get(node.id);
		if (slug) positions[slug] = { x: node.position.x, y: node.position.y };
	}
	files.push({ path: ".pathways/layout.yaml", content: yamlEmit({ positions }) });
	files.push({ path: ".pathways/global_prompt.md", content: globalPrompt || "" });

	return files;
}

// ============================================================================
// Reverse: local file tree -> nodes/edges JSON (for commit / test)
// ============================================================================

/**
 * Rebuild the nodes/edges arrays from the local file tree. The reverse of
 * generateFiles. Structured surfaces are read from JSON-inlined frontmatter,
 * prose from the markdown body, layout from .pathways/layout.yaml.
 */
function rebuildGraph(treeMap) {
	const nodes = [];
	const edges = [];
	const slugToId = new Map();

	// Layout positions (derived surface).
	let positions = {};
	if (treeMap[".pathways/layout.yaml"]) {
		const parsed = yamlParse(treeMap[".pathways/layout.yaml"]);
		positions = (parsed && parsed.positions) || {};
	}

	// Global prompt.
	const globalPrompt = treeMap[".pathways/global_prompt.md"];
	if (globalPrompt && globalPrompt.trim() !== "") {
		nodes.push({ globalConfig: { globalPrompt: globalPrompt.trim() } });
	}

	// Nodes.
	const nodePaths = Object.keys(treeMap)
		.filter((p) => /^nodes\/[^/]+\/node\.md$/.test(p))
		.sort();
	for (const np of nodePaths) {
		const slug = np.split("/")[1];
		const { frontmatter, body } = parseFrontmatter(treeMap[np]);
		const id = frontmatter.id;
		if (!id) continue;
		slugToId.set(slug, id);

		const data = {};
		const reserved = new Set(["id", "type", "name", "isStart", "isGlobal", "globalLabel", "dialogueExamples"]);
		data.name = frontmatter.name;
		if (frontmatter.isStart) data.isStart = true;
		if (frontmatter.isGlobal) data.isGlobal = true;
		if (frontmatter.globalLabel) data.globalLabel = frontmatter.globalLabel;
		if (frontmatter.dialogueExamples) data.dialogueExamples = frontmatter.dialogueExamples;
		for (const [k, v] of Object.entries(frontmatter)) {
			if (!reserved.has(k)) data[k] = v;
		}
		data.prompt = body;

		// condition.md
		const condPath = `nodes/${slug}/condition.md`;
		if (treeMap[condPath]) {
			const c = parseFrontmatter(treeMap[condPath]);
			data.condition = c.body;
			if (c.frontmatter.conditionExamples) data.conditionExamples = c.frontmatter.conditionExamples;
		}
		// variables.yaml
		const varsPath = `nodes/${slug}/variables.yaml`;
		if (treeMap[varsPath]) {
			const parsed = yamlParse(treeMap[varsPath]);
			const vars = (parsed && parsed.variables) || [];
			data.extractVars = vars.map((v) => {
				const base = [v.name, v.type, v.description];
				return Array.isArray(v._extra) ? base.concat(v._extra) : base;
			});
		}
		// model.yaml
		const modelPath = `nodes/${slug}/model.yaml`;
		if (treeMap[modelPath]) data.modelOptions = yamlParse(treeMap[modelPath]);
		// unit-tests.yaml
		const utPath = `nodes/${slug}/unit-tests.yaml`;
		if (treeMap[utPath]) data.unitTests = yamlParse(treeMap[utPath]);
		// tag.yaml
		const tagPath = `nodes/${slug}/tag.yaml`;
		if (treeMap[tagPath]) data.tag = yamlParse(treeMap[tagPath]);
		// tools.yaml
		const toolsPath = `nodes/${slug}/tools.yaml`;
		if (treeMap[toolsPath]) {
			const parsed = yamlParse(treeMap[toolsPath]);
			data.tools = (parsed && parsed.tools) || [];
		}

		const node = { id, type: frontmatter.type, data };
		if (positions[slug]) node.position = positions[slug];
		nodes.push(node);
	}

	// Edges.
	const edgePaths = Object.keys(treeMap)
		.filter((p) => /^edges\/.+\.md$/.test(p))
		.sort();
	for (const ep of edgePaths) {
		const { frontmatter, body } = parseFrontmatter(treeMap[ep]);
		// Prefer the preserved originating ids; fall back to slug resolution.
		const source = frontmatter._sourceId || slugToId.get(frontmatter.source) || frontmatter.source;
		const target = frontmatter._targetId || slugToId.get(frontmatter.target) || frontmatter.target;
		const edge = {
			id: frontmatter.id,
			source,
			target,
			label: body || "",
		};
		if (frontmatter.description !== undefined) edge.description = frontmatter.description;
		edges.push(edge);
	}

	return { nodes, edges };
}

// ============================================================================
// Transport adapters
// ============================================================================

let lastRequestAt = 0;
async function throttle() {
	const now = Date.now();
	const wait = lastRequestAt + MIN_REQUEST_SPACING_MS - now;
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	lastRequestAt = Date.now();
}

/** REST adapter — hits /v1/pathway/* with Bearer auth. */
function createRestAdapter() {
	if (!API_KEY) {
		throw new NormError(
			"NO_API_KEY",
			"Missing API key. Set BLAND_API_KEY or CLAUDE_PLUGIN_OPTION_bland_api_key.",
		);
	}
	const authHeader = API_KEY.toLowerCase().startsWith("bearer ") ? API_KEY : `Bearer ${API_KEY}`;

	async function request(method, route, body) {
		await throttle();
		const url = `${API_URL}${route}`;
		let resp;
		try {
			resp = await fetch(url, {
				method,
				headers: {
					accept: "application/json",
					authorization: authHeader,
					...(body !== undefined ? { "content-type": "application/json" } : {}),
				},
				body: body !== undefined ? JSON.stringify(body) : undefined,
			});
		} catch (err) {
			throw new NormError("NETWORK_ERROR", `${method} ${route} failed: ${err.message}`);
		}
		const text = await resp.text();
		let json;
		try {
			json = text ? JSON.parse(text) : null;
		} catch {
			throw new NormError(
				"BAD_RESPONSE",
				`${method} ${route} returned non-JSON (HTTP ${resp.status})`,
				{ status: resp.status, snippet: text.slice(0, 300) },
			);
		}
		if (resp.status === 429) {
			throw new NormError("RATE_LIMITED", "Server returned 429 (rate limit).", json);
		}
		if (resp.status === 400 && json && json.status === "error") {
			// Inline-validation failure (validatePathway threw server-side). Surface
			// the message distinctly so commit/validate can attribute it to a file.
			const verr = new NormError(
				"SERVER_VALIDATION",
				(json && json.message) || "Server validation failed",
				{ status: 400, response: json },
			);
			verr.serverMessage = (json && json.message) || "Server validation failed";
			throw verr;
		}
		if (!resp.ok) {
			throw new NormError("HTTP_ERROR", `${method} ${route} -> HTTP ${resp.status}`, {
				status: resp.status,
				response: json,
			});
		}
		return json;
	}

	return {
		transport: "rest",

		// GET /v1/pathway/:id -> { name, description, nodes, edges, ... }
		async getPathway(id) {
			return request("GET", `/v1/pathway/${encodeURIComponent(id)}`);
		},

		// GET /v1/pathway -> [{ id, name, description, production_version_number, ... }]
		async listPathways() {
			return request("GET", "/v1/pathway");
		},

		// POST /v1/pathway/create -> { data: { pathway_id }, errors }
		async createPathway({ name, description }) {
			const res = await request("POST", "/v1/pathway/create", {
				name,
				description: description || "",
				nodes: [],
				edges: [],
			});
			const pid = res && res.data && res.data.pathway_id;
			if (!pid) throw new NormError("CREATE_FAILED", "create did not return a pathway_id", res);
			return pid;
		},

		// POST /v1/pathway/:id -> { status, message, pathway_data, warnings? }
		// Server validates inline (validatePathway throws -> 400) and upserts in ONE call.
		async updatePathway(id, { name, description, nodes, edges }) {
			const payload = {};
			if (name !== undefined) payload.name = name;
			if (description !== undefined) payload.description = description;
			if (nodes !== undefined) payload.nodes = nodes;
			if (edges !== undefined) payload.edges = edges;
			return request("POST", `/v1/pathway/${encodeURIComponent(id)}`, payload);
		},

		// POST /v1/pathway/:id/publish -> { message, data }
		async publish(id, { versionId, environment } = {}) {
			return request("POST", `/v1/pathway/${encodeURIComponent(id)}/publish`, {
				version_id: versionId,
				environment: environment || "production",
			});
		},
	};
}

/**
 * MCP adapter — STUB. When the set_* shims land, this routes structured-surface
 * writes through the Bland MCP tools (set_node, set_edge, ...) over the
 * Streamable HTTP endpoint instead of the raw REST upsert. The interface matches
 * the REST adapter so the sync engine is transport-agnostic.
 */
function createMcpAdapter() {
	const notReady = (op) => {
		throw new NormError(
			"MCP_ADAPTER_STUB",
			`MCP transport not implemented yet (op: ${op}). Set manifest.transport='rest' for now; ` +
				"the MCP adapter activates once the set_* tool shims land.",
		);
	};
	return {
		transport: "mcp",
		getPathway: () => notReady("getPathway"),
		listPathways: () => notReady("listPathways"),
		createPathway: () => notReady("createPathway"),
		updatePathway: () => notReady("updatePathway"),
		publish: () => notReady("publish"),
	};
}

function getAdapter(transport) {
	const t = transport || "rest";
	if (t === "mcp") return createMcpAdapter();
	return createRestAdapter();
}

// ============================================================================
// Error mapping: server validation errors -> originating files
// ============================================================================

/**
 * The inline validator (validatePathway / sanitizeComponents) returns errors
 * keyed loosely by message. We best-effort attribute each error to a file by
 * scanning for a node id / slug / edge id mentioned in the message.
 */
function mapErrorsToFiles(serverErrors, treeMap) {
	const idToFile = {};
	for (const rel of Object.keys(treeMap)) {
		if (/^nodes\/[^/]+\/node\.md$/.test(rel)) {
			const { frontmatter } = parseFrontmatter(treeMap[rel]);
			if (frontmatter.id) idToFile[String(frontmatter.id)] = rel;
			const slug = rel.split("/")[1];
			idToFile[slug] = rel;
		} else if (/^edges\/.+\.md$/.test(rel)) {
			const { frontmatter } = parseFrontmatter(treeMap[rel]);
			if (frontmatter.id) idToFile[String(frontmatter.id)] = rel;
		}
	}
	const errArray = Array.isArray(serverErrors) ? serverErrors : [serverErrors];
	return errArray.map((e) => {
		const message = typeof e === "string" ? e : e && (e.message || e.error) ? `${e.error || ""} ${e.message || ""}`.trim() : JSON.stringify(e);
		let file = null;
		for (const [id, rel] of Object.entries(idToFile)) {
			if (id && message.includes(id)) {
				file = rel;
				break;
			}
		}
		return { message, file: file || "(unattributed — pathway-level)" };
	});
}

// ============================================================================
// Subcommands
// ============================================================================

function pullToTree(serverPathway) {
	const nodes = Array.isArray(serverPathway.nodes) ? serverPathway.nodes : [];
	const edges = Array.isArray(serverPathway.edges) ? serverPathway.edges : [];
	return generateFiles(nodes, edges);
}

function materializeAndSnapshot(adapter, id, serverPathway) {
	const files = pullToTree(serverPathway);

	// Clean + write pathway/ tree.
	if (fs.existsSync(PATHWAY_DIR)) fs.rmSync(PATHWAY_DIR, { recursive: true, force: true });
	ensureDir(PATHWAY_DIR);
	writeFileTree(PATHWAY_DIR, files);

	const treeMap = readTree(PATHWAY_DIR);
	const fileHashes = hashTree(treeMap);

	const manifest = {
		pathway_id: id,
		transport: adapter.transport,
		name: serverPathway.name || null,
		version: serverPathway.production_version_number || null,
		pulled_at: new Date().toISOString(),
		api_url: API_URL,
		files: fileHashes,
	};
	writeManifest(manifest);
	writeBaseline(treeMap);
	return { manifest, fileCount: Object.keys(fileHashes).length };
}

async function cmdClone(args) {
	const adapter = getAdapter("rest"); // clone always starts on REST.

	let id;
	const newIdx = args.indexOf("--new");
	if (newIdx !== -1) {
		const name = args[newIdx + 1];
		if (!name) throw new NormError("BAD_ARGS", "clone --new requires a name: clone --new \"My Pathway\"");
		id = await adapter.createPathway({ name });
	} else {
		id = args.find((a) => !a.startsWith("--"));
		if (!id) throw new NormError("BAD_ARGS", "clone requires a pathway id, or --new \"<name>\".");
	}

	const serverPathway = await adapter.getPathway(id);
	if (!serverPathway || serverPathway.errors) {
		throw new NormError("CLONE_FAILED", "Could not fetch pathway after clone", serverPathway);
	}
	const { manifest, fileCount } = materializeAndSnapshot(adapter, id, serverPathway);

	ok({
		command: "clone",
		pathway_id: id,
		name: manifest.name,
		version: manifest.version,
		files_written: fileCount,
		pathway_dir: PATHWAY_DIR,
		manifest_path: MANIFEST_PATH,
	});
}

/** Compute 3-way drift: baseline (last pull) vs local (working tree) vs server. */
function computeDrift(manifest, localTree, serverTree) {
	const baselineHashes = manifest.files || {};
	const localHashes = hashTree(localTree);
	const serverHashes = hashTree(serverTree);

	const allPaths = new Set([
		...Object.keys(baselineHashes),
		...Object.keys(localHashes),
		...Object.keys(serverHashes),
	]);

	const localChanged = [];
	const serverChanged = [];
	const conflicts = [];

	for (const p of allPaths) {
		const b = baselineHashes[p];
		const l = localHashes[p];
		const s = serverHashes[p];
		const localDiff = l !== b;
		const serverDiff = s !== b;
		if (localDiff && serverDiff && l !== s) {
			conflicts.push(p);
		} else if (localDiff) {
			localChanged.push(p);
		} else if (serverDiff) {
			serverChanged.push(p);
		}
	}
	return {
		localChanged: localChanged.sort(),
		serverChanged: serverChanged.sort(),
		conflicts: conflicts.sort(),
	};
}

async function cmdCommit(args) {
	const manifest = readManifest();
	const adapter = getAdapter(manifest.transport);
	const id = manifest.pathway_id;

	const localTree = readTree(PATHWAY_DIR);

	// Pull current server state to detect concurrent edits (3-way).
	const serverPathway = await adapter.getPathway(id);
	const serverTree = readTree(BASELINE_DIR); // baseline == last known server state
	// Recompute server tree fresh from the just-pulled server graph:
	const freshServerFiles = pullToTree(serverPathway);
	const freshServerTreeMap = {};
	for (const f of freshServerFiles) freshServerTreeMap[f.path] = f.content;

	const drift = computeDrift(manifest, localTree, freshServerTreeMap);

	if (drift.localChanged.length === 0 && drift.conflicts.length === 0) {
		ok({ command: "commit", status: "nothing_to_commit", drift });
		return;
	}

	const force = args.includes("--force");
	if (drift.conflicts.length > 0 && !force) {
		throw new NormError(
			"CONFLICT",
			`Server changed ${drift.conflicts.length} of the same file(s) you edited. ` +
				"Re-clone to take server, or pass --force to overwrite server with local.",
			{ conflicts: drift.conflicts, server_changed: drift.serverChanged },
		);
	}

	// Rebuild the FULL graph from the local tree and BATCH into ONE update call.
	const { nodes, edges } = rebuildGraph(localTree);

	let res;
	try {
		res = await adapter.updatePathway(id, {
			name: serverPathway.name,
			description: serverPathway.description,
			nodes,
			edges,
		});
	} catch (err) {
		if (err instanceof NormError && err.code === "SERVER_VALIDATION") {
			const mapped = mapErrorsToFiles([err.serverMessage], localTree);
			throw new NormError("VALIDATION_FAILED", "Server rejected the commit", { errors: mapped });
		}
		throw err;
	}

	if (res && res.status === "error") {
		const mapped = mapErrorsToFiles([res.message || "validation failed"], localTree);
		throw new NormError("VALIDATION_FAILED", "Server rejected the commit", { errors: mapped });
	}

	// Re-pull to refresh baseline (single extra GET).
	const refreshed = await adapter.getPathway(id);
	const { manifest: newManifest } = materializeAndSnapshot(adapter, id, refreshed);

	ok({
		command: "commit",
		pathway_id: id,
		committed_files: drift.localChanged.length + drift.conflicts.length,
		forced_conflicts: force ? drift.conflicts : [],
		warnings: (res && res.warnings) || [],
		new_version: newManifest.version,
	});
}

async function cmdValidate() {
	const manifest = readManifest();
	const adapter = getAdapter(manifest.transport);
	const id = manifest.pathway_id;
	const localTree = readTree(PATHWAY_DIR);
	const { nodes, edges } = rebuildGraph(localTree);

	// The server validates inline on update. For a non-destructive validate we
	// send the current tree; on REST the only inline-validation endpoint is the
	// update upsert, so we use it but immediately re-pull baseline to keep state
	// coherent. (A dedicated dry-run endpoint would replace this when available.)
	const serverPathway = await adapter.getPathway(id);
	let res;
	try {
		res = await adapter.updatePathway(id, {
			name: serverPathway.name,
			description: serverPathway.description,
			nodes,
			edges,
		});
	} catch (err) {
		if (err instanceof NormError && err.code === "SERVER_VALIDATION") {
			const mapped = mapErrorsToFiles([err.serverMessage], localTree);
			fail("VALIDATION_FAILED", "Pathway failed server validation", { errors: mapped });
			return;
		}
		throw err;
	}

	if (res && res.status === "error") {
		const mapped = mapErrorsToFiles([res.message || "validation failed"], localTree);
		// Refresh baseline anyway so status stays accurate.
		const refreshed = await adapter.getPathway(id);
		materializeAndSnapshot(adapter, id, refreshed);
		fail("VALIDATION_FAILED", "Pathway failed server validation", { errors: mapped });
		return;
	}

	const refreshed = await adapter.getPathway(id);
	materializeAndSnapshot(adapter, id, refreshed);
	ok({
		command: "validate",
		status: "valid",
		warnings: (res && res.warnings) || [],
		nodes: nodes.length,
		edges: edges.length,
	});
}

async function cmdTest() {
	// Offline round-trip self-check: tree -> graph -> tree, compare hashes.
	const localTree = readTree(PATHWAY_DIR);
	if (Object.keys(localTree).length === 0) {
		throw new NormError("EMPTY_TREE", `No files under ${PATHWAY_DIR}. Clone first.`);
	}
	const { nodes, edges } = rebuildGraph(localTree);
	const regenerated = generateFiles(nodes, edges);
	const regenMap = {};
	for (const f of regenerated) regenMap[f.path] = f.content;

	const mismatches = [];
	const allPaths = new Set([...Object.keys(localTree), ...Object.keys(regenMap)]);
	for (const p of allPaths) {
		// Layout/derived files are intentionally non-round-tripping; skip.
		if (p.startsWith(".pathways/")) continue;
		if (sha256(localTree[p] || "") !== sha256(regenMap[p] || "")) {
			mismatches.push(p);
		}
	}

	if (mismatches.length > 0) {
		fail("ROUNDTRIP_DRIFT", "Local tree does not round-trip cleanly", {
			mismatches,
			hint: "Structured surfaces should be edited via set_* MCP tools, not raw YAML.",
		});
		return;
	}
	ok({
		command: "test",
		status: "roundtrip_ok",
		nodes: nodes.length,
		edges: edges.length,
		files_checked: allPaths.size,
	});
}

async function cmdStatus(args) {
	const manifest = readManifest();
	const localTree = readTree(PATHWAY_DIR);
	const localHashes = hashTree(localTree);
	const baseline = manifest.files || {};

	const allPaths = new Set([...Object.keys(baseline), ...Object.keys(localHashes)]);
	const modified = [];
	const added = [];
	const deleted = [];
	for (const p of allPaths) {
		const b = baseline[p];
		const l = localHashes[p];
		if (b && !l) deleted.push(p);
		else if (!b && l) added.push(p);
		else if (b !== l) modified.push(p);
	}

	const result = {
		command: "status",
		pathway_id: manifest.pathway_id,
		transport: manifest.transport,
		clean: modified.length === 0 && added.length === 0 && deleted.length === 0,
		local: { modified: modified.sort(), added: added.sort(), deleted: deleted.sort() },
	};

	// Optional server version check (1 network call).
	if (args.includes("--server")) {
		try {
			const adapter = getAdapter(manifest.transport);
			const serverPathway = await adapter.getPathway(manifest.pathway_id);
			const serverFiles = pullToTree(serverPathway);
			const serverMap = {};
			for (const f of serverFiles) serverMap[f.path] = f.content;
			const drift = computeDrift(manifest, localTree, serverMap);
			result.server = {
				version: serverPathway.production_version_number || null,
				diverged_from_baseline: drift.serverChanged,
				conflicts: drift.conflicts,
			};
		} catch (err) {
			result.server = { error: err.code || "SERVER_CHECK_FAILED", message: err.message };
		}
	}

	ok(result);
}

function cmdTouch(args) {
	const target = args.find((a) => !a.startsWith("--"));
	if (!target) throw new NormError("BAD_ARGS", "touch requires a file path (relative to pathway/).");
	const abs = path.isAbsolute(target) ? target : path.join(PATHWAY_DIR, target);
	if (!fs.existsSync(abs)) throw new NormError("NOT_FOUND", `No such file: ${abs}`);
	// Normalize trailing newline so the hash reflects canonical form, then bump mtime.
	const content = fs.readFileSync(abs, "utf8");
	const normalized = content.replace(/\n*$/, "\n");
	fs.writeFileSync(abs, normalized, "utf8");
	const now = new Date();
	fs.utimesSync(abs, now, now);
	ok({ command: "touch", file: path.relative(PATHWAY_DIR, abs), hash: sha256(normalized) });
}

// ============================================================================
// CLI dispatch
// ============================================================================

async function main() {
	const [, , sub, ...args] = process.argv;
	try {
		switch (sub) {
			case "clone":
				await cmdClone(args);
				break;
			case "commit":
				await cmdCommit(args);
				break;
			case "validate":
				await cmdValidate(args);
				break;
			case "test":
				await cmdTest(args);
				break;
			case "status":
				await cmdStatus(args);
				break;
			case "touch":
				cmdTouch(args);
				break;
			case undefined:
			case "--help":
			case "-h":
				ok({
					command: "help",
					usage: "norm-sync <clone|commit|validate|test|status|touch> [args]",
					subcommands: {
						clone: "clone <id> | clone --new \"<name>\"  — pull pathway into pathway/ + snapshot baseline",
						commit: "commit [--force]                    — 3-way drift -> ONE update call -> re-pull baseline",
						validate: "validate                          — send tree to server inline validation, map errors->files",
						test: "test                                  — offline tree<->graph round-trip self-check",
						status: "status [--server]                   — local hash diff vs manifest (0 net) [+ server version]",
						touch: "touch <file>                         — normalize + bump a file so status notices it",
					},
					env: {
						BLAND_API_URL: API_URL,
						BLAND_API_KEY: API_KEY ? "(set)" : "(missing)",
						CLAUDE_PROJECT_DIR: PROJECT_DIR,
					},
				});
				break;
			default:
				fail("UNKNOWN_COMMAND", `Unknown subcommand: ${sub}`, {
					valid: ["clone", "commit", "validate", "test", "status", "touch"],
				});
		}
	} catch (err) {
		if (err instanceof NormError) {
			fail(err.code, err.message, err.details);
		} else {
			fail("UNEXPECTED", err && err.message ? err.message : String(err), {
				stack: err && err.stack ? err.stack.split("\n").slice(0, 4) : undefined,
			});
		}
	}
}

main();
