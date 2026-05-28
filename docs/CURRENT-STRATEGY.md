# Current Strategy

As of 2026-05-28, the recommended setup is reliability-based routing, not blanket cheap-model routing.

## Model Assignments

| Role | Model | Rationale |
|---|---|---|
| `build` primary orchestrator | `openai-via-gateway/gpt-5` | Keeps judgment, ambiguity handling, fallback decisions, integration review, and final user-facing accountability on the strongest configured model. |
| `coder` subagent | `openai-via-gateway/gpt-5-mini` | Best current balance of reliability and cost for implementation. It passed the markdown-editor benchmark where GLM failed. |
| `searcher` subagent | `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash` | Cheap and sufficient for bounded repository discovery, grep/glob/LSP lookup, and file inventory. |
| `reader` subagent | `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash` | Cheap and sufficient for reading local files and extracting facts when the primary gives exact scope. |
| `planner` subagent | `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash` | Cheap and sufficient for compact plans, risk lists, and decomposition when the task is narrow. |
| `local` primary override | `ollama/granite4:7b-a1b-h` | Experimental/manual read-only path. Local inference is not currently the daily-driver recommendation on this hardware. |

## Evidence

The decisive benchmark is `markdown-editor`, because it exercises parser correctness, XSS safety, live browser behavior, tests, documentation, and model routing.

Latest all-tool run: `2026-05-27-105622`

| Tool | Models observed | Cost | Result |
|---|---|---:|---|
| OpenCode | `gpt-5`, `gpt-5-mini` | $0.3888 | Core deterministic judge passed; perf partial |
| Codex | `gpt-5.5`, `gpt-5.4-mini` | $1.0080 | Core deterministic judge passed; perf partial |
| Claude Code | `claude-opus-4-7`, `claude-haiku-4-5` | $1.2273 | Failed browser runtime rendering despite passing its own tests |

Important failed experiment: GLM as `coder`

- It routed correctly.
- It was cheap.
- It produced broken markdown behavior, unsafe XSS behavior, and self-tests that did not prove the actual browser output.
- Conclusion: GLM is a good mechanical worker candidate, not a safe default implementation worker for this class of task.

## Operating Rule

Use the cheapest model that has proven reliable for the specific role:

- Search/read/extract: GLM.
- Implement/test/docs: `gpt-5-mini`.
- Architect/debug/integrate/final-review: `gpt-5`.
- If a worker returns incomplete, contradictory, unsafe, or unverifiable output, retry once only when missing context is likely; otherwise escalate.

## What This Is Not

This is not an automatic global model router. It is an OpenCode-native orchestrator configuration plus a benchmark harness that validates whether routing happened and whether output stayed correct.

This is also not a claim that OpenCode is always better or cheaper. The claim is narrower: in the current markdown-editor benchmark, the OpenCode configuration matched Codex's functional result at materially lower measured cost.
