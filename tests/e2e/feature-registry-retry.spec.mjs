import { expect, test } from '@playwright/test';
import { waitForAppHydrated } from './helpers/app-ready.mjs';

// Route interception must observe both the failed request and its retry.
test.use({ serviceWorkers: 'block' });

test('a failed optional feature script can be retried in the browser', async ({ page }) => {
  await page.goto('/Sutra.html');
  await waitForAppHydrated(page);

  const initial = await page.evaluate(() => ({
    definition: window.SutraFeatureRegistry?.get('business'),
    state: window.SutraFeatureRegistry?.getState('business')
  }));
  expect(initial.definition?.defaultEnabled).toBe(false);
  expect(initial.definition?.scripts?.[0]).toContain('business-workspace.js');
  expect(initial.state).toMatchObject({ enabled: false, loaded: false, initialized: false });

  let requestCount = 0;
  const requestUrls = [];
  await page.route('**/src/features/workspace/business-workspace.js*', async (route) => {
    requestCount += 1;
    requestUrls.push(route.request().url());
    if (requestCount === 1) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  const failedAttempt = await page.evaluate(async () => {
    try {
      await window.SutraFeatureRegistry.enable('business');
      return { error: '', state: window.SutraFeatureRegistry.getState('business') };
    } catch (error) {
      return {
        error: String(error && error.message ? error.message : error),
        state: window.SutraFeatureRegistry.getState('business')
      };
    }
  });

  expect(requestCount, `First attempt: ${JSON.stringify(failedAttempt)}`).toBe(1);
  expect(failedAttempt.error, `First attempt: ${JSON.stringify(failedAttempt)}`).toContain('Optional feature script failed:');
  expect(failedAttempt.state).toMatchObject({ enabled: true, loaded: false, initialized: false });
  expect(await page.locator('script[src*="business-workspace.js"]').count()).toBe(0);

  const retriedState = await page.evaluate(() => window.SutraFeatureRegistry.enable('business'));
  expect(retriedState).toMatchObject({
    enabled: true,
    loaded: true,
    initialized: true,
    error: null
  });
  expect(requestCount).toBe(2);
  expect(requestUrls[1]).toBe(requestUrls[0]);
  expect(await page.evaluate(() => typeof window.NoteFlowBusiness?.init)).toBe('function');

  await page.evaluate(() => window.SutraFeatureRegistry.disable('business'));
  const reenabledState = await page.evaluate(() => window.SutraFeatureRegistry.enable('business'));
  expect(reenabledState).toMatchObject({ enabled: true, loaded: true, initialized: true });
  expect(requestCount).toBe(2);
});

test('an Assistant shell stylesheet that fails before lazy loading can be retried', async ({ page }) => {
  let requestCount = 0;
  await page.route('**/styles/views/assistant-view.css*', async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto('/Sutra.html');
  await waitForAppHydrated(page);
  await page.waitForFunction(() => {
    const state = window.SutraFeatureRegistry?.getState('assistant');
    return state?.loaded === true && state?.initialized === true;
  });

  const result = await page.evaluate(() => {
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .filter((link) => link.href.includes('/styles/views/assistant-view.css'));
    return {
      state: window.SutraFeatureRegistry?.getState('assistant'),
      styleCount: styles.length,
      ruleCount: styles[0]?.sheet?.cssRules.length ?? 0
    };
  });
  expect(result.state).toMatchObject({ enabled: true, loaded: true, initialized: true });
  expect(result.styleCount).toBe(1);
  expect(requestCount).toBe(2);
  expect(result.ruleCount).toBeGreaterThan(0);
});
