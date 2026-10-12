import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

async function openStudentApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await waitForAppReady(page);
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch (_) {}
    const onboarding = document.getElementById('studentOnboardingOverlay');
    if (onboarding) {
      onboarding.hidden = true;
      onboarding.classList.remove('active');
      onboarding.style.setProperty('display', 'none', 'important');
    }
    document.body.classList.remove('onboarding-open');
  });
  await page.waitForFunction(() => !!window.SutraHomework && !!window.SutraHomeworkStore);
  await page.evaluate(async () => {
    const store = window.SutraHomeworkStore;
    store.replace({
      ...store.getSnapshot(),
      courses: [
        { id: 'capture-chemistry', name: 'Chemistry', type: 'class' },
        { id: 'capture-robotics', name: 'Robotics Club', type: 'misc' }
      ],
      tasks: []
    }, { reason: 'student-activity-capture-test-seed' });
    window.dispatchEvent(new CustomEvent('homework:updated'));
    const seededCourses = window.SutraHomework.getCourses();
    if (!seededCourses.some(course => course.id === 'capture-chemistry' && course.type === 'class')
      || !seededCourses.some(course => course.id === 'capture-robotics' && course.type === 'misc')) {
      throw new Error('Quick Capture seed did not reach the canonical Homework course facade.');
    }
    await window.flowAtelier.flushAppSaveNow('student-activity-capture-test-seed');
  });
}

async function openRoboticsCapture(page) {
  await page.evaluate(() => window.openQuickCaptureModal('Robotics Club do the showcase revisions due Friday', { type: 'homework' }));
  const modal = page.locator('#quickCaptureModal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#quickCaptureType')).toHaveValue('homework');
  await expect(modal.locator('#quickCaptureCourse')).toBeVisible();
  await expect(modal.locator('#quickCaptureCourse option[value="capture-robotics"]')).toContainText(/Activity/i);
  return modal;
}

async function savedCaptureCourseId(page) {
  return page.evaluate(() => {
    const snapshot = window.SutraHomeworkStore.getSnapshot();
    const task = (snapshot.tasks || []).find(item => /showcase revisions/i.test(String(item.title || item.text || '')));
    return task ? task.courseId : null;
  });
}

test('Quick Capture infers an existing activity and preserves its course link after reload', async ({ page }) => {
  await openStudentApp(page);
  const modal = await openRoboticsCapture(page);

  await expect(modal.locator('#quickCaptureCourse')).toHaveValue('capture-robotics');
  await modal.locator('#quickCaptureSubmitBtn').click();
  await expect(modal).toBeHidden();
  await expect.poll(() => savedCaptureCourseId(page)).toBe('capture-robotics');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('student-activity-capture-test-save'));

  await page.reload();
  await waitForAppReady(page);
  await expect.poll(() => savedCaptureCourseId(page)).toBe('capture-robotics');
});

test('a student-selected class overrides the activity inferred from Quick Capture text', async ({ page }) => {
  await openStudentApp(page);
  const modal = await openRoboticsCapture(page);

  await modal.locator('#quickCaptureCourse').selectOption('capture-chemistry');
  await expect(modal.locator('#quickCaptureCourse')).toHaveValue('capture-chemistry');
  await modal.locator('#quickCaptureSubmitBtn').click();
  await expect(modal).toBeHidden();
  await expect.poll(() => savedCaptureCourseId(page)).toBe('capture-chemistry');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('student-activity-capture-manual-override'));

  await page.reload();
  await waitForAppReady(page);
  await expect.poll(() => savedCaptureCourseId(page)).toBe('capture-chemistry');
});
