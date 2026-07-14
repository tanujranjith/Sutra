(function () {
  'use strict';

  const HARD_DIFFICULTY_WEIGHT = Object.freeze({ easy: 1, medium: 2, hard: 3 });
  const PRIORITY_WEIGHT = Object.freeze({ high: 1, medium: 2, low: 3 });

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    weekday: 'short'
  });

  let courses = [];
  let tasks = [];
  let activeTaskMenuId = null;
  let courseQuickModalState = { type: 'class', onCreated: null };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => root.querySelectorAll(selector);
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  function showHomeworkToast(message) {
    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }
    console.warn(message);
  }

  function showHomeworkAlert(message, options = {}) {
    if (typeof window.showCustomAlertDialog === 'function') {
      return window.showCustomAlertDialog({
        title: options.title || 'Homework',
        message: String(message || ''),
        confirmText: options.confirmText || 'OK'
      });
    }
    showHomeworkToast(message);
    return Promise.resolve();
  }

  function showHomeworkConfirm(message, options = {}) {
    if (typeof window.showCustomConfirmDialog === 'function') {
      return window.showCustomConfirmDialog({
        title: options.title || 'Confirm Action',
        message: String(message || ''),
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        confirmVariant: options.confirmVariant || 'danger'
      });
    }
    showHomeworkToast(message);
    return Promise.resolve(false);
  }

  function escHtml(value) {
    const el = document.createElement('div');
    el.textContent = String(value || '');
    return el.innerHTML;
  }

  function formatDateKey(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function normalizeDueDate(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const dateTimeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (dateTimeMatch) return dateTimeMatch[1];

    return formatDateKey(raw);
  }

  function normalizeDueTime(rawValue) {
    const raw = String(rawValue || '').trim().toLowerCase();
    if (!raw) return '';

    if (/^\d{2}:\d{2}$/.test(raw)) {
      const [hh, mm] = raw.split(':').map(Number);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      }
    }

    const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (ampmMatch) {
      let hour = Number(ampmMatch[1]);
      const minute = Number(ampmMatch[2]);
      const marker = ampmMatch[3].toLowerCase();
      if (minute >= 0 && minute <= 59 && hour >= 1 && hour <= 12) {
        if (marker === 'pm' && hour < 12) hour += 12;
        if (marker === 'am' && hour === 12) hour = 0;
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      }
    }

    const isoTimeMatch = raw.match(/[t\s](\d{2}:\d{2})/i);
    if (isoTimeMatch) return normalizeDueTime(isoTimeMatch[1]);

    return '';
  }

  function extractDueParts(rawDue) {
    const raw = String(rawDue || '').trim();
    if (!raw) return { dueDate: '', dueTime: '' };

    const dateTimeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (dateTimeMatch) {
      return {
        dueDate: normalizeDueDate(dateTimeMatch[1]),
        dueTime: normalizeDueTime(dateTimeMatch[2])
      };
    }

    return {
      dueDate: normalizeDueDate(raw),
      dueTime: ''
    };
  }

  function normalizePriority(rawValue) {
    const value = String(rawValue || '').toLowerCase();
    if (value === 'high') return 'high';
    if (value === 'low') return 'low';
    return 'medium';
  }

  const RECURRENCE_OPTIONS = ['none', 'daily', 'weekly', 'monthly'];

  function normalizeRecurrence(rawValue) {
    const raw = String(rawValue || '').trim().toLowerCase();
    return RECURRENCE_OPTIONS.includes(raw) ? raw : 'none';
  }

  function advanceDueDate(dueDate, recurrence) {
    const normalized = normalizeDueDate(dueDate) || formatDateKey(new Date());
    if (!normalized) return '';
    const date = new Date(`${normalized}T12:00:00`);
    if (Number.isNaN(date.getTime())) return normalized;

    if (recurrence === 'daily') date.setDate(date.getDate() + 1);
    else if (recurrence === 'weekly') date.setDate(date.getDate() + 7);
    else if (recurrence === 'monthly') date.setMonth(date.getMonth() + 1);
    else return normalized;

    return formatDateKey(date);
  }

  function recurrenceLabel(recurrence) {
    switch (recurrence) {
      case 'daily': return 'Daily';
      case 'weekly': return 'Weekly';
      case 'monthly': return 'Monthly';
      default: return '';
    }
  }

  function normalizeDifficulty(rawValue) {
    const value = String(rawValue || '').toLowerCase();
    if (value === 'easy' || value === 'low') return 'easy';
    if (value === 'hard' || value === 'high') return 'hard';
    return 'medium';
  }

  // Keep the default assignment shape deliberately small while preserving a
  // few student-facing distinctions that other surfaces can use. Unknown
  // legacy values normalize to assignment so old homework remains unchanged.
  function normalizeHomeworkKind(rawValue) {
    const value = String(rawValue || '').toLowerCase();
    if (value === 'test' || value === 'exam' || value === 'final' || value === 'midterm') return 'test';
    if (value === 'quiz') return 'quiz';
    if (value === 'review') return 'review';
    return 'assignment';
  }

  function ensureCourseIdByName(courseName, type = 'class') {
    const normalizedName = String(courseName || '').trim();
    if (!normalizedName) return '';

    const normalizedType = type === 'misc' ? 'misc' : 'class';
    const existing = courses.find(course => (
      course.type === normalizedType &&
      String(course.name || '').toLowerCase() === normalizedName.toLowerCase()
    ));
    if (existing) return existing.id;

    const next = {
      id: uid(),
      name: normalizedName,
      type: normalizedType
    };
    courses.push(next);
    return next.id;
  }

  function serializeTask(task) {
    const dueDate = normalizeDueDate(task.dueDate);
    const dueTime = normalizeDueTime(task.dueTime);
    const title = String(task.title || task.text || '').trim();

    const serialized = {
      id: String(task.id || uid()),
      courseId: task.courseId ? String(task.courseId) : '',
      title,
      text: title,
      done: !!task.done,
      dueDate,
      dueTime,
      due: dueDate,
      priority: normalizePriority(task.priority),
      difficulty: normalizeDifficulty(task.difficulty),
      recurrence: normalizeRecurrence(task.recurrence),
      notes: String(task.notes || '').trim(),
      createdAt: task.createdAt || new Date().toISOString(),
      // Preserve the real edit time — every mutator sets task.updatedAt
      // itself. Restamping here marked ALL tasks "edited now" on every save,
      // which broke any newest-edit comparison (e.g. the cloud-restore
      // conflict summary).
      updatedAt: task.updatedAt || new Date().toISOString()
    };

    const kind = normalizeHomeworkKind(task.kind || task.type);
    if (kind !== 'assignment') serialized.kind = kind;
    const estimateMinutes = Math.round(Number(task.estimateMinutes || task.effortMinutes) || 0);
    if (estimateMinutes > 0) serialized.estimateMinutes = estimateMinutes;

    // Optional per-task extras ride the same row (hwTasks:v2) so they survive
    // every existing persistence + export path without new storage keys:
    // - actualMinutes: how long the student said it really took (calibration)
    // - completedAt: when it was marked done (weekly review / calibration recency)
    // - sourceUrl: where the assignment came from (LMS paste/bookmarklet import)
    const actualMinutes = Math.round(Number(task.actualMinutes) || 0);
    if (actualMinutes > 0) serialized.actualMinutes = actualMinutes;
    if (task.completedAt) serialized.completedAt = String(task.completedAt);
    const sourceUrl = sanitizeSourceUrl(task.sourceUrl);
    if (sourceUrl) serialized.sourceUrl = sourceUrl;

    // Assignment Studio payload (milestones, subtasks, rubric, links, effort)
    // rides on the homework task itself so it survives every existing
    // persistence + export path. Normalize via the Studio module when present;
    // otherwise pass it through untouched so data is never dropped.
    if (task.studio) {
      const normalizedStudio = (window.SutraAssignmentStudio && typeof window.SutraAssignmentStudio.normalizeStudio === 'function')
        ? window.SutraAssignmentStudio.normalizeStudio(task.studio)
        : task.studio;
      if (normalizedStudio) serialized.studio = normalizedStudio;
    }

    return serialized;
  }

  function normalizeState() {
    const normalizedCourses = [];
    const courseIds = new Set();

    (Array.isArray(courses) ? courses : []).forEach(rawCourse => {
      if (!rawCourse || typeof rawCourse !== 'object') return;
      const name = String(rawCourse.name || rawCourse.subject || rawCourse.title || '').trim();
      if (!name) return;

      let id = String(rawCourse.id || uid());
      while (courseIds.has(id)) id = uid();

      const type = rawCourse.type === 'misc' ? 'misc' : 'class';
      normalizedCourses.push({ id, name, type });
      courseIds.add(id);
    });

    courses = normalizedCourses;

    const tasksSeen = new Set();
    const normalizedTasks = [];

    (Array.isArray(tasks) ? tasks : []).forEach(rawTask => {
      if (!rawTask || typeof rawTask !== 'object') return;

      const title = String(rawTask.title || rawTask.text || rawTask.task || '').trim();
      if (!title) return;

      let id = String(rawTask.id || uid());
      while (tasksSeen.has(id)) id = uid();
      tasksSeen.add(id);

      let courseId = rawTask.courseId ? String(rawTask.courseId) : '';
      const sourceCourseName = String(rawTask.subject || rawTask.course || rawTask.className || '').trim();
      if (!courseId && sourceCourseName) {
        courseId = ensureCourseIdByName(sourceCourseName, 'class');
      }
      if (courseId && !courseIds.has(courseId) && sourceCourseName) {
        courseId = ensureCourseIdByName(sourceCourseName, 'class');
      }

      const extractedDue = extractDueParts(rawTask.due || rawTask.duedate);
      const dueDate = normalizeDueDate(rawTask.dueDate || rawTask.date || extractedDue.dueDate);
      const dueTime = normalizeDueTime(rawTask.dueTime || rawTask.time || extractedDue.dueTime);

      normalizedTasks.push(serializeTask({
        ...rawTask,
        id,
        courseId,
        title,
        done: !!rawTask.done || !!rawTask.completed,
        dueDate,
        dueTime,
        priority: normalizePriority(rawTask.priority),
        difficulty: normalizeDifficulty(rawTask.difficulty),
        createdAt: rawTask.createdAt || new Date().toISOString()
      }));
    });

    tasks = normalizedTasks.sort(compareHomeworkTasks);
  }

  function load() {
    calibrationCache.clear(); // task data may change underneath the cache
    const store = window.SutraHomeworkStore;
    const snapshot = store && typeof store.getSnapshot === 'function'
      ? store.getSnapshot()
      : { courses: [], tasks: [] };
    courses = Array.isArray(snapshot.courses) ? snapshot.courses : [];
    tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];

    normalizeState();
  }

  function notifyHomeworkUpdated() {
    try {
      window.dispatchEvent(new CustomEvent('homework:updated'));
    } catch (error) {
      // no-op
    }
  }

  function save() {
    normalizeState();
    calibrationCache.clear(); // task data changed — recompute ratios lazily
    const store = window.SutraHomeworkStore;
    let result = null;
    try {
      if (!store || typeof store.replace !== 'function') throw new Error('Canonical homework store is unavailable.');
      result = store.replace({ courses, tasks: tasks.map(task => serializeTask(task)) }, { reason: 'homework-ui' });
    } catch (error) {
      if (typeof window.SutraReportError === 'function') window.SutraReportError(error, { where: 'homework.save' }, 'error');
      showHomeworkToast('Homework could not be saved to the workspace. Your change remains on screen — export a backup before closing.');
    }
    // Always notify so the UI re-renders the in-memory state, even when the
    // persistence write above failed.
    notifyHomeworkUpdated();
    return {
      ok: !!result,
      workspace: result
    };
  }

  function normalizeCourseType(rawType) {
    return rawType === 'misc' ? 'misc' : 'class';
  }

  function createCourseFromName(rawType, rawName) {
    const type = normalizeCourseType(rawType);
    const normalizedName = String(rawName || '').trim();
    if (!normalizedName) return null;

    const duplicate = courses.some(course => (
      course.type === type &&
      String(course.name || '').toLowerCase() === normalizedName.toLowerCase()
    ));

    if (duplicate) {
      showHomeworkAlert('That subject/category already exists.');
      return null;
    }

    const created = {
      id: uid(),
      name: normalizedName,
      type
    };
    courses.push(created);
    save();
    return created;
  }

  function ensureCourseQuickModal() {
    let modal = $('#hwCourseQuickModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'hwCourseQuickModal';
    modal.className = 'hw-course-quick-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="hw-course-quick-card" role="dialog" aria-modal="true" aria-labelledby="hwCourseQuickTitle">
        <div class="hw-course-quick-head">
          <h3 id="hwCourseQuickTitle" class="hw-course-quick-title">Add Subject</h3>
          <button type="button" class="hw-course-quick-close" data-course-quick-close aria-label="Close">&times;</button>
        </div>
        <p class="hw-course-quick-copy" id="hwCourseQuickCopy">Type a class name, then press Enter or click Add.</p>
        <form data-course-quick-form class="hw-course-quick-form" style="display:flex; gap:8px; align-items:center;">
          <input type="text" data-course-quick-input maxlength="120" placeholder="Type a class name…" autocomplete="off" style="flex:1 1 auto;" />
          <button type="submit" class="neumo-btn btn-primary hw-course-quick-add" data-course-quick-add aria-label="Add">Add</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    const titleEl = $('#hwCourseQuickTitle', modal);
    const copyEl = $('#hwCourseQuickCopy', modal);
    const closeBtn = $('[data-course-quick-close]', modal);
    const form = $('[data-course-quick-form]', modal);
    const input = $('[data-course-quick-input]', modal);

    const closeModal = () => {
      modal.hidden = true;
      modal.classList.remove('is-visible'); // clear SutraModalManager open-signal
      if (window.SutraModalManager && typeof window.SutraModalManager.sync === 'function') {
        try { window.SutraModalManager.sync(); } catch (_) {}
      }
      courseQuickModalState.onCreated = null;
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });

    if (form && input) {
      form.addEventListener('submit', event => {
        event.preventDefault();
        const created = createCourseFromName(courseQuickModalState.type, input.value);
        if (!created) return;
        const onCreated = courseQuickModalState.onCreated;
        closeModal();
        if (typeof onCreated === 'function') {
          onCreated(created);
        }
      });

      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeModal();
        }
      });
    }

    modal._setContext = (type) => {
      const normalized = normalizeCourseType(type);
      courseQuickModalState.type = normalized;
      if (titleEl) titleEl.textContent = normalized === 'misc' ? 'Add Extracurricular' : 'Add Class';
      if (copyEl) copyEl.textContent = normalized === 'misc'
        ? 'Type an extracurricular/activity, then press Enter or click Add.'
        : 'Type a class name, then press Enter or click Add.';
      if (input) {
        input.value = '';
        input.placeholder = normalized === 'misc' ? 'e.g. Debate Club' : 'e.g. Chemistry';
      }
    };

    return modal;
  }

  function promptAddCourse(rawType, options = {}) {
    const modal = ensureCourseQuickModal();
    const type = normalizeCourseType(rawType);
    courseQuickModalState.onCreated = typeof options.onCreated === 'function' ? options.onCreated : null;
    if (typeof modal._setContext === 'function') modal._setContext(type);
    const returnFocus = options.returnFocus && typeof options.returnFocus.focus === 'function'
      ? options.returnFocus
      : document.activeElement;
    if (returnFocus && typeof returnFocus.focus === 'function') {
      modal.__sutraReturnFocus = returnFocus;
    }
    modal.hidden = false;
    modal.classList.add('is-visible'); // SutraModalManager open-signal (Tab-trap, scroll-lock, focus restore)
    if (window.SutraModalManager && typeof window.SutraModalManager.sync === 'function') {
      try { window.SutraModalManager.sync(); } catch (_) {}
    }
    const input = $('[data-course-quick-input]', modal);
    if (input) setTimeout(() => input.focus(), 30);
  }

  function startOfDay(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function getTaskDueDateTime(task) {
    const dueDate = normalizeDueDate(task && task.dueDate);
    if (!dueDate) return null;
    const dueTime = normalizeDueTime(task && task.dueTime) || '23:59';
    const parsed = new Date(`${dueDate}T${dueTime}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function compareHomeworkTasks(a, b) {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;

    const dueA = getTaskDueDateTime(a);
    const dueB = getTaskDueDateTime(b);
    if (dueA && dueB) {
      const delta = dueA.getTime() - dueB.getTime();
      if (delta !== 0) return delta;
    } else if (dueA) {
      return -1;
    } else if (dueB) {
      return 1;
    }

    const priorityDelta = (PRIORITY_WEIGHT[normalizePriority(a.priority)] || 99) - (PRIORITY_WEIGHT[normalizePriority(b.priority)] || 99);
    if (priorityDelta !== 0) return priorityDelta;

    const difficultyDelta = (HARD_DIFFICULTY_WEIGHT[normalizeDifficulty(b.difficulty)] || 0) - (HARD_DIFFICULTY_WEIGHT[normalizeDifficulty(a.difficulty)] || 0);
    if (difficultyDelta !== 0) return difficultyDelta;

    return String(a.title || '').localeCompare(String(b.title || ''));
  }

  function formatDueDateLabel(dueDate) {
    const normalized = normalizeDueDate(dueDate);
    if (!normalized) return 'No date';
    const parsed = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return normalized;
    return dateFormatter.format(parsed);
  }

  function formatDueTimeLabel(dueTime) {
    const normalized = normalizeDueTime(dueTime);
    if (!normalized) return 'No time';
    const [hourRaw, minuteRaw] = normalized.split(':').map(Number);
    const suffix = hourRaw >= 12 ? 'PM' : 'AM';
    const hour12 = hourRaw % 12 || 12;
    return `${hour12}:${String(minuteRaw).padStart(2, '0')} ${suffix}`;
  }

  function getTaskDueState(task) {
    const dueDate = normalizeDueDate(task && task.dueDate);
    const dueTime = normalizeDueTime(task && task.dueTime);

    if (!dueDate) {
      return {
        statusText: task.done ? 'Done' : 'Open',
        stateClass: task.done ? 'is-done' : 'is-open',
        dueDateLabel: 'No date',
        dueTimeLabel: dueTime ? formatDueTimeLabel(dueTime) : 'No time'
      };
    }

    const dueMoment = getTaskDueDateTime({ dueDate, dueTime });
    if (!dueMoment) {
      return {
        statusText: task.done ? 'Done' : 'Open',
        stateClass: task.done ? 'is-done' : 'is-open',
        dueDateLabel: formatDueDateLabel(dueDate),
        dueTimeLabel: formatDueTimeLabel(dueTime)
      };
    }

    if (task.done) {
      return {
        statusText: 'Done',
        stateClass: 'is-done',
        dueDateLabel: formatDueDateLabel(dueDate),
        dueTimeLabel: formatDueTimeLabel(dueTime)
      };
    }

    const now = new Date();
    const diff = dueMoment.getTime() - now.getTime();
    const twoDays = 48 * 60 * 60 * 1000;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (diff < 0) {
      return {
        statusText: 'Overdue',
        stateClass: 'is-overdue',
        dueDateLabel: formatDueDateLabel(dueDate),
        dueTimeLabel: formatDueTimeLabel(dueTime)
      };
    }

    if (diff <= twoDays) {
      return {
        statusText: 'Due Soon',
        stateClass: 'is-soon',
        dueDateLabel: formatDueDateLabel(dueDate),
        dueTimeLabel: formatDueTimeLabel(dueTime)
      };
    }

    if (diff <= sevenDays) {
      return {
        statusText: 'Upcoming',
        stateClass: 'is-upcoming',
        dueDateLabel: formatDueDateLabel(dueDate),
        dueTimeLabel: formatDueTimeLabel(dueTime)
      };
    }

    return {
      statusText: 'Scheduled',
      stateClass: 'is-open',
      dueDateLabel: formatDueDateLabel(dueDate),
      dueTimeLabel: formatDueTimeLabel(dueTime)
    };
  }

  // =====================================================================
  // Redesign layer: selectable layouts, add methods, and pinned countdowns.
  // Layout + add method are read from body[data-homework-*] (driven by the
  // Settings → Homework prefs in app.js). All renderers below emit the same
  // data-task-* / .hw-task-menu markup the original board used, so the
  // existing bindBoardInteractions() keeps wiring every action for free.
  // =====================================================================

  const HW_SUBJECT_PALETTE = [
    { bg: '#E1F5EE', text: '#0F6E56' },
    { bg: '#EEEDFE', text: '#3C3489' },
    { bg: '#E6F1FB', text: '#185FA5' },
    { bg: '#FAEEDA', text: '#854F0B' },
    { bg: '#FBEAF0', text: '#993556' },
    { bg: '#FAECE7', text: '#993C1D' },
    { bg: '#EAF3DE', text: '#3B6D11' },
    { bg: '#F1EFE8', text: '#444441' }
  ];

  function hashString(value) {
    const str = String(value || '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return hash;
  }

  function getCourseColor(courseId) {
    if (!courseId) return HW_SUBJECT_PALETTE[HW_SUBJECT_PALETTE.length - 1];
    return HW_SUBJECT_PALETTE[hashString(courseId) % HW_SUBJECT_PALETTE.length];
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Imported assignments may carry a link back to the LMS page they came from.
  // Only http(s) URLs are ever stored or rendered — anything else is dropped.
  function sanitizeSourceUrl(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (_) { /* not a URL */ }
    return '';
  }

  // Route trusted markup through the shared DOM-safety sink. Every dynamic
  // value below is already escaped via escHtml(); the rest is static developer
  // markup, so this is the trusted (not user) channel.
  function setSafeHTML(el, html) {
    if (!el) return;
    if (window.SutraDOMSafety && typeof window.SutraDOMSafety.setTrustedHTML === 'function') {
      window.SutraDOMSafety.setTrustedHTML(el, html);
      return;
    }
    el.innerHTML = html; // sutra-allow-html: fallback only; all interpolated values pass through escHtml()
  }

  function getHwAddMethod() {
    const value = document.body && document.body.dataset ? document.body.dataset.homeworkAddMethod : '';
    return ['inline', 'quick', 'panel'].includes(value) ? value : 'inline';
  }

  function studioPctOf(task) {
    if (task && task.studio && window.SutraAssignmentStudio) {
      try {
        return window.SutraAssignmentStudio.computeProgress(window.SutraAssignmentStudio.normalizeStudio(task.studio));
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  // Total planned effort for a task, in minutes. Prefers the assignment-level
  // estimate; otherwise sums the milestone estimates. 0 when no plan exists, so
  // the card stays clean for assignments the student hasn't planned yet.
  function studioEstimateMinutes(task) {
    if (!(task && task.studio && window.SutraAssignmentStudio)) return 0;
    try {
      const studio = window.SutraAssignmentStudio.normalizeStudio(task.studio);
      if (!studio) return 0;
      const override = Number(studio.effort && studio.effort.estimateMinutes) || 0;
      if (override > 0) return override;
      const milestones = Array.isArray(studio.milestones) ? studio.milestones : [];
      return milestones.reduce((sum, m) => sum + (Number(m && m.estimateMinutes) || 0), 0);
    } catch (_) {
      return 0;
    }
  }

  function formatEstimateLabel(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    if (total <= 0) return '';
    if (total < 60) return `${total}m`;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  // ---- effort calibration ------------------------------------------------
  // When the student logs how long finished work actually took, future
  // estimates scale by the actual/predicted ratio instead of staying naive.
  // All deterministic and local: median ratio, tiered course → difficulty →
  // global, at least MIN samples per tier, clamped so one outlier can't wreck
  // the plan.

  const CALIBRATION_MIN_SAMPLES = 3;
  const CALIBRATION_CLAMP = { min: 0.5, max: 2.5 };
  const LONG_WORK_TITLE_RE = /\bessay\b|\bproject\b|\blab\b|\bpaper\b|\bpresentation\b|\bpractice test\b|\bresearch\b/i;

  // What Sutra would have predicted for this task before it was done: the
  // Studio plan when one exists, otherwise the same difficulty base + long-work
  // title bump Quick Capture uses (easy 30 / medium 60 / hard 120, >=90 for
  // essays/projects/labs).
  function predictEffortMinutes(task) {
    if (!task) return 0;
    const planned = studioEstimateMinutes(task);
    if (planned > 0) return planned;
    const base = { easy: 30, medium: 60, hard: 120 };
    let minutes = base[normalizeDifficulty(task.difficulty)] || 60;
    if (LONG_WORK_TITLE_RE.test(String(task.title || ''))) minutes = Math.max(minutes, 90);
    return minutes;
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function calibrationRatios(filter) {
    const out = [];
    for (const t of tasks) {
      if (!t || !t.done) continue;
      const actual = Number(t.actualMinutes) || 0;
      if (actual <= 0) continue;
      const predicted = predictEffortMinutes(t);
      if (predicted <= 0) continue;
      if (filter && !filter(t)) continue;
      out.push(actual / predicted);
    }
    return out;
  }

  // Tiered lookup: same course first, then same difficulty, then everything.
  // Returns { ratio, samples, tier } — ratio 1 with tier 'none' when there is
  // not enough history anywhere. Memoized per (courseId, difficulty) because
  // callers run per-card / per-inbox-item / per-keystroke; the cache clears on
  // every save()/load() so it never outlives the task data it derives from.
  let calibrationCache = new Map();

  function getEffortCalibration(opts) {
    const courseId = opts && opts.courseId ? String(opts.courseId) : '';
    const difficulty = opts && opts.difficulty ? normalizeDifficulty(opts.difficulty) : '';
    const cacheKey = `${courseId}|${difficulty}`;
    if (calibrationCache.has(cacheKey)) return calibrationCache.get(cacheKey);
    const clamp = (r) => Math.min(CALIBRATION_CLAMP.max, Math.max(CALIBRATION_CLAMP.min, r));
    const tiers = [
      courseId ? { tier: 'course', filter: t => String(t.courseId) === courseId } : null,
      difficulty ? { tier: 'difficulty', filter: t => normalizeDifficulty(t.difficulty) === difficulty } : null,
      { tier: 'global', filter: null }
    ].filter(Boolean);
    let result = { ratio: 1, samples: 0, tier: 'none' };
    for (const { tier, filter } of tiers) {
      const ratios = calibrationRatios(filter);
      if (ratios.length >= CALIBRATION_MIN_SAMPLES) {
        result = { ratio: clamp(median(ratios)), samples: ratios.length, tier };
        break;
      }
    }
    calibrationCache.set(cacheKey, result);
    return result;
  }

  // THE one place that decides when calibration applies (significance
  // threshold) and how it rounds. Every surface — card chip, Quick Capture,
  // All Due — goes through here so the policy can't drift between copies.
  function applyEffortCalibration(minutes, opts) {
    const base = Math.round(Number(minutes) || 0);
    if (base <= 0) return { minutes: base, adjusted: false };
    const cal = getEffortCalibration(opts || {});
    if (cal.tier === 'none' || Math.abs(cal.ratio - 1) < 0.15) return { minutes: base, adjusted: false };
    return { minutes: Math.max(5, Math.round((base * cal.ratio) / 5) * 5), adjusted: true };
  }

  // Calibrated estimate for one task. Used for the card chip and exposed for
  // Quick Capture / All Due so every surface adapts the same way.
  function calibratedEstimateMinutes(task) {
    const predicted = predictEffortMinutes(task);
    if (predicted <= 0) return { minutes: 0, adjusted: false };
    return applyEffortCalibration(predicted, { courseId: task && task.courseId, difficulty: task && task.difficulty });
  }

  function logActualMinutes(taskId, minutes) {
    const task = getTaskByIdInternal(taskId);
    const value = Math.round(Number(minutes) || 0);
    if (!task || value <= 0) return false;
    task.actualMinutes = value;
    task.updatedAt = new Date().toISOString();
    save();
    return true;
  }

  // Small non-blocking "took about how long?" card shown after marking an
  // assignment done. Skippable, auto-dismisses, and never steals focus — the
  // whole point is that answering is optional.
  function promptActualMinutes(task) {
    if (!task) return;
    document.querySelectorAll('.hw-time-log-toast').forEach(el => el.remove());
    const host = document.createElement('div');
    host.className = 'hw-time-log-toast';
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', 'Log how long this took');

    const label = document.createElement('div');
    label.className = 'hw-time-log-label';
    label.textContent = `Nice — "${String(task.title || 'Assignment').slice(0, 60)}" done. Took about…`;
    host.appendChild(label);

    const row = document.createElement('div');
    row.className = 'hw-time-log-row';
    const choices = [
      { minutes: 15, text: '15m' },
      { minutes: 30, text: '30m' },
      { minutes: 60, text: '1h' },
      { minutes: 120, text: '2h' },
      { minutes: 240, text: '4h+' }
    ];
    let dismissTimer = 0;
    const dismiss = () => {
      window.clearTimeout(dismissTimer);
      host.remove();
    };
    choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hw-time-log-btn';
      btn.textContent = choice.text;
      btn.addEventListener('click', () => {
        if (logActualMinutes(task.id, choice.minutes)) {
          showHomeworkToast(`Logged ${formatEstimateLabel(choice.minutes)} — future estimates will adapt.`);
        }
        dismiss();
      });
      row.appendChild(btn);
    });
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'hw-time-log-btn hw-time-log-skip';
    skip.textContent = 'Skip';
    skip.addEventListener('click', dismiss);
    row.appendChild(skip);
    host.appendChild(row);

    document.body.appendChild(host);
    dismissTimer = window.setTimeout(dismiss, 15000);
  }

  // How many OTHER not-done assignments share this task's due date. Surfaced as a
  // "+N due this day" chip so a crowded day is visible from the card itself
  // (mirrors deriveStudentContext().overloadedDays, but per-card and store-local).
  function sameDayConflictCount(task) {
    const key = normalizeDueDate(task && task.dueDate);
    if (!key || (task && task.done)) return 0;
    let count = 0;
    for (const t of tasks) {
      if (!t || t.done || String(t.id) === String(task.id)) continue;
      if (normalizeDueDate(t.dueDate) === key) count += 1;
    }
    return count;
  }

  function getTaskByIdInternal(id) {
    if (!id) return null;
    return tasks.find(task => String(task.id) === String(id)) || null;
  }

  // ---- shared task-menu + compact card (reused across every layout) -----

  function renderTaskMenu(task) {
    const recurrence = normalizeRecurrence(task.recurrence);
    const toggleLabel = recurrence !== 'none' && !task.done
      ? 'Mark this occurrence done'
      : (task.done ? 'Mark as open' : 'Mark as done');
    return `
      <div class="hw-assignment-menu-wrap">
        <button type="button" class="hw-task-menu-btn" data-task-menu-trigger="${escHtml(task.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Assignment actions">
          <i class="fas fa-ellipsis-h" aria-hidden="true"></i>
        </button>
        <div class="hw-task-menu" data-task-menu="${escHtml(task.id)}" role="menu" hidden>
          <button type="button" data-task-open="${escHtml(task.id)}" role="menuitem">Open details</button>
          <button type="button" data-studio-open="${escHtml(task.id)}" role="menuitem">${task.studio ? 'Open Studio' : 'Expand into Studio'}</button>
          <button type="button" data-task-toggle="${escHtml(task.id)}" role="menuitem">${escHtml(toggleLabel)}</button>
          <button type="button" data-task-pin-countdown="${escHtml(task.id)}" role="menuitem">Pin as countdown&hellip;</button>
          ${!task.done ? `<button type="button" data-task-snooze="${escHtml(task.id)}" role="menuitem">Snooze 1 day</button>` : ''}
          ${recurrence !== 'none' ? `<button type="button" data-task-stop-recurring="${escHtml(task.id)}" role="menuitem">Stop recurring</button>` : ''}
          ${task.courseId ? `<button type="button" data-task-dashboard="${escHtml(task.id)}" role="menuitem">Open class dashboard</button>` : ''}
          <button type="button" data-task-schedule="${escHtml(task.id)}" role="menuitem">Schedule this</button>
          <button type="button" class="danger" data-task-delete="${escHtml(task.id)}" role="menuitem">Delete assignment</button>
        </div>
      </div>`;
  }

  function renderTaskCard(task) {
    const course = courses.find(c => String(c.id) === String(task.courseId));
    const color = getCourseColor(task.courseId);
    const ds = getTaskDueState(task);
    const difficulty = normalizeDifficulty(task.difficulty);
    const recurrence = normalizeRecurrence(task.recurrence);
    const pct = studioPctOf(task);
    const subjectTag = course
      ? `<span class="hw-card-subject" style="background:${color.bg};color:${color.text}">${escHtml(course.name)}</span>`
      : '';
    const timeLabel = ds.dueTimeLabel && ds.dueTimeLabel !== 'No time' ? ds.dueTimeLabel : '';
    const estimate = !task.done ? calibratedEstimateMinutes(task) : { minutes: 0, adjusted: false };
    const planned = !task.done ? studioEstimateMinutes(task) : 0;
    // Chip only when the student has a plan (keeps unplanned cards clean);
    // calibration adjusts the number, it doesn't invent one.
    const estLabel = planned > 0 ? formatEstimateLabel(estimate.adjusted ? estimate.minutes : planned) : '';
    const estTitle = estimate.adjusted
      ? 'Estimated time to finish (adjusted from how long your work usually takes)'
      : 'Estimated time to finish (from your plan)';
    const conflicts = sameDayConflictCount(task);
    return `
      <li class="hw-card ${task.done ? 'is-done' : ''}" data-task-id="${escHtml(task.id)}" draggable="true" data-drag-title="${escHtml(task.title)}" data-drag-source="homework" data-drag-source-id="${escHtml(task.id)}" data-drag-due-date="${escHtml(task.dueDate || '')}">
        <button type="button" class="hw-card-check" data-task-toggle="${escHtml(task.id)}" aria-label="${task.done ? 'Mark as open' : 'Mark as done'}"><i class="fas ${task.done ? 'fa-check-circle' : 'fa-circle'}" aria-hidden="true"></i></button>
        <div class="hw-card-main">
          <div class="hw-card-title" data-task-open="${escHtml(task.id)}" role="button" tabindex="0">${escHtml(task.title)}${pct != null ? ` <span class="hw-card-studio">&middot; ${pct}%</span>` : ''}</div>
          <div class="hw-card-sub">
            ${subjectTag}
            <span class="hw-card-meta hw-meta-due"><i class="fas fa-calendar-day" aria-hidden="true"></i>${escHtml(ds.dueDateLabel)}</span>
            ${timeLabel ? `<span class="hw-card-meta hw-meta-time"><i class="fas fa-clock" aria-hidden="true"></i>${escHtml(timeLabel)}</span>` : ''}
            ${estLabel ? `<span class="hw-card-meta hw-meta-estimate" title="${escHtml(estTitle)}"><i class="fas fa-hourglass-half" aria-hidden="true"></i>${escHtml(estLabel)}${estimate.adjusted ? ' <span class="hw-meta-estimate-adj" aria-hidden="true">~</span>' : ''}</span>` : ''}
            ${recurrence !== 'none' ? `<span class="hw-card-meta hw-meta-recurrence"><i class="fas fa-repeat" aria-hidden="true"></i>${escHtml(recurrenceLabel(recurrence))}</span>` : ''}
            <span class="hw-card-meta hw-meta-difficulty">${escHtml(difficulty.charAt(0).toUpperCase() + difficulty.slice(1))}</span>
            ${sanitizeSourceUrl(task.sourceUrl) ? `<a class="hw-card-meta hw-meta-source" href="${escHtml(sanitizeSourceUrl(task.sourceUrl))}" target="_blank" rel="noopener noreferrer" title="Open the original assignment page"><i class="fas fa-link" aria-hidden="true"></i>Source</a>` : ''}
            ${conflicts > 0 ? `<span class="hw-card-meta hw-meta-conflict" title="${escHtml(String(conflicts + 1))} things due this day"><i class="fas fa-layer-group" aria-hidden="true"></i>+${conflicts} due this day</span>` : ''}
          </div>
        </div>
        <span class="hw-status-chip ${escHtml(ds.stateClass)}">${escHtml(ds.statusText)}</span>
        ${renderTaskMenu(task)}
      </li>`;
  }

  function renderEmptyStateRedesign(message) {
    // One surface, one primary action: teach the fastest way to capture work.
    // "Paste or type your homework" opens Quick Capture (which parses class,
    // due date and type); "Add a class" is the lighter secondary path.
    return `<div class="hw-empty-redesign">
      <i class="fas fa-clipboard-check" aria-hidden="true"></i>
      <p class="hw-empty-title">${escHtml(message || 'No homework yet.')}</p>
      <p class="hw-empty-sub">Paste your assignment list or type one line — Sutra files it by class and due date.</p>
      <div class="hw-empty-actions">
        <button type="button" class="hw-btn hw-btn-primary" data-hw-empty-capture><i class="fas fa-bolt" aria-hidden="true"></i> Paste or type your homework</button>
        <button type="button" class="hw-btn hw-btn-compact" data-course-add="class"><i class="fas fa-plus" aria-hidden="true"></i> Add a class</button>
      </div>
    </div>`;
  }

  // ---- inline add composer (default add method) -------------------------

  function buildCourseOptions(selectedId) {
    const cls = courses.filter(c => c.type === 'class');
    const misc = courses.filter(c => c.type === 'misc');
    const optionFor = c => `<option value="${escHtml(c.id)}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${escHtml(c.name)}</option>`;
    let html = '<option value="">Subject&hellip;</option>';
    if (cls.length) html += `<optgroup label="Classes">${cls.map(optionFor).join('')}</optgroup>`;
    if (misc.length) html += `<optgroup label="Activities">${misc.map(optionFor).join('')}</optgroup>`;
    return html;
  }

  function renderInlineComposer(presetDate) {
    return `
      <div class="hw-inline-add" data-inline-add>
        <button type="button" class="hw-inline-add-trigger" data-inline-trigger><i class="fas fa-plus" aria-hidden="true"></i><span>Add a task&hellip;</span></button>
        <form class="hw-inline-add-form" data-inline-form hidden autocomplete="off">
          <input type="text" class="hw-inline-title" data-inline-title placeholder="What needs doing?" maxlength="180" />
          <div class="hw-inline-chips">
            <select class="hw-inline-course" data-inline-course aria-label="Subject">${buildCourseOptions('')}</select>
            <input type="date" class="hw-inline-date" data-inline-date value="${escHtml(presetDate || '')}" aria-label="Due date" />
            <select class="hw-inline-diff" data-inline-diff aria-label="Difficulty">
              <option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option>
            </select>
            <select class="hw-inline-rep" data-inline-rep aria-label="Repeat">
              <option value="none" selected>Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            </select>
            <span class="hw-inline-hint">Enter to save &middot; Esc to cancel</span>
          </div>
        </form>
      </div>`;
  }

  function bindInlineComposers(board) {
    board.querySelectorAll('[data-inline-add]').forEach(wrap => {
      const trigger = wrap.querySelector('[data-inline-trigger]');
      const form = wrap.querySelector('[data-inline-form]');
      const titleInput = wrap.querySelector('[data-inline-title]');
      const courseSel = wrap.querySelector('[data-inline-course]');
      const dateInput = wrap.querySelector('[data-inline-date]');
      const diffSel = wrap.querySelector('[data-inline-diff]');
      const repSel = wrap.querySelector('[data-inline-rep]');
      if (!trigger || !form) return;

      const openForm = () => {
        if (!courses.length) {
          promptAddCourse('class', { returnFocus: trigger });
          return;
        }
        form.hidden = false;
        trigger.hidden = true;
        setTimeout(() => { if (titleInput) titleInput.focus(); }, 20);
      };
      const closeForm = () => {
        form.hidden = true;
        trigger.hidden = false;
        if (titleInput) titleInput.value = '';
      };
      const submit = () => {
        const courseId = String(courseSel && courseSel.value || '').trim();
        if (!courseId) {
          if (courseSel) courseSel.focus();
          return;
        }
        const created = addTaskToCourse(courseId, {
          title: titleInput ? titleInput.value : '',
          dueDate: dateInput ? dateInput.value : '',
          dueTime: '',
          difficulty: diffSel ? diffSel.value : 'medium',
          recurrence: repSel ? repSel.value : 'none'
        });
        if (!created) {
          if (titleInput) titleInput.focus();
          return;
        }
        render();
      };

      trigger.addEventListener('click', openForm);
      form.addEventListener('submit', event => { event.preventDefault(); submit(); });
      if (titleInput) {
        titleInput.addEventListener('keydown', event => {
          if (event.key === 'Enter') { event.preventDefault(); submit(); }
          else if (event.key === 'Escape') { event.preventDefault(); closeForm(); }
        });
      }
    });
  }

  // ---- quick add (natural language) -------------------------------------

  const QUICK_WEEKDAYS = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };

  function quickNextWeekday(targetDow) {
    const now = startOfDay(new Date());
    let delta = (targetDow - now.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    const d = new Date(now);
    d.setDate(d.getDate() + delta);
    return formatDateKey(d);
  }

  function parseQuickAdd(rawText) {
    let raw = ` ${String(rawText || '').trim()} `;
    if (!raw.trim()) return null;

    const sharedParser = window.SutraStudentDateParser;
    const sharedDate = sharedParser && typeof sharedParser.parseNaturalDate === 'function'
      ? sharedParser.parseNaturalDate(raw, { now: new Date() })
      : null;
    const sharedTime = sharedParser && typeof sharedParser.parseNaturalTime === 'function'
      ? sharedParser.parseNaturalTime(raw)
      : null;

    let difficulty = 'medium';
    const diffMatch = raw.match(/\b(easy|medium|med|hard)\b/i);
    if (diffMatch) {
      const token = diffMatch[1].toLowerCase();
      difficulty = normalizeDifficulty(token === 'med' ? 'medium' : token);
      raw = raw.replace(diffMatch[0], ' ');
    }

    let dueTime = sharedTime && sharedTime.time ? normalizeDueTime(sharedTime.time) : '';
    const timeMatch = raw.match(/\b(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i);
    if (timeMatch) {
      const parsed = normalizeDueTime(timeMatch[0].replace(/\s+/g, '')) || normalizeDueTime(`${timeMatch[0].replace(/[^\d]/g, '')}:00`);
      if (parsed) { dueTime = parsed; raw = raw.replace(timeMatch[0], ' '); }
    } else if (sharedTime && sharedTime.match) {
      raw = raw.replace(new RegExp(escapeRegExp(sharedTime.match), 'i'), ' ');
    }

    let dueDate = '';
    const isoMatch = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    const tomorrowMatch = raw.match(/\b(tomorrow|tmrw|tmr)\b/i);
    const todayMatch = raw.match(/\b(today|tonight)\b/i);
    const nextWeekMatch = raw.match(/\bnext week\b/i);
    const mdMatch = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    let weekdayMatch = null;
    for (const name of Object.keys(QUICK_WEEKDAYS)) {
      const re = new RegExp(`\\b${name}\\b`, 'i');
      if (re.test(raw)) { weekdayMatch = { name, match: raw.match(re)[0] }; break; }
    }

    if (sharedDate && sharedDate.date) { dueDate = normalizeDueDate(sharedDate.date); raw = raw.replace(new RegExp(escapeRegExp(sharedDate.match || ''), 'i'), ' '); }
    else if (isoMatch) { dueDate = normalizeDueDate(isoMatch[1]); raw = raw.replace(isoMatch[0], ' '); }
    else if (todayMatch) { dueDate = formatDateKey(new Date()); raw = raw.replace(todayMatch[0], ' '); }
    else if (tomorrowMatch) { const d = new Date(); d.setDate(d.getDate() + 1); dueDate = formatDateKey(d); raw = raw.replace(tomorrowMatch[0], ' '); }
    else if (nextWeekMatch) { const d = new Date(); d.setDate(d.getDate() + 7); dueDate = formatDateKey(d); raw = raw.replace(nextWeekMatch[0], ' '); }
    else if (mdMatch) {
      const mo = Number(mdMatch[1]); const da = Number(mdMatch[2]);
      let yr = mdMatch[3] ? Number(mdMatch[3]) : new Date().getFullYear();
      if (yr < 100) yr += 2000;
      const d = new Date(yr, mo - 1, da);
      if (!Number.isNaN(d.getTime())) { dueDate = formatDateKey(d); raw = raw.replace(mdMatch[0], ' '); }
    } else if (weekdayMatch) {
      dueDate = quickNextWeekday(QUICK_WEEKDAYS[weekdayMatch.name]);
      raw = raw.replace(new RegExp(`\\b${weekdayMatch.match}\\b`, 'i'), ' ');
    }

    let courseId = '';
    let matchedName = '';
    courses.forEach(course => {
      const name = String(course.name || '').trim();
      if (name && name.length > matchedName.length && new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(raw)) {
        courseId = course.id;
        matchedName = name;
      }
    });
    if (matchedName) raw = raw.replace(new RegExp(escapeRegExp(matchedName), 'i'), ' ');

    const title = raw.replace(/\b(due|on|at|by)\b/ig, ' ').replace(/\s+/g, ' ').trim();
    return { courseId, title, dueDate, dueTime, difficulty };
  }

  function renderQuickAddBar() {
    return `
      <div class="hw-quick-add">
        <div class="hw-quick-add-row">
          <div class="hw-quick-add-field">
            <i class="fas fa-bolt" aria-hidden="true"></i>
            <input type="text" class="hw-quick-add-input" data-quick-add-input placeholder="Try: Chem lab report due Fri 3pm hard" maxlength="200" autocomplete="off" />
          </div>
          <button type="button" class="hw-quick-add-submit" data-quick-add-submit>Add</button>
        </div>
        <div class="hw-quick-add-preview" data-quick-add-preview></div>
      </div>`;
  }

  // Board-level "Add class / Add activity" controls. The homework-layout redesign
  // moved away from the per-lane board (renderCourseLane), which removed the only
  // direct way to add a class from the board. Students still need that, so this
  // toolbar restores it for every layout — it opens #hwCourseQuickModal via the
  // [data-course-add] handler wired in bindBoardInteractions().
  function renderCourseAddBar() {
    return `
      <div class="hw-course-add-bar" role="group" aria-label="Add a class or activity">
        <button type="button" class="hw-btn hw-btn-compact" data-course-add="class"><i class="fas fa-plus" aria-hidden="true"></i> Add class</button>
        <button type="button" class="hw-btn hw-btn-compact" data-course-add="misc"><i class="fas fa-plus" aria-hidden="true"></i> Add activity</button>
      </div>`;
  }

  function bindQuickAdd(board) {
    const input = board.querySelector('[data-quick-add-input]');
    if (!input) return;
    const submitBtn = board.querySelector('[data-quick-add-submit]');
    const preview = board.querySelector('[data-quick-add-preview]');

    const updatePreview = () => {
      if (!preview) return;
      if (!input.value.trim()) { preview.textContent = ''; return; }
      const parsed = parseQuickAdd(input.value);
      if (!parsed) { preview.textContent = ''; return; }
      const course = courses.find(c => String(c.id) === String(parsed.courseId));
      const chips = [];
      if (course) chips.push(`<span class="hw-quick-chip">${escHtml(course.name)}</span>`);
      if (parsed.dueDate) chips.push(`<span class="hw-quick-chip">${escHtml(formatDueDateLabel(parsed.dueDate))}</span>`);
      if (parsed.dueTime) chips.push(`<span class="hw-quick-chip">${escHtml(formatDueTimeLabel(parsed.dueTime))}</span>`);
      chips.push(`<span class="hw-quick-chip">${escHtml(parsed.difficulty)}</span>`);
      setSafeHTML(preview, `<span>Will add &ldquo;${escHtml(parsed.title || '…')}&rdquo;</span>${chips.join('')}`);
    };

    const submit = () => {
      const parsed = parseQuickAdd(input.value);
      if (!parsed || !parsed.title) { input.focus(); return; }
      addTaskToCourse(parsed.courseId || '', {
        title: parsed.title,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        difficulty: parsed.difficulty,
        recurrence: 'none'
      });
      render();
    };

    input.addEventListener('input', updatePreview);
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });
    if (submitBtn) submitBtn.addEventListener('click', submit);
  }

  // ---- unified spreadsheet-style view ------------------------------------
  // One row per class/activity, with that subject's assignments laid out as
  // a compact list in the adjacent cell — replaces the old list/up-next/
  // board/timeline layout picker with a single dense, always-visible view.

  function renderTable() {
    const addMethod = getHwAddMethod();
    const classes = courses.filter(c => c.type === 'class');
    const activities = courses.filter(c => c.type === 'misc');

    const tasksByCourse = new Map();
    tasks.forEach(task => {
      const key = String(task.courseId || '');
      if (!tasksByCourse.has(key)) tasksByCourse.set(key, []);
      tasksByCourse.get(key).push(task);
    });
    // A task whose courseId matches no existing course (deleted subject,
    // restored-from-Trash row) must still be VISIBLE — fold it into the
    // "No subject" bucket instead of a bucket nothing renders.
    const knownCourseIds = new Set(courses.map(c => String(c.id)));
    Array.from(tasksByCourse.keys()).forEach(key => {
      if (key && !knownCourseIds.has(key)) {
        const orphaned = tasksByCourse.get(key) || [];
        tasksByCourse.set('', (tasksByCourse.get('') || []).concat(orphaned));
        tasksByCourse.delete(key);
      }
    });

    const renderCourseRow = (course) => {
      const courseTasks = (tasksByCourse.get(String(course.id)) || []).slice().sort(compareHomeworkTasks);
      const open = courseTasks.filter(task => !task.done);
      const done = courseTasks.filter(task => task.done);
      const overdueCount = open.filter(task => getTaskDueState(task).stateClass === 'is-overdue').length;
      const dueSoonCount = open.filter(task => getTaskDueState(task).stateClass === 'is-soon').length;
      const color = getCourseColor(course.id);
      const visibleCards = [...open, ...done.slice(0, 10)];
      const tasksCellHtml = visibleCards.length
        ? `<ul class="hw-card-list hw-table-tasklist">${visibleCards.map(renderTaskCard).join('')}${addMethod === 'inline' ? renderInlineComposer('') : ''}</ul>`
        : `<div class="hw-table-empty">No assignments yet.</div>${addMethod === 'inline' ? renderInlineComposer('') : ''}`;
      return `
        <div class="hw-table-row" data-course-row="${escHtml(course.id)}">
          <div class="hw-table-cell hw-table-cell-subject" style="--hw-subject-accent:${color.text}">
            <div class="hw-table-subject-name">${escHtml(course.name)}</div>
            <div class="hw-table-subject-meta">${open.length} open${overdueCount ? ` &middot; <span class="hw-table-overdue-text">${overdueCount} overdue</span>` : ''}${dueSoonCount ? ` &middot; ${dueSoonCount} due soon` : ''}</div>
            <div class="hw-table-subject-actions">
              <button type="button" class="hw-table-icon-btn" data-course-dashboard="${escHtml(course.id)}" title="Open class dashboard" aria-label="Open ${escHtml(course.name)} dashboard"><i class="fas fa-gauge-high" aria-hidden="true"></i></button>
              <button type="button" class="hw-table-icon-btn" data-course-delete="${escHtml(course.id)}" title="Remove subject" aria-label="Remove ${escHtml(course.name)}"><i class="fas fa-trash" aria-hidden="true"></i></button>
            </div>
          </div>
          <div class="hw-table-cell hw-table-cell-tasks">${tasksCellHtml}</div>
        </div>`;
    };

    // One self-contained table per track (school classes vs extracurriculars),
    // shown side-by-side so the two kinds of work read as separate columns.
    const renderGroup = (list, label, emptyMsg, addType) => {
      const body = list.length
        ? list.map(renderCourseRow).join('')
        : `<div class="hw-table-row hw-table-row-empty"><div class="hw-table-group-empty">${escHtml(emptyMsg)} <button type="button" class="hw-table-empty-add" data-course-add="${escHtml(addType)}">+ ${addType === 'class' ? 'Add class' : 'Add activity'}</button></div></div>`;
      return `<div class="hw-table" role="table" aria-label="${escHtml(label)}">
          <div class="hw-table-head" role="row">
            <span class="hw-table-th hw-table-th-subject">${escHtml(label)}</span>
            <span class="hw-table-th hw-table-th-tasks">Assignments</span>
          </div>
          ${body}
        </div>`;
    };

    // Empty state only when there is truly NOTHING — with zero courses but
    // surviving tasks (e.g. after deleting every subject) the orphan table
    // below still has to render, or those assignments disappear from view.
    if (!classes.length && !activities.length && !tasks.length) {
      return renderEmptyStateRedesign('No classes yet — add one above to get started.');
    }

    const splitHtml = `<div class="hw-table-split">
        <section class="hw-table-group" data-track="class">${renderGroup(classes, 'Classes', 'No classes yet.', 'class')}</section>
        <section class="hw-table-group" data-track="misc">${renderGroup(activities, 'Extracurriculars', 'No activities yet.', 'misc')}</section>
      </div>`;

    // Tasks left over without a matching course (e.g. an import whose subject
    // didn't resolve) still need to be visible somewhere — full-width below.
    const orphanTasks = (tasksByCourse.get('') || []).slice().sort(compareHomeworkTasks);
    const orphanHtml = orphanTasks.length
      ? `<div class="hw-table hw-table-orphan" role="table" aria-label="Unassigned">
           <div class="hw-table-head" role="row"><span class="hw-table-th hw-table-th-subject">No subject</span><span class="hw-table-th hw-table-th-tasks">Assignments</span></div>
           <div class="hw-table-row hw-table-row-orphan" data-course-row="">
             <div class="hw-table-cell hw-table-cell-subject">
               <div class="hw-table-subject-name">No subject</div>
               <div class="hw-table-subject-meta">${orphanTasks.length} item${orphanTasks.length === 1 ? '' : 's'}</div>
             </div>
             <div class="hw-table-cell hw-table-cell-tasks"><ul class="hw-card-list hw-table-tasklist">${orphanTasks.map(renderTaskCard).join('')}</ul></div>
           </div>
         </div>`
      : '';

    return splitHtml + orphanHtml;
  }

  function snoozeTask(taskId) {
    const task = getTaskByIdInternal(taskId);
    if (!task) return;
    const base = normalizeDueDate(task.dueDate) || formatDateKey(new Date());
    const d = new Date(`${base}T12:00:00`);
    d.setDate(d.getDate() + 1);
    task.dueDate = formatDateKey(d);
    task.updatedAt = new Date().toISOString();
    save();
    render();
  }

  function bindExtraInteractions(board) {
    board.querySelectorAll('[data-task-pin-countdown]').forEach(button => {
      button.addEventListener('click', () => {
        closeTaskContextMenus();
        openCountdownPinChooser(button.getAttribute('data-task-pin-countdown'));
      });
    });
    board.querySelectorAll('[data-task-snooze]').forEach(button => {
      button.addEventListener('click', () => {
        closeTaskContextMenus();
        snoozeTask(button.getAttribute('data-task-snooze'));
      });
    });
  }

  // =====================================================================
  // Pinned deadline countdowns (nav bar / sidebar / in-note chip).
  // Pins live in their own storage key so they ride the safe-storage path
  // without touching the homework task model. A single 1s ticker updates
  // every pinned element + any countdown chip embedded in a note.
  // =====================================================================

  const COUNTDOWN_KEY = 'hwCountdownPins:v1';
  let countdownTimer = null;
  let countdownChooserTaskId = null;
  let cdNoteSelection = null;

  function navigateToHomework() {
    try {
      if (typeof window.setActiveView === 'function') window.setActiveView('homework');
      else if (typeof window.applyActiveView === 'function') window.applyActiveView('homework');
    } catch (_) { /* no-op */ }
  }

  // Homework "pins" (nav/sidebar shortcuts) are a small localStorage-backed
  // list, separate from the canonical course/task store. These two helpers were
  // shared with the (now store-backed) course/task load path; that path moved to
  // SutraHomeworkStore, but pins still need a direct read/write here.
  function parseArrayFromStorage(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // A storage failure (quota, private mode, etc.) must NOT throw — route through
  // the shared safe-storage wrapper so the user gets a durable warning while the
  // change stays in memory (exportable as an emergency backup).
  function writeArrayToStorage(key, value) {
    const payload = JSON.stringify(Array.isArray(value) ? value : []);
    if (window.SutraSafeStorage && typeof window.SutraSafeStorage.set === 'function') {
      return window.SutraSafeStorage.set(key, payload, { importance: 'important', label: 'Your homework' });
    }
    const error = new Error('SutraSafeStorage is unavailable.');
    if (typeof window.SutraReportError === 'function') window.SutraReportError(error, { where: 'homework.writeArrayToStorage', key }, 'error');
    showHomeworkToast('Homework could not be saved to this browser. Your change is kept for now — export a backup to be safe.');
    return { ok: false, error };
  }

  function getPins() {
    return parseArrayFromStorage(COUNTDOWN_KEY)
      .filter(pin => pin && pin.taskId && (pin.target === 'nav' || pin.target === 'sidebar'))
      .map(pin => ({ id: String(pin.id || uid()), taskId: String(pin.taskId), target: pin.target }));
  }

  function savePins(list) {
    writeArrayToStorage(COUNTDOWN_KEY, Array.isArray(list) ? list : []);
  }

  function addPin(taskId, target) {
    const normalizedTarget = target === 'sidebar' ? 'sidebar' : 'nav';
    const list = getPins();
    if (list.some(pin => pin.taskId === String(taskId) && pin.target === normalizedTarget)) {
      showHomeworkToast('Already pinned there.');
      return;
    }
    list.push({ id: uid(), taskId: String(taskId), target: normalizedTarget });
    savePins(list);
    renderPins();
  }

  function removePin(pinId) {
    savePins(getPins().filter(pin => pin.id !== String(pinId)));
    renderPins();
  }

  function cdUrgencyClass(ms) {
    if (ms === null || ms === undefined) return 'hw-cd-calm';
    if (ms <= 0) return 'hw-cd-overdue';
    if (ms <= 6 * 3600000) return 'hw-cd-danger';
    if (ms <= 48 * 3600000) return 'hw-cd-warn';
    return 'hw-cd-calm';
  }

  function formatRemaining(ms) {
    if (ms === null || ms === undefined) return '—';
    if (ms <= 0) return 'Overdue';
    const total = Math.floor(ms / 1000);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (days >= 1) return `${days}d ${hours}h`;
    if (hours >= 1) return `${hours}h ${minutes}m`;
    return `${minutes}m ${seconds}s`;
  }

  function renderNavPin(pin) {
    const task = getTaskByIdInternal(pin.taskId);
    if (!task) return '';
    const due = getTaskDueDateTime(task);
    const ms = due ? due.getTime() - Date.now() : null;
    return `<span class="hw-cd-pill ${cdUrgencyClass(ms)}" data-cd-pin="${escHtml(pin.id)}" data-cd-task="${escHtml(task.id)}" role="button" tabindex="0" title="${escHtml(task.title)}"><i class="fas fa-hourglass-half" aria-hidden="true"></i><span class="hw-cd-pill-time" data-cd-time>${escHtml(formatRemaining(ms))}</span><span class="hw-cd-pill-label">${escHtml(task.title)}</span><button type="button" class="hw-cd-unpin" data-cd-unpin="${escHtml(pin.id)}" aria-label="Unpin countdown">&times;</button></span>`;
  }

  function renderSideCard(pin) {
    const task = getTaskByIdInternal(pin.taskId);
    if (!task) return '';
    const due = getTaskDueDateTime(task);
    const ms = due ? due.getTime() - Date.now() : null;
    const course = courses.find(c => String(c.id) === String(task.courseId));
    const color = getCourseColor(task.courseId);
    const ds = getTaskDueState(task);
    const timeLabel = ds.dueTimeLabel && ds.dueTimeLabel !== 'No time' ? ` &middot; ${escHtml(ds.dueTimeLabel)}` : '';
    return `<div class="hw-cd-card ${cdUrgencyClass(ms)}" data-cd-pin="${escHtml(pin.id)}" data-cd-task="${escHtml(task.id)}" role="button" tabindex="0">${course ? `<div class="hw-cd-card-subject" style="color:${color.text}">${escHtml(course.name)}</div>` : ''}<div class="hw-cd-card-title">${escHtml(task.title)}</div><div class="hw-cd-card-time" data-cd-time>${escHtml(formatRemaining(ms))}</div><div class="hw-cd-card-due">${escHtml(ds.dueDateLabel)}${timeLabel}</div><button type="button" class="hw-cd-unpin" data-cd-unpin="${escHtml(pin.id)}" aria-label="Unpin countdown">&times;</button></div>`;
  }

  function renderPins() {
    let pins = getPins();
    const valid = pins.filter(pin => getTaskByIdInternal(pin.taskId));
    if (valid.length !== pins.length) { savePins(valid); pins = valid; }

    const navWrap = document.getElementById('sutraCountdownNav');
    if (navWrap) {
      const navPins = pins.filter(pin => pin.target === 'nav');
      setSafeHTML(navWrap, navPins.map(renderNavPin).join(''));
      navWrap.style.display = navPins.length ? '' : 'none';
    }
    const sideWrap = document.getElementById('sutraCountdownSidebar');
    if (sideWrap) {
      const sidePins = pins.filter(pin => pin.target === 'sidebar');
      setSafeHTML(sideWrap, sidePins.length ? `<div class="hw-cd-side-head">Pinned</div>${sidePins.map(renderSideCard).join('')}` : '');
      sideWrap.style.display = sidePins.length ? '' : 'none';
    }
    bindPinInteractions();
    tickCountdowns();
  }

  function bindPinInteractions() {
    document.querySelectorAll('[data-cd-unpin]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        removePin(button.getAttribute('data-cd-unpin'));
      });
    });
    document.querySelectorAll('[data-cd-pin]').forEach(el => {
      el.addEventListener('click', () => navigateToHomework());
      el.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigateToHomework(); }
      });
    });
  }

  function tickCountdowns() {
    const now = Date.now();
    const setUrgency = (el, ms) => {
      const cls = cdUrgencyClass(ms);
      ['hw-cd-calm', 'hw-cd-warn', 'hw-cd-danger', 'hw-cd-overdue'].forEach(name => el.classList.toggle(name, name === cls));
    };

    document.querySelectorAll('[data-cd-pin]').forEach(el => {
      const task = getTaskByIdInternal(el.getAttribute('data-cd-task'));
      const due = task ? getTaskDueDateTime(task) : null;
      const ms = due ? due.getTime() - now : null;
      const timeEl = el.querySelector('[data-cd-time]');
      if (timeEl) { const txt = formatRemaining(ms); if (timeEl.textContent !== txt) timeEl.textContent = txt; }
      setUrgency(el, ms);
    });

    document.querySelectorAll('[data-countdown]').forEach(el => {
      let target = null;
      const taskId = el.getAttribute('data-countdown-task');
      if (taskId) {
        const task = getTaskByIdInternal(taskId);
        if (task) { const due = getTaskDueDateTime(task); if (due) target = due.getTime(); }
      }
      if (target === null) {
        const iso = el.getAttribute('data-countdown-target');
        if (iso) { const d = new Date(iso); if (!Number.isNaN(d.getTime())) target = d.getTime(); }
      }
      const ms = target === null ? null : target - now;
      const timeEl = el.querySelector('[data-countdown-time]');
      if (timeEl) { const txt = formatRemaining(ms); if (timeEl.textContent !== txt) timeEl.textContent = txt; }
      setUrgency(el, ms);
    });
  }

  function startCountdownTicker() {
    if (countdownTimer) return;
    countdownTimer = setInterval(tickCountdowns, 1000);
    tickCountdowns();
  }

  function ensureCountdownPinModal() {
    let modal = document.getElementById('hwCountdownPinModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'hwCountdownPinModal';
    modal.className = 'hw-course-quick-modal';
    modal.hidden = true;
    setSafeHTML(modal, `
      <div class="hw-course-quick-card" role="dialog" aria-modal="true" aria-labelledby="hwCdPinTitle">
        <div class="hw-course-quick-head">
          <h3 id="hwCdPinTitle" class="hw-course-quick-title">Pin as countdown</h3>
          <button type="button" class="hw-course-quick-close" data-cd-pin-close aria-label="Close">&times;</button>
        </div>
        <p class="hw-course-quick-copy">Where should this deadline live?</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button type="button" class="neumo-btn" data-cd-pin-target="nav"><i class="fas fa-window-maximize" aria-hidden="true"></i> Top nav bar</button>
          <button type="button" class="neumo-btn" data-cd-pin-target="sidebar"><i class="fas fa-table-columns" aria-hidden="true"></i> Sidebar</button>
          <button type="button" class="neumo-btn" data-cd-pin-target="note"><i class="fas fa-note-sticky" aria-hidden="true"></i> Insert into current note</button>
        </div>
      </div>`);
    document.body.appendChild(modal);
    const close = () => {
      modal.hidden = true;
      modal.classList.remove('is-visible');
      if (window.SutraModalManager && typeof window.SutraModalManager.sync === 'function') { try { window.SutraModalManager.sync(); } catch (_) {} }
    };
    modal.querySelector('[data-cd-pin-close]').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.querySelectorAll('[data-cd-pin-target]').forEach(button => {
      button.addEventListener('click', () => {
        const target = button.getAttribute('data-cd-pin-target');
        const taskId = countdownChooserTaskId;
        close();
        if (!taskId) return;
        if (target === 'nav') { addPin(taskId, 'nav'); showHomeworkToast('Pinned to the top bar.'); }
        else if (target === 'sidebar') { addPin(taskId, 'sidebar'); showHomeworkToast('Pinned to the sidebar.'); }
        else if (target === 'note') { insertCountdownIntoNote(taskId); }
      });
    });
    return modal;
  }

  function openCountdownPinChooser(taskId) {
    countdownChooserTaskId = String(taskId || '');
    const modal = ensureCountdownPinModal();
    modal.hidden = false;
    modal.classList.add('is-visible');
    if (window.SutraModalManager && typeof window.SutraModalManager.sync === 'function') { try { window.SutraModalManager.sync(); } catch (_) {} }
  }

  function insertCountdownIntoNote(taskId) {
    const task = getTaskByIdInternal(taskId);
    if (!task) { showHomeworkToast('Assignment not found.'); return; }
    const due = getTaskDueDateTime(task);
    if (typeof window.SutraInsertCountdownIntoNote === 'function') {
      window.SutraInsertCountdownIntoNote({ taskId: String(task.id), label: task.title, targetIso: due ? due.toISOString() : '' });
    } else {
      showHomeworkToast('Open a note to insert a countdown.');
    }
  }

  // Slash-command entry point (from app.js): pick a deadline to embed.
  function pickForNote(selectionState) {
    const open = tasks.filter(t => getTaskDueDateTime(t)).slice().sort(compareHomeworkTasks);
    if (!open.length) { showHomeworkToast('Add a homework deadline first, then insert it.'); return; }
    cdNoteSelection = selectionState || null;

    let modal = document.getElementById('hwCountdownNoteModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hwCountdownNoteModal';
      modal.className = 'hw-course-quick-modal';
      modal.hidden = true;
      setSafeHTML(modal, `
        <div class="hw-course-quick-card" role="dialog" aria-modal="true" aria-labelledby="hwCdNoteTitle">
          <div class="hw-course-quick-head">
            <h3 id="hwCdNoteTitle" class="hw-course-quick-title">Insert countdown</h3>
            <button type="button" class="hw-course-quick-close" data-cd-note-close aria-label="Close">&times;</button>
          </div>
          <p class="hw-course-quick-copy">Pick a deadline to embed in this note.</p>
          <div class="hw-cd-note-list" data-cd-note-list style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow:auto;"></div>
        </div>`);
      document.body.appendChild(modal);
      const closeNote = () => {
        modal.hidden = true;
        modal.classList.remove('is-visible');
        if (window.SutraModalManager && typeof window.SutraModalManager.sync === 'function') { try { window.SutraModalManager.sync(); } catch (_) {} }
      };
      modal.querySelector('[data-cd-note-close]').addEventListener('click', closeNote);
      modal.addEventListener('click', event => { if (event.target === modal) closeNote(); });
      modal._close = closeNote;
    }

    const list = modal.querySelector('[data-cd-note-list]');
    setSafeHTML(list, open.slice(0, 40).map(task => {
      const course = courses.find(c => String(c.id) === String(task.courseId));
      const ds = getTaskDueState(task);
      return `<button type="button" class="neumo-btn" data-cd-note-pick="${escHtml(task.id)}" style="text-align:left;display:flex;flex-direction:column;align-items:flex-start;gap:2px;"><span>${escHtml(task.title)}</span><span style="font-size:11px;opacity:0.7;">${course ? `${escHtml(course.name)} &middot; ` : ''}${escHtml(ds.dueDateLabel)}</span></button>`;
    }).join(''));
    list.querySelectorAll('[data-cd-note-pick]').forEach(button => {
      button.addEventListener('click', () => {
        const task = getTaskByIdInternal(button.getAttribute('data-cd-note-pick'));
        modal._close();
        if (!task) return;
        const due = getTaskDueDateTime(task);
        if (typeof window.SutraInsertCountdownIntoNote === 'function') {
          window.SutraInsertCountdownIntoNote({ taskId: String(task.id), label: task.title, targetIso: due ? due.toISOString() : '', selectionState: cdNoteSelection });
        }
      });
    });

    modal.hidden = false;
    modal.classList.add('is-visible');
    if (window.SutraModalManager && typeof window.SutraModalManager.sync === 'function') { try { window.SutraModalManager.sync(); } catch (_) {} }
  }

  function setDashboardStat(selector, value) {
    const el = $(selector);
    if (el) el.textContent = String(value);
  }

  function closeTaskContextMenus() {
    const board = $('#hwDataTable');
    if (!board) return;

    board.querySelectorAll('.hw-task-menu').forEach(menu => {
      menu.hidden = true;
    });
    board.querySelectorAll('.hw-task-menu-btn').forEach(btn => {
      btn.setAttribute('aria-expanded', 'false');
    });
    activeTaskMenuId = null;
  }

  function toggleTaskMenu(taskId, triggerBtn) {
    const board = $('#hwDataTable');
    if (!board || !taskId) return;

    const menu = board.querySelector(`.hw-task-menu[data-task-menu="${CSS.escape(taskId)}"]`);
    if (!menu) return;

    const isOpening = menu.hidden;
    closeTaskContextMenus();

    if (isOpening) {
      menu.hidden = false;
      if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'true');
      activeTaskMenuId = taskId;
    }
  }

  // The next unfinished, soonest-dated milestone for an assignment (Studio 2.0).
  function renderNextMilestoneChip(task) {
    if (!task.studio || !window.SutraAssignmentStudio) return '';
    const studio = window.SutraAssignmentStudio.normalizeStudio(task.studio);
    if (!studio || !studio.milestones || !studio.milestones.length) return '';
    const pending = studio.milestones.filter(m => !m.done);
    if (!pending.length) return '';
    pending.sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
    const next = pending[0];
    const dateLabel = next.dueDate ? ` · ${escHtml(next.dueDate)}` : '';
    return `<span class="hw-meta-chip hw-meta-milestone" title="Next milestone"><i class="fas fa-flag-checkered" aria-hidden="true"></i>Next: ${escHtml(next.title)}${dateLabel}</span>`;
  }

  function renderHomeworkTaskRow(task) {
    const dueState = getTaskDueState(task);
    const difficulty = normalizeDifficulty(task.difficulty);
    const priority = normalizePriority(task.priority);
    const recurrence = normalizeRecurrence(task.recurrence);
    const recurrenceText = recurrenceLabel(recurrence);
    const toggleLabel = recurrence !== 'none' && !task.done
      ? 'Mark this occurrence done'
      : (task.done ? 'Mark as open' : 'Mark as done');

    return `
      <li class="hw-assignment ${task.done ? 'is-done' : ''}" data-task-id="${escHtml(task.id)}">
        <div class="hw-assignment-head">
          <div class="hw-assignment-title-wrap">
            <span class="hw-task-badge">Assignment</span>
            <div class="hw-assignment-title">${escHtml(task.title)}</div>
          </div>
          <div class="hw-assignment-menu-wrap">
            <button type="button" class="hw-task-menu-btn" data-task-menu-trigger="${escHtml(task.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Assignment actions">
              <i class="fas fa-ellipsis-h" aria-hidden="true"></i>
            </button>
            <div class="hw-task-menu" data-task-menu="${escHtml(task.id)}" role="menu" hidden>
              <button type="button" data-task-open="${escHtml(task.id)}" role="menuitem">Open details</button>
              <button type="button" data-studio-open="${escHtml(task.id)}" role="menuitem">${task.studio ? 'Open Studio' : 'Expand into Studio'}</button>
              <button type="button" data-task-toggle="${escHtml(task.id)}" role="menuitem">${escHtml(toggleLabel)}</button>
              ${recurrence !== 'none' ? `<button type="button" data-task-stop-recurring="${escHtml(task.id)}" role="menuitem">Stop recurring</button>` : ''}
              ${task.courseId ? `<button type="button" data-task-dashboard="${escHtml(task.id)}" role="menuitem">Open class dashboard</button>` : ''}
              <button type="button" data-task-schedule="${escHtml(task.id)}" role="menuitem">Schedule this</button>
              <button type="button" class="danger" data-task-delete="${escHtml(task.id)}" role="menuitem">Delete assignment</button>
            </div>
          </div>
        </div>
        <div class="hw-assignment-meta">
          <span class="hw-meta-chip hw-meta-due"><i class="fas fa-calendar-day" aria-hidden="true"></i>${escHtml(dueState.dueDateLabel)}</span>
          <span class="hw-meta-chip hw-meta-time"><i class="fas fa-clock" aria-hidden="true"></i>${escHtml(dueState.dueTimeLabel)}</span>
          ${recurrenceText ? `<span class="hw-meta-chip hw-meta-recurrence"><i class="fas fa-repeat" aria-hidden="true"></i>${escHtml(recurrenceText)}</span>` : ''}
          ${task.studio && window.SutraAssignmentStudio ? `<span class="hw-meta-chip hw-meta-studio"><i class="fas fa-diagram-project" aria-hidden="true"></i>Studio ${window.SutraAssignmentStudio.computeProgress(window.SutraAssignmentStudio.normalizeStudio(task.studio))}%</span>` : ''}
          ${renderNextMilestoneChip(task)}
          <span class="hw-meta-chip hw-meta-difficulty">Difficulty: ${escHtml(difficulty.charAt(0).toUpperCase() + difficulty.slice(1))}</span>
          <span class="hw-meta-chip hw-meta-priority">Urgency: ${escHtml(priority.charAt(0).toUpperCase() + priority.slice(1))}</span>
          <span class="hw-status-chip ${escHtml(dueState.stateClass)}">${escHtml(dueState.statusText)}</span>
        </div>
      </li>
    `;
  }

  function renderCoursePanel(course, laneType, tasksByCourse) {
    const courseTasks = (tasksByCourse.get(String(course.id)) || []).slice().sort(compareHomeworkTasks);
    const openCount = courseTasks.filter(task => !task.done).length;
    const dueSoonCount = courseTasks.filter(task => !task.done && getTaskDueState(task).stateClass === 'is-soon').length;

    const assignmentMarkup = courseTasks.length
      ? `<ul class="hw-assignment-list">${courseTasks.map(renderHomeworkTaskRow).join('')}</ul>`
      : `
        <div class="hw-lane-empty">
          <p class="hw-empty-copy">No assignments yet.</p>
        </div>
      `;

    return `
      <article class="hw-course-panel ${laneType === 'misc' ? 'is-misc' : ''}">
        <div class="hw-course-row">
          <div>
            <div class="hw-course-title">${escHtml(course.name)}${laneType === 'misc' ? ' <span class="hw-misc-badge">Misc</span>' : ''}</div>
            <div class="hw-course-meta">${openCount} open · ${courseTasks.length} total${dueSoonCount ? ` · ${dueSoonCount} due soon` : ''}</div>
          </div>
          <div class="hw-course-head-actions">
            <button class="hw-course-dash-btn" type="button" data-course-dashboard="${escHtml(course.id)}" title="Open class dashboard">Dashboard</button>
            <button class="hw-course-remove" type="button" data-course-delete="${escHtml(course.id)}" aria-label="Remove ${escHtml(course.name)}">&times;</button>
          </div>
        </div>
        ${assignmentMarkup}
      </article>
    `;
  }

  function renderGlobalAssignmentComposer() {
    return `
      <section class="hw-global-add-wrap">
        <button type="button" id="hwOpenAddAssignment" class="hw-global-add-trigger" aria-label="Add assignment or task" title="Add assignment or task">
          <i class="fas fa-plus" aria-hidden="true"></i>
        </button>
        <div class="hw-global-add-modal" id="hwGlobalAddModal" hidden>
          <div class="hw-global-add-card" role="dialog" aria-modal="true" aria-labelledby="hwGlobalAddTitle">
            <div class="hw-global-add-head">
              <h3 id="hwGlobalAddTitle" class="hw-global-add-title">Add Assignment</h3>
              <button type="button" class="hw-global-close" id="hwCloseAddAssignment" aria-label="Close add assignment">&times;</button>
            </div>

            <div class="hw-add-step" data-step="lane">
              <p class="hw-add-step-copy">Where does this assignment belong?</p>
              <div class="hw-lane-pick">
                <button type="button" class="hw-lane-pick-card" data-pick-lane="class">
                  <span class="hw-lane-pick-title">Classes</span>
                  <span class="hw-lane-pick-sub">Subject-specific homework.</span>
                </button>
                <button type="button" class="hw-lane-pick-card" data-pick-lane="misc">
                  <span class="hw-lane-pick-title">Extracurriculars</span>
                  <span class="hw-lane-pick-sub">Clubs, projects, and activities.</span>
                </button>
              </div>
            </div>

            <div class="hw-add-step" data-step="details" hidden>
              <button type="button" class="hw-add-back" data-add-back>&larr; Back</button>
              <form id="hwGlobalAddForm" class="hw-global-add-form" autocomplete="off">
                <label for="hwCourseSelect" data-course-label class="hw-add-field-label">Class</label>
                <select id="hwCourseSelect" data-field="courseId"></select>
                <input type="text" data-field="title" placeholder="Assignment title" maxlength="180" />
                <div class="hw-global-meta-row">
                  <input type="date" data-field="dueDate" placeholder="Due date" />
                  <input type="time" data-field="dueTime" placeholder="Due time" />
                  <select data-field="difficulty">
                    <option value="easy">Easy</option>
                    <option value="medium" selected>Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div class="hw-global-meta-row hw-global-meta-row-2">
                  <select data-field="recurrence" aria-label="Repeat assignment">
                    <option value="none" selected>Doesn't repeat</option>
                    <option value="daily">Repeats daily</option>
                    <option value="weekly">Repeats weekly</option>
                    <option value="monthly">Repeats monthly</option>
                  </select>
                  <button type="submit">Add</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderCourseLane(options) {
    const { laneType, title, subtitle, emptyCopy } = options;
    const laneCourses = courses.filter(course => course.type === laneType);
    const tasksByCourse = tasks.reduce((map, task) => {
      const key = String(task.courseId || '');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(task);
      return map;
    }, new Map());

    const addLabel = laneType === 'misc' ? 'Activity' : 'Subject';

    const bodyMarkup = laneCourses.length
      ? `<div class="hw-course-grid">${laneCourses.map(course => renderCoursePanel(course, laneType, tasksByCourse)).join('')}</div>`
      : `
        <div class="hw-lane-empty">
          <p class="hw-empty-copy">${escHtml(emptyCopy)}</p>
          <button type="button" class="hw-lane-action" data-course-add="${escHtml(laneType)}">+ Add ${escHtml(addLabel)}</button>
        </div>
      `;

    return `
      <section class="hw-lane" data-lane="${escHtml(laneType)}">
        <div class="hw-lane-head">
          <div>
            <h3 class="hw-lane-title">${escHtml(title)}</h3>
            <p class="hw-lane-sub">${escHtml(subtitle)}</p>
          </div>
          <button type="button" class="hw-btn hw-btn-compact" data-course-add="${escHtml(laneType)}">+ Add ${escHtml(addLabel)}</button>
        </div>
        <div class="hw-lane-list">${bodyMarkup}</div>
      </section>
    `;
  }

  function renderLegacyTable() {
    const tbody = $('#tasksBody');
    if (!tbody) return false;

    if (!tasks.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="small muted">No homework yet.</td></tr>';
      return true;
    }

    const courseMap = new Map(courses.map(course => [String(course.id), course]));

    tbody.innerHTML = tasks.map(task => {
      const course = courseMap.get(String(task.courseId));
      const subject = course ? course.name : 'General';
      return `
        <tr class="${task.done ? 'done' : ''}">
          <td>${escHtml(subject)}</td>
          <td>${escHtml(task.title)}</td>
          <td>${escHtml(task.dueDate || '')}</td>
          <td>${escHtml(normalizePriority(task.priority))}</td>
          <td>
            <button type="button" class="btn-ghost" data-task-toggle="${escHtml(task.id)}">${task.done ? 'Undo' : 'Done'}</button>
            <button type="button" class="btn-ghost" data-task-delete="${escHtml(task.id)}">Delete</button>
          </td>
        </tr>
      `;
    }).join('');

    return true;
  }

  function render() {
    const board = $('#hwDataTable');
    const headerActions = $('#view-homework .hw-header-actions');
    if (!board) {
      renderLegacyTable();
      return;
    }

    const openTasks = tasks.filter(task => !task.done);
    const completedCount = tasks.length - openTasks.length;
    const dueSoonCount = openTasks.reduce((count, task) => {
      const dueMoment = getTaskDueDateTime(task);
      if (!dueMoment) return count;
      const diff = dueMoment.getTime() - Date.now();
      return diff >= 0 && diff <= (7 * 24 * 60 * 60 * 1000) ? count + 1 : count;
    }, 0);
    const completionPercent = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

    setDashboardStat('#hwStatOpen', openTasks.length);
    setDashboardStat('#hwStatDueSoon', dueSoonCount);
    setDashboardStat('#hwStatCompleted', completedCount);
    setDashboardStat('#hwStatCourses', courses.length);
    setDashboardStat('#hwStatProgress', `${completionPercent}% completed`);

    if (headerActions) {
      headerActions.querySelectorAll('.hw-global-add-wrap').forEach(node => node.remove());
      headerActions.insertAdjacentHTML('beforeend', renderGlobalAssignmentComposer());
    }

    const addMethod = getHwAddMethod();
    const topAdd = addMethod === 'quick' ? renderQuickAddBar() : '';
    board.innerHTML = topAdd + renderCourseAddBar() + renderTable();

    bindBoardInteractions(board);
    bindInlineComposers(board);
    bindQuickAdd(board);
    bindExtraInteractions(board);
    renderPins();
  }

  function inferPriorityFromDueDate(dueDate) {
    const normalizedDate = normalizeDueDate(dueDate);
    if (!normalizedDate) return 'medium';

    const today = startOfDay(new Date());
    const due = new Date(`${normalizedDate}T00:00:00`);
    if (Number.isNaN(due.getTime())) return 'medium';

    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diffDays <= 0) return 'high';
    if (diffDays <= 2) return 'medium';
    return 'low';
  }

  function addTaskToCourse(courseId, payload) {
    const title = String(payload.title || '').trim();
    if (!title) return false;

    const created = serializeTask({
      id: uid(),
      courseId,
      title,
      done: false,
      dueDate: normalizeDueDate(payload.dueDate),
      dueTime: normalizeDueTime(payload.dueTime),
      priority: normalizePriority(payload.priority || inferPriorityFromDueDate(payload.dueDate)),
      difficulty: normalizeDifficulty(payload.difficulty || 'medium'),
      recurrence: normalizeRecurrence(payload.recurrence),
      kind: normalizeHomeworkKind(payload.kind || payload.type),
      estimateMinutes: payload.estimateMinutes,
      notes: payload.notes,
      sourceUrl: payload.sourceUrl,
      createdAt: new Date().toISOString()
    });
    tasks.push(created);

    const persistence = save();
    // The task remains in memory even when a browser storage write fails. The
    // returned status lets callers be honest without dropping a capture.
    return { ...serializeTask(created), persistence };
  }

  async function deleteCourse(courseId) {
    const target = courses.find(course => String(course.id) === String(courseId));
    if (!target) return;

    const confirmed = await showHomeworkConfirm(`Remove "${target.name}" and all assignments in it?`, {
      title: 'Delete Subject',
      confirmText: 'Delete Subject',
      cancelText: 'Keep Subject',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;

    // Every assignment in the deleted subject goes to Trash so a mis-click
    // on "Delete Subject" can be walked back one row at a time.
    if (window.SutraTrash && typeof window.SutraTrash.add === 'function') {
      tasks.filter(task => String(task.courseId) === String(courseId)).forEach(task => {
        try { window.SutraTrash.add('homework', task.title || task.text, serializeTask(task)); } catch (err) { /* non-critical */ }
      });
    }
    courses = courses.filter(course => String(course.id) !== String(courseId));
    tasks = tasks.filter(task => String(task.courseId) !== String(courseId));
    save();
    render();
  }

  function toggleTaskDone(taskId) {
    const task = tasks.find(row => String(row.id) === String(taskId));
    if (!task) return;

    const recurrence = normalizeRecurrence(task.recurrence);
    if (recurrence !== 'none' && !task.done) {
      const next = advanceDueDate(task.dueDate, recurrence);
      if (next) task.dueDate = next;
      task.updatedAt = new Date().toISOString();
      save();
      render();
      return;
    }

    task.done = !task.done;
    if (task.done) {
      task.completedAt = new Date().toISOString();
    } else {
      // Reopening clears the completion timestamp but KEEPS actualMinutes —
      // deleting it meant one mis-click permanently destroyed the student's
      // logged time (and a calibration sample) with no undo. On re-complete
      // the prompt shows again and an answer overwrites the old value.
      delete task.completedAt;
    }
    task.updatedAt = new Date().toISOString();
    save();
    render();
    if (task.done) promptActualMinutes(task);
  }

  function stopRecurrence(taskId) {
    const task = tasks.find(row => String(row.id) === String(taskId));
    if (!task) return;
    task.recurrence = 'none';
    task.updatedAt = new Date().toISOString();
    save();
    render();
  }

  // Canonical cross-surface completion action. Unlike toggleTaskDone this will
  // never accidentally reopen work when Today/Assistant calls it twice.
  function markTaskDone(taskId) {
    const task = tasks.find(row => String(row.id) === String(taskId));
    if (!task || task.done) return false;
    toggleTaskDone(taskId);
    return true;
  }

  function deleteTask(taskId) {
    const target = tasks.find(task => String(task.id) === String(taskId));
    // Deletes are recoverable: the row goes to the shared workspace Trash
    // (30-day retention) instead of vanishing.
    if (target && window.SutraTrash && typeof window.SutraTrash.add === 'function') {
      try { window.SutraTrash.add('homework', target.title || target.text, serializeTask(target)); } catch (err) { /* non-critical */ }
    }
    tasks = tasks.filter(task => String(task.id) !== String(taskId));
    save();
    render();
  }

  function openHomeworkTaskEditor(taskId) {
    const normalizedId = String(taskId || '').trim();
    if (!normalizedId) return;

    if (typeof window.openHomeworkTaskModal === 'function') {
      const opened = window.openHomeworkTaskModal('v2', normalizedId);
      if (opened) return;
    }

    if (typeof window.openTaskModal === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('homework:updated'));
      } catch (error) {
        // no-op
      }
      setTimeout(() => {
        try {
          window.openTaskModal(`hw_v2_${normalizedId}`);
        } catch (error) {
          // no-op
        }
      }, 180);
    }
  }

  function bindBoardInteractions(board) {
    const addModal = $('#hwGlobalAddModal');
    const openAddBtn = $('#hwOpenAddAssignment');
    const closeAddBtn = $('#hwCloseAddAssignment');
    const globalAddForm = $('#hwGlobalAddForm');
    if (globalAddForm && addModal) {
      const titleInput = $('[data-field="title"]', globalAddForm);
      const courseSelect = $('[data-field="courseId"]', globalAddForm);
      const dueDateInput = $('[data-field="dueDate"]', globalAddForm);
      const dueTimeInput = $('[data-field="dueTime"]', globalAddForm);
      const difficultySelect = $('[data-field="difficulty"]', globalAddForm);
      const recurrenceSelect = $('[data-field="recurrence"]', globalAddForm);
      const stepLane = addModal.querySelector('[data-step="lane"]');
      const stepDetails = addModal.querySelector('[data-step="details"]');
      const courseLabel = addModal.querySelector('[data-course-label]');
      const backBtn = addModal.querySelector('[data-add-back]');
      const lanePickButtons = addModal.querySelectorAll('[data-pick-lane]');

      let currentLane = 'class';

      if (titleInput && courseSelect && dueDateInput && dueTimeInput && difficultySelect && stepLane && stepDetails) {
        const populateCourseSelect = (laneType, preselectId = '') => {
          const laneCourses = courses.filter(course => course.type === laneType);
          const placeholder = laneType === 'misc' ? 'Select an activity' : 'Select a class';
          const empty = laneType === 'misc' ? 'No activities yet — add one' : 'No classes yet — add one';
          if (!laneCourses.length) {
            courseSelect.innerHTML = `<option value="">${empty}</option>`;
          } else {
            const options = laneCourses
              .map(course => `<option value="${escHtml(course.id)}">${escHtml(course.name)}</option>`)
              .join('');
            courseSelect.innerHTML = `<option value="">${placeholder}</option>${options}`;
          }
          if (preselectId && laneCourses.some(course => String(course.id) === String(preselectId))) {
            courseSelect.value = String(preselectId);
          } else {
            courseSelect.value = '';
          }
        };

        const showStep = (step) => {
          stepLane.hidden = step !== 'lane';
          stepDetails.hidden = step !== 'details';
        };

        const enterDetailsStep = (laneType, preselectId = '') => {
          currentLane = laneType === 'misc' ? 'misc' : 'class';
          if (courseLabel) {
            courseLabel.textContent = currentLane === 'misc' ? 'Extracurricular' : 'Class';
          }
          populateCourseSelect(currentLane, preselectId);
          showStep('details');
          setTimeout(() => {
            const focusTarget = courseSelect.value ? titleInput : courseSelect;
            focusTarget.focus();
          }, 40);
        };

        const openModal = (courseId = '') => {
          const selectedCourseId = String(courseId || '').trim();
          addModal.hidden = false;
          if (selectedCourseId) {
            const selectedCourse = courses.find(course => String(course.id) === selectedCourseId);
            const laneType = selectedCourse && selectedCourse.type === 'misc' ? 'misc' : 'class';
            enterDetailsStep(laneType, selectedCourseId);
          } else {
            showStep('lane');
          }
        };

        const closeModal = () => {
          addModal.hidden = true;
        };

        if (openAddBtn) openAddBtn.addEventListener('click', () => openModal());
        if (closeAddBtn) closeAddBtn.addEventListener('click', closeModal);
        addModal.addEventListener('click', event => {
          if (event.target === addModal) closeModal();
        });

        lanePickButtons.forEach(button => {
          button.addEventListener('click', () => {
            const laneType = button.getAttribute('data-pick-lane') === 'misc' ? 'misc' : 'class';
            enterDetailsStep(laneType);
          });
        });

        if (backBtn) {
          backBtn.addEventListener('click', () => showStep('lane'));
        }

        board.querySelectorAll('[data-open-add-assignment]').forEach(button => {
          button.addEventListener('click', () => {
            openModal(button.getAttribute('data-open-add-assignment'));
          });
        });

        globalAddForm.addEventListener('submit', async event => {
          event.preventDefault();
          const selectedCourseId = String(courseSelect.value || '').trim();
          if (!selectedCourseId) {
            await showHomeworkAlert(currentLane === 'misc'
              ? 'Pick an extracurricular first.'
              : 'Pick a class first.');
            return;
          }

          const created = addTaskToCourse(selectedCourseId, {
            title: titleInput.value,
            dueDate: dueDateInput.value,
            dueTime: dueTimeInput.value,
            difficulty: difficultySelect.value,
            recurrence: recurrenceSelect ? recurrenceSelect.value : 'none'
          });
          if (!created) return;

          titleInput.value = '';
          dueDateInput.value = '';
          dueTimeInput.value = '';
          difficultySelect.value = 'medium';
          if (recurrenceSelect) recurrenceSelect.value = 'none';
          closeModal();
          render();
        });

        titleInput.addEventListener('keydown', event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          globalAddForm.requestSubmit();
        });
      }
    }

    board.querySelectorAll('[data-course-add]').forEach(button => {
      button.addEventListener('click', () => {
        try { button.focus({ preventScroll: true }); } catch (_) { try { button.focus(); } catch (e) {} }
        promptAddCourse(button.getAttribute('data-course-add'), { returnFocus: button });
      });
    });

    // Empty-state primary action: open Quick Capture so a student can paste or
    // type homework straight away (it parses class, due date and type).
    board.querySelectorAll('[data-hw-empty-capture]').forEach(button => {
      button.addEventListener('click', () => {
        if (typeof window !== 'undefined' && typeof window.openQuickCaptureModal === 'function') {
          window.openQuickCaptureModal('');
        } else {
          promptAddCourse('class', { returnFocus: button });
        }
      });
    });

    board.querySelectorAll('[data-course-delete]').forEach(button => {
      button.addEventListener('click', async () => {
        await deleteCourse(button.getAttribute('data-course-delete'));
      });
    });

    board.querySelectorAll('[data-course-dashboard]').forEach(button => {
      button.addEventListener('click', () => {
        const cid = button.getAttribute('data-course-dashboard');
        if (typeof window.openClassDashboardDrawer === 'function') {
          window.openClassDashboardDrawer(cid);
        }
      });
    });

    board.querySelectorAll('[data-task-menu-trigger]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const taskId = button.getAttribute('data-task-menu-trigger');
        toggleTaskMenu(taskId, button);
      });
    });

    board.querySelectorAll('[data-task-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        closeTaskContextMenus();
        toggleTaskDone(button.getAttribute('data-task-toggle'));
      });
    });

    board.querySelectorAll('[data-task-stop-recurring]').forEach(button => {
      button.addEventListener('click', () => {
        closeTaskContextMenus();
        stopRecurrence(button.getAttribute('data-task-stop-recurring'));
      });
    });

    board.querySelectorAll('[data-task-delete]').forEach(button => {
      button.addEventListener('click', async () => {
        const confirmed = await showHomeworkConfirm('Delete this assignment?', {
          title: 'Delete Assignment',
          confirmText: 'Delete Assignment',
          cancelText: 'Keep Assignment',
          confirmVariant: 'danger'
        });
        if (!confirmed) return;
        closeTaskContextMenus();
        deleteTask(button.getAttribute('data-task-delete'));
      });
    });

    board.querySelectorAll('[data-task-open]').forEach(button => {
      button.addEventListener('click', () => {
        closeTaskContextMenus();
        openHomeworkTaskEditor(button.getAttribute('data-task-open'));
      });
    });

    // Assignment Studio handles [data-studio-open] via its own delegated
    // listener; we only need to close the context menu here.
    board.querySelectorAll('[data-studio-open]').forEach(button => {
      button.addEventListener('click', () => closeTaskContextMenus());
    });

    board.querySelectorAll('[data-task-dashboard]').forEach(button => {
      button.addEventListener('click', () => {
        closeTaskContextMenus();
        const taskId = button.getAttribute('data-task-dashboard');
        const task = tasks.find(t => String(t.id) === String(taskId));
        if (!task || !task.courseId) return;
        if (typeof window.openClassDashboardDrawer === 'function') {
          window.openClassDashboardDrawer(task.courseId);
        }
      });
    });

    board.querySelectorAll('[data-task-schedule]').forEach(button => {
      button.addEventListener('click', () => {
        closeTaskContextMenus();
        const taskId = button.getAttribute('data-task-schedule');
        const task = tasks.find(t => String(t.id) === String(taskId));
        if (!task) return;
        if (typeof window.scheduleGenericItemAsBlock === 'function') {
          window.scheduleGenericItemAsBlock({ title: task.title || task.text, dueDate: task.dueDate, dueTime: task.dueTime, category: 'study' });
        } else {
          showHomeworkToast('Scheduling not available.');
        }
      });
    });
  }

  function addLegacyTask() {
    const subjectInput = $('#subject');
    const taskInput = $('#task');
    const dueInput = $('#duedate');
    const priorityInput = $('#priority');
    if (!taskInput) return;

    const title = taskInput.value.trim();
    if (!title) return;

    const subject = subjectInput ? subjectInput.value.trim() : '';
    let courseId = '';
    if (subject) {
      courseId = ensureCourseIdByName(subject, 'class');
    }

    addTaskToCourse(courseId, {
      title,
      dueDate: dueInput ? dueInput.value : '',
      dueTime: '',
      difficulty: 'medium',
      priority: priorityInput ? priorityInput.value : 'medium'
    });

    taskInput.value = '';
    if (dueInput) dueInput.value = '';
    taskInput.focus();
    render();
  }

  function exportJSON() {
    const payload = {
      schema: 'sutra-homework',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      courses,
      tasks: tasks.map(task => serializeTask(task))
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `homework-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || '{}'));
        if (!payload || typeof payload !== 'object') {
          throw new Error('Invalid payload');
        }

        if (Array.isArray(payload.courses)) {
          courses = payload.courses;
        }
        if (Array.isArray(payload.tasks)) {
          tasks = payload.tasks;
        }

        normalizeState();
        save();
        render();
        showHomeworkAlert('Homework imported.', { title: 'Homework Import' });
      } catch (error) {
        showHomeworkAlert('Invalid homework JSON file.', { title: 'Homework Import' });
      }
    };
    reader.readAsText(file);
  }

  function isHomeworkViewActive() {
    const activeView = document.body && document.body.dataset ? document.body.dataset.view : '';
    if (activeView === 'homework') return true;
    const homeworkView = $('#view-homework');
    return !!(homeworkView && homeworkView.classList.contains('active'));
  }

  function showSetup() {
    const overlay = $('#hwSetupOverlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    overlay.classList.remove('fade-out');
    overlay.querySelectorAll('.hw-chip').forEach(chip => chip.remove());

    const classInput = $('#hwClassInput');
    const miscInput = $('#hwMiscInput');
    if (classInput) classInput.value = '';
    if (miscInput) miscInput.value = '';
  }

  function hideSetupImmediate() {
    const overlay = $('#hwSetupOverlay');
    if (!overlay) return;
    overlay.classList.remove('fade-out');
    overlay.style.display = 'none';
  }

  function hideSetup(callback) {
    const overlay = $('#hwSetupOverlay');
    if (!overlay) {
      if (typeof callback === 'function') callback();
      return;
    }

    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.style.display = 'none';
      if (typeof callback === 'function') callback();
    }, 380);
  }

  function setupChipInput(wrapperSelector, inputSelector) {
    const wrapper = $(wrapperSelector);
    const input = $(inputSelector);
    if (!wrapper || !input) return;

    wrapper.addEventListener('click', () => input.focus());

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        addChip(wrapper, input);
      }
      if (event.key === 'Backspace' && input.value === '') {
        const chips = wrapper.querySelectorAll('.hw-chip');
        if (chips.length) chips[chips.length - 1].remove();
      }
    });

    input.addEventListener('blur', () => {
      if (!input.value.trim()) return;
      addChip(wrapper, input);
    });
  }

  function addChip(wrapper, input) {
    const value = input.value.replace(/,/g, '').trim();
    if (!value) return;

    const chip = document.createElement('span');
    chip.className = 'hw-chip';
    chip.innerHTML = `${escHtml(value)} <button type="button" aria-label="Remove">&times;</button>`;

    const removeBtn = chip.querySelector('button');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => chip.remove());
    }

    wrapper.insertBefore(chip, input);
    input.value = '';
  }

  function collectChips(wrapperSelector) {
    return [...$$(`${wrapperSelector} .hw-chip`)]
      .map(chip => chip.textContent.replace('\u00d7', '').trim())
      .filter(Boolean);
  }

  function shouldPromptSetup() {
    return courses.length === 0;
  }

  function handleHomeworkViewChange(nextView) {
    const normalized = String(nextView || '').toLowerCase();
    if (normalized !== 'homework') {
      hideSetupImmediate();
      return;
    }

    if (shouldPromptSetup()) {
      showSetup();
      return;
    }

    hideSetupImmediate();
    render();
  }

  function init() {
    load();

    setupChipInput('#hwClassChips', '#hwClassInput');
    setupChipInput('#hwMiscChips', '#hwMiscInput');

    const exportBtn = $('#hwExportBtn');
    const importInput = $('#hwImportFile');
    const resetBtn = $('#hwResetBtn');
    const setupDoneBtn = $('#hwSetupDone');
    const setupSkipBtn = $('#hwSetupSkip');
    const setupOverlay = $('#hwSetupOverlay');

    const legacyAddBtn = $('#addBtn');
    const legacyTaskInput = $('#task');

    if (exportBtn) exportBtn.addEventListener('click', exportJSON);

    if (importInput) {
      importInput.addEventListener('change', event => {
        const file = event.target && event.target.files ? event.target.files[0] : null;
        if (file) importJSON(file);
        event.target.value = '';
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        const confirmed = await showHomeworkConfirm('Clear all homework subjects and assignments?', {
          title: 'Reset Homework',
          confirmText: 'Clear Homework',
          cancelText: 'Keep Homework',
          confirmVariant: 'danger'
        });
        if (!confirmed) return;
        courses = [];
        tasks = [];
        save();
        showSetup();
      });
    }

    if (legacyAddBtn) legacyAddBtn.addEventListener('click', addLegacyTask);
    if (legacyTaskInput) {
      legacyTaskInput.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        addLegacyTask();
      });
    }

    if (setupSkipBtn) {
      setupSkipBtn.addEventListener('click', () => hideSetupImmediate());
    }

    if (setupOverlay) {
      setupOverlay.addEventListener('click', event => {
        if (event.target === setupOverlay) hideSetupImmediate();
      });
    }

    if (setupDoneBtn) {
      setupDoneBtn.addEventListener('click', async () => {
        const classNames = collectChips('#hwClassChips');
        const miscNames = collectChips('#hwMiscChips');

        if (!classNames.length && !miscNames.length) {
          await showHomeworkAlert('Add at least one subject or activity.');
          return;
        }

        classNames.forEach(name => courses.push({ id: uid(), name, type: 'class' }));
        miscNames.forEach(name => courses.push({ id: uid(), name, type: 'misc' }));

        save();
        hideSetup(() => render());
      });
    }

    document.addEventListener('click', event => {
      const board = $('#hwDataTable');
      if (!board) return;
      if (!board.contains(event.target)) {
        closeTaskContextMenus();
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const courseQuickModal = $('#hwCourseQuickModal');
      if (courseQuickModal && !courseQuickModal.hidden) {
        courseQuickModal.hidden = true;
        return;
      }
      const addModal = $('#hwGlobalAddModal');
      if (addModal && !addModal.hidden) {
        addModal.hidden = true;
        return;
      }
      if (activeTaskMenuId) {
        closeTaskContextMenus();
        return;
      }
      if (!isHomeworkViewActive()) return;
      const overlay = $('#hwSetupOverlay');
      if (overlay && overlay.style.display !== 'none') hideSetupImmediate();
    });

    window.addEventListener('resize', () => {
      if (activeTaskMenuId) closeTaskContextMenus();
    });

    window.addEventListener('noteflow:view-changed', event => {
      const view = event && event.detail ? event.detail.view : '';
      handleHomeworkViewChange(view);
    });

    window.addEventListener('homework:updated', () => {
      load();
      renderPins();
      if (isHomeworkViewActive()) render();
    });

    // Re-render when the add-method preference changes in Settings.
    window.addEventListener('sutra:homework-prefs', () => {
      if (isHomeworkViewActive()) render();
    });

    // Public API for the countdown engine + cross-feature reads.
    window.SutraHomework = window.SutraHomework || {};
    Object.assign(window.SutraHomework, {
      getTasks: () => tasks.map(task => serializeTask(task)),
      getCourses: () => courses.slice(),
      getTaskById: (id) => { const task = getTaskByIdInternal(id); return task ? serializeTask(task) : null; },
      // Find-or-create a class course by name, persist, and return { id, name }.
      // Used by Quick Capture's inline "+ New class" so module memory and storage
      // stay in sync (no direct hwCourses:v2 writes from outside this module).
      addCourse: (name) => {
        const normalized = String(name || '').trim();
        if (!normalized) return null;
        const id = ensureCourseIdByName(normalized, 'class');
        if (!id) return null;
        save();
        render();
        const course = courses.find(c => String(c.id) === String(id));
        return { id: String(id), name: course ? String(course.name || normalized) : normalized };
      },
      // Canonical cross-feature write path. Quick Capture and future import
      // surfaces must use this instead of writing hwTasks:v2 directly so
      // quota/security failures keep the new assignment in module memory and
      // show the shared durable storage warning.
      createTask: (payload) => {
        const input = payload && typeof payload === 'object' ? payload : {};
        let courseId = String(input.courseId || '');
        if (!courseId && input.courseName) courseId = ensureCourseIdByName(input.courseName, 'class');
        const created = addTaskToCourse(courseId, input);
        if (created) render();
        return created || null;
      },
      // Effort calibration (deterministic, local): other surfaces (Quick
      // Capture, All Due) scale their estimates by the same history the
      // homework cards use, so every estimate in the app adapts together.
      getEffortCalibration: (opts) => getEffortCalibration(opts || {}),
      applyEffortCalibration: (minutes, opts) => applyEffortCalibration(minutes, opts || {}),
      predictEffortMinutes: (task) => predictEffortMinutes(task),
      calibratedEstimateMinutes: (task) => calibratedEstimateMinutes(task),
      logActualMinutes,
      markDone: markTaskDone,
      render
    });
    window.SutraCountdown = window.SutraCountdown || {};
    Object.assign(window.SutraCountdown, {
      pin: addPin,
      unpin: removePin,
      list: getPins,
      pickForNote,
      renderPins,
      tick: tickCountdowns
    });

    startCountdownTicker();
    renderPins();

    render();
    if (isHomeworkViewActive()) {
      handleHomeworkViewChange('homework');
    } else {
      hideSetupImmediate();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
