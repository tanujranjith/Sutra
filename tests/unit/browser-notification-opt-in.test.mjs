import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/features/workspace/notifications.js', import.meta.url), 'utf8');

test('browser alerts require opt-in and granted permission, deduplicate and open their source', () => {
  const sent = [], opened = [], read = [];
  class Notification {
    static permission = 'default';
    constructor(title, options) { this.title = title; this.options = options; sent.push(this); }
  }
  const global = { Notification, focus() {} };
  const state = { prefs: { browserNotificationsEnabled: false } };
  const notify = new Function('global', 'Notification', '_state', '_browserNotifiedKeys', 'markRead', '_openSourceItem',
    extractFunction(source, '_sendBrowserNotification').body + '; return _sendBrowserNotification;')(
    global, Notification, state, {}, key => read.push(key), (...args) => opened.push(args));
  const item = { key: 'deadline-1', title: 'Lab due', subtitle: 'Chemistry', relativeTime: 'Today', source: 'homework', sourceId: 'task-1' };
  notify(item);
  state.prefs.browserNotificationsEnabled = true;
  notify(item);
  Notification.permission = 'denied';
  notify(item);
  assert.equal(sent.length, 0);
  Notification.permission = 'granted';
  notify(item);
  notify(item);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, 'Lab due');
  assert.equal(sent[0].options.tag, 'sutra-deadline-1');
  sent[0].onclick();
  assert.deepEqual(read, ['deadline-1']);
  assert.deepEqual(opened, [['homework', 'task-1']]);
});
