// Smoke-test for tictactoe.html: load both inline <script> blocks under a
// minimal DOM + localStorage stub, drive a winning game, then "reload" and
// confirm scores persisted.
//
// Not a unit test — verification harness invoked once during completion check.

const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = readFileSync(path.join(__dirname, '..', 'tictactoe.html'), 'utf8');

// Extract ALL <script> blocks in order.
const scripts = [];
const scriptRe = /<script>([\s\S]*?)<\/script>/g;
let m;
while ((m = scriptRe.exec(html)) !== null) scripts.push(m[1]);
assert.equal(scripts.length, 2, 'expected exactly 2 inline <script> blocks');

// ---- DOM + localStorage stub ----
function makeStore() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(),
    _dump: () => Object.fromEntries(data),
  };
}

function makeElement(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    parent: null,
    attrs: {},
    dataset: {},
    classList: {
      _set: new Set(),
      add(...cs) { for (const c of cs) this._set.add(c); },
      remove(...cs) { for (const c of cs) this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    _text: '',
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    _className: '',
    get className() { return this._className; },
    set className(v) {
      this._className = String(v);
      const tokens = this._className.trim().split(/\s+/).filter(Boolean);
      this.classList._set = new Set(tokens);
    },
    type: '',
    disabled: false,
    _listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(child) { child.parent = this; this.children.push(child); return child; },
    addEventListener(ev, fn) {
      (this._listeners[ev] = this._listeners[ev] || []).push(fn);
    },
    dispatchEvent(ev) {
      const list = this._listeners[ev.type] || [];
      for (const fn of list) fn({ currentTarget: this, type: ev.type });
    },
    click() { this.dispatchEvent({ type: 'click' }); },
  };
  return el;
}

function makeDocument() {
  const byId = new Map();
  const ids = ['board', 'status', 'score-x', 'score-o', 'score-draws', 'restart', 'reset-scores'];
  for (const id of ids) {
    const el = makeElement('div');
    el.attrs.id = id;
    byId.set(id, el);
  }
  return {
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => makeElement(tag),
    _byId: byId,
  };
}

function freshContext(store) {
  const win = {};
  const ctx = {
    module: { exports: {} },
    exports: {},
    console,
    window: win,
    document: makeDocument(),
    localStorage: store,
  };
  ctx.window.localStorage = store;
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  return ctx;
}

// ============================================================
// Smoke 1: Fresh session — X wins top row, score should be 1/0/0
// ============================================================
const store = makeStore();
const ctx1 = freshContext(store);

vm.runInContext(scripts[0], ctx1); // logic block
vm.runInContext(scripts[1], ctx1); // UI block

const doc1 = ctx1.document;
const board1 = doc1.getElementById('board');
const status1 = doc1.getElementById('status');
const scoreX1 = doc1.getElementById('score-x');
const scoreO1 = doc1.getElementById('score-o');
const scoreDraws1 = doc1.getElementById('score-draws');

assert.equal(board1.children.length, 9, 'board should have 9 cells');
assert.equal(scoreX1.textContent, '0', 'X score starts at 0');
assert.equal(scoreO1.textContent, '0', 'O score starts at 0');
assert.equal(scoreDraws1.textContent, '0', 'Draws start at 0');
assert.match(status1.textContent, /X/, 'initial status mentions X');

// Drive an X win on top row: X=0, O=3, X=1, O=4, X=2
[0, 3, 1, 4, 2].forEach((i) => board1.children[i].click());

assert.equal(scoreX1.textContent, '1', 'X score should be 1 after X wins');
assert.equal(scoreO1.textContent, '0', 'O score should still be 0');
assert.equal(scoreDraws1.textContent, '0', 'Draws should still be 0');
assert.match(status1.textContent, /X/i, 'status should mention X win');

// Winning cells should have 'win' class on the top row
for (const idx of [0, 1, 2]) {
  assert.ok(board1.children[idx].classList.contains('win'), `cell ${idx} should have win class`);
}

// localStorage should have been written
const stored = store.getItem('ticTacToe:scores:v1');
assert.ok(stored, 'localStorage key should be set');
const parsed = JSON.parse(stored);
assert.deepEqual(parsed, { x: 1, o: 0, draws: 0 }, 'stored scores reflect X win');

// ============================================================
// Smoke 2: "Reload" — fresh context, same store, scores must restore
// ============================================================
const ctx2 = freshContext(store);
vm.runInContext(scripts[0], ctx2);
vm.runInContext(scripts[1], ctx2);

const scoreX2 = ctx2.document.getElementById('score-x');
const scoreO2 = ctx2.document.getElementById('score-o');
const scoreDraws2 = ctx2.document.getElementById('score-draws');

assert.equal(scoreX2.textContent, '1', 'X score should persist across reload');
assert.equal(scoreO2.textContent, '0', 'O score should be 0 after reload');
assert.equal(scoreDraws2.textContent, '0', 'Draws should be 0 after reload');

// ============================================================
// Smoke 3: Restart clears the board, keeps scores
// ============================================================
const board2 = ctx2.document.getElementById('board');
const restartBtn = ctx2.document.getElementById('restart');

// Make a couple moves
board2.children[0].click(); // X at 0
board2.children[1].click(); // O at 1
assert.equal(board2.children[0].textContent, 'X');
assert.equal(board2.children[1].textContent, 'O');

restartBtn.click();
for (let i = 0; i < 9; i++) {
  assert.equal(board2.children[i].textContent, '', `cell ${i} cleared after restart`);
}
assert.equal(scoreX2.textContent, '1', 'X score retained after restart');

// ============================================================
// Smoke 4: Reset scores zeroes counters AND localStorage
// ============================================================
const resetBtn = ctx2.document.getElementById('reset-scores');
resetBtn.click();
assert.equal(scoreX2.textContent, '0', 'X score zeroed after reset');
assert.equal(scoreO2.textContent, '0', 'O score zeroed after reset');
assert.equal(scoreDraws2.textContent, '0', 'Draws zeroed after reset');
assert.deepEqual(JSON.parse(store.getItem('ticTacToe:scores:v1')), { x: 0, o: 0, draws: 0 });

// ============================================================
// Smoke 5: Draw scenario
// ============================================================
const store3 = makeStore();
const ctx3 = freshContext(store3);
vm.runInContext(scripts[0], ctx3);
vm.runInContext(scripts[1], ctx3);

const board3 = ctx3.document.getElementById('board');
const status3 = ctx3.document.getElementById('status');
const scoreDraws3 = ctx3.document.getElementById('score-draws');

// Drive a draw: X,O,X / X,O,O / O,X,X
// Sequence of moves alternating X/O: X@0, O@4, X@2, O@1, X@7, O@5, X@3, O@6, X@8
// Let's just play any draw sequence:
// X O X
// X O O
// O X X
// Move order (X,O,X,O,...): X=0, O=1, X=2, O=4, X=7, O=5, X=3, O=6, X=8
[0, 1, 2, 4, 7, 5, 3, 6, 8].forEach((i) => board3.children[i].click());

// Verify it's actually a draw (no winner)
assert.match(status3.textContent, /draw/i, 'status should say Draw');
assert.equal(scoreDraws3.textContent, '1', 'draws counter should be 1');

console.log('SMOKE OK: 5 scenarios passed');
console.log('  - Fresh game → X wins top row → score 1/0/0 → win class on cells');
console.log('  - Reload (new context, same localStorage) → scores restored');
console.log('  - Restart clears board, keeps scores');
console.log('  - Reset scores zeros counters + storage');
console.log('  - Draw scenario increments draws counter');
