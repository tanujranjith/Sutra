import { expect, test } from '@playwright/test';

// Custom Tabs + Today-center coverage the other specs don't touch:
//   1. Custom Tabs lifecycle: bridge -> nav button -> section render.
//   2. Injection hardening: HTML in tab names / checklist items / sticky text
//      must render as literal text (createElement/textContent contract).
//   3. normalizeCustomTabsSafe corruption limits: bad ids, duplicates,
//      tab/widget caps, non-serializable config.
//   4. Calculator widget's safe evaluator: precedence, unary minus, div by 0.
//   5. Checklist + scratchpad state actually persists through the bridge.
//   6. Deleting the active tab falls back to Today.
//   7. Radar layout determinism + zone caps via maxPerZone.

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
  await page.waitForFunction(() =>
    !!window.SutraCustomTabsBridge && !!window.SutraCustomTabs && !!window.SutraTodayCenter);
}

test('custom tabs: lifecycle, injection hardening, widget rendering', async ({ page }) => {
  await openApp(page);

  // Kept under the 40-char tab-name cap so the whole string survives
  // normalization and we can assert it rendered as literal text.
  const XSS_NAME = '<img src=x onerror=__xssTab=1>Inj';
  const XSS_ITEM = '<script>window.__xssItem=1</script><b>not bold</b>';

  await page.evaluate(({ XSS_NAME, XSS_ITEM }) => {
    window.SutraCustomTabsBridge.setTabs([{
      id: 'qa-tab-1',
      name: XSS_NAME,
      icon: 'fa-star',
      widgets: [
        { id: 'w-check', type: 'checklist', config: { items: [{ id: 'i1', text: XSS_ITEM, done: false }] } },
        { id: 'w-calc', type: 'calculator', config: null },
        { id: 'w-sticky', type: 'sticky', config: { text: '<i>sticky html</i>', color: '#ffd97d' } },
        { id: 'w-future', type: 'from_the_future', config: { anything: true } }
      ]
    }]);
    window.SutraCustomTabs.refresh();
  }, { XSS_NAME, XSS_ITEM });

  // Nav button exists and the name rendered as literal text, not markup.
  const navBtn = page.locator('.view-tab[data-view="custom-qa-tab-1"]').first();
  await expect(navBtn).toBeAttached();
  await expect(navBtn).toContainText('<img src=x onerror=__xssTab=1>Inj');
  expect(await navBtn.locator('img').count()).toBe(0);

  // Activate the tab via the real click path (document-level delegation).
  await navBtn.click();
  const section = page.locator('#view-custom-qa-tab-1');
  await expect(section).toBeVisible();
  await expect(section.locator('.ctab-title')).toContainText('<img src=x onerror=__xssTab=1>Inj');
  expect(await section.locator('img, script').count()).toBe(0);

  // Checklist item text is literal — no <b>/<script> elements were created.
  const checkRow = section.locator('.ctab-checklist .ctab-list-title').first();
  await expect(checkRow).toHaveText(XSS_ITEM);
  expect(await section.locator('.ctab-checklist b').count()).toBe(0);

  // Sticky note textarea holds the raw string (textarea.value, not HTML).
  await expect(section.locator('.ctab-sticky-text')).toHaveValue('<i>sticky html</i>');

  // Neither injection executed.
  const flags = await page.evaluate(() => [window.__xssTab, window.__xssItem]);
  expect(flags).toEqual([undefined, undefined]);

  // Unknown widget type: kept, explained, not crashed.
  await expect(section.locator('.ctab-widget', { hasText: 'from_the_future' })
    .locator('.ctab-empty-msg')).toContainText("isn’t available in this version");

  // Calculator: 3 + 4 * 2 = 11 (precedence, not left-to-right).
  const calc = section.locator('.ctab-widget', { hasText: 'Calculator' });
  const pressKeys = async (keys) => {
    for (const k of keys) {
      await calc.locator('.ctab-calc-key').filter({ hasText: k }).first().click();
    }
  };
  await pressKeys(['3', '+', '4', '×', '2', '=']);
  await expect(calc.locator('.ctab-calc-display')).toHaveText('11');
  // 5 ÷ 0 → Error, and C recovers.
  await calc.locator('.ctab-calc-key.is-clear').click();
  await pressKeys(['5', '÷', '0', '=']);
  await expect(calc.locator('.ctab-calc-display')).toHaveText('Error');
  // Unary minus: -5 = -5.
  await calc.locator('.ctab-calc-key.is-clear').click();
  await pressKeys(['-', '5', '=']);
  await expect(calc.locator('.ctab-calc-display')).toHaveText('-5');
});

test('custom tabs: checklist + scratchpad edits persist through the bridge', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    window.SutraCustomTabsBridge.setTabs([{
      id: 'qa-tab-2',
      name: 'Persist QA',
      icon: 'fa-fire',
      widgets: [
        { id: 'w-check', type: 'checklist', config: { items: [] } },
        { id: 'w-pad', type: 'scratchpad', config: { text: '' } }
      ]
    }]);
    window.SutraCustomTabs.refresh();
  });
  await page.locator('.view-tab[data-view="custom-qa-tab-2"]').first().click();
  const section = page.locator('#view-custom-qa-tab-2');
  await expect(section).toBeVisible();

  // Add a checklist item through the UI, then check it off.
  const checkWidget = section.locator('.ctab-widget', { hasText: 'Checklist' });
  await checkWidget.locator('.ctab-add-input').fill('Buy calculator batteries');
  await checkWidget.locator('.ctab-add-btn').click();
  await expect(checkWidget.locator('.ctab-list-title', { hasText: 'Buy calculator batteries' })).toBeVisible();
  await checkWidget.locator('input[type="checkbox"]').first().check();

  // Type into the scratchpad; its save is debounced 600ms.
  await section.locator('.ctab-scratchpad').fill('scratch persists');
  await page.waitForTimeout(900);

  const saved = await page.evaluate(() => {
    const tab = window.SutraCustomTabsBridge.getTabs().find(t => t.id === 'qa-tab-2');
    const check = tab.widgets.find(w => w.id === 'w-check');
    const pad = tab.widgets.find(w => w.id === 'w-pad');
    return {
      items: check.config.items.map(i => ({ text: i.text, done: i.done })),
      padText: pad.config.text
    };
  });
  expect(saved.items).toEqual([{ text: 'Buy calculator batteries', done: true }]);
  expect(saved.padText).toBe('scratch persists');
});

