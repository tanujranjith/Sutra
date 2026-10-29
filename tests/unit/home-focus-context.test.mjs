import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractBalancedBlock, extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

function makeFocusRuntime(tasks, initialSession = null) {
  const noop = () => {};
  const window = { SutraActivation: { record: noop } };
  const declaration = extractFunction(source, 'startFocusSession');
  assert.ok(declaration, 'canonical Focus Session starter exists');
  return new Function(
    'tasks', 'initialSession', 'window', 'FS_DEFAULT_DURATION_SECONDS', '_fsGenerateId', '_fsTimerCommand',
    '_fsSyncFromCanonicalTimer', '_fsOpenOverlay', '_fsPersistSession', '_fsApplyTimerSnapshot',
    '_fsUpdateLaunchBtnLabel', 'getTaskEstimatedMinutes',
    `
      let _fsSession = initialSession;
      const FS_DEFAULT_AMBIENT = 'none';
      ${declaration.body}
      return { start: startFocusSession, getSession: () => _fsSession };
    `
  )(
    tasks, initialSession, window, 1500, () => 'focus-session-test',
    (command, value) => command === 'snapshot' ? { durationSeconds: 1500 } : { durationSeconds: value || 1500 },
    noop, noop, noop, noop, noop, () => 0
  );
}

function runActualBlock(marker, dependencies, suffix = '') {
  const block = extractBalancedBlock(source, marker);
  assert.ok(block, `actual app block exists: ${marker}`);
  return new Function(...Object.keys(dependencies), block.body + suffix)(...Object.values(dependencies));
}

const homeworkId = 'assignment-42';
const projectedHomework = {
  id: `hw_v2_${homeworkId}`,
  title: 'Finish the chemistry lab',
  origin: 'homework',
  homeworkSourceId: homeworkId
};

test('Home Focus next resolves a Homework source ID through its canonical task projection', () => {
  const runtime = makeFocusRuntime([projectedHomework]);
  const attrs = {
    'data-donow-focus': homeworkId,
    'data-donow-source': 'homework',
    'data-donow-title': projectedHomework.title
  };
  runActualBlock("focusBtn.addEventListener('click', () => {", {
    focusBtn: {
      getAttribute: key => attrs[key] || '',
      addEventListener: (_event, callback) => callback()
    },
    startFocusSession: runtime.start,
    window: { SutraReportError() {} }
  }, ');');
  assert.equal(runtime.getSession().taskId, projectedHomework.id);
  assert.equal(runtime.getSession().taskTitle, projectedHomework.title);
});

test('mobile Right Now Focus resolves a Homework source ID through its canonical task projection', () => {
  const runtime = makeFocusRuntime([projectedHomework]);
  const attrs = {
    'data-rn-id': homeworkId,
    'data-rn-source': 'homework',
    'data-rn-title': projectedHomework.title,
    'data-rn-focus-seconds': '1500'
  };
  runActualBlock("if (action === 'rightnow-start') {", {
    action: 'rightnow-start',
    btn: { getAttribute: key => attrs[key] || '' },
    startFocusSession: runtime.start,
    window: { SutraReportError() {} }
  });
  assert.equal(runtime.getSession().taskId, projectedHomework.id);
  assert.equal(runtime.getSession().taskTitle, projectedHomework.title);
});

test('All Due passes Focus options using the canonical taskId, opts signature', () => {
  const runtime = makeFocusRuntime([]);
  const item = { title: 'Review essay outline', sourceId: homeworkId };
  const focusInbox = new Function(
    'cwFindInboxItem', 'window', 'showToast', 'startFocusSession', 'setActiveView',
    `${extractFunction(source, 'cwFocusInboxItem').body}; return cwFocusInboxItem;`
  )(
    () => item,
    { flowAtelier: { startFocusSession: (taskId, opts) => { runtime.start(taskId, opts); return true; } } },
    () => {}, runtime.start, () => {}
  );

  assert.equal(focusInbox('homework', homeworkId, ''), true);
  assert.equal(runtime.getSession().taskTitle, item.title);
});

test('All Due preserves the task ID for its normalized planner source', () => {
  const task = { id: 'planner-42', title: 'Read chemistry notes' };
  const runtime = makeFocusRuntime([task]);
  const focusInbox = new Function(
    'cwFindInboxItem', 'window', 'showToast', 'startFocusSession', 'setActiveView',
    `${extractFunction(source, 'cwFocusInboxItem').body}; return cwFocusInboxItem;`
  )(
    () => ({ source: 'planner', sourceId: task.id, title: task.title }),
    { flowAtelier: { startFocusSession: (taskId, opts) => { runtime.start(taskId, opts); return true; } } },
    () => {}, runtime.start, () => {}
  );

  assert.equal(focusInbox('planner', task.id, ''), true);
  assert.equal(runtime.getSession().taskId, task.id);
  assert.equal(runtime.getSession().taskTitle, task.title);
});

test('a title-seeded session without a task ID replaces unrelated current context', () => {
  const previous = { id: 'focus-old', taskId: 'old-task', taskTitle: 'Old assignment' };
  const runtime = makeFocusRuntime([], previous);

  runtime.start(null, { title: 'Review essay outline' });

  assert.notEqual(runtime.getSession(), previous);
  assert.equal(runtime.getSession().taskId, null);
  assert.equal(runtime.getSession().taskTitle, 'Review essay outline');
});

test('a bare Focus launch resumes the current session', () => {
  const previous = { id: 'focus-old', taskId: 'old-task', taskTitle: 'Old assignment' };
  const runtime = makeFocusRuntime([], previous);

  runtime.start();

  assert.equal(runtime.getSession(), previous);
});
