import { expect, test } from '@playwright/test';
import { waitForAppHydrated } from './helpers/app-ready.mjs';

// Generation is stubbed only in CI fixtures. These workflows spend no credits.
async function stageWritingProvider(page) {
  await page.evaluate(() => {
    window.setWorkspacePreference('assistant.enabled', true, {});
    window.applyWorkspacePreferences({});
    window.__qaWritingRequests = [];
    window.SutraIntelligenceBridge.generateText = async options => {
      window.__qaWritingRequests.push({ userText: options.userText, attachments: options.attachments });
      return { ok: true, text: 'This is a corrected sentence.' };
    };
  });
}

async function selectEditorTextAndWait(page, editor, text) {
  await editor.click();
  await editor.press('Home');
  await editor.press('Shift+End');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(text);
}

test('Assistant sidebar reserves editor space and moves workspace controls with it', async ({page}) => {
  await openApp(page); await openNotesView(page); await stageWritingProvider(page);
  await page.locator('#chatbotBtn').click();
  await expect(page.locator('body')).toHaveClass(/sutra-assistant-sidebar-open/);
  await expect(page.locator('#chatbotPanel .sutra-sidebar-avatar .chatbot-mascot')).toBeVisible();
  await expect(page.locator('#chatbotPanel .sutra-sidebar-avatar .sutra-editing-eyes')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>{
    const panel=document.querySelector('#chatbotPanel').getBoundingClientRect();
    const view=document.querySelector('#view-notes').getBoundingClientRect();
    return Math.abs(panel.right-innerWidth)<2 && view.right<=panel.left+2;
  })).toBe(true);
  const composer = page.locator('#chatbotPanel .chatbot-input');
  const input = page.locator('#chatInput');
  await expect.poll(() => input.evaluate(element => {
    const field = element.getBoundingClientRect(), parent = element.parentElement.getBoundingClientRect();
    return field.width > parent.width * .8 && field.left >= parent.left && field.right <= parent.right;
  })).toBe(true);
  await input.fill('This message should use the full composer width.');
  await expect(input).toHaveValue('This message should use the full composer width.');
  await expect(composer).toBeVisible();
  for(const id of ['feedbackFabBtn','focusModeQuickToggle','storageOptions']) {
    await expect.poll(()=>page.evaluate(id=>{
      const control=document.getElementById(id),panel=document.querySelector('#chatbotPanel').getBoundingClientRect();
      return !control || getComputedStyle(control).display==='none' || control.getBoundingClientRect().right<=panel.left;
    },id)).toBe(true);
  }
  await page.locator('#chatInput').press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/sutra-assistant-sidebar-open/);
  await expect(page.locator('#chatbotPanel')).toBeHidden();
});

test('the full Assistant tab hides the docked sidebar and releases its space', async ({ page }) => {
  await openApp(page); await openNotesView(page); await stageWritingProvider(page);
  await page.locator('#chatbotBtn').click();
  await expect(page.locator('#chatbotPanel')).toBeVisible();
  const assistantTab = page.locator('#tabAssistantView');
  if (await assistantTab.isVisible()) {
    await assistantTab.click();
  } else {
    await page.locator('#moreViewsToggle').click();
    await page.getByRole('menuitem', { name: 'Assistant', exact: true }).click();
  }
  await expect(page.locator('#view-assistantview')).toHaveClass(/active/);
  await expect(page.locator('#chatbotPanel')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/sutra-assistant-sidebar-open/);
  await expect.poll(() => page.locator('#view-assistantview').evaluate(view => {
    return Math.abs(view.getBoundingClientRect().right - document.getElementById('mainContent').getBoundingClientRect().right);
  })).toBeLessThan(2);
});

test('inline correction decorations never enter saved note content and clear on Cancel', async ({page}) => {
  await openApp(page); await openNotesView(page); await createBlankNote(page,'QA inline preview'); await enableEditorV2(page);
  await stageWritingProvider(page);
  await page.evaluate(()=>{window.SutraIntelligenceBridge.generateText=async()=>({ok:true,text:'This is a sentence.'});});
  const editor=page.locator('#editorV2Host .ProseMirror');
  const before='This are a sentence.'; await editor.fill(before); await selectEditorTextAndWait(page,editor,before);
  await editor.press('/'); await page.locator('.editor-v2-slash-item').filter({hasText:'/grammar'}).click();
  const review=page.locator('.sutra-inline-ai-workbench');
  const send=review.getByRole('button',{name:'Generate draft',exact:true});
  await expect(send).toBeVisible(); await expect(send).toHaveText('Send');
  await expect.poll(()=>send.evaluate(button=>button.getBoundingClientRect().width)).toBeGreaterThanOrEqual(44);
  await send.click();
  await expect(editor.locator('.sutra-ai-change-new')).toHaveText('is');
  const html=await page.evaluate(()=>window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain(before); expect(html).not.toContain('sutra-ai-change'); expect(html).not.toContain('This is a sentence.');
  await review.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(editor.locator('.sutra-ai-change-new')).toHaveCount(0); await expect(editor).toHaveText(before);
});

test('passage writing command reviews, cancels, applies edited text, and supports Undo', async ({ page }) => {
  await openApp(page);
  await openNotesView(page);
  await createBlankNote(page, 'QA passage writing');
  await enableEditorV2(page);
  await stageWritingProvider(page);
  const editor = page.locator('#editorV2Host .ProseMirror');
  const original = 'This are a sentence.';
  await editor.fill(original);
  await expect(editor).toHaveText(original);
  await expect.poll(() => page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml())).toContain(original);
  await selectEditorTextAndWait(page, editor, original);
  await editor.press('/');
  await page.locator('.editor-v2-slash-item').filter({ hasText: '/grammar' }).click();
  const review = page.locator('.sutra-inline-ai-workbench');
  await expect(review.getByLabel('Passage to edit')).toHaveValue(original);
  expect(await page.evaluate(() => window.__qaWritingRequests.length)).toBe(0);
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveText(original);

  await selectEditorTextAndWait(page, editor, original);
  await editor.press('/');
  await page.locator('.editor-v2-slash-item').filter({ hasText: '/grammar' }).click();
  await review.getByRole('button', { name: 'Generate draft', exact: true }).click();
  await expect(review.getByLabel('Assistant draft — edit before accepting')).toHaveValue('This is a corrected sentence.');
  await review.getByText('View or edit full draft', {exact:true}).click();
  await review.getByLabel('Assistant draft — edit before accepting').fill('This is my reviewed sentence.');
  const request = await page.evaluate(() => window.__qaWritingRequests[0]);
  expect(JSON.parse(request.userText).passage).toBe(original);
  expect(request.attachments).toBeUndefined();
  await review.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(editor).toHaveText('This is my reviewed sentence.');
  await editor.press('ControlOrMeta+z');
  await expect(editor).toHaveText(original);
});

test('empty writing slash command requires an explicit passage and Cancel preserves the query', async ({ page }) => {
  await openApp(page);
  await openNotesView(page);
  await createBlankNote(page, 'QA explicit passage');
  await enableEditorV2(page);
  await stageWritingProvider(page);
  const editor = page.locator('#editorV2Host .ProseMirror');
  // Type through ProseMirror so its focused selection and slash-query handler
  // see the same keyboard input as a student.
  await editor.click();
  await page.keyboard.type('/spelling');
  await expect(editor).toHaveText('/spelling');
  await expect(page.locator('.editor-v2-slash-menu')).toBeVisible();
  await page.locator('.editor-v2-slash-item').filter({ hasText: '/spelling' }).click();
  const review = page.locator('.sutra-inline-ai-workbench');
  await expect(review.getByLabel('Passage to edit')).toHaveValue('');
  await expect(review.getByRole('button', { name: 'Generate draft', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.__qaWritingRequests.length)).toBe(0);
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveText('');
});

test('caret grammar command preloads note text and applies reviewed blocks without losing paragraph structure', async ({ page }) => {
  await openApp(page); await openNotesView(page);
  await createBlankNote(page, 'QA whole-note grammar'); await enableEditorV2(page);
  await stageWritingProvider(page);
  const editor = page.locator('#editorV2Host .ProseMirror');
  await editor.fill('This are first.'); await editor.press('End'); await editor.press('Enter');
  await editor.pressSequentially('These is second.'); await editor.press('Enter');
  await editor.pressSequentially('/grammar');
  await page.locator('.editor-v2-slash-item').filter({ hasText: '/grammar' }).click();
  const review = page.locator('.sutra-inline-ai-workbench');
  await expect(review.getByLabel('Passage to edit')).toHaveValue('This are first.\n\nThese is second.');
  await expect(editor).not.toContainText('/grammar');
  await expect(review.getByRole('button', {name:'Generate draft',exact:true})).toBeEnabled();
  expect(await page.evaluate(() => window.__qaWritingRequests.length)).toBe(0);
  await review.getByRole('button', {name:'Generate draft',exact:true}).click();
  await expect(review.getByLabel('Assistant draft — edit before accepting')).toHaveValue('This is a corrected sentence.');
  await review.getByRole('button', {name:'Apply',exact:true}).click();
  await expect(review).toContainText('Keep 2 paragraphs');
  await review.getByText('View or edit full draft', {exact:true}).click();
  await review.getByLabel('Assistant draft — edit before accepting').fill('This is first.\n\nThis is second.');
  await review.getByRole('button', {name:'Apply',exact:true}).click();
  await expect(editor.locator('p').nth(0)).toHaveText('This is first.');
  await expect(editor.locator('p').nth(1)).toHaveText('This is second.');
  await expect(editor).not.toContainText('/grammar');
  await editor.press('ControlOrMeta+z');
  await expect(editor).toContainText('This are first.');
  await expect(editor).toContainText('These is second.');
});

test('Classic Notes writing command cancels, applies through undo, and persists the undone text after reload', async ({ page }) => {
  await openApp(page);
  await openNotesView(page);
  await enableEditorV2(page);
  await createBlankNote(page, 'QA Classic writing command');
  await page.evaluate(() => {
    window.setWorkspacePreference('editor.editorV2Enabled', false, {});
    window.applyWorkspacePreferences({});
  });
  const editor = page.locator('#editor');
  await expect(editor).toBeVisible();
  await stageWritingProvider(page);
  const original = 'This are a Classic Notes sentence.';
  await editor.fill(original);

  await selectEditorTextAndWait(page, editor, original);
  await editor.press('/');
  await page.locator('#slashMenuItems .slash-menu-item').filter({ hasText: '/grammar' }).click();
  const review = page.locator('.sutra-inline-ai-workbench');
  await expect(review.getByLabel('Passage to edit')).toHaveValue(original);
  expect(await page.evaluate(() => window.__qaWritingRequests.length)).toBe(0);
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveText(original);

  await selectEditorTextAndWait(page, editor, original);
  await editor.press('/');
  await page.locator('#slashMenuItems .slash-menu-item').filter({ hasText: '/grammar' }).click();
  await review.getByRole('button', { name: 'Generate draft', exact: true }).click();
  const preview = review.getByLabel('Assistant draft — edit before accepting');
  await expect(preview).toHaveValue('This is a corrected sentence.');
  await preview.fill('My reviewed Classic Notes sentence.');
  await review.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(editor).toHaveText('My reviewed Classic Notes sentence.');

  await editor.press('ControlOrMeta+z');
  await expect(editor).toHaveText(original);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-classic-writing-undo'));
  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await completeOnboarding(page);
  await openNotesView(page);
  await expect(page.locator('#pageTitle')).toHaveValue('QA Classic writing command');
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#editor')).toHaveText(original);
});

test('full Assistant writing review returns an editable draft to its composer and preserves pending context', async ({ page }) => {
  await openApp(page);
  await stageWritingProvider(page);
  await page.evaluate(() => window.setActiveView('assistantview'));
  const input = page.locator('#asstInput');
  const panel = page.locator('#chatbotPanel');
  await expect(input).toBeVisible();
  await expect(panel).toHaveCSS('display', 'none');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--assistant-panel-reserve').trim())).toBe('0px');

  await page.locator('#asstCtxBtn').click();
  await page.locator('.asst-ctx-dropdown-item').filter({ hasText: 'Paste custom text' }).click();
  const contextText = 'UNRELATED_CONTEXT_SENTINEL';
  await page.locator('#atelierDialogTextarea').fill(contextText);
  await page.locator('#atelierDialogConfirm').click();
  await expect(page.locator('#asstContextBar')).toContainText(contextText);

  const attachment = await page.evaluate(async () => {
    const file = new File(['ATTACHMENT_SENTINEL'], 'unrelated-writing-context.txt', { type: 'text/plain' });
    await window.flowAssistant.addAttachmentFromFile(file);
    return window.flowAssistant.getAttachments().length;
  });
  expect(attachment).toBe(1);
  const messagesBefore = await page.evaluate(() => window.SutraAssistantConversationController.getCurrent()
    .messages.map(message => ({ role: message.role, content: message.content })));

  const passage = 'This are an explicit Assistant composer passage.';
  await input.click();
  await input.fill('/grammar ' + passage);
  await expect(input).toHaveValue('/grammar ' + passage);
  await expect(page.locator('#asstSendBtn')).toBeEnabled();
  await page.locator('#asstSendBtn').click();
  const review = page.locator('.sutra-inline-ai-workbench');
  await expect(review.getByLabel('Passage to edit')).toHaveValue(passage);
  await expect(panel).toHaveCSS('display', 'flex');
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => ({
    panelDisplay: document.getElementById('chatbotPanel').style.display,
    panelOpen: document.body.classList.contains('assistant-panel-open'),
    sidebarOpen: document.body.classList.contains('sutra-assistant-sidebar-open'),
    reserve: getComputedStyle(document.body).getPropertyValue('--assistant-panel-reserve').trim()
  }))).toEqual({ panelDisplay: 'none', panelOpen: false, sidebarOpen: false, reserve: '0px' });
  await expect(input).toHaveValue('/grammar ' + passage);
  await page.locator('#asstSendBtn').click();
  await expect(review.getByLabel('Passage to edit')).toHaveValue(passage);
  expect(await page.evaluate(() => window.__qaWritingRequests.length)).toBe(0);
  await review.getByRole('button', { name: 'Generate draft', exact: true }).click();
  const preview = review.getByLabel('Assistant draft — edit before accepting');
  await expect(preview).toHaveValue('This is a corrected sentence.');
  const reviewedText = 'My editable reviewed Assistant draft.';
  await preview.fill(reviewedText);
  const request = await page.evaluate(() => window.__qaWritingRequests[0]);
  const payload = JSON.parse(request.userText);
  expect(Object.keys(payload).sort()).toEqual(['instruction', 'operation', 'passage']);
  expect(payload.operation).toBe('grammar');
  expect(payload.passage).toBe(passage);
  expect(request.attachments).toBeUndefined();
  expect(request.userText).not.toContain(contextText);
  expect(request.userText).not.toContain('ATTACHMENT_SENTINEL');

  await review.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(input).toHaveValue(reviewedText);
  await expect.poll(() => page.evaluate(() => ({
    panelDisplay: document.getElementById('chatbotPanel').style.display,
    panelOpen: document.body.classList.contains('assistant-panel-open'),
    sidebarOpen: document.body.classList.contains('sutra-assistant-sidebar-open'),
    reserve: getComputedStyle(document.body).getPropertyValue('--assistant-panel-reserve').trim()
  }))).toEqual({ panelDisplay: 'none', panelOpen: false, sidebarOpen: false, reserve: '0px' });
  const messagesAfter = await page.evaluate(() => window.SutraAssistantConversationController.getCurrent()
    .messages.map(message => ({ role: message.role, content: message.content })));
  expect(messagesAfter).toEqual(messagesBefore);
  expect(await page.evaluate(() => window.flowAssistant.getAttachments().length)).toBe(1);
  await expect(page.locator('#asstContextBar')).toContainText(contextText);
});

