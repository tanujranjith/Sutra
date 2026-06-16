#!/usr/bin/env node
// sutra-academic-engines-check.mjs — execute the deterministic academic
// engines (no DOM, no AI) and verify their math:
//   • school-schedule.js — A/B + cycle rotation, holidays, busy windows
//   • grade-planner.js   — weighted grades, missing work, target solving, GPA
//   • semester-setup.js  — local syllabus/calendar text extraction
//   • assignment-studio.js — studio normalization + progress
//
// These engines power user-facing academic decisions, so they are tested by
// EXECUTION, not by grep. Run: node scripts/sutra-academic-engines-check.mjs

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let failures = 0;
const ok = (cond, msg, detail) => {
  if (cond) console.log('  ok:', msg);
  else { failures++; console.error('  FAIL:', msg, detail === undefined ? '' : `(got ${JSON.stringify(detail)})`); }
};
const near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------
console.log('School Schedule — rotation engine');
const SS = require('../src/features/school-schedule.js');

const baseSchedule = {
  enabled: true,
  term: { name: 'Spring', startDate: '2026-01-01', endDate: '2026-06-15' },
  rotation: {
    type: 'ab', cycleLength: 2, labels: ['A', 'B'],
    anchorDate: '2026-01-05', anchorIndex: 0, // Monday Jan 5 2026 = A day
    skipWeekends: true, skipNoSchoolDays: true
  },
  schedules: [{
    id: 'reg', name: 'Regular',
    periods: [
      { id: 'p1', label: 'Period 1', start: '08:00', end: '08:50' },
      { id: 'p2', label: 'Period 2', start: '09:00', end: '09:50' }
    ]
  }],
  defaultScheduleId: 'reg',
  dayTemplates: { A: { scheduleId: 'reg', assignments: { p1: 'course-1' } } },
  overrides: [],
  subscriptions: [],
  settings: {}
};
let ws = SS.normalizeSchoolSchedule(baseSchedule);

ok(SS.resolveDayInfo(ws, '2026-01-05').labelKey === 'A', 'anchor Monday resolves to A day');
ok(SS.resolveDayInfo(ws, '2026-01-06').labelKey === 'B', 'next school day alternates to B');
ok(SS.resolveDayInfo(ws, '2026-01-07').labelKey === 'A', 'A/B keeps alternating');
ok(SS.resolveDayInfo(ws, '2026-01-10').isSchoolDay === false, 'Saturday is not a school day');
ok(SS.resolveDayInfo(ws, '2026-01-12').labelKey === 'B', 'weekend does not consume a cycle day (Mon=B)', SS.resolveDayInfo(ws, '2026-01-12').labelKey);
ok(SS.resolveDayInfo(ws, '2026-01-02').labelKey === 'B', 'rotation counts backwards before the anchor too');

// Holiday consumes no cycle day.
ws = SS.normalizeSchoolSchedule({ ...baseSchedule, overrides: [{ date: '2026-01-06', kind: 'holiday', label: 'Snow day' }] });
ok(SS.resolveDayInfo(ws, '2026-01-06').isSchoolDay === false, 'holiday override is not a school day');
ok(SS.resolveDayInfo(ws, '2026-01-06').reason === 'holiday', 'holiday reason surfaces');
ok(SS.resolveDayInfo(ws, '2026-01-07').labelKey === 'B', 'holiday does not consume a rotation day', SS.resolveDayInfo(ws, '2026-01-07').labelKey);

// Periods + busy windows + study windows.
const dayInfo = SS.resolveDayInfo(SS.normalizeSchoolSchedule(baseSchedule), '2026-01-05');
ok(dayInfo.periods.length === 2 && dayInfo.periods[0].courseId === 'course-1', 'A-day template maps Period 1 to its course');
const busy = SS.getBusyWindowsForDate(SS.normalizeSchoolSchedule(baseSchedule), '2026-01-05');
ok(busy.length === 2 && busy[0].start === 480 && busy[0].end === 530, 'class periods become busy minute-windows', busy);
const free = SS.getStudyWindowsForDate(SS.normalizeSchoolSchedule(baseSchedule), '2026-01-05', { dayStart: 420, dayEnd: 660 });
ok(free.length === 2 && free[0].end === 480 && free[1].start === 590, 'study windows avoid class periods', free);

// Special schedule override.
ws = SS.normalizeSchoolSchedule({
  ...baseSchedule,
  schedules: baseSchedule.schedules.concat([{ id: 'early', name: 'Early dismissal', periods: [{ id: 'e1', label: 'Period 1', start: '08:00', end: '08:30' }] }]),
  overrides: [{ date: '2026-01-07', kind: 'early_dismissal', scheduleId: 'early', label: 'Early out' }]
});
ok(SS.resolveDayInfo(ws, '2026-01-07').scheduleName === 'Early dismissal', 'special-day override swaps the bell schedule');

