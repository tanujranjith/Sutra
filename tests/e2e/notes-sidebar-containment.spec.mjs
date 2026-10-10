import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

test('scrolling the Homework class picker does not expose inactive Notes lists', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const hooks = window.__sutraPublicBetaTestHooks;
    hooks.createNoteInActiveSpace('Inactive picker note one', '<p>First note.</p>');
    hooks.createNoteInActiveSpace('Inactive picker note two', '<p>Second note.</p>');
    const store = window.SutraHomeworkStore;
    store.replace({ ...store.getSnapshot(), courses: Array.from({ length: 32 }, (_, index) => ({
      id: `picker-course-${index}`, name: `Picker Class ${index + 1}`, type: 'class'
    })), tasks: [] }, { reason: 'homework-picker-containment-fixture' });
    document.getElementById('splitNotesToggleBtn').click();
    window.setActiveView('homework');
    window.openQuickCaptureModal('Finish worksheet', { type: 'homework' });
  });
  await expect(page.locator('#quickCaptureModal')).toBeVisible();
  await page.locator('#quickCaptureCourse').locator('xpath=..').locator('.nf-select-trigger').click();
  const menu = page.locator('#quickCaptureCourse-menu');
  await expect(menu).toHaveClass(/is-open/);
  await menu.locator('.nf-select-option').last().scrollIntoViewIfNeeded();
  expect(await menu.evaluate(element => element.scrollTop > 0)).toBe(true);
  await expect(page.locator('.page-item:visible')).toHaveCount(0);
  await expect(page.getByText('Inactive picker note one', { exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText('Inactive picker note two', { exact: true }).filter({ visible: true })).toHaveCount(0);
  const splitMenu = page.locator('#splitNoteSelect-menu');
  await expect(splitMenu).toHaveAttribute('aria-hidden', 'true');
  expect(await splitMenu.evaluate(element => element.inert && getComputedStyle(element).opacity === '0')).toBe(true);
  await page.locator('#quickCaptureCancelBtn').click();
  await expect(menu).not.toHaveClass(/is-open/);
  await expect(page.locator('.page-item:visible')).toHaveCount(0);
});

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await page.waitForFunction(() => !!window.__sutraPublicBetaTestHooks && !!window.flowAtelier);
  await waitForAppReady(page);
  await page.evaluate(() => {
    if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true);
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.setProperty('display', 'none', 'important');
    }
  });
  await page.locator('.view-tabs > .view-tab[data-view="notes"]').click();
  await expect(page.locator('#view-notes')).toBeVisible();
}

async function createFolder(page, name) {
  await page.locator('.new-folder-btn').click();
  await expect(page.locator('#newPageModal')).toHaveClass(/active/);
  await page.locator('#newPageName').fill(name);
  await page.locator('#newPageConfirmBtn').click();
  await expect(page.locator('#newPageModal')).not.toHaveClass(/active/);
  return page.evaluate(folderName => window.__sutraPublicBetaTestHooks
    .getPagesForSpace(window.__sutraPublicBetaTestHooks.getActiveSpaceId())
    .find(note => note.title === folderName)?.id, name);
}

async function sidebarState(page) {
  return page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    const list = document.getElementById('pagesList');
    const footer = sidebar?.querySelector('.sidebar-new-page');
    if (!sidebar || !list || !footer) return null;
    const bounds = element => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    };
    const rows = Array.from(list.querySelectorAll('.page-item'));
    const outsideRows = Array.from(document.querySelectorAll('.page-item')).filter(row => !list.contains(row));
    const rowIds = rows.map(row => row.dataset.pageId).filter(Boolean);
    const listBounds = bounds(list);
    const footerBounds = bounds(footer);
    const sidebarBounds = bounds(sidebar);
    return {
      rowCount: rows.length,
      uniqueRowIds: new Set(rowIds).size,
      outsideRowCount: outsideRows.length,
      listScrolls: list.scrollHeight > list.clientHeight,
      listBottom: listBounds.bottom,
      footerTop: footerBounds.top,
      footerBottom: footerBounds.bottom,
      sidebarBottom: sidebarBounds.bottom,
      footerFits: footerBounds.bottom <= sidebarBounds.bottom + 1,
      listEndsBeforeFooter: listBounds.bottom <= footerBounds.top + 1,
      longTitleFits: rows.every(row => {
        const title = row.querySelector('.page-title-text');
        if (!title || !title.textContent.includes('Long Sidebar Title')) return true;
        const rowBounds = row.getBoundingClientRect();
        const titleBounds = title.getBoundingClientRect();
        return titleBounds.right <= rowBounds.right + 1;
      })
    };
  });
}

