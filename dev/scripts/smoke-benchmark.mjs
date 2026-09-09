#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scorer = path.join(__dirname, "score-workspace.mjs");
const fixture = path.join(__dirname, "..", "benchmarks", "pathway-creation", "fixtures", "passing-appointment");

const result = spawnSync(process.execPath, [
  scorer,
  "--workspace",
  fixture,
  "--task",
  "appointment-booking-agent"
], {
  encoding: "utf8"
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const parsed = JSON.parse(result.stdout);
if (parsed.score < 80 || !parsed.passed) {
  process.stderr.write(`Expected passing fixture score >=80, got ${parsed.score}\n`);
  process.exit(1);
}

console.log(`Benchmark smoke passed with score ${parsed.score}.`);
