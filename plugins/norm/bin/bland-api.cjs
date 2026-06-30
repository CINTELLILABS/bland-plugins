#!/usr/bin/env node
"use strict";

/**
 * Bland Norm — raw Bland API caller ("loopback").
 *
 * Hyper-focused: make ONE raw HTTP request to the Bland REST API and print the
 * JSON response. This is the ONLY non-docs tool the /norm:api skill needs — it
 * keeps raw-API work out of the 200+ high-level Bland MCP tools. The base URL and
 * API key come from the environment (the same userConfig the plugin already
 * collects); the key is NEVER printed.
 *
 * Usage:
 *   bland-api <METHOD> <path> [--body '<json>'] [--query '<json>']
 * Examples:
 *   node bland-api.cjs GET  /v1/me
 *   node bland-api.cjs GET  /v1/calls --query '{"limit":5}'
 *   node bland-api.cjs POST /v1/calls --body '{"phone_number":"+15551234567","task":"..."}'
 *
 * Output (stdout, JSON): { ok, status, method, url, response }
 */

const argv = process.argv.slice(2);

function emit(o) {
	process.stdout.write(`${JSON.stringify(o, null, 2)}\n`);
}
function flagValue(name) {
	const i = argv.indexOf(name);
	return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}

const method = (argv[0] || "").toUpperCase();
const rawPath = argv[1] && !argv[1].startsWith("--") ? argv[1] : "";

const { resolveCredentials } = require("./_credentials.cjs");
const { apiKey: key, apiUrl: base } = resolveCredentials();

if (!method || !rawPath) {
	emit({
		ok: false,
		error: "usage: bland-api <METHOD> <path> [--body '<json>'] [--query '<json>']",
	});
	process.exit(1);
}
if (!key) {
	emit({
		ok: false,
		error: "No Bland API key found. Set BLAND_API_KEY / CLAUDE_PLUGIN_OPTION_bland_api_key, or configure bland_api_key in the plugin (also read from ~/.claude/settings.json).",
	});
	process.exit(1);
}

let url = base + (rawPath.startsWith("/") ? rawPath : `/${rawPath}`);

const queryRaw = flagValue("--query");
if (queryRaw != null) {
	let q;
	try {
		q = JSON.parse(queryRaw);
	} catch {
		emit({ ok: false, error: "--query must be a JSON object string" });
		process.exit(1);
	}
	const usp = new URLSearchParams();
	for (const [k, v] of Object.entries(q || {})) usp.set(k, String(v));
	const qs = usp.toString();
	if (qs) url += (url.includes("?") ? "&" : "?") + qs;
}

const bodyRaw = flagValue("--body");
let body;
if (bodyRaw != null) {
	try {
		body = JSON.parse(bodyRaw);
	} catch {
		emit({ ok: false, error: "--body must be a JSON object string" });
		process.exit(1);
	}
}

// Bland REST auth mirrors the MCP transport: Authorization: Bearer <key>.
const authHeader = /^bearer\s/i.test(key) ? key : `Bearer ${key}`;

(async () => {
	let resp;
	try {
		resp = await fetch(url, {
			method,
			headers: {
				accept: "application/json",
				authorization: authHeader,
				...(body !== undefined ? { "content-type": "application/json" } : {}),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
	} catch (err) {
		emit({
			ok: false,
			method,
			url,
			error: `request failed: ${err && err.message ? err.message : String(err)}`,
		});
		process.exit(1);
	}
	const text = await resp.text();
	let json;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = undefined;
	}
	emit({
		ok: resp.ok,
		status: resp.status,
		method,
		url,
		response: json !== undefined ? json : text.slice(0, 4000),
	});
	process.exit(resp.ok ? 0 : 1);
})();
