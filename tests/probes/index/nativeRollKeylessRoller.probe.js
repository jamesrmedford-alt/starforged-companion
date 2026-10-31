/**
 * PROBE — NATIVE-ROLL-NARRATES-ON-KEYLESS-ROLLER
 *
 * registerNativeProgressRollHook (src/index.js ~2233) narrates a vow /
 * connection progress roll made on the foundry-ironsworn sheet on the
 * ROLLER's client only (`isRoller = authorId === game.user.id`), whatever
 * keys the table holds. decisions.md → "Claude calls run where a key lives,
 * exactly once" makes every Claude-call job run on the keyed canonical GM
 * when one is active, the author's own key only as the no-keyed-GM fallback
 * (RUN_ON.CLAUDE, requestOracleNarration). At the usual table — the GM holds
 * the key, the players do not — a player's sheet-rolled Fulfill Your Vow
 * reaches narrateResolution on the keyless player's client, which posts the
 * "Narration unavailable — check your API key" fallback card; the keyed GM
 * never narrates it.
 *
 * Correct behaviour (asserted): the roll is narrated once, by the keyed GM,
 * and no fallback card is posted.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;

function nativeProgressCard({ source, value, dice }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId: 'pc-1' }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: true } } } });
  table.addActor({
    id: 'pc-1', name: 'Kira', type: 'character', hasPlayerOwner: true,
    ownership: { 'pl-1': 3 },
    items: { contents: [
      { id: 'vow-1', type: 'progress', name: 'Find Chen', system: { subtype: 'vow', rank: 'dangerous', current: 4 }, flags: {} },
    ] },
  });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');   // the GM holds the key; the player does not
  silenceConsoleErrors();   // the keyless client warns "Claude API key not configured"
});

describe('PROBE NATIVE-ROLL-NARRATES-ON-KEYLESS-ROLLER', () => {
  it("a keyless player's sheet-rolled vow is narrated by the keyed GM", async () => {
    // A miss — no payoff on the GM side; only the narration routing is exercised.
    await table.client('pl-1').run(() => globalThis.ChatMessage.create({
      content: nativeProgressCard({ source: 'Find Chen', value: 1, dice: [5, 8] }),
      speaker: { actor: 'pc-1', alias: 'Kira' },
      rolls: [{ formula: '{d10,d10}', total: 0 }],
    }));
    await table.settle();

    // Expected: one narration Claude call, on the keyed GM's key.
    expect(table.claude.calls.map(c => [c.client, c.apiKey])).toEqual([['gm-1', 'sk-ant-gina']]);
    // Expected: no "Narration unavailable — check your API key" card.
    expect(table.cards(f => f.narrationFallback).map(c => c.author)).toEqual([]);
    expect(table.cards(f => f.narratorCard && f.moveId === 'fulfill_your_vow' && !f.narrationFallback)).toHaveLength(1);
  }, 30_000);
});
