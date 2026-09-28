import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../v2');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const entries = ['api-workspace', 'evaluations', 'call-analysis'];
function headingAnchors(text) {
  const anchors = new Set();
  // Packaged references use ATX headings; ignore fenced examples.
  const prose = text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
  for (const match of prose.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = match[1].toLowerCase().replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-');
    let slug = base;
    for (let suffix = 1; anchors.has(slug); suffix++) slug = `${base}-${suffix}`;
    anchors.add(slug);
  }
  return anchors;
}
function localLinks(text, from) {
  return [...text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)]
    .map((match) => match[1])
    .filter((href) => !/^[a-z]+:/i.test(href))
    .map((href) => {
      const [path, fragment] = href.split('#');
      const file = path ? resolve(dirname(from), decodeURIComponent(path)) : from;
      if (fragment) {
        assert.ok(!relative(root, file).startsWith('..'), `outside archive: ${file}`);
        assert.ok(existsSync(file), `missing link: ${relative(root, file)}`);
        assert.ok(headingAnchors(readFileSync(file, 'utf8')).has(decodeURIComponent(fragment)),
          `missing anchor: ${href}`);
      }
      return file;
    });
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
}).concat(
  resolve(root, 'skills/v2-testing/references/voice.md'),
  resolve(root, 'skills/v2-runtime/references/builder-runtime-map.md'),
  resolve(root, 'skills/v2-runtime/references/interruptions.md'),
);

test('runtime entrypoint and wiki index both discover the mapping references', () => {
  for (const entry of ['skills/v2-runtime/SKILL.md', 'skills/api-workspace/references/index.md']) {
    const seen = visitReferences(resolve(root, entry));
    for (const name of ['builder-runtime-map.md', 'interruptions.md']) {
      assert.ok(seen.has(resolve(root, `skills/v2-runtime/references/${name}`)),
        `${entry} cannot discover ${name}`);
    }
  }
});

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

test('all host descriptions advertise evaluation and call analysis', () => {
  for (const host of ['codex', 'claude', 'cursor', 'grok']) {
    const { description } = JSON.parse(read(`.${host}-plugin/plugin.json`));
    assert.match(description, /evaluations/i, host);
    assert.match(description, /analyze calls/i, host);
  }
});

test('reference validation checks local and cross-file heading anchors', () => {
  const from = resolve(root, 'skills/v2-runtime/SKILL.md');
  assert.throws(() => localLinks('[bad](#missing-section)', from), /missing anchor/);
  assert.throws(() => localLinks('[bad](references/interruptions.md#missing-section)', from), /missing anchor/);
  assert.equal(localLinks('[good](#variables)', from)[0], from);
  assert.equal(localLinks('[good](references/interruptions.md#scenariotopic-changes)', from)[0],
    resolve(root, 'skills/v2-runtime/references/interruptions.md'));
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
