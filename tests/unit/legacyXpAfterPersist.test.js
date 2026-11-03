// tests/unit/legacyXpAfterPersist.test.js
// A legacy box's XP is paid once the write that saves its ticks has landed
// (issue #326 W52). The move pipeline marks its working copy
// (addLegacyTicks) and the ticks reach the world in persistResolution's
// write, but the XP was awarded at the mark: a refused persist paid XP for
// a box never saved. The XP is now owed by the working copy and paid after
// the persist (payDeferredLegacyXp). Since issue #326 D3 the payment is the
// shared track written through to each PC's sheet (system.legacies.quests,
// ticks ever marked), where the Starforged sheet shows the XP.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35], interpret: null }));
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
import { failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { resolveMove } from '../../src/moves/resolver.js';

const MODULE_ID = 'starforged-companion';
const CS_KEY = `${MODULE_ID}.campaignState`;

describe('legacy box XP waits for the move\'s persist (issue #326 W52)', () => {
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

  const sheet = () => Number(bex.system.legacies?.quests ?? 0);   // the sheet's quests legacy
  // The move's own persist: the GM's campaignState write that carries a new
  // updatedAt stamp (persistResolution's).
  const persistWrite = (w) => w.kind === 'setting' && w.key === CS_KEY && w.client === 'gm-1'
    && !!w.value?.updatedAt && w.value.updatedAt !== (table.world.campaignState().updatedAt ?? null);

  it('control: when the write lands, the box is saved and its 2 XP awarded', async () => {
    await table.client('pl-1').chat('The archive is found; my oath is kept.', { speaker: { actor: 'pc-bex' } });
    await table.settle();
    expect(resolveMove.mock.results[0].value.outcome).toBe('strong_hit');
    expect(table.world.campaignState().legacyTracks.quests).toMatchObject({ ticks: 0, cycles: 1 });
    expect(sheet()).toBe(40);                                         // the tenth box — 2 XP — on the sheet
    expect(table.cards(f => f.legacyXpCard).map(c => c.flags[MODULE_ID].xp)).toEqual([2]);
  });

  it('a refused write awards no XP for the box it did not save', async () => {
    silenceConsoleErrors();
    const refused = failWrites(table, persistWrite, { times: 1 });
    await table.client('pl-1').chat('The archive is found; my oath is kept.', { speaker: { actor: 'pc-bex' } });
    await table.settle();
    expect(refused.refused).toBe(1);
    expect(table.world.campaignState().legacyTracks.quests).toMatchObject({ ticks: 38, cycles: 0 });
    expect(sheet()).toBe(0);                                          // the refused box never reached the sheet
    expect(table.cards(f => f.legacyXpCard)).toEqual([]);
  });
});
