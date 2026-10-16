import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

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

test('update notice leaves Settings Save and Revert reachable on desktop and phone', async ({ page }) => {
  await openSettings(page);
  // The notice is presentation-only; avoid depending on a live SW upgrade.
  await page.evaluate(() => {
    const banner = document.createElement('div');
    banner.className = 'sutra-update-banner';
    banner.textContent = 'A new Sutra version is ready. Your workspace stays saved locally.';
    document.body.appendChild(banner);
  });
  for (const viewport of [{ width: 1642, height: 966 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    if (viewport.width < 640 && await page.locator('#settingsBackToCategories').isVisible()) {
      await page.locator('#settingsBackToCategories').click();
    }
    await page.locator('[data-settings-nav="appearance"]').click();
    await page.locator('[data-pref-path="appearance.density"] [data-value="spacious"]').click();
    const clearance = await page.evaluate(() => {
      const banner = document.querySelector('.sutra-update-banner:not([hidden])').getBoundingClientRect();
      return ['settingsApplyBtn', 'settingsRevertBtn'].map(id => {
        const button = document.getElementById(id);
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { clear: banner.bottom <= rect.top, reachable: hit === button || button.contains(hit) };
      });
    });
    expect(clearance).toEqual([{ clear: true, reachable: true }, { clear: true, reachable: true }]);
    await page.locator('#settingsRevertBtn').click();
    await expect(page.locator('#settingsActionBar')).toHaveAttribute('data-pending', 'false');
    if (viewport.width < 640) await page.locator('#settingsBackToCategories').click();
  }
});

test('Settings hierarchy keeps everyday controls visible and advanced packs disclosed on demand', async ({ page }) => {
  await openSettings(page);

  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('[data-settings-nav]')).toHaveCount(16);
  await expect(page.locator('.cc-sidebar-group-label')).toHaveText([
    'Personalization',
    'Productivity',
    'Services'
  ]);
  await expect(page.locator('#settingsAdvancedGroup')).not.toHaveAttribute('open', '');
  await expect(page.locator('.cc-preview-rail')).toBeVisible();

  await page.locator('#settingsAdvancedGroup summary').click();
  await expect(page.locator('[data-settings-nav="business"]')).toBeVisible();
  await page.locator('[data-settings-nav="business"]').click();
  await expect(page.locator('#settingsAdvancedGroup')).toHaveAttribute('open', '');
  await expect(page.locator('[data-settings-section="business"]')).toBeVisible();
  await expect(page.locator('.cc-preview-rail')).toBeHidden();
  await expect(page.locator('.cc-body')).toHaveAttribute('data-preview', 'false');
});

test('Settings search supports results, recovery, clear, and keyboard focus', async ({ page }) => {
  await openSettings(page);

  await page.fill('#settingsSearchInput', 'focus');
  const searchState = await page.evaluate(() => ({
    hint: document.getElementById('settingsSearchHint').textContent,
    visibleSections: [...document.querySelectorAll('#view-settings [data-settings-section]')]
      .filter(section => getComputedStyle(section).display !== 'none')
      .map(section => section.getAttribute('data-settings-section'))
  }));
  expect(searchState.hint).toMatch(/across/i);
  expect(searchState.visibleSections.length).toBeGreaterThan(1);
  await expect(page.locator('#settingsSearchClearBtn')).toBeVisible();
  await expect(page.locator('#settingsSearchShortcut')).toBeHidden();

  // Both terms are absent from the Settings index; avoid common words such
  // as "no" that can validly produce partial matches.
  await page.fill('#settingsSearchInput', 'purple elephant');
  await expect(page.locator('#settingsSearchEmpty')).toBeVisible();
  await expect(page.locator('#settingsSearchHint')).toHaveText('0 matches across 0 categories.');
  await page.locator('#settingsSearchEmptyClearBtn').click();

  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll('#view-settings [data-settings-section]')]
      .filter(section => getComputedStyle(section).display !== 'none').length
  )).toBe(1);
  await expect(page.locator('#settingsSearchInput')).toBeFocused();

  await page.getByRole('heading', { name: 'Settings', exact: true }).click();
  await page.keyboard.press('/');
  await expect(page.locator('#settingsSearchInput')).toBeFocused();
  await page.fill('#settingsSearchInput', 'calendar');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsSearchInput')).toHaveValue('');
  await expect(page.locator('#settingsSearchInput')).toBeFocused();
});

