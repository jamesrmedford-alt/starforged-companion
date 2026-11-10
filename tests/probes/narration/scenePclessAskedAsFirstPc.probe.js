/**
 * PROBE — NARR-1 SCENE-PCLESS-ASKED-AS-FIRST-PC (twelfth audit, narration)
 *
 * Issue #342 Z50 fixed the paced path only: a player with no PC of their own
 * at a table of several is narrated with no character (decisions.md "a
 * PC-less narrative line or price is narrated as no one" [Z49, Z50]; issue
 * #321 U23: "a player with no PC of their own is never handed another
 * player's character"). Its sibling, `@scene`, still takes the first PC:
 *
 *   src/index.js:687-694 handleSceneQueryCommand → interrogateScene(question,
 *     cs, { speakerActorId: resolveSpeakerActorId(message, cs) }) — null for
 *     the PC-less asker (speaker.js resolveUserActorId rung 3);
 *   src/narration/narrator.js:2475 `const character = getActiveCharacter(
 *     campaignState, speakerActorId)` — no `speakerActorId ? … : null` guard
 *     (narratePacedInput's Z50 guard is at narrator.js:3155), so
 *     getActiveCharacter (narrator.js:4726) falls back to the campaign's
 *     first PC;
 *   → the prompt's CHARACTER block is Kira's, the user message says
 *     "PLAYER QUESTION — asked by Kira" (narratorPrompt.js:2028-2051), the
 *     scene card records playerName "Kira" (narrator.js:3986-4011), so the
 *     ring tells every later narration "PLAYER — Kira asked: …" (ringEntryText,
 *     narrator.js:1628), and the answer's capture carries Kira's actorId
 *     (scheduleSceneAnswerCapture, narrator.js:2519/2575 — a draft card's Confirm
 *     bonds a new connection to her).
 *
 * Scenario: GM (keyed) + Pat (owns Kira) + Quinn (owns no PC); Ren is a
 * second PC. Quinn types `@scene What does the cargo bay smell like?`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const QUESTION = 'What does the cargo bay smell like?';

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
    fallback: (call) => (call.model === NARRATION_MODEL
      ? 'Machine oil and ozone hang in the cargo bay.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
      : '{}'),
  });
});

const sceneCards  = () => table.cards(f => f.sceneResponse === true && f.narratorCard === true);
const sceneCall   = () => table.claude.calls.find(c => c.model === NARRATION_MODEL && /PLAYER QUESTION/.test(c.userText ?? ''));

describe('NARR-1 — a PC-less player\'s @scene question', () => {
  it('Quinn (no PC) asks @scene: it is not asked as Kira (Z50\'s option A — no character)', async () => {
    await table.client('pl-2').chat(`@scene ${QUESTION}`);
    await table.settle(); await table.drain();

    expect(sceneCards()).toHaveLength(1);                      // answered, not refused
    const call = sceneCall();
    expect(call?.userText).toContain(QUESTION);
    expect.soft(call.system, 'CHARACTER block').not.toMatch(/^## CHARACTER[\s\S]*?Name: Kira/m);   // Kira's CHARACTER block
    expect.soft(call.userText, 'user message').not.toMatch(/asked by Kira/);                       // "PLAYER QUESTION — asked by Kira"
    expect.soft(sceneCards()[0].flags['starforged-companion'].playerName ?? null, 'card playerName').not.toBe('Kira');   // the ring's "Kira asked"
  }, 30_000);

  it('control: Pat (Kira\'s player) asks the same and it is Kira\'s question', async () => {
    await table.client('pl-1').chat(`@scene ${QUESTION}`);
    await table.settle(); await table.drain();

    expect(sceneCards()).toHaveLength(1);
    const call = sceneCall();
    expect(call.system).toMatch(/^## CHARACTER[\s\S]*?Name: Kira/m);
    expect(call.userText).toMatch(/asked by Kira/);
    expect(sceneCards()[0].flags['starforged-companion'].playerName).toBe('Kira');
  }, 30_000);
});

// The same fallback on the oracle follow-up: narrateOracleFollowupOnGm
// (oracleFollowup.js:116-127) says "The speaker it names must be a PC its
// author owns; otherwise the narration names none", and passes null — then
// narrateOracleFollowup (narrator.js:2643) calls getActiveCharacter(cs, null)
// and narrates Quinn's oracle as Kira's (CHARACTER block; the capture's
// actorId, narrator.js:2675).
const oracleCall = () => table.claude.calls.find(c => c.model === NARRATION_MODEL && /The player invoked the oracle/.test(c.userText ?? ''));

describe('NARR-1 (sibling) — a PC-less player\'s !oracle follow-up', () => {
  it('Quinn (no PC) asks the oracle: the follow-up is not narrated as Kira\'s', async () => {
    await table.client('pl-2').chat('!oracle yes Is the hatch sealed?');
    await table.settle(); await table.drain();

    const call = oracleCall();
    expect(call?.userText).toContain('Is the hatch sealed?');   // the GM narrated it
    expect(call.system).not.toMatch(/^## CHARACTER[\s\S]*?Name: Kira/m);
  }, 30_000);

  it('control: Pat (Kira\'s player) asks the oracle and the follow-up is Kira\'s', async () => {
    await table.client('pl-1').chat('!oracle yes Is the hatch sealed?');
    await table.settle(); await table.drain();

    expect(oracleCall().system).toMatch(/^## CHARACTER[\s\S]*?Name: Kira/m);
  }, 30_000);
});
