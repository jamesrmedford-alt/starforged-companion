# Ironsworn: Starforged — Play Kit Rules & Code Coverage

Authoritative reference for the game's supported features, extracted verbatim
from the *Ironsworn: Starforged Playkit* (Tomkin, 2022, updated Jan 2023), with
a per-feature map onto the Starforged Companion codebase and a punch-list of
mismatches.

This document is built for two audiences:

- **Rules reference** — Part 1 is a self-contained summary of every move,
  table, and resolution rule from the play kit. Use it instead of opening the
  PDF when you need to know what a move actually does.
- **Coverage audit** — Parts 2 and 3 map each rule onto the source tree and
  flag where the implementation diverges from the rules.

The play kit is the canonical surface of the game; the rulebook adds
illustrative tables and worked examples but does not change the rules
summarised here. References to the Reference Guide use `RG p.NNN`.

---

## Part 1 — Play Kit Rules Reference

### 1.1 Common terms

- **Action roll** — d6 (action die) + a stat + any "add +X" bonuses, compared
  against two d10 challenge dice. Final action score is capped at 10.
  - Action score **beats both** challenge dice → **strong hit**
  - Action score **beats one** challenge die → **weak hit**
  - Action score **beats neither** → **miss**
- **Match** — both challenge dice show the same value. A match on a strong
  hit usually unlocks an extra option; a match on a miss usually triggers a
  twist. Specific moves call out the effect.
- **Mark progress** — add ticks to a progress track based on its rank:
  troublesome **+12** (3 boxes), dangerous **+8** (2 boxes), formidable
  **+4** (1 box), extreme **+2**, epic **+1** (4 ticks = 1 box; tracks are 10
  boxes / 40 ticks).
- **Mark progress twice** — stacks; double the above per call.
- **Progress move** — special move that resolves a goal. Tally only fully
  filled boxes (the progress score) and roll the two challenge dice against
  it. Momentum cannot be burned on a progress move; asset abilities do not
  affect the roll unless they explicitly define a progress benefit.
- **Burn momentum** — on an action roll only (never on a progress roll),
  if your current momentum is positive and higher than your action die, you
  may replace the action die with your current momentum, then reset momentum
  to its **momentum reset** value.
- **Momentum reset** depends on the number of marked impacts: **0 impacts →
  +2, 1 impact → +1, 2 or more impacts → 0**. Max momentum starts at +10 and
  is reduced by 1 per marked impact.

### 1.2 Character sheet

- **Stats** (1–3 at creation, max 4 in play): edge, heart, iron, shadow, wits.
- **Condition meters** (0–5): health, spirit, supply.
- **Momentum** (−6 to +10).
- **Legacy tracks** (10 boxes each, 40 ticks): quests, bonds, discoveries.
- **Impacts** (10 total, three columns + vehicle):
  - *Misfortunes*: wounded, shaken, unprepared
  - *Lasting effects*: permanently harmed, traumatized
  - *Burdens*: doomed, tormented, indebted
  - *Current vehicle*: battered, cursed
- **Background vow** field on the sheet.
- **Wounded** caps health at 4; **shaken** caps spirit at 3 (rulebook).

### 1.3 Move catalogue (51 moves)

Below: every move from the play kit, in play-kit order, with its trigger
verb, action stat, and outcome summary. **Bold** denotes a progress move.

#### Session moves (5)

| Move | Roll | Outcome essentials |
|---|---|---|
| Begin a Session | — | Adjust/set flags, recap, set scene; optionally spotlight a vignette (d100 table) for +1 momentum to all players |
| Set a Flag | — | Declare content to approach mindfully; later content can Change Your Fate |
| Change Your Fate | — | Choose ≥1 of five options: Reframe, Refocus, Replace, Redirect, Reshape |
| Take a Break | — | Choose: *Move on* (+1 on next non-progress move) or *Stop for now* (End a Session) |
| End a Session | — | Reflect, mark milestones; if you note a focus for next session take +1 momentum |

#### Adventure moves (6)

| Move | Roll | Outcome essentials |
|---|---|---|
| Face Danger | +edge/heart/iron/shadow/wits | strong: +1 momentum • weak: succeed at a cost (suffer −1) • miss: Pay the Price |
| Secure an Advantage | +edge/heart/iron/shadow/wits | strong: both • weak: choose +2 momentum **or** +1 on next move • miss: Pay the Price |
| Gather Information | +wits | strong: +2 momentum • weak: +1 momentum with complication • miss: Pay the Price |
| Compel | +heart/iron/shadow | strong: yes • weak: yes with demand • miss: Pay the Price |
| Aid Your Ally | — | Make Secure an Advantage or Gain Ground; benefits go to the ally |
| Check Your Gear | +supply | strong: have it, +1 momentum • weak: have it, Sacrifice Resources (−1) or Lose Momentum (−2) • miss: don't have it, Pay the Price |

