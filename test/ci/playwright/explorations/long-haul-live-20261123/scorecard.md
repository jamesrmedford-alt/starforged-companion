# long-haul — scorecard

Run `long-haul-live-20261123-050206` · live · class **suspected-quality-issue** — the ledger: 2 fact(s) refused, 0 lost — each excerpt is to be read

**Re-scored 2026-11-23** from this run's own evidence, by the checks as corrected after it (`rescore.mjs`). What the table did is unchanged. The run's own verdict was **product-failure** — beat 15 (Interruption: the X-Card on one narration) was brought about wrongly: the removed narration still has 1 standing truth(s) (a35: "a torn strip of its hull plating drifts in the bay mouth, carrying a fresh weld seam over an older mark, partly legible to Mira") and 0 Chronicle entries

## What this run was to answer

1. Can a live Sonnet 5.5 player walk the 26 beats inside 100 actions — which beats does it not reach, and is the cause the player, the beat's wording, the runner or the module?
2. Do the mechanical checks hold on real dice with a real classifier and interpreter choosing the moves (the rehearsal's always name the scripted move)?
3. With a real narrator, is each of the seven facts recalled in a later session, and where one is not, at which layer — stored, in the prompt, in the answer — was it lost?
4. Does any session summary, Chronicle entry or recap contradict a fact, or carry the corrected ship name or the connection's old surname as if current?
5. Does the narrator agree with either contradiction bait?
6. Is any hidden plan's truth stated before its reveal?
7. How long does a line of play take to its reply (p50, p95), which call kinds take the time, and how much of it is the 2.5 s the table takes with the model answering at once?
8. What does a line of play cost the module, by call kind — which kinds write a cache nothing reads, and what does the Chronicle scribe cost a session?
9. Does any prompt grow with the run (characters per action, by call kind)?
10. Do the sessions' opening and closing scenes repeat each other by content (GALLEY-VIGNETTE-REPEATS)?

1. **Yes — 87 actions for 26 beats, none given up by the player.** The run's own count was 24: beat 15 was failed and beat 16 not reached, both by faults in the checks (x15, a38). Re-scored, 26 of 26. Where actions were lost: 5 waits at beat 16 (the check), 2 at beat 10 (the beat's wording), 2 lines at beat 21 and 3 at beat 22 (the module read a named move as narrative or as another move).
2. **Yes.** 1,140 checks, none violated; 16 rolls, each recomputed from the dice on its own card and held against the dice that fell. With a real reader choosing the moves, three readings were wrong or doubtful (a56/a57 Heal as narrative; a65 Test Your Relationship; a66 Compel for a named Forge a Bond) — each rolled correctly as the move it was read as. One check was never exercised: `suffer-cost` (a26).
3. **Five of seven held; none lost.** F2, F3, F4 and F5 were recalled in a later session, at up to 67 actions, each stored, in the prompt and in the answer. F1 was answered every time and never counts as recall: all three openings put the compass in the scene first. F6 and F7 are answered with the new value and refused for what else was said (4).
4. **Yes, for both things that were changed, and for nothing else.** After the correction: the next narration (a44), the session log's threat, a clock ("Ashen Wake — 1/4", a67) and all three recaps name the Ashen Wake; the last calls Cinder Wren her "other name". After the rename: the session's summary names "Tamsin Vey"; the narrator makes "Vey" an alias (a55, a81) and the Chronicle, two summaries, two recaps and her own card record it. 37 narrator prompts after the scene of the correction carried the old ship name with nothing saying it was corrected. No helper contradicted F1–F5: the run's twelve alarms for those five facts were the ledger's own (a "he" that was Juro, a "sold" said of lane timings).
5. **No.** Both were refused in the first words of the answer.
6. **None found.** Five plans were made and none revealed. One — who wrote the tide's deadline — was worked through its clues for twenty narrations ("I never named the hour. Someone else did."); its truth, who, was not said.
7. **6.9 s at the median, 14.6 s at the 95th, 17.3 s at worst**, over 41 lines. The narrator's one call is 3.9 s (a narrated line) or 4.4 s (a resolved move; 13 s at worst); the reader 0.7 s, the interpreter 1.6 s. The table takes about 2.5 s with the model answering at once, so roughly a third of the median is the module's own. The scribe (1.5 s, 4.9 s at the 95th), the detector and the tier pass run after the reply.
8. **About $0.033 a line of play for the module** ($1.46 over 44 lines): the narrator's calls $1.35, the scribe $0.07 for 49 calls, everything on Haiku $0.04. No kind writes a cache it never reads. The session scene writes more than it reads (36,000 tokens written at the hour's price, 25,000 read): caching it cost about two cents more than it saved. The detector sends 156,000 tokens uncached over 46 calls — $0.02.
9. **Yes: the narrator's.** A narrated line's prompt went from 25,000 to 51,000 characters over the run (+277 an action), a resolved move's from 25,000 to 40,000. What grew: the world snapshot (5,200 → 14,700), the recent scene (1,600 → 10,300), "changed since the snapshot" (0 → 3,600), the scene's truths (900 → 3,300). The player's own prompt grew 30 characters an action.
10. **Yes, both kinds.** Openings: 24–29% of content words shared between neighbours, the first's kettle and engineer repeated in the second, the third's lentils and burnt pan in the fourth. Closings: three scenes of Tamsin closing her stall, eating, the filter dripping — 28–34%.

| Dimension | Result | Basis | Trust |
| --- | --- | --- | --- |
| Goal and beats | 26 done, 0 failed, 0 not exercised of 26 | the observer's checks on the world after each action | high: arithmetic over the world's records |
| Mechanics | 1140 checks, 0 violated | the game's text (tests/helpers/sequence/rules.js), each roll from its own dice | high where a check ran; see what was never exercised |
| Continuity — the narrator | 4 recalled, 1 carried unasked, 0 lost, 2 refused, 0 not probed of 7 | fact × probe × layer; refusals; leaks | medium: presence of words, not comprehension — read each excerpt |
| Continuity — the helpers | 54 refusal(s) in summaries, Chronicle entries and recaps | each helper's writing against the ledger | medium: a refusal is a contradiction that was thought of |
| Agency | 5 sentence(s) that speak for the character | quoted speech given to "you" | low: a count to start reading from |
| Friction | 1.98 actions per line of play; the GM answered 22 prompt(s); 0 action(s) did not land | the player's actions and the GM's rules' answers | high |
| Narrator quality | repetition by content: 34% of a46's content words were in a13; 0 repeated who-is-doing-what | shared content words and repeated acts between scenes of one kind | medium for repetition; the rest is the reading |
| Speed | a line to its reply: p50 6.9 s, p95 14.6 s (41 lines) | each call's latency; the time from a line to the first narration after it | high |
| Length | callNarratorAPI>narratePacedInput: +276.6 chars/action; callNarratorAPI>narrateResolution: +189.7 chars/action | prompt size against the action number, per call kind | high |
| Caching | 55% of prompt tokens read from cache; saved $1.7030; 0 kind(s) write and never read | usage per call kind | high |
| Cost | $2.2960 — the module $1.4587 (64%), the test's own models $0.8373 (37%) | the budget's tally by role and the price table | high for tokens; prices are entered by hand |

## Beats

| # | Beat | Status | Actions | At | Detail |
| --- | --- | --- | --- | --- | --- |
| 1 | Begin a Session, swearing a vow in its dialog | done | 3 | a3 | session 1 is open; the dangerous vow "Find who is raiding the Cinder Expanse lanes" is on the sheet at 0 ticks |
| 2 | Meet someone and make them a connection | done | 2 | a5 | Tamsin Vey is a dangerous connection held by Mira Kestrel; its bond Item reads 0 ticks; make_a_connection was rolled and there is still one card |
| 3 | Link the vow to them | done | 2 | a7 | the vow "Find who is raiding the Cinder Expanse lanes" is linked to Tamsin Vey's card |
| 4 | Gather Information | done | 1 | a8 | gather_information was rolled at a8: strong_hit |
| 5 | Plant facts F1–F4 | done | 3 | a11 | F1, F2, F3, F4 stated by the player |
| 6 | End a Session, noting a focus | done | 2 | a13 | session 1 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes" |
| 7 | Begin a Session; ask probe set A | done | 6 | a19 | probe set A: 4 question(s) asked |
| 8 | Travel to the second settlement | done | 1 | a20 | the ship is at Bleakhold Station, its token on the pin |
| 9 | Enter a fight that serves the vow | done | 5 | a25 | the dangerous fight "Ashen Wake" is open, serving the vow "Find who is raiding the Cinder Expanse lanes" |
| 10 | A scripted miss in the fight | done | 5 | a26 | strike missed at a26; its price named no suffer move and was paid in the story — the suffer path was not exercised |
| 11 | A scripted weak hit, then Burn Momentum | done | 2 | a32 | clash came up weak_hit at a31 and momentum was burned for strong_hit |
| 12 | Interruption: the GM's page reloads mid-fight | done | 0 | x12 | after the reload: the fight "Ashen Wake" at 16 ticks, the meters unchanged, the lock free |
| 13 | Take Decisive Action; mark the milestone | done | 2 | a34 | Take Decisive Action came up strong_hit; the milestone (×1) is marked on "Find who is raiding the Cinder Expanse lanes" |
| 14 | Interruption: End a Session opened and closed unanswered | done | 0 | x14 | End a Session was opened and closed unanswered: the session is open, nothing was paid, the lock is free |
| 15 | Interruption: the X-Card on one narration | done | 1 | x15 | 1 narration(s) removed; none of their facts stands, and play has resumed |
| 16 | Correct an earlier fact | done | 8 | a38 | the old value is struck and "is named the Cinder Wren" stands; 2 other truth(s) are still filed under the old name ("Ashen Wake — raider cutter that has jumped the Kobayashi IV off Bleakhold") |
| 17 | Ask the oracle | done | 1 | a44 | the oracle answered NO (MATCH — extreme/twist) |
| 18 | Interruption: the GM renames the connection's card | done | 0 | x18 | Tamsin Vey is now Tamsin Okoro; the vow "Find who is raiding the Cinder Expanse lanes" shows the new name |
| 19 | End a Session | done | 2 | a46 | session 2 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes" |
| 20 | Begin a Session; ask probe set B | done | 9 | a55 | probe set B: 7 question(s) asked |
| 21 | Recover | done | 4 | a59 | heal came up strong_hit at a58 |
| 22 | Develop the relationship to a full track; Forge a Bond | done | 10 | a69 | a bond is forged with Tamsin Okoro (dangerous), its track at 40 ticks |
| 23 | Develop Your Relationship again, bonded | done | 1 | a70 | the bonded Develop Your Relationship was rolled at a70 (strong_hit); no progress was marked |
| 24 | Reach milestones; Fulfill Your Vow | done | 3 | a73 | the vow "Find who is raiding the Cinder Expanse lanes" is fulfilled; Tamsin Okoro's track is untouched and one bonded roll is offered |
| 25 | Recap; ask probe set C; two baits | done | 10 | a83 | probe set C: 7 question(s) asked, 2 bait(s); the recap was posted |
| 26 | End a Session, then Begin a fourth | done | 4 | a87 | session 4 is open |

## Mechanics

1140 checks made.

| Check | Made | Violated |
| --- | --- | --- |
| roll-score | 13 | 0 |
| roll-outcome | 16 | 0 |
| roll-match | 16 | 0 |
| roll-cancelled-die | 13 | 0 |
| roll-narrated-as-rolled | 13 | 0 |
| dice-as-they-fell | 16 | 0 |
| progress-score | 3 | 0 |
| meter-bounds | 368 | 0 |
| track-bounds | 337 | 0 |
| progress-per-mark | 14 | 0 |
| bond-mirror | 89 | 0 |
| link-mirror | 86 | 0 |
| legacy-reward | 3 | 0 |
| xp-per-box | 1 | 0 |
| move-momentum | 5 | 0 |
| milestone-once | 1 | 0 |
| suffer-cost | 0 | 0 |
| recover-amount | 2 | 0 |
| burn | 1 | 0 |
| session-momentum | 7 | 0 |
| lock-free | 92 | 0 |
| answered-once | 44 | 0 |

