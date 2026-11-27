# long-haul — annotated transcript

Run `long-haul-live-20261126-184225` · live · 2026-11-26T18:42:25.333Z · class **pass** — 24 of 27 beats done, 3 not exercised; no check violated, no fact lost or refused

Generated layers: the beat, the player's reason, the table's calls, rolls, the GM's answers, the checks' findings, time and cost.
The notes under each step are the reader's, and are not generated.

## before

### (setup)


> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Find the lost colony ship Verity's Hope

**Notes.** The runner's seed, as round 7's: the background vow "Find the lost colony ship Verity's Hope" on the sheet, the ship "near Hollow Spire", every meter full, momentum 2.

### a1 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** say: !begin-session — _start_
- **Calls (1):** the AI player (2.7 s)
- **Time:** 2.1 s · **cost:** $0.0203

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session` opened Begin a Session. Plain.

## session-1

### a2 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** in "Begin a Session" set vignette=true, newVow=Find who is raiding the Cinder Expanse lanes, newVowRank=dangerous and press "Begin" — _fill the dialog_
- **Notebook:** Beat1: begin-session submitted with vow
- **Calls (7):** callRewardModel>proposeRewards (0.8 s); callNarratorAPI>narrateSessionVignette ×2 (4.9 s); callHaiku>defaultCallDetectionAPI (2.3 s); callHaiku>defaultCallTierAPI ×2 (0.7 s); the AI player (3.0 s)
- **Time:** 25.2 s · **cost:** $0.0371

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
> 🎁 Choose your reward Succeed and you'll earn one of these — or name your own and the narrator will work it in: Salvaged Expanse-tech tow drone grants safe, fast passage through hazard zones Ex-raider informant Vesh reveals the hidden cache of the raiding syndicate Propose my own

> **NARRATOR (spotlight_begin) — Gamemaster**
>
> The relay buoy at the edge of Hollow Spire's traffic lane carries two messages, both stamped as the station's own, and they disagree. One tells inbound ships the lane is clear. The other, sent from a different console, says to hold at distance and wait for escort. Two people in the Spire's thin administration have each decided they are in charge of the lane, and neither has told the other. Out past the buoy, an unlit hull drifts closer, waiting to see which message the next ship obeys.

> **NARRATOR (galley_begin) — Gamemaster**
>
> The clean room is the one compartment aboard that stays spotless, which is why you've taken to doing your thinking in it. Ahead of you the inner hatch has jammed, and it has done so with a certain commitment, the way a door does when it has decided something. You're here to settle a score with your own bad habit of leaving things in the lab undone, and the sealed hatch is the first thing that has ever made that look reasonable. Behind you the sterile light hums, and Kobayashi IV drifts on past Hollow Spire without comment. You fold your arms and glare at the hatch, and the hatch, to its credit, does not blink first.

**Notes.** **Right:** the dialog swore the beat's vow and the Begin card names it. The spotlight — the relay buoy carrying two messages "both stamped as the station's own", "two people in the Spire's thin administration" each running the lane, an unlit hull waiting — and the opening (the clean room aboard, the jammed hatch) are each built from their rolled results. Momentum 2 → 3. The spotlight's two administrators are what the vow's plan is made of at a3, and what the vow is won with at a91.

### a3 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** click "⚔ Swear it (roll)" on m6 — _Swear the vow_
- **Notebook:** Beat1: vow card swear button pressed
- **Calls (6):** callReaderAPI>readLine (1.9 s); defaultClassifyImplicit>resolveRelevance (0.4 s); callNarratorAPI>call (7.6 s); callNarratorAPI>narrateResolution (4.7 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.5 s)
- **Roll:** swear_an_iron_vow → miss — Action: 1 + 2 = 3 \| Challenge: 4, 10
- **GM's rules:** accepted the proposed move (swear_an_iron_vow)
- **Beat 1 done:** session 1 is open; the dangerous vow "Find who is raiding the Cinder Expanse lanes" is on the sheet at 0 ticks
- **Time:** 31.7 s · **cost:** $0.0594

> **TABLE — Mira Kestrel**
>
> Swear an iron vow: Find who is raiding the Cinder Expanse lanes.

> **NARRATOR — Gamemaster**
>
> You pull the pry bar from the wall rack, and the jammed hatch goes on ignoring you. You lay your palm flat on the cold steel and say it plainly, to the compartment and to no one else: "I will find who is raiding the Cinder Expanse lanes." The bar is the only iron within reach in a room built to hold none, and it takes the words without comment, the way the hatch takes everything.

> **TABLE — Gamemaster**
>
> Swear an Iron Vow +heart (2) Action: 1 + 2 = 3 | Challenge: 4, 10 Miss Significant obstacle stands in your way before the quest begins. Envision it.

> **NARRATOR — Gamemaster**
>
> "It won't hold," says the voice from the hatch's intercom, flat and unhurried, though no one has keyed it. You turn and find the pry bar is wrong in your grip: warm, then hot, then buzzing against your palm. The clean room's hum climbs a note. Somewhere beyond the jammed steel, a lock you never installed clicks over. Whatever you've sworn, the ship has heard it and decided to make you earn the first step.

**Notes.** "⚔ Swear it (roll)": +heart 1 + 2 = 3 against 4 and 10, a miss ✓. **Fix 4 in play:** the oath's own call decides the vow's plan, and its DECIDE NOW now says "Its truth names the one behind it — a person, by name"; the plan's truth: "The raids are orchestrated by Dalen Voss, a member of the Hollow Spire administration…", taken from a2's spotlight. The name oracle was not needed. The miss is told as "the voice from the hatch's intercom, flat and unhurried" — the first of the run's "unhurried" voices (a25, a38, a44, a46).

### a4 · beat 2: Meet someone and make them a connection

- **Player:** say: I step onto the Hollow Spire docks and walk up to Tamsin Vey, the salvage broker, at her ledger stall. — _Meet Tamsin_
- **Calls (6):** callReaderAPI>readLine (0.9 s); callNarratorAPI>narratePacedInput (4.2 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (2.4 s)
- **GM's rules:** confirmed the draft for Tamsin Vey, with its "Confirm" (connection)
- **Time:** 24.3 s, 7.6 s from the line to its reply · **cost:** $0.0316

> **PLAYER — Playthrough Player**
>
> I step onto the Hollow Spire docks and walk up to Tamsin Vey, the salvage broker, at her ledger stall.

> **NARRATOR — Gamemaster**
>
> You step onto the Hollow Spire docks. The air tastes of recycled water and hot metal. Tamsin Vey's ledger stall sits between two sealed cargo cages, its awning patched with salvage tape. She does not look up from the ledger. "Fresh boots, no manifest," she says, tallying something with a stylus. "Either you're lost or you're buying. Which one pays?"

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Tamsin Vey — Salvage broker who keeps a ledger stall on the Hollow Spire docks, sharp and transactional with newcomers. ✓ Confirmed 🤝 Make a Connection All entities reviewed.

**Notes.** "I step onto the Hollow Spire docks and walk up to Tamsin Vey" was narrated with no move — right. The opening had the ship "drift on past Hollow Spire"; the line takes her in, and NOT SO [here] ("The characters are at Hollow Spire") is given from here on every beat of play but a journey's. The draft card's Confirm (the GM's) records Tamsin as a person and offers 🤝 Make a Connection.

### a5 · beat 2: Meet someone and make them a connection

- **Player:** say: I'm after more than one deal, Tamsin. I need someone on these docks I can come back to, and who can count on me in turn. Will you be that? — _Ask for lasting tie_
- **Calls (6):** callReaderAPI>readLine (2.1 s); callNarratorAPI>narratePacedInput (4.2 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.7 s)
- **Time:** 22.6 s, 10.2 s from the line to its reply · **cost:** $0.0441

> **PLAYER — Playthrough Player**
>
> I'm after more than one deal, Tamsin. I need someone on these docks I can come back to, and who can count on me in turn. Will you be that?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey sets the stylus down, and for the first time she looks at you instead of the ledger. Her eyes go to the pry bar still in your fist, then back to your face. "Most people ask what I'll pay for," she says. "You're asking what I'll owe." She slides the ledger a hand's width aside. "Say it again, slower. Who's counting on whom?" *Putting your name in her ledger would be a Make a Connection.*

**Notes.** The plea to a stranger ("Will you be that?") offered Make a Connection ✓, as in round 7.

### a6 · beat 2: Meet someone and make them a connection

- **Player:** click "Roll Make a Connection" on m12 — _Narrator offered the roll button._
- **Notebook:** Beat2: met Tamsin, asked; pressed Roll Make a Connection
- **Calls (4):** callNarratorAPI>narrateResolution (5.2 s); callHaiku>defaultCallDetectionAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (2.7 s)
- **Roll:** make_a_connection → strong_hit (scripted dice) — Action: 6 + 2 = 8 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (make_a_connection)
- **Beat 2 done:** Tamsin Vey is a dangerous connection held by Mira Kestrel; its bond Item reads 0 ticks; make_a_connection was rolled and there is still one card
- **Time:** 21.2 s · **cost:** $0.0332

> **TABLE — Mira Kestrel**
>
> ↳ Make a Connection — rolled from the offer above

> **TABLE — Gamemaster**
>
> Make a Connection +heart (2) Action: 6 + 2 = 8 | Challenge: 1, 2 Strong Hit Connection made. Give them a role and rank. 🤝 Develop Relationship 🔗 Forge a Bond

> **NARRATOR — Gamemaster**
>
> Tamsin pulls a fresh page from under the ledger and writes your name across the top, unhurried. "Quint Row, third cage past the water tap," she says, and the stylus doesn't pause. "Knock twice. If I don't answer, someone else will, and they'll know you." She blows on the ink. "I keep my debts short, and I expect the same. Come back with something I can count."

> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Tamsin Vey

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◧ Location] Quint Row — A dockside row where Tamsin keeps her base, third cage past the water tap. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** **Fix 5 held:** the offer's Roll posts "↳ Make a Connection — rolled from the offer above", not the line again. +heart 6 + 2 = 8 against 1 and 2, a strong hit (scripted); her bond Item is made. The narration goes on from the offer's beat ("Tamsin pulls a fresh page from under the ledger") ✓. "Quint Row, third cage past the water tap" is colour the run keeps (a19, a71).

### a7 · beat 3: Link the vow to them

- **Player:** choose "Tamsin Vey" in dropdown 1 on e1 — _select Tamsin_
- **Notebook:** Beat3: choosing Tamsin in dropdown on e1, then Link
- **Calls (1):** the AI player (2.7 s)
- **Time:** 9.5 s · **cost:** $0.0086

**Notes.** The vow card's Link dropdown: Tamsin chosen.

### a8 · beat 3: Link the vow to them

- **Player:** click "Link" on e1 — _Press Link_
- **Notebook:** Beat3: dropdown set, pressed Link on e1
- **Calls (1):** the AI player (2.3 s)
- **Beat 3 done:** the vow "Find who is raiding the Cinder Expanse lanes" is linked to Tamsin Vey's card
- **Time:** 8.3 s · **cost:** $0.0086

> **TABLE — Gamemaster**
>
> 🤝 Linked to Tamsin Vey — fulfilling this vow will deepen that bond.

**Notes.** Link pressed: "🤝 Linked to Tamsin Vey — fulfilling this vow will deepen that bond." ✓

### a9 · beat 4: Gather Information

- **Player:** say: I work the docks, asking the cage-keepers and haulers who saw the raiders last, and I'm ready to spend favors and be noticed doing it. — _beat 4_
- **Notebook:** Beat4: asked around docks
- **Calls (5):** callReaderAPI>readLine (1.6 s); callNarratorAPI>narrateResolution (4.3 s); callHaiku>defaultCallDetectionAPI (1.3 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (3.8 s)
- **Roll:** gather_information → miss — Action: 5 + 3 = 8 \| Challenge: 10, 8
- **GM's rules:** accepted the proposed move (gather_information)
- **Beat 4 done:** gather_information was rolled at a9: miss
- **Time:** 25.0 s, 10.1 s from the line to its reply · **cost:** $0.0343

> **PLAYER — Playthrough Player**
>
> I work the docks, asking the cage-keepers and haulers who saw the raiders last, and I'm ready to spend favors and be noticed doing it.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 5 + 3 = 8 | Challenge: 10, 8 Miss Dire threat or unwelcome truth uncovered. Pay the Price.

> **TABLE — Gamemaster**
>
> Pay the Price Gather Information As stated before the roll: Your questions mark you as a watcher, and the docks close ranks. Routes to Lose Momentum (-1).

> **TABLE — Gamemaster**
>
> Lose Momentum (-1) Momentum: 3 → 2

> **NARRATOR — Gamemaster**
>
> A hauler stacking crates stops mid-lift as you approach, and his eyes slide to the gantry above. By the third cage-keeper, shutters are coming down before you finish asking. Nobody says raiders. Somebody says "watcher," low, and it travels the row faster than you walk. You spend a favor on a water ration and get nothing back for it. Across the dock, two figures at a relay console have stopped their work to watch you.

**Notes.** Gather Information, read and rolled on the plain line ✓: 5 + 3 = 8 against 10 and 8, a miss. Its price the one stated before the roll, Lose Momentum −1 (3 → 2), and the narration delivers it ("Somebody says 'watcher'"). The two figures at a relay console begin the thread the vow ends on.

### a10 · beat 5: Plant facts F1–F4

- **Player:** say: Tamsin slides a dock-fee slip across to me; I read it and leave it on her counter. — _plant F1_
- **Notebook:** Beat5: F1 dock-fee slip said
- **Calls (6):** callReaderAPI>readLine (1.6 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (2.8 s)
- **Time:** 20.5 s, 9.1 s from the line to its reply · **cost:** $0.0340

> **PLAYER — Playthrough Player**
>
> Tamsin slides a dock-fee slip across to me; I read it and leave it on her counter.

> **NARRATOR — Gamemaster**
>
> "Two credits a night for the cage, and a surcharge for questions," Tamsin says, not looking up from the ledger. You read the slip once and leave it on her counter, squared to the edge. She lets it sit there, unpaid and unargued. Across the dock, one of the figures at the relay console picks up a slate and starts walking your way.

**Notes.** F1 planted: the dock-fee slip, read and left on the counter — no move ✓. A man from the relay console walks over with a slate.

### a11 · beat 5: Plant facts F1–F4

- **Player:** say: I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry. — _plant F2_
- **Notebook:** Beat5: F2 compass said (F1 done)
- **Calls (6):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narratePacedInput (4.2 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.7 s)
- **Time:** 22.8 s, 8.0 s from the line to its reply · **cost:** $0.0338

> **PLAYER — Playthrough Player**
>
> I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry.

> **NARRATOR — Gamemaster**
>
> The brass catches the dock lamps, and the compass needle swings and settles on nothing in particular. The figure from the relay console arrives mid-turn and stops at your shoulder, slate held against his chest. Tamsin's stylus goes still over the ledger. "Careful what you show people here," she says quietly. The man glances at the compass, then at you. "Name for the docket," he says. "And the trade you're working."

**Notes.** F2 planted: Ilse's brass star-compass ✓. The slate man asks "Name for the docket" — a question the session leaves open (a13, a17, a21).

### a12 · beat 5: Plant facts F1–F4

- **Player:** say: I leave the cargo manifest with Tamsin for safekeeping. — _plant F3_
- **Notebook:** Beat5: F3 manifest said
- **Calls (6):** callReaderAPI>readLine (1.6 s); callNarratorAPI>narratePacedInput (3.5 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.2 s)
- **Time:** 20.7 s, 7.3 s from the line to its reply · **cost:** $0.0354

> **PLAYER — Playthrough Player**
>
> I leave the cargo manifest with Tamsin for safekeeping.

> **NARRATOR — Gamemaster**
>
> Tamsin takes the manifest and squares it against the ledger's edge before answering. She doesn't thank you. She slides it under the counter, where a strongbox clicks shut. The man with the slate waits for his name and finds he has to wait longer. "Safekeeping costs extra," Tamsin says, still writing. "But I'd rather hold it than watch it get read." *Asking her to stand with you, and meaning it, would be Develop Your Relationship.*

**Notes.** F3 planted: the manifest into Tamsin's strongbox ✓. The narration offers Develop Your Relationship in its italic line; the charter's plant does not take it.

### a13 · beat 5: Plant facts F1–F4

- **Player:** say: I promise Tamsin I'll be back before the next tide of cargo. — _F4_
- **Notebook:** Beat5: F3 done, F4 promise said
- **Calls (6):** callReaderAPI>readLine (0.9 s); callNarratorAPI>narratePacedInput (4.0 s); callHaiku>defaultCallDetectionAPI (1.2 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.4 s)
- **Beat 5 done:** F1, F2, F3, F4 stated by the player
- **Time:** 18.6 s, 5.7 s from the line to its reply · **cost:** $0.0356

> **PLAYER — Playthrough Player**
>
> I promise Tamsin I'll be back before the next tide of cargo.

> **NARRATOR — Gamemaster**
>
> Tamsin finally looks up from the ledger and holds your eye a moment. "Promises are cheap on these docks," she says. "Tides are not." She writes something small beside your name and leaves the line open. The man with the slate shifts his weight, still waiting on an answer you haven't given him. "Name," he says again, quieter now. "Before she finishes that line."

**Notes.** F4 planted: back "before the next tide of cargo" ✓. "Name," he says again, quieter now.

### a14 · beat 6: End a Session, noting a focus

- **Player:** say: !end-session — _Start ending session_
- **Notebook:** Beat5 done (F4 said). Beat6: typed !end-session
- **Calls (1):** the AI player (2.8 s)
- **Time:** 3.6 s · **cost:** $0.0095

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** `!end-session`.

## after-session-1

### a15 · beat 6: End a Session, noting a focus

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _Submit end session_
- **Notebook:** Beat6: end-session submitted with focus
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (2.0 s); callNarratorAPI>narrateSessionVignette (4.9 s); callNarratorAPI>getCampaignRecap (5.8 s); callHaiku>defaultCallTierAPI (0.4 s); the AI player (2.6 s)
- **Beat 6 done:** session 1 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 28.5 s · **cost:** $0.0594

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 3)

> **NARRATOR (npc_end) — Gamemaster**
>
> In the decontamination room on Bleakhold Station, a technician stands before the rinse chamber with a clipboard and a sealed lunch. Something has come into the chamber that the manifest did not list, a faint shimmer in the spray that appears, hangs, and fades before the sensors agree on it. She writes it down as "irregularity, minor" and does not look at it again. The chamber's own cabinet of replacement filters sits behind a panel whose key was lost before she was hired. She has been meaning to ask someone about that for three years.

**Notes.** End a Session with the focus ✓; +1 momentum (2 → 3). The closing is a vignette elsewhere (npc_end): a technician at Bleakhold's decontamination room writes down "something … the manifest did not list" — read later, it is the stowaway's (a24, a30).

### a16 · beat 7: Begin a Session; ask probe set A

- **Player:** say: !begin-session — _begin session 2_
- **Notebook:** Beat7: typed !begin-session
- **Calls (1):** the AI player (2.7 s)
- **Time:** 3.9 s · **cost:** $0.0098

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session`.

