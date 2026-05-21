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

The interesting lever is no longer "avoid paying." It's:

1. **Tier work by hardness.** A grep, a file summary, a one-line edit — these don't need GPT-5 or Claude Opus. They need a small fast model. Sometimes they need a *free* small fast model.
2. **Default to the cheapest viable tier.** Most agent work is reads, searches, and well-scoped edits. Frontier reasoning should be the *escalation* path, not the default.
3. **Make the cost visible.** If you can't see which tier each request used, you can't tell if your routing is working. Without one consolidated analytics view, you're flying blind.
4. **Attribute spend per user.** If multiple people share a gateway, "we spent $X on AI this month" is useless. "User A spent most of the budget debugging an integration, User B was orders of magnitude lower" is the conversation that matters — and the gateway needs to tag requests for that to be possible.

## Why a tiered setup with a single gateway

This repo is one concrete answer to the four points above:

| Lever | How this repo addresses it |
|---|---|
| Tier work by hardness | Three named tiers (`local`, `oss`, `frontier`) the user picks per session |
| Default to cheapest | Default boot model is local Ollama; oss is a one-flag switch; frontier is opt-in |
| Make cost visible | Every paid request goes through one Cloudflare AI Gateway → one analytics view |
| Attribute spend per user | Every paid request carries a `cf-aig-metadata` tag with `app` and `user` fields |

The current setup makes tier selection manual (you pick `--agent frontier` when you know you need it). A planned next phase ([the orchestrator design](specs/2026-05-19-routing-brain-d-design.md)) automates that choice: a primary frontier-tier agent that dispatches trivial work to cheaper subagents via OpenCode's Task tool.

## What this is not

- **Not a router service.** No proxy, no semantic routing, no code-enforced cost ceilings. Just the configuration and the gateway in front of upstreams. The orchestrator pattern (future) handles per-task dispatch in natural language, not deterministic code.
- **Not a cost-optimization product.** This is one engineer's setup, written down. Your mileage will vary. Real optimization needs an eval harness, which is out of scope here.
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

The first benchmark run confirms the thesis: the tiered + gateway setup produced a functionally identical outcome (10/10 acceptance criteria, Playwright-tested) at approximately 10% of the cost of Claude Code running Opus 4.7, and approximately 14% of the cost of Codex CLI. One data point is not a published result -- model nondeterminism, plugin differences, and the choice to run each tool in its recommended config (not identical models) all affect the numbers -- but the direction is unambiguous. See [`benchmarks/`](../benchmarks/) for methodology, caveats, and raw run data.
