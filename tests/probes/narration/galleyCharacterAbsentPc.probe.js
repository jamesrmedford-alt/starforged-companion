/**
 * PROBE — NARR-3 GALLEY-CHARACTER-ABSENT-PC (twelfth audit, narration)
 *
 * Begin a Session's galley vignette is about the PCs whose players are at the
 * table: buildGalleyVignetteUserMessage (galleyVignette.js:111-185) lists
 * them as "Active players (their PCs are physically in the galley
 * together)" and the others as "Absent crewmates (referenced in banter, not
 * present)", from collectGalleyParticipants (issue #325 W32's rule).
 *
 * The system prompt it is sent with ignores that split:
 * narrateSessionVignette (narrator.js:2786) takes
 *   const character = getActiveCharacter(campaignState);
 * — no speaker, so the campaign's FIRST PC (getActiveCharacter →
 * _resolveCharacterIds → getPlayerActors order, narrator.js:4726/4803) —
 * and renders it as the prompt's one CHARACTER block, under a perspective
 * resolved from the active non-GM users (narratorPrompt.js:1270: one
 * player connected → second person, "Address the player character directly
 * as 'you'"). When the first PC's player is the one who is away, the
 * narrator is told the player character it addresses as "you" is the absent
 * crewmate the user message says is not in the galley, and the PC who is
 * there has no CHARACTER block at all (no stats, pronouns, notes).
 *
 * Scenario: Kira (the first PC) is Quinn's (pl-2); Ren is Pat's (pl-1).
 * Quinn is away. The GM runs Begin a Session with the galley vignette on.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const GALLEY = 'The galley smells of burnt caf.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: false, sessionStartedId: null, currentSessionId: 'bs-s1',
      sessionNumber: 1, lastSessionTimestamp: new Date().toISOString(), safetyFlags: [],
      currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  // Kira first in the world (getPlayerActors order), Quinn's; Ren is Pat's.
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-2': 3 } });
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? GALLEY : '{}') });
});

async function beginWithGalley() {
  table.client('gm-1').answerDialogs(d => d.submit({ 'input[name="vignette"]': false, 'input[name="galleyVignette"]': true }));
  await table.client('gm-1').chat('!begin-session');
  await table.settle(); await table.drain();
}

const galleyCall = () => table.claude.calls.find(c => c.model === NARRATION_MODEL && /OPENING VIGNETTE/.test(c.userText ?? ''));
const characterBlocks = (system) => String(system ?? '').split('\n\n---\n\n').filter(s => s.startsWith('## CHARACTER'));

describe('NARR-3 — the galley vignette\'s CHARACTER block is the first PC, at the table or not', () => {
  it('Quinn (Kira\'s player) is away: the vignette is not written for Kira as its "you"', async () => {
    await table.leave('pl-2');
    await beginWithGalley();

    const call = galleyCall();
    expect(call, 'the galley vignette was narrated').toBeTruthy();
    // Setup: the user message has Ren in the galley and Kira absent.
    expect(call.userText).toMatch(/Active players[^\n]*\n- Ren/);
    expect(call.userText).toMatch(/Absent crewmates[^\n]*\n- Kira/);
    // One player connected → second person: the CHARACTER block is the "you".
    expect(call.system).toMatch(/Perspective: Address the player character directly as "you"/);
    // The prompt's one CHARACTER block — the PC the perspective addresses — is a PC in the galley.
    const blocks = characterBlocks(call.system);
    expect(blocks.some(b => /Name: Kira/.test(b))).toBe(false);   // got: Kira, the absent crewmate
    expect(blocks.some(b => /Name: Ren/.test(b))).toBe(true);     // got: none for Ren, the PC who is there
  }, 30_000);

  it('control: both players at the table — Kira is in the galley and her CHARACTER block is a present PC\'s', async () => {
    await beginWithGalley();

    const call = galleyCall();
    expect(call.userText).toMatch(/Active players[^\n]*\n- Kira/);
    expect(characterBlocks(call.system).some(b => /Name: Kira/.test(b))).toBe(true);
  }, 30_000);
});
