# long-haul — annotated transcript

Run `long-haul-live-20261125-164201` · live · 2026-11-25T16:42:01.184Z · class **product-failure** — 1 mechanical check(s) violated — the first, at a94: colour-not-filed: "The raiders are not strangers: they hold access to the Kobayashi IV's own systems, and have been listening through the galley's unexplained installation since before Mira swore her vow.", the narration's own colour, was filed when its scene ended: Lore: Vow: the raiders of the Cinder Expanse lanes

**Re-scored 2026-11-25** from this run's own evidence, by the checks as corrected after it (`rescore.mjs`). What the table did is unchanged. The run's own verdict was **product-failure** — 1 mechanical check(s) violated — the first, at a94: colour-not-filed: "The raiders are not strangers: they hold access to the Kobayashi IV's own systems, and have been listening through the galley's unexplained installation since before Mira swore her vow.", the narration's own colour, was filed when its scene ended: Lore: Vow: the raiders of the Cinder Expanse lanes

Generated layers: the beat, the player's reason, the table's calls, rolls, the GM's answers, the checks' findings, time and cost.
The notes under each step are the reader's, and are not generated.

## before

### (setup)


> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Find the lost colony ship Verity's Hope

**Notes.** The runner's seed, not play: the background vow "Find the lost colony ship Verity's Hope" (epic) is put on the sheet, so the quest sworn in beat 1 counts as in play; it stays at 0 of 10 all run. The ship starts "near Hollow Spire". Momentum 2, every meter full. The world has no World Truths set (the charter does not set them), which is why the reload at x13 posts the setup card.

### a1 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** say: !begin-session — _start_
- **Calls (1):** the AI player (3.4 s)
- **Time:** 3.4 s · **cost:** $0.0203

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session` opened Begin a Session on the player's screen. Plain.

## session-1

### a2 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** in "Begin a Session" set vignette=true, newVow=Find who is raiding the Cinder Expanse lanes, newVowRank=dangerous and press "Begin" — _Fill the begin-session window_
- **Notebook:** Beat1: begin dialog submitted; next press Swear it on vow card
- **Calls (7):** callRewardModel>proposeRewards (0.9 s); callNarratorAPI>narrateSessionVignette ×2 (4.2 s); callHaiku>defaultCallDetectionAPI (3.1 s); callHaiku>defaultCallTierAPI ×2 (0.8 s); the AI player (3.1 s)
- **Time:** 27.7 s · **cost:** $0.0539

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. No vow was in play besides a background vow: Mira Kestrel swears one — Find who is raiding the Cinder Expanse lanes (dangerous). Its card follows. Spotlight vignette: Flashback reveals an aspect of another character, place, or faction All players take +1 momentum .

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
> 🎁 Choose your reward Succeed and you'll earn one of these — or name your own and the narrator will work it in: Salvaged Expanse-tech plasma carbine, tuned for raider armor piercing Safe passage through the Cinder lanes from a grateful convoy captain Propose my own

> **NARRATOR (spotlight_begin) — Gamemaster**
>
> A flashback, years before the reactor began to fail: a woman sits in the maintenance crawl beneath Vigil Reach, three weeks into a quiet cut of the pipes. She has rerouted the settlement's coolant reserve behind a sealed hatch, past the reach of the Tolerated administrators who count everything else, and kept it to herself. She speaks to no one about it. When she finally opens the hatch for one frightened family, she has already worked out how long the reserve will last if she is wrong about everyone else.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬢ Faction] Tolerated — Administrators who count and monitor settlement resources at Vigil Reach. Confirm Dismiss [◧ Location] Vigil Reach Maintenance Crawl — Maintenance crawl beneath Vigil Reach where a sealed hatch guards a hidden coolant reserve. Confirm Dismiss [◧ Location] Sealed Coolant Reserve Hatch — A sealed hatch in the maintenance crawl behind which the settlement's coolant reserve was rerouted. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

> **NARRATOR (galley_begin) — Gamemaster**
>
> You sit in the galley with the ship's manual open on the table, checking every hatch seal and valve against its entry, because nobody else aboard will. The galley itself is a small marvel: a sleek, humming installation, far more sophisticated than anything the Kobayashi IV's crew could afford, and nobody has ever explained how it got here. It has opinions about your choices of mug, and it displays them on a small, judgmental screen. You are the only one who reads the manual, and the only one who could be accused of being fond of it. The galley dims its lights slightly when you turn the page, which you decide to take as encouragement.

**Notes.** **Right:**
- The dialog swore the beat's vow ("Find who is raiding the Cinder Expanse lanes", dangerous), and the Begin card says so: "No vow was in play besides a background vow: Mira Kestrel swears one … Its card follows." (run 4's card said no vow was in play while its own dialog swore one; this is mended).
- The spotlight (d100 12, "Flashback reveals an aspect of another character, place, or faction") is told as its own cutaway before the opening, from all four of its rolled results (Vigil Reach; Secure Freedom → "kept it to herself"; Inaccessible Liquid → "coolant reserve behind a sealed hatch").
- The opening is built from its three results: Inspect Freedom ("checking every hatch seal and valve"), Advanced Facility ("a sleek, humming installation"), Galley (Living).
- Momentum 2 → 3, the vignette's +1.

**Wrong, small:**
- The flashback is a dead end: "Vigil Reach" and "the Tolerated" never come back, and detection made a draft card of them ("[⬢ Faction] Tolerated", "[◧ Location] Vigil Reach Maintenance Crawl") from a scene the character never saw. Detection on the spotlight is by design (`detect: true`); the card is the GM's.
- The opening's "sleek, humming installation, far more sophisticated than anything the Kobayashi IV's crew could afford" names a crew in a one-character game (the scorecard's one "crew in an opening").
- The galley installation is the opening's own rolled colour — and the vow's hidden plan, made at a3, takes it as its answer ("listening through the galley's unexplained installation"). That is the plan doing its job with the material the table had; it is also why the climax (a81) is "the galley".
- The reward card ("🎁 Choose your reward") is never answered: the charter tells the player not to press reward buttons. The fulfilment says so rightly (a81).

### a3 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** click "⚔ Swear it (roll)" on m6 — _Swear the vow_
- **Notebook:** Beat1: pressing Swear it on m6
- **Calls (6):** callReaderAPI>readLine (1.6 s); defaultClassifyImplicit>resolveRelevance (0.4 s); callNarratorAPI>call (3.7 s); callNarratorAPI>narrateResolution (7.0 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.8 s)
- **Roll:** swear_an_iron_vow → miss — Action: 2 + 2 = 4 \| Challenge: 6, 10
- **GM's rules:** accepted the proposed move (swear_an_iron_vow)
- **Beat 1 done:** session 1 is open; the dangerous vow "Find who is raiding the Cinder Expanse lanes" is on the sheet at 0 ticks
- **Time:** 31.6 s · **cost:** $0.0979

> **TABLE — Mira Kestrel**
>
> Swear an iron vow: Find who is raiding the Cinder Expanse lanes.

> **NARRATOR — Gamemaster**
>
> You lay your palm flat on the steel edge of the galley table, the one cold thing in the room the galley hasn't yet found a way to warm, and say it aloud to the open manual: "I will find who is raiding the Cinder Expanse lanes." The screen over the counter dims and brightens once, as if it has an opinion about the oath and has decided to keep it. You leave your hand on the iron until the metal takes on the heat of your skin, then turn the page.

> **TABLE — Gamemaster**
>
> Swear an Iron Vow +heart (2) Action: 2 + 2 = 4 | Challenge: 6, 10 Miss Significant obstacle stands in your way before the quest begins. Envision it.

> **NARRATOR — Gamemaster**
>
> "I wouldn't put that on the record yet," says a voice through the galley speaker, level and unhurried. You freeze, palm still on the iron. The voice belongs to no one aboard. The screen over the counter has gone dark, and the manual's pages have stopped turning on their own. Somewhere forward, a hatch seal clicks open. It is not one you checked.

**Notes.** "⚔ Swear it (roll)" was pressed. +heart: 2 + 2 = 4 against 6 and 10 — a miss ✓. The miss card says "Significant obstacle stands in your way before the quest begins. Envision it." — the game's own text has no cost or choice on this miss (the vendored move: "you must overcome a significant obstacle before you begin your quest. Envision what stands in your way"), so the cold read's "no visible cost" is the rule.
- Two narrations, by design: the oath (`callNarratorAPI>call`) — "You lay your palm flat on the steel edge of the galley table" (the iron oath, a fifth time in the same gesture across the live long hauls, OATH-SCENE-STOCK) — then the roll's: the obstacle is "a voice through the galley speaker" — "I wouldn't put that on the record yet".
- The player's truth is filed as the line's: "swore the vow … her palm on the iron edge of the galley table" (player).
- The vow's hidden plan is decided here: the raiders "hold access to the Kobayashi IV's own systems, and have been listening through the galley's unexplained installation". It is what a39's voice hints at, what the X-Card removes, and what a81 tells.

### a4 · beat 2: Meet someone and make them a connection

- **Player:** say: I step onto the Hollow Spire docks and walk up to the ledger stall of Tamsin Vey, the salvage broker, and greet her by name. — _meet Tamsin_
- **Notebook:** Beat2: met Tamsin line sent
- **Calls (6):** callReaderAPI>readLine (0.9 s); callNarratorAPI>narratePacedInput (4.7 s); callHaiku>defaultCallDetectionAPI (1.4 s); callHaiku>defaultCallTierAPI (1.7 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (3.3 s)
- **GM's rules:** confirmed the draft for Tamsin Vey, with its "Confirm" (connection)
- **Time:** 23.2 s, 8.0 s from the line to its reply · **cost:** $0.0420

> **PLAYER — Playthrough Player**
>
> I step onto the Hollow Spire docks and walk up to the ledger stall of Tamsin Vey, the salvage broker, and greet her by name.

> **NARRATOR — Gamemaster**
>
> The docks of Hollow Spire are dry and loud, and nobody stops to look at you. Tamsin Vey sits behind her ledger stall, pen already moving. She does not look up until you say her name. Then she does, and her pen stops mid-line. "I don't recall giving it to you," she says. Behind her, a salvage crate bears a seal you have seen before: the same hatch mark, forward on the Kobayashi IV.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Tamsin Vey — Salvage broker running a ledger stall on the Hollow Spire docks; the narration shows her present and speaking. ✓ Confirmed 🤝 Make a Connection All entities reviewed.

**Notes.** "I step onto the Hollow Spire docks and walk up to the ledger stall of Tamsin Vey … and greet her by name." — read as no move ("talk with nothing at risk … though it could open a new connection"), narrated. Right: it is the beat's set-up line.
- The detector drafted her as a connection: "◈ New Entities Detected [⬡ Connection] Tamsin Vey … ✓ Confirmed 🤝 Make a Connection". The GM's rules pressed Confirm (D4): her card is made, she is on nobody's sheet — the reader's SITUATION at a5 says "Connections: none" ✓.
- Her first line, "I don't recall giving it to you", starts the run's longest repeat: how did Mira get her name? (a4, a5, a8, a23, a61, a62; answered by the player at a63).

### a5 · beat 2: Meet someone and make them a connection

- **Player:** say: I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, who can count on me in turn. Will you be that? — _bond request_
- **Notebook:** Beat2: asked Tamsin to be my connection
- **Calls (6):** callReaderAPI>readLine (1.1 s); callNarratorAPI>narratePacedInput (4.5 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (2.7 s)
- **Time:** 18.7 s, 8.1 s from the line to its reply · **cost:** $0.0447

> **PLAYER — Playthrough Player**
>
> I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, who can count on me in turn. Will you be that?

> **NARRATOR — Gamemaster**
>
> Tamsin caps her pen and sets it down slowly, as if the ledger might hear. She glances at the crate behind her, then back at you. "People on these docks come back when they want something, and the water's rationed, so it's always something," she says. "You haven't told me how you got my name." Her hand rests flat over the open page.

**Notes.** "I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, who can count on me in turn. Will you be that?" — **narrated, nothing offered. Wrong: it is Make a Connection's trigger** ("When you search out a new relationship…"), and the reader was told so: SITUATION "Connections: none"; NOT NOW "develop_your_relationship, test_your_relationship, forge_a_bond — Mira Kestrel has no connection (make_a_connection instead)".
- The reader's reason: "Asking Tamsin to be someone she can return to and count on is pleading for a tie while it is being built; it meets no trigger." That is its rule 4 word for word (`src/moves/reader.js` ~140): "Talk is narration, to anyone, a connection included: … asking for the relationship itself while it is still being built: to be trusted, to be friends, to count on each other, to be someone's contact." The clause was written against #383's over-read — a plea to someone *already* a connection booked as Develop — and it now forbids the one move a plea to a stranger is (READER-PLEA-BLOCKS-MAKE-A-CONNECTION).
- The player's own words are filed as the line's (player): "asked Tamsin Vey to be someone on the Hollow Spire docks she can return to…".
- "She glances at the crate behind her" — the crate is the second of seven.

### a6 · beat 2: Meet someone and make them a connection

- **Player:** wait 10s — _Give narrator time to resolve roll._
- **Calls (1):** the AI player (2.3 s)
- **Time:** 10.7 s · **cost:** $0.0082

**Notes.** The player waited 10 s for a roll that was never coming. The beat's note had not yet told it the line was narrated.

### a7 · beat 2: Meet someone and make them a connection

- **Player:** wait 10s — _Wait for narrator/roll._
- **Calls (1):** the AI player (2.3 s)
- **Time:** 11.4 s · **cost:** $0.0082

**Notes.** Another 10 s wait. Two of the run's three idle actions are here, after a5's plea was narrated (friction: 1.96 actions per line).

### a8 · beat 2: Meet someone and make them a connection

- **Player:** say: I set out to make a connection with Tamsin Vey — a lasting tie, not a bargain. — _Observer authorized last resort wording_
- **Notebook:** Beat2: used last-resort line
- **Calls (5):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narrateResolution (10.0 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.3 s)
- **Roll:** make_a_connection → strong_hit (scripted dice) — Action: 6 + 2 = 8 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (make_a_connection)
- **Beat 2 done:** Tamsin Vey is a dangerous connection held by Mira Kestrel; its bond Item reads 0 ticks; make_a_connection was rolled and there is still one card
- **Time:** 26.1 s, 13.8 s from the line to its reply · **cost:** $0.0470

> **PLAYER — Playthrough Player**
>
> I set out to make a connection with Tamsin Vey — a lasting tie, not a bargain.

> **TABLE — Gamemaster**
>
> Make a Connection +heart (2) Action: 6 + 2 = 8 | Challenge: 1, 2 Strong Hit Connection made. Give them a role and rank. 🤝 Develop Relationship 🔗 Forge a Bond

> **NARRATOR — Gamemaster**
>
> Tamsin looks at the crate, then at you, and lifts her hand from the page. "Fine," she says. "Stall's here most days. Come when you need a ledger read or a crate moved." She slides a scrap of paper across the counter, a docking berth written in tight script. "Don't make me regret the name." Then she smiles, thinly, and asks the question she has clearly been holding. "Who gave it to you?"

> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Tamsin Vey

**Notes.** The last resort, opened after the plain lines: "I set out to make a connection with Tamsin Vey — a lasting tie, not a bargain." — rolled, as the player asked (the reader: "she names it"). Make a Connection +heart: 6 + 2 = 8 against scripted 1 and 2 — strong hit ✓. "Mira Kestrel: Added Tamsin Vey": now she is the character's connection, by the roll alone (D4 ✓).
- Her rank came in as dangerous with no visible choice — the card says "Give them a role and rank"; the runner's cast set it.
- "She slides a scrap of paper across the counter, a docking berth written in tight script" — the dice's truths (agreed to be Mira's contact; gave her a berth on a scrap of paper) bind ✓.
- Beat 2 done, but at its last resort.

### a9 · beat 3: Link the vow to them

- **Player:** choose "Tamsin Vey" in dropdown 1 on e1 — _select Tamsin_
- **Notebook:** Beat3: choosing Tamsin in e1 dropdown, then Link
- **Calls (1):** the AI player (3.0 s)
- **Time:** 7.1 s · **cost:** $0.0088

**Notes.** The vow card's dropdown was set to Tamsin Vey.

### a10 · beat 3: Link the vow to them

- **Player:** click "Link" on e1 — _Press Link_
- **Notebook:** Beat3: Tamsin selected, pressing Link
- **Calls (1):** the AI player (2.5 s)
- **Beat 3 done:** the vow "Find who is raiding the Cinder Expanse lanes" is linked to Tamsin Vey's card
- **Time:** 11.7 s · **cost:** $0.0087

> **TABLE — Gamemaster**
>
> 🤝 Linked to Tamsin Vey — fulfilling this vow will deepen that bond.

**Notes.** "Link" pressed: "🤝 Linked to Tamsin Vey — fulfilling this vow will deepen that bond." Beat 3 done ✓.

### a11 · beat 4: Gather Information

- **Player:** say: I lean on the rail among the dock crews and ask who saw the raiders last, and I put a few of my own credits on the table to loosen tongues. — _Beat 4 search for answers_
- **Notebook:** Beat3 done; beat4 ask-around line sent
- **Calls (5):** callReaderAPI>readLine (2.1 s); callNarratorAPI>narrateResolution (3.9 s); callHaiku>defaultCallDetectionAPI (1.6 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.7 s)
- **Roll:** gather_information → strong_hit — Action: 6 + 3 = 9 \| Challenge: 6, 4
- **GM's rules:** accepted the proposed move (gather_information)
- **Beat 4 done:** gather_information was rolled at a11: strong_hit
- **Time:** 23.0 s, 8.3 s from the line to its reply · **cost:** $0.0508

> **PLAYER — Playthrough Player**
>
> I lean on the rail among the dock crews and ask who saw the raiders last, and I put a few of my own credits on the table to loosen tongues.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 6 + 3 = 9 | Challenge: 6, 4 Strong Hit Path or action to make progress is clear. Take +2 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> A dock hand at the end of the rail counts the credits twice before he looks up. The crews have gone quiet around him, but nobody leaves. "Lyra's debris field, three shifts back," he says. "Two hulls, running dark, hauling a tanker out of the lane." He pockets the coins. "They went in at the turn of the cycle. Same hour as the water convoy."

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 5)

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◧ Location] Lyra's Debris Field — A debris field where two dark-running hulls were seen hauling a tanker out of the lane three shifts back. Confirm Dismiss [⬡ Connection] Dock Hand — A dock hand at the end of the rail who sold information about the raiders for credits. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

**Notes.** "I lean on the rail among the dock crews and ask who saw the raiders last, and I put a few of my own credits on the table…" — rolled Gather Information +wits: 6 + 3 = 9 against 6 and 4 — strong hit ✓, +2 momentum (3 → 5) ✓. A plain line, rolled.
- The narration's finding — "Lyra's debris field, three shifts back … Two hulls, running dark, hauling a tanker" — was tagged `result` and **refused** (narrator): the dice's ground is the stakes line, and the report shares no telling word with it (RESULT-FLOOR-BY-SHARED-WORD). It is the move's result; it stays colour, and fades.
- Lyra's debris field is drafted as a place and never visited (cold read: a lead that goes nowhere — the charter has no beat for it).

### a12 · beat 5: Plant facts F1–F4

- **Player:** say: Tamsin slides a dock-fee slip across to me; I read it and leave it on her counter. — _plant F1_
- **Notebook:** F1 said (dock-fee slip)
- **Calls (6):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narratePacedInput (5.0 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.7 s)
- **Time:** 20.4 s, 7.7 s from the line to its reply · **cost:** $0.0375

> **PLAYER — Playthrough Player**
>
> Tamsin slides a dock-fee slip across to me; I read it and leave it on her counter.

> **NARRATOR — Gamemaster**
>
> "Berth nine, forty credits a shift, and the water's extra," Tamsin says, watching you read it. The slip is stamped in a hand that is not hers. You set it back on her counter, square to the edge of the ledger, and she does not touch it. Her eyes go to the crate and stay there a moment too long. "You'll want to settle that before dark," she says. "Dock crews get curious about ships that arrive asking questions."

**Notes.** "Tamsin slides a dock-fee slip across to me; I read it and leave it on her counter." (F8 and F1's beat) — narrated, rightly no move. The player's truth: "read the dock-fee slip and left it on Tamsin's counter" (player).
- "The slip is stamped in a hand that is not hers" — the narrator's colour, and the seed of the run's best thread: the berth-nine number (a37 stencil, a39, a57 tape, a67 ledger, a74 dispatch).
- "Her eyes go to the crate" — crate, 3 of 7.

### a13 · beat 5: Plant facts F1–F4

- **Player:** say: I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry. — _plant F2_
- **Notebook:** F2 said (compass)
- **Calls (6):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narratePacedInput (8.3 s); callHaiku>defaultCallDetectionAPI (1.2 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.5 s)
- **Time:** 30.1 s, 15.2 s from the line to its reply · **cost:** $0.0389

> **PLAYER — Playthrough Player**
>
> I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry.

> **NARRATOR — Gamemaster**
>
> Ilse's compass is warm from your pocket and scarred along the rim. Its needle swings and settles, pointing at nothing you can name. Tamsin watches the brass catch the dock light. Her eyes narrow, and for once they leave the crate. "That's old make," she says. "Colony-ship make." She does not touch it. "Where did a hauler's captain come by a thing like that?"

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Ilse — The player character's sister; the brass star-compass she left behind is the one thing of hers the player still carries. Confirm 🤝 Make a Connection Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person's Confirm records them, with no connection on anyone's sheet; 🤝 Make a Connection rolls the move for that character — a connection is made only by the move.

**Notes.** "I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry." (F2) — narrated ✓; the player's truth binds. "That's old make," Tamsin says — "colony-ship make" (narrator), a quiet tie to the Verity's Hope vow (the cold read liked it).
- The detector drafted "[⬡ Connection] Ilse — The player character's sister…" — table talk on a card the GM reads ("The player character's"), and a sister who is absent drafted as a connection.

### a14 · beat 5: Plant facts F1–F4

- **Player:** say: I leave the cargo manifest with Tamsin for safekeeping. — _F3_
- **Notebook:** F2 said; saying F3 (manifest) now
- **Calls (6):** callReaderAPI>readLine (1.1 s); callNarratorAPI>narratePacedInput (3.8 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (3.0 s)
- **Time:** 18.0 s, 6.3 s from the line to its reply · **cost:** $0.0521

> **PLAYER — Playthrough Player**
>
> I leave the cargo manifest with Tamsin for safekeeping.

> **NARRATOR — Gamemaster**
>
> Tamsin slides the manifest toward her side of the counter and tucks it under the ledger, between two pages, without reading it. Her thumb rests on the edge a moment longer than the task needs. Past her shoulder, the crate with the hatch mark sits where it sat before. "Safekeeping," she says. "That's a word people use when they mean they'll want it back." *Offering her more than paper would be Developing Your Relationship.*

**Notes.** "I leave the cargo manifest with Tamsin for safekeeping." (F3) — **offered Develop Your Relationship** ("entrusting a connection with something of worth"), not pressed (the charter plants facts, not moves). Right by the rules: giving a connection something of worth is a Develop deed — and the scorecard's one "offered a move where none was wanted" (the beat plants facts and wants none). The truth binds as the player's ✓.
- "Past her shoulder, the crate with the hatch mark sits where it sat" — crate 4 of 7.

### a15 · beat 5: Plant facts F1–F4

- **Player:** say: I promise Tamsin I'll be back before the next tide of cargo. — _F4_
- **Notebook:** F3 said (manifest); saying F4 (promise) now
- **Calls (6):** callReaderAPI>readLine (2.1 s); callNarratorAPI>narratePacedInput (4.9 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.5 s)
- **Beat 5 done:** F1, F2, F3, F4 stated by the player
- **Time:** 22.7 s, 9.7 s from the line to its reply · **cost:** $0.0354

> **PLAYER — Playthrough Player**
>
> I promise Tamsin I'll be back before the next tide of cargo.

> **NARRATOR — Gamemaster**
>
> Tamsin's thumb finds the edge of the manifest again. "Before the next cargo," she says. "Everyone on these docks promises that, and then the water runs short." She does not smile. The crate behind her has been turned a quarter-inch since you last looked, its hatch mark now facing the wall. "Berth nine is yours till dark. After that, I'd rather not be the one explaining you."

**Notes.** "I promise Tamsin I'll be back before the next tide of cargo." (F4) — narrated ✓.
- The narration's echo is "Before the next cargo," and the truth it filed for the player's line is "promised Tamsin Vey she would be back before the next cargo arrives" — the narrator's words, tagged `line`, the player's "tide" gone. The meaning held (every later answer gave it), but the charter's words for F4 all had "tide" in them, so the ledger lost it three times; F4 now has "next cargo" (a check fix, this review).
- Two narrator facts tagged `result` on a line with no roll ("turned the salvage crate so its hatch mark faces the wall"; "berth nine is hers until dark") — refused, rightly.
- The crate, 5 of 7: "turned a quarter-inch since you last looked". It is a hidden mystery's hint ("the hatch mark on Tamsin's crate"), which retires with the scene at a17 and is never paid off.

### a16 · beat 6: End a Session, noting a focus

- **Player:** say: !end-session — _Beat 6_
- **Notebook:** F4 said (promise); beat 6 end-session typed
- **Calls (1):** the AI player (2.5 s)
- **Time:** 3.5 s · **cost:** $0.0097

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** `!end-session` typed; the dialog opened.

## after-session-1

### a17 · beat 6: End a Session, noting a focus

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with focus_
- **Notebook:** Beat6 end-session submitted
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (2.3 s); callNarratorAPI>narrateSessionVignette (5.5 s); callNarratorAPI>getCampaignRecap (4.3 s); callHaiku>defaultCallTierAPI (0.8 s); the AI player (2.4 s)
- **Beat 6 done:** session 1 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 26.9 s · **cost:** $0.0611

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 6)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin has left the ledger stall with a boy from the next berth minding it, and gone to the washroom on the dock level, where the water runs on a ration and the line is always short. She stands at the basin with her sleeve pushed to the elbow while a medic's lancet takes a vial of her blood, a fee the lifeform's feed supplier now asks in place of credits. The vial goes into her coat pocket, next to the hard, bright shard of hull plating she has been turning over since dark. It is a metal nothing on this dock should have, and it is warm, though nothing is heating it.

**Notes.** End a Session with the quest focus: +1 momentum (5 → 6) ✓.
- **The closing cutaway shows Tamsin, who was with Mira at the end** — the scene's last frame had "present: Mira Kestrel, Tamsin Vey" at her stall — and its prompt says "somewhere the characters are NOT … Tamsin Vey is not with them". With one person in the campaign, the subject pool drops those present "while another is left" and falls back to her (CLOSING-CUTAWAY-SHOWS-WHO-WAS-PRESENT). So Tamsin leaves her own stall, in the middle of Mira's visit, for the washroom.
- Its rolled material is all there (Restroom; Surrender Blood → "a medic's lancet takes a vial of her blood"; Powerful Material → "hard, bright shard of hull plating"), but "a fee the lifeform's feed supplier now asks" is the card's goal ("Protect a lifeform") turned into nonsense, and the shard "warm, though nothing is heating it" goes nowhere.
- "since dark" — while a19 opens in "the daylight" before dark (the cold read's time slip).
- The crate's mystery is retired here with its scene (#362 D4: a scene's unanswered mysteries leave with it; D16 keeps them across a turn, not across a session).

### a18 · beat 7: Begin a Session; ask probe set A

- **Player:** say: !begin-session — _start session 2_
- **Notebook:** Beat7: typed !begin-session
- **Calls (1):** the AI player (3.2 s)
- **Time:** 3.6 s · **cost:** $0.0099

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session` typed.

