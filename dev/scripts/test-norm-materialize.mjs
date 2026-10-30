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
// qualify → FAQ (knowledge) → end, plus a dealership transfer. Hold conditions
// name the escapes the source handles (voicemail, screener, call back) so A4
// is satisfiable.
const SCREENER_SOURCE = {
  nodes: [
    { id: 'start', type: 'Custom Code', data: { name: 'Set Dealer Name', isStart: true, snippet_id: 'snip-dealer', code: 'return { dealer: "Acme" };' } },
    { id: 'screener', type: 'Default', data: { name: 'Call Screener', prompt: 'If an automated screener answers, say who you are and why you are calling.', condition: 'A human has picked up, voicemail answered, the automated screener asked for a response, or the person asked for a call back or to be transferred.' } },
    { id: 'vm', type: 'End Call', data: { name: 'Leave Voicemail', prompt: 'Leave a short voicemail asking for a call back.' } },
    { id: 'greeting', type: 'Default', data: { name: 'Greeting', prompt: 'Greet the lead and ask if now is a good time.', condition: 'The lead said whether now is a good time, asked for a call back or a transfer, or voicemail / an automated screener answered.' } },
    { id: 'qualify', type: 'Default', data: { name: 'Qualify', prompt: 'Ask which vehicle they are interested in.' } },
    { id: 'faq', type: 'Knowledge Base', data: { name: 'FAQ', kbIds: ['kb-1'] } },
    { id: 'handoff', type: 'Transfer Call', data: { name: 'Transfer to Dealership', transferNumber: '+18005550100' } },
    { id: 'done', type: 'End Call', data: { name: 'Done', prompt: 'Thank them and say goodbye.' } },
  ],
  edges: [
    { id: 'e0', source: 'start', target: 'screener', data: { label: 'next' } },
    { id: 'e1', source: 'screener', target: 'vm', data: { label: 'Voicemail answered.' } },
    { id: 'e2', source: 'screener', target: 'greeting', data: { label: 'A human answered.' } },
    { id: 'e3', source: 'greeting', target: 'qualify', data: { label: 'Now is a good time.' } },
    { id: 'e4', source: 'qualify', target: 'faq', data: { label: 'They have a question.' } },
    { id: 'e5', source: 'qualify', target: 'handoff', data: { label: 'They want to speak to the dealership.' } },
    { id: 'e6', source: 'faq', target: 'done', data: { label: 'Question answered.' } },
  ],
};
function auditOf(snapshot, source) {
  const dir = mkdtempSync(join(tmpdir(), 'norm-audit-test-'));
  try {
    writeFileSync(join(dir, 'source.json'), JSON.stringify(source));
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
    const out = execFileSync(process.execPath, [audit, '--snapshot', join(dir, 'snapshot.json'), '--source', join(dir, 'source.json')]).toString();
    return Object.fromEntries(JSON.parse(out).checks.map((c) => [c.id, c]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
// Builds SCREENER_SOURCE with the given plan; returns the snapshot and the
// audit's checks by id. A builder refusal surfaces as the thrown error's stderr.
function buildScreener(plan) {
  const dir = mkdtempSync(join(tmpdir(), 'norm-materialize-test-'));
  try {
    writeFileSync(join(dir, 'source.json'), JSON.stringify(SCREENER_SOURCE));
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({
      displayName: 'Synthetic', systemPrompt: 'Synthetic test only', sources: [{ file: 'source.json' }], ...plan,
    }));
    execFileSync(process.execPath, [builder, '--plan', join(dir, 'plan.json'), '--out', join(dir, 'snapshot.json')], { stdio: ['ignore', 'pipe', 'pipe'] });
    const snapshot = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
    return { snapshot, checks: auditOf(snapshot, SCREENER_SOURCE) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const REASON = 'Outbound dials hit call screeners and voicemail before any human; answer detection must run before the hub greets.';
const entry = { label: 'Answer detection', description: 'Every call starts here.' };
const BODY = [
  { name: 'Qualify', entry: { label: 'Qualify', description: 'Human answered and can talk' }, members: ['greeting', 'qualify'] },
  { name: 'FAQ', entry: { label: 'FAQ', description: 'The lead has a question' }, members: ['faq', 'done'] },
  { name: 'Transfer to Dealership', entry: { label: 'Transfer', description: 'The lead wants the dealership' }, members: ['handoff'] },
];

test('a Start scenario may speak to handle screeners and voicemail (full architecture audit passes, initialization carried)', () => {
  const { snapshot, checks } = buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [{ name: 'Answer detection', entry, members: ['screener', 'vm'] }, ...BODY],
  });
  assert.equal(snapshot.initialization.enabled, true);
  assert.equal(snapshot.initialization.step.snippetId, 'snip-dealer');
  for (const id of ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6']) assert.equal(checks[id].passed, true, `${id}: ${checks[id].detail}`);
});

test('A1 rejects every call-body step type inside a small Start (budget cannot hide it)', () => {
  const { snapshot } = buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [{ name: 'Answer detection', entry, members: ['screener', 'vm'] }, ...BODY],
  });
  const startFlow = snapshot.behavior.nodes.find((node) => node.type === 'complex-scenario' && node.data.name === 'Answer detection').data.flow;
  const stepData = {
    knowledge: { name: 'FAQ', kbIds: ['kb-1'] },
    scheduling: { name: 'Book', prompt: 'Book a slot.' },
    smsOtp: { name: 'OTP', prompt: 'Verify the code.' },
    identityQuestions: { name: 'Verify', prompt: 'Confirm identity.' },
    transfer: { name: 'Transfer to Dealership', transferNumber: '+18005550100' },
    transferPathway: { name: 'Hand off', pathwayId: 'p-1' },
  };
  for (const [type, data] of Object.entries(stepData)) {
    const injected = structuredClone(snapshot);
    const flow = injected.behavior.nodes.find((node) => node.type === 'complex-scenario' && node.data.name === 'Answer detection').data.flow;
    flow.nodes.push({ id: `injected-${type}`, type, position: { x: 0, y: 0 }, data });
    assert.equal(startFlow.nodes.filter((node) => node.type !== 'start' && node.type !== 'end').length + 1 <= 4, true);
    const checks = auditOf(injected, SCREENER_SOURCE);
    assert.equal(checks.A1.passed, false, `${type} passed A1`);
    assert.match(checks.A1.detail, new RegExp(`core-logic step\\(s\\) in Start: .*\\(${type}\\)`));
  }
});

test('the builder refuses Knowledge Base and Transfer Call members in the Start scenario', () => {
  for (const [member, label] of [['faq', 'FAQ \\(Knowledge Base\\)'], ['handoff', 'Transfer to Dealership \\(Transfer Call\\)']]) {
    assert.throws(() => buildScreener({
      entryScenario: 'Answer detection', entryScenarioReason: REASON,
      scenarios: [
        { name: 'Answer detection', entry, members: ['screener', 'vm', member] },
        ...BODY.map((sc) => ({ ...sc, members: sc.members.filter((id) => id !== member) })).filter((sc) => sc.members.length > 0),
      ],
    }), (err) => new RegExp(`call-body node\\(s\\): ${label}`).test(String(err.stderr)), member);
  }
});

test('a Start scenario holding the call body fails A1 on the step budget', () => {
  const { checks } = buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [
      { name: 'Answer detection', entry, members: ['screener', 'vm', 'greeting', 'qualify', 'done'] },
      { name: 'FAQ', entry: { label: 'FAQ', description: 'The lead has a question' }, members: ['faq'] },
      { name: 'Transfer to Dealership', entry: { label: 'Transfer', description: 'The lead wants the dealership' }, members: ['handoff'] },
    ],
  });
  assert.equal(checks.A1.passed, false);
  assert.match(checks.A1.detail, /budget is a third/);
});

test('a Start scenario without a written reason is refused', () => {
  assert.throws(() => buildScreener({
    entryScenario: 'Answer detection',
    scenarios: [{ name: 'Answer detection', entry, members: ['screener', 'vm'] }, ...BODY],
  }), (err) => /entryScenarioReason/.test(String(err.stderr)));
});

test('a node folded into the hub prompt still owes its extraction variable; a declared node drop excuses it', () => {
  const { snapshot } = buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [{ name: 'Answer detection', entry, members: ['screener', 'vm'] }, ...BODY],
  });
  // Fold Greeting into the hub: remove its step, paste its words into the hub prompt, give the source an extraction on it.
  const source = structuredClone(SCREENER_SOURCE);
  source.nodes.find((n) => n.id === 'greeting').data.extractVars = [['first_name', 'string', 'First name']];
  const folded = structuredClone(snapshot);
  const qualify = folded.behavior.nodes.find((n) => n.type === 'complex-scenario' && n.data.name === 'Qualify').data.flow;
  qualify.nodes = qualify.nodes.filter((n) => !(n.data && n.data.name === 'Greeting'));
  qualify.edges = qualify.edges.filter((e) => qualify.nodes.some((n) => n.id === e.source) && qualify.nodes.some((n) => n.id === e.target));
  const hub = folded.behavior.nodes.find((n) => n.type === 'agent');
  hub.data.prompt = `${hub.data.prompt}\nGreet the lead and ask if now is a good time.`;
  const checks = auditOf(folded, source);
  assert.equal(checks.P11.passed, true, checks.P11.detail);
  assert.equal(checks.P12.passed, true, checks.P12.detail);
  assert.equal(checks.P14.passed, false);
  assert.match(checks.P14.detail, /Greeting\.first_name/);
  const dir = mkdtempSync(join(tmpdir(), 'norm-audit-test-'));
  try {
    writeFileSync(join(dir, 'source.json'), JSON.stringify(source));
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(folded));
    writeFileSync(join(dir, 'drops.json'), JSON.stringify([{ node: 'Greeting', reason: 'the hub greets' }]));
    const out = execFileSync(process.execPath, [audit, '--snapshot', join(dir, 'snapshot.json'), '--source', join(dir, 'source.json'), '--dropped-tags', join(dir, 'drops.json')]).toString();
    const declared = Object.fromEntries(JSON.parse(out).checks.map((c) => [c.id, c]));
    assert.equal(declared.P14.passed, true, declared.P14.detail);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a drawn but disconnected exit pill fails A1 and makes the root end-calls unreachable (A3)', () => {
  const { snapshot } = buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [{ name: 'Answer detection', entry, members: ['screener', 'vm'] }, ...BODY],
    endCalls: [{ name: 'Opt out', entry: { label: 'Opt out', description: 'The lead asks not to be called again' }, prompt: 'Confirm and say goodbye.' }],
  });
  const cut = structuredClone(snapshot);
  const start = cut.behavior.nodes.find((n) => n.type === 'complex-scenario' && n.data.name === 'Answer detection').data.flow;
  const endPill = start.nodes.find((n) => n.type === 'end');
  start.edges = start.edges.filter((e) => e.target !== endPill.id);
  const checks = auditOf(cut, SCREENER_SOURCE);
  assert.equal(checks.A1.passed, false);
  assert.match(checks.A1.detail, /no exit pill/);
  assert.equal(checks.A3.passed, false);
});

