/* global silenceConsoleErrors -- tests/setup.js */
// EXPLORATORY — not a finding.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude, holdWrites, failWrites, campaignStateWrite } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'Kira keeps her word.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.35, 0.9];

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const vexCards = () => table.cards(f => f.moveResolution && f.actorId === 'pc-vex');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [STRONG, STRONG, STRONG, STRONG, STRONG];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
      lastSessionTimestamp: new Date().toISOString() },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-vex',  name: 'Vex',  ownership: {}, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

async function vexForcedMove(text) {
  let id = null;
  await table.client('gm-1').run(async () => {
    const m = await globalThis.ChatMessage.create({
      content: text,
      speaker: { actor: 'pc-vex', alias: 'Vex' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'face_danger', deferWhileBusy: true } },
    });
    id = m?.id ?? m?._id;
  });
  return id;
}
const isClaim = (w) => campaignStateWrite('gm-1')(w) && w.value?.pendingMove === true && !world().pendingMove;

describe('explore 3 — AA48 order of two held moves', () => {
  it('two held moves, two refused claims: which rolls first?', async () => {
    const claim = holdWrites(table, isClaim);
    await vexForcedMove('FIRST: Vex braces the hatch.');
    await claim.arrived;
    const idM = await vexForcedMove('HELD-OLDER: Vex checks the seals.');
    await table.settle();
    const idN = await vexForcedMove('HELD-YOUNGER: Vex vents the bay.');
    await table.settle();
    failWrites(table, isClaim, { times: 1 });
    claim.fail();
    await table.settle(); await table.drain();
    const order = vexCards().map(m => (m.flags[MODULE_ID].playerNarration ?? m.flags[MODULE_ID].narration ?? m.content ?? '').slice(0, 200));
    console.log('cards', vexCards().length, JSON.stringify(vexCards().map(m => Object.keys(m.flags[MODULE_ID]))).slice(0, 400));
    console.log('order', JSON.stringify(order).slice(0, 1200));
    console.log('notes', JSON.stringify(table.client('gm-1').notifications.map(n => n.message)));
    await table.client('gm-1').run(() => game.settings.set(MODULE_ID, 'campaignState',
      { ...game.settings.get(MODULE_ID, 'campaignState'), loreRecap: 'ok' }));
    await table.settle(); await table.drain();
    console.log('cards after', vexCards().length, world().pendingMove);
    console.log('narr order', JSON.stringify(narrations().map(c => (c.userText.match(/(FIRST|HELD-OLDER|HELD-YOUNGER)/) ?? [])[0])));
  }, 60_000);
});
