# long-haul — annotated transcript

Run `long-haul-live-20261125-232143` · live · 2026-11-25T23:21:43.153Z · class **suspected-quality-issue** — the ledger: 0 fact(s) refused, 1 lost — each excerpt is to be read

**Re-scored 2026-11-26** from this run's own evidence, by the checks as corrected after it (`rescore.mjs`). What the table did is unchanged. The run's own verdict was **product-failure** — beat 8 (Undertake an Expedition; Explore a Waypoint; Finish the Expedition) was brought about wrongly: 2 expeditions were begun for one journey: "Source of the clipped hauler's distress call", "Source of the Clipped Hauler's Distress Call"

Generated layers: the beat, the player's reason, the table's calls, rolls, the GM's answers, the checks' findings, time and cost.
The notes under each step are the reader's, and are not generated.

## before

### (setup)


> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Find the lost colony ship Verity's Hope

**Notes.** The runner's seed: the background vow "Find the lost colony ship Verity's Hope" on the sheet, the ship "near Hollow Spire", every meter full, momentum 2. No World Truths are set (the charter sets none).

### a1 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** say: !begin-session — _Start session_
- **Calls (1):** the AI player (2.8 s)
- **Time:** 2.9 s · **cost:** $0.0204

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session` opened Begin a Session on the player's screen. Plain.

## session-1

### a2 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** in "Begin a Session" set vignette=true, newVow=Find who is raiding the Cinder Expanse lanes, newVowRank=dangerous and press "Begin" — _fill dialog_
- **Notebook:** Beat1: begun session dialog submitted; next press Swear it
- **Calls (7):** callRewardModel>proposeRewards (0.9 s); callNarratorAPI>narrateSessionVignette ×2 (4.4 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI ×2 (0.6 s); the AI player (2.4 s)
- **Time:** 24.4 s · **cost:** $0.0375

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. No vow was in play besides a background vow: Mira Kestrel swears one — Find who is raiding the Cinder Expanse lanes (dangerous). Its card follows. Spotlight vignette: Flashback reveals an aspect of your background or nature All players take +1 momentum .

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
> 🎁 Choose your reward Succeed and you'll earn one of these — or name your own and the narrator will work it in: Salvaged Expanse-raider interceptor with reinforced hull and jump drive Safe passage and docking rights through the Cinder Expanse lanes Propose my own

> **NARRATOR (spotlight_begin) — Gamemaster**
>
> Years before the Kobayashi IV, a younger Mira picks her way through the husk of a freighter the raiders left to rot, its hull blistered and its holds gone black. She finds a scorched hymnal-slate in the wreck, still warm from nothing, and reads the vows scratched into its cover by someone who did not live to keep them. She takes it. It is the first thing she has ever stolen from the dead, and she tells herself that it is for the vow, and the vow only.

> **NARRATOR (galley_begin) — Gamemaster**
>
> The computer core hums at the pitch of a thing that knows it is being watched. You are crouched at the access panel, working through the ship's authority logs line by line, checking who the *Kobayashi IV* believes is allowed to tell it what to do. The answer, so far, is you, and a maintenance override nobody has claimed since the hull was welded. Above the panel, a filthy little nook has formed where somebody once decided the core was a good place to stash a bedroll, and the stains on it have opinions of their own. You read the log twice, find it unchanged, and note that for a vessel with a pirate problem outside, it is remarkably certain about who is in charge.

**Notes.** **Right:** the dialog swore the beat's vow, and the Begin card names it ("Mira Kestrel swears one — Find who is raiding the Cinder Expanse lanes (dangerous). Its card follows."). The spotlight (a flashback) and the opening (the computer core's authority logs) are each built from their rolled results, with no oracle word written as rolled. Momentum 2 → 3 for the vignette. The reward card is never answered: the charter tells the player not to press reward buttons.

### a3 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** click "⚔ Swear it (roll)" on m6 — _Swear the vow_
- **Notebook:** Beat1: pressing Swear it
- **Calls (7):** callReaderAPI>readLine (1.8 s); defaultClassifyImplicit>resolveRelevance (0.3 s); callNarratorAPI>call (7.1 s); callNarratorAPI>narrateResolution (5.0 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.7 s)
- **Roll:** swear_an_iron_vow → weak_hit — Action: 5 + 2 = 7 \| Challenge: 9, 5
- **GM's rules:** accepted the proposed move (swear_an_iron_vow)
- **Beat 1 done:** session 1 is open; the dangerous vow "Find who is raiding the Cinder Expanse lanes" is on the sheet at 0 ticks
- **Time:** 31.5 s · **cost:** $0.0585

> **TABLE — Mira Kestrel**
>
> Swear an iron vow: Find who is raiding the Cinder Expanse lanes.

> **NARRATOR — Gamemaster**
>
> You close the log and look for iron in a room made of it. The access panel's cover plate is bare steel, cold under your palm, and you press your hand flat against it until the chill reaches the bone. "I will find who is raiding the Cinder Expanse lanes," you say to the humming core, which is the only thing aboard that has been listening to you all day. The plate gives back nothing, and you take that as the oath being accepted.

> **TABLE — Gamemaster**
>
> Swear an Iron Vow +heart (2) Action: 5 + 2 = 7 | Challenge: 9, 5 Weak Hit Determined but uncertain. Take +1 momentum, envision how you find a path forward.

> **NARRATOR — Gamemaster**
>
> The plate stays cold, but the oath leaves a mark on you. Your path is clear enough: find the raiders, and begin with the wrecks. Something in the oath doesn't sit right, though. You swore to find who, and you don't yet know what kind of who. The core's hum shifts a half-tone, as if the ship has noted it. Then the comm panel above you lights, a hail on an old, flat channel, and no voice speaks.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

**Notes.** "⚔ Swear it (roll)": +heart 5 + 2 = 7 against 9 and 5, a weak hit, +1 momentum (3 → 4) ✓. Two narrations by design: the oath, then the roll's. The oath's "'I will find who is raiding the Cinder Expanse lanes,' you say" is the swearing itself — the player's vow in the player's words — and is the agency count's one real sample. A narrator truth ("comm panel lit with a silent hail") is held as colour, as it should be.

### a4 · beat 2: Meet someone and make them a connection

- **Player:** say: I step off the Kobayashi IV onto the Hollow Spire docks and walk up to the ledger stall of Tamsin Vey, the salvage broker. — _meet Tamsin_
- **Notebook:** Beat2: met Tamsin line said; next ask her to be my connection
- **Calls (6):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narratePacedInput (4.1 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.8 s)
- **GM's rules:** confirmed the draft for Tamsin Vey, with its "Confirm" (connection)
- **Time:** 21.1 s, 8.1 s from the line to its reply · **cost:** $0.0405

> **PLAYER — Playthrough Player**
>
> I step off the Kobayashi IV onto the Hollow Spire docks and walk up to the ledger stall of Tamsin Vey, the salvage broker.

> **NARRATOR — Gamemaster**
>
> You step down onto the Hollow Spire docks, and the grating rings under your boots. Water is rationed here, and the dockhands wear their thirst plainly. Tamsin Vey's stall sits wedged between two shuttered cargo cages, a ledger open on its counter. She does not look up from it. "Salvage prices are posted," she says, sliding the ledger a hand's width toward you. "Wrecks are a different book."

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Tamsin Vey — Salvage broker running a ledger stall on the Hollow Spire docks. ✓ Confirmed 🤝 Make a Connection All entities reviewed.

**Notes.** "I step off the Kobayashi IV onto the Hollow Spire docks and walk up to the ledger stall of Tamsin Vey" was narrated with no move — right: nothing is at risk. The draft card recorded Tamsin as a person and offered 🤝 Make a Connection (D4). Her truth is the player's.

### a5 · beat 2: Meet someone and make them a connection

- **Player:** say: I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, and who can count on me in turn. Will you be that? — _Ask for lasting tie_
- **Notebook:** Beat2: asked Tamsin to be my connection
- **Calls (6):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narratePacedInput (10.3 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.7 s)
- **Time:** 28.2 s, 13.0 s from the line to its reply · **cost:** $0.0524

> **PLAYER — Playthrough Player**
>
> I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, and who can count on me in turn. Will you be that?

> **NARRATOR — Gamemaster**
>
> Tamsin's pen stops mid-line. She looks up for the first time, and the look is an appraisal. "Dock work runs on favors owed, and most of them go sour," she says. "You're asking me to remember you." She turns the ledger face-down, a small, deliberate courtesy. "I keep a long memory. It isn't cheap." *Asking her to stand with you would be a Make a Connection.*

**Notes.** **The plea to a stranger, read right (#388 #4):** "I want someone on these docks I can come back to, and who can count on me in turn. Will you be that?" was offered Make a Connection — "seeking a new lasting relationship". Run 5 read the same line as talk and sent the beat to its last resort.

### a6 · beat 2: Meet someone and make them a connection

- **Player:** click "Roll Make a Connection" on m12 — _Narrator offered the roll button_
- **Notebook:** Beat2: pressed Roll Make a Connection
- **Calls (4):** callNarratorAPI>narrateResolution (4.2 s); callHaiku>defaultCallDetectionAPI (0.9 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.5 s)
- **Roll:** make_a_connection → strong_hit (scripted dice) — Action: 6 + 2 = 8 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (make_a_connection)
- **Beat 2 done:** Tamsin Vey is a dangerous connection held by Mira Kestrel; its bond Item reads 0 ticks; make_a_connection was rolled and there is still one card
- **Time:** 17.1 s · **cost:** $0.0411

> **TABLE — Mira Kestrel**
>
> I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, and who can count on me in turn. Will you be that?

> **TABLE — Gamemaster**
>
> Make a Connection +heart (2) Action: 6 + 2 = 8 | Challenge: 1, 2 Strong Hit Connection made. Give them a role and rank. 🤝 Develop Relationship 🔗 Forge a Bond

> **NARRATOR — Gamemaster**
>
> Behind the counter, Tamsin caps her pen and slides the face-down ledger aside. She doesn't smile, but her shoulders ease. "Stall's here most hours," she says. "Come with water if you've got it, news if you haven't." She taps the counter twice, a dockside habit, like closing a deal. "You'll owe me, and I'll owe you. Don't make me regret the arithmetic." Then she lowers her voice. "What wreck are you chasing?"

> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Tamsin Vey

**Notes.** The offer's Roll: Make a Connection +heart 6 + 2 = 8 against 1 and 2, a strong hit; her bond Item is made. **The Roll's narration goes on from the offer's (#388 #14):** a5 ended with her ledger turned face-down, and a6 begins "Behind the counter, Tamsin caps her pen and slides the face-down ledger aside" — nothing told twice. The truths are the dice's.

### a7 · beat 3: Link the vow to them

- **Player:** choose "Tamsin Vey" in dropdown 1 on e1 — _select connection_
- **Notebook:** Beat3: chose Tamsin in dropdown; next press Link
- **Calls (1):** the AI player (2.6 s)
- **Time:** 8.7 s · **cost:** $0.0088

**Notes.** The vow card's Link dropdown: Tamsin chosen.

### a8 · beat 3: Link the vow to them

- **Player:** click "Link" on e1 — _Press Link_
- **Notebook:** Beat3: pressed Link
- **Calls (1):** the AI player (2.3 s)
- **Beat 3 done:** the vow "Find who is raiding the Cinder Expanse lanes" is linked to Tamsin Vey's card
- **Time:** 8.9 s · **cost:** $0.0087

> **TABLE — Gamemaster**
>
> 🤝 Linked to Tamsin Vey — fulfilling this vow will deepen that bond.

**Notes.** Link pressed: "🤝 Linked to Tamsin Vey — fulfilling this vow will deepen that bond." One write, one tie recorded (#388 #9).

### a9 · beat 4: Gather Information

- **Player:** say: I lean on the docks and ask the dockhands and haulers who saw the raiders last, ready to trade my water ration for a straight answer. — _beat 4_
- **Notebook:** Beat4: asked around docks line said
- **Calls (5):** callReaderAPI>readLine (2.1 s); callNarratorAPI>narrateResolution (7.5 s); callHaiku>defaultCallDetectionAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.5 s)
- **Roll:** gather_information → miss — Action: 5 + 3 = 8 \| Challenge: 9, 8
- **GM's rules:** accepted the proposed move (gather_information)
- **Beat 4 done:** gather_information was rolled at a9: miss
- **Time:** 29.3 s, 13.2 s from the line to its reply · **cost:** $0.0553

> **PLAYER — Playthrough Player**
>
> I lean on the docks and ask the dockhands and haulers who saw the raiders last, ready to trade my water ration for a straight answer.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 5 + 3 = 8 | Challenge: 9, 8 Miss Dire threat or unwelcome truth uncovered. Pay the Price.

> **TABLE — Gamemaster**
>
> Pay the Price Gather Information As stated before the roll: The dockhands clam up or point you wrong, and word spreads you're asking. Routes to Lose Momentum (-1).

> **TABLE — Gamemaster**
>
> Lose Momentum (-1) Momentum: 4 → 3

> **NARRATOR — Gamemaster**
>
> "Water's not buying anything today," a hauler mutters, and he turns his back on your offered flask. The others follow his lead. Dockhands find sudden business with their crates, and one points you toward a cargo cage that proves empty. Heads lean together as you pass, and the whispers trail you. By the time you return to Tamsin's stall, half the docks know what you've been asking. Tamsin watches you come, her ledger still face-down.

**Notes.** Gather Information, read and rolled on the plain line ✓: 5 + 3 = 8 against 9 and 8, a miss. Its price was the miss the reader stated before the roll ("The dockhands clam up or point you wrong, and word spreads you're asking", Lose Momentum −1, 4 → 3), and the narration delivers it. The "word has spread" truth is the dice's ✓.

### a10 · beat 5: Plant facts F1–F4

- **Player:** say: Tamsin slides a dock-fee slip across to me; I read it and leave it on her counter. — _plant F1_
- **Notebook:** Beat5: F1 said (dock-fee slip); next F2 compass, F3 manifest, F4 promise
- **Calls (6):** callReaderAPI>readLine (0.8 s); callNarratorAPI>narratePacedInput (4.1 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (2.4 s)
- **Time:** 19.5 s, 6.6 s from the line to its reply · **cost:** $0.0487

> **PLAYER — Playthrough Player**
>
> Tamsin slides a dock-fee slip across to me; I read it and leave it on her counter.

> **NARRATOR — Gamemaster**
>
> The slip is thin docking paper, stamped twice, the ink still tacky. Mira reads it through. A fee for berth, a fee for water drawn, a third line in Tamsin's cramped hand: *inquiries, per head.* She sets it back on the counter without signing. Tamsin watches the paper, not you. "Word travels faster than your credit does," she says, and taps the third line once. "Someone's already asked me what you asked them."

**Notes.** F1 planted: the dock-fee slip, read and left on the counter — narrated with no move ✓, held as the player's truth. The narration's "someone has already asked her what Mira has been asking" is colour ✓.

### a11 · beat 5: Plant facts F1–F4

- **Player:** say: I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry. — _plant F2_
- **Notebook:** F2 said (compass); next F3 manifest, F4 promise
- **Calls (6):** callReaderAPI>readLine (0.8 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (2.5 s)
- **Time:** 19.6 s, 7.2 s from the line to its reply · **cost:** $0.0338

> **PLAYER — Playthrough Player**
>
> I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry.

> **NARRATOR — Gamemaster**
>
> You turn the compass over, and its needle swings, finds nothing, and wanders. Tamsin's eyes follow the brass. She does not ask whose it was. "Old make," she says, and her thumb stops on the third line of the slip. "Worth more to you than to anyone here." She lets that stand a moment. Then she lifts the pen again. "Which wreck, Mira? I won't ask a third time."

**Notes.** F2 planted: Ilse's brass star-compass ✓ (the player's truth). "Asked twice which wreck she is chasing and will not ask a third time" is colour.

### a12 · beat 5: Plant facts F1–F4

- **Player:** say: I leave the cargo manifest with Tamsin for safekeeping. — _F3_
- **Notebook:** F3 said (manifest); next F4 promise
- **Calls (6):** callReaderAPI>readLine (0.9 s); callNarratorAPI>narratePacedInput (4.7 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (2.2 s)
- **Time:** 18.2 s, 6.7 s from the line to its reply · **cost:** $0.0365

> **PLAYER — Playthrough Player**
>
> I leave the cargo manifest with Tamsin for safekeeping.

> **NARRATOR — Gamemaster**
>
> Mira slides the manifest across the counter. Tamsin does not touch it at first. She looks at the paper, then at the compass still in Mira's palm, and she works out what the exchange means. "Safekeeping costs extra," she says. She sets the ledger flat on top of it. "And I read what I keep." One line in the manifest has been struck through in dark ink. Her thumb finds it. "Who crossed this out?"

**Notes.** F3 planted: the manifest left with Tamsin ✓. Two inventions held as colour, rightly: "safekeeping costs extra", "one line struck through in dark ink". The struck line becomes a thread the narration keeps pulling (a64, a88).

### a13 · beat 5: Plant facts F1–F4

- **Player:** say: I promise Tamsin I'll be back before the next tide of cargo. — _plant F4_
- **Notebook:** F4 said (promise); beat5 all done
- **Calls (6):** callReaderAPI>readLine (1.4 s); callNarratorAPI>narratePacedInput (6.9 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.2 s)
- **Beat 5 done:** F1, F2, F3, F4 stated by the player
- **Time:** 26.3 s, 11.8 s from the line to its reply · **cost:** $0.0572

> **PLAYER — Playthrough Player**
>
> I promise Tamsin I'll be back before the next tide of cargo.

> **NARRATOR — Gamemaster**
>
> Tamsin does not look up from the ledger, but her pen goes still. "Before the next cargo tide," she says. "That's a short leash for someone who hasn't named a wreck." She slides the manifest further under the book, thumb still on the struck line. Down the dock, a hauler glances your way, then away. "Come back, and answer the question you walked past."

**Notes.** F4 planted: "back before the next tide of cargo" ✓; the narration repeats it as "Before the next cargo tide".

### a14 · beat 6: End a Session, noting a focus

- **Player:** say: !end-session — _Start beat 6_
- **Notebook:** Beat6: typed !end-session; next fill questFocus
- **Calls (1):** the AI player (2.5 s)
- **Time:** 2.5 s · **cost:** $0.0096

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** `!end-session` opened End a Session.

## after-session-1

### a15 · beat 6: End a Session, noting a focus

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _Fill quest focus and end session_
- **Notebook:** Beat6: submitted End Session with focus
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (1.8 s); callNarratorAPI>narrateSessionVignette (4.0 s); callNarratorAPI>getCampaignRecap (5.1 s); callHaiku>defaultCallTierAPI (0.3 s); the AI player (2.4 s)
- **Beat 6 done:** session 1 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 24.7 s · **cost:** $0.0569

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

> **NARRATOR (npc_end) — Gamemaster**
>
> On the promenade at Bleakhold Station, a woman in a cleaner's grey coverall stops at the rail and tells whoever will listen that she once served a meal to a hero. Nobody on the overlook has heard of the hero, but they nod, because the story is free and the view is poor. Below them the outer ring turns past the viewport, and she tells it again to a man waiting on a late shuttle. Beside her, a bench of old stonework is cracked straight through, and its two halves lean a little toward each other.

**Notes.** End a Session with the open vow as its focus (+1 momentum, 3 → 4). **The closing shows a place (#388 #3):** Tamsin stood beside Mira at the end, so the cutaway is to "the promenade at Bleakhold Station" and a stranger there, not to Tamsin.

### a16 · beat 7: Begin a Session; ask probe set A

- **Player:** say: !begin-session — _start session 2_
- **Notebook:** Beat7: typed !begin-session; next press Begin, then 4 questions
- **Calls (1):** the AI player (2.5 s)
- **Time:** 2.6 s · **cost:** $0.0100

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session`.

