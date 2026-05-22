const test = require('node:test');
const assert = require('node:assert/strict');
const { computeWinner, isDraw } = require('./tictactoe-logic');

const X = 'X';
const O = 'O';

function B(...cells) { return cells; }

const LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

test('no winner on empty board', () => {
  assert.equal(computeWinner(B(null,null,null,null,null,null,null,null,null)), null);
});

test('detects X wins across all lines', () => {
  for (const line of LINES) {
    const b = Array(9).fill(null);
    for (const i of line) b[i] = X;
    assert.deepEqual(computeWinner(b), { winner: X, line });
  }
});

test('detects O wins across all lines', () => {
  for (const line of LINES) {
    const b = Array(9).fill(null);
    for (const i of line) b[i] = O;
    assert.deepEqual(computeWinner(b), { winner: O, line });
  }
});

test('prefers first found line but any correct line is OK when multiple (unlikely in valid play)', () => {
  const b = [X,X,X, X,X,X, null,null,null]; // two winning rows
  const res = computeWinner(b);
  assert.ok(res && res.winner === X && Array.isArray(res.line));
});

test('isDraw true when full board and no winner', () => {
  const b = [X,O,X, X,O,O, O,X,O];
  assert.equal(computeWinner(b), null);
  assert.equal(isDraw(b), true);
});

test('isDraw false when spaces remain', () => {
  const b = [X,O,X, X,null,O, O,X,O];
  assert.equal(isDraw(b), false);
});

test('isDraw false when winner exists even if full', () => {
  const b = [X,X,X, O,O,X, O,X,O];
  assert.notEqual(computeWinner(b), null);
  assert.equal(isDraw(b), false);
});
