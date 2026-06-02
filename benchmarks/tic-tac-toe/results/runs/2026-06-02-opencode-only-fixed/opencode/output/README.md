Tic Tac Toe — Benchmark Workspace

This repository contains a small, self-contained Tic Tac Toe web game used for benchmark/tests. The app is a single HTML file with inline CSS and JavaScript and a Node-based test file that extracts pure helper functions from the HTML for unit testing.

Open the game
- Locate tictactoe.html in this workspace and open it in your browser (double-click or use File > Open). Using the file:// URL is fine for local testing.
- If you prefer a local server, serve the folder (e.g. with a lightweight static server) and open the served URL in your browser.

Run the tests
- No npm install or external dependencies required.
- From this workspace run the Node built-in test runner:

  node --test

  (Or run a specific test file: node --test tictactoe.test.js)

How the tests work
- The test harness (tictactoe.test.js) reads tictactoe.html and extracts the JavaScript contained between the marker comments /* EXPORTS_START */ and /* EXPORTS_END */. It evaluates that snippet inside a Node vm sandbox where globalThis and window point to the same object and then checks for two exported functions: calculateWinner and isDraw. Make sure those markers and exported names are present if you change the HTML.

Implementation notes
- Single-file implementation: tictactoe.html contains all CSS and JS inline (no external files).
- Test-target helpers: calculateWinner(board) and isDraw(board) are defined inside the EXPORTS block and attached to the global/window object so the Node tests can import them.
- Persistence: the app persists scores to localStorage using the key: "tic_tac_toe_scores_v1".
- Accessibility: the board uses role="grid" and an aria-label; controls are basic. The UI is intentionally minimal but reasonably keyboard/click usable.

Scope — what’s included and what’s intentionally out
- In: Single-page game (tictactoe.html), unit tests (tictactoe.test.js) that validate pure helper functions, no build or install steps.
- Out: No external dependencies, no server-side components, no packaged npm project, no AI opponent. The UI is simple and not a full production-grade accessibility implementation.

Troubleshooting
- If tests fail with "EXPORTS block not found" or "No JS code found between EXPORTS markers", open tictactoe.html and verify the exact marker comments exist: /* EXPORTS_START */ and /* EXPORTS_END */ and that the functions calculateWinner and isDraw are attached to globalThis/window inside that block.
- If the exported functions are present but tests error when evaluating the snippet, ensure you are running a compatible Node version. Node >= 18 is recommended (vm.Script timeouts and the built-in test runner are available and stable in Node 18+).

Contact / Notes
- This workspace is intentionally small and self-contained for benchmarking. If you modify the HTML structure, prefer keeping the EXPORTS block and exported function names unchanged so the tests keep working.
