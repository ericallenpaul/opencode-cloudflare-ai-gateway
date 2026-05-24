# opencode-cloudflare-ai-gateway

> **A note up front:** I'm new to [OpenCode](https://opencode.ai). This isn't a deep tour of the tool — it's one engineer's working setup, written down. But the shape of this setup — tiered models, single gateway, per-user attribution — feels right for the next few years of AI-assisted development, and the steps below are what it took to actually get there. If you're further along on OpenCode than I am, I'd genuinely welcome a PR or issue that sharpens any of this.

A tiered-agent setup for OpenCode that routes every frontier and OSS model through a single [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/), keeps a free local-Ollama tier in place for cheap work, and gives you one place to see usage, cost, and per-user attribution across providers.

This is the configuration, the setup walkthrough, and the lessons learned from getting it to actually work end-to-end. It is not a router service. It is the foundation a router service would sit on.

> **About pricing in this doc:** all dollar figures are "as of May 2026" and provided for rough magnitude comparison only. Provider pricing moves constantly. Always confirm current pricing against each provider's published rate card before making cost decisions.

## The problem we're trying to solve

We're not going to stop paying for tokens. Local models keep getting better, but the frontier keeps moving with them, and the gap that lets you skip the frontier for "real work" keeps shrinking. Within a couple of years the realistic assumption is: **you pay for tokens, period.** The lever is no longer "avoid paying" — it's "make sure each token spent buys the cheapest viable answer."

This repo is one attempt at that lever:

- **Three explicit cost tiers** the user can switch between manually (and a planned orchestrator that picks per-task — see [the design spec](docs/specs/2026-05-19-routing-brain-d-design.md))
- **One gateway** in front of every paid provider, so every dollar shows up in one analytics view
- **Automatic per-user and per-project metadata tagging** (app = directory basename, user = OS user) so a shared team gateway can attribute spend by person and by project
- **Verification scripts** (PowerShell + Bash) so you can confirm what's actually addressable from your gateway before relying on it in an agent loop

Full reasoning behind the architecture lives in [`docs/PROBLEM.md`](docs/PROBLEM.md).

## What's in the box

| Tier | Default model | Provider | Cost shape (May 2026, indicative) |
|---|---|---|---|
| **Local** | `ollama/granite4:7b-a1b-h` | Ollama on your machine | Free (hardware cost only) |
| **OSS** | `@cf/qwen/qwen2.5-coder-32b-instruct` | Cloudflare Workers AI via Gateway | low-cents per M tokens |
| **Frontier** | `gpt-5` | OpenAI via Gateway | Standard frontier pricing |

Plus the gateway-routed catalog: Claude Sonnet/Opus/Haiku 4-5 & 4-6, GPT-5 family, GPT-4.1-mini, GPT-4o-mini, Gemini 2.5 Pro/Flash, Llama 3.3 70B, DeepSeek-R1-distill 32B.

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

It walks every prerequisite (opencode CLI, env vars, opencode.json, superpowers plugin wired up, MCP servers configured, ollama + granite4 model) and prints a PASS/FAIL per item with the exact fix command for anything missing. Pass `-InstallConfig` / `--install-config` and it will copy `opencode.example.json` into place (with a backup of any existing config). Pure diagnostic otherwise -- no env-var writes, no npm installs.

If you'd rather walk through manually, the full sequence is:

1. **Prerequisites:** OpenCode installed (`npm install -g opencode-ai`), Ollama running locally with at least `granite4:7b-a1b-h` pulled, a Cloudflare account with AI Gateway enabled and provider API keys stored in BYOK.
2. **Set three env vars** (Windows user scope, one-time):
   ```powershell
   [Environment]::SetEnvironmentVariable("CF_ACCOUNT_ID", "<your-32char-account-id>", "User")
   [Environment]::SetEnvironmentVariable("CF_GATEWAY_NAME", "<your-gateway-slug>", "User")
   [Environment]::SetEnvironmentVariable("CF_AIG_TOKEN", "<your-gateway-auth-token>", "User")
   ```
3. **Copy the example config** to `~/.config/opencode/opencode.json` and adjust agent defaults to taste:
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

Short answer: **yes on cost, with a measurable quality gap on harder work that we're actively iterating to close.** Two benchmark targets, four completed runs to date, every run published with the data and the agent config version in effect.

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

`benchmarks/markdown-editor` is a deliberately harder target -- parser correctness, XSS handling, live-preview event wiring, ~300-500 LOC. Three runs completed:

| | run 1 (opencode config v1) | run 2 (opencode config v2) | run 3 (opencode config v3) |
|---|---|---|---|
| opencode R1-R10 / quality / cost | 8/10 (tests nested in subdir) / 2.6 / $0.25 | **10/10** (file-layout discipline landed) / 2.6 / $0.52 | **10/10** / 3.4 / $0.52 |
| codex R1-R10 / quality / cost | 10/10 / 4.6 / $1.97 | 10/10 / 4.6 / $2.12 | **SKIPPED** -- codex ran out of API tokens mid-benchmark |
| claude R1-R10 / quality / cost | 10/10 / 4.4 / $1.60 | 3/10 (live-preview wired to wrong DOM event) / 4.4 / $1.43 | 4/10 (`</script>` termination bug killed inline JS) / 3.8 / $3.63 |

What this benchmark surfaced that tic-tac-toe couldn't:

