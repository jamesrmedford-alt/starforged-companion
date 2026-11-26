# Long haul, seventh live round — action items

Run `test/ci/playwright/explorations/long-haul-live-20261126-030646/` (commit 126a547f): the measure of #390's fixes, among them overhaul 8 (#393) and the dice rule, the round's one run. It was given nine questions first. 90 actions, 332 model calls, 33.2 minutes, **$2.8519**.

- **Beats:** 27 of 27 done. It is the first live long haul classed `pass`.
- **Mechanics:** 1,381 checks, none violated.
- **Ledger:** 4 recalled, 4 carried unasked, 0 lost, 0 refused; both baits corrected. F3-C, reworded, was asked at a80 and counted.

**In short.** What the run reached of #390 held.
- **The record:** an expedition set out (no place, "between places, on the expedition …") and its arrival turned the scene as a place. Five frames that named another settlement were refused.
- **The set-pieces:** all nine were in the second person.
- **The cards:** no card posted above its roll. A cost picked after its narration was told in the next beat.
- **Memory:** every planted fact was recalled.

**What a player would complain of** is the one thing #393 was for. The narration flew Mira to Tamsin's stall on Hollow Spire by skiff, with no journey (a60). Five beats later it had moved the stall to Bleakhold to agree with the record (finding 1). The record held and the prose did not. Nothing held the prose, and the judge-class lines were never judged: the charter turns the consistency check off (finding 4).

Worst first. Each finding gives the quotes with step ids, the cause as far as the code or a prompt shows it, and whether there is enough data to fix it. Nothing below is implemented; each needs the maintainer's word. The findings are filed in #390–#392, each a row in `docs/known-issues.md`.

## What the charter made happen

