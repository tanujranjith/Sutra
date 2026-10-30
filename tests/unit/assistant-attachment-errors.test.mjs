import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';
import { createRequire } from 'node:module';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const format = new Function(extractFunction(source, 'formatAssistantAttachmentProblems').body + ';return formatAssistantAttachmentProblems;')();
// extractFunction returns from `function`, so preserve the source declaration's
// async keyword when compiling this async runtime function for the fixture.
const providerPayloadBuilder = 'async ' + extractFunction(source, 'buildProviderRequestPayload').body;
const capabilities = createRequire(import.meta.url)('../../src/features/assistant/model-capabilities.js');

test('Gemini attachment gates explain the file and reason rather than stringify the problem object', () => {
  const output = format({ problems: [{ name: 'workspace.pdf', plan: { reason: 'Selected model cannot read PDF files' } }] });
  assert.equal(output, 'workspace.pdf: Selected model cannot read PDF files');
  assert.ok(!output.includes('[object Object]'));
  assert.equal(format({ problems: ['Legacy attachment error'] }), 'Legacy attachment error');
  assert.match(format({ problems: [null] }), /Attachment: incompatible/);
  assert.match(format(null), /Unsupported attachment/);
});

test('Gemini 3 payload carries native attachments and supported effort without requesting thoughts', async () => {
  const build = new Function('window', providerPayloadBuilder + ';return buildProviderRequestPayload;')({ SutraModelCapabilities: capabilities });
  const result = await build({ provider: 'gemini', model: 'gemini-3.1-pro-preview', apiKey: 'fake-only', reasoningEffort: 'high',
    providerConfig: { type: 'gemini', chatEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent' },
    messages: [{ role: 'user', content: 'Read this note' }],
    attachments: [{ name: 'note.pdf', processingPlan: 'native-pdf', dataUrl: 'data:application/pdf;base64,ZmFrZQ==' }]
  });
  assert.deepEqual(result.body.generationConfig.thinkingConfig, { thinkingLevel: 'high', includeThoughts: false });
  assert.equal(result.body.contents[0].parts[1].inline_data.mime_type, 'application/pdf');
  assert.equal(result.body.contents[0].parts[1].inline_data.data, 'ZmFrZQ==');
});

test('OpenAI GPT-6 sends the selected effort through its reasoning-compatible payload', async () => {
  const build = new Function('window', providerPayloadBuilder + ';return buildProviderRequestPayload;')({ SutraModelCapabilities: capabilities });
  const result = await build({ provider: 'openai', model: 'gpt-6-luna', apiKey: 'fake-only', reasoningEffort: 'xhigh', maxTokens: 1024,
    providerConfig: { type: 'openai_compatible', chatEndpoint: 'https://api.openai.com/v1/chat/completions' },
    messages: [{ role: 'user', content: 'Explain this task' }], attachments: [] });
  assert.equal(result.body.model, 'gpt-6-luna');
  assert.equal(result.body.reasoning_effort, 'xhigh');
  assert.ok(result.body.max_completion_tokens >= 24576);
  assert.equal(result.body.max_tokens, undefined);
  assert.equal(result.body.temperature, undefined);
});
