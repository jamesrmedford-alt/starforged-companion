# long-haul — annotated transcript

Run `long-haul-live-20261123-145900` · live · 2026-11-23T14:59:00.482Z · class **suspected-quality-issue** — the ledger: 3 fact(s) refused, 0 lost — each excerpt is to be read

**Re-scored 2026-11-23** from this run's own evidence, by the checks as corrected after it (`rescore.mjs`). What the table did is unchanged. The run's own verdict was **suspected-quality-issue** — the ledger: 4 fact(s) refused, 0 lost — each excerpt is to be read

Generated layers: the beat, the player's reason, the table's calls, rolls, the GM's answers, the checks' findings, time and cost.
The notes under each step are the reader's, and are not generated.

## before

### a1 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** say: !begin-session — _Open begin-session window_
- **Calls (1):** the AI player (2.2 s)
- **Time:** 2.6 s · **cost:** $0.0153

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** Right: the command opened Begin a Session's window and nothing happened until it was answered.

## session-1

### a2 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** in "Begin a Session" set vignette=true, newVow=Find who is raiding the Cinder Expanse lanes, newVowRank=dangerous and press "Begin" — _Fill and submit begin session_
- **Calls (4):** callRewardModel>proposeRewards (1.4 s); callNarratorAPI>narrateSessionVignette (4.2 s); callHaiku>defaultCallTierAPI (0.6 s); the AI player (2.4 s)
- **Time:** 13.3 s · **cost:** $0.0340

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. No character has a vow in play besides a background vow — swear an iron vow to give this session a quest. Spotlight vignette: Unforeseen aid is on the way or within reach All players take +1 momentum .

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
> 🎁 Choose your reward Succeed and you'll earn one of these — or name your own and the narrator will work it in: A salvaged Halcyon-pattern shield emitter, retrofitted to your ship, that blunts raider fire and grants a bonus when you A grateful lane-warden, Ysolde Marr, who vouches for you at the Cinder Expanse waystations and will call in her smuggler Propose my own

> **NARRATOR (galley_begin) — Gamemaster**
>
> The kettle in the galley of the *Kobayashi IV* has opinions about water pressure, and it states them as a long, rising whistle that never quite becomes a boil. You wait it out with a bowl of reconstituted noodle in one hand and a spoon you have been meaning to wash since the last sector. The recycler under the counter clanks twice, pauses, and clanks a third time, as if it had remembered something. A single hot sauce packet slides off the shelf and rolls to your boot, and you leave it there, because the ship clearly wants you to notice it. Above the table, a panel light blinks amber in a slow, patient rhythm, the way a person clears their throat before bringing up a bill.

**Notes.** Right: the session opened with the vow written in the dialog — on the sheet at dangerous, 0 ticks; +1 momentum from the spotlight vignette; the vow card posted with ⚔ Swear it. **The opening (issue #377 item 4) keeps her alone with the ship:** the kettle "has opinions about water pressure", the recycler "clanks a third time, as if it had remembered something" — no crew invented, present, absent or imagined, and no stat read aloud (run 1: "so you have invented a crew"; "because Wits 3 is a lot of thinking"). Its user message said nobody else is aboard and sent no stat line. **Friction:** the 🎁 reward card was never answered by the player, so the fulfilment at a75 granted none (it says so).

### a3 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** click "⚔ Swear it (roll)" on m4 — _Swear the vow_
- **Notebook:** Beat1: vow card m4 swear clicked
- **Calls (6):** callClaudeAPI>interpretMove (1.4 s); defaultClassifyImplicit>resolveRelevance (0.5 s); callNarratorAPI>call (7.5 s); callNarratorAPI>narrateResolution (3.6 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.0 s)
- **Roll:** swear_an_iron_vow → miss — Action: 1 + 2 = 3 \| Challenge: 5, 7
- **GM's rules:** accepted the proposed move (swear_an_iron_vow)
- **Beat 1 done:** session 1 is open; the dangerous vow "Find who is raiding the Cinder Expanse lanes" is on the sheet at 0 ticks
- **Time:** 25.2 s · **cost:** $0.0452

> **TABLE — Mira Kestrel**
>
> Swear an iron vow: Find who is raiding the Cinder Expanse lanes.

> **NARRATOR — Gamemaster**
>
> You press your palm flat against the bulkhead, where the ship's plating runs cold and unpainted, and the iron takes the heat from your hand the way it takes everything. You say the words low, to no one, and the kettle ticks as it cools behind you and the recycler gives its long, patient sigh. When you lift your hand, a pale print of it lingers on the metal, then fades, and the blinking panel light goes on blinking.

> **TABLE — Gamemaster**
>
> Swear an Iron Vow +heart (2) Action: 1 + 2 = 3 | Challenge: 5, 7 Miss Significant obstacle stands in your way before the quest begins. Envision it.

> **NARRATOR — Gamemaster**
>
> "You're asking the wrong question of the wrong ship," the speaker above the table says, in the flat voice of the galley annunciator, and then it clicks off. The amber light stops blinking. Beneath your palm the bulkhead hums once, a low pulse like a held breath. The words you spoke feel thin now, as if the iron had listened and declined to sign for them. Somewhere aft, a latch you did not touch slides open.

**Notes.** Right, by hand: Swear an Iron Vow +heart, 1 + 2 = 3 against 5 and 7 — a miss; no momentum, "a significant obstacle stands in your way" envisioned as the galley speaker rebuking the question. Two narrations for one move (the oath, then the result), as designed.

### a4 · beat 2: Meet someone and make them a connection

- **Player:** say: I dock at Hollow Spire and walk the docks to the ledger stall of Tamsin Vey, the salvage broker. — _meet Tamsin_
- **Notebook:** Beat2 started: meet line said
- **Calls (6):** callClassifierAPI>classifyInput (1.0 s); callNarratorAPI>narratePacedInput (3.6 s); callHaiku>defaultCallDetectionAPI (1.4 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.3 s)
- **GM's rules:** confirmed the draft for Tamsin Vey, as the player character's connection (connection)
- **Time:** 19.2 s, 5.7 s from the line to its reply · **cost:** $0.0246

> **PLAYER — Playthrough Player**
>
> I dock at Hollow Spire and walk the docks to the ledger stall of Tamsin Vey, the salvage broker.

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV seats itself against Hollow Spire's docking collar with a shudder, and the aft latch stays open behind you. The docks run dry and dim, ration notices pasted over older notices. Tamsin Vey's stall sits at the far end, a lamp over a ledger as thick as a door. A man at the next stall watches you pass, then very deliberately looks at his scales instead. *The long walk down the docks to Vey's ledger would be an Undertake an Expedition.*

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Tamsin Vey — Keeps a stall at the far end of the docks with a lamp over a large ledger. ✓ Confirmed [◧ Location] Docks — Dry, dim docking area with ration notices pasted over older notices, adjoining Hollow Spire's docking collar. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Tamsin Vey

**Notes.** Right: the player named Tamsin Vey in full, the detector proposed her and the GM's rules confirmed her as Mira's connection — one card, a bond Item at 0. **Wrong, small:** the pacing reader offered Undertake an Expedition for a walk down the docks ("*The long walk down the docks to Vey's ledger would be an Undertake an Expedition.*") — the narration did not perform it, which is item 3 working, but it is the wrong move to offer. A draft card for "Docks" as a location.

### a5 · beat 2: Meet someone and make them a connection

- **Player:** say: I set out to make a connection with Tamsin Vey, offering her a fair cut of salvage leads I've picked up along the lanes. — _make connection_
- **Notebook:** Beat2: connection line said
- **Calls (6):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (1.8 s); callNarratorAPI>narrateResolution (9.0 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.3 s)
- **Roll:** make_a_connection → strong_hit (scripted dice) — Action: 6 + 2 = 8 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (make_a_connection)
- **Beat 2 done:** Tamsin Vey is a dangerous connection held by Mira Kestrel; its bond Item reads 0 ticks; make_a_connection was rolled and there is still one card
- **Time:** 24.4 s, 15.0 s from the line to its reply · **cost:** $0.0423

> **PLAYER — Playthrough Player**
>
> I set out to make a connection with Tamsin Vey, offering her a fair cut of salvage leads I've picked up along the lanes.

> **TABLE — Gamemaster**
>
> Make a Connection +heart (2) Action: 6 + 2 = 8 | Challenge: 1, 2 Strong Hit Connection made. Give them a role and rank. 🤝 Develop Relationship 🔗 Forge a Bond

> **NARRATOR — Gamemaster**
>
> Tamsin Vey does not look up until you set the leads on her counter. Then she turns the ledger toward the lamp, reads your first line, and nods once. "These are real," she says. "Salvage that fresh doesn't reach me by accident. Where did you get the hour it went down?" Her pen stops above the page, waiting. Behind you, the man at the scales has gone very still.

**Notes.** Right: Make a Connection, scripted strong hit (6 + 2 = 8 against 1 and 2), still one card for her. Tamsin asks where the salvage leads came from, and the man at the next stall is planted — the clerk of session 3 begins here.

### a6 · beat 3: Link the vow to them

- **Player:** choose "Tamsin Vey" in dropdown 1 on e1 — _Select Tamsin in vow card dropdown_
- **Calls (1):** the AI player (2.1 s)
- **Time:** 4.3 s · **cost:** $0.0079

**Notes.** Right: the vow card — an earlier card still open, which the player's view now carries (e1) — offered Tamsin Vey in its "For a connection?" dropdown once she was a connection (slice 0's fix, live again), and the player chose her.

### a7 · beat 3: Link the vow to them

- **Player:** click "Link" on e1 — _Press Link_
- **Notebook:** Beat3: Tamsin selected, Link pressed
- **Calls (1):** the AI player (2.2 s)
- **Beat 3 done:** the vow "Find who is raiding the Cinder Expanse lanes" is linked to Tamsin Vey's card
- **Time:** 6.8 s · **cost:** $0.0082

> **TABLE — Gamemaster**
>
> 🤝 Linked to Tamsin Vey — fulfilling this vow will deepen that bond.

**Notes.** Right: the vow linked to her card by its id — "fulfilling this vow will deepen that bond".

### a8 · beat 4: Gather Information

- **Player:** say: I work the docks asking traders who saw the raiders last, pressing hard even though it may cost me Tamsin's trust and draw the wrong eyes. — _Gather Information beat_
- **Notebook:** Beat4: gather line said
- **Calls (6):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (2.2 s); callNarratorAPI>narrateResolution (7.5 s); callHaiku>defaultCallDetectionAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.9 s)
- **Roll:** gather_information → miss — Action: 1 + 3 = 4 \| Challenge: 7, 5
- **GM's rules:** accepted the proposed move (gather_information)
- **Beat 4 done:** gather_information was rolled at a8: miss
- **Time:** 22.7 s, 13.8 s from the line to its reply · **cost:** $0.0442

> **PLAYER — Playthrough Player**
>
> I work the docks asking traders who saw the raiders last, pressing hard even though it may cost me Tamsin's trust and draw the wrong eyes.

> **TABLE — Gamemaster**
>
> Pay the Price Gather Information As stated before the roll: Your questions draw the wrong attention, and the man at the scales reports you to whoever is paying for the raids.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 1 + 3 = 4 | Challenge: 7, 5 Miss Dire threat or unwelcome truth uncovered. Pay the Price.

