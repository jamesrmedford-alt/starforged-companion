# Starforged Companion — Private Channel Scope
## Button-driven private narrator window for solo player reflection

**Status:** 📋 PLANNED — supersedes the prior chat-command-driven draft
**Priority:** Medium-High — quality-of-life feature for reflective play
**Estimated Claude Code sessions:** 2
**Dependencies:** Narrator (✅), Settings infrastructure (✅), Companion
Settings panel (✅), Foundry JournalEntry permission model (✅), Actor
bridge / `getActiveCharacter` resolution (✅)
**Related:** Audio Narration (✅ COMPLETE — audio carries through transparently;
see §16), `!thread` (future, reuses this primitive), `!character new`
(future, structured variant of this primitive)

> **Codebase reconciliation — audited 2026-05-31 against `main`.** This scope was
> written 2026-05-22; the codebase has since shipped features that move its
> integration points. Status stays 📋 PLANNED — **no private-channel code exists
> in `src/`** (verified). Key updates folded in below; the "Pre-drafting
> verification" block that follows is the original 2026-05-22 audit, annotated
> where it has since drifted.
>
> - **Toolbar now uses the Companion's own control group.** F16 (shipped) gave the
>   module a dedicated `controls.starforgedCompanion` scene-control group, built by
>   `buildCompanionTools()` in `src/index.js`, with click handlers in a central
>   `renderSceneControls` `buttonMap`. The private-channel button joins that group
>   and that map — it does **not** inject into `controls.tokens`. This reverses
>   original assumption #1 and supersedes §6.3 (the "dedicated Companion group" it
>   deferred to the future is now the present). There are ten tools today (the
>   v1.6.0 `sfSession` button was added since this was written); the private
>   channel is the eleventh.
> - **Audio Narration shipped (✅).** The §16 "if audio ships" framing is now
>   "audio is available" — see `docs/audio/audio-narration-scope.md`.
> - **Stale paths fixed:** in-game help lives in `src/help/helpJournal.js` (the
>   `packs/help.json` references are corrected throughout); the audio scope moved
>   to `docs/audio/`.
> - **`file:line` references are indicative.** Line numbers across the doc have
>   drifted since 2026-05-22 — e.g. `getActiveCharacter` is now
>   `src/narration/narrator.js:1574` and `getActiveCharacterForPacing` is
>   `src/index.js:1691`. Treat each as "this function, in this file"; re-grep
>   before relying on an exact line.

