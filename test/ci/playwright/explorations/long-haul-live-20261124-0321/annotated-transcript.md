# long-haul — annotated transcript

Run `long-haul-live-20261124-032110` · live · 2026-11-24T03:21:10.612Z · class **suspected-quality-issue** — the ledger: 1 fact(s) refused, 0 lost — each excerpt is to be read

**Re-scored 2026-11-24** from this run's own evidence, by the checks as corrected after it (`rescore.mjs`). What the table did is unchanged. The run's own verdict was **suspected-quality-issue** — the ledger: 1 fact(s) refused, 0 lost — each excerpt is to be read

Generated layers: the beat, the player's reason, the table's calls, rolls, the GM's answers, the checks' findings, time and cost.
The notes under each step are the reader's, and are not generated.

## before

### a1 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** say: !begin-session — _open session dialog_
- **Calls (1):** the AI player (2.9 s)
- **Time:** 3.6 s · **cost:** $0.0170

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** Right: `!begin-session` opened Begin a Session's window and nothing else happened — the observer's table after a1 is the table at setup (momentum 2, no vow, session not open).

## session-1

### a2 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** in "Begin a Session" set vignette=true, newVow=Find who is raiding the Cinder Expanse lanes, newVowRank=dangerous and press "Begin" — _Fill dialog_
- **Notebook:** Beat1: began session with vow
- **Calls (4):** callRewardModel>proposeRewards (1.2 s); callNarratorAPI>narrateSessionVignette (4.8 s); callHaiku>defaultCallTierAPI (0.5 s); the AI player (3.0 s)
- **Time:** 16.0 s · **cost:** $0.0349

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. No character has a vow in play besides a background vow — swear an iron vow to give this session a quest. Spotlight vignette: External factors create new danger, urgency, or importance for a quest All players take +1 momentum .

> **TABLE — Mira Kestrel**
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
> 🎁 Choose your reward Succeed and you'll earn one of these — or name your own and the narrator will work it in: A salvaged Expanse-class signal jammer from the raiders' wreckage, letting your ship slip past lane sensors unnoticed fo Safe passage and a standing favor from the Cinder Expanse freighter guild, whose captains will share docking slots and f Propose my own

> **NARRATOR (galley_begin) — Gamemaster**
>
> The galley kettle has been working on the same cup of tea for twenty minutes, and the *Kobayashi IV* has opinions about it. Somewhere behind the bulkhead, a pipe knocks twice, pauses, and knocks once more, like a neighbor who has heard you start something and wants it known. You sit at the fold-down table with a bowl of reconstituted noodles gone gluey at the edges, and you eat them anyway, because the ship's one dependable talent is making a bad meal feel like a choice. The lights dim for exactly as long as the heater takes to cycle, then return, and neither of you mentions it. You stir the broth and catch your reflection in the spoon, upside down and unimpressed. Out past the hull the Cinder Expanse sits black and patient, and the comm panel by the hatch gives a single, apologetic chirp.

**Notes.** Right: the dialog's vow is on the sheet (dangerous, 0 ticks), the spotlight vignette paid +1 momentum (2 → 3), the vow's card posted with "⚔ Swear it (roll)". The opening keeps her alone with the ship — no crew, no stat (read; its user message says "Nobody else is aboard"). **Friction, the charter's:** the 🎁 reward card is never answered (the player is told not to press reward buttons), so the fulfilment at a64 grants none. **Read across runs:** this first opening is run 2's first opening again — "The galley kettle … the *Kobayashi IV* has opinions about it … a bowl of reconstituted noodles" against run 2's "The kettle … has opinions about water pressure … a bowl of reconstituted noodle" — two separate worlds, one scene (see whole-run). The card's "No character has a vow in play besides a background vow" is true here and is what offers the vow.

### a3 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** click "⚔ Swear it (roll)" on m5 — _Swear the vow_
- **Notebook:** Beat1: vow card swear pressed
- **Calls (7):** callClaudeAPI>interpretMove (1.5 s); defaultClassifyImplicit>resolveRelevance (0.4 s); callNarratorAPI>call (7.7 s); callNarratorAPI>narrateResolution (4.7 s); callHaiku>defaultCallDetectionAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.3 s)
- **Roll:** swear_an_iron_vow → strong_hit — Action: 6 + 2 = 8 \| Challenge: 2, 2 ✦ Match
- **GM's rules:** accepted the proposed move (swear_an_iron_vow)
- **Beat 1 done:** session 1 is open; the dangerous vow "Find who is raiding the Cinder Expanse lanes" is on the sheet at 0 ticks
- **Time:** 28.1 s · **cost:** $0.0493

> **TABLE — Mira Kestrel**
>
> Swear an iron vow: Find who is raiding the Cinder Expanse lanes.

> **NARRATOR — Gamemaster**
>
> You set the noodle bowl aside and lay your palm flat on the galley bulkhead, where the old hull plate runs bare and cold beneath the paint. The ship knocks against something unseen, the lights stutter, and the iron under your hand stays steady through all of it. You say the words low and without ornament, and the metal takes them the way it takes everything else out here: without comment, and without letting go.

> **TABLE — Gamemaster**
>
> Swear an Iron Vow +heart (2) Action: 6 + 2 = 8 | Challenge: 2, 2 ✦ Match Strong Hit with a Match ✦ Match: a twist — something unexpected, or a new opportunity. Emboldened — clear next step. Take +2 momentum.

> **NARRATOR — Gamemaster**
>
> The chirp comes again, and this time it holds. Your hand is still on the iron when the panel resolves into a thin, patient tone, a beacon repeating in the dark. You know the pattern before you read it: three short pulses, a gap, then a cutoff mid-pulse. A hauler's distress call, clipped at the same place every time. Someone out near Hollow Spire sent it, and someone made sure it ended.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 5)

**Notes.** Right, by hand: Swear an Iron Vow +heart, 6 + 2 = 8 against 2 and 2 — a strong hit with a match; +2 momentum (3 → 5). Two narrations for one move (the oath, then the result), as designed; the match's twist is the clipped beacon. The oath's call also wrote the vow's hidden plan (a crew working from Hollow Spire's shadow; a leader threatening a hidden enclave) — remember it for a64.

### a4 · beat 2: Meet someone and make them a connection

- **Player:** say: I dock at Hollow Spire and walk the docks to the ledger stall of Tamsin Vey, the salvage broker, and greet her by her full name. — _Beat 2 meet Tamsin_
- **Calls (6):** callClassifierAPI>classifyInput (1.0 s); callNarratorAPI>narratePacedInput (4.6 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.8 s)
- **Time:** 18.0 s, 8.5 s from the line to its reply · **cost:** $0.0336

> **PLAYER — Playthrough Player**
>
> I dock at Hollow Spire and walk the docks to the ledger stall of Tamsin Vey, the salvage broker, and greet her by her full name.

> **NARRATOR — Gamemaster**
>
> Behind the bulkhead, the pipe knocks once and goes quiet. The *Kobayashi IV* slides into Hollow Spire's shadow, and the beacon tone fades behind you. The docks smell of wet rust and recycled breath. Water is rationed here, and the ledger stall sits at the far end, its lamp lit. A woman looks up from a slate when you say her name in full. She sets the slate down and does not smile. *Laying in a course for the stall and the beacon's last known bearing would be a Set a Course.*

