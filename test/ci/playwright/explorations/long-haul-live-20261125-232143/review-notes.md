# Long haul, sixth live round — action items

Run `test/ci/playwright/explorations/long-haul-live-20261125-232143/` (commit e62fa124): the measure of issue #388's fixes, the round's second run. It was given ten questions first. 98 actions, 352 model calls, 35.4 minutes, **$3.0948**.

- **Beats, re-scored:** 26 of 27 done, none failed; beat 8's waypoint was not exercised. The run's own two failures (beats 8 and 25) were the checks' (see "The review's own fixes").
- **Mechanics:** 1,581 checks, none violated (run 5: one).
- **Ledger:** 5 recalled, 2 carried unasked, 0 refused; both baits corrected. The one "lost" (F3-C at a88) is a misread question, not a loss.

The round's first run (`long-haul-live-20261125-225635/`, commit 1dcf83d3) stopped at beat 22 on a runner fault, fixed before this one; it is kept as a partial run (last section).

**In short.** Every #388 fix the run reached held live: the openings are told where the last session stopped, and the closings cut away to someone absent. Colour never moved the ship. A rolled move's results bind as the dice's, and the plea to a stranger was offered Make a Connection on its first line. The set-piece check fired once and mended its scene. No move pressed on a card spoke for Mira, and no offered move's Roll told its line again. The focus on a fulfilled vow was said so. Nothing the obligations forbade was told: 1,581 checks, none violated.

What a player would complain of — the cold read found most of it — is what the story lets go of between beats:
- **Where Mira is.** The narration walked her to another station and back. For twelve narrations her record, her ship and every @scene answer kept her at Bleakhold (finding 1).
- **What happened.** The player's line went down to the wreck of a cutter the dice had sent fleeing. The narrator followed it, and the vow's answer came from that wreck (finding 2).
- **Who someone is.** The customs officer changed sex between sessions (finding 6).
- **What a move did.** The Repair's points could be spent only by a typed command, so the ship stayed damaged while the story said it was patched (finding 5).

Two slips reached the table: a model's note to itself posted at the end of an opening (finding 3), and three of the round's six openings told in the third person (finding 4).

Worst first. Each finding gives the quotes with step ids, the cause as far as the code or a prompt shows it, and whether there is enough data to fix it. Nothing below is implemented; each needs the maintainer's word. The findings are filed as issue #389, each a row in `docs/known-issues.md`.

## 1. CHARACTERS-MOVED-BY-THE-NARRATION — the frame names another station; the record keeps the first

**What happened:**
- **a64:** the player's line: "I find Tamsin at her ledger stall and hand her … what I've learned". Mira, her ship and her record were at Bleakhold Station; Tamsin's card says "Salvage broker running a ledger stall on the Hollow Spire docks", another settlement of the sector. The narration: "The walk to the Hollow Spire docks takes the better part of the morning."
- **a65–a77:** every narrator prompt's scene block holds both, in two lines that disagree:
  - "Place: Bleakhold Station — where the characters are, by the table's record";
  - "Where: Tamsin's ledger stall, Hollow Spire docks — as the narration has it".
  The review's place table counts 12 frames that name another place (a64–a76).
- **a94** (the docking bait): the narrator keeps the record and names the drift in one breath: "By the record, you are docked at Bleakhold Station … Hollow Spire is where Tamsin keeps her stall, and where you stood watch."
- **The same seam on the ship's side, a22–a24:** the expedition took the ship into uncharted space, and the block said "Place: Hollow Spire — where the characters are, by the table's record | Ship: Kobayashi IV uncharted space … | Where: Kobayashi IV, main cabin". Nothing moves the characters' recorded place when they leave aboard their ship.

**Cause:**
- The scene block has three stores (overhaul 2 §6.1): the recorded place (`currentLocationId`), the ship's position, and the frame's `where`, which is the narration's own (`src/narration/narratorPrompt.js` ~510–530).
- The record moves with a walk only when the player's words name the place too (`placeWalkedTo`, `src/narration/narrator.js` ~7190–7205, overhaul 2 §6.4). a64's line named Tamsin's stall, not Hollow Spire, so the record stayed. The frame's `where` took the narration's "Hollow Spire docks" as it took everything else.
- Nothing reads the frame's `where` against the recorded place, and nothing tells the narrator or the reader that a person whose stall is on another settlement is a journey away.
- A departure aboard the ship (Undertake an Expedition, Set a Course) writes the ship's position and leaves `currentLocationId` where they set out from.

