# Starforged Companion — Documentation Files

Reference index for the `docs/` and `rules/` directories. These are developer
and contributor documents; they are not bundled into the Foundry module zip.

For the full source tree (src/, tests/, styles/, etc.) see the root
`file-structure.md`.

---

## rules/

Operational rules for Claude Code. `CLAUDE.md` (project root) is the
auto-loaded entry point and bottom-of-file index; topic-specific rules
are extracted here and read on demand at the trigger points called out
in the session-startup checklist.

| File | Purpose |
|------|---------|
| [`../rules/foundry-api.md`](../rules/foundry-api.md) | Foundry VTT API rules — Hooks, ApplicationV2, ChatMessage, the two-hook toolbar-button pattern, and the v12 → v13 changes table |
| [`../rules/foundry-ironsworn.md`](../rules/foundry-ironsworn.md) | foundry-ironsworn submodule mechanics, Actor / Item schema rules, and the 8 non-negotiable field-path rules |
| [`../rules/quench.md`](../rules/quench.md) | Quench integration testing API (v0.10.0), registration pattern, guard pattern, and dynamic-import gotchas |
| [`../rules/game-rules.md`](../rules/game-rules.md) | Ironsworn: Starforged rules-reference index — when to reach for the play-kit doc vs the rulebook summary |
| [`../rules/project-context.md`](../rules/project-context.md) | Module overview, transport (no proxy, direct browser fetch), system dependency |

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