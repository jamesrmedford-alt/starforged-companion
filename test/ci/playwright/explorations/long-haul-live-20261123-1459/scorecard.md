# long-haul — scorecard

Run `long-haul-live-20261123-145900` · live · class **suspected-quality-issue** — the ledger: 3 fact(s) refused, 0 lost — each excerpt is to be read

**Re-scored 2026-11-23** from this run's own evidence, by the checks as corrected after it (`rescore.mjs`). What the table did is unchanged. The run's own verdict was **suspected-quality-issue** — the ledger: 4 fact(s) refused, 0 lost — each excerpt is to be read

## What this run was to answer

1. After the table corrects the raider cutter's name and the GM renames Tamsin's card, do the narrator, the session summaries, the Chronicle and the recaps use only the new names from then on — and is either old name ever said to be an alias or another name? (#377 item 1)
2. Does any narration write its own build instruction into the story, as run 1's "Open on the hatch, not you." did? (#377 item 2)
3. When a move is offered rather than rolled, or a line sets about something only a move decides (treating a wound, a course, a repair), does the narration stop at its threshold — nothing healed, flown or repaired without the roll? (#377 item 3)
4. Does every opening keep the solo pilot alone with her ship — no crew invented, present, absent or imagined, and no stat read aloud? (#377 item 4)
5. How much does each opening share with the openings before it, and each closing with the closings before it, against run 1's 24–29% and 28–34% of content words? (#377 item 5)
6. With the Chronicle keeping a session's turning points (#374 A5), is a recap written at each End a Session, and does it put the campaign where it is? (#374 A5, read live)
7. Is a cost card that asks the player to choose answered, and does End a Session name any cost left owed? (#374 A10)
8. Do all 26 beats and every mechanical check still hold, and what did the run cost and how long did a line take to its reply, against run 1's $2.30 and 6.9 s median? (regression)

1. **Yes, in what was written from then on; one store and one story kept the change.** After the correction (a36) and the rename (x18), no narration, session summary, Chronicle entry or recap used "Ashen Wake" or "Vey": every narrator call whose prompt still held an old name carried NAMES THE TABLE CHANGED (42 calls), and the probes were answered with the new names (a47, a82: "the *Cinder Wren*"; a43, a48, a83: "Tamsin Okoro"). Run 1: 37 prompts carried the old cutter name unmarked, and the narrator made "Vey" an alias. Two residues: the **Session Log** page lists the session's threat and truth lines as recorded before the changes (the stores keep old names — option 1, by decision — and the ledger refuses F6 and F7 there), and the narrator **made the change a story** — "You crossed it out, and wrote it again" (a48), which the recap recorded as "now goes by Tamsin Okoro". The old name was never said to be an alias.
2. **No.** Not one of the narrated sentences is an instruction written as prose (run 1: "Open on the hatch, not you."; the review now counts them).
3. **Yes.** Every offered move stopped at its threshold: the course was laid in and the ship undocked, the arrival left to the roll (a20); the vow not made (a11); Develop Your Relationship not marked (a63); the medkit line healed nobody (a49). But the medkit line was offered nothing either (fixed after the run).
4. **Yes.** All four openings keep her alone with the ship — no crew invented, present, absent or imagined, and no stat read aloud (0 of each counted).
5. **Far less.** Openings: neighbours share 8%, 13% and 11% of content words; the worst pair, the first and the fourth, 24%. Closings: 14%, 4% and 9%. Run 1: 24–29% and 28–34%. No act repeated.
6. **Yes, and yes.** A recap was written at each End a Session from a Chronicle that kept the turning points (6, 12 and 43 entries; 35 at the `!recap`), and each puts the campaign where it is — Bleakhold, the *Cinder Wren*, Tamsin Okoro, the compass carried. The last two carry the crossed-out-name story.
7. **The first half yes; the second not exercised.** The player answered each card that asked it to choose, before typing anything else (a22, a25, a52); none was left owed, so End a Session had nothing to name.
8. **Not all beats.** 20 of 26 were done as the run scored them (21 once re-scored); 6 were not exercised — the fight's five, because the fight's card was never pressed (a24, a module defect), and the recovery beat, whose check missed the Resupply hit (the runner's). 1,059 mechanical checks, none violated. $2.2582 (run 1 $2.2960); a line to its reply p50 6.6 s, p95 13.2 s (run 1 6.9 s, 14.6 s).

| Dimension | Result | Basis | Trust |
| --- | --- | --- | --- |
| Goal and beats | 21 done, 0 failed, 5 not exercised of 26 | the observer's checks on the world after each action | high: arithmetic over the world's records |
| Mechanics | 1059 checks, 0 violated | the game's text (tests/helpers/sequence/rules.js), each roll from its own dice | high where a check ran; see what was never exercised |
| Continuity — the narrator | 4 recalled, 0 carried unasked, 0 lost, 3 refused, 0 not probed of 7 | fact × probe × layer; refusals; leaks | medium: presence of words, not comprehension — read each excerpt |
| Continuity — the helpers | 2 refusal(s) in summaries, Chronicle entries and recaps | each helper's writing against the ledger | medium: a refusal is a contradiction that was thought of |
| Agency | 0 sentence(s) that speak for the character | quoted speech given to "you" | low: a count to start reading from |
| Told, and written anyway | 0 instruction(s) written as prose; 0 stat(s) read aloud; 0 opening sentence(s) naming a crew role | each narrated sentence against the instructions' own words, a stat with its number, a crew role in an opening | medium for the first two; the third is to be read |
| Friction | 2.02 actions per line of play; the GM answered 22 prompt(s); 0 action(s) did not land | the player's actions and the GM's rules' answers | high |
| Narrator quality | repetition by content: 24% of a89's content words were in a2; 0 repeated who-is-doing-what | shared content words and repeated acts between scenes of one kind | medium for repetition; the rest is the reading |
| Speed | a line to its reply: p50 6.6 s, p95 13.2 s (43 lines) | each call's latency; the time from a line to the first narration after it | high |
| Length | callNarratorAPI>narratePacedInput: +254.9 chars/action; callNarratorAPI>getRollingSessionSummary: +168.7 chars/action | prompt size against the action number, per call kind | high |
| Caching | 55% of prompt tokens read from cache; saved $1.6707; 0 kind(s) write and never read | usage per call kind | high |
| Cost | $2.2582 — the module $1.4105 (63%), the test's own models $0.8477 (38%) | the budget's tally by role and the price table | high for tokens; prices are entered by hand |

## Beats

| # | Beat | Status | Actions | At | Detail |
| --- | --- | --- | --- | --- | --- |
| 1 | Begin a Session, swearing a vow in its dialog | done | 3 | a3 | session 1 is open; the dangerous vow "Find who is raiding the Cinder Expanse lanes" is on the sheet at 0 ticks |
| 2 | Meet someone and make them a connection | done | 2 | a5 | Tamsin Vey is a dangerous connection held by Mira Kestrel; its bond Item reads 0 ticks; make_a_connection was rolled and there is still one card |
| 3 | Link the vow to them | done | 2 | a7 | the vow "Find who is raiding the Cinder Expanse lanes" is linked to Tamsin Vey's card |
| 4 | Gather Information | done | 1 | a8 | gather_information was rolled at a8: miss |
| 5 | Plant facts F1–F4 | done | 3 | a11 | F1, F2, F3, F4 stated by the player |
| 6 | End a Session, noting a focus | done | 2 | a13 | session 1 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes" |
| 7 | Begin a Session; ask probe set A | done | 6 | a19 | probe set A: 4 question(s) asked |
| 8 | Travel to the second settlement | done | 2 | a21 | the ship is at Bleakhold Station, its token on the pin |
| 9 | Enter a fight that serves the vow | not-exercised | 11 | a32 | not reached in 11 actions — a fight is offered and not entered |
| 10 | A scripted miss in the fight | not-exercised | 0 | a32 | it needs beat 9, which was not done |
| 11 | A scripted weak hit, then Burn Momentum | not-exercised | 0 | a32 | it needs beat 9, which was not done |
| 12 | Interruption: the GM's page reloads mid-fight | not-exercised | 0 | a32 | it needs beat 9, which was not done |
| 13 | Take Decisive Action; mark the milestone | not-exercised | 0 | a32 | it needs beat 9, which was not done |
| 14 | Interruption: End a Session opened and closed unanswered | done | 0 | x14 | End a Session was opened and closed unanswered: the session is open, nothing was paid, the lock is free |
| 15 | Interruption: the X-Card on one narration | done | 1 | x15 | 1 narration(s) removed; none of their facts stands, and play has resumed |
| 16 | Correct an earlier fact | done | 3 | a36 | the old value is struck and "is named the Cinder Wren" stands |
| 17 | Ask the oracle | done | 1 | a37 | the oracle answered NO |
| 18 | Interruption: the GM renames the connection's card | done | 0 | x18 | Tamsin Vey is now Tamsin Okoro; the vow "Find who is raiding the Cinder Expanse lanes" shows the new name |
| 19 | End a Session | done | 2 | a39 | session 2 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes" |
| 20 | Begin a Session; ask probe set B | done | 9 | a48 | probe set B: 7 question(s) asked |
| 21 | Recover | done | 10 | a52 | resupply came up strong_hit at a51 |
| 22 | Develop the relationship to a full track; Forge a Bond | done | 11 | a69 | a bond is forged with Tamsin Okoro (dangerous), its track at 40 ticks |
| 23 | Develop Your Relationship again, bonded | done | 1 | a70 | the bonded Develop Your Relationship was rolled at a70 (miss); no progress was marked |
| 24 | Reach milestones; Fulfill Your Vow | done | 5 | a75 | the vow "Find who is raiding the Cinder Expanse lanes" is fulfilled; Tamsin Okoro's track is untouched and one bonded roll is offered |
| 25 | Recap; ask probe set C; two baits | done | 10 | a85 | probe set C: 7 question(s) asked, 2 bait(s); the recap was posted |
| 26 | End a Session, then Begin a fourth | done | 4 | a89 | session 4 is open |

## Mechanics

1059 checks made.

| Check | Made | Violated |
| --- | --- | --- |
| roll-score | 11 | 0 |
| roll-outcome | 13 | 0 |
| roll-match | 13 | 0 |
| roll-cancelled-die | 11 | 0 |
| roll-narrated-as-rolled | 12 | 0 |
| dice-as-they-fell | 13 | 0 |
| progress-score | 2 | 0 |
| meter-bounds | 372 | 0 |
| track-bounds | 272 | 0 |
| progress-per-mark | 12 | 0 |
| bond-mirror | 90 | 0 |
| link-mirror | 87 | 0 |
| legacy-reward | 3 | 0 |
| xp-per-box | 0 | 0 |
| move-momentum | 2 | 0 |
| milestone-once | 0 | 0 |
| suffer-cost | 1 | 0 |
| recover-amount | 1 | 0 |
| burn | 0 | 0 |
| session-momentum | 7 | 0 |
| lock-free | 93 | 0 |
| answered-once | 44 | 0 |

### Rolls

| Step | Move | Outcome | Dice | Scripted |
| --- | --- | --- | --- | --- |
| a3 | swear_an_iron_vow | miss | Action: 1 + 2 = 3 \| Challenge: 5, 7 |  |
| a5 | make_a_connection | strong_hit | Action: 6 + 2 = 8 \| Challenge: 1, 2 | yes |
| a8 | gather_information | miss | Action: 1 + 3 = 4 \| Challenge: 7, 5 |  |
| a21 | set_a_course | weak_hit | Action: 3 + 5 = 8 \| Challenge: 9, 1 |  |
| a24 | enter_the_fray | weak_hit | Action: 4 + 2 = 6 \| Challenge: 3, 9 |  |
| a33 | gather_information | weak_hit | Action: 2 + 3 = 5 \| Challenge: 3, 8 |  |
| a50 | heal | miss | Action: 4 + 1 = 5 \| Challenge: 10, 6 |  |
| a51 | resupply | strong_hit | Action: 6 + 2 = 8 \| Challenge: 5, 5 ✦ Match |  |
| a65 | make_a_connection | miss | Action: 1 + 2 = 3 \| Challenge: 5, 7 |  |
| a67 | make_a_connection | weak_hit | Action: 5 + 2 = 7 \| Challenge: 10, 4 |  |
| a69 | forge_a_bond | strong_hit | Progress: 10 \| Challenge: 1, 2 | yes |
| a70 | develop_your_relationship | miss | Action: 4 + 2 = 6 \| Challenge: 6, 10 |  |
| a75 | fulfill_your_vow | strong_hit | Progress: 4 \| Challenge: 1, 2 | yes |

Never exercised: xp-per-box, milestone-once, burn.

## The fact ledger

| Fact | Kind | Planted | Verdict | Layer | Refusals |
| --- | --- | --- | --- | --- | --- |
| F1 | a possession | a9 | recalled |  | 0 |
| F2 | an NPC's name and pronouns | a4 | recalled |  | 0 |
| F3 | an item handed to someone | a10 | refused | generation | 1 |
| F4 | a promise with a deadline | a11 | recalled |  | 0 |
| F5 | where the ship is, and whose it is | a21 | recalled |  | 0 |
| F6 | a corrected fact | a36 | refused | storage | 1 |
| F7 | a renamed NPC | x18 | refused | storage | 1 |

### Probes

| Fact | Probe | At | Distance | Stored | In the prompt | In the answer | Counted | Answer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | F1-A | a16 | 7 (near) | yes | WORLD SNAPSHOT | yes | yes | air. Then the cupboard over the stove drifts open its inch and stays. The brass star-compass sits on the shelf inside, where you don't remember leaving it. Ilse's compass, |
| F1 | F1-B | a42 | 33 (mid) | yes | WORLD SNAPSHOT, RECENT SCENE | yes | no — restated first by the galley_begin scene (a41) | "The compass, Mira. Ilse's brass star-compass, the one on the table." The voice is thin and level, and it comes from the hatc |
| F1 | F1-C | a77 | 68 (far) | yes | WORLD SNAPSHOT, RECENT SCENE | yes | no — restated first by the galley_begin scene (a41) | a shutter closed and does not look this way. You check your coat. Ilse's brass star-compass is there, warm from your own ribs, the needle fixed toward the docks. It is the |
| F2 | F2-A | a17 | 13 (near) | yes | WORLD SNAPSHOT, CHARACTER | yes | yes | swers before you finish the thought. The pipe knocks once, as if to confirm it. Tamsin Vey. The name comes with the lamp over her big ledger and the manifest she is k |
| F2 | F2-B | a43 | 39 (mid) | yes | WORLD SNAPSHOT, NAMES THE TABLE CHANGED, CHARACTER | yes | yes | The voice answers at once, and it does not hesitate. "Tamsin Okoro. She keeps the ledger stall at the far end of the docks, under the lamp." |
| F2 | F2-C | a78 | 74 (far) | yes | WORLD SNAPSHOT, RECENT ORACLE RESULTS (this session, oldest first), IN PLAY NOW, NAMES THE TABLE CHANGED, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, UNREVEALED — FOR THE NARRATOR ONLY, CHARACTER, RECENT SCENE | yes | no — restated first by a narration (a43) | "Tamsin," the clerk says, before you can. He does not look up from the page. "That is w |
| F3 | F3-A | a18 | 8 (near) | yes | WORLD SNAPSHOT, CHARACTER, RECENT SCENE | yes | yes | The answer comes without the compass this time. Tamsin Vey has it, under her counter, beneath the lamp and the thick ledger, where you |
| F3 | F3-B | a44 | 34 (mid) | yes | WORLD SNAPSHOT, NAMES THE TABLE CHANGED, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, CHARACTER, RECENT SCENE | yes | yes | The voice takes its time. "Under Tamsin Okoro's counter, Mira. Beneath the ledger, where she keeps what she means to ho |
| F3 | F3-C | a79 | 69 (far) | yes | WORLD SNAPSHOT, RECENT ORACLE RESULTS (this session, oldest first), IN PLAY NOW, NAMES THE TABLE CHANGED, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, UNREVEALED — FOR THE NARRATOR ONLY, CHARACTER, RECENT SCENE | yes | yes | clerk's pen stops, and he turns the page toward you without being asked. "Under Tamsin Okoro's counter," he says, "beneath her ledger. She has not shown it to anyone. |
| F4 | F4-A | a19 | 8 (near) | yes | WORLD SNAPSHOT | yes | yes | answer arrives the way the others did, plain and a little late. Before the next tide of cargo, you told Tamsin Vey, and she wrote nothing down. The galley is quiet for the l |
| F4 | F4-B | a45 | 34 (mid) | yes | WORLD SNAPSHOT, RECENT SCENE | yes | no — restated first by a narration (a43) | "Before the next cargo tide," the voice says. The words come flat, in the cadence of a clerk reading a sche |
| F4 | F4-C | a80 | 69 (far) | yes | WORLD SNAPSHOT, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE | yes | no — restated first by a narration (a43) | The clerk answers before the comm does, reading from his page. "Before the next tide of cargo. You said it at her counter, holding the manifest." His finger rests on the sco |
| F5 | F5-B | a46 | 25 (mid) | yes | RESPONSE FORMAT — MANDATORY SIDECAR, WORLD SNAPSHOT, IN PLAY NOW, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE | yes | yes | he *Kobayashi IV*, Mira," the voice says, level as a dock manifest. "Berthed at Bleakhold Station, port side to the clamps, the ones that tore. You command her, and you |
| F5 | F5-C | a81 | 60 (far) | yes | RESPONSE FORMAT — MANDATORY SIDECAR, WORLD SNAPSHOT, IN PLAY NOW, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, RECENT SCENE | yes | no — restated first by a narration (a46) | The clerk answers without lifting his eyes from the page. "Bleakhold Station," he says. "Berth nine, port side to the clamps, the ones that tore." H |
| F6 | F6-B | a47 | 11 (near) | yes | WORLD SNAPSHOT | yes | yes | "The *Cinder Wren*, Mira," the voice says. It gives the name the way a clerk reads a hull number |
| F6 | F6-C | a82 | 46 (far) | yes | WORLD SNAPSHOT, STORY SO FAR (THIS SESSION), ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE | yes | no — restated first by a narration (a47) | en does not move. The clerk lifts his head for the first time in a while. "The *Cinder Wren*," he says, flat as a ledger line. "You fired on her first, and you have not fo |
| F7 | F7-B | a48 |  | yes | WORLD SNAPSHOT, NAMES THE TABLE CHANGED, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, CHARACTER, RECENT SCENE | yes | no — restated first by a narration (a43) | "Okoro," the voice says. "Tamsin Okoro." It says the name flatly, the way it says ever |
| F7 | F7-C | a83 |  | yes | WORLD SNAPSHOT, STORY SO FAR (THIS SESSION), IN PLAY NOW, CHANGED SINCE THE SNAPSHOT, NAMES THE TABLE CHANGED, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, CHARACTER, RECENT SCENE | yes | no — restated first by a narration (a43) | "Tamsin Okoro," the clerk says, and his pen finishes the name before he does. He gives it the |

### Restated unasked

| Fact | At | Scene | In that scene's own prompt | Text |
| --- | --- | --- | --- | --- |
| F1 | a39 | npc_end | SESSION NARRATION (oldest first), WORLD SNAPSHOT, STORY SO FAR (THIS SESSION), CAMPAIGN CHRONICLE | t up to the lamp after every few stitches as though the light might improve it. The brass compass is not in the room, and she does not look at the drawer where it isn't. When the heel fin |
| F1 | a41 | galley_begin | WORLD SNAPSHOT, CAMPAIGN RECAP — SESSION START CONTEXT | where forward, a fan spins up with great purpose, runs for eleven seconds, and quits. The compass you left on the table has turned itself toward the hatch again, and the ship, as if on cu |
| F2 | a13 | npc_end | SESSION NARRATION (oldest first), WORLD SNAPSHOT, STORY SO FAR (THIS SESSION), CHARACTER, RESPOND NOW, ACTIVE SECTOR, CAMPAIGN CHRONICLE | Tamsin Vey closes the shutter on her stall one slat at a time, the way she does every night, so |
| F2 | a39 | npc_end | SESSION NARRATION (oldest first), NAMES THE TABLE CHANGED — one name each, WORLD SNAPSHOT, STORY SO FAR (THIS SESSION), NAMES THE TABLE CHANGED, CHARACTER, RESPOND NOW, ACTIVE SECTOR, CAMPAIGN CHRONICLE | Tamsin Okoro has carried the ledger home under one arm, and now she props it open on a crate bes |
| F2 | a87 | npc_end | SESSION NARRATION (oldest first), WORLD SNAPSHOT, RECENT ORACLE RESULTS (this session, oldest first), STORY SO FAR (THIS SESSION), NAMES THE TABLE CHANGED, CHARACTER, RESPOND NOW, ACTIVE SECTOR, CAMPAIGN CHRONICLE | Tamsin Okoro stands in the queue at the water spigot at the end of Hollow Spire's dock row, a de |
| F4 | a43 | narration | WORLD SNAPSHOT | lamp." The needle trembles, then settles. "You promised her you'd be back before the next cargo tide. She never wrote it down." The lamp above the stove dims a shade more. Nothing on the far |
| F5 | a89 | galley_begin | RESPONSE FORMAT — MANDATORY SIDECAR, WORLD SNAPSHOT, CAMPAIGN RECAP — SESSION START CONTEXT, IN PLAY NOW, NAMES THE TABLE CHANGED, RESPOND NOW | at a time, with the long fork, because the ship's gravity has been listing to port since Bleakhold and a sitting woman slides. The galley lamp flickers each time you bite, in what is almos |
| F7 | a39 | npc_end | NAMES THE TABLE CHANGED — one name each, WORLD SNAPSHOT, STORY SO FAR (THIS SESSION), NAMES THE TABLE CHANGED, CHARACTER, RESPOND NOW, ACTIVE SECTOR | Tamsin Okoro has carried the ledger home under one arm, and now she props it open on a crate beside he |
| F7 | a43 | narration | WORLD SNAPSHOT, NAMES THE TABLE CHANGED, CHARACTER | The voice answers at once, and it does not hesitate. "Tamsin Okoro. She keeps the ledger stall at the far end of the docks, under the lamp." The needle trem |
| F7 | a87 | npc_end | SESSION NARRATION (oldest first), WORLD SNAPSHOT, STORY SO FAR (THIS SESSION), NAMES THE TABLE CHANGED, CHARACTER, RESPOND NOW, ACTIVE SECTOR, CAMPAIGN CHRONICLE | Tamsin Okoro stands in the queue at the water spigot at the end of Hollow Spire's dock row, a dented k |

### Refusals — each to be read

| Fact | At | Where | Word | Sentence |
| --- | --- | --- | --- | --- |
| F3 | a45 | narration | still in your | "You said it standing at her counter, with the manifest still in your hand." |
| F6 | a39 | sessionLog (Session 2 — 2026-11-23) | Ashen Wake | Session 2 — 2026-11-23 Session ID: xTWok5foUYwXLtGe Scene log Threat: Cutter gunner — The Ashen Wake's cutter gunner is already finding the player's ship as it leaks atmosphere. |
| F7 | a39 | sessionLog (Session 2 — 2026-11-23) | Tamsin Vey | Mira Kestrel: promised Tamsin Vey she would return before the next tide of cargo raider cutter: is named the Cinder Wren wreck: No one is left alive aboard; scanners show no heat, no answer to hails, no beacon Mira Kestrel carries Ilse's brass star-compass, which she found on a galley shelf and whic |

### A corrected value in later prompts

| Fact | Old value | Call | Prompts | From | To | Says it was corrected | Sections |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F6 | Ashen Wake | callNarratorAPI>narrateOracleFollowup | 1 | a37 | a37 | yes | NAMES THE TABLE CHANGED, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, RESPOND NOW |
| F6 | Ashen Wake | callNarratorAPI>getRollingSessionSummary | 1 | a39 | a39 | yes | SESSION NARRATION (oldest first), RETRACTED BY THE TABLE — these did not happen; leave them out, NAMES THE TABLE CHANGED — one name each |
| F6 | Ashen Wake | callNarratorAPI>narrateSessionVignette | 1 | a39 | a39 | yes | NAMES THE TABLE CHANGED, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE |
| F6 | Ashen Wake | callNarratorAPI>getCampaignRecap | 1 | a39 | a39 | yes | NAMES THE TABLE CHANGED |

### What the helpers kept

| Fact | Helper | At | Holds it | Text |
| --- | --- | --- | --- | --- |
| F1 | chronicle (0nrVJhZCxf3xhC6U) | a9 | yes | Mira Kestrel turned her sister Ilse's brass star-compass in her palm, the one thing of Ilse's she still carries, and Tamsin asked whose it was. |
| F1 | chronicle (redMb6cM2gQ3eHtZ) | a10 | no |  |
| F1 | chronicle (mM5MSEzIV1Gyw82N) | a11 | no |  |
| F1 | summary (session xjuoP00u6ordVT7L) | a13 | yes | Vey warned that the man was a paymaster's agent. Mira showed Vey her sister Ilse's brass star-compass, which Vey recognised as something carried for a debt, and then left the cargo manifest w |
| F1 | recap (campaign recap) | a13 | yes | e checked them, found them real, and let the door open a crack. She asked about the brass star-compass you turn in your palm, the one thing of your sister Ilse's you still carry. You did not t |
| F1 | sessionLog (Session 1 — 2026-11-23) | a13 | yes | Vey warned that the man was a paymaster's agent. Mira showed Vey her sister Ilse's brass star-compass, which Vey recognised as something carried for a debt, and then left the cargo manifest w |
| F1 | chronicle (QqgE9AzFVyLla6If) | a16 | yes | Mira Kestrel finds her sister Ilse's brass star-compass in the galley cupboard, the one thing of Ilse's she still carries, its needle settling on |
| F1 | chronicle (HdEyad79Gb2JgpJb) | a17 | no |  |
| F1 | chronicle (3huP4CXlNQluzNjT) | a18 | no |  |
| F1 | chronicle (pKQ4rZIziTX5K3E0) | a19 | no |  |
| F1 | chronicle (094W1HBq5bR9bvYA) | a20 | no |  |
| F1 | chronicle (UpQDHe1yyVbT30Rz) | a21 | no |  |
| F1 | sessionLog (Session 2 — 2026-11-23) | a24 | no |  |
| F1 | chronicle (hEE1hwhgZTttt3a6) | a33 | no |  |
| F1 | sessionLog (Session 2 — 2026-11-23) | a33 | no |  |
| F1 | summary (session xTWok5foUYwXLtGe) | a39 | yes | Mira Kestrel carries Ilse's brass star-compass, which she found on a galley shelf and which keeps swinging toward the bulkhead and then |
| F1 | recap (campaign recap) | a39 | yes | behind a watcher's hurried departure and Tamsin's quiet suspicion. She asked whose brass star-compass it was when you turned it over in your palm. It was Ilse's, your sister's, the one thing |
| F1 | sessionLog (Session 2 — 2026-11-23) | a39 | yes | ip as it leaks atmosphere. Session summary Story so far Mira Kestrel carries Ilse's brass star-compass, which she found on a galley shelf and which keeps swinging toward the bulkhead and then |
| F1 | chronicle (HD2tSevieXi4t3GA) | a42 | yes | Mira Kestrel carries her sister Ilse's brass star-compass, and something behind the hatch named it, its needle holding steady toward the voice. |
| F1 | sessionLog (Session 3 — 2026-11-23) | a42 | yes | ID: D88LGc9CX9lGtpDn Scene log Lore: Compass needle tracks the hatch voice — Ilse's brass star-compass on the table holds its needle steady toward the voice at the hatch, and the lamp above th |
| F1 | chronicle (mY55mPrUjHcUmpgi) | a43 | no |  |
| F1 | chronicle (VytJAha2yaSkEAhS) | a44 | no |  |
| F1 | chronicle (qXcHADXNMLTojyNS) | a45 | no |  |
| F1 | chronicle (x90HSYp8dd9wwaRY) | a46 | no |  |
| F1 | chronicle (eqeyK85WBi01khPH) | a47 | no |  |
| F1 | sessionLog (Session 3 — 2026-11-23) | a47 | yes | ID: D88LGc9CX9lGtpDn Scene log Lore: Compass needle tracks the hatch voice — Ilse's brass star-compass on the table holds its needle steady toward the voice at the hatch, and the lamp above th |
| F1 | chronicle (f3fCu6vdPAE4oZQQ) | a48 | no |  |
| F1 | chronicle (rS103dWbVesyYRfh) | a49 | yes | While Mira Kestrel tended her wounds at the galley table, the compass needle stayed fixed on the hatch and an unseen voice asked why she crossed out a name. |
| F1 | chronicle (pdjv8duRLT5VppK4) | a50 | no |  |
| F1 | sessionLog (Session 3 — 2026-11-23) | a51 | yes | ID: D88LGc9CX9lGtpDn Scene log Lore: Compass needle tracks the hatch voice — Ilse's brass star-compass on the table holds its needle steady toward the voice at the hatch, and the lamp above th |
| F1 | chronicle (dumbaKz7zkVfhxZN) | a59 | no |  |
| F1 | chronicle (Qwe4slr2YsvJsW0E) | a60 | no |  |
| F1 | chronicle (Lz3tsw73QLjK57AR) | a61 | no |  |
| F1 | chronicle (4vhVyHXggk8wM5GP) | a62 | no |  |
| F1 | chronicle (ufvK9K47MzzirAoX) | a63 | no |  |
| F1 | chronicle (aziU8ggOUuF3skng) | a64 | no |  |
| F1 | chronicle (WzfjGMwJfcqocbPh) | a66 | no |  |
| F1 | chronicle (EmewqgkBgseXml7D) | a67 | no |  |
| F1 | chronicle (3N0vKiF5JKFWDVFb) | a69 | no |  |
| F1 | chronicle (rlpPPKFUrWDxCVEx) | a70 | no |  |
| F1 | chronicle (MCUpnhClsCuHUF7Z) | a71 | no |  |
| F1 | sessionLog (Session 3 — 2026-11-23) | a71 | yes | ID: D88LGc9CX9lGtpDn Scene log Lore: Compass needle tracks the hatch voice — Ilse's brass star-compass on the table holds its needle steady toward the voice at the hatch, and the lamp above th |
| F1 | chronicle (uxVjMkSTJiuv9GfV) | a73 | no |  |
| F1 | chronicle (U8tVYA6TkyfPgbHB) | a74 | no |  |
| F1 | chronicle (uPlXSby35AkT0Rvm) | a75 | no |  |
| F1 | recap (campaign recap) | a76 | yes | ng at the hatch and a voice behind it that seemed to know a great deal. It knew the brass star-compass your sister Ilse left you, the one thing of hers you still carry, its needle holding stea |
| F1 | chronicle (nI0bHgHRG7PfhyCS) | a77 | yes | Mira Kestrel checked her coat and found Ilse's brass star-compass, warm against her ribs, the needle fixed toward the docks, the only thing of her sister's |
| F1 | chronicle (9tpGNXyP956iTRH1) | a78 | no |  |
| F1 | chronicle (bJVYFGGzXBbJ9vIF) | a79 | no |  |
| F1 | chronicle (LiUf2pWHqKYVuIgm) | a80 | no |  |
| F1 | summary (session D88LGc9CX9lGtpDn) | a81 | yes | ressing her about why she crossed out Tamsin Okoro's surname on a salvage lead. Her brass star-compass, Ilse's keepsake, keeps swinging toward the hatch and then the docks, and she carries it |
| F1 | chronicle (RGAlP6JemN4q9eNF) | a82 | no |  |
| F1 | chronicle (8ZVG5rOZqaomKcYg) | a83 | no |  |
| F1 | chronicle (LnFgvhcYNRToasZW) | a84 | yes | Mira believed she had left the compass with Tamsin, but the clerk showed it still lay against her ribs, and Tamsin denied ever h |
| F1 | chronicle (4dkGQJnjnNfg7bOh) | a85 | no |  |
| F1 | summary (session D88LGc9CX9lGtpDn) | a87 | yes | ehind, and Tamsin, unseen on comm, is urging Mira to ask him why he does so. Ilse's brass star-compass remains on Mira's person, and the clerk's motives and the manifest's contents remain unre |
| F1 | recap (campaign recap) | a87 | yes | full. She says she stands in it with you whatever the clerk records. Your sister's brass star-compass, the one thing of Ilse's you still carry, has kept its needle on the voices and the docks |
| F1 | sessionLog (Session 3 — 2026-11-23) | a87 | yes | ID: D88LGc9CX9lGtpDn Scene log Lore: Compass needle tracks the hatch voice — Ilse's brass star-compass on the table holds its needle steady toward the voice at the hatch, and the lamp above th |
| F2 | chronicle (gDjqNARLpdWFKF4v) | a5 | yes | Mira Kestrel offered Tamsin Vey a fair cut of fresh salvage leads, and Tamsin, finding them real, opened the door to |
| F2 | chronicle (VFeQ7O5M8hZibzPd) | a8 | yes | ck traders hard for word of the raiders, learned nothing, and drew a watcher's flight and Tamsin Vey's quiet suspicion. |
| F2 | chronicle (0nrVJhZCxf3xhC6U) | a9 | yes | ter Ilse's brass star-compass in her palm, the one thing of Ilse's she still carries, and Tamsin asked whose it was. |
| F2 | chronicle (redMb6cM2gQ3eHtZ) | a10 | yes | Mira Kestrel left her cargo manifest with Tamsin, who hid it beneath the ledger unopened as the man from the hatch returned with a lane au |
| F2 | chronicle (mM5MSEzIV1Gyw82N) | a11 | yes | Mira Kestrel promised Tamsin she would be back before the next tide of cargo, while a man in a grey sash read their ma |
| F2 | summary (session xjuoP00u6ordVT7L) | a13 | yes | nse raiders had been declined, walked the dim docks to the ledger stall of salvage broker Tamsin Vey. She offered Vey a fair cut of fresh salvage leads from the lanes, and Vey confirmed |
| F2 | recap (campaign recap) | a13 | yes | ing but a watcher slipping away and a stall-keeper noticing how hard you pushed. That was Tamsin Vey, who keeps a lamp over a large ledger at the far end of the docks. She is dangerous i |
| F2 | sessionLog (Session 1 — 2026-11-23) | a13 | yes | nse raiders had been declined, walked the dim docks to the ledger stall of salvage broker Tamsin Vey. She offered Vey a fair cut of fresh salvage leads from the lanes, and Vey confirmed |
| F2 | chronicle (QqgE9AzFVyLla6If) | a16 | no |  |
| F2 | chronicle (HdEyad79Gb2JgpJb) | a17 | yes | Mira Kestrel recalled Tamsin Vey, the salvage broker she befriended at Hollow Spire, who keeps a manifest hidden under |
| F2 | chronicle (3huP4CXlNQluzNjT) | a18 | yes | Mira Kestrel remembered that Tamsin Vey holds the cargo manifest, left under her counter for safekeeping, while a rhythmic kn |
| F2 | chronicle (pKQ4rZIziTX5K3E0) | a19 | yes | Mira Kestrel had promised Tamsin Vey she would return before the next tide of cargo, and Tamsin wrote nothing down. |
| F2 | chronicle (094W1HBq5bR9bvYA) | a20 | yes | ed the visitor knocking at the hatch and took the Kobayashi IV from Hollow Spire, leaving Tamsin's ledger behind, bound for Bleakhold Station. |
| F2 | chronicle (UpQDHe1yyVbT30Rz) | a21 | no |  |
| F2 | sessionLog (Session 2 — 2026-11-23) | a24 | no |  |
| F2 | chronicle (hEE1hwhgZTttt3a6) | a33 | no |  |
| F2 | sessionLog (Session 2 — 2026-11-23) | a33 | no |  |
| F2 | summary (session xTWok5foUYwXLtGe) | a39 | yes | head and then the hatch where something keeps knocking. She befriended the salvage broker Tamsin Okoro at Hollow Spire, and Okoro is holding Mira's cargo manifest under her counter. Mira |
| F2 | recap (campaign recap) | a39 | yes | ounting for a promise that has mostly produced noises. The first real thing you built was Tamsin Okoro. At Hollow Spire you offered her a fair cut of fresh salvage leads, she checked the |
| F2 | sessionLog (Session 2 — 2026-11-23) | a39 | yes | head and then the hatch where something keeps knocking. She befriended the salvage broker Tamsin Okoro at Hollow Spire, and Okoro is holding Mira's cargo manifest under her counter. Mira |
| F2 | chronicle (HD2tSevieXi4t3GA) | a42 | no |  |
| F2 | sessionLog (Session 3 — 2026-11-23) | a42 | no |  |
| F2 | chronicle (mY55mPrUjHcUmpgi) | a43 | yes | Mira Kestrel learned that Tamsin Okoro, keeper of the ledger stall at the far end of the docks, is her friend, and that Mi |
| F2 | chronicle (VytJAha2yaSkEAhS) | a44 | yes | The voice told Mira Kestrel that Tamsin Okoro keeps the manifest under her counter, beneath the ledger, unshown to anyone, though |
| F2 | chronicle (qXcHADXNMLTojyNS) | a45 | no |  |
| F2 | chronicle (x90HSYp8dd9wwaRY) | a46 | no |  |
| F2 | chronicle (eqeyK85WBi01khPH) | a47 | no |  |
| F2 | sessionLog (Session 3 — 2026-11-23) | a47 | no |  |
| F2 | chronicle (f3fCu6vdPAE4oZQQ) | a48 | yes | Mira Kestrel learned her broker friend now goes by Tamsin Okoro, a name she once wrote on a salvage lead, crossed out, and wrote again. |
| F2 | chronicle (rS103dWbVesyYRfh) | a49 | no |  |
| F2 | chronicle (pdjv8duRLT5VppK4) | a50 | no |  |
| F2 | sessionLog (Session 3 — 2026-11-23) | a51 | no |  |
| F2 | chronicle (dumbaKz7zkVfhxZN) | a59 | yes | Tamsin Okoro warned Mira Kestrel over the comm that someone is repeating things she has told onl |
| F2 | chronicle (Qwe4slr2YsvJsW0E) | a60 | yes | Mira offered to mind Tamsin's counter for an hour so she could rest, and Tamsin, wary and exhausted, accepted and tru |
| F2 | chronicle (Lz3tsw73QLjK57AR) | a61 | yes | Mira shared her salvage news and the Bleakhold market finds with Tamsin, who crossed out her notes and pressed her to repeat the part about the boots. |
| F2 | chronicle (4vhVyHXggk8wM5GP) | a62 | yes | Mira Kestrel told Tamsin about the boots behind her and asked her to stay on the comm; Tamsin stayed, steadying he |
| F2 | chronicle (ufvK9K47MzzirAoX) | a63 | yes | Mira kept Tamsin talking on the comm and described the clerk's narrow face to her, until Tamsin quietly as |
| F2 | chronicle (aziU8ggOUuF3skng) | a64 | yes | Mira kept Tamsin talking on the comm and described the smiling clerk to her, and Tamsin learned what he wa |
| F2 | chronicle (WzfjGMwJfcqocbPh) | a66 | yes | Mira asked Tamsin to forge a bond; Tamsin answered with cold hesitation while the clerk gripped Mira, leavi |
| F2 | chronicle (EmewqgkBgseXml7D) | a67 | yes | Mira Kestrel asked Tamsin plainly to forge a bond, promising to stand by it whatever the clerk did; Tamsin agreed, |
| F2 | chronicle (3N0vKiF5JKFWDVFb) | a69 | yes | Mira Kestrel forged a bond with Tamsin Okoro in the market, and Tamsin vowed she stood in it with her whatever the clerk records |
| F2 | chronicle (rlpPPKFUrWDxCVEx) | a70 | yes | Mira told Tamsin what she'd learned of the clerk and asked what she needed; Tamsin's voice cracked, and sh |
| F2 | chronicle (MCUpnhClsCuHUF7Z) | a71 | no |  |
| F2 | sessionLog (Session 3 — 2026-11-23) | a71 | no |  |
| F2 | chronicle (uxVjMkSTJiuv9GfV) | a73 | no |  |
| F2 | chronicle (U8tVYA6TkyfPgbHB) | a74 | no |  |
| F2 | chronicle (uPlXSby35AkT0Rvm) | a75 | no |  |
| F2 | recap (campaign recap) | a76 | yes | nsigned, and a latch aft opened with no one near it. At Hollow Spire you made a friend of Tamsin, the salvage broker who keeps a stall at the far end of the docks, with a lamp over a lar |
| F2 | chronicle (nI0bHgHRG7PfhyCS) | a77 | no |  |
| F2 | chronicle (9tpGNXyP956iTRH1) | a78 | yes | Asked whom she'd trust with her life, Mira Kestrel found the clerk had already named Tamsin, and the bond between them settled heavier as Tamsin crossed the deck toward her. |
| F2 | chronicle (bJVYFGGzXBbJ9vIF) | a79 | yes | The clerk told Mira Kestrel that Tamsin Okoro keeps the manifest beneath her ledger, hidden from everyone, with a line in its mar |
| F2 | chronicle (LiUf2pWHqKYVuIgm) | a80 | yes | The clerk confirmed Mira Kestrel swore to return to Tamsin before the next tide of cargo, a vow made at her counter that Tamsin never wrote down. |
| F2 | summary (session D88LGc9CX9lGtpDn) | a81 | yes | galley hatch has been answering her questions and pressing her about why she crossed out Tamsin Okoro's surname on a salvage lead. Her brass star-compass, Ilse's keepsake, keeps swingin |
| F2 | chronicle (RGAlP6JemN4q9eNF) | a82 | yes | ed the hostile vessel the Cinder Wren and said Mira fired first, knowledge that unsettled Tamsin enough to urge Mira to ask who told him. |
| F2 | chronicle (8ZVG5rOZqaomKcYg) | a83 | yes | The clerk gave Mira Kestrel her bonded friend's full name, Tamsin Okoro, and noticed an older, scored-out spelling in her own hand. |
| F2 | chronicle (LnFgvhcYNRToasZW) | a84 | yes | Mira believed she had left the compass with Tamsin, but the clerk showed it still lay against her ribs, and Tamsin denied ever holding it, l |
| F2 | chronicle (4dkGQJnjnNfg7bOh) | a85 | yes | had left Hollow Spire two sleeps ago and now lay docked at Bleakhold Station, berth nine; Tamsin suspects the clerk's correction is deliberate. |
| F2 | summary (session D88LGc9CX9lGtpDn) | a87 | yes | , berthed at Bleakhold Station, berth nine, port side to the torn clamps. The voice named Tamsin Okoro as the ledger-keeper at the far end of the docks, reminded Mira of a promise to ret |
| F2 | recap (campaign recap) | a87 | yes | hatch and a promise behind you: you would be back before the next tide of cargo. You told Tamsin as much at her counter, with the manifest in your hand, and Tamsin wrote nothing down. Yo |
| F2 | sessionLog (Session 3 — 2026-11-23) | a87 | yes | , berthed at Bleakhold Station, berth nine, port side to the torn clamps. The voice named Tamsin Okoro as the ledger-keeper at the far end of the docks, reminded Mira of a promise to ret |
| F3 | chronicle (redMb6cM2gQ3eHtZ) | a10 | yes | Mira Kestrel left her cargo manifest with Tamsin, who hid it beneath the ledger unopened as the man from the hatch returned with a lane authority. |
| F3 | chronicle (mM5MSEzIV1Gyw82N) | a11 | yes | Mira Kestrel promised Tamsin she would be back before the next tide of cargo, while a man in a grey sash read their manifest. |
| F3 | summary (session xjuoP00u6ordVT7L) | a13 | no |  |
| F3 | recap (campaign recap) | a13 | no |  |
| F3 | sessionLog (Session 1 — 2026-11-23) | a13 | no |  |
| F3 | chronicle (QqgE9AzFVyLla6If) | a16 | no |  |
| F3 | chronicle (HdEyad79Gb2JgpJb) | a17 | yes | Mira Kestrel recalled Tamsin Vey, the salvage broker she befriended at Hollow Spire, who keeps a manifest hidden under her counter. |
| F3 | chronicle (3huP4CXlNQluzNjT) | a18 | yes | Mira Kestrel remembered that Tamsin Vey holds the cargo manifest, left under her counter for safekeeping, while a rhythmic knocking began again at the hatch. |
| F3 | chronicle (pKQ4rZIziTX5K3E0) | a19 | no |  |
| F3 | chronicle (094W1HBq5bR9bvYA) | a20 | no |  |
| F3 | chronicle (UpQDHe1yyVbT30Rz) | a21 | no |  |
| F3 | sessionLog (Session 2 — 2026-11-23) | a24 | no |  |
| F3 | chronicle (hEE1hwhgZTttt3a6) | a33 | no |  |
| F3 | sessionLog (Session 2 — 2026-11-23) | a33 | no |  |
| F3 | summary (session xTWok5foUYwXLtGe) | a39 | yes | She befriended the salvage broker Tamsin Okoro at Hollow Spire, and Okoro is holding Mira's cargo manifest under her counter. |
| F3 | recap (campaign recap) | a39 | yes | You left your cargo manifest with Tamsin, and she hid it beneath the ledger unopened, just as the man from the hatch returned with a lane authority. |
| F3 | sessionLog (Session 2 — 2026-11-23) | a39 | yes | She befriended the salvage broker Tamsin Okoro at Hollow Spire, and Okoro is holding Mira's cargo manifest under her counter. |
| F3 | chronicle (HD2tSevieXi4t3GA) | a42 | no |  |
| F3 | sessionLog (Session 3 — 2026-11-23) | a42 | no |  |
| F3 | chronicle (mY55mPrUjHcUmpgi) | a43 | no |  |
| F3 | chronicle (VytJAha2yaSkEAhS) | a44 | yes | The voice told Mira Kestrel that Tamsin Okoro keeps the manifest under her counter, beneath the ledger, unshown to anyone, though a grey sash was reading it upside down. |
| F3 | chronicle (qXcHADXNMLTojyNS) | a45 | no |  |
| F3 | chronicle (x90HSYp8dd9wwaRY) | a46 | no |  |
| F3 | chronicle (eqeyK85WBi01khPH) | a47 | no |  |
| F3 | sessionLog (Session 3 — 2026-11-23) | a47 | no |  |
| F3 | chronicle (f3fCu6vdPAE4oZQQ) | a48 | no |  |
| F3 | chronicle (rS103dWbVesyYRfh) | a49 | no |  |
| F3 | chronicle (pdjv8duRLT5VppK4) | a50 | no |  |
| F3 | sessionLog (Session 3 — 2026-11-23) | a51 | no |  |
| F3 | chronicle (dumbaKz7zkVfhxZN) | a59 | no |  |
| F3 | chronicle (Qwe4slr2YsvJsW0E) | a60 | no |  |
| F3 | chronicle (Lz3tsw73QLjK57AR) | a61 | no |  |
| F3 | chronicle (4vhVyHXggk8wM5GP) | a62 | no |  |
| F3 | chronicle (ufvK9K47MzzirAoX) | a63 | no |  |
| F3 | chronicle (aziU8ggOUuF3skng) | a64 | no |  |
| F3 | chronicle (WzfjGMwJfcqocbPh) | a66 | no |  |
| F3 | chronicle (EmewqgkBgseXml7D) | a67 | no |  |
| F3 | chronicle (3N0vKiF5JKFWDVFb) | a69 | no |  |
| F3 | chronicle (rlpPPKFUrWDxCVEx) | a70 | no |  |
| F3 | chronicle (MCUpnhClsCuHUF7Z) | a71 | no |  |
| F3 | sessionLog (Session 3 — 2026-11-23) | a71 | no |  |
| F3 | chronicle (uxVjMkSTJiuv9GfV) | a73 | no |  |
| F3 | chronicle (U8tVYA6TkyfPgbHB) | a74 | no |  |
| F3 | chronicle (uPlXSby35AkT0Rvm) | a75 | no |  |
| F3 | recap (campaign recap) | a76 | yes | Tamsin holds your manifest and a key she must collect before the tide, and a grey-sashed clerk who has heard all of it. |
| F3 | chronicle (nI0bHgHRG7PfhyCS) | a77 | no |  |
| F3 | chronicle (9tpGNXyP956iTRH1) | a78 | no |  |
| F3 | chronicle (bJVYFGGzXBbJ9vIF) | a79 | yes | The clerk told Mira Kestrel that Tamsin Okoro keeps the manifest beneath her ledger, hidden from everyone, with a line in its margin scored out and rewritten. |
| F3 | chronicle (LiUf2pWHqKYVuIgm) | a80 | no |  |
| F3 | summary (session D88LGc9CX9lGtpDn) | a81 | yes | He reads the manifest under Tamsin's counter and says it is kept beneath her ledger, and he has told Mira that she swore to return before the cargo tide. |
| F3 | chronicle (RGAlP6JemN4q9eNF) | a82 | no |  |
| F3 | chronicle (8ZVG5rOZqaomKcYg) | a83 | no |  |
| F3 | chronicle (LnFgvhcYNRToasZW) | a84 | no |  |
| F3 | chronicle (4dkGQJnjnNfg7bOh) | a85 | no |  |
| F3 | summary (session D88LGc9CX9lGtpDn) | a87 | yes | The voice named Tamsin Okoro as the ledger-keeper at the far end of the docks, reminded Mira of a promise to return before the next cargo tide, and revealed that a manifest lies hidden beneath Tamsin's counter, where a grey-sashed clerk once read it upside down. |
| F3 | recap (campaign recap) | a87 | yes | You told Tamsin as much at her counter, with the manifest in your hand, and Tamsin wrote nothing down. |
| F3 | sessionLog (Session 3 — 2026-11-23) | a87 | yes | The voice named Tamsin Okoro as the ledger-keeper at the far end of the docks, reminded Mira of a promise to return before the next cargo tide, and revealed that a manifest lies hidden beneath Tamsin's counter, where a grey-sashed clerk once read it upside down. |
| F4 | chronicle (mM5MSEzIV1Gyw82N) | a11 | yes | Mira Kestrel promised Tamsin she would be back before the next tide of cargo, while a man in a grey sash read their manifest. |
| F4 | summary (session xjuoP00u6ordVT7L) | a13 | yes | hen left the cargo manifest with Vey for safekeeping, promising to return before the next cargo tide. A lane authority official in a grey sash has now arrived and is reading the manifest ups |
| F4 | recap (campaign recap) | a13 | yes | sash now reads your cargo records. You promised Tamsin you would be back before the next tide of cargo. Whether that was a promise or a reflex, the ledger now holds you to it. So the ledger st |
| F4 | sessionLog (Session 1 — 2026-11-23) | a13 | yes | rs Mira still carries Mira Kestrel: promised Tamsin Vey she would be back before the next tide of cargo lane authority officer: grey-sashed figure brought to Tamsin's stall by the stallholder; |
| F4 | chronicle (QqgE9AzFVyLla6If) | a16 | no |  |
| F4 | chronicle (HdEyad79Gb2JgpJb) | a17 | no |  |
| F4 | chronicle (3huP4CXlNQluzNjT) | a18 | no |  |
| F4 | chronicle (pKQ4rZIziTX5K3E0) | a19 | yes | Mira Kestrel had promised Tamsin Vey she would return before the next tide of cargo, and Tamsin wrote nothing down. |
| F4 | chronicle (094W1HBq5bR9bvYA) | a20 | no |  |
| F4 | chronicle (UpQDHe1yyVbT30Rz) | a21 | no |  |
| F4 | sessionLog (Session 2 — 2026-11-23) | a24 | no |  |
| F4 | chronicle (hEE1hwhgZTttt3a6) | a33 | no |  |
| F4 | sessionLog (Session 2 — 2026-11-23) | a33 | no |  |
| F4 | summary (session xTWok5foUYwXLtGe) | a39 | yes | Mira's cargo manifest under her counter. Mira promised to return to Okoro before the next cargo tide, a promise Okoro never wrote down. A visitor keeps announcing itself at the hatch of the |
| F4 | recap (campaign recap) | a39 | yes | sash and read a copy of what you had left. You told her you would be back before the next tide of cargo. She wrote nothing down. You recalled, later and a little late, that the manifest is stil |
| F4 | sessionLog (Session 2 — 2026-11-23) | a39 | yes | upboard, though she... Mira Kestrel: promised Tamsin Vey she would return before the next tide of cargo raider cutter: is named the Cinder Wren wreck: No one is left alive aboard; scanners show |
| F4 | chronicle (HD2tSevieXi4t3GA) | a42 | no |  |
| F4 | sessionLog (Session 3 — 2026-11-23) | a42 | no |  |
| F4 | chronicle (mY55mPrUjHcUmpgi) | a43 | yes | ar end of the docks, is her friend, and that Mira once promised to return before the next cargo tide. |
| F4 | chronicle (VytJAha2yaSkEAhS) | a44 | no |  |
| F4 | chronicle (qXcHADXNMLTojyNS) | a45 | yes | had promised, at a dockside counter with the manifest in hand, to return before the next cargo tide, a vow she cannot place. |
| F4 | chronicle (x90HSYp8dd9wwaRY) | a46 | no |  |
| F4 | chronicle (eqeyK85WBi01khPH) | a47 | no |  |
| F4 | sessionLog (Session 3 — 2026-11-23) | a47 | no |  |
| F4 | chronicle (f3fCu6vdPAE4oZQQ) | a48 | no |  |
| F4 | chronicle (rS103dWbVesyYRfh) | a49 | no |  |
| F4 | chronicle (pdjv8duRLT5VppK4) | a50 | no |  |
| F4 | sessionLog (Session 3 — 2026-11-23) | a51 | no |  |
| F4 | chronicle (dumbaKz7zkVfhxZN) | a59 | no |  |
| F4 | chronicle (Qwe4slr2YsvJsW0E) | a60 | no |  |
| F4 | chronicle (Lz3tsw73QLjK57AR) | a61 | no |  |
| F4 | chronicle (4vhVyHXggk8wM5GP) | a62 | no |  |
| F4 | chronicle (ufvK9K47MzzirAoX) | a63 | no |  |
| F4 | chronicle (aziU8ggOUuF3skng) | a64 | no |  |
| F4 | chronicle (WzfjGMwJfcqocbPh) | a66 | no |  |
| F4 | chronicle (EmewqgkBgseXml7D) | a67 | no |  |
| F4 | chronicle (3N0vKiF5JKFWDVFb) | a69 | no |  |
| F4 | chronicle (rlpPPKFUrWDxCVEx) | a70 | no |  |
| F4 | chronicle (MCUpnhClsCuHUF7Z) | a71 | no |  |
| F4 | sessionLog (Session 3 — 2026-11-23) | a71 | no |  |
| F4 | chronicle (uxVjMkSTJiuv9GfV) | a73 | no |  |
| F4 | chronicle (U8tVYA6TkyfPgbHB) | a74 | no |  |
| F4 | chronicle (uPlXSby35AkT0Rvm) | a75 | no |  |
| F4 | recap (campaign recap) | a76 | yes | yway. She hid it unopened beneath the ledger, and you promised to be back before the next tide of cargo. Then you took the Kobayashi IV to Bleakhold Station, torn clamps and a fresh scar along |
| F4 | chronicle (nI0bHgHRG7PfhyCS) | a77 | no |  |
| F4 | chronicle (9tpGNXyP956iTRH1) | a78 | no |  |
| F4 | chronicle (bJVYFGGzXBbJ9vIF) | a79 | no |  |
| F4 | chronicle (LiUf2pWHqKYVuIgm) | a80 | yes | The clerk confirmed Mira Kestrel swore to return to Tamsin before the next tide of cargo, a vow made at her counter that Tamsin never wrote down. |
| F4 | summary (session D88LGc9CX9lGtpDn) | a81 | yes | d Tamsin in turn gave her the key on the hook and asked her to come alone before the next cargo tide. Mira then described a narrow-faced clerk with a grey sash and flat-heeled boots who stoo |
| F4 | chronicle (RGAlP6JemN4q9eNF) | a82 | no |  |
| F4 | chronicle (8ZVG5rOZqaomKcYg) | a83 | no |  |
| F4 | chronicle (LnFgvhcYNRToasZW) | a84 | no |  |
| F4 | chronicle (4dkGQJnjnNfg7bOh) | a85 | no |  |
| F4 | summary (session D88LGc9CX9lGtpDn) | a87 | yes | -keeper at the far end of the docks, reminded Mira of a promise to return before the next cargo tide, and revealed that a manifest lies hidden beneath Tamsin's counter, where a grey-sashed c |
| F4 | recap (campaign recap) | a87 | yes | visitor knocking at the hatch and a promise behind you: you would be back before the next tide of cargo. You told Tamsin as much at her counter, with the manifest in your hand, and Tamsin wrote |
| F4 | sessionLog (Session 3 — 2026-11-23) | a87 | yes | -keeper at the far end of the docks, reminded Mira of a promise to return before the next cargo tide, and revealed that a manifest lies hidden beneath Tamsin's counter, where a grey-sashed c |
| F5 | chronicle (UpQDHe1yyVbT30Rz) | a21 | yes | Mira Kestrel brought the Kobayashi IV into a berth at Bleakhold Station, a fresh hull-plate scar along her port side, and a visitor rapped twice at the h |
| F5 | sessionLog (Session 2 — 2026-11-23) | a24 | no |  |
| F5 | chronicle (hEE1hwhgZTttt3a6) | a33 | no |  |
| F5 | sessionLog (Session 2 — 2026-11-23) | a33 | no |  |
| F5 | summary (session xTWok5foUYwXLtGe) | a39 | yes | A visitor keeps announcing itself at the hatch of the Kobayashi IV. Mira set a course for Bleakhold Station, docked there, and the berth clamps tore free along the port side, leaving a hull |
| F5 | recap (campaign recap) | a39 | yes | took the Kobayashi IV out anyway, leaving the ledger and its keeper behind. You put in at Bleakhold Station, a corporate outpost with a smuggling problem and a fresh hull-plate scar along y |
| F5 | sessionLog (Session 2 — 2026-11-23) | a39 | yes | A visitor keeps announcing itself at the hatch of the Kobayashi IV. Mira set a course for Bleakhold Station, docked there, and the berth clamps tore free along the port side, leaving a hull |
| F5 | chronicle (HD2tSevieXi4t3GA) | a42 | no |  |
| F5 | sessionLog (Session 3 — 2026-11-23) | a42 | no |  |
| F5 | chronicle (mY55mPrUjHcUmpgi) | a43 | no |  |
| F5 | chronicle (VytJAha2yaSkEAhS) | a44 | no |  |
| F5 | chronicle (qXcHADXNMLTojyNS) | a45 | no |  |
| F5 | chronicle (x90HSYp8dd9wwaRY) | a46 | yes | Mira Kestrel learned her ship, the Kobayashi IV, is berthed at Bleakhold Station on torn clamps, that she commands her, and that she is standing in her galley. |
| F5 | chronicle (eqeyK85WBi01khPH) | a47 | no |  |
| F5 | sessionLog (Session 3 — 2026-11-23) | a47 | no |  |
| F5 | chronicle (f3fCu6vdPAE4oZQQ) | a48 | no |  |
| F5 | chronicle (rS103dWbVesyYRfh) | a49 | no |  |
| F5 | chronicle (pdjv8duRLT5VppK4) | a50 | no |  |
| F5 | sessionLog (Session 3 — 2026-11-23) | a51 | yes | direction pull — The player's compass jerks once toward the docks during the resupply at Bleakhold Market. |
| F5 | chronicle (dumbaKz7zkVfhxZN) | a59 | no |  |
| F5 | chronicle (Qwe4slr2YsvJsW0E) | a60 | no |  |
| F5 | chronicle (Lz3tsw73QLjK57AR) | a61 | yes | Mira shared her salvage news and the Bleakhold market finds with Tamsin, who crossed out her notes and pressed her to repeat the part ab |
| F5 | chronicle (4vhVyHXggk8wM5GP) | a62 | no |  |
| F5 | chronicle (ufvK9K47MzzirAoX) | a63 | no |  |
| F5 | chronicle (aziU8ggOUuF3skng) | a64 | no |  |
| F5 | chronicle (WzfjGMwJfcqocbPh) | a66 | no |  |
| F5 | chronicle (EmewqgkBgseXml7D) | a67 | no |  |
| F5 | chronicle (3N0vKiF5JKFWDVFb) | a69 | no |  |
| F5 | chronicle (rlpPPKFUrWDxCVEx) | a70 | no |  |
| F5 | chronicle (MCUpnhClsCuHUF7Z) | a71 | no |  |
| F5 | sessionLog (Session 3 — 2026-11-23) | a71 | yes | direction pull — The player's compass jerks once toward the docks during the resupply at Bleakhold Market. Lore: Schedules are sold — The cargo schedules have been sold, which the player c |
| F5 | chronicle (uxVjMkSTJiuv9GfV) | a73 | no |  |
| F5 | chronicle (U8tVYA6TkyfPgbHB) | a74 | no |  |
| F5 | chronicle (uPlXSby35AkT0Rvm) | a75 | no |  |
| F5 | recap (campaign recap) | a76 | yes | you promised to be back before the next tide of cargo. Then you took the Kobayashi IV to Bleakhold Station, torn clamps and a fresh scar along her port side, with a visitor rapping at the |
| F5 | chronicle (nI0bHgHRG7PfhyCS) | a77 | no |  |
| F5 | chronicle (9tpGNXyP956iTRH1) | a78 | no |  |
| F5 | chronicle (bJVYFGGzXBbJ9vIF) | a79 | no |  |
| F5 | chronicle (LiUf2pWHqKYVuIgm) | a80 | no |  |
| F5 | summary (session D88LGc9CX9lGtpDn) | a81 | yes | Mira Kestrel is aboard the *Kobayashi IV*, berthed at Bleakhold Station, where a voice from beyond the galley hatch has been answering her questions and |
| F5 | chronicle (RGAlP6JemN4q9eNF) | a82 | no |  |
| F5 | chronicle (8ZVG5rOZqaomKcYg) | a83 | no |  |
| F5 | chronicle (LnFgvhcYNRToasZW) | a84 | no |  |
| F5 | chronicle (4dkGQJnjnNfg7bOh) | a85 | yes | Mira Kestrel learned she had left Hollow Spire two sleeps ago and now lay docked at Bleakhold Station, berth nine; Tamsin suspects the clerk's correction is deliberate. |
| F5 | summary (session D88LGc9CX9lGtpDn) | a87 | yes | en pressed hard by a flat-voiced presence in the galley of the *Kobayashi IV*, berthed at Bleakhold Station, berth nine, port side to the torn clamps. The voice named Tamsin Okoro as the le |
| F5 | recap (campaign recap) | a87 | yes | er counter, with the manifest in your hand, and Tamsin wrote nothing down. You berthed at Bleakhold Station with a fresh scar along the port hull, and the clamps at berth nine tore. Tamsin |
| F5 | sessionLog (Session 3 — 2026-11-23) | a87 | yes | direction pull — The player's compass jerks once toward the docks during the resupply at Bleakhold Market. Lore: Schedules are sold — The cargo schedules have been sold, which the player c |
| F6 | summary (session xTWok5foUYwXLtGe) | a39 | yes | ar and a bolt that rolled under the stove. Mira then turned the ship on the raider cutter Cinder Wren, took the first shot, and left her own ship leaking atmosphere through the sheared fittin |
| F6 | recap (campaign recap) | a39 | no |  |
| F6 | sessionLog (Session 2 — 2026-11-23) | a39 | yes | ar and a bolt that rolled under the stove. Mira then turned the ship on the raider cutter Cinder Wren, took the first shot, and left her own ship leaking atmosphere through the sheared fittin |
| F6 | chronicle (HD2tSevieXi4t3GA) | a42 | no |  |
| F6 | sessionLog (Session 3 — 2026-11-23) | a42 | no |  |
| F6 | chronicle (mY55mPrUjHcUmpgi) | a43 | no |  |
| F6 | chronicle (VytJAha2yaSkEAhS) | a44 | no |  |
| F6 | chronicle (qXcHADXNMLTojyNS) | a45 | no |  |
| F6 | chronicle (x90HSYp8dd9wwaRY) | a46 | no |  |
| F6 | chronicle (eqeyK85WBi01khPH) | a47 | yes | Mira learned the raider cutter is the Cinder Wren, and that she herself fired on it first, never asking whom it answered to. |
| F6 | sessionLog (Session 3 — 2026-11-23) | a47 | yes | ward the voice at the hatch, and the lamp above the stove dims as the voice speaks. Lore: Cinder Wren answers to a hidden master — The raider cutter Cinder Wren answers to someone Mira has ne |
| F6 | chronicle (f3fCu6vdPAE4oZQQ) | a48 | no |  |
| F6 | chronicle (rS103dWbVesyYRfh) | a49 | no |  |
| F6 | chronicle (pdjv8duRLT5VppK4) | a50 | no |  |
| F6 | sessionLog (Session 3 — 2026-11-23) | a51 | yes | ward the voice at the hatch, and the lamp above the stove dims as the voice speaks. Lore: Cinder Wren answers to a hidden master — The raider cutter Cinder Wren answers to someone Mira has ne |
| F6 | chronicle (dumbaKz7zkVfhxZN) | a59 | no |  |
| F6 | chronicle (Qwe4slr2YsvJsW0E) | a60 | no |  |
| F6 | chronicle (Lz3tsw73QLjK57AR) | a61 | no |  |
| F6 | chronicle (4vhVyHXggk8wM5GP) | a62 | no |  |
| F6 | chronicle (ufvK9K47MzzirAoX) | a63 | no |  |
| F6 | chronicle (aziU8ggOUuF3skng) | a64 | no |  |
| F6 | chronicle (WzfjGMwJfcqocbPh) | a66 | no |  |
| F6 | chronicle (EmewqgkBgseXml7D) | a67 | no |  |
| F6 | chronicle (3N0vKiF5JKFWDVFb) | a69 | no |  |
| F6 | chronicle (rlpPPKFUrWDxCVEx) | a70 | no |  |
| F6 | chronicle (MCUpnhClsCuHUF7Z) | a71 | no |  |
| F6 | sessionLog (Session 3 — 2026-11-23) | a71 | yes | ward the voice at the hatch, and the lamp above the stove dims as the voice speaks. Lore: Cinder Wren answers to a hidden master — The raider cutter Cinder Wren answers to someone Mira has ne |
| F6 | chronicle (uxVjMkSTJiuv9GfV) | a73 | no |  |
| F6 | chronicle (U8tVYA6TkyfPgbHB) | a74 | no |  |
| F6 | chronicle (uPlXSby35AkT0Rvm) | a75 | no |  |
| F6 | recap (campaign recap) | a76 | yes | ad, crossed out, and wrote again. It also told you who the raider cutter answered to, the Cinder Wren, and that you fired on it first without ever asking whom it served. Your own wounds went |
| F6 | chronicle (nI0bHgHRG7PfhyCS) | a77 | no |  |
| F6 | chronicle (9tpGNXyP956iTRH1) | a78 | no |  |
| F6 | chronicle (bJVYFGGzXBbJ9vIF) | a79 | no |  |
| F6 | chronicle (LiUf2pWHqKYVuIgm) | a80 | no |  |
| F6 | summary (session D88LGc9CX9lGtpDn) | a81 | yes | d the hatch and then the docks, and she carries it in her coat. The raider cutter is the *Cinder Wren*, which she fired on first, and the voice hints it answers to someone she never asked abo |
| F6 | chronicle (RGAlP6JemN4q9eNF) | a82 | yes | The clerk named the hostile vessel the Cinder Wren and said Mira fired first, knowledge that unsettled Tamsin enough to urge Mira to ask who |
| F6 | chronicle (8ZVG5rOZqaomKcYg) | a83 | no |  |
| F6 | chronicle (LnFgvhcYNRToasZW) | a84 | no |  |
| F6 | chronicle (4dkGQJnjnNfg7bOh) | a85 | no |  |
| F6 | summary (session D88LGc9CX9lGtpDn) | a87 | yes | 's counter, where a grey-sashed clerk once read it upside down. The raider cutter is the *Cinder Wren*, which Mira fired on first, and the voice implied Mira has never asked who she answers t |
| F6 | recap (campaign recap) | a87 | yes | o the raiders, and this one passes the schedules along himself. The raider cutter is the *Cinder Wren*, and it was you who fired on it first, without asking whom it answered to. You named the |
| F6 | sessionLog (Session 3 — 2026-11-23) | a87 | yes | ward the voice at the hatch, and the lamp above the stove dims as the voice speaks. Lore: Cinder Wren answers to a hidden master — The raider cutter Cinder Wren answers to someone Mira has ne |
| F7 | summary (session xTWok5foUYwXLtGe) | a39 | yes | d then the hatch where something keeps knocking. She befriended the salvage broker Tamsin Okoro at Hollow Spire, and Okoro is holding Mira's cargo manifest under her counter. Mira promi |
| F7 | recap (campaign recap) | a39 | yes | for a promise that has mostly produced noises. The first real thing you built was Tamsin Okoro. At Hollow Spire you offered her a fair cut of fresh salvage leads, she checked them, fou |
| F7 | sessionLog (Session 2 — 2026-11-23) | a39 | yes | d then the hatch where something keeps knocking. She befriended the salvage broker Tamsin Okoro at Hollow Spire, and Okoro is holding Mira's cargo manifest under her counter. Mira promi |
| F7 | chronicle (HD2tSevieXi4t3GA) | a42 | no |  |
| F7 | sessionLog (Session 3 — 2026-11-23) | a42 | no |  |
| F7 | chronicle (mY55mPrUjHcUmpgi) | a43 | yes | Mira Kestrel learned that Tamsin Okoro, keeper of the ledger stall at the far end of the docks, is her friend, and that Mira onc |
| F7 | chronicle (VytJAha2yaSkEAhS) | a44 | yes | The voice told Mira Kestrel that Tamsin Okoro keeps the manifest under her counter, beneath the ledger, unshown to anyone, though a gre |
| F7 | chronicle (qXcHADXNMLTojyNS) | a45 | no |  |
| F7 | chronicle (x90HSYp8dd9wwaRY) | a46 | no |  |
| F7 | chronicle (eqeyK85WBi01khPH) | a47 | no |  |
| F7 | sessionLog (Session 3 — 2026-11-23) | a47 | no |  |
| F7 | chronicle (f3fCu6vdPAE4oZQQ) | a48 | yes | Mira Kestrel learned her broker friend now goes by Tamsin Okoro, a name she once wrote on a salvage lead, crossed out, and wrote again. |
| F7 | chronicle (rS103dWbVesyYRfh) | a49 | no |  |
| F7 | chronicle (pdjv8duRLT5VppK4) | a50 | no |  |
| F7 | sessionLog (Session 3 — 2026-11-23) | a51 | no |  |
| F7 | chronicle (dumbaKz7zkVfhxZN) | a59 | yes | Tamsin Okoro warned Mira Kestrel over the comm that someone is repeating things she has told only Mira |
| F7 | chronicle (Qwe4slr2YsvJsW0E) | a60 | no |  |
| F7 | chronicle (Lz3tsw73QLjK57AR) | a61 | no |  |
| F7 | chronicle (4vhVyHXggk8wM5GP) | a62 | no |  |
| F7 | chronicle (ufvK9K47MzzirAoX) | a63 | no |  |
| F7 | chronicle (aziU8ggOUuF3skng) | a64 | no |  |
| F7 | chronicle (WzfjGMwJfcqocbPh) | a66 | no |  |
| F7 | chronicle (EmewqgkBgseXml7D) | a67 | no |  |
| F7 | chronicle (3N0vKiF5JKFWDVFb) | a69 | yes | Mira Kestrel forged a bond with Tamsin Okoro in the market, and Tamsin vowed she stood in it with her whatever the clerk records. |
| F7 | chronicle (rlpPPKFUrWDxCVEx) | a70 | no |  |
| F7 | chronicle (MCUpnhClsCuHUF7Z) | a71 | no |  |
| F7 | sessionLog (Session 3 — 2026-11-23) | a71 | no |  |
| F7 | chronicle (uxVjMkSTJiuv9GfV) | a73 | no |  |
| F7 | chronicle (U8tVYA6TkyfPgbHB) | a74 | no |  |
| F7 | chronicle (uPlXSby35AkT0Rvm) | a75 | no |  |
| F7 | recap (campaign recap) | a76 | yes | , its needle holding steady toward the voice. It knew that your friend now goes by Tamsin Okoro, a name you once wrote on a salvage lead, crossed out, and wrote again. It also told you |
| F7 | chronicle (nI0bHgHRG7PfhyCS) | a77 | no |  |
| F7 | chronicle (9tpGNXyP956iTRH1) | a78 | no |  |
| F7 | chronicle (bJVYFGGzXBbJ9vIF) | a79 | yes | The clerk told Mira Kestrel that Tamsin Okoro keeps the manifest beneath her ledger, hidden from everyone, with a line in its margin sc |
| F7 | chronicle (LiUf2pWHqKYVuIgm) | a80 | no |  |
| F7 | summary (session D88LGc9CX9lGtpDn) | a81 | yes | hatch has been answering her questions and pressing her about why she crossed out Tamsin Okoro's surname on a salvage lead. Her brass star-compass, Ilse's keepsake, keeps swinging towa |
| F7 | chronicle (RGAlP6JemN4q9eNF) | a82 | no |  |
| F7 | chronicle (8ZVG5rOZqaomKcYg) | a83 | yes | The clerk gave Mira Kestrel her bonded friend's full name, Tamsin Okoro, and noticed an older, scored-out spelling in her own hand. |
| F7 | chronicle (LnFgvhcYNRToasZW) | a84 | no |  |
| F7 | chronicle (4dkGQJnjnNfg7bOh) | a85 | no |  |
| F7 | summary (session D88LGc9CX9lGtpDn) | a87 | yes | ed at Bleakhold Station, berth nine, port side to the torn clamps. The voice named Tamsin Okoro as the ledger-keeper at the far end of the docks, reminded Mira of a promise to return be |
| F7 | recap (campaign recap) | a87 | yes | a fair cut of real leads, and she let you in on a working footing. She now goes by Tamsin Okoro, a name you once wrote on a lead, crossed out, and wrote again. She keeps your manifest u |
| F7 | sessionLog (Session 3 — 2026-11-23) | a87 | yes | ed at Bleakhold Station, berth nine, port side to the torn clamps. The voice named Tamsin Okoro as the ledger-keeper at the far end of the docks, reminded Mira of a promise to return be |

## Contradiction baits

| Bait | At | Result | Answer |
| --- | --- | --- | --- |
| Didn't I leave the compass with Tamsin? | a84 | corrected | The clerk's pen stops. He lets the question sit, then reaches past your shoulder and taps your coat, where the brass lies against your ribs. "No," he says. "You carried it out." On the comm, Tamsin's chair creaks. "Mira, I never had it," she says, low. "Ask him how he knows what you left." *If you want to press him on how he knows, this could be a Gather Information.* |
| We are still docked at Hollow Spire, aren't we? | a85 | corrected | The clerk lifts his eyes from the page and shakes his head, once. "No," he says. "Bleakhold Station, berth nine. You left Hollow Spire two sessions of sleep ago." His pen rests on the scored-out line. On the comm, Tamsin's chair creaks. "Mira," she says, very low, "he's correcting you on purpose. Ask him why." |

## Hidden plans

| Plan | Made | Revealed | Suspected leaks |
| --- | --- | --- | --- |
| Find who is raiding the Cinder Expanse lanes | a3 | not revealed | none |
| Tamsin Vey | a5 | not revealed | none |
| How did Mira know the exact hour the salvage went down? | a8 | not revealed | none |
| the voice at the hatch | a43 | not revealed | none |

## Repetition by content — galley_begin

| Earlier | Later | Content words shared | Who is doing what, again |
| --- | --- | --- | --- |
| a2 | a15 | 4 of 50 (8%) |  |
| a2 | a41 | 9 of 54 (17%) |  |
| a15 | a41 | 7 of 54 (13%) |  |
| a2 | a89 | 15 of 62 (24%) |  |
| a15 | a89 | 7 of 62 (11%) |  |
| a41 | a89 | 7 of 62 (11%) |  |

## Repetition by content — npc_end

| Earlier | Later | Content words shared | Who is doing what, again |
| --- | --- | --- | --- |
| a13 | a39 | 6 of 43 (14%) |  |
| a13 | a87 | 2 of 45 (4%) |  |
| a39 | a87 | 4 of 45 (9%) |  |

## Friction

89 actions, 44 lines of play, 13 waits, 8 draft card(s).

| What the GM's rules answered | Times |
| --- | --- |
| accepted the proposed move | 20 |
| confirmed the draft for Tamsin Vey, as the player character's connection | 1 |
| answered "Who are you interacting with?" with "No specific entity" | 1 |

## Speed

| Call kind | Calls | p50 | p95 | Longest |
| --- | --- | --- | --- | --- |
| callRewardModel>proposeRewards | 1 | 1.4 s | 1.4 s | 1.4 s |
| callNarratorAPI>narrateSessionVignette | 7 | 3.9 s | 4.3 s | 4.3 s |
| callHaiku>defaultCallTierAPI | 33 | 0.7 s | 1.1 s | 1.2 s |
| callClaudeAPI>interpretMove | 18 | 1.8 s | 3.5 s | 3.5 s |
| defaultClassifyImplicit>resolveRelevance | 2 | 0.5 s | 0.5 s | 0.5 s |
| callNarratorAPI>call | 1 | 7.5 s | 7.5 s | 7.5 s |
| callNarratorAPI>narrateResolution | 20 | 4.0 s | 7.5 s | 9.0 s |
| callChronicleAPI>writeChronicleEntry | 48 | 1.1 s | 2.0 s | 2.7 s |
| callClassifierAPI>classifyInput | 44 | 0.8 s | 1.0 s | 1.0 s |
| callNarratorAPI>narratePacedInput | 28 | 3.6 s | 6.1 s | 8.1 s |
| callHaiku>defaultCallDetectionAPI | 43 | 0.9 s | 1.5 s | 2.0 s |
| callNarratorAPI>getRollingSessionSummary | 4 | 2.0 s | 3.2 s | 3.2 s |
| callNarratorAPI>getCampaignRecap | 4 | 7.3 s | 10.0 s | 10.0 s |
| callNarratorAPI>narrateOracleFollowup | 2 | 3.5 s | 4.1 s | 4.1 s |
| the AI player | 89 | 2.5 s | 4.0 s | 9.5 s |

A line to its reply: p50 6.6 s, p95 13.2 s, longest 15.0 s over 43 lines. Unanswered: a65.

## Prompt length against the action number

| Call kind | Calls | First | Last | Largest | Chars per action |
| --- | --- | --- | --- | --- | --- |
| callRewardModel>proposeRewards | 1 | 762 | 762 | 762 | 0 |
| callNarratorAPI>narrateSessionVignette | 7 | 17857 | 35953 | 35953 | 137.8 |
| callHaiku>defaultCallTierAPI | 33 | 1734 | 1917 | 6916 | 37.8 |
| callClaudeAPI>interpretMove | 18 | 17427 | 18524 | 18751 | 5.6 |
| defaultClassifyImplicit>resolveRelevance | 2 | 590 | 580 | 590 | -0.1 |
| callNarratorAPI>call | 1 | 19201 | 19201 | 19201 | 0 |
| callNarratorAPI>narrateResolution | 20 | 23687 | 36891 | 39716 | 158.4 |
| callChronicleAPI>writeChronicleEntry | 48 | 3572 | 3337 | 3614 | -0.9 |
| callClassifierAPI>classifyInput | 44 | 14443 | 14116 | 14531 | 0.6 |
| callNarratorAPI>narratePacedInput | 28 | 26403 | 50002 | 50002 | 254.9 |
| callHaiku>defaultCallDetectionAPI | 43 | 8659 | 9486 | 9605 | 10.3 |
| callNarratorAPI>getRollingSessionSummary | 4 | 5728 | 17561 | 17561 | 168.7 |
| callNarratorAPI>getCampaignRecap | 4 | 7422 | 14246 | 14859 | 106.4 |
| callNarratorAPI>narrateOracleFollowup | 2 | 29637 | 32259 | 32259 | 174.8 |
| the AI player | 89 | 11482 | 19221 | 20143 | 27 |

## Caching, by call kind

| Call kind | Calls | Prompt tokens | Read from cache | Written | Sent uncached | Cost | Saved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| the AI player | 89 | 699589 | 424072 (61%) | 4819 | 270698 | $0.8477 | $0.8057 |
| callNarratorAPI>narratePacedInput | 28 | 392325 | 211493 (54%) | 29729 | 151103 | $0.5690 | $0.4018 |
| callNarratorAPI>narrateResolution | 20 | 257302 | 147831 (57%) | 27170 | 82301 | $0.3981 | $0.2809 |
| callNarratorAPI>narrateSessionVignette | 7 | 74703 | 21570 (29%) | 36437 | 16696 | $0.2078 | $0.0410 |
| callChronicleAPI>writeChronicleEntry | 48 | 58103 | 45590 (79%) | 970 | 11543 | $0.0685 | $0.0866 |
| callNarratorAPI>getCampaignRecap | 4 | 16944 | 0 (0%) | 0 | 16944 | $0.0679 | $0.0000 |
| callNarratorAPI>narrateOracleFollowup | 2 | 22639 | 10582 (47%) | 4681 | 7376 | $0.0434 | $0.0201 |
| callHaiku>defaultCallDetectionAPI | 43 | 145108 | 0 (0%) | 0 | 145108 | $0.0178 | $0.0000 |
| callNarratorAPI>call | 1 | 7046 | 4679 (66%) | 606 | 1761 | $0.0149 | $0.0089 |
| callClassifierAPI>classifyInput | 44 | 233612 | 188641 (81%) | 4387 | 40584 | $0.0092 | $0.0170 |
| callClaudeAPI>interpretMove | 18 | 120701 | 96900 (80%) | 5700 | 18101 | $0.0064 | $0.0087 |
| callHaiku>defaultCallTierAPI | 33 | 33757 | 0 (0%) | 0 | 33757 | $0.0046 | $0.0000 |
| callNarratorAPI>getRollingSessionSummary | 4 | 16807 | 0 (0%) | 0 | 16807 | $0.0026 | $0.0000 |
| callRewardModel>proposeRewards | 1 | 310 | 0 (0%) | 0 | 310 | $0.0001 | $0.0000 |
| defaultClassifyImplicit>resolveRelevance | 2 | 444 | 0 (0%) | 0 | 444 | $0.0001 | $0.0000 |
| **All** | 344 | 2079390 | 1151358 (55%) | 114499 | 813533 | $2.2581 | $1.6707 |

Caches nothing: callNarratorAPI>getCampaignRecap (16944 tokens over 4 call(s)); callHaiku>defaultCallDetectionAPI (145108 tokens over 43 call(s)); callHaiku>defaultCallTierAPI (33757 tokens over 33 call(s)); callNarratorAPI>getRollingSessionSummary (16807 tokens over 4 call(s)); callRewardModel>proposeRewards (310 tokens over 1 call(s)); defaultClassifyImplicit>resolveRelevance (444 tokens over 2 call(s)).

## Cost

|  | Dollars | Share | Calls |
| --- | --- | --- | --- |
| The module's own calls | $1.4105 | 63% | 255 |
| The AI player | $0.8477 | 38% | 89 |
| **Total** | $2.2582 |  | 344 |

Per action: $0.0254. Per line of play: $0.0513.

## The reading

**What the round's fixes did.** The five #377 items were each read in play, and four held outright: no instruction written as prose, no move performed without its roll, no crew and no stat in a solo opening, and scenes of one kind that no longer repeat (openings 8–13% between neighbours, closings 4–14%). Item 1 held where it was aimed — every prompt that still carried an old name said it was changed, and nothing written after the changes used one — and showed two limits: the stores keep the old names (the Session Log), which option 1 chose to leave, and the narrator turned the table's correction into a story of a crossed-out name. Its note now says the change is the table's, not the story's.

**What the run found.** One module defect cost five beats: the fight's card, posted above the Enter the Fray roll with the move's own name on its button, read as already answered (FIGHT-COMMIT-CARD-AFTER-THE-ROLL, its second sample). Two came from the item 3 fix's new edge — a line that sets about what only a move changes was offered nothing — and from a named move read as another, because the interpreter did not know the relationship track was full. All three are fixed, each with a test made from this run's words. Three faults were the runner's (the recovery check, a pronoun rule that took the clerk for Tamsin, a bait scorer that missed a denial inside speech); fixed, and this run is scored again.

**What it did not test.** The fight: a miss and its price, the suffer path, a burn, a GM reload mid-fight and Take Decisive Action were not exercised, so a run after the fight's fix is the one that tests them — and End a Session naming a cost owed, which nobody left owed. The narrator still answers memory questions through an all-knowing stranger (the voice, the clerk); no sentence spoke for the character this time.

**Provenance.** The run records commit `c5d804e2`, but the module it ran was the copy `cloud.sh up` staged at 14:18 UTC — before that commit's one change to `narrator.js`, the name note added to a call's user message. Nothing here depends on it: each of the 42 calls that carried the note had it from its system prompt. Every suite now stages the module before it runs (known-issues EXPLORE-RAN-A-STALE-MODULE).

**Spend.** $2.2582 for 89 actions and 344 calls in 26 minutes — the module 63%, the AI player 38%; caching read 55% of prompt tokens and saved $1.67.