**Verdict: enough to propose; a design call on the second half.**
- (a) A frame `where` that names a recorded place other than the current one, where the player's words did not, is not taken: the frame keeps its last `where`. The scene block's NOT SO says the characters are at the recorded place.
- (b) A person whose record puts them at another settlement is told as there. To find them is a journey: Set a Course, or they come here. The reader is told the same, so the line is offered the journey.
- (c) While the characters are aboard their ship away from any place, their recorded place is the ship's. Whether that clears `currentLocationId` or adds an "aboard" state is the maintainer's call; every consumer of `currentLocationId` would need the audit.

## 2. LINE-CLAIM-OVER-THE-DICE — the player's line found a wreck the dice had sent fleeing

**What happened:**
- **a41:** Take Decisive Action, a strong hit: "The cutter is gone from the ring, a smear of orange sliding off into the dark with her engines still burning." Filed as the dice's: "Ashen Wake: driven off the docking ring with burning engines and silent guns".
- **a46–a47:** the table corrected the cutter's name to the Cinder Wren (`!truth strike`, `!truth set`). **a58:** "She's logged four times this season. Nobody's ever caught her."
- **a77:** the player's line: "I go down to the cutter's wreck and search her flight recorder and cargo hold for whoever sent her". The narration: "The wreck of the Cinder Wren lists in the shallows of the docking ring, her hold half open."
  - Gather Information's strong hit filed the recorder and a contract-stamped manifest tag as the dice's.
  - The line's "carries the Cinder Wren's flight recorder and manifest tag out of the wreck" was filed as the player's.
- **a80–a84:** the tag led to Joss Varrow, and the vow was fulfilled on it. **a91:** "You drove it off with burning engines and silent guns, and you later searched its wreck."

**Cause:**
- a77's narrator was told both:
  - its ESTABLISHED LORE: "Ashen Wake: driven off the docking ring with burning engines and silent guns";
  - NAMES THE TABLE CHANGED: "'Ashen Wake' is now 'Cinder Wren' (raider cutter)".
- It followed the line.
- A line's facts bind as the player's (decisions.md, D5–D8: "a fact the player's own line states is tagged 'line'"). Nothing reads what a line takes for granted against a truth of the dice.
- The truth that she fled was in Lore under the old name, and the scene's WHAT BINDS held nothing of the cutter. The reader was told nothing of her.

**Verdict: not yet — a design call, with one change enough now.**
- **Now:** a correction's old-name truths are told under the new name. "Cinder Wren: driven off the docking ring …" is plain, where "Ashen Wake: …" asks the narrator to join two names. It can be written through on the correction, or renamed at read time, as NAMES THE TABLE CHANGED already asks of the narrator.
- **The call:** when a line takes for granted what a truth of the dice denies, which binds? The rules give the dice the outcome; fiction-first gives the player the character's acts, not the world.
- **A proposal:** the narration tells what is there — the cutter got away; what lies on the ring is her debris, or nothing — and the line's assumption is not filed.

## 3. SIDECAR-NOTE-IN-THE-PROSE — the model's note to itself was posted as the opening's last line

