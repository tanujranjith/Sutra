import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
const shared = readFileSync(new URL('../../src/core/student-date-parser.js', import.meta.url), 'utf8');

function fixture(useShared) {
  const context = vm.createContext({ window: {} });
  if (useShared) vm.runInContext(shared, context);
  for (const name of ['quickCaptureLocalISO', 'parseQuickCaptureDate', 'parseHomeworkPasteText']) {
    const fn = extractFunction(app, name);
    assert.ok(fn, name);
    vm.runInContext(fn.body, context);
  }
  return {
    date: text => vm.runInContext(`parseQuickCaptureDate(${JSON.stringify(text)}, new Date(2026, 9, 15))`, context),
    paste: due => vm.runInContext(`parseHomeworkPasteText(${JSON.stringify('#sutra-import\nBiology | QA leaf study | ' + due + ' | https://example.com/assignment')})`, context),
    shared: (text, year = 2026, month = 9, day = 15) => vm.runInContext(`window.SutraStudentDateParser.parseNaturalDate(${JSON.stringify(text)}, {now: new Date(${year}, ${month}, ${day})})`, context)
  };
}

for (const useShared of [true, false]) {
  test(`capture and portal fallback reject impossible dates without changing imported content (shared=${useShared})`, () => {
    const f = fixture(useShared);
    for (const date of ['2026-02-31', '2026-04-31', '2026-00-10', '2026-13-10', '2/29/2026', '2/31/2026', '13/10/2026', 'February 31st 2026']) {
      assert.equal(f.date(date), null, date);
      const row = f.paste(date)[0];
      assert.equal(row.dueDate, '', date);
      assert.equal(row.title, 'QA leaf study');
      assert.equal(row.sourceUrl, 'https://example.com/assignment');
    }
    for (const [date, expected] of [['2028-02-29', '2028-02-29'], ['2/29/2028', '2028-02-29'], ['December 5, 2026', '2026-12-05']]) {
      assert.equal(f.date(date)?.date, expected, date);
      assert.equal(f.paste(date)[0].dueDate, expected, date);
    }
    assert.equal(f.paste('12-05-2026')[0].dueDate, '2026-12-05', 'legacy dashed portal format');
    assert.equal(f.date('tomorrow')?.date, '2026-10-16');
  });
}

test('shared parser does not reinterpret invalid explicit ordinals or roll a leap day into March', () => {
  const f = fixture(true);
  assert.equal(f.shared('February 31st'), null);
  assert.equal(f.shared('February 29', 2024, 9, 15), null, 'next inferred year is not a leap year');
  assert.equal(f.shared('the 3rd', 2026, 11, 15)?.date, '2027-01-03', 'ordinal may cross the year boundary');
});
