# Tic Tac Toe

## Open the Game

Double-click `tictactoe.html`, or open it directly from a browser with a `file://` URL. The game is self-contained and does not need a server, package install, or build step.

## Run the Tests

Use Node.js built-in test runner:

```sh
node --test tictactoe.test.js
```

The tests read the inline logic from `tictactoe.html` and verify win detection, draw detection, in-progress detection, score updates, score persistence helpers, and required browser controls.

## Scope

Included:
- Two-player local play on the same device, with X moving first.
- Visual win and draw detection.
- Winning cells plus the winning line are highlighted.
- Restart button resets the board while keeping scores.
- Persistent X wins, O wins, and draw totals using `localStorage`.
- Inline CSS and JavaScript only.
- Command-line tests using only Node.js built-ins.

Out of scope:
- Computer opponent or online play.
- Build tooling, npm packages, or external assets.

## Known Gaps

None found during verification.
