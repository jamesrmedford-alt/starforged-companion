# Changelog

All notable changes to Starforged Companion are documented here.

---

## [Unreleased]

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
