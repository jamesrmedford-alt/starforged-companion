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

Latest release tag: **v1.7.35** (fetched 2026-10-25 — always re-check with
`git fetch --tags origin && git tag --sort=-version:refname | head -1`).

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
| Vow Lifecycle | [#248](https://github.com/jamesrmedford-alt/starforged-companion/issues/248) | ✅ COMPLETE | Playtest-driven vow overhaul: conditional + coupled inciting clock with the proximal crisis split into its own tension clock (A); player-authored vows get the reward/connection/swear treatment via a one-click prompt card (B1) + connection picker, paying the bond on fulfilment (B2); all swears roll Swear an Iron Vow → momentum/complication (C); native-sheet vow rolls narrate on a keyed client and apply consequences (D). Establishes the cross-cutting **no silent failures** rule. See `decisions.md` → "No silent failures" |
| Multiplayer Test Infrastructure | [#282](https://github.com/jamesrmedford-alt/starforged-companion/issues/282) | ✅ COMPLETE | Permission-faithful Foundry stubs; the multi-client harness (`tests/helpers/multiClient.js`), with a routing matrix over every `CHAT_COMMAND_ROUTES` entry; move-pipeline and relay-queue concurrency tests; producer→consumer composition tests. Static invariant checks: `deadscan --strict` in CI, every campaignState field written and read, every document-hook handler gated. A second-client E2E suite runs a GM and a player in real browsers after Quench. `src/index.js` is measured for coverage, and the routing policy moved to a module on the core bar. With the fixes reverted, the harness fails on the player X-Card, per-client `!oracle`, Burn double-apply and stale-snapshot bugs. Follow-ups in known-issues.md: CAMPAIGN-TRUTHS-UNWIRED, INDEX-EXTRACTION |
| Narrator Continuity & Detail Persistence | [#286](https://github.com/jamesrmedford-alt/starforged-companion/issues/286) | ✅ COMPLETE | Audit of how small details are stored, sent and kept, in session and between sessions. One entity roster shape end to end; Actor-hosted tier writes; `@scene` continues the scene; state sheds by priority; concrete-specifics sidecar rule; move narration carries recent turns and the player's line; frame cast keeps cards on moves; summary regen off the critical path; strikes reach every copy; scene end keeps whereabouts and place details; lore chosen per turn; session boundaries (End Session or four idle hours) and LAST SESSION; clocks, vow progress, rewards, connection standing and session focus in the prompt; player-key side-data relayed to the GM; draft confirm keeps narrated role and goal; wider detection; narrator usage telemetry (F6 step 1); exact-id thinking check (F7). Remaining work moved to #287 |
| Narrator Continuity Follow-ups | [#287](https://github.com/jamesrmedford-alt/starforged-companion/issues/287) | 🔄 IN PROGRESS | From #286: D1 done (the Private Channel reads the shared story; a published reflection is canon); §F steps 2–6 (tiered, cached request layout and larger budgets — wait on the Narrator Usage numbers and a playtest); six follow-ups (SUMMARY-KEYLESS-GM, STRIKE-CHRONICLE, CHRONICLE-FIRST-PC, CONN-BACKGROUND-UNWRITTEN, CREATE-PERSIST-WHOLE, TEXT-SUBJECT-LOWERCASE) |
| Narrator In-Client Testing | [#290](https://github.com/jamesrmedford-alt/starforged-companion/issues/290) | 🔄 IN PROGRESS | Split from #287. Part 1 built in the v1.7.36 cycle: the Quench batch `starforged-companion.promptContracts` runs every narrator mode against a stubbed endpoint and checks each section of the captured request against the data it reads, present and absent, plus what one narration records into the next request; `!narrator debug` (GM only) shows the last narration's request, section by section, with its fact block (`src/narration/narratorDebug.js`). The checks found two live bugs, fixed with them: open fights and expeditions never reached the narrator (TRACKS-UNPORTED) and the ship description ignored its modules (v1.6.1 F7). Part 2 built in the same cycle: scripted GM + player playthroughs in the Playwright suite (`test/ci/playwright/playthrough.mjs`, scenarios in `playthroughs/`), the GM's real pipeline answered from recorded Claude replies (`recordings/`, hand-written placeholders until recorded with `--record-playthroughs`), every PR, no key, about 3 minutes; it settled that a player's client can read NPC cards it doesn't own, and it moves the ship (a typed Set a Course and a drag of its token on a sector map, v1.7.10 F5). Remaining: a real recording of the first scenario; part 3, live QA with an AI playtester (recall probes, observers, model judge), on demand with a key. See decisions.md → "Prompt contracts and `!narrator debug`" and "Scripted playthroughs" |
| Automated Playthrough Testing | [#302](https://github.com/jamesrmedford-alt/starforged-companion/issues/302) | 🔄 IN PROGRESS | Slices A and B built in the v1.7.36 cycle. A: every #300 / #301 fix's tests shown to fail without it (`scripts/fix-sensitivity.mjs`, `docs/testing/fix-sensitivity.md`); the first-session playthrough replays **strict** — each step declares its Claude calls with prompt contracts, and a missing, unrecorded or undeclared call fails it; a failed recording run never becomes the baseline. B: fault boundaries in the multi-client harness (`tests/helpers/faults.js`) and a disturbance matrix (`tests/unit/faultMatrix.test.js` — Claude faults, refused writes, repeat clicks, a dropped GM connection), which found six defects, fixed (the move lock after a refused write, the X-Card card after a failed save, a double Confirm, a twice-applied suffer pick) and three open (MOVE-BUSY-NOTICE, DRAFT-CONFIRM-TWO-GMS, ERROR-TEXT-BLAMES-KEY). Remaining: a real recording of first-session; slices C (generated sequences), D (AI exploration, with #290 part 3) and E (play-quality benchmarks). See decisions.md → "Strict replay for critical playthroughs" |
| Collaborative Character Creation | [#291](https://github.com/jamesrmedford-alt/starforged-companion/issues/291) | 📋 PLANNED | The narrator and a player build a PC together through an in-character interview: the Private Channel's reserved `CHARGEN` mode (#226 §15), opened from a Companion toolbar button players can use, run on the GM's key with the world narrator model. The interviewer draws out the backstory and matches it to the closest of the pack's 46 paths, with its leanings shown live and questions about a path answered; it asks gender, height and weight and offers to take the character's picture (the portrait pipeline, one retake); the player tweaks the full proposal at the end; Finish creates the Actor on the canonical GM, makes the interviewer a troublesome first connection, and offers an introduction card that is canon once posted. Campaign Start keeps its fast random PCs. Sheet fields follow the Starforged sheet: look and manner in Characteristics, backstory and gear in Notes; the background vow is an ordinary vow. Text only, no audio. See `decisions.md` → "Collaborative character creation" |
| Phone Play on The Forge | [#293](https://github.com/jamesrmedford-alt/starforged-companion/issues/293) | 🔄 IN PROGRESS | Make the Companion usable for the GM debugging a Forge-hosted game alone from a recent Google Pixel (Chrome on Android), in portrait and landscape, with no zooming needed. Built in the v1.7.34 cycle: the module's UI switches to a compact, touch-friendly layout by itself (`src/ui/layoutMode.js` sets `sf-compact` / `sf-touch` on `<body>` from a finger and a small screen), with a per-device Automatic / Phone / Desktop **Layout** setting; the toolbar always stays on screen and, when compact, folds behind one launcher with a labelled tool list; module windows (`sf-window`) span the screen; tap targets grow to 44–48 px. Also fixed: sector and ship-map art on The Forge (FORGE-ART-UPLOAD), Private Channel turns saved on app switch (PC-TRANSCRIPT-HIDDEN), push-to-talk stopped on `touchcancel` (PTT-TOUCHCANCEL). First phone test (v1.7.34): a pinch over Foundry's map drew its orange selection box, so in v1.7.35 two-finger gestures pass through the map on a phone (PHONE-PINCH-MAP). Remaining: the rest of the test pass on the phone; a dedicated phone view only if it shows the compact layout isn't enough. See `decisions.md` → "Phone layout" |
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

- **Visual UI polish** — stat / asset / oracle icons on the entity panel and chat-card templates. (The unwired `statIcon` / `assetIcon` / `oracleIcon` resolvers from System Asset Integration Phase 9 were deleted in the 2026-07 test-suite review; this would be a fresh build, not a wiring job.)
- **Fact Continuity panel surfaces** — the Entity Panel "Active truths" collapsible and the WJ Panel scene-truth filter row were deferred from the Phase D slice; they slot naturally into panel-polish work.
- **Shipboard Combat Phases B–D** ([#216](https://github.com/jamesrmedford-alt/starforged-companion/issues/216)) — "man the stations" token placement, station-aware move suggestions, and combat-lifecycle integration.

Other possible directions:

- **Speech input polish** — push-to-talk reliability, dictation accuracy.
- **Sector Creator iteration** — richer narrator stubs, additional region templates, post-generation editing.
- **WJ polish** — surface contradiction notifications inside the WJ panel; undo for accidental confirmations.
- **Generative-tier learning** — feed pinned/promoted entries back into the entity-discovery prompt as positive exemplars.
