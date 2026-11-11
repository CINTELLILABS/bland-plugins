#!/usr/bin/env node
"use strict";

// Check local edit scope and use the server's existing snapshot validator.
const fs = require("node:fs");
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const escapePointer = (key) =>
	String(key).replace(/~/g, "~0").replace(/\//g, "~1");
const object = (value) => value !== null && typeof value === "object";

function changedPaths(before, after, pointer = "") {
	if (isDeepStrictEqual(before, after)) return [];
	if (
		!object(before) ||
		!object(after) ||
		Array.isArray(before) !== Array.isArray(after)
	)
		return [pointer];
	// Length-changing array edits need the array itself in the declared edit scope.
	if (Array.isArray(before) && before.length !== after.length)
		return [pointer];
	return [
		...new Set([...Object.keys(before), ...Object.keys(after)]),
	].flatMap((key) => {
		const next = `${pointer}/${escapePointer(key)}`;
		if (!Object.hasOwn(before, key) || !Object.hasOwn(after, key))
			return [next];
		return changedPaths(before[key], after[key], next);
	});
}

function loadSnapshot(filename) {
	const bytes = fs.readFileSync(filename);
	return { value: JSON.parse(bytes), sha256: hash(bytes) };
}

function loadAllowedPointers(filename) {
	const allowed = JSON.parse(fs.readFileSync(filename, "utf8"));
	if (
		!Array.isArray(allowed) ||
		allowed.length === 0 ||
		allowed.some(
			(p) =>
				typeof p !== "string" ||
				p.length < 2 ||
				!p.startsWith("/") ||
				/~(?![01])/u.test(p),
		)
	) {
		throw new Error(
			"allowed-changes.json must be a nonempty array of JSON Pointers; the root is not allowed",
		);
	}
	return allowed;
}

async function validateSnapshot(snapshot) {
	if (!process.env.BLAND_API_URL)
		return {
			status: "unavailable",
			detail: "Workspace tools are unavailable.",
		};
	try {
		const response = await fetch(
			new URL(
				"/_norm/tools/bland___validate_agent_snapshot",
				process.env.BLAND_API_URL,
			),
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ snapshot }),
				signal: AbortSignal.timeout(30_000),
			},
		);
		const result = await response.json();
		return validationResult(response, result);
	} catch {
		return {
			status: "unavailable",
			detail: "Snapshot validation is unavailable.",
		};
	}
}

function toolEnvelope(result) {
	return (
	result.structuredContent ??
		JSON.parse(
			result.content?.find((item) => item.type === "text")?.text ??
				"null",
		)
	);
}

function validationResult(response, result) {
	const envelope = toolEnvelope(result);
	if (
		!response.ok ||
		result.isError ||
		envelope?.status !== "success" ||
		typeof envelope.data?.valid !== "boolean"
	)
		return {
			status: "unavailable",
			http_status: response.status,
			detail: "Snapshot validation did not return a valid result.",
		};
	return {
		status: envelope.data.valid ? "passed" : "failed",
		errors: envelope.data.errors,
		warnings: envelope.data.warnings,
	};
}

function validationUnavailable({ baseline_validation, candidate_validation }) {
	return [baseline_validation, candidate_validation].some(
		({ status }) => status === "unavailable",
	);
}

async function checkCandidate(
	baselinePath,
	candidatePath,
	allowedPath,
	agentId,
) {
	if (fs.realpathSync(baselinePath) === fs.realpathSync(candidatePath))
		throw new Error("Baseline and candidate must be separate files");
	const baseline = loadSnapshot(baselinePath);
	const candidate = loadSnapshot(candidatePath);
	const allowed = loadAllowedPointers(allowedPath);
	const changed = changedPaths(baseline.value, candidate.value);
	const unexpected = changed.filter(
		(p) => !allowed.some((a) => p === a || p.startsWith(`${a}/`)),
	);
	const [baselineValidation, candidateValidation] = await Promise.all([
		validateSnapshot(baseline.value),
		validateSnapshot(candidate.value),
	]);
	const validation = {
		baseline_validation: baselineValidation,
		candidate_validation: candidateValidation,
	};
	return {
		passed:
			changed.length > 0 &&
			unexpected.length === 0 &&
			!validationUnavailable(validation) &&
			candidateValidation.status === "passed",
		scope: "snapshot_validation_and_edit_scope",
		agent_id: agentId,
		behavioral_tests: "not_run",
		baseline_sha256: baseline.sha256,
		candidate_sha256: candidate.sha256,
		changed_paths: changed,
		unexpected_paths: unexpected,
		no_changes: changed.length === 0,
		...validation,
	};
}

module.exports = { checkCandidate, changedPaths };
if (require.main === module) {
	(async () => {
		try {
			const args = process.argv.slice(2);
			const options = {};
			if (args.length !== 8)
				throw new Error(
					"Usage: --baseline FILE --candidate FILE --allowed FILE --agent AGENT_ID",
				);
			for (let i = 0; i < args.length; i += 2) {
				if (
					![
						"--baseline",
						"--candidate",
						"--allowed",
						"--agent",
					].includes(args[i]) ||
					Object.hasOwn(options, args[i])
				) {
					throw new Error(
						"Expected one each of --baseline, --candidate, --allowed, --agent",
					);
				}
				options[args[i]] = args[i + 1];
			}
			const result = await checkCandidate(
				options["--baseline"],
				options["--candidate"],
				options["--allowed"],
				options["--agent"],
			);
			process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
			process.exitCode = result.passed
				? 0
				: validationUnavailable(result)
					? 2
					: 1;
		} catch (error) {
			process.stdout.write(
				`${JSON.stringify({ passed: false, scope: "snapshot_validation_and_edit_scope", behavioral_tests: "not_run", error: error.message })}\n`,
			);
			process.exitCode = 2;
		}
	})();
}
