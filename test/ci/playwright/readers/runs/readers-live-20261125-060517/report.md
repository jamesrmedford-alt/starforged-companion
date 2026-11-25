# The readers on plain lines — readers-live-20261125-060517

A live run, 2026-11-25T06:05:17.892Z, at commit `8b7bf4792de0`: 76 line(s), read 2 time(s) each by `two:claude-sonnet-5-5` and `one:claude-sonnet-5-5` and `one:claude-haiku-5-5` — 456 reading(s).

## What this run was to answer

1. Lines wanting a move: does the one reader on Sonnet read at least as many as the two readers on Sonnet, less two readings, with no family falling by more than two?
2. Controls: does the one reader offer or roll a move for no more controls than the two readers, plus one?
3. Another move: does the one reader roll or offer a move other than the one wanted no more often than the two readers?
4. Issue #383's kinds: does each (trust, worth, supported claim, refuted claim, a named move after a run of moves) come out as wanted in at least three of its four readings by the one reader?
5. Fights: does the one reader read at least as many fight lines as the two readers, with every reading allowed by the character's position after the remap, and no fight control rolled?
6. Time: is the one reader's median rolled line at least 1 s faster than the two readers', and its median narrated line no more than 0.3 s slower?
7. Cost: is the one reader's whole spend a line (the mean) no dearer than the two readers', and what is the median line beside it?
8. The dials: among read lines whose move makes an action roll, is the one reader's share rolled within 10 points of the two readers'?
9. Unreadable replies: are no more than one in a hundred of the one reader's readings failed?
10. READERS-MODEL: does Haiku 5.5 on the one reader's prompt read as many lines and controls right as Sonnet 5.5 does?
11. Caching: is the one reader's system prompt written to the cache once per model and read from it on every later call of the run?
12. Consistency: do the one reader's two readings of a line come to the same outcome, and say the same risk, as often as the two readers' do?