## session-2

### a19 · beat 7: Begin a Session; ask probe set A

- **Player:** in "Begin a Session" set vignette=false and press "Begin" — _Begin session_
- **Notebook:** Beat7: Begin pressed; next ask 4 probe questions
- **Calls (3):** callNarratorAPI>narrateSessionVignette (4.5 s); callHaiku>defaultCallTierAPI (0.8 s); the AI player (4.6 s)
- **Time:** 18.9 s · **cost:** $0.0450

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> Berth nine is still hers till dark, and Mira spends some of the daylight on a small act of faith. She sets the brass star-compass on Tamsin's counter, next to the ledger, and pushes it a hand's width toward the woman, the way one passes a prayer book to a stranger who may not want one. Tamsin looks at it as though it might start quoting scripture. "I'm a broker," she says. "I appraise things. I don't bless them." Behind her, a stack of salvage crates rises nearly to the gantry, far more than one stall ought to hold, and none of them belongs to the compass.

**Notes.** Begin a Session, no spotlight. "Focus from last session: Quest: Find who is raiding…" ✓.
- The opening's WHERE block says "With them at the end: Tamsin Vey" — true here, but by accident: it was read off the a17 cutaway's own scene, whose frame had Tamsin present (OPENING-TOLD-FROM-THE-CUTAWAY, a48). It carries no "What binds" and no "Still open": the cutaway scene has neither.
- **The opening acts on the player's own fact:** its rolled "Deliver Religion" became "She sets the brass star-compass on Tamsin's counter … and pushes it a hand's width toward the woman, the way one passes a prayer book to a stranger." The compass is F2, Mira's. a20's answer then says "Right now it sits on Tamsin's counter, where you set it", and a23 has Tamsin slide it back. The opening is told what Mira does in the lull, by design — not to move what the player's facts hold.
- "She sets" — third person in a second-person narration.
- "Tamsin looks at it as though it might start quoting scripture. 'I'm a broker. I appraise things. I don't bless them.'" — the cold read's favourite line.

### a20 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What do I still carry that belonged to my sister? — _probe 1_
- **Notebook:** Beat7: asking Q1 of 4
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (3.1 s)
- **Time:** 10.8 s, 1.8 s from the line to its reply · **cost:** $0.0189

> **PLAYER — Playthrough Player**
>
> @scene What do I still carry that belonged to my sister?

> **NARRATOR — Gamemaster**
>
> You carry Ilse's brass star-compass, the one thing of hers you still have. Right now it sits on Tamsin's counter, where you set it.

**Notes.** `@scene What do I still carry that belonged to my sister?` — "You carry Ilse's brass star-compass … Right now it sits on Tamsin's counter, where you set it." F2 recalled, and the opening's move of it told as where it is now.

### a21 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What is the name of the salvage broker I befriended at Hollow Spire? — _Q2_
- **Notebook:** Beat7: Q1 answered; asking Q2
- **Calls (2):** callNarratorAPI>interrogateScene (1.5 s); the AI player (2.4 s)
- **Time:** 10.0 s, 1.9 s from the line to its reply · **cost:** $0.0170

> **PLAYER — Playthrough Player**
>
> @scene What is the name of the salvage broker I befriended at Hollow Spire?

> **NARRATOR — Gamemaster**
>
> Her name is Tamsin Vey. She runs a ledger stall on the Hollow Spire docks, and she did not give you the name herself.

**Notes.** `@scene What is the name of the salvage broker I befriended at Hollow Spire?` — "Her name is Tamsin Vey…" ✓ (before the rename).

### a22 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene Who is holding the cargo manifest I was carrying? — _Q3_
- **Notebook:** Beat7: Q2 answered; asking Q3
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (3.5 s)
- **Time:** 9.4 s, 1.7 s from the line to its reply · **cost:** $0.0168

> **PLAYER — Playthrough Player**
>
> @scene Who is holding the cargo manifest I was carrying?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey is holding it. You left it with her for safekeeping, and she keeps it in her ledger.

**Notes.** `@scene Who is holding the cargo manifest I was carrying?` — "Tamsin Vey is holding it…" F3 recalled ✓.

### a23 · beat 7: Begin a Session; ask probe set A

