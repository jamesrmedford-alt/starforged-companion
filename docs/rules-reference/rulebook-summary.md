# Ironsworn: Starforged — Rulebook Summary

A section-by-section paraphrased summary of the Starforged rulebook
intended as design context for Claude Code. The summary covers the
conceptual model, mechanical structure, design principles, and how the
game's systems interrelate. It deliberately omits oracle tables and NPC
stat blocks (the foundry-ironsworn system already exposes those as data),
and omits the rulebook's prose, art, and verbatim move/asset text.

**Source:** Ironsworn: Starforged Rulebook (Shawn Tomkin, 2022), digital
edition. Text licensed CC BY-NC-SA 4.0.

**What this is for:** When Claude Code is reasoning about narrator
behaviour, classifier prompts, move interpretation, scene design, or how
a feature should integrate with the game's intent, this document is the
shorthand reference. For verbatim rules text, asset cards, oracle tables,
or NPC stats, consult the actual rulebook or the foundry-ironsworn
system data.

---

## Chapter 1 — The Basics

### Modes of play
Starforged supports three modes: **Guided** (one player runs the world
for the others), **Co-op** (no guide; the game system fills the role),
and **Solo** (one player, one character, the system fills the rest). All
three are first-class; the rulebook is written primarily from the solo
perspective but the rules are identical across modes. Intended group
size is one to three players. This module is built for solo play with
the GM as a full player, which is one of the supported configurations.

### Fiction and mechanics
The single most important design idea in Starforged is that the fiction
leads, the mechanics resolve, and the fiction follows the resolution.
The player envisions what is happening and what their character is
trying to do; if that triggers a move, the move runs; the outcome is
then translated back into the fiction. Mechanics without fiction are
dice-rolling; fiction without mechanics has no consequences or surprise.
The pattern is: envision → resolve → apply.

The word "envision" appears throughout the rulebook as an explicit
prompt to slow down and visualize the scene before mechanics take over.
This is a deliberate pacing instruction.

### The character
Five stats, valued 1–3 at character creation:

- **Edge** — speed, agility, ranged combat
- **Heart** — courage, willpower, empathy, social capability
- **Iron** — strength, endurance, close combat
- **Shadow** — stealth, deception, cunning
- **Wits** — knowledge, observation, analysis

Characters also have **assets** (poker-card-shaped abilities; see below),
**condition meters** (health, spirit, supply — all 0 to 5), a **momentum
meter** (–6 to +10), **legacy tracks** (quests, bonds, discoveries),
**impacts** (status conditions), and a **vehicle** (typically a starship).

### Iron vows
The core narrative engine. A character holds a piece of iron and
declares a quest in formal terms. The vow has both fictional weight (an
oath one cannot abandon without dishonour) and mechanical structure (a
progress track sized to the difficulty). Vows drive sessions. Without
vows the game has no purpose, mechanically or narratively.

### Making moves
A **move** is a self-contained system that resolves an uncertain or
risky situation. Moves have a **trigger** (when in the fiction the move
applies), an **action roll** (the dice mechanic), and **outcomes**
(strong hit / weak hit / miss with prose describing each).

A move is invoked when the fiction triggers it — not because the player
chose it. Conversely, **not every action is a move**. If the outcome is
not in doubt, or the action is too small to matter, the narrator simply
describes what happens. This is the rulebook's stated design intent and
is the foundation for the module's Pacing feature.

Group moves (multiple characters acting together) are resolved with one
character making the roll; the rest contribute through fiction or assets.

### The action roll
Roll one **action die** (d6) + stat + adds (asset bonuses, conditions),
capped at 10. Roll two **challenge dice** (d10s). Compare the action
score to each challenge die independently:

- Beat both → **strong hit** (success, you control the outcome)
- Beat one → **weak hit** (success at a cost, or partial success)
- Beat neither → **miss** (failure or success at great cost)

Ties go to the challenge dice. The action score caps at 10, so a 10 on a
challenge die is never beaten.

After resolution, envision what happens. Strong hit: the player drives.
Weak hit: the player reacts to a complication. Miss: the player has lost
control of the situation.

