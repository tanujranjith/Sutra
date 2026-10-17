import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

test('update advice waits behind onboarding and Radar, then remains dismissible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    sessionStorage.setItem('sutra_intro_played', '1');
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        register: async () => ({ waiting: { postMessage() {} }, addEventListener() {} }),
        addEventListener() {}
      }
    });
  });
  await page.goto('/Sutra.html');
  await waitForAppReady(page);
  const banner = page.locator('#sutraUpdateBanner');
  await expect(banner).toBeAttached();
  await expect(page.getByRole('button', { name: 'Skip setup', exact: true })).toBeVisible();
  await expect(banner).toBeHidden();
  await page.getByRole('button', { name: 'Skip setup', exact: true }).click();
  await expect(banner).toBeVisible();
  await page.evaluate(() => window.openDeadlineRadar());
  await expect(page.locator('#deadlineRadarModal')).toBeVisible();
  await expect(banner).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#deadlineRadarModal')).toBeHidden();
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(banner).toBeHidden();
});

test('update advice does not prevent scrolling to Settings appearance disclosures', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    sessionStorage.setItem('sutra_intro_played', '1');
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        register: async () => ({ waiting: { postMessage() {} }, addEventListener() {} }),
        addEventListener() {}
      }
    });
  });
  await page.goto('/Sutra.html');
  await waitForAppReady(page);
  await page.evaluate(() => {
    try { if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true); } catch {}
    document.body.classList.remove('onboarding-open');
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.classList.remove('active'); overlay.hidden = true; overlay.style.setProperty('display', 'none', 'important'); }
    window.setActiveView('settings');
  });

  const banner = page.locator('#sutraUpdateBanner');
  await expect(banner).toBeVisible();
  await page.locator('[data-settings-nav="appearance"]').click();
  for (const selector of ['#settingsSurfaceDepth', '#settingsInterfaceDetails']) {
    const summary = page.locator(`${selector} > summary`);
    await summary.evaluate(element => {
      const topChrome = document.querySelector('.top-nav[aria-label="Primary workspace views"]');
      const banner = document.getElementById('sutraUpdateBanner');
      if (!topChrome || !banner || banner.hidden || !banner.getClientRects().length) {
        throw new Error('The visible update banner and canonical navigation are required for this reachability check.');
      }

      // On phones Settings switches to page-level scrolling inside #mainContent;
      // find that owning scroller instead of assuming window or the bottom nav.
      let scroller = element.parentElement;
      while (scroller && scroller !== document.body && scroller !== document.documentElement) {
        const overflowY = getComputedStyle(scroller).overflowY;
        if (/(auto|scroll)/.test(overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
        scroller = scroller.parentElement;
      }
      if (!scroller || scroller === document.body || scroller === document.documentElement) scroller = null;

      // Phone CSS hides the desktop header; its empty rect correctly leaves
      // the top edge at zero, while the injected phone nav bounds the bottom.
      const safeTop = topChrome.getBoundingClientRect().bottom + 8;
      const delta = element.getBoundingClientRect().top - safeTop;
      if (scroller) scroller.scrollTop += delta;
      else window.scrollBy(0, delta);
    });

    const reachability = await summary.evaluate(element => {
      const topChrome = document.querySelector('.top-nav[aria-label="Primary workspace views"]');
      const banner = document.getElementById('sutraUpdateBanner');
      const actionBar = document.getElementById('settingsActionBar');
      const bottomNav = document.getElementById('sutraBottomNav');
      const visibleTop = node => node && !node.hidden && node.getClientRects().length
        ? node.getBoundingClientRect().top
        : window.innerHeight;
      const bandTop = topChrome.getBoundingClientRect().bottom;
      const bandBottom = Math.min(visibleTop(banner), visibleTop(actionBar), visibleTop(bottomNav));
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        bannerVisible: !banner.hidden && banner.getClientRects().length > 0,
        summaryInsideFreeBand: rect.top >= bandTop && rect.bottom <= bandBottom,
        hitSummary: hit === element || element.contains(hit)
      };
    });
    expect(reachability).toEqual({ bannerVisible: true, summaryInsideFreeBand: true, hitSummary: true });
    await summary.click();
    await expect(page.locator(selector)).toHaveAttribute('open', '');
    await expect(banner).toBeVisible();
  }
});
