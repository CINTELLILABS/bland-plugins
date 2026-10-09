const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, writeFileSync, mkdtempSync} = require('node:fs');
const {join} = require('node:path');
const {tmpdir} = require('node:os');
const {spawnSync} = require('node:child_process');
const skill = join(__dirname, '../v2/skills/analytics-cohorts');
const script = join(skill, 'scripts/validate-predicate.cjs');
const {
  validatePredicate, predicateCostClass, resolveColumn, check, locateWhere, MAX_DEPTH, MAX_LEAVES, MAX_IN_VALUES, OUTCOMES, TABLES,
} = require(script);
const {renderTables} = require(join(skill, 'scripts/render-tables.cjs'));

const messages = raw => validatePredicate(raw).map(v => `${v.path}: ${v.message}`);
const leaf = (col, op, value) => (value === undefined ? {col, op} : {col, op, value});
const ALL_OPS = '=, !=, in, not_in, <, <=, >, >=, is_null, is_not_null, contains';
const INSTANT = 'an ISO-8601 instant with a zone and at most millisecond precision';

test('limits and outcomes match the API', () => {
  assert.equal(MAX_DEPTH, 8);
  assert.equal(MAX_LEAVES, 64);
  assert.equal(MAX_IN_VALUES, 200);
  assert.deepEqual([...OUTCOMES], ['contained', 'escalated_cold', 'escalated_warm', 'ai_abandoned', 'abandoned', 'agent_ended', 'voicemail', 'not_connected', 'errored']);
  assert.ok(TABLES.calls);
});

test('the allowlist is a flat table map with a boolean availability and no region or database names', () => {
  for (const [name, entry] of Object.entries(TABLES)) {
    assert.equal(typeof entry.available, 'boolean', name);
    assert.ok(entry.columns && typeof entry.columns === 'object', name);
    assert.ok(!('presentInRegions' in entry), name);
  }
  assert.deepEqual(Object.entries(TABLES).filter(([, e]) => !e.available).map(([n]) => n).sort(), ['call_outcomes', 'disposition_value_facts']);
  const raw = readFileSync(join(skill, 'scripts/trusted-layer.json'), 'utf8');
  const page = readFileSync(join(skill, 'references/tables.md'), 'utf8');
  for (const text of [raw, page]) {
    assert.doesNotMatch(text, /\bdc\d+\b/);
    assert.doesNotMatch(text, /db_bland|Database:/);
  }
});