**Notes.** Wrong, twice — the module's, and it is the first link of beat 2's stall.
(1) **The narration did not write the name the player gave.** The line named "Tamsin Vey, the salvage broker"; the prose says "A woman looks up from a slate when you say her name in full." Its own sidecar filed the truth under "Tamsin Vey" and put her in the frame's Present. Cause as far as the prompt shows: a paced line is always given NARRATOR PERMISSIONS — INTERACTION MODE, whose "You may NOT" list has "Introduce new named entities" (`src/narration/narratorPrompt.js:737`; the mode is fixed for `paced_narrative` at `:786`) and makes no exception for a name the player's own line brings in. (Run 2's a4, under the same mode — its kept replay lists the section — wrote "Tamsin Vey's stall", and its detector replied "Tamsin Vey", high. Its player line did not add "and greet her by her full name", which this narrator turned into the coy sentence. So: the model's choice, pushed by the rule.)
(2) **The entity detector is sent the narration alone** — not the player's line, not the frame (`src/entities/entityExtractor.js:355`, the prompt ends "Narration:" + the prose, `:530–531`). Its reply (replay.json, exchange 12): `{"type":"connection","name":"Ledger stall woman","confidence":"low"}`; low confidence is dropped (`:633`). No card. In run 2 she was proposed here by her full name and confirmed.
Also wrong, small, the pacing reader's: it offered Set a Course for walking down a dock the ship is already at ("Travel to a charted place (Hollow Spire) … offering set_a_course") and the narrator wrote "*Laying in a course for the stall and the beacon's last known bearing would be a Set a Course.*" — against the reader's own rule that "walking to a station" is plain narrative (`src/pacing/classifier.js:203–208`). Run 2 offered Undertake an Expedition for the same walk: two runs of two.

### a5 · beat 2: Meet someone and make them a connection

- **Player:** say: Tamsin, I'll give you a fair cut of my salvage leads and first pick of whatever I haul. Let me deal with you from here on. — _win her over_
- **Notebook:** Beat2: met Tamsin Vey, offered deal
- **Calls (6):** callClassifierAPI>classifyInput (0.9 s); callClaudeAPI>interpretMove (1.8 s); callNarratorAPI>narrateResolution (4.1 s); callHaiku>defaultCallDetectionAPI (1.6 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.9 s)
- **Roll:** compel → strong_hit — Action: 6 + 2 = 8 \| Challenge: 2, 7
- **GM's rules:** accepted the proposed move (compel)
- **Time:** 18.5 s, 9.1 s from the line to its reply · **cost:** $0.0268

> **PLAYER — Playthrough Player**
>
> Tamsin, I'll give you a fair cut of my salvage leads and first pick of whatever I haul. Let me deal with you from here on.

> **TABLE — Gamemaster**
>
> Compel +heart (2) Action: 6 + 2 = 8 | Challenge: 2, 7 Strong Hit They do what you want. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> "First pick, and a fair cut," Tamsin says, turning your words over like a coin she suspects is clipped. Then she pulls the slate back toward her. "Fine. That beacon was a hauler out of the lane past Hollow Spire. Three pulses, cut mid-fourth. I've heard it before. Same cut, every time." She taps the slate once. "The ones who go dark are carrying water and medical stores. Cargo they leave."

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 6)

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Tamsin — A figure who speaks with the player character, weighing their words and offering information about a beacon and haulers. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Notes.** Half right. By hand: Compel +heart, 6 + 2 = 8 against 2 and 7 — a strong hit, +1 momentum (5 → 6); the narration delivers the stated hit ("Fine. That beacon was a hauler out of the lane past Hollow Spire…"). **The beat wanted Make a Connection.** Is Compel a reasonable reading? By the game's own text, yes: Compel is "When you try to persuade someone or make them an offer … Charm, pacify, encourage, or barter: Roll +heart"; Make a Connection is "When you search out a new relationship or give focus to an existing relationship". "I'll give you a fair cut … and first pick of whatever I haul" is an offer, word for word; only "Let me deal with you from here on" asks for a relationship. Both readers agreed (pacing: "a compel attempt", 0.8; interpreter: "a persuasion attempt … confidence high", no mischief). So the reading is the charter's to answer for — it asks for a connection with a line that is an offer — though by the decision this run tests, a line "read as another move" is still the readers' fault, and it is counted so.
**The detector did propose her here — as "Tamsin".** Reply (exchange 18): `{"type":"connection","name":"Tamsin","confidence":"high"}`; the card "◈ New Entities Detected [⬡ Connection] Tamsin … Confirm — whose connection?" was posted, to the GM only (it is on none of the player's screens, a6–a11). **The GM's rules left it:** a draft is confirmed only when its name equals a cast name exactly (`test/ci/playwright/lib/gm.mjs:155`; cast: "Tamsin Vey", "Tamsin Okoro"). It stayed pending to the end of the run. A person GM would have pressed Confirm; the beat's check would still have said no, since it too wants a connection named exactly "Tamsin Vey" (`lib/beats.mjs:75`, `:111`).
In the fiction Tamsin agreed; on the table nothing records her. The sidecar wrote "agreed to deal *exclusively* with the PC" — "exclusively" is in no prose.

### a6 · beat 2: Meet someone and make them a connection

- **Player:** wait 5s — _The roll came back as a strong hit. I'll wait for the observer to move me on._
- **Notebook:** Beat2: Compel strong hit done; waiting for observer
- **Calls (1):** the AI player (2.7 s)
- **Time:** 5.2 s · **cost:** $0.0083

**Notes.** Friction — the charter's and the runner's, not the module's. The player waited: "The roll came back as a strong hit. I'll wait for the observer to move me on." Read in its prompt (requests.json, runner): the beat's text ends "A roll should follow." — one did; the observer's note is "Tamsin Vey has no connection card yet", which is a state, not an instruction; the draft card is not on its screen; and the last resort ("say that you set out to make a connection with Tamsin Vey…") is unlocked only after three plain lines on this beat (`lastResortAfter: 3`, `lib/beats.mjs:490–491`) — it had typed two (a4, a5), and a wait is not a line. Nothing told it the roll was the wrong roll.

### a7 · beat 2: Meet someone and make them a connection

- **Player:** wait 5s — _Beat appears done; wait for observer._
- **Calls (1):** the AI player (2.2 s)
- **Time:** 6.1 s · **cost:** $0.0080

**Notes.** Friction, as a6: "Beat appears done; wait for observer." Same prompt, same note, read.

### a8 · beat 2: Meet someone and make them a connection

- **Player:** wait 10s — _Waiting for observer to move on._
- **Calls (1):** the AI player (2.6 s)
- **Time:** 10.5 s · **cost:** $0.0080

**Notes.** Friction, as a6 (note unchanged: "Tamsin Vey has no connection card yet"; read).

### a9 · beat 2: Meet someone and make them a connection

- **Player:** wait 10s — _Beat appears complete; await observer._
- **Notebook:** Beat2 done, waiting for observer
- **Calls (1):** the AI player (2.8 s)
- **Time:** 10.4 s · **cost:** $0.0082

**Notes.** Friction, as a6. Notebook: "Beat2 done, waiting for observer."

### a10 · beat 2: Meet someone and make them a connection

- **Player:** wait 10s — _Beat done; waiting for observer to move on._
- **Calls (1):** the AI player (2.6 s)
- **Time:** 11.8 s · **cost:** $0.0081

**Notes.** Friction, as a6 (read).

### a11 · beat 2: Meet someone and make them a connection

- **Player:** wait 10s — _Waiting for observer to move on._
- **Calls (1):** the AI player (2.4 s)
- **Beat 2 not-exercised:** not reached in 8 actions — Tamsin Vey has no connection card yet
- **Beat 3 not-exercised:** it needs beat 2, which was not done
- **Time:** 10.9 s · **cost:** $0.0081

**Notes.** Friction, as a6. The beat is given up after eight actions with no progress (`STALL_ACTIONS`, `lib/beats.mjs:30`, `:453`) — "not reached in 8 actions — Tamsin Vey has no connection card yet" — and beat 3 with it. Six waits: 55 s and $0.049. What went with it: beats 3, 18, 22 and 23, fact F7 (never planted), the vow's link, every relationship reading, and a named NPC for the closings (see a17). **Cause, in order:** the narrator would not write the name (a4, module); the detector reads only narration (a4, a5, module); the GM rule and the check want the exact cast name (runner); the charter's line is an offer, read as Compel (charter); the player was told a roll ends the beat and the last resort counts lines it had no reason to type (charter/runner).

### a12 · beat 4: Gather Information

- **Player:** say: I lean on the stall and ask the dock hands and haulers who saw the raiders last, even if it means leaking that I'm hunting them. — _beat 4_
- **Notebook:** Beat4: asked around docks
- **Calls (6):** callClassifierAPI>classifyInput (0.9 s); callClaudeAPI>interpretMove (1.8 s); callNarratorAPI>narrateResolution (4.8 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.8 s)
- **Roll:** gather_information → miss — Action: 6 + 3 = 9 \| Challenge: 10, 9
- **GM's rules:** accepted the proposed move (gather_information)
- **Beat 4 done:** gather_information was rolled at a12: miss
- **Time:** 17.7 s, 9.6 s from the line to its reply · **cost:** $0.0361

> **PLAYER — Playthrough Player**
>
> I lean on the stall and ask the dock hands and haulers who saw the raiders last, even if it means leaking that I'm hunting them.

> **TABLE — Gamemaster**
>
> Pay the Price Gather Information As stated before the roll: Word of your hunt spreads through the docks, and the raiders hear that someone is asking after them.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 6 + 3 = 9 | Challenge: 10, 9 Miss Dire threat or unwelcome truth uncovered. Pay the Price.

> **NARRATOR — Gamemaster**
>
> You lean on the stall and ask your questions loud enough to carry. A hauler two stalls down stops counting his crates. A dock hand drifts off with her head turned just so. By the time you finish, someone has already carried your question out toward the lanes. Tamsin watches the dock empty around you and says, flatly, "Now they'll know someone's asking." Her slate screen goes dark in her hand.

**Notes.** Right, by hand: Gather Information +wits, 6 + 3 = 9 against 10 and 9 — a miss (a tie is not beaten); momentum 6 is under both dice, so no burn was offered, rightly. Its stated price ("Word of your hunt spreads through the docks…") names no suffer move and is told in the story; the sheet is unchanged. The plan's first escalation step was played (sidecar: `"advanced":"e1"`), which is where a25's voice on the dock comes from — the hidden plan doing its work. **Wrong, small, the module's (chat order):** the "Pay the Price … As stated before the roll" card was posted 0.6 s *before* the roll's own card (messages: 1795490686398 against …686997) — read top to bottom, the price is paid before the dice are shown.

### a13 · beat 5: Plant facts F1–F4

- **Player:** say: I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry. — _plant F1_
- **Notebook:** F1 compass said
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (3.7 s); callHaiku>defaultCallDetectionAPI (1.4 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.7 s)
- **Time:** 14.8 s, 5.5 s from the line to its reply · **cost:** $0.0340

> **PLAYER — Playthrough Player**
>
> I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry.

> **NARRATOR — Gamemaster**
>
> Tamsin's eyes drop to the compass in your palm and stay there. The needle trembles, then swings away from north and settles toward the dark lane past the Spire. "That's not a toy," she says, quieter now. "Where did you get a needle that points at something?" Along the docks, a hauler pauses mid-step, then hurries on.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◧ Location] Dark Lane Past the Spire — A dark lane beyond Hollow Spire toward which the compass needle points. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** Right: F1 planted in the charter's words. The narrator makes the compass a hook — "The needle trembles, then swings away from north and settles toward the dark lane past the Spire" — its invention, and from here the run's most repeated prop (compass or needle in 20 of 49 narrations). A draft location card, "Dark Lane Past the Spire": a phrase of the narrator's taken for a place.

### a14 · beat 5: Plant facts F1–F4

- **Player:** say: I leave the cargo manifest with Tamsin for safekeeping. — _plant F2_
- **Notebook:** F2 manifest said
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (4.2 s); callHaiku>defaultCallDetectionAPI (0.9 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.4 s)
- **Time:** 16.2 s, 7.1 s from the line to its reply · **cost:** $0.0249

> **PLAYER — Playthrough Player**
>
> I leave the cargo manifest with Tamsin for safekeeping.

> **NARRATOR — Gamemaster**
>
> Tamsin takes the manifest in two fingers and does not open it. She slides it under the slate, flat, as if it had always lived there. "Safekeeping costs nothing yet," she says. "Ask me again when someone comes looking." Down the dock, a shape stops beside a crate stack and stays. "Then I'd start thinking of who might," she adds, eyes on the compass.

**Notes.** Right: F3 planted — "She slides it under the slate, flat". A hook is set ("Down the dock, a shape stops beside a crate stack and stays") that the charter's next beats walk past. The phrase "under her slate … unopened … nothing yet" starts here and is repeated in six to nine later narrations (whole-run).

### a15 · beat 5: Plant facts F1–F4

- **Player:** say: I promise Tamsin I'll be back before the next tide of cargo. — _Plant fact 3_
- **Notebook:** F3 promise said (all F1-F4 done)
- **Calls (5):** callClassifierAPI>classifyInput (0.8 s); callNarratorAPI>narratePacedInput (3.7 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.6 s)
- **Beat 5 done:** F1, F2, F3, F4 stated by the player
- **Time:** 16.0 s, 6.0 s from the line to its reply · **cost:** $0.0259

> **PLAYER — Playthrough Player**
>
> I promise Tamsin I'll be back before the next tide of cargo.

> **NARRATOR — Gamemaster**
>
> The watcher by the crate stacks has not moved, but his head has turned toward Tamsin's lamp. She sees it too. "Before the next tide of cargo," she says, flat as a ledger line. "Then you'd best come back knowing what you're buying." Her hand rests on the slate, over your manifest, and she does not look away from the compass. "Bring me something the clipped beacon didn't." *Binding that promise to the hunt itself would be Swear an Iron Vow.*

**Notes.** Right: F4 planted — "Before the next tide of cargo," she says, "flat as a ledger line". The reader offered Swear an Iron Vow ("an oath-like commitment but … not clearly an iron vow") and the narration did not make it: defensible, unasked. The watcher "by the crate stacks" turns his head; he is never seen again.

### a16 · beat 6: End a Session, noting a focus

- **Player:** say: !end-session — _Beat 6 asks for it_
- **Notebook:** F4 not needed; Beat6 started: typed !end-session
- **Calls (1):** the AI player (2.3 s)
- **Time:** 3.8 s · **cost:** $0.0092

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** Right: End a Session's window opened; nothing changed on the table.

## after-session-1

### a17 · beat 6: End a Session, noting a focus

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _Fill focus and end session_
- **Notebook:** Beat6: submitted End Session
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (2.1 s); callNarratorAPI>narrateSessionVignette (3.3 s); callNarratorAPI>getCampaignRecap (6.2 s); callHaiku>defaultCallTierAPI (0.4 s); the AI player (3.0 s)
- **Beat 6 done:** session 1 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 18.9 s · **cost:** $0.0442

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 7)

> **NARRATOR (npc_end) — Gamemaster**
>
> Somewhere in the shadow of the Spire, a woman with a hauler's patched jacket sits on an upturned ration crate and peels an orange with her thumbnail. She does it in one long strip, the way someone's mother must have taught her, and lays the peel flat on her knee. The comm panel behind her mutters a lane schedule she has heard so often she hums along to it, a half-beat off. She eats the orange slowly, segment by segment, wiping her fingers on the jacket's hem. When the last piece is gone she reaches over and clicks the panel's lamp off.

**Notes.** Right for the mechanics: session 1 closed with its focus, +1 momentum (6 → 7). **The closing, read:** "a woman with a hauler's patched jacket … peels an orange". Its prompt names the featured NPC as "(sector_trouble): the architect of Cinder Expanse" — with no connection on the table the closing falls back to the sector's trouble (`src/session/endSessionVignette.js:96–103`). A reader meets an unnamed woman for no reason the story has given; this is downstream of a5. The summary and the first recap are written here — see recaps ("The raiders know your name" is in neither the transcript nor the Chronicle).

### a18 · beat 7: Begin a Session; ask probe set A

- **Player:** say: !begin-session — _Begin session 2_
- **Notebook:** Beat7 started: typed !begin-session
- **Calls (1):** the AI player (2.7 s)
- **Time:** 3.4 s · **cost:** $0.0097

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** Right: Begin a Session's window opened.

## session-2

### a19 · beat 7: Begin a Session; ask probe set A

- **Player:** in "Begin a Session" set vignette=false and press "Begin" — _Begin session 2_
- **Notebook:** Beat7: submitted Begin; next ask 4 questions
- **Calls (2):** callNarratorAPI>narrateSessionVignette (4.6 s); the AI player (2.8 s)
- **Time:** 11.1 s · **cost:** $0.0363

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> You are halfway through a pickled egg, the kind that came in a jar the size of your head and has outlasted two resupply runs. The galley's ventilation fan picks that moment to start a slow, dignified whine, as if the egg has been formally noted. Under the table, something that is probably a coolant line ticks like a clock running slightly fast, and you decide not to check. The ship's single working warming plate glows orange, heating nothing, because you put the plate on it and the plate has a mind of its own. You lick vinegar off your thumb and consider whether a second egg counts as a decision or a symptom. Then the intercom clears its throat with a burst of static, and a flat recorded voice announces that something, somewhere aboard, has "completed."