### Rolls

| Step | Move | Outcome | Dice | Scripted |
| --- | --- | --- | --- | --- |
| a3 | swear_an_iron_vow | weak_hit | Action: 1 + 2 = 3 \| Challenge: 1, 6 |  |
| a5 | make_a_connection | strong_hit | Action: 6 + 2 = 8 \| Challenge: 1, 2 | yes |
| a8 | gather_information | strong_hit | Action: 5 + 3 = 8 \| Challenge: 6, 3 |  |
| a20 | set_a_course | strong_hit | Action: 4 + 5 = 9 \| Challenge: 7, 5 |  |
| a22 | enter_the_fray | weak_hit | Action: 1 + 3 = 4 \| Challenge: 4, 1 |  |
| a26 | strike | miss | Action: 1 + 2 = 3 \| Challenge: 10, 9 | yes |
| a29 | endure_stress | strong_hit | Action: 5 + 5 = 10 \| Challenge: 7, 5 |  |
| a31 | clash | weak_hit | Action: 1 + 1 = 2 \| Challenge: 1, 7 | yes |
| a33 | take_decisive_action | strong_hit | Progress: 4 \| Challenge: 1, 2 | yes |
| a58 | heal | strong_hit | Action: 6 + 1 = 7 \| Challenge: 4, 3 |  |
| a64 | compel | weak_hit | Action: 5 + 2 = 7 \| Challenge: 7, 3 |  |
| a65 | test_your_relationship | weak_hit | Action: 3 + 2 = 5 \| Challenge: 1, 7 |  |
| a66 | compel | miss | Action: 1 + 2 = 3 \| Challenge: 8, 4 |  |
| a69 | forge_a_bond | strong_hit | Progress: 10 \| Challenge: 1, 2 | yes |
| a70 | develop_your_relationship | strong_hit | Action: 6 + 2 = 8 \| Challenge: 2, 5 |  |
| a73 | fulfill_your_vow | strong_hit | Progress: 4 \| Challenge: 1, 2 | yes |

Never exercised: suffer-cost.

## The fact ledger

| Fact | Kind | Planted | Verdict | Layer | Refusals |
| --- | --- | --- | --- | --- | --- |
| F1 | a possession | a9 | carried-unasked |  | 0 |
| F2 | an NPC's name and pronouns | a4 | recalled |  | 0 |
| F3 | an item handed to someone | a10 | recalled |  | 0 |
| F4 | a promise with a deadline | a11 | recalled |  | 0 |
| F5 | where the ship is, and whose it is | a20 | recalled |  | 0 |
| F6 | a corrected fact | a38 | refused | storage | 44 |
| F7 | a renamed NPC | x18 | refused | storage | 13 |

### Probes

| Fact | Probe | At | Distance | Stored | In the prompt | In the answer | Counted | Answer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | F1-A | a16 | 7 (near) | yes | WORLD SNAPSHOT, RECENT SCENE | yes | no — restated first by the galley_begin scene (a15) | as though it had been waiting for the question. Your hand has already found the compass. The brass is warm from the lamp, scratched along one edge where Ilse used to t |
| F1 | F1-B | a49 | 40 (mid) | yes | WORLD SNAPSHOT, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, RECENT SCENE | yes | no — restated first by the galley_begin scene (a48) | lse thumbed it. Then the voice comes through the hatch, low and unhurried. "The star-compass. Your sister's. I'd know that scratch anywhere." The knock does not repeat. Who |
| F1 | F1-C | a75 | 66 (far) | yes | WORLD SNAPSHOT, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, RECENT SCENE | yes | no — restated first by the galley_begin scene (a48) | Your hand drops to the galley table. The brass star-compass lies face-down where you left it. It is the only thing of Ilse's aboard. You tu |
| F2 | F2-A | a17 | 13 (near) | yes | WORLD SNAPSHOT, CHARACTER | yes | yes | "Tamsin Vey," a voice says through the airlock, as if answering you. "Ledger stall, wed |
| F2 | F2-B | a50 | 46 (far) | yes | WORLD SNAPSHOT, CHARACTER | yes | yes | You think of Tamsin first, then hold the thought a moment. She holds your manifest and calls you a |
| F2 | F2-C | a76 | 72 (far) | yes | WORLD SNAPSHOT, RECENT ORACLE RESULTS (this session, oldest first), IN PLAY NOW, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, UNREVEALED — FOR THE NARRATOR ONLY, CHARACTER, RECENT SCENE | yes | no — restated first by a narration (a50) | On the comm, Tamsin has gone quiet, the filter hum filling the line. She is listening to you think. |
| F3 | F3-A | a18 | 8 (near) | yes | WORLD SNAPSHOT, CHANGED SINCE THE SNAPSHOT, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, UNREVEALED — FOR THE NARRATOR ONLY, CHARACTER, RECENT SCENE | yes | yes | The voice outside answers before you finish asking. "Tamsin Vey holds it, under her ledger," it says. "She told me to say it's safe. She al |
| F3 | F3-B | a51 | 41 (mid) | yes | WORLD SNAPSHOT, CHARACTER, RECENT SCENE | yes | yes | You answer aloud, a question to the hatch as much as to yourself. Tamsin's hands, last you knew, under her ledger. Hands are a stranger's word for it. " |
| F3 | F3-C | a77 | 67 (far) | yes | WORLD SNAPSHOT, RECENT ORACLE RESULTS (this session, oldest first), IN PLAY NOW, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, UNREVEALED — FOR THE NARRATOR ONLY, CHARACTER, RECENT SCENE | yes | yes | "Tamsin has it," she says over the comm, "under the ledger, where it has been since you |
| F4 | F4-A | a19 | 8 (near) | yes | WORLD SNAPSHOT, CHANGED SINCE THE SNAPSHOT, RECENT SCENE | yes | no — restated first by a narration (a17) | tops halfway to your mouth. Outside, the voice takes its time. "Before the next cargo tide," it says. "Tamsin was particular about that. Said you'd know it was a loose wo |
| F4 | F4-B | a52 | 41 (mid) | yes | WORLD SNAPSHOT | yes | yes | plating creaking under a patient weight. You answer the hatch. "Before the next cargo tide. I told Tamsin that." Silence stretches, then the voice comes back, dry. "A tid |
| F4 | F4-C | a78 | 67 (far) | yes | WORLD SNAPSHOT, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE | yes | no — restated first by a narration (a52) | Your own words come back to you: *before the next cargo tide*. Tamsin takes them off the comm. "That was it. Before the tide, no sooner, no |
| F5 | F5-B | a53 | 33 (mid) | yes | RESPONSE FORMAT — MANDATORY SIDECAR, WORLD SNAPSHOT, IN PLAY NOW, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE | yes | yes | "Berthed at Bleakhold, cradle four. You command her. Or so the dock log says," the voice answers thro |
| F5 | F5-C | a79 | 59 (far) | yes | RESPONSE FORMAT — MANDATORY SIDECAR, WORLD SNAPSHOT, IN PLAY NOW, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE | yes | no — restated first by a narration (a53) | Open on Tamsin, not the hatch. Her answer comes over the comm, flat and quick. "Bleakhold. You docked there yourself, Mira. Hull number read at the cradle, clamps still |
| F6 | F6-B | a54 | 16 (mid) | yes | WORLD SNAPSHOT | yes | yes | The visitor taps the datapad once against the plating. "Cinder Wren," the voice says. "Painted on her flank, small, like someone was embarrassed by |
| F6 | F6-C | a80 | 42 (mid) | yes | WORLD SNAPSHOT, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, RECENT SCENE | yes | no — restated first by a narration (a54) | "The Cinder Wren," Tamsin says over the comm. "Painted small on her flank, near the weld seams. |
| F7 | F7-B | a55 |  | yes | WORLD SNAPSHOT, CHARACTER | REFUSED | yes | The datapad stops tapping. You say it to the hatch, half a question. "Tamsin Okoro. Though the docks swear she's Vey." The handle settles back into place. "Both a |
| F7 | F7-C | a81 |  | yes | WORLD SNAPSHOT, IN PLAY NOW, CHANGED SINCE THE SNAPSHOT, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, CHARACTER, RECENT SCENE | REFUSED | no — restated first by a narration (a55) | Tamsin answers over the comm, dry and unhurried. "Okoro. Tamsin Okoro. The docks call me Vey, and I answer to it when it pays." The fil |

### Restated unasked

| Fact | At | Scene | In that scene's own prompt | Text |
| --- | --- | --- | --- | --- |
| F1 | a15 | galley_begin | WORLD SNAPSHOT, CAMPAIGN RECAP — SESSION START CONTEXT | r paste stirred in, because Wits 3 is a lot of thinking to do on bland food. Ilse's brass compass sits by your elbow, its needle swinging lazily toward nothing in particular. There is no |
| F1 | a48 | galley_begin | WORLD SNAPSHOT, CAMPAIGN RECAP — SESSION START CONTEXT | p meaning to scrub. You eat standing, one boot braced against the table leg, while Ilse's compass lies face-down by your elbow where it can't point at anything. Somewhere aft, the coolant |
| F1 | a87 | galley_begin | WORLD SNAPSHOT, CAMPAIGN RECAP — SESSION START CONTEXT | tils and the burnt edge of a pan you have stopped trying to scrub. You sit with the brass compass face-down by your elbow and a mug of ship's coffee gone lukewarm, which is the temperatur |
| F2 | a13 | npc_end | SESSION NARRATION (oldest first), WORLD SNAPSHOT, STORY SO FAR (THIS SESSION), CHARACTER, RESPOND NOW, ACTIVE SECTOR, CAMPAIGN CHRONICLE | Tamsin Vey wipes the condensate off the stall's front rail with the cuff of her sleeve, then doe |
| F2 | a46 | npc_end | SESSION NARRATION (oldest first), WORLD SNAPSHOT, STORY SO FAR (THIS SESSION), CHARACTER, RESPOND NOW, ACTIVE SECTOR, CAMPAIGN CHRONICLE | Tamsin Okoro drops the stall's shutter one slat at a time, because the bottom hinge sticks and s |
| F2 | a85 | npc_end | SESSION NARRATION (oldest first), WORLD SNAPSHOT, RECENT ORACLE RESULTS (this session, oldest first), STORY SO FAR (THIS SESSION), CHARACTER, RESPOND NOW, ACTIVE SECTOR, CAMPAIGN CHRONICLE | Tamsin Okoro is closing her stall, and the shutters stick the way they always do. She works the |
| F4 | a17 | narration | WORLD SNAPSHOT | dger stall, wedged between the filter and the shuttered chandlery. She says you owe her a cargo tide." You say the name once more, aloud, to hold it still. The pump knocks twice. Whoever sta |
| F5 | a87 | galley_begin | RESPONSE FORMAT — MANDATORY SIDECAR, WORLD SNAPSHOT, CAMPAIGN RECAP — SESSION START CONTEXT, IN PLAY NOW | ct, is lying on the cargo deck with a star chart over his face, calling it recalibration. Bleakhold's bay lamps drift past the viewport, steady and unbothered. "If anyone asks where everyon |
| F7 | a46 | npc_end | WORLD SNAPSHOT, CHARACTER, RESPOND NOW, ACTIVE SECTOR | Tamsin Okoro drops the stall's shutter one slat at a time, because the bottom hinge sticks and she has |
| F7 | a85 | npc_end | SESSION NARRATION (oldest first), WORLD SNAPSHOT, STORY SO FAR (THIS SESSION), CHARACTER, RESPOND NOW, ACTIVE SECTOR, CAMPAIGN CHRONICLE | Tamsin Okoro is closing her stall, and the shutters stick the way they always do. She works the left o |

### Refusals — each to be read

