#!/usr/bin/env node
"use strict";

/**
 * norm-sync — OFFLINE, NETWORKLESS pathway codec.
 *
 * A pure JSON <-> files transform between a Bland pathway (server JSON: nodes/edges)
 * and a canonical local file tree. This script has NO network and NO credentials:
 * all reads/writes against the Bland server go through the MCP passthrough
 * (mcp__bland__bland_api_get / mcp__bland__call_bland_api) driven from the
 * /norm:* command + agent bodies. The local files under pathway/ are the REAL
 * editing workspace — the agent clones into them, edits them natively, and the
 * codec reconstructs the {nodes, edges} JSON on commit for a single POST.
 *
 * Subcommands (all offline — no network, no credentials):
 *   generate <pathway.json> <out-dir>   JSON file ({nodes,edges}) -> pathway/ tree on disk
 *   rebuild  <dir>                       pathway/ tree -> {nodes,edges} JSON on stdout
 *   validate <dir>                       offline structural check -> report on stdout
 *
 * All output is structured JSON on stdout. Errors fail-soft:
 *   { "ok": false, "error": { "code": "...", "message": "...", "details"?: ... } }
 * Process exit code is non-zero on failure so callers can branch on $?.
 *
 * Node >= 18. Zero runtime deps — a hand-rolled minimal YAML emitter/parser keeps
 * this self-contained.
 *
 * Edge write asymmetry: GET /v1/pathway/:id nests edge label/description under
 * edge.data.{label,description}; the save POST (POST /v1/convo_pathway/update or
 * /create-version — NOT POST /v1/pathway/:id, which is the SMS router and 400s)
 * expects them TOP-LEVEL per edge. `rebuild` emits them TOP-LEVEL so the save POST
 * round-trips. `generate` accepts both shapes on input. See bin/SYNC.md.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// The REAL Bland pathway engine (server's generator + exporter), bundled into
// engine.bundle.cjs by scripts/bundle-engine.mjs. This is the SOURCE OF TRUTH
// for JSON <-> files: using it (instead of a hand-reimplementation) keeps the
// plugin's conversion byte-identical to the server, so edits always produce a
// valid graph (no codec drift — e.g. edge label/description nest under data.*,
// exactly as the server emits and accepts).
let engine = null;
let engineLoadError = null;
try {
	engine = require(path.join(__dirname, "engine.bundle.cjs"));
} catch (err) {
	engineLoadError = err && err.message ? err.message : String(err);
}
function requireEngine() {
	if (!engine) {
		throw new NormError(
			"ENGINE_MISSING",
			`Bundled pathway engine (bin/engine.bundle.cjs) failed to load: ${engineLoadError}. Re-run scripts/bundle-engine.mjs.`,
		);
	}
	return engine;
}

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
 * yamlParseScalar.
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
				// `variables:` list in variables.yaml from the GET graph). norm-sync's
				// own `yamlEmit` JSON-inlines such items (`- {...}`), so this branch
				// never fires for self-generated trees.
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
 * Join `rel` under `root`, refusing any path that escapes it. File paths
 * reconstructed from JSON are not fully trusted, so a `..` segment must never
 * write outside the intended workspace.
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
	// (These are typed config edited via the /norm:* commit flow, not hand-edited prose.)
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
		// Originating ids preserved so rebuild can reconstruct the graph exactly.
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

	// Derived / layout — written for the human, ignored on rebuild (rebuilt server-side).
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
// Reverse: local file tree -> nodes/edges JSON (for commit / validate)
// ============================================================================

/**
 * Rebuild the nodes/edges arrays from the local file tree. The reverse of
 * generateFiles. Structured surfaces are read from JSON-inlined frontmatter,
 * prose from the markdown body, layout from .pathways/layout.yaml.
 *
 * Edge label/description are emitted at the TOP LEVEL of each edge (NOT nested
 * under edge.data) because the save POST (POST /v1/convo_pathway/update or
 * /create-version) reads them there.
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
		// label/description TOP-LEVEL — the /v1/convo_pathway/update|create-version save reads them here.
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
// There is NO read-only pathway-validation endpoint on the Bland REST API. Reads
// are GET /v1/pathway/:id (lossy production mirror) + POST /v1/convo_pathway/get_one
// (canonical graph); the save POST is POST /v1/convo_pathway/update (in place) or
// /create-version (fork) — NOT POST /v1/pathway/:id, which is the SMS router and
// 400s. The save persists the graph but does NOT run a full validatePathway()
// inline, so this offline pass is the authoritative structural PRE-CHECK over the
// local file tree the same way a compile pass would, entirely on disk:
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

	// --- 4. Reachability: every node reachable from the start node. ----------
	// Build the slug-level adjacency from edges (resolving endpoints to slugs),
	// then BFS from the start. Unreachable nodes are a warning (the server's
	// inline validator is authoritative on commit; this is an early heads-up).
	if (nodePaths.length > 0 && startCount === 1) {
		const idToSlug = new Map();
		for (const [slug, id] of slugToId.entries()) idToSlug.set(id, slug);
		const resolveSlug = (slug, preservedId) => {
			if (slug != null && knownSlugs.has(String(slug))) return String(slug);
			if (preservedId != null && idToSlug.has(String(preservedId))) return idToSlug.get(String(preservedId));
			if (slug != null && idToSlug.has(String(slug))) return idToSlug.get(String(slug));
			return null;
		};
		const adj = new Map();
		for (const ep of edgePaths) {
			let fm;
			try {
				fm = parseFrontmatter(treeMap[ep]).frontmatter;
			} catch {
				continue;
			}
			const src = resolveSlug(fm.source, fm._sourceId);
			const tgt = resolveSlug(fm.target, fm._targetId);
			if (!src || !tgt) continue;
			if (!adj.has(src)) adj.set(src, []);
			adj.get(src).push(tgt);
		}
		let startSlug = null;
		for (const np of nodePaths) {
			const slug = np.split("/")[1];
			const fm = parseFrontmatter(treeMap[np]).frontmatter;
			if (fm.isStart) {
				startSlug = slug;
				break;
			}
		}
		if (startSlug) {
			const seen = new Set([startSlug]);
			const queue = [startSlug];
			while (queue.length) {
				const cur = queue.shift();
				for (const next of adj.get(cur) || []) {
					if (!seen.has(next)) {
						seen.add(next);
						queue.push(next);
					}
				}
			}
			const unreachable = [...knownSlugs].filter((s) => !seen.has(s)).sort();
			for (const s of unreachable) {
				warnings.push(`Node "${s}" is not reachable from the start node.`);
			}
		}
	}

	// --- 5. JSON round-trips: rebuild graph, regenerate prose, compare. -----
	// A non-round-tripping prose file means a hand edit corrupted a structured
	// surface (frontmatter that no longer reconstructs). Layout/derived files are
	// intentionally lossy and skipped.
	try {
		const { nodes, edges } = rebuildGraph(treeMap);
		const regen = {};
		for (const f of generateFiles(nodes, edges)) regen[f.path] = f.content;
		for (const p of Object.keys(treeMap)) {
			if (p.startsWith(".pathways/")) continue;
			if (!(p in regen)) continue; // edge filename may differ if slugs changed; node files always present
			if (sha256(treeMap[p]) !== sha256(regen[p])) {
				warnings.push(`File does not round-trip cleanly (a structured surface may have been corrupted by a raw edit): ${p}`);
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
// Kept as a pure offline helper: the /norm:review flow fetches a call via the MCP
// passthrough (mcp__bland__get_call_log / bland_api_get /v1/calls/:id) and can
// feed the payload here to materialize a readable file layout for native
// Read/Grep/Glob. No network, no credentials — pure { call } -> { files }.
//
// Layout (per call):
//   call_logs/<shortId>/_summary.md
//   call_logs/<shortId>/transcript/_overview.md
//   call_logs/<shortId>/transcript/turn_NNN.md
//   call_logs/<shortId>/variables.md            (if variables present)
//   call_logs/<shortId>/analysis.md             (if analysis present)
//   call_logs/<shortId>/errors.md               (if error_message present)
//   call_logs/<shortId>/pathway/raw_pathway_logs.json
//   call_logs/<shortId>/pathway/_decisions.md   (readable decision log)
//   call_logs/<shortId>/call_context.json
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
 * Build the local file tree for one call from its call payload (the shape
 * returned by GET /v1/calls/:id). Returns an array of { path, content } rooted at
 * call_logs/<shortId>/. Pure — no I/O, no network.
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

	// Orientation context.
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
// Subcommands (all offline)
// ============================================================================

/** Pull nodes/edges out of a server pathway payload (accepts a {data} envelope). */
function nodesEdgesFrom(parsed) {
	// The MCP passthrough hands back the raw GET body; the agent unwraps {data}.
	// Accept either the unwrapped pathway or a still-wrapped { data: pathway }.
	const pathway = parsed && parsed.data && (parsed.data.nodes || parsed.data.edges) ? parsed.data : parsed;
	const nodes = Array.isArray(pathway && pathway.nodes) ? pathway.nodes : [];
	const edges = Array.isArray(pathway && pathway.edges) ? pathway.edges : [];
	return { nodes, edges, pathway: pathway || {} };
}

