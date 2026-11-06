/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/fightPayoffCardVowCopyId.test.js
 *
 * Known-issues FIGHT-PAYOFF-CARD-VOWID-FLAG-ONLY (found while fixing issue
 * #342 Z54) — the won-fight card and the fulfilment's payoff-failure card
 * name their vow as its copies are found: the `vowId` flag, else the vow
 * Item's own id (actorBridge.vowCopyId).
 *
 * Kira's sheet-made vow "Free Sable's crew", sworn for her connection Sable:
 * the createItem hook's `vowId` stamp never landed (known-issues
 * VOW-ID-NEVER-LANDED), so the vow is named by its Item id. Both cards took
 * `vowId` from the flag alone and carried null, so the payoff ledger they read
 * and write (payoffVowCopies — by id, else by the vow's exact name) found the
 * vow by its name only:
 *
 *   - the victory card's 🤝 Deepen records the deepen on the vow so the vow
 *     deepens Sable once (issue #326 D1). After a rename the press found no
 *     vow: it deepened Sable a second time after the fulfilment's deepen, or
 *     deepened without recording it, so the fulfilment deepened again;
 *   - the fulfilment's failure card's Retry skips a step the ledger records
 *     and pays the reward on the vow's copies. After a rename it found no
 *     vow: a deepen the victory card had paid meanwhile was paid again, and a
 *     reward whose claim was refused could never be retried ("no open vow by
 *     that name").
 *
 * Driven on a booted GM / player table: the real postFightVowMilestoneCard,
 * the sheet fulfilment's payFulfilledVowNative, the card buttons pressed on
 * the card DOM and relayed to the canonical GM.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const OLD_NAME = "Free Sable's crew";
const NEW_NAME = 'Bring the Sable crew home';
const ONE_DEEPEN = 16;   // a Formidable vow → 2 marks × 8 ticks (Sable is Dangerous)

let table, vow, kira, sable;
const ticks       = () => sable.flags[MODULE_ID].connection.relationshipTicks ?? 0;
const failCards   = () => table.cards(f => f.payoffFailureCard);
const rewardCards = () => table.cards(f => f.rewardGrantCard);

/** Kira's sheet vow; `vowIdFlag: false` — its createItem `vowId` stamp never landed. */
function makeVow({ vowIdFlag }) {
  const item = {
    id: 'v-crew', name: OLD_NAME, type: 'progress',
    system: { subtype: 'vow', rank: 'formidable', current: 40, completed: false },
    flags: { [MODULE_ID]: {
      vowSetupOffered: true, linkedConnectionName: 'Sable',
      reward: { status: 'promised', description: 'Fuel cells', form: 'supply' },
      ...(vowIdFlag ? { vowId: 'v-crew' } : {}),
    } },
    refuse: new Set(),            // a flag key: its next write is refused
    update: async (changes) => {
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
      if ('name' in changes) item.name = changes.name;
    },
    setFlag: async (mod, key, value) => {
      if (item.refuse.delete(key)) throw new Error('refused by the test');
      (item.flags[mod] ??= {})[key] = value;
    },
  };
  return item;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

async function setUp({ vowIdFlag = false } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      connectionIds: ['conn-sable'], legacyTracks: { quests: { ticks: 0, cleared: false } } },
  } } });
  vow = makeVow({ vowIdFlag });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  kira.system.supply.value = 1;
  sable = table.addActor({
    id: 'conn-sable', name: 'Sable', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-sable', name: 'Sable', rank: 'dangerous', role: 'Pilot',
      relationshipTicks: 0, bonded: false, active: true, history: [],
    } } },
  });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
  silenceConsoleErrors();
}

/** The pipeline's won-fight branch: Kira won the fight serving the vow. */
async function postVictoryCard() {
  const gm = table.client('gm-1');
  const { postFightVowMilestoneCard } = await gm.import('../../src/index.js');
  await gm.run(() => postFightVowMilestoneCard(OLD_NAME, 2, 'pc-kira'));
  await table.settle();
  return table.cards(f => f.fightVowCard).at(-1);
}

/** Kira's player presses the victory card's 🤝 Deepen your bond with Sable. */
async function pressDeepen(card) {
  table.client('pl-1').click(card._id, '[data-action="sf-deepen-bond"]');
  await table.settle(); await table.drain();
}

