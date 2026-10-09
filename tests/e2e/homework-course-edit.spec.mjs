import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.mjs';

async function openHomework(page) {
  await page.goto('/Sutra.html');
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await waitForAppReady(page);
  await page.evaluate(() => {
    try { window.markStudentOnboardingCompleted?.(true); } catch (_) {}
    const overlay = document.getElementById('studentOnboardingOverlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove('active');
      overlay.style.setProperty('display', 'none', 'important');
    }
    document.body.classList.remove('onboarding-open');
  });
  await page.waitForFunction(() => !!window.courseHub && !!window.SutraHomework && typeof window.setActiveView === 'function');
  await page.evaluate(() => {
    window.setActiveView('homework');
    const setup = document.getElementById('hwSetupOverlay');
    if (setup) {
      setup.hidden = true;
      setup.classList.remove('active');
      setup.style.setProperty('display', 'none', 'important');
    }
  });
}

async function seedLinkedCourses(page) {
  return page.evaluate(() => {
    const hub = window.courseHub;
    const chemistry = hub.createCourse({
      id: 'edit-class-course', name: 'Chemistry', type: 'class', subjectArea: 'Science',
      room: 'Room 101', location: 'North Lab', termName: 'Fall', schoolYear: '2026–27',
      description: 'Lab science course', syllabusSummary: 'Safety first',
      schedule: [{ id: 'chem-tuesday', day: 'Tue', startTime: '15:00', endTime: '16:00', location: 'Room 101', label: '' }],
      currentGrade: 'A-', targetGrade: 'A',
      gradingCategories: [{ id: 'chem-labs', name: 'Labs', weight: 40, currentPercent: 93, color: '#6fa7ff' }]
    });
    const otherClass = hub.createCourse({ id: 'edit-class-other', name: 'Physics', type: 'class' });
    const robotics = hub.createCourse({
      id: 'edit-activity-course', name: 'Robotics', type: 'activity', subjectArea: 'Engineering',
      location: 'Workshop', description: 'Build season',
      schedule: [{ id: 'robotics-thursday', day: 'Thu', startTime: '16:00', endTime: '18:00', location: 'Workshop', label: '' }]
    });
    const otherActivity = hub.createCourse({ id: 'edit-activity-other', name: 'Debate Club', type: 'activity' });
    const linkedChemistry = hub.getCourseById('edit-class-course');
    linkedChemistry.integrationMetadata = { providerReference: 'chem-verified', retained: true };
    hub.updateCourse(linkedChemistry.id, { location: linkedChemistry.location });
    const openClassTask = hub.createAssignmentForCourse(chemistry.id, {
      title: 'Chemistry open report', dueDate: '2099-08-03', dueTime: '15:00', difficulty: 'hard', priority: 'high'
    });
    const doneClassTask = hub.createAssignmentForCourse(chemistry.id, {
      title: 'Chemistry completed lab', dueDate: '2099-08-01', difficulty: 'medium', priority: 'medium'
    });
    window.SutraHomework.setDone(doneClassTask.id, true);
    const activityTask = hub.createAssignmentForCourse(robotics.id, {
      title: 'Robotics build checklist', dueDate: '2099-08-04', difficulty: 'easy', priority: 'medium'
    });
    const note = window.__sutraPublicBetaTestHooks.createNoteInActiveSpace('Chemistry lab notes', '<p>Linked note</p>');
    hub.linkNoteToCourse(chemistry.id, note.id);
    const resource = hub.addCourseResourceLink(chemistry.id, {
      name: 'Chemistry syllabus', url: 'https://example.test/chemistry-syllabus'
    });
    return {
      chemistryId: chemistry.id,
      otherClassId: otherClass.id,
      roboticsId: robotics.id,
      otherActivityId: otherActivity.id,
      openClassTaskId: openClassTask.id,
      doneClassTaskId: doneClassTask.id,
      activityTaskId: activityTask.id,
      noteId: note.id,
      resourceId: resource.id
    };
  });
}

async function saveCourseSettings(page) {
  await page.locator('#courseHubMount').getByRole('button', { name: 'Save changes' }).click();
}

async function assertEditDrawerAction(page, courseId, label) {
  await page.evaluate(id => window.openClassDashboardDrawer(id), courseId);
  const drawer = page.locator('#classDashboardDrawer');
  await expect(drawer).toHaveClass(/active/);
  await expect(drawer.locator('.class-dash-actions').getByRole('button', { name: label, exact: true })).toBeVisible();
  await expect(drawer.locator('.class-dash-actions .neumo-btn')).toHaveCount(4);
  return drawer;
}

