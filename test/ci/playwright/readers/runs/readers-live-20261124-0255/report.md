# The readers on plain lines — readers-live-20261124-025539

A live run, 2026-11-24T02:55:39.879Z, at commit `ddc4b40de107`: 55 line(s), read 2 time(s) each by `claude-haiku-5-5` and `claude-sonnet-5-5` — 220 reading(s).

## What this run was to answer

1. Of plain in-fiction lines that set about a move, with no move named, how many do the two readers as shipped (Haiku 5.5) read right — the wanted move rolled, or offered on a button?
2. Which families fail (recovery, connection, vow, travel, action, fight entry), and how — narrated with nothing offered, or read as another move?
3. Of lines that should not be a move, how many are narrated plainly, with no move rolled or offered?
4. Does Sonnet 5.5 in both readers read more of them right, by how many lines — and where the two models differ, which reading is the right one?
5. What does a reading cost in time and money on each model?
6. Asked the same line twice, does a reader give the same reading (the live run made one wording four times and then only offered it)?

### The answers

1. **About four in five.** As shipped (Haiku 5.5 in both readers), 71 of 90 readings of a plain line that wanted a move got it: 49 rolled, 22 offered on a button. Of the other 19, 11 were narrated with nothing offered and 8 were rolled as another move (3 of those on purpose — Balanced Mischief).
2. **Recovery, travel and entering a fight are read every time; a vow's progress is not read at all.** Recovery 16 of 16 (12 of them offered, not rolled — the downtime dial is 1), travel 16 of 16, fight entry 6 of 6, action 16 of 20, connection 11 of 18, vow 6 of 14. The vow family's misses are one thing: **a step toward a vow said in the fiction is never read** — `progress-1`, `-2`, `-3`, six readings of six narrated with nothing offered ("the player states a conclusion… no action is attempted"). Swearing is read (4 of 4); "it is done", said outright, is read (`done-2`); handing the proof to the warden is read as Compel (`done-1`). The connection family's misses are a favour or a gift to a connection read as plain talk (`develop-1`, `-2`, `-3`: five of six nothing) and a refusal that strains the bond read as Compel (`test-2`).
3. **Three in four.** 15 of 20 control readings were narrated plainly; the other 5 were narrated with a move offered that nobody wanted (Develop Your Relationship for small talk, Compel for "say that again", Gather Information for a question already answered). None was rolled.
4. **Sonnet 5.5 reads six more of the ninety, picks the wrong move once where Haiku does eight times, and offers nothing unasked — and misses the same vow lines.** 77 of 90 (58 rolled, 19 offered); 1 another move; 12 nothing; controls 20 of 20. Where the two differ Sonnet is right on the favour and the gift (`develop-2`, `-3`), the strained bond (`test-2`), the escape under fire (`danger-2`: Haiku made it React Under Fire with no fight open, then an expedition) and `gather-1`, `advantage-2`; Haiku is right on `gear-1` (Sonnet narrated a search of the lockers with nothing offered, twice) and once on `gather-2`. **Of the 45 lines, 5 are read by neither model**: the three vow steps, `done-1`, and `develop-1` (trading news on the comm — which the rules may well call plain talk). So the model is about a third of it: of Haiku's 19 misreadings Sonnet mends 6 net, and the largest single hole is in what both are told to look for, not in which model looks.
5. **Sonnet costs about eighteen times as much and a second or two more.** For 110 readings each: Haiku $0.0375 (a third of a cent for ten lines), Sonnet $0.6699 (six cents for ten lines), by the price table in explore.config.json. A line's readings took 2.2 s at the median on Haiku (2.9 s at the 90th centile) and 3.5 s on Sonnet (5.2 s).
6. **Mostly.** Of 55 lines read twice, Haiku gave two different outcomes on 6 and Sonnet on 4. Four of Haiku's six flip between right and wrong (`develop-3`, `gather-1`, `advantage-2`, a control); one of Sonnet's four does (`gather-2`). The others are a roll one time and an offer the other.

### The reading

**Is the pain of naming moves a limit of Haiku?** Partly, and not mainly. A plain line is read right four times in five as shipped. What goes wrong divides in three:

- **What neither model reads — the rules the readers are given** (5 lines of 45; 20 of the 32 misreadings, both models together). A step toward a vow is a statement, and the pacing reader is asked whether an action is attempted with something at stake; it is also told nothing of the character's vows (the move reader is). "I now have proof…" was the live run's a71. This is the one to fix first, and a larger model does not fix it.
- **What Sonnet reads and Haiku does not** (6 readings net): favours to a connection, a strained bond, and which of two neighbouring moves a line is. Haiku also offers a move for plain talk one time in four.
- **What Haiku reads and Sonnet does not** (`gear-1`): one line.