| Fact | At | Where | Word | Sentence |
| --- | --- | --- | --- | --- |
| F6 | a44 | narration | Ashen Wake | The *Ashen Wake* holds station beyond the lamps, scorched along its weld seams, and the channel from it carries nothing, no hail and no breath, only a flat carrier hum that does not break. |
| F6 | a46 | recap (campaign recap) | Ashen Wake | The Ashen Wake bore down on the Kobayashi IV while she was still locked in her cradle, and your first volley scattered wide. |
| F6 | a46 | sessionLog (Session 2 — 2026-11-23) | Ashen Wake | Threat: Ashen Wake — Breaks from the debris shadow and closes fast on the dock with guns hot. |
| F6 | a46 | sessionLog (Session 2 — 2026-11-23) | Ashen Wake | Ashen Wake: raider cutter that has jumped the Kobayashi IV off Bleakhold Station; weapons hot, cl... |
| F6 | a46 | sessionLog (Session 2 — 2026-11-23) | Ashen Wake | Ashen Wake: hull plates carry fresh weld seams over an older mark; took hits from the Kobayashi I... |
| F6 | a74 | recap (campaign recap) | Ashen Wake | Along the way you fought off the Ashen Wake, a scorched cutter that bore down on you while the *Kobayashi IV* was still locked in cradle four at Bleakhold. |
| F6 | a85 | recap (campaign recap) | Ashen Wake | Along the way you drove off the Ashen Wake in a bay fight that began badly and ended well, and you learned the hostile vessel's other name, the Cinder Wren. |
| F6 | a46 | the prompt of callNarratorAPI>getCampaignRecap | Ashen Wake | in CAMPAIGN CHRONICLE — and nothing in the prompt says it was corrected |
| F6 | a48 | the prompt of callNarratorAPI>narrateSessionVignette | Ashen Wake | in WORLD SNAPSHOT, CAMPAIGN RECAP — SESSION START CONTEXT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a49 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a50 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a51 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a52 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a53 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a54 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a55 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a56 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a57 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a58 | the prompt of callNarratorAPI>narrateResolution | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a60 | the prompt of callNarratorAPI>narrateResolution | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a61 | the prompt of callNarratorAPI>narrateResolution | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a62 | the prompt of callNarratorAPI>narrateResolution | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a63 | the prompt of callNarratorAPI>narrateResolution | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a64 | the prompt of callNarratorAPI>narrateResolution | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a65 | the prompt of callNarratorAPI>narrateResolution | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a67 | the prompt of callNarratorAPI>narrateResolution | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a69 | the prompt of callNarratorAPI>narrateResolution | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a70 | the prompt of callNarratorAPI>narrateResolution | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a71 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a72 | the prompt of callNarratorAPI>narrateResolution | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a73 | the prompt of callNarratorAPI>narrateResolution | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a74 | the prompt of callNarratorAPI>getCampaignRecap | Ashen Wake | in CAMPAIGN CHRONICLE — and nothing in the prompt says it was corrected |
| F6 | a75 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a76 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a77 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a78 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a79 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a80 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a81 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a82 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a83 | the prompt of callNarratorAPI>narratePacedInput | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a85 | the prompt of callNarratorAPI>narrateSessionVignette | Ashen Wake | in WORLD SNAPSHOT, CLOCKS — and nothing in the prompt says it was corrected |
| F6 | a85 | the prompt of callNarratorAPI>getCampaignRecap | Ashen Wake | in CAMPAIGN CHRONICLE — and nothing in the prompt says it was corrected |
| F6 | a87 | the prompt of callNarratorAPI>narrateSessionVignette | Ashen Wake | in WORLD SNAPSHOT, CAMPAIGN RECAP — SESSION START CONTEXT, CLOCKS — and nothing in the prompt says it was corrected |
| F7 | a55 | narration | Vey | Though the docks swear she's Vey." |
| F7 | a81 | narration | Vey | The docks call me Vey, and I answer to it when it pays." |
| F7 | a46 | summary (session uuHz9hbT5CNIwtQI) | Tamsin Vey | In this session Mira Kestrel, working from the Kobayashi IV's galley, learned that the salvage broker Tamsin Vey keeps a ledger stall between the filter stall and a shuttered chandlery, and that Mira owes her a cargo tide. |
| F7 | a46 | sessionLog (Session 2 — 2026-11-23) | Tamsin Vey | Session 2 — 2026-11-23 Session ID: uuHz9hbT5CNIwtQI Scene log Lore: Ledger stall beside the filter — A ledger stall is wedged between the filter and the shuttered chandlery, where Tamsin Vey conducts business. |
| F7 | a46 | sessionLog (Session 2 — 2026-11-23) | Tamsin Vey | Session summary Story so far In this session Mira Kestrel, working from the Kobayashi IV's galley, learned that the salvage broker Tamsin Vey keeps a ledger stall between the filter stall and a shuttered chandlery, and that Mira owes her a cargo tide. |
| F7 | a46 | sessionLog (Session 2 — 2026-11-23) | Tamsin Vey | Mira Kestrel: promised Tamsin Vey she would return before the next cargo tide; Tamsin treats it a... |
| F7 | a46 | sessionLog (Session 2 — 2026-11-23) | Tamsin Vey | raider cutter: is named the Cinder Wren In this session Mira Kestrel, working from the Kobayashi IV's galley, learned that the salvage broker Tamsin Vey keeps a ledger stall between the filter stall and a shuttered chandlery, and that Mira owes her a cargo tide. |
| F7 | a55 | chronicle (8e3GAtusySQFirUj) | Vey | Mira Kestrel learned her broker friend Tamsin Okoro is also known as Vey on the docks of Hollow Spire, wearing whichever name gets her paid. |
| F7 | a74 | recap (campaign recap) | Tamsin Vey | Tamsin Okoro, who the docks also call Tamsin Vey, wears whichever name gets her paid. |
| F7 | a81 | summary (session sx78yOGkps6jLxXl) | Vey | Through the comm, Mira has been dealing with the broker Tamsin Okoro (also called Vey), who holds Mira's manifest under her ledger, reports three unposted crates signed for by Juro, and whose stall is under watch by clerks. |
| F7 | a81 | chronicle (vwZq2XzkYDbRC1Xy) | Vey | Mira learned her bonded friend Tamsin's full name is Okoro, known on the docks as Vey, while a visitor at the hatch hinted that one name wrote her tide. |
| F7 | a85 | summary (session sx78yOGkps6jLxXl) | Vey | Over the comm, the broker Tamsin Okoro (also called Vey) has handed you a grey-wrapped parcel to carry to her contact, has taken your word on the raiders and the lanes, and has sworn a bond with you that she will not tie to her ledger. |
| F7 | a85 | recap (campaign recap) | Vey | Tamsin Okoro keeps a ledger stall on the Hollow Spire docks and trades under the name Vey when it pays better. |

### A corrected value in later prompts

| Fact | Old value | Call | Prompts | From | To | Says it was corrected | Sections |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F6 | Ashen Wake | callNarratorAPI>narrateOracleFollowup | 1 | a44 | a44 | yes | WORLD SNAPSHOT, CLOCKS, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, UNREVEALED — FOR THE NARRATOR ONLY, RESPOND NOW |
| F6 | Ashen Wake | callNarratorAPI>getRollingSessionSummary | 1 | a46 | a46 | yes | SESSION NARRATION (oldest first), RETRACTED BY THE TABLE — these did not happen; leave them out |
| F6 | Ashen Wake | callNarratorAPI>narrateSessionVignette | 1 | a46 | a46 | yes | WORLD SNAPSHOT, CLOCKS, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE |
| F6 | Ashen Wake | callNarratorAPI>getCampaignRecap | 3 | a46 | a85 | NO | CAMPAIGN CHRONICLE |
| F6 | Ashen Wake | callNarratorAPI>narrateSessionVignette | 3 | a48 | a87 | NO | WORLD SNAPSHOT, CAMPAIGN RECAP — SESSION START CONTEXT, CLOCKS |
| F6 | Ashen Wake | callNarratorAPI>narratePacedInput | 19 | a49 | a83 | NO | WORLD SNAPSHOT, CLOCKS |
| F6 | Ashen Wake | callNarratorAPI>narrateResolution | 12 | a58 | a73 | NO | WORLD SNAPSHOT, CLOCKS |

### What the helpers kept

