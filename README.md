# opencode-cloudflare-ai-gateway

I wanted to see whether a tiered setup could save money without lowering quality. OpenCode supports a lot of different models, which made it the right tool for this experiment. This repo is the result of that experiment: OpenCode routed through [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/), with a frontier model still responsible for orchestration and cheaper workers only used where the benchmarks show they can hold up.

The first version of this idea was too naive: push more work to a very cheap hosted OSS model and enjoy the savings. GLM 4.7 Flash routed correctly and cost almost nothing, but it failed the harder markdown-editor benchmark on parser correctness, XSS safety, and self-tests. So the lesson was not "use the cheapest model." The lesson was "use the cheapest model that can reliably do this specific job."

Right now the setup I trust is:

- `build` orchestrator: `openai-via-gateway/gpt-5`
- `coder` subagent: `openai-via-gateway/gpt-5-mini`
- `searcher`, `reader`, `planner` subagents: `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash`
- manual `local`, `oss`, and `frontier` agents remain available for explicit overrides

The goal is cost-per-correct-result, not lowest sticker price per token. The benchmark harness is part of the setup because it catches the difference between "that was cheap" and "that was cheap and actually worked."

> **A note up front:** I'm new to [OpenCode](https://opencode.ai). This isn't a deep tour of the tool -- it's one engineer's working setup, written down. But the shape of this setup -- tiered models, single gateway, per-user attribution -- feels right for the next few years of AI-assisted development, and the steps below are what it took to actually get there. If you're further along on OpenCode than I am, I'd genuinely welcome a PR or issue that sharpens any of this.

> **About pricing in this doc:** all dollar figures are "as of May 2026" and provided for rough magnitude comparison only. Provider pricing moves constantly. Always confirm current pricing against each provider's published rate card before making cost decisions.

## Benchmark Takeaway

The selected benchmark set now covers three targets: `markdown-editor`, `react-todo-api-db`, and `tic-tac-toe`. OpenCode produced a 10/10 judged output on all three. Codex also reached 10/10 on all three selected rows; Claude reached 10/10 on `tic-tac-toe` and 9/10 on the other two. The cost pattern is the important result: OpenCode was cheaper on every selected row.

| Benchmark | OpenCode | Codex CLI | Claude Code |
|---|---:|---:|---:|
| `markdown-editor` | **10/10, $0.83** | 10/10, $1.35 | 9/10, $4.93 |
| `react-todo-api-db` | **10/10, $0.193** | 10/10, $2.032 | 9/10, $1.580 |
| `tic-tac-toe` | **10/10, $0.1753, 805,731 tokens** | 10/10, $3.0120, 3,352,097 tokens | 10/10, $3.0039, 8,942,555 tokens |

The cleanest structured token snapshot is `tic-tac-toe`: OpenCode used about 4x fewer tokens than Codex and 11x fewer than Claude, while passing the same 10/10 deterministic judge. Selected cost snapshots range from 1.6x cheaper on the easiest completed row to roughly 17x cheaper on `tic-tac-toe`.

Cost-source note: the current automated runner pulls OpenCode cost from Cloudflare AI Gateway analytics when available. The `tic-tac-toe` OpenCode cost is gateway-backed; the older selected `markdown-editor` and `react-todo-api-db` rows are `ccusage` retail-equivalent snapshots captured before that gateway artifact was added.

Full details, source artifacts, and caveats live in [`benchmarks/RESULTS.md`](benchmarks/RESULTS.md).

## The Problem

I do not think local models are going to make paid tokens disappear for serious coding work. Local models keep getting better, but the frontier keeps moving too. For the hard parts of the job -- ambiguous requirements, architecture, debugging, review -- I still want a frontier model in the loop.

So the lever is not "avoid paying." The lever is "make each paid token do the job it is actually needed for."

The better version is reliability-based routing:

- **Frontier orchestrator** for decomposition, ambiguity, fallback, integration, final review, and user-facing accountability
- **Capable cheap coder** for concrete implementation and tests where the spec is clear
- **Very cheap mechanical workers** for search, file reading, extraction, and narrow planning
- **One gateway** in front of every paid provider, so every dollar shows up in one analytics view
- **Per-user and per-project metadata tagging** so a shared team gateway can attribute spend by person and project
- **Deterministic benchmark gates** so a cheap route has to prove it produced correct output

More detail on the reasoning lives in [`docs/PROBLEM.md`](docs/PROBLEM.md).

## Current Setup

| Role | Current model | Why |
|---|---|---|
| `build` | `openai-via-gateway/gpt-5` | Owns judgment, integration, fallback, final verification |
| `coder` | `openai-via-gateway/gpt-5-mini` | Produces successful implementation artifacts at much lower cost than frontier-direct runs on the selected benchmark set |
| `searcher` | `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash` | Cheap and reliable enough for bounded search/file discovery |
| `reader` | `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash` | Cheap and reliable enough for local file summarization/extraction |
| `planner` | `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash` | Useful for compact plans/risk lists when the primary gives narrow context |
| `local`, `oss`, `frontier` | manual override agents | Available for explicit experiments and escape hatches |

