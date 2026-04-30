# Starforged Companion — Sector Creator Scope
## Guided sector generation following the Starforged rulebook (pp. 114–127)

**Priority:** After Quench integration tests  
**Estimated Claude Code sessions:** 2 (wizard + map UI, then entity wiring + tests)  
**Source:** Ironsworn: Starforged Rulebook pp. 114–127; Reference Guide pp. 32–57  

---

## 1. Overview

The Sector Creator guides the GM through the 11-step sector creation process
from the Starforged rulebook, using the module's existing oracle tables to
generate all content. It produces a populated sector with settlements, planets,
a local connection, and a sector trouble — all stored as Foundry entities and
a visual sector map.

The wizard can be run at campaign start (starting sector) or any time the
party enters a new region of space.

**Trigger:**
- Toolbar button (new sector icon, GM only)
- Chat command: `/sector new`
- From the World Journal panel once implemented

---

## 2. The 11-step process (from rulebook)

### Step 1 — Choose starting region
Player chooses from three options. No oracle roll — GM decision.

| Region | Settlements | Passages | Character |
|--------|-------------|----------|-----------|
| Terminus | 4 | 3 | Dense, well-charted |
| Outlands | 3 | 2 | Frontier, scattered |
| Expanse | 2 | 1 | Remote, uncharted |

### Step 2 — Determine number of settlements
Set automatically from region selection (table above).

### Step 3 — Generate settlement details
For each settlement, roll on:
- Settlement Location (Terminus/Outlands/Expanse variant)
- Settlement Population (Terminus/Outlands/Expanse variant)
- Settlement Authority
- Settlement Projects (roll 1–2 times)
- Settlement Name

Uses existing tables: `SETTLEMENTS.LOCATION`, `SETTLEMENTS.POPULATION_TERMINUS`
etc., `SETTLEMENTS.AUTHORITY`, `SETTLEMENTS.PROJECTS`, `SETTLEMENTS.NAMES`

**Note:** Population tables are region-specific. The roller already handles this
but the sector creator must pass the correct region-keyed table.

### Step 4 — Generate planets
For each settlement that is planetside or orbital:
- Roll on Planet Type table → determines planet category
- Roll on the category's settlement table to confirm (orbital/planetside/none)
- Give the planet a name (from planet-type sample names or freeform)

Uses existing: `PLANETS.PLANET_TYPE` + per-type settlement/atmosphere/life tables

### Step 5 — Generate stars (optional)
For each settlement, optionally roll on Stellar Object table.

Uses existing: `SPACE.STELLAR_OBJECT`

### Step 6 — Create sector map
Visual map with draggable settlement markers. See Section 4.

### Step 7 — Create passages
Draw lines between settlements (or to the sector edge) per region passage count.
Each passage must connect two settlements OR a settlement to the sector edge.

### Step 8 — Zoom in on one settlement
GM chooses one settlement to detail further. Roll on:
- First Look (1–2 times)
- Settlement Trouble
- If planetside/orbital: Planet Atmosphere, Observed from Space (1–2), Planetside Feature (1–2)

Uses existing: `SETTLEMENTS.FIRST_LOOK`, `SETTLEMENTS.TROUBLE`
Plus planet detail tables from `PLANETS`

### Step 9 — Create a local connection
Generate one NPC connection for the sector. Roll on:
- Character First Look (1–2 times)
- Character Goal
- Character Revealed Aspect (1–2 times)
- Character Name
- (Optional) Character Role from `CHARACTERS.ROLE`

Uses existing: `CHARACTERS.FIRST_LOOK`, `CHARACTERS.GOAL`,
`CHARACTERS.REVEALED_ASPECT`, `CHARACTERS.NAMES`

### Step 10 — Introduce a sector trouble
Roll or choose from the Sector Trouble table (d100).

**The Sector Trouble table is not yet in the module.** It must be added to
`src/oracles/tables/misc.js` (20 entries, see rulebook p. 126):