// Each refusal: the raw node and the exact { path: message } lines the API answers with.
for (const [label, raw, expected] of [
  ['an unallowlisted table', leaf('api_request_logs.status_code', '=', 200), ['where.col: unknown or unallowlisted table: api_request_logs']],
  ['an unallowlisted table with no call id', leaf('webhook_audit_logs.id', 'is_null'), ['where.col: unknown or unallowlisted table: webhook_audit_logs']],
  ['a table whose name is a prefix of nothing allowlisted', leaf('call.sid', 'is_null'), ['where.col: unknown or unallowlisted table: call']],
  ['a table the lake has in no region yet', leaf('call_outcomes.close_reason', '=', 'agent'), ['where.col: table not available (not yet in the lake in any region): call_outcomes']],
  ['an unknown column', leaf('pathway_events.nope', 'is_null'), ['where.col: unknown column: pathway_events.nope']],
  ['an unknown bare column (resolved against calls)', leaf('nope', 'is_null'), ['where.col: unknown column: calls.nope']],
  ['a denied bare column', leaf('to', '=', '+1555'), ['where.col: denied column (may not be used in a predicate): calls.to']],
  ['a denied joined column', leaf('pathway_events.payload', 'is_not_null'), ['where.col: denied column (may not be used in a predicate): pathway_events.payload']],
  ['three parts', leaf('a.b.c', 'is_null'), ['where.col: a.b.c must be <column> or <table>.<column>']],
  ['an empty part', leaf('calls.', 'is_null'), ['where.col: calls. must be <column> or <table>.<column>']],
  ['a leading dot', leaf('.completed', 'is_null'), ['where.col: .completed must be <column> or <table>.<column>']],
  ['a missing col', {op: 'is_null'}, ['where.col: must be a column name']],
  ['an empty col', leaf('', 'is_null'), ['where.col: must be a column name']],
  ['a non-string col', {col: 5, op: 'is_null'}, ['where.col: must be a column name']],
  ['an unknown op', leaf('completed', 'like', 'x'), [`where.op: must be one of ${ALL_OPS}`]],
  ['a missing op', {col: 'completed'}, [`where.op: must be one of ${ALL_OPS}`]],
  ['contains on a number', leaf('call_length', 'contains', '1'), ['where.op: "contains" does not apply to call_length (number)']],
  ['< on a boolean', leaf('completed', '<', true), ['where.op: "<" does not apply to completed (boolean)']],
  ['in on a timestamp_ntz column', leaf('call_metadata.created_at', 'in', ['2026-09-01T00:00:00Z']), ['where.op: "in" does not apply to call_metadata.created_at (timestamp_ntz)']],
  ['= on a complex column', leaf('call_citations.citation_utterance_ids', '=', 'x'), ['where.op: "=" does not apply to call_citations.citation_utterance_ids (complex)']],
  ['< on outcome', leaf('outcome', '<', 'contained'), ['where.op: "<" does not apply to outcome (outcome)']],
  ['in on connected', leaf('connected', 'in', [true]), ['where.op: "in" does not apply to connected (predicate)']],
  ['a value on is_null', leaf('call_length', 'is_null', 1), ['where.value: must be absent for is_null']],
  ['a value on is_not_null', leaf('call_length', 'is_not_null', null), ['where.value: must be absent for is_not_null']],
  ['a wrong-typed value', leaf('call_length', '=', '5'), ['where.value: must be a finite number']],
  ['a missing value', leaf('answered_by', '='), ['where.value: must be a string']],
  ['a non-boolean on a boolean', leaf('completed', '=', 'true'), ['where.value: must be a boolean']],
  ['a non-boolean on a virtual flag', leaf('early_exit', '=', 1), ['where.value: must be a boolean']],
  ['an unknown outcome', leaf('outcome', '=', 'won'), [`where.value: must be one of ${OUTCOMES.join(', ')}`]],
  ['an in that is not an array', leaf('call_length', 'in', 1), ['where.value: in takes a non-empty array of a finite number']],
  ['an empty not_in', leaf('outcome', 'not_in', []), [`where.value: not_in takes a non-empty array of one of ${OUTCOMES.join(', ')}`]],
  ['a mixed in list', leaf('call_length', 'in', [1, '2']), ['where.value: every element must be a finite number']],
  ['an empty contains', leaf('answered_by', 'contains', ''), ['where.value: contains takes a non-empty string']],
  ['an unknown key', {col: 'call_length', op: '=', value: 1, extra: 1}, ['where.extra: unknown key; a node is { and } | { or } | { not } | { col, op, value? }']],
  ['a group key beside a leaf key', {and: [leaf('completed', 'is_null')], col: 'completed'}, ['where.and: unknown key; a node is { and } | { or } | { not } | { col, op, value? }']],
  ['an empty and', {and: []}, ['where.and: must be a non-empty array']],
  ['an or that is not an array', {or: leaf('completed', 'is_null')}, ['where.or: must be a non-empty array']],
  ['a non-object root', 'completed = true', ['where: must be an object']],
  ['an array root', [leaf('completed', 'is_null')], ['where: must be an object']],
  ['a null under not', {not: null}, ['where.not: must be an object']],
  ['an absent where', undefined, ['where: must be an object']],
]) test(`refuses ${label}`, () => {
  assert.deepEqual(messages(raw), expected);
});

