import { expect, test } from '@playwright/test';

async function openHomework(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await page.waitForFunction(() => window.SutraHomework && window.SutraHomeworkStore && typeof window.setActiveView === 'function');
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch (_) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove('active');
      overlay.style.setProperty('display', 'none', 'important');
    }
    document.body.classList.remove('onboarding-open');
    window.setActiveView('homework');
    const setup = document.getElementById('hwSetupOverlay');
    if (setup) {
      setup.hidden = true;
      setup.classList.remove('active');
      setup.style.setProperty('display', 'none', 'important');
    }
  });
}

test('an extracurricular icon can be chosen and survives reload', async ({ page }) => {
  await openHomework(page);
  await page.evaluate(() => {
    const snapshot = window.SutraHomeworkStore.getSnapshot();
    window.SutraHomeworkStore.replace({
      ...snapshot,
      courses: snapshot.courses.concat([{ id: 'icon-robotics', name: 'Robotics', type: 'misc' }])
    }, { reason: 'course-icon-test-seed' });
    window.dispatchEvent(new CustomEvent('homework:updated'));
  });

  const trigger = page.locator('[data-course-icon="icon-robotics"]');
  await expect(trigger).toBeVisible();
  await expect(trigger.locator('i')).toHaveClass(/fa-users/);

  await trigger.click();
  const picker = page.locator('#hwCourseIconModal');
  await expect(picker).toBeVisible();
  await expect(picker.locator('[role="dialog"]')).toHaveAttribute('aria-modal', 'true');
  await picker.locator('[data-course-icon-choice="robot"]').click();

  await expect(trigger.locator('i')).toHaveClass(/fa-robot/);
  await expect.poll(() => page.evaluate(() => {
    return window.SutraHomeworkStore.getSnapshot().courses.find(course => course.id === 'icon-robotics')?.icon;
  })).toBe('robot');
  await page.evaluate(() => window.SutraHomeworkStore.whenPersisted());

  await page.reload();
  await openHomework(page);
  await expect(page.locator('[data-course-icon="icon-robotics"] i')).toHaveClass(/fa-robot/);
});