/**
 * generate <pathway.json> <out-dir>
 * Read a pathway JSON file ({nodes,edges} — accepts a {data} envelope) and write
 * the canonical pathway/ tree under <out-dir>. No network.
 */
function cmdGenerate(args) {
	const jsonPath = args.find((a) => !a.startsWith("--"));
	const outDir = args.filter((a) => !a.startsWith("--"))[1];
	if (!jsonPath || !outDir) {
		throw new NormError("BAD_ARGS", "usage: generate <pathway.json> <out-dir>");
	}
	if (!fs.existsSync(jsonPath)) {
		throw new NormError("NOT_FOUND", `No such pathway JSON file: ${jsonPath}`);
	}
	let parsed;
	try {
		parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
	} catch (err) {
		throw new NormError("BAD_JSON", `Could not parse ${jsonPath}: ${err.message}`);
	}
	const { nodes, edges, pathway } = nodesEdgesFrom(parsed);
	const files = requireEngine().generateFiles(nodes, edges);

	// Clean + write the pathway/ tree.
	if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
	ensureDir(outDir);
	writeFileTree(outDir, files);

	ok({
		command: "generate",
		out_dir: outDir,
		name: pathway.name || null,
		files_written: files.length,
		nodes: nodes.filter((n) => !isGlobalConfigNode(n)).length,
		edges: edges.length,
	});
}

