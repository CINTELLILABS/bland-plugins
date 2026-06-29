#!/usr/bin/env node
"use strict";

/**
 * Bland Norm — Stop hook (warn-if-dirty).
 *
 * Runs when the agent finishes responding. If a pathway workspace is mounted and
 * has uncommitted local edits, it prints an advisory reminder to validate and
 * commit so the user doesn't lose work in an unsaved workspace.
 *
 * Dirtiness is determined OFFLINE, in this order of preference:
 *   1. A sync-engine state file `.pathways/.norm-sync.json` (if the bundled
 *      `norm-sync.cjs` recorded the last-committed version + a content hash /
 *      dirty flag). We trust an explicit `dirty: true/false` if present.
 *   2. Otherwise, `git status --porcelain` scoped to the workspace dir, if it is
 *      inside a git repo. Any tracked/untracked change under the workspace counts.
 *
 * This hook NEVER calls the network and NEVER reads secrets. It is FAIL-SOFT and
 * always exits 0 — it can only ever print a warning, never block the Stop.
 *
 * Reads the Stop payload as JSON from stdin (used only to avoid re-entrancy).
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function readStdin() {
	return new Promise((resolve) => {
		let buffer = "";
		const timer = setTimeout(() => resolve(buffer), 250);
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

function findWorkspaceRoot() {
	let dir = process.cwd();
	for (let i = 0; i < 10; i += 1) {
		try {
			if (fs.existsSync(path.join(dir, ".pathways"))) return dir;
		} catch {
			/* ignore */
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

function readSyncState(workspaceRoot) {
	try {
		const file = path.join(workspaceRoot, ".pathways", ".norm-sync.json");
		if (!fs.existsSync(file)) return null;
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

function gitDirty(workspaceRoot) {
	// Returns { dirty:boolean, files:string[] } or null if not determinable.
	try {
		const out = execFileSync("git", ["status", "--porcelain", "--", "."], {
			cwd: workspaceRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 2000,
		});
		const files = out
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean)
			// Ignore the sync state file itself.
			.filter((l) => !l.endsWith(".norm-sync.json"));
		return { dirty: files.length > 0, files };
	} catch {
		return null; // not a git repo, or git unavailable -> can't tell this way
	}
}

async function main() {
	try {
		const raw = await readStdin();
		if (raw && raw.trim()) {
			const payload = JSON.parse(raw);
			// Avoid loops if Stop was already continued by a prior hook.
			if (payload && payload.stop_hook_active === true) return;
		}
	} catch {
		/* fail soft */
	}

	let workspaceRoot = null;
	try {
		workspaceRoot = findWorkspaceRoot();
	} catch {
		return;
	}
	if (!workspaceRoot) return; // no workspace -> nothing to warn about

	let dirty = false;
	let files = [];
	let pathwayId = "";
	let versionId = "";
	// Whether the sync-engine state file gave an authoritative dirty answer.
	// If it did, we trust it and DO NOT fall back to git (an explicit dirty:false
	// from norm-sync must stay quiet).
	let authoritative = false;

	try {
		const state = readSyncState(workspaceRoot);
		if (state) {
			pathwayId = typeof state.pathway_id === "string" ? state.pathway_id : "";
			versionId = typeof state.version_id === "string" ? state.version_id : "";
			if (typeof state.dirty === "boolean") {
				dirty = state.dirty;
				authoritative = true;
				if (Array.isArray(state.dirty_files)) files = state.dirty_files.slice(0, 10);
			}
		}
	} catch {
		/* fall through to git */
	}

	// Only fall back to git when the sync state gave no authoritative answer.
	if (!authoritative) {
		try {
			const g = gitDirty(workspaceRoot);
			if (g) {
				dirty = g.dirty;
				files = g.files.slice(0, 10);
			}
		} catch {
			/* fail soft */
		}
	}

	if (!dirty) return; // clean (or undeterminable) -> stay quiet

	const idNote = pathwayId
		? ` (pathway ${pathwayId}${versionId ? `, version ${versionId}` : ""})`
		: "";
	const fileNote = files.length ? `\nChanged: ${files.join(", ")}` : "";
	const message =
		`Bland Norm: the local pathway workspace${idNote} has uncommitted edits. ` +
		`Run /norm:validate then /norm:commit to persist — an unsaved local workspace is not a saved pathway.${fileNote}`;

	try {
		// systemMessage surfaces a non-blocking warning to the user on Stop.
		process.stdout.write(`${JSON.stringify({ systemMessage: message })}\n`);
	} catch {
		/* fail soft */
	}
}

main()
	.catch(() => {
		/* fail soft — never throw */
	})
	.finally(() => {
		process.exit(0);
	});
