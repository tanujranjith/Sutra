import { expect, test } from '@playwright/test';

const PASS = 'correct horse battery staple';
const SOURCE = '<!doctype html>\n<html><head><style>body{color:#345}</style></head><body><main id="html-transfer-sentinel">HTML transfer sentinel</main></body></html>';

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await page.waitForFunction(() => !!window.flowAtelier && !!window.SutraHTMLPages && !!window.SutraEncryptedBackups);
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch (error) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('display', 'none', 'important');
      overlay.style.setProperty('pointer-events', 'none', 'important');
    }
  });
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('html-transfer-app-ready'));
}

async function acceptRestoreConflictChooser(page) {
  await page.locator('.sutra-modal-overlay button', { hasText: 'Restore backup' }).click({ timeout: 20_000 });
}

test('HTML identity survives an unencrypted workspace package round trip', async ({ page }) => {
  await openApp(page);

  const exported = await page.evaluate(async ({ source }) => {
    const created = window.SutraHTMLPages.createPage('HTML transfer package', { source });
    created.pageMode = {
      enabled: true,
      size: 'a4',
      margins: { top: 20, right: 21, bottom: 22, left: 23 }
    };
    await window.saveWorkspaceLocally();
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const exportedPage = payload.pages.find((item) => item.id === created.id);
    const packaged = await window.__sutraPublicBetaTestHooks.createLegacyWorkspacePackageBlob(payload);
    const packageBytes = new Uint8Array(await packaged.blob.arrayBuffer());
    const zip = await window.JSZip.loadAsync(packageBytes);
    const workspaceJson = JSON.parse(await zip.file('workspace.json').async('text'));
    const packagedPage = workspaceJson.pages.find((item) => item.id === created.id);

    window.deserializeWorkspace({ ...payload, pages: payload.pages.filter((item) => item.id !== created.id) });
    await window.saveWorkspaceLocally();
    return {
      id: created.id,
      packageBytes: Array.from(packageBytes),
      exportedPage,
      packagedPage
    };
  }, { source: SOURCE });

  expect(exported.exportedPage.htmlDocument.source).toBe(SOURCE);
  expect(exported.packagedPage.htmlDocument.source).toBe(SOURCE);
  expect(exported.packagedPage.id).toBe(exported.id);
  expect(exported.packagedPage.title).toBe('HTML transfer package');
  expect(exported.packagedPage.pageMode).toEqual(exported.exportedPage.pageMode);

  await page.setInputFiles('#fileInput', {
    name: 'html-transfer.atelier',
    mimeType: 'application/zip',
    buffer: Buffer.from(exported.packageBytes)
  });
  await acceptRestoreConflictChooser(page);
  await expect.poll(() => page.evaluate((id) => {
    return window.flowAtelier.pages.find((item) => item.id === id)?.htmlDocument?.source || '';
  }, exported.id), { timeout: 20_000 }).toBe(SOURCE);

  const restored = await page.evaluate(async (id) => {
    const live = window.flowAtelier.pages.find((item) => item.id === id);
    const durable = (await window.loadWorkspaceLocally())?.pages?.find((item) => item.id === id);
    window.loadPage(id);
    return {
      live,
      durable,
      detected: !!window.SutraHTMLPages.getCurrentPage(),
      htmlSurfaceVisible: document.getElementById('htmlPageEditor')?.hidden === false
    };
  }, exported.id);

  expect(restored.live.htmlDocument.source).toBe(SOURCE);
  expect(restored.durable.htmlDocument.source).toBe(SOURCE);
  expect(restored.live.id).toBe(exported.id);
  expect(restored.live.title).toBe('HTML transfer package');
  expect(restored.live.pageMode).toMatchObject({
    enabled: true,
    size: 'a4',
    margins: { top: 20, right: 21, bottom: 22, left: 23 }
  });
  expect(restored.detected).toBe(true);
  expect(restored.htmlSurfaceVisible).toBe(true);
  await expect(page.locator('#htmlPageEditor')).toBeVisible();
});

