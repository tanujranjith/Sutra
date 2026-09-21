import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

async function openSeededHomework(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await waitForAppReady(page);
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch (_) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove('active');
      overlay.style.setProperty('display', 'none', 'important');
    }
  });
  await page.waitForFunction(() => !!window.SutraHomework && typeof window.setActiveView === 'function');
  await page.evaluate(() => {
    window.setActiveView('homework');
    const biology = window.SutraHomework.addCourse('Biology');
    const history = window.SutraHomework.addCourse('World History');
    const completed = window.SutraHomework.createTask({
      courseId: biology.id,
      title: 'Completed past-due essay',
      dueDate: '2020-01-02',
      difficulty: 'hard'
    });
    window.SutraHomework.createTask({
      courseId: biology.id,
      title: 'Open overdue quiz',
      dueDate: '2020-01-03',
      difficulty: 'medium'
    });
    window.SutraHomework.createTask({
      courseId: history.id,
      title: 'A very long history assignment name that should remain readable in the grouped view',
      dueDate: '2099-01-02',
      difficulty: 'easy'
    });
    window.SutraHomework.createTask({
      title: 'Unassigned reading',
      dueDate: '2099-01-03',
      difficulty: 'easy'
    });
    window.SutraHomework.setDone(completed.id, true);
    window.SutraHomework.render();
    const homeworkSetup = document.getElementById('hwSetupOverlay');
    if (homeworkSetup) {
      homeworkSetup.hidden = true;
      homeworkSetup.classList.remove('active');
      homeworkSetup.style.setProperty('display', 'none', 'important');
    }
  });
}

test('Homework completion takes precedence over overdue styling and By Class exposes difficulty', async ({ page }) => {
  await openSeededHomework(page);

  await page.locator('[data-homework-tab="class"]').click();
  const table = page.locator('.hw-assignment-table.is-by-class');
  await expect(table).toBeVisible();
  await expect(table.locator('thead th')).toHaveText([
    'Assignment', 'Class / activity', 'Due', 'Difficulty', 'Priority', 'Status', 'Actions'
  ]);
  await expect(table.locator('.hw-assignment-group-row')).toHaveCount(3);
  // Action menus are intentionally hidden until opened; assert the visible
  // group label rather than including hidden menu item textContent.
  expect((await table.locator('.hw-assignment-group-heading > span').allTextContents()).map((text) => text.trim())).toEqual([
    'BiologyClass · 2 assignments',
    'UnassignedUnassigned · 1 assignment',
    'World HistoryClass · 1 assignment'
  ]);

  const completed = table.locator('.hw-assignment-row', { hasText: 'Completed past-due essay' });
  await expect(completed).toHaveClass(/is-completed/);
  await expect(completed.locator('.hw-due-cell')).not.toHaveClass(/is-overdue/);
  await expect(completed.locator('.hw-due-cell')).not.toContainText('Overdue');
  await expect(completed.locator('.hw-work-status')).toHaveText(/Completed/);
  await expect(completed.locator('.hw-difficulty-badge')).toHaveText('Hard');
  await expect.poll(() => page.evaluate(() => window.SutraHomework.getTasks()
    .find((task) => task.title === 'Completed past-due essay')?.dueDate)).toBe('2020-01-02');
  await expect(page.locator('[data-deadline-filter="overdue"] strong')).toHaveText('1 task');

  await completed.locator('[data-task-toggle]').click();
  const reopened = table.locator('.hw-assignment-row', { hasText: 'Completed past-due essay' });
  await expect(reopened).not.toHaveClass(/is-completed/);
  await expect(reopened.locator('.hw-due-cell')).toHaveClass(/is-overdue/);
  await expect(reopened.locator('.hw-work-status')).toHaveText(/Not Started/);
  await expect.poll(() => page.evaluate(() => window.SutraHomework.getTasks()
    .find((task) => task.title === 'Completed past-due essay')?.dueDate)).toBe('2020-01-02');
  await expect(page.locator('[data-deadline-filter="overdue"] strong')).toHaveText('2 tasks');

  await page.locator('[data-homework-tab="all"]').click();
  const allTable = page.locator('.hw-assignment-table:not(.is-by-class)');
  await expect(allTable.locator('thead th')).toHaveText([
    'Assignment', 'Class / activity', 'Due', 'Priority', 'Status', 'Actions'
  ]);
  await expect(allTable.locator('.hw-difficulty-badge')).toHaveCount(0);

  await page.locator('[data-homework-tab="class"]').click();
  await page.locator('#hwSearchInput').fill('history');
  await expect(table.locator('.hw-assignment-group-row')).toHaveCount(1);
  await expect(table.locator('.hw-assignment-row')).toHaveCount(1);
  await expect(table.locator('.hw-assignment-title-btn')).toContainText('long history assignment');
});

test('Homework By Class keeps grouped structure and assignment details on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSeededHomework(page);

  await page.locator('[data-homework-tab="class"]').click();
  const table = page.locator('.hw-assignment-table.is-by-class');
  await expect(table.locator('.hw-assignment-group-row')).toHaveCount(3);
  await expect(table.locator('.hw-assignment-group-row th').first()).toHaveAttribute('colspan', '7');
  await expect(table.locator('.hw-assignment-row')).toHaveCount(4);
  await expect(table.locator('.hw-difficulty-cell')).toHaveCount(4);
  await expect(table.locator('.hw-assignment-title-btn', { hasText: 'long history assignment' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    rowDisplay: getComputedStyle(document.querySelector('.hw-assignment-row')).display
  }))).toEqual({ documentWidth: 390, viewportWidth: 390, rowDisplay: 'grid' });
});
