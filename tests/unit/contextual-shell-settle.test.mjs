import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../../src/features/workspace/contextual-shell.js', import.meta.url), 'utf8');

function setup() {
  const listeners = new Map();
  const frames = [];
  const timers = [];
  function classList(initial = []) {
    const values = new Set(initial);
    return {
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
      contains(name) { return values.has(name); },
      toggle(name, force) {
        const enabled = force === undefined ? !values.has(name) : !!force;
        if (enabled) values.add(name); else values.delete(name);
        return enabled;
      }
    };
  }
  const body = { dataset: { view: 'today' }, classList: classList() };
  const styleValues = new Map();
  const stylePriorities = new Map();
  const sidebarAttributes = new Map();
  const sidebar = {
    dataset: {},
    classList: classList(),
    style: {
      getPropertyValue(name) { return styleValues.get(name) || ''; },
      getPropertyPriority(name) { return stylePriorities.get(name) || ''; },
      setProperty(name, value, priority = '') { styleValues.set(name, value); stylePriorities.set(name, priority); }
    },
    getAttribute(name) { return sidebarAttributes.has(name) ? sidebarAttributes.get(name) : null; },
    setAttribute(name, value) { sidebarAttributes.set(name, String(value)); },
    hasAttribute(name) { return sidebarAttributes.has(name); },
    removeAttribute(name) { sidebarAttributes.delete(name); }
  };
  const toggle = { hidden: false, setAttribute() {} };
  const overlay = { classList: classList() };
  const document = {
    readyState: 'loading',
    body,
    addEventListener() {},
    getElementById(id) { return ({ sidebar, sidebarToggle: toggle, sidebarOverlay: overlay })[id] || null; }
  };
  const window = {
    innerWidth: 1280,
    addEventListener(name, callback) {
      const entries = listeners.get(name) || [];
      entries.push(callback);
      listeners.set(name, entries);
    },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; }
  };
  vm.runInNewContext(source, { document, window }, { filename: 'contextual-shell.js' });
  return {
    body, sidebar, toggle, frames, timers,
    changeView(view) {
      body.dataset.view = view;
      for (const callback of listeners.get('noteflow:view-changed') || []) callback({ detail: { view } });
    }
  };
}

test('a delayed settlement for an older view cannot override the current sidebar', () => {
  const app = setup();
  app.changeView('notes');
  app.frames[0](); // Notes rAF settles before the next navigation.

  app.changeView('today');
  app.frames[1](); // The current view settles at the next frame.
  assert.equal(app.body.dataset.contextSidebar, 'none');
  assert.equal(app.sidebar.style.getPropertyValue('display'), 'none');

  app.timers[0].callback(); // The older Notes timeout fires after Home is current.
  assert.equal(app.body.dataset.view, 'today');
  assert.equal(app.body.dataset.contextSidebar, 'none');
  assert.equal(app.sidebar.style.getPropertyValue('display'), 'none');
});

test('an older animation-frame settlement follows the live view after two navigations', () => {
  const app = setup();
  app.changeView('notes');
  app.changeView('today');

  app.frames[0](); // The stale Notes callback runs before the current callback.
  assert.equal(app.body.dataset.view, 'today');
  assert.equal(app.body.dataset.contextSidebar, 'none');
  assert.equal(app.sidebar.style.getPropertyValue('display'), 'none');

  app.frames[1]();
  assert.equal(app.body.dataset.contextSidebar, 'none');
  assert.equal(app.sidebar.style.getPropertyValue('display'), 'none');
});

test('an older Home settlement cannot hide the sidebar after navigating to Notes', () => {
  const app = setup();
  app.changeView('today');
  app.changeView('notes');

  app.frames[0](); // The stale Home callback runs while Notes is current.
  assert.equal(app.body.dataset.view, 'notes');
  assert.equal(app.body.dataset.contextSidebar, 'notes');
  assert.equal(app.sidebar.style.getPropertyValue('display'), 'flex');

  app.frames[1]();
  assert.equal(app.body.dataset.contextSidebar, 'notes');
  assert.equal(app.sidebar.style.getPropertyValue('display'), 'flex');
});
