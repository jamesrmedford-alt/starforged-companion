# Starforged Companion — Scope Index

Single-glance status of all features, and the map from each scope to its
**GitHub issue**. Start here every session to orient quickly.

> **Scope documents now live as GitHub issues, not files.** The per-feature
> `*-scope.md` documents were migrated verbatim into issues #203–#228 and
> removed from `docs/` on 2026-06-24. Each row below links to the issue that
> holds the full scope text and its implementing-commit table. When you start a
> new feature, **open a GitHub issue for its scope** — do not add a
> `*-scope.md` file. See `decisions.md` → "Scope documents live as GitHub
> issues".

Latest release tag: **v1.7.23**.

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

| Scope | Issue | Status | Description |
|-------|-------|--------|-------------|
| Narrator | [#204](https://github.com/jamesrmedford-alt/starforged-companion/issues/204) | ✅ COMPLETE | Direct Claude narration replacing Loremaster; configurable tone, perspective, model |
| Ironsworn API | [#212](https://github.com/jamesrmedford-alt/starforged-companion/issues/212) | ✅ COMPLETE | Corrected `actorBridge.js` field paths for foundry-ironsworn |
| Character Management | [#208](https://github.com/jamesrmedford-alt/starforged-companion/issues/208) | ✅ COMPLETE | Actor bridge, character chronicle, and chronicle UI panel |
| Foundations | [#215](https://github.com/jamesrmedford-alt/starforged-companion/issues/215) | ✅ COMPLETE | Session ID management, narrator card metadata, README, help, CHANGELOG |
| Scene Interrogation | [#205](https://github.com/jamesrmedford-alt/starforged-companion/issues/205) | ✅ COMPLETE | `@scene` prefix routes free-form questions to the narrator without a move |
| Previously On | [#207](https://github.com/jamesrmedford-alt/starforged-companion/issues/207) | ✅ COMPLETE | Session recap (no API call) and campaign recap (Claude, cached); auto-posts at session start |
| Narrator Entity Discovery (v3) | [#219](https://github.com/jamesrmedford-alt/starforged-companion/issues/219) | ✅ COMPLETE | Per-move narrator permissions; relevance resolver with hybrid clarification; combined detection pass; entity-panel generative tiers; current-location card |
| World Journal (v2) | [#222](https://github.com/jamesrmedford-alt/starforged-companion/issues/222) | ✅ COMPLETE | Folder + four category journals + session log; `!journal` commands; combined detection-pass routing; WJ panel; assembler injection |
| World Truths | [#206](https://github.com/jamesrmedford-alt/starforged-companion/issues/206) | ✅ COMPLETE | Full oracle tables for all 14 truth categories; `!truths` dialog and `!lore` recap |
| Session Lifecycle | [#213](https://github.com/jamesrmedford-alt/starforged-companion/issues/213) | ✅ COMPLETE | Session Panel covering all five session moves; `sessionActive` gate; Begin/End vignettes; chat aliases. Includes Envision an Inciting Incident (`!incite`) |
| Clocks | [#203](https://github.com/jamesrmedford-alt/starforged-companion/issues/203) | ✅ COMPLETE | Campaign and tension clocks via `!clock` and an ApplicationV2 panel; narrator vignettes on fill |
| Quench Integration Tests | [#224](https://github.com/jamesrmedford-alt/starforged-companion/issues/224) | ✅ COMPLETE | Live Foundry integration tests via Quench across the major subsystems |
| API Key Privacy | [#209](https://github.com/jamesrmedford-alt/starforged-companion/issues/209) | ✅ COMPLETE | Hide API keys from player view; GM-only input in Companion Settings About tab |
| Sector Creator | [#218](https://github.com/jamesrmedford-alt/starforged-companion/issues/218) | ✅ COMPLETE | 11-step guided sector generation; SECTOR_TROUBLE table; settlement/planet/connection/map generation |
| Sector Creator Enhanced | [#210](https://github.com/jamesrmedford-alt/starforged-companion/issues/210) | ✅ COMPLETE | Background art per region (OpenRouter), Foundry Scene with Note pins and Drawing passages, narrator journal stubs |
| System Asset Integration | [#211](https://github.com/jamesrmedford-alt/starforged-companion/issues/211) | ✅ COMPLETE | Reuse foundry-ironsworn art, compendium content, and localisation; all nine phases |
| Pacing | [#220](https://github.com/jamesrmedford-alt/starforged-companion/issues/220) | ✅ COMPLETE | Haiku pre-classifier routing to `MOVE` / `NARRATIVE` / `NARRATIVE_WITH_MOVE_AVAILABLE`; per-category dials; `!pace` / `!roll`; telemetry |
| Fact Continuity | [#227](https://github.com/jamesrmedford-alt/starforged-companion/issues/227) | ✅ COMPLETE | Per-scene memory ledgers from a narrator sidecar; scene lifecycle; per-card corrections; consistency check; §20 ship positioning |
| Audio Narration | [#221](https://github.com/jamesrmedford-alt/starforged-companion/issues/221) | ✅ COMPLETE | ElevenLabs TTS overlaid on narrator cards; `<npc>` voice split; content-addressed cache; graceful degradation; BYOK |
| Private Channel | [#226](https://github.com/jamesrmedford-alt/starforged-companion/issues/226) | ✅ COMPLETE | Floating ApplicationV2 window for a side conversation between one player and the narrator; per-player transcript; opt-in publish |
| Suffer-move Pipeline | [#214](https://github.com/jamesrmedford-alt/starforged-companion/issues/214) | ✅ COMPLETE | Six-phase pipeline: per-move audit → resolver `sufferPrompt` → executors → blocking dialog → Pay the Price routing → Set a Course feedback |
| Consequence Riders | [#217](https://github.com/jamesrmedford-alt/starforged-companion/issues/217) | ✅ COMPLETE | Auto-applies asset resource effects from a move's outcome; Haiku extraction, condition-matched, GM-gated |
| Shipboard Combat (Battle Stations!) | [#216](https://github.com/jamesrmedford-alt/starforged-companion/issues/216) | 🔄 IN PROGRESS | Phase A shipped (deck-plan ship-map Scene, 11 stations, art + vision placement, `!stations` / `!shipmap`). Phases B–D planned |
| Entity → Actor Migration | [#228](https://github.com/jamesrmedford-alt/starforged-companion/issues/228) | ✅ COMPLETE | Migrated ship → starship and planet/settlement/location → location Actors; hierarchical folders; `!migrate-entities` |
| Rotating Spotlight | [#232](https://github.com/jamesrmedford-alt/starforged-companion/issues/232) | ✅ COMPLETE | Narrator addresses its prompting question to a rotating PC in multiplayer scenes — implied turn order, suggestion only (no gating). `src/narration/spotlight.js`; per-scene pointer; `narratorSpotlightRotation` toggle. See `decisions.md` → "Multiplayer spotlight is implied by narration" |
| Narrator Levity | [#236](https://github.com/jamesrmedford-alt/starforged-companion/issues/236) | ✅ COMPLETE | Optional `narrationLevity` axis (Default/Light/Playful) layered on top of `narrationTone` to lighten the narrator without replacing the chosen voice. `LEVITY_DESCRIPTIONS` in `narratorPrompt.js`; world-scoped; no-op default; skipped for recaps |
| Vow/Combat/Bond Stakes & Rewards | [#241](https://github.com/jamesrmedford-alt/starforged-companion/issues/241) | ✅ COMPLETE | Stakes up front at Swear a Vow / Enter the Fray / Forge a Bond; combat offered (Enter the Fray vs. way out) with narrator-suggested difficulty + objective + vow link; won linked fight → difficulty-scaled vow milestone + Attempt to Fulfill + deepen-the-bond; narrator active-fight awareness (P1). Concrete rewards: narrator proposes two (or write-your-own) at swear, delivered on a won linked fight scaled by outcome — `proposeRewards`/`planRewardGrant` in `moves/rewards.js` (P2). See `decisions.md` → "Vow ↔ combat ↔ bond stakes & rewards" |
| Narrator Entity Discovery v2 | [#223](https://github.com/jamesrmedford-alt/starforged-companion/issues/223) | 🔧 SUPERSEDED | Earlier draft of entity discovery — replaced by v3 (#219). Closed as not planned; kept for design history |
| World Journal v1 | [#225](https://github.com/jamesrmedford-alt/starforged-companion/issues/225) | 🔧 SUPERSEDED | Earlier draft of World Journal — replaced by v2 (#222). Closed as not planned; kept for design history |

### Scopes without a dedicated issue

Some shipped work is tracked in `decisions.md` rather than a standalone scope issue:

| Area | Status | Where |
|------|--------|-------|
| Exploration lifecycle (expedition + waypoint) | ✅ COMPLETE | `decisions.md` → "Exploration lifecycle" (v1.7.14) |
| Progress track finishers (combat / vow / expedition / connection chat-card buttons) | ✅ COMPLETE | PRs #201, #202 |

### Supporting infrastructure (no scope issue — see [`file-structure.md`](file-structure.md))

| Area | Status | Description |
|------|--------|-------------|
| Multiplayer coordination | ✅ COMPLETE | `src/multiplayer/gmGate.js` (`isCanonicalGM()`) and `speaker.js` (resolves which PC a chat message belongs to). Meter persistence is GM-gated — see PERSIST-001 in known-issues. |
| Narrator memory ([architecture](narrator/narrator-memory-architecture.md)) | ✅ COMPLETE | Unified narrator-prose feed flags, deterministic sidecar emission, scene frame, lexical relevance + entity cards, rolling session summary. Invariants in `rules/narrator-memory.md`. |
| Playtest Quickstart | ✅ COMPLETE | `src/session/quickstart.js` — one-click fresh-world setup via a hotbar Macro and `module.api.runPlaytestQuickstart()`. |
| Speech input | ✅ COMPLETE | `src/input/speechInput.js` — push-to-talk dictation via the Web Speech API (Chromium). |
| Ship Envision / History | ✅ COMPLETE | `src/entities/shipEnvision.js` — on-demand oracle-driven ship detail beyond the boot-up auto-seed; `!ship envision` / `!ship history`. |

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
  │     └─► Private Channel (✅)
  └─► Quench Integration Tests (✅)

Standalone: Clocks (✅) · Sector Creator (✅) → Sector Creator Enhanced (✅)
            System Asset Integration (✅) · Pacing (✅) · API Key Privacy (✅)
            Multiplayer coordination (✅) · Speech input (✅)
            Shipboard Combat (🔄 — Phase A shipped)
```

---

## What to work on next

- **Visual UI polish** — wire the `statIcon` / `assetIcon` / `oracleIcon` resolvers (shipped in System Asset Integration Phase 9) into the entity panel and chat-card templates; the helpers exist but the templates were never updated.
- **Fact Continuity panel surfaces** — the Entity Panel "Active truths" collapsible and the WJ Panel scene-truth filter row were deferred from the Phase D slice; they slot naturally into panel-polish work.
- **Ability scanner — stat substitution** — `src/moves/abilityScanner.js` extracts numeric `+N` adds but surfaces stat-substitution abilities (e.g. Empath's *"roll +heart"*) as text only; extend the scanner/dialog to parse and apply stat substitution automatically.
- **Shipboard Combat Phases B–D** ([#216](https://github.com/jamesrmedford-alt/starforged-companion/issues/216)) — "man the stations" token placement, station-aware move suggestions, and combat-lifecycle integration.

Other possible directions:

- **Speech input polish** — push-to-talk reliability, dictation accuracy.
- **Sector Creator iteration** — richer narrator stubs, additional region templates, post-generation editing.
- **WJ polish** — surface contradiction notifications inside the WJ panel; undo for accidental confirmations.
- **Generative-tier learning** — feed pinned/promoted entries back into the entity-discovery prompt as positive exemplars.
