/**
 * PROBE — CONTINUITY-01 CONSISTENCY-CHECK-STALE-LEDGER — the move pipeline, on
 * the multi-client table (the unit twin is consistencyCheckStaleLedger.probe.js;
 * the flow is tests/unit/xcardLiveLedger.test.js's, issue #325 W05, which pinned
 * the narration PROMPT — this probe looks at the audit call that follows it).
 *
 * What the user does: Pat's move is narrated (the torch beat). Ren types the
 * next move; while it waits at its confirm dialog Pat plays the X-Card on the
 * torch beat and the GM resumes. Ren confirms.
 *
 * What happens: the pipeline narrates Ren's move from its pre-dialog snapshot.
 * The narration prompt reads the live ledger (W05), but applyNarratorSidecar
 * (src/narration/narrator.js:3499) hands the snapshot to runConsistencyCheck,
 * so the Haiku audit of Ren's prose is built over the snapshot's ledger
 * (consistencyCheck.js:65–69): the X-carded torch truth sits under ACTIVE SCENE
 * TRUTHS, its state under ACTIVE SCENE STATE and its frame under SCENE FRAME —
 * the removed beat, handed to the audit as the scene's binding facts.
 *
 * What should happen: the audit, like the prompt, is built from the ledger as
 * it stands in the store (rules/narrator-memory.md 6b; narrator-consistency
 * flow §1: a truth the X-Card retracted is never handed back).
 *
 * Control: the audit of Pat's own narration lists the torch truth as active.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

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

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const AUDIT_MODEL     = 'claude-haiku-4-5-20251001';

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
  await table.reset({ world: { settings: {
    'factContinuity.consistencyCheck': true,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1', sceneTruths: [],
      sceneState: { bySubject: {}, sceneId: 'sc-1' },
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
  let narrations = 0;
  table.claude.respond((call) => {
    if (call.model === AUDIT_MODEL) return '{"contradictions":[]}';
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

/** The consistency-check audits, in order (the Haiku call whose user line asks to audit the narration). */
const audits = () => table.claude.calls.filter(c => c.model === AUDIT_MODEL && /Audit the narration/.test(c.userText));
const section = (prompt, from, to) => (prompt.split(from)[1] ?? '').split(to)[0];

describe('CONTINUITY-01 (pipeline) a move held at its confirm dialog is audited against the ledger as it stands then', () => {
  it("the audit of the post-resume narration is not handed the X-carded beat's truth, state or frame", async () => {
    await table.client('pl-1').chat('I press the prisoner for the code.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(world().sceneTruths.map(t => t.fact)).toContain('His hand was burned with a cutting torch');
    // control: Pat's own narration is audited with the torch truth as active.
    expect(audits()).toHaveLength(1);
    expect(section(audits()[0].system, 'ACTIVE SCENE TRUTHS:', 'RETRACTED FACTS')).toMatch(/cutting torch/);

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

    // Ren confirms: the move is narrated now, and its prose audited.
    control.confirm.resolve(true);
    await table.settle();

    const audit = audits().at(-1);
    expect(audit).toBeDefined();
    expect(audits()).toHaveLength(2);
    expect(section(audit.system, 'NARRATION:', 'Return:')).toMatch(/corridor lights/);     // control: it is Ren's narration's audit
    // Today: the X-carded truth is the audit's BINDING truth, the removed state its scene state, the cell its frame.
    expect(section(audit.system, 'ACTIVE SCENE TRUTHS:', 'RETRACTED FACTS')).not.toMatch(/cutting torch/);
    expect.soft(audit.system).not.toMatch(/cutting torch/);
    expect.soft(section(audit.system, 'ACTIVE SCENE STATE:', 'SHIP POSITION:')).not.toMatch(/burned hand/);
    expect.soft(section(audit.system, 'SCENE FRAME', 'RECORDED IDENTITIES')).not.toMatch(/interrogation cell/);
  }, 30_000);
});
