/**
 * PROBE — NARR-2 XCARD-ORACLE-MEMORY-KEPT (twelfth audit, narration)
 *
 * The X-Card's "full exclusion" (decisions.md → issue #321 U07: "The X-Card
 * forgets what it answered") takes the narration it answers out of every
 * narrator-memory store: its cards are flagged xCarded (ring, rolling summary,
 * recap prose), its sidecar facts are retracted, its capture undone, and the
 * first narration after a GM resumes is told "That beat has been removed: it
 * did not happen … do not bring back anything it introduced"
 * (narratorPrompt.js XCARD_REDIRECT_BLOCK).
 *
 * One narrator-memory store is not reached: RECENT ORACLE RESULTS ([3b]).
 * `!oracle` writes the answer into campaignState.recentOracles (index.js
 * registerOracleMemoryCaptureHook / captureOracleResult, :3675-3702), the
 * follow-up narration renders it (narrateOracleFollowup), and when the table
 * X-Cards that narration, applyXCardToNarratorMemory (narrator.js:1802-1830)
 * touches the ledger, xCardedNarrationIds, the summary and the redirect —
 * never recentOracles (no narrationId is stamped on the oracle entry, and
 * dropOracleResultsOf is only called by a Burn/Improve revert,
 * resultUpgrade.js:482). So every later narration's prompt still carries
 *   "## RECENT ORACLE RESULTS … - Ask the Oracle (50/50): "<the X-carded
 *    question>" → <answer> … The dice established these outcomes. Your
 *    narration must not contradict them — build on what the oracle answered."
 * beside the X-CARD — REDIRECT block (buildNarratorExtras narrator.js:371 →
 * narratorPrompt.js:1578-1581), for the rest of the session.
 *
 * Scenario: GM (keyed) + Pat (Kira). Pat asks `!oracle yes Is the captain
 * still alive?` — the GM narrates the follow-up. Pat plays `!x`; the GM types
 * `!x clear`; Pat types a narrative line. That narration's prompt is checked.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const NARRATIVE = JSON.stringify({
  decision: 'NARRATIVE', suggestedMove: null, sceneChallenge: null,
  category: 'social', confidence: 0.9, reasoning: 'chat, no move',
});
const QUESTION = 'Is the captain still alive';
const LINE = 'I lean against the bulkhead and wait for the others.';

let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 's-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, {
    fallback: (call) => {
      if (/pacing pre-classifier/.test(call.system)) return NARRATIVE;
      if (call.model === NARRATION_MODEL) {
        return /The player invoked the oracle/.test(call.userText ?? '')
          ? 'The captain lies still in the wreckage, a dark stain spreading.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
          : 'The bulkhead hums against your back.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
      }
      return '{}';
    },
  });
});

const followUps   = () => table.cards(f => f.oracleNarrationCard === true);
const pacedCall   = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /No move was rolled/.test(c.userText ?? '')).at(-1);
const oracleBlock = (system) => (String(system ?? '').split('\n\n---\n\n').find(s => s.startsWith('## RECENT ORACLE RESULTS')) ?? '');

async function askOracleAndNarrate() {
  await table.client('pl-1').chat(`!oracle yes ${QUESTION}?`);
  await table.settle(); await table.drain();
  // Setup: the answer reached oracle memory, and the GM narrated it.
  expect((table.world.campaignState().recentOracles ?? []).map(e => e.question)).toContain(`${QUESTION}?`);
  expect(followUps()).toHaveLength(1);
}

describe('NARR-2 — the X-Card on an oracle\'s narration leaves its answer in RECENT ORACLE RESULTS', () => {
  it('after the X-Card on the follow-up and a resume, the next narration is not told the dice established the removed answer', async () => {
    await askOracleAndNarrate();

    await table.client('pl-1').chat('!x');
    await table.settle(); await table.drain();
    // Setup: the X-Card answered the oracle's narration.
    expect(table.world.message(followUps()[0]._id).flags[MODULE_ID].xCarded).toBe(true);
    await table.client('gm-1').chat('!x clear');
    await table.settle(); await table.drain();

    await table.client('pl-1').chat(LINE);
    await table.settle(); await table.drain();

    const call = pacedCall();
    expect(call?.userText).toContain(LINE);
    expect(call.system).toContain('## X-CARD — REDIRECT');          // the redirect is there …
    expect(oracleBlock(call.system)).not.toContain(QUESTION);         // … and so is the removed beat's answer, "established"
  }, 60_000);

  it('control: with no X-Card, the next narration carries the answer in RECENT ORACLE RESULTS', async () => {
    await askOracleAndNarrate();

    await table.client('pl-1').chat(LINE);
    await table.settle(); await table.drain();

    const call = pacedCall();
    expect(call?.userText).toContain(LINE);
    expect(oracleBlock(call.system)).toContain(QUESTION);
    expect(call.system).not.toContain('## X-CARD — REDIRECT');
  }, 60_000);
});
