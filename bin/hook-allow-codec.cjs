#!/usr/bin/env node
"use strict";

/**
 * Bland — PreToolUse hook: pre-approve the plugin's OWN offline scripts.
 *
 * The workspace commands pre-authorize `node .../bin/norm-sync.cjs` through
 * their `allowed-tools` frontmatter, but that authorization does not reach a
 * Task subagent (the `norm` agent), and in a headless `claude -p` session an
 * unapproved Bash call is simply denied. Field-found: the agent then skipped
 * the file workspace entirely.
 *
 * This hook allows exactly one shape of command — `node` running one of this
 * plugin's bundled scripts from this plugin's own bin/ directory — and says
 * nothing about anything else, so every other Bash call keeps its normal
 * permission flow. The scripts are offline (the codec never touches the
 * network; the loop/config helpers only read and write .norm/ state and the
 * documented settings location), so auto-approving them is safe.
 *
 * Fail-soft: any error means "no opinion" (exit 0 with no output).
 */

const path = require("node:path");

const ALLOWED = new Set(["norm-sync.cjs", "norm-loop.cjs", "norm-config.cjs"]);

function readStdin() {
	return new Promise((resolve) => {
		let buffer = "";
		const timer = setTimeout(() => resolve(buffer), 500);
		if (timer.unref) timer.unref();
		try {
			process.stdin.setEncoding("utf8");
			process.stdin.on("data", (chunk) => {
				buffer += chunk;
			});
			process.stdin.on("end", () => {
				clearTimeout(timer);
				resolve(buffer);
			});
			process.stdin.on("error", () => {
				clearTimeout(timer);
				resolve(buffer);
			});
		} catch {
			clearTimeout(timer);
			resolve(buffer);
		}
	});
}

/** True when `command` is `node <this plugin>/bin/<allowed script> ...` and nothing more. */
function isOwnScript(command) {
	if (typeof command !== "string") return false;
	let trimmed = command.trim();
	// The commands pipe `rebuild` into a scratch file: allow ONE stdout
	// redirect to a plain relative path under .norm/ and nothing else.
	trimmed = trimmed.replace(/\s>\s*\.norm\/[A-Za-z0-9_.-]+$/, "");
	// One simple command only: no chaining, piping, or substitution.
	if (/[;&|`$<>]/.test(trimmed.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, ""))) return false;
	const m = trimmed.match(/^node\s+("?)([^"\s]+)\1(?:\s|$)/);
	if (!m) return false;
	const scriptPath = m[2].replace(/^\$\{CLAUDE_PLUGIN_ROOT\}/, path.resolve(__dirname, ".."));
	const resolved = path.resolve(scriptPath);
	const binDir = path.resolve(__dirname);
	if (path.dirname(resolved) !== binDir) return false;
	return ALLOWED.has(path.basename(resolved));
}

async function main() {
	let payload;
	try {
		const raw = await readStdin();
		payload = raw && raw.trim() ? JSON.parse(raw) : null;
	} catch {
		return;
	}
	if (!payload || payload.tool_name !== "Bash") return;
	const command = payload.tool_input && payload.tool_input.command;
	if (!isOwnScript(command)) return;
	process.stdout.write(
		`${JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "allow",
				permissionDecisionReason:
					"Bland plugin: bundled offline script (bin/norm-sync.cjs, norm-loop.cjs, norm-config.cjs) — no network, plugin-owned.",
			},
		})}\n`,
	);
}

main()
	.catch(() => {
		/* fail soft — no opinion */
	})
	.finally(() => {
		process.exit(0);
	});
