import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	mkdtemp,
	mkdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script =
	process.env.SIA_INSPECT_RUN_TEST_SCRIPT ??
	fileURLToPath(
		new URL("../workspaces/sia/scripts/inspect-run.cjs", import.meta.url),
	);
const privateText = "SYNTHETIC_PRIVATE_EVIDENCE";

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "sia-inspect-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	async function put(name, value) {
		const text = typeof value === "string" ? value : JSON.stringify(value);
		await mkdir(dirname(join(root, name)), { recursive: true });
		await writeFile(join(root, name), text);
		return {
			source: name,
			sha256: createHash("sha256").update(text).digest("hex"),
		};
	}
	const fields = [
		"call_id",
		"org_id",
		"agent_id",
		"disposition_version_id",
		"scores",
		"answers",
	];
	const values = [
		"call",
		"org",
		"agent",
		"scorer",
		"{}",
		JSON.stringify({ answers: { reason: privateText } }),
	];
	const csv = [fields, values]
		.map((row) =>
			row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
		)
		.join("\n");
	const source = await put("calls.csv", csv);
	const scorer = await put("scorer.json", {
		id: "scorer",
		definition: { values: [] },
	});
	const snapshot = await put("snapshot.json", {
		prompt: privateText,
		nodes: [{ id: "step", type: "prompt", data: { name: privateText } }],
	});
	const call = await put("working/private/mcp-connection/call.json", {
		source: "fixture",
		data: {
			id: "call",
			summary: privateText,
			transcript: [{ text: privateText }],
		},
	});
	await put("cache.json", {
		results: [
			{ call_id: "call", artifact: "call.json", sha256: call.sha256 },
		],
	});
	const manifest = {
		run_id: "cohort",
		scope: {
			org_id: "org",
			agent_id: "agent",
			baseline_version: "version",
		},
		batch: { ...source, call_ids: ["call"], call_count: 1 },
		scoring_definitions: scorer,
		agent_configuration: snapshot,
		evidence: { call_results: "cache.json" },
	};
	await put("manifest.json", manifest);
	return { root, put, manifest };
}

function run(root, ...args) {
	return spawnSync(
		process.execPath,
		[script, "--root", root, "--manifest", "manifest.json", ...args],
		{ encoding: "utf8" },
	);
}

async function artifact(root, output) {
	const receipt = JSON.parse(output);
	assert.deepEqual(Object.keys(receipt).sort(), ["bytes", "path"]);
	assert.match(
		receipt.path,
		/^working\/private\/inspection-output\/view-[a-zA-Z0-9]+\/result\.json$/,
	);
	const file = join(root, receipt.path);
	assert.equal((await stat(file)).mode & 0o777, 0o600);
	assert.equal((await stat(dirname(file))).mode & 0o777, 0o700);
	const bytes = await readFile(file);
	assert.equal(bytes.length, receipt.bytes);
	return { receipt, data: JSON.parse(bytes) };
}

test("every inspection view writes a private artifact and prints only its receipt", async (t) => {
	const { root } = await fixture(t);
	const commands = [
		["summary"],
		["list"],
		["call", "call"],
		["nodes", "--cohort", "cohort"],
		["config", "--cohort", "cohort", "--pointer", "/prompt"],
	];
	const paths = new Set();
	for (const args of commands) {
		const result = run(root, ...args);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stderr, "");
		assert.ok(!result.stdout.includes(privateText));
		const { receipt, data } = await artifact(root, result.stdout);
		paths.add(receipt.path);
		if (args[0] !== "summary")
			assert.ok(JSON.stringify(data).includes(privateText));
		else assert.equal(data.calls, 1);
	}
	assert.equal(paths.size, commands.length);
});

test("reader failures retain original error details privately without leaking them to stderr", async (t) => {
	const { root, put, manifest } = await fixture(t);
	manifest.agent_configuration = await put(
		"snapshot.json",
		`${privateText} invalid JSON`,
	);
	await put("manifest.json", manifest);
	const result = run(
		root,
		"config",
		"--cohort",
		"cohort",
		"--pointer",
		"/prompt",
	);
	assert.equal(result.status, 1);
	assert.equal(result.stdout, "");
	assert.ok(!result.stderr.includes(privateText));
	const error = JSON.parse(result.stderr);
	assert.equal(error.error, "Run inspection failed");
	const { data } = await artifact(
		root,
		JSON.stringify({ path: error.path, bytes: error.bytes }),
	);
	assert.equal(typeof data.error, "string");
	assert.match(data.stack, /SyntaxError/);
});

test("a symlinked output directory fails closed without exposing the requested view", async (t) => {
	const { root } = await fixture(t);
	const { symlink } = await import("node:fs/promises");
	const outside = await mkdtemp(join(tmpdir(), "sia-inspect-outside-"));
	t.after(() => rm(outside, { recursive: true, force: true }));
	await symlink(outside, join(root, "working/private/inspection-output"));
	const result = run(root, "call", "call");
	assert.equal(result.status, 1);
	assert.equal(result.stdout, "");
	assert.ok(!result.stderr.includes(privateText));
	const { readdir } = await import("node:fs/promises");
	assert.deepEqual(await readdir(outside), []);
});

test("invalid arguments fail without echoing their contents", async (t) => {
	const { root } = await fixture(t);
	const result = run(root, `--${privateText}`);
	assert.equal(result.status, 2);
	assert.equal(result.stdout, "");
	assert.ok(!result.stderr.includes(privateText));
	assert.match(result.stderr, /Run inspection failed/);
});

test("an uncached workspace creates missing private output directories", async (t) => {
	const { root, put, manifest } = await fixture(t);
	manifest.evidence = {};
	await put("manifest.json", manifest);
	await rm(join(root, "working"), { recursive: true });
	const result = run(root, "summary");
	assert.equal(result.status, 0, result.stderr);
	const { data } = await artifact(root, result.stdout);
	assert.equal(data.uncached_calls, 1);
});
