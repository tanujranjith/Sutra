import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/features/assistant/writing-commands.js', import.meta.url), 'utf8');

function createHarness(provider = async () => ({ ok: true, text: 'Edited passage' })) {
  const state = { openOptions: null, providerCalls: [] };
  const window = {
    SutraInlineAIAssist: {
      open(options) {
        state.openOptions = options;
        return Promise.resolve({ opened: true });
      }
    },
    SutraIntelligenceBridge: {
      generateText(options) {
        state.providerCalls.push(options);
        return provider(options);
      }
    }
  };

  vm.runInNewContext(source, { window }, { filename: 'writing-commands.js' });
  return { commands: window.SutraWritingCommands, state };
}

test('parser recognizes only the three explicit writing commands', () => {
  const { commands } = createHarness();
  for (const command of ['grammar', 'spelling', 'rephrase']) {
    const parsed = commands.parse(`/${command}`);
    assert.equal(parsed.command, command);
    assert.equal(parsed.text, '');
  }

  const withText = commands.parse('/Spelling fix these typos');
  assert.equal(withText.command, 'spelling');
  assert.equal(withText.text, 'fix these typos');

  for (const input of ['/ai', '/tone', '/grammarExtra', 'grammar', '/rephraseish']) {
    assert.equal(commands.parse(input), null, `unexpectedly parsed ${input}`);
  }
});

test('whole-note drafts preserve the expected paragraph boundaries', () => {
  const { commands } = createHarness();
  assert.deepEqual(Array.from(commands.splitDraft('First.\n\nSecond.', 2)), ['First.', 'Second.']);
  assert.equal(commands.splitDraft('Merged paragraphs', 2), null);
  assert.deepEqual(Array.from(commands.splitDraft('Line one\nline two', 1)), ['Line one\nline two']);
});

test('whole-note review forwards its visible scope and validates before application without an extra call', async () => {
  const { commands, state } = createHarness();
  const validateDraft = text => commands.splitDraft(text, 2) ? '' : 'Keep two paragraphs';
  await commands.open('grammar', { text: 'First.\n\nSecond.', isCurrent: () => true, scopeLabel: 'Current note: 2 text blocks', validateDraft });
  assert.equal(state.openOptions.contextText, 'First.\n\nSecond.');
  assert.equal(state.openOptions.scopeLabel, 'Current note: 2 text blocks');
  assert.equal(state.openOptions.validateDraft('Merged'), 'Keep two paragraphs');
  assert.match(state.openOptions.instruction, /preserving meaning/);
  assert.equal(state.providerCalls.length, 0);
  await state.openOptions.request({ contextText: state.openOptions.contextText, instruction: state.openOptions.instruction });
  assert.equal(state.providerCalls.length, 1);
  assert.match(state.providerCalls[0].systemPrompt, /Preserve the number and order of paragraphs/);
});

test('opening a writing review does not call the provider or forward ambient workspace data', async () => {
  const { commands, state } = createHarness();
  const openResult = await commands.open('grammar', {
    text: 'Seeded review passage',
    isCurrent: () => true,
    workspaceText: 'WORKSPACE_SECRET_SENTINEL',
    history: 'CHAT_HISTORY_SENTINEL',
    attachments: ['ATTACHMENT_SENTINEL'],
    facts: 'UNRELATED_FACT_SENTINEL'
  });

  assert.deepEqual(openResult, { opened: true });
  assert.equal(state.providerCalls.length, 0);
  assert.equal(state.openOptions.contextText, 'Seeded review passage');
  assert.deepEqual(Object.keys(state.openOptions).sort(), [
    'command', 'contextText', 'instruction', 'isCurrent', 'request', 'sourcePageId', 'title'
  ]);
  assert.equal(state.openOptions.sourcePageId, undefined);
  const forwarded = JSON.stringify({
    command: state.openOptions.command,
    contextText: state.openOptions.contextText,
    instruction: state.openOptions.instruction,
    title: state.openOptions.title
  });
  for (const sentinel of [
    'WORKSPACE_SECRET_SENTINEL', 'CHAT_HISTORY_SENTINEL',
    'ATTACHMENT_SENTINEL', 'UNRELATED_FACT_SENTINEL'
  ]) assert.equal(forwarded.includes(sentinel), false);
});

