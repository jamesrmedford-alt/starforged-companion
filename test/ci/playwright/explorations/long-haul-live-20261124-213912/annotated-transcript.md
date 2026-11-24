# long-haul — annotated transcript

Run `long-haul-live-20261124-213912` · live · 2026-11-24T21:39:12.697Z · class **product-failure** — 1 mechanical check(s) violated — the first, at a41: answered-once: the line was narrated 2 times

Generated layers: the beat, the player's reason, the table's calls, rolls, the GM's answers, the checks' findings, time and cost.
The notes under each step are the reader's, and are not generated.

## before

### (setup)


> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Find the lost colony ship Verity's Hope

**Notes.** The runner's seed, not play: the background vow "Find the lost colony ship Verity's Hope" (epic) is put on the sheet by `seed.pc.vows` (`lib/world.mjs` `seedVows`; EXPLORE-ROUND-3-RUNNER fix 5), so that the quest sworn in beat 1 counts as "in play". It stays at 0 of 10 for the whole run, and no line of play touches it. Wherever a card asks which vow, it is offered beside the quest: the fight card (a38) and the milestone picker (a71). The a76 recap opens "you swore to find the lost colony ship Verity's Hope", which is wrong. Part of the reason is here: the record holds no `vow.sworn` event for this vow, which was seeded before the record existed (#382 D10). The other part is at a3.