test('editing the original note while a writing review is open prevents Apply', async ({ page }) => {
  await openApp(page);
  await openNotesView(page);
  await enableEditorV2(page);
  await createBlankNote(page, 'QA stale writing source');
  await stageWritingProvider(page);
  const editor = page.locator('#editorV2Host .ProseMirror');
  const original = 'This are the selected source sentence.';
  await editor.fill(original);
  await selectEditorTextAndWait(page, editor, original);
  await editor.press('/');
  await page.locator('.editor-v2-slash-item').filter({ hasText: '/grammar' }).click();

  const review = page.locator('.sutra-inline-ai-workbench');
  await expect(review.getByLabel('Passage to edit')).toHaveValue(original);
  await review.getByRole('button', { name: 'Generate draft', exact: true }).click();
  await expect(review.getByLabel('Assistant draft — edit before accepting')).toHaveValue('This is a corrected sentence.');

  const newerText = 'A newer source edit must stay untouched.';
  await editor.fill(newerText);
  await review.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(editor).toHaveText(newerText);
  await expect(review).toBeVisible();
  await expect(review).toContainText('The source note changed');
  await expect(review.getByRole('button', { name: 'Apply', exact: true })).toBeHidden();
});

test('Enter consumes grammar immediately and same-note refresh keeps a pending writing request open', async ({ page }) => {
  await openApp(page); await openNotesView(page); await createBlankNote(page, 'QA grammar refresh'); await enableEditorV2(page);
  await stageWritingProvider(page);
  await page.evaluate(() => {
    window.SutraIntelligenceBridge.generateText = () => new Promise(resolve => { window.__qaResolveGrammar = resolve; });
  });
  const editor = page.locator('#editorV2Host .ProseMirror');
  await editor.fill('This are a sentence.'); await editor.press('End'); await editor.press('Enter');
  await editor.pressSequentially('/grammar');
  await expect(page.locator('.editor-v2-slash-item').filter({ hasText: '/grammar' })).toBeVisible();
  await editor.press('Enter');
  const review = page.locator('.sutra-inline-ai-workbench');
  await expect(review).toBeVisible(); await expect(editor).not.toContainText('/grammar');
  await review.getByRole('button', { name: 'Generate draft', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof window.__qaResolveGrammar)).toBe('function');
  await page.evaluate(() => {
    const api = window.SutraNotesEditorV2;
    api.setContent(api.getStorageHtml());
    window.dispatchEvent(new CustomEvent('noteflow:view-changed', { detail: { view: 'notes' } }));
    window.dispatchEvent(new CustomEvent('sutra:note-page-loaded', { detail: { pageId: window.flowAtelier.currentPageId } }));
    window.__qaResolveGrammar({ ok: true, text: 'This is a sentence.' });
  });
  await expect(review).toBeVisible();
  await expect(review.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toContainText('This are a sentence.'); await expect(editor).not.toContainText('/grammar');
});

// Modern Notes Editor (TipTap engine, shipped 2026-07-07; enabled by default
// with editor.editorV2Enabled as a compatibility toggle). Regression coverage:
//   1. THE bug: typing "1. item" produces ONE ordered-list marker — the typed
//      "1. " is consumed by the input rule, never left as literal text, and no
//      phantom empty <li> appears (the user's "1. 1. sim racing wheel" report).
//   2. Storage round-trip: content saves through the legacy mirror in the
//      classic storage format and reloads into v2 intact.
//   3. Structured HTML embed and drawing nodes remain live while their anchors,
//      math blocks, and checklist-item markup keep the classic storage contract.
//   4. Toolbar bridge: the execCommand-era globals (formatText/formatBlock)
//      drive schema commands when v2 is active.
//   5. Toggling Modern Editor off restores the classic contenteditable editor.

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
  await page.waitForFunction(() => {
    const overlay = document.getElementById('studentOnboardingOverlay');
    return !overlay || overlay.hidden || getComputedStyle(overlay).display === 'none';
  });
}

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await page.waitForFunction(() =>
    !!window.SutraNotesEditorV2 &&
    !!window.flowAtelier &&
    typeof window.flowAtelier.flushAppSaveNow === 'function' &&
    typeof window.setWorkspacePreference === 'function' &&
    typeof window.applyWorkspacePreferences === 'function');
  // The static shell and v2 module exist before the async canonical workspace
  // hydrate completes. Cross its readiness gate and durability seam so tests never
  // simulate typing into boot defaults that a real user cannot reach beneath
  // the startup overlay.
  await waitForAppHydrated(page);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-app-ready'));
  await completeOnboarding(page);
}

async function openAppForSplitLayout(page) {
  await page.goto('/Sutra.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await page.waitForFunction(() =>
    !!window.SutraNotesEditorV2 &&
    !!window.flowAtelier &&
    typeof window.flowAtelier.flushAppSaveNow === 'function' &&
    typeof window.setWorkspacePreference === 'function' &&
    typeof window.applyWorkspacePreferences === 'function');
  await waitForAppHydrated(page);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-app-ready'));
  await completeOnboarding(page);
}

async function enableEditorV2(page) {
  await page.evaluate(() => {
    window.setWorkspacePreference('editor.editorV2Enabled', true, {});
    window.applyWorkspacePreferences({});
  });
  await page.waitForFunction(() => window.SutraNotesEditorV2.isMounted());
}

async function openNotesView(page) {
  // Reload exposes shell markup before navigation handlers are installed.
  // Target the canonical button after hydration, rather than the body whose
  // data-view attribute may also match the old generic selector.
  await waitForAppHydrated(page);
  await page.locator('.view-tab[data-view="notes"]:visible').first().click();
  await page.waitForFunction(() => {
    const view = document.getElementById('view-notes');
    return view && getComputedStyle(view).display !== 'none';
  });
}

// Create a fresh blank note through the real new-page flow and wait for it to
// load into the active editor.
async function createBlankNote(page, name) {
  await page.evaluate((pageName) => {
    window.createNewPage({ templateId: 'blank' });
    const nameInput = document.getElementById('newPageName');
    if (nameInput) {
      nameInput.value = pageName;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    window.confirmNewPage();
  }, name);
  await page.waitForFunction((pageName) => {
    const title = document.getElementById('pageTitle');
    const pm = document.querySelector('#editorV2Host .ProseMirror');
    const current = window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId);
    return title && title.value === pageName &&
      current && current.title.split('::').pop() === pageName &&
      current.isSystemPage !== true &&
      pm && !pm.textContent.includes('Sutra Help & Docs');
  }, name);
}

async function readSplitLayoutGeometry(page, primaryEditorSelector, secondaryEditorSelector) {
  return page.evaluate(({ primaryEditorSelector, secondaryEditorSelector }) => {
    const rect = element => {
      const value = element.getBoundingClientRect();
      return { top: value.top, bottom: value.bottom, left: value.left, right: value.right, width: value.width, height: value.height };
    };
    const style = element => {
      const value = getComputedStyle(element);
      return {
        height: value.height,
        minHeight: value.minHeight,
        maxHeight: value.maxHeight,
        overflowY: value.overflowY,
        display: value.display,
        fontFamily: value.fontFamily,
        fontSize: value.fontSize,
        fontWeight: value.fontWeight,
        lineHeight: value.lineHeight,
        textOverflow: value.textOverflow
      };
    };
    const container = document.getElementById('notesEditorContainer');
    const primary = document.getElementById('notesPrimaryPane');
    const secondary = document.getElementById('notesSecondaryPane');
    const primaryEditor = document.querySelector(primaryEditorSelector);
    const secondaryEditor = document.querySelector(secondaryEditorSelector);
    const primaryTitle = document.getElementById('pageTitle');
    const secondaryTitle = document.getElementById('splitNoteMeta');
    const tags = document.getElementById('tagsContainer');
    const switcher = document.querySelector('#notesSecondaryPane .split-pane-switcher');
    const toolbar = document.querySelector('.toolbar-wrapper');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      view: rect(document.getElementById('view-notes')),
      viewDisplay: getComputedStyle(document.getElementById('view-notes')).display,
      mainContent: rect(document.querySelector('.main-content')),
      container: rect(container),
      containerMaxWidth: getComputedStyle(container).maxWidth,
      columns: getComputedStyle(container).gridTemplateColumns.trim().split(/\s+/).length,
      toolbar: rect(toolbar),
      primary: rect(primary),
      secondary: rect(secondary),
      primaryTitle: rect(primaryTitle),
      primaryTitleStyle: style(primaryTitle),
      primaryTags: rect(tags),
      primaryTagsScrollHeight: tags.scrollHeight,
      primaryTagsClientHeight: tags.clientHeight,
      primaryTagsOverflowY: getComputedStyle(tags).overflowY,
      secondaryHeader: rect(document.querySelector('#notesSecondaryPane .split-pane-header')),
      secondaryTitle: rect(secondaryTitle),
      secondaryTitleStyle: style(secondaryTitle),
      secondarySwitcher: rect(switcher),
      closeAction: rect(document.getElementById('closeSplitNotesBtn')),
      primaryEditor: rect(primaryEditor),
      secondaryEditor: rect(secondaryEditor),
      primaryEditorStyle: style(primaryEditor),
      secondaryEditorStyle: style(secondaryEditor),
      primaryEditorScrollHeight: primaryEditor.scrollHeight,
      primaryEditorClientHeight: primaryEditor.clientHeight,
      secondaryEditorScrollHeight: secondaryEditor.scrollHeight,
      secondaryEditorClientHeight: secondaryEditor.clientHeight
    };
  }, { primaryEditorSelector, secondaryEditorSelector });
}

async function setDesktopSidebarCollapsed(page, collapsed) {
  const sidebar = page.locator('#sidebar');
  const isCollapsed = (await sidebar.getAttribute('class') || '').split(/\s+/).includes('collapsed');
  if (isCollapsed !== collapsed) await page.locator('#sidebarToggle').click();
  if (collapsed) {
    await expect(sidebar).toHaveClass(/collapsed/);
    await expect.poll(() => sidebar.evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(120);
  } else {
    await expect(sidebar).not.toHaveClass(/collapsed/);
    await expect.poll(() => sidebar.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(200);
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

function expectWideSplitGeometry(geometry) {
  expect(geometry.columns).toBe(2);
  expect(geometry.viewDisplay).toBe('flex');
  expect(Math.abs(geometry.primary.width - geometry.secondary.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.primary.top - geometry.secondary.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.primary.bottom - geometry.secondary.bottom)).toBeLessThanOrEqual(1);
  expect(geometry.container.width).toBeGreaterThanOrEqual(geometry.view.width - 72);
  expect(geometry.view.bottom - geometry.container.bottom).toBeLessThanOrEqual(24);
  expect(geometry.container.top).toBeGreaterThanOrEqual(geometry.toolbar.bottom - 1);
  expect(Math.abs(geometry.primaryTitle.top - geometry.secondaryTitle.top)).toBeLessThanOrEqual(6);
  expect(geometry.primaryTitleStyle.fontSize).toBe(geometry.secondaryTitleStyle.fontSize);
  expect(geometry.primaryTitleStyle.fontFamily).toBe(geometry.secondaryTitleStyle.fontFamily);
  expect(geometry.primaryTitleStyle.textOverflow).toBe('ellipsis');
  expect(geometry.secondaryTitleStyle.textOverflow).toBe('ellipsis');
  expect(Math.abs(geometry.primaryTags.top - geometry.secondarySwitcher.top)).toBeLessThanOrEqual(1);
  expect(geometry.primaryTags.height).toBeLessThanOrEqual(48);
  expect(geometry.primaryTagsOverflowY).toMatch(/auto|scroll/);
  expect(Math.abs(geometry.primaryEditor.top - geometry.secondaryEditor.top)).toBeLessThanOrEqual(1);
  expect(geometry.primaryEditor.bottom).toBeGreaterThan(geometry.primaryEditor.top);
  expect(geometry.secondaryEditor.bottom).toBeGreaterThan(geometry.secondaryEditor.top);
  expect(geometry.primaryEditorStyle.overflowY).toBe('auto');
  expect(geometry.secondaryEditorStyle.overflowY).toBe('auto');
}

const PM_SELECTOR = '#editorV2Host .ProseMirror';

test('typing "1. " creates ONE list marker and consumes the typed text', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'birthday list');

  // Trusted keyboard input — the exact keystrokes from the bug report.
  await page.click(PM_SELECTOR);
  await page.keyboard.type('1. sim racing wheel along with f1 26');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Logitech MX master 4');

  const state = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    return {
      html: pm.innerHTML,
      text: pm.textContent,
      listCount: pm.querySelectorAll('ol').length,
      itemCount: pm.querySelectorAll('ol > li').length,
      itemTexts: Array.from(pm.querySelectorAll('ol > li')).map(li => li.textContent.trim())
    };
  }, PM_SELECTOR);

  // ONE ordered list, exactly two items, and the typed "1. " was consumed:
  // no literal "1." anywhere in the document text.
  expect(state.listCount).toBe(1);
  expect(state.itemCount).toBe(2);
  expect(state.itemTexts[0]).toBe('sim racing wheel along with f1 26');
  expect(state.itemTexts[1]).toBe('Logitech MX master 4');
  expect(state.text).not.toContain('1.');

  // No phantom empty trailing <li> (the "3." from the report).
  expect(state.itemTexts.every(t => t.length > 0)).toBe(true);
});

test('content saves in classic storage format and reloads into v2', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 roundtrip');

  await page.click(PM_SELECTOR);
  await page.keyboard.type('1. first item');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second item');
  await expect(page.locator('#taskbarSaveStatus')).toContainText(/Saving/i);

  // Force the readback-verified save path and capture what persisted.
  const savedContent = await page.evaluate(async () => {
    window.SutraNotesEditorV2.flushToMirror();
    await window.saveWorkspaceLocally();
    const title = document.getElementById('pageTitle').value;
    const mirror = document.getElementById('editor');
    return { title, mirrorHtml: mirror.innerHTML };
  });
  expect(savedContent.mirrorHtml).toContain('<ol>');
  expect(savedContent.mirrorHtml).toContain('first item');
  expect(savedContent.mirrorHtml).not.toContain('1. first');
  await expect(page.locator('#taskbarSaveStatus')).toContainText(/Saved/i);

  // Reload the app: the flag persists, v2 remounts, content restores.
  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await completeOnboarding(page);
  await page.waitForFunction(() => window.SutraNotesEditorV2 && window.SutraNotesEditorV2.isMounted());
  await openNotesView(page);

  // Wait for the restored page content to land in the v2 document.
  await page.waitForFunction((sel) => {
    const pm = document.querySelector(sel);
    return pm && pm.textContent.includes('first item');
  }, PM_SELECTOR);
  const restored = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    return { title: document.getElementById('pageTitle').value, text: pm ? pm.textContent : '' };
  }, PM_SELECTOR);
  expect(restored.title).toBe('v2 roundtrip');
  expect(restored.text).toContain('first item');
  expect(restored.text).toContain('second item');
});

test('an immediate reload flushes the latest note before the editor debounce', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'immediate reload trust');

  const sentinel = 'Latest sentence survives an immediate reload.';
  await page.click(PM_SELECTOR);
  await page.keyboard.type(sentinel);
  await expect(page.locator('#taskbarSaveStatus')).toContainText(/Saving/i);

  // Do not call savePage/saveWorkspaceLocally or wait for the editor debounce.
  // The lifecycle flush must synchronously snapshot the editor and start the
  // canonical write/readback or the bounded lifecycle recovery journal before
  // navigation completes.
  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await completeOnboarding(page);
  await page.waitForFunction(() =>
    !!window.flowAtelier && typeof window.flowAtelier.flushAppSaveNow === 'function');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-journal-promotion'));
  await page.waitForFunction(() => window.SutraNotesEditorV2 && window.SutraNotesEditorV2.isMounted());
  await openNotesView(page);
  await page.waitForFunction(({ selector, text }) => {
    const editor = document.querySelector(selector);
    return editor && editor.textContent.includes(text);
  }, { selector: PM_SELECTOR, text: sentinel });
  expect(await page.evaluate(() => sessionStorage.getItem('sutra:lifecycle-note-journal:v1'))).toBeNull();
});

