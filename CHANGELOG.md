# Changelog

All notable changes to Starforged Companion are documented here.

---

## [Unreleased]

- Fixed: Move confirmation dialog accept button now reliably resolves with `true` even after a previous dialog has been opened in the same world session. The dialog used a singleton element id, which let `ApplicationV2` reuse a prior closed instance whose internal `#decided` flag was already set; the next click on Accept then short-circuited and the prompt promise hung. Each prompt now creates an instance with a unique id so the resolution gate starts fresh.
- Fixed: `!journal lore "title" confirmed — text` written through the chat path now reliably commits before the confirmation card returns. The createChatMessage hook now exposes its in-flight `!journal` work via `getLastJournalCommandPromise()` so callers (and integration tests) can await the full `JournalEntry.create → createEmbeddedDocuments → setFlag` chain instead of racing two `setTimeout(0)` ticks against a cold journal.
- Fixed: Removing a progress track from the Progress Tracks panel now actually persists. The remove handler — and every other `ProgressTrackApp` action handler — now records its in-flight promise on `this._lastAction` (the same convention used by the chronicle panel), so integration tests that dispatch a real DOM click can wait for the full async chain (load → confirm → filter → setFlag) to settle before re-reading the journal. The previous handlers ran fire-and-forget, causing the deletion to race with subsequent reads.
- Fixed: `@scene` queries now always post a chat card. Previously the function returned `null` silently when scene queries were disabled, the X-Card was active, no API key was configured, the API call threw, or the API returned an empty response — leaving the user with no feedback. A new fallback card now explains the reason in chat for each of those paths, matching the pattern already used for narration on a move resolution.
- Fixed: Quench Safety Extras `!x via chat hook — full path` test no longer fails its precondition due to leaked `xCardActive=true` from earlier batches. The Chat Command Routing `!x` test's `finally` block previously called `game.settings.set("campaignState", stateBefore)` after `clearXCard()`; because Foundry returns `campaignState` by reference, `stateBefore` could itself carry a dirty `xCardActive=true` and the restore would undo `clearXCard()`. The redundant restore is removed. The Assembler X-Card test now wraps `suppressScene`/`assembleContextPacket` in `try/finally` so `clearXCard()` runs even if assembly throws. The Safety Extras `!x` test now defensively clears the X-Card flag in a `before` hook and a per-test `finally`.
- Fixed: Quench Sector Creator `createSectorScene` notes/drawings count assertions updated to match current production behaviour. The drawings test now expects one drawing per `mapData.passages` entry (the previous hardcoded `1` predates FIX 2 in `sceneBuilder.js` which began rendering `toEdge:true` passages). The notes test now computes the expected count from each settlement's `planet`/`stellar` presence (the previous hardcoded `2` predates FIX 3/FIX 4 in `sceneBuilder.js` which added planet and stellar marker notes). The test sector is now created in a `before` hook so subsequent assertions can read it.
- Fixed: Quench `chronicle` batch togglePin test no longer skips when the prior addAnnotation test fails. The `before` hook now seeds a chronicle entry directly via `addChronicleEntry` and pushes its id into `seededIds`, so togglePin's precondition is satisfied independently of the addAnnotation DOM-click test outcome.
- Fixed: Quench integration tests no longer leak journal entries into the live world. The `entityWorldJournal` batch's `beforeEach` created a `"The Covenant"` faction journal that was unprefixed and untracked, leaking five entries per run; the seed faction is now prefixed `"QUENCH TEST — The Covenant"`, the new entry is registered with the cleanup tracker, and cleanup runs `afterEach` so per-test entries are removed before the next iteration recreates them. The chronicle batch's `after` hook now also deletes the per-actor `Chronicle — …` JournalEntry created by the addAnnotation test before deleting the test actor.
- Fixed: `!x` (X-Card) now flips `xCardActive` reliably regardless of how the chat message is created. The previous handler ran only on the typed-input `chatMessage` hook; messages created programmatically (or relayed in ways that bypass the typed input) reached `createChatMessage` without ever activating the X-Card. The `createChatMessage` hook now also recognises `!x` and calls `suppressScene()` so the flag flips on the GM client whichever path delivered the command.
- Fixed: Move confirmation dialog accept button no longer races with the dialog's close path. Resolution is now gated by a single `#decided` flag so that an explicit accept cannot be overridden by a default reject from `close()`.
- Fixed: In-game Help & Reference journal now shows correct `!` command prefixes (`!x`, `!recap`, `!journal`) — content was showing stale `/` prefixes from before the v13 command-prefix change
- Fixed: `ensureHelpJournal` now detects content version changes and updates existing journals automatically — existing worlds receive corrected content on next world reload, no manual steps required
- Removed: `packs/help.json` deleted — was a dead file with no module.json declaration and no build pipeline; `src/help/helpJournal.js` is the sole source of help content

