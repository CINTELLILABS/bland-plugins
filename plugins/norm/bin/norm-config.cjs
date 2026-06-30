#!/usr/bin/env node
"use strict";

/**
 * Bland Norm — config writer/reader for Claude Code settings.json.
 *
 * Why this exists
 * ---------------
 * The Claude DESKTOP app does NOT prompt for a plugin's userConfig at install
 * time (claude-code#39455), and its "Configure options" UI has a persistence bug
 * (#62442) plus a validator that rejects any URL not starting with "https" — so a
 * user can't point Norm at http://localhost:3000 for dev, and even a valid key may
 * not persist. The result: a freshly installed plugin has no credentials and the
 * native UI can't supply them.
 *
 * The fix: write the config to a FILE directly. Claude Code reads plugin userConfig
 * from ~/.claude/settings.json under:
 *
 *     pluginConfigs["<plugin>@<marketplace>"].options.<key>
 *
 * That exact path is read by BOTH (a) the MCP client's ${user_config.*}
 * substitution in .mcp.json and (b) this plugin's bin/_credentials.cjs resolver.
 * So one write here onboards the desktop user end-to-end, bypassing #39455,
 * #62442, and the https-only validator (the validator only lives in the native UI;
 * a file write is unvalidated, and the bin resolver does not enforce https either).
 *
 * This is intentionally ZERO-dependency and self-contained so it can run as the
 * single allowed Bash command of the /norm:setup slash command.
 *
 * Config target
 * -------------
 *   plugin id      : "norm@bland"   (marketplace name "bland", plugin name "norm")
 *   settings file  : $CLAUDE_CONFIG_DIR/settings.json, else ~/.claude/settings.json
 *   write path     : pluginConfigs["norm@bland"].options.{bland_api_url,bland_api_key}
 *   also sets      : enabledPlugins["norm@bland"] = true
 *
 * Commands
 * --------
 *   set   --key <K> [--url <U> | --dev | --prod]   (key may also arrive on stdin)
 *   get                                            (prints url + key_resolved, NEVER the key)
 *   status                                         (alias of get)
 *   clear                                          (removes the options + the key)
 *
 * Safety
 * ------
 *   - The API key is NEVER printed to stdout/stderr by any command.
 *   - Writes MERGE into the existing settings file: other plugins, env, permissions,
 *     and any other top-level keys are preserved verbatim.
 *   - The settings file is written with mode 0600 (user-only).
 *   - Honors CLAUDE_CONFIG_DIR so tests can target a temp dir, never the real file.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PLUGIN_ID = "norm@bland";
const KEY_FIELD = "bland_api_key";
const URL_FIELD = "bland_api_url";
const PROD_URL = "https://api.bland.ai";
const DEV_URL = "http://localhost:3000";

function emit(obj) {
	process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function fail(message, extra) {
	emit({ ok: false, error: message, ...(extra || {}) });
	process.exit(1);
}

/** Resolve the settings.json path, honoring CLAUDE_CONFIG_DIR (used by tests). */
function settingsPath() {
	const dir = process.env.CLAUDE_CONFIG_DIR
		? process.env.CLAUDE_CONFIG_DIR
		: path.join(os.homedir(), ".claude");
	return path.join(dir, "settings.json");
}

/** Read + parse settings.json. Missing file => {}. Corrupt file => hard error
 *  (we must not clobber a file we can't safely merge into). */
function readSettings(file) {
	let raw;
	try {
		raw = fs.readFileSync(file, "utf8");
	} catch (err) {
		if (err && err.code === "ENOENT") return {};
		throw err;
	}
	if (!raw.trim()) return {};
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed;
		}
		throw new Error("settings.json is not a JSON object");
	} catch (err) {
		throw new Error(
			`Refusing to overwrite unparseable settings.json (${err.message}). Fix or remove ${file} and retry.`,
		);
	}
}

/** Atomically write settings.json with mode 0600, creating the dir if needed. */
function writeSettings(file, settings) {
	const dir = path.dirname(file);
	fs.mkdirSync(dir, { recursive: true });
	const body = `${JSON.stringify(settings, null, 2)}\n`;
	const tmp = path.join(
		dir,
		`.settings.json.norm-config.${process.pid}.${Date.now()}.tmp`,
	);
	fs.writeFileSync(tmp, body, { mode: 0o600 });
	fs.renameSync(tmp, file);
	// Ensure perms even if the file pre-existed with looser perms.
	try {
		fs.chmodSync(file, 0o600);
	} catch {
		/* best effort */
	}
}

function getFlag(argv, name) {
	const i = argv.indexOf(name);
	return i !== -1 && i + 1 < argv.length && !argv[i + 1].startsWith("--")
		? argv[i + 1]
		: null;
}

function hasFlag(argv, name) {
	return argv.includes(name);
}

