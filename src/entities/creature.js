/**
 * STARFORGED COMPANION
 * src/entities/creature.js — Creature records
 *
 * Creatures are named or typed beings that aren't tracked as connections:
 * Starforged creature types, AI fragments, unique named beasts.
 *
 * They have:
 * — Environment (space / interior / land / liquid / air / any)
 * — Scale (creature / monster / horror / colossus)
 * — First look, aspect, behavior, encounter (oracle-derived)
 * — An optional combat rank and attack pattern when used as opponents
 *
 * Creatures don't have progress tracks. A combat track is created separately
 * via the progress tracks panel when a creature becomes an opponent.
 *
 * Storage: JournalEntry + JournalEntryPage, same pattern as planets.
 */

const MODULE_ID = "starforged-companion";
const FLAG_KEY  = "creature";

export const CreatureSchema = {
  _id:    "",
  name:   "",
  active: true,

  environment: "",  // "space" | "interior" | "land" | "liquid" | "air" | "any"
  scale:       "",  // "creature" | "monster" | "horror" | "colossus"
  form:        "",  // Oracle result or freeform description

  firstLook: [],
  aspect:    [],
  behavior:  "",
  encounter: "",

  rank:          "",  // Combat rank if used as opponent
  attackPattern: "",

  description: "",
  notes:       "",

  // Art
  portraitId:                null,
  portraitSourceDescription: "",

  // Context injection
  sceneRelevant:  false,
  narratorNotes:  "",

  // Narrator entity-discovery flags (see narrator-entity-discovery scope §3)
  canonicalLocked: false,
  generativeTier:  [],

  createdAt: null,
  updatedAt: null,
};


export async function createCreature(data, campaignState) {
  const now = new Date().toISOString();
  const id  = generateId();

  const creature = {
    ...CreatureSchema,
    ...data,
    _id:       id,
    firstLook: data.firstLook ?? [],
    aspect:    data.aspect ?? [],
    createdAt: now,
    updatedAt: now,
  };

  const entry = await JournalEntry.create({
    name:  creature.name || "Unknown Creature",
    flags: { [MODULE_ID]: { entityType: "creature", entityId: id } },
  });

  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name:  "Creature Data",
    type:  "text",
    flags: { [MODULE_ID]: { [FLAG_KEY]: creature } },
  }]);

  if (!campaignState.creatureIds) campaignState.creatureIds = [];
  if (!campaignState.creatureIds.includes(entry.id)) {
    campaignState.creatureIds.push(entry.id);
    await persistCampaignState(campaignState);
  }

  return creature;
}

export function getCreature(journalEntryId) {
  try {
    const entry = game.journal?.get(journalEntryId);
    const page  = entry?.pages?.contents?.[0];
    return page?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? null;
  } catch {
    return null;
  }
}

export function listCreatures(campaignState) {
  return (campaignState.creatureIds ?? [])
    .map(id => getCreature(id))
    .filter(Boolean);
}

export async function updateCreature(journalEntryId, updates) {
  const entry = game.journal?.get(journalEntryId);
  if (!entry) throw new Error(`Creature journal entry not found: ${journalEntryId}`);

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

export async function setSceneRelevant(journalEntryId, value) {
  return updateCreature(journalEntryId, { sceneRelevant: value });
}

export async function setPortraitId(journalEntryId, artAssetId) {
  return updateCreature(journalEntryId, { portraitId: artAssetId });
}

export function isReadyForArtGeneration(creature) {
  return creature.active && !!creature.portraitSourceDescription && !creature.portraitId;
}

/**
 * Format a Creature for narrator context injection.
 *
 * @param {Object} creature
 * @returns {string}
 */
export function formatForContext(creature) {
  const parts = [`**${creature.name || "Unknown Creature"}**`];

  if (creature.scale)       parts.push(`Scale: ${creature.scale}`);
  if (creature.environment) parts.push(`Environment: ${creature.environment}`);
  if (creature.form)        parts.push(`Form: ${creature.form}`);

  if (creature.aspect?.length) {
    parts.push(`Aspect: ${creature.aspect.join(", ")}`);
  }

  if (creature.behavior)      parts.push(`Behavior: ${creature.behavior}`);
  if (creature.rank)          parts.push(`Rank: ${creature.rank}`);
  if (creature.description)   parts.push(creature.description);
  if (creature.narratorNotes) parts.push(`Note: ${creature.narratorNotes}`);

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
    console.error(`${MODULE_ID} | creature: persistCampaignState failed:`, err);
    throw err;
  }
}