> **Pre-drafting verification (surfaced per packet instructions).** The
> source packet's eleven structural assumptions were audited against the
> codebase. Adjustments to the original packet are itemised here so the
> reader can see what changed and why.
>
> 1. ⚠️ **SUPERSEDED by F16 — the button joins the Companion's own group.**
>    *Originally (2026-05-22):* `src/index.js` registered nine tools under
>    `controls.tokens` and this scope folded the private-channel button in as a
>    tenth. *Now:* F16 shipped a dedicated `controls.starforgedCompanion` group,
>    built by `buildCompanionTools()`, holding ten tools today — `sfSession`,
>    `progressTracks`, `entityPanel`, `chronicle`, `sfSettings`, `sectorCreator`,
>    `worldJournal`, `worldTruths`, `clocks`, `customOracles`. The private channel
>    becomes the **eleventh** tool **in that group** (not in `tokens`). The
>    packet's original "Companion control group" concept — which this assumption
>    rejected — is now exactly what exists. See §6.
>
> 2. ⚠️ **Two-hook toolbar pattern is mandatory.** Per
>    `rules/foundry-api.md` lines 32-68, v13 requires registration in
>    `getSceneControlButtons` (metadata only, with `onChange` — NOT
>    `onClick`) plus click-handler attachment in `renderSceneControls`
>    (DOM `addEventListener` against `[data-tool="…"]`). The packet's
>    single-hook `onClick` shape is v12-era and must be split. See §6.
>
> 3. ✅ **ApplicationV2 accessed globally.** Every existing panel
>    (`SettingsPanelApp`, `EntityPanelApp`, `WorldJournalPanelApp`,
>    `ProgressTracksApp`, plus the newer Clocks / Custom-Oracles / Session
>    panels) extends `foundry.applications.api.ApplicationV2`
>    via the global namespace, not an ES module import. The packet's
>    `import { ApplicationV2 } from "<foundry-app-v2-path>"` is a
>    placeholder; the real shape is `extends foundry.applications.api.ApplicationV2`.
>    See §3.
>
> 4. ⚠️ **No `campaignState.character` field exists.** The packet
>    references it three times (disabled-state check, context packet,
>    publish flow). The actual character-resolution helpers are
>    `getActiveCharacter(campaignState, speakerActorId)` in
>    `src/narration/narrator.js:1574+` and
>    `getActiveCharacterForPacing(campaignState, speakerActorId)` in
>    `src/index.js:1691+`. Both fall back to `getPlayerActors()` from
>    the actor bridge when `campaignState.characterIds` is empty. The
>    scope uses these helpers — see §3 and §4.
>
> 5. ⚠️ **No API-key validation state tracking exists.** The packet's
>    third disabled-state reason ("API key has failed validation in the
>    last hour") implies a `campaignState.api.lastValidationError`
>    field that does not exist. Two options were considered: (a) build
>    the field as part of this scope; (b) drop the third reason and let
>    the player discover key failures when they actually try to use the
>    channel. Position: **(b)** — see §6.4 and §17. v1 surfaces failure
>    *inside* the window via an error banner, not as a button gate. Key
>    pre-flight validation is a §17 follow-on.
>
> 6. ⚠️ **No Handlebars templates in this project.** The packet's
>    references to `templates/private-channel.hbs` and
>    `renderTemplate("templates/published-reflection.hbs", …)` do not
>    match how this codebase builds UI. Every existing ApplicationV2
>    renders inline HTML strings from `_renderHTML()`, and `ChatMessage.create`
>    callers pass HTML content strings directly (see
>    `src/narration/narrator.js:376-386` and
>    `src/ui/settingsPanel.js:1152-1226`). The scope uses inline HTML
>    consistently. See §3, §7, and §9.
>
> 7. ✅ **JournalEntry ownership pattern verified.**
>    `src/ui/progressTracks.js:74-84` and the existing safety-config
>    `privateLines` pattern (`{ playerId, lines }` per
>    `src/schemas.js:637-639`) confirm the per-player ownership object
>    shape. The packet's `ownership: { default: 0, [playerId]: 3, [gmId]: 2 }`
>    is correct — the constants are `CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE`
>    / `.OWNER` / `.OBSERVER`. See §5.
>
> 8. ✅ **`campaignState.currentSessionId` is the session identifier.**
>    `src/schemas.js:712` declares it; `initSessionId()` populates it
>    on the `ready` hook; `narratorCard` flags carry it via
>    `sessionId: campaignState?.currentSessionId ?? null`
>    (`src/narration/narrator.js:392`). The scope keys transcript pages
>    on this same value. See §5.
>
> 9. ⚠️ **The "GM is a full player" principle is not in decisions.md.**
>    The packet references "the session 5 architectural decision" twice
>    as if documented. The principle is *implicit* in the
>    `docs/decisions.md` "Narration: direct Claude API" entry (no GM
>    dependency for narration; player clients trigger directly) but is
>    not stated explicitly. The scope describes the symmetric behaviour
>    in §5 without invoking the (undocumented) principle by name; a
>    decisions.md addition is proposed in §17 as a follow-on.
>
> 10. ✅ **Multi-line text input precedent.**
>     `src/ui/settingsPanel.js:1108-1110` renders a `<textarea
>     name="narrationInstructions">` inside the Narrator tab. Same
>     pattern is used for the player input area — see §3.
>
> 11. ✅ **`src/private-channel/` does not exist yet.** Confirmed against
>     the current `src/` tree. The scope creates this directory. No
>     filename collisions.

---

## 1. Overview

The private channel is a floating ApplicationV2 window providing a side
conversation between one player and the narrator. Use cases: character
reflection between scenes, working through a decision in-fiction without
committing it to main chat, asking the narrator a private question
about something the character is considering.

Three properties define it:

- **Button-triggered.** The player clicks a tool in the existing scene
  controls toolbar to open. There is no chat command syntax. Nothing is
  posted to main chat when the channel opens, when messages are
  exchanged, or when the window is closed.
- **No move resolution.** The private channel runs the narrator
  directly — no move interpreter, no roll, no mechanical state change.
  It is pure conversation.
- **Publish is opt-in.** When (and only when) the player chooses to
  publish, content reaches main chat as a styled card. Until then the
  conversation is invisible to other players.

The `PrivateChannelApp` component is built with a `mode` config from day
one so `!thread` (multi-participant scene threading) and `!character new`
(guided character creation) can reuse the same primitive without
refactoring. v1 ships with `PRIVATE` only — see §15.

---

## 2. User experience

### 2.1 Opening the channel

A tool is visible in the Foundry scene controls toolbar (left rail) in
the **tokens** group, alongside the existing Companion tools
(progressTracks, entityPanel, chronicle, sfSettings, sectorCreator,
worldJournal, worldTruths, clocks, customOracles). Tooltip: "Private
Channel — speak with the narrator privately." Icon:
`fas fa-comment-dots`.

The player clicks the tool. The `PrivateChannelApp` window opens
floating on the player's client. Nothing appears in main chat.

The tool renders disabled-with-tooltip when:
- No active character is resolved for this user via
  `getActiveCharacter` → "Set up your character first."
- The Anthropic API key is missing → "Add your API key in Companion
  Settings → About."

If the window is already open, clicking the tool brings it to front
(no-op if already focused).

### 2.2 The window

A floating ApplicationV2 window roughly 480×640 pixels with three regions:

```
┌─ Private Channel — Kira ─────────────────[ ─ □ × ]┐
│                                                    │
│  [ transcript scroll area ]                        │
│                                                    │
│  Kira:  I keep replaying that look Vance gave me.  │
│  Narrator:  The image stays with you — that        │
│             half-smile that didn't reach the       │
│             eyes...                                │
│                                                    │
│  [ player message input — multi-line textarea ]    │
│                                                    │
│  [Send]              [Publish selected ↗]          │
└────────────────────────────────────────────────────┘
```

Input is multi-line (`<textarea>` per §10 of the audit; matches
`src/ui/settingsPanel.js:1108-1110`). Enter sends; Shift+Enter inserts a
newline. Standard chat conventions.

The player types, hits Send, the narrator responds. Round-trip uses
Haiku (private exchanges are short and frequent; Sonnet is overkill —
see §14 cost section).

### 2.3 Publishing

The player can select any narrator output (or any portion) and click
"Publish selected ↗". A confirmation dialog (DialogV2) shows the
selected content. On confirm, the content posts to main chat as a
styled card attributed to the player's character — visible to all
players. Until publish is invoked, nothing leaves the private channel.

The publish button is disabled when the transcript is empty or no text
is selected (`document.getSelection()` returns empty range).

### 2.4 Closing

Clicking × closes the window. The transcript is persisted to the
player's private journal page for this session via a debounced write
(§5.3). Reopening the window in the same session resumes the
transcript. Sessions are bounded by `campaignState.currentSessionId`.

### 2.5 Error surfaces

API-key failures, network errors, and rate limits surface as a
dismissible banner inside the window (not as a button gate). The
transcript and input remain visible; the player can fix the underlying
issue (paste a new key in About, wait, etc.) and retry without losing
context. See §6.4.

---

## 3. New files

```
src/private-channel/
  app.js          — PrivateChannelApp (extends ApplicationV2)
  context.js      — buildPrivateContext (cacheable prefix + volatile tail)
  transcript.js   — load, append, debounced save, session-page lookup
  publish.js      — publishToMainChat helper
  index.js        — module entry point: register settings, wire toolbar

styles/
  private-channel.css   — window, transcript, send/publish buttons, published card
```

### 3.1 `src/private-channel/app.js`

```js
const MODULE_ID = "starforged-companion";

export const CHANNEL_MODE = Object.freeze({
  PRIVATE:   "private",     // single player + narrator (v1)
  THREAD:    "thread",      // multiple players + narrator (future)
  CHARGEN:   "chargen",     // guided character creation (future)
});

/**
 * PrivateChannelApp — floating window for private narrator
 * conversations. Built with a `mode` config so the same component
 * serves the private channel (v1), !thread (future), and
 * !character new (future) without refactoring.
 *
 * v13 native: `foundry.applications.api.ApplicationV2` is accessed
 * via the global namespace, not as an ES import. Matches every other
 * panel in this codebase (SettingsPanelApp, EntityPanelApp,
 * WorldJournalPanelApp, ProgressTracksApp).
 */
export class PrivateChannelApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id:       "sf-private-channel-{userId}",
    classes:  ["sf-private-channel"],
    window:   { title: "Private Channel", resizable: true, minimizable: true },
    position: { width: 480, height: 640 },
    actions:  {
      send:    PrivateChannelApp.#onSend,
      publish: PrivateChannelApp.#onPublish,
    },
  };

  /**
   * Open or focus the private channel window for the calling user.
   *
   * @param {object} args
   * @param {string} args.userId           — owning player's user ID
   * @param {string} [args.mode="private"] — CHANNEL_MODE value
   * @param {string} [args.initialMessage] — pre-fill input on open
   * @param {object} [args.threadConfig]   — for THREAD mode only
   * @returns {Promise<PrivateChannelApp>}
   */
  static async open({ userId, mode = CHANNEL_MODE.PRIVATE,
                      initialMessage, threadConfig } = {}) { /* ... */ }

  // Inline-HTML render (no Handlebars).
  async _renderHTML(context, options) { /* returns HTMLElement */ }
  async _prepareContext(options)       { /* returns view model */ }
  _onClose(options)                    { /* flush transcript */ }

  // Static action handlers (bound via DEFAULT_OPTIONS.actions).
  static async #onSend(event, target)    { /* ... */ }
  static async #onPublish(event, target) { /* ... */ }
}
```

The config-object signature for `open()` is non-negotiable for the v1
build. Positional parameters were considered and rejected — `!thread`
will add multiple new parameters (participants, scene config, synthesis
behaviour) and a positional signature would force a breaking refactor.

### 3.2 `src/private-channel/context.js`

```js
/**
 * Build the context packet sent to the narrator for a private-channel
 * turn. Mirrors the cacheable-prefix / volatile-tail split established
 * by docs/pacing-scope.md §13.
 *
 * @param {object} args
 * @param {object} args.campaignState
 * @param {string} args.userId
 * @param {string} args.actorId             — resolved via getActiveCharacter
 * @param {string[]} args.transcriptTurns   — verbatim prior turns this session
 * @param {string} args.playerMessage
 * @returns {Promise<{ system: string, user: string, cacheBreakpoint: number }>}
 */
export async function buildPrivateContext(args) { /* ... */ }
```

### 3.3 `src/private-channel/transcript.js`

```js
/**
 * Per-player private-channel transcript management. One JournalEntry
 * per player, one page per session.
 *
 * Permissions: { default: NONE, [playerId]: OWNER, [gmId]: OBSERVER }.
 * If playerId === gmId (GM playing solo), collapses to a single OWNER.
 */
export async function loadCurrentSessionTranscript(userId, sessionId) { /* ... */ }
export function appendToBuffer(userId, turn)                          { /* ... */ }
export function scheduleDebouncedWrite(userId, delayMs = 5000)        { /* ... */ }
export async function flushNow(userId)                                { /* ... */ }
```

### 3.4 `src/private-channel/publish.js`

```js
/**
 * Publish selected transcript content to main chat as a styled card.
 * Speaker alias is the character name resolved via getActiveCharacter.
 */
export async function publishToMainChat({ userId, content }) { /* ... */ }
```

### 3.5 `src/private-channel/index.js`

The module entry point — imported from `src/index.js`. Registers
settings (§10) and registers the private-channel tool in the Companion
control group (§6).

---

## 4. Context packet for the private narrator call

The private narrator differs from the main-chat narrator in two ways:
no move resolution, and explicit "you are in a private channel" framing
so the model knows to respond conversationally rather than narrating
outward.

The context packet structure:

```
## SAFETY CONFIGURATION
{ global hard and soft safety rules — same source as buildNarratorSystemPrompt }

## ROLE
You are the narrator running a private channel session. The player has
stepped aside from main play to think, reflect, or ask you something
privately. Respond conversationally. Do NOT narrate as if this is the
main scene. Do NOT resolve moves or mechanical changes.

## WORLD TRUTHS
{ all 14 truths verbatim — same source as buildCampaignTruthsBlock }

## CHARACTER
{ name, stats, condition meters, current vehicle, connections, active
  vows, narrator notes — sourced from getActiveCharacter(campaignState,
  speakerActorId), NOT from a non-existent campaignState.character field }

## CURRENT SCENE CONTEXT
Location: {scene location}
Last N narrator beats from main chat: {recent narration — via
  getRecentNarrationContext(sessionId, 3)}
Currently present NPCs: {[ names — from campaignState.entities filtered
  to current scene ]}
Active scene tension: {scene clock state, pending threats}

## PRIVATE TRANSCRIPT THIS SESSION
{ verbatim turns so far in this private channel — loaded from
  loadCurrentSessionTranscript(userId, sessionId) }

## PLAYER MESSAGE
{ new player input }
```

**Character resolution.** The packet's draft assumed
`campaignState.character` was a populated field. It is not — the schema
holds `characterIds: []` and resolves the active actor dynamically via
`getActiveCharacter(campaignState, speakerActorId)`. The private
channel uses the same helper. If multiple actors are owned by the same
user (unusual), the first is selected and surfaced in the window title
("Private Channel — {actorName}"). A picker is a §17 follow-on.

**Caching strategy.** SAFETY + ROLE + WORLD TRUTHS + CHARACTER static
fields form a stable prefix within a session. Cache breakpoint sits
between CHARACTER and CURRENT SCENE CONTEXT. The scene context and
transcript change every turn; the prefix doesn't. Same pattern as the
pacing classifier (`docs/pacing-scope.md` §13) and the fact-continuity
ledger render (`docs/fact-continuity-scope.md` §6).

**Model.** `claude-haiku-4-5-20251001`. Private exchanges are short and
frequent; throughput and cost matter more than peak quality. The world
narrator-model setting is not consulted — private channel always uses
Haiku, regardless of how the GM has configured the main narrator.

**Why scene context is included.** The original draft omitted scene
context on the grounds that the private channel is "separate" from main
play. Playtesting consideration: the player's private message will
almost always reference what just happened ("I keep replaying that look
Vance gave me"). Without scene context the narrator is blind to "what
look" and "which Vance." Include recent main-chat narration (last 3
narrator beats), scene location, and present NPCs.

---

## 5. Storage — private transcripts

One JournalEntry per player, named `Private Channel — {playerName}`.
One JournalEntry page per session, named by
`campaignState.currentSessionId` plus a timestamp.

```
JournalEntry: Private Channel — Kira (player)
  Page: Session 12 — 2026-05-18T14:23
    {HTML transcript of the private channel for this session}
  Page: Session 11 — 2026-05-04T19:01
    ...
```

### 5.1 Folder

The JournalEntry lives in the existing **Starforged Companion** folder
(established by the World Journal v2 / Pacing Telemetry scopes). No new
folder needed. Lookup by name; create on first open.

### 5.2 Permissions

The journal is owned by the player and visible to the GM (Observer
permission). Other players cannot see it. This matches the existing
per-entry permission pattern used in `src/ui/progressTracks.js:74-84`.

```js
const ownership = {
  default:       CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
  [playerUserId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
  [gmUserId]:     CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
};
```

If `playerUserId === gmUserId` (the GM is playing solo as the only
player — which the existing module design treats as a first-class
case), the ownership object collapses to a single OWNER entry — fine.

GM lookup uses `game.users.find(u => u.isGM && u.active) ?? game.users.find(u => u.isGM)`
to prefer the currently-connected GM. If no GM exists at all (test
environments, transient state), the observer slot is omitted; the
journal is still owned by the player.

### 5.3 Write behaviour — debounced

The transcript is debounced. After each narrator response, schedule a
write 5 seconds in the future via `scheduleDebouncedWrite(userId, 5000)`.
Subsequent messages within the window reset the timer. On window close
or session end, `flushNow(userId)` runs immediately. This avoids a
Foundry document write per message (which is expensive) while keeping
transcripts durable across unexpected disconnects.

The in-memory buffer for the pending write lives in
`src/private-channel/transcript.js` as a module-scoped `Map<userId,
{ turns, timerId }>`. It does not pollute `campaignState`.

### 5.4 Storage format

Each page's HTML content is a sequence of speaker-attributed paragraphs:

```html
<p class="pc-turn pc-turn-player"><strong>Kira:</strong> I keep replaying that look…</p>
<p class="pc-turn pc-turn-narrator"><strong>Narrator:</strong> The image stays with you…</p>
```

CSS in `private-channel.css` styles the two classes. The same HTML is
re-rendered into the window on resume — no parsing back to a structured
turn array is needed.

---

## 6. Button placement and discovery — join the Companion control group

`src/index.js` already owns the two-hook registration (per the
`rules/foundry-api.md` "Two-hook pattern" section): `getSceneControlButtons`
builds the dedicated `controls.starforgedCompanion` group from
`buildCompanionTools()`, and `renderSceneControls` wires clicks from a central
`buttonMap`. The private channel adds **one tool** and **one handler entry** to
that existing machinery — it does not register its own hook pair.

### 6.1 Metadata — add a tool to `buildCompanionTools()`

```js
// inside buildCompanionTools() in src/index.js, alongside the other ten tools
sfPrivateChannel: {
  name:    "sfPrivateChannel",
  title:   "Private Channel — speak with the narrator privately",
  icon:    "fas fa-comment-dots",
  button:  true,
  // player-facing, so no `visible: isGM` gate (unlike sfSettings / worldJournal / …)
  onChange: () => {},   // v13 doesn't fire onChange for button tools; the click
                        // is wired in renderSceneControls (§6.2)
},
```

### 6.2 Click — add an entry to the `renderSceneControls` `buttonMap`

```js
// inside the existing renderSceneControls handler's buttonMap in src/index.js
const buttonMap = {
  sfSession:        () => openSessionPanel(),
  // …the existing entries…
  sfPrivateChannel: () => PrivateChannelApp.open({ userId: game.user.id }),
};
```

The shared handler already clone-replaces and re-listens against
`[data-tool="…"]`, so the private channel inherits the de-dupe and the v13
wiring for free — no per-feature hook needed.

### 6.3 Group — resolved by F16

The tool lives in the dedicated **`starforgedCompanion`** group that F16 shipped.
This scope originally deferred such a group to "future tools-growth pressure";
that future is now the present, so there is no `tokens`-group injection and no
new group to create — the private channel is simply the **eleventh** tool in the
existing group.

### 6.4 Disabled state

The tool renders disabled-with-tooltip when either gate fails. The
gates are checked at `getSceneControlButtons` time and re-evaluated on
any `renderSceneControls` re-fire (after settings save, after actor
creation, etc.).

| Condition | Tooltip |
|---|---|
| No active character resolvable for `game.user.id` via `getActiveCharacter` | "Set up your character first." |
| `game.settings.get(MODULE_ID, "claudeApiKey")` is empty string | "Add your API key in Companion Settings → About." |

The packet's third reason ("API key has failed validation in the last
hour") is dropped from v1 — no validation-state field exists in
`CampaignStateSchema` and adding one is over-engineering for a UX
nicety. Failure of an existing key surfaces inside the window as a
banner (§2.5), where the player can correct it without losing
transcript state. A periodic key health-check is a §17 follow-on.

---

## 7. Publishing to main chat

The publish flow:

1. Player selects text in the transcript scroll area (text selection is
   standard DOM behaviour; no custom selection logic required).
2. Player clicks "Publish selected ↗". The button is enabled only when
   the selection is non-empty within the transcript region (publishing
   raw input-area text is disallowed — only narrator-or-player turns
   already committed).
3. A DialogV2 confirmation shows the selected content with the
   attribution preview: *"Kira pauses to reflect..."* followed by the
   selected text.
4. On confirm, the selected content posts to main chat as a styled card.
   The card uses a distinct background tint and "reflection" attribution
   so published reflections are visually distinct from move outcomes
   and real-time narration.

```js
async function publishToMainChat({ characterName, content }) {
  await ChatMessage.create({
    speaker: { alias: characterName },  // ChatMessage.getSpeaker is bypassed; alias only
    content: `
      <div class="sf-published-reflection">
        <div class="sf-published-reflection-attribution">
          ${escapeHTML(characterName)} pauses to reflect…
        </div>
        <div class="sf-published-reflection-body">${content}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: { kind: "published-reflection" },
    },
  });
}
```

Inline HTML, no Handlebars (the project does not use renderTemplate or
.hbs files; see §3 of the audit).

Once published, the content is canon to main chat. The narrator's
fact-continuity sidecar pipeline (`docs/fact-continuity-scope.md` §7)
does **not** parse it for new truths or state changes — published
reflections are first-person character monologue, not narrator
assertion. If the published content references entities, the entity
detection pass (`runCombinedDetectionPass`) still operates normally as
on any chat content. The private channel window remains open; the
player can continue privately afterward.

---

## 8. Session resume

When `PrivateChannelApp.open()` is called:

1. Resolve the player's `JournalEntry` ("Private Channel — {playerName}").
   Create if absent.
2. Look up the page named for the current `campaignState.currentSessionId`.
3. If present, load the page HTML and render it in the transcript area
   before accepting new input. Append turns to the loaded buffer.
4. If absent, create a fresh page (write deferred until first message
   per §5.3 to avoid empty-page noise).

The narrator's context packet (§4) includes the loaded transcript so
the conversation resumes coherently.

If the player closed the window mid-thought and reopens an hour later,
the transcript is preserved. If a new session has begun
(`campaignState.currentSessionId` changed since the last write), a
fresh page is started and the prior session's transcript is not loaded
— but remains accessible via Foundry's journal sidebar.

---

## 9. CSS

`styles/private-channel.css`, imported from
`styles/starforged-companion.css`.

Styles covered:

- `.sf-private-channel` window container — slight colour shift from the
  default ApplicationV2 to signal "private".
- `.pc-turn` paragraphs — `.pc-turn-player` and `.pc-turn-narrator`
  alternating speaker styling in the transcript region.
- `.sf-pc-input-area` — textarea with auto-grow behaviour up to a max
  height; matches the narrator-instructions textarea pattern from the
  Narrator tab.
- `.sf-pc-actions` — Send and Publish button styling.
- `.sf-pc-error-banner` — error surface for in-window failures (§2.5).
- `.sf-published-reflection` chat card — background tint, attribution
  styling, max-width.

Roughly 100-150 lines of CSS. No external dependencies. CSS vars reuse
the module's existing palette.

---

## 10. Settings

### 10.1 World-level (GM controls)

```js
game.settings.register(MODULE_ID, "privateChannel.enabled", {
  scope: "world", config: false, type: Boolean, default: true,
});
```

Toggle for the entire feature. When false, the toolbar tool is hidden
for all players (the `getSceneControlButtons` registration short-
circuits on the setting). Provides clean rollback.

The setting is surfaced inside the **Narrator** tab of Companion Settings
as a checkbox below the existing narration toggles, not as a new tab —
the feature is narrator-adjacent and doesn't justify a dedicated tab.

### 10.2 Per-client (each player)

```js
game.settings.register(MODULE_ID, "privateChannel.windowPosition", {
  scope: "client", config: false, type: Object,
  default: { left: null, top: null, width: 480, height: 640 },
});
```

Window position persists per player. Sensible default but the player's
last position is restored on next open. Foundry v13's
`ApplicationV2.setPosition` returns `{ left, top, width, height }` —
the setting uses those exact keys (the packet's `{ x, y, width, height }`
was a placeholder; `left`/`top` is what ApplicationV2 actually emits).

---

## 11. Cost estimate

Haiku with prompt caching. The cacheable prefix is large; the volatile
tail is the scene context + transcript + new player message.

Per-message approximate breakdown:

| Component | Tokens | Cached? |
|---|---|---|
| Safety + role | ~350 | yes |
| World truths (14) | ~700 | yes |
| Character static block | ~400 | yes |
| Connections, vows | ~150 | partial |
| Current scene context | ~200 | no |
| Private transcript (grows) | 100–2000 | no |
| New player message | ~50 | no |
| **Total input (early in session)** | ~1850 | |
| **Total input (later in session)** | ~3700 | |
| Output | ~300 | — |

With caching:

- Cached prefix (~1450 tokens) at $0.08/MTok = ~$0.00012 read
- Volatile input (~400–2300 tokens) at $0.80/MTok = ~$0.00032–0.00184
- Output (~300 tokens) at $4.00/MTok = ~$0.0012

**Per message: ~$0.0015–0.003.**

A typical session might see 10–30 private channel exchanges across all
participating players. Per-session cost: **~$0.02–0.10.** Same order of
magnitude as the pacing classifier.

The cache write happens once per session per player at first open
(~$0.0015). Subsequent reads dominate.

These figures inherit the pacing-scope caveat: pricing was correct at
draft time and should be spot-checked before any future change.

---

## 12. Telemetry

Private channel exchanges write a row to the existing **Pacing
Telemetry** journal under the Starforged Companion folder (created by
`docs/pacing-scope.md` §12). Fields: timestamp, userId-hash,
turn-direction (player/narrator), prompt-tokens, output-tokens,
cache-read-tokens, error. Same journal as the pacing classifier and
audio-narration generation. One row per turn.

The hash of `userId` keeps the journal observable to the GM without
leaking which specific player is reflecting most — relevant when the
journal is shared screen-on during a session retro. Raw `userId` is
intentionally not stored.

---

## 13. Testing

### 13.1 Unit tests — `tests/unit/private-channel.test.js`

```
PrivateChannelApp.open()
  ✓ creates window with correct userId and mode
  ✓ brings existing window to front if already open for the same user
  ✓ accepts and applies initialMessage if provided
  ✓ defaults mode to PRIVATE when not specified
  ✓ rejects unknown mode values

