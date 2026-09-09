#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.join(__dirname, "..");
const args = parseArgs(process.argv.slice(2));

const taskId = args.task || "appointment-booking-agent";
const apiUrl = trimTrailingSlash(args.api_url || process.env.BLAND_API_URL || "http://localhost:3000");
const apiKey = args.api_key || process.env.BLAND_API_KEY;
const outDir = path.resolve(args.out || path.join(pluginRoot, "benchmarks", "pathway-creation", "runs", `super-norm-${Date.now()}`));
const taskPath = path.join(pluginRoot, "benchmarks", "pathway-creation", "tasks", `${taskId}.md`);

if (!apiKey) {
  fail("Missing BLAND_API_KEY or --api-key. The SuperNorm baseline uses authenticated Blandcode routes.");
}
if (!fs.existsSync(taskPath)) {
  fail(`Unknown benchmark task: ${taskId}`);
}

fs.mkdirSync(outDir, { recursive: true });

const prompt = [
  fs.readFileSync(taskPath, "utf8"),
  "",
  "Create the pathway now using your normal SuperNorm workflow.",
  "When complete, commit the pathway workspace and include the pathway_id and pathway_version_id in your final answer."
].join("\n");

const session = await requestJson(`${apiUrl}/v1/blandcode/sessions`, {
  method: "POST",
  body: { mode: "standalone" }
});
const sessionId = session.data?.session_id;
if (!sessionId) {
  fail(`Could not create standalone session: ${JSON.stringify(session)}`);
}

const events = await streamAgentChat(`${apiUrl}/v1/blandcode/sessions/${sessionId}/agents/chat`, {
  message: prompt,
  agent_type: "super_norm",
  options: {
    mode: "agent",
    ui_surface: "assistant_panel"
  }
});

fs.writeFileSync(path.join(outDir, "events.json"), `${JSON.stringify(events, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, "prompt.md"), prompt);

const ids = extractPathwayIds(events);
fs.writeFileSync(path.join(outDir, "ids.json"), `${JSON.stringify({ session_id: sessionId, ...ids }, null, 2)}\n`);

if (!ids.pathway_id || !ids.pathway_version_id) {
  const streamedWorkspaceDir = path.join(outDir, "streamed-workspace");
  const pathwayState = [...events].reverse().find((event) => event.type === "pathway_state");
  if (pathwayState?.nodes && pathwayState?.edges) {
    const exportResult = await runExporter({
      eventsPath: path.join(outDir, "events.json"),
      outDir: streamedWorkspaceDir
    });
    fs.writeFileSync(path.join(outDir, "streamed-export.json"), `${JSON.stringify(exportResult, null, 2)}\n`);
    console.log(JSON.stringify({
      ok: true,
      persistence: "streamed_pathway_state_only",
      out_dir: outDir,
      workspace_dir: streamedWorkspaceDir,
      session_id: sessionId,
      message: "SuperNorm produced a pathway_state event, but this route did not return persisted pathway ids. Scoring the streamed pathway state fallback.",
      next_score_command: `node claude-plugin-bland-lab/scripts/score-workspace.mjs --workspace ${streamedWorkspaceDir} --task ${taskId}`
    }, null, 2));
    process.exit(0);
  }

  console.log(JSON.stringify({
    ok: false,
    out_dir: outDir,
    session_id: sessionId,
    message: "SuperNorm run completed, but no pathway_id/pathway_version_id could be extracted from SSE events. Inspect events.json."
  }, null, 2));
  process.exit(0);
}

const fileSession = await requestJson(`${apiUrl}/v1/blandcode/sessions`, {
  method: "POST",
  body: {
    pathway_id: ids.pathway_id,
    source_version_id: ids.pathway_version_id,
    mode: "fork"
  }
});
const fileSessionId = fileSession.data?.session_id;
if (!fileSessionId) {
  fail(`Could not create file extraction session: ${JSON.stringify(fileSession)}`);
}

const filesResponse = await requestJson(`${apiUrl}/v1/blandcode/sessions/${fileSessionId}/files`, {
  method: "GET"
});
const files = filesResponse.data?.files || [];
const workspaceDir = path.join(outDir, "workspace");
writeFiles(workspaceDir, files);

console.log(JSON.stringify({
  ok: true,
  out_dir: outDir,
  workspace_dir: workspaceDir,
  session_id: sessionId,
  file_session_id: fileSessionId,
  ...ids,
  next_score_command: `node claude-plugin-bland-lab/scripts/score-workspace.mjs --workspace ${workspaceDir} --task ${taskId}`
}, null, 2));

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replaceAll("-", "_");
    const next = rawArgs[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    fail(`HTTP ${response.status} from ${url}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function streamAgentChat(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok || !response.body) {
    const text = await response.text();
    fail(`HTTP ${response.status} from ${url}: ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let splitIndex;
    while ((splitIndex = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, splitIndex);
      buffer = buffer.slice(splitIndex + 2);
      const parsed = parseSseChunk(chunk);
      if (parsed) events.push(parsed);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const parsed = parseSseChunk(tail);
    if (parsed) events.push(parsed);
  }
  return events;
}

function parseSseChunk(chunk) {
  const dataLines = chunk
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());
  if (dataLines.length === 0) return null;
  const data = dataLines.join("\n");
  try {
    return JSON.parse(data);
  } catch {
    return { raw: data };
  }
}

function extractPathwayIds(events) {
  const found = {};
  for (const event of events) {
    walkObject(event, (key, value) => {
      if ((key === "pathway_id" || key === "pathwayId") && typeof value === "string") {
        found.pathway_id = value;
      }
      if (
        (key === "working_pathway_version_id" ||
          key === "pathway_version_id" ||
          key === "pathwayVersionId") &&
        typeof value === "string"
      ) {
        found.pathway_version_id = value;
      }
    });
  }
  return found;
}

function walkObject(value, visit) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkObject(item, visit);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    walkObject(child, visit);
  }
}

function writeFiles(root, files) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  for (const file of files) {
    const relativePath = file.path;
    if (!relativePath || relativePath.includes("..") || path.isAbsolute(relativePath)) {
      continue;
    }
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content || "");
  }
}

async function runExporter({ eventsPath, outDir }) {
  const { spawnSync } = await import("node:child_process");
  const exporterPath = path.join(__dirname, "export-super-norm-events-workspace.mjs");
  const result = spawnSync(process.execPath, [
    exporterPath,
    "--events",
    eventsPath,
    "--out",
    outDir
  ], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(result.stderr || result.stdout || "Failed to export streamed pathway_state.");
  }
  return JSON.parse(result.stdout);
}
