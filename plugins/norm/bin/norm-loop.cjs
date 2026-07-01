#!/usr/bin/env node
"use strict";

/**
 * Bland Norm — convergence-loop state manager.
 *
 * Backs /norm:loop and the Stop-hook gate (hook-loop.cjs). The loop is an
 * evaluator-optimizer cycle: the agent simulates a call against the pathway
 * (Pathway Chat), judges the transcript against a FIXED outcome checklist,
 * edits the pathway FILES to fix what failed, commits, and records the
 * pass/fail here. The Stop hook refuses to let the turn end while the target
 * fails — re-feeding the failing outcomes until it passes, hits max_iter, or
 * stalls (same failures twice).
 *
 * State lives at <project>/.norm/loop.json. Subcommands:
 *   init <pathway_id> --max N --scenario "..." --outcomes "a;b;c" --goal "..."
 *   record --passed true|false --failing "a;b" [--run-id X]    record a sim pass
 *   status                                                     print state
 *   stop                                                       deactivate
 */

const fs = require("node:fs");
const path = require("node:path");

function projectDir() {
	if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
	let dir = process.cwd();
	for (let i = 0; i < 8; i += 1) {
		if (
			fs.existsSync(path.join(dir, ".norm")) ||
			fs.existsSync(path.join(dir, ".pathways"))
		) {
			return dir;
		}
		const p = path.dirname(dir);
		if (p === dir) break;
		dir = p;
	}
	return process.cwd();
}

const PROJECT_DIR = projectDir();
const NORM_DIR = path.join(PROJECT_DIR, ".norm");
const STATE = path.join(NORM_DIR, "loop.json");

const argv = process.argv.slice(2);
const sub = argv[0];

function emit(o) {
	process.stdout.write(`${JSON.stringify(o, null, 2)}\n`);
}
function flag(name) {
	const i = argv.indexOf(name);
	return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}
function readState() {
	try {
		return JSON.parse(fs.readFileSync(STATE, "utf8"));
	} catch {
		return null;
	}
}
function writeState(s) {
	s.updated_at = new Date().toISOString();
	fs.mkdirSync(NORM_DIR, { recursive: true });
	fs.writeFileSync(STATE, `${JSON.stringify(s, null, 2)}\n`, "utf8");
}
function splitList(raw) {
	return String(raw || "")
		.split(/[;\n]/)
		.map((x) => x.trim())
		.filter(Boolean);
}

if (sub === "init") {
	const pathwayId = argv[1] && !argv[1].startsWith("--") ? argv[1] : null;
	if (!pathwayId) {
		emit({
			ok: false,
			error:
				'init requires a pathway id: init <pathway_id> --max N --scenario "<customer persona>" --outcomes "a;b;c"',
		});
		process.exit(1);
	}
	const max = parseInt(flag("--max"), 10) || 8;
	const outcomes = splitList(flag("--outcomes"));
	const state = {
		active: true,
		session_id: "", // claimed by the Stop hook on first fire (session isolation)
		pathway_id: pathwayId,
		goal: flag("--goal") || "",
		scenario: flag("--scenario") || "",
		outcomes,
		max_iter: max,
		iteration: 0,
		last_result: { passed: false, failing: ["(target not yet run)"], run_id: null },
		history: [],
		started_at: new Date().toISOString(),
	};
	writeState(state);
	emit({
		ok: true,
		command: "init",
		state_file: STATE,
		pathway_id: pathwayId,
		max_iter: max,
		scenario: state.scenario,
		outcomes,
	});
} else if (sub === "record") {
	const s = readState();
	if (!s) {
		emit({ ok: false, error: "No loop state. Run `norm-loop init` first." });
		process.exit(1);
	}
	const passedRaw = flag("--passed");
	const passed = passedRaw === "true" || passedRaw === "1";
	const failing = splitList(flag("--failing"));
	s.last_result = {
		passed,
		failing: passed ? [] : failing.length ? failing : ["(unspecified failure)"],
		run_id: flag("--run-id") || null,
	};
	s.history = Array.isArray(s.history) ? s.history : [];
	s.history.push({
		iteration: s.iteration,
		passed,
		failing: passed ? [] : failing,
	});
	writeState(s);
	emit({
		ok: true,
		command: "record",
		passed,
		failing: s.last_result.failing,
		iteration: s.iteration,
	});
} else if (sub === "status") {
	emit({ ok: true, command: "status", state: readState() });
} else if (sub === "stop") {
	const s = readState();
	if (s) {
		s.active = false;
		writeState(s);
	}
	emit({ ok: true, command: "stop", stopped: !!s });
} else {
	emit({
		ok: false,
		error:
			"usage: norm-loop <init <pathway_id> --max N --scenario '...' --outcomes 'a;b;c' --goal '...' | record --passed true|false --failing 'a;b' [--run-id X] | status | stop>",
	});
	process.exit(1);
}