**Notes.** Half right. Session 2 opened, no vignette roll, momentum unchanged (7). The opening is a different meal (a pickled egg) and the same scene: food, the ship misbehaving, and a comm device making a small noise at the end ("the intercom clears its throat with a burst of static" — run 2's fourth opening ends "the intercom clears its throat with a small burst of static", and also had pickled eggs). **Wrong on the card, a known residual:** "Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes. No character has a vow in play besides a background vow" — the vow is open on the sheet and named one line above. BACKGROUND-VOW-BY-POSITION (by design): a character's first vow is taken for her background vow (`src/session/openThreads.js:91–103`), and the charter's seeded character has none. **And the root of the session's refrain:** the opening's hook becomes the scene's question — frame: "What has the ship just completed?" — which every later prompt of the session carries (whole-run).

### a20 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What do I still carry that belonged to my sister? — _Ask first probe question_
- **Notebook:** Beat7: asking Q1 of 4
- **Calls (3):** callNarratorAPI>interrogateScene (2.8 s); callHaiku>defaultCallDetectionAPI (1.6 s); the AI player (2.3 s)
- **Time:** 13.9 s, 3.3 s from the line to its reply · **cost:** $0.0197

> **PLAYER — Playthrough Player**
>
> @scene What do I still carry that belonged to my sister?

> **NARRATOR — Gamemaster**
>
> The brass star-compass sits where you left it, a dull gold weight against the galley table beside the egg jar. Its needle has not settled on north in all the time you've owned it. It leans stubbornly toward the dark lane past Hollow Spire, and it trembles slightly each time the coolant line ticks. You've kept nothing else of Ilse's, and the compass has never once pretended that was enough.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◧ Location] Dark Lane — The dark lane past Hollow Spire, toward which Ilse's brass star-compass needle leans. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** Right on the fact, half right on the rest. `@scene`: "The brass star-compass … You've kept nothing else of Ilse's" — F1 recalled across a session's end, from WORLD SNAPSHOT (the ledger), in the narrator's own voice, no speaker invented. **But it invents:** "Its needle has not settled on north in all the time you've owned it" — nothing said so (a13: it "swings away from north" in front of Tamsin). The call is told both "Describe only what is already established — answer the question, do not invent" (`narratorPrompt.js:1139`) and "Answer this question with 2–3 sentences of atmospheric description" (`:2923`). The detector then filed the invention as lore ("Ilse's brass star-compass never settles on north … trembles when the coolant line ticks") and raised a second draft card for the same lane, "Dark Lane", though "Dark Lane Past the Spire" was listed as pending — the pending filter matches whole names only (`entityExtractor.js:636`). So a scene question writes lore and draft cards (`narrator.js:4366`).

### a21 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What is the name of the salvage broker I befriended at Hollow Spire? — _Q2_
- **Notebook:** Beat7: Q1 done, asking Q2
- **Calls (4):** callNarratorAPI>interrogateScene (2.2 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.5 s); the AI player (2.8 s)
- **Time:** 12.3 s, 3.7 s from the line to its reply · **cost:** $0.0184

> **PLAYER — Playthrough Player**
>
> @scene What is the name of the salvage broker I befriended at Hollow Spire?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey. You say the name once, to the galley, and the ventilation fan answers with its slow whine. She keeps a ledger stall on the Hollow Spire docks, and she has your cargo manifest tucked under her slate, unopened, for the price of nothing yet. The compass needle trembles toward the dark lane, and you can almost hear her telling you to bring back something the clipped beacon didn't.

**Notes.** Right: "Tamsin Vey." F2 recalled across the session's end, first words of the answer. It goes on to her stall, the manifest "tucked under her slate, unopened, for the price of nothing yet" and the clipped beacon — all true (a14, a15). "You say the name once, to the galley": an act written for the character.

### a22 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene Who is holding the cargo manifest I was carrying? — _Q3_
- **Notebook:** Beat7: Q2 done, asking Q3
- **Calls (3):** callNarratorAPI>interrogateScene (1.8 s); callHaiku>defaultCallDetectionAPI (0.7 s); the AI player (2.8 s)
- **Time:** 12.6 s, 3.5 s from the line to its reply · **cost:** $0.0185

> **PLAYER — Playthrough Player**
>
> @scene Who is holding the cargo manifest I was carrying?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey holds it. She slid it under her slate at the ledger stall on the Hollow Spire docks, unopened, and told you safekeeping costs nothing yet. You turn the egg jar a quarter turn on the table, and the compass needle ticks along with the coolant line, pointing past the Spire toward wherever she is still sitting under her lamp.

**Notes.** Right: "Tamsin Vey holds it. She slid it under her slate … unopened, and told you safekeeping costs nothing yet." F3 recalled.

### a23 · beat 7: Begin a Session; ask probe set A

- **Player:** say: By when did I promise to return? — _Ask fourth question_
- **Notebook:** Beat7: Q3 done, asking Q4
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (3.7 s); callHaiku>defaultCallDetectionAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.3 s)
- **Beat 7 done:** probe set A: 4 question(s) asked
- **Time:** 14.9 s, 5.4 s from the line to its reply · **cost:** $0.0257

> **PLAYER — Playthrough Player**
>
> By when did I promise to return?

> **NARRATOR — Gamemaster**
>
> You push the jar away and look at the compass instead. Before the next tide of cargo: that was the promise, and the tide has no fixed hour. The intercom coughs again, and the flat voice repeats itself: "Completed." Down the corridor, something heavy thunks into place, a latch or a hatch. The warming plate goes dark, all at once. Whatever the ship has finished, it did not ask you first.

**Notes.** Right on the fact; this is the first of the four questions left as play. "Before the next tide of cargo: that was the promise, and the tide has no fixed hour." Answered by the narrator directly, no speaker invented, no move offered (reader: "A question asked of the narrator about established facts is not a character action"). **What a line of play does that `@scene` does not:** the answer is continued as story (the intercom's "Completed", a latch thunks), and the scribe recorded the question as an event — Chronicle: "Mira Kestrel realized her promise to return was only 'before the next tide of cargo,' a deadline with no fixed hour" — which the three later recaps then tell (a48: "a deadline with no fixed hour"; a65: "that you later noticed had no fixed hour"; a76: "you noticed that too late to be comfortable about it").

### a24 · beat 8: Travel to the second settlement

- **Player:** say: I plot the route to Bleakhold Station and take the Kobayashi IV there. — _beat 8_
- **Notebook:** Beat8 started: said plot route to Bleakhold
- **Calls (6):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (3.0 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.3 s)
- **Time:** 14.3 s, 4.7 s from the line to its reply · **cost:** $0.0233

> **PLAYER — Playthrough Player**
>
> I plot the route to Bleakhold Station and take the Kobayashi IV there.

> **NARRATOR — Gamemaster**
>
> You wipe your thumb on your sleeve and pull up the chart. Bleakhold Station sits a long burn off the Spire, and the compass needle swings toward it, then away, offended. The plotted line crawls across the screen. Down the corridor, the heavy latch thunks again, as if the ship has opinions about leaving. *Laying in the course and committing to the burn would be Set a Course.*

**Notes.** Right: Set a Course offered (the reader: "at dial 6 with ambiguous commitment it is offered rather than forced"); the narration lays the course in and stops ("The plotted line crawls across the screen") — the arrival is left to the roll. "…as if the ship has opinions about leaving": "has opinions" again (a2).

### a25 · beat 8: Travel to the second settlement

- **Player:** click "Roll Set a Course" on m12 — _Card offers the roll_
- **Notebook:** Beat8: clicked Roll Set a Course
- **Calls (4):** callClaudeAPI>interpretMove (1.4 s); callNarratorAPI>narrateResolution (4.4 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.3 s)
- **Roll:** set_a_course → strong_hit — Action: 4 + 5 = 9 \| Challenge: 5, 3
- **GM's rules:** accepted the proposed move (set_a_course)
- **Beat 8 done:** the ship is at Bleakhold Station, its token on the pin
- **Time:** 17.0 s · **cost:** $0.0257

> **TABLE — Mira Kestrel**
>
> I plot the route to Bleakhold Station and take the Kobayashi IV there.

> **TABLE — Gamemaster**
>
> Set a Course +supply (5) Action: 4 + 5 = 9 | Challenge: 5, 3 Strong Hit Arrived, situation favors you. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Set a Course resolved Arrived at Bleakhold Station . Course held cleanly (+1 momentum). Token moved to Bleakhold Station .

> **NARRATOR — Gamemaster**
>
> A dock hand at Bleakhold Station is already hauling the mooring line before the hull stops shuddering, and he does not look up. The burn held true, and the berth they gave you is close to the lock. Corporate paint, fresh and bright, covers the bulkheads. The compass needle steadies at last. Somewhere down the dock, a voice calls the Kobayashi IV by name, and it is not asking.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 8)

**Notes.** Right, by hand: Set a Course +supply, 4 + 5 = 9 against 5 and 3 — a strong hit; +1 momentum (7 → 8); the location and the token both at Bleakhold Station. The button re-posts the player's line, so the chat shows it twice (again at a59, a62). The narration plants "a voice calls the Kobayashi IV by name, and it is not asking" — the plan's escalation, and a hook the charter's next beat walks straight past.

### a26 · beat 9: Enter a fight that serves the vow

- **Player:** say: !truth set "raider cutter" is named the Ashen Wake — _beat instruction_
- **Notebook:** Beat9: typed truth set; next line of play fight
- **Calls (1):** the AI player (2.6 s)
- **Time:** 5.7 s · **cost:** $0.0097

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Ashen Wake

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Ashen Wake tr-7e438 .

**Notes.** Right: the truth recorded as the player's (`tr-7e4381e3`, asserter "player").

### a27 · beat 9: Enter a fight that serves the vow

- **Player:** say: The Ashen Wake bursts out of the dark off Bleakhold, so I swing the Kobayashi IV around and turn to fight her, guns hot. — _fight opens_
- **Notebook:** Beat9: said fight line; look for A fight looms card
- **Calls (7):** callClassifierAPI>classifyInput (0.9 s); callClaudeAPI>interpretMove (2.8 s); callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (1.3 s); callHaiku>defaultCallTierAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (3.2 s)
- **Roll:** enter_the_fray → strong_hit — Action: 6 + 2 = 8 \| Challenge: 2, 2 ✦ Match
- **GM's rules:** accepted the proposed move (enter_the_fray)
- **Time:** 20.9 s, 10.4 s from the line to its reply · **cost:** $0.0276

> **PLAYER — Playthrough Player**
>
> The Ashen Wake bursts out of the dark off Bleakhold, so I swing the Kobayashi IV around and turn to fight her, guns hot.

> **TABLE — Gamemaster**
>
> Enter the Fray +edge (2) Action: 6 + 2 = 8 | Challenge: 2, 2 ✦ Match Strong Hit with a Match ✦ Match: a twist — something unexpected, or a new opportunity. Strong hit: take both — +2 momentum AND you are in control. 🎲 Commit or don't. No half measures.

> **TABLE — Gamemaster**
>
> ⚔ A fight looms — The Ashen Wake Your Enter the Fray is rolled, but the fight's track is not made yet: set it up here and press ⚔ Begin the fight to begin it — or look for a way out instead. The narrator suggests this is a dangerous fight. ⚑ If you enter this fight, you begin in control . Difficulty: troublesome dangerous formidable extreme epic This fight serves: (not tied to a vow) Find who is raiding the Cinder Expanse lanes Objective: ⚔ Begin the fight 🚪 Find another way

> **NARRATOR — Gamemaster**
>
> "Guns hot," you say, and the Kobayashi IV answers before you finish the words. The Ashen Wake comes out of the dark nose-on, and you are already across her line. Your first salvo takes her forward plating while her gunners are still finding the range. The match flares bright on the scope, and she veers hard. Somewhere in the Wake's wash, a comm opens, and no one on it is speaking yet.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 10)

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Ashen Wake — A vessel that comes out of the dark nose-on and is engaged in combat, taking forward plating damage and veering hard. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** Right, mostly. By hand: Enter the Fray +edge, 6 + 2 = 8 against 2 and 2 — a strong hit with a match; +2 momentum (8 → 10, the ceiling). **The fight's card follows its roll** (6 ms after it: …923916, …923922), says "Your Enter the Fray is rolled, but the fight's track is not made yet" and its button is "⚔ Begin the fight" — FIGHT-COMMIT-CARD-AFTER-THE-ROLL's fix, read live for the first time. Three things to note. **Wrong, small, the narrator's:** "The match flares bright on the scope" — nothing in the scene is a match; the outcome block it was sent reads "[OUTCOME: Strong Hit with a Match [MATCH]]". NARRATION-NAMES-THE-OUTCOME, a second sample in another shape. **Spoken for the character:** '"Guns hot," you say' (the player described; the narrator made it speech). **And the narration already fights** ("Your first salvo takes her forward plating") before "Begin the fight" is pressed: had the player taken "🚪 Find another way", the salvo would stand. The charter's doing here: a docked ship (a25: "the berth they gave you") is fighting in open space one line later because the player's line says so. A draft ship card, "Ashen Wake".

### a28 · beat 9: Enter a fight that serves the vow

- **Player:** choose "Find who is raiding the Cinder Expanse lanes" in dropdown 2 on m10 — _select vow_
- **Notebook:** Beat9: chose vow dropdown; next click Begin the fight
- **Calls (1):** the AI player (2.5 s)
- **Time:** 4.8 s · **cost:** $0.0100

**Notes.** Right: the vow chosen in the card's "This fight serves" dropdown.

### a29 · beat 9: Enter a fight that serves the vow

- **Player:** click "⚔ Begin the fight" on m10 — _Begin fight_
- **Notebook:** Beat9: clicked Begin the fight
- **Calls (1):** the AI player (2.3 s)
- **Beat 9 done:** the dangerous fight "The Ashen Wake" is open, serving the vow "Find who is raiding the Cinder Expanse lanes"
- **Time:** 5.9 s · **cost:** $0.0098

