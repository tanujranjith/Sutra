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
    const scrollAttempt = await summary.evaluate((element, selector) => {
      const topChrome = document.querySelector('.top-nav[aria-label="Primary workspace views"]');
      const banner = document.getElementById('sutraUpdateBanner');
      if (!topChrome || !banner || banner.hidden || !banner.getClientRects().length) {
        throw new Error('The visible update banner and canonical navigation are required for this reachability check.');
      }

      // Settings can use a nested or shell-owned scroller depending on the
      // active layout; find the nearest element that can actually scroll.
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
      const owner = scroller || document.scrollingElement;
      const ownerStyle = owner ? getComputedStyle(owner) : null;
      const ownerName = scroller
        ? `${scroller.tagName.toLowerCase()}${scroller.id ? `#${scroller.id}` : ''}${typeof scroller.className === 'string' && scroller.className.trim() ? `.${scroller.className.trim().split(/\s+/).join('.')}` : ''}`
        : 'document.scrollingElement';
      const snapshot = () => ({
        scrollTop: owner ? Math.round(owner.scrollTop * 10) / 10 : null,
        scrollHeight: owner ? owner.scrollHeight : null,
        clientHeight: owner ? owner.clientHeight : null,
        maxScrollTop: owner ? Math.max(0, owner.scrollHeight - owner.clientHeight) : null,
        rect: owner ? (() => {
          const rect = owner.getBoundingClientRect();
          return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) };
        })() : null
      });
      const before = snapshot();
      const summaryTopBefore = Math.round(element.getBoundingClientRect().top * 10) / 10;
      if (scroller) scroller.scrollTop += delta;
      else window.scrollBy(0, delta);
      return {
        selector,
        scrollOwner: ownerName,
        overflowY: ownerStyle?.overflowY || 'unknown',
        scrollBehavior: ownerStyle?.scrollBehavior || 'unknown',
        safeTop: Math.round(safeTop * 10) / 10,
        requestedDelta: Math.round(delta * 10) / 10,
        summaryTopBefore,
        before,
        after: snapshot(),
        summaryTopAfter: Math.round(element.getBoundingClientRect().top * 10) / 10
      };
    }, selector);

    const getReachability = () => summary.evaluate((element, scrollAttempt) => {
      const topChrome = document.querySelector('.top-nav[aria-label="Primary workspace views"]');
      const banner = document.getElementById('sutraUpdateBanner');
      const actionBar = document.getElementById('settingsActionBar');
      const bottomNav = document.getElementById('sutraBottomNav');
      const visibleTop = node => node && !node.hidden && node.getClientRects().length
        ? node.getBoundingClientRect().top
        : window.innerHeight;
      let liveScroller = element.parentElement;
      while (liveScroller && liveScroller !== document.body && liveScroller !== document.documentElement) {
        const overflowY = getComputedStyle(liveScroller).overflowY;
        if (/(auto|scroll)/.test(overflowY) && liveScroller.scrollHeight > liveScroller.clientHeight) break;
        liveScroller = liveScroller.parentElement;
      }
      if (!liveScroller || liveScroller === document.body || liveScroller === document.documentElement) liveScroller = null;
      const liveOwner = liveScroller || document.scrollingElement;
      const liveOwnerStyle = liveOwner ? getComputedStyle(liveOwner) : null;
      const liveOwnerRect = liveOwner?.getBoundingClientRect();
      const liveOwnerName = liveScroller
        ? `${liveScroller.tagName.toLowerCase()}${liveScroller.id ? `#${liveScroller.id}` : ''}${typeof liveScroller.className === 'string' && liveScroller.className.trim() ? `.${liveScroller.className.trim().split(/\s+/).join('.')}` : ''}`
        : 'document.scrollingElement';
      const rectOf = node => {
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return Object.fromEntries(['top', 'right', 'bottom', 'left', 'width', 'height'].map(key => [key, Math.round(rect[key] * 10) / 10]));
      };
      const bandTop = topChrome.getBoundingClientRect().bottom;
      const bandBottom = Math.min(visibleTop(banner), visibleTop(actionBar), visibleTop(bottomNav));
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        bannerVisible: !banner.hidden && banner.getClientRects().length > 0,
        summaryInsideFreeBand: rect.top >= bandTop && rect.bottom <= bandBottom,
        hitSummary: hit === element || element.contains(hit),
        selector: scrollAttempt.selector,
        viewport: { width: window.innerWidth, height: window.innerHeight, scrollY: Math.round(window.scrollY * 10) / 10 },
        bodyClasses: document.body.className,
        scrollPaddingBottom: liveOwnerStyle?.paddingBottom || 'unknown',
        bannerHeightCap: getComputedStyle(document.body).getPropertyValue('--settings-mobile-update-banner-max-height').trim(),
        settingsPagePaddingBottom: getComputedStyle(document.querySelector('#view-settings .cc-page')).paddingBottom,
        scrollAttempt,
        liveScrollOwner: {
          name: liveOwnerName,
          overflowY: liveOwnerStyle?.overflowY || 'unknown',
          scrollBehavior: liveOwnerStyle?.scrollBehavior || 'unknown',
          scrollTop: liveOwner ? Math.round(liveOwner.scrollTop * 10) / 10 : null,
          scrollHeight: liveOwner?.scrollHeight ?? null,
          clientHeight: liveOwner?.clientHeight ?? null,
          maxScrollTop: liveOwner ? Math.max(0, liveOwner.scrollHeight - liveOwner.clientHeight) : null,
          rect: liveOwnerRect ? { top: Math.round(liveOwnerRect.top), bottom: Math.round(liveOwnerRect.bottom), height: Math.round(liveOwnerRect.height) } : null
        },
        geometry: {
          summary: rectOf(element),
          topChrome: rectOf(topChrome),
          banner: rectOf(banner),
          actionBar: rectOf(actionBar),
          bottomNav: rectOf(bottomNav),
          freeBand: { top: Math.round(bandTop * 10) / 10, bottom: Math.round(bandBottom * 10) / 10 },
          hitTarget: hit ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}${typeof hit.className === 'string' && hit.className.trim() ? `.${hit.className.trim().split(/\s+/).join('.')}` : ''}` : null
        }
      };
    }, scrollAttempt);
    let latestReachability;
    try {
      await expect.poll(async () => {
        latestReachability = await getReachability();
        const { bannerVisible, summaryInsideFreeBand, hitSummary } = latestReachability;
        return { bannerVisible, summaryInsideFreeBand, hitSummary };
      }, { timeout: 10_000 }).toEqual({ bannerVisible: true, summaryInsideFreeBand: true, hitSummary: true });
    } catch (cause) {
      const geometry = latestReachability ? JSON.stringify(latestReachability) : 'unavailable';
      const original = cause instanceof Error ? `${cause.name}: ${cause.message}\n${cause.stack || ''}` : String(cause);
      throw new Error(`Settings update-banner reachability geometry: ${geometry}\nOriginal failure:\n${original}`, { cause });
    }
    await summary.click();
    await expect(page.locator(selector)).toHaveAttribute('open', '');
    await expect(banner).toBeVisible();
  }
});
