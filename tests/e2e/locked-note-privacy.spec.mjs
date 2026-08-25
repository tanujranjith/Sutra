import { expect, test } from '@playwright/test';

const PIN = '2468';
const SECRET = 'ULTRA_SECRET_LOCKED_NOTE_PHRASE';

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#fileInput', { state: 'attached' });
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
  await page.waitForFunction(() => !!window.__sutraPublicBetaTestHooks && !!window.SutraCanvas && !!window.SutraSlides);
}

test('locked note plaintext stays behind the shared authorization boundary', async ({ page }) => {
  test.setTimeout(60_000);
  await openApp(page);

  const report = await page.evaluate(async ({ pin, secret }) => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const targetId = 'privacy-target-note';
    const lockedId = 'privacy-locked-note';
    const canvasId = 'privacy-canvas';
    const slidesId = 'privacy-slides';
    const now = new Date().toISOString();

    payload.pages = [
      ...payload.pages,
      { id: targetId, title: 'Privacy target', content: '<p>Target</p>', blocks: [], createdAt: now, updatedAt: now },
      {
        id: lockedId,
        title: 'Private draft',
        content: '<p>' + secret + '</p><p><span class="page-link" data-page-id="' + targetId + '">Target</span></p>',
        blocks: [],
        createdAt: now,
        updatedAt: now
      },
      {
        id: canvasId,
        title: 'Privacy canvas',
        type: 'canvas',
        content: '',
        blocks: [],
        canvas: {
          version: 1,
          viewport: { x: 0, y: 0, zoom: 1 },
          background: 'grid',
          objects: [{ id: 'legacy-linked-card', type: 'linked-note', text: secret, label: 'Private draft', ref: { type: 'page', id: lockedId } }],
          connections: [],
          groups: []
        },
        createdAt: now,
        updatedAt: now
      },
      {
        id: slidesId,
        title: 'Private slides',
        type: 'note',
        content: '<p>' + secret + '</p>',
        blocks: [],
        slides: {
          version: 1,
          size: 'widescreen',
          theme: 'sutra',
          slides: [{ id: 'slide-private', title: secret, speakerNotes: secret, elements: [{ id: 'slide-text', type: 'text', text: secret }] }]
        },
        createdAt: now,
        updatedAt: now
      }
    ];
    window.deserializeWorkspace(payload);
    await hooks.lockPageWithPin(lockedId, pin);
    await hooks.lockPageWithPin(slidesId, pin);

    window.loadPage(lockedId);
    const editorText = document.getElementById('editor')?.textContent || '';
    const v2Text = document.getElementById('editorV2Host')?.textContent || '';
    const search = hooks.searchAll(secret.toLowerCase());
    const reviewResult = window.SutraReviewGenerator.fromNoteId(lockedId);
    const backlinks = hooks.getBacklinksForPage(targetId);

    window.loadPage(canvasId);
    const inserted = window.SutraCanvas.insertLinkedNote(lockedId);
    const canvasContext = window.SutraCanvas.getContext();
    const serialized = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const canvasPage = serialized.pages.find((entry) => entry.id === canvasId);
    const linkedCard = canvasPage?.canvas?.objects?.find((entry) => entry.id === 'legacy-linked-card');
    const visibleCanvasText = document.getElementById('canvasEditor')?.textContent || '';

    window.loadPage(slidesId);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const slidesRoot = document.getElementById('slidesEditor');

    return {
      authorized: hooks.isPageContentAuthorized(lockedId),
      editorLeaks: editorText.includes(secret) || v2Text.includes(secret),
      searchMatches: search?.notes?.length || 0,
      reviewResult,
      backlinkIds: backlinks.map((entry) => entry.id),
      canvasInserted: !!inserted,
      canvasContextContainsSecret: JSON.stringify(canvasContext || {}).includes(secret),
      canvasVisibleContainsSecret: visibleCanvasText.includes(secret),
      legacyLinkedText: linkedCard?.text,
      slidesVisible: !!(slidesRoot && !slidesRoot.hidden),
      slidesBodyMode: document.body.classList.contains('slides-page-active'),
      slidesContext: window.SutraSlides.getContext(),
      slidesCurrentPage: window.SutraSlides.getCurrentPage()
    };
  }, { pin: PIN, secret: SECRET });

  expect(report.authorized).toBe(false);
  expect(report.editorLeaks).toBe(false);
  expect(report.searchMatches).toBe(0);
  expect(report.reviewResult).toBe(false);
  expect(report.backlinkIds).not.toContain('privacy-locked-note');
  expect(report.canvasInserted).toBe(false);
  expect(report.canvasContextContainsSecret).toBe(false);
  expect(report.canvasVisibleContainsSecret).toBe(false);
  expect(report.legacyLinkedText).toBe('');
  expect(report.slidesVisible).toBe(false);
  expect(report.slidesBodyMode).toBe(false);
  expect(report.slidesContext).toBeNull();
  expect(report.slidesCurrentPage).toBeNull();
});

test('Assistant context fails closed when the privacy boundary is unavailable', async ({ page }) => {
  await openApp(page);
  const report = await page.evaluate(() => {
    const original = window.SutraAssistantPrivacy;
    window.SutraDiagnostics?.clear?.();
    window.SutraAssistantPrivacy = undefined;
    let context;
    try {
      context = window.getFlowAssistantContext({ depth: 'workspace' });
    } finally {
      window.SutraAssistantPrivacy = original;
    }
    return {
      keys: Object.keys(context).sort(),
      report: context.accessReport,
      diagnosed: window.SutraDiagnostics?.getEntries?.().some(entry =>
        entry.context?.where === 'flow-assistant.filterAssistantContext')
    };
  });
  expect(report.keys).toEqual(['accessReport', 'depth', 'now', 'schema', 'timeOfDay', 'view']);
  expect(report.report.areasRead).toEqual([]);
  expect(report.report.excludedSensitiveAreas).toContain('privacy_boundary_unavailable');
  expect(report.diagnosed).toBe(true);
});
