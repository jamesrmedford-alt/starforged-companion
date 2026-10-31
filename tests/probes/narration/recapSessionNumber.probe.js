// tests/probes/narration/recapSessionNumber.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// RECAP-SESSION-N-DEAD: the help's Chat Commands page documents
// "!recap session 3 — Post a recap of a specific past session by number".
// handleRecapCommand (src/index.js) matches /^!recap\s+session(?:\s+(\d+))?/
// but never reads the captured number — it calls postSessionRecap(campaignState,
// null) — and postSessionRecap (src/narration/narrator.js) takes only a session
// id, defaulting to the current one, and titles the card with the CURRENT
// session number. `!recap session 2` posts "Session 3" with session 3's moves.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
});

/** A move-narration card as postNarrationCard stamps it, for the given session. */
function narratorCard(sessionId, sessionNumber, moveId, text) {
  return {
    content: `<div class="sf-narration-card"><div class="sf-narration-prose">${text}</div></div>`,
    flags: { [MODULE_ID]: {
      narratorCard: true, narrationText: text, sessionId, sessionNumber, moveId, outcome: 'strong_hit', isMatch: false,
    } },
  };
}

describe('!recap session N recaps session N', () => {
  it('"!recap session 2" during session 3 recaps session 2', async () => {
    const gm = table.client('gm-1');
    await gm.run(() => ChatMessage.create(narratorCard('sess-2', 2, 'gather_information', 'The relay finally answered.')));
    await gm.run(() => ChatMessage.create(narratorCard('sess-3', 3, 'face_danger', 'You clear the debris field.')));
    await table.settle();

    await gm.chat('!recap session 2');
    await table.settle();

    const recap = table.cards(f => f.recapCard && f.recapType === 'session').at(-1);
    expect(recap).toBeDefined();
    expect(recap.content).toContain('Session 2');
    expect(recap.content).toContain('Gather Information');
    expect(recap.content).not.toContain('Face Danger');
  });
});
