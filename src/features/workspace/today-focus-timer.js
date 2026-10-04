/*
 * today-focus-timer.js — visible Today controls for the canonical focus timer.
 *
 * The Notes sidebar and full-screen Focus mode already use the timer bridge in
 * app.js. This controller only renders a Today entry point and sends the same
 * commands, so all three surfaces stay in lockstep and persistence remains
 * owned by the core timer.
 */
(function () {
    'use strict';

    var bound = false;
    var finishAtMs = null;
    var sessionActive = false;
    var dismissed = false;
    var lastSnapshot = { durationSeconds: 25 * 60, remaining: 25 * 60, running: false };
    var pipWindow = null;
    var pipElements = null;
    var pipRefreshTimer = 0;
    var pipLastTaskRefreshAt = 0;
    var pipOpening = false;
    var pipRequestId = 0;

    function formatTime(totalSeconds) {
        var seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
        var hours = Math.floor(seconds / 3600);
        var minutes = Math.floor((seconds % 3600) / 60);
        var remainder = seconds % 60;
        var pad = function (value) { return String(value).padStart(2, '0'); };
        return hours > 0
            ? hours + ':' + pad(minutes) + ':' + pad(remainder)
            : pad(minutes) + ':' + pad(remainder);
    }

    function dispatchTimerCommand(action, seconds) {
        var detail = { action: action, seconds: seconds, result: null };
        try {
            document.dispatchEvent(new CustomEvent('sutra:focus-timer-command', { detail: detail }));
        } catch (error) {
            return null;
        }
        return detail.result;
    }

    function getElements() {
        return {
            card: document.getElementById('todayFocusTimerCard'),
            display: document.getElementById('todayFocusTimerDisplay'),
            status: document.getElementById('todayFocusTimerStatus'),
            finishAt: document.getElementById('todayFocusTimerFinishAt'),
            start: document.getElementById('todayFocusTimerStartBtn'),
            pause: document.getElementById('todayFocusTimerPauseBtn'),
            reset: document.getElementById('todayFocusTimerResetBtn'),
            edit: document.getElementById('todayFocusTimerEditBtn'),
            fullscreen: document.getElementById('todayFocusTimerFullscreenBtn'),
            settings: document.getElementById('todayFocusTimerSettings'),
            hours: document.getElementById('todayFocusTimerHours'),
            minutes: document.getElementById('todayFocusTimerMinutes'),
            seconds: document.getElementById('todayFocusTimerSeconds'),
            apply: document.getElementById('todayFocusTimerApplyBtn')
        };
    }

    function makeTodayPipLauncher() {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'today-focus-timer-secondary';
        button.id = 'todayFocusTimerPipBtn';
        button.setAttribute('aria-label', 'Open the always-on-top Focus miniplayer');
        button.textContent = 'Miniplayer';
        button.addEventListener('click', openFocusMiniPlayer);

        var status = document.createElement('p');
        status.className = 'today-focus-timer-pip-status';
        status.id = 'todayFocusTimerPipStatus';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.hidden = true;
        return { button: button, status: status };
    }

    function syncPipAvailability() {
        var button = document.getElementById('todayFocusTimerPipBtn');
        var status = document.getElementById('todayFocusTimerPipStatus');
        var playerButton = document.querySelector('#sutraFocusMiniPlayer [data-focus-player-action="pip"]');
        var available = window.isSecureContext !== false && !!(window.documentPictureInPicture
            && typeof window.documentPictureInPicture.requestWindow === 'function');
        if (button) {
            button.disabled = !available;
            button.title = available
                ? 'Open an always-on-top Focus window'
                : 'An always-on-top Focus window is unavailable in this browser or page context';
        }
        if (playerButton) {
            playerButton.disabled = !available;
            playerButton.title = available
                ? 'Open an always-on-top Focus window'
                : 'An always-on-top Focus window is unavailable in this browser or page context';
        }
        var playerNotice = document.querySelector('#sutraFocusMiniPlayer [data-focus-pip-notice]');
        if (playerNotice) {
            playerNotice.textContent = available ? '' : 'Always-on-top miniplayer unavailable in this browser or page context.';
            playerNotice.hidden = available;
        }
        if (status && !available) {
            status.textContent = 'Always-on-top Focus miniplayer is unavailable in this browser or page context.';
            status.hidden = false;
        } else if (status && status.textContent === 'Always-on-top Focus miniplayer is unavailable in this browser or page context.') {
            status.textContent = '';
            status.hidden = true;
        }
        return available;
    }

    function setPipStatus(message) {
        var status = document.getElementById('todayFocusTimerPipStatus');
        if (!status) return;
        status.textContent = String(message || '');
        status.hidden = !message;
    }

    function makePlayerButton(action, label, symbol) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'sutra-focus-mini-player__button';
        button.setAttribute('data-focus-player-action', action);
        button.setAttribute('aria-label', label);
        button.title = label;
        var icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = symbol;
        button.appendChild(icon);
        return button;
    }

    function ensureMiniPlayer() {
        var existing = document.getElementById('sutraFocusMiniPlayer');
        if (existing) return existing;

        var player = document.createElement('aside');
        player.id = 'sutraFocusMiniPlayer';
        player.className = 'sutra-focus-mini-player';
        player.hidden = true;
        player.setAttribute('role', 'region');
        player.setAttribute('aria-label', 'Focus timer player');

        var controls = document.createElement('div');
        controls.className = 'sutra-focus-mini-player__controls';

        var copy = document.createElement('div');
        copy.className = 'sutra-focus-mini-player__copy';
        var heading = document.createElement('span');
        heading.className = 'sutra-focus-mini-player__heading';
        heading.textContent = 'Focus';
        var clock = document.createElement('span');
        clock.className = 'sutra-focus-mini-player__time';
        clock.setAttribute('data-focus-player-time', '');
        clock.setAttribute('role', 'timer');
        clock.setAttribute('aria-live', 'off');
        var status = document.createElement('span');
        status.className = 'sutra-focus-mini-player__status';
        status.setAttribute('data-focus-player-status', '');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.setAttribute('aria-atomic', 'true');
        var pipNotice = document.createElement('span');
        pipNotice.className = 'sutra-focus-mini-player__pip-notice';
        pipNotice.setAttribute('data-focus-pip-notice', '');
        pipNotice.hidden = true;
        copy.append(heading, clock, status, pipNotice);

        var actions = document.createElement('div');
        actions.className = 'sutra-focus-mini-player__actions';
        actions.append(
            makePlayerButton('toggle', 'Pause focus timer', 'Ⅱ'),
            makePlayerButton('full-focus', 'Open full Focus', '↗'),
            makePlayerButton('pip', 'Open always-on-top Focus miniplayer', '▣'),
            makePlayerButton('dismiss', 'Hide focus timer player', '×')
        );
        syncPipAvailability();
        controls.append(copy, actions);

        var restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'sutra-focus-mini-player__restore';
        restore.setAttribute('data-focus-player-action', 'restore');
        restore.setAttribute('aria-label', 'Show focus timer player');
        restore.hidden = true;
        player.append(controls, restore);
        document.body.appendChild(player);
        syncPipAvailability();

        player.addEventListener('click', function (event) {
            var button = event.target.closest('[data-focus-player-action]');
            if (!button) return;
            var action = button.getAttribute('data-focus-player-action');
            if (action === 'toggle') {
                var snapshot = dispatchTimerCommand(lastSnapshot.running ? 'pause' : 'start');
                if (snapshot) render(snapshot);
            } else if (action === 'full-focus') {
                openFullFocusSession();
            } else if (action === 'pip') {
                openFocusMiniPlayer();
            } else if (action === 'dismiss') {
                dismissed = true;
                render(lastSnapshot);
                restore.focus();
            } else if (action === 'restore') {
                dismissed = false;
                render(lastSnapshot);
                var toggle = player.querySelector('[data-focus-player-action="toggle"]');
                if (toggle) toggle.focus();
            }
        });
        return player;
    }

    function buildPipElement(tag, className, text) {
        var element = pipWindow.document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function makePipButton(label, action, text) {
        var button = buildPipElement('button', 'sutra-focus-document-pip__button', text);
        button.type = 'button';
        button.setAttribute('data-focus-pip-action', action);
        button.setAttribute('aria-label', label);
        button.addEventListener('click', function () {
            if (action === 'toggle') {
                var snapshot = dispatchTimerCommand(lastSnapshot.running ? 'pause' : 'start');
                if (snapshot) render(snapshot);
            } else if (action === 'return') {
                try { window.focus(); } catch (error) { /* browser may deny focus */ }
                closeFocusMiniPlayer();
            }
        });
        return button;
    }

    function createPipContent(targetWindow) {
        if (isWorkspaceLocked()) {
            try { targetWindow.close(); } catch (error) { /* browser may already be closing it */ }
            return;
        }
        pipWindow = targetWindow;
        var pipDocument = targetWindow.document;
        pipDocument.title = 'Sutra Focus';
        pipDocument.documentElement.lang = document.documentElement.lang || 'en';
        pipDocument.body.className = 'sutra-focus-document-pip-body';

        // Keep the PiP document isolated and use a same-origin stylesheet. No
        // app shell, workspace markup, script, or remote resource is copied.
        var stylesheet = pipDocument.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = getFocusTimerStylesheetHref();
        pipDocument.head.appendChild(stylesheet);

        var panel = buildPipElement('main', 'sutra-focus-document-pip');
        var heading = buildPipElement('div', 'sutra-focus-document-pip__eyebrow', 'SUTRA · FOCUS');
        var clock = buildPipElement('div', 'sutra-focus-document-pip__time', formatTime(lastSnapshot.remaining));
        clock.setAttribute('role', 'timer');
        clock.setAttribute('aria-live', 'off');
        var timerStatus = buildPipElement('p', 'sutra-focus-document-pip__timer-status', lastSnapshot.running ? 'Running' : (sessionActive ? 'Paused' : 'Ready'));
        timerStatus.setAttribute('role', 'status');
        timerStatus.setAttribute('aria-live', 'polite');
        timerStatus.setAttribute('aria-atomic', 'true');

        var controls = buildPipElement('div', 'sutra-focus-document-pip__controls');
        var toggle = makePipButton(lastSnapshot.running ? 'Pause focus timer' : 'Start focus timer', 'toggle', lastSnapshot.running ? 'Ⅱ  Pause' : '▶  Start');
        var returnButton = makePipButton('Return to Sutra and close miniplayer', 'return', 'Return to Sutra');
        controls.append(toggle, returnButton);

        var taskHeading = buildPipElement('h2', 'sutra-focus-document-pip__tasks-heading', 'Upcoming tasks');
        var taskStatus = buildPipElement('p', 'sutra-focus-document-pip__tasks-status', 'Loading tasks…');
        taskStatus.setAttribute('role', 'status');
        taskStatus.setAttribute('aria-live', 'polite');
        taskStatus.setAttribute('aria-atomic', 'true');
        var taskList = buildPipElement('ol', 'sutra-focus-document-pip__tasks');
        taskList.setAttribute('aria-label', 'Upcoming tasks');

        panel.append(heading, clock, timerStatus, controls, taskHeading, taskStatus, taskList);
        pipDocument.body.appendChild(panel);
        pipElements = { clock: clock, timerStatus: timerStatus, toggle: toggle, taskStatus: taskStatus, taskList: taskList };
        setPipStatus('');
        renderPipTimer();
        refreshPipTasks();

        targetWindow.addEventListener('pagehide', function () {
            if (pipWindow !== targetWindow) return;
            pipWindow = null;
            pipElements = null;
            pipOpening = false;
            pipLastTaskRefreshAt = 0;
            if (pipRefreshTimer) window.clearTimeout(pipRefreshTimer);
            pipRefreshTimer = 0;
        }, { once: true });
    }

    function openFocusMiniPlayer() {
        if (pipWindow && !pipWindow.closed) {
            try { pipWindow.focus(); } catch (error) { /* focus is optional */ }
            refreshPipTasks();
            return;
        }
        if (pipOpening) return;
        var api = window.documentPictureInPicture;
        if (window.isSecureContext === false || !api || typeof api.requestWindow !== 'function') {
            syncPipAvailability();
            setPipStatus('Always-on-top Focus miniplayer is unavailable in this browser or page context.');
            return;
        }
        try {
            if (api.window && !api.window.closed) {
                setPipStatus('Close the current picture-in-picture window before opening Focus.');
                return;
            }
        } catch (error) { /* older implementations may omit the current-window property */ }
        // requestWindow must run directly inside this click handler so the
        // browser's transient user activation is still present.
        var opening;
        pipOpening = true;
        var requestId = ++pipRequestId;
        try {
            opening = api.requestWindow({ width: 380, height: 520 });
        } catch (error) {
            pipOpening = false;
            setPipStatus('The browser could not open the always-on-top Focus miniplayer.');
            return;
        }
        Promise.resolve(opening)
            .then(function (targetWindow) {
                if (requestId !== pipRequestId || isWorkspaceLocked()) {
                    try { targetWindow.close(); } catch (error) { /* browser may already be closing it */ }
                    return;
                }
                pipOpening = false;
                createPipContent(targetWindow);
            })
            .catch(function () {
                if (requestId === pipRequestId) pipOpening = false;
                setPipStatus('The browser could not open the always-on-top Focus miniplayer.');
            });
    }

    function closeFocusMiniPlayer() {
        pipRequestId += 1;
        pipOpening = false;
        if (pipRefreshTimer) window.clearTimeout(pipRefreshTimer);
        pipRefreshTimer = 0;
        pipLastTaskRefreshAt = 0;
        var current = pipWindow;
        if (!current || current.closed) {
            pipWindow = null;
            pipElements = null;
            return;
        }
        try { current.close(); } catch (error) { /* browser may already be closing it */ }
    }

    function renderPipTimer() {
        if (!pipElements || !pipWindow || pipWindow.closed) return;
        var remaining = Math.max(0, Math.floor(Number(lastSnapshot.remaining) || 0));
        var running = !!lastSnapshot.running;
        pipElements.clock.textContent = formatTime(remaining);
        pipElements.timerStatus.textContent = running ? 'Running' : (sessionActive ? 'Paused' : (remaining > 0 ? 'Ready' : 'Complete'));
        pipElements.toggle.textContent = running ? 'Ⅱ  Pause' : '▶  ' + (sessionActive ? 'Resume' : 'Start');
        pipElements.toggle.setAttribute('aria-label', running ? 'Pause focus timer' : (sessionActive ? 'Resume focus timer' : 'Start focus timer'));
    }

    function refreshPipTasks() {
        if (!pipElements || !pipWindow || pipWindow.closed) return;
        if (isWorkspaceLocked()) {
            closeFocusMiniPlayer();
            return;
        }
        var bridge = window.flowAtelier;
        var rows = null;
        pipLastTaskRefreshAt = Date.now();
        // Keep task data fresh while the canonical timer is paused too. This
        // uses the same single throttled timeout as change-triggered refreshes;
        // an already-pending refresh is never postponed or duplicated.
        schedulePipTaskRefresh(5000);
        try {
            if (bridge && typeof bridge.getFocusUpcomingTasks === 'function') {
                rows = bridge.getFocusUpcomingTasks(5);
            }
        } catch (error) { rows = null; }
        while (pipElements.taskList.firstChild) pipElements.taskList.removeChild(pipElements.taskList.firstChild);
        if (!Array.isArray(rows)) {
            pipElements.taskStatus.textContent = 'Upcoming tasks are unavailable right now.';
            return;
        }
        rows = rows.slice(0, 5);
        rows.forEach(function (row) {
            if (!row || typeof row !== 'object') return;
            var item = buildPipElement('li', 'sutra-focus-document-pip__task');
            var title = String(row.title || 'Untitled task').trim().slice(0, 120);
            var dueLabel = String(row.dueLabel || '').trim().slice(0, 48);
            item.appendChild(buildPipElement('span', 'sutra-focus-document-pip__task-title', title || 'Untitled task'));
            if (dueLabel) item.appendChild(buildPipElement('span', 'sutra-focus-document-pip__task-due', dueLabel));
            pipElements.taskList.appendChild(item);
        });
        if (pipElements.taskList.childNodes.length) {
            pipElements.taskStatus.textContent = 'Your next ' + pipElements.taskList.childNodes.length + ' task' + (pipElements.taskList.childNodes.length === 1 ? '' : 's') + ' by due date and priority.';
        } else {
            pipElements.taskStatus.textContent = 'No upcoming tasks.';
        }
    }

    function schedulePipTaskRefresh(delay) {
        if (!pipWindow || pipWindow.closed) return;
        // Keep the first pending deadline. Repeated one-second timer updates
        // must not keep moving the task refresh farther into the future.
        if (pipRefreshTimer) return;
        var requestedWait = Math.max(0, Number(delay) || 0);
        var throttleWait = Math.max(0, 5000 - (Date.now() - pipLastTaskRefreshAt));
        var wait = Math.max(requestedWait, throttleWait);
        pipRefreshTimer = window.setTimeout(function () {
            pipRefreshTimer = 0;
            refreshPipTasks();
        }, wait);
    }

    function getFocusTimerStylesheetHref() {
        var expected = new URL('styles/views/today-focus-timer.css', window.location.href);
        var links = document.querySelectorAll('link[rel="stylesheet"][href]');
        for (var index = 0; index < links.length; index += 1) {
            try {
                var candidate = new URL(links[index].href, window.location.href);
                if (candidate.origin === expected.origin && candidate.pathname === expected.pathname) return candidate.href;
            } catch (error) { /* Ignore malformed or cross-origin links. */ }
        }
        return expected.href;
    }

    function closeForWorkspaceLock(event) {
        if (!event || !event.detail || event.detail.locked !== false) closeFocusMiniPlayer();
    }

    function isWorkspaceLocked() {
        return !!(document.documentElement
            && document.documentElement.getAttribute('data-sutra-workspace-locked') === 'true')
            || !!(document.body && document.body.classList.contains('sutra-revocation-locked'));
    }

    function openFullFocusSession() {
        try {
            // The post-load Focus wrapper prompts for a fresh duration. An
            // active/paused player opens its existing clock without that reset.
            var options = lastSnapshot.running || sessionActive
                ? { skipPreflight: true } : { userInitiated: true };
            if (typeof window.startFocusSession === 'function') window.startFocusSession(null, options);
        } catch (error) {
            if (typeof window.SutraReportError === 'function') {
                window.SutraReportError(error, { where: 'today-focus-mini-player:full-focus', feature: 'focus-timer' }, 'warning');
            }
        }
    }

    function keyboardShrankViewport() {
        if (window.innerWidth > 768) return false;
        var viewport = window.visualViewport;
        var active = document.activeElement;
        var editable = active && active.matches
            && active.matches('input, textarea, select, [contenteditable="true"]');
        if (!viewport || !editable || viewport.scale > 1.05) return false;
        return (window.innerHeight - viewport.height) > 120;
    }

    function syncKeyboardVisibility() {
        if (!document.body) return;
        document.body.classList.toggle('sutra-focus-player-keyboard-open', keyboardShrankViewport());
    }

    function classifyMiniPlayerSession(snapshot, previouslyRunning) {
        var remaining = Math.max(0, Math.floor(Number(snapshot && snapshot.remaining) || 0));
        var duration = Math.max(1, Math.floor(Number(snapshot && snapshot.durationSeconds) || 25 * 60));
        var running = !!(snapshot && snapshot.running);
        var completed = remaining === 0 && !running;

        if (running) sessionActive = true;
        else if (remaining >= duration) {
            // Core timer controls can reset/set duration without sending a
            // command through this view, so a settled idle snapshot ends the
            // transient player session. Preserve a commanded pause before the
            // first tick; reset/set-duration commands clear it below.
            if (!previouslyRunning) {
                sessionActive = false;
                dismissed = false;
            }
        } else if (remaining > 0) sessionActive = true;
        if (completed) {
            sessionActive = false;
            dismissed = false;
        }
    }

    function renderMiniPlayer(snapshot) {
        var player = ensureMiniPlayer();
        var remaining = Math.max(0, Math.floor(Number(snapshot && snapshot.remaining) || 0));
        var running = !!(snapshot && snapshot.running);
        var duration = Math.max(1, Math.floor(Number(snapshot && snapshot.durationSeconds) || 25 * 60));
        var visible = remaining > 0 && (running || sessionActive || remaining < duration);
        player.hidden = !visible;
        document.body.classList.toggle('sutra-focus-player-session', visible);
        if (!visible) return;

        var clock = player.querySelector('[data-focus-player-time]');
        var status = player.querySelector('[data-focus-player-status]');
        var toggle = player.querySelector('[data-focus-player-action="toggle"]');
        var controls = player.querySelector('.sutra-focus-mini-player__controls');
        var restore = player.querySelector('[data-focus-player-action="restore"]');
        if (clock) clock.textContent = formatTime(remaining);
        var statusLabel = running ? 'Running' : 'Paused';
        if (status && status.textContent !== statusLabel) status.textContent = statusLabel;
        if (toggle) {
            var label = running ? 'Pause focus timer' : 'Resume focus timer';
            toggle.setAttribute('aria-label', label);
            toggle.title = label;
            var icon = toggle.firstElementChild;
            if (icon) icon.textContent = running ? 'Ⅱ' : '▶';
        }
        if (controls) controls.hidden = dismissed;
        if (restore) {
            restore.hidden = !dismissed;
            restore.textContent = 'Focus · ' + formatTime(remaining) + (running ? ' · Running' : ' · Paused');
            restore.setAttribute('aria-label', 'Show focus timer player');
        }
        syncKeyboardVisibility();
    }

    function syncDurationInputs(snapshot) {
        var elements = getElements();
        var duration = Math.max(1, Math.floor(Number(snapshot && snapshot.durationSeconds) || 25 * 60));
        if (elements.hours) elements.hours.value = Math.floor(duration / 3600);
        if (elements.minutes) elements.minutes.value = Math.floor((duration % 3600) / 60);
        if (elements.seconds) elements.seconds.value = duration % 60;
    }

    function finishLabel() {
        if (!finishAtMs) return '';
        var date = new Date(finishAtMs);
        var hours = date.getHours();
        var minutes = date.getMinutes();
        return 'Finishes at ' + (hours % 12 || 12) + ':' + String(minutes).padStart(2, '0') + (hours >= 12 ? ' PM' : ' AM');
    }

    function render(snapshot, canonicalUpdate) {
        if (!snapshot || typeof snapshot !== 'object') return;
        var elements = getElements();
        var previouslyRunning = !!lastSnapshot.running;

        var duration = Math.max(1, Math.floor(Number(snapshot.durationSeconds) || 25 * 60));
        var remaining = Math.max(0, Math.min(duration, Math.floor(Number(snapshot.remaining) || 0)));
        var running = !!snapshot.running;
        lastSnapshot = { durationSeconds: duration, remaining: remaining, running: running };
        if (canonicalUpdate === true) {
            classifyMiniPlayerSession(lastSnapshot, previouslyRunning);
        }

        if (running && !finishAtMs) finishAtMs = Date.now() + (remaining * 1000);
        if (!running) finishAtMs = null;

        renderMiniPlayer(lastSnapshot);
        renderPipTimer();

        if (!elements.card || !elements.display) return;

        elements.display.textContent = formatTime(remaining);
        elements.card.classList.toggle('is-running', running);
        if (elements.start) elements.start.hidden = running;
        if (elements.pause) elements.pause.hidden = !running;

        if (elements.status) {
            elements.status.textContent = running
                ? 'Stay with this block. You can pause any time.'
                : (remaining < duration ? 'Paused — resume when you are ready.' : 'Ready when you are.');
        }
        if (elements.finishAt) {
            var label = running ? finishLabel() : '';
            elements.finishAt.textContent = label;
            elements.finishAt.hidden = !label;
        }
    }

    function openSettings(open) {
        var elements = getElements();
        if (!elements.settings || !elements.edit) return;
        var next = typeof open === 'boolean' ? open : elements.settings.hidden;
        elements.settings.hidden = !next;
        elements.edit.setAttribute('aria-expanded', next ? 'true' : 'false');
        if (next) syncDurationInputs(lastSnapshot);
    }

    function setDurationFromInputs() {
        var elements = getElements();
        var hours = Math.max(0, Math.floor(Number(elements.hours && elements.hours.value) || 0));
        var minutes = Math.max(0, Math.min(59, Math.floor(Number(elements.minutes && elements.minutes.value) || 0)));
        var seconds = Math.max(0, Math.min(59, Math.floor(Number(elements.seconds && elements.seconds.value) || 0)));
        var total = (hours * 3600) + (minutes * 60) + seconds;
        if (total < 1) {
            if (elements.status) elements.status.textContent = 'Choose a duration of at least one second.';
            if (elements.minutes) elements.minutes.focus();
            return;
        }
        var snapshot = dispatchTimerCommand('set-duration', total);
        if (snapshot) render(snapshot);
        openSettings(true);
        try { if (typeof window.showToast === 'function') window.showToast('Timer updated'); } catch (error) { /* non-critical */ }
    }

    function bind() {
        if (bound) return;
        var elements = getElements();
        bound = true;

        if (elements.start) elements.start.addEventListener('click', function () {
            var snapshot = dispatchTimerCommand('start');
            if (snapshot) render(snapshot);
        });
        if (elements.pause) elements.pause.addEventListener('click', function () {
            var snapshot = dispatchTimerCommand('pause');
            if (snapshot) render(snapshot);
        });
        if (elements.reset) elements.reset.addEventListener('click', function () {
            var snapshot = dispatchTimerCommand('reset');
            if (snapshot) render(snapshot);
        });
        if (elements.edit) elements.edit.addEventListener('click', function () {
            openSettings();
        });
        if (elements.apply) elements.apply.addEventListener('click', setDurationFromInputs);
        if (elements.fullscreen) elements.fullscreen.addEventListener('click', openFullFocusSession);

        if (elements.card) {
            var timerActions = elements.card.querySelector('.today-focus-timer-actions');
            if (timerActions && !document.getElementById('todayFocusTimerPipBtn')) {
                var launcher = makeTodayPipLauncher();
                timerActions.appendChild(launcher.button);
                timerActions.parentNode.insertBefore(launcher.status, timerActions.nextSibling);
            }
            syncPipAvailability();
        }

        if (elements.card) elements.card.querySelectorAll('[data-today-timer-preset]').forEach(function (button) {
            button.addEventListener('click', function () {
                var minutes = Math.max(1, Math.floor(Number(button.getAttribute('data-today-timer-preset')) || 25));
                var snapshot = dispatchTimerCommand('set-duration', minutes * 60);
                if (snapshot) render(snapshot);
                openSettings(true);
            });
        });

        document.addEventListener('sutra:focus-timer-updated', function (event) {
            render(event && event.detail, true);
            schedulePipTaskRefresh(250);
        });

        // Capture pause intent before the core listener changes running state;
        // apply it after the authoritative update, without classifying UI renders.
        document.addEventListener('sutra:focus-timer-command', function (event) {
            var detail = event && event.detail;
            if (!detail || typeof detail !== 'object') return;
            var action = detail.action;
            if (!['start', 'pause', 'reset', 'set-duration'].includes(action)) return;
            var wasRunning = !!lastSnapshot.running;
            Promise.resolve().then(function () {
                if (action === 'start') sessionActive = true;
                else if (action === 'reset' || action === 'set-duration') {
                    sessionActive = false;
                    dismissed = false;
                } else if (action === 'pause' && wasRunning && lastSnapshot.remaining > 0) {
                    sessionActive = true;
                }
                render(lastSnapshot);
            });
        }, true);

        document.addEventListener('focusin', syncKeyboardVisibility);
        document.addEventListener('focusout', function () { window.setTimeout(syncKeyboardVisibility, 0); });

        window.addEventListener('sutra:workspace-remote-commit', function () { schedulePipTaskRefresh(250); });
        window.addEventListener('sutra:schedule-changed', function () { schedulePipTaskRefresh(250); });
        window.addEventListener('homework:updated', function () { schedulePipTaskRefresh(250); });
        window.addEventListener('noteflow:view-changed', function () { schedulePipTaskRefresh(250); });
        window.addEventListener('sutra:workspace-lock-changed', closeForWorkspaceLock);
        window.addEventListener('sutra:note-page-locked', closeFocusMiniPlayer);
        window.addEventListener('pagehide', closeFocusMiniPlayer);
        window.addEventListener('beforeunload', closeFocusMiniPlayer);
        document.addEventListener('sutra:task-completed', function () { schedulePipTaskRefresh(250); });
        document.addEventListener('sutra:homework-prefs', function () { schedulePipTaskRefresh(250); });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) schedulePipTaskRefresh(250); });
        window.addEventListener('storage', function () { schedulePipTaskRefresh(250); });
        window.addEventListener('focus', function () { schedulePipTaskRefresh(250); });

        if (window.MutationObserver && document.documentElement) {
            var lockObserver = new MutationObserver(function () {
                if (isWorkspaceLocked()) {
                    closeFocusMiniPlayer();
                }
            });
            lockObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sutra-workspace-locked', 'class'] });
            if (document.body) lockObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
        window.addEventListener('resize', syncKeyboardVisibility);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', syncKeyboardVisibility);
            window.visualViewport.addEventListener('scroll', syncKeyboardVisibility);
        }

        var initial = dispatchTimerCommand('snapshot');
        if (initial) {
            syncDurationInputs(initial);
            render(initial, true);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
}());
