/*
 * Rich link dialogs and anchored link popovers for Notes.
 *
 * This module owns presentation only. Callers apply returned link edits through
 * the active editor's canonical commands; metadata and helper configuration
 * stay in memory for this tab session.
 */
(function () {
    'use strict';

    if (window.SutraRichLinks) return;

    var HELPER_TIMEOUT_MS = 14000;
    var HELPER_MAX_RESPONSE_BYTES = 720 * 1024;
    var HELPER_MAX_IMAGE_BYTES = 512 * 1024;
    var HELPER_MAX_IMAGE_PIXELS = 8000000;
    var HELPER_MAX_IMAGE_DIMENSION = 4096;
    var HELPER_MAX_URL_LENGTH = 2048;
    var sessionHelperPort = null;
    var dialogSequence = 0;
    var activeDialog = null;
    var activePopup = null;
    var activatedAnchor = null;
    var activationClearTimer = null;
    var pendingInlineEdit = null;

    function safeHttpUrl(raw) {
        if (typeof raw !== 'string' || !raw || raw !== raw.trim() || /[\u0000-\u0020\u007f\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/.test(raw)) return null;
        var url;
        try { url = new URL(raw); } catch (error) { return null; }
        if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
        if (window.SutraDOMSafety && typeof window.SutraDOMSafety.isSafeUrl === 'function'
            && !window.SutraDOMSafety.isSafeUrl(url.href, { allowNetwork: true, allowRelative: false })) return null;
        return url;
    }

    function setText(element, value) {
        if (window.SutraDOMSafety && typeof window.SutraDOMSafety.setText === 'function') {
            window.SutraDOMSafety.setText(element, String(value == null ? '' : value));
        } else {
            element.textContent = String(value == null ? '' : value);
        }
    }

    function textElement(tag, className, value) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        if (value != null) setText(element, value);
        return element;
    }

    function plainLabel(value, fallback) {
        var text = String(value || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
        return Array.from(text).slice(0, 500).join('') || fallback;
    }

    function safeAnchor(href, label, className) {
        var url = safeHttpUrl(href);
        if (!url) return null;
        var anchor = document.createElement('a');
        if (className) anchor.className = className;
        anchor.href = url.href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.referrerPolicy = 'no-referrer';
        setText(anchor, plainLabel(label, url.href));
        return anchor;
    }

    function createLinkCard(options, callbacks) {
        var opts = options || {};
        var actionOptions = callbacks || opts;
        var url = safeHttpUrl(opts.href);
        if (!url) return null;

        var label = plainLabel(opts.label, url.href);
        var title = typeof opts.metadataTitle === 'string' ? opts.metadataTitle.trim()
            : (typeof opts.title === 'string' ? opts.title.trim() : '');
        if (title.length > 200) title = Array.from(title).slice(0, 200).join('');
        var thumbnail = safeThumbnailDataUrl(opts.thumbnail);

        var card = document.createElement('section');
        card.className = 'sutra-rich-link-card';
        card.setAttribute('role', 'group');
        card.setAttribute('aria-label', 'Web link: ' + label);

        var text = document.createElement('div');
        text.className = 'sutra-rich-link-card-copy';
        text.appendChild(textElement('h3', 'sutra-rich-link-card-label', label));
        if (title && title !== label) text.appendChild(textElement('p', 'sutra-rich-link-card-title', title));
        text.appendChild(textElement('p', 'sutra-rich-link-card-destination', url.href));
        card.appendChild(text);

        if (thumbnail) {
            var thumbnailImage = document.createElement('img');
            thumbnailImage.className = 'sutra-rich-link-card-thumbnail';
            thumbnailImage.src = thumbnail;
            thumbnailImage.alt = 'Thumbnail for ' + label;
            thumbnailImage.loading = 'lazy';
            thumbnailImage.decoding = 'async';
            thumbnailImage.referrerPolicy = 'no-referrer';
            card.appendChild(thumbnailImage);
        }

        var actions = document.createElement('div');
        actions.className = 'sutra-rich-link-card-actions';
        actions.appendChild(safeAnchor(url.href, 'Open link', 'sutra-rich-link-open'));
        if (typeof actionOptions.onEdit === 'function') {
            var edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'sutra-rich-link-secondary';
            setText(edit, 'Edit link');
            edit.addEventListener('click', function () { actionOptions.onEdit({ href: url.href, label: label, title: title, metadataTitle: title, thumbnail: thumbnail }); });
            actions.appendChild(edit);
        }
        if (typeof actionOptions.onRemove === 'function') {
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'sutra-rich-link-remove';
            setText(remove, 'Remove link');
            remove.addEventListener('click', function () { actionOptions.onRemove({ href: url.href, label: label }); });
            actions.appendChild(remove);
        }
        card.appendChild(actions);
        return card;
    }

    function isWorkspaceLocked() {
        return !!(document.documentElement && document.documentElement.getAttribute('data-sutra-workspace-locked') === 'true');
    }

    function safeCall(predicate) {
        if (typeof predicate === 'boolean') return predicate;
        if (typeof predicate !== 'function') return true;
        try { return predicate() !== false; } catch (error) { return false; }
    }

    function isValidHelperPort(raw) {
        if (!/^\d{1,5}$/.test(String(raw || ''))) return false;
        var port = Number(raw);
        return Number.isInteger(port) && port >= 1024 && port <= 65535;
    }

    function metadataUrl(raw) {
        var url = safeHttpUrl(raw);
        if (!url) return null;
        url.hash = '';
        if (url.href.length > HELPER_MAX_URL_LENGTH) return null;
        return url.href;
    }

    function readUint32BigEndian(bytes, offset) {
        return bytes.charCodeAt(offset) * 0x1000000
            + ((bytes.charCodeAt(offset + 1) << 16) | (bytes.charCodeAt(offset + 2) << 8) | bytes.charCodeAt(offset + 3));
    }

    function readUint32LittleEndian(bytes, offset) {
        return (bytes.charCodeAt(offset) | (bytes.charCodeAt(offset + 1) << 8)
            | (bytes.charCodeAt(offset + 2) << 16) | (bytes.charCodeAt(offset + 3) << 24)) >>> 0;
    }

    function safeImageHost(value) {
        var host = typeof value === 'string' ? value : '';
        return host.length <= 253 && /^(?:[a-z0-9.-]+|\[[a-f0-9:.]+\]|[a-f0-9:]+)$/i.test(host) ? host : '';
    }

    function validImageDimensions(width, height) {
        return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
            && width <= HELPER_MAX_IMAGE_DIMENSION && height <= HELPER_MAX_IMAGE_DIMENSION
            && width * height <= HELPER_MAX_IMAGE_PIXELS;
    }

    function safeThumbnailDataUrl(raw) {
        if (typeof raw !== 'string' || raw.length > Math.ceil(HELPER_MAX_IMAGE_BYTES / 3) * 4 + 32) return null;
        var match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
        if (!match || match[2].length % 4 !== 0 || typeof window.atob !== 'function' || typeof window.btoa !== 'function') return null;
        var bytes;
        try { bytes = window.atob(match[2]); } catch (error) { return null; }
        if (!bytes || bytes.length > HELPER_MAX_IMAGE_BYTES || window.btoa(bytes) !== match[2]) return null;

        var mime = match[1];
        var width = 0;
        var height = 0;
        if (mime === 'image/png') {
            if (bytes.length < 45 || bytes.charCodeAt(0) !== 0x89 || bytes.slice(1, 4) !== 'PNG'
                || bytes.charCodeAt(4) !== 0x0d || bytes.charCodeAt(5) !== 0x0a || bytes.charCodeAt(6) !== 0x1a || bytes.charCodeAt(7) !== 0x0a
                || readUint32BigEndian(bytes, 8) !== 13 || bytes.slice(12, 16) !== 'IHDR'
                || bytes.slice(-8, -4) !== 'IEND' || bytes.slice(-4) !== '\xaeB`\x82') return null;
            width = readUint32BigEndian(bytes, 16);
            height = readUint32BigEndian(bytes, 20);
        } else if (mime === 'image/jpeg') {
            if (bytes.length < 16 || bytes.charCodeAt(0) !== 0xff || bytes.charCodeAt(1) !== 0xd8
                || bytes.charCodeAt(bytes.length - 2) !== 0xff || bytes.charCodeAt(bytes.length - 1) !== 0xd9) return null;
            for (var offset = 2; offset + 9 < bytes.length; offset += 1) {
                if (bytes.charCodeAt(offset) === 0xff && bytes.charCodeAt(offset + 1) === 0xc0) {
                    var segmentLength = (bytes.charCodeAt(offset + 2) << 8) | bytes.charCodeAt(offset + 3);
                    if (segmentLength < 8 || offset + 2 + segmentLength > bytes.length) return null;
                    height = (bytes.charCodeAt(offset + 5) << 8) | bytes.charCodeAt(offset + 6);
                    width = (bytes.charCodeAt(offset + 7) << 8) | bytes.charCodeAt(offset + 8);
                    break;
                }
            }
        } else {
            if (bytes.length < 26 || bytes.slice(0, 4) !== 'RIFF' || bytes.slice(8, 12) !== 'WEBP'
                || readUint32LittleEndian(bytes, 4) !== bytes.length - 8) return null;
            if (bytes.slice(12, 16) === 'VP8X' && readUint32LittleEndian(bytes, 16) === 10) {
                width = 1 + bytes.charCodeAt(24) + (bytes.charCodeAt(25) << 8) + (bytes.charCodeAt(26) << 16);
                height = 1 + bytes.charCodeAt(27) + (bytes.charCodeAt(28) << 8) + (bytes.charCodeAt(29) << 16);
            } else if (bytes.slice(12, 16) === 'VP8 ') {
                if (bytes.charCodeAt(23) !== 0x9d || bytes.charCodeAt(24) !== 0x01 || bytes.charCodeAt(25) !== 0x2a) return null;
                width = ((bytes.charCodeAt(26) | (bytes.charCodeAt(27) << 8)) & 0x3fff);
                height = ((bytes.charCodeAt(28) | (bytes.charCodeAt(29) << 8)) & 0x3fff);
            } else if (bytes.slice(12, 16) === 'VP8L' && bytes.charCodeAt(20) === 0x2f) {
                var b1 = bytes.charCodeAt(21);
                var b2 = bytes.charCodeAt(22);
                var b3 = bytes.charCodeAt(23);
                var b4 = bytes.charCodeAt(24);
                width = 1 + b1 + ((b2 & 0x3f) << 8);
                height = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
            }
        }
        return validImageDimensions(width, height) ? raw : null;
    }

    function imageStatusMessage(status, imageHost, hasThumbnail) {
        if (status === 'fetched' && hasThumbnail) {
            var host = safeImageHost(imageHost) || 'the page image host';
            return 'Title fetched. Thumbnail preview loaded from ' + host + '. It will be included if you choose Save link.';
        }
        if (status === 'not-requested') return 'Title fetched. Thumbnail was not requested.';
        if (status === 'missing') return 'Title fetched. The page did not advertise a thumbnail.';
        if (status === 'blocked') return 'Title fetched. The thumbnail host or one of its redirects was blocked.';
        if (status === 'unsupported') return 'Title fetched. The thumbnail was not a supported, verified image.';
        if (status === 'timeout') return 'Title fetched. The thumbnail request timed out.';
        if (status === 'unavailable') return 'Title fetched. The thumbnail is unavailable.';
        return 'Title fetched. No thumbnail preview was returned.';
    }

    function readBoundedResponse(response, signal) {
        if (!response.body || typeof response.body.getReader !== 'function') {
            return Promise.reject(new Error('The local helper response cannot be read safely.'));
        }
        var reader = response.body.getReader();
        var chunks = [];
        var total = 0;
        function readNext() {
            if (signal.aborted) return Promise.reject(new Error('The metadata request was cancelled.'));
            return reader.read().then(function (result) {
                if (result.done) return new Uint8Array(total);
                total += result.value.byteLength;
                if (total > HELPER_MAX_RESPONSE_BYTES) {
                    try { reader.cancel().catch(function () {}); } catch (error) { /* the limit is already enforced */ }
                    throw new Error('The local helper response was too large.');
                }
                chunks.push(result.value);
                return readNext();
            });
        }
        return readNext().then(function (buffer) {
            var offset = 0;
            chunks.forEach(function (chunk) { buffer.set(chunk, offset); offset += chunk.byteLength; });
            return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        });
    }

    function fetchPageTitle(url, port, includeThumbnail, signal) {
        if (typeof window.fetch !== 'function' || typeof window.AbortController !== 'function') {
            return Promise.reject(new Error('This browser cannot contact the optional local helper safely.'));
        }
        if (signal.aborted) return Promise.reject(new Error('The metadata request was cancelled.'));
        var controller = new window.AbortController();
        var abortFromDialog = function () { controller.abort(); };
        signal.addEventListener('abort', abortFromDialog, { once: true });
        var timedOut = false;
        var timeout = window.setTimeout(function () { timedOut = true; controller.abort(); }, HELPER_TIMEOUT_MS);
        var endpoint = 'http://127.0.0.1:' + port + '/metadata';
        var request;
        try {
            request = window.fetch(endpoint, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                cache: 'no-store',
                redirect: 'error',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url, includeThumbnail: includeThumbnail === true }),
                signal: controller.signal
            });
        } catch (error) { request = Promise.reject(error); }
        return Promise.resolve(request).then(function (response) {
            var contentType = String(response.headers && response.headers.get('content-type') || '').toLowerCase();
            if (!response.ok || !/^application\/json(?:\s*;|$)/.test(contentType)) {
                throw new Error('The local helper did not return metadata. Check that it is running for this app origin.');
            }
            return readBoundedResponse(response, controller.signal);
        }).then(function (raw) {
            var data;
            try { data = JSON.parse(raw); } catch (error) { throw new Error('The local helper returned invalid metadata.'); }
            if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.title !== 'string') {
                throw new Error('The local helper returned invalid metadata.');
            }
            var title = data.title.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
            title = Array.from(title).slice(0, 200).join('');
            if (!title) throw new Error('The page did not provide a readable title.');
            var imageStatuses = ['not-requested', 'missing', 'blocked', 'unsupported', 'timeout', 'unavailable', 'fetched'];
            var imageStatus = imageStatuses.indexOf(data.imageStatus) >= 0 ? data.imageStatus : 'unavailable';
            var thumbnail = includeThumbnail === true && imageStatus === 'fetched' ? safeThumbnailDataUrl(data.thumbnail) : null;
            if (imageStatus === 'fetched' && !thumbnail) imageStatus = 'unsupported';
            var imageHost = safeImageHost(data.imageHost);
            return { title: title, thumbnail: thumbnail, imageStatus: includeThumbnail === true ? imageStatus : 'not-requested', imageHost: imageHost };
        }).catch(function (error) {
            if (timedOut && !signal.aborted) throw new Error('The local helper request timed out. Try again or use your own label.');
            throw error;
        }).finally(function () {
            window.clearTimeout(timeout);
            signal.removeEventListener('abort', abortFromDialog);
        });
    }

    function openLinkDialog(options) {
        var opts = options || {};
        if (isWorkspaceLocked() || !safeCall(opts.isCurrent)) return Promise.resolve(null);
        if (activeDialog && typeof activeDialog.close === 'function') activeDialog.close(false);
        if (activePopup && typeof activePopup.close === 'function') activePopup.close(false);

        var inlineEdit = pendingInlineEdit;
        pendingInlineEdit = null;

        var opener = document.activeElement;
        var initialView = document.body && document.body.dataset ? document.body.dataset.view || '' : '';
        var dialog = document.createElement('dialog');
        var id = ++dialogSequence;
        dialog.className = 'sutra-rich-link-dialog';
        if (inlineEdit) dialog.dataset.inlineEdit = 'true';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', inlineEdit ? 'false' : 'true');
        dialog.setAttribute('aria-labelledby', 'sutraRichLinkTitle' + id);
        dialog.setAttribute('aria-describedby', 'sutraRichLinkDescription' + id);

        var form = document.createElement('form');
        form.className = 'sutra-rich-link-form';
        form.noValidate = true;

        var heading = textElement('h2', 'sutra-rich-link-heading', 'Edit link');
        heading.id = 'sutraRichLinkTitle' + id;
        form.appendChild(heading);
        var description = textElement('p', 'sutra-rich-link-description', 'Choose the words people see and confirm where the link opens.');
        description.hidden = !!inlineEdit;
        description.id = 'sutraRichLinkDescription' + id;
        form.appendChild(description);

        var labelId = 'sutraRichLinkLabel' + id;
        var labelField = document.createElement('input');
        labelField.type = 'text';
        labelField.id = labelId;
        labelField.name = 'label';
        labelField.autocomplete = 'off';
        labelField.maxLength = 500;
        labelField.value = String(opts.label || '');
        var labelWrap = document.createElement('label');
        labelWrap.className = 'sutra-rich-link-field';
        labelWrap.htmlFor = labelId;
        labelWrap.appendChild(textElement('span', '', 'Display text'));
        labelWrap.appendChild(labelField);
        form.appendChild(labelWrap);

        var hrefId = 'sutraRichLinkHref' + id;
        var hrefField = document.createElement('input');
        hrefField.type = 'url';
        hrefField.id = hrefId;
        hrefField.name = 'href';
        hrefField.inputMode = 'url';
        hrefField.autocomplete = 'url';
        hrefField.spellcheck = false;
        hrefField.value = String(opts.href || '');
        var hrefWrap = document.createElement('label');
        hrefWrap.className = 'sutra-rich-link-field';
        hrefWrap.htmlFor = hrefId;
        hrefWrap.appendChild(textElement('span', '', 'Web address'));
        hrefWrap.appendChild(hrefField);
        form.appendChild(hrefWrap);

        var validation = textElement('p', 'sutra-rich-link-validation', '');
        validation.setAttribute('role', 'alert');
        validation.hidden = true;
        form.appendChild(validation);

        var openRow = document.createElement('div');
        openRow.className = 'sutra-rich-link-dialog-open-row';
        openRow.hidden = !!inlineEdit;
        var openAnchor = safeAnchor(hrefField.value, 'Open link', 'sutra-rich-link-open');
        if (!openAnchor) {
            openAnchor = textElement('a', 'sutra-rich-link-open', 'Open link');
            openAnchor.hidden = true;
        }
        openRow.appendChild(openAnchor);
        form.appendChild(openRow);

        var metadata = document.createElement('details');
        metadata.className = 'sutra-rich-link-metadata';
        metadata.hidden = !!inlineEdit;
        var summary = textElement('summary', '', 'Get page title using the optional local helper');
        metadata.appendChild(summary);
        metadata.appendChild(textElement('p', 'sutra-rich-link-metadata-intro', 'Title lookup is off until you choose Fetch title. Enter the port shown when you start the helper (1024–65535). The port is remembered only in this tab. The helper may follow up to three public redirects from the address shown below; Sutra does not contact a page service on its own.'));

        var portId = 'sutraRichLinkHelperPort' + id;
        var portField = document.createElement('input');
        portField.type = 'text';
        portField.inputMode = 'numeric';
        portField.autocomplete = 'off';
        portField.pattern = '[0-9]*';
        portField.maxLength = 5;
        portField.id = portId;
        portField.value = sessionHelperPort ? String(sessionHelperPort) : '';
        portField.placeholder = '5280';
        var portLabel = document.createElement('label');
        portLabel.className = 'sutra-rich-link-field sutra-rich-link-port-field';
        portLabel.htmlFor = portId;
        portLabel.appendChild(textElement('span', '', 'Local helper port (1024–65535)'));
        portLabel.appendChild(portField);
        metadata.appendChild(portLabel);

        var thumbnailId = 'sutraRichLinkIncludeThumbnail' + id;
        var thumbnailField = document.createElement('input');
        thumbnailField.type = 'checkbox';
        thumbnailField.id = thumbnailId;
        thumbnailField.name = 'includeThumbnail';
        thumbnailField.checked = false;
        var thumbnailNote = textElement('p', 'sutra-rich-link-thumbnail-note', 'When selected, the helper may request the page\'s advertised public HTTPS image host, including redirects. Only a verified PNG, JPEG, or WebP thumbnail up to 512 KiB is previewed.');
        thumbnailNote.id = 'sutraRichLinkThumbnailNote' + id;
        thumbnailField.setAttribute('aria-describedby', thumbnailNote.id);
        var thumbnailLabel = document.createElement('label');
        thumbnailLabel.className = 'sutra-rich-link-thumbnail-option';
        thumbnailLabel.htmlFor = thumbnailId;
        thumbnailLabel.appendChild(thumbnailField);
        thumbnailLabel.appendChild(textElement('span', '', 'Include thumbnail in this lookup'));
        metadata.appendChild(thumbnailLabel);

        var disclosure = textElement('p', 'sutra-rich-link-disclosure', '');
        disclosure.id = 'sutraRichLinkDisclosure' + id;
        disclosure.setAttribute('aria-live', 'polite');
        metadata.appendChild(disclosure);
        var fetchButton = document.createElement('button');
        fetchButton.type = 'button';
        fetchButton.className = 'sutra-rich-link-fetch';
        fetchButton.setAttribute('aria-describedby', disclosure.id);
        setText(fetchButton, 'Fetch title');
        metadata.appendChild(fetchButton);

        var metadataStatus = textElement('p', 'sutra-rich-link-metadata-status', '');
        metadataStatus.setAttribute('role', 'status');
        metadataStatus.setAttribute('aria-live', 'polite');
        metadata.appendChild(metadataStatus);
        var useTitleButton = document.createElement('button');
        useTitleButton.type = 'button';
        useTitleButton.className = 'sutra-rich-link-use-title';
        useTitleButton.hidden = true;
        setText(useTitleButton, 'Use page title as display text');
        metadata.appendChild(useTitleButton);
        var thumbnailPreview = document.createElement('figure');
        thumbnailPreview.className = 'sutra-rich-link-thumbnail-preview';
        thumbnailPreview.hidden = true;
        var thumbnailImage = document.createElement('img');
        thumbnailImage.alt = 'Temporary page thumbnail preview';
        thumbnailImage.loading = 'lazy';
        thumbnailImage.decoding = 'async';
        thumbnailImage.referrerPolicy = 'no-referrer';
        thumbnailPreview.appendChild(thumbnailImage);
        thumbnailPreview.appendChild(textElement('figcaption', '', 'This image will be included in the link if you choose Save link.'));
        metadata.appendChild(thumbnailPreview);
        metadata.appendChild(thumbnailNote);
        form.appendChild(metadata);

        var actions = document.createElement('div');
        actions.className = 'sutra-rich-link-dialog-actions';
        var cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.setAttribute('data-modal-close', 'true');
        cancelButton.className = 'sutra-rich-link-secondary';
        setText(cancelButton, 'Cancel');
        var saveButton = document.createElement('button');
        saveButton.type = 'submit';
        saveButton.className = 'sutra-rich-link-save';
        setText(saveButton, inlineEdit ? 'Apply' : 'Save link');
        actions.appendChild(cancelButton);
        actions.appendChild(saveButton);
        form.appendChild(actions);
        dialog.appendChild(form);

        var done = false;
        var pendingFetch = null;
        var metadataTitle = plainLabel(opts.metadataTitle || opts.title, '');
        var metadataForHref = metadataTitle || safeThumbnailDataUrl(opts.thumbnail) ? metadataUrl(opts.href) : '';
        var metadataThumbnail = safeThumbnailDataUrl(opts.thumbnail) || '';
        var usingNativeDialog = typeof dialog.showModal === 'function';
        var fallbackKeydown = null;
        var resultPromise;
        var resolveResult;

        function updatePosition() {
            if (!inlineEdit || !inlineEdit.anchor || !inlineEdit.anchor.isConnected) {
                if (inlineEdit) close(null, false);
                return;
            }
            positionPopover(dialog, inlineEdit.anchor);
        }

        function onOutsidePointer(event) {
            if (!dialog.contains(event.target) && !inlineEdit.anchor.contains(event.target)) close(null, false);
        }
        function onFocusOut() {
            window.setTimeout(function () {
                if (!done && !dialog.contains(document.activeElement)) close(null, false);
            }, 0);
        }

        function contextIsCurrent() {
            if (isWorkspaceLocked() || !safeCall(opts.isCurrent)) return false;
            var currentView = document.body && document.body.dataset ? document.body.dataset.view || '' : '';
            if (initialView && currentView !== initialView) return false;
            return true;
        }

        function showStatus(message, isError) {
            metadataStatus.classList.toggle('is-error', !!isError);
            setText(metadataStatus, message || '');
        }

        function close(result, restoreFocus) {
            if (done) return;
            done = true;
            if (pendingFetch && pendingFetch.abort) pendingFetch.abort();
            window.removeEventListener('noteflow:view-changed', onViewChanged);
            window.removeEventListener('sutra:note-page-loaded', onNotePageLoaded);
            window.removeEventListener('sutra:workspace-lock-changed', onWorkspaceLock);
            window.removeEventListener('sutra:note-page-locked', onNotePageLoaded);
            window.removeEventListener('sutra:workspace-remote-commit', onNotePageLoaded);
            window.removeEventListener('pagehide', onPageHide);
            window.removeEventListener('popstate', onNavigate);
            window.removeEventListener('hashchange', onNavigate);
            if (inlineEdit) {
                document.removeEventListener('pointerdown', onOutsidePointer, true);
                document.removeEventListener('scroll', updatePosition, true);
                window.removeEventListener('resize', updatePosition);
                dialog.removeEventListener('focusout', onFocusOut);
            }
            if (fallbackKeydown) dialog.removeEventListener('keydown', fallbackKeydown);
            cancelButton.removeEventListener('click', onCancel);
            form.removeEventListener('submit', onSubmit);
            dialog.removeEventListener('cancel', onCancelEvent);
            dialog.removeEventListener('click', onBackdropClick);
            hrefField.removeEventListener('input', onHrefInput);
            labelField.removeEventListener('input', updateValidity);
            portField.removeEventListener('input', onPortInput);
            thumbnailField.removeEventListener('change', onThumbnailChoice);
            fetchButton.removeEventListener('click', onFetchTitle);
            useTitleButton.removeEventListener('click', onUseTitle);
            if (usingNativeDialog && dialog.open) {
                try { dialog.close(); } catch (error) { /* already removed */ }
            } else {
                dialog.removeAttribute('open');
            }
            dialog.remove();
            if (!inlineEdit && window.SutraModalManager) window.SutraModalManager.sync();
            if (!inlineEdit) document.body.classList.remove('sutra-rich-link-open');
            if (activeDialog && activeDialog.close === activeClose) activeDialog = null;
            var focusTarget = inlineEdit && inlineEdit.anchorContainer && inlineEdit.anchorContainer.isConnected
                ? (inlineEdit.anchor.isConnected ? inlineEdit.anchor : inlineEdit.anchorContainer.querySelector('a')) : opener;
            if (restoreFocus && contextIsCurrent() && focusTarget && focusTarget.isConnected && typeof focusTarget.focus === 'function') {
                try { focusTarget.focus({ preventScroll: true }); } catch (error) { try { focusTarget.focus(); } catch (ignored) {} }
            }
            if (resolveResult) resolveResult(result);
        }

        function activeClose(restoreFocus) { close(null, restoreFocus === true); }

        function onCancel() { close(null, true); }
        function onCancelEvent(event) {
            event.preventDefault();
            close(null, true);
        }
        function onBackdropClick(event) {
            if (event.target === dialog) close(null, true);
        }
        function onViewChanged(event) {
            var nextView = event && event.detail ? event.detail.view : '';
            if (nextView !== 'notes') close(null, false);
        }
        function onNotePageLoaded() { close(null, false); }
        function onWorkspaceLock(event) {
            if (!event || !event.detail || event.detail.locked !== false) close(null, false);
        }
        function onPageHide() { close(null, false); }
        function onNavigate() { close(null, false); }

        function updateDisclosure() {
            var destination = metadataUrl(hrefField.value);
            var validPort = isValidHelperPort(portField.value);
            disclosure.textContent = destination
                ? 'Sends ' + destination + ' to http://127.0.0.1:' + (validPort ? String(Number(portField.value)) : '[port]') + '/metadata. The helper requests that page and returns title text.'
                    + (thumbnailField.checked ? ' It may also request the public HTTPS image host advertised by that page, following up to three validated redirects.' : ' It will not request a page image unless you check Include thumbnail before fetching.')
                : 'Enter a valid HTTP or HTTPS address under 2,048 characters to enable title lookup.';
            fetchButton.disabled = !destination || !validPort || !!pendingFetch;
            if (!validPort) portField.setAttribute('aria-invalid', 'true');
            else portField.removeAttribute('aria-invalid');
        }

        function updateValidity() {
            var url = safeHttpUrl(hrefField.value);
            var label = String(labelField.value || '').trim();
            var message = '';
            if (!url) message = 'Enter a full HTTP or HTTPS address without credentials.';
            else if (!label) message = 'Add display text so the link is clear and accessible.';
            validation.hidden = !message;
            setText(validation, message);
            saveButton.disabled = !!message;
            if (url) {
                hrefField.removeAttribute('aria-invalid');
                openAnchor.href = url.href;
                openAnchor.target = '_blank';
                openAnchor.rel = 'noopener noreferrer';
                openAnchor.referrerPolicy = 'no-referrer';
                openAnchor.hidden = false;
                openAnchor.removeAttribute('aria-disabled');
            } else {
                if (hrefField.value) hrefField.setAttribute('aria-invalid', 'true');
                else hrefField.removeAttribute('aria-invalid');
                openAnchor.removeAttribute('href');
                openAnchor.setAttribute('aria-disabled', 'true');
                openAnchor.hidden = true;
            }
            if (String(labelField.value || '').trim()) labelField.removeAttribute('aria-invalid');
            else labelField.setAttribute('aria-invalid', 'true');
            updateDisclosure();
        }

        function abortPendingFetch() {
            if (pendingFetch && pendingFetch.abort) pendingFetch.abort();
            pendingFetch = null;
        }

        function onHrefInput() {
            abortPendingFetch();
            metadataTitle = '';
            metadataForHref = '';
            metadataThumbnail = '';
            thumbnailImage.removeAttribute('src');
            thumbnailPreview.hidden = true;
            useTitleButton.hidden = true;
            showStatus('', false);
            updateValidity();
        }

        function onThumbnailChoice() {
            var cancelled = !!pendingFetch;
            abortPendingFetch();
            metadataTitle = '';
            metadataForHref = '';
            metadataThumbnail = '';
            thumbnailImage.removeAttribute('src');
            thumbnailPreview.hidden = true;
            useTitleButton.hidden = true;
            showStatus(cancelled ? 'Request cancelled because the thumbnail choice changed. Fetch again to update the result.' : 'Thumbnail choice changed. Fetch again to update the result.', false);
            updateDisclosure();
        }

        function onPortInput() {
            var cancelled = !!pendingFetch;
            abortPendingFetch();
            if (cancelled) showStatus('Request cancelled because the helper port changed.', false);
            updateDisclosure();
        }

        function onFetchTitle() {
            if (!contextIsCurrent()) { close(null, false); return; }
            var requestedUrl = metadataUrl(hrefField.value);
            if (!requestedUrl || !isValidHelperPort(portField.value) || pendingFetch) {
                updateDisclosure();
                return;
            }
            if (typeof window.AbortController !== 'function' || typeof window.fetch !== 'function') {
                showStatus('This browser cannot contact the optional local helper safely.', true);
                return;
            }
            var port = Number(portField.value);
            var requestedLabel = String(labelField.value || '').trim();
            var mayUsePageTitle = !requestedLabel || requestedLabel === requestedUrl || requestedLabel === String(hrefField.value || '').trim();
            sessionHelperPort = port;
            var fetchController = new window.AbortController();
            pendingFetch = fetchController;
            fetchButton.disabled = true;
            useTitleButton.hidden = true;
            metadataThumbnail = '';
            thumbnailImage.removeAttribute('src');
            thumbnailPreview.hidden = true;
            showStatus(thumbnailField.checked
                ? 'Requesting the title and optional thumbnail from the local helper…'
                : 'Requesting the title from the local helper…', false);
            fetchPageTitle(requestedUrl, port, thumbnailField.checked, fetchController.signal).then(function (result) {
                if (done || fetchController.signal.aborted || !contextIsCurrent()) {
                    if (!done) close(null, false);
                    return;
                }
                if (metadataUrl(hrefField.value) !== requestedUrl) return;
                metadataTitle = result.title;
                metadataForHref = requestedUrl;
                metadataThumbnail = result.thumbnail || '';
                if (mayUsePageTitle && String(labelField.value || '').trim() === requestedLabel) {
                    labelField.value = result.title;
                    updateValidity();
                }
                if (metadataThumbnail) {
                    thumbnailImage.src = metadataThumbnail;
                    thumbnailImage.alt = 'Temporary thumbnail preview from ' + (result.imageHost || 'the page');
                    thumbnailPreview.hidden = false;
                }
                var thumbnailMessage = imageStatusMessage(result.imageStatus, result.imageHost, !!metadataThumbnail).replace(/^Title fetched\.\s*/, '');
                showStatus('Page title: “' + result.title + '”. ' + thumbnailMessage, false);
                useTitleButton.hidden = false;
            }).catch(function (error) {
                if (done || fetchController.signal.aborted) return;
                showStatus(error && error.name === 'AbortError'
                    ? 'The local helper request timed out or was cancelled.'
                    : (error && error.message ? error.message : 'The local helper is unavailable.'), true);
            }).finally(function () {
                if (pendingFetch === fetchController) pendingFetch = null;
                if (!done) updateDisclosure();
            });
        }

        function onUseTitle() {
            if (!metadataTitle || !metadataForHref || metadataForHref !== metadataUrl(hrefField.value)) return;
            labelField.value = metadataTitle;
            updateValidity();
            labelField.focus();
        }

        function onSubmit(event) {
            event.preventDefault();
            if (!contextIsCurrent()) { close(null, false); return; }
            var url = safeHttpUrl(hrefField.value);
            var label = String(labelField.value || '').trim();
            if (!url || !label) { updateValidity(); return; }
            var result = { href: url.href, label: label };
            if (metadataForHref === metadataUrl(url.href)) {
                if (metadataTitle) result.metadataTitle = metadataTitle;
                if (metadataThumbnail) result.thumbnail = metadataThumbnail;
            }
            close(result, true);
        }

        cancelButton.addEventListener('click', onCancel);
        form.addEventListener('submit', onSubmit);
        dialog.addEventListener('cancel', onCancelEvent);
        dialog.addEventListener('click', onBackdropClick);
        hrefField.addEventListener('input', onHrefInput);
        labelField.addEventListener('input', updateValidity);
        portField.addEventListener('input', onPortInput);
        thumbnailField.addEventListener('change', onThumbnailChoice);
        fetchButton.addEventListener('click', onFetchTitle);
        useTitleButton.addEventListener('click', onUseTitle);

        if (inlineEdit) {
            dialog.tabIndex = -1;
            if (!usingNativeDialog) dialog.setAttribute('open', '');
            fallbackKeydown = function (event) {
                if (event.key === 'Escape') { event.preventDefault(); close(null, true); }
            };
            dialog.addEventListener('keydown', fallbackKeydown);
        } else if (!usingNativeDialog) {
            dialog.setAttribute('aria-modal', 'true');
            dialog.dataset.fallbackModal = 'true';
            dialog.tabIndex = -1;
            dialog.setAttribute('open', '');
            fallbackKeydown = function (event) {
                if (event.key === 'Escape') { event.preventDefault(); close(null, true); return; }
                if (event.key !== 'Tab') return;
                var focusable = Array.from(dialog.querySelectorAll('a[href], button:not([disabled]):not([hidden]), input:not([disabled]), summary'))
                    .filter(function (element) { return element.offsetParent !== null; });
                if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
                var first = focusable[0];
                var last = focusable[focusable.length - 1];
                if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
            };
            dialog.addEventListener('keydown', fallbackKeydown);
        }

        resultPromise = new Promise(function (resolveResultFn) { resolveResult = resolveResultFn; });
        document.body.appendChild(dialog);
        if (!inlineEdit) document.body.classList.add('sutra-rich-link-open');
        activeDialog = { close: activeClose };
        updateValidity();
        try {
            if (inlineEdit && usingNativeDialog) dialog.show();
            else if (usingNativeDialog) dialog.showModal();
            else dialog.focus();
            if (!inlineEdit && window.SutraModalManager) window.SutraModalManager.sync();
        } catch (error) {
            close(null, false);
            return resultPromise;
        }
        window.addEventListener('noteflow:view-changed', onViewChanged);
        window.addEventListener('sutra:note-page-loaded', onNotePageLoaded);
        window.addEventListener('sutra:workspace-lock-changed', onWorkspaceLock);
        window.addEventListener('sutra:note-page-locked', onNotePageLoaded);
        window.addEventListener('sutra:workspace-remote-commit', onNotePageLoaded);
        window.addEventListener('pagehide', onPageHide);
        window.addEventListener('popstate', onNavigate);
        window.addEventListener('hashchange', onNavigate);
        if (inlineEdit) {
            document.addEventListener('pointerdown', onOutsidePointer, true);
            document.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
            dialog.addEventListener('focusout', onFocusOut);
            updatePosition();
        }
        (inlineEdit ? labelField : hrefField).focus();
        return resultPromise;
    }

    function positionPopover(popover, anchor) {
        var rect = anchor.getBoundingClientRect();
        var margin = 8;
        var viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        var viewportHeight = document.documentElement.clientHeight || window.innerHeight;
        var width = popover.offsetWidth || 320;
        var height = popover.offsetHeight || 80;
        var left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - width - margin));
        var top = rect.bottom + 8;
        if (top + height > viewportHeight - margin && rect.top - height - 8 >= margin) top = rect.top - height - 8;
        popover.style.left = Math.round(left) + 'px';
        popover.style.top = Math.round(Math.max(margin, top)) + 'px';
    }

    function iconButton(iconName, label) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'sutra-rich-link-popup-action';
        button.setAttribute('aria-label', label);
        button.title = label;
        var icon = document.createElement('i');
        icon.className = 'fas ' + iconName;
        icon.setAttribute('aria-hidden', 'true');
        button.appendChild(icon);
        return button;
    }

    function copyText(text) {
        var clipboard = window.navigator && window.navigator.clipboard;
        if (clipboard && typeof clipboard.writeText === 'function') {
            try { return Promise.resolve(clipboard.writeText(text)).catch(function () { return copyTextFallback(text); }); }
            catch (error) { return copyTextFallbackPromise(text); }
        }
        return copyTextFallbackPromise(text);
    }

    function copyTextFallbackPromise(text) {
        try { return Promise.resolve(copyTextFallback(text)); }
        catch (error) { return Promise.reject(error); }
    }

    function copyTextFallback(text) {
        if (typeof document.execCommand !== 'function') throw new Error('Clipboard access is unavailable.');
        var field = document.createElement('textarea');
        var focusTarget = document.activeElement;
        field.value = text;
        field.setAttribute('readonly', '');
        field.setAttribute('aria-hidden', 'true');
        field.style.position = 'fixed';
        field.style.left = '-10000px';
        field.style.top = '0';
        document.body.appendChild(field);
        field.select();
        var copied = false;
        try { copied = document.execCommand('copy'); }
        finally {
            field.remove();
            if (focusTarget && focusTarget.isConnected && typeof focusTarget.focus === 'function') {
                try { focusTarget.focus({ preventScroll: true }); } catch (error) { try { focusTarget.focus(); } catch (ignored) {} }
            }
        }
        if (!copied) throw new Error('The browser declined the copy request.');
        return true;
    }

    function preview(link, callbacks, sourceAnchor) {
        var url = link && safeHttpUrl(link.href);
        if (!url) return false;
        var actions = callbacks || {};
        var anchor = sourceAnchor || (activatedAnchor && activatedAnchor.isConnected ? activatedAnchor : null);
        activatedAnchor = null;
        if (!anchor) return false;
        if (activeDialog && typeof activeDialog.close === 'function') activeDialog.close(false);
        if (activePopup && typeof activePopup.close === 'function') activePopup.close(false);

        var popup = document.createElement('dialog');
        popup.className = 'sutra-rich-link-popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'false');
        popup.setAttribute('aria-label', 'Link actions');
        var row = document.createElement('div');
        row.className = 'sutra-rich-link-popup-row';
        var openLink = document.createElement('a');
        openLink.className = 'sutra-rich-link-popup-url';
        openLink.href = url.href;
        openLink.target = '_blank';
        openLink.rel = 'noopener noreferrer';
        openLink.referrerPolicy = 'no-referrer';
        openLink.title = url.href;
        openLink.setAttribute('aria-label', 'Open link: ' + url.href);
        var linkIcon = document.createElement('i');
        linkIcon.className = 'fas fa-link';
        linkIcon.setAttribute('aria-hidden', 'true');
        openLink.appendChild(linkIcon);
        openLink.appendChild(textElement('span', 'sutra-rich-link-popup-url-text', url.href));
        row.appendChild(openLink);

        var copyButton = iconButton('fa-copy', 'Copy link');
        var editButton = typeof actions.onEdit === 'function' ? iconButton('fa-pen', 'Edit link') : null;
        var unlinkButton = typeof actions.onRemove === 'function' ? iconButton('fa-unlink', 'Remove link') : null;
        row.appendChild(copyButton);
        if (editButton) row.appendChild(editButton);
        if (unlinkButton) row.appendChild(unlinkButton);
        popup.appendChild(row);
        var status = textElement('span', 'sutra-rich-link-popup-status', '');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        popup.appendChild(status);

        var closed = false;
        var anchorContainer = anchor.closest('[data-sutra-rich-link]');
        function close(restoreFocus) {
            if (closed) return;
            closed = true;
            window.removeEventListener('noteflow:view-changed', closePopup);
            window.removeEventListener('sutra:note-page-loaded', closePopup);
            window.removeEventListener('sutra:workspace-lock-changed', closePopup);
            window.removeEventListener('sutra:note-page-locked', closePopup);
            window.removeEventListener('sutra:workspace-remote-commit', closePopup);
            window.removeEventListener('pagehide', closePopup);
            document.removeEventListener('pointerdown', onOutsidePointer, true);
            document.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
            popup.removeEventListener('focusout', onFocusOut);
            popup.removeEventListener('keydown', onKeydown);
            if (popup.open && typeof popup.close === 'function') popup.close();
            popup.remove();
            if (activePopup && activePopup.close === close) activePopup = null;
            var focusTarget = anchor.isConnected ? anchor : (anchorContainer && anchorContainer.querySelector('a'));
            if (restoreFocus && focusTarget && focusTarget.isConnected && typeof focusTarget.focus === 'function') {
                try { focusTarget.focus({ preventScroll: true }); } catch (error) { try { focusTarget.focus(); } catch (ignored) {} }
            }
        }

        function closePopup() { close(false); }
        function onOutsidePointer(event) {
            if (!popup.contains(event.target) && !anchor.contains(event.target)) close(false);
        }
        function onFocusOut() {
            window.setTimeout(function () {
                if (!closed && !popup.contains(document.activeElement)) close(false);
            }, 0);
        }
        function onKeydown(event) {
            if (event.key === 'Escape') { event.preventDefault(); close(true); }
        }
        function updatePosition() {
            if (!anchor.isConnected) { close(false); return; }
            positionPopover(popup, anchor);
        }
        copyButton.addEventListener('click', function () {
            copyText(url.href).then(function () { if (!closed) setText(status, 'Link copied.'); }).catch(function () {
                if (!closed) setText(status, 'Could not copy the link.');
            });
        });
        if (editButton) editButton.addEventListener('click', function () {
            close(false);
            pendingInlineEdit = { anchor: anchor, anchorContainer: anchorContainer };
            try { actions.onEdit({ href: url.href, label: plainLabel(link.label, url.href) }); }
            finally {
                window.setTimeout(function () {
                    if (pendingInlineEdit && pendingInlineEdit.anchor === anchor) pendingInlineEdit = null;
                }, 0);
            }
        });
        if (unlinkButton) unlinkButton.addEventListener('click', function () {
            close(false);
            actions.onRemove({ href: url.href, label: plainLabel(link.label, url.href) });
        });
        openLink.addEventListener('click', function () { close(false); });
        popup.addEventListener('cancel', function (event) { event.preventDefault(); close(true); });
        popup.addEventListener('focusout', onFocusOut);
        popup.addEventListener('keydown', onKeydown);
        document.body.appendChild(popup);
        try {
            if (typeof popup.show === 'function') popup.show();
            else popup.setAttribute('open', '');
        } catch (error) { popup.remove(); return false; }
        activePopup = { close: close };
        document.addEventListener('pointerdown', onOutsidePointer, true);
        document.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('noteflow:view-changed', closePopup);
        window.addEventListener('sutra:note-page-loaded', closePopup);
        window.addEventListener('sutra:workspace-lock-changed', closePopup);
        window.addEventListener('sutra:note-page-locked', closePopup);
        window.addEventListener('sutra:workspace-remote-commit', closePopup);
        window.addEventListener('pagehide', closePopup);
        updatePosition();
        try { copyButton.focus({ preventScroll: true }); } catch (error) { copyButton.focus(); }
        return true;
    }

    // Stored/read-mode markup has no editor NodeView. Keep ordinary modified
    // clicks native; an unmodified activation opens the local action popover.
    document.addEventListener('click', function (event) {
        var anchor = event.target.closest && event.target.closest('a');
        var wrapper = anchor && anchor.closest('[data-sutra-rich-link]');
        if (!wrapper) return;
        if (activationClearTimer) window.clearTimeout(activationClearTimer);
        activatedAnchor = anchor;
        activationClearTimer = window.setTimeout(function () { activatedAnchor = null; activationClearTimer = null; }, 0);
        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if (wrapper.closest('.editor-v2-host')) return;
        var link;
        try { link = JSON.parse(wrapper.getAttribute('data-sutra-rich-link')); } catch (_) { return; }
        if (preview(link, null, anchor)) event.preventDefault();
    }, true);

    window.SutraRichLinks = {
        open: openLinkDialog,
        renderAnchor: safeAnchor,
        renderCard: createLinkCard,
        preview: preview,
        validateHref: function (href) { var url = safeHttpUrl(href); return url ? url.href : null; }
    };
})();