**For the long haul's charter.** Its relationship beat asked for small favours and news traded on the comm; four readings of four call that plain talk on both models, and by the rules they may be right. The beat now asks for something that costs her or matters to the connection, and names its move after one unread line, not two (five marks would otherwise spend the run's action cap).

**Not tested here:** a line inside an open fight, a line after a run of rolls, a table of several characters, and any dial but a new world's. Each line was read on its own.


## How a line is scored

Each line has the reading it should get: one or more moves the rules allow, or no move (a control). A line is read by the pacing reader, and — when that calls it a move — by the move reader, exactly as the chat pipeline calls them; nothing is rolled or narrated.

- **rolled** — the pacing reader calls it a move and the move reader picks a wanted one: the roll dialog opens on the right move.
- **offered** — the line is narrated with a wanted move on the card's button: the pacing reader offered it, or it called a move, the move reader read none (or was unsure), and the move it had named is offered.
- **another move rolled** / **another move offered** — a move that is not one the line wants.
- **nothing** — narrated with no move offered: the player is left to ask for one.
- A control: **narrated** (right), **a move offered**, **a move rolled**.
- **reader failed** — a reader's call failed or its reply could not be read; not scored, and not in any rate.

**Rolled and offered both count as read**: either way the player gets the right move without naming it. Offered costs them a click, and the line is narrated first.

## Headline

| Arm | Lines wanting a move | Read | rolled | offered | Another move | Nothing | Controls right | Reader failed |
|---|---|---|---|---|---|---|---|---|
| `claude-haiku-5-5` | 90 | **71 of 90 (79%)** | 49 | 22 | 8 (8 rolled, 3 of them on purpose; 0 offered) | 11 | 15 of 20 (75%) | 0 |
| `claude-sonnet-5-5` | 90 | **77 of 90 (86%)** | 58 | 19 | 1 (1 rolled, 1 of them on purpose; 0 offered) | 12 | 20 of 20 (100%) | 0 |

Of the 45 line(s) wanting a move that every arm read: **32** every arm read right, **8** some did and some did not, **5** none did. A line no arm reads is not the model's doing alone; a line one arm reads and another does not is where the model matters.

## By family

| Family | `claude-haiku-5-5` | `claude-sonnet-5-5` |
|---|---|---|
| recovery | 16 of 16 (100%) read (4 rolled, 12 offered); 0 another move, 0 nothing | 16 of 16 (100%) read (3 rolled, 13 offered); 0 another move, 0 nothing |
| connection | 11 of 18 (61%) read (9 rolled, 2 offered); 2 another move, 5 nothing | 16 of 18 (89%) read (12 rolled, 4 offered); 0 another move, 2 nothing |
| vow | 6 of 14 (43%) read (4 rolled, 2 offered); 2 another move, 6 nothing | 6 of 14 (43%) read (6 rolled, 0 offered); 0 another move, 8 nothing |
| control | 15 of 20 (75%) narrated; 5 offered a move, 0 rolled | 20 of 20 (100%) narrated; 0 offered a move, 0 rolled |
| action | 16 of 20 (80%) read (11 rolled, 5 offered); 4 another move, 0 nothing | 17 of 20 (85%) read (17 rolled, 0 offered); 1 another move, 2 nothing |
| travel | 16 of 16 (100%) read (15 rolled, 1 offered); 0 another move, 0 nothing | 16 of 16 (100%) read (14 rolled, 2 offered); 0 another move, 0 nothing |
| fight entry | 6 of 6 (100%) read (6 rolled, 0 offered); 0 another move, 0 nothing | 6 of 6 (100%) read (6 rolled, 0 offered); 0 another move, 0 nothing |

## Where the arms differ

**`heal-2`** — recovery · wants Heal · context bleakhold-after-fight

> I find the station's medic and let her clean and stitch the burn on my arm.