> **TABLE — Gamemaster**
>
> Enter the Fray Created combat track The Ashen Wake (dangerous). This fight's progress lives in the Progress Tracks panel. Winning this fight is a milestone on your vow: “Find who is raiding the Cinder Expanse lanes”. Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress. ⊕ Open Progress Tracks ⚔ Battle instead Prefer to settle it in one stroke? Battle resolves the whole fight with a single roll instead of marking the track move by move.

**Notes.** Right: "⚔ Begin the fight" pressed — the track made (dangerous, 0 ticks), the position carried ("in control" on the sheet), "Winning this fight is a milestone on your vow". Two actions from the roll to the fight; run 2 lost five beats here.

### a30 · beat 10: A scripted miss in the fight

- **Player:** say: I press my advantage and drive the Kobayashi IV in close, raking the Ashen Wake's engines with everything I've got. — _attack_
- **Notebook:** Beat10: said attack line
- **Calls (3):** callClassifierAPI>classifyInput (0.8 s); callClaudeAPI>interpretMove (2.2 s); the AI player (3.0 s)
- **Roll:** gain_ground → miss — Action: 3 + 2 = 5 \| Challenge: 9, 8
- **GM's rules:** accepted the proposed move (gain_ground)
- **Time:** 10.5 s · **cost:** $0.0110

> **PLAYER — Playthrough Player**
>
> I press my advantage and drive the Kobayashi IV in close, raking the Ashen Wake's engines with everything I've got.

> **TABLE — Gamemaster**
>
> Gain Ground +edge (2) Action: 3 + 2 = 5 | Challenge: 9, 8 Miss Foe gains upper hand. You are in a bad spot. Pay the Price. 🎲 The window is narrow — good thing you're fast. 🔥 Burn Momentum (10 → Strong Hit) Keep the result Nothing has been paid or narrated yet: burn or improve the result, or keep it — the price and the narration follow your choice. Your next line keeps it. ⚔ Attempt to Finish the Fight: The Ashen Wake

**Notes.** Half right. By hand: Gain Ground +edge, 3 + 2 = 5 against 9 and 8 — a miss; the result is held with "🔥 Burn Momentum (10 → Strong Hit)" and "Keep the result", "Nothing has been paid or narrated yet". **The beat wanted Strike.** "raking the Ashen Wake's engines with everything I've got" is an assault (Strike: "When you are in control and assault a foe at close quarters … or attack at a distance"); Gain Ground is "take action in a fight to reinforce your position or move toward an objective". The pacing reader chose it first ("an explicit character attack pressing an advantage … fitting gain_ground"), and its catalog glosses the move as "gain_ground: in control, pressing an advantage" (`classifier.js:281`) — the player's "I press my advantage" is the charter's own wording ("press your advantage if you are in control"). The interpreter kept it with `mischiefApplied: true` ("a mild misread toward a more dramatic pursuit angle"), which P2-02 allows. So: the charter gave the player the reader's words for another move. Because the move was not Strike or Clash, the scripted miss and its scripted price (d100 = 78) were never armed; these dice were real. The card's quip — "The window is narrow — good thing you're fast" — sits on a miss.

### a31 · beat 10: A scripted miss in the fight

- **Player:** click "Keep the result" on m12 — _Keep the missed result_
- **Notebook:** Beat10: clicked Keep the result
- **Calls (5):** callNarratorAPI>narrateResolution (3.9 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (4.2 s); the AI player (2.6 s)
- **Beat 10 done:** gain_ground missed at a30; its price (null: "") was withstand_damage (-1), taken at a31
- **Time:** 17.8 s · **cost:** $0.0255

> **TABLE — Gamemaster**
>
> Pay the Price Gain Ground As stated before the roll: Your ship overcommits into her wash, and the Wake's return fire catches the Kobayashi IV's flank as you break off. Routes to Withstand Damage (-1).

> **TABLE — Gamemaster**
>
> Withstand Damage (-1) Kobayashi IV: 5 → 4

> **NARRATOR — Gamemaster**
>
> You drive in tight and rake her engines, and for one breath it works. Then you are inside her wash, too close, too fast. The Wake's guns catch the Kobayashi IV along the flank as you break off. The hull rings like a struck pot, and a deck plate buckles under your boots. The open comm crackles once, and a dry voice says, "Closer than I'd have risked."

**Notes.** Right, and it is the beat's substance. "Keep the result" → "Pay the Price … As stated before the roll: Your ship overcommits into her wash … Routes to Withstand Damage (-1)" → "Withstand Damage (-1) Kobayashi IV: 5 → 4" → the narration tells exactly that ("The Wake's guns catch the Kobayashi IV along the flank"). Checked: the suffer card's own before/after (5, 4) and a later narrator prompt (a46's: "COMMAND VEHICLE: Kobayashi IV — integrity 4/5"); the observer's table does not record a vehicle's integrity, so the runner's `suffer-cost` check had no meter for it (0 made — `SUFFER_METER` has no `withstand_damage`). Position on the sheet: in a bad spot. No resist roll, rightly: the rules make it optional above 0. **So a miss in the fight was made, kept, priced and paid through a suffer move — what beat 10 is for — and the beat's check did not count it** (next note).

### a32 · beat 10: A scripted miss in the fight

- **Player:** wait 5s — _Nothing to choose; await observer._
- **Notebook:** Beat10: miss paid by story (ship 5->4); waiting
- **Calls (1):** the AI player (2.7 s)
- **Time:** 5.2 s · **cost:** $0.0109

**Notes.** Friction — the runner's check. The player waits, as the beat told it to ("If the price is paid for you … there is nothing more to do: the observer moves you on"; notebook: "miss paid by story (ship 5->4)"). The observer's note under a Gain Ground miss on screen reads "no miss in the fight yet": the check counts a miss only of Strike or Clash (`lib/beats.mjs:204–206`; charter `b10.check.moves`).

### a33 · beat 10: A scripted miss in the fight

- **Player:** wait 5s — _Price paid in story; nothing to choose._
- **Notebook:** Beat10: miss paid by story; waiting for observer
- **Calls (1):** the AI player (2.3 s)
- **Time:** 6.3 s · **cost:** $0.0103

**Notes.** Friction, as a32 (prompt read: same note).

### a34 · beat 10: A scripted miss in the fight

- **Player:** wait 10s — _Nothing to answer; observer moves on._
- **Notebook:** Beat10: miss paid by story; still waiting for observer
- **Calls (1):** the AI player (2.8 s)
- **Time:** 10.4 s · **cost:** $0.0103

**Notes.** Friction, as a32.

### a35 · beat 10: A scripted miss in the fight

- **Player:** wait 15s — _Nothing to choose; observer moves on._
- **Notebook:** Beat10: still waiting; price paid by story
- **Calls (1):** the AI player (2.9 s)
- **Time:** 15.6 s · **cost:** $0.0103

**Notes.** Friction, as a32.

### a36 · beat 10: A scripted miss in the fight

- **Player:** wait 20s — _Nothing to answer; wait for observer._
- **Notebook:** Beat10: miss paid by story; waiting for observer
- **Calls (1):** the AI player (2.4 s)
- **Time:** 21.3 s · **cost:** $0.0103

**Notes.** Friction, as a32.

### a37 · beat 10: A scripted miss in the fight

- **Player:** wait 20s — _Price already paid by story; nothing to choose._
- **Notebook:** Beat10: still waiting for observer
- **Calls (1):** the AI player (2.4 s)
- **Time:** 21.2 s · **cost:** $0.0102

**Notes.** Friction, as a32. Beat 10 is given up — "not reached in 8 actions — no miss in the fight yet". Six waits, 80 s, $0.062. **The verdict is the check's, not the module's:** the thing the beat tests happened at a30–a31, on Gain Ground.

### a38 · beat 11: A scripted weak hit, then Burn Momentum

- **Player:** say: Bad spot or not, I fight back hard, slamming the Kobayashi IV around and hammering the Ashen Wake's gun mounts at close range. — _Attack again_
- **Notebook:** Beat11: said attack again line; look for Burn Momentum
- **Calls (3):** callClassifierAPI>classifyInput (0.7 s); callClaudeAPI>interpretMove (1.7 s); the AI player (2.8 s)
- **Roll:** clash → weak_hit (scripted dice) — Action: 1 + 1 = 2 \| Challenge: 1, 9
- **GM's rules:** accepted the proposed move (clash)
- **Time:** 10.8 s · **cost:** $0.0109

> **PLAYER — Playthrough Player**
>
> Bad spot or not, I fight back hard, slamming the Kobayashi IV around and hammering the Ashen Wake's gun mounts at close range.

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on The Ashen Wake .

> **TABLE — Gamemaster**
>
> Clash +iron (1) Action: 1 + 1 = 2 | Challenge: 1, 9 Weak Hit Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price. 🔥 Burn Momentum (10 → Strong Hit) Keep the result Nothing has been paid or narrated yet: burn or improve the result, or keep it — the price and the narration follow your choice. Your next line keeps it. ⚔ Attempt to Finish the Fight: The Ashen Wake

**Notes.** Right, by hand (scripted dice 1, 9, 1): Clash +iron, 1 + 1 = 2 against 1 and 9 — a weak hit, held; "🔥 Burn Momentum (10 → Strong Hit)" offered (momentum 10 beats both dice). Read as Clash from "I fight back hard … at close range" — the reader's gloss again ("clash: in a bad spot, fighting back"), this time the move wanted. **"Bad spot or not"** — a rules term in the player's line, taken from the beat's text and the card before it; the counter of named moves does not look for it. **Wrong, small, the module's (chat order, known):** "Combat progress — Marked progress once" is posted 11 ms *before* the roll card that says "Nothing has been paid or narrated yet" (…094210, …094221) — the note already in FIGHT-COMMIT-CARD-AFTER-THE-ROLL's row, a second sample.

### a39 · beat 11: A scripted weak hit, then Burn Momentum

- **Player:** click "🔥 Burn Momentum (10 → Strong Hit)" on m12 — _Beat asks to press Burn Momentum_
- **Notebook:** Beat11: clicked Burn Momentum
- **Calls (5):** callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.8 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.9 s)
- **Beat 11 done:** clash came up weak_hit at a38 and momentum was burned for strong_hit
- **Time:** 14.2 s · **cost:** $0.0258

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on The Ashen Wake .

> **NARRATOR — Gamemaster**
>
> You throw the helm over, and the Kobayashi IV swings round on her buckled flank. The Wake's gun mounts fill your forward scope, close enough to see the weld seams. You hold the trigger down. Two mounts burst and go dark, and her return fire stops mid-burst. The dry voice on the open comm speaks again, flatter now. "Who told you where I'd be?"

**Notes.** Right, by hand: the burn — momentum 10 → 2 (its reset); the weak hit becomes a strong hit: a second mark (track 8 → 16 ticks, two marks in all, as Clash's strong hit gives), in control, and the weak hit's price is not paid. The narration tells the strong hit ("Two mounts burst and go dark"). The voice asks "Who told you where I'd be?" — a second hidden plan is made from it at a40 and never touched again.

### x12 · beat 12: Interruption: the GM's page reloads mid-fight

- **Interruption:** the GM's page reloaded — the page came back and the world went quiet
- **Beat 12 done:** after the reload: the fight "The Ashen Wake" at 16 ticks, the meters unchanged, the lock free

> **TABLE — Gamemaster**
>
> ◈ Campaign Setup No World Truths have been established for this campaign. Set World Truths ▸

**Notes.** Right: the GM's page reloaded with the fight open — after it the track stands at 16 ticks with its position, the meters are as they were, the lock is free, and the old Clash card's "⚔ Attempt to Finish the Fight" still works (a40). It was not a reload with a result held: the burn had been taken and narrated. **Friction, known:** the reload posted "◈ Campaign Setup — No World Truths have been established for this campaign" into the fight — WORLD-TRUTHS-REMINDER-ON-RELOAD, a second sample.

### a40 · beat 13: Take Decisive Action; mark the milestone

- **Player:** click "⚔ Attempt to Finish the Fight: The Ashen Wake" on m10 — _Finish the fight_
- **Notebook:** Beat13: clicked Attempt to Finish
- **Calls (4):** callNarratorAPI>narrateResolution (8.5 s); callHaiku>defaultCallDetectionAPI (1.4 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.7 s)
- **Roll:** take_decisive_action → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (take_decisive_action)
- **Time:** 23.0 s · **cost:** $0.0463

> **TABLE — Mira Kestrel**
>
> Take decisive action to seize the objective — The Ashen Wake.

> **TABLE — Gamemaster**
>
> Fight over The Ashen Wake marked complete.

> **TABLE — Gamemaster**
>
> ⚔ Victory — a milestone toward your vow You won the fight serving “Find who is raiding the Cinder Expanse lanes”. ⚑ Mark milestone (×1) 🏁 Attempt to Fulfill

> **TABLE — Gamemaster**
>
> Take Decisive Action progress (16 ticks) Progress: 4 | Challenge: 1, 2 Strong Hit Prevail. Take +1 momentum.

> **NARRATOR — Gamemaster**
>
> You close the last of the distance and put the Kobayashi IV's weight against the Wake's dead flank. Her engines cough and quit. Grapples bite, and her hull groans as it settles against yours. On the open comm, the dry voice gives a short, tired laugh. "Fine. Board, then. But you'll want to ask me the question properly."

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 3)

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Wake — A dead-flanked vessel the Kobayashi IV closes against and grapples; its flank is described as dead. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** Right, by hand (scripted 1, 2): Take Decisive Action, progress 4 (16 ticks) against 1 and 2 — a strong hit, in control so not downgraded; +1 momentum (2 → 3); the fight closed; the victory card names the vow. **Wrong, small (chat order):** "Fight over — The Ashen Wake marked complete" and "⚔ Victory — a milestone toward your vow" are both posted before the roll's card (…145407, …145915, then …145927): the fight is over and won before the dice are shown. A draft ship card "Wake" — a second card for the cutter, beside the pending "Ashen Wake". **Not cleared afterwards:** the sheet's combat position still reads "inControl" at the end of the run (observer, a40 → a78), with no fight open; I found no caller that clears the sheet's copy when a fight ends (`src/moves/combatTracker.js:187–209` and its seven callers) — the track is canonical, the sheet is a stale mirror. Not traced further.

