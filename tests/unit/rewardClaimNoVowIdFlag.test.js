/* global silenceConsoleErrors, structuredClone */
/**
 * STARFORGED COMPANION
 * tests/unit/rewardClaimNoVowIdFlag.test.js
 *
 * Issue #342 Z54 (REWARD-CLAIM-SKIPPED-NO-VOWID-FLAG) — a reward that
 * VOW-ID-NEVER-LANDED's fix lets a sheet vow hold is granted once.
 *
 * Kira's sheet-made vow "Find the archive": the createItem hook's `vowId`
 * stamp never landed (the known-issues VOW-ID-NEVER-LANDED scenario). The fix
 * let the reward pick land by the Item's own id (actorBridge.isVowCopy), so
 * the vow holds a promised reward "Fuel cells" (+2 supply on a strong hit).
 * The reward is one-time by its status: grantLinkedVowReward flips it from
 * "promised" first, as the grant's claim (issue #306 R04) — through
 * `setSharedVowReward(item.flags[MODULE].vowId, …)`, which with no `vowId`
 * flag skipped the flip: the reward was given and stayed "promised", so the
 * fulfilment granted it again, and so did every further linked win. Forsake
 * Your Vow could not mark it lost either (the same `f.vowId`). The claim and
 * the forsake now key the reward as its copies are found — the flag, else the
 * Item's own id (actorBridge.vowCopyId).
 *
 * Driven on a booted GM / player table: the real relayed reward pick (the
 * cards auditor's CARD-6) or the real `setSharedVowReward` (the entities
 * auditor's ENT-2), a won linked fight through the pipeline from the Progress
 * Tracks panel's Roll, the sheet fulfilment's `payFulfilledVowNative`, and a
 * forced Forsake Your Vow through the pipeline.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
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
      for (const r of control.dice) dice.mockReturnValueOnce(r);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The archive doors grind open.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const FUEL  = { description: 'Fuel cells', form: 'supply' };

let table, vow, kira;
const supply      = () => kira.system.supply.value;
const rewardCards = () => table.cards(f => f.rewardGrantCard);

/** Kira's sheet vow; `vowIdFlag: false` — the createItem hook's `vowId` stamp never landed. */
function vowItem({ vowIdFlag }) {
  const item = {
    id: 'v-archive', name: 'Find the archive', type: 'progress',
    system: { subtype: 'vow', rank: 'dangerous', current: 8, completed: false },
    flags: { [MODULE_ID]: { vowSetupOffered: true, ...(vowIdFlag ? { vowId: 'v-archive' } : {}) } },
    update: async (changes) => {
      if ('system.current' in changes) item.system.current = changes['system.current'];
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
    },
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = structuredClone(value); },
  };
  return item;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

async function setUp({ vowIdFlag }) {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [], legacyTracks: { quests: { ticks: 0, cleared: false } } },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  vow = vowItem({ vowIdFlag });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  kira.system.supply.value = 1;               // room for two grants under the supply cap of 5
  table.journal._set({ id: 'tracks-journal', name: 'Starforged Progress Tracks', _flags: {},
    getFlag(mod, key) { return this._flags[`${mod}.${key}`]; },
    async setFlag(mod, key, value) { this._flags[`${mod}.${key}`] = structuredClone(value); } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
}

/** Kira's player picks "Fuel cells" on the reward-choice card the sheet vow's hook posted (named by the Item id). */
async function pickReward() {
  const card = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: '<div class="sf-card sf-reward-choice"><button type="button" class="entity-btn" data-action="sf-reward-pick" data-idx="0">Fuel cells</button></div>',
    flags: { [MODULE_ID]: { rewardChoiceCard: true, vowId: 'v-archive', rewardOptions: [{ ...FUEL }] } },
  }));
  await table.settle();
  table.client('pl-1').click(card.id, '[data-action="sf-reward-pick"]');
  await table.settle(); await table.drain();
}

/** The reward promised through its real writer, as the reward-choice card names the vow: by its Item id. */
async function promiseReward() {
  const gm = table.client('gm-1');
  const bridge = await gm.import('../../src/character/actorBridge.js');
  expect(await gm.run(() => bridge.setSharedVowReward('v-archive', { status: 'promised', ...FUEL }))).toEqual({ ok: true });
  expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised', description: 'Fuel cells' });
}

/** Kira wins the fight serving the vow: a strong-hit Take Decisive Action from the Progress Tracks panel. */
async function winTheLinkedFight() {
  const gm = table.client('gm-1');
  const store = await gm.import('../../src/ui/progressTracks.js');
  const fight = await gm.run(async () => {
    const t = await store.addProgressTrack({ label: 'Archive guards', type: 'combat', rank: 'dangerous' });
    await store.updateTrackFields(t.id, { ticks: 36, linkedVowName: 'Find the archive' });
    return t;
  });
  control.dice = [0.25, 0.35];                // 9 boxes beat 3 and 4: a strong hit
  await gm.run(() => store.ProgressTrackApp.DEFAULT_OPTIONS.actions.rollProgress.call({}, null, { dataset: { trackId: fight.id } }));
  await table.settle(); await table.drain();
}