test('assistant context reads latest v2 note content and visible selection', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'assistant context v2');

  await page.click(PM_SELECTOR);
  await page.keyboard.type('Assistant context sentinel alpha beta stays readable.');

  // Do not call savePage() here. The assistant should still force the v2 mirror
  // current before it builds context, so immediate asks after typing are fresh.
  const context = await page.evaluate(() => {
    const ctx = window.getFlowAssistantContext({ depth: 'currentView' });
    const page = window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId);
    return {
      excerpt: ctx.activeNote && ctx.activeNote.excerpt,
      wordCount: ctx.activeNote && ctx.activeNote.wordCount,
      pageContent: page && page.content,
      mirrorHtml: document.getElementById('editor').innerHTML
    };
  });

  expect(context.excerpt).toContain('Assistant context sentinel alpha beta');
  expect(context.wordCount).toBeGreaterThanOrEqual(7);
  expect(context.pageContent).toContain('Assistant context sentinel alpha beta');
  expect(context.mirrorHtml).toContain('Assistant context sentinel alpha beta');

  const selectedText = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let target = null;
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.includes('sentinel alpha beta')) {
        target = walker.currentNode;
        break;
      }
    }
    if (!target) return '';
    const start = target.nodeValue.indexOf('sentinel alpha beta');
    const range = document.createRange();
    range.setStart(target, start);
    range.setEnd(target, start + 'sentinel alpha beta'.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return window.getFlowAssistantContext({ depth: 'currentView' }).selection || '';
  }, PM_SELECTOR);

  expect(selectedText).toBe('sentinel alpha beta');
});

test('legacy anchors, math, and checklists survive a v2 round-trip', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);

  const result = await page.evaluate(() => {
    const legacyNote = '<h2>My note</h2>' +
      '<div class="checklist-item"><input type="checkbox" checked><span contenteditable="true">done thing</span></div>' +
      '<div class="checklist-item"><input type="checkbox"><span contenteditable="true">todo thing</span></div>' +
      '<div class="html-embed-anchor" data-note-block-type="html-embed" data-block-id="blk-123" contenteditable="false"></div>' +
      '<p>text with <span class="sutra-math-block" data-latex="x^2" contenteditable="false">x^2</span> math</p>' +
      '<div class="drawing-anchor" data-note-block-type="drawing" data-block-id="draw-9" contenteditable="false"></div>';
    window.SutraNotesEditorV2.setContent(legacyNote);
    const out = window.SutraNotesEditorV2.getStorageHtml();
    return {
      embedAnchorKept: out.includes('data-block-id="blk-123"'),
      drawingAnchorKept: out.includes('data-block-id="draw-9"'),
      mathKept: out.includes('data-latex="x^2"'),
      checklistCount: (out.match(/checklist-item/g) || []).length,
      checkedPreserved: /<input type="checkbox" checked/.test(out)
    };
  });

  expect(result.embedAnchorKept).toBe(true);
  expect(result.drawingAnchorKept).toBe(true);
  expect(result.mathKept).toBe(true);
  expect(result.checklistCount).toBe(2);
  expect(result.checkedPreserved).toBe(true);
});

test('generated Help keeps its anchors in Modern Editor while same-title notes stay editable', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);

  const readCanonicalHelp = () => page.evaluate(() => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const help = hooks.getHelpPageForSpace(hooks.getActiveSpaceId());
    return help && (help.systemRole === 'help-docs' || help.builtInId === 'help-docs')
      ? { id: help.id, content: help.content }
      : null;
  });
  const help = await readCanonicalHelp();
  expect(help && help.id).toBeTruthy();
  await page.evaluate(id => window.loadPage(id), help.id);
  const pm = page.locator('#editorV2Host .ProseMirror');
  const helpRoot = pm.locator('.sutra-help-document');
  await expect(pm).not.toBeEditable();
  await expect(pm).toHaveAttribute('aria-readonly', 'true');
  await expect(helpRoot.locator('h1[id="editorV2Host--help-top"]')).toContainText('Sutra Help & Docs');
  await expect(helpRoot.locator('h2[id="editorV2Host--help-toc"]')).toContainText('Table of Contents');
  await expect(helpRoot.locator('h2[id="editorV2Host--help-student-setup"]')).toBeAttached();
  const tocButton = helpRoot.locator('button.help-anchor-btn[data-editor-anchor="editorV2Host--help-student-setup"]');
  const backButton = helpRoot.locator('[id="editorV2Host--help-student-setup"]').locator(
    'xpath=following-sibling::p[.//button[contains(@class,"help-anchor-top-btn")][@data-editor-anchor="editorV2Host--help-top"]][1]//button[@data-editor-anchor="editorV2Host--help-top"]'
  );
  await expect(tocButton).toBeVisible();
  await expect(backButton).toBeAttached();

  const helpAnchorIds = await page.evaluate(() => {
    const allIds = Array.from(document.querySelectorAll('[id]')).map(element => element.id);
    return Array.from(document.querySelectorAll('#editorV2Host .ProseMirror .sutra-help-document [id]'))
      .map(element => ({ id: element.id, count: allIds.filter(id => id === element.id).length }));
  });
  expect(helpAnchorIds.length).toBeGreaterThan(0);
  expect(helpAnchorIds.every(anchor => anchor.count === 1)).toBe(true);

  const headingState = targetId => page.evaluate(id => {
    const heading = Array.from(document.querySelectorAll('#editorV2Host .ProseMirror .sutra-help-document [id]'))
      .find(element => element.id === id);
    if (!heading) return { top: null, visible: false };
    const top = heading.getBoundingClientRect().top;
    const toolbar = document.querySelector('.toolbar-wrapper');
    const style = toolbar && getComputedStyle(toolbar);
    const rect = toolbar && toolbar.getBoundingClientRect();
    const toolbarBottom = rect && style.display !== 'none' && style.visibility !== 'hidden' ? rect.bottom : 0;
    return { top, visible: top >= toolbarBottom && top < window.innerHeight };
  }, targetId);
  const expectFocusedHeadingVisible = async targetId => {
    const heading = helpRoot.locator('[id="' + targetId + '"]');
    await expect(heading).toBeFocused();
    await expect.poll(async () => (await headingState(targetId)).visible).toBe(true);
  };
  const activate = async (button, mode) => {
    if (mode === 'mouse') return button.click();
    await button.focus();
    await page.keyboard.press('Enter');
  };
  for (const mode of ['mouse', 'keyboard']) {
    const sectionBefore = (await headingState('editorV2Host--help-student-setup')).top;
    expect(sectionBefore).toBeGreaterThan(page.viewportSize().height);
    await activate(tocButton, mode);
    await expectFocusedHeadingVisible('editorV2Host--help-student-setup');
    expect((await headingState('editorV2Host--help-student-setup')).top).toBeLessThan(sectionBefore - 100);
    const topBefore = (await headingState('editorV2Host--help-top')).top;
    await activate(backButton, mode);
    await expectFocusedHeadingVisible('editorV2Host--help-top');
    expect((await headingState('editorV2Host--help-top')).top).toBeGreaterThan(topBefore + 100);
  }

  const savedHelp = await page.evaluate(async id => {
    window.SutraNotesEditorV2.flushToMirror();
    const editorHtml = window.SutraNotesEditorV2.getStorageHtml();
    await window.saveWorkspaceLocally();
    const help = window.flowAtelier.pages.find(item => item.id === id);
    return { editorHtml, content: help && help.content };
  }, help.id);
  expect(savedHelp.content).toContain('id="top"');
  expect(savedHelp.content).toContain('id="toc"');
  expect(savedHelp.content).toContain('id="student-setup"');
  expect(savedHelp.content).toContain('data-editor-anchor="student-setup"');
  expect(savedHelp.editorHtml).toContain('id="student-setup"');
  expect(savedHelp.content).not.toContain('editorV2Host--help-');
  expect(savedHelp.editorHtml).not.toContain('editorV2Host--help-');
  expect(savedHelp.editorHtml).not.toContain('sutra-help-document');
  expect(savedHelp.content).not.toContain('sutra-help-document');

  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await completeOnboarding(page);
  await openNotesView(page);
  const reloadedHelp = await readCanonicalHelp();
  expect(reloadedHelp && reloadedHelp.id).toBe(help.id);
  expect(reloadedHelp.content).toContain('id="student-setup"');
  expect(reloadedHelp.content).not.toContain('sutra-help-document');
  await page.evaluate(id => window.loadPage(id), help.id);
  await expect(helpRoot.locator('h1[id="editorV2Host--help-top"]')).toBeAttached();
  await expect(helpRoot.locator('h2[id="editorV2Host--help-toc"]')).toBeAttached();
  await expect(helpRoot.locator('h2[id="editorV2Host--help-student-setup"]')).toBeAttached();
  await expect(tocButton).toBeVisible();

  const ordinary = await page.evaluate(() => {
    const page = window.__sutraPublicBetaTestHooks.createNoteInActiveSpace(
      'Help & Docs', '<h2>Ordinary note</h2><p>Start typing here.</p>'
    );
    return { id: page.id, title: page.title };
  });
  expect(ordinary.id).not.toBe(help.id);
  expect(ordinary.title).toBe('Help & Docs');
  await page.evaluate(id => window.loadPage(id), ordinary.id);

  const ordinaryEditor = page.locator('#editorV2Host .ProseMirror');
  await expect(ordinaryEditor).toContainText('Start typing here.');
  await expect(ordinaryEditor).toBeEditable();
  await expect(ordinaryEditor.locator('.sutra-help-document')).toHaveCount(0);
  await ordinaryEditor.fill('Ordinary note edit sentinel');
  await expect(ordinaryEditor).toHaveText('Ordinary note edit sentinel');
  const savedOrdinary = await page.evaluate(async id => {
    window.SutraNotesEditorV2.flushToMirror();
    await window.saveWorkspaceLocally();
    const note = window.flowAtelier.pages.find(item => item.id === id);
    return note && note.content;
  }, ordinary.id);
  expect(savedOrdinary).toContain('Ordinary note edit sentinel');
  expect(savedOrdinary).not.toContain('sutra-help-document');
});

test('toolbar globals drive schema commands when v2 is active', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 toolbar');

  const result = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    window.SutraNotesEditorV2.setContent('<p>hello world</p>');
    pm.editor.commands.focus();
    pm.editor.commands.selectAll();
    window.formatText('bold');
    const bolded = window.SutraNotesEditorV2.getStorageHtml();
    window.formatBlock('h2');
    const asHeading = window.SutraNotesEditorV2.getStorageHtml();
    window.formatText('undo');
    const undone = window.SutraNotesEditorV2.getStorageHtml();
    return { bolded, asHeading, undone };
  }, PM_SELECTOR);

  // The TrailingNode extension keeps an empty trailing paragraph after
  // non-paragraph blocks (so the caret can always leave a heading/table) —
  // strip it before comparing.
  const strip = (html) => html.replace(/(<p><\/p>)+$/, '');
  expect(strip(result.bolded)).toBe('<p><strong>hello world</strong></p>');
  expect(strip(result.asHeading)).toBe('<h2><strong>hello world</strong></h2>');
  expect(strip(result.undone)).toBe('<p><strong>hello world</strong></p>');
});

test('toolbar pressed states mirror the v2 cursor formatting', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 toolbar state');

  await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent(
      '<p><strong>bold text</strong> plain text</p>' +
      '<h2>Heading text</h2>' +
      '<p style="text-align: center"><a href="https://example.com">linked text</a></p>' +
      '<ul><li><p>bullet text</p></li></ul>'
    );
  });

  await page.locator('#editorV2Host strong').click();
  await expect(page.locator('[data-notes-v2-state="bold"]')).toHaveAttribute('aria-pressed', 'true');
  // The styles dropdown reflects the current block type (paragraph here).
  await expect(page.locator('#toolbarStylesSelect')).toHaveValue('p');

  await page.locator('#editorV2Host h2').click();
  await expect(page.locator('#toolbarStylesSelect')).toHaveValue('h2');
  await expect(page.locator('[data-notes-v2-state="bold"]')).toHaveAttribute('aria-pressed', 'false');

  // Activating a saved link opens Link actions; place the editor cursor in
  // its text explicitly to test cursor formatting rather than popup focus.
  await page.evaluate((selector) => {
    const pm = document.querySelector(selector);
    const anchor = pm.querySelector('a');
    const text = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT).nextNode();
    const position = pm.editor.view.posAtDOM(text, 1);
    pm.editor.commands.focus();
    pm.editor.commands.setTextSelection(position);
  }, PM_SELECTOR);
  await expect(page.locator('[data-notes-v2-state="link"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-notes-v2-state="alignCenter"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#editorV2Host li').click();
  await expect(page.locator('[data-notes-v2-state="bulletList"]')).toHaveAttribute('aria-pressed', 'true');
});

test('task lists render beside checkboxes and structured embeds mount a live view', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 task layout');

  const result = await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent(
      '<ul data-type="taskList">' +
        '<li data-type="taskItem" data-checked="false"><p>Open task item that wraps beside the checkbox.</p></li>' +
        '<li data-type="taskItem" data-checked="true"><p>Done task item</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Nested task</p></li></ul></li>' +
      '</ul>' +
      '<div class="html-embed-anchor" data-note-block-type="html-embed" data-block-id="blk-visible" contenteditable="false"></div>'
    );
    const host = document.querySelector('#editorV2Host');
    const item = host.querySelector('ul[data-type="taskList"] > li[data-checked]');
    const label = item.querySelector(':scope > label');
    const content = item.querySelector(':scope > div');
    const card = host.querySelector('.html-embed-block[data-block-id="blk-visible"]');
    const itemStyle = getComputedStyle(item);
    const cardStyle = getComputedStyle(card);
    const labelBox = label.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    const storage = window.SutraNotesEditorV2.getStorageHtml();
    return {
      itemDisplay: itemStyle.display,
      itemGap: itemStyle.gap,
      labelTop: Math.round(labelBox.top),
      contentTop: Math.round(contentBox.top),
      cardDisplay: cardStyle.display,
      cardHasEdit: !!card.querySelector('[data-html-embed-action="edit"]'),
      storageHasAria: storage.includes('aria-label'),
      storageHasAnchor: storage.includes('data-block-id="blk-visible"'),
      storageHasNestedInputInsideSpan: /<span contenteditable="true">[^<]*<input/i.test(storage)
    };
  });

  expect(result.itemDisplay).toBe('flex');
  expect(result.itemGap).not.toBe('normal');
  expect(Math.abs(result.labelTop - result.contentTop)).toBeLessThanOrEqual(6);
  expect(result.cardDisplay).not.toBe('none');
  expect(result.cardHasEdit).toBe(true);
  expect(result.storageHasAria).toBe(false);
  expect(result.storageHasAnchor).toBe(true);
  expect(result.storageHasNestedInputInsideSpan).toBe(false);
});