- Added: Quench integration test coverage extended to chat command routing, move pipeline confirmation/persistence, mischief dial, progress track and entity panel actions, character chronicle, settings panel, world truths, sector commands, encounter spawn, session lifecycle, safety extras, toolbar registration, and clarification edge cases. Adds 14 new batches alongside the existing 10, exercising user-facing surfaces previously untested in a live Foundry world.
- Changed: World Journal panel reduced to a compact action surface (~320×400). Tabs removed; the panel now shows only Pending Lore (Confirm/Dismiss), Contradictions (Review/Override/Dismiss when flagged), Active Threats (severity dropdown), and a footer of links that open the Lore, Threats, Factions, and Session Log JournalEntries in Foundry's native viewer for reading.
- Added: System asset integration — the companion now reuses foundry-ironsworn art, compendium content, and localisation. Centralised path constants in `src/system/ironswornAssets.js` (planet, stellar, starship, location, asset, oracle, stat icons); deterministic starship token picker; location-background resolver with three art sets (Kirin/Rains/Root) and a new `locationArtSource` world setting.
- Added: Localisation wrapper (`src/system/i18n.js`) maps internal stat/meter/debility/move slugs to `IRONSWORN.*` keys, with English fallbacks for missing translations.
- Added: Canonical compendium lookup (`src/system/ironswornPacks.js`) — null-safe helpers for moves, oracles, encounter actors, and setting truths, with per-session document caching.
- Added: Move interpreter optionally injects the canonical move description from `starforged-moves` as a `<canonical_move>` block when an `expectedMoveSlug` is supplied.
- Added: `!sfc encounter <name>` chat command spawns canonical encounters from `foe-actors-sf` — drops a token on the active scene for GMs, posts a stat-summary chat card otherwise.
- Added: Narrator system prompt now includes a `<campaign_truths>` digest built from the foundry-ironsworn `starforged-truths` pack when `campaignState.canonicalTruthSlugs` is configured.
- Fixed: Silent-failure audit — production code paths that previously swallowed errors with empty `try/catch` now log via `console.error`/`console.warn` or rethrow. Settings-write functions across `sectors`, `entities/*`, `art/storage`, and `truths` now propagate persistence failures instead of no-opping. Actor-bridge reads (`getPlayerActors`, `getActor`) no longer mask Foundry errors with empty defaults that previously matched empty test fixtures by accident.
- Added: Test-suite console-error guard — `tests/setup.js` now spies on `console.error`/`console.warn` and fails any test that emits an unexpected error log. Tests that exercise legitimate error-handling paths can opt in via the new `expectConsoleError(/pattern/)` and `silenceConsoleErrors()` helpers.
- Added: ESLint rule banning empty catch blocks across the module (`no-empty` with `allowEmptyCatch: false`, plus a `no-restricted-syntax` rule that catches comment-only catch bodies).
- Fixed: `tests/unit ` directory renamed to `tests/unit` (trailing space removed) — caused permission-prompt friction during automated tooling.
- Fixed: Sector scene passage lines now actually render between settlements — v13 `BaseDrawing` joint validation rejects polygon shapes whose `shape.width`/`shape.height` are zero, so passage drawings were silently failing despite valid stroke properties; `makePassageLine` now sets non-zero bounding box dimensions and the previous error-suppressing try/catch has been removed so future regressions surface immediately
- Added: Sector-created settlements and connections are now flagged `canonicalLocked` so future narrator-driven entity discovery will not overwrite them
- Fixed: Sector creator now mirrors each settlement's narrator stub onto the settlement entity record's description, keeping the canonical entity in sync with the sector journal page
- Added: DALL-E 3 sector background art — each sector gets a generated 1792×1024 landscape image matching its region (Terminus, Outlands, Expanse, Void), with visual modifiers for notable troubles (energy storms, supernova, spatial rifts)
- Added: Foundry Scene created on sector finalization — background image, Journal Note pins per settlement, Drawing lines for passages; scene is created but not auto-activated
- Added: Narrator journal stubs — atmospheric one-paragraph descriptions for sector and each settlement generated via Claude Haiku, stored as annotatable journal pages in a sector record JournalEntry
- Added: `sectorArtEnabled` and `sectorNarratorStubsEnabled` world settings to control optional generation steps
- Fixed: Quench narrator integration tests now pass `campaignState` in the correct argument position so the `sessionId` flag on narrator chat cards is verified against a real session ID
- Changed: Claude API Key and Art Generation API Key are no longer shown in the standard Configure Settings dialog. They are now configured in Companion Settings → About tab and are only visible to the GM.
- Fixed: All module commands changed to `!` prefix (`!x`, `!recap`) — Foundry v13 rejects unrecognised `/command` patterns before `createChatMessage` fires
- Fixed: Confirmation dialogs now use `DialogV2` instead of the deprecated `Dialog` (entityPanel, progressTracks)
- Fixed: Chronicle panel rebuilt to correct ApplicationV2 patterns — window title, position, `DEFAULT_OPTIONS`, HTMLElement rendering, and `render({ force: true })` calls
- Fixed: Momentum recalculation now fires correctly when another client applies a debility change (`system.debility` path corrected in `updateActor` hook)
- Fixed: Suffer-move auto-debility logic now reads correct ironsworn schema paths (`system.health`, `system.spirit`, `system.supply`, `system.debility`)
- Fixed: Safety sync no longer attempts a world-scoped settings write from non-GM clients (silently failed before; now correctly skipped)
- Fixed: Removed dead `getApiUrl()` function from move interpreter; API routing already used the canonical Anthropic URL via `api-proxy.js`