/** Kira fulfils the vow on her sheet — the canonical GM pays it (the native consequence hook's call). */
async function fulfilOnSheet() {
  const gm = table.client('gm-1');
  const { payFulfilledVowNative } = await gm.import('../../src/index.js');
  vow.system.completed = true; vow.system.current = 40;
  await gm.run(() => payFulfilledVowNative('Find the archive', 'strong_hit', { actorId: 'pc-kira' }));
  await table.settle(); await table.drain();
}

/** Kira forsakes the vow — a forced Forsake Your Vow through the pipeline. */
async function forsake() {
  control.dice = [0.25, 0.35, 0.65];
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: 'I turn my back on the archive; it cannot be found.',
    speaker: { actor: 'pc-kira' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'forsake_your_vow', forcedMoveTarget: 'Find the archive' } },
  }));
  await table.settle(); await table.drain();
}

describe('a promised reward on a sheet vow, through a won fight and the fulfilment (relayed pick)', () => {
  it('control: with the vowId flag landed, the reward is granted once (+2 supply, 1 → 3), then never again', async () => {
    await setUp({ vowIdFlag: true });
    await pickReward();
    expect(vow.flags[MODULE_ID].reward?.status).toBe('promised');
    await winTheLinkedFight();
    await fulfilOnSheet();
    expect(rewardCards()).toHaveLength(1);
    expect(supply()).toBe(3);
    expect(vow.flags[MODULE_ID].reward.status).toBe('granted');
  }, 30_000);

  it('with the vowId flag never landed (VOW-ID-NEVER-LANDED), the reward is still granted once', async () => {
    await setUp({ vowIdFlag: false });
    await pickReward();
    // The fix's own effect: the pick landed on the vow by its Item id.
    expect(vow.flags[MODULE_ID].reward?.status).toBe('promised');
    await winTheLinkedFight();
    expect(table.cards(f => f.fightVowCard), 'the fight was won (setup)').toHaveLength(1);
    await fulfilOnSheet();
    expect({ rewardsEarned: rewardCards().length, supply: supply(), status: vow.flags[MODULE_ID].reward.status })
      .toEqual({ rewardsEarned: 1, supply: 3, status: 'granted' });
  }, 30_000);
});

describe('a sheet-made vow whose vowId stamp never landed: its promised reward is granted once (writer-promised)', () => {
  it('the won fight claims the reward — the fulfilment grants nothing more', async () => {
    await setUp({ vowIdFlag: false });
    await promiseReward();
    const before = supply();

    await winTheLinkedFight();
    expect(table.cards(f => f.fightVowCard)).toHaveLength(1);   // control: the fight was won and linked
    expect(rewardCards()).toHaveLength(1);                      // control: the reward was granted
    expect(supply()).toBe(before + 2);
    expect(vow.flags[MODULE_ID].reward.status, 'the grant flips the reward (its one-time claim)').toBe('granted');

    await fulfilOnSheet();
    expect(rewardCards(), 'one "Reward earned" for one promised reward').toHaveLength(1);
    expect(supply(), 'the fuel cells are given once').toBe(before + 2);
  }, 30_000);

  it('control: the same vow with its vowId flag is granted once', async () => {
    await setUp({ vowIdFlag: true });
    await promiseReward();
    const before = supply();

    await winTheLinkedFight();
    expect(rewardCards()).toHaveLength(1);
    expect(vow.flags[MODULE_ID].reward.status).toBe('granted');

    await fulfilOnSheet();
    expect(rewardCards()).toHaveLength(1);
    expect(supply()).toBe(before + 2);
  }, 30_000);
});

describe('Forsake Your Vow on a sheet vow whose vowId stamp never landed', () => {
  it('marks its promised reward lost, so a fight won after grants nothing', async () => {
    await setUp({ vowIdFlag: false });
    await promiseReward();
    const before = supply();

    await forsake();
    expect({ completed: vow.system.completed, forsaken: vow.flags[MODULE_ID].forsaken ?? false }, 'the vow is forsaken (setup)')
      .toEqual({ completed: true, forsaken: true });
    expect(vow.flags[MODULE_ID].reward.status).toBe('lost');

    await winTheLinkedFight();
    expect({ rewardsEarned: rewardCards().length, supply: supply() }).toEqual({ rewardsEarned: 0, supply: before });
  }, 30_000);
});
