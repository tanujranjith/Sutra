import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

async function openHomework(page) {
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
    document.body.classList.remove('onboarding-open');
  });
  await page.waitForFunction(() => !!window.SutraHomework && !!window.SutraHomeworkStore && typeof window.setActiveView === 'function');
  await page.evaluate(() => {
    window.setActiveView('homework');
    window.courseHub.createCourse({ id: 'remove-class', name: 'Remove Biology', type: 'class' });
    window.courseHub.createCourse({ id: 'remove-activity', name: 'Remove Robotics', type: 'activity' });
    window.courseHub.createCourse({ id: 'remove-empty-class', name: 'Remove Empty Chemistry', type: 'class' });
    const snapshot = window.SutraHomeworkStore.getSnapshot();
    window.SutraHomeworkStore.replace({
      ...snapshot,
      courses: [
        { id: 'remove-class', name: 'Remove Biology', type: 'class' },
        { id: 'remove-activity', name: 'Remove Robotics', type: 'misc' },
        { id: 'remove-empty-class', name: 'Remove Empty Chemistry', type: 'class' }
      ],
      tasks: [
        { id: 'remove-class-task', courseId: 'remove-class', title: 'Biology assignment', notes: 'Keep this in the class Trash record.' },
        { id: 'remove-activity-task', courseId: 'remove-activity', title: 'Robotics assignment', notes: 'Keep this in the activity Trash record.' }
      ]
    }, { reason: 'homework-course-removal-test-seed' });
    window.dispatchEvent(new CustomEvent('homework:updated'));
    window.SutraHomework.render();
  });
  const setup = page.locator('#hwSetupOverlay');
  if (await setup.count()) await setup.evaluate((element) => {
    element.hidden = true;
    element.classList.remove('active');
    element.style.setProperty('display', 'none', 'important');
  });
  await page.locator('[data-homework-tab="class"]').click();
  await expect(page.locator('[data-course-delete="remove-class"]').first()).toBeVisible();
}

async function confirmRemoval(page, id, { hasLinkedAssignments = true } = {}) {
  await page.locator(`[data-course-delete="${id}"]`).first().click();
  await expect(page.locator('#customConfirmModal')).toHaveClass(/active/);
  if (hasLinkedAssignments) await expect(page.locator('#customConfirmMessage')).toContainText('Trash');
  await page.locator('#customConfirmAcceptBtn').click();
  await expect.poll(() => page.evaluate((courseId) => {
    const snapshot = window.SutraHomeworkStore.getSnapshot();
    return {
      course: snapshot.courses.some((course) => course.id === courseId),
      tasks: snapshot.tasks.filter((task) => task.courseId === courseId).length
    };
  }, id)).toEqual({ course: false, tasks: 0 });
}

test('Homework removes classes and activities through confirmation and canonical persistence', async ({ page }) => {
  await openHomework(page);

  await page.locator('[data-course-delete="remove-class"]').first().click();
  await expect(page.locator('#customConfirmModal')).toHaveClass(/active/);
  await page.locator('#customConfirmCancelBtn').click();
  await expect.poll(() => page.evaluate(() => window.SutraHomeworkStore.getSnapshot().courses.map((course) => course.id)))
    .toEqual(['remove-class', 'remove-activity', 'remove-empty-class']);

  await confirmRemoval(page, 'remove-class');
  await confirmRemoval(page, 'remove-activity');
  await confirmRemoval(page, 'remove-empty-class', { hasLinkedAssignments: false });

  const result = await page.evaluate(() => {
    const snapshot = window.SutraHomeworkStore.getSnapshot();
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    window.deserializeWorkspace(payload);
    const restored = window.SutraHomeworkStore.getSnapshot();
    return {
      snapshot,
      restored,
      hubClassArchived: window.courseHub?.getCourseById('remove-class')?.archived === true,
      hubActivityArchived: window.courseHub?.getCourseById('remove-activity')?.archived === true,
      hubEmptyClassArchived: window.courseHub?.getCourseById('remove-empty-class')?.archived === true,
      trash: window.__sutraPublicBetaTestHooks.getTrash().filter((item) => item.kind === 'homework').map((item) => item.title)
    };
  });

  expect(result.snapshot.courses).toEqual([]);
  expect(result.snapshot.tasks).toEqual([]);
  expect(result.restored.courses).toEqual([]);
  expect(result.restored.tasks).toEqual([]);
  expect(result.hubClassArchived).toBe(true);
  expect(result.hubActivityArchived).toBe(true);
  expect(result.hubEmptyClassArchived).toBe(true);
  expect(result.trash).toEqual(expect.arrayContaining(['Biology assignment', 'Robotics assignment']));

  await page.evaluate(async () => { await window.flowAtelier.flushAppSaveNow('homework-course-removal-test'); });
  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await waitForAppReady(page);
  await page.waitForFunction(() => !!window.SutraHomeworkStore && !!window.courseHub);
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch (_) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove('active');
      overlay.style.setProperty('display', 'none', 'important');
    }
    window.setActiveView('homework');
  });
  const afterReload = await page.evaluate(() => ({
    courses: window.SutraHomeworkStore.getSnapshot().courses,
    tasks: window.SutraHomeworkStore.getSnapshot().tasks,
    hubClassArchived: window.courseHub.getCourseById('remove-class')?.archived === true,
    hubActivityArchived: window.courseHub.getCourseById('remove-activity')?.archived === true,
    hubEmptyClassArchived: window.courseHub.getCourseById('remove-empty-class')?.archived === true,
    trash: window.__sutraPublicBetaTestHooks.getTrash().filter((item) => item.kind === 'homework').map((item) => item.title)
  }));
  expect(afterReload.courses).toEqual([]);
  expect(afterReload.tasks).toEqual([]);
  expect(afterReload.hubClassArchived).toBe(true);
  expect(afterReload.hubActivityArchived).toBe(true);
  expect(afterReload.hubEmptyClassArchived).toBe(true);
  expect(afterReload.trash).toEqual(expect.arrayContaining(['Biology assignment', 'Robotics assignment']));
});
