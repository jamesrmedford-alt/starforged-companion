# Starforged Companion — Scope Index

Single-glance status of all features. Start here every session to orient quickly.
For detail on any scope, open the linked document.

---

## Status key

| Badge | Meaning |
|-------|---------|
| ✅ COMPLETE | Implemented, tested, merged to main |
| 🔄 IN PROGRESS | Partially implemented or currently active |
| 📋 PLANNED | Specified, not yet started |
| 🔧 SUPERSEDED | Replaced — see note |

---

## All scopes

| Scope | Status | Description | Depends on | Blocks |
|-------|--------|-------------|------------|--------|
| [Narrator](narrator-scope.md) | ✅ COMPLETE | Direct Claude narration replacing Loremaster; configurable tone, perspective, model | — | Foundations, Scene Interrogation, Previously On |
| [Ironsworn API](ironsworn-api-scope.md) | ✅ COMPLETE | Corrected `actorBridge.js` field paths for foundry-ironsworn v1.27.0 | — | Character Management |
| [Character Management](character-management-scope.md) | ✅ COMPLETE | Actor bridge, character chronicle, and chronicle UI panel | Narrator, Ironsworn API | Previously On, World Journal |
| [Foundations](foundations-scope.md) | ✅ COMPLETE | Session ID management, narrator card metadata, README, help compendium, CHANGELOG | Narrator | Scene Interrogation, Previously On, Character Management, World Journal |
| [Scene Interrogation](scene-interrogation-scope.md) | ✅ COMPLETE | `@scene` prefix routes free-form questions to the narrator without triggering a move | Foundations | Previously On |
| [Previously On](previously-on-scope.md) | ✅ COMPLETE | Session recap (no API call) and campaign recap (Claude, cached); auto-posts at session start | Foundations, Character Management | World Journal |
| [Narrator Entity Discovery](narrator-entity-discovery-scope-v3.md) | ✅ COMPLETE | Per-move narrator permissions (discovery / interaction / embellishment / hybrid); relevance resolver with hybrid clarification dialog; combined detection pass (one Haiku call serves both entity extraction and World Journal); entity-panel generative-tier UI; current-location card; oracle seeds for the five seeded moves | Character Management | World Journal |
| [World Journal](world-journal-scope-v2.md) | ✅ COMPLETE | Folder + four category journals (lore, threats, factions, locations) + session log; manual `!journal` chat commands; combined detection pass populates entries with routing rule (factions/locations only when no entity record exists); WJ panel with Confirm + severity dropdown + history accordion + entity-record links; assembler injects confirmed lore (never dropped), immediate threats (never dropped), faction landscape, and recent discoveries | Character Management, Previously On, Narrator Entity Discovery | — |
| [Quench Integration Tests](quench-integration-scope.md) | ✅ COMPLETE | Live Foundry integration tests via Quench covering safety (× 2 batches), actor bridge, progress tracks (× 2), assembler, narrator, pipeline (× 2), entity × world journal cross-dependency routing, world journal CRUD, system assets, chat command routing, mischief dial, settings panel actions, entity panel actions, character chronicle, world truths, sector commands, encounter spawn, session lifecycle, toolbar registration, and clarification edge cases (24 batches total) | Foundations, Character Management | — |
| [API Key Privacy](api-key-privacy-scope.md) | ✅ COMPLETE | Hide API keys from player view; GM-only input in Companion Settings About tab | — | — |
| [Sector Creator](sector-creator-scope.md) | ✅ COMPLETE | 11-step guided sector generation following Starforged rulebook (pp. 114–127); SECTOR_TROUBLE table, settlement/planet/connection/map generation | — | Sector Creator Enhanced |
| [Sector Creator Enhanced](sector-creator-enhanced-scope.md) | ✅ COMPLETE | DALL-E 3 background art per region, Foundry Scene creation with Note pins and Drawing passages, narrator journal stubs | Sector Creator | — |
| [System Asset Integration](system-asset-integration-scope.md) | ✅ COMPLETE | Reuse foundry-ironsworn art (starships, locations, asset/oracle/stat icons), compendium content (canonical moves, oracles, encounters, truths), and localisation strings; all nine phases shipped: centralised asset paths (`src/system/ironswornAssets.js`), i18n wrapper, canonical pack lookup, starship/location/stat/asset/oracle icon resolvers, move-interpreter canonical grounding, `!sfc encounter <name>` chat command, campaign-truths digest in narrator system prompt | Ironsworn API | — |
| [Pacing](pacing-scope.md) | ✅ COMPLETE | Haiku pre-classifier between chat input and move interpreter; routes to `MOVE`, `NARRATIVE`, or `NARRATIVE_WITH_MOVE_AVAILABLE`; per-category dials (combat/investigation/exploration/social/downtime); `!pace hot|quiet|clear|status` scene override; `!roll` false-negative recovery; connection-awareness via classifier context; recent move-density signal (in-memory ring buffer); telemetry journal under the Starforged Companion folder for dial tuning | Narrator, Move interpreter, Settings | — |
| [Fact Continuity](fact-continuity-scope.md) | ✅ COMPLETE | Per-scene memory layer — narrator emits a fenced JSON sidecar (`newTruths` + `stateChanges`) parsed off-screen into two active-scene ledgers (`sceneTruths`, `sceneState.bySubject`); ledger surfaces in Section 6.5 of the narrator system prompt filtered to the current location, matched entities, and player-mentioned free-text subjects; scene lifecycle (`@scene` / `!scene start|end` / session close) migrates entity-scoped truths to entity generative tiers and archives free-text/scene truths to World Journal Lore; per-card "Correct a fact" DialogV2 + backing `!truth` / `!state` chat commands with GM-vs-player permission asymmetry; optional Haiku consistency-check audit pass routes high-confidence contradictions to the existing GM Narrative Review card with a "Retract the offending fact" button; five world settings gate the feature with telemetry on the existing Pacing Telemetry journal | Narrator, World Journal, Pacing | — |
| [Narrator Entity Discovery v2](narrator-entity-discovery-scope-v2.md) | 🔧 SUPERSEDED | Earlier draft of entity discovery — replaced by v3 (combined detection pass, hybrid permissions, current-location card). Kept on disk for design history | — | — |
| [World Journal v1](world-journal-scope.md) | 🔧 SUPERSEDED | Earlier draft of World Journal — replaced by v2 (folder + four category journals, manual `!journal` commands, combined detection-pass routing rule, WJ panel). Kept on disk for design history | — | — |
---

