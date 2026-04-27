# Starforged Companion — Architecture Decisions

Key decisions made during development. Read this before making changes to understand
why things are the way they are. Each decision includes the reason and what was
rejected.

---

## Testing framework: Vitest (not Jest)

**Decision:** Replace Jest with Vitest.

**Reason:** Jest requires CommonJS-compatible transforms for ESM modules. The module
uses native ES modules throughout (`type: "module"` in package.json). Vitest handles
ESM natively without babel or transform configuration.

**What changed:** `jest.config.js` deleted, `vitest.config.js` added, `tests/setup.js`
rewritten with `global.*` assignments (no Jest globals shim), all test files updated
to import `describe, it, expect, vi` from `vitest` explicitly. `globals: true` in
vitest config makes Jest-style implicit globals available for older test files.

---

## Foundry version: v13 target (not v12)

**Decision:** Write for Foundry v13 with v12 backward compat where trivial.

**What this affects:**

- **ApplicationV2** — all UI panels use `foundry.applications.api.ApplicationV2`.
  v1 Application is deprecated in v13, removed in v16.
- **jQuery removed** — Foundry v13 no longer provides jQuery globally. All DOM
  manipulation uses the standard DOM API (`querySelector`, `createElement`, etc.).
- **`getSceneControlButtons` hook** — in v12, `controls` is an Array. In v13 it is
  an Object keyed by group name. Handler uses `Array.isArray(controls)` check.
- **`ChatMessage.type`** — v13 removed `"other"` as a valid type. Use no type field
  (defaults to `"base"`) or string literals `"ooc"`, `"roll"`, `"whisper"`.
- **`message.author`** — the correct property in both v12 and v13. `message.user`
  was the old name; accessing it in v13 logs a deprecation warning.
- **`CONST.CHAT_MESSAGE_TYPES`** — restructured in v13. All type checks use string
  literals instead.

---

## CORS proxy: local Node.js proxy + Forge server-side proxy

**Decision:** All external API calls route through `src/api-proxy.js` which detects
the environment and picks the right proxy path.

**Reason:** Foundry's Electron renderer enforces browser CORS. Module JS runs only
in the renderer — not in Node.js. Direct calls to `api.anthropic.com` or
`api.openai.com` are blocked by CORS. Context isolation is enabled (`process`
undefined, `require` undefined), so Electron's Node APIs are not available.

**Desktop path:** Local Node.js proxy at `proxy/claude-proxy.mjs`. Start with
`npm run proxy` or `./proxy/start.sh` before each session. Listens on
`127.0.0.1:3001`. Routes `/v1/*` to Anthropic, `/openai/v1/*` to OpenAI.

**Forge path:** `ForgeAPI.call("proxy", ...)` makes server-side requests from
The Forge's Node.js process. No local proxy needed. Detected via
`typeof ForgeVTT !== "undefined" && ForgeVTT.usingTheForge`.

**Rejected:** Foundry socket relay (player → GM client → API). Unreliable in
single-browser sessions where accounts share a socket connection. Also adds
account-dependency (GM must be connected) which breaks headless/automated use.

---

## Narration: direct Claude API (not Loremaster)

**Decision:** Remove Loremaster dependency. Implement narration directly via Claude.

**Reason:** Loremaster only responds to messages sent by the GM account. Player
clients cannot trigger narration without a socket relay, which is unreliable in
single-browser sessions and adds account-dependency for multiplayer. Additionally:
no control over narrative style, voice, or prompt; Loremaster uses v1 Application
framework (deprecated in v13); dependency on Patreon-gated external service.

**What replaced it:** `src/narration/narrator.js` + `src/narration/narratorPrompt.js`.
Direct Claude API call via `api-proxy.js`. Configurable model (Haiku/Sonnet),
perspective, tone, length, and custom instructions per campaign. Narration runs
on whichever client triggered the move — no GM dependency.

**Files removed:** `src/loremaster.js`. Loremaster settings removed from
`settingsPanel.js`. Socket relay removed from `index.js`.

---

## Mischief dial naming: `normalizeDial()` bridge

