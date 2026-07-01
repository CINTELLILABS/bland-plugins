#!/usr/bin/env node
"use strict";

/**
 * Bland Norm — Stop hook: convergence-loop gate (evaluator-optimizer).
 *
 * When a /norm:loop is active for THIS session, refuse to let the turn end while
 * the target still fails: re-feed the concrete failing outcomes as the agent's
 * next instruction (the documented Stop-hook `decision:"block"` + `reason`
 * contract) so it keeps editing the pathway files + re-simulating. Releases on
 * PASS, max_iter, no-progress (same failures twice), or staleness (24h TTL).
 * The agent records each simulation verdict via norm-loop.cjs record; this hook
 * only gates + bounds — it never runs the simulation itself.
 *
 * FAIL-SOFT: always exits 0; only ever prints a `decision:block` when it must
 * keep the loop going. Termination is OUR job: the docs guarantee no automatic
 * infinite-loop guard, so max_iter + the stall check + the TTL are authoritative.
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
			s.updated_at = new Date().toISOString();
			fs.writeFileSync(stateFile, `${JSON.stringify(s, null, 2)}\n`, "utf8");
		} catch {
			/* fail soft */
		}
	};

	// Staleness TTL: a loop untouched for 24h is a leftover from a dead session —
	// deactivate silently rather than hijacking whatever stop comes next.
	try {
		const ts = Date.parse(s.updated_at || s.started_at || "");
		if (Number.isFinite(ts) && Date.now() - ts > 24 * 60 * 60 * 1000) {
			s.active = false;
			save();
			return;
		}
	} catch {
		/* fail soft */
	}

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
		const passes = Array.isArray(s.history) ? s.history.length : 0;
		release(
			`✅ norm:loop converged after ${passes} recorded simulation pass(es) — pathway ${s.pathway_id || ""} passes the target.`,
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
		: "  - (run the simulation to capture the current failures)";
	const scen = s.scenario ? `\nCustomer scenario (fixed): ${s.scenario}` : "";
	const bar = Array.isArray(s.outcomes) && s.outcomes.length
		? `\nFull outcome bar (fixed): ${s.outcomes.join("; ")}`
		: "";
	const reason = [
		`norm:loop — pathway ${s.pathway_id || ""} does NOT yet pass the target. Do ONE focused convergence pass, then end your turn (this hook re-feeds until it passes, hits max iterations, or stalls).${scen}${bar}`,
		"",
		`Failing now:\n${failList}`,
		"",
		"This pass:",
		"1. Fix EXACTLY those failures with a minimal, targeted edit to the pathway FILES — prose (node.md / condition.md / edge labels / global_prompt.md) and structured YAML (variables.yaml / model.yaml / tools.yaml / node frontmatter) via native Read/Edit; check shapes with mcp__bland__get_pathway_schema before hand-authoring structured YAML.",
		"2. Validate change-aware BEFORE committing: `norm-sync.cjs rebuild pathway/`, then mcp__bland__validate_pathway with the rebuilt graph + `baseline` from .norm/baseline.json (object bodies, never stringified). Fix every introduced_error and the runtime_contract_findings marked relevant_to_changes before proceeding.",
		"3. Commit the clean graph: /norm:commit (the only confirm-gated write).",
		"4. Re-simulate a FULL call from a fresh chat instance: mcp__bland__call_bland_api POST /v1/pathway/chat/create { pathway_id }, then POST /v1/pathway/chat/<chat_id> { message } turn-by-turn, in character for the scenario, until `completed` is true. Simulation turns are safe (no real call) and need no confirmation.",
		"5. Judge the FIXED outcome bar against the final chat_history / current_node_name / variables — each outcome met/not-met with the quote or node that proves it. Never mark an outcome met without transcript evidence.",
		`6. Record the verdict: node "${root}/bin/norm-loop.cjs" record --passed <true|false> --failing "<failing outcomes, ';' separated>"`,
		`Do not ask the user. Never change the scenario or the outcome bar mid-loop. To abort the loop deliberately, run: node "${root}/bin/norm-loop.cjs" stop`,
	].join("\n");
	out({
		decision: "block",
		reason,
		systemMessage: `🔁 norm:loop pass ${s.iteration}/${max} — converging pathway ${s.pathway_id || ""}`,
	});
}

main()
	.catch(() => {
		/* fail soft */
	})
	.finally(() => {
		process.exit(0);
	});
