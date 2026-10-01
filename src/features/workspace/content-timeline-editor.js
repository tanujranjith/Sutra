/* Shared, local-session editor for authored content timelines. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.SutraContentTimelineEditor = api;
  else if (root) root.SutraContentTimelineEditor = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildContentTimelineEditor(global) {
  'use strict';

  var MAX_NEW_EVENTS = 100;
  var activeSession = null;
  if (global && typeof global.addEventListener === 'function') {
    ['noteflow:view-changed', 'sutra:note-page-loaded', 'sutra:note-page-locked',
      'sutra:workspace-lock-changed', 'sutra:workspace-remote-commit', 'pagehide'].forEach(function (name) {
      global.addEventListener(name, function () { cancel(); });
    });
  }
  var allowedTags = Object.create(null);
  var allowedClasses = Object.create(null);
  ['section', 'h2', 'h3', 'p', 'ol', 'li'].forEach(function (tag) { allowedTags[tag] = true; });
  [
    'sutra-content-timeline', 'sutra-content-timeline--vertical', 'sutra-content-timeline--horizontal',
    'sutra-content-timeline__title', 'sutra-content-timeline__events', 'sutra-content-timeline__event',
    'sutra-content-timeline__event-title', 'sutra-content-timeline__when', 'sutra-content-timeline__description',
    'sutra-content-timeline__fallback'
  ].forEach(function (className) { allowedClasses[className] = true; });

  function element(tagName, className, value) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function setDataField(record, key, value) {
    var prototype = Object.getPrototypeOf(record);
    var next = prototype === null ? Object.create(null) : {};
    Object.keys(record).forEach(function (name) {
      Object.defineProperty(next, name, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: record[name]
      });
    });
    Object.defineProperty(next, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: value
    });
    return next;
  }

  function copyRenderedNode(source) {
    if (source.nodeType === 3) return document.createTextNode(source.nodeValue || '');
    if (source.nodeType !== 1) return null;
    var tagName = String(source.tagName || '').toLowerCase();
    if (!allowedTags[tagName]) return document.createTextNode(source.textContent || '');

    var copy = document.createElement(tagName);
    var classes = String(source.getAttribute('class') || '').split(/\s+/).filter(function (className) {
      return !!allowedClasses[className];
    });
    if (classes.length) copy.className = classes.join(' ');
    Array.prototype.forEach.call(source.childNodes, function (child) {
      var safeChild = copyRenderedNode(child);
      if (safeChild) copy.appendChild(safeChild);
    });
    return copy;
  }

  // The model renderer escapes authored strings and emits a fixed tag/class
  // vocabulary. Parse that output inertly, then copy only those fixed nodes.
  function safePreviewFragment(markup) {
    if (typeof global.DOMParser !== 'function') return null;
    var parsed = new global.DOMParser().parseFromString(String(markup || ''), 'text/html');
    if (!parsed || !parsed.body) return null;
    var fragment = document.createDocumentFragment();
    Array.prototype.forEach.call(parsed.body.childNodes, function (child) {
      var safeChild = copyRenderedNode(child);
      if (safeChild) fragment.appendChild(safeChild);
    });
    return fragment;
  }

  function renderPreview(preview, helper, model) {
    preview.replaceChildren();
    try {
      var fragment = safePreviewFragment(helper.renderHTML(model));
      if (fragment) preview.appendChild(fragment);
      else preview.textContent = helper.toPlainText(model);
    } catch (error) {
      preview.textContent = helper.toPlainText(model);
    }
  }

  function field(labelText, control, helpText) {
    var label = element('label', 'sutra-content-timeline-editor__field');
    label.appendChild(element('span', 'sutra-content-timeline-editor__field-label', labelText));
    label.appendChild(control);
    if (helpText) label.appendChild(element('span', 'sutra-content-timeline-editor__field-help', helpText));
    return label;
  }

  function makeButton(label, className, onClick) {
    var button = element('button', className || 'sutra-content-timeline-editor__button', label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }

  function cancel() {
    if (!activeSession || !activeSession.handle) return false;
    activeSession.handle.close(false);
    return true;
  }

  function open(options) {
    var helper = global && global.SutraContentTimeline;
    if (!global || !global.document || !helper || typeof helper.inspect !== 'function' ||
        typeof helper.normalize !== 'function' || typeof helper.create !== 'function' ||
        typeof helper.renderHTML !== 'function' || typeof helper.toPlainText !== 'function' ||
        typeof helper.addEvent !== 'function' || typeof helper.updateEvent !== 'function' ||
        typeof helper.removeEvent !== 'function' || typeof helper.reorderEvents !== 'function' ||
        typeof global.openSutraModal !== 'function') return Promise.resolve(null);

    cancel();
    var opts = options && typeof options === 'object' ? options : {};
    var isNew = opts.model === undefined || opts.model === null;
    var source = isNew ? helper.create({ title: '' }) : opts.model;
    var status = helper.inspect(source);
    var draft = helper.normalize(source);
    var readOnly = !status.supported || status.readOnly;
    var contextTitle = typeof opts.title === 'string' && opts.title ? opts.title : (isNew ? 'Create timeline' : 'Edit timeline');
    var body = element('div', 'sutra-content-timeline-editor');
    var intro = element('p', 'sutra-content-timeline-editor__intro', 'When is display text in the order you choose. It does not create calendar events. Changes stay here until you choose Save.');
    intro.id = 'sutra-content-timeline-editor-description';
    body.appendChild(intro);

    var session = { handle: null, savedModel: null };
    var previewSurface = element('div', 'sutra-content-timeline-editor__preview-surface');
    var statusMessage = element('p', 'sutra-content-timeline-editor__status', 'Preview updates as you edit.');
    statusMessage.setAttribute('role', 'status');
    statusMessage.setAttribute('aria-live', 'polite');
    statusMessage.setAttribute('aria-atomic', 'true');

    if (readOnly) {
      var reason = status.kind === 'future'
        ? 'This timeline uses a newer format. You can preview the safe fallback here, but this version cannot edit it.'
        : 'This timeline could not be read safely, so it is open read-only.';
      body.appendChild(element('p', 'sutra-content-timeline-editor__readonly', reason));
      var previewTitle = element('h3', 'sutra-content-timeline-editor__section-title', 'Preview');
      body.appendChild(previewTitle);
      previewSurface.setAttribute('aria-label', 'Timeline preview');
      body.appendChild(previewSurface);
      renderPreview(previewSurface, helper, draft);
      body.appendChild(statusMessage);
    } else {
      var layout = element('div', 'sutra-content-timeline-editor__layout');
      var editPane = element('section', 'sutra-content-timeline-editor__edit-pane');
      var previewPane = element('section', 'sutra-content-timeline-editor__preview-pane');
      var titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.autocomplete = 'off';
      titleInput.value = draft.title;
      editPane.appendChild(field('Timeline title', titleInput));

      var layoutSelect = document.createElement('select');
      [['vertical', 'Vertical sequence'], ['horizontal', 'Horizontal sequence']].forEach(function (row) {
        var option = document.createElement('option');
        option.value = row[0];
        option.textContent = row[1];
        layoutSelect.appendChild(option);
      });
      layoutSelect.value = draft.layout;
      editPane.appendChild(field('Event layout', layoutSelect));

      var eventsHeading = element('h3', 'sutra-content-timeline-editor__section-title', 'Events');
      var eventCount = element('span', 'sutra-content-timeline-editor__count');
      var eventsHeader = element('div', 'sutra-content-timeline-editor__events-heading');
      eventsHeader.appendChild(eventsHeading);
      eventsHeader.appendChild(eventCount);
      editPane.appendChild(eventsHeader);
      var eventList = element('div', 'sutra-content-timeline-editor__event-list');
      editPane.appendChild(eventList);
      var addButton = makeButton('Add event', 'sutra-content-timeline-editor__button sutra-content-timeline-editor__add', function () {
        if (draft.events.length >= MAX_NEW_EVENTS) {
          statusMessage.textContent = 'This timeline already has ' + draft.events.length + ' events. Remove an event before adding another.';
          return;
        }
        var next = helper.addEvent(draft, { label: '', when: '', description: '' });
        if (!next) {
          statusMessage.textContent = 'A new event could not be added. Your draft is unchanged.';
          return;
        }
        draft = next;
        renderEvents(draft.events[draft.events.length - 1].id);
        refreshPreview();
        statusMessage.textContent = 'Event added. ' + draft.events.length + (draft.events.length === 1 ? ' event' : ' events') + ' in this timeline.';
      });
      editPane.appendChild(addButton);

      previewPane.appendChild(element('h3', 'sutra-content-timeline-editor__section-title', 'Preview'));
      previewSurface.setAttribute('aria-label', 'Timeline preview');
      previewPane.appendChild(previewSurface);
      layout.appendChild(editPane);
      layout.appendChild(previewPane);
      body.appendChild(layout);
      body.appendChild(statusMessage);

      function focusEvent(id) {
        if (id === undefined || id === null) return addButton.focus();
        var cards = Array.prototype.slice.call(eventList.children);
        var card = cards.find(function (item) { return item.__sutraTimelineEventId === id; });
        var input = card && card.querySelector('input, textarea');
        if (input) input.focus();
        else addButton.focus();
      }

      function updateEventField(id, key, value, legend) {
        var patch = {};
        patch[key] = value;
        var next = helper.updateEvent(draft, id, patch);
        if (!next) {
          statusMessage.textContent = 'This event could not be updated. Your draft is unchanged.';
          return;
        }
        draft = next;
        if (legend) legend.textContent = 'Event ' + (draft.events.findIndex(function (item) { return item.id === id; }) + 1) + ': ' + (value || 'Untitled event');
        refreshPreview();
      }

      function removeOne(id) {
        var index = draft.events.findIndex(function (item) { return item.id === id; });
        if (index < 0) return;
        var focusId = draft.events[index + 1] ? draft.events[index + 1].id : (draft.events[index - 1] ? draft.events[index - 1].id : null);
        var next = helper.removeEvent(draft, id);
        if (!next) {
          statusMessage.textContent = 'This event could not be removed. Your draft is unchanged.';
          return;
        }
        draft = next;
        renderEvents(focusId);
        refreshPreview();
        statusMessage.textContent = 'Event removed. ' + draft.events.length + ' events remain.';
      }

      function moveOne(id, delta) {
        var index = draft.events.findIndex(function (item) { return item.id === id; });
        var target = index + delta;
        if (index < 0 || target < 0 || target >= draft.events.length) return;
        var orderedIds = draft.events.map(function (item) { return item.id; });
        var currentId = orderedIds[index];
        orderedIds[index] = orderedIds[target];
        orderedIds[target] = currentId;
        var next = helper.reorderEvents(draft, orderedIds);
        if (!next) {
          statusMessage.textContent = 'Event order could not be changed. Your draft is unchanged.';
          return;
        }
        draft = next;
        renderEvents(id);
        refreshPreview();
        statusMessage.textContent = 'Moved event to position ' + (target + 1) + ' of ' + draft.events.length + '.';
      }

      function renderEvents(focusId) {
        eventList.replaceChildren();
        eventCount.textContent = draft.events.length + (draft.events.length === 1 ? ' event' : ' events');
        if (!draft.events.length) {
          eventList.appendChild(element('p', 'sutra-content-timeline-editor__empty', 'No events yet. Add an event to start your sequence.'));
        }
        draft.events.forEach(function (event, index) {
          var card = element('fieldset', 'sutra-content-timeline-editor__event');
          card.__sutraTimelineEventId = event.id;
          var legend = element('legend', '', 'Event ' + (index + 1) + ': ' + (event.label || 'Untitled event'));
          card.appendChild(legend);

          var labelInput = document.createElement('input');
          labelInput.type = 'text';
          labelInput.autocomplete = 'off';
          labelInput.value = event.label;
          labelInput.setAttribute('aria-label', 'Event ' + (index + 1) + ' label');
          labelInput.addEventListener('input', function () { updateEventField(event.id, 'label', labelInput.value, legend); });
          card.appendChild(field('Label', labelInput));

          var whenInput = document.createElement('input');
          whenInput.type = 'text';
          whenInput.autocomplete = 'off';
          whenInput.value = event.when;
          whenInput.setAttribute('aria-label', 'Event ' + (index + 1) + ' when text');
          whenInput.addEventListener('input', function () { updateEventField(event.id, 'when', whenInput.value); });
          card.appendChild(field('When', whenInput, 'Display text only; dates and order are not interpreted.'));

          var descriptionInput = document.createElement('textarea');
          descriptionInput.rows = 3;
          descriptionInput.value = event.description;
          descriptionInput.setAttribute('aria-label', 'Event ' + (index + 1) + ' description');
          descriptionInput.addEventListener('input', function () { updateEventField(event.id, 'description', descriptionInput.value); });
          card.appendChild(field('Description', descriptionInput));

          var actions = element('div', 'sutra-content-timeline-editor__event-actions');
          var upButton = makeButton('Move up', 'sutra-content-timeline-editor__button', function () { moveOne(event.id, -1); });
          upButton.disabled = index === 0;
          var downButton = makeButton('Move down', 'sutra-content-timeline-editor__button', function () { moveOne(event.id, 1); });
          downButton.disabled = index === draft.events.length - 1;
          var removeButton = makeButton('Remove event', 'sutra-content-timeline-editor__button sutra-content-timeline-editor__remove', function () { removeOne(event.id); });
          actions.appendChild(upButton);
          actions.appendChild(downButton);
          actions.appendChild(removeButton);
          card.appendChild(actions);
          eventList.appendChild(card);
        });
        addButton.disabled = draft.events.length >= MAX_NEW_EVENTS;
        if (draft.events.length >= MAX_NEW_EVENTS) {
          statusMessage.textContent = 'The new-event limit is ' + MAX_NEW_EVENTS + '. Existing events stay available to edit or remove.';
        }
        if (focusId === null && !draft.events.length) addButton.focus();
        else if (focusId !== undefined) focusEvent(focusId);
      }

      function refreshPreview() {
        renderPreview(previewSurface, helper, draft);
      }

      titleInput.addEventListener('input', function () {
        draft = setDataField(draft, 'title', titleInput.value);
        refreshPreview();
      });
      layoutSelect.addEventListener('change', function () {
        draft = setDataField(draft, 'layout', layoutSelect.value);
        refreshPreview();
      });
      renderEvents();
      refreshPreview();
    }

    var buttons = readOnly
      ? [{ label: 'Close', value: false, primary: true }]
      : [
          { label: 'Cancel', value: false },
          {
            label: 'Save timeline', value: true, primary: true, keepOpen: true,
            onClick: function () {
              var latest = helper.inspect(draft);
              if (!latest.supported || latest.readOnly) {
                statusMessage.textContent = 'This timeline became read-only. Your changes were not saved.';
                return;
              }
              session.savedModel = helper.normalize(draft);
              if (session.handle) session.handle.close(true);
            }
          }
        ];
    activeSession = session;
    try {
      session.handle = global.openSutraModal({ titleText: contextTitle, bodyNode: body, buttons: buttons });
    } catch (error) {
      activeSession = null;
      return Promise.resolve(null);
    }
    if (!session.handle || !session.handle.result) {
      activeSession = null;
      return Promise.resolve(null);
    }

    var dialog = body.parentElement;
    if (dialog) {
      dialog.classList.add('sutra-content-timeline-editor__dialog');
      dialog.style.maxWidth = 'min(960px, calc(100vw - 28px))';
      dialog.style.maxHeight = '90vh';
      dialog.style.overflow = 'auto';
      var heading = dialog.querySelector('h2');
      if (heading) heading.classList.add('sutra-content-timeline-editor__dialog-title');
      var actionRow = dialog.lastElementChild;
      if (actionRow && actionRow !== body) actionRow.classList.add('sutra-content-timeline-editor__dialog-actions');
      dialog.setAttribute('aria-describedby', intro.id);
      var overlay = dialog.parentElement;
      if (overlay) {
        overlay.classList.add('active');
        overlay.setAttribute('data-sutra-layer', 'modal');
        overlay.setAttribute('aria-hidden', 'false');
      }
    }
    if (!readOnly) {
      var firstInput = body.querySelector('input');
      if (firstInput) firstInput.focus({ preventScroll: true });
    }

    return session.handle.result.then(function (value) {
      if (activeSession === session) activeSession = null;
      return value === true && session.savedModel ? session.savedModel : null;
    }, function () {
      if (activeSession === session) activeSession = null;
      return null;
    });
  }

  return Object.freeze({
    open: open,
    cancel: cancel,
    MAX_NEW_EVENTS: MAX_NEW_EVENTS
  });
}));
