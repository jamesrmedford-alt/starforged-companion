// tests/probes/narration/nativeRollOutcomeMissing.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NR RENARRATE-NO-OUTCOME (native-roll half) — a vow progress roll made on the
// foundry-ironsworn sheet is narrated without its move or its outcome.
//
// What the user does: a player rolls their vow's progress on the system
// character sheet (Fulfill Your Vow); it is a miss (progress 1 vs 5, 8).
//
// What happens: registerNativeProgressRollHook (src/index.js) builds a
// resolution by hand — moveName "Fulfill Your Vow", outcome "miss",
// outcomeLabel "Miss" — and hands it to narrateResolution. The narrator's user
// message is built by buildNarratorUserMessage (src/narration/narratorPrompt.js),
// which renders the move and outcome only from `resolution.loremasterContext`
// — which the hook never sets. The request carries "Resolving: Find Chen" as
// the PC's spoken line and "Narrate the consequence…", nothing else about the
// roll: the narrator has to guess whether the vow was fulfilled. (The same line
// is stored as the card's playerText, so the ring later quotes Kira as having
// written "Resolving: Find Chen".)
//
// What should happen: the request names the move and the outcome the sheet
// rolled (Fulfill Your Vow → Miss), as a pipeline move's MOVE OUTCOME does.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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
