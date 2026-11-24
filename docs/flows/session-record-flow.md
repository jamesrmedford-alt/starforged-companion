# Session record flow — one record of what happened

Issue #382 ("one record of what happened; every summary derived from it").
A source-verified producer → store → consumer map of the session record: what
writes each event, where it is kept, what reads it. A write-through mirror of
the code (rules/reachability.md, "The through-line"): a change to a site, a
kind or a view updates this file in the same commit.

## The record

- **One list of events a session**, written by the canonical GM as each thing
  happens at the table. Each event is `{ id, k, at, seq, s, scene, who:
  { user, actor }, ref: { …stable ids }, d: { …facts }, text? }` — facts
  (ids, numbers, enum values, the table's own words) and at most one text
  field (a line's words, or a narration's prose). Prose is never read as a
  fact.
- **The kinds** are one table, `RECORD_EVENTS` (`src/record/events.js`): a
  row a kind, naming its `d` fields, its `ref` ids, whether it carries text,
  the fields an X-Card blanks (`blank`) and the views that read it (`readBy`,
  ids of `RECORD_VIEWS`). `recordEvent` drops a field its row does not name.
- **Stored** on the session's own page of the Session Log journal
  (`World Journal — Session Log`), as the page flag `sessionRecord` —
  `{ v, sessionId, createdAt, seq, events: { <id>: event }, views: { <view
  id>: cache } }` (`src/record/store.js`). An append is one dotted update —
  `flags.starforged-companion.sessionRecord.events.<id>` and `…seq` — so
  only that event goes over the socket (Foundry 13.351: the update sends its
  diff against the source, and a flags scope diffs key by key; Quench
  "Session record" pins it). The page is get-or-create by its session id
  (`getOrCreateSessionLogPage`, one creation for two makers in one tick).
  Never in campaignState.
- **Written** by `recordEvent(kind, payload)` (`src/record/record.js`): on
  the canonical GM it queues onto the record's own write chain (one page
  update for what one tick queued); on a co-GM it relays (`record.append` in
  `GM_ACTIONS`, written by `applyRecordAppendFromRelay`, which rebuilds each
  event against its row and takes only a GM requester's); on a player's
  client it records nothing. It never throws, never blocks play, and a stale
  page (its connection dropped) writes nothing. Its writes carry the update
  option `recordWrite` (`isRecordWrite`): the page listeners that have nothing
  to do with the record return on it (Entities panel, Session panel; the
  others already ignore a Session Log page).
- **Read** through `readRecord(scope, source)` alone (`src/record/read.js` —
  the only reader of `sessionRecord.events`, swept by
  `tests/unit/sessionRecordEvents.test.js`), which returns the sessions as
  beats with the table's corrections applied and a hash of the corrected read.
- **Never recorded:** hidden plans (made, decided, their clocks and rolls),
  Private Lines, a safety flag's text, whispers, Private Channel turns, the
  detector's drafts, dismissals, art, telemetry.

## Producers — where each kind is written

| Kind | Site | How |
|---|---|---|
| `session.begun` | `beginSessionOnce` (`src/safety/sessionLifecycleDialogs.js`), after Begin's fields are saved — the table as play begins (`recordSessionEdge` → `tableSnapshot`: PCs' meters, impacts and XP via `readCharacterSnapshot`, open vows via `readVows`, open tracks, place) | explicit |
| `session.begun` (`resumed`) | `record.js` `resumedSessionEvents` — a world upgraded mid-session: the record's first write for a begun session with no record opens it with the table as it stands | explicit |
| `session.ended` | `endSessionOnce` (`reason: "end"`), after the gate write; `rollSessionIfDue` (`src/session/lifecycle.js`, `reason: "idle"`) for a begun session End never closed, on that session's page | explicit |
| `line` | the chat hook (`src/index.js` `recordLine`), once the session gate passed and the speaker is resolved: `via` typed / button / token / narrate-only from the message's flags; `repost` for a card's button that posts the line again (`narrateOnly`, `bypassPacing`); a Batch Mode round's entry where the round takes it (`src/batch/driver.js` `rollRound`, `via: "round"`, `ref.round`) | explicit |
| `move.resolved` | `rollAndApply` (`src/moves/movePipeline.js`), once the roll card is on the table — free flow and a round both come through it; a progress roll on the system's sheet (`src/index.js` `recordSheetProgressRoll`, `ref.res: native-<card id>`); a `!bond` roll, from its card's `bondRoll` flag (`src/record/cards.js`, `ref.res: bond-<card id>`) | explicit / observed |
| `move.upgraded` | Burn Momentum (`src/moves/burnMomentum.js`) and Improve Result (`src/moves/improveResult.js`), once the upgraded outcome is applied | explicit |
| `move.kept` | `keepHeldResult` (`src/moves/heldResult.js`) | explicit |
| `sheet.changed` | `src/record/sheetWatch.js`: every client stamps a PC's sheet values (meters, impacts, legacies, XP — `readSheetFacts`) and a companion's or vehicle's track (`readAssetTrackFact`) into its own update's options (`preUpdateActor` / `preUpdateItem`); the canonical GM records each value that moved (`updateActor` / `updateItem`). The cause rides the options: a module writer that knows it passes `recordCause` (the move's meters in `persistResolution`, an upgrade's in `runUpgradeStep`, the session's momentum, the suffer executors' — `sufferCause`, with the suffer card's resolution as `recordRes`); a mirror's sibling write is `mirror`; a module write with none `module`; a hand on the sheet `sheet` (decision D9) | observed |
| `narration` | `src/record/cards.js`: one `createChatMessage` hook on the canonical GM takes every card narrator memory takes (`narratorMemoryCard`) and maps its flags — `narrationId`, `resolutionId`, `roundId`, `upgradeOf`, `actorId`, the mode | observed |
| `truth.set` / `truth.struck` | `src/record/ledgerDiff.js`, by truth id, after the two saves of the scene ledger from a working copy land — `writeSceneLedgerFields` (`src/factContinuity/sceneLifecycle.js`) and the move's record (`src/moves/persistResolution.js`). Every ledger writer saves through one of the two (the narrator's fact block, `!truth` / `!state`, the correction dialog, the inciting premise, an upgrade's retraction). A strike or Replace by the table is `truth.struck`; the X-Card's and an upgrade's retractions are not (that is `narration.removed`); a truth that leaves unretracted (a scene's end) is not struck | observed |
| `name.changed` | after each write of `campaignState.nameChanges` lands — `!truth` (`chatCommands.js`), the correction dialog (`correctionDialog.js`), the sidebar rename (`nameChanges.js` `recordNameChange`) — through `recordNameChanged`, which records only a change the store holds | explicit (swept: every `withNameChange(` writer calls it) |
| `scene.started` / `scene.ended` | `openScene` once its start is in the store; `persistEndedScene` once the end landed (`src/factContinuity/sceneLifecycle.js`) | explicit |
| `frame` | the ledger differ (`ledgerDiff.js`): a changed `sceneFrame` in the same two saves — where, who is present, the situation, the scene's question and whether it is answered; `ref.nar` the narration that wrote it | observed |
| `question` | the card hook (`cards.js`): an `@scene` answer's card (`sceneResponse` + `sceneQuestion`) records its question before its narration | observed |
| `choice` | `runGmAction` (`src/multiplayer/gmRelay.js` `recordChoice`), after the handler took the press: a `GM_ACTIONS` row marked `record: true` — the card presses that are choices in play; the pick is the press's own option id (`choice`, `way`, `pick`, `option`, `pickKind`, `sufferId`, …), the card's `resolutionId` ties it to its move. Every other row is named in `tests/unit/sessionRecordEvents.test.js` with why it records none | observed |
| `track.begun`, `progress.marked`, `position.changed`, `track.ended` | `writeTracks` (`src/ui/progressTracks.js`), once its save landed — `trackDiff.js` over the list before and the list saved, by track id (a vow's and a connection's journal twin left out) | observed |
| `fight.offered` | `postCombatThresholdCard` (`src/index.js`), once its card posted | explicit |
| `vow.sworn`, `vow.linked`, `vow.closed`, vow `progress.marked` | the sheet watch on a PC's vow Items (`sheetWatch.js`, `readVowFact`): created (sworn), its track moved, completed (closed — forsaken when the forsake flags it), tied to a connection (`linkedConnectionName`). A shared vow's copies each fire; the read counts them once by `vowId` | observed |
| `connection.made` / `.developed` / `.bonded` / `.lost` | `createConnection`, `markRelationshipProgress`, `forgeBond`, `loseConnection` (`src/entities/connection.js`), once the record took it | explicit |
| `entity.confirmed` | `confirmDraft` (`src/entities/entityExtractor.js`), once its draft row is confirmed — a draft is the detector's guess, never recorded | explicit |
| `place.arrived` | the current place set anew: a move's arrival saved with its record (`persistResolution.js`) or after its upgrade (`index.js`), `!at` (`index.js`), the Entities panel's toggle (`entityPanel.js`) — `tableSnapshot.js` `recordPlaceArrival` names the place. A ship token dropped on a pin posts a Set a Course: its arrival is a move's. A token moved by hand changes no current place and records none | explicit |
| `oracle.asked` | `captureOracleResult` (`src/index.js`), once the ring took it | explicit |
| `clock.advanced` | `writeState` (`src/clocks/clocks.js`), every clock save diffed: a clock whose fill rose. A hidden plan's clock (`planId`) is never recorded | observed |
| `reward.granted` | `recordGrantedReward` (`src/character/actorBridge.js`), once the sheet took it | explicit |
| `narration.removed` | the X-Card's finish (`finishXCardRemoval`, `src/context/safety.js`), first thing, awaited — `recordNarrationsRemoved(ids, { by: "xcard" })` records it and blanks, on every page, what the removed narrations told (their `narration` text, their truths' words — the row's `blank` fields); a Burn / Improve supersede (`retractSupersededNarrations`, `src/moves/resultUpgrade.js`, `by: "superseded"`) — hidden at read, not blanked | explicit |

