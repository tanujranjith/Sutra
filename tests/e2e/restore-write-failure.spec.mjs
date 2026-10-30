import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
  await waitForAppReady(page);
  await page.waitForFunction(() => window.__hwDueDateDelegateBound === true);
  await page.evaluate(() => {
    try {
      if (typeof window.markStudentOnboardingCompleted === 'function') {
        window.markStudentOnboardingCompleted(true);
      }
    } catch (error) {}
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

async function seedCurrentWorkspace(page, marker) {
  return page.evaluate(async marker => {
    const note = window.__sutraPublicBetaTestHooks.createNoteInActiveSpace(
      `Current device ${marker}`,
      `<p>Durable local copy ${marker}</p>`
    );
    await window.saveWorkspaceLocally();
    return { id: note.id, title: note.title };
  }, marker);
}

async function buildRestorePackage(page, marker, withAttachment) {
  const bytes = await page.evaluate(async ({ marker, withAttachment }) => {
    const base = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const now = new Date().toISOString();
    const page = {
      id: `restore-${marker}`,
      type: 'note',
      title: `Recovered workspace ${marker}`,
      content: `<p>Recovered content ${marker}</p>`,
      blocks: [],
      icon: 'doc',
      spaceId: 'default',
      isSystemPage: false,
      builtInId: '',
      systemRole: '',
      createdAt: now,
      updatedAt: now
    };
    const attachmentData = `data:text/plain;base64,${btoa(`durable attachment ${marker}`)}`;
    const payload = {
      ...base,
      pages: [page],
      courseWorkspace: {
        ...(base.courseWorkspace || {}),
        courses: withAttachment ? [{ id: `course-${marker}`, name: `Course ${marker}`, links: [] }] : [],
        files: withAttachment ? [{
          id: `file-${marker}`,
          courseId: `course-${marker}`,
          name: `Required attachment ${marker}.txt`,
          storageType: 'indexeddb',
          blobKey: `blob-${marker}`,
          _exportBlob: attachmentData,
          createdAt: now
        }] : [],
        resources: [],
        assignments: []
      }
    };
    const packaged = await window.__sutraPublicBetaTestHooks.createLegacyWorkspacePackageBlob(payload);
    return Array.from(new Uint8Array(await packaged.blob.arrayBuffer()));
  }, { marker, withAttachment });
  return Buffer.from(bytes);
}

async function startRestore(page, buffer, marker, failWrite) {
  await page.evaluate(({ bytes, marker, failWrite }) => {
    const originalPut = IDBObjectStore.prototype.put;
    window.__restoreFailureOriginalPut = originalPut;
    IDBObjectStore.prototype.put = function (value, key) {
      const dbName = this.transaction?.db?.name || '';
      const mode = this.transaction?.mode || '';
      const shouldFailAttachment = failWrite === 'attachment'
        && dbName === 'noteflow_attachments_db'
        && this.name === 'blobs'
        && mode === 'readwrite';
      const shouldFailWorkspace = failWrite === 'workspace'
        && dbName === 'noteflow_atelier_db'
        && this.name === 'workspace'
        && String(key) === 'root'
        && mode === 'readwrite';
      if (shouldFailAttachment || shouldFailWorkspace) {
        throw new DOMException(`Injected ${failWrite} restore write failure`, 'QuotaExceededError');
      }
      return originalPut.call(this, value, key);
    };
    window.__restoreWriteFailurePromise = window.importWorkspaceFile(new File(
      [Uint8Array.from(bytes)],
      `restore-${marker}.sutra`,
      { type: 'application/octet-stream' }
    ));
  }, { bytes: Array.from(buffer), marker, failWrite });

  await page.locator('.sutra-modal-overlay button', { hasText: 'Restore backup' }).click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'No, continue without export', exact: true }).click();

  return page.evaluate(async marker => {
    try {
      const importResult = await window.__restoreWriteFailurePromise;
      // The restore path flushes its pending debounced workspace save and
      // awaits the canonical write/readback before this promise settles.
      const live = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
      const durable = await window.loadWorkspaceLocally();
      return {
        importResult,
        liveHasRecoveredPage: live.pages.some(entry => entry.id === `restore-${marker}`),
        durable,
        persistenceFailure: window.SutraPersistenceHealth.getState().lastFailure,
        toast: document.getElementById('toastMessage')?.textContent || ''
      };
    } finally {
      IDBObjectStore.prototype.put = window.__restoreFailureOriginalPut;
      delete window.__restoreFailureOriginalPut;
    }
  }, marker);
}

