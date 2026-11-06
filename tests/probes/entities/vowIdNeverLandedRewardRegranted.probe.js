/* global structuredClone */
/**
 * Eleventh audit — entities. VOW-ID-NEVER-LANDED's fix, a new bug it opened.
 *
 * Kira writes "Find the archive" on her sheet. The createItem hook's stamp of
 * the Item's id as its module `vowId` flag fails (caught and dropped — the
 * known issue's premise), and the reward-choice card names the vow by its
 * Item id. Since VOW-ID-NEVER-LANDED, a reward pick lands on that Item
 * (actorBridge.setSharedVowReward → isVowCopy matches `item.id`): "Fuel cells"
 * is promised on the vow.
 *
 * The grant that pays it keys its one-time claim on the FLAG:
 * index.js grantLinkedVowReward reads `vowId = item.flags[MODULE_ID].vowId`
 * and flips the reward's status ("granted") only `if (vowId && …)`. With the
 * flag missing the status is never flipped, so the reward stays "promised":
 * a won fight linked to the vow grants it, and the vow's fulfilment grants it
 * AGAIN (and so would every later linked win) — +2 supply each time, a "🎁
 * Reward earned" card each time. Before the fix the pick could not land at
 * all ("no character holds this vow"), so no reward was ever granted twice.
 *
 * Driven as tests/unit/payoffFailure.test.js drives a won fight (the Progress
 * Tracks panel's progress roll on a combat track linked to the vow) and a
 * fulfilment on the sheet (payFulfilledVowNative, the native consequence
 * hook's call on the canonical GM). The reward is promised through the real
 * producer, setSharedVowReward.
 *
 * Control: the same vow WITH its vowId flag is granted once.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// The pipeline: no pacing call, the confirm dialog accepted, scripted dice
// inside the REAL resolveMove (payoffFailure.test.js's mocks).
const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
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
      for (const r of control.dice) dice.mockReturnValueOnce(r);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The archive doors grind open.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const FUEL  = { description: 'Fuel cells', form: 'supply' };

let table, vow, pat;
const supply      = () => pat.system.supply.value;
const rewardCards = () => table.cards(f => f.rewardGrantCard);

/** Kira's sheet-made vow, open; `stamped: false` — the createItem hook's vowId stamp never landed. */
function sheetVow({ stamped }) {
  const item = {
    id: 'v-archive', name: 'Find the archive', type: 'progress',
    system: { subtype: 'vow', rank: 'dangerous', current: 8, completed: false },
    flags: { [MODULE_ID]: { vowSetupOffered: true, ...(stamped ? { vowId: 'v-archive' } : {}) } },
    update: async (changes) => {
      if ('system.current' in changes) item.system.current = changes['system.current'];
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
    },
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = value; },
  };
  return item;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

async function seat({ stamped }) {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
      legacyTracks: { quests: { ticks: 0, cleared: false } },
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  vow = sheetVow({ stamped });
  pat = table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  pat.system.supply.value = 1;   // room under the max for two grants of +2
  scriptClaude(table, { fallback: () => REPLY });

  // The reward pick, as the reward-choice card names the vow: by its Item id.
  const gm = table.client('gm-1');
  const bridge = await gm.import('../../src/character/actorBridge.js');
  expect(await gm.run(() => bridge.setSharedVowReward('v-archive', { status: 'promised', ...FUEL }))).toEqual({ ok: true });
  expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised', description: 'Fuel cells' });
}

/** A fight linked to the vow, won on a strong hit (the Progress Tracks panel's roll). */
async function winLinkedFight() {
  const gm = table.client('gm-1');
  const store = await gm.import('../../src/ui/progressTracks.js');
  const journal = { id: 'tracks-journal', name: 'Starforged Progress Tracks', _flags: {},
    getFlag(mod, key) { return this._flags[`${mod}.${key}`]; },
    async setFlag(mod, key, value) { this._flags[`${mod}.${key}`] = structuredClone(value); } };
  table.journal._set(journal);
  const fight = await gm.run(async () => {
    const t = await store.addProgressTrack({ label: 'Archive guards', type: 'combat', rank: 'dangerous' });
    await store.updateTrackFields(t.id, { ticks: 36, linkedVowName: 'Find the archive' });
    return t;
  });
  control.dice = [0.25, 0.35];                // 9 boxes beat 3 and 4: a strong hit
  await gm.run(() => store.ProgressTrackApp.DEFAULT_OPTIONS.actions.rollProgress.call({}, null, { dataset: { trackId: fight.id } }));
  await table.settle();
  await table.drain();
}

/** The vow fulfilled on the sheet (the native consequence hook's call on the canonical GM). */
async function fulfilOnSheet() {
  vow.system.completed = true;
  vow.system.current = 40;
  const gm = table.client('gm-1');
  const { payFulfilledVowNative } = await gm.import('../../src/index.js');
  await gm.run(() => payFulfilledVowNative('Find the archive', 'strong_hit', { actorId: 'pc-pat' }));
  await table.settle();
}

describe('a sheet-made vow whose vowId stamp never landed: its promised reward is granted once', () => {
  it('the won fight claims the reward — the fulfilment grants nothing more', async () => {
    await seat({ stamped: false });
    const before = supply();

    await winLinkedFight();
    expect(table.cards(f => f.fightVowCard)).toHaveLength(1);   // control: the fight was won and linked
    expect(rewardCards()).toHaveLength(1);                      // control: the reward was granted
    expect(supply()).toBe(before + 2);
    expect.soft(vow.flags[MODULE_ID].reward.status, 'the grant flips the reward (its one-time claim)').toBe('granted');

    await fulfilOnSheet();
    expect.soft(rewardCards(), 'one "Reward earned" for one promised reward').toHaveLength(1);
    expect(supply(), 'the fuel cells are given once').toBe(before + 2);
  }, 30_000);

  it('control: the same vow with its vowId flag is granted once', async () => {
    await seat({ stamped: true });
    const before = supply();

    await winLinkedFight();
    expect(rewardCards()).toHaveLength(1);
    expect(vow.flags[MODULE_ID].reward.status).toBe('granted');

    await fulfilOnSheet();
    expect(rewardCards()).toHaveLength(1);
    expect(supply()).toBe(before + 2);
  }, 30_000);
});
