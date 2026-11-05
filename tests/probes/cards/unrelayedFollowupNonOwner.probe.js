/**
 * PROBE — CARDS-05 UNRELAYED-FOLLOWUP-NONOWNER (tenth audit, area cards — needs a decision)
 *
 * What the user does: at a two-PC table (Kira, Ren) Ren's player presses a
 * follow-up on KIRA's card — "⚔ Attempt to Finish the Fight" on her Strike
 * card, "🗺 Finish the Expedition" on her expedition card, or "⚔ Swear it
 * (roll)" on her "🆕 New vow recorded" card.
 *
 * What happens: these buttons are not relayed; since issue #329 X05 they
 * post the forced move from the presser's client speaking as the card's
 * roller (cardRollerSpeaker / buildSwearMovePostForName's actorId), with no
 * ownership check, and the pipeline credits the speaker (resolveSpeakerActorId
 * honours any PC speaker). So Ren's player rolls Kira's Take Decisive Action —
 * her position, her +1 momentum, a Pay the Price on HER on a miss — or her
 * Fulfill-grade progress roll, or swears her vow (her momentum, her oath
 * scene). The relayed siblings of the same cycle refuse a non-owner
 * (fulfilVow.attempt, milestone.suggestion, waypoint.oracle, fulfilVow.pick:
 * "only the roller's player or a GM may press it").
 *
 * What should happen (recommended, option A): a follow-up on another
 * player's card is theirs or a GM's to press — relay these through
 * GM_ACTIONS with the ownership check (which also gives them a claim, closing
 * WHICH-FIGHT-LOCAL-DISABLE's shape for the three). Option B: keep "whoever
 * presses" (the paced Roll's W09 precedent) and say so in the help.
 *
 * Control: the relayed 🏁 on Kira's move card refuses Ren's player.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/unrelayedFollowupNonOwner.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
const asKira = (moveId) => table.cards(f => f.forcedMoveId === moveId).filter((m) => m.speaker?.actor === 'pc-kira');

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

describe('CARDS-05 Ren\'s player presses a follow-up on Kira\'s card', () => {
  it('"⚔ Attempt to Finish the Fight" on Kira\'s Strike card does not roll Kira\'s Take Decisive Action for her', async () => {
    const id = await gmPosts({
      content: `<div class="sf-move-result"><div class="sf-move-name">Strike</div>`
        + `<button type="button" class="sf-followup-btn" data-action="sf-take-decisive-action">⚔ Attempt to Finish the Fight</button></div>`,
      flags: { [MODULE_ID]: { moveResolution: true, combatMoveCard: true, resolutionId: 'res-1', actorId: 'pc-kira',
        combatTrackId: 'fight-1', combatTrackLabel: 'Corsairs' } },
    });
    await press('pl-2', id, '[data-action="sf-take-decisive-action"]');
    // Expected (A): refused — nothing rolled as Kira by another player. Actual: Kira's TDA posted by pl-2.
    expect(asKira('take_decisive_action')).toHaveLength(0);
  }, 30_000);

  it('"🗺 Finish the Expedition" on Kira\'s expedition card does not roll it as Kira', async () => {
    const id = await gmPosts({
      content: `<div class="sf-ptp-card"><strong>Expedition</strong><div class="sf-milestone-suggest-row">`
        + `<button type="button" class="sf-followup-btn" data-action="sf-finish-expedition">🗺 Finish the Expedition</button></div></div>`,
      flags: { [MODULE_ID]: { expeditionProgressCard: true, created: true, trackLabel: 'The Drift', trackId: 'exp-1', actorId: 'pc-kira' } },
    });
    await press('pl-2', id, '[data-action="sf-finish-expedition"]');
    expect(asKira('finish_an_expedition')).toHaveLength(0);
  }, 30_000);

  it('"⚔ Swear it (roll)" on Kira\'s new-vow card does not swear her vow as Kira', async () => {
    const id = await gmPosts({
      content: `<div class="sf-card sf-player-vow"><div class="sf-card-body">`
        + `<p><button type="button" class="entity-btn" data-action="sf-player-vow-swear">⚔ Swear it (roll)</button></p></div></div>`,
      flags: { [MODULE_ID]: { playerVowCard: true, vowName: 'Find Chen', vowId: 'vow-kira', actorId: 'pc-kira' } },
    });
    await press('pl-2', id, '[data-action="sf-player-vow-swear"]');
    expect(asKira('swear_an_iron_vow')).toHaveLength(0);
  }, 30_000);

  it('control: the relayed 🏁 Attempt to Fulfill Vow on Kira\'s card refuses Ren\'s player', async () => {
    const id = await gmPosts({
      content: `<div class="sf-move-result"><div class="sf-milestone-suggest-row">`
        + `<button type="button" class="sf-followup-btn" data-action="sf-attempt-fulfill-vow">🏁 Attempt to Fulfill Vow</button></div></div>`,
      flags: { [MODULE_ID]: { moveResolution: true, resolutionId: 'res-2', actorId: 'pc-kira',
        milestoneSuggestion: { eligible: true, vowCount: 1, vowItemId: 'vow-kira' } } },
    });
    await press('pl-2', id, '[data-action="sf-attempt-fulfill-vow"]');
    expect(asKira('fulfill_your_vow')).toHaveLength(0);
    expect(table.world.message(id).flags[MODULE_ID].fulfilAttempted ?? false).toBe(false);
  }, 30_000);
});
