const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { checkWinner, getGameStatus, WINNING_LINES } = require('./tictactoe.logic.js');

function extractInlineLogic() {
  const html = fs.readFileSync(path.join(__dirname, 'tictactoe.html'), 'utf8');
  const start = html.indexOf('const WINNING_LINES');
  const endMarker = '// === State ===';
  const end = html.indexOf(endMarker);
  if (start === -1 || end === -1) throw new Error('Could not locate inline logic in tictactoe.html');
  const source = html.slice(start, end);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source + '\nthis.checkWinner = checkWinner; this.getGameStatus = getGameStatus; this.WINNING_LINES = WINNING_LINES;', sandbox);
  return sandbox;
}

test('checkWinner returns null for an empty board', () => {
  const board = [null, null, null, null, null, null, null, null, null];
  assert.deepEqual(checkWinner(board), null);
});

test('checkWinner detects X winning top row', () => {
  const board = ['X','X','X', null,null,null, null,null,null];
  assert.deepEqual(checkWinner(board), { winner: 'X', line: [0,1,2] });
});

test('checkWinner detects O winning middle row', () => {
  const board = [null,null,null, 'O','O','O', null,null,null];
  assert.deepEqual(checkWinner(board), { winner: 'O', line: [3,4,5] });
});

test('checkWinner detects X winning bottom row', () => {
  const board = [null,null,null, null,null,null, 'X','X','X'];
  assert.deepEqual(checkWinner(board), { winner: 'X', line: [6,7,8] });
});

test('checkWinner detects column win (left)', () => {
  const board = ['X',null,null, 'X',null,null, 'X',null,null];
  assert.deepEqual(checkWinner(board), { winner: 'X', line: [0,3,6] });
});

test('checkWinner detects column win (middle)', () => {
  const board = [null,'O',null, null,'O',null, null,'O',null];
  assert.deepEqual(checkWinner(board), { winner: 'O', line: [1,4,7] });
});

test('checkWinner detects column win (right)', () => {
  const board = [null,null,'X', null,null,'X', null,null,'X'];
  assert.deepEqual(checkWinner(board), { winner: 'X', line: [2,5,8] });
});

test('checkWinner detects diagonal win (top-left to bottom-right)', () => {
  const board = ['X',null,null, null,'X',null, null,null,'X'];
  assert.deepEqual(checkWinner(board), { winner: 'X', line: [0,4,8] });
});

test('checkWinner detects diagonal win (top-right to bottom-left)', () => {
  const board = [null,null,'O', null,'O',null, 'O',null,null];
  assert.deepEqual(checkWinner(board), { winner: 'O', line: [2,4,6] });
});

test('getGameStatus returns in_progress for empty board', () => {
  const board = [null,null,null,null,null,null,null,null,null];
  assert.deepEqual(getGameStatus(board), { status: 'in_progress', winner: null, line: null });
});

test('getGameStatus returns won when a player wins', () => {
  const board = ['X','X','X', null,null,null, null,null,null];
  assert.deepEqual(getGameStatus(board), { status: 'won', winner: 'X', line: [0,1,2] });
});

test('getGameStatus returns draw when board full with no winner', () => {
  const board = ['X','O','X', 'X','O','O', 'O','X','X'];
  assert.deepEqual(getGameStatus(board), { status: 'draw', winner: null, line: null });
});

test('getGameStatus returns in_progress when board partial with no winner', () => {
  const board = ['X','O',null, null,null,null, null,null,null];
  assert.deepEqual(getGameStatus(board), { status: 'in_progress', winner: null, line: null });
});

test('checkWinner does not falsely match three nulls in a row', () => {
  const board = [null,null,null, 'X','O','X', 'O','X','O'];
  assert.equal(checkWinner(board), null);
});

test('checkWinner returns a valid winning line if multiple exist', () => {
  const board = ['X','X','X', 'X','X','X', null,null,null];
  const result = checkWinner(board);
  assert.equal(result.winner, 'X');
  assert.ok(Array.isArray(result.line));
  assert.equal(result.line.length, 3);
});

test('getGameStatus prefers won over draw when full board has a winner', () => {
  const board = ['X','X','X', 'O','O','X', 'O','X','O'];
  const result = getGameStatus(board);
  assert.equal(result.status, 'won');
  assert.equal(result.winner, 'X');
});

const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

test('HTML inline logic matches module: WINNING_LINES', () => {
  const inline = extractInlineLogic();
  assert.ok(jsonEq(inline.WINNING_LINES, WINNING_LINES), 'WINNING_LINES diverged from module');
});

test('HTML inline logic matches module: checkWinner behavior', () => {
  const inline = extractInlineLogic();
  const cases = [
    [null,null,null,null,null,null,null,null,null],
    ['X','X','X', null,null,null, null,null,null],
    [null,null,null, 'O','O','O', null,null,null],
    ['X',null,null, 'X',null,null, 'X',null,null],
    ['X',null,null, null,'X',null, null,null,'X'],
    ['X','O','X', 'X','O','O', 'O','X','X'],
  ];
  for (const board of cases) {
    assert.ok(jsonEq(inline.checkWinner(board), checkWinner(board)), `mismatch on board ${JSON.stringify(board)}`);
  }
});

test('HTML inline logic matches module: getGameStatus behavior', () => {
  const inline = extractInlineLogic();
  const cases = [
    [null,null,null,null,null,null,null,null,null],
    ['X','X','X', null,null,null, null,null,null],
    ['X','O','X', 'X','O','O', 'O','X','X'],
    ['X','O',null, null,null,null, null,null,null],
  ];
  for (const board of cases) {
    assert.ok(jsonEq(inline.getGameStatus(board), getGameStatus(board)), `mismatch on board ${JSON.stringify(board)}`);
  }
});