test('custom tabs: normalizer enforces ids, caps, and serializability', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const tabs = [];
    for (let i = 0; i < 15; i++) {
      tabs.push({ id: `qa-cap-${i}`, name: `Tab ${i}`, icon: '', widgets: [] });
    }
    tabs.push({ id: 'bad id!*', name: 'Bad', widgets: [] });            // invalid id chars
    tabs.push({ id: 'qa-cap-0', name: 'Dupe', widgets: [] });           // duplicate id
    tabs.push(null);                                                     // junk entry
    // Overstuffed widgets + broken widget entries on the first tab.
    const widgets = [];
    for (let i = 0; i < 20; i++) widgets.push({ id: `w${i}`, type: 'clock', config: null });
    widgets.push({ id: 'w0', type: 'clock' });                           // dupe widget id
    widgets.push({ id: 'nofype', type: '' });                            // missing type
    const cyclic = {}; cyclic.self = cyclic;
    widgets.push({ id: 'wcyc', type: 'sticky', config: cyclic });        // unserializable
    tabs[0].widgets = widgets;
    tabs[0].name = 'x'.repeat(500);                                      // over-long name
    window.SutraCustomTabsBridge.setTabs(tabs);
    const out = window.SutraCustomTabsBridge.getTabs();
    return {
      tabCount: out.length,
      ids: out.map(t => t.id),
      firstWidgetCount: out[0].widgets.length,
      nameLen: out[0].name.length,
      cyclicConfig: out[0].widgets.find(w => w.id === 'wcyc') || null
    };
  });
  expect(result.tabCount).toBe(12);                       // MAX_TABS cap
  expect(result.ids).not.toContain('bad id!*');
  expect(new Set(result.ids).size).toBe(result.ids.length);
  expect(result.firstWidgetCount).toBeLessThanOrEqual(16); // MAX_WIDGETS cap
  expect(result.nameLen).toBeLessThanOrEqual(40);
  if (result.cyclicConfig) expect(result.cyclicConfig.config).toBeNull();
});

test('custom tabs: deleting the active tab falls back to Today', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    window.SutraCustomTabsBridge.setTabs([{ id: 'qa-tab-3', name: 'Ephemeral', icon: '', widgets: [] }]);
    window.SutraCustomTabs.refresh();
  });
  await page.locator('.view-tab[data-view="custom-qa-tab-3"]').first().click();
  await expect(page.locator('#view-custom-qa-tab-3')).toBeVisible();

  // Simulate a wholesale replacement that removes the active tab (this is the
  // import/restore path the core signals with sutra:custom-tabs-changed).
  await page.evaluate(() => {
    window.SutraCustomTabsBridge.setTabs([]);
    window.dispatchEvent(new CustomEvent('sutra:custom-tabs-changed'));
  });
  await expect(page.locator('body')).toHaveAttribute('data-view', 'today');
  await expect(page.locator('#view-custom-qa-tab-3')).toHaveCount(0);
  await expect(page.locator('.view-tab[data-view="custom-qa-tab-3"]')).toHaveCount(0);
});

test('today center: radar layout is deterministic and honors zone caps', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const T = window.SutraTodayCenter;
    const now = new Date(2026, 6, 6, 9, 0, 0);
    const items = [];
    for (let i = 0; i < 9; i++) {
      items.push({
        id: `r${i}`, source: 'task', sourceId: `r${i}`, title: `Radar ${i}`,
        due: new Date(2026, 6, 6, 12, 0, 0), priority: 'medium', status: 'open', overdue: false
      });
    }
    const capped = T.getUpcomingRadarItems(items, { now, maxPerZone: { today: 3, tomorrow: 4, thisWeek: 5, later: 4 } });
    const layoutA = T.computeRadarLayout(capped, { now });
    const layoutB = T.computeRadarLayout(capped, { now });
    const overflowChip = layoutA.find(c => !c.item);
    // Date-only (23:59) deadline shows no clock time on its chip meta.
    const allDay = T.computeRadarLayout(
      T.getUpcomingRadarItems([{
        id: 'ad', source: 'task', sourceId: 'ad', title: 'All day',
        due: new Date(2026, 6, 6, 23, 59), priority: 'medium', status: 'open', overdue: false
      }], { now }), { now });
    return {
      todayZone: capped.zones.find(z => z.key === 'today'),
      identical: JSON.stringify(layoutA) === JSON.stringify(layoutB),
      overflowLabel: overflowChip ? overflowChip.label : null,
      inBounds: layoutA.every(c => c.xPct >= 0 && c.xPct <= 100 && c.yPct >= 0 && c.yPct <= 100),
      allDayMeta: allDay.find(c => c.item && c.item.id === 'ad').meta
    };
  });
  expect(result.todayZone.items.length).toBe(3);
  expect(result.todayZone.overflow).toBe(6);
  expect(result.identical).toBe(true);
  expect(result.overflowLabel).toBe('+6 more');
  expect(result.inBounds).toBe(true);
  expect(result.allDayMeta).toBe('Today'); // no ", 11:59 PM" suffix
});
