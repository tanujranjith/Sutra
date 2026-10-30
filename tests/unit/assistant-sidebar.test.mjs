import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const window = {};
vm.runInNewContext(readFileSync(new URL('../../src/features/assistant/assistant-sidebar.js', import.meta.url), 'utf8'), {
  window, document: {readyState:'loading',addEventListener() {}}
});
const diff = window.SutraAssistantSidebar.diff;
test('a comma insertion is one exact punctuation edit', () => {
  const before = 'Thanks Professor';
  const changes = diff(before, 'Thanks, Professor');
  assert.equal(changes.length, 1);
  assert.equal(changes[0].from, 6);
  assert.equal(changes[0].to, 6);
  assert.equal(changes[0].after, ',');
});
function apply(before, changes) {
  let result = before;
  for (const change of [...changes].reverse()) {
    assert.equal(before.slice(change.from,change.to),change.before);
    result=result.slice(0,change.from)+change.after+result.slice(change.to);
  }
  return result;
}
test('word corrections retain untouched text and exact offsets', () => {
  const before='I has two note.',after='I have two notes.';
  const changes=diff(before,after);
  assert.deepEqual(Array.from(changes,c=>c.before),['has','note']);
  assert.deepEqual(Array.from(changes,c=>c.after),['have','notes']);
  assert.equal(apply(before,changes),after);
});
test('insertions, removals, whitespace, Unicode, and markup stay literal', () => {
  for (const [before,after] of [
    ['', 'Hello'],['Hello',''],['same','same'],['One, two','One; two!'],
    ['I like 🤖 robots.','I love 🤖 robots.'],['A  word\nB','A word\n\nB'],
    ['Safe text','<img src=x onerror=alert(1)>'],['has '.repeat(350),'have '.repeat(350)]
  ]) assert.equal(apply(before,diff(before,after)),after);
});
test('a small correction in a long passage remains local', () => {
  const before='unchanged '.repeat(900)+'detials'+' unchanged'.repeat(900);
  const changes=diff(before,before.replace('detials','details'));
  assert.equal(changes.length,1);
  assert.equal(changes[0].before,'detials');
  assert.equal(changes[0].after,'details');
});