test('A0 fails when initialization runs a different version of the start snippet', () => {
  const { snapshot } = buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [{ name: 'Answer detection', entry, members: ['screener', 'vm'] }, ...BODY],
  });
  const source = structuredClone(SCREENER_SOURCE);
  source.nodes.find((n) => n.id === 'start').data.snippet_version = 4;
  const wrong = structuredClone(snapshot);
  wrong.initialization.step.snippetVersion = 3;
  const checks = auditOf(wrong, source);
  assert.equal(checks.A0.passed, false);
  assert.match(checks.A0.detail, /matches none/);
});

test('a declared node drop also releases its edge descriptions (P13)', () => {
  const { snapshot } = buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [{ name: 'Answer detection', entry, members: ['screener', 'vm'] }, ...BODY],
  });
  const source = structuredClone(SCREENER_SOURCE);
  source.edges.find((e) => e.id === 'e3').data.description = 'The lead confirmed now is a good time to talk.';
  const folded = structuredClone(snapshot);
  const qualify = folded.behavior.nodes.find((n) => n.type === 'complex-scenario' && n.data.name === 'Qualify').data.flow;
  qualify.nodes = qualify.nodes.filter((n) => !(n.data && n.data.name === 'Greeting'));
  qualify.edges = qualify.edges.filter((e) => qualify.nodes.some((n) => n.id === e.source) && qualify.nodes.some((n) => n.id === e.target));
  const hub = folded.behavior.nodes.find((n) => n.type === 'agent');
  hub.data.prompt = `${hub.data.prompt}\nGreet the lead and ask if now is a good time.`;
  assert.equal(auditOf(folded, source).P13.passed, false);
  const dir = mkdtempSync(join(tmpdir(), 'norm-audit-test-'));
  try {
    writeFileSync(join(dir, 'source.json'), JSON.stringify(source));
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(folded));
    writeFileSync(join(dir, 'drops.json'), JSON.stringify([{ node: 'Greeting', reason: 'the hub greets' }]));
    const out = execFileSync(process.execPath, [audit, '--snapshot', join(dir, 'snapshot.json'), '--source', join(dir, 'source.json'), '--dropped-tags', join(dir, 'drops.json')]).toString();
    assert.equal(Object.fromEntries(JSON.parse(out).checks.map((c) => [c.id, c])).P13.passed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exit reachability: a global step with a forwarding exit counts, a draft response pathway does not', () => {
  const { snapshot } = buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [{ name: 'Answer detection', entry, members: ['screener', 'vm'] }, ...BODY],
  });
  const cut = structuredClone(snapshot);
  const start = cut.behavior.nodes.find((n) => n.type === 'complex-scenario' && n.data.name === 'Answer detection').data.flow;
  const endPill = start.nodes.find((n) => n.type === 'end');
  start.edges = start.edges.filter((e) => e.target !== endPill.id);
  // A draft tool-step row (no variable) pointing at the exit is not a route.
  const draft = structuredClone(cut);
  draft.behavior.nodes.find((n) => n.type === 'complex-scenario' && n.data.name === 'Answer detection').data.flow.nodes.push({
    id: 'lookup', type: 'tool', position: { x: 0, y: 0 }, data: { name: 'Lookup', toolId: 'TL-1', responsePathways: [{ id: 'rp', label: '', variable: '', operator: '==', value: '', targetNodeId: endPill.id }] },
  });
  const draftFlow = draft.behavior.nodes.find((n) => n.type === 'complex-scenario' && n.data.name === 'Answer detection').data.flow;
  draftFlow.edges.push({ id: 'to-lookup', source: draftFlow.nodes.find((n) => n.type === 'start').id, target: 'lookup' });
  assert.equal(auditOf(draft, SCREENER_SOURCE).A1.passed, false);
  // A global step (no incoming edge) that forwards to the exit is a real route.
  const viaGlobal = structuredClone(cut);
  viaGlobal.behavior.nodes.find((n) => n.type === 'complex-scenario' && n.data.name === 'Answer detection').data.flow.nodes.push({
    id: 'escape', type: 'prompt', position: { x: 0, y: 0 },
    data: { name: 'Escape', prompt: 'Say goodbye.', settings: { global: { isGlobal: true, label: 'Opt out', description: 'The lead opts out.', returnMode: 'redirect', forwardingNode: endPill.id } } },
  });
  assert.equal(auditOf(viaGlobal, SCREENER_SOURCE).A1.passed, true, auditOf(viaGlobal, SCREENER_SOURCE).A1.detail);
  // A global that returns to the interrupted step never takes its drawn edge.
  const returning = structuredClone(cut);
  const returningFlow = returning.behavior.nodes.find((n) => n.type === 'complex-scenario' && n.data.name === 'Answer detection').data.flow;
  returningFlow.nodes.push({ id: 'aside', type: 'prompt', position: { x: 0, y: 0 }, data: { name: 'Aside', prompt: 'Answer, then resume.', settings: { global: { isGlobal: true, label: 'Question', description: 'The lead asks something.', returnMode: 'previous', forwardingNode: '' } } } });
  returningFlow.edges.push({ id: 'aside-exit', source: 'aside', target: endPill.id });
  assert.equal(auditOf(returning, SCREENER_SOURCE).A1.passed, false);
  // A manual global keeps its own drawn edges live, so its edge to the exit is a route.
  const manual = structuredClone(returning);
  const aside = manual.behavior.nodes.find((n) => n.type === 'complex-scenario' && n.data.name === 'Answer detection').data.flow.nodes.find((n) => n.id === 'aside');
  aside.data.settings.global.returnMode = 'manual';
  assert.equal(auditOf(manual, SCREENER_SOURCE).A1.passed, true, auditOf(manual, SCREENER_SOURCE).A1.detail);
  // A global flag on a step type the compiler emits no settings for never reaches the runtime.
  const smsGlobal = structuredClone(manual);
  const smsNode = smsGlobal.behavior.nodes.find((n) => n.type === 'complex-scenario' && n.data.name === 'Answer detection').data.flow.nodes.find((n) => n.id === 'aside');
  smsNode.type = 'sms';
  smsNode.data = { name: 'Aside', message: 'Hi', fromNumber: '', settings: smsNode.data.settings };
  assert.equal(auditOf(smsGlobal, SCREENER_SOURCE).A1.passed, false);
  // A warm transfer's resume-on-no-answer step is a route to the exit.
  const viaTransfer = structuredClone(cut);
  const tFlow = viaTransfer.behavior.nodes.find((n) => n.type === 'complex-scenario' && n.data.name === 'Answer detection').data.flow;
  tFlow.nodes.push({ id: 'handoff', type: 'transfer', position: { x: 0, y: 0 }, data: { name: 'Handoff', transferNumber: '+18005550100', warmTransfer: { enabled: true, voicemailTargetStepId: endPill.id } } });
  tFlow.edges.push({ id: 'to-handoff', source: tFlow.nodes.find((n) => n.type === 'start').id, target: 'handoff' });
  // (A transfer inside Start is itself a core-logic A1 failure; the exit is what this asserts.)
  const viaTransferChecks = auditOf(viaTransfer, SCREENER_SOURCE);
  assert.doesNotMatch(viaTransferChecks.A1.detail, /no exit pill/);
  assert.equal(viaTransferChecks.A3.passed, true, viaTransferChecks.A3.detail);
});

