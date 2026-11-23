# Scorecard — memory charter, live run 2 (2026-11-22)

A first pass, made by hand from the run's evidence (`run.json`, `actions.json`,
`observer.json`, `requests.json`, `replay.json`, `review.json`). The session
itself is in `annotated-transcript.md`; the action items are in
[issue #374](https://github.com/jamesrmedford-alt/starforged-companion/issues/374).

**One line.** The goal was met and the one roll was right; the campaign's
written record of the session — the recap and the Chronicle — was not. $0.34.

## 1. At a glance

| Dimension | Result | Basis | How much to trust it |
| --- | --- | --- | --- |
| Goal (memory across sessions) | **Achieved** | Stored, sent and answered; and the second opening had the fact before it was asked | One sample |
| Mechanics | **7 of 7 checks right** | One roll, checked by hand (§2) | Thin: one move, no miss, no progress track |
| Continuity — what the narrator said | **Held**, one small slip | The fact at every layer; pocket-or-table slip (§3) | One fact, one question |
| Continuity — what the helpers wrote | **2 of 4 records wrong or lossy** | Recap wrong; Chronicle lossy; summary one error; Lore page right (§3) | Mechanism seen in the prompts — solid |
| Player's intent | **5 of 5 lines answered on point** | Each reply addresses the line it follows | Small |
| Player's agency | **2 intrusions** | A line spoken for the character; a captain put over her ship (§4) | One sample |
| Friction | **12 actions for 5 lines of play; 3 asks of the GM** | §4 | Small |
| Narrator quality | **2 reviewer flags**; repetition measured | §5 | One reviewer pass |
| Speed | **13.8 s median per line of play** | §6 — includes a 3.5 s wait the runner adds | Per-call latency was not recorded |
| Cost | **$0.34**; the module's own share $0.11 | §7 | Exact, from usage |
| Health | **Clean** | No page error, move lock free, nothing stalled | Solid |

## 2. Mechanics

| Check | Result | Evidence |
| --- | --- | --- |
| The line was read as the right move | ✓ | "set a course for Bleakhold Station" → Set a Course, a charted destination (a6) |
| The right stat | ✓ | +supply |
| The outcome follows from its own dice | ✓ | 5 + 5 = 10 against 5 and 7 → strong hit |
| The outcome's effect, once | ✓ | +1 momentum, 2 → 3; one card |
| Position follows a hit | ✓ | Token and current location moved to Bleakhold Station |
| Session edges | ✓ | No focus → no bonus, said on the card; the next Begin opened session 2 |
| Lock and replies | ✓ | Lock free after every step; 5 lines of play, 5 replies, no duplicate card |

**Not exercised:** a miss, a weak hit, a suffer move, Burn Momentum, any progress
track, vows, connections, a fight. This run says nothing about them.

## 3. Continuity

**The planted fact, by layer** (at the question, step a11):

| Fact | Stated | Stored | In the prompt | In the answer |
| --- | --- | --- | --- | --- |
| The star-compass | a3 | 13 places | WORLD SNAPSHOT, ACTIVE SCENE, RECENT SCENE | "Ilse's compass, brass warm from your palm" |
| Whose it was (Ilse) | a3 | 10 places | WORLD SNAPSHOT | same sentence |

The second opening (a10) already had "the brass compass open on the table". That
is the stronger evidence, and it also means the question's prompt carried the
fact from the scene just played, not only from memory.

**What the helpers wrote about the session, against what happened:**

| Record | Written at | Right? | What it says |
| --- | --- | --- | --- |
| Fact block → scene truth → Lore page | a3, moved at a8 | ✓ | "Ilse: Mira Kestrel's sister; her brass star-compass is carried by Mira everywhere…" |
| Session summary | a8 | Mostly | Keeps the compass and whose it was, and the arrival. Wrong about who cooked. |
| Chronicle (2 entries kept of 5 written) | a3, a4 | ✗ lossy | "the character", "an intruder"; keeps the narrator's invented quote, not the possession; the arrival was rated "scene" and dropped |
| Campaign recap | a8 | ✗ wrong | "set in a galley aboard a pirate ship idling at the edge of a dead beacon's range"; Bleakhold "sits nearby" (the ship had docked); ownership of the compass lost |

**Slips in the narration:** the compass on the table (a10), then in the pocket
(a11) — the narrator half-reconciled it. A second compass "on the bridge
console" (a4).

## 4. Agency and friction

| | Count | Where |
| --- | --- | --- |
| Lines spoken for the character, outside the opening scenes | 1 | a3: "Ilse always said a compass only points to what you owe it" |
| Additions to the premise | 2 | a4: a captain who is not the player's character; the keepsake made to point at Hollow Spire, then recorded as binding scene state |
| Player actions in all | 12 | 5 lines of play; 3 commands; 3 windows answered; 1 stop |
| Asks of the GM | 3 | 1 move to confirm (a6); 2 draft cards — Ilse (a3), "Captain" (a4) — left unanswered |
| Things the table rightly did not ask | 1 | The detector proposed "Unnamed crew voice"; no card was posted |
| Dead ends, stalls, repeated attempts | 0 | |

## 5. Narrator quality

**The reviewer's flags** (a model's opinion; both quote the transcript):
repetition, medium — the second opening reuses the first; continuity, low — the
pocket-or-table slip.

