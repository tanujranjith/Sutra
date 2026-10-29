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
    function clearPreview(session) {
        global.clearTimeout(session.previewTimer);
        if (session.previewCleanup) session.previewCleanup();
        session.previewCleanup = null;
    }
    function refreshPreview(session) {
        clearPreview(session);
        if (session.closed || session.stale || !session.hasDraft || !ownerIsCurrent(session) || !session.options.previewDraft) return;
        if (session.options.validateDraft && session.options.validateDraft(session.preview.value)) return;
        try { session.previewCleanup = session.options.previewDraft(session.preview.value); }
        catch (error) { if (global.reportError) global.reportError(error, { feature: 'note-writing-preview' }); }
    }
    function appendTurn(session, role, text) {
        var turn = element('p', 'sutra-inline-ai-turn ' + role, text);
        session.transcript.appendChild(turn);
        turn.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }

    function setPending(session, pending) {
        session.pending = pending;
        session.instruction.disabled = pending || session.stale;
        if (session.sourceInput) session.sourceInput.disabled = pending || session.stale;
        session.generate.disabled = pending || session.stale || !session.instruction.value.trim() || (session.sourceInput && !session.sourceInput.value.trim());
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
    function invalidateSession(session) {
        if (session.closed || session.stale) return;
        clearPreview(session);
        session.stale = true;
        session.requestSequence += 1;
        if (session.controller) session.controller.abort();
        session.controller = null;
        setPending(session, false);
        disableApproval(session);
        setError(session, 'The source note changed. Cancel this review and run the command again.');
        setStatus(session, 'Review paused. Your newer text has not been changed.');
    }

    function removeSessionListeners(session) {
        global.removeEventListener('noteflow:view-changed', session.onViewChanged, true);
        global.removeEventListener('sutra:note-page-loaded', session.onPageLoaded, true);
        global.removeEventListener('sutra:workspace-lock-changed', session.onWorkspaceLock, true);
        global.removeEventListener('sutra:note-page-locked', session.onSourceReset, true);
        global.removeEventListener('sutra:workspace-remote-commit', session.onSourceReset, true);
        global.removeEventListener('pagehide', session.onNavigate, true);
        global.removeEventListener('popstate', session.onNavigate, true);
        global.removeEventListener('hashchange', session.onNavigate, true);
        if (session.panelObserver) session.panelObserver.disconnect();
        if (session.panelCloseButton) session.panelCloseButton.removeEventListener('click', session.onPanelCloseClick, true);
        if (session.backButton) session.backButton.removeEventListener('click', session.onBackClick);
        if (session.cancelRequest) session.cancelRequest.removeEventListener('click', session.onCancelRequest);
        if (session.generate) session.generate.removeEventListener('click', session.onGenerate);
        if (session.instruction) session.instruction.removeEventListener('keydown', session.onInstructionKey);
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
        if (session.restoreFullscreen && (assistantPanelIsVisible(session.panel) || session.fullAssistantView)) {
            session.panel.classList.add('fullscreen');
        }
        if (session.closePanelAfterReview && session.panel.style.display === 'flex') {
            var bridge = global.flowAtelier;
            var toggle = bridge && typeof bridge.toggleChat === 'function' ? bridge.toggleChat : global.toggleChat;
            try { if (typeof toggle === 'function') toggle(); } catch (error) { /* restore the captured closed state below */ }
            // toggleChat may be unavailable while Assistant is being disabled.
            // Restore the exact pre-review hidden state and its shell affordances.
            session.panel.style.display = session.panelDisplayBeforeReview;
            if (session.panelAriaHiddenBeforeReview == null) session.panel.removeAttribute('aria-hidden');
            else session.panel.setAttribute('aria-hidden', session.panelAriaHiddenBeforeReview);
            if (session.launcher) session.launcher.style.display = session.launcherDisplayBeforeReview;
            if (doc.body) doc.body.classList.toggle('assistant-panel-open', session.bodyPanelOpenBeforeReview);
        }
        var focusTarget = session.returnFocus;
        var canRestoreFocus = (assistantPanelIsVisible(session.panel) || session.fullAssistantView) && ownerIsCurrent(session);
        if (canRestoreFocus && focusTarget && focusTarget.isConnected && typeof focusTarget.focus === 'function') {
            try { if (global.getComputedStyle && global.getComputedStyle(focusTarget).display === 'none') return; } catch (error) { /* best-effort visibility check */ }
            try { focusTarget.focus({ preventScroll: true }); } catch (error) { try { focusTarget.focus(); } catch (_) {} }
        }
    }

    function closeSession(session, result) {
        if (!session || session.closed) return;
        clearPreview(session);
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
            invalidateSession(session);
            return;
        }
        var text = session.preview.value;
        if (!text.trim()) {
            setError(session, 'The draft is empty. Add text before applying it.');
            return;
        }
        if (typeof session.options.validateDraft === 'function') {
            var issue = session.options.validateDraft(text);
            if (issue) { setError(session, issue); return; }
        }
        closeSession(session, { action: action, text: text });
    }

    function requestDraft(session) {
        if (session.closed || session.pending || session.stale) return;
        clearPreview(session);
        if (session.sourceInput) {
            session.contextText = session.sourceInput.value;
            if (!session.contextText.trim()) { setError(session, 'Enter the passage you want to change.'); session.sourceInput.focus(); return; }
        }
        var instruction = session.instruction.value;
        if (!instruction.trim()) {
            setError(session, 'Enter an instruction before generating a draft.');
            session.instruction.focus();
            return;
        }
        if (!ownerIsCurrent(session)) {
            invalidateSession(session);
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
        appendTurn(session, 'user', instruction);

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
                invalidateSession(session);
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
            session.replace.hidden = session.options.command;
            session.insert.hidden = false;
            setStatus(session, 'Draft ready. Review the suggestions, then Apply or Cancel.');
            var count = global.SutraAssistantSidebar ? global.SutraAssistantSidebar.diff(session.selectedText || session.contextText, value).length : 0;
            appendTurn(session, 'assistant', count ? count + (count === 1 ? ' suggested change.' : ' suggested changes.') + ' Your note is unchanged until you approve.' : 'The draft is ready for your review.');
            refreshPreview(session);
            if (session.previewWrap.open) session.preview.focus();
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
        var heading = element('h2', 'sutra-inline-ai-title', options.title || 'Note writing help');
        heading.id = 'sutraInlineAiAssistTitle_' + id;
        var backButton = element('button', 'sutra-inline-ai-button sutra-inline-ai-secondary sutra-inline-ai-back', options.command ? 'Cancel' : 'Back to chat');
        backButton.type = 'button';
        header.appendChild(heading);
        header.appendChild(backButton);

        var body = element('div', 'sutra-inline-ai-body');
        var disclosure = element('p', 'sutra-inline-ai-disclosure',
            'Only this passage and your instruction are sent. Review changes before applying.');
        disclosure.title = 'Chat history, other workspace context, and attachments are excluded. Nothing is sent before Generate draft. Your note changes only after Apply.';

        var instructionLabel = element('label', 'sutra-inline-ai-label', 'What should Sutra do?');
        instructionLabel.htmlFor = 'sutraInlineAiInstruction_' + id;
        var instruction = element('textarea', 'sutra-inline-ai-textarea sutra-inline-ai-instruction');
        instruction.id = instructionLabel.htmlFor;
        instruction.rows = 3;
        instruction.maxLength = 2000;
        instruction.value = options.instruction || 'Improve clarity while preserving my meaning.';
        instruction.setAttribute('spellcheck', 'true');

        var contextDetails = element('details', 'sutra-inline-ai-context');
        contextDetails.open = false;
        var contextSummary = element('summary', '', options.scopeLabel || (options.command ? 'Passage to edit — only this text is sent' : 'Note passage included'));
        var sourceInput = options.command ? element('textarea', 'sutra-inline-ai-textarea sutra-inline-ai-source') : null;
        if (sourceInput) {
            sourceInput.rows = 5; sourceInput.maxLength = 8000;
            sourceInput.value = options.contextText || '';
            sourceInput.setAttribute('aria-label', 'Passage to edit');
            sourceInput.placeholder = 'Enter the text you want to change. Your note and chat history are not included.';
        }
        var contextText = sourceInput || element('pre', 'sutra-inline-ai-context-text', options.contextText);
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

        var previewWrap = element('details', 'sutra-inline-ai-preview-wrap');
        previewWrap.hidden = true;
        previewWrap.open = !options.previewDraft;
        previewWrap.appendChild(element('summary', '', 'View or edit full draft'));
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
        body.appendChild(contextDetails);
        if (!options.command) body.appendChild(selectionDetails);
        var transcript = element('div', 'sutra-inline-ai-transcript'); transcript.setAttribute('role', 'log'); transcript.setAttribute('aria-live', 'polite');
        body.appendChild(transcript);
        body.appendChild(status);
        body.appendChild(error);
        body.appendChild(previewWrap);

        var footer = element('footer', 'sutra-inline-ai-footer');
        var cancelRequest = element('button', 'sutra-inline-ai-button sutra-inline-ai-secondary', 'Cancel request');
        cancelRequest.type = 'button';
        cancelRequest.hidden = true;
        var generate = element('button', 'sutra-inline-ai-button sutra-inline-ai-primary', 'Generate draft');
        generate.type = 'button';
        generate.setAttribute('aria-label', 'Generate draft'); generate.title = 'Generate draft';
        // Keep a real text label: inherited font/icon rules must never erase Send.
        generate.textContent = 'Send';
        var replace = element('button', 'sutra-inline-ai-button sutra-inline-ai-primary', 'Replace selected text');
        replace.type = 'button';
        replace.disabled = true;
        replace.hidden = true;
        var insert = element('button', 'sutra-inline-ai-button sutra-inline-ai-secondary', options.command ? 'Apply' : 'Insert at selection');
        insert.type = 'button';
        insert.disabled = true;
        insert.hidden = true;
        footer.appendChild(cancelRequest);
        footer.appendChild(replace);
        footer.appendChild(insert);
        var composer = element('div', 'sutra-inline-ai-composer');
        instructionLabel.classList.add('sutra-inline-ai-instruction-label');
        instruction.rows = 2;
        composer.appendChild(instructionLabel); composer.appendChild(instruction); composer.appendChild(generate);
        footer.appendChild(composer);

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
            sourceInput: sourceInput,
            preview: preview,
            previewWrap: previewWrap,
            status: status,
            error: error,
            transcript: transcript
        };
    }

    function assistantPanelIsVisible(panel) {
        if (!panel || panel.style.display !== 'flex') return false;
        try {
            return !global.getComputedStyle || global.getComputedStyle(panel).display !== 'none';
        } catch (error) { return true; }
    }

    function isFullAssistantView() {
        return !!(doc.body && doc.body.dataset.view === 'assistantview')
            || !!doc.querySelector('#view-assistantview.active');
    }

    function openAssistantPanel(panel, allowFullAssistantReview) {
        var addedReviewMode = allowFullAssistantReview && !panel.classList.contains('sutra-inline-ai-mode');
        if (addedReviewMode) panel.classList.add('sutra-inline-ai-mode');
        if (assistantPanelIsVisible(panel)) return true;
        var bridge = global.flowAtelier;
        var toggle = bridge && typeof bridge.toggleChat === 'function' ? bridge.toggleChat : global.toggleChat;
        if (typeof toggle !== 'function') {
            if (addedReviewMode) panel.classList.remove('sutra-inline-ai-mode');
            return false;
        }
        if (doc.body && doc.body.classList.contains('focus-mode')) {
            if (addedReviewMode) panel.classList.remove('sutra-inline-ai-mode');
            return false;
        }
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
        if (addedReviewMode) panel.classList.remove('sutra-inline-ai-mode');
        return false;
    }

    function open(options) {
        options = options && typeof options === 'object' ? options : {};
        if (currentSession) closeSession(currentSession, null);
        if (typeof options.request !== 'function' || typeof options.isCurrent !== 'function') return Promise.resolve(null);
        if (!doc.body) return Promise.resolve(null);

        var normalized = {
            command: options.command === true,
            title: safeText(options.title).slice(0, 120),
            instruction: safeText(options.instruction).slice(0, 2000),
            contextText: safeText(options.contextText),
            scopeLabel: safeText(options.scopeLabel).slice(0, 240),
            sourcePageId: safeText(options.sourcePageId),
            validateDraft: typeof options.validateDraft === 'function' ? options.validateDraft : null,
            previewDraft: typeof options.previewDraft === 'function' ? options.previewDraft : null,
            selectedText: typeof options.selectedText === 'string' && options.selectedText.length ? options.selectedText : null,
            request: options.request,
            isCurrent: options.isCurrent
        };
        var current;
        try { current = normalized.isCurrent() === true; } catch (error) { current = false; }
        if (!current) return Promise.resolve(null);

        var panel = doc.getElementById('chatbotPanel');
        var fullAssistantView = isFullAssistantView();
        var panelDisplayBeforeReview = panel ? panel.style.display : '';
        var panelWasOpenBeforeReview = panelDisplayBeforeReview === 'flex';
        var panelAriaHiddenBeforeReview = panel ? panel.getAttribute('aria-hidden') : null;
        var launcher = doc.getElementById('chatbotBtn');
        var launcherDisplayBeforeReview = launcher ? launcher.style.display : '';
        var bodyPanelOpenBeforeReview = !!(doc.body && doc.body.classList.contains('assistant-panel-open'));
        if (!panel || !openAssistantPanel(panel, fullAssistantView)) {
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
            sourceInput: ui.sourceInput,
            preview: ui.preview,
            previewWrap: ui.previewWrap,
            status: ui.status,
            error: ui.error,
            transcript: ui.transcript,
            previewCleanup: null,
            previewTimer: null,
            controller: null,
            requestSequence: 0,
            pending: false,
            hasDraft: false,
            stale: false,
            closed: false,
            fullAssistantView: fullAssistantView,
            closePanelAfterReview: fullAssistantView && !panelWasOpenBeforeReview,
            panelDisplayBeforeReview: panelDisplayBeforeReview,
            panelAriaHiddenBeforeReview: panelAriaHiddenBeforeReview,
            launcher: launcher,
            launcherDisplayBeforeReview: launcherDisplayBeforeReview,
            bodyPanelOpenBeforeReview: bodyPanelOpenBeforeReview,
            resolve: null,
            returnFocus: fullAssistantView ? (doc.getElementById('asstInput') || doc.activeElement) : doc.activeElement
        };
        var promise = new Promise(function (resolve) { session.resolve = resolve; });

        session.sourceViewId = (doc.querySelector('#mainContent > .view.active') || {}).id || '';
        session.onViewChanged = function (event) {
            var next = event && event.detail && event.detail.view;
            if (next && 'view-' + next === session.sourceViewId) return;
            closeSession(session, null);
        };
        session.onPageLoaded = function (event) {
            var pageId = event && event.detail && event.detail.pageId;
            if (session.options.sourcePageId && String(pageId) === session.options.sourcePageId) {
                if (!ownerIsCurrent(session)) invalidateSession(session);
                return;
            }
            closeSession(session, null);
        };
        session.onSourceReset = function () { closeSession(session, null); };
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
                event.stopPropagation();
                requestDraft(session);
            }
        };
        session.onInstructionKey = function (event) {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                event.stopPropagation();
                if (!session.generate.disabled) requestDraft(session);
            }
        };
        session.onInput = function (event) {
            if (event.target === session.instruction || event.target === session.sourceInput) {
                clearPreview(session);
                if (session.hasDraft) {
                    session.hasDraft = false;
                    session.preview.value = '';
                    session.previewWrap.hidden = true;
                    session.replace.disabled = true;
                    session.insert.disabled = true;
                    session.replace.hidden = true;
                    session.insert.hidden = true;
                    setStatus(session, 'Passage or instruction changed. Generate a new draft before accepting it.');
                }
                setError(session, '');
                session.generate.disabled = session.pending || session.stale || !session.instruction.value.trim() || (session.sourceInput && !session.sourceInput.value.trim());
            } else if (event.target === session.preview && !session.stale) {
                clearPreview(session);
                session.previewTimer = global.setTimeout(function () { refreshPreview(session); }, 160);
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
        session.instruction.addEventListener('keydown', session.onInstructionKey);
        session.root.addEventListener('input', session.onInput);
        session.replace.addEventListener('click', session.onReplace);
        session.insert.addEventListener('click', session.onInsert);
        if (session.panelCloseButton) session.panelCloseButton.addEventListener('click', session.onPanelCloseClick, true);
        global.addEventListener('noteflow:view-changed', session.onViewChanged, true);
        global.addEventListener('sutra:note-page-loaded', session.onPageLoaded, true);
        global.addEventListener('sutra:workspace-lock-changed', session.onWorkspaceLock, true);
        global.addEventListener('sutra:note-page-locked', session.onSourceReset, true);
        global.addEventListener('sutra:workspace-remote-commit', session.onSourceReset, true);
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
        setPending(session, false);
        if (session.restoreFullscreen) panel.classList.remove('fullscreen');
        panel.classList.add('sutra-inline-ai-mode');
        var header = panel.querySelector('.chatbot-header');
        if (header && header.parentNode === panel) panel.insertBefore(session.root, header.nextSibling);
        else panel.insertBefore(session.root, panel.firstChild);
        global.setTimeout(function () {
            if (!session.closed && ownerIsCurrent(session)) (session.sourceInput && !session.sourceInput.value.trim() ? session.sourceInput : session.instruction).focus();
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
