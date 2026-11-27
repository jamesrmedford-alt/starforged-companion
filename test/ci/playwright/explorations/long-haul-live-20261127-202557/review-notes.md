# Long haul, tenth live round — action items

Run `long-haul-live-20261127-202557`, at `4a49c93f` (`main` after PR #400 — issue #399's rework of the judge and the audit, with the bug audit's fixes — and the batch-round playthrough re-recorded; no module change between them): 91 actions, 418 calls, 35.3 minutes, **$2.9809** (the module $2.0640, the test's own models $0.9169). **27 of 27 beats done**, **1,389 checks, none violated**. Classed `suspected-quality-issue` for one fact scored lost (F3), which the reading finds a scoring miss (finding 4). Asked with the thirteen questions written before it ran (`run.json` → `questions`).

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

## 6. EFFECT-TOLD-BEFORE-APPLIED — a supply spent that the sheet never took, and a repair told before its points were spent (a57)

**What happened.** Repair, a weak hit: repair points (facility 3, field 1), with a 🔧 Spend button nobody pressed. The narration: "The plating takes the patch and holds. The guns cycle clean … The work eats the morning, though, and your supplies run thinner than you left them." Supply is 5 from a56 to a91, and integrity 4 from a33 to the end. The a78 recap says "you repaired the damage from that fight".

**Why.**
- The stakes the player saw before the roll ("On a hit: The plating holds and the guns and engine feeds run true again") promise the repair as done. The move only gives points to spend.
- The weak hit's TELL line asks for "the cost or complication the move outcome names". Repair's weak hit names none, so the narrator made one up, on the sheet.
- [sheet]'s certain check holds bodily harm only. Its own comment says it: "The rest of the line (supplies, repairs, bonds) is told, not held". And [sheet] is not one of the judge's acting kinds.
- Round 9's a58, round 7's a56 and round 6's a62 are the same.

**Enough data?** Yes — four rounds, one cause:
- (a) a Repair's stakes are written as the points it gives, not the mending;
- (b) a weak hit's TELL names no cost its move does not name;
- (c) [sheet]'s certain check gains a supply clause — supplies, stores or rations told spent where the sheet's supply did not drop — tuned on the measure's set as the harm clause was.

Recommendation (b) and (c), measured on the set with this a57 and round 9's a58 added.

## 7. VOW-WON-BY-A-STRANGER, again — two rules disagree on whether the vow's truth names someone (a3, a75, a78)

**What happened.** At a3 the oath's DECIDE NOW asked for "one of the people the story has met if one fits (Foreman), else a new name; a new one is shown in play, by name, before the truth is revealed". The plan's truth chose him: "The raids are run by the foreman who once collected on Mira's family debt…". Then a sentence was appended in code: "…The one behind it is Talia Tolari." At a75 Okoro reads "Talia Tolari" "off the page you sent her" — the name's first appearance, from a page Mira never sent. The recap (a78) names both culprits.

**Why.** Two readers of one truth disagree on a pending draft:
- `secrets.js namedIfAWhoVow` asks `truthNamesSomeone(truth, …)` with the story's people but not its pending drafts. "the foreman" is no proper name, so it drew a name from the name oracle and appended it (`truthWithWho`).
- `narrator.js strangersOfWhoPlans` asks `strangerNamedIn` with the pending drafts as whole names. The truth holds a2's draft "Foreman" whole, so the culprit counts as met, and no prompt carried "Not yet in play: Talia Tolari…".
- Checked against the code: `strangerNamedIn(truth, { people: ["Tamsin Okoro"], exact: ["Foreman"] })` is null; without the draft it is "Talia Tolari".

So the maintainer's rule held in the prompt — the foreman was chosen — and was undone in code. Round 8's "show a new one first" never fired. One more seam: the plan's sidecar claimed the oracle's re-roll (the a75 rolls card: "Re-rolled in place of 'Begin / Power': Weaken / Hate"), but its truth says "He began the raids to gain power". Nothing reads a claimed re-roll against the words.

**Enough data?** Yes:
- (a) `namedIfAWhoVow` counts a pending draft, by its whole name, as someone the truth names — one reader for both;
- (b) where a name was appended, the stranger check reads that sentence's name, not any person anywhere in the truth;
- (c) the re-roll is an observation, one case.

Recommendation (a) and (b), pinned with this truth.

## 8. NPC-PRONOUN-NOT-KEPT — the customs clerk is "her" in session 2 and "he" in session 3

**What happened.** "She ducks behind her panel" (a28), "The clerk takes her palm off the curled page" (a43); then "'Cinder Wren,' he says" (a53), "a slip pinched in his fingers" (a55), "his slip" (a60, a64).

**Why.**
- The clerk is an unnamed person, "customs clerk" in the truths and the frame's present list, with no card until a55's draft. No store held a pronoun for her.
- Session 3's prompts held a47's opening ("the clerk's palm"), not session 2's narrations, the only place "her" lived. a53's prompt names "customs clerk" four times, never with a pronoun.

**Enough data?** A fix can be proposed:
- (a) the frame's present list keeps a pronoun beside an unnamed handle ("customs clerk (she)"), from the narration's fact block, as a named person's card keeps theirs;
- (b) a check reads a handle's pronoun changing within a session.

Recommendation (a), so a session break cannot lose it.

## 9. ORACLE-YES-LEFT-BEHIND — the survivor the oracle's YES showed is gone at the next session

**What happened.** "Is anyone left alive aboard the Cinder Wren?" — likely, d100 3, YES (a43). The follow-up shows "a figure hauling itself along a bulkhead, one arm pressed to its ribs … still trying to reach someone". Session 3's opening (a47) has the cutter "adrift with a lock still standing open"; a55 has her "dark now, her lock still open". No narration mentions the survivor again.

**Why.**
- a47's prompt held a43's narration word for word as its last narration, and said "whatever was still going on when the session stopped is still going on — a ship alongside, a lock standing open … someone waiting". The opening kept the lock and dropped the person.
- After a47 no prompt holds the survivor. The YES is in the session record (s2-33; the recap tells it) and in `recentOracles`, but no truth binds it, and the follow-up's fact block recorded no one in the lock.

**Enough data?** Partly — one case, with a readable cause:
- (a) an answered yes/no question is a truth that binds, its basis the dice, as a `!truth set` is the player's;
- (b) the opening's WHERE block names the last scene's oracle answers.

Recommendation (a).

## 10. TRUTHS-FILED-A-SCENE-EARLY — still one scene early (a40)

**What happened.** a40's `!truth list` files the expedition's truth from a22 under "Scene 1 — the session begins (Tamsin Vey's ledger stall…)". It files a26's Bleakhold truths under "Scene 3 — … (crater rim beside the hauler wreck)". Nothing is under Scene 2. Round 7's a39 was the same.

**Why — read now.** At a22 the live ledger had the truth in the expedition's scene (`sc-79842375`), so the narration's copy was right. The list groups an earlier scene's truths by the record's beat (`earlierScenes.js`, `beat.scene`). `record/read.js` takes a beat's scene from the event that opens it (`open`: `beat.scene = e.scene`), and `record.js` stamps an event with the scene current when it is recorded. A move that begins a scene opens its beat before the scene turns, so its narration's truths join a beat of the old scene. To confirm with a test.

**Enough data?** Yes: the beat that begins a scene takes the scene its narration was told in.

## 11. Smaller observations

- **Openings decide what Mira thinks and does**, in a jokey voice: a2, a17 ("you will push everything a little further down the road … and call it destiny"), a47 and a91. The player had typed only !begin-session.
- **A rank or a game term told as a fact.** a80, "She is still dangerous, though"; a52, "though she is your command vehicle"; a22, "a vital world".
- **The detector named the crater after the ship**: "Kobayashi IV Wreck Crater … under the cloud cover of Kobayashi IV" (a23). The world has no name.
- **A scene answer hints at a hidden plan.** a80, "would never trade you for her own freedom", is Okoro's plan's possible ending.
- **Physical slips over a comm**: Okoro's pen "stays still" (a63), a chit thumbed "toward the channel" and then looked at (a62), "the scrape of a drawer" (a81); airlocks "swing" (a53, a66).
- **Cards.**
  - "🤝 Deepen your bond" on the victory card (a36) is the linked vow's one deepen, offered to a connection not yet bonded: the word is wrong before the bond.
  - "Renamed to Tamsin Okoro" under the NPC's name (x19) and "0 momentum (now 10)" (a89) are the game system's own chat alerts.
  - a76's bonded roll adds its +2 momentum before the burn-or-keep choice.
- **The runner.** The transcript's `&lt;place&gt;` is `lib/observer.mjs`'s: it strips tags without decoding entities. The table read `!at <place>`.

## The cold read, checked

Held against the transcript and the records:
- the drafting note (3);
- the clerk (8);
- the culprit first seen at the fulfilment, and the recap that names two (7);
- the survivor (9);
- the false card (1);
- the supplies (6);
- the truths a scene early (10);
- the refrains (5);
- the openings and the game terms (11).

Wrong, or right for another reason:
- **"The X-Card made no visible difference" (x16): wrong.** a38 was removed and its facts withdrawn, and every later prompt carried X-CARD — REDIRECT. The voice and the open lock are older than a38 (a23, a35, a36); a43 is a new development.
- **"She pays in news … reverses a6" (a59): wrong.** It is Okoro's plan's clue c3, shown.
- **"Okoro *is* at Hollow Spire" (a49):** the card is false, but because it held "Back at Hollow Spire" to where the characters are.
- **"a raw HTML escape":** the runner's transcript.
- **"Deepen your bond" before any bond:** by design; the word only.

The charter's, not the module's:
- the memory questions in runs;
- the player making the NPCs' acts and the world's events (a10, a22, a27, a28);
- the renames (a40–a42, x19);
- !end-session opened and closed (x15);
- six Develop lines over one call (a58–a68), every progress roll 1, 2;
- the reward card never answered;
- each question put to Mira and left as a beat moved on.

## The questions this run was to answer

1. **Review cards.** One posted, from 71 audit calls: the Place card at a49, which is false (finding 1). The audit found one more, at a85, low confidence and so not posted — also wrong (it held Okoro's bond to an answer that agrees with it). There were no obligation cards and no truth or state cards.
2. **The judge's re-asks.** 15 calls: 13 tripped by [whereabouts] alone, one by [unsaid], one by both. There was one violation (a77 [unsaid]) and so one re-ask, on a passed kind. It was wrong (finding 2) and its redraft was worse (finding 3). Each [whereabouts] call passed its narration, and the code's [here] check fired on none either.
3. **Answered once.** Clean: 0 violations, against round 9's 5.
4. **The judge's cutoff.** No call reached it (the slowest was 1.15 s).
5. **Redrafts.** Two re-asks: a2's opening ([person], certain) and a77 ([unsaid], judge). Both redrafts were posted; neither broke a code check. N10 was not exercised.
6. **The GM's note.** None needed: no narration still broke a line after its re-ask.
7. **Set-pieces.** The oath scene (a3) and the clock vignette (a91) call Mira "you" and use no table words; neither was asked again. a2's opening named her ("gave Mira a great deal of bench") and its redraft says "you". (The counter's "crew role in an opening" there, "built for a crew of eight and held one", names no role.)
8. **The offer line.** All ten closing move suggestions are italic sentences the detector reads, and each names the very move it was offered (Make a Connection, Develop Your Relationship ×7, Enter the Fray, Repair), so each card's Roll is that move. No narration that was not offered a move closed on emphasis.
9. **Harm with no cost.** No bodily harm: no [sheet] re-ask fired, and none is said of "you". One spent resource, not caught: a57's "your supplies run thinner than you left them", with supply 5 throughout, and its plating told mended with integrity 4 to the end (finding 6).
10. **The fight.** Between Enter the Fray (a30) and Take Decisive Action (a36) the cutter is never told destroyed, dead, fled or beaten; no [foe] trip fired. Take Decisive Action ended it.
11. **Where Mira is.** No frame, recap or STANDING NOW moved her. The four "one place" flags (a38, a39, a55, a84) are the enemy cutter adrift off the ring, not her ship. The audit's one card is the false Place card (finding 1).
12. **Repetition.** No line of speech said twice word for word; near-repeats pass ("Nobody has put their neck on my ledger before", a61; "No one has put their own fuel on my ledger before", a67). Refrains: 30, the same as round 9's, but distributed 7/15/8 (finding 5).
13. **What it cost.** $2.98, 418 calls, 91 actions and 35.3 minutes, against round 9's $3.26, 469, 95 and 40.6: $0.033 an action against $0.034. The judge made 15 calls (round 9: 19) and caused one re-ask (round 9: 4). 27 of 27 beats against 26; 1,389 checks with 0 violated against 1,453 with 5.

## What it cost and what it returned

$2.98: the module $2.06, the AI player and the observer $0.92. The re-recorded batch-round playthrough's 11 calls are not in that total. Returned:
- #399's live measure: two of three clean, and the third wrong in a new way;
- eight module findings (1–3, 6–10), each with its cause read from the recorded prompts and the code, and each a fix a recorded case proves;
- three of them (6, 7, 10) are rows already open, so their fixes did not hold or were never made;
- one runner finding (4) that would have cost nothing to catch: the charter's own rename.

The next dollar should wait until findings 1–3 and 6–10 are fixed and measured on recorded cases, this run's added.