test('class edits from Homework use Course Hub settings and preserve linked data', async ({ page }) => {
  await openHomework(page);
  const ids = await seedLinkedCourses(page);
  await page.locator('[data-homework-tab="class"]').click();
  const classMenu = page.locator(`[data-course-menu-trigger="${ids.chemistryId}"]`);
  await classMenu.click();
  await page.getByRole('menuitem', { name: 'Edit class', exact: true }).click();

  const settings = page.locator('#courseHubMount [data-cs="name"]');
  await expect(settings).toBeVisible();
  await expect(settings).toBeFocused();
  await expect(settings).toHaveValue('Chemistry');
  await expect(page.locator('#courseHubMount [data-cs="location"]')).toHaveValue('North Lab');
  await expect(page.locator('#courseHubMount [data-cs="description"]')).toHaveValue('Lab science course');

  await settings.fill('   ');
  await saveCourseSettings(page);
  await expect(page.locator('#toastMessage')).toHaveText('Enter a name for this class or activity.');
  await expect.poll(() => page.evaluate(id => window.courseHub.getCourseById(id).name, ids.chemistryId)).toBe('Chemistry');

  await settings.fill('Physics');
  await saveCourseSettings(page);
  await expect(page.locator('#toastMessage')).toHaveText(/already uses that name/i);
  await expect.poll(() => page.evaluate(id => window.courseHub.getCourseById(id).name, ids.chemistryId)).toBe('Chemistry');

  await settings.fill('Chemistry Lab');
  await page.locator('#courseHubMount [data-cs="description"]').fill('Chemistry lab and research');
  await page.locator('#courseHubMount [data-cs="location"]').fill('West Science Wing');
  await page.locator('#courseHubMount [data-cs="room"]').fill('Room 204');
  await page.locator('#courseHubMount [data-cs="meetingDays"]').fill('Tue/Thu');
  await page.locator('#courseHubMount [data-cs="startTime"]').fill('15:30');
  await page.locator('#courseHubMount [data-cs="endTime"]').fill('16:30');
  await saveCourseSettings(page);
  await expect(page.locator('#courseHubMount .cw-detail-title')).toHaveText('Chemistry Lab');

  const current = await page.evaluate(id => {
    const course = window.courseHub.getCourseById(id);
    const snapshot = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const serializedCourse = snapshot.courseWorkspace.courses.find(item => item.id === id);
    const homeworkCourse = window.SutraHomework.getCourses().find(item => item.id === id);
    const tasks = window.SutraHomework.getTasks().filter(item => item.courseId === id);
    const resource = window.courseHub.getFilesForCourse(id).find(item => item.name === 'Chemistry syllabus');
    const note = window.courseHub.getLinkedNotesForCourse(id).find(item => item.title === 'Chemistry lab notes');
    return {
      courseId: course.id,
      name: course.name,
      homeworkName: homeworkCourse?.name,
      type: course.type,
      homeworkType: homeworkCourse?.type,
      location: course.location,
      room: course.room,
      description: course.description,
      syllabusSummary: course.syllabusSummary,
      schedule: course.schedule.map(item => ({ day: item.day, startTime: item.startTime, endTime: item.endTime, location: item.location })),
      currentGrade: course.currentGrade,
      targetGrade: course.targetGrade,
      gradingCategories: course.gradingCategories.map(item => ({ id: item.id, name: item.name, weight: item.weight, currentPercent: item.currentPercent })),
      integrationMetadata: serializedCourse.integrationMetadata,
      taskIds: tasks.map(item => item.id).sort(),
      resourceId: resource?.id,
      noteId: note?.id,
      fileIds: snapshot.courseWorkspace.files.filter(item => item.courseId === id).map(item => item.id),
      relationships: snapshot.courseWorkspace.relationships.filter(item => item.courseId === id)
    };
  }, ids.chemistryId);
  expect(current).toMatchObject({
    courseId: ids.chemistryId,
    name: 'Chemistry Lab',
    homeworkName: 'Chemistry Lab',
    type: 'class',
    homeworkType: 'class',
    location: 'West Science Wing',
    room: 'Room 204',
    description: 'Chemistry lab and research',
    syllabusSummary: 'Safety first',
    currentGrade: 'A-',
    targetGrade: 'A',
    integrationMetadata: { providerReference: 'chem-verified', retained: true },
    taskIds: [ids.doneClassTaskId, ids.openClassTaskId].sort(),
    resourceId: ids.resourceId,
    noteId: ids.noteId,
    fileIds: [ids.resourceId],
    relationships: [expect.objectContaining({ courseId: ids.chemistryId, entityType: 'note', entityId: ids.noteId })]
  });
  expect(current.schedule).toEqual([
    { day: 'Tue', startTime: '15:30', endTime: '16:30', location: 'Room 204' },
    { day: 'Thu', startTime: '15:30', endTime: '16:30', location: 'Room 204' }
  ]);
  expect(current.gradingCategories).toEqual([
    { id: 'chem-labs', name: 'Labs', weight: 40, currentPercent: 93 }
  ]);

  const drawer = await assertEditDrawerAction(page, ids.chemistryId, 'Edit class');
  await expect(drawer.locator('.class-dash-head h3')).toHaveText('Chemistry Lab');
  await expect(drawer.locator('.class-dash-stat')).toHaveCount(3);
  await expect(drawer.locator('.class-dash-stat').nth(0)).toContainText('1');
  await expect(drawer.locator('.class-dash-stat').nth(1)).toContainText('1');
  await drawer.getByRole('button', { name: 'Edit class', exact: true }).click();
  await expect(settings).toBeVisible();
  await expect(settings).toHaveValue('Chemistry Lab');
  await page.evaluate(() => window.setActiveView('homework'));
  await page.evaluate(id => window.openClassDashboardDrawer(id), ids.chemistryId);
  await page.locator('#classDashCloseBtn').click();

  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await waitForAppReady(page);
  await page.waitForFunction(() => !!window.courseHub && !!window.SutraHomework);
  const afterReload = await page.evaluate(id => {
    const course = window.courseHub.getCourseById(id);
    const serialized = window.serializeWorkspace({ mode: 'json', includeSensitiveSettings: false });
    const hwCourse = window.SutraHomework.getCourses().find(item => item.id === id);
    const tasks = window.SutraHomework.getTasks().filter(item => item.courseId === id);
    return {
      name: course?.name,
      homeworkName: hwCourse?.name,
      type: course?.type,
      homeworkType: hwCourse?.type,
      location: course?.location,
      schedule: course?.schedule.map(item => [item.day, item.startTime, item.endTime, item.location]),
      taskIds: tasks.map(item => item.id).sort(),
      doneIds: tasks.filter(item => item.done).map(item => item.id),
      integrationMetadata: serialized.courseWorkspace.courses.find(item => item.id === id)?.integrationMetadata,
      resourceIds: window.courseHub.getFilesForCourse(id).map(item => item.id),
      noteIds: window.courseHub.getLinkedNotesForCourse(id).map(item => item.id)
    };
  }, ids.chemistryId);
  expect(afterReload).toMatchObject({
    name: 'Chemistry Lab', homeworkName: 'Chemistry Lab', type: 'class', homeworkType: 'class',
    location: 'West Science Wing',
    schedule: [['Tue', '15:30', '16:30', 'Room 204'], ['Thu', '15:30', '16:30', 'Room 204']],
    taskIds: [ids.doneClassTaskId, ids.openClassTaskId].sort(),
    doneIds: [ids.doneClassTaskId],
    integrationMetadata: { providerReference: 'chem-verified', retained: true },
    resourceIds: [ids.resourceId], noteIds: [ids.noteId]
  });
});

