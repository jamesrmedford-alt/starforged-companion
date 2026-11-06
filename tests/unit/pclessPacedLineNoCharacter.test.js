/**
 * STARFORGED COMPANION
 * tests/unit/pclessPacedLineNoCharacter.test.js
 *
 * Issue #342 Z50 PACED-PCLESS-NARRATED-AS-FIRST-PC (the narration auditor's
 * NARR-D2 probe — filed as a decision row; settled by issue #326 D8 and #321
 * U23, which leave only option A: narrate the line with no character).
 *
 * At a table of two or more PCs, a player who owns none (an observer, a
 * player whose character isn't made yet) types a line the classifier calls
 * NARRATIVE. Issue #326 D8 decided "Narration that is not a move is not
 * refused" — so it is narrated — but resolveSpeakerActorId gives it no PC
 * (U23: "a player with no PC of their own is never handed another player's
 * character"), and narratePacedInput's getActiveCharacter(campaignState, null)
 * fell back to the campaign's FIRST PC: the prompt's CHARACTER block was
 * Kira's, the user message named her as the speaker, and the paced card
 * recorded `playerName: "Kira"`, so the ring told every later narration
 * "PLAYER — Kira wrote: …" for words Kira's player never wrote. The line is
 * now narrated with no character.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const NARRATIVE = JSON.stringify({
  decision: 'NARRATIVE', suggestedMove: null, sceneChallenge: null,
  category: 'social', confidence: 0.9, reasoning: 'chat, no move',
});
const LINE = 'I lean against the bulkhead and hum an old spacer tune.';

let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 's-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  // Kira is Pat's (pl-1); Ren belongs to a player not at the table. Quinn (pl-2) owns no PC.
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-absent': 3 } });
  scriptClaude(table, {
    fallback: (call) => {
      if (/pacing pre-classifier/.test(call.system)) return NARRATIVE;
      if (call.model === NARRATION_MODEL) return 'A tune drifts down the corridor.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
      return '{}';
    },
  });
});

const pacedCards = () => table.cards(f => f.narratorCard && f.pacedNarrative === true);
const narrationCall = () => table.claude.calls.find(c => c.model === NARRATION_MODEL);

describe('Z50 — a PC-less player\'s narrative line', () => {
  it('Quinn (no PC) types a narrative line: it is not narrated as Kira\'s (option A: no character)', async () => {
    await table.client('pl-2').chat(LINE);
    await table.settle(); await table.drain();

    expect(pacedCards()).toHaveLength(1);                         // D8: narrated, not refused
    const call = narrationCall();
    expect(call?.userText).toContain(LINE);
    // Not handed another player's character (U23): no CHARACTER block of Kira's, no "Kira" as the speaker.
    expect(call.system).not.toMatch(/^## CHARACTER[\s\S]*?Name: Kira/m);   // it was Kira's CHARACTER block
    expect(call.system).not.toMatch(/Kira \(speaking this turn\)/);
    expect(call.userText).not.toMatch(/spoken by Kira/);
    expect(pacedCards()[0].flags['starforged-companion'].playerName ?? null).not.toBe('Kira');   // it was 'Kira' — the ring's PLAYER line
    expect(pacedCards()[0].flags['starforged-companion'].actorId ?? null).toBeNull();
  }, 30_000);

  it('control: Pat (Kira\'s player) types the same line and it is Kira\'s', async () => {
    await table.client('pl-1').chat(LINE);
    await table.settle(); await table.drain();

    expect(pacedCards()).toHaveLength(1);
    expect(narrationCall().system).toMatch(/^## CHARACTER[\s\S]*?Name: Kira/m);
    expect(pacedCards()[0].flags['starforged-companion'].playerName).toBe('Kira');
  }, 30_000);
});
