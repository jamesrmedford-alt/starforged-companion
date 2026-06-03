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
 * Storage: each Connection is a foundry-ironsworn `character` Actor (an NPC
 * card). The Connection data lives in actor.flags["starforged-companion"].connection,
 * and the Actor _id is stored in campaignState.connectionIds[]. NPC cards live in
 * `Sectors / <Sector Name> / NPCs` (or the top-level `NPCs/` when no sector is
 * known). See decisions.md → "NPCs and connections: native ironsworn `character`
 * Actors". All host reads/writes route through src/entities/registry.js.
 *
 * Progressive disclosure principle: records start sparse. Name may be null.
 * Fields fill in through play — nothing should be fully defined upfront.
 *
 * Source: Starforged Reference Guide pp.13, 163–166
 *        Brief §1 Feature 4 — Connection and NPC Tracking
 */

import { ConnectionSchema, RANKS, RANK_TICKS } from "../schemas.js";
import { getOrCreateActorFolder, getOrCreateSectorNpcActorFolder } from "./folder.js";
import { getEntityDocument, readEntityFlag, writeEntityFlag } from "./registry.js";
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
 * @param {Object} [opts]
 * @param {boolean} [opts.persist=true] — When false, mutate campaignState in
 *   place but skip the game.settings.set write. Used by sectorGenerator's
 *   createEntityJournals so a single batched write happens at the end of
 *   storeSector instead of three sequential writes that race against each other.
 * @returns {Promise<Object>} — The created connection record
 */
export async function createConnection(data, campaignState, { persist = true } = {}) {
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

  // Route the NPC card into its sector's NPC folder when a sector is known,
  // otherwise the top-level NPCs/ (no-sector connections, e.g. a narrator-named
  // NPC with no charted home).
  const folderId = connection.sectorId
    ? await getOrCreateSectorNpcActorFolder(connection.sectorId, campaignState)
    : await getOrCreateActorFolder("NPCs");

  // Create the NPC card as a foundry-ironsworn `character` Actor. The record
  // lives on the actor flag; registry.js routes reads/writes to actor flags.
  const actor = await Actor.create({
    name:   connection.name || "Unknown Connection",
    type:   "character",
    folder: folderId,
    flags:  { [MODULE_ID]: { entityType: "connection", entityId: id, [FLAG_KEY]: connection } },
  });

  // Register in campaign state (now the Actor id, not a JournalEntry id).
  if (!campaignState.connectionIds) campaignState.connectionIds = [];
  if (actor?.id && !campaignState.connectionIds.includes(actor.id)) {
    campaignState.connectionIds.push(actor.id);
    if (persist) await persistCampaignState(campaignState);
  }

  console.log(`${MODULE_ID} | Created connection: ${connection.name ?? "unnamed"} (${id})`);
  return connection;
}


// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve a Connection record by its host document ID (the NPC-card Actor id).
 *
 * @param {string} actorId — Foundry Actor document ID (NPC card)
 * @returns {Object|null}
 */
