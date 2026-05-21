// tictactoe.test.js - cycle 1: single failing test first
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadLogic(){
  const html = fs.readFileSync('./tictactoe.html','utf8');
  const m = /\/\/\s*LOGIC_EXPORT_START([\s\S]*?)\/\/\s*LOGIC_EXPORT_END/.exec(html);
  if (!m) throw new Error('Logic block not found');
  const code = m[1];
  const sandbox = { console };
  vm.runInNewContext(code, sandbox, { filename: 'logic-inline.js' });
  return sandbox.TicTacToe;
}

describe('TicTacToe logic - cycle 1', () => {
  test('detects X horizontal win on top row', () => {
    const { calcWinner } = loadLogic();
    const board = [ 'X','X','X', '', '', '', '', '', '' ];
    const r = calcWinner(board);
    assert.equal(r.winner, 'X');
    // Coerce sandbox array to this realm for deep comparison
    assert.deepEqual(Array.from(r.line), [0,1,2]);
  });
});

// Cycle 2: additional failing tests before implementing draw helper fully
const { describe: describe2, test: test2 } = require('node:test');

describe2('TicTacToe logic - cycle 2', () => {
  test2('detects O diagonal win', () => {
    const { calcWinner } = loadLogic();
    const board = [ 'O', '', '', '', 'O', '', '', '', 'O' ];
    const r = calcWinner(board);
    assert.equal(r.winner, 'O');
    assert.deepEqual(Array.from(r.line), [0,4,8]);
  });

  test2('detects column win (X in middle column)', () => {
    const { calcWinner } = loadLogic();
    const board = [ '', 'X', '', '', 'X', '', '', 'X', '' ];
    const r = calcWinner(board);
    assert.equal(r.winner, 'X');
    assert.deepEqual(Array.from(r.line), [1,4,7]);
  });

  test2('detects draw when board full and no winner', () => {
    const { isDraw } = loadLogic();
    const board = [ 'X','O','X', 'X','O','O', 'O','X','X' ];
    assert.equal(isDraw(board), true);
  });

  test2('score helpers load defaults and persist to storage', () => {
    const { loadScore, saveScore } = loadLogic();
    const fake = (()=>{ const m=new Map(); return { getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)) }; })();
    const s0 = loadScore(fake);
    const s0c = { x: s0.x, o: s0.o, d: s0.d }; // coerce to this realm
    assert.deepEqual(s0c, {x:0,o:0,d:0});
    const s1 = {x:2,o:3,d:4};
    saveScore(fake, s1);
    const s2 = loadScore(fake);
    const s2c = { x: s2.x, o: s2.o, d: s2.d };
    assert.deepEqual(s2c, s1);
  });
});