- `claude-haiku-5-5` — **rolled**: the pacing reader calls it a move, naming Heal (downtime, 0.85) — “Player sets about treating a wound with a medic, a change to the character's sheet that only the heal move can make; the downtime dial is low, but explicit commitment to treatment calls for a move.”; the move reader makes it Heal — “Mira seeks out the station medic to treat her burn; receiving treatment from someone who is not an ally is +iron. The pacing read suggested heal, and that fits the explicit commitment to treatment.”
- `claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Heal (downtime, 0.90) — “Seeking medical care for a wound changes the character's sheet only via a move, so at the low downtime dial it is still offered heal rather than plain narration.”

**`resupply-1`** — recovery · wants Resupply · context bleakhold-after-fight · from run 2 a51

> I restock the ship at Bleakhold's market.

- `claude-haiku-5-5` — **rolled**: the pacing reader calls it a move, naming Resupply (downtime, 0.80) — “Player sets about restocking supplies, a move that changes the sheet, and the stores are nearly bare; downtime dial is 1 but the input commits to a concrete action with stakes, so resupply is offered as a move.”; the move reader makes it Resupply — “Mira goes to Bleakhold's market to restock a nearly bare locker. Resupply is a concrete downtime action with uncertain outcome and stakes (dealing with merchants, prices, availability), and the pacing read offers it. Heart fits a social approach to trading and bargaining for goods at a station market.”
- `claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Resupply (downtime, 0.90) — “Restocking low stores changes the character sheet only through a move, so it is always offered; the downtime dial of 1 keeps it from being forced as a MOVE.”

**`repair-2`** — recovery · wants Repair · context bleakhold-after-fight

> I suit up and go out on the hull to patch the plating the cutter opened.

- `claude-haiku-5-5` — **offered**: the pacing reader narrates it and offers Repair (downtime, 0.60) — “[low dial: an unsure move is offered, not rolled] Repairing the ship's damaged plating is an explicit repair action, but going out on the hull in a damaged, post-fight state carries real risk, so it is offered as a move at the downtime dial.”
- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Repair (downtime, 0.80) — “Player sets about repairing the damaged hull plating, which only the repair move can change on the sheet, so it is offered as a move despite the low downtime dial.”; the move reader makes it Repair — “Mira suits up to patch the hull plating the raider cutter's volley opened. That is fixing her vehicle, which is the Repair move. It is a hands-on technical job, so wits is the natural stat, and the very low supply makes supply a poor choice.”

**`develop-2`** — connection · wants Develop Your Relationship · context spire-stall · from run 2 a60, without its move name

> I offer to watch Tamsin's counter for an hour while she rests.

- `claude-haiku-5-5` — **nothing**: the pacing reader narrates it, with no move offered (social, 0.70) — “A kind offer to a connection with no roll-worthy risk at social dial 5 is plain conversation, not a move.”
- `claude-sonnet-5-5` — **offered** (its repeats: offered, rolled): the pacing reader narrates it and offers Develop Your Relationship (social, 0.60) — “A kind offer to Mira's connection Tamsin is relationship-deepening with no pressure or stakes yet, so offer develop_your_relationship rather than forcing a roll at the borderline social dial.”

**`develop-3`** — connection · wants Develop Your Relationship · context spire-stall

> I slide the salvage rights to the wreck I found off Vigil Reach across the counter. They are Tamsin's now, no charge, for everything she has done for me.

