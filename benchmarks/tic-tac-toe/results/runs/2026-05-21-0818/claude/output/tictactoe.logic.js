const WINNING_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function checkWinner(board) {
  for (const line of WINNING_LINES) {
    const [a,b,c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return null;
}

function getGameStatus(board) {
  const result = checkWinner(board);
  if (result) return { status: 'won', winner: result.winner, line: result.line };
  if (board.every(cell => cell !== null)) return { status: 'draw', winner: null, line: null };
  return { status: 'in_progress', winner: null, line: null };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkWinner, getGameStatus, WINNING_LINES };
}
