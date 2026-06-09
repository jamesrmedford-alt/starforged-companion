# Starforged Companion — File Structure

What each file exports and does. This is the single authoritative file-structure
reference — there is no separate root `file-structure.md`. It covers the runtime
source tree (`src/`), the test suites, the bundled assets, and the developer
documentation under `docs/` and `rules/`.

Only `src/`, `styles/`, `lang/`, and `module.json` are bundled into the Foundry
module zip. `docs/`, `rules/`, `tests/`, `test/`, and `scripts/` are
developer-only and excluded from the release.

---

## Repository root

| File | Purpose |
|------|---------|
| `module.json` | Foundry manifest. `version` is rewritten by CI at release (the in-tree value lags the live tag). `esmodules` loads `src/index.js` and `src/integration/quench.js`. |
| `CLAUDE.md` | Auto-loaded Claude Code working instructions + bottom-of-file rules index. |
| `README.md` | Player/GM-facing overview, install, commands, cost, safety. |
| `CHANGELOG.md` | GitHub changelog. `[Unreleased]` maps to the next release after the latest tag. |
| `LICENSE.md` | CC BY-NC-SA 4.0. |
| `package.json` / `vitest.config.js` / `eslint.config.js` | npm scripts, Vitest config (coverage thresholds), ESLint flat config. |

---

## `src/` — runtime source

### Top level