**Repetition between the two openings, measured:**

| Measure | Shared |
| --- | --- |
| Five-word runs | 2 of 164 (1%) |
| Three-word runs | 8 of 166 (5%) |
| Content words | 26 of 75 (35%) |
| Invented crewmates doing the same thing | 2 of 2 — Dree, laundry, socks; Okonkwo, aft crawlspace, coolant pump |

The wording is new; the content is not. A measure of shared word runs would
have scored this repetition at 1%.

## 6. Speed

| | Seconds |
| --- | --- |
| A line of play, typed to table settled (5) | 12.3, 13.0, 13.8, 16.5, 21.9 — median 13.8; the 21.9 is the roll |
| Begin a Session, window answered to scene posted | 12.3 and 14.3 |
| End a Session (summary, closing scene, recap) | 19.5 |
| A command to its window | 2.5 – 2.9 |
| The player model, per choice (12) | median 3.0, slowest 3.4 |
| The reviewer | 13.5 |

Each line's figure includes the 3.5 seconds the runner waits for the table to
go quiet and the passes that follow a narration. **How long a player waits for
the narrator's reply was not recorded**, nor each call's own latency.

**Prompt size.** The narrator's instructions were 16,200 characters at the
first opening, 17,400 – 18,400 through play, 19,700 at the second opening (the
recap is added there). The message with them grew from 2,000 to 3,100
characters over three lines of play. No sign of runaway growth in five lines;
five lines cannot show one.

**Caching.** It worked where the module asks for it, and it is not asked for
where most of the money went.

| Calls | Prompt tokens | Read from cache | Written to cache | Sent uncached |
| --- | --- | --- | --- | --- |
| Narration (8) | 57,983 | 37,374 (64%) | 6,861 | 13,748 |
| Pacing read (5) | 25,954 | 17,244 (66%) | 4,311 | 4,399 |
| Chronicle scribe (5) | 4,472 | 2,896 (65%) | 724 | 852 |
| Move read (1) | 6,740 | 0 | 5,700 | 1,040 |
| Detector (4) | 12,257 | 0 | 0 | 12,257 |
| Recap, summary, entity notes (4) | 5,043 | 0 | 0 | 5,043 |
| **The module, all 27** | **112,449** | **57,514 (51%)** | **17,596 (16%)** | **37,339 (33%)** |
| The AI player (12) | 34,312 | 0 | 0 | 34,312 |
| The reviewer (1) | 3,768 | 0 | 0 | 3,768 |

- **What it saved.** The narrator's and the scribe's calls cost $0.100. At
  full price for the 40,270 tokens they read from cache, less the small
  premium on what they wrote, they would have cost about $0.173: the cache
  cut that bill by about 42%.
- **Every narration read its standing instructions from cache**, the first
  of each session included (3,595 tokens at the two openings; 4,481 – 5,442
  in play, once the world snapshot was written).
- **The move read wrote 5,700 tokens to cache and never read them**: there
  was one move. That write only pays from the second move on.