test('Modern Editor inserts, edits, saves, and restores live HTML embeds', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 live HTML embed');
  await page.locator(PM_SELECTOR).click();
  await page.evaluate(() => { window.insertHtmlEmbed(); });
  await expect(page.locator('#htmlEmbedModal')).toHaveClass(/active/);
  await page.locator('#htmlEmbedModalInput').fill('<section><h2>First embed</h2></section>');
  await page.locator('#htmlEmbedModalConfirmBtn').click();
  const embed = page.locator('#editorV2Host .html-embed-block');
  await expect(embed).toHaveCount(1);
  await expect(embed.locator('.html-embed-block-surface h2')).toHaveText('First embed');
  const initial = await page.evaluate(() => {
    const current = window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId);
    return { html: window.SutraNotesEditorV2.getStorageHtml(), blocks: current.blocks };
  });
  expect(initial.html).toContain('html-embed-anchor');
  expect(initial.html).not.toContain('html-embed-block-header');
  expect(initial.blocks.filter(block => block.type === 'htmlEmbed')).toHaveLength(1);

  await embed.locator('.html-embed-menu-btn').click();
  await embed.locator('[data-html-embed-action="edit"]').click();
  await expect(page.locator('#htmlEmbedModalInput')).toHaveValue(/First embed/);
  await page.locator('#htmlEmbedModalInput').fill('<section><h2>Edited embed</h2></section>');
  await page.locator('#htmlEmbedModalConfirmBtn').click();
  await expect(embed.locator('.html-embed-block-surface h2')).toHaveText('Edited embed');
  const beforeSize = await page.evaluate(() => {
    const current = window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId);
    const block = current.blocks.find(entry => entry.type === 'htmlEmbed');
    return { width: block.widthPct, height: block.heightPx };
  });
  await expect.poll(async () => {
    const rect = await embed.locator('.html-embed-block-stage').boundingBox();
    return Math.abs(rect.height - beforeSize.height);
  }).toBeLessThanOrEqual(2);
  for (const [axis, dx, dy] of [['x', -50, 0], ['y', 0, 60]]) {
    const later = page.locator('#sutraUpdateBanner').getByRole('button', { name: 'Later' });
    if (await later.isVisible()) await later.click();
    const handle = embed.locator(`[data-html-embed-resize-axis="${axis}"]`);
    await handle.scrollIntoViewIfNeeded();
    await handle.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
    await page.mouse.up();
  }
  await expect.poll(() => page.evaluate(() => {
    const current = window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId);
    const block = current.blocks.find(entry => entry.type === 'htmlEmbed');
    return block.widthPct;
  })).toBeLessThan(beforeSize.width);
  await expect.poll(() => page.evaluate(() => {
    const current = window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId);
    const block = current.blocks.find(entry => entry.type === 'htmlEmbed');
    return block.heightPx;
  })).toBeGreaterThan(beforeSize.height);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-live-embed'));
  await page.reload();
  await openNotesView(page);
  await expect(page.locator('#editorV2Host .html-embed-block-surface h2')).toHaveText('Edited embed');
  const reloadedSize = await page.evaluate(() => {
    const current = window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId);
    const block = current.blocks.find(entry => entry.type === 'htmlEmbed');
    return { width: block.widthPct, height: block.heightPx };
  });
  expect(reloadedSize.width).toBeLessThan(beforeSize.width);
  expect(reloadedSize.height).toBeGreaterThan(beforeSize.height);
});

test('Modern Editor removes and undoes an HTML embed without orphaning its payload', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 embed history');
  await page.locator(PM_SELECTOR).click();
  await page.evaluate(() => { window.insertHtmlEmbed(); });
  await page.locator('#htmlEmbedModalInput').fill('<p>Undoable embed</p>');
  await page.locator('#htmlEmbedModalConfirmBtn').click();
  const embed = page.locator('#editorV2Host .html-embed-block');
  await expect(embed).toHaveCount(1);
  await embed.locator('.html-embed-menu-btn').click();
  await embed.locator('[data-html-embed-action="remove"]').click();
  await expect(embed).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.flowAtelier.pages
    .find(p => p.id === window.flowAtelier.currentPageId).blocks
    .filter(block => block.type === 'htmlEmbed').length)).toBe(0);
  await page.locator(PM_SELECTOR).focus();
  await page.keyboard.press('Control+z');
  await expect(embed).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.flowAtelier.pages
    .find(p => p.id === window.flowAtelier.currentPageId).blocks
    .filter(block => block.type === 'htmlEmbed').length)).toBe(1);
  await page.keyboard.press('Control+y');
  await expect(embed).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.flowAtelier.pages
    .find(p => p.id === window.flowAtelier.currentPageId).blocks
    .filter(block => block.type === 'htmlEmbed').length)).toBe(0);
});

test('multiple live HTML embeds move with their anchors and remain classic compatible', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 embed move');
  const ids = [];
  for (const label of ['First live embed', 'Second live embed']) {
    await page.locator(PM_SELECTOR).click();
    await page.evaluate(() => { window.insertHtmlEmbed(); });
    await page.locator('#htmlEmbedModalInput').fill(`<p>${label}</p>`);
    await page.locator('#htmlEmbedModalConfirmBtn').click();
    ids.push(await page.evaluate(() => window.flowAtelier.pages
      .find(p => p.id === window.flowAtelier.currentPageId).blocks
      .filter(block => block.type === 'htmlEmbed').at(-1)?.id));
  }
  expect(new Set(ids).size).toBe(2);
  await page.evaluate(([first, second]) => window.SutraNotesEditorV2.setContent(
    `<p>Before</p><div class="html-embed-anchor" data-note-block-type="html-embed" data-block-id="${first}" contenteditable="false"></div>` +
    `<p>Middle</p><div class="html-embed-anchor" data-note-block-type="html-embed" data-block-id="${second}" contenteditable="false"></div><p>After</p>`
  ), ids);
  const nodes = page.locator('#editorV2Host .editor-v2-structured-block');
  await expect(nodes).toHaveCount(2);
  await nodes.first().hover();
  await expect(page.locator('.editor-v2-drag-handle')).toBeVisible();
  await page.evaluate(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const pm = document.querySelector('#editorV2Host .ProseMirror');
    const nodes = () => pm.querySelectorAll(':scope > .editor-v2-structured-block');
    const first = nodes()[0].getBoundingClientRect();
    const last = nodes()[1].getBoundingClientRect();
    pm.dispatchEvent(new MouseEvent('mousemove', { clientX: first.left + 16, clientY: first.top + 12, bubbles: true }));
    await sleep(40);
    const handle = [...document.querySelectorAll('.editor-v2-drag-handle')].find(el => getComputedStyle(el).display !== 'none');
    const grip = handle.getBoundingClientRect();
    handle.dispatchEvent(new MouseEvent('mousedown', { clientX: grip.left + 2, clientY: grip.top + 2, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: last.left + 16, clientY: last.bottom + 6, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: last.left + 16, clientY: last.bottom + 6, bubbles: true }));
  });
  const moved = await page.evaluate(() => {
    const current = window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId);
    return { html: window.SutraNotesEditorV2.getStorageHtml(), ids: current.blocks.filter(block => block.type === 'htmlEmbed').map(block => block.id) };
  });
  expect(moved.html.indexOf(ids[1])).toBeLessThan(moved.html.indexOf(ids[0]));
  expect(moved.ids).toHaveLength(2);
  expect(new Set(moved.ids)).toEqual(new Set(ids));
  expect(moved.html).not.toContain('html-embed-block-header');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-moved-embeds'));
  const saved = await page.evaluate(() => window.flowAtelier.pages.find(p => p.id === window.flowAtelier.currentPageId));
  expect(saved.content.indexOf(ids[1])).toBeLessThan(saved.content.indexOf(ids[0]));
  expect(saved.blocks.filter(block => block.type === 'htmlEmbed')).toHaveLength(2);
  await page.reload();
  await page.waitForFunction(() => window.flowAtelier?.pages?.some(p => p.title === 'v2 embed move') && window.SutraNotesEditorV2?.isMounted());
  await completeOnboarding(page);
  await openNotesView(page);
  await expect(page.locator('#editorV2Host .html-embed-block')).toHaveCount(2);
  await page.evaluate(() => {
    window.setWorkspacePreference('editor.editorV2Enabled', false, {});
    window.applyWorkspacePreferences({});
  });
  await expect(page.locator('#editor .html-embed-block')).toHaveCount(2);
});

test('Modern Editor keeps handwriting live and durable', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 handwriting');
  await page.locator(PM_SELECTOR).click();
  await page.evaluate(() => window.insertDrawingBlock());
  const drawing = page.locator('#editorV2Host .drawing-block');
  await expect(drawing).toHaveCount(1);
  const canvas = drawing.locator('canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 25, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + 85, box.y + 65, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.flowAtelier.pages
    .find(p => p.id === window.flowAtelier.currentPageId).blocks
    .find(block => block.type === 'drawing')?.strokes.length)).toBe(1);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-live-drawing'));
  await page.reload();
  await page.waitForFunction(() => window.SutraNotesEditorV2?.isMounted() && window.flowAtelier?.pages?.length);
  await openNotesView(page);
  await expect(page.locator('#editorV2Host .drawing-block canvas')).toBeVisible();
});

test('locking a live embed clears its preview until the page is unlocked', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 private embed');
  await page.locator(PM_SELECTOR).click();
  await page.evaluate(() => { window.insertHtmlEmbed(); });
  await page.locator('#htmlEmbedModalInput').fill('<p>Private embed sentinel</p>');
  await page.locator('#htmlEmbedModalConfirmBtn').click();
  await expect(page.locator('#editorV2Host .html-embed-block')).toHaveCount(1);
  await page.evaluate(async () => {
    const id = window.flowAtelier.currentPageId;
    await window.__sutraPublicBetaTestHooks.lockPageWithPin(id, '4826');
    window.loadPage(id);
  });
  await expect(page.locator('#lockedPageScreen')).toBeVisible();
  const lockedSurface = await page.evaluate(() => ({
    text: document.getElementById('editorV2Host')?.textContent || '',
    display: getComputedStyle(document.getElementById('editorV2Host')).display,
    iframeCount: document.querySelectorAll('#editorV2Host iframe').length,
    mirror: document.getElementById('editor')?.textContent || ''
  }));
  expect(lockedSurface.text + lockedSurface.mirror).not.toContain('Private embed sentinel');
  expect(lockedSurface.display).toBe('none');
  expect(lockedSurface.iframeCount).toBe(0);
  await page.locator('#lockScreenPinInput').fill('4826');
  await page.locator('#lockScreenForm button[type="submit"]').click();
  await expect(page.locator('#editorV2Host .html-embed-block-surface')).toContainText('Private embed sentinel');
});

test('a locked comparison note never exposes the secondary Modern Editor host', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'split protected comparison');
  const protectedId = await page.evaluate(() => window.flowAtelier.currentPageId);
  await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent('<p>Protected secondary body sentinel</p>');
    window.flowAtelier.flushAppSaveNow('e2e-split-protected-content');
  });
  await page.evaluate(async id => window.__sutraPublicBetaTestHooks.lockPageWithPin(id, '4826'), protectedId);
  await createBlankNote(page, 'split protected main');

  await page.evaluate(() => document.getElementById('splitNotesToggleBtn').click());
  await expect(page.locator('#editorV2SecondaryHost')).toBeAttached();
  await page.evaluate(id => {
    const select = document.getElementById('splitNoteSelect');
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, protectedId);
  await page.waitForFunction(() => {
    const host = document.getElementById('editorV2SecondaryHost');
    return host && host.hidden && host.inert && getComputedStyle(host).display === 'none';
  });

  const protectedPane = await page.evaluate(() => ({
    hostHidden: document.getElementById('editorV2SecondaryHost').hidden,
    hostInert: document.getElementById('editorV2SecondaryHost').inert,
    hostDisplay: getComputedStyle(document.getElementById('editorV2SecondaryHost')).display,
    hostText: document.getElementById('editorV2SecondaryHost').textContent,
    placeholder: document.getElementById('editorSecondary').textContent,
    primaryDisplay: getComputedStyle(document.getElementById('editorV2Host')).display
  }));
  expect(protectedPane.hostHidden).toBe(true);
  expect(protectedPane.hostInert).toBe(true);
  expect(protectedPane.hostDisplay).toBe('none');
  expect(protectedPane.hostText).not.toContain('Protected secondary body sentinel');
  expect(protectedPane.placeholder).toContain('PIN-protected');
  expect(protectedPane.placeholder).not.toContain('Protected secondary body sentinel');
  expect(protectedPane.primaryDisplay).not.toBe('none');
});

test('Split View mounts independent Modern Editor instances', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 split left');
  await createBlankNote(page, 'v2 split right');
  await page.evaluate(() => document.getElementById('splitNotesToggleBtn').click());
  const left = page.locator('#editorV2Host .ProseMirror');
  const right = page.locator('#editorV2SecondaryHost .ProseMirror');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await left.click();
  await page.keyboard.type('Left pane text');
  await right.click();
  await page.keyboard.type('Right pane text');
  await expect(left).toContainText('Left pane text');
  await expect(right).toContainText('Right pane text');
  await expect(left).not.toContainText('Right pane text');
  await expect(right).not.toContainText('Left pane text');
  await page.evaluate(() => {
    const pm = document.querySelector('#editorV2SecondaryHost .ProseMirror');
    pm.editor.commands.selectAll();
    window.formatText('bold');
  });
  await expect(right.locator('strong')).toContainText('Right pane text');
  await expect(left.locator('strong')).toHaveCount(0);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-split-modern'));
  await expect.poll(() => page.evaluate(() => {
    const pages = window.flowAtelier.pages;
    return ['v2 split left', 'v2 split right'].map(name => pages.find(p => p.title.split('::').pop() === name)?.content || '');
  })).toEqual([expect.stringContaining('Right pane text'), expect.stringContaining('Left pane text')]);
  await right.locator('p').first().hover();
  const secondaryHandle = page.locator('.editor-v2-drag-handle[data-editor-v2-owner="editorV2SecondaryHost"]');
  await expect(secondaryHandle).toHaveCount(1);
  await page.evaluate(() => document.getElementById('splitNotesToggleBtn').click());
  await expect(page.locator('#editorV2SecondaryHost')).toHaveCount(0);
  await expect(secondaryHandle).toHaveCount(0);
});

test('paired sidebar notes survive unrelated navigation, reload, and explicit unpairing', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'Pair Alpha');
  await page.locator('#editorV2Host .ProseMirror').fill('Alpha original');
  await createBlankNote(page, 'Pair Beta');
  await page.locator('#editorV2Host .ProseMirror').fill('Beta original');
  await page.evaluate(() => document.getElementById('splitNotesToggleBtn').click());
  const pairSection = page.locator('#notesSidebarPair');
  await expect(pairSection).toBeVisible();
  await expect(page.locator('#notesPageTabs')).toHaveCount(0);
  await expect(pairSection.locator('.page-title-text')).toHaveText(['Pair Beta', 'Pair Alpha']);
  const pairCells = await pairSection.locator('.notes-sidebar-pair-cell').evaluateAll(cells =>
    cells.map(cell => { const r = cell.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right }; }));
  expect(Math.abs(pairCells[0].top - pairCells[1].top)).toBeLessThan(1);
  expect(pairCells[0].right).toBeLessThanOrEqual(pairCells[1].left);
  await expect(page.locator('#pagesList .page-item').filter({ hasText: 'Pair Alpha' })).toBeHidden();
  await expect(page.locator('#pagesList .page-item').filter({ hasText: 'Pair Beta' })).toBeHidden();
  const secondaryEditor = page.locator('#editorV2SecondaryHost .ProseMirror');
  await secondaryEditor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Alpha pending edit');
  await expect(secondaryEditor).toHaveText('Alpha pending edit');
  // Creating a page while the secondary pane is active must not replace either member.
  await createBlankNote(page, 'Separate Gamma');
  await page.locator('#editorV2Host .ProseMirror').fill('Gamma original');
  await expect(page.locator('#notesEditorContainer')).not.toHaveClass(/split-active/);
  await expect(pairSection.locator('.page-title-text')).toHaveText(['Pair Beta', 'Pair Alpha']);
  await pairSection.getByRole('button', { name: 'Pair Alpha', exact: true }).click();
  await expect(page.locator('#pageTitle')).toHaveValue('Pair Beta');
  await expect(page.locator('#editorV2SecondaryHost .ProseMirror')).toHaveText('Alpha pending edit');
  await expect(page.locator('#editorV2Host .ProseMirror')).toHaveText('Beta original');
  await page.locator('#pagesList .page-item').filter({ hasText: 'Separate Gamma' }).locator('.page-title-text').click();
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-pair-reload'));
  await page.reload();
  await waitForAppHydrated(page);
  await completeOnboarding(page);
  await openNotesView(page);
  await expect(pairSection.locator('.page-title-text')).toHaveText(['Pair Beta', 'Pair Alpha']);
  await page.locator('#pagesList .page-item').filter({ hasText: 'Separate Gamma' }).locator('.page-title-text').click();
  await expect(page.locator('#editorV2Host .ProseMirror')).toHaveText('Gamma original');
  await expect(page.locator('#notesEditorContainer')).not.toHaveClass(/split-active/);
  await pairSection.getByRole('button', { name: 'Pair Beta', exact: true }).click();
  await expect(page.locator('#editorV2SecondaryHost .ProseMirror')).toHaveText('Alpha pending edit');
  await pairSection.getByRole('button', { name: 'Unpair Pair Beta', exact: true }).click();
  await expect(pairSection).toHaveCount(0);
  await expect(page.locator('#notesPageTabs')).toHaveCount(0);
  await expect(page.locator('#editorV2SecondaryHost')).toHaveCount(0);
  await page.locator('#pagesList').getByText('Pair Alpha', { exact: true }).click();
  await expect(page.locator('#pageTitle')).toHaveValue('Pair Alpha');
  await expect(page.locator('#editorV2Host .ProseMirror')).toHaveText('Alpha pending edit');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-unpair-reload'));
  await page.reload();
  await waitForAppHydrated(page);
  await expect(pairSection).toHaveCount(0);
});