test('names the offending node by its path and reports every refusal', () => {
  assert.deepEqual(messages({and: [
    leaf('completed', '=', true),
    {or: [leaf('to', 'is_null'), {not: leaf('call_length', 'contains', 'x')}]},
    leaf('call.sid', 'is_null'),
  ]}), [
    'where.and[1].or[0].col: denied column (may not be used in a predicate): calls.to',
    'where.and[1].or[1].not.op: "contains" does not apply to call_length (number)',
    'where.and[2].col: unknown or unallowlisted table: call',
  ]);
});

test('a node carrying a stray wrapper key is checked as a node and refused, not read as a predicate with no where', () => {
  const mixed = {col: 'call_length', op: '>=', value: 5, day: '2026-01-01'};
  assert.deepEqual(locateWhere(mixed), {where: mixed});
  const result = check(mixed);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some(violation => violation.path === 'where.day'), JSON.stringify(result.violations));
  // The same key on a real predicate object still reads as its `where`.
  assert.deepEqual(locateWhere({day: '2026-01-01'}), {absent: true});
  assert.deepEqual(locateWhere({day: '2026-01-01', where: {col: 'call_length', op: '>=', value: 5}}), {where: {col: 'call_length', op: '>=', value: 5}});
});

test('honours a custom root', () => {
  assert.deepEqual(validatePredicate({and: [leaf('to', 'is_null')]}, 'predicate.where'), [
    {path: 'predicate.where.and[0].col', message: 'denied column (may not be used in a predicate): calls.to'},
  ]);
});

for (const [op, raw] of [
  ['=', leaf('answered_by', '=', 'human')],
  ['!=', leaf('answered_by', '!=', 'voicemail')],
  ['in', leaf('call_length', 'in', [1, 2])],
  ['not_in', leaf('outcome', 'not_in', ['voicemail'])],
  ['<', leaf('call_length', '<', 1.5)],
  ['<=', leaf('created_at', '<=', '2026-09-02T00:00:00Z')],
  ['>', leaf('pathway_events.created_at', '>', '2026-09-02T00:00:00Z')],
  ['>=', leaf('pathway_events.created_date', '>=', '2026-09-02')],
  ['is_null', leaf('call_utterances.words', 'is_null')],
  ['is_not_null', leaf('logs.status', 'is_not_null')],
  ['contains', leaf('pathway_events.event_type', 'contains', 'node')],
]) test(`accepts ${op}`, () => {
  assert.deepEqual(messages(raw), []);
});

test('depth: 8 levels pass, 9 are refused', () => {
  const nest = depth => (depth === 1 ? leaf('completed', '=', true) : {not: nest(depth - 1)});
  assert.deepEqual(messages(nest(8)), []);
  assert.deepEqual(messages(nest(9)), [`where${'.not'.repeat(8)}: nesting exceeds the maximum depth of 8`]);
});

test('leaves: 64 pass, 65 are refused once at the root', () => {
  const leaves = n => ({or: Array.from({length: n}, () => leaf('completed', '=', true))});
  assert.deepEqual(messages(leaves(64)), []);
  assert.deepEqual(messages(leaves(65)), ['where: more than 64 leaves']);
  // Past the cap the walk stops, so later refusals are not reported.
  const over = leaves(65); over.or.push(leaf('to', 'is_null'));
  assert.deepEqual(messages(over), ['where: more than 64 leaves']);
});

test('in lists: 200 values pass, 201 are refused', () => {
  const list = n => Array.from({length: n}, (_, i) => i);
  assert.deepEqual(messages(leaf('call_length', 'in', list(200))), []);
  assert.deepEqual(messages(leaf('call_length', 'in', list(201))), ['where.value: in takes at most 200 values']);
  assert.deepEqual(messages(leaf('call_length', 'not_in', list(201))), ['where.value: not_in takes at most 200 values']);
});

