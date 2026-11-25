/**
 * STARFORGED COMPANION
 * src/record/trackDiff.js — what a save of the progress tracks began, marked, moved or ended (issue #382, slice 2)
 *
 * `track.begun`, `progress.marked`, `position.changed` and `track.ended` are
 * observed where every track write lands — `writeTracks`
 * (ui/progressTracks.js), one save at a time — by comparing the list the
 * journal held with the list saved, by track id. So no track writer reports
 * one (the panel's +, a move's progress, a fight's position, a recommit, a
 * track's creation or its completion), and a new writer cannot forget to.
 *
 *   - an id the list did not hold: `track.begun`;
 *   - ticks that moved: `progress.marked` (a recommit's clear among them);
 *   - a character's position in a fight that moved (`positions`, else the
 *     fight's own `combatState`): `position.changed`;
 *   - a track newly completed: `track.ended`, completed; one gone from the
 *     list unfinished: `track.ended`, not completed.
 *
 * A vow's or a connection's journal twin is left out: the vow is its Items
 * on the sheets (record/sheetWatch.js), the connection its record
 * (entities/connection.js) — each change recorded there, once.
 *
 * `trackEvents` is pure; `recordTrackChanges` records what it finds.
 */

import { recordEvent } from './record.js';

/** The track types recorded elsewhere — a vow's journal twin, a connection's. */
const TWINS = new Set(['vow', 'connection']);
const byId = (list) => new Map((Array.isArray(list) ? list : [])
  .filter(t => t && typeof t.id === 'string' && !TWINS.has(t.type)).map(t => [t.id, t]));
const POSITIONS = new Set(['in_control', 'bad_spot']);

/**
 * The events a track save amounts to.
 *
 * @param {Object[]} before — the tracks as the journal held them
 * @param {Object[]} after  — the tracks saved
 * @returns {Array<{ kind: string, payload: Object }>}
 */
export function trackEvents(before, after) {
  const out = [];
  const held = byId(before);
  const saved = byId(after);
  const facts = (t) => ({ type: t.type ?? null, label: String(t.label ?? ''), rank: t.rank ?? null });
  for (const [id, t] of saved) {
    const was = held.get(id) ?? null;
    if (!was) {
      out.push({ kind: 'track.begun', payload: { ref: { track: id, vow: t.linkedVowId ?? null }, d: {
        ...facts(t), ...(t.linkedVowId ? { linkedVowId: t.linkedVowId } : {}), ...(t.siteId ? { siteId: t.siteId } : {}),
      } } });
    }
    const from = Number(was?.ticks ?? 0);
    const to = Number(t.ticks ?? 0);
    if (was && from !== to) out.push({ kind: 'progress.marked', payload: { ref: { track: id }, d: { label: facts(t).label, rank: t.rank ?? null, from, to } } });
    const posBefore = was?.positions ?? {};
    for (const [actorId, pos] of Object.entries(t.positions ?? {})) {
      if (POSITIONS.has(pos) && posBefore[actorId] !== pos) {
        out.push({ kind: 'position.changed', payload: { who: { actor: actorId }, ref: { track: id }, d: { actorId, label: facts(t).label, to: pos } } });
      }
    }
    if (!t.positions && POSITIONS.has(t.combatState) && (was?.combatState ?? null) !== t.combatState) {
      out.push({ kind: 'position.changed', payload: { ref: { track: id }, d: { label: facts(t).label, to: t.combatState } } });
    }
    if (t.completed === true && was && was.completed !== true) {
      out.push({ kind: 'track.ended', payload: { ref: { track: id }, d: { ...facts(t), completed: true } } });
    }
  }
  for (const [id, t] of held) {
    if (saved.has(id) || t.completed === true) continue;
    out.push({ kind: 'track.ended', payload: { ref: { track: id }, d: { ...facts(t), completed: false } } });
  }
  return out;
}

/**
 * Record what a track save began, marked, moved or ended. Called by
 * writeTracks once its save landed. Never throws. `by`: what made the save
 * (a move's `{ move, res }`, `"hand"`), on each begun, marked and ended
 * event (overhaul 4, D12).
 *
 * @param {Object[]} before
 * @param {Object[]} after
 * @param {{ by?: Object|string|null }} [opts]
 */
export function recordTrackChanges(before, after, { by = null } = {}) {
  try {
    for (const { kind, payload } of trackEvents(before, after)) {
      const made = by && kind !== 'position.changed' ? { ...payload, d: { ...payload.d, by } } : payload;
      recordEvent(kind, made);
    }
  } catch (err) {
    console.warn('starforged-companion | session record: a track save was not recorded:', err?.message ?? err);
  }
}
