/**
 * STARFORGED COMPANION
 * tests/unit/payoffFailure.test.js
 *
 * Issue #306 R04, third point: a payoff step that does not land is told to the
 * GMs, and can be retried once. On a booted table, the world refuses one write
 * (tests/helpers/multiClient.js interceptWrites):
 *
 *   - a vow fulfilled on the sheet (payFulfilledVowNative — the native
 *     consequence hook's call on the canonical GM) pays the Quests legacy,
 *     deepens the linked connection and grants the promised reward. Each
 *     failure was logged to the console and lost: the legacy's XP was paid
 *     before its write (so a refused write paid XP for ticks never saved), a
 *     refused reward still said "🎁 Reward earned", a deleted connection was
 *     skipped without a word;
 *   - a bond forged on the sheet (payForgedBondNative) pays the bonds legacy;
 *   - a won fight grants its vow's promised reward, and the victory card's
 *     "⚑ Mark milestone" was stamped applied even when the mark was refused.
 *
 * Now each failed step goes on one card whispered to the GMs, with the value
 * it changes as it stands now, and a Retry that re-runs only the failed steps,
 * once. A fulfilment's landed steps are recorded on the vow (`fulfilPayoff`).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The pipeline (the won-fight test): no pacing call, the confirm dialog
// accepted, scripted dice inside the REAL resolveMove.
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

let table, vow, pat, rook;
const world      = () => table.world.campaignState();
const quests     = () => world().legacyTracks?.quests?.ticks ?? 0;
const bonds      = () => world().legacyTracks?.bonds?.ticks ?? 0;
const supply     = () => pat.system.supply.value;
const rookTicks  = () => rook.flags[MODULE_ID].connection.relationshipTicks ?? 0;
const failCards  = () => table.cards(f => f.payoffFailureCard);
const rewardCards = () => table.cards(f => f.rewardGrantCard);
const xpCards    = () => table.cards(f => f.legacyXpCard);

/** The one payoff failure card posted so far. */
function theFailCard() {
  const cards = failCards();
  expect(cards, 'one payoff failure card').toHaveLength(1);
  return cards[0];
}

/** Kira's vow: dangerous, linked to Rook, promising fuel cells (+2 supply on a strong hit). */
function vowItem({ completed = true } = {}) {
  const item = {
    id: 'v-archive', name: 'Find the archive', type: 'progress',
    system: { subtype: 'vow', rank: 'dangerous', current: completed ? 40 : 8, completed },
    flags: { [MODULE_ID]: {
      vowId: 'vid-archive', linkedConnectionName: 'Rook',
      reward: { status: 'promised', description: 'Fuel cells', form: 'supply' },
    } },
    refuse: new Set(),            // 'update' or a flag key: its next write is refused
    update: async (changes) => {
      if (item.refuse.delete('update')) throw new Error('refused by the test');
      if ('system.current' in changes) item.system.current = changes['system.current'];
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
    },
    setFlag: async (mod, key, value) => {
      if (item.refuse.delete(key)) throw new Error('refused by the test');
      (item.flags[mod] ??= {})[key] = value;
    },
  };
  return item;
}

/** Refuse the next world write `match` selects — once. */
function refuseNext(match) {
  let spent = false;
  return table.interceptWrites((w) => {
    if (spent || !match(w)) return undefined;
    spent = true;
    return new Error('refused by the test');
  });
}
const legacyWrite = (w) => w.kind === 'setting' && String(w.key).includes('campaignState');
const supplyWrite = (w) => w.kind === 'actor.update' && w.id === 'pc-pat'
  && Object.keys(w.changes ?? {}).some(k => k.includes('supply'));

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
      connectionIds: ['npc-rook'],
      legacyTracks: { quests: { ticks: 2, cleared: false } },   // a dangerous fulfilment's 2 ticks fill box 1
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  vow = vowItem();
  pat = table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  rook = table.addActor({ id: 'npc-rook', name: 'Rook', flags: { [MODULE_ID]: {
    entityType: 'connection',
    connection: { _id: 'npc-rook', name: 'Rook', rank: 'dangerous', relationshipTicks: 0, bonded: false, active: true, history: [] },
  } } });
  scriptClaude(table, { fallback: () => REPLY });
});