buildPrivateContext()
  ✓ includes safety, role, world truths in cacheable prefix
  ✓ includes scene context outside the cache boundary
  ✓ includes resumed transcript when one exists
  ✓ formats player message as final block
  ✓ resolves character via getActiveCharacter (mock injected)
  ✓ throws if no character is resolvable

publishToMainChat()
  ✓ creates ChatMessage with correct speaker alias
  ✓ applies published-reflection flag
  ✓ escapes HTML in characterName attribution

loadCurrentSessionTranscript()
  ✓ returns transcript HTML from current-session page
  ✓ returns empty string when no current-session page exists
  ✓ respects journal permission model when GM is different from player

debounced transcript write
  ✓ delays write 5 seconds after last appendToBuffer call
  ✓ resets timer on subsequent appends
  ✓ flushNow runs the write immediately and clears the timer
  ✓ flushNow on close is a no-op when buffer is empty
```

### 13.2 Quench integration — `starforged-companion.private-channel`

```
Toolbar registration (Companion control group)
  ✓ getSceneControlButtons exposes the tool in the starforgedCompanion group
  ✓ renderSceneControls wires the buttonMap entry to a click listener
  ✓ click handler opens PrivateChannelApp.open
  ✓ second click on already-open window brings to front (no new instance)
  ✓ tool hidden when privateChannel.enabled is false
  ✓ tool disabled (with tooltip) when no character resolvable
  ✓ tool disabled (with tooltip) when API key empty

