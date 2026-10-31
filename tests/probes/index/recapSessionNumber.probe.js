/**
 * PROBE — RECAP-SESSION-N-IGNORED
 *
 * The help journal's Chat Commands page documents
 *   "!recap session 3 — Post a recap of a specific past session by number."
 * handleRecapCommand (src/index.js ~693) matches /^!recap\s+session(?:\s+(\d+))?/
 * but discards the captured number and calls postSessionRecap(campaignState,
 * null), which recaps the CURRENT session (targetId = currentSessionId, label
 * "Session <current number>"). Narrator cards carry both sessionId and
 * sessionNumber, so the asked-for session is findable.
 *
 * Correct behaviour (asserted): `!recap session 3` recaps session 3's moves.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({
    world: { settings: {
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-4', sessionNumber: 4 },
      recapGmOnly: false,
    } },
  });
  const gm = table.client('gm-1');
  const card = (sessionId, sessionNumber, moveId, text) => gm.run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-narration-card">${text}</div>`,
    flags: { [MODULE_ID]: {
      narratorCard: true, narrationCard: true, narrationText: text,
      sessionId, sessionNumber, moveId, outcome: 'strong_hit',
    } },
  }));
  await card('sess-3', 3, 'face_danger', 'The airlock seals behind you.');
  await card('sess-4', 4, 'gather_information', 'The logs name the courier.');
  await table.settle();
});

describe('PROBE RECAP-SESSION-N-IGNORED', () => {
  it('!recap session 3 recaps session 3, not the current session', async () => {
    await table.client('gm-1').chat('!recap session 3');
    await table.settle();
    const recaps = table.cards(f => f.recapCard && f.recapType === 'session');
    expect(recaps).toHaveLength(1);
    // Expected: session 3's move. Actual: the current session's (4).
    expect(recaps[0].flags[MODULE_ID].sessionNumber).toBe(3);
    expect(recaps[0].content).toContain('Face Danger');
    expect(recaps[0].content).not.toContain('Gather Information');
  }, 30_000);
});