// Weekly mode.
ws = SS.normalizeSchoolSchedule({ ...baseSchedule, rotation: { ...baseSchedule.rotation, type: 'weekly' }, dayTemplates: { mon: { scheduleId: 'reg', assignments: {} } } });
ok(SS.resolveDayInfo(ws, '2026-01-05').labelKey === 'mon', 'weekly rotation keys by weekday');

// ---------------------------------------------------------------------------
console.log('\nGrade Planner — deterministic grade math');
const GP = require('../src/features/grade-planner.js');

const course = GP.normalizeCourseGrades({
  categories: [
    { id: 'tests', name: 'Tests', weight: 60 },
    { id: 'hw', name: 'Homework', weight: 40 }
  ],
  entries: [
    { id: 'e1', categoryId: 'tests', title: 'Test 1', score: 45, maxScore: 50, status: 'graded' },
    { id: 'e2', categoryId: 'hw', title: 'HW 1', score: 10, maxScore: 10, status: 'graded' }
  ]
});
let grade = GP.computeCourseGrade(course);
ok(near(grade.percent, 94), 'weighted grade: 60%×90 + 40%×100 = 94', grade.percent);
ok(grade.letter === 'A', 'letter derives from percent', grade.letter);

const withMissing = GP.normalizeCourseGrades({
  categories: course.categories,
  entries: course.entries.concat([{ id: 'e3', categoryId: 'tests', title: 'Test 2', score: 0, maxScore: 50, status: 'missing' }])
});
grade = GP.computeCourseGrade(withMissing);
ok(near(grade.percent, 67), 'missing work counts as zero (45/100 in tests → 67 overall)', grade.percent);
ok(grade.missingCount === 1, 'missing count surfaces');

const withExcused = GP.normalizeCourseGrades({
  categories: course.categories,
  entries: course.entries.concat([{ id: 'e4', categoryId: 'tests', title: 'Excused quiz', score: 0, maxScore: 50, status: 'excused' }])
});
ok(near(GP.computeCourseGrade(withExcused).percent, 94), 'excused work never counts');

const withDrops = GP.normalizeCourseGrades({
  categories: [{ id: 'q', name: 'Quizzes', weight: 100, drops: 1 }],
  entries: [
    { id: 'q1', categoryId: 'q', title: 'Q1', score: 5, maxScore: 10, status: 'graded' },
    { id: 'q2', categoryId: 'q', title: 'Q2', score: 10, maxScore: 10, status: 'graded' }
  ]
});
ok(near(GP.computeCourseGrade(withDrops).percent, 100), 'drop-lowest removes the worst score', GP.computeCourseGrade(withDrops).percent);

// Target solving in points mode: 80/100 now, target 85 with a 100-pt final → need 90.
const pointsCourse = GP.normalizeCourseGrades({
  categories: [],
  entries: [{ id: 'p1', categoryId: '', title: 'Work so far', score: 80, maxScore: 100, status: 'graded' }]
});
const solved = GP.scoreNeededForTarget(pointsCourse, { categoryId: '', maxScore: 100, targetPercent: 85 });
ok(solved.possible && near(solved.neededScore, 90, 0.2), 'final-score solver: need 90/100 to reach 85%', solved.neededScore);
ok(GP.scoreNeededForTarget(pointsCourse, { categoryId: '', maxScore: 100, targetPercent: 95 }).achievable === false, 'unreachable targets are reported honestly');

// Impact ranking: completing a missing item should rank above pending busywork.
const impact = GP.rankImpact(withMissing);
ok(impact.length === 1 && impact[0].title === 'Test 2' && impact[0].delta > 20, 'missing test ranked as biggest win', impact);

// GPA: AP 95% + regular 85% → unweighted 3.5, weighted 4.0.
const gpa = GP.computeGpa([
  { percent: 95, credits: 1, level: 'ap', includeInGpa: true },
  { percent: 85, credits: 1, level: 'regular', includeInGpa: true }
], GP.getDefaultGradePlanner().settings);
ok(near(gpa.unweighted, 3.5), 'unweighted GPA averages letter points', gpa.unweighted);
ok(near(gpa.weighted, 4.0), 'weighted GPA applies the AP boost', gpa.weighted);

// ---------------------------------------------------------------------------
console.log('\nSemester Setup — local extraction');
const SEM = require('../src/features/semester-setup.js');

