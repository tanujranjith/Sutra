import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/features/assistant/flow-assistant.js', import.meta.url), 'utf8');

function createCommandRouter(themeCalls) {
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
    'routeMemoryCommand', 'getPref', 'tryReadTodoList', 'routeProductKnowledge', 'truncate', 'window',
    `${declaration.body}; return tryHandleCommand;`
  )(
    () => null,
    (_key, fallback) => fallback,
    () => null,
    () => null,
    text => String(text || ''),
    window
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
