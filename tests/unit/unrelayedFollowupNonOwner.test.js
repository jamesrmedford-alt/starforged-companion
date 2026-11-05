/**
 * Issue #338 D1 (option A) — UNRELAYED-FOLLOWUP-NONOWNER.
 *
 * At a two-PC table (Kira, Ren) Ren's player pressed a follow-up on KIRA's
 * card — "⚔ Attempt to Finish the Fight" on her Strike card, "🗺 Finish the
 * Expedition" on her expedition card, "⚔ Swear it (roll)" on her "🆕 New vow
 * recorded" card. These posted from the presser's client speaking as the
 * card's roller (issue #329 X05) with no ownership check, so Ren's player
 * rolled Kira's Take Decisive Action (her position, her momentum, a Pay the
 * Price on her), finished her expedition or swore her vow. Decided (A): a
 * follow-up on another player's card is theirs or a GM's to press — the
 * three relay through GM_ACTIONS ("tda.attempt", "expedition.finish",
 * "vow.swearRoll") on the fulfilVow.attempt shape: the card claimed once on
 * the canonical GM, a non-owner refused, the move posted as the roller.
 *
 * Control: the relayed 🏁 on Kira's card refuses Ren's player.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
const forced = (moveId) => table.cards(f => f.forcedMoveId === moveId);
const asPc   = (moveId, actorId) => forced(moveId).filter((m) => m.speaker?.actor === actorId);
const flags  = (id) => table.world.message(id).flags[MODULE_ID];

function makeVow(id, name, vowId) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId } },
    system: { subtype: 'vow', rank: 'dangerous', current: 8, completed: false },
    async update() { return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

const gmPosts = (data) => table.client('gm-1').run(() => globalThis.ChatMessage.create(data)).then(async (m) => { await table.settle(); return m.id; });

async function press(userId, id, selector) {
  table.client(userId).click(id, selector);
  await table.settle(); await table.drain();
}

// Kira's three cards, as the pipeline and the createItem hook post them.
const CARDS = {
  tda: {
    moveId: 'take_decisive_action', selector: '[data-action="sf-take-decisive-action"]', claim: 'decisiveActionAttempted',
    post: (flags = {}) => gmPosts({
      content: `<div class="sf-move-result"><div class="sf-move-name">Strike</div>`
        + `<button type="button" class="sf-followup-btn" data-action="sf-take-decisive-action">⚔ Attempt to Finish the Fight</button></div>`,
      flags: { [MODULE_ID]: { moveResolution: true, combatMoveCard: true, resolutionId: 'res-1', actorId: 'pc-kira',
        combatTrackId: 'fight-1', combatTrackLabel: 'Corsairs', ...flags } },
    }),
  },
  finish: {
    moveId: 'finish_an_expedition', selector: '[data-action="sf-finish-expedition"]', claim: 'expeditionFinishAttempted',
    post: (flags = {}) => gmPosts({
      content: `<div class="sf-ptp-card"><strong>Expedition</strong><div class="sf-milestone-suggest-row">`
        + `<button type="button" class="sf-followup-btn" data-action="sf-finish-expedition">🗺 Finish the Expedition</button></div></div>`,
      flags: { [MODULE_ID]: { expeditionProgressCard: true, created: true, trackLabel: 'The Drift', trackId: 'exp-1', actorId: 'pc-kira', ...flags } },
    }),
  },
  swear: {
    moveId: 'swear_an_iron_vow', selector: '[data-action="sf-player-vow-swear"]', claim: 'swearRolled',
    post: (flags = {}) => gmPosts({
      content: `<div class="sf-card sf-player-vow"><div class="sf-card-body">`
        + `<p><button type="button" class="entity-btn" data-action="sf-player-vow-swear">⚔ Swear it (roll)</button></p></div></div>`,
      flags: { [MODULE_ID]: { playerVowCard: true, vowName: 'Find Chen', vowId: 'vow-kira', actorId: 'pc-kira', ...flags } },
    }),
  },
};

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'no-s1', sessionNumber: 1,
      currentSceneId: 'no-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, hasPlayerOwner: true, items: { contents: [makeVow('vow-ren', 'Repay the Syndicate', 'vid-ren')] } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, hasPlayerOwner: true, items: { contents: [makeVow('vow-kira', 'Find Chen', 'vid-kira')] } });
  scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe('issue #338 D1 — Ren\'s player presses a follow-up on Kira\'s card', () => {
  it.each(Object.entries(CARDS))('%s: refused — nothing rolled for Kira, the card left unclaimed', async (_name, card) => {
    const id = await card.post();
    await press('pl-2', id, card.selector);
    expect(forced(card.moveId)).toHaveLength(0);
    expect(flags(id)[card.claim] ?? false).toBe(false);
  }, 30_000);

  it.each(Object.entries(CARDS))('%s: Kira\'s player rolls it once, as Kira — the GM\'s later press finds it claimed', async (_name, card) => {
    const id = await card.post();
    await press('pl-1', id, card.selector);
    const [post] = forced(card.moveId);
    expect(post, 'the forced move was posted').toBeTruthy();
    expect(post.speaker?.actor).toBe('pc-kira');
    expect(post.flags[MODULE_ID]).toMatchObject({ bypassPacing: true, deferWhileBusy: true });
    expect(flags(id)[card.claim]).toBe(true);

    await press('gm-1', id, card.selector);
    expect(forced(card.moveId)).toHaveLength(1);
  }, 30_000);

  it.each(Object.entries(CARDS))('%s: a GM may press it, and it rolls as Kira (issue #329 X05)', async (_name, card) => {
    const id = await card.post();
    await press('gm-1', id, card.selector);
    expect(asPc(card.moveId, 'pc-kira')).toHaveLength(1);
    expect(forced(card.moveId)).toHaveLength(1);
  }, 30_000);

  it('the forced moves carry the card\'s fight, expedition and vow', async () => {
    await press('pl-1', await CARDS.tda.post(), CARDS.tda.selector);
    await press('pl-1', await CARDS.finish.post(), CARDS.finish.selector);
    await press('pl-1', await CARDS.swear.post({ linkedConnection: 'Sable' }), CARDS.swear.selector);
    expect(forced('take_decisive_action')[0].flags[MODULE_ID]).toMatchObject({ forcedMoveTargetId: 'fight-1', forcedMoveTarget: 'Corsairs' });
    expect(forced('finish_an_expedition')[0].flags[MODULE_ID]).toMatchObject({ forcedMoveTargetId: 'exp-1', forcedMoveTarget: 'The Drift' });
    expect(forced('swear_an_iron_vow')[0].flags[MODULE_ID]).toMatchObject({ forcedMoveTarget: 'Find Chen', swearToConnection: 'Sable' });
  }, 30_000);

  it('an older card that names no roller rolls for the presser\'s own PC', async () => {
    const id = await CARDS.tda.post({ actorId: null });
    await press('pl-2', id, CARDS.tda.selector);
    expect(asPc('take_decisive_action', 'pc-ren')).toHaveLength(1);
  }, 30_000);

  it('a new-vow card whose holder is named only by its vow is the holder\'s to press', async () => {
    const id = await CARDS.swear.post({ actorId: null });
    await press('pl-2', id, CARDS.swear.selector);
    expect(forced('swear_an_iron_vow')).toHaveLength(0);              // Ren's player: refused
    await press('pl-1', id, CARDS.swear.selector);
    expect(asPc('swear_an_iron_vow', 'pc-kira')).toHaveLength(1);     // Kira holds vow-kira
  }, 30_000);

  it('control: the relayed 🏁 Attempt to Fulfill Vow on Kira\'s card refuses Ren\'s player', async () => {
    const id = await gmPosts({
      content: `<div class="sf-move-result"><div class="sf-milestone-suggest-row">`
        + `<button type="button" class="sf-followup-btn" data-action="sf-attempt-fulfill-vow">🏁 Attempt to Fulfill Vow</button></div></div>`,
      flags: { [MODULE_ID]: { moveResolution: true, resolutionId: 'res-2', actorId: 'pc-kira',
        milestoneSuggestion: { eligible: true, vowCount: 1, vowItemId: 'vow-kira' } } },
    });
    await press('pl-2', id, '[data-action="sf-attempt-fulfill-vow"]');
    expect(forced('fulfill_your_vow')).toHaveLength(0);
    expect(flags(id).fulfilAttempted ?? false).toBe(false);
  }, 30_000);
});