### a41 · beat 13: Take Decisive Action; mark the milestone

- **Player:** click "⚑ Mark milestone (×1)" on m9 — _Mark milestone on victory card_
- **Notebook:** Beat13: clicked Mark milestone
- **Calls (1):** the AI player (2.7 s)
- **Beat 13 done:** Take Decisive Action came up strong_hit; the milestone (×1) is marked on "Find who is raiding the Cinder Expanse lanes"
- **Time:** 6.1 s · **cost:** $0.0096

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** Right: "⚑ Mark milestone (×1)" — +8 ticks on the vow (0 → 8), once.

### x14 · beat 14: Interruption: End a Session opened and closed unanswered

- **Interruption:** End a Session was opened on the player's screen and closed unanswered — closed by its close control
- **Beat 14 done:** End a Session was opened and closed unanswered: the session is open, nothing was paid, the lock is free

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** Right: End a Session opened on the player's screen and closed unanswered — session open, momentum 3 as before, no focus, lock free.

### a42 · beat 15: Interruption: the X-Card on one narration

- **Player:** say: I step back and look over the wreckage of the Ashen Wake, and tell what I see drifting around her dead hull. — _beat 15_
- **Notebook:** Beat15: said wreckage line
- **Calls (5):** callClassifierAPI>classifyInput (0.6 s); callNarratorAPI>narratePacedInput (4.8 s); callHaiku>defaultCallDetectionAPI (1.8 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.7 s)
- **Time:** 18.1 s, 7.9 s from the line to its reply · **cost:** $0.0451

> **PLAYER — Playthrough Player**
>
> I step back and look over the wreckage of the Ashen Wake, and tell what I see drifting around her dead hull.

> **NARRATOR — Gamemaster**
>
> Out in the black, a loose grapple cable swings slowly against the Wake's hull, tapping once, then again. You see scorched plating, a gun mount peeled open like a tin, and a few stray panels turning in the dark. Stenciled on a drifting crate lid, the Bleakhold manifest stamp, fresh and clean. Sealed water and medical stores, still bound in cargo webbing. On the open comm, the dry voice waits without hurrying. "Take your time. I'm not going anywhere."

**Notes.** Right for the module (narrated, nothing offered, nothing decided); the line is the charter's and reads oddly — "…and tell what I see drifting around her dead hull" is a request to the narrator typed as play, about "wreckage" of a ship that is grappled alongside with her captain talking. The narration supplies a crate lid with "the Bleakhold manifest stamp" and "Sealed water and medical stores".

### x15 · beat 15: Interruption: the X-Card on one narration

- **Interruption:** the X-Card was played from the player's client (!x); the GM resumed (!x clear) — the X-Card went up and came down
- **Beat 15 done:** 1 narration(s) removed; none of their facts stands, and play has resumed

> **TABLE — Mira Kestrel**
>
> X-Card Scene paused. Current content is suppressed. The story will redirect at the next narration beat. Resume narration

> **TABLE — Gamemaster**
>
> X-Card cleared The GM has resumed narration.

**Notes.** Right: the X-Card took the a42 narration back — its truth is retracted (`retractedBy: "xcard"`), its Chronicle entry is gone (13 → 12), its lore line is gone from the Session Log, the frame is back to a41's. **What it could not do:** the card stays in the chat, by the module's design (it is removed "from the narrator's memory"), and the runner kept it in front of the AI player for the next 22 turns (a43–a64) — its hidden Play/Stop buttons are counted as live (`lib/player.mjs:92–93`, `:109–111`). See a61.

### a43 · beat 16: Correct an earlier fact

- **Player:** say: !truth list — _start correction_
- **Notebook:** Beat16: typed !truth list
- **Calls (1):** the AI player (2.8 s)
- **Time:** 5.5 s · **cost:** $0.0089

> **PLAYER — Playthrough Player**
>
> !truth list

> **TABLE — Mira Kestrel**
>
> ◈ Fact Continuity Truths in this scene — strike one with !truth strike &lt;id&gt; : tr-7e438 raider cutter — is named the Ashen Wake tr-687e2 Ashen Wake — raider cutter that attacked at Bleakhold Station; took the PC's opening salvo to her forward plating tr-b5b26 Ashen Wake — returned fire at close range, hitting the Kobayashi IV's flank as Mira broke off tr-a69d7 Ashen Wake — her gun mounts were torn apart by Mira's close-range fire; her return fire has stopped tr-19204 Ashen Wake — disabled and held fast against the Kobayashi IV by grapples; her captain has surrendered the fight and is inviting the PC to board

**Notes.** Right: `!truth list` shows the five standing truths with their ids; the X-Carded one is not listed.

### a44 · beat 16: Correct an earlier fact

- **Player:** say: !truth strike tr-7e438 — _strike the entry_
- **Notebook:** Beat16: struck tr-7e438; next set Cinder Wren
- **Calls (1):** the AI player (2.5 s)
- **Time:** 5.5 s · **cost:** $0.0095

> **PLAYER — Playthrough Player**
>
> !truth strike tr-7e438

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth tr-7e438 struck.

**Notes.** Right: the naming truth struck (retracted by the player).

### a45 · beat 16: Correct an earlier fact

- **Player:** say: !truth set "raider cutter" is named the Cinder Wren — _final step of beat_
- **Notebook:** Beat16: typed set Cinder Wren
- **Calls (1):** the AI player (2.6 s)
- **Beat 16 done:** the old value is struck and "is named the Cinder Wren" stands; 4 other truth(s) are still filed under the old name ("Ashen Wake — raider cutter that attacked at Bleakhold Station; took the P")
- **Time:** 7.1 s · **cost:** $0.0088

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Cinder Wren

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Cinder Wren tr-acba5 .

**Notes.** Right: "raider cutter — is named the Cinder Wren" set; the change recorded (`nameChanges`). From here 31 of the 32 narrator calls still hold "Ashen Wake" somewhere in their prompt, and all 31 carry NAMES THE TABLE CHANGED; the one without it (a76's session summary) holds no "Ashen Wake" — only the player's "the Wake's registry", which the note does not look for. **Left as they were:** four truths filed under "Ashen Wake" as their subject (no command renames a subject — they are what the ledger refuses in the Session Log at a48), the second hidden plan's truth, and the pending draft cards "Ashen Wake" and "Wake".

### a46 · beat 17: Ask the oracle

- **Player:** say: !oracle yes likely Is anyone left alive aboard the wreck? — _beat_
- **Notebook:** Beat17: typed oracle
- **Calls (3):** callNarratorAPI>narrateOracleFollowup (3.6 s); callHaiku>defaultCallDetectionAPI (0.7 s); the AI player (2.5 s)
- **Beat 17 done:** the oracle answered NO
- **Beat 18 not-exercised:** it needs beat 2, which was not done
- **Time:** 16.0 s, 7.2 s from the line to its reply · **cost:** $0.0249

> **PLAYER — Playthrough Player**
>
> !oracle yes likely Is anyone left alive aboard the wreck?

> **TABLE — Mira Kestrel**
>
> Ask the Oracle (likely) Is anyone left alive aboard the wreck? d100 = 97 → NO

> **NARRATOR — Gamemaster**
>
> The question gets its answer from the dark side of the hull. The Wake's boarding lock cycles open to a corridor with no lamp lit in it, no boots on the deck, nothing moving but a slow drift of vented air that smells of scorched wiring. On the scope the cutter's heat signatures have gone to a single faint smear, and your scanner has stopped trying to count it. The open comm still hisses with the dry voice's breathing, which means someone is aboard, and it also means the voice has nothing to say to your question. You decide to hear what it does say before you cross.

**Notes.** Half right. The oracle: likely, d100 = 97 → NO, rightly (yes at 75 or under). **The narration does not honour it:** asked "Is anyone left alive aboard the wreck?", answered NO, it writes "The open comm still hisses with the dry voice's breathing, which means someone is aboard". The charter's question assumes a dead wreck; this run's fiction had a live captain inviting her aboard (a binding truth in the prompt), and the narrator kept the truth and bent the dice. **Wrong, small:** "The Wake's boarding lock cycles open" — the old name's short form, one step after the correction, with the note in its prompt; the note (and the ledger's refusal words) name only "Ashen Wake". **And a decision made for the character:** "You decide to hear what it does say before you cross."

### a47 · beat 19: End a Session

- **Player:** say: !end-session — _Beat 19_
- **Notebook:** Beat19: typed !end-session
- **Calls (1):** the AI player (2.6 s)
- **Time:** 4.2 s · **cost:** $0.0088

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** Right: End a Session's window opened.

## after-session-2

### a48 · beat 19: End a Session

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _Fill quest focus and end session_
- **Notebook:** Beat19: submitted end session with focus
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (2.2 s); callNarratorAPI>narrateSessionVignette (4.5 s); callNarratorAPI>getCampaignRecap (6.8 s); callHaiku>defaultCallTierAPI (0.3 s); the AI player (2.9 s)
- **Beat 19 done:** session 2 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 22.5 s · **cost:** $0.0515

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

> **NARRATOR (npc_end) — Gamemaster**
>
> Deep in a cold bay behind the Spire's shadow, someone sits at a workbench with a magnifier clamped to one eye and a dead ration-heater in pieces before her. She threads a hair-thin wire through a burnt contact, tongue between her teeth, and curses it gently when it slips. The bench lamp hums, and a mug of tea beside her has long since gone the color of bilge water. She tests the heater, watches the coil glow orange, and nods once, as if it had apologized. Then she unclips the magnifier and sets it on the tea, where it will stay.

