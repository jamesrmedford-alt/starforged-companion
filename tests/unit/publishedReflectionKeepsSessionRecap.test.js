/**
 * STARFORGED COMPANION
 * tests/unit/publishedReflectionKeepsSessionRecap.test.js
 *
 * Issue #345 AA32 REFLECTION-COUNTS-AS-FIRST-NARRATION (the twelfth audit's
 * R2C-3) — a sibling of issue #321 U35 (FALLBACK-IN-RING: "a failed first
 * narration cancelled the campaign recap", fixed for fallback cards only).
 *
 * The campaign recap reaches a session's first narration (narrator.js
 * sessionStartRecap; decisions.md "The campaign recap reaches a session's
 * first narration in any prose mode"). A reflection a player publishes from
 * the Private Channel carries the narrator flag family (publish.js
 * publishToMainChat — `narratorCard: true`, `narrationText`, `sessionId`), so
 * the ring and the rolling summary hold it (decisions.md "a published
 * reflection is canon"). The gate counted every card sessionNarratorCards
 * keeps, and that reader leaves out fallback, X-carded, superseded and
 * whispered cards — not a reflection: one published before the session's
 * first narration counted as that narration, and the narration that followed
 * was built without the CAMPAIGN RECAP block. The gate now counts narrations
 * only, as the X-Card redirect hook does ("a published reflection … is not a
 * narration").
 *
 * Production entry points: the real Publish (publishToMainChat on the
 * player's client) and `@scene` (typed by the player, run on the keyed GM —
 * RUN_ON.CLAUDE); Claude is answered by the harness.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const S2 = 'aa32-recap-s2';
const RECAP = 'PREVIOUSLY — the crew fled Bleakhold with the Hegemony on their heels.';
const RECAP_BLOCK = `## CAMPAIGN RECAP — SESSION START CONTEXT\n\n${RECAP}`;
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
      currentSceneId: 'aa32-sc', sceneTruths: [],
      campaignRecapCache: { text: RECAP, generatedAt: new Date().toISOString(), ...EMPTY_CHRONICLE_KEY },
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => REPLY });
});

async function patPublishesAReflection(content = 'Kira turns her sister\'s locket over and over, saying nothing.') {
  const pat = table.client('pl-1');
  const { publishToMainChat } = await pat.import('../../src/private-channel/publish.js');
  const card = await pat.run(() => publishToMainChat({ userId: 'pl-1', content }));
  await table.settle(); await table.drain();
  expect(card).toBeTruthy();
}

/** Pat asks `@scene`; the narration call it made. */
async function patAsksTheScene(question = 'What does the hangar look like?') {
  const before = narrationCalls().length;
  await table.client('pl-1').chat(`@scene ${question}`, { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
  const calls = narrationCalls();
  expect(calls).toHaveLength(before + 1);
  return calls.at(-1);
}

describe('issue #345 AA32 — a published reflection before the session\'s first narration', () => {
  it('control: the session\'s first narration carries the campaign recap', async () => {
    const call = await patAsksTheScene();
    expect(call.system).toContain(RECAP_BLOCK);
  }, 60_000);

  it('a reflection published first does not take the first narration\'s campaign recap', async () => {
    await patPublishesAReflection();
    expect(table.cards(f => f.publishedReflection && f.narratorCard)).toHaveLength(1);   // canon: in the flag family
    const call = await patAsksTheScene();
    expect(call.system, 'the session\'s first narration opens with the campaign recap').toContain(RECAP_BLOCK);
  }, 60_000);

  it('the recap still comes once: the narration after the first carries none, a reflection between them or not', async () => {
    await patPublishesAReflection();
    expect((await patAsksTheScene()).system).toContain(RECAP_BLOCK);
    await patPublishesAReflection('Kira hums an old Bleakhold lullaby under her breath.');
    expect((await patAsksTheScene('Who is on watch?')).system).not.toContain('## CAMPAIGN RECAP');
  }, 60_000);

  it('control: a narration already told this session — a reflection after it brings no recap back', async () => {
    expect((await patAsksTheScene()).system).toContain(RECAP_BLOCK);
    await patPublishesAReflection();
    expect((await patAsksTheScene('Who is on watch?')).system).not.toContain('## CAMPAIGN RECAP');
  }, 60_000);
});