test('a bare column resolves against calls; table.column against that table', () => {
  const bare = resolveColumn('call_length');
  const qualified = resolveColumn('calls.call_length');
  for (const r of [bare, qualified]) {
    assert.equal(r.table, 'calls');
    assert.equal(r.entry, TABLES.calls);
    assert.equal(r.column, 'call_length');
    assert.equal(r.kind, 'number');
    assert.equal(r.virtual, null);
  }
  const joined = resolveColumn('call_metadata.created_at');
  assert.equal(joined.entry, TABLES.call_metadata);
  assert.equal(joined.kind, 'timestamp_ntz');
  assert.equal(resolveColumn('pathway_events.created_date').kind, 'date');
  assert.equal(resolveColumn('call_utterances.words').kind, 'complex');
  assert.deepEqual(resolveColumn('a.b.c'), {error: 'a.b.c must be <column> or <table>.<column>'});
});

test('virtual columns resolve bare only', () => {
  assert.deepEqual(
    ['outcome', 'connected', 'early_exit'].map(c => [resolveColumn(c).virtual, resolveColumn(c).kind]),
    [['outcome', 'outcome'], ['connected', 'predicate'], ['early_exit', 'predicate']],
  );
  for (const raw of [leaf('outcome', 'in', ['contained', 'abandoned']), leaf('connected', '=', true), leaf('early_exit', '!=', false)]) {
    assert.deepEqual(messages(raw), []);
  }
  assert.deepEqual(messages(leaf('calls.outcome', '=', 'contained')), ['where.col: unknown column: calls.outcome']);
  assert.deepEqual(messages(leaf('calls.connected', '=', true)), ['where.col: unknown column: calls.connected']);
});

for (const [label, raw, expected] of [
  ['four fractional digits', leaf('created_at', '=', '2026-09-01T12:00:00.1234Z'), 'timestamp precision beyond milliseconds is not supported'],
  ['six fractional digits on a zone-less column', leaf('call_metadata.created_at', '<', '2026-09-01T12:00:00.123456Z'), 'timestamp precision beyond milliseconds is not supported'],
  ['no zone', leaf('created_at', '>=', '2026-09-01T12:00:00'), 'timestamp needs an explicit zone'],
  ['no zone and too precise (precision named first)', leaf('created_at', '>=', '2026-09-01T12:00:00.1234'), 'timestamp precision beyond milliseconds is not supported'],
  ['a bare day on a timestamp column', leaf('created_at', '=', '2026-09-01'), `must be ${INSTANT}`],
  ['an hour-only offset', leaf('created_at', '=', '2026-09-01T12:00:00+02'), `must be ${INSTANT}`],
  ['an impossible calendar day', leaf('created_at', '=', '2026-02-30T00:00:00Z'), `must be ${INSTANT}`],
  ['an impossible hour', leaf('created_at', '=', '2026-09-01T24:00:00Z'), `must be ${INSTANT}`],
  ['a timestamp on a date column', leaf('pathway_events.created_date', '=', '2026-09-01T00:00:00Z'), 'must be a YYYY-MM-DD day'],
  ['2026-02-30 on a date column', leaf('pathway_events.created_date', '=', '2026-02-30'), 'must be a YYYY-MM-DD day'],
  ['2026-13-01 on a date column', leaf('pathway_events.created_date', '<', '2026-13-01'), 'must be a YYYY-MM-DD day'],
]) test(`refuses a literal with ${label}`, () => {
  assert.deepEqual(messages(raw), [`where.value: ${expected}`]);
});

test('names the precision rule inside an in list only as the generic element hint', () => {
  assert.deepEqual(messages(leaf('answered_by', 'in', ['human', 3])), ['where.value: every element must be a string']);
  assert.deepEqual(messages(leaf('outcome', 'in', ['contained', 'won'])), [`where.value: every element must be one of ${OUTCOMES.join(', ')}`]);
});

for (const value of [
  '2026-09-01T12:00:00Z',
  '2026-09-01T12:00:00.5Z',
  '2026-09-01T12:00:00.123Z',
  '2026-09-01T14:00:00.123+02:00',
  '2026-09-01T14:00:00-0500',
  '2026-09-01T12:00Z',
  '2026-03-01T01:00:00+02:00',
  '2028-02-29T00:00:00Z',
]) test(`accepts the instant ${value}`, () => {
  assert.deepEqual(messages(leaf('created_at', '=', value)), []);
});

