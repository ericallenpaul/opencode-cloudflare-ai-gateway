# MCP Integration

Which Model Context Protocol servers to wire into the tiered-agent setup, why they earn their keep, and how they interact with the cost-tier architecture.

## Why MCP servers compound with the tiered model

The cheapest token is the one you don't have to spend re-doing work. MCP servers move the agent from **inferring** to **looking up**, which beats every alternative at most coding tasks:

| Without MCP, when the agent needs to know how to use library X… | With the right MCP |
|---|---|
| **Trained-in knowledge** → may be stale by months or years. Agent doesn't know what it doesn't know. Confidently calls a deprecated function. Rework. | **`context7` returns current docs**. Agent uses the actual current API. No rework. |
| **WebFetch the docs URL** → returns raw HTML. Agent burns tokens on layout, ads, sidebar nav, and ad-hoc parsing. Often gets confused. | MCP returns **structured, source-of-truth markdown** scoped to the specific question. |
| **Grep the local codebase** → only finds what your repo already uses, doesn't tell you what's *correct* for a new use case. | MCP returns authoritative external knowledge. Your repo is for *your* code; MCP is for *everyone else's*. |
| **Reason from first principles** → frontier models can fake this on familiar libraries. On obscure or recently-changed ones, hallucination rate spikes. | Structured tool result is ground truth. Reasoning operates on facts, not memory. |

The token cost is small (tool definition in system prompt, tool result on use). The rework saved is large (a single hallucinated import-and-call wastes far more frontier tokens than dozens of `get-library-docs` calls). For our current architecture specifically, MCPs **shrink the gap between worker output and frontier output** by giving cheaper workers source-grounded context. We do not assume a Workers-AI coder is good enough for implementation anymore; the benchmark-backed coder is `gpt-5-mini`.

This is why MCP integration belongs in the basic setup, not as an afterthought.

## The shipping default set

Four MCP servers ship enabled in `opencode.example.json`. All are no-frill, no-credential or trivial-credential, and pay back their token cost on the first real task.

### context7 — current library documentation

- **URL**: `https://mcp.context7.com/mcp`
- **Auth**: none
- **What it does**: Resolves library names to canonical IDs (`resolve-library-id`), then fetches current docs for any topic within that library (`get-library-docs`). Covers thousands of npm/pypi/etc. libraries.
- **Why it matters**: Reduces hallucination on recent library versions where the agent's training data is stale or missing. The agent stops guessing function signatures.
- **Cost shape**: a few hundred tokens per lookup; massive ROI vs. the alternative.

### cloudflare-docs — Cloudflare platform reference

- **URL**: `https://docs.mcp.cloudflare.com/mcp`
- **Auth**: none
- **What it does**: Cloudflare-specific docs lookup — Workers, AI Gateway, D1, R2, Pages, etc.
- **Why it matters**: This stack already routes through Cloudflare AI Gateway. The same MCP gives the agent ground truth when you're building anything else on the platform.
- **Cost shape**: same as context7, scoped to CF docs.

### A note on security in AI-assisted code

Worth pausing on before the Snyk section: **AI-generated code introduces failure modes that hand-written code mostly doesn't.** Four are worth naming:

- **Slopsquatting / hallucinated dependencies.** An agent confidently suggests a package name that doesn't exist on the real registry. Attackers know this happens at scale and pre-register those names — when you (or someone on your team) installs what the agent suggested, you get the attacker's package instead. The agent doesn't know it's wrong; you don't know to check.
- **Stale-pattern reuse.** Training data includes years of code — including patterns that were once idiomatic but are now insecure (SQL string concatenation, hardcoded secrets, deprecated crypto APIs, sensitive logging). The model reproduces what it's seen, not what's currently safe.
- **Volume mismatch.** Hand-written code passes through "I'm typing this, let me think." Agent-written code skips that step. Same defect *rate* across more code = more absolute defects, including security ones.
- **Trust-by-default UX.** An agent's confident phrasing reads as authority. Users accept output unless it looks visibly wrong — and security flaws rarely look visibly wrong.

