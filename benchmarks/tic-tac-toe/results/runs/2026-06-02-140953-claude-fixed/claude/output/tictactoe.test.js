import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Extract JavaScript from HTML file for testing
const html = readFileSync(join(__dirname, 'tictactoe.html'), 'utf-8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('No script tag found in HTML');

// Execute in isolated context to extract testable functions
const { createContext, runInContext } = await import('node:vm');

// Mock DOM elements for test environment
const mockElement = () => ({
  textContent: '',
  disabled: false,
  classList: { add: () => {}, remove: () => {} },
  addEventListener: () => {},
  dataset: {},
});

const sandbox = {
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
  document: {
    querySelectorAll: () => Array(9).fill(null).map(() => mockElement()),
    getElementById: () => mockElement(),
  },
  window: {},
};
const context = createContext(sandbox);
runInContext(scriptMatch[1], context);

// Wrap functions to normalize realm-specific objects
const plain = (val) => val === null || val === undefined ? val : JSON.parse(JSON.stringify(val));

export const checkWinner = (board) => plain(sandbox.checkWinner(board));
export const checkDraw = (board) => plain(sandbox.checkDraw(board));
export const getWinningLine = (board) => plain(sandbox.getWinningLine(board));
export const loadScores = (storage) => plain(sandbox.loadScores(storage));
export const saveScores = (storage, scores) => sandbox.saveScores(storage, scores);

test('test harness loads successfully', () => {
  assert.ok(checkWinner, 'checkWinner function should be exported');
  assert.ok(checkDraw, 'checkDraw function should be exported');
  assert.ok(getWinningLine, 'getWinningLine function should be exported');
});

test('checkWinner detects horizontal win in row 0', () => {
  const board = ['X', 'X', 'X', null, null, null, null, null, null];
  assert.equal(checkWinner(board), 'X');
});

test('checkWinner detects horizontal win in row 1', () => {
  const board = [null, null, null, 'O', 'O', 'O', null, null, null];
  assert.equal(checkWinner(board), 'O');
});

test('checkWinner detects horizontal win in row 2', () => {
  const board = [null, null, null, null, null, null, 'X', 'X', 'X'];
  assert.equal(checkWinner(board), 'X');
});

test('checkWinner detects vertical win in column 0', () => {
  const board = ['X', null, null, 'X', null, null, 'X', null, null];
  assert.equal(checkWinner(board), 'X');
});

test('checkWinner detects vertical win in column 1', () => {
  const board = [null, 'O', null, null, 'O', null, null, 'O', null];
  assert.equal(checkWinner(board), 'O');
});

test('checkWinner detects vertical win in column 2', () => {
  const board = [null, null, 'X', null, null, 'X', null, null, 'X'];
  assert.equal(checkWinner(board), 'X');
});

test('checkWinner detects diagonal win (top-left to bottom-right)', () => {
  const board = ['X', null, null, null, 'X', null, null, null, 'X'];
  assert.equal(checkWinner(board), 'X');
});

test('checkWinner detects diagonal win (top-right to bottom-left)', () => {
  const board = [null, null, 'O', null, 'O', null, 'O', null, null];
  assert.equal(checkWinner(board), 'O');
});

test('checkDraw returns false for incomplete game', () => {
  const board = ['X', 'O', 'X', null, null, null, null, null, null];
  assert.equal(checkDraw(board), false);
});

test('checkDraw returns false when there is a winner', () => {
  const board = ['X', 'X', 'X', 'O', 'O', null, null, null, null];
  assert.equal(checkDraw(board), false);
});

test('checkDraw returns true for a full board with no winner', () => {
  const board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
  assert.equal(checkDraw(board), true);
});

test('getWinningLine returns horizontal line indices', () => {
  const board = ['X', 'X', 'X', null, null, null, null, null, null];
  assert.deepEqual(getWinningLine(board), [0, 1, 2]);
});

test('getWinningLine returns vertical line indices', () => {
  const board = ['X', null, null, 'X', null, null, 'X', null, null];
  assert.deepEqual(getWinningLine(board), [0, 3, 6]);
});

test('getWinningLine returns diagonal line indices', () => {
  const board = ['X', null, null, null, 'X', null, null, null, 'X'];
  assert.deepEqual(getWinningLine(board), [0, 4, 8]);
});

test('getWinningLine returns null for no winner', () => {
  const board = ['X', 'O', null, null, null, null, null, null, null];
  assert.equal(getWinningLine(board), null);
});

test('loadScores returns default scores when localStorage is empty', () => {
  const mockStorage = {
    getItem: () => null,
    setItem: () => {},
  };
  const scores = loadScores(mockStorage);
  assert.deepEqual(scores, { X: 0, O: 0, draws: 0 });
});

test('loadScores parses scores from localStorage', () => {
  const mockStorage = {
    getItem: () => '{"X":3,"O":2,"draws":1}',
    setItem: () => {},
  };
  const scores = loadScores(mockStorage);
  assert.deepEqual(scores, { X: 3, O: 2, draws: 1 });
});

test('saveScores writes scores to localStorage', () => {
  let saved = null;
  const mockStorage = {
    getItem: () => null,
    setItem: (key, value) => { saved = { key, value }; },
  };
  saveScores(mockStorage, { X: 5, O: 3, draws: 2 });
  assert.equal(saved.key, 'tictactoe-scores');
  assert.equal(saved.value, '{"X":5,"O":3,"draws":2}');
});