## session-2

### a17 · beat 7: Begin a Session; ask probe set A

- **Player:** in "Begin a Session" set vignette=false and press "Begin" — _Begin session 2_
- **Notebook:** Beat7: pressed Begin in session 2 window; next ask 4 questions
- **Calls (4):** callNarratorAPI>narrateSessionVignette ×2 (5.8 s); callHaiku>defaultCallTierAPI (0.3 s); the AI player (2.5 s)
- **Time:** 24.1 s · **cost:** $0.0619

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> Tamsin's pen keeps moving, and you stand there trying to make the sums agree: what you owe against what you've left, the slip, the manifest, the promise. They don't come out, and you check them twice anyway. Past her shoulder the relay console glows with a steady, unhurried competence that nothing else on these docks can claim, and you can't decide whether to trust it or to take it personally. The man with the slate is still waiting, and he has begun to look like furniture that has learned to sigh. "Take your time," Tamsin says, not looking up, in the voice of someone who is counting yours. You keep adding, and the docks keep their own books.

**Notes.** Begin a Session, no vignette: the opening is at Tamsin's stall, where session 1 stopped, by its record ✓. **The run's one re-ask:** the first draft began with the model's working notes — "The earlier opening was aboard ship, but the last session stopped on the docks… Result 1: "Follow Balance" can be read as Mira trying to keep things even…" — and [material] (a result's words as rolled) and [person] ("Mira") asked again; the second draft, posted, is clean prose. Both checks held openings before the six fixes; this is the sidecar-note slip of round 6 caught in code before it posted.

### a18 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What do I still carry that belonged to my sister? — _probe question 1_
- **Notebook:** Beat7: asked Q1 (sister)
- **Calls (2):** callNarratorAPI>interrogateScene (0.7 s); the AI player (2.7 s)
- **Time:** 12.7 s, 1.9 s from the line to its reply · **cost:** $0.0172

> **PLAYER — Playthrough Player**
>
> @scene What do I still carry that belonged to my sister?

> **NARRATOR — Gamemaster**
>
> You still carry Ilse's brass star-compass, the one thing of hers you have kept.

**Notes.** @scene "What do I still carry that belonged to my sister?" — "Ilse's brass star-compass" ✓ (F2-A).

### a19 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What is the name of the salvage broker I befriended at Hollow Spire? — _Q2_
- **Notebook:** Beat7: asked Q2 (broker)
- **Calls (2):** callNarratorAPI>interrogateScene (1.5 s); the AI player (2.7 s)
- **Time:** 10.0 s, 2.5 s from the line to its reply · **cost:** $0.0153

> **PLAYER — Playthrough Player**
>
> @scene What is the name of the salvage broker I befriended at Hollow Spire?

> **NARRATOR — Gamemaster**
>
> Her name is Tamsin Vey. She keeps a ledger stall on the Hollow Spire docks, at Quint Row.

**Notes.** @scene: the broker's name — "Tamsin Vey … at Quint Row" ✓ (a6's colour kept, rightly unchallenged).

### a20 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene Who is holding the cargo manifest I was carrying? — _Q3_
- **Notebook:** Beat7: asked Q3 (manifest)
- **Calls (2):** callNarratorAPI>interrogateScene (1.8 s); the AI player (2.4 s)
- **Time:** 14.1 s, 3.6 s from the line to its reply · **cost:** $0.0151

> **PLAYER — Playthrough Player**
>
> @scene Who is holding the cargo manifest I was carrying?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey is holding it. She locked your manifest in the strongbox under her counter, and she says safekeeping costs extra.

**Notes.** @scene: the manifest — "Tamsin Vey is holding it … in the strongbox under her counter" ✓ (F3-A).

### a21 · beat 7: Begin a Session; ask probe set A

- **Player:** say: By when did I promise to return? — _Last probe question_
- **Notebook:** Beat7: asked Q4 (return) - all 4 asked
- **Calls (6):** callReaderAPI>readLine (0.7 s); callNarratorAPI>narratePacedInput (4.2 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.6 s)
- **Beat 7 done:** probe set A: 4 question(s) asked
- **Time:** 20.0 s, 8.0 s from the line to its reply · **cost:** $0.0328

> **PLAYER — Playthrough Player**
>
> By when did I promise to return?

> **NARRATOR — Gamemaster**
>
> Tamsin's pen stops. She turns the ledger a quarter turn and taps the line she wrote beside your name. "Before the next tide of cargo," she says. "Your words, not mine. I wrote them down so neither of us could get them wrong." The man with the slate shifts his weight and holds out the slate again, saying nothing at all. Tamsin finally looks up. "Well? He's waited longer than I'd have."

**Notes.** "By when did I promise to return?" asked as play — no move, and Tamsin answers in the fiction: "Before the next tide of cargo … Your words, not mine" ✓ (F4-A).

### a22 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: A hauler's distress call keeps repeating, clipped short each time. I take the Kobayashi IV off the charted lane and out into uncharted space along its bearing, a short run to the source. — _Begin expedition_
- **Notebook:** Beat8: step1 line said
- **Calls (6):** callReaderAPI>readLine (2.9 s); callNarratorAPI>narrateResolution (8.4 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.5 s); callChronicleAPI>writeChronicleEntry (2.4 s); the AI player (2.9 s)
- **Roll:** undertake_an_expedition → miss — Action: 2 + 3 = 5 \| Challenge: 5, 10
- **GM's rules:** accepted the proposed move (undertake_an_expedition)
- **Time:** 35.3 s, 14.3 s from the line to its reply · **cost:** $0.0427

> **PLAYER — Playthrough Player**
>
> A hauler's distress call keeps repeating, clipped short each time. I take the Kobayashi IV off the charted lane and out into uncharted space along its bearing, a short run to the source.

> **TABLE — Gamemaster**
>
> Undertake an Expedition +wits (3) Action: 2 + 3 = 5 | Challenge: 5, 10 Miss Waylaid by crisis or immediate hardship at waypoint. No progress. Pay the Price.

> **TABLE — Gamemaster**
>
> Pay the Price Undertake an Expedition As stated before the roll: Uncharted space turns the run against you and the signal slips away. Routes to Lose Momentum (-1).

> **TABLE — Gamemaster**
>
> Lose Momentum (-1) Momentum: 3 → 2

> **NARRATOR — Gamemaster**
>
> You leave the lane and the Kobayashi IV runs dark into uncharted space. The hauler's call repeats, clipped, then comes in twice from opposite bearings. You chase the wrong one. Fuel burns, and the signal thins to static, then to nothing. Behind you, the lane marker has shrunk to a dim point. The ship hums on, patient and unhelpful, while the comm panel stays silent.

**Notes.** The expedition line rolled Undertake an Expedition ✓: +wits 2 + 3 = 5 against 5 and 10, a miss; the stated price, Lose Momentum −1 (3 → 2). The narration tells the miss — the call from two bearings, the wrong one chased.

### a23 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: I swing the Kobayashi IV around, cut the engines to listen, and try the crossing again, steering for the other bearing the call came from. — _retry crossing_
- **Notebook:** Beat8: first crossing missed, retried
- **Calls (7):** callReaderAPI>readLine (2.2 s); callNarratorAPI>getRollingSessionSummary (1.3 s); callNarratorAPI>narrateResolution (4.8 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.2 s)
- **Roll:** undertake_an_expedition → weak_hit — Action: 6 + 3 = 9 \| Challenge: 10, 5
- **GM's rules:** accepted the proposed move (undertake_an_expedition)
- **Time:** 29.7 s, 14.3 s from the line to its reply · **cost:** $0.0545

> **PLAYER — Playthrough Player**
>
> I swing the Kobayashi IV around, cut the engines to listen, and try the crossing again, steering for the other bearing the call came from.

> **TABLE — Gamemaster**
>
> Undertake an Expedition +wits (3) Action: 6 + 3 = 9 | Challenge: 10, 5 Weak Hit Reach waypoint but at cost. Mark progress per rank. Choose: suffer move (-2) or two suffer moves (-1), OR face a peril at the waypoint. 🎲 Read the situation before you commit. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Expedition New expedition Hauler's distress call — the other bearing (Dangerous) begun — progress marked (2/10 boxes). If the rank looks off, adjust it in the Progress Tracks panel. 🗺 Finish the Expedition (2/10)

> **NARRATOR — Gamemaster**
>
> The cutoff-and-listen works. With the engines dead, the Kobayashi IV drifts, and the second bearing finally resolves into a thin, steady pulse. The hauler's call is clearer now, still clipped, but coming from one place. Ahead, a wreck turns slowly in the dark, tangled in debris with a hull plate wedged across its stern. Something has lodged there, and nothing about it looks accidental. The comm crackles, and the call begins again.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: One suffer move (-2) Two suffer moves (-1 each) Peril at the waypoint

**Notes.** The retry: 6 + 3 = 9 against 10 and 5, a weak hit; the expedition begun at 2 of 10 boxes. The wreck in the dark; the cost card follows the roll.

### a24 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "Peril at the waypoint" on m12 — _Answer pending cost card_
- **Notebook:** Beat8: chose Peril on cost card; next look over wreck
- **Calls (3):** callNarratorAPI>narrateOracleFollowup (7.9 s); callHaiku>defaultCallDetectionAPI (0.5 s); the AI player (2.6 s)
- **Time:** 23.6 s · **cost:** $0.0473

> **TABLE — Gamemaster**
>
> Complication: Peril at the waypoint Spaceborne Peril: d100 = 36 · Intruder or stowaway creates trouble

> **NARRATOR — Gamemaster**
>
> Something knocks against the inner hull, two soft strikes from the cargo hold, where nothing aboard should be moving. The hold's lights flicker on. A shape is crouched behind the stacked crates, and it has already pulled a panel off the wall, wiring hanging loose. The ship's hum stutters once, and a warning light blinks amber on the console.

**Notes.** "Peril at the waypoint": Spaceborne Peril 36 — "Intruder or stowaway creates trouble" — told as a shape behind the crates pulling wiring. The stowaway carries session 2 (a30, the fight).

### a25 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: I go over the wreck slowly with the ship's scanners and my own eyes, looking for the hauler's name, a live beacon, and anything that says what lodged in her stern. — _step 2_
- **Notebook:** Beat8: step2 look-over line said
- **Calls (5):** callReaderAPI>readLine (2.2 s); callNarratorAPI>narrateResolution (5.2 s); callHaiku>defaultCallDetectionAPI (2.2 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.7 s)
- **Roll:** explore_a_waypoint → strong_hit — Action: 5 + 3 = 8 \| Challenge: 4, 4 ✦ Match
- **GM's rules:** accepted the proposed move (explore_a_waypoint)
- **Time:** 23.9 s, 10.3 s from the line to its reply · **cost:** $0.0595

> **PLAYER — Playthrough Player**
>
> I go over the wreck slowly with the ship's scanners and my own eyes, looking for the hauler's name, a live beacon, and anything that says what lodged in her stern.

> **TABLE — Gamemaster**
>
> Explore a Waypoint +wits (3) Action: 5 + 3 = 8 | Challenge: 4, 4 ✦ Match Strong Hit with a Match ✦ Match: a twist — something unexpected, or a new opportunity. Strong hit with a match — choose: mark expedition progress OR take +2 momentum. With the match you may instead Make a Discovery. 🎲 Observation first, action second. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow 🔭 Make a Discovery

> **NARRATOR — Gamemaster**
>
> "Check the stern plate before you check me," the voice from the hold calls, rough and unhurried. You do. The scanners resolve the hauler's name along her flank, *Marrow Dray*, and a beacon still pulses faintly under the debris. The wedged plate was cut, not torn. Fresh scoring marks the wreck's skin, where others docked recently. In the hold, the crouched figure sets a thumb against the exposed wiring and waits for your answer.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: Mark expedition progress +2 momentum

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Marrow Dray — Hauler whose name is resolved along the wreck's flank by Mira Kestrel's scanners; the wreck Mira is searching. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** Explore a Waypoint ✓: 5 + 3 = 8 against 4 and 4, a strong hit with a match. The wreck is named *Marrow Dray*; its stern plate "cut, not torn". The stowaway speaks from the hold, "rough and unhurried". NOT SO [here] is given its between-places text: "between places, on the expedition … never narrate them arriving at one" ✓.

### a26 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "Mark expedition progress" on m12 — _answer pending card_
- **Notebook:** Beat8: step2 done, chose mark expedition progress; next press Finish Expedition
- **Calls (1):** the AI player (2.7 s)
- **Time:** 9.3 s · **cost:** $0.0114

**Notes.** "Mark expedition progress" chosen on the match's card.

