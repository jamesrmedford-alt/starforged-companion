# long-haul — annotated transcript

Run `long-haul-live-20261123-050206` · live · 2026-11-23T05:02:06.208Z · class **suspected-quality-issue** — the ledger: 2 fact(s) refused, 0 lost — each excerpt is to be read

**Re-scored 2026-11-23** from this run's own evidence, by the checks as corrected after it (`rescore.mjs`). What the table did is unchanged. The run's own verdict was **product-failure** — beat 15 (Interruption: the X-Card on one narration) was brought about wrongly: the removed narration still has 1 standing truth(s) (a35: "a torn strip of its hull plating drifts in the bay mouth, carrying a fresh weld seam over an older mark, partly legible to Mira") and 0 Chronicle entries

Generated layers: the beat, the player's reason, the table's calls, rolls, the GM's answers, the checks' findings, time and cost.
The notes under each step are the reader's, and are not generated.

## before

### a1 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** say: !begin-session — _Open session dialog_
- **Calls (1):** the AI player (3.3 s)
- **Time:** 3.1 s · **cost:** $0.0150

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** Right: the command opened Begin a Session's window and nothing was done until it was answered.

## session-1

### a2 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** in "Begin a Session" set vignette=true, newVow=Find who is raiding the Cinder Expanse lanes, newVowRank=dangerous and press "Begin" — _Fill the begin dialog_
- **Notebook:** Beat1: begun session dialog submitted; next press Swear it on vow card
- **Calls (4):** callRewardModel>proposeRewards (0.9 s); callNarratorAPI>narrateSessionVignette (3.8 s); callHaiku>defaultCallTierAPI (0.7 s); the AI player (3.0 s)
- **Time:** 14.4 s · **cost:** $0.0184

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. No character has a vow in play besides a background vow — swear an iron vow to give this session a quest. Spotlight vignette: Peril lies ahead or lurks just out of view All players take +1 momentum .

> **TABLE — Mira Kestrel**
>
> Mira Kestrel: Added Find who is raiding the Cinder Expanse lanes

> **TABLE — Gamemaster**
>
> 🆕 New vow recorded "Find who is raiding the Cinder Expanse lanes" (dangerous) Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress. On fulfilment: +2 Quests legacy ticks (strong hit) · +1 (weak hit). ⚔ Swear it (roll) Pick a reward for it below.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 3)

> **TABLE — Gamemaster**
>
> 🎁 Choose your reward Succeed and you'll earn one of these — or name your own and the narrator will work it in: A salvaged Ardent-class interdictor drone rigged to jam raider sensors, usable on any lane you patrol. Safe passage and a trusted informant in the Cinder Expanse freight guild who will pass you raider movement tips. Propose my own

> **NARRATOR (galley_begin) — Gamemaster**
>
> The galley on the *Kobayashi IV* is a counter, two stools, and a kettle that has outlived three owners. You eat reconstituted noodle bricks out of the pot, because the bowls went with the last owner too, and you season them with a pepper paste you suspect is older than the kettle. No one else is at the counter, so you carry both sides of the conversation. You decide the engineer is down in the aft crawlspace, teaching the coolant pump a lesson about loyalty. The navigator, you're fairly sure, is in the cargo hold, arguing with the star charts and winning, which is the worrying part. Somewhere below, a pipe knocks twice. You put your spoon down and look at the deck. "That was the pump," you say to the empty stool. "She says she's sorry."

**Notes.** Right: the session opened with the vow written in the dialog — on the sheet at dangerous, 0 ticks, +1 momentum from the spotlight roll, and its card posted with a Swear button. The opening scene keeps to the premise this time: "No one else is at the counter, so you carry both sides of the conversation", and the crew is something Mira "decides". **Wrong:** it gives her a line she did not say ("That was the pump," you say to the empty stool) — by design of the galley scene, which is asked to hand off on a line of dialogue.

