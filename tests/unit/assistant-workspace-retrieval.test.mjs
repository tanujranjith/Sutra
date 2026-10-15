import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/features/assistant/flow-assistant.js', import.meta.url), 'utf8');
const privacy = createRequire(import.meta.url)('../../src/domain/assistant-permissions.js');
const record = (type, id, title, extra = {}) => ({ type, id, key: type + ':' + id, title, text: title, status: 'open', dates: {}, privacy: {}, metadata: {}, ...extra });
function selector(records, permissions = { mode: 'read_only', areas: {} }, memoryMode = 'stateless') {
  privacy.configure({ getPermissions: () => permissions });
  return new Function('window', 'truncate', 'getChatMemoryMode', extractFunction(source, 'selectRelevantWorkspaceContext').body + ';return selectRelevantWorkspaceContext;')({
    SutraWorkspaceEntityRegistry: { collectSearchable: () => records }, SutraAssistantPrivacy: privacy
  }, (text, limit) => String(text || '').slice(0, limit), () => memoryMode);
}

test('exam dates, task URLs and exact registry citations survive selective retrieval', () => {
  const result = selector([
    record('testing_exam', 'sat', 'SAT', { dates: { due: '2026-12-05' } }),
    record('homework', 'robotics', 'Robotics sensor demo', { text: 'Sensor demo notes edited after reopening', metadata: { referenceUrl: 'https://example.com/robotics' } })
  ])('What is my SAT date and the notes and Reference URL for my Robotics sensor demo task?');
  assert.equal(result.workspaceLearning[0].dueDate, '2026-12-05');
  assert.equal(result.homework[0].referenceUrl, 'https://example.com/robotics');
  assert.equal(result.homework[0].citationUrl, 'sutra://entity/homework%3Arobotics');
});

test('task follow-up uses preceding user question only in stateful mode', () => {
  const records = [record('homework', 'robotics', 'Robotics sensor demo', { metadata: { referenceUrl: 'https://example.com/robotics' } })];
  const options = { conversation: [
    { role: 'user', content: 'What are my Robotics sensor demo notes?' },
    { role: 'assistant', content: 'Invented unrelated target' }
  ] };
  assert.equal(selector(records, undefined, 'stateful')('What is its Reference URL?', options).homework[0].id, 'robotics');
  assert.equal(selector(records)('What is its Reference URL?', options).homework, undefined);
});

test('personal saved-data questions cannot be intercepted by product help', () => {
  let opened = false;
  const route = new Function('window', extractFunction(source, 'routeProductKnowledge').body + ';return routeProductKnowledge;')({
    SutraProductKnowledge: { answer: () => ({ entry: { id: 'notes' } }) },
    SutraLocalHelp: { nodeIdForKnowledge: () => 'notes', open: () => { opened = true; return true; } }
  });
  const question = 'What is my SAT date and the saved notes for my Robotics task?';
  assert.equal(route(question, question.toLowerCase()), null);
  assert.equal(opened, false);
});

test('reading exam facts does not infer a status-changing proposal from quoted notes', () => {
  const infer = new Function('window', 'truncate', extractFunction(source, 'inferExamStatusFromReply').body + ';return inferExamStatusFromReply;')({
    getTestingHubAssistantSummary: () => ({ exams: [{ id: 'sat', name: 'SAT', taken: false }] })
  }, text => text);
  const reply = 'Your SAT test date is December 5 as listed in the record; your task notes were updated.';
  assert.deepEqual(infer(reply, { userText: 'What is my SAT date and my task notes?' }), []);
  assert.deepEqual(infer('Your SAT test is completed.', { userText: 'Which tests are completed?' }), []);
  assert.equal(infer('I can mark SAT as taken.', { userText: 'Mark SAT as taken' })[0].type, 'update_exam_status');
});

test('to-do retrieval includes undated and distant low-priority work across stores', () => {
  const result = selector([
    record('task', 'undated', 'Clean locker'),
    record('task', 'distant', 'History project', { dates: { due: '2099-12-01' }, metadata: { priority: 'low' } }),
    record('homework', 'assignment', 'Biology worksheet'),
    record('task', 'finished', 'Completed task', { status: 'completed' }),
    record('college_record', 'unrelated', 'University visit')
  ])("what's in my to-do list?");
  assert.deepEqual(result.tasks.map(row => row.id).sort(), ['distant', 'undated']);
  assert.equal(result.homework[0].id, 'assignment');
  assert.equal(result.workspaceCollege, undefined);
});

test('relevant content can be found beyond the first bounded summary in any registered area', () => {
  const records = Array.from({ length: 80 }, (_, i) => record('task', 'task-' + i, 'Ordinary task ' + i));
  records.push(record('course_file', 'source', 'Orchid laboratory guide', { text: 'The Orchid protocol uses three violet cards.' }));
  const result = selector(records)('Explain the Orchid protocol');
  assert.equal(result.workspaceCourses[0].id, 'source');
  assert.equal(result.tasks, undefined);
  assert.equal(result.workspaceRetrieval.selectedCount, 1);
});

test('conversational task summaries retrieve work without matching request verbs against task titles', () => {
  const select = selector([record('task', 'planner', 'Clean locker'), record('homework', 'assignment', 'Biology worksheet'), record('college_record', 'unrelated', 'University visit')]);
  for (const query of ['can u summarize my todos', 'check my homework', 'could you please summarise my to-dos', 'show all my tasks']) {
    const context = select(query);
    assert.equal(context.tasks[0].id, 'planner', query);
    assert.equal(context.homework[0].id, 'assignment', query);
    assert.equal(context.workspaceCollege, undefined, query);
  }
  assert.equal(select('can u summarize my biology homework').tasks, undefined);
});

