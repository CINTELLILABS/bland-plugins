const {test} = require('node:test');
const assert = require('node:assert/strict');
const {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync} = require('node:fs');
const {join} = require('node:path');
const {tmpdir} = require('node:os');
const {spawnSync} = require('node:child_process');

const bin = join(__dirname, '../bin');
const defaultUrl = 'https://default.example';
const customUrl = 'https://custom.example';

function profile(url, id = 'bland@bland') {
  return {permissions: {allow: ['Read']}, pluginConfigs: {
    [id]: {options: {bland_api_url: url, unrelated: 'preserve'}},
    'other@plugin': {options: {value: 123}},
  }};
}

function fixture(t, id = 'bland@bland') {
  const root = mkdtempSync(join(tmpdir(), 'bland-config-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const home = join(root, 'home');
  const custom = join(root, 'custom profile');
  mkdirSync(join(home, '.claude'), {recursive: true});
  mkdirSync(custom);
  const defaultFile = join(home, '.claude/settings.json');
  const customFile = join(custom, 'settings.json');
  writeFileSync(defaultFile, JSON.stringify(profile(defaultUrl)));
  writeFileSync(customFile, JSON.stringify(profile(customUrl, id)));
  const defaultBytes = readFileSync(defaultFile, 'utf8');
  const env = {...process.env, HOME: home, USERPROFILE: home};
  delete env.CLAUDE_CONFIG_DIR;
  function run(script, args = [], configDir = custom) {
    const childEnv = {...env};
    if (configDir !== null) childEnv.CLAUDE_CONFIG_DIR = configDir;
    const result = spawnSync(process.execPath, [join(bin, script), ...args], {
      cwd: root, env: childEnv, input: '{}', encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.stderr, '');
    return result;
  }
  return {run, defaultFile, customFile, defaultBytes, custom};
}

test('show reads only the custom profile', t => {
  const f = fixture(t);
  const result = f.run('norm-config.cjs');
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).bland_api_url, customUrl);
});

for (const id of ['bland@bland', 'bland@bland-local', 'norm@bland']) {
  for (const [arg, url] of [['https://new.example/', 'https://new.example'], ['--prod', 'https://api.bland.ai'], ['--clear', undefined]]) {
    test(`${arg} changes only the custom profile's ${id} entry`, t => {
      const f = fixture(t, id);
      const result = f.run('norm-config.cjs', [arg]);
      assert.equal(result.status, 0);
      assert.equal(JSON.parse(result.stdout).ok, true);
      const expected = profile(customUrl, id);
      if (url === undefined) delete expected.pluginConfigs[id].options.bland_api_url;
      else expected.pluginConfigs[id].options.bland_api_url = url;
      assert.deepEqual(JSON.parse(readFileSync(f.customFile, 'utf8')), expected);
      assert.equal(readFileSync(f.defaultFile, 'utf8'), f.defaultBytes);
    });
  }
}

test('missing custom settings never falls back to the default profile', t => {
  const f = fixture(t);
  rmSync(f.customFile);
  const shown = f.run('norm-config.cjs');
  assert.equal(shown.status, 0);
  assert.equal(JSON.parse(shown.stdout).bland_api_url, '(default: https://api.bland.ai)');
  const changed = f.run('norm-config.cjs', ['--prod']);
  assert.equal(changed.status, 0);
  assert.equal(JSON.parse(readFileSync(f.customFile, 'utf8')).pluginConfigs['bland@bland'].options.bland_api_url, 'https://api.bland.ai');
  assert.equal(readFileSync(f.defaultFile, 'utf8'), f.defaultBytes);
});

test('malformed custom settings fail without changing either profile', t => {
  const f = fixture(t);
  writeFileSync(f.customFile, '{invalid');
  const result = f.run('norm-config.cjs', ['--prod']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
  assert.equal(readFileSync(f.customFile, 'utf8'), '{invalid');
  assert.equal(readFileSync(f.defaultFile, 'utf8'), f.defaultBytes);
});

test('unset and empty config directory retain default-profile behavior', t => {
  const f = fixture(t);
  for (const dir of [null, '']) {
    const result = f.run('norm-config.cjs', [], dir);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).bland_api_url, defaultUrl);
  }
});

test('SessionStart reports the custom profile target, not the default target', t => {
  const f = fixture(t);
  const result = f.run('hook-status.cjs');
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, 'SessionStart');
  assert.ok(output.additionalContext.includes(customUrl));
  assert.ok(!output.additionalContext.includes(defaultUrl));
});

for (const contents of [JSON.stringify(profile('https://api.bland.ai')), '{invalid', null]) {
  test(`SessionStart does not leak a default-profile dev banner for ${contents === null ? 'missing' : contents === '{invalid' ? 'malformed' : 'production'} custom settings`, t => {
    const f = fixture(t);
    if (contents === null) rmSync(f.customFile);
    else writeFileSync(f.customFile, contents);
    const result = f.run('hook-status.cjs');
    assert.equal(result.status, 0);
    const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert.ok(context.includes('Bland plugin active.'));
    assert.ok(!context.includes('(not production)'));
    assert.equal(readFileSync(f.defaultFile, 'utf8'), f.defaultBytes);
    assert.equal(existsSync(f.customFile), contents !== null);
  });
}
