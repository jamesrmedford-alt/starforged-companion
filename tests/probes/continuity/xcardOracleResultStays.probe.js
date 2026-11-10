/**
 * PROBE — CONT-4 XCARD-ORACLE-RESULT-STAYS-BINDING (SAFETY)
 *
 * An oracle answer and the narration that tells it are one beat: `!oracle yes
 * likely Is the child dead?` posts the raw card (oracleMemory flag, index.js
 * ~3450), the canonical GM rings it into campaignState.recentOracles
 * (registerOracleMemoryCaptureHook → captureOracleResult, index.js ~3676), and
 * the oracle follow-up narrates it (requestOracleNarration). The X-Card
 * answers that narration (narrator.js xCardedNarrationCards /
 * applyXCardToNarratorMemory) — its card, ledger entries, capture — but never
 * the ring: nothing on the X-Card's path reads recentOracles (safety.js
 * suppressScene / finishXCardRemoval; contrast the Burn's dropOracleResultsOf,
 * issue #342 Z11). So every later prompt of the session — the X-CARD —
 * REDIRECT narration first — still carries
 *   "## RECENT ORACLE RESULTS … Ask the Oracle (likely): "Is the child dead?"
 *    → YES … The dice established these outcomes. Your narration must not
 *    contradict them — build on what the oracle answered."
 * (narratorPrompt.js formatRecentOraclesBlock ~1759; read live by
 * buildNarratorExtras, narrator.js ~371): the narrator is told to build on the
 * premise of the beat the table removed, beside the redirect that says it
 * did not happen. The same holds for a move's Pay the Price
 * (`oracleMemory: { name: "Pay the Price", … resolutionId }`, index.js ~6124).
 * Control: with no X-Card, the next prompt carries the answer (setup sound).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const QUESTION = 'Is the child dead?';

let table;
const world = () => table.world.campaignState();
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1', sceneTruths: [],
    sceneState: { bySubject: {}, sceneId: 'sc-1' },
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.claude.respond((call) => {
    if (call.model !== NARRATION_MODEL) return '{}';
    if (/child/.test(call.userText)) {
      return 'The small body lies still beneath the collapsed bulkhead.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    }
    return 'The corridor hums.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  });
});

/** The oracle question and its narrated answer; returns the follow-up narration's card. */
async function askTheOracle() {
  const dice = vi.spyOn(Math, 'random').mockReturnValue(0.05);   // d100 = 6: YES on "likely"
  try {
    await table.client('pl-1').chat(`!oracle yes likely ${QUESTION}`, { speaker: { actor: 'pc-pat' } });
  } finally {
    dice.mockRestore();
  }
  await table.settle();
  expect((world().recentOracles ?? []).find(o => o.question === QUESTION)?.answer).toMatch(/^YES/);
  expect((world().recentOracles ?? []).map(o => o.question)).toContain(QUESTION);   // setup: rung
  const followups = table.world.messages().filter(m => m.flags?.['starforged-companion']?.narratorCard && /small body/.test(m.flags['starforged-companion'].narrationText ?? ''));
  expect(followups).toHaveLength(1);                                                 // setup: narrated
  return followups[0];
}

async function nextNarrationSystem() {
  const before = narrations().length;
  await table.client('gm-1').chat('@scene What do we see now?');
  await table.settle();
  const call = narrations().slice(before)[0];
  expect(call).toBeDefined();
  return call.system;
}

describe('CONT-4 — the oracle answer of an X-carded beat stays "established" in every later prompt', () => {
  it('control: with no X-Card, the next narration is told the oracle answer', async () => {
    await askTheOracle();
    const system = await nextNarrationSystem();
    expect(system).toContain('## RECENT ORACLE RESULTS');
    expect(system).toContain(QUESTION);
  }, 60_000);

  it("after the X-Card on the oracle's narration, the redirect narration is not told to build on its answer", async () => {
    const followup = await askTheOracle();
    await table.client('pl-1').chat('!x');
    await table.settle();
    const nid = followup.flags['starforged-companion'].narrationId;
    const removed = table.world.messages().find(m => m.flags?.['starforged-companion']?.narrationId === nid);
    expect(removed?.flags?.['starforged-companion']?.xCarded).toBe(true);           // setup: the beat was removed
    expect(world().xCardedNarrationIds).toContain(nid);
    await table.client('gm-1').chat('!x clear');
    await table.settle();

    const system = await nextNarrationSystem();
    expect(system).toContain('## X-CARD — REDIRECT');                               // setup: the post-resume narration
    const oracles = (system.split('## RECENT ORACLE RESULTS')[1] ?? '').split('\n## ')[0];
    expect(oracles, 'the removed beat\'s oracle answer, given as binding').not.toContain(QUESTION);
  }, 60_000);
});
