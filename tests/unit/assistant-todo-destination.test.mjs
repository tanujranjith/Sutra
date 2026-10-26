import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const canonical = createRequire(import.meta.url)('../../src/domain/homework-store.js');
const source = readFileSync(new URL('../../src/features/assistant/flow-assistant.js', import.meta.url), 'utf8');
function setup({ legacy = [], persist = () => Promise.resolve(true), permission = '' } = {}) {
  const store = canonical.createStore({ tasks: [] });
  store.configure({ setWorkspace() {}, persist });
  const b = { tasks: legacy, persistAppData: () => Promise.resolve(true), renderTaskViews() {} };
  const state = { store, b, messages: [], view: '' };
  const names = ['saveAssistantTodo', 'applyCreateTask', 'moveLegacyAssistantTodo', 'receiptLinkForAction', 'deleteObject'];
  const code = names.map(name => (name === 'moveLegacyAssistantTodo' ? 'async ' : '') + extractFunction(source, name).body).join('\n');
  const api = new Function('window', 'bridge', 'makeId', 'homeworkSnapshot', 'notifyHomeworkChanged', 'safeCall', 'addPageLinks', 'showToast', 'callApp', 'assistantActionPermissionError', 'safeHwWrite',
    code + ';return {saveAssistantTodo,applyCreateTask,moveLegacyAssistantTodo,receiptLinkForAction,deleteObject};')(
    { SutraHomeworkStore: store, SutraCapabilityRegistry: { get: () => ({ domain: 'tasks' }) } },
    () => b, () => 'new-task', () => store.getSnapshot(), () => {}, fn => fn && fn(), () => {},
    message => state.messages.push(message), (_fn, view) => { state.view = view; }, () => permission,
    (_key, json) => { store.transact(workspace => { workspace.tasks = JSON.parse(json); }); return { ok: true }; });
  return Object.assign(state, api);
}

test('Assistant task is a canonical general To-do with date/time and survives store round trip', () => {
  const s = setup();
  const result = s.applyCreateTask({ title: 'Math test', dueDate: '2026-10-27', dueTime: '09:00', notes: 'Chapter 4', priority: 'high' });
  assert.equal(result.ok, true);
  assert.equal(s.b.tasks.length, 0, 'do not create an invisible legacy planner task');
  const task = canonical.normalizeWorkspace(s.store.getSnapshot()).tasks[0];
  assert.equal(task.kind, 'task');
  assert.equal(task.title, 'Math test');
  assert.equal(task.dueDate, '2026-10-27');
  assert.equal(task.dueTime, '09:00');
  assert.equal(task.notes, 'Chapter 4');
  assert.equal(task.done, false);
  assert.deepEqual(result.payload.createdObjectIds, [{ kind: 'homework', id: task.id }]);
  assert.equal(s.receiptLinkForAction({ type: 'create_task' }, result).label, 'Open To-do');
  assert.equal(s.applyCreateTask({ title: 'Math test', dueDate: '2026-10-27', dueTime: '09:00', notes: 'Chapter 4' }).existing, true);
  assert.equal(s.store.getSnapshot().tasks.length, 1, 'a rehydrated proposal must not duplicate its saved reminder');
  assert.equal(s.deleteObject('homework', task.id), true);
  assert.equal(s.store.getSnapshot().tasks.length, 0);
});

test('reapplying an old proposal offers a move rather than creating another reminder', async () => {
  const legacy = { id: 'old', title: 'Physics test', dueDate: '2026-10-27', origin: 'flow', completed: false, futureMetadata: { retain: true } };
  const s = setup({ legacy: [legacy] });
  const result = s.applyCreateTask({ title: legacy.title, dueDate: legacy.dueDate });
  assert.equal(result.existing, true);
  assert.equal(s.store.getSnapshot().tasks.length, 0);
  assert.equal(s.receiptLinkForAction({ type: 'create_task' }, result).label, 'Move to To-do');
  assert.equal(await s.moveLegacyAssistantTodo('old'), true);
  assert.equal(s.b.tasks.length, 0);
  const task = s.store.getSnapshot().tasks[0];
  assert.equal(task.id, 'old');
  assert.deepEqual(task.futureMetadata, { retain: true });
  assert.equal(s.view, 'homework');
  assert.equal(s.deleteObject('task', 'old'), true, 'old receipt Undo still owns the moved id');
  assert.equal(s.store.getSnapshot().tasks.length, 0);
});

test('failed destination save or blocked permissions never remove the original planner reminder', async () => {
  for (const options of [{ persist: () => Promise.resolve(false) }, { permission: 'Write permission blocked.' }]) {
    const legacy = { id: 'old', title: 'Test', origin: 'flow', completed: false };
    const s = setup({ legacy: [legacy], ...options });
    assert.equal(await s.moveLegacyAssistantTodo('old'), false);
    assert.equal(s.b.tasks[0], legacy);
    assert.equal(s.view, '');
  }
});

test('edited canonical task blocks recovery without deleting or overwriting either value', async () => {
  const legacy = { id: 'old', title: 'Test', origin: 'flow', completed: false };
  const s = setup({ legacy: [legacy] });
  s.store.transact(workspace => { workspace.tasks.push({ ...legacy, kind: 'task', done: true }); });
  assert.equal(await s.moveLegacyAssistantTodo('old'), false);
  assert.equal(s.b.tasks[0], legacy);
  assert.equal(s.store.getSnapshot().tasks[0].done, true);
});
