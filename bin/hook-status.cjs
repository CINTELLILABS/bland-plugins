#!/usr/bin/env node
"use strict";

/**
 * Bland — SessionStart hook (offline orientation).
 *
 * Prints a short orientation banner so the session knows the Norm workflow and
 * which /bland:* commands exist. This is OFFLINE: it makes no network calls and
 * never reads secrets. It is FAIL-SOFT: any error is swallowed and the process
 * always exits 0 so it can never block a session from starting.
 *
 * Reads the SessionStart hook payload as JSON from stdin (ignored beyond best
 * effort) and emits SessionStart additionalContext on stdout.
 */

function readStdin() {
	return new Promise((resolve) => {
		let buffer = "";
		// If nothing is piped in, don't hang the session.
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

function findWorkspaceDir() {
	const fs = require("node:fs");
	const path = require("node:path");
	let dir = process.cwd();
	for (let i = 0; i < 8; i += 1) {
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

async function main() {
	// Best-effort parse; we don't actually need anything from the payload.
	try {
		const raw = await readStdin();
		if (raw && raw.trim()) JSON.parse(raw);
	} catch {
		/* fail soft */
	}

	const lines = [
		"Bland plugin active.",
		"Workflow: ALL pathway surfaces are edited natively in the workspace files — prose (node.md / condition.md / edge labels / global_prompt.md) and structured YAML (variables / model / tools / unit-tests; check shapes with get_pathway_schema, deep semantics with get_pathway_context); server round-trips go through /bland:* commands, gated on validate_pathway.",
		"Pathway commands: /bland:norm <request> (orchestrate via the norm agent), /bland:clone (list pathways), /bland:clone <pathway_id|new <name>>, /bland:validate, /bland:test [node], /bland:commit, /bland:status [--server|--check].",
		"Skills load on demand for everything else: analytics (metrics, citation schemas, dashboards), evals (LLM judges + scorecards), call-review (inspect a real call), debug (systematic root-cause), tools (custom REST/code tools), persona (voices + call config), knowledge (knowledge bases), automations (event-driven triggers), triage (issue tracking), api (raw docs-first REST calls), setup (auth + server target), pathways (the workspace file model).",
		"Convergence: /bland:loop <pathway_id> (--from-call <id> | --transcript <file> | --goal '<objective>') — keeps editing + re-testing the pathway until it passes the target; an evaluator-optimizer loop gated by the Stop hook until it converges, hits max iterations, or stalls.",
		"Environment self-test: /bland:status --check — verify the MCP connection, namespace, config, and every read surface in THIS environment (run after install, key/server switches, or on a new machine).",
		"Start real pathway work by cloning a workspace: /bland:clone <pathway_id> to edit, or /bland:clone new <name> to create.",
	];

	let workspaceNote = "No pathway workspace detected in the current directory tree. Run /bland:clone to list pathways, then /bland:clone <pathway_id> to begin.";
	try {
		const ws = findWorkspaceDir();
		if (ws) {
			workspaceNote = `A pathway workspace appears to be mounted at ${ws}. Run /bland:status to check version and drift before editing.`;
		}
	} catch {
		/* fail soft */
	}
	lines.push(workspaceNote);

	// DEV MODE banner: offline read of the documented userConfig location — the URL
	// only, never the key. Fail-soft: any error means no banner.
	try {
		const fs = require("node:fs");
		const os = require("node:os");
		const path = require("node:path");
		const settings = JSON.parse(
			fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8"),
		);
		const configs = (settings && settings.pluginConfigs) || {};
		// Non-canonical installs register under a different bland@* id; pre-2.0
		// installs under norm@*.
		const id =
			(configs["bland@bland"] && "bland@bland") ||
			Object.keys(configs).find((k) => k.startsWith("bland@")) ||
			Object.keys(configs).find((k) => k.startsWith("norm@"));
		const url = id && configs[id].options && configs[id].options.bland_api_url;
		if (url && !/^https:\/\/api\.bland\.ai\/?$/.test(url)) {
			lines.push(
				`Note: the Bland MCP connection points at ${url} (not production). ` +
					"The debug skill gains the full code-fix loop when that server's codebase is in the working tree. " +
					"Switch back with `node ${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs --prod` (restart required; see the setup skill).",
			);
		}
	} catch {
		/* fail soft — no banner */
	}

	const context = lines.join("\n");

	try {
		process.stdout.write(
			`${JSON.stringify({
				hookSpecificOutput: {
					hookEventName: "SessionStart",
					additionalContext: context,
				},
			})}\n`,
		);
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