```js
export const SECTOR_TROUBLE = [
  { min: 1,   max: 5,   result: "Blockade prevents trade with other sectors" },
  { min: 6,   max: 10,  result: "Bounty hunters search for an infamous fugitive" },
  { min: 11,  max: 15,  result: "Chaotic breaches in spacetime spread like wildfire" },
  { min: 16,  max: 20,  result: "Criminal faction corrupts local authorities" },
  { min: 21,  max: 25,  result: "Devastating superweapon has fallen into the wrong hands" },
  { min: 26,  max: 30,  result: "Energy storms are rampant" },
  { min: 31,  max: 35,  result: "Magnetic disturbances disrupt communication" },
  { min: 36,  max: 40,  result: "Newly found resource lures greedy fortune hunters" },
  { min: 41,  max: 45,  result: "Notorious pirate clan preys on starships" },
  { min: 46,  max: 50,  result: "Parasitic lifeforms spread like a plague" },
  { min: 51,  max: 55,  result: "Precursor sites throughout the sector emit strange signals" },
  { min: 56,  max: 60,  result: "Prophecies foretell an imminent awakening of a dreadful power" },
  { min: 61,  max: 65,  result: "Raider clan emerges as a dominant threat under a new leader" },
  { min: 66,  max: 70,  result: "Religious zealots overrun the sector" },
  { min: 71,  max: 75,  result: "Rogue AI infiltrates systems throughout the sector" },
  { min: 76,  max: 80,  result: "Settlements or factions are on the brink of war" },
  { min: 81,  max: 85,  result: "Ships regularly go missing" },
  { min: 86,  max: 90,  result: "Sickness spreads among ships and settlements" },
  { min: 91,  max: 95,  result: "Supernova is imminent" },
  { min: 96,  max: 100, result: "Titanic spaceborne lifeform stalks the spaceways" },
];
```

Also register in `src/oracles/roller.js`:
```js
sector_trouble: { name: "Sector Trouble", table: MISC.SECTOR_TROUBLE, category: "sectors" },
```

### Step 11 — Finalize
- Generate sector name (prefix + suffix roll from `SPACE.SECTOR_NAME_PREFIX` / `SECTOR_NAME_SUFFIX`)
- Optionally set faction/control
- Save sector to campaign state and Foundry journal

---

## 3. New files

### `src/sectors/sectorGenerator.js`

Core generation logic — orchestrates oracle rolls for all 11 steps.

```js
/**
 * Run the full 11-step sector creation process with provided roll values.
 * All rolls can be passed in (for player-specified values) or generated
 * automatically (for fully random generation).
 *
 * @param {string} region        — "terminus" | "outlands" | "expanse"
 * @param {Object} [overrides]   — Optional fixed roll values per step
 * @returns {SectorResult}
 */
export async function generateSector(region, overrides = {})

/**
 * Generate a single settlement with all required detail rolls.
 * @param {string} region
 * @param {number} [projectCount]  — 1 or 2 (default random)
 * @returns {SettlementResult}
 */
export function generateSettlement(region, projectCount)

/**
 * Generate planet details for a settlement.
 * @param {string} settlementLocationType  — "orbital" | "planetside"
 * @returns {PlanetResult | null}
 */
export function generatePlanet(settlementLocationType)

/**
 * Generate a local connection NPC.
 * @param {string} homeSettlementName
 * @returns {ConnectionResult}
 */
export function generateConnection(homeSettlementName)

/**
 * Generate the sector name from prefix + suffix rolls.
 * @returns {{ prefix: string, suffix: string, full: string }}
 */
export function generateSectorName()

/**
 * Store a completed sector to campaign state and create
 * entity records for all settlements and the connection.
 * @param {SectorResult} sector
 * @param {Object} campaignState
 * @returns {Promise<StoredSector>}
 */
export async function storeSector(sector, campaignState)
```

### `src/sectors/sectorPanel.js`

ApplicationV2 wizard + map panel.

```js
export class SectorCreatorApp extends ApplicationV2 {
  // 11-step wizard with a visual map on the right side
  // Each step has: oracle roll display, "Re-roll" button, freeform override
  // Map updates live as settlements are placed
}

export function openSectorCreator()
```

### `src/sectors/sectorMap.js`

SVG-based sector map renderer. Generates a simple abstract grid map.

```js
/**
 * Render sector map as an SVG string.
 * @param {SectorMapData} mapData  — settlements, passages, discovered locations
 * @returns {string}               — SVG markup
 */
export function renderSectorMap(mapData)

/**
 * Update passage data (GM draws connections via click).
 */
export function addPassage(fromId, toId, toEdge = false)
```

---

## 4. Sector map design

The map is a simple abstract grid — not a literal astronomical chart.
Grid cells are ~60×60px. Settlement markers are placed by the GM (drag to position).
Passages are drawn as lines between markers.