/** Kira fulfils the vow on her sheet — the canonical GM pays it (the native consequence hook's call). */
async function fulfilOnSheet(name = vow.name) {
  vow.system.completed = true;
  const gm = table.client('gm-1');
  const { payFulfilledVowNative } = await gm.import('../../src/index.js');
  await gm.run(() => payFulfilledVowNative(name, 'strong_hit', { actorId: 'pc-kira' }));
  await table.settle(); await table.drain();
}

/** Kira's player renames the vow on her sheet. */
const rename = () => { vow.name = NEW_NAME; };

/** A GM presses the failure card's Retry. */
async function retry(card) {
  table.client('gm-1').click(card._id, '[data-action="sf-payoff-retry"]');
  await table.settle(); await table.drain();
}

describe('the victory card names a sheet vow whose vowId stamp never landed by its Item id', () => {
  beforeEach(() => setUp());

  it('the card carries the vow Item\'s id', async () => {
    const card = await postVictoryCard();
    expect(card.flags[MODULE_ID]).toMatchObject({ vowName: OLD_NAME, connectionName: 'Sable', vowId: 'v-crew' });
  }, 30_000);

  it('the fulfilment, a rename, then 🤝 Deepen: Sable deepens once, and the card says so', async () => {
    const card = await postVictoryCard();
    await fulfilOnSheet();
    expect(ticks(), 'the fulfilment deepened Sable (setup)').toBe(ONE_DEEPEN);

    rename();
    await pressDeepen(card);

    expect(ticks(), 'a vow deepens its connection once').toBe(ONE_DEEPEN);
    expect(table.cards(f => f.deepenBondCard).at(-1).content).toContain('has already deepened');
  }, 30_000);

  it('a rename, 🤝 Deepen, then the fulfilment: Sable deepens once', async () => {
    const card = await postVictoryCard();
    rename();
    await pressDeepen(card);
    expect(ticks(), 'the press deepened Sable (setup)').toBe(ONE_DEEPEN);

    await fulfilOnSheet(NEW_NAME);

    expect(ticks(), 'a vow deepens its connection once').toBe(ONE_DEEPEN);
    expect(vow.flags[MODULE_ID].fulfilPayoff, 'the press is recorded on the vow').toMatchObject({ deepen: true });
    expect(vow.flags[MODULE_ID].fulfilPaid, 'the rest of the payoff ran (control)').toBe(true);
  }, 30_000);
});

describe('the fulfilment\'s payoff-failure card names a sheet vow whose vowId stamp never landed by its Item id', () => {
  beforeEach(() => setUp());

  it('a refused reward claim, a rename, then the GMs\' Retry: the reward is granted once', async () => {
    vow.refuse.add('reward');
    await fulfilOnSheet();
    const [card] = failCards();
    expect(card.flags[MODULE_ID], 'the reward claim was refused (setup)').toMatchObject({ source: 'fulfil', steps: [{ step: 'reward' }] });
    expect(vow.flags[MODULE_ID].reward.status, 'nothing was claimed (setup)').toBe('promised');

    rename();
    await retry(card);

    expect({ status: vow.flags[MODULE_ID].reward.status, earned: rewardCards().length, supply: kira.system.supply.value, failCards: failCards().length })
      .toEqual({ status: 'granted', earned: 1, supply: 3, failCards: 1 });
  }, 30_000);

  it('a refused deepen, 🤝 Deepen on the victory card, a rename, then the GMs\' Retry: Sable deepens once', async () => {
    const victory = await postVictoryCard();
    failWrites(table, w => w.kind === 'actor.update' && w.id === 'conn-sable');
    await fulfilOnSheet();
    const [card] = failCards();
    expect(card.flags[MODULE_ID].steps, 'the deepen was refused (setup)').toEqual([{ step: 'deepen', connectionName: 'Sable', marks: 2 }]);
    expect(ticks()).toBe(0);

    await pressDeepen(victory);
    expect(ticks(), 'the victory card deepened Sable (setup)').toBe(ONE_DEEPEN);

    rename();
    await retry(card);

    expect(ticks(), 'a vow deepens its connection once').toBe(ONE_DEEPEN);
  }, 30_000);
});

describe('control: a vow whose vowId flag landed', () => {
  beforeEach(() => setUp({ vowIdFlag: true }));

  it('the fulfilment, a rename, then 🤝 Deepen: Sable deepens once', async () => {
    const card = await postVictoryCard();
    expect(card.flags[MODULE_ID].vowId).toBe('v-crew');
    await fulfilOnSheet();
    rename();
    await pressDeepen(card);
    expect(ticks()).toBe(ONE_DEEPEN);
  }, 30_000);
});
