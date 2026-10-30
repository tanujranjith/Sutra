import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const localDay = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
function fixture(now) {
  const blocks = [], notices = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } }
  const schedule = new Function('Date', 'timeBlocks', 'quickCaptureLocalISO', 'generateId', 'saveTimeBlocks', 'showToast', 'activeView',
    extractFunction(source, 'scheduleGenericItemAsBlock').body + ';return scheduleGenericItemAsBlock;')(
    Clock, blocks, localDay, () => 'qa-block', () => {}, message => notices.push(message), 'home');
  return { schedule, blocks, notices, Clock };
}

test('quick prep moves a passed same-day default into the future and retains canonical linkage', () => {
  const f = fixture(new Date(2026, 9, 22, 18, 49));
  assert.equal(f.schedule({ title: 'Orchid', dueDate: '2026-10-22', source: 'homework', sourceId: 'hw:orchid' }), true);
  assert.deepEqual(f.blocks.map(({ date, start, end, homeworkId }) => ({ date, start, end, homeworkId })), [
    { date: '2026-10-22', start: '19:00', end: '20:00', homeworkId: 'orchid' }
  ]);
  assert.match(f.notices[0], /earlier time has passed/);
});

test('late-night and overdue defaults roll forward without a backwards end time', () => {
  const f = fixture(new Date(2026, 9, 22, 23, 45));
  assert.equal(f.schedule({ title: 'Orchid', dueDate: '2026-10-20' }), true);
  assert.equal(f.blocks[0].date, '2026-10-23');
  assert.equal(f.blocks[0].start, '18:00');
  assert.equal(f.blocks[0].end, '19:00');
});

test('future calendar dates remain local days, including Date inputs late in the day', () => {
  const f = fixture(new Date(2026, 9, 22, 18, 49));
  const due = new f.Clock(2026, 9, 24, 23, 30);
  assert.equal(f.schedule({ title: 'Orchid', due, dueTime: '09:00' }), true);
  assert.equal(f.blocks[0].date, localDay(due));
  assert.equal(f.blocks[0].start, '09:00');
  assert.equal(f.blocks[0].end, '10:00');
});

test('invalid and midnight-wrapping explicit times do not create blocks', () => {
  const f = fixture(new Date(2026, 9, 22, 18, 49));
  for (const dueTime of ['banana', '25:10', '23:30']) assert.equal(f.schedule({ dueDate: '2026-10-24', dueTime }), false);
  assert.equal(f.blocks.length, 0);
});
