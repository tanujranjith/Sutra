import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

test.use({ serviceWorkers: 'block' });

async function openSettings(page) {
  await page.addInitScript(() => { sessionStorage.setItem('sutra_intro_played', '1'); });
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await waitForAppReady(page);
  await page.evaluate(() => {
    try { if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true); } catch {}
    document.body.classList.remove('onboarding-open');
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.classList.remove('active'); overlay.hidden = true; overlay.style.setProperty('display', 'none', 'important'); }
    window.setActiveView('settings');
  });
  await expect(page.locator('#view-settings')).toBeVisible();
}

test('Settings search refreshes cached metadata and excludes typed field values', async ({ page }) => {
  await openSettings(page);
  const search = page.locator('#settingsSearchInput');

  // Repeated queries reuse the candidate cache while ranking against the new
  // query each time. These are normal controls on the real Settings page.
  await search.fill('quiet hours');
  await expect(page.getByRole('button', { name: /^Quiet hours, Notifications\./ })).toBeVisible();
  await search.fill('save automatically');
  await expect(page.getByRole('button', { name: /^Autosave interval, Editor\./ })).toBeVisible();
  await search.fill('quiet hours');
  await expect(page.getByRole('button', { name: /^Quiet hours, Notifications\./ })).toBeVisible();

  // Create the row after the first search has populated the cache. Search
  // results must discover it and navigate focus to its actual control.
  await page.locator('[data-settings-section="appearance"] .cc-appearance-foundation').evaluate(container => {
    const row = document.createElement('div');
    row.className = 'cc-row';
    row.setAttribute('data-setting-item', '');
    row.id = 'settingsSyntheticSearchRow';

    const text = document.createElement('div');
    text.className = 'cc-row-text';
    const label = document.createElement('span');
    label.className = 'cc-row-name';
    label.id = 'settingsSyntheticSearchLabel';
    label.textContent = 'Primrose lab preference';
    text.append(label);

    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'cc-btn cc-btn-ghost';
    control.id = 'settingsSyntheticSearchControl';
    control.setAttribute('aria-label', 'Select synthetic preference');
    control.textContent = 'Select';

    const controls = document.createElement('div');
    controls.className = 'cc-row-control';
    controls.append(control);
    row.append(text, controls);
    container.append(row);
  });

  await search.fill('primrose');
  const insertedResult = page.getByRole('button', { name: /^Primrose lab preference, Appearance\./ });
  await expect(insertedResult).toBeVisible();
  await insertedResult.click();
  await expect(page.locator('#settingsSyntheticSearchControl')).toBeFocused();

  // Label-only changes invalidate the cached candidate metadata as well.
  await page.locator('#settingsSyntheticSearchLabel').evaluate(label => {
    label.textContent = 'Marigold lab preference';
  });
  await search.fill('primrose');
  await expect(page.locator('#settingsSearchResults')).toBeHidden();
  await expect(page.locator('#settingsSearchEmpty')).toBeVisible();
  await search.fill('marigold');
  const renamedResult = page.getByRole('button', { name: /^Marigold lab preference, Appearance\./ });
  await expect(renamedResult).toBeVisible();
  await renamedResult.click();
  await expect(page.locator('#settingsSyntheticSearchControl')).toBeFocused();

  await page.locator('#settingsSyntheticSearchRow').evaluate(row => row.remove());
  await search.fill('marigold');
  await expect(page.locator('#settingsSearchResults')).toBeHidden();
  await expect(page.locator('#settingsSearchEmpty')).toBeVisible();

  // Search indexes field labels and help, never current credential or input
  // values. Assign values directly so this regression cannot submit a key.
  const apiKeySentinel = 'vqxjrmplkz';
  const textSentinel = 'zrkpvtlqmx';
  await page.locator('#openaiApiKeyInput').evaluate((input, value) => { input.value = value; }, apiKeySentinel);
  await page.locator('[data-pref-path="assistant.localEndpoint.model"]').evaluate((input, value) => { input.value = value; }, textSentinel);
  await expect(page.locator('#openaiApiKeyInput')).toHaveValue(apiKeySentinel);
  await expect(page.locator('[data-pref-path="assistant.localEndpoint.model"]')).toHaveValue(textSentinel);

  for (const sentinel of [apiKeySentinel, textSentinel]) {
    await search.fill(sentinel);
    await expect(page.locator('#settingsSearchResults')).toBeHidden();
    await expect(page.locator('#settingsSearchEmpty')).toBeVisible();
  }
});
