/**
 * Aid Your Ally on a booted table: a hit's benefits are the ally's (issue
 * #325 W17). "If you score a hit, they (instead of you) take the benefits of
 * the move." Ash's player aids Kira; the interpretation and the dice are
 * scripted at their boundaries.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const STRONG = [0.25, 0.45, 0.9];   // challenge 3, 5; die 6 — edge 2 → 8: a strong hit
const WEAK   = [0.25, 0.75, 0.6];   // challenge 3, 8; die 4 — edge 2 → 6: a weak hit
let table, ash, kira;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'aid-s1', sessionNumber: 1,
      currentSceneId: 'aid-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  ash  = table.addActor({ id: 'pc-ash',  name: 'Ash',  ownership: { 'pl-1': 3 }, system: { edge: 2, momentum: { value: 2 } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 }, system: { momentum: { value: 2 } } });
  scriptClaude(table, { fallback: () => 'The distraction works.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

async function ashAidsKira(dice) {
  control.interpretation = { moveId: 'aid_your_ally', moveName: 'Aid Your Ally', statUsed: 'edge', adds: 0,
    moveTarget: 'Kira', rationale: 'test', mischiefApplied: false };
  control.dice = dice;
  await table.client('pl-1').chat('I draw their fire so Kira can slip past.', { speaker: { actor: ash.id } });
  await table.settle(); await table.drain();
}

describe('Aid Your Ally — the ally takes the benefits', () => {
  it('a strong hit: Kira takes +2 momentum and +1 on her next move; Ash takes nothing', async () => {
    await ashAidsKira(STRONG);
    expect(kira.system.momentum.value).toBe(4);
    expect(ash.system.momentum.value).toBe(2);
    expect(table.world.campaignState().nextMoveBonuses?.['pc-kira']?.value).toBe(1);
    expect(table.world.campaignState().nextMoveBonuses?.['pc-ash']).toBeUndefined();
  }, 30_000);

  it("a weak hit: the choice card's +2 momentum goes to Kira", async () => {
    await ashAidsKira(WEAK);
    const card = table.cards(f => f.sufferCard && f.sufferPrompt).at(-1);
    expect(card.flags[MODULE_ID].executorOpts.allyActorId).toBe('pc-kira');
    await table.client('pl-1').click(card._id, '[data-action="sf-suffer-pick"]', { index: 0 });
    await table.settle(); await table.drain();
    expect(kira.system.momentum.value).toBe(4);
    expect(ash.system.momentum.value).toBe(2);
  }, 30_000);
});

// Known-issues AID-ALLY-UPGRADE: a Burn Momentum (or Improve Result) that
// upgrades an Aid Your Ally applied the upgraded hit's momentum to the roller
// — the first resolution paid its hit to the ally, but the upgrade paths knew
// only the roller, and a miss's card did not carry the ally at all.
describe('Aid Your Ally — a burned result\'s benefits are the ally\'s too (AID-ALLY-UPGRADE)', () => {
  const BURN = '[data-action="sf-burn-momentum"]';
  const MISS = [0.65, 0.75, 0.6];   // challenge 7, 8; die 4 — edge 2 → 6: a miss (momentum 9 beats both)

  async function ashBurns() {
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(card.flags[MODULE_ID].burn?.canBurn, 'Ash can burn').toBe(true);
    await table.client('pl-1').click(card._id, BURN);
    await table.settle(); await table.drain();
  }

  it('a weak hit burned to a strong hit: Kira takes the +2 momentum and the +1; Ash\'s momentum resets', async () => {
    ash.system.momentum.value = 9;
    await ashAidsKira(WEAK);
    await ashBurns();

    expect(kira.system.momentum.value).toBe(4);
    expect(ash.system.momentum.value).toBe(2);                         // reset, no +2 of the ally's
    expect(table.world.campaignState().nextMoveBonuses?.['pc-kira']?.value).toBe(1);
    expect(table.world.campaignState().nextMoveBonuses?.['pc-ash']).toBeUndefined();
  }, 30_000);

  it('a miss burned to a strong hit: the miss\'s card carried the ally, so Kira takes the benefits', async () => {
    ash.system.momentum.value = 9;
    await ashAidsKira(MISS);
    expect(table.cards(f => f.moveResolution).at(-1).flags[MODULE_ID].burn?.targets?.allyActorId).toBe('pc-kira');
    await ashBurns();

    expect(kira.system.momentum.value).toBe(4);
    expect(ash.system.momentum.value).toBe(2);
    expect(table.world.campaignState().nextMoveBonuses?.['pc-kira']?.value).toBe(1);
  }, 30_000);
});