#### Quest moves (4)

| Move | Roll | Outcome essentials |
|---|---|---|
| Swear an Iron Vow | +heart (+1 to connection / +2 to bond) | strong: +2 momentum, path clear • weak: +1 momentum • miss: significant obstacle |
| Reach a Milestone | — | Mark progress on the vow per its rank |
| **Fulfill Your Vow** | progress vs. challenge | strong: legacy reward (1 tick → 3 boxes per rank) • weak: reward one rank lower • miss: vow undone — Forsake or recommit |
| Forsake Your Vow | — | Clear the vow; choose costs (Endure Stress, Test Your Relationship, discard asset, …) |

#### Connection moves (4)

| Move | Roll | Outcome essentials |
|---|---|---|
| Make a Connection | +heart | strong: new connection (role + rank) • weak: as strong with complication • miss: Pay the Price |
| Develop Your Relationship | — | Mark progress per connection rank; once bonded, roll +rank instead → marks bonds legacy ticks |
| Test Your Relationship | +heart (+1 if bonded) | strong: Develop Your Relationship • weak: same plus demand • miss: lose connection or Swear an Iron Vow |
| **Forge a Bond** | progress vs. challenge | strong: bond + legacy reward + Bolster or Expand influence • weak: as strong but they ask something • miss: recommit option |

#### Exploration moves (6)

| Move | Roll | Outcome essentials |
|---|---|---|
| Undertake an Expedition | +edge/shadow/wits | strong: reach waypoint, mark progress • weak: progress with cost • miss: no progress, Pay the Price |
| Explore a Waypoint | +wits | strong: opportunity or progress • **strong + match** → may Make a Discovery • weak: peril/ominous • miss: hardship; **miss + match** → may Confront Chaos |
| Make a Discovery | — | d100 table (25 entries); mark 2 ticks on discoveries legacy |
| Confront Chaos | — | Decide 1/2/3 aspects, roll/choose on the d100 chaos table (25 entries); mark 1 tick per aspect |
| **Finish an Expedition** | progress vs. challenge | strong: legacy reward by rank • weak: complication, one rank lower • miss: lost or recommit |
| Set a Course | +supply | strong: arrive, +1 momentum • weak: suffer or complication • miss: significant threat, Pay the Price |

#### Combat moves (8)

A character is in one of two combat positions: **in control** (use Gain
Ground, Strike, Take Decisive Action) or **in a bad spot** (use React Under
Fire, Clash). Suffer-move outcomes default position by hit type (strong = in
control; weak/miss = in a bad spot).

| Move | Roll | Outcome essentials |
|---|---|---|
| Enter the Fray | +edge/heart/iron/shadow/wits | strong: +2 momentum **and** in control • weak: choose one • miss: in bad spot |
| Gain Ground | +edge/heart/iron/shadow/wits | strong: choose two of {mark progress, +2 momentum, +1 on next} • weak: choose one • miss: in bad spot, Pay the Price |
| React Under Fire | +edge/heart/iron/shadow/wits | strong: succeed, +1 momentum, in control • weak: succeed at suffer (−1), stay in bad spot • miss: Pay the Price |
| Strike | +iron close / +edge ranged | strong: **mark progress twice**, stay in control • weak: mark twice, exposed (bad spot) • miss: bad spot, Pay the Price |
| Clash | +iron close / +edge ranged | strong: **mark progress twice**, in control • weak: mark once, counterblow, stay in bad spot, Pay the Price • miss: bad spot, Pay the Price |
| **Take Decisive Action** | progress vs. challenge | If in bad spot, downgrade results one step. strong: prevail +1 momentum • weak: prevail at cost (d100 mini-table) • miss: defeated, Pay the Price |
| Face Defeat | — | Abandon objective; Pay the Price; if any objectives remain, fight continues |
| Battle | +edge/heart/iron/shadow/wits | strong: unconditional, +2 momentum to participants • weak: succeed, Pay the Price • miss: defeated, Pay the Price |

#### Suffer moves (6)

