#!/usr/bin/env node
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrations = require(resolve(repoRoot, 'src/core/migrations.js'));
const fixture = JSON.parse(readFileSync(resolve(repoRoot, 'tests/fixtures/workspace-v1.json'), 'utf8'));
const original = JSON.stringify(fixture);
const result = migrations.migrateWorkspace(fixture, { targetVersion: 2 });
const failures = [];

if (JSON.stringify(fixture) !== original) failures.push('migration mutated the source fixture');
if (result.workspace.version !== 2) failures.push('v1 fixture did not reach schema version 2');
if (result.applied.join(',') !== 'v1->v2') failures.push('v1->v2 migration was not recorded');
if (!result.workspace.streaks || result.workspace.streaks.taskStreaks['legacy-task-1'] !== 3) failures.push('legacy streak state was not migrated');
if (!result.workspace.pluginOwnedFutureField || result.workspace.pluginOwnedFutureField.preserve !== true) failures.push('unknown fields were not preserved');
if (!result.workspace.pages || result.workspace.pages[0].id !== 'legacy-page-1') failures.push('workspace content was not preserved');

const alreadyCurrent = migrations.migrateWorkspace(result.workspace, { targetVersion: 2 });
if (alreadyCurrent.applied.length !== 0) failures.push('current workspace should not migrate twice');

const future = migrations.migrateWorkspace({ version: 9, custom: true }, { targetVersion: 2 });
if (!future.futureVersion || future.workspace.version !== 9 || future.workspace.custom !== true) failures.push('future-version workspace was not preserved');

if (failures.length) {
  console.error('MIGRATION CHECK FAILED:');
  failures.forEach((failure) => console.error(' - ' + failure));
  process.exit(1);
}

console.log('Migration registry check passed (v1 -> v2, idempotence, future-version preservation).');
