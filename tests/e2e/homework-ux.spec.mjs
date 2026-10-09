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
    const completedUndated = window.SutraHomework.createTask({
      courseId: history.id,
      title: 'Completed undated reading',
      difficulty: 'easy'
    });
    const completedFuture = window.SutraHomework.createTask({
      courseId: biology.id,
      title: 'Completed future lab',
      dueDate: '2099-01-04',
      difficulty: 'medium'
    });
    window.SutraHomework.createTask({
      courseId: biology.id,
      title: 'Open overdue quiz',
      dueDate: '2020-01-03',
      difficulty: 'medium'
    });
    window.SutraHomework.createTask({
      courseId: biology.id,
      title: 'Upcoming biology lab',
      dueDate: '2099-01-01',
      difficulty: 'medium'
    });
    window.SutraHomework.createTask({
      courseId: history.id,
      title: 'A very long history assignment name that should remain readable in the grouped view',
      dueDate: '2099-01-02',
      difficulty: 'easy'
    });
    window.SutraHomework.createTask({
      courseId: history.id,
      title: 'Undated history reading',
      difficulty: 'easy'
    });
    window.SutraHomework.createTask({
      title: 'Unassigned reading',
      dueDate: '2099-01-03',
      difficulty: 'easy'
    });
    window.SutraHomework.setDone(completed.id, true);
    window.SutraHomework.setDone(completedUndated.id, true);
    window.SutraHomework.setDone(completedFuture.id, true);
    window.SutraHomework.render();
    const homeworkSetup = document.getElementById('hwSetupOverlay');
    if (homeworkSetup) {
      homeworkSetup.hidden = true;
      homeworkSetup.classList.remove('active');
      homeworkSetup.style.setProperty('display', 'none', 'important');
    }
  });
  await page.locator('[data-todo-category="homework"]').click();
}

async function chooseHomeworkFilter(page, id, label) {
  const filterToggle = page.locator('#hwFilterToggle');
  if (await filterToggle.getAttribute('aria-expanded') !== 'true') await filterToggle.click();
  const select = page.locator('#' + id);
  await select.locator('xpath=..').locator('.nf-select-trigger').click();
  await page.locator('#' + id + '-menu').getByRole('option', { name: label, exact: true }).click();
}

