import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../v2');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const entries = ['api-workspace', 'evaluations', 'call-analysis'];
function localLinks(text, from) {
  return [...text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)]
    .map((match) => match[1].split('#')[0])
    .filter((path) => path && !/^[a-z]+:/i.test(path))
    .map((path) => resolve(dirname(from), path));
}

function visitReferences(file, seen = new Set()) {
  assert.ok(!relative(root, file).startsWith('..'), `outside archive: ${file}`);
  assert.ok(existsSync(file), `missing link: ${relative(root, file)}`);
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const next of localLinks(readFileSync(file, 'utf8'), file)) visitReferences(next, seen);
  return seen;
}

const newPages = () => entries.flatMap((name) => {
  const dir = resolve(root, `skills/${name}/references`);
  return readdirSync(dir).filter((file) => file.endsWith('.md')).map((file) => resolve(dir, file));
}).concat(resolve(root, 'skills/v2-testing/references/voice.md'));

test('Codex discovers the skill root and resolves its packaged logo', () => {
  const manifest = JSON.parse(read('.codex-plugin/plugin.json'));
  assert.equal(manifest.skills, './skills/');
  const logo = resolve(root, manifest.interface.logo);
  assert.ok(!relative(root, logo).startsWith('..'), 'logo escapes the plugin');
  assert.ok(existsSync(logo));
  assert.equal(manifest.mcpServers.plugin_norm_bland.url, 'https://api.bland.ai/v1/mcp');
});

test('new skills have discoverable metadata and short entrypoints', () => {
  for (const name of entries) {
    const text = read(`skills/${name}/SKILL.md`);
    assert.match(text, new RegExp(`^---\\nname: ${name}\\ndescription: .+\\n---\\n`));
    assert.ok(text.split(/\s+/).length < 650, `${name} should route to references`);
    assert.ok(localLinks(text, resolve(root, `skills/${name}/SKILL.md`)).length > 0);
  }
});

test('every new wiki page is reachable inside the plugin archive', () => {
  const start = resolve(root, 'skills/api-workspace/references/index.md');
  const seen = visitReferences(start);
  for (const file of newPages()) {
    assert.ok(seen.has(file), `unreachable wiki page: ${relative(root, file)}`);
  }
});

test('host release versions remain aligned', () => {
  const versions = ['codex', 'claude', 'cursor', 'grok'].map((host) =>
    JSON.parse(read(`.${host}-plugin/plugin.json`)).version);
  assert.equal(new Set(versions).size, 1);
});

test('reference validation rejects broken and escaped links', () => {
  const [broken] = localLinks('[missing](./does-not-exist.md)', resolve(root, 'README.md'));
  assert.throws(() => visitReferences(broken), /missing link/);
  const [escaped] = localLinks('[escape](../../outside.md)', resolve(root, 'README.md'));
  assert.throws(() => visitReferences(escaped), /outside archive/);
});

test('all new JSON examples parse without preprocessing', () => {
  let count = 0;
  for (const file of newPages()) {
    for (const match of readFileSync(file, 'utf8').matchAll(/```json\n([\s\S]*?)```/g)) {
      assert.doesNotThrow(() => JSON.parse(match[1]), relative(root, file));
      count++;
    }
  }
  assert.ok(count >= 6, 'expected the documented API and report examples');
});
