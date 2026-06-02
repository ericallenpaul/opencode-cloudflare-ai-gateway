const assert = require('node:assert').strict;
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadExports() {
  const htmlPath = path.resolve(process.cwd(), 'tictactoe.html');
  let html;
  try {
    html = fs.readFileSync(htmlPath, 'utf8');
  } catch (err) {
    throw new Error(`Could not read tictactoe.html at ${htmlPath}: ${err.message}`);
  }

  const re = /\/\* EXPORTS_START \*\/[\s\S]*?\/\* EXPORTS_END \*\//;
  const match = html.match(re);
  if (!match) {
    throw new Error('EXPORTS block not found in tictactoe.html (look for /* EXPORTS_START */ ... /* EXPORTS_END */)');
  }

  // Extract the inner code between the markers
  const innerRe = /\/\* EXPORTS_START \*\/( [\s\S]*? )\/\* EXPORTS_END \*\//;
  // Use a looser capture to allow for no leading space
  const innerMatch = html.match(/\/\* EXPORTS_START \*\/[\s\S]*?\n([\s\S]*?)\n[\t ]*\/\* EXPORTS_END \*\//);
  const code = (innerMatch && innerMatch[1]) || '';
  if (!code.trim()) {
    throw new Error('No JS code found between EXPORTS markers in tictactoe.html');
  }

  // Prepare sandbox where globalThis and window point to the same object
  const sandbox = {};
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);

  try {
    const script = new vm.Script(code, { filename: 'tictactoe-exports.js' });
    script.runInContext(context, { timeout: 1000 });
  } catch (err) {
    throw new Error(`Error evaluating exported JS from tictactoe.html: ${err.message}`);
  }

  const calculateWinner = sandbox.calculateWinner || sandbox.globalThis && sandbox.globalThis.calculateWinner || sandbox.window && sandbox.window.calculateWinner;
  const isDraw = sandbox.isDraw || sandbox.globalThis && sandbox.globalThis.isDraw || sandbox.window && sandbox.window.isDraw;

  if (typeof calculateWinner !== 'function' || typeof isDraw !== 'function') {
    throw new Error('Expected calculateWinner and isDraw functions to be defined on globalThis/window in the EXPORTS block');
  }

  return { calculateWinner, isDraw };
}

// Helper to build board arrays
const X = 'X';
const O = 'O';
const N = null;

test('X wins on top row [0,1,2]', () => {
  const { calculateWinner } = loadExports();
  const board = [X, X, X, N, N, N, N, N, N];
  assert.strictEqual(calculateWinner(board), 'X');
});

test('O wins on left column [0,3,6]', () => {
  const { calculateWinner } = loadExports();
  const board = [O, N, N, O, N, N, O, N, N];
  assert.strictEqual(calculateWinner(board), 'O');
});

test('X wins on diagonal [0,4,8]', () => {
  const { calculateWinner } = loadExports();
  const board = [X, N, N, N, X, N, N, N, X];
  assert.strictEqual(calculateWinner(board), 'X');
});

test('No winner for in-progress mixed board', () => {
  const { calculateWinner } = loadExports();
  const board = [X, O, X, O, X, N, N, O, N];
  // Expect null or undefined when no winner; prefer strict equality to null
  const result = calculateWinner(board);
  assert.ok(result === null || result === undefined, `Expected no winner (null/undefined) but got ${result}`);
});

test('Draw true for full board with no winner', () => {
  const { isDraw, calculateWinner } = loadExports();
  const board = [X, O, X, X, O, O, O, X, X];
  assert.strictEqual(calculateWinner(board) === null || calculateWinner(board) === undefined, true, 'Expected no winner for draw board');
  assert.strictEqual(isDraw(board), true);
});

test('Draw false for empty board', () => {
  const { isDraw } = loadExports();
  const board = [N, N, N, N, N, N, N, N, N];
  assert.strictEqual(isDraw(board), false);
});
