import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractFunction } from '../helpers/extract-function.mjs';

const source = readFileSync(new URL('../../src/features/workspace/notifications.js', import.meta.url), 'utf8');
const ageHelper = extractFunction(source, '_partitionNotificationAges').body;

test('browser alerts require opt-in and granted permission, deduplicate and open their source', () => {
  const sent = [], opened = [], read = [];
  class Notification {
    static permission = 'default';
    constructor(title, options) { this.title = title; this.options = options; sent.push(this); }
  }
  const global = { Notification, focus() {} };
  const state = { prefs: { enabled: true, browserNotificationsEnabled: false } };
  const notify = new Function('global', 'Notification', '_state', '_browserNotifiedKeys', 'markRead', '_openSourceItem',
    ageHelper + extractFunction(source, '_sendBrowserNotification').body + '; return _sendBrowserNotification;')(
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
  state.prefs.browserNotificationsEnabled = false;
  notify({ ...item, key: 'disabled-new-reminder' });
  assert.equal(sent.length, 1);
});

function compile(name, dependencies) {
  return new Function(...Object.keys(dependencies), ageHelper + extractFunction(source, name).body + `; return ${name};`)(...Object.values(dependencies));
}

test('constructor failure does not suppress a later retry and master Off prevents alerts', () => {
  let attempts = 0;
  class Notification {
    static permission = 'granted';
    constructor() { if (++attempts === 1) throw new Error('platform unavailable'); }
  }
  const state = { prefs: { enabled: true, browserNotificationsEnabled: true } };
  const sent = {};
  const notify = compile('_sendBrowserNotification', {
    global: { Notification }, Notification, _state: state, _browserNotifiedKeys: sent,
    markRead() {}, _openSourceItem() {}
  });
  const item = { key: 'retry', title: 'Due', relativeTime: 'Now' };
  assert.equal(notify(item), false);
  assert.equal(sent.retry, undefined);
  assert.equal(notify(item), true);
  assert.equal(notify(item), false);
  state.prefs.enabled = false;
  assert.equal(notify({ ...item, key: 'disabled' }), false);
  assert.equal(attempts, 2);
});

test('existing urgent reminders can produce one browser alert without replaying in-app toasts', () => {
  const current = [{ key: 'existing', priority: 'urgent', title: 'Already due', read: false }];
  let browserAlerts = 0, toasts = 0;
  const sent = new Set();
  const send = item => { if (!sent.has(item.key)) { sent.add(item.key); browserAlerts += 1; } };
  const showNew = compile('_showNewUrgentToasts', { showToast() { toasts += 1; }, markRead() {}, _openSourceItem() {}, openPanel() {} });
  const refresh = compile('refresh', {
    _notifications: current, _deriveNotifications: () => current,
    _panelOpen: false, _renderPanel() {}, _updateBadge() {}, _startupGraceDone: true,
    _inQuietHours: () => false, _showNewUrgentToasts: showNew, _sendBrowserNotification: send
  });
  refresh();
  refresh();
  assert.equal(browserAlerts, 1);
  assert.equal(toasts, 0);
});

test('notification destinations open specific tasks, homework and canonical Timeline sources', () => {
  const opened = [];
  const timeline = { source: 'timeline', sourceId: 'event-9', sourceView: 'timeline' };
  const open = compile('_openSourceItem', { global: {
    flowAtelier: {
      openTaskModal: id => opened.push(['task', id]),
      collectWorkspaceDeadlines: () => [timeline, { source: 'task', sourceId: 'task-3' }, { source: 'homework', sourceId: 'hw-4' }, { source: 'milestone', sourceId: 'milestone-parent' }],
      openDeadlineSource: item => opened.push(['deadline', item]),
      setActiveView: view => opened.push(['view', view])
    },
    openHomeworkTaskModal: (version, id) => opened.push([version, id])
  } });
  open('task', 'task-3');
  open('homework', 'hw-4');
  open('timeline', 'event-9');
  open('timeline', 'missing');
  open('task', 'deleted-task');
  open('milestone', 'milestone-parent');
  assert.deepEqual(opened, [['task', 'task-3'], ['v2', 'hw-4'], ['deadline', timeline], ['view', 'timeline'], ['view', 'today'], ['view', 'homework']]);
});

for (const mode of ['missing', 'throw', 'reject', 'granted', 'denied']) {
  test(`notification permission handles ${mode} and always finishes the callback`, async () => {
    const Notification = { permission: 'default' };
    if (mode !== 'missing') Notification.requestPermission = () => {
      if (mode === 'throw') throw new Error('blocked API');
      return mode === 'reject' ? Promise.reject(new Error('blocked API')) : Promise.resolve(mode);
    };
    let registered = 0;
    const request = compile('requestBrowserPermission', {
      global: { Notification }, Notification,
      registerBackgroundReminders: () => { registered += 1; }
    });
    const result = await new Promise(resolve => request(resolve));
    assert.equal(result, mode === 'missing' ? 'unsupported' : ['throw', 'reject'].includes(mode) ? 'error' : mode);
    assert.equal(registered, mode === 'granted' ? 1 : 0);
  });
}

test('Send test reports browser submission separately from the in-app fallback', () => {
  const toasts = [], requests = [];
  let available = false;
  const send = compile('sendTestNotification', {
    _sendBrowserNotification: item => { requests.push(item); return available; },
    showToast: toast => toasts.push(toast)
  });
  send();
  available = true;
  send();
  assert.match(toasts[0].subtitle, /In-app test only/);
  assert.match(toasts[1].subtitle, /Browser alert requested/);
  assert.equal(requests.length, 2);
});

test('browser-alert button disables opt-in without requesting permission again', () => {
  const state = { prefs: { browserNotificationsEnabled: true } };
  const Notification = { permission: 'granted' };
  let permissionRequests = 0;
  const label = compile('_getBrowserPermLabel', { _state: state, global: { Notification }, Notification });
  const toggle = compile('toggleBrowserNotifications', {
    _state: state,
    updatePreferences: delta => Object.assign(state.prefs, delta),
    requestBrowserPermission: () => { permissionRequests += 1; },
    _getBrowserPermLabel: label
  });
  assert.equal(label(), 'Turn off browser alerts');
  toggle({ disabled: false });
  assert.equal(state.prefs.browserNotificationsEnabled, false);
  assert.equal(permissionRequests, 0);
  assert.equal(label(), 'Enable browser alerts');
});

test('enabling browser alerts waits for permission and restores the button on failure', () => {
  const state = { prefs: { browserNotificationsEnabled: false } };
  let finish;
  const toggle = compile('toggleBrowserNotifications', {
    _state: state,
    updatePreferences: delta => Object.assign(state.prefs, delta),
    requestBrowserPermission: callback => { finish = callback; },
    _getBrowserPermLabel: () => 'Could not enable — try again'
  });
  const button = { disabled: false, textContent: '' };
  toggle(button);
  assert.equal(button.disabled, true);
  finish('error');
  assert.equal(button.disabled, false);
  assert.equal(state.prefs.browserNotificationsEnabled, false);
  assert.match(button.textContent, /try again/);
  toggle(button);
  finish('granted');
  assert.equal(button.disabled, false);
  assert.equal(state.prefs.browserNotificationsEnabled, true);
});

for (const mode of ['off', 'master-off', 'on', 'disabled-during-registration']) {
  test(`background reminder registration respects opt-out: ${mode}`, async () => {
    const state = { prefs: { enabled: mode !== 'master-off', browserNotificationsEnabled: mode !== 'off' } };
    const calls = [];
    let release, started;
    const pending = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { started = resolve; });
    const Notification = { permission: 'granted' };
    const registration = { periodicSync: {
      register: async tag => {
        calls.push(['register', tag]);
        started();
        if (mode === 'disabled-during-registration') await pending;
      },
      unregister: async tag => calls.push(['unregister', tag])
    } };
    const reconcile = compile('registerBackgroundReminders', {
      _state: state, global: { Notification }, Notification,
      navigator: {
        serviceWorker: { ready: Promise.resolve(registration) },
        permissions: { query: async () => ({ state: 'granted' }) }
      }
    });
    const result = reconcile();
    if (mode === 'disabled-during-registration') {
      await entered;
      state.prefs.browserNotificationsEnabled = false;
      release();
    }
    await result;
    assert.deepEqual(calls, mode === 'on' ? [['register', 'sutra-daily-reminder']]
      : mode === 'disabled-during-registration' ? [['register', 'sutra-daily-reminder'], ['unregister', 'sutra-daily-reminder']]
      : [['unregister', 'sutra-daily-reminder']]);
  });
}