| Move | Roll | Outcome essentials |
|---|---|---|
| Lose Momentum | — | suffer −1/−2/−3 momentum (minor/serious/major). If at min (−6), apply to another suffer move or clear progress per rank |
| Endure Harm | +health **or** +iron (whichever higher) | −1/−2/−3 health; at 0 also Lose Momentum by the remainder. Resist roll: strong → +1 health or +1 momentum • weak → trade or press on • miss → extra −1 health or Lose Momentum (−2); at 0 mark wounded/permanently harmed or roll the **mortal-wound d100** |
| Endure Stress | +spirit **or** +heart (whichever higher) | Symmetric to Endure Harm against spirit; miss at 0 marks shaken/traumatized or rolls the **desolation d100** |
| Companion Takes a Hit | +companion health | −1/−2/−3 companion health; resist analogously; **miss + match at 0 health → companion dies/destroyed; discard the asset** |
| Sacrifice Resources | — | suffer −1/−2/−3 supply. At 0 mark unprepared; further losses redirect to another suffer move |
| Withstand Damage | +integrity | −1/−2/−3 integrity on the vehicle; at 0 apply the **vehicle-damage d100** by vehicle type (command / support / incidental); command vehicle destruction triggers Overcome Destruction |

#### Threshold moves (3)

| Move | Roll | Outcome essentials |
|---|---|---|
| Face Death | +heart | strong: cast back • weak: noble sacrifice (die) **or** Swear extreme vow + mark **doomed** • miss: dead |
| Face Desolation | +heart | strong: press on • weak: noble sacrifice **or** Swear extreme vow + mark **tormented** • miss: lost |
| **Overcome Destruction** | progress vs. bonds legacy | strong: favour called in • weak: must mark **indebted** + Swear extreme vow • miss: as weak but against your nature/forces other Forsake. Award XP per marked ability on discarded assets (min 3) |

#### Recover moves (5)

| Move | Roll | Outcome essentials |
|---|---|---|
| Sojourn | +heart | strong: pick two recover moves as automatic strong hits (community) • weak: one each (limit 3 group) • miss: community demand or Pay the Price |
| Heal | +iron / +iron-or-wits / +heart / +wits (situation) | strong: clear wounded + take/give +2 health, else +3 • weak: as strong, Lose Momentum (−2) or Sacrifice Resources (−2) • miss: Pay the Price |
| Hearten | +heart | strong: clear shaken + +1 spirit, else +2; +1 more if part of Sojourn • weak: as strong, Lose Momentum (−1) • miss: Pay the Price |
| Resupply | +heart/iron/shadow/wits | strong: clear unprepared + +1 supply, else +2; may acquire a specific item + +1 momentum • weak: as strong with cost • miss: Pay the Price |
| Repair | +wits or +supply | Earn repair points (facility 5/3, field 3/1, under fire 2/0). Optional trade: −1 supply ↔ +1 point (max 3). Spend: 2 pts clear battered / fix module, 1 pt +1 integrity or +1 mechanical-companion health, 3 pts repair any other device (2 with complication). miss: Pay the Price |

#### Legacy moves (3)

| Move | Roll | Outcome essentials |
|---|---|---|
| Earn Experience | — | +2 XP per legacy box filled (+1 once a track is cleared) |
| Advance | — | Spend 3 XP for a new asset, 2 XP to upgrade. Categories: Module, Support Vehicle, Path, Companion, Deed |
| **Continue a Legacy** | progress vs. each former-character legacy track | per strong: inherit a path/companion, share a connection, or accept the command vehicle • per weak: see-it-through, rebuild a connection, or explore familiar ground • per miss: deal with the aftermath, switch loyalties, or open Pandora's box |

#### Fate moves (2)

| Move | Roll | Outcome essentials |
|---|---|---|
| Ask the Oracle | d100 (yes/no) or table | Four modes: *Draw a conclusion*, *Spark an idea*, *Yes/no with odds* (Small Chance ≤10 / Unlikely ≤25 / 50-50 ≤50 / Likely ≤75 / Almost Certain ≤90), *Pick two*. On a match envision an extreme result or twist |
| Pay the Price | — | Choose: obvious negative, Ask the Oracle, or roll the **Pay the Price d100** (16 entries) |

### 1.4 Tables defined by the play kit

| Table | Where rolled | Entries |
|---|---|---|
| Spotlight Vignette | Begin a Session (optional) | 10 |
| Take Decisive Action — weak hit cost | Combat | 6 |
| Mortal Wound | Endure Harm miss at 0 health | 5 |
| Desolation | Endure Stress miss at 0 spirit | 4 |
| Vehicle Damage | Withstand Damage miss at 0 integrity | 10 |
| Make a Discovery | Strong hit + match on Explore a Waypoint | 25 |
| Confront Chaos | Miss + match on Explore a Waypoint | 25 |
| Pay the Price | Pay the Price (fate move) | 16 |

### 1.5 Worksheets in the play kit