- `claude-haiku-5-5` — **nothing** (its repeats: nothing, rolled): the pacing reader narrates it, with no move offered (social, 0.80) — “A gift of salvage rights to a connection is a relationship gesture with nothing at risk and no roll needed; social dial is 5 and the speaker's connection is Tamsin, which only nudges toward a move if it tests or deepens the bond, and this is a gift rather than a pressing or testi”
- `claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Develop Your Relationship (social, 0.72) — “A freely given gift to a connection (Tamsin) with no reluctance or pressure reads as deepening the bond, so it is offered as a Develop Your Relationship opportunity rather than forced as a roll at a mid social dial.”

**`test-2`** — connection · wants Test Your Relationship · context spire-stall

> Tamsin wants the name of the trader who talked to me. I refuse her, because I gave him my word, and I hold to it even when I see what it costs me with her.

- `claude-haiku-5-5` — **another move rolled**: the pacing reader calls it a move, naming Compel (social, 0.80) — “Tamsin presses Mira for information she is reluctant to give, and Mira's refusal is a social stake involving a connection, which at social dial 5 with clear commitment and the speaker's connection at stake warrants a MOVE; the player is refusing rather than pressing, so the match”; the move reader makes it Compel (a misread on purpose, it says) — “Tamsin presses Mira for the name of her informant. Mira's refusal is a social stake involving a connection. The player is refusing rather than pressing, so this is the reverse of a compel. Taking the interpretation note into account, Mira is holding firm to her word, which reads as a heart-based stand against pressure. Using heart reflects her resolve and integrity, with the Tamsin connection at stake. This is a mischief reading: the refusal is treated as an attempt to hold Tamsin off, and heart is the stat that fits holding one's ground and standing on principle.”
- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Test Your Relationship (social, 0.80) — “Mira refuses her connection Tamsin to keep her word, knowingly straining the bond — a clear Test Your Relationship trigger at a social dial of 5.”; the move reader makes it Test Your Relationship — “Mira refuses Tamsin's request for the trader's name to keep her word, knowingly straining their bond with Tamsin, whose nephew is among the missing. The bond is tested by conflicting loyalties, so Test Your Relationship (+heart) fits. A neighbouring reading (Compel) was considered but Mira is the one resisting, not pressing, so the relationship test is the clearest.”

**`gather-1`** — action · wants Gather Information · context spire-stall · from run 2 a8

> I work the docks asking traders who saw the raiders last, pressing hard even though it may cost me Tamsin's trust and draw the wrong eyes.

- `claude-haiku-5-5` — **another move rolled** (its repeats: another move rolled, rolled): the pacing reader calls it a move, naming Compel (investigation, 0.80) — “Investigation dial 6 with explicit commitment to press traders for information at a risk to Tamsin's trust and attention, so a pressing move with stakes applies; compel fits pressing reluctant traders, though gather_information is a plausible alternative.”; the move reader makes it Compel (a misread on purpose, it says) — “Mira presses reluctant dock traders for what they saw of the raiders, a forceful push that risks Tamsin's trust. Interpreted as compel with iron for hard-edged pressure rather than heart's persuasion, a slightly unexpected but fitting stat choice for pressing hard.”
- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Gather Information (investigation, 0.82) — “Mira actively presses dock traders for information with stated stakes (Tamsin's trust, unwanted attention), which at investigation dial 6 with clear commitment is a Gather Information move.”; the move reader makes it Gather Information — “Mira is working the docks, questioning traders about who saw the raiders last. That is an investigation with stated risks, and Gather Information (+wits) fits best. The pressure applied to reluctant traders could read as Compel, but the aim is learning facts, not forcing an action.”

**`gather-2`** — action · wants Gather Information · context spire-stall

> I go down Tamsin's ledger line by line, hunting for whatever the three lost freighters had in common.

- `claude-haiku-5-5` — **rolled**: the pacing reader calls it a move, naming Gather Information (investigation, 0.85) — “Investigation dial is 6 with clear commitment to searching for answers in the ledger, so a gather_information roll is warranted.”; the move reader makes it Gather Information — “Mira is methodically combing Tamsin's ledger for a pattern linking the lost freighters, a classic investigation matching the pacing read. Wits fits careful, focused study of records.”
- `claude-sonnet-5-5` — **another move rolled** (its repeats: another move rolled, rolled): the pacing reader calls it a move, naming Gather Information (investigation, 0.85) — “Player actively studies the ledger to find what the lost freighters share — a clear investigative attempt with intent, at investigation dial 6.”; the move reader makes it Secure an Advantage (a misread on purpose, it says) — “The literal read is Gather Information (studying a ledger for a common thread). A slightly different angle: Mira is combing the ledger to find a pattern in the lost freighters, which is assessing the situation and building leverage for her vow to find the raiders. Secure an Advantage fits as a neighbouring adventure move, with wits as the stat for careful observation.”

**`none-which-ship`** — control · wants no move · context spire-stall

> I ask Tamsin to tell me again which of the three freighters Joss crewed.

_A question about what is already established._

- `claude-haiku-5-5` — **a move offered** (its repeats: a move offered, narrated): the pacing reader narrates it and offers Gather Information (investigation, 0.60) — “Asking a question of a connection is plain conversation at a moderate investigation dial, but the answer could matter, so the move is offered rather than forced.”
- `claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.90) — “A simple clarifying question to a connection about a detail already established; no pressure or stakes, so plain conversation.”

**`course-2`** — travel · wants Set a Course · context aboard-at-spire

> I cast off from the Spire and fly the marked lane out to Bleakhold Station.

- `claude-haiku-5-5` — **offered** (its repeats: offered, rolled): the pacing reader narrates it and offers Set a Course (exploration, 0.80) — “Travel to a charted place along a marked lane is a set_a_course journey; the raider threat on that route gives it stakes, but dial 6 with no explicit hazard named in the input keeps it as an offer rather than a forced roll.”
- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Set a Course (exploration, 0.80) — “The player commits to flying a known marked lane to a charted place (Bleakhold Station), which is Set a Course, and the exploration dial of 6 plus the raider-hit route makes the journey a risk.”; the move reader makes it Set a Course — “Mira is flying a known, marked lane to a charted place (Bleakhold Station) — a textbook Set a Course. The unnamed coordinates are not the destination, so this is not an expedition. The route is the one the raiders keep hitting, but the player is committing to a charted run, so supply is the stat.”

**`course-3`** — travel · wants Set a Course · context aboard-at-spire

