/**
 * NARB-06 · CLOCK-VIGNETTE-ABSENT-FIRST-PC
 *
 * Scenario: two PCs. Kira — the campaign's first PC — is Quinn's, and Quinn is
 * away tonight; Ren is Pat's, and Pat is at the table. A clock advances
 * (Begin a Session's campaign roll, `!clock advance`, a Pay the Price that
 * fills a tension clock) and its vignette is narrated.
 *
 * Correct: the vignette is not written as the absent first PC's — the rule
 * issue #345 AA31 set for the galley vignette and known-issues
 * CLOSING-VIGNETTE-FIRST-PC for the closing one ("never a first PC whose
 * player is away"), and AA30 / Z50 for @scene, oracle follow-ups and paced
 * lines ("getActiveCharacter's first-PC fallback made it Kira's CHARACTER
 * block").
 *
 * Today: narrateClockAdvancement calls `getActiveCharacter(campaignState)`
 * with no speaker — the first PC — so the one CHARACTER block is Kira's, the
 * PARTY section names Kira as the PC speaking, and in second person "you" is
 * the crewmate who is not there.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-5-5';
const VIGNETTE = 'Somewhere aft, a relay ticks over.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, narrativeSkeletons: false, worldSnapshot: false,
    campaignState: {
      ...CampaignStateSchema, currentSessionId: 'cv-s1', sessionNumber: 2, sessionActive: true,
      currentSceneId: 'cv-sc1', sceneTruths: [], clocks: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? VIGNETTE : '{}') });
});

async function narrateClockVignette() {
  const gm = table.client('gm-1');
  const { narrateClockAdvancement } = await gm.import('../../src/narration/narrator.js');
  const text = await gm.run(() => narrateClockAdvancement({
    clock: { _id: 'clk-1', name: 'The blockade tightens', type: 'campaign', filled: 2, segments: 6, triggered: false },
    campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
  }));
  await table.settle();
  return { text, call: table.claude.calls.find(c => c.model === NARRATION_MODEL && /The blockade tightens/.test(c.userText ?? '')) };
}

const blockNames = (system) => String(system ?? '').split('\n\n---\n\n')
  .filter(s => s.startsWith('## CHARACTER')).map(b => /Name: (\w+)/.exec(b)?.[1] ?? '?');

describe('NARB-06 — a clock vignette is not written as an absent first PC\'s', () => {
  it('control: one PC, its player at the table — the vignette carries that PC\'s block', async () => {
    table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-1': 3 }, items: { contents: [] } });
    const { text, call } = await narrateClockVignette();
    expect(text).toContain('a relay ticks over');
    expect(blockNames(call.system)).toEqual(['Ren']);
  }, 30_000);

  it('Quinn (Kira\'s player) is away: the vignette\'s character is not Kira', async () => {
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 }, items: { contents: [] } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-1': 3 }, items: { contents: [] } });
    await table.leave('pl-2');
    const { text, call } = await narrateClockVignette();
    expect(text).toContain('a relay ticks over');
    expect(call, 'the vignette was narrated').toBeTruthy();
    expect(blockNames(call.system)).not.toContain('Kira');
  }, 30_000);
});
