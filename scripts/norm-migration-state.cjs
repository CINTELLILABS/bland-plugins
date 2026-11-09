#!/usr/bin/env node
"use strict";

/**
 * Norm v2 — migration convergence-loop state manager.
 *
 * Backs /norm:migrate and the Stop-hook gate (hook-migrate-loop.cjs). State
 * lives at <project>/.norm/migration.json. The loop is complete only when:
 *   audit green (the hook re-runs it live)  AND
 *   a version was pushed AFTER the last snapshot edit  AND
 *   the sim suite is recorded green ON THAT PUSHED HEAD.
 * Upgrade mode freezes a pre-push evaluation suite and requires design evidence
 * for the pushed head. Local records remain advisory; only the platform
 * independently verifies persisted evidence and compiled design coverage.
 *
 * Subcommands:
 *   init --snapshot <file> [--source <file>]... [--persona <file>] \
 *        [--agent <id>] [--max N] [--upgrade]          start/replace the loop
 *   record-evaluation --scenario <id>...              freeze upgrade suite before pushing
 *   record-design --file <json>                       map requirements/KB scope to the pushed head
 *   record-push --head <versionId>                    a version was pushed
 *   record-sims --head <versionId> --passed true|false [--failing "a;b"]
 *   ack-uncovered --lane "<name>: <why>"              record an untestable lane
 *   status                                            print state
 *   stop                                              deactivate
 */

const fs = require("node:fs");
const path = require("node:path");

function projectDir() {
	if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
	let dir = process.cwd();
	for (let i = 0; i < 8; i += 1) {
		if (fs.existsSync(path.join(dir, ".norm"))) return dir;
		const p = path.dirname(dir);
		if (p === dir) break;
		dir = p;
	}
	return process.cwd();
}

const NORM_DIR = path.join(projectDir(), ".norm");
const STATE = path.join(NORM_DIR, "migration.json");
const argv = process.argv.slice(2);
const sub = argv[0];

function flag(name) {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : undefined;
}
function flagAll(name) {
	const out = [];
	for (let i = 1; i < argv.length; i += 1) {
		if (argv[i] === `--${name}` && argv[i + 1]) out.push(argv[i + 1]);
	}
	return out;
}
function load() {
	try {
		return JSON.parse(fs.readFileSync(STATE, "utf8"));
	} catch {
		return null;
	}
}
function save(s) {
	fs.mkdirSync(NORM_DIR, { recursive: true });
	s.updated_at = Date.now();
	fs.writeFileSync(STATE, `${JSON.stringify(s, null, 2)}\n`);
	process.stdout.write(`${JSON.stringify(s, null, 2)}\n`);
}

