/**
 * Issue #336 Y26 — RECOMMIT-EPIC-RANK-TEXT.
 *
 * 🔁 Recommit on an EPIC vow, bond or expedition: the rank is rightly clamped
 * (nextExpeditionRank), but the "Recommitted" card said the rank "rises to
 * epic" / "hardens to epic" — a rise that did not happen. The vendored text
 * reads "raise the … rank by one (if not already epic)": the card now says
 * the rank stays epic (the boxes still clear).
 *
 * Control: a dangerous vow's card says it rises to formidable.
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, vow, bondItem;
const recommitCards = () => table.cards(f => f.recommitCard);
const STAYS = /rank stays <strong>epic<\/strong> — it cannot rise further/;

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

function progressItem(id, name, subtype, rank, current, itemFlags = {}) {
  const item = {
    id, type: 'progress', name, flags: itemFlags,
    system: { subtype, rank, current, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split('.'); let t = item;
        for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
        t[parts.at(-1)] = v;
      }
      return item;
    },
  };
  return item;
}

/** The GM runs `fn` with the d10s scripted (2 and 6 → lowest 2). */
async function onGm(fn) {
  const gm = table.client('gm-1');
  const rng = vi.spyOn(Math, 'random');
  rng.mockReturnValueOnce(0.15).mockReturnValueOnce(0.55);
  try {
    const res = await gm.run(() => fn(gm.index));
    await table.settle(); await table.drain();
    return res;
  } finally { rng.mockRestore(); }
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'ep-s1', sessionNumber: 1, connectionIds: ['npc-sable'] },
  } } });
  vow      = progressItem('vow-kira', 'Find Chen', 'vow', 'epic', 20, { [MODULE_ID]: { vowId: 'vid-kira' } });
  bondItem = progressItem('bond-sable', 'Sable', 'bond', 'epic', 20, { [MODULE_ID]: { connectionId: 'conn-sable' } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, hasPlayerOwner: true, items: { contents: [vow, bondItem] } });
  table.addActor({ id: 'npc-sable', name: 'Sable', type: 'character', flags: { [MODULE_ID]: {
    entityType: 'connection', connection: {
      _id: 'conn-sable', name: 'Sable', rank: 'epic', relationshipTicks: 20, bonded: false, active: true, history: [],
    } } } });
  table.journal._set(makeTracksJournal([{ id: 'exp-1', label: 'The Drift', type: 'expedition', rank: 'epic', ticks: 20, completed: false }]));
  silenceConsoleErrors();
});

describe('issue #336 Y26 — the "Recommitted" card for a rank already epic', () => {
  it('a vow: says the rank stays epic, not that it rises to epic', async () => {
    const res = await onGm((index) => index.performVowRecommit({ vowName: 'Find Chen', itemId: 'vow-kira', actorId: 'pc-kira' }));
    expect(res).toMatchObject({ ok: true });
    expect(vow.system).toMatchObject({ current: 12, rank: 'epic' });            // the boxes clear; the rank is clamped
    const [card] = recommitCards();
    expect(card).toBeTruthy();
    expect(card.content).not.toMatch(/rises to <strong>epic<\/strong>/);
    expect(card.content).toMatch(/the vow's rank stays <strong>epic<\/strong> — it cannot rise further/);
  }, 30_000);

  it('a vow the vendor ranks by number (5) reads as epic too', async () => {
    vow.system.rank = 5;
    const res = await onGm((index) => index.performVowRecommit({ vowName: 'Find Chen', itemId: 'vow-kira', actorId: 'pc-kira' }));
    expect(res).toMatchObject({ ok: true });
    expect(recommitCards()[0].content).toMatch(STAYS);
  }, 30_000);

  it('a bond: the same', async () => {
    const res = await onGm((index) => index.performBondRecommit({ hostId: 'npc-sable' }));
    expect(res).toMatchObject({ ok: true });
    const [card] = recommitCards();
    expect(card).toBeTruthy();
    expect(card.content).not.toMatch(/rises to <strong>epic<\/strong>/);
    expect(card.content).toMatch(/the connection's rank stays <strong>epic<\/strong> — it cannot rise further/);
  }, 30_000);

  it('an expedition: the same', async () => {
    const res = await onGm((index) => index.performRecommit('exp-1'));
    expect(res).toMatchObject({ ok: true });
    const [card] = recommitCards();
    expect(card).toBeTruthy();
    expect(card.content).not.toMatch(/hardens to <strong>epic<\/strong>/);
    expect(card.content).toMatch(/the expedition's rank stays <strong>epic<\/strong> — it cannot rise further\. The journey continues/);
  }, 30_000);

  it('control: a dangerous vow\'s card says it rises to formidable', async () => {
    vow.system.rank = 'dangerous';
    const res = await onGm((index) => index.performVowRecommit({ vowName: 'Find Chen', itemId: 'vow-kira', actorId: 'pc-kira' }));
    expect(res).toMatchObject({ ok: true });
    expect(vow.system).toMatchObject({ current: 12, rank: 'formidable' });
    expect(recommitCards()[0].content).toMatch(/rises to <strong>formidable<\/strong>/);
    expect(recommitCards()[0].content).not.toMatch(STAYS);
  }, 30_000);
});