test('request rejects blank, oversized, and stale source before calling the provider', async () => {
  const { commands, state } = createHarness();
  await commands.open('spelling', { isCurrent: () => true });
  const request = state.openOptions.request;

  await assert.rejects(
    request({ contextText: '  \n\t  ' }),
    error => error.message === 'Enter or select the text you want to change.'
  );
  await assert.rejects(
    request({ contextText: 'x'.repeat(8001) }),
    error => error.message === 'Use a passage of up to 8,000 characters.'
  );
  assert.equal(state.providerCalls.length, 0);

  const stale = createHarness();
  await stale.commands.open('rephrase', { isCurrent: () => false });
  await assert.rejects(
    stale.state.openOptions.request({ contextText: 'A once-current passage.' }),
    error => error.message === 'The original text changed. Open the command again.'
  );
  assert.equal(stale.state.providerCalls.length, 0);
});

test('valid request sends only the chosen operation, instruction, and passage with its abort signal', async () => {
  const { commands, state } = createHarness();
  const passage = 'Only this selected paragraph should be edited.';
  const signal = { abortSignalSentinel: true };
  await commands.open('rephrase', {
    text: 'SEED_CONTEXT_SENTINEL',
    isCurrent: () => true,
    workspaceText: 'WORKSPACE_SECRET_SENTINEL',
    history: 'CHAT_HISTORY_SENTINEL',
    attachments: ['ATTACHMENT_SENTINEL'],
    facts: 'UNRELATED_FACT_SENTINEL'
  });

  const result = await state.openOptions.request({
    contextText: passage,
    instruction: state.openOptions.instruction,
    signal,
    workspace: 'REQUEST_WORKSPACE_SENTINEL',
    history: 'REQUEST_HISTORY_SENTINEL',
    attachments: ['REQUEST_ATTACHMENT_SENTINEL'],
    facts: 'REQUEST_FACT_SENTINEL'
  });

  assert.equal(result, 'Edited passage');
  assert.equal(state.providerCalls.length, 1);
  const providerArgs = state.providerCalls[0];
  assert.deepEqual(Object.keys(providerArgs).sort(), ['maxTokens', 'signal', 'systemPrompt', 'userText']);
  assert.equal(providerArgs.signal, signal);
  const userPayload = JSON.parse(providerArgs.userText);
  assert.deepEqual(Object.keys(userPayload).sort(), ['instruction', 'operation', 'passage']);
  assert.deepEqual(userPayload, {
    operation: 'rephrase',
    instruction: state.openOptions.instruction,
    passage
  });
  const transmitted = JSON.stringify(providerArgs);
  for (const sentinel of [
    'SEED_CONTEXT_SENTINEL', 'WORKSPACE_SECRET_SENTINEL', 'CHAT_HISTORY_SENTINEL',
    'ATTACHMENT_SENTINEL', 'UNRELATED_FACT_SENTINEL', 'REQUEST_WORKSPACE_SENTINEL',
    'REQUEST_HISTORY_SENTINEL', 'REQUEST_ATTACHMENT_SENTINEL', 'REQUEST_FACT_SENTINEL'
  ]) assert.equal(transmitted.includes(sentinel), false);
});

test('provider failure remains a review error and does not return a draft', async () => {
  const { commands, state } = createHarness(async () => ({
    ok: false,
    errorMessage: 'Provider could not complete the edit.',
    text: 'MUST_NOT_BE_TREATED_AS_A_DRAFT'
  }));
  await commands.open('grammar', { isCurrent: () => true });

  let draft;
  await assert.rejects(
    (async () => { draft = await state.openOptions.request({
      contextText: 'This passage is explicitly supplied.',
      instruction: state.openOptions.instruction
    }); })(),
    error => error.message === 'Provider could not complete the edit.'
  );
  assert.equal(draft, undefined);
  assert.equal(state.providerCalls.length, 1);
});
