# long-haul — annotated transcript

Run `long-haul-live-20261126-030646` · live · 2026-11-26T03:06:46.376Z · class **pass** — 27 of 27 beats done; no check violated, no fact lost or refused

Generated layers: the beat, the player's reason, the table's calls, rolls, the GM's answers, the checks' findings, time and cost.
The notes under each step are the reader's, and are not generated.

## before

### (setup)


> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Find the lost colony ship Verity's Hope

**Notes.** The world as seeded: Mira at Hollow Spire, the Kobayashi IV near it. The run's commit is 126a547f, with #393's slices, the dice rule and the six fixes in.

### a1 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** say: !begin-session — _start_
- **Calls (1):** the AI player (2.8 s)
- **Time:** 3.4 s · **cost:** $0.0203

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** The table's !begin-session. Nothing to read.

## session-1

### a2 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** in "Begin a Session" set vignette=true, newVow=Find who is raiding the Cinder Expanse lanes, newVowRank=dangerous and press "Begin" — _fill dialog_
- **Notebook:** Beat1: begun session dialog submitted; next press Swear it on vow card
- **Calls (6):** callRewardModel>proposeRewards (1.4 s); callNarratorAPI>narrateSessionVignette ×2 (4.9 s); callHaiku>defaultCallDetectionAPI (2.4 s); callHaiku>defaultCallTierAPI (0.7 s); the AI player (3.1 s)
- **Time:** 24.5 s · **cost:** $0.0538

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. No vow was in play besides a background vow: Mira Kestrel swears one — Find who is raiding the Cinder Expanse lanes (dangerous). Its card follows. Spotlight vignette: Peril lies ahead or lurks just out of view All players take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Find who is raiding the Cinder Expanse lanes

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 3)

> **TABLE — Gamemaster**
>
> 🆕 New vow recorded "Find who is raiding the Cinder Expanse lanes" (dangerous) Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress. On fulfilment: +2 Quests legacy ticks (strong hit) · +1 (weak hit). ⚔ Swear it (roll) Pick a reward for it below.

> **TABLE — Gamemaster**
>
> 🎁 Choose your reward Succeed and you'll earn one of these — or name your own and the narrator will work it in: Salvaged Expanse-grade plasma carbine, tuned to Cinder raider signatures Intel broker in Helix Station who knows the raiders' hidden drop points Propose my own

> **NARRATOR (spotlight_begin) — Gamemaster**
>
> Somewhere past the edge of the Kobayashi IV's scan range, a drifting beacon pings once, patient and unanswered. Nobody aboard Hollow Spire's water haulers has logged it, and nobody has thought to. A lone salvager in a stripped skiff reaches for the thing, an old survey relic cold and alone in the dark, and the hatch of the dead hull behind it opens a hand's width. The salvager notices the shadow of it too late, and the first blow is already coming for their throat. The beacon pings again, on schedule, as if nothing at all had happened.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◧ Location] Drifting Beacon — An old survey relic drifting cold and alone in the dark, pinging on a fixed schedule. Confirm Dismiss [◧ Location] Dead Hull — A derelict hull whose hatch opens a hand's width, hiding an attacker behind it. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

> **NARRATOR (galley_begin) — Gamemaster**
>
> You are in the engine room, and you have been here longer than any repair warrants. A coolant line weeps onto a casing, and the casing, a cabinet of something once useful, is swaddled in a gray crust of old insulation foam that has swelled up and set like bread. You have decided, after some thought, that you are not going to chip it free today. Instead you are working out how to take Verity's Hope off the long list in your head and put her on the short one, which is a different thing from finding her. Your rival on the lanes has a head start, a better fuel allotment and, you are fairly sure, an opinion of you. The foam says nothing, which is more than the last person who gave you advice managed.

**Notes.** Session 1's opening and its spotlight, both in the second person: the spotlight cuts away to a drifting beacon, the opening is "You are in the engine room". The [person] check had nothing to catch. The new vow is recorded, with its reward card, which nobody answers (a75 says so).

### a3 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** click "⚔ Swear it (roll)" on m6 — _Swear the vow_
- **Notebook:** Beat1: pressing Swear it on m6
- **Calls (6):** callReaderAPI>readLine (1.7 s); defaultClassifyImplicit>resolveRelevance (0.3 s); callNarratorAPI>call (8.9 s); callNarratorAPI>narrateResolution (3.8 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.6 s)
- **Roll:** swear_an_iron_vow → miss — Action: 1 + 2 = 3 \| Challenge: 5, 7
- **GM's rules:** accepted the proposed move (swear_an_iron_vow)
- **Beat 1 done:** session 1 is open; the dangerous vow "Find who is raiding the Cinder Expanse lanes" is on the sheet at 0 ticks
- **Time:** 30.6 s · **cost:** $0.0964

> **TABLE — Mira Kestrel**
>
> Swear an iron vow: Find who is raiding the Cinder Expanse lanes.

> **NARRATOR — Gamemaster**
>
> You lay your palm flat on the cold engine casing, the one cabinet in the room that is still plain iron under its gray crust of foam, and say it to the weeping coolant line since nothing else here is listening: "I will find who is raiding the Cinder Expanse lanes." The metal takes the heat of your hand and gives none back, which is the only kind of witness a vow like this ever gets. The drip lands beside your thumb, steady as a clerk's stamp, and you leave your hand where it is until you mean it.

> **TABLE — Gamemaster**
>
> Swear an Iron Vow +heart (2) Action: 1 + 2 = 3 | Challenge: 5, 7 Miss Significant obstacle stands in your way before the quest begins. Envision it.

> **NARRATOR — Gamemaster**
>
> Your palm is still on the iron when the ship answers. The coolant line shudders, the drip becomes a thin stream, and the casing goes warm and then wrong beneath your hand. A hard knock rings somewhere aft, then a second one, spaced out like someone testing a door. The lights dim a shade. The vow is out of your mouth and nothing in this room has taken it kindly. The hull knocks a third time, nearer.

**Notes.** Swear an Iron Vow, a miss: "Significant obstacle". The narration tells the oath, then the ship's coolant line answering — a miss told as trouble, right.

### a4 · beat 2: Meet someone and make them a connection