## [0.6.0] — Previously On

- Added: `/recap session` posts a session recap card summarising all narrated moves in the current session — no API call required
- Added: `/recap` or `/recap campaign` generates a 3–5 paragraph campaign arc summary via Claude and posts it as a styled chat card
- Added: Campaign recap is cached; regenerates only when new chronicle entries are added
- Added: Campaign recap is automatically posted to chat when a new session begins (configurable; enabled by default)
- Added: Campaign recap text is injected into the narrator's context on the first narration of each session
- Added: Three new settings in Companion Settings: Auto Recap at Session Start, Session Gap Threshold, and Recap GM-Only

## [0.5.0] — Scene Interrogation

- Added: `@scene` prefix routes free-form questions to the narrator without triggering a move or rolling dice
- Added: Scene card posts to chat with the player's question visible and narrator response below, styled distinctly from move narration cards
- Added: Scene queries are suppressed when the X-Card is active
- Added: Recent narration cards from the current session are included as context so the narrator stays grounded in the immediate scene
- Added: Three new settings in Companion Settings: Scene Interrogation Enabled, Scene Response Length (sentences), Scene Context Cards (context window)

## [0.4.0] — Foundations

- Added: Session ID management — each world load generates or restores a session ID (resumes if last session was < 4 hours ago)
- Added: Session number increments automatically on each new session
- Added: `lastSessionTimestamp` recorded on world close for session boundary detection
- Added: Narrator cards now carry `sessionId`, `sessionNumber`, `moveId`, `outcome`, `narrationText`, and `timestamp` flags for use by upcoming recap and scene interrogation features
- Added: About tab in Companion Settings shows current session number, session ID (truncated), and session start time

## [0.3.0] — Character Management

- Added: Character management — move resolutions now automatically update health, spirit, momentum, debilities, and XP on the foundry-ironsworn character sheet
- Added: Character Chronicle — reverse-chronological story record with player annotations; accessible via the 📖 toolbar button
- Added: Starship damage tracking — Battered and Cursed impacts applied to the starship Actor automatically
- Added: Momentum burn handled automatically when action die matches current momentum

## [0.2.0] — Narrator

- Added: Direct Claude narration replacing Loremaster — works from any player account, no GM dependency
- Added: Narrator tab in Companion Settings — configure model (Haiku/Sonnet), perspective, tone, length, and custom instructions
- Added: Auto perspective — second person for solo campaigns, third person for multiplayer
- Added: Default tone: wry (knowing, slightly sardonic)
- Added: Prompt caching for narration system prompt — significantly reduces per-session cost
- Fixed: ChatMessage type "other" removed (not valid in Foundry v13)
- Fixed: message.author deprecation warning in v13
- Fixed: Meter persistence now correctly gated to GM account

## [0.1.x] — Deployment hardening

- Fixed: CORS — local Node.js proxy added; The Forge server-side proxy supported
- Fixed: Foundry v13 compatibility (ApplicationV2, DOM API, string literal message types)
- Fixed: World truths, progress tracks, and X-Card suppression now working correctly
- Fixed: Safety configuration now correctly reaches the narrator context packet
- Fixed: Mischief dial "lawful" value now recognised correctly
- Fixed: CI release — module.json version and URLs updated before zip build

## [0.1.0] — Initial release

- Move interpretation via Claude Haiku with prompt caching
- Move confirmation dialog, dice resolution, mischief dial
- Safety system: Lines, Veils, Private Lines, X-Card
- Progress tracks panel (vows, expeditions, connections, combat, scene challenges)
- Entity management with AI portrait generation (DALL-E 3)
- World Truths oracle tables (all 14 Starforged categories)
- Oracle integration