Local models can reduce costs further, but on my laptop they are too slow to be practical for daily coding. Tool calling and context size heavily affect which local models are usable.

See [`docs/CURRENT-STRATEGY.md`](docs/CURRENT-STRATEGY.md) for the routing table and evidence behind it.

## Quick Start

The fastest way to know whether you have everything in place is to run the diagnostic:

```powershell
# Windows
.\scripts\check-setup.ps1
```

```bash
# macOS / Linux / Git Bash
./scripts/check-setup.sh
```

It checks the important prerequisites: OpenCode, environment variables, `opencode.json`, Superpowers plugin wiring, MCP servers, and optional local-model setup. Pass `-InstallConfig` / `--install-config` and it will copy `opencode.example.json` into place with a backup of any existing config.

The manual setup path is:

1. Install OpenCode: `npm install -g opencode-ai`
2. Create a Cloudflare AI Gateway and store provider API keys in BYOK / bring-your-own-key.
3. Set `CF_ACCOUNT_ID`, `CF_GATEWAY_NAME`, and `CF_AIG_TOKEN` environment variables.
4. Copy `opencode.example.json` to `~/.config/opencode/opencode.json`.
5. Copy `.opencode\agents\` from this repo to `%USERPROFILE%\.config\opencode\agents\`, next to `opencode.json`, so the included orchestrator and worker subagents are available globally.
6. Verify model reachability with `.\scripts\verify-models.ps1` or `./scripts/verify-models.sh`.

Full walkthrough with screenshots and gotchas: [`docs/SETUP.md`](docs/SETUP.md).

## Benchmark Evidence

The front-page summary is intentionally short. The selected result tables, source artifact links, cost ratios, token caveats, invalidated-run notes, and methodology context live in [`benchmarks/RESULTS.md`](benchmarks/RESULTS.md) and [`benchmarks/README.md`](benchmarks/README.md).

## Why One Gateway

Cloudflare AI Gateway gives me one control plane in front of Anthropic, OpenAI, Google, Workers AI, and anything else I route through it:

- Provider keys stay server-side in BYOK.
- Every request can carry `cf-aig-metadata` such as `{app, user}`.
- Spend and usage show up in one analytics view.
- Identical requests can be cached.
- Rate limits and fallbacks can live outside the client.

The gateway hop adds some latency, but the trade-off is worth it. The gateway turns model routing into something visible and auditable.

## Why Cloudflare AI Gateway

The trigger for this repo was Cloudflare's [Internal AI Engineering Stack post](https://blog.cloudflare.com/internal-ai-engineering-stack/), where they describe routing tens of millions of internal AI requests per month through their own AI Gateway, with OpenCode as one of the engineer-facing clients. The thesis here -- tiered models, one gateway, per-user attribution, OpenCode as the client -- is basically the OSS-scale shape of what they shipped at company scale.

I did not pick Cloudflare reflexively. I compared it against several multi-provider options and cared most about provider feature fidelity: if Anthropic, OpenAI, or another provider ships something new, I do not want the gateway silently stripping or translating it away. Cloudflare's transparent-proxy shape fit that requirement, and I already had an account, so I did not have to run infrastructure just to get a proxy.

The deeper gateway evaluation and architecture trade-offs are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/LEARNINGS.md`](docs/LEARNINGS.md).

## Documentation

- [`docs/SETUP.md`](docs/SETUP.md) -- full setup walkthrough
- [`docs/CURRENT-STRATEGY.md`](docs/CURRENT-STRATEGY.md) -- current routing table and operating rule
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) -- provider setup, routing shape, and orchestration boundaries
- [`benchmarks/README.md`](benchmarks/README.md) -- benchmark methodology, caveats, and selected results
- [`docs/LEARNINGS.md`](docs/LEARNINGS.md) -- gotchas discovered while building this
- [`docs/LSP-INTEGRATION.md`](docs/LSP-INTEGRATION.md) -- OpenCode LSP setup
- [`docs/MCP-INTEGRATION.md`](docs/MCP-INTEGRATION.md) -- MCP tool choices and how they interact with the tiers

## Status

Working today:

- All configured providers reachable through the gateway
- Reliability-based OpenCode orchestration: `gpt-5` primary `build`, `gpt-5-mini` `coder`, GLM-backed `searcher`/`reader`/`planner`
- Automatic `app` + `user` metadata tagging on gateway requests
- Baseline MCP integration: `context7`, `cloudflare-docs`, and `snyk`
- LSP integration with `"lsp": {}` and the experimental agent-callable `lsp` tool
- Included `searcher`, `reader`, `coder`, and `planner` subagents invoked through OpenCode's Task tool
- Superpowers process skills integrated into the workflow where they fit
- Reproducible benchmark infrastructure with deterministic Playwright judging and qualitative review prompts

## License

MIT -- see [`LICENSE`](LICENSE).

## Contributing

This is a personal-use foundation released as OSS in case it saves someone else the weeks of debugging it took. Issues and PRs welcome, but no commitment to maintenance pace.