test('A0/P11: a numeric-string source pin matches the same numeric version', () => {
  const { snapshot } = buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [{ name: 'Answer detection', entry, members: ['screener', 'vm'] }, ...BODY],
  });
  const source = structuredClone(SCREENER_SOURCE);
  source.nodes.find((n) => n.id === 'start').data.snippet_version = '3';
  const pinned = structuredClone(snapshot);
  pinned.initialization.step.snippetVersion = 3;
  const checks = auditOf(pinned, source);
  assert.equal(checks.A0.passed, true, checks.A0.detail);
  assert.equal(checks.P11.passed, true, checks.P11.detail);
});

test('A0: a missing initialization version does not satisfy a pinned source', () => {
  const { snapshot } = buildScreener({
    entryScenario: 'Answer detection', entryScenarioReason: REASON,
    scenarios: [{ name: 'Answer detection', entry, members: ['screener', 'vm'] }, ...BODY],
  });
  const source = structuredClone(SCREENER_SOURCE);
  source.nodes.find((n) => n.id === 'start').data.snippet_version = 3;
  const unversioned = structuredClone(snapshot);
  delete unversioned.initialization.step.snippetVersion;
  assert.equal(auditOf(unversioned, source).A0.passed, false);
  assert.equal(auditOf(unversioned, SCREENER_SOURCE).A0.passed, true);
});


// ── voice/language carry, by-reference tools, hollow-tool and edge-condition audits ──

// Builds one source (+ optional persona) with the given plan fields; returns
// the snapshot, the builder's stdout report, and the audit's checks by id.
function buildWith({ source, persona, plan = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'norm-materialize-test-'));
  try {
    writeFileSync(join(dir, 'source.json'), JSON.stringify(source));
    if (persona) writeFileSync(join(dir, 'persona.json'), JSON.stringify(persona));
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({
      displayName: 'Synthetic', systemPrompt: 'Synthetic test only',
      sources: [{ file: 'source.json' }],
      ...(persona ? { persona: 'persona.json' } : {}),
      scenarios: [{ name: 'Main', entry: { label: 'Main', description: 'The caller needs help' }, members: source.nodes.map((n) => n.id) }],
      ...plan,
    }));
    const report = JSON.parse(execFileSync(process.execPath, [builder, '--plan', join(dir, 'plan.json'), '--out', join(dir, 'snapshot.json')]).toString());
    const snapshot = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
    return { snapshot, report, checks: auditOf(snapshot, source) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const ONE_STEP = { nodes: [{ id: 'hello', type: 'Default', data: { name: 'Hello', prompt: 'Greet the caller and ask how you can help.' } }], edges: [] };
const PERSONA = (callConfig) => ({ personality_prompt: 'Synthetic test only', pathway_conditions: [], call_config: callConfig });

test('the source voice and language carry into settings', () => {
  const { snapshot } = buildWith({ source: ONE_STEP, persona: PERSONA({ voice: '<voice-uuid>', language: 'en-GB' }) });
  assert.equal(snapshot.settings.voice, '<voice-uuid>');
  assert.deepEqual(snapshot.settings.languages, ['en-GB']);
  assert.equal(snapshot.settings.importWarnings, undefined);
});

test('a legacy language code carries as the code it stands for', () => {
  assert.deepEqual(buildWith({ source: ONE_STEP, persona: PERSONA({ voice: '<voice-uuid>', language: 'ESP' }) }).snapshot.settings.languages, ['es']);
  assert.deepEqual(buildWith({ source: ONE_STEP, persona: PERSONA({ voice: '<voice-uuid>', language: 'en-BETA' }) }).snapshot.settings.languages, ['auto']);
});

test('a source with no voice or language keeps the defaults and says so in importWarnings', () => {
  for (const persona of [undefined, PERSONA({ language: 'ENG' })]) {
    const { snapshot, report } = buildWith({ source: ONE_STEP, persona });
    assert.equal(snapshot.settings.voice, '');
    assert.deepEqual(snapshot.settings.languages, ['english']);
    const byField = Object.fromEntries(snapshot.settings.importWarnings.map((w) => [w.field, w]));
    assert.equal(typeof byField.voice.code, 'string');
    assert.match(byField.voice.message, /voice/);
    assert.match(byField.languages.message, /language/);
    assert.ok(report.warnings.some((w) => /voice/.test(w)));
  }
});

test('a v1 tool that only names a library tool is attached by reference, with no embedded placeholder', () => {
  const source = { nodes: [{ id: 'hello', type: 'Default', data: {
    name: 'Hello', prompt: 'Look up the order.',
    tools: [
      { name: 'Order lookup', description: 'Find the order', type: 'custom_tool', config: { tool_id: 'TL-11111111-2222', tool_overrides: { 'body.store': '<store>' } } },
      { name: 'Embedded', type: 'custom_tool', config: { tool_id: 'TL-33333333-4444', tool: { tool: { name: 'Embedded', description: 'Inline', integration: 'rest_api', action: 'post', body: { url: 'https://example.invalid' } } } } },
    ],
  } }], edges: [] };
  const { snapshot, checks } = buildWith({ source });
  const [ref, embedded] = flowOf(snapshot).nodes.find((n) => n.data && n.data.name === 'Hello').data.tools;
  assert.equal(ref.byReference, true);
  assert.equal(ref.toolId, 'TL-11111111-2222');
  assert.deepEqual(ref.toolOverrides, { 'body.store': '<store>' });
  assert.equal(ref.definition.integration, undefined);
  assert.equal(ref.definition.action, undefined);
  assert.equal(embedded.byReference, undefined);
  assert.equal(embedded.toolOverrides, undefined);
  assert.equal(embedded.definition.action, 'post');
  assert.equal(checks.S9.passed, true, checks.S9.detail);
});

test('the audit flags a hollow attached tool (library id, not by reference, no real definition)', () => {
  const { snapshot } = buildDictation({ prompt: 'Bye.', tools: [{ name: 'Log outcome', type: 'custom_tool', config: { tool_id: 'TL-11111111-2222' } }] });
  const tool = flowOf(snapshot).nodes.find((n) => n.type === 'end-call').data.tools[0];
  delete tool.byReference;
  tool.definition = { name: 'Log outcome', integration: 'rest_api', action: 'get' };
  const s9 = runAudit(snapshot, { nodes: [], edges: [] }).S9;
  assert.equal(s9.passed, false);
  assert.match(s9.detail, /Log outcome/);
});

test('deterministic v1 edges carry operator AND/OR and a conditionOperator the audit accepts', () => {
  const source = {
    nodes: [
      { id: 'a', type: 'Default', data: { name: 'Ask', prompt: 'Ask for the account status.' } },
      { id: 'b', type: 'Default', data: { name: 'Active', prompt: 'Help the active account.' } },
      { id: 'c', type: 'Default', data: { name: 'Closed', prompt: 'Explain the account is closed.' } },
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'b', data: { label: 'Active', condition: [
        { field: 'status', operator: 'AND', conditionOperator: 'equals', value: 'active' },
        { field: 'balance', operator: 'OR', conditionOperator: 'greater than', value: '0' },
      ] } },
      { id: 'e2', source: 'a', target: 'c', data: { label: 'Closed', condition: [{ field: 'status', operator: 'equals exact', value: 'closed' }] } },
    ],
  };
  const { snapshot, checks } = buildWith({ source });
  const flow = flowOf(snapshot);
  const rows = (label) => flow.edges.find((e) => e.data.label === label).data.conditions.map(({ id, ...row }) => row);
  assert.deepEqual(rows('Active'), [
    { field: 'status', operator: 'AND', conditionOperator: 'equals', value: 'active' },
    { field: 'balance', operator: 'OR', conditionOperator: 'greater than', value: '0' },
  ]);
  assert.deepEqual(rows('Closed'), [{ field: 'status', operator: 'AND', conditionOperator: 'equals', value: 'closed' }]);
  assert.equal(checks.R5.passed, true, checks.R5.detail);
});