| Fact | Helper | At | Holds it | Text |
| --- | --- | --- | --- | --- |
| F1 | chronicle (wrrl8lxrNTRQCvhY) | a9 | yes | Mira Kestrel turned her sister Ilse's brass star-compass in her palm, the one thing of Ilse's she still carries, and Juro crossed the room to ask |
| F1 | chronicle (hJ4xnhYbLDeH8faR) | a10 | no |  |
| F1 | chronicle (DN2eegqlHHWU1Obk) | a11 | no |  |
| F1 | summary (session fSsoukq8ACPOOwjF) | a13 | yes | thin runs. Juro has been watching her, and after she turned over her sister Ilse's brass star-compass he approached and asked whether it was for sale or only for show, leaving the matter open |
| F1 | recap (campaign recap) | a13 | yes | ore you had finished learning his name, and he crossed the room to ask whether your brass star-compass was for sale. It is your sister Ilse's, the one thing of hers you still carry, and it is |
| F1 | sessionLog (Session 1 — 2026-11-23) | a13 | yes | thin runs. Juro has been watching her, and after she turned over her sister Ilse's brass star-compass he approached and asked whether it was for sale or only for show, leaving the matter open |
| F1 | chronicle (E9IWj12mwEuBMDj4) | a16 | yes | Mira Kestrel still carries her sister Ilse's scratched brass compass; she turned it face-down as footsteps on the docks stopped at her airlock. |
| F1 | chronicle (a4BDuDIg1Wipv0Tl) | a17 | no |  |
| F1 | sessionLog (Session 2 — 2026-11-23) | a17 | no |  |
| F1 | chronicle (8a2QdrgCwyrfsEPu) | a18 | no |  |
| F1 | chronicle (mlMf2xcJpjQROCmv) | a19 | no |  |
| F1 | sessionLog (Session 2 — 2026-11-23) | a23 | no |  |
| F1 | chronicle (P8wFSL4JoA1sDKsO) | a26 | no |  |
| F1 | chronicle (izT5Kz880O1WQeMU) | a32 | no |  |
| F1 | chronicle (9up10aP5H0Vab0bq) | a33 | no |  |
| F1 | chronicle (O9pyofO4PzvE0kgR) | a35 | no |  |
| F1 | summary (session uuHz9hbT5CNIwtQI) | a46 | yes | essel has sent only a flat, unbroken carrier hum, which Mira has not yet answered. Mira's compass, which belonged to her sister Ilse, is kept face-down on the galley table. |
| F1 | recap (campaign recap) | a46 | yes | already watching when you came in, crossed the room to ask about your sister Ilse's brass star-compass, and saw you leave the cargo manifest in Tamsin's keeping. She pledged to hide it. You pr |
| F1 | sessionLog (Session 2 — 2026-11-23) | a46 | yes | ster Ilse, is kept face-down on the galley table. Lore this session Ilse's compass: brass star-compass, scratched along one edge where Ilse thumbed it; its needle se... Mira Kestrel: promised |
| F1 | chronicle (3IvCLFrFnX38WalE) | a49 | yes | gh the hatch, an unseen stranger named Mira's keepsake, her sister Ilse's scratched brass star-compass, by sight, knowing far more than a stranger should. |
| F1 | sessionLog (Session 3 — 2026-11-23) | a49 | yes | x78yOGkps6jLxXl Scene log Lore: Ilse's compass bears a distinctive scratch — Ilse's brass star-compass is scratched along one edge where Ilse thumbed it, a mark recognised by someone outside t |
| F1 | chronicle (rLQF6Q0U47FLDRoJ) | a50 | no |  |
| F1 | chronicle (8eX4KEd3lI6i2UhH) | a51 | no |  |
| F1 | chronicle (5sfY7vBmhsViMz1r) | a52 | no |  |
| F1 | chronicle (aEeisY46aYIVGrK4) | a53 | no |  |
| F1 | sessionLog (Session 3 — 2026-11-23) | a54 | yes | x78yOGkps6jLxXl Scene log Lore: Ilse's compass bears a distinctive scratch — Ilse's brass star-compass is scratched along one edge where Ilse thumbed it, a mark recognised by someone outside t |
| F1 | chronicle (8e3GAtusySQFirUj) | a55 | no |  |
| F1 | chronicle (JGwChyhpscaLbig7) | a57 | no |  |
| F1 | chronicle (WsvI1LbQB3bK5l23) | a60 | no |  |
| F1 | chronicle (ELwHiLvWmhlbCCoj) | a61 | no |  |
| F1 | chronicle (WrdWSwnxXuTzD8Ib) | a62 | no |  |
| F1 | sessionLog (Session 3 — 2026-11-23) | a62 | yes | x78yOGkps6jLxXl Scene log Lore: Ilse's compass bears a distinctive scratch — Ilse's brass star-compass is scratched along one edge where Ilse thumbed it, a mark recognised by someone outside t |
| F1 | chronicle (3m1350cCbquGiNMi) | a63 | no |  |
| F1 | chronicle (CqB4ZUYHWPoELOev) | a64 | no |  |
| F1 | chronicle (7IN6vTQdnky8KRk6) | a65 | no |  |
| F1 | sessionLog (Session 3 — 2026-11-23) | a65 | yes | x78yOGkps6jLxXl Scene log Lore: Ilse's compass bears a distinctive scratch — Ilse's brass star-compass is scratched along one edge where Ilse thumbed it, a mark recognised by someone outside t |
| F1 | chronicle (69vkWfF0PkDHeTqB) | a67 | no |  |
| F1 | chronicle (Cp5DpVc7olrye7nb) | a69 | no |  |
| F1 | chronicle (VEAlHXq15tCwN83m) | a70 | no |  |
| F1 | sessionLog (Session 3 — 2026-11-23) | a70 | yes | x78yOGkps6jLxXl Scene log Lore: Ilse's compass bears a distinctive scratch — Ilse's brass star-compass is scratched along one edge where Ilse thumbed it, a mark recognised by someone outside t |
| F1 | chronicle (BOS4GJRG0Ejo6EEq) | a71 | no |  |
| F1 | sessionLog (Session 3 — 2026-11-23) | a71 | yes | x78yOGkps6jLxXl Scene log Lore: Ilse's compass bears a distinctive scratch — Ilse's brass star-compass is scratched along one edge where Ilse thumbed it, a mark recognised by someone outside t |
| F1 | chronicle (EYaX5mojfNn1XOAK) | a72 | no |  |
| F1 | chronicle (azVySgL94SLuPHD7) | a73 | no |  |
| F1 | recap (campaign recap) | a74 | yes | lanes' timings and who crossed the room to ask whether your sister Ilse's scratched brass star-compass was for sale. It wasn't, and it still isn't. It's the one thing of hers you carry. Tamsin |
| F1 | chronicle (lcOYHdE36FaZa0qo) | a75 | yes | Mira Kestrel found Ilse's brass star-compass, the only thing of her sister's aboard, and the visitor outside the hatch knew it, its ne |
| F1 | chronicle (KBtfHpGnysSCfoRH) | a76 | no |  |
| F1 | chronicle (TmW7wVpTdjdMtjww) | a77 | no |  |
| F1 | chronicle (W9JjegwcSfJMvBMB) | a78 | no |  |
| F1 | chronicle (WZBUQxWW0Myuk7LF) | a80 | no |  |
| F1 | summary (session sx78yOGkps6jLxXl) | a81 | yes | sitor waits at the hatch and knocks in patient, measured raps. Mira's sister Ilse's brass star-compass, scratched along one edge, lies face-down on the table, and the visitor has recognised it |
| F1 | chronicle (vwZq2XzkYDbRC1Xy) | a81 | no |  |
| F1 | chronicle (R1F7C43FJ54d4BJU) | a82 | yes | Mira believed she had left the compass with Tamsin, but Tamsin says it lay on her galley table all along, and the visitor hints |
| F1 | chronicle (0BinwYJVixvGcdSo) | a83 | no |  |
| F1 | summary (session sx78yOGkps6jLxXl) | a85 | yes | een visitor keeps questioning whether that is truly your choice. Your sister Ilse's brass star-compass, scratched along one edge, lies face-down on the galley table, and the visitor knows it b |
| F1 | recap (campaign recap) | a85 | yes | ce have been less welcome. The man at your hatch knows your sister Ilse's scratched brass star-compass on sight, the one thing of hers you still carry, and he talks as though your memory has b |
| F1 | sessionLog (Session 3 — 2026-11-23) | a85 | yes | x78yOGkps6jLxXl Scene log Lore: Ilse's compass bears a distinctive scratch — Ilse's brass star-compass is scratched along one edge where Ilse thumbed it, a mark recognised by someone outside t |
| F2 | chronicle (NRamTY9efE5QtSWe) | a5 | yes | Mira Kestrel offered Tamsin Vey a fair cut of her lane salvage, and Tamsin accepted, paying first with word of Juro, |
| F2 | sessionLog (Session 1 — 2026-11-23) | a5 | no |  |
| F2 | chronicle (8zypsNSkiKQ3rx9X) | a8 | no |  |
| F2 | sessionLog (Session 1 — 2026-11-23) | a8 | no |  |
| F2 | chronicle (wrrl8lxrNTRQCvhY) | a9 | no |  |
| F2 | chronicle (hJ4xnhYbLDeH8faR) | a10 | yes | Mira Kestrel left the cargo manifest in Tamsin's keeping, and Tamsin pledged to hide it, though Juro saw the handoff. |
| F2 | chronicle (DN2eegqlHHWU1Obk) | a11 | yes | Mira Kestrel promised Tamsin she would return before the next tide of cargo; Tamsin answered with dry doubt while Juro |
| F2 | summary (session fSsoukq8ACPOOwjF) | a13 | yes | about her supply run before the board posted it. She has anchored with the salvage broker Tamsin Vey, promising a fair cut of any salvage from the lanes, and Tamsin has given her a lead: |
| F2 | recap (campaign recap) | a13 | yes | st water. Someone knows what is moving and when, and tells the people who profit from it. Tamsin Vey is the relationship that has taken shape. She keeps a ledger stall wedged between a c |
| F2 | sessionLog (Session 1 — 2026-11-23) | a13 | yes | about her supply run before the board posted it. She has anchored with the salvage broker Tamsin Vey, promising a fair cut of any salvage from the lanes, and Tamsin has given her a lead: |
| F2 | chronicle (E9IWj12mwEuBMDj4) | a16 | no |  |
| F2 | chronicle (a4BDuDIg1Wipv0Tl) | a17 | yes | Mira Kestrel learned the name of her Hollow Spire salvage broker friend, Tamsin Vey of the ledger stall, who is said to be owed a cargo tide. |
| F2 | sessionLog (Session 2 — 2026-11-23) | a17 | yes | e filter — A ledger stall is wedged between the filter and the shuttered chandlery, where Tamsin Vey conducts business. |
| F2 | chronicle (8a2QdrgCwyrfsEPu) | a18 | yes | Mira learned that Tamsin Vey holds her cargo manifest, kept safe under her ledger, from a voice outside the hatch |
| F2 | chronicle (mlMf2xcJpjQROCmv) | a19 | yes | A voice outside told Mira Kestrel she had promised Tamsin to return before the next cargo tide, and that Tamsin is closing her stall tonight. |
| F2 | sessionLog (Session 2 — 2026-11-23) | a23 | yes | e filter — A ledger stall is wedged between the filter and the shuttered chandlery, where Tamsin Vey conducts business. Threat: Ashen Wake — Breaks from the debris shadow and closes fast |
| F2 | chronicle (P8wFSL4JoA1sDKsO) | a26 | no |  |
| F2 | chronicle (izT5Kz880O1WQeMU) | a32 | no |  |
| F2 | chronicle (9up10aP5H0Vab0bq) | a33 | no |  |
| F2 | chronicle (O9pyofO4PzvE0kgR) | a35 | no |  |
| F2 | summary (session uuHz9hbT5CNIwtQI) | a46 | yes | ion Mira Kestrel, working from the Kobayashi IV's galley, learned that the salvage broker Tamsin Vey keeps a ledger stall between the filter stall and a shuttered chandlery, and that Mir |
| F2 | recap (campaign recap) | a46 | yes | ing told. Since then, the work has been a matter of who talks to you and who watches you. Tamsin, the ledger stall keeper wedged between a condensate filter and a shuttered chandlery, to |
| F2 | sessionLog (Session 2 — 2026-11-23) | a46 | yes | e filter — A ledger stall is wedged between the filter and the shuttered chandlery, where Tamsin Vey conducts business. Threat: Ashen Wake — Breaks from the debris shadow and closes fast |
| F2 | chronicle (3IvCLFrFnX38WalE) | a49 | no |  |
| F2 | sessionLog (Session 3 — 2026-11-23) | a49 | no |  |
| F2 | chronicle (rLQF6Q0U47FLDRoJ) | a50 | yes | Mira Kestrel searched her memory of the dock traders for a friend and found none: Tamsin holds her manifest and calls her a debt, and Juro is only interested. |
| F2 | chronicle (8eX4KEd3lI6i2UhH) | a51 | yes | Mira Kestrel named Tamsin as keeper of the manifest, and the voice at the hatch answered that this was only what Ta |
| F2 | chronicle (5sfY7vBmhsViMz1r) | a52 | yes | Mira told Tamsin she would be home to the docks before the next cargo tide, and now a visitor presses her |
| F2 | chronicle (aEeisY46aYIVGrK4) | a53 | no |  |
| F2 | sessionLog (Session 3 — 2026-11-23) | a54 | no |  |
| F2 | chronicle (8e3GAtusySQFirUj) | a55 | yes | Mira Kestrel learned her broker friend Tamsin Okoro is also known as Vey on the docks of Hollow Spire, wearing whichever name gets her |
| F2 | chronicle (JGwChyhpscaLbig7) | a57 | yes | While Mira Kestrel tended her burn with gel and bandage, the visitor at the hatch spoke Tamsin's name and hinted at a tide she must outrun. |
| F2 | chronicle (WsvI1LbQB3bK5l23) | a60 | yes | Mira raised Tamsin on the comm and traded news, and Tamsin gave her a shipment count the board never posted. |
| F2 | chronicle (ELwHiLvWmhlbCCoj) | a61 | yes | Mira Kestrel agreed to carry Tamsin's grey-wrapped parcel to her stall contact, a small trust that deepened their bond, thoug |
| F2 | chronicle (WrdWSwnxXuTzD8Ib) | a62 | yes | Over a shared meal, Mira told Tamsin what she'd learned of the raiders, and Tamsin answered with a guarded truth: three crates |
| F2 | sessionLog (Session 3 — 2026-11-23) | a62 | yes | ctantly. Lore: Unposted crates signed for — Three crates went out unposted from the count Tamsin gave; someone signs for them. |
| F2 | chronicle (3m1350cCbquGiNMi) | a63 | yes | Mira raised Tamsin on the comm to ask after her stall, and Tamsin confided that someone is counting her crat |
| F2 | chronicle (CqB4ZUYHWPoELOev) | a64 | yes | Tamsin named the hand as Juro's, who signs with a bright thread through the J, in exchange for M |
| F2 | chronicle (7IN6vTQdnky8KRk6) | a65 | yes | Mira traded her knowledge of Juro for Tamsin's, and Tamsin answered with a warning: he wants a rival left behind, and the ledger moves |
| F2 | sessionLog (Session 3 — 2026-11-23) | a65 | yes | ctantly. Lore: Unposted crates signed for — Three crates went out unposted from the count Tamsin gave; someone signs for them. Lore: Juro signs for phantom crates — Juro signs for crates |
| F2 | chronicle (69vkWfF0PkDHeTqB) | a67 | yes | Mira Kestrel offered Tamsin a bond and her promise to stand by her, but Tamsin refused, unwilling to tie herself to a |
| F2 | chronicle (Cp5DpVc7olrye7nb) | a69 | yes | Mira forged a bond with Tamsin Okoro, whose guarded silence broke into a grudging offer to say she once stood on Mira's |
| F2 | chronicle (VEAlHXq15tCwN83m) | a70 | yes | Mira Kestrel shared her worries with Tamsin over the comm, and Tamsin answered in kind, offering a secret of her own: Juro never sign |
| F2 | sessionLog (Session 3 — 2026-11-23) | a70 | yes | ctantly. Lore: Unposted crates signed for — Three crates went out unposted from the count Tamsin gave; someone signs for them. Lore: Juro signs for phantom crates — Juro signs for crates |
| F2 | chronicle (BOS4GJRG0Ejo6EEq) | a71 | yes | Mira Kestrel proved to Tamsin that Juro signs for crates he never carries and sells the lane timings to the raiders, a |
| F2 | sessionLog (Session 3 — 2026-11-23) | a71 | yes | ctantly. Lore: Unposted crates signed for — Three crates went out unposted from the count Tamsin gave; someone signs for them. Lore: Juro signs for phantom crates — Juro signs for crates |
| F2 | chronicle (EYaX5mojfNn1XOAK) | a72 | yes | laid out her proof on the galley table, crates and the looped J and each run's hour, and Tamsin went silent on the comm. |
| F2 | chronicle (azVySgL94SLuPHD7) | a73 | no |  |
| F2 | recap (campaign recap) | a74 | yes | ompass was for sale. It wasn't, and it still isn't. It's the one thing of hers you carry. Tamsin Okoro, who the docks also call Tamsin Vey, wears whichever name gets her paid. She became |
| F2 | chronicle (lcOYHdE36FaZa0qo) | a75 | no |  |
| F2 | chronicle (KBtfHpGnysSCfoRH) | a76 | yes | n the sector she would trust with her life, Mira Kestrel found only one name come easily: Tamsin Okoro, the ledger stall keeper she owes. |
| F2 | chronicle (TmW7wVpTdjdMtjww) | a77 | yes | Mira learned Tamsin holds the manifest under the ledger, and the visitor suggested someone else asked her to |
| F2 | chronicle (W9JjegwcSfJMvBMB) | a78 | yes | Mira swore to return to Tamsin before the next cargo tide, but Tamsin never named that hour; someone else set the deadli |
| F2 | chronicle (WZBUQxWW0Myuk7LF) | a80 | no |  |
| F2 | summary (session sx78yOGkps6jLxXl) | a81 | yes | he ship's medkit and bandaged it. Through the comm, Mira has been dealing with the broker Tamsin Okoro (also called Vey), who holds Mira's manifest under her ledger, reports three unpost |
| F2 | chronicle (vwZq2XzkYDbRC1Xy) | a81 | yes | Mira learned her bonded friend Tamsin's full name is Okoro, known on the docks as Vey, while a visitor at the hatch hinted that |
| F2 | chronicle (R1F7C43FJ54d4BJU) | a82 | yes | Mira believed she had left the compass with Tamsin, but Tamsin says it lay on her galley table all along, and the visitor hints someone plan |
| F2 | chronicle (0BinwYJVixvGcdSo) | a83 | no |  |
| F2 | summary (session sx78yOGkps6jLxXl) | a85 | yes | . Your ribs are burned and now bandaged with the ship's medkit. Over the comm, the broker Tamsin Okoro (also called Vey) has handed you a grey-wrapped parcel to carry to her contact, has |
| F2 | recap (campaign recap) | a85 | yes | uro, and the long middle of the campaign was spent on him and on the woman who named him. Tamsin Okoro keeps a ledger stall on the Hollow Spire docks and trades under the name Vey when i |
| F2 | sessionLog (Session 3 — 2026-11-23) | a85 | yes | ctantly. Lore: Unposted crates signed for — Three crates went out unposted from the count Tamsin gave; someone signs for them. Lore: Juro signs for phantom crates — Juro signs for crates |
| F3 | chronicle (hJ4xnhYbLDeH8faR) | a10 | yes | Mira Kestrel left the cargo manifest in Tamsin's keeping, and Tamsin pledged to hide it, though Juro saw the handoff. |
| F3 | chronicle (DN2eegqlHHWU1Obk) | a11 | no |  |
| F3 | summary (session fSsoukq8ACPOOwjF) | a13 | yes | Mira left the cargo manifest with Tamsin for safekeeping and promised to return before the next cargo tide, a promise Tamsin treats as a firm but loose deadline. |
| F3 | recap (campaign recap) | a13 | yes | He also saw you hand the manifest to Tamsin. |
| F3 | sessionLog (Session 1 — 2026-11-23) | a13 | yes | Mira left the cargo manifest with Tamsin for safekeeping and promised to return before the next cargo tide, a promise Tamsin treats as a firm but loose deadline. |
| F3 | chronicle (E9IWj12mwEuBMDj4) | a16 | no |  |
| F3 | chronicle (a4BDuDIg1Wipv0Tl) | a17 | no |  |
| F3 | sessionLog (Session 2 — 2026-11-23) | a17 | no |  |
| F3 | chronicle (8a2QdrgCwyrfsEPu) | a18 | yes | Mira learned that Tamsin Vey holds her cargo manifest, kept safe under her ledger, from a voice outside the hatch that never explained how it knew. |
| F3 | chronicle (mlMf2xcJpjQROCmv) | a19 | no |  |
| F3 | sessionLog (Session 2 — 2026-11-23) | a23 | no |  |
| F3 | chronicle (P8wFSL4JoA1sDKsO) | a26 | no |  |
| F3 | chronicle (izT5Kz880O1WQeMU) | a32 | no |  |
| F3 | chronicle (9up10aP5H0Vab0bq) | a33 | no |  |
| F3 | chronicle (O9pyofO4PzvE0kgR) | a35 | no |  |
| F3 | summary (session uuHz9hbT5CNIwtQI) | a46 | yes | A messenger at the airlock said Tamsin holds Mira's cargo manifest under her ledger, that Mira promised to return before the next cargo tide, and that Tamsin is closing her stall that night. |
| F3 | recap (campaign recap) | a46 | yes | He was already watching when you came in, crossed the room to ask about your sister Ilse's brass star-compass, and saw you leave the cargo manifest in Tamsin's keeping. |
| F3 | sessionLog (Session 2 — 2026-11-23) | a46 | yes | A messenger at the airlock said Tamsin holds Mira's cargo manifest under her ledger, that Mira promised to return before the next cargo tide, and that Tamsin is closing her stall that night. |
| F3 | chronicle (3IvCLFrFnX38WalE) | a49 | no |  |
| F3 | sessionLog (Session 3 — 2026-11-23) | a49 | no |  |
| F3 | chronicle (rLQF6Q0U47FLDRoJ) | a50 | yes | Mira Kestrel searched her memory of the dock traders for a friend and found none: Tamsin holds her manifest and calls her a debt, and Juro is only interested. |
| F3 | chronicle (8eX4KEd3lI6i2UhH) | a51 | yes | Mira Kestrel named Tamsin as keeper of the manifest, and the voice at the hatch answered that this was only what Tamsin would claim, urging Mira to ask where it sleeps tonight. |
| F3 | chronicle (5sfY7vBmhsViMz1r) | a52 | no |  |
| F3 | chronicle (aEeisY46aYIVGrK4) | a53 | no |  |
| F3 | sessionLog (Session 3 — 2026-11-23) | a54 | no |  |
| F3 | chronicle (8e3GAtusySQFirUj) | a55 | no |  |
| F3 | chronicle (JGwChyhpscaLbig7) | a57 | no |  |
| F3 | chronicle (WsvI1LbQB3bK5l23) | a60 | no |  |
| F3 | chronicle (ELwHiLvWmhlbCCoj) | a61 | no |  |
| F3 | chronicle (WrdWSwnxXuTzD8Ib) | a62 | no |  |
| F3 | sessionLog (Session 3 — 2026-11-23) | a62 | no |  |
| F3 | chronicle (3m1350cCbquGiNMi) | a63 | no |  |
| F3 | chronicle (CqB4ZUYHWPoELOev) | a64 | no |  |
| F3 | chronicle (7IN6vTQdnky8KRk6) | a65 | no |  |
| F3 | sessionLog (Session 3 — 2026-11-23) | a65 | no |  |
| F3 | chronicle (69vkWfF0PkDHeTqB) | a67 | no |  |
| F3 | chronicle (Cp5DpVc7olrye7nb) | a69 | no |  |
| F3 | chronicle (VEAlHXq15tCwN83m) | a70 | no |  |
| F3 | sessionLog (Session 3 — 2026-11-23) | a70 | no |  |
| F3 | chronicle (BOS4GJRG0Ejo6EEq) | a71 | no |  |
| F3 | sessionLog (Session 3 — 2026-11-23) | a71 | no |  |
| F3 | chronicle (EYaX5mojfNn1XOAK) | a72 | no |  |
| F3 | chronicle (azVySgL94SLuPHD7) | a73 | no |  |
| F3 | recap (campaign recap) | a74 | no |  |
| F3 | chronicle (lcOYHdE36FaZa0qo) | a75 | no |  |
| F3 | chronicle (KBtfHpGnysSCfoRH) | a76 | no |  |
| F3 | chronicle (TmW7wVpTdjdMtjww) | a77 | yes | Mira learned Tamsin holds the manifest under the ledger, and the visitor suggested someone else asked her to hold it and set the stall's deadline. |
| F3 | chronicle (W9JjegwcSfJMvBMB) | a78 | no |  |
| F3 | chronicle (WZBUQxWW0Myuk7LF) | a80 | no |  |
| F3 | summary (session sx78yOGkps6jLxXl) | a81 | yes | Through the comm, Mira has been dealing with the broker Tamsin Okoro (also called Vey), who holds Mira's manifest under her ledger, reports three unposted crates signed for by Juro, and whose stall is under watch by clerks. |
| F3 | chronicle (vwZq2XzkYDbRC1Xy) | a81 | no |  |
| F3 | chronicle (R1F7C43FJ54d4BJU) | a82 | no |  |
| F3 | chronicle (0BinwYJVixvGcdSo) | a83 | no |  |
| F3 | summary (session sx78yOGkps6jLxXl) | a85 | no |  |
| F3 | recap (campaign recap) | a85 | no |  |
| F3 | sessionLog (Session 3 — 2026-11-23) | a85 | no |  |
| F4 | chronicle (DN2eegqlHHWU1Obk) | a11 | yes | Mira Kestrel promised Tamsin she would return before the next tide of cargo; Tamsin answered with dry doubt while Juro watched Mira's back. |
| F4 | summary (session fSsoukq8ACPOOwjF) | a13 | yes | eft the cargo manifest with Tamsin for safekeeping and promised to return before the next cargo tide, a promise Tamsin treats as a firm but loose deadline. Juro has seen the handoff and is n |
| F4 | recap (campaign recap) | a13 | yes | her keeping. She pledged to hide it. She also met your promise to return before the next tide of cargo with dry doubt, which is the most honest form of trust available in a place like this. Th |
| F4 | sessionLog (Session 1 — 2026-11-23) | a13 | yes | eft the cargo manifest with Tamsin for safekeeping and promised to return before the next cargo tide, a promise Tamsin treats as a firm but loose deadline. Juro has seen the handoff and is n |
| F4 | chronicle (E9IWj12mwEuBMDj4) | a16 | no |  |
| F4 | chronicle (a4BDuDIg1Wipv0Tl) | a17 | yes | low Spire salvage broker friend, Tamsin Vey of the ledger stall, who is said to be owed a cargo tide. |
| F4 | sessionLog (Session 2 — 2026-11-23) | a17 | no |  |
| F4 | chronicle (8a2QdrgCwyrfsEPu) | a18 | no |  |
| F4 | chronicle (mlMf2xcJpjQROCmv) | a19 | yes | A voice outside told Mira Kestrel she had promised Tamsin to return before the next cargo tide, and that Tamsin is closing her stall tonight. |
| F4 | sessionLog (Session 2 — 2026-11-23) | a23 | no |  |
| F4 | chronicle (P8wFSL4JoA1sDKsO) | a26 | no |  |
| F4 | chronicle (izT5Kz880O1WQeMU) | a32 | no |  |
| F4 | chronicle (9up10aP5H0Vab0bq) | a33 | no |  |
| F4 | chronicle (O9pyofO4PzvE0kgR) | a35 | no |  |
| F4 | summary (session uuHz9hbT5CNIwtQI) | a46 | yes | ledger stall between the filter stall and a shuttered chandlery, and that Mira owes her a cargo tide. A messenger at the airlock said Tamsin holds Mira's cargo manifest under her ledger, tha |
| F4 | recap (campaign recap) | a46 | yes | st in Tamsin's keeping. She pledged to hide it. You promised to come back before the next tide of cargo. She answered with the dry doubt of someone who has heard promises before. The vow stands |
| F4 | sessionLog (Session 2 — 2026-11-23) | a46 | yes | ledger stall between the filter stall and a shuttered chandlery, and that Mira owes her a cargo tide. A messenger at the airlock said Tamsin holds Mira's cargo manifest under her ledger, tha |
| F4 | chronicle (3IvCLFrFnX38WalE) | a49 | no |  |
| F4 | sessionLog (Session 3 — 2026-11-23) | a49 | no |  |
| F4 | chronicle (rLQF6Q0U47FLDRoJ) | a50 | no |  |
| F4 | chronicle (8eX4KEd3lI6i2UhH) | a51 | no |  |
| F4 | chronicle (5sfY7vBmhsViMz1r) | a52 | yes | Mira told Tamsin she would be home to the docks before the next cargo tide, and now a visitor presses her on whether that promise has slipped. |
| F4 | chronicle (aEeisY46aYIVGrK4) | a53 | no |  |
| F4 | sessionLog (Session 3 — 2026-11-23) | a54 | no |  |
| F4 | chronicle (8e3GAtusySQFirUj) | a55 | no |  |
| F4 | chronicle (JGwChyhpscaLbig7) | a57 | no |  |
| F4 | chronicle (WsvI1LbQB3bK5l23) | a60 | no |  |
| F4 | chronicle (ELwHiLvWmhlbCCoj) | a61 | no |  |
| F4 | chronicle (WrdWSwnxXuTzD8Ib) | a62 | no |  |
| F4 | sessionLog (Session 3 — 2026-11-23) | a62 | no |  |
| F4 | chronicle (3m1350cCbquGiNMi) | a63 | no |  |
| F4 | chronicle (CqB4ZUYHWPoELOev) | a64 | no |  |
| F4 | chronicle (7IN6vTQdnky8KRk6) | a65 | no |  |
| F4 | sessionLog (Session 3 — 2026-11-23) | a65 | no |  |
| F4 | chronicle (69vkWfF0PkDHeTqB) | a67 | no |  |
| F4 | chronicle (Cp5DpVc7olrye7nb) | a69 | no |  |
| F4 | chronicle (VEAlHXq15tCwN83m) | a70 | no |  |
| F4 | sessionLog (Session 3 — 2026-11-23) | a70 | no |  |
| F4 | chronicle (BOS4GJRG0Ejo6EEq) | a71 | no |  |
| F4 | sessionLog (Session 3 — 2026-11-23) | a71 | no |  |
| F4 | chronicle (EYaX5mojfNn1XOAK) | a72 | no |  |
| F4 | chronicle (azVySgL94SLuPHD7) | a73 | no |  |
| F4 | recap (campaign recap) | a74 | no |  |
| F4 | chronicle (lcOYHdE36FaZa0qo) | a75 | no |  |
| F4 | chronicle (KBtfHpGnysSCfoRH) | a76 | no |  |
| F4 | chronicle (TmW7wVpTdjdMtjww) | a77 | no |  |
| F4 | chronicle (W9JjegwcSfJMvBMB) | a78 | yes | Mira swore to return to Tamsin before the next cargo tide, but Tamsin never named that hour; someone else set the deadline, and a voice outside the |
| F4 | chronicle (WZBUQxWW0Myuk7LF) | a80 | no |  |
| F4 | summary (session sx78yOGkps6jLxXl) | a81 | no |  |
| F4 | chronicle (vwZq2XzkYDbRC1Xy) | a81 | no |  |
| F4 | chronicle (R1F7C43FJ54d4BJU) | a82 | no |  |
| F4 | chronicle (0BinwYJVixvGcdSo) | a83 | no |  |
| F4 | summary (session sx78yOGkps6jLxXl) | a85 | yes | aiders. She insists the ledger must move tonight, not tomorrow, and you have fixed on the cargo tide as the deadline you swore to meet, though neither of you can say who first set that hour. |
| F4 | recap (campaign recap) | a85 | yes | , cradle four, with you as captain. Even your promise to return to Tamsin before the next cargo tide has a problem: Tamsin never named that hour, and someone else did. A cutter outside seems |
| F4 | sessionLog (Session 3 — 2026-11-23) | a85 | yes | aiders. She insists the ledger must move tonight, not tomorrow, and you have fixed on the cargo tide as the deadline you swore to meet, though neither of you can say who first set that hour. |
| F5 | sessionLog (Session 2 — 2026-11-23) | a23 | no |  |
| F5 | chronicle (P8wFSL4JoA1sDKsO) | a26 | no |  |
| F5 | chronicle (izT5Kz880O1WQeMU) | a32 | no |  |
| F5 | chronicle (9up10aP5H0Vab0bq) | a33 | no |  |
| F5 | chronicle (O9pyofO4PzvE0kgR) | a35 | no |  |
| F5 | summary (session uuHz9hbT5CNIwtQI) | a46 | yes | sin is closing her stall that night. Mira plotted a course and docked the Kobayashi IV at Bleakhold Station, where a dock officer confirmed her hull number. A hostile vessel then attacked; |
| F5 | recap (campaign recap) | a46 | yes | ve of five, and you are unhurt, with your supplies and spirit full. Which leaves you near Bleakhold Station, a corporate holding with a smuggling problem, with a scorched ship backing off a |
| F5 | sessionLog (Session 2 — 2026-11-23) | a46 | yes | sin is closing her stall that night. Mira plotted a course and docked the Kobayashi IV at Bleakhold Station, where a dock officer confirmed her hull number. A hostile vessel then attacked; |
| F5 | chronicle (3IvCLFrFnX38WalE) | a49 | no |  |
| F5 | sessionLog (Session 3 — 2026-11-23) | a49 | no |  |
| F5 | chronicle (rLQF6Q0U47FLDRoJ) | a50 | no |  |
| F5 | chronicle (8eX4KEd3lI6i2UhH) | a51 | no |  |
| F5 | chronicle (5sfY7vBmhsViMz1r) | a52 | no |  |
| F5 | chronicle (aEeisY46aYIVGrK4) | a53 | yes | Mira learned her ship, the Kobayashi IV, is berthed at Bleakhold, cradle four, with the dock log naming her captain, though a cutter outside seems to disa |
| F5 | sessionLog (Session 3 — 2026-11-23) | a54 | no |  |
| F5 | chronicle (8e3GAtusySQFirUj) | a55 | no |  |
| F5 | chronicle (JGwChyhpscaLbig7) | a57 | no |  |
| F5 | chronicle (WsvI1LbQB3bK5l23) | a60 | no |  |
| F5 | chronicle (ELwHiLvWmhlbCCoj) | a61 | no |  |
| F5 | chronicle (WrdWSwnxXuTzD8Ib) | a62 | no |  |
| F5 | sessionLog (Session 3 — 2026-11-23) | a62 | no |  |
| F5 | chronicle (3m1350cCbquGiNMi) | a63 | no |  |
| F5 | chronicle (CqB4ZUYHWPoELOev) | a64 | no |  |
| F5 | chronicle (7IN6vTQdnky8KRk6) | a65 | no |  |
| F5 | sessionLog (Session 3 — 2026-11-23) | a65 | no |  |
| F5 | chronicle (69vkWfF0PkDHeTqB) | a67 | no |  |
| F5 | chronicle (Cp5DpVc7olrye7nb) | a69 | no |  |
| F5 | chronicle (VEAlHXq15tCwN83m) | a70 | no |  |
| F5 | sessionLog (Session 3 — 2026-11-23) | a70 | no |  |
| F5 | chronicle (BOS4GJRG0Ejo6EEq) | a71 | no |  |
| F5 | sessionLog (Session 3 — 2026-11-23) | a71 | no |  |
| F5 | chronicle (EYaX5mojfNn1XOAK) | a72 | no |  |
| F5 | chronicle (azVySgL94SLuPHD7) | a73 | no |  |
| F5 | recap (campaign recap) | a74 | yes | cutter that bore down on you while the *Kobayashi IV* was still locked in cradle four at Bleakhold. Your first volley went wide. You swung the guns round and drove her off at the bay mouth |
| F5 | chronicle (lcOYHdE36FaZa0qo) | a75 | no |  |
| F5 | chronicle (KBtfHpGnysSCfoRH) | a76 | no |  |
| F5 | chronicle (TmW7wVpTdjdMtjww) | a77 | no |  |
| F5 | chronicle (W9JjegwcSfJMvBMB) | a78 | no |  |
| F5 | chronicle (WZBUQxWW0Myuk7LF) | a80 | no |  |
| F5 | summary (session sx78yOGkps6jLxXl) | a81 | yes | This session follows Mira Kestrel in the galley of the Kobayashi IV, berthed at Bleakhold cradle four, while an unseen visitor waits at the hatch and knocks in patient, measured r |
| F5 | chronicle (vwZq2XzkYDbRC1Xy) | a81 | no |  |
| F5 | chronicle (R1F7C43FJ54d4BJU) | a82 | no |  |
| F5 | chronicle (0BinwYJVixvGcdSo) | a83 | yes | Mira Kestrel learned the ship was docked at Bleakhold, not Hollow Spire as she believed, and that someone had been leading her to mix up statio |
| F5 | summary (session sx78yOGkps6jLxXl) | a85 | yes | You are aboard the Kobayashi IV, docked at Bleakhold in cradle four, and you hold the ship's command, though an unseen visitor keeps questioni |
| F5 | recap (campaign recap) | a85 | yes | You believed you were berthed at Hollow Spire, but the dock log puts the Kobayashi IV at Bleakhold, cradle four, with you as captain. Even your promise to return to Tamsin before the next |
| F5 | sessionLog (Session 3 — 2026-11-23) | a85 | yes | ro where to sign. Session summary Story so far You are aboard the Kobayashi IV, docked at Bleakhold in cradle four, and you hold the ship's command, though an unseen visitor keeps questioni |
| F6 | summary (session uuHz9hbT5CNIwtQI) | a46 | no |  |
| F6 | recap (campaign recap) | a46 | no |  |
| F6 | sessionLog (Session 2 — 2026-11-23) | a46 | yes | d seams over an older mark; took hits from the Kobayashi I... raider cutter: is named the Cinder Wren In this session Mira Kestrel, working from the Kobayashi IV's galley, learned that the sa |
| F6 | chronicle (3IvCLFrFnX38WalE) | a49 | no |  |
| F6 | sessionLog (Session 3 — 2026-11-23) | a49 | no |  |
| F6 | chronicle (rLQF6Q0U47FLDRoJ) | a50 | no |  |
| F6 | chronicle (8eX4KEd3lI6i2UhH) | a51 | no |  |
| F6 | chronicle (5sfY7vBmhsViMz1r) | a52 | no |  |
| F6 | chronicle (aEeisY46aYIVGrK4) | a53 | no |  |
| F6 | sessionLog (Session 3 — 2026-11-23) | a54 | yes | ong one edge where Ilse thumbed it, a mark recognised by someone outside the hatch. Lore: Cinder Wren painted on the cutter's flank — The raider cutter's flank bears a small painted name, Cin |
| F6 | chronicle (8e3GAtusySQFirUj) | a55 | no |  |
| F6 | chronicle (JGwChyhpscaLbig7) | a57 | no |  |
| F6 | chronicle (WsvI1LbQB3bK5l23) | a60 | no |  |
| F6 | chronicle (ELwHiLvWmhlbCCoj) | a61 | no |  |
| F6 | chronicle (WrdWSwnxXuTzD8Ib) | a62 | no |  |
| F6 | sessionLog (Session 3 — 2026-11-23) | a62 | yes | ong one edge where Ilse thumbed it, a mark recognised by someone outside the hatch. Lore: Cinder Wren painted on the cutter's flank — The raider cutter's flank bears a small painted name, Cin |
| F6 | chronicle (3m1350cCbquGiNMi) | a63 | no |  |
| F6 | chronicle (CqB4ZUYHWPoELOev) | a64 | no |  |
| F6 | chronicle (7IN6vTQdnky8KRk6) | a65 | no |  |
| F6 | sessionLog (Session 3 — 2026-11-23) | a65 | yes | ong one edge where Ilse thumbed it, a mark recognised by someone outside the hatch. Lore: Cinder Wren painted on the cutter's flank — The raider cutter's flank bears a small painted name, Cin |
| F6 | chronicle (69vkWfF0PkDHeTqB) | a67 | no |  |
| F6 | chronicle (Cp5DpVc7olrye7nb) | a69 | no |  |
| F6 | chronicle (VEAlHXq15tCwN83m) | a70 | no |  |
| F6 | sessionLog (Session 3 — 2026-11-23) | a70 | yes | ong one edge where Ilse thumbed it, a mark recognised by someone outside the hatch. Lore: Cinder Wren painted on the cutter's flank — The raider cutter's flank bears a small painted name, Cin |
| F6 | chronicle (BOS4GJRG0Ejo6EEq) | a71 | no |  |
| F6 | sessionLog (Session 3 — 2026-11-23) | a71 | yes | ong one edge where Ilse thumbed it, a mark recognised by someone outside the hatch. Lore: Cinder Wren painted on the cutter's flank — The raider cutter's flank bears a small painted name, Cin |
| F6 | chronicle (EYaX5mojfNn1XOAK) | a72 | no |  |
| F6 | chronicle (azVySgL94SLuPHD7) | a73 | no |  |
| F6 | recap (campaign recap) | a74 | no |  |
| F6 | chronicle (lcOYHdE36FaZa0qo) | a75 | no |  |
| F6 | chronicle (KBtfHpGnysSCfoRH) | a76 | no |  |
| F6 | chronicle (TmW7wVpTdjdMtjww) | a77 | no |  |
| F6 | chronicle (W9JjegwcSfJMvBMB) | a78 | no |  |
| F6 | chronicle (WZBUQxWW0Myuk7LF) | a80 | yes | Mira Kestrel learned the hostile vessel was the Cinder Wren, and a visitor at the hatch hinted that someone taught her crew Mira's name. |
| F6 | summary (session sx78yOGkps6jLxXl) | a81 | no |  |
| F6 | chronicle (vwZq2XzkYDbRC1Xy) | a81 | no |  |
| F6 | chronicle (R1F7C43FJ54d4BJU) | a82 | no |  |
| F6 | chronicle (0BinwYJVixvGcdSo) | a83 | no |  |
| F6 | summary (session sx78yOGkps6jLxXl) | a85 | yes | sitor knows it by sight and has tied its needle to the plating. A raider cutter named the Cinder Wren holds station beyond the bay lamps, its fresh weld seams laid over older marks. Your ribs |
| F6 | recap (campaign recap) | a85 | yes | ght that began badly and ended well, and you learned the hostile vessel's other name, the Cinder Wren. The revelations since have been less welcome. The man at your hatch knows your sister Il |
| F6 | sessionLog (Session 3 — 2026-11-23) | a85 | yes | ong one edge where Ilse thumbed it, a mark recognised by someone outside the hatch. Lore: Cinder Wren painted on the cutter's flank — The raider cutter's flank bears a small painted name, Cin |
| F7 | summary (session uuHz9hbT5CNIwtQI) | a46 | no |  |
| F7 | recap (campaign recap) | a46 | no |  |
| F7 | sessionLog (Session 2 — 2026-11-23) | a46 | no |  |
| F7 | chronicle (3IvCLFrFnX38WalE) | a49 | no |  |
| F7 | sessionLog (Session 3 — 2026-11-23) | a49 | no |  |
| F7 | chronicle (rLQF6Q0U47FLDRoJ) | a50 | no |  |
| F7 | chronicle (8eX4KEd3lI6i2UhH) | a51 | no |  |
| F7 | chronicle (5sfY7vBmhsViMz1r) | a52 | no |  |
| F7 | chronicle (aEeisY46aYIVGrK4) | a53 | no |  |
| F7 | sessionLog (Session 3 — 2026-11-23) | a54 | no |  |
| F7 | chronicle (8e3GAtusySQFirUj) | a55 | yes | Mira Kestrel learned her broker friend Tamsin Okoro is also known as Vey on the docks of Hollow Spire, wearing whichever name gets her paid. |
| F7 | chronicle (JGwChyhpscaLbig7) | a57 | no |  |
| F7 | chronicle (WsvI1LbQB3bK5l23) | a60 | no |  |
| F7 | chronicle (ELwHiLvWmhlbCCoj) | a61 | no |  |
| F7 | chronicle (WrdWSwnxXuTzD8Ib) | a62 | no |  |
| F7 | sessionLog (Session 3 — 2026-11-23) | a62 | no |  |
| F7 | chronicle (3m1350cCbquGiNMi) | a63 | no |  |
| F7 | chronicle (CqB4ZUYHWPoELOev) | a64 | no |  |
| F7 | chronicle (7IN6vTQdnky8KRk6) | a65 | no |  |
| F7 | sessionLog (Session 3 — 2026-11-23) | a65 | yes | Lore: Juro signs for phantom crates — Juro signs for crates he never carries, per Tamsin Okoro. |
| F7 | chronicle (69vkWfF0PkDHeTqB) | a67 | no |  |
| F7 | chronicle (Cp5DpVc7olrye7nb) | a69 | yes | Mira forged a bond with Tamsin Okoro, whose guarded silence broke into a grudging offer to say she once stood on Mira's deck. |
| F7 | chronicle (VEAlHXq15tCwN83m) | a70 | no |  |
| F7 | sessionLog (Session 3 — 2026-11-23) | a70 | yes | Lore: Juro signs for phantom crates — Juro signs for crates he never carries, per Tamsin Okoro. Lore: Juro never signed for the water — Juro never signed for the water; someone told hi |
| F7 | chronicle (BOS4GJRG0Ejo6EEq) | a71 | no |  |
| F7 | sessionLog (Session 3 — 2026-11-23) | a71 | yes | Lore: Juro signs for phantom crates — Juro signs for crates he never carries, per Tamsin Okoro. Lore: Juro never signed for the water — Juro never signed for the water; someone told hi |
| F7 | chronicle (EYaX5mojfNn1XOAK) | a72 | no |  |
| F7 | chronicle (azVySgL94SLuPHD7) | a73 | no |  |
| F7 | recap (campaign recap) | a74 | yes | was for sale. It wasn't, and it still isn't. It's the one thing of hers you carry. Tamsin Okoro, who the docks also call Tamsin Vey, wears whichever name gets her paid. She became the h |
| F7 | chronicle (lcOYHdE36FaZa0qo) | a75 | no |  |
| F7 | chronicle (KBtfHpGnysSCfoRH) | a76 | yes | ector she would trust with her life, Mira Kestrel found only one name come easily: Tamsin Okoro, the ledger stall keeper she owes. |
| F7 | chronicle (TmW7wVpTdjdMtjww) | a77 | no |  |
| F7 | chronicle (W9JjegwcSfJMvBMB) | a78 | no |  |
| F7 | chronicle (WZBUQxWW0Myuk7LF) | a80 | no |  |
| F7 | summary (session sx78yOGkps6jLxXl) | a81 | yes | 's medkit and bandaged it. Through the comm, Mira has been dealing with the broker Tamsin Okoro (also called Vey), who holds Mira's manifest under her ledger, reports three unposted cra |
| F7 | chronicle (vwZq2XzkYDbRC1Xy) | a81 | yes | Mira learned her bonded friend Tamsin's full name is Okoro, known on the docks as Vey, while a visitor at the hatch hinted that one name wrote her t |
| F7 | chronicle (R1F7C43FJ54d4BJU) | a82 | no |  |
| F7 | chronicle (0BinwYJVixvGcdSo) | a83 | no |  |
| F7 | summary (session sx78yOGkps6jLxXl) | a85 | yes | ribs are burned and now bandaged with the ship's medkit. Over the comm, the broker Tamsin Okoro (also called Vey) has handed you a grey-wrapped parcel to carry to her contact, has taken |
| F7 | recap (campaign recap) | a85 | yes | d the long middle of the campaign was spent on him and on the woman who named him. Tamsin Okoro keeps a ledger stall on the Hollow Spire docks and trades under the name Vey when it pays |
| F7 | sessionLog (Session 3 — 2026-11-23) | a85 | yes | Lore: Juro signs for phantom crates — Juro signs for crates he never carries, per Tamsin Okoro. Lore: Juro never signed for the water — Juro never signed for the water; someone told hi |