test('activity can be edited from Homework and its dashboard without losing its Homework link', async ({ page }) => {
  await openHomework(page);
  const ids = await seedLinkedCourses(page);

  const activityActions = page.getByRole('button', { name: 'Activity actions for Robotics', exact: true });
  await activityActions.focus();
  await activityActions.press('Enter');
  const activityEdit = page.locator(`.hw-activity-row [data-course-menu="${ids.roboticsId}"]`).getByRole('menuitem', { name: 'Edit activity', exact: true });
  await expect(activityEdit).toBeVisible();
  await expect(activityEdit).toBeFocused();
  await activityEdit.press('Enter');
  let settings = page.locator('#courseHubMount [data-cs="name"]');
  await expect(settings).toBeVisible();
  await expect(settings).toBeFocused();
  await expect(settings).toHaveValue('Robotics');

  await page.evaluate(() => window.setActiveView('homework'));
  const drawer = await assertEditDrawerAction(page, ids.roboticsId, 'Edit activity');
  await expect(drawer.locator('.class-dash-head h3')).toHaveText('Robotics');
  const dashboardEdit = drawer.getByRole('button', { name: 'Edit activity', exact: true });
  await dashboardEdit.focus();
  await dashboardEdit.press('Enter');
  settings = page.locator('#courseHubMount [data-cs="name"]');
  await expect(settings).toBeVisible();
  await expect(settings).toBeFocused();
  await expect(settings).toHaveValue('Robotics');

  await settings.fill('Debate Club');
  await saveCourseSettings(page);
  await expect(page.locator('#toastMessage')).toHaveText(/already uses that name/i);
  await expect.poll(() => page.evaluate(id => window.courseHub.getCourseById(id).name, ids.roboticsId)).toBe('Robotics');

  await settings.fill('Robotics Crew');
  await page.locator('#courseHubMount [data-cs="description"]').fill('Competitive robotics team');
  await saveCourseSettings(page);
  await expect(page.locator('#courseHubMount .cw-detail-title')).toHaveText('Robotics Crew');
  const activityState = await page.evaluate(id => {
    const course = window.courseHub.getCourseById(id);
    const lane = window.SutraHomework.getCourses().find(item => item.id === id);
    const tasks = window.SutraHomework.getTasks().filter(item => item.courseId === id);
    return { id: course.id, name: course.name, type: course.type, laneName: lane?.name, laneType: lane?.type, taskIds: tasks.map(item => item.id), description: course.description };
  }, ids.roboticsId);
  expect(activityState).toEqual({
    id: ids.roboticsId, name: 'Robotics Crew', type: 'activity', laneName: 'Robotics Crew', laneType: 'misc',
    taskIds: [ids.activityTaskId], description: 'Competitive robotics team'
  });
  await page.evaluate(id => window.openClassDashboardDrawer(id), ids.roboticsId);
  await expect(page.locator('#classDashboardDrawer .class-dash-head h3')).toHaveText('Robotics Crew');
  await page.locator('#classDashCloseBtn').click();

  await page.reload();
  await page.waitForSelector('#storageOptions', { state: 'attached' });
  await waitForAppReady(page);
  await page.waitForFunction(() => !!window.courseHub && !!window.SutraHomework);
  await expect.poll(() => page.evaluate(id => ({
    name: window.courseHub.getCourseById(id)?.name,
    homeworkName: window.SutraHomework.getCourses().find(item => item.id === id)?.name,
    type: window.courseHub.getCourseById(id)?.type,
    homeworkType: window.SutraHomework.getCourses().find(item => item.id === id)?.type,
    taskIds: window.SutraHomework.getTasks().filter(item => item.courseId === id).map(item => item.id)
  }), ids.roboticsId)).toEqual({
    name: 'Robotics Crew', homeworkName: 'Robotics Crew', type: 'activity', homeworkType: 'misc', taskIds: [ids.activityTaskId]
  });
});

