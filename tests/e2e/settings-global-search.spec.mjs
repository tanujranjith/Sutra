import { expect, test } from '@playwright/test';

test('Settings search shows matches across categories and restores the selected category when cleared', async ({ page }) => {
  await page.addInitScript(() => { sessionStorage.setItem('sutra_intro_played', '1'); });
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.evaluate(() => {
    try { if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true); } catch {}
    document.body.classList.remove('onboarding-open');
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.classList.remove('active'); overlay.hidden = true; overlay.style.setProperty('display', 'none', 'important'); }
    window.setActiveView('settings');
  });

  await page.fill('#settingsSearchInput', 'focus');
  const searchState = await page.evaluate(() => ({
    hint: document.getElementById('settingsSearchHint').textContent,
    visibleSections: [...document.querySelectorAll('#view-settings [data-settings-section]')]
      .filter(section => getComputedStyle(section).display !== 'none')
      .map(section => section.getAttribute('data-settings-section'))
  }));
  expect(searchState.hint).toMatch(/across/i);
  expect(searchState.visibleSections.length).toBeGreaterThan(1);

  await page.fill('#settingsSearchInput', '');
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll('#view-settings [data-settings-section]')]
      .filter(section => getComputedStyle(section).display !== 'none').length
  )).toBe(1);
});
