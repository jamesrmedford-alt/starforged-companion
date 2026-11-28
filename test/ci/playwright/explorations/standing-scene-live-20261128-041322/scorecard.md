# standing-scene — scorecard

Run `standing-scene-live-20261128-041322` · live · class **pass** — 13 of 13 beats done; no check violated, no fact lost or refused

## The cold read

_To write before anything below — `transcript.md` read straight through by a reader who has seen neither the charter, this run's questions nor the fixes it was to verify (in a Claude Code session, a sub-agent handed that one file), asked what the session was like to play: what a player would complain of, what repeats, what makes no sense, what the player was made to do. Its findings, each then checked against the evidence — and, first, what the charter itself made the player do that a person at the table would not._

## What this run was to answer

1. Part 7 step 1: does the run keep every request whole — each narration's system prompt readable back from its recording — so its beats can be asked again with no Foundry?
2. Lock-in: of the details in five or six of the last six narrations, how many are written again in the next, against round 10's 58–73%?
3. Which details lock in a standing scene of twelve lines with two bystanders present and a third person on a comm: the scene's people, its place, or other things?
4. How many refrains does the scorecard count in the one scene?

_To write — the answer to each, with its evidence, or that the run did not answer it._

| Dimension | Result | Basis | Trust |
| --- | --- | --- | --- |
| Goal and beats | 13 done, 0 failed, 0 not exercised of 13 | the observer's checks on the world after each action | high: arithmetic over the world's records |
| Mechanics | 124 checks, 0 violated | the game's text (tests/helpers/sequence/rules.js), each roll from its own dice | high where a check ran; see what was never exercised |
| Continuity — the narrator | 0 recalled, 0 carried unasked, 0 lost, 0 refused, 0 not probed of 0 | fact × probe × layer; refusals; leaks | medium: presence of words, not comprehension — read each excerpt |
| Continuity — the helpers | 0 refusal(s) in summaries, Chronicle entries and recaps | each helper's writing against the ledger | medium: a refusal is a contradiction that was thought of |
| Agency | 1 sentence(s) that speak for the character | quoted speech given to "you" | low: a count to start reading from |
| Told, and written anyway | 0 instruction(s) written as prose; 0 stat(s) read aloud; 0 opening sentence(s) naming a crew role | each narrated sentence against the instructions' own words, a stat with its number, a crew role in an opening | medium for the first two; the third is to be read |
| Plain lines | 0 line(s) where a move was wanted: 0 rolled, 0 offered it, 0 read as another move, 0 narrated with nothing offered; 0 line(s) named a move; 0 beat(s) at last resort; 0 memory question(s) asked as play, 0 as @scene; 3 rolled and 1 offered a move where none was wanted | each line of play's reading, from the readers' own replies — the line reader's, with the route the table took read off what the step posted, or, in a run before the switch, the two readers'; the move its beat wanted; a move's name looked for in the line | medium: a count — whether a line should have been a move is the charter's say for its move beats only, and a named move is a phrase match, to be read |
| Friction | 1.17 actions per line of play; the GM answered 3 prompt(s); 0 action(s) did not land | the player's actions and the GM's rules' answers | high |
| Narrator quality | no two scenes of one kind to compare | shared content words and repeated acts between scenes of one kind | medium for repetition; the rest is the reading |
| Set-pieces | 1 set-piece scene(s) (1 opening): 3 of 3 rolled results in their scene, 0 not, 0 with no fact block to say | each opening, closing and spotlight call: its MATERIAL's numbered results, and the words its reply's fact block gave for each (`builtFrom`) found in its prose; each Begin card's spotlight roll followed by its cutaway or by the note that it is the table's to envision | high for the arithmetic; whether a result is in the scene recognisably, and not only in the words given, is for the reading |
| Refrains | "guard" in 12 of session-1's 12 narrations (12 in a row); 13 word(s) and phrase(s), names apart, in a third or more of a session's narrations (session-1: 13); scene by scene: "guard" in 12 of a scene's 12 (session-1); 6 of 12 narrations end on someone waiting, watching or still | each session's narrations of play, the opening and closing scenes and the @scene answers apart: the content words and the phrases by how many narrations hold them; the last two sentences of each | medium: it counts what is said in the same words — a device said in new words each time is for the reading |
| Scenes | session-1: 1 (session, 12) — each scene's cause, and its narrations of play | the table after each step: a new scene id is a scene begun, its anchor (`sceneBegan`) says why; each card's scene stamp places its narration | high for the count; whether a scene turned where the story did is for the reading |
| One place | 0 to read | each narration and @scene answer against the ship's position record and the frame's where against the recorded place, at its step | low: a phrase list to start the cold read from |
| Reconciling in prose | 0 sentence(s) | each sentence of a narration of play against a phrase list ("no longer at", "though the scene frame", "still off …, so") | low: a phrase list, then the cold read |
| Colour told as fact | 8 sentence(s) of the summaries, the recap and the Chronicle hold a colour truth's own words (of 15 colour truth(s) the table held) | each helper sentence against each colour truth's words that no truth that binds and no player's line holds | medium: shared words, to be read |
| What binds | 20 truth(s) — session-1: player 2, dice 3, narrator 15; tags: 2 truth(s) tagged, 2 kept, 0 refused, 0 not found (and 3 state value(s) tagged) | every truth the ledger held, by its basis; each tagged truth of the narrator's recorded fact blocks against the basis it was stored with | high |
| Record sizes | no End a Session; the largest 34.6k characters | each Session Log page's `sessionRecord` as JSON, in characters, at the step each session closed and at the run's end | high |
| Speed | a line of play to its reply: p50 8.5 s, p95 14.8 s (12 lines) | each call's latency; the time from a line of play, and from a scene question, to the first narration after it | high |
| Length | callNarratorAPI>narratePacedInput: +913.3 chars/action; callNarratorAPI>narrateResolution: +801.3 chars/action | prompt size against the action number, per call kind | high |
| Caching | 57% of prompt tokens read from cache; saved $0.4674; 1 kind(s) write and never read | usage per call kind | high |
| Cost | $0.4777 — the module $0.3719 (78%), the test's own models $0.1058 (22%) | the budget's tally by role and the price table | high for tokens; prices are entered by hand |