| File | Purpose |
|------|---------|
| `index.js` | Module entry point: registers all settings + hooks, the `createChatMessage` dispatcher (every `!`/`@scene`/`\` command), the two-hook toolbar buttons, and the move/narration pipeline. |
| `api-proxy.js` | `apiPost()` — direct browser fetch to the Anthropic API with the `anthropic-dangerous-direct-browser-access` header and BYOK key injection. **All Claude calls route through here.** |
| `schemas.js` | Core data schemas and enums: `CampaignStateSchema`, `MOVES`, `STATS`, `CHALLENGE_RANKS`, entity record shapes, `ContextPacketSchema` (token budget). |

### `art/` — entity portrait generation

| File | Purpose |
|------|---------|
| `generator.js` | Portrait pipeline (generate-once → one regeneration → locked). |
| `openRouterImage.js` | OpenRouter image client; decodes inline base64. **Sole image-provider call site.** |
| `promptBuilder.js` | Builds image prompts from entity descriptions. |
| `storage.js` | Portrait persistence (base64 flag storage). |

### `audio/` — ElevenLabs narration overlay

| File | Purpose |
|------|---------|
| `index.js` | Narrator-card audio orchestrator; routes prose to voices, owns the cache-write socket. |
| `elevenlabs.js` | Direct browser fetch to the ElevenLabs TTS API (BYOK `xi-api-key`). |
| `segments.js` | Splits prose into narrator-vs-NPC segments via `<npc>…</npc>` markup. |
| `playback.js` | `foundry.audio.Sound` wrapper + play/queue state machine. |
| `cache.js` | Content-addressed cache (`worlds/<id>/audio/...`); Forge-aware upload/lookup. |

### `character/` — Actor integration + chronicle

| File | Purpose |
|------|---------|
| `actorBridge.js` | **The only** interface for foundry-ironsworn Actor reads/writes (health, spirit, supply, momentum, impacts, XP, legacies). |
| `chronicle.js` | Character chronicle schema + CRUD. |
| `chronicleWriter.js` | Claude call writing chronicle entries from move resolutions. |
| `chroniclePanel.js` | Chronicle UI panel (ApplicationV2). |

### `clocks/` — campaign & tension clocks

| File | Purpose |
|------|---------|
| `clocks.js` | `!clock` commands (`new`/`advance`/`fill`/`reset`/`remove`/`list`) + ApplicationV2 panel + advance-on-oracle odds. |

### `context/` — narrator context assembly

| File | Purpose |
|------|---------|
| `assembler.js` | Builds the narrator context packet (safety, truths, entity cards, tracks, character state, ledgers). |
| `relevanceResolver.js` | Resolves entity matches + hybrid move classification for injection. |
| `safety.js` | Safety-config formatting — always injected first into the system prompt. |

### `entities/` — entity records & discovery

| File | Purpose |
|------|---------|
| `registry.js` | Host-document dispatch: routes reads/writes to Actor vs JournalEntry storage. |
| `connection.js`, `ship.js`, `settlement.js`, `planet.js`, `location.js`, `faction.js`, `creature.js` | Per-type entity record CRUD (ships/settlements/planets/locations on Actors; others on JournalEntry pages). |
| `shipEnvision.js` | On-demand ✦ Envision / 📜 History for ships. Rolls supplementary oracles beyond the seed (captain, crew, agenda, initial contact) + Action+Theme backstory beats; narrator-prose composer; chat-command predicates + handlers (`!ship envision` / `!ship history`); idempotent dated-subsection notes append. |
| `entityExtractor.js` | Combined detection pass: extracts entities from narrator output + World Journal routing rule; renders draft Confirm/Dismiss cards. |
| `folder.js` | Entity folder helpers (Entities root, per-sector subfolders). |
| `migrator.js` | `!migrate-entities` storage migration to native Actors (7-day deferred cleanup). |

### `factContinuity/` — per-scene memory layer

| File | Purpose |
|------|---------|
| `sidecarParser.js` | Parses the narrator's fenced JSON sidecar (`newTruths`, `stateChanges`). |
| `ledgers.js` | Active-scene ledgers (`sceneTruths`, `sceneState.bySubject`). |
| `sceneLifecycle.js` | Scene start/end: migrates entity truths to generative tiers; archives scene truths to WJ Lore. |
| `correctionDialog.js` | Per-card "Correct a fact" DialogV2 (+ `!truth`/`!state` backing). |
| `consistencyCheck.js` | Optional Haiku consistency audit → GM review card. |
| `shipPosition.js` | §20 ship positioning: token auto-move on a set course. |

### `help/` — in-game help journal

| File | Purpose |
|------|---------|
| `helpJournal.js` | Creates/updates the Help & Reference journal on first GM load. Holds `CONTENT_VERSION` and all help-page content. |

### `input/` — speech

| File | Purpose |
|------|---------|
| `speechInput.js` | Push-to-talk dictation via the Web Speech API (Chromium). |

### `integration/` — live tests

| File | Purpose |
|------|---------|
| `quench.js` | Live-Foundry Quench integration tests, registered on `quenchReady`. |

### `moves/` — interpretation & resolution

| File | Purpose |
|------|---------|
| `interpreter.js` | Claude call: narration → move identification + stat injection. |
| `resolver.js` | Dice rolling, outcome calc, and the `CONSEQUENCE_MAP` (arrow-function handlers per play-kit tables). |
| `statEnrichment.js` | Fills `interpretation.statValue` from the actor's sheet. |
| `abilityScanner.js` | Detects asset abilities applying to the chosen move; extracts `+N` adds. |
| `burnMomentum.js` | Burn-momentum chat-card affordance. |
| `mischief.js` | Mischief dial framing (`normalizeDial()` bridge). |
| `persistResolution.js` | Persists outcomes to Actor state + WJ (GM-gated — see PERSIST-001). |
| `repair.js` | `!repair` point-spend dialog (integrity/modules/health). |

### `multiplayer/` — multi-client coordination

| File | Purpose |
|------|---------|
| `gmGate.js` | `isCanonicalGM()` single-emitter pipeline gate (prevents duplicate move resolution across clients). |
| `speaker.js` | Resolves which PC a chat message belongs to. |

### `narration/` — the narrative engine

| File | Purpose |
|------|---------|
| `narrator.js` | `narrateResolution`, `narratePacedInput`, `interrogateScene`, recap + vignette helpers, `resolveNarrationPerspective()`. |
| `narratorPrompt.js` | Builds the narrator system prompt (tone/perspective/length + all context sections). |

### `oracles/` — oracle tables & rolling

| File | Purpose |
|------|---------|
| `roller.js` | Roll any oracle table; inject results. Backs `!oracle`. |
| `customOracles.js` | User-registered custom oracle tables (`!oracle-add`). |
| `tables/*.js` | Canonical Starforged oracle tables: `core`, `planets`, `space`, `themes`, `creatures`, `settlements`, `starships`, `factions`, `characters`, `derelicts`, `vaults`, `sufferAndCombat`, `discoveryAndChaos`, `payThePrice`, `sessionVignette`, `misc`. |

### `pacing/` — pre-classifier

| File | Purpose |
|------|---------|
| `classifier.js` | Haiku pre-classifier → `MOVE` / `NARRATIVE` / `NARRATIVE_WITH_MOVE_AVAILABLE`. |
| `router.js` | Routes paced input per the classifier decision. |
| `telemetry.js` | Pacing decision log journal (dial tuning). |

### `safety/` — session-move dialogs

| File | Purpose |
|------|---------|
| `sessionDialogs.js` | Set a Flag / Change Your Fate / Take a Break dialogs. |
| `sessionLifecycleDialogs.js` | Begin/End Session dialogs — own the `sessionActive` flips and fire the vignettes. |

### `sectors/` — sector creator

| File | Purpose |
|------|---------|
| `sectorGenerator.js` | 11-step sector generation (rulebook pp. 114–127). |
| `sectorPanel.js` | Sector Creator ApplicationV2 wizard. |
| `sectorArt.js` | Per-region background art generation. |
| `sceneBuilder.js` | Foundry Scene creation (Note pins + Drawing passages). |
| `sectorMap.js` | SVG sector map renderer. |
| `sectorOverview.js` | Sector-record JournalEntry overview. |
| `sectorSceneHooks.js` | Click handlers for sector-scene Note pins. |

### `session/` — session lifecycle & vignettes

| File | Purpose |
|------|---------|
| `lifecycle.js` | Session-active gate state machine: `isSessionActive`, `beginSession`, `endSession`, `sessionMinutesActive`. |
| `galleyVignette.js` | Begin-Session opening galley vignette (active PCs). |
| `endSessionVignette.js` | End-Session closing NPC vignette. |
| `incitingIncident.js` | Envision an Inciting Incident (rulebook "Begin your adventure" §1): rolls the Action+Theme spark, routes it through the narrator (`inciting_incident` mode) for a grounded opening event + suggested vow, posts the launch card. Oracle-only fallback with no key. Backs the Session-panel ✦ button and `!incite`. |

### `system/` — foundry-ironsworn integration

| File | Purpose |
|------|---------|
| `ironswornAssets.js` | Runtime path constants for foundry-ironsworn art (starships, locations, icons). |
| `ironswornPacks.js` | Canonical compendium lookup (moves, oracles, encounters, truths). |
| `campaignTruths.js` | Injects the foundry-ironsworn canonical-truths digest into context. |
| `encounterSpawn.js` | `!sfc encounter <name>` canonical encounter spawn. |
| `i18n.js` | Localisation wrapper for foundry-ironsworn strings. |
| `chatHooks.js` | `onChatMessageRender()` — subscribes to both v12/v13 render-hook names (V13-002 fix). |

### `truths/` — world truths

| File | Purpose |
|------|---------|
| `generator.js` | World-truth rolling, storage, and context formatting (14 categories + sub-tables). Backs `!truths`/`!lore`. |
| `tables.js` | World-truth oracle tables (all 14 Starforged categories). |

### `ui/` — ApplicationV2 panels

| File | Purpose |
|------|---------|
| `settingsPanel.js` | Companion Settings panel (tone/model/keys + ~40 world/client settings). Hosts `syncSafetyToCampaignState()`. |
| `entityPanel.js` | Entity panel (generative tiers, links, current-location card). |
| `progressTracks.js` | Progress-track panel (vows/expeditions/combats/connections/legacy). |
| `sessionPanel.js` | Session moves panel — Begin/End/Flag/Fate/Break (v1.6.0). |
| `companionToolbar.js` | Floating, draggable launcher (frameless `ApplicationV2`) for all Companion panels. Replaces the scene-controls group (v1.7.5); scene-independent so it works with no map open. Exports `openCompanionToolbar()` / `registerCompanionToolbarSettings()`. |
| `companionToolbarTools.js` | Pure, import-free visibility/data for the launcher (`companionToolbarTools({isGM, privateChannelEnabled})`); unit-tested in isolation. |

### `world/` — World Journal

| File | Purpose |
|------|---------|
| `worldJournal.js` | World Journal CRUD (four category journals + session log). |
| `worldJournalPanel.js` | WJ panel (confirm, severity dropdown, history accordion, entity links). |
| `clarificationDialog.js` | Hybrid entity clarification dialog (NED v3). |

---

## Tests & assets

| Path | Purpose |
|------|---------|
| `tests/unit/*.test.js` | Vitest unit suites (one per module area). |
| `tests/fixtures/`, `tests/helpers/`, `tests/setup.js` | Shared fixtures, helpers, and the Foundry global stubs. Do not edit fixtures without discussing impact. |
| `test/ci/` | CI-only harness assets. |
| `styles/starforged-companion.css` | Bundled stylesheet. |
| `lang/en.json` | Localisation strings. |
| `packs/help/` | LevelDB pack dir (legacy; help is created programmatically — see PACKS-001). |
| `scripts/build-help-site.mjs` | Renders the help pages to a static HTML site. |
| `vendor/foundry-ironsworn/` | Pinned system submodule (read-only reference; never edit without instruction). |

---

## `docs/` — developer documentation

Organised into feature-theme subfolders. The four **hub docs stay at the root**
because they are read every session and linked from `README.md` and `CLAUDE.md`.

### Root (hubs — read first every session)

| File | Purpose |
|------|---------|
| [`scope-index.md`](scope-index.md) | **Start here** — single-table status of every feature scope + dependency graph + next steps. |
| [`decisions.md`](decisions.md) | Architecture decisions and rationale; read before changing a constrained pattern. |
| [`known-issues.md`](known-issues.md) | Open bugs, accepted workarounds, and resolved-issue history. |
| [`file-structure.md`](file-structure.md) | This file. |

### `narrator/` — narration, scene queries, recaps

`narrator-scope.md`, `scene-interrogation-scope.md`, `previously-on-scope.md`,
`private-channel-scope.md` (📋 planned), `narrator-suggestion-loop-investigation.md`,
`narrator-suggestion-loop-group-c-design-memo.md`.

### `entities/` — entity discovery, World Journal, migration

`narrator-entity-discovery-scope-v3.md`, `narrator-entity-discovery-scope-v2.md`
(🔧 superseded), `world-journal-scope-v2.md`, `world-journal-scope.md`
(🔧 superseded), `entity-actor-migration-scope.md` (📋 planned),
`implementation-ordering.md` (NED + WJ phasing).

### `character/` — Actor integration & keys

`character-management-scope.md`, `ironsworn-api-scope.md`, `api-key-privacy-scope.md`.

### `sectors/`

`sector-creator-scope.md`, `sector-creator-enhanced-scope.md`.

### `pacing/`, `fact-continuity/`, `audio/`, `session/`, `clocks/`

`pacing/pacing-scope.md` · `fact-continuity/fact-continuity-scope.md` ·
`audio/audio-narration-scope.md` · `session/session-scope.md` ·
`clocks/clocks-scope.md`.

### `foundations/` — core plumbing & system integration

`foundations-scope.md`, `system-asset-integration-scope.md`,
`world-truths-scope.md`.

### `rules-reference/` — game-rules sources

| File | Purpose |
|------|---------|
| `playkit-rules-and-coverage.md` | Authoritative play-kit rules + per-feature coverage map. Read before implementing a move/table/mechanic. |
| `rulebook-summary.md` | Section-by-section rulebook summary + design implications. Read before narrator/classifier/scene work. |
| `rulebook-coverage-audit.md` | Rulebook compliance audit (priorities). |

### `foundry-reference/`

| File | Purpose |
|------|---------|
| `foundry-api-reference.md` | Foundry VTT API reference (Hooks, ApplicationV2, ChatMessage, FilePicker, SceneControls). Read before writing Foundry API code. |
| `architecture.html` | Interactive system diagram. |

### `testing/` — coverage & audits

`quench-integration-scope.md`, `quench-coverage-audit-plan.md`,
`behaviour-coverage-audit.md`, `behaviour-coverage-audit-plan.md`.

### `process/`

`claude-code-quickstart.md`, `session-01.md` (example session walkthrough).

---

## `rules/` — operational rules for Claude Code

Read on demand at the trigger points in the `CLAUDE.md` startup checklist.

| File | Purpose |
|------|---------|
| [`../rules/foundry-api.md`](../rules/foundry-api.md) | Foundry API rules — Hooks, ApplicationV2, ChatMessage, the two-hook toolbar pattern, v12 → v13 changes. |
| [`../rules/foundry-ironsworn.md`](../rules/foundry-ironsworn.md) | foundry-ironsworn submodule mechanics, Actor/Item schema rules, field-path rules. |
| [`../rules/quench.md`](../rules/quench.md) | Quench integration-testing API, registration + guard patterns, dynamic-import gotchas. |
| [`../rules/game-rules.md`](../rules/game-rules.md) | Rules-reference index — play-kit doc vs rulebook summary. |
| [`../rules/ci-e2e.md`](../rules/ci-e2e.md) | Docker stack, Cypress specs, GitHub Actions PR-gating, subscribe-to-PR / sticky-comment loop. |
| [`../rules/project-context.md`](../rules/project-context.md) | Module overview, transport (direct browser fetch), system dependency. |
