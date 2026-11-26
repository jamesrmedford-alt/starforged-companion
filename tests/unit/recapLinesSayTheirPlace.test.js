/**
 * STARFORGED COMPANION
 * tests/unit/recapLinesSayTheirPlace.test.js
 *
 * RECAP-PLACES-AN-EVENT-BY-THE-NEXT (the long haul's eighth live round,
 * 2026-11-26): a93's recap said "Back at Hollow Spire you rewrapped your
 * burn after a clumsy first try" — the dressing was at the Bleakhold berth
 * (a66–a69), before the journey (a71). The sentence cited the two Heal lines
 * and the health they gave (s3-11, s3-14, s3-16), none of which named a place.
 *
 * Each line of the recap's source says where it happened, by the record's
 * scene, where the place changes.
 */

import { describe, it, expect } from 'vitest';
import { recapSource } from '../../src/record/recapView.js';
import { readRecord } from '../../src/record/read.js';

let n = 0;
const ev = (k, { s = 'sess-3', who = {}, ref = {}, d = {}, text } = {}) => {
  n += 1;
  return { id: `e${n}`, k, at: n * 1000, seq: n, s, scene: d.sceneId ?? 'sc-1',
    who: { user: who.user ?? null, actor: who.actor ?? null }, ref, d, ...(text !== undefined ? { text } : {}) };
};
const page = (sessionId, number, events) => ({
  pageId: `p-${sessionId}`, sessionId, number, name: `Session ${number}`, createdAt: number, story: '',
  record: { v: 1, sessionId, events: Object.fromEntries(events.map(e => [e.id, e])) },
});
const read = (pages) => readRecord({ session: 'campaign' }, {
  pages, currentSessionId: pages.at(-1).sessionId,
  nameOf: (id) => ({ 'pc-mira': 'Mira Kestrel' })[id] ?? null, otherNames: ['Mira Kestrel'],
});
const mira = { actor: 'pc-mira' };
const beat = (s, res, line, move) => [
  ev('line', { s, who: mira, d: { via: 'typed' }, text: line }),
  ev('move.resolved', { s, who: mira, ref: { res }, d: move }),
];

describe('the recap\'s lines say where they happened', () => {
  it('the burn dressed at Bleakhold, before the journey; then Hollow Spire, once, where the place changes', () => {
    const s = 'sess-3';
    const events = [
      ev('scene.started', { s, d: { sceneId: 'sc-berth', place: { id: 'loc-bleak', name: 'Bleakhold Station' } } }),
      ...beat(s, 'r1', 'I sit down with the med kit and dress the burn on my forearm.', { moveId: 'heal', moveName: 'Heal', statUsed: 'iron', outcome: 'miss' }),
      ...beat(s, 'r2', 'I try again to wrap the burn properly.', { moveId: 'heal', moveName: 'Heal', statUsed: 'iron', outcome: 'weak_hit' }),
      ev('scene.ended', { s, d: { sceneId: 'sc-berth', turn: true } }),
      ev('scene.started', { s, d: { sceneId: 'sc-stall', place: { id: 'loc-hollow', name: 'Hollow Spire' } } }),
      ...beat(s, 'r3', 'I tell Tamsin what I learned about the raiders.', { moveId: 'develop_your_relationship', moveName: 'Develop Your Relationship' }),
      ...beat(s, 'r4', 'I tell her I trust her with the whole truth.', { moveId: 'develop_your_relationship', moveName: 'Develop Your Relationship' }),
    ];
    const lines = recapSource({ read: read([page(s, 3, events)]) }).text.split('\n').filter(l => /^\[s3-/.test(l));
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^\[s3-\d+\] at Bleakhold Station — Mira Kestrel — the player wrote “I sit down with the med kit/);
    expect(lines[1]).toMatch(/^\[s3-\d+\] Mira Kestrel — the player wrote “I try again/);
    expect(lines[2]).toMatch(/^\[s3-\d+\] at Hollow Spire — Mira Kestrel — the player wrote “I tell Tamsin/);
    expect(lines[3]).not.toContain('at Hollow Spire');
  });

  it('a line with no scene, or a scene between places, says no place', () => {
    const s = 'sess-3';
    const events = [
      ...beat(s, 'r1', 'I check the hold.', { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'wits', outcome: 'strong_hit' }),
      ev('scene.started', { s, d: { sceneId: 'sc-void', place: null } }),
      ...beat(s, 'r2', 'I steer for the beacon.', { moveId: 'undertake_an_expedition', moveName: 'Undertake an Expedition', statUsed: 'wits', outcome: 'weak_hit' }),
    ];
    const text = recapSource({ read: read([page(s, 3, events)]) }).text;
    expect(text).not.toMatch(/\] at /);
  });
});