> Vigil Reach is closer. I take the Kobayashi IV there along the old charted route to ask after the freighters.

- `claude-haiku-5-5` — **rolled**: the pacing reader calls it a move, naming Set a Course (exploration, 0.80) — “Player commits to travel along a known route to a charted place (Vigil Reach) with a stated goal, at a high exploration dial, so a set_a_course roll is warranted.”; the move reader makes it Set a Course — “Mira travels a known, charted route to a charted settlement (Vigil Reach) to ask about the freighters. Set a Course with supply fits the stated goal. Interpretation note permits a less obvious reading, but the literal reading is the most faithful here; mischief not applied.”
- `claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Set a Course (exploration, 0.80) — “Travel along a known charted route to a charted place (Vigil Reach) is set_a_course, but no hazard or time pressure is established, so it is offered rather than forced at a 6 dial.”

**`advantage-1`** — action · wants Secure an Advantage or Gather Information · context aboard-at-spire

> Before I cast off I spend an hour with the charts and the comm chatter, working out where a cutter would lie in wait along the Bleakhold run.

_Preparing for the run is Secure an Advantage; studying for an answer is Gather Information. Either is right._

- `claude-haiku-5-5` — **offered**: the pacing reader narrates it and offers Gather Information (investigation, 0.70) — “Player is actively searching charts and comm traffic for answers about raider ambush points, a dial-6 investigation with no immediate danger, so a gather_information move is available but not forced.”
- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Gather Information (investigation, 0.80) — “Player actively studies charts and comm chatter to deduce an ambush location, an investigation action with intent and stakes at a dial of 6.”; the move reader makes it Gather Information — “Mira studies charts and comm chatter to deduce where raiders would ambush along the Bleakhold run — an investigation with uncertain, meaningful results, rolled on wits. The less obvious secure_an_advantage reading (preparing before departure) was considered, but the line is about discovering information, so the literal reading stands.”

**`gear-1`** — action · wants Check Your Gear · context aboard-at-spire

> I dig through the lockers behind my seat for a spare signal flare. I will want one out in that drift.

- `claude-haiku-5-5` — **offered**: the pacing reader narrates it and offers Check Your Gear (downtime, 0.60) — “Searching lockers for a flare is a low-stakes preparation at a safe dock, so it is mostly narration, but confirming the gear could matter later and the category dial is low.”
- `claude-sonnet-5-5` — **nothing**: the pacing reader narrates it, with no move offered (downtime, 0.80) — “Searching her own cockpit lockers for a flare in safe dock has nothing at risk (everyday action), and the journey itself hasn't been set out on yet.”

**`done-1`** — vow · wants Fulfill Your Vow · context spire-reckoning

> I put the sealed ledger in Warden Marr's hands and tell her all of it: Corvin Hale bought the schedules, and Corvin Hale sent the cutters. The lanes' raider has a name now.

- `claude-haiku-5-5` — **another move rolled**: the pacing reader calls it a move, naming Compel (social, 0.80) — “Mira is pressing the warden with sealed proof to make her act on an accusation against a powerful harbourmaster, a clear social stake at social dial 5 with explicit commitment to the line.”; the move reader makes it Compel — “Mira presses Warden Marr with sealed proof to act on an accusation against a powerful harbourmaster. This is a social pressure move aimed at a reluctant authority figure, so compel fits. Heart is the stat for persuasion and appeal, since Mira is laying out evidence to win the warden over rather than threatening or deceiving her. The mischief option of reading this as the connection with Tamsin is tempting but the line is addressed to the warden, so I keep the compel reading.”
- `claude-sonnet-5-5` — **nothing**: the pacing reader narrates it, with no move offered (social, 0.82) — “Handing over the proof and reporting what happened to a waiting warden is plain telling, not pressing a reluctant party, so no roll is needed.”

**`done-2`** — vow · wants Fulfill Your Vow · context spire-reckoning

> It is done. I set out to learn who was raiding the Cinder Expanse lanes, and now I know, with proof. I say so aloud, to Tamsin and the warden both, and call the work finished.

- `claude-haiku-5-5` — **offered**: the pacing reader narrates it and offers Fulfill Your Vow (social, 0.70) — “The player declares a quest complete aloud, which is a progress move on an implied vow, but the vow's status and the speech's stakes are not explicit enough to force a roll, so the move is offered rather than required at this social dial.”
- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Fulfill Your Vow (investigation, 0.80) — “The player explicitly declares their vow to learn who was raiding the lanes complete, a clear commitment to resolving the quest, which is the fulfill_your_vow progress move.”; the move reader makes it Fulfill Your Vow — “Mira declares her vow to learn who was raiding the Cinder Expanse lanes finished, with proof laid before Tamsin and the warden. That is a progress move against the open vow. Forge a Bond is available with Tamsin, but the player explicitly frames the work as the vow being complete.”

**`none-quiet-crossing`** — control · wants no move · context spire-reckoning

> I tell Tamsin the crossing back from Bleakhold was quiet, for once.

_Small talk with a connection whose relationship track is full._

- `claude-haiku-5-5` — **a move offered**: the pacing reader narrates it and offers Develop Your Relationship (social, 0.60) — “Plain conversational reassurance to a connection at social dial 5, with the relationship mildly tested but no clear stakes or outcome in doubt.”
- `claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.88) — “Mira is telling her connection about the quiet crossing, which is plain conversation with nothing pressed, tested or at risk.”