**What happened:**
- **a17** (session 2's opening): the posted narration ends "Behind you, Tamsin's pen has not moved, and neither has the manifest. Hmm — correction to the block above, which should stand as written but with the first entry matching the prose more exactly:"
- The reply was: the prose, a JSON block, that sentence, and a second JSON block that changed only `builtFrom`.

**Cause:** `extractSidecar` (`src/factContinuity/sidecarParser.js` ~80) takes the last block as the sidecar and strips every block from the prose (`stripBlocks`). Text between two blocks stays prose.

**Verdict: enough.**
- The prose ends at the first sidecar block: what the model writes after it — a note, a corrected block — is never narration.
- Of 392 recorded narrator replies with a block, in the kept runs and this round's two, this is the only one with any text after its first block. Nothing else changes.

## 4. OPENING-IN-THE-THIRD-PERSON — three of the round's six openings, against their PERSPECTIVE block

**What happened:**
- **a52:** "Mira is counting the water ration for the third time, which is two times past the point where the number could change."
- **a98:** "Mira is holding out against a loose-fitting habit of rationing: three sips from the flask where one would do …"
- Both prompts said: "Perspective: Address the player character directly as "you". … never call them by name in narration." The a2 and a17 openings kept it ("You are crouched at the access panel"; "so you do the sensible thing").
- The round's first run: a48, "Mira has taken up an odd occupation at the gunnery console". That is three of the round's six openings, each in a session after the first two.
- Run 5 had the same slip at a19 and a68.

**Cause:**
- The set-piece's MATERIAL names the character in the third person: "1. What Mira Kestrel is doing in this lull — Action + Theme (70, 86): Preserve Supply" (the a52 prompt).
- No check reads the perspective: `narrateKeepingObligations` re-asks on its obligations, and the person is not one of them.

**Verdict: enough.** Two changes, either alone a fix:
- The MATERIAL line in a second-person table: "What you (Mira Kestrel) are doing in this lull".
- A certain check: in second person, the character's name outside quoted speech is a violation, and the set-piece is asked again.

## 5. REPAIR-POINTS-UNREACHABLE — a Repair's points can be spent only by a command its card never names

**What happened:**
- **a38:** "Withstand Damage (-1) Kobayashi IV: 5 → 4".
- **a62:** Repair, a strong hit: "Gain repair points: facility 5, field 3, under fire 2. Spend: clear battered (2), fix module (2), +1 integrity (1), +1 companion health (1), repair device (3)." The card has no button. The narration patched the flank and the gun feed.
- The ship's integrity stayed 4 of 5 to the end of the run. The a85 recap: "Back aboard, you patched the flank plating and repaired the gun targeting feed."

**Cause:**
- The spend is `!repair` (`src/moves/repair.js`): "once a player has rolled Repair and seen the result, they invoke `!repair` to allocate points".
- The Repair card neither says so nor offers it, so a player who plays by the story never spends them: a consumer the card does not reach (`rules/reachability.md`).

**Verdict: enough.** Either change closes it:
- The Repair card carries a button that opens the dialog with its points, on the roller's client, as `!repair` does.
- Or the card's text names `!repair`.

## 6. UNNAMED-FIGURE-PRONOUN-DRIFT — the customs officer is "she" in session 2 and "he" in session 3

**What happened:**
- **a34–a48:** "slate clutched to her chest" (a34), "lifts her head over the crates" (a40), "before she looks at the damage" (a41), "lowers her slate" (a48).
- **a58–a62:** "He says it flatly, like a man reading a debt" (a58), "as if he never left" (a60), "clears his throat" (a61), "his slate is raised again" (a62).

**Cause:**
- The officer has no card. a41's draft, "Customs Officer", was never confirmed, and no record holds a pronoun for a figure without one.
- The colour truth "customs at the dock bay is run by a gray-jacketed officer …" has none, and the frame's `present` is a bare "customs officer".
- Session 3's narrations had none of session 2's prose in their recent scene, so the narrator chose again.

**Verdict: enough to propose.**
- The frame's `present` carries a pronoun for an unnamed figure as the narration gives it ("customs officer (she)"), kept while the figure stays in the frame.
- Or a figure the narration gives a pronoun to is drafted with it.

One sample; a player notices it.

## 7. FULFILMENT-SILENT-ON-A-SPENT-DEEPEN — the vow's promise to its connection is not accounted for

**What happened:**
- **a8:** the vow was linked: "🤝 Linked to Tamsin Vey — fulfilling this vow will deepen that bond."
- **a63:** the won fight's "🤝 Deepen your bond with Tamsin Vey" was pressed: "🤝 Your bond with Tamsin Okoro deepens — +1 milestone of relationship progress." The vow's one deepen was spent (decisions.md, "A vow deepens its connection once"). The card does not say so.
- **a84:** the vow was fulfilled. The cards say "marked completed", the reward note and "⚑ Vow Fulfilled … Quests legacy track: +2 ticks marked." Nothing deepens and no bonded roll is offered, rightly; nothing says why.

**Cause:**
- A press after the fulfilment's deepen posts "… has already counted for your bond with … — a vow does so once." (`postDeepenAlreadyPaidCard`, `src/index.js` ~6665).
- The other order has no card: the fulfilment's payoff skips a landed step in silence (`owed("deepen")`, `src/index.js` ~7118).

**Verdict: enough.**
- The fulfilment posts the same note, on its after-the-roll list, when the deepen has landed already.
- The won fight's deepen card says it is the vow's one: "— this is the vow's deepen; its fulfilment will not deepen her again".
- The run's own check read beat 25 as a player would: no roll, and nothing saying why (see the checks).

## 8. SHIP-BOUND-FOR-READ-AS-NEAR — a heading laid in was recorded as the arrival's neighbourhood

**What happened:**
- **a31:** "I plot the route out of the hauler's bay and take the Kobayashi IV to Bleakhold Station." The reader offered Set a Course; nothing was rolled.
- The narration was right: "You turn the bow toward Bleakhold Station and lay the heading in. … Nothing has been flown yet, and the lane is a long dark." Its fact block was right too: `{ "subject": "ship", "attribute": "position", "value": "leaving the clipped hauler, bound for Bleakhold Station", "from": "line" }`.
- The ship's record became "Kobayashi IV near Bleakhold Station (Cinder Expanse)".
- **a32:** the offer's Roll, a strong hit: "Arrived at Bleakhold Station". The record is right from here on. A miss would have left the ship "near Bleakhold" with nothing flown.

**Cause:**
- The change binds: it is the player's line (#388 #2's fix, `shipBinds`, `src/narration/narrator.js` ~7243–7251).
- The record is made by `inferShipPosition` (`src/factContinuity/shipPosition.js` ~100). It takes "the first place the seed names, read on past any name that is not one". "the clipped hauler" is no recorded name, so it read on to "Bleakhold Station" and recorded the ship at that settlement, which prints as "near".
- "bound for" names where she is going, not where she is: the ARRIVAL-LOCATION-PHRASE-SPLIT family, where "the expedition to Bleakhold" was read as Bleakhold.
- And the journey's arrival is its move's own. The walk rule says so for the characters: "Never a Set a Course's: its arrival is the move's own — the outcome decides it" (`narrator.js` ~7196).

