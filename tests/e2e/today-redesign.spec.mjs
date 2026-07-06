import { expect, test } from '@playwright/test';

// Today view redesign coverage:
// 1. SutraTodayCenter pure helpers are deterministic (injected clock):
//    urgency labels, time-horizon grouping (overdue/today/tomorrow/thisWeek/
//    later/undated), next-priority selection, summary counts, agenda ordering.
// 2. The Upcoming Radar renders real workspace items, respects the category
//    filter, hides undated items unless explicitly filtered, caps zones with
//    a "+N more" overflow that opens the Deadline Radar modal, and opens the
//    correct source view on chip click.
// 3. The Next Up card + footer counts populate from live data and fall back
//    to friendly empty states.

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
  await expect(page.locator('#studentOnboardingOverlay')).toBeHidden();
}

async function openApp(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await completeOnboarding(page);
  await page.waitForFunction(() => !!window.SutraTodayCenter && !!window.flowAtelier);
}

const dateKey = (offset) => `
  (function () {
    const d = new Date();
    d.setDate(d.getDate() + (${offset}));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  })()
`;

test('pure helpers: urgency, grouping, prioritization, summary, agenda', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const T = window.SutraTodayCenter;
    // Fixed clock: Tuesday 2026-03-10 09:00 local.
    const now = new Date(2026, 2, 10, 9, 0, 0);
    const mk = (id, dayOffset, extra) => {
      let due = null;
      if (dayOffset !== null) {
        due = new Date(2026, 2, 10 + dayOffset, 12, 0, 0);
      }
      return Object.assign({ id, source: 'task', sourceId: id, title: id, due, priority: 'medium', status: 'open', overdue: !!(due && due < now) }, extra || {});
    };
    const items = [
      mk('overdue-2d', -2, { priority: 'high' }),
      mk('overdue-30d', -30, { priority: 'low' }),
      mk('due-today', 0, { priority: 'high' }),
      mk('due-tomorrow', 1),
      mk('due-in-4', 4),
      mk('due-in-6', 6),
      mk('due-in-7', 7),
      mk('due-in-30', 30),
      mk('undated', null),
      mk('done-today', 0, { status: 'done' })
    ];
    const groups = T.groupItemsByTimeHorizon(items, now);
    const summary = T.getTodaySummary(items, now);
    const next = T.getNextPriorityItem(items, { now });
    const nextEmpty = T.getNextPriorityItem([], { now });
    const undatedOnly = T.getNextPriorityItem([mk('undated-b', null)], { now });
    const agenda = T.getTodayAgenda({
      blocks: [
        { name: 'Late block', date: '2026-03-10', start: '14:00', end: '15:00', category: 'study' },
        { name: 'Early block', date: '2026-03-10', start: '08:00', end: '09:00', category: 'study' },
        { name: 'Other day', date: '2026-03-11', start: '08:00', end: '09:00', category: 'study' }
      ],
      items: [
        mk('timed-deadline', 0),                                   // 12:00 → appears
        { id: 'allday', source: 'task', title: 'allday', due: new Date(2026, 2, 10, 23, 59), priority: 'medium', status: 'open', overdue: false }
      ]
    }, now);
    const radarDefault = T.getUpcomingRadarItems(items, { now, filter: 'all' });
    const radarUndated = T.getUpcomingRadarItems(items, { now, filter: 'undated' });
    return {
      groupIds: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map(i => i.id)])),
      summary,
      nextId: next && next.item.id,
      nextStatus: next && next.status.label,
      nextEmpty,
      undatedOnlyWins: undatedOnly,
      urgencyLabels: {
        overdue2: T.getUrgencyStatus(items[0], now).label,
        today: T.getUrgencyStatus(items[2], now).label,
        tomorrow: T.getUrgencyStatus(items[3], now).label,
        undated: T.getUrgencyStatus(items[8], now).label
      },
      agendaTitles: agenda.map(a => a.title + '@' + a.timeLabel),
      radarZoneCounts: radarDefault.zones.map(z => [z.key, z.items.length, z.overflow]),
      radarHasUndatedByDefault: radarDefault.zones.some(z => z.items.some(i => i.id === 'undated')),
      radarUndatedIds: radarUndated.zones[0].items.map(i => i.id)
    };
  });

  expect(result.groupIds.overdue).toEqual(['overdue-30d', 'overdue-2d']);
  // Same due timestamp → stable (due, id) tie-break sorts by id.
  expect(result.groupIds.today).toEqual(['done-today', 'due-today']);
  expect(result.groupIds.tomorrow).toEqual(['due-tomorrow']);
  expect(result.groupIds.thisWeek).toEqual(['due-in-4', 'due-in-6']);
  expect(result.groupIds.later).toEqual(['due-in-7', 'due-in-30']);
  expect(result.groupIds.undated).toEqual(['undated']);

  expect(result.summary).toMatchObject({ overdue: 2, dueToday: 2, dueTomorrow: 1, dueThisWeek: 2, later: 2, undated: 1, total: 10 });

  // Deterministic prioritization: deeper overdue outranks newer overdue and
  // everything due later; undated/completed items never win; empty → null.
  expect(result.nextId).toBe('overdue-30d');
  expect(result.nextStatus).toBe('Overdue by 30 days');
  expect(result.nextEmpty).toBeNull();
  expect(result.undatedOnlyWins).toBeNull();

  expect(result.urgencyLabels.overdue2).toBe('Overdue by 2 days');
  expect(result.urgencyLabels.today).toBe('Due today');
  expect(result.urgencyLabels.tomorrow).toBe('Due tomorrow');
  expect(result.urgencyLabels.undated).toBe('No due date');

  // Agenda: chronological, today only, all-day (23:59) deadlines excluded.
  expect(result.agendaTitles).toEqual(['Early block@8:00 AM', 'timed-deadline@12:00 PM', 'Late block@2:00 PM']);

  // Radar zones: overdue merges into the Today band; done items excluded;
  // undated hidden by default but exposed via the explicit filter.
  expect(result.radarZoneCounts).toEqual([['today', 3, 0], ['tomorrow', 1, 0], ['thisWeek', 2, 0], ['later', 2, 0]]);
  expect(result.radarHasUndatedByDefault).toBe(false);
  expect(result.radarUndatedIds).toEqual(['undated']);
});