/** The canonical GM pays a vow fulfilled on the sheet (the native consequence hook's call). */
async function fulfilOnSheet() {
  const gm = table.client('gm-1');
  const { payFulfilledVowNative } = await gm.import('../../src/index.js');
  await gm.run(() => payFulfilledVowNative('Find the archive', 'strong_hit', { actorId: 'pc-pat' }));
  await table.settle();
}

/** A GM presses the card's Retry. */
async function retry(card, userId = 'gm-1') {
  table.client(userId).click(card._id, '[data-action="sf-payoff-retry"]');
  await table.settle();
  await table.drain();
}

/** Ask the canonical GM to retry the card directly, as a relayed press would (from `userId`). */
async function requestRetry(card, userId) {
  const client = table.client(userId);
  const { requestGmAction } = await client.import('../../src/multiplayer/gmRelay.js');
  const res = await client.run(() => requestGmAction('payoff.retry', { messageId: card._id }));
  await table.settle();
  return res;
}

describe('a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04)', () => {
  it('every step lands: no card, and each step is on the vow\'s ledger', async () => {
    await fulfilOnSheet();

    expect(failCards()).toHaveLength(0);
    expect(quests()).toBe(4);
    expect(rookTicks()).toBe(8);
    expect(supply()).toBe(5);
    expect(rewardCards()).toHaveLength(1);
    expect(vow.flags[MODULE_ID].fulfilPayoff).toEqual({ legacy: true, deepen: true, reward: true });
  });

  it('a refused legacy write: no XP, a GM card with the legacy as it stands; Retry pays the ticks and XP once', async () => {
    refuseNext(legacyWrite);
    await fulfilOnSheet();

    expect(quests()).toBe(2);
    expect(pat.system.xp).toBe(0);                       // no XP for ticks never saved
    expect(xpCards()).toHaveLength(0);
    const card = theFailCard();
    expect(card.whisper).toEqual(['gm-1']);
    expect(card.flags[MODULE_ID].steps).toEqual([{ step: 'legacy', track: 'quests', ticks: 2 }]);
    expect(card.content).toContain('It stands at 2/40 ticks now.');
    expect(vow.flags[MODULE_ID].fulfilPayoff).toEqual({ deepen: true, reward: true });   // the rest landed
    expect(rookTicks()).toBe(8);
    expect(supply()).toBe(5);

    await retry(card);

    expect(quests()).toBe(4);
    expect(pat.system.xp).toBe(2);
    expect(xpCards()).toHaveLength(1);
    expect(vow.flags[MODULE_ID].fulfilPayoff.legacy).toBe(true);
    expect(failCards()).toHaveLength(1);                 // nothing failed again
    expect(table.world.message(card._id).flags[MODULE_ID].resolved).toBe(true);

    // A second press — the button is spent — and a relayed one apply nothing.
    await retry(card);
    expect((await requestRetry(card, 'gm-1')).result).toMatchObject({ applied: false, reason: 'already-resolved' });
    expect(quests()).toBe(4);
    expect(pat.system.xp).toBe(2);
  });

  it('a refused reward grant: no "Reward earned"; Retry gives it once', async () => {
    refuseNext(supplyWrite);
    await fulfilOnSheet();

    expect(supply()).toBe(3);
    expect(rewardCards()).toHaveLength(0);
    expect(vow.flags[MODULE_ID].reward.status).toBe('granted');   // claimed: nothing else can grant it
    const card = theFailCard();
    expect(card.flags[MODULE_ID].steps).toEqual([{
      step: 'rewardGrant', pcId: 'pc-pat',
      reward: { description: 'Fuel cells', form: 'supply' },
      plan: expect.objectContaining({ status: 'granted', form: 'supply', amount: 2 }),
    }]);
    expect(card.content).toContain('supply stands at 3 now; this adds 2');

    await retry(card);
    expect(supply()).toBe(5);
    expect(rewardCards()).toHaveLength(1);

    await retry(card);
    expect(supply()).toBe(5);
    expect(rewardCards()).toHaveLength(1);
  });

  it('a refused reward claim gives nothing; Retry claims and gives it', async () => {
    vow.refuse.add('reward');
    await fulfilOnSheet();

    expect(supply()).toBe(3);
    expect(rewardCards()).toHaveLength(0);
    expect(vow.flags[MODULE_ID].reward.status).toBe('promised');
    const card = theFailCard();
    expect(card.flags[MODULE_ID].steps).toEqual([{ step: 'reward' }]);

    await retry(card);
    expect(vow.flags[MODULE_ID].reward.status).toBe('granted');
    expect(supply()).toBe(5);
    expect(rewardCards()).toHaveLength(1);
  });

  it('a connection no longer open is reported, not skipped', async () => {
    await table.client('gm-1').run(() => game.settings.set(MODULE_ID, 'campaignState', { ...world(), connectionIds: [] }));
    await fulfilOnSheet();

    const card = theFailCard();
    expect(card.flags[MODULE_ID].steps).toEqual([{ step: 'deepen', connectionName: 'Rook', marks: 1 }]);
    expect(card.content).toContain('renamed or deleted');
    expect(rookTicks()).toBe(0);
  });

  it('a step that fails again goes on a fresh card with its own Retry', async () => {
    refuseNext(legacyWrite);
    await fulfilOnSheet();
    const first = theFailCard();

    refuseNext(legacyWrite);
    await retry(first);

    expect(quests()).toBe(2);
    const cards = failCards();
    expect(cards).toHaveLength(2);
    expect(cards[1].flags[MODULE_ID]).toMatchObject({ resolved: false, steps: [{ step: 'legacy', track: 'quests', ticks: 2 }] });

    await retry(cards[1]);
    expect(quests()).toBe(4);
  });

  it('a Retry skips a step the vow\'s ledger says landed meanwhile', async () => {
    refuseNext(legacyWrite);
    await fulfilOnSheet();
    vow.flags[MODULE_ID].fulfilPayoff = { ...vow.flags[MODULE_ID].fulfilPayoff, legacy: true };

    await retry(theFailCard());
    expect(quests()).toBe(2);
  });

  it('a duplicate fulfilment after a partial failure pays nothing more', async () => {
    refuseNext(legacyWrite);
    await fulfilOnSheet();
    await fulfilOnSheet();

    expect(failCards()).toHaveLength(1);
    expect(quests()).toBe(2);
    expect(rookTicks()).toBe(8);
    expect(supply()).toBe(5);
  });

  // Issue #309 N05: a refused paid flag was swallowed and the steps ran
  // anyway; once this client's in-flight claim was released, a duplicate
  // fulfilment found no paid flag and paid every step again.
  const paidOut = () => ({ quests: quests(), deepen: rookTicks(), supply: supply(), xp: pat.system.xp });

  it('a refused paid flag applies nothing and tells the GMs; a duplicate then pays once, and the Retry nothing more', async () => {
    vow.refuse.add('fulfilPaid');
    await fulfilOnSheet();

    expect(paidOut()).toEqual({ quests: 2, deepen: 0, supply: 3, xp: 0 });
    const card = theFailCard();
    expect(card.flags[MODULE_ID].steps).toEqual([
      { step: 'legacy', track: 'quests', ticks: 2 },
      { step: 'deepen', connectionName: 'Rook', marks: 1 },
      { step: 'reward' },
    ]);
    expect(card.content).toContain('could not be marked paid');

    await fulfilOnSheet();                                  // a duplicate: its claim lands
    expect(vow.flags[MODULE_ID].fulfilPaid).toBe(true);
    expect(paidOut()).toEqual({ quests: 4, deepen: 8, supply: 5, xp: 2 });

    await retry(card);                                      // every step is on the ledger now
    await fulfilOnSheet();
    expect(paidOut()).toEqual({ quests: 4, deepen: 8, supply: 5, xp: 2 });
    expect(rewardCards()).toHaveLength(1);
    expect(failCards()).toHaveLength(1);
  });

  it('after a refused paid flag, the Retry pays once and a later duplicate pays nothing', async () => {
    vow.refuse.add('fulfilPaid');
    await fulfilOnSheet();
    await retry(theFailCard());
    expect(paidOut()).toEqual({ quests: 4, deepen: 8, supply: 5, xp: 2 });

    await fulfilOnSheet();
    await fulfilOnSheet();
    expect(paidOut()).toEqual({ quests: 4, deepen: 8, supply: 5, xp: 2 });
    expect(rewardCards()).toHaveLength(1);
    expect(failCards()).toHaveLength(1);
  });

  it('only a GM may retry: a player\'s relayed press applies nothing', async () => {
    refuseNext(legacyWrite);
    await fulfilOnSheet();
    const card = theFailCard();

    await requestRetry(card, 'pl-1');

    expect(quests()).toBe(2);
    expect(table.world.message(card._id).flags[MODULE_ID].resolved).toBe(false);
  });

  it('a press whose claim is refused applies nothing, and the button re-arms', async () => {
    refuseNext(legacyWrite);
    await fulfilOnSheet();
    const card = theFailCard();

    refuseNext(w => w.kind === 'message.update' && w.id === card._id);
    await retry(card);
    expect(quests()).toBe(2);

    await retry(card);
    expect(quests()).toBe(4);
  });
});

