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
| **1. Recent-narration ring** | chat history (per session) | every narrator-prose card via flags | paced, @scene, oracle follow-ups, session recap | last N cards (`narratorContextCards`, default 3) |
| **2. Active-scene ledger** (truths + state + ship position) | scene-scoped; migrated at scene end | narrator sidecar (deterministic rules), `!truth`/`!state`, corrections | every narrator call (system prompt §6.5) | `factContinuity.maxLedgerTokens` soft cap (default 400) |
| **3. Scene frame** | scene-scoped; cleared at scene end | narrator sidecar (`sceneFrame` key, every response) | every narrator call (top of §6.5); scoping + relevance unions | ~30–60 tokens |
| **4. Entity records** (cards + generative tiers) | permanent | entity confirm flow, scene-end truth migration, tier updates | relevance resolver → ENTITIES IN SCENE cards | per-entity |

Durable campaign context (world truths, sector, current location, character
state, World Journal injections) rides alongside these in the system prompt —
see `buildNarratorSystemPrompt` (`src/narration/narratorPrompt.js`) section
map `[0]`–`[10]`.

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
last N with blank lines into the user message.

**The flag-family contract.** Any card whose prose is *fiction the narrator
should remember* must carry all three flags:

| Card | Flags since | Notes |
|---|---|---|
| move narration (`postNarrationCard`) | always | also `resolutionId` (burn-supersede) |
| paced narration (`postPacedNarrativeCard`) | always | |
| @scene answers (`postSceneCard`) | Cluster A1 | keeps `sceneResponse` for chat-hook exclusions |
| inciting incident (`postIncitingIncidentCard`) | Cluster A1 | `narrationText` is prose only (vow line stripped); fallback cards excluded |
| galley / end-session vignettes | **not yet** — see §8 backlog | |

**Audited consumers of `narratorCard`** (re-audit when adding a card type —
CLAUDE.md "audit consumers" rule):
- ring (`getRecentNarrationContext`) — the point
- session recap (`postSessionRecap`) — inclusion intended
- correction-dialog render hook (`src/index.js`) — no-ops without
  `[data-action="openCorrectionDialog"]` markup
- audio render hook (`src/index.js`) — no-ops without the hidden play-button
  markup
- burn supersede (`src/moves/burnMomentum.js`) — requires matching
  `resolutionId`, unaffected
- WJ contradiction cards co-mark `narratorCard` but are excluded by the
  ring's defensive filters

**Knob:** `narratorContextCards` (world, 1–10, default 3; Narrator pane).
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

**Subject resolution (Cluster A2).** `applyNarratorSidecar` passes the full
entity roster (`collectAllEntities`, `src/context/relevanceResolver.js`) into
`applySidecar`, so "Vance" resolves to an entity-keyed subject the moment
Vance is a confirmed entity. Unconfirmed names land as text subjects;
`promoteTextSubject` rewrites them on entity promotion.

**Scoping.** A ledger entry surfaces this turn when its subject is: the scene
itself; in `matchedEntityIds`; the current location; **or** name-mentioned in
the player text **or the scene frame's `present` list** (Cluster A4). The
frame is what keeps the active conversation partner in scope on turns like
*"What does that even mean?"*

**Drop order under budget pressure:** state → (never) truths → (never) ship
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

The **move path is unchanged** this round: its relevance call doesn't union
frame names (changing it would alter narrator-permission class selection for
hybrid moves). See §8.

---

## 6. Knobs (all world-scoped, Companion Settings panel)

| Setting | Default | Pane | Effect |
|---|---|---|---|
| `narratorContextCards` | 3 (1–10) | Narrator | ring depth for paced + oracle follow-ups |
| `sceneContextCards` | (existing) | Narrator | ring depth for @scene answers |
| `factContinuity.enabled` | true | Fact Continuity | master switch: sidecar instruction + parse + ledger |
| `factContinuity.ledgerInContext` | true | Fact Continuity | §6.5 block injection |
| `factContinuity.sceneFrame` | true | Fact Continuity | frame emission + block + scoping/relevance unions |
| `factContinuity.maxLedgerTokens` | 400 | Fact Continuity | §6.5 soft cap (state drops first) |
| `factContinuity.consistencyCheck` | false | Fact Continuity | post-narration Haiku audit vs ledger |

---

## 6.5 Token budgets — where the overhaul actually costs

