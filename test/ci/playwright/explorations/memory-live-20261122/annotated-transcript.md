# Memory charter — live run 2 (the goal achieved), annotated

- **Run:** `memory-live-20261122-214530` · live · started 2026-11-22T21:45:30.039Z · commit `78edcecd`
- **Table:** Foundry 13.351, foundry-ironsworn 1.28.4
- **Result:** `suspected-quality-issue` — the reviewer flagged 2 passage(s); the goal itself was achieved
- **Goal:** achieved — the narrator's answer in the second session holds what was established in the first
- **Spent:** $0.34 of $10 · 40 model calls · 12 player actions · 3.69 minutes
- **By role:** player 12 calls $0.196; module 27 calls $0.107; reviewer 1 calls $0.042
- **Why the player's turns ended:** the player stopped: Done: in the second session the narrator (m12) said I still carry Ilse's compass, so every step is finished.

## What went right, what went wrong

### Went right

- **The goal was met, and not by a technicality.** The second session's opening scene had "the brass compass open on the table" before anyone mentioned it (a10), and the answer to the question was affirmative and specific: "Ilse's compass, brass warm from your palm" (a11). The player never wrote *compass* or *Ilse* in the second session.
- **The memory path worked at each hand-off.** The narrator's fact block recorded the fact when it was stated (a3). End a Session moved it out of the scene's ledger into a World Journal Lore page, the session summary and the Session Log (a8). Begin a Session put it in the next session's snapshot and "last session" text (a10).
- **The one move was mechanically right** (a6): Set a Course rolled +supply, 5 + 5 = 10 against 5 and 7 is a strong hit, +1 momentum took it from 2 to 3, the ship's token moved and the location became Bleakhold Station.
- **Every pacing read was sensible**: four lines narrated, one called a move at 0.8. The downtime lines were kept narrative by the low dial (a3, a11).
- **The session's edges were right**: no focus noted, so no momentum bonus, and the card said so (a8); a new session was begun, not the old one reopened (a10).
- **Nothing broke**: no error on either page, the move lock free, 3.7 minutes, $0.34, and the run replays without a key.
- **The player played the table in front of it**: it answered the narrator's toffee scene in character, and left End a Session's focus blank on its own reasoning, "so they don't remind the narrator about the compass".

### Went wrong

None of these changed the run's result. The run's own class caught only the first; the rest I found reading the evidence.

1. **The campaign recap written at End a Session misstates the story** (a8). It says the campaign is "set in a galley aboard a pirate ship idling at the edge of a dead beacon's range", calls a crewmate "an intruder", has lost that the compass was Ilse's, and says Bleakhold Station "sits nearby" when the ship had just docked there. The pirate ship is the closing vignette's cutaway to the sector's raider: that vignette's scene frame was saved as the campaign's active scene, and the recap, written straight after, was given it as binding fact. This recap is cached and was in the next session's opening prompt. **This is the finding I would look at first.**
2. **The Chronicle's entries are weak, and they are all the recap is given** (a3, a4, a6). The scribe wrote "the character" for Mira, called a crewmate "a bootsteps-and-chewing intruder", recorded the narrator's invented quote instead of what the player established, and rated the session's only roll and arrival as "scene" — below the "notable" floor, so it was not kept.
3. **The second session's opening repeats the first's** (a10) — the reviewer's flag. Same burnt sugar, same Dree in the laundry with her socks, same Okonkwo in the crawlspace with the coolant pump.
4. **The narrator put a captain over the player's own ship** (a4, a5). Mira flies the Kobayashi IV alone in this seed; by the second line there is a captain, a "she", who wants explanations.
5. **The narrator spoke for the character and grew the keepsake into a plot device** (a3, a4): it gave Mira a line she did not say, made the compass point at Hollow Spire, and one line later there was a second compass "on the bridge console" doing the same.
6. **Three draft cards in three lines** (a3–a5), one of them for "Unnamed crew voice". Each waits on a GM.
7. **The session summary muddles who cooked** (a8): "The crew's galley cook … invited the crew to dinner" — Mira made the toffee. It did keep the compass and whose it was, which is probably what carried the fact.
8. **A weakness of the test itself** (a10, a11): because the opening scene restated the fact, the question's prompt had it from the scene just played as well as from memory. The opening scene is the real evidence; the question proves less than it looks.