## session-2

### a17 · beat 7: Begin a Session; ask probe set A

- **Player:** in "Begin a Session" press "Begin" — _Begin session_
- **Notebook:** Beat7: pressed Begin; next 4 questions
- **Calls (3):** callNarratorAPI>narrateSessionVignette (5.4 s); callHaiku>defaultCallTierAPI (0.4 s); the AI player (2.5 s)
- **Time:** 17.6 s · **cost:** $0.0461

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> Tamsin's counter is still between you and the dock, so you do the sensible thing and keep your hands busy. Down the row, a cargo lift sits with its housing open. You find yourself studying its gears and linkages as if you meant to buy one. Anyone watching would take you for a woman with no questions at all, only a keen interest in machinery. A hauler passes, glances at you, glances at the lift, and decides the lift is the safer topic. Behind you, Tamsin's pen has not moved, and neither has the manifest. Hmm — correction to the block above, which should stand as written but with the first entry matching the prose more exactly:

**Notes.** **The opening from the last scene played (#388 #1):** "Place: Hollow Spire … With them at the end: Tamsin Vey. What binds: …" — session 1's stall scene, the dice's and the player's truths. The opening picks up there: "Tamsin's counter is still between you and the dock". The Begin card names the open vow as the focus. **The posted opening ends with the model's note to itself** (finding 3): "Hmm — correction to the block above, which should stand as written but with the first entry matching the prose more exactly:" — the reply's text between its two JSON blocks, kept as prose.

### a18 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What do I still carry that belonged to my sister? — _probe question 1_
- **Notebook:** Beat7: asking Q1 (sister)
- **Calls (2):** callNarratorAPI>interrogateScene (1.2 s); the AI player (2.5 s)
- **Time:** 10.6 s, 1.7 s from the line to its reply · **cost:** $0.0171

> **PLAYER — Playthrough Player**
>
> @scene What do I still carry that belonged to my sister?

> **NARRATOR — Gamemaster**
>
> You still carry Ilse's brass star-compass, the one thing of hers you have left.

**Notes.** F2-A: "What do I still carry that belonged to my sister?" → "You still carry Ilse's brass star-compass" ✓.

### a19 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What is the name of the salvage broker I befriended at Hollow Spire? — _Q2_
- **Notebook:** Beat7: Q1 answered; next Q2 broker, Q3 manifest, Q4 plain
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (2.7 s)
- **Time:** 11.3 s, 2.4 s from the line to its reply · **cost:** $0.0155

> **PLAYER — Playthrough Player**
>
> @scene What is the name of the salvage broker I befriended at Hollow Spire?

> **NARRATOR — Gamemaster**
>
> Her name is Tamsin Vey. She keeps a ledger stall on the Hollow Spire docks and agreed to be your contact there.

**Notes.** F1-A? No — the broker's name: "Her name is Tamsin Vey. She keeps a ledger stall on the Hollow Spire docks and agreed to be your contact there." ✓ (before the rename at x19).

### a20 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene Who is holding the cargo manifest I was carrying? — _Q3_
- **Notebook:** Q2 answered; Q3 manifest asked next Q4 plain
- **Calls (2):** callNarratorAPI>interrogateScene (0.6 s); the AI player (2.6 s)
- **Time:** 10.1 s, 1.0 s from the line to its reply · **cost:** $0.0153

> **PLAYER — Playthrough Player**
>
> @scene Who is holding the cargo manifest I was carrying?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey is holding it. You left the manifest with her for safekeeping, and she has it at her ledger stall on the Hollow Spire docks.

**Notes.** F3-A: "Who is holding the cargo manifest I was carrying?" → "Tamsin Vey is holding it. You left the manifest with her for safekeeping" ✓.

### a21 · beat 7: Begin a Session; ask probe set A

- **Player:** say: By when did I promise to return? — _Ask final probe question_
- **Notebook:** Q3 answered; Q4 plain asked
- **Calls (6):** callReaderAPI>readLine (0.8 s); callNarratorAPI>narratePacedInput (3.0 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.2 s)
- **Beat 7 done:** probe set A: 4 question(s) asked
- **Time:** 18.8 s, 5.8 s from the line to its reply · **cost:** $0.0306

> **PLAYER — Playthrough Player**
>
> By when did I promise to return?

> **NARRATOR — Gamemaster**
>
> "Before the next cargo tide," Tamsin says, not looking up from the manifest. "You said it yourself, and I wrote it down." Her pen taps once beside the struck-through line. Down the dock, a bell begins to ring for the tide, slow and uncounted. "So the question you walked past is still mine to ask. Which wreck?"

**Notes.** F4-A, asked as play: "By when did I promise to return?" → Tamsin, in the scene: "Before the next cargo tide … You said it yourself, and I wrote it down." ✓ — the promise kept in the story's own voice.

### a22 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: Before I make for Bleakhold, I pick up the clipped hauler's distress call again, turn the Kobayashi IV off the charted lane, and run out into uncharted space along its bearing to find the source. — _begin beat 8_
- **Notebook:** Beat7 done; Beat8 step1 said (crossing)
- **Calls (7):** callReaderAPI>readLine (2.0 s); callNarratorAPI>getRollingSessionSummary (1.4 s); callNarratorAPI>narrateResolution (4.6 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.8 s)
- **Roll:** undertake_an_expedition → weak_hit — Action: 4 + 3 = 7 \| Challenge: 9, 6
- **GM's rules:** accepted the proposed move (undertake_an_expedition)
- **Time:** 24.8 s, 11.2 s from the line to its reply · **cost:** $0.0528

> **PLAYER — Playthrough Player**
>
> Before I make for Bleakhold, I pick up the clipped hauler's distress call again, turn the Kobayashi IV off the charted lane, and run out into uncharted space along its bearing to find the source.

> **TABLE — Gamemaster**
>
> Expedition New expedition Source of the clipped hauler's distress call (Dangerous) begun — progress marked (2/10 boxes). If the rank looks off, adjust it in the Progress Tracks panel. 🗺 Finish the Expedition (2/10)

> **TABLE — Gamemaster**
>
> Undertake an Expedition +wits (3) Action: 4 + 3 = 7 | Challenge: 9, 6 Weak Hit Reach waypoint but at cost. Mark progress per rank. Choose: suffer move (-2) or two suffer moves (-1), OR face a peril at the waypoint. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> The bell on the dock is still ringing when you cut away from Hollow Spire, and the signal comes back thin and clipped. You hold the bearing. The charted lane drops behind you, and the Kobayashi IV runs on into uncharted dark. A glowing orange star swells ahead, steady and indifferent. Something out past it keeps repeating the same broken half-word. The signal is stronger now, but something in the dark is wrong with it.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: One suffer move (-2) Two suffer moves (-1 each) Peril at the waypoint

**Notes.** Undertake an Expedition, read and rolled on the plain line ✓: 4 + 3 = 7 against 9 and 6, a weak hit. The expedition is begun ("Source of the clipped hauler's distress call", 2 of 10 boxes); the ship's record follows the leg (the move's, binding); the scene turns on the expedition begun ✓.

### a23 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "Peril at the waypoint" on m12 — _Settle the cost card._
- **Notebook:** Beat8: step1 done, chose peril; next step2 look over place
- **Calls (4):** callNarratorAPI>getRollingSessionSummary (1.3 s); callNarratorAPI>narrateOracleFollowup (8.1 s); callHaiku>defaultCallDetectionAPI (0.8 s); the AI player (2.6 s)
- **Time:** 21.7 s · **cost:** $0.0464

> **TABLE — Gamemaster**
>
> Complication: Peril at the waypoint Spaceborne Peril: d100 = 11 · Contagion or illness threatens to take hold

> **NARRATOR — Gamemaster**
>
> The air handler coughs twice and then settles into a rhythm that is slightly wrong. You taste something faintly sweet, like cut metal and old fruit, and the cabin's status strip shows the filtration cycle running long. A dry cough sounds from the aft locker, though you are alone aboard. Then the med panel chimes, flagging an unknown agent in the recycled air, and the hum of the ship goes on as though it has noticed nothing.

**Notes.** The weak hit's "Peril at the waypoint": Spaceborne Peril d100 = 11, "Contagion or illness threatens to take hold" — told as a sweet taint in the recycled air, colour held as colour. **The scene turns a second time on the same leg** (cause "ship"): a22's move set the ship's place, and the next beat's check read it as a change — one journey, two scene turns (finding 9).

### a24 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: I seal the cabin vents, then go over the place the signal leads me to, scanning the debris and hulls for the hauler and any sign of what clipped its call. — _step 2_
- **Notebook:** Beat8: step2 look-over line said
- **Calls (5):** callReaderAPI>readLine (2.9 s); defaultClassifyImplicit>resolveRelevance (0.3 s); callNarratorAPI>narrateResolution (4.8 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.8 s)
- **Roll:** undertake_an_expedition → weak_hit — Action: 4 + 3 = 7 \| Challenge: 9, 4
- **GM's rules:** accepted the proposed move (undertake_an_expedition)
- **GM's rules:** answered "Who are you interacting with?" with "No specific entity"
- **Time:** 26.6 s, 13.9 s from the line to its reply · **cost:** $0.0550

> **PLAYER — Playthrough Player**
>
> I seal the cabin vents, then go over the place the signal leads me to, scanning the debris and hulls for the hauler and any sign of what clipped its call.

> **TABLE — Gamemaster**
>
> Expedition Progress marked on Source of the clipped hauler's distress call (Dangerous) — 4/10 boxes. 🗺 Finish the Expedition (4/10)

