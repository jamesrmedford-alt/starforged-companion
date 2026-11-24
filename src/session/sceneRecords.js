/**
 * STARFORGED COMPANION
 * src/session/sceneRecords.js — the campaign's own records a set-piece's die
 * is cast among (issue #381).
 *
 * A closing cutaway shows someone the campaign has, or a place the table
 * knows, chosen by a die among them (endSessionVignette.js); a spotlight
 * vignette is about one of the records its row names (spotlightVignette.js).
 * Each reader
 * here gives the options for sceneSeeds.js chooseSeed: the name the narrator
 * and the table are told, its `kind`, a stable `ref` — the record's own id,
 * which "never the same twice running" compares (rules/reachability.md §6:
 * a name is the fallback, not the key) — and the context the narrator is
 * given of it. Reads only; fail-open per source: one that cannot be read
 * gives none.
 */

import { listConnections } from "../entities/connection.js";
import { getSettlement } from "../entities/settlement.js";
import { getActiveThreats } from "../world/worldJournal.js";
import { listFactions } from "../entities/faction.js";
import { tableVows, questVows, distinctOpenVows } from "./openThreads.js";

const MODULE_ID = "starforged-companion";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** One source's records, or none when it cannot be read. */
function readOr(read, what) {
  try {
    const out = read();
    return Array.isArray(out) ? out : [];
  } catch (err) {
    console.warn(`${MODULE_ID} | scene records: ${what} could not be read:`, err?.message ?? err);
    return [];
  }
}

/**
 * A connection as the narrator is told it. Pronouns lead (finding R): a
 * session set-piece runs in the session_vignette mode, which injects no
 * entity cards, so this is the narrator's only source for the person's
 * established gender — placed first, it survives the 220-character cut.
 */
function connectionHint(c) {
  const pron  = c.pronouns    ? `Pronouns: ${c.pronouns}` : "";
  const role  = c.role        ? `Role: ${c.role}` : "";
  // The goal the narration (or the oracles) gave them — a detected NPC's goal
  // is on `goal` since issue #325 W31, no longer on `motivation`.
  const goal  = c.goal        ? `Goal: ${c.goal}` : "";
  const motiv = c.motivation && c.motivation !== c.goal ? `Motivation: ${c.motivation}` : "";
  const desc  = c.description ? c.description : "";
  return [pron, role, goal, motiv, desc].filter(Boolean).join(" · ").slice(0, 220);
}

/** A settlement as the narrator is told it: its trouble and first look lead. */
function settlementHint(s) {
  const look = Array.isArray(s.firstLook) ? s.firstLook.map(clean).filter(Boolean).join("; ") : clean(s.firstLook);
  return [
    s.trouble   ? `Trouble: ${clean(s.trouble)}` : "",
    look        ? `First look: ${look}` : "",
    s.authority ? `Authority: ${clean(s.authority)}` : "",
    clean(s.description),
  ].filter(Boolean).join(" · ").slice(0, 220);
}

/**
 * The connections in play: a severed or lost one (`active: false` — `!sever`
 * keeps `bonded`) is the person the crew just lost, not a set-piece's
 * subject (issue #321 U61). Each with its rank, whether bonded, and its card's
 * LAST KNOWN location (the scene end keeps it there — sceneLifecycle.js).
 *
 * @param {Object} campaignState
 * @returns {Array<{ name: string, kind: string, ref: string|null, hint: string, lastKnown: string, bonded: boolean, rank: string|null }>}
 */
export function connectionsInPlay(campaignState) {
  return readOr(() => listConnections(campaignState ?? {}), "the connections")
    .filter(c => c && c.active !== false && clean(c.name))
    .map(c => ({
      name:      clean(c.name),
      kind:      c.bonded === true ? "bonded_connection" : "connection",
      ref:       c._id ? `connection:${c._id}` : null,
      hint:      connectionHint(c),
      lastKnown: clean(c.lastKnown?.location?.value),
      bonded:    c.bonded === true,
      rank:      typeof c.rank === "string" ? c.rank : null,
    }));
}