test('the audit flags an edge row with a comparison in operator or an unknown conditionOperator', () => {
  const { snapshot } = buildDictation({ prompt: 'Bye.' });
  const flow = flowOf(snapshot);
  const edge = flow.edges.find((e) => e.data && e.data.label === 'Caller confirmed the information.');
  edge.data = { mode: 'deterministic', label: 'Confirmed', description: '', alwaysPick: false, conditions: [{ id: 'r1', field: 'confirmed', operator: 'equals', value: 'true' }] };
  const r5 = runAudit(snapshot, { nodes: [], edges: [] }).R5;
  assert.equal(r5.passed, false);
  assert.match(r5.detail, /operator "equals"/);
  edge.data.conditions = [{ id: 'r1', field: 'confirmed', operator: 'AND', conditionOperator: '==', value: 'true' }];
  assert.match(runAudit(snapshot, { nodes: [], edges: [] }).R5.detail, /conditionOperator "=="/);
  edge.data.conditions = [{ id: 'r1', field: 'confirmed', operator: 'AND', conditionOperator: 'is', value: 'true' }];
  assert.equal(runAudit(snapshot, { nodes: [], edges: [] }).R5.passed, true);
});

test('an explicit empty plan.voice picks the default voice over the persona voice', () => {
  const { snapshot } = buildWith({ source: ONE_STEP, persona: PERSONA({ voice: '<voice-uuid>', language: 'en-GB' }), plan: { voice: '' } });
  assert.equal(snapshot.settings.voice, '');
  assert.equal(snapshot.settings.importWarnings.find((w) => w.field === 'voice').code, 'voice_not_carried');
  assert.equal(buildWith({ source: ONE_STEP, persona: PERSONA({ voice: '<voice-uuid>' }), plan: { voice: '<other-voice>' } }).snapshot.settings.voice, '<other-voice>');
  assert.equal(buildWith({ source: ONE_STEP, persona: PERSONA({ voice: '<voice-uuid>' }) }).snapshot.settings.voice, '<voice-uuid>');
});

