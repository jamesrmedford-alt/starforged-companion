# Ironsworn: Sundered Isles — Play Kit Rules Reference

Authoritative reference for the **Sundered Isles** expansion, extracted from the
*Ironsworn: Sundered Isles Play Kit* (Shawn Tomkin, 2024; text licensed
CC BY 4.0, ironswornrpg.com). Sundered Isles is an expansion **for Ironsworn:
Starforged** — it reuses Starforged's engine and most of its moves, reskinned
for an age-of-sail / nautical setting and extended with a few new subsystems.

This document is the sibling of
[`playkit-rules-and-coverage.md`](playkit-rules-and-coverage.md) (Starforged).
It is structured for two audiences:

- **Rules reference** — Part 1 is a self-contained summary of every Sundered
  Isles move, clock, embedded table, worksheet, and safety tool. Use it instead
  of opening the PDF.
- **Delta + status** — Part 2 lists exactly what Sundered Isles changes
  relative to Starforged (the moves are described in the play kit as "minor
  variations on their Starforged counterparts", so the delta is the useful
  part). Part 3 records the implementation status in this module and where the
  data lives.

> **Scope note.** Sundered Isles is **not implemented** in the Starforged
> Companion as of this writing. This doc is a rules reference for any future
> work, not a coverage map. See Part 3 for where the data already lives in the
> vendored `foundry-ironsworn` submodule.

Page references (`PK p.N`) are to the Play Kit move-reference sheets.

---

## Part 1 — Play Kit Rules Reference

### 1.1 Relationship to Starforged

Sundered Isles runs on the **same core engine** as Starforged: the action roll,
challenge dice, hits/misses, matches, momentum and burning momentum, progress
ranks and ticks, and progress moves are all identical. The character has the
same five stats (edge, heart, iron, shadow, wits), the same condition meters
(health, spirit, supply), the same momentum band (−6 to +10), and the same three
legacy tracks (quests, bonds, discoveries).

For the shared mechanics (action score, match, mark progress per rank, burn
momentum, momentum reset), see
[`playkit-rules-and-coverage.md` §1.1](playkit-rules-and-coverage.md) — they are
not repeated here. This document records only what the Sundered Isles play kit
states in its own words, and flags where it differs.

### 1.2 Character sheet and impacts

- **Stats** edge / heart / iron / shadow / wits; **meters** health / spirit /
  supply; **momentum** −6…+10; **legacy tracks** quests / bonds / discoveries.
- **Vehicles** track **integrity** (the meter targeted by *Withstand Damage*
  and restored by *Repair*). Sundered Isles distinguishes three vehicle roles:
  - **Command vehicle** — your ship (the analogue of Starforged's command
    vehicle / starship); carries **modules** and may dock **support vehicles**.
  - **Support vehicle** — a secondary vehicle.
  - **Incidental vehicle** — a transient/throwaway vehicle.
- **Impacts** (as Starforged): *misfortunes* — wounded, shaken, unprepared;
  *lasting effects* — permanently harmed, traumatized; *burdens* — doomed,
  tormented, indebted; *current vehicle* — **battered, cursed**.

### 1.3 Move catalogue

Every move from the play kit, in play-kit category order, with trigger
roll and outcome essentials. **Bold** denotes a progress move. The A–Z index in
the play kit lists 52 moves; the Scene Challenge section (§1.4) adds *Begin the
Scene* and *Finish the Scene* plus scene-challenge variants of two adventure
moves.

#### Session moves (PK p.1)

| Move | Roll | Outcome essentials |
|---|---|---|
| Begin a Session | — | Set/adjust flags, recap, set the scene; optionally spotlight a danger/opportunity/insight as a brief vignette (d100 table) — then **all players take +1 momentum** |
| Set a Flag | — | Mark content to approach mindfully; later, flagged content can be adjusted via Change Your Fate |
| Change Your Fate | — | On flagged content / rejecting an oracle / resisting a consequence, choose any of: **Reframe, Refocus, Replace, Redirect, Reshape** |
| Take a Break | — | After a progress move or intense scene: *Move on* (+1 on next non-progress move) or *Stop for now* (End a Session) |
| End a Session | — | Reflect, mark missed progress; Develop Your Relationship / Reach a Milestone if earned; note a focus for next session and take +1 momentum |

#### Adventure moves (PK p.2)

