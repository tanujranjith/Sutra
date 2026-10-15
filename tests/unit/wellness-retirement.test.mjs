import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const require = createRequire(import.meta.url);
const appSource = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const privacy = require('../../src/features/assistant/assistant-permissions.js');
const entityRegistry = require('../../src/domain/workspace-entity-registry.js');
const entityAdapters = require('../../src/features/workspace/workspace-entity-adapters.js');

function compileLifeWorkspaceNormalizer() {
  const declaration = extractFunction(appSource, 'normalizeLifeWorkspace');
  const cloneDeclaration = extractFunction(appSource, 'cloneSerializable');
  assert.ok(declaration, 'could not extract normalizeLifeWorkspace');
  assert.ok(cloneDeclaration, 'could not extract cloneSerializable');
  const cloneSerializable = new Function(`${cloneDeclaration.body}; return cloneSerializable;`)();
  const defaults = () => ({
    onboardingSeeded: false,
    goals: [], habits: [], habitCompletions: {}, habitExcused: {}, skills: [],
    fitness: [], calories: [], books: [], spending: [], spendingBudgets: {},
    recurringExpenses: [], journals: [], sleepTracker: { entries: [] },
    wellness: { checkIns: [], journalEntries: [], breathing: {} }
  });
  return new Function(
    'getDefaultLifeWorkspace', 'createLifeGoalRow', 'createLifeHabitRow',
    'normalizeLifeSpendingBudgets', 'createLifeRecurringExpense', 'createLifeSkillRow',
    'cloneSerializable', 'createLifeBookRow', 'createLifeSpendingRow',
    `${declaration.body}; return normalizeLifeWorkspace;`
  )(
    defaults,
    row => row,
    row => row,
    value => value && typeof value === 'object' ? value : {},
    row => row,
    row => row,
    cloneSerializable,
    row => row,
    row => row
  );
}

test('life workspace normalization preserves retired records and unknown legacy fields opaquely', () => {
  const normalizeLifeWorkspace = compileLifeWorkspaceNormalizer();
  const legacyRecords = {
    fitness: [{ id: 'old-run', durationMinutes: 24, vendorExtension: { zone: 3 } }],
    calories: { entries: [{ date: '2025-04-02', total: 1870 }], schemaVersion: 4 },
    journals: [{ id: 'old-journal', mood: 'low', stress: 8, body: 'legacy text' }],
    sleepTracker: { entries: [{ date: '2025-04-02', totalSleepMinutes: 360 }], importMarker: 'legacy-sleep-v2' },
    wellness: {
      checkIns: [{ id: 'old-checkin', mood: 'low', stress: 9, futureField: { value: 1 } }],
      journalEntries: [{ id: 'old-wellness-journal', prompt: 'legacy prompt', body: 'private legacy entry' }],
      breathing: { preferredPattern: 'legacy-pattern', vendorField: true },
      vendorExtension: { untouched: ['future', 'fields'] }
    },
    unknownLifeField: { version: 'future-v4', nested: [{ opaque: true }] }
  };
  const normalized = normalizeLifeWorkspace({ onboardingSeeded: false, ...legacyRecords });
  const portableSnapshot = JSON.parse(JSON.stringify({ lifeWorkspace: normalized })).lifeWorkspace;

  for (const [field, expected] of Object.entries(legacyRecords)) {
    assert.deepEqual(normalized[field], expected, `${field} should remain unchanged during normalization`);
    assert.deepEqual(portableSnapshot[field], expected, `${field} should remain portable in a JSON workspace snapshot`);
  }
});

