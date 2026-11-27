# Narrator consistency flow — as implemented

The consistency-check pipeline end to end: what triggers the audit, what it
compares prose against, how a catch reaches the GM, and what the remedy
affordances actually do — verified against source (v1.7.30 cycle; where the
audit runs and the `!truth` / `!state` relay updated for the 2026-10 audit).
Sibling docs: `narrator-context-flow.md` (the ledger the audit defends),
`character-detail-flow.md` (the RECORDED IDENTITIES section).

Prompted by: "the same treatment applied to … narrator consistency" —
scoped as the fact-continuity consistency-check pipeline (detection →
review card → correction), plus the adjacent WJ lore-contradiction path.
All three audit defects and the actionable exposures were **fixed in the
same cycle** ("Please address all identified issues") — §3 is the resolved
ledger, §4 the dispositions.

## 1. Trigger and audit scope

`applyNarratorSidecar` fires `runConsistencyCheck(prose,
auditCampaignState(campaignState), {matchedEntityIds, currentLocationId,
narrationId, obligations, narrationKind})` on the **canonical GM only**, fire-and-forget (never
blocks or delays the narration post), for every mode that applies a sidecar
— all nine narrator paths — and for an `@scene` answer, which applies none
(`sceneAnswerText`, known-issues SCENE-ANSWER-NOT-A-CAMERA: an answer records
nothing, and is still read against the ledger — a wrong answer is the one
thing left to catch). Gated on `factContinuity.consistencyCheck`
(**default ON** since 2026-07; the unregistered-settings fallback stays false
so unit tests never fire API calls).

