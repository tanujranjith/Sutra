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
  await page.waitForFunction(() =>
    typeof window.getFlowAssistantContext === 'function'
    && window.sutraAssistant
    && typeof window.sutraAssistant.applyAction === 'function'
  );
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

test('an editor-unlocked protected selection is excluded from unrelated Assistant requests', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async ({ pin, secret }) => {
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const now = new Date().toISOString();
    payload.pages.push({ id: 'selection-protected', title: 'Protected selection', content: `<p>${secret}</p>`, blocks: [], createdAt: now, updatedAt: now });
    window.deserializeWorkspace(payload);
    await window.__sutraPublicBetaTestHooks.lockPageWithPin('selection-protected', pin);
    window.flowAtelier.unlockedPageIds.add('selection-protected');
    window.flowAtelier.setActiveView('notes');
    window.loadPage('selection-protected');
    window.SutraAssistantPermissions.setMode('read_only');
    window.SutraAssistantPermissions.setArea('notes', 'approved');
  }, { pin: PIN, secret: SECRET });
  await page.waitForFunction(secret => document.querySelector('#editorV2Host .ProseMirror')?.textContent.includes(secret), SECRET);

  const report = await page.evaluate(({ secret }) => {
    const editor = document.querySelector('#editorV2Host .ProseMirror');
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const depths = ['minimal', 'currentView'];
    return depths.map(depth => {
      const enrichment = window.flowAssistant.buildRequestEnrichment('Hello', 'openai', { depth });
      return {
        depth,
        selectionPresent: selection.toString().includes(secret),
        context: JSON.stringify(enrichment.context),
        payload: JSON.stringify({ systemPrompt: enrichment.systemPrompt, messages: enrichment.requestMessages })
      };
    });
  }, { secret: SECRET });
  for (const result of report) {
    expect(result.selectionPresent).toBe(true);
    expect(result.context).not.toContain(SECRET);
    expect(result.payload).not.toContain(SECRET);
  }
});

test('classic editor owner follows navigation and excludes stale protected selections', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async ({ pin, secret }) => {
    const ordinaryText = 'Ordinary available passage';
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const now = new Date().toISOString();
    payload.pages.push(
      { id: 'classic-private', title: 'Classic private', content: `<p>${secret}</p>`, blocks: [], createdAt: now, updatedAt: now },
      { id: 'classic-ordinary', title: 'Classic ordinary', content: `<p>${ordinaryText}</p>`, blocks: [], createdAt: now, updatedAt: now },
      { id: 'classic-canvas', title: 'Classic canvas', type: 'canvas', content: '', blocks: [],
        canvas: { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, background: 'grid', objects: [], connections: [], groups: [] }, createdAt: now, updatedAt: now }
    );
    window.deserializeWorkspace(payload);
    await window.__sutraPublicBetaTestHooks.lockPageWithPin('classic-private', pin);
    window.setWorkspacePreference('editor.editorV2Enabled', false, {});
    window.applyWorkspacePreferences({});
    window.SutraAssistantPermissions.setMode('read_only');
    window.SutraAssistantPermissions.setArea('notes', 'approved');
    const editor = document.getElementById('editor');
    const selectEditor = () => {
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString();
    };
    const request = () => {
      const enrichment = window.flowAssistant.buildRequestEnrichment('Hello', 'openai', { depth: 'minimal' });
      return JSON.stringify({ systemPrompt: enrichment.systemPrompt, messages: enrichment.requestMessages });
    };
    window.loadPage('classic-ordinary');
    const ordinaryOwner = editor.dataset.pageId;
    const ordinarySelection = selectEditor();
    const ordinaryRequest = request();

    window.flowAtelier.unlockedPageIds.add('classic-private');
    window.loadPage('classic-private');
    const privateOwner = editor.dataset.pageId;
    const privateSelection = selectEditor();
    let duringNavigation = null;
    const observe = () => {
      if (window.flowAtelier.currentPageId !== 'classic-ordinary') return;
      duringNavigation = { owner: editor.dataset.pageId || '', text: editor.textContent, request: request() };
    };
    window.addEventListener('noteflow:view-changed', observe);
    window.loadPage('classic-ordinary');
    window.removeEventListener('noteflow:view-changed', observe);

    window.flowAtelier.unlockedPageIds.add('classic-private');
    window.loadPage('classic-private');
    selectEditor();
    window.loadPage('classic-canvas');
    const canvas = { owner: editor.dataset.pageId || '', hidden: editor.hidden, retainedText: editor.textContent, request: request() };
    return { ordinaryText, ordinaryOwner, ordinarySelection, ordinaryRequest, privateOwner, privateSelection, duringNavigation, canvas };
  }, { pin: PIN, secret: SECRET });

  expect(result.ordinaryOwner).toBe('classic-ordinary');
  expect(result.ordinarySelection).toContain(result.ordinaryText);
  expect(result.ordinaryRequest).toContain(result.ordinaryText);
  expect(result.privateOwner).toBe('classic-private');
  expect(result.privateSelection).toContain(SECRET);
  expect(result.duringNavigation).not.toBeNull();
  expect(result.duringNavigation.text).toContain(SECRET);
  expect(result.duringNavigation.owner).toBe('');
  expect(result.duringNavigation.request).not.toContain(SECRET);
  expect(result.canvas.hidden).toBe(true);
  expect(result.canvas.owner).toBe('');
  expect(result.canvas.retainedText).toContain(SECRET);
  expect(result.canvas.request).not.toContain(SECRET);
});

