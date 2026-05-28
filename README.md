# opencode-cloudflare-ai-gateway

Benchmark-driven, cost-aware agent orchestration for OpenCode.

The current setup keeps a frontier model accountable for orchestration and final verification, routes bounded implementation to a cheaper-but-still-reliable worker, and reserves very cheap models for work the benchmarks say they can safely handle. Every paid request goes through [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) so model choice, tokens, cost, latency, cache behavior, project tag, and user tag are visible in one place.

This repo is not a "just use a cheaper model" template. The first attempt tried to push too much work onto a very cheap hosted OSS model. GLM 4.7 Flash routed correctly and cost almost nothing, but it failed the harder markdown-editor implementation target on parser correctness, XSS safety, and self-tests. The lesson was that cheap models are useful only when the role is narrow enough for them to stay reliable. The working balanced setup is:

- `build` orchestrator: `openai-via-gateway/gpt-5`
- `coder` subagent: `openai-via-gateway/gpt-5-mini`
- `searcher`, `reader`, `planner` subagents: `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash`
- manual `local`, `oss`, and `frontier` agents remain available for explicit overrides

The project goal is cost-per-correct-result, not lowest sticker price per token. The benchmark harness is part of the architecture because it proves when a cheaper route actually worked and when it only looked cheap.

> **A note up front:** I'm new to [OpenCode](https://opencode.ai). This isn't a deep tour of the tool — it's one engineer's working setup, written down. But the shape of this setup — tiered models, single gateway, per-user attribution — feels right for the next few years of AI-assisted development, and the steps below are what it took to actually get there. If you're further along on OpenCode than I am, I'd genuinely welcome a PR or issue that sharpens any of this.

> **About pricing in this doc:** all dollar figures are "as of May 2026" and provided for rough magnitude comparison only. Provider pricing moves constantly. Always confirm current pricing against each provider's published rate card before making cost decisions.

## The Problem

We're not going to stop paying for tokens. Local models keep getting better, but the frontier keeps moving with them, and the gap that lets you skip the frontier for "real work" keeps shrinking. Within a couple of years the realistic assumption is: **you pay for tokens, period.** The lever is no longer "avoid paying" — it's "make sure each token spent buys the cheapest viable answer."

The failed version of this idea is "move the whole job to a cheaper model." We tested that. It saves money until it quietly loses correctness, security, or verification discipline. The better version is reliability-based routing:

- **Frontier orchestrator** for decomposition, ambiguity, fallback, integration, final review, and user-facing accountability
- **Capable cheap coder** for concrete implementation and tests where the spec is clear
- **Very cheap mechanical workers** for search, file reading, extraction, and narrow planning
- **One gateway** in front of every paid provider, so every dollar shows up in one analytics view
- **Automatic per-user and per-project metadata tagging** (app = directory basename, user = OS user) so a shared team gateway can attribute spend by person and by project
- **Deterministic benchmark gates** so a cheap route has to prove it produced correct output

Full reasoning behind the architecture lives in [`docs/PROBLEM.md`](docs/PROBLEM.md).

## Current Model Strategy

| Role | Current model | Why |
|---|---|---|
| `build` | `openai-via-gateway/gpt-5` | Owns judgment, integration, fallback, final verification |
| `coder` | `openai-via-gateway/gpt-5-mini` | Passed the markdown-editor implementation benchmark with much lower cost than frontier-direct tools |
| `searcher` | `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash` | Cheap and reliable enough for bounded search/file discovery |
| `reader` | `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash` | Cheap and reliable enough for local file summarization/extraction |
| `planner` | `workers-ai-via-gateway/@cf/zai-org/glm-4.7-flash` | Useful for compact plans/risk lists when the primary gives narrow context |
| `local` | `ollama/granite4:7b-a1b-h` | Experimental/manual read-only local tier, not the daily-driver path |

> **Note (2026-05-26):** the **Local tier** is real but not the recommended daily-driver path on my hardware. Through extensive testing we found Ollama's local tool-calling unreliable across most models; LM Studio + qwen3-coder + n_ctx 16384 is the known-working local setup (see [`docs/LEARNINGS.md`](docs/LEARNINGS.md) and [`docs/SETUP.md`](docs/SETUP.md)). Even working, dispatched local subtasks run 20-40s on consumer hardware. If you have ample hardware, local models may be viable for you, but use LM Studio; it integrates better with OpenCode. The current default avoids the local latency trap: keep local as a manual experiment, put implementation on `gpt-5-mini`, and put cheap mechanical work on GLM through the gateway.

