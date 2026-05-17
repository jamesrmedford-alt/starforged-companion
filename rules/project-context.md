# Project context

**What this is:** A Foundry VTT companion module for Ironsworn: Starforged
supporting solo and multiplayer campaigns. Handles move interpretation via
Claude API, dice resolution, narrator (Claude Sonnet), oracle integration,
progress tracking, entity management, art generation, and safety configuration.

**Target:** Foundry v13 (v12 minimum). ES modules throughout. Vitest for
unit tests. Quench for integration tests (require live Foundry).

**Transport:** No proxy. Claude calls go directly from the browser using
Anthropic's `anthropic-dangerous-direct-browser-access: true` opt-in (see
`src/api-proxy.js`). Image generation goes directly to OpenRouter, which
supports browser CORS natively (see `src/art/openRouterImage.js`). The same
code runs on Foundry desktop and on The Forge — no setup difference, no
local Node process required.

**System dependency:** foundry-ironsworn v1.27.0. Actor schema confirmed:
stats flat on `system` (not nested), meters at `system.health.value` etc,
debilities at `system.debility` (singular), xp flat at `system.xp`.
See `vendor/foundry-ironsworn/` for authoritative source.

**Current work in progress:** See `docs/known-issues.md` for open items.
Check `docs/` for scope documents before starting any feature work.