### Paying the price
On a miss, most moves prompt **Pay the Price** — pick a likely negative
consequence, roll on an oracle, or let the GM/narrator choose. Important
pacing guidance from the rulebook: don't drop the hammer after one bad
roll. Start with minor consequences and escalate. Pay the Price is a
storytelling tool, not a punishment.

### Rolling matches
If both challenge dice show the same value, that's a **match**. Matches
are a prompt to introduce a twist — something interesting on a hit,
something dire on a miss. Matched 10s on a miss are the worst possible
outcome. Matches are not mandatory drama; they are an opportunity. If
nothing comes to mind, the player can Ask the Oracle or move on.

### Momentum
Momentum (–6 to +10) represents the character's narrative inertia.
Positive momentum can be **burned** (replace action score with momentum,
then reset to +2) to retroactively improve a roll. Negative momentum
cancels the action die when the die value matches the negative
momentum. Most moves give or take momentum on hits or misses. Max
momentum starts at +10 and drops by 1 per impact marked. Reset value
drops with impacts too: +2 default, +1 with one impact, 0 with two or
more.

Momentum persists between sessions. This is part of why a session is a
beat in an ongoing story, not a discrete encounter.

### Progress tracks
Most challenges with scope (a quest, an expedition, a relationship, a
fight) are tracked as a 10-box progress track with a **challenge rank**:
troublesome / dangerous / formidable / extreme / epic. Each rank
determines how much progress is marked per beat:

- Troublesome — 3 boxes per mark
- Dangerous — 2 boxes
- Formidable — 1 box
- Extreme — 2 ticks (a tick is a quarter-box)
- Epic — 1 tick

To resolve a progress-tracked challenge, the player makes a **progress
move** (e.g., Fulfill Your Vow). Progress rolls use the tally of filled
boxes as the score, not stat + action die. Momentum doesn't apply to
progress rolls.

### Legacy tracks
Three special progress tracks — **quests**, **bonds**, **discoveries** —
track campaign-scale advancement. Filling boxes earns experience (2 per
box). Experience is spent to acquire or upgrade assets. A cleared
(fully filled, then reset) legacy track marks a character near the
height of their potential and earns experience at a slower rate.

### Condition meters
Three meters, each 0–5:

- **Health** — physical condition
- **Spirit** — morale and mental state
- **Supply** — shared resource for the group representing readiness,
  consumables, ammo, fuel

Reduced by suffer moves, restored by recover moves.

### Impacts
Status conditions in four categories:

- **Misfortunes** — wounded, shaken, unprepared
- **Lasting Effects** — permanently harmed, traumatized
- **Burdens** — doomed, tormented, indebted
- **Current Vehicle** — battered, cursed

Impacts reduce max momentum (–1 each) and momentum reset, and persist
until cleared via specific moves. Some are permanent.

### Assets
Cards representing character abilities. Five types:

- **Paths** — background, training, signature equipment
- **Companions** — NPC helpers with their own health meters
- **Modules** — starship add-ons (require a STARSHIP asset)
- **Support Vehicles** — secondary craft like shuttles or speeders
- **Deeds** — earned through specific achievements; reflect what the
  character has done rather than what they are

Each asset card has up to three abilities; some are unlocked at
acquisition, others require spending experience to upgrade. Companion
and Module assets also have meters (health or integrity).

The asset deck is the closest thing the game has to a "class" system,
but it's modular — a character is the sum of their chosen assets, not a
fixed archetype.

### Oracles
The randomization-and-inspiration engine. Three uses:

1. **Embedded in moves** — many moves reference specific oracle tables
   for their outcomes
2. **Ask the Oracle** — a yes/no question with adjustable odds, or a
   prompt-style table roll
3. **A universe of oracles** — the rulebook contains tables for almost
   everything: sector names, planet types, NPC traits, derelict zones,
   precursor vault interiors, etc.

The rulebook is explicit that oracles serve the fiction, not the other
way around. **Trust your instincts.** If the player has a good idea,
they should use it. The oracle is for filling gaps, breaking ties, and
introducing surprise — not for replacing the player's storytelling
judgement.

