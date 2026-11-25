# Long haul, fourth live run — action items

Run `test/ci/playwright/explorations/long-haul-live-20261124-213912/` (commit 67d8155d), the first after issue #380's module fixes, the readers on Sonnet 5.5, the session record (#382) and session set-pieces built from oracle rolls (#381). Given thirteen questions first. 89 actions, 334 model calls, 33.2 minutes, **$2.8641**. Beats: 21 of 27 done, 0 failed, 6 not exercised (2, 3, 19, 22, 23, 24). Mechanics: 1200 checks, 1 violated (a41, `answered-once`). Ledger: 5 recalled, 1 carried unasked, 0 lost, 0 refused, 1 not planted. Reviewed by the cold-read procedure (`rules/ci-e2e.md`): a cold read of the transcript alone first, then every step annotated against the evidence.

**In short.** The connection chain was lost again — this time to the runner's GM rule, which confirmed Tamsin's entity draft as the character's connection (a bond with no Make a Connection), with the readers then booking every plea for a tie as Develop Your Relationship. The recovery beat asked to heal and restock with nothing to recover: the module rightly offered nothing, told the player nothing, and the narrator invented the wound. A milestone was offered for a claim the story had just refuted. Session 3's refrain survived the scene-question fix by a new route. The recap built from the session record held far better than run 3's (2 unsupported sentences of 64, against 14), but 13 of its 64 sentences tell the dice. Most of the round's fixes held where the run exercised them (listed at the end). The runner and charter faults cost the most and are the cheapest to fix: another live long haul is not worth buying before they are.

Worst first. Each finding: the quotes with step ids, the cause as far as the code or a prompt shows it, whose it is, and whether there is enough data to fix it.

## 1. CONNECTION-MADE-BY-CONFIRMING-A-DRAFT — the GM's rule made Tamsin a connection, then talk filled her track

**What happened:**
- **a4:** "◈ New Entities Detected [⬡ Connection] Tamsin Vey … ✓ Confirmed", then "Mira Kestrel: Added Tamsin Vey". The GM's rules logged: "confirmed the draft for Tamsin Vey, as the player character's connection".
- **a5–a8:** "I want someone on these docks I can come back to … Will you be that?" → "Develop Your Relationship no action roll". The same at a6 and a7, and at a8, where the last resort "I set out to make a connection with Tamsin Vey" also became Develop.
- **a12:** the a11 card's Roll button → Develop. The track went 0 → 10 boxes.
- **Beat 2:** "not reached in 8 actions — Tamsin Vey has a card and a bond Item; make_a_connection has not been rolled". **Beats 3, 19, 23, 24:** "it needs beat 2, which was not done".

**Cause:**
- **The runner, proximately.** `lib/gm.mjs` `startGmRules` (~205) presses `[data-actor-id="${pcId}"]`, the draft card's "whose connection? → Mira Kestrel" button, which on a person's row adds a bond Item (issue #354 P2-16; "No one" records the person with no bond). `lib/beats.mjs` `connectionMade` still wants `make_a_connection` rolled, which that road can never give. The rehearsal's scripted reader rolls Make a Connection even on an existing connection, so the free rehearsal could not show it.
- **The charter.** Beats 3, 19 and 23 need beat 2, and 24 needs 23: they are gated on the roll, not on the connection. The vow card offered "🤝 For a connection? … Tamsin Vey · Link" from a5, and the track was full at a12.
- **The module's readers.** Told "Connections: 'Tamsin Vey' (dangerous, relationship 0 of 10 boxes)", they rightly refused Make a Connection, even when it was named (a8) — but wrongly booked each plea for a tie as Develop. The game's Develop Your Relationship lists seven deeds (a vow sworn in their service, a quest completed for them, their help in desperate straits, something of worth given, a profound moment shared, standing with them against hardship, a test overcome); asking is none of them. The readers' catalogue paraphrases Develop as "When you deepen a connection" (`interpreter.js` ~104; `classifier.js` ~347), and rule 7 says a line that "tests or deepens a relationship" is a move (`interpreter.js` ~175; `classifier.js` ~215–218). At a7 the move reader used the new SOMETHING DONE FOR A CONNECTION wording ("a costly gesture of commitment") for refusing a fee. Make a Connection's paraphrase omits the game's "or give focus to an existing relationship".

**Verdict: enough.** Options: (a) the runner confirms the cast's draft with **No one**; (b) beats 3, 19 and 23 need "a connection exists", not beat 2; (c) the readers' catalogue gives the game's own triggers for both moves; (d) the draft card says when it makes a connection without the move (the maintainer's call). Recommendation: (a) and (b) now, free; (c) measured by the readers' test, with lines asking a known connection for trust (want: talk) and lines giving her something of worth (want: Develop). Proof: a rehearsal on the "No one" road reaching beats 2, 3, 19, 23 and 24, and the readers' test reading the new lines right.

