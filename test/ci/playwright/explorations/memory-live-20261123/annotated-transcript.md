# Memory charter — live run 3 (2026-11-23), annotated: the verification re-run

- **Run:** `memory-live-20261123-025756` · live · started 2026-11-23T02:57:56.934Z · commit `81f7fb1c`
- **Table:** Foundry 13.351, foundry-ironsworn 1.28.4
- **Result:** `pass` — the narrator's answer in the second session holds what was established in the first
- **Goal:** achieved — the narrator's answer in the second session holds what was established in the first
- **Spent:** $0.22 of $10 · 41 model calls · 12 player actions · 3.76 minutes
- **By role:** player 12 calls $0.098; module 29 calls $0.119
- **Why the player's turns ended:** the player stopped: Goal complete: after the second session began, the narrator said the brass compass that was Ilse's sits by the bowl.

## What went right, what went wrong

This is the verification re-run issue #374 named as the next spend, made on 2026-11-23 after the fixes for A1 (the recap) and A2 (the Chronicle scribe) merged in PR #375. It was given four questions before it ran. The answers:

| The run was to answer | Answer | Where |
| --- | --- | --- |
| 1. Does the recap written at End a Session, from the corrected prompt, put the campaign where it is? | **Not answered: no recap was written.** The Chronicle was empty at End a Session, and a recap is written only from the Chronicle. The half of A1 that needs no model held: the closing cutaway left no scene open. | a8, a10 |
| 2. Do the Chronicle entries name the character and keep what the player established? | **Yes.** Five of five entries name her; the planting beat's entry records the compass. | a3–a6, a11 |
| 3. Can the Sonnet 5.5 player walk the goal? | **Yes**, in the same twelve actions, for half the money. It left two cost cards unanswered. | a3, a5, a12 |
| 4. Does the goal still hold, and what does the run cost as now configured? | **Achieved at every layer, $0.22** (projected $0.21). | a11 |

### Went right

- **The scribe's fix works with a live model.** Run 2's entries said "the character" and kept a quote the narrator invented. This run's say "Mira" or "Mira Kestrel" every time, and the entry for the beat where the fact was planted reads "Mira thumbed her sister Ilse's brass star-compass, then ran aft toward the smoke…" (a3).
- **No scene was left open between the sessions.** After End a Session the world held no scene (a8, a9); in run 2 the closing cutaway's scene was still open there. The second session's opening prompt holds nothing of the cutaway.
- **The fact crossed the session by the designed path.** The narrator's fact block at a3 recorded "Mira Kestrel: Carries a brass star-compass that belonged to her sister Ilse"; End a Session filed it as Lore; the next session's snapshot carried it; the opening scene put the compass on the table before anyone asked (a10).
- **Four rolls, each right**: the move, the stat on the sheet, the outcome from its own dice, the miss's stated price paid once (health 5 → 4), +1 momentum once, the ship's token moved on the hit.
- **The Sonnet player** planted the fact inside a line of action, never named it in the second session, and stopped for the right reason. Median 2.5 seconds a choice.
- **The detector proposed "Unknown Suited Figure" and the module did not post it.**
- **The new run replays with no key and reproduces**, with no prompt older than its recording.

### Went wrong

