# Starforged Companion — Scope Index

Single-glance status of all features. Start here every session to orient quickly.
For detail on any scope, open the linked document. Latest release tag: **v1.7.1**.

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
| [Narrator](narrator/narrator-scope.md) | ✅ COMPLETE | Direct Claude narration replacing Loremaster; configurable tone, perspective, model | — | Foundations, Scene Interrogation, Previously On |
| [Ironsworn API](character/ironsworn-api-scope.md) | ✅ COMPLETE | Corrected `actorBridge.js` field paths for foundry-ironsworn v1.27.0 | — | Character Management |
| [Character Management](character/character-management-scope.md) | ✅ COMPLETE | Actor bridge, character chronicle, and chronicle UI panel | Narrator, Ironsworn API | Previously On, World Journal |
| [Foundations](foundations/foundations-scope.md) | ✅ COMPLETE | Session ID management, narrator card metadata, README, help compendium, CHANGELOG | Narrator | Scene Interrogation, Previously On, Character Management, World Journal |
| [Scene Interrogation](narrator/scene-interrogation-scope.md) | ✅ COMPLETE | `@scene` prefix routes free-form questions to the narrator without triggering a move | Foundations | Previously On |
| [Previously On](narrator/previously-on-scope.md) | ✅ COMPLETE | Session recap (no API call) and campaign recap (Claude, cached); auto-posts at session start | Foundations, Character Management | World Journal |
| [Narrator Entity Discovery](entities/narrator-entity-discovery-scope-v3.md) | ✅ COMPLETE | Per-move narrator permissions (discovery / interaction / embellishment / hybrid); relevance resolver with hybrid clarification dialog; combined detection pass (one Haiku call serves both entity extraction and World Journal); entity-panel generative-tier UI; current-location card; oracle seeds for the five seeded moves | Character Management | World Journal |
| [World Journal](entities/world-journal-scope-v2.md) | ✅ COMPLETE | Folder + four category journals (lore, threats, factions, locations) + session log; manual `!journal` chat commands; combined detection pass populates entries with routing rule (factions/locations only when no entity record exists); WJ panel with Confirm + severity dropdown + history accordion + entity-record links; assembler injects confirmed lore (never dropped), immediate threats (never dropped), faction landscape, and recent discoveries | Character Management, Previously On, Narrator Entity Discovery | — |
| [World Truths](foundations/world-truths-scope.md) | ✅ COMPLETE | Full oracle tables for all 14 Starforged truth categories with sub-table resolution (`src/truths/`); rolled and stored at session zero, injected into the narrator context; `!truths` opens the foundry-ironsworn truths dialog, `!lore` posts a narrator-generated truths recap card | — | Narrator |
| [Session Lifecycle](session/session-scope.md) | ✅ COMPLETE | Session Panel (▶ toolbar) covering all five session moves; `campaignState.sessionActive` gate — before Begin Session, plain narration does not trigger the pipeline (chat commands + card affordances still work); Begin opens a galley vignette of the active PCs, End closes with a mundane currently-important-NPC vignette; chat aliases `!begin-session` / `!end-session` / `!flag` / `!fate` / `!break` | Narrator, Foundations | — |
| [Clocks](clocks/clocks-scope.md) | ✅ COMPLETE | Campaign and tension clocks via `!clock new\|advance\|fill\|reset\|remove\|list` and an ApplicationV2 panel; tension clocks can advance against Ask-the-Oracle odds | — | — |
| [Quench Integration Tests](testing/quench-integration-scope.md) | ✅ COMPLETE | Live Foundry integration tests via Quench covering safety, character, world journal, sector, narration, audio, pacing, portrait/connection pipelines, and chat-command surfaces (see `src/integration/quench.js` for the current batch list) | Foundations, Character Management | — |
| [API Key Privacy](character/api-key-privacy-scope.md) | ✅ COMPLETE | Hide API keys from player view; GM-only input in Companion Settings About tab | — | — |
| [Sector Creator](sectors/sector-creator-scope.md) | ✅ COMPLETE | 11-step guided sector generation following Starforged rulebook (pp. 114–127); SECTOR_TROUBLE table, settlement/planet/connection/map generation | — | Sector Creator Enhanced |
| [Sector Creator Enhanced](sectors/sector-creator-enhanced-scope.md) | ✅ COMPLETE | Background art per region (OpenRouter), Foundry Scene creation with Note pins and Drawing passages, narrator journal stubs | Sector Creator | — |
| [System Asset Integration](foundations/system-asset-integration-scope.md) | ✅ COMPLETE | Reuse foundry-ironsworn art (starships, locations, asset/oracle/stat icons), compendium content (canonical moves, oracles, encounters, truths), and localisation strings; all nine phases shipped: centralised asset paths (`src/system/ironswornAssets.js`), i18n wrapper, canonical pack lookup, icon resolvers, move-interpreter canonical grounding, `!sfc encounter <name>` chat command, campaign-truths digest in narrator system prompt | Ironsworn API | — |
| [Pacing](pacing/pacing-scope.md) | ✅ COMPLETE | Haiku pre-classifier between chat input and move interpreter; routes to `MOVE`, `NARRATIVE`, or `NARRATIVE_WITH_MOVE_AVAILABLE`; per-category dials (combat/investigation/exploration/social/downtime); `!pace hot\|quiet\|clear\|status` scene override; `!roll` false-negative recovery; connection-awareness via classifier context; recent move-density signal (in-memory ring buffer); telemetry journal under the Starforged Companion folder for dial tuning | Narrator, Move interpreter, Settings | — |
| [Fact Continuity](fact-continuity/fact-continuity-scope.md) | ✅ COMPLETE | Per-scene memory layer — narrator emits a fenced JSON sidecar (`newTruths` + `stateChanges`) parsed off-screen into two active-scene ledgers (`sceneTruths`, `sceneState.bySubject`); ledger surfaces in the narrator system prompt filtered to current location, matched entities, and player-mentioned subjects; scene lifecycle (`@scene` / `!scene start\|end` / session close) migrates entity-scoped truths to entity generative tiers and archives free-text/scene truths to World Journal Lore; per-card "Correct a fact" DialogV2 + `!truth` / `!state` chat commands with GM-vs-player permission asymmetry; optional Haiku consistency-check audit; nine world settings gate the feature (including the §20 ship-positioning sub-feature) | Narrator, World Journal, Pacing | — |
| [Audio Narration](audio/audio-narration-scope.md) | ✅ COMPLETE | ElevenLabs text-to-speech narration overlaid on narrator cards — text remains canonical, audio is enhancement; opt-in per player (client setting) with GM-level voice/model/speed (world setting); inline `<npc>…</npc>` markup splits prose into narrator-vs-NPC voices; content-addressed cache at `worlds/${world.id}/audio/...` with GM-gated FilePicker uploads; streaming with full-generation fallback; click-to-play default with optional primed auto-play; graceful degradation on key/CORS/rate failures; BYOK `xi-api-key` stored client-scoped in the About tab | Narrator, Fact Continuity (sidecar parser), Companion Settings panel | — |
| [Private Channel](narrator/private-channel-scope.md) | ✅ COMPLETE | Shipped in v1.7.0. Button-driven floating ApplicationV2 window for a side conversation between one player and the narrator; per-player JournalEntry transcript with GM-Observer permissions; opt-in selective publish to main chat; Haiku narrator with cacheable prefix; button on the floating Companion toolbar | Narrator, Companion Settings panel, Actor bridge | — |
| [Suffer-move Pipeline](moves/suffer-pipeline-scope.md) | ✅ COMPLETE | Shipping in v1.7.2 (PR pending). Resolves F16 from the v1.7.0 playtest: suffer moves never fired mechanically. Six-phase pipeline: per-move audit (`docs/moves/suffer-routing-audit.md`) → resolver emits `sufferPrompt` payload → six executors in `src/moves/sufferExecutor.js` apply meter writes + at-0 escalations (mortal-wound / desolation / vehicle-damage d100, debility marks) → blocking `SufferChoiceDialog` (`src/moves/sufferDialog.js`) presents the rulebook choice with GM-override + cancel → Pay the Price routes its d100 entries into the executors via `sufferRoute` annotations → Set a Course feedback card (folds in F15). 65 new unit tests | Narrator, Move resolver, Actor bridge | — |
| [Entity → Actor Migration](entities/entity-actor-migration-scope.md) | ✅ COMPLETE | Migrated ship → starship and planet/settlement/location → location Actors (with `system.subtype` discriminator); hierarchical Actor folders; settlement-data duplication collapsed; sector-record overview as UUID document links; one-time GM-triggered `!migrate-entities` with 7-day deferred cleanup. Shipped incrementally (Phases 1–3.5); scope doc reconciled 2026-05-31 | Ironsworn API, Narrator Entity Discovery, Sector Creator | — |
| [Narrator Entity Discovery v2](entities/narrator-entity-discovery-scope-v2.md) | 🔧 SUPERSEDED | Earlier draft of entity discovery — replaced by v3 (combined detection pass, hybrid permissions, current-location card). Kept on disk for design history | — | — |
| [World Journal v1](entities/world-journal-scope.md) | 🔧 SUPERSEDED | Earlier draft of World Journal — replaced by v2 (folder + four category journals, manual `!journal` commands, combined detection-pass routing rule, WJ panel). Kept on disk for design history | — | — |

