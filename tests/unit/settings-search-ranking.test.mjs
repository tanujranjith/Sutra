import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const appSource = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const rankSettingsSearchCandidates = new Function(
  extractFunction(appSource, 'rankSettingsSearchCandidates').body + ';return rankSettingsSearchCandidates;'
)();

const entries = [
  {
    name: 'Theme', description: 'Choose a color theme. Theme changes apply immediately.',
    category: 'Appearance', group: '', path: '', control: 'Choose theme'
  },
  {
    name: 'Font size', description: 'Adjust the size of text across the workspace.',
    category: 'Appearance', group: 'Accessibility', path: 'appearance.fontSize', control: 'Small Medium Large'
  },
  {
    name: 'Icon style', description: 'Choose how workspace icons appear.',
    category: 'Appearance', group: 'Appearance', path: 'appearance.iconStyle', control: 'Classic Modern'
  },
  {
    name: 'Autosave interval', description: 'Time between automatic saves while you type.',
    category: 'Editor', group: 'Writing', path: 'editor.autosaveMs', control: '5 minutes'
  },
  {
    name: 'Default view', description: 'Calendar layout shown on open.',
    category: 'Calendar', group: 'View defaults', path: 'calendar.defaultView', control: 'Planner Week Month'
  },
  {
    name: 'Show seconds in clock', description: 'Tick the seconds in the live clock.',
    category: 'Calendar', group: 'Display', path: 'calendar.showSeconds', control: 'On Off'
  },
  {
    name: 'Encrypted Workspace Backup', description: 'Save a password-encrypted copy of this workspace.',
    category: 'Data & backups', group: 'Backups', path: '', control: 'Export .sutra'
  },
  {
    name: 'Notifications', description: 'Choose which reminders and alerts appear.',
    category: 'Notifications', group: 'Reminders', path: 'notifications.enabled', control: 'On Off'
  }
];

test('Settings search ranks everyday intent, spelling tolerance, and field-level context', () => {
  assert.equal(rankSettingsSearchCandidates('turn on dark mode', entries)[0]?.candidate.name, 'Theme');
  assert.equal(rankSettingsSearchCandidates('save automatically', entries)[0]?.candidate.name, 'Autosave interval');
  assert.equal(rankSettingsSearchCandidates('calender', entries)[0]?.candidate.category, 'Calendar');
  assert.equal(rankSettingsSearchCandidates('thmee', entries)[0]?.candidate.name, 'Theme');
  assert.equal(rankSettingsSearchCandidates('backup password', entries)[0]?.candidate.name, 'Encrypted Workspace Backup');
  assert.equal(rankSettingsSearchCandidates('alerts', entries)[0]?.candidate.name, 'Notifications');
  assert.equal(rankSettingsSearchCandidates('fonts', entries)[0]?.candidate.name, 'Font size');
  assert.equal(rankSettingsSearchCandidates('icons', entries)[0]?.candidate.name, 'Icon style');
});

test('Settings search returns related local matches but rejects unrelated text', () => {
  const related = rankSettingsSearchCandidates('calendar confusing', entries);
  assert.ok(related.length > 0);
  assert.ok(related.every(result => result.candidate.category === 'Calendar'));
  assert.deepEqual(rankSettingsSearchCandidates('zzzz-no-setting', entries), []);
  assert.deepEqual(rankSettingsSearchCandidates('thnnnn', entries), []);
});

test('exact tokens suppress unrelated typo recovery while related results remain', () => {
  const candidates = [
    { name: 'Glass card style', description: 'Choose a glass appearance.', category: 'Appearance' },
    { name: 'Blur', description: 'Control background blur.', category: 'Appearance' },
    { name: 'Hardest classes', description: 'Review demanding class work.', category: 'Academics' }
  ];
  const results = rankSettingsSearchCandidates('glass blur', candidates);
  assert.ok(results.some(result => result.candidate.name === 'Glass card style'));
  assert.ok(results.some(result => result.candidate.name === 'Blur'));
  assert.ok(results.every(result => result.candidate.name !== 'Hardest classes'));
});

test('expanded aliases do not gain unrelated fuzzy matches', () => {
  const candidates = entries.concat({
    name: 'Hardest classes', description: 'Give these more study time.',
    category: 'Assistant', group: '', path: '', control: ''
  });
  const matches = rankSettingsSearchCandidates('turn on dark mode', candidates);
  assert.equal(matches[0]?.candidate.name, 'Theme');
  assert.ok(matches.every(result => result.candidate.name !== 'Hardest classes'));
});

test('backup password intent prioritizes the encrypted export action', () => {
  const matches = rankSettingsSearchCandidates('backup password', [
    { name: 'Include Assistant chats in encrypted .sutra backups', category: 'Assistant' },
    { name: 'Encrypted Workspace Backup (.sutra)', category: 'Data & Backup' }
  ]);
  assert.equal(matches[0]?.candidate.name, 'Encrypted Workspace Backup (.sutra)');
});
