import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadDashboard() {
  const source = readFileSync(new URL('../../src/features/workspace/today-dashboard.js', import.meta.url), 'utf8');
  const context = { window: {}, console, JSON, Object, Array, String, Number };
  vm.runInNewContext(source, context, { filename: 'today-dashboard.js' });
  return context.window.SutraTodayDashboard;
}

test('Today dashboard ships a calm, complete, deterministic default', () => {
  const dashboard = loadDashboard();
  const value = dashboard.getDefaultPreferences();
  assert.equal(value.version, 1);
  assert.equal(value.preset, 'calm');
  assert.equal(value.order.length, dashboard.WIDGETS.length);
  assert.equal(new Set(value.order).size, dashboard.WIDGETS.length);
  assert.ok(value.hidden.includes('momentum'));
  assert.ok(!value.hidden.includes('next-up'));
});

test('Today dashboard normalization removes unknowns, deduplicates, and appends new widgets', () => {
  const dashboard = loadDashboard();
  const value = dashboard.normalizePreferences({
    version: 99,
    preset: 'custom',
    order: ['review', 'unknown', 'review', 'next-up'],
    hidden: ['unknown', 'tasks', 'tasks'],
    sizes: { review: 'wide', tasks: 'enormous' }
  });
  assert.equal(value.version, 1);
  assert.equal(value.preset, 'custom');
  assert.deepEqual(Array.from(value.order.slice(0, 2)), ['review', 'next-up']);
  assert.equal(value.order.length, dashboard.WIDGETS.length);
  assert.deepEqual(Array.from(value.hidden), ['tasks']);
  assert.equal(value.sizes.review, 'wide');
  assert.equal(value.sizes.tasks, 'compact');
});

test('Today dashboard presets are independent snapshots', () => {
  const dashboard = loadDashboard();
  const first = dashboard.getPresetPreferences('study');
  first.order.shift();
  first.hidden.push('next-up');
  const second = dashboard.getPresetPreferences('study');
  assert.equal(second.order[0], 'next-up');
  assert.ok(!second.hidden.includes('next-up'));
});