### Equipment, vehicles, navigation
The rulebook treats most equipment as fictional rather than mechanical
— a character has what their fiction says they have. Vehicles are
divided into the **command vehicle** (usually a STARSHIP), **support
vehicles** (assets), and **incidental vehicles** (narrative props).
Travel between locations uses moves like Set a Course and Undertake an
Expedition. There is no hex grid or coordinate system; the galaxy is
described in **regions** (Terminus / Outlands / Expanse / Void), and
movement between **waypoints** is narrative.

---

## Chapter 2 — Launching Your Campaign

### Preparation philosophy
Prep is play. Setting up the campaign — choosing truths, creating
characters, building the starting sector — is itself a guided exercise
that produces the first session's fiction. The rulebook strongly
emphasizes safety tools, particularly for solo players: a default
assumption that the game can prompt difficult themes via oracle rolls,
and that the player has full authority to redirect.

### Truths — the 14 axioms
Before play, the player(s) define the version of the galaxy they're
playing in via 14 categories. Each category offers three default
options plus a "quickstart" option and space to write a custom one.
Once chosen, these are immutable campaign axioms — the constitutional
layer the narrator must never contradict.

The 14 categories:

| Category | What it defines |
|---|---|
| Cataclysm | Why your people left their home galaxy |
| Exodus | How they reached the Forge |
| Communities | What settlements look like |
| Iron | Why iron is sacred and how it's used in vows |
| Laws | How authority and justice work |
| Religion | What people believe |
| Magic | Whether supernatural ability exists, and what shape it takes |
| Communication and Data | How information moves between worlds |
| Medicine | What healing is possible |
| Artificial Intelligence | Whether AI exists and what it is |
| War | What the major conflicts are |
| Lifeforms | What's alive out there |
| Precursors | What came before, and what they left behind |
| Horrors | What lurks in the dark |

These are the World Truths the user generated via oracle rolls and
which the module surfaces as the foundation of every narrator context
packet.

### Character creation (11 steps)
The rulebook walks players through: ready the asset deck, choose two
paths, sketch a backstory, write a background vow, board a starship,
choose a final asset, set stats, set condition meters, envision the
character, name them, gear up. The whole process is narrative as much
as mechanical — each step generates fiction the character carries into
play.

### Starting sector (11 steps)
The campaign-launch exercise builds a small slice of the galaxy: pick
a region, determine the number of settlements, generate settlement and
planet details, draw a sector map, create passages between locations,
zoom in on the starting settlement, generate a local connection
(important NPC), introduce a sector-wide trouble, and finalize. The
module's Sector Creator implements this as a wizard.

### Begin your adventure
Step 1 is to envision an **inciting incident** — the dramatic event
that opens the campaign and sets up the first vow. Step 2 sets the
scene. Step 3 is to make a move — the campaign begins with the first
roll. Step 4 covers next steps as the story unfolds.

---

## Chapter 3 — Gameplay in Depth

### The Three Pillars of Play
The campaign rests on three undertakings:

- **Quests** — swear vows, fulfill them, accept the cost
- **Bonds** — create connections, build relationships, test and forge
  them
- **Discoveries** — explore the Forge, unlock its mysteries

These map directly to the three legacy tracks. The rulebook is
explicit: if a story feels aimless, return to the pillars. Most
adventures braid all three together.

### Session Moves
Framework for the meta-conversation around play:

- **Begin a Session** — set the stage; roll to gain or lose momentum
  depending on whether the situation favours the character
- **Set a Flag** — mark a moment of significance or transition
- **Change Your Fate** — explicit permission to alter, redo, or ignore
  any outcome that is unsafe or unfun; the rulebook's primary safety
  mechanism
- **Take a Break** — pause the session
- **End a Session** — wrap, often with a small reward; resolve any
  pending state

### Adventure Moves
The general-purpose move set:

- **Face Danger** — the catch-all reactive move when something risky
  needs resolving and no more specific move applies. Choice of stat
  reflects the approach.
- **Secure an Advantage** — the proactive version of Face Danger; build
  position before a challenge
- **Gather Information** — investigate, research, interrogate. Strong
  hit reveals something useful and clear; weak hit reveals something
  useful but complicating; miss reveals an unwelcome truth
