import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const require = createRequire(import.meta.url);
const { runWorkspaceInvestigation } = require('../../src/features/assistant/assistant-core.js');
const source = readFileSync(new URL('../../src/features/assistant/flow-assistant.js', import.meta.url), 'utf8');
const privacy = require('../../src/features/assistant/assistant-permissions.js');
const safety = require('../../src/features/assistant/assistant-safety.js');
const assistantCore = require('../../src/features/assistant/assistant-core.js');
const estimateTokens = value => Math.ceil(String(value).length / 3.5);
const lookup = data => ({ ok: true, dataSent: true, text: '```sutra-lookup\n' + JSON.stringify(data) + '\n```', usage: { available: true, inputTokens: 10, outputTokens: 2, totalTokens: 12 }, latencyMs: 5 });
const record = (key, excerpt = 'bounded evidence') => ({ evidence: { key, excerpt }, source: { key, id: key.split(':')[1], kind: key.split(':')[0] } });
function runner(overrides = {}) {
  return {
    signal: new AbortController().signal, estimateTokens,
    request: async () => ({ ok: true, text: 'Answer' }),
    prepareTurn: async state => ({ request: { systemPrompt: 'Rules', messages: [{ role: 'user', content: 'Compare my records' }] }, records: state.records, matches: state.matches, sources: [] }),
    search: async () => ({ matches: [{ key: 'task:a', title: 'A' }, { key: 'note:b', title: 'B' }] }),
    read: async keys => keys.map(key => record(key)), choose: async matches => [matches[0].key],
    ...overrides
  };
}

test('provider-neutral search/read/answer uses at most three bounded calls and aggregates usage', async () => {
  const calls = [], sent = [], replies = [lookup({ search: 'Orchid' }), lookup({ read: ['task:a', 'note:b'] }), { ...lookup({}), text: 'A says Monday; B says Tuesday. The sources disagree.' }];
  const result = await runWorkspaceInvestigation(runner({ request: async options => { calls.push(options); return replies.shift(); }, onSent: sources => sent.push(sources) }));
  assert.equal(calls.length, 3);
  assert.equal(result.investigationTurns, 3);
  assert.equal(result.usage.totalTokens, 36);
  assert.equal(result.latencyMs, 15);
  assert.match(result.text, /sources disagree/);
  assert.equal(sent.at(-1).length, 2);
  assert.ok(!JSON.stringify(calls[0]).includes('bounded evidence'));
  assert.ok(JSON.stringify(calls[2]).includes('bounded evidence'));
  for (const call of calls) {
    assert.equal(call.stream, false);
    assert.equal(call.maxRetries, 0);
    assert.ok(estimateTokens(call.systemPrompt + '\n' + JSON.stringify(call.messages)) + 1536 <= 6000);
  }
});

test('ambiguous metadata waits for explicit selection before reading any body', async () => {
  const reads = [], calls = [];
  let selected = false;
  const result = await runWorkspaceInvestigation(runner({
    request: async options => { calls.push(options); return calls.length === 1 ? lookup({ search: 'Orchid' }) : { ok: true, text: 'Chosen source only.' }; },
    search: async () => ({ matches: [{ key: 'task:a', title: 'Orchid' }, { key: 'task:b', title: 'Orchid' }], ambiguous: true }),
    choose: async matches => { assert.equal(reads.length, 0); assert.equal(calls.length, 1); assert.ok(matches.every(row => !row.excerpt)); selected = true; return ['task:b']; },
    read: async keys => { assert.ok(selected); reads.push(keys); return keys.map(key => record(key)); }
  }));
  assert.deepEqual(reads, [['task:b']]);
  assert.ok(!JSON.stringify(calls[1]).includes('task:a'));
  assert.equal(result.ok, true);
});

test('Stop during clarification prevents the next provider call', async () => {
  const controller = new AbortController(); let calls = 0, reads = 0;
  const result = await runWorkspaceInvestigation(runner({ signal: controller.signal,
    request: async () => { calls++; return lookup({ search: 'Orchid' }); },
    search: async () => ({ matches: [{ key: 'task:a' }, { key: 'task:b' }], ambiguous: true }),
    choose: async () => { controller.abort(); return ['task:a']; }, read: async () => { reads++; return []; }
  }));
  assert.equal(result.cancelled, true);
  assert.equal(calls, 1); assert.equal(reads, 0); assert.equal(result.dataSent, true);
});

test('invented reads, fifth records and repeated lookup requests stop visibly without exposing protocol', async () => {
  for (const payload of [{ read: ['task:invented'] }, { read: ['a', 'b', 'c', 'd', 'e'] }]) {
    let calls = 0, reads = 0;
    const result = await runWorkspaceInvestigation(runner({ request: async () => { calls++; return lookup(payload); }, read: async () => { reads++; return []; } }));
    assert.equal(calls, 1); assert.equal(reads, 0);
    assert.match(result.text, /could not finish/); assert.doesNotMatch(result.text, /sutra-lookup/);
  }
  let calls = 0;
  const result = await runWorkspaceInvestigation(runner({ request: async () => { calls++; return lookup({ search: 'Orchid' }); } }));
  assert.equal(calls, 3); assert.match(result.text, /three-turn/);
});