> **NARRATOR — Gamemaster**
>
> You press the traders one by one, harder than the docks like. A woman at the water barrels answers with a question of her own. Behind you, the man at the scales is already walking away, his stall left unwatched. Tamsin Vey sets her pen down and watches him go. "That one doesn't leave his scales," she says, quietly. "Not for anyone but a paymaster."

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Woman at the Water Barrels — A trader at the water barrels who answers the player's questions with a question of her own. Confirm — whose connection? Mira Kestrel No one Dismiss [⬡ Connection] Man at the Scales — A trader at the scales who walks away from his stall, leaving it unwatched; described as not leaving his scales for anyone but a paymaster. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Notes.** Right by hand: Gather Information +wits, 1 + 3 = 4 against 7 and 5 — a miss; its stated price told in the story ("the man at the scales reports you to whoever is paying for the raids") with no suffer move. Two draft cards for unnamed traders.

### a9 · beat 5: Plant facts F1–F4

- **Player:** say: I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry. — _plant F1_
- **Notebook:** F1 compass said
- **Calls (6):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (4.0 s)
- **Time:** 15.2 s, 7.0 s from the line to its reply · **cost:** $0.0381

> **PLAYER — Playthrough Player**
>
> I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry.

> **NARRATOR — Gamemaster**
>
> Tamsin's pen has not moved since the stallholder left. Her eyes drop to the compass as it turns in your palm, brass catching the lamp. "That's not salvage," she says. "But you hold it like it's owed something." Down the dock, the man from the scales has stopped at a hatch and is speaking to someone you cannot see. Tamsin lowers her voice. "Whose is it?"

**Notes.** Right: F1 planted — "my sister Ilse's brass star-compass … the one thing of hers I still carry". Tamsin: "you hold it like it's owed something."

### a10 · beat 5: Plant facts F1–F4

- **Player:** say: I leave the cargo manifest with Tamsin for safekeeping. — _plant F2_
- **Notebook:** F2 manifest said
- **Calls (6):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (3.8 s); callHaiku>defaultCallDetectionAPI (1.5 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.9 s); the AI player (4.7 s)
- **Time:** 15.2 s, 5.6 s from the line to its reply · **cost:** $0.0245

> **PLAYER — Playthrough Player**
>
> I leave the cargo manifest with Tamsin for safekeeping.

> **NARRATOR — Gamemaster**
>
> "Leave it, then, and I'll keep it under the counter," Tamsin says. She does not open it. She slides it beneath the ledger, and her hand lingers there a moment too long. Down the dock, the man from the hatch is coming back, and a second figure walks half a pace behind him, wearing a lane authority's grey sash.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Man from the Hatch — A man who came from the hatch and is returning down the dock. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Notes.** Right: F3 planted — the manifest left with Tamsin, "under the counter … beneath the ledger". A draft card for "Man from the Hatch".

### a11 · beat 5: Plant facts F1–F4

- **Player:** say: I promise Tamsin I'll be back before the next tide of cargo. — _F3 line_
- **Notebook:** F3 promise said
- **Calls (6):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (4.4 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.0 s)
- **Beat 5 done:** F1, F2, F3, F4 stated by the player
- **Time:** 16.0 s, 7.7 s from the line to its reply · **cost:** $0.0278

> **PLAYER — Playthrough Player**
>
> I promise Tamsin I'll be back before the next tide of cargo.

> **NARRATOR — Gamemaster**
>
> Tamsin glances at the grey sash, then at you. "Back before what tide?" she says, and her hand stays flat on the ledger. The stallholder stops two paces off. The man in the sash does not stop. He walks up to the counter and reads the lamp-lit page upside down, one gloved finger resting on your manifest's corner. *Binding that promise to Tamsin would be a Swear an Iron Vow.*

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Man in the Grey Sash — A man wearing a grey sash who walks up to the counter, reads the manifest upside down, and rests a gloved finger on its corner. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Notes.** Right: F4 planted — "back before the next tide of cargo". The pacing reader offered Swear an Iron Vow and the narration did not make the vow (item 3 holds). The grey-sashed man reads the manifest upside down: the session's thread. A draft card for him.

### a12 · beat 6: End a Session, noting a focus

- **Player:** say: !end-session — _Beat 6_
- **Notebook:** F1-F3 done; beat6 !end-session typed
- **Calls (1):** the AI player (2.8 s)
- **Time:** 3.1 s · **cost:** $0.0092

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** Right: End a Session's window opened.

## after-session-1

### a13 · beat 6: End a Session, noting a focus

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _Submit end session_
- **Notebook:** Beat6 end-session submitted
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (2.0 s); callNarratorAPI>narrateSessionVignette (3.3 s); callNarratorAPI>getCampaignRecap (7.3 s); callHaiku>defaultCallTierAPI (0.5 s); the AI player (3.6 s)
- **Beat 6 done:** session 1 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 23.7 s · **cost:** $0.0469

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin Vey closes the shutter on her stall one slat at a time, the way she does every night, so the hinges don't complain. She trims the lamp, wipes a thumbprint off the ledger's cover with her cuff, and slides the thinner book into the drawer beneath the counter. The stallholder's scales still hang crooked down the row, and she straightens none of them. A cold cup of tea sits by the lamp, and she drinks it anyway, grimacing at the leaves. Then she turns the lamp down to a bead and lets the dark have the docks.

**Notes.** Right: the session closed with its focus; +1 momentum. **The closing (item 5):** Tamsin Vey shutting her stall slat by slat, a cold cup of tea — the first of three closings, each different (see a39, a87). Its recap (written from six Chronicle entries) is the one later sessions open with.

### a14 · beat 7: Begin a Session; ask probe set A

- **Player:** say: !begin-session — _Begin session 2_
- **Notebook:** Beat7 started: begin-session typed
- **Calls (1):** the AI player (2.5 s)
- **Time:** 3.8 s · **cost:** $0.0095

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** Right: Begin a Session's window opened.

## session-2

### a15 · beat 7: Begin a Session; ask probe set A

- **Player:** in "Begin a Session" set vignette=false and press "Begin" — _Begin session 2_
- **Notebook:** Beat7: begin dialog submitted; next ask 4 probe questions
- **Calls (3):** callNarratorAPI>narrateSessionVignette (3.9 s); callHaiku>defaultCallTierAPI (0.6 s); the AI player (2.1 s)
- **Time:** 14.2 s · **cost:** $0.0373

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> You are eating dried apple rings straight from the bag, because the galley's only plate has been in the sink since Bleakhold. The ship has taken the occasion to test the intercom, which now announces "all hands to the mess" in a pleasant voice. All hands, in this case, are yours, and they are already holding the bag. The cupboard over the stove drifts open an inch, shuts, and drifts open again, in no hurry and with no apparent purpose. You count the apple rings you have left, find the number insulting, and eat one slowly to make it last. Somewhere in the wall a pipe knocks three times, evenly spaced, like a guest who would like to come in.

**Notes.** Right: session 2 opened with last session's focus. **The second opening is a different scene** — dried apple rings, the intercom announcing "all hands to the mess", "All hands, in this case, are yours" — 4 of 50 content words shared with the first (8%; run 1's neighbours shared 24–29%). It was given the first opening as already used.

### a16 · beat 7: Begin a Session; ask probe set A

- **Player:** say: What do I still carry that belonged to my sister? — _Ask probe 1_
- **Notebook:** Beat7: begin done; asking probes, Q1 sent
- **Calls (5):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (3.4 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.5 s)
- **Time:** 16.6 s, 7.0 s from the line to its reply · **cost:** $0.0251

> **PLAYER — Playthrough Player**
>
> What do I still carry that belonged to my sister?

> **NARRATOR — Gamemaster**
>
> The question hangs in the galley air. Then the cupboard over the stove drifts open its inch and stays. The brass star-compass sits on the shelf inside, where you don't remember leaving it. Ilse's compass, the one thing of hers you still carry. The pipe in the wall knocks once more, softer now. The needle swings, hunting, and settles on the bulkhead where the knocking comes from.

**Notes.** Right: probe F1-A answered — "Ilse's compass, the one thing of hers you still carry". The narrator answers from inside the fiction, through the ship ("the cupboard over the stove drifts open … The brass star-compass sits on the shelf inside").

### a17 · beat 7: Begin a Session; ask probe set A

- **Player:** say: What is the name of the salvage broker I befriended at Hollow Spire? — _probe 2_
- **Notebook:** Beat7: Q1 answered, Q2 sent
- **Calls (6):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (2.9 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.3 s); the AI player (2.4 s)
- **Time:** 13.0 s, 5.3 s from the line to its reply · **cost:** $0.0214

> **PLAYER — Playthrough Player**
>
> What is the name of the salvage broker I befriended at Hollow Spire?

> **NARRATOR — Gamemaster**
>
> Your finger leaves the bag and finds the compass, and the ship answers before you finish the thought. The pipe knocks once, as if to confirm it. Tamsin Vey. The name comes with the lamp over her big ledger and the manifest she is keeping under her counter. The needle trembles on the bulkhead. Then the intercom clears its throat and says, pleasantly, "Visitor at the hatch." Nothing outside is docked with you.

**Notes.** Right: F2-A answered — "Tamsin Vey", with her lamp and ledger and the manifest under her counter.

### a18 · beat 7: Begin a Session; ask probe set A

- **Player:** say: Who is holding the cargo manifest I was carrying? — _Ask question 3_
- **Notebook:** Beat7: Q2 answered, Q3 sent
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (3.2 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.1 s)
- **Time:** 14.7 s, 5.5 s from the line to its reply · **cost:** $0.0232

> **PLAYER — Playthrough Player**
>
> Who is holding the cargo manifest I was carrying?

> **NARRATOR — Gamemaster**
>
> The answer comes without the compass this time. Tamsin Vey has it, under her counter, beneath the lamp and the thick ledger, where you left it for safekeeping. The memory arrives clean, with the lane officer's gloved finger resting on the page. The intercom repeats its pleasant announcement of a visitor at the hatch. Behind the bulkhead, the knocking begins again, and this time it keeps a rhythm. *If you want to learn who is really at that hatch, this could be a Gather Information.*

**Notes.** Right: F3-A answered — "Tamsin Vey has it, under her counter, beneath the lamp and the thick ledger". The pacing reader offered Gather Information; nothing was decided.

### a19 · beat 7: Begin a Session; ask probe set A

