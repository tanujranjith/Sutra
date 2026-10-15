import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

test.use({ serviceWorkers: 'block' });

const TASK_NOTES = 'For the Orchid worksheet, count three leaf veins and record the median in the blue binder.';
const TASK_URL = 'https://school.example.edu/orchid/worksheet?course=biology';

async function openFullAssistant(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('sutra_intro_played', '1');
  });
  await page.goto('/Sutra.html');
  await waitForAppReady(page);
  await page.evaluate(() => {
    localStorage.setItem('sutra_ai_send_ack_v1', '1');
    window.markStudentOnboardingCompleted?.(true);
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('display', 'none', 'important');
    }
    document.body.classList.remove('onboarding-open');
    window.SutraFeatureRegistry?.enable('assistant', { test: true });
    window.flowAssistant?.init?.();
    window.setWorkspacePreference('assistant.enabled', true);
    window.setWorkspacePreference('assistant.contextDepth', 'workspace');
    window.setWorkspacePreference('assistant.chatMemoryMode', 'stateful');
    window.setWorkspacePreference('assistant.chatMemoryDepth', 5);
    window.setWorkspacePreference('assistant.localRouting', false);
    window.SutraAssistantPermissions.setMode('read_only');
    window.SutraAssistantPermissions.setArea('planning', 'approved');
    window.SutraAssistantPermissions.setArea('learning', 'approved');
    window.setActiveView('assistantview');
    window.SutraProviderMeta.saveSessionKey('openai', 'fake-openai-key-for-source-tests');
    window.SutraProviderMeta.selectModel('openai', 'gpt-6-luna');
  });
  await expect(page.locator('#asstInput')).toBeVisible();
}

async function sendMessage(page, text, expectedReply) {
  await page.locator('#asstInput').fill(text);
  await page.locator('#asstSendBtn').click();
  await expect(page.locator('#asstMessages .asst-msg.assistant').last()).toContainText(expectedReply);
}

