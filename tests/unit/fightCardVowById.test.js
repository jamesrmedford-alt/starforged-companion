/* global silenceConsoleErrors */
/**
 * A victory card acts on the vow its fight served — by the vow id it carries
 * (issue #345 AA17 FIGHT-CARD-ACTS-ON-ANOTHER-VOW, the twelfth audit's CARD-3
 * probe).
 *
 * The card's ⚑ Mark milestone and 🏁 Attempt to Fulfill found their vow by
 * its NAME; the card's `vowId` (vowCopyId, FIGHT-PAYOFF-CARD-VOWID-FLAG-ONLY)
 * was read by 🤝 Deepen's ledger alone. Once the name no longer found the vow
 * the fight served, the mark and the roll fell through to ANOTHER vow:
 *   (a) fulfilled, winner ≠ holder (issue #342 D5's case): the retire guard
 *       read only the winner's vows, so ⚑ stayed armed and marked Ren's
 *       "Repay the Syndicate" after Kira fulfilled "Find Chen" from the card;
 *   (b) renamed: ⚑ marked Ren's sole open vow; 🏁 kept Ren as the roller —
 *       Kira's player refused, Ren's press fulfilling Ren's own vow;
 *   (c) deleted, winner = holder: Kira's 🏁 scored and fulfilled her other vow.
 * The card's vow is now resolved by its id (index.js fightCardVow): its
 * holder's open copy, whatever it is named; fulfilled or on no sheet, ⚑ and
 * 🏁 retire (saying why) and a press marks or rolls nothing.
 *
 * Driven on a booted table: the real postFightVowMilestoneCard, clicks on the
 * card DOM, the forced fulfil through the real pipeline (fightCardFulfilAsHolder
 * .test.js's set-up).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Challenge dice 1 and 1 against two boxes: a strong hit — the vow is fulfilled.
const control = vi.hoisted(() => ({ dice: [0.0, 0.0] }));
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

function makeVow(id, name, vowId) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId } },
    system: { subtype: 'vow', rank: 'dangerous', current: 8, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        if (k === 'system.current') item.system.current = v;
        if (k === 'system.completed') item.system.completed = v;
        if (k === 'system.rank') item.system.rank = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    async getFlag(scope, key) { return item.flags[scope]?.[key]; },
  };
  return item;
}

let table, kirasVow, rensVow, kiraItems;

async function postVictoryCard(winner) {
  const gm = table.client('gm-1');
  const index = await gm.import('../../src/index.js');
  await gm.run(() => index.postFightVowMilestoneCard('Find Chen', 1, winner));
  await table.settle();
  const [card] = table.cards(f => f.fightVowCard);
  return card;
}

async function press(userId, id, selector) {
  table.client(userId).click(id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.0, 0.0];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kirasVow = makeVow('vow-kira', 'Find Chen', 'vid-kira');
  rensVow  = makeVow('vow-ren', 'Repay the Syndicate', 'vid-ren');
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [rensVow] } });
  kiraItems = [kirasVow];
  // A live item list (find / filter read it too), so a vow removed from the
  // sheet mid-test is gone for every reader.
  const live = (list) => ({ contents: list, find: (fn) => list.find(fn) ?? null, filter: (fn) => list.filter(fn),
    [Symbol.iterator]: () => list[Symbol.iterator]() });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: live(kiraItems) });
  scriptClaude(table, { fallback: () => 'Chen is found.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe('issue #345 AA17 — a victory card whose vow its holder fulfilled from it', () => {
  it('control: Kira won her own fight — after she fulfils "Find Chen", ⚑ marks nothing', async () => {
    const card = await postVictoryCard('pc-kira');
    await press('pl-1', card._id, '[data-action="sf-fulfill-vow"]');
    expect(kirasVow.system.completed, 'Kira fulfilled her vow (setup)').toBe(true);
    await press('pl-2', card._id, '[data-action="sf-mark-milestone"]');
    expect(rensVow.system.current).toBe(8);
  }, 30_000);

  it('Ren landed the blow — after Kira fulfils "Find Chen", ⚑ does not mark Ren\'s other vow', async () => {
    const card = await postVictoryCard('pc-ren');
    await press('pl-1', card._id, '[data-action="sf-fulfill-vow"]');
    expect(kirasVow.system.completed, 'Kira fulfilled her vow from the card (setup, D5)').toBe(true);
    await press('pl-2', card._id, '[data-action="sf-mark-milestone"]');
    expect(rensVow.system.current, 'Ren\'s "Repay the Syndicate" — a vow the fight never served — is not marked').toBe(8);
  }, 30_000);

  it('…and the card retires its ⚑ once the vow it served is fulfilled (W29), as on Kira\'s own card', async () => {
    const card = await postVictoryCard('pc-ren');
    await press('pl-1', card._id, '[data-action="sf-fulfill-vow"]');
    expect(kirasVow.system.completed, 'setup').toBe(true);
    const root = table.client('pl-2').render(card._id);
    expect(root.querySelector('[data-action="sf-mark-milestone"]')?.disabled).toBe(true);
  }, 30_000);
});

// The same hop with the vow renamed instead of fulfilled: the card carries the
// vow's id (`vowId`, vowCopyId — FIGHT-PAYOFF-CARD-VOWID-FLAG-ONLY stamped it
// so 🤝 Deepen finds a renamed vow), but ⚑ and 🏁 still resolve by the card's
// name and fall back to the card's roller, Ren.
describe('issue #345 AA17 — a victory card whose vow its holder renamed since', () => {
  it('control: Ren landed the blow, nothing renamed — ⚑ marks Kira\'s vow', async () => {
    const card = await postVictoryCard('pc-ren');
    await press('pl-1', card._id, '[data-action="sf-mark-milestone"]');
    expect([kirasVow.system.current, rensVow.system.current]).toEqual([16, 8]);
  }, 30_000);

  it('Kira renamed "Find Chen" — ⚑ marks her vow (the card\'s vowId), not Ren\'s sole open vow', async () => {
    const card = await postVictoryCard('pc-ren');
    expect(card.flags[MODULE_ID].vowId, 'the card names the vow by id (setup)').toBe('vid-kira');
    kirasVow.name = 'Bring Chen Home';
    await press('pl-1', card._id, '[data-action="sf-mark-milestone"]');
    expect({ kira: kirasVow.system.current, ren: rensVow.system.current }).toEqual({ kira: 16, ren: 8 });
  }, 30_000);

  it('Kira renamed "Find Chen" — her player may still attempt to fulfil it from the card, rolled as Kira', async () => {
    control.dice = [0.95, 0.95];   // a miss: nothing completes either way
    const card = await postVictoryCard('pc-ren');
    kirasVow.name = 'Bring Chen Home';
    await press('pl-1', card._id, '[data-action="sf-fulfill-vow"]');
    const rolled = table.cards(f => f.forcedMoveId === 'fulfill_your_vow')
      .map(m => `${m.speaker?.actor ?? null}→${m.flags[MODULE_ID].forcedMoveTargetId ?? null}`);
    expect(rolled).toEqual(['pc-kira→vow-kira']);
  }, 30_000);

  it('Kira renamed "Find Chen" — Ren\'s player\'s 🏁 on that card does not fulfil Ren\'s own "Repay the Syndicate"', async () => {
    control.dice = [0.0, 0.0];     // a strong hit for whatever vow is scored
    const card = await postVictoryCard('pc-ren');
    kirasVow.name = 'Bring Chen Home';
    await press('pl-2', card._id, '[data-action="sf-fulfill-vow"]');
    expect(rensVow.system.completed, 'Ren\'s unrelated vow is not fulfilled from a card for Kira\'s fight').toBe(false);
  }, 30_000);
});

describe('issue #345 AA17 — a victory card whose vow was deleted since', () => {
  it('control: Kira won her own fight, both vows on her sheet — her 🏁 fulfils "Find Chen", not "Repay Old Debts"', async () => {
    control.dice = [0.0, 0.0];
    const other = makeVow('vow-kira-2', 'Repay Old Debts', 'vid-kira-2');
    kiraItems.push(other);
    const card = await postVictoryCard('pc-kira');
    await press('pl-1', card._id, '[data-action="sf-fulfill-vow"]');
    expect({ findChen: kirasVow.system.completed, other: other.system.completed }).toEqual({ findChen: true, other: false });
  }, 30_000);

  it('Kira won her own fight, then "Find Chen" was deleted — her 🏁 does not fulfil her OTHER vow', async () => {
    control.dice = [0.0, 0.0];     // a strong hit for whatever vow is scored
    const other = makeVow('vow-kira-2', 'Repay Old Debts', 'vid-kira-2');
    kiraItems.push(other);
    const card = await postVictoryCard('pc-kira');
    // "Find Chen" leaves her sheet; her other vow stays.
    kiraItems.splice(kiraItems.indexOf(kirasVow), 1);
    await press('pl-1', card._id, '[data-action="sf-fulfill-vow"]');
    expect(other.system.completed, '"Repay Old Debts" is not fulfilled from the card of a fight for "Find Chen"').toBe(false);
  }, 30_000);
});

describe('issue #345 AA17 — a retired victory card says why', () => {
  it('fulfilled: ⚑ and 🏁 are disabled, titled that the vow is fulfilled', async () => {
    const card = await postVictoryCard('pc-ren');
    await press('pl-1', card._id, '[data-action="sf-fulfill-vow"]');
    const root = table.client('pl-2').render(card._id);
    for (const action of ['sf-mark-milestone', 'sf-fulfill-vow']) {
      const btn = root.querySelector(`[data-action="${action}"]`);
      expect({ disabled: btn?.disabled, title: btn?.title }).toEqual({ disabled: true, title: 'The vow this fight served is fulfilled' });
    }
  }, 30_000);

  it('deleted: ⚑ marks nothing — not her other vow — and the card says the vow is on no sheet', async () => {
    const other = makeVow('vow-kira-2', 'Repay Old Debts', 'vid-kira-2');
    kiraItems.push(other);
    const card = await postVictoryCard('pc-kira');
    kiraItems.splice(kiraItems.indexOf(kirasVow), 1);
    await press('pl-1', card._id, '[data-action="sf-mark-milestone"]');
    expect({ other: other.system.current, ren: rensVow.system.current }).toEqual({ other: 8, ren: 8 });
    const btn = table.client('pl-1').render(card._id).querySelector('[data-action="sf-mark-milestone"]');
    expect({ disabled: btn?.disabled, title: btn?.title })
      .toEqual({ disabled: true, title: 'The vow this fight served is no longer on any character\'s sheet' });
  }, 30_000);
});
