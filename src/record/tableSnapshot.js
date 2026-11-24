/**
 * STARFORGED COMPANION
 * src/record/tableSnapshot.js — the table as it stands, for a session's first and last events (issue #382)
 *
 * `session.begun` and `session.ended` each carry the table as it was then:
 * the player characters' meters, impacts and XP, the open vows, the open
 * progress tracks and the place. It is what a check adds the session's
 * `sheet.changed` events to (the record adds up — never a read: where things
 * stand is read live from the sheet and the tracks).
 *
 * Every actor read is the bridge's (CLAUDE.md: all actor access through
 * actorBridge.js); a player character is one `getPlayerActors` returns, never
 * `type === "character"` alone.
 */

import { getPlayerActors, readCharacterSnapshot, readVows } from '../character/actorBridge.js';
import { recordEvent } from './record.js';

const MODULE_ID = 'starforged-companion';

/**
 * The open vows across the table, a shared vow's copies as one vow by its
 * `vowId` (a vow with none is its own Item).
 *
 * @param {Actor[]} pcs
 * @returns {Array<{ vowId: string|null, itemIds: string[], name: string, rank: string, ticks: number, holders: string[] }>}
 */
function openVows(pcs) {
  const byId = new Map();
  for (const pc of pcs) {
    for (const v of readVows(pc)) {
      if (v.completed) continue;
      const key = v.vowId ?? `item:${v.id}`;
      const held = byId.get(key) ?? { vowId: v.vowId ?? null, itemIds: [], name: v.name, rank: v.rank, ticks: v.ticks, holders: [] };
      if (v.id) held.itemIds.push(v.id);
      held.holders.push(pc.id);
      held.ticks = Math.max(held.ticks, v.ticks);
      byId.set(key, held);
    }
  }
  return [...byId.values()];
}

/**
 * The table as it stands.
 *
 * @param {Object|null} campaignState — the stored one (its place, its session number)
 * @returns {Promise<{ pcs: Object[], vows: Object[], tracks: Object[], place: Object|null }>}
 */
export async function tableSnapshot(campaignState) {
  let pcs = [];
  try { pcs = getPlayerActors(); } catch { pcs = []; }
  const pcRows = pcs.map((actor) => {
    const snap = readCharacterSnapshot(actor);
    return {
      actorId: actor.id,
      name:    actor.name ?? '',
      meters:  { ...(snap?.meters ?? {}) },
      impacts: Object.entries(snap?.debilities ?? {}).filter(([, on]) => on).map(([key]) => key),
      xp:      snap?.xp?.value ?? 0,
    };
  });

  let tracks = [];
  try {
    const { listOpenProgressTracks } = await import('../ui/progressTracks.js');
    tracks = listOpenProgressTracks().map(t => ({
      id: t.id ?? null, type: t.type ?? null, label: t.label ?? '', rank: t.rank ?? null, ticks: Number(t.ticks) || 0,
    }));
  } catch (err) {
    console.warn(`${MODULE_ID} | session record: the open progress tracks could not be read for the session's snapshot:`, err?.message ?? err);
  }

  let place = null;
  if (campaignState?.currentLocationId) {
    let name = null;
    try {
      const { currentLocationName } = await import('../narration/narrator.js');
      name = currentLocationName(campaignState) ?? null;
    } catch {
      name = null;
    }
    place = { id: campaignState.currentLocationId, type: campaignState.currentLocationType ?? null, name };
  }

  return { pcs: pcRows, vows: openVows(pcs), tracks, place };
}

/**
 * Record a session's begin or end with the table as it stands — called by the
 * three places a session begins or ends (Begin a Session, End a Session, a
 * session closed by idleness), after the write that begins or ends it has
 * landed. The characters' sheets are read as it is called, before its first
 * await — so the snapshot is the table before anything the begin or end goes
 * on to change, with nobody waiting on it — and the event is stamped with
 * that moment. Never throws.
 *
 * @param {"session.begun"|"session.ended"} kind
 * @param {Object|null} campaignState — the session's, as stored
 * @param {Object} [d] — the kind's own facts (`number`, `perspective`, `focus`; `reason`)
 * @param {{ session?: string|null }} [opts] — the session it is recorded for (default: campaignState's)
 * @returns {Promise<void>}
 */
export async function recordSessionEdge(kind, campaignState, d = {}, { session = null } = {}) {
  const at = Date.now();
  try {
    const snap = await tableSnapshot(campaignState);
    recordEvent(kind, { session: session ?? campaignState?.currentSessionId ?? null, scene: null, at, d: { ...snap, ...d } });
  } catch (err) {
    console.warn(`${MODULE_ID} | session record: "${kind}" was not recorded:`, err?.message ?? err);
  }
}