describe('a bond forged on the sheet: a refused bonds legacy goes to the GMs (issue #306 R04)', () => {
  it('the forge card says the legacy is not yet marked; Retry marks it once', async () => {
    const gm = table.client('gm-1');
    const { payForgedBondNative } = await gm.import('../../src/index.js');
    refuseNext(legacyWrite);
    await gm.run(() => payForgedBondNative('Rook'));
    await table.settle();

    expect(rook.flags[MODULE_ID].connection.bonded).toBe(true);
    expect(bonds()).toBe(0);
    const [forged] = table.cards(f => f.forgeABondCard);
    expect(forged, 'the forge card').toBeTruthy();
    expect(forged.content).toContain('not yet marked');
    const card = theFailCard();
    expect(card.flags[MODULE_ID]).toMatchObject({ source: 'forge', connectionName: 'Rook', steps: [{ step: 'legacy', track: 'bonds', ticks: 2 }] });

    await retry(card);
    expect(bonds()).toBe(2);
    await retry(card);
    expect(bonds()).toBe(2);
  });
});

describe('a won fight: its reward and its victory card report what did not land (issue #306 R04)', () => {
  beforeEach(() => {
    vow.system.completed = false;
    vow.system.current = 8;
  });

  it('a refused reward grant after a won fight goes to the GMs; Retry gives it once', async () => {
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

    refuseNext(supplyWrite);
    control.dice = [0.25, 0.35];                // 9 boxes beat 3 and 4: a strong hit
    await gm.run(() => store.ProgressTrackApp.DEFAULT_OPTIONS.actions.rollProgress.call({}, null, { dataset: { trackId: fight.id } }));
    await table.settle();
    await table.drain();

    expect(table.cards(f => f.fightVowCard)).toHaveLength(1);
    expect(supply()).toBe(3);
    expect(rewardCards()).toHaveLength(0);
    const card = theFailCard();
    expect(card.flags[MODULE_ID]).toMatchObject({ source: 'fight', vowId: 'vid-archive', steps: [{ step: 'rewardGrant', pcId: 'pc-pat' }] });

    await retry(card);
    expect(supply()).toBe(5);
    expect(rewardCards()).toHaveLength(1);
  });

  it('a refused milestone mark leaves the victory card\'s button live and tells the GMs; pressing again marks once', async () => {
    const gm = table.client('gm-1');
    const { postFightVowMilestoneCard } = await gm.import('../../src/index.js');
    await gm.run(() => postFightVowMilestoneCard('Find the archive', 1, 'pc-pat'));
    await table.settle();
    const [victory] = table.cards(f => f.fightVowCard);

    vow.refuse.add('update');
    gm.click(victory._id, '[data-action="sf-mark-milestone"]');
    await table.settle();

    expect(vow.system.current).toBe(8);
    expect(table.world.message(victory._id).flags[MODULE_ID].resolvedActions?.markMilestone).toBeUndefined();
    const report = theFailCard();
    expect(report.flags[MODULE_ID]).toMatchObject({ source: 'fightButton', retryable: false, steps: [{ step: 'milestone', marks: 1 }] });
    expect(report.whisper).toEqual(['gm-1']);
    expect(report.content).not.toContain('sf-payoff-retry');
    expect((await requestRetry(report, 'gm-1')).result).toMatchObject({ applied: false, reason: 'not-a-payoff-card' });

    gm.click(victory._id, '[data-action="sf-mark-milestone"]');
    await table.settle();
    const marked = vow.system.current;
    expect(marked).toBeGreaterThan(8);
    expect(table.world.message(victory._id).flags[MODULE_ID].resolvedActions.markMilestone).toBe(true);

    gm.click(victory._id, '[data-action="sf-mark-milestone"]');
    await table.settle();
    expect(vow.system.current).toBe(marked);
  });
});
