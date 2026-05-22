'use strict';

const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function computeWinner(board) {
  for (const line of WIN_LINES) {
    const [a,b,c] = line;
    const v = board[a];
    if (v && v === board[b] && v === board[c]) {
      return { winner: v, line };
    }
  }
  return null;
}

function isDraw(board) {
  return computeWinner(board) === null && board.every(cell => cell === 'X' || cell === 'O');
}

module.exports = { computeWinner, isDraw, WIN_LINES };
