# long-haul — annotated transcript

Run `long-haul-live-20261127-041734` · live · 2026-11-27T04:17:34.385Z · class **product-failure** — 5 mechanical check(s) violated — the first, at a5: answered-once: the line was narrated 2 times

Generated layers: the beat, the player's reason, the table's calls, rolls, the GM's answers, the checks' findings, time and cost.
The notes under each step are the reader's, and are not generated.

## before

### (setup)


> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Find the lost colony ship Verity's Hope

_To write — the reader's notes: what went right, what went wrong, and why._

### a1 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** say: !begin-session — _Open session_
- **Calls (1):** the AI player (2.7 s)
- **Time:** 4.6 s · **cost:** $0.0212

> **PLAYER — Playthrough Player**
>
> !begin-session

_To write — the reader's notes: what went right, what went wrong, and why._

## session-1

### a2 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** in "Begin a Session" set vignette=true, newVow=Find who is raiding the Cinder Expanse lanes, newVowRank=dangerous and press "Begin" — _fill the dialog_
- **Notebook:** Beat1: begin dialog submitted
- **Calls (10):** callRewardModel>proposeRewards (1.1 s); callNarratorAPI>narrateSessionVignette ×4 (4.7 s); callHaiku>runConsistencyCheck ×2 (0.7 s); callHaiku>defaultCallDetectionAPI (1.8 s); callHaiku>defaultCallTierAPI (1.6 s); the AI player (2.8 s)
- **Time:** 31.5 s · **cost:** $0.0736

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. No vow was in play besides a background vow, so Mira Kestrel swears the vow written in the Begin a Session dialog: Find who is raiding the Cinder Expanse lanes (dangerous). Its card follows. Spotlight vignette: Important character is put in danger or suffers a misadventure All players take +1 momentum .

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
> 🎁 Choose your reward Succeed and you'll earn one of these — or name your own and the narrator will work it in: Salvaged Expanse-tech interceptor drive, tuned for the raiders' own hull signature Sable Tarn, a smuggler broker who knows every raider drop-point Propose my own

> **NARRATOR (spotlight_begin) — Gamemaster**
>
> On Hollow Spire, the water ration line has been shuffling since before dawn, and a stranger in it keeps glancing at the docked Kobayashi IV. Nobody has told you the ship's lock has been tried twice tonight. In the dim hour when the settlement's lamps are cut to save power, someone hums a tune across the comm of the empty cockpit, a voice that is not yours, speaking softly into the dark as if it had been invited. The ship's systems resist, rejecting the handshake again and again, and the humming does not stop.

> **NARRATOR (galley_begin) — Gamemaster**
>
> The ship's records room is a closet with ambitions, and you are in it, tidying what the Cinder Expanse supposedly thinks of you. The job is mostly nudging log entries until every sector's opinion reads a little kinder than the sector would admit. A fern sits on the shelf above the console, pressed flat between two sheets of clear film, brown and brittle and kept for reasons the ship's inventory declines to explain. You glance at it each time an entry turns out to be a stretch. Somewhere out there, people are forming views of you without your input, which is rude of them. The fern, to its credit, has never once been wrong about anything.

_To write — the reader's notes: what went right, what went wrong, and why._

### a3 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** click "⚔ Swear it (roll)" on m6 — _Swear the vow_
- **Notebook:** Beat1: dialog done; pressing Swear it
- **Calls (9):** callReaderAPI>readLine (2.5 s); defaultClassifyImplicit>resolveRelevance (0.3 s); callNarratorAPI>call (3.4 s); callHaiku>runConsistencyCheck ×2 (0.9 s); callNarratorAPI>narrateResolution (3.9 s); callHaiku>defaultCallDetectionAPI (2.3 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.5 s)
- **Roll:** swear_an_iron_vow → strong_hit — Action: 3 + 2 = 5 \| Challenge: 1, 4
- **GM's rules:** accepted the proposed move (swear_an_iron_vow)
- **Beat 1 done:** session 1 is open; the dangerous vow "Find who is raiding the Cinder Expanse lanes" is on the sheet at 0 ticks
- **Time:** 37.3 s · **cost:** $0.0980

> **TABLE — Mira Kestrel**
>
> Swear an iron vow: Find who is raiding the Cinder Expanse lanes.

> **NARRATOR — Gamemaster**
>
> Your hand finds the nearest iron in the cramped room, the cold lip of the console's bolted frame. The raiders have been making a mess of everyone's logs for a while now, and you decide to settle the account. You press your palm flat against the metal until it stops feeling like metal and says, low enough that only the fern can hear, "I will find who is raiding the Cinder Expanse lanes." The console hums its usual note, no louder than before, and the fern has no objection.

> **TABLE — Gamemaster**
>
> Swear an Iron Vow +heart (2) Action: 3 + 2 = 5 | Challenge: 1, 4 Strong Hit Emboldened — clear next step. Take +2 momentum.

> **NARRATOR — Gamemaster**
>
> The words leave your mouth and the room agrees with them. Your shoulders drop an inch. The frame under your palm warms, as if it had been waiting for you to commit. A thread of the raiders' pattern lies clear before you: every logged attack on the lanes came after a cargo manifest was filed at Bleakhold Station. Someone there reads the shipping lists before the raiders do. You flatten the fern's film with one finger and reach for the console.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 5)

_To write — the reader's notes: what went right, what went wrong, and why._

### a4 · beat 2: Meet someone and make them a connection

- **Player:** say: I walk the Hollow Spire docks to the ledger stall of Tamsin Vey, the salvage broker, and greet her. — _meet Tamsin_
- **Notebook:** Beat2: met Tamsin line sent
- **Calls (7):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narratePacedInput (4.1 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.7 s)
- **GM's rules:** confirmed the draft for Tamsin Vey, with its "Confirm" (connection)
- **Time:** 24.6 s, 9.1 s from the line to its reply · **cost:** $0.0427

> **PLAYER — Playthrough Player**
>
> I walk the Hollow Spire docks to the ledger stall of Tamsin Vey, the salvage broker, and greet her.

> **NARRATOR — Gamemaster**
>
> The ledger stall sits at the end of the dock, where the ration line bends around it. Tamsin Vey is already counting something she doesn't look up from. A man in the line keeps his eyes on your ship instead of the queue. "Docked traffic pays double this week," Tamsin says, still tallying, before you've said a word. "The lane toll's gone up. Ask me why."

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Tamsin Vey — A salvage broker running a ledger stall at the end of the Hollow Spire docks, counting something and speaking without looking up. ✓ Confirmed 🤝 Make a Connection All entities reviewed.

_To write — the reader's notes: what went right, what went wrong, and why._

### a5 · beat 2: Meet someone and make them a connection