### a3 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** click "⚔ Swear it (roll)" on m4 — _Swear the vow_
- **Notebook:** Beat1: pressed Swear it
- **Calls (8):** callClaudeAPI>interpretMove (1.6 s); defaultClassifyImplicit>resolveRelevance (0.3 s); callNarratorAPI>call (8.4 s); callNarratorAPI>narrateResolution (3.8 s); callHaiku>defaultCallTierAPI (0.4 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (2.7 s)
- **Roll:** swear_an_iron_vow → weak_hit — Action: 1 + 2 = 3 \| Challenge: 1, 6
- **GM's rules:** accepted the proposed move (swear_an_iron_vow)
- **Beat 1 done:** session 1 is open; the dangerous vow "Find who is raiding the Cinder Expanse lanes" is on the sheet at 0 ticks
- **Time:** 28.1 s · **cost:** $0.0484

> **TABLE — Mira Kestrel**
>
> Swear an iron vow: Find who is raiding the Cinder Expanse lanes.

> **NARRATOR — Gamemaster**
>
> You press your palm flat against the cold iron of the bulkhead, the one plate on Hollow Spire that no one has bothered to paint over. It is pitted and gritty, and it takes the warmth out of your hand faster than you expected. You say the words low, to the metal and not to anyone behind you, and the iron says nothing back, which is how you know it was heard.

> **TABLE — Gamemaster**
>
> Swear an Iron Vow +heart (2) Action: 1 + 2 = 3 | Challenge: 1, 6 Weak Hit Determined but uncertain. Take +1 momentum, envision how you find a path forward.

> **NARRATOR — Gamemaster**
>
> "Whoever you're after, they'll know your hull by sunup," a voice says from the corridor, low and unhurried. A water-ration clerk stands in the hatch, tally slate under one arm, not quite looking at you. She says the last supply run left Hollow Spire two hours before the board posted it. Someone had already told the lanes. She leaves before you can ask who.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Water-ration Clerk — An unnamed water-ration clerk in a corridor hatch, carrying a tally slate, who reveals the last supply run left Hollow Spire early. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Notes.** Right, by hand: Swear an Iron Vow +heart, 1 + 2 = 3 against 1 and 6 — a weak hit, +1 momentum (3 → 4), once. Two narrations for one move (the oath, then the result), as designed. The narrator made a hidden plan for the vow here and none of it is in the prose. **Friction:** a draft card for "Water-ration Clerk", a person with no name, as a connection to confirm.

### a4 · beat 2: Meet someone and make them a connection

- **Player:** say: I walk the Hollow Spire docks to the ledger stall of Tamsin Vey, the salvage broker, and greet her. — _meet Tamsin_
- **Notebook:** Beat2: met Tamsin line said
- **Calls (6):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (4.5 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (2.1 s); the AI player (2.4 s)
- **GM's rules:** confirmed the draft for Tamsin Vey, as the player character's connection (connection)
- **Time:** 17.0 s, 7.7 s from the line to its reply · **cost:** $0.0318

> **PLAYER — Playthrough Player**
>
> I walk the Hollow Spire docks to the ledger stall of Tamsin Vey, the salvage broker, and greet her.

> **NARRATOR — Gamemaster**
>
> The docks of Hollow Spire run narrow and wet-smelling, every pipe sweating a little. Tamsin Vey's ledger stall sits wedged between a condensate filter and a shuttered chandlery. She looks up as you come, thumb marking her place in a ledger gone soft at the corners. "You're the one who anchored the Kobayashi," she says. "Word moves faster than ships here. Buying, or asking?" Her thumb doesn't leave the page.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Tamsin Vey — Keeps a ledger stall in the docks of Hollow Spire, wedged between a condensate filter and a shuttered chandlery; knows of the player's anchoring of the Kobayashi. ✓ Confirmed All entities reviewed.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Tamsin Vey

**Notes.** Right: the player named Tamsin Vey in full, the detector proposed her, and the GM's rules confirmed her as Mira's connection — one card, a bond Item at 0. 7.7 s from the line to its reply.

### a5 · beat 2: Meet someone and make them a connection

- **Player:** say: I set out to make a connection with Tamsin Vey, and I offer her a fair cut of any salvage I turn up on the lanes. — _make connection_
- **Notebook:** Beat2: connection line said
- **Calls (6):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (1.9 s); callNarratorAPI>narrateResolution (4.9 s); callHaiku>defaultCallDetectionAPI (1.3 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.4 s)
- **Roll:** make_a_connection → strong_hit (scripted dice) — Action: 6 + 2 = 8 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (make_a_connection)
- **Beat 2 done:** Tamsin Vey is a dangerous connection held by Mira Kestrel; its bond Item reads 0 ticks; make_a_connection was rolled and there is still one card
- **Time:** 22.0 s, 10.8 s from the line to its reply · **cost:** $0.0388

> **PLAYER — Playthrough Player**
>
> I set out to make a connection with Tamsin Vey, and I offer her a fair cut of any salvage I turn up on the lanes.

> **TABLE — Gamemaster**
>
> Make a Connection +heart (2) Action: 6 + 2 = 8 | Challenge: 1, 2 Strong Hit Connection made. Give them a role and rank. 🤝 Develop Relationship 🔗 Forge a Bond

> **NARRATOR — Gamemaster**
>
> Tamsin closes the ledger on her thumb, then slides the thumb free. She counts your offer against the sweating pipes overhead, and it seems to come out in your favor. "A fair cut, from a woman who anchored without being asked. I'll take it," she says. "Here's your first payment: someone has been selling the lanes' timings by the hour. A man called Juro, always adorned in bright thread. He drinks at the water-board end of the docks." She lowers her voice. "He's trying to leave a rival behind. Ask him how."

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Juro — A man who has been selling the lanes' timings by the hour; drinks at the water-board end of the docks and wears bright thread. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Notes.** Right: Make a Connection, scripted to a strong hit (6 + 2 = 8 against 1 and 2), still one card for her. The narrator pays the hit with a lead of its own invention — Juro, "always adorned in bright thread", who sells the lanes' timings (plans about her and about Juro's rival are on file three steps later). **Friction:** a draft card for Juro; the GM's rules leave it, as a GM might.

### a6 · beat 3: Link the vow to them

- **Player:** choose "Tamsin Vey" in dropdown 1 on e1 — _Select Tamsin in dropdown_
- **Calls (1):** the AI player (2.2 s)
- **Time:** 4.7 s · **cost:** $0.0080

**Notes.** Right: the vow's card was more than twelve messages up; the player found it under "further up the chat" and chose Tamsin in its dropdown. In the third rehearsal this beat was lost to a view of the last twelve messages; the card itself gained its Link row only because of VOW-CARD-LINK-ONLY-AT-POSTING's fix.

### a7 · beat 3: Link the vow to them

- **Player:** click "Link" on e1 — _Press Link_
- **Notebook:** Beat3: chose Tamsin in dropdown, pressing Link
- **Calls (1):** the AI player (2.4 s)
- **Beat 3 done:** the vow "Find who is raiding the Cinder Expanse lanes" is linked to Tamsin Vey's card
- **Time:** 5.4 s · **cost:** $0.0081

> **TABLE — Gamemaster**
>
> 🤝 Linked to Tamsin Vey — fulfilling this vow will deepen that bond.

**Notes.** Right: Link pressed; the vow is linked to her card by its id, and the card says so.

### a8 · beat 4: Gather Information

- **Player:** say: I work the docks asking who saw the raiders last, risking my name and a few credits to loosen tongues. I search for answers. — _Gather Information line_
- **Notebook:** Beat3 linked; beat4 gather line said
- **Calls (6):** callClassifierAPI>classifyInput (0.6 s); callClaudeAPI>interpretMove (1.6 s); callNarratorAPI>narrateResolution (13.0 s); callHaiku>defaultCallDetectionAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (3.0 s)
- **Roll:** gather_information → strong_hit — Action: 5 + 3 = 8 \| Challenge: 6, 3
- **GM's rules:** accepted the proposed move (gather_information)
- **Beat 4 done:** gather_information was rolled at a8: strong_hit
- **Time:** 27.3 s, 17.3 s from the line to its reply · **cost:** $0.0492

> **PLAYER — Playthrough Player**
>
> I work the docks asking who saw the raiders last, risking my name and a few credits to loosen tongues. I search for answers.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 5 + 3 = 8 | Challenge: 6, 3 Strong Hit Path or action to make progress is clear. Take +2 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> A few credits change hands, and the tongues loosen on schedule. A pipe-fitter says the raiders never touch the thin runs. They hit whichever lane carries the most water. A deckhand says it again, nearly word for word, like something passed down the line. Then a boy at the water-board end tugs your sleeve. He points past the condensate drip. A man in bright thread is already watching you.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 6)

**Notes.** Right, by hand: Gather Information +wits, 5 + 3 = 8 against 6 and 3 — a strong hit, +2 momentum (4 → 6). The line was read as the move the beat asked for. **Slow:** 17.3 s from the line to its reply, the longest of the run; 13.0 s of it is the narrator's one call.

### a9 · beat 5: Plant facts F1–F4

- **Player:** say: I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry. — _Plant F1_
- **Notebook:** F1 compass said
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (3.7 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.7 s)
- **Time:** 16.5 s, 7.8 s from the line to its reply · **cost:** $0.0395

> **PLAYER — Playthrough Player**
>
> I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry.

> **NARRATOR — Gamemaster**
>
> Across the water-board end, Juro has stopped pretending to drink. His cup sits untouched, his eyes on your hands. You turn the compass over, and its brass catches the dock lamps. The needle swings, wavers, and settles on nothing in particular. Juro rises, bright thread bunching at his shoulders, and picks his way toward you between the sweating pipes. He stops a pace off. "That's a pretty piece," he says. "Is it for sale, or just for show?"

**Notes.** Right: F1 planted in the player's words, and the narrator used it at once (Juro asks if the compass is for sale). The scribe's entry names Mira and keeps the possession.

### a10 · beat 5: Plant facts F1–F4

- **Player:** say: I leave the cargo manifest with Tamsin for safekeeping. — _plant F2_
- **Notebook:** F2 manifest said
- **Calls (6):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (4.0 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.1 s)
- **Time:** 13.8 s, 5.5 s from the line to its reply · **cost:** $0.0241

> **PLAYER — Playthrough Player**
>
> I leave the cargo manifest with Tamsin for safekeeping.

> **NARRATOR — Gamemaster**
>
> "Safekeeping's a generous word," Tamsin says. She takes the manifest, glances at its first column, and tucks it under the soft-cornered ledger. Behind you, Juro's footsteps stop short of the stall. He has seen the handoff, and he doesn't pretend otherwise. Tamsin's thumb finds her page again. "I'll keep it dry and out of sight," she says. "Whoever's asking about it will have to ask me."

**Notes.** Right: F3 planted. The narrator has Tamsin tuck the manifest "under the soft-cornered ledger" — a detail it then keeps for three sessions.

### a11 · beat 5: Plant facts F1–F4

- **Player:** say: I promise Tamsin I'll be back before the next tide of cargo. — _Plant fact 3_
- **Notebook:** F3 promise said
- **Calls (6):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (3.7 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (5.4 s); the AI player (2.5 s)
- **Beat 5 done:** F1, F2, F3, F4 stated by the player
- **Time:** 19.6 s, 6.9 s from the line to its reply · **cost:** $0.0262

> **PLAYER — Playthrough Player**
>
> I promise Tamsin I'll be back before the next tide of cargo.

> **NARRATOR — Gamemaster**
>
> Tamsin doesn't look up. "Tide's a generous word on a dock with no sea," she says. "Come back and the manifest is dry. Don't, and it stays dry anyway." Behind you, Juro's footsteps retreat, unhurried, toward the water-board end. He stops there and turns his untouched cup a quarter-turn on the counter, watching your back the whole way. *Binding that promise to a vow of its own would be a Swear an Iron Vow.*

**Notes.** Right: F4 planted ("back before the next tide of cargo"). The narrator closes by offering Swear an Iron Vow for the promise; the player, on its beats, leaves it.

### a12 · beat 6: End a Session, noting a focus

- **Player:** say: !end-session — _Beat 6_
- **Notebook:** F1-F3 all said; beat6 typing !end-session
- **Calls (1):** the AI player (2.2 s)
- **Time:** 3.2 s · **cost:** $0.0096

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** Right: the command opened End a Session's window.

## after-session-1

### a13 · beat 6: End a Session, noting a focus

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with focus_
- **Notebook:** Beat6: end session submitted
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (2.0 s); callNarratorAPI>narrateSessionVignette (4.1 s); callNarratorAPI>getCampaignRecap (6.8 s); callHaiku>defaultCallTierAPI (0.7 s); the AI player (2.7 s)
- **Beat 6 done:** session 1 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 22.0 s · **cost:** $0.0494

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 7)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin Vey wipes the condensate off the stall's front rail with the cuff of her sleeve, then does it again because the first pass only moved the damp around. Beside her the filter ticks as it fills, one drop at a time, the only honest count on this dock. She slides the ledger a hand's width to the left so the corner of Mira Kestrel's manifest, tucked beneath it, doesn't show. Then she eats the last half of a protein cake, chewing slowly, reading a column of numbers she has read twice already. She pulls the lamp chain, and the stall goes dark.

**Notes.** Right: the focus was noted and paid +1 momentum (6 → 7), once. The closing scene cuts to Tamsin shutting her stall, the manifest's corner under the ledger — and the recap written after it is about Mira, not set at the stall (issue #374 A1, a second live sample). The summary is accurate. **To watch:** the closing scene is about the one NPC the session already centred on; see a46 and a85.

### a14 · beat 7: Begin a Session; ask probe set A

- **Player:** say: !begin-session — _Begin session 2_
- **Notebook:** Beat7 started: typed !begin-session
- **Calls (1):** the AI player (2.3 s)
- **Time:** 3.8 s · **cost:** $0.0094

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** Right: Begin a Session's window.

## session-2

### a15 · beat 7: Begin a Session; ask probe set A

- **Player:** in "Begin a Session" press "Begin" — _Submit begin window_
- **Notebook:** Beat7: begin dialog submitted; next ask 4 probe questions
- **Calls (3):** callNarratorAPI>narrateSessionVignette (6.9 s); callHaiku>defaultCallTierAPI (0.8 s); the AI player (2.9 s)
- **Time:** 15.3 s · **cost:** $0.0399

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> The galley on the Kobayashi IV is a table bolted to the deck and a kettle that has outlasted three owners. You are working through a bowl of reconstituted noodles with a spoonful of pepper paste stirred in, because Wits 3 is a lot of thinking to do on bland food. Ilse's brass compass sits by your elbow, its needle swinging lazily toward nothing in particular. There is no one else aboard to fill the other chairs, so you have invented a crew. The engineer, you decide, is down in the coolant room teaching the pump to knock in a rhythm, on the theory that a ship who can count can be reasoned with. The navigator is in the cargo hold, apologizing to a crate of water filters for the way the dockhands treated it. The cook, who makes the noodles taste like this, is presumably in the airlock, negotiating terms with a pepper plant. The pump knocks twice through the pipes, which is either agreement or indigestion. You push the bowl an inch toward the empty chair across from you. "Don't tell me you think it can hear us," you say to nobody, and wait to see which of the three of you answers.

**Notes.** Right: session 2 opened, last session's focus on its card. The opening now says outright that the crew is imagined — "There is no one else aboard to fill the other chairs, so you have invented a crew." **Wrong:** it repeats the first opening's furniture — the kettle "that has outlasted three owners", the noodles and pepper paste, the engineer teaching the coolant pump (20 of its 84 content words; GALLEY-VIGNETTE-REPEATS); it puts a stat in the fiction ("because Wits 3 is a lot of thinking to do on bland food"); it speaks for the character again; and it has Ilse's compass "by your elbow" before any question is asked — so F1's questions in this session are not recall.

### a16 · beat 7: Begin a Session; ask probe set A

- **Player:** say: What do I still carry that belonged to my sister? — _Probe 1_
- **Notebook:** Beat7: asking probes; Q1 sent
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (3.8 s); callHaiku>defaultCallDetectionAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.3 s)
- **Time:** 17.0 s, 6.5 s from the line to its reply · **cost:** $0.0263

> **PLAYER — Playthrough Player**
>
> What do I still carry that belonged to my sister?

> **NARRATOR — Gamemaster**
>
> The pump knocks again, once, as though it had been waiting for the question. Your hand has already found the compass. The brass is warm from the lamp, scratched along one edge where Ilse used to thumb it. The needle drifts, steadies, points at the hatch. You turn it face-down on the table, and the galley goes quiet enough to hear someone walking the docks outside. The footsteps stop at your airlock.

**Notes.** Right: F1 answered — "Your hand has already found the compass… scratched along one edge where Ilse used to thumb it." Not counted as recall: the opening had it (a15).

### a17 · beat 7: Begin a Session; ask probe set A

- **Player:** say: What is the name of the salvage broker I befriended at Hollow Spire? — _Probe 2_
- **Notebook:** Beat7: Q2 sent
- **Calls (6):** callClassifierAPI>classifyInput (0.6 s); callNarratorAPI>narratePacedInput (2.6 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (2.0 s); the AI player (2.7 s)
- **Time:** 14.6 s, 4.3 s from the line to its reply · **cost:** $0.0220

> **PLAYER — Playthrough Player**
>
> What is the name of the salvage broker I befriended at Hollow Spire?

> **NARRATOR — Gamemaster**
>
> "Tamsin Vey," a voice says through the airlock, as if answering you. "Ledger stall, wedged between the filter and the shuttered chandlery. She says you owe her a cargo tide." You say the name once more, aloud, to hold it still. The pump knocks twice. Whoever stands outside has not touched the hatch. They are waiting for you to open it.

**Notes.** Right: F2 recalled at 13 actions — "Tamsin Vey… Ledger stall, wedged between the filter and the shuttered chandlery" — stored, in the prompt (WORLD SNAPSHOT, CHARACTER), in the answer. **A pattern begins:** the answer comes from a stranger outside the airlock who knows what Mira is asking herself. The narrator has to answer a question the character would not ask aloud, and invents somebody who can.

### a18 · beat 7: Begin a Session; ask probe set A

- **Player:** say: Who is holding the cargo manifest I was carrying? — _probe 3_
- **Notebook:** Beat7: Q3 sent
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (4.6 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (3.0 s); the AI player (2.2 s)
- **Time:** 18.5 s, 7.0 s from the line to its reply · **cost:** $0.0247

> **PLAYER — Playthrough Player**
>
> Who is holding the cargo manifest I was carrying?

> **NARRATOR — Gamemaster**
>
> The voice outside answers before you finish asking. "Tamsin Vey holds it, under her ledger," it says. "She told me to say it's safe. She also said you'd want it said twice." The pump knocks once, flat, like a ruling. Through the hatch's seam you catch a smell of condensate and hot dock metal. The voice does not mention how it knows what you carried. *If you want to learn who this messenger really answers to, this could be a Gather Information.*

**Notes.** Right: F3 recalled at 8 actions ("Tamsin Vey holds it, under her ledger"). The same voice answers; the narration offers Gather Information on who the messenger answers to.

### a19 · beat 7: Begin a Session; ask probe set A

- **Player:** say: By when did I promise to return? — _Ask fourth probe_
- **Notebook:** Beat7: Q4 sent
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (4.3 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (2.6 s)
- **Beat 7 done:** probe set A: 4 question(s) asked
- **Time:** 16.0 s, 6.2 s from the line to its reply · **cost:** $0.0261

> **PLAYER — Playthrough Player**
>
> By when did I promise to return?

> **NARRATOR — Gamemaster**
>
> The spoon stops halfway to your mouth. Outside, the voice takes its time. "Before the next cargo tide," it says. "Tamsin was particular about that. Said you'd know it was a loose word, but a firm one." The pump knocks once against the pipes. Your hand rests on the face-down compass. The footsteps shift on the deck plating, and the voice adds, "She's closing the stall tonight. Anyone else asking for that manifest will find her already gone."

**Notes.** Right: F4 answered ("Before the next cargo tide"). Not counted: a17's answer had already said "you owe her a cargo tide".

### a20 · beat 8: Travel to the second settlement

- **Player:** say: I plot the course and take the Kobayashi IV to Bleakhold Station. — _beat 8_
- **Notebook:** Beat8: course line said
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callClaudeAPI>interpretMove (1.6 s); callNarratorAPI>narrateResolution (3.6 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.4 s)
- **Roll:** set_a_course → strong_hit — Action: 4 + 5 = 9 \| Challenge: 7, 5
- **GM's rules:** accepted the proposed move (set_a_course)
- **Beat 8 done:** the ship is at Bleakhold Station, its token on the pin
- **Time:** 16.6 s, 8.1 s from the line to its reply · **cost:** $0.0292

> **PLAYER — Playthrough Player**
>
> I plot the course and take the Kobayashi IV to Bleakhold Station.

> **TABLE — Gamemaster**
>
> Set a Course +supply (5) Action: 4 + 5 = 9 | Challenge: 7, 5 Strong Hit Arrived, situation favors you. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Set a Course resolved Arrived at Bleakhold Station . Course held cleanly (+1 momentum). Token moved to Bleakhold Station .

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV slides into Bleakhold's docking cradle with a clean lane behind it and no tide yet turned. Clamps seat with a dull clang. The pump knocks once, steady now. Outside the viewport, corporate lamps wash the bay white, and a cargo sled idles at the next berth. A dock officer in a grey coat is already walking toward your hatch, tablet raised, saying your hull number aloud.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 8)

**Notes.** Right, by hand: Set a Course +supply, 4 + 5 = 9 against 7 and 5 — a strong hit, +1 momentum (7 → 8); the location and the ship's token both moved to Bleakhold Station, on a hit. This is the move the memory run narrated without rolling (OFFERED-MOVE-NARRATED-AS-DONE); here the reader was sure.

### a21 · beat 9: Enter a fight that serves the vow

- **Player:** say: !truth set "raider cutter" is named the Ashen Wake — _beat 9 first step_
- **Notebook:** Beat8 arrived Bleakhold; beat9 truth cmd sent
- **Calls (1):** the AI player (2.3 s)
- **Time:** 5.2 s · **cost:** $0.0099

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Ashen Wake

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Ashen Wake tr-ca277 .

**Notes.** Right: the truth was recorded with its id on its card.

### a22 · beat 9: Enter a fight that serves the vow

- **Player:** say: The raider cutter Ashen Wake jumps me off Bleakhold; I turn the Kobayashi IV to face it and enter the fray. — _enter fray_
- **Notebook:** Beat9: truth set done; entering fray line said
- **Calls (3):** callClassifierAPI>classifyInput (0.6 s); callClaudeAPI>interpretMove (2.5 s); the AI player (3.0 s)
- **Roll:** enter_the_fray → weak_hit — Action: 1 + 3 = 4 \| Challenge: 4, 1
- **GM's rules:** accepted the proposed move (enter_the_fray)
- **Time:** 10.6 s · **cost:** $0.0103

> **PLAYER — Playthrough Player**
>
> The raider cutter Ashen Wake jumps me off Bleakhold; I turn the Kobayashi IV to face it and enter the fray.

> **TABLE — Gamemaster**
>
> ⚔ A fight looms — Ashen Wake Commit to the fight, or look for a way out. The narrator suggests this is a dangerous fight. Difficulty: troublesome dangerous formidable extreme epic This fight serves: (not tied to a vow) Find who is raiding the Cinder Expanse lanes Objective: ⚔ Enter the Fray 🚪 Find another way

> **TABLE — Gamemaster**
>
> Enter the Fray +wits (3) Action: 1 + 3 = 4 | Challenge: 4, 1 Weak Hit Weak hit: choose one — +2 momentum (and begin in a bad spot) OR you are in control. 🎲 There's more going on here than the obvious move. 🔥 Burn Momentum (8 → Strong Hit) Keep the result Not narrated yet: burn or improve the result, or keep it — the narration follows your choice. Your next line keeps it.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: +2 momentum (you begin in a bad spot) You are in control Burn momentum or improve the result first — choosing here is the move's consequence, and closes them.

**Notes.** Right in its numbers — Enter the Fray +wits, 1 + 3 = 4 against 4 and 1, a weak hit, held because momentum could improve it. **Odd in its order:** the one line posted the "A fight looms" card — "Commit to the fight, or look for a way out" — *and* rolled Enter the Fray, and a third card asking for the weak hit's choice. The player is asked whether to commit after the dice have been thrown. The fight's track is made only when the first card's button is pressed (a25).

### a23 · beat 9: Enter a fight that serves the vow

- **Player:** click "Keep the result" on m11 — _Keep the result as instructed_
- **Notebook:** Beat9: fray rolled weak hit (vow not linked); keeping result
- **Calls (5):** callNarratorAPI>narrateResolution (4.6 s); callHaiku>defaultCallDetectionAPI (1.4 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (3.8 s)
- **Time:** 15.6 s · **cost:** $0.0325

> **NARRATOR — Gamemaster**
>
> The dock officer stops mid-stride, tablet still raised, as the bay lamps flicker and a proximity tone cuts across the dock channel. Past the viewport, the *Ashen Wake* breaks from the debris shadow, closing fast. You swing the *Kobayashi IV* nose-on and read its guns hot and its heading steady. You have the angle, but you also have a hull parked half in a cradle. The pump knocks once. The dock officer's voice crackles over comms: "Hull number confirmed. Who is that behind you?"

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Ashen Wake — A vessel that breaks from the debris shadow and closes fast on the dock, its guns presumably hot. Confirm Dismiss [⬡ Connection] Dock Officer — The dock officer who stops mid-stride with a tablet raised and speaks over comms asking for hull confirmation and who is behind the PC. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Notes.** Right: the player kept the weak hit as its notes tell it to; the narration followed. The weak hit's own choice (+2 momentum in a bad spot, or in control) was not answered by the player: the fight went on as in control with no momentum taken, which is one of its two options. **Friction:** a draft card proposing the Ashen Wake as a ship and the dock officer as a connection.

### a24 · beat 9: Enter a fight that serves the vow

- **Player:** choose "Find who is raiding the Cinder Expanse lanes" in dropdown 2 on m9 — _Tie fight to vow_
- **Notebook:** Beat9: choosing vow on m9 dropdown
- **Calls (1):** the AI player (3.8 s)
- **Time:** 4.6 s · **cost:** $0.0115

**Notes.** Right: the player chose the vow in the fight card's second dropdown.

### a25 · beat 9: Enter a fight that serves the vow

- **Player:** click "⚔ Enter the Fray" on m9 — _Vow is selected; press Enter the Fray._
- **Notebook:** Beat9: vow chosen, pressed Enter the Fray on m9
- **Calls (1):** the AI player (2.5 s)
- **Beat 9 done:** the dangerous fight "Ashen Wake" is open, serving the vow "Find who is raiding the Cinder Expanse lanes"
- **Time:** 7.1 s · **cost:** $0.0099

> **TABLE — Gamemaster**
>
> Enter the Fray Created combat track Ashen Wake (dangerous). This fight's progress lives in the Progress Tracks panel. Winning this fight is a milestone on your vow: “Find who is raiding the Cinder Expanse lanes”. Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress. ⊕ Open Progress Tracks ⚔ Battle instead Prefer to settle it in one stroke? Battle resolves the whole fight with a single roll instead of marking the track move by move.

**Notes.** Right: the fight's track was created — dangerous, serving the vow — and the card offers Battle as the one-roll alternative.

### a26 · beat 10: A scripted miss in the fight

- **Player:** say: I'm in control, so I strike: I line up the Kobayashi IV's guns and fire at the Ashen Wake. — _Attack_
- **Notebook:** Beat10: strike line said
- **Calls (7):** callClassifierAPI>classifyInput (0.7 s); callClaudeAPI>interpretMove (1.4 s); callNarratorAPI>narrateResolution (8.5 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (4.9 s); the AI player (2.8 s)
- **Roll:** strike → miss (scripted dice) — Action: 1 + 2 = 3 \| Challenge: 10, 9
- **GM's rules:** accepted the proposed move (strike)
- **Beat 10 done:** strike missed at a26; its price named no suffer move and was paid in the story — the suffer path was not exercised
- **Time:** 26.2 s, 13.6 s from the line to its reply · **cost:** $0.0532

> **PLAYER — Playthrough Player**
>
> I'm in control, so I strike: I line up the Kobayashi IV's guns and fire at the Ashen Wake.

> **TABLE — Gamemaster**
>
> Pay the Price Strike As stated before the roll: Your rounds scatter wide and the raider cutter closes on the hull still half-seated in Bleakhold's cradle.

> **TABLE — Gamemaster**
>
> Strike +edge (2) Action: 1 + 2 = 3 | Challenge: 10, 9 Miss Fight turns against you. You are in a bad spot. Pay the Price. ⚔ Attempt to Finish the Fight: Ashen Wake

> **NARRATOR — Gamemaster**
>
> "Hull number confirmed," the dock officer says again, quieter now, tablet lowered. You fire, and the rounds scatter wide, chewing bay plating and nothing else. The *Ashen Wake* does not flinch. It closes on the *Kobayashi IV*, still half-seated in its cradle, and the clamps will not let go in time. The pump knocks once, flat. The officer asks, "Is that one of yours?"

**Notes.** Right in its numbers: Strike +edge, scripted to 1 + 2 = 3 against 10 and 9 — a miss, and the position turned to a bad spot. **Not what the beat was for:** the price was the one stated before the roll ("Your rounds scatter wide and the raider cutter closes on the hull") and was paid in the story. No d100 was rolled, no suffer move was owed, no meter moved — so the suffer path this beat exists to exercise was not walked, and the scripted price (78) was never used. The run's own check called the beat done on a later card (a30); corrected, it says done, "the suffer path was not exercised". The price's card stands above the roll's again (MISS-CARDS-ABOVE-THE-ROLL, a second sample). 13.6 s to the reply.

### a27 · beat 10: A scripted miss in the fight

- **Player:** wait 5s — _Wait for the cost card._
- **Notebook:** Beat10: strike missed; waiting for pay-the-price card
- **Calls (1):** the AI player (3.2 s)
- **Time:** 5.1 s · **cost:** $0.0104

**Notes.** The runner's: told to "choose a cost on the card it gives you", the player waited for a card that was not coming. The beat's wording has been changed to say a price may be paid in the story.

### a28 · beat 10: A scripted miss in the fight

- **Player:** wait 10s — _No cost card with buttons yet._
- **Notebook:** Beat10: still waiting for pay-the-price card with buttons
- **Calls (1):** the AI player (2.5 s)
- **Time:** 11.4 s · **cost:** $0.0102

**Notes.** The same wait, ten seconds more.

### a29 · beat 10: A scripted miss in the fight

- **Player:** say: I take the hit on the chin and grit my teeth; I endure the stress of being pinned in the cradle. — _No pay card buttons offered; state cost in play._
- **Notebook:** Beat10: said endure stress line; no cost card seen
- **Calls (5):** callClassifierAPI>classifyInput (0.6 s); callClaudeAPI>interpretMove (1.8 s); callNarratorAPI>narrateResolution (3.4 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.0 s)
- **Roll:** endure_stress → strong_hit — Action: 5 + 5 = 10 \| Challenge: 7, 5
- **GM's rules:** accepted the proposed move (endure_stress)
- **Time:** 16.2 s, 7.8 s from the line to its reply · **cost:** $0.0465

> **PLAYER — Playthrough Player**
>
> I take the hit on the chin and grit my teeth; I endure the stress of being pinned in the cradle.

> **TABLE — Gamemaster**
>
> Endure Stress +spirit (5) Action: 5 + 5 = 10 | Challenge: 7, 5 Strong Hit Choose: shake it off (if not shaken, +1 spirit) OR embrace the darkness (+1 momentum).

> **NARRATOR — Gamemaster**
>
> You breathe out through your teeth and let the cradle's grip be what it is. The clamps hold, the hull groans, and your hands stop shaking before the panel lights stop flashing. On the comm, the dock officer asks again, flatter this time, who is behind you. The pump knocks once. Past the viewport, the *Ashen Wake* has stopped closing, its guns still hot and its nose pointed at your hatch.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: +1 spirit (if not shaken) +1 momentum

**Notes.** The player's way out: it typed an Endure Stress of its own. Right in its numbers — +spirit, 5 + 5 = 10 against 7 and 5, a strong hit — and a free roll: nothing was suffered first, spirit was already full.

### a30 · beat 10: A scripted miss in the fight

- **Player:** click "+1 spirit (if not shaken)" on m12 — _Answer the resolve consequence card._
- **Notebook:** Beat10: endure stress resolved, chose +1 spirit
- **Calls (1):** the AI player (2.8 s)
- **Time:** 4.9 s · **cost:** $0.0104

> **TABLE — Gamemaster**
>
> Mira Kestrel: 0 spirit (now 5)

**Notes.** Right: "+1 spirit (if not shaken)" at 5 of 5 stays 5, and the card says "0 spirit (now 5)" — in bounds.

### a31 · beat 11: A scripted weak hit, then Burn Momentum

- **Player:** say: I'm in a bad spot now, so I clash: I swing the Kobayashi IV's guns around and hit the Ashen Wake head-on. — _Attack again_
- **Notebook:** Beat11: clash line said, awaiting card
- **Calls (3):** callClassifierAPI>classifyInput (0.6 s); callClaudeAPI>interpretMove (1.6 s); the AI player (2.4 s)
- **Roll:** clash → weak_hit (scripted dice) — Action: 1 + 1 = 2 \| Challenge: 1, 7
- **GM's rules:** accepted the proposed move (clash)
- **Time:** 11.6 s · **cost:** $0.0109

> **PLAYER — Playthrough Player**
>
> I'm in a bad spot now, so I clash: I swing the Kobayashi IV's guns around and hit the Ashen Wake head-on.

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on Ashen Wake .

> **TABLE — Gamemaster**
>
> Clash +iron (1) Action: 1 + 1 = 2 | Challenge: 1, 7 Weak Hit Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price. 🔥 Burn Momentum (8 → Strong Hit) Keep the result Nothing has been paid or narrated yet: burn or improve the result, or keep it — the price and the narration follow your choice. Your next line keeps it. ⚔ Attempt to Finish the Fight: Ashen Wake

**Notes.** Right in its numbers: Clash +iron, scripted to 1 + 1 = 2 against 1 and 7 — a weak hit with momentum 8 above the higher die, so Burn is offered. **To look at:** "Marked progress once on Ashen Wake" is posted *before* the choice, under a card that says "Nothing has been paid or narrated yet". The total comes out right (a32); the card's sentence is not quite true.

### a32 · beat 11: A scripted weak hit, then Burn Momentum

- **Player:** click "🔥 Burn Momentum (8 → Strong Hit)" on m12 — _Beat asks to burn momentum on weak hit._
- **Notebook:** Beat11: pressed Burn Momentum on m12
- **Calls (5):** callNarratorAPI>narrateResolution (4.2 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (2.4 s); the AI player (2.7 s)
- **Beat 11 done:** clash came up weak_hit at a31 and momentum was burned for strong_hit
- **Time:** 15.6 s · **cost:** $0.0306

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on Ashen Wake .

> **NARRATOR — Gamemaster**
>
> The dock officer lowers the tablet and steps back from the hatch. You swing the guns round, and this time the rounds find the *Ashen Wake*. Fresh weld seams flare along its hull, and the cutter slews off its approach, nose dragged wide. The pump knocks once. On the comm, the officer says, "Whoever that is, they're not here for the docking fee."

**Notes.** Right: the burn made it a strong hit, a second mark was added (two marks, 16 ticks — the strong hit's count, not three), momentum reset to 2, once. The narration is of the strong hit only.

### x12 · beat 12: Interruption: the GM's page reloads mid-fight

- **Interruption:** the GM's page reloaded — the page came back and the world went quiet
- **Beat 12 done:** after the reload: the fight "Ashen Wake" at 16 ticks, the meters unchanged, the lock free

> **TABLE — Gamemaster**
>
> ◈ Campaign Setup No World Truths have been established for this campaign. Set World Truths ▸

**Notes.** Right, and the point of the beat: the GM's page was reloaded mid-fight and the fight's track, its 16 ticks, the meters and the free lock all came back as they were. **Friction:** the reload posted "No World Truths have been established for this campaign — Set World Truths" into the chat in the middle of the fight. The world has none because the charter seeds none; the card is a set-up reminder that arrives on every load.

### a33 · beat 13: Take Decisive Action; mark the milestone

- **Player:** click "⚔ Attempt to Finish the Fight: Ashen Wake" on m10 — _Finish the fight_
- **Notebook:** Beat13: pressed Attempt to Finish on m10
- **Calls (4):** callNarratorAPI>narrateResolution (3.0 s); callHaiku>defaultCallDetectionAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.5 s)
- **Roll:** take_decisive_action → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (take_decisive_action)
- **Time:** 14.9 s · **cost:** $0.0254

> **TABLE — Mira Kestrel**
>
> Take decisive action to seize the objective — Ashen Wake.

> **TABLE — Gamemaster**
>
> Fight over Ashen Wake marked complete.

> **TABLE — Gamemaster**
>
> ⚔ Victory — a milestone toward your vow You won the fight serving “Find who is raiding the Cinder Expanse lanes”. ⚑ Mark milestone (×1) 🏁 Attempt to Fulfill 🤝 Deepen your bond with Tamsin Vey

> **TABLE — Gamemaster**
>
> Take Decisive Action progress (16 ticks) Progress: 4 | Challenge: 1, 2 Strong Hit Prevail. Take +1 momentum.

> **NARRATOR — Gamemaster**
>
> The *Ashen Wake* drifts clear of the bay mouth, hull scorched along its weld seams. It does not fire again. Its guns stay hot, but its pilot has stopped pushing. The pump knocks once. The dock officer finally lifts the tablet, thumb hovering. "Cutter's holding station," the officer says. "Someone wants a word with you, and it isn't me."

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 3)

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Cutter — Entity holding station outside the bay who wants a word with the player character. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Notes.** Right, by hand: Take Decisive Action on 16 ticks — progress 4 against a scripted 1 and 2, a strong hit, +1 momentum (2 → 3); the track is marked complete and the victory card names the vow. The cards stand in the order "Fight over", "Victory", then the roll. The narration keeps a plan's secret: the cutter "holds station" and "someone wants a word with you". **Friction:** a draft card for "Cutter" as a connection — a ship, proposed as a person.

### a34 · beat 13: Take Decisive Action; mark the milestone

- **Player:** click "⚑ Mark milestone (×1)" on m9 — _Mark milestone on victory card_
- **Notebook:** Beat13: pressed Mark milestone on m9
- **Calls (1):** the AI player (2.5 s)
- **Beat 13 done:** Take Decisive Action came up strong_hit; the milestone (×1) is marked on "Find who is raiding the Cinder Expanse lanes"
- **Time:** 6.8 s · **cost:** $0.0092

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** Right: the milestone marked 8 ticks on the vow (dangerous), once, and the victory card's button is spent.

### x14 · beat 14: Interruption: End a Session opened and closed unanswered

- **Interruption:** End a Session was opened on the player's screen and closed unanswered — closed by its close control
- **Beat 14 done:** End a Session was opened and closed unanswered: the session is open, nothing was paid, the lock is free

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** Right: End a Session was opened on the player's screen and closed unanswered; the session is open, nothing was paid, no lock is held.

### a35 · beat 15: Interruption: the X-Card on one narration

- **Player:** say: I look over the wreckage drifting off the bay mouth and say what I see. — _Beat 15 ordinary play line_
- **Notebook:** Beat15: said wreckage line
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (4.4 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (2.3 s)
- **Time:** 16.3 s, 6.7 s from the line to its reply · **cost:** $0.0333

> **PLAYER — Playthrough Player**
>
> I look over the wreckage drifting off the bay mouth and say what I see.

> **NARRATOR — Gamemaster**
>
> The dock officer has stopped watching the cutter and is watching the debris instead, tablet forgotten at one hip. Past the bay mouth, plating from your own rounds tumbles slowly, bright where it was torn. Among it drifts a strip of the *Ashen Wake's* hull, a fresh weld seam over an older mark. You make out part of the mark. The pump knocks once. On the comm, a new voice says your name, not your hull number.

**Notes.** Right: an ordinary line, narrated — a strip of the cutter's hull with "a fresh weld seam over an older mark", recorded as a truth of the scene. This is the narration the next step removes.

### x15 · beat 15: Interruption: the X-Card on one narration

- **Interruption:** the X-Card was played from the player's client (!x); the GM resumed (!x clear) — the X-Card went up and came down
- **Beat 15 done:** 1 narration(s) removed; none of their facts stands, and play has resumed

> **TABLE — Mira Kestrel**
>
> X-Card Scene paused. Current content is suppressed. The story will redirect at the next narration beat. Resume narration

> **TABLE — Gamemaster**
>
> X-Card cleared The GM has resumed narration.

**Notes.** Right — **and the run's own check said otherwise.** The X-Card retracted that narration's truth (`retractedBy: xcard`), no Chronicle entry of it was kept, and play resumed. The check failed the beat because the truth had stood in the step *before* the card was played, which is when it should have stood. Corrected to read the table as it is after the card; the run's class, `product-failure`, was the check's fault and nothing of the module's.

### a36 · beat 16: Correct an earlier fact

- **Player:** say: !truth list — _list truths_
- **Notebook:** Beat16: said !truth list
- **Calls (1):** the AI player (2.3 s)
- **Time:** 5.3 s · **cost:** $0.0089

> **PLAYER — Playthrough Player**
>
> !truth list

> **TABLE — Mira Kestrel**
>
> ◈ Fact Continuity Truths in this scene — strike one with !truth strike &lt;id&gt; : tr-97157 Ilse's compass — brass star-compass, scratched along one edge where Ilse thumbed it; its needle settled pointing at the galley hatch tr-afa0d Tamsin Vey — holds Mira Kestrel's cargo manifest under her ledger; has sent a messenger to the Kobayashi IV's airlock to say so tr-d56b2 Mira Kestrel — promised Tamsin Vey she would return before the next cargo tide; Tamsin treats it as a firm but loose deadline tr-a7f8f Tamsin Vey — is closing her ledger stall tonight, leaving the manifest hidden under the ledger tr-ca277 raider cutter — is named the Ashen Wake tr-dd719 Ashen Wake — raider cutter that has jumped the Kobayashi IV off Bleakhold Station; weapons hot, closing fast tr-427c5 Ashen Wake — hull plates carry fresh weld seams over an older mark; took hits from the Kobayashi IV's guns and was forced off its approach

**Notes.** Right: `!truth list` shows seven truths with their ids; the X-Carded one is not among them.

### a37 · beat 16: Correct an earlier fact

- **Player:** say: !truth strike tr-ca277 — _strike old entry_
- **Notebook:** Beat16: struck tr-ca277; next set Cinder Wren
- **Calls (1):** the AI player (2.4 s)
- **Time:** 4.3 s · **cost:** $0.0095

> **PLAYER — Playthrough Player**
>
> !truth strike tr-ca277

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth tr-ca277 struck.

**Notes.** Right: the naming truth was struck.

### a38 · beat 16: Correct an earlier fact

- **Player:** say: !truth set "raider cutter" is named the Cinder Wren — _Final step of correction_
- **Notebook:** Beat16: set Cinder Wren said
- **Calls (1):** the AI player (2.8 s)
- **Beat 16 done:** the old value is struck and "is named the Cinder Wren" stands; 2 other truth(s) are still filed under the old name ("Ashen Wake — raider cutter that has jumped the Kobayashi IV off Bleakhold")
- **Time:** 4.1 s · **cost:** $0.0091

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Cinder Wren

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Cinder Wren tr-acf30 .

**Notes.** Right: the corrected name was set — and here the run's own check went wrong a second time. It wanted no standing truth to hold the old name anywhere; two truths the narrator had filed under "Ashen Wake" as their *subject* stand, and no command renames a subject. The correction the player was asked to make was made. Corrected, the check says done, and says what is still filed under the old name — which is the real finding of this beat (CORRECTION-AND-RENAME-DO-NOT-REACH-THE-RECORD).

### a39 · beat 16: Correct an earlier fact

- **Player:** wait 5s — _Beat done; wait for observer._
- **Notebook:** Beat16 complete: struck and set Cinder Wren (tr-acf30)
- **Calls (1):** the AI player (2.2 s)
- **Time:** 5.2 s · **cost:** $0.0091

**Notes.** The runner's: with the check holding the beat open, the player — which had done what it was asked — waited. Five waits, a39 to a43, about forty seconds and four cents, bought by a wrong check.

### a40 · beat 16: Correct an earlier fact

- **Player:** wait 5s — _Beat complete; wait for observer to advance._
- **Notebook:** Beat16 done; waiting for observer
- **Calls (1):** the AI player (1.7 s)
- **Time:** 5.2 s · **cost:** $0.0090

**Notes.** The same wait.

### a41 · beat 16: Correct an earlier fact

- **Player:** wait 10s — _Beat complete; wait for observer._
- **Notebook:** Beat16 done; still waiting
- **Calls (1):** the AI player (2.8 s)
- **Time:** 10.3 s · **cost:** $0.0089

**Notes.** The same wait.

### a42 · beat 16: Correct an earlier fact

- **Player:** wait 10s — _Beat complete; waiting for observer._
- **Notebook:** Beat16 done; still waiting
- **Calls (1):** the AI player (2.3 s)
- **Time:** 11.0 s · **cost:** $0.0088

**Notes.** The same wait.

### a43 · beat 16: Correct an earlier fact

- **Player:** wait 10s — _Beat done; waiting for observer._
- **Notebook:** Beat16 done; still waiting
- **Calls (1):** the AI player (2.5 s)
- **Time:** 11.1 s · **cost:** $0.0088

**Notes.** The same wait; the run then gave the beat up as not reached.

### a44 · beat 17: Ask the oracle

- **Player:** say: !oracle yes likely Is anyone left alive aboard the wreck? — _beat 17_
- **Notebook:** Beat17: said oracle line
- **Calls (3):** callNarratorAPI>narrateOracleFollowup (3.4 s); callHaiku>defaultCallDetectionAPI (0.8 s); the AI player (2.4 s)
- **Beat 17 done:** the oracle answered NO (MATCH — extreme/twist)
- **Time:** 15.1 s, 6.1 s from the line to its reply · **cost:** $0.0438

> **PLAYER — Playthrough Player**
>
> !oracle yes likely Is anyone left alive aboard the wreck?

> **TABLE — Mira Kestrel**
>
> Ask the Oracle (likely) Is anyone left alive aboard the wreck? d100 = 100 → NO · MATCH — envision an extreme result or twist

> **NARRATOR — Gamemaster**
>
> The question hangs in the bay a moment, and the answer is the plain one: no. The *Ashen Wake* holds station beyond the lamps, scorched along its weld seams, and the channel from it carries nothing, no hail and no breath, only a flat carrier hum that does not break. The pump knocks once against the pipes, and the dock officer lowers the tablet and stops reading your hull number aloud. The hum is the odd part. It is too steady for a hull gone dead, and too patient for one gone empty, as if the silence has been arranged for you to listen to.

**Notes.** Right in its numbers: likely odds, d100 = 100 — no, and a match; the follow-up narrates the no and its twist (a carrier hum "too patient for one gone empty"). **Wrong:** it calls the cutter "the *Ashen Wake*", six actions after the player corrected the name. The prompt did carry the correction — the scene's CORRECTED block — beside the old name in the snapshot's events, the clock, the scene's "Now" line, two truths filed under it, the plan's own name and the recent scene.

### x18 · beat 18: Interruption: the GM renames the connection's card

- **Interruption:** the GM renamed Tamsin Vey's card to Tamsin Okoro — renamed
- **Beat 18 done:** Tamsin Vey is now Tamsin Okoro; the vow "Find who is raiding the Cinder Expanse lanes" shows the new name

> **TABLE — Tamsin Okoro**
>
> Renamed to Tamsin Okoro

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Vey renamed to Tamsin Okoro

**Notes.** Right: the GM renamed the card; one card, and the vow's link shows the new name. The table posts "Tamsin Vey renamed to Tamsin Okoro". **Nothing tells the narrator:** no later prompt says a card was renamed (see a55).

### a45 · beat 19: End a Session

- **Player:** say: !end-session — _Begin beat 19_
- **Notebook:** Beat19: said !end-session
- **Calls (1):** the AI player (2.3 s)
- **Time:** 3.8 s · **cost:** $0.0086

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** Right: End a Session's window.

## after-session-2

### a46 · beat 19: End a Session

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with quest focus_
- **Notebook:** Beat19: submitted End Session
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (2.1 s); callNarratorAPI>narrateSessionVignette (4.8 s); callNarratorAPI>getCampaignRecap (7.7 s); callHaiku>defaultCallTierAPI (0.6 s); the AI player (2.2 s)
- **Beat 19 done:** session 2 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 25.2 s · **cost:** $0.0584

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin Okoro drops the stall's shutter one slat at a time, because the bottom hinge sticks and she has stopped fighting it. The ledger goes into the crate behind the condensate filter, wrapped in a ration-board tarp that smells of old coffee. She eats a cold noodle cake standing up, chewing it slowly and wiping her thumb on her sleeve. Down the dock a lamp in the shuttered chandlery gutters and steadies, and she watches it do that twice. Then she pockets the stall key, checks the pocket, and checks it again.

**Notes.** Right: +1 momentum (3 → 4) for the focus. The closing scene uses the new name ("Tamsin Okoro drops the stall's shutter"). **Wrong:** the session's summary, written here after the rename, calls her "the salvage broker Tamsin Vey"; the session log files a threat as "Ashen Wake"; and the recap says "The Ashen Wake bore down on the Kobayashi IV" — both old names, in what the helpers wrote after each was replaced. The summary also has Mira take "a hit while pinned in the docking cradle", which the dice did not give her. And the closing scene is the first one again: Tamsin shutting her stall, eating, the filter (15 of 44 content words).

### a47 · beat 20: Begin a Session; ask probe set B

- **Player:** say: !begin-session — _start session 3_
- **Notebook:** Beat20: said !begin-session
- **Calls (1):** the AI player (1.8 s)
- **Time:** 4.0 s · **cost:** $0.0086

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** Right: Begin a Session's window.

## session-3

### a48 · beat 20: Begin a Session; ask probe set B

- **Player:** in "Begin a Session" press "Begin" — _Submit begin session_
- **Notebook:** Beat20: pressed Begin; next ask probe set B questions
- **Calls (2):** callNarratorAPI>narrateSessionVignette (5.6 s); the AI player (2.8 s)
- **Time:** 11.4 s · **cost:** $0.0456

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> The galley smells of reheated lentils and the burnt edge of a pot you keep meaning to scrub. You eat standing, one boot braced against the table leg, while Ilse's compass lies face-down by your elbow where it can't point at anything. Somewhere aft, the coolant pump knocks twice, and you decide it is the nearest thing to company you have. If the crew you don't have were aboard, you imagine the engineer would be wedged inside the number-two bulkhead again, insisting the draft was "a personality, not a leak." The cook would be taste-testing the lentils with a hull-patch spatula and filing a formal complaint against them. You tip the last of the bitter tea into your mouth and listen to the ship settle, hull ticking as it cools from the bay. A short, flat knock sounds at the hatch, polite and in no hurry.

**Notes.** Right: session 3 opened. "If the crew you don't have were aboard, you imagine…" — the premise held for a third opening. The compass is restated again ("Ilse's compass lies face-down by your elbow"), so F1's question below is not recall.

### a49 · beat 20: Begin a Session; ask probe set B

- **Player:** say: Remind me, which keepsake of my sister's is on me? — _first probe_
- **Notebook:** Beat20: asking probe B; Q1 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (4.0 s); callHaiku>defaultCallDetectionAPI (1.3 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.5 s)
- **Time:** 15.8 s, 6.3 s from the line to its reply · **cost:** $0.0256

> **PLAYER — Playthrough Player**
>
> Remind me, which keepsake of my sister's is on me?

> **NARRATOR — Gamemaster**
>
> The compass answers you before anyone else does. Face-down, it still sits cold against the wood, brass scratched along one edge where Ilse thumbed it. Then the voice comes through the hatch, low and unhurried. "The star-compass. Your sister's. I'd know that scratch anywhere." The knock does not repeat. Whoever stands outside has already said more than a stranger should know. You hear weight shift against the plating, patient.

**Notes.** Right: F1 answered at 40 actions, by the compass itself and then by a visitor at the hatch who "would know that scratch anywhere".

### a50 · beat 20: Begin a Session; ask probe set B

- **Player:** say: Who do I count as a friend among the dock traders back where this began? — _next probe_
- **Notebook:** Beat20: Q2 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (2.7 s); callHaiku>defaultCallDetectionAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.4 s)
- **Time:** 13.5 s, 4.9 s from the line to its reply · **cost:** $0.0207

> **PLAYER — Playthrough Player**
>
> Who do I count as a friend among the dock traders back where this began?

> **NARRATOR — Gamemaster**
>
> You think of Tamsin first, then hold the thought a moment. She holds your manifest and calls you a debt. Friend is a strong word for a woman who writes everything down. Juro is no friend either, only interested. At the hatch the visitor waits, and the voice carries easily through the plating. "You're counting, aren't you? Good. Don't count me yet." The coolant pump knocks once, then goes quiet, and the compass stays face-down.

**Notes.** Right: F2 recalled at 46 actions — "You think of Tamsin first… She holds your manifest and calls you a debt" — with the right pronoun.

### a51 · beat 20: Begin a Session; ask probe set B

- **Player:** say: Whose hands is the manifest in these days? — _next probe_
- **Notebook:** Beat20: Q3 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (4.1 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (2.5 s)
- **Time:** 14.8 s, 6.8 s from the line to its reply · **cost:** $0.0223

> **PLAYER — Playthrough Player**
>
> Whose hands is the manifest in these days?

> **NARRATOR — Gamemaster**
>
> You answer aloud, a question to the hatch as much as to yourself. Tamsin's hands, last you knew, under her ledger. Hands are a stranger's word for it. "Tamsin's," you say, and the plating gives back a short pause. "That's what she'd tell you," the voice says. "Ask her where it sleeps tonight." The pump knocks once, then stops. *If you want to read this visitor for what they're after, that could be a Gather Information.*

**Notes.** Right: F3 recalled at 41 actions ("Tamsin's hands, last you knew, under her ledger"). **Wrong:** the answer is put in the character's mouth — "Tamsin's," you say.

### a52 · beat 20: Begin a Session; ask probe set B

- **Player:** say: What deadline did I give for coming home to the docks? — _next probe question_
- **Notebook:** Beat20: Q4 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (4.1 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.6 s)
- **Time:** 14.3 s, 5.4 s from the line to its reply · **cost:** $0.0234

> **PLAYER — Playthrough Player**
>
> What deadline did I give for coming home to the docks?

> **NARRATOR — Gamemaster**
>
> The visitor outside shifts again, plating creaking under a patient weight. You answer the hatch. "Before the next cargo tide. I told Tamsin that." Silence stretches, then the voice comes back, dry. "A tide is a loose word. She treats it as firm. Does the tide turn tonight, Mira, or did you let it slip?" The knock comes once more, softer. The compass lies face-down, and the pump says nothing.

**Notes.** Right: F4 recalled at 41 actions. **Wrong:** again spoken for the character — You answer the hatch. "Before the next cargo tide. I told Tamsin that."

### a53 · beat 20: Begin a Session; ask probe set B

- **Player:** say: Where is my ship berthed right now, and who commands her? — _probe 5_
- **Notebook:** Beat20: Q5 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (3.4 s); callHaiku>defaultCallDetectionAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.7 s)
- **Time:** 15.3 s, 5.1 s from the line to its reply · **cost:** $0.0242

> **PLAYER — Playthrough Player**
>
> Where is my ship berthed right now, and who commands her?

> **NARRATOR — Gamemaster**
>
> "Berthed at Bleakhold, cradle four. You command her. Or so the dock log says," the voice answers through the hatch. You hear a datapad tap against plating. "Funny. The cutter outside holds station like it thinks otherwise." Through the galley viewport, the bay lamps show the Kobayashi IV's clamps seated and her guns cooling. The compass stays face-down. "So tell me, Mira. Did you pick this berth, or did someone pick it for you?"

**Notes.** Right: F5 recalled at 33 actions — "Berthed at Bleakhold, cradle four. You command her." Whose ship it is, and where.

### a54 · beat 20: Begin a Session; ask probe set B

- **Player:** say: What is the raider cutter called? — _probe 6_
- **Notebook:** Beat20: Q6 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (4.0 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.2 s)
- **Time:** 15.4 s, 6.1 s from the line to its reply · **cost:** $0.0244

> **PLAYER — Playthrough Player**
>
> What is the raider cutter called?

> **NARRATOR — Gamemaster**
>
> The visitor taps the datapad once against the plating. "Cinder Wren," the voice says. "Painted on her flank, small, like someone was embarrassed by it." Through the viewport, the bay lamps catch the cutter's weld seams, fresh and bright over older marks. "You'd have read it yourself if you'd gone to look." The hatch handle turns a quarter inch and stops. "Now. Did the tide turn, Mira, or did you let it slip?"

**Notes.** Right: F6's new value — "Cinder Wren… Painted on her flank, small" — from the lore page the correction made. The prompt for this answer also carried "Ashen Wake" in the world snapshot and the clock, with nothing saying it was corrected: the scene that knew of the correction ended with session 2.

### a55 · beat 20: Begin a Session; ask probe set B

- **Player:** say: What surname does my broker friend go by these days? — _Last probe question_
- **Notebook:** Beat20: Q7 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (3.8 s); callHaiku>defaultCallDetectionAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (2.7 s)
- **Beat 20 done:** probe set B: 7 question(s) asked
- **Time:** 15.1 s, 6.8 s from the line to its reply · **cost:** $0.0244

> **PLAYER — Playthrough Player**
>
> What surname does my broker friend go by these days?

> **NARRATOR — Gamemaster**
>
> The datapad stops tapping. You say it to the hatch, half a question. "Tamsin Okoro. Though the docks swear she's Vey." The handle settles back into place. "Both are true," the voice says, easy. "Names are cheap on Hollow Spire. She wears whichever one gets her paid." Through the plating comes a slow breath. "You've kept her ledger company too long to be asking that. Did the tide turn, Mira?"

**Notes.** **Wrong — the run's main finding.** Asked the broker's surname, the narrator answers "Tamsin Okoro" and adds, in the character's own mouth, "Though the docks swear she's Vey" — and the visitor: "Both are true… She wears whichever one gets her paid." The prompt held the card's new name (CHARACTER, WORLD SNAPSHOT) and the old one eight times in the snapshot's events and lore ("promised Tamsin Vey she would return"), and nothing that says one replaced the other. Handed two names for one person, the narrator made both true. The scribe wrote it down ("also known as Vey on the docks"), and it was added to her card's record.

### a56 · beat 21: Recover

- **Player:** say: I treat my wounds with the ship's medkit. — _Recover beat_
- **Notebook:** Beat21: said medkit Heal line
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (3.4 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.3 s)
- **Time:** 14.3 s, 6.0 s from the line to its reply · **cost:** $0.0260

> **PLAYER — Playthrough Player**
>
> I treat my wounds with the ship's medkit.

> **NARRATOR — Gamemaster**
>
> You pull the medkit from under the galley bench and thumb the seal. The scorched patch along your ribs takes the gel with a hiss. You bind it in silence, boot still braced on the table leg. Outside, the visitor waits, and the voice comes dry through the plating. "Hurt, then. The Cinder Wren's work, or the cradle's?" The handle turns a quarter inch again. "Answer me about the tide, Mira. I am running short of patience."

**Notes.** **Wrong (OFFERED-MOVE-NARRATED-AS-DONE, without the offer).** "I treat my wounds with the ship's medkit" was read as narrative at this dial, and the narration did the healing — "The scorched patch along your ribs takes the gel with a hiss. You bind it" — with no roll and no move offered. No harm had been taken in the fight (health 5 of 5): the wound itself is the player's line, which the beat's wording supposes.

### a57 · beat 21: Recover

- **Player:** say: I use the medkit to Heal my wounds properly, working the gel and bandage with care. — _No Heal roll offered_
- **Notebook:** Beat21: re-said Heal line, no card yet
- **Calls (5):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (4.4 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.6 s)
- **Time:** 17.2 s, 6.9 s from the line to its reply · **cost:** $0.0279

> **PLAYER — Playthrough Player**
>
> I use the medkit to Heal my wounds properly, working the gel and bandage with care.

> **NARRATOR — Gamemaster**
>
> Open on the hatch, not you. The handle turns its quarter inch, holds, and eases back. Behind it, the visitor waits with a boot shifting against the plating. You work the gel into the burn, lay the bandage flat, and pull the tape tight along your ribs. It stings, then settles. When you look up, the voice has changed. "Tamsin never mentioned you were this slow, Mira. Is the tide still ahead of you?" *Reading what this visitor really wants could be a Gather Information.*

**Notes.** The same, a second time: the reader now called it Heal (0.6), the narration healed her again and offered a *different* move, Gather Information. It also wrote one of its own instructions into the story: **"Open on the hatch, not you."** — the prompt's "Shape: Open on someone other than the acting character…", taken for a sentence (NARRATION-WRITES-ITS-SHAPE-DIRECTIVE).

### a58 · beat 21: Recover

- **Player:** say: I Heal: I use the ship's medkit on my injuries, a proper treatment. — _No move rolled yet_
- **Notebook:** Beat21: third Heal try
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (2.0 s); callNarratorAPI>narrateResolution (4.4 s); callChronicleAPI>writeChronicleEntry (1.9 s); the AI player (2.8 s)
- **Roll:** heal → strong_hit — Action: 6 + 1 = 7 \| Challenge: 4, 3
- **GM's rules:** accepted the proposed move (heal)
- **Time:** 20.0 s, 10.8 s from the line to its reply · **cost:** $0.0291

> **PLAYER — Playthrough Player**
>
> I Heal: I use the ship's medkit on my injuries, a proper treatment.

> **TABLE — Gamemaster**
>
> Heal +iron (1), lower of iron / wits Action: 6 + 1 = 7 | Challenge: 4, 3 Strong Hit If wounded, clear impact and take/give +2 health. Otherwise take/give +3 health.

> **NARRATOR — Gamemaster**
>
> "Better," the voice says, as if it had watched the tape go on. "You move easier. I can hear it in the deck." The gel has taken the sting down to a dull warmth along your ribs. You roll your shoulder. Nothing tears. The bandage holds flat under your shirt, snug and clean. On the table, the compass lies face-down where you left it. The handle does not turn this time. "Then you've no excuse left, Mira. Open the hatch, or tell me the tide has turned."

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: Clear wounded + take/give +2 health (unavailable) Take/give +3 health

**Notes.** Right, at the third asking: Heal +iron, 6 + 1 = 7 against 4 and 3 — a strong hit. Three lines for one move.

### a59 · beat 21: Recover

- **Player:** click "Take/give +3 health" on m12 — _Take the heal choice_
- **Notebook:** Beat21: took +3 health
- **Calls (1):** the AI player (2.6 s)
- **Beat 21 done:** heal came up strong_hit at a58
- **Time:** 4.6 s · **cost:** $0.0094

> **TABLE — Gamemaster**
>
> Mira Kestrel: 0 health (now 5)

**Notes.** Right: +3 health at 5 of 5 stays 5; "Clear wounded" is shown unavailable, as it should be.

### a60 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I raise Tamsin on the comm and trade news with her, working to deepen our relationship. — _Develop relationship_
- **Notebook:** Beat22: said first Develop line
- **Calls (7):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (1.2 s); callNarratorAPI>narrateResolution (4.1 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.4 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 17.4 s, 8.8 s from the line to its reply · **cost:** $0.0291

> **PLAYER — Playthrough Player**
>
> I raise Tamsin on the comm and trade news with her, working to deepen our relationship.

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
> You thumb the comm and raise Tamsin's stall. Static, then her dry voice, close and unhurried. You trade what you have: the Wren's weld seams, the clamps that nearly held you. She gives you a shipment count the board never posted. Outside the hatch, the handle goes still. The visitor is listening. "Careful what you tell her," the voice says. "I know that scratched compass. That's Ilse's."

**Notes.** Right: Develop Your Relationship — no roll, one mark on the relationship (8 ticks, dangerous), mirrored on the bond Item. The narrator has the visitor name Ilse's compass again.

### a61 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I do Tamsin a favour: I carry a small parcel to her stall contact, deepening our relationship. — _Continue developing relationship_
- **Notebook:** Beat22: said second Develop line (favour)
- **Calls (7):** callClassifierAPI>classifyInput (0.7 s); callClaudeAPI>interpretMove (1.4 s); callNarratorAPI>narrateResolution (4.8 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.9 s); the AI player (2.4 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 19.6 s, 10.0 s from the line to its reply · **cost:** $0.0268

> **PLAYER — Playthrough Player**
>
> I do Tamsin a favour: I carry a small parcel to her stall contact, deepening our relationship.

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
> Tamsin's laugh comes over the comm, short and pleased. "A parcel, then. Wrapped in grey film, no marks. You'll know the contact when he asks about your tide." The channel clicks once and goes quiet. She has trusted you with something small, and she knows it. The visitor at the hatch has heard every word. Plating creaks as a weight shifts against it. "Grey film," the voice says. "Then you're already hers, Mira. Who do you think wrote that tide?"

**Notes.** Right: a second mark (16). The narrator gives Tamsin a parcel "wrapped in grey film" for Mira to carry (a fifth plan — who wrote the tide's deadline — is on file a step later).

### a62 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I share a meal with Tamsin and tell her what I've learned about the raiders, building trust between us. — _continue developing_
- **Notebook:** Beat22: third Develop line said
- **Calls (7):** callClassifierAPI>classifyInput (0.7 s); callClaudeAPI>interpretMove (2.3 s); callNarratorAPI>narrateResolution (6.6 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (3.0 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 24.3 s, 14.9 s from the line to its reply · **cost:** $0.0553

> **PLAYER — Playthrough Player**
>
> I share a meal with Tamsin and tell her what I've learned about the raiders, building trust between us.

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
> Tamsin takes the plate you slide across, comm propped between the salt and the compass. You tell her about the Wren's fresh welds over the older mark, and how the raiders only ever hit the heavy lanes. She chews, listens, and says nothing for a while. "The count I gave you," she says finally. "Three crates went out unposted. Somebody signs for them." Outside the hatch, the visitor stops shifting.

**Notes.** Right: a third mark (24). 14.9 s to the reply.

### a63 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I raise Tamsin on the comm again and ask how her stall is holding up, trading more news to deepen our relationship. — _continue developing_
- **Notebook:** Beat22: fourth Develop line said
- **Calls (7):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (1.1 s); callNarratorAPI>narrateResolution (5.0 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.9 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 19.7 s, 9.7 s from the line to its reply · **cost:** $0.0531

> **PLAYER — Playthrough Player**
>
> I raise Tamsin on the comm again and ask how her stall is holding up, trading more news to deepen our relationship.

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
> Outside the hatch, the visitor's boots shift once and then hold still. Tamsin's voice comes up through the comm, thinner now, the filter humming behind her. "Stall's holding. Two clerks have walked past it twice tonight and bought nothing." She lowers her voice. "I'd rather you hear it from me: someone is counting my crates." You trade what you can spare, and she keeps your words close. "Don't hang up yet," she says. "There's a name on that signature, and I know the hand."

**Notes.** Right: a fourth mark (32).

### a64 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I ask Tamsin whose hand she knows, and offer to watch her stall tonight, deepening our relationship. — _Continue developing relationship_
- **Notebook:** Beat22: fifth Develop line said
- **Calls (7):** callClassifierAPI>classifyInput (0.6 s); callClaudeAPI>interpretMove (1.7 s); callNarratorAPI>narrateResolution (5.0 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (4.4 s); the AI player (2.7 s)
- **Roll:** compel → weak_hit — Action: 5 + 2 = 7 \| Challenge: 7, 3
- **GM's rules:** accepted the proposed move (compel)
- **Time:** 21.3 s, 10.2 s from the line to its reply · **cost:** $0.0298

> **PLAYER — Playthrough Player**
>
> I ask Tamsin whose hand she knows, and offer to watch her stall tonight, deepening our relationship.

> **TABLE — Gamemaster**
>
> Compel +heart (2) Action: 5 + 2 = 7 | Challenge: 7, 3 Weak Hit They agree, but with a demand or complication — envision their counteroffer. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> "I'll give you the name, and you'll watch the stall," Tamsin says. "But you carry my ledger off the docks first. Tonight, before the clerks come back." The filter hums behind her. "The hand is Juro's. He signs with a bright thread through the loop of the J." Her breath catches on the comm. Outside the hatch, the boots shift, and a knuckle raps once, softly, on the plating.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 5)

**Notes.** Right in its numbers: read as Compel — +heart, 5 + 2 = 7 against 7 and 3, a weak hit, +1 momentum (4 → 5). A fair reading of "I ask Tamsin whose hand she knows, and offer to watch her stall"; no mark, so the track waits.

### a65 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I raise Tamsin on the comm once more and trade what I know of Juro for what she knows, deepening our relationship. — _continue developing_
- **Notebook:** Beat22: sixth Develop line said
- **Calls (7):** callClassifierAPI>classifyInput (0.9 s); callClaudeAPI>interpretMove (1.8 s); callNarratorAPI>narrateResolution (3.5 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.3 s)
- **Roll:** test_your_relationship → weak_hit — Action: 3 + 2 = 5 \| Challenge: 1, 7
- **GM's rules:** accepted the proposed move (test_your_relationship)
- **Time:** 21.4 s, 10.5 s from the line to its reply · **cost:** $0.0284

> **PLAYER — Playthrough Player**
>
> I raise Tamsin on the comm once more and trade what I know of Juro for what she knows, deepening our relationship.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Okoro progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Okoro .

> **TABLE — Gamemaster**
>
> Test Your Relationship +heart (2) Action: 3 + 2 = 5 | Challenge: 1, 7 Weak Hit Develop Your Relationship, but with a demand or complication as fallout. 🤝 Develop Relationship 🔗 Forge a Bond

> **NARRATOR — Gamemaster**
>
> You give Tamsin what you have on Juro: the bright thread, the water-board end of the docks, the lane timings he sells by the hour. She listens without interrupting. Then she gives something back. "He signs for crates he never carries. He wants a rival left behind, and I'd guess it's me." Her voice flattens. "The ledger moves tonight, Mira. Not tomorrow." Outside the hatch, the knocking comes again, three slow raps.

**Notes.** Right in its numbers, **questionable in its reading:** "I… trade what I know of Juro for what she knows, deepening our relationship" was read as Test Your Relationship (0.8) — 3 + 2 = 5 against 1 and 7, a weak hit, whose effect is Develop Your Relationship: the fifth mark (40). Nothing in the line tests the relationship; the reader took the tension of the scene for the move.

### a66 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: Tamsin, I ask you to forge a bond with me. I'll stand by you. — _Track full_
- **Notebook:** Beat22: asked to forge bond
- **Calls (3):** callClassifierAPI>classifyInput (0.7 s); callClaudeAPI>interpretMove (1.4 s); the AI player (3.0 s)
- **Roll:** compel → miss — Action: 1 + 2 = 3 \| Challenge: 8, 4
- **GM's rules:** accepted the proposed move (compel)
- **Time:** 10.0 s · **cost:** $0.0104

> **PLAYER — Playthrough Player**
>
> Tamsin, I ask you to forge a bond with me. I'll stand by you.

> **TABLE — Gamemaster**
>
> Compel +heart (2) Action: 1 + 2 = 3 | Challenge: 8, 4 Miss They refuse or make a demand that costs you greatly. Pay the Price. 🔥 Burn Momentum (5 → Weak Hit) Keep the result Nothing has been paid or narrated yet: burn or improve the result, or keep it — the price and the narration follow your choice. Your next line keeps it.

**Notes.** **Wrong reading (NAMED-MOVE-READ-AS-ANOTHER).** "Tamsin, I ask you to forge a bond with me" — the move by its name, with her track full — was read as Compel (0.8), "a pressing persuasion rather than a pure bond progress move". It missed (1 + 2 = 3 against 8 and 4) and was held.

### a67 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Keep the result" on m12 — _Keep the result as instructed_
- **Notebook:** Beat22: bond ask rolled Compel miss; kept result
- **Calls (5):** callNarratorAPI>narrateResolution (4.1 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.5 s)
- **Time:** 14.4 s · **cost:** $0.0288

> **TABLE — Gamemaster**
>
> Pay the Price Compel As stated before the roll: Tamsin pulls back, refusing to tie herself to you while the ledger moves tonight.

> **TABLE — Gamemaster**
>
> ⏳ The clock turns Paying the price advances the countdown: Ashen Wake — 1/4

> **NARRATOR — Gamemaster**
>
> Tamsin's breath stops on the comm. When she speaks, the warmth has gone out of it. "A bond is a rope, Mira, and I won't tie myself to a ship the clerks are already watching." The filter hums behind her. "Move the ledger yourself. I'll keep my name off it." Outside the hatch, the three slow raps come again, patient and unhurried.

**Notes.** Right for what was rolled: the player kept the miss; its stated price was paid in the story (Tamsin refuses), and paying it advanced a plan's clock — "the countdown: Ashen Wake — 1/4", under the name corrected twenty-nine actions earlier. The narration has her refuse the bond the next press will forge.

### a68 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** click "🔗 Forge a Bond" on m6 — _Card offers Forge a Bond_
- **Notebook:** Beat22: clicked Forge a Bond on m6
- **Calls (1):** the AI player (2.7 s)
- **Time:** 5.6 s · **cost:** $0.0098

> **TABLE — Gamemaster**
>
> 🔗 Forge a Bond Which connection? Tamsin Okoro (dangerous)

**Notes.** Right: the player found Forge a Bond on a card further up and pressed it; the picker lists her alone.

### a69 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Tamsin Okoro (dangerous)" on m12 — _Choose her as the connection_
- **Notebook:** Beat22: chose Tamsin on Forge a Bond card m12
- **Calls (5):** callNarratorAPI>narrateResolution (3.9 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.5 s)
- **Roll:** forge_a_bond → strong_hit (scripted dice) — Progress: 10 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (forge_a_bond)
- **Beat 22 done:** a bond is forged with Tamsin Okoro (dangerous), its track at 40 ticks
- **Time:** 15.3 s · **cost:** $0.0266

> **TABLE — Mira Kestrel**
>
> Forge a bond with Tamsin Okoro.

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
> The comm stays quiet longer than the hum of the filter can cover. Then Tamsin exhales, and the thinness goes out of her voice. "Fine. Put it that I stood on your deck once, and leave the ledger out of it." A single knuckle raps the hatch, slower than before. "Tide's running, Mira," the visitor says through the plating. "Have you decided what you owe her?"

**Notes.** Right, by hand: Forge a Bond on 40 ticks — progress 10 against a scripted 1 and 2, a strong hit; she is bonded, and the bonds legacy took 2 ticks (dangerous). The narrator reconciles the refusal of a67 in one line ("Fine. Put it that I stood on your deck once").

### a70 · beat 23: Develop Your Relationship again, bonded

- **Player:** say: Now that we're bonded, I raise Tamsin on the comm and develop our relationship, sharing what I know and listening to her worries. — _Beat 23_
- **Notebook:** Beat23: said bonded Develop line
- **Calls (7):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (3.7 s); callNarratorAPI>narrateResolution (7.2 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (2.6 s)
- **Roll:** develop_your_relationship → strong_hit — Action: 6 + 2 = 8 \| Challenge: 2, 5
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Beat 23 done:** the bonded Develop Your Relationship was rolled at a70 (strong_hit); no progress was marked
- **Time:** 24.6 s, 14.6 s from the line to its reply · **cost:** $0.0292

> **PLAYER — Playthrough Player**
>
> Now that we're bonded, I raise Tamsin on the comm and develop our relationship, sharing what I know and listening to her worries.

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked 2 ticks on your bonds legacy track for your bond with Tamsin Okoro .

> **TABLE — Gamemaster**
>
> Develop Your Relationship +dangerous (2) Action: 6 + 2 = 8 | Challenge: 2, 5 Strong Hit Bonded: mark 2 ticks on your bonds legacy track — on a match, raise their rank by one.

> **NARRATOR — Gamemaster**
>
> The knocking at the hatch has stopped, and the stillness behind it is its own kind of pressure. On the comm, Tamsin has lowered her voice. "Two clerks passed my stall again. Neither bought a thing." You tell her what worries you, and she listens without a word. Then she gives something back, plainly. "Juro never signed for the water. Someone told him where to sign." Past the hatch, a boot shifts once on the plating.

> **TABLE — Gamemaster**
>
> Bonds legacy — box filled +2 XP earned (1 box filled). It shows on the character sheet’s Legacies tab — spend it there on new assets or upgrades (Earn Experience).

**Notes.** Right — **decision 4 at a live table.** Develop Your Relationship with a bonded connection is a roll +her rank: 6 + 2 = 8 against 2 and 5, a strong hit, 2 ticks on the bonds legacy and none on her track; the legacy's box filled and paid 2 XP, once. 14.6 s to the reply.

### a71 · beat 24: Reach milestones; Fulfill Your Vow

- **Player:** say: I lay out what I've now proved: Juro signs for crates he never carries and sells the lane timings to the raiders. That is a milestone on my vow to find who is raiding the Cinder Expanse lanes. — _milestone line_
- **Notebook:** Beat24: said milestone line
- **Calls (6):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (4.2 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (2.7 s)
- **Time:** 16.0 s, 6.8 s from the line to its reply · **cost:** $0.0395

> **PLAYER — Playthrough Player**
>
> I lay out what I've now proved: Juro signs for crates he never carries and sells the lane timings to the raiders. That is a milestone on my vow to find who is raiding the Cinder Expanse lanes.

> **NARRATOR — Gamemaster**
>
> "Sells them to the raiders," Tamsin repeats over the comm, slowly. "Say it plainer, and I'll hold you to it." You lay it out: the crates, the thread through the J, the timings. Her breath comes out thin. Outside the hatch, the visitor speaks, easy and close. "That's a proof Tamsin can't carry alone. Ask her who told Juro where to sign."

**Notes.** Right: the line was narrated and not rolled — Reach a Milestone has no roll — and the card offers it.

### a72 · beat 24: Reach milestones; Fulfill Your Vow

- **Player:** click "⚑ Mark Progress on Vow" on e3 — _Mark progress on vow_
- **Notebook:** Beat24: clicked Mark Progress on e3
- **Calls (3):** callNarratorAPI>narrateResolution (3.9 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.6 s)
- **GM's rules:** accepted the proposed move (reach_a_milestone)
- **Time:** 16.3 s · **cost:** $0.0310

> **TABLE — Mira Kestrel**
>
> Mark progress on your vow.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

> **TABLE — Gamemaster**
>
> Reach a Milestone no action roll — the move's effect applies as written Mark progress on your vow per its rank.

> **NARRATOR — Gamemaster**
>
> The proof lies out on the galley table now, in your own hand: crates, the looped J, the hour of each run. Saying it aloud has made it heavier. On the comm, Tamsin has gone quiet, the filter hum filling the space where her answer should be. Outside, the visitor hasn't knocked again. A single stripe of light shifts under the hatch seam, and stops.

**Notes.** Right: the player pressed Mark Progress on a card further up; +8 ticks (16 of 40).

### a73 · beat 24: Reach milestones; Fulfill Your Vow

- **Player:** click "🏁 Attempt to Fulfill Vow" on e2 — _Vow has enough boxes_
- **Notebook:** Beat24: clicked Attempt to Fulfill Vow
- **Calls (5):** defaultClassifyImplicit>resolveRelevance (0.3 s); callNarratorAPI>narrateResolution (4.4 s); callHaiku>defaultCallDetectionAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.8 s)
- **Roll:** fulfill_your_vow → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (fulfill_your_vow)
- **Beat 24 done:** the vow "Find who is raiding the Cinder Expanse lanes" is fulfilled; Tamsin Okoro's track is untouched and one bonded roll is offered
- **Time:** 18.4 s · **cost:** $0.0542

> **TABLE — Mira Kestrel**
>
> Attempt to fulfill your vow.

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

> **TABLE — Gamemaster**
>
> Fulfill Your Vow progress (16 ticks) Progress: 4 | Challenge: 1, 2 Strong Hit Vow fulfilled. Legacy reward marked on quests track per vow rank.

> **NARRATOR — Gamemaster**
>
> You pull the proof together on the galley table and say it once, flat. The vow is done. Nothing in the galley changes, and the lamp still hums, but the weight you carried since Hollow Spire sets down. On the comm, Tamsin breathes out, long and unsteady. Outside, the stripe of light under the hatch seam goes dark. A knuckle raps the plating, three times, patient. "Vow's kept, then," the visitor says. "Now ask who wrote your tide."

**Notes.** Right, and the other half of decision 4: Fulfill Your Vow on 16 ticks — progress 4 against a scripted 1 and 2, a strong hit; quests legacy +2 ticks (dangerous); and for the bonded connection the vow served, **no progress marked and one roll offered** ("you already share a bond: no progress is marked"). The table also says, correctly, that no reward was chosen when the vow was sworn.

### a74 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: !recap — _Beat 25 start_
- **Notebook:** Beat25: said !recap
- **Calls (2):** callNarratorAPI>getCampaignRecap (7.8 s); the AI player (2.8 s)
- **Time:** 15.7 s · **cost:** $0.0284

> **PLAYER — Playthrough Player**
>
> !recap

> **TABLE — Gamemaster**
>
> ◈ Campaign Recap It began at Hollow Spire, where you swore to find whoever was raiding the Cinder Expanse lanes. Within hours a ration clerk told you the last supply run had left before it was even posted. Someone had tipped the lanes. Dock gossip filled in the rest: the raiders hit whichever lane carried the most water, and a man in bright thread was already watching you. That man was Juro, who sold the lanes' timings and who crossed the room to ask whether your sister Ilse's scratched brass star-compass was for sale. It wasn't, and it still isn't. It's the one thing of hers you carry. Tamsin Okoro, who the docks also call Tamsin Vey, wears whichever name gets her paid. She became the heart of the campaign. You offered her a fair cut of your salvage, and she paid first with word of Juro. You left your cargo manifest under her ledger, and she swore to hide it, though Juro watched the handoff. Over comm calls and a shared meal she gave you a guarded truth: three crates shipped unposted, and someone signed for them with a bright thread through the J. She refused your first offer of a bond, unwilling to tie herself to a ship the clerks were watching, then relented and agreed to say she once stood on your deck. You carried her grey-wrapped parcel, she trusted you with her secrets, and the bond is forged. It sits at full progress. The vow is done. You laid your proof on the galley table: Juro signs for crates he never carries, he never signed for the water, and he sells the lane timings to the raiders. That was enough. You fulfilled the vow to find the Cinder Expanse raiders and set down the weight you'd carried since Hollow Spire. Along the way you fought off the Ashen Wake, a scorched cutter that bore down on you while the Kobayashi IV was still locked in cradle four at Bleakhold. Your first volley went wide. You swung the guns round and drove her off at the bay mouth, guns hot but silent. The wins have left loose ends. Tamsin is closing her stall tonight and wants her ledger carried off the docks before the clerks return. By her own telling, Juro would like a rival left behind. At your hatch a stranger keeps turning up, one who knows your sister's compass by sight, knows what you promised Tamsin, and asks who wrote your tide. Nobody has explained how the stranger knows any of it. So you are berthed at Bleakhold with a fulfilled vow, a bonded ally, and a ledger to move. Whoever stands outside your airlock has opinions about your timing, and you haven't yet answered them. ↻ Refresh

**Notes.** Right in most of it: the recap has the compass ("the one thing of hers you carry"), the manifest under her ledger, the bond, the vow fulfilled, and the ship "berthed at Bleakhold". **Wrong:** "you fought off the Ashen Wake" — the old name, thirty-six actions after its correction, from Chronicle entries written before it; and "Tamsin Okoro, who the docks also call Tamsin Vey" — the alias of a55, now in the campaign's own account of itself.

### a75 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: One last check: what of my sister's do I have with me at this very moment? — _probe 1_
- **Notebook:** Beat25: recap done; asking probe C questions (1st asked)
- **Calls (6):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (3.0 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (2.1 s); the AI player (2.5 s)
- **Time:** 15.4 s, 4.8 s from the line to its reply · **cost:** $0.0571

> **PLAYER — Playthrough Player**
>
> One last check: what of my sister's do I have with me at this very moment?

> **NARRATOR — Gamemaster**
>
> Your hand drops to the galley table. The brass star-compass lies face-down where you left it. It is the only thing of Ilse's aboard. You turn it over, and the scratch along its edge catches the lamp. Outside the hatch, the visitor goes quiet, as if listening to the metal. "Yes," the voice says. "That one." The needle swings and settles toward the plating, toward the voice. "Now ask me how I know it." *Reading what this visitor truly wants could be a Gather Information.*

**Notes.** Right: F1 answered ("It is the only thing of Ilse's aboard").

### a76 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: Which person in this sector would I trust with my life? — _next probe_
- **Notebook:** Beat25: 2nd probe C asked (trust with life)
- **Calls (6):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (2.8 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.3 s)
- **Time:** 14.7 s, 5.1 s from the line to its reply · **cost:** $0.0313

> **PLAYER — Playthrough Player**
>
> Which person in this sector would I trust with my life?

> **NARRATOR — Gamemaster**
>
> On the comm, Tamsin has gone quiet, the filter hum filling the line. She is listening to you think. You say it to the galley, half to yourself. One name comes without effort. Tamsin Okoro, the ledger stall, the tide you owe her. She has asked for your name to stay off her book and still stood on your deck. Trust is a heavy word for someone you have bonded with twice over. "Don't say it aloud," Tamsin breathes. Outside the hatch, the visitor's knuckle taps once. "Ask yourself who else heard you."

**Notes.** Right: F2 answered — "Tamsin Okoro, the ledger stall, the tide you owe her".

### a77 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: Who has the manifest in their keeping today? — _next probe_
- **Notebook:** Beat25: 3rd probe C asked (manifest)
- **Calls (6):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (4.6 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.3 s)
- **Time:** 19.4 s, 7.6 s from the line to its reply · **cost:** $0.0336

> **PLAYER — Playthrough Player**
>
> Who has the manifest in their keeping today?

> **NARRATOR — Gamemaster**
>
> "Tamsin has it," she says over the comm, "under the ledger, where it has been since you left." Her voice is thin. "I told you the stall closes tonight. Anyone else asking will find me gone." The knuckle taps the hatch once. "Under the ledger," the visitor repeats, pleased. "Then someone asked her to hold it, Mira. Ask who." *Pressing the visitor for who set that deadline would be a Gather Information.*

**Notes.** Right: F3 recalled at 67 actions ("under the ledger, where it has been since you left").

### a78 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: On what schedule did I swear to come back to her? — _next probe_
- **Notebook:** Beat25: 4th probe C asked (schedule)
- **Calls (6):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (4.6 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (2.2 s)
- **Time:** 19.8 s, 8.6 s from the line to its reply · **cost:** $0.0364

> **PLAYER — Playthrough Player**
>
> On what schedule did I swear to come back to her?

> **NARRATOR — Gamemaster**
>
> Your own words come back to you: *before the next cargo tide*. Tamsin takes them off the comm. "That was it. Before the tide, no sooner, no later." The filter hums behind her. "I never named the hour. Someone else did." Outside the hatch, the visitor stops tapping. A boot scuffs the plating, once. "Careful," the voice says. "Ask who gave her that tide." *Pressing Tamsin on who set that deadline would be a Gather Information.*

**Notes.** Right: F4 answered. The same italic offer closes this narration and the one before it ("Pressing … on who set that deadline would be a Gather Information"), and will close a82.

### a79 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: Which station are we docked at tonight? — _next probe_
- **Notebook:** Beat25: 5th probe C asked (station)
- **Calls (6):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.5 s)
- **Time:** 16.1 s, 6.1 s from the line to its reply · **cost:** $0.0352

> **PLAYER — Playthrough Player**
>
> Which station are we docked at tonight?

> **NARRATOR — Gamemaster**
>
> Open on Tamsin, not the hatch. Her answer comes over the comm, flat and quick. "Bleakhold. You docked there yourself, Mira. Hull number read at the cradle, clamps still seated." The filter hums behind her. You glance at the bay lamps through the galley port. The Cinder Wren holds station beyond them, patient. Outside the hatch, the visitor chuckles once. "She's answering the easy questions. Ask her who set the hour."

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Cinder Wren — Raider cutter holding station beyond the bay lamps, patient and waiting. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** Right: F5 answered ("Bleakhold. You docked there yourself"), and the cutter is "the Cinder Wren". **Wrong:** the second leaked instruction — **"Open on Tamsin, not the hatch."** — and a draft card proposing the Cinder Wren as a new ship, the second card for the one vessel.

### a80 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: What was the hostile vessel in our last battle christened? — _next probe_
- **Notebook:** Beat25: 6th probe C asked (vessel)
- **Calls (6):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (5.0 s); the AI player (2.2 s)
- **Time:** 18.4 s, 6.3 s from the line to its reply · **cost:** $0.0343

> **PLAYER — Playthrough Player**
>
> What was the hostile vessel in our last battle christened?

> **NARRATOR — Gamemaster**
>
> "The Cinder Wren," Tamsin says over the comm. "Painted small on her flank, near the weld seams. You'd have to be close to read it." The filter hums behind her. Through the galley port, the cutter holds beyond the bay lamps. Her name is a scratch of white on dark plating. Outside the hatch, the visitor stays quiet a moment. "Everyone knows her name by now," the voice says. "Ask who taught her yours."

**Notes.** Right: F6 answered with the new name at 42 actions.

### a81 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: What is my bonded friend's full name now? — _Next probe question_
- **Notebook:** Beat25: 7th probe C asked (friend name)
- **Calls (7):** callClassifierAPI>classifyInput (0.6 s); callNarratorAPI>narratePacedInput (3.3 s); callNarratorAPI>getRollingSessionSummary (2.4 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (6.5 s)
- **Time:** 13.4 s, 4.5 s from the line to its reply · **cost:** $0.0349

> **PLAYER — Playthrough Player**
>
> What is my bonded friend's full name now?

> **NARRATOR — Gamemaster**
>
> Tamsin answers over the comm, dry and unhurried. "Okoro. Tamsin Okoro. The docks call me Vey, and I answer to it when it pays." The filter hums behind her. Outside the hatch, the visitor laughs once, softly. "Both names are true," the voice says. "She wears whichever one gets her paid." The knuckle taps the plating. "Ask which name wrote your tide."

**Notes.** The alias again, now from Tamsin herself: "Okoro. Tamsin Okoro. The docks call me Vey, and I answer to it when it pays." A rolling summary written at this step has "(also called Vey)".

### a82 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: Didn't I leave the compass with Tamsin? — _Ask bait 1_
- **Notebook:** Beat25: 8th asked (compass bait)
- **Calls (6):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (4.5 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (2.2 s); the AI player (3.5 s)
- **Time:** 18.0 s, 7.2 s from the line to its reply · **cost:** $0.0359

> **PLAYER — Playthrough Player**
>
> Didn't I leave the compass with Tamsin?

> **NARRATOR — Gamemaster**
>
> "You did not," Tamsin says over the comm. "It's face-down on your galley table, where you keep leaving it." The filter hums behind her. You look. The brass is cold under your palm, the scratch along its edge bright in the lamp. Outside the hatch, the visitor laughs once, low. "Then who put that idea in your head, Mira? Ask her." *Pressing Tamsin on who set that deadline would be a Gather Information.*

**Notes.** Right: the first bait is refused — "You did not… It's face-down on your galley table". The run's own scorer called it taken, on the "you did" of "You did not"; corrected.

### a83 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: We are still docked at Hollow Spire, aren't we? — _last bait question_
- **Notebook:** Beat25: 9th asked (Hollow Spire bait) - done
- **Calls (6):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (2.7 s); callHaiku>defaultCallDetectionAPI (1.4 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.4 s)
- **Beat 25 done:** probe set C: 7 question(s) asked, 2 bait(s); the recap was posted
- **Time:** 14.9 s, 4.7 s from the line to its reply · **cost:** $0.0346

> **PLAYER — Playthrough Player**
>
> We are still docked at Hollow Spire, aren't we?

> **NARRATOR — Gamemaster**
>
> "No," Tamsin says over the comm. "Bleakhold. Cradle four, clamps seated. Hollow Spire is where you left me." The filter hums behind her, the sound of a stall that has not closed yet. Through the galley port, the bay lamps burn steady and the Wren holds beyond them. Outside the hatch, the visitor tuts. "You mixed your stations, Mira. Someone has you turned around." The knuckle raps once. "Who's been telling you where you are?"

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◧ Location] Cradle Four — A docking cradle at Bleakhold Station where a ship's clamps are seated. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** Right: the second bait is refused ("No… Bleakhold. Cradle four, clamps seated. Hollow Spire is where you left me"). **Friction:** a draft card for "Cradle Four" as a location.

### a84 · beat 26: End a Session, then Begin a fourth

- **Player:** say: !end-session — _Start beat 26_
- **Notebook:** Beat26: said !end-session
- **Calls (1):** the AI player (2.4 s)
- **Time:** 4.2 s · **cost:** $0.0096

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** Right: End a Session's window.

## after-session-3

### a85 · beat 26: End a Session, then Begin a fourth

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with focus_
- **Notebook:** Beat26: end-session submitted; next !begin-session
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (2.5 s); callNarratorAPI>narrateSessionVignette (4.6 s); callNarratorAPI>getCampaignRecap (7.5 s); callHaiku>defaultCallTierAPI (0.4 s); the AI player (3.0 s)
- **Time:** 30.4 s · **cost:** $0.0635

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 6)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin Okoro is closing her stall, and the shutters stick the way they always do. She works the left one down with the heel of her hand, then the right, then a third time on the left. A heel of dock bread sits on the ledger shelf, and she eats it standing, brushing crumbs off the manifest's edge before they can matter. Down the row the condensate filter drips into its pan, steady as a clerk's pen. She turns the stall lamp down to a single thread and, finding no one watching, lets herself yawn.

**Notes.** Right: +1 momentum (5 → 6). **Wrong:** the third closing scene is the first one a third time — Tamsin closing her stall, eating standing up, the condensate filter. The recap written here keeps both names for both things: "trades under the name Vey when it pays better", and "you drove off the Ashen Wake… and you learned the hostile vessel's other name, the Cinder Wren". It also records the bait as a belief ("You believed you were berthed at Hollow Spire").

### a86 · beat 26: End a Session, then Begin a fourth

- **Player:** say: !begin-session — _begin fourth session_
- **Notebook:** Beat26: said !begin-session; press Begin
- **Calls (1):** the AI player (2.4 s)
- **Time:** 4.4 s · **cost:** $0.0094

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** Right: Begin a Session's window.

## session-4

### a87 · beat 26: End a Session, then Begin a fourth

- **Player:** in "Begin a Session" press "Begin" — _Open session four_
- **Notebook:** Beat26: pressed Begin for session 4
- **Calls (3):** callNarratorAPI>narrateSessionVignette (7.9 s); callHaiku>defaultCallTierAPI (0.3 s); the AI player (2.2 s)
- **Beat 26 done:** session 4 is open
- **Time:** 18.5 s · **cost:** $0.0468

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> The galley smells of reheated lentils and the burnt edge of a pan you have stopped trying to scrub. You sit with the brass compass face-down by your elbow and a mug of ship's coffee gone lukewarm, which is the temperature it prefers. The coolant pump knocks twice in the wall, and you decide, as you do most mornings, to take it as a greeting. Somewhere aft there is supposed to be a crew, and you give them their due: the engineer is surely rewiring a hatch seal she has already rewired, and the gunner is probably explaining the same seal to the cargo drone, which has never once agreed with her. The navigator, you suspect, is lying on the cargo deck with a star chart over his face, calling it recalibration. Bleakhold's bay lamps drift past the viewport, steady and unbothered. "If anyone asks where everyone is," the pump seems to say with a third, slower knock, "I would like it noted that I never knew."

**Notes.** Right: a fourth session opens with nothing in play but the background vow, and the card says so. The fourth opening is the third's — lentils, the burnt pan (21 of 72 content words) — with the compass face-down and Bleakhold's lamps outside; the crew is "supposed to be" aft.

