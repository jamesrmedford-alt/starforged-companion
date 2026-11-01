/**
 * A vow or connection progress roll made on the foundry-ironsworn sheet is
 * narrated once, where a Claude key lives, as the roller (issue #321 U11).
 *
 * registerNativeProgressRollHook (src/index.js) used to narrate on the
 * ROLLER's client whatever keys the table held. At the usual table — the GM
 * holds the key, the players do not — a player's sheet-rolled Fulfill Your
 * Vow reached narrateResolution on the keyless player's client, which posted
 * the "Narration unavailable — check your API key" card; the keyed GM never
 * narrated it. It now takes the keyed-runner ladder of RUN_ON.CLAUDE /
 * requestOracleNarration (decisions.md "Claude calls run where a key lives,
 * exactly once"): the keyed canonical GM when one is connected, else the
 * roller with their own key — and the narration's CHARACTER is the roller's
 * PC, not the narrating client's first PC.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;

function nativeProgressCard({ source, value, dice, actorId = 'pc-1' }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}

/** The player rolls a vow on their sheet — a miss, so no payoff runs on the GM. */
async function playerRollsVow({ source = 'Find Chen', actorId = 'pc-1', alias = 'Kira' } = {}) {
  await table.client('pl-1').run(() => globalThis.ChatMessage.create({
    content: nativeProgressCard({ source, value: 1, dice: [5, 8], actorId }),
    speaker: { actor: actorId, alias },
    rolls: [{ formula: '{d10,d10}', total: 0 }],
  }));
  await table.settle();
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
  silenceConsoleErrors();   // a keyless client warns "Claude API key not configured"
});

describe("a sheet-rolled vow is narrated where a key lives", () => {
  it("a keyless player's roll is narrated once by the keyed GM, with no fallback card", async () => {
    await table.setClaudeKey('gm-1', 'sk-ant-gina');   // the GM holds the key; the player does not
    await playerRollsVow();

    expect(table.claude.calls.map(c => [c.client, c.apiKey])).toEqual([['gm-1', 'sk-ant-gina']]);
    expect(table.cards(f => f.narrationFallback).map(c => c.author)).toEqual([]);
    expect(table.cards(f => f.narratorCard && f.moveId === 'fulfill_your_vow' && !f.narrationFallback)).toHaveLength(1);
  }, 30_000);

  it('control: with no keyed GM, a keyed player narrates their own roll on their own key', async () => {
    await table.setClaudeKey('pl-1', 'sk-ant-pat');
    await playerRollsVow();

    expect(table.claude.calls.map(c => [c.client, c.apiKey])).toEqual([['pl-1', 'sk-ant-pat']]);
    expect(table.cards(f => f.narratorCard && f.moveId === 'fulfill_your_vow' && !f.narrationFallback)).toHaveLength(1);
  }, 30_000);

  it("the GM's narration is the roller's: their PC is the narrator's CHARACTER", async () => {
    // The GM's own PC is the campaign's first; the player rolls on Ren's sheet.
    table.addActor({ id: 'pc-2', name: 'Ren', type: 'character', hasPlayerOwner: true, ownership: { 'pl-1': 3 },
      items: { contents: [
        { id: 'vow-2', type: 'progress', name: 'Avenge Ilsa', system: { subtype: 'vow', rank: 'dangerous', current: 4 }, flags: {} },
      ] } });
    table.world.setSetting('campaignState', { ...table.world.getSetting('campaignState'), characterIds: ['pc-1', 'pc-2'] });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    await playerRollsVow({ source: 'Avenge Ilsa', actorId: 'pc-2', alias: 'Ren' });

    const [call] = table.claude.by('gm-1');
    expect(call?.system).toContain('Name: Ren');
    expect(call?.system).not.toContain('Name: Kira');
  }, 30_000);
});
