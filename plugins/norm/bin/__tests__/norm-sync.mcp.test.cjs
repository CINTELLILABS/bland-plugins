"use strict";

/**
 * Mocked-fetch tests for the norm-sync MCP transport adapter.
 *
 * No live server: a stub `global.fetch` records every JSON-RPC request and
 * returns scripted Streamable-HTTP MCP responses (the same envelope shape the
 * /v1/mcp pathway shims emit — `structuredContent.data` on success, `isError`
 * on failure). The tests assert the adapter issues the RIGHT MCP tool calls in
 * the RIGHT order for clone and commit, that a structured file routes to the
 * matching set_* tool, that prose routes to write_file, and that
 * `.pathways/layout.yaml` is skipped.
 *
 * Run: node --test plugins/norm/bin/__tests__/norm-sync.mcp.test.cjs
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

// Env MUST be set before requiring the module (API_URL/API_KEY are read at load).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "norm-sync-mcp-"));
process.env.BLAND_API_URL = "http://localhost:3000";
process.env.BLAND_API_KEY = "test-key-123";
process.env.CLAUDE_PROJECT_DIR = TMP;

const sync = require("../norm-sync.cjs");

// ── Mocked fetch ────────────────────────────────────────────────────────────
//
// Records every outbound request and returns a scripted response. The script is
// a function (body) -> { status, headers, jsonResult } so each test can shape
// per-tool replies. `mcp-session-id` is minted on initialize and echoed back.

const SESSION_ID = "sess-abc-123";

function makeMockFetch(handlers, recorder) {
	return async function mockFetch(url, opts) {
		const body = JSON.parse(opts.body);
		const isNotification = body.id === undefined;
		const method = body.method;
		const toolName = method === "tools/call" ? body.params.name : undefined;
		const args = method === "tools/call" ? body.params.arguments : body.params;

		recorder.push({
			method,
			tool: toolName,
			args,
			sessionHeader: opts.headers["mcp-session-id"] || null,
			isNotification,
			auth: opts.headers.authorization,
			accept: opts.headers.accept,
		});

		// initialize mints the session id (returned as a response header).
		if (method === "initialize") {
			return jsonResponse(
				{ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-03-26", capabilities: {} } },
				{ "mcp-session-id": SESSION_ID },
			);
		}
		// Notifications get a 202-style empty body.
		if (isNotification) {
			return new Response("", { status: 202, headers: { "mcp-session-id": SESSION_ID } });
		}

		const key = toolName || method;
		const handler = handlers[key];
		if (!handler) throw new Error(`mock: no handler for ${key}`);
		const result = handler(args);
		return jsonResponse({ jsonrpc: "2.0", id: body.id, result }, { "mcp-session-id": SESSION_ID });
	};
}

function jsonResponse(obj, headers) {
	return new Response(JSON.stringify(obj), {
		status: 200,
		headers: { "content-type": "application/json", ...headers },
	});
}

/** Build a success tool result envelope (mirrors envelopeToToolResult). */
function okEnvelope(data, summary) {
	return {
		content: [{ type: "text", text: summary || "ok" }],
		structuredContent: { status: "success", summary: summary || "ok", data },
		isError: false,
	};
}

/** Build an error tool result envelope (the shim's ClientSafeError path). */
function errEnvelope(message, code) {
	return {
		content: [{ type: "text", text: message }],
		structuredContent: { status: "error", summary: message, error: { message, code } },
		isError: true,
	};
}

