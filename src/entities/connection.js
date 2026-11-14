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
import { getEntityDocument, readEntityFlag, writeEntityFlag, registerEntityId, withSheetNotes, adoptUnlistedEntityActor, iterEntityDocuments } from "./registry.js";
import { readSheetPronouns } from "../character/actorBridge.js";
import { markSeedIntro, writeSeedIntro } from "./seedIntro.js";
import { PORTRAIT_BLOCK_RE } from "../art/notesPortrait.js";
import { deleteEntityArtAssets } from "../art/storage.js";
import { serialiseCampaignStateWrite } from "../multiplayer/campaignStateChain.js";

const MODULE_ID  = "starforged-companion";
const FLAG_KEY   = "connection";

// foundry-ironsworn registers the classic Ironsworn sheet as the default for
// `character` actors (vendor src/index.ts — IronswornCharacterSheetV2 with
// makeDefault: true); the Starforged sheet must be pinned per actor, exactly
// as the system's own "Create Starforged character" dialog does. NPC cards
// without the pin open with Bonds/Banes/Burdens, and the classic sheet's
// Notes tab binds system.biography — hiding the seeded portrait + intro that
// live on system.notes (v1.7.10 playtest findings #1/#4).
export const STARFORGED_CHARACTER_SHEET = "ironsworn.StarforgedCharacterSheet";


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
  // The card an earlier creation of this name made, whose registration the
  // world refused, is adopted — listed now — never a second one (issue #337 Y34).
  const adopted = await adoptUnlistedEntityActor(FLAG_KEY, "connectionIds", data?.name, campaignState,
    { sectorId: data?.sectorId ?? null, persist, label: "connection" });
  if (adopted) return adopted;

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
    flags:  {
      [MODULE_ID]: { entityType: "connection", entityId: id, [FLAG_KEY]: connection },
      core:        { sheetClass: STARFORGED_CHARACTER_SHEET },
    },
  });

  // Register in campaign state (now the Actor id, not a JournalEntry id).
  // The store first, the caller's copy once the world took it (issue #331 X35).
  if (await registerEntityId(campaignState, "connectionIds", actor?.id, { label: "connection", persist })) {
    campaignState.connectionIds.push(actor.id);
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
    // The NPC card's Notes tab is its notes (issue #329 X12).
    return withSheetNotes(FLAG_KEY, document, readEntityFlag(FLAG_KEY, document));
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

  // …and every PC's bond Item for it (BOND-ITEM-NAME-STALE: the vendor
  // Connections tab and CHARACTER STATE kept the old name). Found as the
  // connection was named — its id, else its old name for an unkeyed Item.
  // Best-effort, as the ticks and rank mirrors: the record stays the source
  // of truth. Dynamic import avoids an actorBridge cycle.
  if (typeof updates.name === "string" && updates.name && updates.name !== current.name) {
    await renameBondItems(current, updates.name);
  }

  return updated;
}

/**
 * Rename the PCs' bond Items mirroring a connection from its old record
 * (`_id`, `name`) to `name` (BOND-ITEM-NAME-STALE). Never throws. Exported
 * for the NPC card's sidebar rename (index.js syncEntityRecordNameOnUpdate),
 * which writes the record's name without updateConnection.
 *
 * @param {{ _id?: string, name?: string }} record — the connection as it was named
 * @param {string} name — its new name
 * @returns {Promise<void>}
 */
