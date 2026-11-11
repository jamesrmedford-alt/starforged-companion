/**
 * STARFORGED COMPANION
 * tests/unit/pclessSceneAndOracleNarratedAsNoOne.test.js
 *
 * Issue #345 AA30 SCENE-PCLESS-ASKED-AS-FIRST-PC (the twelfth audit's
 * NARR-1) — issue #342 Z50's sibling paths.
 *
 * Z50 fixed the paced path: a player with no PC of their own at a table of
 * several is narrated with no character (decisions.md "a PC-less narrative
 * line or price is narrated as no one" [Z49, Z50]; issue #321 U23: "a player
 * with no PC of their own is never handed another player's character").
 * `@scene` and the `!oracle` follow-up still took the first PC:
 * resolveSpeakerActorId gives the PC-less asker none, and interrogateScene /
 * narrateOracleFollowup called getActiveCharacter(campaignState, null), whose
 * fallback is the campaign's first PC — so the prompt's CHARACTER block was
 * Kira's, the user message said "PLAYER QUESTION — asked by Kira", the scene
 * card recorded playerName "Kira" (every later narration's ring read "Kira
 * asked: …"), and the answer's capture carried Kira's actorId (a draft card's
 * Confirm bonds a new connection to her). Both now take Z50's guard: no
 * speaker, no character.
 *
 * Production entry points: the player's typed `@scene` (RUN_ON.CLAUDE → the
 * keyed GM) and `!oracle yes` (its follow-up relayed to the keyed GM's
 * oracle.narrate); Claude is answered by the harness.
 *
 * Scenario: GM (keyed) + Pat (owns Kira) + Quinn (owns no PC); Ren is a
 * second PC, whose player is not at the table.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const QUESTION = 'What does the cargo bay smell like?';
const PROSE = 'Machine oil and ozone hang in the cargo bay; Sable Ortiz watches from the gantry.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// The capture's detection pass finds a new figure, queued on the GM's draft card.
const DETECTION = JSON.stringify({
  entities: [{ type: 'connection', name: 'Sable Ortiz', description: 'A scarred salvage broker.', confidence: 'high' }],
  renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const KIRAS_BLOCK = /^## CHARACTER[\s\S]*?Name: Kira/m;

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
      if (/ENTITY TYPES TO DETECT/.test(call.userText ?? '')) return DETECTION;
      return call.model === NARRATION_MODEL ? PROSE : '{}';
    },
  });
});

const sceneCards = () => table.cards(f => f.sceneResponse === true && f.narratorCard === true);
const sceneCall  = () => table.claude.calls.find(c => c.model === NARRATION_MODEL && /PLAYER QUESTION/.test(c.userText ?? ''));
const oracleCall = () => table.claude.calls.find(c => c.model === NARRATION_MODEL && /The player invoked the oracle/.test(c.userText ?? ''));
const draftCard  = () => table.cards(f => f.draftEntityCard).at(-1);

/** `userId` types `line`; the narration's capture (2 s after its card) is let run. */
async function typeAndCapture(userId, line) {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    await table.client(userId).chat(line);
    for (let i = 0; i < 3; i += 1) {   // the oracle relay's hop, then the narration, then its capture
      await table.settle();
      await vi.advanceTimersByTimeAsync(2_100);
    }
    await table.settle();
  } finally {
    vi.useRealTimers();
  }
  await table.drain();
}

describe('issue #345 AA30 — a PC-less player\'s @scene question', () => {
  it('Quinn (no PC) asks @scene: it is asked as no one — no Kira CHARACTER block, speaker or card name, and the capture is no one\'s', async () => {
    await typeAndCapture('pl-2', `@scene ${QUESTION}`);

    expect(sceneCards()).toHaveLength(1);                      // answered, not refused
    const call = sceneCall();
    expect(call?.userText).toContain(QUESTION);
    expect.soft(call.system, 'CHARACTER block').not.toMatch(KIRAS_BLOCK);
    expect.soft(call.system, 'no CHARACTER block at all').not.toMatch(/^## CHARACTER$/m);
    expect.soft(call.userText, 'user message').not.toMatch(/asked by Kira/);
    expect.soft(sceneCards()[0].flags['starforged-companion'].playerName ?? null, 'card playerName').toBeNull();
    expect(draftCard(), 'the answer\'s capture queued Sable Ortiz (setup)').toBeTruthy();
    expect(draftCard().flags['starforged-companion'].actorId ?? null, 'the draft card is not Kira\'s').toBeNull();
  }, 30_000);

  it('control: Pat (Kira\'s player) asks the same and it is Kira\'s question, captured for her', async () => {
    await typeAndCapture('pl-1', `@scene ${QUESTION}`);

    expect(sceneCards()).toHaveLength(1);
    const call = sceneCall();
    expect(call.system).toMatch(KIRAS_BLOCK);
    expect(call.userText).toMatch(/asked by Kira/);
    expect(sceneCards()[0].flags['starforged-companion'].playerName).toBe('Kira');
    expect(draftCard().flags['starforged-companion'].actorId).toBe('pc-kira');
  }, 30_000);
});

describe('issue #345 AA30 (sibling) — a PC-less player\'s !oracle follow-up', () => {
  it('Quinn (no PC) asks the oracle: the follow-up is not narrated as Kira\'s, nor captured for her', async () => {
    await typeAndCapture('pl-2', '!oracle yes Is the hatch sealed?');

    const call = oracleCall();
    expect(call?.userText).toContain('Is the hatch sealed?');   // the GM narrated it
    expect.soft(call.system).not.toMatch(KIRAS_BLOCK);
    expect(draftCard(), 'the follow-up\'s capture queued Sable Ortiz (setup)').toBeTruthy();
    expect(draftCard().flags['starforged-companion'].actorId ?? null, 'the draft card is not Kira\'s').toBeNull();
  }, 30_000);

  it('control: Pat (Kira\'s player) asks the oracle and the follow-up is Kira\'s', async () => {
    await typeAndCapture('pl-1', '!oracle yes Is the hatch sealed?');

    expect(oracleCall().system).toMatch(KIRAS_BLOCK);
    expect(draftCard().flags['starforged-companion'].actorId).toBe('pc-kira');
  }, 30_000);
});
