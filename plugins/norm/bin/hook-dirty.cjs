#!/usr/bin/env node
"use strict";

/**
 * Bland Norm — Stop hook: autosave the pathway workspace.
 *
 * Same model as super_norm: a pathway is ONE workspace. When the turn changed
 * anything, commit the whole workspace. `commit_pathway_workspace` already
 * validates and FAILS CLOSED on errors (it won't persist a broken pathway), so
 * this hook does NOT pre-validate or gate — it just commits and reports the
 * outcome. Commits go to the WORKING version; production is untouched.
 *
 * FAIL-SOFT: always exits 0; every subprocess has a hard timeout, so it can never
 * block or hang the turn. Dirtiness is a LOCAL `norm-sync status` (no network);
 * only the commit step touches the network, and only when there's something to save.
 */

const { execFileSync } = require("node:child_process");
const path = require("node:path");

function readStdin() {
	return new Promise((resolve) => {
		let buffer = "";
		const timer = setTimeout(() => resolve(buffer), 200);
		if (timer.unref) timer.unref();
		try {
			process.stdin.setEncoding("utf8");
			process.stdin.on("data", (c) => {
				buffer += c;
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

/** Run `norm-sync.cjs <args>` and return its last JSON stdout line, or null. */
function runSync(args, timeout) {
	const root = process.env.CLAUDE_PLUGIN_ROOT;
	if (!root) return null;
	// ${CLAUDE_PLUGIN_ROOT} already resolves to the plugin dir (.../plugins/norm),
	// so the engine sits at <root>/bin/, NOT <root>/plugins/norm/bin/.
	const bin = path.join(root, "bin", "norm-sync.cjs");
	if (!require("node:fs").existsSync(bin)) return null;
	const parseLast = (s) => {
		try {
			const line = String(s).trim().split("\n").filter(Boolean).pop();
			return line ? JSON.parse(line) : null;
		} catch {
			return null;
		}
	};
	try {
		const out = execFileSync(process.execPath, [bin, ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: timeout || 8000,
			// Inherits CLAUDE_PROJECT_DIR + CLAUDE_PLUGIN_OPTION_bland_api_key/_url,
			// which norm-sync reads — no secret is handled here directly.
			env: process.env,
		});
		return parseLast(out);
	} catch (e) {
		// norm-sync emits a JSON error envelope on stdout even on a non-zero exit.
		if (e && e.stdout) return parseLast(e.stdout);
		return null;
	}
}

function emit(message) {
	try {
		process.stdout.write(`${JSON.stringify({ systemMessage: message })}\n`);
	} catch {
		/* fail soft */
	}
}

async function main() {
	// Re-entrancy guard: don't act if a prior hook already continued the Stop.
	try {
		const raw = await readStdin();
		if (raw && raw.trim()) {
			const payload = JSON.parse(raw);
			if (payload && payload.stop_hook_active === true) return;
		}
	} catch {
		/* fail soft */
	}

	// Local, no-network dirty check.
	const status = runSync(["status"], 6000);
	if (!status || status.ok === false) return; // no workspace / undeterminable
	if (status.clean === true) return; // nothing changed → silent

	// Changed → commit the whole workspace. commit fails closed on its own.
	const res = runSync(["commit"], 25000);
	if (res && res.ok) {
		const v = res.new_version != null ? ` (working version ${res.new_version})` : "";
		emit(`Bland Norm: auto-saved your pathway${v}. Production is unchanged.`);
	} else {
		const why = res && (res.error || res.message) ? ` (${res.error || res.message})` : "";
		emit(`Bland Norm: couldn't auto-save${why} — fix it and it saves on the next turn.`);
	}
}

main()
	.catch(() => {
		/* fail soft — never throw */
	})
	.finally(() => {
		process.exit(0);
	});
