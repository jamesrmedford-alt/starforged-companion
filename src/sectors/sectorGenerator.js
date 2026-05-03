/**
 * STARFORGED COMPANION
 * src/sectors/sectorGenerator.js — 11-step sector generation
 *
 * Orchestrates oracle rolls for all steps of Starforged sector creation
 * (rulebook pp. 114–127). All generation is deterministic given fixed rolls,
 * and all functions work outside a live Foundry context for unit testing.
 *
 * Source: Starforged Rulebook pp. 114–127
 */

// rollOracle is imported for potential future use by panel overrides
import { createSettlement }    from "../entities/settlement.js";
import { createConnection }    from "../entities/connection.js";
import * as SETTLEMENTS        from "../oracles/tables/settlements.js";
import * as SPACE              from "../oracles/tables/space.js";
import * as PLANETS            from "../oracles/tables/planets.js";
import * as CHARACTERS         from "../oracles/tables/characters.js";
import * as MISC               from "../oracles/tables/misc.js";

const MODULE_ID = "starforged-companion";

// ─────────────────────────────────────────────────────────────────────────────
// REGION CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const REGION_CONFIG = {
  terminus: { settlements: 4, passages: 3, label: "Terminus" },
  outlands: { settlements: 3, passages: 2, label: "Outlands" },
  expanse:  { settlements: 2, passages: 1, label: "Expanse"  },
};

const POPULATION_TABLE_BY_REGION = {
  terminus: SETTLEMENTS.POPULATION_TERMINUS,
  outlands: SETTLEMENTS.POPULATION_OUTLANDS,
  expanse:  SETTLEMENTS.POPULATION_EXPANSE,
};


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full 11-step sector creation process.
 *
 * @param {string} region      — "terminus" | "outlands" | "expanse"
 * @param {Object} [overrides] — Optional fixed values per field (for re-rolls and manual input)
 * @returns {SectorResult}
 */
