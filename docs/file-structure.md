# Starforged Companion — Documentation Files

Reference index for the `docs/` directory. These are developer and contributor
documents; they are not bundled into the Foundry module zip.

For the full source tree (src/, tests/, styles/, etc.) see the root
`file-structure.md`.

---

## docs/

| File | Purpose |
|------|---------|
| [`scope-index.md`](scope-index.md) | **Start here** — single-table status of all feature scopes; dependency graph and next-steps |
| [`playkit-rules-and-coverage.md`](playkit-rules-and-coverage.md) | Authoritative play-kit rules reference + per-feature code coverage map + mismatch punch list. Read before implementing or fixing a specific move, table, or mechanic. |
| [`rulebook-summary.md`](rulebook-summary.md) | Section-by-section paraphrased summary of the *Starforged* rulebook — conceptual model, mechanical structure, design principles, "Implications for module design". Read before designing narrator behaviour, classifier prompts, or scene mechanics. |
| [`decisions.md`](decisions.md) | Architecture decisions and their rationale; read before changing any constrained pattern |
| [`known-issues.md`](known-issues.md) | Open bugs, accepted workarounds, and resolved issues |
| [`narrator-scope.md`](narrator-scope.md) | ✅ Narrator feature — direct Claude narration replacing Loremaster |
| [`ironsworn-api-scope.md`](ironsworn-api-scope.md) | ✅ actorBridge field path corrections for foundry-ironsworn v1.27.0 |
| [`character-management-scope.md`](character-management-scope.md) | ✅ Actor bridge, character chronicle, and chronicle UI panel |
| [`foundations-scope.md`](foundations-scope.md) | 🔄 Session ID management and narrator card metadata |
| [`scene-interrogation-scope.md`](scene-interrogation-scope.md) | 📋 `@scene` free-form narrator queries |
| [`previously-on-scope.md`](previously-on-scope.md) | 📋 Session and campaign recap features |
| [`world-journal-scope.md`](world-journal-scope.md) | 📋 Automatic world-state documentation in Foundry journals |
| [`session-01.md`](session-01.md) | Example campaign session illustrating the full move pipeline |
| [`claude-code-quickstart.md`](claude-code-quickstart.md) | Claude Code usage guide for this project |
| [`quench-integration-scope.md`](quench-integration-scope.md) | ?? Quench integration test suite covering all implemented features |