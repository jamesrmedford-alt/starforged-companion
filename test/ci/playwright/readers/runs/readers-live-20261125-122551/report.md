# The readers on plain lines — readers-live-20261125-122551

A live run, 2026-11-25T12:25:51.070Z, at commit `97b14f57f63a`: 76 line(s), read 2 time(s) each by `one:claude-sonnet-5-5` and `two:claude-sonnet-5-5` — 304 reading(s).

**A baseline, not read in this run:** `two:claude-sonnet-5-5` — 152 reading(s) from `readers-live-20261125-073803`, read at commit `b86559b3d997`. Its tree is that run's, not this one's: a change between the two to the code it calls is not in its readings.

## What this run was to answer

1. Lines wanting a move: does the switched one reader (slices 2–4, wired into play) read at least 106 of 112 — the second measure's 108, less two — with no family more than two readings below the kept two readers' (readers-live-20261125-073803)?
2. swear-1 and swear-2: is each read as Swear an Iron Vow in both readings — the mend that a vow sworn in anyone's service is the vow, never Develop's deed in its place?
3. bond-1 and bond-2: is each read as Forge a Bond in both readings, with trust-1 and trust-2 still narrated with no move?
4. Controls: are no more than one of the 40 offered or rolled a move?
5. Another move: is a move not wanted rolled or offered in no more than two readings?
6. Issue #383's kinds: does each — trust, worth, claim-supported, claim-refuted, named-after-run — come out as wanted in at least three of its four readings?
7. Fights: are the fight lines 12 of 12 read, every reading allowed by the position, and no fight control rolled?
8. Slice 4 tells the reader what can be made from the move contracts instead of the stand-in: did any recovery line (heal, hearten, resupply, repair, sojourn) or its controls (none-heal-whole, none-hearten-whole) come out differently from the second measure's one reader, and why, in the reader's own reason?
9. Cost: is the whole spend a line no more than the second measure's $0.0055 plus a tenth — and what does a call take in uncached input, cache-read and output tokens, against its 1,385, 8,944 and 164?
10. Time: is the median rolled line at least 1 s faster than the kept two readers' 5.19 s, and the median narrated line no more than 0.3 s slower than their 1.76 s?
11. Unreadable replies: are none of the 152 readings failed?
12. Regressions: did any line the second measure's one reader read right, or any control it narrated, come out wrong now — and is each the switch's wiring, slice 4's availability, or a repeat's noise?

