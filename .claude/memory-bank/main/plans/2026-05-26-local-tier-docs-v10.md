# Local-Tier Documentation Pass (v10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the multi-hour debug journey that ended with "opencode + LM Studio + qwen3-coder:30b + bumped context = working tier-routing, but slow without serious hardware." Capture: (a) the dead ends (Ollama unreliability, gpt-oss protocol mismatch, qwen-quantized format issues, context-window truncation), (b) the actual working recipe (LM Studio + qwen3-coder, n_ctx 16384+, model-level `tools: true`), (c) the performance caveat that makes this impractical without proper VRAM. Reference the opencode maintainer's own statements + the [ollama-x-opencode recipe](https://github.com/p-lemonish/ollama-x-opencode).

**Architecture:** Pure docs pass. No code changes. Five tasks across four files. Then push.

**Why this matters:** v9 had been "the definitive thesis test" — but the test was blocked for hours by opencode+local-model integration issues that turned out to be well-known and documented in upstream issues. Future readers of this repo deserve to know: (1) the thesis IS provable with the right runtime/model/config; (2) the daily-driver story is shakier without serious hardware; (3) there's a pivot path (gateway-routed cheap models) that achieves the same thesis with much better ergonomics.

**Tech Stack:** Markdown.

---

## Files touched

- Modify: `docs/LEARNINGS.md` (add "Local LLM tool-calling with opencode" entry)
- Modify: `opencode.example.json` (add `lmstudio` provider + `qwen3-coder` model entry with `tools: true` so the working setup is shipped, not lost)
- Modify: `docs/SETUP.md` (local-tier setup section: LM Studio path + Ollama caveats)
- Modify: `benchmarks/README.md` (Config v9 lineage: update outcome from "in flight" to "architecture validated with caveats")
- Modify: `README.md` (top-level: surface the local-tier hardware reality near the cost-tier framing)

---

## Task 1: LEARNINGS.md — the full debug story

**File:** `docs/LEARNINGS.md`

- [ ] **Step 1.1: Append a new H2 section after the most recent existing learning**

Insert this section (verbatim) at the end of `docs/LEARNINGS.md`:

