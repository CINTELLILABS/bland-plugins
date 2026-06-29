#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const eventsPath = args.events ? path.resolve(args.events) : null;
const outDir = args.out ? path.resolve(args.out) : null;

if (!eventsPath || !outDir) {
  fail("Usage: node export-super-norm-events-workspace.mjs --events <events.json> --out <workspace-dir>");
}
if (!fs.existsSync(eventsPath)) {
  fail(`Events file does not exist: ${eventsPath}`);
}

const events = JSON.parse(fs.readFileSync(eventsPath, "utf8"));
const pathwayState = [...events].reverse().find((event) => event.type === "pathway_state");

if (!pathwayState?.nodes || !pathwayState?.edges) {
  fail("No pathway_state event with nodes/edges found.");
}

const files = pathwayStateToFiles(pathwayState);
writeFiles(outDir, files);

console.log(JSON.stringify({
  ok: true,
  workspace_dir: outDir,
  node_count: pathwayState.nodes.filter(isNode).length,
  edge_count: pathwayState.edges.filter(isEdge).length,
  file_count: Object.keys(files).length
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

function pathwayStateToFiles(state) {
  const nodes = state.nodes.filter(isNode);
  const edges = state.edges.filter(isEdge);
  const slugByNodeId = new Map(nodes.map((node) => [node.id, slugify(node.data?.name || node.id)]));
  const files = {
    "manifest.yaml": [
      "name: \"SuperNorm streamed pathway baseline\"",
      "schema_version: 1",
      "description: \"Exported from a Blandcode super_norm pathway_state SSE event.\"",
      ""
    ].join("\n")
  };

  const variables = collectVariables(nodes);
  files["variables.yaml"] = variablesToYaml(variables);

  for (const node of nodes) {
    const slug = slugByNodeId.get(node.id);
    files[`nodes/${slug}/node.md`] = [
      "---",
      `id: ${yamlScalar(node.id)}`,
      `name: ${yamlScalar(node.data?.name || node.id)}`,
      `type: ${yamlScalar(node.type || "Default")}`,
      ...(node.data?.isStart ? ["isStart: true"] : []),
      "---",
      "",
      node.data?.condition || node.data?.description || `${node.data?.name || node.id} node.`,
      ""
    ].join("\n");

    files[`nodes/${slug}/prompt.md`] = [
      "---",
      "---",
      "",
      node.data?.prompt || "",
      ""
    ].join("\n");

    if (Array.isArray(node.data?.tools) && node.data.tools.length > 0) {
      files[`nodes/${slug}/tools.yaml`] = toolsToYaml(node.data.tools);
    }
  }

  for (const edge of edges) {
    const source = slugByNodeId.get(edge.source) || edge.source;
    const target = slugByNodeId.get(edge.target) || edge.target;
    const edgeSlug = `${source}_to_${target}`;
    files[`edges/${edgeSlug}.md`] = [
      "---",
      `source: ${yamlScalar(source)}`,
      `target: ${yamlScalar(target)}`,
      `source_id: ${yamlScalar(edge.source)}`,
      `target_id: ${yamlScalar(edge.target)}`,
      `condition: ${yamlScalar(edge.data?.label || edge.data?.description || "route condition")}`,
      "---",
      "",
      edge.data?.description || edge.data?.label || "Route transition.",
      ""
    ].join("\n");
  }

  files["tests/booking-flow.yaml"] = [
    "name: SuperNorm baseline booking smoke test",
    "caller_goal: Book a cleaning next Tuesday afternoon.",
    "expected_nodes:",
    ...nodes.slice(0, 5).map((node) => `  - ${slugByNodeId.get(node.id)}`),
    ""
  ].join("\n");

  return files;
}

function isNode(value) {
  return Boolean(value?.id && value?.data && typeof value.data === "object");
}

function isEdge(value) {
  return Boolean(value?.id && value?.source && value?.target);
}

function collectVariables(nodes) {
  const variables = new Map();
  for (const node of nodes) {
    addExtractVars(variables, node.data?.extractVars);
    for (const tool of node.data?.tools || []) {
      addExtractVars(variables, tool.extractVars);
    }
  }
  return variables;
}

function addExtractVars(variables, extractVars) {
  if (!Array.isArray(extractVars)) return;
  for (const entry of extractVars) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
    variables.set(entry[0], {
      type: typeof entry[1] === "string" ? entry[1] : "string",
      description: typeof entry[2] === "string" ? entry[2] : entry[0]
    });
  }
}

function variablesToYaml(variables) {
  const lines = ["variables:"];
  if (variables.size === 0) {
    lines.push("  {}");
  } else {
    for (const [name, variable] of [...variables.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`  ${name}:`);
      lines.push(`    type: ${yamlScalar(variable.type)}`);
      lines.push(`    description: ${yamlScalar(variable.description)}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function toolsToYaml(tools) {
  const lines = ["tools:"];
  for (const tool of tools) {
    lines.push(`  - name: ${yamlScalar(tool.name || "tool")}`);
    lines.push(`    type: ${yamlScalar(tool.type || "tool")}`);
    if (tool.description) lines.push(`    description: ${yamlScalar(tool.description)}`);
    if (tool.behavior) lines.push(`    behavior: ${yamlScalar(tool.behavior)}`);
    if (tool.config?.url) lines.push(`    url: ${yamlScalar(tool.config.url)}`);
    if (tool.config?.method) lines.push(`    method: ${yamlScalar(tool.config.method)}`);
    if (tool.config?.body) lines.push(`    body: ${yamlScalar(tool.config.body)}`);
  }
  lines.push("");
  return lines.join("\n");
}

function writeFiles(root, files) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "node";
}

function yamlScalar(value) {
  return JSON.stringify(String(value ?? ""));
}