Not recorded (traced, issue #382 slices 1 and 2): the system sheet's **action**
rolls (the module does not read them); a recommit's challenge dice (no move,
no outcome — what it changes is a track's progress, `progress.marked`); the pipeline's
own bonded Develop roll beside its move. A sheet change a module writer makes
without passing its cause is recorded as `module`, in a beat of its own — the
command vehicle's integrity (`ship.js` `changeIntegrity`) and the outcome
effects `applyOutcomeEffects` writes (a legacy mark, a companion's health)
among them.

## The read — `readRecord(scope)`

`scope.session`: a session id, or `"campaign"` (oldest first); `through`: no
event past that counter — but the table's corrections (`CORRECTION_KINDS`: a
strike, a removal, a name changed) apply whenever they were made, so a view
made from a span is stale once one reaches it. Pure but for its default
source (`pages.js` `recordSource` — the pages, the current session, each
actor's current name). A truth about a recorded character is named by its
actor's current name (its subject holds the id). `recordStamp(record)` is a
page's counter, event count and newest id — what `summaryView.js` keys its
one memo of a read by.

**Beats** are computed from ids the events carry, never threaded:
1. events sharing a `ref.res` are one beat (the move, its changes, its
   narration, its upgrade) — an effect recorded before its roll card still
   joins it;
2. a paced narration joins its speaker's latest line that has no telling;
   a line a button posted again joins that line while nothing came of it;
3. a round's one narration goes on the round's last untold beat;
4. a truth joins the beat of the narration that set it — whichever was
   recorded first: a fact block's save (its truths) is sent before its card
   (the narration), and the server answers them in that order, so a truth
   recorded before its narration waits for it by `ref.nar` (`read.js`
   `joinNarration`; known-issues NARRATOR-TRUTHS-NOT-ON-THEIR-BEAT — they were
   "At the table" beats of their own);
5. what play did (a vow sworn, an arrival, a clock's advance, a choice…) joins
   its move's beat by `ref.res`, else its narration's by `ref.nar`, the same
   way;
6. an `@scene` question is a beat of its own, kind `question`, its answer's
   narration with it;
7. anything left (a causeless sheet edit, a GM's `!truth`) is a table beat.

A beat's `lasting` is what it changed for good — a move's lasting change
(`chronicleKeeps.js` `lastingChangeOf`), else what play did (a vow sworn,
fulfilled or forsaken, a bond forged, a connection made or lost, an arrival, a
fight decided, an expedition finished): the turning points a recap tells. A
beat carries the scene frame as of it (`where`) and its scene; the session
lists its scenes.

**Corrections**, in order, the stored events untouched:
1. *Removals* — every `narration.removed` of the campaign: an X-Card's beat
   keeps its move and changes, marked `removed: "xcard"`, its line and
   telling null (a round's: every line it told), its truths gone; a
   superseded narration and all it set are dropped, the re-narration
   (`upgradeOf`) standing in its beat, `move.upgraded` giving the outcome.
2. *Strikes* — a struck truth leaves `established`, its replacement stands,
   the beat that told it gets `leaveOut`.
3. *Names* — every `name.changed` of the campaign folded uncapped
   (`withNameChange`, `cap: Infinity`) and written as the new name in every
   words, label and prose field (`nameChanges.js` `writeNewNames` — the whole
   name, the part the new one does not share, and its short form after "the"
   or before "'s": decision D5); an actor's name is read through its id.
4. *Cutaways* — a closing vignette (`vignette_close`) and Begin's Spotlight
   Vignette (`vignette_spotlight`, issue #381 slice 3) are `cutaway` beats: told
   out of the characters' sight, never what they did (`read.js` `CUTAWAY_MODES`;
   the recap's facts leave them out).

`hash` is FNV-1a over the corrected read: any correction changes it.

A session from before the record (a page with no `sessionRecord`, or none)
is returned `legacy: true` with the story its page holds and no beats.

## Consumers — the views

| View | Module | Reads | Kept |
|---|---|---|---|
| `log` — the Session Log page | `src/record/sessionLogView.js` | `readRecord({ session })`: "What happened" (a line a beat: who, their own words — typed or a round's entry —, the move and its outcome, what changed, what play did; a question asked of the narrator; "A new scene" where one began; no narration), "Established and standing", "Corrected by the table" (the new name only; a strike; "removed by the table"), "Session summary" (the session summary view while it stands — `summaryView.js` `sessionStoryOf`; with no view yet, the story a page held before slice 3 — under the legacy page's heading, which the playtest runner's `sessionLog` check reads) | the page's body, rendered in code on the canonical GM on the record's chain; `views.log.sourceHash` — rendered again only when the read's hash, the summary or the setting moved: at once for a session's edges and a correction (a name change or a removal re-reads every page), at most once a minute in play, and when a summary view is stored (`getRollingSessionSummary`, `applyRelayedSessionSummary`) |
| `summary` — the session summary: STORY SO FAR, LAST SESSION, the world snapshot's EARLIER SESSIONS, the Private Channel's story, the Session Log page's "Session summary" | `src/record/summaryView.js`, made by `narrator.js` `getRollingSessionSummary` (the one writer) | `readRecord({ session })` → `summarySource`: `## THE SESSION` — numbered beats, oldest first, each beat's facts (`beatFacts`: who, the player's typed words, the move and its outcome, what changed, what play did, what was established and stands; LASTING marked) and, under it, `TOLD AS` the narrator's prose (D4: the summary is given the telling, the recap is not); `## QUESTIONS` (asked of the narrator — nothing happened because of one); `## STRUCK BY THE TABLE — did not happen`; `## EARLIER THIS SESSION (written before the record)` for a session the record opened `resumed`. Cutaways and fact-less tellings are left out. The reply is a JSON list of cited sentences (`citedRecap`; an uncited one is dropped, an untold LASTING beat sends it back once, a non-JSON reply is asked for once more); the text kept has every changed name written as the new one | the session page's `sessionRecord.views.summary` `{ text, cites, through, sourceHash, madeAt }` — **valid** while the source built from `readRecord({ session, through })` hashes to `sourceHash` (the read applies the table's corrections made after `through` — `CORRECTION_KINDS`: a strike, a removal, a name — so a correction inside the span makes it stale: never shown, made again); **behind** while the full source holds more. Made on the canonical GM after a narrator card (debounced: K = `rollingSummaryThreshold` beats beyond it, every beat for none or a stale one), forced at End a Session and at the closing session's mint; an earlier begun session's owed summary (`summariesOwed`: never made, stale, behind — a round narrated after its session closed) by `refreshStaleSummaries` after each narrator card, at the world load and when the GM's key is set. A keyed player's client at a keyless table makes it and relays `{ sessionId, text, cites, through, sourceHash }` (`narrator.summary`); the GM stores it only when its own read of the span gives that hash. A reply made across a correction is discarded |
| `recap` — the campaign recap | `src/record/recapView.js`, called by `narrator.js` `getCampaignRecap` | `readRecord({ session: "campaign" })`: THE RECORD — each session's turning points, the latest session in full, facts only (D4), each line an id; the recap a session's start is told (`sessionStart` — the session's first narration, `sessionStartRecap`; the world load's "Previously On" and its cache refresh) leaves the session under way out, so the last session before it is the one in full, while End a Session's and `!recap`'s tell the session under way; WHERE THINGS STAND read live (`standingLines`: meters and impacts, vows and their progress, connections, open tracks, the place, the open scene's state and question); THE PLAYERS' OWN NOTES (Chronicle entries a player wrote, edited or pinned — D7); EARLIER SESSIONS (a session from before the record: its story and Chronicle entries, labelled). The reply is cited sentences (`citedRecap`, D11); the text kept has every changed name written as the new one (`recapText`) | `campaignState.campaignRecapCache` `{ text, cites, generatedAt, sourceHash }` — valid while the source hashes the same (`campaignRecapCacheKey`); a reply made across a correction is discarded |
| `chronicle` — the Chronicle's automatic entries | `src/record/chronicleView.js` `registerChronicleScribe` (at `ready`; a `store.js` `onRecordWritten` listener on the canonical GM) → `chronicleWriter.js` (the scribe) | when a `narration` of play is written (mode `move`, `paced`, `round` — a beat of kind `play`), its beat, read ~2 s later (`scribeArgsFor` — so the beat's other writes have landed): FACTS (the move and its outcome, what changed, what play did, what was established and stands; a round's, each line under its character's name), the PLAYER'S LINE (the player's own words; a round's characters, each with theirs), the NARRATION as the telling — "the entry states what FACTS and the PLAYER'S LINE say; NARRATION may lend a word, never an event" — the PC (the beat's), what lasted (`lasting`). Nothing for a telling the X-Card removed or an upgrade superseded since (its re-narration is scribed instead). On a `truth.struck`: the narrations that set the truth (`read.js` `narrationsOfTruths`) | each PC's Chronicle journal, as before (`chronicle.js`, the players' book): an entry carries `narrationId`, `eventId`, `sourceHash`. A strike removes the automatic entries of those narrations, save a pinned or player-edited one (`retractChronicleOfNarrations`; it was a word-overlap match). A changed name is written as the new one when an automatic, unedited entry is read (`getChronicleEntries`, `read.js` `recordNames`); the stored text is not rewritten. The X-Card's finish removes its narration's entries as before (`retractNarrationChronicle`) |
| `sessionCard` — the `!recap session` card | `src/record/sessionCardView.js`, posted by `narrator.js` `postSessionRecap` (`!recap session [N]`, `index.js` `handleRecapCommand`) | `readRecord({ session })` — the session `sessionCardTarget` names: the current one (by `campaignState.currentSessionId`, or its own number), else the newest session whose `session.begun` the record numbers N (`summaryView.js` `sessionIdOfNumber`); a line a move (each beat with a `move`: who rolled it by their current name, the move by its title — i18n `moveDisplayName` — and its final outcome, a burn's or an improvement's `move.upgraded` included), how many moves and strong hits, the match (`move.resolved`'s `isMatch`); a move whose telling the X-Card removed, or whose narration failed (no `narration` event), still counts; a paced line, an `@scene` question and a vignette are no move; nothing of any telling is shown. A session from before the record says its moves were not recorded; a number no session has says none are | nothing: made in code each time it is asked for, its chat card the only copy. No chat read — a cleared chat log leaves it whole |

Phrasing shared by the views is `src/record/phrasing.js` (a move, a sheet
change, what play did); a beat's facts are `recapView.js` `beatFacts`, read by
the recap and the summary alike.

**LAST SESSION** — `lifecycle.js` `lastSessionToTell(campaignState)`, the one
accessor (read by `narrator.js` `previousSessionSummaryFor`, the world
snapshot's `memoryUnits` through `summaryView.js` `earlierSessionStories`, and
the opening scene's `whereLastSessionStopped`): the story of the newest
earlier session a table began (a `session.begun`, or a page that holds a
story, or a page from before the record) — its valid summary view, else the
story its page held — followed, as facts, by what was played in any session
nobody began since ("Played between sessions, while no session was begun: …").
Nothing is carried from session to session in campaignState, and nothing is
marked owed.

**Worlds from before the summary was a view** (issue #382 section 9):
`worldJournal.js` `keepPreRecordSummaries`, at the world load on the canonical
GM, copies once — additive, idempotent — the LAST SESSION a world kept
(`campaignState.previousSessionSummary`) and the summary of the session under
way (`campaignState.sessionSummary`) onto those sessions' Session Log pages as
their story (`sessionLogPage.summary.narrative`, `beforeRecord: true`; a
session with no page gets one). Both fields are read there and nowhere else,
and written by nothing (tests/unit/campaignStateFields.test.js ONE_SIDED).

`sessionLogAutoWrite` off: the record is still written; the page's body is
its title alone. A page from before the record is never rendered over.

Retired with this (decision D6): the Session Log's "Scene log" of the
detector's below-salience lore and threat lines (`appendSessionLogBeat` and
its three calls in `routeWorldJournalResults`), its X-Card undo in
`undoNarrationEntries`, and the lore titles and threats End a Session copied
onto the page (`writeSessionLog`, `retractSessionLogSummary`'s lore half).

Retired with slice 3 (design 8.2): the summary made from the session's cards
(`summarySourceEntry`, the leave-out list, the names note
`formatNameChangesForSource`, the "Settled by this move" line `settledByMove`),
its coverage and supersede guards (`summaryCoversCards`,
`noteSupersedingCards`, `anySuperseded`, `dropSummaryOfSupersededCards`), the
X-Card's summary half and `dropLastSessionTelling`, `bringLastSessionUpToDate`,
`finalizeSessionSummary`, `storyCardsThrough` / `sessionStoryThrough`,
`catchUpUnsummarisedSession`, the mint's carry (`lastSessionTextParts` /
`lastSessionTextFrom` / `lastSessionSettled` / `withoutDisplaced`,
`sessionRoundUnnarrated`, the owed-summary bookkeeping in `rollSessionIfDue`),
`writeSessionLog` / `restoreSessionLogStory` / `retractSessionLogSummary` /
`persistSessionLogPage` / `renderLegacySessionLogContent`, the strike's
`markSummaryForRegen`, `persistResolution`'s `sessionSummary` merge rule, and
the campaignState fields `sessionSummary`, `previousSessionSummary`,
`unsummarisedSession` (schema defaults, mint fields, store-owned list).

Retired with slice 4 (design 8.4): the five `scheduleChronicleEntry` calls in
`narrator.js` (a move, its retry, a paced line, its retry, a Batch Mode round
— the scribe's one trigger is the record), `chronicleKeeps.js`
`roundLastingChange` (a round's `lasting` is its beats'), and the strike's
word-overlap reach into the Chronicle (`chronicle.js` `retractStruckChronicle`
and its call in `retractions.js` `propagateRetraction`).

Retired with slice 5 (design 8.5): the `!recap session` card's reading of
the chat — `narrator.js` `recapSessionFor` (the scan of the narrator cards
for session N's number) and `postSessionRecap`'s per-card loop — and
`sessionNarratorCards`' / `inNarratorMemory`'s `forRecap` reading (which kept
a fallback card and an X-carded narration for it). The flags only it read are
retired with it: the move narration's `isMatch` (its "A match was rolled"
line — RECAP-MATCH-DEAD's), the round card's `isMatch` and `roundNumber`
("Round N"), the round fallback card's `roundNumber`, and each round entry's
`moveId` and `isMatch` (`roundEntriesFlag`). The move narration's `moveId` /
`outcome` and each round entry's `outcome` stay, read by no module code but
by the playtest runner (`test/ci/playwright` `lib/table.mjs` → `mechanics.mjs`,
`playthrough.mjs` `roundResolved`) and marked `UNWIRED` where they are
written; the result card's and the round's paused notice's `roundNumber`
were never the card's reading (neither is a narrator card), and stay as they
were.

Every summary of play issue #382 named is now a view of the record.