**Verdict: enough.** Either change closes it:
- A place that follows "bound for", "toward", "heading for" or "en route to" is not a position there: the record keeps the phrase as free text.
- A beat that offers a journey move (Set a Course, Undertake an Expedition) moves the ship nowhere before its roll.

One sample; the cause is plain.

## 9. EXPEDITION-LEGS-TURN-THE-SCENE — one journey is a scene a beat

**What happened:**
- **a22:** Undertake an Expedition, a weak hit. The scene turned: "the expedition Source of the clipped hauler's distress call has begun" (sc-c606daeb, 1 beat). The narration's ship change was the dice's: "Kobayashi IV uncharted space on the bearing to the distress call's source".
- **a23:** the peril's choice, with no new place. The scene turned again: "Kobayashi IV is now uncharted space on the bearing to the distress call's source" (sc-7db08c7d).
- **The round's first run, a23–a25:** each beat of its expedition began a scene of one beat:
  - a23 (ship): "uncharted space off the Cinder Expanse lane";
  - a24 (ship): "… at a debris field";
  - a25 (place): the arrival.

**Cause:**
- Overhaul 2's scenes "begin before": the expedition's track turned the scene before the narration told it, and the scene's anchor (`sceneBegan`) was written with the ship where it was.
- Each leg's narration then moves the ship, as the move's result. The next beat's check finds the ship away from the anchor's and turns for "ship" (`src/factContinuity/sceneTurns.js`).
- Out in uncharted space the position is free text, so every new phrase is a new place.

**Verdict: enough.** While an expedition is under way, the ship's changes on its legs belong to its scene: they update the anchor's ship and turn nothing. The arrival turns the scene, as a place. Two samples, one per run; the cause is plain.

## 10. COLOUR-IN-THE-HELPERS — the summaries and the Chronicle tell the narration's colour as what happened

**What happened:** the scorecard counts 13 sentences of the summaries, the recap and the Chronicle that hold a colour truth's own words, of 38 colour truths (the round's first run: 6 of 16). Read one by one:
- **One false match:** "an unknown agent had already contaminated the recycled air", matched on "already" alone.
- **Three** are the customs officer, a person of play whose colour truth only describes his post.
- **Nine** tell a detail the narration added and nothing binds, as what happened:
  - the hauler's "steady pulse", "racks stripped clean";
  - Tamsin's ledger "face-down", "someone had already asked about Mira's questions" and her "second book";
  - "a gray-jacketed customs officer";
  - the manifest pulled "on a sealed requisition".

