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

### Index, reference, and design docs

| File | Purpose |
|------|---------|
| [`scope-index.md`](scope-index.md) | **Start here** — single-table status of all feature scopes; dependency graph and next-steps |
| [`playkit-rules-and-coverage.md`](playkit-rules-and-coverage.md) | Authoritative play-kit rules reference + per-feature code coverage map + mismatch punch list. Read before implementing or fixing a specific move, table, or mechanic. |
| [`rulebook-summary.md`](rulebook-summary.md) | Section-by-section paraphrased summary of the *Starforged* rulebook — conceptual model, mechanical structure, design principles, "Implications for module design". Read before designing narrator behaviour, classifier prompts, or scene mechanics. |
| [`decisions.md`](decisions.md) | Architecture decisions and their rationale; read before changing any constrained pattern |
| [`known-issues.md`](known-issues.md) | Open bugs, accepted workarounds, and resolved issues |
| [`foundry-api-reference.md`](foundry-api-reference.md) | Foundry VTT API reference — Hooks signatures, ApplicationV2, ChatMessage shapes, `FilePicker.upload`, SceneControls; read before writing any Foundry API code |
| [`implementation-ordering.md`](implementation-ordering.md) | Phasing for the NED + WJ scopes; consult when sequencing entity-discovery or journal work |
| [`claude-code-quickstart.md`](claude-code-quickstart.md) | Claude Code usage guide for this project |
| [`session-01.md`](session-01.md) | Example campaign session illustrating the full move pipeline |
| [`quench-coverage-audit-plan.md`](quench-coverage-audit-plan.md) | Priority-ranked Quench coverage audit; tracks which paths still lack live-Foundry coverage |
| [`narrator-suggestion-loop-investigation.md`](narrator-suggestion-loop-investigation.md) | Investigation memo — narrator suggestion-loop remediation (design history) |
| [`narrator-suggestion-loop-group-c-design-memo.md`](narrator-suggestion-loop-group-c-design-memo.md) | Design memo — Group C remediation for the suggestion-loop investigation |

### Scope docs (statuses mirror `scope-index.md` — the table of record)

| File | Status | Purpose |
|------|--------|---------|
| [`narrator-scope.md`](narrator-scope.md) | ✅ | Direct Claude narration replacing Loremaster — configurable tone, perspective, model |
| [`ironsworn-api-scope.md`](ironsworn-api-scope.md) | ✅ | `actorBridge.js` field-path corrections for foundry-ironsworn v1.27.0 |
| [`character-management-scope.md`](character-management-scope.md) | ✅ | Actor bridge, character chronicle, chronicle UI panel |
| [`foundations-scope.md`](foundations-scope.md) | ✅ | Session ID management, narrator card metadata, README, help compendium, CHANGELOG |
| [`scene-interrogation-scope.md`](scene-interrogation-scope.md) | ✅ | `@scene` prefix routes free-form questions to the narrator without triggering a move |
| [`previously-on-scope.md`](previously-on-scope.md) | ✅ | Session recap (no API call) and campaign recap (Claude, cached) — auto-posts at session start |
| [`narrator-entity-discovery-scope-v3.md`](narrator-entity-discovery-scope-v3.md) | ✅ | NED v3 — per-move narrator permissions, hybrid clarification, combined detection pass, current-location card |
| [`world-journal-scope-v2.md`](world-journal-scope-v2.md) | ✅ | WJ v2 — folder + four category journals + WJ panel + combined detection-pass routing rule |
| [`quench-integration-scope.md`](quench-integration-scope.md) | ✅ | Live Foundry integration test suite — 47 batches |
| [`api-key-privacy-scope.md`](api-key-privacy-scope.md) | ✅ | Hide API keys from player view; GM-only input in Companion Settings → About |
| [`sector-creator-scope.md`](sector-creator-scope.md) | ✅ | 11-step guided sector generation per Starforged rulebook |
| [`sector-creator-enhanced-scope.md`](sector-creator-enhanced-scope.md) | ✅ | Background art per region, Scene creation with Note pins / Drawing passages, narrator journal stubs |
| [`system-asset-integration-scope.md`](system-asset-integration-scope.md) | ✅ | Reuse foundry-ironsworn art, compendium content, and localisation strings |
| [`pacing-scope.md`](pacing-scope.md) | ✅ | Haiku pre-classifier between input and move interpreter; per-category dials; `!pace` scene override |
| [`fact-continuity-scope.md`](fact-continuity-scope.md) | ✅ | Per-scene memory layer — sidecar parsing, two ledgers, correction affordance, §20 ship positioning |
| [`audio-narration-scope.md`](audio-narration-scope.md) | ✅ | ElevenLabs text-to-speech overlay on narrator cards |
| [`private-channel-scope.md`](private-channel-scope.md) | 📋 | Button-driven floating window for a side conversation between one player and the narrator |
| [`entity-actor-migration-scope.md`](entity-actor-migration-scope.md) | 📋 | Migrate planet / settlement / location entities to native `location` Actors with subtype discriminator |
| [`narrator-entity-discovery-scope-v2.md`](narrator-entity-discovery-scope-v2.md) | 🔧 | SUPERSEDED — earlier NED draft replaced by v3; kept on disk for design history |
| [`world-journal-scope.md`](world-journal-scope.md) | 🔧 | SUPERSEDED — earlier WJ draft replaced by v2; kept on disk for design history |