## 2. NOTHING-TO-RECOVER-UNTOLD — nothing to recover: the player is told nothing, and the narrator invents the wound

**What happened:** a62 "Mira pulls the medkit … and starts on the cuts. The antiseptic stings"; a63 "the gash throbs against it"; a69 "The wound has stiffened since the last pass". SITUATION read health 5/5, supply 5/5, spirit 1/5, integrity 4/5; all eight lines (a62–a69) were read NARRATIVE — "Health is 5 of 5 and Mira is not wounded … no move is offered" — with no card and no line for the player. The summary at a87 says "Mira tended her wounds with the medkit".

**Cause:** **the module** — HEAL-ROLLED-AT-FULL-HEALTH's fix (the readers and `router.js` `nothingToRecover`) tells no one; the narrator gets only "a line that sets about one of those has begun it, and the move that decides it is still to be made" (`narratorPrompt.js` ~3350–3356), and narrates the premise as real. **The charter** — beat 22's "treat your wounds … or restock" came when what had been spent was spirit (5 → 1, a27/a36) and the ship's integrity (5 → 4, a41); its `wants` list omits Repair.

**Verdict: enough.** Options: (a) the paced narration is told the sheet has nothing to mend; (b) a note card to the speaker; (c) both; (d) aim beat 22 at the sheet (Hearten, Repair, or a seeded wound) and add Repair to its `wants`. Recommendation: (c) and (d). Proof: `scenario-recovery` narrated with no invented wound and the note posted.

## 3. CLAIMED-PROOF-OFFERED-A-MILESTONE — a claim taken as the deed

**What happened:** a70 "I've traced her orders back to the broker who sold the lane schedules. That's the proof I came for." → offered Reach a Milestone; the narration it produced refutes the claim ("Tamsin Vey sold nothing … She'd never have sold it to me."), and its offer line says "*If you want to settle whether your theory holds up against what the pilot knows, that would be Reach a Milestone.*" a72 ("…I'll follow it back to them", a plan) → offered; a74 offered again, its offer line word for word a72's. a73 the named last resort marked 16 ticks. a75 "My word is kept: I have found who is raiding…" → Fulfill Your Vow, scripted 1 and 2 against 4 boxes, a strong hit; the finding is then told after the roll, through a pilot who had said "I never asked who wrote them" (a71).

**Cause:** **the readers (module)** — the new vow-step rule (`classifier.js` ~265–282) reads what the line claims, not what the scene shows, and offers it even for a plan ("A hope, a plan … is no step"); its fulfil rule takes "I have found" as the finding. **The charter** — beat 25 says "say what you have now proved … until the vow holds three boxes … then … your word is kept", with scripted dice; unchanged since run 3.

**Verdict: a fix can be proposed and must be measured.** Options: (a) offer a step only when the recent scene shows it; (b) withdraw the offer when the narration contradicts the claim; (c) the charter's proof line comes after a reveal. Recommendation: (c) now; (a) after a readers'-test arm of supported against refuted claims. Measure: offered or not, by scene.

