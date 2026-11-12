/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchSheetRollKeylessNarratedAtOnce.test.js
 *
 * SHEET-ROLL-KEYLESS-ROUND (issue #345 D1's residual). While Batch Mode is
 * on, a participant's vow or bond progress roll made on the system sheet is
 * narrated with the round (driver.js sheetRollJoinsRound / takeSheetRoll).
 * With no keyed GM connected the round cannot narrate it: since issue #347
 * D3 it waits for the keyed GM the registry lists, however long that GM is
 * away. Before Batch Mode, a keyed player narrated their own roll at once.
 * Now, while no keyed GM is connected, a sheet roll is narrated at once where
 * a key lives — the roller's own client — as before; with one connected it
 * joins the round (batchSheetRollNarratedWithRound.test.js).
 *
 * Harness: batchSheetRollNarratedWithRound.test.js's native card.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const REPLY = 'Kira keeps her word.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const ownVowNarrations = () => table.cards(f => f.narratorCard && f.moveId === 'fulfill_your_vow' && !f.roundId);

function nativeProgressCard({ source, value, dice, actorId = 'pc-kira' }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}

/** Kira's player rolls her vow on the sheet — a miss (1 against 5 and 8). */
async function rollsVowOnTheSheet() {
  await table.client('pl-1').run(() => globalThis.ChatMessage.create({
    content: nativeProgressCard({ source: 'Find Chen', value: 1, dice: [5, 8] }),
    speaker: { actor: 'pc-kira', alias: 'Kira' },
    rolls: [{ formula: '{d10,d10}', total: 0 }],
  }));
  await table.settle();
  await table.drain();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  table.addActor({
    id: 'pc-kira', name: 'Kira', type: 'character', hasPlayerOwner: true, ownership: { 'pl-1': 3 },
    items: { contents: [
      { id: 'vow-1', type: 'progress', name: 'Find Chen', system: { subtype: 'vow', rank: 'dangerous', current: 4 }, flags: {} },
    ] },
  });
  table.addActor({ id: 'pc-ren', name: 'Ren', type: 'character', hasPlayerOwner: true, ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

describe('SHEET-ROLL-KEYLESS-ROUND — a sheet roll with no keyed GM connected is narrated at once', () => {
  it("no GM holds a Claude key, Kira's player does: her sheet roll is narrated at once on her own key, not held in the round", async () => {
    await table.setClaudeKey('pl-1', 'sk-ant-kira');
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    expect(round()).toMatchObject({ phase: 'collecting' });

    await rollsVowOnTheSheet();
    expect(ownVowNarrations(), 'narrated on its own card').toHaveLength(1);
    expect(narrations().map(c => c.client)).toEqual(['pl-1']);
    expect(round().entries['pl-1']?.reading?.kind ?? null, 'not the round entry').not.toBe('sheet-roll');
  }, 60_000);

  it('control: with a keyed GM connected, it joins the round and is not narrated on its own', async () => {
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();

    await rollsVowOnTheSheet();
    expect(ownVowNarrations()).toHaveLength(0);
    expect(round().entries['pl-1']).toMatchObject({ status: 'ready', reading: { kind: 'sheet-roll' } });
    expect(table.world.getSetting('batchMode.enabled')).toBe(true);
  }, 60_000);
});
