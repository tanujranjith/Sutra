/*
 * Contextual writing workspace hosted inside the canonical Sutra Assistant
 * panel. The Notes editor owns context capture, provider request construction,
 * send disclosure, and the final editor transaction.
 *
 * API: window.SutraInlineAIAssist.open({ contextText, selectedText?, request, isCurrent })
 *   request({ instruction, contextText, selectedText, signal }) -> Promise<string>
 *   isCurrent() -> boolean; checked before generation, after response, and approval.
 * Resolves to { action: 'replace'|'insert', text } only after explicit review,
 * or null when dismissed/stale. This UI never writes workspace content.
 */
(function (global, doc) {
    'use strict';

    if (!global || !doc) return;

    var MAX_RESULT_LENGTH = 60000;
    var currentSession = null;
    var nextSessionId = 0;

    function element(tag, className, text) {
        var node = doc.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function safeText(value) {
        return value == null ? '' : String(value);
    }

    function ownerIsCurrent(session) {
        try {
            return typeof session.options.isCurrent === 'function'
                && session.options.isCurrent() === true;
        } catch (error) {
            return false;
        }
    }

    function setError(session, message) {
        session.error.textContent = safeText(message);
        session.error.hidden = !message;
    }

    function setStatus(session, message) {
        session.status.textContent = safeText(message);
    }

    function setPending(session, pending) {
        session.pending = pending;
        session.instruction.disabled = pending || session.stale;
        session.generate.disabled = pending || session.stale || !session.instruction.value.trim();
        session.generate.hidden = pending;
        session.cancelRequest.hidden = !pending;
        session.root.setAttribute('aria-busy', pending ? 'true' : 'false');
    }

    function disableApproval(session) {
        session.replace.disabled = true;
        session.insert.disabled = true;
        session.replace.hidden = true;
        session.insert.hidden = true;
        session.preview.disabled = true;
        session.previewWrap.hidden = true;
    }

    function removeSessionListeners(session) {
        global.removeEventListener('noteflow:view-changed', session.onViewChanged, true);
        global.removeEventListener('sutra:note-page-loaded', session.onPageLoaded, true);
        global.removeEventListener('sutra:workspace-lock-changed', session.onWorkspaceLock, true);
        global.removeEventListener('sutra:note-page-locked', session.onPageLoaded, true);
        global.removeEventListener('sutra:workspace-remote-commit', session.onPageLoaded, true);
        global.removeEventListener('pagehide', session.onNavigate, true);
        global.removeEventListener('popstate', session.onNavigate, true);
        global.removeEventListener('hashchange', session.onNavigate, true);
        if (session.panelObserver) session.panelObserver.disconnect();
        if (session.panelCloseButton) session.panelCloseButton.removeEventListener('click', session.onPanelCloseClick, true);
        if (session.backButton) session.backButton.removeEventListener('click', session.onBackClick);
        if (session.cancelRequest) session.cancelRequest.removeEventListener('click', session.onCancelRequest);
        if (session.generate) session.generate.removeEventListener('click', session.onGenerate);
        if (session.replace) session.replace.removeEventListener('click', session.onReplace);
        if (session.insert) session.insert.removeEventListener('click', session.onInsert);
        if (session.root) {
            session.root.removeEventListener('input', session.onInput);
        }
    }

    function restorePanelMode(session) {
        if (!session.panel) return;
        session.panel.classList.remove('sutra-inline-ai-mode');
        if (session.root && session.root.parentNode) session.root.parentNode.removeChild(session.root);
        if (session.restoreFullscreen && assistantPanelIsVisible(session.panel)) {
            session.panel.classList.add('fullscreen');
        }
        var focusTarget = session.returnFocus;
        var canRestoreFocus = assistantPanelIsVisible(session.panel) && ownerIsCurrent(session);
        if (canRestoreFocus && focusTarget && focusTarget.isConnected && typeof focusTarget.focus === 'function') {
            try { if (global.getComputedStyle && global.getComputedStyle(focusTarget).display === 'none') return; } catch (error) { /* best-effort visibility check */ }
            try { focusTarget.focus({ preventScroll: true }); } catch (error) { try { focusTarget.focus(); } catch (_) {} }
        }
    }

    function closeSession(session, result) {
        if (!session || session.closed) return;
        session.closed = true;
        session.requestSequence += 1;
        if (session.controller && !session.controller.signal.aborted) {
            try { session.controller.abort(); } catch (error) { /* best-effort cancellation */ }
        }
        session.controller = null;
        removeSessionListeners(session);
        restorePanelMode(session);
        if (currentSession === session) currentSession = null;
        session.resolve(result || null);
    }

    function cancelRequest(session) {
        if (!session || session.closed || !session.pending) return;
        session.requestSequence += 1;
        if (session.controller && !session.controller.signal.aborted) {
            try { session.controller.abort(); } catch (error) { /* best-effort cancellation */ }
        }
        session.controller = null;
        setPending(session, false);
        setError(session, 'The request was cancelled. You can edit the instruction and try again.');
        setStatus(session, 'Request cancelled. No note changes were made.');
        session.instruction.focus();
    }

    function applyChoice(session, action) {
        if (session.closed || session.stale || !session.hasDraft) return;
        if (!ownerIsCurrent(session)) {
            closeSession(session, null);
            return;
        }
        var text = session.preview.value;
        if (!text.trim()) {
            setError(session, 'The draft is empty. Add text before applying it.');
            return;
        }
        closeSession(session, { action: action, text: text });
    }

    function requestDraft(session) {
        if (session.closed || session.pending || session.stale) return;
        var instruction = session.instruction.value;
        if (!instruction.trim()) {
            setError(session, 'Enter an instruction before generating a draft.');
            session.instruction.focus();
            return;
        }
        if (!ownerIsCurrent(session)) {
            closeSession(session, null);
            return;
        }

        var controller = new AbortController();
        var sequence = ++session.requestSequence;
        session.controller = controller;
        session.previewWrap.hidden = true;
        session.hasDraft = false;
        session.preview.value = '';
        session.replace.disabled = true;
        session.insert.disabled = true;
        session.replace.hidden = true;
        session.insert.hidden = true;
        setError(session, '');
        setStatus(session, 'Preparing a draft with the configured Assistant provider…');
        setPending(session, true);

        Promise.resolve().then(function () {
            return session.options.request({
                instruction: instruction,
                contextText: session.contextText,
                selectedText: session.selectedText,
                signal: controller.signal
            });
        }).then(function (value) {
            if (session.closed || sequence !== session.requestSequence || controller.signal.aborted) return;
            session.controller = null;
            setPending(session, false);
            if (!ownerIsCurrent(session)) {
                closeSession(session, null);
                return;
            }
            if (typeof value !== 'string') {
                throw new Error('The request did not return plain text. Nothing was applied. Try again.');
            }
            if (!value.trim()) {
                throw new Error('The request returned an empty draft. Nothing was applied. Try again.');
            }
            if (value.length > MAX_RESULT_LENGTH) {
                throw new Error('The draft is too long to review here. Nothing was applied; try a shorter request.');
            }
            session.preview.value = value;
            session.previewWrap.hidden = false;
            session.hasDraft = true;
            session.replace.disabled = !session.selectedText || !session.selectedText.trim();
            session.insert.disabled = false;
            session.replace.hidden = false;
            session.insert.hidden = false;
            setStatus(session, 'Draft ready. Review or edit it, then choose how to use it.');
            session.preview.focus();
        }).catch(function (error) {
            if (session.closed || sequence !== session.requestSequence) return;
            var wasAborted = controller.signal.aborted || (error && error.name === 'AbortError');
            session.controller = null;
            setPending(session, false);
            if (wasAborted) {
                setError(session, 'The request was cancelled. You can edit the instruction and try again.');
                setStatus(session, 'Request cancelled. No note changes were made.');
                return;
            }
            var message = error && error.message ? String(error.message) : 'The AI request failed. Check the connection or provider settings and try again.';
            setError(session, message.slice(0, 1200));
            setStatus(session, 'No changes were made.');
        });
    }

    function makeWorkbench(options) {
        var id = ++nextSessionId;
        var root = element('section', 'sutra-inline-ai-workbench');
        root.id = 'sutraInlineAiAssist_' + id;
        root.setAttribute('role', 'region');
        root.setAttribute('aria-labelledby', 'sutraInlineAiAssistTitle_' + id);
        root.setAttribute('aria-busy', 'false');

        var header = element('header', 'sutra-inline-ai-header');
        var heading = element('h2', 'sutra-inline-ai-title', 'Note writing help');
        heading.id = 'sutraInlineAiAssistTitle_' + id;
        var backButton = element('button', 'sutra-inline-ai-button sutra-inline-ai-secondary sutra-inline-ai-back', 'Back to chat');
        backButton.type = 'button';
        header.appendChild(heading);
        header.appendChild(backButton);

        var body = element('div', 'sutra-inline-ai-body');
        var disclosure = element('p', 'sutra-inline-ai-disclosure',
            'Generate sends the instruction and note text shown here through your configured Sutra Assistant provider. Review its send confirmation before continuing. Nothing is sent until you choose Generate, and your note changes only after you approve a draft.');

        var instructionLabel = element('label', 'sutra-inline-ai-label', 'What should Sutra do?');
        instructionLabel.htmlFor = 'sutraInlineAiInstruction_' + id;
        var instruction = element('textarea', 'sutra-inline-ai-textarea sutra-inline-ai-instruction');
        instruction.id = instructionLabel.htmlFor;
        instruction.rows = 3;
        instruction.maxLength = 2000;
        instruction.value = 'Improve clarity while preserving my meaning.';
        instruction.setAttribute('spellcheck', 'true');

        var contextDetails = element('details', 'sutra-inline-ai-context');
        contextDetails.open = true;
        var contextSummary = element('summary', '', 'Note passage included');
        var contextText = element('pre', 'sutra-inline-ai-context-text', options.contextText);
        contextDetails.appendChild(contextSummary);
        contextDetails.appendChild(contextText);

        var selectionDetails = element('details', 'sutra-inline-ai-context sutra-inline-ai-selection');
        selectionDetails.open = !!options.selectedText;
        var selectionSummary = element('summary', '', options.selectedText ? 'Selected text included' : 'No separate selection');
        var selectionText = element('pre', 'sutra-inline-ai-context-text', options.selectedText || 'The request will receive no separate selected-text value.');
        selectionDetails.appendChild(selectionSummary);
        selectionDetails.appendChild(selectionText);

        var status = element('p', 'sutra-inline-ai-status', 'Ready when you are.');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        var error = element('p', 'sutra-inline-ai-error', '');
        error.setAttribute('role', 'alert');
        error.hidden = true;

        var previewWrap = element('div', 'sutra-inline-ai-preview-wrap');
        previewWrap.hidden = true;
        var previewLabel = element('label', 'sutra-inline-ai-label', 'Assistant draft — edit before accepting');
        previewLabel.htmlFor = 'sutraInlineAiPreview_' + id;
        var preview = element('textarea', 'sutra-inline-ai-textarea sutra-inline-ai-preview');
        preview.id = previewLabel.htmlFor;
        preview.rows = 8;
        preview.maxLength = MAX_RESULT_LENGTH;
        preview.setAttribute('spellcheck', 'true');
        previewWrap.appendChild(previewLabel);
        previewWrap.appendChild(preview);

        body.appendChild(disclosure);
        body.appendChild(instructionLabel);
        body.appendChild(instruction);
        body.appendChild(contextDetails);
        body.appendChild(selectionDetails);
        body.appendChild(status);
        body.appendChild(error);
        body.appendChild(previewWrap);

        var footer = element('footer', 'sutra-inline-ai-footer');
        var cancelRequest = element('button', 'sutra-inline-ai-button sutra-inline-ai-secondary', 'Cancel request');
        cancelRequest.type = 'button';
        cancelRequest.hidden = true;
        var generate = element('button', 'sutra-inline-ai-button sutra-inline-ai-primary', 'Generate draft');
        generate.type = 'button';
        var replace = element('button', 'sutra-inline-ai-button sutra-inline-ai-primary', 'Replace selected text');
        replace.type = 'button';
        replace.disabled = true;
        replace.hidden = true;
        var insert = element('button', 'sutra-inline-ai-button sutra-inline-ai-secondary', 'Insert at selection');
        insert.type = 'button';
        insert.disabled = true;
        insert.hidden = true;
        footer.appendChild(cancelRequest);
        footer.appendChild(generate);
        footer.appendChild(replace);
        footer.appendChild(insert);

        root.appendChild(header);
        root.appendChild(body);
        root.appendChild(footer);
        return {
            root: root,
            backButton: backButton,
            cancelRequest: cancelRequest,
            generate: generate,
            replace: replace,
            insert: insert,
            instruction: instruction,
            preview: preview,
            previewWrap: previewWrap,
            status: status,
            error: error
        };
    }

    function assistantPanelIsVisible(panel) {
        if (!panel || panel.style.display !== 'flex') return false;
        try {
            return !global.getComputedStyle || global.getComputedStyle(panel).display !== 'none';
        } catch (error) { return true; }
    }

    function openAssistantPanel(panel) {
        if (assistantPanelIsVisible(panel)) return true;
        var bridge = global.flowAtelier;
        var toggle = bridge && typeof bridge.toggleChat === 'function' ? bridge.toggleChat : global.toggleChat;
        if (typeof toggle !== 'function') return false;
        if (doc.body && doc.body.classList.contains('focus-mode')) return false;
        var oldDisplay = panel.style.display;
        var oldAriaHidden = panel.getAttribute('aria-hidden');
        var launcher = doc.getElementById('chatbotBtn');
        var oldLauncherDisplay = launcher ? launcher.style.display : '';
        var hadLayoutOpen = !!(doc.body && doc.body.classList.contains('assistant-panel-open'));
        try { toggle(); } catch (error) { /* restore the prior panel state below */ }
        if (assistantPanelIsVisible(panel)) return true;
        panel.style.display = oldDisplay;
        if (oldAriaHidden == null) panel.removeAttribute('aria-hidden');
        else panel.setAttribute('aria-hidden', oldAriaHidden);
        if (launcher) launcher.style.display = oldLauncherDisplay;
        if (doc.body) doc.body.classList.toggle('assistant-panel-open', hadLayoutOpen);
        return false;
    }

    function open(options) {
        options = options && typeof options === 'object' ? options : {};
        if (currentSession) closeSession(currentSession, null);
        if (typeof options.request !== 'function' || typeof options.isCurrent !== 'function') return Promise.resolve(null);
        if (!doc.body) return Promise.resolve(null);

        var normalized = {
            contextText: safeText(options.contextText),
            selectedText: typeof options.selectedText === 'string' && options.selectedText.length ? options.selectedText : null,
            request: options.request,
            isCurrent: options.isCurrent
        };
        var current;
        try { current = normalized.isCurrent() === true; } catch (error) { current = false; }
        if (!current) return Promise.resolve(null);

        var panel = doc.getElementById('chatbotPanel');
        if (!panel || !openAssistantPanel(panel)) {
            try {
                var notify = global.flowAtelier && global.flowAtelier.showToast || global.showToast;
                if (typeof notify === 'function') notify('Sutra Assistant is unavailable right now. Enable it in Settings or leave Focus mode, then try again.');
            } catch (error) { /* best-effort notice */ }
            return Promise.resolve(null);
        }

        var ui = makeWorkbench(normalized);
        var session = {
            options: normalized,
            contextText: normalized.contextText,
            selectedText: normalized.selectedText,
            panel: panel,
            restoreFullscreen: panel.classList.contains('fullscreen'),
            root: ui.root,
            backButton: ui.backButton,
            panelCloseButton: doc.getElementById('chatCloseBtn'),
            cancelRequest: ui.cancelRequest,
            generate: ui.generate,
            replace: ui.replace,
            insert: ui.insert,
            instruction: ui.instruction,
            preview: ui.preview,
            previewWrap: ui.previewWrap,
            status: ui.status,
            error: ui.error,
            controller: null,
            requestSequence: 0,
            pending: false,
            hasDraft: false,
            stale: false,
            closed: false,
            resolve: null,
            returnFocus: doc.activeElement
        };
        var promise = new Promise(function (resolve) { session.resolve = resolve; });

        session.onViewChanged = function () { closeSession(session, null); };
        session.onPageLoaded = function () { closeSession(session, null); };
        session.onWorkspaceLock = function (event) {
            if (!event || !event.detail || event.detail.locked !== false) closeSession(session, null);
        };
        session.onNavigate = function () { closeSession(session, null); };
        session.onPanelCloseClick = function () {
            global.setTimeout(function () {
                if (!session.closed && !assistantPanelIsVisible(session.panel)) closeSession(session, null);
            }, 0);
        };
        session.onBackClick = function (event) {
            if (event.target === session.backButton || session.backButton.contains(event.target)) {
                event.preventDefault();
                closeSession(session, null);
            }
        };
        session.onCancelRequest = function (event) {
            if (event.target === session.cancelRequest || session.cancelRequest.contains(event.target)) {
                event.preventDefault();
                cancelRequest(session);
            }
        };
        session.onGenerate = function (event) {
            if (event.target === session.generate || session.generate.contains(event.target)) {
                event.preventDefault();
                requestDraft(session);
            }
        };
        session.onInput = function (event) {
            if (event.target === session.instruction) {
                if (session.hasDraft) {
                    session.hasDraft = false;
                    session.preview.value = '';
                    session.previewWrap.hidden = true;
                    session.replace.disabled = true;
                    session.insert.disabled = true;
                    session.replace.hidden = true;
                    session.insert.hidden = true;
                    setStatus(session, 'Instruction changed. Generate a new draft before accepting it.');
                }
                setError(session, '');
                session.generate.disabled = session.pending || session.stale || !session.instruction.value.trim();
            } else if (event.target === session.preview && !session.stale) {
                session.replace.disabled = !session.hasDraft || !session.selectedText || !session.selectedText.trim() || !session.preview.value.trim();
                session.insert.disabled = !session.hasDraft || !session.preview.value.trim();
            }
        };
        session.onReplace = function (event) {
            if (event.target === session.replace || session.replace.contains(event.target)) {
                event.preventDefault();
                applyChoice(session, 'replace');
            }
        };
        session.onInsert = function (event) {
            if (event.target === session.insert || session.insert.contains(event.target)) {
                event.preventDefault();
                applyChoice(session, 'insert');
            }
        };

        session.backButton.addEventListener('click', session.onBackClick);
        session.cancelRequest.addEventListener('click', session.onCancelRequest);
        session.generate.addEventListener('click', session.onGenerate);
        session.root.addEventListener('input', session.onInput);
        session.replace.addEventListener('click', session.onReplace);
        session.insert.addEventListener('click', session.onInsert);
        if (session.panelCloseButton) session.panelCloseButton.addEventListener('click', session.onPanelCloseClick, true);
        global.addEventListener('noteflow:view-changed', session.onViewChanged, true);
        global.addEventListener('sutra:note-page-loaded', session.onPageLoaded, true);
        global.addEventListener('sutra:workspace-lock-changed', session.onWorkspaceLock, true);
        global.addEventListener('sutra:note-page-locked', session.onPageLoaded, true);
        global.addEventListener('sutra:workspace-remote-commit', session.onPageLoaded, true);
        global.addEventListener('pagehide', session.onNavigate, true);
        global.addEventListener('popstate', session.onNavigate, true);
        global.addEventListener('hashchange', session.onNavigate, true);

        if (typeof global.MutationObserver === 'function') {
            session.panelObserver = new global.MutationObserver(function () {
                if (!session.closed && !assistantPanelIsVisible(session.panel)) closeSession(session, null);
            });
            session.panelObserver.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
        }

        currentSession = session;
        if (session.restoreFullscreen) panel.classList.remove('fullscreen');
        panel.classList.add('sutra-inline-ai-mode');
        var header = panel.querySelector('.chatbot-header');
        if (header && header.parentNode === panel) panel.insertBefore(session.root, header.nextSibling);
        else panel.insertBefore(session.root, panel.firstChild);
        global.setTimeout(function () {
            if (!session.closed && ownerIsCurrent(session)) session.instruction.focus();
        }, 150);
        return promise;
    }

    function cancel() {
        if (!currentSession) return false;
        closeSession(currentSession, null);
        return true;
    }

    global.SutraInlineAIAssist = { open: open, cancel: cancel };
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
