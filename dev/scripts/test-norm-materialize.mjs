import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

const builder = resolve(dirname(fileURLToPath(import.meta.url)), '../../v2/bin/norm-materialize.cjs');
function materialize(warmTransferFields) {
  const dir = mkdtempSync(join(tmpdir(), 'norm-materialize-test-'));
  try {
    writeFileSync(join(dir, 'source.json'), JSON.stringify({
      nodes: [{ id: 'transfer', type: 'Transfer Call', data: {
        name: 'Synthetic transfer', transferNumber: '+18005550100', warmTransferFields,
      } }], edges: [],
    }));
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({
      displayName: 'Synthetic', systemPrompt: 'Synthetic test only',
      sources: [{ file: 'source.json' }],
      scenarios: [{ name: 'Support', entry: { label: 'Support', description: 'Support request' }, members: ['transfer'] }],
      endCalls: [],
    }));
    execFileSync(process.execPath, [builder, '--plan', join(dir, 'plan.json'), '--out', join(dir, 'snapshot.json')]);
    return JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const input = {
  isEnabled: true, agentPrompt: 'Ask for support.', mergeCallPrompt: 'Connecting.',
  isAgentPromptStatic: true, isMergeCallPromptStatic: true,
  useTimeout: true, timeout: 37, useCustomHoldMusic: false,
  holdMusicUrl: 'https://example.invalid/unused.wav', fromNumber: '',
  useVoicemailMessage: false, voicemailMessage: 'Unused message',
  dtmfSequence: 'w54', allowMergeControl: true,
  retry: { enabled: true, maxRetries: 2, delaySeconds: 3, retryOn: ['busy'], allowPathwayRetry: false },
};
function transfer(snapshot) {
  return snapshot.behavior.nodes.find((node) => node.type === 'complex-scenario')
    .data.flow.nodes.find((node) => node.type === 'transfer');
}

test('materializer writes native warm-transfer fields and preserves explicit off/default states', () => {
  const wt = transfer(materialize(input)).data.warmTransfer;
  assert.equal(wt.agentPromptStatic, true);
  assert.equal(wt.mergePromptStatic, true);
  assert.equal(wt.timeout, 37);
  assert.equal(wt.holdMusicUrl, '');
  assert.equal(wt.voicemailMessage, '');
  assert.equal(wt.optimizeForIVR, true);
  assert.equal(wt.dtmfSequence, 'w54');
  assert.deepEqual(wt.retry, input.retry);
  assert.equal(wt.allowMergeControl, true);
  assert.ok(!('isAgentPromptStatic' in wt));
  assert.equal(transfer(materialize({ ...input, useTimeout: false, optimizeForIVR: false })).data.warmTransfer.timeout, null);
  assert.equal(transfer(materialize({ ...input, optimizeForIVR: false })).data.warmTransfer.optimizeForIVR, false);
});

const audit = resolve(dirname(fileURLToPath(import.meta.url)), '../../v2/bin/norm-migrate-audit.cjs');
// A two-node v1 pathway: Start collects a captured name, then routes to an
// End Call. Returns the built snapshot and the audit's checks by id.
function buildDictation(endCallData) {
  const dir = mkdtempSync(join(tmpdir(), 'norm-materialize-test-'));
  try {
    writeFileSync(join(dir, 'source.json'), JSON.stringify({
      nodes: [
        { id: 'start', type: 'Default', data: {
          name: 'Start', isStart: true, prompt: 'Ask for their first and last name.',
          condition: 'User confirmed their first and last name.',
          extractVars: [['first_name', 'string', 'First name'], ['last_name', 'string', 'Last name'], ['reason', 'string', 'Why they called']],
          captureKinds: { first_name: 'name.first', last_name: 'name.last' },
        } },
        { id: 'bye', type: 'End Call', data: { name: 'End call', ...endCallData } },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'bye', data: { label: 'Caller confirmed the information.' } }],
    }));
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({
      displayName: 'Synthetic', systemPrompt: 'Synthetic test only',
      sources: [{ file: 'source.json' }],
      scenarios: [{ name: 'Name capture', entry: { label: 'Name capture', description: 'Collect the name' }, members: ['start', 'bye'] }],
    }));
    execFileSync(process.execPath, [builder, '--plan', join(dir, 'plan.json'), '--out', join(dir, 'snapshot.json')]);
    const out = execFileSync(process.execPath, [audit, '--snapshot', join(dir, 'snapshot.json'), '--source', join(dir, 'source.json')]).toString();
    const checks = Object.fromEntries(JSON.parse(out).checks.map((c) => [c.id, c]));
    return { snapshot: JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8')), checks };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function flowOf(snapshot) {
  return snapshot.behavior.nodes.find((node) => node.type === 'complex-scenario').data.flow;
}

test('a v1 End Call becomes an end-call step in its flow, reached by the v1 edge', () => {
  const { snapshot, checks } = buildDictation({ prompt: 'Thank the caller, then say: High five!' });
  const flow = flowOf(snapshot);
  const endCall = flow.nodes.find((node) => node.data && node.data.name === 'End call');
  assert.equal(endCall.type, 'end-call');
  assert.equal(endCall.data.prompt, 'Thank the caller, then say: High five!');
  const start = flow.nodes.find((node) => node.data && node.data.name === 'Start');
  const route = flow.edges.find((edge) => edge.source === start.id && edge.target === endCall.id);
  assert.equal(route.data.label, 'Caller confirmed the information.');
  // It ends the call, so nothing leaves it for the End pill or the hub.
  assert.equal(flow.edges.some((edge) => edge.source === endCall.id), false);
  assert.equal(snapshot.behavior.nodes.some((node) => node.type === 'end-call'), false);
  assert.equal(checks.S6.passed, true);
});

test('an End Call with nothing to say speaks a static "." so the call still ends', () => {
  const { snapshot } = buildDictation({});
  const endCall = flowOf(snapshot).nodes.find((node) => node.type === 'end-call');
  assert.equal(endCall.data.prompt, '.');
  assert.equal(endCall.data.useStaticText, true);
});

test('v1 capture settings carry as captureAs, and the audit checks they did', () => {
  const { snapshot, checks } = buildDictation({ prompt: 'Bye.' });
  const start = flowOf(snapshot).nodes.find((node) => node.data && node.data.name === 'Start');
  const byKey = Object.fromEntries(start.data.variables.map((row) => [row.key, row.captureAs]));
  assert.deepEqual(byKey, { first_name: 'name.first', last_name: 'name.last', reason: undefined });
  assert.equal(checks.P9.passed, true);
});

test('the audit fails a snapshot that dropped a v1 capture setting', () => {
  const { snapshot } = buildDictation({ prompt: 'Bye.' });
  for (const node of flowOf(snapshot).nodes) {
    for (const row of (node.data && node.data.variables) || []) delete row.captureAs;
  }
  const dir = mkdtempSync(join(tmpdir(), 'norm-audit-test-'));
  try {
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
    writeFileSync(join(dir, 'source.json'), JSON.stringify({
      nodes: [{ id: 'start', type: 'Default', data: { name: 'Start', captureKinds: { last_name: 'name.last' } } }],
      edges: [],
    }));
    const out = execFileSync(process.execPath, [audit, '--snapshot', join(dir, 'snapshot.json'), '--source', join(dir, 'source.json')]).toString();
    const p9 = JSON.parse(out).checks.find((c) => c.id === 'P9');
    assert.equal(p9.passed, false);
    assert.match(p9.detail, /last_name=name\.last/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Runs the audit on a snapshot against one v1 source; returns checks by id.
function runAudit(snapshot, source) {
  const dir = mkdtempSync(join(tmpdir(), 'norm-audit-test-'));
  try {
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
    writeFileSync(join(dir, 'source.json'), JSON.stringify(source));
    const out = execFileSync(process.execPath, [audit, '--snapshot', join(dir, 'snapshot.json'), '--source', join(dir, 'source.json')]).toString();
    return Object.fromEntries(JSON.parse(out).checks.map((c) => [c.id, c]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('an attached tool stays on the End Call step', () => {
  const { snapshot } = buildDictation({
    prompt: 'Bye.',
    tools: [{ name: 'Log outcome', type: 'custom_tool', config: { tool_id: 'TL-11111111-2222' } }],
  });
  const endCall = flowOf(snapshot).nodes.find((node) => node.type === 'end-call');
  assert.equal(endCall.data.tools.length, 1);
  assert.equal(endCall.data.tools[0].toolId, 'TL-11111111-2222');
});

test('an End Call with a code tool keeps the wrap-up mapping so the snippet runs', () => {
  const { snapshot, checks } = buildDictation({
    prompt: 'Bye.',
    extractVars: [['outcome', 'string', 'How the call ended']],
    tools: [{ name: 'Save result', type: 'code', config: { snippet_id: 'snip-1', snippet_version: 3 } }],
  });
  const flow = flowOf(snapshot);
  const wrapUp = flow.nodes.find((node) => node.data && node.data.name === 'End call');
  const code = flow.nodes.find((node) => node.type === 'customCode');
  const start = flow.nodes.find((node) => node.data && node.data.name === 'Start');
  // A prompt step, reached by the v1 edge, extracts first and then runs the snippet.
  assert.equal(wrapUp.type, 'prompt');
  assert.ok(flow.edges.some((edge) => edge.source === start.id && edge.target === wrapUp.id));
  assert.ok(flow.edges.some((edge) => edge.source === wrapUp.id && edge.target === code.id));
  assert.deepEqual(code.data.variables.map((row) => row.key), ['outcome']);
  assert.equal(flow.nodes.some((node) => node.type === 'end-call'), false);
  // No hang-up anywhere yet: the audit says so until the plan adds a root end-call.
  assert.equal(checks.S6.passed, false);
  assert.equal(checks.P10.passed, false);
  assert.equal(checks.P5.passed, true);
});

test('the audit does not count an End Call nothing leads to', () => {
  const { snapshot } = buildDictation({ prompt: 'Bye.' });
  const flow = flowOf(snapshot);
  const endCall = flow.nodes.find((node) => node.type === 'end-call');
  flow.edges = flow.edges.filter((edge) => edge.target !== endCall.id);
  assert.equal(runAudit(snapshot, { nodes: [], edges: [] }).S6.passed, false);
});

test('a flow that returns to the hub needs no root End Call', () => {
  const { snapshot } = buildDictation({ prompt: 'Bye.' });
  const scenario = snapshot.behavior.nodes.find((node) => node.type === 'complex-scenario');
  // A second flow whose only step hands back to the hub to route onward.
  const other = JSON.parse(JSON.stringify(scenario));
  other.id = 'other-scenario';
  other.data.name = 'Other';
  const endCallId = other.data.flow.nodes.find((node) => node.type === 'end-call').id;
  other.data.flow.nodes = other.data.flow.nodes.filter((node) => node.id !== endCallId);
  other.data.flow.edges = other.data.flow.edges.filter((edge) => edge.target !== endCallId);
  snapshot.behavior.nodes.push(other);
  assert.equal(runAudit(snapshot, { nodes: [], edges: [] }).S6.passed, true);
});

test('a v1 End Call with a code tool needs a root End Call, whatever other flows contain', () => {
  const { snapshot } = buildDictation({ prompt: 'Bye.' });
  const source = {
    nodes: [{ id: 'x', type: 'End Call', data: { name: 'Save and end', tools: [{ name: 'Save', type: 'code', config: { snippet_id: 'snip-1' } }] } }],
    edges: [],
  };
  const p10 = runAudit(snapshot, source).P10;
  assert.equal(p10.passed, false);
  assert.match(p10.detail, /Save and end/);
  snapshot.behavior.nodes.push({ id: 'root-end', type: 'end-call', data: { name: 'End call' } });
  assert.equal(runAudit(snapshot, source).P10.passed, true);
});

test('the audit fails when one of two steps sharing a variable loses its capture setting', () => {
  const { snapshot } = buildDictation({
    prompt: 'Bye.',
    extractVars: [['last_name', 'string', 'Last name']],
    captureKinds: { last_name: 'name.last' },
  });
  const source = {
    nodes: [
      { id: 'start', type: 'Default', data: { name: 'Start', captureKinds: { last_name: 'name.last' } } },
      { id: 'bye', type: 'End Call', data: { name: 'End call', captureKinds: { last_name: 'name.last' } } },
    ],
    edges: [],
  };
  assert.equal(runAudit(snapshot, source).P9.passed, true);
  const endCall = flowOf(snapshot).nodes.find((node) => node.type === 'end-call');
  for (const row of endCall.data.variables) delete row.captureAs;
  const p9 = runAudit(snapshot, source).P9;
  assert.equal(p9.passed, false);
  assert.match(p9.detail, /last_name=name\.last on 1 of 2 steps/);
});

// Runs the audit against several v1 sources at once (merged migrations).
function runAuditMerged(snapshot, sources) {
  const dir = mkdtempSync(join(tmpdir(), 'norm-audit-test-'));
  try {
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
    const args = ['--snapshot', join(dir, 'snapshot.json')];
    sources.forEach((source, k) => {
      writeFileSync(join(dir, `source${k}.json`), JSON.stringify(source));
      args.push('--source', join(dir, `source${k}.json`));
    });
    const out = execFileSync(process.execPath, [audit, ...args]).toString();
    return Object.fromEntries(JSON.parse(out).checks.map((c) => [c.id, c]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('A0 accepts whichever merged source\'s start code the plan chose as initialization', () => {
  const { snapshot } = buildDictation({ prompt: 'Bye.' });
  const startCode = (snippet) => ({ nodes: [{ id: `start-${snippet}`, type: 'Custom Code', data: { name: `Start ${snippet}`, isStart: true, snippet_id: snippet } }], edges: [] });
  const sources = [startCode('snip-a'), startCode('snip-b')];
  snapshot.initialization = { enabled: true, step: { snippetId: 'snip-b' } };
  assert.equal(runAuditMerged(snapshot, sources).A0.passed, true);
  snapshot.initialization = { enabled: true, step: { snippetId: 'snip-a' } };
  assert.equal(runAuditMerged(snapshot, sources).A0.passed, true);
  snapshot.initialization = { enabled: true, step: { snippetId: 'snip-c' } };
  const a0 = runAuditMerged(snapshot, sources).A0;
  assert.equal(a0.passed, false);
  assert.match(a0.detail, /matches none of the start code node\(s\) "Start snip-a".*"Start snip-b"/);
});

test('A4 accepts an escape a step-level global provides, unless the hold outranks globals', () => {
  const { snapshot } = buildDictation({ prompt: 'Bye.' });
  const source = { nodes: [{ id: 'x', type: 'Default', data: { prompt: 'If they want to opt out, stop.' } }], edges: [] };
  const flow = flowOf(snapshot);
  const hold = flow.nodes.find((node) => node.data && node.data.name === 'Start');
  hold.data.loopWhile = 'User confirmed their first and last name.';
  const a4Missing = runAudit(snapshot, source).A4;
  assert.equal(a4Missing.passed, false);
  assert.match(a4Missing.detail, /lacks opt-out/);
  flow.nodes.push({ id: 'g1', type: 'prompt', position: { x: 0, y: 0 }, data: { name: 'Opt out', prompt: 'Confirm removal.', settings: { global: { isGlobal: true, label: 'Caller asks to opt out', description: 'Do not call again', returnMode: 'manual' } } } });
  assert.equal(runAudit(snapshot, source).A4.passed, true);
  hold.data.settings = { ...(hold.data.settings || {}), advanced: { conditionOverridesGlobalPathway: true } };
  const a4Outranked = runAudit(snapshot, source).A4;
  assert.equal(a4Outranked.passed, false);
  assert.match(a4Outranked.detail, /conditionOverridesGlobalPathway set/);
});

const stateBin = resolve(dirname(fileURLToPath(import.meta.url)), '../../v2/bin/norm-migration-state.cjs');
const hookBin = resolve(dirname(fileURLToPath(import.meta.url)), '../../v2/bin/hook-migrate-loop.cjs');

test('a new migration loop starts without the previous one\'s dropped-tag declarations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'norm-state-test-'));
  try {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
    mkdirSync(join(dir, '.norm'), { recursive: true });
    writeFileSync(join(dir, '.norm', 'dropped-tags.json'), JSON.stringify([{ tag: 'legacy', reason: 'unreachable' }]));
    execFileSync(process.execPath, [stateBin, 'init', '--snapshot', join(dir, 'snapshot.json')], { env, stdio: ['ignore', 'ignore', 'ignore'] });
    assert.equal(existsSync(join(dir, '.norm', 'dropped-tags.json')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the Stop hook ignores a dropped-tags file older than the migration it gates', () => {
  // A6 fails on a live tag the source carries; a stale declaration must not excuse it.
  const dir = mkdtempSync(join(tmpdir(), 'norm-hook-test-'));
  try {
    const { snapshot } = buildDictation({ prompt: 'Bye.' });
    const source = { nodes: [{ id: 'x', type: 'Default', data: { prompt: 'Hi', tag: { name: 'vip' } } }], edges: [] };
    mkdirSync(join(dir, '.norm'), { recursive: true });
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
    writeFileSync(join(dir, 'source.json'), JSON.stringify(source));
    const stale = join(dir, '.norm', 'dropped-tags.json');
    writeFileSync(stale, JSON.stringify(['vip']));
    const old = new Date(Date.now() - 60_000);
    utimesSync(stale, old, old);
    // One migration, created once; the hook compares the declaration's mtime
    // against this fixed created_at, so the test never races the clock.
    const createdAt = Date.now();
    const state = { active: true, created_at: createdAt, snapshot: join(dir, 'snapshot.json'), sources: [join(dir, 'source.json')], iter: 0, max_iter: 12, push: { head: '', at: 0 }, sims: { head: '', passed: false, failing: [], at: 0 }, uncovered: [] };
    writeFileSync(join(dir, '.norm', 'migration.json'), JSON.stringify(state));
    const run = () => {
      const r = spawnSync(process.execPath, [hookBin], { input: JSON.stringify({ hook_event_name: 'Stop', cwd: dir }), env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' });
      return r.stdout + r.stderr;
    };
    assert.match(run(), /AUDIT A6 .*vip/);
    // The same declaration written for this migration (mtime after created_at) is honoured.
    writeFileSync(stale, JSON.stringify(['vip']));
    const fresh = new Date(createdAt + 5_000);
    utimesSync(stale, fresh, fresh);
    assert.doesNotMatch(run(), /AUDIT A6/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Optional consuming-repository contract check. Pass the real compiler path;
// never duplicate its implementation in this public plugin repository.
test('real v2 compiler preserves migrated transfer behavior', {
  skip: !process.env.NORM_V2_COMPILER_PATH && 'requires consuming SERVER compiler and TypeScript loader',
}, async () => {
  const imported = await import(pathToFileURL(process.env.NORM_V2_COMPILER_PATH).href);
  const compile = imported.agentConfigToPathway ?? imported.default?.agentConfigToPathway;
  const compilerDir = dirname(process.env.NORM_V2_COMPILER_PATH);
  const validationModule = await import(pathToFileURL(join(compilerDir, 'validateSnapshot.ts')).href);
  const validate = validationModule.validateSnapshot ?? validationModule.default?.validateSnapshot;
  const transferModule = await import(pathToFileURL(resolve(compilerDir, '../../types/warmTransfer.ts')).href);
  const guard = transferModule.WarmTransferFieldsValidator ?? transferModule.default?.WarmTransferFieldsValidator;
  const snapshot = materialize(input);
  const verdict = validate(snapshot);
  assert.equal(verdict.ok, true, JSON.stringify(verdict));
  const graph = compile(verdict.snapshot);
  const wt = graph.nodes.find((node) => node.type === 'Transfer Call').data.warmTransferFields;
  assert.equal(guard.Check(wt), true, JSON.stringify([...guard.Errors(wt)]));
  assert.equal(wt.isAgentPromptStatic, true);
  assert.equal(wt.isMergeCallPromptStatic, true);
  assert.equal(wt.useTimeout, true);
  assert.equal(wt.timeout, 37);
  assert.equal(wt.useCustomHoldMusic, false);
  assert.equal(wt.useVoicemailMessage, false);
  assert.notEqual(wt.optimizeForIVR, false);
  assert.equal(wt.dtmfSequence, 'w54');
  assert.deepEqual(wt.retry, input.retry);
  assert.equal(wt.allowMergeControl, true);
  const enabled = compile(materialize({ ...input, useCustomHoldMusic: true, useVoicemailMessage: true, voicemailResponseType: 'message', optimizeForIVR: false }));
  const enabledWt = enabled.nodes.find((node) => node.type === 'Transfer Call').data.warmTransferFields;
  assert.equal(guard.Check(enabledWt), true);
  assert.equal(enabledWt.useCustomHoldMusic, true);
  assert.equal(enabledWt.holdMusicUrl, input.holdMusicUrl);
  assert.equal(enabledWt.useVoicemailMessage, true);
  assert.equal(enabledWt.voicemailMessage, input.voicemailMessage);
  assert.equal(enabledWt.optimizeForIVR, false);
  const cold = compile(materialize({ ...input, isEnabled: false }));
  assert.equal(cold.nodes.find((node) => node.type === 'Transfer Call').data.warmTransferFields, undefined);
});

// A v1 outbound pathway: start code → call screener → (voicemail | greeting) →
// qualify → FAQ (knowledge) → end. Builds with the given plan and returns the
// snapshot plus the audit's checks by id; a builder refusal surfaces as the
// thrown error's stderr text.
function buildScreener(plan) {
  const dir = mkdtempSync(join(tmpdir(), 'norm-materialize-test-'));
  try {
    writeFileSync(join(dir, 'source.json'), JSON.stringify({
      nodes: [
        { id: 'start', type: 'Custom Code', data: { name: 'Set Dealer Name', isStart: true, snippet_id: 'snip-dealer', code: 'return { dealer: "Acme" };' } },
        { id: 'screener', type: 'Default', data: { name: 'Call Screener', prompt: 'If an automated screener answers, say who you are and why you are calling.', condition: 'A human has picked up.' } },
        { id: 'vm', type: 'End Call', data: { name: 'Leave Voicemail', prompt: 'Leave a short voicemail asking for a call back.' } },
        { id: 'greeting', type: 'Default', data: { name: 'Greeting', prompt: 'Greet the lead and ask if now is a good time.', condition: 'The lead confirmed they can talk.' } },
        { id: 'qualify', type: 'Default', data: { name: 'Qualify', prompt: 'Ask which vehicle they are interested in.', condition: 'The lead named a vehicle.' } },
        { id: 'faq', type: 'Knowledge Base', data: { name: 'FAQ', kbIds: ['kb-1'] } },
        { id: 'done', type: 'End Call', data: { name: 'Done', prompt: 'Thank them and say goodbye.' } },
      ],
      edges: [
        { id: 'e0', source: 'start', target: 'screener', data: { label: 'next' } },
        { id: 'e1', source: 'screener', target: 'vm', data: { label: 'Voicemail answered.' } },
        { id: 'e2', source: 'screener', target: 'greeting', data: { label: 'A human answered.' } },
        { id: 'e3', source: 'greeting', target: 'qualify', data: { label: 'Now is a good time.' } },
        { id: 'e4', source: 'qualify', target: 'faq', data: { label: 'They have a question.' } },
        { id: 'e5', source: 'faq', target: 'done', data: { label: 'Question answered.' } },
      ],
    }));
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({
      displayName: 'Synthetic', systemPrompt: 'Synthetic test only', sources: [{ file: 'source.json' }], ...plan,
    }));
    execFileSync(process.execPath, [builder, '--plan', join(dir, 'plan.json'), '--out', join(dir, 'snapshot.json')], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = execFileSync(process.execPath, [audit, '--snapshot', join(dir, 'snapshot.json'), '--source', join(dir, 'source.json')]).toString();
    const checks = Object.fromEntries(JSON.parse(out).checks.map((c) => [c.id, c]));
    return { snapshot: JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8')), checks };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const REASON = 'Outbound dials hit call screeners and voicemail before any human; answer detection must run before the hub greets.';
const entry = { label: 'Answer detection', description: 'Every call starts here.' };

test('a Start scenario may speak to handle screeners and voicemail (A1 passes, initialization carried)', () => {
  const { snapshot, checks } = buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [
      { name: 'Answer detection', entry, members: ['screener', 'vm'] },
      { name: 'Qualify', entry: { label: 'Qualify', description: 'Human answered and can talk' }, members: ['greeting', 'qualify'] },
      { name: 'FAQ', entry: { label: 'FAQ', description: 'The lead has a question' }, members: ['faq', 'done'] },
    ],
  });
  assert.equal(snapshot.initialization.enabled, true);
  assert.equal(snapshot.initialization.step.snippetId, 'snip-dealer');
  assert.equal(checks.A0.passed, true, checks.A0.detail);
  assert.equal(checks.A1.passed, true, checks.A1.detail);
  assert.equal(checks.A2.passed, true, checks.A2.detail);
});

test('the builder refuses a Knowledge Base member in the Start scenario', () => {
  assert.throws(() => buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [
      { name: 'Answer detection', entry, members: ['screener', 'vm', 'faq'] },
      { name: 'Qualify', entry: { label: 'Qualify', description: 'Human answered' }, members: ['greeting', 'qualify'] },
      { name: 'Done', entry: { label: 'Done', description: 'Wrap up' }, members: ['done'] },
    ],
  }), (err) => /call-body node\(s\): FAQ \(Knowledge Base\)/.test(String(err.stderr)));
});

test('a Start scenario holding the call body fails A1 on the step budget', () => {
  const { checks } = buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [
      { name: 'Answer detection', entry, members: ['screener', 'vm', 'greeting', 'qualify', 'done'] },
      { name: 'FAQ', entry: { label: 'FAQ', description: 'The lead has a question' }, members: ['faq'] },
    ],
    endCalls: [{ name: 'Opt out', entry: { label: 'Opt out', description: 'The lead asks not to be called again' }, prompt: 'Confirm and say goodbye.' }],
  });
  assert.equal(checks.A1.passed, false);
  assert.match(checks.A1.detail, /budget is a third/);
});

test('a Start scenario without a written reason is refused', () => {
  assert.throws(() => buildScreener({
    entryScenario: 'Answer detection',
    scenarios: [
      { name: 'Answer detection', entry, members: ['screener', 'vm'] },
      { name: 'Qualify', entry: { label: 'Qualify', description: 'Human answered' }, members: ['greeting', 'qualify', 'faq', 'done'] },
    ],
  }), (err) => /entryScenarioReason/.test(String(err.stderr)));
});