- **The detector caches nothing**: its instructions travel in the message,
  3,000 tokens a line. Cheap on its model ($0.002 for the run), but it is the
  largest uncached input the module sends.
- **The AI player caches nothing because the runner never asks.** It sent
  34,312 input tokens, its instructions and its tool repeated in all twelve
  calls — and it is 57% of the run's cost.
- **Not known:** what caching did for speed. The run did not record each
  call's latency.

## 7. Cost

| | Calls | Cost | Share |
| --- | --- | --- | --- |
| The AI player | 12 | $0.196 | 57% |
| The module under test | 27 | $0.107 | 31% |
| The reviewer | 1 | $0.042 | 12% |
| **Total** | **40** | **$0.344** | |

The module's $0.107: narration $0.082 (8 calls), the recap $0.011, the Chronicle
scribe $0.007 (5), the pacing read $0.003 (5), the detector $0.002 (4),
everything else under $0.002.

$0.029 per player action; $0.069 per line of play. **More than two thirds of
the money went to the test's own models, not to the thing tested.**

## 8. What was learned, and what it cost

**Spent on live calls so far:** $0.47 — run 1 $0.11, run 2 $0.34, two
connection checks about $0.01.

| # | Learned | Kind | Found by | Needed a live model? | Fix ready? |
| --- | --- | --- | --- | --- | --- |
| 1 | The GM is asked a question before a roll; the run's GM did not answer | Runner | Run 1 stalling | Yes | Fixed |
| 2 | The module's own windows were invisible to the runner | Runner | Reading run 1 | No | Fixed |
| 3 | A table waiting on its GM was called a product failure | Runner | Reading run 1 | No | Fixed |
| 4 | The recap is given the closing scene's cutaway as the campaign's scene | Product | Reading run 2 | Yes, to show; no, to reproduce | Yes — #374 A1 |
| 5 | The scribe is given neither the character's name nor the player's line | Product | Reading run 2's prompts | No | Yes — #374 A2 |
| 6 | The opening scene is given its own last jokes and no instruction to change them | Product | Reviewer, then the prompts | Yes | Proposed — A3 |
| 7 | Nothing tells the narrator who commands the ship | Product | Reading run 2 | Yes | Proposed — A4 |
| 8 | What the scribe rates "notable" decides what the recap knows | Product | Reading run 2 | Yes | Needs more runs — A5 |
| 9 | The opening scene restates the fact, so the question proves less | Test | Reading run 2 | Yes | Yes — A7 |
| 10 | Shared word runs do not measure this kind of repetition | Test | Computing §5 | No | Yes — A7 |
| 11 | The run does not record how long a player waits | Test | Making §6 | No | Yes — A7 |
| 12 | The path works: a fact with a home crosses a session | Confirmation | The observer | Yes | — |

**Return.** Twelve things for $0.47 — about four cents each. Two are product
defects with a fix ready, three were faults in the runner that would have
spoiled every later run, three are faults in the test's own measures.

**What the money did not buy.** The run's own verdict caught one of these
(the reviewer's repetition flag). Every other product finding came from
reading the prompts and the helpers' output afterwards. Without that reading,
this run's return was "achieved" and one flag.

**What could have been had for nothing.** Items 2, 3, 5, 10 and 11 needed no
model: a rehearsal's prompts show what the scribe is and is not given. A
prompt audit before the next paid run is free.

**Where the next dollar should not go.** A third run of this charter would
walk the same five lines. It would add a sample for items 6–8 and nothing
else.

**Where it should.** (a) After A1 and A2 are fixed, one re-run of this charter
(about $0.35) to see the recap and the Chronicle come out right — a fix
verified against the same session. (b) Then the long haul, whose length is the
only thing that can answer the questions this run could not.

**The cheapest levers.** The AI player is 57% of the cost and its job here is
simple: trying it on a cheaper model is a five-cent experiment that could
halve every later run, and caching its fixed instructions costs nothing to
add.

## 9. What this scorecard could not say

- How long a player waits for a reply (not recorded).
- Anything about a miss, a fight, a vow or a connection (not played).
- How often the narrator adds to the premise, or the scribe mis-rates a beat
  (one sample each).
- Whether the recap's error would surface in play: the next scene's prompt
  carried it, and that scene did not repeat it.