/** Read the key from stdin if piped (non-TTY). Returns "" if nothing piped. */
function readStdinKey() {
	try {
		if (process.stdin.isTTY) return "";
		const data = fs.readFileSync(0, "utf8");
		return (data || "").trim();
	} catch {
		return "";
	}
}

/** Lightly validate the URL: must be http(s) with a host. Returns normalized
 *  (trailing slashes stripped) or null. */
function normalizeUrl(url) {
	if (!url || typeof url !== "string") return null;
	let u;
	try {
		u = new URL(url.trim());
	} catch {
		return null;
	}
	if (u.protocol !== "http:" && u.protocol !== "https:") return null;
	if (!u.host) return null;
	return url.trim().replace(/\/+$/, "");
}

/** The plugin's .mcp.json lives at the plugin root, one level up from bin/. */
function mcpJsonPath() {
	return path.join(__dirname, "..", ".mcp.json");
}

/**
 * Make the NATIVE MCP connector fully SELF-CONTAINED for the desktop app, which
 * substitutes NOTHING in a plugin connector — not the url, not the auth header
 * (it even validates the literal url, rejecting non-https and the raw ${...}
 * template). So we bake BOTH literals into the INSTALLED .mcp.json:
 *   mcpServers.bland.url                     = <baseUrl>/v1/mcp
 *   mcpServers.bland.headers.Authorization   = Bearer <key>
 * Now the connector connects with zero substitution, no install prompt, and no
 * Configure-options UI. Only the installed copy gets the literal key; the
 * committed source keeps the ${user_config.*} template. The file is written 0600
 * because it now contains the key. A plain-http url is written but the desktop
 * still won't connect it (https-only) — use an https tunnel for a dev connector.
 * Returns {updated, changed, url}; `changed` => a reload is needed to apply it.
 */
function updateMcpConnector(baseUrl, key) {
	const file = mcpJsonPath();
	let mcp;
	try {
		mcp = JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return { updated: false, changed: false, url: null };
	}
	const server = mcp && mcp.mcpServers && mcp.mcpServers.bland;
	if (!server || typeof server !== "object") {
		return { updated: false, changed: false, url: null };
	}
	const newUrl = `${baseUrl.replace(/\/+$/, "")}/v1/mcp`;
	const newAuth = `Bearer ${key}`;
	server.headers =
		server.headers && typeof server.headers === "object" ? server.headers : {};
	const changed =
		server.url !== newUrl || server.headers.Authorization !== newAuth;
	server.url = newUrl;
	server.headers.Authorization = newAuth;
	if (changed) {
		try {
			fs.writeFileSync(file, `${JSON.stringify(mcp, null, 2)}\n`, {
				mode: 0o600,
			});
			// writeFileSync's mode only applies on create; force 0600 on the
			// pre-existing file too, since it now holds the literal key.
			try {
				fs.chmodSync(file, 0o600);
			} catch {
				/* best effort */
			}
		} catch {
			return { updated: false, changed: false, url: newUrl };
		}
	}
	return { updated: true, changed, url: newUrl };
}