async function readDurableAttachment(page, blobKey) {
  return page.evaluate(blobKey => new Promise((resolve, reject) => {
    const request = indexedDB.open('noteflow_attachments_db', 1);
    request.onerror = () => reject(request.error || new Error('Attachment database open failed'));
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('blobs')) {
        db.close();
        resolve(null);
        return;
      }
      const tx = db.transaction('blobs', 'readonly');
      const get = tx.objectStore('blobs').get(blobKey);
      get.onsuccess = () => {
        const result = get.result || null;
        db.close();
        resolve(result);
      };
      get.onerror = () => {
        db.close();
        reject(get.error || tx.error || new Error('Attachment read failed'));
      };
    };
  }), blobKey);
}

test('restore reports an attachment write failure while keeping recovered content available in memory', async ({ page }) => {
  const marker = `ATTACHMENT-${Date.now()}`;
  await openApp(page);
  const before = await seedCurrentWorkspace(page, marker);
  const buffer = await buildRestorePackage(page, marker, true);
  const result = await startRestore(page, buffer, marker, 'attachment');

  expect(result.importResult).toBe(false);
  expect(result.liveHasRecoveredPage).toBe(true);
  expect(result.durable.pages.some(entry => entry.id === before.id && entry.title === before.title)).toBe(false);
  expect(result.durable.pages.some(entry => entry.id === `restore-${marker}`)).toBe(true);
  expect(result.durable.courseWorkspace.files.find(file => file.id === `file-${marker}`)?.missingBlob).toBe(true);
  expect(result.persistenceFailure).toMatchObject({ kind: 'attachment', phase: 'import-save' });
  expect(result.toast).toMatch(/Import failed: Workspace restore incomplete:/);
  expect(result.toast).toMatch(/1 attachments? could not be saved/);
  expect(result.toast).toMatch(/1 required attachment could not be verified in storage/);
  expect(result.toast).toMatch(/Recovered content is available in this session; keep the original backup/);
  expect(result.toast).not.toMatch(/Workspace imported successfully|Imported with \d+ warning/);

  const cached = await page.evaluate(key => window.__sutraPublicBetaTestHooks.readCourseAttachmentBlob(key), `blob-${marker}`);
  expect(cached).toContain('data:text/plain;base64,');
  expect(await readDurableAttachment(page, `blob-${marker}`)).toBeNull();
  await expect(page.locator('#sutraSaveFailureBanner')).toBeVisible();
  await expect(page.locator('#sutraSaveFailureMessage')).toContainText(/in-memory workspace is preserved.*attachment failure during import-save/i);
});

test('restore reports a workspace write failure without overwriting the durable local workspace', async ({ page }) => {
  const marker = `WORKSPACE-${Date.now()}`;
  await openApp(page);
  const before = await seedCurrentWorkspace(page, marker);
  const buffer = await buildRestorePackage(page, marker, false);
  const result = await startRestore(page, buffer, marker, 'workspace');

  expect(result.importResult).toBe(false);
  expect(result.liveHasRecoveredPage).toBe(true);
  expect(result.durable.pages.some(entry => entry.id === before.id && entry.title === before.title)).toBe(true);
  expect(result.durable.pages.some(entry => entry.id === `restore-${marker}`)).toBe(false);
  expect(result.persistenceFailure).toMatchObject({ phase: 'import-save' });
  expect(result.persistenceFailure.kind).not.toBe('attachment');
  expect(result.toast).toMatch(/Import failed: Workspace restore incomplete:/);
  expect(result.toast).toMatch(/Local saving could not be confirmed/);
  expect(result.toast).toMatch(/Recovered content is available in this session; keep the original backup/);
  expect(result.toast).not.toMatch(/Workspace imported successfully|Imported with \d+ warning/);
  await expect(page.locator('#sutraSaveFailureBanner')).toBeVisible();
  await expect(page.locator('#sutraSaveFailureMessage')).toContainText(/in-memory workspace is preserved.*failure during import-save/i);
});
