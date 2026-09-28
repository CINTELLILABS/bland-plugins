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