**The answers** (written after the run, from the tables below; the verdict is section 8.2's, computed by the run — **do not switch**):

1. **No.** 102 of 112 against 108. The misses were the reader's own rules, read word for word: develop-2 twice (a favour to Tamsin, "a kind gesture with nothing at risk" — rule 5 applied to a move with no roll), progress-1 twice and progress-3 once (headway "only … in words"), named-after-moves twice (Set a Course read right, the player's naming of it not marked `asked`, so the dense window offered it), gear-1 twice (read surely; the 0–2 dial band narrated it), done-1 once (a milestone, where Fulfill Your Vow is wanted). No family fell by more than two.
2. **Yes.** 2 of 40 against 7 (trust-1 and trust-2, once each).
3. **Yes.** 1 against 4.
4. **No.** trust 2 of 4 (trust-1 and trust-2's first readings offered Develop: "reinforces an existing connection"), named-after-run 2 of 4 and claim-supported 2 of 4 (as in 1); worth and claim-refuted 4 of 4.
5. **Yes.** 12 of 12 against 12 of 12; none illegal; no fight control rolled.
6. **Yes.** A rolled line's median 2.42 s against 5.01 s; a narrated one 1.95 s against 1.76 s (0.19 s slower, inside 0.3).
7. **No.** $0.0070 a line against $0.0066 (the median line $0.0068 against $0.0040). A call took about 1,773 uncached input tokens ($0.0035 — half its cost), 244 output, 8,213 cache read; the system prompt was about 8.2k tokens, not the 6k estimated.
8. **Yes.** 67% (55 of 82) against 68% (57 of 84).
9. **Yes.** 0 of 152.
10. **No.** Haiku 5.5 on the one reader's prompt read 88 of 112 and 19 of 40 controls right, against Sonnet's 102 and 38; it stays off the readers (READERS-MODEL).
11. **Yes, by the totals.** Each arm wrote its system prompt to the cache once (8,267 tokens of cache writes) and read 1,248,317 tokens from it over 152 calls — about 8.2k a call, the whole prompt.
12. **About as often.** The one reader's repeats agreed on 70 of 76 lines, the two readers' on 69 (Haiku's 69). Its risk words are not compared here.

**What followed:** the reader's mend (743c2441) — a move with no roll needs nothing at risk, headway the scene bears out is a step, a named move marked `asked` in code, a sure reading offered at the low dials, and a cheaper call — read again live in `readers-live-20261125-073803` (switch).

## How a line is scored

Each line has the reading it should get: one or more moves the rules allow, or no move (a control). A line is read by the pacing reader, and — when that calls it a move — by the move reader, exactly as the chat pipeline calls them; nothing is rolled or narrated.

- **rolled** — the pacing reader calls it a move and the move reader picks a wanted one: the roll dialog opens on the right move.
- **offered** — the line is narrated with a wanted move on the card's button: the pacing reader offered it, or it called a move, the move reader read none (or was unsure), and the move it had named is offered.
- **another move rolled** / **another move offered** — a move that is not one the line wants.
- **nothing** — narrated with no move offered: the player is left to ask for one.
- **offered, not rolled** — a line that names its move wants it rolled (the pacing reader's own rule: a line that names its move asks for it, at any dial); offered on a button instead, it is not read.
- A control: **narrated** (right), **a move offered**, **a move rolled**.
- **reader failed** — a reader's call failed or its reply could not be read; not scored, and not in any rate.

**Rolled and offered both count as read**: either way the player gets the right move without naming it. Offered costs them a click, and the line is narrated first.

An arm `one:<model>` reads each line with the one reader instead (src/moves/reader.js, routed by src/pacing/readAndRoute.js): one call, and its route is what the line comes to — roll, offer on a button, or narrate. A line that asks to be rolled (a move named after a run of moves) is read only when it is: offered, it is **offered, not rolled**.

## Headline

| Arm | Lines wanting a move | Read | rolled | offered | Another move | Nothing | Controls right | Reader failed |
|---|---|---|---|---|---|---|---|---|
| `two:claude-sonnet-5-5` | 112 | **108 of 112 (96%)** | 63 | 45 | 4 (2 rolled, 2 of them on purpose; 2 offered) | 0 | 33 of 40 (83%) | 0 |
| `one:claude-sonnet-5-5` | 112 | **102 of 112 (91%)** | 60 | 42 (and 2 named, offered, not rolled) | 1 (0 rolled; 1 offered) | 7 | 38 of 40 (95%) | 0 |
| `one:claude-haiku-5-5` | 112 | **88 of 112 (79%)** | 45 | 43 (and 3 named, offered, not rolled) | 19 (6 rolled; 13 offered) | 2 | 19 of 40 (48%) | 0 |

Of the 56 line(s) wanting a move that every arm read: **40** every arm read right, **15** some did and some did not, **1** none did. A line no arm reads is not the model's doing alone; a line one arm reads and another does not is where the model matters.

## By family

| Family | `two:claude-sonnet-5-5` | `one:claude-sonnet-5-5` | `one:claude-haiku-5-5` |
|---|---|---|---|
| recovery | 16 of 16 (100%) read (0 rolled, 16 offered); 0 another move, 0 nothing | 16 of 16 (100%) read (0 rolled, 16 offered); 0 another move, 0 nothing | 16 of 16 (100%) read (0 rolled, 16 offered); 0 another move, 0 nothing |
| connection | 20 of 20 (100%) read (9 rolled, 11 offered); 0 another move, 0 nothing | 18 of 20 (90%) read (7 rolled, 11 offered); 0 another move, 2 nothing | 10 of 20 (50%) read (0 rolled, 10 offered); 10 another move, 0 nothing |
| vow | 16 of 18 (89%) read (6 rolled, 10 offered); 2 another move, 0 nothing | 14 of 18 (78%) read (3 rolled, 11 offered); 1 another move, 3 nothing | 13 of 18 (72%) read (0 rolled, 13 offered); 5 another move, 0 nothing |
| control | 33 of 40 (83%) narrated; 4 offered a move, 3 rolled | 38 of 40 (95%) narrated; 2 offered a move, 0 rolled | 19 of 40 (48%) narrated; 16 offered a move, 5 rolled |
| action | 18 of 20 (90%) read (15 rolled, 3 offered); 2 another move, 0 nothing | 18 of 20 (90%) read (14 rolled, 4 offered); 0 another move, 2 nothing | 14 of 20 (70%) read (10 rolled, 4 offered); 4 another move, 2 nothing |
| travel | 16 of 16 (100%) read (11 rolled, 5 offered); 0 another move, 0 nothing | 16 of 16 (100%) read (16 rolled, 0 offered); 0 another move, 0 nothing | 16 of 16 (100%) read (16 rolled, 0 offered); 0 another move, 0 nothing |
| named move | 4 of 4 (100%) read (4 rolled, 0 offered); 0 another move, 0 nothing | 2 of 4 (50%) read (2 rolled, 0 offered); 0 another move, 0 nothing | 1 of 4 (25%) read (1 rolled, 0 offered); 0 another move, 0 nothing |
| fight entry | 6 of 6 (100%) read (6 rolled, 0 offered); 0 another move, 0 nothing | 6 of 6 (100%) read (6 rolled, 0 offered); 0 another move, 0 nothing | 6 of 6 (100%) read (6 rolled, 0 offered); 0 another move, 0 nothing |
| fight | 12 of 12 (100%) read (12 rolled, 0 offered); 0 another move, 0 nothing | 12 of 12 (100%) read (12 rolled, 0 offered); 0 another move, 0 nothing | 12 of 12 (100%) read (12 rolled, 0 offered); 0 another move, 0 nothing |

## Where the arms differ

**`progress-3`** — vow · wants Reach a Milestone · context bleakhold-after-fight

> The cutter that jumped me is scrap, and she was one of theirs. That is one raider fewer on the lanes, and a long stride toward finding who sends them.

- `two:claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Reach a Milestone (investigation, 0.82) — “The player states a concrete achievement (a raider cutter destroyed, tying it to the raiders) as a stride toward the open vow 'Find who is raiding the Cinder Expanse lanes', which only reach_a_milestone marks; no action is attempted, so it is offered rather than rolled.”
- `one:claude-sonnet-5-5` — **nothing** (its repeats: offered, nothing): the line reader narrates it, with no move offered (investigation) — “The player recounts the cutter's destruction and its worth to the vow, but only claims headway in words; no new obstacle overcome or insight is shown, so no move is made yet.” [no move]
- `one:claude-haiku-5-5` — **offered**: the line reader narrates it and offers Reach a Milestone (investigation) — “The cutter's destruction is shown in the scene and the line claims it as headway on the raider vow; the milestone marks progress with no roll.” [a move with no roll is offered, not rolled]

**`none-damage-board`** — control · wants no move · context bleakhold-after-fight

> I look over the damage board again. What did that last volley hit?

_A question about what is already established, beside a ship that wants repair._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (investigation, 0.90) — “Re-reading the damage board and asking what was hit is observation and a question to the narrator, with no character action or stakes, and no repair is being attempted.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (investigation) — “Rereading the damage board and asking the narrator what the volley hit is observation and a question to the narrator, with nothing at risk.” [no move]
- `one:claude-haiku-5-5` — **a move rolled**: the line reader rolls Gather Information (investigation, risk plain) — “Examining the damage board for what the volley hit is searching for clues about the ship's condition.” [dial 6 (investigation), risk plain]

**`none-ask-shaken`** — control · wants no move · context bleakhold-after-fight

> I raise Tamsin on the comm and ask whether anyone at the Spire has heard from the Lark's Tithe.

_A plain question to her connection, with spirit 3 of 5: Hearten's "socialize" must not catch talk when there is something to recover._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.80) — “Opening a comm channel to a connection and asking a plain question is conversation with nothing at risk, not a move.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (social) — “Raising a connection on the comm and asking a question is talk with nothing at risk; it presses no one and tests no bond.” [no move]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Make a Connection (social, risk plain) — “Asking Tamsin for news is talk to an existing connection, not a relationship move; a call with no stakes is narration.” [dial 5 (social), risk plain]

**`connect-1`** — connection · wants Make a Connection · context spire-stall

> Idris Vane has watched these docks longer than anyone. I sit down beside his barrel, give him my name, and set about making a friend of him. I want him on my side for as long as I fly out of Hollow Spire.

- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Make a Connection (social, 0.90) — “The player sets about forging a lasting bond with a new NPC (Idris Vane, not yet a connection), an explicit commitment to establish a relationship with stakes, which is make_a_connection.”; the move reader makes it Make a Connection — “Mira introduces herself to Idris Vane, who is not yet a connection, and explicitly sets out to win him as a lasting ally. That is establishing a relationship with an NPC, which is Make a Connection rolled +heart. The pacing read fits; no unexpected reading is warranted here.”
- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Make a Connection (social, risk plain) — “Mira seeks out a new relationship with Idris Vane, who is not yet her connection; make_a_connection triggers on searching out a new relationship.” [dial 5 (social), risk plain]
- `one:claude-haiku-5-5` — **offered**: the line reader narrates it and offers Make a Connection (social, risk plain) — “Seeking a new relationship with Idris Vane, who is not yet Mira's connection, rolls make_a_connection with heart.” [dial 5 (social), risk plain]

**`develop-2`** — connection · wants Develop Your Relationship · context spire-stall · from run 2 a60, without its move name

> I offer to watch Tamsin's counter for an hour while she rests.

- `two:claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Develop Your Relationship (social, 0.80) — “Offering to cover Tamsin's stall for an hour is a costly favour to a connection, which only develop_your_relationship marks.”
- `one:claude-sonnet-5-5` — **nothing**: the line reader narrates it, with no move offered (social) — “Offering to mind the counter for an hour is a kind gesture with nothing at risk; it triggers no move on its own.” [no move]
- `one:claude-haiku-5-5` — **another move offered**: the line reader narrates it and offers Compel (social, risk slight) — “Offering to watch the stall is a bargain offer to Tamsin, a social move of persuading someone with a proposal, rolled with heart.” [dial 5 (social), risk slight]

**`develop-4`** — connection · wants Develop Your Relationship · context spire-stall

> Tamsin's lamp has been guttering all week for want of a power cell. I pull the spare from my own pack and fit it for her; I can go without until Bleakhold.

_Bringing her what she needs, at a cost to the giver — with nothing at risk and nobody pressed._

- `two:claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Develop Your Relationship (social, 0.80) — “Mira gives a connection something of her own at a cost to herself (going without), a deed that deepens the relationship and only develop_your_relationship marks.”
- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Develop Your Relationship (social) — “Mira gives Tamsin something of worth at her own cost, a power cell she will go without, which reinforces their relationship.” [a move with no roll is offered, not rolled]
- `one:claude-haiku-5-5` — **another move offered**: the line reader narrates it and offers Check Your Gear (social, risk plain) — “Mira gives up her own spare power cell to Tamsin — a gift of worth to a connection, which fits develop_your_relationship's deed 'giving them something of worth'.” [dial 5 (social), risk plain]

**`develop-5`** — connection · wants Develop Your Relationship · context spire-stall

> I set the Cinder Wren's salvaged navigation core on Tamsin's counter. It will fetch more than her stall takes in a month, and I tell her it is hers, with no cut to me.

_Something of worth given — one of the game's own deeds for Develop Your Relationship — to a connection the sheet already holds; trust-1 and trust-2 ask the same connection for a tie, and want none (issue #383 #1 c)._

- `two:claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Develop Your Relationship (social, 0.82) — “Mira gives her connection Tamsin a costly gift of real value, which deepens the relationship and is marked only by develop_your_relationship; nothing is at risk so it is offered rather than forced.”
- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Develop Your Relationship (social) — “Giving Tamsin something of great worth, a valuable salvaged core with no cut, is a listed way to reinforce a relationship with a connection.” [a move with no roll is offered, not rolled]
- `one:claude-haiku-5-5` — **another move offered**: the line reader narrates it and offers Make a Connection (social, risk plain) — “Giving Tamsin a valuable item freely strengthens an existing bond, but a deed of worth to an existing connection is develop_your_relationship, which marks progress with no roll.” [dial 5 (social), risk plain]

**`test-1`** — connection · wants Test Your Relationship · context spire-stall

> I tell Tamsin straight that I am breaking my word to her: I promised to be back before the next tide of cargo, and I won't be.

- `two:claude-sonnet-5-5` — **offered** (its repeats: rolled, offered): the pacing reader narrates it and offers Test Your Relationship (social, 0.70) — “Mira tells her connection Tamsin she is breaking a promise, which strains the relationship; at social dial 5 this is a borderline case, so the move is offered rather than forced.”
- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Test Your Relationship (social, risk high) — “Mira openly declares she is breaking a promise to Tamsin, a betrayal that puts their relationship to the test; Tamsin is her existing connection.” [dial 5 (social), risk high]
- `one:claude-haiku-5-5` — **another move offered** (its repeats: offered, another move offered): the line reader narrates it and offers Lose Momentum (social) — “Mira admits she is breaking a promise, which is a delay or setback to her standing with Tamsin, not an attempt that risks anything.” [a move with no roll is offered, not rolled]

**`test-2`** — connection · wants Test Your Relationship · context spire-stall

> Tamsin wants the name of the trader who talked to me. I refuse her, because I gave him my word, and I hold to it even when I see what it costs me with her.

- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Test Your Relationship (social, 0.80) — “Mira refuses her connection Tamsin to keep her word, stating the relational cost outright, so the bond is being tested; this is a clear commitment at social dial 5, with the relationship at stake.”; the move reader makes it Test Your Relationship — “Mira refuses Tamsin the informant's name to keep her word, openly accepting the damage to their bond. The connection is strained by a conflict of loyalties, which is exactly what Test Your Relationship covers (+heart). Tamsin is not being pressed by Mira, so Compel does not fit, and the refusal is a deliberate, costly stand rather than plain conversation.”
- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Test Your Relationship (social, risk high) — “Mira refuses her connection's request to keep her word to another, knowingly straining the relationship — a test through conflict.” [dial 5 (social), risk high]
- `one:claude-haiku-5-5` — **another move offered** (its repeats: another move offered, offered): the line reader narrates it and offers Compel (social, risk plain) — “Tamsin presses Mira for a name; Mira refuses, which is a refusal to be compelled and makes no move by the speaker.” [dial 5 (social), risk plain]

**`swear-1`** — vow · wants Swear an Iron Vow · context spire-stall

> I draw my knife, lay my palm flat on the blade, and tell Tamsin I will bring Joss home.

- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Swear an Iron Vow (social, 0.90) — “The ritual blade-and-palm oath to a connection, promising to bring Joss home, is a solemn vow with stakes, so Swear an Iron Vow.”; the move reader makes it Swear an Iron Vow — “Mira ritually swears, blade and palm, to bring Tamsin's nephew Joss home. This is a solemn, binding promise to take on a new quest rather than a step toward the existing raider vow, so Swear an Iron Vow with +heart. Neither Make a Connection nor Develop Your Relationship fits better, since the oath is the commitment itself.”
- `one:claude-sonnet-5-5` — **offered** (its repeats: offered, rolled): the line reader narrates it and offers Swear an Iron Vow (social, risk plain) — “Swearing on the blade to bring Joss home is swearing upon iron to complete a quest.” [dial 5 (social), risk plain]
- `one:claude-haiku-5-5` — **offered**: the line reader narrates it and offers Swear an Iron Vow (social, risk plain) — “Laying a palm on the blade and pledging to bring Joss home is swearing an iron vow to a quest, rolled on heart.” [dial 5 (social), risk plain]

**`swear-2`** — vow · wants Swear an Iron Vow · context spire-stall

> I give Tamsin my word, on iron and on my ship: I will find the Lark's Tithe and whoever took her.

- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Swear an Iron Vow (social, 0.93) — “The player explicitly swears a solemn oath to find the Lark's Tithe and whoever took her, a new quest commitment with stakes, which is Swear an Iron Vow.”; the move reader makes it Swear an Iron Vow — “Mira solemnly pledges, on iron and on her ship, to find the Lark's Tithe and whoever took her. This is a new quest commitment made to Tamsin, distinct from the existing Cinder Expanse raiders vow, so it is Swear an Iron Vow rolled +heart.”
- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Swear an Iron Vow (social, risk plain) — “Mira swears upon iron to complete a quest, a new vow to find the Lark's Tithe and whoever took her.” [dial 5 (social), risk plain]
- `one:claude-haiku-5-5` — **offered**: the line reader narrates it and offers Swear an Iron Vow (social, risk plain) — “Swearing upon iron to complete a quest, with a new vow written and ranked, is the Swear an Iron Vow trigger.” [dial 5 (social), risk plain]

**`gather-1`** — action · wants Gather Information · context spire-stall · from run 2 a8

> I work the docks asking traders who saw the raiders last, pressing hard even though it may cost me Tamsin's trust and draw the wrong eyes.

- `two:claude-sonnet-5-5` — **another move rolled**: the pacing reader calls it a move, naming Gather Information (investigation, 0.82) — “The player actively presses traders for information about the raiders with stated risk (Tamsin's trust, attention); at investigation dial 6 this is clear intent with stakes, so a gather_information roll applies.”; the move reader makes it Compel (a misread on purpose, it says) — “The pacing read points to gather_information, but the line is about pressing reluctant traders who avoid eye contact, hard enough that it may cost Tamsin's trust. That is pressure on unwilling people to give something up, which is Compel. Leaning on them with an implied threat of force makes iron the fitting stat. This is a slightly unexpected but plausible reading of the same scene.”
- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Gather Information (investigation, risk plain) — “Mira questions dock traders to learn who last saw the raiders; this is an investigation, though pressing hard could read as compel.” [dial 6 (investigation), risk plain]
- `one:claude-haiku-5-5` — **another move rolled**: the line reader rolls Compel (social, risk high) — “Pressing traders for answers they are reluctant to give is compelling them, with the cost of Tamsin's trust at stake.” [dial 5 (social), risk high]

**`compel-1`** — action · wants Compel · context spire-stall

> I put a week's water chits on Idris Vane's counter and ask him to tell me which trader has been selling the freighter schedules.

- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Compel (social, 0.80) — “Mira offers payment to press a reluctant NPC (Idris, who pretends not to listen) for information, which is a compel with stakes; Idris is not one of her connections, so there is no connection lean, but the social dial (5) is met by clear intent.”; the move reader makes it Compel — “Mira lays down payment and presses a wary, pretend-deaf Idris to name the trader selling freighter schedules. That is persuading a reluctant NPC to give something up, so it is Compel. Offering water chits is an appeal to his self-interest and goodwill rather than a threat or a lie, so heart fits best. Idris is not a connection.”
- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Compel (social, risk plain) — “Mira offers Idris payment to make him give up information he is reluctant to share, which is an offer to persuade, i.e. barter.” [dial 5 (social), risk plain]
- `one:claude-haiku-5-5` — **offered**: the line reader narrates it and offers Compel (social, risk plain) — “Mira offers Idris water chits to get him to reveal what he knows, a bargain pressing him to give up information.” [dial 5 (social), risk plain]

**`none-which-ship`** — control · wants no move · context spire-stall

> I ask Tamsin to tell me again which of the three freighters Joss crewed.

_A question about what is already established._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.90) — “A plain clarifying question to a connection about information she just gave; nothing is pressed, risked or deepened, so it stays narration.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (social) — “Asking a connection to repeat what she already said is plain talk; nothing is pressed, tested or at risk, so no move's trigger is met.” [no move]
- `one:claude-haiku-5-5` — **a move rolled**: the line reader rolls Gather Information (investigation, risk plain) — “Asking Tamsin to recount which freighter Joss crewed is a question seeking information from a known connection, with no pressure or stakes.” [dial 6 (investigation), risk plain]

**`trust-1`** — control · wants no move · context spire-stall · from run 4 a5

> I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, and who can count on me in turn. Will you be that?

_Asking a known connection for trust is talk: none of the game's seven deeds for Develop Your Relationship, and no Make a Connection for someone already one. The fourth live run's readers read it Develop, no roll, at a5 (issue #383 #1 c)._

- `two:claude-sonnet-5-5` — **a move rolled**: the pacing reader calls it a move, naming Make a Connection (social, 0.70) — “Mira asks Tamsin, an existing connection, to commit to a lasting mutual bond, a stakes-bearing relationship line that calls for forging a bond, at social dial 5.”; the move reader makes it Forge a Bond — “Mira asks an existing connection, Tamsin, to commit to a lasting mutual bond ('someone I can come back to, who can count on me in turn'). The connection is already established, so make_a_connection does not apply; this is forging a bond. Her relationship track is only 4 of 10, so it is an early, long-odds attempt, but the line is plainly a request to cement the relationship.”
- `one:claude-sonnet-5-5` — **a move offered** (its repeats: a move offered, narrated): the line reader narrates it and offers Develop Your Relationship (social) — “Mira asks Tamsin, an existing connection, for a deeper mutual bond; that reinforces the relationship, not a new connection. Develop Your Relationship's deeds fit loosely.” [a move with no roll is offered, not rolled]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Make a Connection (social, risk plain) — “Tamsin is already Mira's connection, so this is developing that relationship: asking her to be a reliable contact in turn.” [dial 5 (social), risk plain]

**`trust-2`** — control · wants no move · context spire-stall · from run 4 a7, without its first sentence and its last question

> I'm not buying anything, Tamsin. I'm asking you to be my friend on this dock, and I'll be yours.

_The same plea in other words; the run's move reader took it for a costly gesture of commitment (a7)._

- `two:claude-sonnet-5-5` — **a move rolled** (its repeats: a move offered, a move rolled): the pacing reader calls it a move, naming Develop Your Relationship (social, 0.80) — “Mira offers Tamsin, one of her connections, mutual friendship on the dock — a plain bid to deepen the relationship, which only develop_your_relationship marks; social dial 5 and the relationship at stake support MOVE.”; the move reader makes it Develop Your Relationship — “Mira makes a plain, sincere bid to deepen her bond with Tamsin Okoro, an existing connection (relationship 4 of 10, not yet bonded). That is develop_your_relationship, which for an un-bonded connection is no roll and simply marks progress. The pacing read fits. The line is neither a compel (she is offering friendship, not pressing for something reluctant) nor a make_a_connection (the connection already exists).”
- `one:claude-sonnet-5-5` — **a move offered** (its repeats: a move offered, narrated): the line reader narrates it and offers Develop Your Relationship (social) — “Mira offers Tamsin mutual friendship and standing on the dock, reinforcing an existing connection; no stakes or reluctance are pressed, so it is no roll.” [a move with no roll is offered, not rolled]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Make a Connection (social, risk slight) — “Asking Tamsin to be a friend and offering the same seeks a new relationship, but Tamsin is already Mira's connection, so this reads as developing her relationship.” [dial 5 (social), risk slight]

**`develop-1`** — control · wants no move · context aboard-at-spire · from run 2 a59, without its move name

> I raise Tamsin on the comm and trade news with her, asking how the docks have been.

_News traded with a connection: talk, by the rules and by the pacing reader's (small talk, news traded and plain questions stay narration). Run 2's charter took it for Develop Your Relationship and so did this list at first; the first readers' run narrated it four readings of four on both models. Its control beside develop-2, -3 and -4._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.88) — “Opening a comm channel and trading news with a connection is plain conversation with nothing pressed or at stake, so no move is warranted.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (social) — “Raising an existing connection and trading news is ordinary talk with nothing at risk, pressing no one and testing no relationship.” [no move]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Make a Connection (social, risk plain) — “Trading news and asking after the docks is talk with an existing connection, not a deed any trigger names; it is no move.” [dial 5 (social), risk plain]

**`course-1`** — travel · wants Set a Course · context aboard-at-spire · from run 2 a20

> I plot the course and take the Kobayashi IV to Bleakhold Station.

- `two:claude-sonnet-5-5` — **offered** (its repeats: rolled, offered): the pacing reader narrates it and offers Set a Course (exploration, 0.80) — “Bleakhold Station is charted and reached by a known marked lane, but the raiders keep hitting that run, so the journey carries stakes; at exploration dial 6 the commitment is clear but the hazard is only implied, so offer set_a_course.”
- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Set a Course (exploration, risk plain) — “Flying a known marked lane to Bleakhold Station, a charted place, is following a known route through perilous space.” [dial 6 (exploration), risk plain]
- `one:claude-haiku-5-5` — **rolled**: the line reader rolls Set a Course (exploration, risk plain) — “Bleakhold Station is a charted place reached by a known route, so following it is set_a_course with supply as the stat.” [dial 6 (exploration), risk plain]

**`course-2`** — travel · wants Set a Course · context aboard-at-spire

> I cast off from the Spire and fly the marked lane out to Bleakhold Station.

- `two:claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Set a Course (exploration, 0.72) — “Travel along a marked lane to a charted place (Bleakhold) with a known raider threat; exploration dial 6 but commitment is routine travel, so offer set_a_course rather than force a roll.”
- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Set a Course (exploration, risk plain) — “Flying a known marked lane to the charted Bleakhold Station is following a known route through perilous space, which is Set a Course.” [dial 6 (exploration), risk plain]
- `one:claude-haiku-5-5` — **rolled**: the line reader rolls Set a Course (exploration, risk plain) — “Following a known, marked route to a charted place, Bleakhold Station, is set_a_course.” [dial 6 (exploration), risk plain]

**`course-3`** — travel · wants Set a Course · context aboard-at-spire

> Vigil Reach is closer. I take the Kobayashi IV there along the old charted route to ask after the freighters.

- `two:claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Set a Course (exploration, 0.70) — “Departing along a known charted route to the charted Vigil Reach is travel intent at exploration dial 6, but no hazard or time pressure is established, so the move is offered rather than forced.”
- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Set a Course (exploration, risk plain) — “Vigil Reach is a charted place and she takes the old charted route there: following a known route through perilous space is Set a Course.” [dial 6 (exploration), risk plain]
- `one:claude-haiku-5-5` — **rolled**: the line reader rolls Set a Course (exploration, risk plain) — “Following a known charted route to Vigil Reach, a charted place, is set a course, not an expedition.” [dial 6 (exploration), risk plain]

**`named-after-moves`** — named move · wants Set a Course, rolled · context aboard-at-spire · from run 4 a33

> I set a course for Bleakhold Station.

_A line that names its move asks for it, at any dial (the pacing reader's own rule) — read after four moves of the last five, as the fourth live run's last resort was, which was offered for the density rather than rolled (issue #383 #17)._

- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Set a Course (exploration, 0.80) — “Player commits to travel to charted Bleakhold Station along the known, marked lane that raiders keep hitting; exploration dial 6 with clear intent and a stated hazard, so set_a_course.”; the move reader makes it Set a Course — “Bleakhold Station is a charted, known destination along a marked lane, so this is a known-route journey (set_a_course, roll +supply), not an expedition into unknown space. The coordinates for the debris drift are the unnamed destination, but the player named Bleakhold.”
- `one:claude-sonnet-5-5` — **offered, not rolled**: the line reader narrates it and offers Set a Course (exploration, risk plain) — “Bleakhold Station is a charted place reached along the known marked lane, so this follows a known route through perilous space.” [dial 6 (exploration), risk plain; a dense run of rolls: offered, not rolled]
- `one:claude-haiku-5-5` — **offered, not rolled**: the line reader narrates it and offers Set a Course (exploration, risk plain) — “Bleakhold Station is a charted place, so following the known marked lane there is set_a_course, a progress-free roll on supply.” [dial 6 (exploration), risk plain; a dense run of rolls: offered, not rolled]

**`advantage-1`** — action · wants Secure an Advantage or Gather Information · context aboard-at-spire

> Before I cast off I spend an hour with the charts and the comm chatter, working out where a cutter would lie in wait along the Bleakhold run.

_Preparing for the run is Secure an Advantage; studying for an answer is Gather Information. Either is right._

- `two:claude-sonnet-5-5` — **offered** (its repeats: offered, rolled): the pacing reader narrates it and offers Gather Information (investigation, 0.70) — “Studying charts and comm chatter to deduce an ambush spot is information-gathering with intent, but the investigation dial is 6 and no stakes or opposition are established, so offering the move fits better than forcing a roll.”
- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Gather Information (investigation, risk plain) — “Studying charts and comm chatter to deduce where raiders would ambush is research and analysis for clues, which is Gather Information.” [dial 6 (investigation), risk plain]
- `one:claude-haiku-5-5` — **rolled**: the line reader rolls Gather Information (investigation, risk plain) — “Searching charts and comm chatter to deduce where raiders would wait is searching for clues and analysing evidence.” [dial 6 (investigation), risk plain]

**`gear-1`** — action · wants Check Your Gear · context aboard-at-spire

> I dig through the lockers behind my seat for a spare signal flare. I will want one out in that drift.

- `two:claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Check Your Gear (downtime, 0.60) — “Searching the lockers for a flare in safe dock with no hazard at a low downtime dial is mostly narration, but whether the item is on hand is uncertain, so Check Your Gear is offered.”
- `one:claude-sonnet-5-5` — **nothing**: the line reader narrates it, with no move offered (downtime, risk slight) — “Searching the lockers for a specific helpful item, a spare signal flare, is checking to see if she has it.” [dial 1 (downtime), risk slight]
- `one:claude-haiku-5-5` — **nothing**: the line reader narrates it, with no move offered (downtime, risk plain) — “Digging for a specific helpful item (a spare flare) is checking gear, rolled with supply.” [dial 1 (downtime), risk plain]

**`none-reread`** — control · wants no move · context aboard-at-spire

> I read Tamsin's message again. How many days out did she say Bleakhold was?

_A question about what is already established._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.93) — “Rereading a message and asking a factual question already answered in the scene is plain conversation/observation with no stakes, no risk, and no step toward a vow.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (investigation) — “Rereading a message and asking how many days out Bleakhold is a question to the narrator with nothing at risk; it meets no move trigger.” [no move]
- `one:claude-haiku-5-5` — **a move rolled** (its repeats: narrated, a move rolled): the line reader rolls Gather Information (investigation, risk plain) — “Mira re-reads Tamsin's message to pull a specific detail from it, which is searching for a clue in the record already on the comm panel.” [dial 6 (investigation), risk plain]

**`none-hearten-whole`** — control · wants no move · context aboard-at-spire

> I put the kettle on and sit a while with a hot cup, watching the dock lamps go by.

_A peaceful moment with spirit 5 of 5: hearten-1's cup of tea, with nothing for it to mend._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (downtime, 0.95) — “A quiet, safe moment of rest with no stakes at downtime dial 1; Spirit is full and Mira is not shaken, so there is nothing for hearten to recover.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (downtime) — “Making tea and watching dock lamps in safety puts nothing at risk, and Mira's spirit is full so there is nothing for Hearten to recover.” [no move]
- `one:claude-haiku-5-5` — **a move offered** (its repeats: a move offered, narrated): the line reader narrates it and offers Sojourn (downtime, risk plain) — “A quiet cup of tea in the cockpit is no move: nothing is at risk and no recovery is being sought in a community.” [dial 1 (downtime), risk plain]

**`bond-1`** — connection · wants Forge a Bond · context spire-reckoning

> Tamsin, will you stand with me for good, whatever comes?

- `two:claude-sonnet-5-5` — **offered** (its repeats: rolled, offered): the pacing reader narrates it and offers Forge a Bond (social, 0.70) — “A heartfelt ask for lasting commitment from a connection whose relationship track is full with no bond yet; at social dial 5 this is a borderline offer of forging a bond, not a forced roll.”
- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Forge a Bond (social, risk high) — “Her relationship track is full; Mira asks Tamsin to stand with her for good, committing the bond that Forge a Bond makes.” [dial 5 (social), risk high]
- `one:claude-haiku-5-5` — **another move offered**: the line reader narrates it and offers Develop Your Relationship (social) — “Asking Tamsin to stand with her for good is seeking a bond, but the scene shows a relationship she has already tested by standing with her against hardship; develop_your_relationship fits the deed.” [a move with no roll is offered, not rolled]

**`bond-2`** — connection · wants Forge a Bond · context spire-reckoning

> I cover Tamsin's hand with mine on the ledger and tell her she is kin to me now. Not a broker, not a contact: kin. And I mean it to hold.

- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Forge a Bond (social, 0.80) — “Tamsin's relationship track is full (10 of 10) with no bond forged, and Mira explicitly declares kinship meant to hold, a clear bond-forging attempt rolled at social dial 5.”; the move reader makes it Forge a Bond — “Tamsin's relationship track is full (10 of 10) with no bond forged, and Mira explicitly declares her kin, a commitment meant to endure. This is a clear Forge a Bond, a progress move rolled against the connection's progress.”
- `one:claude-sonnet-5-5` — **offered** (its repeats: offered, rolled): the line reader narrates it and offers Forge a Bond (social, risk plain) — “Mira declares Tamsin kin, no longer a contact, and means it to hold: the relationship is full and ready to evolve into a bond.” [dial 5 (social), risk plain]
- `one:claude-haiku-5-5` — **offered**: the line reader narrates it and offers Forge a Bond (social, risk plain) — “Tamsin's relationship is full and ready, and Mira seeks to evolve it into kinship, which is forge_a_bond's progress roll.” [dial 5 (social), risk plain]

**`done-2`** — vow · wants Fulfill Your Vow · context spire-reckoning

> It is done. I set out to learn who was raiding the Cinder Expanse lanes, and now I know, with proof. I say so aloud, to Tamsin and the warden both, and call the work finished.

- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Fulfill Your Vow (investigation, 0.85) — “The player states outright that the vow to find who is raiding the Cinder Expanse lanes is done and calls the work finished, which is fulfill_your_vow.”; the move reader makes it Fulfill Your Vow — “Mira states outright that the vow to learn who is raiding the Cinder Expanse lanes is complete, citing the sealed ledger as proof, and declares the work finished before Tamsin and the warden. This is a progress move against the vow's track (8 of 10 boxes), not a stat roll. The full relationship track with Tamsin makes forge_a_bond a tempting neighbouring reading, but the line is explicitly about closing the vow, not cementing the bond.”
- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Fulfill Your Vow (investigation, risk high) — “The player declares the quest finished, and the scene shows it complete: sealed proof names Corvin Hale as the raider. That is the Fulfill Your Vow trigger.” [dial 6 (investigation), risk high]
- `one:claude-haiku-5-5` — **another move offered** (its repeats: another move offered, offered): the line reader narrates it and offers Reach a Milestone (social) — “The scene shows the raider's identity and sealed proof obtained, but the vow's completion must be fulfilled, not merely declared.” [a move with no roll is offered, not rolled]

**`progress-1`** — vow · wants Reach a Milestone · context bleakhold-clerk · from run 2 a71, without its rules word

> I now have proof the raids are fed by dock clerks selling cargo routes.

- `two:claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Reach a Milestone (investigation, 0.85) — “The player states a concrete achievement (proof the raids are fed by clerks selling routes) that is a real step toward the open vow, which only reach_a_milestone marks; it attempts nothing with stakes, so it is offered rather than rolled.”
- `one:claude-sonnet-5-5` — **nothing**: the line reader narrates it, with no move offered (investigation) — “The line is a statement of a conclusion with nothing attempted at risk; the scene shows only one clerk's admission, so the vow's milestone is claimed, not yet earned.” [no move]
- `one:claude-haiku-5-5` — **offered**: the line reader narrates it and offers Reach a Milestone (investigation) — “The scene shows Roe admitting the leak and the second ledger, so the vow's insight milestone is earned; the line claims it as proof.” [a move with no roll is offered, not rolled]

**`claim-supported`** — vow · wants Reach a Milestone · context bleakhold-clerk

> Roe's own words are the proof I came for: the schedules leave this office for the man at the cargo lock, and the raiders strike at the times on them.

_A proof claimed, in the claim's own shape, that the scene bears out: the clerk has just said it. claim-refuted makes the same claim where the scene denies it (issue #383 #3)._

- `two:claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Reach a Milestone (investigation, 0.85) — “The line states proof found toward the open vow (who is raiding the lanes) with no new action or stakes, so a milestone is offered rather than a roll.”
- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Reach a Milestone (investigation) — “Roe's admission, already shown in the scene, is meaningful insight into the raiders' source, which the line names as the proof sought.” [a move with no roll is offered, not rolled]
- `one:claude-haiku-5-5` — **another move rolled**: the line reader rolls Gather Information (investigation, risk plain) — “Mira is drawing conclusions from Roe's admission and the matching schedule times, which is analysing evidence for the vow, not a new roll with stakes.” [dial 6 (investigation), risk plain]

**`compel-2`** — action · wants Compel · context bleakhold-clerk

> I tell Roe he can give me the name of the man at the cargo lock, or explain that second ledger to the station's auditors.

- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Compel (social, 0.88) — “Mira threatens Roe with exposure to the auditors to force him to give up the name of the man at the cargo lock, a clear compel with stakes at a social dial of 5, and the open scene-challenge rule does not apply here.”; the move reader makes it Compel — “Mira presses Roe to give up the name of the man at the cargo lock, backing it with a threat of exposure to the auditors. That is a textbook Compel. The stat reads as coercion and intimidation (iron), not charm or deception, since the leverage is a blunt threat over a frightened man who is plainly hiding something.”
- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Compel (social, risk plain) — “Mira presses a reluctant Roe to give up a name by threatening to expose his second ledger to the auditors, which is a threat to compel.” [dial 5 (social), risk plain]
- `one:claude-haiku-5-5` — **offered**: the line reader narrates it and offers Compel (social, risk plain) — “Mira presses Roe to hand over the collector's name under threat of exposure to the auditors, which is compel with a lie-or-threat edge via shadow or iron.” [dial 5 (social), risk plain]

**`none-say-again`** — control · wants no move · context bleakhold-clerk

> I ask Roe to say again how often the man comes to the cargo lock.

_A question about what he has already said._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.88) — “A plain clarifying question to a non-connection NPC who already volunteered the answer; no pressure or stakes, so it is just conversation.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (social) — “Asking Roe to repeat how often the man comes is plain talk; it presses no one and puts nothing at risk.” [no move]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Compel (social, risk plain) — “Pressing Roe to repeat a detail he is reluctant to give is persuasion, which the compel trigger covers with +heart.” [dial 5 (social), risk plain]

**`advantage-2`** — action · wants Secure an Advantage · context ashfall-drift

> Before I commit to that gap I hold position and time the tumble of the debris, looking for the rhythm in it.

- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Secure an Advantage (exploration, 0.82) — “Player actively prepares by timing the debris before a hazardous crossing, an action with intent and stakes at exploration dial 6, so secure_an_advantage; no scene challenge is open.”; the move reader makes it Secure an Advantage — “Mira holds position to study the tumbling debris and find its rhythm before committing to the gap — careful observation and preparation, which is Secure an Advantage rolled with wits. The pacing read fits; a more literal alternative would be Gather Information, but the intent is bolstering her position ahead of a hazardous crossing.”
- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Secure an Advantage (exploration, risk plain) — “Holding position to study the debris's rhythm before committing is making preparations and assessing the situation, which is Secure an Advantage with wits.” [dial 6 (exploration), risk plain]
- `one:claude-haiku-5-5` — **another move rolled**: the line reader rolls Gather Information (exploration, risk plain) — “Timing the debris's rhythm to find a safe passage is studying the hazard for answers, a search for clues with no roll yet decided.” [dial 6 (exploration), risk plain]

**`none-chart-mark`** — control · wants no move · context ashfall-drift

> I mark the wrecked relay on my own chart and pencil a name beside it: Dead Ear.

_An everyday action with nothing at risk._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (exploration, 0.80) — “Marking and naming a landmark on her own chart is an everyday action with nothing at risk and no vow step, recovery, or relationship change, so it needs no roll.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (exploration) — “Marking a wreck on her own chart and naming it puts nothing at risk and meets no move trigger; it is bookkeeping and narration.” [no move]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Make a Discovery (exploration) — “Naming and charting the wreck is not a move; the line only labels a place, and discoveries come from Explore a Waypoint rolls, not lines.” [a move with no roll is offered, not rolled]

**`named-after-moves-2`** — named move · wants Face Danger, rolled · context ashfall-drift

> I face danger and slip the ship through that gap before it shuts.

_The same after a run of moves, in other words: named, it is rolled._

- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Face Danger (exploration, 0.95) — “Player names Face Danger and describes an immediate-hazard action (threading a closing debris gap), explicit intent at any dial; no scene challenge is open, so the plain move applies.”; the move reader makes it Face Danger — “Mira names Face Danger outright and describes a risky, time-pressured maneuver, flying the Kobayashi IV through a closing gap in the debris wall. Speed and agility is the fit, so edge. No scene challenge is open, so the plain move applies.”
- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Face Danger (exploration, asked, risk high) — “Threading the ship through a closing gap in tumbling debris is attempting something risky; the player names Face Danger, and speed and piloting mean edge.” [the player asked for it]
- `one:claude-haiku-5-5` — **offered, not rolled** (its repeats: offered, not rolled, rolled): the line reader narrates it and offers Face Danger (exploration, risk high) — “Threading the ship through a closing debris gap is attempting something risky, the move's own trigger.” [dial 6 (exploration), risk high; a dense run of rolls: offered, not rolled]

**`claim-refuted`** — control · wants no move · context bleakhold-brig · from run 4 a70

> I tell the pilot: the Cinder Wren is the raider, and I've traced her orders back to the broker who sold the lane schedules. That's the proof I came for.

_A proof claimed that the scene refutes: the pilot has just said her orders came unsigned and that Tamsin sold nothing. The fourth live run offered it Reach a Milestone, and its narration then refuted the claim (issue #383 #3)._

- `two:claude-sonnet-5-5` — **a move offered**: the pacing reader narrates it and offers Reach a Milestone (investigation, 0.80) — “The player states proof found toward the open vow (who is raiding the lanes) with no attempt or stakes, so only reach_a_milestone fits; it is claimed, not rolled.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (investigation) — “Mira asserts a conclusion the scene doesn't show (orders unsigned, Tamsin cleared); a claim of proof is not headway yet, and it asks nothing of the pilot.” [no move]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Compel (social, risk slight) — “Mira presses the pilot with a claim about the broker, trying to get her to confirm a damning story she is reluctant to give.” [dial 5 (social), risk slight]

**`claim-refuted-2`** — control · wants no move · context bleakhold-brig

> So it was Tamsin all along. The pilot as good as told me, and that settles it: I have what I came for.

_The same kind of claim, against the scene: the pilot has said the opposite._

- `two:claude-sonnet-5-5` — **a move offered** (its repeats: narrated, a move offered): the pacing reader narrates it and offers Reach a Milestone (investigation, 0.70) — “Player claims to have gained what they came for from the interrogation, a stated step toward the open vow, which only reach_a_milestone marks; no new action with stakes is attempted.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (investigation) — “The pilot cleared Tamsin Okoro, yet the line is a conclusion and a claim of headway the scene does not show, so no move is made.” [no move]
- `one:claude-haiku-5-5` — **a move offered** (its repeats: a move offered, narrated): the line reader narrates it and offers Reach a Milestone (investigation) — “The pilot's statement that Tamsin sold nothing is the scene's headway, but the player's conclusion contradicts it, so the milestone is read as the earned insight rather than the claimed answer.” [a move with no roll is offered, not rolled]

## Lines no arm read

**`done-1`** — vow · wants Fulfill Your Vow · context spire-reckoning

> I put the sealed ledger in Warden Marr's hands and tell her all of it: Corvin Hale bought the schedules, and Corvin Hale sent the cutters. The lanes' raider has a name now.

- `two:claude-sonnet-5-5` — **another move offered**: the pacing reader narrates it and offers Reach a Milestone (investigation, 0.80) — “Presenting sealed proof that names the raider is a real step toward the open raiding vow, which only reach_a_milestone marks; it attempts nothing at risk, so it is offered rather than rolled.”
- `one:claude-sonnet-5-5` — **another move offered** (its repeats: offered, another move offered): the line reader narrates it and offers Reach a Milestone (investigation) — “The scene already shows the insight gained: Corvin Hale named by sealed proof, and the line delivers it, marking headway on the vow.” [a move with no roll is offered, not rolled]
- `one:claude-haiku-5-5` — **another move offered**: the line reader narrates it and offers Reach a Milestone (social) — “The scene shows the raider's identity proven and handed over, a deed that earns headway on the Cinder Expanse vow.” [a move with no roll is offered, not rolled]

## Controls read as a move

**`none-damage-board`** — control · wants no move · context bleakhold-after-fight

> I look over the damage board again. What did that last volley hit?

_A question about what is already established, beside a ship that wants repair._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (investigation, 0.90) — “Re-reading the damage board and asking what was hit is observation and a question to the narrator, with no character action or stakes, and no repair is being attempted.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (investigation) — “Rereading the damage board and asking the narrator what the volley hit is observation and a question to the narrator, with nothing at risk.” [no move]
- `one:claude-haiku-5-5` — **a move rolled**: the line reader rolls Gather Information (investigation, risk plain) — “Examining the damage board for what the volley hit is searching for clues about the ship's condition.” [dial 6 (investigation), risk plain]

**`none-ask-shaken`** — control · wants no move · context bleakhold-after-fight

> I raise Tamsin on the comm and ask whether anyone at the Spire has heard from the Lark's Tithe.

_A plain question to her connection, with spirit 3 of 5: Hearten's "socialize" must not catch talk when there is something to recover._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.80) — “Opening a comm channel to a connection and asking a plain question is conversation with nothing at risk, not a move.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (social) — “Raising a connection on the comm and asking a question is talk with nothing at risk; it presses no one and tests no bond.” [no move]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Make a Connection (social, risk plain) — “Asking Tamsin for news is talk to an existing connection, not a relationship move; a call with no stakes is narration.” [dial 5 (social), risk plain]

**`none-which-ship`** — control · wants no move · context spire-stall

> I ask Tamsin to tell me again which of the three freighters Joss crewed.

_A question about what is already established._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.90) — “A plain clarifying question to a connection about information she just gave; nothing is pressed, risked or deepened, so it stays narration.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (social) — “Asking a connection to repeat what she already said is plain talk; nothing is pressed, tested or at risk, so no move's trigger is met.” [no move]
- `one:claude-haiku-5-5` — **a move rolled**: the line reader rolls Gather Information (investigation, risk plain) — “Asking Tamsin to recount which freighter Joss crewed is a question seeking information from a known connection, with no pressure or stakes.” [dial 6 (investigation), risk plain]

**`trust-1`** — control · wants no move · context spire-stall · from run 4 a5

> I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, and who can count on me in turn. Will you be that?

_Asking a known connection for trust is talk: none of the game's seven deeds for Develop Your Relationship, and no Make a Connection for someone already one. The fourth live run's readers read it Develop, no roll, at a5 (issue #383 #1 c)._

- `two:claude-sonnet-5-5` — **a move rolled**: the pacing reader calls it a move, naming Make a Connection (social, 0.70) — “Mira asks Tamsin, an existing connection, to commit to a lasting mutual bond, a stakes-bearing relationship line that calls for forging a bond, at social dial 5.”; the move reader makes it Forge a Bond — “Mira asks an existing connection, Tamsin, to commit to a lasting mutual bond ('someone I can come back to, who can count on me in turn'). The connection is already established, so make_a_connection does not apply; this is forging a bond. Her relationship track is only 4 of 10, so it is an early, long-odds attempt, but the line is plainly a request to cement the relationship.”
- `one:claude-sonnet-5-5` — **a move offered** (its repeats: a move offered, narrated): the line reader narrates it and offers Develop Your Relationship (social) — “Mira asks Tamsin, an existing connection, for a deeper mutual bond; that reinforces the relationship, not a new connection. Develop Your Relationship's deeds fit loosely.” [a move with no roll is offered, not rolled]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Make a Connection (social, risk plain) — “Tamsin is already Mira's connection, so this is developing that relationship: asking her to be a reliable contact in turn.” [dial 5 (social), risk plain]

**`trust-2`** — control · wants no move · context spire-stall · from run 4 a7, without its first sentence and its last question

> I'm not buying anything, Tamsin. I'm asking you to be my friend on this dock, and I'll be yours.

_The same plea in other words; the run's move reader took it for a costly gesture of commitment (a7)._

- `two:claude-sonnet-5-5` — **a move rolled** (its repeats: a move offered, a move rolled): the pacing reader calls it a move, naming Develop Your Relationship (social, 0.80) — “Mira offers Tamsin, one of her connections, mutual friendship on the dock — a plain bid to deepen the relationship, which only develop_your_relationship marks; social dial 5 and the relationship at stake support MOVE.”; the move reader makes it Develop Your Relationship — “Mira makes a plain, sincere bid to deepen her bond with Tamsin Okoro, an existing connection (relationship 4 of 10, not yet bonded). That is develop_your_relationship, which for an un-bonded connection is no roll and simply marks progress. The pacing read fits. The line is neither a compel (she is offering friendship, not pressing for something reluctant) nor a make_a_connection (the connection already exists).”
- `one:claude-sonnet-5-5` — **a move offered** (its repeats: a move offered, narrated): the line reader narrates it and offers Develop Your Relationship (social) — “Mira offers Tamsin mutual friendship and standing on the dock, reinforcing an existing connection; no stakes or reluctance are pressed, so it is no roll.” [a move with no roll is offered, not rolled]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Make a Connection (social, risk slight) — “Asking Tamsin to be a friend and offering the same seeks a new relationship, but Tamsin is already Mira's connection, so this reads as developing her relationship.” [dial 5 (social), risk slight]

**`develop-1`** — control · wants no move · context aboard-at-spire · from run 2 a59, without its move name

> I raise Tamsin on the comm and trade news with her, asking how the docks have been.

_News traded with a connection: talk, by the rules and by the pacing reader's (small talk, news traded and plain questions stay narration). Run 2's charter took it for Develop Your Relationship and so did this list at first; the first readers' run narrated it four readings of four on both models. Its control beside develop-2, -3 and -4._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.88) — “Opening a comm channel and trading news with a connection is plain conversation with nothing pressed or at stake, so no move is warranted.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (social) — “Raising an existing connection and trading news is ordinary talk with nothing at risk, pressing no one and testing no relationship.” [no move]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Make a Connection (social, risk plain) — “Trading news and asking after the docks is talk with an existing connection, not a deed any trigger names; it is no move.” [dial 5 (social), risk plain]

**`none-reread`** — control · wants no move · context aboard-at-spire

> I read Tamsin's message again. How many days out did she say Bleakhold was?

_A question about what is already established._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.93) — “Rereading a message and asking a factual question already answered in the scene is plain conversation/observation with no stakes, no risk, and no step toward a vow.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (investigation) — “Rereading a message and asking how many days out Bleakhold is a question to the narrator with nothing at risk; it meets no move trigger.” [no move]
- `one:claude-haiku-5-5` — **a move rolled** (its repeats: narrated, a move rolled): the line reader rolls Gather Information (investigation, risk plain) — “Mira re-reads Tamsin's message to pull a specific detail from it, which is searching for a clue in the record already on the comm panel.” [dial 6 (investigation), risk plain]

**`none-hearten-whole`** — control · wants no move · context aboard-at-spire

> I put the kettle on and sit a while with a hot cup, watching the dock lamps go by.

_A peaceful moment with spirit 5 of 5: hearten-1's cup of tea, with nothing for it to mend._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (downtime, 0.95) — “A quiet, safe moment of rest with no stakes at downtime dial 1; Spirit is full and Mira is not shaken, so there is nothing for hearten to recover.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (downtime) — “Making tea and watching dock lamps in safety puts nothing at risk, and Mira's spirit is full so there is nothing for Hearten to recover.” [no move]
- `one:claude-haiku-5-5` — **a move offered** (its repeats: a move offered, narrated): the line reader narrates it and offers Sojourn (downtime, risk plain) — “A quiet cup of tea in the cockpit is no move: nothing is at risk and no recovery is being sought in a community.” [dial 1 (downtime), risk plain]

**`none-say-again`** — control · wants no move · context bleakhold-clerk

> I ask Roe to say again how often the man comes to the cargo lock.

_A question about what he has already said._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.88) — “A plain clarifying question to a non-connection NPC who already volunteered the answer; no pressure or stakes, so it is just conversation.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (social) — “Asking Roe to repeat how often the man comes is plain talk; it presses no one and puts nothing at risk.” [no move]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Compel (social, risk plain) — “Pressing Roe to repeat a detail he is reluctant to give is persuasion, which the compel trigger covers with +heart.” [dial 5 (social), risk plain]

**`none-chart-mark`** — control · wants no move · context ashfall-drift

> I mark the wrecked relay on my own chart and pencil a name beside it: Dead Ear.

_An everyday action with nothing at risk._

- `two:claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (exploration, 0.80) — “Marking and naming a landmark on her own chart is an everyday action with nothing at risk and no vow step, recovery, or relationship change, so it needs no roll.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (exploration) — “Marking a wreck on her own chart and naming it puts nothing at risk and meets no move trigger; it is bookkeeping and narration.” [no move]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Make a Discovery (exploration) — “Naming and charting the wreck is not a move; the line only labels a place, and discoveries come from Explore a Waypoint rolls, not lines.” [a move with no roll is offered, not rolled]

**`claim-refuted`** — control · wants no move · context bleakhold-brig · from run 4 a70

> I tell the pilot: the Cinder Wren is the raider, and I've traced her orders back to the broker who sold the lane schedules. That's the proof I came for.

_A proof claimed that the scene refutes: the pilot has just said her orders came unsigned and that Tamsin sold nothing. The fourth live run offered it Reach a Milestone, and its narration then refuted the claim (issue #383 #3)._

- `two:claude-sonnet-5-5` — **a move offered**: the pacing reader narrates it and offers Reach a Milestone (investigation, 0.80) — “The player states proof found toward the open vow (who is raiding the lanes) with no attempt or stakes, so only reach_a_milestone fits; it is claimed, not rolled.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (investigation) — “Mira asserts a conclusion the scene doesn't show (orders unsigned, Tamsin cleared); a claim of proof is not headway yet, and it asks nothing of the pilot.” [no move]
- `one:claude-haiku-5-5` — **a move offered**: the line reader narrates it and offers Compel (social, risk slight) — “Mira presses the pilot with a claim about the broker, trying to get her to confirm a damning story she is reluctant to give.” [dial 5 (social), risk slight]

**`claim-refuted-2`** — control · wants no move · context bleakhold-brig

> So it was Tamsin all along. The pilot as good as told me, and that settles it: I have what I came for.

_The same kind of claim, against the scene: the pilot has said the opposite._

- `two:claude-sonnet-5-5` — **a move offered** (its repeats: narrated, a move offered): the pacing reader narrates it and offers Reach a Milestone (investigation, 0.70) — “Player claims to have gained what they came for from the interrogation, a stated step toward the open vow, which only reach_a_milestone marks; no new action with stakes is attempted.”
- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (investigation) — “The pilot cleared Tamsin Okoro, yet the line is a conclusion and a claim of headway the scene does not show, so no move is made.” [no move]
- `one:claude-haiku-5-5` — **a move offered** (its repeats: a move offered, narrated): the line reader narrates it and offers Reach a Milestone (investigation) — “The pilot's statement that Tamsin sold nothing is the scene's headway, but the player's conclusion contradicts it, so the milestone is read as the earned insight rather than the claimed answer.” [a move with no roll is offered, not rolled]

## Self-consistency

A line read more than once by the same arm: did its repeats come to the same thing?

- `two:claude-sonnet-5-5`: 69 of 76 (91%) line(s) came out the same every time. Not the same: `develop-3` (offered, rolled); `test-1` (rolled, offered); `trust-2` (a move offered, a move rolled); `course-1` (rolled, offered); `advantage-1` (offered, rolled); `bond-1` (rolled, offered); `claim-refuted-2` (narrated, a move offered).
- `one:claude-sonnet-5-5`: 70 of 76 (92%) line(s) came out the same every time. Not the same: `progress-3` (offered, nothing); `swear-1` (offered, rolled); `trust-1` (a move offered, narrated); `trust-2` (a move offered, narrated); `bond-2` (offered, rolled); `done-1` (offered, another move offered).
- `one:claude-haiku-5-5`: 69 of 76 (91%) line(s) came out the same every time. Not the same: `test-1` (offered, another move offered); `test-2` (another move offered, offered); `none-reread` (narrated, a move rolled); `none-hearten-whole` (a move offered, narrated); `done-2` (another move offered, offered); `named-after-moves-2` (offered, not rolled, rolled); `claim-refuted-2` (a move offered, narrated).

## Cost and time

| Arm | Calls (pacing + move, or the line reader's) | Input | Cache read | Cache write | Output | Cost | Pacing reader, median | Move reader, median | A line, median / p90 |
|---|---|---|---|---|---|---|---|---|---|
| `two:claude-sonnet-5-5` | 220 (152 + 68) | 190012 | 1394480 | 12872 | 44706 | $0.9987 | 1.8 s | 3.1 s | 2.2 s / 5.4 s |
| `one:claude-sonnet-5-5` | 152 (the line reader) | 269530 | 1248317 | 8267 | 37062 | $1.0676 | 2.2 s (the line reader) | – | 2.2 s / 3.3 s |
| `one:claude-haiku-5-5` | 152 (the line reader) | 269530 | 1248317 | 8267 | 30217 | $0.0562 | 1.0 s (the line reader) | – | 1.0 s / 1.4 s |

Total: $2.1225, by the price table in explore.config.json (computed from each reply's usage, not billed from it). **20 call(s) that were not a reader's were made, and reached no model** — see run.json.

## Calls and time by where a line ended

A line's reading time is its calls' together (the pacing reader's and the move reader's, or the line reader's one); a line ended rolled, offered on a button, or narrated with nothing.

| Arm | Calls a line | Narrated: median (lines) | Offered: median (lines) | Rolled: median (lines) | A line's cost: mean (the criterion) | A line's cost: median |
|---|---|---|---|---|---|---|
| `two:claude-sonnet-5-5` | 1.45 | 1.8 s (33) | 1.6 s (51) | 5.0 s (68) | $0.0066 | $0.0040 |
| `one:claude-sonnet-5-5` | 1.00 | 1.9 s (45) | 2.3 s (47) | 2.4 s (60) | $0.0070 | $0.0068 |
| `one:claude-haiku-5-5` | 1.00 | 0.9 s (21) | 1.0 s (75) | 1.2 s (56) | $0.0004 | $0.0004 |

## The dials' share

Of the lines read right whose move makes an action roll (a stat — a move with no roll is offered by rule), how many were rolled rather than offered: the dials at work.

- `two:claude-sonnet-5-5`: 57 of 84 (68%) rolled.
- `one:claude-sonnet-5-5`: 55 of 82 (67%) rolled; 2 line(s) that asked to be rolled were offered.
- `one:claude-haiku-5-5`: 45 of 75 (60%) rolled; 3 line(s) that asked to be rolled were offered.

## By kind

A kind is a probe across families (issue #383's): its controls want narration, its other lines their move read.

| Kind | `two:claude-sonnet-5-5` | `one:claude-sonnet-5-5` | `one:claude-haiku-5-5` |
|---|---|---|---|
| worth | 4 of 4 | 4 of 4 | 2 of 4 |
| trust | 0 of 4 | 2 of 4 | 0 of 4 |
| named-after-run | 4 of 4 | 2 of 4 | 1 of 4 |
| claim-supported | 4 of 4 | 2 of 4 | 2 of 4 |
| claim-refuted | 1 of 4 | 4 of 4 | 1 of 4 |

## Fights

The lines read with a fight open, the character's position in it set: read, a move the position does not allow, a control rolled.

- `two:claude-sonnet-5-5`: 12 of 12 (100%) read; 0 reading(s) not legal for the position; 0 of 2 control(s) rolled.
- `one:claude-sonnet-5-5`: 12 of 12 (100%) read; 0 reading(s) not legal for the position; 0 of 2 control(s) rolled.
- `one:claude-haiku-5-5`: 12 of 12 (100%) read; 0 reading(s) not legal for the position; 0 of 2 control(s) rolled.

## Against the switch criteria

The one reader against the two on the same model, by the scope's section 8.2 (computed from the tables above; a criterion with nothing measured is open). A one-line difference is not a finding.

### `one:claude-sonnet-5-5` against `two:claude-sonnet-5-5` — do not switch

| # | Criterion | Holds | Measured |
|---|---|---|---|
| 1 | lines wanting a move | **no** | read 102 of 112 against 108 of 112; no family fell by more than two |
| 2 | controls offered or rolled a move | yes | 2 of 40 against 7 of 40 |
| 3 | another move rolled or offered | yes | 1 against 4 |
| 4 | issue #383's kinds, each as wanted in three readings of four | **no** | worth 4 of 4; trust 2 of 4; named-after-run 2 of 4; claim-supported 2 of 4; claim-refuted 4 of 4 |
| 5 | fights | yes | read 12 of 12 against 12 of 12; 0 not legal for the position; 0 control(s) rolled |
| 6 | time: a rolled line 1 s faster, a narrated one no more than 0.3 s slower | yes | rolled 2.42 s against 5.01 s; narrated 1.95 s against 1.76 s |
| 7 | cost: a line no dearer (the whole spend a line) | **no** | $0.0070 against $0.0066 a line; the median line $0.0068 against $0.0040 |
| 8 | the dials hold: the rolled share within 10 points | yes | 67% (55 of 82) against 68% (57 of 84) |
| 9 | no more than one unreadable reply in a hundred | yes | 0 of 152 |

## What this test does not show

- **Nothing is rolled or narrated.** A line counted as rolled is one whose roll dialog would open on the right move; the stat, the stakes, the dice and the narration are not looked at.
- **The wanted readings are one reader's reading of the rules.** Where the rules allow two moves the list accepts both; a line whose reading is arguable was left out, and a note on a line says where it is close.
- **A few readings of a line are a small sample** of a reader that does not always answer alike: a line read right four times in five shows here as right or as wrong. READERS_REPEATS measures it.
- **76 line(s), a handful to a move.** A family's rate rests on three to ten lines, a kind's on two; a difference of one line between arms is not a finding.
- **The scenes are written by hand**: one or two paragraphs of narration, with a matching scene frame, where a table has up to three cards with the player's own lines among them — and none of the drift a long session leaves in a scene.
- **One character, alone, with one connection and one vow**, at the pacing and mischief dials a new world has (mischiefDial balanced, enabled true, densityWindow 5, combat 9, investigation 6, exploration 6, social 5, downtime 1). A fight is one track with the character's position in it set by hand, never one a roll began or moved.
- **The sheet is set by hand.** Each context's health, spirit, supply and impacts, its vow's progress and the ship's integrity are written to the world before its lines are read, and both readers are told them (their SITUATION block). A table's sheet moves under play: no line here follows a roll that changed it.
- **Each line is read on its own**: the count of recent moves is cleared before every reading — and set, before a line whose case says it follows a run of moves (`recentMoves`), to that many moves of the last five. Nothing else of a run of rolls is set: no move card is in the recent scene.
- **Only the model changes between arms of one design.** Each arm reads the same prompts as the others of its design, written for the readers' own model (`claude-sonnet-5-5`); a prompt tuned to another model might read differently.
- **No arm thinks first.** The readers turn thinking off, each model in its own form (`two:claude-sonnet-5-5`: between_tools; `one:claude-sonnet-5-5`: between_tools; `one:claude-haiku-5-5`: disabled), and each model answers at its own default effort; a reader allowed to think, or set to another effort, might read differently.