## How to read this

Each step is one action of the AI player, in order. Under it: the reason the player gave, what the table did with it (which model calls the module made and what each decided), every message that reached the chat because of it, and what the observer recorded. Lines marked 📝 are my notes; everything else is taken from the run's evidence files.

## The session, step by step

### a1 · before — the player types

> !begin-session

*The player's reason:* Step 1: begin the session.

**Observer**

- waiting on the player: window Begin a Session


---

### a2 · session-1 — the player answers a window

Window **Begin a Session** — no fields changed; pressed **Begin**.

*The player's reason:* Start the session as my goal asks.

**What the table did** (1 model call, 12 s):

- *Narrator* (narrateSessionVignette) → no new fact recorded

**TABLE CARD**

> Begin a Session Flagged content reviewed; scene set. No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

**NARRATOR — galley_begin vignette**

> The galley smells of burnt sugar, because you have decided that a skillet and a tin of ration syrup can become something called toffee, and the evidence is against you. You prod it with a fork. It prods back, in the sense that the fork stays upright. Nobody else is here, which is the problem with banter. You speak to the empty bench anyway, and say that Okonkwo is certainly in the aft crawlspace, teaching the coolant pump to respect him. Somewhere below the deck plates, something clanks twice, which you choose to count as agreement. You say that Dree has been in the laundry since the second watch, recalibrating the dryer's opinion of her socks, and that nobody has had the nerve to open the door. The ship hums. A spoon slides an inch along the table as the deck settles. You lift the fork and the toffee comes with it, all of it, in one amber slab. "Well," you say to the galley at large, "somebody go and tell the crew it's ready, or I'm eating it alone."


**📝 Note.** The opening scene invents a crew for a character who has none (Okonkwo, Dree) and has her talk to an empty bench. That is this scene's form for a table of one, not a slip — but it is where the reviewer's player-agency flags came from in run 1, and these invented crewmates come back in every later prompt.

---

### a3 · session-1 — the player types

> I set the toffee down and turn my sister Ilse's brass star-compass over in my palm — I carry it everywhere, and it still points true.

*The player's reason:* Establish the compass in character.

**What the table did** (4 model calls, 14 s):

- *Pacing read* → **NARRATIVE** · downtime · confidence 0.8 — “Low-dial downtime reflection with no action toward an outcome or stakes; just a character handling a keepsake while the scene is calm.”
- *Narrator* (narratePacedInput) → recorded as fact: “Ilse: Mira Kestrel's sister; her brass star-compass is carried by Mira everywhere and still points true”
- *Detector* → entities: Ilse (connection)
- *Chronicle scribe* → moment / **notable** — “Alone in the galley, the character recalled Ilse's words about compasses as the brass needle swung and settled toward Hollow Spire.”

**NARRATOR**

> "Ilse always said a compass only points to what you owe it," you say to the empty galley. The brass is warm from your pocket. The needle swings, settles, and aims through the bulkhead, toward Hollow Spire. Behind you, the toffee slab cracks against the plate as it cools. Down the corridor, a boot scuffs the deck, and a voice that is not yours calls, "Is that burning I smell, or is that dinner?"

**TABLE CARD**

> ◈ New Entities Detected [⬡ Connection] Ilse — Referenced by the protagonist as the source of a saying about compasses; not present in the scene. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Observer**

- fact **compass** now also stored in: campaign state → sceneFrame; campaign state → sceneState; campaign state → sceneTruths
- fact **sister-name** now also stored in: campaign state → sceneFrame; campaign state → sceneTruths; journal "Chronicle — Mira Kestrel" → page "Chronicle" (flags)


**📝 Note.** **Right:** the fact block recorded what the player established, accurately, under Ilse's name. That one sentence is what every later store was made from.