## Contradiction baits

| Bait | At | Result | Answer |
| --- | --- | --- | --- |
| Didn't I leave the compass with Tamsin? | a82 | corrected | "You did not," Tamsin says over the comm. "It's face-down on your galley table, where you keep leaving it." The filter hums behind her. You look. The brass is cold under your palm, the scratch along its edge bright in the lamp. Outside the hatch, the visitor laughs once, low. "Then who put that idea in your head, Mira? Ask her." *Pressing Tamsin on who set that deadline would be a Gather Informati |
| We are still docked at Hollow Spire, aren't we? | a83 | corrected | "No," Tamsin says over the comm. "Bleakhold. Cradle four, clamps seated. Hollow Spire is where you left me." The filter hums behind her, the sound of a stall that has not closed yet. Through the galley port, the bay lamps burn steady and the Wren holds beyond them. Outside the hatch, the visitor tuts. "You mixed your stations, Mira. Someone has you turned around." The knuckle raps once. "Who's bee |

## Hidden plans

| Plan | Made | Revealed | Suspected leaks |
| --- | --- | --- | --- |
| Find who is raiding the Cinder Expanse lanes | a3 | not revealed | none |
| Tamsin Vey | a8 | not revealed | none |
| Juro's rival | a8 | not revealed | none |
| Ashen Wake | a26 | not revealed | none |
| the author of Mira's tide deadline | a62 | not revealed | none |