- **Compel** — persuade, threaten, swindle, charm. The social move
- **Aid Your Ally** — directly support another character's action
- **Check Your Gear** — see if you happen to have the right thing on
  hand right now

### Quest Moves
The narrative spine:

- **Swear an Iron Vow** — formally commit to a quest. Sets a progress
  track at a chosen rank
- **Reach a Milestone** — mark progress on a vow when a meaningful
  step is taken in the fiction
- **Fulfill Your Vow** — the progress move that resolves whether the
  quest succeeds. Strong hit: clean victory. Weak hit: success with
  bittersweet cost. Miss: vow forsaken or a much harder path forward
- **Forsake Your Vow** — voluntarily abandon a quest. Always carries
  consequence

### Connection Moves
Relationship development:

- **Make a Connection** — meet someone who could become significant
- **Develop Your Relationship** — mark progress on a connection track
  through fictional development
- **Test Your Relationship** — when stress hits a relationship, roll to
  see if the bond survives or shifts
- **Forge a Bond** — the progress move; when filled, the connection
  becomes a formal **Bond** asset

### Exploration Moves
Travel and discovery:

- **Undertake an Expedition** — multi-stage journey with its own
  progress track and challenge rank
- **Explore a Waypoint** — investigate a specific location during an
  expedition
- **Make a Discovery** — formally acknowledge something significant
  found
- **Confront Chaos** — when an expedition introduces danger
- **Finish an Expedition** — progress move resolving the journey's
  outcome
- **Set a Course** — choose where to go and pay travel costs

### Combat Moves
Combat has its own move set because the fiction-mechanics balance
shifts: combat is structured around **position** (in control / in a bad
spot), **range** (close / near / far), **objectives** (defeat / escape
/ protect / etc.), and **scale** (a brawl vs. a battle vs. mass combat):

- **Enter the Fray** — open the fight; first move in a fight, sets position
- **Gain Ground** — reposition, advance, or set up
- **React Under Fire** — combat-specific version of Face Danger
- **Strike** — initiate violence from a position of control
- **Clash** — exchange blows when neither side has clear control
- **Take Decisive Action** — the progress move that ends the fight
- **Face Defeat** — handle losing the fight
- **Battle** — when fights aren't worth resolving move-by-move, run
  the whole thing as a single action roll

The position/range/objectives model means combat in Starforged is
narrative, not tactical. There is no grid. Range is fictional — "near"
means whatever the fiction says it means.

### Suffer Moves
Resolving harm:

- **Lose Momentum** — usually –1, –2, or –3 depending on severity
- **Endure Harm** — health damage. May mark **wounded**, **maimed**, or
  worse
- **Endure Stress** — spirit damage. May mark **shaken**, **traumatized**
- **Companion Takes a Hit** — companion's own health
- **Sacrifice Resources** — supply loss
- **Withstand Damage** — vehicle integrity

### Recover Moves
Restoration:

- **Sojourn** — extended rest at a safe haven. The general restoration
  move
- **Heal** — physical recovery
- **Hearten** — spirit recovery
- **Resupply** — restore supply
- **Repair** — vehicle restoration

### Threshold Moves
The most dramatic moments:

- **Face Death** — when health hits 0 and you're at risk of dying. Roll
  to see if you survive, often at significant cost
- **Face Desolation** — when spirit hits 0 and you're at risk of total
  collapse
- **Overcome Destruction** — when a vehicle integrity hits 0

These moves carry the highest stakes in the game and often produce
permanent changes (lasting effects, burdens).

### Legacy Moves
Character advancement:

- **Earn Experience** — when a legacy box is filled
- **Advance** — spend experience on assets
- **Continue a Legacy** — when a character retires or dies, pass on
  achievements to a new character

### Fate Moves
The meta-tools:

- **Ask the Oracle** — yes/no questions with adjustable odds, or table
  prompts. The narrator's primary tool for filling gaps
- **Pay the Price** — choose or roll for the consequence of a miss

### Clocks
Three clock types:

- **Campaign clocks** — long-term threats or developments that tick
  toward a deadline as story events advance
- **Tension clocks** — short-term pressure; tick when failures or
  inaction accumulate