See [`docs/CURRENT-STRATEGY.md`](docs/CURRENT-STRATEGY.md) for the authoritative routing table and the evidence behind it.

The gateway-routed catalog still includes Claude Sonnet/Opus/Haiku 4-5 & 4-6, GPT-5 family, GPT-4.1-mini, GPT-4o-mini, Gemini 2.5 Pro/Flash, GLM 4.7 Flash, GPT-OSS 20B/120B, Qwen 3 30B A3B, Llama 3.3 70B, and DeepSeek-R1-distill 32B. Availability is not enough. Models only become defaults after they pass this repo's runtime checks.

> **Balanced worker default (2026-05-28):** GLM remains useful for cheap search/read/planning work, but the markdown-editor architecture benchmark showed it is not reliable enough as the implementation `coder` on harder tasks. The shipped `coder` subagent now uses `openai-via-gateway/gpt-5-mini`; `searcher`, `reader`, and `planner` stay on `@cf/zai-org/glm-4.7-flash`. In the latest all-tool markdown-editor run, OpenCode (`gpt-5` + `gpt-5-mini`) passed the core deterministic judge at $0.3888, while Codex (`gpt-5.5` + `gpt-5.4-mini`) also passed at $1.0080 and Claude (`opus` + `haiku`) failed runtime rendering at $1.2273. The model catalog is broader than the subset OpenCode can reliably drive today; the default follows runtime evidence, not just catalog availability.

## Quick start

The fastest way to know whether you have everything in place is to run the diagnostic:

```powershell
# Windows
.\scripts\check-setup.ps1
```

```bash
# macOS / Linux / Git Bash
./scripts/check-setup.sh
```

It walks every prerequisite (opencode CLI, env vars, opencode.json, superpowers plugin wired up, MCP servers configured, ollama + granite4 model) and prints a PASS/FAIL per item with the exact fix command for anything missing. Pass `-InstallConfig` / `--install-config` and it will copy `opencode.example.json` into place (with a backup of any existing config). The repo's project-local subagents live under `.opencode/agents/`; keep that folder alongside the project when using the orchestrator setup. For automatic app attribution in PowerShell, run `.\scripts\install-opencode-app-tag.ps1` once. Pure diagnostic otherwise -- no env-var writes, no npm installs.

If you'd rather walk through manually, the full sequence is:

1. **Prerequisites:** OpenCode installed (`npm install -g opencode-ai`), Ollama running locally with at least `granite4:7b-a1b-h` pulled, a Cloudflare account with AI Gateway enabled and provider API keys stored in BYOK.
2. **Set three env vars** (Windows user scope, one-time):
   ```powershell
   [Environment]::SetEnvironmentVariable("CF_ACCOUNT_ID", "<your-32char-account-id>", "User")
   [Environment]::SetEnvironmentVariable("CF_GATEWAY_NAME", "<your-gateway-slug>", "User")
   [Environment]::SetEnvironmentVariable("CF_AIG_TOKEN", "<your-gateway-auth-token>", "User")
   ```
3. **Copy the example config** to `~/.config/opencode/opencode.json` and keep this repo's `.opencode/agents/` folder with the project if you want the shipped orchestrator/subagents:
   ```powershell
   Copy-Item .\opencode.example.json $env:USERPROFILE\.config\opencode\opencode.json
   ```
4. **Open a fresh terminal**, then verify everything is reachable:
   ```powershell
   # Windows
   .\scripts\verify-models.ps1
   ```
   ```bash
   # macOS / Linux (requires jq + curl)
   ./scripts/verify-models.sh
   ```
5. **Run it:**
   ```powershell
   opencode run --agent local "say hi"
   opencode run --agent oss "say hi"
   opencode run --agent frontier "say hi"
   ```

Full walkthrough with screenshots and gotchas: [`docs/SETUP.md`](docs/SETUP.md).

## Validation: does the tiered setup actually save money?

Short answer: **yes, when cheap workers are assigned to work they can actually do.** The current balanced result is stronger than the earlier GLM-as-coder attempt: use `gpt-5` for orchestration and final accountability, `gpt-5-mini` for implementation, and keep GLM on search/read/planning. Two benchmark targets are in the repo; the markdown-editor benchmark is now the best evidence because it exercises parser correctness, XSS handling, live-preview event wiring, tests, docs, and model routing in one run.

