/**
 * STARFORGED COMPANION
 * src/entities/settlement.js — Settlement records
 *
 * Settlements are locations, not characters. They don't have progress tracks
 * but they do have oracle-derived details, a projects list, a trouble state,
 * and context injection for scenes set at that location.
 *
 * Storage: JournalEntry + JournalEntryPage, same pattern as connections.
 */

const MODULE_ID = "starforged-companion";
const FLAG_KEY  = "settlement";

export const SettlementSchema = {
  _id:      "",
  name:     "",
  active:   true,

  // Oracle-derived details (populated progressively)
  location:       "",    // "Planetside" | "Orbital" | "Deep Space"
  population:     "",    // "Few" | "Dozens" | "Hundreds" | "Thousands" | "Tens of thousands"
  firstLook:      "",    // Settlement First Look oracle result
  initialContact: "",    // Initial Contact oracle result
  authority:      "",    // Authority oracle result
  projects:       [],    // Settlement Projects oracle results (array of strings)
  trouble:        "",    // Settlement Trouble oracle result

  // Narrative
  description:    "",    // Physical description / atmosphere
  history:        "",    // Known backstory
  notes:          "",    // GM notes

  // Art
  portraitId:                  null,
  portraitSourceDescription:   "",

  // Context injection
  sceneRelevant: false,  // true = inject into current scene context packet
  loremasterNotes: "",   // Setting/atmosphere notes for Loremaster

  // Linked entities
  connectionIds: [],     // Connection _ids of notable inhabitants

  createdAt: null,
  updatedAt: null,
};


export async function createSettlement(data, campaignState) {
  const now = new Date().toISOString();
  const id  = generateId();

  const settlement = {
    ...SettlementSchema,
    ...data,
    _id:       id,
    projects:  data.projects ?? [],
    createdAt: now,
    updatedAt: now,
  };

  const entry = await JournalEntry.create({
    name:  settlement.name || "Unknown Settlement",
    flags: { [MODULE_ID]: { entityType: "settlement", entityId: id } },
  });

  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name:  "Settlement Data",
    type:  "text",
    flags: { [MODULE_ID]: { [FLAG_KEY]: settlement } },
  }]);

  if (!campaignState.settlementIds) campaignState.settlementIds = [];
  if (!campaignState.settlementIds.includes(entry.id)) {
    campaignState.settlementIds.push(entry.id);
    await persistCampaignState(campaignState);
  }

  return settlement;
}

export function getSettlement(journalEntryId) {
  try {
    const entry = game.journal?.get(journalEntryId);
    const page  = entry?.pages?.contents?.[0];
    return page?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? null;
  } catch {
    return null;
  }
}

export function listSettlements(campaignState) {
  return (campaignState.settlementIds ?? [])
    .map(id => getSettlement(id))
    .filter(Boolean);
}

export async function updateSettlement(journalEntryId, updates) {
  const entry = game.journal?.get(journalEntryId);
  if (!entry) throw new Error(`Settlement journal entry not found: ${journalEntryId}`);

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
  return updateSettlement(journalEntryId, { sceneRelevant: value });
}

export async function setPortraitId(journalEntryId, artAssetId) {
  return updateSettlement(journalEntryId, { portraitId: artAssetId });
}

export function isReadyForArtGeneration(settlement) {
  return settlement.active && !!settlement.portraitSourceDescription && !settlement.portraitId;
}

/**
 * Format a Settlement for Loremaster context injection.
 * Used when the scene is set at this location.
 *
 * @param {Object} settlement
 * @returns {string}
 */
export function formatForContext(settlement) {
  const parts = [`**${settlement.name || "Unknown Settlement"}**`];

  if (settlement.location)   parts.push(`Location: ${settlement.location}`);
  if (settlement.population) parts.push(`Population: ${settlement.population}`);
  if (settlement.authority)  parts.push(`Authority: ${settlement.authority}`);
  if (settlement.trouble)    parts.push(`Current trouble: ${settlement.trouble}`);

  if (settlement.projects?.length) {
    parts.push(`Projects: ${settlement.projects.join(", ")}`);
  }

  if (settlement.description)     parts.push(settlement.description);
  if (settlement.loremasterNotes) parts.push(`Note: ${settlement.loremasterNotes}`);

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
