/* global silenceConsoleErrors -- tests/setup.js */
/**
 * PROBE — BATCH · ROUND-SETTING-HOLDS-HIDDEN-ROLLS (LEAK)
 *
 * Scenario: Batch Mode is on. A round entry's miss pays "A new enemy is
 * revealed" — the price rolls what that enemy is and wants (Character Role,
 * Goal, Disposition: the hidden rolls behind its plan, issue #353) — or an
 * entry's Undertake an Expedition begins an expedition (its plan request
 * carries two waypoint sightings and "What waits at the end — Action +
 * Theme"). decisions.md → "Hidden oracle rolls (decided): GM-only until the
 * plan's truth is revealed … No hidden roll is on a player-visible card or a
 * card's flags otherwise."
 *
 * Correct: the hidden rolls stay on the GM's client (the narrator's prompt,
 * the Secrets journal) — no player's client is sent them.
 *
 * Today: the round keeps each rolled entry's narration input on the world
 * setting `batchMode.round` (movePipeline.js narrationInputFrom → round.js
 * markRolled): its `oracleSeeds` (the new enemy's role / goal / disposition)
 * and, since issue #353 Phase 3, its `skeletonRequests` (the expedition plan's
 * seeds). A world setting is sent to every client: any player's
 * `game.settings.get("starforged-companion", "batchMode.round")` holds them.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpret: null, dice: [], ptp: [47] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpret, playerNarration: text, inputMethod: 'chat' })),
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
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
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
// The Pay the Price d100, scripted inside the REAL roller (every other table rolls as it does).
vi.mock('../../../src/oracles/roller.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== 'pay_the_price') return real.rollOracle(...args);
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const ROUND_REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 6 and 7, action die 1 (+2): a miss — and momentum 9 beats both dice, so its card offers a burn.
const BURNABLE_MISS = [0.55, 0.65, 0.1];
// challenge 1 and 2: a strong hit — nothing to upgrade.
const STRONG = [0.05, 0.15, 0.9];
const HIDDEN_ROLL = /The new enemy — Character (Role|Goal|Disposition)|What waits at the end — Action \+ Theme|A waypoint — Space Sighting/;

let table;
let roundWrites;
let seq = 0;
const round = () => table.world.getSetting('batchMode.round');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  control.ptp = [47];   // Pay the Price 45–50: "A new enemy is revealed"
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] }, system: { momentum: { value: 9 } } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => ROUND_REPLY });
  silenceConsoleErrors();
  // Every value the world setting is given — what every client is sent.
  roundWrites = [];
  table.interceptWrites((w) => { if (w.kind === 'setting' && /batchMode\.round$/.test(w.key)) roundWrites.push(JSON.stringify(w.value)); });
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}
async function batchModeOn() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
}
async function submitAndConfirm(userId, text) {
  const submissionId = `sub-${userId}-${++seq}`;
  await relay(userId, 'batch.submit', { roundId: round().id, text, submissionId });
  await relay(userId, 'batch.confirm', { roundId: round().id, submissionId, choices: {} });
}
const pass = (userId) => relay(userId, 'batch.pass', { roundId: round().id });

describe('BATCH — the hidden rolls behind a plan and the round\'s world setting', () => {
  it('a new enemy\'s Character Role / Goal / Disposition are not on the round a player\'s client holds', async () => {
    control.interpret = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };
    control.dice = [BURNABLE_MISS];
    await batchModeOn();
    await pass('pl-2');
    await submitAndConfirm('pl-1', 'I slip through the vent before the drones turn.');
    await table.settle();

    // Setup: the miss paid the price that reveals a new enemy, and the round waits on Kira's Burn / Keep.
    expect(table.cards(f => f.payThePriceCard).map(c => c.content).join(' ')).toContain('A new enemy is revealed');
    expect(round()).toMatchObject({ phase: 'upgrading' });
    expect(round().entries['pl-1'].rolled).toMatchObject({ outcome: 'miss' });

    // What Ren's player's browser holds of the round, while Kira decides.
    const onRensClient = JSON.stringify(await table.client('pl-2').getSetting('batchMode.round'));
    // FAILS today: entries.pl-1.rolled.narrationInput.oracleSeeds.results carries the three rolls.
    expect(onRensClient).not.toMatch(HIDDEN_ROLL);
  }, 60_000);

  it('…nor on any value the round setting was written with', async () => {
    control.interpret = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };
    control.dice = [BURNABLE_MISS];
    await batchModeOn();
    await pass('pl-2');
    await submitAndConfirm('pl-1', 'I slip through the vent before the drones turn.');
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    await table.drain();
    expect(table.cards(f => f.narratorCard && f.roundId), 'setup: the round was narrated').toHaveLength(1);
    // FAILS today.
    expect(roundWrites.filter(json => HIDDEN_ROLL.test(json))).toEqual([]);
  }, 60_000);

  it('an expedition\'s plan seeds (its waypoints, what waits at the end) are not on the round setting either', async () => {
    control.interpret = { moveId: 'undertake_an_expedition', moveName: 'Undertake an Expedition', statUsed: 'wits', adds: 0,
      moveTarget: 'the Kepler drift', rationale: 'a journey into the unknown', mischiefApplied: false };
    control.dice = [STRONG];
    await batchModeOn();
    await pass('pl-2');
    await submitAndConfirm('pl-1', 'I chart a course into the Kepler drift.');
    await table.drain();
    expect(table.cards(f => f.narratorCard && f.roundId), 'setup: the round was narrated').toHaveLength(1);
    // Setup: the move began an expedition, whose plan the round's narration was asked to decide.
    const rolled = roundWrites.map(j => JSON.parse(j)).filter(Boolean).map(r => r.entries?.['pl-1']?.rolled).filter(r => r?.narrationInput);
    expect(rolled.length, 'setup: the entry was rolled and kept on the round').toBeGreaterThan(0);
    // FAILS today: narrationInput.skeletonRequests[0].oracleSeeds.
    expect(roundWrites.filter(json => HIDDEN_ROLL.test(json))).toEqual([]);
  }, 60_000);

  it('control: a price that reveals nothing hidden puts no hidden roll on the round — and the round still narrates it', async () => {
    control.ptp = [78];   // "You are harmed"
    control.interpret = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };
    control.dice = [BURNABLE_MISS];
    await batchModeOn();
    await pass('pl-2');
    await submitAndConfirm('pl-1', 'I slip through the vent before the drones turn.');
    expect(round()).toMatchObject({ phase: 'upgrading' });
    expect(JSON.stringify(await table.client('pl-2').getSetting('batchMode.round'))).not.toMatch(HIDDEN_ROLL);
    // The price itself is table knowledge: it is on its card and the round keeps it for the narration.
    expect(JSON.stringify(round())).toContain('Pay the Price: You are harmed');
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    await table.drain();
    const call = table.claude.calls.filter(c => /THIS ROUND/.test(c.userText ?? '')).at(-1);
    expect(call?.userText).toContain('Pay the Price: You are harmed');
  }, 60_000);
});