/**
 * rebuild <dir>
 * Read the pathway/ tree under <dir> and print the rebuilt {nodes,edges} JSON on
 * stdout. Edge label/description are emitted TOP-LEVEL per edge (POST shape). No
 * network. NOTE: prints the graph JSON directly (NOT the { ok, ... } envelope) so
 * the caller can pipe it straight into a POST body.
 */
function cmdRebuild(args) {
	const dir = args.find((a) => !a.startsWith("--"));
	if (!dir) throw new NormError("BAD_ARGS", "usage: rebuild <dir>");
	if (!fs.existsSync(dir)) throw new NormError("NOT_FOUND", `No such directory: ${dir}`);
	const treeMap = readTree(dir);
	if (Object.keys(treeMap).length === 0) {
		throw new NormError("EMPTY_TREE", `No files under ${dir}. Run 'generate' first, or point at the pathway/ tree.`);
	}
	const { nodes, edges } = requireEngine().exportToJSON(
		new Map(Object.entries(treeMap)),
	);
	// Print the graph JSON directly for piping into a /v1/convo_pathway/update|create-version body.
	process.stdout.write(`${JSON.stringify({ nodes, edges }, null, 2)}\n`);
}

/**
 * validate <dir>
 * Offline structural check over the pathway/ tree under <dir>:
 * start/end/reachability/parse + round-trip. Prints a structured report on stdout.
 * This offline pass is the authoritative structural pre-check; the commit POST
 * (/v1/convo_pathway/update|create-version) may still return an error envelope.
 */
function cmdValidate(args) {
	const dir = args.find((a) => !a.startsWith("--"));
	if (!dir) throw new NormError("BAD_ARGS", "usage: validate <dir>");
	if (!fs.existsSync(dir)) throw new NormError("NOT_FOUND", `No such directory: ${dir}`);
	const treeMap = readTree(dir);
	const res = structurallyValidateTree(treeMap);
	const { nodes, edges } = requireEngine().exportToJSON(
		new Map(Object.entries(treeMap)),
	);

	if (!res.valid) {
		fail("VALIDATION_FAILED", "Pathway failed offline structural validation", {
			errors: res.errors,
			warnings: res.warnings,
			note: "Authoritative offline structural pre-check. The save POST is POST /v1/convo_pathway/update (in place) or /create-version (fork), NOT POST /v1/pathway/:id (SMS router; 400s); it may still return an error envelope this pre-check cannot see.",
		});
		return;
	}

	ok({
		command: "validate",
		status: "valid",
		warnings: res.warnings || [],
		nodes: nodes.filter((n) => !isGlobalConfigNode(n)).length,
		edges: edges.length,
		note: "Offline structural pre-check only. Authoritative validation runs server-side on the commit POST (POST /v1/convo_pathway/update or /create-version).",
	});
}

// ============================================================================
// CLI dispatch
// ============================================================================

function main() {
	const [, , sub, ...args] = process.argv;
	try {
		switch (sub) {
			case "generate":
				cmdGenerate(args);
				break;
			case "rebuild":
				cmdRebuild(args);
				break;
			case "validate":
				cmdValidate(args);
				break;
			case undefined:
			case "--help":
			case "-h":
				ok({
					command: "help",
					usage: "norm-sync <generate|rebuild|validate> [args]  (offline, networkless codec)",
					subcommands: {
						generate: "generate <pathway.json> <out-dir>  — JSON ({nodes,edges}) -> pathway/ tree on disk",
						rebuild: "rebuild <dir>                      — pathway/ tree -> {nodes,edges} JSON on stdout (edges: label/description TOP-LEVEL)",
						validate: "validate <dir>                    — offline structural check (start/reachability/parse/round-trip) -> report on stdout",
					},
					note: "No network, no credentials. ALL server I/O goes through the MCP passthrough (mcp__bland__bland_api_get / call_bland_api) in the /norm:* command + agent bodies. See bin/SYNC.md.",
				});
				break;
			default:
				fail("UNKNOWN_COMMAND", `Unknown subcommand: ${sub}`, {
					valid: ["generate", "rebuild", "validate"],
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
// pure functions so a harness can drive them in-process.
if (require.main === module) {
	main();
} else {
	module.exports = {
		yamlEmit,
		yamlParse,
		parseFrontmatter,
		buildSlugMap,
		nodeShortId,
		generateFiles,
		rebuildGraph,
		structurallyValidateTree,
		generateCallFiles,
	};
}
