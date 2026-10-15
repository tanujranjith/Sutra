import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const semester = require('../../src/features/academic/semester-setup.js');

test('Semester Setup skips teacher metadata while retaining course headers and details', () => {
  const parsed = semester.parseSourceText([
    'Teacher: Mr. Smith',
    'Biology',
    'Chemistry Syllabus',
    'AP Biology — Mrs. Jones (Room 204)'
  ].join('\n'));

  const courses = parsed.items.filter((item) => item.kind === 'course');
  assert.deepEqual(courses.map((item) => item.title), [
    'Biology',
    'Chemistry Syllabus',
    'AP Biology'
  ]);

  const apBiology = courses.find((item) => item.title === 'AP Biology');
  assert.equal(apBiology.teacher, 'Jones');
  assert.equal(apBiology.room, '204');
});