## 4. REFRAIN-OUTLIVES-THE-QUESTION — refrains outlive the question's lapse

**What happened:** session 3 — "light" in 15 of 30 narrations, 12 running; "second" 14; "dockhand" 13; "second amber light" 9. The light is in 15 of the 17 narrations of play (a60, a64–a75, a79, a85) and in none of the 13 `@scene` answers. The pilot's name-tease: a44, a46 (X-Carded), a54, a60, a62, a63, a64, a66.

**Cause (module):** the question lapsed on time (a65, a69, a73) and was re-set each time on the narrator's own hook, under "set the one the scene turns on now, from the player's latest line" — a65 "Will Mira answer the second hail before the pilot's offer lapses?", a69 "Which channel will Mira answer?", a73 "Who will answer the second hail light?", a85 "Who is on the second hail channel?". `countSceneQuestionBeat` (`narrator.js` ~6487–6508) restarts the count on new wording, and the "do not bring it back" rule (`narratorPrompt.js` ~187–199) is advisory. The frame's situation line keeps the hook either way ("while the pilot's offer and a second hail both wait on the comm"). The light comes from a3's untaken hook: the LASTING swear's TOLD AS puts it into session 1's summary, and it returns from EARLIER SESSIONS at a60. The pilot's tease comes from the a44 frame question, session 2's summary, the opening's "Its last sentence returns to what that leaves open" (`galleyVignette.js` ~237) and a60's question. Run 3's cause stays fixed: no vignette set a question (a20, a54, a89).

**Verdict: a fix can be proposed and must be measured.** Options: (a) a question sharing the lapsed one's subject counts as the same; (b) a new question must share words with the player's line; (c) clear the hook from the situation line on a lapse; (d) the summary tells an untaken hook as an image, or drops it. Recommendation: (a) and (c). Measure: refrains per play narration, `@scene` answers apart.

## 5. STRUCK-NAME-REWRITTEN-AS-THE-NEW-NAME — the struck truth is rewritten to the new name

**What happened:** Session 2's Session Log page: "raider cutter — is named the Cinder Wren (set by a player) … A name was corrected: Cinder Wren (raider cutter). Struck: raider cutter — is named the Cinder Wren"; the same "STRUCK BY THE TABLE — … raider cutter — is named the Cinder Wren" in recap sources at a52 (×2), a76 and a87 and summary sources at a50 (×2) and a52 (×2) — eight prompts. The struck truth was "is named the Ashen Wake"; the narrator's own CORRECTED block is right.

**Cause (module):** `src/record/read.js` `correctNames` (~566–571) applies the name change to each strike's `fact`. Also in the free rehearsal 211946.

**Verdict: enough.** A strike's text stays as struck, with "(now: …)". Proof: a unit test from this run's events.

## 6. VOW-SWORN-UNNAMED-IN-THE-RECORD — the swear names no vow

**What happened:** a76 "It began with a vow: you swore to find the lost colony ship Verity's Hope" — the vow sworn at a3 was the raids vow; Verity's Hope is the seeded background vow (the cold read took it for an invention; it is the runner's seed). Session 1's summary: "swore an Iron Vow to hunt the one she seeks".

**Cause (module):** the record line is "[s1-4] … Swear an Iron Vow (+heart), weak hit — LASTING: a vow sworn" (`phrasing.js` `moveText` omits the target), and no `vow.sworn` event reached the record — no prompt in the run, nor in the rehearsal, holds "swore the vow"; `sheetWatch.js` `onCreateItem` should record the vow Begin a Session's dialog makes; why it did not is not traced. [now-2] lists Verity's Hope first.

**Verdict: enough for the line; the cause must be traced.** `moveText` names a vow move's target; a test that Begin's dialog vow reaches the record (free, by rehearsal).

## 7. RECAP-TELLS-THE-DICE — the recap repeats the dice

