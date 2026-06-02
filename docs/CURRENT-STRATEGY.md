# Current Strategy

As of 2026-06-02, the recommended setup is reliability-based routing, not blanket cheap-model routing.

## Model Assignments

| Role | Model | Rationale |
|---|---|---|
| `build` primary orchestrator | `openai-via-gateway/gpt-5` | Keeps judgment, ambiguity handling, fallback decisions, integration review, and final user-facing accountability on the strongest configured model. |
| `coder` subagent | `openai-via-gateway/gpt-5-mini` | Best current balance of reliability and cost for implementation. It is part of the selected successful OpenCode outputs across `markdown-editor`, `react-todo-api-db`, and `tic-tac-toe`. |
| `searcher` subagent | `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash` | Cheap and sufficient for bounded repository discovery, grep/glob/LSP lookup, and file inventory. |
| `reader` subagent | `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash` | Cheap and sufficient for reading local files and extracting facts when the primary gives exact scope. |
| `planner` subagent | `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash` | Cheap and sufficient for compact plans, risk lists, and decomposition when the task is narrow. |
| `local` primary override | `lmstudio/qwen3-coder-30b-a3b-instruct` | Optional read-only path. Local inference works with the right hardware/runtime setup, but is not currently the daily-driver recommendation on this hardware. |

## Evidence

The selected evidence set now covers three targets:

| Benchmark | Selected result | Claude Code | Codex CLI | OpenCode |
|---|---|---:|---:|---:|
| `markdown-editor` | `2026-05-26-0829` | 9/10 | 10/10 | 10/10 |
| `react-todo-api-db` | `2026-05-31-164112` | 9/10 | 10/10 | 10/10 |
| `tic-tac-toe` | selected 2026-06-02 artifacts | 10/10 | 10/10 | 10/10 |

The clearest structured token/cost comparison is the final `tic-tac-toe` selected snapshot:

| Tool | Models observed | Cost | Total tokens | Result |
|---|---|---:|---:|---:|
| OpenCode | `gpt-5`, `gpt-5-mini` | $0.1753 | 805,731 | 10/10 |
| Claude Code | `claude-sonnet-4-5`, `claude-haiku-4-5` | $3.0039 | 8,942,555 | 10/10 |
| Codex CLI | `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini` | $3.0120 | 3,352,097 | 10/10 |

The headline conclusion did not change: the OpenCode setup produced a quality functional output at materially lower measured cost and token volume. The caveat is now explicit: getting comparable successful outputs from three different agent CLIs and plugin stacks took multiple attempts and harness fixes. That reproducibility friction is part of the benchmark finding.

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

### Manual Overrides

The shipping config also provides three single-agent override modes for ad-hoc use — not the recommended path:

- `oss` — routes everything onto GLM-4.7-flash (cheap hosted experiment, no delegation).
- `frontier` — routes everything onto gpt-5 direct, skipping the mid tier (useful for high-risk debugging).
- `local` — optional LM Studio path for local read-only work; hardware-dependent and not daily-driver on current hardware.

## What This Is Not

This is not an automatic global model router. It is an OpenCode-native orchestrator configuration plus a benchmark harness that validates whether routing happened and whether output stayed correct.

This is also not a claim that OpenCode is always better or cheaper. The claim is narrower: in this selected benchmark set, the OpenCode configuration produced successful functional outputs at materially lower measured cost, after the same specs and deterministic judges were applied to each tool.