**`gather-3`** — action · wants Gather Information · context bleakhold-clerk

> While Roe sweats, I go through the unlocked drum of outbound manifests looking for every sailing that was passed along.

- `claude-haiku-5-5` — **offered** (its repeats: rolled, offered): the pacing reader narrates it and offers Gather Information (investigation, 0.80) — “Searching the manifests is a deliberate investigative action with uncertain results at investigation dial 6, but the outcome is not yet under real pressure, so a move is offered rather than forced.”
- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Gather Information (investigation, 0.82) — “Mira actively searches the unlocked manifest drum for specific answers while Roe is rattled, and with investigation at dial 6 this clear action with stakes triggers gather_information.”; the move reader makes it Gather Information — “Mira is searching the unlocked manifest drum for specific sailings that were passed to the raiders, while Roe is rattled. This is a straightforward investigation of records, which is Gather Information rolled with wits.”

**`none-say-again`** — control · wants no move · context bleakhold-clerk

> I ask Roe to say again how often the man comes to the cargo lock.

_A question about what he has already said._

- `claude-haiku-5-5` — **a move offered**: the pacing reader narrates it and offers Compel (investigation, 0.60) — “Asking Roe to repeat a detail is mostly a question with no clear stakes at investigation dial 6, though pressing a reluctant clerk could warrant compel.”
- `claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.85) — “A plain clarifying question to a cooperating NPC who just stated the answer; no pressure or stakes, so talking is narration.”

**`advantage-2`** — action · wants Secure an Advantage · context ashfall-drift

> Before I commit to that gap I hold position and time the tumble of the debris, looking for the rhythm in it.

- `claude-haiku-5-5` — **another move rolled** (its repeats: another move rolled, rolled): the pacing reader calls it a move, naming Gather Information (exploration, 0.80) — “Deliberate study of debris rhythm to find a safe passage through a hazard is a committed investigative action with stakes, and exploration dial is 6 with clear intent, so a MOVE fits.”; the move reader makes it Gather Information — “Mira deliberately studies the tumble of the debris to find a safe passage through the gap, a committed investigative action with real stakes. Gather Information with wits fits the pacing hint, and the expedition is already underway so no new expedition is opened.”
- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Secure an Advantage (exploration, 0.82) — “The player takes deliberate preparatory action (holding position, timing the debris) to gain an edge before facing a hazard, at an exploration dial of 6 with clear intent and stakes.”; the move reader makes it Secure an Advantage — “Mira holds position and studies the debris tumble to find its rhythm before committing to the gap. This is deliberate preparation to gain an edge before a hazard, driven by observation and pattern-reading, so Secure an Advantage with wits.”

**`danger-2`** — action · wants Face Danger or Enter the Fray · context lane-ambush

> I slam the throttle open and dive for the dead freighter's cargo cloud to lose her.

_Running from an imminent threat is Face Danger; a table may as rightly open a fight whose objective is to get away. Either is right._

- `claude-haiku-5-5` — **another move rolled**: the pacing reader calls it a move, naming React Under Fire (combat, 0.85) — “Combat is active with an armed cutter, and the player describes an evasive maneuver with stakes, so it is an attempt, not a free outcome, and the Kobayashi is in a bad spot reacting to fire.”; the move reader makes it React Under Fire — “Mira dives the Kobayashi into the spilled cargo cloud to break line of sight while under fire from the Cinder Wren; a fast evasive maneuver calls for edge. Pacing read matched, so no mischief applied.”
- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Face Danger (combat, 0.90) — “Mira acts with clear intent and stakes, evading an armed raider cutter under fire; the player's stated result (losing her) is only the desired outcome, so the roll decides.”; the move reader makes it Face Danger — “Mira is making a risky, fast evasive dive through a debris cloud under fire from an armed cutter. The goal is to escape rather than fight, so Face Danger fits, and speed and piloting agility point to edge. The stage's face_danger read holds; with no formal combat position established, the unexpected-interpretation option offers no better-fitting neighbouring move, so none is applied.”

## Lines no arm read

**`progress-3`** — vow · wants Reach a Milestone · context bleakhold-after-fight

> The cutter that jumped me is scrap, and she was one of theirs. That is one raider fewer on the lanes, and a long stride toward finding who sends them.

- `claude-haiku-5-5` — **nothing**: the pacing reader narrates it, with no move offered (downtime, 0.70) — “The player reflects on the defeated raider and draws a conclusion without attempting any action with stakes; the scene is safe, so this is pure narration at a low downtime dial.”
- `claude-sonnet-5-5` — **nothing**: the pacing reader narrates it, with no move offered (investigation, 0.88) — “The player is reflecting on the already-resolved fight and stating a goal, with no character action or attempt toward an outcome, so it is internal monologue rather than a move.”

**`develop-1`** — connection · wants Develop Your Relationship · context aboard-at-spire · from run 2 a59, without its move name

> I raise Tamsin on the comm and trade news with her, asking how the docks have been.

_The run's charter took this for the move; read strictly it is close to plain talk, so a reading of no move is the least surprising miss in the list._

- `claude-haiku-5-5` — **nothing**: the pacing reader narrates it, with no move offered (social, 0.80) — “Plain conversation with a connection (Tamsin) asking about news carries no stakes, and talking is not a move, so it stays narrative despite the social dial of 5.”
- `claude-sonnet-5-5` — **nothing**: the pacing reader narrates it, with no move offered (social, 0.90) — “Opening a comm channel and asking a connection about dock news is plain conversation with no pressure or stakes; no move is triggered.”

**`done-1`** — vow · wants Fulfill Your Vow · context spire-reckoning

> I put the sealed ledger in Warden Marr's hands and tell her all of it: Corvin Hale bought the schedules, and Corvin Hale sent the cutters. The lanes' raider has a name now.

- `claude-haiku-5-5` — **another move rolled**: the pacing reader calls it a move, naming Compel (social, 0.80) — “Mira is pressing the warden with sealed proof to make her act on an accusation against a powerful harbourmaster, a clear social stake at social dial 5 with explicit commitment to the line.”; the move reader makes it Compel — “Mira presses Warden Marr with sealed proof to act on an accusation against a powerful harbourmaster. This is a social pressure move aimed at a reluctant authority figure, so compel fits. Heart is the stat for persuasion and appeal, since Mira is laying out evidence to win the warden over rather than threatening or deceiving her. The mischief option of reading this as the connection with Tamsin is tempting but the line is addressed to the warden, so I keep the compel reading.”
- `claude-sonnet-5-5` — **nothing**: the pacing reader narrates it, with no move offered (social, 0.82) — “Handing over the proof and reporting what happened to a waiting warden is plain telling, not pressing a reluctant party, so no roll is needed.”

**`progress-1`** — vow · wants Reach a Milestone · context bleakhold-clerk · from run 2 a71, without its rules word

> I now have proof the raids are fed by dock clerks selling cargo routes.

- `claude-haiku-5-5` — **nothing**: the pacing reader narrates it, with no move offered (investigation, 0.70) — “The player states a conclusion they have reached from the evidence already on the desk; no action is attempted against an obstacle or outcome in doubt, so it reads as narration, though the second ledger and the cargo lock remain open for a later gather_information.”
- `claude-sonnet-5-5` — **nothing**: the pacing reader narrates it, with no move offered (investigation, 0.85) — “The player states a conclusion drawn from Roe's admission with no character action or stakes, so there is nothing to roll.”

**`progress-2`** — vow · wants Reach a Milestone · context bleakhold-clerk

> That is the link I was missing: the schedules leave this office, and the cutters are waiting where they say. I am a real step closer to whoever is behind the raids.

- `claude-haiku-5-5` — **nothing**: the pacing reader narrates it, with no move offered (investigation, 0.80) — “The player states a deduction and a realization about the raids without any character action or attempt with stakes, so it is pure narration at investigation dial 6.”
- `claude-sonnet-5-5` — **nothing**: the pacing reader narrates it, with no move offered (investigation, 0.80) — “The player voices a conclusion and internal realization about the clue with no new character action or stakes; no roll is warranted despite the investigation dial.”

## Controls read as a move

**`none-which-ship`** — control · wants no move · context spire-stall

> I ask Tamsin to tell me again which of the three freighters Joss crewed.

_A question about what is already established._

- `claude-haiku-5-5` — **a move offered** (its repeats: a move offered, narrated): the pacing reader narrates it and offers Gather Information (investigation, 0.60) — “Asking a question of a connection is plain conversation at a moderate investigation dial, but the answer could matter, so the move is offered rather than forced.”
- `claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.90) — “A simple clarifying question to a connection about a detail already established; no pressure or stakes, so plain conversation.”

