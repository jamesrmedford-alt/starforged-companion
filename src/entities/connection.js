/**
 * STARFORGED COMPANION
 * src/entities/connection.js — Connection record CRUD and progress management
 *
 * Connections are the most mechanically rich entity type. They have:
 * — A progress track (Develop Your Relationship / Forge a Bond)
 * — A rank that governs ticks per progress mark
 * — A bond state (bonded after Forge a Bond hit)
 * — A role that grants +1 on moves where it's relevant
 * — An append-only history log
 * — Context injection flags (allyFlag, sceneRelevant)
 * — GM-only visibility option for hidden antagonists
 *
 * Storage: each Connection is a JournalEntry containing one JournalEntryPage.
 * The Connection data lives in page.flags["starforged-companion"].connection.
 * The parent JournalEntry _id is stored in campaignState.connectionIds[].
 *
 * Progressive disclosure principle: records start sparse. Name may be null.
 * Fields fill in through play — nothing should be fully defined upfront.
 *
 * Source: Starforged Reference Guide pp.13, 163–166
 *        Brief §1 Feature 4 — Connection and NPC Tracking
 */

import { ConnectionSchema, RANKS, RANK_TICKS } from "../schemas.js";
import { foundry } from "../foundry-shim.js";

const MODULE_ID  = "starforged-companion";
const FLAG_KEY   = "connection";


// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new Connection record and its associated ProgressTrack.
 * Stores both as Foundry journal entries and registers the connection
 * in campaign state.
 *
 * Progressive disclosure: only name and role are required at creation.
 * Everything else defaults to empty / unknown.
 *
 * @param {Object} data  — Partial ConnectionSchema fields
 * @param {Object} campaignState — CampaignStateSchema (will be mutated)
 * @returns {Promise<Object>} — The created connection record
 */
export async function createConnection(data, campaignState) {
  const now = new Date().toISOString();
  const id  = generateId();

  const connection = {
    ...ConnectionSchema,
    ...data,
    _id:       id,
    createdAt: now,
    updatedAt: now,
    history:   data.history ?? [],
  };

  // Validate rank
  if (!RANKS.includes(connection.rank)) {
    connection.rank = "dangerous";
  }

  // Create the Foundry journal entry
  const entry = await JournalEntry.create({
    name:  connection.name || "Unknown Connection",
    flags: { [MODULE_ID]: { entityType: "connection", entityId: id } },
  });

  // Create the page that holds the data
  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name:  "Connection Data",
    type:  "text",
    flags: { [MODULE_ID]: { [FLAG_KEY]: connection } },
  }]);

  // Register in campaign state
  if (!campaignState.connectionIds.includes(entry.id)) {
    campaignState.connectionIds.push(entry.id);
    await persistCampaignState(campaignState);
  }

  console.log(`${MODULE_ID} | Created connection: ${connection.name ?? "unnamed"} (${id})`);
  return connection;
}


// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve a Connection record by its Foundry journal entry ID.
 *
 * @param {string} journalEntryId — Foundry JournalEntry document ID
 * @returns {Object|null}
 */
export function getConnection(journalEntryId) {
  try {
    const entry = game.journal?.get(journalEntryId);
    if (!entry) return null;
    const page = entry.pages?.contents?.[0];
    return page?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? null;
  } catch {
    return null;
  }
}

/**
 * Retrieve all active connections from campaign state.
 *
 * @param {Object} campaignState
 * @returns {Array<Object>}
 */
export function listConnections(campaignState) {
  return (campaignState.connectionIds ?? [])
    .map(id => getConnection(id))
    .filter(Boolean);
}

/**
 * Retrieve only active, ally-flagged connections for context injection.
 *
 * @param {Object} campaignState
 * @returns {Array<Object>}
 */
export function listAllyConnections(campaignState) {
  return listConnections(campaignState).filter(c => c.active && c.allyFlag);
}

/**
 * Retrieve connections currently flagged as scene-relevant.
 *
 * @param {Object} campaignState
 * @returns {Array<Object>}
 */
export function listSceneConnections(campaignState) {
  return listConnections(campaignState).filter(c => c.active && c.sceneRelevant);
}


// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update a Connection record with new field values.
 * Merges shallowly — nested objects like history are replaced, not merged.
 * Use addHistoryEntry() to append to history rather than updating directly.
 *
 * @param {string} journalEntryId
 * @param {Object} updates — Partial ConnectionSchema fields
 * @returns {Promise<Object>} — The updated connection record
 */
