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
durability, capacity, and write discipline (the table has grown to seven: the
rolling summary, recent oracle results and — issue #353 — the narrative
skeleton, the one surface that holds what has *not* been stated):

| Surface | Durability | Written by | Read by | Capacity |
|---|---|---|---|---|
| **1. Recent-narration ring** | chat history (per session) | every narrator-prose card via flags; each entry is the player's line + the prose (issue #286 B5) | paced, @scene, oracle follow-ups, move narration (last 4, B1) — no longer the session recap, a view of the session record since issue #382 slice 5 | last N cards (`narratorContextCards`, default 20, 1–50) |
| **2. Active-scene ledger** (truths + state + ship position) | scene-scoped; migrated at scene end | narrator sidecar (deterministic rules), `!truth`/`!state`, corrections | every narrator call but the campaign recap's, which gets the ship's position alone of that block (system prompt §6.5; issue #374 A1) and the scene's state, read live, under WHERE THINGS STAND in its user message (its truths reach it from the session record — issue #382; never as binding) | `factContinuity.maxLedgerTokens` soft cap (default 400) |
| **3. Scene frame** | scene-scoped; cleared at scene end | narrator sidecar (`sceneFrame` key, every response — a session vignette's without its question; never an `@scene` answer's) | every narrator call but the campaign recap's (top of §6.5 — a recap gets the scene's question, answered or not, under WHERE THINGS STAND in its user message, no cast); scoping + relevance unions | ~30–60 tokens |
| **4. Entity records** (cards + generative tiers + last known whereabouts) | permanent | entity confirm flow, scene-end truth migration (entity truths; scene truths onto the recorded place each was asserted at — #286 C2, #326 D2), tier updates, scene-end `lastKnown` (#286 C1) | relevance resolver + the frame's cast → ENTITIES IN SCENE cards; current location card | per-entity (10 tier lines on the card) |
| **5. Session summary** | a view of the session record (issue #382 slice 3, `src/record/summaryView.js`): kept on the session's Session Log page (`sessionRecord.views.summary`), shown while the span it was made from reads the same — a correction (X-Card, strike, changed name, an upgrade's supersede) makes it stale and it is made again; LAST SESSION is the newest earlier begun session's (`lifecycle.js` `lastSessionToTell`), with what a session nobody began played after it as facts | Haiku, from the session read with its corrections — each beat's facts and TOLD AS its narration — as cited sentences; debounced at ~1.5×N beats, made after a narrator card posts — never inside a narration (issue #286 B7) — at End a Session and at the closing session's mint; an earlier session's owed one by `refreshStaleSummaries` | every non-meta narrator call (system prompt §[4c], ledger-wins caveat; a cached read) — this session's as STORY SO FAR, the one before as LAST SESSION; the opening vignette's user message (WHERE THE LAST SESSION STOPPED) | ~≤320 tokens each (Haiku-capped) |
| **6. Recent oracle results** (2026-07) | rolling ring on campaignState (cap 8; session-scoped read) | canonical-GM capture hook from the `oracleMemory` card flag | every non-meta narrator call (§[3b] — the answer stands over earlier narration; the oracle follow-up's own role and user message say an answer binds and the scene is what is reconciled, ORACLE-NO-NARRATED-AS-YES) + the assembler's RECENT ORACLES section | last 5 lines |
| **7. Narrative skeleton** (issue #353) — what is true but **not yet revealed** | permanent until resolved or retired — by the narrator's `resolved`, a GM's Retire, or in code as its subject ends: an expedition's track, a vow, a scene's unanswered mystery (issue #362 D4); GM-only World Journal — Secrets journal, one page per plan | the narrator's own sidecar (`plans`, `openQuestions`, `reveals`, `countdown`, `newThreats`) on the canonical GM, from the oracle rolls a trigger made (a price's new enemy, an enemy the prose introduced — `newThreats`, issue #354 P2-29 — a posed question); a plan answered `sameAs` joins the plan its subject already has, which keeps the other name as an alias (issue #354 P2-30); the GM's Secrets panel; stamped per narration for the X-Card | every non-meta narrator call (§[6.6] UNREVEALED — the plans whose subject is in play; DECIDE NOW for the undecided; THIS BEAT ENDS A VOW for the plan of a vow the move fulfils, whose truth is then stated in the prose) and the Private Channel (decided plans only). A truth is revealed by prose that tells it: "truth" comes off a narration's own reveal whose prose told none of it (`withoutUntoldTruths`, VOW-FULFILLED-WITH-NOBODY-NAMED) | at most 4 plans, `UNREVEALED_MAX_TOKENS` (600) |

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
   output is consumed verbatim, so a stray sidecar JSON block would leak —
   and none of the open scene's frame, truths or state as a binding scene
   (issue #374 A1: of §6.5 a recap gets the ship's position line alone).
   A recap's source is the session record, in its user message (issue #382,
   `record/recapView.js`; docs/flows/session-record-flow.md): each session's
   turning points and the latest session in full, as facts with ids, and
   WHERE THINGS STAND read live from the sheets and tracks (`standingLines`,
   RECAP-STATES-WHAT-DID-NOT-HAPPEN) — never the campaign's setting, and no
   summary; its reply is cited sentences. The recap a session's start is told
   (its first narration's, the world load's "Previously On" — `sessionStart`)
   leaves the session under way out, so the last session before it is the
   one in full; End a Session's and `!recap`'s tell the session under way.

### Data flow per turn

```
player input
   │
   ├─ resolvePathRelevance (paced/@scene; narrator.js)        [READ 4]
   │    lexical match over player text ∪ sceneFrame.present
   │    → ENTITIES IN SCENE cards + matchedEntityIds
   │
   ├─ buildNarratorSystemPrompt                                [READ 2+3]
   │    §6.5 ledger block: THE SCENE → WHAT BINDS → CORRECTED → STANDING NOW
   │      → WHAT THE NARRATION HAS DESCRIBED → PLAY LET THESE GO → COMMAND VEHICLE
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

**The ring turns with the scene** (overhaul 2 slice 5 — §8). A beat of
play's narration — the move's, the round's, the oracle follow-up's, the
paced line's — is told its own scene's cards (`getRecentNarrationContext(…,
{ scene })`, the scene by `ringSceneOf`: the open scene's id and its
anchor's `what`; the cards by the `sceneId` the stamp hook gave them,
invariant 1), the newest `limit` — and before them, while the scene's own
leave room in `limit`, the last `SCENE_BEFORE_ENTRIES` (2) told before it
began, headed `THE SCENE BEFORE — it ended when ‹what›. How it ended:` (then
`THIS SCENE:`). The move reads four in all: a new scene's first beat the two
before it; its third its own two and those two; its fifth its own four. What
came earlier is the session summary's, made at every scene end (slice 2).
The reader's recent scene (`getRecentSceneForReading(sessionId,
campaignState)` — the pacing classifier's and the move interpreter's) is the
scene's last three entries, with fewer the one before, headed. An `@scene`
question (a recall wants the session) and the Private Channel read the
session's ring; so does every beat with the session summary off
(`narratorSessionSummary` — it is what tells the scenes before), and a
session whose cards carry no stamp (from before it).

**The flag-family contract.** Any card whose prose is *fiction the narrator
should remember* must carry all three flags:

| Card | Flags since | Notes |
|---|---|---|
| move narration (`postNarrationCard`) | always | also `resolutionId` (burn-supersede); `moveId` / `outcome` (what the card narrates — read by the playtest runner's mechanics checks alone since the session recap reads the session record, issue #382 slice 5, which retired the card's `isMatch` with that reading; `UNWIRED` at the write); `playerText` / `playerName` (ring, #286) |
| paced narration (`postPacedNarrativeCard`) | always | `playerText` (also the NWMA Roll button's re-post) / `playerName` |
| @scene answers (`postSceneCard`) | Cluster A1 | keeps `sceneResponse` for chat-hook exclusions; `sceneQuestion` / `playerName` (ring, #286). Since known-issues SCENE-ANSWER-NOT-A-CAMERA the answer is a plain statement of what is established and **the ring (with the summary's source) is all it feeds**: no fact block is asked for or applied, and no capture runs — see below |
| inciting incident (`postIncitingIncidentCard`) | Cluster A1 | `narrationText` is prose only (vow line stripped); fallback cards excluded |
| galley / end-session vignettes | 2026-06-15 | `sessionVignetteCard` + `vignetteKind` (`galley_begin` — the session's opening, wherever it is now set; `npc_end` — the closing cutaway); since issue #381 `builtFrom`: the scene's rolled seeds with the narration's account of each (`session/sceneSeeds.js`) — the one store of its rolls, rendered as "Rolled for this scene" at every render, never rolled again; a closing's subject seed keeps its stable `ref`, which the next closing reads so as never to show the same subject twice running (`endSessionVignette.js`). A session vignette is no part of the last narration the next opening is told (`getLastStoryNarration`) |
| spotlight vignette (`postSpotlightVignetteCard`) | 2026-11 (#381 D3) | `sessionVignetteCard` + `vignetteKind: "spotlight_begin"` + `builtFrom` (its first seed the Begin card's Spotlight Vignette roll). A cutaway: `ringEntryText` heads its entry "CUTAWAY — the table saw this; the characters did not", so the beats after it (ring, summary source) do not have the characters know it; its scene is ended with its card. Its capture runs detection and the tier pass |
| vow-swearing scene (`narrateAndPostVowSwearing`) | 2026-07 | NARR-RING-VOWSCENE fix |
| clock vignettes (PtP / Begin Session / manual — all three post sites) | 2026-07 | NARR-RING-CLOCKVIG fix; a trigger vignette also names its clock (`clockId`, issue #338 D8); its narration runs the tier pass for the recorded entities it names (`narrateClockAdvancement` → `scheduleNarrationCapture`, issue #345 AA33) and the detection pass (CLOCK-VIGNETTE-NO-DETECTION), on the GM whose client narrated it (CAPTURE-HANDOVER-SCENE-ORACLE-VIGNETTE) |
| oracle follow-up narration (`postOracleNarrationCard`) | 2026-07 | raw results additionally ledger via the `oracleMemory` flag → `campaignState.recentOracles` |
| Batch Mode round card (`postRoundNarrationCard`) | 2026-11 (#340) | `roundId`, `roundEntries: [{ userId, actorId, playerName, playerText, outcome, resolutionId }]` — the players who acted and no one else; its own `moveId` / `outcome` / `resolutionId` stay empty. Its `roundNumber`, its `isMatch` and each entry's `moveId` / `isMatch` were the session recap's ("Round N: Move → Outcome"), retired with its reading of the chat (issue #382 slice 5); an entry's `outcome` stays for the e2e playthrough's round check (`UNWIRED` at the write). The round's result cards carry `roundId` too. Its fallback (`postRoundFallbackCard`) keeps the family with `narrationFallback`; the X-Card's paused notice (`narrationPaused`) is not a narrator card. `sessionId` / `sessionNumber` are the round's own session's (`round.sessionId`), whichever pass narrates it — a round of an over session narrated after the load minted the next is told from, and filed under, its own session (driver.js `roundNarrationState`, issue #364 ROUND-CARD-SESSION-ID-AFTER-MINT), so the minted session's ring, summary, first-narration recap and X-Card pick do not read it |
| published Private Channel reflection (`publishToMainChat`) | 2026-10 (#286 D1) | the published text only, posted by the canonical GM once checked against every player's Private Lines (issue #362 D13); `publishedReflection` also triggers the canonical GM's tier pass (`registerPublishedReflectionHook`), which stamps the card's `narrationId` on the details it records (issue #335 Y03). No sidecar, so no ledger facts |

Every card above also carries its narration's `narrationId` — the id its
sidecar stamps on the ledger entries it writes (§3; issue #321 U07) and its
capture on what it records (issue #329 X01); a published reflection, which
has no sidecar, carries one for its capture (issue #335 Y03).
A beat's card — a move's, a paced line's, a round's — also carries the shape
its narration was written in (`beatShape`, a `proseVariety.js` `BEAT_SHAPES`
id): the next beat takes the shape after the newest written beat's
(`beatVariety` → `lastBeatShapeId`, read from the chat as it was, so a card a
GM deleted or a Clear Chat Log took still counts — issue #364
BEAT-SHAPE-AFTER-DELETED-CARD). A fallback card carries none.
While a beat is being written its shape is claimed in memory on the
narrating client (`narrateWithBeatClaim`, released when the narration ends
however it ends), and a beat picked meanwhile steps past the claimed shapes —
two beats narrated at the same moment had both read the same last card
(issue #364 BEAT-SHAPE-SIMULTANEOUS). The claim is no store of the last
shape: with nothing being written the cards alone decide.
The move narration's "narration unavailable" card (`postFallbackCard`) keeps
the family — kept so the session recap counted the move, until that card read
the session record, where the move is its roll's `move.resolved` (issue #382
slice 5) — and is marked `narrationFallback`, which every memory read leaves
out (issue #321 U35 — it was fed back as story and counted as the session's
first narration).

**An `@scene` answer: said, not recorded** (known-issues
SCENE-ANSWER-NOT-A-CAMERA; the long haul's third live run). A1 put scene
answers in the ring because they were narrator prose that established things
(v1.7.8 F8: invisible to the next call, they were contradicted). They no
longer establish anything: an answer is the fact, in one or two plain
sentences, from what the prompt holds — or "the story has not established it"
— and nothing of it is written back (`interrogateScene` → `sceneAnswerText`:
no frame, truth, state or plan; no detection, no tier pass; never a Chronicle
entry). **A1 is kept, deliberately, for the ring**: the table has read the
answer, so the next beats are shown the question and the reply and do not
contradict them — and a wrong answer is bounded by the ring's depth instead of
becoming a fact. The card's other readings were re-audited for the change of
meaning: the session summary's source lists it under QUESTIONS (the
record's `question` — issue #382; nothing happened because one was asked),
the session recap — a line a move since issue #382 slice 5 — does not list it, the
X-Card can remove it; it is **no narration** for the session-start recap gate
or the X-Card's redirect (both now leave `sceneResponse` cards out, as they
do a published reflection), and it never took a beat shape.

**Audited consumers of `narratorCard`** (re-audit when adding a card type —
CLAUDE.md "audit consumers" rule):
- ring (`getRecentNarrationContext`) — the point
- rolling session summary (`sessionNarratorCards` → `getRollingSessionSummary`)
  — shares the ring's source reader + defensive excludes (since issue #321
  also `narrationFallback`, U35, and `xCarded`, U07); reads the full feed,
  not the last N
- rolling-summary refresh hook (`registerRollingSummaryRefreshHook`, issue
  #286 B7) — on the canonical GM, a new `narratorCard` with `narrationText`
  triggers the debounced regen after the card posts; at a table whose GMs hold
  no key, the keyed client that wrote the card makes it and relays it to the
  GM to store (`applyRelayedSessionSummary`, SUMMARY-KEYLESS-GM)
- session recap (`postSessionRecap`) — **no longer a consumer** (issue #382
  slice 5): the `!recap session` card is a view of the session record
  (`record/sessionCardView.js` — a line a move from the rolls'
  `move.resolved`, the counts, the match; session N the one the record
  numbers N; docs/flows/session-record-flow.md). It read
  `sessionNarratorCards(sessionId, { forRecap: true })` — the narrator's
  excludes but a fallback card and an X-carded card, whose moves counted
  (issue #321 U07) — took each line and "A match was rolled" from the move
  narration's `moveId` / `outcome` / `isMatch` and a round card's
  `roundEntries` ("Round N: Move → Outcome", issue #340), and found session N
  by the cards' `sessionNumber` (`recapSessionFor`). The reading, `forRecap`
  and the flags only it read are retired; a cleared chat log no longer empties
  the card
- the campaign recap's session-start gate (`sessionStartRecap`, issue #286
  C3) — the recap goes to the session's first narration: no card
  `sessionNarratorCards` keeps yet, save a published reflection — canon, but
  not a narration; published first, it took the narration's recap (issue
  #345 AA32) — and save an `@scene` answer, which is no narration either
  (SCENE-ANSWER-NOT-A-CAMERA)
- the session record's card hook (`registerRecordCardHook`,
  `src/record/cards.js`, issue #382) — on the canonical GM, each card narrator
  memory takes (`narratorMemoryCard` — `inNarratorMemory` for the card's own
  session: no fallback, no whisper, no contradiction, recap or draft card,
  nothing struck or superseded) is recorded as a `narration` event, its
  `narrationText` copied once, its mode read from its flags (`roundId`,
  `oracleNarrationCard`, `vowSceneCard`, `pacedNarrative`, `sceneResponse`,
  `sessionVignetteCard` + `vignetteKind`, `incitingMeta`, `clockVignetteCard`,
  `publishedReflection`, else a move's); a new card type's flags need a mode
  there (docs/flows/session-record-flow.md)
- correction-dialog render hook (`src/index.js`) — no-ops without
  `[data-action="openCorrectionDialog"]` markup
- audio render hook (`src/index.js`) — no-ops without the hidden play-button
  markup, and on an X-carded card (issue #321 U07)
- the X-Card (issue #321 U07): `xCardedNarrationCards` picks the cards a play
  removes from `sessionNarratorCards` (the newest still in memory and its
  beat), and `registerXCardRedirectHook` (canonical GM) clears
  `xCardRedirect` when the first narrator card with `narrationText` posts
  with the X-Card lifted — not a fallback, a published reflection, an `@scene`
  answer (it steers nothing away — SCENE-ANSWER-NOT-A-CAMERA) or an
  X-carded card. A narration card created while the X-Card is active — its
  reply passed its check just before the play, its card on the way while the
  pause's pick ran — is removed as the X-Card removes one, on the canonical
  GM (`registerXCardLatePostHook`, XCARD-POST-RACE). The pick and that guard
  also reach a narration posted since the current session was minted and filed
  under the session before it — a round narrated late keeps its own session
  (`narratedLateIntoEarlierSession`, issue #364 XCARD-MISSES-LATE-ROUND-CARD):
  it is on screen, so the X-Card answers it when it is the newest narration,
  and a beat is one session's (a narration of the current session bounds a
  late beat; a current beat passes a late card over). The Round window's
  newest narration reads it the same way; the ring and the Private Channel's
  ring do not, and the record files it under its own session, whose summary
  it makes behind — made again by `refreshStaleSummaries` — the card is its
  own session's story.
  A round card is one beat: the walk back from the newest card
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
  `sessionNarratorCards` leaves out (ring, recap), and the record's supersede
  (`narration.removed` by `superseded`) leaves out of the session summary — a
  summary made from it is stale and made again (issue #382; issue #345 AA24).
  Since issue #338
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
- the Chronicle's automatic entries are a view of the session record (issue
  #382 slice 4): when a narration of play — a move's, a paced line's, a Batch
  Mode round's — is written to the record, `record/chronicleView.js`
  schedules the scribe for its beat (`scheduleChronicleEntry`; one entry per
  round, kind `round`, which the writer's prompt knows — issue #340), and the
  scribe is given FACTS, the PLAYER'S LINE and the NARRATION as the telling,
  which may lend a word, never an event. Every entry carries its narration's
  `narrationId`, the record's `eventId` and a `sourceHash`, so the X-Card's
  finish removes it (`retractNarrationChronicle`) and a scribe still running
  when the card lands writes nothing (XCARD-CHRONICLE); a telling an upgrade
  superseded before the scribe ran writes nothing either; a strike takes back
  the automatic entries of the beat whose narration set the struck truth, by
  that narration — a pinned or edited one stays (the record's `truth.struck`
  → `retractChronicleOfNarrations`, STRIKE-CHRONICLE; it was a word-overlap
  match); and a name the table changed is read as the new one
  (`getChronicleEntries`). An entry is kept when the scribe rates it at or
  above the Chronicle's floor — or, whatever its rating, when its beat
  changed something lasting (the record's `lasting`, from
  `chronicleKeeps.js lastingChangeOf`; a round's, the first of its beats': a
  progress move, a vow sworn or forsaken, a brush with death, an arrival, a
  connection made, a miss that paid its price — issue #374 A5). The campaign recap no
  longer retells the Chronicle (issue #382 slice 2): it is a view of the
  session record — its facts, the players' own words, how things stand read
  live — and is given a player's own Chronicle entries as their notes, and a
  session from before the record as its Chronicle entries had it. The scribe
  still names whose thing a thing is and genders no one the story did not
- WJ contradiction cards (◈ Narrative Review) carry no `narratorCard` since
  issue #399 (D5): no narration, so no reader of the flag counts one — the
  correction hook wires their Retract button by `factContinuityReview`. The
  ring's defensive filter on `worldJournalContradiction` stays
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
  whenever prose establishes or changes them — save a player character's own
  place, which is the frame's `location` alone (`placeClaims.js` drops a state
  change saying it, while the frame is on; RECAP-TOLD-A-PLACE-SHE-HAD-LEFT,
  issue #397);
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
surfaces, issue #335 Y02), tier details (one the GM had
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
(`ensureCurrentScene`, canonical GM — issue #321 U34; their facts landed
under no scene), and so does a `!truth set` / `!state set` (issue #326 W59).

**Scene turns** (overhaul 2, slice 2 — D1 reverses issue #353 R2's "scenes
stay manual"). A session was one scene unless someone typed `!scene` (the
long haul's third and fourth live runs), so the scene's question, its colour
and its hooks were the session's. Each scene now has an anchor —
`campaignState.sceneBegan = { sceneId, at, cause, what, place, ship, tracks }`,
written once at its start from the stores (`sceneLifecycle.js openScene`,
`sceneTurns.js sceneAnchorOf`) — and at the start of every beat of play's
narration (`narrator.js ensureCurrentScene` at the move, paced, round and
oracle follow-up sites; start-only elsewhere) `sceneLifecycle.js
turnSceneIfDue` compares the stores with it (`sceneTurnDue`): the characters'
place, the ship's place key, a fight / an expedition / a scene challenge
begun or ended, time the player's line skips (`TIME_SKIP` — phrases, never a
bare word) or a Sojourn. Begins before, ends after: an arrival's narration
opens the new place; the beat whose resolution ended a fight
(`endingTrackIds` — `index.js applyOutcomeEffects`, and Finish the Scene in
`movePipeline.js`) is the fight's last, and the next beat turns. Several
causes are one turn, the first in that order. A turn is `endScene(…, { turn:
true })` then `startScene(…, { cause, what, carry })`: today's end — what
binds migrated, LAST KNOWN kept, the strikes kept — less what is the
session's (D16, amending #362 D4): the unanswered mysteries go on in the new
scene (`secrets.js carrySceneMysteries`) and the `!pace` override stands. The
frame's cast and let-go questions and the spotlight's last actor are carried
into the new scene's first frame; no world snapshot is taken; the session
summary is made. The beat that opens a scene is told so in overhaul 4's
obligations block (WHAT THIS NARRATION MUST TELL, AND MUST NOT — "[scene] This
beat opens a new scene: ‹what›…", TELL; each question play let go, NOT SO
[letgo]; `sceneTurns.js sceneObligations`), and the record's
`scene.started` carries the cause in words, which the Session Log heads the
scene with ("A new scene — ‹what›"). A slot the scene began without (no
place, no ship position — the inciting incident sets the first) is filled
from the first store that records it, without turning; a scene open when
this shipped takes its anchor at its first check.
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

**Drop order under budget pressure** (overhaul 2 D8): the described colour —
its state, then its truths, the oldest first — then standing state, line by
line, every other attribute before a character's location / vessel /
condition, the oldest first within each (issue #286 A6) → (never) WHAT
BINDS → (never) CORRECTED → (never) PLAY LET THESE GO (§7.3) → (never) THE
SCENE (its place, ship and frame lines) → (never) the command vehicle. Soft
cap `factContinuity.maxLedgerTokens`.

**What binds, and what is colour** (overhaul 2, slice 3 — §5; D5, D6, D7,
D13). Every truth and state entry carries its `basis`: `player` (the
player's line), `dice` (a move's result, an oracle's answer), `gm` (a
command, a correction, a Keep), `setup` (the inciting premise) — these bind —
or `narrator`, the narration's own colour. A narrator fact says where it
comes from (`"from": "line"` / `"result"`, normalised in `sidecarParser.js`);
`narrator.js applySidecarSideData` floors the claim against the beat's own
words (`ctx.ground` — `groundOf`: the player's line, and `decided`: the stakes
line the outcome delivered, the move's target, the oracle's question and
answer, a triggered clock's name — `decidedOfMove`) with `provenance.js
factBasis`: one of the fact's own telling words, stemmed, in the ground, a
name no evidence. Anything else is colour. The inciting incident's block is
`setup` whole; a bookend, a clock vignette that triggered nothing and the
oath scene beyond its vow write colour only. A `!truth set` / `!state set` /
correction stamps the actor's basis. An entry from before bases reads as its
asserter's (D13: the GM's and a player's as theirs, the narrator's colour; no
migration).

Colour is shown under WHAT THE NARRATION HAS DESCRIBED — kept to while it
stands, changed without argument when the table changes it — while one of
the scene's latest `COLOUR_BEATS` (6) narrations wrote or restated it: its
`said` list (at most three narration ids, newest first); the scene's
narrations are its stamped cards (`sceneId`, invariant 1;
`sceneNarrationsOf`), and with none stamped (a scene from before) it all
stands. A restatement the dedup meets refreshes `said`; one the table's words
bear out raises the basis (`raisedBasis` — never lowered) — a state value's
too, said again as it stands or cut to two or more of its own first words,
which keeps the basis it holds (`ledgers.js restatesStateValue`; a value that
adds words is a new one, the narration's — RESTATED-WHEREABOUTS-LOST-BASIS:
whereabouts the player's line set became colour when a narration repeated
them, and the scene's end kept no LAST KNOWN); a GM's Keep in the
correction dialog raises it to `gm` (`confirmTruth`); the save's merge carries
both (`mergeSceneLedgers` → `withRestatement`). The X-Card takes its
narration off what it restated. Colour sharing a let-go question's stem the
beat's words do not hold stops rendering. At a scene's end colour is filed
nowhere — no tier detail, no Lore, no LAST KNOWN (`migrateSceneTruth` →
`faded`, counted on `!scene end`'s card) — and the record keeps it
(`truth.set.basis`); no view tells it (§ record, `read.js` `established` is
binding only).

---

## 4. Surface 3 — the scene frame

`campaignState.sceneFrame = { location, present[], remote[], situation, question?,
questionAnswered?, questionBeats?, letGo?, sceneId, narrationId, updatedAt }`.
`present` is everyone here in person — each player character in the scene, each
named character, an unnamed figure by a short handle — and `remote` anyone heard
or seen over a comm (issue #397, Code fix 5). The narrator emits a
**full-replacement snapshot** in every sidecar (`sceneFrame` key); an omitted
frame keeps the previous one. The **scene question** (issue #353 R2) is the
exception to full replacement: what the scene is deciding — what the player's
latest line sets out to settle. While the frame holds one, `applySceneFrame`
(`sceneQuestion`) keeps it — a later snapshot cannot reword it — until a beat
marks it answered (`questionAnswered`), after which the next beat's question
is the scene's. The answering beat is told to end on a cut forward; no beat
ends a scene — the stores turn it (overhaul 2 D1, reversing issue #353 R2's
"scenes stay manual"; §3 "Scene turns"). Applied
by `applySceneFrame` (`ledgers.js`), which keeps the frames of the scene it
replaces as a bounded `previous` chain (never rendered), so an X-Card on a
narration puts back the frame its narration replaced (issue #345 D3);
cleared by `startScene`/`endScene` (`sceneLifecycle.js`).

**How long a question stands** (known-issues NARRATOR-REFRAINS; applied
around `applySceneFrame` in `narrator.js applySidecarSideData`). Nothing ends a scene but the table, so a
session is usually one scene, and "kept for the scene" meant kept for the
session: in the long haul's third live run the opening vignette's closing hook
— "What is the speaker over the hatch about to say?" — was the question in 22
of session 3's prompts, and 23 narrations of 23 ended on it. Two rules:

- **A session vignette is a bookend, not a beat of play** (`bookendFrame`;
  `narrateSessionVignette` applies its sidecar with `bookend: true`). Its frame
  never sets, rewords or answers the question — the one part of a frame a
  later snapshot cannot replace — and it is not counted against one. It still
  writes where / present / now, as any narration does (decided, not left
  over): the closing cutaway's scene is its own (it ends with its card —
  invariant 6) and its facts are filed by the place its frame names; the
  galley's frame is where the table has just been shown the characters, the
  never-dropped tier would otherwise be empty on a session's first prompt,
  and the first line of play replaces it. Its truths and state are recorded
  as before. The vignette's mode block says so (`BOOKEND_FRAME_RULE`); the
  apply drops a question whatever the model sends.
- **A question play leaves unanswered is let go** (`countSceneQuestionBeat`).
  The frame carries `questionBeats` — 0 on the beat that set the question, one
  more for each later beat that left it open — and at `SCENE_QUESTION_BEATS`
  (3) the frame keeps no question. The count is on the frame, beside the
  question it counts: stored and merged with it (it survives a reload) and
  carried in the `previous` chain (an X-Card on a beat puts back the count
  that beat changed). An `@scene` answer writes no frame and is no beat.
  Since overhaul 2 (§7.3; known-issues REFRAIN-OUTLIVES-THE-QUESTION) the
  released question is **let go and stays let go**: it goes onto the frame's
  `letGo` list — `{ text, stems }`, its own telling stems with the PCs' and
  the ship's names left out, at most four, the newest kept — and the frame's
  Now line goes with it, in the same write. The list is code-kept like the
  question (`applySceneFrame` carries it; no fact block writes or drops it;
  the `previous` chain carries it, so an X-Card on the beat that let it go
  puts the question back). In the fourth live run the released question came
  straight back in other words four times in one session — "Will Mira answer
  the second hail before the pilot's offer lapses?", "Which channel will Mira
  answer?", "Who will answer the second hail light?", "Who is on the second
  hail channel?" — the count restarting each time, and the Now line ("…while
  the pilot's offer and a second hail both wait on the comm") carrying it
  all along.
- **The question is the player's** (`narrator.js playersFrame`,
  `factContinuity/provenance.js`; overhaul 2 §7.2). Every beat's frame is
  read against the beat's own player words (`ctx.ground` — `groundOf`: the
  move's written line, the paced line, a round's lines, the oracle's typed
  question) before `applySceneFrame`. A question the frame does not already
  hold stands only when its mode may set one (`QUESTION_MODES`: the move,
  paced, round and oracle follow-up modes — never a clock vignette, the oath
  scene or the inciting incident, which have no player's words), when it
  shares a telling word with those words — the stemmed words of a plan's
  reveal (`world/tellingWords.js tellingStems`), a PC's or the command vehicle's name
  no evidence (`namesNoEvidence`) — and when it is no let-go question again:
  one sharing a let-go stem the beat's player words do not hold is the same
  question and is not set (`playersQuestion`); a line that names the stem
  takes the hook up, and it stands. A Now line carrying a let-go question is
  stored empty (`touchesLetGo`). Read so, the run's session 3 set one question
  of four, for three beats.

A frame with no question asks the next beat for one: THE SCENE's last line
reads `Turns on: none stands — if the player's latest line sets out to settle
something, set that, in a few words that use the line's own; if it does not,
set none.` (`buildLedgerBlock`'s `askSceneQuestion`, worded per mode by
`SCENE_QUESTION_ASK` — the move, paced, round and oracle follow-up modes
alone; the clock, oath-scene and inciting entries are gone with overhaul 2) —
never in a vignette's prompt, an `@scene` answer's, the recap's, the
consistency audit's or the Private Channel's. The sidecar rule says the
question is the player's, from the line's own words, and that one listed
under PLAY LET THESE GO is not set again, in any words, nor brought back in
the prose; HOW A BEAT ENDS says the hook is the story's answer to the
player's line, never a new thread of the narrator's own, and never one under
PLAY LET THESE GO. The let-go questions render under PLAY LET THESE GO, after
CORRECTED, never dropped under the cap. Rendered as THE SCENE, at the top of
§6.5 (overhaul 2 §5.5 — the scene's anchor, the place and the ship by the
table's record, then the frame's lines, each saying whose it is):

```
THE SCENE — began 3 beats ago, when the characters are at Lyra Station.
  Place:    Lyra Station — where the characters are, by the table's record
  Ship:     Wayfinder near Lyra Station
  Where:    Lyra's orbital graveyard — as the narration has it
  Present:  Venri Quint (she/her), Vance
  Now:      Hailing Vance's shuttle across the debris field — as the narration has it
  Turns on: Will Vance let them board? — from the player's line
```

(An answered question reads `Turns on (answered): … — the scene has moved
past it; set what it turns on now.`; a frame with none, `Turns on: none
stands — …` as above.)

Each person is shown with their pronouns (issue #402, change 2): a recorded
person's card's set, else the first set the scene's fact blocks gave for them
— an entry may end with one, "customs clerk (she/her)"; the parser keeps the
name bare and the set in the frame's `pronouns` (`[{ name, pronouns }]`), the
first given kept for the scene, carried across a turn, and on the record's
frame events.

Two side effects beyond display:
1. `present` names are treated as mentioned for ledger scoping (§3).
2. `resolvePathRelevance` (paced/@scene) unions `present` into the lexical
   match text, so present entities keep their ENTITIES IN SCENE card every
   turn.

**Openings from the record** (overhaul 2 slice 6 — §9;
OPENING-CONTRADICTS-WHERE-IT-STOPPED). A session's opening is told where the
last session stopped by that session's record (`galleyVignette.js
whereLastSessionStopped` → internal `recordedStop`): its last scene's place,
who was with them at the end, what binds there — the player's, the dice's,
the GM's, the premise's facts, labelled, never the narration's colour — the
question still open and what play let go; then the last narration as the
table read it, its details the narration's own. Nothing in the opening
contradicts what binds; its ending, the material's, never ends on a let-go
hook. A session from before the record is told by its summary, as before.
Since issue #402: "With them at the end" names each person with their
pronouns, and who was over a comm; an answered yes/no question is among what
binds (change 1a, filed by code as the dice's); and the session's first scene
starts with those people when it opens at that place (D2,
`galleyVignette.sessionCarry` → `carriedFrame`).

**One place** (overhaul 2 slice 4 — §6, D9, D17;
SHIP-POSITION-AND-FRAME-DISAGREE). In the fourth live run's session 3 the
frame said "open space off the lock" while the ship's record said docked at
Bleakhold, the narration argued its own Where against the player's line
("You are no longer at Tamsin's stall, so…"), and a50 copied "the Ashen Wake's
pilot" after the cutter was renamed. Three stores, three facts: the
characters' recorded place (`currentLocationId`), where the ship is (its
position record), and where in that place the narration has them (the
frame's Where — colour). No fourth store restates the third: a fact block's
state change saying where a player character in the scene is, is not kept
(`placeClaims.js`; two recaps had told a bound one after the frames moved her
on — RECAP-TOLD-A-PLACE-SHE-HAD-LEFT, issue #397). THE SCENE composes them, each line saying whose it
is, from one read (`sceneForReading`), which the pacing classifier is told
by the same renderer (`formatSceneForReading` — its `formatScene`'s own
current-location read and frame lines are gone). The frame rule asks for a
room, a street, a deck — never where the ship is in space, which is a
ship/position change — and for the scene where the player's line put it,
with no difference explained in the prose. The ship rule asks for a
ship/position when the player's line or the prose puts the ship somewhere
its position does not say. Only a beat of play moves the ship (a bookend's,
a clock vignette's and the oath scene's ship/position are dropped; the
inciting incident's starting position stands). A fight begun while docked
tells its opening beat NOT SO [place]. No line walks the characters to
another place (issue #393 D3), and the frame's `where` is a spot within
their place: one naming another recorded place keeps the scene's last
`where` (D4, `sceneLifecycle.js framedAtThePlace`). A journey that leaves —
an expedition for another place, a Set a Course that misses — sets out: no
current location, "between places, on the expedition …" in THE SCENE, until
an arrival, which turns the scene as a place. Names the table changed are
written new in the frame's words as they are read (`writeNewNames`).

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
"Named-NPC continuity". The detection pass that makes those records is shown
the player's line beside the narration (known-issues
PLAYER-NAMED-PERSON-GETS-NO-CARD): a name the line gives to someone the
narration shows is that entity's name, in full, so a person the player names
has their card — and their home for facts — whether or not the narrator
repeats the name; what the line alone mentions creates nothing
(`narrator-context-flow.md` §2). The embellishment latitude block excepts a
name the player's own line has just given from "no new named entity may
appear". A Batch Mode round's narration is both kinds at once:
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
| `sceneResponseLength` | 2 (1–4) | Narrator | the most sentences an `@scene` answer runs to (it was a target for "N–N+1 sentences of atmospheric description") |
| `narratorSessionSummary` | true | Narrator | maintain + render the rolling session summary (surface 5); archived to the Session Log at End Session |
| `factContinuity.enabled` | true | Fact Continuity | master switch: sidecar instruction + parse + ledger |
| `factContinuity.ledgerInContext` | true | Fact Continuity | §6.5 block injection |
| `factContinuity.sceneFrame` | true | Fact Continuity | frame emission + block + scoping/relevance unions |
| `factContinuity.maxLedgerTokens` | 400 | Fact Continuity | §6.5 soft cap (state lines shed first; location / vessel / condition last) |
| `factContinuity.consistencyCheck` | **true** (2026-07) | Fact Continuity | post-narration Haiku audit vs the full ledger block (frame, truths, retractions, state, ship) |
| `narrativeSkeletons` | true | Narrator (World Journal) | the narrative skeleton (surface 7): plans are made, shown as UNREVEALED, and the sidecar's `openQuestions` rule is in the instruction (issue #353) |
| `narrativeSkeletonsShowRolls` | false | Narrator (World Journal) | a new plan's hidden oracle rolls are posted to the table at once, not when its truth is revealed |

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
was one cached block that changed every turn, and the alpha 23 playtest
measured what that predicted: 27 calls, 0% read, every call paying the
cache-write premium on 9–10k tokens.

**The cached layout** (issue #354 P2-23). `buildNarratorSystemBlocks` orders
the prompt by how often each part changes, and `callNarratorAPI` sends the
parts as separate `system` blocks: the **standing** rules (voice, safety,
world and campaign truths, the premise, the sidecar format, the NPC markup —
the same for every prose mode), **this narration** (the mode's role, how its
beats end, perspective, length, permission class), each closing on a one-hour
cache breakpoint, then the per-beat **context**, uncached. One hour, not the
default five minutes: a table's beats are often more than five minutes apart,
and every read restarts the hour. The sidecar instruction is in the standing
block; the context closes on RESPOND NOW, a pointer back to it, so the last
thing the narrator reads is still the response format. The check is the same
page: from a session's second narration its Cache read column should carry
the standing block (about 3k tokens with truths and a premise), and the share
in the summary line should sit well above zero. **Not yet measured against a
live model**: whether the sidecar is still emitted as reliably with its
instruction early in the prompt, and whether the voice shifts with the mode's
role no longer first. Compare the page's Fact block column (below) and a read
of the prose before and after.

**The world snapshot** (issue #357; decisions.md → "The world snapshot").
P2-23 cached the instructions; the larger part of each request was world and
per-beat content, chosen by keyword and different every call. The whole world
state is now a fourth block, between the standing rules and this narration:
every sector, entity card, faction, threat, confirmed lore entry, earlier
session's summary and active hidden plan, rendered once from the records
(`worldSnapshot.js`), stored on a GM-only page (`worldSnapshotStore.js`) and
sent as stored — a frozen copy, because a block that followed the world would
be rewritten on nearly every beat. The context then carries what the snapshot
cannot: **IN PLAY NOW** (the active sector, the current location, the matched
entities and the urgent threats, by name and id — the snapshot holds their
content), **CHANGED SINCE THE SNAPSHOT** (every record made or changed since,
in full; it wins), and everything that moves within a session, as before —
the ledger and its never-dropped tiers among them. Relevance still decides
what is in play; it no longer decides what the narrator can see.

A new snapshot is taken only when the one table of events says so
(`snapshotEvents.js` `SNAPSHOT_EVENTS`): Begin a Session, the GM's
`!scene start` / `!scene end`, the major events (plans made, decided, revealed
or ended; Make a Discovery, Confront Chaos, a price that reveals a new enemy;
a sector, an entity or a significant threat recorded), every retraction (the
X-Card, a strike, a plan edited or retired, a record gone), changes grown
large, and an hour with no narrator call. Each costs a full cache write, so
the snapshot page's log — when, and because of which events — is the tuning
surface with the Narrator Usage page: if most narrations take one, narrow the
table. Narration on a player's own key has no snapshot (the page is the
GMs'), and the world setting `worldSnapshot` switches the whole thing off.

Drift questions this adds, to watch in play (**not yet measured**): the
narrator drawing on a plan the context did not name — every active plan is
now in view, under the rule to use only the named ones; a record in the
snapshot preferred over its newer version under CHANGED SINCE THE SNAPSHOT;
and whether a long snapshot dilutes attention to the scene ledger, which sits
after it. The first is why the plans keep a section of their own; the second
is why a retraction always takes a new snapshot rather than riding as a
change.

**Prose and fact block** (issue #354 P2-24). Each usage row also records how
the reply split between narration and the fenced fact block, shown as the
output tokens of each — the playtest's output grew from 551 to 919 tokens
over a session and nothing said which half had grown.

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
| Every beat ends on the same hook; one question in every prompt | frame question | inspect `campaignState.sceneFrame.question` / `questionBeats` / `letGo`; a question is let go after `SCENE_QUESTION_BEATS` (`narrator.js`) and a let-go one is refused in code (`provenance.js playersQuestion`) — if a refrain still runs, look for a hook with no question behind it (colour, the ring) before lowering the number |
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
   (since issue #382 slice 3: the session record read with the table's
   corrections — each beat's facts and TOLD AS its narration — never
   summary-of-summary) via one Haiku call, **debounced at K = round(1.5 × N)**
   beats (N = `narratorContextCards`), so most turns are a free cached read.
   Kept on the session's Session Log page as a view of the record
   (`sessionRecord.views.summary`, valid while the span it was made from
   reads the same — `src/record/summaryView.js`), rendered as system-prompt
   §[4c] *STORY SO FAR (THIS SESSION)*, and as the page's "Session summary".
   Canonical-GM-written + fail-open; toggle `narratorSessionSummary` (default
   on). Its reply is cited sentences (a JSON list, `ROLLING_SUMMARY_MAX_TOK`
   1200): one citing no beat is dropped, an untold LASTING beat sends it back
   once, a reply that is not the JSON is asked for once more and then the one
   that stood stays. Drop priority + the "not a fact store" invariant: decisions.md
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
      narrates, it opens a scene of its own (issue #321 U34), which ends
      once its card is posted (`closing_vignette`; issue #374 A1), so
      `currentSceneId` is null again between sessions and the campaign
      recap written next names nothing of the cutaway; the next Begin Session mints a new
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
      next narrator call; the narration does not contradict it — and where
      the scene so far said otherwise, the follow-up reconciles the scene to
      the answer (a recording, a relay, a mistake, or it has stopped), never
      the answer to the scene (ORACLE-NO-NARRATED-AS-YES).
- [ ] Fulfill a vow whose plan is decided → the narration states the plan's
      truth in its prose, or says what is still not known; a fact block that
      records "truth" under prose that told none of it leaves the plan
      unrevealed, with no scene fact and no lore
      (VOW-FULFILLED-WITH-NOBODY-NAMED).
- [ ] A weak hit whose cost is a choice, and an Enter the Fray whose card is
      unanswered → the narration stops short of the cost, and before the
      first blow.
- [ ] `!recap` mid-session and End a Session → the recap's last paragraph
      agrees with the scene's current state and the session's summary, and
      says nothing no Chronicle entry states.
- [ ] Strike a truth → it renders under CORRECTED and the narrator does not
      re-assert it; a narrator sidecar re-emitting it is blocked at the
      write (console debug).
- [ ] Challenge an NPC about an established fact → narrator holds the line
      (F7 repro inverted).
- [ ] Ask a no-name follow-up ("what does that mean?") → partner's card +
      state still in prompt (verify via response quality / console).
- [ ] `@scene` answer: one or two plain sentences, no scenery; two cards
      later the narrator has not contradicted it (the ring), and
      `cs.sceneFrame` / `cs.sceneTruths` are as they were before the question
      (nothing written back); no draft card and no new Lore page follow it.
- [ ] Scene end: truths migrated (entity tiers / WJ Lore), frame cleared.
- [ ] Telemetry: ring depth setting honoured (prompt size shifts with it).