for (const width of [1440, 1100, 375]) {
  test(`activity rows and actions menu fit without overlapping at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await openHomework(page);
    if (width === 1100) await page.evaluate(() => window.applyPresetTheme('dark'));
    const ids = await seedLinkedCourses(page);
    await page.evaluate(id => {
      window.courseHub.updateCourse(id, { name: 'Robotics team with a long activity name' });
      const completed = window.courseHub.createAssignmentForCourse(id, { title: 'A long completed robotics assignment', dueDate: '2026-01-01' });
      window.SutraHomework.setDone(completed.id, true);
      window.SutraHomework.render();
    }, ids.roboticsId);
    const row = page.locator('.hw-activity-row').filter({ has: page.locator(`[data-course-dashboard="${ids.roboticsId}"]`) });
    await expect(row).toBeVisible();
    const geometry = await row.evaluate(el => {
      const rect = selector => { const b = el.querySelector(selector).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width }; };
      return { main: rect('.hw-activity-main'), actions: rect('.hw-activity-actions'), deadline: rect('.hw-activity-deadline'), overflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(geometry.main.width).toBeGreaterThan(75);
    expect(geometry.main.right).toBeLessThanOrEqual(geometry.actions.left);
    expect(geometry.deadline.top).toBeGreaterThanOrEqual(geometry.main.bottom);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    const trigger = row.getByRole('button', { name: 'Activity actions for Robotics team with a long activity name', exact: true });
    await trigger.click();
    const menu = row.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Edit activity', exact: true })).toBeFocused();
    await expect(menu.getByRole('menuitem', { name: 'Remove activity', exact: true })).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds.width).toBeGreaterThan(170);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `.tmp/review-ec-menu-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
}
