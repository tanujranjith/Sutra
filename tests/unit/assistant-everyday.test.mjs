import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const require = createRequire(import.meta.url);
const privacy = require('../../src/features/assistant/assistant-permissions.js');
const source = readFileSync(new URL('../../src/features/assistant/flow-assistant.js', import.meta.url), 'utf8');
const getPref = (_path, fallback) => fallback;
const compile = (name, names = [], values = []) => new Function(...names,
  `${extractFunction(source, name).body}; return ${name};`)(...values);
const normalizeMode = compile('normalizeChatMemoryMode', ['getPref'], [getPref]);
const normalizeDepth = compile('normalizeChatMemoryDepth', ['CHAT_MEMORY_DEPTH_OPTIONS'], [[3, 5, 10, 15, 25]]);
const persistAssistantPermissionMutation = compile('persistAssistantPermissionMutation');
const history = compile('buildConversationMessages',
  ['normalizeChatMemoryMode', 'normalizeChatMemoryDepth', 'getChatMemoryMode', 'getChatMemoryDepth'],
  [normalizeMode, normalizeDepth, () => 'stateful', () => 5]);

test('Everyday grants reviewed actions, preserving explicit blocks and unknown state', () => {
  const original = { mode: 'off', areas: { notes: 'denied', planning: 'approved' }, custom: { keep: true } };
  const before = JSON.stringify(original);
  const plan = privacy.presetPlan('everyday', original);
  assert.equal(JSON.stringify(original), before);
  assert.equal(plan.permissions.areas.notes, 'denied');
  assert.deepEqual(plan.permissions.custom, { keep: true });
  assert.equal(plan.preferences.contextDepth, 'workspace');
  assert.equal(plan.preferences.chatMemoryMode, 'stateful');
  assert.equal(plan.preferences.chatMemoryDepth, 5);
  privacy.configure({ getPermissions: () => plan.permissions });
  assert.equal(privacy.canRead('planning'), true);
  assert.equal(privacy.canRead('notes'), false);
  assert.ok(!privacy.getActionPermissions().includes('workspace.write'));
  assert.ok(privacy.getActionPermissions({ approved: true }).includes('workspace.write'));
  assert.ok(!privacy.getActionPermissions({ approved: true }).includes('workspace.delete'));
  assert.ok(!privacy.getActionPermissions({ approved: true }).includes('plugin.execute'));
  assert.equal(privacy.identifyPreset(plan.permissions, plan.preferences), 'everyday');
  assert.equal(privacy.identifyPreset(plan.permissions, { ...plan.preferences, requireApprovalForActions: false }), 'advanced');
});

test('Private excludes workspace and sensitive content without erasing blocks or saved data', () => {
  const plan = privacy.presetPlan('private', { mode: 'approved_actions', areas: { notes: 'denied' }, allowFinancial: true, allowPrivateDocuments: true });
  privacy.configure({ getPermissions: () => plan.permissions });
  assert.equal(privacy.canRead('planning'), false);
  assert.equal(plan.permissions.allowFinancial, false);
  assert.equal(plan.permissions.allowPrivateDocuments, false);
  assert.equal(plan.permissions.areas.notes, 'denied');
  assert.equal(plan.preferences.chatMemoryMode, 'stateless');
  assert.equal(privacy.identifyPreset(plan.permissions, plan.preferences), 'private');
  assert.throws(() => privacy.presetPlan('unrestricted', {}), /Unknown/);
});

test('Everyday retains sensitive-content opt-ins but never creates them', () => {
  const ordinary = privacy.presetPlan('everyday', {}).permissions;
  assert.equal(ordinary.allowLockedNotes, false);
  assert.equal(ordinary.allowFinancial, false);
  assert.equal(ordinary.allowPrivateDocuments, false);
  const existing = privacy.presetPlan('everyday', { allowFinancial: true }).permissions;
  assert.equal(existing.allowFinancial, true);
});

test('permission restrictions apply before the canonical save acknowledgement settles', async () => {
  const permissions = { mode: 'approved_actions', areas: { notes: 'ask' } };
  let finishSave;
  let settled = false;
  const saving = persistAssistantPermissionMutation(() => {
    permissions.mode = 'off';
    permissions.areas.notes = 'denied';
  }, () => new Promise(resolve => { finishSave = resolve; }));
  saving.then(() => { settled = true; });

  assert.equal(permissions.mode, 'off');
  assert.equal(permissions.areas.notes, 'denied');
  assert.equal(settled, false);

  finishSave();
  assert.deepEqual(await saving, { ok: true });
  assert.equal(settled, true);
});

test('failed permission save keeps the selected restriction active for retry', async () => {
  const permissions = { mode: 'approved_actions', areas: { notes: 'ask' } };
  const failure = new Error('readback failed');
  const result = await persistAssistantPermissionMutation(() => {
    permissions.mode = 'off';
    permissions.areas.notes = 'denied';
  }, () => Promise.reject(failure));

  assert.equal(result.ok, false);
  assert.equal(result.phase, 'save');
  assert.equal(result.error, failure);
  assert.equal(permissions.mode, 'off');
  assert.equal(permissions.areas.notes, 'denied');
});

test('conversation recap is bounded, role-preserving, current-chat-only and absent in Stateless', () => {
  const conversation = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn-${i} ` + 'x'.repeat(900) }));
  const result = history(conversation);
  assert.equal(result.length, 9);
  assert.equal(result[0].role, conversation[41].role);
  assert.match(result[0].content, /^\[Earlier message excerpt/);
  assert.ok(result[0].content.length < 250);
  assert.equal(result[4].content, conversation[45].content);
  assert.ok(!JSON.stringify(result).includes('turn-40 '));
  assert.deepEqual(history(conversation, { chatMemoryMode: 'stateless' }), []);
  assert.deepEqual(history([]), []);
  assert.equal(history(conversation.slice(-2)).length, 2);
});
