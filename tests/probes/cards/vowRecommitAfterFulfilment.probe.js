/**
 * PROBE — CARDS-01 VOW-RECOMMIT-ON-FULFILLED-VOW (tenth audit, area cards)
 *
 * What the user does: Kira rolls Fulfill Your Vow on "Find Chen" and misses;
 * the pipeline posts the "Vow — recommit?" offer (issue #330 D1). The vow is
 * then fulfilled — she burns momentum to a hit, re-rolls the vow a scene
 * later and hits, or a crewmate fulfils the shared vow on their sheet — and
 * the old offer card, still armed in the log, is pressed.
 *
 * What happens: applyRollerRecommit (src/moves/cardActions.js) claims the
 * card and calls performVowRecommit (src/index.js), which resolves the vow by
 * the card's itemId through resolveVowItemCopies → rollerVowEntry: the Item
 * is returned whether or not it is completed, and performVowRecommit has no
 * completed guard. setVowItemTrack then lowers the fulfilled vow's
 * `system.current` by the lowest die's boxes and raises its rank on every
 * copy, and "Recommitted: Find Chen … cleared N boxes … rises to formidable"
 * is posted for a vow that is complete.
 *
 * What should happen: a fulfilled vow's track never moves — the rule issue
 * #331 X20 set for Reach a Milestone (markVowProgress refuses a completed
 * vow) and the expedition recommit already holds (performRecommit refuses a
 * completed track: "an expedition already over leaves the offer closed").
 * The press changes nothing on the fulfilled vow (refused, or the offer
 * closed with the move's result — issue #331 X15's shape).
 *
 * Controls: the same press on a vow still open clears the lowest die's boxes
 * and steps the rank; a bond offer pressed after the bond was forged is
 * refused by performBondRecommit's own guard.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/vowRecommitAfterFulfilment.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, vow, vowCopy, bondItem;
const flags  = (id) => table.world.message(id).flags[MODULE_ID];
const offers = (flag) => table.cards(f => f[flag]);
const sheet  = (actorId) => table.actors.get(actorId);

function progressItem(id, name, subtype, current, itemFlags = {}) {
  const item = {
    id, type: 'progress', name, flags: itemFlags,
    system: { subtype, rank: 'dangerous', current, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split('.'); let t = item;
        for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
        t[parts.at(-1)] = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    async getFlag(scope, key) { return item.flags[scope]?.[key]; },
  };
  return item;
}

// Progress rolls: the two challenge dice. A 3-box vow against 5 and 7 — a miss; against 1 and 2 — a strong hit.
const MISS   = [0.45, 0.65];
const STRONG = [0.0, 0.15];

/** Kira rolls `moveId` as a progress move through the pipeline. */
async function roll(moveId, moveName, dice, { moveTarget = null } = {}) {
  control.interpretation = { moveId, moveName, statUsed: null, adds: 0, isProgressMove: true, moveTarget, rationale: 'test', mischiefApplied: false };
  control.dice = dice;
  await table.client('pl-1').chat(`Kira sees it through — ${moveName}.`, { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
}

/** Press `selector` on `card` as Kira's player, with the recommit's d10s scripted. */
async function press(card, selector, dice) {
  const rng = vi.spyOn(Math, 'random');
  for (const v of dice) rng.mockReturnValueOnce(v);
  try {
    await table.client('pl-1').click(card._id, selector);
    await table.settle(); await table.drain();
  } finally { rng.mockRestore(); }
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'rf-s1', sessionNumber: 1,
      currentSceneId: 'rf-scene', sceneTruths: [], clocks: [], connectionIds: ['npc-sable'] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  vow      = progressItem('vow-kira', 'Find Chen', 'vow', 12, { [MODULE_ID]: { vowId: 'vow-shared', sharedVow: true } });
  vowCopy  = progressItem('vow-orin', 'Find Chen', 'vow', 12, { [MODULE_ID]: { vowId: 'vow-shared', sharedVow: true } });
  bondItem = progressItem('bond-sable', 'Sable', 'bond', 8, { [MODULE_ID]: { connectionId: 'conn-sable' } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, hasPlayerOwner: true,
    system: { momentum: { value: 0 } }, items: { contents: [vow, bondItem] } });
  table.addActor({ id: 'pc-orin', name: 'Orin', ownership: {}, system: {}, items: { contents: [vowCopy] } });
  table.addActor({ id: 'npc-sable', name: 'Sable', type: 'character', flags: { [MODULE_ID]: {
    entityType: 'connection', connection: {
      _id: 'conn-sable', name: 'Sable', rank: 'dangerous', relationshipTicks: 8, bonded: false, active: true, history: [],
    } } } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe('CARDS-01 a 🔁 Recommit to the Vow pressed after the vow was fulfilled', () => {
  it('leaves the fulfilled vow\'s track and rank as they are, on every copy', async () => {
    await roll('fulfill_your_vow', 'Fulfill Your Vow', MISS);
    const [offer] = offers('vowRecommitOfferCard');
    expect(offer, 'the miss posted the recommit offer').toBeTruthy();
    expect(flags(offer._id)).toMatchObject({ vowName: 'Find Chen', itemId: 'vow-kira', actorId: 'pc-kira' });

    // The vow is fulfilled meanwhile: a strong hit through the pipeline completes every copy.
    await roll('fulfill_your_vow', 'Fulfill Your Vow', STRONG);
    expect(vow.system.completed, 'sanity: Kira\'s copy is fulfilled').toBe(true);
    expect(vowCopy.system.completed, 'sanity: Orin\'s copy is fulfilled').toBe(true);
    const before = { current: vow.system.current, rank: vow.system.rank };

    // The old offer is still armed: pressed, with d10s 2 and 6 (lowest 2 → two boxes).
    await press(offer, '[data-action="sf-vow-recommit"]', [0.15, 0.55]);

    // Expected: a fulfilled vow's track never moves (issue #331 X20's rule; the expedition sibling refuses a completed track).
    // Actual: Kira's copy 12 → 4 ticks and dangerous → formidable, Orin's copy too, and "Recommitted: Find Chen" posted.
    expect(vow.system).toMatchObject(before);
    expect.soft(vowCopy.system).toMatchObject(before);
    expect.soft(table.cards(f => f.recommitCard)).toHaveLength(0);
  }, 30_000);

  it('control: pressed while the vow is open, it clears the lowest die\'s boxes and steps the rank on every copy', async () => {
    await roll('fulfill_your_vow', 'Fulfill Your Vow', MISS);
    const [offer] = offers('vowRecommitOfferCard');
    expect(offer).toBeTruthy();

    await press(offer, '[data-action="sf-vow-recommit"]', [0.15, 0.55]);
    expect(vow.system).toMatchObject({ current: 4, rank: 'formidable' });
    expect(vowCopy.system).toMatchObject({ current: 4, rank: 'formidable' });
    expect(flags(offer._id).recommitted).toBe(true);
    expect(table.cards(f => f.recommitCard)).toHaveLength(1);
  }, 30_000);

  it('control: a 🔁 Recommit to the Bond pressed after the bond was forged is refused by its own guard', async () => {
    await roll('forge_a_bond', 'Forge a Bond', MISS, { moveTarget: 'Sable' });
    const [offer] = offers('bondRecommitOfferCard');
    expect(offer, 'the miss posted the bond recommit offer').toBeTruthy();

    // The bond is forged meanwhile (a strong hit through the pipeline).
    await roll('forge_a_bond', 'Forge a Bond', STRONG, { moveTarget: 'Sable' });
    const record = () => sheet('npc-sable').flags[MODULE_ID].connection;
    expect(record().bonded, 'sanity: Sable is bonded').toBe(true);
    const before = { relationshipTicks: record().relationshipTicks, rank: record().rank };

    await press(offer, '[data-action="sf-bond-recommit"]', [0.05, 0.75]);
    expect(record()).toMatchObject(before);                 // performBondRecommit: "gone, lost or bonded — nothing recommitted"
    expect(bondItem.system).toMatchObject({ current: 8, rank: 'dangerous' });
  }, 30_000);
});
