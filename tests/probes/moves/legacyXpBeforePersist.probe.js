/**
 * PROBE — MC-16 LEGACY-XP-BEFORE-PERSIST (eighth bug audit, moves-core)
 *
 * What the user does: fulfils a vow through the move pipeline when the quests
 * legacy is one tick-pair short of its tenth box (38 ticks); the move's
 * campaignState write (persistResolution, the one that saves the legacy
 * ticks) is refused — a server error, a dropped connection.
 *
 * What happens: every PC is still awarded the box's 2 XP, while the world's
 * quests legacy stays at 38 — XP for ticks that were never saved.
 * index.js addLegacyTicks marks the pipeline's working copy and awards the
 * box XP at once (awardLegacyBoxXP, fire-and-forget); the ticks reach the
 * world only later, in persistResolution's write. Issue #306 R04 fixed exactly
 * this order for the out-of-pipeline writer (writeLegacyTicks: "The XP of a
 * box it fills is awarded only once the write has landed — it was awarded
 * first, so a refused write paid XP for ticks that were never saved"); the
 * pipeline's own legacy marks (Fulfill Your Vow, Forge a Bond, Finish an
 * Expedition, Make a Discovery, Confront Chaos, a bonded development) still
 * award first.
 *
 * What should happen: the box XP is awarded once the write that saves the
 * ticks has landed (or the refused write is reported with its XP owed).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35], interpret: null }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ ...control.interpret })),
}));
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

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { failWrites } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { resolveMove } from '../../../src/moves/resolver.js';

const MODULE_ID = 'starforged-companion';
const CS_KEY = `${MODULE_ID}.campaignState`;

describe('legacy box XP and the write that saves the ticks', () => {
  let table, bex, vow;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      legacyTracks: { quests: { ticks: 38, cleared: false, cycles: 0 } },
    } } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    vow = {
      id: 'v-1', name: 'Find the Archive', type: 'progress',
      system: { subtype: 'vow', rank: 'dangerous', current: 40, completed: false },
      flags: { [MODULE_ID]: { vowId: 'vid-1' } },
      update: async (changes) => {
        if ('system.completed' in changes) vow.system.completed = changes['system.completed'];
      },
      setFlag: async (mod, key, val) => { (vow.flags[mod] ??= {})[key] = val; },
    };
    bex = table.addActor({ id: 'pc-bex', name: 'Bex', ownership: { 'pl-1': 3 }, items: { contents: [vow] }, system: { xp: 0 } });
    resolveMove.mockClear();
    control.interpret = {
      moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', statUsed: null, adds: 0,
      isProgressMove: true, moveTarget: 'Find the Archive', rationale: 'test', mischiefApplied: false,
    };
  });

  const xp = () => Number(bex.system.xp ?? 0);
  // The move's own persist: the write that appends this session's move log.
  const persistWrite = (w) => w.kind === 'setting' && w.key === CS_KEY && w.client === 'gm-1'
    && (w.value?.sessionLogs?.['sess-1']?.length ?? 0) > 0;

  it('control: when the write lands, the box is saved and its 2 XP awarded', async () => {
    await table.client('pl-1').chat('The archive is found; my oath is kept.', { speaker: { actor: 'pc-bex' } });
    await table.settle();
    expect(resolveMove.mock.results[0].value.outcome).toBe('strong_hit');
    expect(table.world.campaignState().legacyTracks.quests).toMatchObject({ ticks: 0, cycles: 1 });
    expect(xp()).toBe(2);
  });

  it('a refused write awards no XP for the box it did not save', async () => {
    silenceConsoleErrors();
    const refused = failWrites(table, persistWrite, { times: 1 });
    await table.client('pl-1').chat('The archive is found; my oath is kept.', { speaker: { actor: 'pc-bex' } });
    await table.settle();
    expect(refused.refused).toBe(1);
    expect(table.world.campaignState().legacyTracks.quests).toMatchObject({ ticks: 38, cycles: 0 });
    expect(xp()).toBe(0);
  });
});