**What happened:** 13 of 64 recap sentences name an outcome — a18 "it landed as a weak hit"; a52 three, among them "Your search near the wreck missed"; a76 "on a miss"; a87 seven, among them "again a weak hit", "landed a strong hit". About a dozen read sheet numbers aloud. Other table words: "The record opens…", "at the table", "rated dangerous".

**Cause (module):** the record's lines use `phrasing.js` `OUTCOMES`, and `RECAP_SOURCES_RULE` (`narratorPrompt.js` ~1205) says "Every sentence restates what a line it cites states", with no outcome-word rule.

**Verdict: a fix can be proposed and must be measured.** Give the recap role the move roles' outcome-word rule and "tell what happened, not the dice or the numbers". Baseline: 13 of 64 with outcome words, about 12 with numbers.

## 8. SHIP-POSITION-AND-FRAME-DISAGREE — the ship is docked and off the station at once

**What happened:** a34 "the station takes hold of her with a hard clunk"; a38 (the charter's line) "drops out of the dark off Bleakhold's ring"; a41 the frame becomes "…in open space off the lock"; a59 "docked at Bleakhold Station, though the scene frame has her off the station"; a65 "still off the station, so the market is a short hop away"; a81, a85 "docked".

**Cause:** **the module** — SHIP POSITION ("docked at Bleakhold Station") and the frame's Where (under BINDING TRUTHS) are both shown and never reconciled, and nothing undocked the ship. **The charter** — the fight line comes right after docking.

**Verdict: a fix can be proposed and must be measured.** Name the ship's position canonical for where the ship is; a fight begun while docked undocks it. Measure: location contradictions per session.

## 9. HELD-RESULT-NARRATED-AFTER-THE-NEXT-LINE — the a41 violation

**What happened:** a38 Enter the Fray missed and was held; a40 "⚔ Begin the fight" did not keep it; a41's attack line kept it, so its narration (told with a38's line) was posted after a41's line — "You are a half-beat late … A lance of light rakes…" — and then the Clash narrated the failure again: "The turn is too tight and too late…".

**Cause:** **the module, by design** — issue #362 D5's keepers do not include the fight card's Begin; **the runner** — the player skipped Keep against its note; **the check** — `answered-once` (`lib/mechanics.mjs` ~400) excludes a burn's re-narration (`upgradeOf`) but not a kept held result's narration, which carries an earlier roll's `resolutionId`.

**Verdict: enough.** Begin the fight keeps its Enter the Fray; `answered-once` tells a kept result apart. Proof: a rehearsal that presses Begin without Keep. (The run is not re-scored: the player did read the miss twice, after its next line.)

## 10. FRAME-REASONING-IN-PROSE — the frame's reasoning written as story

**What happened:** a15 "You are no longer at Tamsin's stall, so the manifest is not where you left it. Tamsin takes the folded pages…"; a65 "The Kobayashi IV is still off the station, so the market is a short hop away"; a59 "the scene frame has her off the station".

**Cause (module):** the frame's Where sits under "ACTIVE SCENE — BINDING TRUTHS … must not diverge"; the charter's fixed lines create the conflicts.

**Verdict: a fix can be proposed and must be measured.** The frame's Where and Now follow a line that moves the scene. Measure: reconciliation sentences per session.

## 11. CHOSEN-COST-NEVER-TOLD — a cost chosen after the narration is never told

**What happened:** a26–a27 "Endure Stress (-2) Spirit: 5 → 3"; a35–a36 "Spirit: 3 → 1". No narration follows either pick, and Mira is never shown shaken.

**Cause (module):** COST-NARRATED-BEFORE-IT-IS-CHOSEN's "not done" half: nothing narrates the pick.

**Verdict: enough.** The next narration is told the cost just paid.

## 12. TRACK-TOLD-AS-A-BOND — a full track called a bond, and rank read as danger

**What happened:** recaps at a52, a76, a87 "that bond now stands…"; a56 "the one you have a bond with; it stands at full strength"; a78 "bonded with, but she is recorded as dangerous"; a83 "Your bonded friend". No bond was ever forged.