Conversing
  ✓ player sends message, narrator responds within window only
  ✓ no chat card is created during exchange
  ✓ Enter sends, Shift+Enter inserts newline (textarea default)
  ✓ error banner shown on 401, transcript preserved

Publishing
  ✓ select narrator text + publish → card appears in main chat with reflection styling
  ✓ publish disabled when transcript empty
  ✓ publish disabled when no selection
  ✓ published card carries kind="published-reflection" flag

Persistence
  ✓ close window + reopen → transcript restored from session page
  ✓ start new session → fresh page, prior session not loaded
  ✓ prior session pages remain visible in journal sidebar
  ✓ debounced write fires after 5 seconds idle
  ✓ window close flushes pending write immediately

Permissions
  ✓ GM can view another player's private journal (Observer)
  ✓ another player cannot view a player's private journal (NONE)
  ✓ GM-as-only-player collapses to single OWNER ownership entry
```

---

## 14. Implementation order

1. Write `src/private-channel/transcript.js` — load, append, debounced
   save, session-page lookup. Pure-ish (Foundry-touching at the edges);
   covers most of the persistence layer.
2. Write `src/private-channel/context.js` — `buildPrivateContext`
   covering cacheable prefix + volatile tail split. Uses existing
   `getActiveCharacter`, `buildCampaignTruthsBlock`,
   `getRecentNarrationContext`.
3. Write `src/private-channel/publish.js` — `publishToMainChat`.
4. Write `tests/unit/private-channel.test.js` covering 1-3.
5. Write `src/private-channel/app.js` — `PrivateChannelApp` class
   skeleton, `CHANNEL_MODE` exports, action handlers `#onSend` and
   `#onPublish`. Use the config-object signature from day one.
