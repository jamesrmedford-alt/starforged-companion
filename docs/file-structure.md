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
| `index.js` | Module entry point: registers all settings + hooks, the `createChatMessage` dispatcher (every `!`/`@scene`/`\` command), the two-hook toolbar buttons, and the move/narration pipeline. Chat commands route through the ordered `CHAT_COMMAND_ROUTES` table, dispatched by `multiplayer/commandRouting.js`: each command carries a run-on policy — `AUTHOR` (the typist's client only), `CANONICAL_GM` (warns the author when no GM is connected), or `CLAUDE` (the keyed canonical GM when `hasKeyedActiveGM()`, else the author's client) — so a command runs exactly once, not once per connected client. Also exports, for the relay handlers and tests: `resolveVowHolderActor`, `markLinkedVowMilestone` / `deepenLinkedConnection` (won-fight relay handlers in `moves/cardActions.js`), `payFulfilledVowNative`, `momentumRecalcRunsHere` (which client re-derives momentum bounds after another user's sheet edit), `wireFightVowButtons`, `isDeniedRecapCommand`. |
| `api-proxy.js` | `apiPost()` — direct browser fetch to the Anthropic API with the `anthropic-dangerous-direct-browser-access` header and BYOK key injection. **All Claude calls route through here.** |
| `net/fetchWithTimeout.js` | `fetchWithTimeout()` + `DEFAULT_TIMEOUT_MS` (120s) — `fetch` bounded by an `AbortController` so a stalled request rejects instead of hanging forever. Used by `api-proxy.js` and `art/openRouterImage.js`; added after the v1.7.23 sector-creator silent hang (unbounded portrait fetch stalled, Scene never built, nothing logged). |
| `schemas.js` | Core data schemas and enums: `STATS`, `RANKS` / `RANK_TICKS` / `rankTicks` / `rankName`, `MOVES`, `NARRATOR_CLASSES` (the MOVES contract-test anchor), `ORACLE_ODDS`, `ConnectionSchema`, `CampaignStateSchema` (incl. `questFocus` / `connectionFocus`). `MoveResolutionSchema` survives only as a documentation `@typedef` (JSDoc references still resolve). The zero-consumer `CharacterSchema`, `SessionSchema`, `ArtAssetSchema`, the `MoveResolutionSchema` object, `MISCHIEF_LEVELS`, `RELATIONSHIP_TYPES`, `ART_BACKENDS`, `IMPACTS`, `TRACK_TYPES` exports and `CampaignStateSchema.progressTrackIds` were deleted in the 2026-10 audit. |

### `art/` — entity portrait generation

| File | Purpose |
|------|---------|
| `generator.js` | Portrait pipeline (generate-once → one regeneration → locked). |
| `openRouterImage.js` | OpenRouter image client; decodes inline base64. **Sole image-provider call site.** |
| `promptBuilder.js` | Builds image prompts from entity descriptions. |
| `storage.js` | Portrait persistence (base64 flag storage). `storeArtAsset` adds its `artAssetIds` index entry to the latest stored campaignState, never the caller's whole copy (issue #300 F14). |

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
| `actorBridge.js` | **The only** interface for foundry-ironsworn Actor reads/writes (health, spirit, supply, momentum, impacts, XP, legacies). `readCharacterSnapshot` (cached per actor; dropped on `updateActor` and on the actor's Item changes) also carries the `grantedRewards` the narrator's CHARACTER block lists (issue #286 C5). `readMomentumState` — momentum and its bounds read live (value, min, max, reset, impact count) from the one bounds derivation the sheet writes use; the burn preview and burn apply read it (issue #300 F03). |
| `chronicle.js` | Character chronicle schema + CRUD. |
| `chronicleWriter.js` | Claude call writing chronicle entries from move resolutions. |
| `chroniclePanel.js` | Chronicle UI panel (ApplicationV2). |

### `clocks/` — campaign & tension clocks

| File | Purpose |
|------|---------|
| `clocks.js` | `!clock` commands (`new`/`advance`/`fill`/`reset`/`remove`/`list`) + ApplicationV2 panel + advance-on-oracle odds. `advanceTensionClocksForPayThePrice` / `revertTensionClocksForBurn`, `advanceCampaignClocksForBeginSession`. A clock that is already full only posts an "already triggered" notice (no second vignette); the panel's ↻ / + buttons share the `!clock` card logic. Active clocks reach every prose narration as the [4h] CLOCKS block (issue #286 C5). |
| `payThePriceClocks.js` | `advanceClocksOnPayThePrice` (tension clocks + each PC's vow countdown clocks, one segment per Pay the Price; GM-only — called directly by the move pipeline, which keeps the return for the burn reversal) and `advanceClocksForPayThePriceRelay` (gmRelay `payThePrice.advanceClocks`, so a player-typed `!ptp` advances the clocks once, on the canonical GM). |

### `context/` — narrator context assembly

| File | Purpose |
|------|---------|
| `relevanceResolver.js` | Resolves entity matches + hybrid move classification for injection; exports `collectAllEntities` (the one roster shape — host document ids — for sidecar subject resolution), `resolveEntityName` (one name from the fiction → its entity, bounded ladder) and `HONORIFIC_PREFIXES` (shared with entity-name dedup). Lexical on the paced/@scene paths (`moveId: null`). |
| `safety.js` | Safety-config formatting (`formatSafetyContext`; `formatNarratorSafetyContext` for the shared narrator prompt — every player's Private Lines on a GM's client, only the building player's own on a player's) — always injected first into the system prompt; Private Lines come from `campaignState.safety.privateLines` (players' lines relayed by `ui/settingsPanel.js`). X-Card: `suppressScene` (gmRelay `xcard.activate` — sets `xCardActive`), `clearXCard`, `playXCard` (typed `!x` → relay + card), `postXCardCard` (says when the pause could not be recorded), `resumeNarrationAfterXCard` (GM-only resume, `!x clear`), `bindXCardCard` + `XCARD_RESUME_ACTION` (the card's GM-only "Resume narration" button). |

### `entities/` — entity records & discovery

| File | Purpose |
|------|---------|
| `registry.js` | Host-document dispatch: routes reads/writes to Actor vs JournalEntry storage. `ENTITY_ID_LISTS` + `unionIdList` (the campaignState id lists, unioned by persistResolution's merge and the sector store); `registerEntityIdInStore` — every creator registers its new id on the latest stored campaignState instead of writing the caller's copy whole (issue #300 F14). |
| `connection.js`, `ship.js`, `settlement.js`, `planet.js`, `location.js`, `faction.js`, `creature.js` | Per-type entity record CRUD (ships/settlements/planets/locations on Actors; others on JournalEntry pages). The art pipeline links portraits through the registry (`art/generator.js` → `writeEntityFlag`); the zero-consumer per-type `setPortraitId` / `setPortraitSourceDescription` / `isReadyForArtGeneration` helpers and `creature.updateCreature` were deleted in the 2026-10 audit. `ship.js`: `repairIntegrity` / `clearBattered` are live (`!repair`); `isShipBattered` reads the canonical native `system.debility.battered` (the starship sheet's toggle and the suffer dialog use only that field — the flag's `battered` is a write-through mirror kept by `updateShip`); `sufferDamage` is still `// UNWIRED: #216 Phase D`. |
| `shipEnvision.js` | On-demand ✦ Envision / 📜 History for ships. Rolls supplementary oracles beyond the seed (captain, crew, agenda, initial contact) + Action+Theme backstory beats; narrator-prose composer; chat-command predicates + handlers (`!ship envision` / `!ship history`, routed `RUN_ON.CLAUDE` — the keyed canonical GM when one is connected, else the author, whose client posts the card but skips the GM-only notes write with a debug line); idempotent dated-subsection notes append. |
| `entityExtractor.js` | Combined detection pass: extracts entities from narrator output + World Journal routing rule; renders draft Confirm/Dismiss cards. `appendGenerativeTierUpdates` records a matched entity's significant new developments to its card, salience-gated (`TIER_SALIENCE_FLOOR`, fail-open) and biased toward actions over trivia, and saves them on the host document through the registry. `promoteNewEntityLedgerSubjects` re-keys the scene ledgers' text-subject facts to a new entity's host id (draft Confirm, make_a_connection auto-create, inciting vow-target create). |
| `folder.js` | Entity folder helpers (Entities root, per-sector subfolders). |
| `migrator.js` | `!migrate-entities` storage migration to native Actors (7-day deferred cleanup); ready-time repairs `backfillNpcCardSheets` (pin Starforged sheet on NPC cards) and `syncEntityRecordNames` (reconcile record names to Actor names) — v1.7.10 findings F1/F2. |

### `factContinuity/` — per-scene memory layer

| File | Purpose |
|------|---------|
| `sidecarParser.js` | Parses the narrator's fenced JSON sidecar (`newTruths`, `stateChanges`, `sceneFrame`). `normaliseSidecar` also re-checks side-data relayed from a player's client (`applyRelayedNarratorSidecar`, issue #286 D2). |
| `ledgers.js` | Active-scene ledgers (`sceneTruths`, `sceneState.bySubject`) + `applySceneFrame` (scene-frame snapshot). `subjectKey` / `subjectFromStateKey` map subjects to state keys and back (`scene`, lowercased text, `entity:<host id>`). See `docs/narrator/narrator-memory-architecture.md`. |
| `sceneLifecycle.js` | Scene start/end: migrates entity truths to generative tiers; archives scene truths to WJ Lore; clears the scene frame. `persistCampaignStateFields(campaignState, fields, label)` (via `mergeOwnedFields`) writes only the named top-level fields onto a fresh read of the stored campaignState (the caller's object may be the move pipeline's pre-narration snapshot); `startScene` / `endScene` persist their scene fields this way, and End a Session uses `mergeOwnedFields` for its own. `persistSceneLedgerFields` is the narrator-sidecar persist: nothing when the store moved to another scene, `sceneTruths` unioned by id otherwise (`mergeSceneLedgers`, shared with `persistResolution`). Scenes start on the canonical GM only (`ensureSceneStarted`; `@scene` continues the scene in progress — #286 A4). `endScene` also keeps the scene's strikes for the session (`rememberSessionRetractions`). |
| `correctionDialog.js` | Per-card "Correct a fact" DialogV2 (`openCorrectionDialog`). |
| `retractions.js` | A struck truth reaches every copy (issue #286 B6): `propagateRetraction` (same-session tier details + World Journal lore + a summary regen), `rememberSessionRetractions` (endScene keeps the scene's strikes on `campaignState.sessionRetractions`), `sessionRetractedFacts` (CORRECTED block + the summary's leave-out list), `factsOverlap`. |
| `chatCommands.js` | `!truth` / `!state` correction commands. `parseFactContinuityCommand` (pure syntax check); `handleFactContinuityCommand` runs on the typist's client (toggle + syntax checked there, usage warnings stay local) and relays the raw text via gmRelay `factContinuity.command`; `applyFactContinuityCommand` runs on the canonical GM, resolves subjects against the full entity roster, takes permissions from the requester (`ctx.requesterIsGM` — a player cannot strike a GM-asserted truth), persists and posts the result card. |
| `consistencyCheck.js` | Optional Haiku consistency audit → GM review card. |
| `shipPosition.js` | §20 ship positioning: `inferShipPosition` (tolerant seed matching — possessives, article-wrapped multiword names; registry-backed document-first entity resolution, `options.entities` injection), `formatShipPositionLine`, `matchSeedAgainstIndex`. Provenance sources include `expedition` (finish_an_expedition arrivals) and `scene_token` (token-derived positions). |

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
| `quench.js` | Live-Foundry Quench integration tests, registered on `quenchReady`. `starforged-companion.promptContracts` (issue #290 part 1) runs every narrator mode against a stubbed Anthropic endpoint and checks each section of the captured request, present and absent. |

### `moves/` — interpretation & resolution

| File | Purpose |
|------|---------|
| `interpreter.js` | Claude call: narration → move identification + stat injection. `buildContextSummary` tells the interpreter the open vows (vow Items on the PCs, owner-tagged with >1 PC) and the open non-vow tracks in the Progress Tracks journal (it once read `campaignState.progressTrackIds`, which nothing wrote); `buildCombatPositionDirective` / `constrainMoveToPosition`, `buildCanonicalMoveBlock`, `interpretMove`. |
| `resolver.js` | Dice rolling, outcome calc, and the `CONSEQUENCE_MAP` (arrow-function handlers per play-kit tables). |
| `expedition.js` | Exploration lifecycle (audit 3.18–3.21): `applyExpeditionProgress` (resolve-or-create the shared expedition track + mark a rank-step), `selectExpeditionTrack`, `finishExpedition` + `legacyRewardTicks`, `normalizeExpeditionRank`. Dependency-injected over the live `progressTracks.js` store; Foundry-free + unit-tested. Wired via GM-gated handlers in `index.js`. |
| `vow.js` | Vow lifecycle (audit 3.11 Fulfill Your Vow): `selectVowTrack`, `finishVow` (close the open vow track + report quests-legacy ticks, weak hit one rank lower). Reuses `legacyRewardTicks` from `expedition.js`; dependency-injected, Foundry-free + unit-tested; wired via the GM-gated `fulfillVow` handler in `index.js`. |
| `battleStations.js` | Battle Stations! shipboard-combat framework (rulebook Ch. 3, pp. 184–187) — **not a move**. Pure: `SHIPBOARD_ROLES` (11 crew roles), `buildShipboardCombatGuidance` (narrator block), `shouldInjectShipboardGuidance` (inject predicate), `isBattleStationsCommand` + `renderBattleStationsCardHtml` (the `!stations` play aid). Narrator wiring in `narrator.js`; command IO in `index.js`. Ship-map mini-game Phase A shipped (`shipMapScene.js`). |
| `shipMapScene.js` | Battle Stations! ship-map deck-plan Scene (mini-game Phase A). Deck features = stations + galley + installed modules: `STATION_LAYOUT` / `AMENITY_LAYOUT` (fixed coords), `MODULE_DECK_HINTS` (per-slug cells), `buildModuleFeatures` / `buildDeckFeatures` (read the Actor's Module Items), `buildDeckFeatureNoteData` / `buildHullOutlineDrawing` (pure builders), `createShipMapScene` (Scene + deck Note pins + schematic hull / art backdrop, mirrors `sectors/sceneBuilder.js`), `generateShipMapForActor` + `maybeCreateShipMapScene` (orchestrator: art → vision → scene → `shipMapSceneId` link; auto-gated), `findShipMapScene`, `isShipMapCommand` (the `!shipmap` matcher), `handleShipDeckNoteClick` + `registerShipMapSceneHooks`. Auto-trigger inside `seedStarshipActor`; command IO (`!shipmap`) in `index.js`. |
| `shipMapArt.js` | Deck-plan background art for the ship map. `buildShipMapBackgroundPrompt` (pure, top-down deck-plan prompt seeded from `type`/`firstLook`, names the galley + installed modules), `generateShipMapBackground` (OpenRouter image → upload to `worlds/{id}/scenes/`, returns `{path, b64}`). Mirrors `sectors/sectorArt.js`. |
| `shipMapVision.js` | Vision-based deck-feature placement. `resolveStationCoordsFromImage` (Claude vision via `api-proxy.js` → normalized per-feature coords for stations + galley + modules), `parseJsonObject` + `validateVisionCoords` (pure; required stations gate, optional galley/modules → fixed-layout fallback). Consumed by `shipMapScene.generateShipMapForActor`. |
| `statEnrichment.js` | Fills `interpretation.statValue` from the actor's sheet. |
| `abilityScanner.js` | Detects asset abilities applying to the chosen move; extracts `+N` adds, stat substitution, and (v1.7.11 finding G) post-roll result-improvement (`extractResultImprovement`) + the ability's own clock fields. |
| `burnMomentum.js` | Burn-momentum chat-card affordance (post-roll outcome upgrade). A click relays to the canonical GM (`relayCardButtonClick` → gmRelay `move.burnMomentum` → `applyBurnFromRelay`, idempotent per card; only the PC's owner or a GM — `requesterOwnsActor`); the button re-arms after `RELAY_RECOVERY_MS` (15 s) if the card is still unused. Re-narration describes the burning PC (`speakerActorId` = the card's actor). The button opens only once the pipeline stamps `originalApplied` (`resultUpgradeBlocker`, `UPGRADE_PENDING_TITLE`); a burn and an Improve Result are exclusive per card (`claimResultUpgrade` / `releaseResultUpgrade`, shared with improveResult.js) — issue #300 F02. Also `buildBurnState` (momentum clamped to the live bounds — F03), `renderBurnButtonHtml`, `registerBurnMomentumHook`, `supersedeOriginalNarration`, `buildSupersededNarrationContent`. |
| `improveResult.js` | Post-roll "improve the result" affordance (v1.7.11 finding G) — e.g. Fugitive's improve-to-strong-hit. `buildImproveState` / `renderImproveButtonHtml` / `registerImproveResultHook`; upgrades the outcome, re-narrates (as the card's PC), advances the asset ability's clock as the cost. Clicks relay like burnMomentum.js (gmRelay `move.improveResult` → `applyImproveFromRelay`), with the same recorded-original gate and burn/improve exclusivity. |
| `bondCommand.js` | `!bond [rank] [name]` (bonded Develop Your Relationship). `handleBondCommand` runs on the typist's client: resolves the named or sole bonded connection (its rank drives the adds), rolls, posts the card, and relays the lasting effect via gmRelay `bond.apply`. `applyBondEffects` (canonical GM) clamps the payload to a legal roll result (2 bonds-legacy ticks **or** +2 momentum), raises the rank only one step up from the connection's current rank (+ the bond-Item mirror via `setBondItemRank`), routes ticks through `addLegacyTicks`, and gives momentum to the roller's PC only when the requester owns it (or is a GM). |
| `milestonePicker.js` | Reach a Milestone cards. `postReachMilestoneCard` (the "⚑ Milestone reached" card); `applyMilestonePick` — gmRelay `milestone.pick` handler for the several-open-vows picker: checks the (vowId, actorId) pair is one of the card's own choices (`flags.choices`, else the buttons' data attributes) and that the requester owns that PC, marks the vow, stamps the card `resolved`; idempotent behind an in-flight guard. |
| `cardActions.js` | One-shot chat-card buttons applied on the canonical GM. `relayCardAction` (client side: relay a click, re-arm the button when it is not delivered, refused, or still unresolved after `RELAY_RECOVERY_MS`); `parseCardButtons` (a pre-`choices` card's button data attributes). Handlers: `applyConnectionPick` (gmRelay `connection.pick` — validates the pick against the card's choices, posts the forced Develop / Forge move once speaking as the clicker's PC, stamps `resolved`), `applyFightVowMarkMilestone` / `applyFightVowDeepenBond` (gmRelay `fightVow.markMilestone` / `fightVow.deepenBond` — take every value from the GM-authored won-fight card, stamp `resolvedActions.<action>`). Render binders live in `index.js` (`wireConnectionPickerButtons`, `wireFightVowButtons`). |
| `nextMoveAdd.js` | Take a Break "Move on" +1. `isActionRollMove`; `takeNextMoveAdd` (the pipeline consumes `campaignState.nextMoveAdd` on the next action roll — not progress or no-roll moves) and `clearPersistedNextMoveAdd` (drops it from the stored campaignState). |
| `consequenceRiders.js` | Auto-apply asset resource effects from a move's outcome (v1.7.12) — momentum/health/spirit/supply/integrity/progress. Haiku extraction (`extractRiders`) → `collectFiringRiders` (condition match) → `partitionRiders` (auto vs prompt) → `applyMeterRiders`. Conservative + validated; never applies a guess. See `issue #217 (Consequence Riders)`. |
| `riderDialog.js` | Prompt for optional / "choose one" / ambiguous-progress consequence riders (`promptRiders` / `groupPromptedRiders`). |
| `mischief.js` | Mischief dial framing: `buildMischiefFraming`, `buildMischiefAside` (internal `normalizeDial()` bridge). |
| `persistResolution.js` | `persistResolution(resolution, campaignState, speakerActorId)` — runs on the canonical GM's move pipeline: meters + impacts on the roller's Actor (`speakerActorId`, else the first PC — never `game.user.character`), the suffer-choice card, and the session-log entry. Progress is **not** marked here (the dead `progressTrackId` / `progressMarked` steps were deleted in the 2026-10 audit; the pipeline in `index.js` marks vows, legacy and tracks). The campaignState write merges the pipeline's working copy onto a fresh read of the store (`mergeWithLatestState`: store-owned fields such as `xCardActive` / `safety` / `nextMoveAdd` / `clocks` take the stored value, entity id lists union, legacy ticks take the higher count, scene ledgers merge by scene via the shared `mergeSceneLedgers`) so world writes that landed mid-move are not reverted. |
| `repair.js` | `!repair` point-spend dialog (integrity / battered / modules / health / supply trade). `handleRepairCommand` / `openRepairDialog` run on the typist's client (`resolveRepairActorId` picks the repairing PC there); Apply relays via gmRelay `repair.apply` → `applyRepairSpends` (canonical GM): re-validates the allocation (`normaliseAllocation`), clears battered first (read from the canonical native field via `ship.isShipBattered`), then raises integrity capped at `integrityMax`, and debits supply only from a PC the requester owns. Traded points are paid in full before any repair lands (`paySupplyTrade`): no payer, someone else's PC, too little supply or a failed debit repairs nothing (issue #300 F04). The card states what actually happened. |

### `multiplayer/` — multi-client coordination

| File | Purpose |
|------|---------|
| `gmGate.js` | `isCanonicalGM()` single-emitter pipeline gate (prevents duplicate move resolution across clients) — the lowest-id active GM that advertised a Claude key, else the lowest-id active GM. `advertiseClaudeKeyPresence()` records this GM's key presence in the world setting `keyedGmUserIds` (ids only, never the key). `hasKeyedActiveGM()` — true when any active GM is keyed; the basis of `RUN_ON.CLAUDE` command routing and `requestOracleNarration`. |
| `gmRelay.js` | Canonical-GM action relay — the one path for player-invoked world writes. `requestGmAction(kind, payload)` runs a `GM_ACTIONS` handler locally on the canonical GM, emits it over `GM_RELAY_SOCKET` (`gmRelay.`-prefixed kinds) elsewhere, and warns + returns `{ok:false, reason:"no-gm"}` when no GM is connected. `runGmAction` serialises every action through one promise queue on the canonical GM (released in a `finally`; a hung handler is waited on for at most `GM_ACTION_TIMEOUT_MS`), so handlers' campaignState read-modify-writes never interleave — except `xcard.activate`, which runs the moment it arrives. Handlers are `(payload, ctx)` with `ctx = { requesterId, requester, requesterIsGM, local }` — `requesterId` is client-asserted (the module socket does not identify the sender), so permission checks protect honest clients and handlers clamp payload values. `registerGmRelaySocket` (every client, `ready`), `announceGmRelayReady` / `onGmRelayReady` + `GM_RELAY_READY_KIND` (the canonical GM broadcasts once its listener is up; players re-send state — pull, not push), `hasActiveGM`, `GM_RELAY_KIND_PREFIX`, `_resetGmRelayForTests`. Older ad-hoc socket relays (`expedition.recommit`, `combat.enterFray`, `vow.setReward`, `vow.linkConnection`) still share the channel outside this table. `narrator.sidecar` carries the side-data of a narration run on a player's own key to the GM (issue #286 D2). |
| `commandRouting.js` | The chat-command run-on policy (extracted from `index.js`, issue #282): `RUN_ON` (`AUTHOR` / `CANONICAL_GM` / `CLAUDE`) and `dispatchChatCommand(message, routes)` — first matching route wins; the message counts as a command on every client, and the policy decides the one client that runs it (the canonical GM via `isCanonicalGM`, the author via `isAuthoringClient`, the keyed canonical GM else the author for `CLAUDE`); a `CANONICAL_GM` command with no GM connected warns its author. Held to the 95-class core coverage bar. |
| `speaker.js` | Resolves the speaking PC for a chat message (`resolveSpeakerActorId`): `message.speaker.actor` (token selection, PC-validated) → author's bound character → ownership scan → campaignState fallback. NPC cards and non-character actors are never speakers. `messageAuthorId` / `isAuthoringClient` — who typed a message, for `AUTHOR` command routing and the native progress-roll hook. |

### `narration/` — the narrative engine

| File | Purpose |
|------|---------|
| `narrator.js` | `narrateResolution`, `narratePacedInput`, `interrogateScene`, recap + vignette helpers, `resolveNarrationPerspective()`. **`buildNarratorExtras(mode, …)` is the single assembly point for every narrator call's system-prompt context** — extend it, not the call sites. `getRollingSessionSummary()` / `rollingSummaryThreshold()` maintain + read the rolling session summary (memory surface 5, architecture §8.6) — debounced Haiku regen from the full session card feed (`sessionNarratorCards`, shared with the ring), GM-gated + fail-open; `registerRollingSummaryRefreshHook()` runs it after a narrator card posts, and `finalizeSessionSummary()` catches it up before a session that went idle is closed. `buildNarratorExtras` also carries the previous session's summary (LAST SESSION) on every prose call and the cached campaign recap on a session's first narration (issue #286 C3). `buildPrivateChannelStory` gives the Private Channel the same shared story, and `registerPublishedReflectionHook` runs the tier pass for a published reflection (issue #286 D1). `schedulePacedTierUpdate()` feeds the entity generative tier from paced narration (the move path's counterpart), so a Named NPC's developments in free narration land on their card. `reconcileSuggestedMove(text, classifierMove)` / `extractMoveFromNarrationHint(text)` align the paced-narrative Roll button with the move the narrator named in its closing italic hint (finding J). `suppressPcDirectedSocialMove()` / `inputNamesOtherPlayerCharacter()` drop a Compel/relationship suggestion aimed at a fellow PC (finding G). X-Card: every narrator entry point checks the caller's campaignState **and** the live stored setting (internal `isXCardActive` — the move pipeline narrates from a snapshot taken before its confirm dialog and Claude calls); `narrateResolution` then posts a short "narration paused" notice (`narrationPaused` flag, not a narrator card) instead of narrating. `applyNarratorSidecar` applies the side-data only on the canonical GM — elsewhere it returns the clean prose and relays the side-data there (`applyRelayedNarratorSidecar`, issue #286 D2) — and persists only the sidecar's ledger fields via `persistCampaignStateFields`. `scheduleNarrationCapture` runs the detection / tier passes after oracle follow-ups, session vignettes and vow scenes (D4). |
| `narratorDebug.js` | What the narrator was last sent (issue #290 part 1). `recordNarratorRequest` / `recordNarratorResponse` (called by `callNarratorAPI`) and `recordNarratorFactBlock` (`applyNarratorSidecar`) keep this browser's last 10 requests in memory; `splitPromptSections` splits a prompt at its `---` rules and `## ` headings (also used by the Quench prompt-contract batch); `isNarratorCommand` / `handleNarratorCommand` back `!narrator debug` (GM only, `RUN_ON.AUTHOR`), which whispers the typist a card of the last narration's request with its fact block, Private Lines counted, not shown. The Private Channel is not captured. `_resetNarratorDebugForTests`. |
| `narratorPrompt.js` | Builds the narrator system prompt (tone/perspective/length + all context sections). Per-mode default creative-latitude class via `DEFAULT_PERMISSION_CLASS_BY_MODE`; `META_MODES` (recap) skip the sidecar/audio/permission blocks. The COMMAND VEHICLE line reads battered / cursed from the starship's native `system.debility` (canonical), the flag payload only when the native field is absent. |

### `oracles/` — oracle tables & rolling

| File | Purpose |
|------|---------|
| `roller.js` | Roll any oracle table; inject results. Backs `!oracle` (incl. `!oracle <tableId> [question]` — any built-in or custom table, id matched case-insensitively). `rollOracle` returns the `die` it rolled: built-in tables roll d100, custom tables (`CUSTOM_ORACLE_CATEGORY`) roll 1..their highest entry (`dieSizeForTable`). Also `ORACLE_TABLES`, `registerOracleTable` / `unregisterOracleTable` (built-in ids can never be overwritten or unregistered), `rollPaired`, `rollYesNo`. |
| `customOracles.js` | User-registered custom oracle tables (`!oracle-add`, Custom Oracles panel). `validateCustomOracleEntries` (entries must run contiguously from 1 — the message names the gap or overlap), `parseEntries`, `saveCustomOracle` (re-using a custom id overwrites it), `removeCustomOracle`, `postCustomOracleRoll` (card shows the die, carries `oracleMemory` flags). `campaignState.customOracles` is canonical; each client's `ORACLE_TABLES` custom entries are a mirror kept in sync by `syncCustomOraclesFromState` / `registerCustomOracleSyncHook` (installed by `rehydrateCustomOracles`). `_resetCustomOracleSyncHookForTests`. |
| `oracleFollowup.js` | The narrator follow-up after a raw oracle card (`!oracle yes`, `!oracle <tableId>`, `!pay-the-price`, the pipeline's Face Defeat Pay the Price card). `requestOracleNarration` runs it exactly once: a keyed GM is connected (`hasKeyedActiveGM`) → gmRelay `oracle.narrate` on the keyed canonical GM (`narrateOracleFollowupOnGm`), which applies the narrator side-data; else the author's own key (its side-data relayed to the canonical GM — `narrator.sidecar`, issue #286 D2); else skipped. |
| `tables/*.js` | Canonical Starforged oracle tables: `core`, `planets`, `space`, `themes`, `creatures`, `settlements`, `starships`, `factions`, `characters`, `derelicts`, `vaults`, `sufferAndCombat`, `discoveryAndChaos`, `payThePrice`, `sessionVignette`, `misc`. |

### `pacing/` — pre-classifier

| File | Purpose |
|------|---------|
| `classifier.js` | Haiku pre-classifier → `MOVE` / `NARRATIVE` / `NARRATIVE_WITH_MOVE_AVAILABLE`. |
| `router.js` | Routes paced input per the classifier decision. |
| `telemetry.js` | Pacing decision log journal (dial tuning). Also the "Consistency Check" page and, since issue #286 F6, the "Narrator Usage" page (`logNarratorUsage`): every narrator call's uncached input, cache reads, cache writes, output tokens and elapsed time, labelled with the narrator function, plus the cache-read share and median time. |

### `private-channel/` — the per-player private narrator conversation

| File | Purpose |
|------|---------|
| `index.js` | Settings (`privateChannel.enabled`, window position) and the gated `openPrivateChannel`. |
| `app.js` | `PrivateChannelApp` (ApplicationV2) — the window, send and publish actions. |
| `context.js` | `buildPrivateContext` — the Haiku prompt: a cached prefix (safety with the player's own Private Lines, role, campaign truths, world truths + campaign premise, character) and a per-turn message (location + recent narration, the shared story, the transcript, the message). Since issue #286 D1 the shared story (`buildPrivateChannelStory`): last and this session's summaries, the matched / frame-cast entity cards and the scene ledger. |
| `narrate.js` | `requestPrivateNarration` — one turn on the player's key, via `api-proxy.js`. |
| `publish.js` | `publishToMainChat` — posts the latest narrator turn to main chat. Since issue #286 D1 the card carries the narrator flag family, so a published reflection is canon. |
| `transcript.js` | Per-player transcript journal, one page per session; debounced writes. |

### `safety/` — session-move dialogs

| File | Purpose |
|------|---------|
| `sessionDialogs.js` | Set a Flag / Change Your Fate / Take a Break dialogs (on the invoking client). World writes relay to the canonical GM: `applySafetyFlag` (gmRelay `safety.setFlag` → `campaignState.safetyFlags`) and `applyTakeBreak` (`session.takeBreak` → the single-use `campaignState.nextMoveAdd`, consumed by `moves/nextMoveAdd.js`). Cards say when the write could not be recorded (no GM). |
| `sessionLifecycleDialogs.js` | Begin/End Session dialogs (on the invoking client). Begin surfaces last session's quest / connection focus. The world writes run in the canonical-GM relay handlers `applyBeginSession` (`session.begin`: `sessionActive` on + clear the foci, Spotlight momentum, campaign clocks, galley vignette — once per session, stamped `sessionStartedId`; one Begin at a time, issue #300 F11) and `applyEndSession` (`session.end`: save the foci, `sessionActive` off, scene close, rolling-summary finalise, Session Log, +1 momentum, closing vignette — it writes only its own fields onto the latest store, `mergeOwnedFields`, because it holds its snapshot across the summary's Claude call). |

### `sectors/` — sector creator

| File | Purpose |
|------|---------|
| `sectorGenerator.js` | 11-step sector generation (rulebook pp. 114–127). `storeSector` writes the sector record, `activeSectorId` and the sector's entity ids (unioned) onto the latest stored campaignState — sector creation holds its copy for minutes (issue #300 F14). |
| `sectorPanel.js` | Sector Creator ApplicationV2 wizard. |
| `sectorArt.js` | Per-region background art generation. |
| `sceneBuilder.js` | Foundry Scene creation (Note pins + Drawing passages). |
| `sectorMap.js` | SVG sector map renderer. |
| `sectorOverview.js` | Sector-record JournalEntry overview. |
| `sectorSceneHooks.js` | Click handlers for sector-scene Note pins; command-vehicle Token drag → set_a_course; `syncCommandVehicleTokenToPosition` (position→token sync — Cluster C); token→position authority (v1.7.10 F5): `handleCommandVehicleTokenPlacement` / `handleCommandVehicleTokenReposition` / `computeTokenPositionRecord` write the §20 record from token coords, `POSITION_SYNC_OPTION` marks programmatic moves. |

### `session/` — session lifecycle & vignettes

| File | Purpose |
|------|---------|
| `lifecycle.js` | Session-active gate state machine: `isSessionActive`, `beginSession`, `endSession`, `sessionMinutesActive`. Session boundaries (issue #286 C3, C4): `sessionNeedsMint` (End a Session marked it, or `SESSION_IDLE_HOURS` without a chat message), `rollSessionIfDue` (world load + Begin a Session: catch the summary up, close the scene, then `mintSession`, which keeps the summary as `previousSessionSummary`; the caller persists `SESSION_MINT_FIELDS`), `registerSessionActivityHook` / `touchSessionActivity` (the canonical GM refreshes `lastSessionTimestamp` on chat activity, at most every 10 minutes). |
| `galleyVignette.js` | Begin-Session opening galley vignette. `collectGalleyParticipants()` enumerates the PC roster (`getPlayerActors`) and splits present/absent by `User.active` — every PC appears even if unassigned to a connected user (finding B). |
| `endSessionVignette.js` | End-Session closing NPC vignette. |
| `incitingIncident.js` | Envision an Inciting Incident (rulebook "Begin your adventure" §1): rolls the Action+Theme spark, routes it through the narrator (`inciting_incident` mode) for a grounded opening event + structured proposal (suggested vow / optional clock / vow target — parsers `splitIncitingMeta` et al.), posts the launch card with `incitingMeta` flags + ⚔ Swear button. Oracle-only fallback with no key. Backs the Session-panel ✦ button and `!incite` (routed `RUN_ON.CLAUDE`; on a player's client the GM-only premise persist and detection/tier/lore writes are skipped with a debug line). |
| `quickstart.js` | ✦ Playtest Quickstart: one-click fresh world (truths + sector + PC with 2 Paths + command vehicle with 2 Modules); pure helpers (`assignStatArray`, name rollers); `ensureQuickstartMacro` hotbar Macro; exposed on `module.api`. |
| `swearVow.js` | ⚔ Swear this vow (Cluster B — F2/F3/F4): pure planner `buildSwearVowPlan` + executor `executeSwearVow` (vow item with optional clock via `createCharacterVowItem`; vow-target connection via the make_a_connection pipeline; GM/world-write asymmetry) + `registerSwearVowHandler` chat-card wiring. |

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
| `settingsPanel.js` | Companion Settings panel (tone/model/keys + ~40 world/client settings). Hosts `syncSafetyToCampaignState()` (a GM writes the global Lines/Veils and its own Private Lines; a player relays theirs via gmRelay `safety.syncPrivateLines` → `applyPrivateLinesSync`, keyed on the relay requester, and re-sends when the canonical GM announces its relay is ready — `onGmRelayReady`). `registerSettingsHooks()` also installs the X-Card `chatMessage` hook (typed `!x` → `playXCard`, `!x clear` → GM resume — cancelled before the message is created) and the card binder; a programmatic `!x` that reaches `createChatMessage` is routed by `index.js` (`isXCardCommand`, canonical GM). The five unread settings `activeCharacterId`, `chronicleContextCount`, `characterContextEnabled`, `worldJournalEnabled`, `worldJournalAutoDetect` and `getSafetyConfig` were deleted in the 2026-10 audit. |
| `entityPanel.js` | Entity panel (generative tiers, links, current-location card). A ship's Battered / Cursed fields show the starship sheet's native `system.debility` values (canonical) over the flag record's mirror. |
| `progressTracks.js` | Progress-track panel (vows/expeditions/combats/connections/legacy). `listOpenProgressTracks` (read-only — never creates the journal) gives the narrator's [4j] OPEN PROGRESS TRACKS block the open fights, expeditions and scene challenges, whole (issue #290, TRACKS-UNPORTED). |
| `sessionPanel.js` | Session moves panel — Begin/End/Flag/Fate/Break (v1.6.0). |
| `companionToolbar.js` | Floating, draggable launcher (frameless `ApplicationV2`) for all Companion panels. Replaces the scene-controls group (v1.7.5); scene-independent so it works with no map open. Always kept inside the viewport; in the compact layout it folds behind one launcher (tap for a labelled tool list, drag to move) and re-renders on a layout change (#293). Exports `openCompanionToolbar()` / `registerCompanionToolbarSettings()`. |
| `companionToolbarTools.js` | Pure, import-free visibility/data for the launcher (`companionToolbarTools({isGM, privateChannelEnabled})`) and `clampToViewport(box, viewport)`; unit-tested in isolation. |
| `layoutMode.js` | Adaptive layout for phones and touch screens (#293). `decideLayout()` (pure: compact from a viewport under 600 × 480 px or a touch screen under 600 px; touch from a coarse pointer), `applyLayout()` sets `sf-compact` / `sf-touch` on `<body>`, `onLayoutChange()` for floating UI, the client-scoped `layoutMode` setting (Automatic / Phone / Desktop) via `registerLayoutSettings()`, and `initLayoutMode()` (resize / pointer-change re-checks). Module windows carry the `sf-window` class the compact CSS keys on. |

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
| `tests/helpers/multiClient.js` | Multi-client table simulation (issue #282): `simulateTable({ users })` boots `src/index.js` once per client (each with its own `game` / `Hooks` / `ui` and module copies) over a shared world — settings, chat messages, actors, socket bus. Chat-message hooks and setting `onChange` fire on every client, the socket reaches every other client, Claude calls are answered and recorded per client (`table.claude`), dialogs record which client opened them, and `table.settle()` waits until the table is quiet. Used by the routing matrix, relay, concurrency and composition suites. |
| `tests/helpers/foundryPermissions.js` | Foundry's permission rules for the stubs: world-scoped `game.settings.set` rejects for non-GMs, `ChatMessage#update` / `#delete` for non-authors (GMs exempt), `Actor#update` / `#setFlag` without OWNER. On by default; `withoutPermissionChecks(fn)` for fixture seeding. |
| `tests/helpers/settingScopes.js` | Static scan of `src/` for `settings.register` scopes, so a setting the stubs never saw registered is still checked with its real scope. |
| `tests/helpers/documentStubs.js` | ChatMessage document stubs (ids, dotted-key `update`, flags, `author`) shared by `tests/setup.js` and the harness. |
| `tests/helpers/sourceScan.js` | The lexer behind the static invariant tests (issue #282 item 5): production sources (src/ minus Quench) with comments and literals masked, bracket matching, `Hooks.on` registrations, function-body lookup. Used by `campaignStateFields.test.js` (every campaignState field has a writer and a reader) and `hookGates.test.js` (every document-hook handler has an author / canonical-GM gate, or is listed as local-only). |
| `tests/helpers/cardDom.js` | Minimal DOM (HTML parser, selectors, events) the harness renders chat cards with, so a test can click a card's button on a given client. |
| `test/ci/` | CI-only harness assets. |
| `test/ci/playwright/` | Second-client E2E suites, run after the Cypress Quench run against the world it left live, in `mcr.microsoft.com/playwright:v1.56.1-noble` (`playwright` pinned to the same version in `package.json`). `multiplayer.mjs` (issue #282 item 6) drives a GM and a player browser — the X-Card, `!oracle` posting one card, a player's Begin a Session, Burn Momentum applying once, Private Lines reaching the GM. `playthrough.mjs` (issue #290 part 2) plays the scenarios in `playthroughs/*.json` (seed, pinned settings, steps, checks) through the GM's real narrator pipeline, with scripted dice; Claude is answered from `recordings/<scenario>.json` (`--record-playthroughs` records them with a key). `lib/claude.mjs` — the fetch bridge, call kinds from the caller's stack, recording match, stub, STALE / UNRECORDED reports; `lib/foundry.mjs` — the client helpers both suites share. |
| `styles/starforged-companion.css` | Bundled stylesheet. |
| `lang/en.json` | Localisation strings. |
| `packs/help/` | LevelDB pack dir (legacy; help is created programmatically — see PACKS-001). |
| `scripts/build-help-site.mjs` | Renders the help pages to a static HTML site. |
| `scripts/deadscan.mjs` | Mechanical reachability scan (`node scripts/deadscan.mjs`, `--strict` exits non-zero on DEAD exports/settings): flags zero-consumer exports, registered-but-unread settings (incl. keys registered through a constant — a `SETTING.KEY` / bare `KEY` reference counts only in the defining file or a file that imports that constant), QUENCH-ONLY exports/settings (`src/integration/` is test code, not a production consumer), TEST-ONLY exports, TEST-SEAM names, and UNREACHABLE modules (no import path from a `module.json` entry point). Comments are stripped before counting, so a comment mention is not a consumer. `scan` / `stripComments` are exported for `tests/unit/deadscan.test.js` (and `stripComments` for `tests/helpers/sourceScan.js`). CI runs it with `--strict` after lint. The detection half of `rules/reachability.md`. |
| `vendor/foundry-ironsworn/` | Pinned system submodule (read-only reference; never edit without instruction). |

---

## `docs/` — developer documentation

Organised into feature-theme subfolders. The four **hub docs stay at the root**
because they are read every session and linked from `README.md` and `CLAUDE.md`.

### Root (hubs — read first every session)

| File | Purpose |
|------|---------|
| [`scope-index.md`](scope-index.md) | **Start here** — status of every feature scope and the map from each scope to its **GitHub issue** (scopes live as issues, not files) + dependency graph + next steps. |
| [`decisions.md`](decisions.md) | Architecture decisions and rationale; read before changing a constrained pattern. |
| [`known-issues.md`](known-issues.md) | Open bugs, accepted workarounds, and resolved-issue history. |
| [`file-structure.md`](file-structure.md) | This file. |

> **Feature scopes are GitHub issues, not files.** The per-feature `*-scope.md`
> documents were migrated verbatim into issues #203–#228 and removed on
> 2026-06-24. Use `scope-index.md` to find a scope's issue. The folders below
> hold the remaining design and reference docs.

### `narrator/` — narration design notes

`narrator-memory-architecture.md` (full narrator-memory architecture + tuning
guide; paired with `rules/narrator-memory.md`),
`narrator-suggestion-loop-investigation.md`,
`narrator-suggestion-loop-group-c-design-memo.md`.

### `entities/`

`implementation-ordering.md` (entity-discovery + World Journal phasing notes).

### `moves/`

`suffer-routing-audit.md` (per-move suffer-routing audit — the Suffer-move
Pipeline Phase A deliverable, issue #214).

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

`quench-coverage-audit-plan.md`, `behaviour-coverage-audit.md`,
`behaviour-coverage-audit-plan.md`, and the `vX.Y.Z-playtest-findings.md` logs.

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
