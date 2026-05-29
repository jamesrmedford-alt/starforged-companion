# Session Lifecycle — Scope

**Status:** ✅ COMPLETE (shipped v1.6.0)

Ships the Session Panel, the begin-session narration gate, and the begin/end
vignettes. The five session moves from the play kit (Begin a Session, End a
Session, Set a Flag, Change Your Fate, Take a Break) get a single button-driven
panel and keep their chat-command equivalents.

---

## Overview

Before v1.6.0 the module narrated and interpreted moves the moment any
qualifying chat message arrived. v1.6.0 introduces an explicit **session gate**:
play does not begin until the GM presses **Begin Session**.

- `campaignState.sessionActive` (boolean, default `false`) is the gate.
- The gate sits at the top of the `createChatMessage` hook in `src/index.js`
  (right after the canonical-GM check). Pre-session, plain typed narration just
  lands as a normal chat message — the pacing classifier, paced narrator, and
  implicit move pipeline are all skipped.
- What still works pre-session: every chat command predicate (`!recap`,
  `!sector`, `!x`, `!at`, `!journal`, `@scene`, `!oracle yes`, `!pay-the-price`,
  `!truth`, …) **and** every chat-card affordance (X-Card, draft Confirm/Dismiss,
  Refresh recap). The gate only suppresses the *implicit* path.

---

## How it works

### State machine — `src/session/lifecycle.js`

Three primitives plus a clock helper, deliberately isolated from the index.js
chat surface so the panel and the Quench batch can drive them directly:

| Export | Behaviour |
|--------|-----------|
| `isSessionActive(campaignState)` | Read-only; `=== true`. Defaults to `false` on a fresh world. |
| `beginSession(campaignState)` | Flips the gate on, stamps `sessionActiveStartedAt`. Idempotent (stable timer across double-clicks). |
| `endSession(campaignState)` | Flips the gate off, clears the stamp. Self-heals a half-broken packet (stamp set but flag false). |
| `sessionMinutesActive(campaignState, now?)` | Minutes since start, for the panel badge. `0` when inactive. |

These only mutate the in-memory packet; the **caller persists**. Writes are
GM-only because `campaignState` is world-scoped. End Session marks the *active*
state only — the `sessionNumber` / `currentSessionId` cohort is still managed by
`initSessionId()` (world ready + 4h gap), not here.

### Dialogs and panel

- `src/safety/sessionLifecycleDialogs.js` — `openBeginSessionDialog` /
  `openEndSessionDialog`. These own the state flips, so chat-command invocation,
  panel-button invocation, and end-of-world cleanup all share one path.
- `src/safety/sessionDialogs.js` — Set a Flag / Change Your Fate / Take a Break.
- `src/ui/sessionPanel.js` — the 🎮 Session Panel (ApplicationV2), opened by the
  `sfSession` toolbar button. Status badge shows active/inactive and minutes;
  Begin is disabled when already active, End when inactive.

### Vignettes

| Vignette | File | Behaviour |
|----------|------|-----------|
| Galley (Begin) | `src/session/galleyVignette.js` | Active PCs in the ship's galley joking absurdly about what the absent crewmates are doing. Active vs absent split by `User.active` (the GM counts as a player). Tone forced to **wry + absurd** regardless of the configured tone. |
| End | `src/session/endSessionVignette.js` | A currently-important NPC doing something mundane (the cosmic threat eating a sandwich). NPC selection priority: bonded connection → high-rank connection → active threat → any connection → sector trouble → generic fallback. Uses the `session_vignette` narrator mode with `FLAVOUR=END` (wry-observed). |

Both reuse the `session_vignette` mode (`narratorPrompt.js`) and the
`sessionVignette` oracle seed table. They **silently skip** if no Claude key is
configured — never blocking the session state change.

---

## Chat commands

The panel is the button-driven alternative; all five moves remain in chat:

| Command | Effect |
|---------|--------|
| `!begin-session` | Begin Session dialog (flips gate on, galley vignette) |
| `!end-session` | End Session dialog (flips gate off, NPC vignette) |
| `!flag` | Set a Flag dialog |
| `!fate` | Change Your Fate dialog |
| `!break` | Take a Break dialog |

There is no `!session` command — the panel is toolbar-only.

---

## Tests

- `tests/unit/sessionLifecycle.test.js` — state machine, idempotency, half-broken
  packet self-heal, `sessionMinutesActive` clock math.
- Quench live coverage drives the gate and panel against a real world.

## Related

- Narrator modes and the vignette role: `../narrator/narrator-scope.md`.
- Session ID cohort tracking: `../foundations/foundations-scope.md`.
