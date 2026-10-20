# Narrator Memory Architecture

**Status:** ✅ shipped (Cluster A, branch `claude/optimistic-knuth-cgxai5`, 2026-06-10)
**Provenance:** v1.7.8 playtest findings **F6/F7/F8** (`docs/testing/v1.7.8-playtest-findings.md`)
— within ~30 minutes of play the campaign premise drifted across three axes
(location, motivation, stakes) because the fiction's load-bearing facts had no
durable home. The one fact that *was* ledgered held firm all session and was
actively defended by the consistency check. The thesis this architecture
implements:

> **Facts with homes get defended; facts without homes get rewritten.**

This document is the single reference for how narrator memory works, where
every byte of narrator context comes from, which knobs tune it, and what must
not be broken. Read it before changing anything in the narrator-context,
sidecar, or fact-continuity layers. Operational rules live in
`rules/narrator-memory.md`.

---

## 1. The model: four memory surfaces

Every narrator call assembles context from four surfaces. Each has different
durability, capacity, and write discipline:

| Surface | Durability | Written by | Read by | Capacity |
|---|---|---|---|---|
| **1. Recent-narration ring** | chat history (per session) | every narrator-prose card via flags; each entry is the player's line + the prose (issue #286 B5) | paced, @scene, oracle follow-ups, move narration (last 4, B1), session recap | last N cards (`narratorContextCards`, default 20, 1–50) |
| **2. Active-scene ledger** (truths + state + ship position) | scene-scoped; migrated at scene end | narrator sidecar (deterministic rules), `!truth`/`!state`, corrections | every narrator call (system prompt §6.5) | `factContinuity.maxLedgerTokens` soft cap (default 400) |
| **3. Scene frame** | scene-scoped; cleared at scene end | narrator sidecar (`sceneFrame` key, every response) | every narrator call (top of §6.5); scoping + relevance unions | ~30–60 tokens |
| **4. Entity records** (cards + generative tiers) | permanent | entity confirm flow, scene-end truth migration, tier updates | relevance resolver → ENTITIES IN SCENE cards | per-entity |
| **5. Rolling session summary** | session-scoped; archived to Session Log at End Session | Haiku regen from the full session card feed (player lines included), debounced at ~1.5×N, run after a narrator card posts — never inside a narration (issue #286 B7) | every non-meta narrator call (system prompt §[4c], ledger-wins caveat; a cached read) | ~≤320 tokens (Haiku-capped) |
| **6. Recent oracle results** (2026-07) | rolling ring on campaignState (cap 8; session-scoped read) | canonical-GM capture hook from the `oracleMemory` card flag | every non-meta narrator call (§[3b]) + the assembler's RECENT ORACLES section | last 5 lines |

Durable campaign context (world truths, sector, current location, character
state, World Journal injections) rides alongside these in the system prompt —
see `buildNarratorSystemPrompt` (`src/narration/narratorPrompt.js`) section
map `[0]`–`[10]`.

**Single assembly point.** Every narrator call — move resolution, paced,
`@scene`, oracle follow-up, vignette, inciting incident, campaign recap — builds
its system-prompt context through **`buildNarratorExtras(mode, campaignState,
opts)`** (`src/narration/narrator.js`). This is the one seam to extend when
adding context; do not hand-assemble `extras` at a call site. The packet is
uniform across modes — only two things legitimately vary, because they are not
"context" at all:

1. **Relevance** (entity cards + matched IDs) follows one rule with two arms:
   the move path uses the FULL resolver result it already computed (with the
   dynamic permission class + oracle seeds — data that only a move produces);
   every other mode resolves lexically (`resolveRelevance` with `moveId: null`,
   zero API cost). No-text modes (vignette/inciting/recap) match nothing and
   lean on the active-sector roster for their cast.
2. **Creative-latitude permission class** is also uniform but resolved one level
   up in `buildNarratorSystemPrompt`: `move_resolution`'s class is dynamic
   (passed in), and every other mode falls back to a per-mode default
   (`DEFAULT_PERMISSION_CLASS_BY_MODE` — paced→interaction, scene/oracle/
   vignette→embellishment, inciting→discovery). Meta modes (`campaign_recap`)
   carry no latitude block, no sidecar instruction, and no audio markup — their
   output is consumed verbatim, so a stray sidecar JSON block would leak.

### Data flow per turn

```
player input
   │
   ├─ resolvePathRelevance (paced/@scene; narrator.js)        [READ 4]
   │    lexical match over player text ∪ sceneFrame.present
   │    → ENTITIES IN SCENE cards + matchedEntityIds
   │
   ├─ buildNarratorSystemPrompt                                [READ 2+3]
   │    §6.5 ledger block: SCENE FRAME → TRUTHS → STATE → SHIP POSITION
   │    scope = matchedIds ∪ currentLocation ∪ scene ∪
   │            text-mentions in (player text ∪ frame.present)
   │
   ├─ user message = player text + ring(last N)                [READ 1]
   │
   ▼
narrator API call → prose + fenced JSON sidecar
   │
   ├─ extractSidecar (sidecarParser.js)
   ├─ applySidecar: truths/state, subjects resolved against the
   │    FULL entity roster (collectAllEntities) → entity-keyed   [WRITE 2]
   ├─ ship/position stateChanges → persistent ship record (§20)
   ├─ applySceneFrame: full-replacement snapshot                 [WRITE 3]
   ├─ card posted with narratorCard/narrationText/sessionId      [WRITE 1]
   └─ scene end: entity truths → generative tiers,
        text/scene truths → WJ Lore archive                      [WRITE 4]
```

---

## 2. Surface 1 — the recent-narration ring

`getRecentNarrationContext(sessionId, limit)` (`src/narration/narrator.js`)
selects chat messages by **`flags[MODULE].narratorCard === true`** and
matching **`sessionId`**, reads **`flags[MODULE].narrationText`**, joins the
last N with blank lines into the user message. Since issue #286 (B5) each
entry leads with the line the player wrote that prompted it — `PLAYER — Kira
wrote: "…"` (`playerText` + `playerName` on move and paced cards;
`sceneQuestion` + `playerName` on @scene answers; `ringEntryText`) — so a
detail only the player stated ("I give him my father's compass") survives.
Burn / Improve re-narrations store no player line (their input is a marker).
Move narration reads the last `MOVE_RING_CARDS` (4, bounded by
`narratorContextCards`) entries (B1); it used to read none.

**The flag-family contract.** Any card whose prose is *fiction the narrator
should remember* must carry all three flags:

| Card | Flags since | Notes |
|---|---|---|
| move narration (`postNarrationCard`) | always | also `resolutionId` (burn-supersede); `moveId` / `outcome` / `isMatch` (session recap); `playerText` / `playerName` (ring, #286) |
| paced narration (`postPacedNarrativeCard`) | always | `playerText` (also the NWMA Roll button's re-post) / `playerName` |
| @scene answers (`postSceneCard`) | Cluster A1 | keeps `sceneResponse` for chat-hook exclusions; `sceneQuestion` / `playerName` (ring, #286) |
| inciting incident (`postIncitingIncidentCard`) | Cluster A1 | `narrationText` is prose only (vow line stripped); fallback cards excluded |
| galley / end-session vignettes | 2026-06-15 | |
| vow-swearing scene (`narrateAndPostVowSwearing`) | 2026-07 | NARR-RING-VOWSCENE fix |
| clock vignettes (PtP / Begin Session / manual — all three post sites) | 2026-07 | NARR-RING-CLOCKVIG fix |
| oracle follow-up narration (`postOracleNarrationCard`) | 2026-07 | raw results additionally ledger via the `oracleMemory` flag → `campaignState.recentOracles` |

**Audited consumers of `narratorCard`** (re-audit when adding a card type —
CLAUDE.md "audit consumers" rule):
- ring (`getRecentNarrationContext`) — the point
- rolling session summary (`sessionNarratorCards` → `getRollingSessionSummary`)
  — shares the ring's source reader + defensive excludes; reads the full feed,
  not the last N
- rolling-summary refresh hook (`registerRollingSummaryRefreshHook`, issue
  #286 B7) — on the canonical GM, a new `narratorCard` with `narrationText`
  triggers the debounced regen after the card posts
- session recap (`postSessionRecap`) — inclusion intended; its move lines and
  "A match was rolled" read move narration's `moveId` / `outcome` / `isMatch`
  (`isMatch` had no writer until RECAP-MATCH-DEAD, issue #282)
- correction-dialog render hook (`src/index.js`) — no-ops without
  `[data-action="openCorrectionDialog"]` markup
- audio render hook (`src/index.js`) — no-ops without the hidden play-button
  markup
- burn supersede (`src/moves/burnMomentum.js`) — requires matching
  `resolutionId`, unaffected
- WJ contradiction cards co-mark `narratorCard` but are excluded by the
  ring's defensive filters

**Knob:** `narratorContextCards` (world, 1–50, default 20; Narrator pane).
@scene keeps its own `sceneContextCards`.

---

## 3. Surface 2 — the active-scene ledger

Storage: `campaignState.sceneTruths` (append-only with retraction markers) and
`campaignState.sceneState.bySubject` (supersede per subject+attribute). Logic:
`src/factContinuity/ledgers.js`. Rendered by `buildLedgerBlock`
(`src/narration/narratorPrompt.js`) into system-prompt section 6.5.

**Write discipline (Cluster A2).** The sidecar instruction
(`appendSidecarInstruction`) now *requires* emission — not at the model's
discretion — for:
- **stateChanges**: a named character's location / vessel / physical condition
  whenever prose establishes or changes them;
- **newTruths**: why a character is somewhere, what they want, what is at
  stake, deadlines.

`inciting_incident` mode appends a premise-capture addendum (vow target's
identity + history, location + condition, the deadline). This is what makes
the opening premise survivable.

**Subject resolution (Cluster A2; fixed by issue #286).** `applyNarratorSidecar`
passes the full entity roster (`collectAllEntities`,
`src/context/relevanceResolver.js`) into `applySidecar`, so "Vance" resolves
to an entity-keyed subject the moment Vance is a confirmed entity. Until
issue #286 this never happened in production: `resolveSubject` re-mapped the
roster from a `{ entityId }` shape it never received, so every entity subject
carried `entityId: undefined` and every entity's state shared the key `""`.
The roster now passes through unchanged and the subject's `entityId` is the
host document id. Names resolve through `resolveEntityName` — exact full name
→ full name after leading titles/articles → a multi-word full name after a
role title → one capitalised first/last name a single entity has — and
nothing else: an article ("The Covenant" ← "the dockmaster"), a title
("Captain Mora" ← "Captain Vance"), a shared name part or a lowercase common
noun never files a fact under an entity. Entity state keys are
`entity:<id>`. Unconfirmed names land as text subjects;
`promoteNewEntityLedgerSubjects` re-keys them to the new card's host id on
draft Confirm, on the make_a_connection auto-create and on the inciting
vow-target create.

**Scoping.** A ledger entry surfaces this turn when its subject is: the scene
itself; a free-text subject (an unrecorded figure or place — the ledger holds
only this scene, so these are always in scope since issue #286 B4; they used
to need their exact phrase in the player text or the frame, so "dock master"
missed "the dockmaster"); or a recorded entity in `matchedEntityIds` or the
current location. `matchedEntityIds` includes the recorded entities the scene
frame's `present` list names, on **every** path (`addSceneFrameCast` in
`buildNarratorExtras`, B3) — that is what keeps the active conversation
partner's card and facts in scope on turns like *"What does that even mean?"*
or *"I convince him"*.

**Drop order under budget pressure:** state, line by line — every other
attribute before a character's location / vessel / condition, the oldest
first within each (issue #286 A6) → (never) truths → (never) ship
position → (never) scene frame. Soft cap `factContinuity.maxLedgerTokens`.

---

## 4. Surface 3 — the scene frame

`campaignState.sceneFrame = { location, present[], situation, sceneId,
updatedAt }`. The narrator emits a **full-replacement snapshot** in every
sidecar (`sceneFrame` key); an omitted frame keeps the previous one. Applied
by `applySceneFrame` (`ledgers.js`); cleared by `startScene`/`endScene`
(`sceneLifecycle.js`). Rendered at the top of §6.5:

```
SCENE FRAME (the scene as it stands):
  Where:   Lyra's orbital graveyard
  Present: Venri Quint, Vance
  Now:     Hailing Vance's shuttle across the debris field
```

Two side effects beyond display:
1. `present` names are treated as mentioned for ledger scoping (§3).
2. `resolvePathRelevance` (paced/@scene) unions `present` into the lexical
   match text, so present entities keep their ENTITIES IN SCENE card every
   turn.

**Knob:** `factContinuity.sceneFrame` (world Boolean, default on; Fact
Continuity pane). Disabling removes the sidecar key, the block, and both
side effects in one switch.

---

## 5. Surface 4 — entity records on the non-move paths

Cluster A2.5: `narratePacedInput` and `interrogateScene` run
`resolvePathRelevance` → `resolveRelevance(matchText, null, null, state)`.
With `moveId = null` the resolver is **purely lexical** (the Haiku Phase-2
classifier only fires for hybrid *moves*) — zero API cost, single name-index
pass. Matched entities yield cards (section [6]) and `matchedEntityIds`
(ledger scoping + consistency-check context + sidecar entity resolution).

The move path's relevance **call** still doesn't union frame names (that
would alter narrator-permission class selection for hybrid moves; see §8).
Since issue #286 (B3) the scene frame's recorded cast joins the matched set
*after* relevance resolves, at the seam (`addSceneFrameCast`), on every path:
their cards and entity-keyed facts are in the prompt, the permission class and
the move's tier pass still follow the player's text alone.

**Write side (2026-06-15).** Paced narration now also *writes* to the entity
generative tier, not just reads cards from it. `narratePacedInput` schedules
`schedulePacedTierUpdate` → `appendGenerativeTierUpdates` for the in-scene
matched entities, mirroring the interaction-class move pass — so a Named NPC's
significant actions/developments in a conversation or roleplay scene accrue to
their card. Capture is salience-gated (`TIER_SALIENCE_FLOOR = "notable"`,
fail-open) and biased toward developments over trivia. Unnamed/uncarded figures
match nothing → no record → stay freely mutable, which the "name sparingly"
casting nudge (`NARRATOR_PERMISSIONS.discovery` + `appendSidecarInstruction`)
reinforces by keeping one-off functionaries unnamed. Decision: decisions.md →
"Named-NPC continuity".

---

## 6. Knobs (all world-scoped, Companion Settings panel)

| Setting | Default | Pane | Effect |
|---|---|---|---|
| `narratorContextCards` | 3 (1–10) | Narrator | ring depth for paced + oracle follow-ups; also sets the rolling-summary debounce K = round(1.5 × N) |
| `sceneContextCards` | (existing) | Narrator | ring depth for @scene answers |
| `narratorSessionSummary` | true | Narrator | maintain + render the rolling session summary (surface 5); archived to the Session Log at End Session |
| `factContinuity.enabled` | true | Fact Continuity | master switch: sidecar instruction + parse + ledger |
| `factContinuity.ledgerInContext` | true | Fact Continuity | §6.5 block injection |
| `factContinuity.sceneFrame` | true | Fact Continuity | frame emission + block + scoping/relevance unions |
| `factContinuity.maxLedgerTokens` | 400 | Fact Continuity | §6.5 soft cap (state lines shed first; location / vessel / condition last) |
| `factContinuity.consistencyCheck` | **true** (2026-07) | Fact Continuity | post-narration Haiku audit vs the full ledger block (frame, truths, retractions, state, ship) |

---

## 6.5 Token budgets — where the overhaul actually costs

**Output side (the one that can fail).** Every narrator call's `maxTokens` is
`base + SIDECAR_TOKEN_HEADROOM` (`narrator.js`; 500 since Cluster A, raised
from 300). The post-A sidecar on a heavy turn: required stateChanges
(~45–90) + stakes newTruths (~20–60) + sceneFrame (~50–75) + overhead (~25)
≈ **240–290 tokens**, and the inciting premise addendum can reach ~400.
Failure mode when headroom is too small: the fence is clipped mid-JSON,
`extractSidecar` strips it defensively (prose stays clean, parseError
logged) — and the turn loses its frame update and required emissions.
Since 2026-07 this is **never silent**: `callNarratorAPI` warns on
`stop_reason: "max_tokens"` (catching truncation before the fence even
opens) and `applyNarratorSidecar` warns when a response carries no fence at
all. `maxTokens` is a cap, not a target, so generous headroom costs nothing
unless used. If the truncation warnings appear in playtests, raise the
headroom further.

Per-site budgets: move/paced use `narrationMaxTokens + 500`; every other
mode passes `maxTokensWithSidecar(16000)` — deliberately far above any real
response so only the model's own length discipline governs.

**Input side (fine; two watch items).** Per-call additions from Cluster A:
scene frame block ~30–60; ENTITIES IN SCENE on paced/@scene ~50–150 per
matched card (typically 1–3 cards via frame-present union) — the largest
add, ≈ +100–450 input tokens ≈ $0.001–0.003/call at Sonnet rates; ring at
default 3 unchanged (each step toward 10 adds ~100–200). Total system
prompt typically grows ~5–15%; nowhere near any context-window concern.

Watch item — **ledger cap vs deterministic emission**: `maxLedgerTokens`
(400) only sheds *state*; truths/frame/corrections/ship render regardless.
Since 2026-07 `applySidecar` dedups truths (subject + normalised fact), so
re-anchoring no longer accretes duplicates — marathon growth now requires
genuinely distinct facts. A very long scene can still exceed the cap on
truths alone; backlog §8.8 keeps the elide option if playtests show it.
`!scene end` hygiene remains the designed pressure valve.

## 7. Tuning guide — symptom → layer

| Symptom in play | Look at | Fix direction |
|---|---|---|
| Narrator forgets something from a few cards ago (within scene) | ring depth | raise `narratorContextCards`; verify the card carrying the fact has the flag family (§2 table) |
| NPC's location / condition drifts | ledger writes | inspect `campaignState.sceneState.bySubject` — if empty, the required-emission rules aren't being honoured by the model; strengthen wording in `appendSidecarInstruction` before adding machinery |
| Premise / stakes drift | ledger truths | inspect `campaignState.sceneTruths`; if the inciting facts are missing, check the `inciting_incident` addendum fired (mode threading) |
| Whole-scene wobble: wrong place, wrong cast | frame | inspect `campaignState.sceneFrame`; if stale, the model is omitting the key — tighten the "EVERY response" rule or consider re-asserting the frame in the user message |
| Conversation partner forgotten on short turns | frame `present` + scoping | confirm the name appears in `present`; confirm `resolvePathRelevance` unioned it (matched cards in prompt) |
| Established entity facts not surfacing | entity records + scoping | is the entity confirmed? are its truths entity-keyed (not text)? did relevance match it? |
| Prompt too large / cost creep | budgets | lower `narratorContextCards` / `maxLedgerTokens`; frame is ~30–60 tokens and not the culprit |
| Contradiction slipped through anyway | consistency check | confirm `factContinuity.consistencyCheck` is on (default since 2026-07); it audits frame/truths/retractions/state/ship — it can only defend what the ledger holds, so fix emission first |
| Wrong fact got ledgered (canon inversion) | corrections | Correct-a-fact dialog / `!truth` — a bare Strike renders as a CORRECTED do-not-re-assert line, the write layer blocks narrator re-assertion, and the consistency check audits retractions (2026-07) |

**Live inspection one-liners** (browser console, GM):

```js
const cs = game.settings.get("starforged-companion", "campaignState");
cs.sceneFrame                          // current frame snapshot
cs.sceneTruths.filter(t => !t.retracted).map(t => t.fact)
cs.sceneState.bySubject                // per-subject state
game.messages.contents.filter(m =>
  m.flags["starforged-companion"]?.narratorCard).length   // ring feed size
```

---

## 8. Refinement backlog (next sessions)

Recorded so tuning starts where this round stopped — none of these are
regressions, all are known scope cuts:

1. **Vignette cards don't feed the ring. ✅ done.** Galley / end-session
   gained the family 2026-06-15; the vow-swearing scene, all three
   clock-vignette post sites, and oracle follow-up narrations joined
   2026-07 (NARR-RING-VOWSCENE / NARR-RING-CLOCKVIG). Every narrator
   fiction card now carries the family — see decisions.md → "Narrator
   context: the ledger actively defends".
2. **Move-path relevance doesn't union frame names.** Deliberate (it would
   change hybrid-move permission classification). The partner-forgotten
   symptom on moves is fixed without it (issue #286 B3): the frame's cast
   joins the matched set after classification (`addSceneFrameCast`), so
   cards and facts come back and the class does not move.
3. **Frame staleness — mitigation shipped (2026-07).** An omitted
   `sceneFrame` keeps the previous snapshot by design (idempotence,
   reaffirmed in decisions.md). The sketched mitigation is now live: the
   consistency check audits prose against the frame (plus retractions and
   ship position). The "confirm or update" user-message re-render stays a
   fallback idea if frame drift is still observed.
4. **Frame names → entity ids. ✅ done (issue #286 B3)**, at the seam rather
   than inside `buildLedgerBlock`: `addSceneFrameCast` resolves each present
   name with `resolveEntityName` and adds the entity to `matchedEntityIds`,
   so the card, the ledger scope, the consistency check and the sidecar
   context all see it.
5. **Cluster C shipped (2026-06-10); completed by the v1.7.10 F5 fixes
   (2026-06-12).** Ship-position sidecar emission is REQUIRED on ship
   movement, and every fiction-side position write moves the sector-scene
   Token (`syncCommandVehicleTokenToPosition`). The v1.7.10 playtest found
   the write path had never actually fired (updateShip was called with the
   record GUID instead of the Actor id; the name index read phantom
   `campaignState.settlements` arrays) and that nothing seeded an initial
   position. Now: a command-vehicle token on a sector scene is
   **authoritative** — `createToken`/`updateToken` hooks write the §20
   record from token coordinates (`updatedBy: "scene_token"`); programmatic
   syncs carry the `POSITION_SYNC_OPTION` update option so the hooks ignore
   the module's own moves; the inciting incident REQUIRES a starting
   `ship/position` emission; and an empty record renders an explicit
   *"SHIP POSITION: not yet established — do NOT assert or invent"* guard
   line instead of nothing (see decisions.md → "Ship position: a sector-map
   token is authoritative when present"). Remaining refinement: free-text
   positions still don't move the Token (no pin to anchor to) — the
   "position uncertain" Token badge stays the open idea.
6. **A4 escalation — rolling session summary. ✅ shipped (2026-06-15).** A
   maintained, session-scoped prose "story so far" that *complements* the
   verbatim ring (the original sketch's "replace last-N cards" was not taken —
   the ring carries phrasing the summary flattens). Summarised **from source**
   (the full session card feed, never summary-of-summary) via one Haiku call,
   **debounced at K = round(1.5 × N)** cards (N = `narratorContextCards`), so
   most turns are a free cached read. Stored on `campaignState.sessionSummary`
   (keyed by `sessionId`), rendered as system-prompt §[4c] *STORY SO FAR (THIS
   SESSION)*, and written to the World Journal Session Log at End Session for
   subsequent use. GM-gated + fail-open; toggle `narratorSessionSummary`
   (default on). Drop priority + the "not a fact store" invariant: decisions.md
   → "Rolling session summary: a debounced trailing memory tier".
7. **Pacing interaction (F9) — shipped (Cluster D, 2026-06-10).** The
   pacing classifier now receives the scene frame in its context (the
   established-stakes signal) and carries a MOVEMENT WITH STAKES rule plus
   category definitions, so hazardous/time-pressured travel nominates
   `set_a_course` / `undertake_an_expedition` / `face_danger` instead of
   resolving as free narration. The frame is now read by five consumers:
   ledger scoping, paced/@scene relevance, the §6.5 block, the consistency
   check, and the pacing classifier.
8. **Truth eliding for marathon scenes.** Truths are never dropped (§6.5
   watch item), so a scene that runs very long grows the ledger block past
   the soft cap. If playtests show it: elide oldest-first beyond the cap
   with a `(+N earlier truths recorded — end the scene to archive them)`
   line, keeping retraction-defended truths verbatim. Prefer nudging scene
   hygiene first — `!scene end` migration is the designed pressure valve.

## 9. Verification checklist for the next playtest

- [ ] Inciting incident: a scene is ACTIVE (`cs.currentSceneId` set by the
      inciting call — 2026-07); `cs.sceneTruths` contains target NPC identity /
      history / stakes / deadline; `sceneState` has their location+condition;
      `cs.sceneFrame` populated — and all of it SURVIVES the first move
      (which continues the scene instead of implicitly ending it). Recap
      card includes the incident.
- [ ] End Session closes the scene (truths migrated, `currentSceneId`
      null); a 4h-gap reload re-mints the session AND closes any stale
      scene (`session_gap_remint` in the console).
- [ ] `!oracle yes` → the answer renders under RECENT ORACLE RESULTS on the
      next narrator call; the narration does not contradict it.
- [ ] Strike a truth → it renders under CORRECTED and the narrator does not
      re-assert it; a narrator sidecar re-emitting it is blocked at the
      write (console debug).
- [ ] Challenge an NPC about an established fact → narrator holds the line
      (F7 repro inverted).
- [ ] Ask a no-name follow-up ("what does that mean?") → partner's card +
      state still in prompt (verify via response quality / console).
- [ ] `@scene` answer fact referenced two cards later survives.
- [ ] Scene end: truths migrated (entity tiers / WJ Lore), frame cleared.
- [ ] Telemetry: ring depth setting honoured (prompt size shifts with it).