```markdown
## Local LLM tool-calling with opencode is real, hard, and runtime-sensitive

(Added 2026-05-26.) Trying to make the `local` tier dispatch actually fire to a local Ollama/LM Studio model burned ~4 hours. Multiple distinct failure modes, all with the same surface symptom: the build agent dispatched correctly, but the local subagent returned zero tool calls or hallucinated output. Documented here so the next person doesn't have to rediscover this.

### Failure modes we hit, in order

1. **Granite4 7B (Ollama)** -- silent. Zero output, zero tool calls. Couldn't even diagnose without studying the dev log -- the model produced nothing usable but the trace just showed "0 toolcalls."
2. **Qwen2.5-coder 7B q4_K_M (Ollama)** -- attempted tool calls but emitted malformed tags. The Qwen team's own statement on [ollama#6007](https://github.com/ollama/ollama/issues/6007) calls this out as expected behavior for small + heavily quantized models: "the smaller models, especially after quantization, don't always follow instructions as accurately. I found that the tags were often missing in the generated text."
3. **gpt-oss 20B (Ollama)** -- emitted OpenAI's Response API tokens (`<|channel|>analysis`, `assistant<|channel|>functions.X`) instead of standard OpenAI JSON tool calls. opencode's parser misread these as unknown tool names. Ollama's template handling does not normalize gpt-oss's native format.
4. **Qwen3-coder 30B (Ollama)** -- emitted XML-tag tool calls (`<function=read>...</function>`) instead of JSON. opencode partially understood the first call but got distracted on subsequent turns by the giant list of MCP tools (40+ tools flooding the subagent's context). Switched to migrating Cloudflare Pages to Workers instead of counting lines.
5. **gpt-oss 20B (LM Studio)** -- still wrong protocol despite LM Studio's better templates. gpt-oss is hardwired to emit Response API tokens; that's not a runtime-fixable issue, it's the model's training.
6. **Qwen3-coder 30B (LM Studio) at default n_ctx 4096** -- failed similarly to Ollama: context overflow truncated the tool definitions, model lost track of what tools were available.
7. **Qwen3-coder 30B (LM Studio) at n_ctx 16384, with `tools: true`** -- WORKED. Tool call fired, file read succeeded, correct line count returned.

### The actual working recipe

Confirmed working:

| Component | Setting |
|---|---|
| Runtime | **LM Studio** (NOT Ollama -- opencode maintainer explicitly recommends LMStudio: "ollama has been unreliable and we receive a large number of issues from people trying to use it") |
| Model | **qwen3-coder** (NOT qwen2.5; NOT granite; NOT gpt-oss; designed specifically for agentic tools) |
| `n_ctx` | **16384 or higher** (the LM Studio default of 4096 is too small for opencode's prompts + tool defs + MCP tool list -- truncation kills tool-calling) |
| opencode config | Model-definition needs `"tools": true` |
| GPU offload | All layers if VRAM allows; CPU fallback is too slow to be usable |

Reference: https://github.com/p-lemonish/ollama-x-opencode -- the recipe that solved this for many users on opencode#1034.

### Performance honesty

Even with the working setup, qwen3-coder 30B Q4 at n_ctx 16384 on consumer GPUs takes **20-40+ seconds per dispatched subtask**. For tier-routing to dispatch reads and grep to local while the orchestrator stays on a frontier model, this means: every routed lookup costs you 30+ seconds of latency for a sub-call that gpt-5 would have done in 2-3 seconds. For a real coding session that dispatches dozens of subtasks, the wall-clock cost adds up faster than the dollar savings. **Practical reality: local-tier dispatching is only worth it if (a) you have a 24GB+ VRAM GPU running flat-out, AND (b) you value cost optimization over wall-clock time.**

### The pivot we considered

If your hardware doesn't support practical local inference, the architectural thesis ("dispatch cheap work to cheap models") can still be tested by routing the `local` tier to a gateway-hosted cheap model -- `openai-via-gateway/gpt-4o-mini` (~$0.15/M input vs gpt-5's $1.25/M, ~8x cheaper) or `workers-ai-via-gateway/@cf/qwen/qwen2.5-coder-32b-instruct` (cents per million). Both use standard OpenAI JSON tool-call format that opencode handles natively. You lose the "free local inference" angle but gain reliable execution and fast inference. **For most daily-use scenarios this is the better trade-off.** The `local` agent definition stays the same conceptually; only the model assignment changes.

### Generalizable lesson

Three orthogonal failure axes when running local LLMs as opencode subagents:
1. **Model output format** must match what opencode (via the @ai-sdk/openai-compatible provider) can parse: standard OpenAI JSON tool-call format. XML-tag formats (qwen3-native), Response-API tokens (gpt-oss-native), or malformed JSON (quantized models) all silently fail.
2. **Context window** must be large enough for opencode's prompt overhead (system prompt + tool defs + MCP tool list + user message often 8k+ tokens). Default `n_ctx=4096` on most Ollama/LMStudio loads is insufficient.
3. **Runtime templates** matter: Ollama's are coarse and break for many models; LM Studio's per-model handling is more reliable. Use LMStudio for local subagent work until Ollama improves.

When ALL three are aligned, local tool-calling works. Miss any one and you'll spend hours diagnosing it.
```

- [ ] **Step 1.2: Commit**

```powershell
git add docs/LEARNINGS.md
git commit -m "LEARNINGS: document the local-LLM-tool-calling debug story (LM Studio + qwen3-coder + n_ctx 16384)"
```

---

## Task 2: opencode.example.json — ship the working setup

**File:** `opencode.example.json`

- [ ] **Step 2.1: Add the lmstudio provider**

Add this provider block alongside the existing providers (after `workers-ai-via-gateway`, before the `agent` block):

```json
"lmstudio": {
    "name": "LM Studio (local)",
    "npm": "@ai-sdk/openai-compatible",
    "options": {
        "baseURL": "http://127.0.0.1:1234/v1"
    },
    "models": {
        "qwen3-coder-30b-a3b-instruct": {
            "name": "Qwen3 Coder 30B (LM Studio)",
            "tools": true
        }
    }
}
```

- [ ] **Step 2.2: Validate JSON parses**

```powershell
Get-Content opencode.example.json -Raw | ConvertFrom-Json | Out-Null
```

- [ ] **Step 2.3: Run check-setup.ps1**

```powershell
.\scripts\check-setup.ps1
```
Expected: same PASS/FAIL set as before.

- [ ] **Step 2.4: Commit**

```powershell
git add opencode.example.json
git commit -m "opencode: add lmstudio provider with qwen3-coder (the now-known-working local tier setup)"
```

---

## Task 3: docs/SETUP.md — local-tier setup section

**File:** `docs/SETUP.md`

- [ ] **Step 3.1: Find the existing local-tier setup section**

`docs/SETUP.md` currently describes Ollama setup for the local tier (around lines 25-40 — text mentioning `granite4:7b-a1b-h`, ollama, etc.). Read that section to identify the exact insertion point.

- [ ] **Step 3.2: Add a new subsection AFTER the existing Ollama instructions**

Insert this new subsection:

