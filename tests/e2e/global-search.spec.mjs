import { expect, test } from '@playwright/test';

// Workspace-wide Global Search modal (#globalSearchPanel): entry points
// (Ctrl/Cmd+K, sidebar launcher), unified results across entity types, filter
// chips, keyboard navigation, open-on-Enter/click navigation, recents,
// locked-page privacy, and freshness (new/edited/deleted items).

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
    }
  });
  await expect(page.locator('#studentOnboardingOverlay')).toBeHidden();
}

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('.app-container', { state: 'visible' });
  await page.waitForFunction(() => typeof window.serializeWorkspace === 'function');
  await completeOnboarding(page);
}

// Homework localStorage seeds must be installed before navigation so the
// canonical homework store hydrates them at boot.
async function addHomeworkSeed(page) {
  await page.addInitScript(() => {
    localStorage.setItem('hwCourses:v2', JSON.stringify([
      { id: 'c-bio', name: 'Biology 101', type: 'class' }
    ]));
    localStorage.setItem('hwTasks:v2', JSON.stringify([
      { id: 'hw-1', courseId: 'c-bio', title: 'Biology notes review', dueDate: '2026-05-22', done: false, notes: 'Review your biology notes and make flashcards.', createdAt: '2026-05-19T12:00:00.000Z', updatedAt: '2026-05-19T12:00:00.000Z' }
    ]));
    localStorage.setItem('hwSchemaVersion', '3');
  });
}

async function seedWorkspace(page, { includeQuokka = false } = {}) {
  await addHomeworkSeed(page);
  await openApp(page);
  await applyWorkspace(page, { includeQuokka });
}

// Rebuilds and imports the seeded workspace through the canonical
// deserialize path. Used for seeding and for freshness mutations.
async function applyWorkspace(page, { includeQuokka = false } = {}) {
  await page.evaluate((includeQuokka) => {
    const iso = '2026-05-19T12:00:00.000Z';
    const base = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const pages = [
      { id: 'gs-page-hub', title: 'Biology 101 Hub', content: '<p>Central hub for all course notes, labs, and resources.</p>', createdAt: iso, updatedAt: iso },
      { id: 'gs-page-cell', title: 'Cell Structure', content: '<p>Biology is the study of life. Key parts of the cell include the nucleus, membrane, and mitochondria. Photosynthesis happens in chloroplasts.</p>', createdAt: iso, updatedAt: iso },
      { id: 'gs-page-locked', title: 'Private journal', content: '<p>NEVER-SNIPPET secret contents live here.</p>', isLocked: true, lockHash: 'seeded-lock', createdAt: iso, updatedAt: iso },
      { id: 'gs-page-unrelated', title: 'Travel plans', content: '<p>Totally unrelated packing lists.</p>', createdAt: iso, updatedAt: iso }
    ];
    if (includeQuokka) {
      pages.push({ id: 'gs-page-quokka', title: 'Quokka migration patterns', content: '<p>Quokka migration notes for ecology.</p>', createdAt: iso, updatedAt: iso });
    }
    const tasks = [
      { id: 'gs-task-1', title: 'Biology flashcards', notes: 'Make cards for unit 1', dueDate: '2026-05-21', completed: false, priority: 'high', createdAt: iso, updatedAt: iso },
      { id: 'gs-task-2', title: 'Water the plants', notes: '', dueDate: '', completed: false, priority: 'low', createdAt: iso, updatedAt: iso }
    ];
    const timeBlocks = [
      { id: 'gs-block-1', name: 'Biology notes study session', date: '2026-05-21', start: '16:00', end: '17:00', category: 'study', createdAt: 1, updatedAt: 1 }
    ];
    window.deserializeWorkspace({
      ...base,
      version: 4,
      pages,
      tasks,
      taskOrder: tasks.map(t => t.id),
      timeBlocks,
      courseWorkspace: {
        schemaVersion: 1,
        courses: [{ id: 'c-bio', name: 'Biology 101', createdAt: iso, updatedAt: iso }],
        files: [{ id: 'gs-file-1', courseId: 'c-bio', name: 'Biology Notes Summary.pdf', originalName: 'Biology Notes Summary.pdf', kind: 'pdf', mimeType: 'application/pdf', sizeBytes: 1468006, storageType: 'indexeddb', blobKey: '', description: 'Overview of key concepts from biology notes.', createdAt: iso, updatedAt: iso }],
        resourceLinks: [],
        relationships: [],
        settings: {}
      }
    });
  }, includeQuokka);
}