| Move | Roll | Outcome essentials |
|---|---|---|
| Face Danger | +edge/heart/iron/shadow/wits (by approach) | Strong: success, +1 momentum. Weak: success at a cost — make a suffer move (−1). Miss: Pay the Price |
| Secure an Advantage | +edge/heart/iron/shadow/wits (by approach) | Hit: strong = both, weak = one of {+2 momentum, +1 next non-progress move}. Miss: Pay the Price |
| Gather Information | +wits | Strong: clear, helpful lead, +2 momentum. Weak: insight + complication, +1 momentum. Miss: Pay the Price |
| Compel | +heart (charm/barter), +iron (threaten), +shadow (lie) | Strong: they comply, +1 momentum. Weak: comply with a demand/complication. Miss: Pay the Price |
| Aid Your Ally | — (Secure an Advantage or Gain Ground) | Your **ally** takes the benefit of the move; Gain Ground strong = both in control, weak = ally in control, you in a bad spot |
| Check Your Gear | +supply | Strong: you have it, +1 momentum. Weak: have it but choose Sacrifice Resources (−1) or Lose Momentum (−2). Miss: Pay the Price |

#### Quest moves (PK p.3)

| Move | Roll | Outcome essentials |
|---|---|---|
| Swear an Iron Vow | +heart (+1 to a connection, +2 if bonded) | Strong: emboldened, +2 momentum. Weak: +1 momentum, envision a path forward. Miss: envision the obstacle first |
| Reach a Milestone | — | On meaningful headway, mark progress per the vow's rank |
| **Fulfill Your Vow** | progress vs. challenge dice | Strong: fulfilled, mark quests-legacy reward by rank. Weak: more to do / reduce reward one rank (or re-vow). Miss: undone — Forsake or recommit (clear progress, raise rank) |
| Forsake Your Vow | — | Clear the vow; envision the fallout and choose one+ cost (stress, connection test, discard asset, enemy gains, reputation, etc.) |

#### Connection moves (PK p.3)

| Move | Roll | Outcome essentials |
|---|---|---|
| Make a Connection | +heart | Strong: new connection (role + rank). Weak: connection with a complication/demand. Miss: Pay the Price |
| Develop Your Relationship | — (or +rank if already bonded) | Mark progress per connection rank; if bonded instead roll +rank for a bonds-legacy reward / possible rank-up on a match |
| Test Your Relationship | +heart (+1 if bonded) | Strong: Develop Your Relationship. Weak: that, plus a demand. Miss: lose the connection (Pay the Price) or prove loyalty (Swear a formidable+ vow) |
| **Forge a Bond** | progress vs. challenge dice | Strong: bond formed; bonds-legacy reward by rank; choose *Bolster* (+2 aid) or *Expand* (second role). Weak: a request first. Miss: at odds — recommit (clear lowest die, raise rank) |

#### Exploration moves (PK p.4)

| Move | Roll | Outcome essentials |
|---|---|---|
| Undertake an Expedition | +edge (speed), +shadow (low profile), +wits (vigilance) | Per segment: strong = reach a waypoint, mark progress. Weak: progress at a cost. Miss: no progress, Pay the Price |
| Explore a Waypoint | +wits | Strong: choose opportunity (+2 momentum) or mark progress; **strong + match → Make a Discovery**. Weak: interesting but perilous, +1 momentum. Miss: Pay the Price; **miss + match → Confront Chaos** |
| Make a Discovery | d100 table (or choose) | Envision a wondrous discovery; you and allies may mark **2 ticks** on the discoveries legacy track |
| Confront Chaos | 1–3 aspects, d100 each (or choose) | Envision a dreadful encounter; mark **1 tick** on discoveries legacy per aspect first confronted |
| **Finish an Expedition** | progress vs. challenge dice | Strong: arrive, discoveries-legacy reward by rank. Weak: complication, reward one rank lower. Miss: lost — abandon (Pay the Price) or return (clear progress, raise rank) |
| Set a Course | +supply | Strong: arrive, situation favors you, +1 momentum. Weak: arrive with a cost/complication. Miss: waylaid by a threat, Pay the Price |

#### Combat moves (PK p.5)

Combat puts you **in control** or **in a bad spot**. In control → proactive
moves (Gain Ground, Strike). Bad spot → reactive moves (React Under Fire,
Clash). Moves that don't set position default: strong = in control; weak/miss =
bad spot.