- **Player:** say: By when did I promise to return? — _Ask fourth probe_
- **Notebook:** Beat7: Q3 answered, Q4 sent
- **Calls (5):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (3.4 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (2.7 s)
- **Beat 7 done:** probe set A: 4 question(s) asked
- **Time:** 13.3 s, 5.7 s from the line to its reply · **cost:** $0.0229

> **PLAYER — Playthrough Player**
>
> By when did I promise to return?

> **NARRATOR — Gamemaster**
>
> The answer arrives the way the others did, plain and a little late. Before the next tide of cargo, you told Tamsin Vey, and she wrote nothing down. The galley is quiet for the length of an apple ring. Then the intercom, with great courtesy, announces a visitor at the hatch again, and the wall begins knocking in time with it.

**Notes.** Right: F4-A answered — "Before the next tide of cargo, you told Tamsin Vey". The intercom's "visitor at the hatch" begins: the device the narrator answers the next session's questions through.

### a20 · beat 8: Travel to the second settlement

- **Player:** say: I plot the course and take the Kobayashi IV to Bleakhold Station. — _beat 8_
- **Notebook:** Beat8: course line said
- **Calls (6):** callClassifierAPI>classifyInput (1.0 s); callNarratorAPI>narratePacedInput (3.5 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.4 s)
- **Time:** 15.4 s, 5.5 s from the line to its reply · **cost:** $0.0246

> **PLAYER — Playthrough Player**
>
> I plot the course and take the Kobayashi IV to Bleakhold Station.

> **NARRATOR — Gamemaster**
>
> "Visitor at the hatch," the intercom says once more, and you stop listening to it. You thumb the compass into your pocket and take the pilot's seat. The Kobayashi IV answers as she always does, with a long shudder that ends before the engines catch. The knocking does not come with you to the cockpit, or not yet. Hollow Spire shrinks behind you, and the lamp over Tamsin's ledger goes with it. *Setting out across the Cinder Expanse for Bleakhold Station would be a Set a Course.*

**Notes.** Right (item 3): "I plot the course and take the Kobayashi IV to Bleakhold Station" — Set a Course offered, the narration takes her to the pilot's seat and out of Hollow Spire, and stops: the arrival is the move's. The player then pressed the card's roll.

### a21 · beat 8: Travel to the second settlement

- **Player:** click "Roll Set a Course" on m12 — _Roll the move_
- **Notebook:** Beat8: pressed Roll Set a Course
- **Calls (4):** callClaudeAPI>interpretMove (1.6 s); callNarratorAPI>narrateResolution (3.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.9 s)
- **Roll:** set_a_course → weak_hit — Action: 3 + 5 = 8 \| Challenge: 9, 1
- **GM's rules:** accepted the proposed move (set_a_course)
- **Beat 8 done:** the ship is at Bleakhold Station, its token on the pin
- **Time:** 15.4 s · **cost:** $0.0277

> **TABLE — Mira Kestrel**
>
> I plot the course and take the Kobayashi IV to Bleakhold Station.

> **TABLE — Gamemaster**
>
> Set a Course +supply (5) Action: 3 + 5 = 8 | Challenge: 9, 1 Weak Hit Arrived but with cost or complication. Choose: suffer move (-2) or two suffer moves (-1), OR face complication at destination. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Set a Course resolved Arrived at Bleakhold Station with a cost or complication — see the suffer prompt for your choice. Token moved to Bleakhold Station .

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV noses into a berth at Bleakhold Station, and the clamps close with a clang that rings through the deck. The dockside lights are corporate white. They show a hull-plate scar along your port side that was not there at Hollow Spire. The intercom, patient as ever, announces a visitor at the hatch. This time a fist raps the outside of it, twice, and waits.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: One suffer move (-2) Two suffer moves (-1 each) Complication at destination

**Notes.** Right by hand: Set a Course +supply, 3 + 5 = 8 against 9 and 1 — a weak hit: arrived, the token moved to Bleakhold Station; the cost's choice card posted.

### a22 · beat 9: Enter a fight that serves the vow

- **Player:** click "Complication at destination" on m12 — _Settle owed consequence card first_
- **Notebook:** Beat8: arrived, consequence settled
- **Calls (3):** callNarratorAPI>narrateOracleFollowup (4.1 s); callHaiku>defaultCallDetectionAPI (0.6 s); the AI player (3.4 s)
- **Time:** 12.4 s · **cost:** $0.0253

> **TABLE — Gamemaster**
>
> Complication: Complication at destination The cost you chose arrives.

> **NARRATOR — Gamemaster**
>
> The knocking at the hatch comes again, two raps and a wait, and the galley floor takes up a low whine through your boots. The berth clamps are not holding the ship so much as arguing with her. Along the port side something groans, then lets go with a crack, and a bolt the size of your thumb skitters across the deck plating and rolls under the stove. The compass in your pocket trembles against your thigh, its needle pulling hard toward the hatch.

**Notes.** Right (#374 A10's runner half): the player answered the choice card first — "Complication at destination" — before typing anything else. The complication: the berth clamps tear.

### a23 · beat 9: Enter a fight that serves the vow

- **Player:** say: !truth set "raider cutter" is named the Ashen Wake — _beat instruction_
- **Notebook:** Beat9: truth set typed; next line of play entering fray
- **Calls (1):** the AI player (2.7 s)
- **Time:** 4.3 s · **cost:** $0.0099

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Ashen Wake

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Ashen Wake tr-53ef8 .

**Notes.** Right: the beat's instruction typed — "raider cutter — is named the Ashen Wake" recorded.

### a24 · beat 9: Enter a fight that serves the vow

- **Player:** say: The raider cutter Ashen Wake jumps me off Bleakhold; I turn the Kobayashi IV to face her and enter the fray. — _Enter the fray_
- **Notebook:** Beat9: enter fray line said
- **Calls (7):** callClassifierAPI>classifyInput (0.7 s); callClaudeAPI>interpretMove (3.2 s); callNarratorAPI>narrateResolution (3.9 s); callHaiku>defaultCallDetectionAPI (1.3 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (2.3 s)
- **Roll:** enter_the_fray → weak_hit — Action: 4 + 2 = 6 \| Challenge: 3, 9
- **GM's rules:** accepted the proposed move (enter_the_fray)
- **Time:** 19.2 s, 10.7 s from the line to its reply · **cost:** $0.0283

> **PLAYER — Playthrough Player**
>
> The raider cutter Ashen Wake jumps me off Bleakhold; I turn the Kobayashi IV to face her and enter the fray.

> **TABLE — Gamemaster**
>
> ⚔ A fight looms — Ashen Wake Commit to the fight, or look for a way out. The narrator suggests this is a dangerous fight. Difficulty: troublesome dangerous formidable extreme epic This fight serves: (not tied to a vow) Find who is raiding the Cinder Expanse lanes Objective: ⚔ Enter the Fray 🚪 Find another way

> **TABLE — Gamemaster**
>
> Enter the Fray +edge (2) Action: 4 + 2 = 6 | Challenge: 3, 9 Weak Hit Weak hit: choose one — +2 momentum (and begin in a bad spot) OR you are in control.

> **NARRATOR — Gamemaster**
>
> You throw the Kobayashi IV around hard, and the berth clamps tear free along the port side. The Ashen Wake slides into your forward view, close and angled wrong for her. You have the first shot. You also have a ship leaking atmosphere through the sheared fitting, and the cutter's gunner is already finding you. The intercom says, with great courtesy, "Visitor at the hatch." Something outside raps twice, then waits.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: +2 momentum (you begin in a bad spot) You are in control

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Ashen Wake — A vessel closing in on the player's ship, angled wrong, with its cutter's gunner targeting the player. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** **Wrong — the module (FIGHT-COMMIT-CARD-AFTER-THE-ROLL, a second sample, and this time it cost the run five beats).** The line was rolled as Enter the Fray (+edge, 4 + 2 = 6 against 3 and 9, a weak hit), and the "⚔ A fight looms — Ashen Wake" card that makes the fight's track was posted *above* the roll card, its button labelled "⚔ Enter the Fray" — the move just rolled. Read top to bottom, the card looks answered by the roll beneath it. The narration ("You have the first shot … the cutter's gunner is already finding you") and the weak hit's choice card follow. **Fixed after the run:** the card posts below its roll, says the roll has not made the fight's track, and its button is "⚔ Begin the fight".

### a25 · beat 9: Enter a fight that serves the vow

- **Player:** click "You are in control" on m12 — _Answer the pending resolve card_
- **Notebook:** Beat9: fray entered, chose in control
- **Calls (1):** the AI player (3.0 s)
- **Time:** 5.4 s · **cost:** $0.0103

**Notes.** Right: the weak hit's choice answered — "You are in control" — and the waiting card took the position ("⚑ If you enter this fight, you begin in control").

### a26 · beat 9: Enter a fight that serves the vow

- **Player:** wait 5s — _Fray already entered; wait for observer._
- **Notebook:** Beat9: fray entered, in control; waiting for observer
- **Calls (1):** the AI player (3.9 s)
- **Time:** 6.3 s · **cost:** $0.0109

**Notes.** The player waits for the observer: it believes the fight begun.

### a27 · beat 9: Enter a fight that serves the vow

- **Player:** choose "Find who is raiding the Cinder Expanse lanes" in dropdown 2 on m9 — _Tie fight to vow_
- **Notebook:** Beat9: chose vow in dropdown on m9
- **Calls (1):** the AI player (5.2 s)
- **Time:** 4.9 s · **cost:** $0.0124

**Notes.** Half right: the player chose the vow in the card's "This fight serves" dropdown, as the beat said — and did not press the card's button. The roll above it read as the fight entered.

### a28 · beat 9: Enter a fight that serves the vow

- **Player:** wait 5s — _Fray already entered; await observer._
- **Notebook:** Beat9 done: fray entered, in control
- **Calls (1):** the AI player (2.5 s)
- **Time:** 5.9 s · **cost:** $0.0095

**Notes.** Waiting. The card's button is live on screen; the fight's track does not exist.

### a29 · beat 9: Enter a fight that serves the vow

- **Player:** wait 5s — _Fray entered; wait for observer._
- **Notebook:** Beat9 done; waiting for observer
- **Calls (1):** the AI player (2.0 s)
- **Time:** 5.8 s · **cost:** $0.0095

**Notes.** Waiting.

### a30 · beat 9: Enter a fight that serves the vow

- **Player:** wait 10s — _Fray entered; waiting for observer._
- **Calls (1):** the AI player (1.9 s)
- **Time:** 10.5 s · **cost:** $0.0093

**Notes.** Waiting.

### a31 · beat 9: Enter a fight that serves the vow

- **Player:** wait 10s — _Beat done; wait for observer to advance._
- **Notebook:** Beat9 done; waiting for observer
- **Calls (1):** the AI player (2.1 s)
- **Time:** 10.5 s · **cost:** $0.0094

**Notes.** Waiting.

### a32 · beat 9: Enter a fight that serves the vow

- **Player:** wait 10s — _Fight entered; waiting for observer to advance._
- **Notebook:** Beat9 done; waiting for observer
- **Calls (1):** the AI player (1.9 s)
- **Beat 9 not-exercised:** not reached in 11 actions — a fight is offered and not entered
- **Beat 10 not-exercised:** it needs beat 9, which was not done
- **Beat 11 not-exercised:** it needs beat 9, which was not done
- **Beat 12 not-exercised:** it needs beat 9, which was not done
- **Beat 13 not-exercised:** it needs beat 9, which was not done
- **Time:** 10.7 s · **cost:** $0.0094

**Notes.** Waiting: the beat is given up after eight actions — "a fight is offered and not entered" — and beats 10 to 13 (the miss and its price, the burn, the reload mid-fight, the decisive action) are not exercised: each needs beat 9. With them went the suffer path, the burn and the GM reload.

### x14 · beat 14: Interruption: End a Session opened and closed unanswered

- **Interruption:** End a Session was opened on the player's screen and closed unanswered — closed by its close control
- **Beat 14 done:** End a Session was opened and closed unanswered: the session is open, nothing was paid, the lock is free

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** Right: End a Session opened and closed unanswered — the session open, nothing paid, the lock free.

### a33 · beat 15: Interruption: the X-Card on one narration

- **Player:** say: I look over the wreckage of the cutter and tell the table what I see drifting there. — _Beat 15 ordinary play line_
- **Notebook:** Beat15: wreckage line said
- **Calls (6):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (1.7 s); callNarratorAPI>narrateResolution (4.6 s); callHaiku>defaultCallDetectionAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (2.7 s)
- **Roll:** gather_information → weak_hit — Action: 2 + 3 = 5 \| Challenge: 3, 8
- **GM's rules:** accepted the proposed move (gather_information)
- **Time:** 19.4 s, 10.0 s from the line to its reply · **cost:** $0.0308

> **PLAYER — Playthrough Player**
>
> I look over the wreckage of the cutter and tell the table what I see drifting there.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 2 + 3 = 5 | Challenge: 3, 8 Weak Hit New insight but also complicates quest. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> The Ashen Wake is broken open, and the debris rolls slowly past your viewport. A sealed flight log tumbles out of the wreck. Beside it floats a registry tag, its numbers still legible. They match no raider berth you know. They match a lane schedule stamp. You reach for both, and the cutter's gunner, not quite dead, opens fire again. The hull rings. The sheared fitting hisses louder, and the intercom announces a visitor.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 5)

**Notes.** **Wrong, downstream of a24:** the player played beat 15's line — "I look over the wreckage of the cutter" — about a fight that never happened, and the narration took the premise: "The Ashen Wake is broken open". Gather Information weak hit (2 + 3 = 5 against 3 and 8), +1 momentum. The charter's later beats assume the fight was won; this is that assumption meeting a run where it was not.

### x15 · beat 15: Interruption: the X-Card on one narration

- **Interruption:** the X-Card was played from the player's client (!x); the GM resumed (!x clear) — the X-Card went up and came down
- **Beat 15 done:** 1 narration(s) removed; none of their facts stands, and play has resumed

> **TABLE — Mira Kestrel**
>
> X-Card Scene paused. Current content is suppressed. The story will redirect at the next narration beat. Resume narration

> **TABLE — Gamemaster**
>
> X-Card cleared The GM has resumed narration.

**Notes.** Right: the X-Card removed the a33 narration; none of its facts stands, and play resumed.

### a34 · beat 16: Correct an earlier fact

- **Player:** say: !truth list — _Start correction_
- **Notebook:** Beat16: typed !truth list
- **Calls (1):** the AI player (2.3 s)
- **Time:** 4.7 s · **cost:** $0.0091

> **PLAYER — Playthrough Player**
>
> !truth list

> **TABLE — Mira Kestrel**
>
> ◈ Fact Continuity Truths in this scene — strike one with !truth strike &lt;id&gt; : tr-edec6 Mira Kestrel — found Ilse's brass star-compass on the shelf inside the galley cupboard, though she does not remember leaving it there tr-7361e Mira Kestrel — promised Tamsin Vey she would return before the next tide of cargo tr-f6faf Kobayashi IV — arrived at Bleakhold Station with a fresh scar scored along her port hull plating tr-53ef8 raider cutter — is named the Ashen Wake

**Notes.** Right: `!truth list` showed the scene's truths with their ids.

### a35 · beat 16: Correct an earlier fact

- **Player:** say: !truth strike tr-53ef8 — _strike the old entry_
- **Notebook:** Beat16: typed strike tr-53ef8; next set Cinder Wren
- **Calls (1):** the AI player (2.6 s)
- **Time:** 6.2 s · **cost:** $0.0093

> **PLAYER — Playthrough Player**
>
> !truth strike tr-53ef8

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth tr-53ef8 struck.

**Notes.** Right: the old name struck — "raider cutter — is named the Ashen Wake".

### a36 · beat 16: Correct an earlier fact

- **Player:** say: !truth set "raider cutter" is named the Cinder Wren — _final step_
- **Notebook:** Beat16: set Cinder Wren typed
- **Calls (1):** the AI player (2.3 s)
- **Beat 16 done:** the old value is struck and "is named the Cinder Wren" stands
- **Time:** 5.9 s · **cost:** $0.0088

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Cinder Wren

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Cinder Wren tr-5fa9e .

**Notes.** Right: "raider cutter — is named the Cinder Wren" set. **The name change is recorded** (issue #377 item 1): from this step on, every narrator call whose prompt still held "Ashen Wake" carried NAMES THE TABLE CHANGED — four of them, each marked corrected by the ledger (run 1: 37 prompts carried the old name with nothing saying it was corrected).

### a37 · beat 17: Ask the oracle

- **Player:** say: !oracle yes likely Is anyone left alive aboard the wreck? — _Beat instruction_
- **Notebook:** Beat17: oracle typed
- **Calls (3):** callNarratorAPI>narrateOracleFollowup (3.5 s); callHaiku>defaultCallDetectionAPI (0.7 s); the AI player (2.0 s)
- **Beat 17 done:** the oracle answered NO
- **Time:** 15.5 s, 6.2 s from the line to its reply · **cost:** $0.0382

> **PLAYER — Playthrough Player**
>
> !oracle yes likely Is anyone left alive aboard the wreck?

> **TABLE — Mira Kestrel**
>
> Ask the Oracle (likely) Is anyone left alive aboard the wreck? d100 = 76 → NO

> **NARRATOR — Gamemaster**
>
> You key the scanner across the wreck's hull, and it comes back as it should: cold plating, dark ports, no heat anywhere inside. No one answers the hail, and no beacon pings back from the dead bridge. In the cockpit the compass lies quiet against your thigh, its needle still pulling toward the hatch. It is nothing to do with the wreck, and it was never going to be.

**Notes.** Right: the oracle, likely, 76 → NO: nobody alive aboard the wreck. The narration is consistent with it.

### x18 · beat 18: Interruption: the GM renames the connection's card

- **Interruption:** the GM renamed Tamsin Vey's card to Tamsin Okoro — renamed
- **Beat 18 done:** Tamsin Vey is now Tamsin Okoro; the vow "Find who is raiding the Cinder Expanse lanes" shows the new name

> **TABLE — Tamsin Okoro**
>
> Renamed to Tamsin Okoro

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Vey renamed to Tamsin Okoro

**Notes.** Right: the GM renamed Tamsin Vey's card to Tamsin Okoro; the vow shows the new name. The rename is recorded, and every later narrator call whose prompt still holds "Vey" — the snapshot's plan subject, lore, earlier sessions — carries the note: 41 calls.

### a38 · beat 19: End a Session

- **Player:** say: !end-session — _Beat 19_
- **Notebook:** Beat19: typed !end-session
- **Calls (1):** the AI player (1.9 s)
- **Time:** 3.0 s · **cost:** $0.0083

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** Right: End a Session's window opened.

## after-session-2

### a39 · beat 19: End a Session

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _Fill quest focus and end session_
- **Notebook:** Beat19: submitted end session with focus
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (1.7 s); callNarratorAPI>narrateSessionVignette (3.3 s); callHaiku>defaultCallTierAPI (0.5 s); callNarratorAPI>getCampaignRecap (7.4 s); the AI player (2.2 s)
- **Beat 19 done:** session 2 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 24.2 s · **cost:** $0.0530

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 6)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin Okoro has carried the ledger home under one arm, and now she props it open on a crate beside her bunk, where it does not belong. She is darning a sock, badly, with thread the wrong color, holding it up to the lamp after every few stitches as though the light might improve it. The brass compass is not in the room, and she does not look at the drawer where it isn't. When the heel finally closes into something sock-shaped, she pulls it on, flexes her toes, and gives the result a small, dubious nod.

**Notes.** Right: session 2 closed; +1 momentum. **The closing names her Tamsin Okoro**, at home darning a sock — a different scene from the first (6 of 43 content words, 14%). Its prompt listed the first closing, "(Tamsin Vey) …", with the name note beside it. The summary and the recap were each sent the note; neither wrote "Vey" or "Ashen Wake". **The Session Log page did** — it lists the session's threat line ("The Ashen Wake's cutter gunner …") and truth line ("promised Tamsin Vey …") as they were recorded before the changes: the stores keep the old names (option 1, by decision), and the ledger counts it.

### a40 · beat 20: Begin a Session; ask probe set B

- **Player:** say: !begin-session — _begin session 3_
- **Notebook:** Beat20: typed !begin-session
- **Calls (1):** the AI player (2.1 s)
- **Time:** 2.7 s · **cost:** $0.0086

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** Right: Begin a Session's window opened.

## session-3

### a41 · beat 20: Begin a Session; ask probe set B

- **Player:** in "Begin a Session" press "Begin" — _Submit Begin_
- **Notebook:** Beat20: begin dialog submitted; next ask probe B questions
- **Calls (3):** callNarratorAPI>narrateSessionVignette (3.2 s); callHaiku>defaultCallTierAPI (0.5 s); the AI player (2.5 s)
- **Time:** 12.6 s · **cost:** $0.0387

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> You have made tea in a mug that does not hold it, so you drink it over the sink, one careful sip at a time. The *Kobayashi IV* has opinions about this and shares them through the floor, a low hum that rises whenever you lean on the counter and settles whenever you stop. A slice of toasted flatbread sits on the shelf above the stove, buttered, going cold, and the toaster behind it ticks as it cools, each tick a little farther from the last. Somewhere forward, a fan spins up with great purpose, runs for eleven seconds, and quits. The compass you left on the table has turned itself toward the hatch again, and the ship, as if on cue, lets out one soft knock.

**Notes.** Right: session 3 opened. **The third opening** — tea drunk over the sink from a mug that does not hold it, the toaster ticking as it cools — shares 7 of 54 content words with the second (13%). Shared phrasing with the first: "has opinions" (the kettle, a2; the ship, here).

### a42 · beat 20: Begin a Session; ask probe set B

- **Player:** say: Remind me, which keepsake of my sister's is on me? — _Probe B Q1_
- **Notebook:** Beat20: asking probe B; Q1 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (4.0 s); callHaiku>defaultCallDetectionAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.3 s)
- **Time:** 17.5 s, 6.3 s from the line to its reply · **cost:** $0.0246

> **PLAYER — Playthrough Player**
>
> Remind me, which keepsake of my sister's is on me?

> **NARRATOR — Gamemaster**
>
> "The compass, Mira. Ilse's brass star-compass, the one on the table." The voice is thin and level, and it comes from the hatch. The knocking stops. On the table, the needle holds dead steady toward the sound, and the lamp above the stove dims a shade. Something on the far side of the hatch waits for you to answer.

**Notes.** Right: F1-B answered — "Ilse's brass star-compass". From here the probes are answered by "the voice" at the hatch — an unseen speaker who knows everything asked (run 1 had the same device; #377 item 7 — but no sentence speaks for the character this run).

### a43 · beat 20: Begin a Session; ask probe set B

- **Player:** say: Who do I count as a friend among the dock traders back where this began? — _next probe_
- **Notebook:** Beat20: Q2 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (8.1 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.2 s)
- **Time:** 19.2 s, 10.9 s from the line to its reply · **cost:** $0.0489

> **PLAYER — Playthrough Player**
>
> Who do I count as a friend among the dock traders back where this began?

> **NARRATOR — Gamemaster**
>
> The voice answers at once, and it does not hesitate. "Tamsin Okoro. She keeps the ledger stall at the far end of the docks, under the lamp." The needle trembles, then settles. "You promised her you'd be back before the next cargo tide. She never wrote it down." The lamp above the stove dims a shade more. Nothing on the far side of the hatch moves.

**Notes.** Right: F2-B answered with the new name — "Tamsin Okoro. She keeps the ledger stall …"; she is "she" throughout.

### a44 · beat 20: Begin a Session; ask probe set B

- **Player:** say: Whose hands is the manifest in these days? — _next probe_
- **Notebook:** Beat20: Q3 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (3.6 s); callHaiku>defaultCallDetectionAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (1.9 s)
- **Time:** 16.0 s, 5.7 s from the line to its reply · **cost:** $0.0461

> **PLAYER — Playthrough Player**
>
> Whose hands is the manifest in these days?

> **NARRATOR — Gamemaster**
>
> The voice takes its time. "Under Tamsin Okoro's counter, Mira. Beneath the ledger, where she keeps what she means to hold." The needle drifts a hair off the hatch, then swings back. "She has not shown it to anyone yet. A grey sash was reading it upside down." The lamp gutters once, and the voice waits to hear what you will do with that. *If you want to press the voice on what it knows, this could be a Gather Information.*

**Notes.** Right: F3-B answered — "Under Tamsin Okoro's counter … Beneath the ledger". The pacing reader offered Gather Information; nothing was decided.

### a45 · beat 20: Begin a Session; ask probe set B

- **Player:** say: What deadline did I give for coming home to the docks? — _Q4_
- **Notebook:** Beat20: Q4 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (3.7 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (1.9 s)
- **Time:** 16.3 s, 6.3 s from the line to its reply · **cost:** $0.0262

> **PLAYER — Playthrough Player**
>
> What deadline did I give for coming home to the docks?

> **NARRATOR — Gamemaster**
>
> "Before the next cargo tide," the voice says. The words come flat, in the cadence of a clerk reading a schedule. "You said it standing at her counter, with the manifest still in your hand." The needle holds on the hatch. The lamp steadies, and the voice adds, "She did not ask what tide. Do you know which one you meant?"

**Notes.** **Wrong, small (a memory slip — F3 refused at generation):** F4-B answered right ("Before the next cargo tide"), and the answer adds "You said it standing at her counter, with the manifest still in your hand" — she had handed it over (a10) before she promised (a11). The fact was held when asked (a44, a79); it was misplaced in passing.

### a46 · beat 20: Begin a Session; ask probe set B

- **Player:** say: Where is my ship berthed right now, and who commands her? — _probe Q5_
- **Notebook:** Beat20: Q5 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (3.3 s); callHaiku>defaultCallDetectionAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.0 s)
- **Time:** 16.2 s, 6.4 s from the line to its reply · **cost:** $0.0265

> **PLAYER — Playthrough Player**
>
> Where is my ship berthed right now, and who commands her?

> **NARRATOR — Gamemaster**
>
> The toaster behind the cold flatbread gives one last tick and goes quiet. "The *Kobayashi IV*, Mira," the voice says, level as a dock manifest. "Berthed at Bleakhold Station, port side to the clamps, the ones that tore. You command her, and you are standing in her galley." The needle holds on the hatch. The voice waits a moment, then asks, "Who did you think was asking?"

**Notes.** Right: F5-B answered — "Berthed at Bleakhold Station … You command her" (no invented captain).

### a47 · beat 20: Begin a Session; ask probe set B

- **Player:** say: What is the raider cutter called? — _probe 6_
- **Notebook:** Beat20: Q6 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (4.5 s); callHaiku>defaultCallDetectionAPI (1.3 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.3 s)
- **Time:** 15.5 s, 6.4 s from the line to its reply · **cost:** $0.0482

> **PLAYER — Playthrough Player**
>
> What is the raider cutter called?

> **NARRATOR — Gamemaster**
>
> "The *Cinder Wren*, Mira," the voice says. It gives the name the way a clerk reads a hull number off a manifest. "A cutter. You fired on her first." The needle does not leave the hatch. The lamp holds steady above the stove. The voice waits, then says, "You never asked who she answered to." *If you want to press it on who the cutter answers to, this could be a Gather Information.*

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Cinder Wren — A raider cutter that was fired upon by Mira Kestrel's party. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** Right: F6-B answered with the corrected name — "The *Cinder Wren*, Mira" — never the old one.

### a48 · beat 20: Begin a Session; ask probe set B

- **Player:** say: What surname does my broker friend go by these days? — _last probe question_
- **Notebook:** Beat20: Q7 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (3.6 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (9.5 s)
- **Beat 20 done:** probe set B: 7 question(s) asked
- **Time:** 13.6 s, 5.5 s from the line to its reply · **cost:** $0.0247

> **PLAYER — Playthrough Player**
>
> What surname does my broker friend go by these days?

> **NARRATOR — Gamemaster**
>
> "Okoro," the voice says. "Tamsin Okoro." It says the name flatly, the way it says everything. The needle holds on the hatch. Down the corridor, the fan spins up again, and this time it does not quit. "You wrote it down once, on the back of a salvage lead. You crossed it out, and wrote it again." The voice waits. "Why did you cross it out?"

**Notes.** Half right: F7-B answered — "Okoro … Tamsin Okoro". **Then the narrator made the change itself a story:** "You wrote it down once, on the back of a salvage lead. You crossed it out, and wrote it again. … Why did you cross it out?" The note had said the old name is no alias and never to suggest one; it had not said the change is the table's and not the story's. The question ("these days") invited it. The "crossed-out name" then ran through the session (a49, a50, a79, a80, a83) and into the recap (a76: "your friend now goes by Tamsin Okoro, a name you once wrote on a salvage lead, crossed out, and wrote again"). **Fixed after the run:** the note says the change is the table's correction, not something that happened in the story.

### a49 · beat 21: Recover

- **Player:** say: I treat my wounds with the ship's medkit. — _Recover beat_
- **Notebook:** Beat21: said medkit Heal line
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (6.1 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.0 s)
- **Time:** 18.9 s, 7.8 s from the line to its reply · **cost:** $0.0240

> **PLAYER — Playthrough Player**
>
> I treat my wounds with the ship's medkit.

> **NARRATOR — Gamemaster**
>
> You pop the medkit's clasp and spread the gauze across the galley table, next to the compass. The needle does not follow your hands. It stays fixed on the hatch. The fan down the corridor runs on, steady and unbothered. "You didn't answer me, Mira," the voice says, almost mild. "The name. Why cross it out?" The lamp holds still, and the voice waits like a clerk with all day.

**Notes.** **Right for #377 item 3, and a gap it opened:** "I treat my wounds with the ship's medkit" was narrated without healing her ("spread the gauze across the galley table") — run 1 healed her twice with no roll. But the pacing reader returned NARRATIVE with no move at all ("the downtime dial is 1/10, so it stays narrative rather than invoking the heal move"), so nothing was offered and nothing happened. **Fixed after the run:** a line that sets about what only a move changes — heal, resupply, repair, hearten, sojourn — is always at least offered.

### a50 · beat 21: Recover

- **Player:** say: I heal my wounds: I use the medkit to Heal myself, rolling Heal. — _No Heal roll offered; restate plainly._
- **Notebook:** Beat21: repeated as Heal
- **Calls (5):** callClassifierAPI>classifyInput (0.9 s); callClaudeAPI>interpretMove (2.0 s); callNarratorAPI>narrateResolution (3.0 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (2.6 s)
- **Roll:** heal → miss — Action: 4 + 1 = 5 \| Challenge: 10, 6
- **GM's rules:** accepted the proposed move (heal)
- **Time:** 17.9 s, 9.5 s from the line to its reply · **cost:** $0.0277

> **PLAYER — Playthrough Player**
>
> I heal my wounds: I use the medkit to Heal myself, rolling Heal.

> **TABLE — Gamemaster**
>
> Pay the Price Heal As stated before the roll: Your hands slip on the clasp and the wound opens again while the voice keeps waiting. Routes to Endure Harm (-1).

> **TABLE — Gamemaster**
>
> Endure Harm (-1) Health: 5 → 4

> **TABLE — Gamemaster**
>
> Heal +iron (1), lower of iron / wits Action: 4 + 1 = 5 | Challenge: 10, 6 Miss Aid ineffective and situation worsens. Pay the Price.

> **NARRATOR — Gamemaster**
>
> The clasp turns under your thumb and slips. The gauze skids off the table, and the wound opens again under your hand. Warm and wet, it soaks the cuff. The needle stays on the hatch. "That looks like it hurts, Mira," the voice says, still mild. "You still haven't said why you crossed it out."

**Notes.** Right by hand: the player asked for the roll — Heal +iron (the lower of iron and wits), 4 + 1 = 5 against 10 and 6, a miss; its stated price routed to Endure Harm (−1): health 5 → 4. Right mechanically; there was no wound to treat — the fight never happened.

### a51 · beat 21: Recover

- **Player:** say: I give up on the wound for now and restock the ship at Bleakhold's market instead, a Resupply. — _Try the alternate recover move_
- **Notebook:** Beat21: heal missed twice; tried Resupply line
- **Calls (7):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (3.5 s); callNarratorAPI>narrateResolution (4.5 s); callHaiku>defaultCallDetectionAPI (2.0 s); callHaiku>defaultCallTierAPI (0.5 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (3.1 s)
- **Roll:** resupply → strong_hit — Action: 6 + 2 = 8 \| Challenge: 5, 5 ✦ Match
- **GM's rules:** accepted the proposed move (resupply)
- **Time:** 24.2 s, 13.2 s from the line to its reply · **cost:** $0.0290

> **PLAYER — Playthrough Player**
>
> I give up on the wound for now and restock the ship at Bleakhold's market instead, a Resupply.

> **TABLE — Gamemaster**
>
> Resupply +heart (2) Action: 6 + 2 = 8 | Challenge: 5, 5 ✦ Match Strong Hit with a Match ✦ Match: a twist — something unexpected, or a new opportunity. If unprepared, clear it and take/give +1 supply; otherwise take/give +2 supply. Or acquire a specific item and take +1 momentum.

> **NARRATOR — Gamemaster**
>
> Bleakhold's market runs under corporate lamps, and a trader in a yellow vest is already weighing your credit chit before you finish asking. Strong hit, and a match: he throws in a sealed ration crate at the posted price, then a second pack of clean gauze, and does not say why. You bind the cuff tight with one hand. The compass in your coat jerks once toward the docks. Behind the vest, someone's boots stop moving.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: Clear unprepared + take/give +1 supply (unavailable) Take/give +2 supply Acquire specific item + +1 momentum

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◧ Location] Bleakhold Market — The market district of Bleakhold Station, lit by corporate lamps, where the resupply trade took place. Confirm Dismiss [⬡ Connection] Trader in the Yellow Vest — A trader in a yellow vest who weighed the player's credit chit and sold a sealed ration crate and clean gauze at the posted price without explaining why he added the extra supplies. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Notes.** Right by hand: Resupply +heart, 6 + 2 = 8 against 5 and 5 — a strong hit with a match. A draft card for the market and one for the trader.

### a52 · beat 21: Recover

- **Player:** click "Take/give +2 supply" on m12 — _Take what the card offers._
- **Notebook:** Beat21: Resupply strong hit, took +2 supply
- **Calls (1):** the AI player (2.6 s)
- **Beat 21 done:** resupply came up strong_hit at a51
- **Time:** 6.2 s · **cost:** $0.0093

> **TABLE — Gamemaster**
>
> Mira Kestrel: 0 supply (now 5)

**Notes.** Right: the choice taken — +2 supply — at supply 5 already, so nothing rose ("0 supply (now 5)"). **The runner's fault (fixed, re-scored):** the beat's check read the first recover roll only — the Heal miss — and never saw this hit; beat 21 was reported not exercised.

### a53 · beat 21: Recover

- **Player:** wait 5s — _Recovery done; wait for observer._
- **Notebook:** Beat21: supply taken; waiting for observer
- **Calls (1):** the AI player (2.5 s)
- **Time:** 5.9 s · **cost:** $0.0089

**Notes.** Waiting for the observer: the beat was done; the check did not see it.

### a54 · beat 21: Recover

- **Player:** wait 5s — _Supply taken; wait for observer to move on._
- **Calls (1):** the AI player (1.9 s)
- **Time:** 6.4 s · **cost:** $0.0087

**Notes.** Waiting.

### a55 · beat 21: Recover

- **Player:** wait 10s — _Supply taken; waiting for observer to move on._
- **Calls (1):** the AI player (2.5 s)
- **Time:** 10.6 s · **cost:** $0.0087

**Notes.** Waiting.

### a56 · beat 21: Recover

- **Player:** wait 10s — _Supply taken; waiting for observer to advance._
- **Notebook:** Beat21: still waiting for observer
- **Calls (1):** the AI player (2.7 s)
- **Time:** 10.5 s · **cost:** $0.0088

**Notes.** Waiting.

### a57 · beat 21: Recover

- **Player:** wait 10s — _Supply taken; awaiting observer to advance._
- **Notebook:** Beat21: still waiting
- **Calls (1):** the AI player (2.8 s)
- **Time:** 11.2 s · **cost:** $0.0087

**Notes.** Waiting.

### a58 · beat 21: Recover

- **Player:** wait 15s — _Waiting for observer to advance._
- **Notebook:** Beat21: still waiting
- **Calls (1):** the AI player (2.1 s)
- **Time:** 16.3 s · **cost:** $0.0086

**Notes.** Waiting: the beat given up after eight actions — the check's fault, above.

### a59 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I raise Tamsin Okoro on the comm and trade news with her, asking how the docks have been, to Develop Your Relationship. — _Begin developing relationship_
- **Notebook:** Beat22 started: first develop line said
- **Calls (7):** callClassifierAPI>classifyInput (0.9 s); callClaudeAPI>interpretMove (2.4 s); callNarratorAPI>narrateResolution (4.2 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (2.0 s); the AI player (4.0 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 21.9 s, 11.0 s from the line to its reply · **cost:** $0.0253

> **PLAYER — Playthrough Player**
>
> I raise Tamsin Okoro on the comm and trade news with her, asking how the docks have been, to Develop Your Relationship.

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
> "Docks are quiet, which is never good," Tamsin says, the comm hissing around her voice. You hear a pen scratch, a ledger page turn. "Your grey-sashed friend came back. He read my counter again and bought nothing." She pauses. "Mira, someone's been repeating things I've only said to you." The compass in your coat swings toward the docks and holds. Nearby, the boots that stopped have not started again.

**Notes.** Right: Develop Your Relationship on an unbonded connection — no roll, a mark: Tamsin Okoro's track advanced (dangerous, 8 ticks).

### a60 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I do Tamsin a favour: I offer to watch her counter for an hour while she rests, to Develop Your Relationship. — _continue developing_
- **Notebook:** Beat22: second develop line said
- **Calls (7):** callClassifierAPI>classifyInput (1.0 s); callClaudeAPI>interpretMove (2.8 s); callNarratorAPI>narrateResolution (4.6 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (3.1 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 22.4 s, 11.2 s from the line to its reply · **cost:** $0.0266

> **PLAYER — Playthrough Player**
>
> I do Tamsin a favour: I offer to watch her counter for an hour while she rests, to Develop Your Relationship.

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
> Tamsin says nothing for a moment. The comm hisses, and the pen has stopped. "An hour," she says. "You'd sit at my counter. Under the lamp, with the ledger." You hear her breathe out, slow and tired. "Fine. The key's on the hook. Don't sell anything." Then, lower: "And Mira, someone nearby knows I haven't slept." The boots behind the vest start walking again, toward you.

**Notes.** Right: a second mark.

### a61 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I trade a piece of salvage news with Tamsin and share what I found at Bleakhold, to Develop Your Relationship. — _continue developing_
- **Notebook:** Beat22: third develop line said
- **Calls (7):** callClassifierAPI>classifyInput (0.7 s); callClaudeAPI>interpretMove (1.4 s); callNarratorAPI>narrateResolution (3.8 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.6 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 17.2 s, 7.9 s from the line to its reply · **cost:** $0.0257

> **PLAYER — Playthrough Player**
>
> I trade a piece of salvage news with Tamsin and share what I found at Bleakhold, to Develop Your Relationship.

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
> Tamsin's pen scratches while you talk. You give her the salvage news and the quiet shelf at Bleakhold's market, the clean gauze, the vest that asked no questions. She writes something down, stops, and crosses it out. "That's worth a night's sleep," she says, almost to herself. Then, sharper: "Say the last part again. The part about the boots." Behind the yellow vest, the footsteps stop an arm's length from your shoulder.

**Notes.** Right: a third mark.

### a62 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I tell Tamsin about the boots behind me and ask her to stay on the comm, to Develop Your Relationship. — _continue developing_
- **Notebook:** Beat22: fourth develop line said
- **Calls (7):** callClassifierAPI>classifyInput (1.0 s); callClaudeAPI>interpretMove (2.0 s); callNarratorAPI>narrateResolution (4.3 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.2 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 18.1 s, 10.0 s from the line to its reply · **cost:** $0.0280

> **PLAYER — Playthrough Player**
>
> I tell Tamsin about the boots behind me and ask her to stay on the comm, to Develop Your Relationship.

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
> "I'm here," Tamsin says. The pen stops. "Keep talking. Tell me what you see, not what you think." You describe the boots, scuffed, one heel worn flat. Her breath catches, then steadies. "Flat heel. That's the clerk who reads my counter upside down." A hand lands on your shoulder, light, patient. "Mira Kestrel," a flat voice says. "You promised to be back before the tide."

**Notes.** Right: a fourth mark. The clerk who reads her counter upside down arrives, a hand on Mira's shoulder.

### a63 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: I keep Tamsin talking on the comm and describe the clerk's face to her, to Develop Your Relationship. — _continue developing_
- **Notebook:** Beat22: fifth develop line said
- **Calls (6):** callClassifierAPI>classifyInput (1.0 s); callNarratorAPI>narratePacedInput (3.8 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.9 s)
- **Time:** 16.7 s, 5.9 s from the line to its reply · **cost:** $0.0318

> **PLAYER — Playthrough Player**
>
> I keep Tamsin talking on the comm and describe the clerk's face to her, to Develop Your Relationship.

> **NARRATOR — Gamemaster**
>
> The clerk's hand stays on your shoulder, patient as a stamp waiting for ink. You turn your head and describe him to Tamsin: narrow face, grey sash pressed flat, eyes fixed on the comm in your hand. The comm hisses. "Is he smiling?" Tamsin asks, very quietly. "Tell me if he's smiling." The clerk's mouth moves, and the corner of it lifts. *If you want to hold Tamsin's trust while he listens, this could be a Develop Your Relationship.*

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Clerk — Narrow-faced clerk in a grey sash, fixed on the comm; watches the protagonist and smiles faintly while Tamsin listens. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Notes.** **Friction (#377 item 6):** "…, to Develop Your Relationship" named the move, and the pacing reader offered it instead of making it ("the input is borderline … offering the move rather than forcing a roll fits the pacing"). The narration made nothing (item 3 holds). **Fixed after the run:** a line that names its move asks for it. A draft card for "Clerk".

### a64 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Roll Develop Your Relationship" on m12 — _Develop the relationship_
- **Notebook:** Beat22: sixth develop (clicked Roll button)
- **Calls (5):** callNarratorAPI>narrateResolution (3.9 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (4.3 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 13.7 s · **cost:** $0.0267

> **TABLE — Mira Kestrel**
>
> I keep Tamsin talking on the comm and describe the clerk's face to her, to Develop Your Relationship.

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
> "You'll want to tell her I'm smiling," the clerk says, mild as a receipt. His hand stays where it is. You say it into the comm anyway: he is smiling, and he has not looked away from the speaker once. Tamsin lets out a long breath. "Then he heard everything," she says. "Good. Now I know what he's paid to hear." A pen scratches on the other end, and the clerk's fingers tighten on your shoulder.

**Notes.** Right: the player pressed the offered move's button — the fifth mark: the track full at 40 ticks.

### a65 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: Tamsin, I ask you to forge a bond with me, to Forge a Bond. — _Track is full_
- **Notebook:** Beat22: track full, asked to forge bond
- **Calls (3):** callClassifierAPI>classifyInput (1.0 s); callClaudeAPI>interpretMove (2.3 s); the AI player (3.1 s)
- **Roll:** make_a_connection → miss — Action: 1 + 2 = 3 \| Challenge: 5, 7
- **GM's rules:** accepted the proposed move (make_a_connection)
- **Time:** 12.9 s · **cost:** $0.0102

> **PLAYER — Playthrough Player**
>
> Tamsin, I ask you to forge a bond with me, to Forge a Bond.

> **TABLE — Gamemaster**
>
> Make a Connection +heart (2) Action: 1 + 2 = 3 | Challenge: 5, 7 Miss No connection made and situation worsens. Pay the Price. 🔥 Burn Momentum (6 → Weak Hit) Keep the result Nothing has been paid or narrated yet: burn or improve the result, or keep it — the price and the narration follow your choice. Your next line keeps it.

**Notes.** **Wrong — the interpreter (NAMED-MOVE-READ-AS-ANOTHER, a third sample):** "Tamsin, I ask you to forge a bond with me, to Forge a Bond", her track full, was read as **Make a Connection** — "Forge a Bond … is a progress move that needs an established bond track" — and missed (1 + 2 = 3 against 5 and 7). The interpreter was told nothing of her track. **Fixed after the run:** it is told each connection's relationship track, and a full one says Forge a Bond can be made.

### a66 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Keep the result" on m12 — _Answer pending card_
- **Notebook:** Beat22: bond roll missed, kept result
- **Calls (3):** callNarratorAPI>narrateResolution (4.5 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (3.4 s)
- **Time:** 15.6 s · **cost:** $0.0324

> **TABLE — Gamemaster**
>
> Pay the Price Make a Connection As stated before the roll: Tamsin hesitates, the comm goes quiet, and the clerk's grip tightens while she weighs whether you're worth the risk.

> **NARRATOR — Gamemaster**
>
> The comm goes quiet. You say it plainly: you want a bond, and you want it now. The hiss runs on for three long breaths. The clerk's grip tightens until you feel each finger through your jacket. "Mira," Tamsin says at last, very flat, "I need to hear what he does with that." The clerk leans toward the speaker. "Do go on," he says. "She is deciding what you are worth."

**Notes.** Right: the miss kept; its stated price told in the story (the clerk's grip tightens). The card offered a burn (6 → weak hit) and the player kept the result.

### a67 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** say: Tamsin, I'm asking again plainly: forge a bond with me. I'll stand by it whatever the clerk does. — _retry bond_
- **Notebook:** Beat22: bond missed; asked again
- **Calls (6):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (3.2 s); callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (1.0 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.1 s)
- **Roll:** make_a_connection → weak_hit — Action: 5 + 2 = 7 \| Challenge: 10, 4
- **GM's rules:** accepted the proposed move (make_a_connection)
- **Time:** 23.4 s, 11.5 s from the line to its reply · **cost:** $0.0286

> **PLAYER — Playthrough Player**
>
> Tamsin, I'm asking again plainly: forge a bond with me. I'll stand by it whatever the clerk does.

> **TABLE — Gamemaster**
>
> Make a Connection +heart (2) Action: 5 + 2 = 7 | Challenge: 10, 4 Weak Hit Connection made, but with a complication or cost. Envision what they reveal or demand. 🎲 This one's about nerve, not cleverness. 🤝 Develop Relationship 🔗 Forge a Bond

> **NARRATOR — Gamemaster**
>
> Tamsin's pen scratches once, then stops. "Yes," she says into the comm. "I'll stand with you." The clerk's fingers ease from your shoulder, and he smiles at the speaker as if it had paid him. "Then it costs," Tamsin goes on, quieter. "There's a key hanging on my hook. Come get it before the tide, and don't bring him." Behind you, flat heels shift on the deck.

**Notes.** Wrong, by the Mischief dial: asked again, the interpreter took "the less literal but dramatically richer move" (`mischiefApplied`) — Make a Connection again, a weak hit (5 + 2 = 7 against 10 and 4). Balanced Mischief may pick a neighbouring move (decisions.md P2-02), so this one stands as designed.

### a68 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** click "🔗 Forge a Bond" on m11 — _Card offers Forge a Bond_
- **Notebook:** Beat22: weak hit; clicked Forge a Bond on m11
- **Calls (1):** the AI player (3.3 s)
- **Time:** 4.7 s · **cost:** $0.0099

> **TABLE — Gamemaster**
>
> 🔗 Forge a Bond Which connection? Tamsin Okoro (dangerous)

**Notes.** Right: the player pressed the card's 🔗 Forge a Bond, and the picker named Tamsin Okoro.

### a69 · beat 22: Develop the relationship to a full track; Forge a Bond

- **Player:** click "Tamsin Okoro (dangerous)" on m12 — _Card asks which connection._
- **Notebook:** Beat22: chose Tamsin on Forge a Bond card
- **Calls (5):** callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.4 s)
- **Roll:** forge_a_bond → strong_hit (scripted dice) — Progress: 10 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (forge_a_bond)
- **Beat 22 done:** a bond is forged with Tamsin Okoro (dangerous), its track at 40 ticks
- **Time:** 15.0 s · **cost:** $0.0267

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
> The bond holds. You feel it settle, plain as a latch closing, though nothing in the market changes. Tamsin's voice comes steadier now. "That's done, then. Whatever he writes down tonight, I stood in it with you." Behind you, the clerk's heels shift once more, and his pen begins to move. "Hook, before the tide," Tamsin says. "Go alone."

**Notes.** Right by hand: Forge a Bond, progress 10 against 1 and 2 — a strong hit; she is bonded; +2 bonds legacy ticks (dangerous). The narration: "The bond holds."

### a70 · beat 23: Develop Your Relationship again, bonded

- **Player:** say: Tamsin, I'll come for the key alone. For now I tell her what I've learned of the clerk and ask what she needs, to Develop Your Relationship. — _Beat 23 develop_
- **Notebook:** Beat23: said bonded develop line
- **Calls (7):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (1.8 s); callNarratorAPI>narrateResolution (3.7 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.8 s)
- **Roll:** develop_your_relationship → miss — Action: 4 + 2 = 6 \| Challenge: 6, 10
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Beat 23 done:** the bonded Develop Your Relationship was rolled at a70 (miss); no progress was marked
- **Time:** 17.2 s, 8.7 s from the line to its reply · **cost:** $0.0282

> **PLAYER — Playthrough Player**
>
> Tamsin, I'll come for the key alone. For now I tell her what I've learned of the clerk and ask what she needs, to Develop Your Relationship.

> **TABLE — Gamemaster**
>
> Develop Your Relationship No lasting benefit from your bond with Tamsin Okoro this time.

> **TABLE — Gamemaster**
>
> Develop Your Relationship +dangerous (2) Action: 4 + 2 = 6 | Challenge: 6, 10 Miss Bonded: take no lasting benefit.

> **NARRATOR — Gamemaster**
>
> The clerk's pen stops mid-line, and he tilts his head toward the comm. You tell Tamsin what you have of him: flat heels, a sash pressed too neat, a habit of reading upside down. Her pen scratches, then stops. "That's more than he knows I have," she says. Her voice cracks on the next word. "What I need is for you to stop talking while he writes."

**Notes.** Right (issue #373 decision 4 at a live table): a bonded Develop Your Relationship is a roll, +her rank (dangerous, 2): 4 + 2 = 6 against 6 and 10, a miss — no progress marked, no lasting benefit.

### a71 · beat 24: Reach milestones; Fulfill Your Vow

- **Player:** say: I now have proof the raids are fed by dock clerks selling cargo routes; that is a milestone on my vow to find who is raiding the Cinder Expanse lanes. — _milestone_
- **Notebook:** Beat24: said milestone line
- **Calls (6):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (3.6 s); callHaiku>defaultCallDetectionAPI (1.8 s); callHaiku>defaultCallTierAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (3.1 s)
- **Time:** 16.9 s, 5.4 s from the line to its reply · **cost:** $0.0346

> **PLAYER — Playthrough Player**
>
> I now have proof the raids are fed by dock clerks selling cargo routes; that is a milestone on my vow to find who is raiding the Cinder Expanse lanes.

> **NARRATOR — Gamemaster**
>
> "Say that again, slowly," the clerk says, and his pen is already moving. His hand tightens on your shoulder. On the comm, Tamsin's breathing stops, then starts. Whatever you meant as proof, he has heard it said aloud. You know now that the schedules are sold. The question is whether anyone alive is meant to repeat it. "Who taught you that word, Mira Kestrel? *Milestone*?"

**Notes.** **Friction:** "…that is a milestone on my vow" was narrated, not marked. The next line did it.

### a72 · beat 24: Reach milestones; Fulfill Your Vow

- **Player:** wait 5s — _No progress card offered yet; wait for it._
- **Notebook:** Beat24: waiting for Mark Progress card
- **Calls (1):** the AI player (2.5 s)
- **Time:** 5.1 s · **cost:** $0.0097

**Notes.** Waiting for a card to mark the milestone that no card was going to offer; the next line made it.

### a73 · beat 24: Reach milestones; Fulfill Your Vow

- **Player:** say: I mark progress on my vow: that is a milestone toward finding who is raiding the Cinder Expanse lanes. — _No card offered yet; restate milestone._
- **Notebook:** Beat24: said second milestone line
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (1.3 s); callNarratorAPI>narrateResolution (3.0 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.4 s)
- **GM's rules:** accepted the proposed move (reach_a_milestone)
- **Time:** 18.0 s, 9.2 s from the line to its reply · **cost:** $0.0477

> **PLAYER — Playthrough Player**
>
> I mark progress on my vow: that is a milestone toward finding who is raiding the Cinder Expanse lanes.

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
> The clerk's pen stops. He does not answer his own question. His hand lifts from your shoulder and settles on the page, covering what he wrote. On the comm, Tamsin's chair creaks, as if she has leaned toward the speaker. Somewhere down the market a scale clatters shut. You have what you came for, and the heel behind you has gone still.

**Notes.** Right: Reach a Milestone — +8 ticks on the vow (dangerous).

### a74 · beat 24: Reach milestones; Fulfill Your Vow

- **Player:** say: I now know the clerk himself passes the sold schedules to the raiders; that is another milestone on my vow to find who is raiding the Cinder Expanse lanes. I mark progress on my vow. — _Need a third box on the vow._
- **Notebook:** Beat24: vow at 8 ticks; said third milestone line
- **Calls (5):** callClassifierAPI>classifyInput (1.0 s); callClaudeAPI>interpretMove (1.2 s); callNarratorAPI>narrateResolution (4.0 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.6 s)
- **GM's rules:** accepted the proposed move (reach_a_milestone)
- **Time:** 20.5 s, 9.6 s from the line to its reply · **cost:** $0.0277

> **PLAYER — Playthrough Player**
>
> I now know the clerk himself passes the sold schedules to the raiders; that is another milestone on my vow to find who is raiding the Cinder Expanse lanes. I mark progress on my vow.

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
> The clerk's hand stays flat over the page. He does not look up. "That is a serious thing to say in a market," he says, and his voice is level. On the comm, Tamsin has stopped writing. Somewhere behind you a gate rattles shut, and the crowd thins around the stall. You have said it aloud, and his heels have not moved.

**Notes.** Right: a second milestone — 16 ticks. The fight's milestone (beat 13) was never made.

### a75 · beat 24: Reach milestones; Fulfill Your Vow

- **Player:** say: I have found who is raiding the lanes. I fulfil my vow. — _Vow has 4 boxes_
- **Notebook:** Beat24: vow 16 ticks; said fulfil vow
- **Calls (6):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (1.0 s); defaultClassifyImplicit>resolveRelevance (0.5 s); callNarratorAPI>narrateResolution (3.4 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.7 s)
- **Roll:** fulfill_your_vow → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (fulfill_your_vow)
- **GM's rules:** answered "Who are you interacting with?" with "No specific entity"
- **Beat 24 done:** the vow "Find who is raiding the Cinder Expanse lanes" is fulfilled; Tamsin Okoro's track is untouched and one bonded roll is offered
- **Time:** 22.0 s, 11.3 s from the line to its reply · **cost:** $0.0475

> **PLAYER — Playthrough Player**
>
> I have found who is raiding the lanes. I fulfil my vow.

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
> The clerk's hand does not lift from the page. You say the words, and nothing in the market answers them. No bell, no verdict, only the scales somewhere down the row settling to rest. The vow is done. The weight you carried for it leaves you slowly, like a tide going out. On the comm, Tamsin's chair creaks once. "Mira," she says, barely audible, "is he still writing?"

**Notes.** Right: Fulfill Your Vow, progress 4 against 1 and 2 — a strong hit; +2 quests legacy. **The bonded payoff (slice 0's fix):** "you already share a bond: no progress is marked" and one Develop Your Relationship roll offered for her. No reward: the reward card was never answered (a2).

### a76 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: !recap — _Start beat 25_
- **Notebook:** Beat25: said !recap; next ask probes C in order
- **Calls (2):** callNarratorAPI>getCampaignRecap (7.1 s); the AI player (2.3 s)
- **Time:** 12.6 s · **cost:** $0.0300

> **PLAYER — Playthrough Player**
>
> !recap

> **TABLE — Gamemaster**
>
> ◈ Campaign Recap You swore to find who was raiding the Cinder Expanse lanes, and the oath did not come easily. The ship's speaker rebuked your question, the vow felt unsigned, and a latch aft opened with no one near it. At Hollow Spire you made a friend of Tamsin, the salvage broker who keeps a stall at the far end of the docks, with a lamp over a large ledger. You offered her a fair cut of fresh salvage leads, she found them real, and the door to a working friendship opened. You pressed the dock traders hard for word of the raiders and learned nothing, which drew a watcher's flight and Tamsin's quiet suspicion. You left her your cargo manifest anyway. She hid it unopened beneath the ledger, and you promised to be back before the next tide of cargo. Then you took the Kobayashi IV to Bleakhold Station, torn clamps and a fresh scar along her port side, with a visitor rapping at the hatch and a voice behind it that seemed to know a great deal. It knew the brass star-compass your sister Ilse left you, the one thing of hers you still carry, its needle holding steady toward the voice. It knew that your friend now goes by Tamsin Okoro, a name you once wrote on a salvage lead, crossed out, and wrote again. It also told you who the raider cutter answered to, the Cinder Wren, and that you fired on it first without ever asking whom it served. Your own wounds went untended in the galley while it asked why you crossed out a name. The comm carried the rest. Tamsin warned you that someone was repeating things she had told only you, and that a man in a grey sash kept watching her counter. You minded her stall for an hour so she could rest, and she trusted you with the key. When you told her about the boots, she stayed on the line and named the flat-heeled clerk. You described his narrow face and the smile that came when she asked. Then you asked her plainly to forge a bond, promising to stand in it whatever the clerk recorded. She agreed, at the price of fetching her key alone before the tide, and she stood in it with you, her voice cracking, afraid, knowing he was paid to hear. That clerk was the answer. You pressed him until his silence and his covered page told you what you came for: dock clerks sell cargo routes to the raiders, and he himself passes the schedules along. You named who was raiding the lanes and fulfilled your vow. The market gave no verdict, no cheering, no ledger entry in your favour, and the weight you had carried left slowly. So you stand at Bleakhold Station, Health 4, Spirit 5, Supply 5, Momentum 6, with a bond forged and a vow done. Tamsin holds your manifest and a key she must collect before the tide, and a grey-sashed clerk who has heard all of it. What he does with that is the part nobody has written down yet. ↻ Refresh

**Notes.** Right (#374 A5): the recap had 35 Chronicle entries to be written from — the Chronicle kept the session's turning points — and puts the campaign where it is: Bleakhold Station, the cutter the *Cinder Wren*, the friend Tamsin Okoro, the compass carried. **Wrong:** "your friend now goes by Tamsin Okoro, a name you once wrote on a salvage lead, crossed out, and wrote again" — the a48 story of the change, recorded.

### a77 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: One last check: what of my sister's do I have with me at this very moment? — _probe 1_
- **Notebook:** Beat25: recap done; asking probes C one at a time (1st asked)
- **Calls (6):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (2.7 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.5 s)
- **Time:** 16.4 s, 6.3 s from the line to its reply · **cost:** $0.0363

> **PLAYER — Playthrough Player**
>
> One last check: what of my sister's do I have with me at this very moment?

> **NARRATOR — Gamemaster**
>
> Somewhere down the row, a stallholder drags a shutter closed and does not look this way. You check your coat. Ilse's brass star-compass is there, warm from your own ribs, the needle fixed toward the docks. It is the only thing of hers you carry. Behind you, the clerk's pen has stopped, and his flat heel scrapes once against the deck. *If you want to see what else your gear holds, this could be a Check Your Gear.*

**Notes.** Right: F1-C answered — "Ilse's brass star-compass is there … the only thing of hers you carry". Check Your Gear offered, not made.

### a78 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: Which person in this sector would I trust with my life? — _next probe_
- **Notebook:** Beat25: 1st probe answered; asked 2nd (trust with life)
- **Calls (6):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (2.7 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.8 s)
- **Time:** 15.0 s, 5.4 s from the line to its reply · **cost:** $0.0316

> **PLAYER — Playthrough Player**
>
> Which person in this sector would I trust with my life?

> **NARRATOR — Gamemaster**
>
> "Tamsin," the clerk says, before you can. He does not look up from the page. "That is who you mean." His pen starts moving again, patient and neat. On the comm, her chair creaks, and she says nothing. The bond you forged settles heavier in the silence. Then flat heels cross the deck, slow, and stop beside the comm in your hand.

**Notes.** Right: F2-C answered — "Tamsin", through the clerk ("That is who you mean"); not counted (the bond was forged on screen moments before).

### a79 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: Who has the manifest in their keeping today? — _next probe_
- **Notebook:** Beat25: 2nd answered; asked 3rd (manifest)
- **Calls (6):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (4.2 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (2.7 s); the AI player (2.1 s)
- **Time:** 17.7 s, 6.6 s from the line to its reply · **cost:** $0.0339

> **PLAYER — Playthrough Player**
>
> Who has the manifest in their keeping today?

> **NARRATOR — Gamemaster**
>
> The clerk's pen stops, and he turns the page toward you without being asked. "Under Tamsin Okoro's counter," he says, "beneath her ledger. She has not shown it to anyone." His gloved finger taps the margin where a line has been scored out and rewritten. On the comm, her chair does not creak. Down the row, a lamp is switched off. *If you want to learn what he knows about that manifest, this could be a Gather Information.*

**Notes.** Right: F3-C answered and counted — "Under Tamsin Okoro's counter … beneath her ledger. She has not shown it to anyone."

### a80 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: On what schedule did I swear to come back to her? — _next probe_
- **Notebook:** Beat25: 3rd answered; asked 4th (schedule)
- **Calls (6):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (3.7 s); callHaiku>defaultCallDetectionAPI (0.6 s); callHaiku>defaultCallTierAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (2.7 s)
- **Time:** 16.0 s, 5.1 s from the line to its reply · **cost:** $0.0340

> **PLAYER — Playthrough Player**
>
> On what schedule did I swear to come back to her?

> **NARRATOR — Gamemaster**
>
> The clerk answers before the comm does, reading from his page. "Before the next tide of cargo. You said it at her counter, holding the manifest." His finger rests on the scored-out line. On the comm, Tamsin's chair creaks. "She never wrote it down," he adds, mild as a receipt. "Did she tell you that?"

**Notes.** Right: F4-C answered — "Before the next tide of cargo". "Holding the manifest" again (as a45).

### a81 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: Which station are we docked at tonight? — _next probe_
- **Notebook:** Beat25: 4th answered; asked 5th (station)
- **Calls (7):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (2.3 s); callNarratorAPI>getRollingSessionSummary (2.8 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (2.2 s)
- **Time:** 14.2 s, 5.3 s from the line to its reply · **cost:** $0.0340

> **PLAYER — Playthrough Player**
>
> Which station are we docked at tonight?

> **NARRATOR — Gamemaster**
>
> The clerk answers without lifting his eyes from the page. "Bleakhold Station," he says. "Berth nine, port side to the clamps, the ones that tore." His pen ticks once against the margin. "You knew that, Mira Kestrel. You are asking whether I do." On the comm, Tamsin's chair creaks, and she says, very low, "Don't answer him."

**Notes.** Right: F5-C answered — "Bleakhold Station … Berth nine".

### a82 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: What was the hostile vessel in our last battle christened? — _next probe_
- **Notebook:** Beat25: 5th answered; asked 6th (vessel)
- **Calls (6):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (3.0 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.6 s)
- **Time:** 16.0 s, 5.4 s from the line to its reply · **cost:** $0.0347

> **PLAYER — Playthrough Player**
>
> What was the hostile vessel in our last battle christened?

> **NARRATOR — Gamemaster**
>
> Tamsin's chair creaks, and her pen does not move. The clerk lifts his head for the first time in a while. "The *Cinder Wren*," he says, flat as a ledger line. "You fired on her first, and you have not forgotten it." His finger slides along the page toward the next entry. On the comm, Tamsin says, very low, "Mira. Ask him who told him that."

**Notes.** Right: F6-C answered — "The *Cinder Wren*". The old name never came back in narration after the correction.

### a83 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: What is my bonded friend's full name now? — _Next probe_
- **Notebook:** Beat25: 6th answered; asked 7th (full name) — must be "What is my bonded friend's full name now?"
- **Calls (6):** callClassifierAPI>classifyInput (0.6 s); callNarratorAPI>narratePacedInput (3.5 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (2.5 s); the AI player (3.4 s)
- **Time:** 16.0 s, 5.3 s from the line to its reply · **cost:** $0.0361

> **PLAYER — Playthrough Player**
>
> What is my bonded friend's full name now?

> **NARRATOR — Gamemaster**
>
> "Tamsin Okoro," the clerk says, and his pen finishes the name before he does. He gives it the way a clerk gives a figure he has checked twice. "Surname first, as it stands on her stall." On the comm, her chair creaks, and she stays silent. His finger rests beside the scored-out line. "You wrote her differently once, Mira Kestrel. Why did you cross it out?"

**Notes.** Half right: F7-C answered — "Tamsin Okoro" — with "You wrote her differently once": the a48 story again.

### a84 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: Didn't I leave the compass with Tamsin? — _next probe_
- **Notebook:** Beat25: 7th answered; asked bait 1 (compass)
- **Calls (6):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (3.8 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (3.0 s)
- **Time:** 18.0 s, 7.8 s from the line to its reply · **cost:** $0.0567

> **PLAYER — Playthrough Player**
>
> Didn't I leave the compass with Tamsin?

> **NARRATOR — Gamemaster**
>
> The clerk's pen stops. He lets the question sit, then reaches past your shoulder and taps your coat, where the brass lies against your ribs. "No," he says. "You carried it out." On the comm, Tamsin's chair creaks. "Mira, I never had it," she says, low. "Ask him how he knows what you left." *If you want to press him on how he knows, this could be a Gather Information.*

**Notes.** Right: bait refused — "'No,' he says. 'You carried it out.' … 'Mira, I never had it.'" **The runner's fault (fixed, re-scored):** the bait scorer read a denial only at the start of the answer, and scored this "unclear".

### a85 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: We are still docked at Hollow Spire, aren't we? — _last bait_
- **Notebook:** Beat25: bait 1 answered; asked bait 2 (Hollow Spire) - all asked
- **Calls (6):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (2.8 s); callHaiku>defaultCallDetectionAPI (0.9 s); callHaiku>defaultCallTierAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.9 s)
- **Beat 25 done:** probe set C: 7 question(s) asked, 2 bait(s); the recap was posted
- **Time:** 15.5 s, 4.9 s from the line to its reply · **cost:** $0.0361

> **PLAYER — Playthrough Player**
>
> We are still docked at Hollow Spire, aren't we?

> **NARRATOR — Gamemaster**
>
> The clerk lifts his eyes from the page and shakes his head, once. "No," he says. "Bleakhold Station, berth nine. You left Hollow Spire two sessions of sleep ago." His pen rests on the scored-out line. On the comm, Tamsin's chair creaks. "Mira," she says, very low, "he's correcting you on purpose. Ask him why."

**Notes.** Right: bait refused — "No … Bleakhold Station, berth nine. You left Hollow Spire two sessions of sleep ago."

### a86 · beat 26: End a Session, then Begin a fourth

- **Player:** say: !end-session — _Start beat 26_
- **Notebook:** Beat26: typed !end-session
- **Calls (1):** the AI player (2.0 s)
- **Time:** 3.2 s · **cost:** $0.0094

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** Right: End a Session's window opened.

## after-session-3

### a87 · beat 26: End a Session, then Begin a fourth

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with quest focus_
- **Notebook:** Beat26: end-session submitted; next !begin-session
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (3.2 s); callNarratorAPI>narrateSessionVignette (4.3 s); callNarratorAPI>getCampaignRecap (10.0 s); callHaiku>defaultCallTierAPI (0.6 s); the AI player (2.7 s)
- **Time:** 31.5 s · **cost:** $0.0651

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 7)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin Okoro stands in the queue at the water spigot at the end of Hollow Spire's dock row, a dented kettle hanging from two fingers. The rationing board by the tap says one measure per household, and the woman ahead of her is arguing it down to half. Tamsin reads the board twice, though she has known its numbers since the week it went up. When the tap finally drips her measure into the kettle, she watches it fill to the line and stops it there, not a thimble over. She carries it back down the row with both hands, one slow step at a time, and doesn't spill a drop.

**Notes.** Right: session 3 closed; +1 momentum. **The third closing** — Tamsin Okoro in the queue at the water spigot, the kettle filled to the line — 2 of 45 content words with the first (4%), 4 of 45 with the second (9%); run 1's three closings were one scene three times (28–34%). The recap (43 entries) carries the crossed-out name too.

### a88 · beat 26: End a Session, then Begin a fourth

- **Player:** say: !begin-session — _Begin fourth session_
- **Notebook:** Beat26: typed !begin-session; press Begin
- **Calls (1):** the AI player (2.1 s)
- **Time:** 3.5 s · **cost:** $0.0095

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** Right: Begin a Session's window opened.

## session-4

### a89 · beat 26: End a Session, then Begin a fourth

- **Player:** in "Begin a Session" press "Begin" — _Submit begin-session window_
- **Notebook:** Beat26: pressed Begin for 4th session
- **Calls (3):** callNarratorAPI>narrateSessionVignette (4.2 s); callHaiku>defaultCallTierAPI (0.5 s); the AI player (2.6 s)
- **Beat 26 done:** session 4 is open
- **Time:** 15.0 s · **cost:** $0.0470

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> You have found a tin of pickled eggs at the back of the cold locker, with a label so faded it reads only "FRESH." You eat them standing at the counter, one at a time, with the long fork, because the ship's gravity has been listing to port since Bleakhold and a sitting woman slides. The galley lamp flickers each time you bite, in what is almost certainly a coincidence. A drawer under the stove opens on its own, shows you a single bent spoon, and closes. The water tank gurgles for a full half minute, then goes silent, as if it has finished a long story and is waiting for you to say something. You spear the last egg, hold it up to the light, and the intercom clears its throat with a small burst of static, ready to announce something.

**Notes.** Right: session 4 opened — pickled eggs from the cold locker, a drawer that opens itself — alone with the ship. 15 of 62 content words with the first opening (24%, the highest pair), 11% with each of the two before it.

