# Starforged Companion — Foundations Scope
## Infrastructure required before scene interrogation, recap, and character management

**Priority:** Immediate — implement before any other pending scopes  
**Estimated Claude Code session:** 1 session (~1.5 hours)  
**Blocks:** scene-interrogation-scope.md, previously-on-scope.md, character-management-scope.md

---

## 1. Why this scope exists

Three upcoming features share infrastructure that does not yet exist:

- **Scene interrogation** needs `getRecentNarrationContext()` which reads narrator
  cards filtered by `sessionId` flag
- **Previously On** needs the same, plus session boundary detection via
  `lastSessionTimestamp` in `campaignState`
- **Character management** needs `currentSessionId` stamped on Chronicle entries
- **World journal** needs `sessionId` on all world events

None of these work until narrator cards carry `sessionId` and `narrationText`
flags, and until session IDs are actually generated and managed.

Additionally the help file, docs folder, and CHANGELOG need to land as a
coherent commit so subsequent feature releases can reference them correctly,
and the README needs to stop referencing Loremaster.

---

## 2. Changes required

### 2.1 Session ID management (`src/index.js`)

**Current state:** `campaignState.currentSessionId` exists in the schema but
is never set. It is always an empty string.

**Required:**

On the `ready` hook, generate or restore a session ID:

```js
function initSessionId(campaignState) {
  // If a session ID already exists and the session is recent (< 4 hours),
  // reuse it — this handles page reloads mid-session.
  const last = campaignState.lastSessionTimestamp;
  const recent = last && (Date.now() - new Date(last)) < 4 * 3_600_000;

  if (campaignState.currentSessionId && recent) {
    console.log(`${MODULE_ID} | Resuming session: ${campaignState.currentSessionId}`);
    return campaignState;
  }

  // New session — generate a fresh ID and record the start time
  campaignState.currentSessionId   = foundry.utils.randomID();
  campaignState.sessionNumber       = (campaignState.sessionNumber ?? 0) + 1;
  campaignState.lastSessionTimestamp = new Date().toISOString();

  console.log(
    `${MODULE_ID} | New session: ${campaignState.currentSessionId} ` +
    `(#${campaignState.sessionNumber})`
  );

  return campaignState;
}
```

Call `initSessionId()` in the `ready` hook after `checkLoremaster()`. Persist
the updated `campaignState` via `game.settings.set()` — GM only, same gate as
`persistResolution`.

Also update `lastSessionTimestamp` on world close:

```js
Hooks.once("closeWorld", async () => {
  if (!game.user.isGM) return;
  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  campaignState.lastSessionTimestamp = new Date().toISOString();
  await game.settings.set(MODULE_ID, "campaignState", campaignState);
});
```

---

### 2.2 Narrator card metadata (`src/narration/narrator.js`)

**Current state:** `postNarrationCard()` posts a chat card but stores no flags
on it beyond what the narrator currently needs.

**Required:** Add `sessionId`, `narrationText`, `moveId`, and `narratorCard`
flag to every narrator card posted:

```js
// In postNarrationCard(), add to the ChatMessage.create() call:
flags: {
  [MODULE_ID]: {
    narratorCard:  true,                              // sentinel for filtering
    narrationText: narrationText,                     // raw prose — for recap extraction
    sessionId:     campaignState.currentSessionId,    // for session-scoped filtering
    sessionNumber: campaignState.sessionNumber ?? 1,  // human-readable session number
    moveId:        resolution?.moveId ?? null,        // which move triggered this
    outcome:       resolution?.outcome ?? null,       // strong_hit / weak_hit / miss
    timestamp:     new Date().toISOString(),
  },
},
```

This is a non-breaking addition — existing narrator cards simply won't have
these flags. `getRecentNarrationContext()` and `postSessionRecap()` filter on
`narratorCard: true` and handle missing `sessionId` gracefully (null = include).

---

### 2.3 `CampaignStateSchema` additions (`src/schemas.js`)

Add three fields to the schema default:

```js
// In CampaignStateSchema:
currentSessionId:      "",       // already present but never set — now managed
sessionNumber:         0,        // increments each new session
lastSessionTimestamp:  null,     // ISO string, updated on world close
campaignRecapCache: {
  text:            "",
  generatedAt:     null,
  chronicleLength: 0,
},
```

---

### 2.4 README rewrite (`README.md`)

**Current state:** The README describes the module as requiring Loremaster and
references it throughout. This is no longer accurate.

**Required:** Full rewrite. Key points:

- Remove all Loremaster references
- Lead with what the module actually does: move interpretation, narration,
  oracles, progress tracking, entity management, safety
- Proxy startup instructions (prominent — it's required every session)
- Installation via manifest URL
- One-time setup steps
- Brief description of chat commands (`\\`, `@scene`, `/x`, `/recap`, `/journal`)
- Requirements: Foundry v12+, Node.js (for proxy), Anthropic API key
- Recommended: foundry-ironsworn system
- Cost section (honest — ~$0.06/session with Sonnet narration, ~$0.02 with Haiku)
- Safety section (X-Card, Lines/Veils)
- Link to in-game help compendium

The README does not need to be exhaustive — the in-game help compendium covers
detailed command reference. The README should get a new user to a working state.

---

### 2.5 Help compendium and docs folder commit

Ensure all of the following are committed and the CI zip includes them:

**New files:**
```
packs/help.json                 ← Foundry in-game help compendium
CHANGELOG.md                    ← project changelog
CLAUDE.md                       ← Claude Code working instructions (already exists, update)
docs/decisions.md
docs/known-issues.md
docs/file-structure.md
docs/session-01.md
docs/claude-code-quickstart.md
docs/narrator-scope.md
docs/scene-interrogation-scope.md
docs/previously-on-scope.md
docs/world-journal-scope.md
docs/character-management-scope.md
docs/foundations-scope.md       ← this file
```

**CI zip must include:**
- `packs/` folder (already added to ci.yml)
- `CHANGELOG.md` (already added to ci.yml)
- `docs/` is intentionally NOT included in the zip — it's developer documentation,
  not module content. The in-game help is in `packs/`.

**Manifest validation must check:**
- `packs/help.json` exists and is valid JSON (already added to ci.yml)

---

### 2.6 Module description and `module.json`

Update `module.json` description to remove Loremaster reference:

```json
"description": "A companion module for Ironsworn: Starforged supporting solo and multiplayer campaigns. Handles move interpretation, dice resolution, AI narration, oracle integration, progress tracking, entity management with AI portrait generation, and safety configuration."
```

This is already in the output `module.json` produced previously.

---

### 2.7 `settingsPanel.js` — add session info to About tab

The About tab currently shows static version info. Add live session info:

```html
<div class="about-field">
  <dt>Current session</dt>
  <dd>#{sessionNumber} — {currentSessionId ? currentSessionId.slice(0,8) : "not started"}</dd>
