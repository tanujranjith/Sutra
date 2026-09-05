// Static markup/globals precede canonical IndexedDB hydration. Fixtures must
// cross the public durability seam before changing preferences or seeding data.
export async function waitForAppReady(page) {
  await page.waitForFunction(() => typeof window.flowAtelier?.flushAppSaveNow === 'function');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-app-ready'));
}