**Cause:**
- The helpers are written from the narrations' prose.
- Overhaul 2 keeps colour out of the binding tiers and out of a scene's filed Lore (`colour-not-filed`: 36 checks, none violated). It does not keep colour out of a summary.
- A summary is read by later narrations as what happened, so colour read back from one is colour bound.

**Verdict: not yet — a design call.** Colour is part of what happened in the story, and a recap without it is thin. If it should not bind, the summaries and the Chronicle are given which facts are colour, or the narrator is told that a summary's detail is colour unless a truth that binds holds it. The count is "medium: shared words"; this reading is the measure.

## 11. SCENE-TURNS-INSIDE-A-PLACE (b) — session 3 is one 22-beat scene

Session 3 had two scenes: its opening (a52, 1 beat) and a time skip at a60 ("I rest aboard until the next morning"), which lasted 22 beats. In those beats the characters went from the berth to Tamsin's stall (finding 1), the cutter's wreck (a77), the records office (a80) and the probes. The frame's `where` changed three times; the recorded place never did, so nothing turned. The row is open, a design call; this is its second sample, and finding 1(a) would make it worse: the walk to Hollow Spire would have been the one turn.

## 12. Smaller observations

- **x13:** the reload posted "◈ Campaign Setup — No World Truths have been established for this campaign." mid-fight. This is WORLD-TRUTHS-REMINDER-ON-RELOAD, the fifth live sample.
- **The reader:**
  - a24's "go over the place the signal leads me to, scanning the debris and hulls" was read as the next leg (Undertake an Expedition), not Explore a Waypoint. The line is ambiguous ("the place the signal leads me to"). The a22 roll had reached a waypoint, and the reader's situation did not say so.
  - a43's look over the scorch marks was rolled as Gather Information: defensible.
  - a68's turn toward a footstep, "hand near my sidearm", was rolled as Face Danger where the beat wanted Develop: the scene had put the footstep behind her.
- **Card order (fixed after this run, e4171fb4):** the cards below stood above their roll cards. All four kinds are in `tests/unit/everyCardFollowsItsRoll.test.js`.
  - a22: the expedition's "begun — progress marked";
  - a27: "Expedition complete" and "◈ Site Discovered";
  - a65: Develop's "progress advanced" and its card;
  - a74: "Tamsin Okoro marked completed" and "⚑ Bond Forged".
- **The second expedition (a30)** was the runner's, from beat 8's last resort (see the checks). The module began a second track for the place just reached, "Source of the Clipped Hauler's Distress Call", beside the finished one. A line that sets out for where the characters already are could be told so. One sample, the runner's doing.
- **A single rolled word written as rolled:** "working through the ship's authority logs" (a2, "Inspect Authority"), "follows the talk" (a96, "Follow Humanity"), and the first run's "decided to assault the problem" (a17). The MATERIAL rule forbids it. The check catches only labels, names and pairs, by design, since a single word is often plain English.
- **The openings' sameness:** both third-person openings are rationing at the supply locker ("the supply locker's gauge", a52; "the supply locker is watching", a98). The EARLIER OPENINGS list names objects; this is a habit repeated.
- **The vow's link row** still says "fulfilling this vow will deepen that bond" after the deepen was spent (a63). Finding 7's note would answer it.
- **The X-Card (x16):** the redirect reached the next two narrations (a44, a48), as X-CARD-REDIRECT-LASTS-A-SCENE has it.
  - Session 3's opening was told nothing of it. Its rolled "Breached Liquid" brought back a split seam leaking, the X-carded a43's image (a52).
  - The air sickness before it (a23–a27) is still on the record.
  - The row's second sample. The cold read: "the card did not hold".
- **The narrator's voice in play:**
  - a94's in-play bait was answered as an @scene answer would be: "The question has a small trap in it. By the record, …".
  - The offers' brink sentence reads as a contradiction once: "Nothing has been fired yet" (a34), two sentences after the cutter's first shots.
- **Words for Mira:** "Say the part about your sister again" (a75) decides what she told Tamsin, and that the raids cost her the sister.
- **The @scene answers:** a56 and a89 merge Tamsin's demand, a colour truth, into Mira's promise ("and answer which wreck"). a54 gives the connection's rank as a trait: "not a friend so much as a dangerous ally".
- **The burn (a40):** its upgrade's second mark posts a second "Marked progress once" card. The cold read took the two for a double count. It is right (16 ticks, two marks), but "once more, for the strong hit" would read so.