</div>
<div class="about-field">
  <dt>Session started</dt>
  <dd>{lastSessionTimestamp ? formatDate(lastSessionTimestamp) : "—"}</dd>
</div>
```

Read from `game.settings.get(MODULE_ID, "campaignState")` in `_prepareContext`.

---

## 3. Testing

### Unit tests — `tests/unit/sessionManagement.test.js` (new file)

```
initSessionId()
  ✓ generates a new sessionId when none exists
  ✓ generates a new sessionId when last session > 4 hours ago
  ✓ reuses existing sessionId when last session < 4 hours ago (reload)
  ✓ increments sessionNumber on new session
  ✓ preserves sessionNumber on resume
  ✓ sets lastSessionTimestamp on new session

CampaignStateSchema
  ✓ includes currentSessionId field (empty string default)
  ✓ includes sessionNumber field (0 default)
  ✓ includes lastSessionTimestamp field (null default)
  ✓ includes campaignRecapCache field with expected shape
```

### Existing tests — no regressions expected

`assembler.test.js` uses `currentSessionId: "session-1"` in `baseCampaignState()` —
this will continue to work since the field now has a managed value rather than
an empty string. No test changes needed.

### Manual verification in Foundry

After implementation, confirm in the browser console:

```js
// Should show a non-empty ID after world load
game.settings.get('starforged-companion', 'campaignState').currentSessionId

// Should show a non-zero session number
game.settings.get('starforged-companion', 'campaignState').sessionNumber

// After accepting a move, last narrator card should have sessionId flag
game.messages.contents.at(-1).flags?.['starforged-companion']?.sessionId
```

---

## 4. Implementation order

1. Update `CampaignStateSchema` in `src/schemas.js` — add new fields
2. Write `initSessionId()` and wire into ready hook in `src/index.js`
3. Add `closeWorld` hook to `src/index.js`
4. Update `postNarrationCard()` in `src/narration/narrator.js` — add flags
5. Update About tab in `src/ui/settingsPanel.js` — add session info
6. Write `tests/unit/sessionManagement.test.js`
7. Run `npm test` — confirm all 165+ tests pass
8. Rewrite `README.md`
9. Update `module.json` description
10. Commit all `docs/` files, `packs/help.json`, `CHANGELOG.md`, `CLAUDE.md`
11. Update `packs/help.json` changelog page with this release's changes
12. Run `npm test` + `npm run lint` — confirm clean
13. Push and tag

---

## 5. What this unblocks

After this scope is complete:

- **Scene interrogation** — `getRecentNarrationContext()` can filter by `sessionId`
- **Previously On (session recap)** — `postSessionRecap()` can read `narrationText`
  and `outcome` flags from narrator cards; `isNewSessionStart()` can use
  `lastSessionTimestamp`
- **Previously On (campaign recap)** — `sessionNumber` gives human-readable
  session reference ("Session 3")
- **Character management** — Chronicle entries can be stamped with
  `currentSessionId` and `sessionNumber`
- **World journal** — World events can be tagged to the session they occurred in
