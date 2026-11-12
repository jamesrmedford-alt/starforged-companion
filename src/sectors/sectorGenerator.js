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
import { createSettlement, updateSettlement } from "../entities/settlement.js";
import { createConnection }    from "../entities/connection.js";
import { createLocation }      from "../entities/location.js";
import { ENTITY_ID_LISTS, unionIdList } from "../entities/registry.js";
import { serialiseCampaignStateWrite } from "../multiplayer/campaignStateChain.js";
import { generateSectorSites, buildSiteLocationData } from "./precursorSites.js";
import { getOrCreateSectorJournalFolder } from "../entities/folder.js";
import { finalizeEntityArtOnly } from "../entities/finalize.js";
import { buildSettlementsListHtml } from "./sectorOverview.js";
import { recordThreat }         from "../world/worldJournal.js";
import { apiPost }             from "../api-proxy.js";
import * as SETTLEMENTS        from "../oracles/tables/settlements.js";
import * as SPACE              from "../oracles/tables/space.js";
import * as PLANETS            from "../oracles/tables/planets.js";
import * as CHARACTERS         from "../oracles/tables/characters.js";
import * as MISC               from "../oracles/tables/misc.js";
import * as CORE               from "../oracles/tables/core.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const STUB_MODEL    = "claude-haiku-5-5";

const REGION_LABELS = {
  terminus: "Terminus (the settled core)",
  outlands: "Outlands (the frontier)",
  expanse:  "Expanse (the far reaches)",
  void:     "Void (beyond the Forge)",
};

const MODULE_ID = "starforged-companion";

// ─────────────────────────────────────────────────────────────────────────────
// REGION CONFIG
// ─────────────────────────────────────────────────────────────────────────────

// The rulebook's region table (starting sector steps 2 and 7; issue #218 §2):
// Terminus 4 settlements / 3 passages, Outlands 3 / 2, Expanse 2 / 1. The
// passages were raised to one per settlement (4 / 3 / 2) so one would run off
// the map edge; the book's counts are back, the last passage the edge one
// (issue #326 D5).
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

  // Steps 3–5: Generate each settlement, each in its own star system with
  // its own STELLAR_OBJECT roll (rulebook "settle a new system"; original
  // scope: "for each settlement, optionally roll on Stellar Object").
  // The v1.7.1 F7 fix rolled once per sector and stamped the same result on
  // every settlement — that fed the scene-map stellar pins, but made every
  // star in a sector identical (v1.7.10 playtest finding #3).
  const settlements = [];
  const takenNames  = new Set();
  for (let i = 0; i < cfg.settlements; i++) {
    const s = generateSettlement(region);
    s.stellar = rollTableResult(SPACE.STELLAR_OBJECT);
    // One name per settlement in a sector: the roster and `!at` match
    // settlements by name, so two of one name were ambiguous within it
    // (known-issues SECTOR-DUPLICATE-NAMES; across sectors the active
    // sector's namesake wins — issue #342 Z15).
    s.name = uniqueSettlementName(s.name, takenNames);
    takenNames.add(normalizeSettlementName(s.name));
    settlements.push(s);
  }

  // Step 8: Zoom in on the starting settlement — settlements[0], the local
  // connection's home (step 9).
  if (settlements[0]) zoomInOnSettlement(settlements[0]);

  // Step 10: Sector trouble
  const trouble = rollTableResult(MISC.SECTOR_TROUBLE);

  // Step 11: Sector name
  const sectorName = generateSectorName();

  // Step 9: Local connection (uses first settlement as home)
  const connection = generateConnection(settlements[0]?.name ?? "the sector");

  // Step 7: Passages (placeholder grid passages — wizard lets GM draw them).
  // The region's count, the book's: each links one settlement to the next,
  // and the last leads off the map edge (issue #326 D5).
  const passages = [];
  for (let i = 0; i < cfg.passages; i++) {
    const last = i === cfg.passages - 1;
    if (!last && settlements[i] && settlements[i + 1]) {
      passages.push({ fromId: settlements[i].id, toId: settlements[i + 1].id, toEdge: false });
    } else if (settlements[i]) {
      passages.push({ fromId: settlements[i].id, toId: null, toEdge: true, edgeDirection: "right" });
    }
  }

  const id = generateId();

  const mapSettlements = settlements.map((s, idx) => ({
    id:      s.id,
    name:    s.name,
    type:    locationTypeToMarker(s.locationType),
    gridX:   autoLayoutX(idx, cfg.settlements),
    gridY:   autoLayoutY(idx, cfg.settlements),
    visited: false,
  }));

  // Precursor vaults & derelicts — region-scaled, trouble-boosted sites placed
  // in the map periphery as unexplored discoveries behind an undiscovered
  // passage (see precursorSites.js). The full descriptors ride on `sites` so
  // createEntityJournals can mint location Actors; the light map descriptors go
  // on mapData.discoveries (the array the original sector scope reserved).
  const sites       = generateSectorSites(region, trouble);
  const discoveries = layoutSites(sites, mapSettlements);

  return {
    id,
    // The name alone: the record carried its rolled prefix and suffix too,
    // which nothing read (issue #331 X66). Stored sectors keep theirs.
    name:        sectorName.full,
    region,
    regionLabel: cfg.label,
    trouble,
    faction:     null,
    settlements,
    connection,
    passages,
    sites,
    mapData: {
      sectorId:    id,
      gridWidth:   10,
      gridHeight:  8,
      settlements: mapSettlements,
      passages,
      discoveries,
    },
    createdAt: new Date().toISOString(),
  };
}

