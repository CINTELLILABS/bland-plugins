import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const targets = ['skills/api/references/endpoint-tools.md',
  'v2/skills/api-workspace/references/endpoint-tools.md'];
const record = (i) => `\t{\n\t\tname: "fixture_${i}",\n\t\tmethod: "GET",\n\t\tpath: "/v1/fixture/${i}",\n\t\tdocsPage: "api-v1/get/fixture-${i}",\n\t\tqueryParams: ["limit"],\n\t\tinput: z.strictObject({ limit: z.number().optional() }),\n\t},`;

function fixture(change = (value) => value) {
  const dir = mkdtempSync(resolve(tmpdir(), 'endpoint-generator-e2e-'));
  const script = resolve(dir, 'dev/scripts/generate-endpoint-tool-reference.mjs');
  mkdirSync(dirname(script), { recursive: true });
  copyFileSync(resolve(root, 'dev/scripts/generate-endpoint-tool-reference.mjs'), script);
  const server = resolve(dir, 'SERVER');
  const source = resolve(server, 'apps/api/src/lib/blandcode/actions/endpoints/generated/fixture.ts');
  mkdirSync(dirname(source), { recursive: true });
  const records = Array.from({ length: 286 }, (_, i) => i === 143 ? change(record(i)) : record(i));
  writeFileSync(source, `defineEndpointActions([\n${records.join('\n')}\n]);\n`);
  for (const target of targets) {
    mkdirSync(dirname(resolve(dir, target)), { recursive: true });
    writeFileSync(resolve(dir, target), `sentinel: ${target}\n`);
  }
  return { dir, script, server };
}
function run(f, ...args) {
  return spawnSync(process.execPath, [f.script, f.server, ...args], { encoding: 'utf8' });
}
function outputs(f) {
  return targets.map((target) => readFileSync(resolve(f.dir, target), 'utf8'));
}

test('CLI generates both complete indexes and --check verifies them', () => {
  const f = fixture();
  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  const [first, second] = outputs(f);
  assert.equal(first, second);
  assert.equal([...first.matchAll(/^- `/gm)].length, 286);
  assert.match(first, /fixture_143/);
  assert.match(first, /query fields: `limit`/);
  assert.equal(run(f, '--check').status, 0);
  writeFileSync(resolve(f.dir, targets[1]), 'stale second archive\n');
  const before = outputs(f);
  assert.notEqual(run(f, '--check').status, 0);
  assert.deepEqual(outputs(f), before, '--check must not rewrite either archive');
});

for (const [name, change] of [
  ['space-indented endpoint', (value) => value.replaceAll('\t', '  ')],
  ['name no longer first', (value) => value.replace(
    '\t\tname: "fixture_143",\n\t\tmethod: "GET",',
    '\t\tmethod: "GET",\n\t\tname: "fixture_143",')],
  ['missing required route', (value) => value.replace('\t\tpath: "/v1/fixture/143",\n', '')],
]) {
  test(`CLI rejects ${name} before changing either index`, () => {
    const f = fixture(change);
    const before = outputs(f);
    for (const args of [[], ['--check']]) {
      const result = run(f, ...args);
      assert.notEqual(result.status, 0, '285 parsed records must not pass the loose count guard');
      assert.match(result.stderr, /Unconsumed endpoint records|Incomplete spec/);
      assert.deepEqual(outputs(f), before, 'failed generation must preserve both indexes');
    }
  });
}