test('All Assignments keeps open overdue work visible and groups completed assignments', async ({ page }) => {
  await openSeededHomework(page);
  await page.locator('[data-homework-tab="all"]').click();
  const table = page.locator('.hw-assignment-table:not(.is-by-class)');
  const past = table.locator('#hwPastAssignmentRows');
  const toggle = table.locator('[data-hw-past-toggle]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toContainText('Completed tasks (3)');
  await expect(past).toBeHidden();
  await expect(past.locator('.hw-assignment-row')).toHaveCount(0);
  await expect(table.locator('tbody:not(#hwPastAssignmentRows) .hw-assignment-row')).toHaveCount(5);
  await expect(table.locator('tbody:not(#hwPastAssignmentRows) .hw-assignment-row', { hasText: 'Open overdue quiz' })).toBeVisible();

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(past.locator('.hw-assignment-row')).toHaveCount(3);
  await expect(past.locator('.hw-assignment-row', { hasText: 'Completed past-due essay' })).toBeVisible();
  await expect(past.locator('.hw-assignment-row', { hasText: 'Completed undated reading' })).toBeVisible();
  await expect(past.locator('.hw-assignment-row', { hasText: 'Completed future lab' })).toBeVisible();
  await expect(table.locator('tbody:not(#hwPastAssignmentRows) .hw-assignment-row', { hasText: 'Completed undated reading' })).toHaveCount(0);
  await expect(past.locator('.hw-assignment-row', { hasText: 'Open overdue quiz' })).toHaveCount(0);

  const actions = table.locator('.hw-assignment-row', { hasText: 'Open overdue quiz' }).locator('.hw-row-actions');
  const geometry = await actions.evaluate(group => Array.from(group.children).map(child => {
    const button = child.matches('button') ? child : child.querySelector('button');
    const rect = button.getBoundingClientRect();
    return { width: rect.width, height: rect.height, centerY: rect.top + rect.height / 2 };
  }));
  expect(geometry).toHaveLength(3);
  expect(Math.max(...geometry.map(item => item.centerY)) - Math.min(...geometry.map(item => item.centerY))).toBeLessThanOrEqual(1);
  expect(new Set(geometry.map(item => item.width))).toEqual(new Set([geometry[0].width]));
  expect(new Set(geometry.map(item => item.height))).toEqual(new Set([geometry[0].height]));
  expect(Math.min(...geometry.map(item => Math.min(item.width, item.height)))).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileSizes = await actions.evaluate(group => Array.from(group.children).map(child => {
    const button = child.matches('button') ? child : child.querySelector('button');
    const rect = button.getBoundingClientRect();
    return Math.min(rect.width, rect.height);
  }));
  expect(Math.min(...mobileSizes)).toBeGreaterThanOrEqual(44);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(past.locator('.hw-assignment-row')).toHaveCount(0);
  const openOverdue = table.locator('.hw-assignment-row', { hasText: 'Open overdue quiz' });
  await openOverdue.locator('[data-task-toggle]').focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toContainText('Completed tasks (4)');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.evaluate(() => document.activeElement?.hasAttribute('data-hw-past-toggle'))).resolves.toBe(true);

  await toggle.click();
  await expect(past.locator('.hw-assignment-row')).toHaveCount(4);
  await expect(past.locator('.hw-assignment-row', { hasText: 'Open overdue quiz' })).toBeVisible();
  await past.locator('.hw-assignment-row', { hasText: 'Open overdue quiz' }).locator('[data-task-toggle]').focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toContainText('Completed tasks (3)');
  await expect(table.locator('tbody:not(#hwPastAssignmentRows) .hw-assignment-row', { hasText: 'Open overdue quiz' })).toBeVisible();
  await expect(past.locator('.hw-assignment-row')).toHaveCount(3);

  await toggle.click();
  await page.locator('#hwSearchInput').fill('overdue quiz');
  await expect(table.locator('.hw-assignment-row', { hasText: 'Open overdue quiz' })).toBeVisible();
  await expect(table.locator('[data-hw-past-toggle]')).toHaveCount(0);
  await page.locator('#hwSearchInput').fill('');
  await expect(table.locator('[data-hw-past-toggle]')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('[data-homework-tab="completed"]').click();
  await expect(table.locator('.hw-assignment-row', { hasText: 'Completed past-due essay' })).toBeVisible();
});

test('Homework completion takes precedence over overdue styling and By Class exposes difficulty', async ({ page }) => {
  await openSeededHomework(page);

  await page.locator('[data-homework-tab="class"]').click();
  const table = page.locator('.hw-assignment-table.is-by-class');
  await expect(table).toBeVisible();
  await expect(table.locator('thead th')).toHaveText([
    'Task', 'Class / activity', 'Due', 'Difficulty', 'Priority', 'Status', 'Actions'
  ]);
  await expect(table.locator('.hw-assignment-group-row')).toHaveCount(3);
  expect((await table.locator('.hw-assignment-group-heading > span').allTextContents()).map((text) => text.trim())).toEqual([
    'BiologyClass · 1 task',
    'UnassignedUnassigned · 1 task',
    'World HistoryClass · 2 tasks'
  ]);
  await expect(table.locator('[data-hw-overdue-toggle]')).toContainText('Past-due tasks (1)');
  await expect(table.locator('[data-hw-completed-toggle]')).toContainText('Completed tasks (3)');
  await expect(table.locator('.hw-assignment-row')).toHaveCount(4);

  await table.locator('[data-hw-completed-toggle]').click();
  const completed = table.locator('#hwCompletedAssignmentRows .hw-assignment-row', { hasText: 'Completed past-due essay' });
  await expect(completed).toHaveClass(/is-completed/);
  await expect(completed.locator('.hw-due-cell')).not.toHaveClass(/is-overdue/);
  await expect(completed.locator('.hw-due-cell')).not.toContainText('Overdue');
  await expect(completed.locator('.hw-work-status')).toHaveText(/Completed/);
  await expect(completed.locator('.hw-difficulty-badge')).toHaveText('Hard');
  await expect(table.locator('#hwCompletedAssignmentRows .hw-assignment-row', { hasText: 'Completed future lab' })).toBeVisible();
  await expect(table.locator('#hwCompletedAssignmentRows .hw-assignment-row', { hasText: 'Completed undated reading' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.SutraHomework.getTasks()
    .find((task) => task.title === 'Completed past-due essay')?.dueDate)).toBe('2020-01-02');
  await expect(page.locator('[data-deadline-filter="overdue"] strong')).toHaveText('1 task');

  await completed.locator('[data-task-toggle]').click();
  await expect(table.locator('[data-hw-overdue-toggle]')).toContainText('Past-due tasks (2)');
  await expect(table.locator('[data-hw-completed-toggle]')).toContainText('Completed tasks (2)');
  await table.locator('[data-hw-overdue-toggle]').click();
  const reopened = table.locator('#hwOverdueAssignmentRows .hw-assignment-row', { hasText: 'Completed past-due essay' });
  await expect(reopened).not.toHaveClass(/is-completed/);
  await expect(reopened.locator('.hw-due-cell')).toHaveClass(/is-overdue/);
  await expect(reopened.locator('.hw-work-status')).toHaveText(/Not Started/);
  await expect.poll(() => page.evaluate(() => window.SutraHomework.getTasks()
    .find((task) => task.title === 'Completed past-due essay')?.dueDate)).toBe('2020-01-02');
  await expect(page.locator('[data-deadline-filter="overdue"] strong')).toHaveText('2 tasks');

  await page.locator('[data-homework-tab="all"]').click();
  const allTable = page.locator('.hw-assignment-table:not(.is-by-class)');
  await expect(allTable.locator('thead th')).toHaveText([
    'Task', 'Class / activity', 'Due', 'Priority', 'Status', 'Actions'
  ]);
  await expect(allTable.locator('.hw-difficulty-badge')).toHaveCount(0);

  await page.locator('[data-homework-tab="class"]').click();
  await page.locator('#hwSearchInput').fill('long history assignment');
  await expect(table.locator('[data-hw-overdue-toggle], [data-hw-completed-toggle]')).toHaveCount(0);
  await expect(table.locator('.hw-assignment-group-row')).toHaveCount(1);
  await expect(table.locator('.hw-assignment-row')).toHaveCount(1);
  await expect(table.locator('.hw-assignment-title-btn', { hasText: 'long history assignment' })).toBeVisible();
});

test('Homework effort prompt follows the active theme surface and button tokens', async ({ page }) => {
  await openSeededHomework(page);

  for (const theme of ['default', 'dark', 'sutra', 'dune']) {
    await page.evaluate((themeKey) => window.applyAtelierTheme(themeKey), theme);
    const taskId = await page.evaluate((themeKey) => {
      const task = window.SutraHomework.createTask({
        title: `Theme prompt ${themeKey}`,
        dueDate: '2099-02-03'
      });
      window.SutraHomework.markDone(task.id);
      return task.id;
    }, theme);

    const toast = page.locator('.hw-time-log-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(`Theme prompt ${theme}`);
    const colors = await page.evaluate(() => {
      const toast = document.querySelector('.hw-time-log-toast');
      const button = toast && toast.querySelector('.hw-time-log-btn');
      const probe = document.createElement('div');
      const buttonProbe = document.createElement('button');
      probe.style.cssText = [
        'position:fixed', 'visibility:hidden',
        'background:var(--bg-elevated)', 'color:var(--text-primary)',
        'border:1px solid var(--button-border)',
        'box-shadow:var(--shadow-soft)'
      ].join(';');
      buttonProbe.style.cssText = 'position:fixed;visibility:hidden;background:var(--button-bg);color:var(--button-text)';
      document.body.appendChild(probe);
      document.body.appendChild(buttonProbe);
      const expected = getComputedStyle(probe);
      const expectedButton = getComputedStyle(buttonProbe);
      const actual = getComputedStyle(toast);
      const actualButton = getComputedStyle(button);
      const result = {
        toastBackground: actual.backgroundColor,
        expectedBackground: expected.backgroundColor,
        toastColor: actual.color,
        expectedColor: expected.color,
        buttonBackground: actualButton.backgroundColor,
        expectedButtonBackground: expectedButton.backgroundColor,
        buttonColor: actualButton.color,
        expectedButtonColor: expectedButton.color
      };
      probe.remove();
      buttonProbe.remove();
      return result;
    });
    expect(colors.toastBackground, `${theme} toast background`).toBe(colors.expectedBackground);
    expect(colors.toastColor, `${theme} toast text`).toBe(colors.expectedColor);
    expect(colors.buttonBackground, `${theme} button background`).toBe(colors.expectedButtonBackground);
    expect(colors.buttonColor, `${theme} button text`).toBe(colors.expectedButtonColor);
    const later = page.locator('#sutraUpdateBanner').getByRole('button', { name: 'Later' });
    if (await later.isVisible()) await later.click();
    await toast.locator('.hw-time-log-skip').click();
    await expect(toast).toBeHidden();
    await page.evaluate((id) => window.SutraHomework.setDone(id, false), taskId);
  }
});

test('By Class partitions history, preserves filters, and scopes repeated class menus', async ({ page }) => {
  await openSeededHomework(page);
  await page.evaluate(() => {
    const chemistry = window.SutraHomework.addCourse('Chemistry');
    const task = window.SutraHomework.createTask({ courseId: chemistry.id, title: 'Completed only chemistry lab', dueDate: '2020-01-05' });
    window.SutraHomework.setDone(task.id, true);
    window.SutraHomework.render();
  });
  await page.locator('[data-homework-tab="class"]').click();
  const table = page.locator('.hw-assignment-table.is-by-class');
  const overdueToggle = table.locator('[data-hw-overdue-toggle]');
  const completedToggle = table.locator('[data-hw-completed-toggle]');
  await expect(overdueToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(completedToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(table.locator('#hwOverdueAssignmentRows')).toBeHidden();
  await expect(table.locator('#hwCompletedAssignmentRows')).toBeHidden();
  await expect(table.locator('.hw-assignment-row')).toHaveCount(4);

  await overdueToggle.focus();
  await page.keyboard.press('Enter');
  await expect(overdueToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.evaluate(() => document.activeElement?.hasAttribute('data-hw-overdue-toggle'))).resolves.toBe(true);
  await page.keyboard.press('Enter');
  await expect(overdueToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.evaluate(() => document.activeElement?.hasAttribute('data-hw-overdue-toggle'))).resolves.toBe(true);
  await overdueToggle.focus();
  await page.keyboard.press('Enter');
  await completedToggle.focus();
  await page.keyboard.press('Enter');
  await expect(completedToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.evaluate(() => document.activeElement?.hasAttribute('data-hw-completed-toggle'))).resolves.toBe(true);
  const overdueRows = table.locator('#hwOverdueAssignmentRows .hw-assignment-row');
  const completedRows = table.locator('#hwCompletedAssignmentRows .hw-assignment-row');
  await expect(overdueRows).toHaveCount(1);
  await expect(overdueRows).toContainText('Open overdue quiz');
  await expect(completedRows).toHaveCount(4);
  await expect(table.locator('#hwCompletedAssignmentRows .hw-assignment-group-row', { hasText: 'Chemistry' })).toBeVisible();
  const chemistryId = await page.evaluate(() => window.SutraHomework.getCourses().find(course => course.name === 'Chemistry')?.id);
  const chemistryMenuTrigger = table.locator(`#hwCompletedAssignmentRows [data-course-menu-trigger="${chemistryId}"]`);
  await chemistryMenuTrigger.click();
  await expect(chemistryMenuTrigger.locator('xpath=..').locator('.hw-course-menu')).toBeVisible();
  await expect(chemistryMenuTrigger).toHaveAttribute('aria-expanded', 'true');
  await chemistryMenuTrigger.click();
  await expect(table.locator('#hwCompletedAssignmentRows')).toContainText('Completed future lab');
  await expect(table.locator('#hwCompletedAssignmentRows')).toContainText('Completed undated reading');
  await expect(table.locator('#hwCompletedAssignmentRows')).toContainText('Completed past-due essay');
  await expect(table.locator('.hw-assignment-row', { hasText: 'Open overdue quiz' })).toHaveCount(1);
  await expect(table.locator('.hw-assignment-row', { hasText: 'Completed past-due essay' })).toHaveCount(1);

  const biologyId = await page.evaluate(() => window.SutraHomework.getCourses().find(course => course.name === 'Biology')?.id);
  const biologyTriggers = table.locator(`[data-course-menu-trigger="${biologyId}"]`);
  await expect(biologyTriggers).toHaveCount(3);
  await biologyTriggers.nth(1).click();
  await expect(biologyTriggers.nth(0)).toHaveAttribute('aria-expanded', 'false');
  await expect(biologyTriggers.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await expect(biologyTriggers.nth(2)).toHaveAttribute('aria-expanded', 'false');
  await expect(table.locator('#hwOverdueAssignmentRows .hw-course-menu')).toBeVisible();

  await chooseHomeworkFilter(page, 'hwDueFilter', 'Overdue');
  await expect(table.locator('[data-hw-overdue-toggle], [data-hw-completed-toggle]')).toHaveCount(0);
  await expect(table.locator('.hw-assignment-row')).toHaveCount(1);
  await expect(table.locator('.hw-assignment-row')).toContainText('Open overdue quiz');

  await chooseHomeworkFilter(page, 'hwDueFilter', 'Any due date');
  await chooseHomeworkFilter(page, 'hwCompletionFilter', 'Completed only');
  await expect(table.locator('[data-hw-overdue-toggle], [data-hw-completed-toggle]')).toHaveCount(0);
  await expect(table.locator('.hw-assignment-row')).toHaveCount(4);
  await expect(table.locator('.hw-assignment-row', { hasText: 'Completed future lab' })).toBeVisible();
  await expect(table.locator('.hw-assignment-row', { hasText: 'Completed only chemistry lab' })).toBeVisible();

  await chooseHomeworkFilter(page, 'hwCompletionFilter', 'Open and completed');
  await page.locator('#hwSearchInput').fill('Completed future lab');
  await expect(table.locator('[data-hw-overdue-toggle], [data-hw-completed-toggle]')).toHaveCount(0);
  await expect(table.locator('.hw-assignment-row')).toHaveCount(1);
  await expect(table.locator('.hw-assignment-row')).toContainText('Completed future lab');

  await page.locator('#hwSearchInput').fill('');
  await expect(overdueToggle).toHaveAttribute('aria-expanded', 'true');
  const overdueTask = table.locator('#hwOverdueAssignmentRows .hw-assignment-row', { hasText: 'Open overdue quiz' });
  await overdueTask.locator('[data-task-menu-trigger]').click();
  await overdueTask.getByRole('menuitem', { name: 'Edit assignment' }).click();
  const editModal = page.locator('#hwGlobalAddModal');
  await expect(editModal).toBeVisible();
  await editModal.locator('[data-field="dueDate"]').fill('2099-01-05');
  await editModal.locator('button[type="submit"]').click();
  await expect(table.locator('[data-hw-overdue-toggle]')).toHaveCount(0);
  await expect(table.locator('.hw-assignment-row', { hasText: 'Open overdue quiz' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.SutraHomework.getTasks()
    .find(task => task.title === 'Open overdue quiz')?.dueDate)).toBe('2099-01-05');

  await expect(completedToggle).toHaveAttribute('aria-expanded', 'true');
  await completedToggle.click();
  const activeTask = table.locator('.hw-assignment-row', { hasText: 'Upcoming biology lab' });
  await activeTask.locator('[data-task-toggle]').focus();
  await page.keyboard.press('Enter');
  await expect(table.locator('[data-hw-completed-toggle]')).toContainText('Completed tasks (5)');
  await expect(table.locator('[data-hw-completed-toggle]')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.evaluate(() => document.activeElement?.hasAttribute('data-hw-completed-toggle'))).resolves.toBe(true);
  await table.locator('[data-hw-completed-toggle]').click();
  const completedActiveTask = table.locator('#hwCompletedAssignmentRows .hw-assignment-row', { hasText: 'Upcoming biology lab' });
  await expect(completedActiveTask).toBeVisible();
  await completedActiveTask.locator('[data-task-toggle]').click();
  await expect(table.locator('.hw-assignment-row', { hasText: 'Upcoming biology lab' })).toBeVisible();
  await expect(table.locator('[data-hw-completed-toggle]')).toContainText('Completed tasks (4)');

  for (const width of [1586, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector('.hw-assignments-panel');
      const wrapper = document.querySelector('.hw-assignment-table-wrap');
      const table = wrapper?.querySelector('.hw-assignment-table');
      if (!panel || !wrapper || !table) return null;
      wrapper.scrollLeft = wrapper.scrollWidth;
      const panelRect = panel.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const buttons = Array.from(table.querySelectorAll('.hw-row-actions .hw-row-action')).filter(button => button.getClientRects().length);
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        wrapperWithinPanel: wrapperRect.left >= panelRect.left - 1 && wrapperRect.right <= panelRect.right + 1,
        buttonsWithinPanel: buttons.every(button => {
          const rect = button.getBoundingClientRect();
          return rect.left >= panelRect.left - 1 && rect.right <= panelRect.right + 1;
        }),
        actionsWidth: table.querySelector('thead th:last-child')?.getBoundingClientRect().width || 0,
        actionButtons: buttons.length
      };
    });
    expect(geometry).not.toBeNull();
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.wrapperWithinPanel).toBe(true);
    expect(geometry.buttonsWithinPanel).toBe(true);
    if (width > 1180) expect(geometry.actionsWidth).toBeGreaterThanOrEqual(156);
    expect(geometry.actionButtons).toBeGreaterThan(0);
  }
});