async function openSearch(page) {
  await page.evaluate(() => {
    window.SutraGlobalSearchModal.open('');
  });
  await expect(page.locator('#globalSearchPanel.active')).toBeVisible();
}

async function searchFor(page, query) {
  await openSearch(page);
  await page.locator('#globalSearchInput').fill(query);
  await page.waitForFunction((q) => {
    const input = document.getElementById('globalSearchInput');
    const box = document.getElementById('globalSearchResults');
    return input && input.value === q && box && (box.querySelector('.global-search-item') || box.querySelector('.global-search-empty'));
  }, query, { timeout: 5000 });
}

async function resultLabels(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#globalSearchResults .global-search-item .global-search-item-typelabel')).map(n => n.textContent.trim()));
}

test('Ctrl+K opens the search modal with focus, Esc closes and restores focus', async ({ page }) => {
  await seedWorkspace(page);

  await page.locator('#sidebarSearchLauncher').waitFor({ state: 'visible' });
  await page.locator('#sidebarSearchLauncher').focus();
  await page.keyboard.press('Control+k');

  const panel = page.locator('#globalSearchPanel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#globalSearchInput')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#sidebarSearchLauncher')).toBeFocused();
});

test('sidebar Search launcher opens the modal', async ({ page }) => {
  await seedWorkspace(page);
  await page.locator('#sidebarSearchLauncher').click();
  await expect(page.locator('#globalSearchPanel.active')).toBeVisible();
  await expect(page.locator('#globalSearchInput')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#globalSearchPanel')).toBeHidden();
});

test('one query returns results across pages, homework, tasks, timeline, and attachments with highlights', async ({ page }) => {
  await seedWorkspace(page);
  await searchFor(page, 'biology');

  const types = await resultLabels(page);
  expect(types).toContain('Page');
  expect(types).toContain('Note');
  expect(types).toContain('Homework');
  expect(types).toContain('Task');
  expect(types).toContain('Timeline event');
  expect(types).toContain('Attachment');

  const count = await page.locator('#globalSearchCount').textContent();
  expect(count).toMatch(/\d+ results?/);

  const marks = await page.evaluate(() => Array.from(document.querySelectorAll('#globalSearchResults mark')).map(n => n.textContent.toLowerCase()));
  expect(marks.some(text => text.includes('biolog'))).toBeTruthy();
});

test('locked pages appear by title only and never leak contents', async ({ page }) => {
  await seedWorkspace(page);
  await searchFor(page, 'private journal');

  const bodyText = await page.locator('#globalSearchResults').innerText();
  expect(bodyText).toContain('Private journal');
  expect(bodyText).not.toContain('NEVER-SNIPPET');
  expect(bodyText).not.toContain('secret contents');
  expect(bodyText).toContain('Locked');
});

test('filter chips narrow results to the selected entity type', async ({ page }) => {
  await seedWorkspace(page);
  await searchFor(page, 'biology');

  await page.locator('[data-gs-filter="homework"]').click();
  await page.waitForFunction(() => {
    const box = document.getElementById('globalSearchResults');
    return box && box.querySelector('[data-gs-type="homework"]') && !box.querySelector('[data-gs-type="page"]');
  });
  let labels = await resultLabels(page);
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every(l => l === 'Homework')).toBeTruthy();

  await page.locator('[data-gs-filter="pages"]').click();
  await page.waitForFunction(() => {
    const box = document.getElementById('globalSearchResults');
    const first = box && box.querySelector('[data-gs-type]');
    return first && first.getAttribute('data-gs-type') === 'page';
  });
  labels = await resultLabels(page);
  expect(labels.every(l => l === 'Page')).toBeTruthy();

  await page.locator('[data-gs-filter="all"]').click();
  await page.locator('#globalSearchInput').fill('zzzznothing');
  await expect(page.locator('#globalSearchResults .global-search-empty')).toBeVisible();
});

