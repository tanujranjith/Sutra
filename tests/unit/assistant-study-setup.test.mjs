import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/features/assistant/flow-assistant.js', import.meta.url), 'utf8');
const declaration = name => extractFunction(source, name).body;
const questions = source.match(/const STUDY_SETUP_QUESTIONS = (\[[\s\S]*?\n    \]);/)[1];
const parse = new Function(`const STUDY_SETUP_QUESTIONS = ${questions}; ${declaration('parseStudyInterviewAnswer')}; return parseStudyInterviewAnswer;`)();
const validate = new Function(`${declaration('validateStudySetupPreferences')}; return validateStudySetupPreferences;`)();

test('every setup question accepts an ordinary single answer and preserves minutes', () => {
  const cases = [
    [0, '7:30 AM', { schoolStartHour: 7.5 }], [1, 'school finishes at 2:45 PM', { schoolEndHour: 14.75 }],
    [2, 'around 16:15', { earliestStudyHour: 16.25 }], [3, '9:40 PM', { latestStudyHour: 21 + 40 / 60 }],
    [4, '45 minutes', { studyBlockMinutes: 45 }], [4, 'half an hour', { studyBlockMinutes: 30 }],
    [5, 'about 10 minutes', { breakMinutes: 10 }], [5, 'no break', { breakMinutes: 0 }],
    [6, '10:30 PM', { bedtimeHour: 22.5 }], [6, '1:15 AM', { bedtimeHour: 25.25 }],
    [7, 'usually not on weekends', { scheduleWeekends: false }], [7, 'weekends are fine', { scheduleWeekends: true }],
    [8, 'I prefer practice questions', { preferredReviewStyle: 'test' }], [8, 'flash cards', { preferredReviewStyle: 'flashcards' }],
    [9, 'Physics, Chemistry', { hardestClasses: 'Physics, Chemistry' }], [9, 'none', { hardestClasses: '' }]
  ];
  for (const [step, answer, expected] of cases) assert.deepEqual(parse(step, answer), expected, answer);
  for (let step = 0; step < 10; step++) assert.deepEqual(parse(step, 'not sure'), {});
  assert.deepEqual(parse(0, '7:30'), { clarifyTime: '7:30' });
  assert.deepEqual(parse(3, '00:00'), { latestStudyHour: 24 });
  for (const answer of ['7:99 AM', '25:00', '-7 AM', '7.5 AM', '7:30 AM to 3 PM']) assert.equal(parse(0, answer), null, answer);
  for (const answer of ['-45 minutes', '45.5', '45, 10', '500 minutes']) assert.equal(parse(4, answer), null, answer);
  assert.equal(parse(7, 'sometimes'), null);
  assert.equal(parse(8, 'flashcards and matching'), null);
});

test('study drafts accept only canonical bounded fields and consistent time windows', () => {
  assert.equal(validate({ schoolStartHour: 7.5, schoolEndHour: 14.75, scheduleWeekends: false }), true);
  assert.equal(validate({ schoolStartHour: 7 + 31 / 60 }), true);
  for (const value of [{}, [], { theme: 'dark' }, { breakMinutes: 1.5 }, { schoolStartHour: 7.501 }, { schoolStartHour: 16, schoolEndHour: 8 }, { preferredReviewStyle: 'invented' }, { hardestClasses: 'x'.repeat(201) }]) assert.equal(validate(value), false);
});

test('interview is conversation-scoped, cancellable, and stages only supplied answers', () => {
  let chatId = 'first';
  const route = new Function('getCurrentChatIdSafe', 'buildActionFence', 'readStudyInterviewConversation', `let studyInterview = null; const STUDY_SETUP_QUESTIONS = ${questions}; ${declaration('formatStudySetupValue')}; ${declaration('parseStudyInterviewAnswer')}; ${declaration('isStudyInterviewStart')}; ${declaration('advanceStudyInterview')}; ${declaration('rebuildStudyInterview')}; ${declaration('routeStudyInterview')}; return routeStudyInterview;`)(
    () => chatId, actions => JSON.stringify(actions), () => null
  );
  assert.match(route('Get to know me').message, /usually start/);
  assert.match(route('7:30').message, /AM or PM/);
  assert.match(route('AM').message, /7:30 AM[\s\S]*usually finish/);
  assert.match(route('6 AM').message, /after the start/);
  assert.match(route('2:45 PM').message, /earliest time/);
  chatId = 'second'; assert.equal(route('9 AM to 4 PM'), null);
  chatId = 'first'; assert.match(route('cancel setup').message, /have not changed/);
  assert.equal(route('9 AM to 4 PM'), null);
  route('Get to know me');
  route('7:30 AM');
  route('2:45 PM');
  for (let i = 0; i < 7; i++) route('skip');
  const final = route('Physics');
  const actions = JSON.parse(final.message.slice(final.message.indexOf('[{')));
  assert.deepEqual(actions, [{ type: 'review_study_preferences', preferences: { schoolStartHour: 7.5, schoolEndHour: 14.75, hardestClasses: 'Physics' }, label: 'Review my study preferences in Settings' }]);
  assert.equal(route('extra answer'), null);
});

