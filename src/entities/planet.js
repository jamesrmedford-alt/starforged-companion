/**
 * STARFORGED COMPANION
 * src/entities/planet.js — Planet records, hosted on foundry-ironsworn
 * `location` Actor documents with `system.subtype='planet'` (Phase 3 of the
 * Entity → Actor Migration).
 *
 * Field placement (per docs/entity-actor-migration-scope.md §3.2):
 *   actor.name                            ← planet.name
 *   actor.img                             ← portrait dataUri (set by art pipeline)
 *   actor.system.subtype                  = "planet"
 *   actor.system.klass                    ← planet.type (Desert / Vital / ...)
 *   actor.system.description              ← planet.description
 *   actor.flags[MODULE].planet            ← full Starforged payload
 *   actor.flags[MODULE].entityType        ← "planet"
 *   actor.flags[MODULE].entityId          ← preserved _id
 *
 * Native location-actor schema lives at
 * vendor/foundry-ironsworn/src/module/actor/subtypes/location.ts — schema
 * carries `subtype`, `klass`, `description` only; everything else lives in
 * module flags.
 */

import { getOrCreateSectorActorFolder } from "./folder.js";
import {
  getEntityDocument,
  readEntityFlag,
  writeEntityFlag,
} from "./registry.js";

const MODULE_ID = "starforged-companion";
const FLAG_KEY  = "planet";

export const PlanetSchema = {
  _id:    "",
  name:   "",
  active: true,

  type:    "",        // Planet class oracle result (Desert / Vital / Furnace / ...)
  atmosphere: "",     // "Breathable" | "Marginal" | "Hostile" | "None"
  life:       "",     // "Diverse" | "Scarce" | "None"

  // Oracle-derived narrative
  observedFromSpace: "",   // First look from orbit
  features:    [],         // Planetside features (array of oracle results)
  biomes:      [],         // Vital-world biome list
  diversity:   "",
  peril:       "",
  opportunity: "",

  // Linked entities
  settlementIds: [],

  // Sector membership — drives per-sector Actor folder placement
  sectorId: null,

  // Narrative
  description:    "",
  notes:          "",

  // Art
  portraitId:                  null,
  portraitSourceDescription:   "",

  // Context injection
  sceneRelevant:   false,
  loremasterNotes: "",

  // Narrator entity-discovery flags
  canonicalLocked: false,
  generativeTier:  [],

  createdAt: null,
  updatedAt: null,
};


export async function createPlanet(data, campaignState, { persist = true } = {}) {
  const now = new Date().toISOString();
  const id  = generateId();

  const planet = {
    ...PlanetSchema,
    ...data,
    _id:       id,
    features:  data.features ?? [],
    biomes:    data.biomes ?? [],
    sectorId:  data.sectorId ?? campaignState?.activeSectorId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const folderId = await getOrCreateSectorActorFolder(planet.sectorId, "Planets", campaignState);

  const actor = await Actor.create({
    name:   planet.name || "Unknown Planet",
    type:   "location",
    folder: folderId,
    system: {
      subtype:     "planet",
      klass:       planet.type ?? null,
      description: planet.description ?? "",
    },
    flags:  {
      [MODULE_ID]: {
        [FLAG_KEY]:  planet,
        entityType:  "planet",
        entityId:    id,
      },
    },
  });

  if (!campaignState.planetIds) campaignState.planetIds = [];
  if (!campaignState.planetIds.includes(actor.id)) {
    campaignState.planetIds.push(actor.id);
    if (persist) await persistCampaignState(campaignState);
  }

  return planet;
}

export function getPlanet(actorId) {
  try {
    return readEntityFlag("planet", getEntityDocument("planet", actorId));
  } catch {
    return null;
  }
}

export function listPlanets(campaignState) {
  return (campaignState.planetIds ?? [])
    .map(id => getPlanet(id))
    .filter(Boolean);
}

export async function updatePlanet(actorId, updates) {
  const document = getEntityDocument("planet", actorId);
  if (!document) throw new Error(`Planet actor not found: ${actorId}`);

  const current = readEntityFlag("planet", document) ?? {};
  const updated = {
    ...current,
    ...updates,
    _id:       current._id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  // Mirror native fields onto the Actor document so the system sheet renders.
  const systemPatch = {};
  if (updates.type !== undefined)        systemPatch["system.klass"]       = updated.type ?? null;
  if (updates.description !== undefined) systemPatch["system.description"] = updated.description ?? "";
  if (Object.keys(systemPatch).length) await document.update(systemPatch);

  await writeEntityFlag("planet", document, updated);

  if (updates.name && updates.name !== document.name) {
    await document.update({ name: updates.name });
  }

  return updated;
}

/**
 * Add a discovered planetside feature.
 * Features accumulate as the planet is explored — append only.
 *
 * @param {string} actorId
 * @param {string} feature — Oracle result or player description
 * @returns {Promise<Object>}
 */
export async function addFeature(actorId, feature) {
  const planet = getPlanet(actorId);
  if (!planet) throw new Error(`Planet not found: ${actorId}`);

  const features = [...(planet.features ?? []), feature];
  return updatePlanet(actorId, { features });
}

export async function setSceneRelevant(actorId, value) {
  return updatePlanet(actorId, { sceneRelevant: value });
}

export async function setPortraitId(actorId, artAssetId) {
  return updatePlanet(actorId, { portraitId: artAssetId });
}

export function isReadyForArtGeneration(planet) {
  return planet.active && !!planet.portraitSourceDescription && !planet.portraitId;
}

/**
 * Format a Planet for Loremaster context injection.
 *
 * @param {Object} planet
 * @returns {string}
 */
export function formatForContext(planet) {
  const parts = [`**${planet.name || "Unknown Planet"}**`];

  if (planet.type)          parts.push(planet.type);
  if (planet.atmosphere)    parts.push(`Atmosphere: ${planet.atmosphere}`);
  if (planet.life)          parts.push(`Life: ${planet.life}`);

  if (planet.biomes?.length) {
    parts.push(`Biomes: ${planet.biomes.join(", ")}`);
  }

  if (planet.features?.length) {
    // Only include the most recently discovered feature to keep context concise
    parts.push(`Notable: ${planet.features[planet.features.length - 1]}`);
  }

  if (planet.description)      parts.push(planet.description);
  if (planet.loremasterNotes)  parts.push(`Note: ${planet.loremasterNotes}`);

  return parts.join(" | ");
}

function generateId() {
  try { return foundry.utils.randomID(); }
  catch { return Math.random().toString(36).slice(2, 10); }
}

async function persistCampaignState(campaignState) {
  try {
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
  } catch (err) {
    console.error(`${MODULE_ID} | planet: persistCampaignState failed:`, err);
    throw err;
  }
}