- **Scene challenges** — combine a clock with a progress track to
  resolve non-combat conflicts (a chase, a heist, a debate). The scene
  ends when either the progress track is filled or the tension clock
  is filled

Scene challenges generalize: the same structure also handles mass
combat at a higher level of abstraction than the combat moves.

### Conflict between allies
The rulebook is explicit that mechanics are not designed to provoke PvP.
When characters disagree, the default is to roleplay it out. If
mechanical resolution is needed, both characters Face Danger; the higher
level of success picks the outcome. Used sparingly, taking care not to
take control of another player's character.

### Principles of Play

**Universal:**
- Swear iron vows, and see them fulfilled or forsaken
- Portray a perilous but hopeful future. The setting is dangerous, but
  not nihilistic. There is hope, beauty, and wonder
- Begin and end with the fiction. Envision before mechanics; apply
  outcomes back to the fiction

**Solo:**
- Chronicle your adventures. Keep some record — bullet points, journal,
  play report. Solo stories can feel ephemeral; written record grounds
  them
- Ask the oracle, but trust your instincts. Don't over-randomize
- Be a fan of your character. Solo players tend to be harsh on
  themselves; the rulebook explicitly counsels giving the character
  space to be heroic and saving the dire consequences for key dramatic
  moments

**Cooperative:**
- Craft a story through conversation. Roleplay is dialogue, not
  monologue
- Build a universe together. No guide; everyone fills the role
  partially
- Share the spotlight. Don't let one character's vow dominate

**Guide:**
- Facilitate, don't impose. The guide moderates without dominating
- Deliver answers and ask questions. The guide is informant and
  prompter both
- Embrace chaos. Don't over-prepare. Use oracles. Surprise yourself

The guide principles are especially relevant for a module that
implements an AI narrator — they describe exactly the role the narrator
plays in solo + GM-as-player configuration.

---

## Chapter 4 — Foes and Encounters

This chapter is largely reference data — sample NPCs with stat blocks,
behaviour notes, and adventure hooks. The conceptual content worth
extracting:

### NPC components
NPCs aren't player characters and don't roll dice. Their mechanical
footprint is minimal:

- A **rank** (troublesome / dangerous / formidable / extreme / epic)
  defining the difficulty when the player opposes them
- A short description, drives, and behaviours framed as fiction prompts
- Sometimes a list of features or special abilities

When the player acts against an NPC, the player rolls; the NPC's rank
sets the challenge tier. The narrator describes NPC actions and
reactions as fiction, not as opposed mechanics.

### Joining forces with NPCs
NPCs can fight alongside the player without becoming Companion assets.
They are narrative allies — the player handles fictional coordination,
but they don't get their own action rolls or mechanical state beyond
the rank-and-features sketch.

### Sample NPCs
The rulebook contains roughly two dozen sample creatures, hostiles, and
people across ranks — chitons, colossi, drift pirates, ember wisps,
firestorm troopers, ghosts, scrap bandits, technoplasms, void
shepherds, worldbreakers, and others. These are reference templates,
not exhaustive. The foundry-ironsworn system exposes these as data;
this document does not duplicate them.

---

## Chapter 5 — Oracles

This chapter is overwhelmingly tables and is best consulted directly
when needed. The conceptual content:

### Using oracles
Three modes:

- **In solo and co-op play** — the oracle is the absent guide. The
  player rolls, interprets, and continues
- **In guided play** — the guide uses oracles for inspiration but is
  not bound by them
- **Anywhere** — Ask the Oracle resolves yes/no questions with
  adjustable odds (small chance / unlikely / 50/50 / likely / almost
  certain)

The rulebook stresses interpretation. Oracle answers are prompts, not
verdicts. The narrator's job is to read the dice and make them
meaningful in the current fiction.

### Oracle categories

- **Core oracles** — action, theme, descriptor, focus. Two-word prompts
  that combine into evocative phrases (e.g., "Deceive — Power")
- **Space encounters** — sightings, perils, opportunities, sector names
- **Planets** — eleven planet types (desert / furnace / grave / ice /
  jovian / jungle / ocean / rocky / shattered / tainted / vital), each
  with subtables for atmosphere, settlements, observations, lifeforms,
  perils, and opportunities