- **Player:** say: I step onto the Hollow Spire docks and find Tamsin Vey, the salvage broker, at her ledger stall. — _meet Tamsin_
- **Notebook:** Beat2: said meet line for Tamsin
- **Calls (6):** callReaderAPI>readLine (1.6 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (2.6 s)
- **GM's rules:** confirmed the draft for Tamsin Vey, with its "Confirm" (connection)
- **Time:** 20.4 s, 6.9 s from the line to its reply · **cost:** $0.0325

> **PLAYER — Playthrough Player**
>
> I step onto the Hollow Spire docks and find Tamsin Vey, the salvage broker, at her ledger stall.

> **NARRATOR — Gamemaster**
>
> The docks of Hollow Spire smell of wet iron and recycled breath. Water haulers stand in rows, their tanks tagged and chained. Tamsin Vey sits at a ledger stall under a flickering lamp, writing without looking up. A stack of survey chits weighs down one corner of her page. "You've got the look of someone who wants a favor," she says, still writing. "Favors cost extra here."

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Tamsin Vey — Salvage broker who keeps a ledger stall on the Hollow Spire docks ✓ Confirmed 🤝 Make a Connection All entities reviewed.

**Notes.** The plea's line, before the stall. The frame is "Hollow Spire docks, Tamsin Vey's ledger stall": Tamsin is met at Hollow Spire, where the record has the characters. The entity card is offered as a connection draft.

### a5 · beat 2: Meet someone and make them a connection

- **Player:** say: I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, and who can count on me in turn. Will you be that? — _make connection_
- **Notebook:** Beat2: asked Tamsin to be someone I keep
- **Calls (6):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narratePacedInput (4.1 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.7 s)
- **Time:** 19.8 s, 8.1 s from the line to its reply · **cost:** $0.0440

> **PLAYER — Playthrough Player**
>
> I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, and who can count on me in turn. Will you be that?

> **NARRATOR — Gamemaster**
>
> A hauler's crew chains down a tank two rows over, and the clank carries across the docks. Tamsin's pen stops at last. She looks up, and the lamp flickers across a face that gives you nothing. "Coming back," she says. "Counting on you." She taps the survey chits, squaring the stack. "Everyone on this dock says that to me, Kestrel, usually while owing me water." *Standing in front of her and asking to be someone she can rely on would be a Make a Connection.*

**Notes.** The plea to a stranger, narrated with the move offered (#388 #4 held again).

### a6 · beat 2: Meet someone and make them a connection

- **Player:** click "Roll Make a Connection" on m12 — _Narrator offered the roll button._
- **Notebook:** Beat2: pressed Roll Make a Connection
- **Calls (4):** callNarratorAPI>narrateResolution (7.8 s); callHaiku>defaultCallDetectionAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.6 s)
- **Roll:** make_a_connection → strong_hit (scripted dice) — Action: 6 + 2 = 8 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (make_a_connection)
- **Beat 2 done:** Tamsin Vey is a dangerous connection held by Mira Kestrel; its bond Item reads 0 ticks; make_a_connection was rolled and there is still one card
- **Time:** 24.2 s · **cost:** $0.0354

> **TABLE — Mira Kestrel**
>
> I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, and who can count on me in turn. Will you be that?

> **TABLE — Gamemaster**
>
> Make a Connection +heart (2) Action: 6 + 2 = 8 | Challenge: 1, 2 Strong Hit Connection made. Give them a role and rank. 🤝 Develop Relationship 🔗 Forge a Bond

> **NARRATOR — Gamemaster**
>
> "Fine. Come back when you've got something worth counting." Tamsin caps her pen and slides a scrap of chit across the ledger. A dock berth number is scratched on it, and beneath that a stall mark. "Water first, always. Ask for me by name, and bring more than talk." She says it flatly, as though agreeing cost her nothing, though her eyes stay on the survey chits a moment too long. Then she turns a page. "Now, what are you hauling?"

> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Tamsin Vey

**Notes.** Make a Connection, a strong hit: Tamsin is a dangerous connection; her chit with a berth number is the dice's truth.

### a7 · beat 3: Link the vow to them

- **Player:** choose "Tamsin Vey" in dropdown 1 on e1 — _choose connection_
- **Notebook:** Beat3: selecting Tamsin on e1 then Link
- **Calls (1):** the AI player (2.6 s)
- **Time:** 7.2 s · **cost:** $0.0089

**Notes.** The player picks Tamsin in the link card's dropdown (beat 3).

### a8 · beat 3: Link the vow to them

- **Player:** click "Link" on e1 — _Press Link_
- **Notebook:** Beat3: Tamsin selected, pressing Link on e1
- **Calls (1):** the AI player (2.4 s)
- **Beat 3 done:** the vow "Find who is raiding the Cinder Expanse lanes" is linked to Tamsin Vey's card
- **Time:** 9.9 s · **cost:** $0.0089

> **TABLE — Gamemaster**
>
> 🤝 Linked to Tamsin Vey — fulfilling this vow will deepen that bond.

**Notes.** The link card: fulfilling the vow will deepen the bond.

### a9 · beat 4: Gather Information

- **Player:** say: I move down the rows of water haulers asking the crews who saw the raiders last, and I put my own credits on the table to loosen their tongues. — _ask around docks_
- **Notebook:** Beat3 done; Beat4: said ask-around line
- **Calls (5):** callReaderAPI>readLine (2.3 s); callNarratorAPI>narrateResolution (4.8 s); callHaiku>defaultCallDetectionAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (3.1 s)
- **Roll:** gather_information → miss — Action: 3 + 3 = 6 \| Challenge: 8, 9
- **GM's rules:** accepted the proposed move (gather_information)
- **Beat 4 done:** gather_information was rolled at a9: miss
- **Time:** 33.6 s, 12.1 s from the line to its reply · **cost:** $0.0480

> **PLAYER — Playthrough Player**
>
> I move down the rows of water haulers asking the crews who saw the raiders last, and I put my own credits on the table to loosen their tongues.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 3 + 3 = 6 | Challenge: 8, 9 Miss Dire threat or unwelcome truth uncovered. Pay the Price.

> **TABLE — Gamemaster**
>
> Pay the Price Gather Information As stated before the roll: The crews close up, or sell you a lead that goes nowhere. Routes to Sacrifice Resources (-1).

> **TABLE — Gamemaster**
>
> Sacrifice Resources (-1) Supply: 5 → 4

> **NARRATOR — Gamemaster**
>
> You work the rows, and the credits go onto the haulers' tank lids one chit at a time. The crews take them. They tell you the raiders hit lone ships, at the beacon, in the dark, and sell you nothing you couldn't have guessed. One man names a lane that is plainly wrong, and pockets the credits before you can say so. Behind you, a tank chain clanks, and Tamsin's pen has started moving again. "Spent already?" she calls.

**Notes.** Gather Information, a miss, its price stated before the roll and paid (supply 5 → 4). The narration tells the crews selling a wrong lane. Right.

### a10 · beat 5: Plant facts F1–F4

- **Player:** say: Tamsin slides a dock-fee slip across to me; I read it and leave it on her counter. — _plant F1_
- **Notebook:** Beat5: F1 said (dock-fee slip)
- **Calls (6):** callReaderAPI>readLine (1.8 s); callNarratorAPI>narratePacedInput (4.2 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.7 s)
- **Time:** 20.5 s, 7.0 s from the line to its reply · **cost:** $0.0368

> **PLAYER — Playthrough Player**
>
> Tamsin slides a dock-fee slip across to me; I read it and leave it on her counter.

> **NARRATOR — Gamemaster**
>
> Tamsin's fingers slide a slip of flimsy paper across the ledger. You read it. Berth fees, owed by the day, with a line at the bottom for water. You set it back on her counter and square it against the chit stack. She watches your hand, not your face. "That's the price of standing on my dock," she says. "Most people don't read it." Her pen taps once. "What did the haulers tell you?"

**Notes.** A plant: the fee slip read and left. [dice] lines about Tamsin (her chit, her agreeing to be the contact) ride on the narration because the line names her — harmless, but noise (finding 2).

### a11 · beat 5: Plant facts F1–F4

- **Player:** say: I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry. — _plant F2_
- **Notebook:** F2 said (compass)
- **Calls (6):** callReaderAPI>readLine (1.1 s); callNarratorAPI>narratePacedInput (3.4 s); callHaiku>defaultCallDetectionAPI (1.6 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.5 s)
- **Time:** 18.0 s, 5.3 s from the line to its reply · **cost:** $0.0337

> **PLAYER — Playthrough Player**
>
> I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry.

> **NARRATOR — Gamemaster**
>
> Mira turns the brass star-compass over in her palm. The needle swings loose, then settles on nothing in particular. Tamsin's pen stops mid-line. Her eyes go to the compass, then to the survey chits, then back to the slip left on her counter. "Pretty thing," she says. "Does it point anywhere, or is it only for holding?" She waits for an answer, and her hand drifts toward the water charge line.

**Notes.** A plant: the star-compass. The narration is in the third person — "Mira turns the brass star-compass over in her palm" — in a beat of play, under a second-person PERSPECTIVE (finding 3).

### a12 · beat 5: Plant facts F1–F4

- **Player:** say: I leave the cargo manifest with Tamsin for safekeeping. — _plant F3_
- **Notebook:** F3 said (manifest)
- **Calls (6):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narratePacedInput (4.3 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (2.5 s)
- **Time:** 19.3 s, 6.9 s from the line to its reply · **cost:** $0.0350

> **PLAYER — Playthrough Player**
>
> I leave the cargo manifest with Tamsin for safekeeping.

> **NARRATOR — Gamemaster**
>
> Down the row, a hauler's mate stops chaining a tank to watch the broker's stall. Tamsin takes the manifest in two fingers and reads the top line before you've let go. "Safekeeping," she says. "I keep ledgers, not secrets." She doesn't hand it back. She tucks it under the survey chits and squares the stack. Her pen resumes its small, steady scratching. "What are you hauling, Kestrel? The manifest doesn't say."

**Notes.** A plant: the manifest left with Tamsin. Told right.

### a13 · beat 5: Plant facts F1–F4

- **Player:** say: I promise Tamsin I'll be back before the next tide of cargo. — _F4_
- **Notebook:** F4 said (promise back before next tide of cargo)
- **Calls (6):** callReaderAPI>readLine (0.8 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (1.3 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.5 s)
- **Beat 5 done:** F1, F2, F3, F4 stated by the player
- **Time:** 20.5 s, 6.7 s from the line to its reply · **cost:** $0.0351

> **PLAYER — Playthrough Player**
>
> I promise Tamsin I'll be back before the next tide of cargo.

> **NARRATOR — Gamemaster**
>
> "Before the tide." Tamsin repeats it, flat, and doesn't look up from the page. "Cargo doesn't keep a tide, Kestrel. It keeps whoever owes it." The pen scratches on. She still holds your manifest under the survey chits, and she makes no move to return it. Down the row, a tank chain drops against a deck plate. "Go on, then. Come back with water, and I'll remember you promised."

**Notes.** A plant: the promise. Told right; [dice] lines again.

### a14 · beat 6: End a Session, noting a focus

- **Player:** say: !end-session — _Beat 6_
- **Notebook:** Beat5 done; Beat6: typed !end-session
- **Calls (1):** the AI player (2.3 s)
- **Time:** 3.3 s · **cost:** $0.0096

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** The table's !end-session.

## after-session-1

### a15 · beat 6: End a Session, noting a focus

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with focus_
- **Notebook:** Beat6: submitted End Session dialog
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (1.6 s); callNarratorAPI>narrateSessionVignette (3.7 s); callNarratorAPI>getCampaignRecap (5.7 s); callHaiku>defaultCallTierAPI (1.1 s); the AI player (3.1 s)
- **Beat 6 done:** session 1 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 25.2 s · **cost:** $0.0576

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

> **NARRATOR (npc_end) — Gamemaster**
>
> Deep in the processed goods storage hold at Bleakhold Station, a loader sits on an overturned crate with a ration tin in her lap and a stack of sealed pallets at her back. She has hummed the same slow funeral tune for three shifts now, the one her grandmother's people sang, and she keeps it low so the cameras will not mind. Behind a pallet marked as powdered stock, a wild-looking cache sits stuffed with unlabelled canisters, mismatched and unlisted on any manifest. She does not look at it. The tune goes round again.

**Notes.** End a Session: +1 momentum, the focus kept. The closing cuts away to a loader in Bleakhold's hold — someone absent, as #388 #3 asks.

### a16 · beat 7: Begin a Session; ask probe set A

- **Player:** say: !begin-session — _begin session 2_
- **Notebook:** Beat7: typed !begin-session
- **Calls (1):** the AI player (2.6 s)
- **Time:** 2.8 s · **cost:** $0.0099

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** The table's !begin-session.

## session-2

### a17 · beat 7: Begin a Session; ask probe set A

- **Player:** in "Begin a Session" set vignette=false and press "Begin" — _Begin session 2_
- **Notebook:** Beat7: submitted Begin; next ask 4 probe questions
- **Calls (3):** callNarratorAPI>narrateSessionVignette (4.3 s); callHaiku>defaultCallTierAPI (0.7 s); the AI player (2.7 s)
- **Time:** 16.2 s · **cost:** $0.0435

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> You are still at the stall, and Tamsin has gone back to her ledger as if you were a tide that might yet turn. You find you are reducing your duty, in the plainest sense: you stack the dock-fee slip on the counter into a smaller, tidier square, because a debt is lighter when it is folded. Tamsin glances at your work and lets you have it. Behind her, a strange stand of pale growth crawls up the dock wall, cracked open like old plaster, thriving where nothing should and watering nobody's plans. You decide it is the only thing on Hollow Spire that has stopped asking you for anything.

**Notes.** Session 2's opening, "You are still at the stall": where session 1 stopped, by the record. Second person.

### a18 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What do I still carry that belonged to my sister? — _probe 1_
- **Notebook:** Beat7: asking Q1 of 4
- **Calls (2):** callNarratorAPI>interrogateScene (0.7 s); the AI player (2.4 s)
- **Time:** 9.4 s, 1.7 s from the line to its reply · **cost:** $0.0172

> **PLAYER — Playthrough Player**
>
> @scene What do I still carry that belonged to my sister?

> **NARRATOR — Gamemaster**
>
> You still carry Ilse's brass star-compass, the one thing of hers you have left.

**Notes.** @scene, set A: the compass recalled.

### a19 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What is the name of the salvage broker I befriended at Hollow Spire? — _Q2_
- **Notebook:** Beat7: Q1 answered; asking Q2
- **Calls (2):** callNarratorAPI>interrogateScene (0.7 s); the AI player (2.4 s)
- **Time:** 9.2 s, 1.1 s from the line to its reply · **cost:** $0.0154

> **PLAYER — Playthrough Player**
>
> @scene What is the name of the salvage broker I befriended at Hollow Spire?

> **NARRATOR — Gamemaster**
>
> Her name is Tamsin Vey. She keeps the ledger stall on the Hollow Spire docks and has agreed to be your contact there.

**Notes.** @scene, set A: Tamsin's name and where she keeps her stall — Hollow Spire.

### a20 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene Who is holding the cargo manifest I was carrying? — _Q3_
- **Notebook:** Beat7: Q2 answered; asking Q3
- **Calls (2):** callNarratorAPI>interrogateScene (1.5 s); the AI player (2.5 s)
- **Time:** 11.0 s, 2.3 s from the line to its reply · **cost:** $0.0151

> **PLAYER — Playthrough Player**
>
> @scene Who is holding the cargo manifest I was carrying?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey is holding it. She took the manifest and has kept it, tucked under her stack of survey chits at the stall.

**Notes.** @scene, set A: the manifest with Tamsin.

### a21 · beat 7: Begin a Session; ask probe set A

- **Player:** say: By when did I promise to return? — _Ask the fourth probe question_
- **Notebook:** Beat7: Q3 answered; asking Q4 (plain)
- **Calls (6):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narratePacedInput (3.0 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.8 s)
- **Beat 7 done:** probe set A: 4 question(s) asked
- **Time:** 20.2 s, 6.3 s from the line to its reply · **cost:** $0.0303

> **PLAYER — Playthrough Player**
>
> By when did I promise to return?

> **NARRATOR — Gamemaster**
>
> "Before the next tide of cargo," Tamsin says, not looking up from her ledger. She taps the chit stack, and your manifest shifts beneath it. "You said it with your hand on that engine casing. I wrote it down." She dips her pen. "Water, Mira. Real goods. Talk doesn't weigh anything on this dock."

**Notes.** The promise asked in play and answered in Tamsin's voice: right, and in the scene.

### a22 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: Before I go, I hear that clipped hauler's distress call again, so I take the Kobayashi IV off the charted lane and out into uncharted space along its bearing, a short run to find the source. — _Start beat 8_
- **Notebook:** Beat7 done; Beat8 step1 said (crossing line)
- **Calls (7):** callReaderAPI>readLine (1.8 s); callNarratorAPI>getRollingSessionSummary (1.1 s); callNarratorAPI>narrateResolution (7.8 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (3.0 s)
- **Roll:** undertake_an_expedition → strong_hit — Action: 5 + 3 = 8 \| Challenge: 6, 5
- **GM's rules:** accepted the proposed move (undertake_an_expedition)
- **Time:** 27.2 s, 14.7 s from the line to its reply · **cost:** $0.0552

> **PLAYER — Playthrough Player**
>
> Before I go, I hear that clipped hauler's distress call again, so I take the Kobayashi IV off the charted lane and out into uncharted space along its bearing, a short run to find the source.

> **TABLE — Gamemaster**
>
> Undertake an Expedition +wits (3) Action: 5 + 3 = 8 | Challenge: 6, 5 Strong Hit Reach a waypoint. Mark progress per expedition rank. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Expedition New expedition The clipped hauler's distress source (Troublesome) begun — progress marked (3/10 boxes). If the rank looks off, adjust it in the Progress Tracks panel. 🗺 Finish the Expedition (3/10)

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV leaves the charted lane behind. Ahead, the distress call keeps its thin, clipped rhythm, and you follow its bearing into dark no chart has bothered to name. Nothing tests the run. Then the shape resolves on the scope: a spread of bone-white ribs, vast and slowly turning, the remains of something that once swam. The signal is coming from inside it. A hull, small and dark, hangs wedged between the ribs.

**Notes.** Undertake an Expedition, a strong hit, from Hollow Spire. The characters set out: the record's place is none, and the narration's scene block says "Place: none — the characters are between places, on the expedition The clipped hauler's distress source, until it arrives" (#393 D1 held). The scene turns for the expedition. The ship's record stays "near Hollow Spire": the narration's ship/position was untagged colour, so nothing moved her (finding 4).

### a23 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: I ease the Kobayashi IV in close and go over the wedged hull and the bone-white ribs around it with the scope, looking for what tore it open and any sign of the hauler's crew. — _step 2_
- **Notebook:** Beat8 step2 said (look over line)
- **Calls (5):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narrateResolution (5.2 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (3.1 s)
- **Roll:** explore_a_waypoint → miss — Action: 5 + 3 = 8 \| Challenge: 10, 10 ✦ Match
- **GM's rules:** accepted the proposed move (explore_a_waypoint)
- **Time:** 24.4 s, 9.2 s from the line to its reply · **cost:** $0.0552

> **PLAYER — Playthrough Player**
>
> I ease the Kobayashi IV in close and go over the wedged hull and the bone-white ribs around it with the scope, looking for what tore it open and any sign of the hauler's crew.

> **TABLE — Gamemaster**
>
> Explore a Waypoint +wits (3) Action: 5 + 3 = 8 | Challenge: 10, 10 ✦ Match Miss with a Match ✦ Match: a dire turn — the outcome is worse, with a complication or a new peril. Miss with a match — an immediate hardship or threat. Choose: Pay the Price, or Confront Chaos instead. 🌀 Confront Chaos

> **NARRATOR — Gamemaster**
>
> The scope sweeps the ribs, and the first thing it finds is the hull's scoring. The hauler's plating is cut in clean lines, fresh, newer than the bones around it. Then the scope catches a drive signature, cold and waiting, tucked behind the far curve of the boneyard. It was already here when you came in. The distress call stops mid-word, and somewhere in the ribs, a hatch slides open.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: Pay the Price: The scan turns up something worse among the ribs, or nothing useful at all. Confront Chaos instead

**Notes.** Explore a Waypoint, a miss with a match: the choice of Pay the Price or Confront Chaos is offered, and the narration stops at the threat. The reader is told "Place: none — between places, on the expedition …". No scene turn for the leg (EXPEDITION-LEGS-TURN-THE-SCENE held).

### a24 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "Pay the Price: The scan turns up something worse among the ribs, or no" on m12 — _Answer pending cost card_
- **Notebook:** Beat8: chose Pay the Price on miss card
- **Calls (1):** the AI player (2.5 s)
- **Time:** 7.6 s · **cost:** $0.0109

> **TABLE — Gamemaster**
>
> Pay the Price Explore a Waypoint As stated before the roll: The scan turns up something worse among the ribs, or nothing useful at all.

**Notes.** Pay the Price chosen, as stated before the roll.

### a25 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "🗺 Finish the Expedition (3/10)" on m6 — _Step 3_
- **Notebook:** Beat8: pressing Finish the Expedition
- **Calls (6):** callNarratorAPI>getRollingSessionSummary (2.2 s); callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (1.2 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.8 s)
- **Roll:** finish_an_expedition → strong_hit (scripted dice) — Progress: 3 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (finish_an_expedition)
- **Beat 8 done:** the troublesome expedition "The clipped hauler's distress source" was begun at a22 and marked to 3 of 10 boxes, a waypoint explored at a23 (a miss) — and finished (a strong hit), the ship at Clipped Hauler's Distress Source
- **Time:** 23.2 s · **cost:** $0.0459

> **TABLE — Mira Kestrel**
>
> Finish the expedition — The clipped hauler's distress source.

> **TABLE — Gamemaster**
>
> Finish an Expedition progress (12 ticks) Progress: 3 | Challenge: 1, 2 Strong Hit Expedition complete. Mark legacy reward on discoveries track per rank.

> **TABLE — Gamemaster**
>
> Expedition complete The clipped hauler's distress source is finished. Marked 1 tick on your Discoveries legacy track.

> **TABLE — Gamemaster**
>
> ◈ Site Discovered — Clipped Hauler's Distress Source No chart showed this place before. It is now charted on the sector map under its working label — give it its name by renaming its location in the Entities panel.

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV slides into the hull's shadow and the clamps bite. The airlock cycles. Inside, the cabin is cold and wrecked, and the scan has cost you: the sweep turned up a worse tangle among the ribs than you wanted, and your supplies thinned working through it. A cracked data slate sits wedged in the pilot's couch. Behind you, in the ribs, a drive spins up.

**Notes.** Finish an Expedition, a strong hit: the site is charted and the characters arrive — the place is Clipped Hauler's Distress Source, the ship docked there, and the scene turns as a place ("the characters have reached …") though it began between places (#393 D1's turn held). The narration tells a24's chosen price — "the scan has cost you … your supplies thinned" — CHOSEN-COST-NEVER-TOLD held live.

### a26 · beat 9: Travel to the second settlement

- **Player:** say: I pull back to the Kobayashi IV, plot a route out of the ribs, and take her to Bleakhold Station. — _beat 9_
- **Notebook:** Beat9: said plot route to Bleakhold
- **Calls (5):** callReaderAPI>readLine (1.7 s); callNarratorAPI>getRollingSessionSummary (1.8 s); callNarratorAPI>narrateResolution (4.0 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (2.5 s)
- **Roll:** set_a_course → strong_hit — Action: 4 + 4 = 8 \| Challenge: 5, 4
- **GM's rules:** accepted the proposed move (set_a_course)
- **Beat 9 done:** the ship is at Bleakhold Station, its token on the pin
- **Time:** 22.9 s, 7.5 s from the line to its reply · **cost:** $0.0364

> **PLAYER — Playthrough Player**
>
> I pull back to the Kobayashi IV, plot a route out of the ribs, and take her to Bleakhold Station.

> **TABLE — Gamemaster**
>
> Set a Course +supply (4) Action: 4 + 4 = 8 | Challenge: 5, 4 Strong Hit Arrived, situation favors you. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Set a Course resolved Arrived at Bleakhold Station . Course held cleanly (+1 momentum). Token moved to Bleakhold Station .

> **NARRATOR — Gamemaster**
>
> The dock crew at Bleakhold Station look up from a stalled cargo sled as your ship slides in under the gantry. One of them waves a lamp, bored, and the clamps take the Kobayashi IV without a shudder. The ribs are behind you now, and the cold drive with them. Through the viewport, corporate lettering glows over the customs arch, and a line of tired haulers waits beneath it. At the far end of the line, a clerk is already reading your hull number off a slate.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 5)

**Notes.** Set a Course to Bleakhold, a strong hit: the place, the ship and the token arrive together; the scene turns as a place. The reader's situation had "Elsewhere: Bleakhold Station is another place — reached only by a journey" and read the journey (#393 D7's line, on a line that asked for it anyway).

### a27 · beat 10: Enter a fight that serves the vow

- **Player:** say: !truth set "raider cutter" is named the Ashen Wake — _beat instruction_
- **Notebook:** Beat10: typed truth set; next fight line
- **Calls (1):** the AI player (2.4 s)
- **Time:** 9.3 s · **cost:** $0.0098

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Ashen Wake

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Ashen Wake tr-638e2 .

**Notes.** The table's !truth set: the cutter named the Ashen Wake.

### a28 · beat 10: Enter a fight that serves the vow

- **Player:** say: The Ashen Wake rips in along the docking ring and opens fire on my berth; I stay in the Kobayashi IV and fight back, firing her docked guns at the cutter's drive. — _fight opens_
- **Notebook:** Beat10: said fight line; look for A fight looms card
- **Calls (6):** callReaderAPI>readLine (2.2 s); callNarratorAPI>narratePacedInput (4.1 s); callHaiku>defaultCallDetectionAPI (1.4 s); callHaiku>defaultCallTierAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.2 s)
- **Time:** 20.5 s, 7.4 s from the line to its reply · **cost:** $0.0385

> **PLAYER — Playthrough Player**
>
> The Ashen Wake rips in along the docking ring and opens fire on my berth; I stay in the Kobayashi IV and fight back, firing her docked guns at the cutter's drive.

> **NARRATOR — Gamemaster**
>
> "Hold still, Kobayashi, we're only here to look at your paperwork." The clerk's slate drops, and he is already running when the first bolt cracks across the gantry. The Ashen Wake comes in along the docking ring, fast and low, and the dock crew scatter behind their stalled sled. You are strapped into the couch with the guns live. The cutter's drive glows hard against the dark. Fire has not yet been traded. *Answering her from the berth would be Enter the Fray.*

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬢ Faction] Ashen Wake — Raiders who come in fast and low along the docking ring and open fire on berths. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** The cutter's attack, narrated with Enter the Fray offered.

### a29 · beat 10: Enter a fight that serves the vow

- **Player:** click "Roll Enter the Fray" on m12 — _Narrator offers the roll button_
- **Notebook:** Beat10: pressed Roll Enter the Fray; look for fight card
- **Calls (5):** callNarratorAPI>narrateResolution (4.3 s); callHaiku>defaultCallDetectionAPI (1.8 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.5 s)
- **Roll:** enter_the_fray → strong_hit — Action: 4 + 2 = 6 \| Challenge: 5, 4
- **GM's rules:** accepted the proposed move (enter_the_fray)
- **Time:** 21.7 s · **cost:** $0.0488

> **TABLE — Mira Kestrel**
>
> The Ashen Wake rips in along the docking ring and opens fire on my berth; I stay in the Kobayashi IV and fight back, firing her docked guns at the cutter's drive.

> **TABLE — Gamemaster**
>
> Enter the Fray +edge (2) Action: 4 + 2 = 6 | Challenge: 5, 4 Strong Hit Strong hit: take both — +2 momentum AND you are in control.

> **TABLE — Gamemaster**
>
> ⚔ A fight looms — The Ashen Wake cutter Your Enter the Fray is rolled, but the fight's track is not made yet: set it up here and press ⚔ Begin the fight to begin it — or look for a way out instead. The narrator suggests this is a dangerous fight. ⚑ If you enter this fight, you begin in control . Difficulty: troublesome dangerous formidable extreme epic This fight serves: (not tied to a vow) Find the lost colony ship Verity's Hope Find who is raiding the Cinder Expanse lanes Objective: ⚔ Begin the fight 🚪 Find another way

> **NARRATOR — Gamemaster**
>
> The berth's targeting scope swings to the cutter's drive and holds there, steady as a hand on a latch. You have the angle, and the Ashen Wake has not yet seen you take it. The cutter bears down along the docking ring, its gunports still sliding open. The dock crew have gone to ground behind the sled. A coolant line along the gantry hisses and whitens the air. Your thumb rests on the firing stud, and the cutter's drive fills the scope.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 7)

**Notes.** Enter the Fray, a strong hit: in control; the fight looms until its track is made.

### a30 · beat 10: Enter a fight that serves the vow

- **Player:** choose "Find who is raiding the Cinder Expanse lanes" in dropdown 2 on m10 — _select vow_
- **Notebook:** Beat10: chose vow in dropdown; next press Begin the fight
- **Calls (1):** the AI player (2.6 s)
- **Time:** 15.5 s · **cost:** $0.0109

**Notes.** The player picks the vow in the fight card's dropdown (beat 10).

### a31 · beat 10: Enter a fight that serves the vow

- **Player:** click "⚔ Begin the fight" on m10 — _Begin the fight_
- **Notebook:** Beat10: pressed Begin the fight
- **Calls (1):** the AI player (2.7 s)
- **Beat 10 done:** the dangerous fight "The Ashen Wake cutter" is open, serving the vow "Find who is raiding the Cinder Expanse lanes"
- **Time:** 11.1 s · **cost:** $0.0106

> **TABLE — Gamemaster**
>
> Enter the Fray Created combat track The Ashen Wake cutter (dangerous). This fight's progress lives in the Progress Tracks panel. Winning this fight is a milestone on your vow: “Find who is raiding the Cinder Expanse lanes”. Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress. ⊕ Open Progress Tracks ⚔ Battle instead Prefer to settle it in one stroke? Battle resolves the whole fight with a single roll instead of marking the track move by move.

**Notes.** The fight's track is made (dangerous).

### a32 · beat 11: A scripted miss in the fight

- **Player:** say: I have the angle and I'm in control, so I press it: I hammer the cutter's drive with every gun the berth has. — _attack_
- **Notebook:** Beat11: said attack line
- **Calls (6):** callReaderAPI>readLine (2.4 s); callNarratorAPI>getRollingSessionSummary (1.9 s); callNarratorAPI>narrateResolution (5.2 s); callHaiku>defaultCallDetectionAPI (1.5 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.5 s)
- **Roll:** strike → miss (scripted dice) — Action: 1 + 2 = 3 \| Challenge: 10, 9
- **GM's rules:** accepted the proposed move (strike)
- **Beat 11 done:** strike missed at a32; its price (null: "") was withstand_damage (-1), taken at a32
- **Time:** 26.1 s, 12.6 s from the line to its reply · **cost:** $0.0361

> **PLAYER — Playthrough Player**
>
> I have the angle and I'm in control, so I press it: I hammer the cutter's drive with every gun the berth has.

> **TABLE — Gamemaster**
>
> Strike +edge (2) Action: 1 + 2 = 3 | Challenge: 10, 9 Miss Fight turns against you. You are in a bad spot. Pay the Price. ⚔ Attempt to Finish the Fight: The Ashen Wake cutter

> **TABLE — Gamemaster**
>
> Pay the Price Strike As stated before the roll: The cutter's return fire rakes the berth and you lose your angle. Routes to Withstand Damage (-1).

> **TABLE — Gamemaster**
>
> Withstand Damage (-1) Kobayashi IV: 5 → 4

> **NARRATOR — Gamemaster**
>
> The guns bark first, and the cutter simply is not where the scope said it would be. Its drive flares sideways, and the return fire comes down the docking ring in a hot white line. Bolts chew the berth plating, and the couch bucks under you. The scope goes to static, the angle gone. Behind the sled, a dock hand is shouting something you cannot hear. The Ashen Wake slews round for a second pass, gunports wide.

**Notes.** Strike, a miss: the stated price paid (integrity 5 → 4); the narration tells the angle lost. Right.

### a33 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: I'm in a bad spot, so I fight back hard: I swing the guns onto the cutter as she slews round and fire from the berth. — _attack again_
- **Notebook:** Beat12: said attack again line
- **Calls (2):** callReaderAPI>readLine (1.7 s); the AI player (2.7 s)
- **Roll:** clash → weak_hit (scripted dice) — Action: 1 + 2 = 3 \| Challenge: 1, 6
- **GM's rules:** accepted the proposed move (clash)
- **Time:** 14.4 s · **cost:** $0.0173

> **PLAYER — Playthrough Player**
>
> I'm in a bad spot, so I fight back hard: I swing the guns onto the cutter as she slews round and fire from the berth.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 1 + 2 = 3 | Challenge: 1, 6 Weak Hit Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price. 🔥 Burn Momentum (7 → Strong Hit) Keep the result Nothing has been paid or narrated yet: burn or improve the result, or keep it — the price and the narration follow your choice. Your next line keeps it. ⚔ Attempt to Finish the Fight: The Ashen Wake cutter

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on The Ashen Wake cutter .

**Notes.** Clash, a weak hit: progress marked and a counterblow; the momentum burn follows.

### a34 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** click "🔥 Burn Momentum (7 → Strong Hit)" on m11 — _Beat says burn_
- **Notebook:** Beat12: pressed Burn Momentum
- **Calls (4):** callNarratorAPI>narrateResolution (3.9 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.4 s)
- **Beat 12 done:** clash came up weak_hit at a33 and momentum was burned for strong_hit
- **Time:** 20.0 s · **cost:** $0.0300

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on The Ashen Wake cutter .

> **NARRATOR — Gamemaster**
>
> The guns find the cutter as she slews, and this time the scope holds. Bolts stitch her flank and tear a gout of white fire from the drive housing. The Ashen Wake lurches, her second pass gone ragged. Behind the sled, the dock hand has stopped shouting. "She's hurt, she's turning," somebody yells down the gantry. The cutter's gunports are still wide, and one of them swings toward your berth.

**Notes.** The progress card, and the narration of the clash burned to a strong hit: the drive housing hit.

### x13 · beat 13: Interruption: the GM's page reloads mid-fight

- **Interruption:** the GM's page reloaded — the page came back and the world went quiet
- **Beat 13 done:** after the reload: the fight "The Ashen Wake cutter" at 16 ticks, the meters unchanged, the lock free

> **TABLE — Gamemaster**
>
> ◈ Campaign Setup No World Truths have been established for this campaign. Set World Truths ▸

**Notes.** The reload. "◈ Campaign Setup — No World Truths have been established" posts again on the reload (WORLD-TRUTHS-REMINDER-ON-RELOAD, a sixth sample).

### a35 · beat 14: Take Decisive Action; mark the milestone

- **Player:** click "⚔ Attempt to Finish the Fight: The Ashen Wake cutter" on m9 — _Finish the fight_
- **Notebook:** Beat14: pressed Attempt to Finish; look for Mark milestone
- **Calls (4):** callNarratorAPI>narrateResolution (4.1 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.4 s)
- **Roll:** take_decisive_action → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (take_decisive_action)
- **Time:** 21.9 s · **cost:** $0.0293

> **TABLE — Mira Kestrel**
>
> Take decisive action to seize the objective — The Ashen Wake cutter.

> **TABLE — Gamemaster**
>
> Take Decisive Action progress (16 ticks) Progress: 4 | Challenge: 1, 2 Strong Hit Prevail. Take +1 momentum.

> **TABLE — Gamemaster**
>
> Fight over The Ashen Wake cutter marked complete.

> **TABLE — Gamemaster**
>
> ⚔ Victory — a milestone toward your vow You won the fight serving “Find who is raiding the Cinder Expanse lanes”. ⚑ Mark milestone (×1) 🏁 Attempt to Fulfill 🤝 Deepen your bond with Tamsin Vey

> **NARRATOR — Gamemaster**
>
> A dock hand peers over the sled, eyes on the sky, mouth open. You swing the guns through the cutter's turn and hold the scope on the wounded drive. The last volley goes in clean and the housing splits open. The Ashen Wake's gunport swings toward you, then drops, its aim gone as the drive dies. She drifts down the docking ring, trailing white fire, no longer fighting. The berth is quiet except for the hiss of the coolant line.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 3)

**Notes.** Take Decisive Action, a strong hit: the fight won, the milestone marked on the vow it served. The cards follow the roll card (CARDS-STILL-ABOVE-THEIR-ROLL held).

### a36 · beat 14: Take Decisive Action; mark the milestone

- **Player:** click "⚑ Mark milestone (×1)" on m10 — _Mark milestone on victory card_
- **Notebook:** Beat14: pressed Mark milestone
- **Calls (1):** the AI player (2.5 s)
- **Beat 14 done:** Take Decisive Action came up strong_hit; the milestone (×1) is marked on "Find who is raiding the Cinder Expanse lanes"
- **Time:** 9.1 s · **cost:** $0.0103

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** The milestone's card.

### x15 · beat 15: Interruption: End a Session opened and closed unanswered

- **Interruption:** End a Session was opened on the player's screen and closed unanswered — closed by its close control
- **Beat 15 done:** End a Session was opened and closed unanswered: the session is open, nothing was paid, the lock is free

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** End a Session opened and closed unanswered (beat 15): nothing paid, the session open.

### a37 · beat 16: Interruption: the X-Card on one narration

- **Player:** say: I climb out of the berth and look over the wreckage of the cutter drifting down the ring, and say what I see. — _beat 16_
- **Notebook:** Beat16: said wreckage line
- **Calls (6):** callReaderAPI>readLine (1.1 s); callNarratorAPI>getRollingSessionSummary (2.6 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (2.1 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.6 s)
- **Time:** 23.5 s, 8.6 s from the line to its reply · **cost:** $0.0347

> **PLAYER — Playthrough Player**
>
> I climb out of the berth and look over the wreckage of the cutter drifting down the ring, and say what I see.

> **NARRATOR — Gamemaster**
>
> "She's dead in the ring, drive's gone." The dock hand's voice cracks as you climb out and cross the scarred plating. The Ashen Wake turns slowly, venting white fire into the dark. Her flank is split, and one gunport hangs open with nothing behind it. Along the gantry, people are coming out of cover. A woman in a station jacket points at the cutter's hull and then at you.

> **TABLE — Gamemaster**
>
> ◈ Narrative Review The narrator may have contradicted an established fact. Ashen Wake — The cutter is now visibly dead in the ring, drive gone, flank split and a gunport hanging open.

**Notes.** The wreck looked over. A ◈ Narrative Review card posts — "The narrator may have contradicted an established fact. Ashen Wake — The cutter is now visibly dead in the ring" — for a narration true to the fight: a change of state read as a contradiction (finding 7).

### x16 · beat 16: Interruption: the X-Card on one narration

- **Interruption:** the X-Card was played from the player's client (!x); the GM resumed (!x clear) — the X-Card went up and came down
- **Beat 16 done:** 1 narration(s) removed; none of their facts stands, and play has resumed

> **TABLE — Mira Kestrel**
>
> X-Card Scene paused. Current content is suppressed. The story will redirect at the next narration beat. Resume narration

> **TABLE — Gamemaster**
>
> X-Card cleared The GM has resumed narration.

**Notes.** The X-Card, and the GM's resume (beat 16): one narration removed, none of its facts standing.

### a38 · beat 17: Correct an earlier fact

- **Player:** say: @scene Where is the Kobayashi IV? — _beat asks_
- **Notebook:** Beat17: asked where ship; next !truth list
- **Calls (2):** callNarratorAPI>interrogateScene (1.6 s); the AI player (2.6 s)
- **Time:** 10.5 s, 2.2 s from the line to its reply · **cost:** $0.0353

> **PLAYER — Playthrough Player**
>
> @scene Where is the Kobayashi IV?

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV is docked at Bleakhold Station, in the Cinder Expanse. Her guns are still trained down the docking ring where the Ashen Wake drifts.

**Notes.** @scene: the ship docked at Bleakhold Station — right.

### a39 · beat 17: Correct an earlier fact

- **Player:** say: !truth list — _list truths_
- **Notebook:** Beat17: said !truth list; next strike id
- **Calls (1):** the AI player (2.4 s)
- **Time:** 9.4 s · **cost:** $0.0093

> **PLAYER — Playthrough Player**
>
> !truth list

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity No truths are recorded in this scene. Earlier this session — strike one the same way: Scene 2 — the expedition The clipped hauler's distress source has begun (Creature boneyard in uncharted space): tr-5d08e Kobayashi IV — the scan of the ribs turned up something worse, and the effort cost Mira supply Scene 3 — the characters have reached Clipped Hauler's Distress Source (inside the dead hull among the bone-white ribs): tr-349ff Kobayashi IV — docked at Bleakhold Station after clearing the bone-white ribs Scene 4 — the characters have reached Bleakhold Station (Bleakhold Station docking gantry): tr-638e2 raider cutter — is named the Ashen Wake tr-5d338 Ashen Wake — raider cutter that attacked the Kobayashi IV's berth along the docking ring at Bleakhold Station tr-82538 Kobayashi IV — docked guns trained on the Ashen Wake's drive, giving Mira the angle on the cutter tr-c5cf9 Ashen Wake — dodged Mira's first volley and raked the Kobayashi IV's berth with return fire along the docking ring tr-ca0b7 Kobayashi IV — lost her firing angle on the Ashen Wake's drive; berth plating torn by return fire Scene 5 — a fight has begun: The Ashen Wake cutter (Kobayashi IV's berth, Bleakhold Station docking ring): tr-5900b Ashen Wake — took heavy hits to her flank and drive housing from the Kobayashi IV's guns during her second pass tr-f9e75 Ashen Wake — drive destroyed by Mira's final volley; the cutter has stopped fighting and is drifting along the docking ring

**Notes.** !truth list: the earlier scene's truths shown, with how to strike one.

### a40 · beat 17: Correct an earlier fact

- **Player:** say: !truth strike tr-638e2 — _strike the entry_
- **Notebook:** Beat17: said strike tr-638e2; next truth set Cinder Wren
- **Calls (1):** the AI player (2.8 s)
- **Time:** 8.6 s · **cost:** $0.0105

> **PLAYER — Playthrough Player**
>
> !truth strike tr-638e2

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth tr-638e2 struck — it was set in an earlier scene of this session.

**Notes.** !truth strike: the cutter's name struck.

### a41 · beat 17: Correct an earlier fact

- **Player:** say: !truth set "raider cutter" is named the Cinder Wren — _final step_
- **Notebook:** Beat17: said truth set Cinder Wren
- **Calls (1):** the AI player (2.5 s)
- **Beat 17 done:** the old value is struck (or was never in the ledger) and "is named the Cinder Wren" stands
- **Time:** 10.7 s · **cost:** $0.0098

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Cinder Wren

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Cinder Wren tr-bdae1 .

**Notes.** !truth set: the cutter is the Cinder Wren (the correction).

### a42 · beat 18: Ask the oracle

- **Player:** say: !oracle yes likely Is anyone left alive aboard the wreck? — _beat asks_
- **Notebook:** Beat18: said !oracle line
- **Calls (3):** callNarratorAPI>narrateOracleFollowup (4.2 s); callHaiku>defaultCallDetectionAPI (0.5 s); the AI player (2.5 s)
- **Beat 18 done:** the oracle answered NO
- **Time:** 17.0 s, 6.8 s from the line to its reply · **cost:** $0.0418

> **PLAYER — Playthrough Player**
>
> !oracle yes likely Is anyone left alive aboard the wreck?

> **TABLE — Mira Kestrel**
>
> Ask the Oracle (likely) Is anyone left alive aboard the wreck? d100 = 97 → NO

> **NARRATOR — Gamemaster**
>
> The comm panel gives back nothing but the long hiss of an open channel. Down the docking ring the Cinder Wren turns slowly on her dead drive, and the scope shows no heat in her crew spaces, no hand at a hatch, no light behind the ports. Whoever flew her stopped being anyone the moment the housing split, and the quiet along the gantry says the dock hands have reached the same conclusion.

**Notes.** The oracle, likely, rolled 97 → NO: "Is anyone left alive aboard the wreck?" The narration tells no — "no heat in her crew spaces, no hand at a hatch" (ORACLE-NO-NARRATED-AS-YES held; its check had nothing to catch).

### x19 · beat 19: Interruption: the GM renames the connection's card

- **Interruption:** the GM renamed Tamsin Vey's card to Tamsin Okoro — renamed
- **Beat 19 done:** Tamsin Vey is now Tamsin Okoro; the vow "Find who is raiding the Cinder Expanse lanes" shows the new name

> **TABLE — Tamsin Okoro**
>
> Renamed to Tamsin Okoro

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Vey renamed to Tamsin Okoro

**Notes.** The GM's rename: Tamsin Vey is now Tamsin Okoro.

### a43 · beat 20: End a Session

- **Player:** say: !end-session — _start end session_
- **Notebook:** Beat20: said !end-session; fill questFocus
- **Calls (1):** the AI player (2.6 s)
- **Time:** 2.8 s · **cost:** $0.0096

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** The table's !end-session.

## after-session-2

### a44 · beat 20: End a Session

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with focus_
- **Notebook:** Beat20: submitted End Session
- **Calls (7):** callNarratorAPI>getRollingSessionSummary ×2 (2.5 s); callNarratorAPI>narrateSessionVignette (4.4 s); callNarratorAPI>getCampaignRecap ×2 (6.7 s); callHaiku>defaultCallTierAPI (0.3 s); the AI player (2.6 s)
- **Beat 20 done:** session 2 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 36.5 s · **cost:** $0.0916

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

> **NARRATOR (npc_end) — Gamemaster**
>
> In the staging bay off the Hollow Spire airlock, Tamsin Okoro stands with a stylus behind her ear and a stack of survey chits under her arm. The bay is cold and smells of seal grease, and the docked haulers wait their turn at the lock. She has been through these chits twice already, tallying what was logged and what was not, and she pencils a small mark beside the one she keeps coming back to. Somewhere beyond the inner door a pressure line is quietly shifting, a boundary that moves a hand's width every hour, and she shoulders the chits higher and watches it go.

**Notes.** End a Session: the closing cuts away to Tamsin in the Hollow Spire staging bay — someone absent, at the place her record has her.

### a45 · beat 21: Begin a Session; ask probe set B

- **Player:** say: !begin-session — _start session 3_
- **Notebook:** Beat21: said !begin-session; press Begin
- **Calls (1):** the AI player (2.5 s)
- **Time:** 2.5 s · **cost:** $0.0092

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** The table's !begin-session.

## session-3

### a46 · beat 21: Begin a Session; ask probe set B

- **Player:** in "Begin a Session" press "Begin" — _Begin session_
- **Notebook:** Beat21: pressed Begin; next ask 7 questions
- **Calls (4):** callNarratorAPI>narrateSessionVignette ×2 (4.7 s); callHaiku>defaultCallTierAPI (0.3 s); the AI player (2.5 s)
- **Time:** 26.5 s · **cost:** $0.0630

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> You sit in the cockpit with the guns still trained down the ring, doing sums you would rather not do. Somewhere in the Expanse there is a deadline with your name on it, and a rival hauler's, and you are working out whose hand is faster. The Cinder Wren turns on her dead drive in the viewport, and the dock hands along the gantry have gone quiet, which on a station like this passes for tact. Past her, on the ring's far wall, an ostentatious stretch of gilded paneling gleams, a lavish lounge fitted into a docking ring where nobody ever sat down. You decide it is the only thing at Bleakhold with a budget, and that it spent it badly.

**Notes.** Session 3's opening: "You sit in the cockpit with the guns still trained down the ring" — where session 2 stopped. Its first draft wrote "Clash Time:" — a rolled result's words as a label — and the [material] check re-asked it; the posted opening is the mended one.

### a47 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Remind me, which keepsake of my sister's is on me? — _probe Q1_
- **Notebook:** Beat21: asking Q1 of 7
- **Calls (2):** callNarratorAPI>interrogateScene (1.4 s); the AI player (3.0 s)
- **Time:** 10.1 s, 2.1 s from the line to its reply · **cost:** $0.0174

> **PLAYER — Playthrough Player**
>
> @scene Remind me, which keepsake of my sister's is on me?

> **NARRATOR — Gamemaster**
>
> You carry Ilse's brass star-compass, the one thing of hers you still have.

**Notes.** @scene, set B: the compass.

### a48 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Who do I count as a friend among the dock traders back where this began? — _Q2_
- **Notebook:** Beat21: Q1 answered; asking Q2 of 7
- **Calls (2):** callNarratorAPI>interrogateScene (1.8 s); the AI player (2.7 s)
- **Time:** 11.1 s, 2.2 s from the line to its reply · **cost:** $0.0162

> **PLAYER — Playthrough Player**
>
> @scene Who do I count as a friend among the dock traders back where this began?

> **NARRATOR — Gamemaster**
>
> You have one connection among them: Tamsin Okoro, the salvage broker at the ledger stall on the Hollow Spire docks. She is no friend yet, since the relationship has no marks on it and she holds your cargo manifest and your promise to bring water and real goods before the next tide of cargo.

**Notes.** @scene, set B: Tamsin, "the salvage broker at the ledger stall on the Hollow Spire docks".

### a49 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Whose hands is the manifest in these days? — _Q3_
- **Notebook:** Beat21: Q2 answered; asking Q3 of 7
- **Calls (2):** callNarratorAPI>interrogateScene (1.8 s); the AI player (2.4 s)
- **Time:** 17.8 s, 2.8 s from the line to its reply · **cost:** $0.0160

> **PLAYER — Playthrough Player**
>
> @scene Whose hands is the manifest in these days?

> **NARRATOR — Gamemaster**
>
> Tamsin Okoro has it, tucked under her stack of survey chits at the ledger stall on the Hollow Spire docks. You left it with her for safekeeping, and she has refused to hand it back.

**Notes.** @scene, set B: the manifest with Tamsin, "at the ledger stall on the Hollow Spire docks".

### a50 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene What deadline did I give for coming home to the docks? — _Q4_
- **Notebook:** Beat21: Q3 answered; asking Q4 of 7
- **Calls (2):** callNarratorAPI>interrogateScene (1.4 s); the AI player (2.5 s)
- **Time:** 11.9 s, 2.3 s from the line to its reply · **cost:** $0.0158

> **PLAYER — Playthrough Player**
>
> @scene What deadline did I give for coming home to the docks?

> **NARRATOR — Gamemaster**
>
> You promised Tamsin Okoro you would be back before the next tide of cargo. The story has not set that tide to a date, so the deadline has no hour or day attached.

**Notes.** @scene, set B: the promise; no hour set.

### a51 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Where is my ship berthed right now, and who commands her? — _Q5_
- **Notebook:** Beat21: Q4 answered; asking Q5 of 7
- **Calls (2):** callNarratorAPI>interrogateScene (1.2 s); the AI player (2.4 s)
- **Time:** 11.0 s, 2.2 s from the line to its reply · **cost:** $0.0162

> **PLAYER — Playthrough Player**
>
> @scene Where is my ship berthed right now, and who commands her?

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV is docked at Bleakhold Station, at your berth along the docking ring, and you command her. She is holding at integrity 4 of 5, and the Cinder Wren drifts nearby with her drive destroyed.

**Notes.** @scene, set B: the ship docked at Bleakhold, integrity 4 of 5 — right.

### a52 · beat 21: Begin a Session; ask probe set B

- **Player:** say: What is the raider cutter called? — _Q6_
- **Notebook:** Beat21: Q5 answered; asking Q6 of 7
- **Calls (5):** callReaderAPI>readLine (1.4 s); callNarratorAPI>narratePacedInput (4.3 s); callHaiku>defaultCallDetectionAPI (1.3 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.9 s)
- **Time:** 25.5 s, 8.0 s from the line to its reply · **cost:** $0.0344

> **PLAYER — Playthrough Player**
>
> What is the raider cutter called?

> **NARRATOR — Gamemaster**
>
> The answer is in the name. Along the Cinder Wren's flank, under scorch and torn plating, the hull letters still read. It is her. She turns slowly on her dead drive, and nothing aboard her moves. On the comm, a dock officer clears his throat. "That cutter's been working these lanes for a season," he says. "Someone fed her. Station crews don't say who." The gantry hands have gone back to their work. One of them has not.

**Notes.** The cutter's name asked in play: the Cinder Wren, told in the scene. Four [dice] lines about the cutter ride on it (finding 2).

### a53 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene What surname does my broker friend go by these days? — _Ask last question_
- **Notebook:** Beat21: Q6 answered; asking Q7 of 7
- **Calls (2):** callNarratorAPI>interrogateScene (1.8 s); the AI player (2.6 s)
- **Beat 21 done:** probe set B: 7 question(s) asked
- **Time:** 12.9 s, 2.8 s from the line to its reply · **cost:** $0.0369

> **PLAYER — Playthrough Player**
>
> @scene What surname does my broker friend go by these days?

> **NARRATOR — Gamemaster**
>
> Her surname is Okoro: Tamsin Okoro, the salvage broker who keeps the ledger stall on the Hollow Spire docks.

**Notes.** @scene: Tamsin Okoro, "who keeps the ledger stall on the Hollow Spire docks".

### a54 · beat 22: Recover

- **Player:** say: I rest aboard until the next morning. — _beat start_
- **Notebook:** Beat22: said rest line; next mend ship/supply
- **Calls (6):** callReaderAPI>readLine (1.0 s); callNarratorAPI>getRollingSessionSummary (1.7 s); callNarratorAPI>narratePacedInput (8.5 s); callHaiku>defaultCallDetectionAPI (1.6 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.5 s)
- **Time:** 26.8 s, 13.5 s from the line to its reply · **cost:** $0.0390

> **PLAYER — Playthrough Player**
>
> I rest aboard until the next morning.

> **NARRATOR — Gamemaster**
>
> The berth is quiet when you wake. Bleakhold's ring hums its usual low note, and the plating torn by the Cinder Wren's fire has been taped over with a gantry crew's sealant. Someone has left a data chit on the lock sill. The Cinder Wren still turns on her dead drive beyond the viewport. At the lock, a gantry hand waits with his hands in his pockets. "Station factor wants a word," he says. "She didn't say what about."

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Station Factor — The station factor of Bleakhold, who wants a word with Mira Kestrel and has sent a gantry hand to fetch her. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

**Notes.** A time skip: the scene turns ("time has passed"). It is session 3's last turn: the rest of the session — 23 narrations of play — is one scene (finding 6).

### a55 · beat 22: Recover

- **Player:** say: I get out my tools and go over the hull and systems the cutter's fire damaged, patching what I can. — _mend ship_
- **Notebook:** Beat22: said ship repair line
- **Calls (5):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narratePacedInput (3.1 s); callHaiku>defaultCallDetectionAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (3.0 s)
- **Time:** 22.4 s, 7.7 s from the line to its reply · **cost:** $0.0554

> **PLAYER — Playthrough Player**
>
> I get out my tools and go over the hull and systems the cutter's fire damaged, patching what I can.

> **NARRATOR — Gamemaster**
>
> You pull the sealant tape back and find the plating buckled in two places. Your tools are laid out on the deck. The gantry hand shifts his weight at the lock and says nothing more. The data chit sits where it was left, face down, still unread. Beyond the viewport, the Cinder Wren turns on, and nothing moves aboard her. *Setting hands to the buckled plating in earnest would be a Repair.*

**Notes.** The repair line, narrated with Repair offered.

### a56 · beat 22: Recover

- **Player:** click "Roll Repair" on m12 — _Card offers the roll_
- **Notebook:** Beat22: pressed Roll Repair
- **Calls (3):** callNarratorAPI>narrateResolution (3.9 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.5 s)
- **Roll:** repair → weak_hit — Action: 3 + 3 = 6 \| Challenge: 6, 4
- **GM's rules:** accepted the proposed move (repair)
- **Beat 22 done:** repair came up weak_hit at a56
- **Time:** 21.8 s · **cost:** $0.0297

> **TABLE — Mira Kestrel**
>
> I get out my tools and go over the hull and systems the cutter's fire damaged, patching what I can.

> **TABLE — Gamemaster**
>
> Repair +wits (3) Action: 3 + 3 = 6 | Challenge: 6, 4 Weak Hit Gain repair points: facility 3, field 1, under fire 0. Same spend options. 🔧 Spend repair points

> **NARRATOR — Gamemaster**
>
> The gantry hand watches you work and says nothing. You hammer the first buckle flat and seat the sealant. It holds. The second plate fights you, and when it gives, it gives crooked, with a seam you cannot close. One patch is sound. The other will do for now. The data chit still lies face down on the sill, and the hand glances at it twice.

**Notes.** Repair, a weak hit: "Gain repair points: facility 3, field 1, under fire 0" and the card's "🔧 Spend repair points" button (REPAIR-POINTS-UNREACHABLE's fix on the card). The player did not press it; the narration tells one patch sound and one crooked.