test('request budgeting omits whole records and sources together and keeps explicit input intact', async () => {
  const explicit = 'Student message remains intact'; let sentSources, finalRequest;
  const result = await runWorkspaceInvestigation(runner({
    prepareTurn: async () => ({ request: { systemPrompt: 'Rules', messages: [{ role: 'user', content: explicit }] }, records: [record('task:a', 'A'.repeat(20000)), record('task:b', 'B'.repeat(20000))] }),
    onSent: sources => { sentSources = sources; }, request: async request => { finalRequest = request; return { ok: true, text: 'Limited answer' }; }
  }));
  assert.deepEqual(sentSources, []);
  assert.equal(finalRequest.messages[0].content, explicit);
  assert.ok(!JSON.stringify(finalRequest).includes('A'.repeat(100)));
  assert.match(result.text, /Partial workspace evidence/);
});

test('oversized explicit input causes no paid call and a visible budget explanation', async () => {
  let calls = 0;
  const result = await runWorkspaceInvestigation(runner({ prepareTurn: async () => ({ request: { systemPrompt: '', messages: [{ role: 'user', content: 'X'.repeat(40000) }] } }), request: async () => { calls++; } }));
  assert.equal(calls, 0); assert.equal(result.dataSent, false); assert.match(result.text, /6,000/);
});

test('hidden reasoning and malformed partial lookup output never reach visible chat', async () => {
  const answer = await runWorkspaceInvestigation(runner({ request: async () => ({ ok: true, text: '<think>Private reasoning</think>Visible answer' }) }));
  assert.equal(answer.text, 'Visible answer');
  const partial = await runWorkspaceInvestigation(runner({ request: async () => ({ ok: false, text: '```sutra-lookup {"read":', dataSent: true }) }));
  assert.equal(partial.text, '');
});

function policyFixture(records, permissions = { mode: 'read_only', areas: {} }, options = {}) {
  privacy.configure({ getPermissions: () => permissions });
  const pages = records.filter(row => row.type === 'note').map(row => ({ id: row.id, isLocked: row.privacy.locked, ...row.page }));
  const area = new Function(extractFunction(source, 'investigationArea').body + ';return investigationArea;')();
  const window = { SutraAssistantPrivacy: privacy, SutraAssistantSafety: safety, SutraAssistantCore: assistantCore, SutraWorkspaceEntityRegistry: {
    find: key => records.find(row => row.key === key), listAdapters: () => [...new Set(records.map(row => row.type))].map(id => ({ id })),
    collectSearchable: (_context, collectOptions) => records.filter(row => collectOptions.types.includes(row.type))
  } };
  const allowed = new Function('window', 'investigationArea', 'bridge', 'pageIsLocked', extractFunction(source, 'investigationRecordAllowed').body + ';return investigationRecordAllowed;')(window, area, () => ({ pages }), page => page?.isLocked === true);
  const search = new Function('window', 'investigationArea', 'investigationRecordAllowed', extractFunction(source, 'searchInvestigationRecords').body + ';return searchInvestigationRecords;')(window, area, allowed);
  const read = new Function('window', 'investigationArea', 'investigationRecordAllowed', extractFunction(source, 'readInvestigationRecords').body + ';return readInvestigationRecords;')(window, area, allowed);
  return { search: query => search(query, options), read: keys => read(keys, options), permissions };
}
const entity = (type, id, extra = {}) => ({ type, id, key: type + ':' + id, title: 'Orchid', text: 'Orchid source body', privacy: { searchable: true }, dates: {}, metadata: {}, ...extra });

test('canonical search returns metadata only; live reads reject revoked, excluded, locked, wellness and financial sources', () => {
  const fixture = policyFixture([
    entity('task', 'allowed'), entity('task', 'excluded'), entity('note', 'locked', { privacy: { locked: true } }),
    entity('life_record', 'wellness', { metadata: { domain: 'wellness' } }), entity('college_record', 'financial', { metadata: { collection: 'applicationCosts' } }),
    entity('course_file', 'private', { privacy: { private: true } }), entity('note', 'help', { page: { builtInId: 'help-docs' } })
  ], undefined, { scope: { excludedSourceIds: ['task:excluded'] } });
  const found = fixture.search('Orchid');
  assert.deepEqual(found.matches.map(row => row.key), ['task:allowed']);
  assert.doesNotMatch(JSON.stringify(found.matches), /source body/);
  assert.equal(fixture.read(['task:allowed']).length, 1);
  fixture.permissions.areas.planning = 'denied';
  assert.deepEqual(fixture.read(['task:allowed']), []);
});