test('full Assistant retains task evidence across Stateful URL follow-ups and discloses live task and exam sources', async ({ page }) => {
  const requests = [];
  await page.route('https://api.openai.com/v1/chat/completions', async route => {
    requests.push(route.request().postDataJSON());
    const reply = 'Mocked Assistant reply ' + requests.length + '.';
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"choices":[{"delta":{"content":"' + reply + '"}}]}\n\ndata: [DONE]\n\n'
    });
  });

  await openFullAssistant(page);
  await page.evaluate(async ({ notes, referenceUrl }) => {
    window.flowAtelier.tasks.push({
      id: 'orchid-task', title: 'Orchid protocol worksheet', notes,
      referenceUrl, completed: false, isActive: true, priority: 'medium', dueDate: '2099-12-01'
    });
    const testing = window.flowAtelier.testingHub;
    testing.custom.push({ id: 'biology-midterm', name: 'Biology Midterm', examDate: '2099-12-02' });
    testing.pinnedExams = (testing.pinnedExams || []).concat('custom:biology-midterm');
    testing.recentExams = (testing.recentExams || []).concat('custom:biology-midterm');
    window.flowAtelier.tasks.push({
      id: 'unrelated-task', title: 'Unrelated geometry project', notes: 'UNRELATED_SOURCE_SENTINEL',
      completed: false, isActive: true, priority: 'low'
    });
    window.SutraWorkspaceEntityRegistry.invalidate('assistant-source-disclosure-fixture');
    await window.flowAtelier.flushAppSaveNow('assistant-source-disclosure-fixture');
  }, { notes: TASK_NOTES, referenceUrl: TASK_URL });

  const initialQuestion = 'Summarize the instructions for the Orchid protocol worksheet.';
  await sendMessage(page, initialQuestion, 'Mocked Assistant reply 1.');
  const firstReply = page.locator('#asstMessages .asst-msg.assistant').last();
  const firstRequestText = JSON.stringify(requests[0]);
  expect(firstRequestText).toContain('Orchid protocol worksheet');
  expect(firstRequestText).toContain(TASK_NOTES);
  await expect(firstReply.locator('.assistant-sources')).toContainText('Orchid protocol worksheet');
  await expect(firstReply.locator('.assistant-sources')).not.toContainText('Biology Midterm');
  await expect(firstReply.locator('.assistant-sources')).not.toContainText('UNRELATED_SOURCE_SENTINEL');

  await sendMessage(page, 'What is its reference URL?', 'Mocked Assistant reply 2.');
  const followUp = page.locator('#asstMessages .asst-msg.assistant').last();
  const followUpPanel = followUp.locator('.assistant-sources');
  await expect(followUpPanel).toContainText('Orchid protocol worksheet');
  await expect(followUpPanel).not.toContainText('Biology Midterm');
  await expect(followUpPanel).not.toContainText('UNRELATED_SOURCE_SENTINEL');

  const secondRequest = requests[1];
  const secondRequestText = JSON.stringify(secondRequest);
  expect(secondRequestText).toContain(initialQuestion);
  expect(secondRequestText).toContain('Mocked Assistant reply 1.');
  expect(secondRequestText).toContain(TASK_NOTES);
  expect(secondRequestText).toContain(TASK_URL);
  expect(secondRequestText).not.toContain('UNRELATED_SOURCE_SENTINEL');

  await sendMessage(page, 'Compare my Orchid protocol worksheet with Biology Midterm.', 'Mocked Assistant reply 3.');
  const comparison = page.locator('#asstMessages .asst-msg.assistant').last();
  const sources = comparison.locator('.assistant-sources');
  await expect(sources).toContainText('Orchid protocol worksheet');
  await expect(sources).toContainText('Biology Midterm');
  await expect(sources).not.toContainText('Source no longer available');
  await expect(sources).not.toContainText('UNRELATED_SOURCE_SENTINEL');

  const receipt = comparison.locator('.assistant-response-receipt');
  await receipt.locator('summary').click();
  await expect(receipt).toContainText('Orchid protocol worksheet (task)');
  await expect(receipt).toContainText('Biology Midterm (testing_exam)');
  await expect(receipt).not.toContainText('Source no longer available');
  await expect(receipt).not.toContainText('UNRELATED_SOURCE_SENTINEL');

  await page.evaluate(() => {
    const registry = window.SutraWorkspaceEntityRegistry;
    const originalOpen = registry.open.bind(registry);
    window.__assistantOpenedSources = [];
    registry.open = (ref, context) => {
      window.__assistantOpenedSources.push(String(ref));
      return originalOpen(ref, context);
    };
  });
  await sources.locator('summary').click();
  await sources.getByRole('button', { name: 'Open source Orchid protocol worksheet' }).click();
  await expect.poll(() => page.evaluate(() => window.__assistantOpenedSources)).toContain('task:orchid-task');
  await page.evaluate(() => window.setActiveView('assistantview'));
  await expect(page.locator('#asstInput')).toBeVisible();
  const reopenedComparison = page.locator('#asstMessages .asst-msg.assistant').last().locator('.assistant-sources');
  await reopenedComparison.locator('summary').click();
  await reopenedComparison.getByRole('button', { name: 'Open source Biology Midterm' }).click();
  await expect.poll(() => page.evaluate(() => window.__assistantOpenedSources)).toContain('testing_exam:custom:biology-midterm');

  await page.evaluate(async () => window.flowAtelier.flushAppSaveNow('assistant-source-disclosures-reload'));
  await page.reload();
  await waitForAppReady(page);
  await page.evaluate(() => window.setActiveView('assistantview'));
  await expect(page.locator('#asstInput')).toBeVisible();
  const persistedReply = page.locator('#asstMessages .asst-msg.assistant').last();
  await expect(persistedReply.locator('.assistant-sources')).toContainText('Orchid protocol worksheet');
  await expect(persistedReply.locator('.assistant-sources')).toContainText('Biology Midterm');
  await expect(persistedReply.locator('.assistant-sources')).not.toContainText('UNRELATED_SOURCE_SENTINEL');
  await expect(persistedReply.locator('.assistant-response-receipt')).toContainText('Orchid protocol worksheet (task)');
  await expect(persistedReply.locator('.assistant-response-receipt')).toContainText('Biology Midterm (testing_exam)');
  expect(requests).toHaveLength(3);
});
