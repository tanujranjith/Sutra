import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const shell = readFileSync(new URL('../../Sutra.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

test('Cloud leads with encrypted multi-device Sync while preserving backup distinction', () => {
  assert.match(shell, /id="sutraCloudSyncFirstTitle">Use Sutra on another device/);
  assert.match(shell, /Sign in by email, set a Sync passphrase/);
  assert.match(shell, /Sync replicates changes; backups remain separate recovery points/);
  assert.match(shell, /id="sutraCloudOpenSyncBtn" onclick="window\.openSutraSyncModal\(\)"/);
  assert.match(shell, /<h4 class="sutra-cloud-h">Backup destinations<\/h4>/);
});

test('opening the Cloud sheet never stacks it above the Sync sheet', () => {
  const open = extractFunction(app, 'openSutraCloudModal');
  assert.ok(open, 'openSutraCloudModal exists');
  const siblingCloseAt = open.body.indexOf('closeSutraSyncModal()');
  const activateAt = open.body.indexOf("modal.classList.add('active')");
  assert.ok(siblingCloseAt !== -1 && activateAt !== -1,
    'openSutraCloudModal must close the Sync sheet before activating');
  assert.ok(siblingCloseAt < activateAt,
    'the sibling Sync sheet must close before the Cloud sheet activates');
});

test('opening the Sync sheet never stacks it above the Cloud sheet', () => {
  const open = extractFunction(app, 'openSutraSyncModal');
  assert.ok(open, 'openSutraSyncModal exists');
  const siblingCloseAt = open.body.indexOf('closeSutraCloudModal()');
  const activateAt = open.body.indexOf("modal.classList.add('active')");
  assert.ok(siblingCloseAt !== -1 && activateAt !== -1,
    'openSutraSyncModal must close the Cloud sheet before activating');
  assert.ok(siblingCloseAt < activateAt,
    'the sibling Cloud sheet must close before the Sync sheet activates');
  // Focus handling stays intact alongside the sibling close.
  assert.match(open.body, /sutraSyncRuntime\.lastFocus = document\.activeElement/);
});

test('closing either sheet releases the scroll lock only when nothing else is open', () => {
  for (const name of ['closeSutraCloudModal', 'closeSutraSyncModal']) {
    const close = extractFunction(app, name);
    assert.ok(close, `${name} exists`);
    assert.match(close.body, /modal\.classList\.remove\('active'\)/);
    const guard = close.body.indexOf("document.querySelector('.modal.active')");
    const release = close.body.indexOf("document.body.classList.remove('modal-open')");
    assert.ok(guard !== -1 && release !== -1,
      `${name} must condition the scroll-lock release on no other active modal`);
    assert.ok(guard < release,
      `${name} must check for another active modal before releasing the lock`);
  }
});