test('setup recovery replays the current chat without reapplying settings, crossing chats, or restarting completed setup', () => {
  const rebuild = new Function(`const STUDY_SETUP_QUESTIONS = ${questions}; ${declaration('parseStudyInterviewAnswer')}; ${declaration('isStudyInterviewStart')}; ${declaration('advanceStudyInterview')}; ${declaration('rebuildStudyInterview')}; return rebuildStudyInterview;`)();
  const user = content => ({ role: 'user', content });
  const transcript = [user('Get to know me'), { role: 'assistant', content: 'What time does school usually start?' }, user('7:30')];
  const clarification = rebuild(transcript, 'chat-a');
  assert.equal(clarification.pendingTime, '7:30');
  assert.equal(clarification.step, 0);
  transcript.push(user('AM'));
  assert.deepEqual(rebuild(transcript, 'chat-a'), { chatId: 'chat-a', step: 1, values: { schoolStartHour: 7.5 } });
  transcript.push(user('6 AM'), user('2:15 PM'));
  assert.deepEqual(rebuild(transcript, 'chat-a'), { chatId: 'chat-a', step: 2, values: { schoolStartHour: 7.5, schoolEndHour: 14.25 } });
  assert.equal(rebuild([], 'chat-b'), null);
  assert.equal(rebuild([...transcript, user('cancel setup')], 'chat-a'), null);
  for (let i = 0; i < 8; i++) transcript.push(user('skip'));
  assert.equal(rebuild(transcript, 'chat-a'), null);
  assert.equal(rebuild([...transcript, user('2:15 PM')], 'chat-a'), null);
  assert.equal(rebuild([{ role: 'assistant', content: 'Get to know me' }], 'chat-b'), null);
});

test('fresh routing restores a pending interview before processing the next answer', () => {
  const current = { id: 'restored-chat', messages: [{ role: 'user', content: 'Get to know me' }, { role: 'user', content: '7:30 AM' }] };
  const route = new Function('getCurrentChatIdSafe', 'buildActionFence', 'readStudyInterviewConversation', `let studyInterview = null; const STUDY_SETUP_QUESTIONS = ${questions}; ${declaration('formatStudySetupValue')}; ${declaration('parseStudyInterviewAnswer')}; ${declaration('isStudyInterviewStart')}; ${declaration('advanceStudyInterview')}; ${declaration('rebuildStudyInterview')}; ${declaration('routeStudyInterview')}; return routeStudyInterview;`)(
    () => 'stale-id', actions => JSON.stringify(actions), () => current
  );
  const reply = route('2:15 PM');
  assert.equal(reply.handled, true);
  assert.match(reply.message, /2:15 PM[\s\S]*earliest time/);
  assert.equal(current.messages.length, 2, 'recovery does not append or execute anything');
});

test('canonical hour normalization and Settings time controls round-trip exact minutes and overnight cutoffs', () => {
  const app = readFileSync(new URL('../../src/core/app.js', import.meta.url), 'utf8');
  const normalize = new Function(`${extractFunction(app, 'clampSettingNumber').body}; ${extractFunction(app, 'normalizeStudentPreferenceHour').body}; return normalizeStudentPreferenceHour;`)();
  assert.equal(normalize(7.5, 8, 0, 1439 / 60), 7.5);
  assert.equal(normalize(7 + 31 / 60, 8, 0, 1439 / 60), 7 + 31 / 60);
  assert.equal(normalize(25.25, 22, 18, 26), 25.25);
  const controls = new Function('isSegmentedPreferenceControl', `${extractFunction(app, 'readPreferenceControlValue').body}; ${extractFunction(app, 'writePreferenceControlValue').body}; return { read: readPreferenceControlValue, write: writePreferenceControlValue };`)(() => false);
  for (const [key, hour, clock] of [['schoolStartHour', 7.5, '07:30'], ['latestStudyHour', 24, '00:00'], ['bedtimeHour', 25.25, '01:15']]) {
    const control = { type: 'time', value: '', validity: { valid: true }, hasAttribute: name => name === 'data-pref-hour-time', getAttribute: () => 'studentPreferences.' + key };
    controls.write(control, hour); assert.equal(control.value, clock); assert.equal(controls.read(control), hour);
  }
});
