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
 *   validate                            NON-DESTRUCTIVE client-side structural check (no server write)
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

// Credentials resolve from env first, then the persisted Claude config
// (~/.claude/settings.json), because Claude Code injects userConfig into the MCP
// client but NOT into the env of agent/command Bash calls. See _credentials.cjs.
const { resolveCredentials } = require("./_credentials.cjs");

function readEnvUrl() {
	return resolveCredentials().apiUrl;
}

function readEnvKey() {
	return resolveCredentials().apiKey.trim();
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
			if (content === "-" || content.startsWith("- ")) {
				if (arr === null) arr = [];
				const itemText = content === "-" ? "" : content.slice(2);
				// A list item that opens an inline `key: value` (and is NOT a
				// JSON-inlined scalar) starts a MAP whose remaining keys are the
				// following lines indented past the `- ` marker. This is the shape
				// the server's `yaml` lib emits for arrays of objects (e.g. the
				// `variables:` list in variables.yaml from get_files). norm-sync's
				// own `yamlEmit` JSON-inlines such items (`- {...}`), so this branch
				// never fires for self-generated trees — REST round-trips unchanged.
				const looksLikeMapEntry =
					itemText !== "" &&
					!itemText.startsWith("{") &&
					!itemText.startsWith("[") &&
					!itemText.startsWith('"') &&
					/^[^:\s][^:]*:(\s|$)/.test(itemText);
				if (looksLikeMapEntry || itemText === "") {
					// The map's key column is the indent of the text after "- ".
					const itemIndent = indent + 2;
					const obj = {};
					if (itemText !== "") {
						const ci = itemText.indexOf(":");
						const k = itemText.slice(0, ci).trim();
						const v = itemText.slice(ci + 1).trim();
						obj[k] = v === "" ? null : yamlParseScalar(v);
					}
					i++;
					// Consume sibling keys of this list-item map (indent >= itemIndent
					// and NOT a new `- ` at the list's own indent).
					while (i < lines.length) {
						const l = lines[i];
						if (l.trim() === "" || l.trim().startsWith("#")) {
							i++;
							continue;
						}
						const lind = l.length - l.replace(/^\s+/, "").length;
						if (lind < itemIndent) break;
						const c = l.slice(lind);
						if (c.startsWith("- ") || c === "-") break; // next list item
						const cci = c.indexOf(":");
						if (cci === -1) {
							i++;
							continue;
						}
						const k2 = c.slice(0, cci).trim();
						const v2 = c.slice(cci + 1).trim();
						if (v2 === "") {
							// Nested map/array under this key.
							i++;
							const ni =
								i < lines.length && lines[i].trim() !== ""
									? lines[i].length - lines[i].replace(/^\s+/, "").length
									: itemIndent;
							obj[k2] = ni > lind ? parseBlock(ni) : null;
						} else {
							obj[k2] = yamlParseScalar(v2);
							i++;
						}
					}
					arr.push(obj);
				} else {
					arr.push(yamlParseScalar(itemText));
					i++;
				}
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

/**
 * Join `rel` under `root`, refusing any path that escapes it. Server/MCP-supplied
 * file paths are not fully trusted, so a `..` segment must never write outside the
 * intended workspace (clone tree or call mount).
 */
function safeJoinUnder(root, rel) {
	const cleaned = String(rel || "").replace(/^\/+/, "");
	const abs = path.resolve(root, cleaned);
	const base = path.resolve(root);
	if (abs !== base && !abs.startsWith(base + path.sep)) {
		throw new NormError(
			"UNSAFE_PATH",
			`Refusing to write outside the workspace: ${rel}`,
		);
	}
	return abs;
}

function writeFileTree(root, files) {
	for (const f of files) {
		const abs = safeJoinUnder(root, f.path);
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
// Client-side structural validation (NON-DESTRUCTIVE, zero network)
//
// There is NO read-only pathway-validation endpoint on the Bland REST API — the
// docs expose only the GET read (`GET /v1/pathway/:id`) and the upsert POST
// (`POST /v1/pathway/:id`), which MUTATES. So `validate` cannot lean on the
// server without writing. Instead we validate the local file tree the same way a
// compile pass would, entirely on disk:
//   - every node.md frontmatter parses and carries an id + type
//   - exactly one start node (warn, not error, if zero — a fresh shell has none)
//   - every edge endpoint (source/target slug or preserved id) resolves to a
//     known node
//   - required per-node files are well-formed (condition.md / variables.yaml /
//     model.yaml / unit-tests.yaml / tag.yaml / tools.yaml parse)
//   - the tree round-trips: rebuildGraph(tree) -> generateFiles -> same prose
//
// Returns { valid, errors:[{message,file}], warnings:[...] }. Pure + offline.
// ============================================================================

function structurallyValidateTree(treeMap) {
	const errors = [];
	const warnings = [];

	// --- 1. Frontmatter parses; collect node ids + slugs. -------------------
	const nodePaths = Object.keys(treeMap)
		.filter((p) => /^nodes\/[^/]+\/node\.md$/.test(p))
		.sort();

	const slugToId = new Map(); // slug -> node id
	const knownSlugs = new Set();
	const knownIds = new Set();
	let startCount = 0;

	for (const np of nodePaths) {
		const slug = np.split("/")[1];
		let fm;
		try {
			fm = parseFrontmatter(treeMap[np]).frontmatter;
		} catch (err) {
			errors.push({ message: `Frontmatter failed to parse: ${err.message}`, file: np });
			continue;
		}
		if (!fm.id) {
			errors.push({ message: "Node is missing a frontmatter `id`.", file: np });
		} else {
			slugToId.set(slug, String(fm.id));
			knownIds.add(String(fm.id));
		}
		if (!fm.type) {
			errors.push({ message: "Node is missing a frontmatter `type`.", file: np });
		}
		knownSlugs.add(slug);
		if (fm.isStart) startCount += 1;
	}

	if (nodePaths.length === 0) {
		warnings.push("No node.md files found — the pathway tree is empty.");
	} else if (startCount === 0) {
		// A freshly-created shell legitimately has no start node yet; warn only.
		warnings.push("No start node (no node.md has `isStart: true`).");
	} else if (startCount > 1) {
		errors.push({ message: `Found ${startCount} start nodes; exactly one is allowed.`, file: "(pathway-level)" });
	}

	// --- 2. Per-node structured files are well-formed YAML. -----------------
	const yamlNodeFiles = ["condition.md", "variables.yaml", "model.yaml", "unit-tests.yaml", "tag.yaml", "tools.yaml"];
	for (const rel of Object.keys(treeMap)) {
		const m = rel.match(/^nodes\/([^/]+)\/([^/]+)$/);
		if (!m) continue;
		const base = m[2];
		if (base === "node.md") continue;
		if (!yamlNodeFiles.includes(base)) continue;
		try {
			if (base === "condition.md") {
				parseFrontmatter(treeMap[rel]);
			} else {
				yamlParse(treeMap[rel]);
			}
		} catch (err) {
			errors.push({ message: `Malformed ${base}: ${err.message}`, file: rel });
		}
	}

	// --- 3. Every edge endpoint resolves to a known node. -------------------
	const edgePaths = Object.keys(treeMap)
		.filter((p) => /^edges\/.+\.md$/.test(p))
		.sort();
	for (const ep of edgePaths) {
		let fm;
		try {
			fm = parseFrontmatter(treeMap[ep]).frontmatter;
		} catch (err) {
			errors.push({ message: `Edge frontmatter failed to parse: ${err.message}`, file: ep });
			continue;
		}
		// An endpoint resolves if its slug is a known node slug, OR the preserved
		// originating id (_sourceId/_targetId) / raw slug value is a known node id.
		const resolves = (slug, preservedId) => {
			if (slug != null && knownSlugs.has(String(slug))) return true;
			if (preservedId != null && knownIds.has(String(preservedId))) return true;
			if (slug != null && knownIds.has(String(slug))) return true;
			return false;
		};
		if (!resolves(fm.source, fm._sourceId)) {
			errors.push({ message: `Edge source "${fm.source}" does not resolve to any node.`, file: ep });
		}
		if (!resolves(fm.target, fm._targetId)) {
			errors.push({ message: `Edge target "${fm.target}" does not resolve to any node.`, file: ep });
		}
	}

	// --- 4. JSON round-trips: rebuild graph, regenerate prose, compare. -----
	// A non-round-tripping prose file means a hand edit corrupted a structured
	// surface (frontmatter that no longer reconstructs). Layout/derived files are
	// intentionally lossy and skipped (mirrors cmdTest).
	try {
		const { nodes, edges } = rebuildGraph(treeMap);
		const regen = {};
		for (const f of generateFiles(nodes, edges)) regen[f.path] = f.content;
		for (const p of Object.keys(treeMap)) {
			if (p.startsWith(".pathways/")) continue;
			if (!(p in regen)) continue; // edge filename may differ if slugs changed; node files always present
			if (sha256(treeMap[p]) !== sha256(regen[p])) {
				warnings.push(`File does not round-trip cleanly (edit a structured surface via the set_* tools, not raw YAML): ${p}`);
			}
		}
	} catch (err) {
		errors.push({ message: `Tree could not be rebuilt into a pathway graph: ${err.message}`, file: "(pathway-level)" });
	}

	return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// Call-log materializer (client-side) — REST call detail -> local file tree
//
// The old mount-call relied on the server-side call_log workspace tools
// (lookup_call / mount_call_log_workspace / call_log_glob / call_log_read) which
// are GONE from the /v1/mcp surface (they return -32602). We rebuild the same
// file LAYOUT here from the public `GET /v1/calls/:id` payload, which already
// carries transcripts, variables, analysis, summary, pathway_logs (the decision
// logs), error_message, recording_url and call metadata.
//
// Layout mirrors callLogGenerator.ts as closely as the REST data allows:
//   call_logs/<shortId>/_summary.md
//   call_logs/<shortId>/transcript/_overview.md
//   call_logs/<shortId>/transcript/turn_NNN.md
//   call_logs/<shortId>/variables.md
//   call_logs/<shortId>/analysis.md            (if analysis present)
//   call_logs/<shortId>/errors.md              (if error_message present)
//   call_logs/<shortId>/pathway/raw_pathway_logs.json
//   call_logs/<shortId>/pathway/_decisions.md  (readable decision log)
//   call_logs/<shortId>/call_context.json
// plus a workspace-level call_logs/_overview.md, workspace_manifest.json and
// workspace_manifest.md (the same orientation files the old tools wrote).
//
// REST GAP: tool_logs, post-call webhook logs, disposition runs, contact memory,
// call notes, config snapshot and quality metrics came from SERVER-internal DB
// services (not the public call payload), so those per-call files are NOT
// materialized here. The transcript / decision logs / variables / analysis —
// the load-bearing surfaces for reviewing a call — are all present.
// ============================================================================

function clTimeOnly(dateStr) {
	try {
		return new Date(dateStr).toISOString().substring(11, 19);
	} catch {
		return String(dateStr || "");
	}
}

function clRenderSummary(call) {
	const lines = ["# Call Summary\n", "| Field | Value |", "|-------|-------|"];
	lines.push(`| **Call ID** | \`${call.call_id || call.c_id || ""}\` |`);
	lines.push(`| **Status** | ${call.status ?? call.queue_status ?? "unknown"} |`);
	lines.push(`| **Completed** | ${call.completed ? "Yes" : "No"} |`);
	lines.push(`| **Direction** | ${call.inbound ? "Inbound" : "Outbound"} |`);
	lines.push(`| **From** | ${call.from ?? "N/A"} |`);
	lines.push(`| **To** | ${call.to ?? "N/A"} |`);
	lines.push(`| **Started** | ${call.started_at ?? "N/A"} |`);
	lines.push(`| **Created** | ${call.created_at ?? "N/A"} |`);
	lines.push(`| **Ended By** | ${call.call_ended_by ?? "N/A"} |`);
	const pl = Array.isArray(call.pathway_logs) ? call.pathway_logs : [];
	lines.push(`| **Has Pathway Logs** | ${pl.length > 0 ? "Yes" : "No"} |`);
	lines.push(`| **Pathway ID** | ${call.pathway_id ? `\`${call.pathway_id}\`` : "N/A"} |`);
	lines.push(`| **Pathway Version** | ${call.pathway_version ?? "N/A"} |`);
	if (call.recording_url) lines.push(`| **Recording** | ${call.recording_url} |`);
	if (call.summary) {
		lines.push("\n## AI Summary\n");
		lines.push(String(call.summary));
	}
	if (call.error_message) {
		lines.push("\n## Error\n");
		lines.push(`> **[!!!] ${call.error_message}**`);
	}
	return lines.join("\n") + "\n";
}

function clRenderTranscript(transcripts) {
	const turns = Array.isArray(transcripts) ? transcripts : [];
	if (turns.length === 0) {
		return { overview: "# Transcript Overview\n\nNo transcript entries found.\n", files: [] };
	}
	const roles = new Set(turns.map((t) => t.user));
	const first = clTimeOnly(turns[0].created_at);
	const last = clTimeOnly(turns[turns.length - 1].created_at);
	const ov = [
		`# Transcript Overview (${turns.length} turns)\n`,
		"| Field | Value |",
		"|-------|-------|",
		`| **Turns** | ${turns.length} |`,
		`| **Participants** | ${[...roles].join(", ")} |`,
		`| **First turn** | ${first} |`,
		`| **Last turn** | ${last} |`,
		"",
		"## Turn Summary",
		"",
	];
	const files = [];
	turns.forEach((t, i) => {
		const num = String(i + 1).padStart(3, "0");
		const role = String(t.user || "").charAt(0).toUpperCase() + String(t.user || "").slice(1);
		const time = clTimeOnly(t.created_at);
		const text = String(t.text == null ? "" : t.text);
		const preview = text.substring(0, 80).replace(/\n/g, " ");
		ov.push(`- **turn_${num}.md** — ${role} (${time}): ${preview}${text.length > 80 ? "…" : ""}`);
		files.push({
			fileName: `turn_${num}.md`,
			content: [`# Turn ${num} — ${role}\n`, `**${role}** (${time}):\n`, text, ""].join("\n"),
		});
	});
	return { overview: ov.join("\n") + "\n", files };
}

function clRenderJsonBlock(title, obj) {
	return [`# ${title}\n`, "```json", JSON.stringify(obj, null, 2), "```", ""].join("\n");
}

function clRenderDecisions(pathwayLogs) {
	const logs = Array.isArray(pathwayLogs) ? pathwayLogs : [];
	const lines = [`# Pathway Decision Log (${logs.length} entries)\n`];
	if (logs.length === 0) {
		lines.push("No pathway decision logs for this call.\n");
		return lines.join("\n");
	}
	lines.push("| # | Time | Chosen Node | Role | Decision |");
	lines.push("|---|------|-------------|------|----------|");
	logs.forEach((l, i) => {
		const time = clTimeOnly(l.created_at);
		const node = l.chosen_node_id ? `\`${String(l.chosen_node_id).substring(0, 8)}\`` : "N/A";
		const role = l.role ?? "";
		let decision = "";
		if (l.decision != null) decision = typeof l.decision === "string" ? l.decision : JSON.stringify(l.decision);
		decision = String(decision).replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 80);
		lines.push(`| ${i + 1} | ${time} | ${node} | ${role} | ${decision} |`);
	});
	// Per-turn detail for any entry that carries text / decision / pathway_info.
	lines.push("\n## Turn Detail\n");
	logs.forEach((l, i) => {
		const num = String(i + 1).padStart(3, "0");
		lines.push(`### Entry ${num} — ${clTimeOnly(l.created_at)}`);
		if (l.chosen_node_id) lines.push(`- **Chosen node:** \`${l.chosen_node_id}\``);
		if (l.role) lines.push(`- **Role:** ${l.role}`);
		if (l.tag != null) lines.push(`- **Tag:** ${typeof l.tag === "string" ? l.tag : JSON.stringify(l.tag)}`);
		if (l.text != null) lines.push(`- **Text:** ${String(l.text).replace(/\n/g, " ")}`);
		if (l.decision != null) {
			lines.push("- **Decision:**");
			lines.push("```json");
			lines.push(typeof l.decision === "string" ? l.decision : JSON.stringify(l.decision, null, 2));
			lines.push("```");
		}
		if (l.pathway_info != null) {
			lines.push("- **Pathway info:**");
			lines.push("```json");
			lines.push(typeof l.pathway_info === "string" ? l.pathway_info : JSON.stringify(l.pathway_info, null, 2));
			lines.push("```");
		}
		lines.push("");
	});
	return lines.join("\n");
}

/**
 * Build the local file tree for one call from its `GET /v1/calls/:id` payload.
 * Returns an array of { path, content } rooted at call_logs/<shortId>/, mirroring
 * the old mount_call_log_workspace layout. Pure — no I/O, no network.
 */
function generateCallFiles(call) {
	const callId = String(call.call_id || call.c_id || "");
	const shortId = callId.substring(0, 8) || "unknown";
	const prefix = `call_logs/${shortId}`;
	const files = [];
	const flagged = [];

	files.push({ path: `${prefix}/_summary.md`, content: clRenderSummary(call) });
	if (call.error_message) flagged.push(`${prefix}/_summary.md`);

	const tr = clRenderTranscript(call.transcripts);
	files.push({ path: `${prefix}/transcript/_overview.md`, content: tr.overview });
	for (const f of tr.files) {
		files.push({ path: `${prefix}/transcript/${f.fileName}`, content: f.content });
	}

	if (call.variables && typeof call.variables === "object" && Object.keys(call.variables).length > 0) {
		files.push({ path: `${prefix}/variables.md`, content: clRenderJsonBlock("Extracted Variables", call.variables) });
	}
	if (call.analysis && typeof call.analysis === "object" && Object.keys(call.analysis).length > 0) {
		files.push({ path: `${prefix}/analysis.md`, content: clRenderJsonBlock("Post-Call Analysis", call.analysis) });
	}
	if (call.error_message) {
		const errPath = `${prefix}/errors.md`;
		files.push({ path: errPath, content: `# Call Errors\n\n> **[!!!] ${call.error_message}**\n` });
		flagged.push(errPath);
	}

	// Pathway decision logs — the verbatim array + a readable rendering.
	const pl = Array.isArray(call.pathway_logs) ? call.pathway_logs : [];
	files.push({ path: `${prefix}/pathway/raw_pathway_logs.json`, content: JSON.stringify(pl, null, 2) + "\n" });
	files.push({ path: `${prefix}/pathway/_decisions.md`, content: clRenderDecisions(pl) });

	// Orientation context (mirrors the old call_context.json).
	const context = {
		call_id: callId,
		pathway_id: call.pathway_id ?? null,
		pathway_version: call.pathway_version ?? null,
		status: call.status ?? call.queue_status ?? null,
		summary: call.summary ?? null,
		has_pathway_logs: pl.length > 0,
		has_transcript: Array.isArray(call.transcripts) && call.transcripts.length > 0,
	};
	files.push({ path: `${prefix}/call_context.json`, content: JSON.stringify(context, null, 2) + "\n" });

	return {
		callId,
		shortId,
		files,
		flagged,
		hasPathwayLogs: pl.length > 0,
		hasTranscript: context.has_transcript,
		summaryLine: call.summary ? String(call.summary).split("\n")[0].slice(0, 180) : "",
	};
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
			"Missing API key. Set BLAND_API_KEY / CLAUDE_PLUGIN_OPTION_bland_api_key, or configure bland_api_key in the plugin (also read from ~/.claude/settings.json).",
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

		// GET /v1/calls/:id -> full call detail (transcripts, variables, analysis,
		// summary, pathway_logs, error_message, recording_url, metadata).
		async getCall(callId) {
			return request("GET", `/v1/calls/${encodeURIComponent(callId)}`);
		},

		// GET /v1/calls?limit=N -> { calls:[{ call_id, c_id, created_at, ... }], ... }
		// (default sort: created_at descending, so the newest calls come first).
		async listRecentCallIds(n) {
			const limit = Math.max(1, Math.min(100, n || 5));
			const res = await request("GET", `/v1/calls?limit=${limit}`);
			const calls = (res && (res.calls || res.data)) || (Array.isArray(res) ? res : []);
			return calls
				.map((c) => (typeof c === "string" ? c : c.call_id || c.c_id))
				.filter(Boolean)
				.slice(0, limit);
		},

		// Pull each call's full detail via REST and materialize the same file
		// LAYOUT the old server-side call-log workspace produced (transcript /
		// decision logs / variables / analysis), entirely client-side. READ-ONLY:
		// GET only, never mutates the call.
		async mountCall(callIds) {
			const ids = (Array.isArray(callIds) ? callIds : [callIds]).filter(Boolean);
			const out = [];
			for (const id of ids) {
				const res = await this.getCall(id);
				// /v1/calls/:id returns the call object directly (no { data } wrapper).
				const call = res && (res.call || res.data || res);
				if (!call || (call.errors && !call.call_id && !call.c_id)) {
					throw new NormError("CALL_NOT_FOUND", `Could not fetch call "${id}" via GET /v1/calls/${id}.`, { call_id: id, response: res });
				}
				if (!call.call_id && !call.c_id) call.call_id = id;
				const bundle = generateCallFiles(call);
				out.push({
					call_id: bundle.callId || id,
					summary_line: bundle.summaryLine,
					files: bundle.files,
					flagged: bundle.flagged,
					has_pathway_logs: bundle.hasPathwayLogs,
					has_transcript: bundle.hasTranscript,
				});
			}
			return { calls: out };
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

		// ── Transport-agnostic capabilities (mirror the MCP adapter) ──────────
		// These two methods let the orchestration drive clone/commit without
		// branching on transport. On REST they are thin wrappers over the
		// GET/POST primitives above — behavior is byte-identical to the original
		// flow (GET -> generateFiles for clone; rebuildGraph -> POST upsert for
		// commit). The MCP adapter implements the SAME two methods over the
		// stateful /v1/mcp session, so cmdClone/cmdCommit/cmdValidate stay
		// transport-agnostic.

		/**
		 * cloneTree(id) -> { treeMap, name, version }
		 * Pull the canonical local file tree for a pathway. REST: one GET +
		 * generateFiles. (versionId is irrelevant on REST — the upsert endpoint
		 * does not take a version id.)
		 */
		async cloneTree(id) {
			const serverPathway = await this.getPathway(id);
			if (!serverPathway || serverPathway.errors) {
				throw new NormError("CLONE_FAILED", "Could not fetch pathway after clone", serverPathway);
			}
			const files = pullToTree(serverPathway);
			const treeMap = {};
			for (const f of files) treeMap[f.path] = f.content;
			return {
				treeMap,
				name: serverPathway.name || null,
				version: serverPathway.production_version_number || null,
				versionId: null,
			};
		},

		/**
		 * commitTree(id, { treeMap }) -> { warnings, version }
		 * Push the full working tree. REST: rebuild the graph from the tree and
		 * batch it into ONE inline-validated upsert, then read back the version.
		 * `changedPaths` is accepted (and ignored) for interface parity with the
		 * MCP adapter, which only writes the changed files.
		 */
		async commitTree(id, { treeMap }) {
			const serverPathway = await this.getPathway(id);
			const { nodes, edges } = rebuildGraph(treeMap);
			const res = await this.updatePathway(id, {
				name: serverPathway.name,
				description: serverPathway.description,
				nodes,
				edges,
			});
			if (res && res.status === "error") {
				const verr = new NormError(
					"SERVER_VALIDATION",
					res.message || "Server validation failed",
					{ response: res },
				);
				verr.serverMessage = res.message || "Server validation failed";
				throw verr;
			}
			const refreshed = await this.getPathway(id);
			return {
				warnings: (res && res.warnings) || [],
				version: refreshed.production_version_number || null,
				refreshed,
			};
		},

		/**
		 * validateTree(id, { treeMap }) -> { valid, warnings, errors }
		 *
		 * NON-DESTRUCTIVE. The Bland REST API has NO read-only pathway-validation
		 * endpoint (the only inline-validation surface is the upsert POST, which
		 * MUTATES — and a freshly-cloned, UNEDITED pathway would FAIL that upsert,
		 * "Error updating pathway"). So validate runs entirely client-side via
		 * structurallyValidateTree: frontmatter parses, edge endpoints resolve, the
		 * structured files are well-formed, and the tree round-trips. ZERO writes,
		 * zero network. Returns structured errors so the caller can attribute each to
		 * a file directly (no server message-scraping needed).
		 */
		async validateTree(_id, { treeMap }) {
			return structurallyValidateTree(treeMap);
		},
	};
}

// ============================================================================
// MCP adapter — Streamable HTTP transport over /v1/mcp.
//
// Routes pathway reads/edits through the Bland MCP pathway shims (the
// `list_pathways` / `get_pathway` / `validate_pathway` reads + the stateful
// `begin_pathway_edit` / `get_files` / `write_file` / `set_*` /
// `commit_pathway_workspace` edit shims, gated server-side behind
// ENABLE_NORM_PATHWAY_TOOLS) instead of the raw REST upsert.
//
// The handshake mirrors bland-mcp-proxy.cjs: `initialize` ->
// `notifications/initialized`, the server-owned `Mcp-Session-Id` captured from
// the initialize response and reused on every subsequent request, JSON-RPC
// `tools/call` with `Authorization: Bearer <key>` and
// `accept: application/json, text/event-stream`.
//
// SHIMS.md rules honored:
//  (1) ONE session per edit — the Mcp-Session-Id is captured once and threaded
//      through begin -> edits -> validate -> commit.
//  (2) begin_pathway_edit BEFORE any write.
//  (3) get_files ONCE after begin (clone the whole fileMap in one round-trip).
//  (4) STRUCTURED config (variables/model/unit-tests/tag/tools) goes through the
//      set_* tools, NOT write_file; .pathways/layout.yaml + config.yaml are
//      SKIPPED (read-only/derived, rejected by the server's preSave validator).
//  (5) validate_pathway then commit_pathway_workspace.
//  (6) tool errors are surfaced verbatim (the shim's ClientSafeError message is
//      carried through as the NormError message).
// ============================================================================

/** Result-envelope shapes returned by the pathway shims over MCP. */
// Success: result = { content:[{type:"text",text:summary}], structuredContent:{ status:"success", summary, data }, isError:false }
// Error:   result = { content:[...], structuredContent:{ status:"error", summary, error:{ message, code } }, isError:true }

function mcpUrlFrom(base) {
	const trimmed = base.replace(/\/+$/, "");
	return trimmed.endsWith("/v1/mcp") ? trimmed : `${trimmed}/v1/mcp`;
}

/**
 * The set of canonical structured surfaces (per node) that MUST be pushed via a
 * set_* tool rather than write_file. Keyed by the file basename under
 * nodes/<slug>/. `.pathways/layout.yaml` + `.pathways/config.yaml` are derived
 * and skipped entirely (handled separately in classifyMcpFile).
 */
const STRUCTURED_NODE_FILES = new Set([
	"variables.yaml",
	"model.yaml",
	"unit-tests.yaml",
	"tag.yaml",
	"tools.yaml",
]);

/** Derived/layout files the server rejects on write — never pushed. */
const SKIPPED_FILES = new Set([
	".pathways/layout.yaml",
	".pathways/config.yaml",
]);

/**
 * Classify a tree path for the MCP commit routing:
 *   { kind: "skip" }                                  — derived/layout, not pushed
 *   { kind: "structured", slug, surface }             — push via a set_* tool
 *   { kind: "prose", path }                           — push via write_file
 */
function classifyMcpFile(relPath) {
	if (SKIPPED_FILES.has(relPath)) return { kind: "skip" };
	const nodeMatch = relPath.match(/^nodes\/([^/]+)\/([^/]+)$/);
	if (nodeMatch) {
		const slug = nodeMatch[1];
		const base = nodeMatch[2];
		if (STRUCTURED_NODE_FILES.has(base)) {
			return { kind: "structured", slug, surface: base };
		}
		// node.md / condition.md are prose -> write_file.
		return { kind: "prose", path: relPath };
	}
	// edges/*.md and .pathways/global_prompt.md are prose -> write_file.
	return { kind: "prose", path: relPath };
}

/**
 * Map a single structured node file (its parsed YAML) to a { tool, input } pair
 * for the matching set_* shim. Returns null when there is nothing to push (e.g.
 * an empty config) so the caller can skip the call.
 *
 * The mappings below target the set_* shim INPUT schemas verbatim:
 *   variables.yaml  -> set_variables   { node_slug, variables:[{name,type,description}] }
 *   model.yaml      -> set_model_config{ node_slug, model_config }
 *   unit-tests.yaml -> set_unit_tests  { node_slug, unit_tests }
 *   tag.yaml        -> set_model_config{ node_slug, tag:{name,color} }
 *   tools.yaml      -> set_node_tools  { node_slug, action:"add", tool } (per entry)
 */
function mapStructuredFileToSetCalls(slug, surface, content) {
	const parsed = yamlParse(content);

	if (surface === "variables.yaml") {
		// generator: { variables: [{ name, type, description, _extra? }] }
		// set_variables wants variables:[{name,type,description}] (minItems 1).
		const raw = (parsed && parsed.variables) || [];
		const variables = raw
			.map((v) => ({
				name: v.name,
				type: v.type,
				// Schema requires a string description (may be empty).
				description: v.description == null ? "" : String(v.description),
			}))
			.filter((v) => v.name && v.type);
		if (variables.length === 0) return [];
		// NOTE: the generator preserves any extra positional extractVars fields in
		// `_extra`; the set_variables shim schema only accepts {name,type,description}
		// so `_extra` is intentionally dropped here. TODO(deploy): confirm no real
		// pathway relies on extractVars[3+] surviving an MCP commit — if it does,
		// that surface needs a richer set_variables input (raw REST keeps _extra).
		return [{ tool: "set_variables", input: { node_slug: slug, variables } }];
	}

	if (surface === "model.yaml") {
		// generator: raw modelOptions object. set_model_config merges model_config
		// into the node's existing config, so pass the whole object through.
		if (!parsed || typeof parsed !== "object" || Object.keys(parsed).length === 0) {
			return [];
		}
		return [
			{
				tool: "set_model_config",
				input: { node_slug: slug, model_config: parsed },
			},
		];
	}

	if (surface === "unit-tests.yaml") {
		// generator: raw unitTests object (UnitTestsSchema: isEnabled,
		// activeTestTypes, ...). set_unit_tests wants { node_slug, unit_tests }.
		if (!parsed || typeof parsed !== "object" || Object.keys(parsed).length === 0) {
			return [];
		}
		// TODO(deploy): the set_unit_tests shim validates against UnitTestsSchema
		// (requires activeTestTypes, a discriminated test-type config). Benchmark
		// fixtures carry a DIFFERENT, scenario-style unit-tests.yaml
		// (caller_goal/expected_path) which would be REJECTED here. The canonical
		// generator output is the UnitTestsSchema shape, so we pass `parsed`
		// straight through and let the shim's TypeBox validator be the source of
		// truth — surfacing its error verbatim (rule 6) if the shape is wrong.
		return [
			{
				tool: "set_unit_tests",
				input: { node_slug: slug, unit_tests: parsed },
			},
		];
	}

	if (surface === "tag.yaml") {
		// generator: { name, color }. set_model_config carries the tag.
		if (!parsed || !parsed.name || !parsed.color) return [];
		return [
			{
				tool: "set_model_config",
				input: {
					node_slug: slug,
					tag: { name: String(parsed.name), color: String(parsed.color) },
				},
			},
		];
	}

	if (surface === "tools.yaml") {
		// generator: { tools: [ToolEntry...] }. set_node_tools is one-tool-per-call
		// (add appends by name), so emit one "add" call per entry. We use "add"
		// (not "update") to mirror a fresh clone's empty tool list; an existing
		// same-named tool surfaces the shim's "already exists" error verbatim.
		const tools = (parsed && parsed.tools) || [];
		if (!Array.isArray(tools) || tools.length === 0) return [];
		// TODO(deploy): set_node_tools validates each `tool` against NodeToolSchema
		// (type ∈ webhook/custom_tool/code/track, per-type config rules — e.g. a
		// webhook needs config.url). The generator round-trips whatever ToolEntry
		// shape the server emitted, so canonical tools.yaml should already conform;
		// but tools authored by hand (or the scenario-style `rest_api` fixtures)
		// will be REJECTED. We pass each entry through unchanged and surface the
		// shim's per-type validation error verbatim. Live-validate the exact
		// ToolEntry round-trip at deploy.
		return tools.map((tool) => ({
			tool: "set_node_tools",
			input: { node_slug: slug, action: "add", tool },
		}));
	}

	return [];
}

/**
 * MCP adapter — drives the Bland pathway shims over Streamable HTTP /v1/mcp.
 * Satisfies the same interface as the REST adapter (getPathway / listPathways /
 * createPathway / publish) PLUS the two transport-agnostic capabilities the
 * orchestration calls (cloneTree / commitTree). Stateful tools share ONE
 * Mcp-Session-Id for the whole edit (SHIMS.md rule 1).
 */
function createMcpAdapter() {
	if (!API_KEY) {
		throw new NormError(
			"NO_API_KEY",
			"Missing API key. Set BLAND_API_KEY / CLAUDE_PLUGIN_OPTION_bland_api_key, or configure bland_api_key in the plugin (also read from ~/.claude/settings.json).",
		);
	}
	const authHeader = API_KEY.toLowerCase().startsWith("bearer ") ? API_KEY : `Bearer ${API_KEY}`;
	const mcpUrl = mcpUrlFrom(API_URL);

	let sessionId = "";
	let rpcId = 0;

	/** One JSON-RPC round-trip over the Streamable HTTP transport. */
	async function rpc(method, params) {
		await throttle();
		const headers = {
			accept: "application/json, text/event-stream",
			authorization: authHeader,
			"content-type": "application/json",
		};
		if (sessionId) headers["mcp-session-id"] = sessionId;

		const id = ++rpcId;
		const message = { jsonrpc: "2.0", id, method, params: params || {} };

		let resp;
		try {
			resp = await fetch(mcpUrl, {
				method: "POST",
				headers,
				body: JSON.stringify(message),
			});
		} catch (err) {
			throw new NormError("NETWORK_ERROR", `MCP ${method} failed: ${err.message}`);
		}

		// The server mints / rotates the session id on initialize; capture it.
		const nextSessionId = resp.headers.get("mcp-session-id");
		if (nextSessionId) sessionId = nextSessionId;

		const text = await resp.text();
		const json = parseMcpBody(text, resp.status, method);

		if (resp.status === 429) {
			throw new NormError("RATE_LIMITED", "MCP server returned 429 (rate limit).", json);
		}
		if (!resp.ok) {
			throw new NormError("HTTP_ERROR", `MCP ${method} -> HTTP ${resp.status}`, {
				status: resp.status,
				response: json,
			});
		}
		if (json && json.error) {
			// JSON-RPC transport-level error (bad method, missing session, ...).
			throw new NormError("MCP_RPC_ERROR", `MCP ${method}: ${json.error.message || JSON.stringify(json.error)}`, json.error);
		}
		return json ? json.result : null;
	}

	/** Fire-and-forget JSON-RPC notification (no id, no response expected). */
	async function notify(method, params) {
		await throttle();
		const headers = {
			accept: "application/json, text/event-stream",
			authorization: authHeader,
			"content-type": "application/json",
		};
		if (sessionId) headers["mcp-session-id"] = sessionId;
		try {
			await fetch(mcpUrl, {
				method: "POST",
				headers,
				body: JSON.stringify({ jsonrpc: "2.0", method, params: params || {} }),
			});
		} catch (err) {
			throw new NormError("NETWORK_ERROR", `MCP notify ${method} failed: ${err.message}`);
		}
	}

	/**
	 * Call a pathway shim tool and unwrap its result envelope.
	 * On an error envelope (isError / status:"error") throw a NormError carrying
	 * the shim's own client-safe message verbatim (SHIMS.md rule 6).
	 */
	async function callTool(name, args) {
		const result = await rpc("tools/call", { name, arguments: args || {} });
		const envelope = result && result.structuredContent;
		const isError = (result && result.isError) || (envelope && envelope.status === "error");
		if (isError) {
			const message =
				(envelope && envelope.error && envelope.error.message) ||
				(envelope && envelope.summary) ||
				(result && result.content && result.content[0] && result.content[0].text) ||
				`MCP tool ${name} failed`;
			throw new NormError("MCP_TOOL_ERROR", message, {
				tool: name,
				code: envelope && envelope.error && envelope.error.code,
			});
		}
		// Prefer the structured envelope data; fall back to text for text-only hosts.
		if (envelope && "data" in envelope) return envelope.data;
		if (result && result.content && result.content[0]) return result.content[0].text;
		return null;
	}

	/** initialize -> notifications/initialized, capturing the session id. */
	async function handshake() {
		if (sessionId) return; // already initialized this process.
		await rpc("initialize", {
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: "norm-sync", version: "1" },
		});
		await notify("notifications/initialized", {});
	}

	const adapter = {
		transport: "mcp",

		// ── Reads (stateless shims; no workspace needed) ─────────────────────

		// list_pathways -> { pathways:[{id,name,description,recommendedVersionId}], count }
		// Projected to the REST-style array the orchestration's listPathways callers expect.
		async listPathways() {
			await handshake();
			const data = await callTool("list_pathways", {});
			return (data && data.pathways) || [];
		},

		// get_pathway { id } -> { id, name, recommendedVersionId, productionVersion, latestVersion, ... }
		// Projected to the REST getPathway shape the orchestration reads
		// (name/description + a production_version_number). The MCP read shim does
		// NOT return nodes/edges — clone goes through cloneTree (begin + get_files),
		// so getPathway here is only used for metadata.
		async getPathway(id) {
			await handshake();
			const data = await callTool("get_pathway", { id });
			if (!data) return null;
			return {
				id: data.id,
				name: data.name,
				description: data.description,
				production_version_number:
					(data.productionVersion && data.productionVersion.versionNumber) || null,
				// Surface the recommended version id so cloneTree/commitTree can fork it.
				_recommendedVersionId: data.recommendedVersionId || null,
				_raw: data,
			};
		},

		// Mount a call's logs to local files. The server-side call-log workspace
		// tools (lookup_call / mount_call_log_workspace / call_log_glob /
		// call_log_read) are GONE from /v1/mcp, so call mounting is REST-only now —
		// delegate to the REST adapter (GET /v1/calls/:id -> client-side file tree).
		// cmdMountCall already uses the REST adapter directly; this delegation keeps
		// the MCP adapter's interface intact for any other caller.
		async mountCall(callIds) {
			return createRestAdapter().mountCall(callIds);
		},

		// Resolve the N most recent call ids for `mount-call --recent N`.
		// REST-only (list_recent_calls is gone): GET /v1/calls?limit=N, newest first.
		async listRecentCallIds(n) {
			return createRestAdapter().listRecentCallIds(n);
		},

		// No create shim exists on the MCP surface yet — generation goes through
		// begin_pathway_generation, which is out of scope for the sync adapter.
		async createPathway() {
			throw new NormError(
				"MCP_NO_CREATE",
				"Creating a new pathway over MCP is not supported by the sync adapter " +
					"(no create shim on /v1/mcp). Clone an existing pathway id, or use REST transport to create.",
			);
		},

		// No publish shim on the MCP surface; promotion is handled by commit
		// (generation auto-promotes; an edit leaves production untouched).
		async publish() {
			throw new NormError(
				"MCP_NO_PUBLISH",
				"Publishing over MCP is not supported by the sync adapter. commit_pathway_workspace " +
					"persists the working version; promote explicitly via the dashboard or REST publish.",
			);
		},

		// ── Transport-agnostic capabilities ─────────────────────────────────

		/**
		 * cloneTree(id) -> { treeMap, name, version, versionId }
		 * Open an edit workspace and dump the whole fileMap in one call
		 * (SHIMS.md rules 2 + 3): get_pathway (for the version id) ->
		 * begin_pathway_edit -> get_files.
		 */
		async cloneTree(id) {
			await handshake();
			const meta = await this.getPathway(id);
			if (!meta) {
				throw new NormError("CLONE_FAILED", `Pathway "${id}" was not found over MCP.`, { id });
			}
			const versionId = meta._recommendedVersionId;
			if (!versionId) {
				throw new NormError(
					"CLONE_FAILED",
					`Pathway "${id}" has no editable version (no recommendedVersionId).`,
					{ id },
				);
			}
			// rule 2: begin before any read of the workspace fileMap.
			const begun = await callTool("begin_pathway_edit", {
				pathway_id: id,
				pathway_version_id: String(versionId),
			});
			const workingVersionId =
				(begun && (begun.working_pathway_version_id || begun.pathway_version_id)) || String(versionId);
			// rule 3: get_files ONCE -> the WHOLE workspace fileMap.
			const filesResult = await callTool("get_files", {});
			const files = (filesResult && filesResult.files) || [];
			const treeMap = {};
			for (const f of files) treeMap[f.path] = f.content;
			return {
				treeMap,
				name: meta.name || null,
				version: meta.production_version_number || null,
				versionId: workingVersionId,
			};
		},

		/**
		 * commitTree(id, { treeMap, changedPaths, previousVersionId }) ->
		 *   { warnings, version, refreshed }
		 *
		 * Drive a full edit on ONE session: begin -> per-changed-file
		 * write_file/set_* -> validate_pathway -> commit_pathway_workspace.
		 * Only the CHANGED files are pushed (`changedPaths`); structured surfaces
		 * route to the matching set_* tool, layout/config are skipped.
		 */
		async commitTree(id, { treeMap, changedPaths, previousVersionId }) {
			await handshake();

			// rule 2: open (or re-open) the workspace before any write. Resolve the
			// version to fork: the caller-supplied previousVersionId (the working
			// version captured at clone) wins; otherwise re-resolve via get_pathway.
			let versionId = previousVersionId;
			if (!versionId) {
				const meta = await this.getPathway(id);
				versionId = meta && meta._recommendedVersionId;
			}
			if (!versionId) {
				throw new NormError("COMMIT_FAILED", `No editable version id for pathway "${id}".`, { id });
			}
			const begun = await callTool("begin_pathway_edit", {
				pathway_id: id,
				pathway_version_id: String(versionId),
			});
			const workingVersionId =
				(begun && (begun.working_pathway_version_id || begun.pathway_version_id)) || String(versionId);

			// Push every changed file. The set_* tools REPLACE the surface, so we
			// always send the file's full current content (not a diff).
			const paths = Array.isArray(changedPaths) && changedPaths.length > 0
				? changedPaths
				: Object.keys(treeMap);

			const warnings = [];
			for (const relPath of paths.slice().sort()) {
				// A deleted file (present in changedPaths but absent from treeMap)
				// can't be expressed through write_file/set_* on the workspace —
				// surface it rather than silently dropping the deletion.
				const content = treeMap[relPath];
				const cls = classifyMcpFile(relPath);
				if (cls.kind === "skip") continue; // rule 4: derived/layout not pushed.

				if (content === undefined) {
					throw new NormError(
						"MCP_DELETE_UNSUPPORTED",
						`Cannot delete "${relPath}" over MCP — the workspace edit tools only create/replace files. ` +
							"Re-clone to take the server state, or remove the node/edge in the dashboard.",
						{ path: relPath },
					);
				}

				if (cls.kind === "structured") {
					// rule 4: structured config via set_* (NOT write_file).
					const calls = mapStructuredFileToSetCalls(cls.slug, cls.surface, content);
					for (const c of calls) {
						const res = await callTool(c.tool, c.input);
						if (res && Array.isArray(res.warnings)) warnings.push(...res.warnings);
					}
				} else {
					// prose -> write_file.
					const res = await callTool("write_file", { path: relPath, content });
					if (res && Array.isArray(res.warnings)) warnings.push(...res.warnings);
				}
			}

			// rule 5: validate, THEN commit. validate_pathway is a no-save read over
			// the working version; surface its errors verbatim before committing.
			const validation = await callTool("validate_pathway", {
				pathwayVersionId: String(workingVersionId),
			});
			if (validation && validation.valid === false) {
				const errs = (validation.errors || []).join("; ") || "validation failed";
				const verr = new NormError("SERVER_VALIDATION", errs, {
					errors: validation.errors || [],
					warnings: validation.warnings || [],
				});
				verr.serverMessage = errs;
				throw verr;
			}
			if (validation && Array.isArray(validation.warnings)) {
				warnings.push(...validation.warnings);
			}

			// rule 5: commit (fails closed server-side on validation errors).
			const committed = await callTool("commit_pathway_workspace", {});
			if (committed && Array.isArray(committed.warnings)) {
				warnings.push(...committed.warnings);
			}

			return {
				warnings,
				version: (committed && committed.pathway_version_id) || workingVersionId,
				refreshed: { name: null, description: null },
				committed,
			};
		},

		/**
		 * validateTree(id, { treeMap }) -> { valid, warnings, errors }
		 *
		 * NON-DESTRUCTIVE. The MCP pathway-edit shims (begin_pathway_edit /
		 * write_file / validate_pathway / commit_pathway_workspace) are NO LONGER on
		 * the /v1/mcp surface, and there is no read-only validation tool either.
		 * Validation is therefore identical to REST: a pure, offline structural pass
		 * over the local tree. No workspace is opened, nothing is written, the
		 * session is never touched.
		 */
		async validateTree(_id, { treeMap }) {
			return structurallyValidateTree(treeMap);
		},
	};

	return adapter;
}

/**
 * Parse an MCP Streamable-HTTP response body. The transport may answer with a
 * single JSON object OR an SSE stream (`text/event-stream`) carrying one or more
 * `data:` lines; the proxy assumes JSON, but we tolerate the SSE framing too and
 * return the LAST `data:` payload (the JSON-RPC response for our request).
 */
function parseMcpBody(text, status, method) {
	if (!text) return null;
	const trimmed = text.trim();
	// Fast path: a plain JSON object/array.
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		try {
			return JSON.parse(trimmed);
		} catch {
			/* fall through to SSE parsing */
		}
	}
	// SSE framing: collect `data:` lines, return the last parseable JSON payload.
	let last = null;
	for (const line of trimmed.split("\n")) {
		const m = line.match(/^data:\s?(.*)$/);
		if (!m) continue;
		const payload = m[1].trim();
		if (!payload || payload === "[DONE]") continue;
		try {
			last = JSON.parse(payload);
		} catch {
			/* skip non-JSON data lines */
		}
	}
	if (last !== null) return last;
	throw new NormError(
		"BAD_RESPONSE",
		`MCP ${method} returned non-JSON (HTTP ${status})`,
		{ status, snippet: trimmed.slice(0, 300) },
	);
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

/**
 * Materialize a pulled file tree to disk + write the manifest/baseline snapshot.
 * Transport-agnostic: it takes a ready-made treeMap (path -> content) plus the
 * pathway metadata, so the REST path (GET -> generateFiles -> treeMap) and the
 * MCP path (begin -> get_files -> treeMap) both feed it the same way.
 *
 * `versionId` is the MCP working-version id (used to re-open the same workspace
 * on the next commit); null on REST (the upsert endpoint is version-less).
 */
function snapshotTreeToDisk(adapter, id, { treeMap, name, version, versionId }) {
	// Clean + write pathway/ tree.
	if (fs.existsSync(PATHWAY_DIR)) fs.rmSync(PATHWAY_DIR, { recursive: true, force: true });
	ensureDir(PATHWAY_DIR);
	writeFileTree(
		PATHWAY_DIR,
		Object.entries(treeMap).map(([p, content]) => ({ path: p, content })),
	);

	const onDiskTree = readTree(PATHWAY_DIR);
	const fileHashes = hashTree(onDiskTree);

	const manifest = {
		pathway_id: id,
		transport: adapter.transport,
		name: name || null,
		version: version || null,
		pulled_at: new Date().toISOString(),
		api_url: API_URL,
		files: fileHashes,
	};
	if (versionId != null) manifest.version_id = versionId;
	writeManifest(manifest);
	writeBaseline(onDiskTree);
	return { manifest, fileCount: Object.keys(fileHashes).length };
}

/**
 * Backwards-compatible wrapper: snapshot from a REST `serverPathway` (nodes/edges
 * JSON). Used by the `--server` status check, which only has a REST graph.
 */
function materializeAndSnapshot(adapter, id, serverPathway) {
	const files = pullToTree(serverPathway);
	const treeMap = {};
	for (const f of files) treeMap[f.path] = f.content;
	return snapshotTreeToDisk(adapter, id, {
		treeMap,
		name: serverPathway.name || null,
		version: serverPathway.production_version_number || null,
		versionId: null,
	});
}

async function cmdClone(args) {
	// Transport selection for the clone (persisted into the manifest, so all later
	// commands use it). Default REST; `--transport mcp` routes through /v1/mcp.
	const tIdx = args.indexOf("--transport");
	const transport = tIdx !== -1 ? (args[tIdx + 1] || "rest") : "rest";

	let id;
	const newIdx = args.indexOf("--new");
	if (newIdx !== -1) {
		// Create has no MCP shim — always create over REST, then clone via the
		// selected transport (an MCP clone of the just-created empty shell still
		// works through begin_pathway_edit + get_files).
		const name = args[newIdx + 1];
		if (!name) throw new NormError("BAD_ARGS", "clone --new requires a name: clone --new \"My Pathway\"");
		id = await createRestAdapter().createPathway({ name });
	} else {
		id = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--transport");
		if (!id) throw new NormError("BAD_ARGS", "clone requires a pathway id, or --new \"<name>\".");
	}

	const adapter = getAdapter(transport);
	// cloneTree is transport-agnostic: REST does GET -> generateFiles; MCP does
	// begin_pathway_edit -> get_files (the whole fileMap in one call).
	const cloned = await adapter.cloneTree(id);
	const { manifest, fileCount } = snapshotTreeToDisk(adapter, id, cloned);

	ok({
		command: "clone",
		pathway_id: id,
		transport: adapter.transport,
		name: manifest.name,
		version: manifest.version,
		version_id: manifest.version_id || null,
		files_written: fileCount,
		pathway_dir: PATHWAY_DIR,
		manifest_path: MANIFEST_PATH,
	});
}

/**
 * mount-call <call_id> — pull a call's full log workspace into LOCAL files under
 * calls/<call_id>/ so Claude's native Read / Grep / Glob can inspect the transcript,
 * routing/decision logs, variables, and analysis directly (no call_log_* MCP
 * wrappers needed). READ-ONLY: it issues only GET /v1/calls/:id and never mutates
 * the call. The old server-side call-log workspace tools are gone from /v1/mcp, so
 * this rebuilds the same file layout client-side over REST regardless of transport.
 */
async function cmdMountCall(args) {
	const adapter = createRestAdapter();
	let callIds;
	const recentIdx = args.indexOf("--recent");
	if (recentIdx !== -1) {
		const n = parseInt(args[recentIdx + 1], 10) || 5;
		callIds = await adapter.listRecentCallIds(n);
		if (!callIds.length) {
			throw new NormError("NO_CALLS", "No recent calls found to mount.");
		}
	} else {
		callIds = args.filter((a) => !a.startsWith("--"));
		if (!callIds.length) {
			throw new NormError(
				"BAD_ARGS",
				"mount-call requires a call id (or --recent N): mount-call <call_id> [<call_id> ...]",
			);
		}
	}

	const { calls } = await adapter.mountCall(callIds);
	const callsRoot = path.join(PROJECT_DIR, "calls");
	const mounted = [];
	for (const c of calls) {
		const root = path.join(callsRoot, c.call_id);
		// Clean re-pull each time so the local snapshot matches the server exactly.
		try {
			fs.rmSync(root, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
		let written = 0;
		const flagged = [];
		for (const f of c.files) {
			// Faithful, path-safe mirror under calls/<id>/ so native Glob/Grep/Read
			// see the same tree the server exposed.
			const abs = safeJoinUnder(root, f.path);
			ensureDir(path.dirname(abs));
			fs.writeFileSync(abs, f.content, "utf8");
			written += 1;
			const rel = path.relative(root, abs).split(path.sep).join("/");
			// Files with an error annotation [!!!] are the ones to read first.
			if ((Array.isArray(c.flagged) && c.flagged.includes(f.path)) || /\[!!!\]/.test(f.content.slice(0, 400))) {
				flagged.push(rel);
			}
		}
		mounted.push({
			call_id: c.call_id,
			dir: root,
			files_written: written,
			flagged_files: flagged,
			summary: c.summary_line || "",
		});
	}

	// Top-level index so Claude can orient across one OR many mounted calls.
	writeCallsIndex(callsRoot, mounted);

	ok({
		command: "mount-call",
		calls_dir: callsRoot,
		index: path.join(callsRoot, "_index.md"),
		total_calls: mounted.length,
		total_files: mounted.reduce((a, m) => a + m.files_written, 0),
		mounted: mounted.map((m) => ({
			call_id: m.call_id,
			dir: m.dir,
			files_written: m.files_written,
			flagged_files: m.flagged_files,
			summary: m.summary,
		})),
		hint: `Inspect with native Read / Grep / Glob over ${path.relative(PROJECT_DIR, callsRoot)}/. Start with _index.md, then each call's call_logs/<shortId>/_summary.md and transcript/_overview.md; read any [!!!]-flagged files first. Pathway routing is under call_logs/<shortId>/pathway/_decisions.md (+ raw_pathway_logs.json).`,
	});
}

/** Write a top-level index of all mounted calls for fast orientation. */
function writeCallsIndex(callsRoot, mounted) {
	const lines = [
		"# Mounted Call Logs",
		"",
		`${mounted.length} call(s) mounted as local files for native Read / Grep / Glob inspection.`,
		"Read any [!!!]-flagged files first. Each call lives under `calls/<id>/`.",
		"",
		"| Call ID | Files | Flagged | Summary |",
		"| ------- | ----- | ------- | ------- |",
	];
	for (const m of mounted) {
		const sum = String(m.summary || "")
			.replace(/\|/g, "\\|")
			.slice(0, 120);
		lines.push(
			`| \`${m.call_id}\` | ${m.files_written} | ${m.flagged_files.length} | ${sum} |`,
		);
	}
	lines.push("");
	for (const m of mounted) {
		const shortId = String(m.call_id).substring(0, 8);
		lines.push(`## ${m.call_id}`);
		lines.push(`- Dir: \`calls/${m.call_id}/\``);
		lines.push(
			`- Start: \`call_logs/${shortId}/_summary.md\` and \`call_logs/${shortId}/transcript/_overview.md\``,
		);
		lines.push(
			`- Routing: \`call_logs/${shortId}/pathway/_decisions.md\` (raw: \`pathway/raw_pathway_logs.json\`)`,
		);
		if (m.flagged_files.length) {
			lines.push(
				`- ⚠️ Read first: ${m.flagged_files.map((f) => `\`${f}\``).join(", ")}`,
			);
		}
		if (m.summary) lines.push(`- Summary: ${m.summary}`);
		lines.push("");
	}
	ensureDir(callsRoot);
	fs.writeFileSync(
		path.join(callsRoot, "_index.md"),
		`${lines.join("\n")}\n`,
		"utf8",
	);
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

	// Pull current server state to detect concurrent edits (3-way). cloneTree is
	// transport-agnostic: REST GET -> generateFiles; MCP begin -> get_files.
	const fresh = await adapter.cloneTree(id);
	const freshServerTreeMap = fresh.treeMap;

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

	// The set of files to push: everything that changed locally (+ any forced
	// conflicts). On REST commitTree ignores this and batches the whole rebuilt
	// graph; on MCP it pushes ONLY these files via write_file/set_* (rule 4),
	// skipping derived layout/config.
	const changedPaths = drift.localChanged.concat(force ? drift.conflicts : []);

	let result;
	try {
		result = await adapter.commitTree(id, {
			treeMap: localTree,
			changedPaths,
			previousVersionId: manifest.version_id || null,
		});
	} catch (err) {
		if (err instanceof NormError && err.code === "SERVER_VALIDATION") {
			const mapped = mapErrorsToFiles([err.serverMessage], localTree);
			throw new NormError("VALIDATION_FAILED", "Server rejected the commit", { errors: mapped });
		}
		throw err;
	}

	// Re-pull to refresh baseline (transport-agnostic).
	const refreshed = await adapter.cloneTree(id);
	const { manifest: newManifest } = snapshotTreeToDisk(adapter, id, refreshed);

	ok({
		command: "commit",
		pathway_id: id,
		transport: adapter.transport,
		committed_files: drift.localChanged.length + (force ? drift.conflicts.length : 0),
		forced_conflicts: force ? drift.conflicts : [],
		warnings: (result && result.warnings) || [],
		new_version: newManifest.version,
		new_version_id: newManifest.version_id || null,
	});
}

async function cmdValidate() {
	const manifest = readManifest();
	const id = manifest.pathway_id;
	const localTree = readTree(PATHWAY_DIR);
	const { nodes, edges } = rebuildGraph(localTree);

	// NON-DESTRUCTIVE: validation is a pure, offline structural pass over the local
	// tree — frontmatter parses, edge endpoints resolve, structured files are
	// well-formed, the tree round-trips. There is NO read-only validation endpoint
	// on either transport, so we never touch the server (a clean clone validates
	// without any write). This is identical for REST and MCP, so we call the
	// validator directly rather than routing through an adapter that could mutate.
	const res = structurallyValidateTree(localTree);

	if (!res.valid) {
		// errors already carry { message, file } — surface them as-is.
		fail("VALIDATION_FAILED", "Pathway failed structural validation", {
			errors: res.errors,
			warnings: res.warnings,
		});
		return;
	}

	ok({
		command: "validate",
		status: "valid",
		warnings: res.warnings || [],
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

	// Optional server version check. cloneTree is transport-agnostic (REST: GET ->
	// generateFiles; MCP: begin -> get_files) and returns the current server tree.
	if (args.includes("--server")) {
		try {
			const adapter = getAdapter(manifest.transport);
			const fresh = await adapter.cloneTree(manifest.pathway_id);
			const drift = computeDrift(manifest, localTree, fresh.treeMap);
			result.server = {
				version: fresh.version || null,
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
			case "mount-call":
			case "review":
				await cmdMountCall(args);
				break;
			case "touch":
				cmdTouch(args);
				break;
			case undefined:
			case "--help":
			case "-h":
				ok({
					command: "help",
					usage: "norm-sync <clone|commit|validate|test|status|mount-call|touch> [args]",
					subcommands: {
						clone: "clone <id> | clone --new \"<name>\"  — pull pathway into pathway/ + snapshot baseline",
						commit: "commit [--force]                    — 3-way drift -> ONE update call -> re-pull baseline",
						validate: "validate                          — non-destructive client-side structural check (no server write)",
						test: "test                                  — offline tree<->graph round-trip self-check",
						status: "status [--server]                   — local hash diff vs manifest (0 net) [+ server version]",
						"mount-call": "mount-call <call_id>           — pull a call's logs into calls/<id>/ for native Read/Grep/Glob inspection",
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
					valid: ["clone", "commit", "validate", "test", "status", "mount-call", "touch"],
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

// Run the CLI only when invoked directly; when `require`d (tests) export the
// adapters + pure mappers so a mocked-fetch harness can drive them in-process.
if (require.main === module) {
	main();
} else {
	module.exports = {
		createMcpAdapter,
		createRestAdapter,
		getAdapter,
		classifyMcpFile,
		mapStructuredFileToSetCalls,
		mcpUrlFrom,
		parseMcpBody,
		yamlParse,
		generateFiles,
		rebuildGraph,
		structurallyValidateTree,
		generateCallFiles,
	};
}
