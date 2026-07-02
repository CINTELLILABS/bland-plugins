#!/usr/bin/env node
"use strict";

/**
 * Bland Norm — SessionStart hook (offline orientation).
 *
 * Prints a short orientation banner so the session knows the Norm workflow and
 * which /norm:* commands exist. This is OFFLINE: it makes no network calls and
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
		"Bland Norm active.",
		"Workflow: ALL pathway surfaces are edited natively in the workspace files — prose (node.md / condition.md / edge labels / global_prompt.md) and structured YAML (variables / model / tools / unit-tests; check shapes with get_pathway_schema, deep semantics with get_pathway_context); server round-trips go through /norm:* commands, gated on validate_pathway.",
		"Pathway commands: /norm:norm (orchestrate via super_norm), /norm:list, /norm:clone <pathway_id|new>, /norm:validate, /norm:test [node], /norm:commit, /norm:status.",
		"Build other parts: /norm:evals (build + run evals), /norm:review (mount + inspect real calls), /norm:tools (custom REST/code tools), /norm:persona (voices + personas + linking), /norm:knowledge (knowledge bases), /norm:triage (issue tracking), /norm:analytics (call analytics + reports).",
		"Raw API: /norm:api — hyper-focused raw Bland REST API usage guided by the docs (docs tools + a loopback caller only, none of the high-level tools).",
		"Debugging: /norm:debug — systematic reproduce → isolate → fix → verify for anything misbehaving (tools, endpoints, webhooks, widgets); fixes pathway/config for everyone, and code too when a server codebase is in the working tree.",
		"Convergence: /norm:loop <pathway_id> (--from-call <id> | --transcript <file> | --goal '<objective>') — keeps editing + re-testing the pathway until it passes the target; an evaluator-optimizer loop gated by the Stop hook until it converges, hits max iterations, or stalls.",
		"Start real pathway work by cloning a workspace: /norm:clone <pathway_id> to edit, or /norm:clone new to create.",
	];

	let workspaceNote = "No pathway workspace detected in the current directory tree. Run /norm:list then /norm:clone to begin.";
	try {
		const ws = findWorkspaceDir();
		if (ws) {
			workspaceNote = `A pathway workspace appears to be mounted at ${ws}. Run /norm:status to check version and drift before editing.`;
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
		const url =
			settings &&
			settings.pluginConfigs &&
			settings.pluginConfigs["norm@bland"] &&
			settings.pluginConfigs["norm@bland"].options &&
			settings.pluginConfigs["norm@bland"].options.bland_api_url;
		if (url && !/^https:\/\/api\.bland\.ai\/?$/.test(url)) {
			lines.push(
				`Note: the Bland MCP connection points at ${url} (not production). ` +
					"/norm:debug gains the full code-fix loop when that server's codebase is in the working tree. " +
					"Switch back with /norm:config --prod (restart required).",
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