test('Notes and folders stay inside the sidebar list during icon and page-link picking', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await openApp(page);
  const folderName = 'QA Sidebar Folder';
  const folderId = await createFolder(page, folderName);
  expect(folderId).toBeTruthy();

  const ids = await page.evaluate(folder => {
    const hooks = window.__sutraPublicBetaTestHooks;
    const seeded = [
      hooks.createNoteInActiveSpace('Repeated Sidebar Title', '<p>First synthetic note.</p>'),
      hooks.createNoteInActiveSpace('Repeated Sidebar Title', '<p>Second synthetic note.</p>'),
      hooks.createNoteInActiveSpace(`${folder}::Repeated Child`, '<p>Folder child.</p>'),
      hooks.createNoteInActiveSpace(`Long Sidebar Title ${'with a long suffix '.repeat(8)}`, '<p>Long title fixture.</p>')
    ];
    for (let index = 0; index < 22; index += 1) {
      seeded.push(hooks.createNoteInActiveSpace(`QA Sidebar Scroll ${index + 1}`, '<p>Scroll fixture.</p>'));
    }
    return seeded.map(note => note.id);
  }, folderName);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('notes-sidebar-containment-seed'));

  const originalPages = await page.evaluate(noteIds => window.flowAtelier.pages
    .filter(note => noteIds.includes(note.id))
    .map(note => ({ id: note.id, title: note.title, content: note.content })), ids);
  expect(originalPages).toHaveLength(ids.length);
  expect(new Set(originalPages.map(note => note.id)).size).toBe(ids.length);
  expect(originalPages.filter(note => note.title === 'Repeated Sidebar Title')).toHaveLength(2);

  const externalRowDisplay = await page.evaluate(pageId => {
    const row = document.createElement('button');
    row.className = 'page-item';
    row.dataset.pageId = pageId;
    row.style.display = 'none';
    document.body.appendChild(row);
    if (typeof window.filterPages !== 'function') throw new Error('The sidebar filter entry point is unavailable.');
    window.filterPages();
    const display = row.style.display;
    row.remove();
    return display;
  }, ids[0]);
  expect(externalRowDisplay).toBe('none');

  const icon = page.locator(`#pagesList .page-item[data-page-id="${ids[0]}"] .page-icon`);
  await icon.click();
  await expect(page.locator('#emojiPicker')).toHaveClass(/active/);
  await page.locator('#emojiSearch').fill('heart');
  await expect(page.locator('#emojiGrid .emoji-option').first()).toBeVisible();
  const whileIconPickerOpen = await sidebarState(page);
  expect(whileIconPickerOpen.outsideRowCount).toBe(0);
  await page.locator('#emojiPicker .emoji-close-btn').click();
  await expect(page.locator('#emojiPicker')).not.toHaveClass(/active/);

  await page.evaluate(() => {
    if (typeof window.insertPageLink !== 'function') throw new Error('The page-link command is unavailable.');
    window.insertPageLink();
  });
  const pageLinkModal = page.locator('#pageLinkModal');
  await expect(pageLinkModal).toHaveClass(/active/);
  await page.locator('#pageLinkSearch').fill('Repeated Sidebar Title');
  await expect(pageLinkModal.locator('.page-link-option')).toHaveCount(2);
  const whilePageLinkOpen = await sidebarState(page);
  expect(whilePageLinkOpen.outsideRowCount).toBe(0);
  await expect(pageLinkModal.locator('.page-item')).toHaveCount(0);
  await page.locator('#pageLinkCancelBtn').click();
  await expect(pageLinkModal).not.toHaveClass(/active/);

  const afterPickers = await page.evaluate(noteIds => window.flowAtelier.pages
    .filter(note => noteIds.includes(note.id))
    .map(note => ({ id: note.id, title: note.title, content: note.content })), ids);
  expect(afterPickers).toEqual(originalPages);
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('notes-sidebar-containment-pickers'));

  const settled = await sidebarState(page);
  expect(settled.outsideRowCount).toBe(0);
  expect(settled.uniqueRowIds).toBe(settled.rowCount);
  expect(settled.listScrolls).toBe(true);
  expect(settled.footerFits).toBe(true);
  expect(settled.listEndsBeforeFooter).toBe(true);
  expect(settled.longTitleFits).toBe(true);

  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await page.waitForFunction(() => !!window.__sutraPublicBetaTestHooks && !!window.flowAtelier);
  await waitForAppReady(page);
  await page.evaluate(() => window.setActiveView('notes'));
  await expect.poll(() => sidebarState(page)).toMatchObject({ outsideRowCount: 0, footerFits: true, listEndsBeforeFooter: true });
  const persisted = await page.evaluate(noteIds => window.flowAtelier.pages
    .filter(note => noteIds.includes(note.id))
    .map(note => ({ id: note.id, title: note.title, content: note.content })), ids);
  expect(persisted).toEqual(originalPages);
});

