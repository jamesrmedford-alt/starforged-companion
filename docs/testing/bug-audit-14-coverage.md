# Fourteenth bug audit — coverage appendix

Companion to [`bug-audit-14-2026-11-16.md`](bug-audit-14-2026-11-16.md) (issue [#362](https://github.com/jamesrmedford-alt/starforged-companion/issues/362)). For each of the seventeen review areas: the questions it raised that are not findings, what it traced and found sound, and what it did not read in full. The text is each reviewer's own; finding ids are the report's (AC01–AC83).

## Reviewer finding → report row

| Reviewer id | Row | Code |
|---|---|---|
| PIPE-01 | AC01 | STATED-MISS-PAID-ON-WEAK-HIT |
| IDXC-04 | AC01 | STATED-MISS-PAID-ON-WEAK-HIT |
| MOVA-01 | AC01 | STATED-MISS-PAID-ON-WEAK-HIT |
| MOVA-02 | AC02 | STATED-MISS-PROMISED-FOR-UNPRICED-MISS |
| PIPE-07 | AC02 | STATED-MISS-PROMISED-FOR-UNPRICED-MISS |
| MOVA-03 | AC03 | SOJOURN-STATED-MISS-PAYS-TABLE |
| IDXA-02 | AC04 | EXPEDITION-PLAN-LOST-ON-UPGRADE |
| IDXB-02 | AC04 | EXPEDITION-PLAN-LOST-ON-UPGRADE |
| NARA-02 | AC04 | EXPEDITION-PLAN-LOST-ON-UPGRADE |
| PIPE-03 | AC04 | EXPEDITION-PLAN-LOST-ON-UPGRADE |
| MOVA-04 | AC05 | UPGRADED-OUTCOME-UNSEEDED |
| IDXB-01 | AC06 | ARRIVAL-LINE-LOST-ON-UPGRADE |
| IDXA-01 | AC06 | ARRIVAL-LINE-LOST-ON-UPGRADE |
| PIPE-03 | AC06 | ARRIVAL-LINE-LOST-ON-UPGRADE |
| NARA-01 | AC07 | PLAN-REQUEST-LOST-WITHOUT-SIDECAR |
| FC-01 | AC07 | PLAN-REQUEST-LOST-WITHOUT-SIDECAR |
| NARB-02 | AC07 | PLAN-REQUEST-LOST-WITHOUT-SIDECAR |
| FC-06 | AC08 | PLAN-CLOCK-STUCK-FULL |
| NARB-07 | AC08 | PLAN-CLOCK-STUCK-FULL |
| NARB-04 | AC09 | SCENE-CHALLENGE-CLOCK-REWOUND-BY-PLAN-STEP |
| SKEL-03 | AC10 | PLAN-RETIRE-LEAVES-CLOCK |
| NARB-01 | AC11 | WAYPOINT-PERIL-WRONG-EXPEDITION |
| SKEL-04 | AC12 | PLAN-TITLE-FALSE-MERGE |
| SKEL-05 | AC13 | REVEAL-LEDGER-STALE-TRUTH |
| SESS-02 | AC14 | PLAYER-VOW-PLAN-NO-VOW-ID |
| MOVA-08 | AC15 | HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND |
| IDXA-03 | AC15 | HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND |
| IDXB-06 | AC15 | HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND |
| BATCH-01 | AC15 | HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND |
| BATCH-02 | AC15 | HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND |
| SKEL-01 | AC15 | HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND |
| PIPE-02 | AC15 | HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND |
| SKEL-02 | AC16 | REVEAL-TRUTH-BEFORE-DECIDED |
| ENT-02 | AC17 | NEAR-SPELLING-MERGES-DISTINCT-NAMES |
| ENT-01 | AC18 | MAKE-CONNECTION-PART-NAME-NOTHING-MADE |
| ENT-07 | AC19 | MAKE-CONNECTION-FIRST-DETECTED |
| ENT-08 | AC20 | TIER-DETAIL-EXTENSION-COUNTED-AS-REPEAT |
| WJ-01 | AC21 | THREAT-MERGED-PAGE-REOPENED |
| WJ-02 | AC22 | LORE-ROUTE-OLDER-SECTOR-NAMESAKE |
| SESS-01 | AC23 | PLAYER-VOW-CARD-NAME-SNAPSHOT |
| UISEC-01 | AC24 | EXPEDITION-ARRIVAL-SITE-LINK-DROPPED |
| CHAR-02 | AC25 | SHIP-INTEGRITY-LOST-WHEN-ASSET-ADDED |
| UISEC-02 | AC26 | SECTOR-ROLLBACK-AFTER-STORE |
| CHAR-01 | AC27 | STRIKE-CHRONICLE-NESTED-RELAY |
| MOVB-02 | AC28 | SUFFER-PICKER-NO-TARGET-FREE |
| NARP-07 | AC29 | SNAPSHOT-SECTORLESS-NPCS-OFF-ROSTER |
| IDXC-01 | AC30 | SOJOURN-PRICE-ROLL-TWICE-REROLLED |
| WJ-06 | AC30 | SOJOURN-PRICE-ROLL-TWICE-REROLLED |
| IDXC-02 | AC31 | MATCH-LINE-STALE-AFTER-UPGRADE |
| BATCH-05 | AC32 | HELD-RESULT-OUTLIVES-ROUND-ENTRY |
| SKEL-06 | AC33 | BURN-KEEPS-PLAN-CLOCK-TRIGGER |
| NARA-04 | AC34 | PLAN-HISTORY-OVERFLOW-DELETES-PLAN |
| FC-02 | AC34 | PLAN-HISTORY-OVERFLOW-DELETES-PLAN |
| SKEL-07 | AC34 | PLAN-HISTORY-OVERFLOW-DELETES-PLAN |
| NARA-05 | AC35 | XCARD-LATE-PLAN-WRITE |
| FC-05 | AC35 | XCARD-LATE-PLAN-WRITE |
| SKEL-08 | AC36 | WAITING-PLAN-DECIDED-ONTO-PLANNED-NAME |
| FC-04 | AC37 | REVEALED-TRUTH-ARCHIVED-TWICE |
| NARB-05 | AC38 | PLAN-CLOCK-ADVANCE-VIGNETTE-WITHOUT-ITS-PLAN |
| FC-03 | AC39 | UNPOSTED-REPLY-FACT-BLOCK-APPLIED |
| NARA-03 | AC39 | UNPOSTED-REPLY-FACT-BLOCK-APPLIED |
| ENT-03 | AC40 | RENAME-ONTO-KNOWN-PART-NAME |
| ENT-04 | AC41 | LORE-NPC-RECORD-LOSES-TO-PC-PART-NAME |
| WJ-03 | AC42 | THREAT-ESCALATED-WORD-LOWERS-SEVERITY |
| WJ-04 | AC43 | THREAT-VARIANT-OTHER-SECTOR-TROUBLE |
| ENT-05 | AC44 | SITE-TYPE-FROM-PASSING-WORDS |
| ENT-06 | AC45 | ENTITY-LORE-EMPTY-TEXT-BLANK-DETAIL |
| UISEC-08 | AC46 | PANEL-FIGHT-VOW-LINK-PAID-BY-NAME |
| MOVA-07 | AC47 | TELEMETRY-JOURNAL-BY-NAME |
| WJ-05 | AC48 | WJ-FOLDER-BY-NAME-RECREATED |
| IDXB-03 | AC49 | UNCHARTED-DESTINATION-NOT-ON-RETRY-CARD |
| UISEC-04 | AC50 | UNCHARTED-SITE-DUPLICATED-AFTER-RENAME |
| UISEC-03 | AC51 | SITE-SLOTS-WRAP-ONTO-EXISTING-PIN |
| IDXB-04 | AC52 | CLEAR-SITE-UNCHARTED-CALLED-DERELICT |
| UISEC-06 | AC52 | CLEAR-SITE-UNCHARTED-CALLED-DERELICT |
| IDXB-07 | AC53 | COURSE-CARD-BLAMES-A-MISSING-PIN |
| CHAR-05 | AC54 | STARSHIP-CURSED-UNTICK-DRIFT |
| PIPE-04 | AC55 | MOVE-RECORD-REVERTS-STORE-WRITTEN-FIELDS |
| BATCH-06 | AC55 | MOVE-RECORD-REVERTS-STORE-WRITTEN-FIELDS |
| CHAR-03 | AC56 | REGEN-CLAIM-STRANDED-BY-RELOAD |
| BATCH-07 | AC57 | ROUND-HELD-AT-UPGRADE-STEP-LEFT-OPEN-AT-SESSION-END |
| IDXC-05 | AC58 | SETUP-CARD-STACKS-PER-LOAD |
| MOVB-01 | AC59 | PTP-ROUTE-REFUSED-NO-RETRY |
| MOVB-03 | AC60 | RESIST-POST-REFUSED-CARD-DEAD |
| BATCH-04 | AC61 | ROUND-CONFIRM-DROPS-PICKED-ASSET |
| BATCH-03 | AC62 | ROUND-TOKEN-DRAG-PAYLOAD-UNCHECKED |
| UISEC-05 | AC63 | TRACK-ROW-VOW-CHOICE-WIPED |
| MOVA-05 | AC64 | PACING-READ-FABRICATED |
| NARP-01 | AC65 | SNAPSHOT-ENTITY-DETAIL-REMOVE-NO-EVENT |
| NARP-03 | AC66 | SNAPSHOT-RULES-NAME-MISSING-SECTIONS |
| NARP-02 | AC67 | STANDING-BLOCK-PRIVATE-LINES-ORDER |
| BATCH-08 | AC68 | ROUND-READING-NO-MOVE-WITH-PACING-OFF |
| MOVA-06 | AC69 | RIDER-EXTRACT-MULTI-OBJECT |
| NARP-04 | AC70 | SECTOR-STUB-PERSPECTIVE-PER-CALL |
| NARP-05 | AC71 | SNAPSHOT-SESSION-ZERO |
| NARP-06 | AC72 | BEAT-SHAPE-REPEATS |
| NARB-03 | AC73 | VOW-SCENE-CARD-LITERAL-ASTERISKS |
| MOVB-04 | AC74 | PACED-ROLL-GM-PRESS-SPEAKS-AS-FIRST-PC |
| NARB-06 | AC75 | CLOCK-VIGNETTE-ABSENT-FIRST-PC |
| CHAR-04 | AC76 | BOND-DELETE-NOTE-AS-PC |
| IDXC-03 | AC77 | CREW-SUPPLY-MIRROR-NOTE-SPOKEN-BY-ALLY |
| IDXB-05 | AC78 | ORACLE-CONSULT-KEYLESS-GM |
| SESS-03 | AC79 | PRIVATE-REOPEN-DROPS-UNSAVED-TURNS |
| SESS-04 | AC80 | PRIVATE-FAILED-SEND-LINE-NOT-RETRIABLE |
| UISEC-07 | AC81 | CONNECTION-SCHEMA-DEAD-FIELDS |
| PIPE-06 | AC82 | HELD-RESOLVED-BY-NEVER-READ |
| PIPE-05 | AC83 | REVERSAL-CARD-NAMES-UNESCAPED |

## IDXA — `src/index.js` 1–3300, command routing, speaker

### Questions raised (may be deliberate; not recorded)

- **A GM's typed line settles the first PC's held result.** `resolveSpeakerActorId` gives a GM author the
  first PC (a GM owns every PC), and `onMessage` keeps that PC's held results before reading any line
  (`index.js:970-973`). At a table of several PCs, a GM's plain chat line while PC 1's player is still
  choosing Burn / Keep pays PC 1's price and narrates the miss. It follows from "a GM's line is the first
  PC's", which predates the hold. Options: leave (the GM's line is that PC's line); keep only when the
  line's author owns the roller as a player or the speaker was chosen by token; or never auto-keep on a GM
  author's line at a table of two or more PCs.
- **A held result when Batch Mode is switched on.** The card still says "Your next line keeps it", but in
  Batch Mode a typed line is table talk (`handleBatchModeLine` returns before `keepHeldResultsOf`). Only the
  Keep button or the roller's next *rolled* round entry (`closeUpgradesForLaterMove`) settles it; a
  narrative entry or a pass leaves the miss unpaid and un-narrated while the round's narration moves the
  story on. Options: keep every held result when the mode is switched on / a round opens; keep the roller's
  held results when their entry is submitted, whatever its reading; or leave and reword the hint.
- **The fellow-PC rule (P2-06) cancels a roll on a first-name word match.** `lineIsToAFellowPlayerCharacter`
  matches each other PC's first name as a case-insensitive whole word and clears itself only when the line
  names a tracked *connection*. A PC called Will, Mark, Hope, Ash, May … turns every other player's
  Compel / Develop / Test line containing that word into narration with no move offered ("I will press the
  dockmaster"), and an untracked NPC ("Archer, hand Karthik the codes", Archer not yet a card) does not
  count as an NPC. As an offer filter (finding G) the cost was a missing button; on a MOVE decision it is a
  roll not made. Options: leave (`!roll` recovers); require the name capitalised in the line or the first
  word / vocative; or narrate with the move still offered instead of none.

### Traced and found sound

- Free-flow exits and the move lock: every return after the claim (`read.noMove`, `read.targetChoice`,
  "narrate", cancelled, `rolled.refused`, the catch) reaches the `finally`, which releases under the claim's
  token, retries once, and tells the GMs after two refusals; the early release before the rider prompt
  cannot clear a later move's lock (`lockReleased` / token check).
- Source-card claims: no-character, busy, refused-claim, cancelled, failed-before-dice all go through
  `releaseSourceCard`; "No move — narrate" is never offered or settled for a forced move
  (`settingsPanel.js:2607, 2671`), and a forced move is never read as `noMove` (`readMove` gates on
  `forcedMoveId`), so no claimed card is stranded by the P2-01 paths.
- `narrateOnly` re-post: carries `bypassPacing` (so `isPlayerNarration` passes), skips Batch Mode, the
  classifier, the reader and the lock; held by the session gate like any `deferWhileBusy` post; claimed once
  on the notice (`narrated`) with the speaker's owner / GM check.
- `narrateLineWithoutMove`: working copy, never throws, telemetry and density revision; its offered move
  passes `suppressPcDirectedSocialMove` inside `narratePacedInput`.
- P2-05: the too-short notice is posted and whispered by the author's own client only, not in Batch Mode or
  before a session, and never for a flagged / whispered / roll / command message; the notice itself cannot
  re-enter the pipeline.
- P2-06: the classifier's `suggestedMove` is normalised by `toMoveId` before the fellow-PC check; the check
  runs before the density record and telemetry.
- Held result: Keep / next line / chosen consequence / later move all go through `keepHeldResult` behind the
  shared upgrade claim, close the wait before paying, and pay the held price exactly once; a burn to a weak
  hit that pays a price pays the held one (`priceStands` is false because nothing was paid at the roll);
  `originalApplied` gates the automatic keep so a line arriving mid-record does not keep a result being
  recorded; the wait's state is on the card and survives a reload; another player's line leaves it; with the
  X-Card active a keep closes the wait, pays, and posts the paused card as any move does. End a Session is
  the recorded residual.
- GM relay kinds in range: `forcedMove.hold` (GM-only, validates each id is a `deferWhileBusy` forced move),
  `move.keepResult` (`claude: true`, roller's owner or GM, refusal told), `notRolled.narrate` (card-claimed,
  owner-checked; nothing but the notice's own stored line is posted).
- Lock restore paths added since #347 (`restoreLiveClaimOverStaleWrite`, `releaseLockOfAbsentClaimant`):
  the live-claim marker is cleared before a release's write, so a release is never "restored"; only the
  claimant acts; a stale page does not; the absent-claimant release is token-scoped and de-duplicated.
- `claimPendingMoveLock` / `releasePendingMoveLock`: bounded waits, a late-landing claim released, copies
  written on the campaignState chain, the in-flight marker cleared in `finally`.
- `commandRouting.js` / `speaker.js`: AUTHOR / CANONICAL_GM / CLAUDE policies and the speaker ladder
  (token PC → bound PC → owned PC → GM / solo fallback; no first-PC hand-off to a PC-less player at a
  multi-PC table).
- Settings registered in range: defaults agree with their readers (`riders.autoApply` read as `!== false`,
  audio defaults, the key registries); `holdResultForUpgrade` (registered in settingsPanel.js, default true)
  is read fail-open by `holdForUpgradeEnabled`.
- `applyOutcomeEffects` diffs since `18d258b` (arrival restructure, `afterMoveCard`, uncharted destination,
  the upgraded develop branch): the pipeline / upgrade split is consistent apart from AC06 / AC04.

### Not covered

- `src/multiplayer/gmGate.js` and `src/multiplayer/campaignStateChain.js` were not read; their documented
  contracts were relied on.
- `src/batch/driver.js` was read only at `handleBatchModeLine` and `acceptRoundUpgrade`; the Batch Mode
  halves of AC06 / AC04 / AC15 are by reading, not probed.
- `cardActions.js` (lines 1–260 and 870–1140 read), `burnMomentum.js`, `resultUpgrade.js`, `narrator.js`,
  `secrets.js`, `worldJournal.js`: only the parts the traces passed through.
- Helpers called from my range but defined after line 3300 (`postMovePayThePriceCard`, `postMoveResult`,
  `handleXCardCommand`, the `ready` hook's lock resets, the card render binders) were read only where a
  trace needed them; the X-Card command itself was not traced against a held result beyond
  `narrateResolution`'s pause.
- Live Foundry behaviour (dialog settle-on-close, socket delivery order, real permissions) was not
  exercised — nothing reported here depends on it.

## IDXB — `src/index.js` 3300–6600

### Questions raised (may be deliberate; not recorded)

| # | Behaviour seen | Question | Options |
|---|---|---|---|
| D1 | A won fight's payoff (the victory card's milestone ×n, the promised reward's scale — `applyWonFightPayoff`, `planRewardGrant`) is paid at the rolled outcome's scale and never re-scaled: a Battle weak hit burned/improved to a strong hit keeps ×(n−1) marks and the reward "with a string" / +1 (index.js:2768-2779 "A win already paid on a weak hit is not paid again on a strong one"). With results held (P2-10) that weak-scale payoff lands *before* the roller has chosen Burn or Keep. | Deliberate ("an effect the original produced is never repeated"), or should the difference be applied as it is for legacy ticks, companion health and progress marks? | keep · apply the difference on upgrade · defer the payoff of a held result until it is settled |
| D2 | Finish an Expedition's arrival appends "[ARRIVAL: The ship has ARRIVED at &lt;place>. Open the scene there …]" for every expedition (index.js:2224-2229, 4606-4612) — also one made on foot or inside a site (a trek across a planet, the decks of a derelict). | Should a non-ship expedition's narration be told "the ship has arrived"? | keep · "You have ARRIVED at …" for Finish an Expedition · decide by the destination (a site interior / a place with no pin) |
| D3 | `!scene end` with no scene open posts "Scene ended — migrated 0 entity truths…" and reports `scene_ended`, so the next narration takes a new world snapshot (a full cache write) though nothing ended (index.js:4052-4058: `saved` is true when `priorSceneId` is null). | Worth a "no scene is open" card and no event? | keep · no-op with a notice |
| D4 | A held result is kept automatically by its roller's next *typed line or card move* only (`keepHeldResultsOf` in the chat hook). A sheet roll narrated by `registerNativeProgressRollHook` (index.js:3304) — or the roller's `!ptp` / `!oracle` follow-up — is narrated while the earlier result still waits, so the story can run out of order. | Should a native roll / a command by the roller keep their held results first? | keep (residual of P2-10) · call `keepHeldResultsOf(speaker)` before the native narration |

### Traced and found sound

- `narrationCandidateText` / `isPlayerNarration` / `isLineTooShortForNarrator` (P2-05): the refactor keeps every exclusion of the old predicate in the same effect (length judged last); a flagged card, a whisper, a roll, an emote, a system card, a `\ @ / !` line and a markup-only or emoji-only line are never "too short"; the notice itself is a flagged whisper.
- `handleSceneCommand`: working copy, the card says what the store holds, snapshot events only on a saved start / end (but see D3).
- `getActiveCharacterForPacing`: speaker first, else the world's one PC; never the first of several (PACING-CHARACTER-SOLO).
- `handleOracleCommand` / `handleOracleTableCommand`: odds aliases (two-word first), the consult is fail-open and bounded (8 s), the answer socket carries the odds word only; the narration and the memory ride the card, never a relay payload; every interpolated string is escaped.
- `handlePayThePriceCommand`: a price with no payer writes no memory, asks no narration and — new — turns no clock (PTP-PCLESS-CLOCKS-ADVANCE); the payer is the typist's PC.
- Oracle-memory capture: canonical-GM gated, on the campaignState chain, written on a copy, stamped with the card's own id.
- `arrivalNarratorLine`: brackets and newlines stripped from the place; appended whatever the Ship Positioning setting; reaches the pipeline's narration, a held result's Keep (the card's copy) and a round's stored input. An upgrade from a *miss* gets it (same object narrated). Gap: AC06.
- PT09 / PT10: the card is a thunk posted after `postMoveResult` by `rollMove` (free-flow and a round share the function; no return between the effects and the loop); an upgrade posts at once; a token drag reports `moveCommandVehicleTokenToDestination`'s own result; no card on a miss or for Finish an Expedition. Its new `destination` / `tokenMoved` flags have no production reader — informational, as the sibling cards' flags (`recommitCard`, `legacyXpCard`, …) are; not reported.
- PT07 on upgrades: an expedition first created by an upgrade (miss → hit) records the destination once and saves `sectors` at once; a weak → strong upgrade creates nothing again (no duplicate Actor, record, pin or link); a hit cannot be downgraded, so nothing needs undoing; a Batch round takes a fresh working copy per entry, so two entries' records do not overwrite each other; a second expedition to a charted working-label place resolves it as a tracked place and records nothing. `system.subtype: "uncharted"` is accepted by the vendor's location schema (a free `StringField`).
- `addLegacyTicks` with `markLegacyOnCopy` (LEGACY-SHEET-DECREASE): the marks are keyed by the copy in a WeakMap, so `writeLegacyTicks`' own copy writes its marked track whole and persists nothing extra; XP is still owed by the copy and paid after its write.
- `findOpenConnection` (`strict`): a severed or renamed link resolves nothing and reports `not-found` on the GMs' card; no sole-bonded fallback.
- `postExpeditionProgressCard`: box count, the muted button under 4 boxes, the quoted miss odds (64 % at 3, 49 % at 4) are right.
- Vow payoffs: `resolveVowItemCopies` (item id → the roller's exact name → the guarded ladder; `ownOnly` for costly guesses), `payFulfilledVowNative` (the `fulfilPaid` check, the synchronous in-flight claim released in `finally`, the per-step ledger), `deepenVowConnectionOnce` / `markFightVowMilestoneOnce` (ledger-keyed once-only), `grantLinkedVowReward` (claim before give), `payForgedBondNative` (claim, `finally`), `retryPayoffSteps` / `runPayoffStep` (values re-validated, ledger skip) — all hold for a repeated click and a duplicate roll.
- Native sheet-roll hooks: one narrator (keyed canonical GM, else the roller), PC-only (`rolledByPlayerCharacter`), the payoff on the canonical GM, a round takes the narration only.
- HTML escaping: every name, label, question, oracle result, error text and reward description interpolated into a card in 3300–6600 goes through `escapeChatHtml`; unescaped values are module-generated numbers, ids or enum words.
- Roller attribution: the cards built here carry the roller's `actorId`; the reward goes to the roller's copy, else the copy's holder; legacy XP is the crew's by decision.
- Diff `18d258b..HEAD` for 3300–6600 (17 hunks) read: no changed contract with an un-updated caller found beyond AC52.

### Not covered

- Read in full: `src/index.js` 3196–6766 (the assigned range and the functions straddling it). Also read in full because the range's functions are called from them: `src/index.js` 2100–2842 (`applyOutcomeEffects`, `applyWonFightPayoff`), `src/moves/movePipeline.js` 1000–1663 and 1790–1841, `src/moves/heldResult.js`, `src/sectors/siteDiscovery.js`, `src/moves/travel.js`, `src/oracles/oracleConsult.js`, `src/moves/legacyTracks.js`, `src/moves/developRelationship.js`, `src/narration/snapshotEvents.js`.
- Read in part only: `src/moves/burnMomentum.js` (302–350, 700–927), `src/moves/resultUpgrade.js` (760–808, 1370–1501), `src/moves/improveResult.js` (470–511), `src/moves/persistResolution.js` (190–450), `src/sectors/precursorSites.js` (238–359), `src/sectors/sectorSceneHooks.js` (561–647), `src/world/secrets.js` (470–560, 845–870, 940–960), `src/world/skeletons.js` (395–505), `src/narration/narrator.js` (1100–1190, 5895–5935), `src/batch/driver.js` (160–205, 1150–1172, 1360–1437), `src/entities/location.js` (72–122).
- Not read: `src/clocks/*`, `src/multiplayer/*` (the gmRelay handlers behind this range's buttons), `src/moves/cardActions.js` (the GM side of the recommit, threshold, way-out, which-fight / vow / legacy and payoff-retry presses — their idempotence was not re-traced), `src/factContinuity/shipPosition.js`, `src/entities/connection.js` / `ship.js`, and the index.js helpers outside my lines that this range calls (`sufferRoutesFooter`, `applyPayThePriceSufferFromRelay`, `postMovePayThePriceCard`, `applyReachMilestone`, `postCombatTrackCard`).
- Traced by reading, not probed: the Batch Mode round variants of AC06, -02 and -06 (`acceptRoundUpgrade`, `narrationInputFrom` → the world-scoped round setting); the Improve Result variants of AC06 and -02 (same builder shape as Burn).
- Seen while tracing, outside my lines, not probed and not reported as a finding: `heldResult.narrateHeldUpgrade` narrates the upgraded result without `held.relevance`, though `keepHeldResult` passes it — so a held move whose line needed the GM's pre-roll "Who are you interacting with?" pick loses that pick (and its entity card / permission class) when burned instead of kept. For whoever owns `src/moves/heldResult.js`.
- Not run: the full suite, Quench, anything in live Foundry. Nothing here depends on unverified Foundry behaviour; the one vendor fact relied on (location `subtype` is a free `StringField`) was read in `vendor/foundry-ironsworn/src/module/actor/subtypes/location.ts`.

## IDXC — `src/index.js` 6600–end

### Questions raised (may be deliberate; not recorded)

- **D1 — a stated Withstand Damage / Companion Takes a Hit has no target.** `dispatchPayThePriceSufferRoute` passes no move targets, so a stated miss "your bike is wrecked (Withstand Damage −1)" lands on the command vehicle, and a companion hit on the first companion in item order (`actor.items.find(category === "companion")`) — the table route's old defaults, now reachable from a line that names the thing. Options: forward `moveTargets` (vehicleItemId / companionItemId) to the price dispatch; restrict the interpreter's `missSuffer` to PC meters when the move has no such target; leave.
- **D2 — the Campaign Setup card: once per load, or once until answered?** (AC58.) If a nudge on every load is wanted, replace the earlier card rather than stacking.
- **D3 — a refused Pay the Price card drops the whole price.** `postMovePayThePriceCard` and `postDecisiveActionCostCard` `return null` when `ChatMessage.create` rejects — before the suffer routes, the clock advance and the narration seed — with a `console.warn` only; `payChosenPrice` (new) decides the opposite ("the price is paid all the same"). With the hold, `keepHeldResult` has already closed the wait, so the price cannot be paid later. Options: pay regardless; or report on the GMs' payoff-failure card with a Retry.
- **D4 — the Rotating Spotlight switch-off tells only worlds that stored "on".** A world that played on the old default-on without ever saving the Narrator tab flips to off with no notice (`applySpotlightDefaultOff` only marks). decisions.md names "a world created on this version"; an existing never-saved world is the same code path. Options: also post the notice when the marker was unset and the world has a session history; leave.
- **D5 — `oracleConsult.ask` is unthrottled.** Any client's ask makes the canonical GM run `oddsFromPlan` (a Haiku call on the GM's key when a plan matches); asks and answers are broadcast to every client. Within the relay's stated trust model; noted because it is the first request/answer exchange on the socket.

### Traced and found sound

- **`ready` ordering and gating.** `registerGmReadiness()` first; the stale-lock reset / session mint / setup card / migrations / legacy backfill / spotlight switch-off are inside `isCanonicalGM()`; a non-canonical GM only releases its own earlier page's lock (`releaseOwnStaleLockAtReady`, re-checked at its turn on the write chain). The mint writes owned fields onto the store read at its turn (`mergeOwnedFields`), and clears the lock only while the store still holds the stale claim. Nothing in the hook body awaits, so a player's or a GM's registrations cannot be skipped by an earlier async step.
- **`applySpotlightDefaultOff`**: GM-gated inside, switch before marker, safe to re-run, no-op on a player's client.
- **System-note attribution (`preCreateChatMessage`)**: fires only on the creating client; a note is dropped only when a quiet span is open *and* its Actor has a bridge write in flight, re-spoken only for an Actor with a bridge write in flight; module-flagged cards are skipped; counters are released in `finally`. A player's own sheet edit (their client, no mark) and another Actor's note are untouched — which is exactly why the mirror's is missed (AC77). The overlap case (a second module write to the same Actor inside a quiet span) is documented in the function's own comment. Timing against live Foundry (the note's `preCreate` runs while the update's round trip is out) is consistent with the vendor source but not runnable offline.
- **`registerOracleConsultSocket` / `requestPlanOdds`**: canonical GM answers; only the odds word leaves; ask id, question length and the answer's odds are validated; the waiter and timer are cleaned in `finally`; fail-open after 8 s. The odds label on the player's card is the recorded decision (P2-31).
- **`registerArtSocket`** (portraitRouting): record read on the art GM, never from the payload; bounded to one first portrait.
- **Truths journal hooks** (`createJournalEntry`, `createJournalEntryPage`, `updateJournalEntryPage`): canonical-gated; campaignState writes on the chain, on a copy read at the write's turn.
- **Card-button wiring** (payoff retry, fight-vow, combat track / Battle, TDA, which-fight / vow / legacy, milestone suggestion and picker, fulfil attempt, finish expedition, connection suggestion / picker, paced Roll, "Narrate it — no move", **Keep the result**): each reads the live card flags, relays with `relayCardAction`, re-arms on a press not delivered; `wireKeepResultButton` removes the row once `awaitingUpgrade.open` is false, and `applyKeepResultFromRelay` checks the roller's owner and takes the shared upgrade claim.
- **Pay the Price receipts**: `ptpMeterReceipts` / `ptpAssetReceipts` against the executors' return shapes (`before` / `after` / `itemId` / `vehicleActorId` / `momentumLoss`), the companion fallback to Endure Harm, P2-12's Lose Momentum row; every `step` kind a failure card can carry has a `payoffStepRecord` and a `runPayoffStep` case (`milestone` only on non-retryable cards; `upgrade`'s new `assetTrack` effect is handled in resultUpgrade.js).
- **`applyPayThePriceSufferFromRelay`**: routes clamped (known move, 1–3, at most 4), requester must own the PC.
- **`!reset-momentum`**: runs on the typist, owner-or-GM check before any write, each sheet's refusal reported on the card.
- **`!at` / `!sector` / `payoff retry: arrival`**: owned fields onto the store at the write's turn; `!sector`'s `sector_switched` is a `snapshot: false` row by decision.
- **Held card flags** (`awaitingUpgrade`: resolution, held price, relevance): no hidden-plan text — `skeletonRequests` are requests, the stated price was shown before the roll.
- **New settings are registered** (`worldSnapshotEvents`, `narratorSpotlightDefaultOffApplied`, `holdResultForUpgrade`, `missPaysStatedStakes`).

### Not covered

- Read in part only (the pieces the range calls): `src/character/actorBridge.js` (40–225, 540–625, 722–1040, 1786–1815), `src/moves/sufferExecutor.js` (440–640, 860–1076), `src/moves/movePipeline.js` (1440–1665), `src/moves/resultUpgrade.js` (1030–1180, 1440–1500), `src/moves/burnMomentum.js` (596–745, 900–955), `src/moves/cardActions.js` (870–960, 1085–1130), `src/multiplayer/gmRelay.js` (380–700), `src/multiplayer/gmGate.js` (1–200), `src/multiplayer/sharedSupply.js`, `src/entities/ship.js` (440–590), `src/context/safety.js` (150–330), `src/world/worldJournal.js` (28–150, 225–385), `src/oracles/roller.js` (340–580). Read whole: `heldResult.js`, `oracleConsult.js`, `spotlightDefault.js`, `snapshotEvents.js`, `sceneChallengeOffer.js`, `portraitRouting.js`, vendor `chat-alert.ts`.
- Registered from `ready` but **not traced** (their bodies are other areas'): `registerChatHook`, `registerBatchModeDriver`, `registerRoundWindowHooks`, `registerActorHook`, `registerLegacySheetSyncHook` / `backfillLegacySheets`, `registerEntityRenameSyncHook`, `registerStarshipSeedHook`, `registerCommandVehicleHook`, `registerNativeProgressRollHook`, `registerNativeFulfilConsequenceHook`, `registerOracleMemoryCaptureHook`, `registerRollingSummaryRefreshHook`, `registerXCardRedirectHook`, `registerDeletedChatHook`, `registerConnectionWatch`, `registerSessionActivityHook`, `registerPublishedReflectionHook`, `registerProgressTrackHooks`, `registerJournalSplitMerge`, the panels' hooks, `registerSharedVowSyncHook`, the reward / player-vow / threshold / way-out / recommit hooks, the suffer-card hook, the audio socket, the eight migrator functions, `ensureHelpJournal`, the two macros, `initLayoutMode` / the toolbar, speech input. `registerXCardLatePostHook` and `registerStarshipConditionSync` were read for their gates only (both canonical-gated).
- `initSessionId` / `rollSessionIfDue`, `staleMoveLockAtReady`, `releaseOwnStaleLockAtReady` (index.js 639, 1340–1445) were read as the `ready` block's callees; `serialiseSessionMint`, `noteSessionBeingReplaced`, `catchUpUnsummarisedSession`, `reconcileSystemTruths` / `recordSystemTruths` were not opened.
- Whether whispered cards' flags reach non-recipient clients in v13 (the GMs' payoff-failure card carries its `steps`) was not determined — it needs live Foundry.

## BATCH — Batch Mode, the Round window, `src/multiplayer/`

### Questions raised (may be deliberate; not recorded)

- **"Use the card's move" over an entry that is itself a card's move** (`round.js` `rereadEntry`, `useOffer`): the entry's own card move (its `readAs.messageId`) is dropped — neither offered, parked nor held — while its card stays spent. This mirrors Keep mine dropping the offer, but decisions.md:634 (ROUND-ONE-OFFER-SLOT) says card moves "are never dropped". Options: park the displaced card move for the next round (as `offerKept` does on Pass / Withdraw) · record that choosing one card's move drops the other.
- **A round's reading with pacing off** (AC68): match free-flow (every line a move) · or keep the no-roll reading in rounds and record it; with the first, consider giving the window a "No move — narrate" for a move reading, as the confirm dialog has.
- **Which event keeps a held result in Batch Mode** (AC32): the mode switching on · the roller's next round entry of any kind, before the round resolves · only the card's own buttons (then the card's "Your next line keeps it." and heldResult.js's header need rewording, and `closeUpgradesForLaterMove`'s un-awaited keep still narrates out of order).
- **A round's Make a Connection hit has no interpreter target**: KNOWN-NPC-CONNECTION-NO-TARGET's pick (`moveTarget` → `targetName`) is wired for the free-flow slot only; a round entry's `narrationInput` carries no `moveTarget`, so a round hit whose narration names several known NPCs still goes to the GMs' notice. Intended scope, or carry `moveTarget` per entry?
- **`hasAudioKeyedActiveGM` / `hasArtKeyedActiveGM` count a stood-down keyed GM** (`gmGate.js` `keyedPool` — no `gmPageCanAct` filter, which STALE-PAGE-CLAUDE-COMMANDS gave `hasKeyedActiveGM`): on a player's client, with the only (audio-keyed) GM's page stale, a keyed player's Play asks that page and waits out the 30 s request before making the clip on its own key. Self-healing at the GM's reload; unprobed. Apply the same filter, or accept?
- **The toolbar's "Discard the round" ignores the round it was asked about** (`applyBatchDiscardThenOff(_payload)`): answered after that round resolved and the next one collected submissions, it discards the newer round without asking. Accept (authors keep drafts), or refuse on a round-id mismatch as `batch.sendNow` does?

### Traced and found sound

- Relay handlers (`relay.js`): every entry action uses `ctx.requesterId` as the entry's user, never a payload id; `roundId` is checked inside the round write (`stale-round`); `submissionId` bounded and compared; `choices` validated against the stored reading (`validateChoices`: offered abilities, an offered stat a chosen ability gives, a target among the reading's); `moveId` of "Roll ⟨move⟩" must equal the reading's suggestion; GM controls gate on `ctx.requesterIsGM`; no handler awaits a Claude call or calls `requestGmAction`. `batch.keep` acts on the requester's own recorded, undecided entry only.
- New relay kinds and the queue: `move.keepResult` is `claude: true` (270 s budget) and nothing on its path (`payHeldPrice` → `postMovePayThePriceCard`, `narrateResolution`) calls `requestGmAction` on the canonical GM (no wait-on-self); `notRolled.narrate` only claims the notice and reposts the line (returns at once); its `narrateOnly` repost is kept out of the round by index.js:903 and by `handleBatchModeLine` never seeing it; the oracle consult is its own socket ask/answer (8 s bound, odds word only), outside the queue.
- Every lock / flag in the driver releases in a `finally`: `startResolution` (`_startingResolution`), `startResolutionClaimed` and `rollRound` (the round's lock claim), `narrateTheRound` (`_narratingRoundId`, the claim — skipped only for a superseded stale page), `advanceRound` (`_advancing`), `startReading` (`_readings`), `runHeldFreeFlowMoves` (`_runningHeld`), `enqueueGmAction`, `serialiseCampaignStateWrite`.
- `requestDiscardThenOff` / `_startingResolution` (BATCH-OFF-DIALOG-HANDOVER-WINDOW): a resolution whose claim is out is treated as resolving; a claim that returns after the mode-off write sees the mode off and releases; the mode-off-after mark survives a busy lock.
- A round and `holdForUpgrade`: the driver never passes it, so a round's result is never held; the price is paid at the roll and Burn / Improve / Keep is the round's own upgrade step; `kept` is honoured by `upgradeOpen` via `resultUpgradeBlocker`. Batch Mode off mid-upgrade only marks `modeOffAfter` (Z04) — rollers still decide.
- No-move reading in a round (pacing on): `readAction` returns a narrative reading with the classifier's (or the unsure reading's) move offered; "Roll ⟨move⟩" re-reads as a forced move; "Roll a move instead" passes `allowNoMove: false`; a forced card move is never read as none; fellow-PC suppression applied.
- Stakes in a round: `reading.stakes` shown escaped (`renderStakesBlock`), carried by `interpretationForRoll` → `resolution.stakes` → the stated price at the roll and the STAKES block per entry in `buildRoundUserMessage`; a burned / improved entry's replacement narration input keeps them (`burn.stakes` / `improve.stakes`).
- P2-09 inside a round: the price is paid at the roll, so `ptpReversals.assetDeltas` ride the card's `burn` / `improve` state and the upgrade handler's `assetTrack` step restores them; the round takes the upgraded outcome through `acceptRoundUpgrade`.
- Round narration (`narrateRound`): sidecar applied with the same context as `narrateResolution` (`planRequests`, `narrationId`); plan requests from each entry's seeds and `skeletonRequests`; `endingTrackIds` unioned; `reportNarratedMove` per entry after the card posts; the X-Card gate on entry and on the reply; `stillNarrating` asked before anything is posted.
- `round.js` transitions since `18d258b` (`parked`): Pass / Withdraw / a second card press park instead of dropping; `takeCardMoves` hands back offer + parked + non-acting card entries and clears them; `incitingSwearTaken` counts parked moves.
- `sharedSupply.js` pass: per-sheet writes stand alone, a queued change becomes the next pass, `persistCrewSupply` reads and writes with no await between on the campaignState chain. `sharedLegacies.js` unchanged since the last audit.
- `gmRelay.js` / `gmGate.js` / `connectionWatch.js` / `campaignStateChain.js` / `settleWithin.js`: the stale-page stand-down covers `queueRoundWrite`, `tellGms`, the chain's `refuseIfStale` and the election; `hasKeyedActiveGM` filters stood-down pages; the queue's `finally` releases on a rejected handler; unqueued kinds are the two safety writes only.
- `queueRoundWrite` has no time bound on its `settings.set`, but a write that never answers means a dropped socket, which makes the page stale and hands the round to another GM (or the reload) — no reachable wedge found.
- Short table-talk lines in Batch Mode get no "too short for the narrator" notice (`tellLineTooShort` checks the mode).

### Not covered

- `src/index.js` beyond the Batch Mode touch points (the chat hook 878-1311, `postMovePayThePriceCard`, `postMoveResult`, the native progress-roll hook, parts of `applyOutcomeEffects`) — not read whole.
- `src/moves/resultUpgrade.js` (read 1-330 and 960-1260 only), `burnMomentum.js` (540-840 only), `improveResult.js`, `sufferCard.js`, `persistResolution.js` beyond the merge and the entry point — the upgrade handlers' own steps were not re-audited.
- `src/narration/narrator.js` beyond `buildNarratorExtras`, `narrateResolution`, the round functions (1280-1830) and the sidecar apply; `narratorPrompt.js` beyond the round user message; the world snapshot modules (`worldSnapshot*.js`, `snapshotEvents.js`), `secrets.js` / `skeletons.js` internals and the clocks' trigger vignettes were read only where a round reaches them.
- `src/multiplayer/commandRouting.js` (another reviewer's); `speaker.js` read, not audited.
- A GM reload / handover mid-round was traced by reading only for the new state (`_startingResolution`, `parked`, the discard relay); the older recovery paths (AB13–AB20) were not re-probed.
- Live Foundry: nothing here was run in Foundry; AC15 / AC15 rest on world settings and public chat-message flags reaching player clients (the repo's stated model).

## PIPE — the move pipeline, upgrades, the held result, stakes, travel

### Questions raised (may be deliberate; not recorded)

- **D1 — a GM's own line keeps the first PC's held result.** A GM-authored line with no speaking token resolves to the first PC the GM owns (`speaker.js` step 2 — a GM owns every PC), so `keepHeldResultsOf` (`index.js:970`) pays that PC's held price, narrates it and closes its Burn / Improve — while another PC's held result is left alone. Verified on the table harness (a GM's "Take your time deciding…" kept Kira's result: `resolvedBy: "later"`, health 5 → 4). Options: (a) as is (the GM's line *is* read as that PC's everywhere else); (b) keep on a line only when its author owns the roller as a player, or its speaker names the roller.
- **D2 — a result held across sessions.** Recorded: "a held result nobody settles stays held across End a Session". What follows is not: `heldCardsOf` has no session filter, so the roller's first line of the *next* session pays the old price and narrates last session's roll into the new session's ring. Options: keep at End a Session; expire the wait at the mint; leave.
- **D3 — the upgraded narration of a held result drops the stored relevance.** `keepHeldResult` passes `awaitingUpgrade.relevance` (with the GM's answer to "Who are you interacting with?", issue #347 D1 — "the GM's pick stands whatever the outcome"); `narrateHeldUpgrade` passes none, so the narrator re-resolves it for the upgraded outcome and the GM's pick is lost. Deliberate (relevance depends on the outcome) or an omission? Not probed.
- **D4 — "set a course" with no destination goes to the newest pending uncharted destination of the active sector, however old** (`travel.js sceneDestination`): an expedition abandoned sessions ago still supplies it, and the line is then rerouted to an expedition there (the confirm dialog says so). Options: only a destination recorded this session / scene.
- **D5 — what counts as "charted".** `chartedPlaceFor` knows settlements, planets and location records only. A Set a Course to another generated *sector* by its name (or any known thing that is not one of those records) is rerouted to Undertake an Expedition, and a hit files an uncharted site of that name in the *active* sector (`index.js:2401-2402`). Options: treat a stored sector's name as charted.
- **D6 — `sectors`, `currentLocationId/Type` keep the pipeline's copy** in the record's merge (documented policy; the twelfth audit's `sectors/sectorsRevertedByMove` probe is "excluded" in known-issues with no reason given). If AC55 is fixed by making the policy list complete, say why `sectors` stays out.

### Traced and found sound

- **How a hold ends — exactly-once.** Keep button, the roller's next line, a chosen consequence, a later move through a round: all go through `keepHeldResult`, gated by the card's in-flight claim (`claimResultUpgrade`, released in a `finally`) and the `closeWait` card write made before anything is paid; a second keep, or a keep racing a burn, is refused ("in-flight" / "not-awaiting" / "upgraded"). Burn / Improve close the wait in `narrateHeldUpgrade` before narrating. The price is paid once in each path (kept: `payHeldPrice`; burned to a weak hit that pays one: once, after the burn's meters — matching "burn before any other effect"; burned to a strong hit: never). Another player's move leaves it waiting. The move lock is not involved after the record (released in the pipeline's `finally`); the record lands before the wait.
- **Reload / handover.** What the wait needs is on the card; nothing in memory but the per-client in-flight set. A keep interrupted between `closeWait` and its narration is lost with the page (the AB14 class, recorded).
- **Two held results (two players)**: independent cards, independent claims; keyed by `flags.actorId`.
- **No nested relay** from the `move.keepResult` handler: `postMovePayThePriceCard`, the suffer executors and the clock advance make no `requestGmAction` call.
- **Momentum on burn**: `burnableMomentum` (live − the outcome's landed momentum + what the price took + what its unprepared mark clamped), strict improvement check, reset read after the reverted price's marks are cleared, a kept price's momentum taken off the reset; held results carry `ptpReversals: null`, so nothing is refunded that was never paid. Negative-momentum cancel is read at the roll and for the bonded develop roll.
- **P2-09 refunds**: receipts are per route and are what landed (`before − after`), the command vehicle by Actor id, a support vehicle / companion by Item id on the payer; overflow past 0 is a momentum receipt (improve refunds it, a burn's reset replaces it); restore is clamped by the track's writer and passes the battered rule; two routes ("Roll twice") give two receipts; a price that stands is not reverted or struck; a gone asset becomes a named failure step for the GMs.
- **`supersedePriceCards`** matches by the move's resolution id only (`oracleMemory.resolutionId`, `priceOf`), is idempotent, and leaves pending choice cards to `reconcileChoices`.
- **`legacyTracksWithCopyMarks`**: marks are keyed by the working-copy object; free-flow and each round entry use their own copy, so no mark is applied twice.
- **Next-move adds**: both claims are made on the store, on the write chain, after the "not rolled" guards and before the dice; a refused claim adds nothing; a refused round stamp after the claims is the #344 family.
- **Travel**: a course named by a pin's Actor stays Set a Course; names resolve exact → prefix → whole-words-either-way, active sector first; an unexplored / undiscovered site is never "charted"; a revealed site's status moves to "visited" at the reveal; a detected place's default status is "" (charted).
- **Stakes** are per interpretation (never carried from an earlier line); a forced move has none; a Balanced misread put back in kind drops them; a round's reading stores its own.

### Not covered

- `src/moves/sufferExecutor.js`, `src/moves/resolver.js`, `src/index.js`: read only the parts the traces needed (the price poster and its receipts, `applyOutcomeEffects` arrival / expedition branches, the free-flow `onMessage`, the move card / Keep wiring; resolver consequence map, seeds, `resolveMove`). Not read in full.
- `docs/flows/combat-flow.md`, `vow-flow.md`, `exploration-flow.md`: not read (the code was traced directly); doc drift against them was not checked.
- Batch Mode's own handling of upgrades (`src/batch/driver.js`) only as far as its calls into my files.
- Live Foundry behaviour: chat-content sanitising (AC83), real socket ordering of the shared-supply pass against the record (AC55 A was reproduced on the simulated table, where the pass stored before the record on a non-held miss).
- Not probed: D3 (the dropped clarification), a Test Your Relationship weak hit whose bonded Develop roll's +2 momentum is replaced by a burn's reset (narrow; traced only), a partially-landed command-vehicle restore retried twice.

## MOVA — resolver, interpreter, ability scan, riders, pacing

### Questions raised (may be deliberate; not recorded)

| # | Looks wrong, may be deliberate | Options |
|---|---|---|
| D1 | **A card-forced move states no stakes.** A paced card's "Roll ⟨move⟩" (now also the move P2-01 offers after a no-move / low-confidence reading), the way-out buttons and a round's "Roll ⟨move⟩" build the interpretation without the interpreter; `enrichForcedMoveStat` copies only the stat from the stat-only reading (which does return `stakes`), and a single-stat move (Gather Information, Make a Connection, Explore a Waypoint…) gets no reading at all. So the Confirm dialog shows no "At stake" and a miss always rolls the table — the alpha-23 "scan's miss came back 'delayed'" case, when the scan was rolled from the button. | (a) carry `reading.stakes` for multi-stat forced moves and make the reading for single-stat ones; (b) leave forced moves table-priced and say so in decisions.md. |
| D2 | **The fellow-PC rule on a MOVE decision** (`lineIsToAFellowPlayerCharacter`, decided as "names another PC and no tracked NPC") also narrates, with no move offered: a Compel of an unnamed or untracked NPC that mentions a crewmate ("Tell me where Karthik is being held!"); and any Compel whose text contains a word that is another PC's first name in lowercase — the game's own name oracle gives Ash, Echo, Sage, Flint, Raven ("…or I leave this station in ash"). An NPC sharing a PC's first name, and a name inside a longer word, are handled. | (a) keep; (b) keep the narration but offer the move on its card (NWMA) instead of dropping it; (c) require the PC's name capitalised / in address position. |
| D3 | **Explore a Waypoint's miss with a match** is seeded with an advisory price (the stated miss, or a d100 roll — with "This price is paid in momentum (Lose Momentum -1)" for 89–95 and a plan request for a new enemy) while nothing is routed or charged; a player who does not Confront Chaos pays via `!ptp`, a second roll (`resolver.js:1507-1513` comment keeps this). The issue #321 U03 / #326 W47 shape, left in on purpose? | (a) seed nothing and let the card's choice (Confront Chaos / pay the price) do it; (b) make it a Sojourn-style choice whose price is the seeded one. |
| D4 | **Chaotic keeps a `null` stat.** `parseInterpretation` holds a non-Chaotic reading to the move's listed stats (issue #325 W19); under Chaotic an explicit `"statUsed": null` for an action move survives ("unlisted stat" exemption) and the move rolls +0 with "+null (0)" on the card. | (a) treat null/missing as not-a-stat on every dial; (b) leave. |
| D5 | **A round's no-move reading is not taken out of the density window.** Free-flow's `narrateLineWithoutMove` calls `reviseLastDecision`; `readAction`'s `read.noMove` branch does not, so in Batch Mode such lines still count as moves for "recent move density". | (a) revise there too; (b) leave (cosmetic prior). |

### Traced and found sound

- **Pay the Price table** (`oracles/tables/payThePrice.js`): 20 rows tile 1–100 with no gap or overlap and match the play kit; routes: 51–56 Companion Takes a Hit (solo fallback Endure Harm), 63–68 Withstand Damage, 69–74 Sacrifice Resources, 75–81 Endure Harm, 82–88 Endure Stress, **89–95 Lose Momentum −1** (P2-12), 96–100 "Roll twice" resolving both leaves with each leaf's route (`roller.resolveDirective`). `priceSeedLines` adds the momentum note for 89–95 and the enemy lines for 45–50, including as a "Roll twice" leaf; `narrator.PRICE_SEED_LINE` and `skeletons.NEW_ENEMY_SEED` match the wording. `STATED_SUFFER_MOVES` = the table's six routes; `sufferRoutesFooter` names them.
- **Resolver outcome table** against the play kit, move by move (adventure, quest, connection, exploration, scene challenge, combat, suffer, recover, threshold): outcomes, momentum, progress marks (Strike 2/2, Clash 2/1), positions, which results route the price. `calcActionScore` caps at 10; `cancelsActionDie` (negative momentum = die) with the die kept on the record; `calcProgressOutcome` floors ticks/4; `canBurnMomentum` only on a strict improvement, never on a progress or no-roll move; reset 2/1/0 by impacts; Take Decisive Action's bad-spot downgrade (strong without a match → weak, weak → miss); the Hoverbike weak-as-miss. `matchLine`'s premise holds (a weak hit never matches; downgrades cannot create a weak hit with a match).
- **One roll per price**: a routed price is rolled by the pipeline only (`routesPayThePrice`), Take Decisive Action's cost by its card only (`rollsDecisiveActionCost`), Sojourn's once in `rollChoicePrice` for seed and option alike; the held price is rolled at Keep / at an upgrade that still pays it, once. (`payChosenPrice` re-reading a 96–100 by roll number re-rolls its leaves — a sibling reviewer already has a probe, `tests/probes/wj/chosenPriceRollTwiceRerolled.probe.js`; not recounted.)
- **Interpreter reply parsing**: malformed JSON, a non-object, an unknown move id, a display name ("Gather Information"), an unlisted stat (first listed stat, non-Chaotic and forced), a missing `moveId` (failed reading → dialog, `fallback: true` never narrated), `"moveId": null` / "none" / `noMove: true` (no move only where it may decline), `moveId: null` with a `moveName` (read as the move); model numbers (`statValue`, `adds`, `progressTicks`) discarded; position remap after validation with the stat re-validated against the remapped move; `buildContextSummary` names the speaker only for a real PC; `keepMischiefInKind` only for Balanced + `mischiefApplied` + social read + an out-of-kind landing, stakes dropped; forced moves get no mischief, no position steer, no PACING READ.
- **Classifier**: `parseDecision` (unknown decision → fallback MOVE, unknown category → exploration, `toMoveId` on the nomination, confidence clamped, scene-challenge variant mapped back when no challenge is open); the speaker's connections come from the speaker's own bond Items, severed ones left out, capped at 8; charted places exclude unexplored sites; combat pins the combat dial at 10; the router's NWMA→MOVE backstop in a fight; `consumeForceMove` / `applyPaceCommand` write a copy on the chain.
- **Ability scan parse (P2-25)**: `topLevelObjects` — braces inside strings, escaped quotes, a top-level array of match objects, several `{ "matches": … }` objects, trailing prose, a truncated last object, duplicates dropped, unknown keys dropped, `statReplacement` restricted to the substitutable list.
- **Stat enrichment**: one roller (`rollerFor`) drives the scan, the value adds (`heldValuesFor`), the stat value and the substitution; Endure Harm / Stress take the higher unless a substitution was chosen; Heal's self-mend the lower; integrity / companion health resolve to the substituting or named asset before the command vehicle / healthiest companion; `namedOnce` after the given-name change still returns one document for a companion matched by both of its names.
- **Riders**: `conditionFires`, `normaliseRider` bounds, `partitionRiders`, `dropUncheckedRiders` → `settlePreRollChoices` order, the dialog's grouping and its close → nothing applied; no vendored ability carries a "±N integrity" effect on an outcome (scanned the 87 vendored Starforged asset files), so the command-ship-only integrity write has no victim. Riders running only for the rolled outcome after an upgrade is a recorded trade-off (decisions "Issue #313").
- **Telemetry**: writes are serialised, appended on a copy, GM-gated; the usage split handles records without character counts.

### Not covered

- `src/moves/movePipeline.js` after line 1840 (`recordMove`) beyond a skim; `src/index.js`, `narrator.js`, `narratorPrompt.js`, `burnMomentum.js`, `improveResult.js`, `resultUpgrade.js`, `batch/driver.js` only where a trace entered them.
- `src/ui/settingsPanel.js` (the Confirm dialog's DOM) — the stakes it shows were read through `stakes.stakesShown`, its renderer's input.
- Anything needing the live API: how often Haiku returns the reply shapes in AC69, what it does with AC64's false hint, whether the interpreter states a `missSuffer` for Enter the Fray in practice (AC02 needs only a stated miss line for the narration half).
- Issue #344 A04 (rider `choiceGroup` collisions) was left alone as instructed.

## MOVB — suffer moves, card actions, legacies, repair, rewards

### Questions raised (may be deliberate; not recorded)

1. **Withstand Damage and Companion Takes a Hit at 0 owe a resist roll too — and the vehicle-damage d100 is rolled at once.** The vendored texts read "Then, if your integrity is 0 or you choose to resist the damage, roll +integrity" and "Then, if their health is 0 … roll +your companion's health", and the vehicle-type cost (command vehicle: mark battered or cursed, mark a module broken, destroy a broken module, *or* roll the table) is the resist roll's miss at 0 integrity. `withstandDamage` (`sufferExecutor.js:1018-1028`) posts no resist card and rolls `VEHICLE_DAMAGE` the moment integrity reaches 0 — so a Face Danger miss whose price is "Your vehicle suffers damage" can put "Immediate catastrophic destruction" on the table with no Withstand Damage rolled; `companionTakesAHit` posts no resist card either. Issue #330 D3 decided exactly this for harm and stress ("it skipped a roll the move makes mandatory and could land Face Death on a Face Danger miss"). Recorded only as "the at-0 vehicle-damage d100 is kept" (`SUFFER-EXECUTOR-ASSET-SCHEMA`) and "The at-0 vehicle-type cost stays card text" (play-kit coverage l.268). Options: (A) D3's shape for both — a resist card whose press rolls the move, the table / battered choice on its miss; (B) keep, and record it as an accepted approximation in decisions.md.

2. **"Companion destroyed" keys on the wrong roll.** The rule is "a miss with a match *on this move*" (Companion Takes a Hit's own roll). The executor's branch (`sufferExecutor.js:930`, `opts.isMissWithMatch`) reads the card's originating move — reachable only through a redirect picker chained from another move's miss with a match — while the move's own miss option is `{ companionHealth: -1 }`, a `meter` call (`sufferDialog.js:355-359`) that posts no destroyed prompt; only the move card's outcome text says it. The resolver's comment "Executor handles at-0 + match → companion destroyed" (`resolver.js:1046`) is stale. Options: (A) say it on the choice card's result when the move's own miss with a match leaves the companion at 0, and drop the executor branch; (B) leave the outcome text as the only prompt and delete the dead branch.

3. **Pay the Price "a companion … is put in harm's way" with several companions** harms the first companion asset `actor.items.find` returns (`index.js:7518-7521`), while the executor's own no-id rule is "the only companion, else none". Options: a "which companion?" card; or keep and record.

4. **Wounded caps health at 4, shaken caps spirit at 3** (`actorBridge.js:588-589`; play-kit doc l.63 says "rulebook"). Neither the vendored move texts nor the vendor sheet carries a cap, and the two numbers differ. Outside this area's assigned files; flagged for a rules check only.

### Traced and found sound

- **Lose Momentum**: clamps at −6; the refused remainder posts the "any" picker without Lose Momentum plus one "Clear progress" per open track with ticks; `clear-progress` re-checks the track at pick time and clears one rank's mark (12 / 8 / 4 / 2 / 1 ticks) — the rule's "1 unit per rank", whatever the loss's size. Pickers are bound to the move's resolution; executor opts are filtered (`resistMiss`, `sufferCardId`, `fixedRoll` do not leak).
- **Endure Harm / Stress**: absorbed vs overflow (`splitOverflow`), overflow to momentum with its own receipt; at 0 the harm step posts the resist card and marks nothing; `resistMiss` at 0 posts the mark / lasting / table choice with `requires` on impacts already marked; the Lose Momentum (-2) branch offers the same choice only at 0.
- **Sacrifice Resources**: at 0 marks the crew (`markUnprepared`), momentum clamps receipted per PC; unprepared at any supply redirects to a picker without Sacrifice Resources; Repair's trade refuses an unprepared payer on both clients, pays in full or refunds.
- **`assetDeltas` receipts (P2-09)**: one receipt per route whose track actually moved (`before − after > 0`), target by Item id or vehicle Actor id; a loss at 0 leaves no asset receipt and its overflow a momentum receipt (refunded by an improvement, replaced by a burn's reset); a skipped / refused route leaves none; restore goes through the track's own writer as a `restore` (battered does not refuse it), clamped to max; refused restores become `assetTrack` Retry steps with validated values. A "Roll twice" on the same vehicle gives two receipts that sum correctly. Price result cards carry `priceOf` and are struck; pending price choice cards are retired by `reconcileChoices` (kept when the price stands). Nothing un-receipted is written by a route except the unprepared marks, which are receipted on the supply receipt.
- **`withoutSystemNotes` (P2-13)**: counter released in a `finally`; a note is dropped only when its speaker is an Actor the bridge is writing at that moment (`_moduleWritesInFlight`) — a player's own sheet edit keeps its note; spans are single writes. (A concurrent *module* write to another Actor inside the span loses its note — stated in the function's own doc comment.)
- **Suffer card**: claimed before effects; `_picksInFlight` + `resolved` / `pickedIndices` stop a double apply; the pick must be one the card offers; `requesterOwnsActor` on the card's own PC (never a fallback PC); a superseded outcome's card refuses the pick (`upgradeKindFor`) whether or not it was retired; a gone PC is refused for a player and retires the card for a GM; kept price cards and the cards their picks post carry `upgraded`; multi-select caps (`multi: 2`, `multi: true`, "two suffer moves") accumulate correctly; follow-up cards (`needs-any`, `amountPick`) re-open the parent when they cannot be posted.
- **Card actions**: every handler checks card kind → in-flight key → claim flag → ownership → claims before posting → releases on a failed post; `sourceCardFlag` / `releaseSourceCard` release only while the card still holds the press's value and only for a GM-authored forced move; waypoint alternative vs ordinary reward is exclusive both ways and closed by an upgrade; threshold card takes one choice and stamps `frayTrackId`; `whichFight.pick`, `fulfilVow.pick`, `legacy.pick`, `connection.pick` validate the payload against the card's own choices; `payoff.retry` is GM-only on a GM-authored card.
- **"Finish the Expedition" (P2-14)**: the button's boxes and the muted threshold (under 4 boxes; the comment's miss odds check out — 81 % / 64 % / 49 %); CSS class exists; the press is the roller's, once, by track id.
- **Legacy tracks**: `markLegacyTrack` — 2 XP a box, the tenth box at the cycle's rate, 1 XP a box after a clear, several boxes and a mid-mark clear, a legacy record frozen at 40; `legacyRewardTicks` 1 / 2 / 4 / 8 / 12 with a weak hit one rank down (troublesome → 0); `legacyTracksWithCopyMarks` — the working copy handed to `recordMove` is the object `addLegacyTicks` marked in free-flow, Batch Mode and held results (the WeakMap key survives), upgrades write through `writeLegacyTicks`; `sharedLegacies` delta / absolute queue and backfill.
- **Combat threshold / position**: Enter the Fray's weak-hit choice lands on the card's own fight (stash while waiting, `frayTrackId` once entered, nothing after a way out); position is per character (`positions[actorId]`).
- **Develop / Forge**: bonded outcomes table shared by the pipeline and `!bond` (strong 2 ticks, weak +2 momentum, match raises rank on a strong hit only, never past epic); `developmentAdded` for upgrades; bond Item rank mirror keyed by the record's `_id`; `selectConnection`'s `unbonded` / `strict` rungs.
- **Repair**: points table, costs, caps and the budget check match the vendored move; re-validated on the GM.
- **Rewards**: `planRewardGrant` scaling; `parseRewardProposals` tolerant of fences and junk; reward text escaped.
- **Milestone / picker**: pick must match the card's `(vowId, actorId)` pair; owner or GM; claim before the mark, released on a refused mark; a fulfilled, forsaken or deleted vow marks nothing and leaves the picker open for the others; ticks per rank × the choice's marks.

### Not covered

- `docs/flows/combat-flow.md`, `vow-flow.md`, `connection-flow.md` — not read (the code was traced instead).
- `src/character/actorBridge.js` — read in parts only (ll. 40–225, 540–720, 735–1080, `readVows`); the bond-Item mirror writers (`setBondItemTicks` / `…Rank` / `…Forged`, ll. 1280–1500) and the vow-clock helpers were not read.
- `src/clocks/payThePriceClocks.js` — the diff since `18d258b` only.
- `src/index.js` — only the ranges this area calls into (≈1150–1270, 2405–2445, 2540–2690, 4630–4700, 5060–5350, 6375–6435, 7090–7610, 9240–9300, 9440–9705). `postPayoffFailureCard` / `runPayoffStep` / `retryPayoffSteps` bodies, `createCombatTrackFromThreshold`, `performRecommit*`, `markFightVowMilestoneOnce`, `deepenVowConnectionOnce` were not read.
- `src/moves/heldResult.js`, `burnMomentum.js`, `improveResult.js`, `consequenceRiders.js`, `persistResolution.js` (beyond ll. 40–180 and the legacy merge) — not read; the held-result seam with the suffer card was reasoned from `resultUpgrade.js` only.
- `src/entities/connection.js` (`forgeBond`, `markRelationshipProgress`) and `src/entities/ship.js` beyond `changeIntegrity` / `updateShip`'s first 80 lines — not read.
- No Quench or live-Foundry check was made; the timing assumption behind `withoutSystemNotes` (the system's note is created while the module's write is in flight) is PT14's and was not re-verified.

## NARA — `src/narration/narrator.js` 1–3400

### Questions raised (may be deliberate; not recorded)

- **(Foundry) Does a player's client receive the "World Journal — Secrets" journal at all?** Everything hidden (plans, the snapshot page with every active plan) rests on a JournalEntry with `ownership.default: 0` not being in a player's `game.journal`. `rules/foundry-api.md` and the Foundry reference say nothing about it; P2-31 assumes players "cannot read the plans". If Foundry delivers the document and only hides it in the UI, then `listSkeletons()` returns the plans on a player's client: `buildPrivateChannelStory` (`narrator.js:929-943`) and narration on a player's own key (`:560-594`) put them in prompts built there, and a console read shows them. Needs a live check: as a player, `game.journal.find(j => j.flags['starforged-companion']?.worldJournalCategory === 'secrets')`. Options: verify and record in rules/foundry-api.md / move the plans behind a GM relay if they are delivered.
- **Fact-block token headroom was sized before the skeleton keys.** `SIDECAR_TOKEN_HEADROOM = 500` (`narrator.js:231`, comment: frame + truths + state ≈ 240–290, premise ≈ 400). A DECIDE NOW answer adds one full plan object per plan (up to four), plus `reveals` / `openQuestions` / `countdown` / `newThreats`. At the default cap (16,000) this is moot; at a lowered cap (the setting's minimum is 300 → 800 with headroom) every DECIDE NOW beat risks truncation, which today loses the whole fact block and (AC07) the request. Options: add headroom per plan asked / leave and document.
- **An X-Card on a narration that played a plan's escalation step restores the plan, not its clock.** `paceAfterReveal` (`secrets.js:691-704`) resets or retires the plan's clock with an unstamped write; the X-Card puts the step back unplayed, but a retired clock stays retired (`planClock` → null) and `ensureThreatClock` only runs on a decision, so the step is never paced again. SKELETON-CLOCK-RESET-REWIND records the burn's variant (reset to empty) as residual; the X-Card's — and the *retired* case — is not recorded. Options: accept as the same residual / re-arm the clock when a restored plan has an unplayed step.
- **A removed narration's plan writes survive under a later kept one.** `undoNarrationEntries` skips a page whose current stamp is not a removed narration's (`if (!fromRemoved(entry)) continue`). With *ask before paying* off: move narration N1 decides a new enemy's plan; another player's paced / `@scene` narration N2 records a reveal on it; the roller then burns — N1's decision stays (the page is stamped N2), while `removeClocksMadeBy([N1])` deletes its clock, leaving `clockId` dangling. Intended (the later narration "owns" it) or a gap? Traced by reading only.
- **Plan requests are capped at four per narration** (`normalisePlanRequests().slice(0, PLANS_PER_SIDECAR)`, applied in `buildNarratorExtras` `:592`): a Batch Mode round whose entries bring five or more (expeditions, discoveries, new enemies) drops the rest with no plan filed. Accept, or file the overflow with rolls alone?

### Traced and found sound

- **Cached blocks (P2-23, #357).** `standing` reads only table-level settings, safety, truths, premise, the sidecar instruction and NPC markup; `mode` only the role, beat-ending rule, perspective, length and permission class; the beat shape and used images (`beatVariety`, deterministic by card count — no RNG), the X-Card redirect, the session-start recap, IN PLAY NOW, CHANGED SINCE THE SNAPSHOT, the scene vow, clocks, tracks, UNREVEALED and DECIDE NOW are all in `beat`. `Date`/timestamps reach no cached block. At most three `cache_control` breakpoints (standing, snapshot, mode), all `ttl: "1h"` (no longer-after-shorter ordering problem), the uncached context last. `prewarmNarratorCache` sends the same first two blocks with `max_tokens: 0`, non-streaming, with api-proxy's thinking-off form — the documented pre-warm shape, matching real traffic's thinking setting.
- **`splitNarratorSystemPrompt` ↔ the snapshot.** `worldSnapshot.js unitText` rewrites `---` lines and `#`–`###` headings in every unit, so stored snapshot text cannot contain a block boundary; the split finds the first headings only.
- **The snapshot is a pure function of the records** (no timestamp or count rendered; units sorted by section / `order` / key; manifest hashes text), is read only by a GM (`resolveWorldSnapshot` returns null for a non-GM, and for a non-canonical GM when a new one is due), and nothing of it is put on a card, a chat flag or a world setting; `worldSnapshotEvents` holds ids and times only.
- **Player-key / no-snapshot path.** No standing or mode text refers to the snapshot; `CONTEXT_INTRO_SNAPSHOT`, IN PLAY NOW, CHANGED SINCE and UNREVEALED's "written out under HIDDEN PLANS in WORLD SNAPSHOT" are all conditional on a snapshot (`coveredIds` is `[]` without one), and the per-beat sections render as before. A player's standing block carries only that player's own Private Lines.
- **`inPlayFor`.** An entity not among the world's units (an uncharted site) keeps its card (`uncoveredCards`); the current-location card is kept unless the location is a unit; only plans that are units are "named" rather than printed.
- **X-Card, in-range.** `watchXCard.interrupted` is asked after every Claude call (first try and retry) before the sidecar is applied or anything posted, in `narrateResolution` and `narrateRound`; the round's `superseded()` check precedes both. `applyXCardToNarratorMemory` drops the clocks stamped with the removed ids in the pause's own write; a superseded narration's plan writes and clocks are taken back once (`undoSupersededPlans`), and a later X-Card on the upgraded beat (`withStruckByUpgrade`) finds nothing left stamped — idempotent.
- **Canonical-GM / chain discipline.** Sidecar apply canonical-only, else relayed; `ensureSceneStarted`, the spotlight persist, the recap cache, the redirect clear, the deleted-message record and the summary persist are canonical and on the campaignState chain with a read at their turn; the relayed summary is validated on the GM (session, coverage monotone, card count, X-carded ids). `reportSnapshotEvent` writes its own setting, GM-only.
- **Flag family / ring.** `postNarrationCard`, `postRoundNarrationCard`, both fallback cards and the paused cards carry the flags rules/narrator-memory.md invariant 1 names (fallback: family + `narrationFallback`, no `narrationId`; paused: not a narrator card); `inNarratorMemory` leaves out fallback, `xCarded`, `burnSuperseded`, whispers and the co-marked system cards; no card flag in this range carries plan content.
- **Usage telemetry (P2-24).** `outputSplit` measures prose vs. fence with `extractSidecar`, `outputTokenSplit` guards a zero total; rows are GM-written and serialised. `!narrator debug` whispers its GM only.
- **Round plan refs** are unique per entry (`${narrationId}-${i+1}`), within `ID_RE`'s 64 characters.

### Not covered

- `narrator.js` 3400–end beyond the functions listed at the top (the other modes — `@scene`, oracle follow-up, vignettes, vow scene, inciting incident, paced input — were read only at their `applyNarratorSidecar` call sites).
- `narratorPrompt.js` outside 1483–2470 (the sidecar instruction's wording, the ledger block and its drop order, entity cards, the user-message builders, `proseVariety.js`).
- `entityExtractor.js` (not read; only its `isNarrationXCarded` call sites were listed). `ledgers.js` beyond the diff hunks. `docs/flows/narrator-context-flow.md` beyond the opening of §2.
- Lines 2206–2500 (deleted chat messages, the X-Card's pick) and 2794–2945 (session recap) were read but not probed — code the thirteenth audit covered, unchanged apart from `applyXCardToNarratorMemory`'s `cards` option.
- AC04's two "same cause" items (the upgraded narration's oracle seeds / connection seed, and the GM's relevance pick) and AC39's other modes are from reading, not probes.
- Nothing was run against the live API or Foundry: cache reads, real sidecar compliance and the Decisions' (Foundry) item are unverified.

## NARB — `src/narration/narrator.js` 3400–end

### Questions raised (may be deliberate; not recorded)

- **(Foundry) Can a player's client read the Secrets journal?** The code holds both answers. `oracleConsult.js` (P2-31) says "the plans are the GM's, in a journal a player's client cannot read" and relays for the odds; `worldSnapshotStore.js` gates on `game.user.isGM`. But `buildNarratorExtras` (narrator.js:560–594) and `buildPrivateChannelStory` (929–943) call `listSkeletons()` with no user gate, and decisions.md says "The Private Channel reads plans (decided)" — on the player's own client and key. If ownership NONE keeps the journal off a player's client, the Private Channel never sees a plan (a decided feature with no effect for players). If Foundry sends every world document to every client (ownership only hiding it in the UI — worth checking live: `game.journal.find(j => j.flags['starforged-companion']?.worldJournalCategory === 'secrets')?.pages.contents` in a player's console), then every narration on a player's key (`@scene`, an oracle follow-up, `!recap` at a keyless-GM table) carries [6.6] UNREVEALED with full plans, and the journal itself is readable. Options: gate the two `listSkeletons()` reads on `isGM` and relay the Private Channel's plans like P2-31; or record that plans are GM-only by courtesy.
- **A relayed `narrator.sidecar` is applied as sent, including `reveals` and `plans` by id** (`applyRelayedNarratorSidecar`, narrator.js:5794–5820). A player's client is shown no plan, so an honest relay never carries a real plan id — but plan ids are public (`campaignState.clocks[].planId`, a rolls card's `skeletonId`), and a hand-made relay with `reveals: [{ id, revealed: ['truth'] }]` makes the GM write the hidden truth into `sceneTruths` (a world setting), Lore and a table card, or resolve / rewrite a plan. The accepted limitation says a forged request "can only do what the UI could have done"; this one can do more. Options: drop `reveals`, and `plans` whose id is not one of the payload's own `planRequests` refs, from relayed sidecars; or accept.
- **Whose block does a clock vignette (and the inciting incident) carry?** (AC75.) The PCs at the table as the galley; the price's roller when a Pay the Price filled it; or none.
- **Nothing closes a plan but the narrator's `resolved` or a GM's Retire.** A finished expedition's, a fulfilled or forsaken vow's and an old scene's mystery plan stay `active` when the closing narration omits `resolved`, fails or is paused: they stay in every world snapshot and are what AC11 trips on. Options: resolve an expedition's / vow's plan in code when its track completes / the vow closes; retire a scene's unanswered mysteries at scene end.
- **A Burn / Improve leaves the struck narration's ship move in place.** `restoreShipPositionAfterXCard` (narrator.js:6637) is called by the X-Card alone; `retractSupersededNarrations` undoes ledgers, plans and clocks. D8 says the struck narration's records stand, but SHIP POSITION is a never-dropped current-state line and the sector token: if the re-narration emits no position, every later prompt names the struck destination. Options: restore on supersede as the X-Card does; or record it under D8.
- **A reply with a fact block and no prose still applies the block** (every path: e.g. narratePacedInput 4546–4553, the clock vignette 4195–4196, the oracle follow-up 3860–3862): truths, state, plans and a forced plan step are written under a narration id no card carries, so no X-Card can reach them. Rare; options: apply only once prose is known to be non-empty, or accept.
- **A forced reveal is appended after the sidecar's own** (`reveals: [...own, ...forced]`, 5695) and `applyPlanSideData` re-normalises with a cap of four: a sidecar that already carries four reveals drops the forced step. Prepending it costs nothing.

### Traced and found sound

- `finalizeSessionSummary` / `catchUpUnsummarisedSession` / `refreshRollingSessionSummary` / `applyRelayedSessionSummary`: canonical-GM gates, writes on the campaignState chain reading the store at their turn, bounded waits (`settledWithin`), guards released in `finally`, the relayed summary bounded and re-checked against the X-Card on the GM.
- `interrogateScene`, `narrateOracleFollowup`, `narratePacedInput`: X-Card checked before and after the call (and on the retry), speaker resolved from the given actor id or none (AA30 / Z50 hold), no world write on a non-canonical client (`ensureSceneStarted`, `applyNarratorSidecar`'s relay), captures on the narrating GM only.
- `narrateSessionVignette`: present PCs by actor id, NPC cards excluded (`isPlayerCharacterActor`).
- `prewarmNarratorCache`: canonical GM + key + narration + caching + snapshot gates; never throws; builds through the same seam as a narration; makes no card and applies no sidecar. Its `buildNarratorExtras('session_vignette')` advances no spotlight (mode not in `SPOTLIGHT_MODES`); it may generate the campaign recap early (cached for the first narration).
- `callNarratorAPI` / `narratorSystemBlocks`: cache breakpoints only on cached blocks, none with caching off; truncation and empty replies surfaced.
- The plan clock's own reset vs `strikeIfRewoundWhilePosting` (payThePriceClocks.js:87): the reset lands after two journal-page round trips and the check runs after one chat-create round trip, so the vignette is not struck as "rewound" (the control in the AC08 probe asserts it). The ordering is by round-trip count only — fragile, not broken.
- `restoreShipPositionAfterXCard` / `applyShipPositionChanges`: every key written on restore (`emptyPosition()`), the oldest removed narration's token spot wins, history bounded.
- No hidden-plan text reaches a card or a card flag from this range: `stepLine` / `pacedLine` go to the user message only; the debug capture is GM-only and whispered to self.
- `lineIsToAFellowPlayerCharacter`, `reconcileSuggestedMove`, `extractMoveFromNarrationHint`: user / LLM strings are escaped before use in a RegExp (`escapeRegexLiteral`, `wholeWordPattern`); card HTML goes through `proseToHtml` / `escapeHtml` (but for AC73).
- `scheduleNarrationCapture` / `scheduleSceneAnswerCapture` on `game.user.isGM` rather than `isCanonicalGM()`: deliberate and recorded (CAPTURE-HANDOVER-SCENE-ORACLE-VIGNETTE); the narrating client is the single emitter.

### Not covered

- Read in full: narrator.js 3388–6734. Lines 236–1065 and 3028–3396 were read for the contracts my range calls (`buildNarratorExtras`, `getRollingSessionSummary`), not audited — the other narrator reviewer's range.
- Read in full as support: `src/world/secrets.js`, `src/world/skeletons.js`, `src/narration/worldSnapshotStore.js`, `src/narration/snapshotEvents.js`. Read in part: `narratorPrompt.js` (2040–2470 only), `sceneChallengeOffer.js`, `payThePriceClocks.js`, `clocks.js` (the advance / adjust functions), `resultUpgrade.js` (`retractSupersededNarrations`), `oracleFollowup.js`.
- Not read: `worldSnapshot.js`, the rest of `narratorPrompt.js`, `src/factContinuity/*` beyond `normaliseSidecar` and the consistency-check diff, `entityExtractor.js` (grepped only), `openThreads.js` (grepped only), `actorBridge.js`. `docs/flows/narrator-context-flow.md` was read for the world-snapshot section only.
- Not traced in this range: the supersede / X-Card card-pick functions (lines 2400–2800), `postSessionRecap`, `getCampaignRecap`; IN PLAY NOW / CHANGED SINCE THE SNAPSHOT and budget shedding live before line 3400.
- Nothing was checked against a live Foundry world or the live API; the first Decision row needs a live check.

## NARP — narrator prompt, world snapshot, prose variety, spotlight

### Questions raised (may be deliberate; not recorded)

| # | Question | Options |
|---|---|---|
| D1 | `worldSnapshotEvents` is a world setting, so every client holds the pending marks: `plan_made`, `plan_decided`, `plan_revealed`, `plan_retired`, `new_enemy_revealed`, each with a time. decisions.md calls it "an id and a time, nothing of the story". A player at the console can still tell that a hidden plan was just made or decided for the beat they watched — which the narrator is told never to hint at. Accepted? | Keep (console access is outside the threat model, as for the Secrets journal itself) · or store one opaque "out of date" mark in the setting and keep the ids on the GM's page log |
| D2 | A world that never saved the Narrator tab ran on the old default-on Rotating Spotlight. `applySpotlightDefaultOff` switches off and announces only a *stored* "on"; such a world goes off with no notice (it is "only marked"). decisions.md argues the default flip "would reach almost no existing world". Intended for the ones it does reach? | Keep · or post the notice whenever the marker is first written on a world that already has sessions |
| D3 | The expiry check counts any narrator card of the session as a use of the cache (`lastNarratorCardAt`), including a published Private Channel reflection and a narration that ran on a player's own key — neither read the snapshot's entry. After a reload this can read a lapsed entry as live for up to an hour: the call pays a write of the old snapshot plus its changes instead of taking a fresh one. Cost only. | Keep · or stamp cards whose request carried the snapshot and count those |

### Traced and found sound

- **Snapshot determinism.** Units are a pure function of their records: no timestamp, count or time-ordering reaches unit text (`updatedAt` / `severity` ride as unit metadata only); sections in fixed order, units by `order` then key with plain code-unit comparison; duplicate keys dropped first-wins; `renderWorldSnapshot` reads no clock. `localeCompare` is used only for ids inside a unit (sector cast, tracks, vows) and for `takenAt`; a different order would need two GMs on different locales with the non-canonical one narrating — not reported.
- **Unit text cannot split the block.** `unitText` rewrites `---` rules and `#`–`###` headings in every unit; `splitNarratorSystemPrompt` finds the first THIS NARRATION after the standing block and the context after that; a meta mode stays one uncached block.
- **Manifest / diff.** Keys are host document ids, page ids and plan ids (factions by `factionNameKey`, where a rename reads as removed + new and takes a snapshot). A deletion, a retired or resolved plan, lore turned to rumour, a resolved or merged threat and an X-Card's deletions are all `record_removed`. cyrb53 over the unit text; nested fields count exactly when they are rendered.
- **What is excluded.** Uncharted sites (`discovered !== true`, by `actorId`, which both the generator and PT07's `recordUnchartedDestination` stamp) stay out and still get their card in the context when in play; unconfirmed and retracted lore, resolved threats and inactive plans are out as they were per beat; entities in other sectors and with no sector all have cards. The lore and threat filters match `getConfirmedLore` / `getActiveThreats`.
- **Store.** Text on a page of the `ownership: { default: NONE }` Secrets journal; `resolveWorldSnapshot` returns null for a non-GM before any read; only the canonical GM takes one, another GM sends the one held or none when one is due; `_last` covers a page write still out or refused; page writes are queued per client and the wait is bounded (30 s); the log is capped at 60; the record holds arrays only, so `setFlag`'s merge cannot keep a dropped manifest key; a deleted page or journal is re-made at the next snapshot; a reload sends the stored text. The snapshot page is ignored by every other reader of the Secrets journal (`listSkeletons`, `undoNarrationEntries`, the panel) because it carries no `secretEntry` flag. Two narrations built at once take one snapshot and send the same text (run on the simulated table).
- **Events table.** All 27 rows have a reporter and every reporter names a row (re-grepped each site). Marks are GM-only writes; a player's report is dropped; `clearSnapshotEvents` answers exactly the marks read with the units, and a mark persisted after the snapshot that answered it is dropped by `persistEvents`' own follow-up. Residual races need two reports of one id around a snapshot inside one socket round trip — not reported.
- **Size and age rules.** `changes_large`: strictly over 2,000 estimated tokens or a quarter of the snapshot; `cache_expired`: `now - lastUse >= ttl` from the latest of taken / sent / newest narrator card, so a reload is not an hour's silence; the lifetime is counted from request start, as the API counts it.
- **Pre-warm.** Built through `buildNarratorExtras` → `buildNarratorSystemPrompt` → `splitNarratorSystemPrompt` like a narration; on the simulated table its two blocks are byte-identical to the next narration's first two, same model, same `thinking` form (api-proxy adds it to both), `cache_control` 1h on both, not streamed. `max_tokens: 0` is the documented cache-write request; none of its rejected combinations is sent.
- **Standing / mode blocks.** Apart from AC67 nothing per-call reaches `standing` (tone, custom instructions, levity, Lines / Veils, truths, premise, sidecar format, NPC markup). `mode` varies by mode, permission class, round size and — in a session never begun — the connected users (recorded, PT03).
- **`lengthBudget`.** Length 1–6 gives 20/30/2, 45/55/3, 65/85/5, 90/110/6, 110/140/8, 130/170/9 (words / ceiling / sentences); 30 words a sentence, 18 with audio; a round passes `roundSentenceTarget` to both the mode block and the user message, so the two agree. decisions.md's "65 … 85 … 5" matches.
- **`recentImages`.** Four linear patterns (no nested quantifier), tags and emphasis stripped first, read from `narrationText` not card HTML, over `sessionNarratorCards` — so fallback, X-carded and superseded cards are out; eight images of twelve words at most.
- **Spotlight.** Pointer is per scene, persisted by the canonical GM on the write chain, skips the acting PC, counts PCs not players (decided). `applySpotlightDefaultOff`: canonical GM at load, switch-off before marker, a marker already set leaves a re-ticked setting alone, a refused marker posts no second notice.
- **`!narrator debug`.** Refused for a non-GM on the typist's client; the card is whispered to that GM alone; captures live in that browser's memory; Private Lines are counted, not shown; the snapshot section is clipped to 4,000 characters.
- **`thinking.js`, `failureReason.js`, `nativeProgressRoll.js`.** Exact-id model regexes match the per-model forms in the API reference; failure reasons key on status first; the progress-roll outcome is score against each challenge die. `thinking.js` and `nativeProgressRoll.js` are unchanged since the last audit.
- **Not a leak, by reading:** the API transaction log and Narrator Usage rows hold token counts and a label, never prompt text.

### Not covered

- `src/narration/narrator.js` (6,734 lines) and `src/index.js` (9,837) were read only at the callers of the assigned files (extras build, `inPlayFor`, `beatVariety`, spotlight, pre-warm, `callNarratorAPI`, the event reporters, `!scene`, the command routes) — not in full.
- `src/world/worldJournal.js`, `entities/*.js`, `ui/settingsPanel.js`, `ui/entityPanel.js`, `context/safety.js`, `sectors/sectorGenerator.js`: only the functions the traces passed through.
- The Quench batch (`promptContracts` → "the world snapshot") and the Playwright playthroughs were not run.
- Nothing was run against the live API: cache reads, the model's handling of CHANGED SINCE THE SNAPSHOT by omission (AC65), of the roster (AC29) and of the dangling references (AC66) are unmeasured.
- (Foundry) Whether a player's client holds the Secrets journal's pages at all, and whether a page update is broadcast to clients without permission, was not checked live; NARB raises the same question. The store's own gate (`isGM`) does not depend on it.
- Seen, not pursued (outside this area or too narrow to stand behind): the snapshot page write and a first plan can both create the Secrets journal if they start inside one round trip on a world that has none; `formatClocksBlock` shows the first eight active clocks in creation order.

## SKEL — hidden plans, oracle consult, clocks, open threads, panels

### Questions raised (may be deliberate; not recorded)

Behaviour that looks wrong but may be deliberate and is not recorded.

1. **Plan clocks are public by name.** A threat plan's clock is named "&lt;subject> — escalation" and appears on "⏳ The clock turns", `!clock list`, the Clocks panel and every player's Session panel, with its fill. The markers decision says a plan's existence is the GM's to see ("any content on a shared screen leaks it") and the narrator is told "never hint that a plan exists". Options: accept (tension clocks are table-facing); name the clock by its subject alone; keep plan clocks out of player-visible lists and whisper their lines to the GMs.
2. **The consulted odds are printed on the oracle card.** `!oracle yes unlikely Is the escort a drone?` posts "Ask the Oracle (almost certain)" with that odds' threshold: the label states the hidden truth whatever the dice say, one yes/no at a time, with no limit, and each ask costs the GM's key a Haiku call (a crafted socket ask too — the trust model). Also, the consult's instruction "50_50 when the truth does not bear on the question" replaces the odds the player gave for any question that merely names a planned subject. Options: keep; show the odds the player typed and hide the threshold; return "no opinion" for a truth that does not bear and keep the player's odds.
3. **Is a GM-only journal a barrier for a player's client, or only for the player's screen? (Foundry)** `oracleConsult.js` and SNAPSHOT-PLAYER-KEY say a player's client "cannot read" the Secrets journal; decisions.md R4 and the Private Channel rely on every client reading it alike (`listSkeletons()` runs on a player's client for "What's open" and for the Private Channel's prompt), and the test harness shares journals between clients. If Foundry sends an ownership-NONE journal to every client, then a narration on a player's own key builds UNREVEALED and DECIDE NOW from the plans and sends them on that key, and the consult round trip hides nothing the client does not already hold. To check live: on a player's console, `game.journal.find(j => j.flags["starforged-companion"]?.worldJournalCategory === "secrets")?.pages.contents`.
4. **A superseded reveal leaves its Lore entry.** A burn that supersedes a narration which revealed a plan's truth puts the plan back to unrevealed and retracts the ledger truth, but the confirmed Lore entry "Threat: &lt;subject>" stands (issue #338 D8: "the superseded narration's World Journal … records stand"), as does the rolls card. The narrator is then told both "never state outright" and, under ESTABLISHED LORE, the truth. Options: accept; include the lore of a revealed truth in the supersede's undo.
5. **Plans never leave play by themselves.** A mystery stays active after its scene ends, an expedition's plan after its track is finished or removed, unless a narration says `resolved` or a GM retires it. So "Unanswered questions" on every player's Session panel, and the world snapshot's plan section, grow for the whole campaign. Options: retire a scene's undecided or unrevealed mysteries at scene or session end; resolve an expedition's plan when its track completes.
6. **A countdown used as a scene challenge's clock.** When a price from outside the challenge fills it, the plan's pacing puts it back to empty (a threat with steps left) or retires it (a mystery) — the challenge's time limit disappears. When the challenge's own moves fill it, no vignette runs, so the countdown's "what happens when it runs out" is never played or marked. Options: do not pace a clock a scene challenge holds; or play the plan's step on any fill and leave the clock full.
7. **The scene-challenge offer card outlives its countdown.** An X-Card or a supersede removes the countdown's clock and plan; the GMs' offer card keeps the countdown's label and a live button, and pressing it makes a challenge with a fresh clock for a countdown the table removed. Options: stamp the offer with the narration's id and close it in the undo; leave it to the GM.
8. **A plan the GM decides by hand gets no clock.** `ensureThreatClock` runs only from a narration's decision; a truth and escalation typed into the Edit dialog are never paced. Options: accept; make the clock on a GM's edit too.

### Traced and found sound

- The Secrets journal is made by a GM only (`getOrCreateJournal` returns null for a player; `initWorldJournals` is canonical-GM-gated), with `ownership.default: NONE`; pages inherit it. A duplicate or renamed journal is resolved by its category flag, and the split-merge card is whispered to the GMs.
- No plan write runs on a player's client: `mayWrite` (canonical GM for narration, any GM for the panel); `applyPlanSideData`, `planNpcAgenda`, `planSignificantThreat`, `fileRequestedPlan`, `offerSceneChallenge` are all canonical-GM-gated; a relayed sidecar is re-normalised and bounded before it is applied.
- The World Journal panel opens for a GM only and fetches plans behind the same check; the "has a plan" markers are built on a GM's client only and read subject ids or names, never content.
- The Session panel reads exactly `question`, `subject.name` and `wants`, each under its recorded condition (by design, decisions.md R4); it escapes everything it prints.
- Cards: the rolls card and the Reveal now card are the store's only posts; their flags carry a plan id and a narration id, no text. The offer card is whispered to the GMs, its begin is claimed once on the card, refused for a non-GM requester, released on a refused write, and a second press finds it resolved. Clock and vignette cards carry the clock's name and id only.
- The consult socket: only the canonical GM answers; the answer is `{ kind, id, odds }` and the odds are validated against the five words; an ask is matched by its own id; the wait is bounded (8 s) and cleaned up in `finally`; gmRelay ignores the consult kinds (no shared prefix). No GM, no plan, no key, or no answer keeps the player's odds.
- X-Card and supersede, ordinary cases: a plan a narration made is deleted, one it changed is restored (up to three writes), its clocks are removed by `narrationId`, a GM's edit owns the plan from then on, `keepStamp` writes keep the stamp. The revealed truth's lore and ledger entry carry the narration's id and are retracted by the X-Card.
- Plan clock pacing: a forced reveal is merged into the sidecar (so it survives a relay), the step is marked whatever the model says, the clock resets while a step is left and retires when none is; a rewind while the vignette is in flight drops the vignette.
- `oracleMemory`: plan rolls are made with `rollOracle` / `rollPaired` directly and never reach `recentOracles`; only cards with an `oracleMemory` flag are captured. `oracleFollowup`: the GM narrates the card's own `oracleNarration`, once per card, for its author or a GM; the X-Card drop runs on the write chain.
- `openThreads`: `selectSceneVow`'s ladder, `distinctOpenVows`, `questVows`, `resolveVowChoice` and `trackVowName` behave as decisions.md R3 records (the by-position background vow and the name-only fight link are recorded residuals).
- Escaping: every plan, clock and countdown string that reaches `innerHTML` or chat content in these files is escaped.

### Not covered

- `src/narration/narrator.js` and `src/index.js` were read only where they call the plan store, the clocks, the oracle consult and the sidecar apply (not in full); `narratorPrompt.js` only `formatUnrevealedBlock`.
- `src/narration/worldSnapshot.js` / `worldSnapshotStore.js` (the snapshot holds every active plan) — not read.
- `src/private-channel/*` beyond `context.js` and `narrate.js`; `src/entities/entityExtractor.js` beyond its three plan call sites and `normalizeEntityName`; `burnMomentum.js` / `improveResult.js` / `heldResult.js` beyond the supersede and hold paths.
- The Batch Mode half of AC15 (the round setting) was traced by reading only.
- Nothing was run in live Foundry: Decision 3 and the ownership of the journal as Foundry delivers it are unverified.
- Not probed, seen while reading: a forced step reveal is dropped when the vignette's own sidecar already carries four reveals (`REVEALS_PER_SIDECAR`); `sameQuestion` matches by character substring ("Who is he?" is "Who is here to meet us?"); a vow's swearing narration that returns a sidecar and no prose can file its plan twice (`fileRequestedPlan` runs before the fire-and-forget filing lands).

## ENT — entity extraction, name matching, connections, registry

### Questions raised (may be deliberate; not recorded)

- **D1 — a detected person read as a known one is dropped silently, and there is no other way to make their card.** By the recorded decision "the dedupe gate treats any such match as already known", PCs included (`entityNameMatching.test.js` pins "Captain Sutton" as the PC Isaac Sutton). So a PC's relative introduced by title + surname, or anyone caught by AC17, never gets a row — and `createConnection` has no GM-facing caller (a hand-made character Actor is taken for a player character, Z73). Options: (a) keep, (b) list such names on the New Entities card as "read as &lt;known name>" with a "No — a new person" button, (c) whisper the GMs once per name.
- **D2 — a placeholder's noun is treated as a person's name.** With "The Stranger" or "The Escort" on record, a later, different unnamed figure the detector calls "Hooded Stranger" / "Second Escort" matches by "part" and is never offered (`personNameMatch("the stranger","Hooded Stranger") → "part"`). Options: keep (the GM renames the first), or skip the part rule when the known name `isPlaceholderName`.
- **D3 — a New Entities card with no PC (clock vignette, inciting incident, a line from a player with no character) keeps a plain "Confirm" that bonds the person to the canonical GM's own / first PC**, unnamed on the button; at a two-PC table Kira got the bond (checked on the simulated table). P2-16's reason ("a Confirm that always bonded put a hostile stranger on a PC's sheet") applies. Options: offer every PC by name on such a card (the round card's shape), or make its plain Confirm the no-bond one.
- **D4 — the X-Card on a Make a Connection narration whose hit bonded the roller to an already-known NPC (AA19's "listed" path) leaves that bond Item**: only connections stamped `createdFromNarrationId` are taken back (D6(ii)). Decide whether the unmarked bond Item the removed narration's hit added should go too.
- **D5 — deleting an NPC card in the Actors sidebar cleans up nothing.** No `deleteActor` handler exists outside the Entities panel's re-render: the id stays in `connectionIds` (readers skip it), the PCs' bond Items stay (CHARACTER STATE and the classifier's "speaker's connections" keep listing the NPC), scene-ledger facts stay keyed to the dead id, its hidden plan and "Art:" entries stay. The X-Card path does all of this (`retractNarrationConnections`). Decide whether a GM's delete should run the same teardown.
- **D6 — `generatedName` capitalises lower-case name particles**: "Lena van der Berg" → "Lena Van Der Berg", "d'arcy" → "D'arcy" (only `of / the / and …` are kept small). Cosmetic; decide whether `van / von / de / da / di / al / bin …` join the small words.
- **D7 — false negatives of the person rule (a second row is offered; the GM dismisses)**: a hyphenated given name alone ("Jean-Luc" vs "Jean-Luc Picard" → null, because the hyphen splits it into two words), straight vs curly apostrophe ("O'Brien" / "O’Brien"), diacritics ("Renée" / "Renee"), a middle name added ("Vuldar Kess Archer" vs "Vuldar Archer"). Also `findEntityForLoreRouting("Mario")` with both "Maria Vance" and "Mario Vance" on record answers nobody (two "part" matches) though one is exact on the first name.
- **D8 — a Confirm's own gate is exact-name.** Two rows for one person on one card (the detector lists "Vuldar Archer" and "Archer" in one reply — nothing dedupes within a reply), or a stale pending "Archer" row from before v1.8.2 pressed after "Vuldar Archer" exists, make two cards and two bonds (checked on the simulated table). Decide whether `confirmDraft` should apply the person rule and mark such a row "already known as …".

### Traced and found sound

- `nameMatch.js` mechanics: regex metacharacters, empty / one-letter / article-only names, Cyrillic and CJK words, "Vance" vs "Advance", "Hull" vs "Hull breach", `suffixedName` separators ("Raiders-led" is not a variant), `sameSubject` with numbers ("Deck 4 breach" ≠ "Deck 7 breach"); `wholeWordPattern` escapes its token. "Kira Vance" / "Kira Solen" and "Mara Archer" / "Vuldar Archer" stay two people; "Vance Station" (a settlement) and a person "Vance" do not collide in the draft gate (the person rule runs for `type === "connection"` only) and are "nobody's" in lore routing when both answer.
- Draft card lifecycle: Confirm / Dismiss relayed to the canonical GM and serialised; `_draftsInFlight` released in `finally`; `changeDraftRows` queue cannot wait on itself; double Confirm and two GMs create once; a refused registration is adopted, not doubled; "No one" (`data-actor-id=""`) survives the relay and creates the card with no bond (checked end to end); the PC-named button bonds the card's PC; a stale / foreign pick is refused with a warning; the bond Item's create runs under `moduleWriteOn`, released in `finally`.
- Detection reply parsing: malformed / truncated JSON → empty detection + a GM toast; non-array sections → `[]`; low confidence, dismissed, established, pending, rename targets filtered; pronouns / role / goal sanitised; unknown entity types are skipped (silently — only a risk if the model ignores the listed types); a severity sentence is handled in `worldJournal` (`normalizeThreatSeverity` / `strayThreatNote`); HTML from the model is escaped on every card.
- Captures are GM-gated (`runPostNarrationPasses`, `runRoundNarrationPasses`, `scheduleNarrationCapture`, the paced path runs on the canonical GM only): no tier / journal / Actor write is attempted on a player's client; tier writes read the flag and write with no await between.
- AB01 is still fixed: `postCreationEnrichment` starts `generatePortraitWhereKeyLives` and does not await it; `_portraitsInFlight` and the record's `portraitClaim` are released in `finally`; the seed hook's portrait runs outside the move lock.
- `registry.registerEntityId` (reordered this cycle): the caller's list is touched only after the store took the id; `persist: false` still returns true; the un-dismiss at registration writes only when that exact name is dismissed, and no creator I traced (draft Confirm, Make a Connection, sector creation, the uncharted destination) runs inside a chained campaignState task.
- `folder.ensureFolderPath` is get-or-create by type + name + parent id (FOLDER-001 holds); its callers at world load are canonical-GM gated.
- `connection.updateConnection` → `renameBondItems` (new): the placeholder rename, its X-Card revert and the sidebar rename all reach the bond Items; the `updateActor` echo cannot recurse.
- `seedIntro.js`, `finalize.js`, `salience.js`, `clarificationDialog.js`: no defect found (the clarification prompt holding the move lock before the dice is the recorded decision of #347 D1; `close()` settles it).
- Noted, not reported: a GM's Confirm press landing inside the one or two server round trips of a Make a Connection capture's own `confirmDraft` of the same row (it bypasses `_draftsInFlight`) could make two cards; outside that window `adoptUnlistedEntityActor` collapses them.

### Not covered

- `src/world/worldJournal.js`: read only lines 100–940 (threat naming / merge, lore, faction, location writers) — the WJ area's.
- `src/character/actorBridge.js`: only the module-write marking (lines 40–260) and the bond-Item helpers (1262–1576).
- `src/art/generator.js`: lines 1–420 (first-portrait and regeneration paths) read; 420–758 (OpenRouter call, upload) not read.
- `src/ui/entityPanel.js`: only the diff since `18d258b` and the handler list.
- `src/narration/narrator.js`, `src/index.js`: only the capture callers / hooks named above.
- `src/world/secrets.js`, `skeletons.js`: only the call sites of `sameSubject` / `personNameMatch`; what a false match does to a plan is the skeleton area's.
- `src/entities/migrator.js`: only `registerUnlistedEntityActors` and the diff.
- Not run against live Foundry; none of the findings depends on Foundry behaviour beyond what the test stubs model.

## FC — fact continuity, the X-Card, safety

### Questions raised (may be deliberate; not recorded)

- **D1 — relayed sidecars carry plan writes.** `applyRelayedNarratorSidecar` (`narrator.js:5794`) re-normalises and applies a player client's `plans`, `reveals`, `countdown`, `newThreats` and `planRequests` (with a client-chosen `subject { type, id, name }`). A narration on a player's own key never sees a plan id, but plan ids are readable by every client (`campaignState.clocks[].planId`), so a crafted `narrator.sidecar` relay with `reveals: [{ id, revealed: ["truth"] }]` makes the GM file the hidden truth in the ledger and lore and post the rolls card; `plans: [{ id, truth }]` rewrites a plan. The code comment says a relayed sidecar has "the same trust as its prose". Options: (a) accept; (b) on the relay path keep only answers to the request refs it carries plus `openQuestions` / `newThreats` / `countdown`, and drop `reveals` and `plans` by existing id. Unprobed.
- **D2 — scene end and scene-scoped plans.** `endScene` clears the ledgers, frame (and the scene question), spotlight and `!pace` override; it leaves a posed question's mystery, a countdown's mystery and their tension clocks running. The countdown keeps turning on every later Pay the Price and its answer "comes out" in an unrelated scene; the same question posed in the next scene files a second mystery (the dedupe is by `sceneId`, `secrets.js:561`). Options: retire scene-subject mysteries (and their clocks) at scene end / leave them for the GM's Retire.
- **D3 — the X-Card leaves the scene-challenge offer.** A countdown's GM-whispered offer card (`sceneChallengeOffer.js`) stays live after the X-Card removes the narration, its plan and its clock; **Begin the scene challenge** then makes a public track named after the removed countdown ("The countdown had ended; it has a clock of its own"). Same family as SECRET-ROLLS-CARD-XCARD (by design). Options: close the offer in `finishXCardRemoval` / accept.
- **D4 — `fact_retracted` is reported before the writes.** `propagateRetraction` reports the snapshot event first (`retractions.js:120`) and then awaits its tier / lore / Chronicle writes. A narrator call inside that window takes the new snapshot with the struck detail still in it and answers the mark; the correction then rides only under CHANGED SINCE THE SNAPSHOT (SNAPSHOT-REWRITTEN-RECORD's shape). Options: report after the writes (or both).
- **D5 — a forced reveal is the first to be cut.** `applyNarratorSidecar` appends the code's own reveal after the model's (`narrator.js:5695`); `applyPlanSideData` and `revealedTruthsOf` re-normalise with `REVEALS_PER_SIDECAR = 4`, so a model block with four valid entries drops the forced one — the step is not marked and the clock not reset (then AC08's stall). Low; unprobed. Put the forced entries first?
- **D6 — single object where a list is expected.** `countdown` accepts an object or a one-item array and `escalation` / `clues` accept a single string, but `plans`, `reveals`, `openQuestions` and `newThreats` given as one object (or a string) are dropped silently. Tolerate both shapes?
- **D7 — X-Card on a final-step trigger vignette.** The plan's last step is put back unplayed, but its clock was retired by that vignette and stays retired, so the step is never paced again (sibling of SKELETON-CLOCK-RESET-REWIND, which records only the reset case for a burn). Fold into AC08's fix?
- **D8 — the narrator's ship move and `currentLocationId`.** A sidecar `ship / position` change writes the ship record (and the token) but never `currentLocationId`; the CURRENT LOCATION card and SHIP POSITION can name different places. Looks deliberate (ship ≠ party), unrecorded.

### Traced and found sound

- **Sidecar parser** (`sidecarParser.js`): exercised 25 shapes by script. Fenced block that fails to parse (trailing comma, comments, truncated), bare block cut off, two blocks, a prose fence before the sidecar, inline ``` in prose, CRLF, every new key as `null` / string / wrong type — raw JSON never reaches the prose and nothing throws. Raw JSON reaches the prose only with formats the instruction never asks for (a bare object on the prose's own last line, "Sidecar: {…}", a JSON string value containing ```); a ```js or four-backtick fence loses the block and leaves the stray fence marker. No observed trigger — not reported.
- **Scene question** (`applySceneFrame` / `sceneQuestion`): kept until answered, replaced after, cleared with the frame at scene start / end, restored with the frame by the X-Card (`previous` chain), capped at 160 chars; no narration ends a scene.
- **AB11** (`tierHasDetail`, whole words + reversals) holds for the reported cases; trailing-context cases ("Is the captain" vs "Is the captain's daughter") still dedupe — within the recorded residual TIER-DETAIL-NEGATION-LIST.
- **AB12** (`removeSafetyItem` by text, disabled while writing) and the queued Safety edits hold. **AB22** (`chatAsItWas`, deleted records) holds; the new cards (rolls card, offer card, stakes / held-result cards) are passed over by the beat walk.
- **X-Card pause** is read live at every narrator entry and after every Claude call (`isXCardActive`, `watchXCard`); `registerXCardLatePostHook` only fires for cards every path of which stands down during a pause (all nine post sites checked); audio stops on the `xCarded` re-render; `xcard_played` is reported; ledger truths / state / frame, lore, tier details, LAST KNOWN, ship position + token, countdown clocks (`narrationId` on the clock), plans made (deleted) and changed ≤3 times (restored), revealed truth (ledger + lore) are all undone.
- **mergeSceneLedgers / persistSceneLedgerFields / persistEndedScene**: every ledger writer in the area is on the campaignState chain and writes only its fields; XCARD-PERSIST-WINDOW, END-SCENE-NEXT-SCENE, STATE-CORRECTION-DURING-SCENE-END-LOST, ACTIVE-SCENE-STRIKE-PLACE-BLIND, SUPERSEDED-TRUTHS-SHARE-LIMIT, RETRACTION-POSSESSIVE read correct. The `sceneState` / `sceneFrame` "working copy wins" overwrite is the recorded no-baseline trade-off.
- **Consistency check**: single emitter (canonical GM), card whispered to GMs, `recorded` comes from the audited ledger only (an unrevealed plan's truth never enters the ledger), no card or telemetry for an X-carded narration, dedup per scene.
- **`!truth` / `!state` / `!scene` / `!at`**: authored on the typist, relayed with the requester's permissions; HTML escaped; `!truth list` whispers live truths to the typist only.
- **Private Lines**: a player's prompt carries only their own (client setting); the GM-built prompt carries all; the world-setting copy is the recorded "private by convention" trade-off; the new global Lines / Veils heal (`onSafetyListsWritten`) converges and cannot loop.
- **shipPosition.js**: `isLegacyTokenPlacement` only matches pre-U53 records (an arrival writes empty free text); every record writes all keys.

### Not covered

- `src/narration/narrator.js` — read only the sidecar apply / relay, X-Card memory, deleted-chat, ship-position, clock / vow narration regions (≈1,900 of 6,734 lines); `src/index.js` — only the X-Card, `!scene`, `!at` handlers and the correction-button hook.
- `src/safety/sessionDialogs.js` (unchanged since `18d258b`) not read; `src/safety/sessionLifecycleDialogs.js` — the diff and End a Session's scene close only.
- `src/ui/settingsPanel.js` — the Safety sync / heal / list-edit region (lines 760–1200) only.
- `src/world/worldJournal.js` — provenance, `recordLoreDiscovery` tail, `archiveSceneTruth`, `undoNarrationEntries`, `upsertPage`, the contradiction card only. `src/world/secrets.js` and `skeletons.js` were read in full although outside the assigned list.
- Not read: `chronicle.js` (`retractStruckChronicle`, `retractNarrationChronicle`), `connection.js` `retractNarrationConnections`, `entityExtractor.js` `restoreNarrationDismissals` / draft withdrawal, `resultUpgrade.js` supersede, `openThreads.js` (the scene vow, "What's open"), `worldSnapshot*.js`.
- No finding depends on live Foundry behaviour. Whether a player's client can read the GM-only Secrets journal (document delivery vs. ownership) was not checked — it decides D1's reach.

## WJ — World Journal, relevance, oracles, truths, system

### Questions raised (may be deliberate; not recorded)

| # | Behaviour | Question / options |
|---|---|---|
| D1 | The detector's faction `attitude` (and an "attitudeShift" transition's `newValue`) is free text — the prompt gives no vocabulary. `recordFactionIntelligence` stores any word on the Factions page; `applyAttitudeToFactionRecord` maps only hostile / neutral / allied. A narrated shift to "wary" or "friendly" changes the page and never the record (the canonical stance, what [4e] shows for a faction with a record) — the disagreement W62 closed for `!journal` only. | Give the detector the three words (and "unknown") and normalise as threat severities are; or map more words; or accept. |
| D2 | A lore item under a recorded title replaces that entry's text (`recordLoreDiscovery`: `text: entry.text \|\| existing.text`). P2-17 makes a same-title hit likelier (case and spacing aside; "a short label … no entity name and colon in front"), so a second fact about "Blockade corridor" takes the first out of ESTABLISHED LORE. A GM's *confirmed* `!journal lore` text is replaced the same way (only a rumour or a dismissed entry is protected, D9). | Keep both (append / suffix the title), protect GM-written confirmed text, or as is. |
| D3 | Phase-1 relevance lowercases the line and matches names with the `i` flag. The module's own name oracles hold ordinary words — given names Echo, Ash, Sage, Wade, Raven; callsigns Ghost, Shadow, Static, Crash, Link. "I check the scanner for an echo" matches NPC "Echo Vega": her card is injected and a hybrid move resolves as an interaction with her. `resolveEntityName` (writes) already requires a capital for a name part. | Require a capital (or a non-dictionary word) for a single-word hit; or accept for recall on lowercase typing. |
| D4 | `normalizeThreatSeverity` takes the first vocabulary word of a phrase of up to three: "not resolved" → resolved, "no longer active" → active, "low on fuel" (a name's tail) → looming. | Handle negations / require the word alone after a separator; or accept. |
| D5 | Lore about a player character goes to the Session Log "whatever its salience" (P2-17); with `sessionLogAutoWrite` off `appendSessionLogBeat` returns null and a significant PC fact is recorded nowhere by the capture. | Fall back to lore when the log is off; or accept (the summary and Chronicle hold the story). |
| D6 | `findEntityForLoreRouting`'s part-name rung is symmetric: an NPC recorded under one word ("Vance") answers for a longer detected name that starts or ends with it ("Vance Station"), when no record has that longer name. | Person rung only when the *detected* name is the shorter; or accept. |

### Traced and found sound

- **HTML**: every LLM / user string reaching a World Journal page body, the Session Log page, the contradiction card, the split-merge cards, the panel, the oracle cards and the custom-oracle cards is escaped (`renderPageBody`, `renderSessionLogContent`, `postContradictionNotification`, `cardContent`, `buildPanelHTML`); `!lore` goes through `proseToHtml`. `encounterSpawn` inserts compendium HTML only.
- **`htmlEntities.decodeHtmlEntities`**: one pass (`&amp;lt;` → `&lt;`), numeric entities bounded; its three consumers in this area decode to text that is escaped again before it is HTML (panel) or used as prompt text (truths).
- **Journals by category** (`findJournal`, AB16): flagged-and-default-named first, retired copies (`journalMerged`) never live, unflagged-by-name fallback never another category's; `initWorldJournals` is canonical-GM gated; the Secrets journal is created with `ownership.default: NONE` on both creation paths; nothing in this area writes plan text, snapshot text or GM notes into a category journal (a revealed truth becomes lore only at reveal).
- **Split merge** (`journalSplitMerge.js`): claim on the card, `_inFlight` released in `finally`, failure releases the claim and says so, a stale card is closed, Keep separate retires the copies; a "merging" card orphaned by a reload is superseded by the next load's card; cards whisper GMs only.
- **Pages by entry flag** (`findPageByName`, WJ-PAGE-BY-TITLE): writers, the panel's buttons and the split's entry match agree; Session Log pages are found by `sessionId`, plans by id.
- **Threats otherwise**: `splitThreatName` terminates; a sentence is never stored as a severity and is kept as the summary / a history line; history capped (first + last 23); `suffixedName` does not join "The Syndicate" and "The Syndicate's enforcer", nor two parenthesised names; a merge never deletes, cannot merge a page into itself, and a merged page is out of later groups (no A→B→A chain); a plan linked to a closed page still names its subject and blocks a second plan (`planSignificantThreat` by name).
- **X-Card provenance**: `narrationStamp` keeps flat versions (no nested `previous`), every key the undo relies on is always written (flag-merge safe); a variant-resolved capture write restores the GM's version.
- **Faction write-through**: every WJ attitude write syncs the record when the word maps; `recordStance` is written for the X-Card; `encounter: false` writes add no encounter.
- **Relevance resolver**: names are regex-escaped, Unicode word boundaries, noise words and shared name parts are not indexed, PCs are not in the roster, namesakes lead with the active sector; the clarification dialog settles on close and is asked before the dice.
- **Oracle roller**: all 16 table files are imported and registered; `!oracle` resolves ids exactly then case-blind, two-word odds before one-word; thresholds 10 / 25 / 50 / 75 / 90; a match is tens = ones with 100 as 00; directive recursion is depth-capped; regional refs fall back to the Terminus table. `git diff 18d258b..HEAD -- src/oracles/tables src/truths/tables.js` changes no range (one `sufferRoute`, fourteen `inspiration` strings).
- **Custom oracles**: own die, tiling validated at save, unparsed lines refuse the save, the write is on the campaignState chain and registered only once it lands, the `updateSetting` hook mirrors add / edit / delete to every client, a built-in id cannot be overwritten or unregistered; an unregistrable stored table warns once and does not stop the others.
- **Truths**: a dialog save, a page edit and the load-time reconcile all write `worldTruths` + link through `writeOwnedFields`; hooks are canonical-GM gated; `!lore` / `!truths` / `!journal` / `!oracle-add` tell a player they are GM-only; the "Story So Far" page never reads as a truths page.
- **System helpers**: `chatHooks` dedupes the two render hooks per element; `ironswornPacks` lookups return null rather than throw; `i18n` falls back to English; the `ironswornAssets` / `ironswornPacks` diffs are deletions of dead exports only.

### Not covered

- `src/oracles/tables/*` and `src/truths/tables.js` row content — not re-read row by row (unchanged ranges since `18d258b`; integrity tests exist).
- `src/world/secrets.js`, `src/world/skeletons.js`, `src/narration/worldSnapshot*.js` — read only at their seams with the World Journal (plan ↔ threat page link, `listWorldJournalEntries`).
- `src/narration/narrator.js`, `src/index.js`, `src/entities/entityExtractor.js` — read at the capture / command / hook call sites named above, not whole.
- `src/oracles/oracleConsult.js`, `oracleFollowup.js` — skimmed, not probed; `oracleMemory.js` not read.
- `src/ui/progressTracks.js` `mergeTracksIntoLive` / `tracksJournalCopies` — read; the tracks half of the split merge was not exercised.
- Concurrency between two captures writing the same Session Log page or threat page (read-modify-write of a page flag off any queue) — reasoned about, judged a narrow window, not probed.
- Anything needing live Foundry: default ownership of the category journals, world-load collection order, `DialogV2` close behaviour on v12.

## SESS — sessions, vows, session dialogs, Private Channel

### Questions raised (may be deliberate; not recorded)

**D1 · Can a player's browser read the GM-only Secrets journal? Two records assume opposite answers, and the
Private Channel's secrecy depends on it. (Foundry)**
`listSkeletons()` (secrets.js:92) reads the journal with no GM check, and the module runs it on player
clients in three places: the Private Channel (`buildPrivateChannelStory`, narrator.js:932-943 — "decided: the
Private Channel reads them"), per-beat narration on a player's own key, and the Session panel's "What's
open" (`revealedPlanRows`).
- decisions.md "Issue #353 R3 and R4": "a player's list is the GM's (the store is read alike on every
  client)" — assumes players **can** read it.
- known-issues P2-31: a player's `!oracle yes` "ran on a client that cannot read the plans";
  worldSnapshotStore.js:89 "on a player's client, always null"; SNAPSHOT-PLAYER-KEY: the snapshot is
  withheld from player-key narration because "the stored text holds the hidden plans" — assume they
  **cannot**.

On the simulated table (journals are one shared collection) I ran a player's Private Channel turn after a GM
filed a decided plan: the request went out from the player's client, on the player's key, with
`### Threat — the escort … Truth: <the hidden truth> / Wants: …` in its user message. The Private Channel
never relays: `claudeApiKey` is client-scoped and `requestPrivateNarration` calls `apiPost` in the player's
browser, so nothing crosses a socket — the plan text is simply read there if the document is there.
Options: (a) if Foundry does deliver ownership-NONE journals to player clients (decisions.md "The Private
Channel reads the shared story" records that it does for NPC Actors): every plan and the snapshot text are in
each player's browser, a player-key request carries UNREVEALED truths in clear, and P2-31's relay /
SNAPSHOT-PLAYER-KEY's guard protect nothing — decide whether `listSkeletons()` should return none for a
non-GM (the Private Channel then reads plans only on a GM's client) or whether that exposure is accepted;
(b) if it does not: R4's record is wrong — a player's "What's open" never shows unanswered questions or
standing demands, and a player's Private Channel reads no plan.
Live check, in a player's browser console:
`game.journal.getName("World Journal — Secrets")?.pages.contents.map(p => p.flags["starforged-companion"])`.

**D2 · A published reflection is written under its publisher's Private Lines only.**
The Private Channel's prompt carries the publisher's own lines (`formatOwnSafetyContext`), by decision. Its
reply, once published, is read by the whole table and is canon (ring, summary, tier pass) — shared narration
in effect, for which "Private Lines in shared narration" says a limit someone else set "must hold in a scene
they are reading". Nothing checks a published text against the other players' lines (it cannot be done on the
publisher's client without sending them there). Options: accept (the publisher reads it first; the X-Card
covers it); or publish through the canonical GM, which holds every player's lines.

**D3 · After four idle hours with the GM's page left open, play goes on in a session that reads "Over".**
The boundary is applied only at a canonical GM's world load or at Begin (decisions.md rejects re-minting at
the first message). Until then the gate stays open (`isSessionActive && !sessionBeingReplaced`), lines are
narrated into the old session, `touchSessionActivity` never stamps again ("never revives"), the Session panel
shows "Over — four hours without chat" with Begin enabled, and any reload during that play mints, closes the
gate and asks for Begin mid-scene. Options: leave; or have the chat gate treat an over session as not begun
(the "no session begun" notice points at Begin), so the boundary is taken when play resumes.

**D4 · A vow's plan outlives its vow.**
Forsake Your Vow, a deleted vow Item, or a fulfilment whose narration emits no `reveals` ending leaves the
`vow` plan `active`: it is never the scene's vow again, but it stays in the world snapshot's plan list (and
`fileRequestedPlan` / `planNarratedThreat`-style name checks keep seeing it) until a GM retires it by hand.
Options: leave to the GM's Retire; or retire a vow plan when its vow is forsaken or its last copy is gone,
and resolve it when it is fulfilled.

**D5 · The "New vow recorded" card is made before the vow has a name or a rank** (AC23's other half).
Even with the swear fixed to read the Item, the card text, its stakes line and the two proposed rewards are
for "Vow" at the default rank. Options: post the card on the first rename; re-propose rewards then; or leave
the card generic and say so.

### Traced and found sound

- **Begin a Session.** The mint and Begin's own fields are written as owned fields on the write chain
  (`BEGIN_SESSION_FIELDS` + `SESSION_MINT_FIELDS`, `sessionPerspective` and `deletedChatMessages` included);
  Begin waits for the world load's mint (`sessionMintsSettled`, bounded) and for the Begin ahead
  (`_beginChain`, bounded); a second Begin — the same GM twice, two GMs together, a relayed one behind a
  local one — finds `sessionStartedId` and posts the already-begun note without repeating clocks, momentum
  or the vignette. A refused write posts the not-started card and leaves the cache as the world has it.
  `sessionFocus` is read by its session id only. The no-vow check is fail-open and never holds up Begin; the
  offered vow is created with its name, on the user's own PC, after the start is requested.
- **Snapshot / pre-warm at Begin.** `session_begin` is reported after the flip; the pre-warm runs only when
  no opening narration follows (beyond that, only the recorded SNAPSHOT-PREWARM-CLOCK-ONLY family).
  `max_tokens: 0` is the documented cache pre-warm request.
- **End a Session.** Ends once (`_endChain`, `sessionAlreadyEnded` → the correction path); the gate write
  precedes the scene close and summary call; the focus is stored in `questFocus` / `connectionFocus`,
  surfaced and moved to `sessionFocus` at the next Begin, and read by `selectSceneVow` rung 2 and the
  narrator's focus block; the one-click choices only fill the free-text field (escaped, capped at 120).
- **Dialogs and guards.** Begin / End / Set a Flag use `DialogV2.prompt` (settles on close); Take a Break
  passes `rejectClose: false`; the Private Channel's `busy` clears in `finally` and its call is bounded by
  `fetchWithTimeout`; the transcript's page write is bounded (`settledWithin`).
- **Swear an Iron Vow.** The inciting ⚔ is idempotent per actor on the card's id, marks the card sworn
  before the oath scene and the reward proposal, re-arms on the gate / busy / cancelled notices on the
  presser's client only; the
  shared vow, bond Items and the target connection go to every PC sworn on; reward pick, link and swear-roll
  are claimed once on the canonical GM with refusals whispered; the shared-vow sync is canonical-GM gated and
  marks its own writes. All card HTML built from LLM / user text is escaped.
- **Inciting incident.** Label parsing strips Markdown; the premise is written onto the store, not the
  caller's object, and a refused write is told to the asker and the GMs; the player-key degrade is recorded
  (INCITE-ROUTING).
- **Campaign Start / Quickstart.** Begin mints as Begin a Session does and waits for the load's mint; both
  macros are created once by the canonical GM; a second run adds content by design (said in the confirm).
- **Private Channel — whose key, whose data.** Always the user's own client-scoped key on their own client;
  no relay, nothing returns over a socket. The prompt carries the user's own Private Lines only. The
  transcript is a journal per user found by its `privateChannelOwner` flag (never by name alone when a flag
  exists), created with `{ default: NONE, user: OWNER, one GM: OBSERVER }`; no module code on one player's
  client reads another's journal, and nothing in shared narration reads any of them. Publish posts only the
  narrator's text, is refused during an X-Card or on a stale page, and carries a `narrationId` for the
  X-Card. `CHANNEL_MODE.THREAD` / `CHARGEN` are not reachable: the only caller opens the default mode.
- **Session id cohort.** `mintSession` / `closingSessionUnbegun` number sessions as recorded (D12, X64, X65);
  the activity stamp is its own setting and cannot revive an over session.

### Not covered

- `src/index.js`, `src/narration/narrator.js`, `src/clocks/clocks.js`, `src/world/skeletons.js`: read only
  at the call sites named above, not in full. `src/world/secrets.js`, `worldSnapshotStore.js`,
  `snapshotEvents.js`, `ui/sessionPanel.js`, `session/openThreads.js`: read in full, probed only where a
  finding touches them.
- Whether the pre-warm request reads back as a cache hit for the first played narration (same standing
  block across modes, the thinking-off body with `max_tokens: 0`) — needs the live API
  (SNAPSHOT-UNMEASURED).
- Batch Mode's handling of the inciting ⚔ and of Begin / End during a round (`src/batch/driver.js`).
- Held results across Begin / End beyond the recorded residual.
- Live Foundry: D1's delivery question; `DialogV2.prompt` forwarding `render` to End a Session's focus
  choices; the vendor sheet's create-then-rename order (read from vendor source only).

## CHAR — characters, Chronicle, ships, art, audio

### Questions raised (may be deliberate; not recorded)

- **Wounded caps health at 4, shaken caps spirit at 3** (`actorBridge.js:588-589`, recorded as "(rulebook)" in
  `docs/rules-reference/playkit-rules-and-coverage.md:63,228`). I know of no such cap in Starforged (Heal /
  Hearten clear the impact and give less; nothing limits the meter while it is marked), and the 4-vs-3
  asymmetry looks like a house rule. Options: keep as a recorded house rule (say so in decisions.md) / remove
  the caps. Not reported as a finding because the repo's own rules reference states it.
- **Automatic Chronicle entries stop when narration runs on a player's own key** (`chronicleWriter.js:124`
  `if (!game.user?.isGM) return null`; the comment "the GM client picks the entries up on its own narration
  passes" predates run-once narration). At a keyless-GM table no entry is ever written, silently. Options:
  record it with the other keyless-GM trade-offs / let the narrating client relay an automatic entry.
- **A superseded narration's Chronicle entry stands** (Burn / Improve strike the narration; #338 D8 keeps its
  World Journal and tier records; the scribe's entry is not named there). Options: record it under D8 / retract
  by `narrationId` as the X-Card does.
- **A keyless player whose clip the GM could not synthesise (quota, 401, 429) is told "ask the GM to play this
  card once"**, and the GM sees a console warning only (`audio/index.js:693-696`, `:365-367`); with Auto-play on
  the GM's own failure is quiet too (the button's title carries it). Options: accept / send the failure reason
  in `audio.synth.done` and toast the audio GM once.
- **Auto-play behind the first-click overlay can play a narration superseded meanwhile**: `togglePlayback`
  checks `xCarded` but not `burnSuperseded` (`audio/index.js:951-959`), and the overlay's deferred call starts
  after `silenceCard` ran. Needs: Auto-play on, no click yet since page load, the first card superseded before
  the click. Options: accept as rare / add the `burnSuperseded` check beside `xCarded`.
- **The audio GM now always plays a fresh clip from an in-memory blob URL that is never revoked**
  (`audio/index.js:345`, `blobUrlOf`): a few hundred KB held per first-played segment until reload. Options:
  accept / revoke when the session ends.
- **Two GMs claiming a first portrait in the same instant both buy it**: each client's `after` read
  (`generator.js:244-245`) happens when its own write is acknowledged, before the other's arrives, so neither
  stands down. Recorded as "Left: two GMs within one image call" (decisions.md:1304) — noted only because the
  PORTRAIT-TWO-GM-FIRST-GENERATION row reads as fully fixed.

### Traced and found sound

- **System-note machinery** (`actorBridge.js:74-223`): the mark is a per-actor counter set before and cleared
  in a `finally` (overlapping writes, two actors, a throwing write); `withoutSystemNotes` is a counter released
  in `finally`; only an EMOTE whose whole content is one `<em>` line, spoken by an Actor this client's bridge is
  writing, with no module flag, is re-spoken or dropped — a player's own sheet edit (no mark on that client), the
  module's own cards and ordinary chat are untouched. The note is created on the writing client (vendor
  `preUpdate*` hooks are local) — the same client that holds the mark, relayed writes included. Item writes mark
  the parent Actor. The re-spoken note carries a module flag so the move pipeline never reads it.
- **Meters / momentum** against vendor `character.ts` + `MeterField.ts`: health/spirit/supply 0–5, momentum
  −6…max, max and reset from the vendor getters else base − impacts (custom1/2 counted), bases never written
  (T01), `sheetXp` equals `legacy-track.vue`'s formula; field paths (`system.debility.*`, `system.legacies.*`,
  `system.current`, `system.track.value`, `system.conditions`) match the pinned schema; `ChallengeRank._cast`
  accepts the rank names the module writes.
- **Stale-page refusals** (`refuseStaleActorWrite` / `staleChecked`) reach each writer's own refused path.
- **Bond Item mirror** (ticks, rank, lost, forged, name): keyed by `connectionId`, name only for a single unkeyed Item.
- **Vow clock advance / rewind lockstep** (`advanceVowClocks`, `revertVowClocksForBurn`): copies of one vow move once.
- **Asset tracks**: companion health, support-vehicle integrity (battered refusal, `restore`), command vehicle
  through `updateShip` (sheet first, record mirror, unreconciled record → lower of two); the P2-09 restore step
  uses the tracks' own writers.
- **Chronicle**: found by actor flag; one write chain per actor; XCARD-CHRONICLE's three live checks; relay
  handler clamps (annotation-only for players, GM-only type/delete, text cap, `narrationId` pattern); writer
  picks the roller's / speaker's / named round character's PC; reply parse fails closed.
- **Art**: first-portrait slot and record claim released in `finally`; late image never replaces a portrait
  linked meanwhile; entity gone → nothing stored; everything keyed by host id / record id, never by name;
  `portraitRouting` reads the record on the art GM and bounds the request; every `FilePicker`
  upload / createDirectory / browse in `src/` goes through `withFilePickerDeadline`; `uploadedPath` prefers the
  response path (The Forge).
- **Audio**: PT12 — a later segment's failure rejects its `src`, the session fails (`_fail`, toast on a
  deliberate click) rather than hanging; every wait on the way is bounded (browse 120 s, synthesis 120 s, GM
  request 30 s, cache ask 4 s); Stop / X-Card / supersede / another card taking over stop further synthesis;
  pause between segments holds the next one; `synthesiseToCacheOnce` / `synthesisedBytesOnce` dedupe and clear
  in `finally`; relayed hashes, specs and paths are checked; cache key = text + voice + model + speed.
- **`proseToHtml`**: `<npc>` markup stripped, then `& < > "` escaped, then emphasis applied to escaped text —
  no path for prose to become markup; a tag with attributes, an unterminated tag or nested tags end up escaped
  text; both regexes are linear; all sinks are element content.
- **`fetchWithTimeout`, `uploadResult`, `api-proxy`**: deadline covers the body readers; timers cleared.

### Not covered

- Skimmed only (unchanged since `18d258b` or diff-only): `src/entities/shipEnvision.js`, `faction.js`,
  `location.js`, `planet.js`, `settlement.js`, `creature.js`, `starshipModules.js`; `src/entities/migrator.js`
  (the diff and `reconcileCommandVehicleIntegrity` only); `src/character/chroniclePanel.js` (lines 95–300 and
  the diff); `src/art/openRouterImage.js` (lines 40–239).
- `factsOverlap` / `loreStatesStrike` over-matching for the Chronicle delete (in `retractions.js`, another area).
- Live-Foundry behaviour was not run: the vendor hooks' timing relative to the bridge's mark, and
  `updateSource({ speaker: { alias: null } })` on a pending ChatMessage, are read from source / reasoned, not observed.

## UISEC — panels, settings, sectors, sites, schemas

### Questions raised (may be deliberate; not recorded)

| # | Question | Options |
|---|---|---|
| D1 | The Settings panel's Narrator tab renders every GM narrator setting read-only for players, including **Custom instructions** (`settingsPanel.js:1746-1750`). A GM who writes spoilers there ("don't reveal Vex is the traitor yet") shows them to the table. | (a) blank the textarea for non-GMs; (b) keep and say so in its hint; (c) keep as is (world settings are console-readable anyway) |
| D2 | `travel.sceneDestination` — a Set a Course naming no destination goes to "the uncharted destination recorded last" in the active sector, with no bound: an expedition abandoned sessions ago still captures every unnamed course as an expedition to it. | (a) only while an open expedition track links it; (b) only within the session/scene that recorded it; (c) keep |
| D3 | ✕ Remove on a scene challenge begun from a fiction-started countdown removes that countdown's clock ("Its danger clock goes with it"), while `addProgressTrack`'s failure path treats the same clock as "the fiction's, not this write's: it stays". | (a) remove/retire only a clock the track created; (b) keep (the countdown *is* the challenge's clock) |
| D4 | An unexplored `uncharted` destination's location is listed to the narrator under **Known locations (established — reuse these)** before it is charted, and again under Charted sites after (only `vault` / `derelict` are filtered — `narrator.js:5300-5306`). | (a) filter unexplored sites of every type; (b) keep — the crew named it |
| D5 | A track linked by id to a vow since fulfilled or forsaken still reads "serves '…'" in the Progress Tracks and Session panels (`trackVowName` ignores `completed`), while the scene-vow line drops it. | (a) drop or mark ("served") for a closed vow; (b) keep |
| D6 | An expedition to a settlement's **planet** (a name on the map, but no planet Actor — the generator keeps planets on the settlement's flag) is "no tracked place": PT07 records it as an uncharted site with a new periphery pin beside the planet's own pin. | (a) resolve planet names to their settlement / planet pin; (b) keep |

### Traced and found sound

- **Progress tracks**: ticks per mark (12/8/4/2/1), score = filled boxes, display roll's hit/miss comparison; every writer goes through `writeTracks` (one queue per client, bounded waits, copies of the flag); panel edits relay to the canonical GM (`progressTrack.edit`) with payload checks against the panel's own lists; removal and every edit are by id; a relayed `linkVow` / `add` re-checks the vow is open; the presser's local pre-check tells a player what the relay cannot; `remove` / `complete` handle the paired clock before the track write; no nested track writer; the journal is found by flag (AA62) and a merged-away copy is never live.
- **"Has a plan" marker**: computed only when `game.user.isGM` in both panels, from subject ids alone (no content rendered).
- **Settings panel**: every control writes a registered key at the right scope (players reach only client-scoped audio / key settings; world writes are GM-gated); shown defaults match the registered ones; `holdResultForUpgrade`, `worldSnapshot`, `missPaysStatedStakes`, `narrativeSkeletons`, `narrativeSkeletonsShowRolls` each have a control, a reader and matching help text; Length hint matches `proseVariety.lengthBudget` (3 → ~65 words, ≤ 5 sentences); spotlight default off everywhere it is read; Safety removal by value (AB12) and the edit queue hold; OpenRouter key field GM-only, all keys client-scoped.
- **Confirm dialog**: one-shot `#settle`; close settles false; "No move — narrate" settles `"narrate"` only for an unforced move, and the one caller (`index.js:1168-1183`) distinguishes it from accept; stat-swap radios per asset read only while their ability is checked.
- **Narrator Usage page** (`pacing/telemetry.js`): cache-read share guards a zero denominator; Prose / Fact block split guards zero characters and sums to the output tokens; date and time shown; writes serialised on a copy. API Log: every `apiPost` caller passes a label (the three multi-line calls included).
- **Entity panel**: edits relayed (`entity.edit`) with the detail matched by text among shown entries; Finalise / portraits GM-only; current-location toggle reads the store at its turn on the write chain; re-render hooks cover Actors, Items and the two campaignState fields shown. Draft card (P2-16, `entityExtractor.js:2237-2548`): PC button / **No one** / plain Confirm each map to the documented bond holder; a pick outside the card's choices creates nothing.
- **recordUnchartedDestination**: no duplicate when the same label is travelled twice before or after charting (without a rename), when the expedition is abandoned and begun again (links the existing unexplored site), with no active sector / no `mapData` / no Scene (nothing or no pin); the location Actor is registered in the store before the record links it; a refused creation records nothing; `addSiteToScene` is idempotent by `siteId`.
- **Scene builder**: Note and Drawing payloads are the shapes already in production use (no `entryId`, non-zero Drawing box, every required Drawing field); padding 0.1; site pins and passages share one helper between creation and in-play adds; reveal restyles by `siteId`.
- **Sector generation**: names unique within a sector and against stored sectors; re-running a stored sector returns it; a run refused *before* the store is rolled back whole (control in AC26's probe); the store write is a read-and-set on the chain with id lists unioned.
- **sectorSceneHooks**: AB23 payload check holds (sector Scene + command-vehicle token + a settlement pin's coordinates); every shared write in the `createToken` / `updateToken` / `updateActor` handlers is canonical-GM-gated; `preUpdateToken` runs on the dragging client only; programmatic moves carry `POSITION_SYNC_OPTION`.
- **Reveal on Finish an Expedition**: by `siteId` first, `requireLabelMatch` thereafter; flag set on a copy of the state as it is after the awaits.
- **schemas.js**: `MOVES` roll kinds, `rankTicks` / `rankName` for numeric ranks; new campaignState fields (`crewSupply`, `undismissedByNarration`, `sessionPerspective`, `deletedChatMessages`, `unsummarisedSession`) each have writers and readers.
- Checked and dropped as already recorded: the pipeline writing its whole `sectors` copy over a concurrent sector write (known-issues.md:2240-2243, decisions.md:4612; the earlier `sectors/sectorsRevertedByMove` probe); TRACK-VOW-NAME-SNAPSHOT-IN-4J; SCENE-VOW-THRESHOLD-LINK-BY-NAME; Envision / History from a player's panel (FINALISE-PLAYER-KEY row).

### Not covered

- `src/moves/shipMapScene.js` — structure skimmed only; `shipMapArt.js` not read; `shipMapVision.js` — the two-line diff only.
- `src/help/helpJournal.js` — spot checks of the Settings Reference rows for the new settings only.
- Live-Foundry behaviour was not checked: Note / Drawing validation of the site pin and passage data, how the ironsworn location sheet shows `subtype: "uncharted"`, whether a player's client can read the Secrets journal's page flags (the plan marker itself is GM-gated in code), and what `game.settings.get` returns by reference for an unset Object setting (the `{ ...CampaignStateSchema }` default).
- `entityExtractor.js` beyond the draft-card section, `secrets.js`, `openThreads.js` and `travel.js` were read only where the assigned files call into them.
- Two-GM races on the tracks journal across a canonical-GM handover (two clients' write queues) were reasoned about, not probed.
