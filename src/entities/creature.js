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

import { getOrCreateEntitiesFolder } from "./folder.js";

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
    name:   creature.name || "Unknown Creature",
    folder: await getOrCreateEntitiesFolder(),
    flags:  { [MODULE_ID]: { entityType: "creature", entityId: id } },
  });

  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name:  "Creature Data",
    type:  "text",
    text:  { format: 1, content: renderEntityBody(creature) },
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

export async function setPortraitId(journalEntryId, artAssetId) {
  return updateCreature(journalEntryId, { portraitId: artAssetId });
}

export function isReadyForArtGeneration(creature) {
  return creature.active && !!creature.portraitSourceDescription && !creature.portraitId;
}

/**
 * Render the Creature's descriptive fields into HTML for the page body so the
 * JournalEntryPage isn't blank (F19 / theme T3). The full record still lives
 * on the page flag for the entity panel.
 */
export function renderEntityBody(creature) {
  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const out = [];
  const meta = (label, value) =>
    value ? out.push(`<p><strong>${esc(label)}:</strong> ${esc(value)}</p>`) : null;
  meta("Environment", creature?.environment);
  meta("Rank", creature?.rank);
  if (Array.isArray(creature?.aspect) && creature.aspect.length) {
    meta("Aspect", creature.aspect.join(", "));
  }
  meta("Behavior", creature?.behavior);
  if (creature?.form && creature.form !== creature?.description) out.push(`<p>${esc(creature.form)}</p>`);
  if (creature?.description) out.push(`<p>${esc(creature.description)}</p>`);
  if (creature?.notes) out.push(`<p>${esc(creature.notes)}</p>`);
  return out.join("");
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
