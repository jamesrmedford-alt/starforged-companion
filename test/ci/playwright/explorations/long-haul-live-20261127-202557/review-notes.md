# Long haul, tenth live round — action items

Run `long-haul-live-20261127-202557`, at `1fcfae03` (`main` after PR #400: issue #399's rework of the judge and the audit, with the bug audit's fixes): 91 actions, 418 calls, 35.3 minutes, **$2.9809** (the module $2.0640, the test's own models $0.9169). **27 of 27 beats done**, **1,389 checks, none violated**. Classed `suspected-quality-issue` for one fact scored lost (F3), which the reading finds a scoring miss (finding 4). Asked with the thirteen questions written before it ran (`run.json` → `questions`).

## Issue #399's live measure

The scope's last line of "Measured by": *a live long haul: no false review card, the runner's "answered once" check clean, and every re-ask the judge causes traceable to a kind that passed.*

| Measure | Round 9 | Round 10 |
| --- | --- | --- |
| False review cards | 6 posted, all wrong | **1 posted, wrong** — a Place card on an `@scene` answer that recalled another place (a49; finding 1) |
| Answered once | 5 violations (the review card counted as a narration) | **clean** — 0 of 1,389 checks violated |
| Judge re-asks on a kind that passed | 4 re-asks, none on a measured kind | **1 re-ask, on [unsaid] (passed)** — but the verdict was wrong, and its redraft posted the narrator's note about the redraft (a77; findings 2 and 3) |

Two of the three hold. The third holds as written — the one re-ask is traceable to a kind that passed — but it was a wrong verdict, and it did harm. So the measure is not clean: #399 stays open.

## The audit's fixes, in play

| Fix | In this run |
| --- | --- |
| N7 — the judge cancelled at 4 s | Not exercised: 15 judge calls, the slowest 1.15 s. |
| N9 — a redraft that adds a breach is not posted | Not exercised: two re-asks (a2's opening on [person], a77 on [unsaid]); neither redraft broke a code check. a77's redraft *should* have been refused — no check catches a note about the draft (finding 3). |
| N10 — the judge reads the draft that posts | Not exercised: no narration of play was re-asked by a code check. |
| N16 — the GM told of a line still broken | Not exercised: no narration still broke a line after its re-ask; no note was posted. |
| N26, N27 — the GM gates | Not exercised: one GM. |
| N28 — a round's lines | Not exercised: no Batch Mode round (the batch-round playthrough was re-recorded live on the same day, `4a49c93f`). |
| N29 — the three set-pieces | Held: the oath scene (a3) and the clock vignette (a91) are told as "you" with no table words, and neither was asked again. The haul has no inciting incident. |
| N32 — one offer-line detector | Held: all ten narrations offered a move closed on an italic offer line, which the checks left out; no narration offered nothing closed on emphasis. |

## 1. REVIEW-CARD-ON-A-RECALLED-PLACE — the audit carded an answer that remembered where the story began

**What happened.** At a49 the player asked, "@scene Who do I count as a friend among the dock traders back where this began?" The answer: "Back at Hollow Spire, the only dock trader the story has recorded as yours is Tamsin Okoro…". The audit posted a ◈ Narrative Review card: "Place — recorded — Bleakhold Station — where the characters are… The narration said: 'Back at Hollow Spire, the only dock trader the story has recorded as yours is Tamsin Okoro'". The answer places no one at Hollow Spire; the characters are at Bleakhold, and the answer says "back at".

**Why.** The audit's THE PLACE check, one of its own checks and not an obligation line, read a place named in the prose as where the characters are. It is the round-9 a93 pattern (a cutaway held to the place) in an `@scene` answer about the past. D1 exempted cutaways, not answers that look back.

**Enough data?** A fix can be proposed and its effect must be measured:
- (a) the audit's place rule says that a place remembered, named as elsewhere or in the past ("back at", "where this began") is not where the characters are, and that a finding must quote words that put them there;
- (b) an `@scene` answer is audited for THE PLACE only when its question asks where they are now.

Recommendation (a), measured on the labelled set with this answer and round 9's a93 added as kept place lines. The audit's place kind is not yet in the measure (D6 scored obligation kinds only).

## 2. JUDGE-UNSAID-ON-AN-NPC-LINE — the judge took Okoro's words for the character's

**What happened.** a77 was a move made from a button, so its narration carried TELL [unsaid]: the character says nothing; the player wrote no line. The first draft: "'Hold the line,' she says at last." — *she* is Okoro, on the comm. The judge, asked "The player's character ('you') speaks", answered `{"violations":[{"line":1,"quote":"\"Hold the line,\" she says at last."}]}`, and the narration was asked again.

**Why.** The verdict quotes speech attributed to a third person. [unsaid] passed the pooled measure, but its set holds few lines of an NPC speaking on a button-made move. This is its only live flag, and it is wrong.

**Enough data?** A fix can be proposed and must be measured:
- (a) in code, a verdict on [unsaid] whose quote is speech given to someone else ("she says", a named speaker) is dropped, as a quote outside the judged view is (`verdictsByLine`);
- (b) the [unsaid] judge sentence says "only the player's character's own words — another character speaking breaks nothing", re-measured;
- (c) [unsaid] retired to logged if neither holds.

Recommendation (a) with (b), adding a77's draft to the set as a kept [unsaid] line.

## 3. REDRAFT-NARRATES-ITS-FIX — the re-ask's answer opened with a note about the draft, and the table saw it

**What happened.** a77's posted narration began: "The draft says nothing in your voice. The break is Okoro's 'Hold the line,' which has her echoing the player's earlier words. I'll cut it and let her act and speak otherwise." Then came the narration. A wrong verdict (finding 2) led to a worse post than the draft it replaced.

**Why.** The re-ask block ("## YOUR DRAFT — NOT POSTED … This breaks: … Write the narration again; keep everything else.") invites an answer about the change. No check reads a redraft for talk about drafting: [apparatus]'s shape-echo pattern holds "first sentence" and "acting character" only. Round 8's a17 opening began with the model's working notes the same way.

**Enough data?** Yes, the cause is readable:
- (a) a certain [apparatus] pattern for a narration speaking of its own drafting ("the draft", "the break is", "I'll cut", "this version", "rewritten"). Under N9, a redraft that adds it is not posted; the first draft is;
- (b) the re-ask block ends "Reply with the narration alone — no note about what changed."

Recommendation both. What proves it: a77's redraft and round 8's a17 opening are refused by the check, and the measure's set flags no kept narration.

## 4. LEDGER-RENAME-NOT-A-VARIANT (the runner) — F3 was recalled, and scored lost

**What happened.** F3, "Mira left the cargo manifest with Tamsin for safekeeping", was scored lost at F3-C (a81). The answer was right: "The manifest is under Okoro's ledger, where you left it on the Hollow Spire docks… 'It's right here. It hasn't moved.'" The charter renames Tamsin Vey to Tamsin Okoro at beat 19, but F3's `variants` list only "Tamsin", so an answer that calls her Okoro does not count.

**Fix (the charter).** Add "Okoro" to the variants of every fact that names Tamsin, or have the observer take a rename's new name as a variant. Then rescore: the run passes, with 5 recalled, 2 carried unasked, 0 lost and 1 not probed.

## 5. Refrains — still there

"ledger" is in 8 of session 1's 10 narrations, 8 in a row; "light" is in 15 of session 3's 17, 12 running. 30 words and phrases are in a third or more of a session's narrations (session 1: 7, session 2: 15, session 3: 8), against round 9's 30 (11, 10, 9). No line of speech of six words or more was said twice, so no [quote] re-ask fired. This is NARRATOR-REFRAINS, unchanged.

## The questions this run was to answer

1. **Review cards.** One posted, from 71 audit calls: the Place card at a49, which is false (finding 1). There were no obligation cards and no truth or state cards.
2. **The judge's re-asks.** 15 calls: 13 tripped by [whereabouts] alone, one by [unsaid], one by both. There was one violation (a77 [unsaid]) and so one re-ask, on a passed kind. It was wrong (finding 2) and its redraft was worse (finding 3). Each [whereabouts] call passed its narration, and the code's [here] check fired on none either.
3. **Answered once.** Clean: 0 violations, against round 9's 5.
4. **The judge's cutoff.** No call reached it (the slowest was 1.15 s).
5. **Redrafts.** Two re-asks: a2's opening ([person], certain) and a77 ([unsaid], judge). Both redrafts were posted; neither broke a code check. N10 was not exercised.
6. **The GM's note.** None needed: no narration still broke a line after its re-ask.
7. **Set-pieces.** The oath scene (a3) and the clock vignette (a91) call Mira "you" and use no table words; neither was asked again. a2's opening named her ("gave Mira a great deal of bench") and its redraft says "you". (The counter's "crew role in an opening" there, "built for a crew of eight and held one", names no role.)
8. **The offer line.** All ten closing move suggestions are italic sentences the detector reads, and each names the very move it was offered (Make a Connection, Develop Your Relationship ×7, Enter the Fray, Repair), so each card's Roll is that move. No narration that was not offered a move closed on emphasis.
9. **Harm with no cost.** None found: no [sheet] re-ask fired, and a read for harm said of "you" finds none.
10. **The fight.** Between Enter the Fray (a30) and Take Decisive Action (a36) the cutter is never told destroyed, dead, fled or beaten; no [foe] trip fired. Take Decisive Action ended it.
11. **Where Mira is.** No frame, recap or STANDING NOW moved her. The four "one place" flags (a38, a39, a55, a84) are the enemy cutter adrift off the ring, not her ship. The audit's one card is the false Place card (finding 1).
12. **Repetition.** No line of speech said twice. Refrains: 30, the same as round 9's, but distributed 7/15/8 (finding 5).
13. **What it cost.** $2.98, 418 calls, 91 actions and 35.3 minutes, against round 9's $3.26, 469, 95 and 40.6: $0.033 an action against $0.034. The judge made 15 calls (round 9: 19) and caused one re-ask (round 9: 4). 27 of 27 beats against 26; 1,389 checks with 0 violated against 1,453 with 5.

## What it cost and what it returned

$2.98: the module $2.06, the AI player and the observer $0.92. The re-recorded batch-round playthrough's 11 calls are not in that total. Returned:
- #399's live measure: two of three clean, and the third wrong in a new way;
- three module findings (1–3), each with a fix that a recorded case proves, so they need no further live run;
- one runner finding (4) that would have cost nothing to catch: the charter's own rename.

The next dollar should wait until findings 1–3 are fixed and measured on the set with this run's cases added.
