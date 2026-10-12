import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const capabilities = require('../../src/features/assistant/model-capabilities.js');

test('Gemini 3 attachments and model-specific effort tiers are supported', () => {
  for (const model of ['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-3.8-flash']) {
    assert.equal(capabilities.resolveModelCapabilities('gemini', model).modalities.images, true);
    assert.equal(capabilities.determineAttachmentProcessingPlan('gemini', model, { name: 'paper.pdf', size: 1000 }).compatible, true);
    const plan = capabilities.resolveReasoningPlan('gemini', model, 'high');
    assert.equal(plan.style, 'gemini_thinking_level');
    assert.equal(plan.effort, 'high');
    assert.equal(plan.budgetTokens, undefined);
    assert.equal(capabilities.resolveReasoningPlan('gemini', model, 'off').apply, false);
  }
  assert.deepEqual(capabilities.resolveReasoningCapability('gemini', 'gemini-3-pro-preview').levels, ['low', 'high']);
  assert.ok(capabilities.resolveReasoningCapability('gemini', 'gemini-3-flash-preview').levels.includes('minimal'));
  assert.ok(!capabilities.resolveReasoningCapability('gemini', 'gemini-3.8-flash').levels.includes('minimal'));
  assert.equal(capabilities.resolveReasoningPlan('gemini', 'gemini-2.5-flash', 'high').style, 'gemini_thinking');
  assert.equal(capabilities.resolveReasoningCapability('gemini', 'unknown-future-model').supported, false);
});

test('XLSX uses bounded local extraction while legacy binary sheets explain the fallback', () => {
  const xlsx = capabilities.determineAttachmentProcessingPlan('groq', 'llama-3.3-70b-versatile', { name: 'grades.xlsx', sizeBytes: 1200 });
  assert.equal(xlsx.plan, 'local-extraction');
  assert.equal(xlsx.compatible, true);
  const xls = capabilities.determineAttachmentProcessingPlan('groq', 'llama-3.3-70b-versatile', { name: 'grades.xls', sizeBytes: 1200 });
  assert.equal(xls.compatible, false);
  assert.match(xls.reason, /Export the sheet as CSV/i);
});

test('unknown models never silently accept image, audio, video, PDF, or archives', () => {
  for (const name of ['scan.png', 'lecture.mp3', 'lecture.mp4', 'paper.pdf', 'files.zip']) {
    const plan = capabilities.determineAttachmentProcessingPlan('local', 'unknown-text-model', { name, sizeBytes: 1000 });
    assert.equal(plan.compatible, false, name);
    assert.ok(plan.reason, name);
  }
});

test('capability detection stays conservative and provider-specific', () => {
  const gemini = capabilities.resolveModelCapabilities('gemini', 'gemini-2.5-flash');
  assert.equal(gemini.modalities.pdf, true);
  assert.equal(gemini.modalities.images, true);
  assert.equal(gemini.modalities.audio, false);
});

test('optional local OCR and transcription processors enable bounded text plans', async () => {
  capabilities.registerLocalProcessor('image', async () => ({ text: 'scan text', metadata: { engine: 'test-ocr' } }));
  capabilities.registerLocalProcessor('audio', async () => 'spoken words');
  const imagePlan = capabilities.determineAttachmentProcessingPlan('groq', 'llama-3.3-70b', { name: 'scan.png', size: 20 });
  const audioPlan = capabilities.determineAttachmentProcessingPlan('groq', 'llama-3.3-70b', { name: 'lecture.mp3', size: 20 });
  assert.equal(imagePlan.plan, 'local-ocr');
  assert.equal(audioPlan.plan, 'local-transcription');
  assert.equal((await capabilities.runLocalProcessor('image', {})).text, 'scan text');
  capabilities.unregisterLocalProcessor('image');
  capabilities.unregisterLocalProcessor('audio');
  assert.equal(capabilities.determineAttachmentProcessingPlan('groq', 'llama-3.3-70b', { name: 'lecture.mp3', size: 20 }).compatible, false);
});

test('streaming is advertised only for implemented adapters with a selected model', () => {
  assert.equal(capabilities.resolveModelCapabilities('openai', 'gpt-4.1-mini').streaming, true);
  assert.equal(capabilities.resolveModelCapabilities('anthropic', 'claude-sonnet-4').streaming, true);
  assert.equal(capabilities.resolveModelCapabilities('gemini', 'gemini-2.5-flash').streaming, true);
  assert.equal(capabilities.resolveModelCapabilities('unknown-provider', 'model').streaming, false);
  assert.equal(capabilities.resolveModelCapabilities('openai', '').streaming, false);
});