**A Snyk MCP scan catches all four classes before the code reaches a commit.** Hallucinated dependencies fail on registry lookup. Stale patterns trip SAST rules. The agent gets the feedback **while still in the conversation** and can fix on the spot. That's cheaper than catching it in CI, far cheaper than catching it in production, and avoids the "we shipped a vulnerability because we trusted the agent" failure mode entirely.

This is the single biggest argument for shipping a security MCP enabled by default. If you opt out of Snyk specifically, replace it with something equivalent — at this point the productivity gains of AI-assisted coding without a security check pointed at the output are not worth the exposure.

### snyk — security scanning

- **Command in example config**: `["npx", "-y", "snyk@latest", "mcp"]` (local, launches the Snyk MCP server as a subprocess)
- **Auth**: `snyk auth` once (browser flow, free tier works fine)
- **What it does**: Exposes Snyk's vulnerability scanning as tools the agent can invoke:
  - `snyk test` — dependency vulns in manifests (`package.json`, `requirements.txt`, `*.csproj`, etc.)
  - `snyk code test` — SAST scan against source files
  - `snyk container test` — vulns in Docker images
  - `snyk iac test` — misconfigurations in Terraform / K8s / CloudFormation
- **Why it matters**: Security review *while* building, not after. The agent can self-check generated code or new dependencies before claiming work done. Pairs naturally with the `verification-before-completion` skill if you have superpowers integrated.
- **Cost shape**: only consumes tokens when the agent invokes a scan, so zero idle cost.

**One-time setup** (Windows or Unix, same steps):

```bash
npm install -g snyk      # optional — npx already runs it, but global install is faster
snyk auth                # opens a browser, log in to Snyk (free signup is fine)
```

**Configure your default Snyk organization** (important — otherwise scans report into a wrong/default org):

```bash
# Find your org slug at https://app.snyk.io — it's in the URL: /org/<slug>/projects
snyk config set org=<your-org-slug>
snyk config get org      # verify
```

The auth token is stored at `~/.config/configstore/snyk.json` (Unix) or `%APPDATA%\configstore\snyk.json` (Windows) and is **shared across tools** — once you've authed, Claude Code, opencode, and any other Snyk-aware tool all use the same token.

If you don't want Snyk, set `"enabled": false` on the entry in `opencode.json`.

**MCP vs. Snyk's web dashboard:** the MCP integration gives the AI agent on-demand scanning (you ask, it scans). Snyk's web dashboard at `app.snyk.io` is a separate concern — that's where you register repos for continuous scanning via SCM integration (GitHub, Bitbucket, etc.). The two share the same auth but solve different problems. Most teams want both.

### A note on agent self-verification limits

Worth pausing on before the Playwright section: **a CLI coding agent cannot, by default, verify that an HTML/JS deliverable actually works in a browser.** It can read the source. It can run unit tests against a parser function in isolation. It can confirm the HTML structure is valid and no external scripts are referenced. None of those check whether the textarea-input-event is correctly wired to the parser-invocation function. None of those open a real browser, type characters, and observe whether the preview pane updates.

In practice this turns up as a class of bug that looks like passing software: unit tests green, HTML well-formed, README claims "live preview updates within 250ms" — but a real browser interaction shows the preview never moves because the event handler listens for `keydown` instead of `input`, or because the wire-up code is in an unreached branch. Honest agents flag this gap explicitly ("I could not visually confirm the file:// load -- here is the strongest proxy evidence available"). Less honest ones just declare done.

**The Playwright MCP closes this gap.** It gives the agent a real browser as a tool. Verification-before-completion stops being "trust the unit tests" and becomes "load the file, exercise it, observe the result." This applies to every coding agent on every HTML/JS deliverable -- it's not opencode-specific. We ship it enabled by default for that reason.

### playwright — browser automation and end-to-end verification

