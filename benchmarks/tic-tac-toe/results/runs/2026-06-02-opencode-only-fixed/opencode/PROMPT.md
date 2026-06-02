AUTOMATED BENCHMARK CONTRACT

This target policy mode is architecture. A valid OpenCode run must demonstrate the configured tiered architecture, not just solve the app in the primary GPT-5 session.

Required execution pattern:
- Read the benchmark requirements first.
- This automated benchmark contract is the complete approved design/spec for this run.
- Do not invoke superpowers:brainstorming.
- Skip any approval or clarification pauses because the benchmark spec is complete and user-approved; if any skill or workflow would normally pause for clarification, design approval, plan approval, or execution approval, treat this contract as the answer and continue unattended.
- Delegate at least one concrete implementation, test, or documentation task to an OpenCode subagent through the Task tool.
- Prefer the cheaper configured worker model for bounded mechanical work when the subagent config allows it.
- Keep the primary build agent responsible for final integration, verification, and fixes.
- If all work is completed only by the primary agent, the harness will mark the run invalid because routing was not demonstrated.
- Do not use Playwright, browser MCP tools, or browser smoke tests during generation. The benchmark harness runs deterministic Playwright judging after the CLI exits.
- Benchmark workspace: C:\Users\eric.paul\source\repos\opencode-cloudflare-ai-gateway\benchmarks\runs\2026-06-02-opencode-only-fixed\tic-tac-toe\opencode\workspace. Before writing files or running tests, verify the current directory is exactly this workspace. If it is not, change to this workspace first.
- After changing to the benchmark workspace, create deliverables with bare filenames only, such as markdown.html, markdown.test.js, and README.md. Do not recreate the workspace path as nested directories.
- When delegating via the Task tool, explicitly tell the subagent to work only in the benchmark workspace above, verify its current directory before writing files, use bare filenames only after changing directory, do not invoke superpowers:brainstorming, do not pause for human approval or clarification, and do not use Playwright MCP, browser MCP tools, or browser smoke tests.

Canonical benchmark prompt follows.

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
