# Example Session — World Truths & Opening Scene
## Design Exploration Document — Illustrative Campaign Only

This document records one example run of the module's full pipeline: World
Truths rolled via the truth generator, followed by an opening scene where
move interpretation, dice resolution, and narration all ran end-to-end.

**This is not hardcoded campaign state.** The module supports any campaign.
New campaigns roll or choose their own World Truths via `src/truths/generator.js`
(`rollWorldTruths()` or `buildSessionZeroTruths()` with custom rolls). The
example truths and scene below are illustrative — they demonstrate the system
working, and provide realistic fixtures for unit and integration tests.

The safety configuration established here (no children in peril) is a global
default in `CampaignStateSchema`. Each campaign GM should review and adjust it
in Configure Settings → Safety before the first session.

---

## Section 1: Example World Truths

The following 14 truths were produced by rolling d100 against the Ironsworn:
Starforged Rulebook (pp. 84–98). Sub-tables resolved with additional rolls
where indicated. A different campaign would roll different results.

---

### Cataclysm — Roll: 82 (68–100)

**We escaped the ravages of a catastrophic war**

Over millennia we consumed resources and shattered lives fueling industry,
expansion, and war. A powerful foe exploited our rivalries in a violent bid
for power. Fleeing the devastation, we assembled our fleets and traveled to
the Forge.

*Sub-roll 15 → Foe: Artificial intelligence. The machines we built turned
against us.*

> **Quest starter:** A delegation of your dreaded AI foe arrives in the Forge,
> claiming to represent a rebel force seeking sanctuary. What news do they carry?

---

### Exodus — Roll: 4 (1–33)

**The Exodus fleet made a millennia-long journey to the Forge**

Countless generations lived out their lives aboard titanic sleeper ships.
The refugees built a rich legacy of culture and tradition. Some never left —
the Ironhomes still sail the depths of this galaxy.

> **Quest starter:** Your dreams are plagued by visions of a lost and crippled
> Exodus ship. What do you see? Why does it call to you?

---

### Communities — Roll: 36 (34–67)

**Dangers abound, but there is safety in numbers — the Founder Clans**

Many ships and settlements are united under the banner of one of the five
Founder Clans. Each honors the name of a leader who guided their people in
the chaotic time after the Exodus. Territorial skirmishes are common.

> **Quest starter:** A forsaken people, sworn to no clan, live on an orbital
> station. A recent illness left many sick or dead. Which clan stands against you?

---

### Iron — Roll: 29 (1–33)

**Iron vows are sworn upon remnants of the Exodus ships**

Many outposts were built from the iron bones of those ships. Fragments were
given to survivors as remembrance and passed generation to generation. The
Ironsworn swear vows upon these shards.

> **Quest starter:** The iron shard you carry is a fragment of an Exodus ship
> hull. Its navigational chart only reveals itself in the light of a specific
> star. Where does the map lead?

---

### Laws — Roll: 95 (68–100)

**Communities are bound by the Covenant, upheld by the Keepers**

Most settlements yield to the authority of the Keepers. But some view the
Covenant as a dogmatic relic of the past — in those places, the Keepers find
no welcome.

> **Quest starter:** A Keeper abuses their authority to take control of a
> settlement and rules with an iron fist. What do they seek to gain?

---

### Religion — Roll: 87 (68–100)

**Three dominant orders — the Triumvirate — battle for influence**

Our communities are often sworn to one of the three doctrines of the
Triumvirate. Faith offers purpose and meaning, but also divides us. Leaders
have pitted us against one another throughout our brief history in the Forge.

> **Quest starter:** You bear the mark of one of the Triumvirate gods. Priests
> declare this a sign you are chosen. Do you accept this fate?

---

### Magic — Roll: 70 (34–67)

**Supernatural powers are wielded by rare individuals called Paragons**

While not magic in the truest sense, the abilities of the Paragons come as
close as we can conjure. These powers are born of genetic engineering passed
down through certain bloodlines.

*Sub-roll 12 → Origin: Genetic engineering*

> **Quest starter:** A young Paragon wields incredible power but cannot control
> it, shunned by family and hunted by those who would weaponize them. Why are
> you sworn to protect them?

---

### Communications & Data — Roll: 76 (68–100)

**The Weave — a network of data hubs enables near-instant communication**