## Beats

| # | Beat | Status | Actions | At | Detail | Forced by the charter |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Begin a Session | done | 2 | a2 | session 1 is open |  |
| 2 | Line 1 of the standing scene | done | 1 | a3 | the line at a3 was narrated with nothing of  offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked |  |
| 3 | Line 2 of the standing scene | done | 1 | a4 | the line at a4 was narrated with nothing of  offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked |  |
| 4 | Line 3 of the standing scene | done | 1 | a5 | the line at a5 was narrated with nothing of  offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked |  |
| 5 | Line 4 of the standing scene | done | 1 | a6 | the line at a6 was narrated with nothing of  offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked |  |
| 6 | Line 5 of the standing scene | done | 1 | a7 | the line at a7 was narrated with nothing of  offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked |  |
| 7 | Line 6 of the standing scene | done | 1 | a8 | the line at a8 was narrated with nothing of  offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked |  |
| 8 | Line 7 of the standing scene | done | 1 | a9 | the line at a9 was narrated with nothing of  offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked |  |
| 9 | Line 8 of the standing scene | done | 1 | a10 | the line at a10 was narrated with nothing of  offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked |  |
| 10 | Line 9 of the standing scene | done | 1 | a11 | the line at a11 was narrated with nothing of  offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked |  |
| 11 | Line 10 of the standing scene | done | 1 | a12 | the line at a12 was narrated with nothing of  offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked |  |
| 12 | Line 11 of the standing scene | done | 1 | a13 | the line at a13 was narrated with nothing of  offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked |  |
| 13 | Line 12 of the standing scene | done | 1 | a14 | the line at a14 was narrated with nothing of  offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked |  |

## Mechanics

124 checks made.

