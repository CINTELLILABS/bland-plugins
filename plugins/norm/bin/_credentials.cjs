#!/usr/bin/env node
"use strict";

/**
 * Bland Norm — shared credential resolver for the bin scripts.
 *
 * Claude Code injects the plugin's userConfig (bland_api_key / bland_api_url)
 * into the MCP client via `.mcp.json` ${user_config.*} substitution, but it does
 * NOT put it in the env of Bash tool calls made by the plugin's agents/commands.
 * So scripts that read process.env alone fail with "no API key" when run by an
 * agent. This resolver layers three sources, in order:
 *
 *   1. process.env (BLAND_API_KEY / CLAUDE_PLUGIN_OPTION_bland_api_key, + _url)
 *   2. the persisted Claude config files where userConfig actually lives
 *      (~/.claude/settings.json etc.) — same place the MCP client reads from
 *   3. sensible defaults (prod base URL)
 *
 * The key is resolved and used for auth; it is NEVER printed or returned by any
 * caller's stdout. Fail-soft: unreadable/missing config files are ignored.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function deepFind(obj, key, seen) {
	if (!obj || typeof obj !== "object") return null;
	seen = seen || new Set();
	if (seen.has(obj)) return null;
	seen.add(obj);
	if (
		Object.prototype.hasOwnProperty.call(obj, key) &&
		typeof obj[key] === "string" &&
		obj[key].trim()
	) {
		return obj[key];
	}
	for (const v of Object.values(obj)) {
		const r = deepFind(v, key, seen);
		if (r) return r;
	}
	return null;
}

function fromConfigFiles(key) {
	const home = os.homedir();
	const candidates = [
		process.env.CLAUDE_CONFIG_DIR
			? path.join(process.env.CLAUDE_CONFIG_DIR, "settings.json")
			: null,
		path.join(home, ".claude", "settings.json"),
		path.join(home, ".claude", "settings.local.json"),
		path.join(home, ".claude.json"),
	].filter(Boolean);
	for (const f of candidates) {
		try {
			const v = deepFind(JSON.parse(fs.readFileSync(f, "utf8")), key);
			if (v) return v;
		} catch {
			/* missing/unreadable/invalid — try the next */
		}
	}
	return null;
}

function resolveCredentials() {
	const apiKey =
		process.env.BLAND_API_KEY ||
		process.env.CLAUDE_PLUGIN_OPTION_bland_api_key ||
		fromConfigFiles("bland_api_key") ||
		"";
	const apiUrl = (
		process.env.BLAND_API_URL ||
		process.env.CLAUDE_PLUGIN_OPTION_bland_api_url ||
		fromConfigFiles("bland_api_url") ||
		"https://api.bland.ai"
	).replace(/\/+$/, "");
	return { apiKey, apiUrl };
}

module.exports = { resolveCredentials };

// Allow a direct smoke test that never prints the key: `node _credentials.cjs --check`
if (require.main === module && process.argv.includes("--check")) {
	const { apiKey, apiUrl } = resolveCredentials();
	process.stdout.write(
		`${JSON.stringify({ key_resolved: Boolean(apiKey), key_len: apiKey.length, api_url: apiUrl })}\n`,
	);
}