// Right-edge slots for site pins — clear of the settlement cluster (gridX ~1–9)
// so the "undiscovered passage" reads as a route out to the frontier.
const SITE_SLOTS = [
  { gridX: 14, gridY: 1 },
  { gridX: 15, gridY: 4 },
  { gridX: 14, gridY: 7 },
  { gridX: 16, gridY: 2 },
  { gridX: 16, gridY: 6 },
  { gridX: 13, gridY: 8 },
];

/**
 * Position generated sites in the map periphery and anchor each one's
 * undiscovered passage to the rightmost (frontier-facing) settlement.
 *
 * @param {Array} sites          — generateSectorSites() descriptors
 * @param {Array} mapSettlements — mapData.settlements (with gridX/gridY)
 * @returns {Array} mapData.discoveries entries
 */
function layoutSites(sites, mapSettlements) {
  const jumpOff = [...(mapSettlements ?? [])].sort((a, b) => b.gridX - a.gridX)[0] ?? null;
  return (sites ?? []).map((s, i) => {
    const slot = SITE_SLOTS[i % SITE_SLOTS.length];
    return {
      id:                  s.id,
      type:                s.type,
      name:                s.name,
      discovered:          false,
      gridX:               slot.gridX,
      gridY:               slot.gridY,
      nearestSettlementId: jumpOff?.id ?? null,
      actorId:             null,   // backfilled by createEntityJournals
    };
  });
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
    // The zoom-in details — rolled for the starting settlement only
    // (zoomInOnSettlement, step 8).
    trouble:        null,
    firstLook:      [],
    initialContact: null,
    stellar:        null,
  };
}

const SETTLEMENT_NAME_REROLLS = 12;

const normalizeSettlementName = (name) => String(name ?? "").trim().toLowerCase();

/**
 * A settlement name no other settlement of the sector has: the rolled one,
 * else the Settlement Name table rolled again (a few times), else the rolled
 * one with a numeral ("Bleakhold II"), as a sector's repeated site names are
 * told apart (precursorSites.js).
 *
 * @param {string} rolled — the name generateSettlement rolled
 * @param {Set<string>} taken — the sector's names so far, normalised
 * @returns {string}
 */
function uniqueSettlementName(rolled, taken) {
  if (!taken.has(normalizeSettlementName(rolled))) return rolled;
  for (let i = 0; i < SETTLEMENT_NAME_REROLLS; i++) {
    const name = rollTableResult(SETTLEMENTS.NAMES);
    if (!taken.has(normalizeSettlementName(name))) return name;
  }
  for (let n = 0; ; n++) {
    const name = `${rolled} ${NAME_NUMERALS[n] ?? String(n + 2)}`;
    if (!taken.has(normalizeSettlementName(name))) return name;
  }
}

/**
 * Step 8 of the rulebook's starting sector: zoom in on the starting
 * settlement — its First Look (rolled 1–2 times), Initial Contact and
 * Trouble, on the Settlement oracles. The details ride onto the settlement
 * Actor (createEntityJournals) for its sheet, the narrator stub and the
 * narrator (issue #321 U50: never rolled, though every reader treated them
 * as rolled).
 *
 * @param {SettlementResult} settlement — mutated in place
 */
