# Ironsworn: Sundered Isles — Guidebook Summary

A section-by-section paraphrased summary of the Sundered Isles guidebook,
intended as design context for Claude Code. The summary covers the
setting, the subsystems that differ from or extend Starforged, the
design intent, and how the pieces interrelate. It deliberately omits the
oracle tables (Section 3) and the detailed move reference (Section 4),
since those are data the foundry-ironsworn system exposes, and omits the
book's prose, art, and verbatim asset/move text.

**Source:** Ironsworn: Sundered Isles Guidebook (Shawn Tomkin, 2024),
digital edition. Text licensed CC BY-NC-SA 4.0.

**Critical framing:** Sundered Isles is **not a standalone game**. It is
an expansion for Starforged. It assumes the Starforged rulebook and reuses
the entire Starforged engine — the action roll, momentum, progress tracks,
condition meters, assets, oracles, and the move framework are all
identical. Sundered Isles changes the *setting* (fantasy age-of-sail
instead of space opera), adds *new subsystems* (ships, crews, naval
combat, optional wealth), introduces *new assets and oracles*, and makes
*minor wording changes* to some Starforged moves to fit the nautical
theme. When this summary describes a mechanic without saying it's new,
assume it's inherited from Starforged unchanged.

**What this is for:** When Claude Code reasons about supporting Sundered
Isles play, or about narrator behaviour in a seafaring campaign, or about
how the module's subsystems would need to extend to handle ships and
crews, this is the reference. For verbatim rules, asset cards, oracle
tables, or move text, consult the actual guidebook or the
foundry-ironsworn system data.

---

## The setting at a glance

The Sundered Isles is a vast equatorial realm of thousands of scattered
islands, set in an age of sail. It sits a long voyage away from a
continental domain on the far side of the world. The default tone is
fantasy seafaring: wooden ships, cannons, mariners and marauders, rebels
and empires, myth and magic. As with Starforged, the specific nature of
the world is decided by the players during campaign setup — it can mirror
a real-world age of sail, or lean into wondrous machines, powerful magic,
titanic beasts, and curses.

Notably, the setting is flexible enough to support three "realms" chosen
at setup: the default **Seafaring Realm** (ocean and islands), an
**Overland Realm** variant, and even a **Starfaring Realm** that maps the
Sundered Isles structure back onto a Starforged-style space campaign with
re-themed assets. The same rules serve all three.

### Two moons, the tides, and the Twin Fates
Two moons — **Cinder** (red) and **Wraith** (silver-blue) — orbit the
world and create dramatic, erratic tides that vary by hour, day, and
season. Tides are the rhythm of the isles and a constant navigational
hazard. Islanders read omens in which moon rises first or shines
brightest, but rarely agree on meanings.

An optional flavour rule treats the two challenge dice as the **Twin
Fates**: one die is Cinder (hot — aggressive, passionate, physical), the
other Wraith (cool — careful, mysterious, cunning). The higher die can
add nuance to a result or act as a standalone oracle. This is purely
optional colour layered onto the standard dice mechanic.

### Three regions
The isles divide into three broad regions, which function like Starforged's
region tiers (escalating danger and isolation):

- **The Myriads** — fair weather, charted passages, bustling ports;
  pirates and privateers hunt easy prey. The "safe" region.
- **The Margins** — greater distances, fickle weather; skill and luck
  matter. The middle region.
- **The Reaches** — unpredictable seas, isolated isles, profound
  mysteries and dangers. The frontier, craved by those seeking freedom.

Each region is separated from the next by open water; crossing between
them ("crossing the bounds") is itself a significant undertaking.

---

## Section 1 — Adventures Among the Isles

This section is setting reference plus the new gameplay subsystems. It's
the meat of what distinguishes Sundered Isles mechanically.

### Your character
Character creation is the Starforged process. The difference is the asset
pool: Sundered Isles ships with dozens of new assets themed for fantasy
seafaring, and the player builds a curated deck combining new Sundered
Isles assets with a selection of core Starforged assets.

New asset categories include:

- **Command vehicle: SAILING SHIP** — every seafaring character has a ship
- **Modules** for ships — ARMORED PROW, LUCKY FIGUREHEAD, IMPROVED HOLD,
  SUBMERSIBLE MODE, HARPOON CANNON, etc.
- **Support vehicles** — LONGBOAT, DIVING BELL, FLYING MACHINE, CAPTAIN'S
  BOAT
- **Paths** for the setting — DUELIST, MUSKETEER, PIRATE CAPTAIN,
  SWASHBUCKLER, NECROMANCER, WINDBINDER, SHIPWRIGHT, and many more
- **Companions** — JUNGLE CAT, PARROT, ALBATROSS, MONKEY, and fantastic
  ones like DRAGON and THE KRAKEN
- **Deeds** (legacy markers) — FLEET COMMANDER, UNDEAD, OATHBREAKER,
  REVENANT, etc.

Some Sundered Isles assets are re-themed renames of Starforged
counterparts (e.g., PEDDLER replaces the Starforged TRADER). The deck is a
recommendation, not a mandate; the rulebook stresses avoiding overlap so
each player has distinct resources, abilities, and roles. Assets are
"stackable" and the "rule of 3" caution from Starforged applies — watch
for combinations that make success a foregone conclusion.

The player picks **two path assets** as the foundation of the character
concept, exactly as in Starforged.

### Your ship
The ship is treated as a first-class aspect of the character. Three tiers:

- **SAILING SHIP** — the starting command vehicle, or an incidental/
  temporary vessel. Relatively fragile (mechanically and narratively); a
  player may lose one and claim another over the campaign. Can be promoted
  to FLAGSHIP.
- **FLAGSHIP** — the upgraded command vehicle, purchased with experience
  via Advance (or gained as a gift, prize, salvage, or promotion of an
  incidental ship). Max integrity 5; can be marked **battered** or
  **cursed** as debilities to avoid a decisive Withstand Damage roll. Has
  up to 5 **hold** (acting as ship-wide supply), can equip modules and
  support vehicles, and grants narrative perks (a distinctive flag that
  gives momentum when hoisted dramatically).
- All command vehicles share the same mechanical attributes regardless of
  whether they're a sloop, frigate, or titan. The *nature* of the ship
  affects challenge ranks and how actions and outcomes are interpreted,
  plus whatever modules are attached.

**Modules** attach to the FLAGSHIP and give conditional bonuses (e.g.,
ARMORED PROW adds bonuses when ramming or sailing through obstacles). A
module can be marked **broken** when the ship takes a miss on Withstand
Damage, to offset danger; a broken module can't be used until Repaired.

**Support vehicles** are secondary craft launched from the main ship, each
with its own integrity meter, marked **battered** and **Repaired** like
any vehicle.

### Command and crews
A commanded ship needs a crew. Critically, **the crew has no mechanical
detail** — they're abstracted into the character's own actions and the
ship's inherent capabilities. The moves a player makes represent both
their individual exploits and the actions of the crew and ship under their
leadership.

Key design points:

- In solo play with a ship, the character is the captain. With allies, one
  is captain (unless the group envisions communal leadership). Non-imperial
  vessels rarely have strict chains of command.
- Players take fitting duties — quartermaster, carpenter, gunner, surgeon,
  cook, navigator, or fantastic roles (soothsayer, dragon-wrangler,
  ghost-hunter) — but are broadly capable and wear several hats.
- Most crew are background extras. Notable crewmembers can be named and
  given a characteristic; one might become a specialist via the COHORT
  asset.
- **Crew mood and condition matter narratively** — full complement vs.
  casualties, well-provisioned vs. discontent, even brewing mutiny. These
  provide context for challenge ranks.

**Crew-related assets** add optional mechanical depth:

- **CREW COMMANDER** introduces a new condition meter, **command**
  (crew strength, loyalty, morale; max starts at 4, upgradable to 6).
  Command can be spent to improve outcomes or offset costs; at 0 it counts
  as an impact. Restored by rewarding the crew (treasure share, respite).