| Check | Made | Violated |
| --- | --- | --- |
| roll-score | 3 | 0 |
| roll-outcome | 3 | 0 |
| roll-match | 3 | 0 |
| roll-cancelled-die | 3 | 0 |
| roll-narrated-as-rolled | 3 | 0 |
| dice-as-they-fell | 3 | 0 |
| progress-score | 0 | 0 |
| meter-bounds | 60 | 0 |
| track-bounds | 15 | 0 |
| progress-per-mark | 0 | 0 |
| expedition-progress | 0 | 0 |
| bond-mirror | 0 | 0 |
| link-mirror | 0 | 0 |
| legacy-reward | 0 | 0 |
| xp-per-box | 0 | 0 |
| move-momentum | 2 | 0 |
| milestone-once | 0 | 0 |
| suffer-cost | 0 | 0 |
| recover-amount | 0 | 0 |
| burn | 0 | 0 |
| session-momentum | 1 | 0 |
| lock-free | 15 | 0 |
| answered-once | 12 | 0 |
| held-narrated-in-turn | 0 | 0 |
| let-go-stays | 1 | 0 |
| scene-turned | 0 | 0 |
| colour-not-filed | 0 | 0 |

### Rolls

| Step | Move | Outcome | Dice | Scripted |
| --- | --- | --- | --- | --- |
| a4 | gather_information | weak_hit | Action: 2 + 3 = 5 \| Challenge: 1, 10 |  |
| a6 | gather_information | weak_hit | Action: 1 + 3 = 4 \| Challenge: 1, 5 |  |
| a7 | gather_information | miss | Action: 5 + 3 = 8 \| Challenge: 8, 9 |  |

Never exercised: progress-score, progress-per-mark, expedition-progress, bond-mirror, link-mirror, legacy-reward, xp-per-box, milestone-once, suffer-cost, recover-amount, burn, held-narrated-in-turn, scene-turned, colour-not-filed.

## The fact ledger

| Fact | Kind | Planted | Verdict | Layer | Refusals |
| --- | --- | --- | --- | --- | --- |

### Probes

| Fact | Probe | At | Distance | Stored | In the prompt | In the answer | Counted | Answer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

### What the helpers kept

| Fact | Helper | At | Holds it | Text |
| --- | --- | --- | --- | --- |

## Set-pieces — what each was built from

Each session set-piece's rolled results (its MATERIAL) and whether its narration used each: the words its fact block gave for the result, found in its prose — read here, apart from the module's own account on the card. A result "not used" had no words the prose holds; "claimed" words are the fact block's, not the prose's. A spotlight vignette the Begin card rolled is followed by its cutaway or by the note that it is the table's to envision.

| At | Scene | n | What it is for | Rolled | Used |
| --- | --- | --- | --- | --- | --- |
| a2 | opening | 1 | What you (Mira Kestrel) are doing in this lull | Reject Weapon (75, 99) | "sorting a crate of old sidearms you have decided not to keep" |
| a2 | opening | 2 | What the scene's eye rests on | Foul Terrain (45, 87) | "deck plating has gone foul, slick and dark" |
| a2 | opening | 3 | Where aboard the ship this is | Processed goods storage (Production) (88, 59) | "processed goods storage" |

## Refrains — what each session's narrations keep returning to

The words and the phrases that are in a third or more of a session's narrations of play (and at least three), with the longest run of narrations in a row that hold each — and how the narrations end. A name (a word the session never writes without its capital) is listed as one: who a session is about is no refrain. The opening and closing scenes are apart (above), and so are the answers to `@scene` questions — an answer is a camera on what the story holds; how many of them hold each is said beside it. A count to start reading from: what is said in the same words.

### session-1 — 12 narrations