```markdown
### Caveat: Ollama local-tier tool calling is unreliable

Through 2026-05 we observed that the local-tier `--agent local` dispatch fails for most Ollama models, including granite4, qwen2.5-coder, gpt-oss, and even qwen3-coder. The failure modes vary by model (silent, malformed tags, wrong protocol, format mismatch) but the result is the same: zero tool calls fire, the agent appears to do nothing. See [`LEARNINGS.md` → "Local LLM tool-calling with opencode is real, hard, and runtime-sensitive"](LEARNINGS.md) for the full debug story.

The [opencode maintainer's recommended workaround](https://github.com/anomalyco/opencode/issues/1034#issuecomment-3233332990) is to use **LM Studio** instead of Ollama for local inference.

### Alternative: LM Studio for the local tier

LM Studio is hardware-agnostic, has more sophisticated per-model chat templates than Ollama (which normalizes tool-call formats across various model families), and exposes an OpenAI-compatible API on port 1234 by default.

Setup steps:

1. **Install LM Studio** from [lmstudio.ai](https://lmstudio.ai). Free for personal use; not open-source.
2. **Download `qwen3-coder-30b-a3b-instruct`** (or another Q4 variant of qwen3-coder that fits your VRAM). Inside LM Studio: search → filter by "Tool use" capability → download. ~18 GB for Q4_K_M.
3. **Bump the context length BEFORE loading.** In LM Studio Settings → **Model Defaults**, change "Default Context Length" from "Model maximum" to "Custom value" = **16384** (or higher if VRAM allows). The default of 4096 is too small for opencode's prompt + tool definitions + MCP tool list and will silently break tool calling.
4. **Optionally relax Model Loading Guardrails** from "Strict" to "Balanced" if you want max context to actually be honored on tighter hardware.
5. **Load the model.** Confirm via the Developer Logs that the load line shows `n_ctx = 16384` (or whatever you set), NOT `n_ctx = 4096`.
6. **Start the local server** (Developer panel → Local Server → toggle Status: Running). Server listens on `http://127.0.0.1:1234` by default.
7. **Add the lmstudio provider to your opencode config** (already present in `opencode.example.json` as of v10). The relevant block:

```json
"lmstudio": {
    "name": "LM Studio (local)",
    "npm": "@ai-sdk/openai-compatible",
    "options": { "baseURL": "http://127.0.0.1:1234/v1" },
    "models": {
        "qwen3-coder-30b-a3b-instruct": {
            "name": "Qwen3 Coder 30B (LM Studio)",
            "tools": true
        }
    }
}
```

The `"tools": true` flag at the model-definition level is required -- without it opencode does not route tool-call traffic to the model correctly.

8. **Point the `local` agent at it:** in your `opencode.json`, set `agent.local.model` to `lmstudio/qwen3-coder-30b-a3b-instruct`.

### Performance reality

Even with this working setup, dispatched tool calls to qwen3-coder 30B Q4 at n_ctx 16384 take 20-40+ seconds each on consumer hardware (RTX 3090 / 4090 class with 24GB VRAM). For tier-routing to be a daily-driver win, expect: better cost than gateway-frontier models, but worse wall-clock time. If you don't have GPU horsepower to spare, see "Routing via gateway-hosted cheap models" below as an alternative that preserves the cost thesis without local-inference latency.
```

- [ ] **Step 3.3: Add a parallel subsection about the gateway-cheap-model alternative**

After the LM Studio subsection, add:

```markdown
### Alternative: Route the local tier to a gateway-hosted cheap model

If local-inference latency is prohibitive but you still want the tier-routing cost benefit, point the `local` agent at a cheap gateway-hosted model instead:

```json
"agent": {
    "local": {
        "model": "openai-via-gateway/gpt-4o-mini"
    }
}
```

GPT-4o-mini is approximately **$0.15/M input tokens** vs gpt-5's **$1.25/M** -- about **8x cheaper per dispatched subtask** with reliable function-call execution (uses the same OpenAI JSON format opencode already handles for gpt-5). Wall-clock is also much faster than 30B-on-consumer-hardware. You lose the "free local" angle but gain practical day-to-day usability.

