/**
 * STARFORGED COMPANION
 * tests/unit/xcardOracleFollowupUnwritten.test.js
 *
 * XCARD-ORACLE-FOLLOWUP-UNWRITTEN (issue #345 AA01's residual). An X-Card
 * played while an oracle's follow-up narration is still being written
 * discards the follow-up — no card posts — so nothing names the raw oracle
 * card for the X-Card's drop (AA01 drops a result by the follow-up card's
 * `oracleCardId`), and the raw answer stayed in RECENT ORACLE RESULTS: every
 * later prompt was told the dice established the beat the table removed. The
 * interrupted follow-up now asks the canonical GM to forget that card's
 * result ("oracle.forgetResult") — locally on the GM's key, relayed from a
 * player narrating on their own.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const QUESTION = 'Is the captain still alive';

let table, script;
const world = () => table.world.campaignState();
const ringed = () => (world().recentOracles ?? []).map(e => e.question);
const isFollowUpCall = (call) => call.model === NARRATION_MODEL && /The player invoked the oracle/.test(call.userText ?? '');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function reset({ gmKey = true, playerKey = false } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 's-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  if (gmKey) await table.setClaudeKey('gm-1', 'sk-ant-gina');
  if (playerKey) await table.setClaudeKey('pl-1', 'sk-ant-pat');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  script = scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL
    ? 'The captain lies still in the wreckage.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
    : '{}') });
}

/** `!oracle` with the follow-up's call held; the X-Card is played while it is out (or not). */
async function askOracle({ xCardMeanwhile }) {
  const held = script.hold(isFollowUpCall);
  await table.client('pl-1').chat(`!oracle yes ${QUESTION}?`);
  await held.arrived;
  await table.settle();
  expect(ringed(), 'the raw answer is ringed (setup)').toContain(`${QUESTION}?`);
  if (xCardMeanwhile) {
    await table.client('pl-1').chat('!x');
    await table.settle();
    expect(world().xCardActive, 'the X-Card landed while the follow-up was out (setup)').toBe(true);
  }
  held.release();
  await table.settle(); await table.drain();
}

const followUps = () => table.cards(f => f.oracleNarrationCard === true);

describe('XCARD-ORACLE-FOLLOWUP-UNWRITTEN — an X-Card during the follow-up\'s call forgets the raw answer', () => {
  beforeEach(() => reset());

  it('the follow-up is discarded and its raw answer leaves RECENT ORACLE RESULTS', async () => {
    await askOracle({ xCardMeanwhile: true });
    expect(followUps(), 'no follow-up card').toHaveLength(0);
    expect(ringed()).not.toContain(`${QUESTION}?`);
  }, 60_000);

  it('control: with no X-Card meanwhile the follow-up posts and the answer stays', async () => {
    await askOracle({ xCardMeanwhile: false });
    expect(followUps()).toHaveLength(1);
    expect(ringed()).toContain(`${QUESTION}?`);
  }, 60_000);
});

describe('XCARD-ORACLE-FOLLOWUP-UNWRITTEN — a player narrating on their own key relays the forget', () => {
  beforeEach(() => reset({ gmKey: false, playerKey: true }));

  it('the GM drops the answer the player\'s interrupted follow-up names', async () => {
    await askOracle({ xCardMeanwhile: true });
    expect(table.claude.calls.filter(isFollowUpCall).at(-1)?.client, 'the player narrated (setup)').toBe('pl-1');
    expect(followUps()).toHaveLength(0);
    expect(ringed()).not.toContain(`${QUESTION}?`);
  }, 60_000);
});
