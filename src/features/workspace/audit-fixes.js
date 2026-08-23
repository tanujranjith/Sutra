/*
 * Audit follow-ups that intentionally live at the shell boundary.
 *
 * The main runtime is a large classic script with closure-owned state. Keep
 * these small UX repairs in a post-load bridge so they can be removed cleanly
 * when the corresponding core seams are extracted.
 */
(function () {
    'use strict';

    var originalSetActiveView = null;
    var originalStartFocusSession = null;
    var historyReady = false;
    var historyBound = false;
    var focusPreflightPending = false;
    var cueUpdating = false;
    var cueTaskId = '';

    function getTasks() {
        try {
            return window.flowAtelier && Array.isArray(window.flowAtelier.tasks)
                ? window.flowAtelier.tasks
                : [];
        } catch (_) { return []; }
    }

    function openTask(id) {
        try {
            if (typeof window.openTaskModal === 'function') window.openTaskModal(id);
            else if (window.flowAtelier && typeof window.flowAtelier.openTaskModal === 'function') window.flowAtelier.openTaskModal(id);
        } catch (_) { /* best effort */ }
    }

    function refreshUndatedTaskCue() {
        var host = document.getElementById('todayDailyBrief');
        if (!host || cueUpdating) return;
        var task = getTasks().find(function (item) {
            return item && !item.completed && item.isActive !== false && !item.dueDate;
        });
        var old = host.querySelector('.audit-undated-task-cue');
        if (!task) {
            if (old) old.remove();
            cueTaskId = '';
            return;
        }
        if (old && cueTaskId === String(task.id)) return;
        if (old) old.remove();
        cueUpdating = true;
        cueTaskId = String(task.id);
        var cue = document.createElement('div');
        cue.className = 'today-brief-nba audit-undated-task-cue tnu-body';
        cue.dataset.taskId = cueTaskId;
        var label = document.createElement('div');
        label.className = 'today-brief-nba-label tnu-eyebrow';
        label.textContent = 'Captured task';
        var title = document.createElement('div');
        title.className = 'today-brief-nba-title tnu-title';
        title.textContent = task.title || 'Untitled';
        var meta = document.createElement('p');
        meta.className = 'tnu-context';
        meta.textContent = 'Saved to Tasks. Add a due date when it matters, or open it to start.';
        var actions = document.createElement('div');
        actions.className = 'today-brief-actions tnu-actions';
        var open = document.createElement('button');
        open.type = 'button';
        open.className = 'neumo-btn tnu-primary';
        open.textContent = 'Open / edit';
        open.addEventListener('click', function () { openTask(task.id); });
        actions.appendChild(open);
        cue.append(label, title, meta, actions);
        host.appendChild(cue);
        cueUpdating = false;
    }

    function installOnboardingExit() {
        var panel = document.getElementById('onboardingMainPanel');
        if (!panel || panel.querySelector('.audit-explore-today')) return;
        var heading = panel.querySelector('#onboardingTitle');
        if (!heading || String(heading.textContent || '').indexOf('Welcome to Sutra') === -1) return;
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'atelier-onboarding-btn ghost audit-explore-today';
        var icon = document.createElement('i');
        icon.className = 'fas fa-sun';
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon, document.createTextNode(' Explore Home first'));
        button.addEventListener('click', function () {
            try {
                if (typeof window.markStudentOnboardingCompleted === 'function') window.markStudentOnboardingCompleted(true);
                if (typeof window.setActiveView === 'function') window.setActiveView('today');
            } catch (_) { /* best effort */ }
        });
        var note = document.createElement('p');
        note.className = 'atelier-onboarding-explore-first-note';
        note.textContent = 'Skip setup for now. You can finish it later from Settings.';
        var wrap = document.createElement('div');
        wrap.className = 'atelier-onboarding-explore-first';
        wrap.append(button, note);
        panel.appendChild(wrap);
    }

    function installHistory() {
        if (historyBound || !window.history || typeof originalSetActiveView !== 'function') return;
        historyBound = true;
        function readView() {
            try {
                var match = String(window.location.hash || '').match(/(?:^#|&)view=([^&]+)/);
                return match ? decodeURIComponent(match[1]) : '';
            } catch (_) { return ''; }
        }
        window.setActiveView = function (view, options) {
            var next = String(view || 'today');
            var opts = options || {};
            if (historyReady && !opts.fromHistory && next !== String(window.flowAtelier && window.flowAtelier.activeView || '')) {
                try {
                    var url = new URL(window.location.href);
                    url.hash = 'view=' + encodeURIComponent(next);
                    window.history.pushState({ ...(window.history.state || {}), sutraView: next }, '', url.href);
                } catch (_) { /* progressive enhancement */ }
            }
            return originalSetActiveView(view, options);
        };
        var initial = readView();
        if (initial && document.getElementById('view-' + initial)) originalSetActiveView(initial, { fromHistory: true, allowDisabled: true });
        try {
            var url = new URL(window.location.href);
            var active = String(window.flowAtelier && window.flowAtelier.activeView || initial || 'today');
            url.hash = 'view=' + encodeURIComponent(active);
            var state = { ...(window.history.state || {}), sutraView: active };
            var alreadyInside = window.history.state && window.history.state.sutraEntry === true;
            window.history.replaceState(state, '', url.href);
            if (!alreadyInside) window.history.pushState({ ...state, sutraEntry: true }, '', url.href);
        } catch (_) { /* progressive enhancement */ }
        historyReady = true;
        window.addEventListener('popstate', function (event) {
            var next = event && event.state && event.state.sutraView || readView() || 'today';
            if (document.getElementById('view-' + next)) originalSetActiveView(next, { fromHistory: true, allowDisabled: true });
        });
    }

    function installFocusPreflight() {
        if (typeof originalStartFocusSession !== 'function') return;
        window.startFocusSession = function (taskId, options) {
            var opts = options || {};
            if (opts.skipPreflight || (!opts.userInitiated && (opts.autostart || opts.plannedDurationSeconds)) || focusPreflightPending) {
                return originalStartFocusSession(taskId, opts);
            }
            focusPreflightPending = true;
            var task = getTasks().find(function (item) { return item && String(item.id) === String(taskId); });
            var fallback = task && Number(task.estimateMinutes) > 0 ? Number(task.estimateMinutes) : 25;
            var prompt = typeof window.showCustomPromptDialog === 'function'
                ? window.showCustomPromptDialog({
                    title: 'Plan your focus session',
                    label: task ? 'Minutes for “' + (task.title || 'this task') + '”' : 'Focus duration in minutes',
                    defaultValue: String(Math.max(5, Math.min(180, Math.round(fallback)))),
                    placeholder: '25',
                    confirmText: 'Open Focus',
                    cancelText: 'Cancel'
                })
                : Promise.resolve(String(fallback));
            Promise.resolve(prompt).then(function (value) {
                if (value === null) return;
                var minutes = Number(String(value).trim());
                if (!Number.isFinite(minutes) || minutes < 5 || minutes > 180) {
                    if (typeof window.showToast === 'function') window.showToast('Choose a focus duration from 5 to 180 minutes.');
                    return;
                }
                originalStartFocusSession(taskId, { ...opts, plannedDurationSeconds: Math.round(minutes) * 60, skipPreflight: true });
            }).finally(function () { focusPreflightPending = false; });
        };
        // Today and several workspace actions call the canonical bridge rather
        // than the window alias. Route that same entry point through the
        // preflight so every user-started session gets the same choice.
        try {
            if (window.flowAtelier && typeof window.flowAtelier.startFocusSession === 'function') {
                window.flowAtelier.startFocusSession = function (taskId, options) {
                    return window.startFocusSession(taskId, options);
                };
            }
        } catch (_) { /* bridge is optional during degraded startup */ }
    }

    function install() {
        originalSetActiveView = window.setActiveView;
        originalStartFocusSession = window.startFocusSession;
        installHistory();
        installFocusPreflight();
        var overlay = document.getElementById('studentOnboardingOverlay');
        var panel = document.getElementById('onboardingMainPanel');
        if (panel) new MutationObserver(installOnboardingExit).observe(panel, { childList: true, subtree: true });
        if (overlay) new MutationObserver(installOnboardingExit).observe(overlay, { attributes: true, childList: true, subtree: true });
        var today = document.getElementById('todayDailyBrief');
        if (today) new MutationObserver(refreshUndatedTaskCue).observe(today, { childList: true, subtree: true });
        installOnboardingExit();
        refreshUndatedTaskCue();
        function applyStartupSoundDefault() {
            var sound = document.querySelector('[data-pref-path="startup.playSound"]');
            var hadExplicitStartupSound = document.documentElement.getAttribute('data-sutra-startup-sound-explicit') === '1';
            if (sound && !hadExplicitStartupSound) {
                sound.checked = false;
                sound.dispatchEvent(new Event('change', { bubbles: true }));
                var save = document.getElementById('settingsApplyBtn') || document.getElementById('settingsApplyBtnTop');
                if (save) save.click();
                if (window.SutraSafeStorage && typeof window.SutraSafeStorage.set === 'function') {
                    window.SutraSafeStorage.set('sutra_startup_sound', '0', { importance: 'optional', label: 'startup sound preference' });
                }
            }
        }
        applyStartupSoundDefault();
        // The legacy settings hydrator can finish after this bridge on a fresh
        // workspace; repeat briefly so its default cannot turn opt-in sound back on.
        [100, 500, 1200].forEach(function (delay) { window.setTimeout(applyStartupSoundDefault, delay); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
}());