In settled domains, Weave hubs allow near-instantaneous data-sharing between
ships and outposts. But they are frequent targets for sabotage. Beyond populous
sectors, isolation remains common.

> **Quest starter:** A new data hub will connect several outposts to the Weave.
> Someone seeks to stop it. What do they gain by keeping those settlements
> in the dark?

---

### Medicine — Roll: 5 (1–33)

**Advanced medical knowledge was lost during the Exodus**

Healers are rare and ill-equipped. Untold numbers have succumbed to sickness
and injury. Those who survive often bear the scars of a hard life in the Forge.

> **Quest starter:** A respected leader has fallen ill with a sickness eradicated
> after the Exodus. The only remaining vaccine is held in a research outpost
> seized by a dangerous foe.

---

### AI — Roll: 12 (1–33)

**Advanced AI is outlawed — we rely on mind-altered seers called Adepts**

Computers are limited to simple digital systems. AI was outlawed in the
aftermath of the machine wars. The Adepts use mind-altering substances to
perceive the universe as a lattice of data — but at great personal cost.

*Sub-roll 28 → Reason: The energies of the Forge corrupt advanced systems.*

> **Quest starter:** A brilliant engineer has built a prototype AI. The
> Adepts claim it is an abomination; the engineer says it's humanity's
> salvation. Who is right?

---

### War — Roll: 30 (1–33)

**Organized armies are a rarity — war is fought by raiders and conscripts**

Resources are too precious for organized armies. When violence erupts,
it is in the form of raids, skirmishes, and desperate last stands. Mercenaries
and privateers fill the void.

> **Quest starter:** A raider clan has blockaded a settlement, threatening to
> destroy it unless their demands are met. What do they want? Who sent them?

---

### Lifeforms — Roll: 78 (68–100)

**The Essentia — ancient entities who architect life within the Forge**

Life in the Forge was seeded and engineered by the Essentia, ancient entities
who enact their inscrutable will. These omniscient beings are rarely encountered.
Some worship them. Others resist.

> **Quest starter:** A sacred site has been desecrated and the creature that
> guarded it driven off. The locals believe this will bring the Essentia's
> wrath. What dark force would dare provoke such powerful beings?

---

### Precursors — Roll: 72 (68–100)

**The remnants — biomechanical lifeforms built as weapons, still fighting**

The biomechanical lifeforms we call the Remnants, engineered as weapons in a
cataclysmic war, survived the death of their creators. On scarred planets and
within Precursor vaults throughout the Forge, the Remnants still guard ancient
secrets and fight unending wars.

*Campaign interpretation: The Ascendancy left vaults untethered from reality.
Their structures exist simultaneously in the Forge and somewhere else. Entering
one is to step partly out of reality.*

> **Quest starter:** You discover the wreckage of a vessel that appears to have
> been built by the ancient Remnants. What drove them to construct it, and what
> does it carry?

---

### Horrors — Roll: 92 (68–100)

**The Woken dead walk the Forge — the Soulbinders stand against them**

Some unfortunates, destroyed by violence or trauma, do not rest. They rise as
malevolent spirits, haunting the places of their death. The Soulbinders have
sworn to contain this threat — at terrible cost to themselves.

> **Quest starter:** A Soulbinder arrives at a settlement, wounded and near
> death. They carry evidence of a horror unlike any seen before. What have
> they encountered? What must you do?

---

## Section 2: Safety Configuration

Established mid-Session Zero in response to an organic trigger in the fiction.

**LINE (Hard — never cross):** No situations that endanger children. Children
may not appear as characters in peril under any circumstances.

**VEIL (Soft — handle with care):** Children as plot-significant characters.
Children may exist in the setting but may not drive or feature prominently in
storylines.

Scope: Global. Applies to all sessions. Injected first in every context packet
before any creative content. Acts as a hard ceiling on the mischief dial.

---

## Section 3: Opening Scene Transcript

*The following is a lightly edited transcript of the first session's opening
scene, used as the design example throughout the module's development.*

---

**Player:** I'm threading my ship through a debris field. A personal vow is
driving this intercept. I want to plot a course through the densest part of
the field to get to whatever's at the center faster.

---