test('HTML identity survives the encrypted .sutra package and durable restore boundaries', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);

  const exported = await page.evaluate(async ({ pass, source }) => {
    const created = window.SutraHTMLPages.createPage('Encrypted HTML transfer', { source });
    created.pageMode = {
      enabled: true,
      size: 'a4',
      margins: { top: 20, right: 21, bottom: 22, left: 23 }
    };
    await window.saveWorkspaceLocally();

    const live = window.flowAtelier.pages.find((item) => item.id === created.id);
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const payloadPage = payload.pages.find((item) => item.id === created.id);
    const encrypted = await window.SutraEncryptedBackups.createBackupBlob(pass);
    const encryptedBytes = new Uint8Array(await encrypted.blob.arrayBuffer());
    const packageBytes = await window.SutraEncryptedBackups.decryptEnvelopeBytes(encrypted.blob, pass);
    const zip = await window.JSZip.loadAsync(packageBytes);
    const packagedWorkspace = JSON.parse(await zip.file('workspace.json').async('text'));
    const packagedPage = packagedWorkspace.pages.find((item) => item.id === created.id);

    const replacement = { ...payload, pages: payload.pages.filter((item) => item.id !== created.id) };
    window.deserializeWorkspace(replacement);
    await window.saveWorkspaceLocally();

    return {
      id: created.id,
      encryptedBytes: Array.from(encryptedBytes),
      live,
      payloadPage,
      packagedPage
    };
  }, { pass: PASS, source: SOURCE });

  expect(exported.live.htmlDocument.source).toBe(SOURCE);
  expect(exported.payloadPage.htmlDocument.source).toBe(SOURCE);
  expect(exported.packagedPage.htmlDocument.source).toBe(SOURCE);
  expect(exported.packagedPage.id).toBe(exported.id);
  expect(exported.packagedPage.title).toBe('Encrypted HTML transfer');
  expect(exported.packagedPage.pageMode).toEqual(exported.payloadPage.pageMode);

  await page.setInputFiles('#fileInput', {
    name: 'html-transfer.sutra',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(exported.encryptedBytes)
  });
  await expect(page.locator('#sutraImportPasswordModal')).toHaveClass(/active/);
  await page.fill('#sutraImportPassphraseInput', PASS);
  await page.locator('#sutraImportPasswordSubmitBtn').click();
  await expect(page.locator('#sutraImportPasswordModal')).not.toHaveClass(/active/, { timeout: 30_000 });
  await acceptRestoreConflictChooser(page);

  await expect.poll(() => page.evaluate((id) => {
    return window.flowAtelier.pages.find((item) => item.id === id)?.htmlDocument?.source || '';
  }, exported.id), { timeout: 20_000 }).toBe(SOURCE);

  const imported = await page.evaluate(async (id) => {
    const live = window.flowAtelier.pages.find((item) => item.id === id);
    const serialized = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false })
      .pages.find((item) => item.id === id);
    const durable = (await window.loadWorkspaceLocally())?.pages?.find((item) => item.id === id);
    window.loadPage(id);
    return {
      live,
      serialized,
      durable,
      detected: !!window.SutraHTMLPages.getCurrentPage(),
      htmlSurfaceVisible: document.getElementById('htmlPageEditor')?.hidden === false
    };
  }, exported.id);

  expect(imported.live.htmlDocument.source).toBe(SOURCE);
  expect(imported.serialized.htmlDocument.source).toBe(SOURCE);
  expect(imported.durable.htmlDocument.source).toBe(SOURCE);
  expect(imported.live.id).toBe(exported.id);
  expect(imported.live.title).toBe('Encrypted HTML transfer');
  expect(imported.live.pageMode).toMatchObject({ enabled: true, size: 'a4' });
  expect(imported.detected).toBe(true);
  expect(imported.htmlSurfaceVisible).toBe(true);
  await expect(page.locator('#htmlPageEditor')).toBeVisible();

  await page.reload();
  await openApp(page);
  await page.evaluate((id) => {
    window.flowAtelier.setActiveView('notes');
    window.loadPage(id);
  }, exported.id);
  await expect(page.locator('#htmlPageEditor')).toBeVisible();
  await expect(page.locator('[data-html-source]')).toHaveValue(SOURCE);
});
