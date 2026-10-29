import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

async function openFocusWorkspace(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  // The bridge can be installed before workspace hydration completes.
  await page.waitForFunction(() => window.__hwDueDateDelegateBound === true);
  await waitForAppReady(page);
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch (_) {}
    const onboarding = document.getElementById('studentOnboardingOverlay');
    if (onboarding) {
      onboarding.hidden = true;
      onboarding.classList.remove('active');
      onboarding.setAttribute('aria-hidden', 'true');
      onboarding.style.setProperty('display', 'none', 'important');
      onboarding.style.setProperty('pointer-events', 'none', 'important');
    }
  });
  await page.waitForFunction(() => typeof window.startFocusSession === 'function'
    && !!window.flowAtelier && !!window.SutraHomework);
}

async function readActiveFocusContext(page) {
  return page.evaluate(() => {
    const session = appSettings && appSettings.activeFocusSession;
    return session ? {
      id: session.id,
      taskId: session.taskId,
      taskTitle: session.taskTitle
    } : null;
  });
}

async function acceptFocusPreflight(page) {
  await expect(page.locator('#customPromptModal')).toHaveClass(/active/);
  await expect(page.locator('#customPromptTitle')).toHaveText('Plan your focus session');
  await page.locator('#customPromptConfirmBtn').click();
}

test('Focus preserves canonical task and Homework projection identity and title', async ({ page }) => {
  await openFocusWorkspace(page);

  const seeded = await page.evaluate(() => {
    const task = {
      id: 'focus-context-canonical-task',
      title: 'Read chemistry notes',
      dueDate: '',
      priority: 'medium',
      completed: false,
      isActive: true,
      scheduleType: 'once'
    };
    window.flowAtelier.tasks.push(task);

    const course = window.SutraHomework.addCourse('Focus context chemistry');
    const homework = window.SutraHomework.createTask({
      courseId: course.id,
      title: 'Finish chemistry lab report'
    });
    window.SutraHomework.render();
    window.flowAtelier.renderTaskViews();

    return {
      taskId: task.id,
      taskTitle: task.title,
      homeworkSourceId: homework.id,
      homeworkTaskId: `hw_v2_${homework.id}`,
      homeworkTitle: `${course.name}: ${homework.title}`
    };
  });

  await page.waitForFunction(({ homeworkSourceId, homeworkTaskId }) =>
    window.flowAtelier.tasks.some(task => task.id === homeworkTaskId
      && task.homeworkSourceId === homeworkSourceId), seeded);
  await expect.poll(() => page.evaluate(({ homeworkTaskId }) =>
    window.flowAtelier.tasks.find(task => task.id === homeworkTaskId)?.title, seeded)).toBe(seeded.homeworkTitle);

  for (const expected of [
    { taskId: seeded.taskId, title: seeded.taskTitle },
    { taskId: seeded.homeworkTaskId, title: seeded.homeworkTitle }
  ]) {
    await page.evaluate(taskId => window.startFocusSession(taskId), expected.taskId);
    await acceptFocusPreflight(page);
    await expect(page.locator('#focusSessionOverlay')).toBeVisible();
    await expect(page.locator('#fsTaskTitle')).toHaveText(expected.title);
    await expect.poll(async () => (await readActiveFocusContext(page))?.taskId).toBe(expected.taskId);
    await expect.poll(async () => (await readActiveFocusContext(page))?.taskTitle).toBe(expected.title);

    await page.evaluate(() => window.fsClose());
    await expect(page.locator('#focusSessionOverlay')).toBeHidden();
  }
});