The ledger it audits is the one the sidecar persist leaves in the store
(`auditCampaignState`, issue #329 X02): the latest stored ledgers with this
narration's own entries merged in by the persist's policy
(`mergeSceneLedgers` — a truth the X-Card or a `!truth strike` retracted
meanwhile stays retracted, an X-carded narration's state and frame are
dropped, a store on another scene wins) and the session's strikes as stored.
The move pipeline narrates from a snapshot taken before its confirm dialog;
W05 made the narration's prompt read the live ledgers, and the audit kept the
snapshot, so an X-Card played while the move waited handed the removed beat
to the audit as binding, and a strike typed then was not under RETRACTED
FACTS. When nothing is left to audit against, no audit is sent.

Which client that is: move narration always runs on the canonical GM, and
the Claude-calling commands (`@scene`, `!recap`, `!ship envision/history`,
`!incite` — `RUN_ON.CLAUDE`) and oracle follow-ups (`requestOracleNarration`)
run on the keyed canonical GM whenever one is connected, so their prose is
audited too. Only the fallback — no keyed GM, so a keyed author narrates with
their own key — runs off the canonical GM; there `applyNarratorSidecar`
applies no side-data and fires no audit (the skip is debug-logged), and the
prose is unaudited. See `narrator-context-flow.md` → "Where each call runs".

What it reads is the narration's **judged view** (`checks.js judgedView`,
issue #399 D1) — the prose without its fact block and without its closing
offer line, the one place the rules let a move be named; the pre-post judge
(§1b) reads the same. Round 9's audit carded that line five times, four as
the move made. The narrator says what narration it is (`narrationKind`): a
**cutaway** — a session's closing vignette or a spotlight
(`narrateSessionVignette` passes `cutaway` to `applyNarratorSidecar`) — is
not held to THE PLACE, and with nothing else in its ledger it is not audited
(round 9's a93, a closing cutaway to Tamsin, was carded against the
characters' place).

The audit prompt (`buildAuditPrompt`) compares that view against what binds in
the ledger block (`buildLedgerBlock` at `maxTokens: Infinity`; overhaul 2
§5.8, D15) — THE PLACE (THE SCENE's Place and Ship lines: where the
characters and their ship are by the table's record), RECORDED IDENTITIES
(PC + matched-NPC pronouns, 2026-07), WHAT BINDS (the player's, the dice's,
the GM's, the premise's truths), RETRACTED FACTS (this scene's strikes and,
since issue #286 B6, the session's earlier scenes' — never a truth the
X-Card retracted, which `sessionRetractedFacts` leaves out so the removed
content is not handed back; issue #321 U07), STANDING NOW (binding state),
and WHAT THIS NARRATION WAS TOLD IT MUST TELL, AND MUST NOT (overhaul 4,
D9's logged class — the narration's obligation lines, one a line with its
list and tag, handed in by the narrator through `applyNarratorSidecar`'s
`obligations`: the move's, the paced line's, the round's, the oracle
follow-up's; they ride an audit the ledger calls for and make no call of
their own; `formatAuditObligations` sends each in its judge sentence where
its kind has one, and never a certain-class line — the code held the
narration to those before it posted, and eleven of round 9's audit findings
were on them, issue #399 D2) —
via one Haiku call (the model `consistencyCheck.js` names, `MAX_TOKENS`
1300, with a `stop_reason` truncation warning, through `api-proxy.js`). What the
narration described — its colour, and the frame's Where and Now — is not
audited: a narration that changes it is no contradiction. Response kinds:
`truth | state | place | retraction | identity | obligation` (a `frame` or
`ship` reply reads as `place`; `obligation`: a TELL line left untold, a NOT
YET told as done, a NOT SO told as true — its subject the line's tag), each
with confidence high/medium/low; parsing is
fence-and-preamble tolerant and never throws.

**Who passes matched entities:** the move path, `@scene`, and paced all
pass `relevance/extras.matchedEntityIds` into the apply ctx, so the audit's
entity-scoped ledger entries and matched-NPC identities are in scope on the
three main prose paths. Since 2026-07 **every** apply site passes
`extras.matchedEntityIds` uniformly — oracle follow-ups included (the
vignette / vow / inciting modes still match nothing, but the plumbing no
longer special-cases them).

## 1b. The pre-post judge (overhaul 4 D9; issue #399)

Before a narration posts, `narrateKeepingObligations` (`checks.js`) holds it
to its obligation lines by class: a certain or floor failure is asked once
more (YOUR DRAFT — NOT POSTED). A NOT YET / NOT SO judge line whose trip
words appear in the judged view goes to one Haiku call (`judgeNarration`,
label `obligationJudge`, 4 s, fail-open), sent the judged view too — it was
sent the whole prose, and re-asked a70 on its own offer line. It runs only on
a GM, with this audit's setting on (`narrator.js obligationJudgeOn`). **A
judge verdict acts only for a kind that has passed the measure**
(`judgeMayAct`; none has yet, issue #399 D7): until then it is logged —
`action: "logged"` on the telemetry row — and the first draft posts. Round
9's four re-asks were all on wrong verdicts. The full class list is in
`narrator-context-flow.md` (the obligations block).

## 2. From catch to correction

- **High-confidence** contradictions dispatch
  `applyStateTransition({entryType: "factContinuity", change:
  "contradicted", kind, …})` → `postContradictionNotification`: a
  GM-whispered **◈ Narrative Review** card naming the subject and violated
  fact — the fact itself, as recorded, and the narration's own words
  (`consistencyCheck.describeContradiction`: the ledger line the audit was
  given, the subject by its proper name; it showed a pointer to the fact —
  issue #354 P2-19), on the card and in the World Journal panel's row.
  Truth/state kinds carry the "Retract the offending fact" button;
  place / identity / retraction / obligation kinds carry a **targeted remedy hint**
  instead (the dialog cannot address them — NARRCHK-REMEDY-MISMATCH fix; a
  place catch points at `!at` or the command-vehicle token, overhaul 2
  §5.8). The correction dialog marks each truth with what it rests on, and a
  GM may **Keep** a colour truth — it binds from then on (`confirmTruth`,
  overhaul 2 §5.3; the record sees `truth.confirmed`). A standing contradiction posts **once per scene** (in-memory dedup
  on scene + subject + violated fact; telemetry still logs every audit). The card carries
  `contradictedTruthId` (the scene truth the catch names, matched from its
  violated text — `resolveContradictedTruthId`; the audit returns no id, so
  it was always null until issue #326 W63; the Retract dialog lists that
  truth first, marked) + `matchedEntityIds` flags. It carries no
  `narratorCard` (issue #399 D5): it co-marked it to surface the render hook,
  and every reader of the flag took it for a narration — the long haul's
  runner counted each card as its line narrated twice. The correction hook
  (`index.js`) reads `factContinuityReview`; the ring's defensive exclude
  (`worldJournalContradiction`) stays.
  **An obligation finding posts no card** until its kind has passed the
  measure (issue #399 D7, `judgeMayAct`): it is returned and logged, as
  every finding is. Round 9's six obligation cards were all wrong.
  The card's `factContinuityReview` also lists it in the World Journal panel
  lists it under Contradictions with **Correct…** (the same dialog, when the
  card has the button) and Dismiss — never the lore actions. Override
  promoted "lore" by the subject's name, which changed nothing, and deleted
  the card and its button while the dedup never posted the catch again; it
  now refuses a fact-continuity catch (issue #325 W34).
- The button opens the **Correct Active Scene Facts dialog**
  (`openCorrectionDialog`), scoped to the card's matched entities + current
  location: in-scope truths get Strike / Replace, state entries get Strike
  / Set. Strikes now feed the CORRECTED do-not-re-assert block and the
  write-layer re-assertion guard (2026-07). The dialog holds no
  campaignState: each row action reads the store as it is at the click (a
  Replace once its prompt closes), applies to a copy and persists only the
  ledger field it changed onto the latest store (`persistSceneLedgerFields`),
  a Replace's name change riding the same write (`onto`) — a strike reaches
  the session summary through the session record's `truth.struck`, which
  makes a summary that told the fact stale (issue #382); a cancelled prompt or a row
  that no longer matches writes nothing — a truth retracted meanwhile
  included: `strikeTruth` / `replaceTruth` refuse an entry already retracted,
  and `mergeSceneLedgers` keeps a store truth the X-Card retracted over a
  correction made on a copy read before it, filing no replacement (a Replace
  saved after the X-Card used to re-file the removed fact under the GM's
  wording — issue #336 Y30). Each click used to write the
  snapshot read when the dialog opened, reverting an X-Card, the next
  narration's truths or a released move lock (issue #321 U06e). The row
  buttons attach on the dialog's `render` event (`dlg.addEventListener`), the
  hook Foundry v13's DialogV2 offers — Strike and Replace closed the dialog
  instead (issue #321 U38).
- **Medium/low-confidence** results are telemetry-only — logged to the
  Pacing Telemetry journal's Consistency Check page
  (`logConsistencyDecision`, GM-gated, fail-open) and never shown to the GM.
- **`contradictionNotifications`** (default on) gates the card itself; off
  means even high-confidence catches are telemetry-only.
- The table-wide text path is **`!truth` / `!state`**
  (`src/factContinuity/chatCommands.js`): syntax is checked on the typist's
  client, then the raw text relays to the canonical GM (gmRelay
  `factContinuity.command` → `applyFactContinuityCommand`), which resolves
  the subject against the full entity roster, applies the strike / set with
  the **requester's** permissions (`ctx.requesterIsGM` — a player cannot
  strike a GM-asserted truth, nor set back a GM's strike or Replace or what
  the X-Card removed: W60, issue #345 D4) to a copy of the store, persists only the
  ledger field it changed onto the store as it is then
  (`persistSceneLedgerFields`; a Strike's summary regen mark in the same
  write) — it wrote its whole read back after a Strike's propagation awaits,
  reverting what landed meanwhile (issue #321 U06b); a command that matches
  nothing writes nothing — and posts the result card. Before
  the 2026-10 audit the command ran on every client, so a player's correction
  only landed via the GM client's re-run — with GM permissions.
- **A correction of a name outlives its scene** (issue #377 item 1,
  CORRECTION-AND-RENAME-DO-NOT-REACH-THE-RECORD). A `!truth set` that gives a
  struck name's correction — "is named the Ashen Wake" struck, "is named the
  Cinder Wren" set, in either order, on the same subject — and a dialog Replace
  that does, record a name change (`nameChanges.js` `nameCorrectionOf` /
  `nameSwapOf`, on `campaignState.nameChanges` in the same write as the ledger;
  only where the words before the name say it is one). So does a GM's rename of
  a card in the sidebar (index.js `syncEntityRecordNameOnUpdate`). Each of the
  three writers puts the change on the session record once its write has landed
  (`recordNameChanged` → `name.changed`, issue #382 —
  docs/flows/session-record-flow.md), as the ledger saves put the set and the
  struck truth there (`truth.set` / `truth.struck`): every view of the record
  — the Session Log page — writes the new name, its short form too, at read
  (`writeNewNames`) — save a strike's own words, kept as struck with the new
  name beside them ("Struck: raider cutter — is named the Ashen Wake (now:
  Cinder Wren)"; written as the new name, the struck truth read as the one
  that stands — known-issues STRUCK-NAME-REWRITTEN-AS-THE-NEW-NAME) —, never where the old name already stands inside a name
  as it is now — its own new one, another change's, another record's, in any
  case — and each place once, from the text as stored: for "Tamsin" →
  "Tamsin Okoro" it wrote "tied the vow to Tamsin Okoro Okoro" on the pages
  and in the recap (known-issues NEW-NAME-WRITTEN-TWICE). The stored list
  (capped) still tells the narrator. A ◈ New Entities Detected row still
  pending under the old name takes the new one in the same call
  (`recordNameChanged` → `entityExtractor.js`
  `carryNameChangeToPendingDrafts`, its card rendered again): the narrator's
  next use of the new name is no new ship to the detector, and a Confirm makes
  the record under it (known-issues DRAFT-CARDS-FOR-ONE-SHIP — "Cinder Wren"
  was offered beside the pending "The Ashen Wake"). CORRECTED is
  its scene's (and its place's); the change is told past both — NAMES THE TABLE
  CHANGED in the narrator's context, every mode, and in the session summary's
  source — wherever the old name still reaches a prompt. In the long haul's
  first live run the old cutter name stayed in 37 later prompts with nothing
  saying it was corrected, and the narrator made a renamed NPC's old surname an
  alias. **The old name cut short is told too** (known-issues
  CORRECTED-NAME-SHORT-FORM): a change's line names each short form of its old
  name the call's own text uses on its own, and what to write for it — "The
  old name cut short is the old name too: for "the Wake" write "the Wren"."
  (`shortFormsInUse`, in `formatNameChangesBlock`; the session summary's
  source, which had a renderer of its own, is the session record's read since
  issue #382 slice 3, and writes every changed name as the new one, its short
  forms included). A short form is one word of the old name, used
  as a name with a word before it in its sentence ("the Wake's guns", "calls me
  Vey", "Captain Vey" — `usesOfNameWord`); what is written for it is the new
  name's word in the same place (last for last, first for first) when that
  word is the new name's alone in the text, else the new name whole. Never
  listed: a word the new name keeps ("Tamsin" of Tamsin Vey → Tamsin Okoro), a
  word of another name the table changed, and a word the text also uses beside
  another capitalised word — part of another name in play ("Juro Vey", "Silent
  Wake") — or inside another changed name as it stands ("Vey" in "Vey's
  Lantern"). An old name written inside its new one, or another changed
  name, is no mention of it: "Tamsin Okoro" names no "Tamsin", and the
  change was told to every prompt that wrote the new name
  (NEW-NAME-WRITTEN-TWICE). A short form on its own also makes an earlier session's change due
  (`mentionsOldName`): for a name the new one shares no word with, only the
  whole old name did, so the third live run's session 3 summary was written
  from "the Wake's registry" with no note. The note gave the old name whole
  until then, and one step after the correction the narrator wrote "The Wake's
  boarding lock" from a prompt that said "the Wake" six times. **The user
  message is told what its own text calls for** (known-issues
  NAME-NOTE-MISSES-THE-USER-MESSAGE): every narrator call sends its user
  message through `callNarratorAPI` → `withNameChangesNoted`, which adds at
  its end each change due for that text that the system prompt's note does
  not tell — the change's line, or its line again when the user message cuts
  the old name short in a way the system's line does not name
  (`formatNameChangesBlock`'s `told` and `context`: the system prompt is read
  for the names it holds, never for a change it makes due). It added nothing
  once the system prompt carried the heading at all, so session 3's opening,
  which quotes the last session's final narration word for word, carried
  "Ashen Wake" beside a note that listed only "Tamsin" → "Tamsin Okoro". A user
  message that already carries the note is not given a second.
- The **WJ lore-contradiction path** (detection pass, `entryType: "lore"`)
  posts the same card WITHOUT the retract button — WJ lore's correction
  affordance is the `!journal` command family (reaffirmed 2026-07).

## 3. Audit defects — all resolved (v1.7.30 cycle)

| Code | Class | Defect → fix |
|---|---|---|
| NARRCHK-TRUNC-SILENT | LOSE-DETECTION | 250-token cap, silent truncation → `max_tokens: 1000` (~15 contradiction objects) and `callHaiku` warns on `stop_reason: "max_tokens"` |
| NARRCHK-CTX-DROPPED | WRONG-DETAIL | Oracle follow-ups (and the no-text modes) omitted matched entities from the apply ctx → all twelve `applyNarratorSidecar` sites pass `extras.matchedEntityIds` uniformly |
| NARRCHK-REMEDY-MISMATCH | design defect | One-size retract button → kind-aware review card: truth/state keep the correction-dialog button; frame / ship / identity / retraction get targeted remedy hints (frame re-emit via `@scene`, `!ship`/token move, sheet/record pronouns, already-blocked note) |

## 4. Design-level exposure — dispositions (2026-07)

- **Cross-turn dedup — addressed.** One review card per (scene, subject,
  violated fact); the in-memory set clears on scene change, so a reload
  re-arms the reminder once. Telemetry keeps the full stream.
- **Medium-confidence catches stay telemetry-only — reaffirmed** and now
  recorded (decisions.md → consistency reaffirmations): high-confidence is
  the GM-interrupt bar; the Pacing Telemetry journal's Consistency Check
  page is the review surface for the rest. Revisit if playtests show real
  drift arriving as "medium".
- **Pre-burn review cards may linger after a supersede — accepted.** The
  card names the subject and fact, which usually still matter post-upgrade;
  wiring card retraction to burn supersede is machinery without evidence of
  need.
- **The silent mode ("check on, notifications off") is now labelled** — the
  Contradiction Notifications setting hint says catches land only in
  telemetry when it is off.

## 5. What held up under audit

Fire-and-forget dispatch (zero latency on the narration post) with
canonical-GM single-emitter gating; the audit compares against the full
ledger block including every 2026-07 addition (frame, retractions, ship,
identities); parsing is tolerant and never blocks; every audit — including
clean ones — lands in telemetry with elapsed-ms for tuning; the review card
stays out of narrator memory (it carries no `narratorCard` since issue #399); the
correction dialog scopes to the card's matched entities and re-renders in
place; and all API traffic rides `api-proxy.js` per the architecture
constraint.
