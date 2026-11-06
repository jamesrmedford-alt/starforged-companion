/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundUpgradeRiderPicker.test.js
 *
 * Issue #342 Z28 ROUND-UPGRADE-RIDER-PICKER-SUPERSEDED (the eleventh audit's
 * UPG-3; issue #336 Y19 × Batch Mode, issue #340).
 *
 * Kira is unprepared, and an asset of hers costs "Sacrifice Resources (-1)"
 * whenever its move is made (a stand-in for Weapon Master's Strike, Trader's
 * Compel / Sojourn). Her round entry rolls a weak hit and, in the round's
 * upgrade step, she burns momentum to a strong hit. The round narrates the
 * strong hit; then each entry's finishMove runs the asset riders with the
 * FINAL outcome but the ORIGINAL resolution's id. The rider's supply loss
 * while unprepared is another suffer move's (Y19): its "Make a suffer move
 * (-1)" picker was posted bound to that resolution — whose move card is
 * burned — so Kira's first pick was refused as a choice of the superseded
 * outcome and the picker retired: the cost never paid. A picker posted once
 * its move's result was upgraded is now the upgraded outcome's own.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
// The asset whose ability the move is made with — a stand-in for Weapon Master's
// "Then, Sacrifice Resources (-1)" — found by the scan; its rider is extracted
// by the (scripted) Haiku pass below.
const KIT = {
  key: 'kit:0', assetId: 'kit', assetName: 'Salvage Rig', abilityName: '', category: 'Path', source: 'character',
  text: 'When you Face Danger by burning the rig\'s reserves, take +1 momentum on a hit. Then, Sacrifice Resources (-1).',
  adds: 0, detection: 'structured', resultImprovement: null, statReplacement: null,
};
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => [KIT]),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const ROUND_REPLY = 'Kira forces the hatch as the rig sputters.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const RIDERS = JSON.stringify({ abilities: [{ key: 'kit:0', riders: [
  { condition: 'any', resource: 'supply', amount: -1, optional: false, choiceGroup: null, label: '-1 supply' },
] }] });
// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK = [0.35, 0.75, 0.4];

let table, kira;
const round = () => table.world.getSetting('batchMode.round');
const pickers = () => table.cards(f => f.sufferCard && f.sufferPrompt?.kind === 'any'
  && Array.isArray(f.sufferPrompt.exclude) && f.sufferPrompt.exclude.includes('sacrifice_resources'));

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] },
    system: { momentum: { value: 9 }, supply: { value: 2 }, health: { value: 5, max: 5 }, debility: { unprepared: true } } });
  scriptClaude(table, { fallback: () => ROUND_REPLY })
    .when(call => /CONSEQUENCE RIDERS/.test(call.system ?? ''), RIDERS, { times: 99 });
  silenceConsoleErrors();
});

/** Kira's round: her Face Danger rolls a weak hit; the round waits on her upgrade. */
async function weakHitRound() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  control.dice = [WEAK];
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I burn the rig\'s reserves to force the hatch.', submissionId: 'sub-1' });
  const r = round();
  await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
  await table.drain();
  expect(round()).toMatchObject({ phase: 'upgrading' });
  return round().entries['pl-1'].rolled;
}

async function pickEndureHarm(picker) {
  await relay('pl-1', 'suffer.pick', { messageId: picker._id, pickKind: 'any', sufferId: 'endure_harm' });
  await table.drain();
}

describe('Z28 — a round entry upgraded before its narration: its riders\' redirected supply loss', () => {
  it('control: kept as rolled, the rider\'s supply loss goes to a picker whose pick is made', async () => {
    await weakHitRound();
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    await table.drain();
    expect(round()).toMatchObject({ number: 2 });

    const [picker] = pickers();
    expect(picker).toBeTruthy();
    expect(kira.system.supply.value).toBe(2);                       // unprepared: the supply is not the payer
    await pickEndureHarm(picker);
    expect(kira.system.health.value).toBe(4);                        // the cost is paid as Endure Harm (-1)
    expect(table.world.message(picker._id).flags[MODULE_ID].superseded).not.toBe(true);
  }, 30_000);

  it('burned to a strong hit in the upgrade step: the strong hit\'s rider owes the loss, and its picker takes the pick', async () => {
    const rolled = await weakHitRound();
    await relay('pl-1', 'move.burnMomentum', { messageId: rolled.cardId });
    await table.drain();
    expect(table.world.message(rolled.cardId).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(round()).toMatchObject({ number: 2 });                     // narrated (the strong hit) and closed

    const [picker] = pickers();
    expect(picker).toBeTruthy();                                       // the riders ran, for the strong hit
    expect(picker.flags[MODULE_ID].resolutionId).toBe(rolled.resolutionId);
    await pickEndureHarm(picker);

    expect(table.world.message(picker._id).flags[MODULE_ID].superseded).not.toBe(true);
    expect(kira.system.health.value).toBe(4);
  }, 30_000);

  it('control (free-flow): a picker posted before the burn still leaves with the outcome it superseded (#311 P03)', async () => {
    control.dice = [WEAK];
    await table.client('pl-1').chat('I burn the rig\'s reserves to force the hatch.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await table.drain();
    const [picker] = pickers();
    expect(picker).toBeTruthy();                                       // the riders ran right after the record
    expect(picker.flags[MODULE_ID].upgraded).not.toBe(true);
    const card = table.cards(f => f.moveResolution && f.actorId === 'pc-kira').at(-1);
    await relay('pl-1', 'move.burnMomentum', { messageId: card._id ?? card.id });
    await table.drain();
    expect(table.world.message(card._id ?? card.id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(table.world.message(picker._id).flags[MODULE_ID].superseded).toBe(true);
  }, 30_000);
});
