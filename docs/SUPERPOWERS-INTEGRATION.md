# Superpowers Integration

How [obra/superpowers](https://github.com/obra/superpowers) fits into the tiered-agent architecture in this repo. This is a **design doc** — Phase 3a in the roadmap, planned but not yet built. The thinking below is what we'd implement, and what to verify when we do.

## Why both — what each does, what they don't

Superpowers and the tiered model are **orthogonal**. They solve different problems and compose multiplicatively:

|  | Cheap tier | Frontier tier |
|---|---|---|
| **No superpowers** | Ad-hoc work, cheap. Plausible output, frequent rework. | Ad-hoc work, expensive. Plausible output at frontier cost. |
| **With superpowers** | (Not the play — see below) | **Disciplined work at the right cost per task.** |

**Tiered models save you money. Superpowers saves you rework.** They compound. Neither replaces the other:

- Tiered model alone: cheap mediocre execution (cost wins, quality leaks)
- Superpowers alone: disciplined expensive execution (quality wins, cost leaks)
- Together: disciplined work at the cheapest viable tier per task

## The core integration decision: skills load on the orchestrator only

Subagents stay skill-free. The frontier orchestrator runs skill workflows, derives concrete tasks from each skill's process, and dispatches the concrete tasks to subagents.

| Agent | Loads skills? | Why |
|---|---|---|
| **orchestrator** (frontier) | Yes, all selected skills | Process skills are multi-step state machines (TDD's loop, debugging's hypothesis chain, plan-then-execute). The frontier model has the reasoning capacity to follow them reliably. Skill tokens are a small fraction of frontier-tier cost. |
| **searcher / reader** (local) | No | Local-tier models struggle with multi-step workflows. Their job is atomic file/grep operations; that doesn't benefit from process discipline. |
| **coder** (oss) | Likely no — see open question #2 | Cheap models can fumble structured skill prompts. Subagent's job is "execute this concrete task," not "run the TDD loop." The orchestrator runs TDD; coder writes the test it's told to write. |
| **planner** (oss) | No | Same reasoning as coder. Plans are produced by the orchestrator using `writing-plans` skill; planner subagent executes specific sub-investigations the plan requires. |

**Key insight**: the orchestrator pattern from this repo's design spec ([routing-brain D](specs/2026-05-19-routing-brain-d-design.md)) and superpowers' own `subagent-driven-development` skill teach the **same shape**. The orchestrator does the reasoning; subagents do the concrete work. Superpowers' meta-skill *complements* the routing brain, doesn't compete with it.

## Which skill works best with which tier

OpenCode runs the skill on whichever model the current primary agent is using. With the shipped orchestrator/subagent baseline, skills still belong on the primary frontier agent rather than the cheap workers. The table below is therefore a guide for **which primary tier to use** when invoking a given skill manually.

| Skill | Recommended tier | Why |
|---|---|---|
| `using-superpowers` | any | Meta-skill, lightweight discovery of other skills. Works everywhere. |
| `brainstorming` | **frontier** | Open-ended judgment + option exploration. Smaller models flatten the option space. |
| `writing-plans` | **frontier** | Multi-step synthesis across a problem. Cheap tiers under-decompose. |
| `executing-plans` | oss | Plan-step execution is mechanical once steps are concrete. OSS handles it; frontier wastes tokens. |
| `test-driven-development` | oss | Test/code/iterate loop is well-structured; OSS coders are good at this. Frontier overkill but fine. |
| `verification-before-completion` | any (oss+) | Runs tests, parses output, asserts done-ness. Any tier with `bash` works. |
| `systematic-debugging` | **frontier** | Hypothesis formation is core reasoning. Smaller models grab the first plausible explanation. |
| `subagent-driven-development` | **frontier** | Meta-skill about delegation. Orchestrator territory. |
| `dispatching-parallel-agents` | **frontier** | Judgment about when fan-out makes sense. Frontier. |
| `using-git-worktrees` | **frontier** | Workspace-isolation decisions. Frontier judgment. |
| `requesting-code-review` | **frontier** | "Is this ready for review?" is a judgment call. |
| `receiving-code-review` | **frontier** | Interprets reviewer intent, decides which feedback to act on. |
| `writing-skills` | **frontier** | Authoring meta-tool — quality matters. |
| `finishing-a-development-branch` | **frontier** | Merge / PR / cleanup decisions. |

**Pattern**: judgment-heavy skills want frontier. Execution-heavy skills accept oss. Local tier never invokes skills directly — the example config sets `"skill": false` on the local agent to enforce this.

## How each superpowers skill maps to our architecture

| Skill | Belongs on | Notes |
|---|---|---|
| `using-superpowers` | orchestrator | The meta-skill. Always-on; teaches the agent how to find and invoke other skills. |
| `brainstorming` | orchestrator | Pure judgment work — user intent, requirements, options. Frontier reasoning territory. |
| `writing-plans` | orchestrator | The orchestrator writes the plan; subagents execute steps from it. |
| `executing-plans` | orchestrator | The orchestrator drives the loop and dispatches each step to the right subagent. |
| `subagent-driven-development` | orchestrator | Teaches the doctrine of when to delegate. Our system prompt provides the concrete dispatch map (which subagent does what work). Skill is the doctrine; prompt is the org chart. |
| `dispatching-parallel-agents` | orchestrator | When the orchestrator decides to fan out to multiple subagents in parallel. |
| `test-driven-development` | orchestrator | Orchestrator drives the red-green-refactor loop. Coder subagent writes the test, coder subagent writes the implementation. Coder never sees the full TDD context. |
| `systematic-debugging` | orchestrator | Hypothesis-driven debugging. Searcher subagent answers "where is X used" questions; reader subagent answers "what does file Y look like." Orchestrator forms hypotheses. |
| `verification-before-completion` | orchestrator (+ possibly coder — see open question #2) | "Don't claim done without running tests." Strong candidate to also load on coder, since coder is the one actually writing changes that need verification. |
| `writing-skills` | orchestrator | Meta-meta. Author's tool. |
| `using-git-worktrees` | orchestrator | Workspace isolation. Orchestrator decides when to spin up a worktree. |
| `requesting-code-review` | orchestrator | When to ask for review. |
| `receiving-code-review` | orchestrator | How to read review feedback technically rather than performatively. |
| `finishing-a-development-branch` | orchestrator | PR/merge/cleanup decisions. |

**Net**: 13 of 14 skills load on the orchestrator. One skill (`verification-before-completion`) is a candidate for a second placement on the coder subagent — see open question #2.

## The interaction with the orchestrator's system prompt

The orchestrator has two layers of doctrine telling it how to work:

1. **System prompt (this repo)** — the dispatch map: "searches → searcher, file reads → reader, code edits → coder, plans → planner, everything else → handle directly."
2. **Superpowers skills (obra/superpowers)** — the process doctrine: "before writing code, brainstorm; before claiming done, verify; bug fixes follow systematic debugging."

These don't conflict — they answer different questions. The skill says "what kind of work am I doing right now, and what shape does that work have." The system prompt says "given I'm doing concrete-task work, who do I dispatch it to."

In the orchestrator's loop:
1. User asks for something
2. Orchestrator considers: does a skill apply here? (uses `using-superpowers` to find one)
3. If yes — orchestrator runs the skill's process to decompose the work
4. For each concrete task the skill produces — orchestrator consults its dispatch map (system prompt) and routes to the right subagent
5. Orchestrator integrates subagent outputs, may run more skill steps, replies to user

## Install path (when implementing)

1. **Tier setup must already work.** Don't try to layer superpowers on a broken foundation. Verify with `scripts/verify-models.ps1` or `verify-models.sh` first.
2. **Install superpowers as an opencode plugin.** OpenCode supports plugins via `opencode plugin <module>` or by adding to the `"plugin"` field in `opencode.json`. The exact install instructions live in obra/superpowers' README — we just need to point users there.
3. **Add `skill` to the orchestrator agent's tool permissions** in `opencode.json`. Without this, the orchestrator can't invoke skills at runtime.
4. **Update the orchestrator's system prompt** with a section explaining: "you have superpowers skills available; invoke them when they apply; skills run on you, not on subagents — derive concrete tasks from skill processes and dispatch only the concrete tasks."
5. **Leave subagent configs alone.** No `skill` permission, no skill-related prompt text. Subagents stay simple.

The shipped example config now includes the orchestrator/subagent baseline. Phase 3a is the remaining step: layering superpowers deliberately onto that primary orchestrator without bloating or destabilizing the cheap worker agents.

## Optional vs. required

**Recommended but not required.** Reasoning:

- The tier+gateway foundation works without superpowers. `--agent frontier "do this thing"` still gets cost-tiered routing and unified analytics.
- Superpowers compounds value but adds setup overhead (separate plugin, separate npm dep, separate learning curve for users who haven't used it before).
- Some users have their own process tooling and won't want this layer.

Doc structure: install superpowers as a clearly-marked **Phase 3a** add-on. Stand-alone install instructions, separate quickstart, clear "here's what you gain" framing. Users who stop after Phase 2 (orchestrator only) still have a working setup.

## Open questions (resolve when implementing)

1. **Full skill catalog vs. curated subset on the orchestrator?** Loading all 14 skills swells the orchestrator's system prompt; every request pays that cost. Curated subset (e.g. `using-superpowers` + `brainstorming` + `writing-plans` + `test-driven-development` + `verification-before-completion` + `subagent-driven-development`) is leaner. Recommendation: ship lean, expand based on telemetry.

2. **Does `verification-before-completion` belong on the coder subagent too?** The skill is small, the value (don't claim done without running tests) is high, and coder is the agent actually making changes. Counterargument: an oss-tier model still might not reliably execute "run tests, parse output, decide if done" without help from the orchestrator. Worth empirical test once subagents exist.

3. **How does the orchestrator's dispatch map interact with `subagent-driven-development` skill's guidance?** Both teach delegation behavior. Need to make sure the skill's "when to delegate vs. do yourself" advice composes cleanly with our four-subagent dispatch table. Likely fine — skill is doctrine, prompt is org chart — but worth verifying with a real session.

4. **Does the `using-superpowers` skill's auto-discovery of available skills work correctly when subagents *don't* have skill access?** The skill catalog should be visible to the orchestrator only. Subagents shouldn't see skills they can't invoke. Need to confirm opencode's permission model honors this distinction.

5. **Token-cost measurement.** Once integrated, compare cost-per-session between (a) tier-only, (b) tier + curated skills, (c) tier + full skill catalog. CF AI Gateway analytics with the `app` metadata tag should make this straightforward.

## See also

- [PROBLEM.md](PROBLEM.md) — why cost-per-token matters going forward and what's "rework" worth
- [ARCHITECTURE.md](ARCHITECTURE.md) — the three-tier provider topology
- [ROADMAP.md](ROADMAP.md) — Phase 2 (orchestrator) and Phase 3a (this integration) in context
- [routing-brain D design spec](specs/2026-05-19-routing-brain-d-design.md) — orchestrator + subagent topology this builds on
- [obra/superpowers](https://github.com/obra/superpowers) — upstream skills source