function withMockFetch(handlers, fn) {
	const recorder = [];
	const original = global.fetch;
	global.fetch = makeMockFetch(handlers, recorder);
	return Promise.resolve(fn(recorder)).finally(() => {
		global.fetch = original;
	});
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const PATHWAY_ID = "pw-1";
const VERSION_ID = "777";
const WORKING_VERSION_ID = "778";

// A canonical-generator-shaped working tree with one of each surface class.
const COMMIT_TREE = {
	"nodes/aaaa1111/node.md":
		"---\nid: aaaa1111-0000-0000-0000-000000000000\ntype: Default\nname: Greeting\n---\n\nSay hello.\n",
	"nodes/aaaa1111/condition.md": "---\n{}\n---\n\nUser greeted back.\n",
	"nodes/aaaa1111/variables.yaml":
		"variables:\n  - name: caller_name\n    type: string\n    description: The caller's name.\n",
	"nodes/aaaa1111/model.yaml": "temperature: 0.4\nmodelType: smart\n",
	"nodes/aaaa1111/tag.yaml": "name: Intro\ncolor: \"#4CAF50\"\n",
	"nodes/aaaa1111/unit-tests.yaml":
		"isEnabled: true\nactiveTestTypes:\n  - keyword_tests\nrequiredKeywords:\n  - hello\n",
	"nodes/aaaa1111/tools.yaml":
		'tools:\n  - name: lookup\n    type: webhook\n    config: {"url":"https://example.com"}\n',
	"edges/aaaa1111-to-bbbb2222.md":
		"---\nid: e1\nsource: aaaa1111\ntarget: bbbb2222\n_sourceId: aaaa1111-0000-0000-0000-000000000000\n_targetId: bbbb2222-0000-0000-0000-000000000000\n---\n\nproceed\n",
	".pathways/global_prompt.md": "You are a helpful assistant.\n",
	".pathways/layout.yaml": "positions:\n  aaaa1111:\n    x: 0\n    y: 0\n",
	".pathways/config.yaml": "{}\n",
};

// ── Tests ───────────────────────────────────────────────────────────────────

test("classifyMcpFile routes each surface class correctly", () => {
	assert.deepEqual(sync.classifyMcpFile(".pathways/layout.yaml"), { kind: "skip" });
	assert.deepEqual(sync.classifyMcpFile(".pathways/config.yaml"), { kind: "skip" });
	assert.deepEqual(sync.classifyMcpFile("nodes/x/variables.yaml"), {
		kind: "structured",
		slug: "x",
		surface: "variables.yaml",
	});
	assert.deepEqual(sync.classifyMcpFile("nodes/x/model.yaml"), {
		kind: "structured",
		slug: "x",
		surface: "model.yaml",
	});
	assert.deepEqual(sync.classifyMcpFile("nodes/x/unit-tests.yaml"), {
		kind: "structured",
		slug: "x",
		surface: "unit-tests.yaml",
	});
	assert.deepEqual(sync.classifyMcpFile("nodes/x/tag.yaml"), {
		kind: "structured",
		slug: "x",
		surface: "tag.yaml",
	});
	assert.deepEqual(sync.classifyMcpFile("nodes/x/tools.yaml"), {
		kind: "structured",
		slug: "x",
		surface: "tools.yaml",
	});
	// Prose surfaces.
	assert.deepEqual(sync.classifyMcpFile("nodes/x/node.md"), { kind: "prose", path: "nodes/x/node.md" });
	assert.deepEqual(sync.classifyMcpFile("nodes/x/condition.md"), {
		kind: "prose",
		path: "nodes/x/condition.md",
	});
	assert.deepEqual(sync.classifyMcpFile("edges/x-to-y.md"), { kind: "prose", path: "edges/x-to-y.md" });
	assert.deepEqual(sync.classifyMcpFile(".pathways/global_prompt.md"), {
		kind: "prose",
		path: ".pathways/global_prompt.md",
	});
});

test("mapStructuredFileToSetCalls maps each structured surface to its set_* tool", () => {
	const vars = sync.mapStructuredFileToSetCalls(
		"x",
		"variables.yaml",
		"variables:\n  - name: a\n    type: string\n    description: d\n",
	);
	assert.equal(vars.length, 1);
	assert.equal(vars[0].tool, "set_variables");
	assert.deepEqual(vars[0].input, {
		node_slug: "x",
		variables: [{ name: "a", type: "string", description: "d" }],
	});

	const model = sync.mapStructuredFileToSetCalls("x", "model.yaml", "temperature: 0.5\n");
	assert.equal(model[0].tool, "set_model_config");
	assert.deepEqual(model[0].input, { node_slug: "x", model_config: { temperature: 0.5 } });

	const tag = sync.mapStructuredFileToSetCalls("x", "tag.yaml", 'name: T\ncolor: "#fff"\n');
	assert.equal(tag[0].tool, "set_model_config");
	assert.deepEqual(tag[0].input, { node_slug: "x", tag: { name: "T", color: "#fff" } });

	const ut = sync.mapStructuredFileToSetCalls(
		"x",
		"unit-tests.yaml",
		"isEnabled: true\nactiveTestTypes:\n  - keyword_tests\n",
	);
	assert.equal(ut[0].tool, "set_unit_tests");
	assert.equal(ut[0].input.node_slug, "x");
	assert.deepEqual(ut[0].input.unit_tests.activeTestTypes, ["keyword_tests"]);

	const tools = sync.mapStructuredFileToSetCalls(
		"x",
		"tools.yaml",
		'tools:\n  - name: t1\n    type: webhook\n    config: {"url":"https://e.com"}\n',
	);
	assert.equal(tools.length, 1);
	assert.equal(tools[0].tool, "set_node_tools");
	assert.equal(tools[0].input.action, "add");
	assert.equal(tools[0].input.tool.name, "t1");

	// Empty/absent surfaces produce no calls.
	assert.deepEqual(sync.mapStructuredFileToSetCalls("x", "variables.yaml", "variables: []\n"), []);
	assert.deepEqual(sync.mapStructuredFileToSetCalls("x", "model.yaml", "{}\n"), []);
});

test("cloneTree issues initialize -> begin_pathway_edit -> get_files in order", async () => {
	const handlers = {
		get_pathway: () =>
			okEnvelope({
				id: PATHWAY_ID,
				name: "My Pathway",
				description: "desc",
				productionVersion: { versionNumber: 3 },
				recommendedVersionId: VERSION_ID,
			}),
		begin_pathway_edit: () =>
			okEnvelope({
				pathway_id: PATHWAY_ID,
				pathway_version_id: VERSION_ID,
				working_pathway_version_id: WORKING_VERSION_ID,
				message: "forked",
			}),
		get_files: () =>
			okEnvelope({
				files: [
					{ path: "nodes/aaaa1111/node.md", content: "---\nid: x\n---\n\nhi\n" },
					{ path: ".pathways/layout.yaml", content: "positions: {}\n" },
				],
				count: 2,
			}),
	};

	await withMockFetch(handlers, async (recorder) => {
		const adapter = sync.createMcpAdapter();
		const cloned = await adapter.cloneTree(PATHWAY_ID);

		// Returned tree + version threading.
		assert.equal(cloned.name, "My Pathway");
		assert.equal(cloned.versionId, WORKING_VERSION_ID);
		assert.ok(cloned.treeMap["nodes/aaaa1111/node.md"]);
		assert.ok(cloned.treeMap[".pathways/layout.yaml"]);

		// Exact ordered sequence of MCP operations.
		const seq = recorder.map((r) => r.tool || r.method);
		assert.deepEqual(seq, [
			"initialize",
			"notifications/initialized",
			"get_pathway",
			"begin_pathway_edit",
			"get_files",
		]);

		// One session id, captured on initialize and reused on every later call.
		assert.equal(recorder[0].sessionHeader, null); // initialize sends none
		for (const r of recorder.slice(2)) {
			assert.equal(r.sessionHeader, SESSION_ID);
		}

		// Handshake style mirrors the proxy: Bearer auth + dual accept.
		assert.equal(recorder[0].auth, "Bearer test-key-123");
		assert.equal(recorder[0].accept, "application/json, text/event-stream");

		// begin_pathway_edit was called with the recommended version id.
		const begin = recorder.find((r) => r.tool === "begin_pathway_edit");
		assert.deepEqual(begin.args, { pathway_id: PATHWAY_ID, pathway_version_id: VERSION_ID });
	});
});

test("commitTree: begin -> write_file/set_* (routed) -> validate -> commit; layout skipped", async () => {
	const setCalls = [];
	const handlers = {
		get_pathway: () =>
			okEnvelope({
				id: PATHWAY_ID,
				name: "My Pathway",
				productionVersion: { versionNumber: 3 },
				recommendedVersionId: VERSION_ID,
			}),
		begin_pathway_edit: () =>
			okEnvelope({
				pathway_id: PATHWAY_ID,
				working_pathway_version_id: WORKING_VERSION_ID,
				message: "forked",
			}),
		write_file: (args) => okEnvelope({ path: args.path, message: "written" }),
		set_variables: (args) => {
			setCalls.push(["set_variables", args]);
			return okEnvelope({ message: "vars set" });
		},
		set_model_config: (args) => {
			setCalls.push(["set_model_config", args]);
			return okEnvelope({ message: "model set" });
		},
		set_unit_tests: (args) => {
			setCalls.push(["set_unit_tests", args]);
			return okEnvelope({ message: "ut set" });
		},
		set_node_tools: (args) => {
			setCalls.push(["set_node_tools", args]);
			return okEnvelope({ message: "tool added" });
		},
		validate_pathway: () => okEnvelope({ valid: true, errors: [], warnings: ["a warning"] }),
		commit_pathway_workspace: () =>
			okEnvelope({ pathway_id: PATHWAY_ID, pathway_version_id: WORKING_VERSION_ID, message: "committed" }),
	};

	await withMockFetch(handlers, async (recorder) => {
		const adapter = sync.createMcpAdapter();
		const res = await adapter.commitTree(PATHWAY_ID, {
			treeMap: COMMIT_TREE,
			changedPaths: Object.keys(COMMIT_TREE),
			previousVersionId: WORKING_VERSION_ID,
		});

		const seq = recorder.map((r) => r.tool || r.method);

		// First the handshake + begin, last validate then commit.
		assert.deepEqual(seq.slice(0, 3), ["initialize", "notifications/initialized", "begin_pathway_edit"]);
		assert.equal(seq[seq.length - 2], "validate_pathway");
		assert.equal(seq[seq.length - 1], "commit_pathway_workspace");

		// begin is BEFORE any write/set (rule 2).
		const beginIdx = seq.indexOf("begin_pathway_edit");
		const firstWriteIdx = seq.findIndex(
			(s, i) => i > beginIdx && (s === "write_file" || s.startsWith("set_")),
		);
		assert.ok(beginIdx < firstWriteIdx);
		// validate is AFTER all writes/sets, commit is AFTER validate (rule 5).
		const validateIdx = seq.indexOf("validate_pathway");
		const commitIdx = seq.indexOf("commit_pathway_workspace");
		assert.ok(validateIdx > firstWriteIdx);
		assert.ok(commitIdx > validateIdx);

		// layout.yaml + config.yaml are NEVER written (rule 4).
		const writePaths = recorder.filter((r) => r.tool === "write_file").map((r) => r.args.path);
		assert.ok(!writePaths.includes(".pathways/layout.yaml"));
		assert.ok(!writePaths.includes(".pathways/config.yaml"));
		// Prose files DO go via write_file.
		assert.ok(writePaths.includes("nodes/aaaa1111/node.md"));
		assert.ok(writePaths.includes("nodes/aaaa1111/condition.md"));
		assert.ok(writePaths.includes("edges/aaaa1111-to-bbbb2222.md"));
		assert.ok(writePaths.includes(".pathways/global_prompt.md"));

		// Structured files route to the correct set_* tool, NOT write_file.
		assert.ok(!writePaths.includes("nodes/aaaa1111/variables.yaml"));
		assert.ok(!writePaths.includes("nodes/aaaa1111/model.yaml"));
		assert.ok(!writePaths.includes("nodes/aaaa1111/unit-tests.yaml"));
		assert.ok(!writePaths.includes("nodes/aaaa1111/tag.yaml"));
		assert.ok(!writePaths.includes("nodes/aaaa1111/tools.yaml"));

		const calledTools = setCalls.map((c) => c[0]).sort();
		// variables -> set_variables; model + tag -> set_model_config (x2);
		// unit-tests -> set_unit_tests; tools -> set_node_tools.
		assert.deepEqual(calledTools, [
			"set_model_config",
			"set_model_config",
			"set_node_tools",
			"set_unit_tests",
			"set_variables",
		]);

		// Spot-check the set_variables payload shape.
		const sv = setCalls.find((c) => c[0] === "set_variables")[1];
		assert.equal(sv.node_slug, "aaaa1111");
		assert.deepEqual(sv.variables, [
			{ name: "caller_name", type: "string", description: "The caller's name." },
		]);

		// Warnings from validate + commit bubble up.
		assert.ok(res.warnings.includes("a warning"));
		assert.equal(res.version, WORKING_VERSION_ID);
	});
});

test("commitTree surfaces a tool error verbatim and stops (rule 6)", async () => {
	const handlers = {
		begin_pathway_edit: () =>
			okEnvelope({ pathway_id: PATHWAY_ID, working_pathway_version_id: WORKING_VERSION_ID, message: "ok" }),
		write_file: () => errEnvelope("Webhook tool requires a URL.", "handler_error"),
	};

	await withMockFetch(handlers, async (recorder) => {
		const adapter = sync.createMcpAdapter();
		await assert.rejects(
			adapter.commitTree(PATHWAY_ID, {
				treeMap: { "nodes/aaaa1111/node.md": "---\nid: x\n---\n\nhi\n" },
				changedPaths: ["nodes/aaaa1111/node.md"],
				previousVersionId: WORKING_VERSION_ID,
			}),
			(err) => {
				assert.equal(err.code, "MCP_TOOL_ERROR");
				assert.equal(err.message, "Webhook tool requires a URL."); // verbatim
				return true;
			},
		);

		// It must NOT have proceeded to validate/commit after the failed write.
		const seq = recorder.map((r) => r.tool || r.method);
		assert.ok(!seq.includes("validate_pathway"));
		assert.ok(!seq.includes("commit_pathway_workspace"));
	});
});

test("commitTree throws on validation failure BEFORE commit (rule 5, fail closed)", async () => {
	const handlers = {
		begin_pathway_edit: () =>
			okEnvelope({ pathway_id: PATHWAY_ID, working_pathway_version_id: WORKING_VERSION_ID, message: "ok" }),
		write_file: (args) => okEnvelope({ path: args.path }),
		validate_pathway: () =>
			okEnvelope({ valid: false, errors: ["Node aaaa1111 has no outgoing edge"], warnings: [] }),
	};

	await withMockFetch(handlers, async (recorder) => {
		const adapter = sync.createMcpAdapter();
		await assert.rejects(
			adapter.commitTree(PATHWAY_ID, {
				treeMap: { "nodes/aaaa1111/node.md": "---\nid: x\n---\n\nhi\n" },
				changedPaths: ["nodes/aaaa1111/node.md"],
				previousVersionId: WORKING_VERSION_ID,
			}),
			(err) => {
				assert.equal(err.code, "SERVER_VALIDATION");
				assert.match(err.message, /no outgoing edge/);
				return true;
			},
		);
		const seq = recorder.map((r) => r.tool || r.method);
		assert.ok(seq.includes("validate_pathway"));
		assert.ok(!seq.includes("commit_pathway_workspace")); // never reached
	});
});

test("commitTree rejects a deletion it cannot express over MCP", async () => {
	const handlers = {
		begin_pathway_edit: () =>
			okEnvelope({ pathway_id: PATHWAY_ID, working_pathway_version_id: WORKING_VERSION_ID, message: "ok" }),
	};
	await withMockFetch(handlers, async () => {
		const adapter = sync.createMcpAdapter();
		await assert.rejects(
			adapter.commitTree(PATHWAY_ID, {
				treeMap: {}, // file is gone
				changedPaths: ["nodes/aaaa1111/node.md"], // but marked changed (deleted)
				previousVersionId: WORKING_VERSION_ID,
			}),
			(err) => {
				assert.equal(err.code, "MCP_DELETE_UNSUPPORTED");
				return true;
			},
		);
	});
});

// ── REST adapter regression: the new capability methods must keep REST working ──

test("REST cloneTree does GET /v1/pathway/:id and generates the tree", async () => {
	const calls = [];
	const original = global.fetch;
	global.fetch = async (url, opts) => {
		calls.push({ url, method: opts.method });
		// One regular node + a global config + one edge.
		return new Response(
			JSON.stringify({
				name: "REST PW",
				description: "d",
				production_version_number: 9,
				nodes: [
					{
						id: "11111111-0000-0000-0000-000000000000",
						type: "Default",
						data: { name: "Start", isStart: true, prompt: "hi" },
						position: { x: 0, y: 0 },
					},
				],
				edges: [],
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		);
	};
	try {
		const adapter = sync.createRestAdapter();
		const cloned = await adapter.cloneTree("pw-rest");
		assert.equal(cloned.name, "REST PW");
		assert.equal(cloned.version, 9);
		assert.equal(cloned.versionId, null); // REST is version-less
		// generateFiles produced the canonical tree.
		assert.ok(cloned.treeMap["nodes/11111111/node.md"]);
		assert.ok(cloned.treeMap[".pathways/layout.yaml"]);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].method, "GET");
		assert.match(calls[0].url, /\/v1\/pathway\/pw-rest$/);
	} finally {
		global.fetch = original;
	}
});

test("REST commitTree rebuilds the graph and POSTs one upsert, then re-reads", async () => {
	const calls = [];
	const original = global.fetch;
	const serverNodes = [
		{
			id: "11111111-0000-0000-0000-000000000000",
			type: "Default",
			data: { name: "Start", isStart: true, prompt: "hi" },
		},
	];
	global.fetch = async (url, opts) => {
		calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : undefined });
		if (opts.method === "GET") {
			return new Response(
				JSON.stringify({ name: "REST PW", description: "d", production_version_number: 9, nodes: serverNodes, edges: [] }),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}
		// POST upsert.
		return new Response(JSON.stringify({ status: "success", warnings: ["w"] }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	};
	try {
		const adapter = sync.createRestAdapter();
		// Build a tree from the same server graph so rebuildGraph yields valid nodes.
		const tree = {};
		for (const f of sync.generateFiles(serverNodes, [])) tree[f.path] = f.content;
		const res = await adapter.commitTree("pw-rest", { treeMap: tree, changedPaths: Object.keys(tree) });
		assert.deepEqual(res.warnings, ["w"]);
		// GET (read for name/desc) -> POST (upsert) -> GET (re-read version).
		const seq = calls.map((c) => c.method);
		assert.deepEqual(seq, ["GET", "POST", "GET"]);
		// The POST carried rebuilt nodes/edges.
		const post = calls.find((c) => c.method === "POST");
		assert.ok(Array.isArray(post.body.nodes));
		assert.equal(post.body.nodes[0].id, "11111111-0000-0000-0000-000000000000");
	} finally {
		global.fetch = original;
	}
});

test("REST commitTree surfaces a 400 validation failure as SERVER_VALIDATION", async () => {
	const original = global.fetch;
	global.fetch = async (url, opts) => {
		if (opts.method === "GET") {
			return new Response(JSON.stringify({ name: "PW", description: "", nodes: [], edges: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}
		return new Response(JSON.stringify({ status: "error", message: "Bad node config" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		});
	};
	try {
		const adapter = sync.createRestAdapter();
		await assert.rejects(
			adapter.commitTree("pw", { treeMap: {}, changedPaths: [] }),
			(err) => {
				assert.equal(err.code, "SERVER_VALIDATION");
				assert.match(err.message, /Bad node config/);
				return true;
			},
		);
	} finally {
		global.fetch = original;
	}
});

test("getAdapter selects the right transport", () => {
	assert.equal(sync.getAdapter("rest").transport, "rest");
	assert.equal(sync.getAdapter("mcp").transport, "mcp");
	assert.equal(sync.getAdapter(undefined).transport, "rest"); // default
});

test("mcpUrlFrom appends /v1/mcp only when missing", () => {
	assert.equal(sync.mcpUrlFrom("http://localhost:3000"), "http://localhost:3000/v1/mcp");
	assert.equal(sync.mcpUrlFrom("http://localhost:3000/"), "http://localhost:3000/v1/mcp");
	assert.equal(sync.mcpUrlFrom("http://localhost:3000/v1/mcp"), "http://localhost:3000/v1/mcp");
});

test("parseMcpBody tolerates SSE framing", () => {
	const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n';
	assert.deepEqual(sync.parseMcpBody(sse, 200, "tools/call"), {
		jsonrpc: "2.0",
		id: 1,
		result: { ok: true },
	});
});