export async function renameBondItems(record, name) {
  try {
    const { setBondItemName } = await import("../character/actorBridge.js");
    await setBondItemName({ connectionId: record?._id ?? null, name: record?.name ?? null }, name);
  } catch (err) {
    console.warn(`${MODULE_ID} | bond item rename mirror failed:`, err?.message ?? err);
  }
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

  // Mirror onto each PC's bond Item so the vendor sheet's Connections tab
  // shows the same progress (BOND-ITEM-MIRROR fix). Best-effort — the entity
  // record stays the source of truth; a failed mirror only leaves the sheet
  // display behind. Dynamic import avoids an actorBridge cycle.
  try {
    const { setBondItemTicks } = await import("../character/actorBridge.js");
    await setBondItemTicks(
      { connectionId: updated?._id ?? connection._id ?? journalEntryId, name: connection.name },
      newTicks,
    );
  } catch (err) {
    console.warn(`${MODULE_ID} | bond item mirror failed:`, err?.message ?? err);
  }

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
  };

  if (options.secondRole) {
    updates.secondRole = options.secondRole;
  }

  const connection = getConnection(journalEntryId);
  const updated = await updateConnection(journalEntryId, updates);

  await addHistoryEntry(
    journalEntryId,
    `Bond forged.${options.secondRole ? ` Second role: ${options.secondRole}.` : ""}`,
    options.sessionId
  );

  // The bond Items mirror the record (BOND-ITEM-MIRROR): the forge is written
  // through as the vendor's `completed` — the sheet's forged bond — as ticks,
  // rank and a loss are, so CHARACTER STATE says the bond is forged (issue
  // #342 Z57: only the record changed). Best-effort — the record stays the
  // source of truth. Dynamic import avoids an actorBridge cycle.
  try {
    const { setBondItemForged } = await import("../character/actorBridge.js");
    await setBondItemForged(
      { connectionId: updated?._id ?? connection?._id ?? journalEntryId, name: updated?.name ?? connection?.name ?? null },
      true,
    );
  } catch (err) {
    console.warn(`${MODULE_ID} | bond item forge mirror failed:`, err?.message ?? err);
  }

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
  const connection = getConnection(journalEntryId);
  const updated = await updateConnection(journalEntryId, {
    active:        false,
  });

  if (reason) {
    await addHistoryEntry(journalEntryId, `Connection lost: ${reason}`, sessionId);
  }

  // The bond Items mirror the record (BOND-ITEM-MIRROR): the loss is written
  // through, as ticks and rank are, so CHARACTER STATE stops listing a live
  // bond the record says is lost (issue #330 D10). Best-effort — the record
  // stays the source of truth. Dynamic import avoids an actorBridge cycle.
  try {
    const { setBondItemLost } = await import("../character/actorBridge.js");
    await setBondItemLost(
      { connectionId: updated?._id ?? connection?._id ?? journalEntryId, name: updated?.name ?? connection?.name ?? null },
      true,
    );
  } catch (err) {
    console.warn(`${MODULE_ID} | bond item loss mirror failed:`, err?.message ?? err);
  }

  return updated;
}


