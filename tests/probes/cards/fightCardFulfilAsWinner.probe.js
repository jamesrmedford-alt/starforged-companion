/**
 * CARD-D1 (decision row) — the won-fight card's "🏁 Attempt to Fulfill" is the
 * fight WINNER's, even when the vow it serves is another PC's (eleventh audit,
 * cards).
 *
 * Kira enters the fray serving her own vow "Find Chen" (the threshold's vow
 * picker lists the roller's vows); Ren lands the decisive blow, so the
 * victory card (postFightVowMilestoneCard) carries Ren as its roller
 * (`actorId`: the PC whose winning roll ended the fight). The card's ⚑ Mark
 * milestone marks the vow's HOLDER — Kira (resolveVowHolderActor: "the card's
 * roller when they hold the vow, else whichever PC does"). Its 🏁 Attempt to
 * Fulfill is the card roller's (applyAttemptFulfilVow): Kira's player is
 * refused ("That button is Ren's"), and Ren's player — or the GM — rolls
 * Fulfill Your Vow on Kira's vow as Ren (Ren the narrator's CHARACTER, a
 * miss's recommit offer Ren's to press). The probe asserts option A: the 🏁
 * rolls as the vow's holder, as ⚑ marks the holder's.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Challenge dice 10 and 10: a miss, so the vow stays open.
const control = vi.hoisted(() => ({ dice: [0.95, 0.95] }));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

function makeVow(id, name, vowId) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId } },
    system: { subtype: 'vow', rank: 'dangerous', current: 8, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        if (k === 'system.current') item.system.current = v;
        if (k === 'system.completed') item.system.completed = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    async getFlag(scope, key) { return item.flags[scope]?.[key]; },
  };
  return item;
}

let table, kirasVow;
const fulfils = () => table.cards(f => f.forcedMoveId === 'fulfill_your_vow');

/** The victory card of Kira's fight for "Find Chen", won by Ren's decisive blow — the real builder. */
async function postVictoryCardWonByRen() {
  const gm = table.client('gm-1');
  const index = await gm.import('../../src/index.js');
  await gm.run(() => index.postFightVowMilestoneCard('Find Chen', 1, 'pc-ren'));
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
  control.dice = [0.95, 0.95];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kirasVow = makeVow('vow-kira', 'Find Chen', 'vid-kira');
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [makeVow('vow-ren', 'Repay the Syndicate', 'vid-ren')] } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [kirasVow] } });
  scriptClaude(table, { fallback: () => 'The trail goes cold.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe('a won-fight card whose winner (Ren) does not hold the vow it served (Kira\'s)', () => {
  it('control: the card is Ren\'s (the winner) and its ⚑ marks Kira\'s vow — the holder\'s', async () => {
    const card = await postVictoryCardWonByRen();
    expect(card.flags[MODULE_ID]).toMatchObject({ vowName: 'Find Chen', actorId: 'pc-ren' });
    await press('pl-1', card._id, '[data-action="sf-mark-milestone"]');
    expect(kirasVow.system.current).toBe(16);    // one dangerous milestone on Kira's vow
  }, 30_000);

  it('Kira\'s player may attempt to fulfil her own vow from it — rolled as Kira', async () => {
    const card = await postVictoryCardWonByRen();
    await press('pl-1', card._id, '[data-action="sf-fulfill-vow"]');
    expect(fulfils().map(m => m.speaker?.actor ?? null)).toEqual(['pc-kira']);
  }, 30_000);

  it('Ren\'s player cannot roll Kira\'s vow as Ren from it', async () => {
    const card = await postVictoryCardWonByRen();
    await press('pl-2', card._id, '[data-action="sf-fulfill-vow"]');
    // Today it rolls as Ren, scoring Kira's vow Item (vow-kira).
    expect(fulfils().map(m => `${m.speaker?.actor ?? null}→${m.flags[MODULE_ID].forcedMoveTargetId ?? null}`))
      .not.toContain('pc-ren→vow-kira');
  }, 30_000);
});