test('irrelevant workspaces and a greeting do not create broad context dumps', () => {
  const select = selector([record('task', 'task', 'Clean locker'), record('business_record', 'project', 'Client invoice'), record('life_record', 'goal', 'Read a book')]);
  assert.deepEqual(Object.keys(select('hello')).sort(), ['workspaceRetrieval']);
  assert.equal(select('Tell me about the book').workspaceLife[0].id, 'goal');
  assert.equal(select('Tell me about the book').tasks, undefined);
});

test('asking about one homework topic does not attach every task', () => {
  const records = Array.from({ length: 60 }, (_, i) => record('task', 'task-' + i, 'Ordinary task ' + i));
  records.push(record('homework', 'biology', 'Biology worksheet'));
  const result = selector(records)('show my biology homework');
  assert.equal(result.homework[0].id, 'biology');
  assert.equal(result.tasks, undefined);
  assert.equal(result.workspaceRetrieval.selectedCount, 1);
});

test('search obeys denied areas, sensitive flags, private locks, and source exclusions', () => {
  const records = [
    record('task', 'denied', 'Orchid task'),
    record('college_record', 'cost', 'Orchid tuition', { metadata: { collection: 'applicationCosts' } }),
    record('life_record', 'wellness', 'Orchid mood', { metadata: { domain: 'wellness' } }),
    record('course_file', 'locked', 'Orchid private', { privacy: { locked: true } }),
    record('course_file', 'excluded', 'Orchid excluded'),
    record('course_file', 'allowed', 'Orchid course')
  ];
  const result = selector(records, { mode: 'read_only', areas: { planning: 'denied' } })('Orchid', { conversationScope: { excludedSourceIds: ['course_file:excluded'] } });
  assert.deepEqual(result.workspaceCourses.map(row => row.id), ['allowed']);
  assert.equal(result.tasks, undefined);
  assert.equal(result.workspaceCollege, undefined);
  assert.equal(result.workspaceLife, undefined);
  const gated = privacy.filterContext({ workspaceCourses: result.workspaceCourses, workspacePlanning: [{ id: 'denied' }] });
  assert.equal(gated.workspacePlanning, undefined);
  assert.equal(gated.workspaceCourses[0].id, 'allowed');
});

test('large task requests report a limit rather than pretending the shortlist is complete', () => {
  const result = selector(Array.from({ length: 60 }, (_, i) => record('task', 'id-' + i, 'Task ' + i)))('show my tasks');
  assert.equal(result.tasks.length, 40);
  assert.equal(result.workspaceRetrieval.matchedCount, 60);
  assert.equal(result.workspaceRetrieval.selectedCount, 40);
});

test('denied Notes access is identified separately from permitted task retrieval', () => {
  const select = selector([record('task', 'planner', 'Clean locker')], { mode: 'read_only', areas: { notes: 'denied' } });
  const retrieve = new Function('window', 'scopedAssistantContextOptions', 'currentLockedPageAccessIds',
    extractFunction(source, 'retrieveNoteSources').body + ';return retrieveNoteSources;')({
      SutraAssistantPrivacy: privacy,
      SutraNotesKnowledgeCore: { buildIndex() {}, search() {} }
    }, options => options, () => []);
  const notes = retrieve('check my homework');
  assert.equal(notes.evidenceStatus, 'permission_required');
  assert.equal(notes.scope.area, 'notes');
  assert.equal(select('check my homework').tasks[0].id, 'planner');
});

test('the local to-do answer reads canonical planner and Homework rows without switching views', () => {
  privacy.configure({ getPermissions: () => ({ mode: 'read_only', areas: {} }) });
  const answer = new Function('window', 'listOpenWorkspaceTasks', extractFunction(source, 'tryReadTodoList').body + ';return tryReadTodoList;')(
    { SutraAssistantPrivacy: privacy }, () => [
      { store: 'planner', id: 'planner', title: 'Clean locker', completed: false },
      { store: 'homework', id: 'homework', title: 'Biology worksheet', completed: false },
      { store: 'planner', id: 'done', title: 'Finished', completed: true }
    ]);
  assert.match(answer("what's in my to-do list?").message, /2 open items/);
  assert.match(answer("what's in my to-do list?").message, /sutra:\/\/homework\/homework/);
  assert.ok(!answer("what's in my to-do list?").message.includes('Finished'));
  for (const query of ['can u summarize my todos', 'check my homework', 'could you please summarise my to-dos']) {
    assert.match(answer(query).message, /Clean locker/, query);
    assert.match(answer(query).message, /Biology worksheet/, query);
    assert.equal(answer(query).source, 'local', query);
  }
  assert.equal(answer('can u summarize my biology homework'), null);
  assert.equal(answer('check off my homework'), null);
  assert.equal(answer('delete my tasks'), null);
  privacy.configure({ getPermissions: () => ({ mode: 'read_only', areas: { planning: 'denied' } }) });
  assert.match(answer("what's in my to-do list?").message, /access is off/);
  assert.equal(answer('check my homework').grounding.scope.area, 'planning');
  assert.equal(answer('can u summarize my todos').grounding.evidenceStatus, 'permission_required');
  assert.equal(answer('Explain photosynthesis'), null);
});
