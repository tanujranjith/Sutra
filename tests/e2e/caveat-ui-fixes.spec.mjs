import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

async function openApp(page) {
  await page.goto('/Sutra.html');
  await waitForAppReady(page);
  await page.evaluate(() => {
    window.markStudentOnboardingCompleted?.(true);
    document.body.classList.remove('onboarding-open');
    document.getElementById('sutraStartupIntro')?.remove();
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove('active');
      overlay.style.display = 'none';
    }
  });
}

async function openCollegePage(page, pageKey) {
  await enableFeaturePack(page, 'collegeapp');
  await page.evaluate(() => window.flowAtelier.setActiveView('collegeapp'));
  await page.locator(`#view-collegeapp [data-collegeapp-page="${pageKey}"]:visible`).click();
}

async function enableFeaturePack(page, view) {
  await page.evaluate(() => window.flowAtelier.setActiveView('settings'));
  await expect(page.locator('#view-settings')).toBeVisible();

  const mobileCategory = page.locator('#settingsCategorySelect');
  if (await mobileCategory.isVisible()) {
    await mobileCategory.selectOption('advanced');
  } else {
    const advancedGroup = page.locator('#settingsAdvancedGroup');
    if (!(await advancedGroup.evaluate((node) => node.open))) {
      await advancedGroup.locator('summary').click();
    }
    await page.locator('#view-settings [data-settings-nav="advanced"]').click();
  }

  const toggle = page.locator(`#featureToggleListSettings input[data-feature-view="${view}"]`);
  await expect(toggle).toBeVisible();
  if (!(await toggle.isChecked())) await toggle.check();
  await expect(toggle).toBeChecked();
  await page.evaluate(async () => {
    await window.flowAtelier.flushAppSaveNow('e2e-feature-pack-enable');
  });
}

test('Life Quick Calculator handles keyboard and keypad input, invalid expressions, and correction', async ({ page }) => {
  await openApp(page);
  await enableFeaturePack(page, 'life');
  await page.evaluate(() => window.flowAtelier.setActiveView('life'));
  const moreTools = page.locator('#view-life .life-dashboard-section--secondary');
  const disclosure = page.locator('#view-life details').filter({ hasText: 'More Life Tools' }).first();
  if (await disclosure.count()) {
    if (!(await disclosure.evaluate((node) => node.open))) await disclosure.locator('summary').click();
  } else {
    await expect(moreTools.getByRole('heading', { name: 'More Life Tools' })).toBeVisible();
  }
  await moreTools.locator('[data-life-page="calculator"]:visible').click();

  const calculator = page.locator('#lifePage-calculator');
  const result = page.locator('#lifeCalcResult');
  const expression = page.locator('#lifeCalcExpr');
  await expect(calculator).toBeVisible();

  await calculator.focus();
  await page.keyboard.type('-(2+3)');
  await page.keyboard.press('Enter');
  await expect(result).toHaveText('-5');

  const keypad = page.locator('#lifeCalcButtons');
  await keypad.locator('[data-calc="clear"]').click();
  for (const key of ['(', '2', '+', '3', ')', '=']) {
    await keypad.locator(`[data-calc="${key}"]`).click();
  }
  await expect(result).toHaveText('5');

  await keypad.locator('[data-calc="clear"]').click();
  await calculator.focus();
  await page.keyboard.type('2+*3');
  await page.keyboard.press('Enter');
  await expect(result).toHaveText('Error');
  await expect(expression).toHaveText('2+×3 =');

  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('4');
  await page.keyboard.press('Enter');
  await expect(result).toHaveText('6');
});

test('College decision score inputs keep Tab focus and both scores persist after reload', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const fitId = 'e2e-tab-fit';
    const costId = 'e2e-tab-cost';
    const matrix = window.flowAtelier.collegeAppWorkspace.decisionMatrix;
    matrix.criteria = [
      { id: fitId, name: 'Program fit', weight: 1 },
      { id: costId, name: 'Affordability', weight: 1 }
    ];
    matrix.colleges = [{
      id: 'e2e-tab-college',
      name: 'Keyboard State University',
      scores: { [fitId]: 0, [costId]: 0 }
    }];
    window.flowAtelier.persistAppData();
    await window.flowAtelier.flushAppSaveNow('e2e-decision-score-focus-seed');
  });
  await page.reload();
  await waitForAppReady(page);
  await openCollegePage(page, 'decision');

  const matrix = page.locator('#collegeappPage-decision');
  const fitScore = matrix.locator('[data-collegeapp-score-criterion="e2e-tab-fit"]');
  const costScore = matrix.locator('[data-collegeapp-score-criterion="e2e-tab-cost"]');
  await expect(fitScore).toBeVisible();
  await fitScore.fill('8');
  await fitScore.press('Tab');
  await expect(costScore).toBeFocused();
  await costScore.fill('6');
  await costScore.press('Tab');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-decision-score-focus-save'));

  await page.reload();
  await waitForAppReady(page);
  await openCollegePage(page, 'decision');
  await expect(page.locator('#collegeappPage-decision [data-collegeapp-score-criterion="e2e-tab-fit"]')).toHaveValue('8');
  await expect(page.locator('#collegeappPage-decision [data-collegeapp-score-criterion="e2e-tab-cost"]')).toHaveValue('6');
});

test('Application Sheets checkboxes have names tied to their Research and Checklist rows', async ({ page }) => {
  await openApp(page);
  await openCollegePage(page, 'sheets');

  const sheets = page.locator('#collegeappPage-sheets');
  await expect(sheets).toBeVisible();
  await sheets.locator('[data-college-tab="research"]').click();
  await page.locator('#collegeAddRowBtn').click();
  const researchName = sheets.locator('[data-college-sheet="research"][data-college-field="college"]').last();
  await researchName.fill('Research Test');
  await researchName.press('Tab');

  await sheets.locator('[data-college-tab="checklist"]').click();
  await page.locator('#collegeAddRowBtn').click();
  const checklistName = sheets.locator('[data-college-sheet="checklist"][data-college-field="college"]').last();
  await checklistName.fill('Checklist');
  await checklistName.press('Tab');
  await page.evaluate(() => window.flowAtelier.flushAppSaveNow('e2e-application-sheet-checkbox-save'));

  await page.reload();
  await waitForAppReady(page);
  await openCollegePage(page, 'sheets');
  await sheets.locator('[data-college-tab="research"]').click();
  await expect(page.getByRole('checkbox', { name: 'Test optional for Research Test', exact: true })).toBeVisible();

  await sheets.locator('[data-college-tab="checklist"]').click();
  await expect(page.getByRole('checkbox', { name: 'Application submitted for Checklist', exact: true })).toBeVisible();
});
