/**
 * PROBE — IC FULFIL-LEGACY-NATIVE-THEN-PIPELINE
 *
 * What the user does: rolls Fulfill Your Vow on the foundry-ironsworn sheet
 * and hits. The canonical GM's native consequence hook pays the vow
 * (payFulfilledVowNative: the Quests legacy, the deepen, the reward) and
 * stamps `fulfilPaid` (+ the `fulfilPayoff.legacy` ledger) on every copy —
 * but the vendor never completes the Item (its "completed" is a manual
 * toggle), so the vow is still open: CHARACTER STATE lists it, and the next
 * quest move card offers "🏁 Attempt to Fulfill Vow". The vow is then
 * fulfilled again through the pipeline (that button, a "Which vow?" pick, or
 * typed narration).
 *
 * What happens: the pipeline's fulfil branch (src/index.js ~1392–1398)
 * completes the still-open copies (`itemDone`) and writes the Quests legacy on
 * its working campaignState unconditionally — `addLegacyTicks(campaignState,
 * "quests", ticks)` — before payFulfilledVowNative({ skipLegacy: true }), which
 * finds `fulfilPaid` and returns. The paid flag and the ledger are never
 * consulted for the legacy: one vow pays its Quests legacy twice (and the XP
 * of any box the second payment fills).
 *
 * What should happen: one fulfilment's legacy per vow (decisions.md "a
 * duplicate roll pays nothing"; `fulfilPaid` "pays once per vow across both
 * paths" — vow-flow.md §4).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35] }));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, vow;

function vowItem() {
  const item = {
    id: 'v-kade', name: 'Avenge Kade', type: 'progress',
    system: { subtype: 'vow', rank: 'dangerous', current: 40, completed: false },
    flags: { [MODULE_ID]: { vowId: 'vid-kade' } },
    update: async (changes) => {
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
      if ('system.current' in changes) item.system.current = changes['system.current'];
    },
    setFlag: async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; },
  };
  return item;
}

const quests = () => table.world.campaignState().legacyTracks?.quests?.ticks ?? 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.25, 0.35];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  vow = vowItem();
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
  silenceConsoleErrors();
});

describe('PROBE IC FULFIL-LEGACY-NATIVE-THEN-PIPELINE', () => {
  it('a vow fulfilled on the sheet, then through the pipeline, pays its Quests legacy once', async () => {
    // The native consequence hook's payoff for the sheet roll (strong hit).
    const gm = table.client('gm-1');
    const { payFulfilledVowNative } = await gm.import('../../src/index.js');
    await gm.run(() => payFulfilledVowNative('Avenge Kade', 'strong_hit', { actorId: 'pc-kira' }));
    await table.settle(); await table.drain();
    expect(quests()).toBe(2);                                   // a Dangerous vow
    expect(vow.flags[MODULE_ID].fulfilPaid).toBe(true);
    expect(vow.system.completed).toBe(false);                   // the sheet leaves it open

    // The same vow through the pipeline (e.g. the move card's 🏁 button).
    await table.client('pl-1').chat('Attempt to fulfill your vow.', {
      speaker: { actor: 'pc-kira', alias: 'Kira' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'fulfill_your_vow', forcedMoveTarget: 'Avenge Kade' } },
    });
    await table.settle(); await table.drain();

    expect(vow.system.completed).toBe(true);
    // Expected: still 2 — the vow was paid. Today: 4.
    expect(quests()).toBe(2);
  }, 30_000);
});