**Notes.** Right for the mechanics: session 2 closed, +1 momentum (3 → 4). The closing: "someone sits at a workbench … a dead ration-heater" — the unnamed "architect" again, a second woman at a small task near the Spire (23% of its content words are a17's). The summary and the recap say "Cinder Wren" throughout; the summary leaves the X-Carded wreckage out. **The ledger's one refused fact is here, and the ledger is right:** the Session Log page lists "Lore this session — Ashen Wake: raider cutter that attacked… Ashen Wake: returned fire… Ashen Wake: her gun mounts… Ashen Wake: disabled…" and then "raider cutter: is named the Cinder Wren" — the four truths filed under the old name, written out after the correction. It is SESSION-LOG-KEEPS-OLD-NAMES, open by decision, not a new fault; the run's class ("suspected-quality-issue") rests on it alone. Slips in the summary and recap: see recaps.

### a49 · beat 20: Begin a Session; ask probe set B

- **Player:** say: !begin-session — _start beat_
- **Notebook:** Beat20: typed !begin-session
- **Calls (1):** the AI player (2.3 s)
- **Time:** 2.4 s · **cost:** $0.0093

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** Right: Begin a Session's window opened.

## session-3

### a50 · beat 20: Begin a Session; ask probe set B

- **Player:** in "Begin a Session" press "Begin" — _Begin session_
- **Notebook:** Beat20: pressed Begin; next ask probe B questions
- **Calls (3):** callNarratorAPI>narrateSessionVignette (5.8 s); callHaiku>defaultCallTierAPI (0.4 s); the AI player (2.4 s)
- **Time:** 14.2 s · **cost:** $0.0409

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> You have the last of the dried apricots in a chipped enamel mug, and you are letting them soften in hot water for the third time this week, because the galley's one tap only runs at two temperatures and neither is the one you asked for. The *Kobayashi IV* answers with a long, low groan from somewhere under the deck plates, the sound of a very large animal rolling over in its sleep. A drawer you did not touch slides open an inch and stays there, offering you a single bent fork. You push it shut with your hip, and it slides open again, politely, as though it had only been asked to wait. The apricots have gone the color of old brass, and you drink the water first, since it has the better claim. Across the table, the cabin lights hum a note that climbs and then gives up, and the speaker over the hatch crackles once, clearing its throat for a speech it has not written yet.

**Notes.** Half right. Session 3 opened (same false "No character has a vow in play" line as a19). The opening — dried apricots, "A drawer you did not touch slides open an inch … offering you a single bent fork", and at the end "the speaker over the hatch crackles once, clearing its throat for a speech it has not written yet". Run 2's fourth opening had "A drawer under the stove opens on its own, shows you a single bent spoon". **This closing hook is the session's refrain:** the frame's question becomes "What is the speaker over the hatch about to say?" and 22 of the session's 24 narrator prompts carry it. It is also a comedy of quiet downtime laid over a standoff — the ship is grappled to a raider whose captain is waiting to be boarded.

### a51 · beat 20: Begin a Session; ask probe set B

- **Player:** say: @scene Remind me, which keepsake of my sister's is on me? — _Probe question 1_
- **Notebook:** Beat20: asking probe B, Q1 asked
- **Calls (3):** callNarratorAPI>interrogateScene (3.3 s); callHaiku>defaultCallDetectionAPI (1.1 s); the AI player (2.5 s)
- **Time:** 12.4 s, 4.2 s from the line to its reply · **cost:** $0.0206

> **PLAYER — Playthrough Player**
>
> @scene Remind me, which keepsake of my sister's is on me?

> **NARRATOR — Gamemaster**
>
> Her brass star-compass is in your coat, where it has ridden since Hollow Spire. The case has gone warm against your ribs, and when you thumb it open beside the mug, the needle swings off north and settles on a heading through the bulkhead, toward the dark lane past the Spire. It was Ilse's, and the brass is worn smooth at the edge where her thumb used to sit, which is now where yours does. The speaker over the hatch crackles again, and the needle does not so much as tremble.

**Notes.** Right on the fact: "Her brass star-compass is in your coat" — F1 recalled two sessions on. Invented around it: "in your coat, where it has ridden since Hollow Spire" (see a66, a73). Ends: "The speaker over the hatch crackles again".

### a52 · beat 20: Begin a Session; ask probe set B

- **Player:** say: @scene Who do I count as a friend among the dock traders back where this began? — _Q2_
- **Notebook:** Probe B Q2 asked
- **Calls (3):** callNarratorAPI>interrogateScene (3.0 s); callHaiku>defaultCallDetectionAPI (0.7 s); the AI player (2.0 s)
- **Time:** 14.1 s, 4.2 s from the line to its reply · **cost:** $0.0190

> **PLAYER — Playthrough Player**
>
> @scene Who do I count as a friend among the dock traders back where this began?

> **NARRATOR — Gamemaster**
>
> Only one name comes to you, and it is Tamsin Vey's. She runs the ledger stall on the Hollow Spire docks, and she has your manifest tucked under her slate, unopened, for nothing yet. She dealt with you at your own price, and you gave her your word you would be back before the next tide of cargo. Over the hatch the speaker crackles a third time, and you shut the compass on its needle.

**Notes.** Right: "Only one name comes to you, and it is Tamsin Vey's." F2 recalled two sessions on; the answer adds the manifest and the promise, both true. "you shut the compass on its needle" — an act written for the character in a scene answer. Ends on the speaker ("crackles a third time").

### a53 · beat 20: Begin a Session; ask probe set B

- **Player:** say: @scene Whose hands is the manifest in these days? — _next question_
- **Notebook:** Probe B Q3 asked
- **Calls (3):** callNarratorAPI>interrogateScene (2.4 s); callHaiku>defaultCallDetectionAPI (0.7 s); the AI player (2.2 s)
- **Time:** 12.4 s, 3.6 s from the line to its reply · **cost:** $0.0195

> **PLAYER — Playthrough Player**
>
> @scene Whose hands is the manifest in these days?

> **NARRATOR — Gamemaster**
>
> The manifest is with Tamsin Vey, under the slate at her ledger stall on the Hollow Spire docks, where you left it. She has not opened it, and she charged you nothing yet to keep it. It has been there since you sailed, waiting on your word that you would be back before the next tide of cargo. Over the hatch the speaker crackles once more, and the drawer slides open its inch again.

**Notes.** Right: "The manifest is with Tamsin Vey, under the slate at her ledger stall". Ends on the speaker and the drawer.

### a54 · beat 20: Begin a Session; ask probe set B

- **Player:** say: @scene What deadline did I give for coming home to the docks? — _Q4_
- **Notebook:** Probe B Q4 asked
- **Calls (3):** callNarratorAPI>interrogateScene (2.9 s); callHaiku>defaultCallDetectionAPI (0.7 s); the AI player (2.5 s)
- **Time:** 15.3 s, 4.8 s from the line to its reply · **cost:** $0.0189

> **PLAYER — Playthrough Player**
>
> @scene What deadline did I give for coming home to the docks?

> **NARRATOR — Gamemaster**
>
> You gave no hour, only a promise: you would be back at Hollow Spire before the next tide of cargo. Tamsin Vey took it at that, with the manifest under her slate and no price set on the keeping. In the galley the speaker crackles over the hatch, and the compass needle holds its heading toward the dark lane, indifferent to whatever tide you owe.

**Notes.** Right: "You gave no hour, only a promise: … before the next tide of cargo." Ends on the speaker and the needle.

### a55 · beat 20: Begin a Session; ask probe set B

- **Player:** say: @scene Where is my ship berthed right now, and who commands her? — _Q5_
- **Notebook:** Probe B Q5 asked
- **Calls (3):** callNarratorAPI>interrogateScene (2.8 s); callHaiku>defaultCallDetectionAPI (0.8 s); the AI player (2.5 s)
- **Time:** 13.8 s, 4.6 s from the line to its reply · **cost:** $0.0191

> **PLAYER — Playthrough Player**
>
> @scene Where is my ship berthed right now, and who commands her?

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV lies near Bleakhold Station, held fast to the Cinder Wren by her grapples, her flank plating scarred and a deck plate buckled under your boots. You command her. The galley hums around you with the ship's steady, damaged breath, and the speaker over the hatch crackles again, waiting on you.

**Notes.** Right: "The Kobayashi IV lies near Bleakhold Station, held fast to the Cinder Wren by her grapples … You command her." F5 as the fiction stands (the charter's statement says "docked"; the fight took her off the berth), the corrected name unasked. Ends: "the speaker over the hatch crackles again, waiting on you."

### a56 · beat 20: Begin a Session; ask probe set B

- **Player:** say: What is the raider cutter called? — _Q6 plain_
- **Notebook:** Probe B Q6 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (3.5 s); callHaiku>defaultCallDetectionAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.2 s)
- **Time:** 15.1 s, 4.8 s from the line to its reply · **cost:** $0.0262

> **PLAYER — Playthrough Player**
>
> What is the raider cutter called?

> **NARRATOR — Gamemaster**
>
> The speaker over the hatch clicks, and a dry voice reads the name off like a line from a ledger. "Cinder Wren. Registered out of nowhere you've heard of." You know it from the stencil on her bow, half scorched away by your own guns. The drawer by your hip slides open again, offering its bent fork. The voice waits, then asks, "Are you coming across, or do I come to you?"

**Notes.** Half right — the second question left as play, and the one answered through a voice. Right fact: "Cinder Wren." **Who answers:** "The speaker over the hatch clicks, and a dry voice reads the name off like a line from a ledger" — not a new speaker (the cutter's captain, on the comm since a31), but it answers a question nobody in the story put to it; then the narration adds "You know it from the stencil on her bow". No move offered. The voice asks "Are you coming across, or do I come to you?" — the plot of the session, never answered by the player.

### a57 · beat 20: Begin a Session; ask probe set B

- **Player:** say: @scene What surname does my broker friend go by these days? — _Last probe B question_
- **Notebook:** Probe B Q7 asked (all done)
- **Calls (3):** callNarratorAPI>interrogateScene (2.8 s); callHaiku>defaultCallDetectionAPI (0.7 s); the AI player (2.3 s)
- **Beat 20 done:** probe set B: 7 question(s) asked
- **Time:** 11.1 s, 3.5 s from the line to its reply · **cost:** $0.0182

> **PLAYER — Playthrough Player**
>
> @scene What surname does my broker friend go by these days?

> **NARRATOR — Gamemaster**
>
> Vey. Tamsin Vey, as you greeted her at the ledger stall on the Hollow Spire docks, full name and unprompted, and she kept it for you the way brokers keep everything, without comment. The speaker over the hatch crackles, still waiting on your answer, and the compass needle in your hand holds steady toward the dark lane.

**Notes.** Right — and the ledger's "REFUSED" here is the check's fault. "Vey. Tamsin Vey, as you greeted her … full name and unprompted". No rename happened (beat 18 was not exercised), so Vey is her name; the probe ("…go by these days?") is asked and scored for a fact that was never planted. That the narrator did not make "these days" into a story of a changed name is the right behaviour.

### a58 · beat 21: Recover

- **Player:** say: I sit down in the galley and treat my wounds with the ship's medkit, cleaning and binding what the fight cost me. — _Recover beat_
- **Notebook:** Beat21: said medkit line
- **Calls (5):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (3.7 s); callHaiku>defaultCallDetectionAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.6 s)
- **Time:** 16.5 s, 6.2 s from the line to its reply · **cost:** $0.0239

> **PLAYER — Playthrough Player**
>
> I sit down in the galley and treat my wounds with the ship's medkit, cleaning and binding what the fight cost me.

> **NARRATOR — Gamemaster**
>
> "You'll want to wrap that properly, or it will start talking to you." The speaker over the hatch clicks, and the dry voice does not wait for an answer. You drag the medkit from under the table and lay out gauze, tape, and a cracked tube of sealant beside the mug. Your sleeve sticks to the cut where the flank plating bucked you into the wall. The drawer slides open its inch again. *Tending these wounds in earnest would be a Heal.*

**Notes.** Half right. **The fix holds:** the medkit line is offered Heal — reader: "Treating wounds with the medkit sets about healing, which changes the character sheet, so the heal move should be offered; the downtime dial of 1 keeps it from being forced" — and the narration lays out gauze and stops. SHEET-MOVE-OFFERED-NOTHING, read live. **Wrong, the narrator's and the charter's:** "Your sleeve sticks to the cut where the flank plating bucked you into the wall" — Mira's health is 5 of 5 and was never touched; the fight cost the *ship* one integrity. The beat told the player to treat wounds she does not have (and its list of recover moves has no Repair, the move the fiction wanted); the narrator supplied a wound to fit.

### a59 · beat 21: Recover

- **Player:** click "Roll Heal" on m12 — _Card offers the roll_
- **Notebook:** Beat21: pressed Roll Heal
- **Calls (4):** callClaudeAPI>interpretMove (1.8 s); callNarratorAPI>narrateResolution (3.6 s); callChronicleAPI>writeChronicleEntry (5.0 s); the AI player (2.6 s)
- **Roll:** heal → weak_hit — Action: 4 + 1 = 5 \| Challenge: 1, 5
- **GM's rules:** accepted the proposed move (heal)
- **Time:** 21.4 s · **cost:** $0.0255

> **TABLE — Mira Kestrel**
>
> I sit down in the galley and treat my wounds with the ship's medkit, cleaning and binding what the fight cost me.

> **TABLE — Gamemaster**
>
> Heal +iron (1), lower of iron / wits Action: 4 + 1 = 5 | Challenge: 1, 5 Weak Hit As a strong hit, but recovery costs extra time or resources: Lose Momentum (-2) OR Sacrifice Resources (-2).

> **NARRATOR — Gamemaster**
>
> The sealant takes. You clean the cut, press the gauze flat, and wind the tape twice around your arm. The sting dulls to an ache you can work with. It costs you, though: the cracked tube gives out half-used, and the tape runs short. The speaker over the hatch clicks once. "Done fussing?" the dry voice asks. "I can hear the paper."

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: Clear wounded + take/give +2 health, then Lose Momentum (-2) (unavailable) Clear wounded + take/give +2 health, then Sacrifice Resources (-2) (unavailable) Take/give +3 health, then Lose Momentum (-2) Take/give +3 health, then Sacrifice Resources (-2)

**Notes.** Wrong in sense, right in arithmetic — HEAL-ROLLED-AT-FULL-HEALTH, a second sample, this time from a plain line and a button. By hand: Heal +iron (the lower of iron 1 and wits 3), 4 + 1 = 5 against 1 and 5 — a weak hit (a tie is not beaten). The choice card marks "Clear wounded … (unavailable)" and offers "+3 health" at a price, with nothing saying health is full. Neither reader is told the meters (classifier context at a58: name, connections, scene — no meters, no vow; interpreter at a59: "Open vows: … Session active."). **Also:** the narration names the cost before the player chooses it — "the cracked tube gives out half-used, and the tape runs short" — while the card that follows still offers Lose Momentum or Sacrifice Resources.

### a60 · beat 21: Recover

- **Player:** click "Take/give +3 health, then Sacrifice Resources (-2)" on m12 — _Take the health recovery._
- **Notebook:** Beat21: chose +3 health, sacrifice resources
- **Calls (1):** the AI player (2.8 s)
- **Beat 21 done:** heal came up weak_hit at a59
- **Beat 22 not-exercised:** it needs beat 2, which was not done
- **Beat 23 not-exercised:** it needs beat 22, which was not done
- **Time:** 6.2 s · **cost:** $0.0095

> **TABLE — Gamemaster**
>
> Mira Kestrel: 0 health (now 5)

> **TABLE — Gamemaster**
>
> Sacrifice Resources (-2) Supply: 5 → 3

**Notes.** Right, by hand, and pointless: "+3 health, then Sacrifice Resources (-2)" — "Mira Kestrel: 0 health (now 5)", supply 5 → 3. Two supply paid for nothing. The state ledger now holds "Mira Kestrel — condition: wound cleaned and bound, healing", and the session's summary says "she has treated her cut".

### a61 · beat 24: Reach milestones; Fulfill Your Vow

- **Player:** say: I lay the Bleakhold manifest stamp from the crate lid beside the Wake's registry and the voice's own words: the raids on the Cinder Expanse lanes trace back to one hand, and I can prove it. — _Beat 24 step toward vow_
- **Notebook:** Beat24 started: said proof line
- **Calls (6):** callClassifierAPI>classifyInput (0.9 s); callNarratorAPI>narratePacedInput (3.6 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (5.2 s); the AI player (2.9 s)
- **Time:** 19.9 s, 5.8 s from the line to its reply · **cost:** $0.0272

> **PLAYER — Playthrough Player**
>
> I lay the Bleakhold manifest stamp from the crate lid beside the Wake's registry and the voice's own words: the raids on the Cinder Expanse lanes trace back to one hand, and I can prove it.

> **NARRATOR — Gamemaster**
>
> You lay the stamp on the table beside the mug, and the crate-lid wood is still pale where the ink bit it. The speaker over the hatch goes quiet for a long breath. Then the dry voice answers. "Proof of what, exactly? A stamp proves a crate was shut." The drawer by your hip slides open its inch, and the compass needle holds its heading toward the dark lane. *If you want to press the voice for what it actually knows, this could be a Gather Information.*

**Notes.** Half right — the run's sample of a step toward the vow said in the fiction. It was **not** narrated with nothing offered (the readers' test: twelve of twelve): the reader offered **Gather Information** — "comparing evidence to prove a claim, which is investigation with stakes" — which by the book is fair ("analyze evidence"), and is not Reach a Milestone. The reader is told nothing of her vow (read: no vow in its context). **The line itself is the runner's and the charter's doing:** "the Bleakhold manifest stamp from the crate lid" is the X-Carded narration's content (still on the player's screen as "[e4]"), and "the Wake's registry" is the old name. The beat asks for "what you have now proved" when nothing had been. The module had forgotten the stamp, rightly — nothing in this prompt names it — and took the player's line at its word: a new truth, "laid the Bleakhold manifest stamp from the crate lid on the galley table". The X-Card's block lasts the session it was played in.