**Output side (the one that can fail).** Every narrator call's `maxTokens` is
`base + SIDECAR_TOKEN_HEADROOM` (`narrator.js`; 500 since Cluster A, raised
from 300). The post-A sidecar on a heavy turn: required stateChanges
(~45–90) + stakes newTruths (~20–60) + sceneFrame (~50–75) + overhead (~25)
≈ **240–290 tokens**, and the inciting premise addendum can reach ~400.
Failure mode when headroom is too small: the fence is clipped mid-JSON,
`extractSidecar` strips it defensively (prose stays clean, parseError
logged) — and the turn **silently loses its frame update and required
emissions**. `maxTokens` is a cap, not a target, so generous headroom costs
nothing unless used. **Watch for** `"truncated by maxTokens"` warnings in
the console during playtests; if they appear, raise the headroom further.

Per-site totals (base + 500): @scene 700 · oracle follow-up 720 · paced/move
`narrationMaxTokens`+500 (800 at default) · vignettes 880 · inciting 980.

**Input side (fine; two watch items).** Per-call additions from Cluster A:
scene frame block ~30–60; ENTITIES IN SCENE on paced/@scene ~50–150 per
matched card (typically 1–3 cards via frame-present union) — the largest
add, ≈ +100–450 input tokens ≈ $0.001–0.003/call at Sonnet rates; ring at
default 3 unchanged (each step toward 10 adds ~100–200). Total system
prompt typically grows ~5–15%; nowhere near any context-window concern.

Watch item — **ledger cap vs deterministic emission**: `maxLedgerTokens`
(400) only sheds *state*; truths/frame/ship render regardless. Required
emission accumulates truths faster, so a long scene that never ends
(`!scene end` hygiene) can exceed the cap on truths alone (~20 truths ≈
400). Not a correctness failure — the block just runs over the soft cap —
but it's the mechanism by which prompts grow in marathon scenes. Backlog
§8.8 covers the elide option if playtests show it.

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
| Contradiction slipped through anyway | consistency check | enable `factContinuity.consistencyCheck`; it can only defend what the ledger holds — fix emission first |
| Wrong fact got ledgered (canon inversion) | corrections | Correct-a-fact dialog / `!truth` — the retraction defends against re-assertion |

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

1. **Vignette cards don't feed the ring.** Galley / end-session vignettes
   post without the flag family. Same one-line-shaped fix as A1 once their
   prose is judged ring-worthy (they're mood pieces; recap inclusion is the
   real question).
2. **Move-path relevance doesn't union frame names.** Deliberate (it would
   change hybrid-move permission classification). If move narration shows the
   partner-forgotten symptom, extend `narrateResolution`'s internal
   `resolveRelevance` call with the same union, but audit the hybrid
   `interaction`-vs-Phase-2 implications first.
3. **Frame staleness.** An omitted `sceneFrame` keeps the previous snapshot
   by design (idempotence), which means a model that stops emitting frames
   keeps a slowly-staling one. If observed: have the consistency check audit
   prose against the frame, or re-render the previous frame into the user
   message as "confirm or update".
4. **Frame names → entity ids inside `buildLedgerBlock`.** Present-name
   scoping is text-based at render time; entity-keyed entries for present
   NPCs are covered via the relevance union instead. If a case appears where
   an entity-keyed entry has no card match and no mention, bridge by
   reverse-resolving frame names against the roster inside the block builder.
5. **Cluster C shipped (2026-06-10).** Ship-position sidecar emission is
   now REQUIRED on ship movement, and every fiction-side position write
   moves the sector-scene Token (`syncCommandVehicleTokenToPosition`).
   Remaining refinement: free-text positions don't move the Token (no pin
   to anchor to) — a "position uncertain" Token badge is the open idea if
   playtests want the map to signal approximate positions.
6. **A4 escalation — rolling compressed scene summary.** If frame + ledger +
   deeper ring still lose long multi-scene threads, the next step is a
   maintained prose summary (one Haiku call per N turns), replacing raw
   last-N cards. Don't build it until a playtest shows the cheaper layers
   failing.
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

- [ ] Inciting incident: `cs.sceneTruths` contains target NPC identity /
      history / stakes / deadline; `sceneState` has their location+condition;
      `cs.sceneFrame` populated. Recap card includes the incident.
- [ ] Challenge an NPC about an established fact → narrator holds the line
      (F7 repro inverted).
- [ ] Ask a no-name follow-up ("what does that mean?") → partner's card +
      state still in prompt (verify via response quality / console).
- [ ] `@scene` answer fact referenced two cards later survives.
- [ ] Scene end: truths migrated (entity tiers / WJ Lore), frame cleared.
- [ ] Telemetry: ring depth setting honoured (prompt size shifts with it).
