/**
 * PROBE — IC VOW-DEEPEN-TWICE
 *
 * What the user does: wins a fight serving a vow sworn for a connection
 * ("Free Sable's crew", linked to Sable). The victory card offers "🤝 Deepen
 * your bond with Sable" (postFightVowMilestoneCard); the player presses it.
 * Later the vow is fulfilled (sheet or pipeline).
 *
 * What happens: the victory card's deepen (cardActions
 * applyFightVowDeepenBond → deepenLinkedConnection(name,
 * marksForSourceRank(vowRank))) is the vow→connection deepen — scaled by the
 * VOW's rank, the fulfilment's own scaling (decisions.md #241, "vow →
 * connection = (vow rank → marks, connection rank → ticks)"). The fulfilment's
 * payoff (payFulfilledVowCopies, #248 B2) deepens the same connection again by
 * the same marks: its `fulfilPayoff.deepen` ledger knows nothing of the card's
 * press. The promised reward, by contrast, is claimed once across the fight
 * and the fulfilment (its status flips). One vow, two deepens: Sable's
 * relationship track jumps twice.
 *
 * What should happen: "a vow undertaken for a connection deepens that
 * connection" once (decisions.md #241; help: "A hard vow fulfilled for someone
 * deepens your bond with them") — the card's press recorded on the vow so the
 * fulfilment skips it, or the card's deepen retired.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, sable, vow;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, connectionIds: ['conn-sable'] },
  } } });
  vow = {
    id: 'v-crew', name: "Free Sable's crew", type: 'progress',
    system: { subtype: 'vow', rank: 'formidable', current: 40, completed: false },
    flags: { [MODULE_ID]: { vowId: 'vid-crew', linkedConnectionName: 'Sable' } },
    update: async (changes) => { if ('system.completed' in changes) vow.system.completed = changes['system.completed']; },
    setFlag: async (mod, key, val) => { (vow.flags[mod] ??= {})[key] = val; },
  };
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
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
});

const ticks = () => sable.flags[MODULE_ID].connection.relationshipTicks;

describe('PROBE IC VOW-DEEPEN-TWICE', () => {
  it('the victory card\'s deepen, then the vow\'s fulfilment, deepen Sable once', async () => {
    const gm = table.client('gm-1');
    const { postFightVowMilestoneCard, payFulfilledVowNative } = await gm.import('../../src/index.js');
    await gm.run(() => postFightVowMilestoneCard("Free Sable's crew", 2, 'pc-kira'));
    await table.settle();
    const [victory] = table.cards(f => f.fightVowCard);
    expect(victory.flags[MODULE_ID].connectionName).toBe('Sable');

    table.client('pl-1').click(victory._id, '[data-action="sf-deepen-bond"]');
    await table.settle(); await table.drain();
    expect(ticks()).toBe(16);          // Formidable vow → 2 marks × 8 ticks (Sable is Dangerous)

    // The vow is fulfilled (the native consequence hook's payoff; the pipeline pays the same deepen).
    await gm.run(() => payFulfilledVowNative("Free Sable's crew", 'strong_hit', { actorId: 'pc-kira' }));
    await table.settle(); await table.drain();

    // Expected: still 16. Today: 32 — the fulfilment deepens again.
    expect(ticks()).toBe(16);
  }, 30_000);
});