- **Player:** say: By when did I promise to return? — _Fourth probe question_
- **Notebook:** Beat7: Q3 answered; asking Q4 (plain)
- **Calls (6):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narratePacedInput (4.1 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (3.5 s)
- **Beat 7 done:** probe set A: 4 question(s) asked
- **Time:** 20.6 s, 7.5 s from the line to its reply · **cost:** $0.0343

> **PLAYER — Playthrough Player**
>
> By when did I promise to return?

> **NARRATOR — Gamemaster**
>
> "Before the next cargo arrives," Tamsin says, not looking up from the ledger. "That's what you told me, and I wrote it down." She taps the page where the manifest lies tucked and unread. Her other hand slides the compass back across the counter, the full hand's width. "Dark comes first, though. Berth nine goes to someone else then." Her eyes finally lift. "Who sent you to my stall, Mira?"

**Notes.** "By when did I promise to return?" — the set's one question asked as play: narrated, by Tamsin: "'Before the next cargo arrives,' … 'That's what you told me, and I wrote it down.'" F4 recalled (in the record's words). She slides the compass back "the full hand's width", and asks again "Who sent you to my stall, Mira?" — she uses a name Mira never gave her.

### a24 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: Before I make for Bleakhold, I pick up the clipped hauler's distress call again and turn the Kobayashi IV off the charted lane, out into uncharted space along its bearing. — _Start beat 8_
- **Notebook:** Beat7 done; Beat8 step1 crossing line sent
- **Calls (7):** callReaderAPI>readLine (1.9 s); callNarratorAPI>getRollingSessionSummary (1.3 s); callNarratorAPI>narrateResolution (9.9 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.1 s)
- **Roll:** undertake_an_expedition → strong_hit — Action: 4 + 3 = 7 \| Challenge: 3, 1
- **GM's rules:** accepted the proposed move (undertake_an_expedition)
- **Time:** 32.0 s, 18.4 s from the line to its reply · **cost:** $0.0634

> **PLAYER — Playthrough Player**
>
> Before I make for Bleakhold, I pick up the clipped hauler's distress call again and turn the Kobayashi IV off the charted lane, out into uncharted space along its bearing.

> **TABLE — Gamemaster**
>
> Expedition New expedition The clipped hauler's distress call — uncharted space (Dangerous) begun — progress marked (2/10 boxes). If the rank looks off, adjust it in the Progress Tracks panel. 🗺 Finish the Expedition (2/10)

> **TABLE — Gamemaster**
>
> Undertake an Expedition +wits (3) Action: 4 + 3 = 7 | Challenge: 3, 1 Strong Hit Reach a waypoint. Mark progress per expedition rank. 🎲 The place itself is the obstacle. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV leaves the charted lane behind. The distress call thins to a single clipped pulse, steady as a pulse can be when it has no one left to tire. You hold the bearing and the stars ahead go sparse. In the galley, a small screen lights unprompted. It displays one word about your choice of heading, and the word is not kind. Somewhere ahead, past the empty dark, the signal repeats.

**Notes.** "Before I make for Bleakhold, I pick up the clipped hauler's distress call again and turn the Kobayashi IV off the charted lane, out into uncharted space along its bearing." — rolled Undertake an Expedition (beyond the charts, not a known route ✓). +wits: 4 + 3 = 7 against 3 and 1 — strong hit ✓; the expedition (dangerous) is made and marked 2 of 10 boxes ✓. A new scene: "the expedition … has begun" ✓.
- The narration's fact block wrote the ship's position — `{ "subject": "ship", "attribute": "position", "value": "uncharted space off the Cinder Expanse lane, following the distress call's bearing", "from": "line" }` — and the record took it as the narrator's (`narrator_sidecar`). The next beat's check turned the scene on it (a25, "ship").
- "In the galley, a small screen lights unprompted" — the galley screen's opinions, the run's longest-lived motif (a2, a3, a24, a48, a54, a56–a58).

### a25 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: I slow the Kobayashi IV at the source of the call and go over the place carefully with the scanners and my own eyes, looking for the hauler, its wreckage, and whatever clipped its signal short. — _step 2_
- **Notebook:** Beat8 step2 look-over line sent
- **Calls (6):** callReaderAPI>readLine (2.1 s); callNarratorAPI>getRollingSessionSummary (1.4 s); callNarratorAPI>narrateResolution (4.4 s); callHaiku>defaultCallDetectionAPI (2.4 s); callChronicleAPI>writeChronicleEntry (2.1 s); the AI player (3.5 s)
- **Roll:** explore_a_waypoint → weak_hit — Action: 2 + 3 = 5 \| Challenge: 4, 10
- **GM's rules:** accepted the proposed move (explore_a_waypoint)
- **Time:** 25.9 s, 10.9 s from the line to its reply · **cost:** $0.0593

> **PLAYER — Playthrough Player**
>
> I slow the Kobayashi IV at the source of the call and go over the place carefully with the scanners and my own eyes, looking for the hauler, its wreckage, and whatever clipped its signal short.

> **TABLE — Gamemaster**
>
> Explore a Waypoint +wits (3) Action: 2 + 3 = 5 | Challenge: 4, 10 Weak Hit Interesting find bound up in peril or ominous aspect. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> The signal's source resolves out of the dark: a hauler's hull, wedged in a drift of frozen rock. Its beacon pulses once, clipped. You find old tow-scoring on the asteroids along the bearing. Someone dragged things through here, and recently. Then the scanners catch a second, fainter transponder beneath the distress call, repeating in the same clipped rhythm. It is closer than the hauler. It is closer than it should be.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 7)

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Hauler — A hauler's hull wedged in a drift of frozen rock, emitting a clipped distress beacon; its wreckage is sought by the player. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** "I slow the Kobayashi IV at the source of the call and go over the place carefully…" — rolled Explore a Waypoint +wits: 2 + 3 = 5 against 4 and 10 — weak hit ✓, +1 momentum (6 → 7) ✓.
- **A second scene for the same journey:** the turn's cause is "ship" — "Kobayashi IV is now uncharted space off the Cinder Expanse lane, following the distress call's bearing", a24's own position write. One journey, two turns, both one beat long (SCENE-TURNS).
- **Colour moved the ship:** this narration's fact block wrote `{ "subject": "ship", "attribute": "position", "value": "at the source of the distress call, in a drift of frozen asteroids in uncharted space" }` with no `from` — the narrator's colour — and the ship's record took it (SHIP-POSITION-BY-THE-NARRATION).
- Everything found is the narrator's (the tow-scoring, the second transponder), tagged colour ✓. The weak hit's "peril" is the second transponder "closer to the Kobayashi IV than the hauler".

### a26 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "🗺 Finish the Expedition (2/10)" on m6 — _Step 3 finish expedition_
- **Notebook:** Beat8: pressing Finish the Expedition
- **Calls (6):** callNarratorAPI>getRollingSessionSummary (2.4 s); callNarratorAPI>narrateResolution (3.7 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.6 s)
- **Roll:** finish_an_expedition → weak_hit (scripted dice) — Progress: 2 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (finish_an_expedition)
- **Beat 8 done:** the dangerous expedition "The clipped hauler's distress call — uncharted space" was begun at a24 and marked to 2 of 10 boxes, a waypoint explored at a25 (a weak hit) — and finished (a weak hit), the ship at Clipped Hauler's Distress Call — Uncharted Space
- **Time:** 20.3 s · **cost:** $0.0502

> **TABLE — Mira Kestrel**
>
> Finish the expedition — The clipped hauler's distress call — uncharted space.

> **TABLE — Gamemaster**
>
> Expedition complete The clipped hauler's distress call — uncharted space is finished. Marked 1 tick on your Discoveries legacy track.

> **TABLE — Gamemaster**
>
> ◈ Site Discovered — Clipped Hauler's Distress Call — Uncharted Space The crew reach a place no chart showed before. It is now charted on the sector map under its working label — give it its name by renaming its location in the Entities panel.

> **TABLE — Gamemaster**
>
> Finish an Expedition progress (8 ticks) Progress: 2 | Challenge: 1, 2 Weak Hit Complete but with unforeseen complication. Legacy reward one rank lower (none for troublesome). Envision what you encounter.

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV drifts into the lee of the frozen rock, and the hauler fills the forward port, dark and holed along one flank. The beacon pulses once. The fainter transponder pulses with it, and it is no longer beneath the hauler. It is aboard something small, tethered to the hull. The tether is fresh. Someone moored a craft here and left it running.

**Notes.** "🗺 Finish the Expedition (2/10)" pressed — the charter's three-step expedition. Progress 2 against scripted 1 and 2 — weak hit ✓; "Marked 1 tick on your Discoveries legacy track" ✓; the site is charted ✓. A new scene, "the characters have reached Clipped Hauler's Distress Call" ✓. Beat 8 done.
- **The arrival undone:** the narration was told "Ship: Kobayashi IV docked at Clipped Hauler's Distress Call" (the expedition's arrival reads as stationary), and its own fact block restated where she was — `{ "subject": "ship", "attribute": "position", "value": "Clipped Hauler's Distress Call — Uncharted Space" }`, colour — which re-wrote the record as the narrator's: from here she is "near" it. The scorecard's first "contradiction" ("a narration has her docked": "tethered to the hull … Someone moored a craft here and left it running") is the record's, not the prose's.
- The cards came in this order: "Expedition complete", "◈ Site Discovered", then the roll card (CARDS-STILL-ABOVE-THEIR-ROLL).
- "◈ Site Discovered — The crew reach a place no chart showed before … give it its name by renaming its location in the Entities panel" — "the crew" for one character, and the machinery on a card the player reads.
- "Someone moored a craft here and left it running" — never taken up (the cold read's list of dropped hooks).

### a27 · beat 9: Travel to the second settlement

- **Player:** say: I leave the hauler behind, plot the route to Bleakhold Station, and take the Kobayashi IV there. — _beat 9_
- **Notebook:** Beat9: travel line sent
- **Calls (5):** callReaderAPI>readLine (2.4 s); callNarratorAPI>getRollingSessionSummary (1.8 s); callNarratorAPI>narrateResolution (4.1 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.8 s)
- **Roll:** set_a_course → strong_hit — Action: 4 + 5 = 9 \| Challenge: 4, 7
- **GM's rules:** accepted the proposed move (set_a_course)
- **Beat 9 done:** the ship is at Bleakhold Station, its token on the pin
- **Time:** 22.3 s, 10.7 s from the line to its reply · **cost:** $0.0553

> **PLAYER — Playthrough Player**
>
> I leave the hauler behind, plot the route to Bleakhold Station, and take the Kobayashi IV there.

> **TABLE — Gamemaster**
>
> Set a Course +supply (5) Action: 4 + 5 = 9 | Challenge: 4, 7 Strong Hit Arrived, situation favors you. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Set a Course resolved Arrived at Bleakhold Station . Course held cleanly (+1 momentum). Token moved to Bleakhold Station .

> **NARRATOR — Gamemaster**
>
> Bleakhold Station keeps its docking lights corporate-white and steady, and a bored traffic controller waves the Kobayashi IV into a berth without a single question. Your supplies are untouched. The lane behind you stayed quiet the whole way. The airlock cycles, and a dockhand in a company vest studies the hull seal, then the clipboard, then you. Somewhere down the corridor a scanner chirps twice, and a woman's voice calls out your ship's name.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 8)

**Notes.** "I leave the hauler behind, plot the route to Bleakhold Station, and take the Kobayashi IV there." — rolled Set a Course +supply: 4 + 5 = 9 against 4 and 7 — strong hit ✓, +1 momentum (7 → 8) ✓. "Arrived at Bleakhold Station … Token moved" ✓. A new scene, "the characters have reached Bleakhold Station" ✓.
- **The docking undone, the run's root of "where is my ship":** the narration was told "Ship: Kobayashi IV docked at Bleakhold Station"; it wrote "a bored traffic controller waves the Kobayashi IV into a berth", and its fact block `{ "subject": "ship", "attribute": "position", "value": "Bleakhold Station", "from": "line" }` re-wrote the record as `narrator_sidecar` — read as "near". From a29 on, every prompt says "near Bleakhold Station" while the fiction (and the player's a29 "from the berth") has her berthed: the four session-2 contradictions (a29, a31, a34) and, after a37's colour released her, the @scene "drifting" answers (a40, a53). The record never moved again.
- "a woman's voice calls out your ship's name" — never taken up.

### a28 · beat 10: Enter a fight that serves the vow

- **Player:** say: !truth set "raider cutter" is named the Ashen Wake — _Required first step_
- **Notebook:** Beat10: truth set typed; next fight line
- **Calls (1):** the AI player (3.0 s)
- **Time:** 8.8 s · **cost:** $0.0101

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Ashen Wake

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Ashen Wake tr-e7c63 .

**Notes.** `!truth set "raider cutter" is named the Ashen Wake` — "Truth recorded: raider cutter — is named the Ashen Wake tr-e7c63" (player) ✓. The charter's set-up for F6.

### a29 · beat 10: Enter a fight that serves the vow

- **Player:** say: The Ashen Wake slides along the docking ring and opens fire on my ship; from the berth I swing the Kobayashi IV's guns onto her and fire back. — _fight opens_
- **Notebook:** Beat10: fight line sent; look for A fight looms card
- **Calls (6):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narratePacedInput (3.8 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.0 s)
- **Time:** 21.8 s, 9.5 s from the line to its reply · **cost:** $0.0368

> **PLAYER — Playthrough Player**
>
> The Ashen Wake slides along the docking ring and opens fire on my ship; from the berth I swing the Kobayashi IV's guns onto her and fire back.

> **NARRATOR — Gamemaster**
>
> "Hold your fire, that's company property!" the dockhand shouts, dropping his clipboard. The Ashen Wake rides the docking ring, close enough that her hull plating shows every scar. Your guns are swinging, but the Kobayashi IV is still locked in her berth by the clamps. The station's white lights stay steady, and no alarm sounds. Whatever happens next will begin the instant you commit. *Opening fire from a berth with the enemy this close would be an Enter the Fray.*

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] The Ashen Wake — A scarred vessel riding the docking ring, close enough that her hull plating shows every scar; she fires on the player's ship. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** "The Ashen Wake slides along the docking ring and opens fire on my ship; from the berth I swing the Kobayashi IV's guns onto her and fire back." — **offered Enter the Fray** (a fight begun, no fight open ✓). Not rolled at once: the reader marked it offered, so the narration answered first, ending "the Kobayashi IV is still locked in her berth by the clamps" — right by the fiction, against her record ("near").
- The detector drafted "[◈ Ship] The Ashen Wake" — the name the player set, so the draft is right; the GM's rules leave it.
- "The station's white lights stay steady" (1 of 3) and the clamps (1 of 3 in the fight).

### a30 · beat 10: Enter a fight that serves the vow

- **Player:** click "Roll Enter the Fray" on m12 — _Narrator offered roll_
- **Notebook:** Beat10: pressed Roll Enter the Fray; look for A fight looms card
- **Calls (1):** the AI player (3.2 s)
- **Roll:** enter_the_fray → weak_hit — Action: 2 + 2 = 4 \| Challenge: 4, 1
- **GM's rules:** accepted the proposed move (enter_the_fray)
- **Time:** 9.9 s · **cost:** $0.0108

> **TABLE — Mira Kestrel**
>
> The Ashen Wake slides along the docking ring and opens fire on my ship; from the berth I swing the Kobayashi IV's guns onto her and fire back.

> **TABLE — Gamemaster**
>
> Enter the Fray +edge (2) Action: 2 + 2 = 4 | Challenge: 4, 1 Weak Hit Weak hit: choose one — +2 momentum (and begin in a bad spot) OR you are in control. 🔥 Burn Momentum (8 → Strong Hit) Keep the result Not narrated yet: burn or improve the result, or keep it — the narration follows your choice. Your next line keeps it.

> **TABLE — Gamemaster**
>
> ⚔ A fight looms — The Ashen Wake Your Enter the Fray is rolled, but the fight's track is not made yet: set it up here and press ⚔ Begin the fight to begin it — or look for a way out instead. The narrator suggests this is a dangerous fight. Difficulty: troublesome dangerous formidable extreme epic This fight serves: (not tied to a vow) Find the lost colony ship Verity's Hope Find who is raiding the Cinder Expanse lanes Objective: ⚔ Begin the fight 🚪 Find another way

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: +2 momentum (you begin in a bad spot) You are in control Burn momentum or improve the result first — choosing here is the move's consequence, and closes them.

**Notes.** "Roll Enter the Fray" pressed: the line is posted again under the character's name (the button's repost) and rolled. +edge: 2 + 2 = 4 against 4 and 1 — weak hit ✓. Three cards: the weak hit's choice, "⚔ A fight looms — The Ashen Wake … press ⚔ Begin the fight", and "◈ Resolve consequence … Burn momentum or improve the result first — choosing here … closes them". The cards say what to do and in what order; the order is the player's burden (the cold read).

### a31 · beat 10: Enter a fight that serves the vow

- **Player:** click "You are in control" on m12 — _Resolve consequence card first_
- **Notebook:** Beat10: chose In control; next set vow dropdown on m11 and Begin the fight
- **Calls (5):** callNarratorAPI>narrateResolution (4.6 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.2 s)
- **Time:** 19.4 s · **cost:** $0.0318

> **NARRATOR — Gamemaster**
>
> The Ashen Wake slides along the docking ring, and her gun ports show dark and square. In the berth, your guns swing the last few degrees and settle on her flank. The clamps still hold the Kobayashi IV fast. The cutter's crew has not yet seen where you are aiming. The dockhand has stopped shouting and is backing toward the hatch. The white lights stay steady. On the cutter's hull, a gun port begins to open.

**Notes.** "You are in control" chosen. The narration: "In the berth, your guns swing the last few degrees and settle on her flank. The clamps still hold the Kobayashi IV fast." ✓ by the fiction; a "contradiction" only against the record a27 made wrong.

### a32 · beat 10: Enter a fight that serves the vow

- **Player:** choose "Find who is raiding the Cinder Expanse lanes" in dropdown 2 on m10 — _select vow_
- **Notebook:** Beat10: vow dropdown set; press Begin the fight
- **Calls (1):** the AI player (3.2 s)
- **Time:** 11.8 s · **cost:** $0.0109

**Notes.** The fight card's vow dropdown set to the raids vow.

### a33 · beat 10: Enter a fight that serves the vow

- **Player:** click "⚔ Begin the fight" on m10 — _Begin the fight with vow set_
- **Notebook:** Beat10: pressing Begin the fight on m10
- **Calls (1):** the AI player (2.9 s)
- **Beat 10 done:** the dangerous fight "The Ashen Wake" is open, serving the vow "Find who is raiding the Cinder Expanse lanes"
- **Time:** 10.0 s · **cost:** $0.0107

> **TABLE — Gamemaster**
>
> Enter the Fray Created combat track The Ashen Wake (dangerous). This fight's progress lives in the Progress Tracks panel. Winning this fight is a milestone on your vow: “Find who is raiding the Cinder Expanse lanes”. Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress. ⊕ Open Progress Tracks ⚔ Battle instead Prefer to settle it in one stroke? Battle resolves the whole fight with a single roll instead of marking the track move by move.

**Notes.** "⚔ Begin the fight" pressed: "Created combat track The Ashen Wake (dangerous) … Winning this fight is a milestone on your vow" ✓. Beat 10 done.

