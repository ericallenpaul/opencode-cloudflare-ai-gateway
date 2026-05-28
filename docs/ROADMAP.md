# Roadmap

## Done (in this repo)

- [x] Three-tier provider setup (local Ollama, OSS via CF Workers AI, frontier via Anthropic/OpenAI/Google)
- [x] Single CF AI Gateway in front of all paid providers, BYOK key storage gateway-side
- [x] Per-provider SDK selection (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`) to avoid the openai-compatible adapter's reasoning-model bugs
- [x] Verified model catalog: Claude 4-5 + 4-6 family, GPT-5 family, GPT-4.1-mini, GPT-4o-mini, Gemini 2.5, Workers AI Qwen/Llama/DeepSeek
- [x] Local-tier tool restriction (read-only) to prevent small-model tool-call fumbling
- [x] Verification scripts (PowerShell and Bash) that probe every configured model and write sanitized reports
- [x] LSP integration enabled (`"lsp": {}` in config; opencode bundles 24+ built-in LSPs, custom PowerShell setup documented in [LSP-INTEGRATION.md](LSP-INTEGRATION.md))
- [x] Full setup documentation, problem statement, architecture diagram, learnings catalog
- [x] OpenCode-native orchestrator/subagent baseline: `build` acts as the frontier orchestrator and delegates to project-local `searcher`, `reader`, `coder`, and `planner` subagents via the Task tool
- [x] Benchmark-backed balanced worker assignment: `coder` on `gpt-5-mini`; `searcher`, `reader`, and `planner` on GLM 4.7 Flash
- [x] Reproducible benchmark infrastructure (`benchmarks/scripts/bench-run.ps1`) -- two-phase ccusage delta capture, session-window contamination filtering, per-tool notes.md stubs, cross-tool `<RunId>.md` comparison file
- [x] Two-layer judge: deterministic Playwright R1-R10 suite (`benchmarks/scripts/judge-run.ps1`) + qualitative AI prompt template (`benchmarks/scripts/judge/JUDGE-PROMPT.md`) for soft scoring

## Planned (in design, not yet built)

### Orchestrator tuning and validation

The baseline orchestrator/subagent shape now ships in the repo, and the first reliable worker mix is established by benchmark: `gpt-5` orchestrator, `gpt-5-mini` coder, GLM search/read/planning. The remaining work is to test stability across more runs and more target types.

- tighten the primary-agent routing prompt using real session data
- decide whether `searcher` and `reader` should stay on GLM, move to a different hosted OSS model, or split by task type
- measure whether `planner` adds value or whether frontier-direct planning is cheaper overall for small tasks
- repeat markdown-editor with the current config to measure run-to-run variance
- add at least one new architecture-mode benchmark target that is not a markdown parser
- validate subagent context handoff and retry behavior under real use

Detailed design: [`specs/2026-05-19-routing-brain-d-design.md`](specs/2026-05-19-routing-brain-d-design.md).

### obra/superpowers integration (Phase 3a)

[obra/superpowers](https://github.com/obra/superpowers) adds process-level skills the agent can invoke when applicable: TDD discipline, brainstorming, structured code review, plan-then-execute workflows, systematic debugging, etc. Already integrates with opencode via the plugin system.

**Design decision**: **skills load on the orchestrator only.** Subagents stay skill-free. The orchestrator runs skill workflows, derives concrete tasks from each skill's process, and dispatches only the concrete tasks to subagents.

**Why this shape compounds the tiered model rather than competing with it:**

- Superpowers + tiered model are orthogonal axes: tiers save you money, skills save you rework
- Skills are multi-step state machines — the frontier orchestrator can run them reliably, cheap subagents often fumble them
- Superpowers' own `subagent-driven-development` skill teaches the same dispatch shape our routing brain implements — they reinforce each other

**Full architecture, install path, per-skill placement table, and open questions**: see [SUPERPOWERS-INTEGRATION.md](SUPERPOWERS-INTEGRATION.md).

**Optional, not required**: keeps the core tier+gateway setup usable without superpowers for users who don't want a separate plugin. Highly recommended for serious work — that's where the rework-reduction case lives.

<!-- LSP integration moved to "Done (in this repo)" — opencode has native LSP support
     with 24+ built-in LSPs, enabled via `"lsp": {}` in opencode.json.
     See LSP-INTEGRATION.md for the how-to and PowerShell custom config. -->


### Per-user / per-project metadata: native plugin (Phase 3c)

v1 ships with **directory-basename-as-app-tag** via a shell wrapper (see [SETUP.md](SETUP.md#7-optional-but-recommended-automatic-per-user-and-per-project-attribution)). This works but has rough edges:

- Two unrelated directories with the same basename get the same tag
- The shell wrapper has to be installed on every machine
- It doesn't follow the user across worktrees, monorepo subdirs, or symlinked workdirs

The native fix is an **opencode plugin** that hooks the request lifecycle and injects the `cf-aig-metadata` header dynamically per-request:

- Derive `app` from the git remote slug (`git config --get remote.origin.url` → strip to `org/repo`) rather than directory basename — handles worktrees, symlinks, and basename collisions
- Derive `user` from the OS user (or honor an explicit override env var)
- No shell wrapper needed; works the same on every platform
- Ships as a single `opencode plugin <module>` install

Open question: how much of OpenCode's plugin API supports request-lifecycle hooks? Needs a quick spike to confirm before committing to this path.

## Deferred (waiting on external blockers)

### Groq provider

CF AI Gateway supports Groq. Worth a dedicated provider entry for:
- `openai/gpt-oss-120b` — OpenAI's open-weights 120B model, served fast on Groq's silicon
- `meta-llama/llama-4-maverick-17b-128e-instruct` — modern Llama 4
- `deepseek-r1-distill-llama-70b` — reasoning at OSS cost

Groq is reportedly much faster than CF Workers AI for OSS models (at time of publish). Could become the *preferred* OSS tier once API keys are provisioned in the gateway BYOK config.

**Blocker:** API key provisioning.

### xAI provider

CF AI Gateway supports xAI. Specifically interested in:
- `grok-code-fast-1` — coding-focused, low latency
- Maybe `grok-4-fast-reasoning` for reasoning at xAI prices

**Blocker:** API key provisioning.

## Not planned

### External routing service ("Option C")

A custom proxy/Worker between OpenCode and the gateway that enforces tier selection in code rather than natural-language dispatch. Originally on the table; deprioritized because:

1. OpenCode's subagent mechanism gets us most of the way (Phase 2 above)
2. The natural-language dispatch tradeoff (some sloppiness vs. building a new service) is acceptable for solo-developer use
3. Real per-request cost ceilings + caching + eval can be added piecemeal to the orchestrator without rewriting

Would revisit if Phase 2 (orchestrator) proves too undisciplined in real use, or if multi-user setups demand hard cost guardrails.

### Eval harness

A nightly run of representative coding tasks through both manual-tier and orchestrator modes, comparing cost-per-success. Useful but real work to set up, and only valuable once Phase 2 ships.

### Multi-region / multi-gateway

Out of scope. One gateway, one account. Could revisit if usage spreads across regions where latency to a single CF gateway becomes a problem.

## Open questions

- **How stable is the `gpt-5-mini` coder result?** The first all-tool run is strong, but we need repeated runs and a second architecture target before treating the ratio as publishable.
- **How much value does the GLM planner add?** Search/read are clearly cheap-worker shaped; planning may be cheap enough on GLM but could add overhead or miss nuance.
- **Should `searcher` and `reader` stay on GLM or move to a faster/cheaper hosted OSS model as Cloudflare's catalog changes?** Needs periodic runtime bakeoffs, not catalog-based decisions.
- **Can we strip the gateway-hop latency for repeat calls via CF's semantic cache?** Untested. Could matter for orchestrator loops that re-search the same files.
- **How heavy is the obra/superpowers skill catalog at orchestrator load time?** If skill prompts bloat input tokens noticeably, we'll need lazy loading or a hand-picked subset.
- **Does OpenCode's `{env:...}` substitution work inside header values?** Confirmed for `baseURL` and `apiKey`. Likely works for arbitrary string config values, but the metadata-header use case hasn't been directly verified end-to-end (request reaching CF dashboard with substituted metadata). Quick verification step: launch opencode with a non-default app/user tag, run a query, check CF Gateway analytics for the metadata. If substitution doesn't happen for headers, fall back to the plugin path in Phase 3c.
