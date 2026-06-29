#!/usr/bin/env node

const apiUrl = (process.env.BLAND_API_URL || "http://localhost:3000").replace(/\/$/, "");
const apiKey = process.env.BLAND_API_KEY || "";
const mcpUrl = `${apiUrl}/v1/mcp`;

if (!apiKey) {
  console.error("BLAND_API_KEY is required for the HTTP MCP smoke test.");
  process.exit(1);
}

let sessionId = "";

async function rpc(id, method, params = {}) {
  const headers = {
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json"
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const response = await fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });

  const nextSessionId = response.headers.get("mcp-session-id");
  if (nextSessionId) sessionId = nextSessionId;

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`non-JSON response ${response.status}: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  if (json?.error) {
    throw new Error(`RPC ${method} failed: ${JSON.stringify(json.error)}`);
  }
  return json?.result;
}

await rpc(1, "initialize", { protocolVersion: "2025-03-26" });
const list = await rpc(2, "tools/list");
const tools = list?.tools ?? [];
const names = new Set(tools.map((tool) => tool.name));

for (const required of [
  "begin_pathway_generation",
  "validate_pathway",
  "commit_pathway_workspace",
  "get_norm_workspace_status",
  "run_pathway_node_test",
  "create_agent_test_scenario",
  "run_agent_test_scenario",
  "list_agent_test_runs"
]) {
  if (!names.has(required)) {
    throw new Error(`tools/list did not include ${required}`);
  }
}

const status = await rpc(3, "tools/call", {
  name: "get_norm_workspace_status",
  arguments: {}
});
const statusText = status?.content?.[0]?.text ?? "";
if (!statusText.includes("Norm workspace")) {
  throw new Error(`unexpected workspace status response: ${statusText.slice(0, 300)}`);
}

console.log(`HTTP MCP smoke passed with ${tools.length} tools at ${mcpUrl}.`);
