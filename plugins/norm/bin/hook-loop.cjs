#!/usr/bin/env node
"use strict";

/**
 * Bland Norm — Stop hook: convergence-loop gate (evaluator-optimizer).
 *
 * When a /norm:loop is active for THIS session, refuse to let the turn end while
 * the target test is still failing: re-feed the concrete failures as the agent's
 * next instruction so it keeps editing the pathway files + re-testing. Releases on
 * PASS, max_iter, or no-progress (same failures twice). The agent records each
 * test run via norm-loop.cjs; this hook only gates + bounds — it never runs the
 * eval itself.
 *
 * FAIL-SOFT: always exits 0; only ever prints a `decision:block` when it must keep
 * the loop going. Bounded by max_iter AND Claude Code's 8-consecutive-block cap.
 */

const fs = require("node:fs");
const path = require("node:path");

function readStdin() {
	return new Promise((resolve) => {
		let buf = "";
		const t = setTimeout(() => resolve(buf), 200);
		if (t.unref) t.unref();
		try {
			process.stdin.setEncoding("utf8");
			process.stdin.on("data", (c) => {
				buf += c;
			});
			process.stdin.on("end", () => {
				clearTimeout(t);
				resolve(buf);
			});
			process.stdin.on("error", () => {
				clearTimeout(t);
				resolve(buf);
			});
		} catch {
			clearTimeout(t);
			resolve(buf);
		}
	});
}

function findStateFile() {
	let dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
	for (let i = 0; i < 8; i += 1) {
		const f = path.join(dir, ".norm", "loop.json");
		if (fs.existsSync(f)) return f;
		const p = path.dirname(dir);
		if (p === dir) break;
		dir = p;
	}
	return null;
}

function out(obj) {
	try {
		process.stdout.write(`${JSON.stringify(obj)}\n`);
	} catch {
		/* fail soft */
	}
}

async function main() {
	let payload = {};
	try {
		const raw = await readStdin();
		if (raw && raw.trim()) payload = JSON.parse(raw);
	} catch {
		/* fail soft */
	}
	const sessionId = payload.session_id || "";

	const stateFile = findStateFile();
	if (!stateFile) return;
	let s;
	try {
		s = JSON.parse(fs.readFileSync(stateFile, "utf8"));
	} catch {
		return;
	}
	if (!s || s.active !== true) return;

	const save = () => {
		try {
			fs.writeFileSync(stateFile, `${JSON.stringify(s, null, 2)}\n`, "utf8");
		} catch {
			/* fail soft */
		}
	};

	// Session isolation: claim the loop on first fire, then scope to that session
	// so this project-wide Stop hook never hijacks other Norm sessions.
	if (!s.session_id) {
		s.session_id = sessionId;
		save();
	} else if (sessionId && s.session_id !== sessionId) {
		return;
	}

	const lr = s.last_result || {};
	const max = typeof s.max_iter === "number" ? s.max_iter : 6;
	const iter = typeof s.iteration === "number" ? s.iteration : 0;
	const failing = Array.isArray(lr.failing) ? lr.failing : [];

	const release = (msg) => {
		s.active = false;
		save();
		out({ systemMessage: msg });
	};

	// PASS → release.
	if (lr.passed === true) {
		release(
			`✅ norm:loop converged after ${iter} iteration(s) — pathway ${s.pathway_id || ""} passes the target.`,
		);
		return;
	}

	// Max iterations → release + escalate.
	if (iter >= max) {
		release(
			`🛑 norm:loop hit max iterations (${max}) without converging. Remaining failures: ${failing.join("; ") || "unknown"}. Review the pathway and target before re-running.`,
		);
		return;
	}

	// No progress: identical non-empty failing set across the last two iterations.
	const h = Array.isArray(s.history) ? s.history : [];
	if (h.length >= 2) {
		const a = (h[h.length - 1].failing || []).slice().sort().join("|");
		const b = (h[h.length - 2].failing || []).slice().sort().join("|");
		if (a && a === b) {
			release(
				`🛑 norm:loop made no progress — the same failures persisted across two iterations: ${failing.join("; ")}. Escalating (the context may be polluted; consider a fresh approach).`,
			);
			return;
		}
	}

	// Not converged → block + re-feed the converge instruction with the failures.
	s.iteration = iter + 1;
	save();
	const root = process.env.CLAUDE_PLUGIN_ROOT || ".";
	const failList = failing.length
		? failing.map((f) => `  - ${f}`).join("\n")
		: "  - (re-run the target scenarios to capture the current failures)";
	const scen = (s.scenario_ids || []).join(", ");
	const reason = [
		`norm:loop — pathway ${s.pathway_id || ""} does NOT yet pass the target. Do ONE focused convergence iteration, then end your turn (this hook re-feeds until it passes, hits max iterations, or stalls).`,
		"",
		`Failing now:\n${failList}`,
		"",
		"This iteration:",
		"1. Edit the pathway FILES to fix EXACTLY those failures — a targeted change, not a rewrite. Prose (node.md / condition.md / edge labels / global_prompt.md) with native Read/Edit; structured surfaces (variables, model, node tools, unit tests) ONLY via the set_* MCP tools.",
		"2. Save the workspace: /norm:commit (compiles + persists).",
		`3. Re-run the target ${scen ? `(scenarios: ${scen})` : ""} with run_agent_test_scenario / run_agent_test_batch, then poll get_agent_test_run for the assertion results.`,
		`4. Record the result: node "${root}/bin/norm-loop.cjs" record --passed <true|false> --failing "<failing assertions, ';' separated>"`,
		"5. If ALL assertions pass, also output <promise>CONVERGED</promise>.",
		"Do not ask the user. Keep each change minimal and tied to a specific failure.",
	].join("\n");
	out({
		decision: "block",
		reason,
		systemMessage: `🔁 norm:loop iteration ${s.iteration}/${max} — converging pathway ${s.pathway_id || ""}`,
	});
}

main()
	.catch(() => {
		/* fail soft */
	})
	.finally(() => {
		process.exit(0);
	});