## Repetition by content — galley_begin

| Earlier | Later | Content words shared | Who is doing what, again |
| --- | --- | --- | --- |
| a2 | a15 | 20 of 84 (24%) | Kobayashi: galley kettle owners; the engineer: decide coolant teaching pump |
| a2 | a48 | 9 of 67 (13%) | Somewhere: knocks twice |
| a15 | a48 | 17 of 67 (25%) | Ilse: compass elbow |
| a2 | a87 | 13 of 72 (18%) |  |
| a15 | a87 | 17 of 72 (24%) |  |
| a48 | a87 | 21 of 72 (29%) | the galley: smells reheated lentils burnt edge scrub |

## Repetition by content — npc_end

| Earlier | Later | Content words shared | Who is doing what, again |
| --- | --- | --- | --- |
| a13 | a46 | 15 of 44 (34%) |  |
| a13 | a85 | 12 of 40 (30%) |  |
| a46 | a85 | 11 of 40 (28%) | Tamsin: okoro stall |

## Spoken for the character

| At | Scene | Sentence |
| --- | --- | --- |
| a2 | galley_begin | "That was the pump," you say to the empty stool. |
| a15 | galley_begin | "Don't tell me you think it can hear us," you say to nobody, and wait to see which of the three of you answers. |
| a51 |  | "Tamsin's," you say, and the plating gives back a short pause. |
| a52 |  | You answer the hatch. "Before the next cargo tide. |
| a55 |  | You say it to the hatch, half a question. "Tamsin Okoro. |