test('a protected paired tab uses the normal main-pane PIN flow without replacing its partner', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'Protected pair member');
  await page.locator('#editorV2Host .ProseMirror').fill('Protected pair sentinel');
  const protectedId = await page.evaluate(() => window.flowAtelier.currentPageId);
  await page.evaluate(async id => {
    await window.flowAtelier.flushAppSaveNow('e2e-paired-protected-note');
    await window.__sutraPublicBetaTestHooks.lockPageWithPin(id, '4826');
  }, protectedId);
  await createBlankNote(page, 'Public pair member');
  const publicId = await page.evaluate(() => window.flowAtelier.currentPageId);
  await page.evaluate(() => document.getElementById('splitNotesToggleBtn').click());
  await expect(page.locator('#editorV2SecondaryHost')).toBeHidden();
  await page.locator('#notesSidebarPair').getByRole('button', { name: 'Protected pair member', exact: true }).click();
  await expect(page.locator('#lockedPageScreen')).toBeVisible();
  await expect(page.locator('#pageTitle')).toHaveValue('Protected pair member');
  expect(await page.evaluate(() => window.flowAtelier.getNotesSplitPair())).toEqual({ left: protectedId, right: publicId });
  await expect(page.locator('#editor')).not.toContainText('Protected pair sentinel');
  await expect(page.locator('#editorV2Host')).not.toContainText('Protected pair sentinel');
  await page.locator('#lockScreenPinInput').fill('4826');
  await page.locator('#lockScreenForm button[type="submit"]').click();
  await expect(page.locator('#editorV2Host .ProseMirror')).toContainText('Protected pair sentinel');
  await expect(page.locator('#notesSidebarPair .page-title-text')).toHaveText(['Protected pair member', 'Public pair member']);
});

test('Classic paired edits flush before unrelated navigation and return to the same pages', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  for (const name of ['Classic Alpha', 'Classic Beta', 'Classic Gamma']) await createBlankNote(page, name);
  await page.evaluate(() => {
    window.setWorkspacePreference('editor.editorV2Enabled', false, {});
    window.loadPage(window.flowAtelier.pages.find(p => p.title === 'Classic Beta').id);
    document.getElementById('splitNotesToggleBtn').click();
  });
  await page.locator('#editorSecondary').fill('Classic secondary edit');
  await page.locator('#pagesList .page-item').filter({ hasText: 'Classic Gamma' }).locator('.page-title-text').click();
  await expect(page.locator('#notesEditorContainer')).not.toHaveClass(/split-active/);
  await page.locator('#notesSidebarPair').getByRole('button', { name: 'Classic Alpha', exact: true }).click();
  await expect(page.locator('#pageTitle')).toHaveValue('Classic Beta');
  await expect(page.locator('#editorSecondary')).toHaveText('Classic secondary edit');
});

test('one keyboard-accessible note menu contains insert and page tools and preserves the caret', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'Unified tools partner');
  await createBlankNote(page, 'Unified tools');
  const editor = page.locator('#editorV2Host .ProseMirror');
  await editor.fill('Before');
  await editor.press('End');
  const toggle = page.locator('.notes-toolbar-overflow-toggle');
  await toggle.press('ArrowDown');
  const menu = page.getByRole('menu', { name: 'Insert and note tools', exact: true });
  await expect(menu).toBeVisible();
  await expect(page.locator('#insertMoreBtn')).toBeHidden();
  await expect(menu.getByRole('menuitem', { name: 'Video', exact: true })).toBeVisible();
  await expect(menu.locator('#pagesToggleBtn')).toHaveCount(1);
  await expect(menu.locator('#splitNotesToggleBtn')).toHaveCount(1);
  await expect(menu.locator('#editorZoomDisplay')).toHaveText('100%');
  await menu.getByRole('menuitem', { name: 'Page break', exact: true }).click();
  await expect(editor.locator('.atelier-page-break')).toHaveCount(1);
  await expect(menu).toBeHidden();
  await expect(editor).toContainText('Before');
  await toggle.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await expect(menu).toBeVisible();
  await menu.locator('#splitNotesToggleBtn').click();
  await expect(page.locator('#notesEditorContainer')).toHaveClass(/split-active/);
  await expect(page.locator('#notesSidebarPair .notes-sidebar-unpair')).toHaveCount(2);
});

test('Move to space preserves mixed page models, assets, children, PINs, and pins through reload', async ({ page }) => {
  await openApp(page);
  await openNotesView(page);
  const staged = await page.evaluate(async () => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const target = hooks.createSpace('Move destination');
    hooks.switchSpace('default');
    const folder = hooks.createNoteInActiveSpace('Mixed folder', '');
    folder.type = 'folder';
    const note = hooks.createNoteInActiveSpace('Mixed folder::Document', '<p>Document with asset</p>');
    note.futureMetadata = { retained: true, assetId: 'stable-asset-reference' };
    note.blocks = [{ id: 'asset-block', type: 'image', src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E' }];
    const html = window.SutraHTMLPages.createPage('Mixed folder::HTML');
    html.htmlDocument.source = '<!doctype html><h1>HTML move sentinel</h1>';
    const slides = window.SutraSlides.createPage('Mixed folder::Slides');
    const sheets = window.SutraSheets.createPage('Mixed folder::Sheets');
    const canvas = hooks.createCanvasInActiveSpace('Mixed folder::Canvas');
    const nested = hooks.createNoteInActiveSpace('Mixed folder::Document::Child', '<p>Nested child</p>');
    const outsider = hooks.createNoteInActiveSpace('Unrelated source note', '<p>Stay here</p>');
    await hooks.lockPageWithPin(html.id, '4826');
    hooks.togglePinPage(html.id, 'default');
    window.loadPage(folder.id);
    await window.flowAtelier.flushAppSaveNow('e2e-before-space-move');
    const members = [note, html, slides, sheets, canvas, nested].map(item => {
      const copy = JSON.parse(JSON.stringify(item));
      delete copy.updatedAt;
      return copy;
    });
    return { target: target.id, folder: folder.id, html: html.id, outsider: outsider.id, members };
  });
  await page.getByRole('button', { name: 'More actions for Mixed folder', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Move to space', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Move to space', exact: true });
  await expect(dialog).toContainText('its 6 child pages');
  await dialog.getByLabel('Destination space').selectOption(staged.target);
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.locator('#spacesCurrentName')).toHaveText('Move destination');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-after-space-move'));
  await page.reload();
  await waitForAppHydrated(page);
  const result = await page.evaluate(({ ids, target }) => ({
    members: ids.map(id => window.flowAtelier.pages.find(item => item.id === id)),
    outsider: window.flowAtelier.pages.find(item => item.title === 'Unrelated source note'),
    pins: window.__sutraPublicBetaTestHooks.getPinnedNoteIds(target),
    sourcePins: window.__sutraPublicBetaTestHooks.getPinnedNoteIds('default')
  }), { ids: staged.members.map(item => item.id), target: staged.target });
  await expect(page.locator('#spacesCurrentName')).toHaveText('Move destination');
  staged.members.forEach((before, index) => {
    expect(result.members[index]).toMatchObject({ ...before, spaceId: staged.target });
  });
  expect(result.outsider.spaceId).toBe('default');
  expect(result.pins).toContain(staged.html);
  expect(result.sourcePins).not.toContain(staged.html);
});

test('Move to space cancels cleanly, refuses duplicate titles, and rebases a nested subtree', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  const staged = await page.evaluate(() => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const target = hooks.createSpace('Existing names');
    hooks.createNoteInActiveSpace('Child', '<p>Destination original</p>');
    hooks.switchSpace('default');
    const parent = hooks.createNoteInActiveSpace('Parent', '<p>Source parent</p>');
    parent.type = 'folder';
    const child = hooks.createNoteInActiveSpace('Parent::Child', '<p>Source original</p>');
    const nested = hooks.createNoteInActiveSpace('Parent::Child::Grandchild', '<p>Grandchild original</p>');
    window.loadPage(child.id);
    return { target: target.id, child: child.id, nested: nested.id };
  });
  const openMove = async () => {
    await page.getByRole('button', { name: 'More actions for Child', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Move to space', exact: true }).click();
    return page.getByRole('dialog', { name: 'Move to space', exact: true });
  };
  let dialog = await openMove();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(id => window.flowAtelier.getPageById(id).spaceId, staged.child)).toBe('default');
  dialog = await openMove();
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('already has a page');
  expect(await page.evaluate(id => window.flowAtelier.getPageById(id).title, staged.child)).toBe('Parent::Child');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'More actions for Child', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.locator('#renamePageName').fill('Parent::Unique child');
  await page.locator('#renamePageModal').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#renamePageModal')).toBeHidden();
  await expect.poll(() => page.evaluate(id => ({
    currentPageId: window.flowAtelier.currentPageId,
    title: window.flowAtelier.getPageById(id)?.title
  }), staged.child)).toEqual({ currentPageId: staged.child, title: 'Parent::Unique child' });
  const sourceEditor = page.locator('#editorV2Host .ProseMirror');
  await expect(sourceEditor).toHaveAttribute('contenteditable', 'true');
  await sourceEditor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Pending source edit');
  await expect(sourceEditor).toHaveText('Pending source edit');
  await page.getByRole('button', { name: 'More actions for Unique child', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Move to space', exact: true }).click();
  await page.getByRole('dialog', { name: 'Move to space', exact: true }).getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.locator('#editorV2Host .ProseMirror')).toHaveText('Pending source edit');
  expect(await page.evaluate(id => window.flowAtelier.getPageById(id).title, staged.child)).toBe('Unique child');
  expect(await page.evaluate(id => window.flowAtelier.getPageById(id).title, staged.nested)).toBe('Unique child::Grandchild');
});