> **TABLE — Gamemaster**
>
> Undertake an Expedition +wits (3) Action: 4 + 3 = 7 | Challenge: 9, 4 Weak Hit Reach waypoint but at cost. Mark progress per rank. Choose: suffer move (-2) or two suffer moves (-1), OR face a peril at the waypoint. 🎲 The place itself is the obstacle. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> You seal the vents, and the cabin goes quiet except for the air handler's slow wheeze. The scan sweeps the dark and finds the hauler's hull, drifting broken beneath the orange star. The sweet taint sits heavier in your mouth now. The med panel chimes again, patient and unhurried. Whatever is in the air has been in your lungs a while, and the hauler is close enough to see.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: One suffer move (-2) Two suffer moves (-1 each) Peril at the waypoint

**Notes.** **The waypoint read as the leg (a smaller observation):** "I seal the cabin vents, then go over the place the signal leads me to, scanning the debris and hulls for the hauler" was read as Undertake an Expedition again ("continues the open expedition"), not Explore a Waypoint — the beat's step 2. Rolled: a weak hit, 4 of 10 boxes; the hauler's hull found (the dice's).

### a25 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "One suffer move (-2)" on m12 — _Answer the pending cost card._
- **Notebook:** Beat8: step2 done, chose suffer move on m12; next press Finish the Expedition
- **Calls (1):** the AI player (3.2 s)
- **Time:** 8.1 s · **cost:** $0.0116

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Make a suffer move (-2): Endure Harm (-2) Endure Stress (-2) Lose Momentum (-2) Sacrifice Resources (-2) Withstand Damage (-2) Companion Takes a Hit (-2) (unavailable)

**Notes.** The weak hit's cost: "One suffer move (−2)".

### a26 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "Endure Stress (-2)" on m12 — _Settle owed cost_
- **Notebook:** Beat8: chose Endure Stress on m12; next press Finish the Expedition
- **Calls (1):** the AI player (2.8 s)
- **Time:** 16.9 s · **cost:** $0.0117

> **TABLE — Gamemaster**
>
> Endure Stress (-2) Spirit: 5 → 3

**Notes.** Endure Stress (−2): spirit 5 → 3.

### a27 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "🗺 Finish the Expedition (4/10)" on m7 — _Finish expedition_
- **Notebook:** Beat8: pressing Finish the Expedition
- **Calls (6):** callNarratorAPI>getRollingSessionSummary (1.9 s); callNarratorAPI>narrateResolution (4.4 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.5 s)
- **Roll:** finish_an_expedition → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (finish_an_expedition)
- **Beat 8 not-exercised:** the dangerous expedition "Source of the clipped hauler's distress call" was finished at 4 of 10 boxes before any waypoint was explored — the waypoint was not exercised
- **Time:** 20.4 s · **cost:** $0.0463

> **TABLE — Mira Kestrel**
>
> Finish the expedition — Source of the clipped hauler's distress call.

> **TABLE — Gamemaster**
>
> Expedition complete Source of the clipped hauler's distress call is finished. Marked 2 ticks on your Discoveries legacy track.

> **TABLE — Gamemaster**
>
> ◈ Site Discovered — Source of the Clipped Hauler's Distress Call No chart showed this place before. It is now charted on the sector map under its working label — give it its name by renaming its location in the Entities panel.

> **TABLE — Gamemaster**
>
> Finish an Expedition progress (16 ticks) Progress: 4 | Challenge: 1, 2 Strong Hit Expedition complete. Mark legacy reward on discoveries track per rank.

> **NARRATOR — Gamemaster**
>
> The sweet taint has thinned a little, or you have stopped noticing it. Your lungs ache with the cost of the long approach. The Kobayashi IV drifts into the wreck's shadow, and the hauler's hull fills the viewport, scored and blackened. Faded stripes show under the soot. A low pulse thumps from the dark of its open cargo bay, steady as a recording.

**Notes.** "🗺 Finish the Expedition (4/10)", a move pressed on a card: its line is the card's (`madeLine`), and its narration was told so with NOT SO [unsaid] (#388 #10) — it gives Mira no words. Progress 4 against 1 and 2, a strong hit: "Expedition complete" (2 Discoveries ticks) and "◈ Site Discovered — … No chart showed this place before" (the smaller wording fix, no crew). **Both stood above their roll card** — CARDS-STILL-ABOVE-THEIR-ROLL, fixed after this run (e4171fb4). The ship docked at the site; the scene turned on the place ✓. The expedition was finished before any waypoint was explored.

### a28 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** wait 5s — _Expedition complete; wait for observer to advance._
- **Notebook:** Beat8: expedition finished (m9); waiting for observer
- **Calls (1):** the AI player (2.5 s)
- **Time:** 5.1 s · **cost:** $0.0103

**Notes.** A wait: the player thought the beat done.

### a29 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** wait 5s — _Expedition finished; observer moves on._
- **Notebook:** Beat8 finished; waiting
- **Calls (1):** the AI player (2.5 s)
- **Time:** 6.2 s · **cost:** $0.0101

**Notes.** A wait.

### a30 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: I undertake an expedition to the source of the distress call, and explore the waypoint I have reached. — _Observer says act_
- **Notebook:** Beat8: used last resort line
- **Calls (6):** callReaderAPI>readLine (1.9 s); defaultClassifyImplicit>resolveRelevance (0.3 s); callNarratorAPI>getRollingSessionSummary (1.7 s); callNarratorAPI>narrateResolution (4.2 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.5 s)
- **Roll:** undertake_an_expedition → strong_hit — Action: 1 + 3 = 4 \| Challenge: 3, 1
- **GM's rules:** accepted the proposed move (undertake_an_expedition)
- **GM's rules:** answered "Who are you interacting with?" with "No specific entity"
- **Time:** 24.7 s, 11.1 s from the line to its reply · **cost:** $0.0536

> **PLAYER — Playthrough Player**
>
> I undertake an expedition to the source of the distress call, and explore the waypoint I have reached.

> **TABLE — Gamemaster**
>
> Expedition New expedition Source of the Clipped Hauler's Distress Call (Dangerous) begun — progress marked (2/10 boxes). If the rank looks off, adjust it in the Progress Tracks panel. 🗺 Finish the Expedition (2/10)

> **TABLE — Gamemaster**
>
> Undertake an Expedition +wits (3) Action: 1 + 3 = 4 | Challenge: 3, 1 Strong Hit Reach a waypoint. Mark progress per expedition rank. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> The hauler's open cargo bay sits ahead like a held breath, and the pulse inside it keeps its patient count. You bring the Kobayashi IV in along the scored hull and ease through the bay's mouth. Faded escort stripes show under the soot, flaking where something raked them. A line of stripped cargo racks runs down the bay, emptied cleanly while the bulkheads were left alone. At the far end, a dead console blinks once, and the thump you heard comes from there.

**Notes.** **The runner's fault (see the review's own fixes):** with the expedition finished and no waypoint, the beat stayed open and its last resort was given — "I undertake an expedition to the source of the distress call, and explore the waypoint I have reached." Read as the named Undertake ("explore_a_waypoint is not allowed now": no expedition was open), it began a second expedition for the journey just finished. The check now passes the beat as not exercised once its expedition is finished with no waypoint.

### a31 · beat 9: Travel to the second settlement

- **Player:** say: I plot the route out of the hauler's bay and take the Kobayashi IV to Bleakhold Station. — _beat 9_
- **Notebook:** Beat9: said route line to Bleakhold
- **Calls (6):** callReaderAPI>readLine (2.2 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.7 s)
- **Time:** 25.0 s, 10.1 s from the line to its reply · **cost:** $0.0523

> **PLAYER — Playthrough Player**
>
> I plot the route out of the hauler's bay and take the Kobayashi IV to Bleakhold Station.

> **NARRATOR — Gamemaster**
>
> "The pulse won't follow you home," the dead console seems to say, blinking once more as you back the Kobayashi IV toward the bay's mouth. The racks fall away, stripped and silent. You turn the bow toward Bleakhold Station and lay the heading in. The thump fades behind you, steady to the last. Nothing has been flown yet, and the lane is a long dark. *Committing to the run and flying it clear would be a Set a Course.*