- **Character sheet** — stats, meters, momentum, legacy tracks, impacts, vehicle.
- **Sector worksheet** — region, faction/control, map grid, locations list.
- **Connections worksheet** — bond status, name, location, two roles, rank.
- **Progress tracks worksheet** — 10-box trackers.
- **Oracles worksheet** — blank d4/d6/d8/d10 grids for player-defined oracles.
- **Clocks worksheet** — 4/6/8-segment clocks; campaign or tension type.
- **Scene challenges worksheet** — see rulebook pp. 239–241.

### 1.6 Safety tools

- **Lines (hard)** / **Veils (soft)** are implicit in the playkit ("flagged
  content"); they appear explicitly in the rulebook.
- **Set a Flag** declares content to approach mindfully.
- **Change Your Fate** is the in-game lever for renegotiating flagged content
  with five options (Reframe, Refocus, Replace, Redirect, Reshape).
- **Take a Break** is mandatory after a progress move or intense scene.
- *(X-Card is a community-standard safety tool not specified by the play kit.)*

---

## Part 2 — Code Coverage Map

Every feature above mapped onto the source tree. Status legend: ✅ matches
rules, 🔄 partial (declared/recognised but mechanics or UI incomplete), ❌
missing.

### 2.1 Core resolution

| Rule | Status | Pathway |
|---|---|---|
| 5 stats read from actor | ✅ | `src/character/actorBridge.js:70-75` |
| 3 condition meters read/written | ✅ | `src/character/actorBridge.js:78-202`; wounded caps health to 4, shaken caps spirit to 3 (lines 180–181) |
| Momentum read/clamped to reset/max | ✅ | `src/character/actorBridge.js:206-209` |
| Action roll, strong/weak/miss | ✅ | `src/moves/resolver.js:61-76` |
| Match detection (both challenge dice equal) | ✅ | `src/moves/resolver.js:65` |
| All 7 outcome types (3 base × match ± burn) | ✅ | `src/moves/resolver.js` outcome resolution + `src/moves/burnMomentum.js` |
| Burn momentum eligibility & application | ✅ | `src/moves/burnMomentum.js:62-238`; `src/moves/resolver.js:127-157` (correctly blocks progress moves, requires positive momentum, requires outcome improvement) |
| Progress score = filled boxes only, no burn, assets ignored | ✅ | `src/ui/progressTracks.js:131-146` (`score = floor(ticks / 4)`) |
| Rank multipliers (troublesome 12 / dangerous 8 / formidable 4 / extreme 2 / epic 1 ticks per mark) | ✅ | `src/ui/progressTracks.js:36-42` and `src/schemas.js:40-46` |
| Move pattern-matching from natural language | ✅ | `src/moves/interpreter.js` routes all 51 moves via Haiku interpretation, then maps to `MOVES` table at `src/schemas.js:81-155` |

### 2.2 Per-move implementation

All 51 moves are recognised and routed by `src/moves/interpreter.js` and have
mechanical handlers in `src/moves/resolver.js`. The table below shows where
to find each move's resolver branch.

| Category | Resolver lines | Coverage |
|---|---|---|
| Session (5) | `src/moves/resolver.js:224-237` | all 5 recognised — narrative-only handlers, no UI flow (see §3) |
| Adventure (6) | `src/moves/resolver.js:242-311` | all 6 mechanically resolved |
| Quest (4) | `src/moves/resolver.js:317-349` | all 4; Fulfill Your Vow is a progress move |
| Connection (4) | `src/moves/resolver.js:354-391` | all 4; Make a Connection seeds role/goal/first-look/given-name oracles (`src/moves/resolver.js:856-875`) |
| Exploration (6) | `src/moves/resolver.js:397-455` | all 6; explore_a_waypoint dispatches to Make a Discovery on strong+match and Confront Chaos on miss+match (`src/moves/resolver.js:408-455`) |
| Combat (8) | `src/moves/resolver.js:460-541` | all 8; combat positioning exposed via otherEffect text only (see §3) |
| Suffer (6) | `src/moves/resolver.js:547-601` | all 6 |
| Recover (5) | `src/moves/resolver.js:606-658` | all 5; Repair points/spends not auto-applied to vehicle integrity (advice only) |
| Threshold (3) | `src/moves/resolver.js:664-695` | all 3; Overcome Destruction rolls against bonds legacy track |
| Legacy (3) | `src/moves/resolver.js:701-720` | all 3; XP awards persisted (`src/moves/persistResolution.js:187-203`) |
| Fate (2) | `src/moves/resolver.js:726-734` | both recognised — see §2.4 for gaps |

### 2.3 Character & progress mechanics

| Rule | Status | Pathway |
|---|---|---|
| Legacy tracks (quests, bonds, discoveries) | ✅ | `src/schemas.js:283-287`, `src/moves/persistResolution.js:166-203` |
| Earn XP on box fill (2 XP, 1 after first clear) | ✅ | `src/character/actorBridge.js:244-256`; `src/moves/persistResolution.js:200-201` |
| Vows persisted as `progress` items on the actor | ✅ | `src/character/actorBridge.js:347-355` (`createCharacterVowItem`) |
| Connections mirrored as bond items | ✅ | `src/character/actorBridge.js:328-336` (`createCharacterBondItem`) |
| Connection role/rank/bond, second-role on Bond | ✅ | `src/entities/connection.js:371-379` |
| Vehicle integrity read for Withstand Damage | ✅ | `src/moves/statEnrichment.js` (`integrity` stat) |
| Companion-health stat | 🔄 | `src/moves/statEnrichment.js:133-197` — heuristic picks highest-health enabled Companion asset; multi-companion warning but no player picker |
| Auto-mark wounded/shaken/unprepared on meter = 0 | ✅ | `src/moves/persistResolution.js:129-159` |
| Mortal-wound / desolation / vehicle-damage tables | ❌ | Surfaced as text choices in `otherEffect` only — no roller |
| All 10 impacts auto-marked from move outcomes | 🔄 | Only wounded/shaken/unprepared automated; other 7 surface as text choices for manual marking |
| Chronicle records narrative beats | ✅ | `src/character/chronicle.js`, `src/character/chronicleWriter.js`, `src/character/chroniclePanel.js`; entry types `revelation / relationship / vow / scar / legacy / annotation` |

### 2.4 Oracles, fate, and consequence tables

| Rule | Status | Pathway |
|---|---|---|
| Oracle table registry & roller | ✅ | `src/oracles/roller.js:41-159` (~120 RG tables: core, space, planets, settlements, starships, characters, creatures, factions, derelicts, vaults, themes, misc) |
| Ask the Oracle — Spark an idea | ✅ | `src/moves/resolver.js:912-921` (action + theme seed) |
| Ask the Oracle — Draw a conclusion | 🔄 | Implicit (no roll required); no UI mode selector |
| Ask the Oracle — **Yes/no with odds** | ❌ | `ORACLE_ODDS` constant declared at `src/schemas.js:218-224` but no consumer; no roller, no UI |
| Ask the Oracle — **Pick two** | ❌ | not implemented |
| Match → "extreme result or twist" on yes/no | ❌ | no yes/no path exists |
| **Pay the Price** d100 (play-kit, 16 entries) | ❌ | not present; closest analogue is `STORY_COMPLICATION` (RG table) at `src/oracles/tables/misc.js:8-38` (29 entries) but this is a different table and is not auto-rolled on Pay the Price |
| **Make a Discovery** d100 (play-kit, 25 entries) | ❌ | substituted with paired descriptor + focus oracle (`src/moves/resolver.js:889-896`) |
| **Confront Chaos** d100 (play-kit, 25 entries) | ❌ | substituted with paired action + theme oracle (`src/moves/resolver.js:902-910`) |
| **Take Decisive Action** weak-hit d100 (6 entries) | ❌ | not present |
| **Spotlight Vignette** d100 (Begin a Session, 10 entries) | ❌ | not present; `begin_a_session` returns `momentumChange: 1` text only |
| `STORY_COMPLICATION`, `STORY_CLUE`, `ANOMALY_EFFECT`, `COMBAT_ACTION`, `SECTOR_TROUBLE` | ✅ | `src/oracles/tables/misc.js` (RG tables, not in play kit) |

### 2.5 Sector, world, and connection mechanics

| Rule | Status | Pathway |
|---|---|---|
| Sector creation (name, region, settlements, passages) | ✅ | `src/sectors/sectorGenerator.js`, `sectorPanel.js`, `sectorOverview.js`; 11-step wizard (scope: `docs/sector-creator-scope.md`) |
| Sector faction / control field | 🔄 | `src/sectors/sectorGenerator.js:103` initialises `faction: null` and displays it; no oracle generates faction control |
| Locations / settlements / planets / ships / creatures / factions as entities | ✅ | `src/entities/*.js`, registry at `src/entities/registry.js` |
| Connection bond + name + location + two roles + rank | ✅ | `src/entities/connection.js:18-22, 371-379` |
| Progress tracks worksheet (vow/expedition/connection/combat/scene_challenge) | ✅ | `src/schemas.js:183`, `src/ui/progressTracks.js:44-49` |
| Bond legacy ticks on Develop Your Relationship (when bonded) | 🔄 | resolver acknowledges; no automated tick on bonds legacy when developing a bonded connection |

### 2.6 Safety, scene, and session lifecycle

| Rule | Status | Pathway |
|---|---|---|
| Lines (hard) / Veils (soft), global + private | ✅ | `src/context/safety.js:38-62`; UI in `src/ui/settingsPanel.js:136-150` |
| X-Card (community standard) — `!x` | ✅ | `src/index.js:1439` `handleXCardCommand`; suppresses scene |
| Set a Flag — UI / chat command | ❌ | move recognised at `src/schemas.js:84`; no flag-setting dialog or surface |
| Change Your Fate — 5-option chooser | ❌ | move recognised at `src/schemas.js:85`; no UI for Reframe / Refocus / Replace / Redirect / Reshape |
| Take a Break — Move on / Stop for now | ❌ | move recognised at `src/schemas.js:86`; no prompt |
| Begin a Session — flag review, recap, spotlight vignette | 🔄 | recap auto-runs (`previously-on-scope.md`); no flag-review prompt; no vignette table |
| End a Session — milestone reminder, focus capture, +1 momentum | 🔄 | move returns `momentumChange: 1` text; no UI to set `questFocus` / `connectionFocus` (fields exist at `src/schemas.js:562-563`) |
| Scene start / end (Fact Continuity scene markers) | ✅ | `!scene start|end` at `src/index.js:1011-1066`, `src/factContinuity/sceneLifecycle.js` |

### 2.7 Clocks and scene challenges

| Rule | Status | Pathway |
|---|---|---|
| Clocks (4/6/8-segment, campaign or tension) | ❌ (schema only) | `ClockSchema` declared at `src/schemas.js:429-444`; `clockIds: []` at `src/schemas.js:640`; no creation UI, no advance roll, no advance-on-Begin-Session, no advance-on-Pay-the-Price |
| Scene Challenges worksheet (rulebook pp. 239–241) | ❌ (schema only) | `scene_challenge` listed in `TRACK_TYPES` (`src/schemas.js:183`) and a `sceneChallenge.tensionClockId` field exists on the progress track (`src/schemas.js:346-349`); no dedicated UI, no challenge setup walkthrough, no clock-advance integration |
| Custom oracle tables (the oracle worksheet) | ❌ | `ORACLE_TABLES` is a hardcoded const at `src/oracles/roller.js:41`; no API to register player-defined tables |

### 2.8 Chat commands & toolbar (UI surface inventory)

Chat commands (all routed via `createChatMessage` hook at `src/index.js:366`):

| Command | Handler line | Audience |
|---|---|---|
| `!x` | `src/index.js:1439` | anyone (X-Card) |
| `@scene <q>` | `src/index.js:373` (auto-route to narrator) | anyone |
| `!at [entity]` | `src/index.js:1471` | GM |
| `!sector new|list|<name>` | `src/index.js:1516` | GM (`new`) |
| `!journal <type> "<name>"` | `src/index.js:1206` | GM |
| `!lore` | `src/index.js:444` | GM |
| `!recap [session|campaign [N]]` | `src/index.js:468` | GM |
| `!truths` | `src/index.js:434` | GM |
| `!pace hot|quiet|clear|status` | `src/index.js:1339` | GM |
| `!roll` | `src/index.js:1363` | GM (NWMA recovery) |
| `!scene start|end` | `src/index.js:1011` | GM |
| `!truth strike|set …` | `src/index.js:1066` | mixed (GM-asserted) |
| `!state strike|set …` | `src/index.js:1066` | mixed |
| `!encounter <name>` | `src/index.js:457` (approx) | GM |
| `!migrate-entities` | `src/index.js:490` (approx) | GM |
| `\\ <text>` | bypass pacing pipeline | anyone |

Toolbar buttons (registered at `src/index.js:1824` `getSceneControlButtons`,
wired at `src/index.js:1902` `renderSceneControls`):

| Button | App class | GM-only |
|---|---|---|
| Progress Tracks | `src/ui/progressTracks.js:192` | no |
| Entities | `src/ui/entityPanel.js:173` | no |
| Character Chronicle | `src/character/chroniclePanel.js:40` | no |
| Companion Settings | `src/ui/settingsPanel.js:668` | yes |
| Sector Creator | `src/sectors/sectorPanel.js:31` | yes |
| World Journal | `src/world/worldJournalPanel.js:41` | yes |
| World Truths | `src/ui/settingsPanel.js` (dialog) | yes |

---

## Part 3 — Mismatches & Gaps

Ordered by severity. Each item names the rule, the symptom, and the file/line
of the offending or missing code.

### 3.1 Bugs (rules are wrong in code)

**3.1.1 Momentum reset formula is inverted.**
`src/character/actorBridge.js:84` and the duplicate at `src/character/actorBridge.js:178`:

```js
momentumReset: condCount === 0 ? 0 : Math.max(-2, -condCount),
```

Per the play kit (p. 1) and `docs/ironsworn-api-scope.md:191-193` (RESET_MIN
= 0; reset = `momentum.resetValue − impactCount` clamped to floor 0), the
correct values are 0 impacts → +2, 1 → +1, 2+ → 0. Current code returns 0 →
0, 1 → −1, 2+ → −2. This corrupts momentum clamping at line 206 and the
post-burn target at `src/moves/burnMomentum.js:215-238`. Suggested fix:

```js
momentumReset: Math.max(0, 2 - condCount),
```

…and remove the special-case for `condCount === 0`. Apply the same fix at
line 178.

**3.1.2 `CONDITION_DEBILITIES` filter excludes 6 impacts that should reduce
max momentum.**
`src/character/actorBridge.js:11`:

```js
const CONDITION_DEBILITIES = ['wounded', 'shaken', 'unprepared', 'encumbered'];
```

Per the play kit (p. 1, "MAX MOMENTUM: STARTS AT +10 / REDUCE BY 1 FOR EACH
IMPACT") and confirmed in `docs/ironsworn-api-scope.md:212` ("ALL impacts
reduce momentumMax and momentumReset — the `#impactCount` getter counts all
true values in `system.debility`. Do not filter by category"). Battered,
cursed, doomed, tormented, indebted, permanently_harmed, and traumatized
currently do **not** reduce max momentum or reset. Suggested fix: count
every `true` flag returned by `readDebilities` (excluding the non-canonical
extras called out in 3.1.3), or — preferred — use the system's computed
`actor.system.momentumMax` and `actor.system.momentumReset` getters and
delete the local recompute.

**3.1.3 `readDebilities` invents 5 fields that don't exist in the canonical
schema.**
`src/character/actorBridge.js:139-153` reads `corrupted`, `encumbered`,
`maimed`, `custom1`, `custom2`. None of these appear in `IMPACTS` at
`src/schemas.js:197-202` (which matches the play-kit list of 10). They are
either leftovers from Ironsworn (the classic game) or speculative. Read
them at most for forward-compat, but do not include them in the momentum
calculation. `encumbered`, in particular, is currently counted toward
momentum and is wrong.

### 3.2 Missing tables (play-kit content not in code)

| Table | Used by | Suggested home |
|---|---|---|
| Pay the Price d100 (16 entries) | `pay_the_price` resolver branch (`src/moves/resolver.js:731`) | new `src/oracles/tables/payThePrice.js`, registered in `ORACLE_TABLES` |
| Begin a Session — Spotlight Vignette d100 (10 entries) | new Begin-a-Session flow (see 3.4.1) | `src/oracles/tables/session.js` |
| Make a Discovery d100 (25 entries) | `make_a_discovery` resolver branch (`src/moves/resolver.js:447-450`) | `src/oracles/tables/discovery.js` |
| Confront Chaos d100 (25 entries) | `confront_chaos` resolver branch (`src/moves/resolver.js:452-455`) | `src/oracles/tables/chaos.js` |
| Take Decisive Action weak-hit d100 (6 entries) | `take_decisive_action` resolver branch (`src/moves/resolver.js:516-525`) | extend `src/moves/resolver.js` or `src/oracles/tables/combat.js` |
| Endure Harm mortal-wound d100 (5 entries) | `endure_harm` miss-at-0 branch (`src/moves/resolver.js:552-560`) | `src/oracles/tables/suffer.js` |
| Endure Stress desolation d100 (4 entries) | `endure_stress` miss-at-0 branch (`src/moves/resolver.js:563-571`) | `src/oracles/tables/suffer.js` |
| Withstand Damage vehicle-damage d100 (10 entries) | `withstand_damage` miss-at-0 branch (`src/moves/resolver.js:574-582`) | `src/oracles/tables/suffer.js` |

### 3.3 Missing mechanics

**3.3.1 Yes/No oracle with odds.**
`ORACLE_ODDS` exists at `src/schemas.js:218-224` but has no consumer. Need a
`rollYesNo(odds)` function, match detection on both rolled d10s (extreme
twist), and a chat surface (e.g. `!oracle yes|no <odds> [question]`) or
panel control. Touch point: `src/oracles/roller.js`, `src/index.js`.

**3.3.2 "Mark progress twice" on Strike and Clash strong hits. — FIXED**
`combatProgress: 2` consequence on strike/clash strong (and weak) hits drives
`applyCombatProgress({ markCount: 2 })` in the GM-gated pipeline handler.
`src/moves/combat.js`, wired in `src/index.js`.

**3.3.3 Combat positioning not persisted. — FIXED**
`combatPosition` from resolver consequences is now written to the active combat
track via `setCombatTrackPosition` after every combat move resolution. The panel
reads and toggles `combatState` on the track object. `src/ui/progressTracks.js`.
Take Decisive Action reads back via `getActiveCombatPosition()` (unchanged).

**3.3.4 Higher-of-two-stat selection not dynamic for Endure Harm / Stress.**
The play kit says "roll +health **or** +iron, whichever is higher" (and
spirit/heart for Endure Stress). `src/schemas.js:129-130` declares the stat
options but `src/moves/resolver.js:552, 563` does not pick the higher; the
player gets whatever stat was chosen by the interpreter. Either pre-resolve
the higher in `statEnrichment.js` or add a stat picker in the confirm dialog.

**3.3.5 Develop Your Relationship — bond legacy ticks when bonded.**
Per rules, once bonded, Develop Your Relationship rolls +rank against
challenge dice and on a strong hit marks 2 ticks on the bonds legacy track
(extra: a match raises rank by 1). `src/moves/resolver.js:365-369` does not
implement this branch.

**3.3.6 Vehicle Repair point spends not applied automatically.**
`src/moves/resolver.js:650-658` surfaces the points table but no code
applies "+1 integrity" / "clear battered" / "fix module" to the vehicle
actor.

### 3.4 Missing UI / chat surface for declared moves

| Move | What's missing |
|---|---|
| **3.4.1 Begin a Session** | A panel or chat flow that: (a) lists flagged content for review, (b) shows the last-session recap (already auto-posts), (c) offers an optional spotlight vignette roll for +1 momentum to all players |
| **3.4.2 End a Session** | A dialog that prompts for `questFocus` / `connectionFocus`, awards +1 momentum if either is set, posts a milestone reminder |
| **3.4.3 Set a Flag** | A flag-creation dialog feeding into `safety.js` (or a parallel `flags` store) |
| **3.4.4 Change Your Fate** | A 5-option chooser (Reframe / Refocus / Replace / Redirect / Reshape); could be a `DialogV2` and a `!fate <option> <reason>` chat command |
| **3.4.5 Take a Break** | Mandatory prompt after progress-move resolution or scene end (already detected via `endScene`); offers "Move on (+1 next non-progress)" or "Stop for now (End a Session)" |
| **3.4.6 Background Vow** | No UI to read/write the character-sheet background vow; the foundry-ironsworn sheet has the field but this module does not surface it in the chronicle or assembler |

### 3.5 Worksheets / extensibility

| Worksheet | Status | Notes |
|---|---|---|
| Clocks | ❌ | schema exists (`src/schemas.js:429-444`); needs creation panel, advance roll, and Begin-a-Session / Pay-the-Price advance hooks |
| Scene Challenges | ❌ | schema fields exist (`src/schemas.js:346-350`); needs a setup walkthrough and tension-clock binding |
| Custom oracle tables | ❌ | `ORACLE_TABLES` is hardcoded; player-defined d4/d6/d8/d10 grids cannot be added without a code change |

### 3.6 Recap of what is solid

To be clear about what is *not* a gap:

- All 51 move names parse and route correctly from natural language.
- All 7 outcome types (3 base × match ± burn) resolve.
- Burn momentum logic correctly blocks progress moves, requires positive
  momentum, and only fires when it improves the outcome. *(Reset value
  depends on the bridge bug above — fix 3.1.1 and the burn is correct.)*
- Progress tracks correctly tally filled boxes only and resolve against 2d10
  with no momentum burn and no asset adds.
- Rank multipliers for marking progress are correct.
- Legacy XP awards (2 / 1 after first clear) work end-to-end.
- The chronicle, world journal, fact continuity, sector creator, mischief
  dial, pacing classifier, lines-and-veils safety, X-Card, narrator, and the
  ~120 RG oracle tables are all wired and tested.

---

## Document maintenance

This file is a snapshot taken on 2026-05-17 against branch
`claude/document-game-rules-7KrzY`. Update when:

- A new move-resolver branch is added or rewritten (Part 2.2).
- An oracle table is added to `src/oracles/tables/` (Part 2.4).
- A bug listed in Part 3 is fixed (move it to the "what is solid" recap).
- The play kit is reissued (Tomkin updates: confirm the move list and
  table contents against the new PDF).

Source PDF: *Ironsworn: Starforged Playkit*, Shawn Tomkin, ©2022, updated
January 2023. CC BY 4.0. Original at https://www.ironswornrpg.com.