|  | What | In | Longest run | At |
| --- | --- | --- | --- | --- |
| word | guard | 12 of 12 (100%) | 12 | a3 a4 a5 a6 a7 a8 a9 a10 a11 a12 a13 a14 |
| word | clerk | 8 of 12 (67%) | 5 | a3 a4 a6 a8 a9 a10 a11 a12 |
| word | stopped | 6 of 12 (50%) | 4 | a4 a5 a6 a7 a10 a11 |
| word | slate | 6 of 12 (50%) | 3 | a3 a4 a7 a10 a11 a12 |
| word | hook | 6 of 12 (50%) | 2 | a4 a5 a7 a8 a10 a13 |
| word | line | 5 of 12 (42%) | 2 | a4 a7 a8 a10 a13 |
| word | desk | 5 of 12 (42%) | 1 | a3 a5 a8 a11 a14 |
| word | chair | 4 of 12 (33%) | 3 | a6 a12 a13 a14 |
| word | cutter | 4 of 12 (33%) | 2 | a4 a6 a7 a9 |
| word | dockhand | 4 of 12 (33%) | 2 | a9 a11 a13 a14 |
| word | face-down | 4 of 12 (33%) | 2 | a3 a4 a10 a12 |
| word | comm | 4 of 12 (33%) | 1 | a5 a8 a11 a14 |
| word | stops | 4 of 12 (33%) | 1 | a3 a9 a12 a14 |
| name | tamsin | 4 of 12 (33%) | 1 | a5 a8 a11 a14 |

Phrases in fewer: "clerk's slate" 3 (a4 a10 a11); "guard's chair" 3 (a6 a13 a14); "guard has stopped" 3 (a5 a7 a11).

Three-letter words in a third or more, counted apart from the rows above: "man" 6 of 12 (a4 a7 a8 a10 a13 a14).

Endings that leave someone waiting, watching or still: 6 of 12 — a3: …She turns the slate face-down and waits to see what you do with that.; a4: …Two dockhands have stopped working to listen, and the hook man has noticed them noticing.; a5: …One of the dockhands sets down his hook and walks toward the corridor, not quite hurrying.; a6: …Nobody here will say who pressed it."; a9: …Behind you, a dockhand clears his throat and says nothing else.; a14: …The stranger says nothing, and he does not look away from you..

## Overhaul 2's counts, against run 4

The counts the fourth live run's findings asked the next run for (issue #386 §14). A count with "to read" is a list to start the cold read from.

| Count | This run | Run 4 |
| --- | --- | --- |
| Refrains per narration of play | "guard" in 12 of session-1's 12 (12 running); scene by scene "guard" 12 of 12 | session 3: "light" 15 of 17 (12 running) |
| Questions re-set on a let-go subject | 0 (of 1 questions set while play had let one go) | 4 (a65, a69, a73, a85) |
| Scenes a session, and their causes | session-1: 1 (session, 12) — each scene's cause, and its narrations of play | one a session, besides the cutaways |
| Location contradictions a session | 0 to read cold | session 3: a59, a65, a81, a85 |
| Reconciliation sentences | 0 | 3 (a15, a59, a65) |
| Colour told as fact | 8 sentence(s) | session 1's summary's amber light; the fee slip in session 2 (a20, a24, a33) |
| Facts by provenance; tags refused | 20 truth(s) — session-1: player 2, dice 3, narrator 15; tags: 2 truth(s) tagged, 2 kept, 0 refused, 0 not found (and 3 state value(s) tagged) | — |
| Openings against where it stopped | none told where a last session stopped | 2 of 3 contradicted (a20, a89) |
| The ledger's recalls | 0 recalled, 0 lost | 5 recalled, 0 lost |

## Scenes

Each session's scenes in order: why each began (its anchor's cause, and its words) and how many narrations of play it had. A scene turns when its place or its situation changes (overhaul 2 §4).

| Session | Began at | Cause | Why | Narrations of play |
| --- | --- | --- | --- | --- |
| session-1 | a2 | session | the session begins | 12 |

## Colour told as fact — each to be read