export async function updateConnection(journalEntryId, updates) {
  const entry = game.journal?.get(journalEntryId);
  if (!entry) throw new Error(`Connection journal entry not found: ${journalEntryId}`);

  const page = entry.pages?.contents?.[0];
  if (!page) throw new Error(`Connection page not found in entry: ${journalEntryId}`);

  const current = page.flags?.[MODULE_ID]?.[FLAG_KEY] ?? {};
  const updated  = {
    ...current,
    ...updates,
    _id:       current._id,      // Never overwrite _id
    createdAt: current.createdAt,// Never overwrite createdAt
    updatedAt: new Date().toISOString(),
  };

  await page.setFlag(MODULE_ID, FLAG_KEY, updated);

  // Sync the journal entry name if the connection name changed
  if (updates.name && updates.name !== entry.name) {
    await entry.update({ name: updates.name });
  }

  return updated;
}


// ─────────────────────────────────────────────────────────────────────────────
// HISTORY LOG
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append an entry to a connection's history log.
 * History is append-only — entries are never edited or deleted.
 *
 * @param {string} journalEntryId
 * @param {string} entry — Narrative description of what happened
 * @param {string} [sessionId]
 * @returns {Promise<Object>} — The updated connection record
 */
export async function addHistoryEntry(journalEntryId, entry, sessionId = "") {
  const connection = getConnection(journalEntryId);
  if (!connection) throw new Error(`Connection not found: ${journalEntryId}`);

  const historyEntry = {
    timestamp: new Date().toISOString(),
    sessionId,
    entry,
  };

  const updatedHistory = [...(connection.history ?? []), historyEntry];
  return updateConnection(journalEntryId, { history: updatedHistory });
}


// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark progress on a connection's relationship track.
 * Uses the connection's rank to determine tick count per mark.
 * Delegates to the progress track manager for the actual tick update.
 *
 * Call this when Develop Your Relationship triggers a progress mark.
 *
 * @param {string} journalEntryId
 * @param {number} [marks=1] — Number of times to mark progress (usually 1)
 * @returns {Promise<{ connection: Object, ticksAdded: number, newTicks: number }>}
 */
export async function markRelationshipProgress(journalEntryId, marks = 1) {
  const connection = getConnection(journalEntryId);
  if (!connection) throw new Error(`Connection not found: ${journalEntryId}`);

  const ticksPerMark = RANK_TICKS[connection.rank] ?? RANK_TICKS.dangerous;
  const ticksAdded   = ticksPerMark * marks;

  // Update the progress track (stored separately via progressTrackId)
  // If no progress track exists yet, the UI layer should create one first.
  // Here we just update the connection's cached tick count for context injection.
  const currentTicks = connection.relationshipTicks ?? 0;
  const newTicks     = Math.min(40, currentTicks + ticksAdded);

  const updated = await updateConnection(journalEntryId, {
    relationshipTicks: newTicks,
  });

  return { connection: updated, ticksAdded, newTicks };
}

/**
 * Mark a connection as bonded after Forge a Bond succeeds.
 * Sets bonded: true and optionally assigns a second role if the player
 * chose Expand Influence on a strong hit.
 *
 * @param {string} journalEntryId
 * @param {Object} [options]
 * @param {string} [options.secondRole] — Second role if Expand Influence chosen
 * @param {string} [options.sessionId]
 * @returns {Promise<Object>}
 */
export async function forgeBond(journalEntryId, options = {}) {
  const updates = {
    bonded:     true,
    allyFlag:   true,  // Bonded connections are always context-injected
  };

  if (options.secondRole) {
    updates.secondRole = options.secondRole;
  }

  const updated = await updateConnection(journalEntryId, updates);

  await addHistoryEntry(
    journalEntryId,
    `Bond forged.${options.secondRole ? ` Second role: ${options.secondRole}.` : ""}`,
    options.sessionId
  );

  return updated;
}

/**
 * Mark a connection as lost — either severed or the relationship failed.
 * Sets active: false and clears context injection flags.
 *
 * @param {string} journalEntryId
 * @param {string} [reason] — What happened
 * @param {string} [sessionId]
 * @returns {Promise<Object>}
 */
export async function loseConnection(journalEntryId, reason = "", sessionId = "") {
  const updated = await updateConnection(journalEntryId, {
    active:        false,
    allyFlag:      false,
    sceneRelevant: false,
  });

  if (reason) {
    await addHistoryEntry(journalEntryId, `Connection lost: ${reason}`, sessionId);
  }

  return updated;
}


// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT INJECTION FLAGS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set or clear the allyFlag.
 * Ally-flagged connections are injected into every Loremaster context packet.
 * Bonded connections are automatically ally-flagged.
 *
 * @param {string} journalEntryId
 * @param {boolean} value
 */
export async function setAllyFlag(journalEntryId, value) {
  return updateConnection(journalEntryId, { allyFlag: value });
}

/**
 * Set or clear the sceneRelevant flag.
 * Scene-relevant connections are injected into the current scene's context packet.
 * Intended to be toggled at the start of a scene and cleared after.
 *
 * @param {string} journalEntryId
 * @param {boolean} value
 */
export async function setSceneRelevant(journalEntryId, value) {
  return updateConnection(journalEntryId, { sceneRelevant: value });
}

/**
 * Clear sceneRelevant on all connections.
 * Called at the end of a scene or at the start of a new one.
 *
 * @param {Object} campaignState
 */
export async function clearAllSceneFlags(campaignState) {
  const connections = listConnections(campaignState).filter(c => c.sceneRelevant);
  for (const c of connections) {
    const journalId = resolveJournalId(c._id, campaignState);
    if (journalId) await setSceneRelevant(journalId, false);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// ART GENERATION TRIGGER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether this connection is ready for art generation.
 * Art fires after Loremaster's first description — not at name appearance.
 * Returns true only when a source description exists and no portrait has
 * been generated yet.
 *
 * @param {Object} connection
 * @returns {boolean}
 */
export function isReadyForArtGeneration(connection) {
  return (
    connection.active &&
    !!connection.portraitSourceDescription &&
    !connection.portraitId
  );
}

/**
 * Store the source description that will be used for art generation.
 * Called by the Loremaster hook after the first entity description is detected.
 *
 * @param {string} journalEntryId
 * @param {string} sourceDescription — The Loremaster narration excerpt
 * @returns {Promise<Object>}
 */
export async function setPortraitSourceDescription(journalEntryId, sourceDescription) {
  return updateConnection(journalEntryId, { portraitSourceDescription: sourceDescription });
}

/**
 * Record the generated portrait asset ID.
 * Called by the art generation pipeline after a successful generation.
 *
 * @param {string} journalEntryId
 * @param {string} artAssetId
 * @returns {Promise<Object>}
 */
export async function setPortraitId(journalEntryId, artAssetId) {
  return updateConnection(journalEntryId, { portraitId: artAssetId });
}


// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT FORMATTING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a Connection record for Loremaster context injection.
 * Progressive disclosure — only populated fields are included.
 * Secrets are never included (GM-only).
 *
 * @param {Object} connection
 * @returns {string}
 */
export function formatForContext(connection) {
  const parts = [];

  parts.push(`**${connection.name || "Unknown"}**`);

  if (connection.role)             parts.push(`Role: ${connection.role}`);
  if (connection.secondRole)       parts.push(`Also: ${connection.secondRole}`);
  if (connection.rank)             parts.push(`Rank: ${connection.rank}`);
  if (connection.relationshipType) parts.push(`Relationship: ${connection.relationshipType}`);
  if (connection.bonded)           parts.push("Bonded.");
  if (!connection.active)          parts.push("(Connection lost.)");

  if (connection.description)      parts.push(connection.description);
  if (connection.motivation)       parts.push(`Motivation: ${connection.motivation}`);

  // Last history entry gives recent context
  const lastEntry = connection.history?.[connection.history.length - 1];
  if (lastEntry?.entry) parts.push(`Last interaction: ${lastEntry.entry}`);

  if (connection.loremasterNotes)  parts.push(`Voice note: ${connection.loremasterNotes}`);

  return parts.join(" | ");
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Foundry JournalEntry ID for a given connection _id.
 * Scans the journal for a matching entity flag.
 */
function resolveJournalId(connectionId, campaignState) {
  for (const journalId of campaignState.connectionIds ?? []) {
    const entry = game.journal?.get(journalId);
    if (entry?.flags?.[MODULE_ID]?.entityId === connectionId) return journalId;
  }
  return null;
}

function generateId() {
  try {
    return foundry.utils.randomID();
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

async function persistCampaignState(campaignState) {
  try {
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
  } catch {
    // Non-Foundry context — ignore
  }
}
