import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../../src/features/workspace/timeline-drag.js');

function setup(initial = [], flush = async () => {}) {
    const timeBlocks = structuredClone(initial);
    globalThis.flowAtelier = {
        timeBlocks,
        saveTimeBlocks() {},
        flushAppSaveNow: flush
    };
    globalThis.SutraHomeworkStore = {
        getSnapshot() {
            return {
                tasks: [{
                    id: 'hw-1',
                    title: 'Canonical essay',
                    courseId: 'english',
                    priority: 'high',
                    dueDate: '2026-07-20',
                    estimateMinutes: 90,
                    extensionField: { preserved: true }
                }]
            };
        }
    };
    return timeBlocks;
}

test('preview rejects occupied time and allows an exact adjacent fit', () => {
    const rows = setup([{ id: 'busy', date: '2026-07-14', start: '10:00', end: '11:00', name: 'Class' }]);
    const conflict = api.previewSchedule(
        { title: 'Read', source: 'task', sourceId: 'task-1' },
        { date: '2026-07-14', start: '10:30', durationMinutes: 30 },
        rows
    );
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, 'conflict');
    assert.deepEqual(conflict.conflicts.map((block) => block.id), ['busy']);

    const adjacent = api.previewSchedule(
        { title: 'Read', source: 'task', sourceId: 'task-1' },
        { date: '2026-07-14', start: '11:00', durationMinutes: 30 },
        rows
    );
    assert.equal(adjacent.ok, true);
    assert.equal(adjacent.start, '11:00');
    assert.equal(adjacent.end, '11:30');
});

test('preview rejects impossible calendar dates and safely defaults invalid duration input', () => {
    setup();
    const badDate = api.previewSchedule(
        { title: 'Read', source: 'task', sourceId: 'task-1' },
        { date: '2026-02-31', start: '10:00', durationMinutes: 30 }
    );
    assert.equal(badDate.ok, false);
    assert.equal(badDate.code, 'invalid_slot');

    const duration = api.previewSchedule(
        { title: 'Read', source: 'task', sourceId: 'task-1' },
        { date: '2026-02-28', start: '10:00', durationMinutes: 'not-a-number' }
    );
    assert.equal(duration.ok, true);
    assert.equal(duration.end, '11:00');
});

test('stable source IDs update a linked block instead of creating duplicates', async () => {
    const rows = setup();
    const first = await api.scheduleItemAt(
        { title: 'Stale title', source: 'homework', sourceId: 'hw-1' },
        { date: '2026-07-18', start: '16:00', durationMinutes: 45 }
    );
    assert.equal(first.ok, true);
    assert.equal(first.operation, 'create');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Stale title');
    assert.equal(rows[0].sourceKey, 'homework:hw-1');
    assert.equal(rows[0].homeworkId, 'hw-1');
    assert.equal(rows[0].assignmentId, 'hw-1');
    assert.equal(rows[0].courseId, 'english');
    assert.equal(rows[0].priority, 'high');
    assert.equal(rows[0].dueAt, '2026-07-20');
    assert.equal(rows[0].effortMinutes, 90);

    rows[0].unknownCompatibilityField = { keep: true };
    const second = await api.scheduleItemAt(
        { title: 'Canonical essay', source: 'homework', sourceId: 'hw-1' },
        { date: '2026-07-19', start: '17:00', durationMinutes: 60 }
    );
    assert.equal(second.ok, true);
    assert.equal(second.operation, 'update');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].date, '2026-07-19');
    assert.equal(rows[0].start, '17:00');
    assert.deepEqual(rows[0].unknownCompatibilityField, { keep: true });
});

test('persistence rejection restores the exact pre-change block array', async () => {
    const initial = [{ id: 'keep', date: '2026-07-15', start: '09:00', end: '10:00', name: 'Keep', custom: 7 }];
    const rows = setup(initial, async () => { throw new Error('disk unavailable'); });
    const result = await api.scheduleItemAt(
        { title: 'Unsafe create', source: 'task', sourceId: 'task-2' },
        { date: '2026-07-15', start: '11:00', durationMinutes: 30 }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 'persistence_failed');
    assert.deepEqual(rows, initial);
});

test('moving an existing block checks conflicts before mutation', async () => {
    const initial = [
        { id: 'move', date: '2026-07-16', start: '08:00', end: '09:00', name: 'Move me' },
        { id: 'busy', date: '2026-07-16', start: '10:00', end: '11:00', name: 'Busy' }
    ];
    const rows = setup(initial);
    const result = await api.rescheduleBlock('move', '2026-07-16', 10 * 60);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'conflict');
    assert.deepEqual(rows, initial);
});

test('undo restores the grouped prior schedule and persists it', async () => {
    let flushes = 0;
    const rows = setup([], async () => { flushes += 1; });
    const result = await api.scheduleItemAt(
        { title: 'Review', source: 'review', sourceId: 'deck-1' },
        { date: '2026-07-17', start: '13:00', durationMinutes: 30 }
    );
    assert.equal(result.ok, true);
    assert.equal(rows.length, 1);
    const undone = await api.undoLastSchedule();
    assert.equal(undone.ok, true);
    assert.deepEqual(rows, []);
    assert.equal(flushes, 2);
});