test('Settings search understands everyday phrases and typos, then focuses the real control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings(page);

  await page.fill('#settingsSearchInput', 'turn on dark mode');
  await expect(page.locator('#settingsSearchResults')).toBeVisible();
  await expect(page.locator('#settingsSearchEmpty')).toBeHidden();
  const themeResult = page.locator('#settingsSearchResults .cc-search-result-button').filter({ hasText: 'Theme' }).first();
  await expect(themeResult).toContainText('Appearance');
  await expect(page.locator('#settingsSearchResults .cc-search-result-button').filter({ hasText: /^Density/ })).toHaveCount(0);
  await expect(page.locator('#settingsSearchResults .cc-search-result-category').first()).toHaveText('Appearance');
  await themeResult.click();
  await expect(page.locator('#settingsChooseThemeBtn')).toBeFocused();
  const targetState = await page.locator('#settingsChooseThemeBtn').evaluate(control => ({
    highlighted: control.closest('[data-setting-item]')?.classList.contains('is-search-target') === true,
    section: control.closest('[data-settings-section]')?.getAttribute('data-settings-section')
  }));
  expect(targetState).toEqual({ highlighted: true, section: 'appearance' });
  await page.locator('#settingsSearchInput').focus();
  await page.keyboard.press('ArrowDown');
  await expect(themeResult).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#settingsChooseThemeBtn')).toBeFocused();

  await page.fill('#settingsSearchInput', 'calender');
  await expect(page.locator('#settingsSearchResults')).toBeVisible();
  await expect(page.locator('#settingsSearchResults')).toContainText('Calendar');
  await expect(page.locator('#settingsSearchEmpty')).toBeHidden();

  await page.fill('#settingsSearchInput', 'save automatically');
  await expect(page.locator('#settingsSearchResults')).toContainText('Autosave interval');
  await expect(page.locator('#settingsSearchEmpty')).toBeHidden();
  await page.locator('#settingsSearchResults .cc-search-result-button').filter({ hasText: 'Autosave interval' }).click();
  const autosave = page.locator('[data-pref-path="editor.autosaveMs"]');
  const autosaveTrigger = autosave.locator('xpath=..').locator('.nf-select-trigger');
  await expect(autosaveTrigger).toBeFocused();
  await autosaveTrigger.click();
  // The enhancer keeps the native select beside its custom listbox. Choose
  // the visible custom option that the student interacted with.
  await page.locator('.nf-select-menu.is-open').getByRole('option', { name: '8 s', exact: true }).click();
  await expect(autosave.locator('xpath=ancestor::*[@data-setting-item]')).toHaveClass(/is-dirty/);

  await page.fill('#settingsSearchInput', 'backup password');
  await expect(page.locator('#settingsSearchResults')).toContainText('Encrypted Workspace Backup');
  await expect(page.locator('#settingsSearchEmpty')).toBeHidden();
  await expect(page.locator('[data-setting-item]').filter({ has: page.locator('.cc-row-name').filter({ hasText: /^Recent messages$/ }) })).toBeHidden();
  await page.locator('#settingsSearchResults .cc-search-result-button').filter({ hasText: 'Encrypted Workspace Backup' }).click();
  await expect(page.locator('#exportAtelierWorkspaceBtn')).toBeFocused();

  await page.locator('#settingsBackToCategories').click();
  await page.locator('[data-settings-nav="editor"]').click();
  await expect(autosave).toHaveValue('8000');
  await expect(autosave.locator('xpath=ancestor::*[@data-setting-item]')).toHaveClass(/is-dirty/);
});

