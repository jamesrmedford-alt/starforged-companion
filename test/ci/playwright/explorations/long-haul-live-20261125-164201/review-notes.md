# Long haul, fifth live run — action items

Run `test/ci/playwright/explorations/long-haul-live-20261125-164201/` (commit f160e52e, PR #387 merged): the first on the one reader (#384), moves as contracts (#385) and overhaul 2's scenes and provenance (#386). It was given thirteen questions first. 96 actions, 352 model calls, 35.9 minutes, **$3.1881**: the module $2.2259, the AI player $0.9622.
- **Beats:** 27 of 27 done, none failed — the first long haul to reach every beat.
- **Mechanics:** 1,474 checks, one violated: colour-not-filed, at a94.
- **Ledger, re-scored:** 4 recalled, 3 carried unasked, 0 lost, 0 refused, 1 not probed of 8. Every counted question was recalled, 7 of 7. The run's own "F4 lost, F7 refused" were the checks' errors.

**In short.** The overhauls did what they were built for: the one reader read 17 of 19 plain lines (run 4: 10 of 21), with none read as another move. Nothing the situation forbade was offered or rolled. Scenes turn: 11 of them, against run 4's one a session. What play let go stayed let go: 0 questions set again, against 4.

What a player would complain of is at the seams, where one piece hands its work to the next:
- The openings are told the closing cutaway's scene as "where the last session stopped".
- The closing shows the one NPC even when she was standing beside the character.
- The narration's fact blocks write the ship's position whatever their basis, so the record and the fiction disagree from the arrival on.
- The rule for a result's basis binds by an accident of words.

Three more need the same kind of fix: the revealed hidden plan is held as colour (the run's one violation), a move the reader declines goes untold, and the reader's own rule turned a plea to a stranger into talk.

Worst first. Each finding gives the quotes with step ids, the cause as far as the code or a prompt shows it, whose it is, and whether there is enough data to fix it. Nothing below is implemented; each needs the maintainer's word.

## 1. OPENING-TOLD-FROM-THE-CUTAWAY — every opening was told the cutaway's scene as where the last session stopped

**What happened:**
- **a48:** the opening's block says "WHERE THE LAST SESSION STOPPED — session 2's record … Place: Bleakhold Station … With them at the end: Tamsin Okoro." But session 2's last played frame, at a45, had Mira alone at the Bleakhold docking ring. "Tamsin Okoro" is the a46 closing cutaway's frame: "Observation lounge, Hollow Spire upper ring", present: Tamsin Okoro.
- **a19, a96:** the same, right only by accident, because Tamsin happened to be with Mira at those ends.
- **None of the three openings** had "What binds" or "Still open". a96 opened on tape and a hatch seal the morning after the vow's answer: "a96 ignores the climax", the cold read says.

**Cause:**
- `recordedStop` (`src/session/galleyVignette.js` ~350) reads the session's last scene in the record: `session.scenes[session.scenes.length - 1]`.
- The closing cutaway, run after End a Session, starts a scene of its own: `narrateSessionVignette` → `ensureCurrentScene(…, { cause: 'cutaway' })`, `src/narration/narrator.js` ~4645. Its frame becomes the session's "last scene".
- So overhaul 2 §9, openings from the record, is defeated by overhaul 6's cutaway.

**Verdict: enough.** `recordedStop` should take the last scene that was played, skipping a scene begun for a cutaway or a spotlight. Test: a record with a cutaway scene after the last played one.

## 2. SHIP-POSITION-BY-THE-NARRATION — the narration's fact block writes the ship's record, whatever its basis

**What happened:**
- **a27:** Set a Course, strong hit. The narration was told "Ship: Kobayashi IV docked at Bleakhold Station". Its own fact block, `{ "subject": "ship", "attribute": "position", "value": "Bleakhold Station", "from": "line" }`, re-wrote the record as `narrator_sidecar`, which reads as "near". From a29 on, every prompt said "near Bleakhold Station", while the fiction had her berthed ("from the berth", the player at a29; "The clamps still hold the Kobayashi IV fast", a31, a34).
- **a26:** the same at the expedition's site. The prompt said "docked at Clipped Hauler's Distress Call"; the block restated it as colour (no `from`), and after it "near".
- **a25:** colour moved her outright: `{ "subject": "ship", "attribute": "position", "value": "at the source of the distress call, in a drift of frozen asteroids …" }`, no `from`.
- **a37:** the narration released the clamps ("the Kobayashi IV drifts free of the berth"). It was colour (its `result` tag was refused, finding 5). The session summary told it as fact, and the @scene answers followed it: a40 "drifting clear of the docking ring", a53 "not berthed". a56's prose then rang "the berth clamps … below", and a88 said "docked".
- The scorecard's six "contradictions" (a26, a29, a31, a34, a53, a88) are all this: the record is wrong, not the prose.

**Cause:**
- `applyShipPositionChanges` (`src/narration/narrator.js` ~8040) applies any sidecar change with subject "ship" and attribute "position". It asks no `from`, and writes the source `narrator_sidecar`.
- `formatShipPositionLine` (`src/factContinuity/shipPosition.js` ~201) reads only set_a_course / expedition / `!at` / scene_token as docked, so a narration restating where she is demotes a move's arrival.

**Verdict: enough.** Two parts:
- (a) A ship position from the narration is applied only when it is the line's (`from: "line"`). Colour never moves her; this is D17 for the ship.
- (b) A position naming the place the record already holds keeps the record as it is: its source and its docked.

Tests: the run's three blocks (a25, a26, a27), each against the record before it.

## 3. CLOSING-CUTAWAY-SHOWS-WHO-WAS-PRESENT — the closing shows the one NPC, though she was with them

**What happened:**
- **a94:** the last frame had "present: Mira Kestrel, Tamsin Okoro" at Bleakhold's dispatch terminal. The closing's prompt says "A cutaway to Tamsin Okoro, somewhere the characters are NOT … Tamsin Okoro is not with them", and the cutaway walks her "out of the ledger stall and into the market hall on the Hollow Spire's lower ring".
- **a17:** the same. Mira was at her stall ("present: Mira Kestrel, Tamsin Vey"), and the cutaway sends Tamsin to the washroom mid-visit.
- This is half of the cold read's worst finding, "Tamsin is in two places at once". The other half is the player's own a61 line, which took the a46 cutaway's lounge (on Hollow Spire) for one on Bleakhold. That line binds, and nothing records where an NPC is between scenes.

**Cause:** `chooseClosingSubject` (`src/session/endSessionVignette.js` ~165). The pool drops the people present only `whileAnother` is left, so with one person in the campaign it falls back to her. `composeClosingScene` then knows she was with them (`withThem`) and only re-rolls her place.

**Verdict: enough.** When everyone the campaign has was present at the end, the closing shows a place, not one of them (the places pool, as with nobody). Test: one connection, present in the last frame → a settlement elsewhere.

## 4. READER-PLEA-BLOCKS-MAKE-A-CONNECTION — a plea to a stranger read as talk

**What happened:**
- **a5:** "I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, who can count on me in turn. Will you be that?" was narrated, nothing offered.
- The reader was told "Connections: none" and "NOT NOW … develop_your_relationship … — Mira Kestrel has no connection (make_a_connection instead)". Its reason: "Asking Tamsin to be someone she can return to and count on is pleading for a tie while it is being built; it meets no trigger."
- Beat 2 came to its last resort: a8 named the move, and the roll then made the connection.

**Cause:** the reader's rule 4 (`src/moves/reader.js` ~140) and its catalogue (`src/moves/readerCatalogue.js` ~102): "Talk is narration, to anyone, a connection included: … asking for the relationship itself while it is still being built: to be trusted, to be friends, to count on each other, to be someone's contact."
- The clause was written against #383's over-read: a plea to someone *already* a connection booked as Develop.
- For someone not yet a connection, it is Make a Connection's own trigger: "When you search out a new relationship…".

**Verdict: propose.** Rule 4's plea clause should hold for a connection already made; for someone not yet one, seeking the relationship is make_a_connection.
- Measure with the readers' test: a plea to a stranger, and #383's plea-to-a-connection controls.
- One live reading of the 76 lines costs about $0.8–2.

## 5. RESULT-FLOOR-BY-SHARED-WORD — a roll's result binds only by an accident of words

**What happened:** 19 `result` tags were refused.
- **13 rightly:** no roll — paced lines, and Develop's marks, which have no roll.
- **5 wrongly — a roll's own result:**
  - a11, the dock hand's report on a Gather Information strong hit;
  - a37 ×2, the decisive action's outcome ("her gun port is wrecked …"; "released from the berth clamps");
  - a71, "agreed to stand with Mira past the raids; the bond between them is formed";
  - a81, the fulfilment's finding.
- **2 bound as the dice's by a shared word:**
  - a64, "Tamsin asks how the Cinder Wren got Mira's berth number", which names the move's target;
  - a81, "Tamsin Okoro: heard Mira's finding…", where "finding" shares a word with "Find who is raiding…". The a83 recap then told it: "You told Tamsin that the raiders listen through the Kobayashi IV's galley installation".

**Cause:**
- `factBasis` (`src/factContinuity/provenance.js:258`) binds `result` when the fact shares a telling word with `decidedOfMove` (~317): the stakes line the outcome delivered, or the move's target.
- A progress roll has no stakes line, and an action roll's stakes rarely share a word with what the narration says it decided.

**Verdict: propose.** A `result` truth on a rolled move's own narration binds as the dice's, while a paced line's or a no-roll move's stays colour. If a word test is still wanted, widen the ground with the outcome's own text. Measure against this run's 21 tagged-`result` truths: the 5 should bind and the 2 should not.

## 6. REVEALED-PLAN-TRUTH-AS-COLOUR — the run's one violation

**What happened:**
- **a81:** the fulfilment revealed the vow's hidden plan, made at a3 (`reveals: [{ revealed: ["truth"], resolved: true }]`). The table wrote it as a scene truth with basis `narrator`: "The raiders are not strangers: they hold access to the Kobayashi IV's own systems…".
- **a94:** the scene's end filed it to Lore ("Vow: the raiders of the Cinder Expanse lanes"), and `colour-not-filed` fired.

**Cause:** `revealedTruthsOf` (`src/world/secrets.js` ~927) gives the truth `subject`, `fact` and `revealOf` but no `from`, so the ledger reads it as colour. The reveal path files it as Lore (by design, #362 AC37). The check is right that the two disagree; the basis is what is wrong. A plan's truth is the table's, decided by the module as GM and revealed by the dice.

**Verdict: enough.** A revealed plan truth carries basis `gm`, so it binds and its filing is right. Test: a reveal's truth, and its scene's end, with no colour filed.

## 7. NAMED-MOVE-REFUSED-UNTOLD — a move the reader declines is never told

**What happened:**
- **a58:** "I Hearten myself with a quiet hour in the galley." The beat's last resort, the move named. It was read as no move: "Hearten cannot be made now: Mira's spirit is full and she is not shaken, so there is nothing to recover". That is right.
- But the narration's obligations held only the general NOT SO [sheet] and [apparatus]. There was no NOT SO [premise] ("nothing to hearten"), and the card had no `cannotMake` line. The player was told nothing.

**Cause:** overhaul 4 tells a refusal the gate makes (`checkMove`). Here the reader declined the move under NOT NOW, so no move reached the gate.

**Verdict: enough.** The reader's reply should name the move a line set about that NOT NOW forbids (for example `blocked: { move, why }`). The router then tells it as the gate's refusal: the card's line and the narration's NOT SO [premise]. Tests: the run's a58 line and reading, and a control with spirit spent.

## 8. SCENE-TURNS — a turn from the narration's word; none inside one place

**What happened:**
- **Session 2: 7 scenes, 4 of them one beat long.** a24 began the expedition. a25 turned on "ship": "Kobayashi IV is now uncharted space off the Cinder Expanse lane…", which was a24's own fact block writing the ship (finding 2). That is one journey turned twice, and a turn from the narration's word.
- **Session 3: one scene of 26 beats from a56** (the night, `TIME_SKIP` working). It ran over the hull (a59), the station's observation lounge with Tamsin, who was not in the scene before (a61), the dispatch terminal (a74), the fulfilment, the recap and fourteen probes.

**Cause:**
- The first part is finding 2.
- The second: the walk rule (`placeWalkedTo`, `src/factContinuity/sceneLifecycle.js` ~933) turns only on a *recorded* place the line names, and the lounge and the dispatch office are inside Bleakhold, where the record has them. A person joining the scene turns nothing.

**Verdict: propose.**
- (a) is fixed by finding 2.
- (b) needs a decision. A turn could come when the player's line takes the characters somewhere else within the place and the frame's location changes with it, or when someone joins.
- Unsure, from PR #387: "an arrival followed by a fight counting as two turns" read right here (a27, a34).

## 9. RENAME-RECORDED-AS-A-TIE — the rename's link carry logged as a new tie

**What happened:**
- **x19:** the GM renamed Tamsin's card, and session 2's Session Log gained "Mira Kestrel: tied the vow "Find who is raiding the Cinder Expanse lanes" to Tamsin Okoro" at that step.
- **a83:** the recap: "The vow was tied to Tamsin again." It cites "s2-34 … tied the vow … to Tamsin Okoro — LASTING: a vow tied to a connection".

**Cause:** the rename follows the vow's link to the renamed card (VOW-CONNECTION-LINK-BY-NAME's fix), and the record logs that write as a link made.

**Verdict: enough.** A link carried across a rename is recorded as the rename, or not at all, never as a vow tied. Test: a rename with a linked vow → no `vow tied` event.

## 10. BUTTON-ROLL-SPEAKS-FOR-THE-CHARACTER — words for the character on a button press

**What happened:**
- **a82:** the bonded Develop after the fulfilment, rolled from the card's button with no line typed, was narrated: "You tell Tamsin plainly that she is the one person on these docks you would trust with the ship's secrets."
- The Chronicle filed it.
- **a85:** the @scene answer: "you told her she is the one person on these docks you would trust with the ship's secrets".
- The run's agency count (quoted speech given to "you") found 0; it misses reported speech.

**Verdict: propose.**
- A move rolled from a button with no line of the player's narrates the deed the move names (here, the vow completed to her benefit), never words or an act for the character. This is an obligation for that case.
- The agency count also reads "You tell / say / promise … that".

## 11. ORACLE-WORD-WRITTEN-AS-ROLLED — the set-pieces write the rolled words

**What happened:**
- **a96:** "Fortify, in the plainest sense" (rolled "Fortify History").
- **a94:** "who on this ring served the Dominion" ("Avenge Dominion") and "a pressure canister of flammable gas" ("Fiery Gas").
- Run 4: "a small new apparition". The MATERIAL says "no word of a result is written as it was rolled". The set-pieces row counts each result present (25 of 25), not this rule.

**Cause:** the set-piece calls (`narrateSessionVignette`) are not wrapped by `narrateKeepingObligations`, which the move narrations are.

**Verdict: enough.** A certain-class check on a set-piece narration: a rolled result's own word in the prose → asked again once, failing open. The words are in the call's seeds. Test: the run's a96 and a94 prose against their seeds.

## 12. OPENING-ACTS-ON-THE-PLAYER'S-FACTS — the lull's act moved a planted possession

**What happened:**
- **a19:** the opening's rolled "Deliver Religion" became "She sets the brass star-compass on Tamsin's counter … and pushes it a hand's width toward the woman". The compass is F2, the player's.
- **a20:** "Right now it sits on Tamsin's counter, where you set it."
- **a23:** Tamsin slides it back.
- Also: "She sets", third person in a second-person narration.

**Verdict: propose, after finding 1.** With the record's binds in its WHERE block again, the opening is told to keep each bind as it stands. Its lull act may not move, give or spend what a player's or the dice's truth says the character holds.

## 13. END-FOCUS-ON-A-FULFILLED-VOW — a second sample

**What happened:**
- **a94:** End a Session took the vow fulfilled at a81 as the quest focus (+1 momentum, already at 10).
- **a96:** the Begin card says "Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes" and, in the same card, "No character has a vow in play besides a background vow — swear an iron vow".
- Run 4: a87.

**Verdict: enough** (two samples). The End dialog offers only open vows, and Begin names no fulfilled focus.

## 14. BEAT-TOLD-TWICE — an offered move's roll retells the offer's beat

**What happened:**
- **a61 → a62:** "She listens without touching it … 'Who told you my name?'", then "Tamsin hears the whole of it without touching the compass … 'Who?'".
- The same for each offered Develop in beat 23 (a63/a64, a65/a66, a67/a68, a69/a70).
- The pen is given three times (a69, a70, a71) and is back in her hand at a73.
- The cold read: "player lines play twice".

**Verdict: propose.** When a move is rolled from its offer, the roll's narration is told the offer's narration as already said, and goes on from it. It tells the result, not the line again.

## 15. SURVIVOR-DROPPED — a binding fact in the prompt, not acted on

**What happened:**
- **a44:** the oracle said YES: "has at least one crew member alive aboard, trapped behind the jammed hatch" (dice). It was filed to Lore, and was in every session-3 prompt.
- The knocking goes on to a57.
- **a74:** "I go through the Cinder Wren's wreck…" got "The wreck's scorched console agrees." Nobody aboard is mentioned, ever again, and the recap leaves it out.

**Verdict: not yet.** One sample of narrator attention. A possible lever: a binding fact whose subject is what the line acts on (the wreck) goes in IN PLAY FOR THIS NARRATION, not ESTABLISHED LORE.

## 16. VOW-FULFILLED-UNANSWERED — the vow's answer handed over, its question let go

**What happened:**
- **a77:** the trace reached "the station's own administration … You can name the office, but not yet the hand."
- **a78:** the frame's "Who authorized the Cinder Wren's tasking?" was let go.
- **a81:** fulfilment at 6 of 10 boxes on scripted dice 1 and 2. The narration tells the hidden plan's truth — the ship's own galley — and "Their names are still not known."
- The cold read: "the climax is a twist handed to the player, not something they found". Run 4 had the same.

**Verdict: not yet — the charter's and a design question.** The charter fulfils on scripted dice at 6 boxes. Whether a fulfilment may tell its plan's truth unfound (#353's design) is the maintainer's to settle.

## 17. CARDS-STILL-ABOVE-THEIR-ROLL — new samples

- **a26:** "Expedition complete" and "◈ Site Discovered" above the Finish an Expedition roll card.
- **a71:** "Tamsin Okoro marked completed" and "⚑ Bond Forged" above the Forge a Bond roll card.

The cold read: "Results are posted before their dice". The row is open; these are added to it.

## 18. LORE-LINE-SAID-TWICE — every Lore line from a truth says its fact twice

The snapshot's ESTABLISHED LORE prints `- <title>: <text>`. A truth's Lore entry is titled "Subject: fact" and holds the fact again, so the narrator reads, for example, "- Mira Kestrel: promised Tamsin Vey she would be back before the next cargo arrives: promised Tamsin Vey she would be back before the next cargo arrives". `loreUnits` is in `src/narration/worldSnapshot.js` ~310, and `formatEstablishedLoreBlock` in narratorPrompt.js.

**Verdict: enough.** Print the text once when the title is the subject and the text. This is the prompt's length, nothing else.

## 19. Smaller observations

- **x13:** the reload posted "◈ Campaign Setup — No World Truths have been established…" mid-fight. This is WORLD-TRUTHS-REMINDER-ON-RELOAD, the fourth live sample.
- **The X-Card (x16):** the redirect block reached the next two narrations only (a40, a44). The X-Carded a39's listening voice came back (a58, a59) and became the vow's answer (a81), because it is the hidden plan made at a3, which the X-Card does not touch. The charter's X-Card is not aimed at content, so this is an observation only (X-CARD-REDIRECT-LASTS-A-SCENE).
- **The crate:** session 1's refrain (7 of 10) was a hidden mystery's hint, retired with its scene at a17 (#362 D4; D16 keeps a mystery across a turn, not a session). It was never paid off.
- **A sheet number in a character's mouth:** "Still counting your boxes? … Two of ten" (a58, the vow's boxes). No check caught it.
- **Cards and machinery:**
  - "◈ Site Discovered — The crew reach a place…" says "the crew" for one character, and asks the player to rename "its location in the Entities panel" (a26).
  - "The player character's sister" appears on an entity draft (a13).
  - The a2 spotlight's flashback (Vigil Reach, "the Tolerated") drafted entities and never connected.
- **Small slips:** Tamsin calls her "Mira", a name never given (a23). Third person at a19 and a68. a50's @scene answer reads the track aloud ("the relationship stands at nothing").
- **F4's truth in the narration's words:** the player's line, "before the next tide of cargo", was filed as "before the next cargo arrives" (`from: "line"`). The meaning held.

## The review's own fixes (the checks)

- **F4** has "next cargo". The record kept the promise in the narration's words, and every answer gave them.
- **F7's refusal has `former`** (`lib/ledger.mjs` `FORMER_MARK`). A sentence that holds the new name and gives the old one as what it was is no refusal: "The table renamed her from "Tamsin Vey," so Okoro is the surname the story holds." (a55). F6's correction has none.
- **Plain lines:**
  - a line reader's own nothing-to-recover reading is read right where its sheet bears it out (a58);
  - beat 22's night-pass line is the beat's `setupWords` (a56).
- The four kept long hauls carry F4 and F7 as the charter has them now. The run is re-scored from its evidence (`rescore.mjs`): 4 recalled, 0 lost, 0 refused. Tests: `tests/unit/exploreRoundFive.test.js`.

## The overhauls, in play

- **Held:**
  - the one reader (17 of 19 plain lines; no other move; 1.6 s);
  - the gate (nothing forbidden offered or rolled);
  - D4 (Confirm recorded her, the roll made her a connection);
  - scenes turning with causes;
  - `TIME_SKIP` (a56);
  - let-go (0 re-set);
  - `!truth list` / `strike` across the session's scenes (a41, a42);
  - no reconciliation sentences;
  - the recap's citations (96, every id a line of its source);
  - the session record's views (no refusal);
  - names changed, written as the new ones.
- **Did not hold where the run exercised them:**
  - the opening from the record (finding 1);
  - one place for the ship (finding 2);
  - a refusal told (finding 7);
  - the provenance floor (finding 5);
  - the reveal's basis (finding 6).
- **Not exercised:** a vow sworn to a connection, a claim the scene refutes, a milestone from a line, a plea to a connection.

## Spent and returned

- **Spent:** $3.1881 live (the cap $15; 352 of 400 calls; 35.9 of 60 minutes). The cold read was one Opus sub-agent reading the transcript alone, about 184k tokens. The re-scores were free.
- **Returned:**
  - the first long haul to reach all 27 beats;
  - a measure of each overhaul in play;
  - nine findings with enough data to fix (1, 2, 3, 6, 7, 9, 11, 13, 18), six to propose (4, 5, 8, 10, 12, 14) and two not yet (15, 16);
  - three checks corrected that would have mis-scored every later run.

The next live run should show: no ship contradiction, a "What binds" line in every opening's block, a closing that never shows someone who was there, and no colour-not-filed violation.
