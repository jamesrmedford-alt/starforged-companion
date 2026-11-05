/**
 * Issue #336 Y24 — CLAIM-AFTER-EFFECT-REFUSED-STAMP.
 *
 * Three one-shot handlers applied their effect FIRST and stamped the card
 * afterwards, swallowing the stamp's refusal: applyConnectionPick posted the
 * forced Develop / Forge then `resolved`; applyMilestonePick marked the vow
 * then `resolved`; applyFightVowAction marked the won fight's milestone then
 * `resolvedActions.markMilestone`. When the world refused that one update
 * (the fault matrix's refused write, issue #302) the card stayed live, and
 * the next press applied the effect again. Every other handler here claims
 * the GM-authored card before its effect (rules/reachability.md §8;
 * decisions #309 "claims before effects", #329 X07): the picker cards now
 * do too — a refused claim applies nothing, the press is the retry, and an
 * effect that fails releases the claim. The won-fight card keeps its effect
 * first (issue #306 R04: a mark that did not land leaves its button live, the
 * press its retry), so its mark is recorded per card on the vow's payoff
 * ledger, as 🤝 Deepen's is: a re-press after a refused stamp marks nothing.
 *
 * Control: the 🏁 Attempt to Fulfill (fulfilVow.attempt), which claims first.
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
import { scriptClaude, failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, vowA, vowB;

function makeVow(id, name, vowId) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId } },
    system: { subtype: 'vow', rank: 'dangerous', current: 0, completed: false },
    refuseUpdate: false,
    async update(changes) {
      if (item.refuseUpdate) throw new Error('the server refused the write');
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

const gmPosts = (data) => table.client('gm-1').run(() => globalThis.ChatMessage.create(data)).then(async (m) => { await table.settle(); return m.id; });
const flags   = (id) => table.world.message(id).flags[MODULE_ID];

async function press(userId, id, selector) {
  table.client(userId).click(id, selector);
  await table.settle(); await table.drain();
}

/** Refuse the next update of card `id` — the handler's claim (or, for the fight card, its stamp). */
const refuseStampOf = (id) => failWrites(table, (w) => w.kind === 'message.update' && w.id === id);

const postConnectionPicker = () => gmPosts({
  content: `<div class="sf-ptp-card"><strong>🤝 Develop Relationship</strong><p>Which connection?</p><div class="sf-milestone-picker">`
    + `<button type="button" class="sf-followup-btn" data-action="sf-connection-pick" data-host-id="npc-sable" data-pick-action="develop" data-connection-name="Sable">Sable</button></div></div>`,
  flags: { [MODULE_ID]: { connectionPicker: true, pickAction: 'develop', resolved: false, choices: [{ hostId: 'npc-sable', name: 'Sable' }] } },
});

const postMilestonePicker = () => gmPosts({
  content: `<div class="sf-ptp-card"><strong>⚑ Reach a Milestone</strong><p>Which vow advances?</p><div class="sf-milestone-picker">`
    + `<button type="button" class="sf-followup-btn" data-action="sf-milestone-pick" data-vow-id="vow-a" data-actor-id="pc-kira">Find Chen</button>`
    + `<button type="button" class="sf-followup-btn" data-action="sf-milestone-pick" data-vow-id="vow-b" data-actor-id="pc-kira">Repay the Syndicate</button></div></div>`,
  flags: { [MODULE_ID]: { milestonePicker: true, resolved: false,
    choices: [{ vowId: 'vow-a', actorId: 'pc-kira', marks: 1 }, { vowId: 'vow-b', actorId: 'pc-kira', marks: 1 }] } },
});