test('keyboard navigation moves the selection and Enter opens the page', async ({ page }) => {
  await seedWorkspace(page);
  await searchFor(page, 'biology');

  const firstActive = await page.evaluate(() => document.getElementById('globalSearchInput').getAttribute('aria-activedescendant'));
  expect(firstActive).toBe('globalSearchResult-0');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction((prev) => document.getElementById('globalSearchInput').getAttribute('aria-activedescendant') !== prev, firstActive);
  await page.keyboard.press('Escape');
  await expect(page.locator('#globalSearchPanel')).toBeHidden();

  // Single-result search: Enter opens the selected (first) result.
  await searchFor(page, 'photosynthesis');
  await page.keyboard.press('Enter');
  await expect(page.locator('#globalSearchPanel')).toBeHidden();
  await expect(page.locator('#pageTitle')).toHaveValue(/Cell Structure/i);
});

test('clicking a result opens the underlying item', async ({ page }) => {
  await seedWorkspace(page);
  await searchFor(page, 'photosynthesis');

  await page.locator('#globalSearchResults .global-search-item').first().click();
  await expect(page.locator('#globalSearchPanel')).toBeHidden();
  await expect(page.locator('#pageTitle')).toHaveValue(/Cell Structure/i);
});

test('timeline result navigates to the block date', async ({ page }) => {
  await seedWorkspace(page);
  await searchFor(page, 'study session');

  await page.locator('#globalSearchResults [data-gs-type="timeline"]').first().click();
  await expect(page.locator('#globalSearchPanel')).toBeHidden();
  const timelineState = await page.evaluate(() => document.getElementById('view-timeline') && document.getElementById('view-timeline').classList.contains('active'));
  expect(timelineState).toBeTruthy();
});

test('recent searches appear on the next open, re-run on click, and Clear empties them', async ({ page }) => {
  await seedWorkspace(page);
  await searchFor(page, 'photosynthesis');
  await page.locator('#globalSearchResults .global-search-item').first().click();
  await expect(page.locator('#globalSearchPanel')).toBeHidden();

  await openSearch(page);
  const recents = page.locator('#globalSearchResults [data-gs-recent]');
  await expect(recents.first()).toBeVisible();
  await expect(recents.first()).toContainText('photosynthesis');

  await recents.first().click();
  await expect(page.locator('#globalSearchResults .global-search-item').first()).toBeVisible();

  await page.evaluate(() => window.SutraGlobalSearchModal.open(''));
  await page.locator('[data-gs-clear-recents]').click();
  await expect(page.locator('#globalSearchResults [data-gs-recent]')).toHaveCount(0);
});

test('new and deleted workspace items are reflected immediately', async ({ page }) => {
  await seedWorkspace(page);

  await searchFor(page, 'quokka migration');
  await expect(page.locator('#globalSearchResults .global-search-empty')).toBeVisible();

  // Add through the canonical workspace path, then search again.
  await applyWorkspace(page, { includeQuokka: true });
  await searchFor(page, 'quokka migration');
  await expect(page.locator('#globalSearchResults')).toContainText('Quokka migration patterns');

  // Remove it again through the same canonical path.
  await applyWorkspace(page, { includeQuokka: false });
  await searchFor(page, 'quokka migration');
  await expect(page.locator('#globalSearchResults .global-search-empty')).toBeVisible();
});

test('no unexpected page errors during search interactions', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await seedWorkspace(page);
  await searchFor(page, 'biology');
  await page.locator('[data-gs-filter="attachments"]').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