**Decision:** `settingsPanel.js` stores `"lawful"/"balanced"/"chaotic"`.
`mischief.js` uses `"serious"/"balanced"/"chaotic"` internally. `normalizeDial()`
maps `"lawful"` → `"serious"` at all three consumption points.

**Reason:** The two files were written independently with different assumptions about
the dial value names. Rather than changing one file's naming convention (which would
require touching all tests and UI labels), a bridge function was added.

**Where it lives:** Top of `src/moves/mischief.js`. Called at the start of
`buildMischiefFraming()`, `shouldApplyMischief()`, and `buildMischiefAside()`.

---

## Safety config storage: sync bridge

**Decision:** `settingsPanel.js` writes Lines/Veils to `game.settings`. The assembler
reads from `campaignState.safety`. `syncSafetyToCampaignState()` bridges them.

**Reason:** The two systems were written independently. `game.settings` is the natural
storage for UI-managed configuration. `campaignState` is the natural source of truth
for the context assembler. Rather than refactor one to use the other's storage,
a sync function runs on every write and on the `ready` hook.

**Private Lines:** Stored client-scoped in `game.settings`. In `campaignState.safety.
privateLines`, they are stored as `[{ playerId, lines }]` objects so each player's
Lines are preserved when any one player's client syncs.

---

## Progress tracks: single dedicated journal

**Decision:** All progress tracks stored in ONE JournalEntry named "Starforged
Progress Tracks", under `page.flags["starforged-companion"].tracks` as an array.

**Reason:** Initially designed with per-track journal entries. Changed because
individual journal entries created UI clutter and made bulk operations (list all
tracks, find by ID) require scanning the entire journal collection. Single journal
with a flag array is simpler, faster, and matches how the assembler needs to consume
the data.

**Impact:** `assembler.js` calls `game.journal.getName("Starforged Progress Tracks")`
directly. `campaignState.progressTrackIds` is unused for this purpose.

---

## Portrait generation: generate once, one regeneration, then locked

**Decision:** Portraits follow a three-state lifecycle: none → unlocked → locked.
One regeneration is permitted. After that the portrait is permanently locked.

**Reason:** Art generation is expensive and the campaign wants visual consistency.
Locking after regeneration prevents iterating endlessly on a portrait and ensures
entities have a stable visual identity across sessions.

**State stored on:** `ArtAsset.regenerationUsed` (boolean) and `ArtAsset.locked`
(boolean). The superseded asset gets `ArtAsset.superseded = true` and is retained
for the session log.

---

## `foundry-shim.js`: deleted

**Decision:** `src/foundry-shim.js` was deleted. Entity files had their import
statements removed via `scripts/remove-shim-imports.js`.

**Reason:** The shim was created to make Foundry globals available in Jest tests.
Switching to Vitest with `tests/setup.js` providing stubs via `global.*` assignments
made the shim unnecessary. The shim also caused 404 errors in the Foundry renderer
when module files tried to import it at runtime.

---

## CI release: update `module.json` before building zip

**Decision:** The CI release job updates `module.json` (version, download URL,
manifest URL) BEFORE building the zip.

**Reason:** The zip was originally built first, then `module.json` was updated as a
separate step. This meant the zip contained an old `module.json` with empty download
and manifest URLs. Foundry reads the manifest from inside the installed zip to check
for updates — an empty manifest URL means Foundry can never find an update. Swapping
the order fixed both the update detection and the version display.

---

## Claude API model selection

**Interpretation (move identification):** `claude-haiku-4-5-20251001` — fast, cheap,
structured JSON output. System prompt cached with `cache_control: ephemeral`.
Prompt caching makes interpretation nearly free per call.

**Narration:** `claude-sonnet-4-5-20251001` default, `claude-haiku-4-5-20251001`
available. Sonnet produces noticeably richer prose. System prompt cached. Cost per
session at Sonnet: ~$0.05. Configurable per campaign in module settings.

**Why not Opus:** Overkill for both tasks. Haiku handles structured output well.
Sonnet handles atmospheric prose well. Opus is for complex reasoning tasks neither
of these require.
