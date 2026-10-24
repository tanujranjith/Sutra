/* Presentation for the canonical Assistant. No credentials, requests, or durable state. */
(function (global, doc) {
    'use strict';
    if (!global || !doc || global.SutraAssistantSidebar) return;
    var panel, avatar, previewController, previousFocus, wasOpen = false;
    var sequence = 0;

    // Exact UTF-16 offsets; bounded Myers diff keeps small corrections local.
    function diff(before, after) {
        before = String(before || ''); after = String(after || '');
        if (before === after) return [];
        var tokenize = function (text) { return text.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || []; };
        var a = tokenize(before), b = tokenize(after), frontier = new Map([[1, 0]]), trace = [], found = false;
        for (var distance = 0; distance <= Math.min(128, a.length + b.length); distance++) {
            trace.push(new Map(frontier));
            for (var diagonal = -distance; diagonal <= distance; diagonal += 2) {
                var left = frontier.has(diagonal - 1) ? frontier.get(diagonal - 1) : -Infinity;
                var right = frontier.has(diagonal + 1) ? frontier.get(diagonal + 1) : -Infinity;
                var x = diagonal === -distance || (diagonal !== distance && left < right) ? right : left + 1;
                if (!Number.isFinite(x)) x = 0;
                var y = x - diagonal;
                while (x < a.length && y < b.length && a[x] === b[y]) { x++; y++; }
                frontier.set(diagonal, x);
                if (x >= a.length && y >= b.length) { found = true; break; }
            }
            if (found) break;
        }
        if (!found) return [{ from: 0, to: before.length, before: before, after: after }];
        var operations = [], ax = a.length, by = b.length;
        for (var depth = trace.length - 1; depth >= 0; depth--) {
            var prior = trace[depth], k = ax - by;
            var priorLeft = prior.has(k - 1) ? prior.get(k - 1) : -Infinity;
            var priorRight = prior.has(k + 1) ? prior.get(k + 1) : -Infinity;
            var priorK = k === -depth || (k !== depth && priorLeft < priorRight) ? k + 1 : k - 1;
            var px = prior.get(priorK) || 0, py = px - priorK;
            while (ax > px && by > py) { operations.push({ same: a[--ax] }); by--; }
            if (depth === 0) break;
            if (ax === px) operations.push({ insert: b[--by] });
            else operations.push({ remove: a[--ax] });
        }
        var changes = [], offset = 0, change = null;
        operations.reverse().forEach(function (op) {
            if (op.same !== undefined) {
                if (change) { changes.push(change); change = null; }
                offset += op.same.length; return;
            }
            if (!change) change = { from: offset, to: offset, before: '', after: '' };
            if (op.remove !== undefined) { change.before += op.remove; offset += op.remove.length; change.to = offset; }
            if (op.insert !== undefined) change.after += op.insert;
        });
        if (change) changes.push(change);
        return changes;
    }
    function reduced() {
        return doc.body.classList.contains('motion-off') || global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    function createAvatar() {
        if (avatar) return avatar;
        avatar = doc.createElement('div'); avatar.className = 'sutra-editing-presence'; avatar.hidden = true;
        avatar.setAttribute('aria-hidden', 'true');
        var image = doc.createElement('img'); image.src = 'assets/brand/sutra/generated/sutra-assistant-icon-128.png'; image.alt = '';
        var face = doc.createElement('span'); face.className = 'sutra-editing-eyes';
        face.appendChild(doc.createElement('i')); face.appendChild(doc.createElement('i'));
        avatar.appendChild(image); avatar.appendChild(face); doc.body.appendChild(avatar); return avatar;
    }
    function stopPreview() {
        if (previewController) previewController.abort(); previewController = null;
        if (avatar) { avatar.hidden = true; avatar.getAnimations().forEach(function (animation) { animation.cancel(); }); }
    }
    function animateEdits(edits, draw, isCurrent) {
        stopPreview();
        var controller = new AbortController(), id = ++sequence;
        previewController = controller;
        var stillCurrent = function () {
            return !controller.signal.aborted && isCurrent() && panel && panel.style.display === 'flex';
        };
        var delay = function (ms) { return new Promise(function (resolve) { global.setTimeout(resolve, ms); }); };
        (async function () {
            if (reduced() || global.innerWidth <= 900) { if (stillCurrent()) draw(edits.length); return; }
            var mark = createAvatar(), previous = null;
            for (var index = 0; index < Math.min(12, edits.length); index++) {
                if (!stillCurrent()) break;
                var target = draw(index + 1);
                if (!target) continue;
                var rect = target.getClientRects()[0] || target.getBoundingClientRect();
                var line = target.closest('p,h1,h2,h3,h4,h5,h6,li') || target.parentElement;
                var lineRect = line.getBoundingClientRect(), sidebar = panel.getBoundingClientRect();
                if (rect.top < 100 || rect.bottom > global.innerHeight || rect.left > sidebar.left) continue;
                var next = { x: Math.max(4, Math.min(rect.left + rect.width / 2 - 22, sidebar.left - 48)), y: Math.max(72, lineRect.top - 42) };
                mark.hidden = false;
                mark.style.transform = 'translate(' + next.x + 'px,' + next.y + 'px)';
                if (previous) mark.animate([
                    { transform: 'translate(' + previous.x + 'px,' + previous.y + 'px)' },
                    { transform: mark.style.transform }
                ], { duration: 230, easing: 'cubic-bezier(.25,.1,.25,1)' });
                previous = next;
                await delay(320);
                if (!stillCurrent()) break;
            }
            if (stillCurrent()) draw(edits.length);
        })().catch(function (error) {
            if (global.reportError) global.reportError(error, { feature: 'assistant-inline-preview' });
        }).finally(function () {
            if (id === sequence && avatar) avatar.hidden = true;
        });
        return function () { controller.abort(); if (previewController === controller) stopPreview(); };
    }
    function isOpen() { return !!(panel && panel.style.display === 'flex' && !panel.classList.contains('fullscreen') && global.getComputedStyle(panel).display !== 'none'); }
    function sync() {
        if (!panel) return;
        var open = isOpen(), nav = doc.querySelector('.top-nav');
        if (nav) {
            var top = Math.max(0, nav.getBoundingClientRect().bottom) + 'px';
            if (doc.body.style.getPropertyValue('--sutra-assistant-top') !== top) doc.body.style.setProperty('--sutra-assistant-top', top);
        }
        if (doc.body.classList.contains('sutra-assistant-sidebar-open') !== open) doc.body.classList.toggle('sutra-assistant-sidebar-open', open);
        if (!panel.classList.contains('sutra-assistant-sidebar')) panel.classList.add('sutra-assistant-sidebar');
        var launcher = doc.getElementById('chatbotBtn');
        if (launcher && launcher.getAttribute('aria-expanded') !== (open ? 'true' : 'false')) launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (launcher && launcher.getAttribute('aria-controls') !== panel.id) launcher.setAttribute('aria-controls', panel.id);
        if (open && !wasOpen) previousFocus = doc.activeElement;
        if (!open && wasOpen) {
            stopPreview();
            if (previousFocus && previousFocus.isConnected && (panel.contains(doc.activeElement) || doc.activeElement === doc.body)) previousFocus.focus({ preventScroll: true });
        }
        wasOpen = open;
        var context = doc.getElementById('sutraSidebarContext'), title = doc.getElementById('pageTitle');
        if (context) {
            var notes = doc.getElementById('view-notes');
            var hidden = !(notes && notes.classList.contains('active')), label = 'Current note · ' + (title && title.value || 'Untitled');
            if (context.hidden !== hidden) context.hidden = hidden;
            if (context.textContent !== label) context.textContent = label;
        }
    }
    function init() {
        panel = doc.getElementById('chatbotPanel'); if (!panel) return;
        var context = doc.createElement('div'); context.id = 'sutraSidebarContext'; context.className = 'sutra-sidebar-context';
        var header = panel.querySelector('.chatbot-header'); header.after(context);
        new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
        var nav = doc.querySelector('.top-nav'); if (nav) new ResizeObserver(sync).observe(nav);
        global.addEventListener('resize', sync);
        ['noteflow:view-changed', 'sutra:note-page-loaded'].forEach(function (event) { global.addEventListener(event, sync); });
        ['sutra:workspace-lock-changed', 'sutra:note-page-locked', 'sutra:workspace-remote-commit', 'pagehide'].forEach(function (event) { global.addEventListener(event, stopPreview); });
        panel.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape' || event.defaultPrevented || !isOpen()) return;
            if (doc.getElementById('chatSettingsShell') && !doc.getElementById('chatSettingsShell').hidden) return;
            if (global.SutraInlineAIAssist) global.SutraInlineAIAssist.cancel();
            doc.getElementById('chatCloseBtn').click(); event.preventDefault();
        });
        var effort = doc.createElement('button'); effort.type = 'button'; effort.className = 'sutra-sidebar-effort';
        var reasoning = doc.getElementById('chatReasoningSelect'), row = doc.getElementById('chatReasoningRow');
        function syncEffort() {
            effort.hidden = !row || row.hidden;
            effort.textContent = 'Thinking: ' + (reasoning && reasoning.selectedOptions[0] ? reasoning.selectedOptions[0].textContent : 'Auto');
        }
        effort.addEventListener('click', function () {
            var settings = doc.getElementById('chatSettingsShell');
            if (settings.hidden) doc.getElementById('chatSettingsCurrent').click();
            if (reasoning) reasoning.focus();
        });
        var meta = doc.getElementById('chatComposerMeta'); if (meta) meta.appendChild(effort);
        if (reasoning) reasoning.addEventListener('change', syncEffort);
        if (row) new MutationObserver(syncEffort).observe(row, { attributes: true, childList: true, subtree: true });
        syncEffort(); sync();
    }
    global.SutraAssistantSidebar = { diff: diff, animateEdits: animateEdits, stopPreview: stopPreview };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