function zoomInOnSettlement(settlement) {
  const looks = [rollTableResult(SETTLEMENTS.FIRST_LOOK)];
  if (rollD100() > 50) {
    const second = rollTableResult(SETTLEMENTS.FIRST_LOOK);
    if (second !== looks[0]) looks.push(second);
  }
  settlement.firstLook      = looks;
  settlement.initialContact = rollTableResult(SETTLEMENTS.INITIAL_CONTACT);
  settlement.trouble        = rollTableResult(SETTLEMENTS.TROUBLE);
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

// Planetary class → its Sample Names table (planets.js SAMPLE_NAMES_*).
const PLANET_SAMPLE_NAMES = Object.freeze({
  "Desert World":    PLANETS.SAMPLE_NAMES_DESERT,
  "Furnace World":   PLANETS.SAMPLE_NAMES_FURNACE,
  "Grave World":     PLANETS.SAMPLE_NAMES_GRAVE,
  "Ice World":       PLANETS.SAMPLE_NAMES_ICE,
  "Jovian World":    PLANETS.SAMPLE_NAMES_JOVIAN,
  "Jungle World":    PLANETS.SAMPLE_NAMES_JUNGLE,
  "Ocean World":     PLANETS.SAMPLE_NAMES_OCEAN,
  "Rocky World":     PLANETS.SAMPLE_NAMES_ROCKY,
  "Shattered World": PLANETS.SAMPLE_NAMES_SHATTERED,
  "Tainted World":   PLANETS.SAMPLE_NAMES_TAINTED,
  "Vital World":     PLANETS.SAMPLE_NAMES_VITAL,
});

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

// How many prefix + suffix pairs a sector name rolls before it is numbered.
const SECTOR_NAME_ROLLS = 50;
const NAME_NUMERALS = ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** The stored sectors' names — what a new sector's name must not repeat. */
function storedSectorNames() {
  try {
    const sectors = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState")?.sectors;
    return (Array.isArray(sectors) ? sectors : []).map(s => s?.name).filter(n => typeof n === "string");
  } catch (err) {
    console.warn(`${MODULE_ID} | sector name: the stored sectors could not be read — the name is not checked:`, err?.message ?? err);
    return [];
  }
}

/**
 * Generate the sector name from prefix + suffix rolls — never one a stored
 * sector already has (issue #330 D14). Two sectors of one name shared their
 * Actor, NPC and Journal folders (keyed by name) and `!sector <name>` only
 * ever reached the older; a name already taken is rolled again, and after
 * SECTOR_NAME_ROLLS taken pairs (2,500 names in all) the last roll is
 * numbered ("Vega Reach II").
 *
 * @param {Iterable<string>} [taken] — names in use (compared case-blind);
 *   defaults to the stored sectors'
 * @returns {{ prefix: string, suffix: string, full: string }}
 */
export function generateSectorName(taken = storedSectorNames()) {
  const used = new Set(Array.from(taken ?? [], n => String(n ?? "").trim().toLowerCase()).filter(Boolean));
  let prefix = "";
  let suffix = "";
  for (let i = 0; i < SECTOR_NAME_ROLLS; i++) {
    prefix = rollTableResult(SPACE.SECTOR_NAME_PREFIX);
    suffix = rollTableResult(SPACE.SECTOR_NAME_SUFFIX);
    if (!used.has(`${prefix} ${suffix}`.toLowerCase())) return { prefix, suffix, full: `${prefix} ${suffix}` };
  }
  for (let n = 0; ; n++) {
    const numeral = NAME_NUMERALS[n] ?? String(n + 2);
    const numbered = `${prefix} ${suffix} ${numeral}`;
    if (!used.has(numbered.toLowerCase())) return { prefix, suffix: `${suffix} ${numeral}`, full: numbered };
  }
}

/**
 * Create entity journal records for all settlements and the connection.
 * Returns settlement JournalEntry objects (needed for Scene Note pins).
 *
 * @param {SectorResult} sector
 * @param {Object} campaignState
 * @returns {Promise<{ settlements: Object, connectionJournalId: string|null }>}
 */
export async function createEntityJournals(sector, campaignState) {
  const settlements = {};

  // Pre-register a minimal {id, name} stub for this sector in campaignState
  // before any settlement is created. The actor-folder helpers
  // (`getOrCreateSectorActorFolder` in src/entities/folder.js) resolve the
  // per-sector Actor folder by walking `campaignState.sectors[]` for a
  // matching id; without this stub, every settlement created here can't
  // resolve its sector name and falls back to the shared `Sectors / Unsorted`
  // folder (F4). storeSector() later replaces this stub with the full
  // sector record — the stub just keeps the folder lookup alive during
  // entity creation. Idempotent so re-runs don't double-register.
  campaignState.sectors ??= [];
  if (!campaignState.sectors.some(s => s?.id === sector.id)) {
    campaignState.sectors.push({ id: sector.id, name: sector.name });
  }

  // persist:false on the entity creators — storeSector (the only caller of
  // this function in production) performs a single batched game.settings.set
  // at the end. Multiple sequential writes against the same campaignState
  // reference race in Foundry v13 and lose late-stage mutations like
  // sectors.push() and activeSectorId.
  for (const s of sector.settlements) {
    const beforeLen = campaignState.settlementIds?.length ?? 0;
    await createSettlement({
      name:       s.name,
      location:   locationTypeToLabel(s.locationType),
      population: s.population,
      authority:  s.authority,
      projects:   s.projects,
      trouble:    s.trouble ?? null,
      // The starting settlement's zoom-in (step 8); the record's firstLook is
      // a string (SettlementSchema), the generator's a list of 1–2 rolls.
      firstLook:      Array.isArray(s.firstLook) ? s.firstLook.filter(Boolean).join(", ") : (s.firstLook ?? ""),
      initialContact: s.initialContact ?? "",
      planet:     s.planet ?? null,
      stellar:    s.stellar ?? null,
      sectorId:   sector.id,
    }, campaignState, { persist: false });
    const actorId = campaignState.settlementIds?.[beforeLen] ?? null;
    const actor   = actorId ? (game.actors?.get(actorId) ?? null) : null;
    settlements[s.id] = actor;
    if (actor) {
      // Settlements created by the sector generator are canonical — narrator
      // entity discovery must not overwrite them. Flip the lock via the
      // registry so the actor-host path stays correct.
      try {
        const existing = actor.getFlag(MODULE_ID, "settlement") ?? {};
        await actor.setFlag(MODULE_ID, "settlement", {
          ...existing,
          canonicalLocked: true,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`${MODULE_ID} | sectorGenerator: failed to lock settlement ${actorId}:`, err);
      }
    }
  }

  const connBeforeLen = campaignState.connectionIds?.length ?? 0;
  // The disposition and first look the generator rolled are the record's:
  // the narrator's sector roster reads them, and ✦ Finalise re-rolls only
  // what is blank. They reached no store, so Finalise rolled new ones
  // (issue #322 V27; decisions.md → "NPC card population").
  const rolledLook = sector.connection.firstLook;
  await createConnection({
    name:        sector.connection.name,
    role:        sector.connection.role,
    goal:        sector.connection.goal,
    rank:        "dangerous",
    location:    sector.connection.homeSettlement,
    sectorId:    sector.id,
    disposition: sector.connection.aspect ?? null,
    firstLook:   Array.isArray(rolledLook) ? rolledLook.filter(Boolean) : (rolledLook ? [rolledLook] : []),
  }, campaignState, { persist: false });
  // connectionJournalId now carries the NPC-card Actor id (connections converted
  // to `character` Actors under FOLDER-002); the field name is kept for the
  // storeSector/sectorPanel call chain that threads this id through.
  const connectionJournalId = campaignState.connectionIds?.[connBeforeLen] ?? null;
  if (connectionJournalId) {
    // Connections created by the sector wizard are canonical — lock via the
    // actor flag, mirroring the settlement canonical-lock above.
    try {
      const connActor = game.actors?.get(connectionJournalId) ?? null;
      if (connActor) {
        const existing = connActor.getFlag(MODULE_ID, "connection") ?? {};
        await connActor.setFlag(MODULE_ID, "connection", {
          ...existing,
          canonicalLocked: true,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`${MODULE_ID} | sectorGenerator: failed to lock connection ${connectionJournalId}:`, err);
    }

    // Mirror the sector connection onto every existing PC's Connections tab so
    // it shows on the character sheet (createCharacterBondItem is idempotent).
    // When the sector is generated before any PC exists (quickstart order) this
    // no-ops, and the PC-creation backfill in quickstart.js handles it instead.
    try {
      const { getConnection } = await import("../entities/connection.js");
      const { getPlayerActors, createCharacterBondItem } = await import("../character/actorBridge.js");
      const conn = getConnection(connectionJournalId);
      if (conn?._id) {
        for (const pc of getPlayerActors()) {
          await createCharacterBondItem(pc, { name: conn.name, rank: conn.rank, connectionId: conn._id });
        }
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | sectorGenerator: connection→PC link failed:`, err?.message ?? err);
    }
  }

  // Precursor vaults & derelicts — mint a `location`-type Actor per site (same
  // persist:false batching as settlements). buildSiteLocationData marks each
  // canonicalLocked, so narrator entity-discovery never clobbers them. Backfill
  // the new Actor id onto the matching mapData.discoveries entry so the scene
  // builder can link the pin and the reveal flow can update its status.
  const sites = {};
  for (const site of sector.sites ?? []) {
    const beforeLen = campaignState.locationIds?.length ?? 0;
    try {
      await createLocation(buildSiteLocationData(site, sector), campaignState, { persist: false });
    } catch (err) {
      console.error(`${MODULE_ID} | sectorGenerator: failed to create site ${site.name}:`, err);
      continue;
    }
    const actorId = campaignState.locationIds?.[beforeLen] ?? null;
    sites[site.id] = actorId ? (game.actors?.get(actorId) ?? null) : null;
    const disc = (sector.mapData?.discoveries ?? []).find(d => d.id === site.id);
    if (disc) disc.actorId = actorId;
  }

  return { settlements, connectionJournalId, sites };
}

/**
 * Store a completed sector to campaign state with all enhanced IDs.
 *
 * @param {SectorResult} sector
 * @param {Object} extras — { settlements, connectionJournalId, backgroundPath, sceneId, sectorJournalId, stubs }
 * @param {Object} campaignState
 * @returns {Promise<StoredSector>}
 */
export async function storeSector(sector, extras, campaignState) {
  const {
    settlements      = {},
    connectionJournalId = null,
    sites            = {},
    backgroundPath   = null,
    sceneId          = null,
    sectorJournalId  = null,
    stubs            = { sector: null, settlements: {} },
  } = extras ?? {};

  // Single source of truth: the global lists campaignState.settlementIds and
  // campaignState.connectionIds are authoritative. Each sector record below
  // holds a *reference subset* of those same JournalEntry IDs — never a copy
  // or a parallel ID space. createSettlement()/createConnection() are
  // responsible for pushing IDs to the global lists; we read the same IDs
  // back here via `settlements`/`connectionJournalId`.
  const stored = {
    id:                 sector.id,
    name:               sector.name,
    region:             sector.region,
    regionLabel:        sector.regionLabel,
    trouble:            sector.trouble,
    faction:            sector.faction,
    createdAt:          sector.createdAt,
    mapData:            sector.mapData,
    settlementIds:      Object.values(settlements).map(j => j?.id ?? null).filter(Boolean),
    siteActorIds:       Object.values(sites).map(a => a?.id ?? null).filter(Boolean),
    connectionId:       connectionJournalId,
    // Enhanced fields
    backgroundPath,
    sceneId,
    sectorJournalId,
    entityJournalIds:   Object.fromEntries(
      Object.entries(settlements).map(([id, j]) => [id, j?.id ?? null])
    ),
    backgroundGenerated: !!backgroundPath,
    stubs,
  };

  // Save to campaign state
  // Backward-compat: the Quench test pre-dates the extras parameter and calls
  // storeSector(sector, campaignState) with two arguments. Detect that case
  // and remap so callers using the old two-arg signature still work.
  if (campaignState === undefined) {
    campaignState = extras ?? {};
  }

  // §3.5: saveSectorToJournal removed — no production code read the
  // "Starforged Sectors" JournalEntry flag, and campaignState.sectors[] is
  // the authoritative store. The migrator deletes any orphan journal left
  // by pre-migration runs.

  // World Journal integration — record the sector trouble as an active
  // threat so the narrator-context assembler surfaces it during play.
  // Non-blocking: a WJ write failure should not abort sector creation.
  // The threat is named by its trouble AND its sector: recordThreat upserts
  // by name, and the Sector Trouble table has 20 rows, so a second sector
  // that rolled the same trouble took over the first's page — ACTIVE THREATS
  // told the first sector's trouble as the second's, and resolving it for
  // one resolved both (issue #342 Z65). A retried creation of the same
  // sector still updates its own page (known-issues SECTOR-CREATE-PARTIAL).
  if (sector?.trouble) {
    try {
      await recordThreat(sector.name ? `${sector.trouble} — ${sector.name}` : sector.trouble, {
        type:     "environmental",
        severity: "looming",
        summary:  `Trouble in ${sector.name ?? "this sector"}: ${sector.trouble}`,
      }, campaignState);
    } catch (err) {
      console.warn(`${MODULE_ID} | sectorGenerator: recordThreat failed for ${sector.name}:`, err?.message ?? err);
    }
  }

  // The record and the active sector reach the caller's object only once the
  // world has taken them: set before the write, a refusal left the GM's
  // cached campaignState claiming the sector, and the retry found it "already
  // stored" there and wrote nothing (issue #329 X11).
  await persistSectorOntoStore(stored, campaignState);
  applyStoredSector(campaignState, stored);

  return stored;
}

/**
 * Put a sector the world has stored onto the caller's campaignState: its
 * record (replacing the {id, name} stub createEntityJournals registered so
 * the actor-folder helpers could resolve the sector's folder — F4) and the
 * active sector.
 *
 * @param {Object} campaignState
 * @param {Object} stored
 */
function applyStoredSector(campaignState, stored) {
  // Defensive init — Quench test mock predates these fields in CampaignStateSchema.
  campaignState.sectors     ??= [];
  campaignState.locationIds ??= [];
  const stubIdx = campaignState.sectors.findIndex(s => s?.id === stored.id);
  if (stubIdx >= 0) campaignState.sectors[stubIdx] = stored;
  else              campaignState.sectors.push(stored);
  campaignState.activeSectorId = stored.id;
}

/**
 * Write a new sector onto the LATEST stored campaignState — its record, the
 * active sector, and the entity ids its creators registered on the caller's
 * copy (they run with persist:false so sector creation is one write) — never
 * the caller's whole object. Sector creation holds that copy across entity
 * creation, art and narrator calls, often minutes; writing it whole reverted
 * every write relayed meanwhile, an X-Card included (issue #300 F14). Read at
 * its turn on the client's campaignState write chain (CAMPSTATE-CHAIN-REST).
 *
 * @param {Object} stored         the sector record storeSector built
 * @param {Object} campaignState  the caller's copy (already updated in place)
 */
async function persistSectorOntoStore(stored, campaignState) {
  try {
    await serialiseCampaignStateWrite(() => {
      const latest  = game.settings.get(MODULE_ID, "campaignState") ?? {};
      const sectors = Array.isArray(latest.sectors) ? [...latest.sectors] : [];
      const at      = sectors.findIndex(s => s?.id === stored.id);
      if (at >= 0) sectors[at] = stored;
      else         sectors.push(stored);
      const next = { ...latest, sectors, activeSectorId: stored.id };
      for (const key of ENTITY_ID_LISTS) {
        const merged = unionIdList(latest[key], campaignState[key]);
        if (merged) next[key] = merged;
      }
      return game.settings.set(MODULE_ID, "campaignState", next);
    }, "sector");
  } catch (err) {
    console.error(`${MODULE_ID} | sectorGenerator: storing the sector failed:`, err);
    throw err;
  }
}

/**
 * Generate atmospheric narrator stubs for a sector and all its settlements.
 * Uses claude-haiku — brief, fast, uncached. Returns empty stubs on failure.
 *
 * @param {SectorResult} sector
 * @param {Object} [narratorSettings] — { perspective, tone }
 * @returns {Promise<{ sector: string|null, settlements: Object }>}
 */
export async function generateNarratorStubs(sector, narratorSettings = {}) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) return { sector: null, settlements: {} };

  // The narration's own perspective — `auto` resolved as the narrator
  // resolves it. The stub compared the setting with "first", a value it never
  // holds (auto / second_person / third_person), so a third-person campaign's
  // Sector Record and settlement descriptions addressed "you" (issue #326 W73).
  const { resolveNarrationPerspective } = await import("../narration/narratorPrompt.js");
  const perspective = resolveNarrationPerspective(narratorSettings.perspective ?? "auto");
  const perspectiveNote = perspective === "third_person"
    ? "Narrate in third person (refer to the characters by name, never as 'you')"
    : "Narrate in second person (address the protagonist as 'you')";

  const regionLabel   = REGION_LABELS[sector.region] ?? sector.regionLabel ?? sector.region;
  const settlementList = sector.settlements
    .map(s => `${s.name} (${locationTypeToLabel(s.locationType)})`)
    .join(", ");

  // Fire the sector stub and every settlement stub in parallel — they're
  // independent calls and serialising them stacks Anthropic round-trips,
  // which on Forge can push wall-clock past the Quench live-API timeout.
  const [sectorStubText, ...settlementResults] = await Promise.all([
    callStubApi(
      buildSectorStubPrompt(sector, regionLabel, settlementList, perspectiveNote),
      // ~110 words for a 2–3 sentence atmospheric paragraph. 150 tokens cut the
      // prose off mid-sentence (F4); 320 lets the requested length complete.
      320,
      apiKey
    ).catch(err => {
      console.warn(`${MODULE_ID} | sectorGenerator: sector stub generation failed:`, err);
      return null;
    }),
    ...sector.settlements.map(s =>
      callStubApi(
        buildSettlementStubPrompt(s, sector, regionLabel, perspectiveNote),
        // 1–2 sentences; 100 tokens risked the same mid-sentence cut-off.
        220,
        apiKey
      ).catch(err => {
        console.warn(`${MODULE_ID} | sectorGenerator: settlement stub generation failed for ${s.id}:`, err);
        return null;
      })
    ),
  ]);

  const settlements = Object.fromEntries(
    sector.settlements.map((s, i) => [s.id, settlementResults[i]])
  );

  return { sector: sectorStubText, settlements };
}

/**
 * Write each settlement narrator stub into its settlement Actor's description,
 * so the canonical entity carries the same prose as the sector journal page.
 *
 * Settlements are foundry-ironsworn `location` Actors post-migration; the stub
 * is routed through `updateSettlement`, which patches both `system.description`
 * (the sheet body) and the module flag (`flags.settlement.description`). The
 * pre-migration code wrote to a JournalEntry page that no longer exists, so the
 * stub was silently dropped and sector-born settlements rendered with an empty
 * body (finding F3). A settlement with no stub — narrator stubs off, no key,
 * or the call failed — still gets its rolled-details line: it was written
 * only beside a stub, so the sheet showed nothing the wizard rolled
 * (known-issues SECTOR-CARD-GAPS).
 *
 * @param {Object} settlements — { sourceSettlementGenId: Actor|null }
 * @param {{ settlements?: Object }} stubs — output from generateNarratorStubs()
 * @returns {Promise<void>}
 */
export async function applyStubsToSettlementEntities(settlements, stubs) {
  for (const [sourceId, actor] of Object.entries(settlements ?? {})) {
    if (!actor?.id) continue;
    const stub = stubs?.settlements?.[sourceId] ?? null;
    try {
      // F17: combine the narrator prose with a structured rolled-detail block
      // so the sheet displays both the atmospheric description AND the
      // Population/Authority/Projects/Trouble that the wizard rolled.
      const data = actor.flags?.[MODULE_ID]?.settlement ?? {};
      const description = composeSettlementDescription(stub, data);
      if (!description) continue;
      await updateSettlement(actor.id, { description });
    } catch (err) {
      console.warn(`${MODULE_ID} | Sector: could not write stub to settlement Actor:`, err.message);
    }
  }
}

/**
 * Finalize sector-created settlement entities: stamp `finalizedAt` and trigger
 * a first-time portrait (which Foundry installs as both the Actor's `img` and
 * its `prototypeToken.texture.src`, so the token in scenes matches the sheet).
 * Resolves F5 from the v1.7.0 playtest — settlements landed in the world
 * without portraits or tokens, leaving the GM to click ✦ Finalise on each one
 * manually. Once the sector wizard runs (a deliberate GM-paid action), the
 * settlements get the same finalize pass that the Entity Panel button does,
 * minus the redundant Claude flavour call — the narrator stubs already
 * generated the rich prose and we use that as the portrait source.
 *
 * Per-settlement failures are logged but never abort the loop; an unset
 * OpenRouter key, a missing stub, or a write error skips the affected
 * settlement and the rest still finalize.
 *
 * @param {Object} settlementsByGenId    — { sourceSettlementGenId: Actor|null } from createEntityJournals
 * @param {{ settlements?: Object }} stubs — output from generateNarratorStubs()
 * @param {Object} campaignState
 * @returns {Promise<{ finalized: number, portraitsTriggered: number, skipped: number }>}
 */
export async function finalizeSectorEntities(settlementsByGenId, stubs, campaignState) {
  let finalized = 0, portraitsTriggered = 0, skipped = 0;
  if (!settlementsByGenId) return { finalized, portraitsTriggered, skipped };

  for (const [genId, actor] of Object.entries(settlementsByGenId)) {
    if (!actor?.id) { skipped++; continue; }
    const stub = stubs?.settlements?.[genId] ?? null;
    try {
      const result = await finalizeEntityArtOnly(
        "settlement",
        actor.id,
        campaignState,
        { portraitSourceDescription: stub }
      );
      if (result.ok && result.reason === "finalized") {
        finalized++;
        if (result.artTriggered) portraitsTriggered++;
      } else if (result.reason === "already-finalized") {
        skipped++;
      } else {
        console.warn(`${MODULE_ID} | finalizeSectorEntities: ${actor.id} → ${result.reason}`);
        skipped++;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | finalizeSectorEntities: ${actor.id} threw:`, err?.message ?? err);
      skipped++;
    }
  }
  return { finalized, portraitsTriggered, skipped };
}

/**
 * Build the settlement-sheet description body: narrator prose first, then a
 * compact, dot-separated facts line carrying every rolled oracle result. The
 * foundry-ironsworn Location-actor schema only exposes `subtype`/`klass`/
 * `description` — there's no `system.population` / `system.authority` /
 * etc. — so the rolled details either ride in the description HTML or stay
 * invisible to the sheet (F17).
 *
 * @param {string} prose       — narrator-generated atmospheric prose, HTML or plain.
 * @param {Object} data        — settlement payload (matches SettlementSchema).
 * @returns {string} description HTML.
 */
export function composeSettlementDescription(prose, data = {}) {
  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const parts = [];
  if (data.location)            parts.push(`<strong>Location:</strong> ${esc(data.location)}`);
  if (data.population)          parts.push(`<strong>Population:</strong> ${esc(data.population)}`);
  if (data.authority)           parts.push(`<strong>Authority:</strong> ${esc(data.authority)}`);
  if (data.projects?.length)    parts.push(`<strong>Projects:</strong> ${data.projects.map(esc).join(", ")}`);
  if (data.trouble)             parts.push(`<strong>Trouble:</strong> ${esc(data.trouble)}`);
  if (data.firstLook)           parts.push(`<strong>First look:</strong> ${esc(data.firstLook)}`);
  if (data.initialContact)      parts.push(`<strong>Initial contact:</strong> ${esc(data.initialContact)}`);
  if (data.stellar)             parts.push(`<strong>Stellar object:</strong> ${esc(data.stellar)}`);

  const proseHtml  = prose ? (prose.trim().startsWith("<") ? prose : `<p>${esc(prose)}</p>`) : "";
  const factsHtml  = parts.length ? `<p>${parts.join(" &middot; ")}</p>` : "";
  if (proseHtml && factsHtml) return `${proseHtml}<hr>${factsHtml}`;
  return proseHtml || factsHtml;
}

/**
 * Create a Foundry journal entry for a sector with narrator stubs as pages.
 *
 * @param {SectorResult} sector
 * @param {{ sector: string|null, settlements: Object }} stubs
 * @returns {Promise<JournalEntry|null>}
 */
export async function createSectorJournal(sector, stubs = {}, settlementsByGenId = {}) {
  try {
    const regionLabel = REGION_LABELS[sector.region] ?? sector.regionLabel ?? sector.region;

    // Per issue #228 (Entity → Actor Migration) §3.4: sector-record journals
    // live under per-sector subfolders, not flat under "Sectors". The campaign
    // state may not have the slim sectors[] entry yet when this is called
    // during storeSector — pass through what we know.
    const folderId = await getOrCreateSectorJournalFolder(sector.id, {
      sectors: [{ id: sector.id, name: sector.name }],
    });

    const journal = await JournalEntry.create({
      name:   `${sector.name} — Sector Record`,
      folder: folderId,
      flags: {
        [MODULE_ID]: {
          sectorRecord: true,
          sectorId:     sector.id,
        },
      },
    });

    // §3.6 — Settlement list renders as Foundry document links to the
    // settlement Actors so it stays current when the GM edits an Actor.
    // The settlements map (gen-side id → Actor) is provided by the caller
    // (storeSector / createEntityJournals); without it, the helper falls
    // back to a plain text list of names. The wrapper marker comments let
    // the live updateActor hook and the migrator's sector-rewrite step
    // replace just this section without disturbing the narrator stub.
    const settlementListHtml = buildSettlementsListHtml(sector, settlementsByGenId);

    const passageCount = sector.passages?.length ?? 0;
    const passageSummary = passageCount === 1 ? "1 passage" : `${passageCount} passages`;

    await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name: sector.name,
      type: "text",
      text: {
        content: `<h2>${escapeHtml(sector.name)}</h2>
<p><strong>Region:</strong> ${escapeHtml(regionLabel)}</p>
<p><strong>Trouble:</strong> ${escapeHtml(sector.trouble)}</p>
${sector.faction ? `<p><strong>Control:</strong> ${escapeHtml(sector.faction)}</p>` : ""}
<hr>
<p class="narrator-stub">${escapeHtml(stubs.sector ?? "")||"<em>No narrator text generated.</em>"}</p>
<hr>
<h3>Settlements</h3>
${settlementListHtml}
<h3>Passages</h3>
<p>${escapeHtml(passageSummary)} charted.</p>`,
        format: 1,
      },
    }]);

    // §3.6: per-settlement embedded pages are no longer generated. Settlement
    // detail lives on the Actor; the overview's UUID links resolve there.
    return journal;
  } catch (err) {
    console.error(`${MODULE_ID} | createSectorJournal failed:`, err);
    throw err;
  }
}




// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roll on a table and return the result string.
 *
 * Resolves rulebook directive entries in-place so callers never see raw
 * `"Roll twice"`, `"Roll again …"`, or `"Action + Theme"` strings:
 *
 *   - `"Roll twice"`     → roll twice more on the same table, join with `" / "`.
 *   - `"Roll again …"`   → roll twice more on the same table, join with `" / "`.
 *   - `ref: "action_theme"` → roll CORE.ACTION + CORE.THEME, join with `" "`.
 *
 * Recursion is depth-capped (`MAX_DIRECTIVE_DEPTH`); at the cap we fall back
 * to whatever the directive entry's `result` string was so the chain
 * terminates with something readable rather than throwing.
 *
 * @param {Array<{min:number, max:number, result:string, ref?:string}>} table
 * @param {number} [fixedRoll]
 * @param {{ depth?: number, fixedRolls?: number[] }} [opts]
 * @returns {string}
 */
const MAX_DIRECTIVE_DEPTH = 4;

export function rollTableResult(table, fixedRoll, opts = {}) {
  const depth      = opts.depth ?? 0;
  const fixedRolls = opts.fixedRolls;
  const roll       = fixedRoll
    ?? (fixedRolls && fixedRolls.length ? fixedRolls.shift() : rollD100());
  const entry      = table.find(e => roll >= e.min && roll <= e.max);
  if (!entry) return "Unknown";

  // Cross-reference directives: "Action + Theme" / "Descriptor + Focus" roll
  // their CORE pairs (DESCRIPTOR-FOCUS-UNCHAINED fix, 2026-07 — only the
  // action_theme chain existed; descriptor_focus rows leaked the placeholder
  // string into generated sector data).
  if (entry.ref === "descriptor_focus") {
    if (depth >= MAX_DIRECTIVE_DEPTH) return "Unknown";
    const sub = { depth: depth + 1, fixedRolls };
    const d = rollTableResult(CORE.DESCRIPTOR, undefined, sub);
    const f = rollTableResult(CORE.FOCUS, undefined, sub);
    return `${d} ${f}`;
  }
  if (entry.ref === "action_theme") {
    if (depth >= MAX_DIRECTIVE_DEPTH) return "Unknown";
    const sub = { depth: depth + 1, fixedRolls };
    const action = rollTableResult(CORE.ACTION, undefined, sub);
    const theme  = rollTableResult(CORE.THEME,  undefined, sub);
    return `${action} ${theme}`;
  }

  // "Roll again …" or "Roll twice" — resolve to exactly two NON-directive
  // entries on the same table and join with `" / "`.
  //
  // Each side re-rolls past further directive rows (bounded) rather than
  // recursing into them: a mis-transcribed FAMILY_NAMES once had a "Roll again
  // (paired name)" band at 81-100 that re-hit ~20% of the time, compounding
  // into multi-hyphen chains, and at the old depth cap the raw literal leaked
  // verbatim into names. The table now follows the rulebook — 100 single
  // names (issue #321 U63) — and the bounded re-roll stays for "Roll twice".
  if (/^Roll (twice|again)\b/i.test(entry.result)) {
    const a = rollNonDirectiveResult(table, fixedRolls);
    const b = rollNonDirectiveResult(table, fixedRolls);
    return `${a} / ${b}`;
  }

  return entry.result;
}

function isDirectiveEntry(entry) {
  return entry?.ref === "action_theme"
      || entry?.ref === "descriptor_focus"
      || /^Roll (twice|again)\b/i.test(entry?.result ?? "");
}

/**
 * Roll on a table until a non-directive entry lands (bounded), consuming
 * `fixedRolls` like the main roller so deterministic test sequences keep
 * working. Exhaustion falls back to a uniform pick over the table's
 * non-directive entries — never the directive literal.
 */
function rollNonDirectiveResult(table, fixedRolls, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const roll  = (fixedRolls && fixedRolls.length ? fixedRolls.shift() : rollD100());
    const entry = table.find(e => roll >= e.min && roll <= e.max);
    if (entry && !isDirectiveEntry(entry)) return entry.result;
  }
  const plain = table.filter(e => !isDirectiveEntry(e));
  return plain.length
    ? plain[Math.floor(Math.random() * plain.length)].result
    : "Unknown";
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

/**
 * A planet's name, rolled on its class's Sample Names table — the rulebook's
 * step 5. It came from an invented 8 × 8 prefix / suffix list whatever the
 * class ("Mireth Secundus" for a Jovian world), shown on the map, the
 * settlement cards and in the narrator's context (issue #331 X48). The
 * Creator's rename stays the way to give a planet a name of the table's own.
 *
 * @param {string} planetType — a Planetary Class result ("Jovian World")
 * @returns {string}
 */
function generatePlanetName(planetType) {
  const table = PLANET_SAMPLE_NAMES[planetType] ?? PLANETS.SAMPLE_NAMES_ROCKY;
  return rollTableResult(table);
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

function getClaudeApiKey() {
  try {
    return game.settings.get(MODULE_ID, "claudeApiKey") || null;
  } catch (err) {
    console.warn(`${MODULE_ID} | sectorGenerator: claudeApiKey settings read failed:`, err);
    return null;
  }
}

function buildSectorStubPrompt(sector, regionLabel, settlementList, perspectiveNote) {
  return `You are the narrator for an Ironsworn: Starforged campaign.
Write ONE paragraph (2–3 sentences) describing this sector of space.
Be atmospheric and evocative. ${perspectiveNote}. Wry tone.
Do not introduce plot elements not present in the description.

Sector: ${sector.name}
Region: ${regionLabel}
Current trouble: ${sector.trouble}
${sector.faction ? `Controlling power: ${sector.faction}` : ""}
Settlements: ${settlementList}

Write the paragraph now. No preamble.`;
}

export function buildSettlementStubPrompt(settlement, sector, regionLabel, perspectiveNote = "") {
  const perspective = perspectiveNote || "Narrate in second person (address the protagonist as 'you')";
  const planetLine  = settlement.planet
    ? `Planet: ${settlement.planet.type} (${settlement.planet.name})`
    : "";
  // The starting settlement's zoom-in (step 8) — the stub sits beside these
  // rolled details on the settlement's sheet, so it must not contradict them.
  const firstLook = Array.isArray(settlement.firstLook)
    ? settlement.firstLook.filter(Boolean).join(", ")
    : (settlement.firstLook ?? "");
  return `You are the narrator for an Ironsworn: Starforged campaign.
Write ONE paragraph (2–3 sentences) describing this settlement.
Be atmospheric. ${perspective}. Wry tone.
Do not introduce plot elements not present in the description.

Settlement: ${settlement.name}
Type: ${locationTypeToLabel(settlement.locationType)}
Population: ${settlement.population}
Authority: ${settlement.authority}
Projects: ${(settlement.projects ?? []).join(", ")}
${firstLook ? `First look: ${firstLook}` : ""}
${settlement.initialContact ? `Initial contact: ${settlement.initialContact}` : ""}
${settlement.trouble ? `Current trouble: ${settlement.trouble}` : ""}
${planetLine}
Sector: ${sector.name} (${regionLabel})

Write the paragraph now. No preamble.`;
}

async function callStubApi(prompt, maxTokens, apiKey) {
  const body = {
    model:      STUB_MODEL,
    max_tokens: maxTokens,
    messages:   [{ role: "user", content: prompt }],
  };
  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
  };
  const data = await apiPost(ANTHROPIC_URL, headers, body);
  const stopReason = data.stop_reason;
  const text = (data.content ?? [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");
  if (!text) throw new Error("Stub API returned no text");
  // If the model hit the token ceiling mid-sentence (F4), trim back to the last
  // complete sentence so the prose never ends on a dangling clause. Only when
  // truncated by length and a clean earlier sentence boundary exists.
  return trimToLastSentence(text.trim(), stopReason === "max_tokens");
}

/**
 * Trim text to its last complete sentence when it was cut off by the token
 * limit and doesn't already end on terminal punctuation. Leaves naturally
 * complete text untouched.
 *
 * @param {string} text
 * @param {boolean} wasTruncated  true when stop_reason was "max_tokens"
 * @returns {string}
 */
function trimToLastSentence(text, wasTruncated) {
  if (!wasTruncated) return text;
  if (/[.!?]["')\]]?\s*$/.test(text)) return text;       // already ends cleanly
  // Find the last sentence-ending punctuation, then keep any immediately
  // following closing quote/paren so dialogue like `"...end."` stays intact.
  const m = /[.!?]["')\]]?/g;
  let lastEnd = -1, match;
  while ((match = m.exec(text)) !== null) lastEnd = match.index + match[0].length;
  if (lastEnd <= 0) return text;                          // no earlier boundary — leave as-is
  return text.slice(0, lastEnd).trim();
}

export { trimToLastSentence };

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
