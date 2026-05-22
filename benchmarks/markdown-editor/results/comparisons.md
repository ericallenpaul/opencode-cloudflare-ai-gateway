# markdown-editor -- comparisons log

Ranking across every benchmark run. One bullet per RunId. Each ranking reflects the human judgement after reviewing that run's per-tool `notes.md` against the SPEC.md acceptance criteria and quality dimensions.

For full per-run detail, open `runs/<RunId>/<tool>/notes.md`.

## Format

```
- <RunId> -- #1 <tool>, #2 <tool>, #3 <tool>  -- (optional one-line note)
```

The ranking is a composite of cost (ccusage), wall-clock time, and quality scoring (R1-R10 pass rate plus 1-5 quality dimensions). When the picture isn't clean -- e.g. lowest cost wasn't highest quality -- the note line should call that out.

## Runs

<!-- newest first. Each entry notes the opencode config version in effect for the run (v1, v2, v3, ...) so the lineage between prompt changes and benchmark results is auditable. See `../../README.md` "How we've iterated the opencode config" for the version table. -->

- 2026-05-22-0951 -- (opencode config v2: deliverable-discipline rules) #1 opencode, #2 codex, #3 claude  -- opencode 10/10 R1-R10 at $0.52 (the file-layout rule landed -- tests at root this time, R9/R10 went FAIL -> PASS for free); README still byte-identical 1-liner (the abstract "must include sections X/Y/Z" rule did NOT land); quality avg stayed at ~2.6/5 (1/5 documentation). Claude regressed to 3/10 R1-R10 because the live-preview was wired to `keydown` instead of `input` and didn't fire on Playwright's `page.fill()` -- frontier tool shipped a broken app the benchmark caught. Codex stayed 10/10. Key finding: concrete mechanically-verifiable prompt rules land; abstract content-quality rules don't (documented in [`../../../docs/LEARNINGS.md`](../../../docs/LEARNINGS.md)).
- 2026-05-22-0837 -- (opencode config v1: baseline) #1 codex, #2 claude, #3 opencode  -- opencode 8/10 R1-R10 (tests placed in `output/tests/` subdir cost R9 and R10 even though the tests were well-formed and would have passed if invoked from the right path); quality avg 2.6/5 with documentation 1/5 (one-line README) and UX polish 2/5 (no responsive `@media` query). Codex and claude both 10/10 functional with detailed READMEs (50+ lines) and proper mobile layouts. This run exposed the deliverable-discipline gap that motivated the config v2 changes.