test('Focus replaces an explicit new title and resumes the existing context when launched bare', async ({ page }) => {
  await openFocusWorkspace(page);

  await page.evaluate(() => window.startFocusSession(null, { title: 'Old focus context' }));
  await acceptFocusPreflight(page);
  await expect(page.locator('#focusSessionOverlay')).toBeVisible();
  await expect(page.locator('#fsTaskTitle')).toHaveText('Old focus context');
  const oldSession = await readActiveFocusContext(page);
  await page.evaluate(() => window.fsMinimize());
  await expect(page.locator('#focusSessionOverlay')).toBeHidden();

  await page.evaluate(() => window.startFocusSession(null, { title: 'New focus context' }));
  await acceptFocusPreflight(page);
  await expect(page.locator('#focusSessionOverlay')).toBeVisible();
  await expect(page.locator('#fsTaskTitle')).toHaveText('New focus context');
  const newSession = await readActiveFocusContext(page);
  expect(newSession.id).not.toBe(oldSession.id);
  expect(newSession.taskTitle).toBe('New focus context');
  await page.evaluate(() => window.fsMinimize());
  await expect(page.locator('#focusSessionOverlay')).toBeHidden();

  await page.evaluate(() => window.startFocusSession());
  await acceptFocusPreflight(page);
  await expect(page.locator('#focusSessionOverlay')).toBeVisible();
  await expect(page.locator('#fsTaskTitle')).toHaveText('New focus context');
  const resumedSession = await readActiveFocusContext(page);
  expect(resumedSession.id).toBe(newSession.id);
  expect(resumedSession.taskTitle).toBe('New focus context');
});

test('Home Focus button keeps the selected Homework identity', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The desktop Home recommendation is covered here.');
  await openFocusWorkspace(page);
  const homework = await page.evaluate(async () => {
    const date = new Date();
    date.setDate(date.getDate() - 3);
    const dueDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const course = window.SutraHomework.addCourse('Home Focus chemistry');
    const item = window.SutraHomework.createTask({ courseId: course.id, title: 'Home Focus lab report', dueDate, priority: 'high' });
    window.SutraHomework.render();
    await new Promise(resolve => requestAnimationFrame(resolve));
    window.flowAtelier.renderTaskViews();
    return { id: item.id, title: item.title, focusTitle: `${course.name}: ${item.title}` };
  });

  const brief = page.locator('#todayDailyBrief');
  await expect(brief.locator('.tnu-title')).toHaveText(homework.title);
  await expect.poll(() => page.evaluate(id => window.flowAtelier.tasks
    .find(task => task.id === `hw_v2_${id}` && task.homeworkSourceId === id)?.title, homework.id)).toBe(homework.focusTitle);
  await brief.locator('[data-donow-focus]').click();
  await acceptFocusPreflight(page);
  await expect(page.locator('#focusSessionOverlay')).toBeVisible();
  await expect(page.locator('#fsTaskTitle')).toHaveText(homework.focusTitle);
  await expect.poll(async () => (await readActiveFocusContext(page))?.taskId).toBe(`hw_v2_${homework.id}`);
  await expect.poll(async () => (await readActiveFocusContext(page))?.taskTitle).toBe(homework.focusTitle);
});

test('All Due Focus button keeps its planner task identity', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The All Due table action is covered at desktop width.');
  await openFocusWorkspace(page);
  const task = await page.evaluate(async () => {
    const date = new Date();
    date.setDate(date.getDate() - 3);
    const dueDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const item = { id: 'all-due-focus-planner', title: 'All Due Focus planner task', dueDate, priority: 'high', completed: false, isActive: true, scheduleType: 'once' };
    window.flowAtelier.tasks.push(item);
    await new Promise(resolve => requestAnimationFrame(resolve));
    window.flowAtelier.renderTaskViews();
    appSettings.preferences.layout.courseHubEnabled = true;
    window.flowAtelier.setActiveView('alldue');
    window.renderAllDueView();
    return item;
  });

  const row = page.locator('#allDueMount .student-inbox-row', { hasText: task.title });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Start focus session' }).click();
  await acceptFocusPreflight(page);
  await expect(page.locator('#focusSessionOverlay')).toBeVisible();
  await expect(page.locator('#fsTaskTitle')).toHaveText(task.title);
  await expect.poll(async () => (await readActiveFocusContext(page))?.taskId).toBe(task.id);
});