// v1 ANDs a group's rows; an empty group is an AND over nothing, so it is
// always true, and v1 ORs it with the edge's other rows.
const ALWAYS_TRUE = [
  { field: 'v1_empty_group', operator: 'AND', conditionOperator: 'is', value: 'undefined' },
  { field: 'v1_empty_group', operator: 'OR', conditionOperator: 'is', value: 'not undefined' },
];
function emptyGroupSource(condition) {
  return {
    nodes: [
      { id: 'a', type: 'Default', data: { name: 'Ask', prompt: 'Ask for the account status.' } },
      { id: 'b', type: 'Default', data: { name: 'Next', prompt: 'Carry on.' } },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b', data: { label: 'Go on', condition } }],
  };
}

test('a v1 edge with an empty condition group always matches, alone or ORed with other rows', () => {
  for (const condition of [
    [{ isGroup: true, conditions: [] }],
    [{ field: 'status', operator: 'equals', value: 'active' }, { isGroup: true, conditions: [] }],
    [{ isGroup: true, conditions: [{ field: 'a', operator: 'equals', value: '1' }, { field: 'b', operator: 'equals', value: '2' }] }, { isGroup: true, conditions: [] }],
  ]) {
    const { snapshot, report, checks } = buildWith({ source: emptyGroupSource(condition) });
    const edges = flowOf(snapshot).edges.filter((e) => e.data && e.data.label === 'Go on');
    assert.equal(edges.length, 1);
    assert.equal(edges[0].data.mode, 'deterministic');
    assert.deepEqual(edges[0].data.conditions.map(({ id, ...row }) => row), ALWAYS_TRUE);
    assert.ok(report.warnings.some((w) => /empty condition group is always true/.test(w)));
    assert.equal(checks.R5.passed, true, checks.R5.detail);
  }
});

// Rule 2 holds an empty group, so v1 never gets past it: rules 3 and 4 and the
// old fallback never fire. Other (and Other follow-up, reached only from
// Other) are dead in v1; Gold stays, as rule 1 still reaches it.
const EMPTY_GROUP_ROUTE = {
  nodes: [
    { id: 'r', type: 'Route', data: { name: 'Branch', fallbackNodeId: 'z', routes: [
      { targetNodeId: 'x', conditions: [{ field: 'tier', operator: 'equals', value: 'gold' }] },
      { targetNodeId: 'y', conditions: [{ field: 'tier', operator: 'equals', value: 'silver' }, { isGroup: true, conditions: [] }, { field: 'tier', operator: 'equals', value: 'bronze' }] },
      { targetNodeId: 'z', conditions: [{ field: 'tier', operator: 'equals', value: 'lead' }] },
      { targetNodeId: 'x', conditions: [{ field: 'tier', operator: 'equals', value: 'platinum' }] },
    ] } },
    { id: 'x', type: 'Default', data: { name: 'Gold', prompt: 'Thank the caller for being a gold member.' } },
    { id: 'y', type: 'Default', data: { name: 'Silver', prompt: 'Thank the caller for being a silver member.' } },
    { id: 'z', type: 'Default', data: { name: 'Other', prompt: 'Tell the caller about the other membership tiers.', tag: { name: 'other-tier', color: '#888888' } } },
    { id: 'w', type: 'Default', data: { name: 'Other follow-up', prompt: 'Ask which other tier interests the caller.' } },
    { id: 'bye', type: 'End Call', data: { name: 'Goodbye', prompt: 'Say goodbye to the caller and end the call.' } },
    { id: 'h', type: 'Default', data: { name: 'Hours', prompt: 'Tell the caller the office hours.' } },
  ],
  edges: [
    { id: 'e1', source: 'x', target: 'bye', data: { label: 'Done', description: 'The caller has nothing else.' } },
    { id: 'e2', source: 'y', target: 'bye', data: { label: 'Done', description: 'The caller has nothing else.' } },
    { id: 'e3', source: 'z', target: 'w', data: { label: 'Interested', description: 'The caller wants another tier.' } },
  ],
};
const EMPTY_GROUP_PLAN = { scenarios: [
  { name: 'Membership', entry: { label: 'Membership', description: 'The caller asks about their membership' }, members: ['r', 'x', 'y', 'z', 'w', 'bye'] },
  { name: 'Hours', entry: { label: 'Hours', description: 'The caller asks about office hours' }, members: ['h'] },
] };
test('a v1 route rule with an empty condition group becomes the fallback; later rules drop', () => {
  const { snapshot, report } = buildWith({ source: EMPTY_GROUP_ROUTE, plan: EMPTY_GROUP_PLAN });
  const flow = flowOf(snapshot);
  const idOf = (name) => flow.nodes.find((n) => n.data && n.data.name === name).id;
  const route = flow.nodes.find((n) => n.type === 'route').data;
  assert.deepEqual(route.rules.map((r) => [r.targetNodeId, r.conditions.map((c) => c.value)]), [
    [idOf('Gold'), ['gold']],
    [idOf('Silver'), ['silver']],
  ]);
  assert.equal(route.fallbackNodeId, idOf('Silver'));
  assert.ok(report.warnings.some((w) => /route "Branch": an empty condition group is always true/.test(w)));
});

test('steps only the cut-off rules reached are dropped and recorded, and the full audit passes', () => {
  const { snapshot, report, checks } = buildWith({ source: EMPTY_GROUP_ROUTE, plan: EMPTY_GROUP_PLAN });
  const names = flowOf(snapshot).nodes.map((n) => n.data && n.data.name).filter(Boolean);
  assert.deepEqual(names.sort(), ['Branch', 'Gold', 'Goodbye', 'Silver']);
  assert.deepEqual(report.dropped.map((d) => [d.node, d.name]).sort(), [['w', 'Other follow-up'], ['z', 'Other']]);
  for (const d of report.dropped) assert.match(d.reason, /unreachable in v1: route "Branch" has an always-true empty condition group/);
  assert.equal(report.warnings.some((w) => /NOT covered by any scenario/.test(w)), false);
  const failed = Object.values(checks).filter((c) => !c.passed);
  assert.deepEqual(failed, [], JSON.stringify(failed));
  assert.match(checks.P11.detail, /dropped, unreachable in v1.*Other \(behind route "Branch"\)/);
  // The audit does not excuse a node the source still reaches: drop Gold too
  // and P11 fails, since rule 1 still leads there.
  const flow = flowOf(snapshot);
  const gold = flow.nodes.find((n) => n.data && n.data.name === 'Gold');
  flow.nodes = flow.nodes.filter((n) => n !== gold);
  flow.edges = flow.edges.filter((e) => e.source !== gold.id && e.target !== gold.id);
  const route = flow.nodes.find((n) => n.type === 'route').data;
  route.rules = route.rules.filter((r) => r.targetNodeId !== gold.id);
  const p11 = runAudit(snapshot, EMPTY_GROUP_ROUTE).P11;
  assert.equal(p11.passed, false);
  assert.match(p11.detail, /Gold — node not carried and not declared dropped/);
});

test('a cut-off target that something else still reaches is kept', () => {
  const source = structuredClone(EMPTY_GROUP_ROUTE);
  source.edges.push({ id: 'e4', source: 'y', target: 'z', data: { label: 'Other tiers', description: 'The caller asks about other tiers.' } });
  const { snapshot, report, checks } = buildWith({ source, plan: EMPTY_GROUP_PLAN });
  const names = flowOf(snapshot).nodes.map((n) => n.data && n.data.name).filter(Boolean);
  assert.ok(names.includes('Other') && names.includes('Other follow-up'));
  assert.deepEqual(report.dropped, []);
  assert.equal(checks.R3.passed, true, checks.R3.detail);
});

// Optional consuming-repository check: the compiled always-true rows match
// under the real evaluator whatever the call's variables hold, and the route's
// fallback compiles to the empty group's target.
test('real v2 compiler and evaluator keep a v1 empty condition group always true', {
  skip: !process.env.NORM_V2_COMPILER_PATH && 'requires consuming SERVER compiler and TypeScript loader',
}, async () => {
  const imported = await import(pathToFileURL(process.env.NORM_V2_COMPILER_PATH).href);
  const compile = imported.agentConfigToPathway ?? imported.default?.agentConfigToPathway;
  const compilerDir = dirname(process.env.NORM_V2_COMPILER_PATH);
  const validationModule = await import(pathToFileURL(join(compilerDir, 'validateSnapshot.ts')).href);
  const validate = validationModule.validateSnapshot ?? validationModule.default?.validateSnapshot;
  const evaluatorModule = await import(pathToFileURL(resolve(compilerDir, '../pathways/variableComparison/variableComparison.ts')).href);
  const evaluate = evaluatorModule.evaluateConditions ?? evaluatorModule.default?.evaluateConditions;
  const verdict = validate(buildWith({ source: emptyGroupSource([{ field: 'status', operator: 'equals', value: 'active' }, { isGroup: true, conditions: [] }]) }).snapshot);
  assert.equal(verdict.ok, true, JSON.stringify(verdict));
  const graph = compile(verdict.snapshot);
  const edge = graph.edges.find((e) => e.data && e.data.label === 'Go on');
  for (const vars of [{}, { v1_empty_group: null }, { v1_empty_group: 'x' }, { status: 'closed' }]) {
    assert.equal(evaluate(edge.data.condition, () => vars), true, JSON.stringify(vars));
  }
  const routeVerdict = validate(buildWith({ source: EMPTY_GROUP_ROUTE }).snapshot);
  assert.equal(routeVerdict.ok, true, JSON.stringify(routeVerdict));
  const routeGraph = compile(routeVerdict.snapshot);
  const routeNode = routeGraph.nodes.find((n) => n.type === 'Route');
  const silver = routeGraph.nodes.find((n) => n.data && n.data.name === 'Silver');
  assert.equal(routeNode.data.fallbackNodeId, silver.id);
  assert.deepEqual(routeNode.data.routes.map((r) => r.targetNodeId), [routeGraph.nodes.find((n) => n.data && n.data.name === 'Gold').id, silver.id]);
});

// Optional consuming-repository check, as above: the save validator accepts
// the carried voice/language and importWarnings, and a by-reference tool
// compiles to the library id with nothing embedded.
test('real v2 validator and compiler accept the carried settings and by-reference tools', {
  skip: !process.env.NORM_V2_COMPILER_PATH && 'requires consuming SERVER compiler and TypeScript loader',
}, async () => {
  const imported = await import(pathToFileURL(process.env.NORM_V2_COMPILER_PATH).href);
  const compile = imported.agentConfigToPathway ?? imported.default?.agentConfigToPathway;
  const validationModule = await import(pathToFileURL(join(dirname(process.env.NORM_V2_COMPILER_PATH), 'validateSnapshot.ts')).href);
  const validate = validationModule.validateSnapshot ?? validationModule.default?.validateSnapshot;
  const source = { nodes: [{ id: 'hello', type: 'Default', data: { name: 'Hello', prompt: 'Look up the order.', tools: [
    { name: 'Order lookup', type: 'custom_tool', config: { tool_id: 'TL-11111111-2222', tool_overrides: { 'body.store': '<store>' } } },
  ] } }], edges: [] };
  for (const persona of [undefined, PERSONA({ voice: '<voice-uuid>', language: 'en-GB' })]) {
    const verdict = validate(buildWith({ source, persona }).snapshot);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
    const graph = compile(verdict.snapshot);
    const tools = graph.nodes.flatMap((n) => (n.data && n.data.tools) || []);
    const ref = tools.find((t) => t.name === 'Order lookup');
    assert.deepEqual(ref.config.tool, { tool_id: 'TL-11111111-2222' });
  }
});

// Exercise the public subprocess boundary: legacy defaults and upgrade gates
// must differ on the same rewritten candidate, not on a test-only flag setter.
function upgradeAudit(snapshot, source, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'norm-upgrade-audit-'));
  try {
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
    writeFileSync(join(dir, 'source.json'), JSON.stringify(source));
    writeFileSync(join(dir, 'dropped.json'), JSON.stringify([{ node: 'original', tag: 'qualified' }]));
    const result = execFileSync(process.execPath, [audit, '--snapshot', join(dir, 'snapshot.json'), '--source', join(dir, 'source.json'), '--dropped-tags', join(dir, 'dropped.json'), ...extra]);
    return JSON.parse(result);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function rewrittenCandidate() {
  const { snapshot } = buildDictation({ prompt: 'Bye.' });
  const start = flowOf(snapshot).nodes.find(n => n.type === 'prompt');
  start.data.name = 'Combined intake';
  start.data.prompt = 'Collect their full name in one question.';
  start.data.loopWhile = '';
  return snapshot;
}
test('upgrade accepts rewritten, merged prompts and one scenario while legacy parity rejects them', () => {
  const snapshot = rewrittenCandidate();
  const source = { nodes: [{ id: 'original', type: 'Default', globalConfig: { globalPrompt: 'Always say this legacy introduction exactly.' }, data: { name: 'Original intake', prompt: 'First ask this old question in many separate turns.', condition: 'Old hold wording must survive.', extractVars: [['first_name', 'string', 'First name']] } }], edges: [] };
  assert.equal(upgradeAudit(snapshot, source).passed, false);
  const upgraded = upgradeAudit(snapshot, source, ['--upgrade']);
  assert.equal(upgraded.passed, true, JSON.stringify(upgraded.checks.filter(c => !c.passed)));
  for (const id of ['P7', 'P11', 'P12', 'P13', 'P14', 'P16', 'A2', 'A3']) assert.equal(upgraded.checks.find(c => c.id === id).skipped, true, id);
  flowOf(snapshot).nodes.find(n => n.type === 'prompt').data.variables = [];
  assert.equal(upgradeAudit(snapshot, source, ['--upgrade']).checks.find(c => c.id === 'P17').passed, false);
});
test('upgrade still fails capability loss on renamed or declared-dropped nodes and prose cannot satisfy KB/tools', () => {
  const snapshot = rewrittenCandidate();
  const source = { nodes: [{ id: 'original', type: 'Default', data: { name: 'Old integration', prompt: 'Original long prompt never carried.', kbTool: ['kb-123'], tag: { name: 'qualified' }, tools: [{ config: { tool_id: 'TL-11111111-2222' } }] } }], edges: [] };
  snapshot.settings.systemPrompt += ' kb-123 TL-11111111-2222';
  let result = upgradeAudit(snapshot, source, ['--upgrade']);
  for (const id of ['P2', 'P15', 'A6']) assert.equal(result.checks.find(c => c.id === id).passed, false, id);
  const step = flowOf(snapshot).nodes.find(n => n.type === 'prompt');
  step.type = 'knowledge';
  step.data.kbIds = ['kb-123'];
  step.data.tools = [{ toolId: 'TL-11111111-2222', byReference: true }];
  step.data.settings = { tag: { name: 'qualified' } };
  result = upgradeAudit(snapshot, source, ['--upgrade']);
  for (const id of ['P2', 'P15', 'A6']) assert.equal(result.checks.find(c => c.id === id).passed, true, id);
});
test('upgrade capture contract permits merging repeated capture but fails a lost semantic mapping', () => {
  const snapshot = rewrittenCandidate();
  const source = { nodes: ['one', 'two'].map(id => ({ id, type: 'Default', data: { name: id, captureKinds: { last_name: 'name.last' } } })), edges: [] };
  assert.equal(upgradeAudit(snapshot, source).checks.find(c => c.id === 'P9').passed, false);
  assert.equal(upgradeAudit(snapshot, source, ['--upgrade']).checks.find(c => c.id === 'P9').passed, true);
  for (const n of flowOf(snapshot).nodes) for (const v of n.data?.variables || []) delete v.captureAs;
  assert.equal(upgradeAudit(snapshot, source, ['--upgrade']).checks.find(c => c.id === 'P9').passed, false);
});
test('upgrade allows code followed by reachable in-flow termination without a root hangup', () => {
  const snapshot = rewrittenCandidate();
  const flow = flowOf(snapshot);
  const step = flow.nodes.find(n => n.type === 'prompt');
  step.type = 'customCode';
  step.data.snippetId = 'snip-1';
  const source = { nodes: [{ id: 'original', type: 'End Call', data: { name: 'Save', tools: [{ name: 'Save', type: 'code', config: { snippet_id: 'snip-1' } }] } }], edges: [] };
  assert.equal(upgradeAudit(snapshot, source).checks.find(c => c.id === 'P10').passed, false);
  assert.equal(upgradeAudit(snapshot, source, ['--upgrade']).checks.find(c => c.id === 'P10').passed, true);
  flow.edges = flow.edges.filter(e => e.target !== flow.nodes.find(n => n.type === 'end-call').id);
  assert.equal(upgradeAudit(snapshot, source, ['--upgrade']).checks.find(c => c.id === 'P10').passed, false);
});
test('upgrade state and Stop hook preserve mode, freeze the suite and give outcome repair guidance', () => {
  const dir = mkdtempSync(join(tmpdir(), 'norm-upgrade-loop-'));
  try {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
    const runState = (...args) => spawnSync(process.execPath, [stateBin, ...args], { env, encoding: 'utf8' });
    const snapshotPath = join(dir, 'snapshot.json');
    writeFileSync(snapshotPath, JSON.stringify(rewrittenCandidate()));
    assert.equal(runState('init', '--snapshot', snapshotPath, '--upgrade').status, 0);
    // Without a precommitted suite this must not advance to a candidate push.
    assert.equal(runState('record-push', '--head', 'head-1').status, 1);
    const scenarioId = '11111111-1111-4111-8111-111111111111';
    assert.equal(runState('record-evaluation', '--scenario', scenarioId).status, 0);
    assert.equal(runState('record-evaluation', '--scenario', '22222222-2222-4222-8222-222222222222').status, 1);
    assert.equal(runState('record-push', '--head', 'head-1').status, 0);
    let hook = spawnSync(process.execPath, [hookBin], { env, input: '{}', encoding: 'utf8' });
    assert.match(hook.stdout, /three|3 repetitions/);
    assert.doesNotMatch(hook.stdout, /content stays verbatim|AUDIT A2/);
    assert.equal(runState('record-sims', '--head', 'head-1', '--passed', 'true').status, 0);
    hook = spawnSync(process.execPath, [hookBin], { env, input: '{}', encoding: 'utf8' });
    assert.equal(JSON.parse(hook.stdout || '{}').decision, 'block', 'green sims cannot release without design evidence');
    assert.match(hook.stdout, /DESIGN.*record-design/);
    const designPath = join(dir, 'design.json');
    const design = {
      head_version_id: 'head-1',
      responsibilities: [{ id: 'intake', description: 'Collect the caller name.', source_nodes: [], step_ids: ['native-intake'], scenario_ids: [scenarioId] }],
      knowledge: [],
    };
    writeFileSync(designPath, JSON.stringify(design));
    assert.equal(runState('record-design', '--file', designPath).status, 0);
    // A later push must invalidate design evidence, just as it invalidates simulations.
    assert.equal(runState('record-push', '--head', 'head-2').status, 0);
    assert.equal(runState('record-sims', '--head', 'head-2', '--passed', 'true').status, 0);
    hook = spawnSync(process.execPath, [hookBin], { env, input: '{}', encoding: 'utf8' });
    assert.equal(JSON.parse(hook.stdout || '{}').decision, 'block');
    assert.match(hook.stdout, /DESIGN/);
    design.head_version_id = 'head-2';
    writeFileSync(designPath, JSON.stringify(design));
    assert.equal(runState('record-design', '--file', designPath).status, 0);
    hook = spawnSync(process.execPath, [hookBin], { env, input: '{}', encoding: 'utf8' });
    assert.equal(hook.stdout, '');
    const state = JSON.parse(readFileSync(join(dir, '.norm', 'migration.json'), 'utf8'));
    assert.deepEqual(state.design, design);
    assert.equal(state.mode, 'outcomes-v1');
    assert.deepEqual(state.evaluation, { scenario_ids: [scenarioId] });
    assert.equal(state.released, 'local_complete');
    // Native build mode has no source parity and does not require filler scenarios.
    assert.equal(runState('init', '--snapshot', snapshotPath).status, 0);
    assert.equal(runState('record-push', '--head', 'head-2').status, 0);
    hook = spawnSync(process.execPath, [hookBin], { env, input: '{}', encoding: 'utf8' });
    assert.doesNotMatch(hook.stdout, /AUDIT A2/);
    assert.match(hook.stdout, /content stays verbatim/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('upgrade accepts native code input rows without extraction settings while legacy remains unchanged', () => {
  const snapshot = rewrittenCandidate();
  const step = flowOf(snapshot).nodes.find(n => n.type === 'prompt');
  step.type = 'customCode';
  step.data.variables = [{ id: 'input-1', key: 'name', value: '{{first_name}}' }];
  const source = { nodes: [], edges: [] };
  assert.equal(upgradeAudit(snapshot, source).checks.find(c => c.id === 'S3c').passed, false);
  const result = upgradeAudit(snapshot, source, ['--upgrade']);
  assert.equal(result.checks.find(c => c.id === 'S3c').passed, true);
  assert.equal(result.passed, true);
});
test('upgrade does not mistake code inputs for preserved extraction capability', () => {
  const snapshot = rewrittenCandidate();
  const step = flowOf(snapshot).nodes.find(n => n.type === 'prompt');
  step.type = 'customCode';
  step.data.variables = [{ id: 'input-1', key: 'first_name', value: '{{first_name}}' }];
  const source = { nodes: [{ id: 'original', data: { extractVars: [['first_name', 'string', 'First name']] } }], edges: [] };
  assert.equal(upgradeAudit(snapshot, source, ['--upgrade']).checks.find(c => c.id === 'P17').passed, false);
  // Moving the actual extraction to another native step satisfies the contract.
  flowOf(snapshot).nodes.find(n => n.type === 'end-call').data.variables = [{ key: 'first_name', type: 'string', accurateSpelling: false }];
  assert.equal(upgradeAudit(snapshot, source, ['--upgrade']).passed, true);
});


test('upgrade record-design rejects unreadable files, malformed evidence and a different candidate head', () => {
  const dir = mkdtempSync(join(tmpdir(), 'norm-upgrade-design-'));
  try {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
    const runState = (...args) => spawnSync(process.execPath, [stateBin, ...args], { env, encoding: 'utf8' });
    const designPath = join(dir, 'design.json');
    const scenarioId = '11111111-1111-4111-8111-111111111111';
    assert.equal(runState('init', '--snapshot', join(dir, 'snapshot.json'), '--upgrade').status, 0);
    assert.equal(runState('record-evaluation', '--scenario', scenarioId).status, 0);
    assert.equal(runState('record-push', '--head', 'head-1').status, 0);
    const valid = { head_version_id: 'head-1', responsibilities: [{ id: 'faq', description: 'Answer the product question.', source_nodes: [{ source_index: 0, node_id: 'faq' }], step_ids: ['answer'], scenario_ids: [scenarioId] }], knowledge: [] };
    writeFileSync(designPath, JSON.stringify(valid));
    assert.equal(runState('record-design', '--file', designPath).status, 0);
    for (const invalid of [null, {}, { ...valid, responsibilities: {} }, { ...valid, responsibilities: [] }, { ...valid, knowledge: {} }, { ...valid, head_version_id: 'other-head' }]) {
      writeFileSync(designPath, JSON.stringify(invalid));
      assert.equal(runState('record-design', '--file', designPath).status, 1);
      assert.deepEqual(JSON.parse(readFileSync(join(dir, '.norm', 'migration.json'), 'utf8')).design, valid);
    }
    assert.equal(runState('record-design').status, 1);
    assert.equal(runState('record-design', '--file', join(dir, 'missing.json')).status, 1);
    writeFileSync(designPath, 'not json');
    assert.equal(runState('record-design', '--file', designPath).status, 1);
    assert.equal(runState('stop').status, 0);
    assert.equal(runState('init', '--snapshot', join(dir, 'snapshot.json')).status, 0);
    writeFileSync(designPath, JSON.stringify(valid));
    assert.equal(runState('record-design', '--file', designPath).status, 1, 'legacy mode keeps its existing contract');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('upgrade Stop hook rechecks design arrays and unresolved knowledge even for edited state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'norm-upgrade-design-hook-'));
  try {
    const snapshotPath = join(dir, 'snapshot.json');
    writeFileSync(snapshotPath, JSON.stringify(rewrittenCandidate()));
    const old = new Date(Date.now() - 60_000);
    utimesSync(snapshotPath, old, old);
    mkdirSync(join(dir, '.norm'), { recursive: true });
    const valid = { head_version_id: 'head-1', responsibilities: [{ id: 'faq' }], knowledge: [] };
    for (const design of [
      { ...valid, responsibilities: {} },
      { ...valid, responsibilities: [] },
      { ...valid, knowledge: {} },
      { ...valid, knowledge: [{ source_index: 0, node_id: 'faq', scope: 'unresolved', reason: 'Need source evidence.', step_ids: [], scenario_ids: [] }] },
    ]) {
      writeFileSync(join(dir, '.norm', 'migration.json'), JSON.stringify({ active: true, mode: 'outcomes-v1', created_at: Date.now(), snapshot: snapshotPath, sources: [], evaluation: { scenario_ids: ['11111111-1111-4111-8111-111111111111'] }, push: { head: 'head-1', at: Date.now() }, sims: { head: 'head-1', passed: true }, design }));
      const hook = spawnSync(process.execPath, [hookBin], { env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, input: '{}', encoding: 'utf8' });
      assert.equal(JSON.parse(hook.stdout || '{}').decision, 'block', JSON.stringify(design));
      assert.match(hook.stdout, /DESIGN/);
      assert.equal(JSON.parse(readFileSync(join(dir, '.norm', 'migration.json'), 'utf8')).active, true);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('local advisory upgrade audit accepts native tool steps', () => {
  const snapshot = rewrittenCandidate();
  const step = flowOf(snapshot).nodes.find(n => n.type === 'prompt');
  step.type = 'tool';
  step.data = { name: 'Lookup', toolId: 'TL-11111111-2222', overrides: [], responsePathways: [] };
  const source = { nodes: [{ id: 'original', type: 'Default', data: { tools: [{ config: { tool_id: 'TL-11111111-2222' } }] } }], edges: [] };
  const result = upgradeAudit(snapshot, source, ['--upgrade']);
  assert.equal(result.checks.find(c => c.id === 'P2').passed, true);
});

test('local advisory upgrade audit normalizes KB spellings but preserves placeholder case', () => {
  const snapshot = rewrittenCandidate();
  const source = { nodes: [{ id: 'original', type: 'Knowledge Base', data: { kbTool: 'KB-ABCDEF00-0000-4000-8000-000000000000' } }], edges: [] };
  snapshot.knowledge = { kbIds: ['abcdef00-0000-4000-8000-000000000000'] };
  const kbPassed = () => upgradeAudit(snapshot, source, ['--upgrade']).checks.find(c => c.id === 'P15').passed;
  assert.equal(kbPassed(), true);
  source.nodes[0].data.kbTool = 'KB-{{AccountKB}}';
  snapshot.knowledge.kbIds = ['{{AccountKB}}'];
  assert.equal(kbPassed(), true);
  snapshot.knowledge.kbIds = ['{{accountkb}}'];
  assert.equal(kbPassed(), false);
  delete snapshot.knowledge;
  const step = flowOf(snapshot).nodes.find(n => n.type === 'prompt');
  step.type = 'knowledge';
  step.data.kbIds = ['{{AccountKB}}'];
  assert.equal(kbPassed(), true);
});


test('upgrade Start gate rejects a call-body flow through inbound or entryScenarioId', () => {
 for (const entry of ['inbound', 'entryScenarioId']) {
  const snapshot = rewrittenCandidate();
  const hub = snapshot.behavior.nodes.find(n => n.type === 'agent');
  const flow = snapshot.behavior.nodes.find(n => n.type === 'complex-scenario');
  flow.data.flow.nodes.find(n => n.type === 'prompt').type = 'scheduling';
  if (entry === 'inbound') snapshot.behavior.edges.find(e => e.source === snapshot.behavior.nodes.find(n => n.type === 'inbound').id).target = flow.id;
  else hub.data.entryScenarioId = flow.id;
  assert.equal(upgradeAudit(snapshot, {nodes:[],edges:[]}, ['--upgrade']).checks.find(c => c.id === 'A1').passed, false);
 }
});

test('upgrade permits attached snippet tools without forcing separate code nodes', () => {
 const snapshot=rewrittenCandidate();
 const hub=snapshot.behavior.nodes.find(n=>n.type==='agent');
 hub.data.tools=[{id:'lookup',name:'Lookup',description:'Lookup',toolType:'custom_tool',behavior:'feed_context',definition:{name:'Lookup',description:'Lookup',integration:'custom-code',action:'run_snippet',body:{snippet_id:'snip-1',snippet_version:7,variables:{}}}}];
 const source={nodes:[{id:'legacy',type:'Default',data:{tools:[{type:'code',name:'Lookup',config:{snippet_id:'snip-1',snippet_version:7}}]}}]};
 assert.equal(upgradeAudit(snapshot,source,['--upgrade']).checks.find(c=>c.id==='P5').passed,true);
 assert.equal(upgradeAudit(snapshot,source).checks.find(c=>c.id==='P5').passed,false);
});


test('legacy automatic-entry audit preserves its existing contract', () => {
  for (const entry of ['inbound', 'entryScenarioId', 'initialization']) {
    const snapshot = rewrittenCandidate();
    const hub = snapshot.behavior.nodes.find(n => n.type === 'agent');
    const flow = snapshot.behavior.nodes.find(n => n.type === 'complex-scenario');
    flow.data.flow.nodes.find(n => n.type === 'prompt').type = 'knowledge';
    if (entry === 'inbound') snapshot.behavior.edges[0].target = flow.id;
    else if (entry === 'entryScenarioId') hub.data.entryScenarioId = flow.id;
    else snapshot.initialization = { enabled: true, step: { snippetId: 'setup', snippetVersion: 1 }, routes: [{ key: 'connected', value: 'true', targetId: flow.id }] };
    assert.equal(upgradeAudit(snapshot, { nodes: [], edges: [] }).checks.find(c => c.id === 'A1').passed, entry !== 'inbound', entry);
    assert.equal(upgradeAudit(snapshot, { nodes: [], edges: [] }, ['--upgrade']).checks.find(c => c.id === 'A1').passed, false, entry);
  }
});

test('upgrade tool parity counts executable chain members, not unused chain metadata', () => {
  const snapshot = rewrittenCandidate();
  const toolId = 'TL-11111111-2222';
  const chain = { id: 'lookup-chain', name: 'Lookup chain', toolType: 'track', behavior: 'feed_context', steps: [{ type: 'custom_tool', config: { tool: { tool_id: toolId } }, output_schema: [] }] };
  snapshot.behavior.nodes.find(n => n.type === 'agent').data.tools = [chain];
  const source = { nodes: [{ id: 'old', type: 'Default', data: { tools: [{ type: 'custom_tool', config: { tool: { tool_id: toolId } } }] } }] };
  const passed = () => upgradeAudit(snapshot, source, ['--upgrade']).checks.find(c => c.id === 'P2').passed;
  assert.equal(passed(), true);
  chain.steps = [];
  chain.toolId = toolId;
  chain.metadata = { tool_id: toolId };
  assert.equal(passed(), false);
});

test('native hub and end-call needs no filler scenario while legacy migration retains A2', () => {
  const snapshot = rewrittenCandidate();
  snapshot.behavior.nodes = snapshot.behavior.nodes.filter(n => n.type !== 'complex-scenario');
  snapshot.behavior.nodes.push({ id: 'hangup', type: 'end-call', data: { name: 'Done', prompt: 'Goodbye.', entry: { description: 'Caller is finished.' } } });
  const dir = mkdtempSync(join(tmpdir(), 'norm-native-audit-'));
  try {
    const file = join(dir, 'snapshot.json');
    writeFileSync(file, JSON.stringify(snapshot));
    const checks = JSON.parse(execFileSync(process.execPath, [audit, '--snapshot', file])).checks;
    assert.equal(checks.find(c => c.id === 'A2').passed, true);
    assert.equal(upgradeAudit(snapshot, { nodes: [], edges: [] }).checks.find(c => c.id === 'A2').passed, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('upgrade entry permits an explicit press-button action but rejects business and unknown tools', () => {
  const snapshot = rewrittenCandidate();
  const flow = snapshot.behavior.nodes.find(n => n.type === 'complex-scenario');
  snapshot.behavior.edges[0].target = flow.id;
  const step = flow.data.flow.nodes.find(n => n.type === 'prompt');
  step.type = 'tool';
  const definition = { name: 'IVR button', description: 'Navigate pickup menu', integration: 'bland', action: 'press_button', body: { buttons: '1' } };
  step.data = { name: 'IVR button', toolId: 'TL-screen', isStaging: false, overrides: [], responsePathways: [], embeddedTool: { tool: definition } };
  flow.data.flow = { nodes: [{ id: 'start', type: 'start', data: {} }, step, { id: 'exit', type: 'end', data: {} }], edges: [{ id: 'a', source: 'start', target: step.id }, { id: 'b', source: step.id, target: 'exit' }] };
  const a1 = () => upgradeAudit(snapshot, { nodes: [], edges: [] }, ['--upgrade']).checks.find(c => c.id === 'A1').passed;
  assert.equal(a1(), true, JSON.stringify(upgradeAudit(snapshot, { nodes: [], edges: [] }, ['--upgrade']).checks.find(c => c.id === 'A1')));
  definition.action = 'book_appointment';
  assert.equal(a1(), false);
  definition.action = 'press_button';
  step.data.embeddedTool.stagingTool = { ...definition, action: 'book_appointment' };
  step.data.isStaging = true;
  assert.equal(a1(), false);
  delete step.data.embeddedTool;
  assert.equal(a1(), false);
});


test('upgrade automatic prompt and simple scenario inspect active attached tools and chains', () => {
  for (const type of ['prompt', 'scenario']) {
    const snapshot = rewrittenCandidate();
    const root = snapshot.behavior.nodes.find(n => n.type === 'complex-scenario');
    snapshot.behavior.edges[0].target = root.id;
    const definition = { name: 'Business', description: 'Run snippet', integration: 'custom-code', action: 'run_snippet', body: { snippet_id: 'lookup', variables: {} } };
    const attached = { id: 'tool', name: 'Business', toolType: 'custom_tool', behavior: 'feed_context', definition };
    const data = { name: 'Screen', prompt: 'Wait for a human', variables: [], loopWhile: '', tools: [attached] };
    if (type === 'scenario') { root.type = 'scenario'; root.data = { ...data, entry: root.data.entry }; }
    else root.data.flow = { nodes: [{ id: 'start', type: 'start', data: {} }, { id: 'screen', type: 'prompt', data }, { id: 'exit', type: 'end', data: {} }], edges: [{ id: 'a', source: 'start', target: 'screen' }, { id: 'b', source: 'screen', target: 'exit' }] };
    const a1 = () => upgradeAudit(snapshot, { nodes: [], edges: [] }, ['--upgrade']).checks.find(c => c.id === 'A1').passed;
    assert.equal(a1(), false, type);
    attached.stagingDefinition = { name: 'Button', description: 'IVR navigation', integration: 'bland', action: 'press_button', body: { buttons: '1' } };
    attached.isStaging = true;
    assert.equal(a1(), true, type);
    attached.byReference = true; attached.toolId = 'TL-unknown';
    assert.equal(a1(), false, type);
    delete attached.byReference;
    attached.toolType = 'track';
    attached.steps = [{ type: 'custom_tool', config: { tool: { tool: definition } } }];
    assert.equal(a1(), false, type);
    attached.steps[0].config.tool.tool = attached.stagingDefinition;
    assert.equal(a1(), true, type);
    const activeData = type === 'scenario' ? root.data : data;
    activeData.channelConfig = { shared: false, overrides: { sms: { tools: [{ ...attached, toolType: 'custom_tool', isStaging: false, definition }] } } };
    assert.equal(a1(), false, type);
    activeData.channelConfig.shared = true;
    assert.equal(a1(), true, type);
  }
});
