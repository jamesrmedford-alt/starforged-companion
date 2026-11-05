/**
 * PROBE — CARDS-03 CLAIM-AFTER-EFFECT-REFUSED-STAMP (tenth audit, area cards)
 *
 * What the user does: a one-shot card button is pressed on one client and,
 * a moment later, on another (or again after a re-render): the "Which
 * connection?" picker (🤝 Develop), the "⚑ Reach a Milestone — which vow?"
 * picker, and the won-fight card's "⚑ Mark milestone". The world refuses
 * the GM's one update of the card (a server error, a dropped socket — the
 * fault the fault matrix drives, issue #302).
 *
 * What happens: these three handlers apply their effect FIRST and stamp the
 * card afterwards — applyConnectionPick posts the forced Develop / Forge
 * then `resolved` (src/moves/cardActions.js), applyMilestonePick marks the
 * vow then `resolved` (src/moves/milestonePicker.js), applyFightVowAction
 * marks then `resolvedActions.markMilestone` (cardActions.js) — and each
 * swallows the stamp's refusal into a console.warn. The card stays live on
 * every client (relayCardAction re-arms the button after 15 s / at once on
 * the GM), so the next press applies the effect AGAIN: a second Develop
 * Your Relationship is rolled, the vow takes a second milestone, the fight's
 * milestone is marked twice.
 *
 * What should happen: one effect per card. Every other handler in this
 * area claims the GM-authored card BEFORE its effect, so a refused claim
 * applies nothing and the press is the retry (rules/reachability.md §8:
 * "idempotent on the GM (in-flight guard + a resolved stamp)"; decisions
 * #309 "claims before effects" / #329 X07). The milestone and fight marks
 * have no ledger to fall back on (the 🤝 Deepen does: fulfilPayoff.deepen).
 *
 * Control: the 🏁 Attempt to Fulfill (fulfilVow.attempt), which claims
 * first — a refused claim posts no move.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/claimAfterEffectRefusedStamp.probe.js
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
import { scriptClaude, failWrites } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, vowA, vowB;

function makeVow(id, name, vowId) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId } },
    system: { subtype: 'vow', rank: 'dangerous', current: 0, completed: false },
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

const gmPosts = (data) => table.client('gm-1').run(() => globalThis.ChatMessage.create(data)).then(async (m) => { await table.settle(); return m.id; });

async function press(userId, id, selector) {
  table.client(userId).click(id, selector);
  await table.settle(); await table.drain();
}

/** Refuse the next update of card `id` — the handler's stamp. */
const refuseStampOf = (id) => failWrites(table, (w) => w.kind === 'message.update' && w.id === id);

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

describe('CARDS-03 a one-shot card whose stamp the world refused after its effect', () => {
  it('"Which connection?" — a second press after the refused stamp rolls Develop Your Relationship again', async () => {
    const id = await gmPosts({
      content: `<div class="sf-ptp-card"><strong>🤝 Develop Relationship</strong><p>Which connection?</p><div class="sf-milestone-picker">`
        + `<button type="button" class="sf-followup-btn" data-action="sf-connection-pick" data-host-id="npc-sable" data-pick-action="develop" data-connection-name="Sable">Sable</button></div></div>`,
      flags: { [MODULE_ID]: { connectionPicker: true, pickAction: 'develop', resolved: false, choices: [{ hostId: 'npc-sable', name: 'Sable' }] } },
    });
    const refused = refuseStampOf(id);

    await press('pl-1', id, '[data-action="sf-connection-pick"]');
    expect(refused.refused, 'sanity: the resolved stamp was refused once').toBe(1);
    await press('gm-1', id, '[data-action="sf-connection-pick"]');

    // Expected: one forced Develop per picker. Actual: two — the effect ran before the (refused) claim.
    expect(table.cards(f => f.forcedMoveId === 'develop_your_relationship')).toHaveLength(1);
  }, 30_000);

  it('"⚑ Reach a Milestone — which vow?" — a second press after the refused stamp marks the vow again', async () => {
    const id = await gmPosts({
      content: `<div class="sf-ptp-card"><strong>⚑ Reach a Milestone</strong><p>Which vow advances?</p><div class="sf-milestone-picker">`
        + `<button type="button" class="sf-followup-btn" data-action="sf-milestone-pick" data-vow-id="vow-a" data-actor-id="pc-kira">Find Chen</button>`
        + `<button type="button" class="sf-followup-btn" data-action="sf-milestone-pick" data-vow-id="vow-b" data-actor-id="pc-kira">Repay the Syndicate</button></div></div>`,
      flags: { [MODULE_ID]: { milestonePicker: true, resolved: false,
        choices: [{ vowId: 'vow-a', actorId: 'pc-kira', marks: 1 }, { vowId: 'vow-b', actorId: 'pc-kira', marks: 1 }] } },
    });
    const refused = refuseStampOf(id);

    await press('pl-1', id, '[data-action="sf-milestone-pick"]');
    expect(refused.refused, 'sanity: the resolved stamp was refused once').toBe(1);
    await press('gm-1', id, '[data-action="sf-milestone-pick"]');

    // Expected: one milestone (8 ticks, dangerous). Actual: 16 — marked twice.
    expect(vowA.system.current).toBe(8);
    expect.soft(table.cards(f => f.reachMilestoneCard)).toHaveLength(1);
  }, 30_000);

  it('the won-fight card\'s "⚑ Mark milestone" — a second press after the refused stamp marks it again', async () => {
    const id = await gmPosts({
      content: `<div class="sf-card sf-fight-vow"><div class="sf-card-body"><p>You won the fight serving “Find Chen”.</p>`
        + `<p><button type="button" class="entity-btn" data-action="sf-mark-milestone">⚑ Mark milestone (×1)</button> `
        + `<button type="button" class="entity-btn" data-action="sf-fulfill-vow">🏁 Attempt to Fulfill</button></p></div></div>`,
      flags: { [MODULE_ID]: { fightVowCard: true, vowName: 'Find Chen', vowId: 'vid-a', marks: 1, connectionName: null, vowRank: 'dangerous', actorId: 'pc-kira' } },
    });
    const refused = refuseStampOf(id);

    await press('pl-1', id, '[data-action="sf-mark-milestone"]');
    expect(refused.refused, 'sanity: the resolvedActions stamp was refused once').toBe(1);
    await press('gm-1', id, '[data-action="sf-mark-milestone"]');

    expect(vowA.system.current).toBe(8);
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
