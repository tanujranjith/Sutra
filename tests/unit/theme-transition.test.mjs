import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../../src/ui/theme-transition.js', import.meta.url), 'utf8');
function setup({ supported = true, reduced = false } = {}) {
  let listener, snapshots = 0;
  const applied = [], classes = new Set();
  const document = {
    body: { classList: { contains: () => false } }, hidden: false,
    documentElement: { classList: { add: value => classes.add(value), remove: value => classes.delete(value) } },
    addEventListener: (_name, callback) => { listener = callback; }
  };
  if (supported) document.startViewTransition = callback => {
    snapshots++;
    const update = Promise.resolve().then(callback);
    return { ready: update, finished: update.then(() => {}), skipTransition() {} };
  };
  vm.runInNewContext(source, { document, window: { matchMedia: () => ({ matches: reduced }) } });
  function choice(name) {
    const control = { isConnected: true, classList: { contains: () => false }, getAttribute: () => null };
    control.click = () => {
      const event = { button: 0, defaultPrevented: false, target: { closest: () => control },
        preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() {} };
      listener(event);
      if (!event.defaultPrevented) applied.push(name);
    };
    return control;
  }
  return { choice, applied, classes, snapshots: () => snapshots };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('theme animation invokes the canonical click exactly once and clears its temporary class', async () => {
  const app = setup(); app.choice('ocean').click();
  await settle();
  assert.deepEqual(app.applied, ['ocean']);
  assert.equal(app.snapshots(), 1);
  assert.equal(app.classes.size, 0);
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
