/**
 * STARFORGED COMPANION
 * tests/unit/vowAttribution.test.js
 *
 * Issue #301 B02 — two PCs' INDEPENDENT vows can share a name (both
 * "Background Vow", different vowIds). The vow resolver took whichever PC
 * came first in the actor list, so the roller's Fulfill Your Vow completed,
 * stamped and rewarded another PC's vow, and Forsake Your Vow forsook it.
 * Each payoff now resolves the roller's own vow first.
 *
 * Composition on a booted table (tests/helpers/multiClient.js): Bex's player
 * types the move on their own client; the canonical GM's real pipeline scores
 * it (progress enrichment), resolves it (resolveMove, scripted dice) and runs
 * the fulfil / forsake branches against both PCs' vow Items. Ash is added
 * first, as the defect needs.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Challenge dice 3 and 4, action die 7.
const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.65], interpret: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ ...control.interpret })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { resolveMove } from '../../src/moves/resolver.js';

const MODULE_ID = 'starforged-companion';

let table;
let vowAsh, vowBex, ash, bex;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

function vowItem(id, vowId) {
  const item = {
    id, name: 'Background Vow', type: 'progress',
    system: { subtype: 'vow', rank: 'dangerous', current: 40, completed: false },
    flags: { [MODULE_ID]: { vowId, reward: { status: 'promised', description: 'Fuel cells', form: 'supply' } } },
    update: async (changes) => {
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
      if ('system.current' in changes) item.system.current = changes['system.current'];
    },
    setFlag: async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; },
  };
  return item;
}

beforeEach(async () => {
  control.dice = [0.25, 0.35, 0.65];
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  vowAsh = vowItem('v-ash', 'vid-ash');
  vowBex = vowItem('v-bex', 'vid-bex');
  ash = table.addActor({ id: 'pc-ash', name: 'Ash', ownership: { 'pl-2': 3 }, items: { contents: [vowAsh] } });
  bex = table.addActor({ id: 'pc-bex', name: 'Bex', ownership: { 'pl-1': 3 }, items: { contents: [vowBex] } });
  resolveMove.mockClear();
});

/** Bex's player types `moveId` against "Background Vow". */
async function bexPlays(moveId, text) {
  control.interpret = {
    moveId, moveName: moveId, statUsed: null, adds: 0,
    isProgressMove: moveId === 'fulfill_your_vow', moveTarget: 'Background Vow',
    rationale: 'test', mischiefApplied: false,
  };
  await table.client('pl-1').chat(text, { speaker: { actor: 'pc-bex' } });
  await table.settle();
  expect(resolveMove).toHaveBeenCalledTimes(1);
  return resolveMove.mock.results[0].value;
}

const supplied = (pc) => pc._updateHistory.some(u => 'system.supply.value' in u);

it('Fulfill Your Vow completes and pays the roller\'s vow — not the first PC\'s same-named one', async () => {
  const resolution = await bexPlays('fulfill_your_vow', 'At last, I keep the oath I swore at the start.');
  expect(resolution.outcome).toBe('strong_hit');

  expect({ completed: vowBex.system.completed, paid: vowBex.flags[MODULE_ID].fulfilPaid ?? false })
    .toEqual({ completed: true, paid: true });
  expect({ completed: vowAsh.system.completed, paid: vowAsh.flags[MODULE_ID].fulfilPaid ?? false })
    .toEqual({ completed: false, paid: false });
  expect(supplied(bex)).toBe(true);
  expect(supplied(ash)).toBe(false);
  expect(vowAsh.flags[MODULE_ID].reward.status).toBe('promised');
});

it('Forsake Your Vow forsakes the roller\'s vow — not the first PC\'s same-named one', async () => {
  await bexPlays('forsake_your_vow', 'I turn my back on the oath; it cannot be kept.');

  expect({ completed: vowBex.system.completed, forsaken: vowBex.flags[MODULE_ID].forsaken ?? false })
    .toEqual({ completed: true, forsaken: true });
  expect({ completed: vowAsh.system.completed, forsaken: vowAsh.flags[MODULE_ID].forsaken ?? false })
    .toEqual({ completed: false, forsaken: false });
  expect(vowAsh.flags[MODULE_ID].reward.status).toBe('promised');
});