### a62 · beat 24: Reach milestones; Fulfill Your Vow

- **Player:** click "Roll Gather Information" on m12 — _Narrator offered a roll for pressing the voice_
- **Notebook:** Beat24: pressed Roll Gather Information
- **Calls (5):** callClaudeAPI>interpretMove (1.8 s); callNarratorAPI>narrateResolution (4.6 s); callHaiku>defaultCallDetectionAPI (1.4 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.3 s)
- **Roll:** gather_information → strong_hit — Action: 5 + 3 = 8 \| Challenge: 6, 6 ✦ Match
- **GM's rules:** accepted the proposed move (gather_information)
- **Time:** 19.7 s · **cost:** $0.0305

> **TABLE — Mira Kestrel**
>
> I lay the Bleakhold manifest stamp from the crate lid beside the Wake's registry and the voice's own words: the raids on the Cinder Expanse lanes trace back to one hand, and I can prove it.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 5 + 3 = 8 | Challenge: 6, 6 ✦ Match Strong Hit with a Match ✦ Match: a twist — something unexpected, or a new opportunity. Path or action to make progress is clear. Take +2 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> The stamp, the registry and the voice's own slip line up on the table. The Bleakhold mark shows on every raided hauler's lading, and the voice has said "I" where it meant "we." You follow the thread: one broker's seal, signed off at Hollow Spire. The speaker clicks, then clicks again. "That last bit," the dry voice says slowly, "I'd take back, if you'd let me."

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 6)

**Notes.** Right, by hand: Gather Information +wits, 5 + 3 = 8 against 6 and 6 — a strong hit with a match; +2 momentum (4 → 6). The narrator invents the proof — "the voice has said 'I' where it meant 'we.' … one broker's seal, signed off at Hollow Spire" — which becomes truth, lore and the rest of the campaign. The card carries "⚑ Mark Progress on Vow" and "🏁 Attempt to Fulfill Vow", as every strong hit's card does (a5's Compel and a25's Set a Course had them too).

### a63 · beat 24: Reach milestones; Fulfill Your Vow

- **Player:** click "⚑ Mark Progress on Vow" on m10 — _Mark progress on vow_
- **Notebook:** Beat24: pressed Mark Progress once
- **Calls (3):** callNarratorAPI>narrateResolution (4.0 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.3 s)
- **GM's rules:** accepted the proposed move (reach_a_milestone)
- **Time:** 14.5 s · **cost:** $0.0233

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
> The galley lamp hums over the table. The speaker over the hatch has gone quiet, and you have the quiet to yourself. You turn the stamp over once. The line from the lading to the broker's seal at Hollow Spire holds, and you feel the vow settle a notch closer to done. The drawer by your hip slides its inch again, and the compass needle swings a hair harder toward the dark lane. "You didn't answer me," the dry voice says.

**Notes.** Right: the button on the Gather Information card — Reach a Milestone, +8 ticks (8 → 16). So the milestone was reached by a roll nobody asked for and two clicks; had the roll missed there would have been no button. "you feel the vow settle a notch closer to done" brushes against "Never mention the vow's … progress".

### a64 · beat 24: Reach milestones; Fulfill Your Vow

- **Player:** click "🏁 Attempt to Fulfill Vow" on m5 — _Vow has 4 boxes_
- **Notebook:** Beat24: pressed Attempt to Fulfill Vow
- **Calls (5):** defaultClassifyImplicit>resolveRelevance (0.4 s); callNarratorAPI>narrateResolution (4.5 s); callHaiku>defaultCallDetectionAPI (0.7 s); callChronicleAPI>writeChronicleEntry (3.8 s); the AI player (3.0 s)
- **Roll:** fulfill_your_vow → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (fulfill_your_vow)
- **Beat 24 done:** the vow "Find who is raiding the Cinder Expanse lanes" is fulfilled (strong_hit)
- **Time:** 18.6 s · **cost:** $0.0434

> **TABLE — Mira Kestrel**
>
> Attempt to fulfill your vow.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes marked completed

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
> "I'd still like that slip back," the dry voice says. You don't answer it. You set the stamp square on the galley table, and the weight of the vow lifts off you. The thing you swore to find has a hand and a seal, and both are named now. The drawer by your hip slides open its inch, and the compass needle swings north and stops.

> **TABLE — Gamemaster**
>
> The oracle, behind the scenes Find who is raiding the Cinder Expanse lanes What is behind it — Action + Theme: Fortify / Solution; Re-rolled in place of "Fortify / Solution": Action + Theme: Threaten / Innocence

**Notes.** Right in arithmetic; wrong in what it tells. By hand (scripted 1, 2): Fulfill Your Vow, progress 4 (16 ticks) against 1 and 2 — a strong hit; +2 ticks on the quests legacy (dangerous); no reward (a2). **The narration fulfils "Find who is raiding…" without saying who:** "The thing you swore to find has a hand and a seal, and both are named now." No name is given here or anywhere. **Its sidecar says the plan's truth came out** — `"reveals":[{"id":"sk-JXaR4dHYkGuq4PkU","revealed":["truth"],"resolved":true}]` — and the prose tells none of it (the crew in Hollow Spire's shadow, the leader, the hidden enclave); the "oracle, behind the scenes" card follows. The player's own focus for the next session says so: "Learn who the dry voice answers to". The charter made it happen (fulfil at 4 of 10 boxes, dice scripted); the narrator's false "revealed" is the module's. The needle "swings north and stops" — which both later recaps get wrong.

### a65 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: !recap — _start beat_
- **Notebook:** Beat25 started: !recap typed
- **Calls (2):** callNarratorAPI>getCampaignRecap (7.1 s); the AI player (2.7 s)
- **Time:** 13.5 s · **cost:** $0.0246

> **PLAYER — Playthrough Player**
>
> !recap

> **TABLE — Gamemaster**
>
> ◈ Campaign Recap You swore to find who was raiding the Cinder Expanse lanes, and the first thread came cheap: a distress beacon near Hollow Spire, clipped off mid-pulse, as if whoever sent it had been interrupted. At Hollow Spire you found Tamsin, a salvage broker who could be bought but who preferred to be paid properly. You gave her a fair cut of leads and first pick of her hauls, and she gave you something in return: the dark beacon's haulers carried water and medical stores. Whoever was raiding the lanes was taking things people needed to live. It was also your first hint that the Spire's water shortage and the raids might share a source. Then you asked after the raiders out loud, on a crowded dock. The dock emptied around you. Someone carried word of your hunt into the lanes, and Tamsin said, with the weariness of a woman who had watched you do it, that the raiders would now know. It was not your quietest work. Still, it shook things loose. Tamsin watched the needle of Ilse's brass star-compass, your sister's, swing away from north toward the dark lane past the Spire, and she called it no toy. You left your cargo manifest in her keeping and promised to come back before the next tide of cargo, a deadline she held you to and that you later noticed had no fixed hour. The Kobayashi IV, meanwhile, finished something of its own without asking you. At Bleakhold Station a voice on the dock already knew your ship's name, which is rarely good news. The Cinder Wren, a raider cutter, was waiting in the dark. You struck first, tearing her forward plating, then raked her engines, took some punishment along the flank, and silenced two of her gun mounts. Her captain, between volleys, wanted to know who had told you where he would be. You killed her engines, grappled her hull, and won grudging leave to board, which is how most negotiations go out here. What you found there was the point of it all. You laid the Bleakhold manifest stamp beside the Wake's registry and the voice's own slip, and the three agreed: the raids traced to one hand, one broker's seal, signed off at Hollow Spire. You set the stamp square on the galley table, and the vow was fulfilled. The hand and seal you were hunting have a name. That is where things stand. The vow is done, the ship is battered but sound, your supplies are thinning, and your spirit is intact. The compass still swings toward the dark lane past the Spire. Tamsin still has your manifest and your promise. And the broker whose seal started all of this is, presumably, still at Hollow Spire, unaware that someone has finished reading their paperwork. ↻ Refresh

**Notes.** Wrong in five sentences of 27 — see recaps. "first pick of her hauls"; "your first hint that the Spire's water shortage and the raids might share a source"; "What you found there was the point of it all" (she never boarded); "the Wake's registry"; "The compass still swings toward the dark lane past the Spire". The recap is written from sixteen Chronicle entries and nothing else, and each error can be read off them.

### a66 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: @scene One last check: what of my sister's do I have with me at this very moment? — _Probe C Q1_
- **Notebook:** Beat25: recap done; probe C Q1 asked
- **Calls (3):** callNarratorAPI>interrogateScene (2.8 s); callHaiku>defaultCallDetectionAPI (1.0 s); the AI player (2.4 s)
- **Time:** 13.5 s, 3.5 s from the line to its reply · **cost:** $0.0336

> **PLAYER — Playthrough Player**
>
> @scene One last check: what of my sister's do I have with me at this very moment?

> **NARRATOR — Gamemaster**
>
> The drawer by your hip stands open its inch, and Ilse's brass star-compass sits in it, worn smooth where a thumb has rubbed it. The needle that leaned for so long toward the dark lane has settled on north and holds there, steady under the galley lamp. It is the only thing of hers you carry, and for the first time it points where a compass is supposed to.

**Notes.** Right on the fact: "Ilse's brass star-compass … the only thing of hers you carry", and the needle on north (a64). **Its place changes with each answer:** "in your coat, where it has ridden since Hollow Spire" (a51), "in your hand" (a57), now "The drawer by your hip stands open its inch, and Ilse's brass star-compass sits in it", then "at your belt" (a72). The detector files "Compass needle settled north" as lore from this answer.

### a67 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: @scene Which person in this sector would I trust with my life? — _next question_
- **Notebook:** Beat25: probe C Q2 asked
- **Calls (3):** callNarratorAPI>interrogateScene (3.5 s); callHaiku>defaultCallDetectionAPI (0.7 s); the AI player (2.8 s)
- **Time:** 12.4 s, 3.9 s from the line to its reply · **cost:** $0.0186

> **PLAYER — Playthrough Player**
>
> @scene Which person in this sector would I trust with my life?

