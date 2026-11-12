/**
 * STARFORGED COMPANION
 * tests/unit/momentumMinimumRedirect.test.js
 *
 * MOMENTUM-MIN-REDIRECT-MANUAL — Lose Momentum at its minimum (-6): "If your
 * momentum is at its minimum (-6), apply the cost to another suffer move or
 * clear progress" (play kit). The card said the remainder must be redirected,
 * and no card offered the choice (the dialog that was to recurse into it was
 * deleted in the 2026-07 review). The remainder — a Lose Momentum's own, or a
 * harm's overflow — now posts the "make a suffer move" picker for it, Lose
 * Momentum excepted, with a "clear progress" button per open track (one
 * rank's mark).
 *
 * The booted table: a GM and a player; an "any" suffer picker posted by a
 * relayed Pay the Price route ("make a suffer move (-2)"); Kira at -5
 * momentum; an expedition open with progress on it.
 */

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { applyPayThePriceSufferFromRelay } from '../../src/index.js';

let table, kira, journal, expedition;
const gm = () => table.client('gm-1');
const pickers = () => table.cards(f => f.sufferCard && f.sufferPrompt);
const tracks = () => journal.getFlag(MODULE_ID, 'tracks') ?? [];
const ENDURE_HARM = 0;
const LOSE_MOMENTUM = 2;

function progressJournal() {
  const flags = {};
  return {
    id: 'mmr-progress', name: 'Starforged Progress Tracks',
    getFlag: (scope, key) => flags[`${scope}.${key}`],
    setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = structuredClone(value); },
  };
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: true } } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { health: { value: 5, max: 5 }, momentum: { value: -5 } } });
  journal = progressJournal();
  table.journal._set(journal);
  const store = await gm().import('../../src/ui/progressTracks.js');
  expedition = await gm().run(async () => {
    const t = await store.addProgressTrack({ type: 'expedition', label: 'Reach Farpoint', rank: 'dangerous' });
    await store.updateTrackFields(t.id, { ticks: 12 });
    return t;
  });
});

async function anyPrice(amount = 2) {
  const ctx = () => ({ requesterId: 'pl-1', requester: globalThis.game.users.get('pl-1'), requesterIsGM: false });
  await gm().run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: 'any', amount }], actorId: 'pc-kira' }, ctx()));
  await table.settle(); await table.drain();
  return pickers().at(-1);
}

async function click(card, selector, index = 0) {
  await table.client('pl-1').click(card._id, selector, { index });
  await table.settle(); await table.drain();
}

describe('MOMENTUM-MIN-REDIRECT-MANUAL', () => {
  it("Lose Momentum (-2) at -5: -6 is taken, and the 1 left goes to a picker — Lose Momentum unavailable, the expedition's progress offered", async () => {
    const first = await anyPrice(2);
    await click(first, '[data-action="sf-suffer-pick"]', LOSE_MOMENTUM);
    expect(kira.system.momentum.value).toBe(-6);

    const redirect = pickers().at(-1);
    expect(redirect._id).not.toBe(first._id);
    expect(redirect.flags[MODULE_ID]).toMatchObject({ actorId: 'pc-kira', resolved: false,
      sufferPrompt: { kind: 'any', amount: 1, exclude: ['lose_momentum'], clearTracks: [{ id: expedition.id, label: 'Reach Farpoint' }] } });
    expect(redirect.content).toMatch(/Lose Momentum \(-1\) \(unavailable\)/);
    expect(redirect.content).toMatch(/Clear progress: Reach Farpoint/);
    const summary = table.cards(f => f.suffer === 'lose_momentum').at(-1);
    expect(summary.content).toMatch(/at minimum; 1 not taken — make another suffer move or clear progress: choose it on its card/);
  }, 30_000);

  it('the picker\'s "clear progress" clears one rank\'s mark on that track', async () => {
    const first = await anyPrice(2);
    await click(first, '[data-action="sf-suffer-pick"]', LOSE_MOMENTUM);
    const redirect = pickers().at(-1);
    await click(redirect, '[data-action="sf-suffer-pick"][data-pick-kind="clear"]');
    expect(tracks().find(t => t.id === expedition.id).ticks).toBe(4);   // dangerous: 8 ticks a mark
    expect(table.cards(f => f.sufferCard).find(m => m._id === redirect._id).content).toMatch(/Applied: cleared progress on Reach Farpoint/);
    expect(kira.system.momentum.value).toBe(-6);
  }, 30_000);

  it("or another suffer move takes it: Endure Harm (-1)", async () => {
    const first = await anyPrice(2);
    await click(first, '[data-action="sf-suffer-pick"]', LOSE_MOMENTUM);
    await click(pickers().at(-1), '[data-action="sf-suffer-pick"]', ENDURE_HARM);
    expect(kira.system.health.value).toBe(4);
    expect(tracks().find(t => t.id === expedition.id).ticks).toBe(12);
  }, 30_000);

  it('control: a loss the momentum takes in full posts no picker', async () => {
    kira.system.momentum.value = 2;
    const first = await anyPrice(2);
    await click(first, '[data-action="sf-suffer-pick"]', LOSE_MOMENTUM);
    expect(kira.system.momentum.value).toBe(0);
    expect(pickers()).toHaveLength(1);
  }, 30_000);
});
