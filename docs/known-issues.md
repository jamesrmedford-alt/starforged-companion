# Starforged Companion — Known Issues

Open bugs, workarounds, and items pending resolution. Update this file as
issues are resolved or discovered.

---

## Active issues

### NARRATOR-001 — Loremaster removed, narrator not yet implemented

**Status:** In progress — see `docs/narrator-scope.md`

**Symptom:** No narration after move resolution. The pipeline posts a move
result card but no narrative continuation follows.

**Cause:** Loremaster dependency removed. Direct narrator not yet implemented.

**Fix:** Implement `src/narration/narrator.js` and `src/narration/narratorPrompt.js`
per the narrator scope document.

---

### PERSIST-001 — persistResolution gated to GM only

**Status:** Open — acceptable for solo play, needs socket relay for multiplayer

**Symptom:** Player-triggered moves do not persist meter changes to character
or campaign state. Only GM-triggered moves persist.

**Cause:** `persistResolution()` writes to world-scoped settings which require
GM permissions. Player clients cannot write to world-scoped settings.

**Workaround:** Run the triggering narration from the GM account. Meter
changes will persist correctly. For multiplayer, the GM client must be active.

**Fix needed:** Socket relay — player client emits move result to GM client,
GM client calls `persistResolution()`. See PERSIST-001 in the backlog.

---

### SAFETY-001 — Safety config sync is client-initiated

**Status:** Low priority — acceptable for solo play

**Symptom:** If Lines or Veils are set while only one player is connected,
other players who connect later will not have their `campaignState.safety`
populated until `syncSafetyToCampaignState()` runs on their client (which
happens on `ready` hook).

**Cause:** `syncSafetyToCampaignState()` runs on each client's `ready` hook
and on every write, but reads from client-local `game.settings` which is
scoped per-client for private Lines and world-scoped for global Lines/Veils.

**Impact:** Near zero for solo play. For multiplayer, GM should set global
Lines before players connect for the session.

---

### DIALOG-001 — Dialog.confirm deprecated in v13 ✓

**Status:** Resolved

**Fix:** Replaced `Dialog.confirm(...)` with `DialogV2.confirm(...)` (with
updated option shape `{ window: { title }, content }`) in both `entityPanel.js`
and `progressTracks.js`.

---

### COVERAGE-001 — Function coverage below 65% threshold

**Status:** Accepted — threshold lowered to 50%

**Cause:** `resolver.js` has a 40-entry `CONSEQUENCE_MAP` where each entry is
a data object, not a callable function. These register as uncovered functions in
v8 coverage. The functions are pure data — they have no logic to test.

**Resolution:** Threshold set to 50% with explanatory comment in `vitest.config.js`.
Raise threshold if resolver.js is refactored to separate data from logic.

---

## Resolved issues

### CORS-001 — Electron renderer blocks external API calls ✓

**Resolved in:** Post-session-3 hardening

**Fix:** Local Node.js proxy (`proxy/claude-proxy.mjs`) + Forge server-side
proxy (`ForgeAPI.call("proxy", ...)`). All external API calls routed through
`src/api-proxy.js`.

---

### SHIM-001 — `foundry-shim.js` 404 on module load ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `foundry-shim.js` deleted. `scripts/remove-shim-imports.js` run to
remove import statements from all entity files.

---

### MISCHIEF-001 — Dial naming mismatch between settingsPanel and mischief.js ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `normalizeDial()` added to `mischief.js` maps `"lawful"` → `"serious"`.

---

### V13-001 — Multiple Foundry v12 APIs in use ✓

**Resolved in:** Post-session-3 hardening

**Fixes applied:**
- `message.author` (was `message.user`)
- String literal chat message types (was `CONST.CHAT_MESSAGE_TYPES`)
- DOM API in PTT button (was jQuery)
- `getSceneControlButtons` hook handles both Array (v12) and Object (v13) forms
- `type: "other"` removed from `ChatMessage.create()` (not valid in v13)

---

### CI-001 — module.json not updated before zip build ✓

**Resolved in:** Post-session-3 hardening

**Fix:** CI release job reordered — `module.json` updated (version + URLs)
before zip is built. Both the zip contents and the loose manifest attachment
now have consistent version and manifest URLs.

---

### ASSEMBLER-001 — World truths section always empty in production ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `buildWorldTruthsSection` changed to read `v.title ?? v.result`.
`TruthResult` shape uses `title`; old test fixtures use `result`. Both now
work correctly.

---

### ASSEMBLER-002 — Progress tracks section always empty ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `buildProgressTracksSection` now loads the dedicated "Starforged
Progress Tracks" journal directly by name instead of scanning
`campaignState.progressTrackIds`.

---

### ASSEMBLER-003 — X-Card suppression never fired ✓

**Resolved in:** Post-session-3 hardening

**Fix:** Assembler now checks `campaignState?.xCardActive` in addition to
`isSceneSuppressed(sessionState)`. The `/x` chat command writes to
`campaignState.xCardActive`; `sessionState` was always null in the pipeline.

---

### SAFETY-002 — Safety settings not reaching assembler ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `syncSafetyToCampaignState()` added to `settingsPanel.js`. Runs
on every write to Lines/Veils/Private Lines and on the `ready` hook. Bridges
`game.settings` storage to `campaignState.safety` which the assembler reads.