**Module (behind the scenes):** *Narration describes risky navigation requiring
focus and observation. Move: Face Danger +Wits. Roll: Action die 3 + Wits 2 = 5
vs Challenge dice 6 and 8. Miss. Pay the Price.*

---

**Move Result Card:**
```
Face Danger +wits
Action: 3 + 2 = 5  |  Challenge: 6, 8
Miss
Dire threat or unwelcome truth uncovered. Pay the Price.
```

---

**Narrator:** The Forge offers no clean paths through its debris. You thread
your ship between tumbling fragments — some ancient hull-plate larger than
your vessel, some fine as gravel — and for a moment it works. Then a cascade
begins. Slow at first. Then not. You lose a sensor array to a fragment you
never saw. The contact at the center of the field holds position, unmoving.
Whatever's there, it isn't fleeing.

---

**Player:** There's a ship, or what's left of one. Something's alive in there.
I push into the med bay, get the survivor to a surface I can work on, and
try to reboot the autodoc. Well, this is definitely the first time I've found
someone alive in one of these.

---

**Module (behind the scenes):** *Player narrating two intertwined actions:
getting the survivor to the med bay and dealing with unreliable equipment.
First instinct is Heal but the autodoc complication is the real obstacle.
Interpreting as Face Danger +Wits — the autodoc is the danger standing between
the survivor and stability. Mischief dial: Balanced. No misdirection applied.*

*Roll: Action die 5 + Wits 2 = 7 vs Challenge dice 7 and 2. Beats one
challenge die. Weak Hit — success with a cost.*

---

**Move Result Card:**
```
Face Danger +wits
Action: 5 + 2 = 7  |  Challenge: 7, 2
Weak Hit
Success with a cost. Make a suffer move (−1 momentum).
```

---

**Narrator:** The autodoc shudders back to life with the particular reluctance
of equipment that knows it's being asked to punch above its weight.

It stabilizes her. Barely. The readout flags three things it can treat, two
things it can monitor, and one thing it labels with a medical code you don't
immediately recognize. You run the code.

It comes back as radiation exposure. Specific signature. The autodoc's database,
limited as it is, identifies the source with uncomfortable confidence.

Ascendancy vault.

The iron panel is still strapped to her arm. She hasn't let go even under
sedation. Up close you can see the navigational markings more clearly now —
and something else underneath them, finer, almost worn away. Writing in a
script you don't recognize.

Sable speaks from the doorway behind you, her voice still half in the dataweave.

"She wasn't escaping from something," Sable says. "She was delivering it."

---

**Module (behind the scenes):** *NPC record scaffolding initiated:*
- *Former Keeper, female, adult*
- *Radiation exposure consistent with Ascendancy vault contact*
- *Unconscious, deliberate courier of iron relic artifact*
- *Relationship to Ascendancy beacon truth flagged*
- *Potential Connection*

*Art generation queued. Prompt: "weathered older woman, former military
insignia scratched off armor, unconscious in medical bay, science fiction
setting, gritty realistic"*

*Two active threads: NPC condition, artifact identity.*

---

## Section 4: Module Design Notes

Observations from this example session that informed module development.

**Move detection:** Face Danger was the appropriate move for both player
actions in this scene, but the surface narration didn't name it. The
interpretation layer correctly identified the underlying risk structure in
both cases.

**Context injection:** World Truths were active throughout — the Ascendancy
vault truth (Precursors, roll 72) directly informed the radiation signature
reveal. The narrator produced a consequence mechanically coherent with the
established setting without being explicitly instructed.

**Entity creation timing:** The NPC record was scaffolded after sufficient
descriptive context existed from narration, not at the moment of first
appearance. This produces a richer initial prompt for art generation.

**Safety system in practice:** The Line and Veil were established mid-scene
in response to a naturally occurring trigger. The module needs to handle
mid-scene safety configuration gracefully — pausing, redirecting, and resuming
without breaking narrative flow.

**Mischief dial:** Set to Balanced for this session. Both move interpretations
were straightforward — no misdirection occurred. A higher setting might have
read "reboot the autodoc" as Repair rather than Face Danger, producing a
different mechanical outcome and potentially a different cost on the weak hit.

---

*End of example session document*

*Note: These truths and entities are used as test fixtures in `tests/fixtures/`. They are not loaded into any campaign by default — each campaign builds its own truth set.*
