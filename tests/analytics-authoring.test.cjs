const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validateDefinition, MAX_GROUPS} = require('../v2/skills/analytics-authoring/scripts/validate-definition.cjs');

const members = {data: {members: [
  {id: 'agent', label: 'Hub', kind: 'synthetic'},
  {id: 'n-greet', label: 'Greeting', kind: 'node'},
  {id: 'n-lookup', label: 'Account lookup', kind: 'node'},
  {id: 'n-gate', label: 'Gate access', kind: 'node'},
  {id: 'n-pay', label: 'Payments', kind: 'node'},
  {id: 'n-close', label: 'Wrap up', kind: 'node'},
  {id: 'tool:open_gate', label: 'open_gate', kind: 'tool'},
]}};

const good = () => ({definition: {groups: [
  {id: 'identify', label: 'Identify', members: ['agent', 'n-greet', 'n-lookup'], stage: 1},
  {id: 'gate', label: 'Gate access', members: ['n-gate', 'tool:open_gate'], stage: 2},
  {id: 'pay', label: 'Payments', members: ['n-pay'], stage: 2},
  {id: 'close', label: 'Close', members: ['n-close'], stage: 3},
]}});

const rules = result => result.violations.map(v => v.rule);

test('accepts parallel branches that share a stage and reports nothing unclassified', () => {
  assert.deepEqual(validateDefinition(good(), members), {valid: true, violations: [], unclassified: []});
});

test('accepts the members array alone and the full read envelope alike', () => {
  assert.equal(validateDefinition(good(), members.data.members).valid, true);
  assert.equal(validateDefinition(good(), members.data).valid, true);
});

test('reports omitted members as unclassified without failing', () => {
  const d = good(); d.definition.groups[3].members = ['n-close']; d.definition.groups[2].members = ['n-pay'];
  d.definition.groups[0].members = ['agent', 'n-greet'];
  const r = validateDefinition(d, members);
  assert.equal(r.valid, true); assert.deepEqual(r.unclassified, ['n-lookup']);
});

for (const [rule, mutate] of [
  ['unknown_member', d => d.definition.groups[0].members.push('Greeting')],
  ['duplicate_member', d => d.definition.groups[1].members.push('n-greet')],
  ['excluded_member', d => d.definition.groups[0].members.push('__entry__')],
  ['synthetic_member', d => d.definition.groups[0].members.push('__start')],
  ['empty_group', d => { d.definition.groups[2].members = []; }],
  ['missing_label', d => { d.definition.groups[1].label = ' '; }],
  ['missing_group_id', d => { d.definition.groups[1].id = 'Gate Access'; }],
  ['duplicate_group_id', d => { d.definition.groups[2].id = 'gate'; }],
  ['reserved_group_id', d => { d.definition.groups[2].id = '__unclassified__'; }],
  ['stage_missing', d => { delete d.definition.groups[2].stage; }],
  ['stage_invalid', d => { d.definition.groups[2].stage = 0; }],
  ['stage_not_dense', d => { d.definition.groups[3].stage = 5; }],
]) test(`flags ${rule} by the offending id`, () => {
  const d = good(); mutate(d);
  const r = validateDefinition(d, members);
  assert.equal(r.valid, false);
  assert.ok(rules(r).includes(rule), `expected ${rule}, got ${rules(r).join(',')}`);
});

test('caps the group count at the API maximum', () => {
  const d = good();
  while (d.definition.groups.length <= MAX_GROUPS) d.definition.groups.push({id: `g${d.definition.groups.length}`, label: 'Extra', members: ['n-close'], stage: 3});
  assert.ok(rules(validateDefinition(d, members)).includes('too_many_groups'));
});

test('a definition with only synthetics has no real members', () => {
  const r = validateDefinition({groups: [{id: 'x', label: 'X', members: ['__start']}]}, members);
  assert.ok(rules(r).includes('no_real_members'));
});

test('no groups fails closed', () => {
  assert.ok(rules(validateDefinition({definition: {groups: []}}, members)).includes('no_groups'));
});