- **Cost-tier still wins on cost** -- 3-7x cheaper than frontier-direct with 10/10 functional R1-R10 across runs 2 and 3.
- **Documentation quality is the real cost-tier gap, and it is sticky.** Opencode wrote a one-line README in all three runs despite progressively more concrete prompt rules (v2: abstract "include sections X/Y/Z"; v3: template-driven with named sections + min line count). The mechanically-verifiable v3 rule still did not land. Frontier tools wrote 50-130 line READMEs.
- **Frontier tools have meaningful run-to-run variance too.** Claude's 10/10 → 3/10 → 4/10 swings were real integration bugs: run 2 wired live-preview to a keyboard event that doesn't fire on programmatic input; run 3 closed an inline `<script>` block too early via a literal `</script>` inside a string. Both bugs were the kind a real browser smoke-test would catch instantly; the agent claimed verification it did not actually perform.
- **First composite loss for opencode in this benchmark.** Run 3 ranked claude 0.268 vs opencode 0.233 on the cost(50%)/quality(30%)/bugs(20%) composite -- opencode shipped a working app for 6.9x less money but lost on Documentation=1 and on bug-count-beyond-R1-R10 (6 vs 4). The cost-quality gap is now the dominant axis, not the cost-functional gap.
- **The codex-out-of-tokens skip is itself a lesson.** A benchmark of coding agents can't measure an agent whose subscription has lapsed; the run script gracefully tolerated it (empty output, SKIP in judge) but produced no comparative data for codex on run 3. Followup item: add a codex-CLI preflight check to the start phase so token exhaustion is caught before the run window opens.

Between runs we have iterated only the opencode build-agent prompt; the SPEC/PROMPT/Playwright assertions are byte-identical across all three runs. The file-layout rule (v2) landed cleanly. The abstract README rule (v2) and the template-driven README rule (v3) both failed to land. Run 4 will narrow on: a SCORED README rubric inside SPEC.md (each of 4 required sections is worth 1 quality point), tightened verification language ("open in Playwright MCP, assert no console errors, assert preview is non-empty after typing `# Hello`"), and a codex preflight in `bench-run.ps1`.

**Iteration lineage with commit hashes is documented in [`benchmarks/README.md` → "How we've iterated the opencode config"](benchmarks/README.md).** The benchmark itself (SPEC.md, PROMPT.md, R1-R10 Playwright assertions) has never changed between runs -- only the agent's instructions about how to follow them. A skeptical reader can verify this via `git log -p` on those files. The repo's commitment: tune the tool, not the test.

Three caveats worth knowing before citing these numbers:

- **Different models ran per tool.** Claude ran Opus 4.7 (~5x the per-token cost of Sonnet). A Sonnet-vs-GPT-5 comparison would be tighter. The benchmark question is "each tool in its recommended config," not "identical models." That's intentional.
- **Different plugin stacks.** Claude's stack includes claude-mem, which pre-loads a memory blob on the first turn -- this inflates effective input significantly. "OpenCode is cheaper" partly means "OpenCode's startup context is leaner," not only "its models are cheaper."
- **Cost figures are API-retail-equivalent.** ccusage computes what you would pay at public API rates. If you're on a Claude Pro/Max subscription or running BYOK through the gateway, your actual bill looks different.

Full caveats list (8 total) and methodology: [`benchmarks/README.md`](benchmarks/README.md). Per-run data:

- tic-tac-toe: [`runs/2026-05-21-0818`](benchmarks/tic-tac-toe/results/runs/2026-05-21-0818/2026-05-21-0818.md), [`runs/2026-05-22-0745`](benchmarks/tic-tac-toe/results/runs/2026-05-22-0745/2026-05-22-0745.md), [`comparisons.md`](benchmarks/tic-tac-toe/results/comparisons.md)
- markdown-editor: [`runs/2026-05-22-0837`](benchmarks/markdown-editor/results/runs/2026-05-22-0837/2026-05-22-0837.md), [`runs/2026-05-22-0951`](benchmarks/markdown-editor/results/runs/2026-05-22-0951/2026-05-22-0951.md), [`runs/2026-05-24-0758`](benchmarks/markdown-editor/results/runs/2026-05-24-0758/2026-05-24-0758.md), [`comparisons.md`](benchmarks/markdown-editor/results/comparisons.md)

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
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the three tiers, the providers, how they connect
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
- Local Ollama tier on read-only tools (workaround for small-model tool-call fumbling)
- Verified model catalog: Claude 4-5/4-6 family, GPT-5 family, Gemini 2.5, Workers AI Qwen/Llama/DeepSeek
- Automatic `app` + `user` metadata tagging on every gateway request (app from directory basename, user from OS user) -- surfaces as filters in CF AI Gateway analytics
- Baseline MCP integration: `context7` (current library docs), `cloudflare-docs`, and `snyk` (security scanning) ship enabled in the example config
- LSP integration: OpenCode's 24+ built-in language servers enabled with `"lsp": {}` for diagnostics-driven feedback; **agent-callable `lsp` tool** wired up (requires `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` env var -- the tool is experimental in opencode 1.15.5); per-agent prompt nudging biases the model toward LSP over grep for symbol lookups; custom PowerShell setup documented
- Reproducible benchmark infrastructure (`benchmarks/scripts/bench-run.ps1`) with ccusage delta capture, session-window contamination filtering, and cross-tool comparison files
- Two-layer judge: deterministic Playwright R1-R10 suite (`benchmarks/scripts/judge-run.ps1`) + qualitative AI prompt template (`benchmarks/scripts/judge/JUDGE-PROMPT.md`)

**Planned (not yet built):**
- Subagent-based orchestrator that dispatches work across tiers automatically (see design spec)
- [obra/superpowers](https://github.com/obra/superpowers) plugin integration -- process skills (TDD, brainstorming, code review) on the orchestrator
- Groq and xAI provider integrations (deferred -- pending API key provisioning)

## License

MIT — see [`LICENSE`](LICENSE).

## Contributing

This is a personal-use foundation released as OSS in case it saves someone else the week of debugging it took. Issues and PRs welcome but no commitment to maintenance pace.
