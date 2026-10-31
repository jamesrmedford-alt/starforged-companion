// tests/probes/narration/moveNarrationStaleSnapshot.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// The move pipeline (src/index.js) reads campaignState before the interpreter,
// the ability scan, the confirm dialog, the dice and the Pay the Price roll —
// seconds to minutes — and hands that snapshot to narrateResolution.
// buildNarratorExtras / buildNarratorSystemPrompt read most sections from it.
// A few were moved to the live store (X-Card, clocks, rolling summary); these
// two were not:
//
//  SAFETY-SNAPSHOT-LINES — [1] safety (formatNarratorSafetyContext,
//    src/context/safety.js) reads campaignState.safety from the snapshot: a
//    Private Line (or a Line / Veil) that reaches the store while the move is
//    in flight is missing from that move's narration. rules/reachability.md §9:
//    "A safety-critical flag is read live at the point of use, not from the
//    snapshot".
//
//  NARR-ORACLES-SNAPSHOT — [3b] RECENT ORACLE RESULTS (readRecentOracleResults
//    on the snapshot): an oracle a table-mate asks while the move is in flight
//    (`!oracle yes …` → oracleMemory → the GM capture hook writes the store) is
//    missing from that move's narration, which can then contradict it.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ confirm: null, dice: [0.25, 0.35, 0.9] }));
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
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { parseHTML } from '../../helpers/cardDom.js';
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
  control.dice = [0.25, 0.35, 0.9];   // challenge 3, 4; action 6 → strong hit
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
});

/** The move narration's Claude call (its user message asks to narrate the consequence). */
function moveNarrationCalls() {
  return table.claude.calls.filter(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText));
}

/** The Companion Settings panel's own Private Lines action, on a client (the production writer). */
async function addPrivateLine(userId, text) {
  const c = table.client(userId);
  const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
  const app = { element: parseHTML(`<input name="newPrivateLine" value="${text}">`), render() {} };
  const target = parseHTML('<button></button>').firstElementChild;
  target.dataset.index = '0';
  await c.run(() => SettingsPanelApp.DEFAULT_OPTIONS.actions.addPrivateLine.call(app, null, target));
  await table.settle();
}

describe('move narration reads safety and oracle results live, not from its pre-dialog snapshot', () => {
  it('SAFETY: a Private Line that lands while the move sits at its confirm dialog is a hard stop in that narration', async () => {
    control.confirm = deferred();
    await table.client('pl-2').chat('I pry the maintenance hatch open.', { speaker: { actor: 'pc-quinn' } });
    await table.settle();
    expect(world().pendingMove).toBe(true);                       // the pipeline holds its snapshot

    await addPrivateLine('pl-1', 'spiders');                      // Pat adds a Private Line meanwhile
    expect(JSON.stringify(world().safety?.privateLines ?? [])).toContain('spiders');   // it reached the store

    control.confirm.resolve(true);
    await table.settle();

    const [call] = moveNarrationCalls();
    expect(call).toBeDefined();
    expect(call.system).toMatch(/### PRIVATE LINES[^\n]*\n- spiders/);
  });

  it('WRONG-DETAIL: an !oracle answer a table-mate gets while the move sits at its confirm dialog is in that narration', async () => {
    control.confirm = deferred();
    await table.client('pl-1').chat('I pry the maintenance hatch open.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(world().pendingMove).toBe(true);

    await table.client('pl-2').chat('!oracle yes likely is the hatch rigged');   // Ren asks meanwhile
    await table.settle();
    const answer = table.cards(f => f.oracleCommandCard)[0]?.flags?.[MODULE_ID]?.oracleMemory?.answer;
    expect(answer).toBeTruthy();
    expect(JSON.stringify(world().recentOracles ?? [])).toContain('is the hatch rigged');   // ledgered in the store

    control.confirm.resolve(true);
    await table.settle();

    const [call] = moveNarrationCalls();
    expect(call).toBeDefined();
    expect(call.system).toContain('## RECENT ORACLE RESULTS');
    expect(call.system).toContain('"is the hatch rigged"');
  });
});
