import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const timeline = require('../../src/domain/content-timeline.js');

test('normalization is repeatable and preserves authored order, stable IDs, and unknown data', () => {
  const source = {
    version: 1,
    events: [
      {
        id: 'event-start',
        label: 'Start',
        hostEvent: { review: ['draft', 'approved'] }
      },
      { id: 'event-finish', label: 'Finish', when: 'Whenever it is ready', description: '' }
    ],
    hostData: { color: 'indigo', nested: { enabled: true } }
  };
  const original = structuredClone(source);

  const first = timeline.normalize(source);
  const second = timeline.normalize(source);

  assert.deepEqual(first, second);
  assert.deepEqual(first.events.map((event) => event.id), ['event-start', 'event-finish']);
  assert.deepEqual(first.events[0].hostEvent, { review: ['draft', 'approved'] });
  assert.deepEqual(first.hostData, { color: 'indigo', nested: { enabled: true } });
  assert.equal(first.title, '');
  assert.equal(first.layout, 'vertical');
  assert.equal(first.events[0].when, '');
  assert.equal(first.events[0].description, '');
  assert.deepEqual(source, original);
});

test('immutable event edits keep unknown fields and existing IDs while adding a unique ID', () => {
  const source = {
    version: 1,
    title: 'Research plan',
    layout: 'vertical',
    hostData: { owner: 'science club' },
    events: [
      { id: 'event-a', label: 'Choose question', when: 'Week one', description: '', hostEvent: { rubric: 3 } },
      { id: 'event-b', label: 'Collect sources', when: 'Week two', description: '', hostEvent: { links: ['local'] } }
    ]
  };
  const original = structuredClone(source);

  const updated = timeline.updateEvent(source, 'event-a', { label: 'Refine question' });
  const reordered = timeline.reorderEvents(updated, ['event-b', 'event-a']);
  const added = timeline.addEvent(reordered, { label: 'Share findings', when: 'Later', description: '' });
  const removed = timeline.removeEvent(added, 'event-b');

  assert.notStrictEqual(updated, source);
  assert.notStrictEqual(updated.events, source.events);
  assert.equal(source.events[0].label, 'Choose question');
  assert.deepEqual(source, original);
  assert.equal(updated.hostData.owner, 'science club');
  assert.deepEqual(updated.events[0].hostEvent, { rubric: 3 });
  assert.deepEqual(reordered.events.map((event) => event.id), ['event-b', 'event-a']);
  assert.deepEqual(added.events.map((event) => event.id).slice(0, 2), ['event-b', 'event-a']);
  assert.ok(added.events[2].id);
  assert.equal(new Set(added.events.map((event) => event.id)).size, 3);
  assert.deepEqual(removed.events.map((event) => event.id), ['event-a', added.events[2].id]);
  assert.deepEqual(removed.events[0].hostEvent, { rubric: 3 });
  assert.deepEqual(removed.hostData, { owner: 'science club' });
});

test('future-version models stay read-only and normalization preserves their nested payload', () => {
  const future = {
    version: 7,
    title: { format: 'rich-title' },
    events: [{ id: 'future-id', steps: [{ kind: 'branch', options: ['a', 'b'] }] }],
    extension: { checksum: 'keep-exactly', flags: [false, null, 12] }
  };
  const original = structuredClone(future);

  assert.deepEqual(timeline.inspect(future), {
    supported: false,
    readOnly: true,
    kind: 'future',
    reason: 'future-version'
  });
  assert.deepEqual(timeline.normalize(future), original);
  assert.equal(timeline.addEvent(future, { label: 'New' }), null);
  assert.equal(timeline.updateEvent(future, 'future-id', { label: 'Changed' }), null);
  assert.equal(timeline.removeEvent(future, 'future-id'), null);
  assert.equal(timeline.reorderEvents(future, ['future-id']), null);
  assert.deepEqual(future, original);
});

test('malformed duplicate event IDs are reported and remain unchanged', () => {
  const malformed = {
    version: 1,
    title: 'Imported timeline',
    extension: { source: ['archive', { retained: true }] },
    events: [
      { id: 'duplicate', label: 'First copy' },
      { id: 'duplicate', label: 'Second copy' }
    ]
  };
  const original = structuredClone(malformed);
  const status = timeline.inspect(malformed);

  assert.equal(status.supported, false);
  assert.equal(status.readOnly, true);
  assert.equal(status.kind, 'malformed');
  assert.equal(status.reason, 'duplicate-event-id');
  assert.deepEqual(timeline.normalize(malformed), original);
  assert.equal(timeline.removeEvent(malformed, 'duplicate'), null);
  assert.deepEqual(malformed, original);
});

test('reordering requires each current ID exactly once', () => {
  const source = {
    version: 1,
    events: [
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' }
    ]
  };
  const original = structuredClone(source);

  const reordered = timeline.reorderEvents(source, ['three', 'one', 'two']);

  assert.deepEqual(reordered.events.map((event) => event.id), ['three', 'one', 'two']);
  assert.equal(timeline.reorderEvents(source, ['one', 'two']), null);
  assert.equal(timeline.reorderEvents(source, ['one', 'two', 'two']), null);
  assert.equal(timeline.reorderEvents(source, ['one', 'two', 'missing']), null);
  assert.deepEqual(source, original);
});

test('HTML rendering escapes authored markup and plain text retains every complete event', () => {
  const longDescription = 'Research notes '.repeat(220) + 'FINAL-DETAIL';
  const source = {
    version: 1,
    title: 'Plan <img src=x onerror=alert(1)> & "quotes"',
    events: [
      {
        id: 'unsafe',
        label: '<script>alert("x")</script>',
        when: '<svg/onload=alert(1)> anytime',
        description: longDescription
      },
      { id: 'last', label: 'Last event', when: 'No fixed date', description: 'Keep this ending.' }
    ]
  };

  const html = timeline.renderHTML(source);
  const plainText = timeline.toPlainText(source);

  assert.match(html, /Plan &lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;quotes&quot;/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&lt;svg\/onload=alert\(1\)&gt; anytime/);
  assert.doesNotMatch(html, /<script\b|<img\b|<svg\b/i);
  assert.ok(plainText.includes('<script>alert("x")</script>'));
  assert.ok(plainText.includes(longDescription));
  assert.ok(plainText.includes('Last event'));
  assert.ok(plainText.includes('Keep this ending.'));
});