- **PIRATE CAPTAIN**, **COHORT**, **FLEET COMMANDER** — further leadership
  and crew-relationship assets, usable in Sundered Isles or in a
  Starforged campaign with a crewed starship.

### Supply at sea
This is a meaningful extension of Starforged's single supply meter. With a
ship, supply splits into **two meters**:

- **Equipped supply** — the personal supply meter from Starforged;
  provisions and equipment carried on your person
- **Hold supply** — the ship's stores (up to 5 on a FLAGSHIP); provisions
  and gear at the ship-wide level

Each is tracked separately and each can independently trigger the
**unprepared** impact at 0. If both hit 0, the second unprepared is an
extra impact. Resupply clears one instance of unprepared per action.

The Sundered Isles **Resupply** move adds an option to "gear up from your
ship's stores" — drawing hold supply to bolster equipped supply, rolling
+supply (hold) and resolving as a normal move (strong hit: free transfer;
weak hit: transfer but Sacrifice Resources; miss: no transfer and a
complication). If the ship is lost, hold supply is lost with it (no
unprepared marked, but no hold supply until a new ship is gained).

Supply remains abstracted — not counting individual barrels — but the
rulebook encourages thinking in terms of specific resources (fresh water,
shot, grog) to give perils and opportunities texture. The design intent is
explicit: keep pressure on, depict scarcity, don't go easy.

### Wealth and treasure (OPTIONAL subsystem)
By default, Starforged and Sundered Isles don't track money — wealth is
abstracted into supply and legacy progression. Sundered Isles adds an
**optional** wealth system for campaigns that want ships' upkeep and
plunder to drive the story.

Components:

- **Treasury** — a reserve of money, goods, and valuables, distinct from
  supply. Used to maintain crew and ship, make purchases, grant favours,
  pay debts.
- **Ledger** — an itemized inventory of the treasury. Each acquisition
  (trade goods, payment, gold, a captured ship) is assigned a **value 1–5**
  (mundane to wondrous). Items are spent down circle by circle.
- **Spending wealth** doesn't add mechanical bonuses to moves, and usually
  isn't an excuse to skip a move. Instead it unlocks narrative options
  (commissioning repairs "at a facility," hiring a guide to Set a Course
  instead of Undertake an Expedition, bribing an official as part of a
  Compel). It can also help resolve a costly outcome (sweetening a bribe
  after a weak hit).
- **Converting wealth** — illiquid items (a captured frigate) can be
  converted to spendable resources, typically losing one value step. Not
  all resources are spendable everywhere; Ask the Oracle if unsure.
- **Upkeep** — an ongoing cost (1–5 by fleet size) for maintaining ships
  and crew, typically paid during Sojourn. Failing to pay upkeep breeds
  crew discontent and ship disrepair, pushing the player toward jobs,
  treasure hunts, or plundering imperial targets.
- **Cursed riches** — the cursed die can reveal uncanny aspects of
  treasure (foul magic, hauntings). Greed is framed as a corrupting force.

Design guidance: wealth-tracking is for the early "scramble to survive"
phase. Once it becomes a foregone conclusion, the rulebook explicitly says
to drop it. A large hoard or wondrous artifact is meant to *upend* the
campaign — generating questions of secrecy, rival hunters, and how to use
it toward the iron vows.

### Navigating the isles
Sea and overland journeys use Starforged's **exploration moves** (Set a
Course, Undertake an Expedition, etc.). Sundered Isles adds nautical
framing:

- Sea travel is never a straight line — meandering routes around uncharted
  islets, erratic moon-driven tides, hull-breaching reefs, sudden weather,
  and possibly hostile sails on the horizon.
- The decision tree for a voyage:
  - Short distance, safe water → no move
  - Know the way but risk exists → **Set a Course** (single roll)
  - Perilous unknown waters → set a rank and **Undertake an Expedition**
    per segment, then **Finish the Expedition** when the destination is in
    sight
- **Crossing the bounds** between regions is a notable expedition in its
  own right.