The tiered-cost-savings thesis ("dispatch cheap work to cheap models") still holds; the only thing that changes is where the cheap model runs.
```

- [ ] **Step 3.4: Commit**

```powershell
git add docs/SETUP.md
git commit -m "SETUP: document LM Studio local-tier path + gateway-cheap-model alternative; flag Ollama caveats"
```

---

## Task 4: benchmarks/README.md — Config v9 outcome

**File:** `benchmarks/README.md`

- [ ] **Step 4.1: Replace the Config v9 bullet**

Find the existing Config v9 bullet in the "How we've iterated the opencode config" section. Replace it with:

```markdown
- **Config v9 (hard routing gate + leaf-agent lockdown)**: v8 proved prompt-side routing instructions do NOT fire on real workloads (run 6 / `2026-05-26-1132`: gpt-5 ran the entire benchmark on itself, zero dispatches). v9 converts the advisory routing into a hard tool-availability gate: `read`/`grep`/`glob`/`bash`/`webfetch`/`websearch` disabled on the build agent. The agent literally cannot do those itself; it MUST dispatch via Task tool. `oss` and `frontier` locked to leaf-only capabilities (`task`/`bash`/`webfetch`/`websearch`/`todowrite` disabled). **Result (2026-05-26): forced dispatch works architecturally — but making the dispatched local subagent ACTUALLY USE its tools required separate work.** Across 7 attempted local-model configurations (granite4 silent, qwen2.5-coder-q4 malformed, gpt-oss wrong protocol via Ollama, qwen3-coder wrong format via Ollama, gpt-oss still wrong protocol via LM Studio, qwen3-coder context-overflow via LM Studio at default n_ctx 4096) we finally reached a working setup: **LM Studio + qwen3-coder-30b + n_ctx 16384 + `tools: true` at the model-definition level.** Smoke test passed: build dispatched to local, local invoked read tool, returned correct line count. Full debug story in [`docs/LEARNINGS.md` → "Local LLM tool-calling with opencode is real, hard, and runtime-sensitive"](../docs/LEARNINGS.md). Performance honesty: even working, dispatched calls take 20-40s on consumer hardware -- impractical for daily use without 24GB+ VRAM. The realistic path forward for users without serious GPU is to route the `local` tier to a gateway-hosted cheap model (`gpt-4o-mini`, ~8x cheaper than gpt-5, fast inference, reliable tool calls). See SETUP.md for both paths.
```

- [ ] **Step 4.2: Commit**

```powershell
git add benchmarks/README.md
git commit -m "benchmarks README: Config v9 outcome -- architecture validated, but local subagent path requires LM Studio + bumped context + specific model"
```

---

## Task 5: README.md — surface the local-tier reality

**File:** `README.md`

- [ ] **Step 5.1: Find the "What's in the box" section**

The top-level README has a table describing the three tiers (Local, OSS, Frontier). Find that table.

- [ ] **Step 5.2: Add a note paragraph immediately below the table**

After the table, add:

```markdown
> **Note (2026-05-26):** the **Local tier** is real but harder to make reliable than the table suggests. Through extensive testing we found Ollama's local tool-calling is unreliable across most models; LM Studio + qwen3-coder + n_ctx 16384 is the known-working setup (see [`docs/LEARNINGS.md`](docs/LEARNINGS.md) and [`docs/SETUP.md`](docs/SETUP.md)). Even working, dispatched local-tier subtasks run 20-40s on consumer hardware. For most daily-use scenarios, pointing the `local` tier at a gateway-hosted cheap model like `openai-via-gateway/gpt-4o-mini` (~8x cheaper than gpt-5, fast inference, reliable) preserves the tiered cost thesis without the local-inference latency tax.
```

- [ ] **Step 5.3: Commit**

```powershell
git add README.md
git commit -m "README: note the local-tier hardware reality + gateway alternative immediately under the tiers table"
```

---

## Task 6: Commit plan + push

- [ ] **Step 6.1: Stage and commit the plan**

```powershell
git add .claude/memory-bank/main/plans/2026-05-26-local-tier-docs-v10.md
git commit -m "Add v10 local-tier docs plan to memory-bank"
```

- [ ] **Step 6.2: Push**

```powershell
git push origin main
```

---

## Self-review

1. **Spec coverage:** the user asked for documentation of the entire debug saga. Five tasks across four files cover: full debug story (LEARNINGS), shipped working config (opencode.example.json), setup-doc instructions for both LM Studio and gateway-cheap paths (SETUP.md), config-iteration lineage outcome (benchmarks/README.md), and reader-facing reality check (top-level README).
2. **No placeholders.** Each step has the exact text or file-section anchor.
3. **No code changes.** This is a pure docs pass.
4. **Honest framing throughout.** The repo's central thesis ("tiered cost savings") is preserved as an architectural claim that IS provable. The honesty layer adds: it's harder to run locally than it looks, and the gateway-cheap alternative is a legitimate way to get the same benefit with less friction.
5. **Sets up the next step.** The user said after docs they want to "explore just using the OSS models via the gateway." The SETUP.md additions explicitly lay out that path (gpt-4o-mini for the local tier), so v11 (or whatever we call it) can build directly on this documented foundation.

---

## Execution

Subagent-driven:
- Task 1: `sonnet` (large LEARNINGS append; needs careful prose)
- Task 2: `sonnet` (JSON insertion; needs careful syntax)
- Task 3: `sonnet` (SETUP.md edits across multiple sections)
- Task 4: `haiku` (replace one bullet)
- Task 5: `haiku` (small note addition)
- Task 6: `haiku` (commit + push)