- **Settlements** — names, populations, projects, troubles
- **Starships** — names, configurations, situations
- **Characters** — names by region/culture, dispositions, roles, goals
- **Creatures** — basic form, scale, environment, first look,
  encountered behaviour, revealed aspect, ultimate form
- **Factions** — types, leadership, dominion, projects, rumours
- **Derelicts** — exterior, condition, outer first look, interior first
  look, zone tables for access / community / engineering / living /
  medical / operations / production / research
- **Precursor vaults** — exterior, scale, form, shape, material, outer
  first look, interior first look, sanctum, interior feature, sanctum
  feature
- **Location themes** — for layering atmosphere onto any location:
  chaotic / fortified / haunted / infested / inhabited / mechanical /
  ruined / sacred. Each provides peril, opportunity, feature tables
- **Miscellaneous** — story complications, story clues, anomaly
  effects, combat actions

### More oracle options
- **Oracle arrays** — rolling multiple tables and combining results to
  generate a complete entity (e.g., a derelict's full character)
- **Campaign elements** — using oracles to fill the gaps in the
  setting as the campaign develops
- **Filling in the blanks** — the meta-principle that the world is
  generated lazily, on demand, as the fiction needs it

---

## Cross-cutting design themes

### "Lead with fiction, follow with fiction"
The most important pattern in the whole system. Every mechanical
interaction is bookended by fiction. The narrator should never produce
a mechanical outcome that isn't immediately translated back to the
fiction.

### Progress over hit points
Almost every meaningful conflict is resolved through a progress track,
not through chip damage. Health/spirit/supply are short-term wear
meters; the actual question of whether the player succeeds is decided
when they trigger the progress move. This means dramatic moments are
front-loaded onto specific narrative beats, not spread across many
small actions.

### Asking, not telling
The narrator's role — both in human-guided and AI-narrator
configurations — is to ask questions as much as answer them. "What does
this look like? Why are you here? How do you respond?" The fiction is
co-created.

### Trust the player, trust the dice, but never let either tyrannize
Both the dice and the player's instincts are tools. Neither overrides
the other. If the dice produce something nonsensical, the player
reinterprets. If the player wants to skip something, the dice fill in.
The rulebook is unusually explicit that "Change Your Fate" exists
specifically to allow this rebalancing.

### Vows give the game purpose
Without vows, there is nothing to play toward. The vow is the smallest
unit of campaign-scale meaning. Every other system in the game
ultimately serves vow completion.

### The 14 truths are constitutional
World Truths are not setting flavour — they are constraints the
narrator must respect. Once chosen, they bind. This is the design
basis for the module treating World Truths as the foundational layer of
every narrator context packet.

---

## Implications for module design

A few observations that follow directly from the rulebook's structure:

1. **The narrator must distinguish between move-triggering input and
   pure-narration input.** This is what the Pacing feature implements.
   The rulebook is explicit that not every action is a move.

2. **Outcomes always cycle back to fiction.** A move card that produces
   "weak hit, +1 momentum" without narrative context is failing the
   game's design principle. The narrator must close every mechanical
   outcome with fictional consequence.

3. **The character sheet is partial.** Most of who a character is lives
   in fiction, not in mechanical state. The narrator's memory must
   include fictional facts (the truths ledger discussed in
   fact-continuity-scope-instructions.md) as a first-class concern.

4. **Oracle output is prompt, not verdict.** When the module uses
   oracles internally (e.g., to generate a sector), the results should
   inform narrator phrasing but not bind it. The narrator should
   interpret with latitude.

5. **The three pillars give the narrator a check.** When a story feels
   aimless, the narrator can prompt the player toward a vow, a
   connection, or an expedition. This is a useful guardrail for the
   narrator's behaviour in long sessions.

6. **The principles for the guide describe the AI narrator's role
   exactly.** Facilitate, don't impose. Deliver answers and ask
   questions. Embrace chaos. These are the narrator's behavioural
   axioms and should appear in its system prompt.

7. **Safety is built into the rules, not bolted on.** Change Your Fate,
   Take a Break, and the explicit safety guidance in Chapter 2 are
   first-class moves. The module's safety configuration is aligned
   with the rulebook's intent, not in tension with it.
