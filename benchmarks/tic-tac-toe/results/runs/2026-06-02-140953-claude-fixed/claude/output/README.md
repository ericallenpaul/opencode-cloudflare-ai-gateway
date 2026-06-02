# Tic-Tac-Toe Game

A self-contained tic-tac-toe game implemented as a single HTML file with persistent scoring.

## How to Play

1. **Open the game**: Double-click `tictactoe.html` or open it in any modern web browser
2. **Take turns**: Click cells to place X or O (players alternate automatically)
3. **Win conditions**: Get three in a row (horizontal, vertical, or diagonal)
4. **Restart**: Click the "Restart Game" button to start a new round
5. **Score tracking**: Wins and draws are tracked and persist across browser sessions

## How to Run Tests

The game includes unit tests for win/draw detection logic.

**Requirements**: Node.js 18+ (uses built-in test runner)

**Run all tests**:
```bash
node --test tictactoe.test.js
```

**Expected output**: All tests pass (19 tests total)

## Scope

**Included**:
- ✅ Two-player local play (X vs O)
- ✅ Visual win detection with highlighted winning line
- ✅ Draw detection
- ✅ Restart button
- ✅ Persistent score tracking via localStorage
- ✅ Works from file:// URLs (no server required)
- ✅ No external dependencies
- ✅ Unit tests runnable with Node.js built-in test runner

**Not Included**:
- ❌ Single-player AI opponent
- ❌ Online multiplayer
- ❌ Mobile app version
- ❌ Undo/redo functionality
- ❌ Customizable player names or symbols

## Technical Details

- **Technology**: Pure vanilla JavaScript, HTML5, CSS3
- **Storage**: localStorage for score persistence
- **Testing**: Node.js VM-based test harness extracts and tests game logic
- **Browser compatibility**: Modern browsers with localStorage support (Chrome, Firefox, Safari, Edge)

## File Structure

- `tictactoe.html` - Complete game (HTML, CSS, JavaScript)
- `tictactoe.test.js` - Unit tests for game logic
- `README.md` - This file