**Settlement marker types (from rulebook):**
- Orbital settlement: circle with arrow ○→
- Planetside settlement: circle with plus ⊕  
- Deep space settlement: square □

**Map controls (GM only):**
- Drag settlements to reposition
- Click two settlements to draw a passage
- Click settlement + edge arrow to draw an outgoing passage
- "Undiscovered" toggle — greys out locations not yet visited

**Map is stored** in `campaignState.sectors[sectorId].mapData`:
```js
{
  sectorId:    string,
  gridWidth:   10,
  gridHeight:  8,
  settlements: [
    { id, name, type, gridX, gridY, visited }
  ],
  passages: [
    { fromId, toId, toEdge: false },
    { fromId, toId: null, toEdge: true, edgeDirection: "right" }
  ],
  discoveries: []   // added during play
}
```

---

## 5. Integration with existing entity system

After generation, the sector creator creates Foundry entities:

**Settlements** → `src/entities/settlement.js`
```js
// For each generated settlement, call:
await createSettlement({
  name:       settlement.name,
  location:   settlement.locationType,
  population: settlement.population,
  authority:  settlement.authority,
  projects:   settlement.projects,
  trouble:    settlement.trouble ?? null,
  planet:     settlement.planet ?? null,
  sector:     sector.name,
  sectorId:   sector.id,
});
```

**Connection** → `src/entities/connection.js`
```js
await createConnection({
  name:     connection.name,
  role:     connection.role,
  goal:     connection.goal,
  location: connection.homeSettlement,
  sector:   sector.name,
  sectorId: sector.id,
  rank:     "dangerous",   // default per rulebook recommendation
});
```

**Sector record** → new flag on a dedicated "Starforged Sectors" journal:
```js
{
  id:         string,
  name:       string,
  region:     "terminus" | "outlands" | "expanse",
  trouble:    string,
  faction:    string | null,
  createdAt:  ISO string,
  mapData:    SectorMapData,
  settlementIds: string[],   // entity journal IDs
  connectionId:  string,     // entity journal ID
}
```

---

## 6. Campaign state additions

Add to `CampaignStateSchema` in `src/schemas.js`:
```js
sectors: [],             // Array of StoredSector objects
activeSectorId: null,    // The sector the party is currently in
```

---

## 7. Context packet integration

Add a new section to `src/context/assembler.js` — **Sector Context** — injected
between World Truths and Active Connections:

```
## ACTIVE SECTOR

Name: {sector.name}  Region: {region label}
Trouble: {sector.trouble}
{faction if set: "Control: {sector.faction}"}

Settlements: {comma-separated names with type}
Passages: {N} charted routes
```

Token budget allocation: ~50 tokens. Low priority — dropped before connections
if budget is tight.

---

## 8. New chat command

```
/sector new          — open the sector creator wizard (GM only)
/sector list         — list all created sectors
/sector {name}       — switch active sector
```

---

## 9. Toolbar integration

Add a fourth toolbar button in `index.js` `getSceneControlButtons`:
```js
{
  name:    "sectorCreator",
  title:   "Sector Creator",
  icon:    "fas fa-map",
  button:  true,
  visible: game.user.isGM,
  onClick: () => openSectorCreator(),
}
```

---

## 10. Testing structure

### Unit tests — `tests/unit/sectorGenerator.test.js`

```
generateSectorName()
  ✓ returns prefix and suffix strings
  ✓ full name is "prefix suffix"

generateSettlement("terminus")
  ✓ returns name, locationType, population, authority, projects array
  ✓ projects array has 1–2 entries
  ✓ locationType is "orbital" | "planetside" | "deep_space"

generateSettlement — region variants
  ✓ terminus produces correct population distribution
  ✓ outlands produces correct population distribution
  ✓ expanse produces correct population distribution

generatePlanet("orbital")
  ✓ returns planet type and name
  ✓ name is a non-empty string

generateConnection("Bleakhold")
  ✓ returns name, role, goal, aspect, homeSettlement
  ✓ homeSettlement matches argument

generateSector("terminus")
  ✓ produces 4 settlements for terminus
  ✓ produces 3 passages for terminus
  ✓ produces 3 settlements for outlands
  ✓ produces 2 passages for outlands
  ✓ produces 2 settlements for expanse
  ✓ produces 1 passage for expanse
  ✓ sector has a trouble string
  ✓ sector has a connection

SECTOR_TROUBLE table
  ✓ has 20 entries
  ✓ min of first entry is 1, max of last entry is 100
  ✓ covers contiguous range with no gaps
```