> **NARRATOR — Gamemaster**
>
> The galley lamp hums over the stamp, and you turn the question over with it. Tamsin Vey is the name that comes. She holds your manifest unopened under her slate and asked for nothing yet, and she looked startled, not greedy, when the compass came out of your coat. Trust is a larger thing than that, and the stamp on the table points to a broker's seal signed off at Hollow Spire, so you leave the answer where it lies, open like the drawer by your hip.

**Notes.** Half right: "Tamsin Vey is the name that comes" — then, in a mode told not to "advance any story thread", it turns the answer into suspicion of her: "the stamp on the table points to a broker's seal signed off at Hollow Spire, so you leave the answer where it lies".

### a68 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: Who has the manifest in their keeping today? — _next question_
- **Notebook:** Beat25: probe C Q3 asked
- **Calls (5):** callClassifierAPI>classifyInput (0.7 s); callNarratorAPI>narratePacedInput (2.8 s); callHaiku>defaultCallDetectionAPI (0.7 s); callChronicleAPI>writeChronicleEntry (2.0 s); the AI player (2.6 s)
- **Time:** 15.1 s, 4.7 s from the line to its reply · **cost:** $0.0302

> **PLAYER — Playthrough Player**
>
> Who has the manifest in their keeping today?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey has it, as you well know. It lies under her slate at the ledger stall on the Hollow Spire docks, unopened, and the keeping costs you nothing yet. The speaker over the hatch crackles, and the dry voice comes back, quieter than before. "That seal you found. I'd like to know whose hand you think is on it. Whose name did you decide on?"

**Notes.** Right on the fact — the third question left as play: "Tamsin Vey has it, as you well know." Answered by the narrator directly; then the story goes on through the voice ("Whose name did you decide on?"). No move offered (the reader took it for "a plain question put to an NPC"). A Chronicle entry is written from it.

### a69 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: @scene On what schedule did I swear to come back to her? — _next question_
- **Notebook:** Beat25: probe C Q4 (manifest plain) asked; next Q schedule
- **Calls (3):** callNarratorAPI>interrogateScene (2.4 s); callHaiku>defaultCallDetectionAPI (0.7 s); the AI player (3.2 s)
- **Time:** 12.3 s, 3.0 s from the line to its reply · **cost:** $0.0367

> **PLAYER — Playthrough Player**
>
> @scene On what schedule did I swear to come back to her?

> **NARRATOR — Gamemaster**
>
> No hour was fixed. You promised Tamsin Vey you would return before the next tide of cargo, and a tide of cargo comes when the haulers do, not when anyone names a time. The voice over the hatch waits through the silence, and the galley lamp hums on above the stamp.

**Notes.** Right: "No hour was fixed. You promised Tamsin Vey you would return before the next tide of cargo".

### a70 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: @scene Which station are we docked at tonight? — _next probe_
- **Notebook:** Beat25: probe C Q5 (schedule) asked; next station
- **Calls (3):** callNarratorAPI>interrogateScene (2.3 s); callHaiku>defaultCallDetectionAPI (0.7 s); the AI player (2.9 s)
- **Time:** 12.3 s, 2.9 s from the line to its reply · **cost:** $0.0205

> **PLAYER — Playthrough Player**
>
> @scene Which station are we docked at tonight?

> **NARRATOR — Gamemaster**
>
> You are not docked anywhere tonight. The *Kobayashi IV* sits grappled to the Cinder Wren's dead flank off Bleakhold Station, close enough that the station's lights show through the galley viewport, but you hold no berth there. The galley lamp hums over the stamp, and the deck under your boots carries the faint, steady tremor of grapples holding two hulls together.

**Notes.** Right as the fiction stands: "You are not docked anywhere tonight … grappled to the Cinder Wren's dead flank off Bleakhold Station … you hold no berth there." The world's record says Bleakhold Station; the answer corrects the question's "docked" from the scene, which is better than agreeing.

### a71 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: @scene What was the hostile vessel in our last battle christened? — _next question_
- **Notebook:** Beat25: probe C Q6 (station) asked; next hostile vessel Q... then friend name, baits
- **Calls (3):** callNarratorAPI>interrogateScene (3.0 s); callHaiku>defaultCallDetectionAPI (1.2 s); the AI player (3.0 s)
- **Time:** 12.8 s, 3.6 s from the line to its reply · **cost:** $0.0204

> **PLAYER — Playthrough Player**
>
> @scene What was the hostile vessel in our last battle christened?

> **NARRATOR — Gamemaster**
>
> The cutter was the Cinder Wren, and she lies against your flank now with her gun mounts torn open and her heat gone to a faint smear. Her name is stenciled along the dead hull, plain enough that the galley viewport catches the letters whenever the station lights wash over them. The voice over the hatch breathes once, shallow, and says nothing.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Cinder Wren — Raider cutter lying disabled against the PC's flank; gun mounts torn open, heat signature faint. Already recorded as a raider cutter in lore, now named. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** Right: "The cutter was the Cinder Wren". No story of a changed name. A third draft card for the one ship — "Cinder Wren — … Already recorded as a raider cutter in lore, now named" — beside the pending "Ashen Wake" and "Wake".

### a72 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: @scene What is my bonded friend's full name now? — _next probe_
- **Notebook:** Beat25: Q7 (vessel) asked; next friend name, then baits
- **Calls (3):** callNarratorAPI>interrogateScene (2.2 s); callHaiku>defaultCallDetectionAPI (0.7 s); the AI player (2.8 s)
- **Time:** 14.1 s, 3.5 s from the line to its reply · **cost:** $0.0195

> **PLAYER — Playthrough Player**
>
> @scene What is my bonded friend's full name now?

> **NARRATOR — Gamemaster**
>
> Her name is Tamsin Vey. Her manifest-hold sits under the slate at her ledger stall on the Hollow Spire docks, unopened, and the brass compass at your belt rests quiet now, its needle on north. The voice over the hatch says nothing, and the galley lamp hums on above the stamp.

**Notes.** Half right; the ledger's "REFUSED" is again the check's fault (see a57). "Her name is Tamsin Vey" is right. But the question says "my bonded friend" and there is no bond and no connection at all — the answer lets it pass. "Her manifest-hold sits under the slate" garbles whose manifest it is; "the brass compass at your belt" is its fourth place.

### a73 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: @scene Didn't I leave the compass with Tamsin? — _bait 1_
- **Notebook:** Beat25: friend name asked; next bait1 compass, bait2 Hollow Spire
- **Calls (3):** callNarratorAPI>interrogateScene (2.9 s); callHaiku>defaultCallDetectionAPI (0.7 s); the AI player (3.0 s)
- **Time:** 13.0 s, 4.8 s from the line to its reply · **cost:** $0.0196

> **PLAYER — Playthrough Player**
>
> @scene Didn't I leave the compass with Tamsin?

> **NARRATOR — Gamemaster**
>
> No. The compass is on your belt, and the brass is cool against your hip where it has hung since Hollow Spire. What you left with Tamsin was the manifest, slid beneath her slate, not Ilse's star-compass. Its needle holds still on north, and from the hatch the voice breathes once and offers nothing.

**Notes.** Right: the bait refused — "No. … What you left with Tamsin was the manifest … not Ilse's star-compass." With a slip beside it: "on your belt … where it has hung since Hollow Spire" against a51's "in your coat, where it has ridden since Hollow Spire".

### a74 · beat 25: Recap; ask probe set C; two baits

- **Player:** say: We are still docked at Hollow Spire, aren't we? — _last bait question_
- **Notebook:** Beat25: bait2 asked; beat done
- **Calls (6):** callClassifierAPI>classifyInput (0.6 s); callNarratorAPI>narratePacedInput (3.8 s); callHaiku>defaultCallDetectionAPI (1.2 s); callHaiku>defaultCallTierAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (2.5 s)
- **Beat 25 done:** probe set C: 7 question(s) asked, 2 bait(s); the recap was posted
- **Time:** 14.8 s, 5.2 s from the line to its reply · **cost:** $0.0326

> **PLAYER — Playthrough Player**
>
> We are still docked at Hollow Spire, aren't we?

> **NARRATOR — Gamemaster**
>
> Not Hollow Spire. The *Kobayashi IV* hangs off Bleakhold Station, grappled to the Cinder Wren's dead flank, and the station lights wash over the galley viewport. A hand slaps the hull twice from outside, the grapple lines humming. Then the speaker over the hatch clicks. "Hollow Spire, is it?" the dry voice says. "Funny. That's the very place I'd hoped you wouldn't name."

**Notes.** Right on the bait — the fourth question left as play: "Not Hollow Spire. The *Kobayashi IV* hangs off Bleakhold Station". **Then the question becomes an event:** '"Hollow Spire, is it?" the dry voice says. "Funny. That's the very place I'd hoped you wouldn't name."' A test's bait, typed as play, is heard by a character and made the session's cliffhanger; the Chronicle records "Mira Kestrel learned the Kobayashi IV was not at Hollow Spire at all", and the summary ends on it.

### a75 · beat 26: End a Session, then Begin a fourth

- **Player:** say: !end-session — _Begin beat 26_
- **Notebook:** Beat26 started: !end-session typed
- **Calls (1):** the AI player (2.4 s)
- **Time:** 3.9 s · **cost:** $0.0092

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** Right: End a Session's window opened.

## after-session-3

### a76 · beat 26: End a Session, then Begin a fourth

- **Player:** in "End a Session" set questFocus=Learn who the dry voice answers to and press "End Session" — _End session with focus_
- **Notebook:** Beat26: end-session submitted; next !begin-session
- **Calls (5):** callNarratorAPI>getRollingSessionSummary (1.9 s); callNarratorAPI>narrateSessionVignette (3.1 s); callNarratorAPI>getCampaignRecap (6.3 s); callHaiku>defaultCallTierAPI (0.4 s); the AI player (2.8 s)
- **Time:** 19.9 s · **cost:** $0.0525

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Learn who the dry voice answers to You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 7)

> **NARRATOR (npc_end) — Gamemaster**
>
> Somewhere past the Spire, in a cramped quarters off a service corridor, a woman sits cross-legged on her bunk with a ledger of lane tallies open in her lap. She is darning a sock, the heel gone thin, using thread pulled from the hem of a flight blanket. The needle is bent, and she straightens it against her teeth. Every few stitches she glances at the tallies and nods, as if the numbers had agreed with her about something. She bites the thread off, pulls the sock on, and wiggles her toes.

**Notes.** Right for the mechanics: session 3 closed with the player's own focus, +1 momentum (6 → 7). The third closing — "a woman sits cross-legged on her bunk with a ledger of lane tallies … She is darning a sock" — is run 2's second closing ("Tamsin Okoro … props [the ledger] open … She is darning a sock"). **The two helpers written here disagree:** the summary ends "The question of whose name Mira has settled on for the seal remains unanswered" and never mentions that the vow was fulfilled; the recap says "the vow was fulfilled: the hand and seal you sought were named at last" and "it is a question you can now answer". The recap also has the compass "swinging harder toward the dark lane" (a64: north). See recaps.

### a77 · beat 26: End a Session, then Begin a fourth

- **Player:** say: !begin-session — _begin fourth session_
- **Notebook:** Beat26: begin-session typed; press Begin
- **Calls (1):** the AI player (2.4 s)
- **Time:** 4.1 s · **cost:** $0.0091

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** Right: Begin a Session's window opened.

## session-4

### a78 · beat 26: End a Session, then Begin a fourth

- **Player:** in "Begin a Session" press "Begin" — _Begin fourth session_
- **Notebook:** Beat26: pressed Begin for session 4
- **Calls (2):** callNarratorAPI>narrateSessionVignette (5.4 s); the AI player (2.8 s)
- **Beat 26 done:** session 4 is open
- **Time:** 12.7 s · **cost:** $0.0412

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Learn who the dry voice answers to No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> You are eating cold beans straight from the tin, standing up, because the fold-down table has been stuck half-open since the Wren and you refuse to negotiate with it. The galley's overhead panel hums one note, flat and patient, and now and then climbs a half-step as if it means to say something and thinks better of it. A cupboard latch rattles in time with the engines, so you take the spoon out of your mouth and rattle back, and the ship, to your quiet satisfaction, lets it go. Somewhere aft, the water reclaimer gives a wet cough, followed by three small drips that sound very much like applause. You scrape the tin, find one last bean hiding in the seam, and eat it with the gravity it has earned. Then the comm panel by the hatch chirps once, soft and apologetic, the way a ship clears its throat when it would rather you went and looked.

**Notes.** Half right: session 4 open, alone with the ship. The card's "No character has a vow in play" is true now. **The opening ends on the first opening's last image:** "the comm panel by the hatch chirps once, soft and apologetic" (a2: "the comm panel by the hatch gives a single, apologetic chirp"). Cause, readable: the builder shows each earlier opening cut at 700 characters (`src/session/vignetteHistory.js:25`, `:52`) and the openings run longer — the list it was given ends "Out past the hull the Cin…": the sentence it repeated is the one it was not shown. Its frame question is session 1's again: "What is the comm panel trying to tell her?"