test('accepts real calendar days, including a leap day', () => {
  for (const day of ['2026-02-28', '2028-02-29', '2026-12-31']) {
    assert.deepEqual(messages(leaf('pathway_events.created_date', '=', day)), [], day);
  }
  assert.deepEqual(messages(leaf('pathway_events.created_date', '=', '2027-02-29')), ['where.value: must be a YYYY-MM-DD day']);
});

test('cost class: light, heavy, and unresolvable counts as heavy', () => {
  assert.equal(predicateCostClass({and: [leaf('outcome', '=', 'contained'), leaf('logs.status', 'is_not_null')]}), 'light');
  assert.equal(predicateCostClass(leaf('completed', '=', true)), 'light');
  assert.equal(predicateCostClass({or: [leaf('completed', '=', true), {not: leaf('pathway_events.event_type', 'is_null')}]}), 'heavy');
  assert.equal(predicateCostClass(leaf('call_utterances.words', 'is_null')), 'heavy');
  assert.equal(predicateCostClass(leaf('api_request_logs.x', 'is_null')), 'heavy');
  assert.equal(predicateCostClass(leaf('call_outcomes.close_reason', 'is_null')), 'heavy');
  assert.equal(predicateCostClass(leaf('to', 'is_null')), 'heavy');
  assert.equal(predicateCostClass('nope'), 'heavy');
});

const cli = document => {
  const dir = mkdtempSync(join(tmpdir(), 'cohort-predicate-'));
  const file = join(dir, 'predicate.json');
  writeFileSync(file, typeof document === 'string' ? document : JSON.stringify(document));
  const run = spawnSync(process.execPath, [script, file], {encoding: 'utf8'});
  return {status: run.status, out: run.stdout ? JSON.parse(run.stdout) : null, err: run.stderr};
};

test('CLI: a valid predicate exits 0 with its cost class and leaf count, in every wrapping', () => {
  const where = {and: [leaf('outcome', '=', 'abandoned'), leaf('pathway_events.event_type', '=', 'x')]};
  for (const document of [where, {where}, {predicate: {where}}, {window: {}, predicate: {outcomes: ['abandoned'], where}}]) {
    const {status, out} = cli(document);
    assert.equal(status, 0);
    assert.deepEqual(out, {valid: true, cost_class: 'heavy', leaves: 2, violations: []});
  }
});

test('CLI: an invalid predicate exits 1 with its violations', () => {
  const {status, out} = cli({predicate: {where: {and: [leaf('call.sid', 'is_null')]}}});
  assert.equal(status, 1);
  assert.deepEqual(out, {valid: false, cost_class: 'heavy', leaves: 1, violations: [{path: 'where.and[0].col', message: 'unknown or unallowlisted table: call'}]});
  assert.deepEqual(cli({window: {}, predicate: 'outcomes'}).out, {valid: false, cost_class: 'heavy', leaves: 0, violations: [{path: 'predicate', message: 'must be an object'}]});
  assert.equal(cli({window: {}, predicate: {where: null}}).status, 1);
});

test('CLI: a request or predicate with no where is valid, light, with no leaves', () => {
  const window = {start: '2026-09-01T00:00:00Z', end: '2026-09-02T00:00:00Z'};
  for (const document of [
    {window, predicate: {outcomes: ['escalated_cold']}},
    {window, predicate: {metric: 'containment', day: '2026-09-01', sampling: 0.5, eligible_for_scoring: true}},
    {window, predicate: {}},
    {window},
    {predicate: {disposition: {key: 'k', op: 'is_null'}}},
    {outcomes: ['abandoned'], hour_utc: '2026-09-01T12:00:00Z'},
  ]) {
    const {status, out} = cli(document);
    assert.equal(status, 0, JSON.stringify(document));
    assert.deepEqual(out, {valid: true, cost_class: 'light', leaves: 0, violations: []});
  }
  // A where beside other predicate keys is still checked.
  const {status, out} = cli({outcomes: ['abandoned'], where: leaf('to', 'is_null')});
  assert.equal(status, 1);
  assert.deepEqual(out.violations, [{path: 'where.col', message: 'denied column (may not be used in a predicate): calls.to'}]);
});