test('radar renders live data, filters, overflow, and opens the right source', async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    const fa = window.flowAtelier;
    const dk = (off) => {
      const d = new Date();
      d.setDate(d.getDate() + off);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    fa.tasks.splice(0, fa.tasks.length);
    fa.timeBlocks.splice(0, fa.timeBlocks.length);
    fa.tasks.push(
      { id: 'qa-today', title: 'QA due today task', dueDate: dk(0), priority: 'high', completed: false, isActive: true, scheduleType: 'once' },
      { id: 'qa-undated', title: 'QA undated task', dueDate: '', priority: 'low', completed: false, isActive: true, scheduleType: 'once' }
    );
    fa.apStudyWorkspace.subjects.push({ id: 'qa-ap', name: 'QA Radar Subject', examDate: dk(2), examTime: '08:00', confidence: 40 });
    fa.renderTaskViews();
  });

  const mount = page.locator('#upcomingRadarMount');
  await expect(mount.locator('.radar-chip', { hasText: 'QA due today task' })).toBeVisible();
  const apChip = mount.locator('.radar-chip', { hasText: 'AP Exam: QA Radar Subject' });
  await expect(apChip).toBeVisible();

  // Undated items stay off the radar unless explicitly filtered in.
  await expect(mount.locator('.radar-chip', { hasText: 'QA undated task' })).toHaveCount(0);
  await page.selectOption('#upcomingRadarFilter', 'undated');
  await expect(mount.locator('.radar-list-item', { hasText: 'QA undated task' })).toBeVisible();
  await expect(mount.locator('.radar-list-item', { hasText: 'QA due today task' })).toHaveCount(0);
  await page.selectOption('#upcomingRadarFilter', 'all');

  // Chip click opens the underlying source (AP exam → Testing Hub view).
  await apChip.click();
  await expect(page.locator('#view-apstudy')).toHaveClass(/active/);
  await page.evaluate(() => window.flowAtelier.setActiveView('today'));

  // Zone overflow: more due-today items than the cap → "+N more" chip that
  // opens the full Deadline Radar list modal.
  await page.evaluate(() => {
    const fa = window.flowAtelier;
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    for (let i = 0; i < 8; i++) {
      fa.tasks.push({ id: `qa-bulk-${i}`, title: `QA bulk task ${i}`, dueDate: key, priority: 'medium', completed: false, isActive: true, scheduleType: 'once' });
    }
    fa.renderTaskViews();
  });
  const overflowChip = mount.locator('.radar-chip-overflow').first();
  await expect(overflowChip).toBeVisible();
  await overflowChip.click();
  await expect(page.locator('#deadlineRadarModal')).toHaveClass(/active/);
});

test('Next Up card, footer counts, and empty states use live data', async ({ page }) => {
  await openApp(page);

  // Empty workspace → clear empty states, zero counts, empty radar.
  await page.evaluate(() => {
    const fa = window.flowAtelier;
    fa.tasks.splice(0, fa.tasks.length);
    fa.timeBlocks.splice(0, fa.timeBlocks.length);
    fa.apStudyWorkspace.subjects.splice(0, fa.apStudyWorkspace.subjects.length);
    fa.renderTaskViews();
  });
  await expect(page.locator('#todayDailyBrief .tnu-title')).toHaveText(/Nothing due/);
  await expect(page.locator('#tccOverdueCount')).toHaveText('0');
  await expect(page.locator('#tccDueTodayCount')).toHaveText('0');
  await expect(page.locator('#tccDueWeekCount')).toHaveText('0');
  await expect(page.locator('#upcomingRadarMount .radar-empty')).toBeVisible();

  // Seed an overdue high-priority task → it becomes Next Up with an overdue
  // status pill, focus + open actions, and live footer counts.
  await page.evaluate(() => {
    const fa = window.flowAtelier;
    const dk = (off) => {
      const d = new Date();
      d.setDate(d.getDate() + off);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    fa.tasks.push(
      { id: 'qa-overdue', title: 'QA overdue essay', dueDate: dk(-3), priority: 'high', completed: false, isActive: true, scheduleType: 'once' },
      { id: 'qa-week', title: 'QA next week task', dueDate: dk(4), priority: 'medium', completed: false, isActive: true, scheduleType: 'once' }
    );
    fa.renderTaskViews();
  });
  const brief = page.locator('#todayDailyBrief');
  await expect(brief.locator('.tnu-title')).toHaveText('QA overdue essay');
  await expect(brief.locator('.tnu-status-pill')).toHaveText('Overdue by 3 days');
  await expect(brief.locator('[data-donow-focus]')).toBeVisible();
  await expect(brief.locator('[data-brief-open-source]')).toBeVisible();
  await expect(page.locator('#tccOverdueCount')).toHaveText('1');
  await expect(page.locator('#tccDueWeekCount')).toHaveText('1');

  // Footer overdue count opens the overdue recovery flow.
  await page.click('[data-nextup-count="overdue"]');
  await expect(page.locator('#overdueRecoveryModal')).toHaveClass(/active/);
});