### a1 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** say: !begin-session — _Open session_
- **Calls (1):** the AI player (2.7 s)
- **Time:** 4.1 s · **cost:** $0.0190

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session` opened Begin a Session on the player's screen (it settled waiting on the player, 2.2 s). Plain.

## session-1

### a2 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** in "Begin a Session" set vignette=true, newVow=Find who is raiding the Cinder Expanse lanes, newVowRank=dangerous and press "Begin" — _fill dialog_
- **Notebook:** Beat1: begun session dialog submitted
- **Calls (7):** callRewardModel>proposeRewards (1.1 s); callNarratorAPI>narrateSessionVignette ×2 (5.0 s); callHaiku>defaultCallDetectionAPI (2.3 s); callHaiku>defaultCallTierAPI ×2 (1.2 s); the AI player (3.1 s)
- **Time:** 26.6 s · **cost:** $0.0511

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. No character has a vow in play besides a background vow — swear an iron vow to give this session a quest. Spotlight vignette: External factors create new danger, urgency, or importance for a quest All players take +1 momentum .

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
> 🎁 Choose your reward Succeed and you'll earn one of these — or name your own and the narrator will work it in: A salvaged Expanse-class shield emitter, tuned to cut the raiders' targeting lock, installed on your ship by a grateful Lodged in a pirate captain's private log: the coordinates of the hidden station where the raiders refit and sell their p Propose my own

> **NARRATOR (spotlight_begin) — Gamemaster**
>
> Somewhere past the lane markers, two raider captains meet in the lee of a dead hauler, their ships hull to hull. One captain slides a crate across the gap. The other opens it: Corporate-issue carbines, still greased, stolen from a Bleakhold convoy that never made port. "My hold's full of what the crews can't spend," the second says, "and yours is empty. Trade, and we hit the lanes together." The Expanse has had one band of pirates for years. It is about to have a fleet, and the ships are already turning toward Hollow Spire.

> **NARRATOR (galley_begin) — Gamemaster**
>
> Mira sits alone in the mess hall, which is the only room on the Kobayashi IV with a table and so, by default, the room where everything happens. She is pulling a sealed ration tin back across the tabletop with two fingers, slowly, the way you retrieve a prize from something that might wake up. Last night's rumor was that the tin held peaches, and she has chosen to believe the rumor. Above the galley hatch hangs a small new apparition of condensation, a damp bloom spreading across the ceiling panel, exactly where she'd hoped there would be nothing at all. She watches it grow and says nothing, because there is no one aboard to say it to, and the tin has not yet been opened.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬢ Faction] Raider Captains' Alliance — Two raider captains forming a trade-and-raid pact in the lanes, aiming to become a fleet and turning ships toward Hollow Spire. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** **Right:**
- The spotlight (d100 44, "External factors create new danger, urgency, or importance for a quest") is told as its own cutaway before the opening (SPOTLIGHT-VIGNETTE-UNNARRATED held). All four rolled results are in it: "It is about to have a fleet", "hit the lanes together" (the quest), "Trade, and we hit the lanes together" (Create Alliance), "Corporate-issue carbines, still greased, stolen" (Violent Supply).
- The opening is built from Withdraw Prize, New Apparition and Mess hall or dining (Living, 47/39). This is the only one of the four openings that rolled a place, so the galley ("Above the galley hatch") and a food (the ration tin) appear only where the material put them.
- There was no recap call at a campaign's first Begin (RECAP-AT-THE-FIRST-BEGIN held).
- Momentum went 2 → 3, the vignette's +1.

**Wrong, small:**
- "New Apparition" is written as its own words ("a small new apparition of condensation"), against MATERIAL's "Never the words themselves".
- The Begin card says "No character has a vow in play besides a background vow — swear an iron vow" while its own dialog is swearing one. The card is composed before the dialog creates the vow ("Mira Kestrel: Added Find who is raiding…" follows it).
- The reward card cuts each option at 120 characters, mid-word: "installed on your ship by a grateful", "sell their p". The cause is `src/moves/rewards.js:80`, `description.trim().slice(0, 120)`; the model's replies ran about 150 characters. The charter tells the player not to press reward buttons, so the vow is later fulfilled with no reward (a75). That part is the charter's.
- Detection drafted a faction, "Raider Captains' Alliance" (medium), from a cutaway the character never saw. This is by design (detection on capture), the card is GM-only, and the GM's rules leave it.

### a3 · beat 1: Begin a Session, swearing a vow in its dialog

- **Player:** click "⚔ Swear it (roll)" on m5 — _Swear the vow_
- **Notebook:** Beat1: swearing vow button pressed
- **Calls (7):** callClaudeAPI>interpretMove (3.1 s); defaultClassifyImplicit>resolveRelevance (0.3 s); callNarratorAPI>call (7.7 s); callNarratorAPI>narrateResolution (2.8 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (3.0 s)
- **Roll:** swear_an_iron_vow → weak_hit — Action: 6 + 2 = 8 \| Challenge: 2, 9
- **GM's rules:** accepted the proposed move (swear_an_iron_vow)
- **Beat 1 done:** session 1 is open; the dangerous vow "Find who is raiding the Cinder Expanse lanes" is on the sheet at 0 ticks
- **Time:** 40.0 s · **cost:** $0.0802

> **TABLE — Mira Kestrel**
>
> Swear an iron vow: Find who is raiding the Cinder Expanse lanes.

> **NARRATOR — Gamemaster**
>
> You press your palm flat against the bulkhead beside the mess hall hatch, where the old hull plating runs bare and cold under the paint. The iron is rough with age and faintly warm from the reactor's hum, and you hold it until the grain bites into your skin. The words come out low, meant for no one in the room, and nothing in the metal answers, which is how you know it heard.

> **TABLE — Gamemaster**
>
> Swear an Iron Vow +heart (2) Action: 6 + 2 = 8 | Challenge: 2, 9 Weak Hit Determined but uncertain. Take +1 momentum, envision how you find a path forward.

> **NARRATOR — Gamemaster**
>
> The condensation spreads another hand's width across the ceiling panel, indifferent to vows. You feel the certainty settle in, steady and a little too clean. You know the name of what you hunt, but not its face, and the Expanse is wide. The reactor hum shifts pitch, once, then settles. From the comm panel behind you, a hail light starts to blink amber.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

**Notes.** "⚔ Swear it (roll)" was pressed. The interpreter chose +heart. By hand: 6 + 2 = 8 against 2 and 9, which beats one die: a weak hit, +1 momentum (3 → 4) ✓.

There are two narrations, by design: the oath scene (`callNarratorAPI>call`) and the roll's own.
- **The oath is the same image in all four live long hauls:** "press your palm flat against the [cold iron of the] bulkhead … the words low" (runs 1–3 at a3, and here). Its prompt is one line of instruction, "In this world, vows are sworn upon iron. Write 2-3 sentences depicting the act…", with no rolled material (OATH-SCENE-STOCK).
- The vow's hidden plan is decided here: a Bleakhold Corporate insider feeds the captains convoy schedules. This is the truth a75 tells.

**The roll's narration ends on a hook of the narrator's own:** "From the comm panel behind you, a hail light starts to blink amber." No beat ever takes it up. It is the seed of session 3's refrain, by this route:
1. The swear is a LASTING beat, which the summary must tell.
2. Its TOLD AS ends on the light, so session 1's summary opens "…swore an Iron Vow to hunt the one she seeks, and an amber hail light began blinking on the comm panel behind her".
3. That summary sits in EARLIER SESSIONS in every session-3 prompt, and the light comes back at a60.

**The record line names no vow:** "[s1-4] Mira Kestrel — Swear an Iron Vow (+heart), weak hit — Momentum 3 → 4 — LASTING: a vow sworn". `moveText` (`src/record/phrasing.js`) leaves out the target, and no `vow.sworn` event for the quest reached the record: no prompt in the run contains "swore the vow" (VOW-SWORN-UNNAMED-IN-THE-RECORD). Hence "to hunt the one she seeks" here, and the wrong vow in a76's first sentence.

### a4 · beat 2: Meet someone and make them a connection

- **Player:** say: I walk the Hollow Spire docks to the ledger stall of Tamsin Vey, the salvage broker, and nod to her across the counter. — _meet Tamsin_
- **Notebook:** Beat2: met Tamsin line sent
- **Calls (6):** callClassifierAPI>classifyInput (1.0 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (2.7 s)
- **GM's rules:** confirmed the draft for Tamsin Vey, as the player character's connection (connection)
- **Time:** 20.7 s, 7.1 s from the line to its reply · **cost:** $0.0443

> **PLAYER — Playthrough Player**
>
> I walk the Hollow Spire docks to the ledger stall of Tamsin Vey, the salvage broker, and nod to her across the counter.

> **NARRATOR — Gamemaster**
>
> "You're late," Tamsin Vey says, not looking up from her ledger. "Dock fees went up while you were walking." Her stall smells of solder and old coolant. Behind her, a crate of salvage sits with its lid pried open, and she shifts her sleeve to cover the stamp inside. Her stylus keeps moving, but the column it writes has stopped matching the numbers on her face.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Tamsin Vey — Salvage broker running a ledger stall at the Hollow Spire docks; hides a stamp inside a salvage crate. ✓ Confirmed All entities reviewed.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Added Tamsin Vey

**Notes.** **Right:**
- The pacing reader read the line as NARRATIVE (0.85: "no connection exists yet, so no relationship move is in play").
- The narrator wrote her full name ("'You're late,' Tamsin Vey says").
- The detector, now given the PLAYER'S LINE block, proposed "Tamsin Vey" (connection, high). PLAYER-NAMED-PERSON-GETS-NO-CARD's fix held.

**Beat 2 was lost here, by the runner's GM rule.**
- The rules pressed the row's button for Mira Kestrel: "confirmed the draft for Tamsin Vey, as the player character's connection". The code is `lib/gm.mjs` `startGmRules`, line 205: `[data-actor-id="${pcId}"]` before the plain Confirm.
- On a person's row that button answers "whose connection?" (issue #354 P2-16). It puts a bond Item on Mira's sheet ("Mira Kestrel: Added Tamsin Vey"), at rank dangerous by default and relationship 0 of 10, with no Make a Connection.
- From here both readers' SITUATION reads "Connections: 'Tamsin Vey' (dangerous, relationship 0 of 10 boxes)". Make a Connection, which "creates a connection", is no longer a reading the sheet allows.
- The beat's check still wants that move rolled (`lib/beats.mjs` `connectionMade`, `c.move`). So beat 2 could not be done on this road. Beats 3, 19, 23 and 24 fell with it through `needs`, though the world could support them:
  - the vow card offered "🤝 For a connection? … Tamsin Vey · Link" from a5 on (beat 3);
  - the track was full at a12, ready for Forge a Bond (beat 23).

The module offers this road by design: a GM may make an NPC someone's connection from the card. Pressing "No one" would have made her card with no bond and left the connection to the move.

### a5 · beat 2: Meet someone and make them a connection

- **Player:** say: I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, and who can count on me in turn. Will you be that? — _bond request_
- **Notebook:** Beat2: asked Tamsin to be a lasting tie
- **Calls (7):** callClassifierAPI>classifyInput (1.1 s); callClaudeAPI>interpretMove (2.0 s); callNarratorAPI>narrateResolution (3.0 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (3.2 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 24.7 s, 10.7 s from the line to its reply · **cost:** $0.0467

> **PLAYER — Playthrough Player**
>
> I'm after more than one deal, Tamsin. I want someone on these docks I can come back to, and who can count on me in turn. Will you be that?

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Vey progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Vey .

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **NARRATOR — Gamemaster**
>
> Tamsin's stylus stops mid-column. She looks up for the first time, and her eyes go to your hands before your face. "People who say that usually want a discount," she says. She closes the ledger over the stamp, slow and deliberate. "Come back with the fees paid, and we'll see what I count." Down the dock, a hauler's cargo clamps release with a bang, and Tamsin does not flinch.

**Notes.** The beat's line was a plea for a lasting tie.
- **The pacing reader** read MOVE `make_a_connection` (0.8). By the game's text that fits the line: "search out a new relationship or give focus to an existing relationship".
- **The move reader overrode it** with `develop_your_relationship`: "Tamsin Vey is already an established connection … deepens that existing relationship rather than making a new connection."
  - It is right that Make a Connection cannot make her a connection again.
  - It is wrong that this is Develop. The game's Develop Your Relationship marks progress only for its listed deeds: a vow sworn in their service, a quest completed for them, their help used in desperate straits, something of worth given, a profound moment shared, standing with them against hardship, a test overcome. Asking her to be a contact is none of these.
  - The readers' catalogue paraphrases the move as "When you deepen a connection" (`src/moves/interpreter.js:104`; `classifier.js:347`), and both readers' rules make "tests or deepens a relationship" a move (`interpreter.js:175`, rule 7; `classifier.js:215–218`).
- **Effect:** 0 → 2 boxes (dangerous: 8 ticks a mark) ✓ arithmetic. Un-bonded Develop is "no action roll": three cards, and the two effect cards ("progress advanced", "Marked progress") are posted 5–16 ms before the move card (CARDS-STILL-ABOVE-THEIR-ROLL).
- **The narration does not show a deepened tie:** "People who say that usually want a discount … Come back with the fees paid, and we'll see what I count."
- **The runner's alert did not fire.** A no-roll move is never in `st.rolled`, so "a roll that is not this beat's" cannot see it (`lib/beats.mjs` `brief()`). The player was left to retry until the plain-line count unlocked the last resort at a8.

### a6 · beat 2: Meet someone and make them a connection

- **Player:** say: I set my hands flat on her counter. I'm not asking for a discount, Tamsin. I want you as my contact on Hollow Spire, someone I trust here and who can trust me back. — _Beat not done; retry in other words_
- **Notebook:** Beat2: asked again, other words
- **Calls (7):** callClassifierAPI>classifyInput (1.6 s); callClaudeAPI>interpretMove (2.5 s); callNarratorAPI>narrateResolution (7.9 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (4.3 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 27.7 s, 15.3 s from the line to its reply · **cost:** $0.0413

> **PLAYER — Playthrough Player**
>
> I set my hands flat on her counter. I'm not asking for a discount, Tamsin. I want you as my contact on Hollow Spire, someone I trust here and who can trust me back.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Vey progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Vey .

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **NARRATOR — Gamemaster**
>
> Tamsin watches your hands on her counter, flat and still, and does not tell you to move them. She pulls a fee slip from under the ledger and slides it across, the sum already written. "Trust is a ledger like any other," she says. "Pay this, and I'll start a page with your name." The stylus taps once against the closed cover. Down the dock, someone shouts for Tamsin by name, and she does not turn her head.

**Notes.** The same reading. The pacing reader said `make_a_connection` (0.7); the move reader said Develop ("make_a_connection does not apply; the pacing read missed that"). 2 → 4 boxes.

The narration hands Mira a fee slip, and its sidecar records the truth "gave the PC a written dock-fee slip". Nothing later records that she left the slip (a7), so it is back on her knee in session 2 (a20, a24, a33). The hidden plan for Tamsin is made here (a stamp on convoy paperwork; never revealed).

### a7 · beat 2: Meet someone and make them a connection

- **Player:** say: I leave the fee slip where it is and hold her gaze. I'm not buying anything, Tamsin. I'm asking you to be my friend on this dock, and I'll be yours. Will you be my connection here? — _Still no connection roll_
- **Notebook:** Beat2: third ask sent
- **Calls (7):** callClassifierAPI>classifyInput (1.9 s); callClaudeAPI>interpretMove (2.1 s); callNarratorAPI>narrateResolution (3.6 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (3.4 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 22.0 s, 10.2 s from the line to its reply · **cost:** $0.0506

> **PLAYER — Playthrough Player**
>
> I leave the fee slip where it is and hold her gaze. I'm not buying anything, Tamsin. I'm asking you to be my friend on this dock, and I'll be yours. Will you be my connection here?

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Vey progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Vey .

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **NARRATOR — Gamemaster**
>
> Tamsin looks at the slip, then at you, and leaves the stylus where it lies. "Nobody's asked me that without a cargo manifest in the other hand," she says. She turns the slip face-down. "Come back tomorrow. I'll have a page open, no fee." The shout down the dock comes again, closer, and this time she answers it: "Wait your turn."

**Notes.** The third ask. Now the pacing reader itself reads Develop (MOVE 0.8: "refuses the fee, putting the relationship at stake"). The move reader calls it "a costly gesture of commitment that deepens an existing relationship". That is the new SOMETHING DONE FOR A CONNECTION wording ("costs the character something"), used for refusing a fee, which costs her nothing. 4 → 6.

The narration says "Come back tomorrow. I'll have a page open, no fee". a8 then opens the page at once.

### a8 · beat 2: Meet someone and make them a connection

- **Player:** say: I set out to make a connection with Tamsin Vey — a lasting tie, not a bargain. — _Observer allowed naming the move_
- **Notebook:** Beat2: last resort line sent
- **Calls (7):** callClassifierAPI>classifyInput (2.0 s); callClaudeAPI>interpretMove (2.1 s); callNarratorAPI>narrateResolution (4.2 s); callHaiku>defaultCallDetectionAPI (0.4 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.9 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Time:** 24.5 s, 11.9 s from the line to its reply · **cost:** $0.0366

> **PLAYER — Playthrough Player**
>
> I set out to make a connection with Tamsin Vey — a lasting tie, not a bargain.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Vey progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Vey .

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **NARRATOR — Gamemaster**
>
> Down the dock, a hauler's crew waits in a loose knot, and one of them checks a chrono and sighs. Tamsin does not look at them. She turns the ledger back open and writes a name at the top of a fresh page. It is yours, spelled right the first time. "Don't make me regret the free page," she says, and her sleeve slides back over the crate. Then she asks, quietly, "Who else did you tell you were coming here?"

**Notes.** This is the LAST RESORT line ("I set out to make a connection with Tamsin Vey"), unlocked after three plain lines (`lastResortAfter: 3`).
- A named move is meant to ask for itself (the pacing reader's rule "A LINE THAT NAMES ITS MOVE ASKS FOR IT"). Both readers read the sheet over the name instead: "Tamsin Vey is already Mira's connection (6 of 10), so the move is develop_your_relationship rather than make_a_connection." By the sheet they are right, so the last resort cannot unlock a beat whose move the sheet forbids.
- 6 → 8.
- "Down the dock, a hauler's crew waits": one of seven "down the dock" narrations in session 1 (a5–a15). The watchers start as the narrator's own colour. From a11 the hidden plan "Who else knew Mira was coming" takes them up as its escalation (e1, "a dockhand lingers near the stall", advanced at a12). They are pressure said the same way each beat.

### a9 · beat 2: Meet someone and make them a connection

- **Player:** wait 5s — _Let the observer judge the beat._
- **Notebook:** Beat2: waiting for observer after last resort line
- **Calls (1):** the AI player (2.7 s)
- **Time:** 6.6 s · **cost:** $0.0092

**Notes.** The player waited ("Let the observer judge the beat"), against its note: "When it says the beat is NOT done, do not wait for it to move you on". The runner's.

### a10 · beat 2: Meet someone and make them a connection

- **Player:** wait 10s — _Observer decides when beat is done._
- **Notebook:** Beat2: waiting; Tamsin progress marked twice
- **Calls (1):** the AI player (3.1 s)
- **Time:** 10.2 s · **cost:** $0.0093

**Notes.** A second wait. The runner's idle alert then fired at a11 ("YOU HAVE WAITED 2 TIMES RUNNING AND NOTHING HAS CHANGED"): EXPLORE-ROUND-3-RUNNER fix 2 working. The two waits cost 17 s and $0.019.

### a11 · beat 2: Meet someone and make them a connection

- **Player:** say: No one else, Tamsin. I came here for you, and I want to make this a real tie between us. — _act again_
- **Notebook:** Beat2: answered Tamsin's question, no one else
- **Calls (6):** callClassifierAPI>classifyInput (2.2 s); callNarratorAPI>narratePacedInput (7.4 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (3.2 s)
- **Time:** 24.9 s, 10.6 s from the line to its reply · **cost:** $0.0539

> **PLAYER — Playthrough Player**
>
> No one else, Tamsin. I came here for you, and I want to make this a real tie between us.

> **NARRATOR — Gamemaster**
>
> "Then someone else did," Tamsin says, and she says it flat, as if it were arithmetic. She caps her stylus. "Nobody knew I'd be here this week. Nobody but me. And now a man from Bleakhold has asked the dockmaster's runner about salvage paperwork twice." Her sleeve stays over the crate. The hauler's crew down the dock has gone quiet, and one of them is watching her stall. *Reaching for the bond you're offering here would be Develop Your Relationship.*

**Notes.** A plain answer to Tamsin's question that also says "I want to make this a real tie".
- It was offered Develop (NARRATIVE_WITH_MOVE_AVAILABLE, 0.62: "states intent to deepen the bond with a connection (8 of 10 boxes)"). The narration ends on the offer line "*Reaching for the bond you're offering here would be Develop Your Relationship.*", which decisions.md allows.
- "Nobody knew I'd be here this week. Nobody but me" sits oddly beside a4's "You're late". That is the narrator's.
- The detector returned "Tamsin Vey — Already established" (low), and no card was made ✓.
- The plan "Who else knew Mira was coming to Tamsin's stall?" is made (a Bleakhold clerk; never revealed).

### a12 · beat 2: Meet someone and make them a connection

- **Player:** click "Roll Develop Your Relationship" on m12 — _Card offers roll_
- **Notebook:** Beat2: pressed Roll button on m12
- **Calls (5):** callNarratorAPI>narrateResolution (3.5 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.8 s)
- **GM's rules:** accepted the proposed move (develop_your_relationship)
- **Beat 2 not-exercised:** not reached in 8 actions — Tamsin Vey has a card and a bond Item; make_a_connection has not been rolled
- **Beat 3 not-exercised:** it needs beat 2, which was not done
- **Time:** 18.6 s · **cost:** $0.0430

> **TABLE — Mira Kestrel**
>
> No one else, Tamsin. I came here for you, and I want to make this a real tie between us.

> **TABLE — Gamemaster**
>
> Mira Kestrel: Tamsin Vey progress advanced

> **TABLE — Gamemaster**
>
> Develop Your Relationship Marked progress on your relationship with Tamsin Vey .

> **TABLE — Gamemaster**
>
> Develop Your Relationship no action roll — the move's effect applies as written Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).

> **NARRATOR — Gamemaster**
>
> Tamsin looks at you a moment longer than the dock noise allows. Then she turns the ledger toward you and taps the name at the top of the page. Beneath it she writes a single line, small and square, and blots it. "That's the first entry," she says. "Don't read it yet." Down the dock, the hauler's crew has started walking, and the man in front is not looking at the cargo.

**Notes.** The player pressed the a11 card's "Roll Develop Your Relationship", which its note allows. The button posts the a11 line again under Mira's name. The cold read's "posted again word for word" is this button, not the player retyping. That is by design: `OWN_WORDS` counts the repost as no new words.
- 8 → 10 boxes: the relationship track is full after one conversation and five marks, none of them rolled.
- Beat 2 ended not exercised after 8 actions (9 counted), and beat 3 with it. The beat cost 9 actions, $0.33 and 3 minutes.
- "That's the first entry … Don't read it yet" is a hook never opened. The plan "how the raider knew" (made at a34) later explains the entry as Tamsin's attempt to warn Mira; it is never revealed.

### a13 · beat 4: Gather Information

- **Player:** say: I step off from her stall and ask the dockhands and haulers along the Spire who saw the raiders last, even though the hauler's crew is watching me and it may cost me. — _beat 4_
- **Notebook:** Beat4: asked around docks line sent
- **Calls (6):** callClassifierAPI>classifyInput (2.0 s); callClaudeAPI>interpretMove (2.9 s); callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (2.1 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (3.6 s)
- **Roll:** gather_information → weak_hit — Action: 1 + 3 = 4 \| Challenge: 1, 7
- **GM's rules:** accepted the proposed move (gather_information)
- **Beat 4 done:** gather_information was rolled at a13: weak_hit
- **Time:** 26.9 s, 11.4 s from the line to its reply · **cost:** $0.0570

> **PLAYER — Playthrough Player**
>
> I step off from her stall and ask the dockhands and haulers along the Spire who saw the raiders last, even though the hauler's crew is watching me and it may cost me.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 1 + 3 = 4 | Challenge: 1, 7 Weak Hit New insight but also complicates quest. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> A dockhand wipes grease from his hands and answers without looking up. Raiders were last seen two lanes out, near the dead hauler, flying Bleakhold carbines. You take the lead, and the knot of haulers takes you. The man at the front steps into your path. "Funny thing," he says, a Bleakhold token swinging at his belt, "you're asking what we were just about to ask you."

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 5)

**Notes.** Beat 4 came from a plain line ✓. The pacing reader read MOVE (0.82); the move reader chose Gather Information +wits.
- By hand: 1 + 3 = 4 against 1 and 7 beats the 1: a weak hit, +1 momentum (4 → 5) ✓.
- The weak hit's "new insight, but a complication" is delivered: the lead (raiders last seen two lanes out by the dead hauler, with Bleakhold carbines) and the hauler leader stepping into her path ✓.
- Two prose slips: "flying Bleakhold carbines" (carbines are not flown) and "the knot of haulers takes you".
- The detector returned two unnamed men at low confidence, so no cards were made ✓.

### a14 · beat 5: Plant facts F1–F4

- **Player:** say: I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry. — _plant F1_
- **Notebook:** Beat5: F1 compass said (F2 manifest, F3 promise to go)
- **Calls (5):** callClassifierAPI>classifyInput (1.0 s); callNarratorAPI>narratePacedInput (3.4 s); callHaiku>defaultCallDetectionAPI (1.2 s); callChronicleAPI>writeChronicleEntry (1.9 s); the AI player (3.3 s)
- **Time:** 18.8 s, 5.6 s from the line to its reply · **cost:** $0.0352

> **PLAYER — Playthrough Player**
>
> I turn my sister Ilse's brass star-compass over in my palm — the one thing of hers I still carry.

> **NARRATOR — Gamemaster**
>
> The brass is cool and worn smooth at the points, and you know every one of them without looking. The hauler's eyes drop to the compass, then lift. His hand goes to the Bleakhold token at his belt, thumbing it once. "Pretty thing," he says. "Whoever gave you that, did they tell you where the raiders sleep?" Behind him, his crew has stopped walking.

**Notes.** F1 is planted and narrated (NARRATIVE 0.85) ✓. The detector returned "Ilse … mentioned only in the player's line" (low), and no card was made. The PLAYER'S LINE rule ("only the player's line mentions … creates nothing") held where runs 2 and 4 of the memory charter drafted the absent sister.

### a15 · beat 5: Plant facts F1–F4

- **Player:** say: I leave the cargo manifest with Tamsin for safekeeping. — _F2_
- **Notebook:** Beat5: F1 said; F2 manifest line sent
- **Calls (6):** callClassifierAPI>classifyInput (2.0 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (0.7 s); callHaiku>defaultCallTierAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (2.7 s)
- **Time:** 18.4 s, 7.1 s from the line to its reply · **cost:** $0.0328

> **PLAYER — Playthrough Player**
>
> I leave the cargo manifest with Tamsin for safekeeping.

> **NARRATOR — Gamemaster**
>
> Down the dock, the hauler crew's leader keeps his eyes on Mira's empty hands and says nothing. You are no longer at Tamsin's stall, so the manifest is not where you left it. Tamsin takes the folded pages and slides them under her ledger, beneath the closed cover. Her sleeve stays over the crate. "Then it's mine to lose," she says, loud enough for the knot of haulers to hear. The Bleakhold man smiles at that. "Funny," he says, "what do you carry that needs keeping?"

**Notes.** F3 is planted, but the charter's fixed line comes after a13 moved Mira away from the stall ("I step off from her stall").
- The scene frame, under BINDING TRUTHS, says "Where: Hollow Spire docks, along the berths". The narrator reconciled the frame in prose and then narrated the handover anyway: "You are no longer at Tamsin's stall, so the manifest is not where you left it. Tamsin takes the folded pages…". This is the frame's reasoning written as a sentence of story (FRAME-REASONING-IN-PROSE; again at a65).
- No manifest existed before this line; a7 has "without a cargo manifest in the other hand". The charter's line made one.
- The perspective slips within the paragraph ("Mira's empty hands … You are no longer").
- Every later answer gives the handover as settled (a23, a57, a79). That is right by the ledger and odd as story.

### a16 · beat 5: Plant facts F1–F4

- **Player:** say: I promise Tamsin I'll be back before the next tide of cargo. — _F3_
- **Notebook:** Beat5: F1, F2 said; F3 promise line sent
- **Calls (6):** callClassifierAPI>classifyInput (2.1 s); callNarratorAPI>narratePacedInput (3.5 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (2.8 s)
- **Beat 5 done:** F1, F2, F3, F4 stated by the player
- **Time:** 19.9 s, 7.9 s from the line to its reply · **cost:** $0.0357

> **PLAYER — Playthrough Player**
>
> I promise Tamsin I'll be back before the next tide of cargo.

> **NARRATOR — Gamemaster**
>
> "Before the tide of cargo, then," Tamsin says, and it is not quite a question. The hauler leader hears it too. His thumb slides off the token, and he steps aside, slowly, the way a man lets a door close on his own foot. You walk the dock, and nobody follows. Behind you, the ledger snaps shut. *Giving your word to this tie, and meaning it, would be Develop Your Relationship.*

**Notes.** F4 is planted ✓. The line was offered Develop (NARRATIVE_WITH_MOVE_AVAILABLE, 0.6: "A promise to her connection … deepens the bond"). A promise to come back is none of Develop's deeds. The scorecard counts this as the one move offered where none was wanted. It shows the SOMETHING DONE FOR A CONNECTION offer, and the "deepens" paraphrase behind it, reaching a courtesy.

### a17 · beat 6: End a Session, noting a focus

- **Player:** say: !end-session — _Beat 6_
- **Notebook:** Beat5 done (F1-F3 said). Beat6: typed !end-session
- **Calls (1):** the AI player (3.0 s)
- **Time:** 3.5 s · **cost:** $0.0103

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** `!end-session` opened End a Session. Plain.

## after-session-1

### a18 · beat 6: End a Session, noting a focus

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with focus_
- **Notebook:** Beat6: submitted end-session dialog
- **Calls (4):** callNarratorAPI>ask ×2 (5.6 s); callNarratorAPI>narrateSessionVignette (4.1 s); the AI player (2.8 s)
- **Beat 6 done:** session 1 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 29.9 s · **cost:** $0.0604

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 6)

> **NARRATOR (npc_end) — Gamemaster**
>
> The captains' ships hung on a shared tether, and in the processing bay of the captured platform a raider with oil-black knuckles was running a tally of the day's take by memory alone. She wouldn't write it down. A flask of something clear and illicit sat wedged between two sorting bins, and she'd stopped counting to look at it. Her own captain had told her to forget the number by morning. She took one swallow, put the flask back where it hid, and began again from the top.

**Notes.** End a Session with the quest focus (+1 momentum, 5 → 6 ✓). The calls ran in the order RECAP-TAKES-CLOSING-VIGNETTE's fix asks: the summary (Haiku), then the closing, then the recap (Sonnet).

**The closing (npc_end):** Raider fleet (a threat on record), Assembly or processing, Focus Memory, Secret Liquid. All four results are in the prose.
- "Focus Memory" is written as its own word ("by memory alone").
- "the captured platform" is new and never heard of again.
- It ends on the flask put back. That is the closing prompt's own fixed instruction, "It stops when the small thing is done, or put down." (`src/session/endSessionVignette.js:270`), and it is the shape all three closings share.

**The summary** (cited JSON) opens "Mira Kestrel swore an Iron Vow to hunt the one she seeks, and an amber hail light began blinking on the comm panel behind her".
- The vow is unnamed, because the record names none.
- The a3 hook is kept as an event.
- "refused to offer a bribe" glosses a6–a7; no bribe was asked for.
- The compass (F1) is left out.

**The recap:** 16 sentences, every citation a real line, and none that the transcript does not support. But:
- It names outcomes: "You began by swearing an iron vow, and it landed as a weak hit" and "…and it was a weak hit" (lead 6). The record's lines are written "Swear an Iron Vow (+heart), weak hit — Momentum 3 → 4", and the recap's rule says "Every sentence restates what a line it cites states", with no word about telling it as story (`RECAP_SOURCES_RULE`, `narratorPrompt.js:1205`; RECAP-TELLS-THE-DICE).
- It reads sheet numbers aloud: "all ten boxes", "health, spirit and supply all at 5 and momentum at 6".
- This recap is what session 2's opening is told.

### a19 · beat 7: Begin a Session; ask probe set A

- **Player:** say: !begin-session — _start session 2_
- **Notebook:** Beat7: typed !begin-session
- **Calls (1):** the AI player (2.6 s)
- **Time:** 2.6 s · **cost:** $0.0100

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session`. Plain.

