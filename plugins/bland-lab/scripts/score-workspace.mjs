#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.join(__dirname, "..");
const rubricPath = path.join(pluginRoot, "benchmarks", "pathway-creation", "rubric.json");

const args = parseArgs(process.argv.slice(2));
const workspaceRoot = args.workspace ? path.resolve(args.workspace) : null;
const taskId = args.task || "appointment-booking-agent";

if (!workspaceRoot) {
  fail("Missing --workspace <path>");
}

if (!fs.existsSync(workspaceRoot)) {
  fail(`Workspace path does not exist: ${workspaceRoot}`);
}

const rubric = JSON.parse(fs.readFileSync(rubricPath, "utf8"));
const task = rubric.tasks?.[taskId];
if (!task) {
  fail(`Unknown task: ${taskId}`);
}

const files = readWorkspaceFiles(workspaceRoot);
const result = scoreWorkspace(files, taskId, task, workspaceRoot);

if (args.out) {
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

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

function readWorkspaceFiles(root) {
  const files = {};
  walk(root, (absolutePath) => {
    if (!fs.statSync(absolutePath).isFile()) return;
    const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
    if (relativePath.startsWith(".git/")) return;
    files[relativePath] = fs.readFileSync(absolutePath, "utf8");
  });
  return files;
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, visit);
    } else {
      visit(absolutePath);
    }
  }
}

function scoreWorkspace(files, taskId, task, workspaceRoot) {
  const allText = Object.values(files).join("\n").toLowerCase();
  const nodeFiles = Object.keys(files).filter((filePath) => /^nodes\/[^/]+\/node\.md$/.test(filePath));
  const edgeFiles = Object.keys(files).filter((filePath) => /^edges\/[^/]+\.md$/.test(filePath));
  const promptFiles = Object.keys(files).filter((filePath) => /^nodes\/[^/]+\/prompt\.md$/.test(filePath));
  const toolFiles = Object.keys(files).filter((filePath) => filePath.endsWith("/tools.yaml") || filePath.includes("tool"));
  const testFiles = Object.keys(files).filter((filePath) => /^tests\/.+\.(ya?ml|md|json)$/.test(filePath));

  const requiredConcepts = scoreRequiredMatches(task.required_concepts, allText);
  const requiredVariables = scoreRequiredMatches(task.required_variables, variableText(files));
  const requiredToolConcepts = scoreRequiredMatches(task.required_tool_concepts, toolFiles.map((filePath) => files[filePath]).join("\n").toLowerCase());
  const requiredTestConcepts = scoreRequiredMatches(task.required_test_concepts, testFiles.map((filePath) => files[filePath]).join("\n").toLowerCase());

  const checks = [
    check("manifest_present", 8, Boolean(files["manifest.yaml"]), "manifest.yaml exists"),
    check("minimum_nodes", 18, nodeFiles.length >= task.minimum_nodes, `${nodeFiles.length}/${task.minimum_nodes} node files`),
    check("minimum_edges", 14, edgeFiles.length >= task.minimum_edges, `${edgeFiles.length}/${task.minimum_edges} edge files`),
    proportional("required_concepts", 25, requiredConcepts),
    proportional("required_variables", 14, requiredVariables),
    proportional("tool_surface", 9, requiredToolConcepts),
    proportional("test_scenario", 8, requiredTestConcepts),
    check("prompt_depth", 4, averagePromptLength(promptFiles, files) >= 120, `average prompt length ${averagePromptLength(promptFiles, files)} chars`)
  ];

  const score = Math.round(checks.reduce((sum, item) => sum + item.points_awarded, 0));
  const hardFailures = checks
    .filter((item) => item.required !== false && item.points_awarded === 0)
    .map((item) => item.name);

  return {
    task_id: taskId,
    workspace_root: workspaceRoot,
    score,
    passed: score >= 80 && hardFailures.length === 0,
    max_score: checks.reduce((sum, item) => sum + item.points_possible, 0),
    summary: {
      file_count: Object.keys(files).length,
      node_count: nodeFiles.length,
      edge_count: edgeFiles.length,
      prompt_count: promptFiles.length,
      tool_file_count: toolFiles.length,
      test_file_count: testFiles.length
    },
    checks,
    missing: {
      required_concepts: requiredConcepts.missing,
      required_variables: requiredVariables.missing,
      required_tool_concepts: requiredToolConcepts.missing,
      required_test_concepts: requiredTestConcepts.missing,
      hard_failures: hardFailures
    }
  };
}

function variableText(files) {
  return Object.entries(files)
    .filter(([filePath]) => filePath === "variables.yaml" || filePath.includes("variable"))
    .map(([, content]) => content)
    .join("\n")
    .toLowerCase();
}

function scoreRequiredMatches(required, text) {
  const matches = [];
  const missing = [];
  for (const concept of required || []) {
    if (containsConcept(text, concept)) {
      matches.push(concept);
    } else {
      missing.push(concept);
    }
  }
  return {
    matched: matches,
    missing,
    total: required?.length ?? 0,
    ratio: required?.length ? matches.length / required.length : 1
  };
}

function containsConcept(text, concept) {
  const normalizedText = normalize(text);
  const normalizedConcept = normalize(concept);
  if (normalizedText.includes(normalizedConcept)) return true;
  const tokens = normalizedConcept.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => normalizedText.includes(token));
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function averagePromptLength(promptFiles, files) {
  if (promptFiles.length === 0) return 0;
  const total = promptFiles.reduce((sum, filePath) => sum + stripFrontmatter(files[filePath]).trim().length, 0);
  return Math.round(total / promptFiles.length);
}

function stripFrontmatter(content) {
  return String(content).replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function check(name, points, passed, detail) {
  return {
    name,
    passed,
    points_possible: points,
    points_awarded: passed ? points : 0,
    detail
  };
}

function proportional(name, points, matchResult) {
  return {
    name,
    passed: matchResult.missing.length === 0,
    points_possible: points,
    points_awarded: points * matchResult.ratio,
    detail: `${matchResult.matched.length}/${matchResult.total} matched`,
    matched: matchResult.matched,
    missing: matchResult.missing
  };
}
