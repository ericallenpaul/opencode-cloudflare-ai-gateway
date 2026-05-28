# The problem we're trying to solve

## The naive view

"Local models are getting better — soon I won't have to pay for tokens at all."

This sounds right. It is wrong in a way that matters.

## What's actually happening

Local models are getting better — but the **frontier is moving at the same time**, and the frontier is what you actually want for the hard parts of the work: novel reasoning, large-context synthesis, ambiguous user intent, code review across many files, architecture decisions.

The capability gap between a small local model and the current frontier doesn't close just because the small model improved. The small model improved to where last year's frontier was. Today's frontier is somewhere new.

So the realistic assumption for the next several years is:

> **You will pay for tokens. The question is how to make every paid token buy the cheapest viable answer.**

That reframe changes what tools matter.

## What this means in practice

The interesting lever is no longer "avoid paying" or "move everything to the cheapest model." We tested that. The current lever is:

1. **Tier work by hardness.** A grep, a file summary, a one-line edit — these don't need GPT-5 or Claude Opus. They need a small fast model. Sometimes they need a *free* small fast model.
2. **Default to the cheapest reliable tier for each role.** Most agent work is reads, searches, and bounded context extraction. Frontier reasoning should be reserved for orchestration, ambiguity, review, and final accountability. Implementation needs stronger evidence than read/search work before it can move down-tier.
3. **Make the cost visible.** If you can't see which tier each request used, you can't tell if your routing is working. Without one consolidated analytics view, you're flying blind.
4. **Attribute spend per user.** If multiple people share a gateway, "we spent $X on AI this month" is useless. "User A spent most of the budget debugging an integration, User B was orders of magnitude lower" is the conversation that matters — and the gateway needs to tag requests for that to be possible.

## Why a tiered setup with a single gateway

This repo is one concrete answer to the four points above:

| Lever | How this repo addresses it |
|---|---|
| Tier work by hardness | A frontier `build` orchestrator plus cheaper subagents for bounded work |
| Pick a default tier deliberately | Top-level `model` is the boot default; the shipped example defaults to `openai-via-gateway/gpt-5` because the primary workflow is orchestration plus delegation, not direct cheap-model coding |
| Make cost visible | Every paid request goes through one Cloudflare AI Gateway → one analytics view |
| Attribute spend per user | Every paid request carries a `cf-aig-metadata` tag with `app` and `user` fields |

The current setup still supports manual tier selection (`--agent frontier`, `--agent oss`, `--agent local`) when you want explicit control. The recommended path is `--agent build`: a frontier-tier orchestrator using `gpt-5`, a `gpt-5-mini` coder for implementation, and GLM 4.7 Flash workers for search/read/planning. The original orchestrator design lives in [the design spec](specs/2026-05-19-routing-brain-d-design.md); the current implementation is the benchmark-backed version of that idea.

## What this is not

- **Not a router service.** No proxy, no semantic routing, no code-enforced cost ceilings. Just the configuration and the gateway in front of upstreams. The orchestrator handles per-task dispatch in natural language, not deterministic code.
- **Not a cost-optimization product.** This is one engineer's setup, written down. Your mileage will vary. Real optimization needs repeated benchmark runs across targets; this repo now includes the harness, but the evidence base is still growing.
- **Not provider-agnostic forever.** The current shape leans on Cloudflare AI Gateway. The same idea would work on a self-hosted LiteLLM or any other unified gateway — but you'd be rewriting all the configuration patterns and learnings from scratch.

## When this approach pays for itself

Likely worth it if:

- You're a solo developer or small team paying for AI tokens out of a budget you care about
- Multiple people share an AI Gateway and you need per-user attribution
- You want a single dashboard for spend across Anthropic + OpenAI + Google + OSS
- You're willing to absorb ~50–150ms gateway hop latency per request (observed at time of publish)

Likely **not** worth it if:

- You only use one provider (just use that provider's dashboard)
- Latency-critical realtime work where every ms matters
- You don't have a CF account or don't want to introduce a new vendor
- You haven't yet hit the wall where "which model" actually matters financially

## Validation (May 2026)

The strongest current data point is the markdown-editor architecture benchmark from `2026-05-27-105622`. OpenCode (`gpt-5` orchestrator + `gpt-5-mini` coder) passed the core deterministic judge at about `$0.3888`. Codex (`gpt-5.5` + `gpt-5.4-mini`) also passed core checks at about `$1.0080`. Claude Code (`opus` + `haiku`) passed its own tests but failed browser runtime rendering at about `$1.2273`.

Earlier GLM-as-coder runs were cheaper but failed correctness and security checks. That is the important correction: cost per correct result beats sticker price per token. See [`CURRENT-STRATEGY.md`](CURRENT-STRATEGY.md) and [`benchmarks/`](../benchmarks/) for methodology, caveats, and raw run data.