| Where | Sentence | The colour truth | Its words |
| --- | --- | --- | --- |
| a Chronicle entry | Asking about the drifting cutter, Mira Kestrel learned the customs staff are deliberately keeping its hull number off the logs and don't want the question asked again. | will not log the drifting cutter's hull number; the cutter has been off the ring since before her shift (she/her) | hull, number |
| a Chronicle entry | Mira Kestrel learned from the hook man that Captain Oren Vasch of the cutter signed for the last crate, a name nobody on the docks will log. | captain of the drifting cutter; signed for the last crate on the cargo line (he/him) | captain |
| a Chronicle entry | The clerk confirmed the stamp on Mira Kestrel's torn manifest is the harbour's, but the date was scraped and re-pressed after the cutter stopped answering hails. | bears the harbour's stamp, but the date was scraped and re-pressed after the cutter stopped answering hails | date, scraped, re-pressed, stopped, answering, hails |
| a Chronicle entry | Mira Kestrel told Tamsin what the clerk said about the stamp, and Tamsin reasoned that someone on the ring was awake and working when it was pressed. | reasons that someone on the ring was awake and working when the harbour stamp was pressed after the cutter went silent | someone, awake, working, pressed |
| a Chronicle entry | Mira Kestrel found four crates from the cutter with cut, badly retaped seals; someone had already been inside, and the guard watched her hands. | four crates by the hatch came off the cutter; their seals were cut and badly retaped | four, seals, badly, retaped |
| a Chronicle entry | Pressed by Mira Kestrel, the hook man admitted the crate seals were whole when unloaded, yet someone had been inside them, and everyone in the hall knew it. | reasons that someone on the ring was awake and working when the harbour stamp was pressed after the cutter went silent | someone, pressed |
| a Chronicle entry | Mira Kestrel asked Tamsin who on the ring would buy a forged manifest, and learned the buyer is someone laundering a captain's name or needing a cargo to have been legal. | captain of the drifting cutter; signed for the last crate on the cargo line (he/him) | captain |
| a Chronicle entry | The clerk found a stamp press logged at the third bell under a user code not on that shift, and the guard's slate had gone missing from his belt. | records a harbour stamp press at the third bell under a user code not belonging to this shift | press, user, code, shift |

## Record sizes

Each Session Log page's session record (`sessionRecord`) as JSON, in characters, at the step each session closed and at the run's end.

| When | Page | Characters |
| --- | --- | --- |
| at the end ((after)) | Session 1 | 34602 |

## Spoken for the character

| At | Scene | Sentence |
| --- | --- | --- |
| a7 |  | You ask the hook man what he saw the night the cutter came in. |

## What each line of play became

A player is never made to name a move: a plain line that sets about one should be rolled, or offered it on a button. Each line the player typed that was not a command or a scene question — how it was read, and whether its beat wanted a move.

| At | Beat | Line | Named | Became | Move | Wanted |
| --- | --- | --- | --- | --- | --- | --- |
| a3 | 2 | I lean on the customs desk and ask the clerk how long the cutter has been drifting off the ring. |  | narrated |  |  |
| a4 | 3 | I watch the hook man work the cargo line and ask him who signed for the last crate. |  | rolled | gather_information |  |
| a5 | 4 | I key the comm and ask Tamsin whether the raiders ever came this far in. |  | narrated |  |  |
| a6 | 5 | I set the torn manifest on the desk and ask the clerk if the stamp is the harbour's. |  | rolled | gather_information |  |
| a7 | 6 | I ask the hook man what he saw the night the cutter came in. |  | rolled | gather_information |  |
| a8 | 7 | I tell Tamsin over the comm what the clerk said about the stamp. |  | narrated |  |  |
| a9 | 8 | I count the crates stacked by the hatch and ask the clerk which ones came off the cutter. |  | offered | gather_information |  |
| a10 | 9 | I ask the hook man whether anyone has been aboard the cutter since. |  | narrated |  |  |
| a11 | 10 | I ask Tamsin who on the ring would buy a forged manifest. |  | narrated |  |  |
| a12 | 11 | I wait at the desk while the clerk checks the night log. |  | narrated |  |  |
| a13 | 12 | I ask the hook man to show me the crate with the broken seal. |  | narrated |  |  |
| a14 | 13 | I thank Tamsin over the comm and tell her I will come by her stall. |  | narrated |  |  |