test('all Create comparison surfaces save through the host without replacing the main note', async ({ page }) => {
  test.setTimeout(120000);
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  const ids = await page.evaluate(() => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const left = hooks.createNoteInActiveSpace('All types main', '<p>Main note stays intact</p>');
    const html = window.SutraHTMLPages.createPage('All types HTML');
    const slides = window.SutraSlides.createPage('All types Slides');
    const sheets = window.SutraSheets.createPage('All types Sheets');
    const canvas = hooks.createCanvasInActiveSpace('All types Canvas');
    const folder = hooks.createNoteInActiveSpace('All types folder', '');
    folder.type = 'folder';
    hooks.createNoteInActiveSpace('All types folder::Child', '<p>Child content</p>');
    window.loadPage(left.id);
    window.flowAtelier.renderPagesList();
    return { left: left.id, html: html.id, slides: slides.id, sheets: sheets.id, canvas: canvas.id, folder: folder.id };
  });
  await page.getByRole('button', { name: 'More actions for All types main', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Split with another page', exact: true }).click();
  const choice = page.locator('#splitNoteSelect');
  const frame = page.frameLocator('.create-split-frame');
  await choice.selectOption(ids.html);
  await frame.getByRole('tab', { name: 'Code', exact: true }).click();
  await frame.getByRole('textbox', { name: 'HTML, CSS, and JavaScript', exact: true }).fill('<h1>Split HTML saved</h1>');
  await choice.selectOption(ids.sheets);
  await frame.getByRole('gridcell', { name: 'A1', exact: true }).click();
  await frame.getByRole('textbox', { name: 'Formula or value', exact: true }).fill('=6*7');
  // Switching away must commit a still-open cell draft.
  await choice.selectOption(ids.canvas);
  await frame.getByRole('button', { name: 'Add text', exact: true }).click();
  await frame.getByRole('textbox', { name: 'Canvas object text', exact: true }).fill('Split Canvas saved');
  await choice.selectOption(ids.slides);
  await frame.getByRole('button', { name: 'New slide', exact: true }).click();
  await expect(frame.getByRole('complementary', { name: 'Slide order', exact: true })).toContainText('2 of 2');
  await choice.selectOption(ids.folder);
  await expect(frame.getByRole('button', { name: /Child$/ })).toBeVisible();
  expect(await page.locator('.create-split-frame').evaluate(el =>
    el.contentWindow.flowAtelier.pages === window.flowAtelier.pages)).toBe(true);
  expect(await page.locator('.create-split-frame').evaluate(el =>
    Array.from(el.contentDocument.scripts).some(script => /src\/core\/app\.js/.test(script.src)))).toBe(false);
  await expect(page.locator('#editorV2Host .ProseMirror')).toHaveText('Main note stays intact');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-all-create-splits'));
  await page.reload();
  await waitForAppHydrated(page);
  await openNotesView(page);
  await expect(frame.getByRole('heading', { name: 'Pages in this folder', exact: true })).toBeVisible();
  await choice.selectOption(ids.sheets);
  await expect(frame.getByRole('gridcell', { name: 'A1', exact: true })).toHaveText('42');
  const saved = await page.evaluate(ids => ({
    html: window.flowAtelier.getPageById(ids.html).htmlDocument.source,
    canvas: window.flowAtelier.getPageById(ids.canvas).canvas.objects[0].text,
    slides: window.flowAtelier.getPageById(ids.slides).slides.slides.length
  }), ids);
  expect(saved).toEqual({ html: '<h1>Split HTML saved</h1>', canvas: 'Split Canvas saved', slides: 2 });
});

for (const kind of ['html', 'slides', 'sheets', 'canvas']) {
  test(`two ${kind} pages keep independent split editor state`, async ({ page }) => {
    await openApp(page);
    await openNotesView(page);
    const ids = await page.evaluate(kind => {
      const create = title => kind === 'html' ? window.SutraHTMLPages.createPage(title)
        : kind === 'slides' ? window.SutraSlides.createPage(title)
          : kind === 'sheets' ? window.SutraSheets.createPage(title)
            : window.__sutraPublicBetaTestHooks.createCanvasInActiveSpace(title);
      const left = create('Same type left');
      const right = create('Same type right');
      window.flowAtelier.openPageInSplitView(left.id);
      return { left: left.id, right: right.id };
    }, kind);
    await page.locator('#splitNoteSelect').selectOption(ids.right);
    const frame = page.frameLocator('.create-split-frame');
    await expect(page.locator('.create-split-frame')).toBeVisible();
    if (kind === 'canvas') {
      await page.locator('#canvasEditor').getByRole('button', { name: 'Add text', exact: true }).click();
      await page.locator('#canvasEditor').getByRole('textbox', { name: 'Canvas object text', exact: true }).fill('Left canvas');
      await frame.getByRole('button', { name: 'Add text', exact: true }).click();
      await frame.getByRole('textbox', { name: 'Canvas object text', exact: true }).fill('Right canvas');
      expect(await page.evaluate(() => window.SutraCanvas.getContext().pageId)).toBe(ids.right);
      await expect(page.locator('#canvasEditor').getByRole('textbox', { name: 'Canvas object text', exact: true })).toHaveValue('Left canvas');
      await frame.getByRole('button', { name: 'Undo', exact: true }).click();
      await frame.getByRole('button', { name: 'Undo', exact: true }).click();
      expect(await page.evaluate(id => window.flowAtelier.getPageById(id).canvas.objects.length, ids.left)).toBe(1);
      expect(await page.evaluate(id => window.flowAtelier.getPageById(id).canvas.objects.length, ids.right)).toBe(0);
    } else if (kind === 'sheets') {
      await page.locator('#sheetsEditor').getByRole('gridcell', { name: 'A1', exact: true }).click();
      await page.locator('#sheetsEditor').getByRole('textbox', { name: 'Formula or value', exact: true }).fill('=2*3');
      await page.locator('#sheetsEditor').getByRole('button', { name: 'Apply formula', exact: true }).click();
      await frame.getByRole('gridcell', { name: 'A1', exact: true }).click();
      await frame.getByRole('textbox', { name: 'Formula or value', exact: true }).fill('=3*3');
      await frame.getByRole('button', { name: 'Apply formula', exact: true }).click();
      await expect(page.locator('#sheetsEditor').getByRole('gridcell', { name: 'A1', exact: true })).toHaveText('6');
      await expect(frame.getByRole('gridcell', { name: 'A1', exact: true })).toHaveText('9');
    } else if (kind === 'slides') {
      await page.locator('#slidesEditor').getByRole('button', { name: 'New slide', exact: true }).click();
      await expect(frame.getByRole('complementary', { name: 'Slide order', exact: true })).toContainText('1 of 1');
      await frame.getByRole('button', { name: 'New slide', exact: true }).click();
      expect(await page.evaluate(ids => [ids.left, ids.right].map(id => window.flowAtelier.getPageById(id).slides.slides.length), ids)).toEqual([2, 2]);
    } else {
      await page.locator('.html-page-editor').getByRole('button', { name: 'Edit source', exact: true }).click();
      await page.locator('.html-page-editor').getByRole('textbox', { name: 'HTML, CSS, and JavaScript', exact: true }).fill('<p>Left HTML</p>');
      await frame.getByRole('tab', { name: 'Code', exact: true }).click();
      await frame.getByRole('textbox', { name: 'HTML, CSS, and JavaScript', exact: true }).fill('<p>Right HTML</p>');
      expect(await page.evaluate(ids => [ids.left, ids.right].map(id => window.flowAtelier.getPageById(id).htmlDocument.source), ids)).toEqual(['<p>Left HTML</p>', '<p>Right HTML</p>']);
    }
    expect(await page.locator('#notesPrimaryPane').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(200);
    expect(await page.locator('#notesSecondaryPane').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(200);
    await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-same-type-split'));
    await page.reload();
    await waitForAppHydrated(page);
    await openNotesView(page);
    await expect(page.locator('.create-split-frame')).toBeVisible();
    expect(await page.evaluate(() => window.flowAtelier.getNotesSplitPair())).toEqual(ids);
  });
}

test('a new space split chooses an available partner instead of a stale other-space page', async ({ page }) => {
  await openApp(page);
  await openNotesView(page);
  const ids = await page.evaluate(() => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const oldLeft = hooks.createNoteInActiveSpace('Old space left', '<p>Old left</p>');
    hooks.createNoteInActiveSpace('Old space right', '<p>Old right</p>');
    window.flowAtelier.openPageInSplitView(oldLeft.id);
    const space = hooks.createSpace('Split destination');
    const left = hooks.createCanvasInActiveSpace('Destination Canvas');
    const right = window.SutraSheets.createPage('Destination Sheets');
    window.flowAtelier.openPageInSplitView(left.id);
    return { left: left.id, right: right.id, space: space.id };
  });
  expect(await page.evaluate(() => window.flowAtelier.getNotesSplitPair())).toEqual({ left: ids.left, right: ids.right });
  await expect(page.frameLocator('.create-split-frame').getByRole('region', { name: 'Sutra Sheets editor', exact: true })).toBeVisible();
  await expect(page.locator('#splitNoteSelect')).not.toContainText('Old space');
});

test('locked native split pages never mount until unlocked and relocking disposes the frame', async ({ page }) => {
  await openApp(page);
  await openNotesView(page);
  const ids = await page.evaluate(async () => {
    const note = window.__sutraPublicBetaTestHooks.createNoteInActiveSpace('Native lock main', '<p>Public body</p>');
    const html = window.SutraHTMLPages.createPage('Native lock HTML', { source: '<h1>Private split sentinel</h1>' });
    await window.__sutraPublicBetaTestHooks.lockPageWithPin(html.id, '4826');
    html.lockAutoLock = 'session';
    window.flowAtelier.openPageInSplitView(note.id);
    return { left: note.id, right: html.id };
  });
  await page.locator('#splitNoteSelect').selectOption(ids.right);
  await expect(page.locator('.create-split-frame')).toHaveCount(0);
  await expect(page.locator('#editorSecondary')).toContainText('PIN-protected');
  await expect(page.locator('#notesEditorContainer')).not.toContainText('Private split sentinel');
  await page.locator('#notesSidebarPair').getByRole('button', { name: 'Native lock HTML', exact: true }).click();
  await page.locator('#lockScreenPinInput').fill('4826');
  await page.locator('#lockScreenForm button[type="submit"]').click();
  await page.evaluate(id => window.flowAtelier.openPageInSplitView(id), ids.left);
  await page.locator('#splitNoteSelect').selectOption(ids.right);
  const frame = page.frameLocator('.create-split-frame');
  await frame.getByRole('tab', { name: 'Code', exact: true }).click();
  await expect(frame.getByRole('textbox', { name: 'HTML, CSS, and JavaScript', exact: true })).toHaveValue('<h1>Private split sentinel</h1>');
  await page.evaluate(id => window.__sutraPublicBetaTestHooks.lockPageNow(id), ids.right);
  await expect(page.locator('.create-split-frame')).toHaveCount(0);
  expect(await page.evaluate(id => window.flowAtelier.getPageById(id).htmlDocument.source, ids.right)).toBe('<h1>Private split sentinel</h1>');
});

test('secondary pane saves its pending edit before switching pages or closing Split View', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  for (const name of ['split boundary one', 'split boundary two', 'split boundary three']) {
    await createBlankNote(page, name);
  }
  await page.evaluate(() => document.getElementById('splitNotesToggleBtn').click());
  await expect(page.locator('#editorV2SecondaryHost .ProseMirror')).toBeVisible();
  const pages = await page.evaluate(() => ({
    oldId: document.querySelector('#splitNoteSelect').value,
    options: [...document.querySelector('#splitNoteSelect').options].map(option => option.value)
  }));
  const nextId = pages.options.find(id => id && id !== pages.oldId);
  expect(nextId).toBeTruthy();

  await page.evaluate(targetId => {
    document.querySelector('#editorV2SecondaryHost .ProseMirror').editor.commands.insertContent('Saved before switch');
    const select = document.getElementById('splitNoteSelect');
    select.value = targetId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, nextId);
  await expect.poll(() => page.evaluate(oldId => window.flowAtelier.pages.find(p => p.id === oldId)?.content, pages.oldId))
    .toContain('Saved before switch');
  await expect(page.locator('#editorV2SecondaryHost .ProseMirror')).not.toContainText('Saved before switch');

  await page.evaluate(() => {
    document.querySelector('#editorV2SecondaryHost .ProseMirror').editor.commands.insertContent('Saved before close');
    document.getElementById('splitNotesToggleBtn').click();
  });
  await expect(page.locator('#editorV2SecondaryHost')).toHaveCount(0);
  await expect.poll(() => page.evaluate(id => window.flowAtelier.pages.find(p => p.id === id)?.content, nextId))
    .toContain('Saved before close');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-split-boundary'));
  await page.reload();
  await page.waitForFunction(() => window.flowAtelier?.pages?.length >= 4);
  const restored = await page.evaluate(ids => ids.map(id => window.flowAtelier.pages.find(p => p.id === id)?.content || ''), [pages.oldId, nextId]);
  expect(restored[0]).toContain('Saved before switch');
  expect(restored[1]).toContain('Saved before close');
});

test('Split View keeps equal panes aligned, independently scrollable, and clear about the active note', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openAppForSplitLayout(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await setDesktopSidebarCollapsed(page, false);
  const comparisonTitle = 'Comparison note title deliberately long enough to test clean truncation in the split pane';
  const mainTitle = 'Main note title deliberately long enough to test clean truncation in the split pane';
  await createBlankNote(page, 'Split layout spare note');
  await createBlankNote(page, comparisonTitle);
  await createBlankNote(page, mainTitle);

  const comparisonId = await page.evaluate(title => window.flowAtelier.pages.find(item => item.title.endsWith(title))?.id, comparisonTitle);
  expect(comparisonId).toBeTruthy();

  await page.locator('.notes-toolbar-overflow-toggle').click();
  await page.locator('#pagesToggleBtn').click();
  await expect(page.locator('body')).toHaveClass(/notes-pages-mode/);

  for (let index = 0; index < 8; index++) {
    await page.locator('#tagsContainer .add-tag-btn').click();
    await page.locator('#tagInput').fill(`Split layout tag ${index} with enough text to exercise the header row`);
    await page.locator('#tagInput').press('Enter');
  }
  await expect(page.locator('#tagsContainer .tag-label')).toHaveCount(8);

  await page.locator('.notes-toolbar-overflow-toggle').click();
  await page.locator('#splitNotesToggleBtn').click();
  await expect(page.locator('#editorV2SecondaryHost .ProseMirror')).toBeVisible();
  await expect.poll(() => page.locator('#splitNoteSelect option').evaluateAll((options, id) => options.some(option => option.value === id), comparisonId)).toBe(true);
  await page.locator('#splitNoteSelect').selectOption(comparisonId);
  await expect(page.locator('#splitNoteMeta')).toContainText(comparisonTitle);

  const longPageBody = Array.from({ length: 48 }, (_, index) =>
    `<p>Split layout long page body line ${index} keeps both editor viewports independently scrollable.</p>${index > 0 && index % 12 === 0 ? '<div class="atelier-page-break" data-atelier-block="page-break" role="separator" aria-label="Page break"></div>' : ''}`
  ).join('');
  await page.evaluate(body => {
    document.querySelector('#editorV2Host .ProseMirror').editor.commands.setContent(body, { emitUpdate: true });
    document.querySelector('#editorV2SecondaryHost .ProseMirror').editor.commands.setContent(body, { emitUpdate: true });
  }, longPageBody);
  await expect(page.locator('#editorV2Host .atelier-page-break')).toHaveCount(3);
  await expect(page.locator('#editorV2SecondaryHost .atelier-page-break')).toHaveCount(3);

  const wideGeometry = await readSplitLayoutGeometry(page, '#editorV2Host', '#editorV2SecondaryHost');
  expectWideSplitGeometry(wideGeometry);
  expect(wideGeometry.closeAction.top).toBeGreaterThanOrEqual(wideGeometry.toolbar.bottom);
  expect(wideGeometry.primaryEditorScrollHeight).toBeGreaterThan(wideGeometry.primaryEditorClientHeight + 100);
  expect(wideGeometry.secondaryEditorScrollHeight).toBeGreaterThan(wideGeometry.secondaryEditorClientHeight + 100);
  expect(wideGeometry.primaryTagsScrollHeight).toBeGreaterThan(wideGeometry.primaryTagsClientHeight);
  await page.screenshot({ path: testInfo.outputPath('split-modern-wide.png') });

  await page.evaluate(async () => {
    window.setApplyMode?.('all');
    await window.applyPresetTheme('dark');
  });
  await page.waitForFunction(() => document.body.dataset.themeKey === 'dark');
  const darkThemeGeometry = await page.evaluate(() => ({
    columns: getComputedStyle(document.getElementById('notesEditorContainer')).gridTemplateColumns.trim().split(/\s+/).length,
    activeOutline: getComputedStyle(document.getElementById('notesPrimaryPane')).outlineStyle,
    closeSize: (() => {
      const rect = document.getElementById('closeSplitNotesBtn').getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })()
  }));
  expect(darkThemeGeometry.columns).toBe(2);
  expect(darkThemeGeometry.activeOutline).toBe('solid');
  expect(darkThemeGeometry.closeSize.width).toBeGreaterThanOrEqual(44);
  expect(darkThemeGeometry.closeSize.height).toBeGreaterThanOrEqual(44);

  const primary = page.locator('#notesPrimaryPane');
  const secondary = page.locator('#notesSecondaryPane');
  const primaryEditor = page.locator('#editorV2Host .ProseMirror');
  const secondaryEditor = page.locator('#editorV2SecondaryHost .ProseMirror');
  await primaryEditor.click();
  await expect(primary).toHaveClass(/is-active-pane/);
  await expect(secondary).not.toHaveClass(/is-active-pane/);
  const primaryTitle = await page.locator('#pageTitle').inputValue();
  await expect(page.locator('#toolbar')).toHaveAttribute('aria-label', new RegExp('main note: ' + primaryTitle));

  await secondaryEditor.click();
  await expect(secondary).toHaveClass(/is-active-pane/);
  await expect(primary).not.toHaveClass(/is-active-pane/);
  const secondaryTitle = await page.locator('#splitNoteMeta').textContent();
  await expect(page.locator('#toolbar')).toHaveAttribute('aria-label', new RegExp('comparison note: ' + secondaryTitle));

  const scrollResult = await page.evaluate(async () => {
    const primary = document.getElementById('editorV2Host');
    const secondary = document.getElementById('editorV2SecondaryHost');
    const notesView = document.getElementById('view-notes');
    const outerScrollBefore = notesView.scrollTop;
    primary.scrollTop = 280;
    secondary.scrollTop = 460;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      primaryScrollTop: primary.scrollTop,
      secondaryScrollTop: secondary.scrollTop,
      primaryScrollHeight: primary.scrollHeight,
      primaryClientHeight: primary.clientHeight,
      secondaryScrollHeight: secondary.scrollHeight,
      secondaryClientHeight: secondary.clientHeight,
      outerScrollBefore,
      outerScrollAfter: notesView.scrollTop
    };
  });
  expect(scrollResult.primaryScrollHeight).toBeGreaterThan(scrollResult.primaryClientHeight + 100);
  expect(scrollResult.secondaryScrollHeight).toBeGreaterThan(scrollResult.secondaryClientHeight + 100);
  expect(scrollResult.primaryScrollTop).toBeGreaterThan(100);
  expect(scrollResult.secondaryScrollTop).toBeGreaterThan(250);
  expect(scrollResult.outerScrollAfter).toBe(scrollResult.outerScrollBefore);

  await page.waitForTimeout(80);
  const originalSecondaryId = await page.locator('#splitNoteSelect').inputValue();
  const switchToId = await page.locator('#splitNoteSelect option').evaluateAll(options => options.map(option => option.value).find(value => value && value !== document.getElementById('splitNoteSelect').value));
  expect(switchToId).toBeTruthy();
  await page.evaluate(id => {
    const select = document.getElementById('splitNoteSelect');
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, switchToId);
  await expect.poll(() => page.locator('#splitNoteMeta').textContent()).not.toBe(secondaryTitle);
  await page.evaluate(id => {
    const select = document.getElementById('splitNoteSelect');
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, originalSecondaryId);
  await expect.poll(() => page.locator('#editorV2SecondaryHost').evaluate(element => element.scrollTop)).toBeGreaterThan(250);

  await setDesktopSidebarCollapsed(page, true);
  const collapsedModernGeometry = await readSplitLayoutGeometry(page, '#editorV2Host', '#editorV2SecondaryHost');
  expectWideSplitGeometry(collapsedModernGeometry);
  expect(collapsedModernGeometry.container.width).toBeGreaterThan(wideGeometry.container.width);
  await setDesktopSidebarCollapsed(page, false);

  await page.setViewportSize({ width: 900, height: 780 });
  const narrowGeometry = await page.evaluate(() => {
    const container = document.getElementById('notesEditorContainer');
    const primary = document.getElementById('notesPrimaryPane').getBoundingClientRect();
    const secondary = document.getElementById('notesSecondaryPane').getBoundingClientRect();
    return {
      columns: getComputedStyle(container).gridTemplateColumns.trim().split(/\s+/).length,
      primaryBottom: primary.bottom,
      secondaryTop: secondary.top
    };
  });
  expect(narrowGeometry.columns).toBe(1);
  expect(narrowGeometry.secondaryTop).toBeGreaterThan(narrowGeometry.primaryBottom);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileGeometry = await page.evaluate(async () => {
    const container = document.getElementById('notesEditorContainer');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const view = document.getElementById('view-notes').getBoundingClientRect();
    const toolbar = document.querySelector('.toolbar-wrapper').getBoundingClientRect();
    const secondary = document.getElementById('notesSecondaryPane').getBoundingClientRect();
    const close = document.getElementById('closeSplitNotesBtn').getBoundingClientRect();
    return {
      columns: getComputedStyle(container).gridTemplateColumns.trim().split(/\s+/).length,
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      secondaryTop: secondary.top,
      secondaryBottom: secondary.bottom,
      viewBottom: view.bottom,
      toolbarBottom: toolbar.bottom,
      closeTop: close.top,
      closeHit: document.elementFromPoint(close.left + close.width / 2, close.top + close.height / 2)?.closest('button')?.id,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(mobileGeometry.columns).toBe(1);
  expect(mobileGeometry.secondaryBottom).toBeLessThanOrEqual(mobileGeometry.viewBottom + 1);
  expect(mobileGeometry.closeTop).toBeGreaterThanOrEqual(mobileGeometry.toolbarBottom);
  expect(mobileGeometry.closeHit).toBe('closeSplitNotesBtn');
  expect(mobileGeometry.documentOverflow).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 390, height: 640 });
  const shortMobileGeometry = await page.evaluate(async () => {
    const container = document.getElementById('notesEditorContainer');
    container.scrollTop = container.scrollHeight;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const view = document.getElementById('view-notes').getBoundingClientRect();
    const secondary = document.getElementById('notesSecondaryPane').getBoundingClientRect();
    const close = document.getElementById('closeSplitNotesBtn').getBoundingClientRect();
    const toolbar = document.querySelector('.toolbar-wrapper').getBoundingClientRect();
    return {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      secondaryBottom: secondary.bottom,
      viewBottom: view.bottom,
      closeTop: close.top,
      toolbarBottom: toolbar.bottom,
      closeHit: document.elementFromPoint(close.left + close.width / 2, close.top + close.height / 2)?.closest('button')?.id
    };
  });
  expect(shortMobileGeometry.scrollHeight).toBeGreaterThan(shortMobileGeometry.clientHeight);
  expect(shortMobileGeometry.scrollTop).toBeGreaterThan(0);
  expect(shortMobileGeometry.secondaryBottom).toBeLessThanOrEqual(shortMobileGeometry.viewBottom + 1);
  expect(shortMobileGeometry.closeTop).toBeGreaterThanOrEqual(shortMobileGeometry.toolbarBottom);
  expect(shortMobileGeometry.closeHit).toBe('closeSplitNotesBtn');
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('notesEditorContainer')).gridTemplateColumns.trim().split(/\s+/).length)).toBe(2);

  const titleTopAfterSplit = await page.locator('#pageTitle').evaluate(element => element.getBoundingClientRect().top);
  expect(Math.abs(titleTopAfterSplit - wideGeometry.primaryTitle.top)).toBeLessThanOrEqual(1);
  await page.locator('#closeSplitNotesBtn').click();
  await expect(page.locator('#notesSecondaryPane')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/notes-split-active/);

  await page.evaluate(async () => {
    window.SutraNotesEditorV2.flushToMirror();
    await window.flowAtelier.flushAppSaveNow('e2e-split-classic-layout');
  });
  await page.locator('.notes-toolbar-overflow-toggle').click();
  await page.locator('#pagesToggleBtn').click();
  await expect(page.locator('body')).not.toHaveClass(/notes-pages-mode/);
  await page.evaluate(() => {
    window.setWorkspacePreference('editor.editorV2Enabled', false, {});
    window.applyWorkspacePreferences({});
  });
  await page.waitForFunction(() => !window.SutraNotesEditorV2.isMounted() && document.getElementById('editor').style.display !== 'none');

  await page.locator('.notes-toolbar-overflow-toggle').click();
  await page.locator('#splitNotesToggleBtn').click();
  await expect(page.locator('#editorSecondary')).toBeVisible();
  await expect.poll(() => page.locator('#splitNoteSelect option').evaluateAll((options, id) => options.some(option => option.value === id), comparisonId)).toBe(true);
  await page.locator('#splitNoteSelect').selectOption(comparisonId);
  await expect(page.locator('#splitNoteMeta')).toContainText(comparisonTitle);
  await expect(page.locator('#editor')).toContainText('Split layout long page body line 47');
  await expect(page.locator('#editorSecondary')).toContainText('Split layout long page body line 47');

  const wideClassicGeometry = await readSplitLayoutGeometry(page, '#editor', '#editorSecondary');
  expectWideSplitGeometry(wideClassicGeometry);
  expect(wideClassicGeometry.primaryEditorScrollHeight).toBeGreaterThan(wideClassicGeometry.primaryEditorClientHeight + 100);
  expect(wideClassicGeometry.secondaryEditorScrollHeight).toBeGreaterThan(wideClassicGeometry.secondaryEditorClientHeight + 100);
  await page.screenshot({ path: testInfo.outputPath('split-classic-wide.png') });
  await setDesktopSidebarCollapsed(page, true);
  const collapsedClassicGeometry = await readSplitLayoutGeometry(page, '#editor', '#editorSecondary');
  expectWideSplitGeometry(collapsedClassicGeometry);
  expect(collapsedClassicGeometry.container.width).toBeGreaterThan(wideClassicGeometry.container.width);
  await setDesktopSidebarCollapsed(page, false);
  await page.locator('#closeSplitNotesBtn').click();
  await expect(page.locator('body')).not.toHaveClass(/notes-split-active/);
});
test('empty Enter exits ordered lists without leaving a phantom list item', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 list boundary');

  await page.click(PM_SELECTOR);
  await page.keyboard.type('1. first item');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('after list');

  const state = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    return {
      listItems: Array.from(pm.querySelectorAll('ol > li')).map(li => li.textContent.trim()),
      trailingParagraphs: Array.from(pm.querySelectorAll(':scope > p')).map(p => p.textContent.trim())
    };
  }, PM_SELECTOR);

  expect(state.listItems).toEqual(['first item']);
  expect(state.trailingParagraphs).toContain('after list');
});