test('Settings mobile hierarchy stays contained and keeps the canonical Save and Revert bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings(page);

  await expect(page.locator('#settingsCategorySelect')).toBeHidden();
  await expect(page.locator('.cc-sidebar')).toBeVisible();
  await expect(page.locator('.cc-main')).toBeHidden();
  await page.locator('[data-settings-nav="appearance"]').click();
  await expect(page.locator('.cc-sidebar')).toBeHidden();
  await expect(page.locator('#settingsBackToCategories')).toBeVisible();
  await expect(page.locator('[data-settings-section="appearance"] .cc-section-title')).toBeFocused();
  await expect(page.locator('.cc-page-header-actions')).toBeHidden();
  const mobileLayout = await page.evaluate(() => {
    const discovery = document.querySelector('#view-settings .cc-discovery');
    const body = document.querySelector('#view-settings .cc-body');
    const section = document.querySelector('[data-settings-section="appearance"]');
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      searchBeforeBody: !!discovery && !!body && (discovery.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      firstSectionTop: section?.getBoundingClientRect().top ?? Infinity,
      optionGroups: [...document.querySelectorAll('#settingsCategorySelect optgroup')].map(group => group.label)
    };
  });
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
  expect(mobileLayout.searchBeforeBody).toBe(true);
  expect(mobileLayout.firstSectionTop).toBeLessThan(450);
  expect(mobileLayout.optionGroups).toEqual([
    'Personalization',
    'Productivity',
    'Services',
    'Advanced & packs'
  ]);

  await page.locator('[data-pref-path="appearance.density"] [data-value="compact"]').click();
  await expect(page.locator('#settingsActionBar')).toHaveAttribute('data-pending', 'true');
  await expect(page.locator('#settingsApplyBtn')).toBeEnabled();
  await page.locator('#settingsApplyBtn').scrollIntoViewIfNeeded();
  const saveClearance = await page.locator('#settingsApplyBtn').evaluate(button => {
    const rect = button.getBoundingClientRect();
    const nav = document.getElementById('sutraBottomNav');
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      aboveNavigation: !!nav && rect.bottom <= nav.getBoundingClientRect().top,
      receivesClick: hit === button || button.contains(hit)
    };
  });
  expect(saveClearance).toEqual({ aboveNavigation: true, receivesClick: true });
  await page.locator('#settingsBackToCategories').click();
  await expect(page.locator('#settingsActionBar')).toHaveAttribute('data-pending', 'true');
  await page.locator('[data-settings-nav="appearance"]').click();
  await expect(page.locator('[data-pref-path="appearance.density"] [data-value="compact"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#settingsRevertBtn').click();
  await expect(page.locator('#settingsActionBar')).toHaveAttribute('data-pending', 'false');

  await page.locator('#settingsBackToCategories').click();
  await expect(page.locator('[data-settings-nav="appearance"]')).toBeFocused();
  await page.locator('[data-settings-nav="data"]').click();
  await expect(page.locator('[data-settings-section="data"]')).toBeVisible();
  await page.locator('#settingsBackToCategories').click();
  await page.fill('#settingsSearchInput', 'purple elephant');
  await expect(page.locator('#settingsSearchEmpty')).toBeVisible();
  await expect(page.locator('#settingsBackToCategories')).toBeVisible();
  await page.locator('#settingsBackToCategories').click();
  await expect(page.locator('#settingsSearchInput')).toHaveValue('');
  await expect(page.locator('.cc-sidebar')).toBeVisible();
});