Latest markdown-editor evidence (`2026-05-27-105622`, native best-orchestrator setup per tool):

| Tool | Models observed | Cost | Deterministic judge |
|---|---|---:|---|
| **OpenCode** | `gpt-5`, `gpt-5-mini` | **$0.3888** | Core R1-R10 pass; perf partial |
| Codex | `gpt-5.5`, `gpt-5.4-mini` | $1.0080 | Core R1-R10 pass; perf partial |
| Claude Code | `claude-opus-4-7`, `claude-haiku-4-5` | $1.2273 | Failed browser runtime rendering despite passing its own `node --test` |

That run makes the current recommendation concrete: OpenCode achieved comparable functional quality to Codex at about 39% of Codex cost on this target. The earlier GLM coder architecture run routed correctly and was cheaper, but failed quality and security checks; it is not the recommended implementation tier.

### Historical benchmark notes

`benchmarks/tic-tac-toe` has been run twice, identical prompt and identical R1-R10 acceptance criteria each time. Both runs across all three tools:

| Tool | Run 1 (05-21) | Run 2 (05-22) | Stable? |
|---|---|---|---|
|  | cost / wall / R1-R10 / quality avg | cost / wall / R1-R10 / quality avg |  |
| **opencode** | $0.28 / 5m18s / 10/10 / 3.0 | $0.25 / 7m02s / 10/10 / 3.2 | yes |
| codex | $1.97 / 9m48s / 10/10 / 4.8 | $2.18 / 11m06s / 10/10 / 4.6 | yes |
| claude | $2.91 / 9m34s / 10/10 / 4.8 | $1.60 / 8m56s / 9/10 / 4.4 | no (see below) |

Models: opencode ran GPT-5 via this repo's gateway stack. codex ran GPT-5 (CLI mis-reports as "gpt-5.5" in session records). claude ran claude-opus-4-7. Quality avg = mean across the 5 quality dimensions (1-5 each), filled in by an agent in the qualitative-judge pass.

What was the same both runs:
- **opencode is cheapest by 6-10x** -- never close to the frontier-direct tools on cost.
- **opencode and codex held 10/10 functional R1-R10** -- working apps.
- **opencode's composite rank is #1 both times** (composite weights cost 50%, quality 30%, bugs 20%).
- **Frontier tools produce higher-quality code** (quality avg ~4.4-4.8) than opencode (~3.0-3.2). The cost reduction comes with a real, measurable polish gap.

Where claude didn't stay stable (the kind of run-to-run noise the methodology warns about):
- Claude got 45% cheaper run-over-run AND lost one R1-R10 criterion. Likely a prompt-cache state difference between runs combined with model nondeterminism.
- Claude vs codex flipped 2nd/3rd in the composite ranking as a result.

Bottom line on tic-tac-toe: **~6-10x cost reduction vs Claude Code, consistently across two runs, paying for it with somewhat lower-polish output.** That trade-off is the whole point of the tiered approach -- use cheap tiers when "working" is good enough, escalate to frontier when polish is the bottleneck.

### A harder benchmark surfaces the trade-off more starkly

`benchmarks/markdown-editor` is a deliberately harder target -- parser correctness, XSS handling, live-preview event wiring, ~300-500 LOC. Five runs completed:

| | run 1 (v1) | run 2 (v2) | run 3 (v3) | run 4 (v5) | run 5 (v6, genuine) |
|---|---|---|---|---|---|
| opencode R1-R10 / quality / cost | 8/10 [INVALIDATED]* / 2.6 / $0.25 | 10/10 [INVALIDATED]* / 2.6 / $0.52 | 10/10 [INVALIDATED]* / 3.4 / $0.52 | 10/10 [INVALIDATED]* / 2.4 / $0.55 | **11/11 / 3.0 / $0.83 -- 12,907-byte README** |
| codex R1-R10 / quality / cost | 10/10 / 4.6 / $1.97 | 10/10 / 4.6 / $2.12 | SKIPPED | SKIPPED | 11/11 / 4.6 / $1.35 |
| claude R1-R10 / quality / cost | 10/10 / 4.4 / $1.60 | 3/10 / 4.4 / $1.43 | 4/10 / 3.8 / $3.63 | 10/10 / 4.6 / $2.09 | 10/11 / 4.4 / $4.93 |