test('reads are capped at four and note/course scopes cannot be expanded by lookup output', () => {
  const rows = Array.from({ length: 6 }, (_, i) => entity('task', 'a' + i, { courseId: 'one' }));
  rows.push(entity('task', 'other', { courseId: 'two' }));
  const fixture = policyFixture(rows, undefined, { scope: { type: 'course', courseId: 'one' } });
  assert.equal(fixture.read(rows.map(row => row.key)).length, 4);
  assert.deepEqual(fixture.read(['task:other']), []);
});


test('only explicit workspace investigations activate; Minimal, PIN, attachments and narrow legacy scopes keep their existing path', () => {
  let depth = 'workspace', ticket = null, attachments = [];
  const gate = new Function('normalizeDepth', 'currentLockedPageAccessTicket', 'getAttachments', 'getActiveViewName', extractFunction(source, 'shouldInvestigateWorkspace').body + ';return shouldInvestigateWorkspace;')(
    () => depth, () => ticket, () => attachments, () => 'assistantview'
  );
  assert.equal(gate('Compare my Orchid and Cedar assignment records'), true);
  assert.equal(gate('Investigate my Orchid assignment notes'), true);
  assert.equal(gate('hello'), false);
  assert.equal(gate('What is my exam date?'), false);
  assert.equal(gate('Compare this current note with my task'), false);
  assert.equal(gate('Compare my project notes', { conversationScope: { type: 'folder', id: 'folder-one' } }), false);
  depth = 'minimal'; assert.equal(gate('Investigate my notes'), false);
  depth = 'workspace'; ticket = {}; assert.equal(gate('Investigate my notes'), false);
  ticket = null; attachments = [{}]; assert.equal(gate('Investigate my notes'), false);
});

test('excluding a note excerpt excludes that note from investigation bodies too', () => {
  const fixture = policyFixture([entity('note', 'orchid')], undefined, { scope: { excludedSourceIds: ['orchid:0:0'] } });
  assert.deepEqual(fixture.search('Orchid').matches, []);
  assert.deepEqual(fixture.read(['note:orchid']), []);
});


test('new canonical lookup evidence and source titles redact credentials before transmission', () => {
  const secret = 'sk-unitsecret1234567890';
  const fixture = policyFixture([entity('task', 'orchid', { title: 'Orchid ' + secret, text: 'Source includes ' + secret,
    metadata: { taskNotes: 'Notes ' + secret, referenceUrl: 'https://example.test/?key=' + secret } })]);
  const matches = fixture.search('Orchid').matches;
  const records = fixture.read(['task:orchid']);
  assert.equal(records.length, 1);
  assert.ok(!JSON.stringify(matches).includes(secret));
  assert.ok(!JSON.stringify(records).includes(secret));
  assert.match(records[0].evidence.notes, /redacted/);
  assert.match(records[0].source.title, /redacted/);
});

test('metadata from a later turn cannot replace the exact excerpt of an already read note source', async () => {
  let call = 0, finalSources;
  const result = await runWorkspaceInvestigation(runner({
    prepareTurn: async () => ({ request: { systemPrompt: 'Rules', messages: [{ role: 'user', content: 'Compare my notes' }] },
      matches: [{ key: 'note:orchid', kind: 'note', title: 'Orchid' }],
      records: call === 0 ? [{ evidence: { key: 'note:orchid', excerpt: 'Exact note evidence' }, source: { id: 'note:orchid', kind: 'note', noteId: 'orchid', title: 'Orchid', quote: 'Exact note evidence' } }] : [] }),
    request: async () => ++call === 1 ? lookup({ search: 'Orchid' }) : { ok: true, text: 'Answer' },
    onSent: sources => { finalSources = sources; }
  }));
  assert.equal(result.ok, true); assert.equal(finalSources.length, 1); assert.equal(finalSources[0].quote, 'Exact note evidence');
});


test('ordinary analysis/reasoning markup in code is preserved while usual provider think blocks are removed', async () => {
  const content = '<think>Private provider reasoning</think>\n```html\n<analysis>normal markup</analysis><reasoning>example tag</reasoning>\n```';
  const result = await runWorkspaceInvestigation(runner({ request: async () => ({ ok: true, text: content }) }));
  assert.doesNotMatch(result.text, /Private provider reasoning/);
  assert.match(result.text, /<analysis>normal markup<\/analysis>/);
  assert.match(result.text, /<reasoning>example tag<\/reasoning>/);
});


test('a missing provider usage block never makes partial totals look like complete measured usage', async () => {
  let calls = 0;
  const result = await runWorkspaceInvestigation(runner({ request: async () => ++calls === 1
    ? lookup({ search: 'Orchid' }) : { ok: true, text: 'Metadata answer', usage: { available: false }, durationMs: 7 } }));
  assert.equal(result.usage.available, false);
  assert.equal(result.usage.totalTokens, null);
  assert.equal(result.usage.inputTokens, null);
  assert.equal(result.latencyMs, 12);
});
