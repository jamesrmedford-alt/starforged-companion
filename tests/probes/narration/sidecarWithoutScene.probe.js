// tests/probes/narration/sidecarWithoutScene.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// SIDECAR-NO-SCENE: only move, paced, @scene, the inciting incident and a
// relayed sidecar call ensureSceneStarted. An oracle follow-up (and a session
// / clock vignette, a vow-swearing scene) narrated while no scene is active —
// after End a Session closed it, after `!scene end`, at the start of a session
// — applies its sidecar under currentSceneId null. The next move / paced /
// @scene narration's ensureSceneStarted → startScene sees truths/state and
// implicitly ends that phantom scene: state is discarded, the frame cleared,
// truths archived out of the ledger. This is NARR-INCITING-SCENE (fixed for
// the inciting incident only) on every other sidecar-writing path.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const EMPTY = '```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const world = () => table.world.campaignState();

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  // A session in play with no scene open — End a Session / `!scene end` / a new session.
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-4', sessionNumber: 4, currentSceneId: null, sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.claude.respond((call) => {
    if (call.model !== NARRATION_MODEL) return '{}';
    if (/The player invoked the oracle/.test(call.userText)) {
      return 'A lone figure waves from the derelict\'s airlock — Teo Varga, a salvager, his suit light flickering.\n' +
        '```json\n' + JSON.stringify({
          newTruths:    [{ subject: 'Teo Varga', fact: 'salvager camped aboard the derelict (he/him)' }],
          stateChanges: [{ subject: 'Teo Varga', attribute: 'location', value: 'the derelict airlock' }],
          sceneFrame:   { location: 'the derelict airlock', present: ['Teo Varga'], situation: 'Teo is waving the PC over' },
        }) + '\n```';
    }
    return `The hatch groans open.\n${EMPTY}`;
  });
});

describe('an oracle follow-up narrated with no scene open keeps what it established', () => {
  it('the first move after it still sees the frame and Teo\'s whereabouts', async () => {
    await table.client('pl-1').chat('!oracle yes likely is anyone aboard the derelict');
    await table.settle();
    expect(world().sceneFrame?.location).toBe('the derelict airlock');    // the follow-up's sidecar landed…
    expect(world().currentSceneId ?? null).toBe(null);                     // …under no scene

    await table.client('pl-1').chat('I wave back and cross to the airlock.', { speaker: { actor: 'pc-pat' } });
    await table.settle();

    const move = table.claude.calls.find(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText));
    expect(move).toBeDefined();
    expect(move.system).toContain('Where:   the derelict airlock');
    expect(move.system).toMatch(/Teo Varga — location: the derelict airlock/);
  });
});