export function getConnection(actorId) {
  try {
    const document = getEntityDocument(FLAG_KEY, actorId);
    if (!document) return null;
    return readEntityFlag(FLAG_KEY, document);
  } catch (err) {
    console.error(`${MODULE_ID} | getConnection(${actorId}) failed:`, err);
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
export async function updateConnection(actorId, updates) {
  const document = getEntityDocument(FLAG_KEY, actorId);
  if (!document) throw new Error(`Connection actor not found: ${actorId}`);

  const current = readEntityFlag(FLAG_KEY, document) ?? {};
  const updated  = {
    ...current,
    ...updates,
    _id:       current._id,      // Never overwrite _id
    createdAt: current.createdAt,// Never overwrite createdAt
    updatedAt: new Date().toISOString(),
  };

  await writeEntityFlag(FLAG_KEY, document, updated);

  // Sync the NPC-card name if the connection name changed
  if (updates.name && updates.name !== document.name) {
    await document.update({ name: updates.name });
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
    const hostId = resolveHostId(c._id, campaignState);
    if (hostId) await setSceneRelevant(hostId, false);
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
 *
 * Currently unused in production — the connection record's
 * `portraitSourceDescription` field is populated at creation time via
 * `createConnection({ portraitSourceDescription })` and read by
 * `generatePortrait` to build the image prompt. This setter is retained
 * as part of the entity art-path contract (parallel to the per-type
 * setters on settlement / planet / location / ship / faction / creature)
 * for callers that need to deferredly write the field. Previously
 * documented as called by the Loremaster hook, which was removed when
 * narration moved to the direct-Claude pipeline (see
 * docs/decisions.md § "Narration: direct Claude API").
 *
 * @param {string} journalEntryId
 * @param {string} sourceDescription
 * @returns {Promise<Object>}
 */
export async function setPortraitSourceDescription(journalEntryId, sourceDescription) {
  return updateConnection(journalEntryId, { portraitSourceDescription: sourceDescription });
}

/**
 * Record the generated portrait asset ID.
 *
 * Wraps `updateConnection({ portraitId })`. Production callers route
 * through `linkPortraitToEntity` in `src/art/generator.js` (which writes
 * via the entity registry's `writeEntityFlag` so journal-hosted and
 * actor-hosted entities share one code path); this direct setter is
 * retained for symmetry with the other entity modules and for use by
 * tests that pre-populate the field.
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
 * Format a Connection record for narrator context injection.
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
 * Resolve the host document id (NPC-card Actor id) for a given connection _id.
 * Scans the registered connection hosts for a matching entityId flag.
 */
function resolveHostId(connectionId, campaignState) {
  for (const hostId of campaignState.connectionIds ?? []) {
    const document = getEntityDocument(FLAG_KEY, hostId);
    if (document?.flags?.[MODULE_ID]?.entityId === connectionId) return hostId;
  }
  return null;
}

/**
 * Render the Connection's descriptive fields into HTML for the page body so
 * the JournalEntryPage isn't blank (F19 / theme T3). The full record still
 * lives on the page flag for the entity panel.
 */
export function renderEntityBody(connection) {
  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const out = [];
  const meta = (label, value) =>
    value ? out.push(`<p><strong>${esc(label)}:</strong> ${esc(value)}</p>`) : null;
  meta("Role", connection?.role);
  meta("Rank", connection?.rank);
  meta("Relationship", connection?.relationshipType);
  if (connection?.description) out.push(`<p>${esc(connection.description)}</p>`);
  meta("Goal", connection?.goal);
  if (connection?.motivation)  out.push(`<p><strong>Motivation:</strong> ${esc(connection.motivation)}</p>`);
  if (connection?.notes)       out.push(`<p>${esc(connection.notes)}</p>`);
  return out.join("");
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
  } catch (err) {
    console.error(`${MODULE_ID} | connection: persistCampaignState failed:`, err);
    throw err;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// NPC-CARD POPULATION (oracles → Characteristics, narrator/art → Notes)
//
// Mirrors the starship auto-envision (seedStarshipActor in ship.js). On a freshly
// created connection NPC card, roll the Character oracles, write them to the
// sheet's Characteristics field (system.biography), compose an atmospheric
// introduction for the Notes tab (system.notes), and fire a silent portrait
// generation whose art is attached to the card + prototype token and embedded
// (large) into Notes. See decisions.md → "NPCs and connections: native ironsworn
// `character` Actors".
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when a connection NPC-card actor still needs oracle/narrator/art
 * population. Used by the createActor hook to decide whether to seed.
 *
 * @param {Actor} actor
 * @returns {boolean}
 */
export function connectionNeedsSeed(actor) {
  if (!actor || actor.type !== "character") return false;
  const conn = actor.flags?.[MODULE_ID]?.[FLAG_KEY];
  return !!conn && !conn.seeded;
}

/**
 * Populate a connection NPC-card Actor: roll any missing Character oracles
 * (First Look, Initial Disposition, Role, Goal), write them to the
 * Characteristics field, compose narrator flavor for the Notes tab, and fire a
 * silent portrait generation. Idempotent — a card already marked `seeded` is
 * returned unchanged. Never throws; population failures are logged.
 *
 * @param {Actor} actor — a `character` Actor carrying a connection flag payload
 * @param {Object} [campaignState]
 * @returns {Promise<Object|null>} the updated connection record, or null
 */
export async function seedConnectionActor(actor, campaignState) {
  if (!actor || actor.type !== "character") return null;
  const existing = actor.flags?.[MODULE_ID]?.[FLAG_KEY];
  if (!existing) return null;            // not a connection card
  if (existing.seeded) return existing;  // already populated — idempotent

  const { rollOracle } = await import("../oracles/roller.js");
  const role        = existing.role || safeRoll(rollOracle, "character_role");
  const goal        = existing.goal || safeRoll(rollOracle, "character_goal");
  const firstLookEx = Array.isArray(existing.firstLook) ? existing.firstLook[0] : existing.firstLook;
  const firstLook   = firstLookEx || safeRoll(rollOracle, "character_first_look");
  const disposition = existing.disposition || safeRoll(rollOracle, "character_disposition");

  const portraitSource = [firstLook, role, disposition].filter(Boolean).join(". ");

  const connection = {
    ...existing,
    role,
    goal,
    firstLook:   firstLook ? [firstLook] : (Array.isArray(existing.firstLook) ? existing.firstLook : []),
    disposition,
    portraitSourceDescription: existing.portraitSourceDescription || portraitSource,
    seeded:      true,
    updatedAt:   new Date().toISOString(),
  };

  const biographyHtml = buildConnectionBiographyHtml({ role, goal, firstLook, disposition });
  const notesHtml     = await composeConnectionNotesHtml({ name: actor.name, role, goal, firstLook, disposition });

  try {
    await actor.update({
      "system.biography":                 biographyHtml,
      "system.notes":                     notesHtml,
      [`flags.${MODULE_ID}.${FLAG_KEY}`]: connection,
      [`flags.${MODULE_ID}.entityType`]:  actor.flags?.[MODULE_ID]?.entityType ?? "connection",
      [`flags.${MODULE_ID}.entityId`]:    actor.flags?.[MODULE_ID]?.entityId   ?? connection._id,
    });
  } catch (err) {
    console.error(`${MODULE_ID} | seedConnectionActor: update failed:`, err);
    return null;
  }

  // Silent portrait — gated on an OpenRouter key. attachPortraitToActor sets
  // actor.img + prototype-token art and embeds a large copy at the top of the
  // Notes tab. Failures stay silent.
  if (portraitSource && hasOpenRouterKey()) {
    try {
      const { generatePortrait } = await import("../art/generator.js");
      await generatePortrait(actor.id, "connection", connection, campaignState ?? {});
    } catch (err) {
      console.warn(`${MODULE_ID} | seedConnectionActor: portrait generation failed:`, err);
    }
  }

  return connection;
}

/**
 * Build the Characteristics-field (system.biography) HTML from the rolled
 * Character oracles. Empty string when nothing rolled.
 */
function buildConnectionBiographyHtml({ role, goal, firstLook, disposition }) {
  const lines = [];
  if (firstLook)   lines.push(`<li><strong>First look:</strong> ${escapeHtmlConn(firstLook)}</li>`);
  if (disposition) lines.push(`<li><strong>Initial disposition:</strong> ${escapeHtmlConn(disposition)}</li>`);
  if (role)        lines.push(`<li><strong>Role:</strong> ${escapeHtmlConn(role)}</li>`);
  if (goal)        lines.push(`<li><strong>Goal:</strong> ${escapeHtmlConn(goal)}</li>`);
  if (!lines.length) return "";
  return `<p><em>Oracle-seeded character details:</em></p><ul>${lines.join("")}</ul>`;
}

/**
 * Compose the Notes-tab (system.notes) HTML for a seeded connection. Tries a
 * narrator-model call to turn the oracle rolls into a short atmospheric
 * introduction, then appends a compact fact line. Falls back to a plain oracle
 * bullet list when no Claude key is set or the call fails — never blocks seeding.
 */
async function composeConnectionNotesHtml({ name, role, goal, firstLook, disposition }) {
  const facts = [firstLook, disposition, role, goal].filter(Boolean);
  if (!facts.length) return "";

  const prose = await generateConnectionIntroProse({ name, role, goal, firstLook, disposition })
    .catch(() => null);

  if (!prose) {
    return buildConnectionBiographyHtml({ role, goal, firstLook, disposition });
  }

  const paras = prose
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${escapeHtmlConn(p).replace(/\n+/g, " ")}</p>`)
    .join("");
  const factLine = facts.map(escapeHtmlConn).join(" &middot; ");
  return `${paras}<p><em>${factLine}</em></p>`;
}

/**
 * Single narrator-model call that turns the connection's oracle rolls into a
 * 2-3 sentence introduction. Returns null (caller falls back) when no Claude
 * key is set or the call yields nothing. All Anthropic traffic routes through
 * src/api-proxy.js per the architecture constraint in CLAUDE.md.
 */
async function generateConnectionIntroProse({ name, role, goal, firstLook, disposition }) {
  const apiKey = readClaudeKeyConn();
  if (!apiKey) return null;

  const { apiPost } = await import("../api-proxy.js");
  const model = readModuleSettingConn("narrationModel") || "claude-sonnet-4-5-20250929";
  const tone  = readModuleSettingConn("narrationTone")  || "wry";

  const system =
    `You are the narrator for an Ironsworn: Starforged solo campaign. ` +
    `Tone: ${tone}. Write a short (2-3 sentence) atmospheric introduction to an ` +
    `NPC the player has just connected with, grounded ONLY in the oracle details ` +
    `provided. Evocative but spare. Plain prose only — no headings, lists, or ` +
    `markdown. Do not invent proper nouns, factions, or plot beyond what the ` +
    `details imply.`;

  const userMsg = [
    name        ? `Name: ${name}`                       : null,
    firstLook   ? `First look: ${firstLook}`            : null,
    disposition ? `Initial disposition: ${disposition}` : null,
    role        ? `Role: ${role}`                       : null,
    goal        ? `Goal: ${goal}`                       : null,
  ].filter(Boolean).join("\n");

  const body = {
    model,
    max_tokens: 220,
    system:   [{ type: "text", text: system }],
    messages: [{ role: "user", content: userMsg }],
  };
  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
  };

  const data = await apiPost("https://api.anthropic.com/v1/messages", headers, body);
  const text = (data?.content ?? [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();
  return text || null;
}

function safeRoll(rollOracle, tableId) {
  try {
    const r = rollOracle(tableId);
    return r?.result && r.result !== "—" ? r.result : "";
  } catch {
    return "";
  }
}

function readClaudeKeyConn() {
  try { return globalThis.game?.settings?.get(MODULE_ID, "claudeApiKey") || null; }
  catch { return null; }
}

function readModuleSettingConn(key) {
  try { return globalThis.game?.settings?.get(MODULE_ID, key); }
  catch { return undefined; }
}

function hasOpenRouterKey() {
  try { return !!globalThis.game?.settings?.get(MODULE_ID, "openRouterApiKey"); }
  catch { return false; }
}

function escapeHtmlConn(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
