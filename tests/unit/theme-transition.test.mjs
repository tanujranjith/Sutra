import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../../src/ui/theme-transition.js', import.meta.url), 'utf8');
function setup({ supported = true, reduced = false, themeKey = 'default' } = {}) {
  let snapshots = 0;
  const listeners = {};
  const applied = [], classes = new Set(), properties = new Map();
  const document = {
    body: { classList: { contains: () => false }, getAttribute: () => themeKey }, hidden: false,
    documentElement: { classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
      style: { setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name) } },
    addEventListener() {}
  };
  if (supported) document.startViewTransition = callback => {
    snapshots++;
    const update = Promise.resolve().then(callback);
    return { ready: update, finished: update.then(() => {}), skipTransition() {} };
  };
  vm.runInNewContext(source, { document, window: {
    matchMedia: () => ({ matches: reduced }),
    addEventListener: (name, callback) => { listeners[name] = callback; },
    Event: class { constructor(type) { this.type = type; } },
    getComputedStyle: () => ({ getPropertyValue: () => applied.at(-1) === 'dark' ? '#101827' : '#faf9f6' })
  } });
  function dispatch(type, control, key) {
    const event = { button: 0, key, defaultPrevented: false, target: control,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() {} };
    listeners[type](event);
    if (!event.defaultPrevented) applied.push(nameFor(control));
  }
  function nameFor(control) { return control.name || control.value; }
  function choice(name, kind = 'preset') {
    const control = { isConnected: true, classList: { contains: () => false }, getAttribute: () => null };
    control.name = name;
    control.closest = selector => {
      if (selector.startsWith('[data-custom-theme-action]')) return kind === 'edit' ? control : null;
      if (selector.includes('#customThemeGrid') && kind === 'custom') return control;
      if (selector.includes('.preset-card[data-theme]') && kind === 'preset') return control;
      if (selector.includes('#applyCustomThemeBtn') && kind === 'apply') return control;
      return null;
    };
    control.click = () => dispatch('click', control);
    control.key = key => dispatch('keydown', control, key);
    return control;
  }
  function select(value) {
    const control = { id: 'customThemeSelect', value, isConnected: true };
    control.dispatchEvent = () => dispatch('change', control);
    control.dispatchEvent();
  }
  return { choice, select, applied, classes, properties, snapshots: () => snapshots };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('theme animation invokes the canonical click exactly once and clears its temporary class', async () => {
  const app = setup(); app.choice('ocean').click();
  await settle();
  assert.deepEqual(app.applied, ['ocean']);
  assert.equal(app.snapshots(), 1);
  assert.equal(app.classes.size, 0);
  assert.equal(app.properties.size, 0, 'temporary backdrop must be removed');
});
test('reduced motion and unsupported browsers keep immediate normal theme clicks', () => {
  for (const options of [{ reduced: true }, { supported: false }]) {
    const app = setup(options); app.choice('dark').click();
    assert.deepEqual(app.applied, ['dark']);
    assert.equal(app.snapshots(), 0);
  }
});
test('rapid clicks finish on the latest chosen theme without replaying intermediate choices', async () => {
  const app = setup();
  app.choice('dark').click(); app.choice('paper').click(); app.choice('ocean').click();
  await settle();
  assert.deepEqual(app.applied, ['dark', 'ocean']);
  assert.equal(app.classes.size, 0);
});

test('custom cards, keyboard activation, Apply, and active-custom selection share the reveal', async () => {
  for (const action of [app => app.choice('custom', 'custom').click(),
    app => app.choice('custom', 'custom').key('Enter'),
    app => app.choice('custom', 'custom').key(' '),
    app => app.choice('custom', 'apply').click(), app => app.select('custom')]) {
    const app = setup({ themeKey: 'custom' }); action(app); await settle();
    assert.deepEqual(app.applied, ['custom']); assert.equal(app.snapshots(), 1);
  }
});
test('editing custom themes and staging a custom selection do not animate', () => {
  const app = setup(); app.choice('edit', 'edit').click(); app.select('staged');
  assert.deepEqual(app.applied, ['edit', 'staged']); assert.equal(app.snapshots(), 0);
});
test('Dune, Blueprint, Paper, and Arcade use the same preset capture path', async () => {
  for (const name of ['dune', 'blueprint', 'paper', 'arcade']) {
    const app = setup(); app.choice(name).click(); await settle();
    assert.deepEqual(app.applied, [name]); assert.equal(app.snapshots(), 1);
  }
});
