const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');

const read = path => readFileSync(resolve(__dirname, '..', path), 'utf8');
const authoring = read('v2/skills/v2-authoring/SKILL.md');
const build = read('v2/commands/build.md');
const knowledge = read('v2/skills/knowledge-sources/SKILL.md');
const maintenance = read('v2/skills/v2-maintenance/SKILL.md');

test('authoring distinguishes reference topics from workflow boundaries', () => {
  const rule = authoring.split('## Knowledge reference or scenario?')[1]?.split('\n## ')[0];
  assert.ok(rule, 'shared design rule must exist');
  assert.match(rule, /Facts belong in knowledge;\s+workflows belong in scenarios/);
  assert.match(rule, /not one scenario per FAQ or source/);
  assert.match(rule, /ordered collection, decisions, live tool lookups/);
  assert.match(rule, /"What is the\s+returns policy\?" is knowledge; "return my order" needs a workflow/);
  assert.doesNotMatch(authoring, /scenarios own all lookups/);
  assert.match(authoring, /scenarios own workflow tool lookups/);
});

test('scope selection preserves channel limits and a shared knowledge-step fallback', () => {
  assert.match(authoring, /knowledge\.kbIds/);
  assert.match(authoring, /verifying a saved candidate on the intended\s+channel/);
  assert.match(authoring, /Inbound phone calls, builder\s+test chat and simulations may not consult agent-wide sources/);
  assert.match(authoring, /Step-scoped retrieval works only while on that step/);
  assert.match(authoring, /hub routes questions to answering steps/);
  assert.match(authoring, /`knowledge` step\s+with `kbIds` in the existing flow/);
  assert.match(authoring, /ONE\s+shared "Answer questions" scenario/);
  assert.match(authoring, /Check Query Logs and chunks/);
  assert.match(authoring, /one answerable and one absent question/);
  assert.match(authoring, /continues without restarting the task/);
});

test('build loads knowledge guidance before design and carries it through verification', () => {
  assert.match(build, /\[knowledge-sources\]\(\.\.\/skills\/knowledge-sources\/SKILL\.md\)/);
  const phases = build.split('## v2 build phases')[1].split('\n');
  const design = phases.find(line => line.startsWith('1. **Design interview.**'));
  const snapshot = phases.find(line => line.startsWith('2. **Author the snapshot**'));
  const verify = phases.find(line => line.startsWith('5. **Verify**'));
  assert.match(design, /First separate reference-only content/);
  assert.match(design, /knowledge sources\/scopes/);
  assert.match(snapshot, /reuse or ingest, poll to `COMPLETED`, test and attach/);
  assert.match(verify, /intended channel/);
  assert.match(verify, /mid-task question followed by continuation/);
  assert.match(verify, /Query Logs\/chunks/);
});

test('knowledge and maintenance entrypoints discover the same authoring rule', () => {
  for (const text of [knowledge, maintenance]) {
    assert.match(text, /\]\(\.\.\/v2-authoring\/SKILL\.md#knowledge-reference-or-scenario\)/);
  }
  assert.match(knowledge, /Use sources, not mini-pathways/);
  assert.match(maintenance, /preserve existing workflows and stable IDs/);
});

test('design regression prompts cover reference-only, interleaved and operational jobs', () => {
  const benchmark = JSON.parse(read('dev/benchmarks/knowledge-vs-scenarios.json'));
  assert.equal(benchmark.skill_name, 'v2-authoring');
  assert.equal(benchmark.evals.length, 3);
  assert.equal(new Set(benchmark.evals.map(item => item.id)).size, 3);
  for (const item of benchmark.evals) {
    assert.match(item.prompt, /do not call APIs/);
    assert.ok(item.expected_output);
    assert.equal(item.assertions.length, 3);
  }
});
