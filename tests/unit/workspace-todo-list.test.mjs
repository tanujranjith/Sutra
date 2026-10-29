import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import { createRequire } from 'node:module';
const ctx={window:{},Date};vm.createContext(ctx);vm.runInContext(fs.readFileSync('src/features/workspace/today-command-center.js','utf8'),ctx);const collect=ctx.window.SutraTodayCenter.collectWorkspaceTodos;
test('workspace list includes undated source records, excludes completed mirrors and preserves source identities',()=>{const snap={deadlines:[{id:'task:a',source:'task',sourceId:'a',title:'Dated',due:new Date(2026,9,30)}],tasks:[{id:'a',title:'Dated',dueDate:'2026-10-30',isActive:true},{id:'b',title:'Undated',isActive:true},{id:'done',title:'Done',completed:true},{id:'mirror',origin:'homework',homeworkSourceId:'hw',isActive:true}],homework:[{id:'hw',title:'Homework',studio:{enabled:true,milestones:[{id:'m',title:'Step'}],subtasks:[{id:'s',title:'Subtask'}]}}],collegeApp:{essayOrganizer:[{id:'essay',school:'College',draftStatus:'drafting'}],scholarships:[{id:'closed',status:'submitted'}]},collegeTracker:{},life:{goals:[{id:'goal',title:'Personal goal'}]},business:{tasks:[{id:'business',title:'Follow up'}],projects:[{id:'closed',status:'completed'}]}};const before=JSON.stringify(snap);const items=collect(snap,new Date(2026,9,28));assert.equal(items.filter(i=>i.id==='task:a').length,1);for(const id of ['task:b','hw:hw','milestone:hw:m','subtask:hw:s','collegeapp:essay:essay','life:goal:goal','biz:tasks:business'])assert.ok(items.some(i=>i.id===id),id);assert.ok(!items.some(i=>['task:done','task:mirror','biz:proj:closed','collegeapp:scholarship:closed'].includes(i.id)));assert.equal(items.find(i=>i.id==='task:b').due,null);assert.equal(JSON.stringify(snap),before);});
test('workspace list respects legacy daily completion and keeps same-title records separate',()=>{const items=collect({tasks:[{id:'1',title:'Same',isActive:true},{id:'2',title:'Same',isActive:true},{id:'3',title:'Inactive',isActive:false,scheduleType:'once'}],completedTaskIds:['1']});assert.deepEqual(Array.from(items,i=>i.id),['task:2']);});

test('workspace list honors canonical Homework reopening and keeps legacy completion metadata', () => {
  const store = createRequire(import.meta.url)('../../src/domain/homework-store.js');
  const homework = store.normalizeWorkspace({ tasks: [
    { id: 'reopened', title: 'Reopened', done: false, completed: true, status: 'done', futureField: { keep: true }, studio: { enabled: true, milestones: [{ id: 'step', title: 'Step' }] } },
    { id: 'dated', title: 'Reopened dated', done: false, completed: true, status: 'done', dueDate: '2026-11-01' },
    { id: 'finished', title: 'Finished', done: true, completed: false },
    { id: 'legacy', title: 'Legacy completion', completed: true },
    { id: 'archived', title: 'Archived', done: false, status: 'archived', dueDate: '2026-11-01', studio: { enabled: true, milestones: [{ id: 'step', title: 'Archived step' }] } },
    { id: 'cancelled', title: 'Cancelled', done: false, status: 'cancelled' },
    { id: 'canceled', title: 'Canceled', done: false, status: 'canceled' }
  ] }).tasks;
  const before = structuredClone(homework);
  const items = collect({ homework, deadlines: [
    { id: 'hw:dated', source: 'homework', sourceId: 'dated', title: 'Reopened dated', due: new Date(2026, 10, 1) },
    { id: 'hw:archived', source: 'homework', sourceId: 'archived', title: 'Archived', status: 'open', due: new Date(2026, 10, 1) }
  ] });
  const ids = Array.from(items, item => item.id);
  assert.ok(ids.includes('hw:reopened'));
  assert.ok(ids.includes('milestone:reopened:step'));
  assert.equal(ids.filter(id => id === 'hw:dated').length, 1);
  assert.ok(!ids.includes('hw:finished'));
  assert.ok(!ids.includes('hw:legacy'));
  assert.ok(!ids.includes('hw:archived'));
  assert.ok(!ids.includes('milestone:archived:step'));
  assert.ok(!ids.includes('hw:cancelled'));
  assert.ok(!ids.includes('hw:canceled'));
  assert.deepEqual(homework, before);
});
