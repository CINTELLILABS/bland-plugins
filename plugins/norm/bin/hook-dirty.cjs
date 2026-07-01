#!/usr/bin/env node
"use strict";

/**
 * Bland Norm — Stop hook: NUDGE when the pathway workspace has uncommitted edits.
 *
 * Architecture note (post-AWL): a Stop hook CANNOT auto-commit a pathway. Commits
 * go through the MCP passthrough (mcp__bland__call_bland_api), whose API key lives
 * only in the MCP connection and is NOT available to a Bash subprocess. So this
 * hook never writes and never touches the network. It does a LOCAL, networkless
 * dirty check and, if there are unsaved edits, reminds the user to run
 * /norm:validate then /norm:commit.
 *
 * Dirty check: regenerate the clone-time baseline (`.norm/baseline.json`) into a
 * throwaway tree with the offline codec (`norm-sync.cjs generate`), then hash-
 * compare it file-by-file against the live `pathway/` tree. Any differing/added/
 * removed file => dirty. Both trees come from the SAME deterministic `generate`,
 * so an unedited workspace compares byte-identical.
 *
 * FAIL-SOFT: always exits 0; every subprocess has a hard timeout, so it can never
 * block or hang the turn.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

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

function projectDir() {
	return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function normSyncBin() {
	const root = process.env.CLAUDE_PLUGIN_ROOT;
	if (!root) return null;
	// ${CLAUDE_PLUGIN_ROOT} resolves to the plugin dir (.../plugins/norm); the
	// offline codec sits at <root>/bin/norm-sync.cjs.
	const bin = path.join(root, "bin", "norm-sync.cjs");
	return fs.existsSync(bin) ? bin : null;
}

/** Offline `norm-sync.cjs generate <json> <out-dir>` — networkless. true on ok. */
function generateTree(bin, jsonFile, outDir, timeout) {
	try {
		execFileSync(process.execPath, [bin, "generate", jsonFile, outDir], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: timeout || 8000,
			env: process.env,
		});
		return true;
	} catch {
		return false;
	}
}

function sha(buf) {
	return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Map of relative-path -> content hash for every file under `dir`. */
function hashTree(dir) {
	const out = {};
	const walk = (d, rel) => {
		let entries;
		try {
			entries = fs.readdirSync(d, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			const abs = path.join(d, e.name);
			const r = rel ? `${rel}/${e.name}` : e.name;
			if (e.isDirectory()) walk(abs, r);
			else {
				try {
					out[r] = sha(fs.readFileSync(abs));
				} catch {
					/* unreadable — skip */
				}
			}
		}
	};
	walk(dir, "");
	return out;
}

/** Files that differ between the two hash maps (changed, added, or removed). */
function changedFiles(a, b) {
	const names = new Set([...Object.keys(a), ...Object.keys(b)]);
	const changed = [];
	for (const n of names) if (a[n] !== b[n]) changed.push(n);
	return changed.sort();
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

	const root = projectDir();
	const pathwayDir = path.join(root, "pathway");
	const baseline = path.join(root, ".norm", "baseline.json");
	// No mounted workspace (no tree or no baseline) → nothing to nudge about.
	if (!fs.existsSync(pathwayDir) || !fs.existsSync(baseline)) return;

	const bin = normSyncBin();
	if (!bin) return;

	// Regenerate the baseline into a throwaway tree, then hash-compare.
	let tmp;
	try {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "norm-dirty-"));
	} catch {
		return;
	}
	try {
		if (!generateTree(bin, baseline, tmp, 8000)) return; // can't determine → silent
		const changed = changedFiles(hashTree(pathwayDir), hashTree(tmp));
		if (changed.length === 0) return; // clean → silent

		const shown = changed.slice(0, 3).join(", ");
		const more = changed.length > 3 ? ` (+${changed.length - 3} more)` : "";
		emit(
			`Bland Norm: your pathway workspace has ${changed.length} uncommitted ` +
				`edit${changed.length === 1 ? "" : "s"} (${shown}${more}). ` +
				`Run /norm:validate then /norm:commit to save — an uncommitted ` +
				`workspace is not a saved pathway. Production is unchanged.`,
		);
	} finally {
		try {
			fs.rmSync(tmp, { recursive: true, force: true });
		} catch {
			/* best effort */
		}
	}
}

main()
	.catch(() => {
		/* fail soft — never throw */
	})
	.finally(() => {
		process.exit(0);
	});
