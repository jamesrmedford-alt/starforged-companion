# Long haul, eleventh live round — action items

Run `long-haul-live-20261128-052235`, at `4bcee5fc` (PR #403's head: issue #402's six changes and Part 7's runner):
- 94 actions, 425 calls, 38.8 minutes, **$3.1557** (the module $2.1998, the test's own models $0.9558);
- **27 of 27 beats done**; **1,445 checks, none violated**;
- classed `suspected-quality-issue` for one fact scored lost (F4, at its first probe), which the reading finds rightly scored.

It was asked the eight questions written before it ran (`run.json` → `questions`). Its action items are issue #404. It is the first round whose recording keeps every request's system prompt (change 6), so each "why" below is read from the call that made it.

## Issue #402's live measure

Each fix of the scope is listed as held, broke or not reached. "Not reached" is not "held".

| Fix | Held | Broke | Not reached |
| --- | --- | --- | --- |
| 1a — an answered oracle question is the dice's | a46 filed "established (the dice)"; a50's opening carries it under What binds; a58's [dice] line | — | — |
| 1b — a reveal files what was told | the plan's own text reaches no call after a79 | the narration's own facts reach none either: the recaps cannot name the culprit (finding 1) | Lore pending: the run keeps no Lore store |
| D1 — the code files what a rolled move decided | ten stakes lines "(the dice)"; a60's Repair filed nothing; no `result` tag read | a weak hit filed with the hit's words (a26, finding 8); a fight's end filed without its winner (a39, finding 9) | a miss whose price was not stated |
| 2 — pronouns ride on the frame | the clerk "(he/him)" from a26 to a90, across both breaks (a50, a94's opening) | the clock vignette had no scene block and wrote "her" (a94, finding 7) | — |
| 2 — the logged pronoun check | — | its one flag over the run is wrong (a90, finding 16) | a94's change, under another name |
| D2 — an unnamed person carried | the clerk carried into session 3's first scene at the berth (a50, a56) | — | — |
| 3 R1 — no cost asked where none is named | a32, a60, a75 | — | — |
| 3 R2 — a Repair told begun | a60: "it is not yet that" | session 3's summary tells it done, on the wrong ship (finding 17) | the points spent |
| 3 R3 — a who-vow's plan checked | a79's plan names one person met; nothing to report | the person is a job title (finding 2) | a plan naming no one, two, or a stranger |
| 3 — one reader of "met" | the oath (a3) and the fulfilment (a79) read the same person | it counts a detection draft named "Foreman" (finding 2) | — |
| 4 — a milestone tells its clue | a76: [clue] c3 told | — | a40's milestone, marked from the victory card, had no narration (finding 15) |
| 4 — a stranger culprit named on a milestone | — | — | the culprit was met |
| 4 — a missed fulfilment plays the escalation | — | — | the fulfilment hit |
| 4 — no name drawn; the oath re-asked | no name drawn | — | the oath named someone at once |
| 5 — the judge only logs | 8 calls, 1 flag (a65, wrong), nothing re-asked, no judge card | — | — |
| 5 — the drafting check | no posted narration talks about its draft | — | a redraft: none was asked |
| 5 — no place check on @scene | 17 answers, no place card | — | — |
| 5 — the audit's older kinds keep their card | — | two cards, both false (a39, a46; finding 6) | — |
| 6 — kept runs keep their prompts; forced beats labelled | every finding below read from its call; beats 23 and 25 "forced by the charter" | — | — |

Fifteen rows held where reached, and eight broke somewhere, two of them with harm at the table (findings 1 and 2). Four parts were not reached at all: a stranger culprit, a missed fulfilment, the re-asked oath and a Repair's spend.

## 1. REVEAL-FACTS-NOT-FILED — the vow's answer is in no record a later call reads

**What happened.** a79's fulfilment told the culprit: "The man who signs for the empty crates is Foreman… He has sold the lanes' timings and routes to the raiders for years." Its fact block gave two truths about him: "old hold-boss of the self-sorting freighter hold; rewrites manifests…", and "keeps anyone from auditing what became of the missing colony ships". Neither is in any later prompt. Session 3's record holds the beat as `TOLD AS` alone. The two recaps that follow (a81, a92) are made from sources with no Foreman: "you found a name or trail showing who sent the cutter."

**Why.** Change 1b stopped the plan's hidden text being filed as the GM's (round 10's a75). Its comment says the beat keeps its own block (`narrator.js` ~L8009, `ledgers.js` L115), but the block's truths did not land. Not yet traced. Foreman is a detection draft never confirmed (a2), so a truth about an unconfirmed draft may be held apart from the scene.

**Enough data?** *A fix can be proposed once the cause is read, for nothing*:
- Replay a79's recorded reply through `applyNarratorSidecar` with the run's state.
- See where its two truths go.
- Then fix it so a reveal's own truths bind as the narrator's, as any beat's do.

**Proves it:** a test on a79's recorded reply whose two truths reach the scene and the session record; a recap that names the culprit.

## 2. CULPRIT-A-JOB-TITLE — the vow's culprit is "Foreman", a word, chosen because a draft was named by it

**What happened.**
- a2's flashback has "a foreman came down the gantry". The detection drafts him: "◈ New Entities Detected … Foreman".
- The oath's plan (a3) was told to prefer "one of the people the story has met if one fits (Foreman)". It named him.
- a79 reveals "Foreman" as a man's name.
- Of the clues around him, the plan's c2 points at "a ledger-keeper", and the story's one ledger-keeper is Tamsin. a75's "broker's runner, Quint" is finding 3. The reveal squares none of it (the cold read's §3).

**Why.** Change 3's one reader of "met" counts pending drafts, deliberately, so a drafted person can be the culprit (round 10's Talia Tolari was a drawn name). Here the draft's name is a job title the detection took from "a foreman": the same habit gave "Clerk", "Dock Watcher" and "Unknown Survivor" (the cold read's §2).

**Enough data?** *Enough* — the cause is readable:
- (a) the detection does not name a person by a role word, so "a foreman" stays a role ("the foreman") and asks to be named;
- (b) a plan's "met" list leaves out a draft whose name is a common noun.

Recommendation: (b) now, for it is in the plan's path, and (a) after measuring how often the detection names by role (this run: 5 of its 8 person drafts — Clerk, Dock Watcher, Foreman, Unknown Suited Figure, Unknown Survivor).

**Proves it:** a3's request on this run's state lists no "Foreman" among the people met.

## 3. EXAMPLE-NAME-IN-THE-STORY — the reply format's example name told as a character

**What happened.** a75's flight log: "*tasked by the broker's runner, Quint*". Quint is never mentioned again (the cold read's §1), though the detection drafted him as a connection. Round 8's "Quint Row" (a dockside row, drafted as a location) is the same.

**Why.** The only Quint in a75's request is the RESPONSE FORMAT example: `"present": ["Venri Quint (she/her)"]`. Every narration is shown it.

**Enough data?** *Enough*:
- (a) the example uses placeholders (`<a person (pronouns)>`);
- (b) a name that cannot pass for the setting's;
- (c) a code check for the example's names in prose.

Recommendation (a): the other examples in the block ("Vance", "Lyra's orbital graveyard") are the same risk.

**Proves it:** no example name in any kept narration (two today: round 8's, round 11's).

## 4. PLAYERS-SHOTS-UNDONE — the player fires twice, and the narration says nobody has fired

**What happened.**
- a29: "from her berth I swing the point guns round and fire back at the cutter". The narration swings the guns and fires nothing.
- a31: "I seal the lock and hit the point guns on the cutter". It offers Enter the Fray.
- a32, after the roll: "Nobody has fired yet."
- The line's own fact was filed: "the PC swung the point guns round and fired back at the cutter from her berth" (a43's list).

**Why.** A fight is not narrated before its move is chosen (#380). The reader offered the move rather than rolling it, so the narration held the shots back and then wrote over the player's lines.

**Enough data?** *A fix can be proposed and its effect must be measured*:
- (a) a line that attacks a foe in the scene rolls Enter the Fray (or Strike) from it: the reader's rule;
- (b) the narration after an offer tells the shots fired and their effect left open, never "nobody has fired".

Recommendation (b) with (a)'s measure on the readers' kept lines.

## 5. CONNECTION-WITH-NO-PLACE — Tamsin narrated at the next berth on another station

**What happened.**
- a31: "At the next berth, Tamsin Vey's crate-stamp shows on a stack."
- a32: "Tamsin Vey's shut ledger sits on its stack, her thumb still pinned to its edge". Its fact block lists her as present at Bleakhold.
- She is at Hollow Spire (a48: "stands at her ledger stall on the Hollow Spire docks"; a90: "Hollow Spire is a journey off, and I'm the one sitting there").

**Why.** The record has no place for her. a26's [arrival] line holds "Dock Watcher at Hollow Spire; Foreman at Hollow Spire", not Tamsin. The [here] check holds people where the record has them, and it has her nowhere. Tamsin is a connection, made by the move at a6, not a person draft.

**Enough data?** *Enough*. A connection made at a place is recorded there (the move's place), and its card's place is the record's. Check `whereabouts.js` for connections.

**Proves it:** a26's [arrival] line names Tamsin at Hollow Spire; a32's frame refused.

## 6. AUDIT-FALSE-CARDS — the audit's two older kinds post two cards, both false

**What happened.**
- a39 (identity): "Mira Kestrel — recorded — she/her. The narration said: 'The clerk edges out from behind his bulkhead'". The "his" is the clerk's.
- a46 (a truth contradicted): "Raider Cutter — recorded — is named the Ashen Wake. The narration said: 'the Cinder Wren drifts dark down the ring'". That is the corrected name, held to the struck one, with "Re-asserting a retracted fact is already blocked".
- The one real pronoun change, a94's, got no card.

**Why.** D5 kept these kinds' card because "they posted none in rounds 9 and 10, so there is nothing against them yet". Round 11 is 2 cards and 0 right. The identity check reads a pronoun near a name as that name's. The truth check was given the struck value as recorded.

**Enough data?** *Enough for a decision*:
- (a) these kinds log only, as D5 did for the judge, until live verdicts pass #399 D7's bar;
- (b) keep the card, mend both — an identity holds only a pronoun whose referent is the person; the audit is given no struck truth as recorded.

Recommendation (a) at once, (b) measured. It is the maintainer's call: it amends D5.

## 7. CLOCK-VIGNETTE-NOT-GIVEN-THE-SCENE — the clock's narration changed the clerk's pronoun

**What happened.** a94's clock advancement: "The clerk reads it twice… and then goes back to her slate". Its fact block: "berth clerk (she/her)". The next paragraph's opening keeps "clerk (he/him)".

**Why.** The clock vignette's request carries no scene block and no person with pronouns; the only clerk lines are the session record's. Change 2 gives pronouns back in THE SCENE, the stop and the opening, not to this call.

**Enough data?** *Enough*. The clock vignette is given the scene's people with their pronouns, as the opening is, or the session record's people lines carry them.

**Proves it:** a94's request on this run's state holds "Clerk (he/him)".

## 8. WEAK-HIT-FILED-AS-CLEAN — a weak hit filed with the strong hit's words

**What happened.** a26's Set a Course was a weak hit, "Arrived but with cost or complication", and the complication was chosen. Filed as the dice's: "You reach Bleakhold Station along the plotted route without trouble." The recap: "arriving along the plotted route without trouble" (a81).

**Why.** `decidedOfMove` files the stakes' hit line on a strong or a weak hit (D1). The hit line was written for the clean hit.

**Enough data?** *Enough*:
- (a) on a weak hit, file the hit line with the outcome's cost ("— with a complication at the destination");
- (b) file the weak hit's own text.

Recommendation (a): the stakes are the story's words, the cost the move's.

**Proves it:** a26's filed fact names the complication.

## 9. FIGHT-WON-NOT-SAID — the record says a fight was decided, not who won

**What happened.** a39's Take Decisive Action, a strong hit, is filed "Take Decisive Action, strong hit — LASTING: a fight decided", with "the fight brought to its end". The recap: "The fight was nonetheless decided and brought to its end."

**Why.** Take Decisive Action states no stakes, so D1 files nothing as the dice's, and the session record's line names no winner.

**Enough data?** *Enough*. Take Decisive Action files its outcome's own words — on a strong hit, "you prevail".

**Proves it:** a81's recap says the cutter was beaten.

## 10. XCARD-IMAGE-RETURNS — the X-Carded beat's image, back four steps later

**What happened.**
- x16 removed a41's narration, "Through a cracked port, a hand moves", and none of its facts stands ✓.
- a46's request carries X-CARD — REDIRECT: "do not … bring back anything it introduced".
- a46 told "A hand, gloved and unsteady, slaps once against her cracked viewport."

**Why.** The charter's question (beat 18, "Is anyone left alive aboard the Cinder Wren?") asks for the removed beat's subject, and the dice said YES. The narrator brought back its image, not only its subject.

**Enough data?** *Not yet*: one case, and the charter's question invites it. Samples: a scenario in which an X-Card is followed by an unrelated beat.

## 11. STAKES-NEVER-SHOWN — "As stated before the roll" on stakes nobody saw

**What happened.** a9 and a36's Pay the Price cards: "As stated before the roll: The dockhands stay shut-mouthed…". Both moves were rolled straight from the player's line, and their stakes were the reader's, never posted.

**Enough data?** *Enough*: "As stated before the roll" only where the stakes card was posted; else "The price".

## 12. BOND-DOWNPLAYED-IN-AN-ANSWER — a scene answer denies what a bond is, and invents

**What happened.** a83, "@scene Who would I trust with my life?" — "The story has not established anyone you would trust with your life… she is bound to you by debt and shared interest, and she keeps a second ledger of her own." Its request holds "Bond: forged".

**Enough data?** *Not yet*: one answer. Watch: an @scene answer's added fact ("a second ledger") — answers record nothing, and nothing reads them for invention.

## 13. DEADLINE-NEVER-PASSES — a promise's deadline told as still to come

**What happened.** a13's "before the next tide of cargo… about two bells". An expedition, a voyage, a fight and a night later, a54 and a85 tell it as still open, and Tamsin never mentions it.

**Enough data?** *Not yet*: the record keeps no time. A design call: whether a promise with a deadline is a clock.

## 14. STRAY-REPEAT-IN-A-NARRATION — a quote fragment doubled at the end

**What happened.** a17's opening ends: '"It does that," Tamsin says, not looking up, and the ledger stays shut. "It does that,"'.

**Enough data?** *Enough*: [quote] reads a quoted line said twice across narrations, not within one. Extend it to a repeated closing fragment.

## 15. FIRST-MILESTONE-UNTOLD — a milestone marked from the victory card has no narration, and so no clue

**What happened.** a40's "⚑ Mark milestone (×1)" on the fight's victory card marked the vow, and no narration followed. Change 4's clue for it was never asked for. The plan's c1 and c2 were shown anyway (by a26, a57).

**Enough data?** *A fix can be proposed*: the victory narration (a39) carries the clue when its card's milestone is pressed, or the milestone posts a short narration. Measure: a run whose fight is a milestone.

## 16. PRONOUN-CHECK-READS-INTO-THE-NEXT-SPEAKER — the logged check's one flag is wrong

**What happened.** a90: "At the hatch, the clerk shifts his weight but stays quiet. 'When you come, bring the meal plain,' she adds." The check gives "Clerk: he/him → she". The "she" is Tamsin's.

**Enough data?** *Enough*: a span stops at a speech attribution of another person. It is now in `pronounCheckMeasured.test.js` as the one wrong flag of twelve.

## 17. REPAIR-TOLD-DONE-BY-THE-SUMMARY — the session summary mends the wrong ship

**What happened.**
- The player: "I see to the hull and the systems the cutter's fire damaged" (a59).
- The narration: the work begun, "not yet" done ✓.
- a82's answer: "not yet finished" ✓.
- Session 3's summary: "Mira repaired the cutter's damaged plating and power run by hand". That is done, and the cutter (the raider's) instead of the Kobayashi IV. It is given to a92's closing and a94's clock and opening.

**Why.** The summary writer read the player's "the cutter's fire damaged" as the cutter damaged, and told the Repair as done. R2 holds the narration, not the summary.

**Enough data?** *A fix can be proposed*: the summary is told what the narration's [repair] line said (the work begun, points not spent). Measure on this run's a92.

## Smaller observations

- **SCENE-ANSWER-TABLE-WORDS:** a57 "The table renamed her from Vey"; a89 "the lore records". [apparatus] is not read on @scene answers.
- **The openings' voice:** a2, a17, a50, a94 — wry and procrastinating, deciding Mira's mind. The same as round 10's 4 and every round since the third.
- **The refrains:** 31 (4/14/13) against 30. The clerk and the dockhand are in nearly every Bleakhold narration: Part 7's standing cast, its line not built.
- **Moves rolled or offered, 9 and 9** (the cold read's §4). The reader's rule is consistent, and the player cannot see it.

## The cold read, checked

Kept as `cold-read.md`, checked point by point in the scorecard's "The cold read".
- **Confirmed:** its eight most serious points, apart from what the charter made happen.
- **The charter's:**
  - the dice (1 and 2 on every progress roll);
  - the 4/10 fulfilment;
  - the six Develop lines;
  - the memory questions;
  - the unanswered reward card;
  - x15.
