/**
 * STARFORGED COMPANION
 * tests/unit/draftCardsForOneShip.test.js
 *
 * Known-issues DRAFT-CARDS-FOR-ONE-SHIP — the long haul's third and fourth
 * live runs (issue #383, `explorations/long-haul-live-20261124-213912/`,
 * a41–a65): one raider cutter was offered on three pending ◈ New Entities
 * Detected cards — "The Ashen Wake" (a41), "Ashen Wake" (a46) and, after the
 * table corrected its name, "Cinder Wren" (a60, a65). The detector's dedup
 * matched a name whole (normalizeEntityName keeps a leading "The"), so the
 * same ship with and without its article was two; and a correction of a
 * name reached every store but a pending draft, so the new name was new to
 * the detector. Drafts are matched without a leading article — against the
 * pending rows, the records and each other in one reply — and a name the table
 * changes is carried to a row still pending under the old one.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { routeEntityDrafts, parseDetectionResponse, carryNameChangeToPendingDrafts } from '../../src/entities/entityExtractor.js';
import { recordNameChanged } from '../../src/factContinuity/nameChanges.js';

const MODULE = 'starforged-companion';
const KEY = `${MODULE}.campaignState`;
const draftCards = () => ChatMessage._created.filter(m => m.flags?.[MODULE]?.draftEntityCard);
const rows = () => draftCards().flatMap(m => m.flags[MODULE].drafts);
const syncChat = () => {
  const contents = ChatMessage._created.slice();
  game.messages = { contents, get: (id) => contents.find(m => m.id === id) ?? null };
};

const CS = (over = {}) => ({
  currentSessionId: 'sess-2', sessionNumber: 2, dismissedEntities: [], sectors: [],
  connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [], ...over,
});
const SHIP = (name) => ({ type: 'ship', name, description: 'A cutter-scarred vessel that drops out of the dark off Bleakhold\'s ring', confidence: 'high' });
const reply = (entities) => JSON.stringify({ entities, renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] } });

beforeEach(() => {
  game.actors._reset();
  game.user = { isGM: true, id: 'test-user-gm' };
  ChatMessage._reset();
  game.messages = { contents: [], get: () => null };
  game.settings._store.set(KEY, CS());
});

describe('a ship named with and without its article is one draft (DRAFT-CARDS-FOR-ONE-SHIP)', () => {
  it('a41 then a46: "The Ashen Wake" pending, "Ashen Wake" detected — not offered again', async () => {
    await routeEntityDrafts([SHIP('The Ashen Wake')], CS(), { autoCreateConnection: false });
    syncChat();
    expect(rows().map(d => d.name)).toEqual(['The Ashen Wake']);

    // The detection's own filter, and the route behind it.
    expect(parseDetectionResponse(reply([SHIP('Ashen Wake')]), CS()).entities).toEqual([]);
    const { queued } = await routeEntityDrafts([SHIP('Ashen Wake')], CS(), { autoCreateConnection: false });
    expect(queued).toEqual([]);
    expect(draftCards()).toHaveLength(1);
  });

  it('and the other way round: "Ashen Wake" pending, "The Ashen Wake" detected', async () => {
    await routeEntityDrafts([SHIP('Ashen Wake')], CS(), { autoCreateConnection: false });
    syncChat();
    expect(parseDetectionResponse(reply([SHIP('The Ashen Wake')]), CS()).entities).toEqual([]);
    expect((await routeEntityDrafts([SHIP('The Ashen Wake')], CS(), { autoCreateConnection: false })).queued).toEqual([]);
  });

  it('one reply that names the ship both ways offers it once', async () => {
    const both = [SHIP('The Ashen Wake'), SHIP('Ashen Wake')];
    expect(parseDetectionResponse(reply(both), CS()).entities.map(e => e.name)).toEqual(['The Ashen Wake']);
    const { queued } = await routeEntityDrafts(both, CS(), { autoCreateConnection: false });
    expect(queued.map(e => e.name)).toEqual(['The Ashen Wake']);
  });

  it('a name the GM dismissed with its article stays dismissed without it', () => {
    expect(parseDetectionResponse(reply([SHIP('Ashen Wake')]), CS({ dismissedEntities: ['The Ashen Wake'] })).entities).toEqual([]);
  });

  it('control: another ship, and a name that only begins like one, are still offered', async () => {
    await routeEntityDrafts([SHIP('The Ashen Wake')], CS(), { autoCreateConnection: false });
    syncChat();
    const { queued } = await routeEntityDrafts([SHIP('Ashen Lantern'), SHIP('Theodora')], CS(), { autoCreateConnection: false });
    expect(queued.map(e => e.name)).toEqual(['Ashen Lantern', 'Theodora']);
  });
});

describe('a name the table corrects is carried to a draft still pending under the old one', () => {
  const CHANGE = { from: 'Ashen Wake', to: 'Cinder Wren', kind: 'corrected', about: 'raider cutter' };

  it('a49: "Ashen Wake" corrected to "Cinder Wren" — the pending row is "The Cinder Wren", and a60\'s "Cinder Wren" is not offered', async () => {
    await routeEntityDrafts([SHIP('The Ashen Wake')], CS(), { autoCreateConnection: false });
    syncChat();
    // The correction as `!truth` makes it: the store holds it, then it is recorded.
    game.settings._store.set(KEY, CS({ nameChanges: [{ ...CHANGE, sessionId: 'sess-2', at: Date.now() }] }));
    recordNameChanged(CHANGE);
    await vi.waitFor(() => expect(rows().map(d => d.name)).toEqual(['The Cinder Wren']));
    expect(draftCards()[0].content).toContain('<strong>The Cinder Wren</strong>');
    expect(draftCards()[0].content).not.toContain('Ashen Wake');

    syncChat();
    expect(parseDetectionResponse(reply([SHIP('Cinder Wren')]), CS()).entities).toEqual([]);
    expect((await routeEntityDrafts([SHIP('Cinder Wren')], CS(), { autoCreateConnection: false })).queued).toEqual([]);
    expect(draftCards()).toHaveLength(1);
  });

  it('a row confirmed or dismissed keeps its name; only a pending one is carried', async () => {
    await routeEntityDrafts([SHIP('Ashen Wake')], CS(), { autoCreateConnection: false });
    syncChat();
    const card = draftCards()[0];
    card.flags[MODULE].drafts = [...card.flags[MODULE].drafts, { ...SHIP('Ashen Wake'), index: 1, status: 'dismissed' }];
    expect(await carryNameChangeToPendingDrafts(CHANGE)).toBe(1);
    expect(rows().map(d => [d.name, d.status])).toEqual([['Cinder Wren', 'pending'], ['Ashen Wake', 'dismissed']]);
  });

  it('nothing pending under the old name: nothing written', async () => {
    await routeEntityDrafts([SHIP('Kobayashi Drift')], CS(), { autoCreateConnection: false });
    syncChat();
    const before = draftCards()[0].content;
    expect(await carryNameChangeToPendingDrafts(CHANGE)).toBe(0);
    expect(draftCards()[0].content).toBe(before);
  });
});
