/* global silenceConsoleErrors -- tests/setup.js */
/**
 * PROBE — BATCH: SHEET-ROLL-NARRATED-OUTSIDE-ROUND (twelfth audit, 2026-11-09)
 *
 * Batch Mode's contract (issue #340; decisions.md "Batch Mode: opt-in rounds,
 * read in the player's window, narrated once"): every player's action is
 * gathered into the round and "the narrator tells the round as one scene, on
 * one card". The chat pipeline enforces it for the two ways a move reaches
 * the module from chat — a typed line is table talk, a card button's move is
 * the roller's entry (src/index.js 837 → driver.js handleBatchModeLine).
 *
 * The third way is not covered: a vow or connection progress roll made on the
 * foundry-ironsworn sheet (Fulfill Your Vow, Forge a Bond). Its narration hook
 * (src/index.js registerNativeProgressRollHook, 2496-2566 at 22bdbeb) never
 * looks at Batch Mode: the keyed canonical GM narrates it at once
 * (narrateResolution), on its own card, in the middle of the round that is
 * collecting — the one action of the round told outside the round, and before
 * the actions confirmed ahead of it. Nothing in decisions.md or the help's
 * Batch Mode page names the sheet rolls (grep: "sheet").
 *
 * Harness: nativeRollKeyedRunner.test.js's native card (the vendor's
 * `ironsworn-roll` article), on the Batch Mode table.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'Kira keeps her word.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const round = () => table.world.getSetting('batchMode.round');
const vowNarrations = () => table.cards(f => f.narratorCard && f.moveId === 'fulfill_your_vow');

function nativeProgressCard({ source, value, dice, actorId = 'pc-kira' }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}

/** Kira rolls her vow on her sheet — a miss (no payoff runs). */
async function kiraRollsHerVowOnTheSheet() {
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
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
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

describe('SHEET-ROLL-NARRATED-OUTSIDE-ROUND — a sheet-rolled vow while Batch Mode is on', () => {
  it('control: with Batch Mode off, the sheet roll is narrated once (free-flow)', async () => {
    await kiraRollsHerVowOnTheSheet();
    expect(vowNarrations()).toHaveLength(1);
  }, 60_000);

  it('control: with Batch Mode on, a typed line is table talk — no narration call', async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    await table.client('pl-1').chat('I swear I will find Chen.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await table.drain();
    expect(table.claude.calls.filter(c => c.model === NARRATION_MODEL)).toEqual([]);
  }, 60_000);

  it('with Batch Mode on and the round collecting, the sheet roll is not narrated on its own card outside the round', async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    await kiraRollsHerVowOnTheSheet();
    expect({
      separateNarrations: vowNarrations().length,
      narrationCalls:     table.claude.calls.filter(c => c.model === NARRATION_MODEL).length,
      roundPhase:         round().phase,
    }).toEqual({ separateNarrations: 0, narrationCalls: 0, roundPhase: 'collecting' });
  }, 60_000);
});
