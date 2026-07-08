#!/usr/bin/env node
"use strict";

/**
 * Bland Norm — credential resolver for the DESKTOP STDIO BRIDGE ONLY.
 *
 * Used exclusively by bland-mcp-proxy.cjs / bland-mcp-desktop (the stdio↔HTTP
 * bridge for the Claude Desktop app). It is NOT used by any command or agent body
 * anymore: all command/agent server I/O goes through the MCP passthrough
 * (mcp__bland__bland_api_get / call_bland_api), where the MCP connection holds the
 * key. The offline norm-sync.cjs codec does NOT require this file. (The desktop app
 * does not pass plugin userConfig env to a launched stdio server, so the bridge
 * still needs to resolve the key from persisted config — hence this resolver.)
 *
 * Claude Code injects the plugin's userConfig (bland_api_key / bland_api_url)
 * into the MCP client via `.mcp.json` ${user_config.*} substitution, but it does
 * NOT put it in the env of Bash tool calls made by the plugin's agents/commands.
 * So scripts that read process.env alone fail with "no API key" when run by an
 * agent. Onboarding can also land the key in a few different places depending on
 * platform and which desktop/CLI bug bit the user. This resolver checks EVERY
 * place onboarding might land the key/url, in priority order:
 *
 *   1. process.env (BLAND_API_KEY / CLAUDE_PLUGIN_OPTION_bland_api_key, + _url)
 *   2. the EXACT design config path in settings.json:
 *      pluginConfigs["norm@bland"].options.bland_api_key / .bland_api_url
 *      (the URL lives here; the KEY is keychain-stored for a sensitive option —
 *      this exact path is still checked first for a plaintext override, so a
 *      stray top-level key or a sibling plugin like "norm@bland-local" can't win)
 *   3. recursive find of the key anywhere in those same settings.json files
 *      (backward-compat with older configs)
 *   4. ~/.claude/.credentials.json — the sensitive-userConfig fallback file
 *      (exact nested path first, then recursive find)
 *   5. (macOS only, key only) the login keychain via `security find-generic-password`
 *      — best-effort over the service/account names Claude Code plausibly uses
 *      for a sensitive plugin option; never errors if absent
 *   6. sensible defaults (prod base URL)
 *
 * The key is resolved and used for auth; it is NEVER printed or returned by any
 * caller's stdout. Fail-soft throughout: unreadable/missing config files, an
 * absent `security` binary, or a non-zero keychain lookup are all ignored.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// The marketplace+plugin id this plugin is USUALLY published under. Installs from
// a zip / local marketplace mirror get a DIFFERENT qualified id (e.g.
// "norm@bland-local"), so nothing below may assume this exact id — resolution
// prefers it but falls back to any pluginConfigs entry whose id starts with
// "norm@" (and finally any entry that actually carries our option keys).
const PLUGIN_ID = "norm@bland";
const KEY_OPTION = "bland_api_key";
const URL_OPTION = "bland_api_url";
const DEFAULT_API_URL = "https://api.bland.ai";

function nonEmptyString(v) {
	return typeof v === "string" && v.trim() ? v : null;
}

/** Recursively find the first non-empty string value stored under `key`. */
function deepFind(obj, key, seen) {
	if (!obj || typeof obj !== "object") return null;
	seen = seen || new Set();
	if (seen.has(obj)) return null;
	seen.add(obj);
	if (Object.prototype.hasOwnProperty.call(obj, key)) {
		const direct = nonEmptyString(obj[key]);
		if (direct) return direct;
	}
	for (const v of Object.values(obj)) {
		const r = deepFind(v, key, seen);
		if (r) return r;
	}
	return null;
}

/**
 * Read the design path root.pluginConfigs[<id>].options[option] — trying the
 * canonical id first, then any "norm@*" install id (zip / local-marketplace
 * mirrors register under a different qualified id), then any entry that carries
 * our option keys at all. Fixes the silent-empty-credentials failure on
 * non-canonical installs (field-reported).
 */