*\* Runs 1-4 are marked INVALIDATED for opencode only: the opencode build-agent prompt iterations v3, v4, and v6 were edited in the repo template (`opencode.example.json`) but the live `~/.config/opencode/opencode.json` was never re-copied between runs. So opencode actually ran with the original baseline prompt across all four. The artifacts are real; the experimental claim that "iterating the prompt didn't help" is not. Claude and codex are unaffected -- they don't use opencode's config -- so their row figures stand. See [`benchmarks/markdown-editor/results/runs/2026-05-26-0829`](benchmarks/markdown-editor/results/runs/2026-05-26-0829/2026-05-26-0829.md) for the first run under the genuinely-active config.*

What this benchmark surfaced that tic-tac-toe couldn't:

- **Cost-tier still wins on cost.** Run 5 (the first valid measurement): opencode $0.83 vs codex $1.35 vs claude $4.93, all 10+/11 functional. Frontier-direct tools remain 1.6x-5.9x more expensive than the gateway-routed cost tier with no functional-quality penalty.
- **Documentation is now a build-time gate, not a measurement axis.** Across runs 1-4 opencode shipped 33-byte to 250-byte READMEs while frontier tools shipped 50-130 line ones. The fix was an executable Node check inside the opencode build-agent verification step (count H2 headings + non-blank lines; exit non-zero on miss). Run 5 confirms: opencode produced a 12,907-byte README the first time the rule was actually present in its config.
- **Cross-tool variance is real.** Claude's run-2 live-preview bug (wrong DOM event), run-3 `</script>` termination, and run-5 missing 11th R-test are all examples. Opencode's run-4 parser drift (literal `\n` in inline HTML's parser) was another. R1-R10 catches a lot but not everything. R11 added in run 5's Playwright suite asserts performance budget; future iterations may add more runtime artifact assertions.

**Methodology disclosure (2026-05-26): the four-iteration "README rule doesn't land" story was wrong.** Between runs 1-4 we iterated the opencode build-agent prompt in the repo template (`opencode.example.json`) -- adding the v3 README template, v4 Playwright 5-step smoke-test, and v6 executable docs-check -- but never copied those changes to the live config at `~/.config/opencode/opencode.json`. Every run used the original baseline prompt. The deliverables in runs 1-4 are real artifacts; the conclusion that prompt-side rules failed to land is not. Once the live config was synced (2026-05-26 07:32, commit `6f910e7`), the very next run (`2026-05-26-0829`) produced the expected behavior: opencode wrote a 12,907-byte README, took composite #1, and the docs-check passed on the first attempt. The repo now ships a `Test-LiveConfigSync` preflight in `bench-run.ps1` that compares the live config's `agent.build.prompt` against the repo's `opencode.example.json` and warns loudly on mismatch. See [`docs/LEARNINGS.md`](docs/LEARNINGS.md) for the pinnable version of the gotcha.

**Iteration lineage with commit hashes is documented in [`benchmarks/README.md` → "How we've iterated the opencode config"](benchmarks/README.md).** The benchmark itself (SPEC.md, PROMPT.md, R1-R10 Playwright assertions) has never changed between runs -- only the agent's instructions about how to follow them. A skeptical reader can verify this via `git log -p` on those files. The repo's commitment: tune the tool, not the test.

Three caveats worth knowing before citing these numbers:

- **Different models ran per tool.** Claude ran Opus 4.7 (~5x the per-token cost of Sonnet). A Sonnet-vs-GPT-5 comparison would be tighter. The benchmark question is "each tool in its recommended config," not "identical models." That's intentional.
- **Different plugin stacks.** Claude's stack includes claude-mem, which pre-loads a memory blob on the first turn -- this inflates effective input significantly. "OpenCode is cheaper" partly means "OpenCode's startup context is leaner," not only "its models are cheaper."
- **Cost figures are API-retail-equivalent.** ccusage computes what you would pay at public API rates. If you're on a Claude Pro/Max subscription or running BYOK through the gateway, your actual bill looks different.

Full caveats list (8 total) and methodology: [`benchmarks/README.md`](benchmarks/README.md). Per-run data:

- tic-tac-toe: [`runs/2026-05-21-0818`](benchmarks/tic-tac-toe/results/runs/2026-05-21-0818/2026-05-21-0818.md), [`runs/2026-05-22-0745`](benchmarks/tic-tac-toe/results/runs/2026-05-22-0745/2026-05-22-0745.md), [`comparisons.md`](benchmarks/tic-tac-toe/results/comparisons.md)
- markdown-editor: [`runs/2026-05-22-0837`](benchmarks/markdown-editor/results/runs/2026-05-22-0837/2026-05-22-0837.md) [INVALIDATED], [`runs/2026-05-22-0951`](benchmarks/markdown-editor/results/runs/2026-05-22-0951/2026-05-22-0951.md) [INVALIDATED], [`runs/2026-05-24-0758`](benchmarks/markdown-editor/results/runs/2026-05-24-0758/2026-05-24-0758.md) [INVALIDATED], [`runs/2026-05-24-1522`](benchmarks/markdown-editor/results/runs/2026-05-24-1522/2026-05-24-1522.md) [INVALIDATED], [`runs/2026-05-26-0829`](benchmarks/markdown-editor/results/runs/2026-05-26-0829/2026-05-26-0829.md) **(first valid run)**, [`comparisons.md`](benchmarks/markdown-editor/results/comparisons.md)

## Why one gateway in front of everything

CF AI Gateway lets you:
- Store provider API keys server-side (BYOK) — keys never live on your machine
- Tag every request with `cf-aig-metadata` headers (we use `{app, user}`) so you can filter by app or person in analytics
- See unified billing across Anthropic, OpenAI, Google, Workers AI in one dashboard
- Cache identical requests for free
- Apply rate limiting and fallbacks

The cost is: every request takes the gateway hop (~50–150ms added latency observed at time of publish), and OpenCode's adapter quirks for some providers needed working around (see [`docs/LEARNINGS.md`](docs/LEARNINGS.md)).

## Why Cloudflare AI Gateway (and the post that started this repo)

The trigger for this repo was Cloudflare's [Internal AI Engineering Stack post](https://blog.cloudflare.com/internal-ai-engineering-stack/), in which they describe routing 47.95M AI requests per month across 3,683 internal users (93% of R&D) through their own AI Gateway, with OpenCode as one of the engineer-facing clients. When the company building a product is running that volume on it themselves, the architectural choices behind it are battle-tested in a way no marketing page can demonstrate. The thesis here -- tiered models, single gateway, per-user attribution, OpenCode as the client -- is essentially the OSS-scale shape of what they shipped at company scale. That post is the inspiration.

That said, the choice wasn't reflexive. Before adopting Cloudflare AI Gateway I ran a structured evaluation against eight multi-provider candidates -- Cloudflare AI Gateway, Portkey, LiteLLM, OpenRouter, Bifrost, Azure AI Foundry, AWS Bedrock, Traefik AI Gateway, plus a custom-built option -- scored against a nine-dimension weighted rubric. The dimension that carried the most weight (25%) was **provider feature fidelity**: when a provider ships something new (Anthropic web search, extended thinking, computer use, real-time voice), it should work through the gateway immediately rather than waiting for the gateway to catch up. A gateway that silently drops or rewrites provider-native features is worse than no gateway at all. Several otherwise-decent candidates (Bedrock, OpenRouter, Azure for non-Anthropic) couldn't pass the litmus test of Anthropic web-search passthrough -- an architectural limitation that recurs with every new provider feature. Cloudflare took the top spot among multi-provider candidates (4.55 / 5.00 composite) and passed every gate in a hands-on POC: web-search citations preserved, extended-thinking blocks intact through the proxy, streaming SSE fidelity with no buffering, multi-model routing through a single `cf-aig-authorization` header, all provider keys living in the gateway rather than in client code. The architectural reason it scored that high is the **transparent proxy** design -- Cloudflare forwards provider-native payloads as-is, and exposes both an OpenAI-compatible endpoint (for the easy multi-model routing case) and per-provider native endpoints (for provider-specific features) -- no translation layer, no feature stripping.

Beyond the rubric, three pragmatic factors made it the right call **for me specifically**: I already had a Cloudflare account with the gateway feature available, so onboarding was minutes rather than a vendor-procurement cycle; it's free at the tiers I needed (no per-request fees, no token markups); and it's managed SaaS, so there's no infrastructure to deploy or maintain just to get a proxy running. None of these factors make Cloudflare *the* right choice for everyone -- they made it the right choice for me. The runner-up in my evaluation was Portkey (4.30 / 5.00), which has stronger built-in governance (RBAC, per-key budgets, audit logging) and is open-source MIT with a self-hosted option; if you need fine-grained access control out of the box, or you specifically want to self-host, Portkey is a defensible alternative. LiteLLM (4.05) and OpenRouter (3.95) are also solid -- both use translation-layer architectures rather than transparent proxy, which is the trade-off worth understanding before picking either. Pick the gateway whose architecture and pricing model match your situation. This one matched mine.

## Documentation

- [`docs/PROBLEM.md`](docs/PROBLEM.md) — the cost-tier thesis and why this repo exists
- [`docs/CURRENT-STRATEGY.md`](docs/CURRENT-STRATEGY.md) — current model assignments, evidence, and operating rule
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — current routing shape, provider setup, and orchestration boundaries
- [`docs/SETUP.md`](docs/SETUP.md) — full setup walkthrough
- [`docs/LEARNINGS.md`](docs/LEARNINGS.md) — gotchas discovered while building this (model name format, reasoning-model handling, tool-call fumbling, etc.)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — what's done, what's planned (orchestrator/subagents, superpowers, LSP, Groq, xAI)
- [`docs/SUPERPOWERS-INTEGRATION.md`](docs/SUPERPOWERS-INTEGRATION.md) — design for layering [obra/superpowers](https://github.com/obra/superpowers) process skills on top of the tiered architecture (Phase 3a)
- [`docs/MCP-INTEGRATION.md`](docs/MCP-INTEGRATION.md) — which MCP servers to wire in, why MCPs beat WebFetch and training-data lookups, and how they interact with the tiers
- [`docs/LSP-INTEGRATION.md`](docs/LSP-INTEGRATION.md) — how-to for OpenCode's native LSP support (24+ built-in language servers + custom PowerShell setup); ~order-of-magnitude token savings on code-understanding questions
- [`docs/specs/2026-05-19-routing-brain-d-design.md`](docs/specs/2026-05-19-routing-brain-d-design.md) — design for the future orchestrator that dispatches across tiers automatically
- [`benchmarks/`](benchmarks/) — reproducible benchmarks measuring cost, time, and quality across Claude Code, Codex CLI, and OpenCode-with-this-stack; results will be published as proof (or disproof) of the cost-reduction thesis

## Status

**Working today:**
- All five providers reachable through the gateway
- Reliability-based OpenCode orchestration: `gpt-5` primary `build`, `gpt-5-mini` `coder`, GLM-backed `searcher`/`reader`/`planner`
- Local Ollama tier remains available on read-only tools, but is experimental rather than the recommended implementation path
- Verified model catalog: Claude 4-5/4-6 family, GPT-5 family, Gemini 2.5, Workers AI Qwen/Llama/DeepSeek
- Automatic `app` + `user` metadata tagging on every gateway request (app from directory basename, user from OS user) -- surfaces as filters in CF AI Gateway analytics
- Baseline MCP integration: `context7` (current library docs), `cloudflare-docs`, and `snyk` (security scanning) ship enabled in the example config
- LSP integration: OpenCode's 24+ built-in language servers enabled with `"lsp": {}` for diagnostics-driven feedback; **agent-callable `lsp` tool** wired up (requires `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` env var -- the tool is experimental in opencode 1.15.5); per-agent prompt nudging biases the model toward LSP over grep for symbol lookups; custom PowerShell setup documented
- Primary `build` agent now acts as the default frontier-tier orchestrator, with project-local `searcher`, `reader`, `coder`, and `planner` subagents invoked via OpenCode's Task tool
- Subagent handoff contract: objective, context, scope, expected output, and success criteria. Worker failures are retried once only when missing context is likely, then escalated instead of looped.
- Manual `local`, `oss`, and `frontier` primary agents remain available as direct overrides when you do not want delegation
- Reproducible benchmark infrastructure (`benchmarks/scripts/bench-run.ps1`) with ccusage delta capture, session-window contamination filtering, and cross-tool comparison files
- Two-layer judge: deterministic Playwright R1-R10 suite (`benchmarks/scripts/judge-run.ps1`) + qualitative AI prompt template (`benchmarks/scripts/judge/JUDGE-PROMPT.md`)

**Planned (not yet built):**
- [obra/superpowers](https://github.com/obra/superpowers) plugin integration -- process skills (TDD, brainstorming, code review) on the orchestrator
- Further tuning of the shipped orchestrator/subagent routing rules using benchmark and real-session data
- Groq and xAI provider integrations (deferred -- pending API key provisioning)

## License

MIT — see [`LICENSE`](LICENSE).

## Contributing

This is a personal-use foundation released as OSS in case it saves someone else the week of debugging it took. Issues and PRs welcome but no commitment to maintenance pace.