test('the body-portaled Split View Note selector closes when its owner becomes inactive', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await openApp(page);
  const ids = await page.evaluate(() => {
    const hooks = window.__sutraPublicBetaTestHooks;
    return [
      hooks.createNoteInActiveSpace('Portal owner primary', '<p>Primary note.</p>').id,
      hooks.createNoteInActiveSpace('Portal owner secondary', '<p>Secondary note.</p>').id
    ];
  });
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('split-note-portal-seed'));

  const menu = page.locator('#splitNoteSelect-menu');
  await expect(menu).toBeAttached();
  await expect(menu).not.toHaveClass(/is-open/);
  await expect(menu).toHaveAttribute('aria-hidden', 'true');
  expect(await menu.evaluate(element => element.inert)).toBe(true);

  const openSplitView = () => page.evaluate(() => document.getElementById('splitNotesToggleBtn').click());
  await openSplitView();
  await expect(page.locator('body')).toHaveClass(/notes-split-active/);
  await page.locator('#splitNoteSelect').locator('xpath=..').locator('.nf-select-trigger').click();
  await expect(menu).toHaveClass(/is-open/);
  await expect(menu).not.toHaveAttribute('aria-hidden', 'true');
  expect(await menu.evaluate(element => element.inert)).toBe(false);
  await expect(menu.locator('.nf-select-option').filter({ hasText: 'Portal owner primary' })).toHaveCount(1);
  await expect(menu.locator('.nf-select-option').filter({ hasText: 'Portal owner secondary' })).toHaveCount(1);

  // This follows the app lifecycle path directly so the test exercises the
  // hidden owner, rather than the enhancer's unrelated outside-pointer close.
  await page.evaluate(() => document.getElementById('closeSplitNotesBtn').click());
  await expect(page.locator('body')).not.toHaveClass(/notes-split-active/);
  await expect(menu).not.toHaveClass(/is-open/);
  await expect(menu).toHaveAttribute('aria-hidden', 'true');
  expect(await menu.evaluate(element => element.inert)).toBe(true);
  await expect.poll(() => menu.evaluate(element => getComputedStyle(element).opacity)).toBe('0');
  await expect.poll(() => menu.evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');

  const primaryIcon = page.locator(`#pagesList .page-item[data-page-id="${ids[0]}"] .page-icon`);
  await primaryIcon.click();
  await page.locator('#emojiSearch').fill('heart');
  await expect(page.locator('#emojiGrid .emoji-option').first()).toBeVisible();
  await expect(menu).not.toHaveClass(/is-open/);
  await expect(menu).toHaveAttribute('aria-hidden', 'true');
  await page.locator('#emojiPicker .emoji-close-btn').click();

  await openSplitView();
  await expect(page.locator('body')).toHaveClass(/notes-split-active/);
  await page.locator('#splitNoteSelect').locator('xpath=..').locator('.nf-select-trigger').click();
  await expect(menu).toHaveClass(/is-open/);
  await page.evaluate(() => window.setActiveView('today'));
  await expect(page.locator('body')).toHaveAttribute('data-view', 'today');
  await expect(menu).not.toHaveClass(/is-open/);
  await expect(menu).toHaveAttribute('aria-hidden', 'true');
  expect(await menu.evaluate(element => element.inert)).toBe(true);
  await page.evaluate(() => window.setActiveView('notes'));
  await expect(page.locator('#view-notes')).toBeVisible();
  await expect(menu).not.toHaveClass(/is-open/);
  await expect(menu).toHaveAttribute('aria-hidden', 'true');
});