/**
 * The named active threats of the World Journal. A threat's page is named
 * for it, so its name is its key.
 *
 * @param {Object} campaignState
 * @returns {Array<{ name: string, kind: string, ref: string, hint: string }>}
 */
export function namedThreats(campaignState) {
  return readOr(() => getActiveThreats(campaignState ?? {}), "the threats")
    .filter(t => clean(t?.name))
    .map(t => ({ name: clean(t.name), kind: "threat", ref: `threat:${clean(t.name).toLowerCase()}`, hint: clean(t.summary).slice(0, 200) }));
}

/**
 * The active sector's settlements: their records — the canonical store,
 * each under its host document's id, the id `campaignState.currentLocationId`
 * names (index.js resolveCurrentLocationName) — or, with none readable, the
 * sector's own list, as the narrator's active-sector roster reads them
 * (narrator.js formatActiveSector). [] with no active sector.
 *
 * @param {Object} campaignState
 * @returns {Array<{ name: string, kind: string, ref: string|null, id: string|null, hint: string }>}
 */
export function sectorSettlements(campaignState) {
  const sectorId = campaignState?.activeSectorId ?? null;
  const sector = sectorId ? (campaignState?.sectors ?? []).find?.(s => s?.id === sectorId) : null;
  if (!sector) return [];
  const records = readOr(() => (Array.isArray(campaignState?.settlementIds) ? campaignState.settlementIds : [])
    .map(hostId => { const s = getSettlement(hostId); return s ? { ...s, hostId } : null; })
    .filter(Boolean), "the settlements")
    .filter(s => clean(s?.name) && (!s.sectorId || s.sectorId === sectorId));
  const stored = Array.isArray(sector.settlements) && sector.settlements.length
    ? sector.settlements
    : (sector.mapData?.settlements ?? []);
  return (records.length ? records : stored).filter(s => clean(s?.name)).map(s => {
    const id = s.hostId ?? s.id ?? s._id ?? null;
    return { name: clean(s.name), kind: "settlement", ref: id ? `settlement:${id}` : null, id, hint: settlementHint(s) };
  });
}

/**
 * The factions on record (a retired one, `active: false`, is none).
 *
 * @param {Object} campaignState
 * @returns {Array<{ name: string, kind: string, ref: string|null }>}
 */
export function recordedFactions(campaignState) {
  return readOr(() => listFactions(campaignState ?? {}), "the factions")
    .filter(f => f && f.active !== false && clean(f.name))
    .map(f => ({ name: clean(f.name), kind: "faction", ref: f._id ? `faction:${f._id}` : null }));
}

/**
 * The open quest vows — a shared vow's copies are one, and a character's
 * background vow is no quest (session/openThreads.js).
 *
 * @returns {Array<{ name: string, kind: string, ref: string|null }>}
 */
export function openVowsOnRecord() {
  return readOr(() => distinctOpenVows(questVows(tableVows())), "the open vows")
    .filter(v => clean(v?.name))
    .map(v => ({ name: clean(v.name), kind: "vow", ref: v.key ? `vow:${v.key}` : null }));
}

/**
 * The table's running clocks — active and not full. A hidden plan's clock
 * (`planId`) is left out: it paces what the table has not been shown.
 *
 * @param {Object} campaignState
 * @returns {Array<{ name: string, kind: string, ref: string|null }>}
 */
export function tableClocksOnRecord(campaignState) {
  return (Array.isArray(campaignState?.clocks) ? campaignState.clocks : [])
    .filter(c => c && c.active !== false && !c.planId && clean(c.name) && (Number(c.filled) || 0) < (Number(c.segments) || 0))
    .map(c => ({ name: clean(c.name), kind: "clock", ref: c._id ? `clock:${c._id}` : null }));
}