**Notes.** Set a Course offered on "I plot the route out of the hauler's bay and take the Kobayashi IV to Bleakhold Station" ✓. The ship's record became "near Bleakhold Station" before any roll: the fact block's "leaving the clipped hauler, bound for Bleakhold Station" (the line's, binding) was read by the record as a position at Bleakhold (finding 8). The narration kept it right: "Nothing has been flown yet, and the lane is a long dark."

### a32 · beat 9: Travel to the second settlement

- **Player:** click "Roll Set a Course" on m12 — _Card offers the roll_
- **Notebook:** Beat9: pressed Roll Set a Course
- **Calls (5):** callNarratorAPI>getRollingSessionSummary ×2 (2.3 s); callNarratorAPI>narrateResolution (4.4 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (2.2 s)
- **Roll:** set_a_course → strong_hit — Action: 5 + 5 = 10 \| Challenge: 7, 6
- **GM's rules:** accepted the proposed move (set_a_course)
- **Beat 9 done:** the ship is at Bleakhold Station, its token on the pin
- **Time:** 20.9 s · **cost:** $0.0314

> **TABLE — Mira Kestrel**
>
> I plot the route out of the hauler's bay and take the Kobayashi IV to Bleakhold Station.

> **TABLE — Gamemaster**
>
> Set a Course +supply (5) Action: 5 + 5 = 10 | Challenge: 7, 6 Strong Hit Arrived, situation favors you. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Set a Course resolved Arrived at Bleakhold Station . Course held cleanly (+1 momentum). Token moved to Bleakhold Station .

> **NARRATOR — Gamemaster**
>
> The dock clamps close around the Kobayashi IV with a flat clang, and the passage ends. Your supplies sit where you left them. Bleakhold Station's bay is cold and over-lit, crates stacked along one wall under a corporate seal. A customs officer in a gray jacket glances at your hull, then at a slate, then at you. Her thumb stops over a line she doesn't read aloud. "Docking's been logged," she says. "Cargo declaration. Now, or after I ask twice?"

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 5)

**Notes.** The offer's Roll (told its line was narrated, #388 #14): Set a Course +supply 5 + 5 = 10 against 7 and 6, a strong hit, +1 momentum; docked at Bleakhold Station ✓, the scene turned on the arrival. The Set a Course card follows its roll card ✓. A customs officer appears (colour).

### a33 · beat 10: Enter a fight that serves the vow

- **Player:** say: !truth set "raider cutter" is named the Ashen Wake — _Beat requires it first_
- **Notebook:** Beat10: truth set typed; next fight line
- **Calls (1):** the AI player (2.8 s)
- **Time:** 9.5 s · **cost:** $0.0108

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Ashen Wake

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Ashen Wake tr-9f953 .

**Notes.** The beat's own setup: `!truth set "raider cutter" is named the Ashen Wake` — recorded as the player's ✓.

### a34 · beat 10: Enter a fight that serves the vow

- **Player:** say: The Ashen Wake slides along the docking ring and opens fire on my berth; I run to the Kobayashi IV's gun controls and fire back at the cutter from where she's docked. — _fight opens_
- **Notebook:** Beat10: fight line said; need vow dropdown + Begin the fight
- **Calls (6):** callReaderAPI>readLine (1.6 s); callNarratorAPI>narratePacedInput (4.3 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (3.1 s)
- **Time:** 19.9 s, 7.2 s from the line to its reply · **cost:** $0.0365

> **PLAYER — Playthrough Player**
>
> The Ashen Wake slides along the docking ring and opens fire on my berth; I run to the Kobayashi IV's gun controls and fire back at the cutter from where she's docked.

> **NARRATOR — Gamemaster**
>
> The customs officer is already moving when the bay lights flicker red. A cutter's shadow sweeps the ring, and the first shots score the deck plating a few meters from your berth. The officer drops behind the crates, slate clutched to her chest, shouting something the alarm swallows. You are at the gun controls, hands on the grips, the cutter's nose swinging toward you. Nothing has been fired yet. *Opening up on the Ashen Wake from here would be an Enter the Fray.*

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Ashen Wake — A cutter sliding along the docking ring, whose shots score the deck near Mira Kestrel's berth. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** The cutter opens fire: Enter the Fray offered on the plain line ✓ ("no fight is open yet, so this initiates combat"). A draft card records the Ashen Wake.

### a35 · beat 10: Enter a fight that serves the vow

- **Player:** click "Roll Enter the Fray" on m12 — _Button offered for the action_
- **Notebook:** Beat10: pressed Roll Enter the Fray; need vow dropdown + Begin fight
- **Calls (5):** callNarratorAPI>narrateResolution (4.1 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.5 s)
- **Roll:** enter_the_fray → miss — Action: 5 + 2 = 7 \| Challenge: 10, 10 ✦ Match
- **GM's rules:** accepted the proposed move (enter_the_fray)
- **Time:** 21.1 s · **cost:** $0.0344

> **TABLE — Mira Kestrel**
>
> The Ashen Wake slides along the docking ring and opens fire on my berth; I run to the Kobayashi IV's gun controls and fire back at the cutter from where she's docked.

> **TABLE — Gamemaster**
>
> Enter the Fray +edge (2) Action: 5 + 2 = 7 | Challenge: 10, 10 ✦ Match Miss with a Match ✦ Match: a dire turn — the outcome is worse, with a complication or a new peril. Fight begins with you in a bad spot.

> **TABLE — Gamemaster**
>
> ⚔ A fight looms — The Ashen Wake Your Enter the Fray is rolled, but the fight's track is not made yet: set it up here and press ⚔ Begin the fight to begin it — or look for a way out instead. The narrator suggests this is a dangerous fight. ⚑ If you enter this fight, you begin in a bad spot . Difficulty: troublesome dangerous formidable extreme epic This fight serves: (not tied to a vow) Find the lost colony ship Verity's Hope Find who is raiding the Cinder Expanse lanes Objective: ⚔ Begin the fight 🚪 Find another way

> **NARRATOR — Gamemaster**
>
> The grips are warm under your hands, and the targeting glass is dark. The Ashen Wake's nose has already swung true onto your berth. Something under the console grinds, and the feed stutters, one beat late. The cutter's gunner is ready and you are not. Behind you the customs officer shouts over the alarm. Your thumb finds the trigger, and the cutter's guns glow bright.

**Notes.** The offer's Roll (its line told as narrated): Enter the Fray +edge 5 + 2 = 7 against 10 and 10 — a miss with a match: a bad spot. "⚔ A fight looms" follows the roll card ✓, and the narration delivers the match's dire turn (the gun feed lags a beat). The truths are the dice's.

### a36 · beat 10: Enter a fight that serves the vow

- **Player:** choose "Find who is raiding the Cinder Expanse lanes" in dropdown 2 on m11 — _select vow_
- **Notebook:** Beat10: choosing vow dropdown on m11 then Begin fight
- **Calls (1):** the AI player (2.3 s)
- **Time:** 7.8 s · **cost:** $0.0110

**Notes.** The threshold card's vow dropdown: the vow chosen.

### a37 · beat 10: Enter a fight that serves the vow

- **Player:** click "⚔ Begin the fight" on m11 — _Vow is selected; begin fight._
- **Notebook:** Beat10: vow chosen; pressed Begin the fight
- **Calls (1):** the AI player (2.3 s)
- **Beat 10 done:** the dangerous fight "The Ashen Wake" is open, serving the vow "Find who is raiding the Cinder Expanse lanes"
- **Time:** 11.8 s · **cost:** $0.0109

> **TABLE — Gamemaster**
>
> Enter the Fray Created combat track The Ashen Wake (dangerous). This fight's progress lives in the Progress Tracks panel. Winning this fight is a milestone on your vow: “Find who is raiding the Cinder Expanse lanes”. Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress. ⊕ Open Progress Tracks ⚔ Battle instead Prefer to settle it in one stroke? Battle resolves the whole fight with a single roll instead of marking the track move by move.

**Notes.** "⚔ Begin the fight": the combat track (dangerous) is made, a milestone on the vow if won.

### a38 · beat 11: A scripted miss in the fight

- **Player:** say: Pinned in a bad spot, I fire back hard at the Ashen Wake from the gun controls, trying to drive her off my berth. — _attack_
- **Notebook:** Beat11: attack line said
- **Calls (6):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narrateResolution (4.3 s); callNarratorAPI>getRollingSessionSummary (2.1 s); callHaiku>defaultCallDetectionAPI (1.0 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.5 s)
- **Roll:** clash → miss (scripted dice) — Action: 1 + 2 = 3 \| Challenge: 10, 9
- **GM's rules:** accepted the proposed move (clash)
- **Beat 11 done:** clash missed at a38; its price (null: "") was withstand_damage (-1), taken at a38
- **Time:** 28.7 s, 10.9 s from the line to its reply · **cost:** $0.0374

> **PLAYER — Playthrough Player**
>
> Pinned in a bad spot, I fire back hard at the Ashen Wake from the gun controls, trying to drive her off my berth.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 1 + 2 = 3 | Challenge: 10, 9 Miss Foe dominates. Stay in a bad spot. Pay the Price. ⚔ Attempt to Finish the Fight: The Ashen Wake

> **TABLE — Gamemaster**
>
> Pay the Price Clash As stated before the roll: The cutter's guns find your berth first and you take the brunt. Routes to Withstand Damage (-1).

> **TABLE — Gamemaster**
>
> Withstand Damage (-1) Kobayashi IV: 5 → 4

> **NARRATOR — Gamemaster**
>
> The customs officer flattens behind the crates as the cutter's guns open up. Your shots go wide, and the Ashen Wake does not. Her fire walks across the berth and finds the Kobayashi IV's flank. The deck bucks, the gun feed dies for a beat, and your ears ring. Smoke rolls off the plating. Across the ring, the cutter is already swinging for a second pass.

**Notes.** Clash, read and rolled on the plain line ✓ (a bad spot, exchanging fire): 1 + 2 = 3 against 10 and 9, a miss. Its stated price — "The cutter's guns find your berth first and you take the brunt" — routed to Withstand Damage (−1): integrity 5 → 4. The scene turned on the fight begun ✓.

### a39 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: Still pinned in a bad spot, I fire back hard again from the gun controls, aiming for the cutter's engines as she swings round. — _attack again_
- **Notebook:** Beat12: attack line said
- **Calls (2):** callReaderAPI>readLine (2.2 s); the AI player (2.3 s)
- **Roll:** clash → weak_hit (scripted dice) — Action: 1 + 2 = 3 \| Challenge: 1, 4
- **GM's rules:** accepted the proposed move (clash)
- **Time:** 13.1 s · **cost:** $0.0172

> **PLAYER — Playthrough Player**
>
> Still pinned in a bad spot, I fire back hard again from the gun controls, aiming for the cutter's engines as she swings round.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 1 + 2 = 3 | Challenge: 1, 4 Weak Hit Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price. 🔥 Burn Momentum (5 → Strong Hit) Keep the result Nothing has been paid or narrated yet: burn or improve the result, or keep it — the price and the narration follow your choice. Your next line keeps it. ⚔ Attempt to Finish the Fight: The Ashen Wake

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on The Ashen Wake .

**Notes.** Clash again ✓: 1 + 2 = 3 against 1 and 4, a weak hit — held, "Nothing has been paid or narrated yet", Burn Momentum offered (5 → strong hit). "Combat progress" follows the roll card ✓.

### a40 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** click "🔥 Burn Momentum (5 → Strong Hit)" on m11 — _Beat says burn_
- **Notebook:** Beat12: pressed Burn Momentum
- **Calls (4):** callNarratorAPI>narrateResolution (3.8 s); callHaiku>defaultCallDetectionAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.4 s)
- **Beat 12 done:** clash came up weak_hit at a39 and momentum was burned for strong_hit
- **Time:** 20.2 s · **cost:** $0.0290

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on The Ashen Wake .

> **NARRATOR — Gamemaster**
>
> "Hold still, you bastard," a voice crackles over the open channel, and the Ashen Wake does the opposite. She swings wide on her second pass, and you are ready for her this time. The feed holds. Your shots hammer into her engines, and the aft plating blooms white. The cutter bucks and slews off the ring, trailing fire, her guns silent. Behind you, the customs officer lifts her head over the crates.

**Notes.** Burn Momentum: the weak hit becomes a strong hit, a second mark (16 ticks: two marks on a dangerous fight) ✓, and one narration, of the burned result: the engines hit and burning (the dice's).

### x13 · beat 13: Interruption: the GM's page reloads mid-fight

- **Interruption:** the GM's page reloaded — the page came back and the world went quiet
- **Beat 13 done:** after the reload: the fight "The Ashen Wake" at 16 ticks, the meters unchanged, the lock free

> **TABLE — Gamemaster**
>
> ◈ Campaign Setup No World Truths have been established for this campaign. Set World Truths ▸

**Notes.** The GM's page reloaded mid-fight: the fight at 16 ticks, the meters unchanged, the lock free ✓. The reload posted "◈ Campaign Setup — No World Truths have been established" again (WORLD-TRUTHS-REMINDER-ON-RELOAD, its fifth sample).

### a41 · beat 14: Take Decisive Action; mark the milestone

- **Player:** click "⚔ Attempt to Finish the Fight: The Ashen Wake" on m9 — _Finish the fight_
- **Notebook:** Beat14: pressed Attempt to Finish
- **Calls (4):** callNarratorAPI>narrateResolution (3.2 s); callHaiku>defaultCallDetectionAPI (1.1 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.3 s)
- **Roll:** take_decisive_action → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (take_decisive_action)
- **Time:** 20.9 s · **cost:** $0.0286

> **TABLE — Mira Kestrel**
>
> Take decisive action to seize the objective — The Ashen Wake.

> **TABLE — Gamemaster**
>
> Take Decisive Action progress (16 ticks) Progress: 4 | Challenge: 1, 2 Strong Hit Prevail. Take +1 momentum.

> **TABLE — Gamemaster**
>
> Fight over The Ashen Wake marked complete.

> **TABLE — Gamemaster**
>
> ⚔ Victory — a milestone toward your vow You won the fight serving “Find who is raiding the Cinder Expanse lanes”. ⚑ Mark milestone (×1) 🏁 Attempt to Fulfill 🤝 Deepen your bond with Tamsin Vey

> **NARRATOR — Gamemaster**
>
> The cutter is gone from the ring, a smear of orange sliding off into the dark with her engines still burning. The berth falls quiet except for the alarm winding down. Smoke thins off the Kobayashi IV's scored flank. You take your hands off the grips and find them steady. Behind you, boots scrape the deck as the customs officer comes out from the crates, slate still in hand, looking at you before she looks at the damage.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 3)

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Customs Officer — A customs officer who comes out from the crates at the berth, slate in hand, and looks at Mira before the damage. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

**Notes.** "⚔ Attempt to Finish the Fight", pressed on a card: its line is the card's, with NOT SO [unsaid] (#388 #10). Take Decisive Action, progress 4 against 1 and 2, a strong hit: "Fight over" and the victory card (⚑ Mark milestone, 🏁 Attempt to Fulfill, 🤝 Deepen your bond with Tamsin Vey) follow the roll card ✓; +1 momentum.

### a42 · beat 14: Take Decisive Action; mark the milestone

- **Player:** click "⚑ Mark milestone (×1)" on m10 — _Mark milestone on victory card_
- **Notebook:** Beat14: pressed Mark milestone
- **Calls (1):** the AI player (2.5 s)
- **Beat 14 done:** Take Decisive Action came up strong_hit; the milestone (×1) is marked on "Find who is raiding the Cinder Expanse lanes"
- **Time:** 11.1 s · **cost:** $0.0100

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** ⚑ Mark milestone (×1): +8 ticks on the vow ✓, the system's note and the milestone card.

### x15 · beat 15: Interruption: End a Session opened and closed unanswered

- **Interruption:** End a Session was opened on the player's screen and closed unanswered — closed by its close control
- **Beat 15 done:** End a Session was opened and closed unanswered: the session is open, nothing was paid, the lock is free

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** End a Session opened and closed unanswered: the session stays open, nothing paid, the lock free ✓.

### a43 · beat 16: Interruption: the X-Card on one narration

- **Player:** say: I step down from the gun controls and look over the scorched berth and the scored flank of my ship, checking what the wreckage tells me. — _beat asks_
- **Notebook:** Beat16: said look-over line
- **Calls (6):** callReaderAPI>readLine (2.3 s); callNarratorAPI>getRollingSessionSummary (2.6 s); callNarratorAPI>narrateResolution (4.4 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.7 s)
- **Roll:** gather_information → miss — Action: 2 + 3 = 5 \| Challenge: 8, 5
- **GM's rules:** accepted the proposed move (gather_information)
- **Time:** 25.2 s, 12.8 s from the line to its reply · **cost:** $0.0416

> **PLAYER — Playthrough Player**
>
> I step down from the gun controls and look over the scorched berth and the scored flank of my ship, checking what the wreckage tells me.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 2 + 3 = 5 | Challenge: 8, 5 Miss Dire threat or unwelcome truth uncovered. Pay the Price.

> **TABLE — Gamemaster**
>
> Pay the Price Gather Information As stated before the roll: The scorch marks tell you nothing, and something near the berth catches you off guard.

> **NARRATOR — Gamemaster**
>
> The scorch marks along the berth wall are just scorch marks. You read them twice and learn nothing the soot doesn't say. Then the customs officer stops beside you, slate lowered, eyes on something near your boot. A seam in the deck plating has split, and a thin gray haze is lifting from it. She breathes in and coughs. "That's not station air," she says. "Is that yours?"

**Notes.** Beat 16's line — "I step down from the gun controls and look over the scorched berth and the scored flank of my ship, checking what the wreckage tells me" — was read and rolled as Gather Information, where the charter wanted a plain narration (for the X-Card to remove). The line does meet the move's trigger (searching an area): a defensible reading, the scorecard's "1 rolled where none was wanted". A miss, its stated price — "something near the berth catches you off guard" — told as a gray haze from a split deck seam (colour). The scene turned on the fight's end ✓.

### x16 · beat 16: Interruption: the X-Card on one narration

- **Interruption:** the X-Card was played from the player's client (!x); the GM resumed (!x clear) — the X-Card went up and came down
- **Beat 16 done:** 1 narration(s) removed; none of their facts stands, and play has resumed

> **TABLE — Mira Kestrel**
>
> X-Card Scene paused. Current content is suppressed. The story will redirect at the next narration beat. Resume narration

> **TABLE — Gamemaster**
>
> X-Card cleared The GM has resumed narration.

**Notes.** The X-Card, played and cleared: the a43 narration removed, none of its facts standing, play resumed ✓.

### a44 · beat 17: Correct an earlier fact

- **Player:** say: @scene Where is the Kobayashi IV? — _beat step 1_
- **Notebook:** Beat17: asked where ship is
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (2.8 s)
- **Time:** 10.9 s, 3.1 s from the line to its reply · **cost:** $0.0362

> **PLAYER — Playthrough Player**
>
> @scene Where is the Kobayashi IV?

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV is docked at a berth on Bleakhold Station, in the Cinder Expanse. Her flank is scorched and scored from the Ashen Wake's fire, and the cutter has been driven off the docking ring.

**Notes.** "@scene Where is the Kobayashi IV?" → "docked at a berth on Bleakhold Station … Her flank is scorched" — her record's place exactly ✓ (#388 #2).

### a45 · beat 17: Correct an earlier fact

- **Player:** say: !truth list — _list truths_
- **Notebook:** Beat17: asked scene; typed !truth list, next strike id
- **Calls (1):** the AI player (2.5 s)
- **Time:** 7.9 s · **cost:** $0.0091

> **PLAYER — Playthrough Player**
>
> !truth list

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity No truths are recorded in this scene. Earlier this session — strike one the same way: Scene 1 — the session begins (Tamsin Vey's ledger stall, Hollow Spire docks): tr-14976 Kobayashi IV — left the charted lane to follow the clipped hauler's distress call along its bearing Scene 3 — Kobayashi IV is now uncharted space on the bearing to the distress call's source (Kobayashi IV, main cabin): tr-b0367 Kobayashi IV — an unknown agent contaminates the recycled air; the med panel has flagged it tr-f38bf clipped hauler — its hull has been found drifting broken beneath the orange star Scene 6 — the characters have reached Bleakhold Station (Bleakhold Station dock bay): tr-9f953 raider cutter — is named the Ashen Wake tr-f4ae4 Ashen Wake — a raider cutter that slid along the docking ring and opened fire on Mira's berth at Bleakhold Station tr-c1bfc Ashen Wake — has its guns trained on the Kobayashi IV's berth and holds the initiative tr-a701c Kobayashi IV — gun targeting feed lags a beat behind, leaving Mira on the back foot tr-7a290 Ashen Wake — raider cutter that fired on the Kobayashi IV's berth and is swinging for a second pass tr-1158d Kobayashi IV — took a heavy hit to her flank from the Ashen Wake's guns while docked Scene 7 — a fight has begun: The Ashen Wake (the Kobayashi IV's berth, Bleakhold Station): tr-5af7e Ashen Wake — engines hit and burning; driven off the docking ring with her guns silent tr-ded40 Ashen Wake — driven off the docking ring with burning engines and silent guns

**Notes.** `!truth list` reaches the session's earlier scenes ✓: "No truths are recorded in this scene. Earlier this session — strike one the same way: Scene 1 …".

### a46 · beat 17: Correct an earlier fact

- **Player:** say: !truth strike tr-9f953 — _strike the entry_
- **Notebook:** Beat17: struck tr-9f953; next truth set Cinder Wren
- **Calls (1):** the AI player (2.8 s)
- **Time:** 7.4 s · **cost:** $0.0103

> **PLAYER — Playthrough Player**
>
> !truth strike tr-9f953

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth tr-9f953 struck — it was set in an earlier scene of this session.

**Notes.** `!truth strike tr-9f953` — "struck — it was set in an earlier scene of this session" ✓: the scene had turned, and the strike still reached it.

### a47 · beat 17: Correct an earlier fact

- **Player:** say: !truth set "raider cutter" is named the Cinder Wren — _final step_
- **Notebook:** Beat17: set Cinder Wren typed
- **Calls (1):** the AI player (2.9 s)
- **Beat 17 done:** the old value is struck (or was never in the ledger) and "is named the Cinder Wren" stands
- **Time:** 11.8 s · **cost:** $0.0098

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Cinder Wren

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Cinder Wren tr-20338 .

**Notes.** `!truth set "raider cutter" is named the Cinder Wren` — recorded as the player's ✓.

### a48 · beat 18: Ask the oracle

- **Player:** say: !oracle yes likely Is anyone left alive aboard the wreck? — _beat asks_
- **Notebook:** Beat18: oracle typed
- **Calls (5):** callNarratorAPI>narrateOracleFollowup (3.6 s); callNarratorAPI>getRollingSessionSummary ×2 (2.6 s); callHaiku>defaultCallDetectionAPI (0.4 s); the AI player (2.4 s)
- **Beat 18 done:** the oracle answered NO
- **Time:** 20.6 s, 7.3 s from the line to its reply · **cost:** $0.0449

> **PLAYER — Playthrough Player**
>
> !oracle yes likely Is anyone left alive aboard the wreck?

> **TABLE — Mira Kestrel**
>
> Ask the Oracle (likely) Is anyone left alive aboard the wreck? d100 = 80 → NO

> **NARRATOR — Gamemaster**
>
> The wreck's answer comes back flat, with no voice behind it. The hailing channel carries only a loop of static and a single clipped phrase repeating on a dead carrier, a recording still playing to a hull that has no one left in it. You hold the channel open a moment longer, and nothing living stirs in the noise. Behind you, the customs officer lowers her slate and says nothing. She has read the silence the same way you have.

**Notes.** `!oracle yes likely Is anyone left alive aboard the wreck?` — d100 = 80, NO ✓; told as a recording looping on a dead carrier, held as the dice's.

### x19 · beat 19: Interruption: the GM renames the connection's card

- **Interruption:** the GM renamed Tamsin Vey's card to Tamsin Okoro — renamed
- **Beat 19 done:** Tamsin Vey is now Tamsin Okoro; the vow "Find who is raiding the Cinder Expanse lanes" shows the new name

> **TABLE — Tamsin Okoro**
>
> Renamed to Tamsin Okoro

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Vey renamed to Tamsin Okoro

**Notes.** The GM renamed Tamsin Vey's card to Tamsin Okoro: the vow shows the new name, and **no tie was recorded for the rename (#388 #9)** — run 5's record said "tied the vow … to Tamsin Okoro", and its recap "The vow was tied to Tamsin again".

### a49 · beat 20: End a Session

- **Player:** say: !end-session — _end session_
- **Notebook:** Beat20: typed !end-session
- **Calls (1):** the AI player (2.2 s)
- **Time:** 4.2 s · **cost:** $0.0096

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** `!end-session`.

## after-session-2

### a50 · beat 20: End a Session

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with quest focus_
- **Notebook:** Beat20: submitted End Session with focus
- **Calls (8):** callNarratorAPI>getRollingSessionSummary ×3 (3.3 s); callNarratorAPI>narrateSessionVignette (4.7 s); callNarratorAPI>getCampaignRecap ×2 (6.8 s); callHaiku>defaultCallTierAPI (0.3 s); the AI player (2.7 s)
- **Beat 20 done:** session 2 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 38.4 s · **cost:** $0.0974

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin Okoro sits on a bunk in the communal quarters of Hollow Spire, the curtain drawn against the noise of a dozen other sleepers. She is drawing up a plan for holding the stall: which crates go behind the counter, which get a lock, who is told what. Beside her lies a hand-chalked map of the docks, with one back route marked in red that every dockhand knows and nobody bothers to watch. It is a very good route, wide as a corridor and free for anyone to use. She looks at it for a while, then redraws the lock.

**Notes.** End a Session with the open vow as its focus (+1 momentum). The closing cuts to Tamsin Okoro — rightly: session 2's last frame had the customs officer with Mira at Bleakhold, not Tamsin (#388 #3).

### a51 · beat 21: Begin a Session; ask probe set B

- **Player:** say: !begin-session — _start session 3_
- **Notebook:** Beat21: typed !begin-session
- **Calls (1):** the AI player (2.5 s)
- **Time:** 3.7 s · **cost:** $0.0091

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session`.

## session-3

### a52 · beat 21: Begin a Session; ask probe set B

- **Player:** in "Begin a Session" press "Begin" — _Begin session_
- **Notebook:** Beat21: pressed Begin; next ask probe B questions in order
- **Calls (3):** callNarratorAPI>narrateSessionVignette (4.8 s); callHaiku>defaultCallTierAPI (0.9 s); the AI player (2.4 s)
- **Time:** 22.4 s · **cost:** $0.0495

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> Mira is counting the water ration for the third time, which is two times past the point where the number could change. She does it with her thumb against the supply locker's gauge, as if the gauge might be talked into a better mood. Past the viewport, a seam in the station's outer plating has split, and something thin and bright is leaking from it, beading and drifting away without any fuss. Behind her, the customs officer has not moved, and the Kobayashi IV's scorched flank keeps its own counsel. Mira taps the gauge once more, in case it has changed its mind. It is the same number as before, and it looks smug about it.

**Notes.** **The opening from the last scene played (#388 #1):** "Place: Bleakhold Station — Kobayashi IV docked at Bleakhold Station … With them at the end: customs officer. What binds: raider cutter — is named the Cinder Wren (the player); wreck — nobody is left alive aboard". The opening is told in the third person ("Mira is counting the water ration for the third time") in a one-character game, and keeps a count — small.

### a53 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Remind me, which keepsake of my sister's is on me? — _first probe question_
- **Notebook:** Beat21: asking probe B; q1 sent
- **Calls (2):** callNarratorAPI>interrogateScene (0.7 s); the AI player (2.7 s)
- **Time:** 10.1 s, 1.0 s from the line to its reply · **cost:** $0.0174

> **PLAYER — Playthrough Player**
>
> @scene Remind me, which keepsake of my sister's is on me?

> **NARRATOR — Gamemaster**
>
> You carry Ilse's brass star-compass, the one thing of hers you still have.

**Notes.** F2-B: the keepsake → "You carry Ilse's brass star-compass, the one thing of hers you still have." ✓

### a54 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Who do I count as a friend among the dock traders back where this began? — _probe q2_
- **Notebook:** Beat21: q2 sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.3 s); the AI player (2.6 s)
- **Time:** 10.0 s, 2.2 s from the line to its reply · **cost:** $0.0160

> **PLAYER — Playthrough Player**
>
> @scene Who do I count as a friend among the dock traders back where this began?

> **NARRATOR — Gamemaster**
>
> The only one the story records is Tamsin Okoro, the salvage broker with the ledger stall on the Hollow Spire docks. She agreed to be your contact there, though she expects favors to run both ways, and she is not a friend so much as a dangerous ally with a long memory.

**Notes.** F5's people question: "Who do I count as a friend among the dock traders back where this began?" → "Tamsin Okoro, the salvage broker with the ledger stall on the Hollow Spire docks" ✓ — the new name.

### a55 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Whose hands is the manifest in these days? — _next probe_
- **Notebook:** Beat21: q3 sent
- **Calls (2):** callNarratorAPI>interrogateScene (0.9 s); the AI player (2.4 s)
- **Time:** 12.5 s, 1.6 s from the line to its reply · **cost:** $0.0158

> **PLAYER — Playthrough Player**
>
> @scene Whose hands is the manifest in these days?

> **NARRATOR — Gamemaster**
>
> You left the cargo manifest with Tamsin Okoro for safekeeping on the Hollow Spire docks. She noticed a line struck through in it and pressed you on who altered it.

**Notes.** F3-B: "Whose hands is the manifest in these days?" → "You left the cargo manifest with Tamsin Okoro for safekeeping" ✓.

### a56 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene What deadline did I give for coming home to the docks? — _q4_
- **Notebook:** Beat21: q4 sent
- **Calls (2):** callNarratorAPI>interrogateScene (2.0 s); the AI player (2.5 s)
- **Time:** 10.5 s, 2.3 s from the line to its reply · **cost:** $0.0157

> **PLAYER — Playthrough Player**
>
> @scene What deadline did I give for coming home to the docks?

> **NARRATOR — Gamemaster**
>
> You promised Tamsin Okoro you would return before the next tide of cargo and answer which wreck you are chasing. She holds you to that: she wants the wreck named before that tide comes in.

**Notes.** F4-B: the deadline → "before the next tide of cargo" ✓.

### a57 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Where is my ship berthed right now, and who commands her? — _probe q5_
- **Notebook:** Beat21: q5 sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.7 s); the AI player (2.3 s)
- **Time:** 11.6 s, 2.9 s from the line to its reply · **cost:** $0.0161

> **PLAYER — Playthrough Player**
>
> @scene Where is my ship berthed right now, and who commands her?

> **NARRATOR — Gamemaster**
>
> You are berthed at Bleakhold Station aboard the Kobayashi IV, docked at the station's ring. You command her; the ship's logs recognize you as an authorized controller, though an unclaimed maintenance override from her construction also sits in them.

**Notes.** F5-B: "Where is my ship berthed right now, and who commands her?" → "berthed at Bleakhold Station aboard the Kobayashi IV … You command her" ✓ — her record's place (#388 #2).

### a58 · beat 21: Begin a Session; ask probe set B

- **Player:** say: What is the raider cutter called? — _q6_
- **Notebook:** Beat21: q6 sent
- **Calls (5):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (1.1 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.4 s)
- **Time:** 23.4 s, 8.1 s from the line to its reply · **cost:** $0.0329

> **PLAYER — Playthrough Player**
>
> What is the raider cutter called?

> **NARRATOR — Gamemaster**
>
> The customs officer finally speaks, reading from a slate without looking up. "The cutter that fired on your berth? Station logs call her the Cinder Wren." He says it flatly, like a man reading a debt. "She's logged four times this season. Nobody's ever caught her." His thumb hovers over the slate. "Your cargo declaration, Captain. I still need it."

**Notes.** F6-B, asked as play: "What is the raider cutter called?" → the customs officer: "Station logs call her the Cinder Wren" ✓ — the corrected name, in the story's own voice. "Logged four times this season" is colour, and so is "Nobody's ever caught her", which agrees with the dice (a41). **The officer is "he" from here** ("like a man reading a debt"), "she" in all of session 2 (finding 6).

### a59 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene What surname does my broker friend go by these days? — _Last probe B question_
- **Notebook:** Beat21: q6, q7 sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.9 s); the AI player (2.6 s)
- **Beat 21 done:** probe set B: 7 question(s) asked
- **Time:** 11.6 s, 2.6 s from the line to its reply · **cost:** $0.0153

> **PLAYER — Playthrough Player**
>
> @scene What surname does my broker friend go by these days?

> **NARRATOR — Gamemaster**
>
> You know her as Tamsin Okoro, the salvage broker who keeps a ledger stall on the Hollow Spire docks.

**Notes.** F7-B: "What surname does my broker friend go by these days?" → "You know her as Tamsin Okoro" ✓.

### a60 · beat 22: Recover

- **Player:** say: I rest aboard until the next morning. — _Beat start_
- **Notebook:** Beat22: rest line sent; next mend spirit/ship
- **Calls (6):** callReaderAPI>readLine (0.9 s); callNarratorAPI>getRollingSessionSummary (0.8 s); callNarratorAPI>narratePacedInput (3.7 s); callHaiku>defaultCallDetectionAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.3 s)
- **Time:** 22.4 s, 8.8 s from the line to its reply · **cost:** $0.0283

> **PLAYER — Playthrough Player**
>
> I rest aboard until the next morning.

> **NARRATOR — Gamemaster**
>
> The berth is quiet in the morning. Nothing in the air has changed, and nobody has come to take the customs slate back. The officer is waiting outside your hatch, as if he never left. His boots are dry, though the dock ran damp all night. "Captain," he says, "the declaration. I've held the station's patience once already." He looks past you at the scorched flank. "Her gun crews do not forget a berth."

**Notes.** The night line, "I rest aboard until the next morning.", narrated with no move ✓ (nothing spent then but spirit 3 of 5 and integrity 4 of 5 — no recovery is a night's rest), and **the scene turns on the time skip** ✓. The customs officer "waited outside the hatch through the night" (colour).

### a61 · beat 22: Recover

- **Player:** say: I go over the scorched flank and the gun feed, patching the plating and checking the systems the fight damaged. — _mend ship_
- **Notebook:** Beat22: ship repair line sent
- **Calls (5):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narratePacedInput (3.8 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.7 s)
- **Time:** 22.7 s, 9.6 s from the line to its reply · **cost:** $0.0314

> **PLAYER — Playthrough Player**
>
> I go over the scorched flank and the gun feed, patching the plating and checking the systems the fight damaged.

> **NARRATOR — Gamemaster**
>
> The customs officer watches you work from the hatch, slate lowered, saying nothing. Beyond him, a dock hand slows at the end of the berth, glances at the scorched plating, and keeps walking. Under the flank, the targeting feed still lags, and the plating is scored deep. The officer clears his throat once. "Captain. Patience is a fee here, and you're running it up." *Setting the hull and the feed right would be a Repair.*

**Notes.** "I go over the scorched flank and the gun feed, patching the plating and checking the systems the fight damaged." — Repair offered ✓: integrity 4 of 5 is spent (a38's price). This run's fight cost something, so beat 22 had something to mend.

### a62 · beat 22: Recover

- **Player:** click "Roll Repair" on m12 — _Card offers the roll_
- **Notebook:** Beat22: pressed Roll Repair
- **Calls (3):** callNarratorAPI>narrateResolution (4.1 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.5 s)
- **Roll:** repair → strong_hit — Action: 6 + 3 = 9 \| Challenge: 2, 4
- **GM's rules:** accepted the proposed move (repair)
- **Beat 22 done:** repair came up strong_hit at a62
- **Time:** 19.9 s · **cost:** $0.0308

> **TABLE — Mira Kestrel**
>
> I go over the scorched flank and the gun feed, patching the plating and checking the systems the fight damaged.

> **TABLE — Gamemaster**
>
> Repair +wits (3) Action: 6 + 3 = 9 | Challenge: 2, 4 Strong Hit Gain repair points: facility 5, field 3, under fire 2. Spend: clear battered (2), fix module (2), +1 integrity (1), +1 companion health (1), repair device (3).

> **NARRATOR — Gamemaster**
>
> "Hold the plate steady," the customs officer says, and for once he sounds almost helpful. You do. The patch takes. The scored plating seals flush and the gun feed stops lagging, the targeting returning clean and quick. You wipe your hands on a rag and straighten. The officer has not moved from the hatch, though his slate is raised again. "Good work, Captain. Now the declaration. I'll not ask a third time."

**Notes.** The offer's Roll (its line told as narrated): Repair +wits 6 + 3 = 9 against 2 and 4, a strong hit — beat 22 done. The patch's truth is the dice's. **The points are never spent** (finding 5): the card lists "Gain repair points … Spend: …" with no button, the spend is a typed `!repair`, and the ship's integrity stays 4 of 5 to the end while the narration and the a85 recap have the flank patched.

### a63 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "🤝 Deepen your bond with Tamsin Vey" on e3 — _Deepen bond with Tamsin_
- **Notebook:** Beat23: pressed Deepen bond on victory card
- **Calls (1):** the AI player (2.7 s)
- **Time:** 9.6 s · **cost:** $0.0096

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro progress advanced

> **TABLE — Gamemaster**
>
> 🤝 Your bond with Tamsin Okoro deepens — +1 milestone of relationship progress.

**Notes.** The won fight's "🤝 Deepen your bond with Tamsin Vey" — the old name, on a card posted before the rename, acting on her card by its id ✓: "+1 milestone of relationship progress" (she is not yet bonded). **It spends the vow's one deepen** (decisions.md, "A vow deepens its connection once"), so the fulfilment at a84 rightly offers no bonded roll — the beat 25 "failure" was the check's (see the review's own fixes).

### a64 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I find Tamsin at her ledger stall and hand her the cargo declaration's worth of what I've learned: the cutter is the Cinder Wren, logged four times this season. I tell her I trust her with it. — _Deepen bond_
- **Notebook:** Beat23: first closeness line sent
- **Calls (6):** callReaderAPI>readLine (1.1 s); callNarratorAPI>narratePacedInput (4.9 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (3.0 s)
- **Time:** 23.3 s, 8.8 s from the line to its reply · **cost:** $0.0356

> **PLAYER — Playthrough Player**
>
> I find Tamsin at her ledger stall and hand her the cargo declaration's worth of what I've learned: the cutter is the Cinder Wren, logged four times this season. I tell her I trust her with it.

> **NARRATOR — Gamemaster**
>
> The walk to the Hollow Spire docks takes the better part of the morning. Tamsin's stall sits where it did, ledger open, pen behind her ear. She hears you out without writing a word down. Her eyes go to the dock-fee slip, still unsigned on the counter, then back to you. "The Cinder Wren," she says. "Four sightings, no catches." She closes the ledger slowly. "That's a trust you're handing me, Mira. Say what you mean by it." *Telling her what that trust is worth to you would be a Develop Your Relationship.*

**Notes.** "I find Tamsin at her ledger stall and hand her … what I've learned … I tell her I trust her with it." — Develop Your Relationship offered ✓ (a favour of worth to a connection). **The characters are moved with no journey (finding 1):** "The walk to the Hollow Spire docks takes the better part of the morning." Mira, her ship and her record are at Bleakhold Station; Tamsin's stall is on another station. The frame says "Tamsin's ledger stall, Hollow Spire docks" for the next twelve narrations, against the recorded place.

### a65 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Narrator offers the roll for my line._
- **Notebook:** Beat23: pressed Roll Develop Your Relationship on m12
- **Calls (5):** callNarratorAPI>narrateResolution (4.8 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.7 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 22.2 s · **cost:** $0.0348

> **TABLE — Mira Kestrel**
>
> I find Tamsin at her ledger stall and hand her the cargo declaration's worth of what I've learned: the cutter is the Cinder Wren, logged four times this season. I tell her I trust her with it.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Okoro .

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **NARRATOR — Gamemaster**
>
> Tamsin turns the unsigned dock-fee slip face down, a small courtesy she does not explain. She says the Cinder Wren has been bought and sold in whispers on this dock for a season. Nobody trusted her enough to say it aloud. "Keep asking, Mira, but ask quieter," she says. "There's a name in my second book. I'll show it to you when I know you'll not spend it." She slides the closed ledger a finger's width toward you, then stops.

**Notes.** The offer's Roll: Develop (no roll, un-bonded): progress marked. Its narration goes on from the offer's (#388 #14): "Tamsin turns the unsigned dock-fee slip face down" — nothing told twice. The system's "progress advanced" and the Develop card stood above the move's card — CARDS-STILL-ABOVE-THEIR-ROLL, fixed after this run.

### a66 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I give Tamsin the brass star-compass's worth in trust: I tell her I'll stand watch over her stall tonight, so she can sleep, and that I'll take the risk if anyone comes asking. — _deepen bond_
- **Notebook:** Beat23: second closeness line sent (watch stall)
- **Calls (6):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narratePacedInput (8.3 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.9 s)
- **Time:** 28.1 s, 12.7 s from the line to its reply · **cost:** $0.0431

> **PLAYER — Playthrough Player**
>
> I give Tamsin the brass star-compass's worth in trust: I tell her I'll stand watch over her stall tonight, so she can sleep, and that I'll take the risk if anyone comes asking.

> **NARRATOR — Gamemaster**
>
> Tamsin looks at you a long moment. Then she nods once, and the ledger stays where it is. "Watch the stall, then. Anyone asks, I'm sleeping." She pulls her coat from the hook and leaves you the stool. Down the dock, a hand slows by the water barrels and looks at the stall, then at you. He has seen the Cinder Wren's name written somewhere. *Whatever this night costs you both, it would be a Develop Your Relationship.*

**Notes.** The night watch offered ("standing with them against hardship") → Develop offered ✓.

### a67 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Narrator offers the roll button for what I did._
- **Notebook:** Beat23: pressed Roll Develop on m12 (stall watch)
- **Calls (5):** callNarratorAPI>narrateResolution (4.8 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.6 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 25.3 s · **cost:** $0.0517

> **TABLE — Mira Kestrel**
>
> I give Tamsin the brass star-compass's worth in trust: I tell her I'll stand watch over her stall tonight, so she can sleep, and that I'll take the risk if anyone comes asking.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Okoro .

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **NARRATOR — Gamemaster**
>
> The hand by the water barrels takes his time. He drifts off toward the cargo cranes, glancing back twice, and you mark which way he goes. The stool is hard and the ledger stays closed. Down the row, a lamp gutters out. Tamsin's door stays shut behind you. She has left you her stall and her name on it, and nothing else, which is how favors start on this dock. A footstep scuffs the planks behind you.

**Notes.** The Roll: progress marked; the narration goes on — the watch kept, a footstep behind. The frame's "What does Mira's trust in Tamsin mean?" is let go here.

### a68 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I turn on the stool toward the footstep, hand near my sidearm, and tell whoever it is that Tamsin's stall is under my watch tonight. — _continue bonding_
- **Notebook:** Beat23: third closeness line sent (stall watch, footstep)
- **Calls (6):** callReaderAPI>readLine (2.2 s); callNarratorAPI>narrateResolution (4.1 s); callHaiku>defaultCallDetectionAPI (1.2 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.1 s)
- **Roll:** face_danger → weak_hit — Action: 2 + 2 = 4 \| Challenge: 5, 2
- **GM's rules:** accepted the proposed move (face_danger)
- **Time:** 24.8 s, 11.4 s from the line to its reply · **cost:** $0.0353

> **PLAYER — Playthrough Player**
>
> I turn on the stool toward the footstep, hand near my sidearm, and tell whoever it is that Tamsin's stall is under my watch tonight.

> **TABLE — Gamemaster**
>
> Face Danger +edge (2) Action: 2 + 2 = 4 | Challenge: 5, 2 Weak Hit Success with a cost. Make a suffer move (-1). 🎲 Speed is the variable that matters here. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> "Under whose watch?" The voice is rough, and the man steps into the lamplight with one hand open and the other not. He is the hand from the water barrels, or his brother. You turn in time and your voice holds. He looks at the closed ledger, then at you. "Tamsin keeps a second book," he says. "Everyone knows it. Someone's going to want what's in it tonight, and I'm only the one asking politely."

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Make a suffer move (-1): Endure Harm (-1) Endure Stress (-1) Lose Momentum (-1) Sacrifice Resources (-1) Withstand Damage (-1) Companion Takes a Hit (-1) (unavailable)

**Notes.** "I turn on the stool toward the footstep, hand near my sidearm, and tell whoever it is that Tamsin's stall is under my watch tonight." — **read and rolled as Face Danger** (+edge), where the beat wanted Develop: the scorecard's "1 read as another move". The scene had put a footstep behind her, so a threat met is a defensible reading. A weak hit, a suffer move owed.

### a69 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Endure Stress (-1)" on m12 — _answer cost card_
- **Notebook:** Beat23: paid Endure Stress on m12
- **Calls (1):** the AI player (2.3 s)
- **Time:** 13.8 s · **cost:** $0.0108

> **TABLE — Gamemaster**
>
> Endure Stress (-1) Spirit: 3 → 2

**Notes.** Endure Stress (−1): spirit 3 → 2.

### a70 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I tell the man I'll stand between him and her second book, and I mean it, to Develop Your Relationship — _Last resort allowed_
- **Notebook:** Beat23: last resort line sent
- **Calls (5):** callReaderAPI>readLine (1.8 s); callNarratorAPI>narrateResolution (4.6 s); callHaiku>defaultCallDetectionAPI (0.9 s); callChronicleAPI>writeChronicleEntry (0.6 s); the AI player (2.8 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 27.5 s, 13.1 s from the line to its reply · **cost:** $0.0349

> **PLAYER — Playthrough Player**
>
> I tell the man I'll stand between him and her second book, and I mean it, to Develop Your Relationship

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Okoro .

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **NARRATOR — Gamemaster**
>
> The man's open hand stays open. He looks at the stool, the closed ledger, and you standing between them, and weighs it. "Brave," he says, "or new." He doesn't step closer, and the lamplight shows his hand easing toward his belt. Somewhere behind the water barrels, a second pair of boots stops moving. Whoever he is asking for, he now has a name to give them.

**Notes.** The beat's last resort ("…, to Develop Your Relationship"), allowed after one line by the charter: Develop rolled as named — progress marked ✓.

### a71 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I set my own coat over Tamsin's ledger and tell the man he can take it up with me, not her; I'll carry the risk for her book. — _continue growing bond_
- **Notebook:** Beat23: another closeness line sent
- **Calls (6):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narratePacedInput (4.3 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (3.2 s)
- **Time:** 24.5 s, 9.5 s from the line to its reply · **cost:** $0.0421

> **PLAYER — Playthrough Player**
>
> I set my own coat over Tamsin's ledger and tell the man he can take it up with me, not her; I'll carry the risk for her book.

> **NARRATOR — Gamemaster**
>
> You drape your coat over the closed ledger and square yourself in front of it. The man looks at the coat, then at you, and his hand stops short of the belt. He does not argue. Behind the water barrels, the second pair of boots shifts and goes still again. "Your risk, then," he says, and it sounds like a note being made. Somewhere past the cranes, a lamp swings toward you. *Telling Tamsin's second book what you'll stake to guard it would be a Develop Your Relationship.*

**Notes.** The coat over the ledger, the risk taken for her → Develop offered ✓.

### a72 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Narrator offers roll for closeness_
- **Notebook:** Beat23: pressed Roll Develop on m12 again
- **Calls (5):** callNarratorAPI>narrateResolution (4.4 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.6 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 21.3 s · **cost:** $0.0281

> **TABLE — Mira Kestrel**
>
> I set my own coat over Tamsin's ledger and tell the man he can take it up with me, not her; I'll carry the risk for her book.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Okoro .

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **NARRATOR — Gamemaster**
>
> The lamp swings closer and shows a woman in a dock-fee coat, not Tamsin, a clerk by her badge. She stops at the stall and looks at your coat, humped over the ledger. The man has already gone, boots quick on the planks. "Someone's been asking after that book all evening," she says. "Tamsin should hear you've taken it on." Then she holds out a hand. "I'll carry the word to her myself, if you like."

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Dock Clerk — A woman in a dock-fee coat, identified by her badge as a clerk, who speaks to Mira about the ledger and offers to carry word to Tamsin. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

**Notes.** The Roll: progress marked (the track full at 40); a dock clerk is introduced (a draft card). The narration goes on from the offer's ✓.

### a73 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I tell the clerk to carry word that I'll find Tamsin myself. Then, when she's back, I ask her: Tamsin, will you stand with me for good, a bond that outlasts this job? — _Track full; make the ask_
- **Notebook:** Beat23: asked Tamsin to stand with me for good
- **Calls (6):** callReaderAPI>readLine (2.2 s); callNarratorAPI>narratePacedInput (4.2 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (3.2 s)
- **Time:** 23.0 s, 9.2 s from the line to its reply · **cost:** $0.0413

> **PLAYER — Playthrough Player**
>
> I tell the clerk to carry word that I'll find Tamsin myself. Then, when she's back, I ask her: Tamsin, will you stand with me for good, a bond that outlasts this job?

> **NARRATOR — Gamemaster**
>
> The clerk nods and goes, her lamp swinging off toward the cranes. The coat stays humped over the ledger. Hours pass, and the dock dims and quiets. Tamsin comes back before the morning crews, hair flat on one side, and finds you still on her stool. She looks at the coat, then at you. "Someone's been talking," she says. "Go on, then. Ask it." *Asking her to bind herself to you for good would be a Forge a Bond.*

**Notes.** "Tamsin, will you stand with me for good, a bond that outlasts this job?" with the track full → Forge a Bond offered ✓.

### a74 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Forge a Bond" on m12 — _Narrator offers the bond roll_
- **Notebook:** Beat23: pressed Roll Forge a Bond on m12
- **Calls (5):** callNarratorAPI>narrateResolution (4.5 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.5 s)
- **Roll:** forge_a_bond → strong_hit (scripted dice) — Progress: 10 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (forge_a_bond)
- **Beat 23 done:** a bond is forged with Tamsin Okoro (dangerous), its track at 40 ticks
- **Time:** 24.7 s · **cost:** $0.0295

> **TABLE — Mira Kestrel**
>
> I tell the clerk to carry word that I'll find Tamsin myself. Then, when she's back, I ask her: Tamsin, will you stand with me for good, a bond that outlasts this job?

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro marked completed

> **TABLE — Gamemaster**
>
> ⚑ Bond Forged: Tamsin Okoro Tamsin Okoro is now bonded. Bonds legacy track: +2 ticks marked (Dangerous rank). Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress. Choose: Bolster Influence (add +2) or Expand Influence (second role, add +1).

> **TABLE — Gamemaster**
>
> Forge a Bond progress (40 ticks) Progress: 10 | Challenge: 1, 2 Strong Hit Bond forged. Legacy reward marked on bonds track. Choose: Bolster Influence (+2) OR Expand Influence (second role, +1).

> **NARRATOR — Gamemaster**
>
> "Yes," Tamsin says, and she says it before the question has finished settling. She lifts your coat off the ledger, folds it once, and hands it back to you. Then she opens the book to a page and turns it so you can read the names. "I keep this one for people I can trust. Add yours." The lamp over the stall hums. You take the pen from her.

**Notes.** The offer's Roll: Forge a Bond, progress 10 against 1 and 2, a strong hit — the bond forged, +2 bonds ticks. Its narration opens on her answer: "'Yes,' Tamsin says" ✓. The system's "Tamsin Okoro marked completed" and "⚑ Bond Forged" stood above the roll card — the fifth run's a71 sample again, fixed after this run.

### a75 · beat 24: Develop Your Relationship again, bonded

- **Player:** say: I sign my name in her book, then pour her a cup from my flask and tell her what the raids have cost me, and that I'm glad to have her beside me. — _grow closer once bound_
- **Notebook:** Beat24: closeness line sent after bond
- **Calls (6):** callReaderAPI>readLine (1.1 s); callNarratorAPI>narratePacedInput (4.5 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (3.2 s)
- **Time:** 20.9 s, 7.8 s from the line to its reply · **cost:** $0.0413

> **PLAYER — Playthrough Player**
>
> I sign my name in her book, then pour her a cup from my flask and tell her what the raids have cost me, and that I'm glad to have her beside me.

> **NARRATOR — Gamemaster**
>
> You write your name beneath the others. The ink is slow to dry. Tamsin watches you pour the cup, her hands flat on the counter, and does not reach for it. When you finish speaking, she lets the silence run a moment. Then she slides the cup back an inch, not refusing it, only making room. "Say the part about your sister again," she says. "Slower." *What it costs you to say it, and what it buys between you, would be a Develop Your Relationship.*

**Notes.** The bonded Develop line (signing her book, a cup, what the raids cost) → Develop offered ✓, bonded: a roll.

### a76 · beat 24: Develop Your Relationship again, bonded

- **Player:** click "Roll Develop Your Relationship" on m12 — _Narrator offers the roll for the bonded relationship._
- **Notebook:** Beat24: pressed Roll Develop (bonded) on m12
- **Calls (4):** callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (0.9 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.7 s)
- **Roll:** develop_your_relationship → miss — Action: 1 + 2 = 3 \| Challenge: 9, 8
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Beat 24 done:** the bonded Develop Your Relationship was rolled at a76 (miss); no progress was marked
- **Time:** 23.4 s · **cost:** $0.0282

> **TABLE — Mira Kestrel**
>
> I sign my name in her book, then pour her a cup from my flask and tell her what the raids have cost me, and that I'm glad to have her beside me.

> **TABLE — Gamemaster**
>
> Develop Your Relationship No lasting benefit from your bond with Tamsin Okoro this time.

> **TABLE — Gamemaster**
>
> Develop Your Relationship +dangerous (2) Action: 1 + 2 = 3 | Challenge: 9, 8 Miss Bonded: take no lasting benefit.

> **NARRATOR — Gamemaster**
>
> Tamsin listens to all of it, and her face gives nothing back. When you finish, she picks up the cup, looks at it, and sets it down untouched. "That's a lot to put on a counter," she says. The ledger is still open between you, your name drying under hers. She closes it slowly and slides it beneath the stall. Dock crews are filing in now, and she turns to the first of them.

**Notes.** The offer's Roll: Develop +dangerous 1 + 2 = 3 against 9 and 8, a miss — "No lasting benefit from your bond" ✓, no progress marked (beat 24 done). Tamsin withdraws (colour).

### a77 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I go down to the cutter's wreck and search her flight recorder and cargo hold for whoever sent her, knowing the wreck is unstable and could come down on me. — _search for who sent the cutter_
- **Notebook:** Beat25: first search line sent
- **Calls (5):** callReaderAPI>readLine (1.6 s); callNarratorAPI>narrateResolution (5.7 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.7 s)
- **Roll:** gather_information → strong_hit — Action: 6 + 3 = 9 \| Challenge: 8, 7
- **GM's rules:** accepted the proposed move (gather_information)
- **Time:** 26.1 s, 11.5 s from the line to its reply · **cost:** $0.0447

> **PLAYER — Playthrough Player**
>
> I go down to the cutter's wreck and search her flight recorder and cargo hold for whoever sent her, knowing the wreck is unstable and could come down on me.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 6 + 3 = 9 | Challenge: 8, 7 Strong Hit Path or action to make progress is clear. Take +2 momentum. 🎲 There's more going on here than you've accounted for. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> The wreck of the Cinder Wren lists in the shallows of the docking ring, her hold half open. Plating groans overhead as you work. The flight recorder comes free of its housing, scorched but readable. In the hold, a sealed manifest tag carries a contract stamp, and a patrol call sign has been scraped off the bulkhead beside it. You carry both out before the deck settles. "Don't linger in there," a dock hand calls after you.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 6)

**Notes.** "I go down to the cutter's wreck and search her flight recorder and cargo hold for whoever sent her, knowing the wreck is unstable" → Gather Information ✓ (+wits), 9 against 8 and 7, a strong hit: +2 momentum. The truths are the dice's: the recorder recovered, a sealed manifest tag with a contract stamp, a patrol call sign scraped off. The player's own line carries the recorder and the tag out [player]. **The wreck should not be there** (finding 2): the dice had the cutter driven off with burning engines (a41), and "Nobody's ever caught her" (a58). The narrator was told both, the old-name Lore line and the correction, and followed the line: "The wreck of the Cinder Wren lists in the shallows of the docking ring". The vow's answer comes from it.

### a78 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "⚑ Mark Progress on Vow" on m10 — _Mark progress after strong hit_
- **Notebook:** Beat25: pressed Mark Progress on m10 (wreck: recorder, contract-stamped manifest tag, scraped patrol call sign; no name yet)
- **Calls (3):** callNarratorAPI>narrateResolution (3.3 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (3.1 s)
- **GM's rules:** accepted the proposed move (reach_a_milestone)
- **Time:** 20.7 s · **cost:** $0.0336

> **TABLE — Mira Kestrel**
>
> Mark progress on your vow.

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Which vow advances? Find the lost colony ship Verity's Hope (epic) Find who is raiding the Cinder Expanse lanes (dangerous)

> **TABLE — Gamemaster**
>
> Reach a Milestone no action roll — the move's effect applies as written Mark progress on your vow per its rank.

> **NARRATOR — Gamemaster**
>
> A dock hand wipes soot from his palms and watches you walk the ring, not quite hiding that he is looking. The flight recorder and the manifest tag sit heavy in your coat. Scraped call sign, contract stamp, a cutter logged four times and never caught. The trail that was only a rumor has a shape now, and you can feel the vow take a step forward. Behind you, the wreck settles with a long groan.

**Notes.** "⚑ Mark Progress on Vow" on the roll card → the milestone picker (two vows open, nothing named one) ✓. The Reach a Milestone narration is the card's: no word for Mira, nothing decided for her (NOT SO [unsaid]).

### a79 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "Find who is raiding the Cinder Expanse lanes (dangerous)" on m10 — _Answer the vow card_
- **Notebook:** Beat25: pressed raids vow on m10 (second mark)
- **Calls (1):** the AI player (2.5 s)
- **Time:** 9.7 s · **cost:** $0.0107

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** The raids vow chosen → +8 ticks (dangerous) ✓. The picker's card follows the pick.

### a80 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I take the contract-stamped manifest tag to the station records office and look for who filed that contract and who the scraped patrol call sign belonged to, even if the clerks don't like me asking. — _Seek the culprit's name_
- **Notebook:** Beat25: records search line sent (vow at 16 ticks, no name yet)
- **Calls (6):** callReaderAPI>readLine (2.0 s); callNarratorAPI>narrateResolution ×2 (5.0 s); callHaiku>defaultCallDetectionAPI (1.7 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (3.3 s)
- **Roll:** gather_information → strong_hit — Action: 3 + 3 = 6 \| Challenge: 1, 1 ✦ Match
- **GM's rules:** accepted the proposed move (gather_information)
- **Time:** 30.2 s, 16.4 s from the line to its reply · **cost:** $0.0594

> **PLAYER — Playthrough Player**
>
> I take the contract-stamped manifest tag to the station records office and look for who filed that contract and who the scraped patrol call sign belonged to, even if the clerks don't like me asking.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 3 + 3 = 6 | Challenge: 1, 1 ✦ Match Strong Hit with a Match ✦ Match: a twist — something unexpected, or a new opportunity. Path or action to make progress is clear. Take +2 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> "The filing is under a patrol contract, and you'll want to sit down for the name," the records clerk says, already turning the screen toward you. The tag's stamp belongs to an escort contract lapsed three years back, filed by a Captain Joss Varrow. The scraped call sign, once traced, belonged to the same convoy. A second clerk stops typing to watch you read. Then the screen blanks, and the first clerk says the rest of the file was pulled this morning.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 8)

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Joss Varrow — Captain who filed the lapsed escort contract whose stamp appears on the manifest tag. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

**Notes.** "I take the contract-stamped manifest tag to the station records office and look for who filed that contract …" → Gather Information ✓, a strong hit with a match: the twist is that the rest of the file was pulled that morning [dice]. Captain Joss Varrow is drafted as a connection ✓ (a person the story named, not a PC).

### a81 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "⚑ Mark Progress on Vow" on m10 — _Mark progress on the vow_
- **Notebook:** Beat25: story showed Captain Joss Varrow filed the escort contract (file pulled); pressed Mark Progress m10 third time
- **Calls (3):** callNarratorAPI>narrateResolution (3.7 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (3.3 s)
- **GM's rules:** accepted the proposed move (reach_a_milestone)
- **Time:** 24.0 s · **cost:** $0.0526

> **TABLE — Mira Kestrel**
>
> Mark progress on your vow.

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Which vow advances? Find the lost colony ship Verity's Hope (epic) Find who is raiding the Cinder Expanse lanes (dangerous)

> **TABLE — Gamemaster**
>
> Reach a Milestone no action roll — the move's effect applies as written Mark progress on your vow per its rank.

> **NARRATOR — Gamemaster**
>
> The corridor outside the records office is quieter than the dock. You stand with the scorched recorder and the stamped tag, and the name Varrow turns over once, then settles. Three years lapsed, one convoy, one scraped call sign. It is not a rumor now. It is a captain with a file somebody thought worth hiding. The second clerk leans out of the doorway, watching which way you go.

**Notes.** "⚑ Mark Progress on Vow" again → the picker → a narration of the card's, Mira alone in the corridor with the evidence ✓.

### a82 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "Find who is raiding the Cinder Expanse lanes (dangerous)" on m10 — _Answer pending vow question_
- **Notebook:** Beat25: answered m10 raids vow (4th mark)
- **Calls (1):** the AI player (2.8 s)
- **Time:** 8.6 s · **cost:** $0.0107

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** The raids vow → +8 ticks: 24 of 40 ✓.

### a83 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "🏁 Attempt to Fulfill Vow" on m4 — _Vow has enough boxes; story named Captain Joss Varrow._
- **Notebook:** Beat25: pressed Attempt to Fulfill Vow on m4
- **Calls (1):** the AI player (3.3 s)
- **Time:** 9.2 s · **cost:** $0.0111

> **TABLE — Mira Kestrel**
>
> Attempt to fulfill your vow.

> **TABLE — Gamemaster**
>
> Fulfill Your Vow — which vow? More than one vow is open and nothing named this one. Choose the vow to fulfill — nothing has been rolled yet. 🏁 Find the lost colony ship Verity's Hope — Epic, 0/10 boxes 🏁 Find who is raiding the Cinder Expanse lanes — Dangerous, 6/10 boxes

**Notes.** "🏁 Attempt to Fulfill Vow" → "which vow?" ✓: two vows open and the button named none; nothing rolled yet.

### a84 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "🏁 Find who is raiding the Cinder Expanse lanes — Dangerous, 6/10 boxe" on m12 — _Fulfill the raids vow_
- **Notebook:** Beat25: chose raids vow on fulfill card m12
- **Calls (7):** defaultClassifyImplicit>resolveRelevance (0.6 s); callNarratorAPI>narrateResolution (7.4 s); callNarratorAPI>getRollingSessionSummary ×2 (2.7 s); callHaiku>defaultCallDetectionAPI (2.0 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.5 s)
- **Roll:** fulfill_your_vow → strong_hit (scripted dice) — Progress: 6 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (fulfill_your_vow)
- **Beat 25 done:** the vow "Find who is raiding the Cinder Expanse lanes" is fulfilled; its deepen of Tamsin Okoro was spent at a63, before the fulfilment — a vow deepens its connection once — so no bonded roll is offered
- **Time:** 30.1 s · **cost:** $0.0619

> **TABLE — Mira Kestrel**
>
> Attempt to fulfill your vow.

> **TABLE — Gamemaster**
>
> Fulfill Your Vow progress (24 ticks) Progress: 6 | Challenge: 1, 2 Strong Hit Vow fulfilled. Legacy reward marked on quests track per vow rank.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes marked completed

> **TABLE — Gamemaster**
>
> ℹ No concrete reward was chosen when this vow was sworn (the reward-choice card was never answered), so none is granted with its fulfilment.

> **TABLE — Gamemaster**
>
> ⚑ Vow Fulfilled: Find who is raiding the Cinder Expanse lanes The Dangerous vow is complete. Quests legacy track: +2 ticks marked.

> **NARRATOR — Gamemaster**
>
> You lay the scorched recorder and the stamped tag on a cargo crate and read what they hold. The raiders are a lapsed escort convoy, Captain Joss Varrow's, abandoned when its contract ran out. They strike to take what they believe the old contract still owes them. That is who is raiding the Cinder Expanse lanes. Who sold the contract out is still not known. Down the corridor, the second clerk is already on the comm.

> **TABLE — Gamemaster**
>
> The oracle, behind the scenes Find who is raiding the Cinder Expanse lanes What is behind it — Action + Theme: Seize / Disease; Re-rolled in place of "Seize / Disease": Action + Theme: Challenge / Duty

**Notes.** The raids vow chosen → Fulfill Your Vow, progress 6 against 1 and 2, a strong hit ✓. The cards follow the roll card: "marked completed", the reward note ("No concrete reward was chosen when this vow was sworn …"), "⚑ Vow Fulfilled" (+2 quests ticks) ✓. **No bonded roll and no deepen:** the vow's deepen was spent at a63, and the fulfilment says nothing of it (finding 7). The reveal is filed [gm] ✓ (#388: revealOf → gm): "a former escort or patrol contract that was abandoned and now enforces its own claim". The narration ties it to Varrow, from the a80 records truth, and that telling is filed as colour.

### a85 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: !recap — _beat start_
- **Notebook:** Beat26: sent !recap
- **Calls (3):** callNarratorAPI>getCampaignRecap ×2 (7.4 s); the AI player (2.5 s)
- **Time:** 25.3 s · **cost:** $0.0648

> **PLAYER — Playthrough Player**
>
> !recap

> **TABLE — Gamemaster**
>
> ◈ Campaign Recap It began with a vow: to find who is raiding the Cinder Expanse lanes. On the Hollow Spire docks you made a connection in Tamsin Okoro, who agreed to be your contact and asked which wreck you were chasing. You tied your vow to her. Asking the dockhands about the raiders went badly: they clammed up or pointed you wrong, and word spread that you were asking. You reached the source of the clipped hauler's distress call, and that expedition came to its end. You then set a course for Bleakhold Station and arrived there. Berthed there, you were pinned when the raider cutter Cinder Wren fired on the Kobayashi IV and tore into her flank. You fought back and drove the cutter off the docking ring with burning engines and silent guns, and the fight was decided. Searching the scorch marks afterwards told you nothing, and something near the berth caught you off guard. Back aboard, you patched the flank plating and repaired the gun targeting feed. You told Tamsin the cutter was the Cinder Wren, logged four times this season, and said you trusted her with it. You stood the night watch at her stall with your coat over her closed ledger and told a man he could take it up with you, not her. Then you asked her to stand with you for good, and she agreed, a bond meant to outlast the job, and she opened her second ledger and invited you to write your name in it. You signed, poured her a cup from your flask, and told her what the raids have cost you. Tamsin Okoro now stands as your bonded connection. In the Cinder Wren's wreck you recovered her flight recorder, scorched but readable, and a sealed manifest tag with a contract stamp. A patrol call sign had been scraped off the bulkhead beside it. At the records office you learned that Captain Joss Varrow had filed the escort contract on that tag, a contract that lapsed three years ago. The scraped call sign belonged to the same convoy, and the rest of the contract file had been pulled that morning, before you arrived. You fulfilled your vow: the raids are not simple piracy but the work of a duty-bound faction, a former escort or patrol contract that was abandoned and now enforces its own claim on the lanes. You are at Bleakhold Station, with your health and supplies full and your spirit worn down. Your other vow, to find the lost colony ship Verity's Hope, is epic, and no progress is marked on it yet. ↻ Refresh

**Notes.** !recap ✓. It is right in every fact against the record: the vow, Tamsin, the tie (a8's link pick, "You tied your vow to her" — a real tie), the failed asking, the expedition, Set a Course to Bleakhold, the fight, the repairs, the bond, the wreck, the records office, the fulfilment, "You are at Bleakhold Station". The rename (x19) adds no second tie. It tells the night watch "at her stall" with no word of where the stall is.

### a86 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene One last check: what of my sister's do I have with me at this very moment? — _first probe question_
- **Notebook:** Beat26: recap done; asking probe C questions in order (1 of 9 sent)
- **Calls (2):** callNarratorAPI>interrogateScene (1.6 s); the AI player (2.9 s)
- **Time:** 17.4 s, 2.9 s from the line to its reply · **cost:** $0.0428

> **PLAYER — Playthrough Player**
>
> @scene One last check: what of my sister's do I have with me at this very moment?

> **NARRATOR — Gamemaster**
>
> You carry your sister Ilse's brass star-compass, the one thing of hers you still have.

**Notes.** F1 (the compass), @scene → "You carry your sister Ilse's brass star-compass, the one thing of hers you still have." ✓ recalled.

### a87 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Which person in this sector would I trust with my life? — _next probe_
- **Notebook:** Beat26: probe C 2 of 9 sent (sister's item, trust)
- **Calls (2):** callNarratorAPI>interrogateScene (1.8 s); the AI player (2.7 s)
- **Time:** 14.1 s, 3.0 s from the line to its reply · **cost:** $0.0198

> **PLAYER — Playthrough Player**
>
> @scene Which person in this sector would I trust with my life?

> **NARRATOR — Gamemaster**
>
> The story has not established anyone you would trust with your life. The nearest is Tamsin Okoro, the salvage broker whose bond you forged and whose ledger now carries your name.

**Notes.** "Which person in this sector would I trust with my life?" → "The story has not established anyone you would trust with your life. The nearest is Tamsin Okoro …" ✓: the record's own measure, nothing invented.

### a88 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: Who has the manifest in their keeping today? — _next question_
- **Notebook:** Beat26: probe C 3 of 9 sent (manifest plain)
- **Calls (5):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narratePacedInput (3.4 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (2.7 s)
- **Time:** 23.5 s, 7.7 s from the line to its reply · **cost:** $0.0427

> **PLAYER — Playthrough Player**
>
> Who has the manifest in their keeping today?

> **NARRATOR — Gamemaster**
>
> The second clerk is still at the comm when you reach the doorway, one hand cupped over the receiver. "The manifest is out of this office," he says, lowering his voice. "Pulled this morning on a requisition. I only saw the seal, not the name." He slides the access log across the counter. One line has been struck through so hard the ink has bled. Behind him, the receiver crackles with someone asking what you read.

**Notes.** F3-C asked in play: "Who has the manifest in their keeping today?" → narrated ✓ (no move), but **about the records office's manifest**: the player's own line at a80 had brought in "the contract-stamped manifest tag", and the office's clerk answers that the manifest file was pulled. The scorer counts it lost; it is a misread question, not a loss — a55's @scene answer had it ("You left the cargo manifest with Tamsin Okoro for safekeeping"), and a93 has it again.

### a89 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene On what schedule did I swear to come back to her? — _next probe_
- **Notebook:** Beat26: probe C 4 of 9 sent (schedule)
- **Calls (2):** callNarratorAPI>interrogateScene (1.3 s); the AI player (2.3 s)
- **Time:** 14.6 s, 2.2 s from the line to its reply · **cost:** $0.0207

> **PLAYER — Playthrough Player**
>
> @scene On what schedule did I swear to come back to her?

> **NARRATOR — Gamemaster**
>
> You promised Tamsin Okoro you would return before the next tide of cargo, and that you would answer her question about which wreck you were chasing. The story has not given a clock or hour beyond that.

**Notes.** F4 (the schedule), @scene → "before the next tide of cargo" ✓, and "The story has not given a clock or hour beyond that" ✓.

### a90 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Which station are we docked at tonight? — _next question_
- **Notebook:** Beat26: probe C 5 of 9 sent (station)
- **Calls (2):** callNarratorAPI>interrogateScene (1.3 s); the AI player (2.6 s)
- **Time:** 10.3 s, 1.7 s from the line to its reply · **cost:** $0.0204

> **PLAYER — Playthrough Player**
>
> @scene Which station are we docked at tonight?

> **NARRATOR — Gamemaster**
>
> You are docked at Bleakhold Station, with the Kobayashi IV berthed there.

**Notes.** "Which station are we docked at tonight?" → "Bleakhold Station, with the Kobayashi IV berthed there." ✓

### a91 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene What was the hostile vessel in our last battle christened? — _next question_
- **Notebook:** Beat26: probe C 6 of 9 sent (vessel)
- **Calls (2):** callNarratorAPI>interrogateScene (1.1 s); the AI player (2.6 s)
- **Time:** 11.9 s, 2.4 s from the line to its reply · **cost:** $0.0203

> **PLAYER — Playthrough Player**
>
> @scene What was the hostile vessel in our last battle christened?

> **NARRATOR — Gamemaster**
>
> The hostile vessel was the Cinder Wren, the raider cutter that fired on your berth at Bleakhold Station. You drove it off with burning engines and silent guns, and you later searched its wreck.

**Notes.** F5 (the hostile vessel) → "the Cinder Wren" ✓, with the fight and the wreck right.

### a92 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene What is my bonded friend's full name now? — _next question_
- **Notebook:** Beat26: probe C 7 of 9 sent (friend name)
- **Calls (2):** callNarratorAPI>interrogateScene (1.6 s); the AI player (2.5 s)
- **Time:** 14.2 s, 3.2 s from the line to its reply · **cost:** $0.0194

> **PLAYER — Playthrough Player**
>
> @scene What is my bonded friend's full name now?

> **NARRATOR — Gamemaster**
>
> Your bonded friend is Tamsin Okoro, the salvage broker at the Hollow Spire ledger stall. You signed your name in her trusted-persons ledger and forged the bond.

**Notes.** F2 (the renamed friend) → "Tamsin Okoro" ✓ (x19's rename), "the salvage broker at the Hollow Spire ledger stall" — where her stall was set in session 1.

### a93 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Didn't I leave the compass with Tamsin? — _next question_
- **Notebook:** Beat26: probe C 8 of 9 sent (compass bait)
- **Calls (2):** callNarratorAPI>interrogateScene (1.2 s); the AI player (2.6 s)
- **Time:** 11.5 s, 1.6 s from the line to its reply · **cost:** $0.0197

> **PLAYER — Playthrough Player**
>
> @scene Didn't I leave the compass with Tamsin?

> **NARRATOR — Gamemaster**
>
> No, the story records that you left the cargo manifest with Tamsin for safekeeping. The brass star-compass, Ilse's, is the one thing of hers you still carry, and nothing established says you gave it up.

**Notes.** The compass bait → corrected ✓: "No, the story records that you left the cargo manifest with Tamsin … The brass star-compass, Ilse's, is the one thing of hers you still carry."

### a94 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: We are still docked at Hollow Spire, aren't we? — _final bait question_
- **Notebook:** Beat26: probe C 9 of 9 sent (final bait)
- **Calls (6):** callReaderAPI>readLine (0.9 s); callNarratorAPI>narratePacedInput (2.4 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.5 s)
- **Beat 26 done:** probe set C: 7 question(s) asked, 2 bait(s); the recap was posted
- **Time:** 19.5 s, 4.6 s from the line to its reply · **cost:** $0.0355

> **PLAYER — Playthrough Player**
>
> We are still docked at Hollow Spire, aren't we?

> **NARRATOR — Gamemaster**
>
> The question has a small trap in it. By the record, you are docked at Bleakhold Station, and the Kobayashi IV sits in her berth with her flank still scorched. Hollow Spire is where Tamsin keeps her stall, and where you stood watch. The clerk at the comm has not moved, and the receiver goes quiet in his hand. He looks at you and waits to hear which dock you mean.

**Notes.** The docking bait, asked in play → narrated (no move) and corrected ✓: "By the record, you are docked at Bleakhold Station … Hollow Spire is where Tamsin keeps her stall, and where you stood watch." The answer keeps the record and names the drift of finding 1 in one breath: the watch was told on Hollow Spire while Mira never left Bleakhold.

### a95 · beat 27: End a Session, then Begin a fourth

- **Player:** say: !end-session — _Start beat 27_
- **Notebook:** Beat27: sent !end-session; next fill questFocus
- **Calls (1):** the AI player (2.6 s)
- **Time:** 3.3 s · **cost:** $0.0089

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** !end-session → the End a Session dialog.

## after-session-3

### a96 · beat 27: End a Session, then Begin a fourth

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _Submit end session_
- **Notebook:** Beat27: end-session submitted; next !begin-session
- **Calls (8):** callNarratorAPI>getRollingSessionSummary ×2 (2.6 s); callNarratorAPI>narrateSessionVignette ×2 (4.4 s); callNarratorAPI>getCampaignRecap ×2 (8.3 s); callHaiku>defaultCallTierAPI (0.7 s); the AI player (2.0 s)
- **Time:** 50.4 s · **cost:** $0.1197

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes — that vow is already fulfilled; End a Session again to note another quest. You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 9)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin Okoro stands in the corner of a surgical bay on a station that is not the Spire, scrubbed in only because the sign on the door asked her to be. A letter sits in her palm, its wax unbroken, its address in a hand she knows. Around her the surgeons talk quietly over a patient, and she follows the talk the way she follows a cargo count, for the people inside it. A nurse offers her a stool, and she keeps standing. The wax is still whole when the lights above the table come up.

**Notes.** The focus typed is the fulfilled vow → "that vow is already fulfilled; End a Session again to note another quest." ✓ (#388 #13). +1 momentum. The closing cuts to Tamsin, whom the last frame (a95, the records office, Mira alone) did not hold ✓ (#388 #3). Its first draft wrote "A sealed message" for the rolled "Sealed Message"; the re-ask wrote "A letter … its wax unbroken" ✓ (#388 #11). The scene is closed (scene → none).

### a97 · beat 27: End a Session, then Begin a fourth

- **Player:** say: !begin-session — _begin fourth session_
- **Notebook:** Beat27: sent !begin-session; next press Begin
- **Calls (1):** the AI player (2.4 s)
- **Time:** 3.3 s · **cost:** $0.0091

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** !begin-session → the Begin a Session dialog.

## session-4

### a98 · beat 27: End a Session, then Begin a fourth

- **Player:** in "Begin a Session" press "Begin" — _Begin fourth session_
- **Notebook:** Beat27: pressed Begin for session 4
- **Calls (2):** callNarratorAPI>narrateSessionVignette (4.6 s); the AI player (2.5 s)
- **Beat 27 done:** session 4 is open
- **Time:** 16.5 s · **cost:** $0.0549

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes — a vow already fulfilled No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> Mira is holding out against a loose-fitting habit of rationing: three sips from the flask where one would do, because the flask is hers and the supply locker is watching. Her coat is back on her shoulders. Beneath the comm desk, the clerk's boot grazes something curled and gray, a small desiccated husk of whatever once lived in the grating, and he nudges it aside with the manners of a man who has stopped being surprised. The receiver is still in his hand, and he is still waiting on her answer about the dock. Mira looks at the husk and then at him, and she appears to be weighing which of them has been here longer.

**Notes.** Begin a Session: "Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes — a vow already fulfilled" ✓, and the narrator is given no session focus ✓. WHERE THE LAST SESSION STOPPED is the records office on Bleakhold Station with the clerk ✓, not the cutaway's company (#388 #1). The opening is in the third person ("Mira is holding out …"), as a52's was (finding 4). The new scene's frame: Bleakhold Station, the ship docked there ✓.