test('legacy allowWellness=true cannot restore Assistant access to retired health fields', () => {
  const healthFields = [
    'wellness', 'wellnessTrends', 'sleep', 'mood', 'stress', 'fitness', 'calories',
    'journals', 'sleepTracker', 'checkIns', 'journalEntries', 'latestCheckIn'
  ];
  const legacyPermissions = {
    mode: 'read_only', areas: { life: 'approved' }, allowWellness: true,
    allowFinancial: false, allowPrivateDocuments: false
  };
  privacy.configure({ getPermissions: () => legacyPermissions });

  try {
    assert.equal(privacy.getPermissions().allowWellness, false, 'legacy approval must normalize to a denial');
    const filtered = privacy.filterContext({
      view: 'life',
      life: {
        id: 'legacy-life-workspace',
        goals: [{ id: 'goal-1', title: 'Finish semester' }],
        wellness: { checkIns: [{ mood: 'sentinel-mood', stress: 9 }] },
        sleepTracker: { entries: [{ totalSleepMinutes: 300 }] },
        fitness: [{ note: 'legacy fitness record' }],
        calories: [{ total: 1900 }],
        journals: [{ body: 'legacy journal text' }]
      },
      wellness: { mood: 'sentinel-top-level-mood' },
      sleep: [{ id: 'sleep-1' }],
      mood: 'sentinel-mood-header',
      stress: 9,
      fitness: [{ id: 'fitness-1' }],
      calories: [{ total: 1900 }],
      journals: [{ body: 'legacy journal text' }],
      sleepTracker: { entries: [{ totalSleepMinutes: 300 }] },
      checkIns: [{ mood: 'sentinel-checkin' }],
      journalEntries: [{ body: 'legacy entry' }],
      latestCheckIn: { mood: 'sentinel-latest' }
    });

    assert.deepEqual(filtered.life.goals, [{ id: 'goal-1', title: 'Finish semester' }]);
    assert.equal(filtered.life.wellness, undefined);
    for (const field of healthFields) {
      assert.equal(Object.prototype.hasOwnProperty.call(filtered, field), false, `${field} must be absent from the Assistant context`);
    }
    assert.ok(filtered.accessReport.excludedSensitiveAreas.includes('wellness'));
    assert.doesNotMatch(JSON.stringify(filtered), /sentinel-|legacy fitness record|legacy journal text/);
  } finally {
    privacy.configure(null);
  }
});

test('workspace entity adapters do not index legacy wellness, fitness, calorie, sleep, or journal records', () => {
  const previousFlowAtelier = globalThis.flowAtelier;
  const sentinels = [
    'LEGACY_MOOD_SENTINEL', 'LEGACY_FITNESS_SENTINEL', 'LEGACY_CALORIE_SENTINEL',
    'LEGACY_SLEEP_SENTINEL', 'LEGACY_JOURNAL_SENTINEL'
  ];
  globalThis.flowAtelier = {
    getWorkspaceEntitySources: () => ({
      lifeWorkspace: {
        goals: [{ id: 'keep-goal', title: 'Finish the chemistry project' }],
        wellness: { checkIns: [{ id: 'old-checkin', title: sentinels[0], mood: sentinels[0] }] },
        fitness: [{ id: 'old-fitness', title: sentinels[1] }],
        calories: [{ id: 'old-calories', title: sentinels[2] }],
        sleepTracker: { entries: [{ id: 'old-sleep', title: sentinels[3] }] },
        journals: [{ id: 'old-journal', title: sentinels[4] }]
      }
    })
  };

  try {
    const registry = entityRegistry.createWorkspaceEntityRegistry();
    entityAdapters.createAdapterDefinitions().forEach(definition => registry.registerAdapter(definition));
    const entities = registry.collectSearchable();
    const serialized = JSON.stringify(entities);

    assert.ok(entities.some(entity => entity.key === 'life_record:goals:keep-goal'), 'ordinary Life goals remain searchable');
    for (const sentinel of sentinels) {
      assert.ok(!serialized.includes(sentinel), `${sentinel} must not enter the workspace entity index`);
    }
    for (const id of ['old-checkin', 'old-fitness', 'old-calories', 'old-sleep', 'old-journal']) {
      assert.ok(!entities.some(entity => entity.key.includes(id)), `${id} must not produce an indexed record`);
    }
  } finally {
    if (previousFlowAtelier === undefined) delete globalThis.flowAtelier;
    else globalThis.flowAtelier = previousFlowAtelier;
  }
});

test('retired widget configurations cannot bypass Assistant exclusion inside a custom tab', () => {
  privacy.configure({ getPermissions: () => ({ mode: 'read_only', areas: {}, allowWellness: true }) });
  try {
    const result = privacy.filterContext({ view: 'custom-qa', customTab: { name: 'QA', widgets: [
      { type: 'gratitude', config: { entries: { today: 'RETIRED_WIDGET_SENTINEL' } } },
      { type: 'scratchpad', config: { text: 'Normal study notes' } }
    ] } });
    assert.doesNotMatch(JSON.stringify(result), /RETIRED_WIDGET_SENTINEL/);
    assert.deepEqual(result.customTab.widgets, [{ type: 'scratchpad', config: { text: 'Normal study notes' } }]);
  } finally { privacy.configure(null); }
});