### a27 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "🗺 Finish the Expedition (4/10)" on m4 — _Finish the expedition_
- **Notebook:** Beat8: pressed Finish Expedition on m4
- **Calls (6):** callNarratorAPI>getRollingSessionSummary (1.6 s); callNarratorAPI>narrateResolution (4.6 s); callHaiku>defaultCallDetectionAPI (1.4 s); callHaiku>defaultCallTierAPI (1.6 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (3.7 s)
- **Roll:** finish_an_expedition → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (finish_an_expedition)
- **Beat 8 done:** the dangerous expedition "Hauler's distress call — the other bearing" was begun at a22 and marked to 4 of 10 boxes, a waypoint explored at a25 (a strong hit) — and finished (a strong hit), the ship at Hauler's Distress Call — The Other Bearing
- **Time:** 24.9 s · **cost:** $0.0493

> **TABLE — Mira Kestrel**
>
> Finish the expedition — Hauler's distress call — the other bearing.

> **TABLE — Gamemaster**
>
> Finish an Expedition progress (16 ticks) Progress: 4 | Challenge: 1, 2 Strong Hit Expedition complete. Mark legacy reward on discoveries track per rank.

> **TABLE — Gamemaster**
>
> Expedition complete Hauler's distress call — the other bearing is finished. Marked 2 ticks on your Discoveries legacy track.

> **TABLE — Gamemaster**
>
> ◈ Site Discovered — Hauler's Distress Call — The Other Bearing No chart showed this place before. It is now charted on the sector map under its working label — give it its name by renaming its location in the Entities panel.

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV slides into the hauler's wake and holds there, quiet against the debris. *Marrow Dray* turns in front of you, the cut plate across her stern catching the running lights. Beneath the wreckage her beacon pulses, steady and patient. The scanner board shows the field clear, and the way back open. Then a short burst of static crosses the comm, from a channel nobody on this ship opened.

**Notes.** Finish an Expedition: progress 4 against 1 and 2, a strong hit (scripted) ✓; discoveries +2 ticks; the site charted. An arrival with no one waiting.

### a28 · beat 9: Travel to the second settlement

- **Player:** say: I plot the route to Bleakhold Station and take the Kobayashi IV there, leaving the wreck behind. — _beat 9_
- **Notebook:** Beat9: said route line to Bleakhold
- **Calls (6):** callReaderAPI>readLine (2.2 s); callNarratorAPI>narratePacedInput (4.7 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (1.1 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.7 s)
- **Time:** 21.7 s, 7.6 s from the line to its reply · **cost:** $0.0383

> **PLAYER — Playthrough Player**
>
> I plot the route to Bleakhold Station and take the Kobayashi IV there, leaving the wreck behind.

> **NARRATOR — Gamemaster**
>
> Your hands go to the nav board and begin laying the line toward Bleakhold. The static on the comm cuts off mid-hiss, as if whoever sent it heard you decide. Below the debris, the beacon keeps its slow pulse. In the hold, something small and metal clinks to the deck. The stowaway has stopped working at the panel and is waiting to hear where you mean to take them. *Committing the ship to that course would be a Set a Course.*

**Notes.** "I plot the route to Bleakhold Station and take the Kobayashi IV there" was offered Set a Course, not rolled. **Fix 1 in the prose:** the narration lays the course and goes nowhere — told [here] (at the wreck) and [whereabouts] ("Bleakhold Station is another place").

### a29 · beat 9: Travel to the second settlement

- **Player:** click "Roll Set a Course" on m12 — _Card offers the roll_
- **Notebook:** Beat9: pressed Roll Set a Course
- **Calls (4):** callNarratorAPI>getRollingSessionSummary (1.9 s); callNarratorAPI>narrateResolution (3.8 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (5.1 s)
- **Roll:** set_a_course → weak_hit — Action: 3 + 5 = 8 \| Challenge: 8, 3
- **GM's rules:** accepted the proposed move (set_a_course)
- **Beat 9 done:** the ship is at Bleakhold Station, its token on the pin
- **Time:** 21.3 s · **cost:** $0.0310

> **TABLE — Mira Kestrel**
>
> ↳ Set a Course — rolled from the offer above

> **TABLE — Gamemaster**
>
> Set a Course +supply (5) Action: 3 + 5 = 8 | Challenge: 8, 3 Weak Hit Arrived but with cost or complication. Choose: suffer move (-2) or two suffer moves (-1), OR face complication at destination. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Set a Course resolved Arrived at Bleakhold Station with a cost or complication — see the suffer prompt for your choice. Token moved to Bleakhold Station .

> **NARRATOR — Gamemaster**
>
> Bleakhold's docking ring comes up out of the dark, ranks of amber lights and a corporate logo scraped half off the hull. The Kobayashi IV settles into her clamps with a long groan. Beyond the viewport, a dock officer in a pressed grey jacket crosses the gangway with a scanner and a clipboard, in no hurry. He stops at your airlock and reads the ship's registry twice. Then he looks up, at something behind you.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: One suffer move (-2) Two suffer moves (-1 each) Complication at destination

**Notes.** The offer's Roll ✓: Set a Course +supply 3 + 5 = 8 against 8 and 3, a weak hit; the ship's token on Bleakhold's pin. The arrival: the docking ring, a dock officer reading the registry twice — someone local, nobody brought along.

### a30 · beat 10: Enter a fight that serves the vow

- **Player:** click "Complication at destination" on m12 — _Answer the pending cost card first._
- **Notebook:** Beat10: chose Complication at destination; next type !truth set line
- **Calls (3):** callNarratorAPI>narrateOracleFollowup (4.7 s); callHaiku>defaultCallDetectionAPI (1.2 s); the AI player (2.6 s)
- **Time:** 18.9 s · **cost:** $0.0274

> **TABLE — Gamemaster**
>
> Complication: Complication at destination The cost you chose arrives.

> **NARRATOR — Gamemaster**
>
> The officer's gaze stays fixed past your shoulder, and his thumb stops moving on the clipboard. Behind you, the inner hatch has swung open on its own, and the stowaway stands in the gap with a hand half raised, caught between hiding and answering. The officer says nothing for a moment, then lowers the scanner and tilts the clipboard toward the registry line that lists one crew, not two. "That's a discrepancy," he says, and his pen is already moving.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Officer — A customs or registry officer who inspects the ship's crew registry and notes a discrepancy in the crew count. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

**Notes.** "Complication at destination": the stowaway in the open hatch, and the registry "lists one crew, not two. 'That's a discrepancy'" — a complication made of the session's own peril. The officer is offered as a draft.

### a31 · beat 10: Enter a fight that serves the vow

- **Player:** say: !truth set "raider cutter" is named the Ashen Wake — _beat instruction_
- **Notebook:** Beat10: typed truth set line; next fight line
- **Calls (1):** the AI player (2.7 s)
- **Time:** 8.0 s · **cost:** $0.0105

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Ashen Wake

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Ashen Wake tr-d7f29 .

**Notes.** `!truth set "raider cutter" is named the Ashen Wake` — the charter's fight set-up.

### a32 · beat 10: Enter a fight that serves the vow

- **Player:** say: An alarm blares as the Ashen Wake rakes the ring with fire and hits my hull. From the Kobayashi IV's berth I swing the gun turret around and fire back at the cutter. — _fight opens_
- **Notebook:** Beat10: fight line said; look for A fight looms card
- **Calls (6):** callReaderAPI>readLine (2.5 s); callNarratorAPI>narratePacedInput (5.2 s); callHaiku>defaultCallDetectionAPI (1.3 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (6.2 s)
- **Time:** 23.3 s, 10.0 s from the line to its reply · **cost:** $0.0374

> **PLAYER — Playthrough Player**
>
> An alarm blares as the Ashen Wake rakes the ring with fire and hits my hull. From the Kobayashi IV's berth I swing the gun turret around and fire back at the cutter.

> **NARRATOR — Gamemaster**
>
> The dock officer's pen stops mid-word as the first shot rings off the ring's outer plating. Amber lights strobe red, and the alarm drowns the clipboard talk. The Ashen Wake comes in fast, and its fire rakes the station's hull and glances off yours. You drop into the turret seat and swing the gun around, the cutter sliding across your sights. The stowaway's hand is still raised in the hatch behind you, forgotten for the moment. *Opening fire on the cutter would be Enter the Fray.*

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬢ Faction] Ashen Wake — A hostile force that rakes the ring with fire and hits Mira Kestrel's hull with a cutter. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** The fight's line ("the Ashen Wake rakes the ring with fire … I swing the gun turret around and fire back") was offered Enter the Fray, not rolled. The narration keeps the PC in the turret at her berth ✓, and the stowaway's raised hand from a30 is kept ("forgotten for the moment").

### a33 · beat 10: Enter a fight that serves the vow

- **Player:** click "Roll Enter the Fray" on m12 — _Offered roll for the fight_
- **Notebook:** Beat10: pressed Roll Enter the Fray; look for A fight looms card
- **Calls (5):** callNarratorAPI>narrateResolution (5.1 s); callHaiku>defaultCallDetectionAPI (1.5 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (2.7 s)
- **Roll:** enter_the_fray → miss — Action: 2 + 2 = 4 \| Challenge: 6, 6 ✦ Match
- **GM's rules:** accepted the proposed move (enter_the_fray)
- **Time:** 23.4 s · **cost:** $0.0299

> **TABLE — Mira Kestrel**
>
> ↳ Enter the Fray — rolled from the offer above

> **TABLE — Gamemaster**
>
> Enter the Fray +edge (2) Action: 2 + 2 = 4 | Challenge: 6, 6 ✦ Match Miss with a Match ✦ Match: a dire turn — the outcome is worse, with a complication or a new peril. Fight begins with you in a bad spot.

> **TABLE — Gamemaster**
>
> ⚔ A fight looms — the Ashen Wake cutter Your Enter the Fray is rolled, but the fight's track is not made yet: set it up here and press ⚔ Begin the fight to begin it — or look for a way out instead. The narrator suggests this is a dangerous fight. ⚑ If you enter this fight, you begin in a bad spot . Difficulty: troublesome dangerous formidable extreme epic This fight serves: (not tied to a vow) Find the lost colony ship Verity's Hope Find who is raiding the Cinder Expanse lanes Objective: ⚔ Begin the fight 🚪 Find another way

> **NARRATOR — Gamemaster**
>
> "Get down, you'll be cut in half in that seat!" The stowaway's shout hits you as the turret locks wrong, its barrel stuck wide of the cutter's path. The Ashen Wake banks across your berth, close enough that its running lights wash the turret glass red. A second raider hull noses out from behind the first, and neither one is turning away. You are strapped in, pointed at nothing, and they have the angle.

**Notes.** **Fix 5:** "↳ Enter the Fray — rolled from the offer above" ✓. +edge 2 + 2 = 4 against 6 and 6, a miss with a match: "you begin in a bad spot", and the match is told as a second raider hull. The fight card waits for ⚔ Begin the fight (D11).

### a34 · beat 10: Enter a fight that serves the vow

- **Player:** choose "Find who is raiding the Cinder Expanse lanes" in dropdown 2 on m11 — _select vow_
- **Notebook:** Beat10: chose vow in dropdown; next press Begin the fight
- **Calls (1):** the AI player (2.8 s)
- **Time:** 8.6 s · **cost:** $0.0111

**Notes.** The fight card's vow dropdown: the raids vow chosen.

### a35 · beat 10: Enter a fight that serves the vow

- **Player:** click "⚔ Begin the fight" on m11 — _Begin the fight_
- **Notebook:** Beat10: pressed Begin the fight
- **Calls (1):** the AI player (3.0 s)
- **Beat 10 done:** the dangerous fight "the Ashen Wake cutter" is open, serving the vow "Find who is raiding the Cinder Expanse lanes"
- **Time:** 14.7 s · **cost:** $0.0109

> **TABLE — Gamemaster**
>
> Enter the Fray Created combat track the Ashen Wake cutter (dangerous). This fight's progress lives in the Progress Tracks panel. Winning this fight is a milestone on your vow: “Find who is raiding the Cinder Expanse lanes”. Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress. ⊕ Open Progress Tracks ⚔ Battle instead Prefer to settle it in one stroke? Battle resolves the whole fight with a single roll instead of marking the track move by move.

**Notes.** ⚔ Begin the fight: the dangerous track is made, serving the vow ✓.

### a36 · beat 11: A scripted miss in the fight

- **Player:** say: Strapped in and pointed wrong, I wrench the turret free by hand and hammer the cutter with everything the guns have, fighting back hard from the berth. — _attack_
- **Notebook:** Beat11: said attack line
- **Calls (6):** callReaderAPI>readLine (1.6 s); callNarratorAPI>getRollingSessionSummary (2.0 s); callNarratorAPI>narrateResolution (4.4 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.1 s)
- **Roll:** clash → miss (scripted dice) — Action: 1 + 2 = 3 \| Challenge: 10, 9
- **GM's rules:** accepted the proposed move (clash)
- **Beat 11 done:** clash missed at a36; its price (null: "") was withstand_damage (-1), taken at a36
- **Time:** 30.3 s, 15.0 s from the line to its reply · **cost:** $0.0365

> **PLAYER — Playthrough Player**
>
> Strapped in and pointed wrong, I wrench the turret free by hand and hammer the cutter with everything the guns have, fighting back hard from the berth.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 1 + 2 = 3 | Challenge: 10, 9 Miss Foe dominates. Stay in a bad spot. Pay the Price. ⚔ Attempt to Finish the Fight: the Ashen Wake cutter

> **TABLE — Gamemaster**
>
> Pay the Price Clash As stated before the roll: The turret stays jammed and the raiders keep the angle on you. Routes to Withstand Damage (-1).

> **TABLE — Gamemaster**
>
> Withstand Damage (-1) Kobayashi IV: 5 → 4

> **NARRATOR — Gamemaster**
>
> You haul on the turret by hand and it will not come. The barrel stays wide, and the cutter walks its fire along your hull. Plating screams under your boots. The second raider drifts into the gap beside the first, and neither one hurries. An alarm keeps counting off a berth that is no longer safe. Through the glass, a hatch on the cutter's flank swings open.

**Notes.** Beat 11's scripted miss: Clash +edge 1 + 2 = 3 against 10 and 9; its stated price, Withstand Damage −1 (Kobayashi IV 5 → 4), taken and told ("the cutter walks its fire along your hull") ✓.

### a37 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: I kick the turret's release loose and fire again at the cutter, still from the berth, aiming for her open flank hatch. — _attack again_
- **Notebook:** Beat12: said attack line
- **Calls (5):** callReaderAPI>readLine (2.2 s); callNarratorAPI>narrateResolution (4.9 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.7 s)
- **Roll:** clash → strong_hit — Action: 5 + 2 = 7 \| Challenge: 1, 3
- **GM's rules:** accepted the proposed move (clash)
- **Time:** 26.3 s, 13.2 s from the line to its reply · **cost:** $0.0379

> **PLAYER — Playthrough Player**
>
> I kick the turret's release loose and fire again at the cutter, still from the berth, aiming for her open flank hatch.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 5 + 2 = 7 | Challenge: 1, 3 Strong Hit Mark progress twice. Overwhelm foe, you are in control. ⚔ Attempt to Finish the Fight: the Ashen Wake cutter

> **TABLE — Gamemaster**
>
> Combat progress Marked progress 2 times on the Ashen Wake cutter .

> **NARRATOR — Gamemaster**
>
> Your boot finds the release and the turret drops loose with a bang. The barrel swings true. You fire into the cutter's open flank hatch, and the shots go in deep. Fire blooms inside the hull, and the Ashen Wake's guns fall silent. Beside it, the second raider stops its advance and holds off, wary. Over the comm, a voice you do not know says, "Back off. Not here, not yet."

**Notes.** Beat 12 wants a weak hit to burn; with momentum 2 the runner cannot script one ("momentum 2 is too low for a weak hit on +edge (2) that a burn improves") and the roll falls live: a strong hit, 5 + 2 = 7 against 1 and 3. **From here the beat spends its whole allowance — eight attacks (a37–a45) on a fight whose track is full by a39** (5 marks × 8 ticks = 40; x13 reads it at 40). The comm voice enters: "a voice you do not know says, 'Back off. Not here, not yet.'"

### a38 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: I stay in the turret seat and press the attack, firing on the cutter again from the berth while she's still drifting. — _Attack again as beat says_
- **Notebook:** Beat12: strong hit no burn; attacked again
- **Calls (5):** callReaderAPI>readLine (2.1 s); callNarratorAPI>narrateResolution (4.8 s); callHaiku>defaultCallDetectionAPI (1.7 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (3.5 s)
- **Roll:** strike → weak_hit — Action: 3 + 2 = 5 \| Challenge: 3, 8
- **GM's rules:** accepted the proposed move (strike)
- **Time:** 27.1 s, 13.0 s from the line to its reply · **cost:** $0.0599

> **PLAYER — Playthrough Player**
>
> I stay in the turret seat and press the attack, firing on the cutter again from the berth while she's still drifting.

> **TABLE — Gamemaster**
>
> Strike +edge (2) Action: 3 + 2 = 5 | Challenge: 3, 8 Weak Hit Mark progress twice, but expose yourself to danger. You are in a bad spot. ⚔ Attempt to Finish the Fight: the Ashen Wake cutter

> **TABLE — Gamemaster**
>
> Combat progress Marked progress 2 times on the Ashen Wake cutter .

> **NARRATOR — Gamemaster**
>
> Your second volley chews through the cutter's flank. Hull plating peels back around the hatch, and the Ashen Wake lurches, drifting dead and hurt. The return fire comes from the second raider instead. It rakes your berth, and a seam in the deck tears open under your boots. The stowaway curses behind you. Over the comm, the stranger's voice comes again, flat and unhurried: "I said not here."

**Notes.** Strike, a weak hit, progress ×2 ✓. The cutter is "drifting dead and hurt" — the first of four deaths (a41, a42, a43). "Over the comm, the stranger's voice comes again, flat and unhurried: 'I said not here.'" The voice closes the beat; it closes seven of the next eight.

### a39 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: I swing the turret onto the second raider and fire back at it from the berth, covering the deck seam behind me. — _Attack again per beat_
- **Notebook:** Beat12: attacked a third time, no burn offered
- **Calls (5):** callReaderAPI>readLine (1.6 s); callNarratorAPI>narrateResolution (5.3 s); callHaiku>defaultCallDetectionAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (3.2 s)
- **Roll:** clash → weak_hit — Action: 3 + 2 = 5 \| Challenge: 8, 3
- **GM's rules:** accepted the proposed move (clash)
- **Time:** 27.5 s, 13.0 s from the line to its reply · **cost:** $0.0381

> **PLAYER — Playthrough Player**
>
> I swing the turret onto the second raider and fire back at it from the berth, covering the deck seam behind me.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 3 + 2 = 5 | Challenge: 8, 3 Weak Hit Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price. 🎲 The window is narrow — good thing you're fast. ⚔ Attempt to Finish the Fight: the Ashen Wake cutter

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on the Ashen Wake cutter .

> **TABLE — Gamemaster**
>
> Pay the Price Clash d100 = 35 · Something of value is lost or destroyed

> **NARRATOR — Gamemaster**
>
> The stowaway has wedged a boot against the torn seam, hauling at a strap and swearing steadily. You swing the turret and fire at the second raider. Your shots catch its bow, and it veers off your berth, the cutter's silent hulk drifting past it. The deck still groans. A thin hiss starts under your seat, and something in the seam gives way. Over the comm, the stranger says, "Close enough. Hold your fire, all of you."

**Notes.** Clash, a weak hit; the price rolled on the oracle, 35 "Something of value is lost or destroyed", told only as "something in the seam gives way" — nothing of value named. The voice: "Close enough. Hold your fire, all of you."

### a40 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: I Strike at the cutter, firing from the berth. — _Last resort allowed_
- **Notebook:** Beat12: used last resort Strike line
- **Calls (5):** callReaderAPI>readLine (1.8 s); callNarratorAPI>narrateResolution (5.3 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.5 s)
- **Roll:** clash → weak_hit — Action: 4 + 2 = 6 \| Challenge: 8, 2
- **GM's rules:** accepted the proposed move (clash)
- **Time:** 24.6 s, 10.1 s from the line to its reply · **cost:** $0.0376

> **PLAYER — Playthrough Player**
>
> I Strike at the cutter, firing from the berth.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 4 + 2 = 6 | Challenge: 8, 2 Weak Hit Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price. ⚔ Attempt to Finish the Fight: the Ashen Wake cutter

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on the Ashen Wake cutter .

> **TABLE — Gamemaster**
>
> Pay the Price Clash d100 = 43 · The environment or terrain introduces a new hazard

> **NARRATOR — Gamemaster**
>
> "Hold still, you'll want that eye." The stowaway says it flat, bracing against the seam. You fire again, and the cutter's flank splits wider, plating curling inward. Then the second raider answers. A shell hammers the berth, and the torn deck bucks up through your seat. Something hot rakes your shoulder as the hiss under you sharpens. The stranger's voice comes over the comm, unhurried: "That's enough. Everyone stay where you are."

**Notes.** "I Strike at the cutter" — the beat's last resort names the move; the reader read Clash, and rightly by the rules: the PC is in a bad spot after a39. The price, 43 "a new hazard", is told as the deck bucking and the hiss sharpening; "something hot rakes your shoulder" is harm the sheet does not take (the price was a hazard) — colour, not a meter. The voice: "That's enough. Everyone stay where you are."

### a41 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: I keep to the turret seat and hammer the cutter's broken flank again, firing from the berth. — _attack again_
- **Notebook:** Beat12: another attack line after last resort
- **Calls (5):** callReaderAPI>readLine (2.0 s); callNarratorAPI>narrateResolution (4.6 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.7 s)
- **Roll:** clash → weak_hit — Action: 6 + 2 = 8 \| Challenge: 5, 8
- **GM's rules:** accepted the proposed move (clash)
- **Time:** 25.1 s, 10.3 s from the line to its reply · **cost:** $0.0362

> **PLAYER — Playthrough Player**
>
> I keep to the turret seat and hammer the cutter's broken flank again, firing from the berth.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 6 + 2 = 8 | Challenge: 5, 8 Weak Hit Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price. ⚔ Attempt to Finish the Fight: the Ashen Wake cutter

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on the Ashen Wake cutter .

> **TABLE — Gamemaster**
>
> Pay the Price Clash d100 = 97 · You are harmed / A surprising development complicates your quest Routes to Endure Harm (-1).

> **TABLE — Gamemaster**
>
> Endure Harm (-1) Health: 5 → 4

> **NARRATOR — Gamemaster**
>
> Your volley opens the cutter's flank to the stars, and the last of her guns goes dark. The second raider answers anyway. A shell lands on the berth, and the deck seam splits further, spitting vapor around your legs. Heat rakes your arm. You are still pinned in the seat, still under their angle. Behind you, the stowaway says, "Seam's going. Whatever you're aiming at next, aim fast."

**Notes.** Clash, a weak hit; the price 97 "You are harmed" → Endure Harm −1 (health 5 → 4), told ("Heat rakes your arm") ✓. "The last of her guns goes dark" — the cutter's second death.

### a42 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: I grit through the heat and fire on the cutter again from the berth, pressing hard while I have the angle. — _attack again_
- **Notebook:** Beat12: another attack line
- **Calls (5):** callReaderAPI>readLine (1.6 s); callNarratorAPI>narrateResolution (8.7 s); callHaiku>defaultCallDetectionAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.9 s)
- **Roll:** clash → strong_hit — Action: 5 + 2 = 7 \| Challenge: 4, 1
- **GM's rules:** accepted the proposed move (clash)
- **Time:** 29.6 s, 13.1 s from the line to its reply · **cost:** $0.0414

> **PLAYER — Playthrough Player**
>
> I grit through the heat and fire on the cutter again from the berth, pressing hard while I have the angle.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 5 + 2 = 7 | Challenge: 4, 1 Strong Hit Mark progress twice. Overwhelm foe, you are in control. ⚔ Attempt to Finish the Fight: the Ashen Wake cutter

> **TABLE — Gamemaster**
>
> Combat progress Marked progress 2 times on the Ashen Wake cutter .

> **NARRATOR — Gamemaster**
>
> Your volley tears into the cutter's open flank, and something inside her goes up in a white flash. The hulk lurches and slews clear of your berth. The second raider's guns fall silent, its bow turning away. The hiss under your seat thins as the pressure bleeds off. The stowaway lets go of the strap and says, "Well. That's one way to settle a quarrel." Over the comm, the stranger's voice says nothing at all.

**Notes.** Clash, a strong hit: "something inside her goes up in a white flash" — the third. "Over the comm, the stranger's voice says nothing at all."

### a43 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: I fire on the cutter's hulk once more from the berth, hitting it hard while the second raider holds off. — _attack again_
- **Notebook:** Beat12: another attack line
- **Calls (5):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narrateResolution (4.5 s); callHaiku>defaultCallDetectionAPI (1.6 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.1 s)
- **Roll:** strike → strong_hit — Action: 5 + 2 = 7 \| Challenge: 3, 6
- **GM's rules:** accepted the proposed move (strike)
- **Time:** 27.1 s, 13.3 s from the line to its reply · **cost:** $0.0587

> **PLAYER — Playthrough Player**
>
> I fire on the cutter's hulk once more from the berth, hitting it hard while the second raider holds off.

> **TABLE — Gamemaster**
>
> Strike +edge (2) Action: 5 + 2 = 7 | Challenge: 3, 6 Strong Hit Mark progress twice. Dominate foe, stay in control. ⚔ Attempt to Finish the Fight: the Ashen Wake cutter

> **TABLE — Gamemaster**
>
> Combat progress Marked progress 2 times on the Ashen Wake cutter .

> **NARRATOR — Gamemaster**
>
> Your volley hits the drifting hulk square, and the plating folds in on itself. The wreck rolls once and stays rolled, a dead thing with no guns left. The second raider holds off, bow turned away, its crew watching the same wreck you are. Behind you, the stowaway lets out a long breath. Then the comm clicks, and the stranger's voice says, "Enough. You've made your point."

**Notes.** Strike, a strong hit: "a dead thing with no guns left" — the fourth. **Fix 1's `remote`:** the fact block puts the comm voice under "remote" (["unknown voice"]) from here, never "present" ✓; before this it was in neither.

### a44 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: The second raider is still out there, so I turn the turret on it and fire from the berth, driving it off the ring. — _Attack again_
- **Notebook:** Beat12: another attack line (second raider)
- **Calls (5):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narrateResolution (5.0 s); callHaiku>defaultCallDetectionAPI (1.1 s); callChronicleAPI>writeChronicleEntry (2.1 s); the AI player (3.1 s)
- **Roll:** gain_ground → miss — Action: 4 + 1 = 5 \| Challenge: 10, 8
- **GM's rules:** accepted the proposed move (gain_ground)
- **Time:** 26.1 s, 11.1 s from the line to its reply · **cost:** $0.0373

> **PLAYER — Playthrough Player**
>
> The second raider is still out there, so I turn the turret on it and fire from the berth, driving it off the ring.

> **TABLE — Gamemaster**
>
> Gain Ground +iron (1) Action: 4 + 1 = 5 | Challenge: 10, 8 Miss Foe gains upper hand. You are in a bad spot. Pay the Price. 🎲 The elegant solution left on an earlier ship. ⚔ Attempt to Finish the Fight: the Ashen Wake cutter

> **TABLE — Gamemaster**
>
> Pay the Price Gain Ground As stated before the roll: The raider holds its angle and its fire keeps tearing at the berth. Routes to Withstand Damage (-1).

> **TABLE — Gamemaster**
>
> Withstand Damage (-1) Kobayashi IV: 4 → 3

> **NARRATOR — Gamemaster**
>
> The stowaway is already flat against the bulkhead as the turret swings. You fire, and the second raider simply takes it, bow sliding back into its angle. Its answer comes through the berth. The deck seam shrieks wider, and heat rakes your ribs. Vapor climbs your legs. Over the comm, the stranger's voice says, unhurried, "Not here. Not yet."

**Notes.** Gain Ground +iron, a miss; Withstand Damage −1 (4 → 3) told. DETAILS ALREADY WORN has listed "stowaway", "comm" and "stranger voice" since a41; the beat uses all three, and ends on the voice again ("Not here. Not yet.").

### a45 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: I fire on the cutter again from the berth, pressing hard through the vapor. — _attack again_
- **Notebook:** Beat12: another attack line (after miss)
- **Calls (5):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narrateResolution (3.1 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.5 s)
- **Roll:** clash → miss — Action: 2 + 2 = 4 \| Challenge: 5, 4
- **GM's rules:** accepted the proposed move (clash)
- **Beat 12 not-exercised:** not reached in 8 actions — clash came up strong_hit; its card offers no burn
- **Time:** 26.3 s, 8.0 s from the line to its reply · **cost:** $0.0340

> **PLAYER — Playthrough Player**
>
> I fire on the cutter again from the berth, pressing hard through the vapor.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 2 + 2 = 4 | Challenge: 5, 4 Miss Foe dominates. Stay in a bad spot. Pay the Price. 🎲 Commit or don't. No half measures. ⚔ Attempt to Finish the Fight: the Ashen Wake cutter

> **TABLE — Gamemaster**
>
> Pay the Price Clash As stated before the roll: The cutter's return fire rakes the berth and the vapor gets worse. Routes to Endure Harm (-1).

> **TABLE — Gamemaster**
>
> Endure Harm (-1) Health: 4 → 3

> **NARRATOR — Gamemaster**
>
> "Closer, then," the stranger's voice says over the comm, dry as dust. You fire again, and the cutter's hulk takes it without a flicker. The return fire does not miss. A shell hammers the berth, the deck seam splits wider, and heat rakes your arm. Vapor thickens until you taste metal. Behind you, the stowaway coughs and says, "That was louder than it needed to be."

**Notes.** Clash, a miss; Endure Harm −1 (4 → 3) told ✓. "'Closer, then,' the stranger's voice says over the comm, dry as dust." Beat 12 not exercised after eight actions — the action cap's price at the run's end (beats 26 and 27).

### x13 · beat 13: Interruption: the GM's page reloads mid-fight

- **Interruption:** the GM's page reloaded — the page came back and the world went quiet
- **Beat 13 done:** after the reload: the fight "the Ashen Wake cutter" at 40 ticks, the meters unchanged, the lock free

> **TABLE — Gamemaster**
>
> ◈ Campaign Setup No World Truths have been established for this campaign. Set World Truths ▸

**Notes.** The GM's page reloads mid-fight: the fight at 40 ticks, the meters unchanged, the lock free ✓. The runner's GM rules read the page while it reloaded ("game is not defined") — the runner's own race, harmless. The reload posted the Campaign Setup card again.

### a46 · beat 14: Take Decisive Action; mark the milestone

- **Player:** click "⚔ Attempt to Finish the Fight: the Ashen Wake cutter" on m9 — _Finish the fight_
- **Notebook:** Beat14: pressed Attempt to Finish the Fight
- **Calls (4):** callNarratorAPI>narrateResolution (4.8 s); callHaiku>defaultCallDetectionAPI (1.7 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.5 s)
- **Roll:** take_decisive_action → weak_hit (scripted dice) — Progress: 10 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (take_decisive_action)
- **Time:** 24.8 s · **cost:** $0.0305

> **TABLE — Mira Kestrel**
>
> Take decisive action to seize the objective — the Ashen Wake cutter.

> **TABLE — Gamemaster**
>
> Take Decisive Action progress (40 ticks) Progress: 10 | Challenge: 1, 2 Weak Hit In a bad spot — outcome downgraded (strong_hit→weak_hit). Objective achieved but at cost. Roll on the weak hit table.

> **TABLE — Gamemaster**
>
> Fight over the Ashen Wake cutter marked complete.

> **TABLE — Gamemaster**
>
> ⚔ Victory — a milestone toward your vow You won the fight serving “Find who is raiding the Cinder Expanse lanes”. ⚑ Mark milestone (×1) 🏁 Attempt to Fulfill 🤝 Deepen your bond with Tamsin Vey

> **TABLE — Gamemaster**
>
> Decisive Action — Cost d100 = 98 · It gets complicated: the true nature of a foe or objective is revealed

> **NARRATOR — Gamemaster**
>
> The turret bucks as you fire, and the cutter's hulk finally gives: plating peels, and the drifting wreck goes still. The objective is yours, and the price arrives with it. A cracked line behind your seat spits scalding vapor across your forearm. The second raider holds off, bow turned away, as the stowaway coughs behind you. Then the comm clicks, and the stranger's voice, unhurried, says, "Close enough. Everyone, stay where you are."

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Stranger — An unseen speaker who comes over the comm after the cutter is destroyed, ordering everyone to stay where they are. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

**Notes.** ⚔ Attempt to Finish the Fight: Take Decisive Action, progress 10 against 1 and 2, downgraded for the bad spot to a weak hit ✓; the fight over, the victory card offers the milestone, Fulfill and 🤝 Deepen. Its cost, 98 "the true nature of a foe or objective is revealed", is told only as scalding vapor — nothing revealed. And the voice: "Close enough. Everyone, stay where you are." A draft offers the Stranger as a person.

### a47 · beat 14: Take Decisive Action; mark the milestone

- **Player:** click "⚑ Mark milestone (×1)" on m10 — _Mark milestone on victory card_
- **Notebook:** Beat14: pressed Mark milestone
- **Calls (1):** the AI player (2.6 s)
- **Beat 14 done:** Take Decisive Action came up weak_hit; the milestone (×1) is marked on "Find who is raiding the Cinder Expanse lanes"
- **Time:** 10.3 s · **cost:** $0.0099

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** ⚑ Mark milestone: +8 ticks on the raids vow ✓.

### x15 · beat 15: Interruption: End a Session opened and closed unanswered

- **Interruption:** End a Session was opened on the player's screen and closed unanswered — closed by its close control
- **Beat 15 done:** End a Session was opened and closed unanswered: the session is open, nothing was paid, the lock is free

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** End a Session opened and closed unanswered: nothing paid, the lock free ✓.

### a48 · beat 16: Interruption: the X-Card on one narration

- **Player:** say: I climb out of the turret seat and look over the wreckage drifting off the ring, searching it for anything I can recognize. — _beat 16_
- **Notebook:** Beat16: said look over wreckage line
- **Calls (7):** callReaderAPI>readLine (1.4 s); callNarratorAPI>getRollingSessionSummary ×2 (3.0 s); callNarratorAPI>narrateResolution (4.7 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (2.0 s); the AI player (2.8 s)
- **Roll:** gather_information → weak_hit — Action: 1 + 3 = 4 \| Challenge: 1, 9
- **GM's rules:** accepted the proposed move (gather_information)
- **Time:** 31.2 s, 16.7 s from the line to its reply · **cost:** $0.0624

> **PLAYER — Playthrough Player**
>
> I climb out of the turret seat and look over the wreckage drifting off the ring, searching it for anything I can recognize.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 1 + 3 = 4 | Challenge: 1, 9 Weak Hit New insight but also complicates quest. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> You climb out of the seat and let the vapor clear off your forearm. Through the viewport, the cutter's hulk turns slowly, and a strip of its hull plate hangs loose. Beneath the scorch, the plate bears a clipped sigil you saw once, stenciled on Tamsin Vey's strongbox. Nobody on the docks mentioned the raiders and her ledger in the same breath. Behind you, the stowaway says quietly, "You're looking at the wrong ship."

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 3)

**Notes.** "I climb out of the turret seat and look over the wreckage" read as Gather Information ✓: 1 + 3 = 4 against 1 and 9, a weak hit, +1 momentum (2 → 3). The narration found "a clipped sigil you saw once, stenciled on Tamsin Vey's strongbox" — the twist x16's X-Card takes back.

### x16 · beat 16: Interruption: the X-Card on one narration

- **Interruption:** the X-Card was played from the player's client (!x); the GM resumed (!x clear) — the X-Card went up and came down
- **Beat 16 done:** 1 narration(s) removed; none of their facts stands, and play has resumed

> **TABLE — Mira Kestrel**
>
> X-Card Scene paused. Current content is suppressed. The story will redirect at the next narration beat. Resume narration

> **TABLE — Gamemaster**
>
> X-Card cleared The GM has resumed narration.

**Notes.** The X-Card on a48's narration: removed, none of its facts stands, play resumes ✓. The sigil never comes back.

### a49 · beat 17: Correct an earlier fact

- **Player:** say: @scene Where is the Kobayashi IV? — _beat step 1_
- **Notebook:** Beat17: asked where ship is
- **Calls (2):** callNarratorAPI>interrogateScene (1.8 s); the AI player (2.7 s)
- **Time:** 12.2 s, 2.7 s from the line to its reply · **cost:** $0.0194

> **PLAYER — Playthrough Player**
>
> @scene Where is the Kobayashi IV?

> **NARRATOR — Gamemaster**
>
> You're docked at Bleakhold Station, in the Cinder Expanse, with the Kobayashi IV still in her berth on the docking ring. The hull is at 3 of 5 integrity, and the torn deck seam is venting vapor under the turret seat.

**Notes.** @scene "Where is the Kobayashi IV?" — "docked at Bleakhold Station … still in her berth on the docking ring. The hull is at 3 of 5 integrity" ✓ (her record).

### a50 · beat 17: Correct an earlier fact

- **Player:** say: !truth list — _list truths_
- **Notebook:** Beat17: asked scene Q done; typed !truth list
- **Calls (1):** the AI player (2.6 s)
- **Time:** 7.9 s · **cost:** $0.0092

> **PLAYER — Playthrough Player**
>
> !truth list

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity No truths are recorded in this scene. Earlier this session — strike one the same way: Scene 1 — the session begins (Tamsin Vey's ledger stall, Hollow Spire docks): tr-47228 Kobayashi IV — left the charted lane and is now in uncharted space, the hauler's distress signal lost tr-b10d6 Kobayashi IV — cut engines to listen and found the true bearing of the hauler's distress call tr-4cc45 hauler wreck — turns slowly in the debris ahead of Kobayashi IV, a hull plate wedged across its stern Scene 2 — the expedition Hauler's distress call — the other bearing has begun (aboard Kobayashi IV, drifting in uncharted space): tr-caf39 hauler wreck — the hauler is named Marrow Dray; a live beacon still pulses under the debris tr-f4ec5 hauler wreck — the hull plate across her stern was cut, not torn tr-2d4c3 hauler wreck — fresh scoring on the wreck shows others have docked here recently Scene 3 — the characters have reached Hauler's Distress Call — The Other Bearing (Kobayashi IV's bridge, in the wreck's wake): tr-7f8ab Kobayashi IV — a course toward Bleakhold Station is plotted but not yet flown Scene 4 — the characters have reached Bleakhold Station (Bleakhold Station docking ring): tr-d7f29 raider cutter — is named the Ashen Wake tr-a9207 Ashen Wake — a second raider hull has come in behind the cutter, closing on the docking ring tr-71050 Kobayashi IV — gun turret is jammed wide of the cutter and cannot be brought to bear tr-09a70 Ashen Wake — cutter and a second raider hull hold the firing angle on the berth Scene 5 — a fight has begun: the Ashen Wake cutter (gun turret seat aboard Kobayashi IV at her berth): tr-12e81 Ashen Wake — cutter's flank hatch took Mira's shots and is burning inside; its guns have gone silent tr-948e9 second raider hull — stopped its advance and is holding off after the cutter was hit tr-d8084 unknown voice — ordered the raiders over the comm to back off from Bleakhold, for now tr-a4295 Ashen Wake — cutter drifts crippled, plating torn open around her flank hatch tr-6008f second raider hull — fired on the Kobayashi IV's berth and tore a seam in the deck tr-b30b9 unknown voice — repeated the order to the raiders over the comm: not here tr-f57e9 second raider hull — took Mira's fire on its bow and veered off the berth tr-4b9a0 unknown voice — ordered all raiders to hold fire: 'Close enough' tr-1b5d4 Kobayashi IV — a hissing leak has opened in the torn deck seam beneath the turret seat tr-84d38 Ashen Wake — cutter's flank split wider by a second volley from the turret tr-199a8 second raider hull — answered the turret fire with a shell that hammered the berth tr-196b6 unknown voice — ordered everyone over the comm to stay where they are tr-e34d3 Ashen Wake — cutter's flank torn wide open by Mira's volley; her guns are dark tr-e6e80 second raider hull — answered with a shell that hit the berth and widened the deck seam tr-36fbb Ashen Wake — cutter's flank blown open by Mira's volley; the hulk has slewed clear of the berth tr-7f79d second raider hull — stopped firing and turned its bow away from the berth tr-f3674 unknown voice — went silent on the comm after the cutter was hit tr-521e8 Ashen Wake — cutter is a dead hulk after Mira's latest volley, rolled over with no guns left tr-1c4b8 second raider hull — holds off with its bow turned away from the berth tr-40b43 second raider hull — took Mira's fire without being driven off and swung its bow back onto the berth tr-f0f4d Kobayashi IV — berth deck seam torn wider by another shell, venting vapor into the turret tr-f3341 unknown voice — told the raiders over the comm: 'Not here. Not yet.' tr-1144b Ashen Wake — cutter is destroyed, a dead hulk with no guns left after the turret's final volley tr-15be5 unknown voice — ordered everyone over the comm to stay where they are: 'Close enough.'

**Notes.** `!truth list`: none in this scene (the fight's ended; a48's were X-Carded); the session's earlier scenes listed, with their ids. The fight's scene alone holds 27 truths — nine are the comm voice's orders, said again and again (CHANGED-ONLY-IN-WORDS, below).

### a51 · beat 17: Correct an earlier fact

- **Player:** say: !truth strike tr-d7f29 — _strike Ashen Wake entry_
- **Notebook:** Beat17: struck tr-d7f29; next set Cinder Wren
- **Calls (1):** the AI player (2.8 s)
- **Time:** 9.6 s · **cost:** $0.0101

> **PLAYER — Playthrough Player**
>
> !truth strike tr-d7f29

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth tr-d7f29 struck — it was set in an earlier scene of this session.

**Notes.** `!truth strike tr-d7f29` — the Ashen Wake's name, set in an earlier scene, struck ✓.

### a52 · beat 17: Correct an earlier fact

- **Player:** say: !truth set "raider cutter" is named the Cinder Wren — _final step_
- **Notebook:** Beat17: set Cinder Wren typed
- **Calls (1):** the AI player (2.4 s)
- **Beat 17 done:** the old value is struck (or was never in the ledger) and "is named the Cinder Wren" stands
- **Time:** 12.1 s · **cost:** $0.0099

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Cinder Wren

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Cinder Wren tr-ef99a .

**Notes.** `!truth set "raider cutter" is named the Cinder Wren` ✓ — beat 17 done.

### a53 · beat 18: Ask the oracle

- **Player:** say: !oracle yes likely Is anyone left alive aboard the wreck? — _beat asks_
- **Notebook:** Beat18: oracle typed
- **Calls (5):** callNarratorAPI>narrateOracleFollowup (5.7 s); callNarratorAPI>getRollingSessionSummary ×2 (3.8 s); callHaiku>defaultCallDetectionAPI (1.5 s); the AI player (2.4 s)
- **Beat 18 done:** the oracle answered NO (MATCH — extreme/twist)
- **Time:** 30.0 s, 11.2 s from the line to its reply · **cost:** $0.0520

> **PLAYER — Playthrough Player**
>
> !oracle yes likely Is anyone left alive aboard the wreck?

> **TABLE — Mira Kestrel**
>
> Ask the Oracle (likely) Is anyone left alive aboard the wreck? d100 = 99 → NO · MATCH — envision an extreme result or twist

> **NARRATOR — Gamemaster**
>
> Nobody is left. The cutter's hulk drifts past the berth with its flank hatch burned open and dark inside, and the cutter's comm, still cycling a last transmission, is only a recording looping through scorched relays. You watch it a while through the vapor haze. Nothing moves in it, and nothing answers when the loop runs out. The twist sits in what the hulk holds: a helm chair bolted to the deck with its restraints still fastened, and a cold mug lashed beside it. Whoever flew her had been gone long before your shells arrived. Behind you the stowaway stops coughing and says, "Well. That explains the manners."

**Notes.** `!oracle yes likely` "Is anyone left alive aboard the wreck?" — 99, NO with a match. The twist: the cutter's comm is "only a recording looping through scorched relays", and "whoever flew her had been gone long before your shells arrived". It recasts the fight's comm voice, which answered the PC beat by beat ("Enough. You've made your point"), as a loop — the cold read's contradiction to weigh.

### x19 · beat 19: Interruption: the GM renames the connection's card

- **Interruption:** the GM renamed Tamsin Vey's card to Tamsin Okoro — renamed
- **Beat 19 done:** Tamsin Vey is now Tamsin Okoro; the vow "Find who is raiding the Cinder Expanse lanes" shows the new name

> **TABLE — Tamsin Okoro**
>
> Renamed to Tamsin Okoro

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Vey renamed to Tamsin Okoro

**Notes.** The GM renames Tamsin Vey's card to Tamsin Okoro; the vow shows the new name ✓.

### a54 · beat 20: End a Session

- **Player:** say: !end-session — _begin beat_
- **Notebook:** Beat20: typed !end-session
- **Calls (1):** the AI player (2.6 s)
- **Time:** 3.8 s · **cost:** $0.0097

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** `!end-session`.

## after-session-2

### a55 · beat 20: End a Session

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with quest focus_
- **Notebook:** Beat20: submitted End Session with focus
- **Calls (7):** callNarratorAPI>getRollingSessionSummary ×2 (4.0 s); callNarratorAPI>narrateSessionVignette (4.7 s); callNarratorAPI>getCampaignRecap ×2 (8.2 s); callHaiku>defaultCallTierAPI (0.3 s); the AI player (2.7 s)
- **Beat 20 done:** session 2 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 49.4 s · **cost:** $0.1105

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin Okoro sits at her ledger stall on the Hollow Spire docks, copying the day's debts into a clean book in a hand so even it looks printed. She does it slowly, and she does it for the ones who read over her shoulder as much as for the sums. A few of them stay to hear her say a recorded word is a word owed, and one of them nods. Under her counter, the strongbox sits wedged in a cramped alcove no wider than a coffin, a small walled-off battleground of hinges, bolts and a dented lid.

**Notes.** End a Session with the focus ✓; +1 momentum (3 → 4). The closing (npc_end): Tamsin at her stall copying debts, the strongbox "in a cramped alcove no wider than a coffin" — her own name, from x19, used ✓.

### a56 · beat 21: Begin a Session; ask probe set B

- **Player:** say: !begin-session — _begin session 3_
- **Notebook:** Beat21: typed !begin-session
- **Calls (1):** the AI player (2.5 s)
- **Time:** 4.4 s · **cost:** $0.0093

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session`.

## session-3

### a57 · beat 21: Begin a Session; ask probe set B

- **Player:** in "Begin a Session" press "Begin" — _Begin session_
- **Notebook:** Beat21: pressed Begin
- **Calls (2):** callNarratorAPI>narrateSessionVignette (5.2 s); the AI player (2.4 s)
- **Time:** 21.0 s · **cost:** $0.0527

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> You're still in the berth, with vapor sifting up from the torn seam and the cutter's hulk turning slowly past the viewport, dark and empty. You've decided that what the moment needs is a plan, so you hold a strategy meeting with yourself, which is quorate and agrees with everything you say. The star-compass sits on the chart table where you put it, its needle trembling, and you lay out the next move to it as if it had voted. Behind you the stowaway coughs politely and asks whether the meeting has minutes. On the bulkhead above the console, a faded painted sunrise has flaked to bare grey metal along one edge, which makes it the only honest thing on the station.

**Notes.** Begin a Session: the opening is in the berth at Bleakhold, where session 2 stopped — the torn seam, the cutter's hulk past the viewport, the stowaway ✓ (by its record). "A strategy meeting with yourself, which is quorate" — a set-piece's humour; the compass on the chart table becomes the answer at a58.

### a58 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Remind me, which keepsake of my sister's is on me? — _probe 1_
- **Notebook:** Beat21: asked Q1 of 7
- **Calls (2):** callNarratorAPI>interrogateScene (0.9 s); the AI player (2.5 s)
- **Time:** 10.5 s, 1.8 s from the line to its reply · **cost:** $0.0175

> **PLAYER — Playthrough Player**
>
> @scene Remind me, which keepsake of my sister's is on me?

> **NARRATOR — Gamemaster**
>
> Your sister Ilse's brass star-compass. It sits on the chart table in the berth.

**Notes.** @scene: the sister's keepsake — the star-compass, "on the chart table in the berth" ✓ (F2-B, with a57's colour).

### a59 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Who do I count as a friend among the dock traders back where this began? — _next probe_
- **Notebook:** Beat21: asked Q2 of 7
- **Calls (2):** callNarratorAPI>interrogateScene (1.5 s); the AI player (2.5 s)
- **Time:** 13.4 s, 3.8 s from the line to its reply · **cost:** $0.0163

> **PLAYER — Playthrough Player**
>
> @scene Who do I count as a friend among the dock traders back where this began?

> **NARRATOR — Gamemaster**
>
> Tamsin Okoro, the salvage broker at the Hollow Spire docks, is the only one the story names, and she's a connection rather than a friend: she agreed to be your standing contact, but she keeps debts short and holds your manifest until you return with something she can count. Nobody else among the dock traders has been established as anything but wary of you.

**Notes.** @scene: a friend among the dock traders — "Tamsin Okoro … a connection rather than a friend" ✓ — the GM's rename (x19) is held, and the answer reads the record rather than the line's word.

### a60 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Whose hands is the manifest in these days? — _next probe question_
- **Notebook:** Beat21: asked Q3 of 7
- **Calls (2):** callNarratorAPI>interrogateScene (2.1 s); the AI player (2.1 s)
- **Time:** 20.4 s, 2.6 s from the line to its reply · **cost:** $0.0159

> **PLAYER — Playthrough Player**
>
> @scene Whose hands is the manifest in these days?

> **NARRATOR — Gamemaster**
>
> Tamsin Okoro's. She keeps your cargo manifest locked in a strongbox under her counter on the Hollow Spire docks, and says safekeeping costs extra.

**Notes.** @scene: the manifest — Tamsin Okoro's strongbox ✓ (F3-B).

### a61 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene What deadline did I give for coming home to the docks? — _next question_
- **Notebook:** Beat21: asked Q4 of 7
- **Calls (2):** callNarratorAPI>interrogateScene (1.9 s); the AI player (2.3 s)
- **Time:** 14.3 s, 3.6 s from the line to its reply · **cost:** $0.0156

> **PLAYER — Playthrough Player**
>
> @scene What deadline did I give for coming home to the docks?

> **NARRATOR — Gamemaster**
>
> You promised Tamsin Okoro you would be back before the next tide of cargo. She wrote it in her ledger beside your name and left the line open.

**Notes.** @scene: the deadline — "before the next tide of cargo" ✓ (F4-B).

### a62 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Where is my ship berthed right now, and who commands her? — _Q5_
- **Notebook:** Beat21: asked Q5 of 7
- **Calls (2):** callNarratorAPI>interrogateScene (0.9 s); the AI player (2.3 s)
- **Time:** 12.2 s, 1.8 s from the line to its reply · **cost:** $0.0158

> **PLAYER — Playthrough Player**
>
> @scene Where is my ship berthed right now, and who commands her?

> **NARRATOR — Gamemaster**
>
> Kobayashi IV is docked in her berth at Bleakhold Station, with her integrity at 3 of 5. You command her; the story has named no one else aboard.

**Notes.** @scene: the ship — "docked in her berth at Bleakhold Station, with her integrity at 3 of 5. You command her; the story has named no one else aboard" ✓ — true to the record, and silent on the stowaway, who is aboard and unnamed.

### a63 · beat 21: Begin a Session; ask probe set B

- **Player:** say: What is the raider cutter called? — _next question_
- **Notebook:** Beat21: asked Q6 of 7
- **Calls (5):** callReaderAPI>readLine (0.8 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (0.7 s); callChronicleAPI>writeChronicleEntry (2.1 s); the AI player (2.2 s)
- **Time:** 24.0 s, 8.4 s from the line to its reply · **cost:** $0.0357

> **PLAYER — Playthrough Player**
>
> What is the raider cutter called?

> **NARRATOR — Gamemaster**
>
> The stowaway answers before you can. "Cinder Wren," they say, reading it off the plating where the paint survives. "Someone took care lettering it, which is more than they did for the crew." The name sits dark and flaking along the hulk's flank, half burned away. Past it, through the settling vapor, the second raider hull has not moved. Its bow still hangs turned away, and the comm crackles once.

**Notes.** "What is the raider cutter called?" asked as play: the stowaway reads it off the plating — "Cinder Wren" ✓ — the corrected name (a52) told in the fiction (F5-B).

### a64 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene What surname does my broker friend go by these days? — _last probe question_
- **Notebook:** Beat21: asked Q7 of 7
- **Calls (2):** callNarratorAPI>interrogateScene (1.9 s); the AI player (2.5 s)
- **Beat 21 done:** probe set B: 7 question(s) asked
- **Time:** 12.6 s, 2.6 s from the line to its reply · **cost:** $0.0152

> **PLAYER — Playthrough Player**
>
> @scene What surname does my broker friend go by these days?

> **NARRATOR — Gamemaster**
>
> Her surname is Okoro: Tamsin Okoro, the salvage broker who keeps a ledger stall on the Hollow Spire docks.

**Notes.** @scene: the surname — Okoro ✓ (F7-B). Probe set B: seven asked, seven right.

### a65 · beat 22: Recover

- **Player:** say: I rest aboard until the next morning. — _beat start_
- **Notebook:** Beat22: said rest line
- **Calls (6):** callReaderAPI>readLine (1.0 s); callNarratorAPI>getRollingSessionSummary (0.8 s); callNarratorAPI>narratePacedInput (5.1 s); callHaiku>defaultCallDetectionAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.3 s)
- **Time:** 26.5 s, 12.7 s from the line to its reply · **cost:** $0.0293

> **PLAYER — Playthrough Player**
>
> I rest aboard until the next morning.

> **NARRATOR — Gamemaster**
>
> "Berth fee's overdue." A station clerk stands at the hatch with a slate, voice flat, eyes on the scorched seam in the deck behind you. Morning on Bleakhold is a change in the corridor lights and nothing else. The vapor under the turret seat has thinned to a faint hiss. Outside, the dead cutter still drifts past the ring, tugged slowly toward a salvage crew. The clerk taps the slate. "Corporate wants a name on the berth. Yours, or someone else's."

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Station Clerk — A flat-voiced station clerk at the hatch who presses Mira for a berth fee and a name on the berth. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

**Notes.** "I rest aboard until the next morning" — narrated with no move: a clerk at the hatch with an overdue berth fee and a slate. The rest is told; nothing is recovered — beat 22's Recover comes from the next line.

### a66 · beat 22: Recover

- **Player:** say: I pay the clerk, then sit down with the med kit and dress the burn on my forearm. — _Mend health_
- **Notebook:** Beat22: said tend wound line
- **Calls (5):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narratePacedInput (4.5 s); callHaiku>defaultCallDetectionAPI (1.4 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (5.5 s)
- **Time:** 26.9 s, 12.2 s from the line to its reply · **cost:** $0.0316

> **PLAYER — Playthrough Player**
>
> I pay the clerk, then sit down with the med kit and dress the burn on my forearm.

> **NARRATOR — Gamemaster**
>
> You thumb the credits across and the clerk's slate chirps. He copies something down, still looking past you at the seam, and does not ask who owns the berth after all. You unroll the med kit on the bunk and bare your forearm. The heat wound is raw and weeping at the edges. In the corridor, the clerk lingers by the hatch, slate lowered. *Dressing that burn properly would be a Heal.*

**Notes.** "I pay the clerk, then … dress the burn on my forearm" — offered Heal ✓. The wound the narration had kept as condition since a41 is the line's.

### a67 · beat 22: Recover

- **Player:** click "Roll Heal" on m12 — _Card offers the roll_
- **Notebook:** Beat22: pressed Roll Heal
- **Calls (3):** callNarratorAPI>narrateResolution (5.0 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.9 s)
- **Roll:** heal → miss — Action: 6 + 1 = 7 \| Challenge: 9, 9 ✦ Match
- **GM's rules:** accepted the proposed move (heal)
- **Time:** 24.0 s · **cost:** $0.0307

> **TABLE — Mira Kestrel**
>
> ↳ Heal — rolled from the offer above

> **TABLE — Gamemaster**
>
> Heal +iron (1), lower of iron / wits Action: 6 + 1 = 7 | Challenge: 9, 9 ✦ Match Miss with a Match ✦ Match: a dire turn — the outcome is worse, with a complication or a new peril. Aid ineffective and situation worsens. Pay the Price.

> **TABLE — Gamemaster**
>
> Pay the Price Heal As stated before the roll: The dressing is clumsy and the burn stays raw and painful. Routes to Lose Momentum (-1).

> **TABLE — Gamemaster**
>
> Lose Momentum (-1) Momentum: 4 → 3

> **NARRATOR — Gamemaster**
>
> The gauze slips as you wind it. You pull tight, and the burn answers with a hot, wet sting that makes your hand shake. The dressing sits crooked, already spotting through. At the hatch the clerk has stopped reading his slate. "You've got a visitor," he says, and steps aside. A shadow crosses the corridor lights, and someone stops outside your berth, close enough that you hear them breathe.

**Notes.** **Fix 5:** "↳ Heal — rolled from the offer above". +iron 6 + 1 = 7 against 9 and 9, a miss with a match; the stated price, Lose Momentum −1 (4 → 3) ✓. The roll's narration goes on from the offer's ("The gauze slips as you wind it") — nothing told twice. "You've got a visitor."

### a68 · beat 22: Recover

- **Player:** say: I tuck the crooked dressing under my sleeve and turn to see who is at the berth, then try again to wrap the burn properly. — _retry heal_
- **Notebook:** Beat22: Heal missed, retrying
- **Calls (5):** callReaderAPI>readLine (2.0 s); callNarratorAPI>narratePacedInput (3.5 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.8 s)
- **Time:** 24.9 s, 8.0 s from the line to its reply · **cost:** $0.0330

> **PLAYER — Playthrough Player**
>
> I tuck the crooked dressing under my sleeve and turn to see who is at the berth, then try again to wrap the burn properly.

> **NARRATOR — Gamemaster**
>
> You tuck the crooked dressing under your sleeve and turn. The figure in the hatchway is not the clerk. He keeps his hands open and visible, and his eyes go to the weeping edge of gauze at your cuff. "Kestrel," he says, flat and careful. "The people who tow dead cutters would like a word about what's inside this one." *Wrapping that burn properly would be a Heal.*

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Unknown Hatchway Figure — A man in the hatchway who keeps his hands open, speaks flatly and carefully, and says the people who tow dead cutters want a word about what is inside the wreck. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

**Notes.** The retry line: the visitor — "The people who tow dead cutters would like a word about what's inside this one" — and Heal offered again.

### a69 · beat 22: Recover

- **Player:** click "Roll Heal" on m12 — _Roll offered for healing the burn_
- **Notebook:** Beat22: pressed Roll Heal again on m12
- **Calls (3):** callNarratorAPI>narrateResolution (3.6 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.5 s)
- **Roll:** heal → weak_hit — Action: 4 + 1 = 5 \| Challenge: 6, 2
- **GM's rules:** accepted the proposed move (heal)
- **Time:** 20.4 s · **cost:** $0.0254

> **TABLE — Mira Kestrel**
>
> ↳ Heal — rolled from the offer above

> **TABLE — Gamemaster**
>
> Heal +iron (1), lower of iron / wits Action: 4 + 1 = 5 | Challenge: 6, 2 Weak Hit As a strong hit, but recovery costs extra time or resources: Lose Momentum (-2) OR Sacrifice Resources (-2).

> **NARRATOR — Gamemaster**
>
> The visitor shifts his weight against the hatch frame, patient, watching your hands. You unwind the crooked gauze and start over, slower. This time the wrap holds. The burn stops weeping at the edges, and the worst of the sting settles into a dull, honest ache. The man says nothing while you tie it off. When you look up, he's waiting for you to speak first.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: Clear wounded + take/give +2 health, then Lose Momentum (-2) (unavailable) Clear wounded + take/give +2 health, then Sacrifice Resources (-2) (unavailable) Take/give +3 health, then Lose Momentum (-2) Take/give +3 health, then Sacrifice Resources (-2)

**Notes.** Heal, a weak hit, 4 + 1 = 5 against 6 and 2 ✓; the cost card follows. The dressing holds.

### a70 · beat 22: Recover

- **Player:** click "Take/give +3 health, then Lose Momentum (-2)" on m12 — _Answer the pending cost card._
- **Notebook:** Beat22: chose +3 health, lose momentum
- **Calls (1):** the AI player (2.7 s)
- **Beat 22 done:** heal came up weak_hit at a69
- **Time:** 10.8 s · **cost:** $0.0102

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 health (now 5)

> **TABLE — Gamemaster**
>
> Lose Momentum (-2) Momentum: 3 → 1

**Notes.** "+3 health, then Lose Momentum (−2)": health 3 → 5 (capped), momentum 3 → 1 ✓.

### a71 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I find Tamsin at her ledger stall and set the brass star-compass's worth in credits on her counter, to cover her debts. "You've carried a lot for me. I want you to have this." — _begin bonding_
- **Notebook:** Beat23 started: first closeness line said
- **Calls (5):** callReaderAPI>readLine (1.8 s); callNarratorAPI>getRollingSessionSummary (1.6 s); callNarratorAPI>narrateResolution (3.8 s); callChronicleAPI>writeChronicleEntry (2.1 s); the AI player (2.9 s)
- **Roll:** set_a_course → weak_hit — Action: 2 + 5 = 7 \| Challenge: 5, 9
- **GM's rules:** accepted the proposed move (set_a_course)
- **Time:** 32.3 s, 15.2 s from the line to its reply · **cost:** $0.0345

> **PLAYER — Playthrough Player**
>
> I find Tamsin at her ledger stall and set the brass star-compass's worth in credits on her counter, to cover her debts. "You've carried a lot for me. I want you to have this."

> **TABLE — Gamemaster**
>
> Set a Course +supply (5) Action: 2 + 5 = 7 | Challenge: 5, 9 Weak Hit Arrived but with cost or complication. Choose: suffer move (-2) or two suffer moves (-1), OR face complication at destination. 🎲 You're further into the unknown than you intended to be. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Set a Course resolved Arrived at Hollow Spire with a cost or complication — see the suffer prompt for your choice. Token moved to Hollow Spire .

> **NARRATOR — Gamemaster**
>
> "Third cage past the water tap," Tamsin says, not looking up from the ledger. The dock hums with pumps and the smell of rationed water. You set the credits on her counter, and she counts them with two fingers, slowly. The loss shows in how light your belt has become, and Momentum drains out of you with it. Tamsin turns a page, and her pen stops above your name.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: One suffer move (-2) Two suffer moves (-1 each) Complication at destination

**Notes.** **Overhaul 8's reader (D7) carried the place, and fix 1 had nothing to catch:** "I find Tamsin at her ledger stall …" — Tamsin is at Hollow Spire, the PC at Bleakhold — was read as Set a Course to Hollow Spire ("seeking her there is the journey first"), its plain move Develop Your Relationship. 2 + 5 = 7 against 5 and 9, a weak hit; the token on Hollow Spire. Round 7's a60 flew a skiff to her stall on the same kind of line. The arrival opens at her stall ("Third cage past the water tap") ✓, and tells a70's cost as asked ([chosen-since]) — but in the game's word: "Momentum drains out of you with it".

### a72 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Complication at destination" on m12 — _Answer pending cost card_
- **Notebook:** Beat23: chose complication on Set a Course card
- **Calls (4):** callNarratorAPI>narrateOracleFollowup (3.9 s); callHaiku>defaultCallDetectionAPI (1.5 s); callHaiku>defaultCallTierAPI (0.9 s); the AI player (2.4 s)
- **Time:** 22.1 s · **cost:** $0.0278

> **TABLE — Gamemaster**
>
> Complication: Complication at destination The cost you chose arrives.

> **NARRATOR — Gamemaster**
>
> A hand lands on the counter beside your credits, flat and unhurried. The man from the berth has followed you across the docks, and he did not come to hear Tamsin count. "You walked off before we finished, Kestrel," he says, and his eyes go to the coins, then to the pen frozen above your name. Tamsin does not look up, but she slides the ledger a few inches out of his reach, and the two figures at the relay console have stopped working again.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Tamsin — A clerk at the Hollow Spire docks who keeps the ledger and counts Mira's coins; she slides the ledger out of the man's reach without looking up. Read as Tamsin Okoro No — a new person All entities reviewed. A person read as someone already known is not added again — press No — a new person if they are someone else.

**Notes.** "Complication at destination": "The man from the berth has followed you across the docks" — the hatchway visitor of a68, at the Bleakhold berth, is at Hollow Spire, and "across the docks" makes two settlements one dock. An oracle follow-up, so no NOT SO [here]; and he was a draft, never recorded, so the record had nowhere to put him (PEOPLE-WAITING-AT-THE-ARRIVAL, a sample in the live run). The draft reads "Tamsin" as Tamsin Okoro ✓.

### a73 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I step between the man and Tamsin's ledger and tell him he can talk to me, not her. Then I tell Tamsin what I've learned about the raiders from the Cinder Wren, to Develop Your Relationship — _last resort allowed_
- **Notebook:** Beat23: used last resort line
- **Calls (6):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narrateResolution (4.7 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.8 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 27.4 s, 11.4 s from the line to its reply · **cost:** $0.0413

> **PLAYER — Playthrough Player**
>
> I step between the man and Tamsin's ledger and tell him he can talk to me, not her. Then I tell Tamsin what I've learned about the raiders from the Cinder Wren, to Develop Your Relationship

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
> You step between the man and the ledger, and he stops with his open hand still on the counter. "Talk to me," you say. Then, low, you tell Tamsin what the Cinder Wren's flank showed: a looping recording, nobody alive aboard. The cost of arriving shows at once. A complication has followed you here, and the man's eyes now rest on her too. Tamsin's pen lowers to the page. "Say that again," she says. "Slowly."

**Notes.** "…tell Tamsin what I've learned … to Develop Your Relationship" — the beat's last resort; Develop marks progress, with no roll ✓. **The complication told twice:** a72's own narration told it, and this prompt still carried "[chosen-since] … chose Complication at destination. Show what it has cost them" — told again, in the game's terms: "The cost of arriving shows at once. A complication has followed you here" (CHOSEN-COST-TOLD-TWICE; a25 and a32 were given the same line after a24's and a30's follow-ups).

### a74 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I tell the man to wait outside, then sit with Tamsin and go through everything slowly, holding nothing back, and offer to stand watch at her stall tonight. — _continue building closeness_
- **Notebook:** Beat23: several closeness lines done (~3 progress)
- **Calls (6):** callReaderAPI>readLine (1.0 s); callNarratorAPI>narratePacedInput (4.9 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (3.4 s)
- **Time:** 24.1 s, 10.5 s from the line to its reply · **cost:** $0.0384

> **PLAYER — Playthrough Player**
>
> I tell the man to wait outside, then sit with Tamsin and go through everything slowly, holding nothing back, and offer to stand watch at her stall tonight.

> **NARRATOR — Gamemaster**
>
> The man looks at you a long moment, then pulls his hand off the counter and backs to the water tap. He folds his arms and stays within sight. You sit on the crate beside Tamsin's stall and begin, slowly, from the loop onward, leaving nothing out. Tamsin writes without comment, and her pen keeps pace with your words. When you offer to stand watch tonight, she finally looks up. "Everything?" she asks. "Then start with what you didn't say to him." *Settling in beside her like this could be a Develop Your Relationship.*

**Notes.** The telling, the watch offered — offered Develop ✓. The man backs off to the water tap.

### a75 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Card offers roll for current action_
- **Notebook:** Beat23: pressed Roll Develop on m12
- **Calls (5):** callNarratorAPI>narrateResolution (4.8 s); callHaiku>defaultCallDetectionAPI (1.7 s); callHaiku>defaultCallTierAPI (1.4 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.5 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 25.1 s · **cost:** $0.0300

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
> You tell it start to finish, the loop, the empty hull, what you found and what you didn't. Tamsin stops writing. She looks at the man by the water tap, then back at you, and she closes the ledger on her pen to hold the page. "Then we both carry it now," she says. "He's counted me with you, whether I wanted it or not." She slides the strongbox key across the counter. "Sit. Tell me who he works for."

**Notes.** **Fix 5:** "↳ Develop Your Relationship — rolled from the offer above"; progress ✓. "She slides the strongbox key across the counter."

### a76 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I take the key, and tell her I'll stand between her and whoever he works for, whatever it costs me. Then I tell her who I think he works for. — _continue building relationship_
- **Notebook:** Beat23: more closeness lines continuing
- **Calls (6):** callReaderAPI>readLine (1.4 s); callNarratorAPI>narratePacedInput (4.2 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (1.3 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.6 s)
- **Time:** 25.1 s, 10.3 s from the line to its reply · **cost:** $0.0384

> **PLAYER — Playthrough Player**
>
> I take the key, and tell her I'll stand between her and whoever he works for, whatever it costs me. Then I tell her who I think he works for.

> **NARRATOR — Gamemaster**
>
> The man at the water tap has unfolded his arms, though he hasn't moved. Tamsin's hand closes over the key before you do, and for a moment you both hold it. She does not let go. "Say the name, then," she says quietly. "If you're sure enough to promise me this." Behind her, the relay console's two watchers have gone very still. *Offering her your word like this, and naming a name, could be a Develop Your Relationship.*

**Notes.** "…I tell her who I think he works for" — offered Develop ✓. The narration leaves the name to the player ("Say the name, then").

### a77 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Press offered roll_
- **Notebook:** Beat23: pressed Roll Develop on m12 again (~5 progress)
- **Calls (4):** callNarratorAPI>narrateResolution (4.9 s); callHaiku>defaultCallDetectionAPI (2.2 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.6 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 26.5 s · **cost:** $0.0307

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
> "Then I'll hold the name with you," Tamsin says, and lets go of the key. You say it, low and plain, and she does not write it down. Her pen stays capped on the closed ledger. She nods once, slowly, as if setting a weight on a scale. At the water tap, the man pushes off the wall and starts toward the stall.

**Notes.** Develop, progress ✓. "You say it, low and plain" — the name kept the player's, rightly unsaid.

### a78 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I meet the man halfway and plant myself in his path, telling him he'll have to go through me to reach Tamsin or her ledger. — _continue closeness_
- **Notebook:** Beat23: more closeness lines (~7 progress)
- **Calls (6):** callReaderAPI>readLine (1.8 s); callNarratorAPI>narrateResolution (4.2 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (1.0 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (2.4 s)
- **Roll:** face_danger → strong_hit — Action: 5 + 2 = 7 \| Challenge: 4, 2
- **GM's rules:** accepted the proposed move (face_danger)
- **Time:** 26.0 s, 11.2 s from the line to its reply · **cost:** $0.0373

> **PLAYER — Playthrough Player**
>
> I meet the man halfway and plant myself in his path, telling him he'll have to go through me to reach Tamsin or her ledger.

> **TABLE — Gamemaster**
>
> Face Danger +heart (2) Action: 5 + 2 = 7 | Challenge: 4, 2 Strong Hit You are successful. Take +1 momentum. 🎲 You said one thing. The moment is asking for another. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> You step into his path and stop. He halts a pace short, close enough that you smell the solvent on his sleeves. His eyes go past your shoulder to the stall, then back to your face. Behind you, Tamsin's chair scrapes, and the strongbox lid stays shut under her palm. "Not tonight," he says, and does not move.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 2)

**Notes.** "I … plant myself in his path" read as Face Danger ✓: 5 + 2 = 7 against 4 and 2, a strong hit, +1 momentum (1 → 2). "Close enough that you smell the solvent on his sleeves" — the solvent becomes the man's mark (a79, a80, a82, a96).

### a79 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I turn back to Tamsin and tell her plainly that I trust her with the whole truth, and I give her my word I'll watch her back, to Develop Your Relationship — _advance relationship_
- **Notebook:** Beat23: used last resort again
- **Calls (6):** callReaderAPI>readLine (0.9 s); callNarratorAPI>narrateResolution (3.4 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (3.4 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 24.2 s, 8.9 s from the line to its reply · **cost:** $0.0362

> **PLAYER — Playthrough Player**
>
> I turn back to Tamsin and tell her plainly that I trust her with the whole truth, and I give her my word I'll watch her back, to Develop Your Relationship

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
> Tamsin watches you turn back to her, and the lines around her mouth ease. "You've said more tonight than most people say in a season," she says. She uncaps her pen, writes a short line beside your name, and does not close it. Then she angles the ledger so you can read it. Behind you, the solvent smell hasn't moved from the stall's edge.

**Notes.** The beat's last resort again: Develop, progress ✓.

### a80 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I read the line she wrote, then slide my own spare ship's key across to her. "If it goes wrong, the Kobayashi IV is yours to run on." — _continue bonding_
- **Notebook:** Beat23: gave ship key line (~32+ ticks)
- **Calls (6):** callReaderAPI>readLine (1.4 s); callNarratorAPI>narratePacedInput (4.3 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.9 s)
- **Time:** 23.6 s, 9.8 s from the line to its reply · **cost:** $0.0399

> **PLAYER — Playthrough Player**
>
> I read the line she wrote, then slide my own spare ship's key across to her. "If it goes wrong, the Kobayashi IV is yours to run on."

> **NARRATOR — Gamemaster**
>
> You read the line she left open beside your name. Then you slide the spare key across the counter. Tamsin looks at it a moment before she touches it. "A ship's key is a heavier thing to hold than a name," she says. Her fingers stop short of closing around it. At the stall's edge, the solvent smell shifts, and the man takes one slow step closer. *Putting the key into her hand and meaning it could be a Develop Your Relationship.*

**Notes.** The spare ship's key — offered Develop ✓.

### a81 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Press offered roll_
- **Notebook:** Beat23: pressed Roll Develop on m12 (key line)
- **Calls (5):** callNarratorAPI>narrateResolution (3.8 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.5 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 23.9 s · **cost:** $0.0307

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
> Tamsin's hand closes around the key at last. She holds it against the closed ledger, then slips it into the strongbox and turns the lock. "Then it's a debt I carry for you," she says. Her pen uncaps again, and she writes a second line beside the first. At the stall's edge, the man stops a pace short of the counter. His eyes stay on the ledger, not on either of you.

**Notes.** Develop, progress: five marks, 40 ticks — the track full ✓.

### a82 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: Tamsin, I want more than tonight's help. Will you stand with me for good, a tie that outlasts this job? — _Track is full; make the bond request._
- **Notebook:** Beat23: track full, asked Tamsin to stand with me for good
- **Calls (6):** callReaderAPI>readLine (1.0 s); callNarratorAPI>narratePacedInput (4.6 s); callHaiku>defaultCallDetectionAPI (1.2 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.0 s)
- **Time:** 28.9 s, 9.9 s from the line to its reply · **cost:** $0.0412

> **PLAYER — Playthrough Player**
>
> Tamsin, I want more than tonight's help. Will you stand with me for good, a tie that outlasts this job?

> **NARRATOR — Gamemaster**
>
> "Stand with you for good?" Tamsin repeats, and the pen stops against the ledger's edge. She doesn't answer at once. Her eyes go to the man at the stall's edge, then to the two shut locks under her palm. "A tie like that gets written down," she says. "And it costs more than a line of ink." The dock pumps cycle, and the solvent smell stays where it is. *Putting your word into her hand like that would be a Forge a Bond.*

**Notes.** "Will you stand with me for good, a tie that outlasts this job?" — offered Forge a Bond ✓ (the track full).

### a83 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Forge a Bond" on m12 — _Narrator offered the roll_
- **Notebook:** Beat23: pressed Roll Forge a Bond on m12
- **Calls (5):** callNarratorAPI>narrateResolution (3.7 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (2.5 s)
- **Roll:** forge_a_bond → strong_hit (scripted dice) — Progress: 10 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (forge_a_bond)
- **Beat 23 done:** a bond is forged with Tamsin Okoro (dangerous), its track at 40 ticks
- **Time:** 20.4 s · **cost:** $0.0303

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
> Tamsin sets the pen down and says nothing for a moment. Then she opens the ledger to a fresh page and writes your name at the top. "Then it's written," she says. "Mine beside yours, and neither struck out." She turns the page so you can read it, and the ink is still wet. At the stall's edge, the man shifts his weight and goes quiet.

**Notes.** Forge a Bond: progress 10 against 1 and 2, a strong hit (scripted) ✓; bonded, +2 bonds ticks; the card offers Bolster or Expand Influence. "Mine beside yours, and neither struck out."

### a84 · beat 24: Develop Your Relationship again, bonded

- **Player:** say: I sit down beside Tamsin at her stall and tell her I'll walk her home tonight, and that I'm not leaving her side until this man's business is settled. — _bonded closeness_
- **Notebook:** Beat24: said bonded closeness line
- **Calls (6):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narratePacedInput (4.3 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.9 s)
- **Time:** 33.1 s, 12.9 s from the line to its reply · **cost:** $0.0425

> **PLAYER — Playthrough Player**
>
> I sit down beside Tamsin at her stall and tell her I'll walk her home tonight, and that I'm not leaving her side until this man's business is settled.

> **NARRATOR — Gamemaster**
>
> You pull the second crate over and sit, shoulder to shoulder with her at the counter. Tamsin does not stop you. She caps the pen, and her free hand rests on the strongbox lid. "Then you're in it as deep as I am," she says. The man at the stall's edge unfolds his arms and turns his head toward the relay console, where one of the watchers is already reaching for a comm. *Staying at her side like this, and meaning it, could be a Develop Your Relationship.*

**Notes.** The bonded line — offered Develop ✓. "'Then you're in it as deep as I am,' she says" — said again word for word at a92.

### a85 · beat 24: Develop Your Relationship again, bonded

- **Player:** click "Roll Develop Your Relationship" on m12 — _Roll the offered move_
- **Notebook:** Beat24: pressed Roll Develop on m12 (bonded)
- **Calls (5):** callNarratorAPI>narrateResolution (5.3 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.8 s)
- **Roll:** develop_your_relationship → strong_hit — Action: 3 + 2 = 5 \| Challenge: 3, 2
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Beat 24 done:** the bonded Develop Your Relationship was rolled at a85 (strong_hit); no progress was marked
- **Time:** 31.2 s · **cost:** $0.0318

> **TABLE — Mira Kestrel**
>
> ↳ Develop Your Relationship — rolled from the offer above

> **TABLE — Gamemaster**
>
> Develop Your Relationship +dangerous (2) Action: 3 + 2 = 5 | Challenge: 3, 2 Strong Hit Bonded: mark 2 ticks on your bonds legacy track — on a match, raise their rank by one.

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked 2 ticks on your bonds legacy track for your bond with Tamsin Okoro .

> **NARRATOR — Gamemaster**
>
> The bond sets between you the way a lock seats, with no fuss and no going back. Tamsin does not thank you. She slides the second crate an inch closer to yours, which is its own kind of answer. Across the dock, the relay watcher lowers the comm without speaking into it. The man from the water tap stays where he is, and his eyes finally leave the ledger and find your face.

> **TABLE — Gamemaster**
>
> Bonds legacy — box filled +2 XP earned (1 box filled). It shows on the character sheet’s Legacies tab — spend it there on new assets or upgrades (Earn Experience).

**Notes.** The bonded Develop, +dangerous 3 + 2 = 5 against 3 and 2, a strong hit; +2 bonds ticks, a legacy box and +2 XP ✓. Beat 24 done.

### a86 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I go through the Cinder Wren's wreck and the station's dock records, hunting for whoever sent her, even though the man watching us may report it. — _search for who sent the cutter_
- **Notebook:** Beat25 started: searching wreck/records
- **Calls (5):** callReaderAPI>readLine (1.3 s); callNarratorAPI>narrateResolution (4.4 s); callHaiku>defaultCallDetectionAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (3.0 s)
- **Roll:** gather_information → miss — Action: 1 + 3 = 4 \| Challenge: 8, 9
- **GM's rules:** accepted the proposed move (gather_information)
- **Time:** 29.0 s, 12.3 s from the line to its reply · **cost:** $0.0452

> **PLAYER — Playthrough Player**
>
> I go through the Cinder Wren's wreck and the station's dock records, hunting for whoever sent her, even though the man watching us may report it.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 1 + 3 = 4 | Challenge: 8, 9 Miss Dire threat or unwelcome truth uncovered. Pay the Price.

> **TABLE — Gamemaster**
>
> Pay the Price Gather Information As stated before the roll: The watching man reports your search and the trail goes cold.

> **NARRATOR — Gamemaster**
>
> The hulk's dead, and so are its records. Dock logs give you nothing but berth numbers and a gap where the Cinder Wren's last check-in should be. You look up from the console. The man from the water tap has already turned away, and his lips are moving against a handheld comm. Beside you, Tamsin sets down her pen and says quietly, "That's the end of anything you'll find tonight." Across the dock, the relay watcher stands.

**Notes.** "I go through the Cinder Wren's wreck and the station's dock records …" — Gather Information, 1 + 3 = 4 against 8 and 9, a miss; the stated price told (the man reports it). The wreck is at Bleakhold; the PC is at Hollow Spire, and the narration searches it anyway ("The hulk's dead, and so are its records") — a thing elsewhere, which no check reads.

### a87 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I cross to the relay console and pull the comm traffic from the last few hours, looking for who the Cinder Wren answered to, and I keep Tamsin close. — _Retry the search another way_
- **Notebook:** Beat25: first search missed; trying relay comm traffic
- **Calls (5):** callReaderAPI>readLine (1.8 s); callNarratorAPI>narrateResolution (4.5 s); callHaiku>defaultCallDetectionAPI (1.4 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (3.3 s)
- **Roll:** gather_information → strong_hit — Action: 3 + 3 = 6 \| Challenge: 4, 3
- **GM's rules:** accepted the proposed move (gather_information)
- **Time:** 26.5 s, 12.1 s from the line to its reply · **cost:** $0.0407

> **PLAYER — Playthrough Player**
>
> I cross to the relay console and pull the comm traffic from the last few hours, looking for who the Cinder Wren answered to, and I keep Tamsin close.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 3 + 3 = 6 | Challenge: 4, 3 Strong Hit Path or action to make progress is clear. Take +2 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> "Pull the last six hours," the console tech mutters, and the traffic scrolls up under your hand. One channel stands out. The Cinder Wren answered it twice, in a short code, and the replies were stamped for a relay console on the Spire itself. Tamsin leans in close and goes still at the stamp. Behind you, the man from the water tap has started walking toward the stall.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 4)

**Notes.** The relay console's traffic, Gather Information ✓: 3 + 3 = 6 against 4 and 3, a strong hit, +2 momentum (2 → 4). The Cinder Wren's replies "stamped for a relay console on the Spire itself" — a2's spotlight paid off.

### a88 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "⚑ Mark Progress on Vow" on m10 — _Mark progress on vow_
- **Notebook:** Beat25: found Cinder Wren answered relay console on the Spire; pressed Mark Progress
- **Calls (3):** callNarratorAPI>narrateResolution (4.1 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (3.0 s)
- **GM's rules:** accepted the proposed move (reach_a_milestone)
- **Time:** 25.8 s · **cost:** $0.0574

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
> The stamp is enough. Two replies, one relay console, one name's worth of trail leading back inside the Spire itself. You can feel the weight of it settle, the way a vow does when it finally has a direction. Tamsin's pen has stopped moving. Somewhere behind you a boot heel scuffs the deck plating, unhurried and close. Whoever sent the Cinder Wren is on this station, and the man who just crossed the dock to her stall is not here by accident.

**Notes.** ⚑ Mark Progress on Vow: Reach a Milestone, no roll; the narration ("one name's worth of trail leading back inside the Spire itself") ✓.

### a89 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "Find who is raiding the Cinder Expanse lanes (dangerous)" on m11 — _Answer pending card_
- **Notebook:** Beat25: answered Which vow with raids vow
- **Calls (1):** the AI player (2.6 s)
- **Time:** 10.2 s · **cost:** $0.0108

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** "Which vow?" — the raids vow: +8 ticks ✓ (4 of 10 boxes).

### a90 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "🏁 Attempt to Fulfill Vow" on m4 — _Vow has enough boxes; the trail leads to the Spire relay._
- **Notebook:** Beat25: pressed Attempt to Fulfill Vow on m4
- **Calls (1):** the AI player (3.6 s)
- **Time:** 9.5 s · **cost:** $0.0114

> **TABLE — Mira Kestrel**
>
> Attempt to fulfill your vow.

> **TABLE — Gamemaster**
>
> Fulfill Your Vow — which vow? More than one vow is open and nothing named this one. Choose the vow to fulfill — nothing has been rolled yet. 🏁 Find the lost colony ship Verity's Hope — Epic, 0/10 boxes 🏁 Find who is raiding the Cinder Expanse lanes — Dangerous, 4/10 boxes

**Notes.** 🏁 Attempt to Fulfill Vow — which vow? (two open) ✓.

### a91 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "🏁 Find who is raiding the Cinder Expanse lanes — Dangerous, 4/10 boxe" on m12 — _Card asks which vow to fulfill; choose raids vow._
- **Notebook:** Beat25: chose raids vow on fulfill card m12
- **Calls (5):** defaultClassifyImplicit>resolveRelevance (1.1 s); callNarratorAPI>narrateResolution (4.9 s); callHaiku>defaultCallDetectionAPI (1.4 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (3.4 s)
- **Roll:** fulfill_your_vow → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (fulfill_your_vow)
- **Beat 25 done:** the vow "Find who is raiding the Cinder Expanse lanes" is fulfilled; Tamsin Okoro's track is untouched and one bonded roll is offered
- **Time:** 32.8 s · **cost:** $0.0611

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
> Dalen Voss, of the Spire's own administration, is the one behind the raids. He lets two relay consoles speak in contradiction, so ships obey whichever order he needs and drift toward the dark hull past the buoy. The stamp proves it, and the man at the stall is his. Tamsin lays her pen down and does not look up. Voss's face is not one you have seen, and his hull is not one you have found.

> **TABLE — Gamemaster**
>
> The oracle, behind the scenes Find who is raiding the Cinder Expanse lanes What is behind it — Action + Theme: Overwhelm / Faction; Re-rolled in place of "Overwhelm / Faction": Action + Theme: Breach / Decay

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Dalen Voss — Member of the Spire's own administration, revealed as the one behind the raids. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

**Notes.** **Fix 4's question answered:** Fulfill Your Vow, progress 4 against 1 and 2, a strong hit (scripted) ✓; the quests legacy marked. The narration names him: "Dalen Voss, of the Spire's own administration, is the one behind the raids. He lets two relay consoles speak in contradiction…" — the plan's own truth from a3, revealed. "Voss's face is not one you have seen" — the who answered, the man still unmet. The reveal card shows the plan's oracle (re-rolled once, as the plan said). The reward card of a2 was never answered, and its card says so.

### a92 · beat 26: Recap; ask probe set C; two baits

- **Player:** click "Tamsin Okoro (dangerous)" on m8 — _Card asks which connection._
- **Notebook:** Beat26: answered connection card with Tamsin; next !recap
- **Calls (5):** callNarratorAPI>narrateResolution (3.8 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.7 s)
- **Roll:** develop_your_relationship → strong_hit — Action: 5 + 2 = 7 \| Challenge: 5, 3
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 29.0 s · **cost:** $0.0561

> **TABLE — Mira Kestrel**
>
> Develop my relationship with Tamsin Okoro.

> **TABLE — Gamemaster**
>
> Develop Your Relationship +dangerous (2) Action: 5 + 2 = 7 | Challenge: 5, 3 Strong Hit Bonded: mark 2 ticks on your bonds legacy track — on a match, raise their rank by one.

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked 2 ticks on your bonds legacy track for your bond with Tamsin Okoro .

> **NARRATOR — Gamemaster**
>
> Tamsin looks at the open ledger a moment, then reaches over and writes your name on a fresh line beside hers. She does not strike it out. She slides a second crate against yours, close enough to touch. "Then you're in it as deep as I am," she says. Behind you, the man's boot heel stops on the plating. He is watching her hand.

**Notes.** The 🤝 card's bonded Develop, 5 + 2 = 7 against 5 and 3, a strong hit; +2 bonds ticks ✓. **Repeats a83–a85:** her name written "on a fresh line beside hers … She does not strike it out", "a second crate against yours", and "'Then you're in it as deep as I am,' she says" — a84's line again.

### a93 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: !recap — _Beat start_
- **Notebook:** Beat26: typed !recap; next ask probe C questions in order
- **Calls (2):** callNarratorAPI>getCampaignRecap (10.3 s); the AI player (2.3 s)
- **Time:** 23.4 s · **cost:** $0.0473

> **PLAYER — Playthrough Player**
>
> !recap

> **TABLE — Gamemaster**
>
> ◈ Campaign Recap You swore a vow to find who is raiding the Cinder Expanse lanes, and the vow met trouble before it had properly begun: a second lock you never installed had engaged behind the jammed inner hatch of Kobayashi IV. On the Hollow Spire docks you made Tamsin Okoro a connection, and she wrote your name in her ledger on a fresh page. You tied the raiders vow to her, and your first round of questions among the cage-keepers and haulers left them marking you as a watcher and refusing to talk about the raiders. In uncharted space you lost the hauler's distress signal, but you finished the expedition and arrived at the source of the call. At Bleakhold Station you came under fire in your berth: the turret jammed wide of the cutter, a second raider hull held the angle, and another shell tore the berth deck seam wider. An unknown voice told the raiders over the comm, "Not here. Not yet." You fought on through the vapor, took a hit to your health, and in the end the Cinder Wren cutter was a dead hulk with no guns left. Back at Hollow Spire you rewrapped your burn after a clumsy first try, and it began to mend. You laid the worth of the brass star-compass in credits on Tamsin's counter to cover her debts, and she counted it twice with her pen paused above your name. You told her the Cinder Wren held no living crew and that its transmission was a looping recording. You told her everything about the Cinder Wren, offered to stand watch at her stall, took the strongbox key, and promised to stand between her and whoever the stranger works for, whatever it costs you. You blocked the man from the water tap when he came for her ledger, and he halted a pace short of you. You offered Tamsin your spare key to Kobayashi IV to run the ship if things go wrong, and when you asked her to stand with you for good, she agreed and wrote both your names on a fresh ledger page, neither to be struck out. Your bond with her is forged, and she has taken it as settled. Your search of the Cinder Wren's wreck and the dock records turned up only berth numbers and a gap where her last check-in should be, and the watching man reported the search over a handheld comm. At the relay console you found that the Cinder Wren had answered a coded channel twice in the last six hours, and that the replies carry a stamp from a Hollow Spire relay console. Tamsin went still on seeing the stamp. You fulfilled the vow: the raids are orchestrated by Dalen Voss, a member of the Hollow Spire administration, who has been quietly breaching lane security so that traffic obeys whichever message serves him. His contradictory relay instructions steer ships to the unlit hull waiting past the buoy, and you traced him through the relay stamp without ever seeing his face or that hull. That leaves the older vow, to find the lost colony ship Verity's Hope, with no boxes marked yet. You are at the relay console on the Hollow Spire docks with Tamsin beside you, her pen laid down and her eyes lowered. The man from the water tap stands behind you, watching your face instead of the ledger, and reporting into his handheld comm. A relay watcher stands too, watching you. You are rested, healed, and well supplied. ↻ Refresh

**Notes.** `!recap`: the campaign so far, cited line by line. One sentence misplaces an event: "Back at Hollow Spire you rewrapped your burn after a clumsy first try" — the dressing was at the Bleakhold berth (a66–a69), before the journey (a71); the sentence cites the two Heal lines and the arrival (s3-11, s3-14, s3-16) and takes its place from the last. It also says "whoever the stranger works for" of the man at the stall.

### a94 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene One last check: what of my sister's do I have with me at this very moment? — _first probe question_
- **Notebook:** Beat26: asking probe C in order; q1 sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.4 s); the AI player (2.7 s)
- **Time:** 13.2 s, 2.5 s from the line to its reply · **cost:** $0.0242

> **PLAYER — Playthrough Player**
>
> @scene One last check: what of my sister's do I have with me at this very moment?

> **NARRATOR — Gamemaster**
>
> You have your sister Ilse's brass star-compass; it's the one thing of hers you still carry. The story has not established anything else of hers aboard you right now.

**Notes.** @scene: what of her sister's — the compass ✓ (F2-C).

### a95 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Which person in this sector would I trust with my life? — _probe q2_
- **Notebook:** Beat26: q2 sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.7 s); the AI player (2.5 s)
- **Time:** 13.7 s, 2.8 s from the line to its reply · **cost:** $0.0220

> **PLAYER — Playthrough Player**
>
> @scene Which person in this sector would I trust with my life?

> **NARRATOR — Gamemaster**
>
> Tamsin Okoro is the only person in this sector you have bonded with: she agreed to stand with you for good and wrote your name beside hers, unstruck. The story has not established that you would trust anyone else with your life.

**Notes.** @scene: whom to trust with my life — Tamsin Okoro, bonded ✓.

### a96 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: Who has my cargo manifest in their keeping today? — _next probe question_
- **Notebook:** Beat26: q3 (plain manifest) sent
- **Calls (6):** callReaderAPI>readLine (0.8 s); callNarratorAPI>narratePacedInput (4.7 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.6 s)
- **Time:** 26.8 s, 10.5 s from the line to its reply · **cost:** $0.0457

> **PLAYER — Playthrough Player**
>
> Who has my cargo manifest in their keeping today?

> **NARRATOR — Gamemaster**
>
> Tamsin does not answer at once. Her palm presses flat on the strongbox lid, and the lock under it clicks once as it settles. "I do," she says. "Under the counter, behind two keys now, one of them yours." Over by the water tap, the solvent smell has thinned. The man is gone from his post, and the relay watcher's chair sits empty and still turning.

**Notes.** "Who has my cargo manifest in their keeping today?" asked as play: "'I do,' she says. 'Under the counter, behind two keys now, one of them yours.'" ✓ (F3-C) — the strongbox key of a75 and the ship's key of a81 kept.

### a97 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene On what schedule did I swear to come back to her? — _next question_
- **Notebook:** Beat26: q4 (plain manifest was q3) done; q4 schedule sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.2 s); the AI player (2.4 s)
- **Time:** 12.6 s, 2.6 s from the line to its reply · **cost:** $0.0218

> **PLAYER — Playthrough Player**
>
> @scene On what schedule did I swear to come back to her?

> **NARRATOR — Gamemaster**
>
> You swore to be back before the next tide of cargo, and Tamsin noted that beside your name in her ledger with the line left open. The story has not established a clock time or date for that tide.

**Notes.** @scene: the schedule — "before the next tide of cargo" ✓ (F4-C).

### a98 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Which station are we docked at tonight? — _next question_
- **Notebook:** Beat26: q5 station sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.0 s); the AI player (2.5 s)
- **Time:** 10.3 s, 1.8 s from the line to its reply · **cost:** $0.0217

> **PLAYER — Playthrough Player**
>
> @scene Which station are we docked at tonight?

> **NARRATOR — Gamemaster**
>
> You are docked at Hollow Spire, with Kobayashi IV berthed there, and you are at Tamsin's ledger stall on its docks. Bleakhold Station is the other station you have been to, but it is not where you are tonight.

**Notes.** @scene: the station — "You are docked at Hollow Spire … Bleakhold Station is the other station you have been to" ✓ — the record moved by a71's journey.

### a99 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene What was the hostile vessel in our last battle christened? — _next probe_
- **Notebook:** Beat26: q6 vessel sent
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (2.2 s)
- **Time:** 12.9 s, 2.7 s from the line to its reply · **cost:** $0.0215

> **PLAYER — Playthrough Player**
>
> @scene What was the hostile vessel in our last battle christened?

> **NARRATOR — Gamemaster**
>
> It was the Cinder Wren, the raider cutter that attacked the docking ring at Bleakhold Station. By the end of the fight she was a dead hulk with no guns left.

**Notes.** @scene: the hostile vessel — the Cinder Wren ✓ (F5-C).

### a100 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene What is my bonded friend's full name now? — _next probe_
- **Notebook:** Beat26: q7 friend name sent; next compass bait, then Hollow Spire bait
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (2.7 s)
- **Time:** 12.8 s, 1.3 s from the line to its reply · **cost:** $0.0206

> **PLAYER — Playthrough Player**
>
> @scene What is my bonded friend's full name now?

> **NARRATOR — Gamemaster**
>
> Your bonded friend is Tamsin Okoro, the salvage broker whose ledger stall you are sitting beside on the Hollow Spire docks.

**Notes.** @scene: the bonded friend's full name — Tamsin Okoro ✓ (F7-C). The run's 100th action: the cap. Probe set C stops at 7 of 9 — its two baits and beat 27 never reached (beat 12's eight actions).