**`none-quiet-crossing`** — control · wants no move · context spire-reckoning

> I tell Tamsin the crossing back from Bleakhold was quiet, for once.

_Small talk with a connection whose relationship track is full._

- `claude-haiku-5-5` — **a move offered**: the pacing reader narrates it and offers Develop Your Relationship (social, 0.60) — “Plain conversational reassurance to a connection at social dial 5, with the relationship mildly tested but no clear stakes or outcome in doubt.”
- `claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.88) — “Mira is telling her connection about the quiet crossing, which is plain conversation with nothing pressed, tested or at risk.”

**`none-say-again`** — control · wants no move · context bleakhold-clerk

> I ask Roe to say again how often the man comes to the cargo lock.

_A question about what he has already said._

- `claude-haiku-5-5` — **a move offered**: the pacing reader narrates it and offers Compel (investigation, 0.60) — “Asking Roe to repeat a detail is mostly a question with no clear stakes at investigation dial 6, though pressing a reluctant clerk could warrant compel.”
- `claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.85) — “A plain clarifying question to a cooperating NPC who just stated the answer; no pressure or stakes, so talking is narration.”

## Self-consistency

A line read more than once by the same arm: did its repeats come to the same thing?

- `claude-haiku-5-5`: 49 of 55 (89%) line(s) came out the same every time. Not the same: `develop-3` (nothing, rolled); `gather-1` (another move rolled, rolled); `none-which-ship` (a move offered, narrated); `course-2` (offered, rolled); `gather-3` (rolled, offered); `advantage-2` (another move rolled, rolled).
- `claude-sonnet-5-5`: 51 of 55 (93%) line(s) came out the same every time. Not the same: `hearten-1` (offered, rolled); `connect-2` (rolled, offered); `develop-2` (offered, rolled); `gather-2` (another move rolled, rolled).

