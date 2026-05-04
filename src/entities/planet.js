/**
 * STARFORGED COMPANION
 * src/entities/planet.js — Planet records
 *
 * Planets are discovered and described over time. They have:
 * — A planet type (from the oracle)
 * — Observed-from-space details and planetside features
 * — Life and atmosphere indicators
 * — An optional settlement list
 * — Context injection when the scene is on or around this planet
 *
 * Planets don't have progress tracks or mechancal meters.
 * They're primarily narrative and context-injection entities.
 */

const MODULE_ID = "starforged-companion";
const FLAG_KEY  = "planet";

export const PlanetSchema = {
  _id:    "",
  name:   "",
  active: true,

  // Oracle-derived classification
  type:           "",    // e.g. "Desert World", "Vital World"
  atmosphere:     "",    // e.g. "Breathable", "Toxic", "None / thin"
  life:           "",    // e.g. "Diverse", "Scarce", "None"
  observedFromSpace: "", // First look from space oracle result

  // Planetside details (filled in through exploration)
  features:       [],    // Planetside Feature oracle results
  biomes:         [],    // Vital World biome results
  diversity:      "",    // Vital World diversity result

  // Settlements and hazards
  settlementIds:  [],    // Settlement _ids on or orbiting this planet
  peril:          "",    // Most recent Planetside Peril result
  opportunity:    "",    // Most recent Planetside Opportunity result

  // Narrative
  description:    "",
  notes:          "",

  // Art
  portraitId:                null,
  portraitSourceDescription: "",

  // Context injection
  sceneRelevant:   false,
  loremasterNotes: "",

  createdAt: null,
  updatedAt: null,
};


export async function createPlanet(data, campaignState) {
  const now = new Date().toISOString();
  const id  = generateId();

  const planet = {
    ...PlanetSchema,
    ...data,
    _id:       id,
    features:  data.features ?? [],
    biomes:    data.biomes ?? [],
    createdAt: now,
    updatedAt: now,
  };

  const entry = await JournalEntry.create({
    name:  planet.name || "Unknown Planet",
    flags: { [MODULE_ID]: { entityType: "planet", entityId: id } },
  });

  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name:  "Planet Data",
    type:  "text",
    flags: { [MODULE_ID]: { [FLAG_KEY]: planet } },
  }]);

  if (!campaignState.planetIds) campaignState.planetIds = [];
  if (!campaignState.planetIds.includes(entry.id)) {
    campaignState.planetIds.push(entry.id);
    await persistCampaignState(campaignState);
  }

  return planet;
}

export function getPlanet(journalEntryId) {
  try {
    const entry = game.journal?.get(journalEntryId);
    const page  = entry?.pages?.contents?.[0];
    return page?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? null;
  } catch {
    return null;
  }
}

export function listPlanets(campaignState) {
  return (campaignState.planetIds ?? [])
    .map(id => getPlanet(id))
    .filter(Boolean);
}

export async function updatePlanet(journalEntryId, updates) {
  const entry = game.journal?.get(journalEntryId);
  if (!entry) throw new Error(`Planet journal entry not found: ${journalEntryId}`);

  const page    = entry.pages?.contents?.[0];
  const current = page?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? {};
  const updated = {
    ...current,
    ...updates,
    _id:       current._id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await page.setFlag(MODULE_ID, FLAG_KEY, updated);

  if (updates.name && updates.name !== entry.name) {
    await entry.update({ name: updates.name });
  }

  return updated;
}

/**
 * Add a discovered planetside feature.
 * Features accumulate as the planet is explored — append only.
 *
 * @param {string} journalEntryId
 * @param {string} feature — Oracle result or player description
 * @returns {Promise<Object>}
 */
export async function addFeature(journalEntryId, feature) {
  const planet = getPlanet(journalEntryId);
  if (!planet) throw new Error(`Planet not found: ${journalEntryId}`);

  const features = [...(planet.features ?? []), feature];
  return updatePlanet(journalEntryId, { features });
}

export async function setSceneRelevant(journalEntryId, value) {
  return updatePlanet(journalEntryId, { sceneRelevant: value });
}

export async function setPortraitId(journalEntryId, artAssetId) {
  return updatePlanet(journalEntryId, { portraitId: artAssetId });
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