### Naval encounters (phased ship combat)
This is the most structurally distinct combat content. Ship-to-ship
combat is organized into **phases**, layered on top of Starforged's
existing combat moves (Enter the Fray, Gain Ground, React Under Fire,
Strike, Clash, Take Decisive Action, Battle):

1. **Approach phase** — the maneuvering before weapons range. Resolved
   with a roll that sets the difficulty of the engagement (success lowers
   the objective rank, failure raises it). Skipped if the fight starts at
   cannon range, if surprise removes it, or if the outcome isn't in doubt.
2. **Engagement phase** — "Fire!" Combat at weapons range, opened with
   **Enter the Fray**. The player sets an **engagement objective** (escape,
   sink the foe, or board the enemy) — which may differ from the overall
   objective of the fight. Each objective gets a challenge rank
   (formidable as baseline; extreme if outmatched; dangerous if superior).
   A **tension clock** (4 segments typical, 6 for complex fights) can
   represent the enemy's opposing goal or an external looming threat (a
   building maelstrom). Combat proceeds with the standard in-control /
   in-a-bad-spot framing, mapping ship actions to Starforged combat moves
   (maneuver the ship → Gain Ground or React Under Fire; damage control →
   Repair or React Under Fire; tend wounded → Heal; etc.).
3. **Boarding phase** (implied by the engagement objective "board") —
   where higher-level objectives like defeating an enemy captain in single
   combat get resolved.

The key design idea: naval combat reuses the entire Starforged combat
engine, adding the phase structure, the engagement-objective concept, and
the ship-action-to-move mapping table as scaffolding. Multiple foes can be
bundled into one objective (raising its rank), and noteworthy obstacles
can become their own objectives, including objectives an ally pursues
independently.

### Interludes
A pacing tool (extending Starforged's session/scene rhythm) for the quiet
moments between action — time aboard ship, in port, or ashore for rest,
relationships, and reflection. The narrative breathing room between
perils.

### Factions of the isles
Setting reference for the powers contesting the isles — imperial powers,
pirate confederations, rebel movements, island communities, and stranger
forces. Factions are introduced during campaign setup as an exercise
informed by the chosen truths, and provide the backdrop of conflict
(espionage, open warfare, the central struggle against imperial tyranny).

### Beasts of the isles
Setting reference for the creatures of the realm — from mundane sea life
to krakens, ghost ships, and supernatural horrors. These function like
Starforged's NPCs: minimal mechanical footprint (a rank plus fiction
prompts), with the player rolling against the creature's rank. The
foundry-ironsworn system exposes specific creature data; this summary
doesn't duplicate it.

---

## Section 2 — Getting Underway

The campaign-launch exercises, mirroring Starforged's structure: choose
truths, introduce factions, build your asset deck, create your character
and ship, and set the campaign in motion. Allow ~30–45 minutes for the
truths exercise.

### Choose your truths — 11 categories
Like Starforged's 14 truths, these are the constitutional axioms of the
campaign world, chosen at setup and binding thereafter. **The categories
differ from Starforged's** — they're seafaring-themed. The 11 categories:

| Category | What it defines |
|---|---|
| Sundering | The cataclysm/history that shattered or shaped the isles |
| Relics | What ancient artifacts and ruins exist, and their nature |
| Modern Era | The current state of technology and society |
| Iron Vows | Why iron is sacred and how vows work in this world |
| Navigation | How sailing, charts, and wayfinding work; the role of tides |
| Empires | The imperial powers and their reach into the isles |
| Piracy | The nature and prevalence of piracy |
| Religion | What people believe |
| Magic | Whether supernatural power is real, and its shape |
| Beasts | What creatures inhabit the seas and islands |
| Horrors | What lurks in the dark; the supernatural-horror layer |

Each is chosen the same three ways as Starforged: pick one of three
defaults, roll for it, or customize/craft your own. Each category also
suggests fitting character assets (person icon) and potential factions
(flag icon) to seed the later exercises. Quest starters are provided per
category to fuel opening vows.

The realm choice (Seafaring / Overland / Starfaring) interacts with the
truths — e.g., a Starfaring Realm re-themes technological assets as
aether-powered tech, or magic as a setting force.