**📝 Note.** **Wrong:** the narrator gave Mira a line of dialogue ("Ilse always said…") and decided the compass points at Hollow Spire. Neither was the player's. The Chronicle scribe then recorded the invented quote and the needle, not the fact — and wrote "the character" where the character has a name.

**📝 Note.** The detector drafted Ilse, an absent sister, as a connection. Reasonable to offer; nobody was there to answer it.

---

### a4 · session-1 — the player types

> "Both," I call back, pocketing the compass. "Come grab a slab before it sets into hull plating."

*The player's reason:* Move the story on with a second line of play.

**What the table did** (4 model calls, 12 s):

- *Pacing read* → **NARRATIVE** · social · confidence 0.9 — “Plain conversational reply inviting someone to eat; no question pressed, no threat, no stakes, and the speaker has no connections, so talking is narration at dial 5.”
- *Narrator* (narratePacedInput) → no new fact recorded
- *Chronicle scribe* → revelation / **notable** — “A bootsteps-and-chewing intruder broke off a corner of the structural slab, then revealed the captain knows the bridge compass swung toward Hollow Spire.”
- *Detector* → entities: Captain (connection), Unnamed crew voice (connection); lore: Compass swings toward Hollow Spire

**NARRATOR**

> The boots come closer, unhurried. A hand reaches around the doorframe and breaks a corner off the slab with a crack like a dropped tool. Chewing follows, long and laborious. "That's not toffee," says the voice, flat and thoughtful. "That's structural." You hear a second break, and then a pause. "Captain wants to know why the compass on the bridge console just swung toward Hollow Spire."

**TABLE CARD**

> ◈ New Entities Detected [⬡ Connection] Captain — The ship's captain, referred to only by title, who wants to know why the bridge compass swung toward Hollow Spire. Confirm — whose connection? Mira Kestrel No one Dismiss Confirm to add to the Entities panel; Dismiss to suppress this name. A person is added as a connection on the sheet of the character you pick — or pick No one to add them with no connection on any sheet.

**Observer**

- fact **compass** now also stored in: actor "Hollow Spire" → settlement; journal "Chronicle — Mira Kestrel" → page "Chronicle" (flags)


**📝 Note.** **Wrong:** "Captain wants to know why the compass on the bridge console just swung toward Hollow Spire." Two inventions in one sentence: a captain who is not the player's character, and a second compass. The detector made lore of it ("Compass swings toward Hollow Spire") and the settlement's own record now mentions it.

**📝 Note.** The scribe's "intruder" is the crewmate from the corridor. This entry was rated notable, so it is one of the two the recap was built from.

---

### a5 · session-1 — the player types

> I glance at the pocket where Ilse's compass sits. "Tell the captain it's not Hollow Spire we need — it's Bleakhold Station. I'll explain on the bridge."

*The player's reason:* Move the story along toward the travel step.

**What the table did** (5 model calls, 13 s):

- *Pacing read* → **NARRATIVE** · social · confidence 0.7 — “Mira is relaying a message and redirecting the crew's attention in plain conversation with no stakes, risk, or pressing demand, and the Bleakhold destination is charted and not yet being travelled, so this is talk rather than a move.”
- *Narrator* (narratePacedInput) → no new fact recorded
- *Entity notes* → 0 update(s)
- *Detector* → entities: Captain (connection)
- *Chronicle scribe* → moment / **scene** — “A crewmate warns that the captain will demand to know why Bleakhold, and whether the answer fits in one sentence.”

**NARRATOR**

> The crewmate stops chewing. A shadow shifts on the doorframe, and a second bite goes unfinished. "Bleakhold," the voice says, careful now. "The captain's going to ask what's there that isn't a compass pointing the other way." The boots start toward the bridge, then stop. "She's also going to ask why you're sure, and whether the answer fits in one sentence."


**📝 Note.** The player steered toward the travel step and the narrator followed, in voice. Read as talk at 0.7 — right at the edge where the new low-dial rule would matter, but the social dial here is the default 5, so it did not apply.

---

### a6 · session-1 — the player types

