/*
 * Contextual Folder workspace for the existing title::path page hierarchy.
 * This view owns no workspace data: navigation and page creation cross the
 * injected canonical bridge, while the page list stays in the existing model.
 */
(function () {
    'use strict';

    if (window.SutraFolderWorkspace) return;

    var activeRoot = null;
    var renderSequence = 0;
    var CHILD_TYPES = [
        { id: 'note', label: 'New note', icon: '📝', primary: true },
        { id: 'folder', label: 'New folder', icon: '📁' },
        { id: 'canvas', label: 'New canvas', icon: '🗺️' },
        { id: 'slides', label: 'New slides', icon: '▤' },
        { id: 'sheets', label: 'New spreadsheet', icon: '▦' },
        { id: 'html', label: 'New HTML page', icon: '⌘' }
    ];

    function setText(element, value) {
        if (window.SutraDOMSafety && typeof window.SutraDOMSafety.setText === 'function') {
            window.SutraDOMSafety.setText(element, String(value == null ? '' : value));
        } else {
            element.textContent = String(value == null ? '' : value);
        }
    }

    function textNode(tag, className, value) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        if (value != null) setText(element, value);
        return element;
    }

    function createButton(label, className, onClick) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = className || '';
        setText(button, label);
        if (typeof onClick === 'function') button.addEventListener('click', onClick);
        return button;
    }

    function normalizeTitle(value) {
        return String(value || '').split('::').map(function (part) { return part.trim(); }).filter(Boolean).join('::');
    }

    function isHelpPage(page) {
        if (!page || typeof page !== 'object') return false;
        if (page.isSystemPage === true || page.systemRole === 'help-docs' || page.builtInId === 'help-docs' || page.id === 'help_page') return true;
        if (/^help_page_[a-z0-9_-]+$/i.test(String(page.id || ''))) return true;
        return String(page.title || '').trim().toLowerCase() === 'help & docs' && page.isSystemPage === true;
    }

    function isFolder(page) {
        return !!page && String(page.type || '').trim().toLowerCase() === 'folder';
    }

    function pageKind(page) {
        if (isFolder(page)) return 'Folder';
        if (page && String(page.type || '').trim().toLowerCase() === 'canvas') return 'Canvas';
        if (page && page.slides) return 'Slides';
        if (page && page.spreadsheet) return 'Spreadsheet';
        if (page && page.htmlDocument) return 'HTML page';
        return 'Note';
    }

    function isLocked(page) {
        return !!(page && page.isLocked === true && page.lockHash);
    }

    function formatUpdatedAt(value) {
        if (!value) return '';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        try {
            return 'Updated ' + date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (error) {
            return '';
        }
    }

    function safeCurrentSpace(bridge) {
        var value = typeof bridge.getCurrentSpaceId === 'function' ? bridge.getCurrentSpaceId() : 'default';
        return String(value || 'default');
    }

    function getLivePage(bridge, pageId) {
        if (!bridge || typeof bridge.getPages !== 'function' || typeof bridge.getCurrentSpaceId !== 'function') return null;
        try {
            var pages = bridge.getPages();
            if (!Array.isArray(pages)) return null;
            var spaceId = safeCurrentSpace(bridge);
            return pages.find(function (page) {
                return page && String(page.id) === String(pageId)
                    && String(page.spaceId || 'default') === spaceId && !isHelpPage(page);
            }) || null;
        } catch (error) {
            return null;
        }
    }

    function reportStatus(status, message, isError) {
        status.classList.toggle('is-error', !!isError);
        setText(status, message || '');
    }

    function safeCanWrite(bridge, folder) {
        if (typeof bridge.canWritePageContent !== 'function') return false;
        try { return bridge.canWritePageContent(folder) === true; } catch (error) { return false; }
    }

    function openChild(bridge, child, status) {
        if (!child || typeof bridge.openPage !== 'function') {
            reportStatus(status, 'This page is not available to open.', true);
            return;
        }
        var liveChild = getLivePage(bridge, child.id);
        if (!liveChild) {
            reportStatus(status, 'This page is no longer available in the current space.', true);
            return;
        }
        try {
            var result = bridge.openPage(String(liveChild.id));
            if (result === false) reportStatus(status, 'This page could not be opened.', true);
            else if (result && typeof result.then === 'function') {
                result.then(function (value) {
                    if (value === false) reportStatus(status, 'This page could not be opened.', true);
                }).catch(function () { reportStatus(status, 'This page could not be opened.', true); });
            }
        } catch (error) {
            reportStatus(status, 'This page could not be opened.', true);
        }
    }

    function createChild(bridge, folder, type, status) {
        var liveFolder = getLivePage(bridge, folder && folder.id);
        if (!liveFolder || !isFolder(liveFolder)) {
            reportStatus(status, 'This folder is no longer available in the current space.', true);
            return;
        }
        if (!safeCanWrite(bridge, liveFolder)) {
            reportStatus(status, 'Unlock this folder or make it writable before adding pages.', true);
            return;
        }
        if (typeof bridge.createChild !== 'function') {
            reportStatus(status, 'Page creation is not available right now.', true);
            return;
        }
        try {
            var result = bridge.createChild(String(liveFolder.id), type);
            if (result === false) reportStatus(status, 'The new page dialog could not be opened.', true);
            else if (result && typeof result.then === 'function') {
                result.then(function (value) {
                    if (value === false) reportStatus(status, 'The new page dialog could not be opened.', true);
                    else reportStatus(status, 'Choose a title and confirm in the new page dialog.', false);
                }).catch(function () { reportStatus(status, 'The new page dialog could not be opened.', true); });
            } else reportStatus(status, 'Choose a title and confirm in the new page dialog.', false);
        } catch (error) {
            reportStatus(status, 'The new page dialog could not be opened.', true);
        }
    }

    function buildCrumbs(folder, pageByTitle, list, bridge, status, spaceId) {
        var nav = document.createElement('nav');
        nav.className = 'sutra-folder-workspace-breadcrumbs';
        nav.setAttribute('aria-label', 'Folder location');
        var ordered = document.createElement('ol');
        var parts = normalizeTitle(folder.title).split('::').filter(Boolean);
        var path = '';
        parts.forEach(function (part, index) {
            path = path ? path + '::' + part : part;
            var item = document.createElement('li');
            var current = index === parts.length - 1;
            var ancestor = pageByTitle.get(path);
            if (index > 0) {
                var separator = textNode('span', 'sutra-folder-workspace-crumb-separator', '›');
                separator.setAttribute('aria-hidden', 'true');
                item.appendChild(separator);
            }
            if (current) {
                var label = textNode('span', 'sutra-folder-workspace-current-crumb', part);
                label.setAttribute('aria-current', 'page');
                item.appendChild(label);
            } else if (ancestor && isFolder(ancestor) && !isHelpPage(ancestor) && String(ancestor.spaceId || 'default') === spaceId) {
                var crumb = createButton(part, 'sutra-folder-workspace-crumb', function () { openChild(bridge, ancestor, status); });
                crumb.setAttribute('aria-label', 'Open folder ' + part);
                item.appendChild(crumb);
            } else {
                item.appendChild(textNode('span', 'sutra-folder-workspace-crumb-text', part));
            }
            ordered.appendChild(item);
        });
        nav.appendChild(ordered);
        list.appendChild(nav);
    }

    function render(root, folderId, bridge) {
        renderSequence += 1;
        var headingId = 'sutraFolderWorkspaceHeading' + renderSequence;
        root.replaceChildren();
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', 'Folder workspace');
        root.removeAttribute('aria-labelledby');

        if (!bridge || typeof bridge.getPages !== 'function' || typeof bridge.getCurrentSpaceId !== 'function') {
            root.appendChild(textNode('p', 'sutra-folder-workspace-message is-error', 'Folder pages are not available right now.'));
            return;
        }

        var pages;
        var spaceId;
        try {
            pages = bridge.getPages();
            spaceId = safeCurrentSpace(bridge);
        } catch (error) {
            root.appendChild(textNode('p', 'sutra-folder-workspace-message is-error', 'Folder pages are not available right now.'));
            return;
        }
        if (!Array.isArray(pages)) {
            root.appendChild(textNode('p', 'sutra-folder-workspace-message is-error', 'Folder pages are not available right now.'));
            return;
        }

        var inSpace = pages.filter(function (page) {
            return page && typeof page === 'object' && String(page.spaceId || 'default') === spaceId;
        });
        var folder = inSpace.find(function (page) { return String(page.id) === String(folderId); });
        if (!folder || !isFolder(folder) || isHelpPage(folder)) {
            root.appendChild(textNode('p', 'sutra-folder-workspace-message is-error', 'This folder is no longer available in the current space.'));
            return;
        }

        var folderTitle = normalizeTitle(folder.title);
        if (!folderTitle) {
            root.appendChild(textNode('p', 'sutra-folder-workspace-message is-error', 'This folder does not have a readable title.'));
            return;
        }

        var pageByTitle = new Map();
        inSpace.forEach(function (page) {
            var title = normalizeTitle(page.title);
            if (title && !pageByTitle.has(title)) pageByTitle.set(title, page);
        });

        var header = document.createElement('header');
        header.className = 'sutra-folder-workspace-header';
        var intro = document.createElement('div');
        intro.className = 'sutra-folder-workspace-heading-copy';
        var heading = textNode('h1', 'sutra-folder-workspace-heading', folderTitle.split('::').pop());
        heading.id = headingId;
        root.setAttribute('aria-labelledby', headingId);
        intro.appendChild(heading);
        intro.appendChild(textNode('p', 'sutra-folder-workspace-description', 'Pages in this folder stay together in your current space.'));
        header.appendChild(intro);

        var createAllowed = safeCanWrite(bridge, folder);
        var createActions = document.createElement('div');
        createActions.className = 'sutra-folder-workspace-create';
        createActions.setAttribute('aria-label', 'Create inside this folder');
        CHILD_TYPES.forEach(function (item) {
            var button = createButton('', 'sutra-folder-workspace-create-button' + (item.primary ? ' is-primary' : ''), function () {
                createChild(bridge, folder, item.id, status);
            });
            button.disabled = !createAllowed;
            button.setAttribute('data-create-type', item.id);
            button.setAttribute('aria-label', item.label + ' in ' + folderTitle.split('::').pop());
            var icon = textNode('span', 'sutra-folder-workspace-create-icon', item.icon);
            icon.setAttribute('aria-hidden', 'true');
            button.appendChild(icon);
            button.appendChild(textNode('span', '', item.label));
            createActions.appendChild(button);
        });
        header.appendChild(createActions);
        root.appendChild(header);

        var status = textNode('p', 'sutra-folder-workspace-status', '');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        root.appendChild(status);

        if (!createAllowed) {
            root.appendChild(textNode('p', 'sutra-folder-workspace-readonly', isLocked(folder)
                ? 'This folder is PIN-protected. Unlock it before adding pages.'
                : 'This folder cannot be changed right now. You can still open its child pages.'));
        }

        buildCrumbs(folder, pageByTitle, root, bridge, status, spaceId);

        var prefix = folderTitle + '::';
        var children = inSpace.filter(function (page) {
            if (page.id === folder.id || isHelpPage(page)) return false;
            var title = normalizeTitle(page.title);
            if (!title.startsWith(prefix)) return false;
            var remainder = title.slice(prefix.length);
            return !!remainder && !remainder.includes('::');
        });

        var listHeading = textNode('h2', 'sutra-folder-workspace-list-heading', 'Pages here');
        var listSection = document.createElement('section');
        listSection.className = 'sutra-folder-workspace-children';
        listHeading.id = 'sutraFolderWorkspaceListHeading' + renderSequence;
        listSection.setAttribute('aria-labelledby', listHeading.id);
        listSection.appendChild(listHeading);

        if (!children.length) {
            var empty = document.createElement('div');
            empty.className = 'sutra-folder-workspace-empty';
            var emptyIcon = textNode('span', 'sutra-folder-workspace-empty-icon', '📂');
            emptyIcon.setAttribute('aria-hidden', 'true');
            empty.appendChild(emptyIcon);
            empty.appendChild(textNode('h3', '', 'This folder is empty'));
            empty.appendChild(textNode('p', '', createAllowed
                ? 'Start with a note, or choose another page type above.'
                : 'Unlock or make this folder writable to add a page.'));
            listSection.appendChild(empty);
        } else {
            var grid = document.createElement('ul');
            grid.className = 'sutra-folder-workspace-grid';
            grid.setAttribute('aria-label', 'Immediate child pages');
            children.forEach(function (child) {
                var item = document.createElement('li');
                var kind = pageKind(child);
                var locked = isLocked(child);
                var title = normalizeTitle(child.title).split('::').pop() || 'Untitled';
                var button = createButton('', 'sutra-folder-workspace-child', function () { openChild(bridge, child, status); });
                button.setAttribute('aria-label', 'Open ' + kind.toLowerCase() + ' ' + title + (locked ? ', PIN-protected' : ''));
                var icon = textNode('span', 'sutra-folder-workspace-child-icon', kind === 'Folder' ? '📁' : (kind === 'Canvas' ? '🗺️' : (kind === 'Slides' ? '▤' : (kind === 'Spreadsheet' ? '▦' : (kind === 'HTML page' ? '⌘' : '📝')))));
                icon.setAttribute('aria-hidden', 'true');
                var copy = document.createElement('span');
                copy.className = 'sutra-folder-workspace-child-copy';
                copy.appendChild(textNode('span', 'sutra-folder-workspace-child-title', title));
                copy.appendChild(textNode('span', 'sutra-folder-workspace-child-kind', kind));
                var updated = formatUpdatedAt(child.updatedAt || child.createdAt);
                if (updated) copy.appendChild(textNode('span', 'sutra-folder-workspace-child-updated', updated));
                button.appendChild(icon);
                button.appendChild(copy);
                if (locked) {
                    var lock = textNode('span', 'sutra-folder-workspace-child-lock', 'PIN protected');
                    lock.setAttribute('aria-hidden', 'true');
                    button.appendChild(lock);
                }
                item.appendChild(button);
                grid.appendChild(item);
            });
            listSection.appendChild(grid);
        }
        root.appendChild(listSection);
    }

    function close() {
        if (activeRoot && activeRoot.parentNode) activeRoot.parentNode.removeChild(activeRoot);
        activeRoot = null;
    }

    function open(page, mountEl, bridge) {
        close();
        if (!mountEl || typeof mountEl.appendChild !== 'function') return null;
        var root = document.createElement('section');
        root.className = 'sutra-folder-workspace';
        root.tabIndex = -1;
        root.dataset.folderPageId = String(page && page.id || '');
        mountEl.appendChild(root);
        activeRoot = root;
        render(root, page && page.id, bridge);
        try { root.focus({ preventScroll: true }); } catch (error) { try { root.focus(); } catch (ignored) {} }
        return root;
    }

    window.SutraFolderWorkspace = { open: open, close: close };
})();
