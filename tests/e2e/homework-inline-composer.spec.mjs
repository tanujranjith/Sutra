import { expect, test } from '@playwright/test';

async function openHomework(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
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
    document.body.dataset.homeworkAddMethod = 'inline';
    window.setActiveView('homework');
    window.SutraHomework.addCourse('Composer layout course');
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    window.SutraHomework.createTask({ courseName: 'Composer layout course', title: 'Existing task', dueDate: today, priority: 'high' });
    window.SutraHomework.render();
    const homeworkSetup = document.getElementById('hwSetupOverlay');
    if (homeworkSetup) {
      homeworkSetup.hidden = true;
      homeworkSetup.classList.remove('active');
      homeworkSetup.style.setProperty('display', 'none', 'important');
    }
  });
}

test('Homework inline composer fills the assignment panel and keeps its fields in a two-column grid', async ({ page }) => {
  await openHomework(page);

  const composer = page.locator('.hw-panel-inline-add [data-inline-add]').first();
  await composer.locator('[data-inline-trigger]').click();
  const form = composer.locator('[data-inline-form]');
  await expect(form).toBeVisible();

  const layout = await composer.evaluate((element) => {
    const form = element.querySelector('[data-inline-form]');
    const chips = element.querySelector('.hw-inline-chips');
    const fields = Array.from(element.querySelectorAll('.hw-inline-chips select, .hw-inline-chips input'));
    return {
      composer: element.getBoundingClientRect().toJSON(),
      form: form.getBoundingClientRect().toJSON(),
      chips: chips.getBoundingClientRect().toJSON(),
      fields: fields.map((field) => field.getBoundingClientRect().toJSON())
    };
  });

  expect(layout.form.width).toBeGreaterThan(layout.composer.width * 0.8);
  expect(layout.chips.width).toBeGreaterThan(layout.form.width * 0.8);
  expect(layout.fields).toHaveLength(4);
  expect(layout.fields[0].width).toBeGreaterThan(100);
  expect(layout.fields[1].width).toBeGreaterThan(100);
  expect(Math.abs(layout.fields[0].y - layout.fields[1].y)).toBeLessThanOrEqual(2);
  expect(layout.fields[2].y).toBeGreaterThan(layout.fields[0].y + 20);
});

test('Homework workspace summaries, search, filters, and completion use live task data', async ({ page }) => {
  await openHomework(page);

  await expect(page.locator('#hwStatToday')).toHaveText('1');
  await expect(page.locator('.hw-assignment-row')).toHaveCount(1);

  await page.locator('#hwSearchInput').fill('not in this assignment');
  await expect(page.locator('.hw-filter-empty')).toBeVisible();
  await page.locator('#hwSearchInput').fill('Existing task');
  await expect(page.locator('.hw-assignment-row')).toHaveCount(1);

  await page.locator('#hwFilterToggle').click();
  await page.locator('#hwPriorityFilter').selectOption('low');
  await expect(page.locator('.hw-filter-empty')).toBeVisible();
  await page.locator('#hwPriorityFilter').selectOption('high');
  await expect(page.locator('.hw-assignment-row')).toHaveCount(1);

  await page.locator('.hw-assignment-row [data-task-toggle]').click();
  await expect(page.locator('#hwStatCompleted')).toHaveText('1');
  await page.locator('[data-homework-tab="completed"]').click();
  await expect(page.locator('.hw-assignment-row')).toHaveCount(1);
});

test('Homework assignment actions provide a dedicated edit form', async ({ page }) => {
  await openHomework(page);

  const row = page.locator('.hw-assignment-row').first();
  await row.locator('[data-task-menu-trigger]').click();
  await row.getByRole('menuitem', { name: 'Edit assignment' }).click();

  const modal = page.locator('#hwGlobalAddModal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#hwGlobalAddTitle')).toHaveText('Edit Assignment');
  await modal.locator('[data-field="title"]').fill('Renamed assignment');
  await modal.locator('[data-field="dueDate"]').fill('2026-08-31');
  await modal.locator('button[type="submit"]').click();

  await expect(page.locator('.hw-assignment-title-btn')).toHaveText('Renamed assignment');
  await expect(page.locator('.hw-assignment-row .hw-due-cell')).toContainText('Aug 31');
});
