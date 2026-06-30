#!/usr/bin/env node
"use strict";

/**
 * stdio↔HTTP bridge so the Bland MCP works as a LOCAL stdio MCP server. This is
 * how the Claude DESKTOP app must consume it: a `type:"http"` connector is treated
 * as a custom OAuth connector ("Connect" button) and cannot attach to Bland's
 * static-API-key endpoint, whereas a `type:"stdio"` server is just launched as a
 * local process — no OAuth, no URL validator, no https requirement. Every JSON-RPC
 * line on stdin is forwarded to Bland's Streamable HTTP MCP endpoint with the
 * Bearer key, and the server-owned Mcp-Session-Id is reused.
 *
 * The desktop does NOT pass plugin userConfig env to a launched stdio server, so
 * we resolve the url + key from the persisted config via the shared resolver
 * (env → ~/.claude/settings.json pluginConfigs → .credentials.json → keychain),
 * exactly like the other bin tools. The key is never printed.
 */

const path = require("node:path");
let API_URL = "https://api.bland.ai";
let API_KEY = "";
try {
	const creds =
		require(path.join(__dirname, "_credentials.cjs")).resolveCredentials();
	API_URL = creds.apiUrl;
	API_KEY = creds.apiKey;
} catch {
	API_URL = (process.env.BLAND_API_URL || "https://api.bland.ai")
		.trim()
		.replace(/\/$/, "");
	API_KEY = (
		process.env.BLAND_API_KEY ||
		process.env.CLAUDE_PLUGIN_OPTION_bland_api_key ||
		""
	).trim();
}
const MCP_URL = API_URL.endsWith("/v1/mcp") ? API_URL : `${API_URL}/v1/mcp`;

let mcpSessionId = "";

function write(message) {
	process.stdout.write(`${JSON.stringify(message)}\n`);
}

function errorResponse(id, code, message) {
	return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function forward(message) {
	if (!API_KEY) {
		return errorResponse(
			message.id,
			-32000,
			"BLAND_API_KEY is not set. Configure the plugin's bland_api_key.",
		);
	}

	const headers = {
		accept: "application/json, text/event-stream",
		authorization: API_KEY.toLowerCase().startsWith("bearer ")
			? API_KEY
			: `Bearer ${API_KEY}`,
		"content-type": "application/json",
	};
	if (mcpSessionId) headers["mcp-session-id"] = mcpSessionId;

	const response = await fetch(MCP_URL, {
		method: "POST",
		headers,
		body: JSON.stringify(message),
	});

	const nextSessionId = response.headers.get("mcp-session-id");
	if (nextSessionId) mcpSessionId = nextSessionId;

	const text = await response.text();
	if (!text) return undefined;

	let json;
	try {
		json = JSON.parse(text);
	} catch {
		return errorResponse(
			message.id,
			-32603,
			`Bland MCP returned non-JSON (${response.status}): ${text.slice(0, 300)}`,
		);
	}

	if (!response.ok) {
		return errorResponse(
			message.id,
			-32603,
			`Bland MCP HTTP ${response.status}: ${JSON.stringify(json).slice(0, 500)}`,
		);
	}

	return json;
}

async function handleLine(line) {
	let message;
	try {
		message = JSON.parse(line);
	} catch {
		return;
	}

	try {
		const response = await forward(message);
		if (response !== undefined) write(response);
	} catch (err) {
		if (message.id !== undefined) {
			write(
				errorResponse(
					message.id,
					-32603,
					err instanceof Error ? err.message : "Unknown error",
				),
			);
		}
	}
}

let buffer = "";
let queue = Promise.resolve();
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
	buffer += chunk;
	let newline;
	while ((newline = buffer.indexOf("\n")) >= 0) {
		const line = buffer.slice(0, newline).trim();
		buffer = buffer.slice(newline + 1);
		if (line) {
			queue = queue
				.then(() => handleLine(line))
				.catch((err) => {
					write(
						errorResponse(
							null,
							-32603,
							err instanceof Error ? err.message : "Unknown error",
						),
					);
				});
		}
	}
});
process.stdin.on("end", () => {
	queue.finally(() => process.exit(0));
});
