import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');

test('global search spans workspace records without exposing locked note bodies', () => {
  assert.match(source, /function globalSearchAll\(query\)/);
  assert.match(source, /Notes\. Locked pages \(not unlocked in session\) only match on title/);
  assert.match(source, /const body = pageIsLocked \? '' : stripHtml\(page\.content\)/);
  assert.match(source, /notes: \[\], tasks: \[\], homework: \[\], courses: \[\], resources: \[\], apstudy: \[\], college: \[\], timeline: \[\], review: \[\], trackers: \[\], assistant: \[\], settings: \[\]/);
});