## Friction

14 actions, 12 lines of play, 0 waits, 3 draft card(s).

| What the GM's rules answered | Times |
| --- | --- |
| accepted the proposed move | 3 |

## Speed

| Call kind | Calls | p50 | p95 | Longest |
| --- | --- | --- | --- | --- |
| callNarratorAPI>narrateSessionVignette | 1 | 4.4 s | 4.4 s | 4.4 s |
| callReaderAPI>readLine | 12 | 1.4 s | 1.8 s | 1.8 s |
| callNarratorAPI>narratePacedInput | 9 | 3.7 s | 4.0 s | 4.0 s |
| callHaiku>defaultCallDetectionAPI | 12 | 0.8 s | 2.1 s | 2.1 s |
| callChronicleAPI>writeChronicleEntry | 12 | 1.3 s | 1.5 s | 1.5 s |
| callNarratorAPI>narrateResolution | 3 | 4.0 s | 5.2 s | 5.2 s |
| the AI player | 14 | 2.1 s | 2.5 s | 2.5 s |

A line of play to its reply: p50 8.5 s, p95 14.8 s, longest 14.8 s over 12 lines.

## Prompt length against the action number

| Call kind | Calls | First | Last | Largest | Chars per action |
| --- | --- | --- | --- | --- | --- |
| callNarratorAPI>narrateSessionVignette | 1 | 23247 | 23247 | 23247 | 0 |
| callReaderAPI>readLine | 12 | 32201 | 33090 | 33324 | 28.6 |
| callNarratorAPI>narratePacedInput | 9 | 23880 | 35358 | 35358 | 913.3 |
| callHaiku>defaultCallDetectionAPI | 12 | 10566 | 11449 | 11539 | 47.8 |
| callChronicleAPI>writeChronicleEntry | 12 | 4079 | 4124 | 4440 | -16.3 |
| callNarratorAPI>narrateResolution | 3 | 30358 | 32795 | 32795 | 801.3 |
| the AI player | 14 | 8501 | 15201 | 15201 | 525.7 |

## Caching, by call kind

| Call kind | Calls | Prompt tokens | Read from cache | Written | Sent uncached | Cost | Saved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| callNarratorAPI>narratePacedInput | 9 | 103064 | 58180 (56%) | 3045 | 41839 | $0.1447 | $0.1105 |
| the AI player | 14 | 79385 | 48490 (61%) | 3730 | 27165 | $0.1058 | $0.0921 |
| callReaderAPI>readLine | 12 | 139959 | 110330 (79%) | 10030 | 19599 | $0.1036 | $0.2096 |
| callNarratorAPI>narrateResolution | 3 | 33795 | 16120 (48%) | 5602 | 12073 | $0.0638 | $0.0306 |
| callNarratorAPI>narrateSessionVignette | 1 | 8286 | 0 (0%) | 6729 | 1557 | $0.0349 | $0.0000 |
| callChronicleAPI>writeChronicleEntry | 12 | 17243 | 12969 (75%) | 1179 | 3095 | $0.0192 | $0.0246 |
| callHaiku>defaultCallDetectionAPI | 12 | 47726 | 0 (0%) | 0 | 47726 | $0.0057 | $0.0000 |
| **All** | 63 | 429458 | 246089 (57%) | 30315 | 153054 | $0.4777 | $0.4674 |

Writes a cache it never reads: callNarratorAPI>narrateSessionVignette (6729 tokens over 1 call(s)).

Caches nothing: callHaiku>defaultCallDetectionAPI (47726 tokens over 12 call(s)).

## Cost

|  | Dollars | Share | Calls |
| --- | --- | --- | --- |
| The module's own calls | $0.3719 | 78% | 49 |
| The AI player | $0.1058 | 22% | 14 |
| **Total** | $0.4777 |  | 63 |

Per action: $0.0341. Per line of play: $0.0398.

## The reading

_To write — the reader's notes: what went right, what went wrong, and why._

