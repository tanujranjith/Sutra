import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

const TASK_ID = 'qa-legacy-imported-task';
const TASK_TITLE = 'QA imported legacy task';
const UNKNOWN_FIELD = { source: 'older-json-export', value: 'preserve-this-field' };

async function completeOnboarding(page) {
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch (_) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.setProperty('display', 'none', 'important');
    overlay.style.setProperty('pointer-events', 'none', 'important');
  });
  await expect(page.locator('#studentOnboardingOverlay')).toBeHidden();
}

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await waitForAppReady(page);
  await completeOnboarding(page);
}

async function continueJsonRestore(page) {
  const restoreButton = page.getByRole('button', { name: 'Restore backup', exact: true });
  const skipSafetyExportButton = page.getByRole('button', { name: 'No, continue without export', exact: true });
  await expect.poll(async () =>
    (await restoreButton.isVisible().catch(() => false))
      || (await skipSafetyExportButton.isVisible().catch(() => false))
  ).toBe(true);
  if (await restoreButton.isVisible().catch(() => false)) await restoreButton.click();
  await skipSafetyExportButton.click();
}

async function openImportedTaskForEditing(page) {
  const homeTab = page.locator('.view-tab[data-view="today"]:visible').first();
  if (await homeTab.count()) await homeTab.click();

  const drawer = page.locator('#allTasksDrawer');
  if (await drawer.getAttribute('aria-hidden') !== 'false') {
    await page.locator('#todayHeaderMoreBtn').click();
    await page.locator('#toggleAllTasksBtn').click();
  }
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');

  const card = page.locator('#today-all-list .task-card').filter({ hasText: TASK_TITLE });
  await expect(card).toHaveCount(1);
  await card.locator('.task-overflow-trigger').click();
  await card.locator('.task-overflow-menu button').filter({ hasText: 'Edit' }).click();
  await expect(page.locator('#taskModal')).toHaveClass(/active/);
}

async function readImportedTask(page) {
  return page.evaluate(id => {
    const task = window.serializeWorkspace({ mode: 'json' }).tasks.find(entry => entry.id === id);
    return task ? {
      title: task.title,
      notes: task.notes,
      referenceUrl: task.referenceUrl,
      legacyUnknownField: task.legacyUnknownField
    } : null;
  }, TASK_ID);
}

test('JSON-imported legacy task Notes and Reference URL edits survive save, reopen, reload, and unknown-field round-trip', async ({ page }) => {
  await openApp(page);

  const legacyNotes = 'Notes from the older export.';
  const legacyUrl = 'https://example.com/older-reference';
  const importedJson = await page.evaluate(({ taskId, title, notes, referenceUrl, unknownField }) => {
    const base = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const legacyTask = {
      id: taskId,
      title,
      notes,
      referenceUrl,
      legacyUnknownField: unknownField
    };
    return JSON.stringify({ ...base, tasks: [legacyTask], taskOrder: [taskId] });
  }, { taskId: TASK_ID, title: TASK_TITLE, notes: legacyNotes, referenceUrl: legacyUrl, unknownField: UNKNOWN_FIELD });

  await page.setInputFiles('#fileInput', {
    name: 'legacy-task-workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importedJson)
  });
  await continueJsonRestore(page);
  await expect.poll(() => readImportedTask(page), { timeout: 30_000 }).toEqual({
    title: TASK_TITLE,
    notes: legacyNotes,
    referenceUrl: legacyUrl,
    legacyUnknownField: UNKNOWN_FIELD
  });

  await openImportedTaskForEditing(page);
  await expect(page.locator('#taskNotesInput')).toHaveValue(legacyNotes);
  await expect(page.locator('#taskReferenceInput')).toHaveValue(legacyUrl);
  const editedNotes = 'Updated notes saved from the task details dialog.';
  const editedUrl = 'https://example.com/updated-reference';
  await page.locator('#taskNotesInput').fill(editedNotes);
  await page.locator('#taskReferenceInput').fill(editedUrl);
  await page.locator('#taskModal').getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(page.locator('#taskModal')).not.toHaveClass(/active/);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-imported-task-edit'));
  await expect.poll(() => readImportedTask(page)).toEqual({
    title: TASK_TITLE,
    notes: editedNotes,
    referenceUrl: editedUrl,
    legacyUnknownField: UNKNOWN_FIELD
  });

  await openImportedTaskForEditing(page);
  await expect(page.locator('#taskNotesInput')).toHaveValue(editedNotes);
  await expect(page.locator('#taskReferenceInput')).toHaveValue(editedUrl);
  await page.locator('#taskModal').getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.reload();
  await waitForAppReady(page);
  await completeOnboarding(page);
  await expect.poll(() => readImportedTask(page)).toEqual({
    title: TASK_TITLE,
    notes: editedNotes,
    referenceUrl: editedUrl,
    legacyUnknownField: UNKNOWN_FIELD
  });
  await openImportedTaskForEditing(page);
  await expect(page.locator('#taskNotesInput')).toHaveValue(editedNotes);
  await expect(page.locator('#taskReferenceInput')).toHaveValue(editedUrl);
});