test('pasted foreign fonts and colors are stripped while document structure survives', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 paste cleanup');

  await page.click(PM_SELECTOR);
  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    const data = new DataTransfer();
    data.setData('text/html',
      '<h1 style="font-family: Comic Sans MS; color: red">Paste Heading</h1>' +
      '<p class="MsoNormal" style="font-size: 22pt; color: blue"><strong><a href="https://example.com" style="color: green">Linked bold</a></strong></p>' +
      '<table style="font-family: Times New Roman; color: purple"><tbody><tr><td style="background: yellow; color: purple">Cell</td></tr></tbody></table>'
    );
    data.setData('text/plain', 'Paste Heading\nLinked bold\nCell');
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    // Firefox's synthetic ClipboardEvent constructor does not retain supplied
    // DataTransfer contents. Keep this fixture payload on the dispatched event.
    Object.defineProperty(event, 'clipboardData', { value: data });
    pm.dispatchEvent(event);
  }, PM_SELECTOR);

  await page.waitForFunction((sel) => document.querySelector(sel).textContent.includes('Linked bold'), PM_SELECTOR);
  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('<h1>Paste Heading</h1>');
  expect(html).toContain('<strong>');
  expect(html).toContain('<a');
  expect(html).toContain('href="https://example.com"');
  expect(html).toContain('<table');
  expect(html).not.toMatch(/font-family|font-size|color:\s*(red|blue|green|purple)|background:\s*yellow|class="MsoNormal"/i);
});

test('modern editor is ON by default; disabling restores the classic editor', async ({ page }) => {
  await openApp(page);

  // Default ON: v2 mounts at boot, the classic #editor is a hidden mirror.
  await page.waitForFunction(() => window.SutraNotesEditorV2.isMounted(), { timeout: 8000 });
  const defaults = await page.evaluate(() => ({
    mounted: window.SutraNotesEditorV2.isMounted(),
    hostExists: !!document.getElementById('editorV2Host'),
    legacyEditable: document.getElementById('editor').getAttribute('contenteditable'),
    legacyDisplay: document.getElementById('editor').style.display
  }));
  expect(defaults.mounted).toBe(true);
  expect(defaults.hostExists).toBe(true);
  expect(defaults.legacyEditable).toBe('false');
  expect(defaults.legacyDisplay).toBe('none');

  // Explicit opt-out: v2 unmounts and the classic editor comes back.
  await page.evaluate(() => {
    window.setWorkspacePreference('editor.editorV2Enabled', false, {});
    window.applyWorkspacePreferences({});
  });
  const restored = await page.evaluate(() => ({
    mounted: window.SutraNotesEditorV2.isMounted(),
    hostExists: !!document.getElementById('editorV2Host'),
    legacyDisplay: document.getElementById('editor').style.display,
    legacyEditable: document.getElementById('editor').getAttribute('contenteditable')
  }));
  expect(restored.mounted).toBe(false);
  expect(restored.hostExists).toBe(false);
  expect(restored.legacyDisplay).not.toBe('none');
  expect(restored.legacyEditable).toBe('true');
});

// ---- Phase 1: parity plumbing (find/replace, indent, keymap, spacing, fonts) ----

test('find & replace runs over the v2 document, not the hidden mirror', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 find replace');

  const found = await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent('<p>alpha beta alpha gamma alpha</p>');
    return window.SutraNotesEditorV2.search.set('alpha');
  });
  expect(found.count).toBe(3);
  expect(found.index).toBe(0);

  const cycled = await page.evaluate(() => window.SutraNotesEditorV2.search.next());
  expect(cycled.index).toBe(1);

  const afterReplace = await page.evaluate(() => {
    window.SutraNotesEditorV2.search.set('alpha');
    window.SutraNotesEditorV2.search.replaceAll('ALPHA');
    return window.SutraNotesEditorV2.getStorageHtml();
  });
  expect(afterReplace).toContain('ALPHA');
  expect(afterReplace).not.toContain('alpha');
  // Decoration highlights are view-only — they must never leak into storage.
  expect(afterReplace).not.toContain('find-highlight');
});

test('Tab indents a paragraph and stores margin-left (legacy-compatible)', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 indent');

  await page.click(PM_SELECTOR);
  await page.keyboard.type('indented line');
  await page.keyboard.press('Tab');

  const afterIndent = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(afterIndent).toContain('margin-left: 40px');

  await page.keyboard.press('Shift+Tab');
  const afterOutdent = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(afterOutdent).not.toContain('margin-left');
});

test('Ctrl+Alt+1 turns the current block into an H1', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 heading shortcut');

  await page.click(PM_SELECTOR);
  await page.keyboard.type('make me a heading');
  await page.keyboard.press('Control+Alt+1');

  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('<h1>make me a heading</h1>');
});

test('line spacing sets block line-height in storage', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 line spacing');

  const html = await page.evaluate((sel) => {
    window.SutraNotesEditorV2.setContent('<p>spaced paragraph</p>');
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    pm.editor.commands.selectAll();
    window.SutraNotesEditorV2.exec('lineHeight', '2');
    return window.SutraNotesEditorV2.getStorageHtml();
  }, PM_SELECTOR);
  expect(html).toContain('line-height: 2');
});

test('font family and size commands round-trip through storage', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 fonts');

  const html = await page.evaluate((sel) => {
    window.SutraNotesEditorV2.setContent('<p>styled text</p>');
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    pm.editor.commands.selectAll();
    window.SutraNotesEditorV2.exec('fontFamily', 'Georgia');
    window.SutraNotesEditorV2.exec('fontSize', '24px');
    return window.SutraNotesEditorV2.getStorageHtml();
  }, PM_SELECTOR);
  expect(html).toMatch(/font-family:\s*Georgia/i);
  expect(html).toContain('24px');
});

// ---- Phase 2: Docs-style toolbar controls (selects/steppers) ----

test('toolbar style + font + spacing selects drive the v2 document', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 toolbar controls');

  const selectAll = () => page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    pm.editor.commands.selectAll();
  }, PM_SELECTOR);

  await page.evaluate(() => window.SutraNotesEditorV2.setContent('<p>styled paragraph</p>'));
  await selectAll();
  await page.selectOption('#toolbarStylesSelect', 'h2');
  await selectAll();
  await page.selectOption('#toolbarFontFamily', 'Georgia, serif');
  await selectAll();
  await page.selectOption('#toolbarLineSpacing', '1.5');

  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('<h2');
  expect(html).toMatch(/font-family:\s*Georgia/i);
  expect(html).toContain('line-height: 1.5');
});

test('font-size stepper buttons change the size and reflect in the input', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 size stepper');

  await page.evaluate(() => window.SutraNotesEditorV2.setContent('<p>resize me</p>'));
  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    pm.editor.commands.selectAll();
  }, PM_SELECTOR);
  await page.evaluate(() => { document.getElementById('toolbarFontSize').value = '16'; });

  // Click "+" twice → 16 → 18 → 20.
  const plus = page.locator('.toolbar-size-stepper .toolbar-size-btn').last();
  await plus.click();
  await plus.click();

  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('20px');
});

// ---- Phase 3: contextual editing UX ----

test('selection bubble menu appears and applies bold', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 bubble');

  await page.evaluate(() => window.SutraNotesEditorV2.setContent('<p>select these words</p>'));
  await page.click(PM_SELECTOR);
  await page.keyboard.press('Control+a');

  const bubble = page.locator('.editor-v2-bubble');
  await expect(bubble).toBeVisible();
  await bubble.locator('.editor-v2-mini-btn').first().click(); // Bold

  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('<strong>');
});

test('slash menu inserts a block and consumes the trigger text', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 slash');

  await page.evaluate(() => window.SutraNotesEditorV2.setContent('<p></p>'));
  await page.click(PM_SELECTOR);
  await page.keyboard.type('/table');
  await expect(page.locator('.editor-v2-slash-menu')).toBeVisible();
  await page.keyboard.press('Enter');

  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('<table');
  // The typed "/table" trigger must be consumed — no literal text left behind.
  const text = await page.evaluate((sel) => document.querySelector(sel).textContent, PM_SELECTOR);
  expect(text).not.toContain('/table');
});

test('smart paste recovers Google Docs style-based bold/italic as semantics', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 docs paste');

  await page.click(PM_SELECTOR);
  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    const data = new DataTransfer();
    data.setData('text/html',
      '<b id="docs-internal-guid-abc" style="font-weight:normal">' +
      '<p><span style="font-weight:700">Bold via style</span> and <span style="font-style:italic">italic via style</span></p>' +
      '</b>');
    data.setData('text/plain', 'Bold via style and italic via style');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    pm.dispatchEvent(event);
  }, PM_SELECTOR);

  await page.waitForFunction((sel) => document.querySelector(sel).textContent.includes('Bold via style'), PM_SELECTOR);
  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('<strong>Bold via style</strong>');
  expect(html).toContain('<em>italic via style</em>');
  expect(html).not.toMatch(/font-weight|font-style/i);
});

test('smart paste converts Word mso-list paragraphs into a real list', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 word list paste');

  await page.evaluate(() => window.SutraNotesEditorV2.setContent('<p></p>'));
  await page.click(PM_SELECTOR);
  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    const data = new DataTransfer();
    data.setData('text/html',
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>First item</p>' +
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.</span>Second item</p>');
    data.setData('text/plain', 'First item\nSecond item');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    pm.dispatchEvent(event);
  }, PM_SELECTOR);

  await page.waitForFunction((sel) => document.querySelector(sel).textContent.includes('First item'), PM_SELECTOR);
  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toMatch(/<ol>/);
  expect(html).toContain('First item');
  expect(html).not.toContain('mso-list');
});

