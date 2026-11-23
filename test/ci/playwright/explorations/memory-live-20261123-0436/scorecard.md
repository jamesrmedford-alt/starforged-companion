# memory — scorecard

Run `memory-live-20261123-043623` · live · class **pass** — the narrator's answer in the second session holds what was established in the first

**Run 4 of the memory charter.** Written before it was known that another session had made this same re-run an hour earlier — run 3, kept as `explorations/memory-live-20261123/` and merged with PR #376. This one is the same session bought a second time; it is kept for what run 3 has not: a campaign recap written from the corrected prompt, a move offered and narrated as made (a6), and a miss whose price was a suffer move (a5).

## What this run was to answer

1. After the fix for issue #374 A1, does the campaign recap written at End a Session place the campaign where the character is, and not in the closing scene's cutaway?
2. After the fix for issue #374 A2, do the Chronicle entries name Mira Kestrel (not "the character") and keep the possession the player established in her own line?
3. Can the Sonnet 5.5 player walk the memory goal end to end — two sessions, the question asked without naming the fact — inside the caps?
4. Does the second session's opening scene restate the fact before it is asked about, as it did in the run of 2026-11-22?
5. What does the run cost with the Sonnet player and cache writes priced by their lifetime, split between the module and the player?

1. **Yes.** The recap's prompt (step a8, `getCampaignRecap`) holds no ACTIVE SCENE block and gives the ship's position as "Kobayashi IV near Hollow Spire"; the recap is about Mira, her sister's compass and the voice in the locker. The closing cutaway — the raider at his ledger — is nowhere in it. It is wrong in one thing it was handed, not in where it is set: "you are underway toward Bleakhold" (answer 6 below, the run's new finding).
2. **Yes.** Five entries were written, all naming "Mira Kestrel" or "Mira", none "the character"; the first keeps the possession from her own line ("turning her sister Ilse's brass star-compass in her fingers"). Four were rated "notable" and kept (the recap, written at a8, was sent the three there were by then). The one dropped, rated "scene", is the session's only roll and its only wound — what the scribe keeps is still open (issue #374 A5).
3. **Yes.** Twelve actions, the question asked without the fact's words, the stop given with its reason; $0.08 for the player's twelve calls where the Opus player's cost $0.19.
4. **Yes, again** — "the brass star-compass lies beside your plate" (a10), before the question (a11). Two runs of two. The memory charter's question is therefore always asked with the fact already in the scene: what the charter shows is the carry into the next session's opening, which is the stronger thing, and its question adds little. The long haul's ledger does not count such a question as recall.
5. **$0.2489**: the module $0.1692 (68%, 28 calls), the player $0.0797 (32%, 12 calls). The narrator's four kinds of call are $0.156 of the module's share; the Chronicle's scribe $0.009; everything on Haiku together $0.004.
6. *Not asked, and found:* a move that was offered and not made was narrated as made, and the summary, the Chronicle and the recap then recorded the ship as under way while the world has it where it was (a6).

| Dimension | Result | Basis | Trust |
| --- | --- | --- | --- |
| Goal | achieved: the narrator's answer in the second session holds what was established in the first | the observer: the fact in a store, in the question's prompt, in its answer | medium: presence of words, not comprehension — read the answer |
| Mechanics | not run | the game's text (tests/helpers/sequence/rules.js), each roll from its own dice | high where a check ran; see what was never exercised |
| Continuity — the narrator | not scored | fact × probe × layer; refusals; leaks | medium: presence of words, not comprehension — read each excerpt |
| Continuity — the helpers | not scored | each helper's writing against the ledger | medium: a refusal is a contradiction that was thought of |
| Agency | 0 sentence(s) that speak for the character | quoted speech given to "you" | low: a count to start reading from |
| Friction | 2.4 actions per line of play; the GM answered 1 prompt(s); 0 action(s) did not land | the player's actions and the GM's rules' answers | high |
| Narrator quality | repetition by content: 26% of a10's content words were in a2; 0 repeated who-is-doing-what | shared content words and repeated acts between scenes of one kind | medium for repetition; the rest is the reading |
| Speed | a line to its reply: p50 6.7 s, p95 11.5 s (5 lines) | each call's latency; the time from a line to the first narration after it | high |
| Length | the AI player: +575.3 chars/action; callNarratorAPI>narrateSessionVignette: +462.9 chars/action | prompt size against the action number, per call kind | high |
| Caching | 44% of prompt tokens read from cache; saved $0.1017; 1 kind(s) write and never read | usage per call kind | high |
| Cost | $0.2489 — the module $0.1692 (68%), the test's own models $0.0797 (32%) | the budget's tally by role and the price table | high for tokens; prices are entered by hand |

## The goal, layer by layer

