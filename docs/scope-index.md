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
| [Private Channel](private-channel-scope.md) | 📋 PLANNED | Button-driven floating ApplicationV2 window for a side conversation between one player and the narrator; no chat noise on open/exchange/close; per-player JournalEntry transcript (one page per session) with GM-Observer permissions; opt-in selective publish to main chat as a styled reflection card; Haiku narrator with cacheable safety/truths/character prefix and volatile scene/transcript tail; toolbar tool wired via the two-hook v13 pattern (`getSceneControlButtons` + `renderSceneControls`) into the existing `controls.tokens` group; `mode` config built in from day one so `!thread` and `!character new` can reuse the primitive without refactoring | Narrator, Companion Settings panel, Actor bridge | Audio Narration |
| [Audio Narration](audio-narration-scope.md) | 📋 PLANNED | ElevenLabs text-to-speech narration overlaid on narrator cards — text remains canonical, audio is enhancement; opt-in per player (client setting) with GM-level voice/model/speed (world setting); inline `<npc>…</npc>` markup splits prose into narrator-vs-NPC segments dispatched to two distinct voices; content-addressed cache at `worlds/${world.id}/audio/${hashPrefix}/${hash}.mp3` (mirroring the sector-art pattern) with GM-gated FilePicker uploads; streaming endpoint where supported with full-generation fallback; click-to-play default with optional auto-play gated by a user-gesture priming overlay; read-only character-budget display via the ElevenLabs subscription endpoint; graceful degradation on key/CORS/rate failures (audio never blocks chat); BYOK `xi-api-key` stored client-scoped in About tab alongside Claude and OpenRouter keys | Narrator, Fact Continuity (sidecar parser), Companion Settings panel | — |
| [Entity → Actor Migration](entity-actor-migration-scope.md) | 📋 PLANNED | Migrate ship → starship and planet/settlement/location → location Actors (with `system.subtype` discriminator); hierarchical Actor folders (Starships / NPCs / PCs / Sectors → per-sector subfolders); collapse settlement-data duplication across four storage layers down to two (Actor = source of truth, slim sector-flag entry for spatial refs); sector-record JournalEntry overview rewritten as UUID document links with debounced `updateActor` re-render; one-time GM-triggered `!migrate-entities` with 7-day deferred cleanup | Ironsworn API, Narrator Entity Discovery, Sector Creator | — |
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
        ├─► Character Management (✅) ◄── Ironsworn API (✅)
        │           └─► Previously On (✅)
        │           │          └─► Narrator Entity Discovery (✅)
        │           │                    └─► World Journal (✅)
        │           └─► Quench Integration Tests (✅)
        ├─► Fact Continuity (✅)
        │     └─► Audio Narration (📋)
        └─► Private Channel (📋)
              └─► Audio Narration (📋 — transparent passthrough)
```

---

## What to work on next

- **Visual UI polish** — wire the new `statIcon` / `assetIcon` / `oracleIcon` resolvers into the entity panel and chat cards. Helpers shipped in Phase 9; the templates were not touched in that pass and remain a follow-up.
- **Fact Continuity panel surfaces** — the Entity Panel "Active truths" collapsible and the WJ Panel scene-truth filter row (scope §17 items 26–27) were deferred from the Phase D slice. The correction loop ships without them; they slot naturally into panel-polish work.
- **Fact Continuity ship positioning (§20)** — separate scope section already designed but not yet implemented. Adds a persistent `ship.position` schema, `inferShipPosition` heuristic, three update triggers (`!at`, `set_a_course` non-miss, narrator sidecar `subject: "ship"`), and a sector-scene token-drag trigger.
- **Ability scanner — stat substitution support** — `src/moves/abilityScanner.js` (shipped in the v1.3.1 fixes branch) detects abilities that apply to the chosen move and extracts numeric `+N` adds via regex, but stat-substitution abilities like Empath's *"roll +heart"* surface in the dialog with their text only — the player adjusts the stat manually. Follow-up should extend the scanner / dialog to parse and apply stat substitution automatically (likely as a one-shot LLM extraction returning `{ adds, statReplacement }` per matched ability, plus a stat-override radio in the Confirm dialog).

Other possible directions:

- **Private Channel (📋 planned)** — button-driven floating window for solo player reflection with the narrator; transcript persistence per session; opt-in publish to main chat. See `private-channel-scope.md`. Two Claude Code sessions estimated. Ships independently; audio narration overlays it transparently if both ship.
- **Audio Narration (📋 planned)** — ElevenLabs TTS for narrator cards; opt-in per player; inline `<npc>` markup for distinct NPC voice; content-addressed cache mirroring the sector-art pattern. See `audio-narration-scope.md`. Implementation order requires CORS verification step before UI wiring.
- **Speech input polish** — push-to-talk reliability, dictation accuracy improvements.
- **Sector Creator iteration** — e.g. richer narrator stubs, additional region templates, post-generation editing.
- **WJ Phase 6 polish** — surface contradiction notifications inside the WJ panel itself (not only the chat card), undo for accidental confirmations.
- **Generative-tier learning** — feed pinned + promoted entries back into the entity-discovery prompt as positive exemplars.
