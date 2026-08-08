import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractBalancedBlock } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/features/workspace/today-dashboard.js', import.meta.url), 'utf8');
const appShell = readFileSync(new URL('../../Sutra.html', import.meta.url), 'utf8');

function widgetIds() {
  const widgetsStart = source.indexOf('var WIDGETS = [');
  const widgetsEnd = source.indexOf('];', widgetsStart);
  return [...source.slice(widgetsStart, widgetsEnd).matchAll(/id: '([^']+)'/g)].map(match => match[1]);
}

function loadPresets() {
  const block = extractBalancedBlock(source, 'var PRESETS = {');
  assert.ok(block, 'the PRESETS literal is present');
  const open = block.body.indexOf('{');
  return new Function('WIDGET_IDS', `return (${block.body.slice(open)});`)(widgetIds());
}

test('Today offers a calm preset that hides secondary signals by default', () => {
  const presets = loadPresets();
  assert.equal(presets.calm.label, 'Calm');
  assert.equal(presets.calm.description, 'The daily loop first, with secondary signals tucked away.');
  assert.deepEqual(presets.calm.hidden, ['tonight', 'habits', 'tracker', 'life-signals', 'academic-planner', 'momentum']);
  assert.deepEqual(presets.calm.sizes, { 'next-up': 'standard', 'upcoming-radar': 'standard', 'priorities': 'wide' });
});

test('the calm preset only hides widgets that actually exist', () => {
  const presets = loadPresets();
  const widgetsStart = source.indexOf('var WIDGETS = [');
  const widgetsEnd = source.indexOf('];', widgetsStart);
  const widgetsRegion = source.slice(widgetsStart, widgetsEnd);
  for (const id of presets.calm.hidden) {
    assert.ok(widgetsRegion.includes(`id: '${id}'`), `hidden widget '${id}' must exist in WIDGETS`);
  }
});

test('the daily-loop hero and backup confidence widgets are part of the catalog', () => {
  const widgetsStart = source.indexOf('var WIDGETS = [');
  const widgetsEnd = source.indexOf('];', widgetsStart);
  const widgetsRegion = source.slice(widgetsStart, widgetsEnd);
  assert.match(widgetsRegion, /id: 'next-up', label: 'Next up'/);
  assert.match(widgetsRegion, /id: 'backup', label: 'Save & backup'/);
  assert.ok(widgetsRegion.includes('Your single best next action and deadline counts.'), 'Next up is the single best next action');
  assert.ok(widgetsRegion.includes('Local save and backup confidence.'), 'backup confidence is a visible widget');
  const presets = loadPresets();
  assert.ok(!presets.calm.hidden.includes('next-up'), 'Next up is never hidden in calm mode');
  assert.ok(!presets.calm.hidden.includes('backup'), 'backup confidence is never hidden in calm mode');
});

test('Today dashboard label uses text rather than an unsupported icon glyph', () => {
  assert.match(appShell, /<span class="today-dashboard-toolbar-label">Dashboard<\/span>/);
  assert.doesNotMatch(appShell, /fa-table-cells-large/);
});