**Cause (module):** the narrator's CHARACTER line is "Connections: Tamsin Vey (dangerous, progress 10/10)" (`narratorPrompt.js` ~3816, `formatTrackDetail`), which adds "bonded" only when completed; the readers' SITUATION says "— full, no bond forged yet".

**Verdict: enough.** The narrator uses the SITUATION's wording, and rank is glossed as the relationship's difficulty.

## 13. SET-PIECES-SHAPED-BY-THEIR-PROMPT — the set-pieces share the shape their prompts dictate; the oath is fixed stock

**What happened:** shared words fell (openings 8–17%, closings 2–10%, against run 3's higher figures), but every closing ends on a thing put down ("put the flask back" a18, "left coin under the bowl" a52, "dropped it in the drum" a87); the openings each handle an object with a count and end still ("a third time" a20, "fifth time" a54, "third confession" a89); the oath scene is the same image in all four live long hauls ("press your palm flat against the … bulkhead … the words low"); six rolled results are written as their own word (apparition a2, memory a18, makeshift lair a20, protection a52, surrendering and preserved a89); two are not recognisable (Investigate Dream a20, Shrouded Battleground a52); "Surrender Crime" invented misdeeds (a89).

**Cause (module):** the closing prompt's "It stops when the small thing is done, or put down." (`endSessionVignette.js` ~270); the opening's "Its last sentence returns to what that leaves open … Nothing new happens" (`galleyVignette.js` ~237, ~254); the oath prompt "In this world, vows are sworn upon iron. Write 2-3 sentences…" (a3, no material).

**Verdict: a fix can be proposed and must be measured.** Roll the ending's shape and drop "or put down"; count results written as their own word; build the oath from material.

## 14. OPENING-CONTRADICTS-WHERE-IT-STOPPED

**What happened:** a20, told "You walk the dock, and nobody follows" and "no time is skipped to move them", opens aboard with the fee slip Mira left on the counter (a7), against its own recap ("you left the slip where it lay"); a89, told "someone finally answers it", writes "The second amber light blinks over her shoulder". a54 was exact.

**Verdict: not yet.** Two samples; read the next run's three openings.

## 15. RECORD-VIEW-SMALLER — three smaller defects in the record's views

(a) option ids printed as choices ("chose “enum”" / "chose “any”" / "chose “fray”" in Session Log pages and recap/summary sources: 10, 8 and 9 prompts; in the free rehearsal too) — `gmRelay.js` `recordChoice` records the option id. (b) scenes labelled where they ended (session 2's opening, the cockpit, filed under "A new scene — Bleakhold Station docking ring") — `read.js` ~364 overwrites `scene.where`, which `sessionLogView.js` ~160–162 uses as the label. (c) a87's summary cites "Asked the narrator…" beats [3], [4], [31] as facts, against its rule "A question asked of the narrator is not an event". **Verdict:** enough for (a) and (b); (c) to measure.

## 16. EXPLORE-ROUND-4-RUNNER — the runner's own faults

(a) the LAST RESORT note is re-offered every turn ("this once you may name the move" at a64, a66, a68 — three named lines; `lib/beats.mjs` `brief()` never records it was used); (b) the stray-roll alert is blind to no-roll moves (Develop at a5–a7 never reaches `st.rolled`); (c) the player skipped Keep (a38) and the "Which vow advances?" picker (a71), both on screen; (d) the move-name counter misses "waypoint" (a29); (e) the checks — `answered-once` counts a kept held result (a41); the refrain share counts `@scene` answers (`lib/review.mjs` `refrainsOf`): session 3's 15 of 30 is 15 of 17 play narrations; "Plain lines" counts beat 22's right nothing-to-recover readings as misses. **Verdict: enough.** Each has a small fix.

## 17. NAMED-MOVE-OFFERED-NOT-ROLLED (a33)

"I set a course for Bleakhold Station." was offered, not rolled ("at dial 6 with high move density, offer set_a_course rather than forcing a roll"), against `classifier.js`'s "A LINE THAT NAMES ITS MOVE ASKS FOR IT … at any dial". **Verdict: not yet** — add a readers'-test line where a move is named after dense moves.

## 18. REWARD-TEXT-CUT-MID-WORD (a2)

"installed on your ship by a grateful" and "sell their p" — `rewards.js` ~80 `slice(0, 120)`. Runs 3 and 4. **Verdict: enough** — cut at a word boundary, or ask for shorter descriptions.

## 19. Smaller observations

- **ORACLE-RECONCILES-NOTHING (a50)** — told to bring the scene into line only "Where RECENT NARRATION said otherwise", the narrator wrote "The earlier silence was only the cargo bulkhead", though nothing had said otherwise. Not yet.
- **END-FOCUS-ON-A-FULFILLED-VOW (a87, a89)** — End a Session took the fulfilled vow as the quest focus (the player typed it) and paid +1 momentum. Not yet.
- **BEGIN-CARD-BEFORE-ITS-OWN-VOW (a2)** — the card says "No character has a vow in play … swear an iron vow" while its own dialog swears one (it is composed before the vow is made). Enough.
- **DRAFT-CARDS-FOR-ONE-SHIP (a41, a46, a60, a65)** — "The Ashen Wake", "Ashen Wake" and "Cinder Wren": three pending drafts for one ship; "Bleakhold Dockhand" proposed as a connection. Enough — match drafts without the article; carry a correction to a pending draft.
- **The corrected name in the next fact block (a50)** — one step after `!truth set … Cinder Wren`, the oracle follow-up's fact block copied the scene frame with "Ashen Wake pilot" in `present` and in the question; no prose held the old name after a49.
- Confirmed again: MEMORY-QUESTIONS-ASKED-AS-PLAY's open half (all four plain questions continued as story; three kept as Chronicle entries — a24, a60, a79); WORLD-TRUTHS-REMINDER-ON-RELOAD (third sample, x13); perspective slips ("Mira pulls the medkit" in second-person narration, a15, a62–a70).

## The round's fixes, in play

**Held:** the readers on Sonnet (decided right almost every time, about +$0.30 a run and +1–2 s a line; the faults are over-reading — Develop at a5–a12 and a16, claims as proof a70–a74, the named move offered at a33); a step toward a vow offered (a70, a72, a74 — see #3); nothing to recover left alone, 8 of 8 (a62–a69 — see #2); `@scene` answered plainly, 16 of 16; the person the player named drafted by her full name (a4); cards after their roll (a41–a44, a75; still above: the expedition cards a25/a31, Develop a5–a12, Reach a Milestone); the oracle's YES honoured (a50); the vow's fulfilment says the name is unknown (a75); no outcome words in narration (the a32 match told as its twist; not in recaps — #7); the recap 2 of 64 sentences unsupported against 14 (#6, #7 new); the galley and food only where rolled (a2), openings sharing 8–17%; closings 2–10%, never the one before; the spotlight narrated as a cutaway (a2); no fight narrated before begun (a38–a40); no cost narrated before chosen (a25, a34 — its other half #11); a name written once; the name note in the opening (a54); no recap at the first Begin (a2); the last session in full at each start (a20, a54, a89); truths on their beat; the round-3 runner fixes.

**Not held:** the refrains (run 3's cause fixed, a new route — #4).

**Not exercised:** a favour to a connection (none done — the wording over-reached, a7, a16); a corrected name's short form (none used); the stale expedition label (the waypoint missed, so "2/10" was right, a31); a rename; a bond.

## Spent and returned

$2.8641 (334 calls). The cold read and the annotation read the run; the findings above. What the run could have shown for nothing: #5 and the option ids (#15a) were in the free rehearsal 211946 already. Where the next dollar should go: none on another long haul until #1, #2, #3 (charter part), #9 and #16 are fixed — they are free to fix and cost this run six beats; then the scenario suite's first live run, beat by beat, before a fifth long haul.