6. Implement `_renderHTML` returning the inline HTML for the window —
   transcript scroll area, multi-line textarea, send button, publish
   button, error banner (initially hidden).
7. Register settings (`privateChannel.enabled`,
   `privateChannel.windowPosition`).
8. Write `src/private-channel/index.js` — register settings, add the tool
   to `buildCompanionTools()` + a `renderSceneControls` `buttonMap` entry,
   with disabled-state evaluation.
9. Wire `#onSend` → call narrator via `apiPost` with private context
   packet → render response in transcript → schedule debounced persist.
10. Wire `#onPublish` → DialogV2 confirmation → `publishToMainChat`.
11. Add CSS in `styles/private-channel.css`; import from
    `styles/starforged-companion.css`.
12. Add Quench integration batch.
13. Update `src/help/helpJournal.js` — add a "Private Channel" entry describing
    the tool, the disabled-state reasons, the publish behaviour, and
    the "no main chat noise" guarantee.
14. Update `CHANGELOG.md` and `docs/scope-index.md`.

---

## 15. `mode` config — integration with `!thread` and `!character new`

The same `PrivateChannelApp` component is designed to serve three modes:

| Mode | Trigger | Participants | Move resolution | Synthesis on close |
|---|---|---|---|---|
| `PRIVATE` | toolbar tool | 1 player + narrator | no | none |
| `THREAD` | toolbar tool → "Start Thread" dialog (future) | N players + narrator | yes | synthesis card to main chat |
| `CHARGEN` | toolbar tool → guided flow (future) | 1 player + narrator | no | character sheet populated, first chronicle entry |