function exactPluginOption(root, option) {
	const configs = root && root.pluginConfigs;
	if (!configs || typeof configs !== "object") return null;
	const ids = [
		PLUGIN_ID,
		...Object.keys(configs).filter(
			(id) => id !== PLUGIN_ID && id.startsWith("norm@"),
		),
		...Object.keys(configs).filter((id) => !id.startsWith("norm@")),
	];
	for (const id of ids) {
		const opts = configs[id] && configs[id].options;
		if (!opts) continue;
		// Non-norm ids only count when they demonstrably hold OUR config shape.
		if (!id.startsWith("norm@") && !(KEY_OPTION in opts || URL_OPTION in opts))
			continue;
		const v = nonEmptyString(opts[option]);
		if (v) return v;
	}
	return null;
}

/**
 * The settings.json files to consult, most-specific first.
 *
 * When CLAUDE_CONFIG_DIR is set we use ONLY that directory — isolation for tests
 * and alternate config homes. (Previously this always also probed ~/.claude,
 * so isolation silently leaked into the real config.)
 */
function settingsCandidates() {
	if (process.env.CLAUDE_CONFIG_DIR) {
		const dir = process.env.CLAUDE_CONFIG_DIR;
		return [
			path.join(dir, "settings.json"),
			path.join(dir, "settings.local.json"),
		];
	}
	const home = os.homedir();
	return [
		path.join(home, ".claude", "settings.json"),
		path.join(home, ".claude", "settings.local.json"),
		path.join(home, ".claude.json"),
	];
}

/** The sensitive-userConfig fallback credentials file (same dir as settings). */
function credentialsCandidates() {
	if (process.env.CLAUDE_CONFIG_DIR) {
		return [path.join(process.env.CLAUDE_CONFIG_DIR, ".credentials.json")];
	}
	return [path.join(os.homedir(), ".claude", ".credentials.json")];
}

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return null; // missing/unreadable/invalid — caller falls through
	}
}

/**
 * Resolve `option` from the persisted config files. For each settings file we
 * prefer the EXACT design path, then fall back to a recursive find within that
 * same file (so the most-specific source always wins before we widen). After
 * settings we try .credentials.json the same way (exact path, then recursive).
 */
function fromConfigFiles(option) {
	for (const f of settingsCandidates()) {
		const root = readJson(f);
		if (!root) continue;
		const exact = exactPluginOption(root, option);
		if (exact) return exact;
		const found = deepFind(root, option);
		if (found) return found;
	}
	for (const f of credentialsCandidates()) {
		const root = readJson(f);
		if (!root) continue;
		const exact = exactPluginOption(root, option);
		if (exact) return exact;
		const found = deepFind(root, option);
		if (found) return found;
	}
	return null;
}

/**
 * macOS keychain best-effort lookup for the API KEY only (url is never stored
 * in the keychain). Claude Code stores sensitive plugin options in the login
 * keychain, but the exact service/account scheme is not publicly documented and
 * a known bug (#62442) frequently drops them entirely — so this is a last-resort
 * fallback that tries the plausible naming combinations and stays silent on any
 * failure. Returns null off-darwin, if `security` is unavailable, or if no entry
 * matches.
 */
function fromKeychain(option) {
	if (process.platform !== "darwin") return null;
	const services = ["Claude Code-credentials", "Claude Code", PLUGIN_ID];
	const accounts = [
		option, // bland_api_key
		`${PLUGIN_ID}:${option}`, // norm@bland:bland_api_key
		`${PLUGIN_ID}.${option}`, // norm@bland.bland_api_key
		PLUGIN_ID, // norm@bland
	];
	for (const service of services) {
		for (const account of accounts) {
			try {
				const out = execFileSync(
					"security",
					["find-generic-password", "-s", service, "-a", account, "-w"],
					{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
				);
				const v = nonEmptyString(out.replace(/\r?\n$/, ""));
				if (v) return v;
			} catch {
				/* no such entry / no security binary — try the next combination */
			}
		}
	}
	return null;
}

function resolveCredentials() {
	const apiKey =
		nonEmptyString(process.env.BLAND_API_KEY) ||
		nonEmptyString(process.env.CLAUDE_PLUGIN_OPTION_bland_api_key) ||
		fromConfigFiles(KEY_OPTION) ||
		fromKeychain(KEY_OPTION) ||
		"";
	const apiUrl = (
		nonEmptyString(process.env.BLAND_API_URL) ||
		nonEmptyString(process.env.CLAUDE_PLUGIN_OPTION_bland_api_url) ||
		fromConfigFiles(URL_OPTION) ||
		DEFAULT_API_URL
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