| Milestone | Reached |
| --- | --- |
| sessionBegun | yes |
| factEstablished | yes |
| narratedAfter | yes |
| sceneChanged | no |
| sessionEnded | yes |
| sessionBegunAgain | yes |
| askedLater | yes |

## Repetition by content — galley_begin

| Earlier | Later | Content words shared | Who is doing what, again |
| --- | --- | --- | --- |
| a2 | a10 | 16 of 61 (26%) |  |

## Friction

12 actions, 5 lines of play, 0 waits, 1 draft card(s).

| What the GM's rules answered | Times |
| --- | --- |
| accepted the proposed move | 1 |

## Speed

| Call kind | Calls | p50 | p95 | Longest |
| --- | --- | --- | --- | --- |
| callNarratorAPI>narrateSessionVignette | 3 | 4.4 s | 5.6 s | 5.6 s |
| callHaiku>defaultCallTierAPI | 2 | 0.4 s | 0.4 s | 0.4 s |
| callClassifierAPI>classifyInput | 5 | 0.8 s | 0.9 s | 0.9 s |
| callNarratorAPI>narratePacedInput | 4 | 4.0 s | 7.3 s | 7.3 s |
| callHaiku>defaultCallDetectionAPI | 4 | 0.5 s | 1.2 s | 1.2 s |
| callChronicleAPI>writeChronicleEntry | 5 | 0.9 s | 1.8 s | 1.8 s |
| callClaudeAPI>interpretMove | 1 | 1.7 s | 1.7 s | 1.7 s |
| defaultClassifyImplicit>resolveRelevance | 1 | 0.3 s | 0.3 s | 0.3 s |
| callNarratorAPI>narrateResolution | 1 | 3.3 s | 3.3 s | 3.3 s |
| callNarratorAPI>getRollingSessionSummary | 1 | 1.7 s | 1.7 s | 1.7 s |
| callNarratorAPI>getCampaignRecap | 1 | 7.8 s | 7.8 s | 7.8 s |
| the AI player | 12 | 3.0 s | 7.1 s | 7.1 s |

A line to its reply: p50 6.7 s, p95 11.5 s, longest 11.5 s over 5 lines.

## Prompt length against the action number

| Call kind | Calls | First | Last | Largest | Chars per action |
| --- | --- | --- | --- | --- | --- |
| callNarratorAPI>narrateSessionVignette | 3 | 17301 | 21254 | 21254 | 462.9 |
| callHaiku>defaultCallTierAPI | 2 | 1985 | 1490 | 1985 | -123.8 |
| callClassifierAPI>classifyInput | 5 | 13542 | 13377 | 14617 | -63.2 |
| callNarratorAPI>narratePacedInput | 4 | 19459 | 21195 | 26294 | -31.2 |
| callHaiku>defaultCallDetectionAPI | 4 | 8500 | 8883 | 8883 | 43.2 |
| callChronicleAPI>writeChronicleEntry | 5 | 3450 | 3455 | 3551 | -2.1 |
| callClaudeAPI>interpretMove | 1 | 18970 | 18970 | 18970 | 0 |
| defaultClassifyImplicit>resolveRelevance | 1 | 606 | 606 | 606 | 0 |
| callNarratorAPI>narrateResolution | 1 | 24601 | 24601 | 24601 | 0 |
| callNarratorAPI>getRollingSessionSummary | 1 | 4206 | 4206 | 4206 | 0 |
| callNarratorAPI>getCampaignRecap | 1 | 6354 | 6354 | 6354 | 0 |
| the AI player | 12 | 2488 | 8856 | 8856 | 575.3 |

## Caching, by call kind

| Call kind | Calls | Prompt tokens | Read from cache | Written | Sent uncached | Cost | Saved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| the AI player | 12 | 41020 | 19712 (48%) | 1792 | 19516 | $0.0797 | $0.0375 |
| callNarratorAPI>narratePacedInput | 4 | 32545 | 18285 (56%) | 5041 | 9219 | $0.0631 | $0.0347 |
| callNarratorAPI>narrateSessionVignette | 3 | 20890 | 7190 (34%) | 9881 | 3819 | $0.0617 | $0.0137 |
| callNarratorAPI>narrateResolution | 1 | 8895 | 3595 (40%) | 2372 | 2928 | $0.0203 | $0.0068 |
| callNarratorAPI>getCampaignRecap | 1 | 2201 | 0 (0%) | 0 | 2201 | $0.0108 | $0.0000 |
| callChronicleAPI>writeChronicleEntry | 5 | 6076 | 3880 (64%) | 970 | 1226 | $0.0089 | $0.0074 |
| callClassifierAPI>classifyInput | 5 | 25903 | 17244 (67%) | 4311 | 4348 | $0.0015 | $0.0016 |
| callHaiku>defaultCallDetectionAPI | 4 | 12350 | 0 (0%) | 0 | 12350 | $0.0015 | $0.0000 |
| callClaudeAPI>interpretMove | 1 | 6831 | 0 (0%) | 5700 | 1131 | $0.0010 | $0.0000 |
| callNarratorAPI>getRollingSessionSummary | 1 | 1458 | 0 (0%) | 0 | 1458 | $0.0003 | $0.0000 |
| callHaiku>defaultCallTierAPI | 2 | 1166 | 0 (0%) | 0 | 1166 | $0.0001 | $0.0000 |
| defaultClassifyImplicit>resolveRelevance | 1 | 219 | 0 (0%) | 0 | 219 | $0.0000 | $0.0000 |
| **All** | 40 | 159554 | 69906 (44%) | 30067 | 59581 | $0.2489 | $0.1017 |