| Move | Roll | Outcome essentials |
|---|---|---|
| Enter the Fray | +edge/heart/iron/shadow/wits (by stance) | Set objective(s) + rank. Strong: both. Weak: one of {+2 momentum, in control}. Miss: begin in a bad spot |
| Gain Ground | +edge/heart/iron/shadow/wits (by approach) | In control. Strong: choose two, weak: one of {mark progress, +2 momentum, +1 next move}. Miss: bad spot, Pay the Price |
| React Under Fire | +edge/heart/iron/shadow/wits (by approach) | In a bad spot. Strong: succeed, in control, +1 momentum. Weak: cost (suffer −1), stay bad spot. Miss: worsens, Pay the Price |
| Strike | +iron (close) / +edge (ranged) | In control. Strong: mark progress twice, stay in control. Weak: mark twice but exposed (bad spot). Miss: Pay the Price |
| Clash | +iron (close) / +edge (ranged) | In a bad spot. Strong: mark twice, in control. Weak: mark once, counterblow, Pay the Price. Miss: dominated, Pay the Price |
| **Take Decisive Action** | progress vs. challenge dice | Seize an objective. In a bad spot, downgrade results. Strong: prevail, +1 momentum. Weak: objective + cost (d100 table). Miss: defeated, Pay the Price |
| Face Defeat | — | Abandon/lose an objective; clear it and Pay the Price; may set a new objective; fight continues in a bad spot |
| Battle | +edge/heart/iron/shadow/wits (by style) | Resolve a whole fight "in a blur". Strong: objective met, +2 momentum (you and allies). Weak: met at a cost, Pay the Price. Miss: defeated, Pay the Price |

#### Suffer moves (PK p.6)

| Move | Roll | Outcome essentials |
|---|---|---|
| Lose Momentum | — | Suffer −1/−2/−3 momentum; at minimum (−6), redirect the cost or clear progress on a track |
| Endure Harm | +health or +iron (higher) | Suffer −health; on 0/resist, strong = +1 health or +1 momentum; miss = worse, possible wounded / Face Death (d100) |
| Endure Stress | +spirit or +heart (higher) | Suffer −spirit; on 0/resist, strong = +1 spirit or +1 momentum; miss = worse, possible shaken / Face Desolation (d100) |
| Companion Takes a Hit | +companion's health | Companion suffers −health; miss + match at 0 health → companion dead, discard asset |
| Sacrifice Resources | — | Suffer −supply; at 0, mark **unprepared**; further loss while unprepared redirects to another suffer move |
| Withstand Damage | +integrity | Vehicle suffers −integrity; at 0, cost by vehicle type (command: battered/cursed, broken module, or d100; support: battered or d100; incidental: d100); sinking/destruction → Overcome Destruction or discard |

#### Threshold moves (PK p.7)

| Move | Roll | Outcome essentials |
|---|---|---|
| Face Death | +heart | Strong: return to the mortal world. Weak: die nobly, or take a death-bound extreme vow and mark **doomed**. Miss: dead |
| Face Desolation | +heart | Strong: resist. Weak: spirit breaks nobly, or take a soul-bound extreme vow and mark **tormented**. Miss: lost to despair/horror |
| **Overcome Destruction** | progress vs. bonds-legacy track | Command vehicle lost: discard it + modules + docked support. Strong: a favor, no strings. Weak: mark **indebted**, swear an extreme service vow. Miss: worse (against your nature). Then gain 1 XP per marked ability (min 3) for a replacement |

#### Recover moves (PK p.7)

| Move | Roll | Outcome essentials |
|---|---|---|
| Sojourn | +heart | Recover within a community. Strong: safe refuge — you and allies each take **two** auto-strong recover moves. Weak: **one** each (max three total). Miss: a demand, or Pay the Price |
| Heal | +iron (treated) / +iron or +wits lower (self) / +heart (companion) / +wits (provide) | Strong: clear wounded + heal, or +health. Weak: heal at a cost (Lose Momentum −2 / Sacrifice Resources −2). Miss: Pay the Price |
| Hearten | +heart | Strong: clear shaken / +spirit (+1 more if during Sojourn). Weak: fleeting — Lose Momentum (−1). Miss: Pay the Price |
| Resupply | +heart/iron/shadow/wits (by approach) / +supply (hold, from stores) | Strong: clear unprepared / +supply / acquire a needed item (+1 momentum). Weak: deal with an obstacle first. Miss: Pay the Price |
| Repair | +wits (self) / +heart (facility) | Hit: gain **repair points** by situation (facility 7/5, anchor 4/2, underway 3/1, under fire 2/0); spend on battered (2), broken module (2), +1 integrity (1), etc. Miss: Pay the Price |

#### Legacy moves (PK p.8)