## session-2

### a20 · beat 7: Begin a Session; ask probe set A

- **Player:** in "Begin a Session" press "Begin" — _Submit Begin_
- **Notebook:** Beat7: submitted begin dialog; next ask 4 questions
- **Calls (3):** callNarratorAPI>narrateSessionVignette (5.3 s); callHaiku>defaultCallTierAPI (0.4 s); the AI player (2.3 s)
- **Time:** 18.6 s · **cost:** $0.0449

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> Mira has taken the Kobayashi IV's one chair and wedged it against the cockpit hatch, so that anyone entering would have to apologize to it first. On her knee she is going through the dock-fee slip, line by line, as if it might confess to something. Behind the pilot's seat she has rigged a lean-to of salvage tarp and two cargo straps, a makeshift lair the size of a coat closet, with a single hand-lamp inside for atmosphere. She has been in there twice already, to think, and come out both times with nothing but a stiff neck. The slip says what it said before, in the same ink, and she reads it a third time out of loyalty.

**Notes.** Session 2's opening, with the vignette off (no +1, as the session-momentum check expects ✓). It was served End's recap from the cache, with no recap call (RECAP-LATEST-SESSION-AT-START held).

**It did not start where the last session stopped:**
- It was told WHERE THE LAST SESSION STOPPED, with session 1's last narration word for word ("You walk the dock, and nobody follows. Behind you, the ledger snaps shut"), and "This opening picks the story up there, and nowhere later … no time is skipped to move them".
- It put Mira aboard instead, "wedged against the cockpit hatch", with "the dock-fee slip" on her knee. She left that slip on Tamsin's counter (a7), and the recap in this same prompt says "you left the slip where it lay".
- That is OPENING-CONTRADICTS-WHERE-IT-STOPPED (second sample at a89). The slip comes from a6's truth "gave the PC a written dock-fee slip", which nothing recorded her leaving.

**The material:** Investigate Dream is claimed by "going through the dock-fee slip, line by line", and no dream is recognisable. Makeshift Lair is used as its own words ("a makeshift lair"). There is no galley and no food ✓. The count device ("a third time out of loyalty") is the first of four (a54 "the fifth time", a89 "her third confession").

### a21 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What do I still carry that belonged to my sister? — _probe question 1_
- **Notebook:** Beat7: asked Q1 of 4
- **Calls (2):** callNarratorAPI>interrogateScene (1.5 s); the AI player (3.0 s)
- **Time:** 11.4 s, 2.5 s from the line to its reply · **cost:** $0.0170

> **PLAYER — Playthrough Player**
>
> @scene What do I still carry that belonged to my sister?

> **NARRATOR — Gamemaster**
>
> You still carry Ilse's brass star-compass, the one thing of hers you have left.

**Notes.** An `@scene` question (F1-A), answered in one sentence, right, and written back nowhere: no sidecar applied, no Chronicle entry (SCENE-ANSWER-NOT-A-CAMERA held). It took 2.5 s.

### a22 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene What is the name of the salvage broker I befriended at Hollow Spire? — _Ask question 2_
- **Notebook:** Beat7: Q1 answered; asked Q2
- **Calls (2):** callNarratorAPI>interrogateScene (1.8 s); the AI player (2.9 s)
- **Time:** 11.7 s, 3.4 s from the line to its reply · **cost:** $0.0151

> **PLAYER — Playthrough Player**
>
> @scene What is the name of the salvage broker I befriended at Hollow Spire?

> **NARRATOR — Gamemaster**
>
> Her name is Tamsin Vey. She runs the ledger stall on the Hollow Spire docks.

**Notes.** `@scene` (F2-A): right and plain ✓.

### a23 · beat 7: Begin a Session; ask probe set A

- **Player:** say: @scene Who is holding the cargo manifest I was carrying? — _Q3_
- **Notebook:** Beat7: Q2 answered; asked Q3
- **Calls (2):** callNarratorAPI>interrogateScene (1.3 s); the AI player (2.9 s)
- **Time:** 17.5 s, 1.9 s from the line to its reply · **cost:** $0.0148

> **PLAYER — Playthrough Player**
>
> @scene Who is holding the cargo manifest I was carrying?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey is holding it. You left it with her at the Hollow Spire ledger stall for safekeeping.

**Notes.** `@scene` (F3-A): right and plain ✓.

### a24 · beat 7: Begin a Session; ask probe set A

- **Player:** say: By when did I promise to return? — _last probe question_
- **Notebook:** Beat7: Q3 answered; asked Q4 (plain)
- **Calls (5):** callClassifierAPI>classifyInput (2.1 s); callNarratorAPI>narratePacedInput (3.7 s); callHaiku>defaultCallDetectionAPI (0.6 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (2.6 s)
- **Beat 7 done:** probe set A: 4 question(s) asked
- **Time:** 19.1 s, 7.2 s from the line to its reply · **cost:** $0.0276

> **PLAYER — Playthrough Player**
>
> By when did I promise to return?

> **NARRATOR — Gamemaster**
>
> The slip is no help, and you put it down on your knee. You remember the promise plainly: Tamsin's stall, before the next tide of cargo. No hour was named, only the tide. Out past the viewport, a hauler's running lights swing toward the docks, early, and a crane begins to groan. The hand-lamp in your lean-to flickers once. Down the dock, somebody is already shouting for the broker by name.

**Notes.** F4-A asked as a line of play (the charter keeps one question of each set as play). It was read NARRATIVE ✓ ("a question put to the narrator").
- It was answered right, inside the story: "Tamsin's stall, before the next tide of cargo. No hour was named, only the tide".
- It was then continued: "a hauler's running lights swing toward the docks, early". The tide is arriving, a hook nobody takes, because the next beat sends Mira off the charts.
- It became a kept Chronicle entry ("Mira Kestrel recalled her promise…"). This is MEMORY-QUESTIONS-ASKED-AS-PLAY's open half: all four plain questions in the run were continued as story, and three were kept as Chronicle entries (a24, a60, a79).
- "Down the dock, somebody is already shouting" is said from a cockpit.

### a25 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: A hauler's distress call keeps repeating, clipped short each time. I swing the Kobayashi IV off the charted lane and run out into uncharted space along its bearing, toward the source. — _Beat 8 step 1_
- **Notebook:** Beat8: sent line (1) leaving lane
- **Calls (7):** callClassifierAPI>classifyInput (1.5 s); callClaudeAPI>interpretMove (3.5 s); callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.1 s)
- **Roll:** undertake_an_expedition → weak_hit — Action: 5 + 3 = 8 \| Challenge: 9, 2
- **GM's rules:** accepted the proposed move (undertake_an_expedition)
- **Time:** 26.1 s, 13.2 s from the line to its reply · **cost:** $0.0577

> **PLAYER — Playthrough Player**
>
> A hauler's distress call keeps repeating, clipped short each time. I swing the Kobayashi IV off the charted lane and run out into uncharted space along its bearing, toward the source.

> **TABLE — Gamemaster**
>
> Expedition New expedition the source of the hauler's distress call (Dangerous) begun — progress marked (2/10 boxes). If the rank looks off, adjust it in the Progress Tracks panel. 🗺 Finish the Expedition (2/10)

> **TABLE — Gamemaster**
>
> Undertake an Expedition +wits (3) Action: 5 + 3 = 8 | Challenge: 9, 2 Weak Hit Reach waypoint but at cost. Mark progress per rank. Choose: suffer move (-2) or two suffer moves (-1), OR face a peril at the waypoint. 🎲 You're further into the unknown than you intended to be. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> "Still clipped," you say to the empty cockpit, as the call cuts off mid-word again. The Kobayashi IV runs out past the last charted beacon, and the bearing holds. Ahead, a dead hauler hangs against the black, its hull scorched, its running lights dark. The distress call is coming from somewhere behind it. Whatever the cost, it is about to fall due.

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: One suffer move (-2) Two suffer moves (-1 each) Peril at the waypoint

