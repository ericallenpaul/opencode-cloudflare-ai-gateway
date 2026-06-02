# Tic-Tac-Toe — canonical benchmark prompt

This is the prompt fed verbatim to each tool. **Do not paraphrase or adjust per-tool** — the whole point is that the same input goes to each tool. Copy the block below and paste it into the agent.

---

```text
Build a self-contained tic-tac-toe game as a single HTML file in this directory.

Requirements:
- Two-player local play (X vs O on the same device, taking turns)
- Visual win/draw detection with the winning line highlighted
- Restart button that resets the board
- Persistent score tracker (X wins, O wins, draws) using localStorage that survives page reload
- Inline CSS and JavaScript only — no external dependencies, no build step, no npm
- The HTML file must open and run from disk by double-clicking it (file:// URL)
- Include unit tests for the win/draw detection logic that I can run from the command line with a single command, with no install step required beyond what comes with Node.js (i.e. node --test or similar built-in)

The requirements above are intentionally fully specified for benchmarking purposes. Do NOT pause for clarifying questions, ambiguity exploration, or plan approval — proceed straight through the workflow. If any skill you invoke would normally ask the human for input, treat the requirements above as the answer and continue.

Use the superpowers workflow, in this order, without stopping for human input between steps:
1. superpowers:writing-plans — produce a phased implementation plan and proceed directly to step 2 without asking for plan approval
2. superpowers:test-driven-development — implement against tests (write a failing test, make it pass, repeat) until the plan is complete
3. superpowers:verification-before-completion — run the tests, confirm the HTML file loads, confirm score persistence works, before claiming done

Deliverables when complete:
- The HTML file (call it `tictactoe.html`)
- The test file(s) (call them `tictactoe.test.js` or similar)
- A brief README.md explaining: how to open the game, how to run the tests, what was scoped in/out, and what (if anything) didn't get done
```