| Move | Roll | Outcome essentials |
|---|---|---|
| Earn Experience | — | Filling a legacy box = 2 XP; after the 10th box clear the track (then 1 XP per box) |
| Advance | — | Spend 3 XP for a new asset / 2 XP to upgrade; categories: Module, Support Vehicle, Path, Companion, **Deed** |
| **Continue a Legacy** | progress vs. each legacy track | New character in the same setting: roll per quests/bonds/discoveries; strong/weak/miss options carry forward paths, connections, vehicles, unfinished vows, etc. |

#### Fate moves (PK p.8)

| Move | Roll | Outcome essentials |
|---|---|---|
| Ask the Oracle | — / yes-no odds table | Draw a conclusion, spark an idea, ask yes/no (Small Chance 10 / Unlikely 25 / 50-50 / Likely 75 / Almost Certain 90), or pick two; match → extreme result/twist |
| Pay the Price | — / d100 table | Make the obvious negative happen, Ask the Oracle, or roll the d100 consequence table |

#### Scene challenge moves (PK p.9)

A **scene challenge** pairs a troublesome/dangerous/formidable progress track
with a **4-segment tension clock**. Begin the Scene to start; act with the
scene-challenge variants of Face Danger / Secure an Advantage; Finish the Scene
when a track fills or the narrative concludes.

| Move | Roll | Outcome essentials |
|---|---|---|
| Begin the Scene | — | Name the objective; rank by readiness (clear advantage = troublesome, ready = dangerous, unprepared/outmatched = formidable); activate a 4-segment tension clock |
| Face Danger (scene challenge) | +edge/heart/iron/shadow/wits | Strong: mark progress (twice on a match). Weak: progress + fill a clock segment. Miss: fill a segment (two on a match) + Pay the Price |
| Secure an Advantage (scene challenge) | +edge/heart/iron/shadow/wits | Strong: take both (+ progress on a match). Weak: one of {+2 momentum, +1 next move}. Miss: fill a segment (two on a match) + Pay the Price |
| **Finish the Scene** | progress vs. challenge dice | Strong: objective achieved. Weak: succeed at a minor cost (Pay the Price). Miss: fail, Pay the Price |

### 1.4 Clocks

- **Campaign clocks** — background progress for factions/threats. Set 4/6/8/10
  segments. Advance at **Begin a Session**: fill if not in doubt (two if rapid),
  otherwise Ask the Oracle (default odds **likely**; match → fill two / new
  opposing forces). Filled → the event triggers.
- **Tension clocks** — looming threats/deadlines within or across scenes;
  unlike campaign clocks they **do not advance on their own**. Set 4/6 (imminent)
  or 8/10 (longer term). When you Pay the Price or hit a complication you may
  fill a segment (two for a dramatic failure / miss-with-a-match). Filled → the
  deadline triggers.

### 1.5 Tables embedded in the play kit

The play kit prints these d100 (or odds) tables inline with their moves:

- **Begin a Session vignette** (d100) — inspiration for the optional spotlight.
- **Make a Discovery** (d100) — wondrous discoveries.
- **Confront Chaos** (d100) — dreadful aspects.
- **Take Decisive Action** weak-hit cost (d100).
- **Endure Harm** miss table (d100, mortal harm → Face Death, etc.).
- **Endure Stress** miss table (d100, → Face Desolation, etc.).
- **Withstand Damage** vehicle-cost table (d100, sinking/destruction outcomes).
- **Pay the Price** (d100) — generic consequences.
- **Ask the Oracle / campaign-clock odds** — Small Chance / Unlikely / 50-50 /
  Likely / Almost Certain.

The full Sundered Isles **oracle set** (regions, seas, weather, ships, ports,
factions, NPCs, etc.) is not in the play kit move sheets; it lives in the
expansion's oracle tables (see Part 3 for the vendored data).

### 1.6 Worksheets

The play kit ships these print-and-play sheets:

- **Navigation Chart** — map locations and factions, including a **Faction
  Influence Grid** crossing **Area** and **Region** with influence levels
  **Dominant → Established → Subsisting → Diminished → Obscure** (and *Obscure*
  for unknown). This is the main setting-cartography aid; *(new to Sundered
  Isles)*.
- **Connections & Specialists** — track connections (name, location, role, rank
  troublesome→epic, bond). With the **Cohort** asset, also track **specialist
  shipmates** here; *(specialists are new to Sundered Isles)*.
- **Combat Challenge** — track a naval engagement or other combat: objectives,
  ranks, tension clocks, and foes.