### Supporting infrastructure (no dedicated scope doc — see [`file-structure.md`](file-structure.md))

| Area | Status | Description |
|------|--------|-------------|
| Multiplayer coordination | ✅ COMPLETE | `src/multiplayer/gmGate.js` (`isCanonicalGM()` single-emitter gate, prevents duplicate move resolution across clients) and `speaker.js` (resolves which PC a chat message belongs to). Note: meter **persistence** is still GM-gated — see PERSIST-001 in known-issues. |
| Speech input | ✅ COMPLETE | `src/input/speechInput.js` — push-to-talk dictation via the Web Speech API (Chromium). Gated by the `speechInputEnabled` client setting. |
| Ship Envision / History | ✅ COMPLETE | `src/entities/shipEnvision.js` — on-demand surfaces beyond the boot-up auto-seed. Envision rolls supplementary oracles (captain Role+Goal+First-look+Name, Action+Theme for crew + agenda, Initial Contact) and asks the narrator for a 2-3 sentence paragraph weaving them in; History rolls Action+Theme backstory beats + a Story Clue and asks for a 2-3 paragraph backstory. Chat commands `!ship envision [name] [facet]` and `!ship history [name] [beats]`; Entity Panel ✦ Envision and 📜 History buttons. Both append a dated `<h4>` section to `system.notes` so subsequent narrator calls pick up the new detail. |