for (const depth of ['currentView', 'minimal']) {
test(`Assistant locked-page access requires consent and PIN without unlocking the editor (${depth})`, async ({ page }) => {
  await openApp(page);
  const targetId = await page.evaluate(async ({ pin, secret }) => {
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const targetId = 'assistant-locked-access-note';
    const now = new Date().toISOString();
    payload.pages.push({
      id: targetId,
      title: 'Assistant private draft',
      content: '<p>' + secret + '</p>',
      blocks: [],
      createdAt: now,
      updatedAt: now
    });
    payload.pages.push({
      id: 'unrelated-assistant-note', title: 'Assistant private draft ordinary notes',
      content: '<p>UNRELATED_ZOOM_RECORD must not enter this page-scoped request.</p>',
      blocks: [], createdAt: now, updatedAt: now
    });
    window.deserializeWorkspace(payload);
    await window.__sutraPublicBetaTestHooks.lockPageWithPin(targetId, pin);
    window.loadPage('unrelated-assistant-note');
    return targetId;
  }, { pin: PIN, secret: SECRET });

  await page.evaluate(() => {
    window.__assistantLockedAccessResult = window.flowAssistant.requestLockedPageAccessForPrompt('Read the locked note "Assistant private draft". What should I bring?');
  });
  await expect(page.locator('#customConfirmModal')).toHaveClass(/active/);
  await expect(page.locator('#customConfirmTitle')).toHaveText('Allow Assistant access once?');
  await page.locator('#customConfirmAcceptBtn').click();
  await expect(page.locator('#customPromptModal')).toHaveClass(/active/);
  await expect(page.locator('#customPromptTitle')).toHaveText('Verify page PIN for Assistant');
  await page.locator('#customPromptInput').fill(PIN);
  await page.locator('#customPromptConfirmBtn').click();

  const report = await page.evaluate(async ({ targetId, secret, depth }) => {
    const result = await window.__assistantLockedAccessResult;
    const question = 'Read the locked note "Assistant private draft". What should I bring?';
    const local = window.flowAssistant.tryHandleCommand(question, { lockedPageAccessTicket: result.ticket });
    const enrichment = window.flowAssistant.buildRequestEnrichment(question, 'openai', {
      lockedPageAccessTicket: result.ticket, depth
    });
    const reusedEnrichment = window.flowAssistant.buildRequestEnrichment(question, 'openai', {
      lockedPageAccessTicket: result.ticket, depth
    });
    const contextAfter = window.getFlowAssistantContext({ depth: 'currentView' });
    const editorText = document.getElementById('editor')?.textContent || '';
    const v2Text = document.getElementById('editorV2Host')?.textContent || '';
    const settings = window.SutraAssistantPermissions?.get?.();
    window.flowAssistant.consumeLockedPageAccess(result.ticket);
    return {
      result,
      locallyIntercepted: local.handled === true,
      sources: enrichment.sources.map(source => ({ noteId: source.noteId, readOnce: source.readOnce })),
      includesUnrelated: enrichment.systemPrompt.includes('UNRELATED_ZOOM_RECORD'),
      sentContextContainsSecret: JSON.stringify(enrichment.context).includes(secret),
      reusedGrantContainsSecret: JSON.stringify(reusedEnrichment?.context || {}).includes(secret),
      pageStillEditorLocked: !window.flowAtelier.unlockedPageIds.has(targetId),
      editorLeaks: editorText.includes(secret) || v2Text.includes(secret),
      afterGrantLeaks: JSON.stringify(contextAfter).includes(secret),
      persistedSettingUnchanged: settings?.allowLockedNotes === false
    };
  }, { targetId, secret: SECRET, depth });

  expect(report.result.ok).toBe(true);
  expect(report.locallyIntercepted).toBe(false);
  expect(report.sources.length).toBeGreaterThan(0);
  expect(report.sources.every(source => source.noteId === targetId && source.readOnce === true)).toBe(true);
  expect(report.includesUnrelated).toBe(false);
  expect(report.sentContextContainsSecret).toBe(true);
  expect(report.reusedGrantContainsSecret).toBe(false);
  expect(report.pageStillEditorLocked).toBe(true);
  expect(report.editorLeaks).toBe(false);
  expect(report.afterGrantLeaks).toBe(false);
  expect(report.persistedSettingUnchanged).toBe(true);
});
}

