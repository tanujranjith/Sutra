import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/features/assistant/flow-assistant.js', import.meta.url), 'utf8');

function createCommandRouter(themeCalls, { productRoute = () => null, validTicket = null } = {}) {
  const declaration = extractFunction(source, 'tryHandleCommand');
  assert.ok(declaration, 'could not extract tryHandleCommand');
  const window = {
    SutraThemeAI: {
      isPreviewing: () => true,
      openWithPrompt: prompt => themeCalls.push(['generate', prompt]),
      refineActive: prompt => themeCalls.push(['refine', prompt])
    }
  };
  return new Function(
    'routeMemoryCommand', 'getPref', 'tryReadTodoList', 'routeProductKnowledge', 'truncate', 'window', 'currentLockedPageAccessTicket', 'routeStudyInterview',
    `${declaration.body}; return tryHandleCommand;`
  )(
    () => null,
    (_key, fallback) => fallback,
    () => null,
    productRoute,
    text => String(text || ''),
    window,
    options => validTicket && options.lockedPageAccessTicket === validTicket ? validTicket : null,
    () => null
  );
}

test('theme generation, slash, and refinement prompts remain ordinary Assistant turns', () => {
  const themeCalls = [];
  const route = createCommandRouter(themeCalls);

  for (const prompt of [
    'make me a dark futuristic theme',
    '/theme dark futuristic',
    'theme: dark futuristic',
    'make the accent warmer'
  ]) {
    assert.deepEqual(route(prompt), { handled: false }, prompt);
  }

  assert.deepEqual(themeCalls, []);
});

test('verified note-content requests bypass product Help, but how-to questions and invalid tickets do not', () => {
  const ticket = {};
  const helpQuestions = [];
  const route = createCommandRouter([], {
    validTicket: ticket,
    productRoute: text => { helpQuestions.push(text); return { handled: true, source: 'local' }; }
  });
  const question = 'Read the locked note "Sealed Atlas". What time is the meeting?';
  assert.deepEqual(route(question, { lockedPageAccessTicket: ticket }), { handled: false });
  assert.deepEqual(helpQuestions, []);
  assert.equal(route('How do I lock a note?').handled, true);
  assert.equal(route(question, { lockedPageAccessTicket: {} }).handled, true);
  assert.deepEqual(helpQuestions, ['How do I lock a note?', question]);
});