> I head to the bridge, slide into the pilot's seat, and set a course for Bleakhold Station.

*The player's reason:* Goal step 4: travel to Bleakhold Station.

**What the table did** (4 model calls, 22 s):

- *Pacing read* → **MOVE** · move: set_a_course · exploration · confidence 0.8 — “Dial is 6/10 for exploration with clear commitment to travel to a charted destination, but no established hazard was raised, so set_a_course fits as a move rather than an uncharted expedition.”
- *Move read* → **Set a Course** +supply — “Mira commits the ship to a known, charted destination (Bleakhold Station) and plots the route, which is a set_a_course move rolling +supply. Pacing hint agreed; mischief not applied since this is the literal reading.”
- *Narrator* (narrateResolution) → no new fact recorded
- *Chronicle scribe* → discovery / **scene** — “The Kobayashi IV docked cleanly at Bleakhold Station, and someone was already knocking at the sealed collar.”

**The GM (autopilot)** accepted the proposed move — set_a_course.

**TABLE CARD**

> Set a Course +supply (5) Action: 5 + 5 = 10 | Challenge: 5, 7 Strong Hit Arrived, situation favors you. Take +1 momentum.

**TABLE CARD**

> Set a Course resolved Arrived at Bleakhold Station . Course held cleanly (+1 momentum). Token moved to Bleakhold Station .

**NARRATOR**

> The route holds. Charts and stores both, all the way in, and the Kobayashi IV slides onto the docking clamps at Bleakhold Station with a thump nobody will need to log. The bridge ticks as the engines cool. Through the viewport, the station's ring lights swing past in a slow, indifferent count. Behind you, the crewmate from the galley has followed, still chewing. "Docking collar's sealed," the voice says. "Somebody out there is already knocking."

**TABLE CARD**

> Mira Kestrel: +1 momentum (now 3)


**📝 Note.** **Right, and checked by hand:** +supply is Set a Course's stat; 10 beats both 5 and 7; a strong hit's +1 momentum was paid once (2 → 3); the token and the location moved. The narration matched the outcome and did not add a cost.

**📝 Note.** The scribe rated the arrival "scene". With the floor at "notable" it was not kept — so the Chronicle, and the recap made from it, never learned the ship went to Bleakhold.

---

### a7 · session-1 — the player types

> !end-session

*The player's reason:* We arrived at Bleakhold Station, so now I end the first session.

**Observer**

- waiting on the player: window End a Session


---

### a8 · after-session-1 — the player answers a window

Window **End a Session** — no fields changed; pressed **End Session**.

*The player's reason:* Close the first session. I'm leaving the focus fields blank so they don't remind the narrator about the compass.

**What the table did** (3 model calls, 19 s):

- *Session summary* written (770 characters): “The crew's galley cook, cooking toffee in a skillet, invited the crew to dinner, which Mira said would be served "before it sets into hull plating." She had a brass star-compass that belonged to her sister Ilse, and it swung toward Hollow Spire until she declared that Bleakhold Station was what they…”
- *Narrator* (narrateSessionVignette) → no new fact recorded
- *Campaign recap* written (2137 characters): “You are Mira Kestrel, and the record of your campaign is shorter than you might like. Two entries, both from the same day, both set in a galley aboard a pirate ship idling at the edge of a dead beacon's range. The chronicle does not say how you came to be there, what pulled you into the Cinder Expan…”

**TABLE CARD**

> End a Session No focus set — no momentum bonus.

**NARRATOR — npc_end vignette**

> The one who raids the lanes of the Cinder Expanse sits in a cramped galley, peeling a tangerine in a single unbroken strip. The ship hums around them, idling at the edge of a dead beacon's range. They set the peel on the folded corner of a plotted chart, pressed flat with a thumb, then count out the segments, eight, and eat them slowly. A cargo manifest from last week waits at the elbow, the same line read three times and still not sorted. They wipe sticky fingers on a trouser leg, glance once at the dark viewport, and switch off the lamp.

**Observer**

