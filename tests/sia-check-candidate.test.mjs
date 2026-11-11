import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
const checker = fileURLToPath(
	new URL(
		"../workspaces/sia/.agents/skills/test-candidate/scripts/check-candidate.cjs",
		import.meta.url,
	),
);

async function fixture(t, validator, allowed = ["/value"]) {
	const root = await mkdtemp(join(tmpdir(), "sia-check-candidate-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await Promise.all([
		writeFile(
			join(root, "baseline.json"),
			JSON.stringify({ value: "baseline" }),
		),
		writeFile(
			join(root, "candidate.json"),
			JSON.stringify({ value: "candidate" }),
		),
		writeFile(join(root, "allowed.json"), JSON.stringify(allowed)),
	]);
	const server = createServer(async (request, response) => {
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		const { snapshot } = JSON.parse(Buffer.concat(chunks));
		const valid = validator(snapshot.value);
		response.writeHead(valid === null ? 503 : 200, {
			"content-type": "application/json",
		});
		response.end(
			JSON.stringify({
				structuredContent: { status: "success", data: { valid } },
			}),
		);
	});
	server.listen(0, "127.0.0.1");
	t.after(() => new Promise((resolve) => server.close(resolve)));
	await once(server, "listening");
	return exec(
		process.execPath,
		[
			checker,
			"--baseline",
			"baseline.json",
			"--candidate",
			"candidate.json",
			"--allowed",
			"allowed.json",
			"--agent",
			"agent",
		],
		{
			cwd: root,
			env: {
				...process.env,
				BLAND_API_URL: `http://127.0.0.1:${server.address().port}`,
			},
		},
	);
}

for (const [unavailable, available] of [
	["baseline", "candidate"],
	["candidate", "baseline"],
]) {
	test(`an unavailable ${unavailable} validator makes the check incomplete`, async (t) => {
		await assert.rejects(
			fixture(t, (value) => (value === unavailable ? null : true)),
			(error) => {
				assert.equal(error.code, 2);
				const result = JSON.parse(error.stdout);
				assert.equal(result.passed, false);
				assert.equal(result[`${unavailable}_validation`].status, "unavailable");
				assert.equal(result[`${available}_validation`].status, "passed");
				return true;
			},
		);
	});
}

test("a structurally invalid baseline can be repaired by a valid candidate", async (t) => {
	const { stdout } = await fixture(t, (value) => value === "candidate");
	const result = JSON.parse(stdout);
	assert.equal(result.passed, true);
	assert.equal(result.baseline_validation.status, "failed");
	assert.equal(result.candidate_validation.status, "passed");
});

test("an allowed-scope root pointer is rejected before remote validation", async (t) => {
	await assert.rejects(
		fixture(t, () => assert.fail("unexpected remote validation"), ["/"]),
		(error) => {
			assert.equal(error.code, 2);
			assert.match(JSON.parse(error.stdout).error, /the root is not allowed/);
			return true;
		},
	);
});
