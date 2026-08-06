import { expect, test } from '@playwright/test';

async function openTimeline(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  try {
    await page.waitForFunction(() => !!window.flowAtelier && typeof window.flowAtelier.setActiveView === 'function', null, { timeout: 15_000 });
  } catch (error) {
    throw new Error(`Sutra bridge did not initialize: ${pageErrors.join(' | ') || error.message}`);
  }
  await page.evaluate(() => {
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) { overlay.hidden = true; overlay.classList.remove('active'); overlay.style.display = 'none'; }
    window.flowAtelier.setActiveView('timeline');
    const d = new Date();
    const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const rows = window.flowAtelier.timeBlocks;
    rows.splice(0, rows.length,
      { id: 'cal-a', name: 'Overlap A', date, start: '09:00', end: '10:00', category: 'study' },
      { id: 'cal-b', name: 'Overlap B', date, start: '09:30', end: '10:30', category: 'homework' },
      { id: 'cal-c', name: 'Overflow 1', date, start: '11:00', end: '11:30', category: 'study' },
      { id: 'cal-d', name: 'Overflow 2', date, start: '12:00', end: '12:30', category: 'study' },
      { id: 'cal-e', name: 'Overflow 3', date, start: '13:00', end: '13:30', category: 'study' },
      { id: 'cal-f', name: 'Overflow 4', date, start: '14:00', end: '14:30', category: 'study' }
    );
    window.flowAtelier.renderTimeline();
  });
  await page.waitForSelector('#timelineLegacyCalendar .sutra-calendar-time-view');
}

test('calendar renderer provides Month, Week, and Day grids without replacing Timeline data', async ({ page }) => {
  await openTimeline(page);
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  await expect(page.locator('.sutra-calendar-week .sutra-calendar-time-column')).toHaveCount(7);
  await expect(page.locator('.sutra-calendar-week .sutra-calendar-time-gutter')).toHaveCount(2);
  const overlap = page.locator('.sutra-calendar-week [data-block-id="cal-a"], .sutra-calendar-week [data-block-id="cal-b"]');
  await expect(overlap).toHaveCount(2);
  const positions = await overlap.evaluateAll(nodes => nodes.map(node => ({ left: node.getBoundingClientRect().left, width: node.getBoundingClientRect().width })));
  expect(positions[0].left).not.toBe(positions[1].left);
  expect(positions[0].width).toBeGreaterThan(20);

  await page.locator('[data-timeline-view-mode="month"]').click();
  await expect(page.locator('.sutra-calendar-month-grid')).toBeVisible();
  const days = page.locator('.sutra-calendar-day');
  expect([35, 42]).toContain(await days.count());
  expect(await page.locator('.sutra-calendar-day.is-outside').count()).toBeGreaterThan(0);
  await expect(page.locator('.sutra-calendar-more')).toBeVisible();
  await expect(page.locator('.sutra-calendar-month')).not.toContainText('No events');

  await page.locator('[data-timeline-view-mode="day"]').click();
  await expect(page.locator('.sutra-calendar-day .sutra-calendar-time-column')).toHaveCount(1);
  await expect(page.locator('.sutra-calendar-day [data-block-id="cal-a"]')).toBeVisible();
  await expect(page.locator('.sutra-calendar-day [data-block-id="cal-b"]')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('calendar date navigation is mode-aware and stays local-date safe', async ({ page }) => {
  await openTimeline(page);
  const before = await page.locator('#timelineDateInput').inputValue();
  await page.locator('#timelineStepNext').click();
  const afterWeek = await page.locator('#timelineDateInput').inputValue();
  expect((new Date(afterWeek + 'T00:00:00') - new Date(before + 'T00:00:00')) / 86400000).toBe(7);
  await page.locator('[data-timeline-view-mode="month"]').click();
  const beforeMonth = await page.locator('#timelineDateInput').inputValue();
  await page.locator('#timelineStepNext').click();
  const afterMonth = await page.locator('#timelineDateInput').inputValue();
  expect(new Date(afterMonth + 'T00:00:00').getMonth()).toBe((new Date(beforeMonth + 'T00:00:00').getMonth() + 1) % 12);
  await page.locator('#timelineTodayBtn').click();
  const today = await page.locator('#timelineDateInput').inputValue();
  const now = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
  expect(today).toBe(now);
});

test('phone Month uses count indicators and opens the focused Day view without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTimeline(page);
  await page.locator('[data-timeline-view-mode="month"]').click();

  const todayCell = page.locator('.sutra-calendar-day.is-today');
  await expect(todayCell.locator('.sutra-calendar-month-events')).toHaveAttribute('data-event-count', '6');
  await expect(todayCell.locator('.sutra-calendar-month-event').first()).toBeHidden();
  const indicator = await todayCell.locator('.sutra-calendar-month-events').evaluate((node) => getComputedStyle(node, '::before').content);
  expect(indicator).toContain('6');

  await todayCell.locator('.sutra-calendar-day-number').click();
  await expect(page.locator('.sutra-calendar-day.sutra-calendar-time-view')).toBeVisible();
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(2);
  expect(overflow.body).toBeLessThanOrEqual(2);
});

test('an open canvas cannot remain visible beneath Timeline after navigation', async ({ page }) => {
  await openTimeline(page);

  await page.evaluate(() => {
    const notes = document.getElementById('view-notes');
    const canvas = document.getElementById('canvasEditor');
    if (!notes || !canvas) throw new Error('Notes canvas surface is unavailable');
    window.flowAtelier.setActiveView('notes');
    canvas.hidden = false;
    document.body.classList.add('canvas-page-active');
    document.body.dataset.canvasBackground = 'grid';
    window.flowAtelier.setActiveView('timeline');
  });

  await expect(page.locator('#view-timeline')).toBeVisible();
  await expect(page.locator('#view-notes')).toBeHidden();
  await expect(page.locator('#view-notes')).toHaveCSS('display', 'none');
});