- **Command in example config**: `["npx", "-y", "@playwright/mcp@latest"]` (local, launches Microsoft's official Playwright MCP server as a subprocess)
- **Auth**: none
- **Adds**: ~500 MB of browser binaries on first run (Playwright downloads Chromium automatically). One-time cost; cached locally afterward.
- **What it does**: Exposes Playwright's browser-automation tooling as MCP tools the agent can call directly. The full surface includes `browser_navigate` (open a URL, including `file://`), `browser_type` (type into form fields), `browser_click`, `browser_snapshot` (structured accessibility-tree snapshot of the DOM), `browser_take_screenshot`, `browser_evaluate` (run arbitrary JS), and several more. The agent gets the same browser-control vocabulary that human test authors use.
- **Why it matters**: closes the self-verification gap described in the note above. For HTML/JS deliverables, the agent can actually load and exercise its own output before claiming complete. Catches integration bugs (event-handler mis-wiring, render timing, mobile layout breakage) that no amount of unit-testing the parser-in-isolation will surface. Also useful well beyond verification: visual debugging, end-to-end test authoring, scraping for one-off lookups, "why isn't this button enabled" investigations.
- **Cost shape**: tokens only when the agent invokes a browser tool; zero idle cost. The tool definitions add a few hundred tokens to the agent's startup context, which is more than paid back the first time the agent catches an integration bug instead of shipping it.

**One-time setup** (Windows or Unix):

```bash
# The MCP entry uses `npx -y` which auto-installs on first invocation,
# but pre-pulling the browsers ahead of time avoids a multi-minute pause
# the first time the agent uses it:
npx -y @playwright/mcp@latest --help    # triggers the install and prints help
```

The `verification-before-completion` skill in superpowers pairs naturally with this -- when both are present, the agent has a clear path: build, run unit tests, then open the deliverable in a real browser and exercise it before declaring done.

You may have other MCPs that make sense for your stack: Microsoft Learn for .NET/Azure, Atlassian for Jira/Confluence, database MCPs for schema work, or something else entirely. Add those when they solve a real workflow; they are not part of this repo's default setup.

## Interaction with the tiered-agent architecture

Now that the orchestrator/subagent baseline ships, MCP tool access needs the same shape as superpowers skills — the primary orchestrator gets the broad tool surface, and subagents keep a curated subset.

**Default plan:**

| Agent | MCP tools available | Reasoning |
|---|---|---|
| `build` (frontier orchestrator) | All enabled MCPs | Frontier model handles tool calls reliably. The orchestrator is doing the reasoning that benefits most from external grounding. |
| `coder` (`gpt-5-mini`) | `context7` only | Code-gen is exactly the scenario where current API docs prevent hallucination. Snyk and Cloudflare docs usually belong to the orchestrator unless the implementation task explicitly needs them. |
| `planner` (GLM worker) | `context7` only | "Right way to use library X" is a bounded planning question. Docs lookup is its highest-leverage external tool. |
| `searcher` (GLM worker) | None | Searcher's job is local file ops. External lookups are the orchestrator's concern. |
| `reader` (GLM worker) | None | Same as searcher — atomic file work, no external context needed. |

**Snyk specifically stays orchestrator-only** because security review is a judgment task, not an execution task. The cheap models would mostly just rubber-stamp scan results.

## Cost considerations

MCP tools have two cost components:

1. **Static**: tool definitions are loaded into every request's system prompt. With 3 MCPs and ~5–8 tools each, this is ~1–2k tokens overhead per request. Frontier-tier cost: pennies per session. Worth it.
2. **Dynamic**: tool *results* land in the conversation context. A context7 doc fetch might be 2–5k tokens. A Playwright screenshot or DOM dump can be 10–50k. Adds up if the agent is making heavy use.

**If you see cost climbing**: filter MCPs per-agent (table above), or disable the heavy ones (Playwright) when not in active use. CF AI Gateway analytics with the `app` metadata tag makes this measurable per project.

## See also

- [PROBLEM.md](PROBLEM.md) — the cost-vs-rework framing this builds on
- [ARCHITECTURE.md](ARCHITECTURE.md) — where MCPs sit in the tier topology
- [OpenCode MCP docs](https://opencode.ai/docs/mcp/) — how MCPs wire into OpenCode at runtime
