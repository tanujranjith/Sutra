import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/features/assistant/flow-assistant.js', import.meta.url), 'utf8');
const declaration = name => extractFunction(source, name).body;
const parse = new Function(`${declaration('parseStudyInterviewAnswer')}; return parseStudyInterviewAnswer;`)();
const validate = new Function(`${declaration('validateStudySetupPreferences')}; return validateStudySetupPreferences;`)();

test('study answers preserve AM/PM, midnight and zero-minute breaks without guessing ambiguous input', () => {
  assert.deepEqual(parse(0, '8 AM to 3 PM'), { schoolStartHour: 8, schoolEndHour: 15 });
  assert.deepEqual(parse(1, '16:00 to 00:00'), { earliestStudyHour: 16, latestStudyHour: 24 });
  assert.deepEqual(parse(2, '45, 0'), { studyBlockMinutes: 45, breakMinutes: 0 });
  assert.deepEqual(parse(3, '1 AM'), { bedtimeHour: 25 });
  assert.deepEqual(parse(4, 'no'), { scheduleWeekends: false });
  assert.deepEqual(parse(5, 'Test'), { preferredReviewStyle: 'test' });
  assert.deepEqual(parse(6, 'skip'), {});
  for (const answer of ['4 to 9 PM', '-1 to 15', '8:30 AM to 3 PM', '3 PM to 8 AM', '99 to 100']) assert.equal(parse(0, answer), null, answer);
  for (const answer of ['-45, 10', '45.5, 10', '45', '1, 10', '45, 61']) assert.equal(parse(2, answer), null, answer);
});

test('study drafts accept only canonical bounded fields and consistent time windows', () => {
  assert.equal(validate({ schoolStartHour: 8, schoolEndHour: 15, scheduleWeekends: false }), true);
  for (const value of [{}, [], { theme: 'dark' }, { breakMinutes: 1.5 }, { schoolStartHour: 16, schoolEndHour: 8 }, { preferredReviewStyle: 'invented' }, { hardestClasses: 'x'.repeat(201) }]) assert.equal(validate(value), false);
});

test('interview is conversation-scoped, cancellable, and stages only supplied answers', () => {
  const questions = source.match(/const STUDY_SETUP_QUESTIONS = (\[[\s\S]*?\n    \]);/)[1];
  let chatId = 'first';
  const route = new Function('getCurrentChatIdSafe', 'buildActionFence', `let studyInterview = null; const STUDY_SETUP_QUESTIONS = ${questions}; ${declaration('parseStudyInterviewAnswer')}; ${declaration('routeStudyInterview')}; return routeStudyInterview;`)(
    () => chatId, actions => JSON.stringify(actions)
  );
  assert.match(route('Get to know me').message, /one at a time/);
  assert.match(route('not a time').message, /couldn’t use/);
  chatId = 'second'; assert.equal(route('9 AM to 4 PM'), null);
  chatId = 'first'; assert.match(route('cancel setup').message, /have not changed/);
  assert.equal(route('9 AM to 4 PM'), null);
  route('Get to know me');
  route('9 AM to 4 PM');
  for (let i = 0; i < 5; i++) route('skip');
  const final = route('Physics');
  const actions = JSON.parse(final.message.slice(final.message.indexOf('[{')));
  assert.deepEqual(actions, [{ type: 'review_study_preferences', preferences: { schoolStartHour: 9, schoolEndHour: 16, hardestClasses: 'Physics' }, label: 'Review my study preferences in Settings' }]);
  assert.equal(route('extra answer'), null);
});
