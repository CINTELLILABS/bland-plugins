#!/usr/bin/env node
"use strict";

/**
 * Norm v2 — SessionStart hook (offline orientation).
 *
 * The `norm` plugin name changed meaning at 2.0.0 of the marketplace's v1
 * plugin: `norm` 1.x (up to 1.13.x) was the v1 pathway plugin and shipped
 * /norm:clone, /norm:commit, /norm:loop, ...; that plugin is now `bland@bland`
 * (/bland:*). THIS `norm` is the v2-only agent plugin. A user who updated from
 * the old `norm` lands here with their v1 commands gone and no explanation, so
 * tell them where those commands went — only when `bland@bland` is NOT also
 * installed (if it is, the v1 commands are present and nothing moved for them).
 *
 * OFFLINE and FAIL-SOFT: no network, never reads secrets, always exits 0.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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

/** True when a `bland@*` plugin (the v1 pathway plugin) is installed. */
function v1PluginInstalled() {
	try {
		const raw = fs.readFileSync(
			path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json"),
			"utf8",
		);
		const parsed = JSON.parse(raw);
		const plugins = (parsed && parsed.plugins) || parsed || {};
		return Object.keys(plugins).some((id) => id.startsWith("bland@"));
	} catch {
		return false;
	}
}

async function main() {
	try {
		const raw = await readStdin();
		if (raw && raw.trim()) JSON.parse(raw);
	} catch {
		/* fail soft */
	}

	const lines = [
		"Norm v2 plugin active (v2 agents only): /norm:build <request>, /norm:migrate <pathway_id>, /norm:validate <snapshot.json>, /norm:simulate. Agents are authored and pushed as raw snapshot JSON — there is no commit command and no file codec.",
	];
	if (!v1PluginInstalled()) {
		lines.push(
			"v1 pathway commands are NOT in this plugin. If you previously used /norm:clone, /norm:commit, /norm:loop, /norm:test or /norm:status, those moved to the `bland` plugin as /bland:* — install it with `/plugin install bland@bland` and configure the key with `/plugin configure bland@bland`.",
		);
	}

	try {
		process.stdout.write(
			`${JSON.stringify({
				hookSpecificOutput: {
					hookEventName: "SessionStart",
					additionalContext: lines.join("\n"),
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