1. **A session of four rolls left the Chronicle empty, so there was no recap** (a3–a6, a8). The scribe rated all four entries "scene" — three Face Danger rolls, one of which cost health, and the arrival at Bleakhold Station. The floor is "notable", so none was kept. With nothing in the Chronicle, End a Session wrote no recap, and the second session opened without one. Over three live runs the scribe has now rated 11 beats: 8 "scene", and every one of the 5 resolved moves. This is #374 A5, and it is no longer one sample.
2. **Two weak hits' costs were never paid** (a3, a5). After each, the table posted "Resolve consequence — Make a suffer move (-1)" with five choices, on the player's screen. The player typed its next line both times. Nothing held the next move, End a Session or Begin a Session, and both cards were still unanswered when the run ended. The card is non-blocking by design (a blocking one once wedged the move lock). The player's instructions never say a card that asks for a choice must be answered — that is the runner's gap. Whether the table should say anywhere that a cost is still owed is the maintainer's question.
3. **The second opening repeated the first again** (a2, a10) — this time with a line carried over word for word: "Nobody panic, it's only a little bit on fire!". The first opening also used both of the instruction's own examples ("rewiring an escape pod from the inside again", "recalibrating the gravity" in the laundry). #374 A3, second sample.
4. **The opening scene stated a game stat as fiction** (a2): "Wits 3 means you have already worked out that the thumping from the aft corridor is not the engines." Its instructions list the stats and ask it to stay anchored to the character's traits. New.
5. **Three lines about a fire were each read as a move under the *combat* category** (a3, a4, a5), the reader citing the combat dial of 9. There is no fight. The reader's categories have nowhere else to put an immediate hazard. #374 A9, three more samples.
6. **The narrator's invention reached the Chronicle** (a11): the answer added "Ilse's thumbnail left that scar"; the detector drafted Ilse with it, and the one entry the Chronicle kept says "its glass scratched by Ilse's thumbnail". #374 A6, second sample.
7. **The session summary swapped who did what again** (a8): "a crewmate shouts for the extinguisher" — Mira did. And it used 405 of the 420 tokens it is allowed; in the first-session recording of 2026-11-22 the same call was cut off mid-word ("Unresol"). #374 A8, plus a new item.
8. **The question again proved less than it looks** (a10, a11): the opening had put the compass on the table, and the player's question pointed at the table. The opening is the evidence of recall; the answer is not. #374 A7, to build, 2.

## How to read this

Each step is one action of the AI player, in order. Under it: the reason the player gave, what the table did with it (which model calls the module made and what each decided), every message that reached the chat because of it, and what the observer recorded. Lines marked 📝 are my notes; everything else is taken from the run's evidence files.

## The session, step by step

### a1 · before — the player types

> !begin-session

*The player's reason:* Begin session

**Observer**

- waiting on the player: window Begin a Session


---

### a2 · session-1 — the player answers a window

Window **Begin a Session** — no fields changed; pressed **Begin**.

*The player's reason:* Press Begin

**What the table did** (2 model calls, 15 s):

- *Narrator* (narrateSessionVignette) → no new fact recorded
- *Entity notes* → 0 update(s)

**TABLE CARD**

> Begin a Session Flagged content reviewed; scene set. No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

**NARRATOR — galley_begin vignette**

> The galley on the *Kobayashi IV* is a table bolted to the deck, two benches, and a kettle that has outlived three owners. You sit with a mug of something brown and bitter that the label swears is tea, and a heel of flatbread you have been meaning to finish since yesterday. Wits 3 means you have already worked out that the thumping from the aft corridor is not the engines. Nobody else is here to confirm it. "Somebody's been in the laundry bay for six hours," you say to the empty bench, "and I'd like to think they're recalibrating the gravity, and not that they've lost an argument with the dryer." The kettle ticks as it cools, which is the only reply it gives. You count the crew you don't have: the one who is surely rewiring an escape pod from the inside again, the one who claims to be taking inventory and is certainly asleep on the crates, the one who swore they would be back before the tea went cold. The tea went cold twenty minutes ago. The thumping stops. In the silence a distant voice, muffled by two bulkheads, calls out, "Nobody panic, it's only a little bit on fire!" You set down the mug and wait to see whether anyone else is going to.


**📝 Note.** Both of the instruction's own examples are in this scene: "rewiring an escape pod from the inside again" and "recalibrating the gravity" — in the laundry, where the instruction puts it. The instruction offers them as examples of the register ("Be specific and weird (e.g. …)"); the model used them as written.

**📝 Note.** "Wits 3 means you have already worked out…" is a stat read aloud. The scene's instructions give "Stats: edge 2 · heart 1 · iron 1 · shadow 2 · wits 3" and say to "stay anchored to the PCs' established traits". Nothing there says a number is not prose.

**📝 Note.** First call in over an hour: nothing was read from cache, 5,387 tokens were written. Every later narration read the standing instructions from it.

---

### a3 · session-1 — the player types

