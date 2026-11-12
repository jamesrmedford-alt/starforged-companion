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
| **4. Entity records** (cards + generative tiers + last known whereabouts) | permanent | entity confirm flow, scene-end truth migration (entity truths; scene truths onto the recorded place each was asserted at — #286 C2, #326 D2), tier updates, scene-end `lastKnown` (#286 C1) | relevance resolver + the frame's cast → ENTITIES IN SCENE cards; current location card | per-entity (10 tier lines on the card) |
| **5. Rolling session summary** | session-scoped; archived to Session Log at End Session; kept as `previousSessionSummary` when the next session is minted (issue #286 C3) | Haiku regen from the full session card feed (player lines included), debounced at ~1.5×N, run after a narrator card posts — never inside a narration (issue #286 B7); brought up to date before a session that went idle is closed | every non-meta narrator call (system prompt §[4c], ledger-wins caveat; a cached read) — this session's as STORY SO FAR, the one before as LAST SESSION | ~≤320 tokens each (Haiku-capped) |
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
A Batch Mode round card leads with one such line per acting entry, in order,
from its `roundEntries` (issue #340).
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
| clock vignettes (PtP / Begin Session / manual — all three post sites) | 2026-07 | NARR-RING-CLOCKVIG fix; a trigger vignette also names its clock (`clockId`, issue #338 D8); its narration runs the canonical GM's tier pass for the recorded entities it names (`narrateClockAdvancement` → `scheduleNarrationCapture`, issue #345 AA33) |
| oracle follow-up narration (`postOracleNarrationCard`) | 2026-07 | raw results additionally ledger via the `oracleMemory` flag → `campaignState.recentOracles` |
| Batch Mode round card (`postRoundNarrationCard`) | 2026-11 (#340) | `roundId`, `roundNumber`, `roundEntries: [{ userId, actorId, playerName, playerText, moveId, outcome, isMatch, resolutionId }]` — the players who acted and no one else; its own `moveId` / `outcome` / `resolutionId` stay empty. The round's result cards carry `roundId` too. Its fallback (`postRoundFallbackCard`) keeps the family with `narrationFallback`; the X-Card's paused notice (`narrationPaused`) is not a narrator card |
| published Private Channel reflection (`publishToMainChat`) | 2026-10 (#286 D1) | the published text only; `publishedReflection` also triggers the canonical GM's tier pass (`registerPublishedReflectionHook`), which stamps the card's `narrationId` on the details it records (issue #335 Y03). No sidecar, so no ledger facts |

Every card above also carries its narration's `narrationId` — the id its
sidecar stamps on the ledger entries it writes (§3; issue #321 U07) and its
capture on what it records (issue #329 X01); a published reflection, which
has no sidecar, carries one for its capture (issue #335 Y03).
The move narration's "narration unavailable" card (`postFallbackCard`) keeps
the family so the session recap counts the move, and is marked
`narrationFallback`, which every memory read leaves out (issue #321 U35 — it
was fed back as story and counted as the session's first narration).

**Audited consumers of `narratorCard`** (re-audit when adding a card type —
CLAUDE.md "audit consumers" rule):
- ring (`getRecentNarrationContext`) — the point
- rolling session summary (`sessionNarratorCards` → `getRollingSessionSummary`)
  — shares the ring's source reader + defensive excludes (since issue #321
  also `narrationFallback`, U35, and `xCarded`, U07); reads the full feed,
  not the last N
- rolling-summary refresh hook (`registerRollingSummaryRefreshHook`, issue
  #286 B7) — on the canonical GM, a new `narratorCard` with `narrationText`
  triggers the debounced regen after the card posts
- session recap (`postSessionRecap`) — inclusion intended; reads
  `sessionNarratorCards(sessionId, { forRecap: true })`: the narrator's
  excludes (a burned move's superseded prose among them) except that a
  fallback card and an X-carded card stay — their moves count, their lines are
  not quoted (issue #321 U07). Its move lines and "A match was rolled" read
  move narration's `moveId` / `outcome` / `isMatch` (`isMatch` had no writer
  until RECAP-MATCH-DEAD, issue #282); "moves resolved" counts only the cards
  with a `moveId`, and `!recap session N` finds session N by the cards'
  `sessionNumber` (`recapSessionFor`). It filtered the cards itself: a burned
  Strike listed its superseded miss, every card counted as a move, and N was
  dropped (issue #322 V05). A round card counts each of its `roundEntries`'
  moves, outcomes and matches ("Round N: Move → Outcome"), its fallback too
  (issue #340)
- the campaign recap's session-start gate (`sessionStartRecap`, issue #286
  C3) — the recap goes to the session's first narration: no card
  `sessionNarratorCards` keeps yet, save a published reflection — canon, but
  not a narration; published first, it took the narration's recap (issue
  #345 AA32)
- correction-dialog render hook (`src/index.js`) — no-ops without
  `[data-action="openCorrectionDialog"]` markup
- audio render hook (`src/index.js`) — no-ops without the hidden play-button
  markup, and on an X-carded card (issue #321 U07)
- the X-Card (issue #321 U07): `xCardedNarrationCards` picks the cards a play
  removes from `sessionNarratorCards` (the newest still in memory and its
  beat), and `registerXCardRedirectHook` (canonical GM) clears
  `xCardRedirect` when the first narrator card with `narrationText` posts
  with the X-Card lifted — not a fallback, a published reflection or an
  X-carded card. A round card is one beat: the walk back from the newest card
  stops at a card of another round — round submissions are not chat messages,
  so without that stop it took the previous round's card within the beat's
  two minutes (issue #340). The pick reads the chat as it was — the messages
  deleted since this page loaded put back by time (`chatAsItWas`, fed by
  `registerDeletedChatHook`) — so a narration whose card a GM deleted is
  still the one an X-Card removes, with what it wrote, and the kept beat
  before it is left alone (issue #347 AB22); the canonical GM keeps the
  newest twenty of those the pick reads on campaignState
  (`deletedChatMessages`, no text kept — a session mint lets them go,
  DELETED-MESSAGES-KEPT), so the pick survives a reload, and a
  deleted card an X-Card removed is marked there (issue #347 residual
  DELETED-NARRATION-MEMORY-PAGE-ONLY); a deletion alone forgets nothing
- burn supersede (`src/moves/burnMomentum.js`) — requires matching
  `resolutionId`, unaffected; it flags the card `burnSuperseded`, which
  `sessionNarratorCards` leaves out (ring, summary, recap), after dropping a
  rolling summary already made from it (`dropSummaryOfSupersededCards`, the
  X-Card's covered-index rule — the debounce's count did not move, issue #345
  AA24). Since issue #338
  D8 a Burn Momentum / Improve Result that rewinds a clock out of its trigger
  flags that clock's newest live trigger vignette of the session (found by
  its `clockId`) the same way (`resultUpgrade.js` supersedeTriggerVignettes),
  and both narrations' ledger entries are retracted by their `narrationId`
  (§3). A vignette still being written then never posts: it is narrated only
  while its clock is still full when its reply comes in (`stillTriggered`,
  TRIGGER-VIGNETTE-LATE-POST), so its sidecar is never applied. The
  re-narration names the resolution it upgraded (`upgradeOf`) and a struck
  vignette names it too (`supersededFor`): an X-Card on the re-narration
  takes the struck narrations with its beat — capture undone, superseded
  truths relabelled `xcard` (issue #347 D2)
- burn supersede never matches a round card: a round's upgrades are decided
  before it is narrated, and the card's `resolutionId` is empty (issue #340)
- the Chronicle (`scheduleChronicleEntry`) writes one entry per round, kind
  `round`, which the writer's prompt knows (issue #340); every entry the
  scribe writes carries its narration's `narrationId`, so the X-Card's finish
  removes it (`retractNarrationChronicle`) and a scribe still running when
  the card lands writes nothing (XCARD-CHRONICLE); a strike deletes the
  session's automatic entries that state the struck fact
  (`propagateRetraction` → `retractStruckChronicle`, STRIKE-CHRONICLE)
- WJ contradiction cards co-mark `narratorCard` but are excluded by the
  ring's defensive filters
- the Private Channel's own scene context (`getRecentNarrationContext`, last
  3) — a published reflection shows there too
- the Batch Mode Round window's "Latest narration" (`src/ui/roundWindow.js`
  `newestNarration`, issue #340) — the session's newest narrator card that is
  no fallback, not burn-superseded and not X-carded: by the card's `xCarded`
  flag and by the stored `xCardedNarrationIds` (`isNarrationXCarded`), which
  the X-Card's pause write names before the flag lands; its `refresh`
  compares the narration as well as the view (issue #342 Z32)

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
the opening premise survivable. The premise (`campaignState.incitingIncident`)
is written with the narration's scene ledgers onto the store as it is then
(`persistSceneLedgerFields(…, { onto })`), never the pre-call snapshot whole —
that reverted Private Lines, a safety flag or an X-Card relayed during the
call (issue #321 U06d). The premise carries its narration's `narrationId`, so
an X-Card on the inciting card drops it in the pause's write
(XCARD-INCITING-PREMISE).

**Narration ids and the X-Card (issue #321 U07).** Every truth and state value
a sidecar writes, and the frame, carries the narration's `narrationId` (its
card carries the same id). The X-Card retracts what the narration it answers
wrote (`retractNarrations`): its truths `retractedBy: "xcard"` — rendered
nowhere, not even under CORRECTED, never migrated, still blocking a
re-assertion — for the rest of the session: a scene end keeps them unnamed
on `sessionRetractions.blocked`, which `findSessionStrike`'s write half reads
(XCARD-RETRACTION-SCENE-SCOPED), and keeps its live narration truths on
`sessionRetractions.narrated`, which an X-Card on a narration whose scene has
ended moves there (XCARD-ENDED-SCENE-TRUTHS-UNBLOCKED) — its superseded ones
too, so the narration a Burn Momentum / Improve Result struck is blocked by an
X-Card on the upgraded beat after the scene ended (issue #347 residual XCARD-STRUCK-FACTS-AFTER-SCENE-END); a truth the table had already struck is
relabelled the X-Card's and its kept `sessionRetractions` entry moved to
those blocks, so neither CORRECTED nor the summary's leave-out list names it
and `!truth set` cannot lift it (XCARD-AFTER-STRIKE-STILL-NAMED) — its state values removed (each restoring the value it
superseded: a state entry keeps a bounded `previous` chain, issue #326 W41)
and its frame giving way to the frame it replaced (the frame keeps the same
bounded chain — issue #345 D3; it used to be cleared), in the same
write as the pause; the ids are kept on `xCardedNarrationIds`, so
`mergeSceneLedgers` retracts them again from a stale writer's copy and a late
relayed sidecar of that narration is dropped. What the narration's capture
(the detection and tier passes) recorded carries the same id — World Journal
entries (with the versions they replaced; a faction the draft routing
surfaces, issue #335 Y02), Session Log beats, tier details (one the GM had
promoted takes the line its Promote added to the notes with it, issue #338
D7), a placeholder figure's rename (the X-Card puts the placeholder name back), the draft card
it queued (its pending rows are withdrawn, issue #338 D6(i)), a connection a
Make a Connection hit auto-created (deleted with its bond and its portrait while unused, else
kept and named to the GMs — D6(ii); one the hit confirmed from an earlier
narration's pending draft row too, the row going back to pending —
MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED),
and the state transitions it applied to existing entries (a faction's stance
on its record included) — and the X-Card's finish undoes it by id
(`retractNarrationCapture`, issue #329 X01; XCARD-CAPTURE-TRANSITIONS). What
the capture had not written yet when the card was played it never writes:
each capture write checks the stored `xCardedNarrationIds` first
(`isNarrationXCarded`, `safety.js` — the passes on entry and when their Claude
reply returns, the routers before each write; XCARD-LATE-CAPTURE). So
does what a scene end migrated from the narration's ledger entries before the
card was played (issue #335 Y01 — the pick is session-scoped, the ledger is
empty by then): the tier detail, the archived Lore page and the LAST KNOWN
value, which keeps the values it superseded and falls back to the newest one
no removed narration set. A scene end still running when the card is played
checks it right before each of those writes, and takes back a copy written as
the card landed (XCARD-DURING-SCENE-END-MIGRATES).

**Narration ids and an upgrade (issue #338 D8).** A Burn Momentum or Improve
Result retracts the ledger entries of the narrations it supersedes — the move
narration it replaces, and the trigger vignette of a clock its reversal
rewinds — by their `narrationId`, through the same `retractNarrations` with
`{ by: "superseded" }` (`resultUpgrade.js` retractSupersededNarrations, on the
canonical GM, merged onto the latest store, and on the upgrade's working copy,
which its re-narration applies its sidecar to). A superseded truth is
rendered nowhere and never named under CORRECTED, like an X-carded one, but it
blocks nothing: the re-narration of the upgraded outcome — or the clock's next
trigger — may state the same fact, and it is recorded live. A scene end keeps
it, unnamed, on `sessionRetractions.narrated` (blocking nothing), so an X-Card
on the upgraded beat after the scene ended still blocks it (issue #347 residual XCARD-STRUCK-FACTS-AFTER-SCENE-END).
Only the ledgers:
what the superseded narration's capture recorded stands, and no id list keeps
a stale writer from writing its state back (the accepted no-baseline merge).

**Scene start.** A narration whose snapshot holds no scene while the store has
one continues it (`startScene` → `adoptStoredScene`, issue #321 U06f): the
move pipeline's snapshot predates its confirm dialog, and a second scene was
minted over the live one's ledgers, which were neither kept nor archived.
Oracle follow-ups, session and clock vignettes and vow scenes start a scene
when none is active, as move, paced and `@scene` narration do
(`ensureSceneStarted`, canonical GM — issue #321 U34; their facts landed
under no scene), and so does a `!truth set` / `!state set` (issue #326 W59).
Scene starts run one at a time on the GM: a start waits for the one in
flight, then adopts it — two narrations one command fires, each on its own
working copy, minted two scenes inside the first start's write round trip,
and the loser's facts were dropped (issue #335 Y05). Begin's galley vignette
follows its clock vignettes, and `!pay-the-price`'s oracle follow-up its
trigger vignette, each reading its copy once the one ahead is done.

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
by `applySceneFrame` (`ledgers.js`), which keeps the frames of the scene it
replaces as a bounded `previous` chain (never rendered), so an X-Card on a
narration puts back the frame its narration replaced (issue #345 D3);
cleared by `startScene`/`endScene` (`sceneLifecycle.js`). Rendered at the top of §6.5:

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
"Named-NPC continuity". A Batch Mode round's narration is both kinds at once:
its tier pass takes each entry by its free-flow rule — an unrolled action the
prompt's matched set (as paced), a rolled interaction-class move its own
relevance (as the move pass) — whatever the round's widest class
(`roundTierRefs`, issue #342 Z10).

---

## 6. Knobs (all world-scoped, Companion Settings panel)

| Setting | Default | Pane | Effect |
|---|---|---|---|
| `narratorContextCards` | 20 (1–50) | Narrator | ring depth for paced + oracle follow-ups (move narration takes the last 4, bounded by it — issue #286 B1); also sets the rolling-summary debounce K = round(1.5 × N) |
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
logged) — and the turn loses its frame update and required emissions. A
fence cut only in its closing backticks, around a complete object, is
applied; and the sidecar is read from a ```` ```json ````, ```` ``` json ````
or bare ```` ``` ```` fence whose body is an object, never shown as prose
(issue #321 U41).
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

**Measure before re-layout** (issue #286 F6 step 1). `callNarratorAPI` logs
every call's usage — uncached input, cache reads, cache writes, output — and
elapsed time to the Pacing Telemetry journal's "Narrator Usage" page, labelled
with the narrator function that made it; the page leads with the cache-read
share of prompt tokens and the median time per call. The whole system prompt
is one cached block that changes every turn, so the expectation is a share
near zero: that measurement is what the proposed tier layout (cached campaign
canon and memory first, per-turn data last — issue #287, from #286 §F) is judged against.

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
| Wrong fact got ledgered (canon inversion) | corrections | Correct-a-fact dialog / `!truth` — a bare Strike renders as a CORRECTED do-not-re-assert line (for the rest of the session since #286), the write layer blocks narrator re-assertion, the consistency check audits retractions (2026-07), and the strike reaches the tier, lore and summary copies of the fact (`propagateRetraction`, #286 B6) |

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
   record from token coordinates (`updatedBy: "token_placement"`, read
   "near" — it was `scene_token`, read "docked at", issue #321 U53;
   `scene_token` is now the Set a Course arrival a drop on a pin starts; and
   a token placed on a new sector's map records a position only for a ship
   that has none, U47); programmatic
   syncs carry the `POSITION_SYNC_OPTION` update option so the hooks ignore
   the module's own moves; the inciting incident REQUIRES a starting
   `ship/position` emission; and an empty record renders an explicit
   *"SHIP POSITION: not yet established — do NOT assert or invent"* guard
   line instead of nothing (see decisions.md → "Ship position: a sector-map
   token is authoritative when present"). A charted site's pin anchors the
   position like a settlement's, both ways — the token parked on it records
   the site's location (`nearestLocationId`), and a record naming a location
   moves the token onto its site pin (issue #335 Y14). Every record a writer
   builds carries every key — `narrationId` and `previous` too, null unless a
   narration's move set them — because `updateShip` writes through `setFlag`,
   which merges into the stored record key by key: a narrator move's id
   outlived a later `!at` or token move, and an X-Card then reverted that
   move (SHIP-POSITION-FLAG-MERGE). Remaining refinement:
   free-text positions still don't move the Token (no pin to anchor to) — the
   "position uncertain" Token badge stays the open idea.
6. **A4 escalation — rolling session summary. ✅ shipped (2026-06-15).** A
   maintained, session-scoped prose "story so far" that *complements* the
   verbatim ring (the original sketch's "replace last-N cards" was not taken —
   the ring carries phrasing the summary flattens). Summarised **from source**
   (the full session card feed, never summary-of-summary) via one Haiku call,
   **debounced at K = round(1.5 × N)** cards (N = `narratorContextCards`), so
   most turns are a free cached read. Stored on `campaignState.sessionSummary`
   (keyed by `sessionId`; a copy of the latest store, on the GM's
   campaignState write chain — CACHE-MUTATED-BEFORE-WRITE), rendered as
   system-prompt §[4c] *STORY SO FAR (THIS
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
      null) and marks the session ended — when the closing vignette
      narrates, it opens a scene of its own, which the next mint closes
      (`session_close`; issue #321 U34); the next Begin Session mints a new
      one and begins it (the mint closes the session-active gate — issue
      #321 U12), and its first narration shows LAST SESSION and the CAMPAIGN
      RECAP. A reload after four idle hours re-mints the session AND closes
      any stale scene (`session_gap_remint` in the console); a reload mid-play
      resumes it, however long the session has run.
- [ ] Play the X-Card on a narration → its card is flagged `xCarded`, its
      facts leave the ledger without appearing under CORRECTED, and the first
      narration after a GM resumes steers elsewhere (X-CARD — REDIRECT;
      issue #321 U07).
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