## Dependency graph

```
Narrator (✅)
  └─► Foundations (✅)
        ├─► Scene Interrogation (✅)
        │     └─► Previously On (✅)
        │               └─► World Journal (✅)
        └─► Character Management (✅) ◄── Ironsworn API (✅)
                    └─► Previously On (✅)
                    │          └─► Narrator Entity Discovery (✅)
                    │                    └─► World Journal (✅)
                    └─► Quench Integration Tests (✅)
```

---

## What to work on next

- **Visual UI polish** — wire the new `statIcon` / `assetIcon` / `oracleIcon` resolvers into the entity panel and chat cards. Helpers shipped in Phase 9; the templates were not touched in that pass and remain a follow-up.
- **Fact Continuity panel surfaces** — the Entity Panel "Active truths" collapsible and the WJ Panel scene-truth filter row (scope §17 items 26–27) were deferred from the Phase D slice. The correction loop ships without them; they slot naturally into panel-polish work.
- **Fact Continuity ship positioning (§20)** — separate scope section already designed but not yet implemented. Adds a persistent `ship.position` schema, `inferShipPosition` heuristic, three update triggers (`!at`, `set_a_course` non-miss, narrator sidecar `subject: "ship"`), and a sector-scene token-drag trigger.

Other possible directions:

- **Speech input polish** — push-to-talk reliability, dictation accuracy improvements.
- **Sector Creator iteration** — e.g. richer narrator stubs, additional region templates, post-generation editing.
- **WJ Phase 6 polish** — surface contradiction notifications inside the WJ panel itself (not only the chat card), undo for accidental confirmations.
- **Generative-tier learning** — feed pinned + promoted entries back into the entity-discovery prompt as positive exemplars.