### Integration tests (Quench)

Add batch `starforged-companion.sectorCreator` to
`src/integration/quench.js`:

```
storeSector — live journal
  ✓ creates a "Starforged Sectors" journal if none exists
  ✓ stores sector data in journal flags
  ✓ creates settlement entity journals
  ✓ creates connection entity journal
  ✓ sets activeSectorId in campaignState

assembler includes sector context
  ✓ assembled packet contains "ACTIVE SECTOR" when a sector is active
  ✓ assembled packet omits sector section when no active sector
```

---

## 11. `packs/help.json` update

Add a new page "Sector Creator" (sort 250, between Toolbar Buttons and Settings):

```html
<h2>Sector Creator</h2>
<p>Open the Sector Creator via the toolbar (🗺 button in Token Controls, GM only),
or type <code>/sector new</code> in chat.</p>

<h3>The 11 steps</h3>
<ol>
  <li>Choose your region (Terminus, Outlands, or Expanse)</li>
  <li>Number of settlements is set automatically by region</li>
  <li>Generate settlement details — name, location, population, authority, projects</li>
  <li>Generate planets for planetside and orbital settlements</li>
  <li>Generate stellar objects (optional)</li>
  <li>Place settlements on the sector map</li>
  <li>Draw passages between settlements</li>
  <li>Zoom in on one settlement — first look, trouble, planet features</li>
  <li>Create your local connection NPC</li>
  <li>Introduce a sector trouble</li>
  <li>Name the sector and finalize</li>
</ol>

<h3>Sector map</h3>
<p>The sector map is an abstract grid — not a literal chart. Drag settlements to
position them. Click two settlements to draw a passage. Click a settlement and the
edge arrow to create an outgoing passage to another sector.</p>

<h3>Chat commands</h3>
<table>
  <tr><td><code>/sector new</code></td><td>Open the sector creator (GM only)</td></tr>
  <tr><td><code>/sector list</code></td><td>List all created sectors</td></tr>
  <tr><td><code>/sector [name]</code></td><td>Switch the active sector</td></tr>
</table>
```

---

## 12. Implementation order

1. Add `SECTOR_TROUBLE` table to `src/oracles/tables/misc.js`
2. Register `sector_trouble` in `src/oracles/roller.js`
3. Add `sectors` and `activeSectorId` to `CampaignStateSchema` in `src/schemas.js`
4. Write `src/sectors/sectorGenerator.js` — all generation functions
5. Write `tests/unit/sectorGenerator.test.js` — run `npm test` after
6. Write `src/sectors/sectorMap.js` — SVG map renderer
7. Write `src/sectors/sectorPanel.js` — ApplicationV2 11-step wizard
8. Wire `openSectorCreator()` into `src/index.js` toolbar + `/sector` command
9. Update `src/context/assembler.js` — add sector context section
10. Wire `storeSector()` to create settlement and connection entities
11. Add Quench integration batch to `src/integration/quench.js`
12. Update `packs/help.json` — add Sector Creator page and changelog entry
13. Update `docs/scope-index.md` — mark status
14. Run full test suite and lint

---

## 13. Design decisions

**Wizard vs. free-form:** The wizard follows the rulebook sequence exactly.
Every oracle roll is shown with a Re-roll button and a freeform override field.
The GM is never forced to accept a roll — they can type any value.

**Map is abstract:** The grid does not represent literal distances. It is a
planning and tracking tool, not an astronomical chart. The rulebook explicitly
says to keep maps simple.

**Passages are one-way data:** A passage records which locations are connected,
not a physical route. Travel along a passage uses Set a Course; travel without
one uses Undertake an Expedition.

**Entity creation is automatic:** After the wizard completes, all settlements
and the connection are automatically created as entity records. The GM can
edit them via the Entity Panel immediately.

**Multiple sectors:** The module supports multiple named sectors.
`activeSectorId` tracks which sector the party is currently in, which determines
which sector context is injected into narration packets.

**Sector trouble is world-scoped:** The trouble is stored on the sector record
and also added to the World Journal (threats section) automatically if the
world journal feature is implemented.