The mode config drives:

- Which participants are included in the context packet
- Whether the move interpreter runs on player input
- What happens on window close (synthesis for THREAD, character
  finalization for CHARGEN, nothing for PRIVATE)
- Window title and styling cues

This scope ships v1 with only `PRIVATE` mode implemented. `THREAD` and
`CHARGEN` get their own scope docs but inherit the component. The "no
chat noise unless published" principle established here applies to all
three modes — `THREAD`'s synthesis card on close is the only chat
emission from threaded play.

---

## 16. Design decisions

**Button-driven, not chat-command driven.** Pre-revision drafts used an
`@private` command in chat input. This produced three real problems:
(1) multi-client coordination — `createChatMessage` fires on every
client, requiring careful per-client logic to avoid duplicate windows
and failed deletions; (2) player-initiated message deletion may not be
permitted in Foundry depending on host configuration, risking public
exposure of the trigger message; (3) the command path leaked "a private
channel just opened" information to other players via the notification
card. Button-triggered opening eliminates all three. Nothing appears in
main chat for the open event.

**No move resolution in the private channel.** The private channel is
for reflection, deliberation, and exploration of fiction — not for
mechanical resolution. If the player decides to take action, they
publish a relevant beat and then trigger a move from main chat.

**Haiku, not Sonnet, regardless of world narrator setting.** Private
exchanges are short, frequent, and typically don't require Sonnet-tier
coherence over long context. Haiku's throughput and cost favour the
high-frequency use case. The world narrator-model setting governs main-
chat narration only; the private channel is its own decision.

