/* Pure authored timeline model and safe text renderers. */
(function (global) {
  'use strict';

  var VERSION = 1;
  var own = Object.prototype.hasOwnProperty;

  function hasOwn(value, key) {
    return value != null && own.call(value, key);
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function defineData(target, key, value) {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: value
    });
  }

  // Workspace records are JSON data. Copy arrays and plain objects without
  // interpreting their fields so unknown host data survives every mutation.
  function copyData(value, seen) {
    if (!value || typeof value !== 'object') return value;
    seen = seen || new Map();
    if (seen.has(value)) return seen.get(value);

    if (Array.isArray(value)) {
      var arrayCopy = new Array(value.length);
      seen.set(value, arrayCopy);
      for (var i = 0; i < value.length; i += 1) {
        if (hasOwn(value, i)) arrayCopy[i] = copyData(value[i], seen);
      }
      return arrayCopy;
    }

    if (!isPlainObject(value)) return value;
    var objectCopy = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    seen.set(value, objectCopy);
    Object.keys(value).forEach(function (key) {
      defineData(objectCopy, key, copyData(value[key], seen));
    });
    return objectCopy;
  }

  function validId(id) {
    return typeof id === 'string' && id.length > 0 && id.trim().length > 0;
  }

  function validLayout(layout) {
    return layout === 'vertical' || layout === 'horizontal';
  }

  function inspect(value) {
    if (!isPlainObject(value)) {
      return { supported: false, readOnly: true, kind: 'malformed', reason: 'invalid-record' };
    }
    if (!hasOwn(value, 'version') || typeof value.version !== 'number' || value.version % 1 !== 0) {
      return { supported: false, readOnly: true, kind: 'malformed', reason: 'invalid-version' };
    }
    if (value.version > VERSION) {
      return { supported: false, readOnly: true, kind: 'future', reason: 'future-version' };
    }
    if (value.version !== VERSION) {
      return { supported: false, readOnly: true, kind: 'unsupported', reason: 'unsupported-version' };
    }

    if (hasOwn(value, 'title') && value.title !== undefined && typeof value.title !== 'string') {
      return { supported: false, readOnly: true, kind: 'malformed', reason: 'invalid-title' };
    }
    if (hasOwn(value, 'layout') && value.layout !== undefined && !validLayout(value.layout)) {
      return { supported: false, readOnly: true, kind: 'malformed', reason: 'invalid-layout' };
    }
    if (hasOwn(value, 'events') && value.events !== undefined && !Array.isArray(value.events)) {
      return { supported: false, readOnly: true, kind: 'malformed', reason: 'invalid-events' };
    }

    var events = Array.isArray(value.events) ? value.events : [];
    var ids = new Set();
    for (var i = 0; i < events.length; i += 1) {
      var event = events[i];
      if (!isPlainObject(event) || !hasOwn(event, 'id') || !validId(event.id)) {
        return { supported: false, readOnly: true, kind: 'malformed', reason: 'invalid-event-id', eventIndex: i };
      }
      if (ids.has(event.id)) {
        return { supported: false, readOnly: true, kind: 'malformed', reason: 'duplicate-event-id', eventIndex: i };
      }
      ids.add(event.id);
      var textFields = ['label', 'when', 'description'];
      for (var j = 0; j < textFields.length; j += 1) {
        var field = textFields[j];
        if (hasOwn(event, field) && event[field] !== undefined && typeof event[field] !== 'string') {
          return { supported: false, readOnly: true, kind: 'malformed', reason: 'invalid-event-' + field, eventIndex: i };
        }
      }
    }
    return { supported: true, readOnly: false, kind: 'supported', reason: '' };
  }

  function normalizeEvent(event) {
    var normalized = copyData(event);
    if (!hasOwn(normalized, 'label') || normalized.label === undefined) defineData(normalized, 'label', '');
    if (!hasOwn(normalized, 'when') || normalized.when === undefined) defineData(normalized, 'when', '');
    if (!hasOwn(normalized, 'description') || normalized.description === undefined) defineData(normalized, 'description', '');
    return normalized;
  }

  function normalize(value) {
    var status = inspect(value);
    if (!status.supported) return copyData(value);

    var normalized = copyData(value);
    if (!hasOwn(normalized, 'title') || normalized.title === undefined) defineData(normalized, 'title', '');
    if (!hasOwn(normalized, 'layout') || normalized.layout === undefined) defineData(normalized, 'layout', 'vertical');
    var events = Array.isArray(value.events) ? value.events : [];
    defineData(normalized, 'events', events.map(normalizeEvent));
    defineData(normalized, 'version', VERSION);
    return normalized;
  }

  function newId(events) {
    var used = new Set(events.map(function (event) { return event.id; }));
    for (var attempt = 0; attempt < 20; attempt += 1) {
      var candidate = '';
      try {
        var cryptoApi = global && global.crypto;
        if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
          candidate = 'event-' + cryptoApi.randomUUID();
        } else if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
          var bytes = new Uint8Array(16);
          cryptoApi.getRandomValues(bytes);
          candidate = 'event-' + Array.prototype.map.call(bytes, function (byte) {
            return byte.toString(16).padStart(2, '0');
          }).join('');
        } else {
          candidate = 'event-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + attempt;
        }
      } catch (_) {
        candidate = 'event-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + attempt;
      }
      if (validId(candidate) && !used.has(candidate)) return candidate;
    }
    return null;
  }

  function buildEvent(source, existingEvents, generateMissingId) {
    if (!isPlainObject(source)) return null;
    var event = copyData(source);
    if (!hasOwn(event, 'id') || event.id === undefined) {
      if (!generateMissingId) return null;
      defineData(event, 'id', newId(existingEvents));
    }
    if (!validId(event.id)) return null;
    for (var i = 0; i < existingEvents.length; i += 1) {
      if (existingEvents[i].id === event.id) return null;
    }
    var textFields = ['label', 'when', 'description'];
    for (var j = 0; j < textFields.length; j += 1) {
      var field = textFields[j];
      if (!hasOwn(event, field) || event[field] === undefined) defineData(event, field, '');
      else if (typeof event[field] !== 'string') return null;
    }
    return event;
  }

  function create(options) {
    var source = options == null ? {} : options;
    if (!isPlainObject(source)) return null;
    if (hasOwn(source, 'title') && source.title !== undefined && typeof source.title !== 'string') return null;
    if (hasOwn(source, 'layout') && source.layout !== undefined && !validLayout(source.layout)) return null;
    if (hasOwn(source, 'events') && source.events !== undefined && !Array.isArray(source.events)) return null;

    var record = copyData(source);
    var sourceEvents = Array.isArray(source.events) ? source.events : [];
    var events = [];
    for (var i = 0; i < sourceEvents.length; i += 1) {
      var event = buildEvent(sourceEvents[i], events, true);
      if (!event) return null;
      events.push(event);
    }
    defineData(record, 'version', VERSION);
    defineData(record, 'title', source.title === undefined ? '' : source.title);
    defineData(record, 'layout', source.layout === undefined ? 'vertical' : source.layout);
    defineData(record, 'events', events);
    return record;
  }

  function editableRecord(record) {
    var status = inspect(record);
    return status.supported ? normalize(record) : null;
  }

  function addEvent(record, event) {
    var next = editableRecord(record);
    if (!next) return null;
    var added = buildEvent(event, next.events, true);
    if (!added) return null;
    next.events.push(added);
    return next;
  }

  function updateEvent(record, id, patch) {
    var next = editableRecord(record);
    if (!next || !validId(id) || !isPlainObject(patch)) return null;
    var index = -1;
    for (var i = 0; i < next.events.length; i += 1) {
      if (next.events[i].id === id) { index = i; break; }
    }
    if (index < 0 || (hasOwn(patch, 'id') && patch.id !== id)) return null;

    var updated = copyData(next.events[index]);
    Object.keys(patch).forEach(function (key) {
      if (key !== 'id') defineData(updated, key, copyData(patch[key]));
    });
    defineData(updated, 'id', id);
    var candidate = copyData(next);
    candidate.events[index] = updated;
    return inspect(candidate).supported ? normalize(candidate) : null;
  }

  function removeEvent(record, id) {
    var next = editableRecord(record);
    if (!next || !validId(id)) return null;
    var index = -1;
    for (var i = 0; i < next.events.length; i += 1) {
      if (next.events[i].id === id) { index = i; break; }
    }
    if (index < 0) return null;
    next.events.splice(index, 1);
    return next;
  }

  function reorderEvents(record, orderedIds) {
    var next = editableRecord(record);
    if (!next || !Array.isArray(orderedIds) || orderedIds.length !== next.events.length) return null;
    var byId = new Map();
    next.events.forEach(function (event) { byId.set(event.id, event); });
    var seen = new Set();
    var ordered = [];
    for (var i = 0; i < orderedIds.length; i += 1) {
      var id = orderedIds[i];
      if (!validId(id) || seen.has(id) || !byId.has(id)) return null;
      seen.add(id);
      ordered.push(byId.get(id));
    }
    next.events = ordered;
    return next;
  }

  function text(value) {
    return typeof value === 'string' ? value : '';
  }

  function escapeHTML(value) {
    return text(value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function eventLabel(event, index) {
    return event.label || ('Event ' + (index + 1));
  }

  function toPlainText(value) {
    var status = inspect(value);
    if (!status.supported) {
      if (status.kind === 'future') return 'This timeline uses a newer format and needs a newer version of Sutra.';
      return 'This timeline could not be read safely.';
    }
    var record = normalize(value);
    var lines = [record.title || 'Timeline'];
    record.events.forEach(function (event, index) {
      lines.push((index + 1) + '. ' + eventLabel(event, index) + (event.when ? ' — ' + event.when : ''));
      if (event.description) lines.push('   ' + event.description);
    });
    return lines.join('\n');
  }

  function renderHTML(value) {
    var status = inspect(value);
    if (!status.supported) {
      var message = status.kind === 'future'
        ? 'This timeline uses a newer format and cannot be fully displayed here.'
        : 'This timeline could not be displayed safely.';
      return '<section class="sutra-content-timeline"><h2 class="sutra-content-timeline__title">Timeline</h2><p class="sutra-content-timeline__fallback">' + escapeHTML(message) + '</p></section>';
    }

    var record = normalize(value);
    var layoutClass = record.layout === 'horizontal' ? 'sutra-content-timeline--horizontal' : 'sutra-content-timeline--vertical';
    var html = '<section class="sutra-content-timeline ' + layoutClass + '"><h2 class="sutra-content-timeline__title">' + escapeHTML(record.title || 'Timeline') + '</h2><ol class="sutra-content-timeline__events">';
    record.events.forEach(function (event, index) {
      html += '<li class="sutra-content-timeline__event"><h3 class="sutra-content-timeline__event-title">' + escapeHTML(eventLabel(event, index)) + '</h3>';
      if (event.when) html += '<p class="sutra-content-timeline__when">' + escapeHTML(event.when) + '</p>';
      if (event.description) html += '<p class="sutra-content-timeline__description">' + escapeHTML(event.description) + '</p>';
      html += '</li>';
    });
    html += '</ol></section>';
    return html;
  }

  var api = Object.freeze({
    VERSION: VERSION,
    create: create,
    normalize: normalize,
    inspect: inspect,
    addEvent: addEvent,
    updateEvent: updateEvent,
    removeEvent: removeEvent,
    reorderEvents: reorderEvents,
    renderHTML: renderHTML,
    toPlainText: toPlainText
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SutraContentTimeline = api;
}(typeof window !== 'undefined' ? window : globalThis));
