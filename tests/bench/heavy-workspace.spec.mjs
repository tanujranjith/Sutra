import { expect, test } from '@playwright/test';

// Phase 11 — heavy-workspace performance benchmark.
// Generates a realistic large workspace and measures the canonical pipeline:
// load/deserialize, render, serialize, JSON export, IndexedDB save + readback
// verify, .sutra (zip) export + size, and .sutra import. Run with:
//   npm run bench:heavy            (defaults to ~1000 notes)
//   BENCH_NOTES=2000 npm run bench:heavy
//
// Thresholds are intentionally GENEROUS: the benchmark exists to surface
// order-of-magnitude regressions and to report numbers, not to micro-optimize.

const NOTES = Number(process.env.BENCH_NOTES || 1000);

async function completeOnboarding(page) {
  await page.evaluate(() => {
    try { if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true); } catch (e) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.hidden = true; overlay.style.setProperty('display', 'none', 'important'); }
  });
}

test('heavy workspace: generate, serialize, save, export, import', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await completeOnboarding(page);
  await expect(page.locator('.app-container')).toBeVisible();

  const m = await page.evaluate(async (N) => {
    const now = () => performance.now();
    const round = (x) => Math.round(x);
    const base = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });

    // ~2.5KB of rich text per note; a 1x1 PNG stands in for embedded images.
    const para = '<p>' + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore. '.repeat(22) + '</p>';
    const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const iso = base.exportedAt || '2026-06-05T00:00:00.000Z';

    const pages = [];
    for (let i = 0; i < N; i += 1) {
      const heavy = i % 10 === 0;
      const page = {
        id: 'bench-page-' + i,
        title: 'Bench Note ' + i,
        content: para + (heavy ? `<img src="${img}" alt="fig ${i}">` : ''),
        icon: 'book',
        tags: ['bench', 'unit-' + (i % 12)],
        createdAt: iso,
        updatedAt: iso
      };
      if (i % 50 === 0) {
        page.documentBackground = { enabled: true, dataUrl: img, blurPx: 8, overlayOpacity: 20, name: 'bg', mimeType: 'image/png', fit: 'cover', position: 'center' };
      }
      pages.push(page);
    }

    const tasks = [];
    for (let i = 0; i < 400; i += 1) {
      tasks.push({ id: 'bench-task-' + i, title: 'Assignment ' + i, done: i % 3 === 0, dueDate: '2026-06-' + String((i % 27) + 1).padStart(2, '0') });
    }

    const payload = {
      ...base,
      pages,
      tasks,
      taskOrder: tasks.map((t) => t.id),
      settings: {
        ...(base.settings || {}),
        customization: { ...(base.settings && base.settings.customization), customCss: '/* bench */ ' + '.x{color:red}\n'.repeat(500) }
      }
    };

    // --- load / deserialize the heavy workspace into memory ---
    let s = now();
    window.deserializeWorkspace(payload);
    const loadMs = now() - s;

    // --- representative render ---
    s = now();
    try { window.setActiveView && window.setActiveView('today'); } catch (e) {}
    const renderMs = now() - s;

    // --- seed a representative Review volume via the public API (best effort) ---
    try {
      for (let d = 0; d < 5; d += 1) {
        const deck = window.createReviewDeck && window.createReviewDeck({ name: 'Bench Deck ' + d });
        const id = deck && (deck.id || deck.deckId);
        if (id && window.bulkImportReviewCards) {
          const rows = Array.from({ length: 200 }, (_, i) => `Term ${d}-${i}\tDefinition for term ${d}-${i}`).join('\n');
          window.bulkImportReviewCards(id, rows);
        }
      }
    } catch (e) { /* review seeding is best-effort */ }

    // --- serialize ---
    s = now();
    const ser = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const serializeMs = now() - s;

    // --- JSON export ---
    s = now();
    const json = JSON.stringify(ser);
    const jsonMs = now() - s;
    const jsonBytes = json.length;

    // --- IndexedDB save + readback verify ---
    s = now();
    await window.saveWorkspaceLocally();
    const saveMs = now() - s;
    const health = window.SutraPersistenceHealth ? window.SutraPersistenceHealth.getState() : {};

    // --- .sutra (zip) export ---
    s = now();
    const zip = new window.JSZip();
    zip.file('manifest.json', JSON.stringify({ product: 'Sutra', appName: 'Sutra', format: 'sutra-workspace', formatVersion: 1, schemaVersion: 1, assets: [] }));
    zip.file('workspace.json', json);
    const blob = await zip.generateAsync({ type: 'blob' });
    const sutraExportMs = now() - s;
    const sutraBytes = blob.size;

    // --- .sutra import (round trip) ---
    // Whole-workspace imports onto a non-empty device now block on the
    // restore conflict chooser, so the import must NOT be awaited here —
    // the test clicks the chooser from outside, then awaits the promise.
    window.__benchImportStart = now();
    window.__benchImportPromise = window.importWorkspaceFile(new File([blob], 'bench.sutra', { type: 'application/zip' }));

    return {
      notes: pages.length,
      tasks: tasks.length,
      loadMs: round(loadMs),
      renderMs: round(renderMs),
      serializeMs: round(serializeMs),
      jsonMs: round(jsonMs),
      jsonMB: +(jsonBytes / 1048576).toFixed(2),
      saveMs: round(saveMs),
      lastConfirmedSaveAt: health.lastConfirmedSaveAt || null,
      lastSerializedBytes: health.lastSerializedBytes || null,
      sutraExportMs: round(sutraExportMs),
      sutraMB: +(sutraBytes / 1048576).toFixed(2)
    };
  }, NOTES);

  // Accept the restore conflict chooser, then finish timing the import.
  await page.locator('.sutra-modal-overlay button', { hasText: 'Restore backup' }).click({ timeout: 20_000 });
  const importResult = await page.evaluate(async () => {
    const round = (x) => Math.round(x);
    let importMs = -1;
    try {
      await window.__benchImportPromise;
      importMs = performance.now() - window.__benchImportStart;
    } catch (e) { importMs = -1; }
    delete window.__benchImportPromise;
    delete window.__benchImportStart;
    const afterPages = (window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false }).pages || []).length;
    return { importMs: round(importMs), afterPages };
  });
  m.importMs = importResult.importMs;
  m.afterPages = importResult.afterPages;

  // Report.
  console.log('\n===== Sutra heavy-workspace benchmark =====');
  console.log(JSON.stringify(m, null, 2));
  console.log('==========================================\n');

  // Sanity: the workspace actually loaded and round-tripped.
  expect(m.notes).toBe(NOTES);
  expect(m.afterPages).toBe(NOTES);
  expect(m.jsonMB).toBeGreaterThan(0.5);

  // Generous warning thresholds (catch 10x regressions, not micro-changes).
  expect(m.serializeMs, 'serialize too slow').toBeLessThan(8000);
  expect(m.saveMs, 'IndexedDB save+verify too slow').toBeLessThan(45000);
  expect(m.sutraExportMs, '.sutra export too slow').toBeLessThan(45000);
});
