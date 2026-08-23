// API-key session persistence (Section 12).
//
// Locks in the correct (already-shipping) behavior: provider API keys live in
// sessionStorage only, survive a SAME-TAB reload (so the user is not asked for the
// key again), are re-hydrated into the masked input, and are never written to
// localStorage / disk. The reported "asks for key again on reload" bug was an older
// localStorage-era build; this guards against regressing back to it.
import { expect, test } from '@playwright/test';

async function completeOnboarding(page) {
  await page.evaluate(() => {
    try { if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true); } catch (e) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('display', 'none', 'important');
      overlay.style.setProperty('pointer-events', 'none', 'important');
    }
  });
  await expect(page.locator('#studentOnboardingOverlay')).toBeHidden();
}

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await completeOnboarding(page);
  await expect(page.locator('[data-sutra-component="brand-mark"]').first()).toBeVisible();
}

test('a saved API key survives a same-tab reload and is never written to localStorage', async ({ page }) => {
  await openApp(page);
  const KEY = 'sk-groq-session-test-abc123';

  // Save through the real key-save path.
  await page.evaluate((key) => {
    const input = document.getElementById('groqApiKeyInput');
    input.value = key;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('saveChatKeysBtn').click();
  }, KEY);

  // Written to sessionStorage only — not localStorage/disk.
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('groq_api_key'))).toBe(KEY);
  expect(await page.evaluate(() => localStorage.getItem('groq_api_key'))).toBeNull();

  // Same-tab reload preserves sessionStorage, so the key is still present.
  await page.reload();
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await completeOnboarding(page);

  expect(await page.evaluate(() => sessionStorage.getItem('groq_api_key'))).toBe(KEY);
  // Re-hydrated into the masked (type=password) input — not the rendered text.
  await expect(page.locator('#groqApiKeyInput')).toHaveAttribute('type', 'password');
  expect(await page.evaluate(() => document.getElementById('groqApiKeyInput').value)).toBe(KEY);
  // Still session-only after reload.
  expect(await page.evaluate(() => localStorage.getItem('groq_api_key'))).toBeNull();
});

test('a fresh browser context (new tab/window) does NOT inherit the session key', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await openApp(pageA);
  await pageA.evaluate(() => {
    const input = document.getElementById('groqApiKeyInput');
    input.value = 'sk-should-not-leak';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('saveChatKeysBtn').click();
  });
  await expect.poll(() => pageA.evaluate(() => sessionStorage.getItem('groq_api_key'))).toBe('sk-should-not-leak');

  // A separate context simulates an unrelated new tab/window: no inherited key.
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await openApp(pageB);
  expect(await pageB.evaluate(() => sessionStorage.getItem('groq_api_key'))).toBeNull();
  expect(await pageB.evaluate(() => localStorage.getItem('groq_api_key'))).toBeNull();

  await ctxA.close();
  await ctxB.close();
});

test('remembered API keys survive a new page in the same browser profile without entering localStorage', async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  await openApp(first);
  const KEY = 'sk-groq-remembered-device-test-abc123';

  await first.evaluate((key) => {
    const input = document.getElementById('groqApiKeyInput');
    input.value = key;
    document.getElementById('assistantRememberKeysInput').checked = true;
    document.getElementById('saveChatKeysBtn').click();
  }, KEY);
  await expect.poll(() => first.evaluate(() => sessionStorage.getItem('groq_api_key'))).toBe(KEY);
  await expect.poll(() => first.evaluate(async () => {
    const pref = await window.SutraCredentialVault.getPreference('assistantRemember', false);
    return pref;
  })).toBe(true);
  await first.waitForTimeout(250);
  await first.close();

  const second = await context.newPage();
  await openApp(second);
  await expect.poll(() => second.evaluate(() => sessionStorage.getItem('groq_api_key'))).toBe(KEY);
  expect(await second.evaluate(() => localStorage.getItem('groq_api_key'))).toBeNull();
  expect(await second.evaluate(() => document.getElementById('groqApiKeyInput').value)).toBe(KEY);

  const vaultText = await second.evaluate(async () => {
    const request = indexedDB.open('sutra_credentials_db');
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('credentials', 'readonly');
    const rows = await new Promise((resolve, reject) => {
      const get = tx.objectStore('credentials').getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return JSON.stringify(rows);
  });
  expect(vaultText).not.toContain(KEY);
  await context.close();
});
