import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
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
      entryScenario: 'Name capture',
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

test("an End Call's code tool becomes a code step that runs before the hang-up", () => {
  const { snapshot, checks } = buildDictation({
    prompt: 'Bye.',
    tools: [{ name: 'Save result', type: 'code', config: { snippet_id: 'snip-1', snippet_version: 3 } }],
  });
  const flow = flowOf(snapshot);
  const endCall = flow.nodes.find((node) => node.type === 'end-call');
  const code = flow.nodes.find((node) => node.type === 'customCode');
  const start = flow.nodes.find((node) => node.data && node.data.name === 'Start');
  assert.equal(code.data.snippetId, 'snip-1');
  // Start -> code step -> End Call; nothing leaves the End Call.
  assert.ok(flow.edges.some((edge) => edge.source === start.id && edge.target === code.id));
  assert.equal(flow.edges.some((edge) => edge.source === start.id && edge.target === endCall.id), false);
  assert.ok(flow.edges.some((edge) => edge.source === code.id && edge.target === endCall.id));
  assert.equal(flow.edges.some((edge) => edge.source === endCall.id), false);
  assert.equal(checks.S6.passed, true);
  assert.equal(checks.P5.passed, true);
});

test('the audit does not count an End Call nothing leads to', () => {
  const { snapshot } = buildDictation({ prompt: 'Bye.' });
  const flow = flowOf(snapshot);
  const endCall = flow.nodes.find((node) => node.type === 'end-call');
  flow.edges = flow.edges.filter((edge) => edge.target !== endCall.id);
  assert.equal(runAudit(snapshot, { nodes: [], edges: [] }).S6.passed, false);
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
