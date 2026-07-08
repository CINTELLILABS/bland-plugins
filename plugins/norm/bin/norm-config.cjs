#!/usr/bin/env node
"use strict";
/**
 * norm-config — show or switch the plugin's Bland API URL without reinstalling.
 *
 * Edits the DOCUMENTED non-sensitive userConfig storage —
 * `~/.claude/settings.json` → pluginConfigs["norm@bland"].options.bland_api_url —
 * the same place the interactive install writes it and `${user_config.bland_api_url}`
 * in .mcp.json reads it. The API key is NOT touched: it lives in the OS keychain
 * (`sensitive: true`) and survives URL switches and reinstalls.
 *
 *   node norm-config.cjs                 → show current url (+ whether a key exists)
 *   node norm-config.cjs <https-url>     → set bland_api_url
 *   node norm-config.cjs --prod          → set https://api.bland.ai
 *   node norm-config.cjs --clear         → remove the override (fall back to default)
 *
 * Prints JSON. Never prints, reads, or stores the API key. A session restart is
 * required after a change (the MCP client resolves userConfig at connect time).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
const PLUGIN_ID = "norm@bland";
const PROD_URL = "https://api.bland.ai";

function fail(msg) {
  console.log(JSON.stringify({ ok: false, error: msg }));
  process.exit(1);
}

let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
} catch (err) {
  if (err.code !== "ENOENT") fail(`Could not read ${SETTINGS}: ${err.message}`);
}

const configs = settings.pluginConfigs || {};
// Non-canonical installs (zip / local marketplace mirror) register under a
// different qualified id (e.g. "norm@bland-local"): target whichever norm@*
// entry already exists so we edit the config the MCP client actually reads.
const existingId =
	(configs[PLUGIN_ID] && PLUGIN_ID) ||
	Object.keys(configs).find((id) => id.startsWith("norm@")) ||
	PLUGIN_ID;
const entry = configs[existingId] || {};
const options = entry.options || {};

const arg = process.argv[2];

if (!arg) {
  console.log(
    JSON.stringify({
      ok: true,
      action: "show",
      bland_api_url: options.bland_api_url || `(default: ${PROD_URL})`,
      api_key: "stored separately (OS keychain, sensitive) — never shown here",
      note: "Pass a https URL, --prod, or --clear to switch. Restart the session after a change.",
    }),
  );
  process.exit(0);
}

let action;
if (arg === "--clear") {
  delete options.bland_api_url;
  action = "cleared (falls back to plugin default)";
} else {
  const url = arg === "--prod" ? PROD_URL : arg.replace(/\/+$/, "");
  // https everywhere, EXCEPT plain-http localhost/127.0.0.1 — Claude's HTTP-MCP
  // client supports local http servers, which is the whole point of dev mode.
  const isLocalHttp = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url);
  if (!isLocalHttp && !/^https:\/\/[^\s/]+/.test(url)) {
    fail(
      `Not a usable URL: ${arg}. Remote servers need https (use a tunnel); plain http is allowed only for http://localhost[:port].`,
    );
  }
  options.bland_api_url = url;
  action = `set bland_api_url = ${url}`;
}

entry.options = options;
configs[existingId] = entry;
settings.pluginConfigs = configs;

const tmp = `${SETTINGS}.tmp-${process.pid}`;
fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(tmp, SETTINGS);

console.log(
  JSON.stringify({
    ok: true,
    action,
    restart_required: true,
    note: "Restart the Claude session so the Bland MCP client reconnects with the new URL.",
  }),
);
