/*
 * Inline AI review dialog for Notes. The editor owns context capture, request
 * construction/provider disclosure, and the final editor transaction.
 *
 * API: window.SutraInlineAIAssist.open({ contextText, selectedText?, request, isCurrent })
 *   request({ instruction, contextText, selectedText, signal }) -> Promise<string>
 *   isCurrent() -> boolean; checked before generation, after response, and on approval.
 * Resolves to { action: 'replace'|'insert', text } only after an explicit review
 * choice, or null when dismissed/stale. No workspace data is saved here.
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

    function markStale(session, message) {
        if (session.closed) return;
        session.stale = true;
        if (session.controller && !session.controller.signal.aborted) {
            try { session.controller.abort(); } catch (error) { /* best-effort cancellation */ }
        }
        session.controller = null;
        session.requestSequence += 1;
        setPending(session, false);
        session.generate.disabled = true;
        disableApproval(session);
        setError(session, message || 'This note is no longer current or is locked. Nothing was applied. Close this dialog and reopen AI help from the current note.');
        setStatus(session, 'The draft cannot be applied to the current note.');
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
        session.root.removeEventListener('click', session.onBackdropClick);
        session.closeButton.removeEventListener('click', session.onCloseClick);
        session.cancelButton.removeEventListener('click', session.onCloseClick);
        session.cancelRequest.removeEventListener('click', session.onCancelRequest);
        session.generate.removeEventListener('click', session.onGenerate);
        session.instruction.removeEventListener('input', session.onInstructionInput);
        session.preview.removeEventListener('input', session.onPreviewInput);
        session.replace.removeEventListener('click', session.onReplace);
        session.insert.removeEventListener('click', session.onInsert);
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
        session.root.classList.remove('active');
        session.root.setAttribute('aria-hidden', 'true');
        var manager = global.SutraModalManager;
        if (manager && typeof manager.sync === 'function') {
            try { manager.sync(); } catch (error) { /* closing must remain reliable */ }
        }
        if (session.root.parentNode) session.root.parentNode.removeChild(session.root);
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
        setError(session, 'The request was cancelled. You can edit the prompt and try again.');
        setStatus(session, 'Request cancelled.');
    }

    function applyChoice(session, action) {
        if (session.closed || session.stale || !session.hasDraft) return;
        if (!ownerIsCurrent(session)) {
            markStale(session);
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
        setStatus(session, 'Generating a draft…');
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
                markStale(session);
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
                setError(session, 'The request was cancelled. You can edit the prompt and try again.');
                setStatus(session, 'Request cancelled.');
                return;
            }
            var message = error && error.message ? String(error.message) : 'The AI request failed. Check the connection or provider settings and try again.';
            setError(session, message.slice(0, 1200));
            setStatus(session, 'No changes were made.');
        });
    }

    function makeDialog(options) {
        var id = ++nextSessionId;
        var root = element('div', 'modal sutra-inline-ai-modal active');
        root.id = 'sutraInlineAiAssistModal_' + id;
        root.setAttribute('aria-hidden', 'false');
        root.setAttribute('data-sutra-inline-ai-assist', 'true');

        var dialog = element('section', 'modal-content sutra-inline-ai-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'sutraInlineAiAssistTitle_' + id);
        dialog.setAttribute('tabindex', '-1');

        var header = element('header', 'sutra-inline-ai-header');
        var heading = element('h2', 'sutra-inline-ai-title', 'AI writing help');
        heading.id = 'sutraInlineAiAssistTitle_' + id;
        var closeButton = element('button', 'sutra-inline-ai-icon-button', '×');
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', 'Close AI writing help without applying a draft');
        closeButton.setAttribute('data-modal-close', 'true');
        closeButton.title = 'Close';
        header.appendChild(heading);
        header.appendChild(closeButton);

        var body = element('div', 'sutra-inline-ai-body');
        var disclosure = element('p', 'sutra-inline-ai-disclosure', 'Generate sends your instruction and the note text shown here to your configured AI provider. Review any provider send confirmation before continuing. Your note changes only after you approve a draft.');

        var instructionLabel = element('label', 'sutra-inline-ai-label', 'What should the AI do?');
        instructionLabel.htmlFor = 'sutraInlineAiInstruction_' + id;
        var instruction = element('textarea', 'sutra-inline-ai-textarea sutra-inline-ai-instruction');
        instruction.id = instructionLabel.htmlFor;
        instruction.rows = 3;
        instruction.maxLength = 2000;
        instruction.value = 'Improve clarity while preserving my meaning.';
        instruction.setAttribute('data-autofocus', 'true');

        var contextDetails = element('details', 'sutra-inline-ai-context');
        contextDetails.open = true;
        var contextSummary = element('summary', '', 'Text context included');
        var contextText = element('pre', 'sutra-inline-ai-context-text', options.contextText);
        contextDetails.appendChild(contextSummary);
        contextDetails.appendChild(contextText);

        var selectionDetails = element('details', 'sutra-inline-ai-context sutra-inline-ai-selection');
        selectionDetails.open = !!options.selectedText;
        var selectionSummary = element('summary', '', options.selectedText ? 'Selected text included' : 'No separate selection included');
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
        var previewLabel = element('label', 'sutra-inline-ai-label', 'AI draft — edit before accepting');
        previewLabel.htmlFor = 'sutraInlineAiPreview_' + id;
        var preview = element('textarea', 'sutra-inline-ai-textarea sutra-inline-ai-preview');
        preview.id = previewLabel.htmlFor;
        preview.rows = 9;
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
        var cancelButton = element('button', 'sutra-inline-ai-button sutra-inline-ai-secondary', 'Cancel');
        cancelButton.type = 'button';
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
        footer.appendChild(cancelButton);
        footer.appendChild(cancelRequest);
        footer.appendChild(generate);
        footer.appendChild(replace);
        footer.appendChild(insert);

        dialog.appendChild(header);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        root.appendChild(dialog);
        return {
            root: root,
            closeButton: closeButton,
            cancelButton: cancelButton,
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

    function open(options) {
        options = options && typeof options === 'object' ? options : {};
        if (currentSession) closeSession(currentSession, null);
        if (typeof options.request !== 'function' || typeof options.isCurrent !== 'function') return Promise.resolve(null);
        var manager = global.SutraModalManager;
        if (!manager || typeof manager.sync !== 'function' || !doc.body) return Promise.resolve(null);

        var normalized = {
            contextText: safeText(options.contextText),
            selectedText: typeof options.selectedText === 'string' && options.selectedText.length ? options.selectedText : null,
            request: options.request,
            isCurrent: options.isCurrent
        };
        var current;
        try { current = normalized.isCurrent() === true; } catch (error) { current = false; }
        if (!current) return Promise.resolve(null);

        var ui = makeDialog(normalized);
        var session = {
            options: normalized,
            contextText: normalized.contextText,
            selectedText: normalized.selectedText,
            root: ui.root,
            closeButton: ui.closeButton,
            cancelButton: ui.cancelButton,
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
            resolve: null
        };
        var promise = new Promise(function (resolve) { session.resolve = resolve; });

        session.onViewChanged = function () { closeSession(session, null); };
        session.onPageLoaded = function () { closeSession(session, null); };
        session.onWorkspaceLock = function (event) {
            if (!event || !event.detail || event.detail.locked !== false) closeSession(session, null);
        };
        session.onNavigate = function () { closeSession(session, null); };
        session.onBackdropClick = function (event) {
            if (event.target === session.root) closeSession(session, null);
        };
        session.onCloseClick = function (event) { event.preventDefault(); closeSession(session, null); };
        session.onCancelRequest = function (event) { event.preventDefault(); cancelRequest(session); };
        session.onGenerate = function (event) { event.preventDefault(); requestDraft(session); };
        session.onInstructionInput = function () {
            if (session.hasDraft) {
                session.hasDraft = false;
                session.preview.value = '';
                session.previewWrap.hidden = true;
                session.replace.disabled = true;
                session.insert.disabled = true;
                session.replace.hidden = true;
                session.insert.hidden = true;
                setStatus(session, 'Prompt changed. Generate a new draft before accepting it.');
            }
            setError(session, '');
            session.generate.disabled = session.pending || session.stale || !session.instruction.value.trim();
        };
        session.onPreviewInput = function () {
            if (!session.stale) {
                session.replace.disabled = !session.hasDraft || !session.selectedText || !session.selectedText.trim() || !session.preview.value.trim();
                session.insert.disabled = !session.hasDraft || !session.preview.value.trim();
            }
        };
        session.onReplace = function (event) { event.preventDefault(); applyChoice(session, 'replace'); };
        session.onInsert = function (event) { event.preventDefault(); applyChoice(session, 'insert'); };

        session.closeButton.addEventListener('click', session.onCloseClick);
        session.cancelButton.addEventListener('click', session.onCloseClick);
        session.cancelRequest.addEventListener('click', session.onCancelRequest);
        session.generate.addEventListener('click', session.onGenerate);
        session.instruction.addEventListener('input', session.onInstructionInput);
        session.preview.addEventListener('input', session.onPreviewInput);
        session.replace.addEventListener('click', session.onReplace);
        session.insert.addEventListener('click', session.onInsert);
        session.root.addEventListener('click', session.onBackdropClick);
        global.addEventListener('noteflow:view-changed', session.onViewChanged, true);
        global.addEventListener('sutra:note-page-loaded', session.onPageLoaded, true);
        global.addEventListener('sutra:workspace-lock-changed', session.onWorkspaceLock, true);
        global.addEventListener('sutra:note-page-locked', session.onPageLoaded, true);
        global.addEventListener('sutra:workspace-remote-commit', session.onPageLoaded, true);
        global.addEventListener('pagehide', session.onNavigate, true);
        global.addEventListener('popstate', session.onNavigate, true);
        global.addEventListener('hashchange', session.onNavigate, true);

        currentSession = session;
        doc.body.appendChild(session.root);
        try { manager.sync(); } catch (error) {
            closeSession(session, null);
        }
        return promise;
    }

    function cancel() {
        if (!currentSession) return false;
        closeSession(currentSession, null);
        return true;
    }

    global.SutraInlineAIAssist = { open: open, cancel: cancel };
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