export function generateSector(region, _overrides = {}) {
  const cfg = REGION_CONFIG[region];
  if (!cfg) throw new Error(`Unknown region: ${region}`);

  // Steps 3–5: Generate each settlement
  const settlements = [];
  for (let i = 0; i < cfg.settlements; i++) {
    settlements.push(generateSettlement(region));
  }

  // Step 10: Sector trouble
  const trouble = rollTableResult(MISC.SECTOR_TROUBLE);

  // Step 11: Sector name
  const sectorName = generateSectorName();

  // Step 9: Local connection (uses first settlement as home)
  const connection = generateConnection(settlements[0]?.name ?? "the sector");

  // Step 7: Passages (placeholder grid passages — wizard lets GM draw them)
  const passages = [];
  for (let i = 0; i < cfg.passages; i++) {
    if (settlements[i] && settlements[i + 1]) {
      passages.push({ fromId: i, toId: i + 1, toEdge: false });
    } else {
      passages.push({ fromId: i, toId: null, toEdge: true, edgeDirection: "right" });
    }
  }

  const id = generateId();

  return {
    id,
    name:        sectorName.full,
    namePrefix:  sectorName.prefix,
    nameSuffix:  sectorName.suffix,
    region,
    regionLabel: cfg.label,
    trouble,
    faction:     null,
    settlements,
    connection,
    passages,
    mapData: {
      sectorId:    id,
      gridWidth:   10,
      gridHeight:  8,
      settlements: settlements.map((s, idx) => ({
        id:      s.id,
        name:    s.name,
        type:    locationTypeToMarker(s.locationType),
        gridX:   autoLayoutX(idx, cfg.settlements),
        gridY:   autoLayoutY(idx, cfg.settlements),
        visited: false,
      })),
      passages,
      discoveries: [],
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generate a single settlement with all required detail rolls.
 *
 * @param {string} region
 * @param {number} [projectCount] — 1 or 2 (default random: 1–2)
 * @returns {SettlementResult}
 */
export function generateSettlement(region, projectCount) {
  const popTable = POPULATION_TABLE_BY_REGION[region] ?? SETTLEMENTS.POPULATION_TERMINUS;

  const locationType = normalizeLocationType(rollTableResult(SETTLEMENTS.LOCATION));
  const population   = rollTableResult(popTable);
  const authority    = rollTableResult(SETTLEMENTS.AUTHORITY);
  const name         = rollTableResult(SETTLEMENTS.NAMES);

  const count    = projectCount ?? (rollD100() <= 50 ? 1 : 2);
  const projects = [];
  for (let i = 0; i < count; i++) {
    projects.push(rollTableResult(SETTLEMENTS.PROJECTS));
  }

  let planet = null;
  if (locationType === "orbital" || locationType === "planetside") {
    planet = generatePlanet(locationType);
  }

  return {
    id:           generateId(),
    name,
    locationType,
    population,
    authority,
    projects,
    planet,
    trouble:      null,
    firstLook:    [],
    stellar:      null,
  };
}

/**
 * Generate planet details for a settlement.
 *
 * @param {string} settlementLocationType — "orbital" | "planetside"
 * @returns {PlanetResult}
 */
export function generatePlanet(_settlementLocationType) {
  const type = rollTableResult(PLANETS.PLANET_TYPE);
  const name = generatePlanetName(type);
  return { type, name };
}

/**
 * Generate a local connection NPC.
 *
 * @param {string} homeSettlementName
 * @returns {ConnectionResult}
 */
export function generateConnection(homeSettlementName) {
  const givenName  = rollTableResult(CHARACTERS.GIVEN_NAMES);
  const familyName = rollTableResult(CHARACTERS.FAMILY_NAMES);
  const role       = rollTableResult(CHARACTERS.ROLE);
  const goal       = rollTableResult(CHARACTERS.GOAL);
  const aspect     = rollTableResult(CHARACTERS.DISPOSITION);
  const firstLook  = [rollTableResult(CHARACTERS.FIRST_LOOK)];

  return {
    id:             generateId(),
    name:           `${givenName} ${familyName}`,
    role,
    goal,
    aspect,
    firstLook,
    homeSettlement: homeSettlementName,
  };
}

/**
 * Generate the sector name from prefix + suffix rolls.
 *
 * @returns {{ prefix: string, suffix: string, full: string }}
 */
export function generateSectorName() {
  const prefix = rollTableResult(SPACE.SECTOR_NAME_PREFIX);
  const suffix = rollTableResult(SPACE.SECTOR_NAME_SUFFIX);
  return { prefix, suffix, full: `${prefix} ${suffix}` };
}

/**
 * Store a completed sector to campaign state and create entity records.
 *
 * @param {SectorResult} sector
 * @param {Object} campaignState
 * @returns {Promise<StoredSector>}
 */
export async function storeSector(sector, campaignState) {
  // Create settlement entity records
  const settlementJournalIds = {};
  for (const s of sector.settlements) {
    const created = await createSettlement({
      name:       s.name,
      location:   locationTypeToLabel(s.locationType),
      population: s.population,
      authority:  s.authority,
      projects:   s.projects,
      trouble:    s.trouble ?? null,
      planet:     s.planet ?? null,
    }, campaignState);
    settlementJournalIds[s.id] = created._id;
  }

  // Create connection entity record
  const conn = await createConnection({
    name:     sector.connection.name,
    role:     sector.connection.role,
    goal:     sector.connection.goal,
    rank:     "dangerous",
    location: sector.connection.homeSettlement,
  }, campaignState);

  const stored = {
    id:            sector.id,
    name:          sector.name,
    region:        sector.region,
    regionLabel:   sector.regionLabel,
    trouble:       sector.trouble,
    faction:       sector.faction,
    createdAt:     sector.createdAt,
    mapData:       sector.mapData,
    settlementIds: Object.values(settlementJournalIds),
    connectionId:  conn._id,
  };

  // Save to campaign state
  if (!campaignState.sectors) campaignState.sectors = [];
  campaignState.sectors.push(stored);
  campaignState.activeSectorId = stored.id;

  // Store sector record to the "Starforged Sectors" journal
  await saveSectorToJournal(stored);

  // TODO: World Journal integration — add sector trouble as threat when WJ ships
  // await recordThreat(sector.trouble, { type: "environmental", severity: "looming", ... })

  await persistCampaignState(campaignState);

  return stored;
}


// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL STORAGE
// ─────────────────────────────────────────────────────────────────────────────

async function saveSectorToJournal(sector) {
  try {
    let journal = game.journal?.getName("Starforged Sectors");
    if (!journal) {
      journal = await JournalEntry.create({
        name:  "Starforged Sectors",
        flags: { [MODULE_ID]: { sectorsJournal: true } },
      });
    }
    await journal.setFlag(MODULE_ID, sector.id, sector);
  } catch {
    // Non-Foundry context — ignore
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roll on a table and return the result string.
 *
 * @param {Array<{min:number, max:number, result:string}>} table
 * @param {number} [fixedRoll]
 * @returns {string}
 */
export function rollTableResult(table, fixedRoll) {
  const roll   = fixedRoll ?? rollD100();
  const entry  = table.find(e => roll >= e.min && roll <= e.max);
  return entry?.result ?? "Unknown";
}

function rollD100() {
  return Math.floor(Math.random() * 100) + 1;
}

function normalizeLocationType(rawLocation) {
  const l = rawLocation.toLowerCase();
  if (l.includes("planetside")) return "planetside";
  if (l.includes("orbital"))    return "orbital";
  return "deep_space";
}

function locationTypeToLabel(locationType) {
  switch (locationType) {
    case "orbital":    return "Orbital";
    case "planetside": return "Planetside";
    default:           return "Deep Space";
  }
}

function locationTypeToMarker(locationType) {
  switch (locationType) {
    case "orbital":    return "orbital";
    case "planetside": return "planetside";
    default:           return "deep_space";
  }
}

function generatePlanetName(_planetType) {
  // Derive a short name from the planet type + a generated word
  const prefixes = ["Aethon", "Vorn", "Drekkis", "Caul", "Mireth", "Solian", "Thraxis", "Ulven"];
  const suffixes = ["Prime", "Major", "Secundus", "IV", "Alpha", "Drift", "Deep", "End"];
  const prefix   = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix   = suffixes[Math.floor(Math.random() * suffixes.length)];
  return `${prefix} ${suffix}`;
}

function autoLayoutX(index, _total) {
  // Spread settlements across the 10-cell-wide grid with padding
  return 1 + (index * 2) + Math.floor(Math.random() * 2);
}

function autoLayoutY(index, _total) {
  // Alternate between upper and lower halves
  return index % 2 === 0 ? 2 + Math.floor(Math.random() * 2) : 5 + Math.floor(Math.random() * 2);
}

function generateId() {
  try   { return foundry.utils.randomID(); }
  catch { return Math.random().toString(36).slice(2, 10); }
}

async function persistCampaignState(campaignState) {
  try { await game.settings.set(MODULE_ID, "campaignState", campaignState); }
  catch { /* non-Foundry context */ }
}