---

## Dependency graph

```
World Truths (✅) ─┐
Narrator (✅) ◄────┘
  ├─► Foundations (✅)
  │     ├─► Scene Interrogation (✅)
  │     │     └─► Previously On (✅)
  │     │               └─► World Journal (✅)
  │     ├─► Character Management (✅) ◄── Ironsworn API (✅)
  │     │           └─► Previously On (✅)
  │     │                  └─► Narrator Entity Discovery (✅)
  │     │                            └─► World Journal (✅)
  │     ├─► Session Lifecycle (✅ — galley/end vignettes + pipeline gate)
  │     ├─► Fact Continuity (✅)
  │     │     └─► Audio Narration (✅)
  │     └─► Private Channel (🔄 — audio carries through transparently once built)
  └─► Quench Integration Tests (✅)

Standalone: Clocks (✅) · Sector Creator (✅) → Sector Creator Enhanced (✅)
            System Asset Integration (✅) · Pacing (✅) · API Key Privacy (✅)
            Multiplayer coordination (✅) · Speech input (✅)
```

---

## What to work on next

- **Visual UI polish** — wire the `statIcon` / `assetIcon` / `oracleIcon` resolvers (shipped in System Asset Integration Phase 9) into the entity panel and chat-card templates; the helpers exist but the templates were never updated.
- **Fact Continuity panel surfaces** — the Entity Panel "Active truths" collapsible and the WJ Panel scene-truth filter row were deferred from the Phase D slice. The correction loop ships without them; they slot naturally into panel-polish work.
- **Ability scanner — stat substitution** — `src/moves/abilityScanner.js` extracts numeric `+N` adds but surfaces stat-substitution abilities (e.g. Empath's *"roll +heart"*) as text only; extend the scanner/dialog to parse and apply stat substitution automatically.

Other possible directions:

- **Private Channel (🔄 in progress)** — button-driven floating window for solo player reflection with the narrator; being built on `claude/private-channel`. See `narrator/private-channel-scope.md`.
- **Speech input polish** — push-to-talk reliability, dictation accuracy.
- **Sector Creator iteration** — richer narrator stubs, additional region templates, post-generation editing.
- **WJ polish** — surface contradiction notifications inside the WJ panel (not only the chat card); undo for accidental confirmations.
- **Generative-tier learning** — feed pinned/promoted entries back into the entity-discovery prompt as positive exemplars.