if (sub === "init") {
	const snapshot = flag("snapshot");
	if (!snapshot) {
		process.stderr.write("--snapshot required\n");
		process.exit(1);
	}
	// Scoping guard: never silently clobber another session's ACTIVE loop.
	const prior = load();
	if (prior && prior.active === true && !argv.includes("--force")) {
		process.stderr.write(`an ACTIVE migration loop already exists (agent ${prior.agent_id || "?"}, snapshot ${prior.snapshot}). Finish it, run 'stop', or re-init with --force.\n`);
		process.exit(1);
	}
	// Drop declarations (dropped-tags.json, read by audit A6) are per
	// migration: a tag one source dropped is not dropped for the next.
	const droppedTags = path.join(NORM_DIR, "dropped-tags.json");
	if (fs.existsSync(droppedTags)) {
		fs.rmSync(droppedTags);
		process.stderr.write("cleared .norm/dropped-tags.json from the previous migration; declare this one's drops afresh\n");
	}
	save({
		active: true,
		...(argv.includes("--upgrade") ? { mode: "outcomes-v1" } : {}),
		created_at: Date.now(),
		session_id: process.env.CLAUDE_SESSION_ID || "",
		snapshot: path.resolve(snapshot),
		sources: flagAll("source").map((p) => path.resolve(p)),
		persona: flag("persona") ? path.resolve(flag("persona")) : "",
		agent_id: flag("agent") || "",
		max_iter: Number(flag("max") || 12),
		iter: 0,
		stall_count: 0,
		last_failure_sig: "",
		push: { head: "", at: 0 },
		sims: { head: "", passed: false, failing: [], at: 0 },
		uncovered: [],
		released: "",
	});
} else if (sub === "record-evaluation") {
	const s = load();
	if (!s) process.exit(1);
	if (s.mode !== "outcomes-v1") {
		process.stderr.write("record-evaluation requires an init --upgrade loop; legacy mode is unchanged\n");
		process.exit(1);
	}
	const ids = flagAll("scenario");
	const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!ids.length || ids.length > 100 || ids.some((id) => !uuid.test(id)) || new Set(ids).size !== ids.length) {
		process.stderr.write("provide 1–100 unique scenario UUIDs with --scenario <id> (repeatable)\n");
		process.exit(1);
	}
	const evaluation = { scenario_ids: ids };
	if (s.evaluation) {
		if (JSON.stringify(s.evaluation) !== JSON.stringify(evaluation)) {
			process.stderr.write("evaluation suite is frozen; do not replace or shrink it\n");
			process.exit(1);
		}
	} else if ((s.push || {}).head) {
		process.stderr.write("record the evaluation suite before the first candidate push\n");
		process.exit(1);
	}
	s.evaluation = evaluation;
	save(s);
} else if (sub === "record-design") {
	const s = load();
	if (!s) process.exit(1);
	if (s.mode !== "outcomes-v1") {
		process.stderr.write("record-design requires an init --upgrade loop; legacy mode is unchanged\n");
		process.exit(1);
	}
	let design;
	try {
		design = JSON.parse(fs.readFileSync(flag("file"), "utf8"));
	} catch {
		process.stderr.write("record-design requires --file <json> containing readable design evidence\n");
		process.exit(1);
	}
	// Local shape/freshness checks only. The platform checks source coverage,
	// actual compiled targets, knowledge scope and frozen scenario membership.
	if (!design || typeof design !== "object" || Array.isArray(design) ||
		typeof design.head_version_id !== "string" || !design.head_version_id ||
		design.head_version_id !== (s.push || {}).head ||
		!Array.isArray(design.responsibilities) || !design.responsibilities.length ||
		!Array.isArray(design.knowledge)) {
		process.stderr.write("design must name the current pushed head_version_id and include a non-empty responsibilities array and a knowledge array; see outcomes-v1.md\n");
		process.exit(1);
	}
	s.design = design;
	save(s);
} else if (sub === "record-push") {
	const s = load();
	if (!s) process.exit(1);
	const agent = flag("agent");
	if (agent && s.agent_id && agent !== s.agent_id) {
		process.stderr.write(`agent mismatch: state is for ${s.agent_id}, record targeted ${agent}. Refusing.\n`);
		process.exit(1);
	}
	if (s.mode === "outcomes-v1" && !(s.evaluation || {}).scenario_ids?.length) {
		process.stderr.write("upgrade requires record-evaluation --scenario <id> before the first candidate push\n");
		process.exit(1);
	}
	s.push = { head: flag("head") || "", at: Date.now() };
	s.sims = { head: "", passed: false, failing: [], at: 0 };
	save(s);
} else if (sub === "record-sims") {
	const s = load();
	if (!s) process.exit(1);
	const agent2 = flag("agent");
	if (agent2 && s.agent_id && agent2 !== s.agent_id) {
		process.stderr.write(`agent mismatch: state is for ${s.agent_id}, record targeted ${agent2}. Refusing.\n`);
		process.exit(1);
	}
	s.sims = {
		head: flag("head") || "",
		passed: String(flag("passed")) === "true",
		failing: String(flag("failing") || "")
			.split(";")
			.map((x) => x.trim())
			.filter(Boolean),
		at: Date.now(),
	};
	save(s);
} else if (sub === "ack-uncovered") {
	const s = load();
	if (!s) process.exit(1);
	const lane = flag("lane");
	if (lane && !s.uncovered.includes(lane)) s.uncovered.push(lane);
	save(s);
} else if (sub === "status") {
	const s = load();
	process.stdout.write(`${JSON.stringify(s || { active: false }, null, 2)}\n`);
} else if (sub === "stop") {
	const s = load() || {};
	s.active = false;
	s.released = s.released || "manual stop";
	save(s);
} else {
	process.stderr.write("subcommands: init | record-evaluation | record-design | record-push | record-sims | ack-uncovered | status | stop\n");
	process.exit(1);
}
