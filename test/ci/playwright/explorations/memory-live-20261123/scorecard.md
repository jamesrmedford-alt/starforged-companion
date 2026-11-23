# Scorecard — memory charter, live run 3 (2026-11-23): the verification re-run

Made by hand from the run's evidence (`run.json`, `actions.json`,
`observer.json`, `requests.json`, `replay.json`). The session itself is in
`annotated-transcript.md`; the action items are in
[issue #374](https://github.com/jamesrmedford-alt/starforged-companion/issues/374),
which this run extends.

**One line.** The scribe's fix works and the closing cutaway no longer leaves a
scene open; the recap the run was bought to read was never written, because
the Chronicle kept nothing of a session with four rolls in it. $0.22.

## 0. What the run was for

Said before it ran (issue #373, spending rule 1). It verifies the fixes for
#374 A1 and A2 (PR #375) and is the Sonnet player's first whole run.

| Question | Answer |
| --- | --- |
| 1. Does the recap written at End a Session put the campaign where it is? | **Not answered.** No recap was written: the Chronicle was empty (§3). What needs no model held — no scene open after End a Session, nothing of the cutaway in the next prompt. |
| 2. Do Chronicle entries name the character and keep what the player established? | **Yes.** 5 of 5 name her; the planting beat's entry holds the compass. |
| 3. Can the Sonnet 5.5 player walk the goal? | **Yes** — 12 actions, as the larger model took; $0.098 against $0.196. It left two cost cards unanswered (§2). |
| 4. Does the goal hold, and at what cost as now configured? | **Achieved at every layer; $0.22** (projected $0.21). |

## 1. At a glance

| Dimension | Result | Basis | How much to trust it |
| --- | --- | --- | --- |
| Goal (memory across sessions) | **Achieved** | Stored, sent, answered; and the second opening had the fact before it was asked | Two samples now (runs 2 and 3) |
| Mechanics | **4 rolls right; 2 costs left unpaid** | Each roll checked by hand (§2) | Four moves of two kinds; no progress track, no fight |
| Continuity — what the narrator said | **Held** | The fact at every layer; no slip found | One fact, one question |
| Continuity — what the helpers wrote | **Lore right; Chronicle right and thrown away; summary one error; no recap** | §3 | Mechanism seen in the calls — solid |
| Player's intent | **5 of 5 lines answered on point** | Each reply addresses its line | Small |
| Player's agency | **0 lines spoken for the character outside the openings; 1 stat read aloud** | §4 | One sample |
| Friction | **12 actions for 5 lines of play; 6 asks of the GM; 2 cards nobody answered** | §4 | Small |
| Narrator quality | **Repetition again, one line word for word** | §5 | Two samples of the same fault |
| Speed | **20.2 s median per line of play** (four of the five were rolls) | §6 — includes a 3.5 s wait the runner adds | Per-call latency of the module's calls still not recorded |
| Cost | **$0.22**; the module's own share $0.12 | §7 | Exact, from usage |
| Health | **Clean** | No page error, move lock free, nothing stalled | Solid |

## 2. Mechanics

| Check | Result | Evidence |
| --- | --- | --- |
| Each line read as the right move | ✓ 4 of 4 | Three risky actions against a fire → Face Danger; "setting a course for Bleakhold Station" → Set a Course |
| The stat on the card is the sheet's | ✓ 4 of 4 | +edge 2, +wits 3, +iron 1, +supply 5 |
| The outcome follows from its own dice | ✓ 4 of 4 | 3+2=5 against 4, 10 → weak hit · 2+3=5 against 7, 9 → miss · 4+1=5 against 3, 5 → weak hit (the tie goes to the challenge die) · 5+5=10 against 3, 8 → strong hit |
| A miss's price, once | ✓ | The price stated before the roll: Endure Harm, health 5 → 4; one card |
| A strong hit's effect, once | ✓ | +1 momentum, 2 → 3; one card |
| Position follows a hit | ✓ | Token and location moved to Bleakhold Station |
| **A weak hit's cost is paid** | **✗ 0 of 2** | Both "Make a suffer move (-1)" cards were posted and never answered (a3, a5); no meter moved |
| Session edges | ✓ | No focus → no bonus, said on the card; the next Begin opened session 2 |
| Lock and replies | ✓ | Lock free after every step; 5 lines of play, 5 replies, no duplicate card |

**The unpaid costs.** The card was on the player's screen with its five
buttons at every later choice; the player typed on. Its instructions never
say such a card is waiting on it — the runner's gap. The table, for its part,
let two more moves, End a Session and Begin a Session go by without a word
about them: the card is non-blocking by design
(`src/moves/sufferCard.js`), and nothing else carries the debt.

**Three rolls in three lines.** Each fire line was read as a move under the
*combat* category (confidence 0.7, 0.8, 0.8), the reader citing the combat
dial of 9. There was no fight; the reader's five categories have no place for
a hazard that is not one.

**Not exercised:** a strong hit on an action move, Burn Momentum, any
progress track, vows, connections, a fight.

## 3. Continuity

**The planted fact, by layer** (at the question, step a11):

| Fact | Stated | Stored | In the prompt | In the answer |
| --- | --- | --- | --- | --- |
| The star-compass | a3 | 9 places | WORLD SNAPSHOT, RECENT SCENE | "The compass sits by the bowl where it has sat all meal. Brass, palm-sized" |
| Whose it was (Ilse) | a3 | 9 places | WORLD SNAPSHOT | "Ilse's thumbnail left that scar" |

The Chronicle is not among the nine: nothing of session 1 was kept in it.
The second opening (a10) had "your sister's brass compass resting beside it"
before anyone asked, from ESTABLISHED LORE and EARLIER SESSIONS in its
prompt. That is the evidence of recall; the answer came after it.

**What the helpers wrote about session 1, against what happened:**

| Record | Written at | Right? | What it says |
| --- | --- | --- | --- |
| Fact block → scene truth → Lore page | a3, filed at a8 | ✓ | "Mira Kestrel: Carries a brass star-compass that belonged to her sister Ilse" |
| Chronicle entries (4 written, **0 kept**) | a3–a6 | ✓ in content, ✗ in what was kept | Each names Mira; a3's holds the compass; all four rated "scene", below the "notable" floor |
| Session summary | a8 | Mostly | Keeps the compass, the fire, the arrival. "A crewmate shouts for the extinguisher" — Mira did. 405 of its 420 output tokens used |
| Campaign recap | — | **Not written** | An empty Chronicle gives no recap |
| Closing cutaway's scene | a8 | ✓ | Closed with its card: no scene open at a8 or a9 (run 2: one of its own) |

**The scribe's ratings, three live runs:** 11 beats rated — 8 "scene", 3
"notable". Every resolved move was "scene": 5 of 5, both arrivals among them.

**Session 2:** one entry, rated "notable" and kept: "Mira Kestrel still
carries her sister Ilse's brass compass, its glass scratched by Ilse's
thumbnail, its needle holding steady aft." The thumbnail is the narrator's
addition at a11.

## 4. Agency and friction

| | Count | Where |
| --- | --- | --- |
| Lines spoken for the character, outside the opening scenes | 0 | Run 2: 1 |
| A game stat read aloud | 1 | a2: "Wits 3 means you have already worked out…" |
| Additions to the premise | 1 | a11: the keepsake's scratch is made Ilse's thumbnail's, then drafted and written down as fact. No captain this time (run 2: one) |
| Player actions in all | 12 | 5 lines of play; 3 commands; 3 windows answered; 1 stop |
| Asks of the GM | 6, answered by the autopilot; 1 left | 4 moves to confirm; "Who are you interacting with?" twice (a3, a4); the draft card for Ilse (a11) unanswered |
| Cards waiting on the player that nobody answered | 2 | The cost cards of a3 and a5 |
| Things the table rightly did not ask | 1 | "Unknown Suited Figure" was proposed at low confidence; no card |
| Dead ends, stalls, repeated attempts | 0 | |

## 5. Narrator quality

**Repetition between the two openings** (the measure of run 2's scorecard):

| Measure | Run 3 | Run 2 |
| --- | --- | --- |
| Five-word runs shared | 5 of 145 (3%) — all one line, "Nobody panic, it's only a little bit on fire!" | 2 of 164 (1%) |
| Three-word runs shared | 7 of 147 (5%) | 8 of 166 (5%) |
| Content words shared | 18 of 72 (25%) | 26 of 75 (35%) |
| The instruction's own examples used | 2 of 2, in the first opening | — |

The first opening took both examples the instruction offers ("rewiring an
escape pod from the inside again", "recalibrating the gravity", in the
laundry). The second took the first's closing line whole — the session
summary in its prompt quotes it — and its tea, its twenty minutes and its
noise from aft. The fire put out at a5 is "a little bit on fire" again.

**Other:** the keepsake's needle is given a will again ("swings aft and holds
there"; run 2: toward Hollow Spire).

## 6. Speed

| | Seconds |
| --- | --- |
| A line of play, typed to table settled (5) | 19.5, 19.9, 20.2, 20.2, 20.5 — median 20.2; four are rolls |
| Begin a Session, window answered to scene posted | 15.2 and 13.0 |
| End a Session (summary and closing scene; no recap) | 12.4 |
| A command to its window | 2.3 – 3.0 |
| The player model, per choice (12) | median 2.5, slowest 6.0 |

A rolled line makes five or six model calls (pacing read, move read, who is
meant, narration, scribe, sometimes the detector) and waits on the GM once or
twice. Each figure includes the 3.5 seconds the runner waits for quiet.
**Each of the module's calls' own latency is still not recorded** (#374 A7).

**Prompt size.** The narrator's instructions: 16,200 characters at the first
opening, 17,100 – 19,200 through the four rolls, 18,300 at the second
opening, 19,700 at the question. The message with a move grew from 2,300 to
4,100 characters over four rolls. No runaway growth in five lines.

**Caching.**

| Calls | Prompt tokens | Read from cache | Written to cache | Sent uncached |
| --- | --- | --- | --- | --- |
| Narration (8) | 59,109 | 32,197 (54%) | 13,152 | 13,760 |
| Pacing read (5) | 26,211 | 17,244 (66%) | 4,311 | 4,656 |
| Move read (4) | 27,000 | 17,100 (63%) | 5,700 | 4,200 |
| Chronicle scribe (5) | 6,166 | 3,880 (63%) | 970 | 1,316 |
| Detector (2) | 6,284 | 0 | 0 | 6,284 |
| Session summary (1) | 1,602 | 0 | 0 | 1,602 |
| Entity notes, who is meant (4) | 1,462 | 0 | 0 | 1,462 |
| **The module, all 29** | **127,834** | **70,421 (55%)** | **24,133 (19%)** | **33,280 (26%)** |
| The AI player (12) | 35,544 | 0 | 0 | 35,544 |

- **A cold start.** The first narration read nothing and wrote 5,387 tokens:
  nothing had called the API for over an hour. Run 2's first narration read
  its standing instructions from run 1's cache.
- **From a session's second narration on, 61% of prompt tokens were read
  from cache** (a3–a6 and the closing scene). The snapshot was taken anew
  only at End a Session and at Begin a Session — not once in between.
- **The move read's cache paid this time**: written once, read three times.
- **What it saved:** the narrator's and the scribe's calls cost $0.111; at
  full price for what they read, less the premium on what they wrote, about
  $0.173 — a saving of about 36% (run 2: 42%, with a warm start).
- The scribe's instructions grew from 724 to 970 tokens with the fix for A2.
- The AI player still caches nothing (#374 A7, to build, 4).

## 7. Cost

| | Calls | Cost | Share |
| --- | --- | --- | --- |
| The AI player (`claude-sonnet-5-5`) | 12 | $0.098 | 45% |
| The module under test | 29 | $0.119 | 55% |
| **Total** | **41** | **$0.218** | |

The module's $0.119: narration $0.102 (8 calls), the scribe $0.009 (5), the
move read $0.004 (4), the pacing read $0.003 (5), everything else $0.001.

$0.018 per player action; $0.044 per line of play. Run 2 cost $0.34 with the
larger player and an API reviewer; the same session shape now costs $0.22,
and more than half of it is the thing tested.

## 8. What was learned, and what it cost

**Spent on live calls so far:** $0.70 — run 1 $0.11, run 2 $0.34, run 3
$0.22, connection checks about $0.02.

| # | Learned | Kind | Found by | Needed a live model? | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | The scribe, given the name and the player's line, names the character and keeps what was established | Confirmation of a fix (A2) | Reading the entries | Yes | Fixed, verified |
| 2 | The closing cutaway leaves no scene open; nothing of it reaches the next prompt | Confirmation of a fix (A1, the half code decides) | The observer's marks; the prompt | No — the replay had shown it | Fixed, verified |
| 3 | A live recap from the corrected prompt | — | — | Yes | **Not learned**: none was written |
| 4 | A session's rolls and arrival are all rated too low to keep; an empty Chronicle means no recap | Product (A5) | Reading the calls | Yes | Was "not yet"; now a pattern — 5 of 5 moves over three runs |
| 5 | A weak hit's cost can go unpaid without a word | Product, for a decision; and a gap in the runner | Reading the player's screens | Yes | New — A10 |
| 6 | The opening scene uses its instruction's examples and its own last line | Product (A3) | Reading, then measuring | Yes | Second sample; proposal stands |
| 7 | The opening scene reads a stat aloud | Product | Reading | Yes | New — A11; a fix can be proposed |
| 8 | A hazard is filed under combat: three rolls in three lines | Product, for a decision (A9) | The pacing reads | Yes | Four samples; the cause is in the reader's categories |
| 9 | The session summary runs to its length cap, and has been cut off mid-word | Product | The call's usage; the first-session recording | No — the recording had it since 2026-11-22 | New — A12; enough to fix |
| 10 | The narrator's invention reaches the Chronicle and a draft card | Product (A6) | Reading | Yes | Second sample; watch |
| 11 | The summary swaps who did what | Product (A8) | Reading | Yes | Second sample; watch |
| 12 | The Sonnet player walks the goal for half the money | Confirmation | The run | Yes | Done |
| 13 | The run costs what was projected | Confirmation | Usage | Yes | Done |

**Return.** $0.22 bought: two fixes confirmed, the player model confirmed, one
finding moved from a sample to a pattern (A5), three new findings (A10–A12),
second samples for four. It did not buy the thing it was mainly for — a live
recap to read.

**Could that have been known for nothing?** Partly. Run 2 had already shown
the scribe rating a roll and an arrival "scene"; that a whole session could
come out empty was foreseeable from it, and a rehearsal cannot show it (its
stand-in rates what it is told to). The recording of 2026-11-22 already held
the cut-off summary; nobody had read that call's stop reason.

**Where the next dollar should not go.** A fourth run of this charter. The
recap cannot be read until the Chronicle keeps something (A5).

**Where it should.** Nothing until A5 is decided. Then the long haul
(#373), whose three sessions and sixty-odd ratings are the measure of
whatever A5's fix is.

**For nothing, now:** tell the AI player to answer a card that asks it to
choose, and give the observer a check for a cost left owed (A10); read every
recorded call's stop reason in the kept recordings (A12 came from one).

## 9. What this scorecard could not say

- What a live recap looks like after the fix for A1: none was written.
- How long a player waits for the narrator's reply, call by call (not
  recorded).
- Anything about a fight, a vow, a connection or a progress track (not
  played).
- Whether the scribe's better entries would make a better recap: they were
  not kept.