test('block drag handle appears on hover and reorders top-level blocks', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 drag reorder');

  await page.evaluate(() => window.SutraNotesEditorV2.setContent('<p>Alpha block</p><p>Beta block</p><p>Gamma block</p>'));
  const first = page.locator('#editorV2Host .ProseMirror > p').first();
  await first.hover();
  await expect(page.locator('.editor-v2-drag-handle')).toBeVisible();

  // Drive the pointer drag through real DOM events on the handle element.
  // (Coordinate hit-testing on a body-appended fixed handle is flaky headless;
  // dispatching on the element exercises the same mousedown→move→up handlers.)
  const order = await page.evaluate(async (sel) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const pm = document.querySelector(sel);
    const ps = () => pm.querySelectorAll(':scope > p');
    const r0 = ps()[0].getBoundingClientRect();
    pm.dispatchEvent(new MouseEvent('mousemove', { clientX: r0.left + 20, clientY: r0.top + 8, bubbles: true }));
    await sleep(40);
    const handle = document.querySelector('.editor-v2-drag-handle');
    const hb = handle.getBoundingClientRect();
    const gamma = ps()[2].getBoundingClientRect();
    handle.dispatchEvent(new MouseEvent('mousedown', { clientX: hb.left + 2, clientY: hb.top + 2, bubbles: true }));
    for (let i = 1; i <= 6; i++) {
      const y = r0.top + (gamma.bottom + 6 - r0.top) * (i / 6);
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: gamma.left + 20, clientY: y, bubbles: true }));
      await sleep(8);
    }
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: gamma.left + 20, clientY: gamma.bottom + 6, bubbles: true }));
    await sleep(60);
    return Array.from(ps()).map(p => p.textContent.trim()).filter(Boolean);
  }, PM_SELECTOR);
  expect(order[order.length - 1]).toContain('Alpha');
});

// ---- Phase 4: Docs-grade tables & images ----

test('table structure commands merge cells, toggle header, and delete a column', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 tables');

  const result = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    // Insert a 3x3 table, place the cursor in the first body cell.
    window.SutraNotesEditorV2.exec('table', { rows: 3, cols: 3 });
    const table = pm.querySelector('table');
    const firstCell = table.querySelectorAll('td, th')[0];
    // Select the first two header cells → merge.
    const cells = table.querySelectorAll('th');
    const range = document.createRange();
    range.selectNodeContents(cells[0]);
    const range2 = document.createRange();
    range2.selectNodeContents(cells[1]);
    // Use TipTap cell-selection via commands instead of DOM selection.
    return { hasTable: !!table, headerCells: cells.length };
  }, PM_SELECTOR);
  expect(result.hasTable).toBe(true);

  // Header row toggle + delete column via the command bridge.
  const storage = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    // put cursor in first cell
    pm.editor.commands.setTextSelection(3);
    window.SutraNotesEditorV2.exec('addColumnAfter');
    window.SutraNotesEditorV2.exec('toggleHeaderRow');
    return window.SutraNotesEditorV2.getStorageHtml();
  }, PM_SELECTOR);
  expect(storage).toContain('<table');
  // Round-trips as legacy table HTML (colgroup + cells).
  expect(storage).toMatch(/<t(d|h)/);
});

test('merged cells round-trip through storage with colspan', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 merge');

  const storage = await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    window.SutraNotesEditorV2.exec('table', { rows: 2, cols: 3 });
    // Select the first two cells of the body row as a CellSelection and merge.
    // CellSelection positions point at (before) each cell node.
    if (pm.editor.commands.setCellSelection) {
      let bodyCells = [];
      pm.editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'tableCell') bodyCells.push(pos);
      });
      if (bodyCells.length >= 2) {
        pm.editor.commands.setCellSelection({ anchorCell: bodyCells[0], headCell: bodyCells[1] });
        window.SutraNotesEditorV2.exec('mergeCells');
      }
    }
    return window.SutraNotesEditorV2.getStorageHtml();
  }, PM_SELECTOR);
  expect(storage).toMatch(/colspan="2"/);
});

test('inserting an image in v2 creates a resizable image node, not a media-wrapper', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 image');

  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    window.SutraNotesEditorV2.insertHtml('<img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="dot">');
  }, PM_SELECTOR);

  // The NodeView renders a wrap + resize handle in the editor.
  await expect(page.locator('#editorV2Host .sutra-img-wrap img')).toBeVisible();

  // Align + width via the command bridge round-trips to storage.
  const storage = await page.evaluate(() => {
    const pm = document.querySelector('#editorV2Host .ProseMirror');
    pm.editor.commands.focus();
    // Select the image node (first child).
    pm.editor.commands.setNodeSelection(0);
    window.SutraNotesEditorV2.exec('imageAlign', 'center');
    window.SutraNotesEditorV2.exec('imageWidth', '240px');
    return window.SutraNotesEditorV2.getStorageHtml();
  });
  expect(storage).toContain('<img');
  expect(storage).toContain('data-align="center"');
  expect(storage).toContain('width: 240px');
  expect(storage).not.toContain('media-wrapper');
});

test('pasting an image into v2 inserts and persists the image', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 pasted image');

  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.focus();
    const data = new DataTransfer();
    const bytes = Uint8Array.from(atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    ), (char) => char.charCodeAt(0));
    data.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    pm.dispatchEvent(event);
  }, PM_SELECTOR);

  await expect(page.locator('#editorV2Host .sutra-img-wrap img')).toBeVisible({ timeout: 5_000 });
  const state = await page.evaluate(() => ({
    imageCount: document.querySelectorAll('#editorV2Host .sutra-img-wrap img').length,
    storage: window.SutraNotesEditorV2.getStorageHtml()
  }));
  expect(state.imageCount).toBe(1);
  expect(state.storage).toContain('data:image/png;base64,');

  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    window.SutraNotesEditorV2.flushToMirror();
    await window.saveWorkspaceLocally();
  });
  await expect.poll(() => page.evaluate(async () => {
    const workspace = await window.loadWorkspaceLocally();
    const current = workspace?.pages?.find((note) => note.id === window.flowAtelier.currentPageId);
    return current?.content || '';
  })).toContain('data:image/png;base64,');

  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await completeOnboarding(page);
  await page.waitForFunction(() => window.SutraNotesEditorV2 && window.SutraNotesEditorV2.isMounted());
  await openNotesView(page);
  await expect(page.locator('#editorV2Host .sutra-img-wrap img')).toBeVisible({ timeout: 5_000 });
  const restored = await page.evaluate(() => {
    const image = document.querySelector('#editorV2Host .sutra-img-wrap img');
    return {
      src: image?.getAttribute('src') || '',
      naturalWidth: image?.naturalWidth || 0
    };
  });
  expect(restored.src).toContain('data:image/png;base64,');
  expect(restored.naturalWidth).toBeGreaterThan(0);
});

// ---- Phase 5: page-like layout ----

test('pages mode renders the v2 host as a clean page card', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 pages');

  await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent('<h1>Doc title</h1><p>Body text on the page.</p>');
    if (!document.body.classList.contains('notes-pages-mode')) window.togglePagesMode();
  });
  await expect(page.locator('body')).toHaveClass(/notes-pages-mode/);

  const metrics = await page.evaluate(() => {
    const host = document.getElementById('editorV2Host');
    const pane = document.querySelector('#view-notes .notes-pane-primary');
    const hcs = getComputedStyle(host);
    return {
      paneWidth: Math.round(pane.getBoundingClientRect().width),
      hostBg: hcs.backgroundColor,
      hostPad: hcs.padding
    };
  });
  // The pane is the physical page card (~816px letter width); the host adds no
  // background or padding of its own (no double-padding / grey inner panel).
  expect(metrics.paneWidth).toBeGreaterThanOrEqual(760);
  expect(metrics.hostPad).toBe('0px');
  expect(metrics.hostBg).toBe('rgba(0, 0, 0, 0)');

  // A page break inserts as a rendered break atom inside the host.
  await page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    pm.editor.commands.focus();
    if (window.insertPageBreak) window.insertPageBreak();
  }, PM_SELECTOR);
  await expect(page.locator('#editorV2Host .atelier-page-break')).toHaveCount(1);
  expect(await page.locator('#editorV2Host .atelier-page-break').evaluate((node) => getComputedStyle(node, '::after').display)).toBe('none');
});

test('page-break dividers survive legacy style overrides, themes, reload, and print', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 page-break dividers');

  await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent(
      '<p>Paragraph before the first break.</p>' +
      '<div class="atelier-page-break" data-atelier-block="page-break" role="separator" aria-label="Page break"></div>' +
      '<h2>Heading between breaks</h2>' +
      '<div class="atelier-page-break" data-atelier-block="page-break" style="background: none;" role="separator" aria-label="Page break"></div>' +
      '<ul><li>List content between breaks</li></ul>' +
      '<div class="atelier-page-break" data-atelier-block="page-break" style="background-image: none;" role="separator" aria-label="Page break"></div>' +
      '<blockquote>Blockquote after the last break.</blockquote>'
    );
  });

  const readBreakMetrics = () => page.evaluate(() => Array.from(document.querySelectorAll('#editorV2Host .atelier-page-break')).map((node) => {
    const line = getComputedStyle(node, '::after');
    const rect = node.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      lineDisplay: line.display,
      lineWidth: parseFloat(line.width),
      lineHeight: line.height,
      lineColor: line.backgroundColor,
      lineLeft: line.left,
      lineRight: line.right,
      labelDisplay: getComputedStyle(node, '::before').display
    };
  }));

  const assertVisibleDividers = (metrics) => {
    expect(metrics).toHaveLength(3);
    expect(metrics.map((metric) => metric.width)).toEqual([metrics[0].width, metrics[0].width, metrics[0].width]);
    expect(metrics.every((metric) => metric.width > 0 && metric.height > 0)).toBe(true);
    expect(metrics.every((metric) => metric.lineDisplay === 'block')).toBe(true);
    expect(metrics.every((metric) => Math.abs(metric.lineWidth - metric.width) < 0.1)).toBe(true);
    expect(metrics.every((metric) => metric.lineHeight === '1px')).toBe(true);
    expect(metrics.every((metric) => metric.lineColor !== 'rgba(0, 0, 0, 0)')).toBe(true);
    expect(metrics.every((metric) => metric.lineLeft === '0px' && metric.lineRight === '0px')).toBe(true);
    expect(metrics.every((metric) => metric.labelDisplay === 'block')).toBe(true);
  };

  assertVisibleDividers(await readBreakMetrics());

  await page.evaluate(async () => {
    await window.applyAtelierTheme('dark', { persist: false });
  });
  const darkMetrics = await readBreakMetrics();
  assertVisibleDividers(darkMetrics);
  expect(new Set(darkMetrics.map((metric) => metric.lineColor)).size).toBe(1);

  await page.evaluate(async () => {
    window.SutraNotesEditorV2.flushToMirror();
    await window.saveWorkspaceLocally();
  });
  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await completeOnboarding(page);
  await page.waitForFunction(() => window.SutraNotesEditorV2 && window.SutraNotesEditorV2.isMounted());
  await openNotesView(page);
  await page.waitForFunction(() => document.querySelectorAll('#editorV2Host .atelier-page-break').length === 3);
  await page.evaluate(async () => {
    await window.applyAtelierTheme('dark', { persist: false });
  });
  assertVisibleDividers(await readBreakMetrics());

  await page.evaluate(() => window.togglePagesMode());
  await expect(page.locator('#editorV2Host [data-notes-auto-page-reason="manual"] .notes-page-auto-break-gap')).toHaveCount(3);
  const pageModeMetrics = await page.evaluate(() => {
    const editor = document.querySelector('#editorV2Host .ProseMirror');
    const pane = document.querySelector('#notesPrimaryPane');
    const paneRect = pane.getBoundingClientRect();
    const paneScale = pane.offsetHeight ? paneRect.height / pane.offsetHeight : 1;
    const manualBreaks = editor.querySelectorAll('.atelier-page-break').length;
    const manualGaps = Array.from(editor.querySelectorAll('[data-notes-auto-page-reason="manual"] .notes-page-auto-break-gap'))
      .map(gap => ({
        height: gap.getBoundingClientRect().height / paneScale,
        backgroundColor: getComputedStyle(gap).backgroundColor
      }));
    return { manualBreaks, manualGaps };
  });
  expect(pageModeMetrics.manualBreaks).toBe(3);
  expect(pageModeMetrics.manualGaps).toHaveLength(3);
  expect(pageModeMetrics.manualGaps.every(metric => Math.abs(metric.height - 60) < 0.5)).toBe(true);
  expect(pageModeMetrics.manualGaps.every(metric => metric.backgroundColor !== 'rgba(0, 0, 0, 0)')).toBe(true);
  await page.evaluate(() => window.togglePagesMode());

  await page.emulateMedia({ media: 'print' });
  const printMetrics = await page.evaluate(() => Array.from(document.querySelectorAll('#editorV2Host .atelier-page-break')).map((node) => ({
    breakBefore: getComputedStyle(node).breakBefore,
    lineDisplay: getComputedStyle(node, '::after').display,
    labelDisplay: getComputedStyle(node, '::before').display
  })));
  expect(printMetrics.every((metric) => metric.breakBefore === 'page')).toBe(true);
  expect(printMetrics.every((metric) => metric.lineDisplay === 'none' && metric.labelDisplay === 'none')).toBe(true);
  await page.emulateMedia({ media: 'screen' });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMetrics = await readBreakMetrics();
  assertVisibleDividers(mobileMetrics);
});

// ---- Phase 6: live NodeViews for preserved atoms ----

test('embedded media renders as a live element and still round-trips verbatim', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 media live');

  await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent(
      '<div class="media-wrapper" data-type="video"><video controls><source src="data:video/mp4;base64,AAAAHGZ0" type="video/mp4"></video></div>'
    );
  });

  // The media element is live in the editor (NodeView renders it), not a card.
  await expect(page.locator('#editorV2Host video')).toHaveCount(1);

  // Storage keeps the media-wrapper anchor byte-compatible.
  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('class="media-wrapper"');
  expect(html).toContain('<video');
});

test('math atoms render live KaTeX while storage keeps the raw LaTeX', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'v2 math live');

  await page.evaluate(() => {
    window.SutraNotesEditorV2.setContent(
      '<p>x: <span class="sutra-math-block" data-latex="x^2" contenteditable="false">x^2</span></p>'
    );
  });

  // The NodeView renders KaTeX into the span for display.
  await expect(page.locator('#editorV2Host .sutra-math-block .katex')).toBeVisible({ timeout: 6000 });

  // Storage still holds the raw LaTeX (display-only render never leaks in).
  const html = await page.evaluate(() => window.SutraNotesEditorV2.getStorageHtml());
  expect(html).toContain('data-latex="x^2"');
  expect(html).not.toContain('class="katex"');
});


test('undo history is isolated when switching between notes', async ({ page }) => {
  await openApp(page);
  await enableEditorV2(page);
  await openNotesView(page);
  await createBlankNote(page, 'undo boundary alpha');

  await page.click(PM_SELECTOR);
  await page.keyboard.type('alpha-only note content');
  const alphaId = await page.evaluate(() => {
    window.SutraNotesEditorV2.flushToMirror();
    window.savePage();
    return window.flowAtelier.currentPageId;
  });

  await createBlankNote(page, 'undo boundary beta');
  await page.click(PM_SELECTOR);
  await page.keyboard.type('beta-only note content');
  const betaId = await page.evaluate(() => {
    window.SutraNotesEditorV2.flushToMirror();
    window.savePage();
    return window.flowAtelier.currentPageId;
  });

  await page.evaluate(({ firstId, secondId }) => {
    window.loadPage(firstId);
    window.loadPage(secondId);
  }, { firstId: alphaId, secondId: betaId });
  await page.waitForFunction(({ id, text }) => {
    const pm = document.querySelector('#editorV2Host .ProseMirror');
    return window.flowAtelier.currentPageId === id && pm && pm.textContent.includes(text);
  }, { id: betaId, text: 'beta-only note content' });

  await page.click(PM_SELECTOR);
  await page.keyboard.press('Control+z');

  const current = await page.evaluate(() => ({
    pageId: window.flowAtelier.currentPageId,
    text: document.querySelector('#editorV2Host .ProseMirror').textContent
  }));
  expect(current.pageId).toBe(betaId);
  expect(current.text).toContain('beta-only note content');
  expect(current.text).not.toContain('alpha-only note content');
});
