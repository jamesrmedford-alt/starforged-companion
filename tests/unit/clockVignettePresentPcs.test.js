/**
 * STARFORGED COMPANION
 * tests/unit/clockVignettePresentPcs.test.js
 *
 * Issue #362 AC75 (CLOCK-VIGNETTE-ABSENT-FIRST-PC): a clock vignette — Begin
 * a Session's campaign roll, `!clock advance`, a Pay the Price that fills a
 * tension clock — and the inciting incident were written as the campaign's
 * first PC's (`getActiveCharacter` with no speaker): its CHARACTER block, the
 * PARTY section's speaking PC and second person's "you", even with that PC's
 * player away. They are written for the PCs at the table, as the galley and
 * the closing vignette are (issue #345 AA31, CLOSING-VIGNETTE-FIRST-PC): one
 * present PC is the beat's character, two or more each get a block, none gets
 * none.
 *
 * From the fourteenth audit's probe (narb/clockVignetteAbsentFirstPc).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-5-5';
const VIGNETTE = 'Somewhere aft, a relay ticks over.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const INCITING = 'A distress beacon screams from the dark.\n\nSuggested vow: Answer the beacon (dangerous)\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

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
  scriptClaude(table, { fallback: (call) => {
    if (call.model !== NARRATION_MODEL) return '{}';
    return /inciting|distress|campaign begins/i.test(call.userText ?? '') ? INCITING : VIGNETTE;
  } });
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

async function narrateInciting() {
  const gm = table.client('gm-1');
  const { narrateIncitingIncident } = await gm.import('../../src/narration/narrator.js');
  const text = await gm.run(() => narrateIncitingIncident({
    userMessage: 'The campaign begins. Compose the inciting incident: a distress call.',
    campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
  }));
  await table.settle();
  return { text, call: table.claude.calls.filter(c => c.model === NARRATION_MODEL).at(-1) };
}

const blockNames = (system) => String(system ?? '').split('\n\n---\n\n')
  .filter(s => s.startsWith('## CHARACTER')).map(b => /Name: (\w+)/.exec(b)?.[1] ?? '?');

describe('issue #362 AC75 — a clock vignette is written for the PCs at the table', () => {
  it('control: one PC, its player at the table — the vignette carries that PC\'s block', async () => {
    table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-1': 3 }, items: { contents: [] } });
    const { text, call } = await narrateClockVignette();
    expect(text).toContain('a relay ticks over');
    expect(blockNames(call.system)).toEqual(['Ren']);
  }, 30_000);

  it('Quinn (Kira\'s player) is away: the vignette is Ren\'s, not the first PC\'s', async () => {
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 }, items: { contents: [] } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-1': 3 }, items: { contents: [] } });
    await table.leave('pl-2');
    const { text, call } = await narrateClockVignette();
    expect(text).toContain('a relay ticks over');
    expect(call, 'the vignette was narrated').toBeTruthy();
    expect(blockNames(call.system)).toEqual(['Ren']);
  }, 30_000);

  it('both players at the table: each PC gets a block', async () => {
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 }, items: { contents: [] } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-1': 3 }, items: { contents: [] } });
    const { call } = await narrateClockVignette();
    expect(blockNames(call.system).sort()).toEqual(['Kira', 'Ren']);
  }, 30_000);
});

describe('issue #362 AC75 — so is the inciting incident', () => {
  it('Quinn (Kira\'s player) is away: the inciting incident is Ren\'s, not the first PC\'s', async () => {
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 }, items: { contents: [] } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-1': 3 }, items: { contents: [] } });
    await table.leave('pl-2');
    const { text, call } = await narrateInciting();
    expect(text).toContain('distress beacon');
    expect(blockNames(call.system)).toEqual(['Ren']);
  }, 30_000);
});