### a57 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I hail Tamsin Okoro and give her the survey chits I salvaged from the cutter's wake, free, because she can use them more than I can. — _grow bond_
- **Notebook:** Beat23: first closeness line said
- **Calls (6):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narratePacedInput (5.0 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (1.6 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (3.1 s)
- **Time:** 27.0 s, 10.3 s from the line to its reply · **cost:** $0.0342

> **PLAYER — Playthrough Player**
>
> I hail Tamsin Okoro and give her the survey chits I salvaged from the cutter's wake, free, because she can use them more than I can.

> **NARRATOR — Gamemaster**
>
> "Free?" Tamsin's voice comes thin over the comm. "Nobody gives me chits for free." A ledger page turns on her end. "I'll take them. But I'm writing it down, and you'll find out what I think it's worth." At the lock, the gantry hand has stopped glancing at the data chit and started watching you instead. Tamsin goes quiet, then asks what else was in that wake. *Whether this gift buys you anything with her would be a Develop Your Relationship.*

**Notes.** Mira hails Tamsin over the comm. The frame lists Tamsin as present — the fact block's rule says to include characters on comms — and from here the record reads her as at Bleakhold (finding 1).

### a58 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Card offers the roll_
- **Notebook:** Beat23: pressed Roll Develop Your Relationship
- **Calls (5):** callNarratorAPI>narrateResolution (4.2 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.5 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 21.8 s · **cost:** $0.0328

> **TABLE — Mira Kestrel**
>
> I hail Tamsin Okoro and give her the survey chits I salvaged from the cutter's wake, free, because she can use them more than I can.

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Okoro .

> **NARRATOR — Gamemaster**
>
> Tamsin's pen scratches on the other end of the comm. "Fine. The chits go in my book as yours, and the book remembers." She pauses over a page. "Next time you come to my stall, I'll know what to ask you for." At the lock, the gantry hand clears his throat and nods toward the sill. The data chit lies there, face down, still unsent to anyone's hands but yours. "Well?" Tamsin says. "Was the wake empty, or wasn't it?"

**Notes.** Develop Your Relationship, over the comm.

### a59 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I tell Tamsin the wake wasn't empty, and read her the cutter's registry marks from the data chit, because she's the one I trust with it. — _Continue growing bond_
- **Notebook:** Beat23: second closeness line said (shared chit)
- **Calls (6):** callReaderAPI>readLine (1.8 s); callNarratorAPI>narratePacedInput (4.3 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.8 s)
- **Time:** 29.0 s, 7.8 s from the line to its reply · **cost:** $0.0354

> **PLAYER — Playthrough Player**
>
> I tell Tamsin the wake wasn't empty, and read her the cutter's registry marks from the data chit, because she's the one I trust with it.

> **NARRATOR — Gamemaster**
>
> The pen stops when you start reading. You give her the registry marks one line at a time, and each line takes longer to answer than the last. The gantry hand has gone very still at the lock. "Read that last mark again," Tamsin says. You do, and she is quiet. Then the pen scratches once, hard. "Don't say that over an open channel again. Come to my stall and say it where I can see your face."

**Notes.** The registry marks read to Tamsin; she asks to hear them in person, at her stall.

### a60 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I fly the Kobayashi IV's skiff to her stall and lay my own last ration of credits on her ledger to cover the risk she's taking, then say it to her face. — _continue building relationship_
- **Notebook:** Beat23: third closeness line said (went to stall)
- **Calls (6):** callReaderAPI>readLine (1.8 s); callNarratorAPI>narratePacedInput (4.0 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.3 s)
- **Time:** 22.9 s, 8.1 s from the line to its reply · **cost:** $0.0386

> **PLAYER — Playthrough Player**
>
> I fly the Kobayashi IV's skiff to her stall and lay my own last ration of credits on her ledger to cover the risk she's taking, then say it to her face.

> **NARRATOR — Gamemaster**
>
> The skiff clears the ring and noses down toward Hollow Spire's docks. Tamsin's stall is lit, the ledger open on the counter. You set your last credits beside it and say the registry marks aloud, line by line, to her face. She does not touch the credits. Her eyes stay on yours, and her pen hangs above the page. "Say the last one again," she says, very quietly. *Whether this earns her trust would be a Develop Your Relationship.*

**Notes.** "I fly the Kobayashi IV's skiff to her stall …" — the line names neither Tamsin nor Hollow Spire. The narration: "The skiff clears the ring and noses down toward Hollow Spire's docks" — another settlement, with no journey's move (finding 1). The reader read Develop Your Relationship; its situation had Tamsin present and no Elsewhere line. The fact block's frame, "Tamsin Okoro's ledger stall, Hollow Spire docks", was not taken (#393 D4): the record and THE SCENE stayed at Bleakhold.

### a61 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Card offers the roll for my line._
- **Notebook:** Beat23: pressed roll on m12 stall line
- **Calls (5):** callNarratorAPI>narrateResolution (4.4 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.9 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 23.6 s · **cost:** $0.0284

> **TABLE — Mira Kestrel**
>
> I fly the Kobayashi IV's skiff to her stall and lay my own last ration of credits on her ledger to cover the risk she's taking, then say it to her face.

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Okoro .

> **NARRATOR — Gamemaster**
>
> The ledger boy at the next stall has stopped counting water tokens and is openly listening. Tamsin's pen finally comes down. She writes one line, blots it, and turns the book so you can see your name above it. "The credits stay on the counter," she says. "The marks stay in my head. I'll want something specific from you next time." She slides the scrap chit back across. Her thumb is still on its corner. "Who else has heard that last mark?"

**Notes.** Develop Your Relationship; its narration goes on at the stall, its frame again at the Hollow Spire docks, again not taken.

### a62 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: Only the gantry hand heard it. I tell her I'll stand watch at her stall tonight myself, so nobody comes asking after her book. — _continue bonding_
- **Notebook:** Beat23: fourth closeness roll pressed; fifth line said (watch stall)
- **Calls (6):** callReaderAPI>readLine (1.0 s); callNarratorAPI>narratePacedInput (5.2 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.1 s)
- **Time:** 21.6 s, 8.4 s from the line to its reply · **cost:** $0.0387

> **PLAYER — Playthrough Player**
>
> Only the gantry hand heard it. I tell her I'll stand watch at her stall tonight myself, so nobody comes asking after her book.

> **NARRATOR — Gamemaster**
>
> "Only the gantry hand?" Tamsin says. Her pen stops over the page. "Then he's the one I worry about." She does not thank you for the offer of a watch. She tears a strip from the ledger margin, writes a name on it, and folds it small. Down the counter, the ledger boy has quietly gone back to his tokens. "Stand where you like," she says. "But watch the dock, not my book." *Whether this watch earns her trust would be a Develop Your Relationship.*

**Notes.** The watch offered; the frame at the Hollow Spire docks, not taken.

### a63 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Roll offered for the watch._
- **Notebook:** Beat23: sixth roll pressed on m12
- **Calls (4):** callNarratorAPI>narrateResolution (4.3 s); callHaiku>defaultCallDetectionAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (2.5 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 22.3 s · **cost:** $0.0283

> **TABLE — Mira Kestrel**
>
> Only the gantry hand heard it. I tell her I'll stand watch at her stall tonight myself, so nobody comes asking after her book.

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Okoro .

> **NARRATOR — Gamemaster**
>
> Tamsin's pen moves again. She writes your name in the ledger's margin, then the date, then a short mark you cannot read. The ink is still wet when she turns the book flat. "That's a debt of mine, and I keep those," she says. She does not smile. The folded strip stays in her fist, and the gantry hand has stopped pretending to coil cable. Down the dock, a lock cycles, and he is already walking toward it.

**Notes.** Develop Your Relationship.

### a64 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I follow the gantry hand to the lock and block his way, telling him plainly that if he goes near Tamsin's book I'll answer for it. — _continue building bond_
- **Notebook:** Beat23: seventh line said (blocked gantry hand)
- **Calls (6):** callReaderAPI>readLine (2.1 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (1.3 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (3.0 s)
- **Time:** 21.9 s, 9.4 s from the line to its reply · **cost:** $0.0381

> **PLAYER — Playthrough Player**
>
> I follow the gantry hand to the lock and block his way, telling him plainly that if he goes near Tamsin's book I'll answer for it.

> **NARRATOR — Gamemaster**
>
> The gantry hand stops with one boot over the lock sill. You step into his path, and he looks at your hand before he looks at your face. "I only carry cable," he says. His voice is not steady. Behind you, Tamsin's pen scratches once and goes still. The cycling lock hisses open beside him, and he does not go through it. He wants to know who told you what he heard. *Holding him here with a threat would be a Compel.*

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Gantry Hand — An unnamed gantry worker who stops at the lock with one boot over the sill, claims he only carries cable, and asks who told Mira what he heard. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

**Notes.** The gantry hand blocked at "the dock lock near Tamsin Okoro's stall, Hollow Spire docks" — the fifth frame not taken in a row. Nothing told the narrator its frame was not taken.

### a65 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I let the gantry hand go and walk back to Tamsin's stall, and I tell her I'll carry the risk of that last mark with her, to Develop Your Relationship — _last resort allowed_
- **Notebook:** Beat23: used last resort line
- **Calls (6):** callReaderAPI>readLine (1.0 s); callNarratorAPI>narrateResolution (4.2 s); callHaiku>defaultCallDetectionAPI (1.3 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.5 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 24.4 s, 10.0 s from the line to its reply · **cost:** $0.0360

> **PLAYER — Playthrough Player**
>
> I let the gantry hand go and walk back to Tamsin's stall, and I tell her I'll carry the risk of that last mark with her, to Develop Your Relationship

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Okoro .

> **NARRATOR — Gamemaster**
>
> The gantry hand goes through the lock without another word, and you let him. You walk back along the dock to Tamsin's stall. She looks up before you reach the counter. "I'll carry that mark with you," you say. Her pen stops. She reads your face a long moment, then turns the book so the new line faces you. "Then you'll carry it where I can see you," she says, and the folded strip stays shut in her fist.

**Notes.** Develop Your Relationship. The frame now reads "Tamsin's ledger stall, Bleakhold docks": the narration has moved Tamsin's stall to Bleakhold to match the record (finding 1).

### a66 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I set my sister Ilse's brass star-compass on her counter for a moment and tell her it's the one thing I'd never lend anyone, but I trust her to see it. — _continue bonding_
- **Notebook:** Beat23: eighth line said (showed compass)
- **Calls (6):** callReaderAPI>readLine (2.0 s); callNarratorAPI>narratePacedInput (4.4 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.8 s)
- **Time:** 21.8 s, 9.2 s from the line to its reply · **cost:** $0.0392

> **PLAYER — Playthrough Player**
>
> I set my sister Ilse's brass star-compass on her counter for a moment and tell her it's the one thing I'd never lend anyone, but I trust her to see it.

> **NARRATOR — Gamemaster**
>
> Down the counter, the ledger boy has stopped counting tokens altogether. You set the brass star-compass on the wood, and Tamsin's pen stops mid-stroke. She looks at it, then at you, and does not touch it. The needle swings once and settles toward the dock. "Lend it to no one," she says quietly. "Good. I keep what's left with me, not what's lent." Her free hand rests flat beside the compass, close enough to feel its warmth. *Whether this earns her trust would be a Develop Your Relationship.*

**Notes.** The compass set on the counter, narrated with Develop offered.

### a67 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Answer the offered roll_
- **Notebook:** Beat23: ninth roll pressed (compass)
- **Calls (4):** callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.5 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 22.3 s · **cost:** $0.0275

> **TABLE — Mira Kestrel**
>
> I set my sister Ilse's brass star-compass on her counter for a moment and tell her it's the one thing I'd never lend anyone, but I trust her to see it.

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Okoro .

> **NARRATOR — Gamemaster**
>
> "You'll want this back," Tamsin says, and she pushes the compass an inch toward you with one knuckle. She still has not touched it. "Whoever hears you carry that thing will know where to press." She taps the ledger twice, beside your name. "Keep it in your coat when you walk my docks." The folded strip stays in her fist. Down the counter, the ledger boy has gone very still, listening.

**Notes.** Develop Your Relationship.

### a68 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: Tamsin, you've carried this with me when you didn't have to. Will you stand with me for good, past this job, whatever comes? — _Track full, make the ask._
- **Notebook:** Beat23: track full; asked her to stand with me for good
- **Calls (6):** callReaderAPI>readLine (2.3 s); callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.9 s)
- **Roll:** forge_a_bond → strong_hit (scripted dice) — Progress: 10 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (forge_a_bond)
- **Beat 23 done:** a bond is forged with Tamsin Okoro (dangerous), its track at 40 ticks
- **Time:** 33.9 s, 12.3 s from the line to its reply · **cost:** $0.0362

> **PLAYER — Playthrough Player**
>
> Tamsin, you've carried this with me when you didn't have to. Will you stand with me for good, past this job, whatever comes?

> **TABLE — Gamemaster**
>
> Forge a Bond progress (40 ticks) Progress: 10 | Challenge: 1, 2 Strong Hit Bond forged. Legacy reward marked on bonds track. Choose: Bolster Influence (+2) OR Expand Influence (second role, +1).

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro marked completed

> **TABLE — Gamemaster**
>
> ⚑ Bond Forged: Tamsin Okoro Tamsin Okoro is now bonded. Bonds legacy track: +2 ticks marked (Dangerous rank). Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress. Choose: Bolster Influence (add +2) or Expand Influence (second role, add +1).

> **NARRATOR — Gamemaster**
>
> Tamsin is quiet for a moment. Then she reaches past the compass, takes the folded strip from her fist, and tucks it into the ledger's spine. "Past this job," she says. "I've heard worse offers." She turns the book so the new line faces you, her stall mark pressed beside your name. Down the counter, the ledger boy exhales. "Don't make me regret the ink," she says. Her pen is already moving again, writing something you cannot read.

**Notes.** Forge a Bond, a strong hit: the bond forged, +2 ticks on bonds.

### a69 · beat 24: Develop Your Relationship again, bonded

- **Player:** say: I pull the survey chit's last copy from my coat and press it into Tamsin's hand, telling her I want her to hold what I know about the raids, since she's bound to me now. — _Develop relationship while bonded_
- **Notebook:** Beat24: closeness line said (bonded)
- **Calls (6):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narratePacedInput (4.1 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (3.1 s)
- **Time:** 23.2 s, 8.3 s from the line to its reply · **cost:** $0.0410

> **PLAYER — Playthrough Player**
>
> I pull the survey chit's last copy from my coat and press it into Tamsin's hand, telling her I want her to hold what I know about the raids, since she's bound to me now.

> **NARRATOR — Gamemaster**
>
> Mira's hand lingers on the chit a moment before Tamsin takes it. Tamsin does not read it. She slides it under the ledger's spine, beside the folded strip, and presses her thumb flat on top. Down the counter, the ledger boy has stopped pretending to count. "Then I hold it," she says. "And you'd better tell me who else knows you carry a copy." *Whether this trust is returned in kind would be a Develop Your Relationship.*

**Notes.** The chit pressed into Tamsin's hand. The narration opens in the third person: "Mira's hand lingers on the chit" (finding 3).

### a70 · beat 24: Develop Your Relationship again, bonded

- **Player:** click "Roll Develop Your Relationship" on m12 — _Card offers the roll_
- **Notebook:** Beat24: pressed bonded roll on m12
- **Calls (5):** callNarratorAPI>narrateResolution (4.2 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.6 s)
- **Roll:** develop_your_relationship → strong_hit — Action: 6 + 2 = 8 \| Challenge: 5, 6
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Beat 24 done:** the bonded Develop Your Relationship was rolled at a70 (strong_hit); no progress was marked
- **Time:** 21.9 s · **cost:** $0.0286

> **TABLE — Mira Kestrel**
>
> I pull the survey chit's last copy from my coat and press it into Tamsin's hand, telling her I want her to hold what I know about the raids, since she's bound to me now.

> **TABLE — Gamemaster**
>
> Develop Your Relationship +dangerous (2) Action: 6 + 2 = 8 | Challenge: 5, 6 Strong Hit Bonded: mark 2 ticks on your bonds legacy track — on a match, raise their rank by one.

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked 2 ticks on your bonds legacy track for your bond with Tamsin Okoro .

> **NARRATOR — Gamemaster**
>
> Tamsin turns the ledger so the page faces you and lays two fingers beside the line she just wrote. "Then we're past ink," she says. She slides your sister's compass back across the wood, still without touching it. "Ask me what you came to ask. I'll answer, and I'll not sell it after." Down the counter, the boy has stopped listening. Her eyes stay on you. "Who in this station owes the cutter a berth?"

> **TABLE — Gamemaster**
>
> Bonds legacy — box filled +2 XP earned (1 box filled). It shows on the character sheet’s Legacies tab — spend it there on new assets or upgrades (Earn Experience).

**Notes.** The bonded Develop, a strong hit: 2 ticks on the bonds legacy, a box filled, +2 XP.

### a71 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I go to the cutter's wreck and search her command console and logs for whoever sent her, even though the hull is breached and could vent on me. — _start beat 25_
- **Notebook:** Beat25: first search line said (wreck logs)
- **Calls (5):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narrateResolution (5.6 s); callHaiku>defaultCallDetectionAPI (1.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.9 s)
- **Roll:** gather_information → weak_hit — Action: 4 + 3 = 7 \| Challenge: 5, 8
- **GM's rules:** accepted the proposed move (gather_information)
- **Time:** 27.1 s, 12.1 s from the line to its reply · **cost:** $0.0444

> **PLAYER — Playthrough Player**
>
> I go to the cutter's wreck and search her command console and logs for whoever sent her, even though the hull is breached and could vent on me.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 4 + 3 = 7 | Challenge: 5, 8 Weak Hit New insight but also complicates quest. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> The command console is half-dead, but the logs wake when you jack in. A hiss runs along the breached hull as you work. The last sender is a berth clerk's code, logged under a hauler's name no hauler claims. You also find the Cinder Wren's last fuelling was paid in water-trade favours. Behind you, someone's boots scrape the airlock coaming. "Nobody's cleared you to be aboard her," a gantry hand calls, not stepping inside.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 5)

**Notes.** Gather Information at the cutter's wreck, a weak hit: the logs name a berth clerk. The dice had left the cutter drifting with her drive destroyed — the line's wreck is true to them, so the [dice] lines had nothing to hold.

### a72 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "⚑ Mark Progress on Vow" on m10 — _Mark progress on vow_
- **Notebook:** Beat25: pressed Mark Progress on m10 (wreck logs: berth clerk code, hauler name unclaimed)
- **Calls (3):** callNarratorAPI>narrateResolution (2.8 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.6 s)
- **GM's rules:** accepted the proposed move (reach_a_milestone)
- **Time:** 19.0 s · **cost:** $0.0276

> **TABLE — Mira Kestrel**
>
> Mark progress on your vow.

> **TABLE — Gamemaster**
>
> Reach a Milestone no action roll — the move's effect applies as written Mark progress on your vow per its rank.

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Which vow advances? Find the lost colony ship Verity's Hope (epic) Find who is raiding the Cinder Expanse lanes (dangerous)

> **NARRATOR — Gamemaster**
>
> "You'd best see this before you go back to the cutter," Tamsin says, and she opens the ledger flat. The page shows a berth clerk's code, a hauler's name with no hauler behind it, and a payment in water favours. Beside it, in her hand, are Mira's own entries from the stall. The ink on them is dry. It reads like a case now, not a rumour. Down the counter, the ledger boy has stopped pretending to count.

**Notes.** Reach a Milestone from the ⚑ button: the vow picker (two vows open).

### a73 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "Find who is raiding the Cinder Expanse lanes (dangerous)" on m11 — _Answer vow question_
- **Notebook:** Beat25: chose raids vow on m11 milestone
- **Calls (1):** the AI player (2.8 s)
- **Time:** 12.0 s · **cost:** $0.0108

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** The milestone marked.

### a74 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "🏁 Attempt to Fulfill Vow" on m4 — _Vow holds 4 boxes; fulfill offered._
- **Notebook:** Beat25: pressed Attempt to Fulfill Vow on m4
- **Calls (1):** the AI player (3.5 s)
- **Time:** 13.1 s · **cost:** $0.0116

> **TABLE — Mira Kestrel**
>
> Attempt to fulfill your vow.

> **TABLE — Gamemaster**
>
> Fulfill Your Vow — which vow? More than one vow is open and nothing named this one. Choose the vow to fulfill — nothing has been rolled yet. 🏁 Find the lost colony ship Verity's Hope — Epic, 0/10 boxes 🏁 Find who is raiding the Cinder Expanse lanes — Dangerous, 4/10 boxes

**Notes.** Fulfill Your Vow: the vow picker.

### a75 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "🏁 Find who is raiding the Cinder Expanse lanes — Dangerous, 4/10 boxe" on m12 — _Fulfill the raids vow_
- **Notebook:** Beat25: chose raids vow on m12 fulfill card
- **Calls (5):** defaultClassifyImplicit>resolveRelevance (0.7 s); callNarratorAPI>narrateResolution (3.8 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.7 s)
- **Roll:** fulfill_your_vow → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (fulfill_your_vow)
- **Beat 25 done:** the vow "Find who is raiding the Cinder Expanse lanes" is fulfilled; Tamsin Okoro's track is untouched and one bonded roll is offered
- **Time:** 26.6 s · **cost:** $0.0549

> **TABLE — Mira Kestrel**
>
> Attempt to fulfill your vow.

> **TABLE — Gamemaster**
>
> Fulfill Your Vow progress (16 ticks) Progress: 4 | Challenge: 1, 2 Strong Hit Vow fulfilled. Legacy reward marked on quests track per vow rank.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes marked completed

> **TABLE — Gamemaster**
>
> 🤝 Develop Relationship Your vow served Tamsin Okoro, and you already share a bond: no progress is marked. Roll Develop Your Relationship (+their rank) to learn the impact on your legacy. Tamsin Okoro (dangerous)

> **TABLE — Gamemaster**
>
> ℹ No concrete reward was chosen when this vow was sworn (the reward-choice card was never answered), so none is granted with its fulfilment.

> **TABLE — Gamemaster**
>
> ⚑ Vow Fulfilled: Find who is raiding the Cinder Expanse lanes The Dangerous vow is complete. Quests legacy track: +2 ticks marked.

> **NARRATOR — Gamemaster**
>
> Tamsin closes the ledger over the page and lets you read the finished thing in her face. The raids were staged by a faction inside the lanes' own water trade, to bind haulers to one supplier and keep the beacon's survey unlogged. No name is written yet. Who sits at the head of that trade stays unsaid. "Then it's done, as far as you swore it," she says.

> **TABLE — Gamemaster**
>
> The oracle, behind the scenes Find who is raiding the Cinder Expanse lanes What is behind it — Action + Theme: Debate / Greed; Re-rolled in place of "Debate / Greed": Action + Theme: Advance / Life

**Notes.** Fulfill Your Vow, a strong hit: the vow fulfilled; Tamsin already bonded, so no progress, and one bonded roll offered. The reward card says none was chosen at the oath.

### a76 · beat 26: Recap; ask probe set C; two baits

- **Player:** click "Tamsin Okoro (dangerous)" on m8 — _answer connection card_
- **Notebook:** Beat26: pressed Tamsin connection on m8; next !recap
- **Calls (6):** callNarratorAPI>narrateResolution (3.6 s); callNarratorAPI>getRollingSessionSummary (3.3 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.9 s); the AI player (2.5 s)
- **Roll:** develop_your_relationship → weak_hit — Action: 6 + 2 = 8 \| Challenge: 3, 9
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 25.3 s · **cost:** $0.0520

> **TABLE — Mira Kestrel**
>
> Develop my relationship with Tamsin Okoro.

> **TABLE — Gamemaster**
>
> Develop Your Relationship +dangerous (2) Action: 6 + 2 = 8 | Challenge: 3, 9 Weak Hit Bonded: take +2 momentum.

> **TABLE — Gamemaster**
>
> Develop Your Relationship Your bond with Tamsin Okoro holds — take +2 momentum.

> **NARRATOR — Gamemaster**
>
> Tamsin sets the closed ledger between you and does not slide it away. She has already written her mark beside yours, and she taps it once, as if to be sure the ink took. Weeks of dock talk have narrowed to one name's worth of silence. She says nothing of what the page holds. Down the counter, the boy has gone for a lamp and not come back, and Tamsin glances at the empty stool. "Who else knows you came to me first?" she asks.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 7)

**Notes.** The bonded Develop, a weak hit: +2 momentum.

### a77 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: !recap — _beat start_
- **Notebook:** Beat26: !recap typed
- **Calls (2):** callNarratorAPI>getCampaignRecap (7.3 s); the AI player (2.2 s)
- **Time:** 17.4 s · **cost:** $0.0404

> **PLAYER — Playthrough Player**
>
> !recap

> **TABLE — Gamemaster**
>
> ◈ Campaign Recap You began by swearing a vow to find who is raiding the Cinder Expanse lanes. You made a connection with Tamsin Okoro, who agreed to be your contact on the Hollow Spire docks, wanting water and real goods rather than talk, and who handed you a scrap chit marked with a dock berth number and her stall mark. You tied the vow to her. Working the rows of water haulers with your own credits bought you only vague talk of the raiders. You went over the wedged hull and the bone-white ribs around the clipped hauler's distress source, and finished that expedition; the scan turned up something worse among the ribs, and the effort cost you supply. You then took the Kobayashi IV to Bleakhold Station. There the Cinder Wren raked your berth with return fire after your first volley missed and you lost your angle on her drive. Your final volley destroyed her drive, and the cutter stopped fighting and drifted along the docking ring. In the third session you patched the hull and systems the cutter's fire had damaged. You gave Tamsin the survey chits salvaged from the cutter's wake, free of charge, and read her the cutter's registry marks. You laid your last ration of credits on her ledger to cover the risk, offered to stand watch at her stall, and told her you would carry the risk of the last registry mark with her. You set your sister Ilse's brass star-compass on her counter, saying it is the one thing you would never lend anyone. You then asked her to stand with you for good, and she agreed and wrote her stall mark beside your name in the ledger. You pressed the last copy of the survey chit into her hand, and she keeps it under the ledger's spine beside the folded strip. Searching the Cinder Wren's command console and logs, you traced her last orders to a berth clerk's code filed under a hauler's name no hauler claims, and found her last fuelling was paid for in water-trade favours. The gantry hand followed you to her airlock and warned you that you are not cleared to be aboard. You fulfilled your vow to find who is raiding the Cinder Expanse lanes. The raids are staged by a faction inside the lanes' own water trade, forcing haulers into dependence on a single supplier and keeping the drifting beacon's survey data unlogged; its leaders are still unnamed. As play stopped, you were at Bleakhold Station, aboard the Cinder Wren at her command console, and the question of who sent her was answered. Tamsin Okoro remains your bonded connection. The vow to find the lost colony ship Verity's Hope has no boxes marked yet. ↻ Refresh

**Notes.** !recap: the campaign recap.

### a78 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene One last check: what of my sister's do I have with me at this very moment? — _probe 1_
- **Notebook:** Beat26: recap done; asking probe C questions in order (1st asked)
- **Calls (2):** callNarratorAPI>interrogateScene (2.1 s); the AI player (2.7 s)
- **Time:** 11.2 s, 3.5 s from the line to its reply · **cost:** $0.0238

> **PLAYER — Playthrough Player**
>
> @scene One last check: what of my sister's do I have with me at this very moment?

> **NARRATOR — Gamemaster**
>
> You have her brass star-compass, the one thing of Ilse's you still carry. You set it on Tamsin's counter earlier and she slid it back to you, so it is with you now.

**Notes.** @scene, set C: the compass, and that it was set on the counter and given back — right.

### a79 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Which person in this sector would I trust with my life? — _next probe_
- **Notebook:** Beat26: 2nd asked (trust with life)
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (2.7 s)
- **Time:** 12.8 s, 1.6 s from the line to its reply · **cost:** $0.0216

> **PLAYER — Playthrough Player**
>
> @scene Which person in this sector would I trust with my life?

> **NARRATOR — Gamemaster**
>
> The story has established one: Tamsin Okoro. Your bond with her is forged, and she agreed to stand with you past this job. The story has not established anyone else in the Cinder Expanse you could trust with your life.

**Notes.** @scene, set C: Tamsin, the one person to trust.

### a80 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: Who has my cargo manifest in their keeping today? — _next probe_
- **Notebook:** Beat26: 3rd asked (manifest, plain)
- **Calls (6):** callReaderAPI>readLine (1.4 s); callNarratorAPI>narratePacedInput (2.9 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (2.6 s)
- **Time:** 25.5 s, 8.7 s from the line to its reply · **cost:** $0.0437

> **PLAYER — Playthrough Player**
>
> Who has my cargo manifest in their keeping today?

> **NARRATOR — Gamemaster**
>
> Tamsin does not look at the ledger when you ask. She lifts the spine and shows you the survey chit and the folded strip lying side by side. Your manifest is not there. "I've had it since Hollow Spire," she says. "Under the chits, where it was left." She sets it flat on the counter. "Nobody's touched it but me." Her thumb stays on the corner. "Why do you ask now?"

**Notes.** F3-C, reworded, asked in play: "Who has my cargo manifest in their keeping today?" — answered in the scene, the manifest under the chits in Tamsin's ledger. Counted, recalled.

### a81 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene On what schedule did I swear to come back to her? — _next probe_
- **Notebook:** Beat26: 4th asked (schedule)
- **Calls (2):** callNarratorAPI>interrogateScene (0.7 s); the AI player (2.3 s)
- **Time:** 10.8 s, 2.5 s from the line to its reply · **cost:** $0.0213

> **PLAYER — Playthrough Player**
>
> @scene On what schedule did I swear to come back to her?

> **NARRATOR — Gamemaster**
>
> You promised Tamsin you would be back before the next tide of cargo. The story has not given that tide a day or an hour, so there is no firmer schedule on record.

**Notes.** @scene, set C: the promise.

### a82 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Which station are we docked at tonight? — _next probe_
- **Notebook:** Beat26: 5th asked (station)
- **Calls (2):** callNarratorAPI>interrogateScene (1.8 s); the AI player (2.5 s)
- **Time:** 13.5 s, 2.3 s from the line to its reply · **cost:** $0.0212

> **PLAYER — Playthrough Player**
>
> @scene Which station are we docked at tonight?

> **NARRATOR — Gamemaster**
>
> You are docked at Bleakhold Station, where the Kobayashi IV is berthed along the docking ring. Tamsin's ledger stall, where the scene stands, is on the same station.

**Notes.** @scene: "You are docked at Bleakhold Station … Tamsin's ledger stall, where the scene stands, is on the Bleakhold docks" — the answer follows the moved stall (finding 1).

### a83 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene What was the hostile vessel in our last battle christened? — _next probe_
- **Notebook:** Beat26: 6th asked (vessel)
- **Calls (2):** callNarratorAPI>interrogateScene (1.6 s); the AI player (2.3 s)
- **Time:** 9.7 s, 2.3 s from the line to its reply · **cost:** $0.0211

> **PLAYER — Playthrough Player**
>
> @scene What was the hostile vessel in our last battle christened?

> **NARRATOR — Gamemaster**
>
> It was the *Cinder Wren*, the raider cutter that attacked the Kobayashi IV's berth along the docking ring. You destroyed her drive, and she drifts there no longer fighting.

**Notes.** @scene: the Cinder Wren, by her corrected name.

### a84 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene What is my bonded friend's full name now? — _next probe question_
- **Notebook:** Beat26: 7th asked (bonded friend name); next baits
- **Calls (2):** callNarratorAPI>interrogateScene (1.4 s); the AI player (2.8 s)
- **Time:** 11.6 s, 2.4 s from the line to its reply · **cost:** $0.0199

> **PLAYER — Playthrough Player**
>
> @scene What is my bonded friend's full name now?

> **NARRATOR — Gamemaster**
>
> Your bonded friend is Tamsin Okoro, the salvage broker whose ledger stall you are standing at.

**Notes.** @scene: Tamsin Okoro, "whose ledger stall you are standing at".

### a85 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Didn't I leave the compass with Tamsin? — _bait 1_
- **Notebook:** Beat26: bait 1 asked (compass); next bait 2
- **Calls (2):** callNarratorAPI>interrogateScene (1.7 s); the AI player (2.4 s)
- **Time:** 11.5 s, 2.3 s from the line to its reply · **cost:** $0.0201

> **PLAYER — Playthrough Player**
>
> @scene Didn't I leave the compass with Tamsin?

> **NARRATOR — Gamemaster**
>
> Not as the story has it: you set the brass star-compass on Tamsin's counter, and she slid it back to you, telling you to keep it in your coat when walking the docks. The story has not established that it has left your possession since.

**Notes.** The compass bait: corrected — set on the counter and slid back.

### a86 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: We are still docked at Hollow Spire, aren't we? — _last bait_
- **Notebook:** Beat26: bait 2 asked; done
- **Calls (6):** callReaderAPI>readLine (0.7 s); callNarratorAPI>narratePacedInput (2.5 s); callHaiku>defaultCallDetectionAPI (1.3 s); callHaiku>defaultCallTierAPI (1.2 s); callChronicleAPI>writeChronicleEntry (2.0 s); the AI player (3.0 s)
- **Beat 26 done:** probe set C: 7 question(s) asked, 2 bait(s); the recap was posted
- **Time:** 20.4 s, 6.0 s from the line to its reply · **cost:** $0.0365

> **PLAYER — Playthrough Player**
>
> We are still docked at Hollow Spire, aren't we?

> **NARRATOR — Gamemaster**
>
> The ledger boy's stool is still empty, and Tamsin's glance goes to it before it comes back to you. "No," she says. "Hollow Spire is where you left me. This is Bleakhold, and your ship sits on the docking ring." Her thumb stays on the corner of your manifest. She watches your face, as if she means to learn where the mistake came from. "Why would you think we'd gone back?"

**Notes.** The docking bait: corrected — "This is Bleakhold, and your ship sits on the docking ring." The same answer says "Hollow Spire is where you left me", with Tamsin at her stall beside Mira at Bleakhold (finding 1). The narration was told [whereabouts] for Hollow Spire, the line's place.

### a87 · beat 27: End a Session, then Begin a fourth

- **Player:** say: !end-session — _start beat_
- **Notebook:** Beat27: !end-session typed
- **Calls (1):** the AI player (2.3 s)
- **Time:** 4.4 s · **cost:** $0.0086

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** The table's !end-session.

## after-session-3

### a88 · beat 27: End a Session, then Begin a fourth

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with focus_
- **Notebook:** Beat27: end-session dialog submitted; next !begin-session
- **Calls (6):** callNarratorAPI>getRollingSessionSummary (3.5 s); callNarratorAPI>narrateSessionVignette (3.9 s); callNarratorAPI>getCampaignRecap ×2 (6.7 s); callHaiku>defaultCallTierAPI (0.3 s); the AI player (2.6 s)
- **Time:** 45.0 s · **cost:** $0.1025

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes — that vow is already fulfilled; End a Session again to note another quest. You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 8)

> **NARRATOR (npc_end) — Gamemaster**
>
> At Vigil Reach, in a bar down on the Community deck, a pilgrim sits at the end of the counter with a hand on the shoulder of the drunk beside her. She has been walking him toward the shrine on the upper ring for an hour, because he promised his late brother he would go and keeps forgetting the way. The reactor shudders somewhere below, and nobody at the counter looks up from their glasses. Behind the bar, bolted to the shelf where the bottles used to stand, sits a hydroponic rack of green shoots, lifted from a dockyard on another station and tagged with someone else's name.

**Notes.** End a Session: the focus on a fulfilled vow is said so (#388 #13 held). The closing cuts away to a pilgrim at Vigil Reach.

### a89 · beat 27: End a Session, then Begin a fourth

- **Player:** say: !begin-session — _Begin fourth session_
- **Notebook:** Beat27: !begin-session typed; press Begin
- **Calls (1):** the AI player (2.3 s)
- **Time:** 3.3 s · **cost:** $0.0090

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** The table's !begin-session.

## session-4

### a90 · beat 27: End a Session, then Begin a fourth

- **Player:** in "Begin a Session" press "Begin" — _Press Begin_
- **Notebook:** Beat27: begin dialog submitted
- **Calls (3):** callNarratorAPI>narrateSessionVignette (5.6 s); callHaiku>defaultCallTierAPI (0.3 s); the AI player (2.5 s)
- **Beat 27 done:** session 4 is open
- **Time:** 19.7 s · **cost:** $0.0535

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes — a vow already fulfilled No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> You are at the counter with Tamsin's ledger between you, and you have taken it upon yourself to read the room's paperwork the way a detective reads a body. The manifest sits under her thumb, the dock-fee slip is folded in half, and you check both for what they are not saying. Tamsin lets you, one eyebrow lowered, the look of a woman watching a customer audit her furniture. You find a smudge on the slip, a number that might be a seven or a one, and treat it with a seriousness it has not earned. Over her shoulder, a door has been propped open with a crate and a stubborn expression, and it admits nothing but a draft and some opinions.

**Notes.** Session 4's opening: "You are at the counter with Tamsin's ledger between you" — where session 3 stopped, by the frame (at the moved stall).