### The remaining launch exercises
Following the truths, the launch sequence covers introducing factions
(informed by the truths), assembling the curated asset deck (using the
asset guide), creating the character and choosing two paths, establishing
the ship and how command was gained (SAILING SHIP by default, or FLAGSHIP
for a more seasoned commander), and setting the campaign in motion with an
inciting mission or imminent danger — then "play to see what happens,"
exactly as in Starforged.

---

## Sections 3 and 4 (summarized briefly)

### Section 3 — Oracles
A large array of oracle tables specific to the Sundered Isles, parallel to
Starforged's oracle chapter. Includes the **cursed die** mechanic (a
special-colour D10 rolled alongside oracle dice; a result on it reveals
cursed, uncanny, or ill-fated aspects). Tables cover isle and region
features, ships and sails, ports and settlements, characters and crews,
factions, beasts, relics and ruins, treasure, weather and tides, and
naval-encounter specifics. These are data; the foundry-ironsworn system
exposes them and this summary doesn't reproduce them.

### Section 4 — Moves Reference
The Sundered Isles moves are the **Starforged moves with minor wording
changes** to fit the nautical setting (e.g., Resupply's "gear up from your
ship's stores" option, Withstand Damage applied to ships, exploration
moves framed for sea travel). The mechanical skeleton is unchanged; the
fiction-facing language is re-themed. Includes the recommended **session
moves / safety tools** (page 237) carried over from Starforged.

---

## Implications for module design

Observations relevant to whether and how the module would extend to
Sundered Isles:

1. **Sundered Isles is an engine re-skin plus subsystems, not a new
   ruleset.** Any module built on the Starforged move/oracle engine
   already handles the core of Sundered Isles play. Supporting it is
   primarily a matter of (a) adding the new assets and oracles as data,
   (b) handling the wording-changed moves, and (c) optionally modeling the
   new subsystems (ships, two-meter supply, command, treasury, naval
   phases).

2. **The truths are a different set.** If the module injects World Truths
   into the narrator context (as it does for Starforged's 14), a Sundered
   Isles campaign needs the 11 seafaring categories instead. The narrator's
   constitutional-axiom layer is setting-specific. A module supporting both
   settings needs to know which truth schema is active.

3. **Two-meter supply breaks an assumption.** Any module logic that treats
   "supply" as a single value would need to branch for Sundered Isles'
   equipped-vs-hold split, including the dual-unprepared rule and the
   ship-loss case.

4. **Ships and crews are mostly fiction, lightly mechanical.** The crew has
   no mechanical detail; the ship is a vehicle asset with integrity. The
   narrator's fact-continuity concerns (see fact-continuity scope) extend
   naturally — a ship is a persistent entity with truths (its name, its
   nature, its flag) and state (current integrity, broken modules, crew
   mood). The COHORT/CREW COMMANDER command meter is the main new
   mechanical surface.

5. **Naval combat is phased but reuses combat moves.** A module that
   surfaces combat moves already has the primitives. The phase structure
   (approach → engagement → boarding) and the engagement-objective concept
   are scaffolding the narrator could be prompted to manage, rather than
   new mechanics requiring new resolution code.

6. **Wealth is optional and toggle-able by design.** If the module ever
   models treasury/ledger/upkeep, it should be an opt-in subsystem
   mirroring the rulebook's own stance — on for the early survival phase,
   droppable once it becomes busywork. This maps cleanly to a per-campaign
   setting.

7. **The narrator's setting voice changes.** A Sundered Isles narrator
   draws on age-of-sail imagery, the two moons, the tides, imperial
   tyranny, and seafaring peril rather than space-opera tropes. If the
   module ever supports both, the narrator's tonal/setting context is
   another setting-specific injection alongside the truths.

8. **Three-realm flexibility is a deeper fork.** The Starfaring Realm
   variant means Sundered Isles structures can be layered back onto a
   space campaign. For a module's purposes this is an edge case, but it
   underlines that "setting" and "engine" are cleanly separable in this
   game line — which is the same separation the module already relies on.
