/**
 * PROBE — CARDS-06 RECOMMIT-EPIC-RANK-TEXT (tenth audit, area cards)
 *
 * What the user does: Kira misses Fulfill Your Vow on an EPIC vow (or Forge
 * a Bond on an epic connection, or Finish an Expedition on an epic
 * expedition) and presses 🔁 Recommit.
 *
 * What happens: the rank is clamped at epic (nextExpeditionRank) — right —
 * but the "Recommitted" card (postRecommittedCard / performRecommit,
 * src/index.js) always says the rank "rises to <strong>epic</strong>" /
 * "hardens to <strong>epic</strong>", telling the table a rank rose that
 * did not change.
 *
 * What should happen: the vendored text reads "raise the vow's rank by one
 * (if not already epic)" — the card says the rank stays epic (the boxes
 * still clear).
 *
 * Control: a dangerous vow's card says it rises to formidable.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/recommitEpicRankText.probe.js
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, vow, bondItem;
const recommitCards = () => table.cards(f => f.recommitCard);

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

describe('CARDS-06 the "Recommitted" card for a rank already epic', () => {
  it('a vow: says the rank stays epic, not that it rises to epic', async () => {
    const res = await onGm((index) => index.performVowRecommit({ vowName: 'Find Chen', itemId: 'vow-kira', actorId: 'pc-kira' }));
    expect(res).toMatchObject({ ok: true });
    expect(vow.system).toMatchObject({ current: 12, rank: 'epic' });            // the boxes clear; the rank is clamped
    const [card] = recommitCards();
    expect(card).toBeTruthy();
    // Expected: the card says the rank stays epic ("if not already epic"). Actual: "the vow's rank rises to <strong>epic</strong>".
    expect(card.content).not.toMatch(/rises to <strong>epic<\/strong>/);
    expect.soft(card.content).toMatch(/already epic|stays epic|remains epic|cannot rise/i);
  }, 30_000);

  it('a bond: the same', async () => {
    const res = await onGm((index) => index.performBondRecommit({ hostId: 'npc-sable' }));
    expect(res).toMatchObject({ ok: true });
    const [card] = recommitCards();
    expect(card).toBeTruthy();
    expect(card.content).not.toMatch(/rises to <strong>epic<\/strong>/);
  }, 30_000);

  it('an expedition: the same', async () => {
    const res = await onGm((index) => index.performRecommit('exp-1'));
    expect(res).toMatchObject({ ok: true });
    const [card] = recommitCards();
    expect(card).toBeTruthy();
    expect(card.content).not.toMatch(/hardens to <strong>epic<\/strong>/);
  }, 30_000);

  it('control: a dangerous vow\'s card says it rises to formidable', async () => {
    vow.system.rank = 'dangerous';
    const res = await onGm((index) => index.performVowRecommit({ vowName: 'Find Chen', itemId: 'vow-kira', actorId: 'pc-kira' }));
    expect(res).toMatchObject({ ok: true });
    expect(vow.system).toMatchObject({ current: 12, rank: 'formidable' });
    expect(recommitCards()[0].content).toMatch(/rises to <strong>formidable<\/strong>/);
  }, 30_000);
});