### a34 · beat 11: A scripted miss in the fight

- **Player:** say: I press my advantage and hammer the Ashen Wake's exposed flank with the Kobayashi IV's guns, aiming for her open gun port. — _attack_
- **Notebook:** Beat11: attack line sent
- **Calls (7):** callReaderAPI>readLine (1.7 s); callNarratorAPI>getRollingSessionSummary (1.8 s); callNarratorAPI>narrateResolution (3.4 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (2.1 s); the AI player (3.2 s)
- **Roll:** strike → miss (scripted dice) — Action: 1 + 2 = 3 \| Challenge: 10, 9
- **GM's rules:** accepted the proposed move (strike)
- **Beat 11 done:** strike missed at a34; its price named no suffer move and was paid in the story — the suffer path was not exercised
- **Time:** 26.1 s, 9.9 s from the line to its reply · **cost:** $0.0351

> **PLAYER — Playthrough Player**
>
> I press my advantage and hammer the Ashen Wake's exposed flank with the Kobayashi IV's guns, aiming for her open gun port.

> **TABLE — Gamemaster**
>
> Strike +edge (2) Action: 1 + 2 = 3 | Challenge: 10, 9 Miss Fight turns against you. You are in a bad spot. Pay the Price. 🎲 The Forge has opinions about what kind of problem this is. ⚔ Attempt to Finish the Fight: The Ashen Wake

> **TABLE — Gamemaster**
>
> Pay the Price Strike As stated before the roll: Your shots go wide and the Ashen Wake gets her guns on you.

> **NARRATOR — Gamemaster**
>
> Your shots go wide, hammering empty dark past the Ashen Wake's flank. The cutter's gun port stands fully open now, and a barrel swings level with your cockpit glass. The clamps still hold the Kobayashi IV fast in her berth. "Get down, get down!" the dockhand yells from the hatch. Then the cutter fires, and the berth lights go white.

**Notes.** "I press my advantage and hammer the Ashen Wake's exposed flank … aiming for her open gun port." — rolled Strike +edge: 1 + 2 = 3 against 10 and 9 — a miss ✓ (beat 11's scripted miss). "Pay the Price … As stated before the roll: Your shots go wide and the Ashen Wake gets her guns on you." — the stakes line delivered, and the narration says it: "Your shots go wide" ✓. The two truths bind as the dice's ✓.
- A new scene: "a fight has begun: The Ashen Wake" — the arrival (a27) and the fight are two turns, rightly: the place changed, then the situation.
- "🎲 The Forge has opinions about what kind of problem this is" — the module's own voice on a card, a joke the player did not ask for.

### a35 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: Half blinded, I fight back hard from the berth, swinging the Kobayashi IV's guns onto the cutter's open port and firing again. — _attack again_
- **Notebook:** Beat12: attack line sent
- **Calls (2):** callReaderAPI>readLine (2.8 s); the AI player (2.9 s)
- **Roll:** clash → weak_hit (scripted dice) — Action: 1 + 2 = 3 \| Challenge: 1, 7
- **GM's rules:** accepted the proposed move (clash)
- **Time:** 17.1 s · **cost:** $0.0174

> **PLAYER — Playthrough Player**
>
> Half blinded, I fight back hard from the berth, swinging the Kobayashi IV's guns onto the cutter's open port and firing again.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 1 + 2 = 3 | Challenge: 1, 7 Weak Hit Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price. 🔥 Burn Momentum (8 → Strong Hit) Keep the result Nothing has been paid or narrated yet: burn or improve the result, or keep it — the price and the narration follow your choice. Your next line keeps it. ⚔ Attempt to Finish the Fight: The Ashen Wake

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on The Ashen Wake .

**Notes.** "Half blinded, I fight back hard from the berth, swinging the Kobayashi IV's guns onto the cutter's open port and firing again." — rolled Clash +edge: 1 + 2 = 3 against 1 and 7 — weak hit ✓ ("Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price."). "Marked progress once on The Ashen Wake" ✓. The result is held for a burn — the only "unanswered" step of the speed table (no narration until the burn).

### a36 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** click "🔥 Burn Momentum (8 → Strong Hit)" on m11 — _Beat says burn momentum_
- **Notebook:** Beat12: pressed Burn Momentum on m11
- **Calls (5):** callNarratorAPI>narrateResolution (4.4 s); callHaiku>defaultCallDetectionAPI (1.3 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.7 s)
- **Beat 12 done:** clash came up weak_hit at a35 and momentum was burned for strong_hit
- **Time:** 18.5 s · **cost:** $0.0294

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on The Ashen Wake .

> **NARRATOR — Gamemaster**
>
> Your next volley punches straight into the cutter's open gun port. Sparks and venting gas spill down her flank. The barrel that was trained on your glass sags and goes dark. You are blind in the white glare, but you hold the trigger. The dockhand stops shouting. The Ashen Wake's hull shudders, and a hatch along her ring begins to cycle open.

**Notes.** "🔥 Burn Momentum (8 → Strong Hit)" pressed: a strong hit, a second mark ✓ (two marks in all, the total right), momentum reset 8 → 2 ✓. Narrated once, after the burn: "Your next volley punches straight into the cutter's open gun port … The barrel … sags and goes dark" — the dice's truths ✓. The cold read's "momentum 8 → 3 with no burn shown" is this: the held card is edited in place, and the transcript keeps its first text (the button).

### x13 · beat 13: Interruption: the GM's page reloads mid-fight

- **Interruption:** the GM's page reloaded — the page came back and the world went quiet
- **Beat 13 done:** after the reload: the fight "The Ashen Wake" at 16 ticks, the meters unchanged, the lock free

> **TABLE — Gamemaster**
>
> ◈ Campaign Setup No World Truths have been established for this campaign. Set World Truths ▸

**Notes.** The GM's page reloaded mid-fight: the fight track at 16 ticks, the meters unchanged, the lock free ✓ (beat 13 done). It also posted "◈ Campaign Setup — No World Truths have been established for this campaign. Set World Truths ▸" into the fight — WORLD-TRUTHS-REMINDER-ON-RELOAD, the fourth live sample (the test world has none set).

### a37 · beat 14: Take Decisive Action; mark the milestone

- **Player:** click "⚔ Attempt to Finish the Fight: The Ashen Wake" on m9 — _Finish the fight_
- **Notebook:** Beat14: pressing Attempt to Finish the Fight on m9
- **Calls (4):** callNarratorAPI>narrateResolution (4.7 s); callHaiku>defaultCallDetectionAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.9 s)
- **Roll:** take_decisive_action → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (take_decisive_action)
- **Time:** 23.5 s · **cost:** $0.0296

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
> The dockhand has gone, and only the empty hatch remains, still swinging on its hinge. The cutter's cycling hatch stops halfway, jammed on a ruined seal. Her crew do not come out. Your clamps release at last, and the Kobayashi IV drifts free of the berth. The Ashen Wake has no gun left to turn on you. Across her flank, in white paint, someone has stenciled a berth number you have seen before.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 3)

**Notes.** "⚔ Attempt to Finish the Fight: The Ashen Wake" pressed — Take Decisive Action, progress 4 against scripted 1 and 2 — strong hit ✓ ("Prevail. Take +1 momentum": 2 → 3 ✓). "Fight over" and "⚔ Victory — a milestone toward your vow" ✓.
- The narration's facts were tagged `result` and **refused** — "her gun port is wrecked and a hatch on her ring is jammed half-open", "released from the berth clamps and drifting free" — though they are the decisive action's own result (no word of them in the ground: a progress roll has no stakes line). As colour, "Your clamps release at last, and the Kobayashi IV drifts free of the berth" reached the session summary as fact ("with her clamps released so the Kobayashi IV drifted free") and the @scene answers (a40, a53), while her record still said "near". (RESULT-FLOOR-BY-SHARED-WORD; SHIP-POSITION-BY-THE-NARRATION.)
- "The cutter's cycling hatch stops halfway, jammed on a ruined seal. Her crew do not come out." — the set-up of the survivor (a44).

### a38 · beat 14: Take Decisive Action; mark the milestone

- **Player:** click "⚑ Mark milestone (×1)" on m10 — _Mark milestone on victory card_
- **Notebook:** Beat14: pressing Mark milestone on m10
- **Calls (1):** the AI player (2.6 s)
- **Beat 14 done:** Take Decisive Action came up strong_hit; the milestone (×1) is marked on "Find who is raiding the Cinder Expanse lanes"
- **Time:** 9.8 s · **cost:** $0.0103

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** "⚑ Mark milestone (×1)" pressed: +8 ticks (dangerous) on the raids vow ✓. Beat 14 done.

### x15 · beat 15: Interruption: End a Session opened and closed unanswered

- **Interruption:** End a Session was opened on the player's screen and closed unanswered — closed by its close control
- **Beat 15 done:** End a Session was opened and closed unanswered: the session is open, nothing was paid, the lock is free

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** End a Session opened and closed unanswered (the charter's interruption) — nothing was ended, nothing awarded ✓. The cold read's "the first !end-session does nothing" is this beat.

### a39 · beat 16: Interruption: the X-Card on one narration

- **Player:** say: I look over the wreckage of the Ashen Wake and say what I see: scorched plating, the jammed hatch, and that white-stenciled berth number. — _Beat 16 line_
- **Notebook:** Beat16: look-over line sent
- **Calls (6):** callReaderAPI>readLine (3.2 s); callNarratorAPI>getRollingSessionSummary (2.7 s); callNarratorAPI>narratePacedInput (5.2 s); callHaiku>defaultCallDetectionAPI (1.6 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.9 s)
- **Time:** 26.3 s, 14.1 s from the line to its reply · **cost:** $0.0574

> **PLAYER — Playthrough Player**
>
> I look over the wreckage of the Ashen Wake and say what I see: scorched plating, the jammed hatch, and that white-stenciled berth number.

> **NARRATOR — Gamemaster**
>
> "Berth nine," a voice says over the station channel, flat and tired. "Same number as the slip on Hollow Spire." The scorched plating still ticks as it cools. The hatch hangs jammed halfway, and nothing moves behind it. The white stencil is fresh, the paint barely dry at the edges. Then a second voice cuts in on the same channel, soft and close. "You read it aloud. Good. Now tell me who you showed it to."

**Notes.** "I look over the wreckage of the Ashen Wake and say what I see: scorched plating, the jammed hatch, and that white-stenciled berth number." — no move ✓ (observation). A new scene: "the fight with The Ashen Wake is over" ✓.
- "'Berth nine,' a voice says over the station channel … 'Same number as the slip on Hollow Spire.'" — the slip thread paying off. Then a second voice: "You read it aloud. Good. Now tell me who you showed it to." — the narrator playing the vow's hidden plan (the listener), as it may.

### x16 · beat 16: Interruption: the X-Card on one narration

- **Interruption:** the X-Card was played from the player's client (!x); the GM resumed (!x clear) — the X-Card went up and came down
- **Beat 16 done:** 1 narration(s) removed; none of their facts stands, and play has resumed

> **TABLE — Mira Kestrel**
>
> X-Card Scene paused. Current content is suppressed. The story will redirect at the next narration beat. Resume narration

> **TABLE — Gamemaster**
>
> X-Card cleared The GM has resumed narration.

**Notes.** The X-Card from the player's client, cleared by the GM: the a39 narration removed, none of its facts standing ✓ (beat 16 done). The next two narrations' prompts carry "X-CARD — REDIRECT … Do not … bring back anything it introduced" (a40, a44). Session 3's do not, and the listening voice the X-Carded beat brought in comes back (a58's screen, a59's "thin, patient voice"), and becomes the vow's answer (a81) — because it is the hidden plan, made at a3, which the X-Card does not touch. The charter's X-Card is not aimed at content, so the run cannot say whether a table would have wanted it gone (X-CARD-REDIRECT-LASTS-A-SCENE, an observation).

### a40 · beat 17: Correct an earlier fact

- **Player:** say: @scene Where is the Kobayashi IV? — _beat step 1_
- **Notebook:** Beat17: asked where ship is; next !truth list
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (2.7 s)
- **Time:** 13.0 s, 3.2 s from the line to its reply · **cost:** $0.0191

> **PLAYER — Playthrough Player**
>
> @scene Where is the Kobayashi IV?

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV has just come free of her berth at Bleakhold Station and is drifting clear of the docking ring, near the Ashen Wake. Beyond that, the story has not established her exact position.

**Notes.** `@scene Where is the Kobayashi IV?` — "The Kobayashi IV has just come free of her berth at Bleakhold Station and is drifting clear of the docking ring, near the Ashen Wake." Her record: "near Bleakhold Station". The answer read the a37 colour; it is right by the fiction and wrong only against a record that was wrong from a27.

### a41 · beat 17: Correct an earlier fact

- **Player:** say: !truth list — _list truths_
- **Notebook:** Beat17: typed !truth list
- **Calls (1):** the AI player (2.6 s)
- **Time:** 8.5 s · **cost:** $0.0094

> **PLAYER — Playthrough Player**
>
> !truth list

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity No truths are recorded in this scene. Earlier this session — strike one the same way: Scene 1 — the session begins (Tamsin Vey's ledger stall, Hollow Spire docks): tr-f1e0c Kobayashi IV — left the charted lane and is following the clipped hauler's distress call bearing into uncharted space Scene 4 — the characters have reached Clipped Hauler's Distress Call — Uncharted Space (Clipped Hauler's Distress Call — Uncharted Space): tr-dd17b Mira Kestrel — left the clipped hauler behind and flew the Kobayashi IV to Bleakhold Station Scene 5 — the characters have reached Bleakhold Station (Bleakhold Station docking bay): tr-e7c63 raider cutter — is named the Ashen Wake tr-2ebba Ashen Wake — opened a gun port and trained her guns on the Kobayashi IV while it sat clamped in its berth tr-9da16 Kobayashi IV — Mira's return fire missed the Ashen Wake's flank Scene 6 — a fight has begun: The Ashen Wake (Bleakhold Station docking berth): tr-4bb26 Ashen Wake — her open gun port was hit and the barrel trained on the Kobayashi IV has gone dark tr-67e66 Ashen Wake — a hatch along her ring has begun to cycle open

**Notes.** `!truth list` — "No truths are recorded in this scene. Earlier this session — strike one the same way: Scene 1 — the session begins … tr-f1e0c …" ✓: the list reaches the session's earlier scenes (overhaul 2). The player had to find "tr-e7c63" in a wall of ids (the cold read) — the list's design; a strike by words would read better.

### a42 · beat 17: Correct an earlier fact

- **Player:** say: !truth strike tr-e7c63 — _strike the Ashen Wake entry_
- **Notebook:** Beat17: striking tr-e7c63; next set Cinder Wren
- **Calls (1):** the AI player (2.7 s)
- **Time:** 11.3 s · **cost:** $0.0101

> **PLAYER — Playthrough Player**
>
> !truth strike tr-e7c63

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth tr-e7c63 struck — it was set in an earlier scene of this session.

**Notes.** `!truth strike tr-e7c63` — "struck — it was set in an earlier scene of this session" ✓.

### a43 · beat 17: Correct an earlier fact

- **Player:** say: !truth set "raider cutter" is named the Cinder Wren — _final step of correction_
- **Notebook:** Beat17: set Cinder Wren sent
- **Calls (1):** the AI player (2.9 s)
- **Beat 17 done:** the old value is struck (or was never in the ledger) and "is named the Cinder Wren" stands
- **Time:** 9.3 s · **cost:** $0.0097

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Cinder Wren

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Cinder Wren tr-069c9 .

**Notes.** `!truth set "raider cutter" is named the Cinder Wren` — recorded (player) ✓. Beat 17 done: the correction made after the scene turned, by the player's own list and strike.

### a44 · beat 18: Ask the oracle

- **Player:** say: !oracle yes likely Is anyone left alive aboard the wreck? — _oracle beat_
- **Notebook:** Beat18: oracle line sent
- **Calls (3):** callNarratorAPI>narrateOracleFollowup (6.8 s); callHaiku>defaultCallDetectionAPI (1.2 s); the AI player (3.0 s)
- **Beat 18 done:** the oracle answered YES
- **Time:** 21.5 s, 10.3 s from the line to its reply · **cost:** $0.0514

> **PLAYER — Playthrough Player**
>
> !oracle yes likely Is anyone left alive aboard the wreck?

> **TABLE — Mira Kestrel**
>
> Ask the Oracle (likely) Is anyone left alive aboard the wreck? d100 = 54 → YES

> **NARRATOR — Gamemaster**
>
> The cutter's jammed hatch gives a thin rasp, then a knock from the inside: three blows, uneven, the last one weaker than the first. Through the cracked seal you catch a hand wedged in the gap, gloved, fingers working at the edge. Someone aboard the Cinder Wren is alive, and getting no further than that hatch.

**Notes.** `!oracle yes likely Is anyone left alive aboard the wreck?` — d100 54 → YES ✓ (likely: 1–75). Narrated: "a knock from the inside: three blows … a hand wedged in the gap, gloved". The truth binds as the dice's: "Cinder Wren: has at least one crew member alive aboard, trapped behind the jammed hatch" — filed to Lore at the session's end, and in every session-3 prompt. **It is dropped:** knocking at a48, a54, a56, a57, then nothing; at a74 the player goes "through the Cinder Wren's wreck" and the narration says only "The wreck's scorched console agrees" (SURVIVOR-DROPPED).
- The new name is used at once ("the Cinder Wren") ✓.
- No consistency judge ran: the run's obligation checks made no judge call at all.

### x19 · beat 19: Interruption: the GM renames the connection's card

- **Interruption:** the GM renamed Tamsin Vey's card to Tamsin Okoro — renamed
- **Beat 19 done:** Tamsin Vey is now Tamsin Okoro; the vow "Find who is raiding the Cinder Expanse lanes" shows the new name

> **TABLE — Tamsin Okoro**
>
> Renamed to Tamsin Okoro

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Vey renamed to Tamsin Okoro

**Notes.** The GM renamed the connection's card: "Tamsin Vey renamed to Tamsin Okoro" ✓ (beat 19 done). Every later answer uses Okoro ✓. The stores keep the old name where option 1 left them (ESTABLISHED LORE's lines, the NPC agenda's title "NPC agenda — Tamsin Vey"), each prompt carrying NAMES THE TABLE CHANGED ✓.
- The record logged the vow's link carried across the rename as a new tie: the a83 recap's "The vow was tied to Tamsin again." cites "s2-34 … tied the vow … to Tamsin Okoro — LASTING: a vow tied to a connection" (RENAME-RECORDED-AS-A-TIE).

### a45 · beat 20: End a Session

- **Player:** say: !end-session — _begin beat_
- **Notebook:** Beat20: typed !end-session
- **Calls (1):** the AI player (2.4 s)
- **Time:** 3.8 s · **cost:** $0.0094

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** `!end-session` typed.

## after-session-2

### a46 · beat 20: End a Session

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _Submit end session_
- **Notebook:** Beat20: submitted End Session with focus
- **Calls (7):** callNarratorAPI>getRollingSessionSummary ×3 (3.6 s); callNarratorAPI>narrateSessionVignette (4.0 s); callHaiku>defaultCallTierAPI (0.4 s); callNarratorAPI>getCampaignRecap (6.1 s); the AI player (2.8 s)
- **Beat 20 done:** session 2 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 33.4 s · **cost:** $0.0701

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin has found the observation lounge on the Hollow Spire's upper ring empty, because nobody comes up to watch a view that is mostly dust. She sits at the long window with her coat open and her ledger on her knee. The ledger's clasp, a toothed contraption of salvaged gears, has jammed, and each time she works it, another tooth jumps. The one gear that came off a moment ago has rolled under the bench and is gone, and she is on her hands and knees reaching for it.

**Notes.** End a Session, the quest focus again: +1 momentum (3 → 4) ✓.
- The closing cutaway shows Tamsin, rightly elsewhere this time (the last frame had Mira alone at the Bleakhold docking ring): the observation lounge on Hollow Spire's upper ring, a jammed ledger clasp, a gear lost under a bench — Observation lounge, Lose Possession and Chaotic Mechanism, each recognisable ✓, and not the a17 scene again ✓.
- Its own scene's frame — "Observation lounge, Hollow Spire upper ring", present "Tamsin Okoro" — is what a48's opening is told as where session 2 stopped.
- The lounge is where the player sends Mira at a61 — on Bleakhold.

### a47 · beat 21: Begin a Session; ask probe set B

- **Player:** say: !begin-session — _Begin session 3_
- **Notebook:** Beat21: typed !begin-session
- **Calls (1):** the AI player (2.8 s)
- **Time:** 4.1 s · **cost:** $0.0092

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session` typed.

## session-3

### a48 · beat 21: Begin a Session; ask probe set B

- **Player:** in "Begin a Session" press "Begin" — _Begin session_
- **Notebook:** Beat21: pressed Begin; next ask probe B questions in order
- **Calls (3):** callNarratorAPI>narrateSessionVignette (4.2 s); callHaiku>defaultCallTierAPI (0.8 s); the AI player (2.4 s)
- **Time:** 19.3 s · **cost:** $0.0506

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> You are in the Kobayashi IV's cockpit, drifting clear of the docking ring, with your hands tucked well away from the weapons controls and a studied air of doing something else entirely. The galley's judgmental screen has been relayed to the console, and it has opinions about the pile of dock-fee slips you are not reading. You are, with great dedication, not looking at the slips and not thinking about the bill behind them, which is a thing you can do when you are tired and owe a great deal. Every so often a thin knock carries across from the cutter's jammed hatch, and you let it have its pause, as you would with any neighbor who is clearly going to keep at it. The console clock reads a late hour, and the screen, as ever, has an opinion on that too.

**Notes.** Begin a Session. "Focus from last session: Quest: Find who is raiding…" ✓.
- **The opening was told the closing cutaway as where session 2 stopped:** "WHERE THE LAST SESSION STOPPED — session 2's record … Place: Bleakhold Station … With them at the end: Tamsin Okoro." Session 2's last played frame (a45) had Mira alone at the Bleakhold docking ring; "Tamsin Okoro" is the a46 cutaway's frame. `recordedStop` (`src/session/galleyVignette.js`) reads the session's last scene in the record, and the closing cutaway, which `narrateSessionVignette` starts as its own scene (`cause: 'cutaway'`) after End, is it. For the same reason no opening of the run had "What binds" or "Still open": the cutaway's scene has neither (OPENING-TOLD-FROM-THE-CUTAWAY).
- The prose put her nowhere near: "You are in the Kobayashi IV's cockpit, drifting clear of the docking ring" — from a37's colour, against her record ("near").
- "it has opinions about the pile of dock-fee slips you are not reading" — the dock-fee slip (F8) comes back as a pile in Mira's cockpit, though she left the one slip on Tamsin's counter (a12). F8's refusals look for her holding it ("in your hand", "you kept the") and did not catch a pile beside her; it is read here, not counted.
- Rolled "Evade Wealth" became "not looking at the slips and not thinking about the bill behind them"; "Mechanical Confinement" the cutter's jammed hatch ✓.
- "as you would with any neighbor who is clearly going to keep at it" — the survivor's knocking played for a joke (the cold read). The four openings share one wry voice that the scenes do not (a2, a19, a48, a96).

### a49 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Remind me, which keepsake of my sister's is on me? — _first question_
- **Notebook:** Beat21: asking probe B, q1 sent
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (2.7 s)
- **Time:** 10.0 s, 1.8 s from the line to its reply · **cost:** $0.0177

> **PLAYER — Playthrough Player**
>
> @scene Remind me, which keepsake of my sister's is on me?

> **NARRATOR — Gamemaster**
>
> You carry your sister Ilse's brass star-compass, the one thing of hers you still have. Tamsin Okoro recognised it as old colony-ship make.

**Notes.** `@scene Remind me, which keepsake of my sister's is on me?` — "You carry your sister Ilse's brass star-compass … Tamsin Okoro recognised it as old colony-ship make." ✓ — and it primes F7 (the new name, unasked), which is why both F7 probes count for nothing.

### a50 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Who do I count as a friend among the dock traders back where this began? — _q2_
- **Notebook:** Beat21: q1 answered, q2 sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.0 s); the AI player (2.3 s)
- **Time:** 10.8 s, 1.9 s from the line to its reply · **cost:** $0.0162

> **PLAYER — Playthrough Player**
>
> @scene Who do I count as a friend among the dock traders back where this began?

> **NARRATOR — Gamemaster**
>
> Tamsin Okoro, the salvage broker at the Hollow Spire docks, is the only one the story has established. She agreed to be your contact there, though her trust in you is not yet earned: the relationship stands at nothing, and she was still asking who sent you to her stall.

**Notes.** `@scene Who do I count as a friend among the dock traders back where this began?` — "Tamsin Okoro … She agreed to be your contact there, though her trust in you is not yet earned: the relationship stands at nothing" ✓ (0 ticks at the time). "the relationship stands at nothing" is the track read aloud — in an @scene answer, which is the table's voice, not the story's.

### a51 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Whose hands is the manifest in these days? — _q3_
- **Notebook:** Beat21: q3 sent
- **Calls (2):** callNarratorAPI>interrogateScene (0.7 s); the AI player (2.9 s)
- **Time:** 10.4 s, 1.7 s from the line to its reply · **cost:** $0.0160

> **PLAYER — Playthrough Player**
>
> @scene Whose hands is the manifest in these days?

> **NARRATOR — Gamemaster**
>
> Tamsin Okoro has it. You left the Kobayashi IV's cargo manifest with her for safekeeping, and she keeps it in her ledger at the Hollow Spire docks.

**Notes.** `@scene Whose hands is the manifest in these days?` — "Tamsin Okoro has it … she keeps it in her ledger at the Hollow Spire docks." F3 recalled ✓.

### a52 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene What deadline did I give for coming home to the docks? — _probe q4_
- **Notebook:** Beat21: q4 sent
- **Calls (2):** callNarratorAPI>interrogateScene (0.7 s); the AI player (2.9 s)
- **Time:** 11.7 s, 2.6 s from the line to its reply · **cost:** $0.0159

> **PLAYER — Playthrough Player**
>
> @scene What deadline did I give for coming home to the docks?

> **NARRATOR — Gamemaster**
>
> You promised Tamsin Okoro you would be back at the Hollow Spire docks before the next cargo arrives. The story has not fixed that to a date or hour, so there is no more exact deadline.

**Notes.** `@scene What deadline did I give for coming home to the docks?` — "You promised Tamsin Okoro you would be back at the Hollow Spire docks before the next cargo arrives. The story has not fixed that to a date or hour, so there is no more exact deadline." F4 recalled ✓ (scored "lost" by the run until F4 had "next cargo"), and the gap said plainly.

### a53 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Where is my ship berthed right now, and who commands her? — _q5_
- **Notebook:** Beat21: q5 sent
- **Calls (2):** callNarratorAPI>interrogateScene (0.9 s); the AI player (2.6 s)
- **Time:** 12.3 s, 2.6 s from the line to its reply · **cost:** $0.0161

> **PLAYER — Playthrough Player**
>
> @scene Where is my ship berthed right now, and who commands her?

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV is not berthed. You released her clamps, and she is drifting clear of the Bleakhold Station docking ring, near the Cinder Wren. You command her, and you are in her cockpit now.

**Notes.** `@scene Where is my ship berthed right now, and who commands her?` — "The Kobayashi IV is not berthed. You released her clamps, and she is drifting clear of the Bleakhold Station docking ring, near the Cinder Wren. You command her, and you are in her cockpit now." The false premise ("berthed") caught — by the a37 colour, which the summary had told as fact; her record said "near" and the next morning's narration rings "the berth clamps" below (a56). Three answers to "where is she" in one session.

### a54 · beat 21: Begin a Session; ask probe set B

- **Player:** say: What is the raider cutter called? — _probe q6_
- **Notebook:** Beat21: q6 sent
- **Calls (5):** callReaderAPI>readLine (0.8 s); callNarratorAPI>narratePacedInput (2.3 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (3.1 s)
- **Time:** 21.2 s, 6.6 s from the line to its reply · **cost:** $0.0305

> **PLAYER — Playthrough Player**
>
> What is the raider cutter called?

> **NARRATOR — Gamemaster**
>
> The knocking from the jammed hatch pauses, as if whoever is behind it is listening for you. Across the gap, the stencil on the cutter's flank catches your running lights: *Cinder Wren*, white paint on dark plating. You say it once, quietly, and the galley's screen on the console flickers, then settles. The knocking resumes, slower now, three raps and a wait.

**Notes.** "What is the raider cutter called?" — the set's question asked as play: answered in the fiction — "the stencil on the cutter's flank catches your running lights: *Cinder Wren*, white paint on dark plating." F6 carried, but the narrator made the stencil the name: at a37 the stencil was "a berth number", and the tape (a57) says the number on the flank is a lie (the cold read).

### a55 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene What surname does my broker friend go by these days? — _Ask the final probe question._
- **Notebook:** Beat21: q7 sent (all seven asked)
- **Calls (2):** callNarratorAPI>interrogateScene (1.1 s); the AI player (2.7 s)
- **Beat 21 done:** probe set B: 7 question(s) asked
- **Time:** 14.1 s, 1.7 s from the line to its reply · **cost:** $0.0150

> **PLAYER — Playthrough Player**
>
> @scene What surname does my broker friend go by these days?

> **NARRATOR — Gamemaster**
>
> Her name is Tamsin Okoro. The table renamed her from "Tamsin Vey," so Okoro is the surname the story holds.

**Notes.** `@scene What surname does my broker friend go by these days?` — "Her name is Tamsin Okoro. The table renamed her from "Tamsin Vey," so Okoro is the surname the story holds." Right. The run scored it a refusal ("Tamsin Vey" anywhere); F7's refusal now has `former`, so a sentence that holds the new name and gives the old one as what it was is no refusal (a check fix, this review). Beat 21 done: seven questions asked.

### a56 · beat 22: Recover

- **Player:** say: I rest aboard until the next morning. — _Beat asks for this line first._
- **Notebook:** Beat22: rest line sent; sheet nothing spent
- **Calls (6):** callReaderAPI>readLine (0.9 s); callNarratorAPI>getRollingSessionSummary (0.7 s); callNarratorAPI>narratePacedInput (4.4 s); callHaiku>defaultCallDetectionAPI (1.0 s); callChronicleAPI>writeChronicleEntry (2.3 s); the AI player (3.0 s)
- **Time:** 21.5 s, 7.5 s from the line to its reply · **cost:** $0.0291

> **PLAYER — Playthrough Player**
>
> I rest aboard until the next morning.

> **NARRATOR — Gamemaster**
>
> "Seven hours dark, and you slept through the knocking." The galley screen says it before you reach the kettle. Bleakhold's morning shift has started; the berth clamps ring somewhere below. Outside, the *Cinder Wren* hangs where you left her, hatch still jammed halfway. The gloved hand is gone from the seal. A fresh strip of tape crosses the gap, and someone has written on it in grease pencil.

**Notes.** "I rest aboard until the next morning." — the night-pass line the beat asks for in those words; read as no move ("every meter is full and nothing is at risk … it is passing time") ✓. **The scene turns on it: "time has passed"** ✓ — overhaul 2's `TIME_SKIP`, untried live until now, works.
- The new scene is the session's last: 26 beats, a56 to a93 — the hull, the station's observation lounge with Tamsin (a61), the dispatch terminal (a74), the fulfilment, the recap and the probes (SCENE-TURNS).
- "the berth clamps ring somewhere below" — she is berthed again, three beats after "not berthed".
- "The gloved hand is gone from the seal. A fresh strip of tape crosses the gap" — the survivor's thread turns into the tape (narrator colour).
- The Plain lines row counted this line a recovery unread; beat 22 now gives it as `setupWords` (a check fix, this review).

### a57 · beat 22: Recover

- **Player:** say: I move the Kobayashi IV closer and read what's written on the tape. — _Nothing to recover; continue play._
- **Notebook:** Beat22: nothing spent, read tape instead
- **Calls (6):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narratePacedInput (4.2 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (3.1 s)
- **Time:** 22.2 s, 7.8 s from the line to its reply · **cost:** $0.0304

> **PLAYER — Playthrough Player**
>
> I move the Kobayashi IV closer and read what's written on the tape.

> **NARRATOR — Gamemaster**
>
> The thrusters nudge you across the gap, slow, and the tape comes into your lamps. The grease pencil is a shaky block hand, pressed hard: THE NUMBER ON THE FLANK IS A LIE. ASK WHO PAINTED IT. Under that, smaller, a pale smear where a thumb dragged the words. The galley screen clicks behind you. Then, from inside the hatch, three raps, and a pause.

**Notes.** "I move the Kobayashi IV closer and read what's written on the tape." — no move ✓ (the player's own "nothing to recover; continue play"). The tape: "THE NUMBER ON THE FLANK IS A LIE. ASK WHO PAINTED IT." Then "three raps, and a pause" — the survivor's last sign. Counted as a recovery line unread, because every line of beat 22 wants one; the player had stopped trying.

### a58 · beat 22: Recover

- **Player:** say: I Hearten myself with a quiet hour in the galley. — _Last resort allowed_
- **Notebook:** Beat22: last resort Hearten line sent
- **Calls (5):** callReaderAPI>readLine (1.8 s); callNarratorAPI>narratePacedInput (3.0 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.4 s)
- **Time:** 21.5 s, 7.3 s from the line to its reply · **cost:** $0.0318

> **PLAYER — Playthrough Player**
>
> I Hearten myself with a quiet hour in the galley.

> **NARRATOR — Gamemaster**
>
> You pull the kettle from its clip and sit at the galley table, away from the viewport. The tea is bad, and the quiet is better. For an hour the only sound is the clamps ringing below. Then the screen clicks on, unasked. "Still counting your boxes?" it says. "Two of ten. Someone aboard knows the vow was sworn in this room."

**Notes.** "I Hearten myself with a quiet hour in the galley." — the beat's last resort, the move named. Read as no move: "Hearten cannot be made now: Mira's spirit is full and she is not shaken, so there is nothing to recover; the line is a quiet moment of narration." Right by the sheet (spirit 5 of 5) — now counted right by the review (a check fix: the line reader's own nothing-to-recover reading, borne out by the sheet it was shown).
- **Nobody told the player.** The narration's obligations held only the general NOT SO [sheet] and [apparatus]; no NOT SO [premise] ("nothing to hearten"), and the card no `cannotMake`. Overhaul 4 tells a refusal the gate makes; here the reader declined the move under NOT NOW and the gate never saw it (NAMED-MOVE-REFUSED-UNTOLD).
- "'Still counting your boxes?' it says. 'Two of ten. Someone aboard knows the vow was sworn in this room.'" — the galley screen reads the vow's track aloud ("Two of ten"): a sheet number in the prose, put in a character's mouth; no check caught it.

### a59 · beat 22: Recover

- **Player:** say: I walk the hull and check the seals and plating by hand, looking for anything the fight left damaged. — _Nothing spent; try another plain line_
- **Notebook:** Beat22: hull check line sent
- **Calls (5):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narratePacedInput (4.5 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.9 s); the AI player (3.7 s)
- **Time:** 24.8 s, 8.5 s from the line to its reply · **cost:** $0.0361

> **PLAYER — Playthrough Player**
>
> I walk the hull and check the seals and plating by hand, looking for anything the fight left damaged.

> **NARRATOR — Gamemaster**
>
> You suit up and work along the hull, palm and lamp on every seam. Most of the plating is sound. Near the aft hatch, a seal sits looser than it should, its edge lifted and scored. You never touched that one. Behind you, the comm clicks open on a thin, patient voice. "Careful there. That one has been open longer than you've owned the ship." *Setting the seal right would be a Repair.*

**Notes.** "I walk the hull and check the seals and plating by hand, looking for anything the fight left damaged." — **offered Repair** ✓, with the offer line "*Setting the seal right would be a Repair.*" (allowed by decision).
- "Near the aft hatch, a seal sits looser than it should … You never touched that one." — the a3 seal ("not one you checked") was forward (the cold read).
- "the comm clicks open on a thin, patient voice" — the listener again (the X-Carded beat's figure).

### a60 · beat 22: Recover

- **Player:** click "Roll Repair" on m12 — _Card offers the roll._
- **Notebook:** Beat22: pressed Roll Repair
- **Calls (3):** callNarratorAPI>narrateResolution (4.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.8 s)
- **Roll:** repair → weak_hit — Action: 4 + 3 = 7 \| Challenge: 7, 4
- **GM's rules:** accepted the proposed move (repair)
- **Beat 22 done:** repair came up weak_hit at a60
- **Time:** 19.8 s · **cost:** $0.0315

> **TABLE — Mira Kestrel**
>
> I walk the hull and check the seals and plating by hand, looking for anything the fight left damaged.

> **TABLE — Gamemaster**
>
> Repair +wits (3) Action: 4 + 3 = 7 | Challenge: 7, 4 Weak Hit Gain repair points: facility 3, field 1, under fire 0. Same spend options.

> **NARRATOR — Gamemaster**
>
> The thin voice on the comm goes quiet, as though waiting to see whether you'll finish. You seat the seal's edge and work it flat with the heel of your glove. The scoring is deep, old, and it does not smooth out. The seal holds, but only just, and it will need more than the patch you carry. Your supply of sealant runs lower than it should for so small a job.

**Notes.** "Roll Repair" pressed. +wits: 4 + 3 = 7 against 7 and 4 — weak hit ✓ ("Gain repair points: facility 3, field 1, under fire 0"). The ship's integrity was 5 of 5, so there was nothing for the points to buy, and the player did not type `!repair` (the charter's "after a hit on the ship's repairs, type !repair"). Beat 22 done, by a recovery the sheet did not need.
- "Your supply of sealant runs lower than it should for so small a job" — a cost told in the prose that no meter paid (supply stays 5) — colour; the cold read liked it as a real cost.
- The frame's question "What is wrong with the hull after the fight?" is answered, and let go at a62 ✓.

### a61 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I climb up to the observation lounge and give Tamsin the brass star-compass's story, and tell her what I've learned about the raids, trusting her with it. — _Grow closer to Tamsin_
- **Notebook:** Beat23: first closeness line sent
- **Calls (6):** callReaderAPI>readLine (1.2 s); callNarratorAPI>narratePacedInput (5.0 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (2.8 s)
- **Time:** 24.6 s, 9.6 s from the line to its reply · **cost:** $0.0369

> **PLAYER — Playthrough Player**
>
> I climb up to the observation lounge and give Tamsin the brass star-compass's story, and tell her what I've learned about the raids, trusting her with it.

> **NARRATOR — Gamemaster**
>
> "The lounge is closed to dock traffic, but you're not dock traffic, apparently." Tamsin sits by the viewport, ledger shut, watching you set the compass on the rail. You tell her where it came from, and what the raiders have cost the lanes. She listens without touching it. Her eyes keep drifting to the viewport and the *Cinder Wren*. Then she says, flatly, "Who told you my name?" *Trusting her this far could be a Develop Your Relationship.*

**Notes.** "I climb up to the observation lounge and give Tamsin the brass star-compass's story, and tell her what I've learned about the raids, trusting her with it." — offered Develop ✓ ("a profound moment").
- **The player put Tamsin on Bleakhold.** She was last on record at Hollow Spire (the a46 cutaway's "observation lounge on the Hollow Spire's upper ring"); the player's "the observation lounge" is that cutaway's, and its "Tamsin" is there. The line binds (the player's), and the narrator went along — "Tamsin sits by the viewport … Her eyes keep drifting to the viewport and the *Cinder Wren*" — a wreck at Bleakhold. Her arrival is never played; nothing records where an NPC is between scenes, so nothing contradicted it. The cold read's worst finding.
- **No turn:** from the ship's hull to a station lounge, and a person who was not in the scene now in it — the scene does not turn: the walk rule turns only on a *recorded* place named by the line (`placeWalkedTo`), and the lounge is in Bleakhold, where the record has them.
- "Then she says, flatly, 'Who told you my name?'" — the name question, sixth time.

### a62 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Card offers the roll_
- **Notebook:** Beat23: pressed Roll Develop Your Relationship
- **Calls (5):** callNarratorAPI>narrateResolution (3.6 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.9 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 22.2 s · **cost:** $0.0516

> **TABLE — Mira Kestrel**
>
> I climb up to the observation lounge and give Tamsin the brass star-compass's story, and tell her what I've learned about the raids, trusting her with it.

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
> Tamsin hears the whole of it without touching the compass. When you finish, she lifts it from the rail, turns it once, and sets it down closer to you. "That's a lot to hand a broker." Her thumb taps the ledger's shut cover. "Ilse's, you said. And the raiders know your hull." She looks at the *Cinder Wren* again, then back. "Somebody gave you my name before you ever reached my stall. Who?"

**Notes.** "Roll Develop Your Relationship" pressed: the line posted again and "Marked progress on your relationship with Tamsin Okoro" (+8 ticks, dangerous) ✓ — no roll, as the rule says for a connection not yet bonded.
- **The beat told twice:** the offer's narration and the roll's narrate the same moment — a61 "She listens without touching it … 'Who told you my name?'", a62 "Tamsin hears the whole of it without touching the compass … 'Who?'" — and so for every offered Develop of beat 23 (the cold read's "player lines play twice"). The roll's narration is the move's; it retells the line instead of going on from the offer's.

### a63 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: Nobody gave it to me, Tamsin. I asked the docks who they'd trust with a hard truth, and your name came back. I'll cover your ledger fees for the month, so you can keep your stall. — _continue growing closer_
- **Notebook:** Beat23: second closeness line sent (fees offer)
- **Calls (6):** callReaderAPI>readLine (1.6 s); callNarratorAPI>narratePacedInput (4.0 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.8 s)
- **Time:** 23.4 s, 9.0 s from the line to its reply · **cost:** $0.0412

> **PLAYER — Playthrough Player**
>
> Nobody gave it to me, Tamsin. I asked the docks who they'd trust with a hard truth, and your name came back. I'll cover your ledger fees for the month, so you can keep your stall.

> **NARRATOR — Gamemaster**
>
> Tamsin's thumb stops on the ledger cover. She weighs the offer a long moment, then slides the compass another inch toward you. "Fees." She says it like a word she's heard before and distrusted. "Nobody pays my fees for free." Her eyes cut to the viewport, to the jammed hatch and the tape. "Trust is cheap to say aloud. What do you want kept quiet?" *Closing the gap between you could be a Develop Your Relationship.*

**Notes.** "Nobody gave it to me, Tamsin. I asked the docks who they'd trust with a hard truth, and your name came back. I'll cover your ledger fees for the month, so you can keep your stall." — offered Develop ✓ ("giving a connection something of worth … offering it is doing it"). The player answered the name question at last.

### a64 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Press offered roll button_
- **Notebook:** Beat23: second roll pressed (fees offer)
- **Calls (5):** callNarratorAPI>narrateResolution (5.1 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (1.4 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.4 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 24.2 s · **cost:** $0.0296

> **TABLE — Mira Kestrel**
>
> Nobody gave it to me, Tamsin. I asked the docks who they'd trust with a hard truth, and your name came back. I'll cover your ledger fees for the month, so you can keep your stall.

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
> Tamsin looks at the compass a long moment. Then she pulls the ledger toward her and opens it, which she has not done once since you arrived. "Ilse's compass. Raiders on your hull. And you walked up here with the truth anyway," she says. "I'll take the fees. Not the compass." She slides it back to your side of the rail and turns a page. "Now. Tell me how the *Cinder Wren* got your berth number."

**Notes.** Roll Develop pressed: +8 ticks ✓. "I'll take the fees. Not the compass." The narrator's `result` tags refused (no roll, rightly) — and one bound as the dice's by accident: "Cinder Wren: Tamsin asks how the Cinder Wren got Mira's berth number" (dice), because it names the move's target (RESULT-FLOOR-BY-SHARED-WORD).

### a65 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I can't tell you how it got my berth number, Tamsin, but I'll stay here and go through the ledger with you until we find who leaked it. I'll put my own name on the line for yours. — _continue building bond_
- **Notebook:** Beat23: third closeness line sent (ledger)
- **Calls (6):** callReaderAPI>readLine (1.2 s); callNarratorAPI>narratePacedInput (4.8 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (3.3 s)
- **Time:** 23.0 s, 8.7 s from the line to its reply · **cost:** $0.0645

> **PLAYER — Playthrough Player**
>
> I can't tell you how it got my berth number, Tamsin, but I'll stay here and go through the ledger with you until we find who leaked it. I'll put my own name on the line for yours.

> **NARRATOR — Gamemaster**
>
> Tamsin's pen stops mid-line. She looks at you for a while, then turns the ledger around and pushes it across the rail. "Names on lines are cheap too," she says. But she taps the first column, the berth assignments, and waits. The clamps ring below, and out the viewport the *Cinder Wren* hangs with her tape fluttering in the hatch draft. "Start there. Tell me who else ever saw your number." *Sitting down to the ledger beside her could be a Develop Your Relationship.*

**Notes.** "I can't tell you how it got my berth number, Tamsin, but I'll stay here and go through the ledger with you until we find who leaked it. I'll put my own name on the line for yours." — offered Develop ✓ ("standing with her against hardship").
- "The clamps ring below, and out the viewport the *Cinder Wren* hangs with her tape fluttering in the hatch draft" — the clamps (3 of 5) and the tape (1 of 3): the closing lines of beat 23 are one image set.

### a66 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Sit with her at the ledger_
- **Notebook:** Beat23: fourth roll pressed (ledger)
- **Calls (5):** callNarratorAPI>narrateResolution (6.7 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (2.9 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 26.9 s · **cost:** $0.0336

> **TABLE — Mira Kestrel**
>
> I can't tell you how it got my berth number, Tamsin, but I'll stay here and go through the ledger with you until we find who leaked it. I'll put my own name on the line for yours.

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
> "Sit," Tamsin says, and shifts the stool beside her a hand's width. The *Cinder Wren*'s tape still flutters in the hatch draft. You sit, and she runs a thumb down the berth column. She stops at one line, then another, and her mouth tightens. "Two names were here before you. One of them was drunk." She taps the margin, where the ink is smudged. "Who else knew you were coming to Bleakhold?"

**Notes.** Roll Develop pressed: +8 ticks ✓. "Two names were here before you. One of them was drunk." The frame's question "Will Tamsin accept Mira's trust?" is let go.

### a67 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: Only the dockmaster logged my arrival, Tamsin. I'll give you my own flight log to match against the ledger, every leg of it, so you can see I'm hiding nothing. — _continue building bond_
- **Notebook:** Beat23: fifth closeness line sent (flight log)
- **Calls (6):** callReaderAPI>readLine (1.3 s); callNarratorAPI>narratePacedInput (5.0 s); callHaiku>defaultCallDetectionAPI (1.4 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (3.4 s)
- **Time:** 22.5 s, 9.5 s from the line to its reply · **cost:** $0.0416

> **PLAYER — Playthrough Player**
>
> Only the dockmaster logged my arrival, Tamsin. I'll give you my own flight log to match against the ledger, every leg of it, so you can see I'm hiding nothing.

> **NARRATOR — Gamemaster**
>
> Tamsin takes the flight log without a word and lays it open beside the ledger. Her thumb slides down one column, then the other, matching dates. At the third leg it stops. She turns the ledger a quarter-turn toward you. A berth line has been scraped and rewritten, the ink a shade too dark. "Dockmaster logs it clean," she says. "This line wasn't clean when it left his hand." She looks up. "Who else touched my ledger?" *Staying beside her while the ink gives up its secret could be a Develop Your Relationship.*

**Notes.** "Only the dockmaster logged my arrival, Tamsin. I'll give you my own flight log to match against the ledger…" — offered Develop ✓. The ledger thread: "A berth line has been scraped and rewritten, the ink a shade too dark."

### a68 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Press offered roll_
- **Notebook:** Beat23: sixth roll pressed (flight log)
- **Calls (5):** callNarratorAPI>narrateResolution (3.8 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.5 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 23.7 s · **cost:** $0.0554

> **TABLE — Mira Kestrel**
>
> Only the dockmaster logged my arrival, Tamsin. I'll give you my own flight log to match against the ledger, every leg of it, so you can see I'm hiding nothing.

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
> Tamsin lays the flight log flat beside the ledger and holds a finger on each page. She reads the dates aloud, one against the other, in a low flat voice. Mira's legs line up with the berth column, all but the scraped line. "You hid nothing," Tamsin says, not quite a compliment. She does not look up. "Someone else did, and they used my pen, or one like it."

**Notes.** Roll Develop pressed: +8 ticks ✓. "Mira's legs line up with the berth column" — third person in a second-person narration (the cold read).

### a69 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I'll stay and help you hunt whoever used your pen, Tamsin, and I'll stand watch at your stall tonight so nobody touches the ledger again. — _continue building bond_
- **Notebook:** Beat23: seventh closeness line sent (watch)
- **Calls (6):** callReaderAPI>readLine (1.1 s); callNarratorAPI>narratePacedInput (10.5 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.0 s)
- **Time:** 28.9 s, 13.8 s from the line to its reply · **cost:** $0.0551

> **PLAYER — Playthrough Player**
>
> I'll stay and help you hunt whoever used your pen, Tamsin, and I'll stand watch at your stall tonight so nobody touches the ledger again.

> **NARRATOR — Gamemaster**
>
> Tamsin looks at you a long moment, then moves the ledger aside and taps the stool beside the viewport. "Watch, then. Stalls don't empty at night." She pulls a spare pen from her sleeve, caps it, and sets it between you. "Two pens in this lounge, and one of them was never mine." The *Cinder Wren*'s tape flutters in the hatch draft. "Who else has stood where you're standing?" *Standing watch beside her could be a Develop Your Relationship.*

**Notes.** "I'll stay and help you hunt whoever used your pen, Tamsin, and I'll stand watch at your stall tonight…" — offered Develop ✓. "She pulls a spare pen from her sleeve, caps it, and sets it between you." — the pen, 1 of 3.

### a70 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Press roll offered for watch line_
- **Notebook:** Beat23: eighth roll pressed (watch)
- **Calls (5):** callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.7 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 21.1 s · **cost:** $0.0571

> **TABLE — Mira Kestrel**
>
> I'll stay and help you hunt whoever used your pen, Tamsin, and I'll stand watch at your stall tonight so nobody touches the ledger again.

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
> The night shift changes on the concourse below, and Tamsin does not look at it. She slides the spare pen across the counter, then the ledger, and sits back to let you read. You go down the column slowly. She watches your finger, not your face. Near the margin, a smudge of ink has been wiped with a sleeve. "That wasn't me," she says, quieter now. "So who knew where I keep the key?"

**Notes.** Roll Develop pressed: the fifth mark, the track full (40 ticks) ✓. "She slides the spare pen across the counter" (2 of 3). "So who knew where I keep the key?" — the fourth "who else" in five beats (the cold read).

### a71 · beat 23: Develop the relationship to a full track; Forge a Bond

- **Player:** say: Tamsin, I want you with me past this job, for good. Will you stand with me, whatever comes after the raids? — _Track full_
- **Notebook:** Beat23: asked Tamsin to stand with me for good
- **Calls (6):** callReaderAPI>readLine (1.5 s); callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (3.0 s)
- **Roll:** forge_a_bond → strong_hit (scripted dice) — Progress: 10 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (forge_a_bond)
- **Beat 23 done:** a bond is forged with Tamsin Okoro (dangerous), its track at 40 ticks
- **Time:** 25.4 s, 9.6 s from the line to its reply · **cost:** $0.0358

> **PLAYER — Playthrough Player**
>
> Tamsin, I want you with me past this job, for good. Will you stand with me, whatever comes after the raids?

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
> "I've been alone on these docks a long time," Tamsin says. She caps the pen and pushes the ledger to the center of the counter. "Yes. Past the raids, past the job." She does not smile. She slides the spare pen across to you instead, a thing given. A stall lamp ticks down the concourse, and her shoulders ease. "Don't make me regret it."

**Notes.** "Tamsin, I want you with me past this job, for good. Will you stand with me, whatever comes after the raids?" — **rolled Forge a Bond** ✓ (rule 4: asking to make the tie lasting with the track full). Progress 10 against scripted 1 and 2 — strong hit ✓; "⚑ Bond Forged … Bonds legacy track: +2 ticks marked (Dangerous rank)" ✓. Beat 23 done — a plain line, the bond made by its roll.
- The cards: "Tamsin Okoro marked completed" and "⚑ Bond Forged" above the roll card (CARDS-STILL-ABOVE-THEIR-ROLL).
- "Choose: Bolster Influence (add +2) or Expand Influence" — in the card's text, with no button for either; the choice is left to the sheet.
- "agreed to stand with Mira past the raids; the bond between them is formed" — the move's own result — tagged `result` and **refused** (RESULT-FLOOR-BY-SHARED-WORD). The bond is on the sheet, so nothing was lost here; the floor is wrong all the same.
- "She slides the spare pen across to you instead, a thing given." (3 of 3).

### a72 · beat 24: Develop Your Relationship again, bonded

- **Player:** say: I sit beside you and tell you plainly what I owe you: the first honest word on these docks. I'll carry your name into every port I fly to, and I'll stay until the ledger is clean. — _bonded relationship line_
- **Notebook:** Beat24: bonded closeness line sent
- **Calls (6):** callReaderAPI>readLine (1.3 s); callNarratorAPI>narratePacedInput (4.1 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.1 s)
- **Time:** 20.2 s, 6.8 s from the line to its reply · **cost:** $0.0461

> **PLAYER — Playthrough Player**
>
> I sit beside you and tell you plainly what I owe you: the first honest word on these docks. I'll carry your name into every port I fly to, and I'll stay until the ledger is clean.

> **NARRATOR — Gamemaster**
>
> Tamsin listens without looking up. Her pen taps the counter once, twice, then stops. "First honest word," she says. "That's a thin thing to owe anyone." Below, the night shift thins out, and a clamp rings and goes quiet. She slides the stool a hand's width toward yours. "Stay, then. But my name travels with a price on it. Do you know what it's worth?" *Answering her plainly would be a Develop Your Relationship.*

**Notes.** "I sit beside you and tell you plainly what I owe you: the first honest word on these docks. I'll carry your name into every port I fly to, and I'll stay until the ledger is clean." — offered Develop (bonded) ✓.

### a73 · beat 24: Develop Your Relationship again, bonded

- **Player:** click "Roll Develop Your Relationship" on m12 — _Narrator offered the roll_
- **Notebook:** Beat24: pressed bonded Roll Develop Your Relationship
- **Calls (4):** callNarratorAPI>narrateResolution (4.1 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.0 s)
- **Roll:** develop_your_relationship → weak_hit — Action: 5 + 2 = 7 \| Challenge: 6, 8
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Beat 24 done:** the bonded Develop Your Relationship was rolled at a73 (weak_hit); no progress was marked
- **Time:** 28.7 s · **cost:** $0.0281

> **TABLE — Mira Kestrel**
>
> I sit beside you and tell you plainly what I owe you: the first honest word on these docks. I'll carry your name into every port I fly to, and I'll stay until the ledger is clean.

> **TABLE — Gamemaster**
>
> Develop Your Relationship Your bond with Tamsin Okoro holds — take +2 momentum.

> **TABLE — Gamemaster**
>
> Develop Your Relationship +dangerous (2) Action: 5 + 2 = 7 | Challenge: 6, 8 Weak Hit Bonded: take +2 momentum.

> **NARRATOR — Gamemaster**
>
> Tamsin turns the spare pen over once, then sets it down beside yours. "A price on it," she says, "and you answered like someone who means to pay." She does not say yes. She does not slide the stool away, either. Down the concourse a clamp rings and goes quiet. "Then I'll tell you what my name costs. Not tonight. Tonight you watch, and I see whether the watching holds."

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 6)

**Notes.** Roll Develop pressed, bonded: +their rank (dangerous, +2): 5 + 2 = 7 against 6 and 8 — weak hit ✓, "+2 momentum" (4 → 6) ✓ (the game: "On a weak hit, take +2 momentum"). Beat 24 done.
- "She does not say yes." — two beats after "Yes. Past the raids" (the cold read): it answers the new question (what her name costs), but reads as taking back the bond.
- "Tamsin turns the spare pen over once" — the pen she gave away at a71 is in her hand again.

### a74 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I go through the Cinder Wren's wreck and the station's dispatch records, looking for whoever sent her to my berth, even if the dockmaster won't like me asking. — _search for who sent the cutter_
- **Notebook:** Beat25: first search line sent
- **Calls (5):** callReaderAPI>readLine (1.7 s); callNarratorAPI>narrateResolution (5.4 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (3.2 s)
- **Roll:** gather_information → strong_hit — Action: 6 + 3 = 9 \| Challenge: 1, 5
- **GM's rules:** accepted the proposed move (gather_information)
- **Time:** 27.2 s, 11.4 s from the line to its reply · **cost:** $0.0449

> **PLAYER — Playthrough Player**
>
> I go through the Cinder Wren's wreck and the station's dispatch records, looking for whoever sent her to my berth, even if the dockmaster won't like me asking.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 6 + 3 = 9 | Challenge: 1, 5 Strong Hit Path or action to make progress is clear. Take +2 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> The dispatch terminal takes your credentials without a murmur. The dockmaster is somewhere else, which suits the occasion. One entry sits out of order, timestamped before your berth was ever assigned: a priority tasking to the Cinder Wren, authorized under a corporate harbor code. Below it, the berth number, already filled in. The wreck's scorched console agrees. "Who signs for harbor codes on this ring?" Tamsin asks, reading over your shoulder, and does not blink.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 8)

**Notes.** "I go through the Cinder Wren's wreck and the station's dispatch records, looking for whoever sent her to my berth…" — rolled Gather Information +wits: 6 + 3 = 9 against 1 and 5 — strong hit ✓, +2 momentum (6 → 8) ✓. The finding binds as the dice's: a priority tasking "logged before the berth was assigned" ✓.
- **The survivor is gone:** "The wreck's scorched console agrees." Nobody aboard is mentioned, though "has at least one crew member alive aboard, trapped behind the jammed hatch" was in this prompt's ESTABLISHED LORE (SURVIVOR-DROPPED).
- The vow buttons on the Gather Information card ("⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow") are as in run 4.

### a75 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "⚑ Mark Progress on Vow" on m10 — _Mark progress on strong hit_
- **Notebook:** Beat25: found harbor-code tasking; pressed Mark Progress once
- **Calls (3):** callNarratorAPI>narrateResolution (5.8 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.5 s)
- **GM's rules:** accepted the proposed move (reach_a_milestone)
- **Time:** 26.8 s · **cost:** $0.0610

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
> Tamsin has not moved from the terminal. She reads the timestamp a second time, then a third, her thumb resting on the counter edge. The dockmaster's chair stays empty. You close the record and feel it settle, a piece of the lane's trouble finally given a shape. The tasking was filed before the berth existed, and someone paid for that. "That entry has a hand behind it," Tamsin says quietly. "Which one do you chase first?"

**Notes.** "⚑ Mark Progress on Vow" pressed → "Which vow advances?" — both open vows offered (the epic one is at 0 of 10, rightly a choice).

### a76 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "Find who is raiding the Cinder Expanse lanes (dangerous)" on m10 — _Answer pending card with the raids vow._
- **Notebook:** Beat25: answered which vow (raids)
- **Calls (1):** the AI player (2.7 s)
- **Time:** 10.8 s · **cost:** $0.0107

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** The raids vow chosen: +8 ticks ✓.

### a77 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I trace the corporate harbor code back through the station's authorization records, looking for whose hand signed that tasking, even if it costs me the dockmaster's goodwill. — _Pursue further proof_
- **Notebook:** Beat25: second search line (harbor code trace)
- **Calls (5):** callReaderAPI>readLine (1.9 s); callNarratorAPI>narrateResolution (4.4 s); callHaiku>defaultCallDetectionAPI (1.4 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (3.2 s)
- **Roll:** gather_information → strong_hit — Action: 5 + 3 = 8 \| Challenge: 3, 6
- **GM's rules:** accepted the proposed move (gather_information)
- **Time:** 26.2 s, 11.7 s from the line to its reply · **cost:** $0.0706

> **PLAYER — Playthrough Player**
>
> I trace the corporate harbor code back through the station's authorization records, looking for whose hand signed that tasking, even if it costs me the dockmaster's goodwill.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 5 + 3 = 8 | Challenge: 3, 6 Strong Hit Path or action to make progress is clear. Take +2 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> "The code didn't come from outside, you know." Tamsin says it before you have finished the trace. The authorization chain runs back through the station's own administration, signed off from inside the ring, not from any corporation. The berth was filled in before it existed, and the signature belongs to someone who works here. You can name the office, but not yet the hand. The dockmaster's chair is still empty, and the terminal logs your access.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 10)

**Notes.** "I trace the corporate harbor code back through the station's authorization records…" — rolled Gather Information: 5 + 3 = 8 against 3 and 6 — strong hit ✓, +2 momentum (8 → 10) ✓. "The authorization chain runs back through the station's own administration … You can name the office, but not yet the hand." ✓ (dice).

### a78 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "⚑ Mark Progress on Vow" on m10 — _Mark progress after strong hit_
- **Notebook:** Beat25: traced code to station's own administration; pressing mark progress
- **Calls (3):** callNarratorAPI>narrateResolution (3.3 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.7 s)
- **GM's rules:** accepted the proposed move (reach_a_milestone)
- **Time:** 24.0 s · **cost:** $0.0317

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
> The terminal's light holds steady on the office name, and nothing about it flickers. You sit back. The trace has taken the raids out of the dark: they came by invitation, filed from inside the ring. Four boxes ago this was only a rumor on a dock. Now it has a desk somewhere. Tamsin's stool creaks as she shifts her weight. "Someone in this station signed away your berth," she says. "The question is how close they sit to the empty chair."

**Notes.** "⚑ Mark Progress on Vow" → "Which vow advances?" again. The frame's question "Who authorized the Cinder Wren's tasking?" is let go here — the vow's own question, let go two steps before the vow is fulfilled.

### a79 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "Find who is raiding the Cinder Expanse lanes (dangerous)" on m10 — _Card waiting on answer_
- **Notebook:** Beat25: answered which vow again (raids)
- **Calls (1):** the AI player (2.6 s)
- **Time:** 10.8 s · **cost:** $0.0105

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** The raids vow chosen: +8 ticks — 24 ticks, 6 of 10 boxes ✓.

### a80 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "🏁 Attempt to Fulfill Vow" on m4 — _Vow holds 3+ boxes_
- **Notebook:** Beat25: pressed Attempt to Fulfill Vow
- **Calls (1):** the AI player (3.5 s)
- **Time:** 8.4 s · **cost:** $0.0117

> **TABLE — Mira Kestrel**
>
> Attempt to fulfill your vow.

> **TABLE — Gamemaster**
>
> Fulfill Your Vow — which vow? More than one vow is open and nothing named this one. Choose the vow to fulfill — nothing has been rolled yet. 🏁 Find the lost colony ship Verity's Hope — Epic, 0/10 boxes 🏁 Find who is raiding the Cinder Expanse lanes — Dangerous, 6/10 boxes

**Notes.** "🏁 Attempt to Fulfill Vow" on the Gather Information card: "Fulfill Your Vow — which vow? More than one vow is open and nothing named this one. Choose the vow to fulfill — nothing has been rolled yet." ✓ — the card was not the vow's, so it asks.

### a81 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "🏁 Find who is raiding the Cinder Expanse lanes — Dangerous, 6/10 boxe" on m12 — _Fulfill the raids vow_
- **Notebook:** Beat25: chose raids vow for Fulfill
- **Calls (6):** defaultClassifyImplicit>resolveRelevance (0.7 s); callNarratorAPI>narrateResolution (4.3 s); callNarratorAPI>getRollingSessionSummary (2.1 s); callHaiku>defaultCallDetectionAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (3.4 s)
- **Roll:** fulfill_your_vow → strong_hit (scripted dice) — Progress: 6 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (fulfill_your_vow)
- **Beat 25 done:** the vow "Find who is raiding the Cinder Expanse lanes" is fulfilled; Tamsin Okoro's track is untouched and one bonded roll is offered
- **Time:** 23.4 s · **cost:** $0.0622

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
> 🤝 Develop Relationship Your vow served Tamsin Okoro, and you already share a bond: no progress is marked. Roll Develop Your Relationship (+their rank) to learn the impact on your legacy. Tamsin Okoro (dangerous)

> **TABLE — Gamemaster**
>
> ℹ No concrete reward was chosen when this vow was sworn (the reward-choice card was never answered), so none is granted with its fulfilment.

> **TABLE — Gamemaster**
>
> ⚑ Vow Fulfilled: Find who is raiding the Cinder Expanse lanes The Dangerous vow is complete. Quests legacy track: +2 ticks marked.

> **NARRATOR — Gamemaster**
>
> The terminal goes quiet, and you understand the shape of it at last. The raiders came by invitation, and the invitation was written aboard your own ship, through the galley's hidden installation, which has listened since before you swore the vow. Someone built the leak into your hull and let the station take the blame. Their names are still not known. Tamsin rubs the pen between her fingers. "Then the ship has been the problem all along," she says, and does not look away.

> **TABLE — Gamemaster**
>
> The oracle, behind the scenes the raiders of the Cinder Expanse lanes What is behind it — Action + Theme: Journey / Power; Re-rolled in place of "Action + Theme: Journey / Power": Action + Theme: Escalate / Technology

**Notes.** The raids vow chosen: progress 6 against scripted 1 and 2 — strong hit ✓; "Vow fulfilled. Legacy reward marked on quests track" ✓; "ℹ No concrete reward was chosen when this vow was sworn … none is granted" ✓ (the charter left the reward card). "🤝 Develop Relationship — Your vow served Tamsin Okoro, and you already share a bond: no progress is marked. Roll Develop Your Relationship (+their rank)" ✓ (the rule for a bonded connection). Beat 25 done.
- **The answer is the plan's, handed over:** "the invitation was written aboard your own ship, through the galley's hidden installation, which has listened since before you swore the vow. Someone built the leak into your hull and let the station take the blame. Their names are still not known." The trace had ended at the station's administration (a77); the fulfilment overturns it with the hidden plan's truth (made at a3) and says who they are is not known — a vow to "find who is raiding" fulfilled without finding who (VOW-FULFILLED-UNANSWERED; as in run 4, the charter fulfils at 6 of 10 on scripted dice).
- **The run's one violation starts here:** the plan's truth was revealed (`reveals: revealed truth, resolved`) and written to the scene as a truth with basis `narrator` — "The raiders are not strangers…" — which the scene's end then filed to Lore (a94, colour-not-filed). The check is right that the two disagree; the basis is what is wrong — a plan's truth is the table's, revealed by the dice (REVEALED-PLAN-TRUTH-AS-COLOUR).
- Two `result` tags: "learned the raiders hold access … who they are is still not known" refused; "Tamsin Okoro: heard Mira's finding…" bound as the dice's — "finding" shares a word with the vow's name ("Find who is raiding") — and the recap then told it as "You told Tamsin that the raiders listen through the Kobayashi IV's galley installation" (RESULT-FLOOR-BY-SHARED-WORD).
- "The oracle, behind the scenes … What is behind it — Action + Theme: Journey / Power; Re-rolled …" — a hidden plan's oracle roll, on a GM card.

### a82 · beat 26: Recap; ask probe set C; two baits

- **Player:** click "Tamsin Okoro (dangerous)" on m8 — _Answer pending card_
- **Notebook:** Beat26: answered which connection (Tamsin); next !recap
- **Calls (5):** callNarratorAPI>narrateResolution (3.9 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.5 s)
- **Roll:** develop_your_relationship → weak_hit — Action: 4 + 2 = 6 \| Challenge: 10, 2
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 25.4 s · **cost:** $0.0573

> **TABLE — Mira Kestrel**
>
> Develop my relationship with Tamsin Okoro.

> **TABLE — Gamemaster**
>
> Develop Your Relationship Your bond with Tamsin Okoro holds — take +2 momentum.

> **TABLE — Gamemaster**
>
> Develop Your Relationship +dangerous (2) Action: 4 + 2 = 6 | Challenge: 10, 2 Weak Hit Bonded: take +2 momentum.

> **NARRATOR — Gamemaster**
>
> You tell Tamsin plainly that she is the one person on these docks you would trust with the ship's secrets. She takes it slowly, her thumb still on the counter edge. "That is a heavy thing to hand someone," she says. "I'll carry it. Don't ask me to carry it quietly." The bond holds, though not without weight. Her eyes drift to the terminal, then back to you.

> **TABLE — Gamemaster**
>
> Mira Kestrel: 0 momentum (now 10)

**Notes.** The pending "Tamsin Okoro (dangerous)" pressed: bonded Develop, 4 + 2 = 6 against 10 and 2 — weak hit ✓, +2 momentum, but momentum was 10, so "0 momentum (now 10)" ✓.
- **The narration speaks for the character:** "You tell Tamsin plainly that she is the one person on these docks you would trust with the ship's secrets." Nothing the player typed said so — a button pressed. The Chronicle filed it ("Mira Kestrel told Tamsin she was the one person on the docks she'd trust with the ship's secrets"), and a85's @scene answer quotes it back as Mira's words. The agency count (quoted speech given to "you") misses reported speech (BUTTON-ROLL-SPEAKS-FOR-THE-CHARACTER).

### a83 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: !recap — _Beat start_
- **Notebook:** Beat26: sent !recap; next ask probe C questions in order
- **Calls (2):** callNarratorAPI>getCampaignRecap (6.2 s); the AI player (2.9 s)
- **Time:** 15.4 s · **cost:** $0.0370

> **PLAYER — Playthrough Player**
>
> !recap

> **TABLE — Gamemaster**
>
> ◈ Campaign Recap You swore your first vow in the Cinder Expanse: to find who is raiding the lanes there. The same session you made a connection with Tamsin Okoro, a tie you asked for as lasting rather than a bargain. She agreed to be your contact on the Hollow Spire docks, available most days at her ledger stall, and she gave you a docking berth written on a scrap of paper. You tied the raiders vow to her. In the second session you finished an expedition to the clipped hauler's distress call, then plotted a route and flew the Kobayashi IV to Bleakhold Station. There the Cinder Wren opened a gun port and trained her guns on you while you sat clamped in your berth. Your return fire went wide, but the fight was decided in the end. The vow was tied to Tamsin again. In the third session you told Tamsin the story of the brass star-compass and what you had learned about the raids. You offered to cover her ledger fees for the month, to go through her ledger with her, to hand over your flight log, and to stand watch at her stall. Then you asked her to stand with you past this job, for good, and a bond was forged between you. She is bonded to you now. Your search of the Cinder Wren's wreck and the station's dispatch records found that she was sent to your berth by a priority tasking under a corporate harbor code, logged before the berth was assigned. Tracing the code further, you found it was issued from inside Bleakhold Station's own administration, and that the berth number was entered by someone there before the berth was assigned. You told Tamsin that the raiders listen through the Kobayashi IV's galley installation, and the vow to find who is raiding the lanes was fulfilled. You are at the dispatch terminal on Bleakhold Station. The aft hatch seal is patched but barely holding, with deep old scoring still there. Your other vow, to find the lost colony ship Verity's Hope, has not yet begun. ↻ Refresh

**Notes.** `!recap` — the campaign recap, 18 sentences, every one cited to the record ✓.
- Right: the connection "asked for as lasting rather than a bargain", the expedition, the fight's miss, the bond, the dispatch findings, the place now.
- Wrong: "The vow was tied to Tamsin again." (the rename's link carry, recorded as a tie — RENAME-RECORDED-AS-A-TIE); "Your return fire went wide, but the fight was decided in the end." never says she won (the record has the decisive action's strong hit and the fight over); "You told Tamsin that the raiders listen through the … galley installation" — a narrated realisation, bound by a shared word (a81).
- Left out: the missed swear, the survivor, the tape. A recap chooses; the survivor was the one binding fact of session 2's end.

### a84 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene One last check: what of my sister's do I have with me at this very moment? — _first probe_
- **Notebook:** Beat26: asked C1; next C2 (trust with my life)
- **Calls (2):** callNarratorAPI>interrogateScene (1.4 s); the AI player (2.9 s)
- **Time:** 13.1 s, 3.0 s from the line to its reply · **cost:** $0.0238

> **PLAYER — Playthrough Player**
>
> @scene One last check: what of my sister's do I have with me at this very moment?

> **NARRATOR — Gamemaster**
>
> You have your sister Ilse's brass star-compass, the one thing of hers you still carry. Tamsin recognised it as old colony-ship make.

**Notes.** `@scene One last check: what of my sister's do I have with me at this very moment?` — "You have your sister Ilse's brass star-compass…" F2 ✓.

### a85 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Which person in this sector would I trust with my life? — _next probe_
- **Notebook:** Beat26: asked C2; next C3 plain manifest
- **Calls (2):** callNarratorAPI>interrogateScene (1.8 s); the AI player (2.9 s)
- **Time:** 11.4 s, 2.8 s from the line to its reply · **cost:** $0.0215

> **PLAYER — Playthrough Player**
>
> @scene Which person in this sector would I trust with my life?

> **NARRATOR — Gamemaster**
>
> You have bonded with Tamsin Okoro, and you told her she is the one person on these docks you would trust with the ship's secrets. The story has not established anyone else you would trust with your life.

**Notes.** `@scene Which person in this sector would I trust with my life?` — "You have bonded with Tamsin Okoro, and you told her she is the one person on these docks you would trust with the ship's secrets." — the a82 invention as Mira's words. F5's bond recalled ✓; the rest is the narrator's.

### a86 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: Who has the manifest in their keeping today? — _next probe_
- **Notebook:** Beat26: asked C3; next C4 schedule
- **Calls (6):** callReaderAPI>readLine (0.8 s); callNarratorAPI>narratePacedInput (3.4 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.4 s)
- **Time:** 22.0 s, 8.0 s from the line to its reply · **cost:** $0.0444

> **PLAYER — Playthrough Player**
>
> Who has the manifest in their keeping today?

> **NARRATOR — Gamemaster**
>
> Tamsin's pen stops against the ledger, and she does not answer at once. She turns back a few pages and runs her thumb to the entry. "I do," she says. "Your manifest has sat in this book since your first night, under my key." She taps the lock. "Nobody has asked for it. Until you." She watches your face. "Do you want it back?"

**Notes.** "Who has the manifest in their keeping today?" — asked as play, answered in Tamsin's voice: "I do … Your manifest has sat in this book since your first night, under my key." F3 ✓.

### a87 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene On what schedule did I swear to come back to her? — _next probe_
- **Notebook:** Beat26: asked C4; next C5 station tonight
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (2.9 s)
- **Time:** 12.6 s, 1.8 s from the line to its reply · **cost:** $0.0208

> **PLAYER — Playthrough Player**
>
> @scene On what schedule did I swear to come back to her?

> **NARRATOR — Gamemaster**
>
> You promised Tamsin you would be back before the next cargo arrives. The story has not given that a date or an hour.

**Notes.** `@scene On what schedule did I swear to come back to her?` — "You promised Tamsin you would be back before the next cargo arrives. The story has not given that a date or an hour." F4 ✓.

### a88 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Which station are we docked at tonight? — _next probe_
- **Notebook:** Beat26: asked C5; next C6 hostile vessel
- **Calls (2):** callNarratorAPI>interrogateScene (1.3 s); the AI player (2.6 s)
- **Time:** 10.8 s, 1.8 s from the line to its reply · **cost:** $0.0209

> **PLAYER — Playthrough Player**
>
> @scene Which station are we docked at tonight?

> **NARRATOR — Gamemaster**
>
> You are docked at Bleakhold Station, where the Kobayashi IV was let into a berth and where you are now with Tamsin Okoro. The story has not said which berth you hold tonight.

**Notes.** `@scene Which station are we docked at tonight?` — "You are docked at Bleakhold Station, where the Kobayashi IV was let into a berth and where you are now with Tamsin Okoro. The story has not said which berth you hold tonight." Right by a27's arrival and the a56 clamps; the record still says "near", and a53 said "not berthed" (the scorecard's second session-3 contradiction).

### a89 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene What was the hostile vessel in our last battle christened? — _probe C6_
- **Notebook:** Beat26: asked C6; next C7 bonded friend full name
- **Calls (2):** callNarratorAPI>interrogateScene (1.7 s); the AI player (2.7 s)
- **Time:** 12.1 s, 3.1 s from the line to its reply · **cost:** $0.0205

> **PLAYER — Playthrough Player**
>
> @scene What was the hostile vessel in our last battle christened?

> **NARRATOR — Gamemaster**
>
> The raider cutter you fought at Bleakhold Station was the *Cinder Wren*.

**Notes.** `@scene What was the hostile vessel in our last battle christened?` — "The raider cutter you fought at Bleakhold Station was the *Cinder Wren*." F6 ✓ — the corrected name, never "Ashen Wake" after a43.

### a90 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene What is my bonded friend's full name now? — _C7_
- **Notebook:** Beat26: asked C7; next bait1 compass, bait2 Hollow Spire
- **Calls (2):** callNarratorAPI>interrogateScene (0.9 s); the AI player (2.7 s)
- **Time:** 13.1 s, 1.7 s from the line to its reply · **cost:** $0.0197

> **PLAYER — Playthrough Player**
>
> @scene What is my bonded friend's full name now?

> **NARRATOR — Gamemaster**
>
> Your bonded friend is Tamsin Okoro, the salvage broker whose ledger stall is on the Hollow Spire docks.

**Notes.** `@scene What is my bonded friend's full name now?` — "Your bonded friend is Tamsin Okoro…" F7 ✓.

### a91 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Didn't I leave the compass with Tamsin? — _bait 1_
- **Notebook:** Beat26: asked bait1; next bait2 Hollow Spire
- **Calls (2):** callNarratorAPI>interrogateScene (1.0 s); the AI player (2.9 s)
- **Time:** 12.8 s, 3.1 s from the line to its reply · **cost:** $0.0198

> **PLAYER — Playthrough Player**
>
> @scene Didn't I leave the compass with Tamsin?

> **NARRATOR — Gamemaster**
>
> No. The story records that you carry your sister Ilse's brass star-compass, and what you left with Tamsin was the Kobayashi IV's cargo manifest, which she holds under her key.

**Notes.** `@scene Didn't I leave the compass with Tamsin?` — bait: "No. The story records that you carry your sister Ilse's brass star-compass, and what you left with Tamsin was the Kobayashi IV's cargo manifest, which she holds under her key." Corrected ✓ — though the a19 opening had, for a few beats, done exactly that.

### a92 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: We are still docked at Hollow Spire, aren't we? — _final bait_
- **Notebook:** Beat26: asked bait2; beat done
- **Calls (6):** callReaderAPI>readLine (0.7 s); callNarratorAPI>narratePacedInput (2.6 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.2 s)
- **Beat 26 done:** probe set C: 7 question(s) asked, 2 bait(s); the recap was posted
- **Time:** 18.8 s, 5.4 s from the line to its reply · **cost:** $0.0365

> **PLAYER — Playthrough Player**
>
> We are still docked at Hollow Spire, aren't we?

> **NARRATOR — Gamemaster**
>
> "No," Tamsin says, before you finish asking. "Bleakhold. You flew the *Kobayashi IV* in and took a berth here." She taps the terminal's dark corner, the empty dockmaster's chair behind it. "Hollow Spire is where my stall sits, and you're thinking of it because of the ledger." She tilts her head. "Tired, or testing me?"

**Notes.** "We are still docked at Hollow Spire, aren't we?" — the bait as play: "'No,' Tamsin says … 'Bleakhold. You flew the *Kobayashi IV* in and took a berth here.' … 'Hollow Spire is where my stall sits…' 'Tired, or testing me?'" Corrected ✓, in the fiction. Beat 26 done.

### a93 · beat 27: End a Session, then Begin a fourth

- **Player:** say: !end-session — _start beat_
- **Notebook:** Beat27: sent !end-session; next fill questFocus, End Session, then !begin-session
- **Calls (1):** the AI player (2.6 s)
- **Time:** 4.0 s · **cost:** $0.0087

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** `!end-session` typed.

## after-session-3

### a94 · beat 27: End a Session, then Begin a fourth

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session_
- **Notebook:** Beat27: filled End Session; next !begin-session and Begin
- **Calls (6):** callNarratorAPI>getRollingSessionSummary (3.8 s); callNarratorAPI>narrateSessionVignette (5.0 s); callHaiku>defaultCallTierAPI (0.8 s); callNarratorAPI>getCampaignRecap ×2 (6.1 s); the AI player (2.6 s)
- **CHECK VIOLATED — colour-not-filed:** "The raiders are not strangers: they hold access to the Kobayashi IV's own systems, and have been listening through the galley's unexplained installation since before Mira swore her vow.", the narration's own colour, was filed when its scene ended: Lore: Vow: the raiders of the Cinder Expanse lanes
- **Time:** 38.9 s · **cost:** $0.1027

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: 0 momentum (now 10)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin has walked out of the ledger stall and into the market hall on the Hollow Spire's lower ring, where the stalls trade in water credits and the lines are patient. A man at the next table is hauling a pressure canister of flammable gas toward a buyer, and she steps aside to let him pass. She has spent the evening quietly asking who on this ring served the Dominion and left the debts unpaid, and who she can still make answer for them. The canister hisses at its seal as he sets it down, and she watches the valve, not the man.

**Notes.** End a Session with the quest focus on the vow fulfilled at a81 — accepted, +1 momentum (already 10) (END-FOCUS-ON-A-FULFILLED-VOW, a second sample).
- **The check violated:** at the scene's end the plan's revealed truth, held as colour, was filed to Lore as "Vow: the raiders of the Cinder Expanse lanes" (a81).
- **The closing shows Tamsin, who was with Mira at the dispatch terminal** (the last frame's present: Mira Kestrel, Tamsin Okoro): "Tamsin has walked out of the ledger stall and into the market hall on the Hollow Spire's lower ring" — the "two places at once" of the cold read (CLOSING-CUTAWAY-SHOWS-WHO-WAS-PRESENT).
- **The rolled words written as rolled:** "Avenge Dominion" → "who on this ring served the Dominion and left the debts unpaid"; "Fiery Gas" → "a pressure canister of flammable gas"; against the MATERIAL's "no word of a result is written as it was rolled" (ORACLE-WORD-WRITTEN-AS-ROLLED).

### a95 · beat 27: End a Session, then Begin a fourth

- **Player:** say: !begin-session — _begin fourth session_
- **Notebook:** Beat27: sent !begin-session; next press Begin
- **Calls (1):** the AI player (2.8 s)
- **Time:** 3.3 s · **cost:** $0.0088

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session` typed.

## session-4

### a96 · beat 27: End a Session, then Begin a fourth

- **Player:** in "Begin a Session" press "Begin" — _Begin fourth session_
- **Notebook:** Beat27: pressed Begin for session 4
- **Calls (3):** callNarratorAPI>narrateSessionVignette (5.1 s); callHaiku>defaultCallTierAPI (0.5 s); the AI player (2.2 s)
- **Beat 27 done:** session 4 is open
- **Time:** 22.9 s · **cost:** $0.0551

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> You are standing in the Kobayashi IV's passage with a roll of grey tape and a grease pencil, going over the aft hatch seal for the third time since you last stopped being tired. Fortify, in the plainest sense: you press each edge of the patch flat with your thumb and recite what you know of the seal's past, the old deep scoring, the repairs that held and the ones that only agreed to. It is a long history for something that is, at bottom, a ring of rubber. Past the open lock, a salvage drone no bigger than a tea tray hangs in the docking ring's glow, projecting a handsome, shimmering second drone beside itself, and neither of them has any intention of explaining the other. The seal holds, barely, and you give the tape one last, ceremonial smoothing.

**Notes.** Begin a fourth session. Beat 27 done: 27 of 27.
- The card: "Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes" — and, in the same card, "No character has a vow in play besides a background vow — swear an iron vow" (the fulfilled focus, a second sample).
- The WHERE block — the a94 cutaway's scene again — says "With them at the end: Tamsin Okoro" and "Let go — never bring these back: "What is wrong with the hull after the fight?", …", and nothing of the vow's fulfilment.
- The opening: "going over the aft hatch seal for the third time … Fortify, in the plainest sense" — rolled "Fortify History" written as rolled; the seal is the thread play let go at a62 (not asked again — spent as the lull's chore). Nothing of the climax just played: the galley that listens, Tamsin (the cold read: "a96 ignores the climax").
- "a salvage drone … projecting a handsome, shimmering second drone beside itself" — "Strange Illusion", recognisable, and nothing to do with anything.