**`mode` config from day one.** Without the config-object signature,
`!thread` (multi-participant scene threading) would force a breaking
refactor of `PrivateChannelApp.open()`. The cost is trivial now and
prohibitive later.

**Scene context in the private context packet.** The original draft
omitted scene context, reasoning that the private channel is "separate"
from main play. In practice, every private message references the
scene the player just stepped away from. Including scene context is
mandatory for coherent responses.

**Caching the safety + truths + character prefix.** Mirrors the pacing
classifier's caching pattern. The first message in a session writes the
cache; subsequent messages hit it. Halves typical cost.

**Per-journal-page transcript, not single-page-append.** One page per
session keeps transcripts navigable. The Foundry journal UI naturally
supports paging by entry; the player can flip back through prior
sessions if they want to recall a past reflection.

**Debounced writes, not write-per-message.** Foundry document writes
are expensive; per-message writes would make the private channel
noticeably laggy. Debouncing 5 seconds after the last message keeps
writes durable without per-keystroke cost.

**Disabled-with-tooltip, not hidden.** A hidden tool is undiscoverable;
a disabled tool with a tooltip communicates both the affordance and
the reason it isn't available right now.

**Two disabled-state reasons in v1, not three.** The packet's third
reason ("API key has failed validation in the last hour") was dropped
because no validation-state field exists in the schema. Building one
is over-engineering for an entry-point gate. Failure of an existing
key surfaces inside the window as a banner the player can act on
without losing transcript state. A periodic key health-check is §17.