**The answers** (written after the run, from the tables below; the switched reader at commit b881bbb2 — slices 2–4 wired into play — against the kept two readers of readers-live-20261125-073803; the verdict is section 8.2's, computed by the run — **switch**, all nine hold):

1. **Yes.** 110 of 112 — the best of the three measures — against the two readers' 104; no family fell by more than two.
2. **Yes.** swear-1 offered Swear an Iron Vow twice (the second measure: Develop offered twice); swear-2 offered twice. The mend holds.
3. **Yes.** bond-1 rolled and offered Forge a Bond (the second measure: nothing twice); bond-2 offered twice; trust-1 and trust-2 narrated with no move in both readings.
4. **Yes.** 0 of 40 controls offered or rolled a move (the two readers: 8).
5. **Yes.** No move that was not wanted, rolled or offered (the two readers: 5).
6. **Yes.** Every kind 4 of 4 — worth, trust, named-after-run, claim-supported, claim-refuted (the two readers: trust 0, claim-refuted 0).
7. **Yes.** 12 of 12; none illegal for the position; neither fight control rolled.
8. **None changed.** Every recovery line (heal-1, heal-2, hearten-1, resupply-1, resupply-2, repair-1, repair-2, sojourn-1) was offered in both readings, as in the second measure, and none-heal-whole and none-hearten-whole were narrated in both: the contracts' POSSIBLE NOW / NOT NOW told the reader what the stand-in did.
9. **Yes.** $0.0054 a line (the second measure's $0.0055). A call took about 1,323 uncached input, 9,576 cache-read and 154 output tokens (the second measure: 1,385, 8,944, 164) — the contracts' lists are a little longer, and cached.
10. **Yes.** A rolled line's median 2.03 s against 5.19 s; a narrated line's 1.36 s against 1.76 s.
11. **Yes.** 0 of 152 failed.
12. **One line, both readings: progress-4** (Reach a Milestone; the second measure offered it twice) now reads as no move — "no obstacle, insight or foe has been overcome in the scene; it is a recap of intelligence received". The line's own note marks it as close (a step said to nobody, alone in the cockpit); rule 6 asks for headway the scene bears out, and this scene holds only a message and a rumour. Counted, not mended: a narrated claimed step costs the player one ask, where reading an unsupported claim as a milestone (the fourth run's a70) rewarded it. The dials' rolled share moved from 67% to 62% (53 of 86), inside the 10 points.

**Decision:** the switch stands, as built in slices 2–4. The next live long haul is the measure in play.

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
| `one:claude-sonnet-5-5` | 112 | **110 of 112 (98%)** | 58 | 52 | 0 | 2 | 40 of 40 (100%) | 0 |
| `two:claude-sonnet-5-5` | 112 | **104 of 112 (93%)** | 60 | 44 (and 1 named, offered, not rolled) | 5 (3 rolled, 3 of them on purpose; 2 offered) | 2 | 32 of 40 (80%) | 0 |

Of the 56 line(s) wanting a move that every arm read: **50** every arm read right, **6** some did and some did not, **0** none did. A line no arm reads is not the model's doing alone; a line one arm reads and another does not is where the model matters.

## By family

| Family | `one:claude-sonnet-5-5` | `two:claude-sonnet-5-5` |
|---|---|---|
| recovery | 16 of 16 (100%) read (0 rolled, 16 offered); 0 another move, 0 nothing | 16 of 16 (100%) read (0 rolled, 16 offered); 0 another move, 0 nothing |
| connection | 20 of 20 (100%) read (2 rolled, 18 offered); 0 another move, 0 nothing | 20 of 20 (100%) read (7 rolled, 13 offered); 0 another move, 0 nothing |
| vow | 16 of 18 (89%) read (4 rolled, 12 offered); 0 another move, 2 nothing | 16 of 18 (89%) read (6 rolled, 10 offered); 2 another move, 0 nothing |
| control | 40 of 40 (100%) narrated; 0 offered a move, 0 rolled | 32 of 40 (80%) narrated; 4 offered a move, 4 rolled |
| action | 20 of 20 (100%) read (14 rolled, 6 offered); 0 another move, 0 nothing | 16 of 20 (80%) read (16 rolled, 0 offered); 2 another move, 2 nothing |
| travel | 16 of 16 (100%) read (16 rolled, 0 offered); 0 another move, 0 nothing | 16 of 16 (100%) read (11 rolled, 5 offered); 0 another move, 0 nothing |
| named move | 4 of 4 (100%) read (4 rolled, 0 offered); 0 another move, 0 nothing | 3 of 4 (75%) read (3 rolled, 0 offered); 0 another move, 0 nothing |
| fight entry | 6 of 6 (100%) read (6 rolled, 0 offered); 0 another move, 0 nothing | 6 of 6 (100%) read (6 rolled, 0 offered); 0 another move, 0 nothing |
| fight | 12 of 12 (100%) read (12 rolled, 0 offered); 0 another move, 0 nothing | 11 of 12 (92%) read (11 rolled, 0 offered); 1 another move, 0 nothing |

## Where the arms differ

**`connect-1`** — connection · wants Make a Connection · context spire-stall

> Idris Vane has watched these docks longer than anyone. I sit down beside his barrel, give him my name, and set about making a friend of him. I want him on my side for as long as I fly out of Hollow Spire.

- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Make a Connection (social, risk plain) — “Mira searches out a new relationship with Idris Vane, who is not yet her connection; make_a_connection is the trigger for seeking a new relationship.” [dial 5 (social), risk plain]
- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Make a Connection (social, 0.90) — “Player explicitly sets about establishing a lasting relationship with a new NPC, Idris Vane, who is not among Mira's connections; this is a clear commitment, the intent of Make a Connection.”; the move reader makes it Make a Connection — “Mira explicitly sets out to befriend a new NPC, Idris Vane, who is not among her connections, and wants a lasting alliance. That is the intent of Make a Connection, rolled +heart.”

**`test-2`** — connection · wants Test Your Relationship · context spire-stall

> Tamsin wants the name of the trader who talked to me. I refuse her, because I gave him my word, and I hold to it even when I see what it costs me with her.

- `one:claude-sonnet-5-5` — **offered** (its repeats: offered, rolled): the line reader narrates it and offers Test Your Relationship (social, risk plain) — “Refusing Tamsin the name, holding to a promise at the cost of her trust, puts the relationship to the test through conflict.” [dial 5 (social), risk plain]
- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Test Your Relationship (social, 0.80) — “Mira refuses her connection Tamsin to keep her word at visible cost to the bond, which is a relationship tested, not plain conversation; with a social dial of 5 and clear commitment this is a move.”; the move reader makes it Test Your Relationship — “Mira refuses Tamsin's request to keep her word to another, openly accepting the cost to their bond. The connection is strained by competing loyalties, which is the trigger for Test Your Relationship (+heart). This is not Compel, since Mira is not pressing anyone to do anything; she is holding a line against a connection.”

**`swear-1`** — vow · wants Swear an Iron Vow · context spire-stall

> I draw my knife, lay my palm flat on the blade, and tell Tamsin I will bring Joss home.

- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Swear an Iron Vow (social, risk plain) — “Laying a palm on the blade and promising to bring Joss home is swearing upon iron to complete a quest, in Tamsin's service.” [dial 5 (social), risk plain]
- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Swear an Iron Vow (social, 0.88) — “A ritual pledge to bring Joss home is the player committing to a new quest, with a connection present and stakes clear.”; the move reader makes it Swear an Iron Vow — “Mira ritually pledges, knife and palm, to bring Tamsin's nephew Joss home. This is a solemn commitment to a new quest, made to a connection with clear stakes, not a step on the existing Cinder Expanse vow. Roll +heart.”

**`swear-2`** — vow · wants Swear an Iron Vow · context spire-stall

> I give Tamsin my word, on iron and on my ship: I will find the Lark's Tithe and whoever took her.

- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Swear an Iron Vow (social, risk plain) — “Mira swears upon iron to complete a quest in Tamsin's service; a vow sworn is swear_an_iron_vow, not Develop's deed.” [dial 5 (social), risk plain]
- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Swear an Iron Vow (social, 0.90) — “The player explicitly swears an oath 'on iron' to find the Lark's Tithe and its captors, which is a clear commitment to a new quest and triggers Swear an Iron Vow.”; the move reader makes it Swear an Iron Vow — “Mira explicitly gives her word 'on iron' to Tamsin to find the missing freighter and its captors. This is a solemn oath to a new quest, not a step on the existing Cinder Expanse raiders vow, so Swear an Iron Vow with +heart.”

**`gather-1`** — action · wants Gather Information · context spire-stall · from run 2 a8

> I work the docks asking traders who saw the raiders last, pressing hard even though it may cost me Tamsin's trust and draw the wrong eyes.

- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Gather Information (investigation, risk plain) — “Working the docks questioning traders about who saw the raiders last is an investigation, searching for clues, rolled with wits.” [dial 6 (investigation), risk plain]
- `two:claude-sonnet-5-5` — **another move rolled**: the pacing reader calls it a move, naming Gather Information (investigation, 0.85) — “Mira actively presses traders for information on the raiders with explicit stakes (Tamsin's trust, unwanted attention), a committed action at investigation dial 6.”; the move reader makes it Compel (a misread on purpose, it says) — “The pacing read says gather_information, but the line is about pressing reluctant traders who won't meet her eye, with implied menace ('pressing hard') and explicit social cost. That is compel: pushing unwilling people to give up what they know. Leaning on them with force rather than charm reads as iron, a less obvious but more dramatic take than a plain wits investigation.”

**`compel-1`** — action · wants Compel · context spire-stall

> I put a week's water chits on Idris Vane's counter and ask him to tell me which trader has been selling the freighter schedules.

- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Compel (social, risk plain) — “Offering water chits to get Idris to reveal who sells the freighter schedules is making an offer to persuade him; he may be reluctant.” [dial 5 (social), risk plain]
- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Compel (social, 0.80) — “Mira offers payment to press a wary, reluctant NPC for information; that is a compel with stakes, and the social dial of 5 leaves it borderline, but the pressing action is explicit.”; the move reader makes it Compel — “Mira presses a wary, reluctant water-seller to name an informant, sweetening it with a week's chits. That is an offer of payment and appeal, not a threat or deception, so Compel +heart fits best. The information is also a lead toward her vow about the raiders, but the roll here is the pressing itself.”

**`trust-1`** — control · wants no move · context spire-stall · from run 4 a5

> I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, and who can count on me in turn. Will you be that?

_Asking a known connection for trust is talk: none of the game's seven deeds for Develop Your Relationship, and no Make a Connection for someone already one. The fourth live run's readers read it Develop, no roll, at a5 (issue #383 #1 c)._

- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (social) — “Asking Tamsin to be someone each can count on is a plea for a tie still being built; her relationship is 4 of 10, not ready to forge, and it is no listed deed.” [no move]
- `two:claude-sonnet-5-5` — **a move rolled**: the pacing reader calls it a move, naming Make a Connection (social, 0.70) — “Mira speaks to Tamsin, an existing connection, to commit to a lasting mutual bond with real stakes, and a social dial of 5 with this relational weight leans toward a move; she names no move, so develop_your_relationship (or forge a bond) could also fit downstream.”; the move reader makes it Forge a Bond — “Mira explicitly asks Tamsin, an existing connection, to commit to a lasting mutual bond ('someone I can come back to, who can count on me in turn'). That is the trigger for Forge a Bond, a progress move against the relationship track. The track is only 4 of 10, so it is a premature attempt at worse odds, which makes it dramatically interesting. Develop Your Relationship does not fit, since this is a direct request to cement the bond rather than a small deepening step, and make_a_connection does not fit because the connection already exists.”

**`trust-2`** — control · wants no move · context spire-stall · from run 4 a7, without its first sentence and its last question

> I'm not buying anything, Tamsin. I'm asking you to be my friend on this dock, and I'll be yours.

_The same plea in other words; the run's move reader took it for a costly gesture of commitment (a7)._

- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (social) — “Asking Tamsin for friendship while the relationship is still being built is talk, not one of develop_your_relationship's deeds; her track is not full, so forge_a_bond does not apply.” [no move]
- `two:claude-sonnet-5-5` — **a move rolled**: the pacing reader calls it a move, naming Make a Connection (social, 0.60) — “Mira offers mutual friendship to a connection with her relationship at stake; Tamsin is already a connection, so this is a move to deepen the bond (develop_your_relationship), not a new one.”; the move reader makes it Develop Your Relationship — “Mira offers mutual friendship to Tamsin, who is already a connection (relationship 4 of 10, not bonded). Deepening an existing connection is Develop Your Relationship; un-bonded, it is no roll and the relationship track is marked. Make a Connection does not apply because the connection already exists.”

**`progress-4`** — vow · wants Reach a Milestone · context aboard-at-spire

> I have what I came to Hollow Spire for: the raiders hunt the Bleakhold run, and I know where one of their cutters lies. That is the first solid lead on whoever is raiding these lanes, and it is mine now.

_A step said to nobody, alone in the cockpit, with no fight behind it or ahead: nothing is attempted and nobody is told._

- `one:claude-sonnet-5-5` — **nothing**: the line reader narrates it, with no move offered (investigation) — “The line claims a lead from Tamsin's message, but no obstacle, insight or foe has been overcome in the scene; it is a recap of intelligence received, so no milestone is earned.” [no move]
- `two:claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Reach a Milestone (investigation, 0.85) — “The player states a real step toward the open vow (the first solid lead on the raiders) with no action or stakes, so the milestone is offered rather than plain narration.”

**`course-1`** — travel · wants Set a Course · context aboard-at-spire · from run 2 a20

> I plot the course and take the Kobayashi IV to Bleakhold Station.

- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Set a Course (exploration, risk plain) — “Bleakhold Station is a charted place reached by a known marked lane, so following that route through perilous space is Set a Course.” [dial 6 (exploration), risk plain]
- `two:claude-sonnet-5-5` — **offered** (its repeats: offered, rolled): the pacing reader narrates it and offers Set a Course (exploration, 0.70) — “Travel to charted Bleakhold Station along a known marked lane; raiders hit that run, so there is risk worth offering, but the player expresses departure rather than a stakes-laden attempt, so it stays at the offer level at dial 6.”

**`course-2`** — travel · wants Set a Course · context aboard-at-spire

> I cast off from the Spire and fly the marked lane out to Bleakhold Station.

- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Set a Course (exploration, risk plain) — “Flying the known marked lane to Bleakhold Station, a charted place, is following a known route through perilous space.” [dial 6 (exploration), risk plain]
- `two:claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Set a Course (exploration, 0.80) — “Travel along a known marked lane to charted Bleakhold, a lane the raiders keep hitting, so the journey carries stakes; set_a_course is offered rather than rolled outright at exploration dial 6.”

**`course-3`** — travel · wants Set a Course · context aboard-at-spire

> Vigil Reach is closer. I take the Kobayashi IV there along the old charted route to ask after the freighters.

- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Set a Course (exploration, risk plain) — “Vigil Reach is a charted place and the old charted route is a known route through perilous space, so this is Set a Course.” [dial 6 (exploration), risk plain]
- `two:claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Set a Course (exploration, 0.60) — “Journey along a charted route to a charted place with no established hazard or time pressure; offer set_a_course at exploration dial 6 rather than forcing a roll.”

**`named-after-moves`** — named move · wants Set a Course, rolled · context aboard-at-spire · from run 4 a33

> I set a course for Bleakhold Station.

_A line that names its move asks for it, at any dial (the pacing reader's own rule) — read after four moves of the last five, as the fourth live run's last resort was, which was offered for the density rather than rolled (issue #383 #17)._

- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Set a Course (exploration, asked, risk plain) — “Bleakhold Station is a charted place reached by a known marked lane, and the player names Set a Course; the run is perilous.” [the player asked for it]
- `two:claude-sonnet-5-5` — **offered, not rolled** (its repeats: rolled, offered, not rolled): the pacing reader narrates it and offers Set a Course (exploration, 0.70) — “Bleakhold Station is charted but the run is the lane the raiders keep hitting, so the journey has stakes; with high recent move density and a middling exploration dial, offer set_a_course rather than force a roll.”

**`gear-1`** — action · wants Check Your Gear · context aboard-at-spire

> I dig through the lockers behind my seat for a spare signal flare. I will want one out in that drift.

- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Check Your Gear (downtime, risk slight) — “Searching the lockers for a specific helpful item, a spare signal flare, is checking whether she has it, which triggers Check Your Gear.” [dial 1 (downtime), risk slight]
- `two:claude-sonnet-5-5` — **nothing**: the pacing reader narrates it, with no move offered (downtime, 0.80) — “Rummaging a ship's locker for a flare while docked and safe is an everyday action with nothing at risk and no vow, connection, or recovery stake.”

**`bond-1`** — connection · wants Forge a Bond · context spire-reckoning

> Tamsin, will you stand with me for good, whatever comes?

- `one:claude-sonnet-5-5` — **offered** (its repeats: rolled, offered): the line reader narrates it and offers Forge a Bond (social, risk plain) — “Asking Tamsin to stand together for good, whatever comes, makes the tie lasting; her relationship track is full, so a bond is ready to forge.” [dial 5 (social), risk plain]
- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Forge a Bond (social, 0.82) — “Mira asks her connection Tamsin, whose relationship track is full with no bond yet, to commit for good, which is a bond-forging line with real stakes.”; the move reader makes it Forge a Bond — “Mira asks Tamsin to commit permanently, and her relationship track is full (10 of 10) with no bond yet forged. This is a direct bond-forging line and a progress move against the connection's track. No unexpected reading is warranted here, since a neighbouring move would misrepresent a plain request for lasting commitment.”

**`done-1`** — vow · wants Fulfill Your Vow · context spire-reckoning

> I put the sealed ledger in Warden Marr's hands and tell her all of it: Corvin Hale bought the schedules, and Corvin Hale sent the cutters. The lanes' raider has a name now.

- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Fulfill Your Vow (investigation, risk high) — “The vow swore to find who is raiding the lanes; the ledger proof and naming Corvin Hale reach that goal, so the quest ends with a progress roll.” [dial 6 (investigation), risk high]
- `two:claude-sonnet-5-5` — **another move offered**: the pacing reader narrates it and offers Reach a Milestone (social, 0.80) — “Handing over the proof and naming the raider is a real step toward the open vow to find who is raiding the lanes, with nothing at stake to roll, so a milestone is offered.”

**`compel-2`** — action · wants Compel · context bleakhold-clerk

> I tell Roe he can give me the name of the man at the cargo lock, or explain that second ledger to the station's auditors.

- `one:claude-sonnet-5-5` — **offered**: the line reader narrates it and offers Compel (social, risk plain) — “Mira presses a reluctant clerk to give up a name by threatening him with exposure to the auditors, which is a threat that meets Compel's trigger.” [dial 5 (social), risk plain]
- `two:claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Compel (social, 0.90) — “The player threatens exposure to press a reluctant clerk for the collector's name, which is a clear compel with stakes at a social dial of 5.”; the move reader makes it Compel — “Mira presses a reluctant clerk with an ultimatum — name the collector or face the auditors over the hidden ledger. This is a threat of exposure meant to force a name out of him. Mischief considered but declined: the line is plainly coercion, so intimidation (+iron) fits the literal reading, with shadow as a possible alternative approach.”

**`fight-ahead-fire`** — fight · wants Face Danger · context lane-fight-ahead

> The fizzing relay in the engine bay bursts into flame. I seal the bulkhead and smother it before it reaches the fuel lines.

_A danger that is no foe, in the middle of a fight: Face Danger, not a fight move._

- `one:claude-sonnet-5-5` — **rolled**: the line reader rolls Face Danger (combat, risk high) — “Sealing a bulkhead and smothering a fire before it reaches the fuel lines is acting against an immediate non-foe physical danger mid-fight.” [a fight is open: a fight never hedges]
- `two:claude-sonnet-5-5` — **another move rolled** (its repeats: rolled, another move rolled): the pacing reader calls it a move, naming Face Danger (combat, 0.90) — “Combat is active and the player describes acting (sealing the bulkhead, smothering the fire) and narrates the outcome as fact, so it must be rolled as facing an immediate danger, not asserted for free.”; the move reader makes it Gain Ground (a misread on purpose, it says) — “Mira is in control of the fight. Sealing the bulkhead and smothering the relay fire is a bold, improvised bid to shore up her position before pressing on. Gain Ground is the combat move available in control that fits maneuvering and holding the advantage (the pacing read suggested face_danger, but she is not in a bad spot, so a damage-control action becomes Gain Ground using quick technical know-how, +wits).”

**`claim-refuted`** — control · wants no move · context bleakhold-brig · from run 4 a70

> I tell the pilot: the Cinder Wren is the raider, and I've traced her orders back to the broker who sold the lane schedules. That's the proof I came for.

_A proof claimed that the scene refutes: the pilot has just said her orders came unsigned and that Tamsin sold nothing. The fourth live run offered it Reach a Milestone, and its narration then refuted the claim (issue #383 #3)._

- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (investigation) — “The line claims a trace to the broker that the scene contradicts: the pilot said the orders were unsigned and Tamsin sold nothing. Unsupported headway is no move, and telling the pilot is talk.” [no move]
- `two:claude-sonnet-5-5` — **a move offered**: the pacing reader narrates it and offers Reach a Milestone (investigation, 0.70) — “The line states a real step toward the open vow (proof of who is behind the raids), a milestone that is claimed rather than rolled; nothing in the line is at risk.”

**`claim-refuted-2`** — control · wants no move · context bleakhold-brig

> So it was Tamsin all along. The pilot as good as told me, and that settles it: I have what I came for.

_The same kind of claim, against the scene: the pilot has said the opposite._

- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (investigation) — “The scene contradicts the claim: the pilot said Tamsin sold nothing, so no headway or vow's end is borne out; the line is a conclusion, not a deed.” [no move]
- `two:claude-sonnet-5-5` — **a move offered**: the pacing reader narrates it and offers Reach a Milestone (investigation, 0.60) — “The player claims a conclusion that settles the raid inquiry, a step toward the open vow, so reach_a_milestone is offered; no new action with stakes is attempted, so no roll.”

## Lines no arm read

_None: every line wanting a move that was scored was read by at least one arm._

## Controls read as a move

**`trust-1`** — control · wants no move · context spire-stall · from run 4 a5

> I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, and who can count on me in turn. Will you be that?

_Asking a known connection for trust is talk: none of the game's seven deeds for Develop Your Relationship, and no Make a Connection for someone already one. The fourth live run's readers read it Develop, no roll, at a5 (issue #383 #1 c)._

- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (social) — “Asking Tamsin to be someone each can count on is a plea for a tie still being built; her relationship is 4 of 10, not ready to forge, and it is no listed deed.” [no move]
- `two:claude-sonnet-5-5` — **a move rolled**: the pacing reader calls it a move, naming Make a Connection (social, 0.70) — “Mira speaks to Tamsin, an existing connection, to commit to a lasting mutual bond with real stakes, and a social dial of 5 with this relational weight leans toward a move; she names no move, so develop_your_relationship (or forge a bond) could also fit downstream.”; the move reader makes it Forge a Bond — “Mira explicitly asks Tamsin, an existing connection, to commit to a lasting mutual bond ('someone I can come back to, who can count on me in turn'). That is the trigger for Forge a Bond, a progress move against the relationship track. The track is only 4 of 10, so it is a premature attempt at worse odds, which makes it dramatically interesting. Develop Your Relationship does not fit, since this is a direct request to cement the bond rather than a small deepening step, and make_a_connection does not fit because the connection already exists.”

**`trust-2`** — control · wants no move · context spire-stall · from run 4 a7, without its first sentence and its last question

> I'm not buying anything, Tamsin. I'm asking you to be my friend on this dock, and I'll be yours.

_The same plea in other words; the run's move reader took it for a costly gesture of commitment (a7)._

- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (social) — “Asking Tamsin for friendship while the relationship is still being built is talk, not one of develop_your_relationship's deeds; her track is not full, so forge_a_bond does not apply.” [no move]
- `two:claude-sonnet-5-5` — **a move rolled**: the pacing reader calls it a move, naming Make a Connection (social, 0.60) — “Mira offers mutual friendship to a connection with her relationship at stake; Tamsin is already a connection, so this is a move to deepen the bond (develop_your_relationship), not a new one.”; the move reader makes it Develop Your Relationship — “Mira offers mutual friendship to Tamsin, who is already a connection (relationship 4 of 10, not bonded). Deepening an existing connection is Develop Your Relationship; un-bonded, it is no roll and the relationship track is marked. Make a Connection does not apply because the connection already exists.”

**`claim-refuted`** — control · wants no move · context bleakhold-brig · from run 4 a70

> I tell the pilot: the Cinder Wren is the raider, and I've traced her orders back to the broker who sold the lane schedules. That's the proof I came for.

_A proof claimed that the scene refutes: the pilot has just said her orders came unsigned and that Tamsin sold nothing. The fourth live run offered it Reach a Milestone, and its narration then refuted the claim (issue #383 #3)._

- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (investigation) — “The line claims a trace to the broker that the scene contradicts: the pilot said the orders were unsigned and Tamsin sold nothing. Unsupported headway is no move, and telling the pilot is talk.” [no move]
- `two:claude-sonnet-5-5` — **a move offered**: the pacing reader narrates it and offers Reach a Milestone (investigation, 0.70) — “The line states a real step toward the open vow (proof of who is behind the raids), a milestone that is claimed rather than rolled; nothing in the line is at risk.”

**`claim-refuted-2`** — control · wants no move · context bleakhold-brig

> So it was Tamsin all along. The pilot as good as told me, and that settles it: I have what I came for.

_The same kind of claim, against the scene: the pilot has said the opposite._

- `one:claude-sonnet-5-5` — **narrated**: the line reader narrates it, with no move offered (investigation) — “The scene contradicts the claim: the pilot said Tamsin sold nothing, so no headway or vow's end is borne out; the line is a conclusion, not a deed.” [no move]
- `two:claude-sonnet-5-5` — **a move offered**: the pacing reader narrates it and offers Reach a Milestone (investigation, 0.60) — “The player claims a conclusion that settles the raid inquiry, a step toward the open vow, so reach_a_milestone is offered; no new action with stakes is attempted, so no roll.”

## Self-consistency

A line read more than once by the same arm: did its repeats come to the same thing?

- `one:claude-sonnet-5-5`: 74 of 76 (97%) line(s) came out the same every time. Not the same: `test-2` (offered, rolled); `bond-1` (rolled, offered).
- `two:claude-sonnet-5-5`: 72 of 76 (95%) line(s) came out the same every time. Not the same: `test-1` (rolled, offered); `course-1` (offered, rolled); `named-after-moves` (rolled, offered, not rolled); `fight-ahead-fire` (rolled, another move rolled).

## Cost and time

| Arm | Calls (pacing + move, or the line reader's) | Input | Cache read | Cache write | Output | Cost | Pacing reader, median | Move reader, median | A line, median / p90 |
|---|---|---|---|---|---|---|---|---|---|
| `one:claude-sonnet-5-5` | 152 (the line reader) | 201152 | 1455489 | 9639 | 23367 | $0.8201 | 1.7 s (the line reader) | – | 1.7 s / 2.5 s |
| `two:claude-sonnet-5-5` | 219 (152 + 67) | 189032 | 1387942 | 12872 | 43904 | $0.9881 | 1.9 s | 3.2 s | 2.3 s / 5.6 s |

Total: $1.8082, by the price table in explore.config.json (computed from each reply's usage, not billed from it). **20 call(s) that were not a reader's were made, and reached no model** — see run.json.

## Calls and time by where a line ended

A line's reading time is its calls' together (the pacing reader's and the move reader's, or the line reader's one); a line ended rolled, offered on a button, or narrated with nothing.

| Arm | Calls a line | Narrated: median (lines) | Offered: median (lines) | Rolled: median (lines) | A line's cost: mean (the criterion) | A line's cost: median |
|---|---|---|---|---|---|---|
| `one:claude-sonnet-5-5` | 1.00 | 1.4 s (42) | 1.9 s (52) | 2.0 s (58) | $0.0054 | $0.0053 |
| `two:claude-sonnet-5-5` | 1.44 | 1.8 s (34) | 1.9 s (51) | 5.2 s (67) | $0.0065 | $0.0040 |

## The dials' share

Of the lines read right whose move makes an action roll (a stat — a move with no roll is offered by rule), how many were rolled rather than offered: the dials at work.

- `one:claude-sonnet-5-5`: 53 of 86 (62%) rolled.
- `two:claude-sonnet-5-5`: 56 of 80 (70%) rolled; 1 line(s) that asked to be rolled were offered.

## By kind

A kind is a probe across families (issue #383's): its controls want narration, its other lines their move read.

| Kind | `one:claude-sonnet-5-5` | `two:claude-sonnet-5-5` |
|---|---|---|
| worth | 4 of 4 | 4 of 4 |
| trust | 4 of 4 | 0 of 4 |
| named-after-run | 4 of 4 | 3 of 4 |
| claim-supported | 4 of 4 | 4 of 4 |
| claim-refuted | 4 of 4 | 0 of 4 |

## Fights

The lines read with a fight open, the character's position in it set: read, a move the position does not allow, a control rolled.

- `one:claude-sonnet-5-5`: 12 of 12 (100%) read; 0 reading(s) not legal for the position; 0 of 2 control(s) rolled.
- `two:claude-sonnet-5-5`: 11 of 12 (92%) read; 0 reading(s) not legal for the position; 0 of 2 control(s) rolled.

## Against the switch criteria

The one reader against the two on the same model, by the scope's section 8.2 (computed from the tables above; a criterion with nothing measured is open). A one-line difference is not a finding.

### `one:claude-sonnet-5-5` against `two:claude-sonnet-5-5` — switch

| # | Criterion | Holds | Measured |
|---|---|---|---|
| 1 | lines wanting a move | yes | read 110 of 112 against 104 of 112; no family fell by more than two |
| 2 | controls offered or rolled a move | yes | 0 of 40 against 8 of 40 |
| 3 | another move rolled or offered | yes | 0 against 5 |
| 4 | issue #383's kinds, each as wanted in three readings of four | yes | worth 4 of 4; trust 4 of 4; named-after-run 4 of 4; claim-supported 4 of 4; claim-refuted 4 of 4 |
| 5 | fights | yes | read 12 of 12 against 11 of 12; 0 not legal for the position; 0 control(s) rolled |
| 6 | time: a rolled line 1 s faster, a narrated one no more than 0.3 s slower | yes | rolled 2.03 s against 5.19 s; narrated 1.36 s against 1.76 s |
| 7 | cost: a line no dearer (the whole spend a line) | yes | $0.0054 against $0.0065 a line; the median line $0.0053 against $0.0040 |
| 8 | the dials hold: the rolled share within 10 points | yes | 62% (53 of 86) against 70% (56 of 80) |
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
- **No arm thinks first.** The readers turn thinking off, each model in its own form (`one:claude-sonnet-5-5`: between_tools), and each model answers at its own default effort; a reader allowed to think, or set to another effort, might read differently.

