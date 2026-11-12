/**
 * Issue #342 Z09 ROUND-CAPTURE-CREDITS-FIRST-ROLLER, on the simulated table
 * (the eleventh audit's CONT-6 ROUND-CONNECTION-WRONG-NPC; the narrateRound
 * unit cases are roundConnectionBondHolder.test.js).
 *
 * A Batch Mode round: Ren compels the smuggler Kade; Kira makes a connection
 * with Ilsa Marr, the dockmaster. The round is narrated once, and its capture
 * is one detection pass over the whole round narration. routeEntityDrafts used
 * to auto-create "the first connection-typed draft" of the reply — in a round,
 * any player's NPC, in the order the prose names them (the round narrates its
 * entries in confirm order) — as Kira's connection: her bond Item, her
 * connection seed, stamped with the round's narration. Kade, whom Ren
 * threatened, became Kira's connection; Ilsa Marr went to the GM's draft
 * card. Now each Make a Connection hit creates the figure its own roller met
 * (runRoundNarrationPasses → connectionRollers): Kira's line names Ilsa Marr.
 *
 * Real producers: the round driver (relays, readings, rolls, narration), the
 * round capture and routeEntityDrafts / createConnection; the detection
 * pass's reply is scripted (both NPCs, in prose order).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpret: null, dice: [], detection: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => control.interpret(text)),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => control.detection()),
  appendGenerativeTierUpdates: vi.fn(async () => []),
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

const NARRATION_MODEL = 'claude-sonnet-5-5';
const ROUND_REPLY = 'Ren leans on Kade until the smuggler gives up the shipment. Across the bay, Kira wins over Ilsa Marr, the dockmaster, with a share of the cargo.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3 and 4, action die 6 (+2 = 8): a strong hit.
const STRONG = [0.25, 0.35, 0.9];
const KIRA_LINE = 'I win over Ilsa Marr, the dockmaster, with a share of the cargo.';
const REN_LINE  = 'I threaten the smuggler Kade until he talks.';
const MOVES = {
  [KIRA_LINE]: { moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart', adds: 0, rationale: 'a new contact', mischiefApplied: false },
  [REN_LINE]:  { moveId: 'compel', moveName: 'Compel', statUsed: 'iron', adds: 0, rationale: 'a threat', mischiefApplied: false },
};
const KADE = { name: 'Kade', type: 'connection', description: 'A smuggler who gave up the shipment under threat.', salience: 'notable' };
const ILSA = { name: 'Ilsa Marr', type: 'connection', description: 'The dockmaster, won over with a share of the cargo.', salience: 'notable' };

let table;
const round = () => table.world.getSetting('batchMode.round');
let seq = 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.interpret = (text) => ({ ...(MOVES[text] ?? MOVES[REN_LINE]) });
  control.dice = [STRONG, STRONG];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? ROUND_REPLY : '{}') });
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function submitAndConfirm(userId, text) {
  const submissionId = `sub-${userId}-${++seq}`;
  await relay(userId, 'batch.submit', { roundId: round().id, text, submissionId });
  const r = round();
  await relay(userId, 'batch.confirm', { roundId: r.id, submissionId: r.entries[userId].submissionId, choices: {} });
}

/** The connections the round's capture made, by name. */
const createdConnections = () => [...table.actors.values?.() ?? table.actors.contents ?? []]
  .filter(a => a?.flags?.[MODULE_ID]?.entityType === 'connection' && a.flags[MODULE_ID].connection?.createdFromNarrationId)
  .map(a => a.flags[MODULE_ID].connection.name);

async function playRound(detected) {
  control.detection = () => ({ worldJournal: {}, entities: detected.map(e => ({ ...e })), renames: [] });
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  await submitAndConfirm('pl-2', REN_LINE);    // Ren confirms first: his action leads the narration
  await submitAndConfirm('pl-1', KIRA_LINE);
  await table.drain();
  expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  const card = table.cards(f => f.narratorCard && f.roundId)[0];
  expect(card.flags[MODULE_ID].roundEntries.map(e => [e.playerName, e.moveId, e.outcome]))
    .toEqual([['Ren', 'compel', 'strong_hit'], ['Kira', 'make_a_connection', 'strong_hit']]);
}

describe("CONT-6 — a round's Make a Connection", () => {
  it("creates the roller's NPC, never the NPC another player's action named", async () => {
    await playRound([KADE, ILSA]);                       // the reply names them in the prose's order
    const made = createdConnections();
    const kirasBonds = (table.actors.get('pc-kira').items?.contents ?? []).map(i => i.name);
    expect.soft(kirasBonds, "the bond on Kira's sheet").not.toContain('Kade');
    expect.soft(made, "Kira's Make a Connection made Ilsa Marr").toContain('Ilsa Marr');
    expect(made, "Ren's smuggler as Kira's connection").not.toContain('Kade');
  }, 30_000);

  it("control: with only Kira's NPC detected, the round creates her", async () => {
    await playRound([ILSA]);
    expect(createdConnections()).toEqual(['Ilsa Marr']);
  }, 30_000);
});
