// Static markup/globals precede canonical IndexedDB hydration. This waits only
// for the read-only bootstrap boundary: it must not manufacture a write in a
// fixture that deliberately models a stale second tab.
export async function waitForAppHydrated(page) {
  await page.waitForFunction(() => typeof window.flowAtelier?.flushAppSaveNow === 'function');
  await page.waitForFunction(async () => {
    if (typeof window.loadWorkspaceLocally !== 'function' || !Array.isArray(window.flowAtelier?.pages)) return false;
    return !!(await window.loadWorkspaceLocally());
  });
}

// Ordinary fixtures then cross the public durability seam before changing
// preferences or seeding data.
export async function waitForAppReady(page) {
  await waitForAppHydrated(page);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-app-ready'));
}
