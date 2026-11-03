// tests/probes/narration/xcardStaleLedgerMoveNarration.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NR XCARD-STALE-LEDGER — a move narrated after an X-Card, from a pipeline
// snapshot taken before it, hands the removed beat back to the narrator.
//
// What the user does: Pat's move is narrated (the interrogator lifts a cutting
// torch — its sidecar ledgers the prisoner's burned hand and the cell). Ren
// types the next move; while it waits at its confirm dialog, Pat plays the
// X-Card on the torch beat and the GM resumes (`!x clear`). Ren confirms.
//
// What happens: the X-Card retracted the beat's truths, removed its state and
// cleared its frame in the store (applyXCardToNarratorMemory, issue #321 U07),
// and the ring leaves its card out. But Ren's narration is built from the
// pipeline's pre-dialog snapshot: buildNarratorSystemPrompt renders the
// [6.5] ACTIVE SCENE block (formatLedgerSection → buildLedgerBlock) from the
// campaignState narrateResolution was handed, which still holds the torch
// truth, the "burned hand" state and the interrogation-cell frame as BINDING
// facts — right next to the X-CARD — REDIRECT block that says the beat did not
// happen. U08 moved [1] safety and [3b] oracles to the store; the ledger stayed
// on the snapshot. (The same staleness renders a `!truth strike` made during
// the dialog as a binding truth, not under CORRECTED.)
//
// What should happen: the narration's ledger block is read as it stands in the
// store when the narration is built — nothing the X-Card removed.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ confirm: null }));
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
  confirmInterpretation: vi.fn(() => (control.confirm ? control.confirm.promise : Promise.resolve(true))),
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

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';

let table;
const world = () => table.world.campaignState();

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.confirm = null;
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
    if (narrations === 1) {           // Pat's move: the beat the X-Card removes
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

describe('a move held at its confirm dialog across an X-Card is narrated without the removed beat', () => {
  it("the ledger block does not hand back the X-carded beat's truths, state or frame", async () => {
    await table.client('pl-1').chat('I press the prisoner for the code.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(world().sceneTruths.map(t => t.fact)).toContain('His hand was burned with a cutting torch');

    // Ren types the next move; it waits at the confirm dialog.
    control.confirm = deferred();
    await table.client('pl-2').chat('I walk out of the cell.', { speaker: { actor: 'pc-quinn' } });
    await table.settle();
    expect(world().pendingMove).toBe(true);

    // Pat plays the X-Card on the torch beat; the GM resumes.
    await table.client('pl-1').chat('!x');
    await table.settle();
    expect(world().sceneTruths.find(t => /cutting torch/.test(t.fact))).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    await table.client('gm-1').chat('!x clear');
    await table.settle();
    expect(world().xCardActive).toBe(false);

    // Ren confirms: the move is narrated now.
    control.confirm.resolve(true);
    await table.settle();

    const [, next] = moveNarrations();
    expect(next).toBeDefined();
    expect(next.system).toContain('## X-CARD — REDIRECT');                       // control: it is the post-resume narration
    expect(next.system).not.toMatch(/cutting torch|burned hand|interrogation cell/);
  }, 30_000);
});
