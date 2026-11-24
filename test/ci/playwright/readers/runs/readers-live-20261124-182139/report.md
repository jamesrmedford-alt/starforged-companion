# The readers on plain lines — readers-live-20261124-182139

A live run, 2026-11-24T18:21:39.130Z, at commit `4c7f3e1f5f70`: 60 line(s), read 1 time(s) each by `claude-sonnet-5-5` and `claude-haiku-5-5` — 120 reading(s).

## What this run was to answer

1. With both readers on Sonnet 5.5 as now shipped, and the reader fixes in: of plain lines that want a move, how many are read right — rolled as it or offered it? (Before the fixes: 77 of 90 on Sonnet, 71 on Haiku.)
2. Is a step toward a vow said in the fiction now at least offered Reach a Milestone? (Before: narrated with nothing offered, twelve readings of twelve.)
3. Is a recovery move with nothing to recover left as plain narration, and one with something to recover still offered or rolled?
4. Is a favour or a gift to a connection now offered Develop Your Relationship, with small talk and news still narrated?
5. Are the lines that want no move still narrated with nothing offered? (Before: 20 of 20 on Sonnet, 15 of 20 on Haiku.)
6. What does a line's reading cost in time and money as shipped?

### The answers

1. **Nine in ten.** With both readers on Sonnet 5.5 as shipped and the reader fixes in, 43 of 46 plain lines that wanted a move got it: 26 rolled, 17 offered on a button. The other three: `done-1` offered Reach a Milestone where Fulfill Your Vow was wanted (the line hands over the proof *and* says the raider has a name — a step, read as a step), and `course-2` (Set a Course) and `gear-1` (Check Your Gear) narrated with nothing offered. Before the fixes: 77 of 90 readings (86%) on Sonnet, 71 of 90 (79%) on Haiku. This run reads each line once (the first read each twice), so it is 46 lines against 45; the rate is the comparison. Haiku, given the same fixed prompts, read 38 of 46 (83%) — eight times another move, mostly in the connection family (5 of 9).
2. **Yes — every time.** `progress-1` to `progress-4` were offered Reach a Milestone on both models, eight readings of eight; before, twelve readings of twelve were narrated with nothing offered. The reason given is the new rule's own ("a real step toward the open vow… attempting nothing with stakes, so offer reach_a_milestone rather than plain narration").
3. **Yes, both ways.** With nothing to recover — `none-heal-whole` (the run's own medkit line at 5 health of 5) and `none-hearten-whole` (a quiet cup of tea at 5 spirit) — both were narrated plainly on both models. With something to recover, all eight recovery lines were offered (Sonnet: 8 offered, 0 rolled — the downtime dial is 1, so an offer is the rule; Haiku rolled three).
4. **Yes.** The three favours to a connection (`develop-2` minding her counter, `develop-3` salvage rights, `develop-4` bringing her what she needs) were offered Develop Your Relationship on both models (before: Haiku narrated three of four). News traded on the comm (`develop-1`, now a control) was narrated plainly on both.
5. **All of them, on Sonnet.** 14 of 14 controls narrated with nothing offered (before: 20 of 20). Haiku offered Gather Information once (`none-say-again`, a question about what the clerk had already said) — 13 of 14 (before: 15 of 20).
6. **About two-thirds of a cent and two seconds a line.** Sonnet: $0.4102 for 60 lines (86 calls: 60 pacing, 26 move), $0.0068 a line, by the price table in explore.config.json; the pacing reader's median 1.3 s, the move reader's 3.0 s, a line 2.0 s at the median and 4.8 s at the 90th percentile. Haiku: $0.0219 ($0.0004 a line) and 0.9 s / 2.7 s — Sonnet costs about nineteen times as much and a second more a line.

### The reading

The rules the first run showed missing — a step toward a vow, a favour to a connection, a recovery with nothing to recover, all told against the character's sheet — are what moved the most: the vow family from 6 of 14 to 7 of 8 (the one miss a near one), connection 9 of 9, recovery right both ways, and no control offered a move. The model matters less than it did: with the same prompts Haiku now reads 83%, Sonnet 93%; Sonnet's edge is in the connection family and in never offering a move unasked. Two lines are still left with nothing (`course-2`, `gear-1` — one each), and a vow's end said with the proof in hand is still read as a step.

**Not tested here** (as before): a line inside an open fight, a line after a run of rolls, a table of several characters, any dial but a new world's. Each line was read once and on its own.

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
| `claude-sonnet-5-5` | 46 | **43 of 46 (93%)** | 26 | 17 | 1 (0 rolled; 1 offered) | 2 | 14 of 14 (100%) | 0 |
| `claude-haiku-5-5` | 46 | **38 of 46 (83%)** | 18 | 20 | 8 (5 rolled, 1 of them on purpose; 3 offered) | 0 | 13 of 14 (93%) | 0 |

Of the 46 line(s) wanting a move that every arm read: **36** every arm read right, **9** some did and some did not, **1** none did. A line no arm reads is not the model's doing alone; a line one arm reads and another does not is where the model matters.

## By family

| Family | `claude-sonnet-5-5` | `claude-haiku-5-5` |
|---|---|---|
| recovery | 8 of 8 (100%) read (0 rolled, 8 offered); 0 another move, 0 nothing | 8 of 8 (100%) read (3 rolled, 5 offered); 0 another move, 0 nothing |
| connection | 9 of 9 (100%) read (5 rolled, 4 offered); 0 another move, 0 nothing | 5 of 9 (56%) read (1 rolled, 4 offered); 4 another move, 0 nothing |
| vow | 7 of 8 (88%) read (3 rolled, 4 offered); 1 another move, 0 nothing | 6 of 8 (75%) read (1 rolled, 5 offered); 2 another move, 0 nothing |
| control | 14 of 14 (100%) narrated; 0 offered a move, 0 rolled | 13 of 14 (93%) narrated; 1 offered a move, 0 rolled |
| action | 9 of 10 (90%) read (9 rolled, 0 offered); 0 another move, 1 nothing | 8 of 10 (80%) read (6 rolled, 2 offered); 2 another move, 0 nothing |
| travel | 7 of 8 (88%) read (6 rolled, 1 offered); 0 another move, 1 nothing | 8 of 8 (100%) read (4 rolled, 4 offered); 0 another move, 0 nothing |
| fight entry | 3 of 3 (100%) read (3 rolled, 0 offered); 0 another move, 0 nothing | 3 of 3 (100%) read (3 rolled, 0 offered); 0 another move, 0 nothing |

## Where the arms differ

**`heal-1`** — recovery · wants Heal · context bleakhold-after-fight · from run 2 a49

> I treat my wounds with the ship's medkit.

- `claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Heal (downtime, 0.85) — “Treating wounds is a recovery action only a move changes; Health is 3 of 5, so there is something to heal, and the downtime dial is low, so offer heal rather than force the roll.”
- `claude-haiku-5-5` — **rolled**: the pacing reader calls it a move, naming Heal (downtime, 0.80) — “Health is 3 of 5 and Mira is wounded, so there is a real wound to treat and the heal recovery move applies; the dial is 1/10 but the input is a clear character action on a recovery need.”; the move reader makes it Heal — “Mira is tending her own wounds with the ship's medkit. Health is 3 of 5 and she is wounded, so the recovery move applies. Self-treatment uses the lower of iron or wits; iron is the stronger stat for a physical wound, so the module resolves it as iron or wits, whichever is lower. The pacing read's dial note is a hint only and is not used to alter the stat. Health is not full, so this is a real need, not nothing to recover.”

**`heal-2`** — recovery · wants Heal · context bleakhold-after-fight

> I find the station's medic and let her clean and stitch the burn on my arm.

- `claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Heal (downtime, 0.85) — “Seeking a medic to treat a burn is a recovery action in genuine safety, and Health is 3 of 5, so there is something to heal; at the downtime dial of 1 it is offered rather than forced.”
- `claude-haiku-5-5` — **rolled**: the pacing reader calls it a move, naming Heal (downtime, 0.85) — “The player seeks medical care for a wound while Health is 3 of 5 and the character is wounded, so heal applies; the downtime dial is low but the explicit care action with a real wound makes a move appropriate.”; the move reader makes it Heal — “Mira seeks medical treatment from a station medic (not an ally) for a real burn wound, and Health is 3 of 5 with the character wounded, so Heal applies. Receiving treatment from someone else rolls +iron, the stat used here.”

**`resupply-1`** — recovery · wants Resupply · context bleakhold-after-fight · from run 2 a51

> I restock the ship at Bleakhold's market.

- `claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Resupply (downtime, 0.90) — “Restocking supplies at a market is a recovery action, and Supply is 2 of 5 with bare stores, so resupply is offered even at a low downtime dial.”
- `claude-haiku-5-5` — **rolled**: the pacing reader calls it a move, naming Resupply (downtime, 0.80) — “Supply is 2 of 5 and the character is unprepared, so restocking is a recovery move with something to recover, and the player is actively setting about it; with downtime dial at 1 this is offered rather than forced, but the explicit action warrants a roll.”; the move reader makes it Resupply — “Supply is 2 of 5 and the character is unprepared, so restocking the ship is a resupply with something to recover. The market is a purchasing approach; the pacing read suggests the roll is warranted. The stat is set by the approach: Mira is shopping and bargaining through the market rather than forcing or sneaking, so wits fits the careful sourcing of supplies, though heart would suit haggling. Stat kept as wits pending the module's ruling; statValue filled in by the calling code.”

**`connect-2`** — connection · wants Make a Connection · context bleakhold-after-fight

> Oren Halvard did me a kindness with that berth fee. I find him at the end of his shift, stand him a drink, and set about earning a lasting place in his good books.

- `claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Make a Connection (social, 0.80) — “Mira deliberately sets out to build a lasting relationship with Oren Halvard, who is not among her connections, so make_a_connection is the fit; at social dial 5 with a warm, stakes-free approach, offering it beats forcing a roll.”
- `claude-haiku-5-5` — **another move rolled**: the pacing reader calls it a move, naming Develop Your Relationship (social, 0.60) — “Oren is not a listed connection and the line is a deliberate, costing effort to build a relationship with an NPC, which is make_a_connection-adjacent but the stated aim of a lasting place in his good books points to a deliberate relationship-building move at dial 5.”; the move reader makes it Develop Your Relationship — “Oren is not a listed connection, so this is not develop_your_relationship on an existing bond. The line is a deliberate, costly act for him (buying a drink, time at the end of his shift) aimed at building standing with a new NPC. The pacing read suggested a relationship-building move; make_a_connection (heart) fits best as the NPC is new, and it is a rolled move. Mischief-free reading chosen since the request is a plain relationship move.”

**`test-1`** — connection · wants Test Your Relationship · context spire-stall

> I tell Tamsin straight that I am breaking my word to her: I promised to be back before the next tide of cargo, and I won't be.

- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Test Your Relationship (social, 0.78) — “The player tells a connection (Tamsin) they are breaking a promise to her, which strains the relationship and puts it at stake, so this is a Test Your Relationship move.”; the move reader makes it Test Your Relationship — “Mira openly admits to Tamsin that she is breaking a promise, which strains their bond and puts the relationship at stake. Test Your Relationship (+heart) fits, and the pacing read agrees. Mischief not applied: the literal reading is also the best fit.”
- `claude-haiku-5-5` — **offered**: the pacing reader narrates it and offers Test Your Relationship (social, 0.70) — “A confession that breaks a promise to a connection tests and strains the relationship, which is a social move at a 5/10 dial, offered rather than forced.”

**`test-2`** — connection · wants Test Your Relationship · context spire-stall

> Tamsin wants the name of the trader who talked to me. I refuse her, because I gave him my word, and I hold to it even when I see what it costs me with her.

- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Test Your Relationship (social, 0.80) — “Mira refuses her connection Tamsin to keep her word to another, with the cost to the relationship explicitly at stake, which fits test_your_relationship.”; the move reader makes it Test Your Relationship — “Mira refuses her connection Tamsin's request to keep her word to another, with the strain on their relationship explicitly at stake. That is a test of the bond, rolled with +heart. A miss-heavy compel reading doesn't fit, since Mira is the one being pressed, not pressing.”
- `claude-haiku-5-5` — **another move rolled**: the pacing reader calls it a move, naming Compel (social, 0.80) — “Tamsin presses Mira for information she is reluctant to give, and Mira refuses at a social dial of 5 with a bonded-track connection at stake, so a line that pits the two against each other is a clear social test; compel fits the pressure Tamsin applies, though the refusal itself”; the move reader makes it Compel — “Tamsin presses Mira for the trader's name, which Mira refuses to give. The pacing read frames this as Tamsin's pressure on Mira, so the move is compel on Tamsin's side of the exchange; the refusal itself is Mira holding firm, but it is the social test that matters. Mira's refusal is her own choice and no roll is needed for it, so the move is attributed to the pressure Tamsin applies. Heart fits a social pressure play. Interpretation chosen as compel rather than NO MOVE because the line pits Mira's word against Tamsin's need in a bonded-track connection, which is a real social test.”

**`swear-1`** — vow · wants Swear an Iron Vow · context spire-stall

> I draw my knife, lay my palm flat on the blade, and tell Tamsin I will bring Joss home.

- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Swear an Iron Vow (social, 0.88) — “A ritual oath to bring Joss home is the explicit commitment of an iron vow, so the move is invoked.”; the move reader makes it Swear an Iron Vow — “Mira ritually swears on her blade to bring Tamsin's nephew Joss home from the overdue Lark's Tithe. It is an explicit, solemn commitment to a new quest, the exact trigger for Swear an Iron Vow, which rolls +heart. It is a new vow, distinct from her open vow about the Cinder Expanse raiders.”
- `claude-haiku-5-5` — **another move rolled**: the pacing reader calls it a move, naming Compel (social, 0.70) — “Mira makes a bold, stakeful promise to a connection, pressing her commitment on Tamsin under a social dial of 5 with the speaker's connection at stake, so it is a compel-style line rather than plain talk.”; the move reader makes it Compel — “Mira presses a bold, stakeful promise on Tamsin, a reluctant connection, to commit to a course of action. Heart fits a persuasive, emotional appeal; the knife-and-palm gesture is a sworn pledge meant to move Tamsin to trust her with the search. Mischief not applied: the pacing read's compel reading holds.”

**`course-1`** — travel · wants Set a Course · context aboard-at-spire · from run 2 a20

> I plot the course and take the Kobayashi IV to Bleakhold Station.

- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Set a Course (exploration, 0.80) — “Mira commits to a journey to a charted place (Bleakhold Station) along a known marked lane the raiders keep hitting, so the hazard makes it a set_a_course move at exploration dial 6.”; the move reader makes it Set a Course — “Mira is flying to Bleakhold Station, a named, charted destination along a known marked lane. That fits Set a Course (roll +supply), not an expedition into uncharted space. The raider danger on the lane gives the journey stakes. The unnamed coordinates are a separate lead she did not choose here.”
- `claude-haiku-5-5` — **offered**: the pacing reader narrates it and offers Set a Course (exploration, 0.80) — “Travel toward a charted destination (Bleakhold Station) with no established hazard or explicit time pressure in the scene, so a known-route set_a_course is offered rather than forced.”

**`course-2`** — travel · wants Set a Course · context aboard-at-spire

> I cast off from the Spire and fly the marked lane out to Bleakhold Station.

- `claude-sonnet-5-5` — **nothing**: the pacing reader narrates it, with no move offered (exploration, 0.72) — “A journey along a known marked lane to a charted place (Bleakhold Station) with no hazard or time pressure established in the scene, so it resolves as narration.”
- `claude-haiku-5-5` — **offered**: the pacing reader narrates it and offers Set a Course (exploration, 0.80) — “Travel toward a charted destination (Bleakhold Station) along a known route, with a hazard-prone raider-infested lane, is a set_a_course move offered at a mid-range exploration dial rather than a clear high-stakes commitment.”

**`advantage-1`** — action · wants Secure an Advantage or Gather Information · context aboard-at-spire

> Before I cast off I spend an hour with the charts and the comm chatter, working out where a cutter would lie in wait along the Bleakhold run.

_Preparing for the run is Secure an Advantage; studying for an answer is Gather Information. Either is right._

- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Gather Information (investigation, 0.80) — “Mira commits to studying charts and comm chatter to locate a raider ambush site, an investigative action with stakes at investigation dial 6 and no recent moves.”; the move reader makes it Gather Information — “Mira studies charts and comm chatter to deduce where a raider cutter would ambush along the Bleakhold run. This is an investigation with an uncertain, meaningful outcome, so Gather Information +wits fits. The pacing read agrees, and no more dramatic neighbouring move fits this line without forcing it.”
- `claude-haiku-5-5` — **offered**: the pacing reader narrates it and offers Gather Information (investigation, 0.80) — “Active investigative effort to deduce raider ambush points with uncertain outcome, but at the investigation dial of 6 and no immediate threat or stakes, it is offered rather than forced.”

**`gear-1`** — action · wants Check Your Gear · context aboard-at-spire

> I dig through the lockers behind my seat for a spare signal flare. I will want one out in that drift.

- `claude-sonnet-5-5` — **nothing**: the pacing reader narrates it, with no move offered (exploration, 0.80) — “Digging through a ship's locker for a flare is an everyday action with nothing at risk, and Supply is not depleted; no move is needed.”
- `claude-haiku-5-5` — **offered**: the pacing reader narrates it and offers Check Your Gear (exploration, 0.70) — “Searching lockers for a specific item is a check_your_gear-style action with uncertain outcome, while the drift intent is future planning and no hazard is engaged yet.”

**`bond-1`** — connection · wants Forge a Bond · context spire-reckoning

> Tamsin, will you stand with me for good, whatever comes?

- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Forge a Bond (social, 0.80) — “Mira asks her connection Tamsin, whose relationship track is full with no bond yet, to commit for good — a bond at stake, social dial 5, and the speaker's connection raises the lean to MOVE.”; the move reader makes it Forge a Bond — “Mira asks Tamsin to commit for good, whatever comes. Her relationship track is full (10 of 10) with no bond forged yet, so this is the moment to cement the bond. Forge a Bond is a progress move against the connection's track. The line is a sincere, direct commitment; there's no more dramatically interesting neighbouring reading that stays faithful to it, so no mischief applied.”
- `claude-haiku-5-5` — **another move rolled**: the pacing reader calls it a move, naming Make a Connection (social, 0.80) — “Pressing a bonded-track relationship with a connection at social dial 5 with a clear commitment to forge a deeper bond is a relationship-testing/deepening moment; the speaker's connection Tamsin is already on the sheet, so the bond move that fits is develop_your_relationship rath”; the move reader makes it Develop Your Relationship (a misread on purpose, it says) — “Mira presses Tamsin for a lasting commitment, deepening a connection that is already full on its relationship track. The connection is not yet bonded, so develop_your_relationship applies with no roll; the forging of the bond itself comes later. Pacing read noted; choosing the neighbouring move that fits the bond-deepening, since the sheet shows no open bond to forge yet.”

**`bond-2`** — connection · wants Forge a Bond · context spire-reckoning

> I cover Tamsin's hand with mine on the ledger and tell her she is kin to me now. Not a broker, not a contact: kin. And I mean it to hold.

- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Forge a Bond (social, 0.82) — “Tamsin's relationship track is full (10/10) with no bond yet, and Mira explicitly declares her kin with lasting intent, which is forging a bond, a move that sits outside the provided catalog.”; the move reader makes it Forge a Bond — “Mira declares Tamsin kin with explicit lasting intent ('I mean it to hold'). Tamsin's relationship track is full (10/10) with no bond forged yet, so this is the moment to cement the connection. Forge a Bond is a progress move in the catalog, and the pacing read's claim that it sits outside the catalog is mistaken. Other readings (develop_your_relationship, test_your_relationship) fit worse: the track is full and nothing strains the relationship.”
- `claude-haiku-5-5` — **another move offered**: the pacing reader narrates it and offers Develop Your Relationship (social, 0.80) — “Mira is deepening a bond with Tamsin, a connection not yet bonded, which only develop_your_relationship marks; a social dial of 5 and no stakes at risk make it an offer rather than a forced roll.”

**`done-2`** — vow · wants Fulfill Your Vow · context spire-reckoning

> It is done. I set out to learn who was raiding the Cinder Expanse lanes, and now I know, with proof. I say so aloud, to Tamsin and the warden both, and call the work finished.

- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Fulfill Your Vow (investigation, 0.90) — “The player declares the open vow to find the raiders finished, with proof in hand, which is the explicit trigger for fulfill_your_vow (a progress move).”; the move reader makes it Fulfill Your Vow — “Mira states outright that the vow to find the Cinder Expanse raiders is done, with the sealed ledger as proof, naming it finished before Tamsin and the warden. This is the explicit trigger for Fulfill Your Vow, a progress move rolled against the vow's progress track (8 of 10 boxes). The less obvious reading, forging a bond with Tamsin, does not fit: the line is about the vow, not the relationship.”
- `claude-haiku-5-5` — **offered**: the pacing reader narrates it and offers Fulfill Your Vow (investigation, 0.80) — “The player declares the vow complete with proof, which is fulfill_your_vow; it is a progress move with no roll, so it is offered rather than forced.”

**`none-say-again`** — control · wants no move · context bleakhold-clerk

> I ask Roe to say again how often the man comes to the cargo lock.

_A question about what he has already said._

- `claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.85) — “A plain clarifying question to a cooperative NPC who already volunteered the answer; no pressing, risk, or stakes, so it is conversation rather than a move.”
- `claude-haiku-5-5` — **a move offered**: the pacing reader narrates it and offers Gather Information (investigation, 0.60) — “Asking a clerk to repeat a detail is plain conversation at a moderate investigation dial, though pressing a frightened, evasive informant could warrant gather_information if it becomes a real attempt to extract the truth.”

**`waypoint-2`** — travel · wants Explore a Waypoint · context ashfall-drift

> That old relay is worth an hour. I dock with its ring and take a look around inside.

- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Explore a Waypoint (exploration, 0.80) — “Docking with and searching a wrecked relay mid-expedition in uncharted debris is an intentional action with stakes at exploration dial 6, so it is an Explore a Waypoint move.”; the move reader makes it Explore a Waypoint — “Mira docks with a wrecked relay mid-expedition and searches it, which is a notable location examined during an expedition. Explore a Waypoint, rolled +wits, fits better than a generic Gather Information.”
- `claude-haiku-5-5` — **offered**: the pacing reader narrates it and offers Explore a Waypoint (exploration, 0.70) — “Docking and exploring a notable wreck during an uncharted expedition is explore_a_waypoint, but at a 6/10 dial with no clear hazard stated, it is borderline and offered rather than forced.”

**`advantage-2`** — action · wants Secure an Advantage · context ashfall-drift

> Before I commit to that gap I hold position and time the tumble of the debris, looking for the rhythm in it.

- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Secure an Advantage (exploration, 0.80) — “Player holds position and studies the debris tumble to prepare before a hazardous crossing, a deliberate action with stakes that fits Secure an Advantage, at an exploration dial of 6 with clear intent.”; the move reader makes it Secure an Advantage — “Mira holds position and studies the debris tumble to find its rhythm before committing to the gap — deliberate preparation and assessment, which is Secure an Advantage using observation and focus (wits). The literal reading fits; no mischief applied.”
- `claude-haiku-5-5` — **another move offered**: the pacing reader narrates it and offers Gather Information (exploration, 0.60) — “Timing the debris to find a safe passage is a search for information in a hazardous expedition, with stakes but no clearly explicit roll intent at a mid-level dial.”

**`danger-2`** — action · wants Face Danger or Enter the Fray · context lane-ambush

> I slam the throttle open and dive for the dead freighter's cargo cloud to lose her.

_Running from an imminent threat is Face Danger; a table may as rightly open a fight whose objective is to get away. Either is right._

- `claude-sonnet-5-5` — **rolled**: the pacing reader calls it a move, naming Face Danger (combat, 0.90) — “Dive into a cargo cloud to escape an armed cutter is a risky character action under direct threat at a 9/10 dial, so face_danger.”; the move reader makes it Face Danger — “Mira is making a risky dash into a debris cloud to escape an armed cutter's boarding demand. No fight has begun and no combat position is set. This is a reaction to an imminent threat, relying on speed and piloting agility, so face_danger with edge.”
- `claude-haiku-5-5` — **another move rolled**: the pacing reader calls it a move, naming Gain Ground (combat, 0.90) — “Combat is active and the player attempts an evasive maneuver against an armed cutter, so the action is a move; gain_ground fits a bid to control the engagement by breaking contact through the cargo cloud.”; the move reader makes it Gain Ground — “Mira is in control of the engagement and presses an advantage by breaking contact through the cargo cloud; edge (pursuit/mobility) fits a fast evasive dive. The pacing read's gain_ground is kept, with edge as the stat since it is a mobility move.”

## Lines no arm read

**`done-1`** — vow · wants Fulfill Your Vow · context spire-reckoning

> I put the sealed ledger in Warden Marr's hands and tell her all of it: Corvin Hale bought the schedules, and Corvin Hale sent the cutters. The lanes' raider has a name now.

- `claude-sonnet-5-5` — **another move offered**: the pacing reader narrates it and offers Reach a Milestone (investigation, 0.80) — “Delivering proof that names the raider is a real step toward the open raiding vow (8 of 10), attempting nothing with stakes, so offer reach_a_milestone rather than plain narration.”
- `claude-haiku-5-5` — **another move offered**: the pacing reader narrates it and offers Reach a Milestone (social, 0.80) — “The player's proof of Corvin Hale's guilt is a clear real step toward the open vow to find the lane raider, so reach_a_milestone is offered; it is social with no stakes rolled, so not MOVE.”

## Controls read as a move

**`none-say-again`** — control · wants no move · context bleakhold-clerk

> I ask Roe to say again how often the man comes to the cargo lock.

_A question about what he has already said._

- `claude-sonnet-5-5` — **narrated**: the pacing reader narrates it, with no move offered (social, 0.85) — “A plain clarifying question to a cooperative NPC who already volunteered the answer; no pressing, risk, or stakes, so it is conversation rather than a move.”
- `claude-haiku-5-5` — **a move offered**: the pacing reader narrates it and offers Gather Information (investigation, 0.60) — “Asking a clerk to repeat a detail is plain conversation at a moderate investigation dial, though pressing a frightened, evasive informant could warrant gather_information if it becomes a real attempt to extract the truth.”

## Cost and time

| Arm | Calls (pacing + move) | Input | Cache read | Cache write | Output | Cost | Pacing reader, median | Move reader, median | A line, median / p90 |
|---|---|---|---|---|---|---|---|---|---|
| `claude-sonnet-5-5` | 86 (60 + 26) | 73726 | 537156 | 12872 | 17685 | $0.4102 | 1.3 s | 3.0 s | 2.0 s / 4.8 s |
| `claude-haiku-5-5` | 83 (60 + 23) | 71126 | 517542 | 12872 | 16083 | $0.0219 | 0.8 s | 1.9 s | 0.9 s / 2.7 s |

Total: $0.4321, by the price table in explore.config.json (computed from each reply's usage, not billed from it).

## What this test does not show

- **Nothing is rolled or narrated.** A line counted as rolled is one whose roll dialog would open on the right move; the stat, the stakes, the dice and the narration are not looked at.
- **The wanted readings are one reader's reading of the rules.** Where the rules allow two moves the list accepts both; a line whose reading is arguable was left out, and a note on a line says where it is close.
- **One reading of a line is one sample** of a reader that does not always answer alike: a line read right four times in five shows here as right or as wrong. READERS_REPEATS measures it.
- **About fifty lines, a handful to a move.** A family's rate rests on three to ten lines; a difference of one line between arms is not a finding.
- **The scenes are written by hand**: one or two paragraphs of narration, with a matching scene frame, where a table has up to three cards with the player's own lines among them — and none of the drift a long session leaves in a scene.
- **One character, alone, with one connection and one vow**, at the pacing and mischief dials a new world has (mischiefDial balanced, enabled true, densityWindow 5, combat 9, investigation 6, exploration 6, social 5, downtime 1). No fight is open in any context: the readers' rules for an open fight are not exercised.
- **The sheet is set by hand.** Each context's health, spirit, supply and impacts, its vow's progress and the ship's integrity are written to the world before its lines are read, and both readers are told them (their SITUATION block). A table's sheet moves under play: no line here follows a roll that changed it (not set in the world: tracks[].ticks).
- **Each line is read on its own**: the count of recent moves is cleared before every reading, so a line never follows a run of rolls.
- **Only the model changes between arms.** Each arm reads the same prompts, written for the readers' own model (`claude-sonnet-5-5`); a prompt tuned to another model might read differently.
- **No arm thinks first.** The readers turn thinking off, each model in its own form (`claude-sonnet-5-5`: between_tools; `claude-haiku-5-5`: disabled), and each model answers at its own default effort; a reader allowed to think, or set to another effort, might read differently.