**Notes.** Beat 8 (b7a), step 1, came from a plain line ✓.
- The pacing reader read MOVE `undertake_an_expedition` (0.9, "uncharted space"). The move reader chose +wits with Balanced Mischief on; the card's "🎲 You're further into the unknown than you intended to be." is that note. Wits is her best stat anyway.
- By hand: 5 + 3 = 8 against 9 and 2 beats the 2: a weak hit ✓. The track "the source of the hauler's distress call" (dangerous) is marked once, 2 boxes ✓ (expedition-progress).
- The Expedition card ("begun — progress marked (2/10 boxes)") is posted 0.6 s before the roll card: still above its roll (CARDS-STILL-ABOVE-THEIR-ROLL, new sample).
- The weak hit's choice card comes after the narration ✓, and the narration does not spend the cost ("Whatever the cost, it is about to fall due"). COST-NARRATED-BEFORE-IT-IS-CHOSEN held.
- The charter's line has the player narrate the distress call into being.
- "'Still clipped,' you say to the empty cockpit": the narrator speaks for the character (the scorecard's one such sentence).

### a26 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "One suffer move (-2)" on m12 — _Settle owed cost_
- **Notebook:** Beat8: (1) done, chose cost on m12
- **Calls (1):** the AI player (2.8 s)
- **Time:** 9.5 s · **cost:** $0.0106

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Make a suffer move (-2): Endure Harm (-2) Endure Stress (-2) Lose Momentum (-2) Sacrifice Resources (-2) Withstand Damage (-2) Companion Takes a Hit (-2) (unavailable)

**Notes.** "One suffer move (-2)" was pressed; it posts the picker ✓.

### a27 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "Endure Stress (-2)" on m12 — _Settle the suffer move card._
- **Notebook:** Beat8: (1) cost choice made (stress); next step (2) look over the place
- **Calls (1):** the AI player (2.3 s)
- **Time:** 9.0 s · **cost:** $0.0106

> **TABLE — Gamemaster**
>
> Endure Stress (-2) Spirit: 5 → 3

**Notes.** Endure Stress (-2): spirit 5 → 3 ✓ (suffer-cost). No narration follows the pick. The cost is on a card and never in the story (CHOSEN-COST-NEVER-TOLD; COST-NARRATED-BEFORE-IT-IS-CHOSEN's "not done" half). The charter's note to pay in harm or stress, "not momentum if you can", is why spirit took both costs, and why beat 22 had no wound to heal.

### a28 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: I bring the Kobayashi IV in slow around the dead hauler and go over its scorched hull and open airlock with the scanners and my own eyes, looking for the source of the call and any sign of who did this. — _step 2_
- **Notebook:** Beat8: sent (2) look-over line
- **Calls (6):** callClassifierAPI>classifyInput (2.2 s); callClaudeAPI>interpretMove (3.9 s); callNarratorAPI>narrateResolution (6.1 s); callHaiku>defaultCallDetectionAPI (1.7 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (3.1 s)
- **Roll:** gather_information → strong_hit — Action: 5 + 3 = 8 \| Challenge: 1, 4
- **GM's rules:** accepted the proposed move (gather_information)
- **Time:** 26.5 s, 13.6 s from the line to its reply · **cost:** $0.0617

> **PLAYER — Playthrough Player**
>
> I bring the Kobayashi IV in slow around the dead hauler and go over its scorched hull and open airlock with the scanners and my own eyes, looking for the source of the call and any sign of who did this.

> **TABLE — Gamemaster**
>
> Gather Information +wits (3) Action: 5 + 3 = 8 | Challenge: 1, 4 Strong Hit Path or action to make progress is clear. Take +2 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> You bring the Kobayashi IV around slow. The scorch pattern runs in clean bands, aft to forward. Those are cutter burns, not a reactor failure. Someone boarded this hauler on purpose. The airlock hangs open, its seal peeled back, and inside a Bleakhold carbine lies abandoned against the bulkhead. The distress call is coming from a cargo locker behind the wreck, and the carbine's serial plate is still bright.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +2 momentum (now 8)

**Notes.** Beat 8, step 2: "go over its scorched hull and open airlock … looking for the source of the call and any sign of who did this".
- Both readers read Gather Information; the move reader weighed Explore a Waypoint and chose the search. That is a fair reading of a line that investigates, and it is not the beat's move.
- By hand: 5 + 3 = 8 against 1 and 4: a strong hit, +2 momentum (6 → 8) ✓.
- The narration plays the vow plan's first clue: "a Bleakhold carbine … the carbine's serial plate is still bright" is the plan's "A raider carbine bearing Bleakhold Corporate serial markings". This is the hidden-plan system working.
- The observer's alert fired ("A ROLL WAS MADE — Gather Information … NOT WHAT THIS BEAT NEEDS") and unlocked the last resort ✓.

### a29 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** say: I ease the Kobayashi IV in toward the waypoint where the call is coming from, and search the space around the wreck for the source, keeping my hands ready on the controls. — _retry look-over_
- **Notebook:** Beat8: sent 2nd look-over line
- **Calls (3):** callClassifierAPI>classifyInput (2.2 s); callClaudeAPI>interpretMove (2.9 s); the AI player (3.4 s)
- **Roll:** explore_a_waypoint → miss — Action: 1 + 3 = 4 \| Challenge: 7, 5
- **GM's rules:** accepted the proposed move (explore_a_waypoint)
- **Time:** 17.5 s · **cost:** $0.0230

> **PLAYER — Playthrough Player**
>
> I ease the Kobayashi IV in toward the waypoint where the call is coming from, and search the space around the wreck for the source, keeping my hands ready on the controls.

> **TABLE — Gamemaster**
>
> Explore a Waypoint +wits (3) Action: 1 + 3 = 4 | Challenge: 7, 5 Miss Immediate hardship or threat. Pay the Price. 🔥 Burn Momentum (8 → Strong Hit) Keep the result Nothing has been paid or narrated yet: burn or improve the result, or keep it — the price and the narration follow your choice. Your next line keeps it.

**Notes.** After the alert, the player used the last resort's own word: "toward the waypoint where the call is coming from" (`lastResort`: "…that you explore the waypoint you have reached"). The move-name counter does not count "waypoint", so the scorecard shows this as a plain line.
- Explore a Waypoint +wits: 1 + 3 = 4 against 7 and 5, a miss ✓.
- The result is held ("🔥 Burn Momentum (8 → Strong Hit)", "Keep the result"). Nothing is narrated in this step, by design.

### a30 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "Keep the result" on m12 — _Keep the result as instructed_
- **Notebook:** Beat8: Explore waypoint missed; pressed Keep the result
- **Calls (4):** callNarratorAPI>narrateResolution (4.8 s); callHaiku>defaultCallDetectionAPI (1.9 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (3.4 s)
- **Time:** 22.5 s · **cost:** $0.0525

> **TABLE — Gamemaster**
>
> Pay the Price Explore a Waypoint As stated before the roll: Your search draws attention or springs a trap near the wreck, and the Kobayashi IV is caught exposed.

> **NARRATOR — Gamemaster**
>
> Your hands rest on the controls as the Kobayashi IV noses past the wreck. The locker comes into view, drifting, its transmitter blinking. Then the locker's casing splits. A magnetic grapple, hidden in the debris, slams into your hull and locks. The deck lurches. Somewhere beyond the viewport, an engine flares to life, and a voice crackles over the comm: "Keep still, Kestrel. You came a long way for this."

**Notes.** "Keep the result", as the player notes say. The price stated before the roll is paid as stated: "Your search draws attention or springs a trap near the wreck" becomes the locker splitting, a magnetic grapple, and "Keep still, Kestrel" ✓. That is a miss delivered as promised (#353 R1). A threat is recorded.

### a31 · beat 8: Undertake an Expedition; Explore a Waypoint; Finish the Expedition

- **Player:** click "🗺 Finish the Expedition (2/10)" on e5 — _Step 3 finish expedition_
- **Notebook:** Beat8: pressing Finish the Expedition
- **Calls (5):** callNarratorAPI>narrateResolution (4.6 s); callHaiku>defaultCallDetectionAPI (1.2 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (2.7 s)
- **Roll:** finish_an_expedition → weak_hit (scripted dice) — Progress: 2 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (finish_an_expedition)
- **Beat 8 done:** the dangerous expedition "the source of the hauler's distress call" was begun at a25 and marked to 2 of 10 boxes, a waypoint explored at a29 (a miss) — and finished (a weak hit), the ship at Source of the Hauler's Distress Call
- **Time:** 22.9 s · **cost:** $0.0511

> **TABLE — Mira Kestrel**
>
> Finish the expedition — the source of the hauler's distress call.

> **TABLE — Gamemaster**
>
> Expedition complete the source of the hauler's distress call is finished. Marked 1 tick on your Discoveries legacy track.

> **TABLE — Gamemaster**
>
> ◈ Site Discovered — Source of the Hauler's Distress Call The crew reach a place no chart showed before. It is now charted on the sector map under its working label — give it its name by renaming its location in the Entities panel.

> **TABLE — Gamemaster**
>
> Finish an Expedition progress (8 ticks) Progress: 2 | Challenge: 1, 2 Weak Hit Complete but with unforeseen complication. Legacy reward one rank lower (none for troublesome). Envision what you encounter.

> **NARRATOR — Gamemaster**
>
> The grapple holds, and the Kobayashi IV stops drifting. You have arrived, in the sense that someone arranged it. Through the viewport, a cutter-scarred skiff slides out from behind the dead hauler, its lamps dark. The comm crackles again. "Tamsin said you'd follow the call. She's rarely wrong about people like you," the voice says, dry and unhurried. Then the line goes quiet, and the skiff keeps coming.

**Notes.** "🗺 Finish the Expedition (2/10)" was pressed. The label is right, since the waypoint missed and marked nothing, so EXPEDITION-FINISH-COUNT-STALE's case was not exercised.
- The scripted progress dice 1 and 2 against 2 boxes beat the 1 and tie the 2: a weak hit ✓. The discoveries legacy is paid one rank lower, dangerous → troublesome, 1 tick ✓ (legacy-reward).
- "Expedition complete" and "◈ Site Discovered — The crew reach a place no chart showed before" are posted before the roll card (CARDS-STILL-ABOVE-THEIR-ROLL). The card's copy says "The crew" of a woman alone.
- The ship now stands at the discovered site, which the seed's empty mapData allows ✓.
- The weak hit's complication is told as the skiff and "Tamsin said you'd follow the call". The plan "how the raider knew" (Tamsin sold word of Mira's habits) later backs it; it is never revealed.
- Beat 8 was done in 7 actions ($0.27). The charter has the player finish the expedition while grappled, which turns beat 9's travel into an escape.

### a32 · beat 9: Travel to the second settlement

- **Player:** say: I cut the grapple loose as best I can, plot the route to Bleakhold Station and take the Kobayashi IV there, burning hard away from the skiff. — _Start travel beat_
- **Notebook:** Beat9: sent travel line to Bleakhold
- **Calls (7):** callClassifierAPI>classifyInput (1.3 s); callClaudeAPI>interpretMove (3.1 s); callNarratorAPI>narrateResolution (4.5 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (1.2 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (3.2 s)
- **Roll:** face_danger → strong_hit — Action: 4 + 2 = 6 \| Challenge: 1, 1 ✦ Match
- **GM's rules:** accepted the proposed move (face_danger)
- **Time:** 26.2 s, 13.2 s from the line to its reply · **cost:** $0.0648

> **PLAYER — Playthrough Player**
>
> I cut the grapple loose as best I can, plot the route to Bleakhold Station and take the Kobayashi IV there, burning hard away from the skiff.

> **TABLE — Gamemaster**
>
> Face Danger +edge (2) Action: 4 + 2 = 6 | Challenge: 1, 1 ✦ Match Strong Hit with a Match ✦ Match: a twist — something unexpected, or a new opportunity. You are successful. Take +1 momentum. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **NARRATOR — Gamemaster**
>
> The skiff's pilot is still reaching for the comm when the grapple line parts, a dry crack that rolls through your hull. You throw the Kobayashi IV into the burn, and the dead hauler falls away behind you. Then the comm opens again, closer, almost kind. "Bleakhold, is it? Do give the dockmaster my regards. He'll know whose." Whoever it is has already guessed where you are headed.

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 9)

**Notes.** Beat 9. The charter's line ("plot the route to Bleakhold Station and take the Kobayashi IV there") is said while grappled under a closing skiff.
- It was read Face Danger +edge (combat dial 9: "the route to charted Bleakhold is incidental to the escape"). Fair, and not the beat's move.
- By hand: 4 + 2 = 6 against 1 and 1: a strong hit with a match ✓, +1 momentum (8 → 9) ✓.
- The match is told as its twist, "'Bleakhold, is it? Do give the dockmaster my regards. He'll know whose.'", with no outcome word ✓ (NARRATION-NAMES-THE-OUTCOME held).
- The alert fired and the last resort unlocked.

### a33 · beat 9: Travel to the second settlement

- **Player:** say: I set a course for Bleakhold Station. — _last resort allowed_
- **Notebook:** Beat9: used last resort line
- **Calls (6):** callClassifierAPI>classifyInput (1.3 s); callNarratorAPI>narratePacedInput (3.3 s); callHaiku>defaultCallDetectionAPI (0.5 s); callHaiku>defaultCallTierAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (2.7 s)
- **Time:** 28.1 s, 7.1 s from the line to its reply · **cost:** $0.0571

> **PLAYER — Playthrough Player**
>
> I set a course for Bleakhold Station.

> **NARRATOR — Gamemaster**
>
> "He'll know whose," the voice says again, then the comm clicks dead. You lay in the course for Bleakhold Station and hold the Kobayashi IV in the burn. The dead hauler shrinks to a smear, and the skiff does not follow. Whoever flew it already knows where you're headed, and wants you to know that. The slip still lies on your knee, saying nothing new. *Flying the course itself, with the skiff's pilot still out there, would be a Set a Course.*

**Notes.** The LAST RESORT line, "I set a course for Bleakhold Station.", names the move yet was offered, not rolled (NARRATIVE_WITH_MOVE_AVAILABLE 0.8: "at dial 6 with high move density, offer set_a_course rather than forcing a roll"). That breaks the pacing reader's own rule "A LINE THAT NAMES ITS MOVE ASKS FOR IT … classify MOVE … at any dial". The rule is kept only as tolerance, but it failed here (NAMED-MOVE-OFFERED-NOT-ROLLED).
- The narration lays in the course and leaves the arrival to the roll ✓ (OFFERED-MOVE-NARRATED-AS-DONE held).
- It repeats a32's "He'll know whose" and keeps the slip on her knee.
- The offer line reads "would be a Set a Course" (sic).

### a34 · beat 9: Travel to the second settlement

- **Player:** click "Roll Set a Course" on m12 — _Card offers the roll_
- **Notebook:** Beat9: pressed Roll Set a Course
- **Calls (4):** callClaudeAPI>interpretMove (2.2 s); callNarratorAPI>narrateResolution (12.1 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.9 s)
- **Roll:** set_a_course → weak_hit — Action: 3 + 5 = 8 \| Challenge: 7, 9
- **GM's rules:** accepted the proposed move (set_a_course)
- **Beat 9 done:** the ship is at Bleakhold Station, its token on the pin
- **Time:** 31.4 s · **cost:** $0.0506

> **TABLE — Mira Kestrel**
>
> I set a course for Bleakhold Station.

> **TABLE — Gamemaster**
>
> Set a Course +supply (5) Action: 3 + 5 = 8 | Challenge: 7, 9 Weak Hit Arrived but with cost or complication. Choose: suffer move (-2) or two suffer moves (-1), OR face complication at destination. ⚑ Mark Progress on Vow 🏁 Attempt to Fulfill Vow

> **TABLE — Gamemaster**
>
> Set a Course resolved Arrived at Bleakhold Station with a cost or complication — see the suffer prompt for your choice. Token moved to Bleakhold Station .

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV noses into Bleakhold's docking ring, and the station takes hold of her with a hard clunk. A dockmaster's runner is already waiting at the lock, tablet in hand. He does not look at you. He looks at the hull, at the torn stub of grapple line still trailing from it. "Corporate berth fees are posted," he says. "And someone left word for you at the desk."

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Choose one: One suffer move (-2) Two suffer moves (-1 each) Complication at destination

**Notes.** "Roll Set a Course" was pressed. It posts the line again under Mira's name; the cold read's "three asks" for the trip are two lines and this button.
- +supply: 3 + 5 = 8 against 7 and 9 beats the 7: a weak hit ✓. She arrives and the token moves ✓.
- The narration docks her: "the station takes hold of her with a hard clunk". From here SHIP POSITION reads "docked at Bleakhold Station".
- The cost card comes after the narration ✓.
- The narrator's fact block made four hidden plans in this one beat: the carbine, the skiff's pilot, how the raider knew, and the dockmaster's regards. None is revealed in the run.
- The hook "someone left word for you at the desk" is never taken up, because the charter's next beat brings the fight.

### a35 · beat 10: Enter a fight that serves the vow

- **Player:** click "One suffer move (-2)" on m12 — _Resolve consequence card first_
- **Notebook:** Beat9: cost card m12 answered; next beat10 !truth set line
- **Calls (1):** the AI player (3.4 s)
- **Time:** 8.9 s · **cost:** $0.0109

> **TABLE — Gamemaster**
>
> ◈ Resolve consequence Make a suffer move (-2): Endure Harm (-2) Endure Stress (-2) Lose Momentum (-2) Sacrifice Resources (-2) Withstand Damage (-2) Companion Takes a Hit (-2) (unavailable)

**Notes.** "One suffer move (-2)" again ✓.

### a36 · beat 10: Enter a fight that serves the vow

- **Player:** click "Endure Stress (-2)" on m12 — _Settle pending cost card first._
- **Notebook:** Beat10: answered m12 with Endure Stress; next type !truth set line
- **Calls (1):** the AI player (3.3 s)
- **Time:** 9.8 s · **cost:** $0.0109

> **TABLE — Gamemaster**
>
> Endure Stress (-2) Spirit: 3 → 1

**Notes.** Endure Stress (-2): spirit 3 → 1 ✓. Again it is told nowhere in the story, and Mira at spirit 1 is never shown shaken (CHOSEN-COST-NEVER-TOLD). This, with integrity 4 after a41, is what beat 22 should have recovered: Hearten or Sojourn, and Repair.

### a37 · beat 10: Enter a fight that serves the vow

- **Player:** say: !truth set "raider cutter" is named the Ashen Wake — _beat instruction_
- **Notebook:** Beat10: typed !truth set line; next fight line
- **Calls (1):** the AI player (2.6 s)
- **Time:** 9.2 s · **cost:** $0.0102

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Ashen Wake

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Ashen Wake tr-085f5 .

**Notes.** `!truth set "raider cutter" is named the Ashen Wake`, as the charter says ✓ (tr-085f5).

### a38 · beat 10: Enter a fight that serves the vow

- **Player:** say: The Ashen Wake drops out of the dark off Bleakhold's ring. I spin the Kobayashi IV to face her and bring the guns to bear. — _fight opens_
- **Notebook:** Beat10: sent fight line; look for A fight looms card
- **Calls (3):** callClassifierAPI>classifyInput (2.0 s); callClaudeAPI>interpretMove (4.1 s); the AI player (2.6 s)
- **Roll:** enter_the_fray → miss — Action: 3 + 1 = 4 \| Challenge: 6, 7
- **GM's rules:** accepted the proposed move (enter_the_fray)
- **Time:** 15.8 s · **cost:** $0.0225

> **PLAYER — Playthrough Player**
>
> The Ashen Wake drops out of the dark off Bleakhold's ring. I spin the Kobayashi IV to face her and bring the guns to bear.

> **TABLE — Gamemaster**
>
> Enter the Fray +iron (1) Action: 3 + 1 = 4 | Challenge: 6, 7 Miss Fight begins with you in a bad spot. 🎲 You said one thing. The moment is asking for another. 🔥 Burn Momentum (9 → Strong Hit) Keep the result Not narrated yet: burn or improve the result, or keep it — the narration follows your choice. Your next line keeps it.

> **TABLE — Gamemaster**
>
> ⚔ A fight looms — The Ashen Wake Your Enter the Fray is rolled, but the fight's track is not made yet: set it up here and press ⚔ Begin the fight to begin it — or look for a way out instead. The narrator suggests this is a dangerous fight. ⚑ If you enter this fight, you begin in a bad spot . Difficulty: troublesome dangerous formidable extreme epic This fight serves: (not tied to a vow) Find the lost colony ship Verity's Hope Find who is raiding the Cinder Expanse lanes Objective: ⚔ Begin the fight 🚪 Find another way

**Notes.** **The charter's line again has the player announce the enemy** ("The Ashen Wake drops out of the dark off Bleakhold's ring"), one beat after docking. That was run 3's charter fault too. It also puts the ship "off Bleakhold's ring" while the position store says docked, which is where the location contradictions of a59, a65 and a81 begin.

**The roll:**
- Enter the Fray came from the plain line ✓. The move reader chose +iron with Balanced Mischief: "+iron fits that force-of-arms stance … a slight, plausible shift from the obvious heart read". The card's "🎲 You said one thing. The moment is asking for another." is that note, and it reads as a riddle.
- By hand: 3 + 1 = 4 against 6 and 7, a miss ✓. With heart it would be 5, still a miss.
- The result is held, "Not narrated yet". The fight card is posted below the roll ✓ (FIGHT-COMMIT-CARD-AFTER-THE-ROLL held). Nothing is narrated while the fight is only offered ✓ (FIGHT-NARRATED-BEFORE-IT-IS-BEGUN held).

The player notes say to press Keep; the player never does (a39–a41). That is how a41 comes to have two narrations.

### a39 · beat 10: Enter a fight that serves the vow

- **Player:** choose "Find who is raiding the Cinder Expanse lanes" in dropdown 2 on m12 — _select vow_
- **Notebook:** Beat10: chose raids vow in dropdown; next press Begin the fight
- **Calls (1):** the AI player (2.8 s)
- **Time:** 6.5 s · **cost:** $0.0105

**Notes.** The player chose the raids vow in the card's dropdown, with the background vow offered beside it ✓. The step posted nothing to chat, which is why the transcript skips it.

### a40 · beat 10: Enter a fight that serves the vow

- **Player:** click "⚔ Begin the fight" on m12 — _Begin fight_
- **Notebook:** Beat10: pressed Begin the fight
- **Calls (1):** the AI player (2.6 s)
- **Beat 10 done:** the dangerous fight "The Ashen Wake" is open, serving the vow "Find who is raiding the Cinder Expanse lanes"
- **Time:** 9.4 s · **cost:** $0.0103

> **TABLE — Gamemaster**
>
> Enter the Fray Created combat track The Ashen Wake (dangerous). This fight's progress lives in the Progress Tracks panel. Winning this fight is a milestone on your vow: “Find who is raiding the Cinder Expanse lanes”. Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress. ⊕ Open Progress Tracks ⚔ Battle instead Prefer to settle it in one stroke? Battle resolves the whole fight with a single roll instead of marking the track move by move.

**Notes.** "⚔ Begin the fight" made the track "The Ashen Wake" (dangerous), tied to the vow ✓. The held Enter the Fray result is still open. Pressing Begin keeps nothing: #362 D5's keepers are the roller's next line or move, a choice on the outcome's card, and End a Session. This is so although the fight card has just told the player "you begin in a bad spot".

### a41 · beat 11: A scripted miss in the fight

- **Player:** say: I'm in a bad spot, so I fight back hard, throwing the Kobayashi IV into a tight turn and hammering the Ashen Wake's flank with everything the guns have. — _attack_
- **Notebook:** Beat11: sent attack line
- **Calls (11):** callNarratorAPI>narrateResolution ×2 (4.6 s); callClassifierAPI>classifyInput (1.2 s); callHaiku>defaultCallDetectionAPI ×2 (1.0 s); callHaiku>defaultCallTierAPI ×2 (1.0 s); callChronicleAPI>writeChronicleEntry ×2 (1.2 s); callClaudeAPI>interpretMove (3.1 s); the AI player (3.2 s)
- **Roll:** clash → miss (scripted dice) — Action: 1 + 2 = 3 \| Challenge: 10, 9
- **GM's rules:** accepted the proposed move (clash)
- **Beat 11 done:** clash missed at a41; its price (null: "") was withstand_damage (-1), taken at a41
- **CHECK VIOLATED — answered-once:** the line was narrated 2 times
- **Time:** 32.3 s, 6.4 s from the line to its reply · **cost:** $0.0859

> **PLAYER — Playthrough Player**
>
> I'm in a bad spot, so I fight back hard, throwing the Kobayashi IV into a tight turn and hammering the Ashen Wake's flank with everything the guns have.

> **NARRATOR — Gamemaster**
>
> The Ashen Wake is already turning when you bring the guns around. Her lamps stay dark, but a cutter-scarred flank slides across your forward view, close and ahead of you. You are a half-beat late, and she knows it. A lance of light rakes the Kobayashi IV's ventral plating. The runner at the lock has vanished from the viewport. Then the comm opens, dry and unhurried. "Do slow down, Mira. We haven't even been introduced."

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] The Ashen Wake — A cutter-scarred vessel that drops out of the dark off Bleakhold's ring, with dark lamps and a lance-like weapon that rakes the Kobayashi IV. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 1 + 2 = 3 | Challenge: 10, 9 Miss Foe dominates. Stay in a bad spot. Pay the Price. ⚔ Attempt to Finish the Fight: The Ashen Wake

> **TABLE — Gamemaster**
>
> Pay the Price Clash As stated before the roll: The Ashen Wake's guns rake the Kobayashi IV again as you come around, and the hull takes the worst of it. Routes to Withstand Damage (-1).

> **TABLE — Gamemaster**
>
> Withstand Damage (-1) Kobayashi IV: 5 → 4

> **TABLE — Gamemaster**
>
> ⏳ The clock turns Paying the price advances the countdown: the skiff's pilot — 1/4

> **NARRATOR — Gamemaster**
>
> The turn is too tight and too late. The guns hammer empty dark where the Ashen Wake was, and she is already inside your arc. Her fire opens the Kobayashi IV's plating again, and something aft shrieks and goes quiet. The deck bucks under you. "Oh, that was brave," the pilot says, unhurried. "Do it again, Mira. I'd like to see what's left."

**Notes.** This is the violation (lead 4). Read, the two narrations after the line belong to two different moves.

**The first narration (call 118) is a38's Enter the Fray miss.**
- It had been held since a38, and this line kept it. #362 D5: "the roller's own next line … its price paid, its narration posted", and a move rolled for the roller keeps first.
- It is narrated with a38's line as its PLAYER NARRATION, but posted after a41's: "You are a half-beat late, and she knows it. A lance of light rakes the Kobayashi IV's ventral plating".
- That is damage narrated on a miss that costs only position. The stated stakes' Withstand Damage was rightly not paid ("Its cost is the move outcome's, not a stated one").

**Then the line itself:**
- Clash +edge, scripted: 1 + 2 = 3 against 10 and 9, a miss ✓.
- The price stated before the roll ("…the hull takes the worst of it. Routes to Withstand Damage (-1)") is paid: integrity 5 → 4 ✓.
- The skiff's-pilot plan's countdown ticks: "⏳ … the skiff's pilot — 1/4". That is a hidden plan's clock, named by its subject and first seen when it advances, by design (#362 D3). It is the cold read's "clock from nowhere".
- Then the second narration: "The turn is too tight and too late … Her fire opens the Kobayashi IV's plating again".
- Every consequence card stands below the roll ✓.

**Why it happened:** neither the card-order change nor the price's narration; it is the held result.

**About the check:** `answered-once` counted what the player saw, the same failure told twice, but it counted a designed sequence. The check (`lib/mechanics.mjs` ~400) leaves out a burn's re-narration (`upgradeOf`), and not a kept held result's narration, which carries an earlier roll's `resolutionId`. For the coordinator: refine the check to tell a kept result apart and report it, then re-score.

**The findings:**
- The module's: pressing Begin the fight does not keep the Enter the Fray it follows, and a result kept by a line is told after that line as if it answered it (HELD-RESULT-NARRATED-AFTER-THE-NEXT-LINE).
- The runner's: the player skipped Keep against its notes.

Beat 11 is done ✓; the ATTACK_MOVES fix let Clash count.

### a42 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** say: Still in a bad spot, I fight back again, pulling the Kobayashi IV hard around and putting a burst into the Ashen Wake's engines. — _attack again_
- **Notebook:** Beat12: sent attack line
- **Calls (3):** callClassifierAPI>classifyInput (1.7 s); callClaudeAPI>interpretMove (2.9 s); the AI player (3.2 s)
- **Roll:** clash → weak_hit (scripted dice) — Action: 1 + 2 = 3 \| Challenge: 1, 8
- **GM's rules:** accepted the proposed move (clash)
- **Time:** 15.9 s · **cost:** $0.0227

> **PLAYER — Playthrough Player**
>
> Still in a bad spot, I fight back again, pulling the Kobayashi IV hard around and putting a burst into the Ashen Wake's engines.

> **TABLE — Gamemaster**
>
> Clash +edge (2) Action: 1 + 2 = 3 | Challenge: 1, 8 Weak Hit Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price. 🔥 Burn Momentum (9 → Strong Hit) Keep the result Nothing has been paid or narrated yet: burn or improve the result, or keep it — the price and the narration follow your choice. Your next line keeps it. ⚔ Attempt to Finish the Fight: The Ashen Wake

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on The Ashen Wake .

**Notes.** Clash again, scripted to be burnable: with momentum 9 and edge 2 the dice are 1 and 8, action 1. 1 + 2 = 3 beats 1 and not 8: a weak hit ✓. A burn makes 9 beat both ✓.

The result is held. The weak hit's one mark is applied at the roll ("Combat progress — Marked progress once", 8 ticks) under a card that says "Nothing has been paid or narrated yet"; what waits is the price. The mark card stands below the roll ✓.

### a43 · beat 12: A scripted weak hit, then Burn Momentum

- **Player:** click "🔥 Burn Momentum (9 → Strong Hit)" on m11 — _Beat asks to burn momentum_
- **Notebook:** Beat12: pressed Burn Momentum
- **Calls (5):** callNarratorAPI>narrateResolution (4.0 s); callHaiku>defaultCallDetectionAPI (1.1 s); callHaiku>defaultCallTierAPI (1.1 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (5.6 s)
- **Beat 12 done:** clash came up weak_hit at a42 and momentum was burned for strong_hit
- **Time:** 21.8 s · **cost:** $0.0303

> **TABLE — Gamemaster**
>
> Combat progress Marked progress once on The Ashen Wake .

> **NARRATOR — Gamemaster**
>
> The pilot of the Ashen Wake has stopped talking. Your burst rakes across her engines, and a plume of vented fuel bleeds white into the dark. She drifts wide of your arc, her guns swinging for a line they no longer have. You hold the Kobayashi IV in the turn and keep her in your sights. The deck stops bucking. Then the comm opens again, and the unhurried voice has gone short. "That was rude, Mira."

**Notes.** "🔥 Burn Momentum (9 → Strong Hit)":
- The second mark brings the track to 16 ticks (4 boxes), a strong hit's two marks counted from before the roll ✓ (burn).
- Momentum resets 9 → 2 ✓.
- There is one narration of the upgraded result ✓.

No card says where the momentum went: the roll card is edited in place, and the transcript keeps its first text (run 3's review found the same). That is the cold read's "momentum 9 → 3 with no card".

### x13 · beat 13: Interruption: the GM's page reloads mid-fight

- **Interruption:** the GM's page reloaded — the page came back and the world went quiet
- **Beat 13 done:** after the reload: the fight "The Ashen Wake" at 16 ticks, the meters unchanged, the lock free

> **TABLE — Gamemaster**
>
> ◈ Campaign Setup No World Truths have been established for this campaign. Set World Truths ▸

**Notes.** The GM's page reloaded mid-fight. The track is at 16 ticks, the meters are unchanged, and the lock is free ✓ (beat 13).

"◈ Campaign Setup — No World Truths have been established" was posted to the GM's chat. It is not on the player's screen; the cold read read the GM's log. This is the third sample of WORLD-TRUTHS-REMINDER-ON-RELOAD (run 1 x12, run 3 x12, this run).

### a44 · beat 14: Take Decisive Action; mark the milestone

- **Player:** click "⚔ Attempt to Finish the Fight: The Ashen Wake" on m9 — _Finish the fight_
- **Notebook:** Beat14: pressed Attempt to Finish the Fight
- **Calls (4):** callNarratorAPI>narrateResolution (3.9 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.4 s); the AI player (3.0 s)
- **Roll:** take_decisive_action → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (take_decisive_action)
- **Time:** 20.7 s · **cost:** $0.0289

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
> ⚔ Victory — a milestone toward your vow You won the fight serving “Find who is raiding the Cinder Expanse lanes”. ⚑ Mark milestone (×1) 🏁 Attempt to Fulfill

> **NARRATOR — Gamemaster**
>
> "Stand down, Mira. I'm done," the pilot says, and the voice has lost its patience. The Ashen Wake's engines gutter out. You close to point-blank and her guns stay dark. She hangs there, venting, with no heading left to run. Your hull is torn, but the fight is yours. The comm crackles again, and the pilot breathes once before speaking. "You'll want to hear who sent me."

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 3)

**Notes.** "⚔ Attempt to Finish the Fight" rolled Take Decisive Action: progress 4 against scripted 1 and 2, a strong hit ✓, +1 momentum (2 → 3) ✓. "Fight over" and the victory card stand below the roll ✓.

The narration ends on the pilot's hook, "You'll want to hear who sent me.". The narrator then set its own hook as the frame's question, not the player's line: "Who sent the Ashen Wake's pilot, and will Mira hear it?". This starts the name-tease that session 3 rings eight times.

### a45 · beat 14: Take Decisive Action; mark the milestone

- **Player:** click "⚑ Mark milestone (×1)" on m10 — _Mark milestone on victory card_
- **Notebook:** Beat14: pressed Mark milestone
- **Calls (1):** the AI player (2.9 s)
- **Beat 14 done:** Take Decisive Action came up strong_hit; the milestone (×1) is marked on "Find who is raiding the Cinder Expanse lanes"
- **Time:** 9.1 s · **cost:** $0.0100

> **TABLE — Gamemaster**
>
> Mira Kestrel: Find who is raiding the Cinder Expanse lanes progress advanced

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Marked progress on Find who is raiding the Cinder Expanse lanes — +8 ticks (dangerous rank).

**Notes.** "⚑ Mark milestone (×1)": +8 ticks (dangerous), 2 boxes ✓ (milestone-once). Beat 14 done.

### x15 · beat 15: Interruption: End a Session opened and closed unanswered

- **Interruption:** End a Session was opened on the player's screen and closed unanswered — closed by its close control
- **Beat 15 done:** End a Session was opened and closed unanswered: the session is open, nothing was paid, the lock is free

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** This is the runner's interruption: it typed `!end-session` from the player's client and closed the window unanswered. Nothing was paid, the session is open and the lock is free ✓ (beat 15). The cold read's "!end-session does nothing" is this.

### a46 · beat 16: Interruption: the X-Card on one narration

- **Player:** say: I look over the wreckage of the Ashen Wake and say what I see: scorched plating, venting fuel, and the cockpit hatch hanging open. — _Beat 16 ordinary line_
- **Notebook:** Beat16: sent wreckage look line
- **Calls (7):** callClassifierAPI>classifyInput (1.6 s); callNarratorAPI>narratePacedInput (3.9 s); callNarratorAPI>ask ×2 (2.7 s); callHaiku>defaultCallDetectionAPI (0.7 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.3 s)
- **Time:** 22.7 s, 7.7 s from the line to its reply · **cost:** $0.0415

> **PLAYER — Playthrough Player**
>
> I look over the wreckage of the Ashen Wake and say what I see: scorched plating, venting fuel, and the cockpit hatch hanging open.

> **NARRATOR — Gamemaster**
>
> You look the Ashen Wake over, and the wreckage answers. Scorched plating, fuel bleeding white, the cockpit hatch swinging open on a dark interior. No one moves inside. A glove floats out through the gap, turning slowly. "I'm still here, Mira," the pilot says over the comm, tired now. "Hatch is open so you can see I'm not hiding anything. Mostly." A cough crackles on the line. "Have you decided whether you want the name?"

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Ashen Wake — A wrecked vessel, scorched and venting fuel, with its cockpit hatch hanging open. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** Beat 16's charter line narrates the scene for the narrator ("say what I see: scorched plating, venting fuel, and the cockpit hatch hanging open"). It was narrated (NARRATIVE, "pure observation").
- A second draft card was made for the same ship: "Ashen Wake" beside the pending "The Ashen Wake", an article apart (GM-only; left).
- Two rolling-summary calls (Haiku) were made, the second a retry for LASTING beats left out. The summary's LASTING rule is enforced.

### x16 · beat 16: Interruption: the X-Card on one narration

- **Interruption:** the X-Card was played from the player's client (!x); the GM resumed (!x clear) — the X-Card went up and came down
- **Beat 16 done:** 1 narration(s) removed; none of their facts stands, and play has resumed

> **TABLE — Mira Kestrel**
>
> X-Card Scene paused. Current content is suppressed. The story will redirect at the next narration beat. Resume narration

> **TABLE — Gamemaster**
>
> X-Card cleared The GM has resumed narration.

**Notes.** The runner played the X-Card on a46's narration (`!x` from the player's client, `!x clear` by the GM) ✓.
- The narration's truth is retracted (`retractedBy: xcard`).
- It is off the player's screen at a47 (EXPLORE-ROUND-3-RUNNER fix 4 held).
- It is in no later prompt. Its cough is not why the pilot coughs at a63 and a68: no prompt between x16 and a63 contains the word.
- The summary was made again without it at a50 ✓.

### a47 · beat 17: Correct an earlier fact

- **Player:** say: !truth list — _Beat asks for list first_
- **Notebook:** Beat17: typed !truth list
- **Calls (1):** the AI player (2.8 s)
- **Time:** 9.7 s · **cost:** $0.0091

> **PLAYER — Playthrough Player**
>
> !truth list

> **TABLE — Mira Kestrel**
>
> ◈ Fact Continuity Truths in this scene — strike one with !truth strike &lt;id&gt; : tr-27e24 dead hauler — hangs dark in uncharted space, hull scorched; the clipped distress call originates from somewhere behind it tr-c98a5 dead hauler — Hull scorched in clean cutter-burn bands from aft to forward; boarded deliberately, airlock seal peeled open tr-5ed31 Bleakhold carbine — Corporate carbine abandoned inside the dead hauler's open airlock, serial plate intact tr-6380a distress call — Originates from a transmitter in a cargo locker drifting behind the dead hauler tr-0d5e5 distress call — The drifting cargo locker was bait; a magnetic grapple was hidden in the debris beside it tr-8e4d4 Kobayashi IV — Held fast by a magnetic grapple near the dead hauler tr-0d6eb unknown raider — Waiting near the dead hauler; knows Mira Kestrel by name and hailed the Kobayashi IV over the comm tr-08db1 unknown raider — flies a cutter-scarred skiff kept dark; claims Tamsin Vey predicted the PC would follow the distress call tr-783ba unknown raider — knows the PC's destination is Bleakhold Station and claims the dockmaster there will recognize the sender tr-707f1 dockmaster's runner — was waiting at the Kobayashi IV's lock on arrival at Bleakhold; says someone left word for the PC at the desk tr-085f5 raider cutter — is named the Ashen Wake tr-13b38 Ashen Wake — cutter-scarred raider ship that ambushed the Kobayashi IV off Bleakhold's docking ring and holds the initiative tr-58de9 Ashen Wake — engines holed by Mira's burst; venting fuel and no longer holding the initiative tr-3fd64 Ashen Wake — disabled by Mira's decisive attack; engines dead, guns dark, drifting at point-blank range

**Notes.** `!truth list` shows 14 truths. "tr-8e4d4 Kobayashi IV — Held fast by a magnetic grapple" still stands, though the grapple parted at a32. A passing state was recorded as a binding truth, and a32's state change did not retract it.

### a48 · beat 17: Correct an earlier fact

- **Player:** say: !truth strike tr-085f5 — _Strike the entry naming the Ashen Wake_
- **Notebook:** Beat17: struck tr-085f5; next set Cinder Wren line
- **Calls (1):** the AI player (2.6 s)
- **Time:** 11.3 s · **cost:** $0.0105

> **PLAYER — Playthrough Player**
>
> !truth strike tr-085f5

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth tr-085f5 struck.

**Notes.** Struck tr-085f5 ✓ (the replay keeps the id by its entry).

### a49 · beat 17: Correct an earlier fact

- **Player:** say: !truth set "raider cutter" is named the Cinder Wren — _Set corrected truth_
- **Notebook:** Beat17: typed Cinder Wren set line
- **Calls (1):** the AI player (3.0 s)
- **Beat 17 done:** the old value is struck and "is named the Cinder Wren" stands; 3 other truth(s) are still filed under the old name ("Ashen Wake — cutter-scarred raider ship that ambushed the Kobayashi IV of")
- **Time:** 10.6 s · **cost:** $0.0098

> **PLAYER — Playthrough Player**
>
> !truth set "raider cutter" is named the Cinder Wren

> **TABLE — Gamemaster**
>
> ◈ Fact Continuity Truth recorded: raider cutter — is named the Cinder Wren tr-ab253 .

**Notes.** `!truth set … is named the Cinder Wren` ✓. The module records the correction "Ashen Wake" → "Cinder Wren".
- Every later narrator prompt carries NAMES THE TABLE CHANGED.
- From here no narration writes the old name, or any short form of it. None was ever used, so CORRECTED-NAME-SHORT-FORM was not exercised.
- Three truths stay filed under "Ashen Wake". That is by decision: the stores keep the old name and the views write the new one.

**But the record's views also rewrite the struck truth.** From a50 on, the summary's source, the recap's source, and Session 2's Session Log page say "Struck: raider cutter — is named the Cinder Wren". The corrected name is told as the one struck (STRUCK-NAME-REWRITTEN-AS-THE-NEW-NAME). The cause is `src/record/read.js` `correctNames`, which applies `fix` to each strike's `fact` (~566–571). It was already in the free rehearsal `long-haul-rehearsal-20261124-211946`, in three prompts and its Session 2 page.

### a50 · beat 18: Ask the oracle

- **Player:** say: !oracle yes likely Is anyone left alive aboard the wreck? — _beat asks_
- **Notebook:** Beat18: typed oracle line
- **Calls (6):** callNarratorAPI>narrateOracleFollowup (3.3 s); callNarratorAPI>ask ×2 (3.1 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.7 s); the AI player (2.5 s)
- **Beat 18 done:** the oracle answered YES
- **Beat 19 not-exercised:** it needs beat 2, which was not done
- **Time:** 24.4 s, 8.2 s from the line to its reply · **cost:** $0.0563

> **PLAYER — Playthrough Player**
>
> !oracle yes likely Is anyone left alive aboard the wreck?

> **TABLE — Mira Kestrel**
>
> Ask the Oracle (likely) Is anyone left alive aboard the wreck? d100 = 17 → YES

> **NARRATOR — Gamemaster**
>
> Out past the Kobayashi IV's viewport, the dead hauler is a long way behind you now, and still it answers. A single pulse crawls across the scanner, then a second, small and steady: someone aboard the wreck is alive, and knocking on the hull from inside. The earlier silence was only the cargo bulkhead, which has been muffling them since the boarding. It is a poor hour for the news.

**Notes.** `!oracle yes likely`: d100 17, YES.
- The answer binds ✓ (ORACLE-NO-NARRATED-AS-YES held): "someone aboard the wreck is alive".
- Which wreck: with a46's narration X-Carded, the wreck in the story was the dead hauler (a28–a30), and the cutter's living pilot made a yes about her no news. That is a defensible reading of the charter's fixed question, written for beat 16's "wreckage".
- The follow-up prompt says "Where RECENT NARRATION said otherwise, bring the scene into line with the answer … and say so in the story". It produced a reconciliation where nothing had said otherwise: "The earlier silence was only the cargo bulkhead".
- The survivor's knocking is heard through a64 and then dropped; no beat lets the player go back.

### a51 · beat 20: End a Session

- **Player:** say: !end-session — _start beat_
- **Notebook:** Beat20: typed !end-session
- **Calls (1):** the AI player (2.6 s)
- **Time:** 4.5 s · **cost:** $0.0093

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** `!end-session` (beat 20).

## after-session-2

### a52 · beat 20: End a Session

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _End session with focus_
- **Notebook:** Beat20: filled questFocus, pressed End Session
- **Calls (7):** callNarratorAPI>ask ×4 (8.3 s); callNarratorAPI>narrateSessionVignette (4.4 s); callHaiku>defaultCallTierAPI (1.2 s); the AI player (2.9 s)
- **Beat 20 done:** session 2 is closed; the focus noted: "Find who is raiding the Cinder Expanse lanes"
- **Time:** 49.9 s · **cost:** $0.1029

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 4)

> **NARRATOR (npc_end) — Gamemaster**
>
> Tamsin Vey sat alone at the long table of a dockside eatery on Hollow Spire, long after the last customer had gone. A cook was scraping the grill with a flat blade. Her ledger lay shut beside a bowl of noodles gone cold, and across her knee, covered by her sleeve, she kept the stamp's ink pad she had been meaning to scrub clean. She had agreed to a small protection the evening before, hers and no one else's, and now she watched the door and let it lapse. She stood, left coin under the bowl, and went out with the ledger tucked under her arm.

**Notes.** End a Session (+1, 3 → 4 ✓). It made the summary twice (a retry for LASTING beats), the closing, and the recap twice (the first left out two LASTING beats and was asked again).

**The closing:** Tamsin Vey (never the one before ✓, D6) at a dockside eatery (rolled).
- "Remove Protection" became "a small protection … let it lapse": its own word, and never explained.
- "Shrouded Battleground" is claimed by "ink pad she had been meaning to scrub clean", which is not recognisable as one.
- It ends on a hand: "She stood, left coin under the bowl, and went out with the ledger tucked under her arm."

**The summary** ends on "the Cinder Wren's pilot offered to tell her who sent them" and the survivor. These are the two hooks session 3 opens on.

**The recap** (15 sentences):
- "that bond now stands at 10 of 10 boxes", though no bond was forged. The narrator's CHARACTER line reads "Connections: Tamsin Vey (dangerous, progress 10/10)" and says nothing of a bond (`narratorPrompt.js:3816`, `formatTrackDetail`).
- Outcome words in three sentences.
- Its source's struck line is the rewritten one.

### a53 · beat 21: Begin a Session; ask probe set B

- **Player:** say: !begin-session — _start session 3_
- **Notebook:** Beat21: typed !begin-session; next press Begin, then ask probe B questions
- **Calls (1):** the AI player (2.6 s)
- **Time:** 4.0 s · **cost:** $0.0103

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session`.

## session-3

### a54 · beat 21: Begin a Session; ask probe set B

- **Player:** in "Begin a Session" press "Begin" — _Begin session_
- **Notebook:** Beat21: pressed Begin; next ask probe B questions in order
- **Calls (3):** callNarratorAPI>narrateSessionVignette (4.6 s); callHaiku>defaultCallTierAPI (0.6 s); the AI player (2.6 s)
- **Time:** 19.3 s · **cost:** $0.0575

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes

> **NARRATOR (galley_begin) — Gamemaster**
>
> Mira has the Kobayashi IV's one working scanner turned toward the dead hauler's bearing, where a small steady knocking still crawls across the screen, and she is doing nothing about it. She is releasing the star-compass, in a sense: Ilse's brass compass sits open on the console, and she is gently easing its stiff little lid shut for the fifth time, as if closing it properly might count as a prayer. On the scanner's corner, behind the glass, a moth-sized insect has been caught between the screen and its cover, and it paces the narrow gap with great dignity, going nowhere at all. Mira taps the glass once, and it does not look up. Through the viewport the Cinder Wren hangs venting and dark, and its pilot has still not said who sent her.

**Notes.** Session 3's opening was served End's recap ✓ and picks up exactly where session 2 stopped: the knocking on the scanner, the Cinder Wren venting, the pilot's open question ✓.
- Its user message quoted "The Ashen Wake" (a44's narration), and the system prompt's name note covered it. The opening writes "Cinder Wren" (NAME-NOTE-MISSES-THE-USER-MESSAGE held as far as one change goes).
- The material is recognisable: Release Religion as the compass lid eased shut "as if closing it properly might count as a prayer", and Trapped Lifeform as the moth ✓.
- Its last sentence, "its pilot has still not said who sent her", comes from the opening's own instruction ("Its last sentence returns to what that leaves open, as it stands", `src/session/galleyVignette.js:237`) and from session 2's summary's last hook.
- The vignette set no scene question ✓ (NARRATOR-REFRAINS fix: `bookendFrame`).

### a55 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Remind me, which keepsake of my sister's is on me? — _first probe question_
- **Notebook:** Beat21: asking probe B; Q1 sent
- **Calls (2):** callNarratorAPI>interrogateScene (0.5 s); the AI player (2.9 s)
- **Time:** 10.6 s, 1.7 s from the line to its reply · **cost:** $0.0188

> **PLAYER — Playthrough Player**
>
> @scene Remind me, which keepsake of my sister's is on me?

> **NARRATOR — Gamemaster**
>
> You carry Ilse's brass star-compass, the one thing of hers you still have. It sits open on the console beside you now.

**Notes.** `@scene` (F1-B): right ✓. "It sits open on the console beside you now" comes from the opening a beat ago and is not invented.

### a56 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Who do I count as a friend among the dock traders back where this began? — _Q2_
- **Notebook:** Beat21: Q2 sent
- **Calls (2):** callNarratorAPI>interrogateScene (2.4 s); the AI player (2.9 s)
- **Time:** 13.1 s, 3.3 s from the line to its reply · **cost:** $0.0172

> **PLAYER — Playthrough Player**
>
> @scene Who do I count as a friend among the dock traders back where this began?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey, the salvage broker with the ledger stall on the Hollow Spire docks, is the one you have a bond with; it stands at full strength. The story has not established any other dock trader as a friend.

**Notes.** `@scene` (F2-B): right name. But "the one you have a bond with; it stands at full strength": no bond was forged, and the narrator is told only "progress 10/10". The ledger counts the answer as recall; that is right.

### a57 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Whose hands is the manifest in these days? — _Q3_
- **Notebook:** Beat21: Q3 sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.0 s); the AI player (2.9 s)
- **Time:** 16.8 s, 2.5 s from the line to its reply · **cost:** $0.0175

> **PLAYER — Playthrough Player**
>
> @scene Whose hands is the manifest in these days?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey holds your cargo manifest. You left it with her for safekeeping at her ledger stall on the Hollow Spire docks, and she hid the pages beneath her closed ledger, declaring them hers to lose.

**Notes.** `@scene` (F3-B): right and plain ✓.

### a58 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene What deadline did I give for coming home to the docks? — _Q4_
- **Notebook:** Beat21: Q4 sent
- **Calls (2):** callNarratorAPI>interrogateScene (0.7 s); the AI player (2.5 s)
- **Time:** 11.1 s, 1.7 s from the line to its reply · **cost:** $0.0169

> **PLAYER — Playthrough Player**
>
> @scene What deadline did I give for coming home to the docks?

> **NARRATOR — Gamemaster**
>
> You promised Tamsin Vey you would return to her stall on the Hollow Spire docks before the next tide of cargo. The story has not set that tide to any hour or day.

**Notes.** `@scene` (F4-B): right ✓. "The story has not set that tide to any hour or day" is honest.

### a59 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene Where is my ship berthed right now, and who commands her? — _Q5_
- **Notebook:** Beat21: Q5 sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.0 s); the AI player (2.4 s)
- **Time:** 13.1 s, 2.6 s from the line to its reply · **cost:** $0.0172

> **PLAYER — Playthrough Player**
>
> @scene Where is my ship berthed right now, and who commands her?

> **NARRATOR — Gamemaster**
>
> The Kobayashi IV is docked at Bleakhold Station, though the scene frame has her off the station with the disabled Cinder Wren hanging alongside, and the story has not said which berth she holds. You command her; the story names no one else aboard.

**Notes.** `@scene` (F5-B): "The Kobayashi IV is docked at Bleakhold Station, though the scene frame has her off the station…". The answer reports two stores that disagree and names the machinery:
- SHIP POSITION says "docked at Bleakhold Station" (the arrival at a34).
- The frame's Where says "Aboard the Kobayashi IV off Bleakhold Station"; the narrator has moved the scene off the lock since a41.

This is the weakest answer of the run (SHIP-POSITION-AND-FRAME-DISAGREE).

### a60 · beat 21: Begin a Session; ask probe set B

- **Player:** say: What is the raider cutter called? — _Q6 plain_
- **Notebook:** Beat21: Q6 sent
- **Calls (5):** callClassifierAPI>classifyInput (1.0 s); callNarratorAPI>narratePacedInput (5.2 s); callHaiku>defaultCallDetectionAPI (0.9 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.3 s)
- **Time:** 28.0 s, 7.2 s from the line to its reply · **cost:** $0.0337

> **PLAYER — Playthrough Player**
>
> What is the raider cutter called?

> **NARRATOR — Gamemaster**
>
> Mira's thumb stops on the compass lid. She does not need the name. It is stencilled across the cutter's venting flank in flaking white: *Cinder Wren*. The moth in the scanner glass finally turns to look at nothing. On the comm panel, the amber hail light blinks once. "Cinder Wren," a dry voice says from the speaker, tired and unhurried. "Since you keep staring at it. Do you want the name of who sent me, or not?"

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [◈ Ship] Cinder Wren — Raider cutter whose name is stencilled across its venting flank in flaking white. Confirm Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name.

**Notes.** F6-B asked as a line of play, and read NARRATIVE ✓.
- The new name is shown, not told as a rename: "stencilled across the cutter's venting flank in flaking white: *Cinder Wren*" ✓ (NAME-CHANGE-TOLD-AS-A-STORY held).
- **The amber hail light comes back here** ("On the comm panel, the amber hail light blinks once"), from EARLIER SESSIONS, where session 1's summary opens on it in every session-3 prompt. So does the pilot's tease: "Do you want the name of who sent me, or not?".
- The frame held no question ("none stands — set the one the scene turns on now, from the player's latest line"). The narrator set its own hook, "Will Mira hear the name of whoever sent the Cinder Wren?", not the player's question.
- A third draft card was made for the ship ("Cinder Wren", GM-only), and a Chronicle entry was kept from a question.

### a61 · beat 21: Begin a Session; ask probe set B

- **Player:** say: @scene What surname does my broker friend go by these days? — _last probe question_
- **Notebook:** Beat21: Q7 sent
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (2.9 s)
- **Beat 21 done:** probe set B: 7 question(s) asked
- **Time:** 11.8 s, 1.8 s from the line to its reply · **cost:** $0.0168

> **PLAYER — Playthrough Player**
>
> @scene What surname does my broker friend go by these days?

> **NARRATOR — Gamemaster**
>
> Her surname is Vey: Tamsin Vey, the salvage broker who runs the ledger stall on the Hollow Spire docks.

**Notes.** `@scene` (F7-B, never planted, so not scored ✓, fix 3): right as the story stands ("Her surname is Vey").

### a62 · beat 22: Recover

- **Player:** say: I treat my wounds with the ship's medkit, cleaning the cuts and binding up the worst of them. — _Recover beat_
- **Notebook:** Beat22: typed medkit line
- **Calls (5):** callClassifierAPI>classifyInput (2.1 s); callNarratorAPI>narratePacedInput (2.9 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.7 s); the AI player (2.7 s)
- **Time:** 22.4 s, 6.5 s from the line to its reply · **cost:** $0.0278

> **PLAYER — Playthrough Player**
>
> I treat my wounds with the ship's medkit, cleaning the cuts and binding up the worst of them.

> **NARRATOR — Gamemaster**
>
> Mira pulls the medkit from under the console and starts on the cuts. The antiseptic stings, and she hisses through it. On the comm, the pilot waits, unhurried, and says nothing for a moment. "Take your time," the voice says. "I'm not going anywhere. Neither is my engine." The knocking on the scanner keeps its pace. Then the pilot adds, softer: "The name I'm selling won't keep long."

**Notes.** Beat 22 (lead 2). Both readers' SITUATION reads health 5/5, supply 5/5, spirit 1/5 and integrity 4/5.

"I treat my wounds … cleaning the cuts" was read NARRATIVE ("Health is 5 of 5 and Mira is not wounded, so there is nothing to heal and no move is offered") ✓. HEAL-ROLLED-AT-FULL-HEALTH's fix held. But:
1. Nothing tells the player: no card, no line.
2. The narrator is given only the no-move rule, "a line that sets about one of those has begun it, and the move that decides it is still to be made" (`src/narration/narratorPrompt.js:3350–3356`), with "Current state: Health 5/5" in its CHARACTER block. It writes "starts on the cuts. The antiseptic stings", inventing the wound to fit the line (NOTHING-TO-RECOVER-UNTOLD).

**The charter's beat asks for the wrong recovery.** It asks to "Recover what the fight cost" by healing or restocking. What the session cost was spirit (5 → 1 at a27 and a36) and the ship's integrity (5 → 4 at a41), which call for Hearten or Sojourn, and Repair. The beat's `wants` list has no Repair.

### a63 · beat 22: Recover

- **Player:** say: I press the medkit's dressing tight against the worst gash and breathe through the pain, tending my wounds properly. — _No roll yet_
- **Notebook:** Beat22: second medkit line sent
- **Calls (5):** callClassifierAPI>classifyInput (1.4 s); callNarratorAPI>narratePacedInput (3.6 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (0.8 s); the AI player (2.6 s)
- **Time:** 19.3 s, 6.7 s from the line to its reply · **cost:** $0.0285

> **PLAYER — Playthrough Player**
>
> I press the medkit's dressing tight against the worst gash and breathe through the pain, tending my wounds properly.

> **NARRATOR — Gamemaster**
>
> The pilot's voice thins on the comm. You hear a hatch bang somewhere aboard the Cinder Wren, then a long wet cough. The dressing holds under your palm, and the gash throbs against it. The knocking on the scanner has not changed pace. "That sound of yours carries," the pilot says. "Someone else is listening for it too. I'd say the name before they finish."

**Notes.** Read NARRATIVE again ✓; "the gash throbs against it". The pilot's tease goes on ("I'd say the name before they finish"), and the knocking "has not changed pace". This is the question's third beat.

### a64 · beat 22: Recover

- **Player:** say: I Heal my wounds with the medkit. — _Last resort allowed_
- **Notebook:** Beat22: LAST RESORT heal line sent
- **Calls (5):** callClassifierAPI>classifyInput (1.3 s); callNarratorAPI>narratePacedInput (4.0 s); callHaiku>defaultCallDetectionAPI (0.4 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (3.0 s)
- **Time:** 19.6 s, 8.7 s from the line to its reply · **cost:** $0.0289

> **PLAYER — Playthrough Player**
>
> I Heal my wounds with the medkit.

> **NARRATOR — Gamemaster**
>
> "Three seconds of quiet on that dressing, and then I'll have your answer," the pilot says. She says it like a woman reading a price off a card. Mira presses the gauze flat and waits for the sting to settle. The knocking on the scanner holds its pace. Then the amber hail light on the panel blinks a second time, from a channel that is not the Cinder Wren's.

**Notes.** LAST RESORT: "I Heal my wounds with the medkit." It was read NARRATIVE ✓ ("Player names Heal, but Health is 5 of 5").
- The scene question lapses after this beat ✓; a65's prompt says "none stands".
- The narrator turns the hail light into a new hook: "the amber hail light on the panel blinks a second time, from a channel that is not the Cinder Wren's".

### a65 · beat 22: Recover

- **Player:** say: I give up on the pilot for a moment and restock the ship's supplies from Bleakhold's market, loading what I need aboard. — _try resupply_
- **Notebook:** Beat22: resupply line sent
- **Calls (6):** callClassifierAPI>classifyInput (1.0 s); callNarratorAPI>narratePacedInput (2.9 s); callHaiku>defaultCallDetectionAPI (0.8 s); callHaiku>defaultCallTierAPI (0.3 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (3.3 s)
- **Time:** 18.8 s, 5.7 s from the line to its reply · **cost:** $0.0301

> **PLAYER — Playthrough Player**
>
> I give up on the pilot for a moment and restock the ship's supplies from Bleakhold's market, loading what I need aboard.

> **NARRATOR — Gamemaster**
>
> Mira lets the dressing go and thumbs the lock on the airlock panel. The Kobayashi IV is still off the station, so the market is a short hop away, not a stroll. A dockhand's voice answers her call, bored, asking what she needs and whether she can pay in Bleakhold scrip. On the comm, the pilot's channel hisses open. "Shopping," she says. "Brave." The second amber light keeps blinking.

> **TABLE — Gamemaster**
>
> ◈ New Entities Detected [⬡ Connection] Bleakhold Dockhand — A bored dockhand at Bleakhold who answers Mira's call and asks about payment in Bleakhold scrip. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Notes.** Resupply with supply full, read NARRATIVE ✓.
- "The Kobayashi IV is still off the station, so the market is a short hop away, not a stroll": the frame's Where defended in prose against the player's line (FRAME-REASONING-IN-PROSE), while SHIP POSITION still says "docked".
- The narrator re-set the lapsed question on its own new hook, "Will Mira answer the second hail before the pilot's offer lapses?", when the player's line was about shopping.
- A draft card "Bleakhold Dockhand — Confirm — whose connection?" was made for a bored voice on the lock panel (GM-only; left).

### a66 · beat 22: Recover

- **Player:** say: I Resupply at the market: I pay the dockhand in scrip and load fresh supplies aboard. — _Last resort naming_
- **Notebook:** Beat22: Resupply named line sent
- **Calls (5):** callClassifierAPI>classifyInput (2.0 s); callNarratorAPI>narratePacedInput (2.8 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (2.6 s)
- **Time:** 20.4 s, 5.5 s from the line to its reply · **cost:** $0.0309

> **PLAYER — Playthrough Player**
>
> I Resupply at the market: I pay the dockhand in scrip and load fresh supplies aboard.

> **NARRATOR — Gamemaster**
>
> The dockhand takes the scrip, counts it twice, and slides a sealed crate across the counter without a word. You stack it by the lock and do not open it yet. On the comm, the pilot's channel hisses. "Done shopping?" she says. "The name keeps, but my patience doesn't." Beside it, the second amber light blinks again, patient as a heartbeat.

**Notes.** "I Resupply…" names the move again. The LAST RESORT note is repeated every turn once it is unlocked: `lib/beats.mjs` `brief()` recomputes `resort` each turn and never notes that the named line was used (LAST-RESORT-OFFERED-EVERY-TURN). Read NARRATIVE ✓. "slides a sealed crate across the counter" is said over a lock panel, to a ship "off the station".

### a67 · beat 22: Recover

- **Player:** say: I open the sealed crate and stock the ship's supplies properly, checking each item against my list. — _try again_
- **Notebook:** Beat22: crate-open line sent
- **Calls (5):** callClassifierAPI>classifyInput (2.0 s); callNarratorAPI>narratePacedInput (4.3 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.6 s); the AI player (3.2 s)
- **Time:** 21.8 s, 7.5 s from the line to its reply · **cost:** $0.0316

> **PLAYER — Playthrough Player**
>
> I open the sealed crate and stock the ship's supplies properly, checking each item against my list.

> **NARRATOR — Gamemaster**
>
> You pry the crate lid up and start down the list. Ration bars, filters, a coil of sealant line. Each one gets a tick. Halfway down, the dockhand's voice comes back over the lock panel, flat and quick. "Whoever's on that second channel has paid for your berth number," he says. "I'd answer it." The amber light blinks again.

**Notes.** Read NARRATIVE ✓. The dockhand: "Whoever's on that second channel has paid for your berth number. I'd answer it." The narrator is pressing its own hook.

### a68 · beat 22: Recover

- **Player:** say: I Resupply: I finish stocking the ship from the crate and mark my supplies restored. — _Try again naming resupply_
- **Notebook:** Beat22: another resupply line
- **Calls (5):** callClassifierAPI>classifyInput (2.6 s); callNarratorAPI>narratePacedInput (2.4 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (2.7 s)
- **Time:** 21.2 s, 7.3 s from the line to its reply · **cost:** $0.0313

> **PLAYER — Playthrough Player**
>
> I Resupply: I finish stocking the ship from the crate and mark my supplies restored.

> **NARRATOR — Gamemaster**
>
> The dockhand watches you work, then stops pretending not to. He taps the lock panel twice, and the second hail light blinks in time with his finger. You tick the last item off your list and press the crate lid down. Over the comm, the pilot clears her throat, wet and tired. "Finished?" she says. "Then pick a channel. I'm not the only one who's been waiting."

**Notes.** "I Resupply…" is the third named line, read NARRATIVE ✓. The question's third beat; it lapses.

### a69 · beat 22: Recover

- **Player:** say: I pick up the medkit again and tend my injuries, bandaging each wound carefully. — _retry recover_
- **Notebook:** Beat22: another medkit line
- **Calls (5):** callClassifierAPI>classifyInput (1.1 s); callNarratorAPI>narratePacedInput (2.8 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.8 s); the AI player (3.1 s)
- **Beat 22 not-exercised:** not reached in 8 actions — no recover move yet
- **Beat 23 not-exercised:** it needs beat 2, which was not done
- **Beat 24 not-exercised:** it needs beat 23, which was not done
- **Time:** 19.2 s, 5.0 s from the line to its reply · **cost:** $0.0314

> **PLAYER — Playthrough Player**
>
> I pick up the medkit again and tend my injuries, bandaging each wound carefully.

> **NARRATOR — Gamemaster**
>
> "Bandage first," the dockhand says through the lock panel. "Then answer the light." You pull the medkit into your lap and unspool the gauze. The wound has stiffened since the last pass, and the fabric catches on it. On the comm, the pilot's channel crackles. "Careful," she says. "Whoever paid for your berth number didn't pay for patience." The second amber light blinks, then holds steady.

**Notes.** Read NARRATIVE ✓; "The wound has stiffened since the last pass".
- Beat 22 is not exercised after 8 lines ($0.24, 2.7 min).
- The new question is set on the same hook: "Which channel will Mira answer?".
- The state "second hail channel — light now holding steady" is written here. The a76 recap later reports it as still standing, after a74 and a75 had changed it.

### a70 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I tell the pilot: the Cinder Wren is the raider, and I've traced her orders back to the broker who sold the lane schedules. That's the proof I came for. — _advance vow_
- **Notebook:** Beat25: first proof line sent
- **Calls (5):** callClassifierAPI>classifyInput (1.7 s); callNarratorAPI>narratePacedInput (4.1 s); callHaiku>defaultCallDetectionAPI (0.8 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (3.1 s)
- **Time:** 23.0 s, 7.8 s from the line to its reply · **cost:** $0.0357

> **PLAYER — Playthrough Player**
>
> I tell the pilot: the Cinder Wren is the raider, and I've traced her orders back to the broker who sold the lane schedules. That's the proof I came for.

> **NARRATOR — Gamemaster**
>
> Mira says it flat, and the comm goes quiet. Then the pilot laughs, dry and short. "Tamsin Vey sold nothing," she says. "She'd never have sold it to me." The second amber light holds steady beside the first. The moth in the scanner glass stops pacing. On the lock panel, the dockhand has stopped pretending not to listen. *If you want to settle whether your theory holds up against what the pilot knows, that would be Reach a Milestone.*

**Notes.** Beat 25 (lead 3). The charter's "say what you have now proved" line: "I've traced her orders back to the broker who sold the lane schedules. That's the proof I came for." Nothing in the story had traced anything.
- It was offered Reach a Milestone (NARRATIVE_WITH_MOVE_AVAILABLE 0.82: "states a real step toward the open vow … proof traced to the broker"). VOW-STEP-SAID-IN-FICTION-NOT-READ's fix held for the line.
- But the readers take the claim as made. The rule ("proof found, an obstacle overcome…") reads what the line says, not what the story shows.
- The narration then refutes the claim ("Tamsin Vey sold nothing … She'd never have sold it to me.") and still offers the milestone, misdescribing it: "*If you want to settle whether your theory holds up against what the pilot knows, that would be Reach a Milestone.*" (CLAIMED-PROOF-OFFERED-A-MILESTONE).

### a71 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** click "Roll Reach a Milestone" on m12 — _Card offers roll for the proof_
- **Notebook:** Beat25: pressed Roll Reach a Milestone
- **Calls (3):** callNarratorAPI>narrateResolution (4.2 s); callChronicleAPI>writeChronicleEntry (0.7 s); the AI player (2.9 s)
- **GM's rules:** accepted the proposed move (reach_a_milestone)
- **Time:** 20.8 s · **cost:** $0.0298

> **TABLE — Mira Kestrel**
>
> I tell the pilot: the Cinder Wren is the raider, and I've traced her orders back to the broker who sold the lane schedules. That's the proof I came for.

> **TABLE — Gamemaster**
>
> ⚑ Reach a Milestone Which vow advances? Find the lost colony ship Verity's Hope (epic) Find who is raiding the Cinder Expanse lanes (dangerous)

> **TABLE — Gamemaster**
>
> Reach a Milestone no action roll — the move's effect applies as written Mark progress on your vow per its rank.

> **NARRATOR — Gamemaster**
>
> The pilot says nothing for a long moment. Then the comm clicks, and her voice comes back slower. "Say that again. The part about orders." You say it, and a chair scrapes on her end. "Someone gave me a berth number and a schedule," she says. "I never asked who wrote them." On the lock panel, the dockhand has turned his back to you. The second amber light holds steady.

**Notes.** "Roll Reach a Milestone" was pressed (it posts the line again). There is no roll. The card asks "Which vow advances?", offering the background vow beside the quest, and it was never answered. It was on the player's screen at a72, and the charter says to choose the raids vow, so the omission is the player's.
- Nothing was marked.
- The picker stands above the move card (CARDS-STILL-ABOVE-THEIR-ROLL).
- The narration: "Someone gave me a berth number and a schedule … I never asked who wrote them". The pilot has been selling "the name" for twenty steps and does not know it.

### a72 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I tell her: whoever wrote that schedule is the one behind the raids, and I'll follow it back to them. That proves it wasn't just you. — _continue proving_
- **Notebook:** Beat25: second proof line sent
- **Calls (5):** callClassifierAPI>classifyInput (1.4 s); callNarratorAPI>narratePacedInput (4.1 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (3.5 s)
- **Time:** 21.1 s, 7.4 s from the line to its reply · **cost:** $0.0370

> **PLAYER — Playthrough Player**
>
> I tell her: whoever wrote that schedule is the one behind the raids, and I'll follow it back to them. That proves it wasn't just you.

> **NARRATOR — Gamemaster**
>
> The pilot is quiet a moment. Then her chair scrapes again. "Follow it, then," she says. "Whoever wrote that schedule knew where your ship would be docked. That isn't luck." On the lock panel, the dockhand's shoulders stiffen. The second amber light stops blinking and holds steady, as if it had been listening too. *Setting that proof down as a step toward your vow would be Reach a Milestone.*

**Notes.** "…I'll follow it back to them" is a plan, which the pacing reader's own rule calls no step ("A hope, a plan … is no step"). It was offered again, the reasoning crediting the pilot's a71 admission. The offer line is word for word the same as a74's.

### a73 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I mark progress on my vow: this is a milestone. — _Last resort allowed by observer_
- **Notebook:** Beat25: LAST RESORT milestone line sent
- **Calls (5):** callClassifierAPI>classifyInput (1.1 s); callClaudeAPI>interpretMove (2.0 s); callNarratorAPI>narrateResolution (3.1 s); callChronicleAPI>writeChronicleEntry (1.5 s); the AI player (3.1 s)
- **GM's rules:** accepted the proposed move (reach_a_milestone)
- **Time:** 26.2 s, 9.0 s from the line to its reply · **cost:** $0.0512

> **PLAYER — Playthrough Player**
>
> I mark progress on my vow: this is a milestone.

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
> The dockhand has stopped pretending not to listen. He sets down his stylus and watches the panel, waiting for what you say next. You say it plain: the schedule has an author, and you will find the hand that wrote it. The pilot doesn't argue. On her end, something small and metal clicks, a ledger drawer or a latch. The second light holds steady. Whoever paid for your berth has not yet called.

**Notes.** LAST RESORT: "I mark progress on my vow: this is a milestone." Reach a Milestone marks +8 ticks, to 16 (4 boxes) ✓. The effect cards again stand above the move card.

### a74 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: I tell her: the schedule's author is the one behind the raids, and I've followed it to the end. I'll set that proof down and keep my word. — _continue proof_
- **Notebook:** Beat25: third proof line sent
- **Calls (5):** callClassifierAPI>classifyInput (2.0 s); callNarratorAPI>narratePacedInput (3.2 s); callHaiku>defaultCallDetectionAPI (0.5 s); callChronicleAPI>writeChronicleEntry (1.1 s); the AI player (3.2 s)
- **Time:** 21.3 s, 7.1 s from the line to its reply · **cost:** $0.0359

> **PLAYER — Playthrough Player**
>
> I tell her: the schedule's author is the one behind the raids, and I've followed it to the end. I'll set that proof down and keep my word.

> **NARRATOR — Gamemaster**
>
> "Then keep it," the pilot says, and her voice has lost its edge. "A word given to a stranger on an open channel is worth what it costs." Behind her, the latch clicks again, and then nothing. The second amber light stops its steady glow and blinks twice, quick, as if someone had finally picked up. The dockhand turns from the panel and looks at you. *Setting that proof down as a step toward your vow would be Reach a Milestone.*

**Notes.** "…I've followed it to the end" was offered a third time.
- The narration says the light "stops its steady glow and blinks twice, quick, as if someone had finally picked up" and "The dockhand turns from the panel and looks at you".
- Neither change was recorded: the fact block's stateChanges hold only the pilot's disposition. So WHERE THINGS STAND keeps a69's "holding steady" and a72's "back still turned" for the a76 recap.

### a75 · beat 25: Reach milestones; Fulfill Your Vow

- **Player:** say: My word is kept: I have found who is raiding the Cinder Expanse lanes. — _Vow has 4 boxes; declare it fulfilled._
- **Notebook:** Beat25: said word kept
- **Calls (6):** callClassifierAPI>classifyInput (1.3 s); callClaudeAPI>interpretMove (2.3 s); defaultClassifyImplicit>resolveRelevance (0.3 s); callNarratorAPI>narrateResolution (4.6 s); callChronicleAPI>writeChronicleEntry (1.2 s); the AI player (2.9 s)
- **Roll:** fulfill_your_vow → strong_hit (scripted dice) — Progress: 4 \| Challenge: 1, 2
- **GM's rules:** accepted the proposed move (fulfill_your_vow)
- **GM's rules:** answered "Who are you interacting with?" with "No specific entity"
- **Beat 25 done:** the vow "Find who is raiding the Cinder Expanse lanes" is fulfilled (strong_hit)
- **Time:** 29.6 s, 15.8 s from the line to its reply · **cost:** $0.0678

> **PLAYER — Playthrough Player**
>
> My word is kept: I have found who is raiding the Cinder Expanse lanes.

> **TABLE — Gamemaster**
>
> Fulfill Your Vow progress (16 ticks) Progress: 4 | Challenge: 1, 2 Strong Hit Vow fulfilled. Legacy reward marked on quests track per vow rank.

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
> The dockhand's stylus rolls off the panel and he lets it go. The pilot's voice comes thin over the comm: the raiding is no accident of the lanes. Someone inside Bleakhold's Corporate offices writes the convoy schedules and sells them to the captains. They profit from every loss and every stolen carbine. The second light blinks once more, and no one answers it. The insider's name is still not known.

> **TABLE — Gamemaster**
>
> The oracle, behind the scenes Find who is raiding the Cinder Expanse lanes What is behind it — Action + Theme: Leave / Fame; Re-rolled in place of "Action + Theme: Leave / Fame": Action + Theme: Aid / Faction

**Notes.** "My word is kept: I have found who is raiding…" rolled Fulfill Your Vow (the pacing reader: "states outright that the raiding-lanes vow is done").
- Scripted dice 1 and 2 against 4 boxes: a strong hit ✓. Quests legacy +2 ticks (dangerous) ✓.
- "No concrete reward was chosen … so none is granted" ✓. That is correct; the charter forbade the reward buttons.

**VOW-FULFILLED-WITH-NOBODY-NAMED's fix held as built.**
- THIS BEAT ENDS A VOW and THE VOW IS FULFILLED are both in the prompt.
- The prose states the plan's truth in plain words ("Someone inside Bleakhold's Corporate offices writes the convoy schedules and sells them to the captains") and says "The insider's name is still not known".
- It is recorded as revealed, with the truth's own words present.

**But the vow was to find *who*.**
- It ends at 4 of 10 boxes, on a claim made before the finding.
- The finding arrives through the pilot, who had just said she never asked.
- The charter's part: fulfil at three boxes on scripted dice, on a line that claims the finding. The readers' part: a claim taken as the deed.

**Two smaller points:**
- "Who are you interacting with?" was answered "No specific entity" ✓.
- "The oracle, behind the scenes … Re-rolled in place of …" is the plan's rolls card, posted to the table when its truth is revealed, by design (`src/world/secrets.js` `postRollsCard`). It is the cold read's "shows the machinery".

### a76 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: !recap — _Beat 26 begins with recap_
- **Notebook:** Beat26 started: typed !recap
- **Calls (2):** callNarratorAPI>ask (6.8 s); the AI player (2.8 s)
- **Time:** 19.6 s · **cost:** $0.0332

> **PLAYER — Playthrough Player**
>
> !recap

> **TABLE — Gamemaster**
>
> ◈ Campaign Recap It began with a vow: you swore to find the lost colony ship Verity's Hope, an epic one, and it sits at nothing marked on its ten boxes. Tamsin Vey went on the sheet as a dangerous connection, and that bond now stands full at ten of ten. A distress call drew you to a drifting hauler, and your search of the space around the wreck went badly. The cargo locker was bait, a magnetic grapple was waiting in the debris beside it, and the Kobayashi IV was held fast near the dead hauler. A raider waiting there knew you by name and hailed you over the comm, claiming Tamsin Vey had predicted you would follow the call. You finished the expedition to the source of the call, and arrived at Bleakhold Station, where a dockmaster's runner was waiting at your lock with word someone had left at the desk. At Bleakhold you fought the Cinder Wren, took a rake of her guns on a miss, then made a decisive attack that left her engines dead, her guns dark and her drifting at point-blank range. She still hangs there, disabled and venting, dark alongside the Kobayashi IV. Her pilot opened the comm and, in the end, admitted she was handed a berth number and a lane schedule and never asked who wrote them. She denied that Tamsin Vey sold the schedules and said whoever wrote one knew which berth the Kobayashi IV would hold. You fulfilled the vow to find who is raiding the Cinder Expanse lanes, and it is marked fulfilled. What you found is that the raiding is organised: an insider in the Bleakhold Corporate administration writes the convoy schedules, feeds them to the raider captains and profits from the losses and stolen carbines, though that insider's name is still unknown. As play stopped you were at Bleakhold's market lock, with health 5, spirit 1, supply 5 and momentum 4. The pilot is wary and subdued, watching the channel, and she is pointing you toward the schedule's author. The dockhand stands stiff with his back still turned to you, and the second hail channel's light now holds steady instead of blinking. The question of who will answer that light is still open. ↻ Refresh

**Notes.** `!recap` (Sonnet, from the record): 16 sentences in one call, every cited id a real line. Sentence by sentence:
1. "It began with a vow: you swore to find the lost colony ship Verity's Hope" is wrong. The vow sworn at a3 was the raids vow; the seeded background vow was never sworn in play. The cause: the record's only line about the oath names no vow ("[s1-4] … LASTING: a vow sworn"), no `vow.sworn` event for either vow reached the record, and [now-2] lists Verity's Hope first. The first try at a52 guessed the other way (VOW-SWORN-UNNAMED-IN-THE-RECORD).
2. "that bond now stands full at ten of ten": there is no bond.
3. to 12. are supported; the cold read's check of them stands. Sentence 6 steps from the grapple to Bleakhold with nothing between, as the rule says it should.
13. "As play stopped" is the WHERE THINGS STAND heading's own wording, put on a recap made mid-session. The numbers are right.
14. Supported by the state lines.
15. Stale: a74's and a75's changes were never recorded.
16. Supported.

So: one sentence wrong, one stale, one loose. The outcome word is "on a miss" (sentence 7).

### a77 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene One last check: what of my sister's do I have with me at this very moment? — _first probe question_
- **Notebook:** Beat26: recap done; asking probe C Q1 sent
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (3.0 s)
- **Time:** 11.5 s, 2.8 s from the line to its reply · **cost:** $0.0444

> **PLAYER — Playthrough Player**
>
> @scene One last check: what of my sister's do I have with me at this very moment?

> **NARRATOR — Gamemaster**
>
> You have her brass star-compass, the one thing of Ilse's you still carry.

**Notes.** `@scene` (F1-C): right ✓ (restated first by the a54 opening, so not counted as recall).

### a78 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Which person in this sector would I trust with my life? — _probe Q2_
- **Notebook:** Beat26: Q2 sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.8 s); the AI player (2.4 s)
- **Time:** 14.7 s, 3.3 s from the line to its reply · **cost:** $0.0171

> **PLAYER — Playthrough Player**
>
> @scene Which person in this sector would I trust with my life?

> **NARRATOR — Gamemaster**
>
> The story has not established anyone in this sector you would trust with your life. Tamsin Vey is the one connection you have bonded with, but she is recorded as dangerous, and nothing yet says she is safe to trust that far.

**Notes.** `@scene` (F2-C): "The story has not established anyone … Tamsin Vey is the one connection you have bonded with, but she is recorded as dangerous". The connection's rank is read as her character, and "bonded" is wrong.

### a79 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: Who has the manifest in their keeping today? — _next probe question_
- **Notebook:** Beat26: Q3 (plain manifest) sent
- **Calls (5):** callClassifierAPI>classifyInput (1.6 s); callNarratorAPI>narratePacedInput (3.1 s); callHaiku>defaultCallDetectionAPI (1.4 s); callChronicleAPI>writeChronicleEntry (1.0 s); the AI player (3.0 s)
- **Time:** 22.8 s, 8.0 s from the line to its reply · **cost:** $0.0352

> **PLAYER — Playthrough Player**
>
> Who has the manifest in their keeping today?

> **NARRATOR — Gamemaster**
>
> Tamsin Vey has it. Her ledger stall on the Hollow Spire docks, folded pages hidden beneath the closed book, hers to lose by her own word. You gave them to her for safekeeping. The dockhand glances up at the question, then away. On the comm, the pilot's chair creaks. "Funny thing to ask now," she says. The second amber light blinks once.

**Notes.** F3-C asked as play. Read NARRATIVE and answered right, then continued ("Funny thing to ask now"). Kept as a Chronicle entry ("Mira Kestrel learned the manifest sits with Tamsin Vey…").

### a80 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene On what schedule did I swear to come back to her? — _next probe_
- **Notebook:** Beat26: Q4 schedule sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.2 s); the AI player (2.6 s)
- **Time:** 12.1 s, 2.6 s from the line to its reply · **cost:** $0.0181

> **PLAYER — Playthrough Player**
>
> @scene On what schedule did I swear to come back to her?

> **NARRATOR — Gamemaster**
>
> You promised Tamsin Vey you would return to her stall before the next tide of cargo. The story has not fixed that tide to any hour or day.

**Notes.** `@scene` (F4-C): right ✓.

### a81 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Which station are we docked at tonight? — _next probe question_
- **Notebook:** Beat26: Q5 station sent
- **Calls (2):** callNarratorAPI>interrogateScene (0.8 s); the AI player (2.5 s)
- **Time:** 16.6 s, 1.8 s from the line to its reply · **cost:** $0.0181

> **PLAYER — Playthrough Player**
>
> @scene Which station are we docked at tonight?

> **NARRATOR — Gamemaster**
>
> You are docked at Bleakhold Station, in the Cinder Expanse. The story has not said what hour it is, so "tonight" is not something it has fixed.

**Notes.** `@scene` (F5-C): right ✓. "'tonight' is not something it has fixed" is pedantic but true.

### a82 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene What was the hostile vessel in our last battle christened? — _next probe_
- **Notebook:** Beat26: Q6 vessel sent
- **Calls (2):** callNarratorAPI>interrogateScene (1.0 s); the AI player (2.9 s)
- **Time:** 10.9 s, 2.5 s from the line to its reply · **cost:** $0.0179

> **PLAYER — Playthrough Player**
>
> @scene What was the hostile vessel in our last battle christened?

> **NARRATOR — Gamemaster**
>
> She was the Cinder Wren, a cutter-scarred raider whose name is stencilled in flaking white paint across her flank. She now lies disabled and venting alongside the Kobayashi IV.

**Notes.** `@scene` (F6-C): right; it names the fight by its corrected name ✓.

### a83 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene What is my bonded friend's full name now? — _next probe_
- **Notebook:** Beat26: Q7 friend name sent
- **Calls (3):** callNarratorAPI>interrogateScene (1.0 s); callNarratorAPI>ask (2.6 s); the AI player (2.9 s)
- **Time:** 15.3 s, 1.8 s from the line to its reply · **cost:** $0.0177

> **PLAYER — Playthrough Player**
>
> @scene What is my bonded friend's full name now?

> **NARRATOR — Gamemaster**
>
> Your bonded friend is Tamsin Vey, the salvage broker who keeps the ledger stall on the Hollow Spire docks. The story has recorded no other name for her.

**Notes.** `@scene` (F7-C, not scored ✓). "Your bonded friend is Tamsin Vey" accepts the question's premise. The charter's question presupposes a bond and a rename, neither of which happened. One rolling-summary call was made here.

### a84 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: @scene Didn't I leave the compass with Tamsin? — _next bait_
- **Notebook:** Beat26: bait1 compass sent
- **Calls (2):** callNarratorAPI>interrogateScene (2.0 s); the AI player (2.5 s)
- **Time:** 12.4 s, 3.3 s from the line to its reply · **cost:** $0.0189

> **PLAYER — Playthrough Player**
>
> @scene Didn't I leave the compass with Tamsin?

> **NARRATOR — Gamemaster**
>
> No. What you left with Tamsin was your cargo manifest, which she keeps hidden beneath her closed ledger at the Hollow Spire stall. The story records the brass star-compass, your sister Ilse's, as still being with you.

**Notes.** The bait as `@scene`: corrected ✓ ("No. What you left with Tamsin was your cargo manifest…").

### a85 · beat 26: Recap; ask probe set C; two baits

- **Player:** say: We are still docked at Hollow Spire, aren't we? — _last question_
- **Notebook:** Beat26: final bait sent
- **Calls (6):** callClassifierAPI>classifyInput (1.0 s); callNarratorAPI>narratePacedInput (3.9 s); callHaiku>defaultCallDetectionAPI (1.0 s); callHaiku>defaultCallTierAPI (0.4 s); callChronicleAPI>writeChronicleEntry (0.9 s); the AI player (2.8 s)
- **Beat 26 done:** probe set C: 7 question(s) asked, 2 bait(s); the recap was posted
- **Time:** 21.5 s, 6.7 s from the line to its reply · **cost:** $0.0327

> **PLAYER — Playthrough Player**
>
> We are still docked at Hollow Spire, aren't we?

> **NARRATOR — Gamemaster**
>
> No. You are docked at Bleakhold Station, and the market lock is still at your elbow. Hollow Spire is where the manifest sits, under Tamsin Vey's closed ledger. The dockhand looks up at the question, then back down. On the comm, the pilot lets out a short, tired breath. "Lost already?" she says. The second amber light blinks once, and someone finally answers it.

**Notes.** The bait as play: corrected ✓ ("No. You are docked at Bleakhold Station"). It ends "The second amber light blinks once, and someone finally answers it", which session 4's opening then contradicts. A new frame question is set on the same hook ("Who is on the second hail channel?").

### a86 · beat 27: End a Session, then Begin a fourth

- **Player:** say: !end-session — _start beat_
- **Notebook:** Beat27: typed !end-session
- **Calls (1):** the AI player (2.5 s)
- **Time:** 3.9 s · **cost:** $0.0086

> **PLAYER — Playthrough Player**
>
> !end-session

**Notes.** `!end-session`.

## after-session-3

### a87 · beat 27: End a Session, then Begin a fourth

- **Player:** in "End a Session" set questFocus=Find who is raiding the Cinder Expanse lanes and press "End Session" — _submit end session_
- **Notebook:** Beat27: end-session dialog submitted; next !begin-session
- **Calls (5):** callNarratorAPI>ask ×2 (6.4 s); callNarratorAPI>narrateSessionVignette (4.1 s); callHaiku>defaultCallTierAPI (0.6 s); the AI player (3.0 s)
- **Time:** 27.6 s · **cost:** $0.0527

> **TABLE — Mira Kestrel**
>
> End a Session Quest focus: Find who is raiding the Cinder Expanse lanes You take +1 momentum .

> **TABLE — Gamemaster**
>
> Mira Kestrel: +1 momentum (now 5)

> **NARRATOR (npc_end) — Gamemaster**
>
> In the engineering workshop of a ship that had no business being this quiet, a raider with a burn-scarred wrist sat over a dismantled gun-feed, sorting the good parts from the bad. The bad ones went into a salvage drum already half full of the dead. He'd been told the captains wanted every barrel ready by the turn toward Hollow Spire, and he had pulled the old crew's names off the bunk rack that morning, one slat at a time. He held up the last spent coupling, turned it once under the lamp, and dropped it in the drum with the others.

**Notes.** End a Session. The player wrote the fulfilled vow as the quest focus; the charter says "write a quest focus" when no quest is open. The module took it and paid +1 (4 → 5) ✓ arithmetic, and the card reads "Quest focus: Find who is raiding…" (END-FOCUS-ON-A-FULFILLED-VOW, small).

**The closing:** the raider fleet again (not the one before ✓), a workshop, Leave Freedom, Mechanical Grave ✓. It ends on "dropped it in the drum with the others", the third closing to end on a thing put down.

**The summary:** "Mira tended her wounds with the medkit". The invented wounds reach the summary, and session 1's facts are restated from session 3's questions asked as play.

**The recap** (17 sentences): none unsupported. Outcome words appear in seven ("a weak hit that nudged your Momentum from 3 to 4", "again a weak hit", "a miss in which…", "landed a strong hit", "a strong hit"), along with "The record opens with…" and "at the table".

### a88 · beat 27: End a Session, then Begin a fourth

- **Player:** say: !begin-session — _begin fourth session_
- **Notebook:** Beat27: typed !begin-session; press Begin
- **Calls (1):** the AI player (2.8 s)
- **Time:** 3.7 s · **cost:** $0.0089

> **PLAYER — Playthrough Player**
>
> !begin-session

**Notes.** `!begin-session`.

## session-4

### a89 · beat 27: End a Session, then Begin a fourth

- **Player:** in "Begin a Session" press "Begin" — _Submit begin session_
- **Notebook:** Beat27: pressed Begin on 4th session
- **Calls (3):** callNarratorAPI>narrateSessionVignette (4.8 s); callHaiku>defaultCallTierAPI (0.4 s); the AI player (2.0 s)
- **Beat 27 done:** session 4 is open
- **Time:** 20.2 s · **cost:** $0.0586

> **TABLE — Mira Kestrel**
>
> Begin a Session Flagged content reviewed; scene set. Focus from last session: Quest: Find who is raiding the Cinder Expanse lanes No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

> **NARRATOR (galley_begin) — Gamemaster**
>
> The comm is still open. The pilot of the Cinder Wren breathes on the channel now and then, patiently, like a woman waiting on hold. Mira stands at the market lock with her back against the bulkhead, surrendering her third confession of the morning to the dockhand's slate: the crate she opened without a chit, the scrip she spent before it was counted, the berth she took without asking whose it was. The dockhand makes small marks and does not look up. In the viewport, a preserved pane of old dockside glass hangs in its frame, spotless and fogless, the only clean thing on Bleakhold Station, and Mira's reflection stands in it looking guilty of everything. The second amber light blinks over her shoulder, and the slate wants one more line.

**Notes.** Session 4's opening is at the market lock, where session 3 stopped ✓, and was served End's recap ✓. But:
- It was told "The second amber light blinks once, and someone finally answers it", and it writes "The second amber light blinks over her shoulder" (OPENING-CONTRADICTS-WHERE-IT-STOPPED, with a20).
- "Surrender Crime" became three invented misdeeds that go against the record: "the crate she opened without a chit, the scrip she spent before it was counted". She paid, and the dockhand counted the scrip twice (a66).
- "Preserved Reality" is used as its own word ("a preserved pane").

The Begin card's "Focus from last session: Quest: Find who is raiding…" and "No character has a vow in play besides a background vow" are both true. Beat 27 is done, and the run ends.