function cmdSet(argv) {
	// Key precedence: explicit --key flag, else first non-flag positional, else stdin.
	let key = getFlag(argv, "--key");
	if (!key) {
		const positional = argv.find((a, idx) => {
			if (a.startsWith("--")) return false;
			// skip the value of a preceding --flag
			const prev = argv[idx - 1];
			return !(prev && prev.startsWith("--"));
		});
		if (positional) key = positional;
	}
	if (!key) key = readStdinKey();
	key = (key || "").trim();

	// Guard against obvious accidents (e.g. a flag name slipping in as the key).
	if (key && key.startsWith("--")) {
		fail("API key looks like a flag; pass the real key value.");
	}

	// URL precedence: --dev / --prod / --url <U> ; default = keep existing or prod.
	let urlChoice = null;
	if (hasFlag(argv, "--dev") && hasFlag(argv, "--prod")) {
		fail("Pass only one of --dev or --prod.");
	}
	if (hasFlag(argv, "--dev")) urlChoice = DEV_URL;
	else if (hasFlag(argv, "--prod")) urlChoice = PROD_URL;
	else {
		const explicit = getFlag(argv, "--url");
		if (explicit) {
			const normalized = normalizeUrl(explicit);
			if (!normalized) {
				fail(
					`Invalid --url ${JSON.stringify(explicit)}. Must be a full http(s) URL, e.g. https://api.bland.ai or http://localhost:3000.`,
				);
			}
			urlChoice = normalized;
		}
	}

	const file = settingsPath();
	let settings;
	try {
		settings = readSettings(file);
	} catch (err) {
		fail(err.message);
	}

	// Merge — preserve every other key.
	if (!settings.pluginConfigs || typeof settings.pluginConfigs !== "object") {
		settings.pluginConfigs = {};
	}
	if (
		!settings.pluginConfigs[PLUGIN_ID] ||
		typeof settings.pluginConfigs[PLUGIN_ID] !== "object"
	) {
		settings.pluginConfigs[PLUGIN_ID] = {};
	}
	const entry = settings.pluginConfigs[PLUGIN_ID];
	if (!entry.options || typeof entry.options !== "object") {
		entry.options = {};
	}

	// Key: provided > existing. Lets `set --url <X>` switch envs without
	// re-pasting the key. Fail only if there is no key anywhere.
	const finalKey =
		key ||
		(typeof entry.options[KEY_FIELD] === "string"
			? entry.options[KEY_FIELD].trim()
			: "");
	if (!finalKey) {
		fail(
			"No API key provided and none stored. Pass `set --key <KEY>` (or a positional/stdin) the first time. The key is never printed.",
		);
	}

	// Resolve final URL: explicit choice > existing value > prod default.
	const finalUrl =
		urlChoice || normalizeUrl(entry.options[URL_FIELD]) || PROD_URL;

	entry.options[URL_FIELD] = finalUrl;
	entry.options[KEY_FIELD] = finalKey;

	// Make sure the plugin is enabled so the MCP client/loads it.
	if (!settings.enabledPlugins || typeof settings.enabledPlugins !== "object") {
		settings.enabledPlugins = {};
	}
	settings.enabledPlugins[PLUGIN_ID] = true;

	try {
		writeSettings(file, settings);
	} catch (err) {
		fail(`Failed to write settings: ${err.message}`);
	}

	// Make the native MCP connector self-contained: bake the literal url AND key
	// into .mcp.json (the desktop substitutes neither). Needs a reload to apply.
	const connector = updateMcpConnector(finalUrl, finalKey);

	emit({
		ok: true,
		action: "set",
		plugin_id: PLUGIN_ID,
		settings_path: file,
		api_url: finalUrl,
		connector_url: connector.url,
		connector_updated: connector.updated,
		reload_needed: connector.changed,
		key_written: true,
		is_dev: finalUrl === DEV_URL || /localhost|127\.0\.0\.1/.test(finalUrl),
	});
}

function cmdGet() {
	const file = settingsPath();
	let settings;
	try {
		settings = readSettings(file);
	} catch (err) {
		fail(err.message);
	}
	const options =
		(settings.pluginConfigs &&
			settings.pluginConfigs[PLUGIN_ID] &&
			settings.pluginConfigs[PLUGIN_ID].options) ||
		{};
	const url = normalizeUrl(options[URL_FIELD]) || options[URL_FIELD] || null;
	const key =
		typeof options[KEY_FIELD] === "string" ? options[KEY_FIELD].trim() : "";
	const enabled = Boolean(
		settings.enabledPlugins && settings.enabledPlugins[PLUGIN_ID],
	);
	emit({
		ok: true,
		action: "get",
		plugin_id: PLUGIN_ID,
		settings_path: file,
		exists: fs.existsSync(file),
		enabled,
		api_url: url,
		key_resolved: Boolean(key),
		// length only — never the key itself
		key_len: key.length,
	});
}

function cmdClear() {
	const file = settingsPath();
	let settings;
	try {
		settings = readSettings(file);
	} catch (err) {
		fail(err.message);
	}
	let changed = false;
	if (
		settings.pluginConfigs &&
		settings.pluginConfigs[PLUGIN_ID] &&
		settings.pluginConfigs[PLUGIN_ID].options
	) {
		const opts = settings.pluginConfigs[PLUGIN_ID].options;
		if (KEY_FIELD in opts) {
			delete opts[KEY_FIELD];
			changed = true;
		}
		if (URL_FIELD in opts) {
			delete opts[URL_FIELD];
			changed = true;
		}
		// Tidy up empty containers we created.
		if (Object.keys(opts).length === 0) {
			delete settings.pluginConfigs[PLUGIN_ID].options;
		}
		if (Object.keys(settings.pluginConfigs[PLUGIN_ID]).length === 0) {
			delete settings.pluginConfigs[PLUGIN_ID];
		}
		if (Object.keys(settings.pluginConfigs).length === 0) {
			delete settings.pluginConfigs;
		}
	}
	if (changed) {
		try {
			writeSettings(file, settings);
		} catch (err) {
			fail(`Failed to write settings: ${err.message}`);
		}
	}
	emit({
		ok: true,
		action: "clear",
		plugin_id: PLUGIN_ID,
		settings_path: file,
		cleared: changed,
	});
}

function main() {
	const argv = process.argv.slice(2);
	const cmd = (argv[0] || "").toLowerCase();
	const rest = argv.slice(1);
	switch (cmd) {
		case "set":
			return cmdSet(rest);
		case "get":
		case "status":
			return cmdGet();
		case "clear":
			return cmdClear();
		default:
			fail(
				`Unknown command ${JSON.stringify(cmd || "(none)")}. Usage: norm-config.cjs set --key <K> [--url <U>|--dev|--prod] | get | clear`,
			);
	}
}

main();