const postFightCard = () => gmPosts({
  content: `<div class="sf-card sf-fight-vow"><div class="sf-card-body"><p>You won the fight serving “Find Chen”.</p>`
    + `<p><button type="button" class="entity-btn" data-action="sf-mark-milestone">⚑ Mark milestone (×1)</button> `
    + `<button type="button" class="entity-btn" data-action="sf-fulfill-vow">🏁 Attempt to Fulfill</button></p></div></div>`,
  flags: { [MODULE_ID]: { fightVowCard: true, vowName: 'Find Chen', vowId: 'vid-a', marks: 1, connectionName: null, vowRank: 'dangerous', actorId: 'pc-kira' } },
});

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'cs-s1', sessionNumber: 1,
      currentSceneId: 'cs-scene', sceneTruths: [], clocks: [], connectionIds: ['npc-sable'] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  vowA = makeVow('vow-a', 'Find Chen', 'vid-a');
  vowB = makeVow('vow-b', 'Repay the Syndicate', 'vid-b');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, hasPlayerOwner: true, items: { contents: [vowA, vowB] } });
  table.addActor({ id: 'npc-sable', name: 'Sable', type: 'character', flags: { [MODULE_ID]: {
    entityType: 'connection', connection: {
      _id: 'conn-sable', name: 'Sable', rank: 'dangerous', relationshipTicks: 0, bonded: false, active: true, history: [],
    } } } });
  scriptClaude(table, { fallback: () => 'The talk turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe('issue #336 Y24 — a one-shot card whose one update the world refused', () => {
  it('"Which connection?": a refused claim rolls nothing; the next press rolls Develop Your Relationship once', async () => {
    const id = await postConnectionPicker();
    const refused = refuseStampOf(id);

    await press('pl-1', id, '[data-action="sf-connection-pick"]');
    expect(refused.refused, 'sanity: the claim was refused once').toBe(1);
    expect(table.cards(f => f.forcedMoveId === 'develop_your_relationship')).toHaveLength(0);

    await press('gm-1', id, '[data-action="sf-connection-pick"]');
    expect(table.cards(f => f.forcedMoveId === 'develop_your_relationship')).toHaveLength(1);
    expect(flags(id).resolved).toBe(true);
  }, 30_000);

  it('"⚑ Reach a Milestone — which vow?": a refused claim marks nothing; the next press marks once', async () => {
    const id = await postMilestonePicker();
    const refused = refuseStampOf(id);

    await press('pl-1', id, '[data-action="sf-milestone-pick"]');
    expect(refused.refused, 'sanity: the claim was refused once').toBe(1);
    expect(vowA.system.current).toBe(0);

    await press('gm-1', id, '[data-action="sf-milestone-pick"]');
    expect(vowA.system.current).toBe(8);                                 // one milestone, dangerous
    expect(table.cards(f => f.reachMilestoneCard)).toHaveLength(1);
    expect(flags(id).resolved).toBe(true);
  }, 30_000);

  it('"⚑ Reach a Milestone — which vow?": a mark the world refused releases the claim, so the pick can be made again', async () => {
    const id = await postMilestonePicker();
    vowA.refuseUpdate = true;
    await press('pl-1', id, '[data-action="sf-milestone-pick"]');
    expect(vowA.system.current).toBe(0);
    expect(flags(id).resolved).toBe(false);
    expect(table.cards(f => f.reachMilestoneCard)).toHaveLength(0);

    vowA.refuseUpdate = false;
    await press('pl-1', id, '[data-action="sf-milestone-pick"]');
    expect(vowA.system.current).toBe(8);
    expect(flags(id).resolved).toBe(true);
  }, 30_000);

  it('the won-fight card\'s "⚑ Mark milestone": a re-press after a refused stamp marks nothing, and closes the card', async () => {
    const id = await postFightCard();
    const refused = refuseStampOf(id);

    await press('pl-1', id, '[data-action="sf-mark-milestone"]');
    expect(refused.refused, 'sanity: the resolvedActions stamp was refused once').toBe(1);
    expect(vowA.system.current).toBe(8);                                 // the mark landed (effect first, R04)
    expect(vowA.flags[MODULE_ID].fulfilPayoff?.[`milestone:${id}`]).toBe(true);

    await press('gm-1', id, '[data-action="sf-mark-milestone"]');
    expect(vowA.system.current).toBe(8);
    expect(flags(id).resolvedActions?.markMilestone).toBe(true);
  }, 30_000);

  it('a second won fight\'s card for the same vow still marks its own milestone', async () => {
    await press('pl-1', await postFightCard(), '[data-action="sf-mark-milestone"]');
    await press('pl-1', await postFightCard(), '[data-action="sf-mark-milestone"]');
    expect(vowA.system.current).toBe(16);
  }, 30_000);

  it('control: the 🏁 Attempt to Fulfill claims first — a refused claim posts no move', async () => {
    const id = await gmPosts({
      content: `<div class="sf-card sf-fight-vow"><div class="sf-card-body">`
        + `<p><button type="button" class="entity-btn" data-action="sf-fulfill-vow">🏁 Attempt to Fulfill</button></p></div></div>`,
      flags: { [MODULE_ID]: { fightVowCard: true, vowName: 'Find Chen', vowId: 'vid-a', marks: 1, connectionName: null, vowRank: 'dangerous', actorId: 'pc-kira' } },
    });
    const refused = refuseStampOf(id);

    await press('pl-1', id, '[data-action="sf-fulfill-vow"]');
    expect(refused.refused).toBe(1);
    expect(table.cards(f => f.forcedMoveId === 'fulfill_your_vow')).toHaveLength(0);

    await press('gm-1', id, '[data-action="sf-fulfill-vow"]');      // the press is the retry: claimed, posted once
    expect(table.cards(f => f.forcedMoveId === 'fulfill_your_vow')).toHaveLength(1);
  }, 30_000);
});