// ─────────────────────────────────────────────────────────────────────────────
// THE X-CARD — a connection the removed narration created
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The connections X-carded narrations created (issue #338 D6(ii) — U07 full
 * exclusion; X01 already deletes a threat, faction or place page the capture
 * made): a Make a Connection hit's capture auto-creates the NPC its narration
 * names, stamped `createdFromNarrationId` (entityExtractor.routeEntityDrafts).
 * One that holds nothing beyond its creation (connectionUsed — read after the
 * X-Card's finish has undone the narration's own details and LAST KNOWN) and
 * whose bond Items hold no mark is deleted: its NPC card, its bond Items, its
 * `connectionIds` entry and its portraits (art/storage.js
 * deleteEntityArtAssets — XCARD-CONNECTION-PORTRAIT-ORPHAN: the "Art:" journal
 * entry and its index entry were left behind). One the table has used stays — a safety tool does
 * not delete what the table has built on — and is returned, for the GMs'
 * notice (safety.js). Canonical GM (the X-Card's finish). Fail-open per
 * connection.
 *
 * A Make a Connection that confirmed an earlier narration's pending draft row
 * (issue #325 W23) is stamped too, with the row (`createdFromDraft`): deleted,
 * the row goes back to pending — the NPC was that earlier narration's, which
 * the X-Card kept (MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED). Either way the
 * ledger facts promoted to the deleted card go back to its name.
 *
 * @param {string[]} narrationIds
 * @returns {Promise<{ deleted: string[], kept: Array<{ id: string, name: string }> }>}
 */
export async function retractNarrationConnections(narrationIds) {
  const removed = new Set((narrationIds ?? []).filter(id => typeof id === "string" && id));
  const out = { deleted: [], kept: [] };
  if (!removed.size) return out;
  let docs = [];
  try { docs = [...iterEntityDocuments(FLAG_KEY)]; } catch { docs = []; }
  for (const { document, data } of docs) {
    if (!removed.has(data?.createdFromNarrationId)) continue;
    const name = String(data.name || document.name || "").trim() || "A connection";
    try {
      if (connectionUsed(data) || sheetWrittenByTable(document, data)) { out.kept.push({ id: document.id, name }); continue; }
      // Dynamic import avoids an actorBridge cycle.
      const { deleteUnmarkedBondItems } = await import("../character/actorBridge.js");
      const bonds = await deleteUnmarkedBondItems({ connectionId: data._id ?? null });
      if (bonds.marked) { out.kept.push({ id: document.id, name }); continue; }
      await document.delete();
      await unregisterDeletedConnection(document.id, String(data.name || document.name || ""));
      await deleteEntityArtAssets(FLAG_KEY, data._id ?? null, { portraitId: data.portraitId ?? null });
      if (data.createdFromDraft) {
        const { reopenConfirmedDraftRow } = await import("./entityExtractor.js");
        await reopenConfirmedDraftRow(data.createdFromDraft);
      }
      out.deleted.push(name);
    } catch (err) {
      console.warn(`${MODULE_ID} | X-Card: removing the connection ${name} the removed narration created failed:`, err?.message ?? err);
    }
  }
  return out;
}

/**
 * True when a connection record holds anything beyond its creation: a history
 * entry, a narrator-added detail, a last-known whereabouts, a bond, a
 * relationship tick, a loss (`!sever`), the GM's canonical lock, a second
 * role, or a later narration's rename. Read after the X-Card has undone what
 * the removed narration recorded, so what is left came from elsewhere.
 *
 * @param {Object} record
 * @returns {boolean}
 */
function connectionUsed(record) {
  const listed  = (v) => Array.isArray(v) && v.length > 0;
  const hasText = (v) => !!String(v?.value ?? "").trim();
  return listed(record.history)
    || listed(record.generativeTier)
    || Object.values(record.lastKnown ?? {}).some(hasText)
    || record.bonded === true
    || Number(record.relationshipTicks) > 0
    || record.active === false
    || record.canonicalLocked === true
    || !!record.secondRole
    || !!record.renamedBy;
}

/**
 * True when the table has written on the NPC card's sheet since it was made:
 * text on its Notes tab beyond the seed's marked introduction and the
 * portrait block, or a Characteristics line the seed did not write. The Notes
 * tab is the card's notes (issue #329 X12) and a seed marks every element it
 * writes there (issue #338 D4, `sf-seed-intro`), so whatever else the tab
 * holds — a GM's paragraph, a ⤴ promoted detail from a narration the X-Card
 * kept — is the table's, as is a Characteristics line that is not one of the
 * seed's (withSeedCharacteristics' test). The X-Card must not delete a card
 * carrying it (issue #338 D6(ii): "a safety tool should not delete a document
 * the table has used"). An auto-created card starts with both fields empty.
 *
 * @param {ClientDocument} document — the NPC card
 * @param {Object} record — its connection record
 * @returns {boolean}
 */
function sheetWrittenByTable(document, record) {
  const notes = String(document?.system?.notes ?? "").replace(PORTRAIT_BLOCK_RE, "");
  const rest  = writeSeedIntro(notes, "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  if (rest) return true;
  const values = {
    pronouns: record?.pronouns, firstLook: record?.firstLook, description: record?.description,
    disposition: record?.disposition, role: record?.role, goal: record?.goal,
  };
  return !!withSeedCharacteristics(document?.system?.biography, "", [values]).trim();
}

/**
 * Take a deleted NPC card's id out of the latest stored `connectionIds`, and
 * hand the scene-ledger facts keyed to it back to its name (ledgers.js
 * demoteEntitySubject — a kept narration's facts about the NPC, promoted to
 * the card when it was made). One write of a copy; no await between the read
 * and the write — the registerEntityIdInStore pattern — on the client's
 * campaignState write chain (CAMPSTATE-CHAIN-REST). A refused write leaves
 * an id no Actor answers, which every reader skips.
 *
 * @param {string} actorId
 * @param {string} name — the card's name
 * @returns {Promise<void>}
 */
async function unregisterDeletedConnection(actorId, name) {
  const { demoteEntitySubject } = await import("../factContinuity/ledgers.js");
  try {
    await serialiseCampaignStateWrite(async () => {
      const latest = game.settings.get(MODULE_ID, "campaignState") ?? {};
      const target = { ...latest };
      const listed = Array.isArray(latest.connectionIds) && latest.connectionIds.includes(actorId);
      if (listed) target.connectionIds = latest.connectionIds.filter(id => id !== actorId);
      const demoted = demoteEntitySubject(actorId, name, target) > 0;
      if (!listed && !demoted) return;
      await game.settings.set(MODULE_ID, "campaignState", target);
    }, "deleted connection");
  } catch (err) {
    console.warn(`${MODULE_ID} | X-Card: unlisting the deleted connection ${actorId} failed:`, err?.message ?? err);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT INJECTION FLAGS
// ─────────────────────────────────────────────────────────────────────────────
// The per-scene context-injection flags (allyFlag, sceneRelevant) and their
// togglers are fully retired (2026-07 unreachable-code cleanup, issue #274):
// nothing ever read them — scene relevance is decided live by the relevance
// resolver (src/context/relevanceResolver.js), and every active connection's
// profile already reaches the narrator via the ACTIVE SECTOR roster.
// `loseConnection` above remains the severance entrance (the GM `!sever`
// command).


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

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
  meta("Disposition", connection?.disposition);   // not the unwritten relationshipType (issue #325 W22)
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
 * `finalizedAt` is the Entity Panel's Finalise (finalize.js): stamped into the
 * record this writes — on a card the creation hook already seeded, it is the
 * only write — so the panel switches to Regenerate (issue #311 P07).
 *
 * @param {Actor} actor — a `character` Actor carrying a connection flag payload
 * @param {Object} [campaignState]
 * @param {{ force?: boolean, finalizedAt?: string|null }} [opts]
 * @returns {Promise<Object|null>} the updated connection record, or null
 */
export async function seedConnectionActor(actor, campaignState, { force = false, finalizedAt = null } = {}) {
  if (!actor || actor.type !== "character") return null;
  const existing = actor.flags?.[MODULE_ID]?.[FLAG_KEY];
  if (!existing) return null;                    // not a connection card
  if (existing.seeded && !force) {               // already populated — idempotent
    if (!finalizedAt || existing.finalizedAt) return existing;
    try {
      await actor.update({ [`flags.${MODULE_ID}.${FLAG_KEY}.finalizedAt`]: finalizedAt });
    } catch (err) {
      console.warn(`${MODULE_ID} | seedConnectionActor: finalise stamp failed:`, err?.message ?? err);
      return null;
    }
    return { ...existing, finalizedAt };
  }

  const { rollOracle } = await import("../oracles/roller.js");
  // A title baked into the name is the established role (finding D): a vow
  // target "Administrator Lyssa Chen" must not then roll ROLE = "Shipwright"
  // and contradict itself. Precedence: an explicit role, else a title parsed
  // from the name, else the oracle roll.
  const role        = existing.role || roleTitleFromName(actor.name) || safeRoll(rollOracle, "character_role");
  const goal        = existing.goal || safeRoll(rollOracle, "character_goal");
  const firstLookEx = Array.isArray(existing.firstLook) ? existing.firstLook[0] : existing.firstLook;
  // A record with a description was described when it was made — by the
  // narration (a draft Confirm, Make a Connection, the inciting vow's target),
  // or with the creation's first look folded in. A rolled first look beside
  // it contradicted what the narration established (decisions.md, issue #286
  // D3): it is rolled only for an NPC nobody described (issue #325 W31).
  const description = typeof existing.description === "string" ? existing.description.trim() : "";
  const firstLook   = firstLookEx || (description ? "" : safeRoll(rollOracle, "character_first_look"));
  const disposition = existing.disposition || safeRoll(rollOracle, "character_disposition");
  // Establish pronouns once (finding E) — preserved if already set: the
  // sheet's Pronouns field first — the card's pronouns, which the GM may have
  // filled before Finalise (issue #335 Y13) — then the record's (the
  // narration's), then a roll.
  const pronouns    = readSheetPronouns(actor) || existing.pronouns || pickConnectionPronouns();

  // Lead the portrait prompt with the gender descriptor so generated art
  // matches the established pronouns rather than guessing from role/look.
  const portraitSource = [pronounsToPortraitDescriptor(pronouns), firstLook, role, disposition]
    .filter(Boolean).join(". ");

  // The fields the seed writes. Only these are written — by path, onto the
  // record as it is when the write lands: the record was read before the
  // Notes' Claude call, and writing that snapshot whole reverted whatever
  // landed during the call — the sector creator's canonical lock (issue
  // #326 W69: the card then read "prefer consistency", not "fixed").
  const seededFields = {
    role,
    goal,
    firstLook:   firstLook ? [firstLook] : (Array.isArray(existing.firstLook) ? existing.firstLook : []),
    disposition,
    pronouns,
    portraitSourceDescription: existing.portraitSourceDescription || portraitSource,
    seeded:      true,
    ...(finalizedAt ? { finalizedAt } : {}),
    updatedAt:   new Date().toISOString(),
  };

  // Characteristics is a plain <textarea> on the Starforged sheet — plain text
  // only (finding B). Notes is a rich-text field — HTML there is fine. Each
  // keeps what the seed did not write (issue #338 D4): Characteristics every
  // line but the seed's own, and the Notes tab — read as it is when the write
  // lands — everything but its marked introduction: the GM's paragraphs, a
  // ⤴ promoted detail (issue #335 Y12) and the portrait block (issue #322 V30).
  const introHtml = markSeedIntro(
    await composeConnectionNotesHtml({ name: actor.name, role, goal, firstLook, description, disposition, pronouns }));
  const characteristics = withSeedCharacteristics(actor.system?.biography,
    buildConnectionCharacteristics({ role, goal, firstLook, description, disposition, pronouns }),
    [{ pronouns: existing.pronouns, firstLook: firstLookEx, description, disposition: existing.disposition,
       role: existing.role, goal: existing.goal },
     { pronouns, firstLook, description, disposition, role, goal }]);
  const notesHtml = writeSeedIntro(actor.system?.notes, introHtml);

  const fieldPaths = Object.fromEntries(Object.entries(seededFields)
    .map(([key, value]) => [`flags.${MODULE_ID}.${FLAG_KEY}.${key}`, value]));
  try {
    await actor.update({
      "system.biography":                 characteristics,
      "system.pronouns":                  pronouns,
      "system.notes":                     notesHtml,
      ...fieldPaths,
      [`flags.${MODULE_ID}.entityType`]:  actor.flags?.[MODULE_ID]?.entityType ?? "connection",
      [`flags.${MODULE_ID}.entityId`]:    actor.flags?.[MODULE_ID]?.entityId   ?? existing._id,
    });
  } catch (err) {
    console.error(`${MODULE_ID} | seedConnectionActor: update failed:`, err);
    return null;
  }
  // The record as written: the seeded fields over the record as it is now.
  const connection = { ...existing, ...(actor.flags?.[MODULE_ID]?.[FLAG_KEY] ?? {}), ...seededFields };

  // Silent portrait — made where an OpenRouter key lives: here, else asked of
  // the GM holding one (AUTOSEED-KEYLESS-CANONICAL); with none, nothing.
  // attachPortraitToActor sets actor.img + prototype-token art and embeds a
  // large copy at the top of the Notes tab. Failures stay silent.
  if (portraitSource) {
    try {
      const { generatePortraitWhereKeyLives } = await import("../art/portraitRouting.js");
      await generatePortraitWhereKeyLives(actor.id, "connection", connection, campaignState ?? {});
    } catch (err) {
      console.warn(`${MODULE_ID} | seedConnectionActor: portrait generation failed:`, err);
    }
  }

  return connection;
}

// Pronoun sets assigned to NPC cards at seed time (v1.7.10/v1.7.11 finding E).
// Without an established gender, the art model and the narrator each invented
// one independently and diverged (male-leaning portrait, "her" in prose). One
// rolled value, stored on the record AND system.pronouns, anchors all surfaces
// (art prompt, seeded Notes prose, live narrator context, audio voice).
const CONNECTION_PRONOUN_SETS = ["she/her", "he/him", "they/them"];

// Leading honorific/title tokens that double as an NPC's established role
// (finding D). Matched against the start of the name, case-insensitive; the
// canonical role string is used verbatim in the Role field.
const NAME_TITLE_ROLES = [
  [/^administrator\b/i,    "Administrator"],
  [/^admiral\b/i,         "Admiral"],
  [/^ambassador\b/i,      "Ambassador"],
  [/^captain\b/i,         "Captain"],
  [/^chancellor\b/i,      "Chancellor"],
  [/^chief\b/i,           "Chief"],
  [/^commander\b/i,       "Commander"],
  [/^councill?or\b/i,     "Councilor"],
  [/^director\b/i,        "Director"],
  [/^(?:doctor|dr\.?)\b/i, "Doctor"],
  [/^elder\b/i,           "Elder"],
  [/^foreman\b/i,         "Foreman"],
  [/^governor\b/i,        "Governor"],
  [/^lieutenant\b/i,      "Lieutenant"],
  [/^magistrate\b/i,      "Magistrate"],
  [/^overseer\b/i,        "Overseer"],
  [/^professor\b/i,       "Professor"],
  [/^sergeant\b/i,        "Sergeant"],
  [/^warden\b/i,          "Warden"],
];

/**
 * Derive a role from a leading title in an NPC name (finding D). Returns the
 * canonical role (e.g. "Administrator" for "Administrator Lyssa Chen",
 * "Doctor" for "Dr. Chen") or null when the name carries no recognised title.
 * Pure — exported for unit testing.
 * @param {string} name
 * @returns {string|null}
 */
export function roleTitleFromName(name) {
  const n = String(name ?? "").trim();
  if (!n) return null;
  for (const [re, role] of NAME_TITLE_ROLES) {
    if (re.test(n)) return role;
  }
  return null;
}

/**
 * Pick a pronoun set for a new NPC. Equal weighting across the three common
 * sets. Pure — `rng` is injectable for tests.
 * @param {() => number} [rng]
 * @returns {string} e.g. "she/her"
 */
export function pickConnectionPronouns(rng = Math.random) {
  const idx = Math.min(CONNECTION_PRONOUN_SETS.length - 1, Math.floor(rng() * CONNECTION_PRONOUN_SETS.length));
  return CONNECTION_PRONOUN_SETS[idx];
}

/**
 * A short presentation descriptor for the portrait prompt, derived from the
 * pronoun set so generated art matches the established gender. Neutral sets
 * yield "a person" rather than forcing an androgynous render.
 * @param {string} pronouns
 * @returns {string}
 */
export function pronounsToPortraitDescriptor(pronouns) {
  const p = String(pronouns ?? "").toLowerCase();
  if (p.startsWith("she")) return "a woman";
  if (p.startsWith("he"))  return "a man";
  return "a person";
}

/**
 * Build the Characteristics-field (system.biography) value from the rolled
 * Character oracles. PLAIN TEXT — the Starforged sheet renders Characteristics
 * in a plain `<textarea>` bound to system.biography (sf-characterheader.vue),
 * so HTML markup shows as literal tags (v1.7.11 playtest finding B). Empty
 * string when nothing rolled.
 */
function buildConnectionCharacteristics({ role, goal, firstLook, description = "", disposition, pronouns }) {
  const lines = [];
  const line = (label, value) => lines.push(`${label}: ${oneLine(value)}`);
  if (pronouns)    line("Pronouns", pronouns);
  if (firstLook)   line("First look", firstLook);
  else if (description) line("Description", description);   // the narrated look (issue #325 W31)
  if (disposition) line("Initial disposition", disposition);
  if (role)        line("Role", role);
  if (goal)        line("Goal", goal);
  return lines.join("\n");
}

// The Characteristics lines the seed writes: label → the record field each shows.
const SEED_CHARACTERISTIC_FIELDS = Object.freeze({
  "Pronouns": "pronouns", "First look": "firstLook", "Description": "description",
  "Initial disposition": "disposition", "Role": "role", "Goal": "goal",
});

const oneLine = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

/**
 * The Characteristics field with the seed's lines in it (issue #338 D4). The
 * field is a plain textarea, so the seed's own lines are known by what they
 * say: a line in the seed's form ("Role: …") reading the value the record held
 * (what the last seed wrote) or the value this seed writes. Those are replaced
 * by `seedText`; every other line — what the GM typed, a seed line they
 * changed — stays, below it.
 *
 * @param {string} previous — the field as it is now
 * @param {string} seedText — the seed's lines (buildConnectionCharacteristics)
 * @param {Object[]} valueSets — the record's fields before the seed, and as it writes them
 * @returns {string}
 */
function withSeedCharacteristics(previous, seedText, valueSets) {
  const isSeedLine = (text) => {
    const m = /^([^:]+):(.*)$/.exec(text.trim());
    const field = m ? SEED_CHARACTERISTIC_FIELDS[m[1].trim()] : null;
    if (!field) return false;
    const value = oneLine(m[2]);
    return valueSets.some(set => set?.[field] && oneLine(set[field]) === value);
  };
  const kept = String(previous ?? "").split(/\r?\n/).filter(text => !isSeedLine(text));
  while (kept.length && !kept[0].trim()) kept.shift();
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  return [seedText, kept.join("\n")].filter(Boolean).join("\n\n");
}

/**
 * HTML variant of the oracle-detail block, for the Notes tab (system.notes)
 * fallback only — that field IS a rich-text editor, so markup renders. Never
 * write this to system.biography (see buildConnectionCharacteristics).
 */
function buildConnectionDetailsHtml({ role, goal, firstLook, description = "", disposition, pronouns }) {
  const lines = [];
  if (pronouns)    lines.push(`<li><strong>Pronouns:</strong> ${escapeHtmlConn(pronouns)}</li>`);
  if (firstLook)   lines.push(`<li><strong>First look:</strong> ${escapeHtmlConn(firstLook)}</li>`);
  else if (description) lines.push(`<li><strong>Description:</strong> ${escapeHtmlConn(description)}</li>`);
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
async function composeConnectionNotesHtml({ name, role, goal, firstLook, description = "", disposition, pronouns }) {
  const facts = [pronouns, firstLook, disposition, role, goal].filter(Boolean);
  if (!facts.length && !description) return "";

  const prose = await generateConnectionIntroProse({ name, role, goal, firstLook, description, disposition, pronouns })
    .catch(() => null);

  if (!prose) {
    return buildConnectionDetailsHtml({ role, goal, firstLook, description, disposition, pronouns });
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
async function generateConnectionIntroProse({ name, role, goal, firstLook, description = "", disposition, pronouns }) {
  const apiKey = readClaudeKeyConn();
  if (!apiKey) return null;

  const { apiPost } = await import("../api-proxy.js");
  const model = readModuleSettingConn("narrationModel") || "claude-sonnet-5-5";
  const tone  = readModuleSettingConn("narrationTone")  || "wry";

  const system =
    `You are the narrator for an Ironsworn: Starforged solo campaign. ` +
    `Tone: ${tone}. Write a short (2-3 sentence) atmospheric introduction to an ` +
    `NPC the player has just connected with, grounded ONLY in the oracle details ` +
    `provided. Use the NPC's stated pronouns exactly. Evocative but spare. Plain ` +
    `prose only — no headings, lists, or markdown. Do not invent proper nouns, ` +
    `factions, or plot beyond what the details imply.`;

  const userMsg = [
    name        ? `Name: ${name}`                       : null,
    pronouns    ? `Pronouns: ${pronouns}`               : null,
    firstLook   ? `First look: ${firstLook}`            : null,
    !firstLook && description ? `Description: ${description}` : null,
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

  const data = await apiPost("https://api.anthropic.com/v1/messages", headers, body, { label: "connectionIntro" });
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

function escapeHtmlConn(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
