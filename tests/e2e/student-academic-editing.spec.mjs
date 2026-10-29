import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

async function openApp(page) {
  await page.goto('/Sutra.html');
  await waitForAppReady(page);
  await page.evaluate(() => {
    window.markStudentOnboardingCompleted?.(true);
    document.body.classList.remove('onboarding-open');
    document.getElementById('sutraStartupIntro')?.remove();
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.hidden = true; overlay.classList.remove('active'); overlay.style.display = 'none'; }
  });
}

test('Application Sheets switch, accept entries, and retain entries after reload', async ({ page }) => {
  await openApp(page);
  // College is an optional pack on a fresh Student workspace. Enable it using
  // the same preference control as a student before opening its navigation.
  await page.evaluate(() => window.setActiveView('settings'));
  const mobileCategory = page.locator('#settingsCategorySelect');
  if (await mobileCategory.isVisible()) {
    await mobileCategory.selectOption('advanced');
  } else {
    const advancedGroup = page.locator('#settingsAdvancedGroup');
    if (!(await advancedGroup.evaluate(node => node.open))) await advancedGroup.locator('summary').click();
    await page.locator('#view-settings [data-settings-nav="advanced"]').click();
  }
  const collegeToggle = page.locator('#featureToggleListSettings input[data-feature-view="collegeapp"]');
  await collegeToggle.check();
  await expect(collegeToggle).toBeChecked();
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('application-sheets-pack'));
  await page.evaluate(() => window.setActiveView('collegeapp'));
  await page.locator('[data-collegeapp-page="sheets"]:visible').first().click();
  const sheets = page.locator('#collegeappPage-sheets');
  await sheets.locator('[data-college-tab="deadlines"]').click();
  await expect(sheets.locator('[data-college-panel="deadlines"]')).toBeVisible();
  await expect(sheets.locator('[data-college-panel="research"]')).toBeHidden();
  await sheets.locator('#collegeAddRowBtn').click();
  const field = sheets.locator('[data-college-panel="deadlines"] [data-college-field="college"]').last();
  await field.fill('Regression University');
  await field.blur();
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-application-sheets'));
  await page.reload();
  await waitForAppReady(page);
  await page.evaluate(() => window.setActiveView('collegeapp'));
  // The saved active sheet may already be open; otherwise use its dashboard button.
  if (!(await sheets.isVisible())) await page.locator('[data-collegeapp-page="sheets"]:visible').first().click();
  await sheets.locator('[data-college-tab="deadlines"]').click();
  await expect(sheets.locator('[data-college-panel="deadlines"] [data-college-field="college"]').last()).toHaveValue('Regression University');
});

test('imported Homework notes and Reference URL can be edited, reloaded, and cleared', async ({ page }) => {
  // This flow cold-boots twice and covers save, reload, edit, and clear.
  test.setTimeout(120000);
  await openApp(page);
  await page.evaluate(() => {
    window.SutraHomeworkStore.transact(draft => {
      draft.courses.push({ id: 'editing-course', name: 'English', type: 'class' });
      draft.tasks.push({ id: 'editing-import', courseId: 'editing-course', title: 'Essay', notes: 'Imported details', sourceUrl: 'https://school.example/original', done: false });
    }, { reason: 'test-seed' });
    window.dispatchEvent(new CustomEvent('homework:updated'));
    window.openHomeworkTaskModal('v2', 'editing-import');
  });
  await expect(page.locator('#taskNotesInput')).toBeEnabled();
  await expect(page.locator('#taskNotesInput')).toHaveValue('Imported details');
  await page.locator('#taskNotesInput').fill('Edited details');
  await page.locator('#taskReferenceInput').fill('https://school.example/revised');
  await page.locator('#taskModal').getByRole('button', { name: 'Save Task', exact: true }).click();
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-homework-edit'));
  await page.reload();
  await waitForAppReady(page);
  await page.evaluate(() => window.openHomeworkTaskModal('v2', 'editing-import'));
  await expect(page.locator('#taskNotesInput')).toHaveValue('Edited details');
  await expect(page.locator('#taskReferenceInput')).toHaveValue('https://school.example/revised');
  await page.locator('#taskNotesInput').fill('');
  await page.locator('#taskReferenceInput').fill('');
  await page.locator('#taskModal').getByRole('button', { name: 'Save Task', exact: true }).click();
  const task = await page.evaluate(() => window.SutraHomeworkStore.getSnapshot().tasks.find(item => item.id === 'editing-import'));
  expect(task.notes).toBe('');
  expect(task.sourceUrl).toBe('');
  expect(task.courseId).toBe('editing-course');
});
