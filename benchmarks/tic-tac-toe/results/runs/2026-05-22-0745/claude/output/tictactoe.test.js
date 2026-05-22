'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function loadGameContext() {
  const html = fs.readFileSync(path.join(__dirname, 'tictactoe.html'), 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('No <script> block found in tictactoe.html');
  // Run in this realm so returned arrays share Array.prototype with test arrays
  // (vm.createContext gives the script its own intrinsics, breaking deepStrictEqual).
  // The HTML's inline script guards all DOM code behind `typeof document !== 'undefined'`,
  // which is false in Node, so only the pure logic runs.
  vm.runInThisContext(match[1]);
  return globalThis;
}

const game = loadGameContext();

test('checkWinner: empty board returns no winner', () => {
  const board = [null, null, null, null, null, null, null, null, null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, null);
  assert.equal(result.line, null);
});

test('checkWinner: top row X win', () => {
  const board = ['X','X','X', null,null,null, null,null,null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'X');
  assert.deepEqual(result.line, [0,1,2]);
});

test('checkWinner: middle row O win', () => {
  const board = [null,null,null, 'O','O','O', null,null,null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'O');
  assert.deepEqual(result.line, [3,4,5]);
});

test('checkWinner: bottom row X win', () => {
  const board = [null,null,null, null,null,null, 'X','X','X'];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'X');
  assert.deepEqual(result.line, [6,7,8]);
});

test('checkWinner: left column O win', () => {
  const board = ['O',null,null, 'O',null,null, 'O',null,null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'O');
  assert.deepEqual(result.line, [0,3,6]);
});

test('checkWinner: middle column X win', () => {
  const board = [null,'X',null, null,'X',null, null,'X',null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'X');
  assert.deepEqual(result.line, [1,4,7]);
});

test('checkWinner: right column O win', () => {
  const board = [null,null,'O', null,null,'O', null,null,'O'];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'O');
  assert.deepEqual(result.line, [2,5,8]);
});

test('checkWinner: main diagonal X win', () => {
  const board = ['X',null,null, null,'X',null, null,null,'X'];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'X');
  assert.deepEqual(result.line, [0,4,8]);
});

test('checkWinner: anti-diagonal O win', () => {
  const board = [null,null,'O', null,'O',null, 'O',null,null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'O');
  assert.deepEqual(result.line, [2,4,6]);
});

test('checkWinner: in-progress game returns no winner', () => {
  const board = ['X','O','X', null,'O',null, null,null,null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, null);
  assert.equal(result.line, null);
});

test('checkWinner: full board with no winner', () => {
  const board = ['X','O','X', 'X','O','O', 'O','X','X'];
  const result = game.checkWinner(board);
  assert.equal(result.winner, null);
  assert.equal(result.line, null);
});

test('isDraw: empty board is not a draw', () => {
  const board = [null,null,null, null,null,null, null,null,null];
  assert.equal(game.isDraw(board), false);
});

test('isDraw: partially filled board is not a draw', () => {
  const board = ['X','O',null, null,'X',null, null,null,'O'];
  assert.equal(game.isDraw(board), false);
});

test('isDraw: full board with no winner IS a draw', () => {
  const board = ['X','O','X', 'X','O','O', 'O','X','X'];
  assert.equal(game.isDraw(board), true);
});

test('isDraw: full board with a winner is NOT a draw', () => {
  const board = ['X','X','X', 'O','O',null, null,null,null];
  assert.equal(game.isDraw(board), false);
});