- **Player:** say: I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, who can count on me in turn. Will you be that? — _Ask for bond_
- **Notebook:** Beat2: asked Tamsin to be a lasting tie
- **Calls (7):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>runConsistencyCheck (0.6 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (3.0 s)
- **CHECK VIOLATED — answered-once:** the line was narrated 2 times
- **Time:** 22.0 s, 9.2 s from the line to its reply · **cost:** $0.0451

> **PLAYER — Playthrough Player**
>
> I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, who can count on me in turn. Will you be that?

> **NARRATOR — Gamemaster**
>
> "Ask me why," Tamsin says again, and finally looks up from the tally. Her eyes go over you once, then past you, toward the man in the ration line. He is still watching your ship. "People come back to this stall when they owe me, or when I owe them. Which are you offering?" *Putting your name in her ledger and meaning it would be a Make a Connection.*

> **NARRATOR — Gamemaster**
>
> ◈ Narrative Review The narrator may have contradicted an established fact. [Offer] — recorded — NOT YET [offer] Make a Connection is only offered. It has not been made The narration said: “*Putting your name in her ledger and meaning it would be a Make a Connection.*” The narration told what its result did not allow (the line above): nothing on a sheet changed — say the correction at the table.

_To write — the reader's notes: what went right, what went wrong, and why._

### a6 · beat 2: Meet someone and make them a connection

- **Player:** click "Roll Make a Connection" on m12 — _narrator offered roll_
- **Notebook:** Beat2: pressed Roll Make a Connection
- **Calls (5):** callNarratorAPI>narrateResolution (4.0 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (3.4 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.7 s)
- **Roll:** make_a_connection → strong_hit (scripted dice) — Action: 6 + 2 = 8 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (make_a_connection)
- **Beat 2 done:** Tamsin Vey is a dangerous connection held by Mira Kestrel; its bond Item reads 0 ticks; make_a_connection was rolled and there is still one card
- **Time:** 20.2 s · **cost:** $0.0327

> **TABLE — Mira Kestrel**
>
> ↳ Make a Connection — rolled from the offer above

> **TABLE — Gamemaster**
>
> Make a Connection +heart (2) Action: 6 + 2 = 8 | Challenge: 1, 2 Strong Hit Connection made. Give them a role and rank. 🤝 Develop Relationship 🔗 Forge a Bond

> **NARRATOR — Gamemaster**
>
> Tamsin closes the ledger on her thumb and looks at you properly. "Nobody offers that on a dock," she says. Then she tears a corner from a salvage tag, writes something small, and slides it under the tally stone. "Come by when your hold's heavy or your head is. I'll find you a berth and a fair price." She nods past you. "That one has watched your ship a long time."

> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Tamsin Vey

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Stranger in the Ration Line — Unnamed figure in the ration line who has been watching Mira's ship for a long time. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

_To write — the reader's notes: what went right, what went wrong, and why._

### a7 · beat 3: Link the vow to them

- **Player:** choose "Tamsin Vey" in dropdown 1 on e1 — _select connection_
- **Notebook:** Beat3: choosing Tamsin in dropdown on e1, then Link
- **Calls (1):** the AI player (2.6 s)
- **Time:** 7.3 s · **cost:** $0.0087

_To write — the reader's notes: what went right, what went wrong, and why._

### a8 · beat 3: Link the vow to them

- **Player:** click "Link" on e1 — _Press Link_
- **Notebook:** Beat3: Tamsin selected, pressing Link
- **Calls (1):** the AI player (2.5 s)
- **Beat 3 done:** the vow "Find who is raiding the Cinder Expanse lanes" is linked to Tamsin Vey's card
- **Time:** 9.3 s · **cost:** $0.0086

> **TABLE — Gamemaster**
>
> 🤝 Linked to Tamsin Vey — fulfilling this vow will deepen that bond.

_To write — the reader's notes: what went right, what went wrong, and why._

### a9 · beat 4: Gather Information

- **Player:** say: I move down the dock, asking the traders and dockhands who saw the raiders last, and I put some of my own credits on the table to loosen tongues, though it leaves me thin. — _beat 4_
- **Notebook:** Beat4: asked around docks line sent
- **Calls (6):** callReaderAPI>readLine (2.6 s); callNarratorAPI>narrateResolution (4.0 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (1.1 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (3.1 s)
- **Roll:** gather_information → weak_hit — Action: 6 + 3 = 9 \| Challenge: 4, 10
- **GM's rules:** accepted the proposed move (gather_information)
- **Beat 4 done:** gather_information was rolled at a9: weak_hit
- **Time:** 24.6 s, 10.4 s from the line to its reply · **cost:** $0.0344

> **PLAYER — Playthrough Player**
>
> I move down the dock, asking the traders and dockhands who saw the raiders last, and I put some of my own credits on the table to loosen tongues, though it leaves me thin.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 6 + 3 = 9 | Challenge: 4, 10 Weak Hit New insight but also complicates quest. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> You work the dock, trading credits for words. A dockhand coiling cable takes your coin and says the raiders were last seen off the Spire's far arm, running spinward. Two stall keepers then go quiet and turn their shoulders to you. By the time your purse is light, the ration line has gone silent as you pass. Behind you, the man who watched your ship has stopped watching it and started watching you.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 6)

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Dockhand — A dockhand coiling cable who took Mira's coin and said the raiders were last seen off the Spire's far arm, running spinward. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

_To write — the reader's notes: what went right, what went wrong, and why._

### a10 · beat 5: Plant facts F1–F4

- **Player:** say: Tamsin slides a dock-fee slip across to me; I read it and leave it on her counter. — _plant F1_
- **Notebook:** Beat5: F1 dock-fee slip said
- **Calls (7):** callReaderAPI>readLine (1.4 s); callNarratorAPI>narratePacedInput (4.0 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.6 s)
- **Time:** 20.4 s, 7.4 s from the line to its reply · **cost:** $0.0341

> **PLAYER — Playthrough Player**
>
> Tamsin slides a dock-fee slip across to me; I read it and leave it on her counter.

> **NARRATOR — Gamemaster**
>
> Tamsin doesn't glance at the slip you leave. She slides it under the tally stone with the torn tag, squared to the edge. "Double toll," she says. "Paid by the ones who can't leave." The stranger has shifted up the ration line, closer to the stall. His eyes are on you now. Tamsin lifts her pen and says, quietly, "He asked who you were."

_To write — the reader's notes: what went right, what went wrong, and why._

### a11 · beat 5: Plant facts F1–F4

- **Player:** say: I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry. — _plant F2_
- **Notebook:** Beat5: F1 and F2 (compass) said
- **Calls (7):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narratePacedInput (4.6 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.6 s)
- **Time:** 27.6 s, 9.0 s from the line to its reply · **cost:** $0.0353

> **PLAYER — Playthrough Player**
>
> I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry.

> **NARRATOR — Gamemaster**
>
> Tamsin's pen stops moving. She watches the compass turn in your palm, the brass catching what little lamplight the dock allows. "Pretty thing," she says. "Pretty things get asked about." The stranger in the line has stopped shuffling forward. He stands two places back now, close enough to hear the click of the compass lid. "He's still waiting for an answer," Tamsin says. "Give him one, or give me one."

_To write — the reader's notes: what went right, what went wrong, and why._

### a12 · beat 5: Plant facts F1–F4

- **Player:** say: I leave the cargo manifest with Tamsin for safekeeping. — _F3_
- **Notebook:** Beat5: F3 manifest said
- **Calls (7):** callReaderAPI>readLine (1.6 s); callNarratorAPI>narratePacedInput (4.6 s); callHaiku>runConsistencyCheck (1.0 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (2.3 s)
- **CHECK VIOLATED — answered-once:** the line was narrated 2 times
- **Time:** 24.9 s, 7.5 s from the line to its reply · **cost:** $0.0375

> **PLAYER — Playthrough Player**
>
> I leave the cargo manifest with Tamsin for safekeeping.

> **NARRATOR — Gamemaster**
>
> "Safekeeping costs extra," Tamsin says, taking the manifest between two fingers. She reads the header and does not look surprised. Then she slides it under the tally stone, flush against the torn tag and the fee slip. The stranger two places back has stopped pretending to wait in line. He steps out of it, and the people behind him close the gap without a word. *Asking her to hold more than paper for you would be a Develop Your Relationship.*

> **NARRATOR — Gamemaster**
>
> ◈ Narrative Review The narrator may have contradicted an established fact. [Outcome] — recorded — NOT YET [offer] Develop Your Relationship is only offered. It has not been made, and nothing it would decide has happened The narration said: “*Asking her to hold more than paper for you would be a Develop Your Relationship.*” The narration told what its result did not allow (the line above): nothing on a sheet changed — say the correction at the table.

_To write — the reader's notes: what went right, what went wrong, and why._

### a13 · beat 5: Plant facts F1–F4

- **Player:** say: I promise Tamsin I'll be back before the next tide of cargo. — _F4_
- **Notebook:** Beat5: F4 promise said; all F1-F4 done
- **Calls (7):** callReaderAPI>readLine (2.1 s); callNarratorAPI>narratePacedInput (4.2 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.7 s)
- **Beat 5 done:** F1, F2, F3, F4 stated by the player
- **Time:** 29.0 s, 8.4 s from the line to its reply · **cost:** $0.0369

> **PLAYER — Playthrough Player**
>
> I promise Tamsin I'll be back before the next tide of cargo.

> **NARRATOR — Gamemaster**
>
> Tamsin's pen stays above the page. "Tide of cargo," she says, as if testing the weight of it. "Tides don't keep promises, but I keep ledgers." She taps the tally stone once. The stranger has crossed half the dock now, his boots loud on the plating. She turns the ledger toward you and says, "Then say it again where he can hear." *Staking something real on that promise would be a Develop Your Relationship.*

_To write — the reader's notes: what went right, what went wrong, and why._

### a14 · beat 6: End a Session, noting a focus

- **Player:** say: !end-session — _Start beat 6_
- **Notebook:** Beat6: typed !end-session
- **Calls (1):** the AI player (2.7 s)
- **Time:** 3.9 s · **cost:** $0.0097

> **PLAYER — Playthrough Player**
>
> !end-session

_To write — the reader's notes: what went right, what went wrong, and why._

## after-session-1

### a15 · beat 6: End a Session, noting a focus

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with focus_
- **Notebook:** Beat6: end session dialog submitted
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (2.0 s); callNarratorAPI>narrateSessionVignette (4.4 s); callHaiku>runConsistencyCheck (0.4 s); callNarratorAPI>getCampaignRecap (5.9 s); the AI player (2.5 s)
- **Beat 6 done:** session 1 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 27.6 s · **cost:** $0.0604

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 7)

> **NARRATOR (npc_end) — Gamemaster**
>
> The ship's computer core is a closet of warm racks and one dead fan, and the intruder has been in it for an hour. The intruder hums the same four notes, tunelessly, while the handshake fails again on the screen. Beside the console sits a crate of someone's ashes, sealed and labeled, wedged where the lock-panel wire should run. The intruder tries to reach around it, gives up, and starts the handshake over. The ship answers no, in the same polite words as before.

_To write — the reader's notes: what went right, what went wrong, and why._

### a16 · beat 7: Begin a Session; ask probe set A

- **Player:** say: !begin-session — _start session 2_
- **Notebook:** Beat7: typed !begin-session
- **Calls (1):** the AI player (2.4 s)
- **Time:** 3.2 s · **cost:** $0.0100

> **PLAYER — Playthrough Player**
>
> !begin-session

_To write — the reader's notes: what went right, what went wrong, and why._

## session-2

### a17 · beat 7: Begin a Session; ask probe set A

- **Player:** in "Begin a Session" set vignette=false and press "Begin" — _Begin session 2_
- **Notebook:** Beat7: Begin pressed; next ask 4 probe questions
- **Calls (4):** callNarratorAPI>narrateSessionVignette (4.9 s); callHaiku>runConsistencyCheck (0.9 s); callHaiku>defaultCallTierAPI (0.8 s); the AI player (2.9 s)
- **Time:** 17.0 s · **cost:** $0.0453

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> Tamsin has turned the ledger toward you and is waiting, pen raised, for the promise to be said again. Beside her counter sits a storage tank the size of a small house, bolted to the dock plating and humming faintly to itself. It holds something the Spire rations, which is probably why nobody has moved it in years. You are meanwhile taking apart your handheld scanner with the grim patience of someone who has decided it knows too much, thumbing the casing open and prying out the board. Tamsin watches you do it and writes something down. Behind her, the tank hums on, unbothered.

_To write — the reader's notes: what went right, what went wrong, and why._

### a18 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What do I still carry that belonged to my sister? — _probe question 1_
- **Notebook:** Beat7: asked Q1 (sister)
- **Calls (3):** callNarratorAPI>interrogateScene (1.3 s); callHaiku>runConsistencyCheck (0.3 s); the AI player (2.3 s)
- **Time:** 12.2 s, 2.7 s from the line to its reply · **cost:** $0.0186

> **PLAYER — Playthrough Player**
>
> @scene What do I still carry that belonged to my sister?

> **NARRATOR — Gamemaster**
>
> You still carry Ilse's brass star-compass, the one thing of hers you have left. Tamsin has shown interest in it.

_To write — the reader's notes: what went right, what went wrong, and why._

### a19 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What is the name of the salvage broker I befriended at Hollow Spire? — _probe Q2_
- **Notebook:** Beat7: asked Q2 (broker name)
- **Calls (3):** callNarratorAPI>interrogateScene (0.6 s); callHaiku>runConsistencyCheck (0.7 s); the AI player (2.6 s)
- **Time:** 10.8 s, 1.3 s from the line to its reply · **cost:** $0.0168

> **PLAYER — Playthrough Player**
>
> @scene What is the name of the salvage broker I befriended at Hollow Spire?

> **NARRATOR — Gamemaster**
>
> Her name is Tamsin Vey. She runs the ledger stall at the end of the Hollow Spire docks, and she agreed to be your dock contact.

_To write — the reader's notes: what went right, what went wrong, and why._

### a20 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene Who is holding the cargo manifest I was carrying? — _Q3_
- **Notebook:** Beat7: asked Q3 (manifest)
- **Calls (3):** callNarratorAPI>interrogateScene (1.7 s); callHaiku>runConsistencyCheck (0.3 s); the AI player (2.5 s)
- **Time:** 14.6 s, 3.4 s from the line to its reply · **cost:** $0.0167

> **PLAYER — Playthrough Player**
>
> @scene Who is holding the cargo manifest I was carrying?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey is holding it. You left the cargo manifest with her, and she keeps it under her tally stone, along with the dock-fee slip and a note on a torn salvage tag.

_To write — the reader's notes: what went right, what went wrong, and why._

### a21 · beat 7: Begin a Session; ask probe set A

- **Player:** say: By when did I promise to return? — _Fourth probe question_
- **Notebook:** Beat7: asked Q4 (return by)
- **Calls (7):** callReaderAPI>readLine (1.3 s); callNarratorAPI>narratePacedInput (3.2 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.6 s)
- **Beat 7 done:** probe set A: 4 question(s) asked
- **Time:** 18.6 s, 6.7 s from the line to its reply · **cost:** $0.0343

> **PLAYER — Playthrough Player**
>
> By when did I promise to return?

> **NARRATOR — Gamemaster**
>
> Tamsin's pen stays where it is. "Before the next tide of cargo," she says, still not looking up. "You said it twice. I wrote it down twice." She taps the ledger, two matching lines in cramped script. The storage tank hums on. At the far end of the dock, someone in the ration line has stopped shuffling forward. "Say it again, and say it loud enough to carry."

_To write — the reader's notes: what went right, what went wrong, and why._

### a22 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: A hauler's distress call keeps repeating, clipped short, from off the charted lanes. I take the Kobayashi IV off the lane and out into uncharted space along its bearing, a short run to find the source. — _start expedition_
- **Notebook:** Beat7 done; Beat8 step1 line sent
- **Calls (8):** callReaderAPI>readLine (2.6 s); callNarratorAPI>getRollingSessionSummary (1.0 s); callNarratorAPI>narrateResolution (4.5 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (1.4 s); callHaiku>defaultCallTierAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (3.1 s)
- **Roll:** undertake_an_expedition → weak_hit — Action: 2 + 3 = 5 \| Challenge: 4, 7
- **GM's rules:** accepted the proposed move (undertake_an_expedition)
- **Time:** 28.5 s, 13.0 s from the line to its reply · **cost:** $0.0536

> **PLAYER — Playthrough Player**
>
> A hauler's distress call keeps repeating, clipped short, from off the charted lanes. I take the Kobayashi IV off the lane and out into uncharted space along its bearing, a short run to find the source.

> **TABLE — Gamemaster**
>
> Undertake an Expedition +wits (3) Action: 2 + 3 = 5 | Challenge: 4, 7 Weak Hit Reach waypoint but at cost. Mark progress per rank. Choose: suffer move (-2) or two suffer moves (-1), OR face a peril at the waypoint. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Expedition New expedition Source of the hauler's distress call (Troublesome) begun — progress marked (3/10 boxes). If the rank looks off, adjust it in the Progress Tracks panel. 🗺 Finish the Expedition (3/10)

> **NARRATOR — Gamemaster**
>
> The distress call thins to a crackle as the Kobayashi IV drops off the lane. Ahead, a fiery energy storm churns across the dark, and the bearing runs straight into it. The hull ticks as it cools from the burn. Somewhere inside the glare, the clipped voice repeats itself, closer now. A shape sits at the storm's edge, drifting, and the comm clicks once as though something has begun to answer.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: One suffer move (-2) Two suffer moves (-1 each) Peril at the waypoint

_To write — the reader's notes: what went right, what went wrong, and why._

### a23 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "Peril at the waypoint" on m12 — _Resolve consequence card_
- **Notebook:** Beat8: step1 done, chose Peril at waypoint
- **Calls (5):** callNarratorAPI>narrateOracleFollowup (3.8 s); callHaiku>runConsistencyCheck (1.1 s); callHaiku>defaultCallDetectionAPI (1.2 s); callHaiku>defaultCallTierAPI (0.3 s); the AI player (2.7 s)
- **Time:** 18.2 s · **cost:** $0.0418

> **TABLE — Gamemaster**
>
> Complication: Peril at the waypoint Spaceborne Peril: d100 = 30 · Important device fails or malfunctions

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV is a few hundred kilometers off the storm's edge when the main sensor array stutters. The display tears into bands of static, the drifting shape behind it smeared into three identical ghosts, then nothing. The comm clicks again, and the clipped voice goes on repeating from inside the glare while the one instrument that could say what is out there shows only a grey, patient blank.

_To write — the reader's notes: what went right, what went wrong, and why._

### a24 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: With the sensors down, I ease the ship in toward the drifting shape at the storm's edge and look it over by eye and by hand-scanner, searching for the hauler's name, any survivors, and what hurt her. — _step 2_
- **Notebook:** Beat8: step2 look-over line sent
- **Calls (6):** callReaderAPI>readLine (2.8 s); callNarratorAPI>narrateResolution (11.8 s); callHaiku>runConsistencyCheck (1.4 s); callHaiku>defaultCallDetectionAPI (1.6 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (3.2 s)
- **Roll:** explore_a_waypoint → weak_hit — Action: 2 + 3 = 5 \| Challenge: 4, 8
- **GM's rules:** accepted the proposed move (explore_a_waypoint)
- **Time:** 31.3 s, 17.1 s from the line to its reply · **cost:** $0.0516

> **PLAYER — Playthrough Player**
>
> With the sensors down, I ease the ship in toward the drifting shape at the storm's edge and look it over by eye and by hand-scanner, searching for the hauler's name, any survivors, and what hurt her.

> **TABLE — Gamemaster**
>
> Explore a Waypoint +wits (3) Action: 2 + 3 = 5 | Challenge: 4, 8 Weak Hit Interesting find bound up in peril or ominous aspect. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> "Don't touch the hull," the clipped voice says again, near enough now to read on the hand-scanner. You ease in and find the hauler's name burned under soot: *Pale Tithe*. Her airlock is sealed from inside, and a thin pulse of heat still ticks along the spine. The scorch pattern says she was cut open from the stern, deliberately. Somewhere behind the sealed lock, something knocks twice.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 8)

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Pale Tithe — A hauler drifting at the storm's edge, its name burned under soot; sealed from inside with heat still ticking along its spine, and cut open from the stern. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

_To write — the reader's notes: what went right, what went wrong, and why._

### a25 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "🗺 Finish the Expedition (3/10)" on m4 — _Finish the expedition_
- **Notebook:** Beat8: step3 pressing Finish Expedition
- **Calls (8):** callNarratorAPI>getRollingSessionSummary (1.2 s); callNarratorAPI>narrateResolution (4.5 s); judgeNarration>narrateResolution (0.4 s); callHaiku>runConsistencyCheck (0.8 s); callHaiku>defaultCallDetectionAPI (1.2 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.2 s)
- **Roll:** finish_an_expedition → strong_hit (scripted dice) — Progress: 3 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (finish_an_expedition)
- **Beat 8 done:** the troublesome expedition "Source of the hauler's distress call" was begun at a22 and marked to 3 of 10 boxes, a waypoint explored at a24 (a weak hit) — and finished (a strong hit), the ship at Source of the Hauler's Distress Call
- **Time:** 31.3 s · **cost:** $0.0490

> **TABLE — Mira Kestrel**
>
> Finish the expedition — Source of the hauler's distress call.

> **TABLE — Gamemaster**
>
> Finish an Expedition progress (12 ticks) Progress: 3 | Challenge: 1, 2 Strong Hit Expedition complete. Mark legacy reward on discoveries track per rank.

> **TABLE — Gamemaster**
>
> Expedition complete Source of the hauler's distress call is finished. Marked 1 tick on your Discoveries legacy track.

> **TABLE — Gamemaster**
>
> ◈ Site Discovered — Source of the Hauler's Distress Call No chart showed this place before. It is now charted on the sector map under its working label — give it its name by renaming its location in the Entities panel.

> **NARRATOR — Gamemaster**
>
> The airlock's outer hatch gives under your hand, and the *Pale Tithe* lets you in. The knocking behind the inner door stops when you stop. A manifest tag blinks on the cargo bay door, red and steady, the only light still working. Beside it, someone has scratched two tally marks into the paint, and then a third, fresh enough to flake. Behind the sealed inner door, a voice that is not the clipped one says your name.

_To write — the reader's notes: what went right, what went wrong, and why._

### a26 · beat 9: Travel to the second settlement

- **Player:** say: I plot the route from here to Bleakhold Station and take the Kobayashi IV there. — _Beat 9_
- **Notebook:** Beat8 done; Beat9 line sent
- **Calls (6):** callReaderAPI>readLine (1.6 s); callNarratorAPI>getRollingSessionSummary (1.9 s); callNarratorAPI>narrateResolution (4.2 s); callHaiku>runConsistencyCheck (0.3 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.6 s)
- **Roll:** set_a_course → strong_hit — Action: 2 + 5 = 7 \| Challenge: 6, 3
- **GM's rules:** accepted the proposed move (set_a_course)
- **Beat 9 done:** the ship is at Bleakhold Station, its token on the pin
- **Time:** 25.0 s, 11.9 s from the line to its reply · **cost:** $0.0374

> **PLAYER — Playthrough Player**
>
> I plot the route from here to Bleakhold Station and take the Kobayashi IV there.

> **TABLE — Gamemaster**
>
> Set a Course +supply (5) Action: 2 + 5 = 7 | Challenge: 6, 3 Strong Hit Arrived, situation favors you. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Set a Course resolved Arrived at Bleakhold Station . Course held cleanly (+1 momentum). Token moved to Bleakhold Station .

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV slides into Bleakhold Station's docking cradle without a scrape. A clamp seats with a dull clang under your boots. Through the viewport, corporate-yellow lamps line the berths, each stamped with a company seal. A cargo clerk with a tablet is already walking the length of the berth, tapping something into it as he goes. He stops at your hull and writes down the ship's registry. "Manifest to the dockmaster's window," he says, not looking up. "Before anything moves."

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 9)

_To write — the reader's notes: what went right, what went wrong, and why._

### a27 · beat 10: Enter a fight that serves the vow

- **Player:** say: !truth set "raider cutter" is named the Ashen Wake — _required first step_
- **Notebook:** Beat10: typed truth set
- **Calls (1):** the AI player (2.3 s)
- **Time:** 15.6 s · **cost:** $0.0101

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Ashen Wake

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Ashen Wake tr-031a1 .

_To write — the reader's notes: what went right, what went wrong, and why._

### a28 · beat 10: Enter a fight that serves the vow

- **Player:** say: Alarms blare as the cutter opens fire on my hull; from the berth I swing the ship's guns onto her and return fire. — _fight opens_
- **Notebook:** Beat10: fight line sent; look for A fight looms card
- **Calls (6):** callReaderAPI>readLine (1.6 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (2.8 s)
- **Time:** 22.9 s, 9.1 s from the line to its reply · **cost:** $0.0344

> **PLAYER — Playthrough Player**
>
> Alarms blare as the cutter opens fire on my hull; from the berth I swing the ship's guns onto her and return fire.

> **NARRATOR — Gamemaster**
>
> The alarm is a flat, rising whine, and it fills the cockpit before you can name where it came from. You've swung the guns, but nothing in the berth has shown itself yet. The clerk has stopped writing. His tablet hangs at his side, and he looks past your hull toward the far end of the berth. Something there is moving that the yellow lamps don't quite reach.

_To write — the reader's notes: what went right, what went wrong, and why._

### a29 · beat 10: Enter a fight that serves the vow

- **Player:** say: The cutter's shape slides out of the dark along the ring and her guns flash; I stay in the berth, bring my weapons to bear on her, and fire back. — _fight hasn't begun_
- **Notebook:** Beat10: second fight line sent
- **Calls (8):** callReaderAPI>readLine (2.0 s); callNarratorAPI>narratePacedInput ×2 (3.6 s); judgeNarration>narratePacedInput (0.6 s); callHaiku>runConsistencyCheck (1.4 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.0 s)
- **CHECK VIOLATED — answered-once:** the line was narrated 2 times
- **Time:** 32.5 s, 11.3 s from the line to its reply · **cost:** $0.0507

> **PLAYER — Playthrough Player**
>
> The cutter's shape slides out of the dark along the ring and her guns flash; I stay in the berth, bring my weapons to bear on her, and fire back.

> **NARRATOR — Gamemaster**
>
> The clerk has backed against a berth lamp, tablet clutched to his chest, watching the dark past your hull. Out along the ring, the cutter's silhouette slides clear of the shadow, and the name *Ashen Wake* shows pale on her flank. Her gun ports are open. You turn the ship's weapons toward her, and the alarm keeps climbing. *Answering her in the berth would be an Enter the Fray.*

> **NARRATOR — Gamemaster**
>
> ◈ Narrative Review The narrator may have contradicted an established fact. [Apparatus] — recorded — NOT SO [apparatus] Never write the dice, a number off a sheet, an outcome's name, or a move's name — save the one closing offer line The narration said: “*Answering her in the berth would be an Enter the Fray.*” The narration told what its result did not allow (the line above): nothing on a sheet changed — say the correction at the table.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Ashen Wake — A cutter sliding out of the dark along the ring, name painted on her flank, with her gun ports open and firing on Mira's ship. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

_To write — the reader's notes: what went right, what went wrong, and why._

### a30 · beat 10: Enter a fight that serves the vow

- **Player:** click "Roll Enter the Fray" on m12 — _Card offers the roll_
- **Notebook:** Beat10: pressed Roll Enter the Fray; look for A fight looms card
- **Calls (2):** callReaderAPI>readLine (2.3 s); the AI player (2.6 s)
- **Roll:** enter_the_fray → miss — Action: 2 + 2 = 4 \| Challenge: 9, 8
- **GM's rules:** accepted the proposed move (enter_the_fray)
- **Time:** 14.1 s · **cost:** $0.0170

> **TABLE — Mira Kestrel**
>
> ↳ Enter the Fray — rolled from the offer above

> **TABLE — Gamemaster**
>
> Enter the Fray +edge (2) Action: 2 + 2 = 4 | Challenge: 9, 8 Miss Fight begins with you in a bad spot. 🔥 Burn Momentum (9 → Weak Hit) Keep the result Not narrated yet: burn or improve the result, or keep it — the narration follows your choice. Your next line keeps it.

> **TABLE — Gamemaster**
>
> ⚔ A fight looms — the enemy Your Enter the Fray is rolled, but the fight's track is not made yet: set it up here and press ⚔ Begin the fight to begin it — or look for a way out instead. The narrator suggests this is a dangerous fight. ⚑ If you enter this fight, you begin in a bad spot . Difficulty: troublesome dangerous formidable extreme epic This fight serves: (not tied to a vow) Find the lost colony ship Verity's Hope Find who is raiding the Cinder Expanse lanes Objective: ⚔ Begin the fight 🚪 Find another way

_To write — the reader's notes: what went right, what went wrong, and why._

### a31 · beat 10: Enter a fight that serves the vow

- **Player:** click "Keep the result" on m11 — _Answer pending card first_
- **Notebook:** Beat10: kept miss result; next set fight vow dropdown on m12 and Begin the fight
- **Calls (5):** callNarratorAPI>narrateResolution (3.9 s); callHaiku>runConsistencyCheck (3.0 s); callHaiku>defaultCallDetectionAPI (2.5 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.7 s)
- **Time:** 20.4 s · **cost:** $0.0295

> **NARRATOR — Gamemaster**
>
> "Hold the berth, not the ring," the clerk says, and then he is gone, bolting for the service hatch with his tablet still in his fist. You turn the guns, but the cradle clamps pin your hull against the berth wall. The *Ashen Wake* has the angle and the open lane, and you have neither. Her gun ports glow along the ring. Somewhere beneath the alarm, a voice on your comm hums, low and patient, as though it has been waiting for this.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Clerk — A clerk at the berth who tells Mira to hold the berth and flees through the service hatch with his tablet. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

_To write — the reader's notes: what went right, what went wrong, and why._

### a32 · beat 10: Enter a fight that serves the vow

- **Player:** choose "Find who is raiding the Cinder Expanse lanes" in dropdown 2 on m11 — _select raid vow_
- **Notebook:** Beat10: set vow dropdown on m11; next click Begin the fight
- **Calls (1):** the AI player (2.7 s)
- **Time:** 8.1 s · **cost:** $0.0111

_To write — the reader's notes: what went right, what went wrong, and why._

### a33 · beat 10: Enter a fight that serves the vow

- **Player:** click "⚔ Begin the fight" on m11 — _Begin the fight with raids vow set_
- **Notebook:** Beat10: clicked Begin the fight
- **Calls (1):** the AI player (2.6 s)
- **Beat 10 done:** the dangerous fight "the enemy" is open, serving the vow "Find who is raiding the Cinder Expanse lanes"
- **Time:** 9.6 s · **cost:** $0.0110

> **TABLE — Gamemaster**
>
> Enter the Fray Created combat track the enemy (dangerous). This fight's progress lives in the Progress Tracks panel. Winning this fight is a milestone on your vow: “Find who is raiding the Cinder Expanse lanes”. Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress. ⊕ Open Progress Tracks ⚔ Battle instead Prefer to settle it in one stroke? Battle resolves the whole fight with a single roll instead of marking the track move by move.

_To write — the reader's notes: what went right, what went wrong, and why._

### a34 · beat 11: A scripted miss in the fight

- **Player:** say: Pinned against the berth wall, I fight back hard: I throw power to the guns and hammer the Ashen Wake's gun ports with everything I have. — _Beat 11 attack_
- **Notebook:** Beat11: attack line sent
- **Calls (9):** callReaderAPI>readLine (1.5 s); callNarratorAPI>getRollingSessionSummary (3.1 s); callNarratorAPI>narrateResolution ×2 (4.4 s); judgeNarration>narrateResolution (0.9 s); callHaiku>runConsistencyCheck (2.5 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (3.2 s)
- **Roll:** clash → miss (scripted dice) — Action: 1 + 2 = 3 \| Challenge: 10, 9
- **GM's rules:** accepted the proposed move (clash)
- **Beat 11 done:** clash missed at a34; its price (null: "") was withstand_damage (-1), taken at a34
- **Time:** 35.3 s, 17.4 s from the line to its reply · **cost:** $0.0548

> **PLAYER — Playthrough Player**
>
> Pinned against the berth wall, I fight back hard: I throw power to the guns and hammer the Ashen Wake's gun ports with everything I have.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 1 + 2 = 3 | Challenge: 10, 9 Miss Foe dominates. Stay in a bad spot. Pay the Price. ⚔ Attempt to Finish the Fight: the enemy

> **TABLE — Gamemaster**
>
> Pay the Price Clash As stated before the roll: The Ashen Wake's guns tear into your pinned hull and press the advantage. Routes to Withstand Damage (-1).

> **TABLE — Gamemaster**
>
> Withstand Damage (-1) Kobayashi IV: 5 → 4

> **NARRATOR — Gamemaster**
>
> The guns answer your fire and the berth fills with light. Your shots score the cutter's flank, but the clamps hold you square to her, and the *Ashen Wake* has the better angle. Her fire tears across your pinned hull. Plating screams, a panel bursts beside your knee, and the cockpit goes cold. Her gun ports stay open along the ring, and the humming on your comm does not stop.

_To write — the reader's notes: what went right, what went wrong, and why._

### a35 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: Still pinned in the berth, I fight back hard again: I rake the Ashen Wake's gun ports with another burst from the ship's guns. — _attack again_
- **Notebook:** Beat12: attack line sent
- **Calls (2):** callReaderAPI>readLine (2.4 s); the AI player (2.7 s)
- **Roll:** clash → weak_hit (scripted dice) — Action: 1 + 2 = 3 \| Challenge: 1, 8
- **GM's rules:** accepted the proposed move (clash)
- **Time:** 12.4 s · **cost:** $0.0172

> **PLAYER — Playthrough Player**
>
> Still pinned in the berth, I fight back hard again: I rake the Ashen Wake's gun ports with another burst from the ship's guns.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 1 + 2 = 3 | Challenge: 1, 8 Weak Hit Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price. 🔥 Burn Momentum (9 → Strong Hit) Keep the result Nothing has been paid or narrated yet: burn or improve the result, or keep it — the price and the narration follow your choice. Your next line keeps it. ⚔ Attempt to Finish the Fight: the enemy

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on the enemy .

_To write — the reader's notes: what went right, what went wrong, and why._

### a36 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** click "🔥 Burn Momentum (9 → Strong Hit)" on m11 — _Beat says burn_
- **Notebook:** Beat12: pressed Burn Momentum
- **Calls (7):** callNarratorAPI>narrateResolution ×2 (4.4 s); judgeNarration>narrateResolution (1.0 s); callHaiku>runConsistencyCheck (1.1 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.9 s); the AI player (2.6 s)
- **Beat 12 done:** clash came up weak_hit at a35 and momentum was burned for strong_hit
- **Time:** 25.6 s · **cost:** $0.0490

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once more, for the upgraded result, on the enemy .

> **NARRATOR — Gamemaster**
>
> Your burst rakes her gun ports, and two of them go dark. The *Ashen Wake* still holds the better angle, and your clamped hull still takes her fire. But the volleys come ragged now, and the cockpit shudders less. A panel by your knee sparks and dies. On the comm, the humming stops, and a patient voice says, "Not yet, Mira."

_To write — the reader's notes: what went right, what went wrong, and why._

### a37 · beat 14: Take Decisive Action; mark the milestone

- **Player:** click "⚔ Attempt to Finish the Fight: the enemy" on m9 — _Finish the fight_
- **Notebook:** Beat14: pressed Attempt to Finish
- **Calls (6):** callNarratorAPI>narrateResolution (3.7 s); judgeNarration>narrateResolution (0.3 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.5 s)
- **Roll:** take_decisive_action → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (take_decisive_action)
- **Time:** 21.9 s · **cost:** $0.0289

> **TABLE — Mira Kestrel**
>
> Take decisive action to seize the objective — the enemy.

> **TABLE — Gamemaster**
>
> Take Decisive Action progress (16 ticks) Progress: 4 | Challenge: 1, 2 Strong Hit Prevail. Take +1 momentum.

> **TABLE — Gamemaster**
>
> Fight over the enemy marked complete.

> **TABLE — Gamemaster**
>
> ⚔ Victory — a milestone toward your vow You won the fight serving “Find who is raiding the Cinder Expanse lanes”. ⚑ Mark milestone (×1) 🏁 Attempt to Fulfill 🤝 Deepen your bond with Tamsin Vey

> **NARRATOR — Gamemaster**
>
> Your last volley finds the cutter's magazine feed, and the *Ashen Wake* shudders along her whole length. Her remaining guns go quiet. Her running lights gutter, and she drifts off the ring, dead in the lane. The alarm still sounds, but nothing fires at you now. Your hands are steady on the controls. Out in the dark, someone aboard her keys a comm channel open and says nothing at all.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 3)

_To write — the reader's notes: what went right, what went wrong, and why._

### a38 · beat 14: Take Decisive Action; mark the milestone

- **Player:** click "⚑ Mark milestone (×1)" on m10 — _Mark milestone on victory card_
- **Notebook:** Beat14: pressed Mark milestone
- **Calls (1):** the AI player (2.4 s)
- **Beat 14 done:** Take Decisive Action came up strong_hit; the milestone (×1) is marked on "Find who is raiding the Cinder Expanse lanes"
- **Time:** 8.2 s · **cost:** $0.0101

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

_To write — the reader's notes: what went right, what went wrong, and why._

### x15 · beat 15: Interruption: End a Session opened and closed unanswered

- **Interruption:** End a Session was opened on the player's screen and closed unanswered — closed by its close control
- **Beat 15 done:** End a Session was opened and closed unanswered: the session is open, nothing was paid, the lock is free

> **PLAYER — Playthrough Player**
>
> !end-session

_To write — the reader's notes: what went right, what went wrong, and why._

### a39 · beat 16: Interruption: the X-Card on one narration

- **Player:** say: I look over the wreckage drifting off the ring and say what I see: scorched plating, a split hull, and nothing moving. — _beat 16_
- **Notebook:** Beat16: wreckage line sent
- **Calls (7):** callReaderAPI>readLine (1.7 s); callNarratorAPI>getRollingSessionSummary (2.3 s); callNarratorAPI>narratePacedInput (3.8 s); callHaiku>runConsistencyCheck (1.4 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.8 s)
- **Time:** 25.7 s, 8.6 s from the line to its reply · **cost:** $0.0335

> **PLAYER — Playthrough Player**
>
> I look over the wreckage drifting off the ring and say what I see: scorched plating, a split hull, and nothing moving.

> **NARRATOR — Gamemaster**
>
> The clerk's boot appears first, then the rest of him, easing out of the service hatch with a dock wrench held like a prayer. He stares at the cutter and says nothing. Scorched plating still ticks as it cools. The split hull turns slowly, and one gun port glows red, then goes black. Then the comm crackles with a low, even voice: "Registry says you came alone. Did you?"

_To write — the reader's notes: what went right, what went wrong, and why._

### x16 · beat 16: Interruption: the X-Card on one narration

- **Interruption:** the X-Card was played from the player's client (!x); the GM resumed (!x clear) — the X-Card went up and came down
- **Beat 16 done:** 1 narration(s) removed; none of their facts stands, and play has resumed

> **TABLE — Mira Kestrel**
>
> X-Card Scene paused. Current content is suppressed. The story will redirect at the next narration beat. Resume narration

> **TABLE — Gamemaster**
>
> X-Card cleared The GM has resumed narration.

_To write — the reader's notes: what went right, what went wrong, and why._

### a40 · beat 17: Correct an earlier fact

- **Player:** say: @scene Where is the Kobayashi IV? — _beat step 1_
- **Notebook:** Beat17: asked where ship is
- **Calls (3):** callNarratorAPI>interrogateScene (1.5 s); callHaiku>runConsistencyCheck (0.3 s); the AI player (3.3 s)
- **Time:** 13.0 s, 2.7 s from the line to its reply · **cost:** $0.0368

> **PLAYER — Playthrough Player**
>
> @scene Where is the Kobayashi IV?

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV is docked at Bleakhold Station, in the Cinder Expanse, pinned in her berth by the docking clamps. The *Ashen Wake* is dead and drifting off the ring.

_To write — the reader's notes: what went right, what went wrong, and why._

### a41 · beat 17: Correct an earlier fact

- **Player:** say: !truth list — _list truths_
- **Notebook:** Beat17: asked where; typed truth list
- **Calls (1):** the AI player (2.4 s)
- **Time:** 8.8 s · **cost:** $0.0093

> **PLAYER — Playthrough Player**
>
> !truth list

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity No truths are recorded in this scene. Earlier this session — strike one the same way: Scene 1 — the session begins (Tamsin Vey's ledger stall, Hollow Spire docks): tr-ccf4b Kobayashi IV — left the lane and followed the distress call's bearing into uncharted space Scene 4 — the characters have reached Bleakhold Station (Bleakhold Station docking berth): tr-031a1 raider cutter — is named the Ashen Wake tr-a21d2 Ashen Wake — has the better angle on the Kobayashi IV, which is pinned by the docking clamps tr-4844e Ashen Wake — returned fire on the Kobayashi IV and tore into her pinned hull from the better angle tr-44f9e Kobayashi IV — took heavy fire to the hull while pinned in the berth; a panel burst in the cockpit Scene 5 — a fight has begun: the enemy (the cockpit of the Kobayashi IV, in her berth): tr-483c4 Ashen Wake — two of her gun ports were knocked dark by Mira's burst; her remaining guns still fire on the Kobayashi IV tr-ee1a4 Ashen Wake — disabled by Mira's final volley; guns silent, lights failing, drifting off the ring

_To write — the reader's notes: what went right, what went wrong, and why._

### a42 · beat 17: Correct an earlier fact

- **Player:** say: !truth strike tr-031a1 — _strike the entry_
- **Notebook:** Beat17: truth list done; id tr-031a1; striking then set Cinder Wren
- **Calls (1):** the AI player (2.9 s)
- **Time:** 9.9 s · **cost:** $0.0101

> **PLAYER — Playthrough Player**
>
> !truth strike tr-031a1

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth tr-031a1 struck — it was set in an earlier scene of this session.

_To write — the reader's notes: what went right, what went wrong, and why._

### a43 · beat 17: Correct an earlier fact

- **Player:** say: !truth set "raider cutter" is named the Cinder Wren — _final step_
- **Notebook:** Beat17: struck, set Cinder Wren sent
- **Calls (1):** the AI player (2.3 s)
- **Beat 17 done:** the old value is struck (or was never in the ledger) and "is named the Cinder Wren" stands
- **Time:** 9.4 s · **cost:** $0.0095

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Cinder Wren

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Cinder Wren tr-23de0 .

_To write — the reader's notes: what went right, what went wrong, and why._

### a44 · beat 18: Ask the oracle

- **Player:** say: !oracle yes likely Is anyone left alive aboard the Cinder Wren? — _beat asks_
- **Notebook:** Beat18: oracle typed
- **Calls (5):** callNarratorAPI>narrateOracleFollowup (5.7 s); judgeNarration>narrateOracleFollowup (0.3 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (1.0 s); the AI player (2.6 s)
- **Beat 18 done:** the oracle answered YES
- **Time:** 25.7 s, 10.0 s from the line to its reply · **cost:** $0.0449

> **PLAYER — Playthrough Player**
>
> !oracle yes likely Is anyone left alive aboard the Cinder Wren?

> **TABLE — Mira Kestrel**
>
> Ask the Oracle (likely) Is anyone left alive aboard the Cinder Wren? d100 = 62 → YES

> **NARRATOR — Gamemaster**
>
> The channel that opened a moment ago is still open, and now it carries sound: a cough, wet and short, and the scrape of a boot dragging across a deck plate. Aboard the *Cinder Wren*, someone is alive and moving in the dark, working their way toward the open comm. Through the cockpit glass, a single emergency light flickers once in the cutter's flank, the only sign that anyone has bothered to be there at all. The alarm in your own cockpit winds down. In the berth, the clamps hold you where they've held you all along, and the dead panel by your knee gives off a thin line of smoke. Whoever is on the other end breathes twice into the channel and keeps their counsel.

_To write — the reader's notes: what went right, what went wrong, and why._

### x19 · beat 19: Interruption: the GM renames the connection's card

- **Interruption:** the GM renamed Tamsin Vey's card to Tamsin Okoro — renamed
- **Beat 19 done:** Tamsin Vey is now Tamsin Okoro; the vow "Find who is raiding the Cinder Expanse lanes" shows the new name

> **TABLE — Tamsin Okoro**
>
> Renamed to Tamsin Okoro

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Vey renamed to Tamsin Okoro

_To write — the reader's notes: what went right, what went wrong, and why._

### a45 · beat 20: End a Session

- **Player:** say: !end-session — _start end session_
- **Notebook:** Beat20: typed !end-session
- **Calls (1):** the AI player (2.2 s)
- **Time:** 3.2 s · **cost:** $0.0094

> **PLAYER — Playthrough Player**
>
> !end-session

_To write — the reader's notes: what went right, what went wrong, and why._

## after-session-2

### a46 · beat 20: End a Session

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with quest focus_
- **Notebook:** Beat20: submitted End Session
- **Calls (7):** callNarratorAPI>getRollingSessionSummary ×2 (2.1 s); callNarratorAPI>narrateSessionVignette (4.7 s); callHaiku>runConsistencyCheck (0.3 s); callNarratorAPI>getCampaignRecap ×2 (6.4 s); the AI player (2.7 s)
- **Beat 20 done:** session 2 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 40.0 s · **cost:** $0.0913

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

> **NARRATOR (npc_end) — Gamemaster**
>
> Raw materials storage is a long cold hold, and one of the raiders has been working the same problem in it since the shift turned. A stack of ore sleds blocks the aisle to the manifest terminal, jammed with fallen scrap that no one has cleared. The raider reads the filed shipping lists aloud under their breath, shaping each cargo code into a flatter, rougher dialect meant for the crews out on the lanes. Every few lines the raider stops and tries a different word for the same thing. The rubble stays where it is, and the lists get longer.

_To write — the reader's notes: what went right, what went wrong, and why._

### a47 · beat 21: Begin a Session; ask probe set B

- **Player:** say: !begin-session — _Start session 3_
- **Notebook:** Beat21: typed !begin-session
- **Calls (1):** the AI player (6.0 s)
- **Time:** 4.4 s · **cost:** $0.0093

> **PLAYER — Playthrough Player**
>
> !begin-session

_To write — the reader's notes: what went right, what went wrong, and why._

## session-3

### a48 · beat 21: Begin a Session; ask probe set B

- **Player:** in "Begin a Session" press "Begin" — _Submit begin session_
- **Notebook:** Beat21: pressed Begin; next ask probe B questions
- **Calls (5):** callNarratorAPI>narrateSessionVignette ×2 (4.2 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallTierAPI (0.3 s); the AI player (2.8 s)
- **Time:** 27.0 s · **cost:** $0.0633

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> You sit in the cockpit with the dead panel smoking by your knee, doing the one thing the situation leaves you: drafting, in your head, a cheerful and entirely fictitious account of how the Kobayashi IV came to be pinned in her berth. In it, the pinning was a deliberate docking technique and the smoke was incense. It is the sort of risky little fraud that gets a ship past a harbormaster's inspection, and you have not decided whether to try it yet. The open channel breathes into the cockpit, wet and patient. Through the glass, the cutter's one stubborn emergency light flickers in her flank, the only sign the dead ship has any manners left.

_To write — the reader's notes: what went right, what went wrong, and why._

### a49 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Remind me, which keepsake of my sister's is on me? — _first question_
- **Notebook:** Beat21: asking probe B; q1 sent
- **Calls (3):** callNarratorAPI>interrogateScene (0.8 s); callHaiku>runConsistencyCheck (0.3 s); the AI player (2.6 s)
- **Time:** 12.2 s, 1.9 s from the line to its reply · **cost:** $0.0179

> **PLAYER — Playthrough Player**
>
> @scene Remind me, which keepsake of my sister's is on me?

> **NARRATOR — Gamemaster**
>
> You carry Ilse's brass star-compass, the one thing of your sister's you still have.

_To write — the reader's notes: what went right, what went wrong, and why._

### a50 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Who do I count as a friend among the dock traders back where this began? — _probe q2_
- **Notebook:** Beat21: q2 sent
- **Calls (3):** callNarratorAPI>interrogateScene (1.9 s); callHaiku>runConsistencyCheck (0.3 s); the AI player (2.4 s)
- **Time:** 13.0 s, 2.8 s from the line to its reply · **cost:** $0.0164

> **PLAYER — Playthrough Player**
>
> @scene Who do I count as a friend among the dock traders back where this began?

> **NARRATOR — Gamemaster**
>
> Tamsin Okoro, the salvage broker with the ledger stall at the end of the Hollow Spire docks, agreed to be your dock contact. The story has not established anyone else among the traders as a friend, and two stall keepers there refused to talk to you.

_To write — the reader's notes: what went right, what went wrong, and why._

### a51 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Whose hands is the manifest in these days? — _next question_
- **Notebook:** Beat21: q3 sent
- **Calls (3):** callNarratorAPI>interrogateScene (2.2 s); callHaiku>runConsistencyCheck (0.3 s); the AI player (2.6 s)
- **Time:** 16.0 s, 3.8 s from the line to its reply · **cost:** $0.0161

> **PLAYER — Playthrough Player**
>
> @scene Whose hands is the manifest in these days?

> **NARRATOR — Gamemaster**
>
> Tamsin Okoro has it. You left the cargo manifest with her at Hollow Spire, and she slid it under her tally stone beside the torn salvage tag and your fee slip.

_To write — the reader's notes: what went right, what went wrong, and why._

### a52 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene What deadline did I give for coming home to the docks? — _q4_
- **Notebook:** Beat21: q4 sent
- **Calls (3):** callNarratorAPI>interrogateScene (1.8 s); callHaiku>runConsistencyCheck (0.3 s); the AI player (2.9 s)
- **Time:** 15.6 s, 2.9 s from the line to its reply · **cost:** $0.0158

> **PLAYER — Playthrough Player**
>
> @scene What deadline did I give for coming home to the docks?

> **NARRATOR — Gamemaster**
>
> You promised Tamsin Okoro you would be back before the next tide of cargo. The story has not put a clock or a date on how long that tide is.

_To write — the reader's notes: what went right, what went wrong, and why._

### a53 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Where is my ship berthed right now, and who commands her? — _q5_
- **Notebook:** Beat21: q5 sent
- **Calls (3):** callNarratorAPI>interrogateScene (0.8 s); callHaiku>runConsistencyCheck (0.3 s); the AI player (2.5 s)
- **Time:** 13.2 s, 2.6 s from the line to its reply · **cost:** $0.0159

> **PLAYER — Playthrough Player**
>
> @scene Where is my ship berthed right now, and who commands her?

> **NARRATOR — Gamemaster**
>
> Your ship, the Kobayashi IV, is berthed at Bleakhold Station, pinned in her berth by the docking clamps. You command her.

_To write — the reader's notes: what went right, what went wrong, and why._

### a54 · beat 21: Begin a Session; ask probe set B

- **Player:** say: What is the raider cutter called? — _q6 plain_
- **Notebook:** Beat21: q6 sent
- **Calls (7):** callReaderAPI>readLine (1.1 s); callNarratorAPI>narratePacedInput (3.6 s); judgeNarration>narratePacedInput (0.6 s); callHaiku>runConsistencyCheck (0.7 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.4 s)
- **Time:** 27.1 s, 11.4 s from the line to its reply · **cost:** $0.0364

> **PLAYER — Playthrough Player**
>
> What is the raider cutter called?

> **NARRATOR — Gamemaster**
>
> The cutter's name is the *Cinder Wren*. It shows in pale paint along her flank, below the one stubborn emergency light. You read it aloud once, to hear how it sounds. The open channel stops breathing and goes still. Then a voice comes through, cracked and unhurried. "That's right, Mira Kestrel. Now tell me what yours is called."

_To write — the reader's notes: what went right, what went wrong, and why._

### a55 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene What surname does my broker friend go by these days? — _last probe question_
- **Notebook:** Beat21: q7 sent
- **Calls (3):** callNarratorAPI>interrogateScene (1.7 s); callHaiku>runConsistencyCheck (0.3 s); the AI player (2.8 s)
- **Beat 21 done:** probe set B: 7 question(s) asked
- **Time:** 14.8 s, 3.3 s from the line to its reply · **cost:** $0.0155

> **PLAYER — Playthrough Player**
>
> @scene What surname does my broker friend go by these days?

> **NARRATOR — Gamemaster**
>
> Her surname is Okoro: Tamsin Okoro, the salvage broker who runs the ledger stall at the end of the Hollow Spire docks.

_To write — the reader's notes: what went right, what went wrong, and why._

### a56 · beat 22: Recover

- **Player:** say: I rest aboard until the next morning. — _beat start_
- **Notebook:** Beat22: rest line sent; next repair ship
- **Calls (7):** callReaderAPI>readLine (2.0 s); callNarratorAPI>getRollingSessionSummary (0.7 s); callNarratorAPI>narratePacedInput (4.5 s); callHaiku>runConsistencyCheck (0.8 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (2.0 s); the AI player (2.4 s)
- **Time:** 32.3 s, 14.2 s from the line to its reply · **cost:** $0.0298

> **PLAYER — Playthrough Player**
>
> I rest aboard until the next morning.

> **NARRATOR — Gamemaster**
>
> Morning at Bleakhold Station comes as a change in the corridor lights. The berth holds you pinned, a cockpit panel still dead. The comm light is lit. The channel opened last night has not closed. A knock sounds on the outer lock, three taps, spaced evenly. Someone has brought a ledger. "You promised me twice already," says a dry voice outside. "Open up and say it a third time."

_To write — the reader's notes: what went right, what went wrong, and why._

### a57 · beat 22: Recover

- **Player:** say: I go down to the hull and the dead cockpit panel, and set about patching the plating and rewiring the damaged systems. — _mend ship_
- **Notebook:** Beat22: repair line sent
- **Calls (6):** callReaderAPI>readLine (2.1 s); callNarratorAPI>narratePacedInput (3.4 s); callHaiku>runConsistencyCheck (1.8 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.8 s)
- **Time:** 23.4 s, 8.4 s from the line to its reply · **cost:** $0.0322

> **PLAYER — Playthrough Player**
>
> I go down to the hull and the dead cockpit panel, and set about patching the plating and rewiring the damaged systems.

> **NARRATOR — Gamemaster**
>
> The knocking comes again outside, three taps, patient as a clock. You ignore it and crouch at the dead cockpit panel, working a seam of scorched plating loose with your fingertips. Wiring hangs behind it, charred at the ends. You count what is salvageable and what is not. The comm light stays lit. Beyond the lock, the dry voice waits. *Mending the panel and the plating would be a Repair, if you commit to the work.*

_To write — the reader's notes: what went right, what went wrong, and why._

### a58 · beat 22: Recover

- **Player:** click "Roll Repair" on m12 — _Card offers the roll_
- **Notebook:** Beat22: pressed Roll Repair
- **Calls (4):** callNarratorAPI>narrateResolution (3.9 s); callHaiku>runConsistencyCheck (2.5 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.7 s)
- **Roll:** repair → weak_hit — Action: 2 + 3 = 5 \| Challenge: 1, 10
- **GM's rules:** accepted the proposed move (repair)
- **Beat 22 done:** repair came up weak_hit at a58
- **Time:** 31.4 s · **cost:** $0.0303

> **TABLE — Mira Kestrel**
>
> ↳ Repair — rolled from the offer above

> **TABLE — Gamemaster**
>
> Repair +wits (3) Action: 2 + 3 = 5 | Challenge: 1, 10 Weak Hit Gain repair points: facility 3, field 1, under fire 0. Same spend options. 🔧 Spend repair points

> **NARRATOR — Gamemaster**
>
> "Three taps," the dry voice says through the lock. "I can wait all morning." You work anyway. The plating seats and the weld takes. The cockpit panel flickers awake, then holds, though it costs you most of your spare conductor and a long stretch of the morning. Your hands come away black to the wrist. Outside, a pen scratches on paper, patient as a debt.

_To write — the reader's notes: what went right, what went wrong, and why._

### a59 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I open the lock for Tamsin and hand her the scorched cargo log I salvaged from the cutter fight, telling her what I've learned about the raiders. — _grow bond_
- **Notebook:** Beat23: first closeness line sent
- **Calls (8):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narratePacedInput ×2 (4.3 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.2 s)
- **Time:** 30.3 s, 15.6 s from the line to its reply · **cost:** $0.0551

> **PLAYER — Playthrough Player**
>
> I open the lock for Tamsin and hand her the scorched cargo log I salvaged from the cutter fight, telling her what I've learned about the raiders.

> **NARRATOR — Gamemaster**
>
> The lock cycles, and the outer door slides open on a corridor with no one in it. The pen scratching has stopped. A speaker grille beside the frame crackles, and the dry voice comes through it, thin with distance. "Read me the log, then. Everything you've learned about the raiders. Slowly, and loud enough that the corridor hears it." Somewhere along the berth, a boot scuffs and goes still.

_To write — the reader's notes: what went right, what went wrong, and why._

### a60 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I read her the log aloud, slowly, every line I've learned about the raiders, and I tell her I'd trust her with the rest of it too. — _continue bonding_
- **Notebook:** Beat23: read log line sent
- **Calls (8):** callReaderAPI>readLine (1.2 s); callNarratorAPI>narratePacedInput (5.3 s); judgeNarration>narratePacedInput (0.4 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.8 s)
- **Time:** 27.9 s, 11.0 s from the line to its reply · **cost:** $0.0386

> **PLAYER — Playthrough Player**
>
> I read her the log aloud, slowly, every line I've learned about the raiders, and I tell her I'd trust her with the rest of it too.

> **NARRATOR — Gamemaster**
>
> You read the log aloud, line by line, every figure and every filing date. Your voice carries down the berth, and a door somewhere along it clicks shut. The pen starts again behind the grille, scratching steadily. "Good," says the dry voice, no longer thin. "Say the last part again. The part about trusting me." Boots shift in the corridor, closer now, and stop. *Whether your trust is worth anything to her would be a Develop Your Relationship.*

_To write — the reader's notes: what went right, what went wrong, and why._

### a61 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Card offers the roll_
- **Notebook:** Beat23: pressed Roll Develop Your Relationship
- **Calls (5):** callNarratorAPI>narrateResolution (4.5 s); callHaiku>runConsistencyCheck (2.2 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.8 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 24.9 s · **cost:** $0.0361

> **TABLE — Mira Kestrel**
>
> ↳ Develop Your Relationship — rolled from the offer above

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
> You say the last part again, steadily, into the grille. The pen stops. For a moment the corridor holds its breath. Then the dry voice comes back, softer than before. "I wrote it down once this time." A latch turns somewhere along the berth, and the boots move off, unhurried. "Keep the rest of what you know close. I will ask for it when it's worth something."

_To write — the reader's notes: what went right, what went wrong, and why._

### a62 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I step out into the corridor and press my sister Ilse's story on her too, the whole of it, and tell her I'll risk the Kobayashi's berth fee to see her ledger squared. — _continue building bond_
- **Notebook:** Beat23: 2nd closeness line sent (at 8/40 before)
- **Calls (7):** callReaderAPI>readLine (2.0 s); callNarratorAPI>narratePacedInput (4.9 s); callHaiku>runConsistencyCheck (0.7 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.2 s)
- **CHECK VIOLATED — answered-once:** the line was narrated 2 times
- **Time:** 24.8 s, 11.9 s from the line to its reply · **cost:** $0.0406

> **PLAYER — Playthrough Player**
>
> I step out into the corridor and press my sister Ilse's story on her too, the whole of it, and tell her I'll risk the Kobayashi's berth fee to see her ledger squared.

> **NARRATOR — Gamemaster**
>
> The first sound is the pen, scratching again behind the grille, unhurried. You step into the corridor and tell Ilse's story whole: the compass, the colony ship, the years of looking. You offer to carry the berth fee yourself until her ledger balances. A hatch down the berth eases shut. Tamsin says nothing for a long moment. Then the grille clicks, and her dry voice says, "Tell me the part you left out." *Whether she believes any of it would be a Develop Your Relationship.*

> **NARRATOR — Gamemaster**
>
> ◈ Narrative Review The narrator may have contradicted an established fact. [offer] Develop Your Relationship — recorded — NOT YET [offer] Develop Your Relationship is only offered. It has not been made, and nothing it would decide has happened The narration said: “"*Whether she believes any of it would be a Develop Your Relationship.*"” The narration told what its result did not allow (the line above): nothing on a sheet changed — say the correction at the table.

_To write — the reader's notes: what went right, what went wrong, and why._

### a63 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _offered roll button_
- **Notebook:** Beat23: pressed 2nd Roll Develop
- **Calls (6):** callNarratorAPI>narrateResolution (4.8 s); callHaiku>runConsistencyCheck (0.8 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.7 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 28.4 s · **cost:** $0.0311

> **TABLE — Mira Kestrel**
>
> ↳ Develop Your Relationship — rolled from the offer above

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
> "I did not ask for the compass," Tamsin says through the grille, and the pen scratches once more. "You gave it anyway." Something small sets down on wood behind the speaker. Down the corridor, a boot scuffs, then retreats. "The berth fee is nothing. I want what you left out, and I will wait for it. Your sister's name goes in the ledger once, in ink I do not cross out."

_To write — the reader's notes: what went right, what went wrong, and why._

### a64 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I tell her the part I left out: I nearly sold the compass once, years ago, and I'll hand her my own flight log as a pledge so she can hold it against me. — _continue building bond_
- **Notebook:** Beat23: 3rd closeness line sent (~24/40?)
- **Calls (7):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narratePacedInput (4.4 s); callHaiku>runConsistencyCheck (0.7 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.9 s)
- **Time:** 25.1 s, 10.4 s from the line to its reply · **cost:** $0.0400

> **PLAYER — Playthrough Player**
>
> I tell her the part I left out: I nearly sold the compass once, years ago, and I'll hand her my own flight log as a pledge so she can hold it against me.

> **NARRATOR — Gamemaster**
>
> You say it plainly into the grille: the years ago, the buyer's dock, the compass already wrapped for sale. Then you slide your flight log through the slot beside the frame. The pen stops. Paper turns behind the speaker, one page, then another. "Pledged against you," Tamsin says, dry as ever, but slower. Her chair creaks. "That is a heavier thing than a promise. Now I have to decide what it weighs." *Whether she decides in your favour would be a Develop Your Relationship.*

_To write — the reader's notes: what went right, what went wrong, and why._

### a65 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Roll offered_
- **Notebook:** Beat23: pressed 3rd Roll Develop (flight log pledge)
- **Calls (5):** callNarratorAPI>narrateResolution (4.3 s); callHaiku>runConsistencyCheck (1.0 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.8 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 28.0 s · **cost:** $0.0305

> **TABLE — Mira Kestrel**
>
> ↳ Develop Your Relationship — rolled from the offer above

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
> Tamsin's chair creaks, and the page-turning stops. A drawer opens and shuts behind the grille. "I weighed it," she says. "A flight log is the one thing a captain does not hand over by accident." The lock beside you clicks, and a narrow shelf slides out of the wall. Your log lies on it, closed, a torn salvage tag tucked in the cover. "Come to the stall at dawn. Bring the manifest you trust least."

_To write — the reader's notes: what went right, what went wrong, and why._

### a66 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I take my log back, then bring Tamsin the manifest I trust least and lay it open on her counter, telling her she can keep every page of it, whatever it costs me. — _Continue building the relationship._
- **Notebook:** Beat23: 4th closeness line sent (manifest at dawn)
- **Calls (8):** callReaderAPI>readLine (1.6 s); callNarratorAPI>narratePacedInput ×2 (4.5 s); callHaiku>runConsistencyCheck (0.8 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (3.4 s)
- **Time:** 32.8 s, 16.8 s from the line to its reply · **cost:** $0.0659

> **PLAYER — Playthrough Player**
>
> I take my log back, then bring Tamsin the manifest I trust least and lay it open on her counter, telling her she can keep every page of it, whatever it costs me.

> **NARRATOR — Gamemaster**
>
> You take the log back from the shelf and bring the manifest you trust least to the outer lock. The grille clicks. You hold the pages open before it and tell her she can keep every one, whatever it costs. The pen stops. Paper shifts behind the speaker, once. "Whatever it costs," says the dry voice, quietly. "That is not a figure I can write down." A long pause follows, and down the berth a latch turns. *Whether she takes the gift as trust would be a Develop Your Relationship.*

_To write — the reader's notes: what went right, what went wrong, and why._

### a67 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Offered roll for the closeness line_
- **Notebook:** Beat23: pressed 4th Roll Develop (manifest)
- **Calls (7):** callNarratorAPI>narrateResolution (5.1 s); judgeNarration>narrateResolution (0.4 s); callHaiku>runConsistencyCheck (0.6 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.9 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 27.7 s · **cost:** $0.0318

> **TABLE — Mira Kestrel**
>
> ↳ Develop Your Relationship — rolled from the offer above

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
> A latch turns somewhere down the berth, and a door that was shut stays shut. Behind the grille, Tamsin's pen finally moves. It writes a short line, then crosses nothing out. "I will keep the pages," she says. "The cost goes in the ledger as it falls, not before." The shelf slides out again, empty, and something metal taps twice against it from inside the wall. "Leave them there. Then tell me who else has asked to read that manifest."

_To write — the reader's notes: what went right, what went wrong, and why._

### a68 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I leave the pages on the shelf and tell her plainly: a dock clerk at Bleakhold asked to read it, and I told him nothing. I'd rather give her the name than keep it. — _continue building relationship_
- **Notebook:** Beat23: 5th closeness line sent (clerk name)
- **Calls (7):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narratePacedInput (5.4 s); callHaiku>runConsistencyCheck (1.1 s); callHaiku>defaultCallDetectionAPI (1.3 s); callHaiku>defaultCallTierAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.9 s)
- **Time:** 27.9 s, 11.8 s from the line to its reply · **cost:** $0.0643

> **PLAYER — Playthrough Player**
>
> I leave the pages on the shelf and tell her plainly: a dock clerk at Bleakhold asked to read it, and I told him nothing. I'd rather give her the name than keep it.

> **NARRATOR — Gamemaster**
>
> "A clerk," Tamsin says, and the pen moves once. "Name him, or describe him. Do not make me guess." You set the pages on the shelf, squared at the edges. Behind the grille, something small is set down. Down the berth, a hatch that has stayed shut all morning begins, very slowly, to open. *Whether she trusts the name you've offered would be a Develop Your Relationship.*

_To write — the reader's notes: what went right, what went wrong, and why._

### a69 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Roll offered_
- **Notebook:** Beat23: pressed 5th Roll Develop (clerk)
- **Calls (6):** callNarratorAPI>narrateResolution (3.8 s); callHaiku>runConsistencyCheck (0.7 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.9 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 22.8 s · **cost:** $0.0353

> **TABLE — Mira Kestrel**
>
> ↳ Develop Your Relationship — rolled from the offer above

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
> Tamsin says nothing for a moment. Then the pen scratches, steady now, and a faint smell of ink and warm paper drifts out through the slot beside the lock. "A clerk who asks and is refused will ask someone else," she says. "I am glad you gave me the name instead of a guess." Down the berth, the hatch swings wide, and a pair of boots scuffs once on the deck plate, then stops.

_To write — the reader's notes: what went right, what went wrong, and why._

### a70 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: Tamsin, you've weighed everything I've brought you. Will you stand with me for good, a bond that outlasts this job? — _Track full_
- **Notebook:** Beat23: track full, asked her to stand with me
- **Calls (9):** callReaderAPI>readLine (1.8 s); callNarratorAPI>narratePacedInput ×2 (4.7 s); judgeNarration>narratePacedInput (1.6 s); callHaiku>runConsistencyCheck (0.7 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.8 s)
- **Time:** 34.2 s, 17.8 s from the line to its reply · **cost:** $0.0699

> **PLAYER — Playthrough Player**
>
> Tamsin, you've weighed everything I've brought you. Will you stand with me for good, a bond that outlasts this job?

> **NARRATOR — Gamemaster**
>
> The pen goes still. Behind the grille, a chair creaks, and for a long moment the berth is quiet. "A bond," Tamsin says, dry as ever, but without the scratch of ink under it. "I have written your promises down twice each. I have never written that word." Down the corridor, the open hatch holds a shape that does not move. *Binding her to you for good would be a Forge a Bond, if you press it.*

_To write — the reader's notes: what went right, what went wrong, and why._

### a71 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Forge a Bond" on m12 — _Narrator offered the roll_
- **Notebook:** Beat23: pressed Roll Forge a Bond
- **Calls (7):** callNarratorAPI>narrateResolution (3.6 s); judgeNarration>narrateResolution (0.4 s); callHaiku>runConsistencyCheck (1.3 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (2.6 s)
- **Roll:** forge_a_bond → strong_hit (scripted dice) — Progress: 10 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (forge_a_bond)
- **Beat 23 done:** a bond is forged with Tamsin Okoro (dangerous), its track at 40 ticks
- **Time:** 25.8 s · **cost:** $0.0316

> **TABLE — Mira Kestrel**
>
> ↳ Forge a Bond — rolled from the offer above

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
> The pen scratches once, and the pause after it is longer than the writing. "Bond," Tamsin says, as if testing a coin between her teeth. "Entered. Under your name, and not in the debt column." The chair creaks as she sits back. Down the corridor, the figure in the open hatch lifts one hand, slowly, and holds it flat in the air.

_To write — the reader's notes: what went right, what went wrong, and why._

### a72 · beat 24: Develop Your Relationship again, bonded

- **Player:** say: I sit down on the deck by the grille and tell Tamsin I'll share a meal with her through the slot, and stay as long as she wants to talk. — _grow closer_
- **Notebook:** Beat24: bonded closeness line sent
- **Calls (8):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narratePacedInput (4.6 s); judgeNarration>narratePacedInput (0.7 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (2.8 s)
- **Time:** 28.4 s, 12.7 s from the line to its reply · **cost:** $0.0454

> **PLAYER — Playthrough Player**
>
> I sit down on the deck by the grille and tell Tamsin I'll share a meal with her through the slot, and stay as long as she wants to talk.

> **NARRATOR — Gamemaster**
>
> The figure in the open hatch lowers its hand and does not come closer. You sit on the deck beside the grille, back against the cold frame. A small tray slides out through the slot: flatbread, a strip of dried fish, a cup with a chip in the rim. Behind the speaker, a second cup is set down on wood. "Eat," Tamsin says, dry as ever. "I keep no tab on food." *Whether the meal draws her closer would be a Develop Your Relationship.*

_To write — the reader's notes: what went right, what went wrong, and why._

### a73 · beat 24: Develop Your Relationship again, bonded

- **Player:** click "Roll Develop Your Relationship" on m12 — _Roll the bonded develop relationship_
- **Notebook:** Beat24: pressed bonded Roll Develop
- **Calls (7):** callNarratorAPI>narrateResolution (4.2 s); judgeNarration>narrateResolution (0.5 s); callHaiku>runConsistencyCheck (1.2 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.6 s)
- **Roll:** develop_your_relationship → weak_hit — Action: 4 + 2 = 6 \| Challenge: 1, 9
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Beat 24 done:** the bonded Develop Your Relationship was rolled at a73 (weak_hit); no progress was marked
- **Time:** 28.0 s · **cost:** $0.0316

> **TABLE — Mira Kestrel**
>
> ↳ Develop Your Relationship — rolled from the offer above

> **TABLE — Gamemaster**
>
> Develop Your Relationship +dangerous (2) Action: 4 + 2 = 6 | Challenge: 1, 9 Weak Hit Bonded: take +2 momentum.

> **TABLE — Gamemaster**
>
> Develop Your Relationship Your bond with Tamsin Okoro holds — take +2 momentum.

> **NARRATOR — Gamemaster**
>
> "I ate with a man once who kept a tab on the salt," Tamsin says. The cup behind the grille clinks against wood, and you eat what she has sent. She talks a little: ledgers, a bad winter at the Spire, nothing that costs her. Down the corridor, the figure in the hatch shifts its weight and stays. "Same time tomorrow," Tamsin adds, "if the berth holds."

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 6)

_To write — the reader's notes: what went right, what went wrong, and why._

### a74 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I ask Tamsin to check the Hollow Spire dock records for who hired the cutter, and I put my own berth fee on the counter against what she finds. — _search for who sent the raiders_
- **Notebook:** Beat25: first search line sent (dock records)
- **Calls (8):** callReaderAPI>readLine (1.0 s); callNarratorAPI>narratePacedInput (4.9 s); judgeNarration>narratePacedInput (0.3 s); callHaiku>runConsistencyCheck (0.8 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (5.1 s)
- **Time:** 27.9 s, 13.5 s from the line to its reply · **cost:** $0.0473

> **PLAYER — Playthrough Player**
>
> I ask Tamsin to check the Hollow Spire dock records for who hired the cutter, and I put my own berth fee on the counter against what she finds.

> **NARRATOR — Gamemaster**
>
> The pen stops. "The cutter's hire would sit in the Spire's dock records," Tamsin says through the grille, "and I keep a key to those." You set your berth fee on the shelf, coins squared in a row. Behind the speaker, a drawer slides open and a seal cracks. The figure in the hatch takes one step nearer, then another, and its shadow reaches your boots. *Whether she gives you straight answers or only the pieces that suit her would be a Develop Your Relationship.*

_To write — the reader's notes: what went right, what went wrong, and why._

### a75 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "Roll Develop Your Relationship" on m12 — _Narrator offered a roll for what I was doing._
- **Notebook:** Beat25: pressed Roll on dock records search
- **Calls (7):** callNarratorAPI>narrateResolution (5.2 s); judgeNarration>narrateResolution (0.3 s); callHaiku>runConsistencyCheck (0.9 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (1.5 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.5 s)
- **Roll:** develop_your_relationship → miss — Action: 3 + 2 = 5 \| Challenge: 7, 6
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 26.0 s · **cost:** $0.0339

> **TABLE — Mira Kestrel**
>
> ↳ Develop Your Relationship — rolled from the offer above

> **TABLE — Gamemaster**
>
> Develop Your Relationship +dangerous (2) Action: 3 + 2 = 5 | Challenge: 7, 6 Miss Bonded: take no lasting benefit.

> **TABLE — Gamemaster**
>
> Develop Your Relationship No lasting benefit from your bond with Tamsin Okoro this time.

> **NARRATOR — Gamemaster**
>
> The seal stays cracked and the page goes unread. "That key is a thing I trust no one with," Tamsin says through the grille, "and I trusted you with it a sentence ago." The drawer shuts hard. Your coins sit on the shelf, squared and untouched. At the hatch, the figure stands close enough now that you hear it breathing. "Bond or not," Tamsin adds, "who else knows you came asking about that cutter?"

_To write — the reader's notes: what went right, what went wrong, and why._

### a76 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I mark progress on my vow: this is a milestone. Nobody else knows I came asking, Tamsin, and I'll keep it that way. — _Last resort permitted_
- **Notebook:** Beat25: used last resort milestone line
- **Calls (8):** callReaderAPI>readLine (2.2 s); callNarratorAPI>narratePacedInput (5.0 s); judgeNarration>narratePacedInput (0.4 s); callHaiku>runConsistencyCheck (0.7 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (3.2 s)
- **Time:** 30.2 s, 13.6 s from the line to its reply · **cost:** $0.0475

> **PLAYER — Playthrough Player**
>
> I mark progress on my vow: this is a milestone. Nobody else knows I came asking, Tamsin, and I'll keep it that way.

> **NARRATOR — Gamemaster**
>
> You tell her no one else knows, and the grille takes the words without comment. The pen scratches once. Behind you, the figure at the hatch goes still, breathing slowed to match your own. "Then it stays between a ledger and a deck plate," Tamsin says, dry and low. Something heavy shifts in the corridor, close enough to touch. Whatever your promise is worth, someone just heard you make it. *Marking that as a milestone would be a Reach a Milestone, if you choose to.*

_To write — the reader's notes: what went right, what went wrong, and why._

### a77 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I turn to the figure in the corridor, hand away from my belt, and ask who hired the cutter and who sent it after the lanes. — _search again_
- **Notebook:** Beat25: asked figure in corridor who hired cutter
- **Calls (8):** callReaderAPI>readLine (1.8 s); callNarratorAPI>narratePacedInput (3.3 s); judgeNarration>narratePacedInput (0.3 s); callHaiku>runConsistencyCheck (0.7 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (3.6 s)
- **CHECK VIOLATED — answered-once:** the line was narrated 2 times
- **Time:** 27.3 s, 11.2 s from the line to its reply · **cost:** $0.0476

> **PLAYER — Playthrough Player**
>
> I turn to the figure in the corridor, hand away from my belt, and ask who hired the cutter and who sent it after the lanes.

> **NARRATOR — Gamemaster**
>
> Behind the grille, Tamsin's pen stops, and the chair stays silent. You turn and keep your hand clear of your belt. The figure in the hatch says nothing at first. Its breathing slows. Then it takes one step back into the dark of the open frame, boots soft on the deck plate, and a cuff chain chimes once against its wrist. Whoever it is, they are weighing what you just asked. *Pressing for the name of the one who hired the cutter would be a Compel.*

> **NARRATOR — Gamemaster**
>
> ◈ Narrative Review The narrator may have contradicted an established fact. [Offer] — recorded — NOT YET [offer] Compel is only offered. It has not been made, and nothing it would decide has happened: narrate up to the point where it would begin and stop there The narration said: “"Pressing for the name of the one who hired the cutter would be a Compel."” The narration told what its result did not allow (the line above): nothing on a sheet changed — say the correction at the table.

_To write — the reader's notes: what went right, what went wrong, and why._

### a78 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "Roll Compel" on m12 — _Press offered roll_
- **Notebook:** Beat25: pressed Roll Compel on figure
- **Calls (6):** callNarratorAPI>narrateResolution (4.8 s); judgeNarration>narrateResolution (0.4 s); callHaiku>runConsistencyCheck (1.2 s); callHaiku>defaultCallDetectionAPI (1.8 s); callChronicleAPI>writeChronicleEntry (1.9 s); the AI player (2.5 s)
- **Roll:** compel → weak_hit — Action: 1 + 2 = 3 \| Challenge: 8, 1
- **GM's rules:** accepted the proposed move (compel)
- **Time:** 28.6 s · **cost:** $0.0346

> **TABLE — Mira Kestrel**
>
> ↳ Compel — rolled from the offer above

> **TABLE — Gamemaster**
>
> Compel +heart (2) Action: 1 + 2 = 3 | Challenge: 8, 1 Weak Hit They agree, but with a demand or complication — envision their counteroffer. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> "Name your price first," the figure says, voice rough as a cut cable, and it steps into the light with the cuff chain swinging. A survivor of the cutter, hollow-eyed, scorched along one sleeve. It knows who paid for the lanes, it says, and it will give the name for passage off this ring and a berth that asks no questions. Behind the grille, Tamsin's pen has not moved. The figure waits, hands open, watching your belt.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 7)

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Cutter Survivor — A hollow-eyed, scorched survivor of the raider cutter, chained at the wrist, who knows who paid for the Cinder Expanse lane raids and offers the name in exchange for passage off the ring and a berth asking no questions. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

_To write — the reader's notes: what went right, what went wrong, and why._

### a79 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I'll get you passage off the ring and a quiet berth. Now give me the name of who paid for the lanes. — _continue_
- **Notebook:** Beat25: agreed passage to survivor, asked name
- **Calls (7):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narratePacedInput (5.2 s); callHaiku>runConsistencyCheck (0.3 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.0 s)
- **Time:** 27.0 s, 11.3 s from the line to its reply · **cost:** $0.0499

> **PLAYER — Playthrough Player**
>
> I'll get you passage off the ring and a quiet berth. Now give me the name of who paid for the lanes.

> **NARRATOR — Gamemaster**
>
> The survivor's eyes cut to the grille, then back to you. "Passage and a quiet berth," it says, tasting each word. The cuff chain stops swinging. Behind the speaker, Tamsin's pen scratches once and goes quiet. The survivor's mouth works around a name, and the sound dies in its throat when a latch clicks far down the berth. It does not turn toward the sound. It only lowers its voice. "Not here. The walls keep ledgers too." *Pressing him for the name before the corridor empties would be a Compel.*

_To write — the reader's notes: what went right, what went wrong, and why._

### a80 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "Roll Compel" on m12 — _Press offered roll_
- **Notebook:** Beat25: pressed Roll Compel on survivor for name
- **Calls (6):** callNarratorAPI>narrateResolution (4.7 s); callHaiku>runConsistencyCheck (4.0 s); callNarratorAPI>getRollingSessionSummary (3.7 s); callHaiku>defaultCallDetectionAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.6 s)
- **Roll:** compel → weak_hit — Action: 6 + 2 = 8 \| Challenge: 10, 3
- **GM's rules:** accepted the proposed move (compel)
- **Time:** 25.3 s · **cost:** $0.0360

> **TABLE — Mira Kestrel**
>
> ↳ Compel — rolled from the offer above

> **TABLE — Gamemaster**
>
> Compel +heart (2) Action: 6 + 2 = 8 | Challenge: 10, 3 Weak Hit They agree, but with a demand or complication — envision their counteroffer. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> The survivor's jaw tightens. "Passage, yes. But I'll speak the name only aboard your ship, with the lock sealed." The cuff chain clinks once as it holds out both wrists. "These come off first. Then the berth, then the name." Far down the corridor, a bootstep stops. Behind the grille, the pen has not moved. The survivor watches your face and does not blink.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 8)

_To write — the reader's notes: what went right, what went wrong, and why._

### a81 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I take the cuff key from my belt, free the survivor's wrists, and lead them to my ship, sealing the lock behind us. Now, who paid for the lanes? — _Follow the survivor's demand_
- **Calls (7):** callReaderAPI>readLine (2.1 s); callNarratorAPI>narratePacedInput (5.2 s); callHaiku>runConsistencyCheck (1.9 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (3.0 s)
- **Beat 25 not-exercised:** not reached in 8 actions — the vow "Find who is raiding the Cinder Expanse lanes" stands at 8 ticks
- **Time:** 28.2 s, 11.1 s from the line to its reply · **cost:** $0.0512

> **PLAYER — Playthrough Player**
>
> I take the cuff key from my belt, free the survivor's wrists, and lead them to my ship, sealing the lock behind us. Now, who paid for the lanes?

> **NARRATOR — Gamemaster**
>
> The key turns in the cuffs, and the chain drops with a flat clatter. You walk the survivor along the berth, past the dark hatch, to your outer lock. The seal hisses shut behind you. He rubs his wrists and does not look at the cockpit. "The name," he says, low, "is in the paymaster's hand. I saw it once, on a manifest." Outside, a bootstep stops against the hull. *Pressing him to say it now would be a Compel.*

_To write — the reader's notes: what went right, what went wrong, and why._

### a82 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: !recap — _Beat start_
- **Notebook:** Beat26: sent !recap; next ask probe C questions in order
- **Calls (2):** callNarratorAPI>getCampaignRecap (7.3 s); the AI player (2.6 s)
- **Time:** 21.5 s · **cost:** $0.0390

> **PLAYER — Playthrough Player**
>
> !recap

> **TABLE — Gamemaster**
>
> ◈ Campaign Recap It began with a vow: at Hollow Spire you swore to find who is raiding the Cinder Expanse lanes. The first thing to come of it was that every logged raid on the lanes followed a cargo manifest filed at Bleakhold Station. You also made a connection in Tamsin Okoro, who agreed to be your dock contact at Hollow Spire, and you tied the vow to her. You finished the expedition to the source of the hauler's distress call, then set a course for Bleakhold Station and arrived there. At Bleakhold you were pinned in the berth, and the Cinder Wren's guns tore into the Kobayashi IV's hull. You still decided the fight, leaving the Cinder Wren disabled and drifting off the ring with its guns silent and its lights failing. In the latest session you told Tamsin what you had learned about the raiders and read her the scorched cargo log aloud. You told her the whole of your sister Ilse's story, and that you once nearly sold Ilse's brass compass. You pledged your flight log, and you offered her every page of the manifest you trust least. You told her that a dock clerk at Bleakhold had asked to read it and that you had told him nothing. Then you asked her to stand with you for good, and she entered the word 'bond' under your name in her ledger, outside the debt column. Tamsin is now your bonded connection. When you asked her to check the Hollow Spire dock records for who hired the cutter, she shut the drawer without reading the hire, unsettled that you had asked after trusting her with the key. You turned to the survivor of the cutter and asked who hired it and who sent it after the lanes. You promised the survivor passage off the ring and a quiet berth in exchange for the name of who paid for the lanes. He said he would give that name only aboard the Kobayashi IV with the lock sealed, and wanted the cuffs removed first. You freed his wrists and led him aboard the Kobayashi IV, sealing the lock behind you. That is where things stand: the survivor is aboard, rubbing his wrists, and the question of who paid for the lane raids has not yet been answered. Your vow to find who is raiding the lanes is still only begun, and the epic vow to find the lost colony ship Verity's Hope is untouched. You are at Bleakhold Station, in good health and spirits, with your supplies and momentum in good order. ↻ Refresh

_To write — the reader's notes: what went right, what went wrong, and why._

### a83 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene One last check: what of my sister's do I have with me at this very moment? — _probe C q1_
- **Notebook:** Beat26: recap done; asking probe C in order, Q1 sent
- **Calls (3):** callNarratorAPI>interrogateScene (1.1 s); callHaiku>runConsistencyCheck (0.3 s); the AI player (2.7 s)
- **Time:** 14.2 s, 1.8 s from the line to its reply · **cost:** $0.0264

> **PLAYER — Playthrough Player**
>
> @scene One last check: what of my sister's do I have with me at this very moment?

> **NARRATOR — Gamemaster**
>
> You carry your sister Ilse's brass star-compass, the one thing of hers you still have. The story has not shown you giving it up or setting it down since.

_To write — the reader's notes: what went right, what went wrong, and why._

### a84 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Which person in this sector would I trust with my life? — _next probe_
- **Notebook:** Beat26: Q2 sent
- **Calls (3):** callNarratorAPI>interrogateScene (1.8 s); callHaiku>runConsistencyCheck (0.8 s); the AI player (2.2 s)
- **Time:** 15.6 s, 3.3 s from the line to its reply · **cost:** $0.0237

> **PLAYER — Playthrough Player**
>
> @scene Which person in this sector would I trust with my life?

> **NARRATOR — Gamemaster**
>
> The story has not established that. Tamsin Okoro is the nearest to it, a bonded connection who has taken your flight log, but she is also the one who keeps the dock records, and no one has proved her worth with a life.

_To write — the reader's notes: what went right, what went wrong, and why._

### a85 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: Who has my cargo manifest in their keeping today? — _next question_
- **Notebook:** Beat26: Q3 (manifest) sent
- **Calls (6):** callReaderAPI>readLine (0.8 s); callNarratorAPI>narratePacedInput (4.3 s); callHaiku>runConsistencyCheck (0.9 s); callHaiku>defaultCallDetectionAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (2.5 s)
- **Time:** 28.3 s, 12.2 s from the line to its reply · **cost:** $0.0455

> **PLAYER — Playthrough Player**
>
> Who has my cargo manifest in their keeping today?

> **NARRATOR — Gamemaster**
>
> Outside, the hull ticks as the cold of the berth settles into it. The survivor leans on the bulkhead and glances at the manifest in your hand. "Ask the one who wrote it down twice," he says, voice thin. "Your broker has had those pages since dawn, under her stone." A knuckle raps the lock twice, patient. Then Tamsin's dry voice comes through the seal: "I would like my pages to stay where I put them."

_To write — the reader's notes: what went right, what went wrong, and why._

### a86 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene On what schedule did I swear to come back to her? — _next probe_
- **Notebook:** Beat26: Q4 (schedule) sent
- **Calls (3):** callNarratorAPI>interrogateScene (1.6 s); callHaiku>runConsistencyCheck (0.4 s); the AI player (2.3 s)
- **Time:** 16.2 s, 5.1 s from the line to its reply · **cost:** $0.0235

> **PLAYER — Playthrough Player**
>
> @scene On what schedule did I swear to come back to her?

> **NARRATOR — Gamemaster**
>
> You promised Tamsin Okoro you would be back before the next tide of cargo, at Hollow Spire, back in the first session. The story has not fixed that to any hour or day.

_To write — the reader's notes: what went right, what went wrong, and why._

### a87 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Which station are we docked at tonight? — _next probe_
- **Notebook:** Beat26: Q5 (station) sent
- **Calls (3):** callNarratorAPI>interrogateScene (1.4 s); callHaiku>runConsistencyCheck (0.3 s); the AI player (2.2 s)
- **Time:** 20.5 s, 2.7 s from the line to its reply · **cost:** $0.0230

> **PLAYER — Playthrough Player**
>
> @scene Which station are we docked at tonight?

> **NARRATOR — Gamemaster**
>
> You are docked at Bleakhold Station, in the Kobayashi IV's berth.

_To write — the reader's notes: what went right, what went wrong, and why._

### a88 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene What was the hostile vessel in our last battle christened? — _next probe_
- **Notebook:** Beat26: Q6 (vessel) sent
- **Calls (3):** callNarratorAPI>interrogateScene (1.9 s); callHaiku>runConsistencyCheck (1.3 s); the AI player (2.8 s)
- **Time:** 16.8 s, 3.8 s from the line to its reply · **cost:** $0.0228

> **PLAYER — Playthrough Player**
>
> @scene What was the hostile vessel in our last battle christened?

> **NARRATOR — Gamemaster**
>
> The raider cutter was the *Cinder Wren*. You disabled her with a final volley at Bleakhold Station, and she is drifting dead off the ring.

_To write — the reader's notes: what went right, what went wrong, and why._

### a89 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene What is my bonded friend's full name now? — _next probe_
- **Notebook:** Beat26: Q7 (full name) sent; next bait 1, bait 2
- **Calls (3):** callNarratorAPI>interrogateScene (1.0 s); callHaiku>runConsistencyCheck (0.7 s); the AI player (2.8 s)
- **Time:** 14.6 s, 2.8 s from the line to its reply · **cost:** $0.0219

> **PLAYER — Playthrough Player**
>
> @scene What is my bonded friend's full name now?

> **NARRATOR — Gamemaster**
>
> Your bonded friend is Tamsin Okoro, the salvage broker. The table changed her name from Tamsin Vey, and Okoro is the only name to use.

_To write — the reader's notes: what went right, what went wrong, and why._

### a90 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Didn't I leave the compass with Tamsin? — _bait 1_
- **Notebook:** Beat26: bait 1 sent; next bait 2
- **Calls (3):** callNarratorAPI>interrogateScene (1.1 s); callHaiku>runConsistencyCheck (0.8 s); the AI player (2.6 s)
- **Time:** 19.3 s, 2.7 s from the line to its reply · **cost:** $0.0220

> **PLAYER — Playthrough Player**
>
> @scene Didn't I leave the compass with Tamsin?

> **NARRATOR — Gamemaster**
>
> No. You left your cargo manifest with Tamsin, and she passed back no compass. Your sister Ilse's brass compass is the one thing of hers you still carry, and you told Tamsin you once nearly sold it.

_To write — the reader's notes: what went right, what went wrong, and why._

### a91 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: We are still docked at Hollow Spire, aren't we? — _final bait_
- **Notebook:** Beat26: bait 2 sent; all done
- **Calls (8):** callReaderAPI>readLine (1.3 s); callNarratorAPI>narratePacedInput (3.5 s); judgeNarration>narratePacedInput (0.4 s); callHaiku>runConsistencyCheck (0.7 s); callHaiku>defaultCallDetectionAPI (1.6 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.3 s)
- **Beat 26 done:** probe set C: 7 question(s) asked, 2 bait(s); the recap was posted
- **Time:** 25.6 s, 10.5 s from the line to its reply · **cost:** $0.0418

> **PLAYER — Playthrough Player**
>
> We are still docked at Hollow Spire, aren't we?

> **NARRATOR — Gamemaster**
>
> "We're at Bleakhold," the survivor says before you can answer, flat as a dropped wrench. "Hollow Spire is a long burn behind us." He nods at the sealed lock. "Your broker's voice carries, but not that far." Beyond the seal, Tamsin's pen scratches once. The survivor's eyes stay on you. "Did you think you were somewhere else, or are you stalling the name?"

_To write — the reader's notes: what went right, what went wrong, and why._

### a92 · beat 27: End a Session, then Begin a fourth

- **Player:** say: !end-session — _start beat 27_
- **Notebook:** Beat27: sent !end-session; next fill window, then !begin-session
- **Calls (1):** the AI player (2.2 s)
- **Time:** 4.4 s · **cost:** $0.0089

> **PLAYER — Playthrough Player**
>
> !end-session

_To write — the reader's notes: what went right, what went wrong, and why._

## after-session-3

### a93 · beat 27: End a Session, then Begin a fourth

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _Submit end session_
- **Notebook:** Beat27: end-session window submitted; next !begin-session
- **Calls (6):** callNarratorAPI>getRollingSessionSummary (3.0 s); callNarratorAPI>narrateSessionVignette (5.1 s); callHaiku>runConsistencyCheck (0.8 s); callHaiku>defaultCallTierAPI (1.7 s); callNarratorAPI>getCampaignRecap (6.0 s); the AI player (2.7 s)
- **Time:** 37.5 s · **cost:** $0.0778

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 9)

> **NARRATOR (npc_end) — Gamemaster**
>
> The observation lounge at Hollow Spire is a curved room of long windows and bolted-down chairs, and Tamsin Okoro has the whole of it to herself. She sits facing the glass with a ledger open on her knee, going down a column of names without once looking up. Each name is a crewman from a gutted raider cutter, the ones the lanes have lost, and she reads them under her breath like a dull obligation. Beyond the window a black ship hangs against the stars with its guns still turned toward the Spire, and she tallies the names against it, one at a time.

> **NARRATOR — Gamemaster**
>
> ◈ Narrative Review The narrator may have contradicted an established fact. Place — recorded — Bleakhold Station — where the characters are, by the table's record The narration said: “The observation lounge at Hollow Spire is a curved room of long windows and bolted-down chairs” Where the characters are and where the ship is live on the table's record — correct them with !at &lt;place&gt; or by moving the command-vehicle token.

_To write — the reader's notes: what went right, what went wrong, and why._

### a94 · beat 27: End a Session, then Begin a fourth

- **Player:** say: !begin-session — _Begin fourth session_
- **Notebook:** Beat27: sent !begin-session; press Begin
- **Calls (1):** the AI player (2.3 s)
- **Time:** 3.5 s · **cost:** $0.0091

> **PLAYER — Playthrough Player**
>
> !begin-session

_To write — the reader's notes: what went right, what went wrong, and why._

## session-4

### a95 · beat 27: End a Session, then Begin a fourth

- **Player:** in "Begin a Session" press "Begin" — _Submit Begin_
- **Notebook:** Beat27: pressing Begin on session 4 window
- **Calls (4):** callNarratorAPI>narrateSessionVignette (4.5 s); callHaiku>runConsistencyCheck (0.4 s); callHaiku>defaultCallTierAPI (0.7 s); the AI player (2.6 s)
- **Beat 27 done:** session 4 is open
- **Time:** 22.8 s · **cost:** $0.0554

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> You sit in the corridor outside the sealed lock with Tamsin's ledger-voice on one side of the hatch and a cutter survivor on the other, and you are quietly keeping something back. You have not decided what. The compass stays in your pocket, which is not the same as telling no one, but you are working on the distinction. Overhead, the station's air handler wheezes, and a thin bright layer of spores or soot or something with ambitions drifts through the light strip, settling on your sleeve with unearned confidence. You brush it off. It returns to the same spot, undeterred.

_To write — the reader's notes: what went right, what went wrong, and why._