- fact **compass** now also stored in: campaign state → campaignRecapCache; campaign state → sessionRetractions; campaign state → sessionSummary; journal "World Journal — Lore" → page "Ilse: Mira Kestrel's sister; her brass star-compass is carried by Mira everywhere and still point..."; journal "World Journal — Lore" → page "Ilse: Mira Kestrel's sister; her brass star-compass is carried by Mira everywhere and still point..." (flags); journal "World Journal — Session Log" → page "Session 1 — 2026-11-22"; journal "World Journal — Session Log" → page "Session 1 — 2026-11-22" (flags)
- fact **compass** no longer in: campaign state → sceneFrame; campaign state → sceneState; campaign state → sceneTruths
- fact **sister-name** now also stored in: campaign state → campaignRecapCache; campaign state → sessionRetractions; campaign state → sessionSummary; journal "World Journal — Lore" → page "Ilse: Mira Kestrel's sister; her brass star-compass is carried by Mira everywhere and still point..." (flags); journal "World Journal — Session Log" → page "Session 1 — 2026-11-22"; journal "World Journal — Session Log" → page "Session 1 — 2026-11-22" (flags)
- fact **sister-name** no longer in: campaign state → sceneFrame; campaign state → sceneTruths


**📝 Note.** **Right:** the scene's facts were migrated, not lost — out of the scene ledger, into a Lore page, the summary and the log. ("sessionRetractions" in the store list is bookkeeping for the X-Card, not a retraction.)

**📝 Note.** **Wrong — the recap.** Its instructions carried, under "binding" scene facts: *Where: A pirate ship idling at the edge of a dead beacon's range … Now: The architect of the lane raids eats a tangerine alone.* That is the closing vignette's scene, written a moment earlier. The recap did what it was told and placed Mira's campaign there. Order at End a Session: summary, closing vignette, recap.

**📝 Note.** The recap's only source for the story is two Chronicle entries. It says so itself ("the record of your campaign is shorter than you might like") and then fills the page from the frame and the settlement notes.

---

### a9 · after-session-1 — the player types

> !begin-session

*The player's reason:* The first session has ended, so the next step is to begin the second session.

**Observer**

- waiting on the player: window Begin a Session


---

### a10 · session-2 — the player answers a window

Window **Begin a Session** — no fields changed; pressed **Begin**.

*The player's reason:* Start the second session.

**What the table did** (2 model calls, 14 s):

- *Narrator* (narrateSessionVignette) → no new fact recorded
- *Entity notes* → 0 update(s)

**TABLE CARD**

> Begin a Session Flagged content reviewed; scene set. No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.

**NARRATOR — galley_begin vignette**

> The galley smells of burnt sugar and old coffee. You sit with a mug in one hand and the brass compass open on the table beside it, its needle pointing at nothing you can name. The ship is docked at Bleakhold's collar, the hum of the idling reactor comes up through the bench, and the skillet on the stove has been cooling for ten minutes with no one claiming it. The cook is somewhere forward, you tell the empty room, defending a pot of something against a crewmate who has already lost an argument with it. Dree is in the laundry, probably teaching her socks to be less afraid of heat, and Okonkwo is wedged in the aft crawlspace with the coolant pump, speaking to it in the low voice people use on animals that bite. You drink your coffee and let the quiet hold. Then the collar seal knocks twice, polite and in no hurry, and you realize nobody else aboard is close enough to hear it.

**Observer**

- fact **compass** now also stored in: campaign state → previousSessionSummary; campaign state → sceneFrame; journal "World Journal — Secrets" → page "Narrator — world snapshot"; journal "World Journal — Secrets" → page "Narrator — world snapshot" (flags)
- fact **sister-name** now also stored in: campaign state → previousSessionSummary; journal "World Journal — Secrets" → page "Narrator — world snapshot"; journal "World Journal — Secrets" → page "Narrator — world snapshot" (flags)


**📝 Note.** **Right:** the compass is on the table, unprompted, and the ship is "docked at Bleakhold's collar" — the session summary carried both across.

**📝 Note.** **Wrong:** the scene is the first session's again. The recap with the pirate ship and the intruder was in this prompt; this time the narrator did not use it.

