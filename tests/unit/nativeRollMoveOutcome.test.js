// tests/unit/nativeRollMoveOutcome.test.js
//
// A progress move rolled on the foundry-ironsworn sheet is narrated knowing
// the move and its outcome (issue #325 W20): the native-roll hook built its
// resolution by hand with no `loremasterContext`, so a sheet-rolled Fulfill
// Your Vow was narrated from "Resolving: Find Chen" alone.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;

function nativeProgressCard({ source, value, dice, actorId = 'pc-1' }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId, moveDsId: 'Starforged/Moves/Quest/Fulfill_Your_Vow' }, rawChallengeDiceValues: dice };
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
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
});

describe('a sheet-rolled vow is narrated knowing how the roll came out', () => {
  it("the narrator's request names the move and the outcome the sheet rolled", async () => {
    await table.client('pl-1').run(() => globalThis.ChatMessage.create({
      content: nativeProgressCard({ source: 'Find Chen', value: 1, dice: [5, 8] }),
      speaker: { actor: 'pc-1', alias: 'Kira' },
      rolls: [{ formula: '{d10,d10}', total: 0 }],
    }));
    await table.settle();

    const [call] = table.claude.by('gm-1');
    expect(call).toBeDefined();
    expect(call.userText).toMatch(/fulfill your vow/i);
    expect(call.userText).toMatch(/\bmiss\b/i);
  }, 30_000);
});
