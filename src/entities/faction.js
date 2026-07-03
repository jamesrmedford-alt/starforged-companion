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

import { getOrCreateEntitiesFolder } from "./folder.js";

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

  // Narrator entity-discovery flags (see narrator-entity-discovery scope §3)
  canonicalLocked: false,
  generativeTier:  [],

  // Oracle seeding ran (draft-confirm path; sector-generator factions arrive
  // pre-populated and never need it). See seedFactionRecord.
  seeded: false,

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
    name:   faction.name || "Unknown Faction",
    folder: await getOrCreateEntitiesFolder(),
    flags:  { [MODULE_ID]: { entityType: "faction", entityId: id } },
  });

  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name:  "Faction Data",
    type:  "text",
    text:  { format: 1, content: renderEntityBody(faction) },
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

/**
 * WJ attitude → record relationship mapping (faction-lifecycle audit
 * 2026-07). The entity record is the CANONICAL stance home once it exists
 * (decisions.md → "Faction stance: the entity record is canonical"); the
 * World Journal's coarse attitude vocabulary maps onto the nearest
 * Starforged stance. "unknown" never overwrites an established stance.
 */
export const ATTITUDE_TO_RELATIONSHIP = {
  hostile: "antagonistic",
  neutral: "apathetic",
  allied:  "open_alliance",
};

/**
 * Find a faction entity record by name (case-insensitive, trimmed).
 * Returns `{ id, faction }` — the journal host id plus the record — or null.
 *
 * @param {string} name
 * @param {Object} campaignState
 * @returns {{ id: string, faction: Object } | null}
 */
export function findFactionByName(name, campaignState) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return null;
  for (const id of campaignState?.factionIds ?? []) {
    const faction = getFaction(id);
    if (faction && String(faction.name ?? "").trim().toLowerCase() === wanted) {
      return { id, faction };
    }
  }
  return null;
}

/**
 * Sync a narrative attitude change onto the faction entity record
 * (FACTION-ATTITUDE-SPLIT-BRAIN fix): maps the WJ attitude to a Starforged
 * stance and writes `relationship` when it differs. No-ops for unmapped /
 * unknown attitudes or when no record exists. Never throws.
 *
 * @param {string} name
 * @param {string} attitude — WJ vocabulary (hostile | neutral | allied | unknown)
 * @param {Object} campaignState
 * @returns {Promise<Object|null>} the updated record, or null when nothing changed
 */
export async function applyAttitudeToFactionRecord(name, attitude, campaignState) {
  try {
    const mapped = ATTITUDE_TO_RELATIONSHIP[String(attitude ?? "").toLowerCase()];
    if (!mapped) return null;
    const hit = findFactionByName(name, campaignState);
    if (!hit) return null;
    if (hit.faction.relationship === mapped) return null;
    const updated = await updateFaction(hit.id, { relationship: mapped });
    console.debug?.(
      `${MODULE_ID} | faction: attitude "${attitude}" → record stance "${mapped}" for ${name}`,
    );
    return updated;
  } catch (err) {
    console.warn(`${MODULE_ID} | faction: attitude→record sync failed:`, err?.message ?? err);
    return null;
  }
}

/**
 * Seed a draft-confirmed faction record with the Starforged faction oracles
 * (FACTION-RECORD-WRITE-ONCE fix — connections get seedConnectionActor;
 * factions got name + description only). Fills type, subtype (per type),
 * influence, quirk, and a first project, preserving anything already set.
 * Idempotent via the `seeded` flag. Never throws.
 *
 * @param {string} journalEntryId — faction host id
 * @returns {Promise<Object|null>} the updated record, or null
 */