Writes a cache it never reads: callClaudeAPI>interpretMove (5700 tokens over 1 call(s)).

Caches nothing: callNarratorAPI>getCampaignRecap (2201 tokens over 1 call(s)); callHaiku>defaultCallDetectionAPI (12350 tokens over 4 call(s)); callNarratorAPI>getRollingSessionSummary (1458 tokens over 1 call(s)); callHaiku>defaultCallTierAPI (1166 tokens over 2 call(s)); defaultClassifyImplicit>resolveRelevance (219 tokens over 1 call(s)).

## Cost

|  | Dollars | Share | Calls |
| --- | --- | --- | --- |
| The module's own calls | $0.1692 | 68% | 28 |
| The AI player | $0.0797 | 32% | 12 |
| **Total** | $0.2489 |  | 40 |

Per action: $0.0207. Per line of play: $0.0498.

## The reading

**One line.** Both fixes hold in a live session, the Sonnet player can do the job at 40% of the price, and reading the run found one new fault with its cause in a prompt: an offered move narrated as done. $0.25.

**What went right.** The recap is set where the character is (issue #374 A1) and the Chronicle names her and keeps what she established (A2) — each visible in the prompt the helper was sent, not only in what it wrote. The one roll was right by hand: a tie to the challenge die is a miss, the stated price was the one paid, health fell once by one, and nothing was narrated that the dice had not decided. The hidden plan the narrator wrote at a4 stayed out of the prose. The fact was carried into the second session.

**What went wrong, and why.**

- **OFFERED-MOVE-NARRATED-AS-DONE (new; a6).** With a move only on offer, the narrator depicted the move's result and then offered the move. The world did not change; the summary, a Chronicle entry and the recap say it did. Cause, in the prompt: the SUGGESTED MOVE block asks for a closing invitation and does not say that nothing the move decides has happened. *A fix can be proposed, and its effect must be measured* — one sample, and the narrator may or may not obey a sentence telling it to stop at the threshold.
- **The premise is added to (a2, a3, a8; NARRATOR-ADDS-TO-THE-PREMISE, second sample).** A solo pilot is given a crew of three, a stranger knows her keepsake's history, and the summary then calls her "a crew member" of her own ship. The CHARACTER block does not say who is aboard. *Not enough data to choose a fix*: two samples, both in the galley opening, which is written to be comic and populated — the long haul's three openings will say whether it is the vignette or the narrator.
- **The Chronicle drops the session's one roll (a5; issue #374 A5, second sample).** A miss, a wound, health 5 → 4: rated "scene" and not kept. Two sessions, and the scribe has under-rated the mechanical beat in both.
- **The opening repeats (a10; GALLEY-VIGNETTE-REPEATS, second sample).** 26% of its content words were in the first opening, and one act is repeated nearly word for word. The run's measure missed the act because nobody in it has a name; it now counts a role.
- **Small:** the price and harm cards stand above the roll's card (a5); the recap opens by describing its own sources (a8); an absent sister is offered as a connection to confirm (a3).

**What was not exercised.** No progress track, no vow, no connection, no fight, no travel (the course was never rolled), no Burn. One move, one miss. This run says nothing about them; the long haul is for that.

**What the run did not record.** Per-call latency and cost by call kind are in this scorecard for the first time. What it still cannot say: which of a line's 6–11 s is the module's own time rather than a model's — a rehearsal with instant replies puts that floor near 2.5 s.

**What it cost and what it returned.** $0.25 — the module's own calls $0.17, the player $0.08. Returned: two fixes confirmed where it counts, in a real session's prompts and records (could a rehearsal have shown them? The prompts, yes — and did; what the real recap *wrote* from them, no); one new fault that needed a real narrator to commit it and a reader to see it, since the observer scored the run a pass; second samples for three open findings; and a keyless replay with a miss and a price in it, which the first kept run has not. Where the next dollar should go: not here again — the same session would only be bought twice. The long haul, which walks the same edges three times over with moves, tracks and a fight between them.

