/**
 * PROBE — MC-12 FULFIL-CLOSES-OTHER-VOWS-TWIN (eighth bug audit, moves-core)
 *
 * What the user does: in a campaign begun before the 2026-07 store change
 * (when vows were also written as journal `vow` tracks), a PC holds two vows:
 * "Find the Archive" (an old vow, with its journal twin) and "Avenge Kade"
 * (sworn since — an Item only). They fulfil Avenge Kade (typed naming it, or
 * the "Attempt to Fulfill Vow" button, which names none).
 *
 * What happens: the pipeline's fulfil branch first runs vow.js finishVow on
 * the journal tracks with the move's target; selectVowTrack's ladder (exact
 * → substring → SOLE OPEN VOW) matches no name and falls back to the only
 * open journal vow track — Find the Archive's twin — and completes it. The
 * branch then pays `fin.legacyTicks` from THAT track's rank and posts
 * "⚑ Vow Fulfilled: Find the Archive", while Avenge Kade's Item is completed
 * by name. The Archive's journal twin is closed while its Item stays open
 * (a mirror the narrator's progress block and the panel read).
 *
 * What should happen: completing a track is a costly guess — a name that
 * matches no journal vow closes nothing (rules/reachability.md §6, "stop
 * before guessing when a wrong guess is costly"); the Item the roll scored
 * (tickInfo) decides which vow was fulfilled.
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
import { CampaignStateSchema } from '../../../src/schemas.js';
import { resolveMove } from '../../../src/moves/resolver.js';
import { finishVow } from '../../../src/moves/vow.js';

const MODULE_ID = 'starforged-companion';

describe('vow.js finishVow (unit hop)', () => {
  it('control: the named vow\'s own journal track is the one completed', async () => {
    const tracks = [{ id: 't1', type: 'vow', label: 'Find the Archive', rank: 'dangerous', completed: false }];
    const fin = await finishVow({ moveTarget: 'Find the Archive' }, {
      listTracks: async () => tracks, completeTrack: async (id) => ({ ...tracks.find(t => t.id === id), completed: true }),
    });
    expect(fin?.track?.label).toBe('Find the Archive');
  });

  it('a name no journal vow carries completes no journal vow', async () => {
    const tracks = [{ id: 't1', type: 'vow', label: 'Find the Archive', rank: 'dangerous', completed: false }];
    const completeTrack = vi.fn(async (id) => ({ ...tracks.find(t => t.id === id), completed: true }));
    const fin = await finishVow({ moveTarget: 'Avenge Kade' }, { listTracks: async () => tracks, completeTrack });
    expect(completeTrack).not.toHaveBeenCalled();
    expect(fin).toBeNull();
  });
});

describe('fulfilling one vow leaves another vow\'s journal twin open (pipeline)', () => {
  let table, journal, archive, kade;
  const flags = {};

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());

  const vowItem = (id, name, current, rank) => {
    const item = {
      id, name, type: 'progress',
      system: { subtype: 'vow', rank, current, completed: false },
      flags: { [MODULE_ID]: { vowId: `vid-${id}` } },
      update: async (changes) => {
        if ('system.completed' in changes) item.system.completed = changes['system.completed'];
      },
      setFlag: async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; },
    };
    return item;
  };

  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
    } } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    for (const k of Object.keys(flags)) delete flags[k];
    journal = {
      id: 'tracks-journal', name: 'Starforged Progress Tracks',
      getFlag: (mod, key) => flags[`${mod}.${key}`],
      setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = structuredClone(value); },
    };
    // The old creation-time mirror of the Archive vow.
    await journal.setFlag(MODULE_ID, 'tracks', [
      { id: 'jt-archive', type: 'vow', label: 'Find the Archive', rank: 'dangerous', ticks: 8, completed: false },
    ]);
    table.journal._set(journal);
    archive = vowItem('v-archive', 'Find the Archive', 8, 'dangerous');
    kade    = vowItem('v-kade', 'Avenge Kade', 40, 'formidable');
    table.addActor({ id: 'pc-bex', name: 'Bex', ownership: { 'pl-1': 3 }, items: { contents: [archive, kade] } });
    resolveMove.mockClear();
  });

  it('Fulfill Your Vow on "Avenge Kade" does not complete Find the Archive\'s journal track', async () => {
    silenceConsoleErrors();
    control.interpret = {
      moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', statUsed: null, adds: 0,
      isProgressMove: true, moveTarget: 'Avenge Kade', rationale: 'test', mischiefApplied: false,
    };
    await table.client('pl-1').chat('Kade is avenged; the debt is paid.', { speaker: { actor: 'pc-bex' } });
    await table.settle();

    expect(resolveMove).toHaveBeenCalledTimes(1);
    expect(resolveMove.mock.results[0].value.outcome).toBe('strong_hit');
    expect(kade.system.completed).toBe(true);           // the vow the roll scored
    expect(archive.system.completed).toBe(false);       // its Item stays open …
    const twin = (journal.getFlag(MODULE_ID, 'tracks') ?? []).find(t => t.id === 'jt-archive');
    expect(twin?.completed).toBe(false);                // … and so must its journal twin
    const card = table.cards(f => f.fulfillVowCard)[0];
    expect(card?.content ?? '').not.toContain('Find the Archive');
  });
});
