import { expect, test } from '@playwright/test';

async function completeOnboarding(page) {
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
}

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await completeOnboarding(page);
  await page.waitForFunction(() => !!window.SutraFeatureRegistry);
  await page.evaluate(() => window.SutraFeatureRegistry.enable('assistant', { test: true }));
  await page.waitForFunction(() => !!window.__sutraPublicBetaTestHooks && !!window.serializeWorkspace);
}

test('new spaces open protected Help & Docs without silent Untitled notes', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const space = hooks.createSpace('QA Help Space');
    const current = hooks.getCurrentPage();
    const spacePages = hooks.getPagesForSpace(space.id);
    return {
      spaceId: space.id,
      activeSpaceId: hooks.getActiveSpaceId(),
      currentTitle: current && current.title,
      currentSystemRole: current && current.systemRole,
      helpCount: spacePages.filter(item => item.systemRole === 'help-docs').length,
      untitledCount: spacePages.filter(item => item.title === 'Untitled').length
    };
  });

  expect(result.activeSpaceId).toBe(result.spaceId);
  expect(result.currentTitle).toBe('Help & Docs');
  expect(result.currentSystemRole).toBe('help-docs');
  expect(result.helpCount).toBe(1);
  expect(result.untitledCount).toBe(0);
});

test('imports and assistant-created notes route to the active space and round-trip', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const spaceA = hooks.createSpace('QA Space A');
    const spaceB = hooks.createSpace('QA Space B');
    hooks.switchSpace(spaceB.id);
    const imported = hooks.importDocumentToActiveSpace('Imported Active Space QA', '<h1>Imported Active Space QA</h1>');
    const assistantResult = window.flowAssistant.applyAction({
      type: 'create_page',
      title: 'Assistant Active Space QA',
      body: '# Assistant Active Space QA'
    });
    const before = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    window.deserializeWorkspace(before);
    const after = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const importedAfter = after.pages.find(item => item.id === imported.id);
    const assistantAfter = after.pages.find(item => item.title === 'Assistant Active Space QA');
    return {
      spaceA: spaceA.id,
      spaceB: spaceB.id,
      importedSpaceId: importedAfter && importedAfter.spaceId,
      assistantOk: assistantResult.ok,
      assistantSpaceId: assistantAfter && assistantAfter.spaceId,
      leakedToA: after.pages.some(item => item.spaceId === spaceA.id && /Active Space QA/.test(item.title || ''))
    };
  });

  expect(result.importedSpaceId).toBe(result.spaceB);
  expect(result.assistantOk).toBe(true);
  expect(result.assistantSpaceId).toBe(result.spaceB);
  expect(result.leakedToA).toBe(false);
});

test('pinned note pages survive rename, hierarchy move, deletion cleanup, and round-trip', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const space = hooks.createSpace('QA Pin Space');
    const pageRow = hooks.createNoteInActiveSpace('Pin Target', '<p>Pin me</p>');
    hooks.togglePinPage(pageRow.id, space.id);
    hooks.renamePage(pageRow.id, 'Renamed Pin Target');
    const pinnedAfterRename = hooks.getPinnedNoteIds(space.id).includes(pageRow.id);
    hooks.renamePage(pageRow.id, 'Parent::Renamed Pin Target');
    const pinnedAfterMove = hooks.getPinnedNoteIds(space.id).includes(pageRow.id);
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    window.deserializeWorkspace(payload);
    const pinnedAfterRestore = hooks.getPinnedNoteIds(space.id).includes(pageRow.id);
    hooks.forceDeletePageById(pageRow.id);
    const pinnedAfterDelete = hooks.getPinnedNoteIds(space.id).includes(pageRow.id);
    return { pinnedAfterRename, pinnedAfterMove, pinnedAfterRestore, pinnedAfterDelete };
  });

  expect(result.pinnedAfterRename).toBe(true);
  expect(result.pinnedAfterMove).toBe(true);
  expect(result.pinnedAfterRestore).toBe(true);
  expect(result.pinnedAfterDelete).toBe(false);
});

