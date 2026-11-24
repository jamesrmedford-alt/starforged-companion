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
event past that counter. Pure but for its default source (`pages.js`
`recordSource` — the pages, the current session, each actor's current name).

**Beats** are computed from ids the events carry, never threaded:
1. events sharing a `ref.res` are one beat (the move, its changes, its
   narration, its upgrade) — an effect recorded before its roll card still
   joins it;
2. a paced narration joins its speaker's latest line that has no telling;
   a line a button posted again joins that line while nothing came of it;
3. a round's one narration goes on the round's last untold beat;
4. a truth joins the beat of the narration that set it;
5. what play did (a vow sworn, an arrival, a clock's advance, a choice…) joins
   its move's beat by `ref.res`, else its narration's by `ref.nar`;
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
4. *Cutaways* — a closing vignette is a `cutaway` beat.

`hash` is FNV-1a over the corrected read: any correction changes it.

A session from before the record (a page with no `sessionRecord`, or none)
is returned `legacy: true` with the story its page holds and no beats.

## Consumers — the views

| View | Module | Reads | Kept |
|---|---|---|---|
| `log` — the Session Log page | `src/record/sessionLogView.js` | `readRecord({ session })`: "What happened" (a line a beat: who, their own words — typed or a round's entry —, the move and its outcome, what changed, what play did; a question asked of the narrator; "A new scene" where one began; no narration), "Established and standing", "Corrected by the table" (the new name only; a strike; "removed by the table"), "Session summary" (the story End a Session writes, `summary.narrative` — the legacy page's heading, which the playtest runner's `sessionLog` check reads) | the page's body, rendered in code on the canonical GM on the record's chain; `views.log.sourceHash` — rendered again only when the read's hash, the story or the setting moved: at once for a session's edges and a correction (a name change or a removal re-reads every page), at most once a minute in play, and when End writes the story (`persistSessionLogPage`) |

| `recap` — the campaign recap | `src/record/recapView.js`, called by `narrator.js` `getCampaignRecap` | `readRecord({ session: "campaign" })`: THE RECORD — each session's turning points, the latest session in full, facts only (D4), each line an id; WHERE THINGS STAND read live (`standingLines`: meters and impacts, vows and their progress, connections, open tracks, the place, the open scene's state and question); THE PLAYERS' OWN NOTES (Chronicle entries a player wrote, edited or pinned — D7); EARLIER SESSIONS (a session from before the record: its story and Chronicle entries, labelled). The reply is cited sentences (`citedRecap`, D11); the text kept has every changed name written as the new one (`recapText`) | `campaignState.campaignRecapCache` `{ text, cites, generatedAt, sourceHash }` — valid while the source hashes the same (`campaignRecapCacheKey`); a reply made across a correction is discarded |

Phrasing shared by the views is `src/record/phrasing.js` (a move, a sheet
change, what play did).

`sessionLogAutoWrite` off: the record is still written; the page's body is
its title alone. A page from before the record is never rendered over.

Retired with this (decision D6): the Session Log's "Scene log" of the
detector's below-salience lore and threat lines (`appendSessionLogBeat` and
its three calls in `routeWorldJournalResults`), its X-Card undo in
`undoNarrationEntries`, and the lore titles and threats End a Session copied
onto the page (`writeSessionLog`, `retractSessionLogSummary`'s lore half).

## Not yet a view of the record (later slices of issue #382)

The session summary / LAST SESSION / the snapshot's earlier sessions
(slice 3), the Chronicle's automatic entries (slice 4) and the `!recap
session` card (slice 5) still read what they read before; see
`narrator-context-flow.md`.