const sample = [
  'AP Biology — Mr. Smith (Room 204)',
  'Grading Policy:',
  'Tests: 40%',
  'Homework: 25%',
  'Labs: 35%',
  'Class meets MWF 10:00 am - 10:50 am',
  'Lab report due 9/12/2026',
  'Midterm exam October 16, 2026',
  'No School — Thanksgiving Break 11/25/2026'
].join('\n');
const parsed = SEM.parseSourceText(sample, { id: 'src1' });
const kinds = parsed.items.reduce((m, i) => { m[i.kind] = (m[i.kind] || 0) + 1; return m; }, {});
ok(kinds.course === 1, 'detects the course header', kinds);
ok(parsed.items.find(i => i.kind === 'course' && /smith/i.test(i.teacher)), 'captures the teacher name');
ok(kinds.grading_category === 3, 'captures all grading weights', kinds);
ok(parsed.items.find(i => i.kind === 'grading_category' && i.title === 'Tests' && i.weight === 40), 'grading weight value parsed');
ok(kinds.assignment >= 1 && parsed.items.find(i => i.kind === 'assignment' && i.date === '2026-09-12'), 'assignment with slash date parsed', parsed.items.filter(i => i.kind === 'assignment'));
ok(parsed.items.find(i => i.kind === 'exam' && i.date === '2026-10-16'), 'exam with month-name date parsed');
ok(parsed.items.find(i => i.kind === 'no_school' && i.date === '2026-11-25'), 'no-school day parsed');
ok(parsed.items.find(i => i.kind === 'recurring_class' && i.days.join(',') === '1,3,5' && i.time === '10:00'), 'MWF meeting times parsed', parsed.items.filter(i => i.kind === 'recurring_class'));
ok(parsed.items.filter(i => i.kind === 'grading_category').every(i => i.courseName === 'AP Biology'), 'grading weights attach to the current course');

ok(SEM.parseDayTokens('TTh') .join(',') === '2,4', 'compact TTh day tokens', SEM.parseDayTokens('TTh'));
ok(SEM.parseTimeToken('2:30 pm') === '14:30', '12-hour time normalizes');

// Item normalization is idempotent under the workspace normalizer.
const wsState = SEM.normalizeSemesterSetup({ drafts: [{ id: 'd1', items: parsed.items, sources: [], status: 'in_review' }] });
ok(wsState.drafts.length === 1 && wsState.drafts[0].items.length === parsed.items.length, 'drafts normalize losslessly');

// ---------------------------------------------------------------------------
console.log('\nAssignment Studio — progress + normalization');
const AS = require('../src/features/assignment-studio.js');
const studio = AS.normalizeStudio({
  milestones: [{ title: 'Draft', done: true }, { title: 'Final', done: false }],
  subtasks: [{ title: 'Sources', done: false }, { title: 'Outline', done: true }],
  rubric: [{ criterion: 'Thesis', points: 10 }],
  effort: { estimateMinutes: 120, loggedMinutes: 25 }
});
ok(studio.milestones.length === 2 && studio.subtasks.length === 2, 'studio payload normalizes');
ok(AS.computeProgress(studio) === 50, 'progress weighs milestones double (3/6 = 50%)', AS.computeProgress(studio));
ok(AS.normalizeStudio({ milestones: [{ title: '' }] }).milestones.length === 0, 'empty milestones are dropped');
ok(AS.normalizeStudio(null) === null, 'null studio stays null (no phantom payloads)');

// ---------------------------------------------------------------------------
console.log('\nAcademic Command Center - deterministic action ranking');
const ACC = require('../src/features/academic-command-center.js');
const commandModel = ACC.buildModel({
  now: new Date(2026, 5, 14, 12, 0, 0),
  courses: [{ id: 'chem', name: 'Chemistry', currentGrade: '68%', targetGrade: '85%', schedule: [{ day: 'Mon', startTime: '09:00' }] }],
  homeworkTasks: [
    { id: 'late-lab', courseId: 'chem', title: 'Lab conclusion', dueDate: '2026-06-13', priority: 'high', difficulty: 'hard', done: false },
    { id: 'reading', courseId: 'chem', title: 'Chapter reading', dueDate: '2026-06-18', priority: 'medium', difficulty: 'easy', done: false }
  ],
  pages: [{ id: 'note-1', title: 'Acids and bases', classLinkId: 'chem', updatedAt: '2026-06-14T10:00:00Z' }],
  timeBlocks: [],
  gradePlanner: { courses: {} },
  apSubjects: [],
  reviewStats: { due: 12, overdue: 3 }
});
ok(commandModel.courses.length === 1 && commandModel.courses[0].risk === 'danger', 'course summary marks a large grade gap as at risk', commandModel.courses[0]);
ok(commandModel.topAction && commandModel.topAction.id === 'late-lab', 'overdue high-impact work ranks first', commandModel.topAction);
ok(commandModel.topAction.reason.includes('overdue') && commandModel.topAction.reason.includes('grade at risk'), 'recommendation explains its deterministic factors', commandModel.topAction.reason);
ok(commandModel.courses[0].recentNote && commandModel.courses[0].recentNote.id === 'note-1', 'recent linked note surfaces in the course summary');

// ---------------------------------------------------------------------------
if (failures) {
  console.error(`\nAcademic engines check FAILED (${failures} issue${failures === 1 ? '' : 's'}).`);
  process.exit(1);
}
console.log('\nAcademic engines check passed — rotation, grade math, extraction, and studio engines verified by execution.');
