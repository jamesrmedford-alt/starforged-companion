# Changelog

All notable changes to Starforged Companion are documented here.

---

## [Unreleased]

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
