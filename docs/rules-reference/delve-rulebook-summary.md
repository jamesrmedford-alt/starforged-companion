# Ironsworn: Delve — Rulebook Summary

A chapter-by-chapter paraphrased summary of the Ironsworn: Delve
supplement, intended as design context for Claude Code. The summary
covers the site-delving system, the new moves, the theme/domain
generators, the optional subsystems, and the design intent. It
deliberately omits the oracle tables (Chapter 8), the denizen stat
blocks (Chapter 5), and the detailed threat/item reference (Chapters
6–7), since those are data the foundry-ironsworn ecosystem exposes, and
omits the book's prose, art, and verbatim move text.

**Source:** Ironsworn: Delve (Shawn Tomkin, 2020), digital edition. Text
licensed CC BY-NC-SA 4.0.

**Critical framing:** Delve is a supplement for the **original Ironsworn**
(the fantasy game set in the Ironlands), **not** for Starforged. It
predates Starforged by two years. This matters because the module is
Starforged-focused, and the relationship runs the other way from the
other expansions: Delve's site-exploration system was the *prototype*
that Starforged later generalized into its **expedition** mechanics
(Undertake an Expedition / Explore a Waypoint / Finish an Expedition are
the Starforged descendants of Delve's site moves). So this summary is
most useful as (a) historical/design context for understanding where
Starforged's expedition system came from, and (b) a source of reusable
abstractions — themes, domains, the denizen matrix, risk zones — that a
Starforged-based module could draw on if it ever wanted richer
location-generation than Starforged ships with.

Delve assumes and reuses the entire original Ironsworn engine: the action
roll (action die + stat vs. two challenge dice), momentum, progress
tracks and ranks (troublesome → epic), condition meters (health, spirit,
supply), and the move framework. The original Ironsworn engine is the
direct ancestor of Starforged's, so the mechanics will feel familiar:
the differences from Starforged are mostly naming and the absence of
some Starforged refinements (e.g., Ironlands uses health/spirit/supply
where the systems are near-identical in spirit).

**What this is for:** When Claude Code reasons about location generation,
expedition mechanics, procedural site content, or richer
dungeon/site-style play within a Starforged campaign, this is the
reference. For verbatim rules, denizen stats, oracle tables, or move
text, consult the actual supplement or the foundry-ironsworn system data.

---

## The core idea: sites

Delve's central addition is the **site** — a discrete, perilous location
(ruin, cavern, swamp, barrow, stronghold) that a character explores in
pursuit of a vow-related objective. A site is the fantasy-dungeon
analogue, but generated and resolved through progress tracks and oracles
rather than mapped room-by-room in advance.

A site is always tied to a vow. You delve because a quest compels you:
an ancient weapon lies in a haunted barrow, an enemy leader shelters in a
fortified stronghold, a corrupted wood blocks your path. Overcoming the
site's objective typically lets you Reach a Milestone or Fulfill Your Vow
on the related quest.

A site has four defining properties, set when you Discover it:

- A **theme** (its condition/nature)
- A **domain** (its physical form)
- A **rank** (troublesome → epic, governing scale and progress rate)
- A set of **denizens** (who/what dwells there)

---

## Chapter 1 — At the Threshold (setup)

How to prepare a delve.

### The seven new moves (overview)
Delve adds seven moves, fully detailed in Chapter 2:

- **Discover a Site** — made when a site enters the narrative; choose
  theme, domain, and rank
- **Delve the Depths** — the core exploration move, made repeatedly as you
  search; marks site progress and may trigger opportunities or dangers
- **Find an Opportunity** — triggered by a strong hit (and sometimes a weak
  hit) on Delve the Depths; a helpful feature or situation
- **Reveal a Danger** — triggered by a miss (and sometimes a weak hit) on
  Delve the Depths; a risk or obstacle to overcome
- **Check Your Gear** — test whether you happen to have a useful item
- **Locate Your Objective** — the progress move that resolves whether you
  find what you came for; compares site progress to the challenge dice
- **Escape the Depths** — resolves fleeing or withdrawing from a site in a
  single roll

### Discover a Site, in detail
When you resolve to enter a site, choose the theme and domain that fit
(or Ask the Oracle), and assign a rank. The rank sets progress per "area"
explored, on the standard Ironsworn scale:

- Troublesome — 3 progress per area
- Dangerous — 2
- Formidable — 1
- Extreme — 2 ticks
- Epic — 1 tick

Formidable is the suggested default — a good balance of challenge and
real-world time. A troublesome site is a few chambers resolved in
minutes; an epic site is unknowable depths spanning multiple sessions.

Returning to a previously fled site: roll both challenge dice, take the
lowest, and clear that many progress boxes (the retreat cost).

### Themes (8)
The theme is the site's condition and indicates the denizens and threats
likely present. Each theme is a tarot-sized card carrying oracle tables
for **features** and **dangers**:

| Theme | Nature |
|---|---|
| Ancient | Holds the secrets of a bygone age |
| Corrupted | Tainted by dark magic |
| Fortified | Foes defend it against intruders |
| Hallowed | The faithful worship here |
| Haunted | Restless spirits are bound here |
| Infested | Foul creatures dwell here |
| Ravaged | Time, disaster, or strife have taken their toll |
| Wild | Nature prevails |

### Domains (12)
The domain is the site's physical form — the terrain or architecture
traversed. Each domain is also a card with feature and danger oracles:

| Domain | Form |
|---|---|
| Barrow | The dead are enshrined here |
| Cavern | Stone and darkness |
| Frozen Cavern | Deep caves and enduring cold |
| Icereach | A frigid landscape of frozen seas |
| Mine | Tunnels dug greedily and deep |
| Pass | Treacherous paths over high mountains |
| Ruin | The crumbling legacy of a dead civilization |
| Sea Cave | Stone passages carved by ocean waves |
| Shadowfen | A primeval mist-cloaked marsh |
| Stronghold | A fortress secured against trespassers |
| Tanglewood | A perilous forest of eternal shadow |
| Underkeep | An age-old subterranean dungeon |

Theme and domain combine to define a site. "Infested Barrow," "Corrupted
Cavern," "Fortified Stronghold" — the pairing drives the fiction and
provides two oracle tables each for features and dangers. Either can be
chosen deliberately or randomly (draw a card, roll the oracle, or pick a
preset "site starter"). On a feature roll of 99/00, the site **transitions**
into a new theme or domain mid-exploration — a built-in mechanic for sites
that change character as you go deeper.

### Denizens and the denizen matrix
Denizens are the site's inhabitants. They're populated via the **denizen
matrix** on the site worksheet — slots rated **very common / common /
uncommon / rare / unforeseen**, each keyed to a range on a d100 roll. At
setup the player fills in a few denizens suggested by the theme and
domain and leaves most slots blank, filling them during play as encounters
arise. When a move calls for a denizen encounter, the player can choose
one from the matrix, roll on it, or Ask the Oracle.

Denizens have minimal mechanical footprint, like all Ironsworn/Starforged
NPCs: a rank plus fiction. The matrix is a lazy-generation tool — the site's
population is discovered through play, not pre-statted. Chapter 5 provides
the bestiary; this summary doesn't duplicate it.

### Envision the scene
The setup closes with envisioning the threshold — standing at the site's
edge, imagining what lies before you. Standard Ironsworn "envision before
mechanics" framing.

---

## Chapter 2 — Into the Depths (the play loop)

The moment-to-moment flow of delving.

### The Delve the Depths loop
The heart of the system. You repeatedly **Delve the Depths**, rolling
+ a stat appropriate to your approach (edge for speed, shadow for stealth,
wits for navigation, iron for forcing through, heart for resolve). Each
roll:

- **Strong hit** — mark progress and Find an Opportunity (a good
  development)
- **Weak hit** — mark progress, then either Find an Opportunity or Reveal
  a Danger (your choice or the oracle's, depending on the variant)
- **Miss** — Reveal a Danger (a threat with no progress)

This loop continues, marking the site progress track, until you decide to
**Locate Your Objective** — the progress move that resolves whether the
thing you came for is found. As with all Ironsworn progress moves, you
roll the *tally of filled progress boxes* against the two challenge dice,
not a stat. Strong hit: you find it cleanly. Weak hit: found, but with a
catch. Miss: it's not here, or finding it brings a dire complication.

Find an Opportunity and Reveal a Danger each have their own oracle tables
(general ones, plus the theme- and domain-specific feature/danger tables).
This is what makes the site feel populated and unpredictable without
prep — the opportunities and dangers are generated as you go.

### Escape the Depths
If a delve goes wrong — overwhelming dangers, broken body or sanity — the
player can **Escape the Depths**, a single roll resolving the flight out.
It's a mechanical and narrative shortcut; you don't re-delve the whole
site to leave. Fleeing forfeits site progress (paid back on return).

### The flow and core terms
The chapter closes with a flow diagram and a glossary of core terms (site,
theme, domain, rank, area, progress, denizen, objective). The conceptual
shape: Discover → (Delve the Depths → Opportunity/Danger)×N → Locate Your
Objective → resolve the vow, or Escape the Depths if it goes bad.

---

## Chapter 3 — Finding Your Path (options)

Entirely optional techniques and variant rules, many useful in any
Ironsworn campaign, not just delving.

### Managing sites and quests
When the site objective *is* the quest objective, keep **two separate
progress tracks**: the site track (physical headway) and the vow track
(narrative potential to Fulfill Your Vow). Set the quest rank a step or
two below the site rank. Within the site, mark site progress on Delve the
Depths and mark vow milestones as you overcome quest-relevant obstacles —
giving the delve and the quest parallel, interlocking pacing. The GM (or
the solo player) uses the two tracks as pacing tools: if the delve is
outrunning the quest, introduce milestone obstacles.

### Risk zones (optional escalation)
Segments the site progress track into three zones of escalating danger:

- **Low risk** (0–3 progress) — troublesome or dangerous foes
- **Medium risk** (4–7 progress) — dangerous or formidable foes
- **High risk** (8–10 progress) — formidable or extreme foes

The deeper you go, the worse it gets. The site's overall rank biases which
of each zone's two options you face. This is the mechanical expression of
"the heart of the site is the most dangerous part" — an elegant way to
make depth meaningful without tracking position.

### Learning from failure
A new advancement mechanic: when you fail to overcome challenges, you can
**mark your failure**, and later **learn from your failures** to gain a
benefit (a reroll, a bonus, or experience). Turns misses into long-term
character growth — a soft counter to the harshness of the dice.

### Other options
- **Mapping a site** — tips for drawing a visual map as you explore (the
  map is generated through play, not prepared)
- **Relationship maps** — diagramming how the people, creatures, and forces
  within a site relate (rivalries, alliances, hierarchies)
- **Streamlining dice rolls** — three speed-up options: "go with your gut"
  (skip oracles when you have an idea), "let it ride" (carry a result
  forward), and "casting runes" (a tactile oracle alternative)
- **Hacking sites** — playing without theme/domain cards, alternate Reveal
  a Danger, combining multiple themes/domains, creating your own, drawing
  inspiration from published adventures
- **Delves as journeys** — using the Delve mechanics to resolve overland
  travel (the conceptual bridge to Starforged's expedition system)
- **One-shot delves** — running a self-contained site adventure as a
  one-shot

---

## Chapter 4 — Sites (setting reference)

How sites fit a given version of the Ironlands, plus detailed
theme/domain descriptions and 20 preset **site starters** (named locations
with backgrounds and suggested denizens — e.g., Themon's Rest, Bleakroot
Depths, Darkfall Caves).

### Sites in alternative settings
Notably, the theme/domain system is deliberately setting-abstract. The
book explicitly suggests reusing it in other genres: Ancient Ruins in a
hollow asteroid (sci-fi), a Fortified Underkeep as a VR construct
(cyberpunk), a Corrupted Sea Cave for Lovecraftian cultists. The feature
and danger oracles are abstract enough to reinterpret for any setting.
**This is the design seam that makes Delve's content reusable in a
Starforged module** — themes and domains aren't locked to fantasy.

### Your truths
Like the core games, the campaign's established truths shape site
selection. Delve frames this as a set of yes/no questions rather than its
own truth categories (it uses the *original Ironsworn* truths from the
core book, page 122 — a different set again from Starforged's 14 and
Sundered Isles' 11). Sample questions: Is warfare dominant? (→ more and
stronger Fortified sites.) Does religion influence the world? (→ Hallowed
sites as sanctuaries, or exclude the theme.) The truths determine which
themes make sense and at what ranks.

---

## Chapters 5–8 (summarized briefly)

### Chapter 5 — Denizens
The bestiary: a roster of foes organized by type (Ironlanders, Firstborn,
Animals, Beasts, Horrors, Anomalies), each with a rank, fiction prompts,
and features. Includes guidance on the denizen matrix in play. These are
data; the foundry ecosystem exposes them and this summary doesn't
reproduce them.

### Chapter 6 — Threats (optional subsystem)
Mechanics for tracking malevolent forces working against the player's
vows — a threat has a category, a countdown/progress structure, and
escalating consequences as it advances. Conceptually similar to
Starforged's campaign clocks, but with more structure. Optional.

### Chapter 7 — Objects/Items of Power (optional subsystem)
Mechanics and inspiration for unique magical items — how to generate them,
their boons and banes, and how they integrate with assets. Optional.

### Chapter 8 — Oracles
New oracle tables for generating sites, denizens, monstrosities, names,
and answering questions. Data; not reproduced here.

---

## Implications for module design

Observations relevant to a Starforged-based module:

1. **Delve is the ancestor of Starforged's expedition system.** A module
   already supporting Undertake an Expedition / Explore a Waypoint /
   Finish an Expedition is already implementing the descendant of Delve's
   core loop. Understanding Delve clarifies the *design intent* behind
   those Starforged moves: an expedition is a site delve, generalized to
   space travel. The progress-track-plus-oracle-driven-discovery shape is
   identical.

2. **Themes and domains are reusable, setting-abstract content.** If the
   module ever wants richer procedural location generation than Starforged
   ships with — for derelicts, vaults, planetary sites, ship interiors —
   the theme/domain pattern (a condition card + a form card, each with
   feature and danger oracles, combined to define a location) is a proven,
   genre-portable abstraction. The book itself endorses sci-fi reuse.

3. **The denizen matrix is a lazy-population pattern worth knowing.** The
   "fill a few slots, leave the rest blank, generate the rest through
   play" approach to populating a location maps well onto how a narrator
   could lazily generate inhabitants of a Starforged site or derelict,
   rather than pre-statting everything. The matrix's common/uncommon/rare
   weighting is a clean probability structure.

4. **Risk zones are a depth-equals-danger mechanic.** The three-zone split
   of a progress track (low/medium/high risk by how deep you are) is a
   tidy way to make exploration depth meaningful without position
   tracking — relevant given the module explicitly dropped physical
   position tracking from fact-continuity. If a Starforged site or
   expedition wants escalating peril, this is the pattern.

5. **Transitions are a built-in "the site changes" mechanic.** Delve's
   theme/domain transition rule (a feature roll can shift the site into a
   new theme or domain mid-delve) is a model for sites that evolve as you
   explore — a derelict that turns out to be infested, a cavern that opens
   into ancient ruins. A narrator could use the same idea to keep long
   explorations from feeling static.

6. **Yet another truth schema.** Delve uses the *original Ironsworn*
   truths (a third distinct set, alongside Starforged's 14 and Sundered
   Isles' 11). This reinforces the earlier observation that "setting
   truths" are always game-specific. A module's constitutional-axiom
   injection is per-game, not universal across the Ironsworn line. Delve
   is unlikely to be directly relevant here since the module is
   Starforged-based, but it confirms the pattern.

7. **Threats and items-of-power are optional structured subsystems.** If
   the module ever wants more structure than Starforged's bare campaign
   clocks, Delve's Threats system is a more elaborate model. Likely out of
   scope, but noted as prior art within the same design family.

8. **The whole supplement is "optional layered onto core."** Like Sundered
   Isles, Delve is additive — it plugs into the base engine without
   replacing it. The architectural lesson the module already embodies
   (setting and subsystems are separable from the core resolution engine)
   holds across the entire Ironsworn product line.
