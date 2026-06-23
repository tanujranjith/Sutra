(function () {
  'use strict';

  const COURSES_KEY = 'hwCourses:v2';
  const TASKS_KEY = 'hwTasks:v2';
  const SCHEMA_KEY = 'hwSchemaVersion';
  const LEGACY_COURSES_KEY = 'homeworkCourses:v1';
  const LEGACY_TASKS_KEY = 'homeworkTasks:v1';

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

  function parseArrayFromStorage(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // Homework courses/assignments are user-authored data. A storage failure
  // (quota, private mode, etc.) must NOT throw out of save() — that would drop
  // the in-memory change and skip the homework:updated re-render. Route through
  // the shared safe-storage wrapper so the user gets a durable warning while the
  // change stays in memory (exportable as an emergency backup).
  function writeArrayToStorage(key, value) {
    const payload = JSON.stringify(Array.isArray(value) ? value : []);
    if (window.SutraSafeStorage && typeof window.SutraSafeStorage.set === 'function') {
      return window.SutraSafeStorage.set(key, payload, { importance: 'important', label: 'Your homework' });
    }
    const error = new Error('SutraSafeStorage is unavailable.');
    if (typeof window.reportError === 'function') window.reportError(error, { where: 'homework.writeArrayToStorage', key }, 'error');
    showHomeworkToast('Homework could not be saved to this browser. Your change is kept for now — export a backup to be safe.');
    return { ok: false, error };
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
      updatedAt: new Date().toISOString()
    };

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
    // If a recent write to the homework keys failed (quota / private mode), the
    // bytes in storage are STALE. Reloading would clobber the user's in-memory
    // changes (the homework:updated round-trip calls load()). Keep what we have
    // in memory until a write succeeds again and clears the degraded flag.
    try {
      const degraded = window.SutraSafeStorage && typeof window.SutraSafeStorage.getDegraded === 'function'
        ? window.SutraSafeStorage.getDegraded()
        : null;
      if (degraded && (degraded[COURSES_KEY] || degraded[TASKS_KEY])) {
        normalizeState();
        return;
      }
    } catch (error) {
      /* fall through to a normal load */
    }

    courses = parseArrayFromStorage(COURSES_KEY);
    tasks = parseArrayFromStorage(TASKS_KEY);

    if (courses.length === 0 && tasks.length === 0) {
      const legacyCourses = parseArrayFromStorage(LEGACY_COURSES_KEY);
      const legacyTasks = parseArrayFromStorage(LEGACY_TASKS_KEY);
      if (legacyCourses.length || legacyTasks.length) {
        courses = legacyCourses;
        tasks = legacyTasks;
      }
    }

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
    writeArrayToStorage(COURSES_KEY, courses);
    writeArrayToStorage(TASKS_KEY, tasks.map(task => serializeTask(task)));
    // Schema marker is a low-stakes optional write; never let it throw.
    if (window.SutraSafeStorage && typeof window.SutraSafeStorage.set === 'function') {
      window.SutraSafeStorage.set(SCHEMA_KEY, '3', { importance: 'optional' });
    }
    // Always notify so the UI re-renders the in-memory state, even when the
    // persistence write above failed.
    notifyHomeworkUpdated();
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

  function getHwLayout() {
    const value = document.body && document.body.dataset ? document.body.dataset.homeworkLayout : '';
    return ['list', 'upnext', 'board', 'timeline'].includes(value) ? value : 'list';
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
    return `
      <li class="hw-card ${task.done ? 'is-done' : ''}" data-task-id="${escHtml(task.id)}">
        <button type="button" class="hw-card-check" data-task-toggle="${escHtml(task.id)}" aria-label="${task.done ? 'Mark as open' : 'Mark as done'}"><i class="fas ${task.done ? 'fa-check-circle' : 'fa-circle'}" aria-hidden="true"></i></button>
        <div class="hw-card-main">
          <div class="hw-card-title" data-task-open="${escHtml(task.id)}" role="button" tabindex="0">${escHtml(task.title)}${pct != null ? ` <span class="hw-card-studio">&middot; ${pct}%</span>` : ''}</div>
          <div class="hw-card-sub">
            ${subjectTag}
            <span class="hw-card-meta hw-meta-due"><i class="fas fa-calendar-day" aria-hidden="true"></i>${escHtml(ds.dueDateLabel)}</span>
            ${timeLabel ? `<span class="hw-card-meta hw-meta-time"><i class="fas fa-clock" aria-hidden="true"></i>${escHtml(timeLabel)}</span>` : ''}
            ${recurrence !== 'none' ? `<span class="hw-card-meta hw-meta-recurrence"><i class="fas fa-repeat" aria-hidden="true"></i>${escHtml(recurrenceLabel(recurrence))}</span>` : ''}
            <span class="hw-card-meta hw-meta-difficulty">${escHtml(difficulty.charAt(0).toUpperCase() + difficulty.slice(1))}</span>
          </div>
        </div>
        <span class="hw-status-chip ${escHtml(ds.stateClass)}">${escHtml(ds.statusText)}</span>
        ${renderTaskMenu(task)}
      </li>`;
  }

  function renderEmptyStateRedesign(message) {
    return `<div class="hw-empty-redesign"><i class="fas fa-clipboard-check" aria-hidden="true"></i><p>${escHtml(message || 'Nothing here yet.')}</p></div>`;
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

    let difficulty = 'medium';
    const diffMatch = raw.match(/\b(easy|medium|med|hard)\b/i);
    if (diffMatch) {
      const token = diffMatch[1].toLowerCase();
      difficulty = normalizeDifficulty(token === 'med' ? 'medium' : token);
      raw = raw.replace(diffMatch[0], ' ');
    }

    let dueTime = '';
    const timeMatch = raw.match(/\b(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i);
    if (timeMatch) {
      const parsed = normalizeDueTime(timeMatch[0].replace(/\s+/g, '')) || normalizeDueTime(`${timeMatch[0].replace(/[^\d]/g, '')}:00`);
      if (parsed) { dueTime = parsed; raw = raw.replace(timeMatch[0], ' '); }
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

    if (isoMatch) { dueDate = normalizeDueDate(isoMatch[1]); raw = raw.replace(isoMatch[0], ' '); }
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

  // ---- bucketing + the four layouts -------------------------------------

  function getDueBucket(task) {
    if (task.done) return 'done';
    const due = getTaskDueDateTime(task);
    if (!due) return 'nodate';
    const now = new Date();
    if (due.getTime() < now.getTime()) return 'overdue';
    const diffDays = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86400000);
    if (diffDays <= 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays <= 7) return 'week';
    return 'later';
  }

  function bucketizeTasks() {
    const buckets = { overdue: [], today: [], tomorrow: [], week: [], later: [], nodate: [], done: [] };
    tasks.forEach(task => { (buckets[getDueBucket(task)] || buckets.later).push(task); });
    Object.keys(buckets).forEach(key => buckets[key].sort(compareHomeworkTasks));
    return buckets;
  }

  function bucketPresetDate(key) {
    const today = new Date();
    if (key === 'today') return formatDateKey(today);
    if (key === 'tomorrow') { const d = new Date(today); d.setDate(d.getDate() + 1); return formatDateKey(d); }
    return '';
  }

  function renderSmartList() {
    const buckets = bucketizeTasks();
    const addMethod = getHwAddMethod();
    const order = [['overdue', 'Overdue'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['later', 'Later'], ['nodate', 'No date']];
    let html = '';
    let anyOpen = false;
    order.forEach(([key, label]) => {
      const list = buckets[key];
      if (!list || !list.length) return;
      anyOpen = true;
      html += `<section class="hw-group hw-group-${key}"><div class="hw-group-head"><span class="hw-group-title">${label}</span><span class="hw-group-count">${list.length}</span></div><ul class="hw-card-list">${list.map(renderTaskCard).join('')}${addMethod === 'inline' ? renderInlineComposer(bucketPresetDate(key)) : ''}</ul></section>`;
    });
    if (buckets.done.length) {
      html += `<section class="hw-group hw-group-done"><div class="hw-group-head"><span class="hw-group-title">Done</span><span class="hw-group-count">${buckets.done.length}</span></div><ul class="hw-card-list">${buckets.done.slice(0, 15).map(renderTaskCard).join('')}</ul></section>`;
    }
    if (!anyOpen && !buckets.done.length) {
      html = `${renderEmptyStateRedesign('No assignments yet — add one to get started.')}${addMethod === 'inline' ? renderInlineComposer('') : ''}`;
    }
    return `<div class="hw-smartlist">${html}</div>`;
  }

  function renderUpNext() {
    const open = tasks.filter(t => !t.done).slice().sort(compareHomeworkTasks);
    if (!open.length) return `<div class="hw-upnext">${renderEmptyStateRedesign('No open assignments — nice work.')}</div>`;
    const hero = open[0];
    const rest = open.slice(1, 7);
    const ds = getTaskDueState(hero);
    const course = courses.find(c => String(c.id) === String(hero.courseId));
    const color = getCourseColor(hero.courseId);
    const pct = studioPctOf(hero);
    const heroClass = ds.stateClass === 'is-overdue' ? 'is-overdue' : (ds.stateClass === 'is-soon' ? 'is-soon' : '');
    const startAttr = hero.studio ? `data-studio-open="${escHtml(hero.id)}"` : `data-task-open="${escHtml(hero.id)}"`;
    const timeLabel = ds.dueTimeLabel && ds.dueTimeLabel !== 'No time' ? ` &middot; ${escHtml(ds.dueTimeLabel)}` : '';
    return `
      <div class="hw-upnext">
        <section class="hw-hero ${heroClass}">
          <div class="hw-hero-eyebrow">Up next</div>
          ${course ? `<span class="hw-card-subject" style="background:${color.bg};color:${color.text}">${escHtml(course.name)}</span>` : ''}
          <div class="hw-hero-title" data-task-open="${escHtml(hero.id)}" role="button" tabindex="0">${escHtml(hero.title)}</div>
          <div class="hw-hero-meta">
            <span><i class="fas fa-calendar-day" aria-hidden="true"></i> ${escHtml(ds.dueDateLabel)}${timeLabel}</span>
            <span><i class="fas fa-fire" aria-hidden="true"></i> ${escHtml(normalizeDifficulty(hero.difficulty))}</span>
            <span class="hw-status-chip ${escHtml(ds.stateClass)}">${escHtml(ds.statusText)}</span>
          </div>
          ${pct != null ? `<div class="hw-hero-progress"><div class="hw-hero-progress-track"><div class="hw-hero-progress-bar" style="width:${pct}%"></div></div></div>` : ''}
          <div class="hw-hero-actions">
            <button type="button" class="hw-hero-btn is-primary" ${startAttr}><i class="fas fa-play" aria-hidden="true"></i> Start working</button>
            <button type="button" class="hw-hero-btn" data-task-toggle="${escHtml(hero.id)}"><i class="fas fa-check" aria-hidden="true"></i> Mark done</button>
            <button type="button" class="hw-hero-btn" data-task-snooze="${escHtml(hero.id)}">Snooze 1 day</button>
          </div>
        </section>
        ${rest.length ? `<section class="hw-group"><div class="hw-group-head"><span class="hw-group-title">Also coming up</span><span class="hw-group-count">${rest.length}</span></div><ul class="hw-card-list">${rest.map(renderTaskCard).join('')}</ul></section>` : ''}
      </div>`;
  }

  function renderBoard() {
    const todo = [];
    const inProgress = [];
    const done = [];
    tasks.forEach(task => {
      if (task.done) { done.push(task); return; }
      const pct = studioPctOf(task);
      if (pct != null && pct > 0 && pct < 100) inProgress.push(task);
      else todo.push(task);
    });
    [todo, inProgress, done].forEach(list => list.sort(compareHomeworkTasks));
    const addMethod = getHwAddMethod();
    const column = (dotClass, title, list, extra) => `<div class="hw-board-col"><div class="hw-board-col-head"><span class="hw-board-dot ${dotClass}"></span><span class="hw-board-col-title">${title}</span><span class="hw-board-col-count">${list.length}</span></div><ul class="hw-card-list">${list.map(renderTaskCard).join('')}${extra || ''}</ul></div>`;
    return `<div class="hw-board">
        ${column('is-todo', 'To do', todo, addMethod === 'inline' ? renderInlineComposer('') : '')}
        ${column('is-progress', 'In progress', inProgress, '')}
        ${column('is-done', 'Done', done.slice(0, 15), '')}
      </div>`;
  }

  let timelineWeekOffset = 0;

  function renderTimeline() {
    const today = startOfDay(new Date());
    const monday = new Date(today);
    monday.setDate(monday.getDate() - ((today.getDay() + 6) % 7) + timelineWeekOffset * 7);
    const days = [];
    for (let i = 0; i < 7; i += 1) { const d = new Date(monday); d.setDate(d.getDate() + i); days.push(d); }
    const weekKeys = days.map(formatDateKey);
    const dows = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const todayKey = formatDateKey(today);
    const byDay = {};
    weekKeys.forEach(key => { byDay[key] = []; });
    const leftover = [];
    tasks.filter(t => !t.done).forEach(task => {
      const dd = normalizeDueDate(task.dueDate);
      if (dd && byDay[dd]) byDay[dd].push(task);
      else leftover.push(task);
    });
    const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    const grid = days.map((d, i) => {
      const key = weekKeys[i];
      const isToday = key === todayKey;
      const pills = byDay[key].slice().sort(compareHomeworkTasks).map(task => {
        const color = getCourseColor(task.courseId);
        return `<span class="hw-tl-pill" data-task-open="${escHtml(task.id)}" role="button" tabindex="0" style="background:${color.bg};color:${color.text}" title="${escHtml(task.title)}">${escHtml(task.title)}</span>`;
      }).join('');
      return `<div class="hw-tl-day ${isToday ? 'is-today' : ''}"><div class="hw-tl-dow">${dows[i]}${isToday ? ' &middot; today' : ''}</div><div class="hw-tl-date">${d.getDate()}</div>${pills}</div>`;
    }).join('');
    const leftoverHtml = leftover.length
      ? `<div class="hw-tl-overflow"><span class="hw-group-title">Other open (${leftover.length})</span><ul class="hw-card-list">${leftover.slice().sort(compareHomeworkTasks).map(renderTaskCard).join('')}</ul></div>`
      : '';
    return `<div class="hw-timeline">
        <div class="hw-timeline-head"><div class="hw-group-title">Week of ${escHtml(monthFmt.format(days[0]))} &ndash; ${escHtml(monthFmt.format(days[6]))}</div><div class="hw-timeline-nav"><button type="button" data-timeline-prev aria-label="Previous week"><i class="fas fa-chevron-left" aria-hidden="true"></i></button><button type="button" data-timeline-next aria-label="Next week"><i class="fas fa-chevron-right" aria-hidden="true"></i></button></div></div>
        <div class="hw-timeline-grid">${grid}</div>
        ${leftoverHtml}
      </div>`;
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
    board.querySelectorAll('[data-timeline-prev]').forEach(button => {
      button.addEventListener('click', () => { timelineWeekOffset -= 1; render(); });
    });
    board.querySelectorAll('[data-timeline-next]').forEach(button => {
      button.addEventListener('click', () => { timelineWeekOffset += 1; render(); });
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

    const layout = getHwLayout();
    const addMethod = getHwAddMethod();
    const topAdd = addMethod === 'quick' ? renderQuickAddBar() : '';
    let bodyHtml;
    if (layout === 'upnext') bodyHtml = renderUpNext();
    else if (layout === 'board') bodyHtml = renderBoard();
    else if (layout === 'timeline') bodyHtml = renderTimeline();
    else bodyHtml = renderSmartList();

    board.dataset.hwLayout = layout;
    board.innerHTML = topAdd + bodyHtml;

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

    tasks.push(serializeTask({
      id: uid(),
      courseId,
      title,
      done: false,
      dueDate: normalizeDueDate(payload.dueDate),
      dueTime: normalizeDueTime(payload.dueTime),
      priority: normalizePriority(payload.priority || inferPriorityFromDueDate(payload.dueDate)),
      difficulty: normalizeDifficulty(payload.difficulty || 'medium'),
      recurrence: normalizeRecurrence(payload.recurrence),
      createdAt: new Date().toISOString()
    }));

    save();
    return true;
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
    task.updatedAt = new Date().toISOString();
    save();
    render();
  }

  function stopRecurrence(taskId) {
    const task = tasks.find(row => String(row.id) === String(taskId));
    if (!task) return;
    task.recurrence = 'none';
    task.updatedAt = new Date().toISOString();
    save();
    render();
  }

  function deleteTask(taskId) {
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
      schema: 'noteflow_homework_v3',
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

    // Re-render when the layout / add-method preference changes in Settings.
    window.addEventListener('sutra:homework-prefs', () => {
      if (isHomeworkViewActive()) render();
    });

    // "Customize layout" button in the homework header → Settings → Homework.
    const customizeBtn = $('#hwCustomizeLayoutBtn');
    if (customizeBtn) {
      customizeBtn.addEventListener('click', () => {
        try {
          if (typeof window.setActiveView === 'function') window.setActiveView('settings');
          const nav = document.querySelector('[data-settings-nav="homework"]');
          if (nav) nav.click();
          const section = document.querySelector('[data-settings-section="homework"]');
          if (section && section.scrollIntoView) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (_) { /* no-op */ }
      });
    }

    // Public API for the countdown engine + cross-feature reads.
    window.SutraHomework = window.SutraHomework || {};
    Object.assign(window.SutraHomework, {
      getTasks: () => tasks.map(task => serializeTask(task)),
      getCourses: () => courses.slice(),
      getTaskById: (id) => { const task = getTaskByIdInternal(id); return task ? serializeTask(task) : null; },
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