- **Treasury Ledger** — track **finances**: ship, commander, and **upkeep**;
  *(the money/upkeep subsystem is new to Sundered Isles)*.
- **Character Sheet** — status, condition, experience (an illustrated sheet is a
  separate download).

### 1.7 Safety tools

Sundered Isles foregrounds the same safety frame as Starforged:

- **Set a Flag** — name content to approach mindfully.
- **Change Your Fate** — adjust/omit flagged content or unwanted outcomes via
  **Reframe / Refocus / Replace / Redirect / Reshape**.
- **Take a Break** — built-in pause after intense scenes / progress moves.

---

## Part 2 — What Sundered Isles changes vs. Starforged

The play kit states its moves are "minor variations on their Starforged
counterparts." The substantive differences:

1. **Nautical reskin of travel and vehicle play.** *Set a Course* and
   *Undertake an Expedition* are framed around "perilous seas, hazardous
   terrain, or a mysterious site"; *Withstand Damage* and *Repair* speak of
   **integrity**, **sinking**, anchorage, being "underway" or "under fire", and
   distinguish **command / support / incidental** vehicles. The command vehicle
   is a ship rather than a starship.
2. **Battle** (combat) — a whole-fight "in a blur" resolution move, for fights
   that don't warrant a blow-by-blow progress track.
3. **Named scene-challenge moves** — *Begin the Scene* and *Finish the Scene*,
   plus scene-challenge variants of Face Danger / Secure an Advantage, formalise
   the scene challenge around a **4-segment tension clock**. (Starforged
   describes scene challenges but does not name these moves.)
4. **Faction Influence Grid** (Navigation Chart) — a cartography aid rating
   faction influence (Dominant → Obscure) across Area and Region. *No Starforged
   analogue.*
5. **Finances / Treasury Ledger** — an explicit money-and-**upkeep** subsystem
   tracked per ship and commander. *No Starforged analogue.*
6. **Specialists** — with the **Cohort** asset, named specialist shipmates
   tracked alongside connections. *No Starforged analogue.*

Shared, essentially unchanged: the action/progress engine, the five stats and
three meters, momentum and burning, the legacy tracks, and the bulk of the
adventure / quest / connection / suffer / threshold / recover / legacy / fate
moves.

---

## Part 3 — Implementation status & data source

**Status in this module: not implemented.** The Starforged Companion targets
Ironsworn: Starforged only. Nothing in `src/` reads or routes Sundered Isles
content, and there is no system-detection or expansion-toggle for it. This
document exists as a rules reference should Sundered Isles support ever be
scoped (open a GitHub issue first per `CLAUDE.md`).

**Where the data already lives.** The vendored `foundry-ironsworn` submodule
bundles full Sundered Isles data as Foundry JSON packs — a faithful, in-repo
source if implementation is ever pursued:

| Pack (`vendor/foundry-ironsworn/json-packs/…`) | Contents |
|---|---|
| `sundered-isles-moves` | The move documents summarised in §1.3 (full trigger/outcome text) |
| `sundered-isles-oracles` | The full SI oracle set (regions, seas, weather, ships, ports, factions, NPCs, …) |
| `sundered-isles-assets` | SI assets (paths, companions, ships/modules, support vehicles, deeds, …) |
| `sundered-isles-truths` | The SI setting-truth categories (Sundering, Piracy, Navigation, Relics, Beasts, Horrors, …) |
| `sundered-isles-charts` | Ocean Map / Region Map scene charts |
| `foe-actors-is` | SI foe / encounter stat blocks |

A meaningful integration would be a large, multi-feature effort (oracle tables,
the new Finances and Faction-Influence subsystems, naval combat framing, asset
import, and system/expansion detection) — well beyond this reference. Treat each
piece as its own scope.

---

## Document maintenance

- **Source:** *Ironsworn: Sundered Isles Play Kit* (Shawn Tomkin, ©2024; text
  CC BY 4.0, ironswornrpg.com). Move/clock/worksheet text summarised from the
  play kit move-reference sheets (pp. 1–9).
- **Sibling docs:** [`playkit-rules-and-coverage.md`](playkit-rules-and-coverage.md)
  (Starforged play kit + code coverage) and
  [`rulebook-summary.md`](rulebook-summary.md) (Starforged rulebook).
- When the Sundered Isles play kit or expansion is reissued, re-extract and
  update Parts 1–2. If/when the module gains Sundered Isles support, convert
  Part 3 into a code-coverage map mirroring the Starforged doc's Parts 2–3.