test('CLI: usage and unreadable input exit 2', () => {
  assert.equal(spawnSync(process.execPath, [script], {encoding: 'utf8'}).status, 2);
  assert.equal(cli('{not json').status, 2);
});

test('references/tables.md is the rendering of trusted-layer.json', () => {
  assert.equal(readFileSync(join(skill, 'references/tables.md'), 'utf8'), renderTables());
  assert.equal(renderTables(), renderTables());
  const run = spawnSync(process.execPath, [join(skill, 'scripts/render-tables.cjs'), '--check'], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
});

test('tables.md leads with calls, shows classes not stored types, and lists every table', () => {
  const page = readFileSync(join(skill, 'references/tables.md'), 'utf8');
  const sections = [...page.matchAll(/^## (\S+)$/gm)].map(m => m[1]).filter(s => s !== 'Type' && s !== 'Cost');
  const names = Object.keys(TABLES);
  assert.equal(sections[0], 'calls');
  assert.deepEqual([...sections].sort(), [...names].sort());
  assert.match(page, /### Virtual columns[\s\S]*`outcome`[\s\S]*`connected`[\s\S]*`early_exit`/);
  assert.match(page, /## call_outcomes[\s\S]*?Availability: not yet in the lake: refused/);
  assert.doesNotMatch(page, /\| (bigint|double|int|timestamp_ntz|array<|map<|struct<)/);
});

const NO_WHERE = {valid: true, cost_class: 'light', leaves: 0, violations: []};

test('a bare {} file means no where, while the raw validator stays strict', () => {
  assert.deepEqual(check({}), NO_WHERE);
  assert.deepEqual(cli({}), {status: 0, out: NO_WHERE, err: ''});
  // validatePredicate is the API's where check: an empty node is refused there.
  assert.deepEqual(messages({}), ['where.col: must be a column name']);
  assert.equal(cli({predicate: {where: {}}}).status, 1);
  assert.equal(cli({where: {}}).status, 1);
  // An object with unknown keys is still a node, and still refused.
  assert.deepEqual(cli({foo: 1}).out.violations, [{path: 'where.foo', message: 'unknown key; a node is { and } | { or } | { not } | { col, op, value? }'}]);
  assert.deepEqual(cli({op: 'is_null'}).out.violations, [{path: 'where.col', message: 'must be a column name'}]);
});

test('CLI usage names every accepted shape, including a bare {}', () => {
  const run = spawnSync(process.execPath, [script], {encoding: 'utf8'});
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Usage: node validate-predicate\.cjs <predicate\.json>/);
  assert.match(run.stderr, /bare \{\}\) is valid: light, 0 leaves/);
});

test('a 10,000-deep not chain is refused at depth 8 and never overflows the stack', () => {
  let node = leaf('completed', '=', true);
  for (let i = 0; i < 10000; i++) node = {not: node};
  const refusal = {path: `where${'.not'.repeat(8)}`, message: 'nesting exceeds the maximum depth of 8'};
  assert.equal(predicateCostClass(node), 'heavy');
  assert.deepEqual(check(node), {valid: false, cost_class: 'heavy', leaves: 0, violations: [refusal]});
  // Written as text: serializing the chain is itself deeper than the stack.
  const chain = `${'{"not":'.repeat(10000)}{"col":"completed","op":"=","value":true}${'}'.repeat(10000)}`;
  for (const text of [chain, `{"predicate":{"where":${chain}}}`]) {
    const {status, out, err} = cli(text);
    assert.equal(status, 1, err);
    assert.deepEqual(out, {valid: false, cost_class: 'heavy', leaves: 0, violations: [refusal]});
  }
});

test('the cost walk stops at the depth bound: 8 levels resolve, 9 count as heavy', () => {
  const nest = depth => (depth === 1 ? leaf('completed', '=', true) : {not: nest(depth - 1)});
  assert.equal(predicateCostClass(nest(8)), 'light');
  assert.equal(predicateCostClass(nest(9)), 'heavy');
});

// ---- references/examples.md ------------------------------------------------
// Convention (documented at the top of examples.md): a ```json fence holding a
// top-level "where" or "predicate" key must validate clean and light, unless
// the line before it is <!-- expect: heavy --> (clean and heavy) or
// <!-- expect: refused MESSAGE --> (exactly that one refusal; the next json
// fence is its fix, a whole corrected request or only the replacement node).
const examplesPath = join(skill, 'references/examples.md');
const examplesText = readFileSync(examplesPath, 'utf8');
const fences = [...examplesText.matchAll(/^(?:<!-- expect: (.+?) -->\n)?```json\n([\s\S]*?)^```$/gm)].map((m, index) => {
  const line = examplesText.slice(0, m.index).split('\n').length;
  return {index, line, expect: m[1] ?? null, doc: JSON.parse(m[2])};
});
const isRequest = doc => doc !== null && typeof doc === 'object' && !Array.isArray(doc) && ('where' in doc || 'predicate' in doc);
const requests = fences.filter(f => isRequest(f.doc));
const nodePath = violationPath => {
  const tokens = violationPath.replace(/\.col$/, '').split(/\.|\[(\d+)\]/).filter(t => t !== undefined && t !== '');
  assert.equal(tokens[0], 'where');
  assert.ok(tokens.length > 1, 'a refusal at the where root has no node to replace');
  return tokens.slice(1).map(t => (/^\d+$/.test(t) ? Number(t) : t));
};
const replaceNode = (doc, path, replacement) => {
  const copy = structuredClone(doc);
  let node = locateWhere(copy).where;
  for (const key of path.slice(0, -1)) node = node[key];
  node[path[path.length - 1]] = structuredClone(replacement);
  return copy;
};

test('examples.md: the markers are the known ones and the cases are all present', () => {
  for (const f of fences) assert.ok(f.expect === null || f.expect === 'heavy' || f.expect.startsWith('refused '), `line ${f.line}: unknown marker ${f.expect}`);
  assert.ok(requests.length >= 6, `only ${requests.length} request examples`);
  assert.equal(fences.filter(f => f.expect && f.expect.startsWith('refused ')).length, 1);
  assert.ok(fences.some(f => f.expect === 'heavy'));
  assert.ok(requests.some(f => f.expect === null), 'no light example');
});

for (const f of requests.filter(r => r.expect === null || r.expect === 'heavy')) {
  test(`examples.md line ${f.line}: validates clean and ${f.expect ?? 'light'}`, () => {
    assert.deepEqual(check(f.doc), {...check(f.doc), valid: true, violations: [], cost_class: f.expect ?? 'light'});
  });
}

for (const f of fences.filter(r => r.expect && r.expect.startsWith('refused '))) {
  const message = f.expect.slice('refused '.length);
  test(`examples.md line ${f.line}: refused with exactly "${message}", and its fix validates clean`, () => {
    assert.ok(isRequest(f.doc), 'a refusal example must be a request');
    const result = check(f.doc);
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 1, JSON.stringify(result.violations));
    const [{path, message: actual}] = result.violations;
    assert.equal(actual, message);
    assert.ok(examplesText.includes(`\`${path}: ${message}\``), `examples.md should quote the checker's output \`${path}: ${message}\``);
    const fix = fences[f.index + 1];
    assert.ok(fix, 'a refusal example needs a fix fence after it');
    const target = nodePath(path);
    const corrected = isRequest(fix.doc) ? fix.doc : replaceNode(f.doc, target, fix.doc);
    assert.deepEqual(check(corrected), {...check(corrected), valid: true, violations: []});
    if (isRequest(fix.doc)) {
      // The corrected request changes only the node the refusal named.
      let replacement = locateWhere(fix.doc).where;
      for (const key of target) replacement = replacement[key];
      assert.deepEqual(replaceNode(f.doc, target, replacement), fix.doc);
    }
  });
}