test('Canvas pages are space-scoped, editable, searchable, assistant-bounded, and persistent', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const space = hooks.createSpace('QA Canvas Space');
    const linkedNote = hooks.createNoteInActiveSpace('Linked Canvas Note', '<p>Linked note body for preview.</p>');
    const canvasPage = hooks.createCanvasInActiveSpace('QA Canvas Page');
    const api = window.SutraCanvas;
    const text = api.addText('Concept thesis');
    const sticky = api.addSticky('Remember the rubric');
    const shape = api.addShape('diamond');
    api.addFreehand([{ x: 0, y: 0 }, { x: 40, y: 24 }, { x: 80, y: 8 }]);
    api.select([text.id, sticky.id]);
    const group = api.group(null, 'Argument group');
    api.addConnector(text.id, sticky.id, { label: 'supports' });
    api.moveObject(text.id, { dx: 32, dy: 18 });
    api.resizeObject(sticky.id, { width: 260, height: 160 });
    const duplicateIds = api.duplicate([shape.id]);
    api.deleteSelected(duplicateIds);
    api.undo();
    api.redo();
    api.setViewport({ x: -120, y: -80, zoom: 1.35 });
    const linked = api.insertLinkedNote(linkedNote.id);
    api.select([text.id]);
    const task = api.createTaskFromSelection();
    const exportFns = ['exportImage', 'exportPdf', 'exportModel'].every(name => typeof api[name] === 'function');
    const exportModel = api.exportJson();
    hooks.togglePinPage(canvasPage.id, space.id);
    const assistantAction = window.flowAssistant.applyAction({ type: 'canvas_add_sticky', text: 'Assistant proposed card' });
    const canvasActionsHighRisk = window.flowAssistant.ACTION_CATALOG
      .filter(item => String(item.type || '').startsWith('canvas_'))
      .every(item => item.risk === 'high');
    const context = hooks.getCanvasContext();
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    window.deserializeWorkspace(payload);
    const restored = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const restoredCanvas = restored.pages.find(item => item.id === canvasPage.id);
    const searchHit = restored.pages.some(item => item.id === canvasPage.id && JSON.stringify(item.canvas || {}).includes('Concept thesis'));
    return {
      spaceId: space.id,
      canvasSpaceId: restoredCanvas && restoredCanvas.spaceId,
      objectCount: restoredCanvas && restoredCanvas.canvas && restoredCanvas.canvas.objects.length,
      connectionCount: restoredCanvas && restoredCanvas.canvas && restoredCanvas.canvas.connections.length,
      groupId: group && group.id,
      linkedRef: linked && linked.ref && linked.ref.id,
      taskOrigin: task && task.origin,
      exportFns,
      exportObjectCount: exportModel && exportModel.objects && exportModel.objects.length,
      pinned: hooks.getPinnedNoteIds(space.id).includes(canvasPage.id),
      assistantOk: assistantAction.ok,
      canvasActionsHighRisk,
      contextObjectCount: context && context.objectCount,
      boundedTextCount: context && context.visibleText && context.visibleText.length,
      searchHit
    };
  });

  expect(result.canvasSpaceId).toBe(result.spaceId);
  expect(result.objectCount).toBeGreaterThanOrEqual(6);
  expect(result.connectionCount).toBeGreaterThanOrEqual(1);
  expect(result.groupId).toBeTruthy();
  expect(result.linkedRef).toBeTruthy();
  expect(result.taskOrigin).toBe('canvas');
  expect(result.exportFns).toBe(true);
  expect(result.exportObjectCount).toBeGreaterThanOrEqual(1);
  expect(result.pinned).toBe(true);
  expect(result.assistantOk).toBe(true);
  expect(result.canvasActionsHighRisk).toBe(true);
  expect(result.contextObjectCount).toBeGreaterThanOrEqual(1);
  expect(result.boundedTextCount).toBeLessThanOrEqual(40);
  expect(result.searchHit).toBe(true);
});

test('table dimensions, release notifications, and timed commitments persist', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const tablePage = hooks.createNoteInActiveSpace('Table Dimension QA', `
      <table style="table-layout: fixed;"><colgroup><col style="width: 180px;"><col style="width: 260px;"></colgroup>
      <tbody><tr style="height: 48px;"><td>A</td><td>B</td></tr></tbody></table>
    `);
    window.SutraNotifications.refresh();
    const notificationsBefore = window.SutraNotifications.getNotifications();
    const releaseNotice = notificationsBefore.find(item => item.source === 'release');
    if (releaseNotice) window.SutraNotifications.markRead(releaseNotice.key);
    const releaseState = window.SutraNotifications.exportState();
    const habit = hooks.addTimedHabit('Practice calculus', 45);
    const confirmed = hooks.confirmTimedHabit(habit.id);
    const duplicate = hooks.confirmTimedHabit(habit.id);
    const afterConfirm = hooks.getHabit(habit.id);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const yesterdaySchedule = [yesterday.getDay()];
    hooks.patchTimedHabit(habit.id, { completionHistory: {}, schedule: yesterdaySchedule, streak: 4, lastEvaluatedDate: '' });
    hooks.evaluateTimedHabits(new Date().toISOString());
    const afterMiss = hooks.getHabit(habit.id);
    const payload = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    window.deserializeWorkspace(payload);
    if (window.SutraNotifications && releaseState) window.SutraNotifications.importState(releaseState);
    const restored = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const restoredTable = restored.pages.find(item => item.id === tablePage.id);
    const restoredHabit = restored.habitTracker.habits.find(item => item.id === habit.id);
    return {
      tableHasColWidth: /width:\s*180px/i.test(restoredTable.content) && /height:\s*48px/i.test(restoredTable.content),
      releaseWasAvailable: !!releaseNotice,
      releaseReadPersisted: !!(window.SutraNotifications.exportState().read && window.SutraNotifications.exportState().read[releaseNotice && releaseNotice.key]),
      confirmed,
      duplicate,
      streakAfterConfirm: afterConfirm && afterConfirm.streak,
      yesterdayKey,
      streakAfterMiss: afterMiss && afterMiss.streak,
      restoredHabitType: restoredHabit && restoredHabit.type,
      restoredTargetMinutes: restoredHabit && restoredHabit.targetMinutes
    };
  });

  expect(result.tableHasColWidth).toBe(true);
  expect(result.releaseWasAvailable).toBe(true);
  expect(result.releaseReadPersisted).toBe(true);
  expect(result.confirmed).toBe(true);
  expect(result.duplicate).toBe(false);
  expect(result.streakAfterConfirm).toBe(1);
  expect(result.streakAfterMiss).toBe(0);
  expect(result.restoredHabitType).toBe('timed');
  expect(result.restoredTargetMinutes).toBe(45);
});
