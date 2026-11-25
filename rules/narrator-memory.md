# Narrator memory — operational rules

Full architecture, tuning guide, and refinement backlog:
**`docs/narrator/narrator-memory-architecture.md`** — read it before changing
anything in the narrator-context, sidecar, fact-continuity, or scene-frame
layers. This file is the never-break list.

## Invariants

1. **The flag-family contract.** Every chat card whose prose is fiction the
   narrator should remember MUST carry `narratorCard: true`,
   `narrationText: <prose>`, and `sessionId`. Error/fallback cards must NOT.
   As of 2026-07 this covers move, paced, @scene, inciting, galley /
   end-session vignettes (and since issue #381 the spotlight vignette,
   `spotlight_begin` — in the ring and the summary's source its entry is
   headed as a cutaway the characters did not see), vow-swearing scenes, all three clock-vignette post
   sites, and oracle follow-up narrations — "mood piece" is not an
   exemption. An `@scene` answer keeps it though it is no longer fiction and
   nothing of it is recorded (known-issues SCENE-ANSWER-NOT-A-CAMERA): what
   the narrator said in answer is in the ring so the next beats do not
   contradict it — and, like a published reflection, it is no narration for
   the session-start recap gate or the X-Card's redirect. Since issue #286 D1
   a reflection a player publishes from the
   Private Channel carries it too: published text is canon. So does a Batch
   Mode round's one card (issue #340): `roundId` and `roundEntries` (the
   players who acted, no one else) beside the family, its own `moveId` /
   `outcome` / `resolutionId` empty; its fallback card keeps
   the family with `narrationFallback`; its `sessionId` is the round's own
   session, whichever pass narrates it — after the next session's mint too
   (driver.js `roundNarrationState`, issue #364
   ROUND-CARD-SESSION-ID-AFTER-MINT). One exception
   (issue #321 U35): the move narration's "narration unavailable" card keeps
   the family — kept so the session recap counted the move, which the record
   now has from the roll (`move.resolved`, issue #382 slice 5) — and every
   narrator-memory read leaves it out by its `narrationFallback` flag
   (`sessionNarratorCards`, the record's card hook among them)
   — it was fed back as story and counted as the session's first narration. A
   card the X-Card removed is flagged `xCarded` and left out the same way
   (U07), as is one a Burn Momentum / Improve Result superseded —
   `burnSuperseded`: the move narration, and the trigger vignette of a clock
   its reversal rewinds, which names its clock (`clockId`, issue #338 D8; a
   trigger rewound while its vignette is still being written is never
   narrated — `stillTriggered`, TRIGGER-VIGNETTE-LATE-POST; a hidden plan's
   clock, which its vignette paced, by the vignette's own id — `pacedBy` —
   and a removed or superseded narration's pacing of a plan clock is taken
   back with its step, issue #362 AC33 — matched by the stamp alone, so also
   after a later price turned the clock, issue #364
   PLAN-TRIGGER-XCARD-AFTER-LATER-PRICE, and only while the clock's plan is
   in play once the narration is taken back, `planInPlayFor`,
   RETIRED-PLAN-CLOCK-XCARD-REACTIVATES; the burned price's receipt names that
   vignette, `vignetteNarrationId`, so a price paid in between does not hide
   it, issue #364 PLAN-CLOCK-BURN-AFTER-LATER-PRICE — and it is struck by
   that id when the clock has triggered again since and carries the later
   trigger's stamp, the later trigger left standing, PLAN-CLOCK-TWO-TRIGGERS-FIRST-BURN;
   the plan step a narration played carries that narration, `playedBy`, and
   goes back unplayed with it whatever was written to the plan since,
   PLAN-STEP-REWRITTEN-BEFORE-BURN — as do a clue it showed, `revealedBy`, and
   a truth it revealed, `truthRevealedBy`, PLAN-CLUE-TRUTH-NO-MARK — and a
   truth the X-Card takes back that way is withheld from the narrator from
   then on, `truthWithheldBy`: never shown, offered or recorded revealed by a
   narration, lifted only by a GM's edit of it or Reveal now, issue #364
   XCARD-REVEAL-REREVEAL-NO-LORE — as is one a Burn / Improve supersede
   took back first, by the supersede's mark `truthTakenBackBy`, when the
   X-Card takes the struck narration with the upgraded beat,
   XCARD-ON-UPGRADE-AFTER-SUPERSEDED-REVEAL) —
   and each narration's card carries its `narrationId`, which its
   sidecar stamps on what it writes (U07; a fallback card carries none) —
   a published reflection's too, which its capture stamps (issue #335 Y03).
   When adding a new card type or co-marking an existing one,
   audit every `narratorCard` consumer (ring, rolling summary, the session
   record's card hook — through which the session summary, the campaign
   recap, the Chronicle and the `!recap session` card read it — the campaign
   recap's session-start gate — a published reflection
   is no narration there, issue #345 AA32 — correction hook, audio hook,
   burn-supersede, the X-Card's card pick and redirect hook) in the same
   commit — the consumer list lives in architecture doc §2.

2. **The sidecar JSON contract** — every narration's; an `@scene` answer is
   asked for no fact block and one it sends is dropped, never applied
   (`sceneAnswerText`) — (`appendSidecarInstruction` ↔
   `extractSidecar` ↔ `applySidecar`/`applySceneFrame` — and, for the
   narrative skeleton's `plans` / `openQuestions` / `reveals` / `countdown` /
   `newThreats`, `src/world/skeletons.js`'s
   normalisers ↔ `secrets.js` `applyPlanSideData`, issue #353; and a session
   set-piece's `builtFrom`, the `session_vignette` mode's addendum ↔
   `normaliseBuiltFrom` ↔ `sceneSeeds.markSeedsUsed`, issue #381) is a matched pair.
   Any key added to the instruction must be normalised in
   `sidecarParser.js` and applied in `narrator.js applyNarratorSidecar` in
   the same commit, with parser tests for garbage shapes. Parsing is
   tolerant; never let a malformed sidecar block a narration post, and never
   let raw sidecar JSON reach the prose — a ```` ```json ````, ```` ``` json ````
   or bare ```` ``` ```` fence holding an object is the sidecar, stripped
   every time (issue #321 U41). A reply with no prose is no narration: its
   caller posts a fallback card (no `narrationId`) or nothing, so nothing of
   its block is applied or relayed (issue #362 AC39). A plan's truth is
   revealed by prose that tells it: "truth" comes off a narration's own
   `reveals` entry whose prose has none of the truth's words
   (`secrets.withoutUntoldTruths`, before the ledger and the plans read the
   block — VOW-FULFILLED-WITH-NOBODY-NAMED). It is a floor; the instruction
   (UNREVEALED, THIS BEAT ENDS A VOW) is what asks for the truth to be stated.
   The scene frame's `question` is the player's (overhaul 2 §7.2): read against
   the beat's own player words (`ctx.ground`, `provenance.js groundOf`; its
   `ctx.mode` — `QUESTION_MODES`) by `narrator.js playersFrame` before
   `applySceneFrame`, and the frame's `letGo` is code-kept — no fact block
   writes or drops it, the parser has no such key (§7.3).

3. **Required emissions are prompt-enforced, not code-enforced.** NPC
   location/vessel/condition (stateChanges) and intent/stakes (newTruths)
   are REQUIRED in the instruction text. If they stop arriving, fix the
   instruction wording first — do not silently add inference machinery.

4. **Never-dropped tiers.** Scene frame, binding truths, PLAY LET THESE GO
   (the frame's let-go questions, at most four — overhaul 2 §7.3) and ship
   position are never dropped from the ledger block under budget pressure; only
   state truncates — line by line, every other attribute before a
   character's location / vessel / condition, the oldest first within each
   (issue #286 A6; the block used to drop whole). Do not reorder the drop
   sequence without a decision.

5. **Non-move relevance stays lexical.** `resolvePathRelevance`
   (paced/@scene) must never reach an API call — `resolveRelevance` with
   `moveId: null` guarantees this today. The move path's relevance call is
   not frame-unioned on purpose (hybrid permission classification); see
   architecture doc §8.2 before changing. The frame's recorded cast joins the
   matched set after relevance resolves (`addSceneFrameCast`, every path —
   issue #286 B3), which brings back their cards and facts without moving the
   permission class.

6. **Scene-scoped lifetimes.** `sceneFrame`, `sceneTruths`, `sceneState`
   (and the scene's anchor, `sceneBegan`) are cleared/migrated by
   `startScene`/`endScene` only. **Scenes turn in code** (overhaul 2 D1 —
   this reverses issue #353 R2's "scenes stay manual"): at the start of a
   beat of play's narration (a move's, a paced line's, a round's, an oracle
   follow-up's — `narrator.js ensureCurrentScene` → `sceneLifecycle.js
   turnSceneIfDue`) the stores are compared with the anchor the scene began
   with (`sceneTurns.js sceneTurnDue`): the characters' place, the ship's
   place, a fight / an expedition / a scene challenge begun or ended, time
   the player's line skips or a Sojourn. Begins before, ends after: a change
   that brings the characters somewhere new turns the scene before the
   narration that tells it; a track the beat's own resolution ended
   (`endingTrackIds`, a fight's and a challenge's included) turns it at the
   next beat. Never on the narration's word: **no narration ends a scene**,
   and a bookend, a clock vignette, the oath scene, the inciting incident, an
   `@scene` question and a relayed block start one when none is open and
   never turn one. A turn is a scene end **less what is the session's**
   (D16 — amends issue #362 D4): the scene's unanswered mysteries go on in
   the next scene (`secrets.js carrySceneMysteries`) and the `!pace`
   override stands; both end at the GM's `!scene end`, a `!scene start` over
   the scene, End a Session and the mint. A turn carries the frame's cast, its
   let-go questions and the spotlight's last actor into the new scene, takes
   no world snapshot, and makes the session summary. The frame's scene
   question goes with the scene (issue #353 R2: never carried into the next
   scene; within its scene it stands until a beat answers
   it or play has left it unanswered for `SCENE_QUESTION_BEATS` beats, when
   it is let go — the frame keeps none, the question goes onto the frame's
   `letGo` list and the frame's Now line goes with it — and the next beat's
   is the scene's — its count, `questionBeats`, is on the frame beside it
   and nowhere else, and a session vignette, a bookend, never sets, changes
   or counts against it: `narrator.js` `countSceneQuestionBeat` /
   `bookendFrame`, known-issues NARRATOR-REFRAINS). **The question is the
   player's** (overhaul 2 §7.2–7.3, REFRAIN-OUTLIVES-THE-QUESTION): set only
   by a beat of play with the player's words (`QUESTION_MODES` — never a clock
   vignette, the oath scene or the inciting incident), only when it shares a
   telling word with them (a PC's or the ship's name is no evidence), and
   never when it is a let-go question again — one sharing a let-go stem the
   beat's player words do not hold; a Now line carrying one is stored empty
   (`playersFrame`, `provenance.js`). The let-go list is code-kept, carried
   by `applySceneFrame` in the frame's `previous` chain (an X-Card on the beat
   that let a question go puts it back). The scene's unanswered hidden
   mysteries, with their clocks, are retired at every scene end (issue #362 D4).
   Anything that must
   outlive the scene belongs in entity tiers or WJ Lore via the existing
   migration, not in a lifecycle exemption. Since issue #286 that migration
   also files scene-subject truths on the recorded place each was asserted
   at (the truth's `sceneLocation` stamp, issue #326 D2 — a scene spans
   travel; an unstamped truth falls back to `resolveScenePlace`, the place
   the scene ended at) and keeps each recorded character's whereabouts —
   location / vessel / condition — on their record as `lastKnown` (rendered
   on the card as LAST KNOWN). Scenes close at their fiction's
   boundaries (2026-07): End Session (`session_close`), End a Session's
   closing vignette once its card is posted (`closing_vignette` — a cutaway's
   scene is its own, and left open it was the campaign's active scene between
   sessions: issue #374 A1), Begin a Session's spotlight vignette once its
   card is posted (`spotlight_vignette`, issue #381 D3 — a cutaway too; a
   scene the table already had open is left as it was), the close-out before
   a new session is minted (`rollSessionIfDue` — `session_gap_remint` for a
   session that went idle) — do not add a session boundary
   that leaves a scene open, and do not leave a cutaway's scene open behind
   it. A meta mode (the campaign recap) is sent none of the open scene's
   frame, truths or state as a binding scene — of the ledger block, the
   ship's position alone. Its source is the session record, in its user
   message (invariant 9; issue #382): what happened as facts, and WHERE
   THINGS STAND read live from the sheets, the tracks and the open scene's
   state — never as where the campaign is set; do not send a recap the
   ACTIVE SCENE block, a session summary, or the narration. A session is over at End Session or after four
   hours without a chat message (issue #286 C4); only world load and Begin a
   Session mint; LAST SESSION — the closing session's summary, read from the
   session record — is the one prose surface that crosses sessions besides
   the campaign recap. A scene is never minted over
   a live one: a caller whose snapshot holds no scene while the store has one
   adopts it (`startScene` → `adoptStoredScene`, issue #321 U06f), scene
   starts run one at a time on the canonical GM — a start waits for the one
   in flight before it looks, so two narrations on their own copies share one
   scene (issue #335 Y05) — and every
   sidecar-applying narration — oracle follow-ups, session and clock
   vignettes and vow scenes included — starts a scene when none is active
   (`ensureCurrentScene`, canonical GM, issue #321 U34).

6b. **Retraction is enforced.** A bare Strike renders in the CORRECTED
   ledger block AND blocks narrator re-assertion at `applySidecar` (GM
   `!truth set` bypasses, and lifts the strike — `correctedTo`, as a Replace
   — so the two never render together; a player's set over a GM's strike is
   refused, issue #326 W60, and so is a player's set of what the X-Card
   removed or a Replace corrected — the active scene's, or a block a scene
   end kept (`findSessionBlock`, issue #345 D4); the lift also restores the lore that strike
   retracted, `restoreStruckLore` by the lore entry's `retractedByTruth`, so
   the re-set fact is archived as canon — issue #331 X31 — save an entry
   another standing retraction still states: it stays out of canon, handed to
   that strike when it is one the GM can lift, `loreRetractionHolder` — issue
   #336 Y32). Do not "simplify" either half away — the render
   defense and the write defense cover different failure paths (model
   ignores instructions vs. model re-emits the fact). Since issue #286 (B6)
   a Strike also reaches the stores that copied the fact
   (`propagateRetraction`, `src/factContinuity/retractions.js` — same-session
   tier details on the subject, save pinned and promoted ones (a promoted
   entry is what lets an X-Card take its Notes line, issue #342 Z43),
   same-session auto-confirmed lore that states
   it about the struck subject (issue #321 U39 — sidecar facts are
   subject-less phrases, so a bare fact match retracted another character's
   lore), a summary regen), and the scene's strikes outlive it for the
   session (`campaignState.sessionRetractions` → CORRECTED + the summary's
   leave-out list; a strike is its subject and fact together, U39) — both
   halves of it: a kept strike blocks a later scene's re-assertion too, and a
   GM's `!truth set` lifts it, restoring its lore by the truth id it keeps
   (`findSessionStrike` / `dropSessionStrike`, issue #342 Z42) — a strike of
   a scene fact (and a Replace's original) keeps the place it was asserted
   at, and its block, its lift and its CORRECTED line stand only there
   (`keptStrikeStandsAt` — another place's own fact of those words is that
   place's; the X-Card's blocks keep no place — issue #345 AA28). Any new
   correction path calls `propagateRetraction` — the X-Card does, for each
   truth it retracts (issue #321 U07). An X-Card retraction
   (`retractedBy: "xcard"`) blocks re-assertion like a strike — for the
   rest of the session, as a kept strike does: a scene end keeps it apart,
   unnamed (`sessionRetractions.blocked`, read by `findSessionStrike`'s write
   half and `loreRetractionHolder` alone — XCARD-RETRACTION-SCENE-SCOPED) —
   but is never named under CORRECTED, in the leave-out list or on a card:
   naming it would hand the narrator the content the table removed — so it
   takes over the table's strike of a truth its narration wrote, relabelled
   `"xcard"`, with the strike's kept `sessionRetractions` entry moved by its
   `narrationId` to those unnamed blocks, and a `!truth set` can lift neither
   (XCARD-AFTER-STRIKE-STILL-NAMED). A narration whose scene has already
   ended is blocked the same way: a scene end keeps each live narration truth
   it closes, unnamed (`sessionRetractions.narrated`), and the X-Card moves
   its narration's to the blocks (XCARD-ENDED-SCENE-TRUTHS-UNBLOCKED) — each
   superseded one too, which blocks nothing until an X-Card takes its struck
   narration with the upgraded beat (issue #347 residual XCARD-STRUCK-FACTS-AFTER-SCENE-END). So is
   a Replace's struck original: a scene end keeps it on the unnamed blocks
   too — the replacement stands, so it is named nowhere, and a `!truth set`
   lifts nothing (a strike a set lifted, linked by `correctedTo` to a truth
   restating it, is no Replace) — issue #345 AA05. A scene
   end adds what it keeps onto the session's list as the store has it at its
   write's turn — never its copy's list whole — so an X-Card played during its
   awaits keeps what it wrote (XCARD-DURING-SCENE-END-RACE), and a strike or
   Replace made then sticks: each migration re-reads the truth's stored entry
   before and after its write, and the end keeps the scene's truths as the
   store holds them (STRIKE-DURING-SCENE-END-LOST). A superseded narration's
   (`retractedBy: "superseded"` — what a Burn Momentum / Improve Result
   replaced, retracted by its `narrationId`, issue #338 D8) is never named
   either, and blocks nothing: the re-narration may state the fact again —
   until an X-Card removes the beat: the re-narration names the resolution it
   upgraded (`upgradeOf`), a struck vignette names it too (`supersededFor`),
   and the X-Card takes the struck narrations with the beat — their capture
   undone, their superseded truths relabelled `xcard`, blocked (issue #347
   D2). Anything a narration writes
   outside the ledgers carries its `narrationId` so the X-Card can undo it
   too — the command vehicle's position does (issue #325 W07; every other
   position writer writes `narrationId: null`, as `setFlag` merges —
   SHIP-POSITION-FLAG-MERGE), with where its sync took the sector-map token
   from (`tokenBefore` — the X-Card puts the token back, issue #342 Z12), and so does
   everything its capture records: World Journal entries (with the versions
   they replaced — a faction the draft routing surfaces too, issue #335 Y02),
   tier details (a promoted one's line in the notes too,
   issue #338 D7), a placeholder's rename, the draft card
   it queues — its pending rows are withdrawn, issue #338 D6(i) — and a
   connection it auto-creates or confirms from a pending draft row, deleted
   while unused (the row back to pending), else named to the GMs (D6(ii);
   MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED) — and the bond Item a Make a
   Connection hit puts on an NPC the table already knew
   (`bondedByNarrationId`), taken back while unmarked, the NPC's card and any
   earlier bond left alone (issue #364 DELETED-NPC-NAME-REFERENCES)
   (issue #329 X01 — a new capture writer takes the id from its
   caller, and checks the stored `xCardedNarrationIds` right before it
   writes — `isNarrationXCarded`, after any Claude call — so a capture still
   running when the card is played writes nothing more: XCARD-LATE-CAPTURE;
   the hidden plans' writers too — a plan, its clock, its rolls card, its
   revealed truth's lore — and a plan or clock write the card overtook on
   its way is taken back, as the X-Card's undo takes the rest, issue #362
   AC35), and the state transitions
   it applies to existing entries, a faction's record stance included
   (XCARD-CAPTURE-TRANSITIONS); so does what a scene end migrates from its
   ledger entries — the tier detail, the archived Lore page and the LAST
   KNOWN value with the values it superseded — since the card may be played
   after the scene ended (issue #335 Y01), or while it runs: each of those
   writes checks `isNarrationXCarded` right before it writes and takes its
   copy back when the card landed meanwhile (XCARD-DURING-SCENE-END-MIGRATES);
   a narration
   is built from the ledgers as they stand in the store, never a pre-dialog
   snapshot (W05), and a summary the X-Card emptied is stamped newer than any
   working copy's (W06) — and its sidecar's re-assertion checks read the
   store's truths, blocks and strikes beside its own copy's
   (`applySidecar`'s `storedLedger`, issue #345 AA04). What a removed
   narration told from RECENT ORACLE RESULTS leaves the ring in the pause's
   write — an oracle follow-up's
   result by the card id its card names (`oracleCardId` ↔ the entry's
   `cardId`), a move's Pay the Price by its `resolutionId` (issue #345
   AA01); an oracle follow-up the X-Card interrupted, which posts no card,
   drops its raw card's own (XCARD-ORACLE-FOLLOWUP-UNWRITTEN). A narration
   card that posts while the X-Card is active is removed with it
   (XCARD-POST-RACE) — one posted late into the session before the current
   one too, which the X-Card's pick answers like any narration on screen when
   it is the newest (`narratedLateIntoEarlierSession`: filed under another
   session, posted since the current one was minted; issue #364
   XCARD-MISSES-LATE-ROUND-CARD) — and the Chronicle entries the scribe wrote from a
   removed narration go too (XCARD-CHRONICLE).

7. **Sidecar subjects resolve against the full roster, in its own shape.**
   `applyNarratorSidecar` passes `collectAllEntities(campaignState)` so
   confirmed NPCs ledger entity-keyed. Don't remove that argument; text
   subjects are the fallback, not the norm. Pass the roster through
   unchanged: an entity subject's `entityId` is the roster's `journalId`
   (the HOST document id — an Actor id for an NPC), the id relevance
   matches, entity cards and scene-end migration use. Never re-map it into
   another shape or promote with a record's own `_id` (issue #286 A1/A3 —
   both silently dropped every recorded entity's facts). Names resolve
   through `resolveEntityName`'s bounded ladder, which never files a fact
   under an entity on an article, a title, a shared name part or a
   lowercase common noun — and a name several entities share is the active
   sector's (the roster leads it: `activeSectorNamesakeFirst`, Z15's rule —
   issue #345 AA06). Entity state keys are `entity:<id>`
   (`subjectKey` / `subjectFromStateKey`).

7b. **The system prompt's cached blocks hold nothing per-call** (issue #354
   P2-23). `buildNarratorSystemBlocks` orders the prompt as `standing` (the
   same for every prose mode), `mode` (the same for one mode at one
   permission class) and `beat` (everything else), and the request caches
   the first two. A cache read needs those bytes identical to an earlier
   request's: anything read per call — a perspective a round can force, the
   X-Card redirect, oracle seeds, the session-start recap, a name, a count,
   a timestamp — goes in `beat` (or `mode`, when it is constant for the
   mode). A list a cached block renders is in a stable order, never the
   order its writes landed in (the GM's Private Lines by user id — a
   player's reload re-synced them to the end, issue #362 AC67). Add a
   section to the block its volatility puts it in, never to
   `standing` because it reads well there; `tests/unit/
   narratorPromptBlocks.test.js` fails when a per-beat value reaches a cached
   block. The sidecar instruction lives in `standing`, and the context closes
   on RESPOND NOW, a pointer to it that names no key: a new sidecar key goes
   in the instruction (invariant 2), never in the pointer.

7c. **The world snapshot is sent as stored, and never asserts removed
   content** (issue #357). With a snapshot the request has a fourth cached
   block between `standing` and `mode`: the whole world state, rendered once
   (`worldSnapshot.js`), stored on a page of the GM-only Secrets journal
   (`worldSnapshotStore.js`) and sent byte for byte until a new one is taken.
   - **Never re-render it per call.** The records under it change during
     play; what changed rides in the context under CHANGED SINCE THE SNAPSHOT
     (which wins), found by comparing the world against the snapshot's
     manifest. A unit's text must be a pure function of its record: no
     timestamp, no count that moves, no ordering by time — and units are
     sorted by a stable id.
   - **What changes within a session stays out of it**: the scene frame and
     ledger, CORRECTED, ship position, character state, clocks, progress,
     recent oracles, this session's summary. The never-dropped tiers
     (invariant 4) render in the context on every call.
   - **When a new one is taken is one table** — `snapshotEvents.js`
     `SNAPSHOT_EVENTS`. A trigger site reports its event by id
     (`reportSnapshotEvent`) and never decides for itself; a new event is a
     new row, with its site, in the same commit (`worldSnapshot.test.js`
     fails on a reported id that is no row, and on a row nothing reports).
   - **Every retraction takes a new snapshot.** A new correction path calls
     `propagateRetraction` (6b), which reports it; a path that removes a
     record another way is caught by the manifest (`record_removed`), but a
     path that *rewrites* one to take content back must report an event of
     its own — a changed record otherwise rides as a change while the
     snapshot still states the old one (the Entities panel's Remove of a
     narrator-added detail reports `entity_detail_removed`, issue #362 AC65;
     so does text deleted or reworded on an NPC card's or ship's Notes tab,
     `registry.js` `registerSheetNotesRemovalHook` — issue #364
     SNAPSHOT-NOTES-TAB-DELETE).
   - **It holds every active hidden plan**, so it is the GMs' alone: stored
     in the Secrets journal, read only by `narrator.js`
     (`secretsStayHidden.test.js`), never by a card builder, a panel or a
     player's client. Narration on a player's own key sends none. Nor does a
     player's client read the plans themselves (issue #362 D1): every plan
     read is a GM's (`secrets.js` `secretPages`); a Private Channel turn
     there asks the canonical GM for the decided plans in play
     (`requestPlansInPlay`), and the Session panel reads the table's view
     the canonical GM keeps (`plansShownToTable`). A fact block relayed to
     the canonical GM (`narrator.sidecar`) writes no plan by id: its
     `reveals` and its `plans` but the answers to its own requests are
     dropped, and the step a vignette or complication was made to play rides
     apart (`forced`), standing only as the canonical GM would force it
     (issue #362 D2).
   - **Section moves are two-sided.** A per-beat section the snapshot covers
     is left out of the context when there is one (`buildNarratorSystemBlocks`
     — nothing is sent twice) and still rendered when there is none. A new
     durable section is a new unit kind in `collectWorldUnits` *and* a
     per-beat fallback; a new volatile one goes in the context only. A rule
     in the standing or mode block names no section only one layout has: it
     is worded for both — "a character who has no card of their own in this
     prompt", "the people recorded for the active sector" — so the cached
     rules are the same bytes with and without a snapshot (the identity
     anchor named ENTITIES IN SCENE, which a snapshot request does not
     have — issue #362 AC66).

8. **The session summary is a droppable convenience, not a fact store.** It
   is a view of the session record (invariant 9; issue #382 slice 3 —
   `src/record/summaryView.js`): made from the session read with the table's
   corrections — each beat's facts, and TOLD AS the narration, which may lend
   wording and never an event — never summary-of-summary, debounced at
   `round(1.5 × narratorContextCards)` beats, and must never be retained at
   the expense of any §6.5 ledger tier or the never-dropped facts (frame /
   binding truths / ship position) — those defend load-bearing facts; the
   summary only carries narrative texture. Its source tells what play let go
   (`## LET GO`, from the record's `frame` events — overhaul 2 §7.4) under a
   rule that nothing there is told at all, and that TOLD AS holds the
   narrator's own colour, none of it an event. It is kept on its session's page
   (`sessionRecord.views.summary`) and shown only while the span it was made
   from reads the same: a correction — an X-Card, a strike, a changed name,
   an upgrade's supersede — makes it stale, and it is made again; there is no
   drop, mark or catch-up of its own to add. Keep it canonical-GM-written and
   fail-open: a summary error returns what stood and never blocks a
   narration. It is made after a narrator card posts
   (`registerRollingSummaryRefreshHook`, which also makes an earlier
   session's owed one — `refreshStaleSummaries`), at every scene end — a
   turn, `!scene end` (overhaul 2 §4.4: the scenes before this one are told
   by it) — at End a Session and at the
   closing session's mint, never inside `buildNarratorExtras`, which only
   reads the view. A move that settles something for good is a LASTING beat
   in its source (`chronicleKeeps.lastingChangeOf`), and every LASTING beat is
   told. LAST SESSION is read from the record by one accessor
   (`lifecycle.js` `lastSessionToTell`): the newest earlier begun session's
   summary, then what a session nobody began played, as facts. Full drop
   priority in `decisions.md` → "Rolling session summary".

9. **The session record is one record of what happened** (issue #382;
   `docs/flows/session-record-flow.md`). Each event kind is written at one
   place, through `recordEvent` against one table (`RECORD_EVENTS`,
   `src/record/events.js`), by the canonical GM, after the write it
   describes has landed — on the session's own Session Log page as one
   dotted key of its `sessionRecord` flag, never in campaignState. Its
   observed kinds are taken where one place sees every writer: a narration
   card as it posts (the flag family above — a new card type needs its mode
   in `record/cards.js`), a sheet change in the update hooks (a module writer
   that knows the cause passes `recordCause` in the update's options), a
   truth set or struck by diffing the two ledger saves (and the frame — its
   `letGo` too, overhaul 2 §7.3); a scene's start carries why it began, in
   words, and its place and ship (`scene.started` `cause` / `what` / `place`
   / `ship`), its end whether it turned (`scene.ended.turn` — §4.6). It is read through
   `readRecord` alone, with the corrections applied at read — an X-Carded or
   superseded narration and all it set gone, a strike gone, every changed name
   written as the new one — and nothing stored is rewritten but by the
   X-Card, which blanks what it removed (decision D3). A view of it — the
   Session Log page, the campaign recap (its source: the record's facts, no
   narration, and how things stand read live; its reply cited sentences) — is
   a cache keyed by the hash of the source it was made from, the session
   summary (invariant 8) among them; the `!recap session` card keeps nothing,
   made from the read each time it is asked for. Hidden plans
   (and their clocks), Private Lines, whispers and Private Channel turns are
   never recorded. A new kind is a row with its writer and its reader in the
   same commit, and a new relay row is a recorded `choice` or says why not
   (`tests/unit/sessionRecordEvents.test.js`).

## Tuning knobs (don't add new ones before using these)

`narratorContextCards` (ring depth) · `sceneContextCards` ·
`narratorSessionSummary` (rolling session summary on/off) ·
`worldSnapshot` (the world snapshot on/off; its triggers are the table in
`snapshotEvents.js`, its size rule `CHANGES_MAX_TOKENS` / `CHANGES_MAX_SHARE`) ·
`factContinuity.sceneFrame` · `factContinuity.maxLedgerTokens` ·
`factContinuity.consistencyCheck`. Symptom → knob table: architecture doc §7.
