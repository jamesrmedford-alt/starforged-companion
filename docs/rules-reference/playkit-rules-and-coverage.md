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
| Sacrifice Resources | — | suffer −1/−2/−3 supply. At 0 mark unprepared (with every ally sharing the supply); a loss of resources while unprepared goes to a different suffer move |
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
| Heal | +iron / +iron-or-wits (whichever lower — the interpreter names the situation, issue #330 D4) / +heart / +wits (situation) | strong: clear wounded + take/give +2 health, else +3 • weak: as strong, Lose Momentum (−2) or Sacrifice Resources (−2) • miss: Pay the Price |
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
mechanical handlers in `src/moves/resolver.js` — and so do the rulebook's
scene-challenge moves (§2.7). The table below shows where
to find each move's resolver branch.

| Category | Resolver lines | Coverage |
|---|---|---|
| Session (5) | `src/moves/resolver.js:224-237` | all 5 recognised; their flows are the session dialogs (`!begin-session`, `!end-session`, `!flag`, `!fate`, `!break` — §2.6) |
| Adventure (6) | `src/moves/resolver.js:242-311` | all 6 mechanically resolved |
| Quest (4) | `src/moves/resolver.js:317-349` | all 4; Fulfill Your Vow is a progress move |
| Connection (4) | `src/moves/resolver.js:354-391` | all 4; Make a Connection seeds role/goal/first-look/given-name oracles (`src/moves/resolver.js:856-875`) |
| Exploration (6) | `src/moves/resolver.js:397-455` | all 6; explore_a_waypoint dispatches to Make a Discovery on strong+match and Confront Chaos on miss+match (`src/moves/resolver.js:408-455`); a miss without a match routes Pay the Price (issue #321 U17) |
| Combat (8) | `src/moves/resolver.js:460-541` | all 8; each move's position is written to its fight (`setCombatTrackPosition` / `applyCombatPositionToTrack` — §3.3.3) |
| Suffer (6) | `src/moves/resolver.js:547-601` | all 6 |
| Recover (5) | `src/moves/resolver.js:606-658` | all 5; Repair's points are spent through `!repair` (`applyRepairSpends`, `src/moves/repair.js` — +1 integrity, clear battered and the supply trade applied; the module / companion / device spends recorded on the card — §3.3.6) |
| Threshold (3) | `src/moves/resolver.js:664-695` | all 3; Overcome Destruction rolls against bonds legacy track |
| Legacy (3) | `src/moves/resolver.js:701-720` | all 3; legacy ticks and their box XP land through `addLegacyTicks` (`src/index.js`) — the old `persistResolution` legacy path was dead and was deleted (2026-10) |
| Fate (2) | `src/moves/resolver.js:726-734` | both recognised — see §2.4 for gaps |

### 2.3 Character & progress mechanics

| Rule | Status | Pathway |
|---|---|---|
| Legacy tracks (quests, bonds, discoveries) | ✅ | `campaignState.legacyTracks` (`CampaignStateSchema`, `src/schemas.js`); every write goes through `addLegacyTicks` (`src/index.js`); filling the tenth box clears the track, which starts again with the overflow and counts its cycles (`src/moves/legacyTracks.js`, issue #316 T02) |
| Earn XP on box fill (2 XP, 1 after first clear) | ✅ | `addLegacyTicks` marks the shared track (LEGACY-XP-DEAD fix) — each box at the rate of the cycle it filled in: 2 XP, then 1 once the track has cleared (issue #316 T02) — and, once saved, writes it through to every PC's sheet (`system.legacies.<track>`, `src/multiplayer/sharedLegacies.js`), whose Legacies tab derives and spends the XP (issue #326 D3) |
| Vows persisted as `progress` items on the actor | ✅ | `src/character/actorBridge.js:347-355` (`createCharacterVowItem`) |
| Connections mirrored as bond items | ✅ | `src/character/actorBridge.js:328-336` (`createCharacterBondItem`) |
| Connection role/rank/bond, second-role on Bond | ✅ | `src/entities/connection.js:371-379` |
| Vehicle integrity read for Withstand Damage | ✅ | `src/moves/statEnrichment.js` (`integrity` stat): the command vehicle's ship record, or — when the move's target names one of the roller's support vehicles (an asset with its own Integrity track: Hoverbike, Rover, Skiff …) — that asset's track (a null target is the starship's, whatever the line mentions — issue #345 AA14); its choices change the vehicle rolled for and its Battered gates the +1 (`vehicleItemId` → `actorBridge.applyVehicleAssetIntegrityChange`, issue #342 Z53: every roll was the starship's). The at-0 vehicle-type cost stays card text; the damage the vehicle cannot take at 0 (a miss's "-1 integrity") is the roller's momentum, as harm past 0 health is (`sufferDialog` `lossPastZero`, issue #345 AA15) |
| Companion-health stat | 🔄 | `src/moves/statEnrichment.js` — the companion the move's target, else the line, names (issue #345 AA45); with none named, the highest-health enabled Companion asset, and with several a notice that naming the companion picks it — no player picker. A move an asset lets you roll "+its health" (Survey Bot, Combat Bot, Banshee …) rolls that companion's own health (issue #345 AA10). The harm a companion at 0 cannot take (a miss's "-1 companion health") is the roller's momentum (issue #345 AA15) |
| Auto-mark wounded/shaken/unprepared on meter = 0 | ✅ | `src/moves/persistResolution.js:129-159` |
| Mortal-wound / desolation / vehicle-damage tables | ✅ | A harm or stress step that reaches 0 owes the resist roll — a card that rolls Endure Harm / Stress as the PC (issue #330 D3); that roll's miss at 0 posts a choice card — mark the impact, mark the lasting one (permanently harmed / traumatized), or roll the table (`rollImpactTable`) — the player's one choice (`src/moves/sufferExecutor.js`, issue #329 X03), whichever miss option was taken ("-1 health" or "Lose Momentum (-2)" — ENDURE-ZERO-ON-OTHER-OPTION); Withstand Damage at 0 rolls the vehicle-damage d100 |
| All 10 impacts auto-marked from move outcomes | 🔄 | Only wounded/shaken/unprepared automated; other 7 surface as text choices for manual marking |
| Chronicle records narrative beats | ✅ | `src/character/chronicle.js`, `src/character/chronicleWriter.js`, `src/character/chroniclePanel.js`; entry types `revelation / relationship / vow / scar / legacy / annotation` |

### 2.4 Oracles, fate, and consequence tables

| Rule | Status | Pathway |
|---|---|---|
| Oracle table registry & roller | ✅ | `src/oracles/roller.js:41-159` (~120 RG tables: core, space, planets, settlements, starships, characters, creatures, factions, derelicts, vaults, themes, misc) |
| Ask the Oracle — Spark an idea | ✅ | `src/moves/resolver.js:912-921` (action + theme seed) |
| Ask the Oracle — Draw a conclusion | 🔄 | Implicit (no roll required); no UI mode selector |
| Ask the Oracle — **Yes/no with odds** | ✅ | `rollYesNo(odds)` (`src/oracles/roller.js` — yes at ≤ 10 / 25 / 50 / 75 / 90 over `ORACLE_ODDS`); `!oracle yes [odds] [question]` (`src/index.js`); campaign clocks roll their odds with it (`src/clocks/clocks.js`) |
| Ask the Oracle — **Pick two** | ❌ | not implemented |
| Match → "extreme result or twist" on yes/no | ✅ | `rollYesNo` flags a match (tens = ones, 100 as 00) and the `!oracle yes` card marks it "MATCH — extreme/twist" (also in RECENT ORACLE RESULTS) |
| **Pay the Price** d100 (play-kit, 16 entries) | ✅ | `pay_the_price` (`src/oracles/tables/payThePrice.js`): rolled once for a result that routes it (the move's card, `postMovePayThePriceCard`, its suffer entries dispatched — issue #321 U03) and by `!pay-the-price` |
| **Make a Discovery** d100 (play-kit, 25 entries) | ✅ | `make_a_discovery` (`src/oracles/tables/discoveryAndChaos.js`), the move's own roll (`buildOracleSeeds`, with a descriptor + focus prompt beside it) |
| **Confront Chaos** d100 (play-kit, 25 entries) | ✅ | `confront_chaos` (`src/oracles/tables/discoveryAndChaos.js`), the move's own roll (`buildOracleSeeds`, with an action + theme prompt beside it) |
| **Take Decisive Action** weak-hit d100 (6 entries) | ✅ | `decisive_action_cost` (`src/oracles/tables/sufferAndCombat.js`), rolled on the weak hit's card (`postDecisiveActionCostCard`, `src/index.js`) |
| **Spotlight Vignette** d100 (Begin a Session, 10 entries) | ✅ | `spotlight_vignette` (`src/oracles/tables/sessionVignette.js`), the Begin a Session dialog's optional roll (+1 momentum to every PC — §2.6) |
| `STORY_COMPLICATION`, `STORY_CLUE`, `ANOMALY_EFFECT`, `COMBAT_ACTION`, `SECTOR_TROUBLE` | ✅ | `src/oracles/tables/misc.js` (RG tables, not in play kit) |

### 2.5 Sector, world, and connection mechanics

| Rule | Status | Pathway |
|---|---|---|
| Sector creation (name, region, settlements, passages) | ✅ | `src/sectors/sectorGenerator.js`, `sectorPanel.js`, `sectorOverview.js`; 11-step wizard (scope: `issue #218 (Sector Creator)`); step 8 zooms in on the starting settlement — first look, initial contact and trouble rolled for `settlements[0]` (issue #321 U50) |
| Sector faction / control field | 🔄 | `src/sectors/sectorGenerator.js:103` initialises `faction: null` and displays it; no oracle generates faction control |
| Locations / settlements / planets / ships / creatures / factions as entities | ✅ | `src/entities/*.js`, registry at `src/entities/registry.js` |
| Connection bond + name + location + two roles + rank | ✅ | `src/entities/connection.js:18-22, 371-379` |
| Progress tracks worksheet (vow/expedition/connection/combat/scene_challenge) | ✅ | `TRACK_TYPES` / `PANEL_TRACK_TYPES` in `src/ui/progressTracks.js` (the unused `schemas.js` `TRACK_TYPES` copy was deleted in 2026-10) |
| Bond legacy ticks on Develop Your Relationship (when bonded) | ✅ | `developRelationship.js` + pipeline: bonded → `BONDED_DEVELOP_OUTCOMES`, shared with `!bond` (strong 2 bonds-legacy ticks / weak +2 momentum / miss nothing; a strong hit with a match raises rank — issue #322 V01); un-bonded → connection track |

### 2.6 Safety, scene, and session lifecycle

| Rule | Status | Pathway |
|---|---|---|
| Lines (hard) / Veils (soft), global + private | ✅ | `formatSafetyContext` (`src/context/safety.js`) from `campaignState.safety`, synced from the Settings panel by `syncSafetyToCampaignState` (`src/ui/settingsPanel.js`). A player's Private Lines relay to the canonical GM (`safety.syncPrivateLines` → `applyPrivateLinesSync`; re-sent when the GM's relay announces it is ready). The shared narrator prompt carries the global Lines / Veils only; a player's Private Lines are injected into that player's Private Channel context (they are never broadcast) |
| X-Card (community standard) — `!x` | ✅ | Typed `!x` is intercepted on the typist's client before the message is created (`registerXCardHook`, `src/ui/settingsPanel.js`) → `playXCard` (`src/context/safety.js`) relays `xcard.activate` to the canonical GM (`suppressScene` sets `campaignState.xCardActive`) and posts the X-Card card, which says when the pause could not be recorded (no GM). A programmatic `!x` that reaches `createChatMessage` routes `RUN_ON.CANONICAL_GM` to `handleXCardCommand` (`src/index.js`). Every narrator entry point checks the flag against the live setting (`narrator.js` `isXCardActive`); a move resolved under the X-Card posts its result card plus a "narration paused" notice instead of narration |
| X-Card resume | ✅ | GM only: the card's **Resume narration** button (`bindXCardCard`, `XCARD_RESUME_ACTION`) or `!x clear` → `resumeNarrationAfterXCard` (`clearXCard`, marks open X-Card cards resolved, posts "X-Card cleared"); also `game.modules.get("starforged-companion").api.clearXCard()` |
| Set a Flag — UI / chat command | ✅ | `!flag` / Session panel → `openSetFlagDialog` (`src/safety/sessionDialogs.js`); public or private; recorded on `campaignState.safetyFlags` by the canonical GM (`applySafetyFlag`, gmRelay `safety.setFlag`); Begin a Session lists them for review |
| Change Your Fate — 5-option chooser | ✅ | `!fate` / Session panel → `openChangeYourFateDialog` (`src/safety/sessionDialogs.js`): Reframe / Refocus / Replace / Redirect / Reshape + optional framing, posted as a card (narrative only) |
| Take a Break — Move on / Stop for now | ✅ | `!break` / Session panel → `openTakeABreakDialog` (`src/safety/sessionDialogs.js`). *Move on* records a single-use `campaignState.nextMoveAdd` on the canonical GM (`applyTakeBreak`, gmRelay `session.takeBreak`); the move pipeline **adds the +1 automatically** to the next action roll, claiming it on the store first (`consumeNextMoveAdd`, `src/moves/nextMoveAdd.js` — a refused claim adds nothing and leaves it pending, issue #342 Z52) — progress and no-roll moves leave it pending. *Stop for now* opens End a Session. Not prompted automatically after a progress move |
| Begin a Session — flag review, recap, spotlight vignette | ✅ | `!begin-session` / Session panel → `openBeginSessionDialog` (`src/safety/sessionLifecycleDialogs.js`): shows last session's quest / connection focus ("Focus from last session"), lists recent flags, optional Spotlight Vignette roll (`spotlight_vignette`, `src/oracles/tables/sessionVignette.js`) and galley vignette. World writes run on the canonical GM (`applyBeginSession`, gmRelay `session.begin`): +1 momentum to all PCs on a vignette roll, `sessionActive` on and the foci cleared, campaign clocks advance, galley vignette. Recap auto-runs (`issue #207 (Previously On)`) |
| End a Session — milestone reminder, focus capture, +1 momentum | ✅ | `!end-session` / Session panel → `openEndSessionDialog` (`src/safety/sessionLifecycleDialogs.js`) captures quest / connection focus; `applyEndSession` (gmRelay `session.end`, canonical GM) saves the foci to `campaignState.questFocus` / `connectionFocus` (surfaced at the next Begin a Session, then cleared), ends the session and the active scene, finalises the rolling summary and Session Log, awards +1 momentum to all PCs when a focus was set, and runs the closing vignette — once per session: an End on a session already ended only replaces the focus (issue #309 N08) |
| Scene start / end (Fact Continuity scene markers) | ✅ | `!scene start|end` at `src/index.js:1011-1066`, `src/factContinuity/sceneLifecycle.js` |

### 2.7 Clocks and scene challenges

| Rule | Status | Pathway |
|---|---|---|
| Clocks (4/6/8/10-segment, campaign or tension) | ✅ | `src/clocks/clocks.js`: `!clock new/advance/fill/reset/remove/list` + the Clocks panel; campaign clocks roll their odds and advance at Begin a Session (`advanceCampaignClocksForBeginSession`); tension clocks and vow deadline clocks advance one segment on Pay the Price (`advanceClocksOnPayThePrice`, `src/clocks/payThePriceClocks.js` — a player's `!ptp` relays `payThePrice.advanceClocks` to the canonical GM). A full clock only posts an "already triggered" notice |
| Scene Challenges worksheet (rulebook pp. 239–241; the vendored `Starforged/Moves/Scene_Challenge` moves) | ✅ | **Begin the Scene** is the one scene-challenge move with no module move — missing as a move, its set-up is the Progress Tracks panel's Add: a `scene_challenge` track (`src/ui/progressTracks.js`) named for the objective, at the rank the table picks (the move's guidance — troublesome with a clear advantage, dangerous when ready to act, formidable when unprepared or outmatched — is in the help), with its paired 4-segment tension clock (`tensionClockId`); completing the challenge retires the clock and removing it removes the clock (issue #316 T03). **Face Danger (Scene Challenge)** and **Secure an Advantage (Scene Challenge)** are module moves (`face_danger_scene_challenge` / `secure_an_advantage_scene_challenge`, typed by the interpreter while a challenge is open — issue #338 D2), scored against the open challenge (`sceneChallenge.scoreSceneChallenge`, from `applyOutcomeEffects`): Face Danger's strong hit marks progress (twice on a match) and its weak hit marks progress and fills a segment; Secure an Advantage's strong hit takes both (+2 momentum, +1 on the next move) and marks progress on a match, its weak hit the usual choice; a miss on either fills a segment (two on a match) and routes Pay the Price, whose clock advance skips that clock; a ⬡ card says what was done, and a Burn Momentum / Improve Result takes back what the superseded outcome filled. **Finish the Scene** is `finish_the_scene` — the panel's ⬡ roll, a pipeline progress move scored from the challenge's track: every outcome ends the challenge and retires its clock, a weak hit or miss routes Pay the Price (issue #326 D6) |
| Custom oracle tables (the oracle worksheet) | ✅ | `!oracle-add` / Custom Oracles panel (`src/oracles/customOracles.js`): entries must run from 1 with no gaps or overlaps (`validateCustomOracleEntries`); a range may use any dash and `00` is 100, and a line that does not read refuses the save, named on the card (`unparsedEntryLines` — issue #322 V28); the table rolls 1..its highest entry (`dieSizeForTable`, `src/oracles/roller.js` — a 1–6 table rolls a d6); roll with `!oracle <tableId>` or the panel. `campaignState.customOracles` is canonical; each client's `ORACLE_TABLES` copy is a mirror kept in sync |

### 2.8 Chat commands & toolbar (UI surface inventory)

Chat commands (all routed from the `createChatMessage` hook through the ordered
`CHAT_COMMAND_ROUTES` table in `src/index.js` — `dispatchChatCommand` in
`src/multiplayer/commandRouting.js`; each
command runs once, on the typist's client (`RUN_ON.AUTHOR`), the canonical GM
(`RUN_ON.CANONICAL_GM`, `!x`), or the keyed canonical GM else the author
(`RUN_ON.CLAUDE`: `@scene`, `!recap`, `!ship envision/history`, `!incite`).
The handler line numbers below predate that table — search by handler name):

| Command | Handler line | Audience |
|---|---|---|
| `!x` / `!x clear` | `src/ui/settingsPanel.js` `registerXCardHook` (typed, intercepted pre-create); programmatic `!x` → `src/index.js` `handleXCardCommand` | anyone (X-Card); `!x clear` GM |
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

**3.1.1 Momentum reset formula is inverted. — FIXED (`momentumBounds`, `src/character/actorBridge.js`)**
The bounds are the vendor's formula over the sheet's bases — reset = `momentum.resetValue` (+2) − impacts, floored at 0; max = `momentum.max` (10) − impacts — preferring the system's `momentumMax` / `momentumReset` getters when present (decisions.md, issue #316: "the sheet owns the momentum bases"). 0 impacts → +2, 1 → +1, 2+ → 0. Kept below as it was found:

`src/character/actorBridge.js:84` and the duplicate at `src/character/actorBridge.js:178`:

```js
momentumReset: condCount === 0 ? 0 : Math.max(-2, -condCount),
```

Per the play kit (p. 1) and `issue #212 (Ironsworn API):191-193` (RESET_MIN
= 0; reset = `momentum.resetValue − impactCount` clamped to floor 0), the
correct values are 0 impacts → +2, 1 → +1, 2+ → 0. Current code returns 0 →
0, 1 → −1, 2+ → −2. This corrupts momentum clamping at line 206 and the
post-burn target at `src/moves/burnMomentum.js:215-238`. Suggested fix:

```js
momentumReset: Math.max(0, 2 - condCount),
```

…and remove the special-case for `condCount === 0`. Apply the same fix at
line 178.

**3.1.2 `CONDITION_DEBILITIES` filter excludes 6 impacts that should reduce max momentum. — FIXED (`IMPACT_KEYS`, `src/character/actorBridge.js`)**
Every marked impact counts toward max momentum and the reset — the ten
play-kit impacts and the vendor's three (3.1.3). Kept below as it was found:

`src/character/actorBridge.js:11`:

```js
const CONDITION_DEBILITIES = ['wounded', 'shaken', 'unprepared', 'encumbered'];
```

Per the play kit (p. 1, "MAX MOMENTUM: STARTS AT +10 / REDUCE BY 1 FOR EACH
IMPACT") and confirmed in `issue #212 (Ironsworn API):212` ("ALL impacts
reduce momentumMax and momentumReset — the `#impactCount` getter counts all
true values in `system.debility`. Do not filter by category"). Battered,
cursed, doomed, tormented, indebted, permanently_harmed, and traumatized
currently do **not** reduce max momentum or reset. Suggested fix: count
every `true` flag returned by `readDebilities` (excluding the non-canonical
extras called out in 3.1.3), or — preferred — use the system's computed
`actor.system.momentumMax` and `actor.system.momentumReset` getters and
delete the local recompute.

**3.1.3 `readDebilities` reads the vendor's impacts beyond the play kit's ten. — FIXED (wrongly listed: it is the vendor's rule)**
`readDebilities` (`src/character/actorBridge.js`) reads the play kit's ten
impacts and `corrupted`, `encumbered`, `maimed` — the foundry-ironsworn
character's own `ImpactField`s (`vendor/foundry-ironsworn/src/module/actor/subtypes/character.ts`,
the `debility` schema), which its `#impactCount` counts toward
`momentumMax` / `momentumReset` like any other: counting them is the
sheet's rule, not a bug. `readDebilities` does not name `custom1` /
`custom2` (CHARACTER STATE would read "custom1"); the vendor schema has them
too (with `custom1name` / `custom2name`), and its getters — which
`momentumBounds` prefers when the system provides them — count them when
marked, as the bridge's own fallback does (`IMPACT_KEYS`). This item first said the five fields were invented
and that `encumbered` must not count.

### 3.2 Missing tables (play-kit content not in code) — FIXED

All eight are registered in `ORACLE_TABLES` (`src/oracles/roller.js`) and
pinned roll for roll against the vendored Dataforged data
(`tests/unit/oracleTableFidelity.test.js`, issue #321 U63):

| Table | Where it lives now | Rolled by |
|---|---|---|
| Pay the Price d100 (16 entries) — FIXED | `pay_the_price`, `src/oracles/tables/payThePrice.js` | a result that routes it (its card) and `!pay-the-price` |
| Begin a Session — Spotlight Vignette d100 (10 entries) — FIXED | `spotlight_vignette`, `src/oracles/tables/sessionVignette.js` | the Begin a Session dialog |
| Make a Discovery d100 (25 entries) — FIXED | `make_a_discovery`, `src/oracles/tables/discoveryAndChaos.js` | the Make a Discovery move |
| Confront Chaos d100 (25 entries) — FIXED | `confront_chaos`, `src/oracles/tables/discoveryAndChaos.js` | the Confront Chaos move |
| Take Decisive Action weak-hit d100 (6 entries) — FIXED | `decisive_action_cost`, `src/oracles/tables/sufferAndCombat.js` | the weak hit's card |
| Endure Harm mortal-wound d100 (5 entries) — FIXED | `mortal_wound`, `src/oracles/tables/sufferAndCombat.js` | the at-0 choice card's table option (`rollImpactTable`, issue #329 X03) |
| Endure Stress desolation d100 (4 entries) — FIXED | `desolation`, `src/oracles/tables/sufferAndCombat.js` | the at-0 choice card's table option |
| Withstand Damage vehicle-damage d100 (10 entries) — FIXED | `vehicle_damage`, `src/oracles/tables/sufferAndCombat.js` | the Withstand Damage executor at 0 integrity (known-issues SUFFER-EXECUTOR-ASSET-SCHEMA) |

### 3.3 Missing mechanics

**3.3.1 Yes/No oracle with odds. — FIXED (`rollYesNo`, `src/oracles/roller.js`; `!oracle yes`, `src/index.js`)**
`rollYesNo(odds)` answers yes at ≤ 10 / 25 / 50 / 75 / 90 and flags a match
(tens = ones, 100 as 00) for an extreme result or twist; `!oracle yes [odds]
[question]` is its chat surface, and campaign clocks roll their odds with it
(`src/clocks/clocks.js`).

**3.3.2 "Mark progress twice" on Strike and Clash strong hits. — FIXED**
`combatProgress: 2` consequence on strike/clash strong (and weak) hits drives
`applyCombatProgress({ markCount: 2 })` in the GM-gated pipeline handler.
`src/moves/combat.js`, wired in `src/index.js`.

**3.3.3 Combat positioning not persisted. — FIXED**
`combatPosition` from resolver consequences is now written to the active combat
track via `setCombatTrackPosition` after every combat move resolution. The panel
reads and toggles `combatState` on the track object. `src/ui/progressTracks.js`.
Take Decisive Action reads back via `getActiveCombatPosition()` (unchanged).

**3.3.4 Higher-of-two-stat selection not dynamic for Endure Harm / Stress. — FIXED (`PICK_HIGHER_OF`, `src/moves/statEnrichment.js`)**
Endure Harm rolls +health or +iron and Endure Stress +spirit or +heart,
whichever is higher, read from the sheet before the dice; Heal's self-mend
rolls the lower of iron / wits (`PICK_LOWER_OF`, issue #330 D4).

**3.3.5 Develop Your Relationship — bond legacy ticks when bonded. — FIXED (2026-06-17)**
Once bonded, Develop Your Relationship rolls +rank and pays the move's text —
strong hit 2 bonds-legacy ticks, weak hit +2 momentum, miss nothing — and a
strong hit with a match raises the connection's rank by one (issue #322 V01:
the pipeline paid a weak hit 1 tick, `!bond` +2 momentum);
un-bonded connections mark their own relationship track ("no roll, mark
progress"). Implemented in `src/moves/developRelationship.js` (pure, unit-tested)
+ a GM-gated pipeline handler in `src/index.js`. The resolver emits a
`developRelationship` consequence flag; the pipeline resolves the target
connection (by name, with a sole-bonded/sole-active fallback) and applies it.

**3.3.6 Vehicle Repair point spends not applied automatically. — FIXED (`applyRepairSpends`, `src/moves/repair.js`)**
`!repair` allocates the earned points (and the supply trade); Apply relays
to the canonical GM, which clears battered and raises the command vehicle's
integrity, pays the trade (marking unprepared at 0 supply), and records the
module, companion and device spends on the card.

### 3.4 Missing UI / chat surface for declared moves

| Move | What was missing | Status |
|---|---|---|
| **3.4.1 Begin a Session** | A panel or chat flow that: (a) lists flagged content for review, (b) shows the last-session recap (already auto-posts), (c) offers an optional spotlight vignette roll for +1 momentum to all players | ✅ FIXED — `!begin-session` / Session panel → `openBeginSessionDialog` (`src/safety/sessionLifecycleDialogs.js`, §2.6) |
| **3.4.2 End a Session** | A dialog that prompts for `questFocus` / `connectionFocus`, awards +1 momentum if either is set, posts a milestone reminder | ✅ FIXED — `!end-session` → `openEndSessionDialog` (§2.6) |
| **3.4.3 Set a Flag** | A flag-creation dialog feeding into `safety.js` (or a parallel `flags` store) | ✅ FIXED — `!flag` → `openSetFlagDialog` (`src/safety/sessionDialogs.js`, §2.6) |
| **3.4.4 Change Your Fate** | A 5-option chooser (Reframe / Refocus / Replace / Redirect / Reshape); could be a `DialogV2` and a `!fate <option> <reason>` chat command | ✅ FIXED — `!fate` → `openChangeYourFateDialog` (§2.6) |
| **3.4.5 Take a Break** | Mandatory prompt after progress-move resolution or scene end (already detected via `endScene`); offers "Move on (+1 next non-progress)" or "Stop for now (End a Session)" | ✅ FIXED — `!break` → `openTakeABreakDialog`, *Move on*'s +1 added to the next action roll (§2.6); it is not prompted automatically after a progress move |
| **3.4.6 Background Vow** | No UI to read/write the character-sheet background vow; the foundry-ironsworn sheet has the field but this module does not surface it in the chronicle or assembler | 🔄 PARTLY FIXED — the narrator's character block names it with its progress ("Background vow: …", `src/narration/narratorPrompt.js`; the shared inciting vow, else the PC's earliest — `readVows` `isBackground`); the module has no UI of its own to write one (vows are sworn on the sheet or through Swear an Iron Vow) |

### 3.5 Worksheets / extensibility

| Worksheet | Status | Notes |
|---|---|---|
| Clocks | ✅ | FIXED — `src/clocks/clocks.js`: `!clock` and the Clocks panel; campaign clocks roll their odds at Begin a Session, tension and vow clocks advance on Pay the Price (§2.7) |
| Scene Challenges | ✅ | FIXED — the Progress Tracks panel's scene challenge (a track and its paired 4-segment clock), Face Danger / Secure an Advantage within it as their scene-challenge moves (issue #338 D2) and Finish the Scene (issue #326 D6); Begin the Scene has no move of its own — the panel's Add sets the challenge up (§2.7) |
| Custom oracle tables | ✅ | FIXED — `!oracle-add` / the Custom Oracles panel (`src/oracles/customOracles.js`, §2.7) |

### 3.6 Recap of what is solid

To be clear about what is *not* a gap:

- All 51 move names parse and route correctly from natural language.
- All 7 outcome types (3 base × match ± burn) resolve.
- Burn momentum logic correctly blocks progress moves, requires positive
  momentum, and only fires when it improves the outcome; the reset it burns
  to is the sheet's (3.1.1, fixed).
- Momentum bounds count every marked impact, the vendor's way (3.1.1–3.1.3,
  fixed); the play kit's eight tables are registered and rolled where the
  rules roll them (3.2, fixed); yes/no with odds, the higher-of-two stat and
  Repair's spends are applied (3.3.1, 3.3.4, 3.3.6, fixed); the session
  moves have their dialogs (3.4.1–3.4.5, fixed); clocks, scene challenges
  and custom oracle tables have their surfaces (3.5, fixed).
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
`claude/document-game-rules-7KrzY`. Part 3 was re-audited against the code on
2026-11-05 (issue #337 Y49, at `8fb7bfa` with the issue #338 scene-challenge
moves): every item the tree had fixed is marked "— FIXED (where)", and the
Part 2 rows that restated them (2.2, 2.4) say what is there now. File:line
references outside those rows date from the snapshot — search by name.
Update when:

- A new move-resolver branch is added or rewritten (Part 2.2).
- An oracle table is added to `src/oracles/tables/` (Part 2.4).
- A bug listed in Part 3 is fixed (move it to the "what is solid" recap).
- The play kit is reissued (Tomkin updates: confirm the move list and
  table contents against the new PDF).

Source PDF: *Ironsworn: Starforged Playkit*, Shawn Tomkin, ©2022, updated
January 2023. CC BY 4.0. Original at https://www.ironswornrpg.com.
