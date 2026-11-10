/**
 * PROBE R2C — REFLECTION-COUNTS-AS-FIRST-NARRATION (LOSE-PLOT, low)
 * Twelfth audit, round 2, cross-feature compositions (the Private Channel's
 * Publish × the session-start campaign recap). A sibling of issue #321 U35
 * (FALLBACK-IN-RING: "a failed first narration cancelled the campaign
 * recap" — fixed for fallback cards only).
 *
 * The campaign recap reaches "a session's first narration … no narrator card
 * of this session exists yet" (src/narration/narrator.js sessionStartRecap
 * :565-582, the gate at :569 `if (sessionNarratorCards(sessionId).length)
 * return ''`; decisions.md "The campaign recap reaches a session's first
 * narration in any prose mode"). A reflection a player publishes from the
 * Private Channel (src/private-channel/publish.js publishToMainChat :49-97)
 * carries the narrator flag family — `narratorCard: true`, `narrationText`,
 * `sessionId` — so the ring and the rolling summary hold it (decisions.md
 * "a published reflection is canon": "the ring and the rolling summary hold
 * it"). sessionNarratorCards (:1663-1693) excludes fallback, X-carded,
 * superseded and whispered cards, but not a published reflection; so a
 * reflection published before the session's first narration counts as that
 * narration, and the narration that follows is built without the campaign
 * recap. Elsewhere the module says a published reflection is "not a
 * narration" (registerXCardRedirectHook :1866-1879 skips it for that reason).
 *
 * Scenario (booted keyed GM + a player, the real Publish and @scene paths,
 * Claude answered by the harness):
 *   1. A new session has begun; no narration yet; the campaign recap cache is
 *      current.
 *   2. Pat publishes a Private Channel reflection to the table.
 *   3. Pat asks `@scene` — the session's first narration.
 *   Expected: its system prompt opens with the CAMPAIGN RECAP block.
 *   Actual: no recap — the reflection took the "first narration" slot.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const S2 = 'r2c-recap-s2';
const RECAP = 'PREVIOUSLY — the crew fled Bleakhold with the Hegemony on their heels.';
const REPLY = 'The hangar is cold and quiet; frost rimes the loading arms.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// An empty chronicle's recap key (narrator.js chronicleRecapKey over []).
const EMPTY_CHRONICLE_KEY = { chronicleLength: 0, chronicleHash: '811c9dc5' };

let table;
const narrationCalls = () => table.claude.calls.filter(c => /SIDECAR|NARRATOR ROLE/.test(c.system ?? ''));

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoRecapEnabled: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, currentSessionId: S2, sessionNumber: 2, sessionActive: true,
      sessionStartedId: S2, sessionActiveStartedAt: new Date().toISOString(),
      lastSessionTimestamp: new Date().toISOString(),
      currentSceneId: 'r2c-sc', sceneTruths: [],
      campaignRecapCache: { text: RECAP, generatedAt: new Date().toISOString(), ...EMPTY_CHRONICLE_KEY },
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => REPLY });
});

async function patPublishesAReflection() {
  const pat = table.client('pl-1');
  const { publishToMainChat } = await pat.import('../../src/private-channel/publish.js');
  const card = await pat.run(() => publishToMainChat({ userId: 'pl-1', content: 'Kira turns her sister\'s locket over and over, saying nothing.' }));
  await table.settle(); await table.drain();
  expect(card).toBeTruthy();
  expect(table.cards(f => f.publishedReflection)).toHaveLength(1);
}

async function patAsksTheScene() {
  await table.client('pl-1').chat('@scene What does the hangar look like?', { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
  const calls = narrationCalls();
  expect(calls).toHaveLength(1);
  return calls[0];
}

describe('R2C — a published reflection before the session\'s first narration', () => {
  it('control: the session\'s first narration carries the campaign recap', async () => {
    const call = await patAsksTheScene();
    expect(call.system).toContain(`## CAMPAIGN RECAP — SESSION START CONTEXT\n\n${RECAP}`);
  }, 60_000);

  it('a reflection published first does not take the first narration\'s campaign recap', async () => {
    await patPublishesAReflection();
    const call = await patAsksTheScene();
    expect(call.system, 'the session\'s first narration opens with the campaign recap')
      .toContain(`## CAMPAIGN RECAP — SESSION START CONTEXT\n\n${RECAP}`);
  }, 60_000);
});
