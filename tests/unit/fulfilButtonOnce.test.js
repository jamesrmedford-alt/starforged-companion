/**
 * STARFORGED COMPANION
 * tests/unit/fulfilButtonOnce.test.js
 *
 * Known-issues FULFIL-BUTTON-LOCAL-DISABLE — one card's "🏁 Attempt to
 * Fulfill" rolls Fulfill Your Vow once, however many times it is pressed.
 *
 * A move card's "🏁 Attempt to Fulfill Vow" (beside "⚑ Mark Progress on Vow")
 * and a won-fight card's "🏁 Attempt to Fulfill" disabled the button on the
 * clicker's screen only and posted the forced Fulfill Your Vow from the
 * clicker's client: the player and the GM each pressing it — or one client
 * after a re-render — rolled the vow twice. Issue #329 X05 fixed whose vow it
 * rolls, not how often. The click now relays to the canonical GM
 * ("fulfilVow.attempt"), which claims the GM-authored card (`fulfilAttempted`)
 * before it posts the move once, as the card's roller — the relay-and-claim
 * of issue #321 U02 / U20.
 *
 * On a booted table (tests/helpers/multiClient.js): the player and the GM
 * press the button on their own clients; the GM's real pipeline rolls.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Challenge dice 10 and 10 against a progress score of 2: a miss, so the vow
// stays open — a second press would be a second real roll.
const control = vi.hoisted(() => ({ dice: [0.95, 0.95] }));
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
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    async getFlag(scope, key) { return item.flags[scope]?.[key]; },
  };
  return item;
}

let table;
const fulfils = () => table.cards(f => f.forcedMoveId === 'fulfill_your_vow');

// Kira's move card after a quest-advancing hit: her sole open vow rides by its Item id.
async function postMoveCard() {
  const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-move-result sf-strong-hit"><div class="sf-move-name">Gather Information</div>`
      + `<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-reach-milestone">⚑ Mark Progress on Vow</button>`
      + `<button type="button" class="sf-followup-btn" data-action="sf-attempt-fulfill-vow">🏁 Attempt to Fulfill Vow</button></div></div>`,
    flags: { [MODULE_ID]: { moveResolution: true, resolutionId: 'res-1', actorId: 'pc-kira',
      milestoneSuggestion: { eligible: true, vowCount: 1, vowItemId: 'vow-kira' } } },
  }));
  await table.settle();
  return msg.id;
}

// The victory card of a fight Kira won serving "Find Chen".
async function postVictoryCard() {
  const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-card sf-fight-vow"><div class="sf-card-body"><p>You won the fight serving “Find Chen”.</p>`
      + `<p><button type="button" class="entity-btn" data-action="sf-mark-milestone">⚑ Mark milestone (×2)</button> `
      + `<button type="button" class="entity-btn" data-action="sf-fulfill-vow">🏁 Attempt to Fulfill</button></p></div></div>`,
    flags: { [MODULE_ID]: { fightVowCard: true, vowName: 'Find Chen', marks: 2, connectionName: null, vowRank: 2, actorId: 'pc-kira' } },
  }));
  await table.settle();
  return msg.id;
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
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [makeVow('vow-ren', 'Repay the Syndicate', 'vid-ren')] } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [makeVow('vow-kira', 'Find Chen', 'vid-kira')] } });
  scriptClaude(table, { fallback: () => 'The trail goes cold.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe('FULFIL-BUTTON-LOCAL-DISABLE — a card\'s "🏁 Attempt to Fulfill" rolls once', () => {
  it('the player and the GM both pressing a move card\'s 🏁 roll Fulfill Your Vow once, as Kira', async () => {
    const id = await postMoveCard();
    await press('pl-1', id, '[data-action="sf-attempt-fulfill-vow"]');
    await press('gm-1', id, '[data-action="sf-attempt-fulfill-vow"]');

    expect(fulfils()).toHaveLength(1);                                  // was 2 — each client posted its own
    expect(fulfils()[0].speaker?.actor).toBe('pc-kira');                // control: the roller's move (X05)
    expect(fulfils()[0].flags[MODULE_ID].forcedMoveTargetId).toBe('vow-kira');
  }, 30_000);

  it('after a re-render the pressed 🏁 stays pressed', async () => {
    const id = await postMoveCard();
    await press('pl-1', id, '[data-action="sf-attempt-fulfill-vow"]');

    const root = table.client('pl-1').render(id);   // a fresh render of the same card
    expect(root.querySelector('[data-action="sf-attempt-fulfill-vow"]').disabled).toBe(true);
    expect(table.world.message(id).flags[MODULE_ID].fulfilAttempted).toBe(true);
    // control: the card's other button is its own — still live
    expect(root.querySelector('[data-action="sf-reach-milestone"]').disabled).toBe(false);
  }, 30_000);

  it('the player and the GM both pressing a won-fight card\'s 🏁 roll it once, Kira\'s vow by name and Item id', async () => {
    const id = await postVictoryCard();
    await press('pl-1', id, '[data-action="sf-fulfill-vow"]');
    await press('gm-1', id, '[data-action="sf-fulfill-vow"]');

    expect(fulfils()).toHaveLength(1);
    expect(fulfils()[0].speaker?.actor).toBe('pc-kira');
    expect(fulfils()[0].flags[MODULE_ID]).toMatchObject({ forcedMoveTarget: 'Find Chen', forcedMoveTargetId: 'vow-kira' });
    expect(table.client('gm-1').render(id).querySelector('[data-action="sf-fulfill-vow"]').disabled).toBe(true);
  }, 30_000);

  it('another player may not roll Kira\'s vow from her card; the GM may, as Kira', async () => {
    const id = await postMoveCard();
    await press('pl-2', id, '[data-action="sf-attempt-fulfill-vow"]');
    expect(fulfils()).toHaveLength(0);
    expect(table.world.message(id).flags[MODULE_ID].fulfilAttempted ?? false).toBe(false);

    await press('gm-1', id, '[data-action="sf-attempt-fulfill-vow"]');
    expect(fulfils()).toHaveLength(1);
    expect(fulfils()[0].speaker?.actor).toBe('pc-kira');
  }, 30_000);
});