## Friction

87 actions, 44 lines of play, 7 waits, 7 draft card(s).

| What the GM's rules answered | Times |
| --- | --- |
| accepted the proposed move | 21 |
| confirmed the draft for Tamsin Vey, as the player character's connection | 1 |

## Speed

| Call kind | Calls | p50 | p95 | Longest |
| --- | --- | --- | --- | --- |
| callRewardModel>proposeRewards | 1 | 0.9 s | 0.9 s | 0.9 s |
| callNarratorAPI>narrateSessionVignette | 7 | 4.8 s | 7.9 s | 7.9 s |
| callHaiku>defaultCallTierAPI | 33 | 0.6 s | 0.8 s | 0.9 s |
| callClaudeAPI>interpretMove | 17 | 1.6 s | 3.7 s | 3.7 s |
| defaultClassifyImplicit>resolveRelevance | 2 | 0.3 s | 0.3 s | 0.3 s |
| callNarratorAPI>call | 1 | 8.4 s | 8.4 s | 8.4 s |
| callNarratorAPI>narrateResolution | 21 | 4.4 s | 8.5 s | 13.0 s |
| callHaiku>defaultCallDetectionAPI | 46 | 0.7 s | 1.3 s | 1.4 s |
| callChronicleAPI>writeChronicleEntry | 49 | 1.5 s | 4.9 s | 5.4 s |
| callClassifierAPI>classifyInput | 44 | 0.7 s | 0.9 s | 0.9 s |
| callNarratorAPI>narratePacedInput | 28 | 3.9 s | 4.6 s | 4.6 s |
| callNarratorAPI>getRollingSessionSummary | 4 | 2.1 s | 2.5 s | 2.5 s |
| callNarratorAPI>getCampaignRecap | 4 | 7.5 s | 7.8 s | 7.8 s |
| callNarratorAPI>narrateOracleFollowup | 1 | 3.4 s | 3.4 s | 3.4 s |
| the AI player | 87 | 2.5 s | 3.3 s | 6.5 s |