test('Assistant prompt enrichment rechecks memory permission at the final context boundary', async ({ page }) => {
  await openApp(page);
  const report = await page.evaluate(() => {
    const secret = 'MEMORY_MUST_REQUIRE_AREA_APPROVAL';
    const priorPermissions = window.SutraAssistantPrivacy.getPermissions();
    const originalMemory = window.SutraAssistantMemory;
    let memoryReads = 0;
    const used = [];
    window.SutraAssistantMemory = {
      buildPromptSnippets: () => { memoryReads++; return [{ id: 'memory-private-1', text: secret }]; },
      recordUsed: ids => used.push(...ids)
    };
    window.SutraAssistantPrivacy.configure({
      getPermissions: () => ({ mode: 'ask_per_area', areas: { memory: 'ask', notes: 'denied' } })
    });
    try {
      const denied = window.flowAssistant.buildRequestEnrichment('help me plan', 'openai', {});
      const deniedReads = memoryReads;
      const deniedUsed = used.slice();
      const approved = window.flowAssistant.buildRequestEnrichment('help me plan', 'openai', { approvedAreas: ['memory'] });
      return {
        deniedReads, deniedUsed,
        deniedPromptLeaks: denied.systemPrompt.includes(secret),
        deniedContextLeaks: JSON.stringify(denied.context).includes(secret),
        deniedMemoryIdLeaks: JSON.stringify(denied.context).includes('memory-private-1'),
        approvedPromptIncludes: approved.systemPrompt.includes(secret),
        approvedMemoryIds: approved.context.memoryUsedIds || []
      };
    } finally {
      window.SutraAssistantMemory = originalMemory;
      window.SutraAssistantPrivacy.configure({ getPermissions: () => priorPermissions });
    }
  });
  expect(report.deniedPromptLeaks).toBe(false);
  expect(report.deniedReads).toBe(0);
  expect(report.deniedUsed).toEqual([]);
  expect(report.deniedContextLeaks).toBe(false);
  expect(report.deniedMemoryIdLeaks).toBe(false);
  expect(report.approvedPromptIncludes).toBe(true);
  expect(report.approvedMemoryIds).toEqual(['memory-private-1']);
});

test('Assistant bridge failure is reported; To-do stays usable while bridge writes fail closed', async ({ page }) => {
  await openApp(page);
  const report = await page.evaluate(() => {
    const originalBridge = window.flowAtelier;
    const originalReporter = window.SutraReportError;
    const errors = [];
    window.flowAtelier = undefined;
    window.SutraReportError = (error, context, severity) => {
      errors.push({ message: String(error && error.message || error), context, severity });
    };
    try {
      window.SutraAssistantPermissions.setMode('approved_actions');
      const context = window.getFlowAssistantContext({ depth: 'workspace' });
      const task = window.sutraAssistant.applyAction({ type: 'create_task', title: 'Must not disappear' }, { reviewed: true });
      const taskSaved = (window.SutraHomeworkStore.getSnapshot().tasks || []).some(row => row.title === 'Must not disappear');
      const block = window.sutraAssistant.applyAction({
        type: 'create_timeline_block', name: 'Must not disappear', date: '2026-08-25', start: '09:00', end: '10:00'
      }, { reviewed: true });
      const note = window.sutraAssistant.applyAction({ type: 'create_page', title: 'Must not disappear' }, { reviewed: true });
      window.SutraAssistantPermissions.setMode('read_only');
      const deniedTask = window.sutraAssistant.applyAction({ type: 'create_task', title: 'Must remain blocked' }, { reviewed: true });
      const deniedTaskSaved = (window.SutraHomeworkStore.getSnapshot().tasks || []).some(row => row.title === 'Must remain blocked');
      return { context, task, taskSaved, block, note, deniedTask, deniedTaskSaved, errors };
    } finally {
      window.flowAtelier = originalBridge;
      window.SutraReportError = originalReporter;
    }
  });

  expect(report.context.tasks).toEqual([]);
  expect(report.task.ok).toBe(true);
  expect(report.taskSaved).toBe(true);
  expect(report.block.ok).toBe(false);
  expect(report.note.ok).toBe(false);
  expect(report.deniedTask.ok).toBe(false);
  expect(report.deniedTaskSaved).toBe(false);
  expect(report.errors).toEqual([
    expect.objectContaining({ message: 'Assistant workspace bridge is unavailable.', severity: 'error' })
  ]);
});