**The Companion's own control group (F16).** The module's ten tools live in a
dedicated `controls.starforgedCompanion` group — F16 moved them out of
`controls.tokens`, where selecting any other control group hid them with no way
back. The private channel is the eleventh tool in that group. *(This reverses the
original 2026-05-22 decision, which kept the tools in `tokens` and deferred a
dedicated group to future tools-growth pressure — that pressure has since
arrived.)*

**Two-hook toolbar pattern.** Mandated by `rules/foundry-api.md` for
v13. The packet's single-hook `onClick` shape is v12-era and would
silently fail to wire on v13.

**Inline HTML over Handlebars.** Matches the rest of the codebase. No
`templates/` directory exists; introducing one for this single feature
would be a one-off and force every future scope to choose
inconsistently.

**Per-player journal, not shared journal with per-page permissions.**
Per-player JournalEntry makes ownership trivial and search obvious
(the player flips through their own journal, not a shared one).
Per-page permissions in a single journal would also work but make
revoking access (e.g., a departing player) clumsier.

---

## 17. Follow-on / future work

**API-key health monitoring.** A small periodic check that pings the
Anthropic `/v1/messages` endpoint with a low-token request and writes
the result to `campaignState.api.lastValidationError`. Used by the
toolbar disabled-state evaluation to surface a third gating reason
(packet's original Q). Out of scope for v1 — the in-window error banner
covers the common case.

**Cross-session search.** A player might want to find "that thing I
worked out in private a few sessions ago." Search across the player's
private journal entries via Foundry's built-in journal search.

**Transcript export.** Markdown export of a private channel session for
the player's own record. Out of scope for v1; Foundry's normal journal-
export mechanisms cover this.

**Audio narration in the private channel.** Audio Narration shipped
(`docs/audio/audio-narration-scope.md`); audio applies in the private
channel window the same way it applies to main chat narrator cards —
provided narrator turns in the transcript are rendered with the
`narratorCard: true` flag on a card-equivalent DOM element. The audio
scope's `audioEnabledForThisClient()` and segment pipeline carry over
without modification.

**Per-NPC voice within private channel.** Same dependency as the audio
narration scope. Out of scope here.

**Selective transcript pruning.** Long campaigns may accumulate
substantial private journals. A GM tool to archive or prune old-session
entries could be useful eventually. Defer until a real volume problem
is observed.

**Pop-out window.** Foundry V14 introduces pop-out applications.
Private channel inherits this for free — the V14 compatibility pass
should verify the window pops cleanly to a second monitor. Add a brief
test case to the V14 verification batch when that work begins.

**Voice + threading.** When `!thread` lands, the private-channel
component will serve groups of players. The publish concept becomes
"synthesis card on close" instead of selective publishing. The audio
integration becomes per-participant voice rather than single-player.

**Multiple owned actors picker.** A player with multiple actors owned
under their user ID sees the first one selected automatically. A
picker on window open (or in the window header) for users with
multiple owned actors would be a small UX improvement.

**"GM is a full player" principle in decisions.md.** The packet
referenced this as the "session 5 architectural decision" but it is
not formally documented. The principle is operative in the code (no GM-
account dependency for narration, classifier, fact-continuity
correction, etc.) and worth capturing in `docs/decisions.md` as an
explicit entry. Useful for future scope authors who might inadvertently
introduce a GM-only path without realising the convention.

---

## Appendix A — File touch list

| File | Action |
|---|---|
| `src/private-channel/app.js` | new |
| `src/private-channel/context.js` | new |
| `src/private-channel/transcript.js` | new |
| `src/private-channel/publish.js` | new |
| `src/private-channel/index.js` | new |
| `src/index.js` | edit — import private-channel index, add the tool to `buildCompanionTools()` + a `renderSceneControls` `buttonMap` entry |
| `src/schemas.js` | no change (no new persistent fields; transient buffer is module-scoped) |
| `styles/private-channel.css` | new |
| `styles/starforged-companion.css` | edit — `@import "private-channel.css"` |
| `tests/unit/private-channel.test.js` | new |
| `src/help/helpJournal.js` | edit — add Private Channel entry, bump `CONTENT_VERSION` |
| `CHANGELOG.md` | edit |
| `docs/scope-index.md` | edit |