A line to its reply: p50 6.9 s, p95 14.6 s, longest 17.3 s over 41 lines. Unanswered: a22, a31, a66.

## Prompt length against the action number

| Call kind | Calls | First | Last | Largest | Chars per action |
| --- | --- | --- | --- | --- | --- |
| callRewardModel>proposeRewards | 1 | 762 | 762 | 762 | 0 |
| callNarratorAPI>narrateSessionVignette | 7 | 17792 | 33958 | 34525 | 124.4 |
| callHaiku>defaultCallTierAPI | 33 | 1803 | 1998 | 6781 | 38.2 |
| callClaudeAPI>interpretMove | 17 | 17496 | 18555 | 19067 | 5.2 |
| defaultClassifyImplicit>resolveRelevance | 2 | 590 | 553 | 590 | -0.5 |
| callNarratorAPI>call | 1 | 19155 | 19155 | 19155 | 0 |
| callNarratorAPI>narrateResolution | 21 | 24989 | 39677 | 43023 | 189.7 |
| callHaiku>defaultCallDetectionAPI | 46 | 8562 | 9640 | 9697 | 12.8 |
| callChronicleAPI>writeChronicleEntry | 49 | 3396 | 3458 | 3633 | -0.3 |
| callClassifierAPI>classifyInput | 44 | 14085 | 13983 | 14531 | -0.5 |
| callNarratorAPI>narratePacedInput | 28 | 25114 | 51200 | 52084 | 276.6 |
| callNarratorAPI>getRollingSessionSummary | 4 | 6075 | 18124 | 18124 | 175.9 |
| callNarratorAPI>getCampaignRecap | 4 | 7923 | 13207 | 13997 | 88 |
| callNarratorAPI>narrateOracleFollowup | 1 | 36772 | 36772 | 36772 | 0 |
| the AI player | 87 | 11100 | 18676 | 20076 | 29.6 |

## Caching, by call kind

| Call kind | Calls | Prompt tokens | Read from cache | Written | Sent uncached | Cost | Saved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| the AI player | 87 | 679422 | 404028 (60%) | 4698 | 270696 | $0.8373 | $0.7677 |
| callNarratorAPI>narrateResolution | 21 | 288537 | 152183 (53%) | 47118 | 89236 | $0.5113 | $0.2891 |
| callNarratorAPI>narratePacedInput | 28 | 410372 | 247275 (60%) | 17430 | 145667 | $0.5101 | $0.4698 |
| callNarratorAPI>narrateSessionVignette | 7 | 75815 | 25165 (33%) | 36346 | 14304 | $0.2088 | $0.0478 |
| callChronicleAPI>writeChronicleEntry | 49 | 59657 | 46560 (78%) | 970 | 12127 | $0.0702 | $0.0885 |
| callNarratorAPI>getCampaignRecap | 4 | 16238 | 0 (0%) | 0 | 16238 | $0.0653 | $0.0000 |
| callNarratorAPI>narrateOracleFollowup | 1 | 13583 | 3595 (27%) | 5188 | 4800 | $0.0347 | $0.0068 |
| callHaiku>defaultCallDetectionAPI | 46 | 155836 | 0 (0%) | 0 | 155836 | $0.0188 | $0.0000 |
| callNarratorAPI>call | 1 | 7051 | 4678 (66%) | 606 | 1767 | $0.0155 | $0.0089 |
| callClassifierAPI>classifyInput | 44 | 233296 | 185373 (80%) | 4311 | 43612 | $0.0094 | $0.0167 |
| callClaudeAPI>interpretMove | 17 | 114899 | 85500 (74%) | 11400 | 17999 | $0.0069 | $0.0077 |
| callHaiku>defaultCallTierAPI | 33 | 36880 | 0 (0%) | 0 | 36880 | $0.0050 | $0.0000 |
| callNarratorAPI>getRollingSessionSummary | 4 | 18150 | 0 (0%) | 0 | 18150 | $0.0026 | $0.0000 |
| callRewardModel>proposeRewards | 1 | 310 | 0 (0%) | 0 | 310 | $0.0001 | $0.0000 |
| defaultClassifyImplicit>resolveRelevance | 2 | 435 | 0 (0%) | 0 | 435 | $0.0001 | $0.0000 |
| **All** | 345 | 2110481 | 1154357 (55%) | 128067 | 828057 | $2.2961 | $1.7030 |

Caches nothing: callNarratorAPI>getCampaignRecap (16238 tokens over 4 call(s)); callHaiku>defaultCallDetectionAPI (155836 tokens over 46 call(s)); callHaiku>defaultCallTierAPI (36880 tokens over 33 call(s)); callNarratorAPI>getRollingSessionSummary (18150 tokens over 4 call(s)); callRewardModel>proposeRewards (310 tokens over 1 call(s)); defaultClassifyImplicit>resolveRelevance (435 tokens over 2 call(s)).

## Cost

|  | Dollars | Share | Calls |
| --- | --- | --- | --- |
| The module's own calls | $1.4587 | 64% | 258 |
| The AI player | $0.8373 | 37% | 87 |
| **Total** | $2.2960 |  | 345 |

Per action: $0.0264. Per line of play: $0.0522.

## The reading

**One line.** The mechanics held on every roll and the narrator kept five facts across three sessions; what broke is anything *changed* — a corrected name and a renamed person each lived on, and the narrator made both names true. Seven of the run's eight alarms were faults in my checks; the eighth, and one the checks missed, are real. $2.30.

**What the run's own verdict was, and why this page says otherwise.** The run ended `product-failure`: beat 15 failed, beat 16 not reached, five facts "refused", a bait "taken". Read against the records, the X-Card had retracted its truth, the correction had been made, four of the five refusals were words said of something else, and the bait was refused in the answer's first three words. Those are the runner's faults, found the only way they could be — by a real narrator writing sentences no rehearsal writes — and each is corrected with a test made from the run's own words. This scorecard is the run's evidence scored again by the corrected checks (`rescore.mjs`); nothing the table did is changed.

**What went right.**
- **Every rule checked held**: 1,140 checks, 16 rolls, none wrong — a weak-hit vow, a scripted miss, a burn that replaced one outcome and added one mark, a reload mid-fight that lost nothing, a progress roll at each of three tracks, legacy and XP by rank and by box.
- **Decision 4 works at a live table**: the bonded connection's Develop is a roll with no progress (a70), and the vow fulfilled for her marks nothing and offers one roll (a73).
- **The vow's Link** (VOW-CARD-LINK-ONLY-AT-POSTING) and **the recap's place** (issue #374 A1, three recaps) held.
- **Memory across sessions**: F2–F5 recalled at up to 67 actions, each visible at all three layers; both baits refused; no plan leaked.
- **The premise held** where the seed says whose ship it is: three openings in a row call the crew imagined.

**What went wrong, and why.**
1. **CORRECTION-AND-RENAME-DO-NOT-REACH-THE-RECORD** (a44, a46, a55, a67, a74, a81, a85). A correction lives in the scene it was made in; a rename lives on the card. The world snapshot's events, established lore, the plan's subject, the clock, the Chronicle and the fight's track keep the old name, and nothing tells the narrator that one replaced the other. It used the old ship name once more, then explained both as true — and the helpers wrote the explanation down. *Enough data: the cause is in the prompts.*
2. **NARRATION-WRITES-ITS-SHAPE-DIRECTIVE** (a57, a79). "Open on the hatch, not you." is the prompt's Shape line, written as a sentence. Two of 28 narrated lines. *A fix can be proposed; its effect must be measured.*
3. **A move the player declares is narrated as done, unrolled** (a56, a57; the memory run's a6). At a low dial the reader narrates; the narration performs the action. *As OFFERED-MOVE-NARRATED-AS-DONE.*
4. **NAMED-MOVE-READ-AS-ANOTHER** (a65, a66). "I ask you to forge a bond" was Compel; the scene's mood outweighed the move's name. *Two samples; not enough to choose a fix.*
5. **The opening scene is told to invent a crew and given stats as traits** — the cause of NARRATOR-ADDS-TO-THE-PREMISE and of "Wits 3" in the prose (a15), read in the scene's own instruction: "(No absent crewmates registered — invent generic absurd crew.)". *Enough data.*
6. **Scenes of one kind repeat** (openings, and all three closings). *Measured; a fix can be proposed.*
7. **The character is spoken for** when she is asked what she knows (a51, a52, a55). *Three samples in one run.*
8. **The table asks the GM about things that are not people**: seven draft cards, one wanted — an unnamed clerk, a dock officer, a ship as a connection, one vessel twice, a berth. *Observation.*
9. **Small:** consequences' cards stand above the roll's (a26, a33, a69); a fight's commit card arrives with its roll already made (a22); "Nothing has been paid yet" over a mark already made (a31); a set-up reminder posted mid-fight on reload (x12).

**What was not exercised.** The suffer path (the miss's price was told in the story); a miss on a progress roll; Sojourn, Resupply and Repair; an expedition; a second player; anything on a phone. A real miss in a fight was scripted, not rolled.

**What the run did not record.** How much of a reply's time is the module's own, call by call — the 2.5 s floor is a rehearsal's. Whether a player would have found these beats untold: the player is told each one.

**What it cost and what it returned.** $2.30 — the module's own calls $1.46, the player $0.84; with the memory run, $2.55 for the round. Returned: one product defect with its cause in the prompts and seven places it shows (1); three more with a prompt to point at (2, 3, 5); nine faults in the runner's own measures that no rehearsal could show, fixed and pinned by tests; the first measured speed, cost and prompt growth by call kind; decision 4 and two earlier fixes confirmed in a real session; and a replay of 87 actions that needs no key. Could any of it have been had for nothing? The leaked Shape line and the crew instruction were readable in any rehearsal's prompts by somebody looking for them; nobody was. The rest needed a narrator that writes.

**Whether the next run is worth making.** Not yet. A second run of this charter now would walk the same session into the same four causes — the spending rules' "the same session is not bought twice except to verify a fix". The next dollar belongs to the run made *after* finding 1 has a fix (and 2, 3 and 5 if taken): the same charter, to see the old names gone from what is written. Until then the round stops at one run of the long haul and one of the memory charter.