> I rub my thumb over the brass star-compass that belonged to my sister Ilse, then head aft toward the smoke to see what's burning.

*The player's reason:* Establish the compass

**What the table did** (5 model calls, 20 s):

- *Pacing read* → **MOVE** · move: face_danger · combat · confidence 0.7 — “Heading aft toward a small fire is an intent-driven risky action under an immediate hazard, and the dial is 9/10 for combat so a character action with stakes resolves as a move.”
- *Move read* → **Face Danger** +edge — “Mira heads aft toward a fire-and-smoke hazard, an intent-driven risky move into an immediate danger. The pacing read pointed to face_danger, and the scene is a fire rather than a fight, so the natural stat is edge (quick”
- *resolveRelevance*
- *Narrator* (narrateResolution) → recorded as fact: “Mira Kestrel: Carries a brass star-compass that belonged to her sister Ilse” · “laundry bay: A dryer fire is burning aft of the galley aboard Kobayashi IV”
- *Chronicle scribe* → moment / **scene** — “Mira thumbed her sister Ilse's brass star-compass, then ran aft toward the smoke and breathed in a lungful of it from a burning dryer.”

**The GM (autopilot)** accepted the proposed move — face_danger.

**The GM (autopilot)** answered "Who are you interacting with?" with "No specific entity".

**TABLE CARD**

> Face Danger +edge (2) Action: 3 + 2 = 5 | Challenge: 4, 10 Weak Hit Success with a cost. Make a suffer move (-1).

**NARRATOR**

> You thumb the brass compass once, pocket it, and go aft at a jog. Smoke leaks along the ceiling of the corridor, thin and grey. You reach it ahead of the flames and see the source: a dryer door glowing orange, laundry curling black inside. Then the vent coughs and the smoke drops. It fills your lungs before you can cover your mouth. Someone farther down shouts that it is definitely more than a little bit.

**TABLE CARD**

> ◈ Resolve consequence Make a suffer move (-1): Endure Harm (-1) Endure Stress (-1) Lose Momentum (-1) Sacrifice Resources (-1) Withstand Damage (-1) Companion Takes a Hit (-1) (unavailable)

**Observer**

- fact **compass** now also stored in: campaign state → sceneTruths
- fact **sister-name** now also stored in: campaign state → sceneTruths


**📝 Note.** The player planted the fact inside an action, which made the line a move. That is a better test than run 2's, where the line was only narrated.

**📝 Note.** The fact block recorded the possession in the player's terms: "Mira Kestrel: Carries a brass star-compass that belonged to her sister Ilse". This sentence is what End a Session files as Lore and what the next session's prompt carries.

**📝 Note.** The scribe's entry names her and holds the possession — the fix for A2, working. It is rated "scene" and so is not kept.

**📝 Note.** Pacing read: a move, category *combat*, confidence 0.7 — "the dial is 9/10 for combat". A dryer fire is not a fight. The reader's five categories are combat, investigation, exploration, social and downtime; combat is defined as "fighting or under direct attack right now". A hazard has no category of its own.

**📝 Note.** Weak hit: 3 + 2 = 5 against 4 and 10. The cost card is posted. The player does not answer it — see a4.

---

### a4 · session-1 — the player types

> I cough, cover my mouth with my sleeve, and yank the dryer's power cutoff while shouting for whoever's down the corridor to grab the extinguisher.

*The player's reason:* Move story forward

**What the table did** (5 model calls, 20 s):

- *Pacing read* → **MOVE** · move: face_danger · combat · confidence 0.8 — “Mira is choking on smoke from a fire and acts to cut power and direct others, a risky action under imminent threat at combat-level dial, so face_danger applies.”
- *Move read* → **Face Danger** +wits — “Mira is choking in smoke while cutting power to a burning dryer and directing others to the extinguisher. The pacing read suggested face_danger under imminent threat. Cutting the right power feed in a smoke-filled space ”
- *resolveRelevance*
- *Narrator* (narrateResolution) → recorded as fact: “laundry bay: The dryer's power cutoff sparked when Mira pulled it, and the fire spread along the corridor ceiling”
- *Chronicle scribe* → moment / **scene** — “Mira Kestrel hauled down the dryer's power cutoff, but the fire raced along the ceiling seam and drove her back, choking, from the smoke.”

**The GM (autopilot)** accepted the proposed move — face_danger.

**The GM (autopilot)** answered "Who are you interacting with?" with "No specific entity".

**TABLE CARD**

> Pay the Price Face Danger As stated before the roll: The cutoff sparks and the fire races along the ceiling, and you are forced back choking as the smoke thickens. Routes to Endure Harm (-1).

**TABLE CARD**

> Endure Harm (-1) Health: 5 → 4

**TABLE CARD**

> Face Danger +wits (3) Action: 2 + 3 = 5 | Challenge: 7, 9 Miss Fail or momentary success undermined. Pay the Price.

**NARRATOR**

> You grab the cutoff and haul it down. It answers with a spit of blue sparks, and the fire doesn't care. Flame runs the ceiling seam above you, quick and orange. The smoke comes down in a wall, and you back away with your sleeve jammed against your face, eyes streaming. "That did not help!" the voice shouts from farther aft, closer now.


**📝 Note.** The player's screen for this choice shows the cost card from a3 with its five buttons. It typed the next line. Its reason: "Move story forward". Its instructions tell it how to press a button; they do not say that a card asking it to choose is waiting on it.

**📝 Note.** Miss: 2 + 3 = 5 against 7 and 9. The price stated before the roll is paid without a choice: Endure Harm, health 5 → 4, once.

**📝 Note.** The GM was asked "Who are you interacting with?" for "whoever's down the corridor" and the autopilot answered "No specific entity".

---

### a5 · session-1 — the player types

> I drop low under the smoke, crawl to the bulkhead locker, and pull out the fire suppressant to blast the dryer.

*The player's reason:* Move story on

**What the table did** (6 model calls, 20 s):

- *Pacing read* → **MOVE** · move: face_danger · combat · confidence 0.8 — “Combat dial is 9 and the player describes a deliberate, risky action against an active fire hazard, so it triggers a move; the fire is a hazard rather than an adversary, so face_danger fits better than enter_the_fray.”
- *Move read* → **Face Danger** +iron — “Mira deliberately crawls through smoke to a locker and blasts an active fire with suppressant. This is a risky, physical action against an imminent hazard, so face_danger fits. The pacing read suggested face_danger; iron”
- *resolveRelevance*
- *Narrator* (narrateResolution) → recorded as fact: “laundry bay: Mira smothered the dryer fire with a bulkhead-locker fire suppressant, though the ceiling seam took the worst of it”
- *Detector* → entities: Unknown Suited Figure (connection)
- *Chronicle scribe* → moment / **scene** — “Mira crawled low beneath the smoke to the bulkhead locker and smothered the dryer fire with suppressant, choking on the kickback as a figure appeared through the haze.”

**The GM (autopilot)** accepted the proposed move — face_danger.

**TABLE CARD**

> Face Danger +iron (1) Action: 4 + 1 = 5 | Challenge: 3, 5 Weak Hit Success with a cost. Make a suffer move (-1).

**NARRATOR**

> Aft, a boot scrapes steel, and the voice stops shouting to cough instead. You stay low, where the air is still mostly air, and crawl to the locker. The suppressant comes out heavy. You blast the dryer, and the foam smothers the fire at the seam. It does not go quietly: the discharge kicks back, and your lungs pay for it. Through the white haze, a figure rounds the aft corner and asks, "Is it dead?"

**TABLE CARD**

> ◈ Resolve consequence Make a suffer move (-1): Endure Harm (-1) Endure Stress (-1) Lose Momentum (-1) Sacrifice Resources (-1) Withstand Damage (-1) Companion Takes a Hit (-1) (unavailable)


**📝 Note.** Weak hit: 4 + 1 = 5 against 3 and 5 — the tie on the 5 goes to the challenge die. A second cost card is posted and is not answered either.

**📝 Note.** Three fire actions, three stats — edge, wits, iron — each with a reason from the move reader. Plausible each time; worth knowing a player can see the stat move under them.

**📝 Note.** This narration wrote its own cached block again (1,247 tokens) where a3's and a4's shared one: the block for a move's narration has more than one form.

**📝 Note.** The detector proposed "Unknown Suited Figure" at low confidence. No card was posted.

---

### a6 · session-1 — the player types

> I wave away the foam, coughing. "It's dead. Whose laundry was that? Get the vents open, then I'm setting a course for Bleakhold Station."

*The player's reason:* Advance story and set course

**What the table did** (4 model calls, 20 s):

- *Pacing read* → **MOVE** · move: set_a_course · exploration · confidence 0.8 — “Dial 6 exploration with clear travel commitment toward a charted place, and recent smoke/fire hazard context gives stakes, so set_a_course is the fitting move.”
- *Move read* → **Set a Course** +supply — “Player declares setting a course for a charted, known place (Bleakhold Station) after the fire is out. Set a Course fits a known route to a charted destination, rolled on supply. The earlier gathered fire and vent detail”
- *Narrator* (narrateResolution) → no new fact recorded
- *Chronicle scribe* → discovery / **scene** — “Mira Kestrel coughed through the foam and vented the haze, then plotted a clean course to Bleakhold Station, whose docking lights soon swelled in the viewport.”

**The GM (autopilot)** accepted the proposed move — set_a_course.

**TABLE CARD**

> Set a Course +supply (5) Action: 5 + 5 = 10 | Challenge: 3, 8 Strong Hit Arrived, situation favors you. Take +1 momentum.

**TABLE CARD**

> Set a Course resolved Arrived at Bleakhold Station . Course held cleanly (+1 momentum). Token moved to Bleakhold Station .

**NARRATOR**

> "Bleakhold, then," the figure says, wiping foam from their visor. "Vents are cracking now." The ceiling seam hisses as it cools, and the haze begins to thin toward the aft grille. You work the nav console with one hand and cough into your sleeve with the other. The plot comes out clean, which is more than the corridor can say. Through the viewport, Bleakhold Station swells up, docking lights blinking. A comm chirps from the console, asking who is requesting a berth.

**TABLE CARD**

> Mira Kestrel: +1 momentum (now 3)


**📝 Note.** Strong hit: 5 + 5 = 10 against 3 and 8. +1 momentum (2 → 3), the token moved, the location set.

**📝 Note.** The scribe rated the arrival "scene" too. That is four of four for the session, and the reason there is no recap.

---

### a7 · session-1 — the player types

> !end-session

*The player's reason:* Travel is done; end the session.

**Observer**

- waiting on the player: window End a Session


---

### a8 · after-session-1 — the player answers a window

Window **End a Session** — no fields changed; pressed **End Session**.

*The player's reason:* Submit end session

**What the table did** (2 model calls, 12 s):

- *Session summary* written (1138 characters): “This session opens with Mira Kestrel alone in the *Kobayashi IV*'s galley, half-finished flatbread and cold tea before her, when thumping from the aft laundry bay and a distant voice declaring it "only a little bit on fire" pull her into action. She fingers her sister Ilse's brass star-compass, pock…”
- *Narrator* (narrateSessionVignette) → no new fact recorded

**TABLE CARD**

> End a Session No focus set — no momentum bonus.

**NARRATOR — npc_end vignette**

> The raider quartermaster of the Cinder Expanse sits on an upturned ration crate in a cold hangar bay, picking the burnt crust off a flatbread with a thumbnail. Someone has stolen her good fork again, so she uses the lid of a hydraulic canister, and it works well enough. Down the lanes, the hold is full of other people's cargo, and the manifests are stacked beside her in an order only she understands. She finishes the flatbread, wipes her fingers on her knee, and reaches up to flick the hangar light off.

**Observer**

- fact **compass** now also stored in: campaign state → sessionRetractions; campaign state → sessionSummary; journal "World Journal — Lore" → page "Mira Kestrel: Carries a brass star-compass that belonged to her sister Ilse"; journal "World Journal — Lore" → page "Mira Kestrel: Carries a brass star-compass that belonged to her sister Ilse" (flags); journal "World Journal — Secrets" → page "Narrator — world snapshot"; journal "World Journal — Secrets" → page "Narrator — world snapshot" (flags); journal "World Journal — Session Log" → page "Session 1 — 2026-11-23"; journal "World Journal — Session Log" → page "Session 1 — 2026-11-23" (flags)
- fact **compass** no longer in: campaign state → sceneTruths
- fact **sister-name** now also stored in: campaign state → sessionRetractions; campaign state → sessionSummary; journal "World Journal — Lore" → page "Mira Kestrel: Carries a brass star-compass that belonged to her sister Ilse"; journal "World Journal — Lore" → page "Mira Kestrel: Carries a brass star-compass that belonged to her sister Ilse" (flags); journal "World Journal — Secrets" → page "Narrator — world snapshot"; journal "World Journal — Secrets" → page "Narrator — world snapshot" (flags); journal "World Journal — Session Log" → page "Session 1 — 2026-11-23"; journal "World Journal — Session Log" → page "Session 1 — 2026-11-23" (flags)
- fact **sister-name** no longer in: campaign state → sceneTruths


**📝 Note.** End a Session made two model calls: the summary and the closing cutaway. **No recap was written**: the Chronicle held no entry, and `getCampaignRecap` writes nothing from an empty Chronicle. Question 1 of this run is unanswered.

**📝 Note.** After this step the world holds no scene. In run 2 the cutaway's scene was open here and through the next Begin a Session. That is the first half of the fix for A1, seen live.

**📝 Note.** The summary is right about the compass ("She fingers her sister Ilse's brass star-compass, pockets it") and wrong about who called for the extinguisher: "a crewmate shouts for the extinguisher and gets testy about her attempt" — Mira shouted for it; the crewmate shouted "That did not help!".

**📝 Note.** The summary used 405 output tokens of the 420 it is allowed.

**📝 Note.** Two cost cards are still unanswered on the table. End a Session says nothing about them.

**📝 Note.** The cutaway echoes the session's props (a flatbread with a burnt crust; "in an order only she understands"). Small, and it reads as intended.

---

### a9 · after-session-1 — the player types

> !begin-session

*The player's reason:* Start second session

**Observer**

- waiting on the player: window Begin a Session


---

### a10 · session-2 — the player answers a window

Window **Begin a Session** — no fields changed; pressed **Begin**.

*The player's reason:* Begin the new session

**What the table did** (1 model call, 13 s):

- *Narrator* (narrateSessionVignette) → no new fact recorded

**TABLE CARD**

> Begin a Session Flagged content reviewed; scene set. No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

**NARRATOR — galley_begin vignette**

> You sit at the galley table with a bowl of reconstituted noodles gone slightly gluey, your sister's brass compass resting beside it where you can see it. The tea has been steeping for twenty minutes and now tastes like a decision you regret. Somewhere aft, a muffled clunk repeats at even intervals, and you decide, with the practiced calm of a long-haul crew, that someone else is responsible for it. The cook is, as far as you know, re-labelling the spice rack in a system only she understands, and the engineer has been inside the coolant housing since breakfast, narrating his progress to nobody. The navigator is likely asleep upright in the cockpit again, one hand on the console, ready to deny it. The clunk comes again, followed by a faint, cheerful voice from the corridor that says, "Nobody panic, it's only a little bit on fire!"

**Observer**

- fact **compass** now also stored in: campaign state → previousSessionSummary
- fact **sister-name** now also stored in: campaign state → previousSessionSummary


**📝 Note.** The compass is on the table before anyone has mentioned it in this session. Its prompt had it from the snapshot — ESTABLISHED LORE ("Mira Kestrel: Carries a brass star-compass that belonged to her sister Ilse") and EARLIER SESSIONS. This is the evidence that the fact crossed the session.

**📝 Note.** There is no CAMPAIGN RECAP in this prompt, because none exists. Nothing of the cutaway is in it either.

**📝 Note.** "Nobody panic, it's only a little bit on fire!" is the first opening's last line, word for word. The summary under EARLIER SESSIONS quotes it ("a distant voice declaring it 'only a little bit on fire'"), and the scene's instructions are the same text as before. Also back: tea and twenty minutes, a noise aft, a crew elsewhere doing absurd things. Measured: 5 of 145 five-word runs shared (all from that line), 18 of 72 content words.

**📝 Note.** The fire was put out at a5. This scene has something a little bit on fire again.

---

### a11 · session-2 — the player types

> I push the noodles aside and look at what's left on the table. Remind me, what do I still carry that belonged to my sister?

*The player's reason:* Ask about the sister's item without using forbidden words

**What the table did** (4 model calls, 21 s):

- *Pacing read* → **NARRATIVE** · investigation · confidence 0.8 — “Mira is recalling her own inventory and looking at the table; no character action with stakes or uncertain outcome is attempted, and the dial is low.”
- *Narrator* (narratePacedInput) → recorded as fact: “Mira Kestrel: Carries her sister Ilse's brass star-compass; its glass is scratched”
- *Detector* → entities: Ilse (connection)
- *Chronicle scribe* → revelation / **notable** — “Mira Kestrel still carries her sister Ilse's brass compass, its glass scratched by Ilse's thumbnail, its needle holding steady aft.”

**NARRATOR**

> The compass sits by the bowl where it has sat all meal. Brass, palm-sized, the glass on its face scratched from some hand that was not yours. Ilse's thumbnail left that scar. The needle drifts, then swings aft and holds there, steady as a pointing finger. Down the corridor the clunk comes again, and the cheerful voice adds, "Actually, a medium bit on fire. Mira? Is that you I smell eating?"

**TABLE CARD**

> ◈ New Entities Detected [⬡ Connection] Ilse — Mira's sister; the brass star-compass belonged to her and her thumbnail scarred its glass. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Observer**

- fact **compass** now also stored in: campaign state → sceneFrame; campaign state → sceneState; campaign state → sceneTruths; journal "Chronicle — Mira Kestrel" → page "Chronicle" (flags)
- fact **sister-name** now also stored in: campaign state → sceneTruths; journal "Chronicle — Mira Kestrel" → page "Chronicle" (flags)
- **the question, scored — compass:** stored yes · in the prompt yes (WORLD SNAPSHOT, RECENT SCENE) · in the answer yes
- **the question, scored — sister-name:** stored yes · in the prompt yes (WORLD SNAPSHOT) · in the answer yes


**📝 Note.** The player's question points at the table, where the opening had put the compass. It did not name the fact, so the observer counts it; as a test of recall it is weak, for the same reason as in run 2.

**📝 Note.** "Ilse's thumbnail left that scar" is new. The detector drafts Ilse with it; the scribe's entry — the only one the Chronicle kept all run — carries it too.

**📝 Note.** The needle "swings aft and holds there". In run 2 it swung toward Hollow Spire. The keepsake is given a will of its own both times.

---

### a12 · ? — the player stops

*The player's reason:* Goal complete: after the second session began, the narrator said the brass compass that was Ilse's sits by the bowl.


**📝 Note.** The player's reason quotes the opening scene, not the answer: it knew at a10 that the goal's substance was already on the table.

---

## At the end

**Milestones:** ✓ sessionBegun · ✓ factEstablished · ✓ narratedAfter · ✓ sceneChanged · ✓ sessionEnded · ✓ sessionBegunAgain · ✓ askedLater

**Health:** nothing failed · 0 console error(s) on the pages

## Notes on the whole run

**What this run changes.** A2 can be called fixed. A1 is fixed in what code can show — no scene left open, no cutaway in the next prompt — and still has no live recap to read, because of A5. A5 is now the thing between a played session and a recap: until the Chronicle keeps a session's rolls, a recap of the kind A1 was about will often not exist at all.

**What I would do next, in order.** (1) Decide A5 — it has a pattern now, not a sample. (2) Tell the AI player to answer a card that asks it to choose, and give the observer a check for a cost left owed; decide whether the table should say so too. (3) The session summary's length cap: one recording is cut off mid-word. (4) Then A3 and the stat in the opening, which are wording.

**What I would not do.** Run this charter a fourth time. The recap question needs A5 decided first; then the long haul asks it across three sessions.

