import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const quote = require('../../src/features/workspace/daily-lock-in-quote.js');

test('midnight refresh delay is positive and reaches the next local day', () => {
  const moments = [
    new Date(2026, 0, 15, 0, 0, 0, 0),
    new Date(2026, 6, 15, 12, 30, 0, 0),
    new Date(2026, 11, 31, 23, 59, 59, 900)
  ];
  for (const now of moments) {
    const delay = quote.millisecondsUntilNextLocalMidnight(now);
    const wake = new Date(now.getTime() + delay);
    assert.ok(delay >= 1000 && delay <= 25 * 60 * 60 * 1000, `safe delay for ${now}`);
    assert.equal(wake.getHours(), 0);
    assert.equal(wake.getMinutes(), 0);
    assert.equal(wake.getSeconds(), 1);
    assert.notEqual(wake.getDate(), now.getDate());
  }
});

test('daily quote selection is deterministic for a local calendar day', () => {
  const bank = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const day = quote.getLocalDayNumber(new Date(2026, 6, 15, 23, 30));
  assert.deepEqual(quote.pickDailyQuote(bank, day), quote.pickDailyQuote(bank, day));
});

test('midnight calculation follows local DST rules east and west of UTC', () => {
  const modulePath = fileURLToPath(new URL('../../src/features/workspace/daily-lock-in-quote.js', import.meta.url));
  const program = `const q=require(${JSON.stringify(modulePath)});const d=new Date(2026,2,8,0,30);process.stdout.write(String(q.millisecondsUntilNextLocalMidnight(d)))`;
  const run = (tz) => Number(execFileSync(process.execPath, ['-e', program], {
    encoding: 'utf8',
    env: { ...process.env, TZ: tz }
  }));

  // Los Angeles loses one hour on this date; Kolkata has no DST transition.
  assert.equal(run('America/Los_Angeles'), 22.5 * 60 * 60 * 1000 + 1000);
  assert.equal(run('Asia/Kolkata'), 23.5 * 60 * 60 * 1000 + 1000);
});
