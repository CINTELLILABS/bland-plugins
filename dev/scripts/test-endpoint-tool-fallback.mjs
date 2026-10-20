import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const index = read('skills/api/references/endpoint-tools.md');
const selection = read('skills/api/references/tool-selection.md');
const v2 = read('v2/skills/api-workspace/references/api.md');
const rows = [...index.matchAll(/^- `([A-Z]+) ([^`]+)` → `([^`]+)`/gm)]
  .map(([, method, path, name]) => ({ method, path, name }));

test('both plugin archives carry the same complete endpoint index', () => {
  assert.equal(index, read('v2/skills/api-workspace/references/endpoint-tools.md'));
  assert.equal(rows.length, 286);
  assert.equal(new Set(rows.map((row) => row.name)).size, rows.length);
  // Text and website ingestion share POST /v1/knowledge/learn, with distinct inputs.
  assert.equal(new Set(rows.map((row) => `${row.method} ${row.path}`)).size, rows.length - 1);
  for (const row of rows) assert.match(row.path, /^\/[^\s?#]+$/);
});

test('named-only account and typed call reads resolve to the new routes', () => {
  assert.deepEqual(rows.find((row) => row.name === 'get_account_details'),
    { method: 'GET', path: '/v1/me', name: 'get_account_details' });
  assert.deepEqual(rows.find((row) => row.name === 'list_calls'),
    { method: 'GET', path: '/v1/calls', name: 'list_calls' });
  for (const text of [selection, v2, read('commands/status.md')]) {
    assert.match(text, /get_account_details \{\}/);
    assert.match(text, /list_calls \{ limit: 1 \}/);
  }
});

test('named writes do not silently cross API generations', () => {
  assert.deepEqual(rows.find((row) => row.name === 'create_tool'),
    { method: 'POST', path: '/v2/tools', name: 'create_tool' });
  assert.deepEqual(rows.find((row) => row.name === 'send_sms'),
    { method: 'POST', path: '/v1/sms/send', name: 'send_sms' });
  assert.match(read('skills/tools/SKILL.md'), /NOT legacy `\/v1\/tools`/);
  assert.doesNotMatch(read('skills/tools/SKILL.md'), /named tools .* are GONE/);
});

test('legacy pathway gaps cannot be mistaken for v2 agent equivalents', () => {
  assert.ok(!rows.some((row) => row.path.startsWith('/v1/convo_pathway')
    || row.path.startsWith('/v1/pathway')));
  for (const text of [selection, v2]) {
    assert.match(text, /legacy/);
    assert.match(text, /not substitutes|not v1 pathways/);
    assert.match(text, /missing method \+ route/);
  }
});

test('partial proxy availability, approval and auth failures keep safe semantics', () => {
  for (const text of [selection, v2]) {
    assert.match(text, /independently/);
    assert.match(text, /top level/);
    assert.match(text, /401\/403/);
    assert.match(text, /oauth_path_not_allowed/);
    assert.match(text, /insufficient_scope/);
    assert.match(text, /read\s+back before/i);
    assert.match(text, /confirmation/);
    assert.match(text, /same connected|existing authenticated|same connection/);
    assert.match(text, /\{ data: <API JSON> \}/);
  }
});

test('Norm hands off the fallback contract and every workspace command loads it', () => {
  for (const file of ['agents/norm.md', 'commands/norm.md']) {
    assert.match(read(file), /skills\/api\/references\/tool-selection\.md/);
  }
  for (const name of ['clone', 'commit', 'status', 'test', 'validate', 'loop']) {
    const text = read(`commands/${name}.md`);
    assert.match(text, /Before server work, read \[API tool selection\]/);
    assert.match(text, /mcp__bland__\*/);
    assert.match(text, /mcp__plugin_bland_bland__\*/);
  }
  assert.match(read('commands/status.md'), /named-only tools mark this check SKIPPED/);
});

test('new local reference links resolve inside each packaged plugin', () => {
  for (const file of ['skills/api/SKILL.md', 'skills/api/references/tool-selection.md',
    'v2/skills/api-workspace/SKILL.md']) {
    for (const [, href] of read(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^https?:/.test(href)) continue;
      assert.ok(existsSync(resolve(root, dirname(file), href.split('#')[0])), `${file}: ${href}`);
    }
  }
});