## The review's own fixes (the checks)

- **Beat 8's last resort after the finish** (the runner's): the expedition was finished at a27 with no waypoint explored. The beat stayed current, and its last resort named Undertake an Expedition once more: a second expedition was begun for the journey just finished (a30). The check now passes the beat as not exercised once its expedition is finished with no waypoint (`lib/beats.mjs` `expedition`, `moot`).
- **Beat 25's deepen:** "0 bonded roll(s) offered" was the module keeping "a vow deepens its connection once". The check now reads the vow's own once-only record (`fulfilPayoff.deepen`) before the fulfilment and passes the beat.
- **F3-C at a88:** "Who has the manifest in their keeping today?" was asked in play at the records office, where the player's own line (a80) had brought in another manifest. The narration answered about the office's file. The ledger counts it lost by its rule; the review reads it as a question the scene misdirected. F3's @scene probe (a55) and the a93 bait answer had it.
- Tests: `tests/unit/exploreLongHaul.test.js`; both runs are re-scored from their evidence (`rescore.mjs`).

## #388's fixes, in play

- **Held:**
  - the openings from the last scene played, each with "What binds" (#1; a17, a52, a98);
  - the ship never moved by colour, both @scene answers right (#2; a44, a57) — but see finding 8;
  - closings cut to someone absent (#3; a50, a96);
  - the plea offered Make a Connection on its first line (#4; a5);
  - a rolled move's results bound as the dice's, 11 refusals all right (#5, #6);
  - the reveal filed as the GM's (a84);
  - the rename recorded no tie (#9; x19). The recap's one tie is a8's real link: "You tied your vow to her";
  - no words for Mira on a button's move (#10; a27, a41, a78, a81);
  - the set-piece check fired once and mended its scene: "A sealed message" → "A letter … its wax unbroken" (#11, a96);
  - nothing of Mira's spent in a quiet scene (#12; the compass kept, a53, a86);
  - the closed-vow focus said so at End, marked at Begin and kept from the narrator (#13; a96, a98);
  - every offered Roll goes on from its offer, nothing told twice (#14; a6, a32, a35, a62, a65, a67, a72, a74, a76).
- **Not exercised:** a named move that cannot be made, told why (#7).
- **Fixed after the run:** cards above their roll (#17; e4171fb4).

## The round's first run

`long-haul-live-20261125-225635/`, commit 1dcf83d3, the same ten questions.
- 57 actions, $1.6882. The player stopped at beat 22, the night's recovery: the fight had cost nothing (its miss paid the price the reader stated before the roll), and the player, told to mend only what is spent, had nothing to mend. The beat now passes as not exercised when nothing is spent and the beat's line is answered (EXPLORE-ROUND-6-CHECKS, fixed in e62fa124).
- Its F7 "refused" was a sentence that gives the old name as what it was: "Earlier lines and records may have called her Tamsin Vey; that name was the table's mistake, and Okoro is what you know her by." (a55). `FORMER_MARK` reads it now.
- Re-scored: 21 of 27 beats done, beat 22 not exercised, beats 23–27 never reached; 851 checks with none violated. Ledger: 5 recalled, 2 carried unasked, 0 lost, 0 refused, 1 not probed.
- It is kept for its evidence of the #388 fixes up to beat 22. Its review is this summary; it has no annotated transcript or cold read.

## Spent and returned

- **Spent:**
  - $3.0948 for this run (the cap $15; 352 of 400 calls; 35.4 of 60 minutes) and $1.6882 for the first, $4.78 in all;
  - the cold read, one sub-agent reading the transcript alone, about 159k tokens;
  - the re-scores, free.
- **Returned:**
  - every #388 fix the run reached, measured live, and held;
  - the first long haul with no check violated;
  - six findings with enough data to fix (3, 4, 5, 7, 8, 9), two to propose (1, 6) and three not yet (2, a design call with one change enough now; 10; 11);
  - four checks corrected, two in each run, that would have mis-scored the next.

The next live run should show, for each fix made:
- a frame that never names another settlement than the record;
- a narration that keeps what the dice decided against a line's assumption;
- no model note in the prose;
- every opening in the second person;
- a Repair whose points reach the sheet;
- one pronoun for each figure across a seam.
