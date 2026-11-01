/**
 * STARFORGED COMPANION
 * tests/unit/xcardNarratorMemoryTable.test.js
 *
 * The X-Card's full exclusion end to end, on the simulated table (issue #321
 * U07): a player's move is narrated on the GM with a sidecar; another player
 * plays the X-Card (relayed to the canonical GM); the GM resumes with
 * `!x clear`; the next move's narration is built without the removed beat —
 * not in RECENT SCENE, not in the ledger block — and with the redirect; the
 * move after that carries no redirect. Every value comes from its production
 * writer (the move pipeline, the relay, the narrator).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';

let table;
const world = () => table.world.campaignState();

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1', sceneTruths: [],
    sceneState: { bySubject: {}, sceneId: 'sc-1' },
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
  let narrations = 0;
  table.claude.respond((call) => {
    if (call.model !== NARRATION_MODEL) return '{}';
    narrations += 1;
    if (narrations === 1) {           // the first move: the beat the X-Card removes
      return 'The interrogator lifts the cutting torch toward the prisoner\'s hand.\n```json\n' + JSON.stringify({
        newTruths:    [{ subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' }],
        stateChanges: [{ subject: 'the prisoner', attribute: 'condition', value: 'burned hand' }],
        sceneFrame:   { location: 'the interrogation cell', present: ['the prisoner'], situation: 'The torch hovers over his hand' },
      }) + '\n```';
    }
    return 'The corridor lights flicker as you walk.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  });
});

const moveNarrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText));

describe('an X-Card on a move narration, end to end', () => {
  it('removes the beat from what the next narration reads, redirects it once, and the beat stays out', async () => {
    await table.client('pl-1').chat('I press the prisoner for the code.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(world().sceneTruths.map(t => t.fact)).toContain('His hand was burned with a cutting torch');

    // Ren plays the X-Card; the GM resumes.
    await table.client('pl-2').chat('!x');
    await table.settle();
    expect(world().xCardActive).toBe(true);
    const removed = table.cards(f => f.narratorCard && /cutting torch/.test(f.narrationText ?? ''));
    expect(removed.map(c => c.flags[MODULE_ID].xCarded)).toEqual([true]);
    expect(world().sceneTruths.find(t => /cutting torch/.test(t.fact))).toMatchObject({ retracted: true, retractedBy: 'xcard' });

    await table.client('gm-1').chat('!x clear');
    await table.settle();
    expect(world().xCardActive).toBe(false);

    // The next move is narrated without the beat, and with the redirect.
    await table.client('pl-1').chat('I walk out of the cell.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    const [, next] = moveNarrations();
    expect(next).toBeDefined();
    expect(next.system).toContain('## X-CARD — REDIRECT');
    expect(`${next.system}\n${next.userText}`).not.toMatch(/cutting torch|burned hand|interrogation cell/);
    expect(world().xCardRedirect).toBeNull();               // delivered — cleared

    // The move after that: no redirect, and the beat still out.
    await table.client('pl-2').chat('I check the corridor.', { speaker: { actor: 'pc-quinn' } });
    await table.settle();
    const third = moveNarrations()[2];
    expect(third).toBeDefined();
    expect(third.system).not.toContain('X-CARD — REDIRECT');
    expect(`${third.system}\n${third.userText}`).not.toMatch(/cutting torch|burned hand|interrogation cell/);
  });
});
