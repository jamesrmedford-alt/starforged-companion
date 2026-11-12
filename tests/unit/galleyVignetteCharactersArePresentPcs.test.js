/**
 * STARFORGED COMPANION
 * tests/unit/galleyVignetteCharactersArePresentPcs.test.js
 *
 * Issue #345 AA31 GALLEY-CHARACTER-ABSENT-PC (the twelfth audit's NARR-3).
 *
 * Begin a Session's galley vignette is about the PCs whose players are at the
 * table: buildGalleyVignetteUserMessage lists them as "Active players (their
 * PCs are physically in the galley together)" and the others as "Absent
 * crewmates (referenced in banter, not present)", from
 * collectGalleyParticipants (issue #325 W32's rule). The system prompt it was
 * sent with ignored that split: narrateSessionVignette took
 * getActiveCharacter(campaignState) — no speaker, so the campaign's first PC
 * — as the prompt's one CHARACTER block (and PARTY's "speaking this turn"),
 * under a perspective resolved from the active non-GM users (one player
 * connected → second person). With the first PC's player away, the "you" was
 * the crewmate the user message called absent, and the PC in the galley had
 * no CHARACTER block. The galley now hands the narration its present PCs:
 * each gets its CHARACTER block — two or more are third person, as a round's
 * acting PCs are (issue #342 Z40) — and with none present there is none. The
 * closing vignette, about an NPC, keeps the first PC's block.
 *
 * Production entry points: the GM's typed `!begin-session` with the galley
 * box checked (the dialog answered), the real vignette narration; Claude is
 * answered by the harness.
 *
 * Scenario: Kira (the first PC) is Quinn's (pl-2); Ren is Pat's (pl-1).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const GALLEY = 'The galley smells of burnt caf.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SECOND_PERSON = /Perspective: Address the player character directly as "you"/;

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
const blockNames = (system) => characterBlocks(system).map(b => /Name: (\w+)/.exec(b)?.[1] ?? '?');

describe('issue #345 AA31 — the galley vignette\'s CHARACTER blocks are the PCs at the table', () => {
  it('Quinn (Kira\'s player) is away: the vignette\'s "you" is Ren, in the galley — not Kira, the absent crewmate', async () => {
    await table.leave('pl-2');
    await beginWithGalley();

    const call = galleyCall();
    expect(call, 'the galley vignette was narrated').toBeTruthy();
    // Setup: the user message has Ren in the galley and Kira absent.
    expect(call.userText).toMatch(/Active players[^\n]*\n- Ren/);
    expect(call.userText).toMatch(/Absent crewmates[^\n]*\n- Kira/);
    // One player connected → second person: the CHARACTER block is the "you".
    expect(call.system).toMatch(SECOND_PERSON);
    expect(blockNames(call.system)).toEqual(['Ren']);
    // The PARTY roster still names both; the one it marks is the PC in the galley.
    expect(call.system).toMatch(/Player characters: .*Ren \(speaking this turn\)/);
    expect(call.system).not.toMatch(/Kira \(speaking this turn\)/);
  }, 30_000);

  it('both players at the table: each PC in the galley has its block, and the vignette is third person (Z40\'s rule)', async () => {
    await beginWithGalley();

    const call = galleyCall();
    expect(call.userText).toMatch(/Active players[^\n]*\n- Kira[\s\S]*\n- Ren[\s\S]*Absent crewmates/);
    expect(blockNames(call.system)).toEqual(['Kira', 'Ren']);
    expect(call.system).not.toMatch(SECOND_PERSON);
    expect(call.system).not.toMatch(/\(speaking this turn\)/);
  }, 30_000);

  it('no PC\'s player at the table: no CHARACTER block — nobody absent is the vignette\'s "you"', async () => {
    await table.leave('pl-1');
    await table.leave('pl-2');
    await beginWithGalley();

    const call = galleyCall();
    expect(call.userText).toMatch(/Absent crewmates[^\n]*\n- Kira\n- Ren/);
    expect(blockNames(call.system)).toEqual([]);
  }, 30_000);

  it('control: both players at the table — Kira is in the galley and her CHARACTER block is a present PC\'s', async () => {
    await beginWithGalley();

    const call = galleyCall();
    expect(call.userText).toMatch(/Active players[^\n]*\n- Kira/);
    expect(characterBlocks(call.system).some(b => /Name: Kira/.test(b))).toBe(true);
  }, 30_000);

  it('control: a vignette that names no PCs (the closing one, about an NPC) keeps the first PC\'s block', async () => {
    const gm = table.client('gm-1');
    const { narrateSessionVignette } = await gm.import('../../src/narration/narrator.js');
    await gm.run(() => narrateSessionVignette({
      userMessage: 'CLOSING VIGNETTE — a quiet moment aboard.',
      campaignState: structuredClone(game.settings.get('starforged-companion', 'campaignState')),
    }));
    await table.settle(); await table.drain();

    const call = table.claude.calls.find(c => c.model === NARRATION_MODEL && /CLOSING VIGNETTE/.test(c.userText ?? ''));
    expect(blockNames(call.system)).toEqual(['Kira']);
  }, 30_000);
});