test('Appearance keeps its preview inline and reflects staged values, Revert, Save, and reload', async ({ page }) => {
  await page.setViewportSize({ width: 1488, height: 1058 });
  await openSettings(page);
  const preview = page.locator('#settingsPreviewSurface');
  const density = page.locator('[data-pref-path="appearance.density"]');
  const originalDensity = await preview.getAttribute('data-density');
  const nextDensity = originalDensity === 'compact' ? 'spacious' : 'compact';
  const bodyDensity = await page.locator('body').getAttribute('data-ui-density');

  await expect(page.locator('#settingsSurfaceDepth')).not.toHaveAttribute('open', '');
  await expect(page.locator('#settingsInterfaceDetails')).not.toHaveAttribute('open', '');
  const layout = await page.evaluate(() => {
    const main = document.querySelector('#view-settings .cc-main');
    const inlinePreview = document.querySelector('.cc-workspace-preview');
    const controls = document.querySelector('[data-settings-section="appearance"]');
    return {
      previewInMain: main.contains(inlinePreview),
      belowControls: inlinePreview.getBoundingClientRect().top >= controls.getBoundingClientRect().bottom,
      sectionOverflow: getComputedStyle(controls).overflowY,
      columns: getComputedStyle(document.querySelector('#view-settings .cc-page')).gridTemplateColumns.split(' ').length
    };
  });
  expect(layout).toEqual({ previewInMain: true, belowControls: true, sectionOverflow: 'visible', columns: 2 });

  await density.locator(`[data-value="${nextDensity}"]`).click();
  await expect(preview).toHaveAttribute('data-density', nextDensity);
  await expect(page.locator('body')).toHaveAttribute('data-ui-density', bodyDensity);
  await expect(page.locator('#settingsActionBar')).toHaveAttribute('data-pending', 'true');
  await page.locator('#settingsRevertBtn').click();
  await expect(preview).toHaveAttribute('data-density', originalDensity);

  await page.locator('#settingsSurfaceDepth summary').click();
  await page.locator('[data-pref-path="appearance.cardStyle"] [data-value="minimal"]').click();
  await expect(preview).toHaveAttribute('data-card-style', 'minimal');
  await expect(page.locator('#settingsSurfaceSummary')).toContainText('Minimal');
  await page.locator('#settingsRevertBtn').click();

  await page.locator('.cc-workspace-preview summary').click();
  await expect(preview).toBeHidden();
  await page.locator('.cc-workspace-preview summary').click();
  await expect(preview).toBeVisible();

  await density.locator(`[data-value="${nextDensity}"]`).click();
  await page.locator('#settingsApplyBtn').click();
  await expect(page.locator('#settingsActionBar')).toHaveAttribute('data-pending', 'false');
  await expect(page.locator('body')).toHaveAttribute('data-ui-density', nextDensity);
  await page.reload();
  await waitForAppReady(page);
  await page.evaluate(() => window.setActiveView('settings'));
  await expect(preview).toHaveAttribute('data-density', nextDensity);
});

test('Settings search reveals collapsed appearance controls and restores disclosures', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('#settingsSurfaceDepth')).not.toHaveAttribute('open', '');
  await page.fill('#settingsSearchInput', 'blur');
  await expect(page.locator('#settingsSurfaceDepth')).toHaveAttribute('open', '');
  await expect(page.locator('[data-pref-path="appearance.blurIntensity"]')).toBeVisible();
  await page.locator('#settingsSearchClearBtn').click();
  await expect(page.locator('#settingsSurfaceDepth')).not.toHaveAttribute('open', '');
});

test('Settings palette mirrors the supported theme panel selection', async ({ page }) => {
  await openSettings(page);
  await page.locator('#settingsChooseThemeBtn').click();
  await expect(page.locator('#themePanel')).toHaveClass(/active/);
  await page.locator('#themePanel .preset-card[data-theme="botanical"]').click();
  await expect(page.locator('#settingsThemeCurrent')).toHaveText('Botanical');
  await expect(page.locator('#settingsThemePalette .is-selected')).toHaveAttribute('title', 'Botanical');
  await expect(page.locator('#settingsActionBar')).toHaveAttribute('data-pending', 'false');
});

test('Settings remains contained at 320px with appearance disclosures expanded', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openSettings(page);
  await page.locator('[data-settings-nav="appearance"]').click();
  await page.locator('#settingsSurfaceDepth summary').click();
  await page.locator('#settingsInterfaceDetails summary').click();
  const sizes = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    targets: [...document.querySelectorAll('[data-settings-section="appearance"] .cc-segment')]
      .map(button => button.getBoundingClientRect().height)
  }));
  expect(sizes.page).toBeLessThanOrEqual(sizes.viewport + 1);
  sizes.targets.forEach(height => expect(height).toBeGreaterThanOrEqual(44));
  await page.locator('[data-pref-path="appearance.density"] [data-value="compact"]').click();
  const save = await page.locator('#settingsApplyBtn').evaluate(button => {
    const rect = button.getBoundingClientRect();
    const nav = document.querySelector('nav[aria-label="Primary navigation"]');
    return {
      hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('button')?.id,
      bottom: rect.bottom,
      navTop: nav.getBoundingClientRect().top
    };
  });
  expect(save.hit).toBe('settingsApplyBtn');
  expect(save.bottom).toBeLessThan(save.navTop);
  await page.locator('#settingsApplyBtn').click();
  await expect(page.locator('#settingsActionBar')).toHaveAttribute('data-pending', 'false');
});
