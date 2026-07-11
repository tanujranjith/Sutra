import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const migrations = require('../../src/core/migrations.js');
const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const NOW = '2026-07-09T12:00:00.000Z';

for (const [name, from, expected] of [
  ['workspace-v1.json', 1, ['v1->v2', 'v2->v3', 'v3->v4']],
  ['workspace-v2.json', 2, ['v2->v3', 'v3->v4']],
  ['workspace-v3.json', 3, ['v3->v4']]
]) {
  test(`${name} migrates sequentially to the current schema`, () => {
    const source = fixture(name);
    const untouched = JSON.stringify(source);
    const result = migrations.migrateWorkspace(source, { now: NOW });
    assert.equal(JSON.stringify(source), untouched);
    assert.equal(result.fromVersion, from);
    assert.equal(result.toVersion, migrations.CURRENT_VERSION);
    assert.deepEqual(result.applied, expected);
    assert.equal(result.workspace.version, migrations.CURRENT_VERSION);
    assert.deepEqual(result.workspace.migrationHistory.map((item) => item.id), expected);
  });
}

test('v2 homework is migrated without dropping current, legacy, or unknown fields', () => {
  const result = migrations.migrateWorkspace(fixture('workspace-v2.json'), { now: NOW }).workspace;
  assert.deepEqual(result.homeworkWorkspace.courses.map((item) => item.id), ['bio', 'chem']);
  assert.deepEqual(result.homeworkWorkspace.tasks.map((item) => item.id), ['read', 'lab']);
  assert.equal(result.compatibility.legacyHomeworkSnapshot.tasks[0].id, 'lab');
  assert.equal(result.pluginOwnedFutureField.preserve, true);
  assert.equal('legacyTasks' in result.homeworkWorkspace, false);
});

test('invalid collections are quarantined and relationship defects are reported', () => {
  const result = migrations.migrateWorkspace(fixture('workspace-v3.json'), { now: NOW });
  assert.deepEqual(result.workspace.pages, []);
  assert.equal(result.workspace.migrationDiagnostics.quarantine[0].path, '$.pages');
  assert.equal(result.workspace.pluginData.unknownSafeField, 'keep');
  assert.ok(result.validation.issues.some((issue) => issue.code === 'missing-course-reference'));
});

test('destructive migrations announce backup requirements before execution', () => {
  const source = fixture('workspace-v2.json');
  let backup = null;
  const result = migrations.migrateWorkspace(source, {
    now: NOW,
    onBeforeDestructive(workspace, plan) { backup = { workspace, plan }; }
  });
  assert.ok(backup);
  assert.equal(backup.workspace.version, 2);
  assert.ok(backup.plan.some((step) => step.destructive));
  assert.equal(result.workspace.version, 4);
});

test('current migrations are idempotent and future workspaces are preserved', () => {
  const current = migrations.migrateWorkspace(fixture('workspace-v1.json'), { now: NOW }).workspace;
  const repeated = migrations.migrateWorkspace(current, { now: NOW });
  assert.deepEqual(repeated.applied, []);
  assert.deepEqual(repeated.workspace, current);
  const future = migrations.migrateWorkspace({ version: 99, custom: true });
  assert.equal(future.futureVersion, true);
  assert.equal(future.workspace.custom, true);
});

test('recursive and non-serializable imports fail validation before migration', () => {
  const recursive = { version: 1 };
  recursive.self = recursive;
  assert.throws(() => migrations.migrateWorkspace(recursive), (error) => {
    assert.equal(error.name, 'WorkspaceValidationError');
    assert.ok(error.issues.some((issue) => issue.code === 'recursive-object'));
    return true;
  });
  assert.throws(() => migrations.migrateWorkspace({ version: 1, bad: () => {} }), /pre-migration validation/);
});