- **Its scripted dice.** Each key beat's move is a strong hit (the beat's `dice`), so every progress roll's challenge dice came up 1 and 2 (a25, a35, a68, a75).
  - The expedition finished at 3 of 10 boxes, the fight at 4, the vow at 4. The cold read's "closed, not won" is the charter's.
  - The module rolls 2d10 (`src/moves/resolver.js` `rollChallengeDice`).
  - Filed as a new sample of VOW-FULFILLED-UNANSWERED (#392), the charter's own design call.
- **Its persona's background vow,** "Find the lost colony ship Verity's Hope", is never played. Beat 1 swears the raider vow.
- **Its memory questions:** 17 asked as `@scene`, 4 as lines of play.
- **Beat 15** opens End a Session and closes it unanswered (x15). The cold read read this as "a failed command".

## 1. CHARACTERS-MOVED-BY-THE-NARRATION (again) — the prose flew to another settlement; the record held, and the prose then moved the stall

**What happened:**
- **a57:** "I hail Tamsin Okoro …" — over the comm. The fact block's frame puts Tamsin in `present`, because its rule says to include characters on comms.
- **a60:** "I fly the Kobayashi IV's skiff to her stall and lay my own last ration of credits on her ledger …". The line names neither Tamsin nor Hollow Spire. The reader read Develop Your Relationship (target Tamsin Okoro). Its situation listed her as present and had no Elsewhere line.
- **The narration:** "The skiff clears the ring and noses down toward Hollow Spire's docks."
- **a60–a64:** five fact blocks proposed "Tamsin Okoro's ledger stall, Hollow Spire docks" (and "the dock lock near Tamsin Okoro's stall, Hollow Spire docks"). Each was refused (#393 D4), so the record and THE SCENE stayed at Bleakhold. Nothing told the narrator.
- **a65:** the frame becomes "Tamsin's ledger stall, Bleakhold docks". The narration moved the stall to the record.
- **a82:** "Tamsin's ledger stall, where the scene stands, is on the Bleakhold docks". Every earlier answer (a19, a48, a49, a53) and a44's closing had it on Hollow Spire.
- **a86** (the docking bait) is corrected — "This is Bleakhold" — but in the same breath Tamsin says "Hollow Spire is where you left me", at her own stall.

**Cause:**
- **Presence by comm is presence.** The fact block's frame rule asks for "every named character present or directly engaged (include characters on comms)" (`src/narration/narratorPrompt.js` ~240). The record's whereabouts (`factContinuity/whereabouts.js lastSeenWith`) take the latest frame a person was present in. After a57, Tamsin was "here".
- **The line names nobody.** [whereabouts] and the reader's Elsewhere read names in the line (`elsewhereOf`). "Her stall" names neither, though the reader's reading named the target.
- **D4's guard is silent.** It refuses the frame and keeps the last `where` (`sceneLifecycle.js framedAtThePlace`), but the narrator is not told. The prose went on at Hollow Spire for five beats, then reconciled the other way.
- **The frame rule asks for it:** "When the player's line has moved the scene, write it where the line put it."

**Verdict: enough.**
1. **Hold the prose.** A narration whose own frame names another recorded place, while the characters are at one, fails a certain check: "The characters are at Bleakhold Station; Hollow Spire is another place — a journey's move takes them there: tell the beat where they are." It is asked again once, as [material] and [person] are. This catches a60 whatever the line says.
2. **On comms is not here.** The frame rule marks people on comms ("Tamsin Okoro (on comms)"), and `lastSeenWith` skips those entries.
3. **The frame rule:** a line that sets out for another place does not move the frame; the journey's move does.
4. **[whereabouts] reads the reading's target** as well as the line's names.

What would prove it: a test from a60's own reply (its frame and prose) that is re-asked, and a next run with no prose at another settlement without a journey.

## 2. DICE-LINES-UNBOUNDED — every line that names a subject gets all its dice facts, the PC's ship included

**What happened:**
- [dice] lines rode on 22 of the 44 narrations of play: 61 lines in all, nine narrations with four.
- Five of them (a26, a28, a29, a60, a61) carried facts of the PC's own ship. At a60–a61 these included two that contradict each other: "Kobayashi IV: lost her firing angle on the Cinder Wren's drive; berth plating torn by return fire" and "Kobayashi IV: docked guns trained on the Cinder Wren's drive, giving Mira the angle on the cutter".
- None was needed. No line took for granted what the dice denied: a71's search of the drifting cutter is true to them.

**Cause:** `narrator.js diceFactsOf` takes every truth of the dice, from every session, the current scene's included, whose subject the line names. The command vehicle is named in most lines.

**Verdict: enough.**
- Never the command vehicle's or a PC's own facts: the sheet and the ship's record say those.
- Only truths of earlier scenes. The current scene's are in WHAT BINDS already; run 6's a77 needed an earlier session's.
- At most two a subject, the newest.

## 3. BEAT-IN-THE-THIRD-PERSON — two beats of play told "Mira"

**What happened:** a11, "Mira turns the brass star-compass over in her palm"; a69, "Mira's hand lingers on the chit a moment before Tamsin takes it". Both are under a second-person PERSPECTIVE. All nine set-pieces were "you" (OPENING-IN-THE-THIRD-PERSON held).

**Cause:** the [person] check (`checks.js personViolations`) is on set-pieces alone (`obligationsFor` mode `set-piece`).

**Verdict: enough.** Add the same certain line to the paced and move modes when the narration is in the second person.

## 4. JUDGE-OFF-IN-THE-LONG-HAUL — the long haul never judges a judge-class line

**What happened:** no `obligationJudge` call and no re-ask in the run. [dice] and [whereabouts] were told and never checked; nor were [offer], [state], [unsaid] or [premise].

**Cause:** the obligations' judge runs only with fact continuity's consistency check on (narrator-context-flow), and the charter turns it off (`settings` `factContinuity.consistencyCheck: false`).

**Verdict: a design call (#392).**
- Turning it on costs one Haiku audit a narration and the judge's calls. That is about seventy more calls, against a 400-call cap this run used 332 of.
- Alternatively, run a scenario with it on, for the judge-class lines alone.

## 5. SHIP-LEFT-NEAR-ON-SETTING-OUT — between places, the ship's record stays at the place left

**What happened:** a22–a24, THE SCENE said "Place: none — the characters are between places, on the expedition …" beside "Ship: Kobayashi IV near Hollow Spire (Cinder Expanse)". The narration's ship/position facts ("uncharted space at the clipped hauler's distress source") were untagged colour, which moves nothing (#388 #2).

**Verdict: enough.** Setting out (#393 D1) also moves the command vehicle's record off the place left when she was there — free text "under way: on the expedition …". The arrival docks her, as now.

## 6. TRUTHS-FILED-A-SCENE-EARLY — an arrival beat's truths filed in the scene before

**What happened:** a39's `!truth list` files a25's truth ("the scan of the ribs turned up something worse, and the effort cost Mira supply") under the expedition's scene. It files a26's ("docked at Bleakhold Station after clearing the bone-white ribs") under the site's scene, "inside the dead hull". Each lands one scene before the scene its arrival began.

**Cause:** not read. The narration's working copy is turned before its truths are set (`ensureCurrentScene`, `narrator.js` ~1410), so the scene is stamped later: the record's `scene` (`record/ledgerDiff.js`, at the persist) or the pipeline's merge.

**Verdict: not yet.** Read the move pipeline's order from the arrival's narration to its persist. Pin it with a test of an arrival beat's truth.

## 7. PRICE-TOLD-WITH-A-COST-NOT-PAID — a chosen price told with a supply cost nobody took

**What happened:** a24, Pay the Price "As stated before the roll: The scan turns up something worse among the ribs, or nothing useful at all" — no meter. a25's narration: "the scan has cost you: the sweep turned up a worse tangle among the ribs than you wanted, and your supplies thinned working through it". It was filed as the dice's truth, and a26's [dice] lines and the recap repeated it.

**Verdict: a fix can be proposed, and its effect measured.**
- The [chosen-since] line tells the pick in its own words. It could add: "nothing on the sheet changes but what the pick says".
- NOT SO [sheet] is there, but generic.

## 8. NARRATIVE-REVIEW-FOR-A-CHANGE — a review card for a narration true to the fight

**What happened:** a37's ◈ Narrative Review: "The narrator may have contradicted an established fact. Ashen Wake — The cutter is now visibly dead in the ring, drive gone …". That is the fight's own result (a35). The consistency check was off. The card is the entity extractor's state-transition read: a change it calls "contradicted" against Lore, posted by `world/worldJournal.js postContradictionNotification`.

**Verdict: not yet.** One sample. Read whether the transition read tells a state the dice just set apart from a contradiction of Lore.

## 9. Smaller observations

- **Refrains** around Tamsin (NARRATOR-REFRAINS family):
  - her pen stops (a5, a9–a13, a58–a66);
  - the ledger boy (a61–a76);
  - "turns on her dead drive" (a42–a54);
  - "who else" closes three beats.

  The Refrains row: "drive" in 10 of session 2's 12 narrations of play.
- **a21:** "You said it with your hand on that engine casing". The oath's gesture (a3) is given to the promise (a13).
- **a80:** "Your manifest is not there … She sets it flat on the counter" — one narration contradicting itself.
- **a28:** "Fire has not yet been traded", under a line in which the cutter "opens fire on my berth". NOT YET [fight] read against the line's own shots.
- **x13:** WORLD-TRUTHS-REMINDER-ON-RELOAD, a sixth sample (#391, ready).
- **SCENE-TURNS-INSIDE-A-PLACE (b):** session 3 is one 23-narration scene from a54, a third sample (#392).
- **The offer flow:** eight offered moves were pressed and narrated again (the cold read's "repost loop"). Of 19 lines that wanted a move, 9 were rolled and 8 offered. The design is overhaul 1's; this is the friction to measure.

## #390's fixes, in play

- **Held:**
  - OPENING-IN-THE-THIRD-PERSON: nine set-pieces;
  - EXPEDITION-LEGS-TURN-THE-SCENE: a22–a24, one scene;
  - CARDS-STILL-ABOVE-THEIR-ROLL: 17 rolls;
  - CHOSEN-COST-NEVER-TOLD: a25 told a24's pick, with finding 7's invented cost;
  - F3-C: a80;
  - the set-piece [material] check: a46 re-asked "Clash Time:".
- **Broken:** CHARACTERS-MOVED-BY-THE-NARRATION. The record held and the prose did not (finding 1); it goes back to #391 with the a60 sample.
- **Not exercised:**
  - SIDECAR-NOTE-IN-THE-PROSE: no reply wrote after its block;
  - REPAIR-POINTS-UNREACHABLE: the button was on a56's card, not pressed;
  - FULFILMENT-SILENT-ON-A-SPENT-DEEPEN;
  - SHIP-BOUND-FOR-READ-AS-NEAR;
  - LINE-CLAIM-OVER-THE-DICE: no line against the dice; no judge;
  - ORACLE-NO-NARRATED-AS-YES: a42's NO was told right, but its check never had to fire;
  - the older rows.

## Spent and returned

- **$2.8519:** the module $1.9470 (68%), the AI player $0.9049 (32%).
- **Bought for it:**
  - the first live confirmation of overhaul 8's record side;
  - finding 1, the one a player feels, which needed a live narrator — a rehearsal writes no prose that travels;
  - findings 2, 3, 5 and 7, read from the prompts and replies. They could have been seen in a rehearsal's prompts for 2 and 5, and needed live prose for 3 and 7.
- **For nothing:**
  - finding 4 (the charter's settings);
  - finding 6 (the `!truth list` output, also in a rehearsal);
  - the charter's dice (its own file).
- **The next dollar:** on a run after finding 1's fixes, with a line that seeks someone elsewhere by pronoun after a comm call. Not before.