for (const initiallyEnabled of [false, true]) {
  test(`background reminder reconciliation follows the final preference after ${initiallyEnabled ? 'on-to-off' : 'off-to-on'} overlap`, async () => {
    const state = { prefs: { enabled: true, browserNotificationsEnabled: initiallyEnabled } };
    const calls = [];
    let release, started, registered = initiallyEnabled;
    const gate = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { started = resolve; });
    async function change(kind) {
      calls.push(kind);
      if (calls.length === 1) { started(); await gate; }
      registered = kind === 'register';
    }
    const registration = { periodicSync: {
      register: async () => change('register'),
      unregister: async () => change('unregister')
    } };
    const Notification = { permission: 'granted' };
    const reconcile = compile('registerBackgroundReminders', {
      _state: state, global: { Notification }, Notification,
      navigator: { serviceWorker: { ready: Promise.resolve(registration) },
        permissions: { query: async () => ({ state: 'granted' }) } }
    });
    const first = reconcile();
    await entered;
    state.prefs.browserNotificationsEnabled = !initiallyEnabled;
    const second = reconcile();
    assert.equal(calls.length, 1, 'the later operation waits for the in-flight browser mutation');
    release();
    await Promise.all([first, second]);
    assert.equal(registered, !initiallyEnabled, 'the final browser state matches the latest preference');
    assert.equal(calls.at(-1), initiallyEnabled ? 'unregister' : 'register');
  });
}