## Cost and time

| Arm | Calls (pacing + move) | Input | Cache read | Cache write | Output | Cost | Pacing reader, median | Move reader, median | A line, median / p90 |
|---|---|---|---|---|---|---|---|---|---|
| `claude-haiku-5-5` | 167 (110 + 57) | 115722 | 860270 | 0 | 34662 | $0.0375 | 0.8 s | 1.9 s | 2.2 s / 2.9 s |
| `claude-sonnet-5-5` | 169 (110 + 59) | 117190 | 871670 | 0 | 34837 | $0.6699 | 1.8 s | 3.1 s | 3.5 s / 5.2 s |

Total: $0.7074, by the price table in explore.config.json (computed from each reply's usage, not billed from it).

## What this test does not show

- **Nothing is rolled or narrated.** A line counted as rolled is one whose roll dialog would open on the right move; the stat, the stakes, the dice and the narration are not looked at.
- **The wanted readings are one reader's reading of the rules.** Where the rules allow two moves the list accepts both; a line whose reading is arguable was left out, and a note on a line says where it is close.
- **A few readings of a line are a small sample** of a reader that does not always answer alike: a line read right four times in five shows here as right or as wrong. READERS_REPEATS measures it.
- **About fifty lines, a handful to a move.** A family's rate rests on three to ten lines; a difference of one line between arms is not a finding.
- **The scenes are written by hand**: one or two paragraphs of narration, with a matching scene frame, where a table has up to three cards with the player's own lines among them — and none of the drift a long session leaves in a scene.
- **One character, alone, with one connection and one vow**, at the pacing and mischief dials a new world has (mischiefDial balanced, enabled true, densityWindow 5, combat 9, investigation 6, exploration 6, social 5, downtime 1). No fight is open in any context: the readers' rules for an open fight are not exercised.
- **The sheet does not reach the readers.** Neither prompt is told the character's health, spirit, supply or the ship's integrity, nor how far a vow has come; a context says so only in its narration (not set in the world: health, spirit, supply, integrity, vow.ticks, tracks[].ticks).
- **Each line is read on its own**: the count of recent moves is cleared before every reading, so a line never follows a run of rolls.
- **Only the model changes between arms.** Each arm reads the same prompts, written for the first; a prompt tuned to another model might read differently.
- **No arm thinks first.** The readers turn thinking off, each model in its own form (`claude-haiku-5-5`: disabled; `claude-sonnet-5-5`: between_tools), and each model answers at its own default effort; a reader allowed to think, or set to another effort, might read differently.