export async function seedFactionRecord(journalEntryId) {
  try {
    const faction = getFaction(journalEntryId);
    if (!faction || faction.seeded) return faction ?? null;

    const { rollOracle } = await import("../oracles/roller.js");
    const roll = (key) => {
      try { return rollOracle(key)?.result ?? ""; } catch { return ""; }
    };

    const type = faction.type || roll("faction_type");
    let subtype = faction.subtype;
    let dominion = faction.dominion;
    let leadership = faction.leadership;
    if (!subtype) {
      const t = String(type).toLowerCase();
      if (t.includes("dominion")) {
        dominion   = dominion   || roll("faction_dominion");
        leadership = leadership || roll("faction_dominion_leadership");
        subtype    = dominion;
      } else if (t.includes("guild")) {
        subtype = roll("faction_guild");
      } else if (t.includes("fringe")) {
        subtype = roll("faction_fringe");
      }
    }

    const updates = {
      type,
      subtype:    subtype ?? "",
      dominion:   dominion ?? "",
      leadership: leadership ?? "",
      influence:  faction.influence || roll("faction_influence"),
      quirk:      faction.quirk     || roll("faction_quirks"),
      projects:   faction.projects?.length ? faction.projects : [roll("faction_projects")].filter(Boolean),
      seeded:     true,
    };
    return await updateFaction(journalEntryId, updates);
  } catch (err) {
    console.warn(`${MODULE_ID} | faction: oracle seeding failed:`, err?.message ?? err);
    return null;
  }
}

/**
 * Merge the canonical faction picture for narrator context
 * (FACTION-PACKET-DEAD / FACTION-DUAL-STORE fix): entity records win for
 * record-backed factions (their `relationship` is the canonical stance);
 * WJ-only factions contribute their attitude + known goal. Deduped by name,
 * capped. Pure — exported for unit testing.
 *
 * @param {Array<Object>} records   — faction entity records (listFactions)
 * @param {Array<Object>} wjEntries — WJ faction entries (getFactionLandscape)
 * @param {number} [cap=4]
 * @returns {Array<{ name: string, stance: string, detail: string }>}
 */
export function mergeFactionLandscape(records, wjEntries, cap = 4) {
  const out = [];
  const seen = new Set();

  for (const f of records ?? []) {
    if (!f?.name) continue;
    const key = f.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const latestProject = f.projects?.[f.projects.length - 1];
    out.push({
      name:   f.name,
      stance: (f.relationship && f.relationship !== "unknown")
        ? f.relationship.replace(/_/g, " ")
        : "",
      detail: [
        f.subtype ? `${f.type}: ${f.subtype}` : f.type,
        latestProject ? `project: ${latestProject}` : "",
      ].filter(Boolean).join(" · "),
    });
  }

  for (const e of wjEntries ?? []) {
    const name = e?.factionName ?? "";
    if (!name) continue;
    const key = name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      stance: (e.attitude && e.attitude !== "unknown") ? e.attitude : "",
      detail: e.knownGoal ? `goal: ${e.knownGoal}` : "",
    });
  }

  return out.slice(0, Math.max(0, cap));
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
 * Format a Faction for narrator context injection.
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

/**
 * Render the Faction's descriptive fields into HTML for the page body so the
 * JournalEntryPage isn't blank (F19 / theme T3). The full record still lives
 * on the page flag for the entity panel.
 */
export function renderEntityBody(faction) {
  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const out = [];
  const meta = (label, value) =>
    value ? out.push(`<p><strong>${esc(label)}:</strong> ${esc(value)}</p>`) : null;
  meta("Type", faction?.subtype ? `${faction.type}: ${faction.subtype}` : faction?.type);
  if (faction?.relationship && faction.relationship !== "unknown") {
    meta("Stance", faction.relationship.replace(/_/g, " "));
  }
  if (faction?.description) out.push(`<p>${esc(faction.description)}</p>`);
  meta("Quirk", faction?.quirk);
  if (faction?.notes) out.push(`<p>${esc(faction.notes)}</p>`);
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
    console.error(`${MODULE_ID} | faction: persistCampaignState failed:`, err);
    throw err;
  }
}