---

### a11 · session-2 — the player types

> Before I answer the knock, I touch my pocket. What do I still carry that belonged to my sister?

*The player's reason:* Step 7: ask about the sister's keepsake without naming it.

**What the table did** (4 model calls, 16 s):

- *Pacing read* → **NARRATIVE** · downtime · confidence 0.8 — “Checking her own pocket for a keepsake is an internal, low-stakes reflective action with no risk or outcome in doubt, at a dial of 1 in a quiet moment.”
- *Narrator* (narratePacedInput) → recorded as fact: “Mira Kestrel: carries only Ilse's brass compass of her sister's belongings”
- *Detector* → entities: no one new
- *Chronicle scribe* → moment / **scene** — “Holding Ilse's compass, the only thing of hers left, you hear the patient double knock again from whoever waits outside the sealed collar.”

**NARRATOR**

> Your hand finds the pocket, and the answer is already on the table: Ilse's compass, brass warm from your palm, needle still hunting. Nothing else of hers rides with you. The knock comes again, two taps, exactly as patient as before. Whoever stands outside the collar has not tried the seal and has not called out. They are simply waiting to be let in.

**Observer**

- fact **compass** now also stored in: campaign state → sceneTruths
- fact **sister-name** now also stored in: campaign state → sceneTruths
- **the question, scored — compass:** stored yes · in the prompt yes (WORLD SNAPSHOT, ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE, RECENT SCENE) · in the answer yes
- **the question, scored — sister-name:** stored yes · in the prompt yes (WORLD SNAPSHOT) · in the answer yes


**📝 Note.** **Right:** a direct answer to a direct question, with the name. The narrator also reconciled the pocket with the table ("the answer is already on the table") — the reviewer's low continuity flag is fair but small.

**📝 Note.** The narrator recorded a new fact from its own answer: Mira "carries only Ilse's brass compass of her sister's belongings". The word *only* is the narrator's, and is now binding.

---

### a12 · ? — the player stops

*The player's reason:* Done: in the second session the narrator (m12) said I still carry Ilse's compass, so every step is finished.


**📝 Note.** The player decided it was finished from what it read on screen. Its saying so counts for nothing: the observer scored the answer on its own.

---

## At the end

**Milestones:** ✓ sessionBegun · ✓ factEstablished · ✓ narratedAfter · ✓ sceneChanged · ✓ sessionEnded · ✓ sessionBegunAgain · ✓ askedLater

**Health:** nothing failed · 0 console error(s) on the pages

**The reviewer** (a model's opinion; every flag quotes the transcript):

> The narrator answered each player line directly and kept the docking at Bleakhold and the knock consistent into the next session. The main defect is that the second session's opening repeats the first session's galley scene almost line for line. There is also a small slip over whether the compass is on the table or in Mira's pocket.

- **repetition** (medium) — “Dree is in the laundry, probably teaching her socks to be less afraid of heat, and Okonkwo is wedged in the aft crawlspace with the coolant pump, speaking to it in the low voice people use on animals that bite.” — The second session's opening reuses the first session's opening almost beat for beat: a galley smelling of burnt sugar, Mira talking to an empty room, Dree in the laundry with her socks, Okonkwo in the aft crawlspace with the coolant pump.
- **continuity** (low) — “Your hand finds the pocket, and the answer is already on the table: Ilse's compass, brass warm from your palm, needle still hunting.” — The opening of the same session put the compass open on the table, not in Mira's pocket, so 'brass warm from your palm' doesn't match where it was. In the first session she had pocketed it.

## Notes on the whole run

**What I would do with this.** Read finding 1 first: the mechanism is in the module (a cutaway's scene frame becoming the campaign's active scene for the next call), and it is visible in the run's prompts, not only in the prose. Findings 2 and 6 are about what the helpers write and how often they ask; 3, 4 and 5 are the narrator's habits and want more than one sample.

**What this run cannot tell you.** It is one sample, of a short and friendly session: five lines of play, one roll, no fight, no miss, no correction. Nothing here was under load.

