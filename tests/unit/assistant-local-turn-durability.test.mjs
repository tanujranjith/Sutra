import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

function localChat(name) {
  const events = [];
  const convo = [];
  const input = { value: '7:30' };
  const noop = () => {};
  let resolveSave, rejectSave;
  const saved = new Promise((resolve, reject) => { resolveSave = resolve; rejectSave = reject; });
  const dependencies = {
    window: { flowAssistant: { handleOutgoing: () => ({ handled: true, message: 'AM or PM?' }) } },
    console: { warn: () => events.push('save-warning') },
    chatInput: input, messagesEl: {}, convo,
    clearChatNotices: noop,
    appendMessage: role => events.push('render:' + role),
    saveConvo: () => events.push('save'),
    flushAppSaveNow: reason => { events.push(reason); return saved; },
    buildAssistantResponseReceipt: () => ({}),
    getCurrentChatProvider: () => { throw new Error('Unexpected provider fallback'); },
    asstCache: { input, shell: { classList: { add: noop } }, msgs: { appendChild: noop } },
    asstInFlight: false,
    asstCloseInputPopups: noop, asstAutosize: noop, asstUpdateSendDisabled: noop,
    asstBuildContextBlock: () => '', asstPendingContext: [], asstClearContext: noop,
    asstBuildMessage: () => ({}), asstScrollToBottom: noop,
    asstRenderAll: () => events.push('render:assistant'),
    asstSendCore: () => events.push('provider')
  };
  const send = new Function(...Object.keys(dependencies),
    'async ' + extractFunction(source, name).body + '; return ' + name + ';')(...Object.values(dependencies));
  return { send, events, convo, resolveSave, rejectSave };
}

for (const name of ['sendChat', 'asstSend']) {
  test(name + ' publishes a local reply only after its confirmed save', async () => {
    const chat = localChat(name);
    const sending = chat.send();
    assert.ok(chat.events.includes('assistant-local-turn'));
    assert.ok(!chat.events.includes('render:assistant'), 'the reply is not a durability acknowledgement yet');
    chat.resolveSave();
    await sending;
    assert.ok(chat.events.includes('render:assistant'));
    assert.deepEqual(chat.convo.map(row => row.content), ['7:30', 'AM or PM?']);
    assert.ok(!chat.events.includes('provider'));
  });

  test(name + ' retains a failed local save without contacting a provider', async () => {
    const chat = localChat(name);
    const sending = chat.send();
    chat.rejectSave(new Error('IndexedDB save failed'));
    await sending;
    assert.ok(chat.events.includes('save-warning'));
    assert.ok(chat.events.includes('render:assistant'));
    assert.deepEqual(chat.convo.map(row => row.content), ['7:30', 'AM or PM?']);
    assert.ok(!chat.events.includes('provider'));
  });
}
