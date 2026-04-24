/**
 * STARFORGED COMPANION
 * src/entities/faction.js — Faction records
 *
 * Factions are organisations the player character interacts with.
 * They don't have progress tracks, but they do have:
 * — Oracle-derived type, influence, dominion/guild/fringe
 * — A generated name (from the name template oracles)
 * — A relationship stance toward the player character
 * — A projects list (current faction agenda)
 * — Rumors (things that can be uncovered)
 * — A quirk (characteristic behaviour)
 *
 * Factions can be injected into context when the scene involves them,
 * or when the player has a relevant open vow.
 */

import { foundry } from "../foundry-shim.js";

const MODULE_ID = "starforged-companion";
const FLAG_KEY  = "faction";

export const FactionSchema = {
  _id:    "",
  name:   "",
  active: true,

  // Oracle-derived structure
  type:        "",   // "Dominion" | "Guild" | "Fringe Group"
  subtype:     "",   // e.g. "Mercenaries" for a Guild; "Raiders" for Fringe Group
  influence:   "",   // "Forsaken" through "Inescapable"
  dominion:    "",   // Dominion focus (if type = Dominion)
  leadership:  "",   // Dominion leadership style

  // Current state
  projects:    [],   // Active projects (oracle results or player-defined)
  quirk:       "",   // Characteristic behaviour
  rumors:      [],   // Known or discovered rumors (array of strings)

  // Relationship to player character
  // "antagonistic" | "apathetic" | "distrustful" | "does_business" |
  // "open_alliance" | "temporary_alliance" | "warring" | "unknown"
  relationship: "unknown",

  // Narrative
  description:  "",  // Physical presence, aesthetics, reputation
  history:      "",
  notes:        "",  // GM notes

  // Art
  portraitId:                null,
  portraitSourceDescription: "",

  // Context injection
  sceneRelevant:   false,
  loremasterNotes: "",

  createdAt: null,
  updatedAt: null,
};


export async function createFaction(data, campaignState) {
  const now = new Date().toISOString();
  const id  = generateId();

  const faction = {
    ...FactionSchema,
    ...data,
    _id:       id,
    projects:  data.projects ?? [],
    rumors:    data.rumors ?? [],
    createdAt: now,
    updatedAt: now,
  };

  const entry = await JournalEntry.create({
    name:  faction.name || "Unknown Faction",
    flags: { [MODULE_ID]: { entityType: "faction", entityId: id } },
  });

  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name:  "Faction Data",
    type:  "text",
    flags: { [MODULE_ID]: { [FLAG_KEY]: faction } },
  }]);

  if (!campaignState.factionIds) campaignState.factionIds = [];
  if (!campaignState.factionIds.includes(entry.id)) {
    campaignState.factionIds.push(entry.id);
    await persistCampaignState(campaignState);
  }

  return faction;
}

export function getFaction(journalEntryId) {
  try {
    const entry = game.journal?.get(journalEntryId);
    const page  = entry?.pages?.contents?.[0];
    return page?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? null;
  } catch {
    return null;
  }
}

export function listFactions(campaignState) {
  return (campaignState.factionIds ?? [])
    .map(id => getFaction(id))
    .filter(Boolean);
}

export async function updateFaction(journalEntryId, updates) {
  const entry = game.journal?.get(journalEntryId);
  if (!entry) throw new Error(`Faction journal entry not found: ${journalEntryId}`);

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
 * Add a discovered rumor to a faction record.
 * Rumors are append-only — new information never replaces old.
 *
 * @param {string} journalEntryId
 * @param {string} rumor
 * @returns {Promise<Object>}
 */
export async function addRumor(journalEntryId, rumor) {
  const faction = getFaction(journalEntryId);
  if (!faction) throw new Error(`Faction not found: ${journalEntryId}`);

  const updatedRumors = [...(faction.rumors ?? []), {
    discovered: new Date().toISOString(),
    text:       rumor,
  }];

  return updateFaction(journalEntryId, { rumors: updatedRumors });
}

/**
 * Add or replace a faction project.
 *
 * @param {string} journalEntryId
 * @param {string} project
 * @returns {Promise<Object>}
 */
export async function setProject(journalEntryId, project) {
  const faction = getFaction(journalEntryId);
  if (!faction) throw new Error(`Faction not found: ${journalEntryId}`);

  // Replace the most recent project entry, or append if projects is empty
  const projects = [...(faction.projects ?? [])];
  if (projects.length === 0 || projects[projects.length - 1] !== project) {
    projects.push(project);
  }

  return updateFaction(journalEntryId, { projects });
}

export async function setSceneRelevant(journalEntryId, value) {
  return updateFaction(journalEntryId, { sceneRelevant: value });
}

export async function setPortraitId(journalEntryId, artAssetId) {
  return updateFaction(journalEntryId, { portraitId: artAssetId });
}

export function isReadyForArtGeneration(faction) {
  return faction.active && !!faction.portraitSourceDescription && !faction.portraitId;
}

/**
 * Format a Faction for Loremaster context injection.
 *
 * @param {Object} faction
 * @returns {string}
 */
export function formatForContext(faction) {
  const parts = [`**${faction.name || "Unknown Faction"}**`];

  if (faction.type)         parts.push(faction.subtype ? `${faction.type}: ${faction.subtype}` : faction.type);
  if (faction.influence)    parts.push(`Influence: ${faction.influence}`);
  if (faction.relationship && faction.relationship !== "unknown") {
    parts.push(`Stance: ${faction.relationship.replace(/_/g, " ")}`);
  }

  const latestProject = faction.projects?.[faction.projects.length - 1];
  if (latestProject)        parts.push(`Current project: ${latestProject}`);
  if (faction.quirk)        parts.push(`Quirk: ${faction.quirk}`);
  if (faction.description)  parts.push(faction.description);
  if (faction.loremasterNotes) parts.push(`Note: ${faction.loremasterNotes}`);

  return parts.join(" | ");
}

function generateId() {
  try { return foundry.utils.randomID(); }
  catch { return Math.random().toString(36).slice(2, 10); }
}

async function persistCampaignState(campaignState) {
  try { await game.settings.set(MODULE_ID, "campaignState", campaignState); }
  catch { /* non-Foundry context */ }
}
