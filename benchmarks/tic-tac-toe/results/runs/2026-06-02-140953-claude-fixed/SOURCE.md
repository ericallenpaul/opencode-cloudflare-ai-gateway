# Source

This directory preserves the successful Claude-only corrected rerun for tic-tac-toe.

- Original benchmark RunId: `2026-06-02-140953`
- Tool included: `claude`
- Reason for separate directory: the same-day all-tool run in `../2026-06-02-140953/` contains the Codex artifact used for comparison, but its Claude artifact was an earlier failed attempt. This corrected rerun was executed with the same benchmark prompt/spec/judge after the harness isolated Claude MCP configuration for unattended execution.
- Functional result: 10/10 R1-R10, no timeout.
