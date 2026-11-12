/**
 * STARFORGED COMPANION
 * tests/unit/payThePriceOneRoll.test.js
 *
 * One result, one Pay the Price (issue #321 U03). A result the pipeline routes
 * to Pay the Price (`routePayThePrice` — a Face Danger miss, Face Defeat …)
 * rolled the table twice: resolveMove's oracle seeds rolled one price for the
 * move narration ("the starting outline"), and the pipeline rolled another for
 * the card — the one whose suffer route, clock ticks and follow-up narration
 * the table got. The narration now depicts the card's price, and the table is
 * rolled once.
 *
 * End to end on a booted table (tests/helpers/multiClient.js): a player's
 * narration goes through the GM's real pipeline, with the interpretation and
 * the dice scripted at their boundaries and the Pay the Price table answering
 * two different entries in roll order.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// dice: [challenge, challenge, action] Math.random values for resolveMove.
const control = vi.hoisted(() => ({ ptpRolls: 0, interpretation: null, dice: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ ...control.interpretation })),
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
      // By default challenge 10, 10; action 1 → a miss
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice ?? [0.95, 0.95, 0.0]) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});
// Two real Pay the Price entries, in roll order — with no suffer route, so no
// suffer card gets in the way. Every other table rolls for real.
const ENTRIES = ['A trusted ally is put in harm\'s way', 'You are separated from something or someone'];
vi.mock('../../src/oracles/roller.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    rollOracle: vi.fn((tableId, ...rest) => {
      if (tableId !== 'pay_the_price') return original.rollOracle(tableId, ...rest);
      const result = ENTRIES[control.ptpRolls % ENTRIES.length];
      control.ptpRolls += 1;
      return { roll: 40 + control.ptpRolls, result, sufferRoutes: [], tableName: 'Pay the Price' };
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-5-5';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.ptpRolls = 0;
  control.dice = null;
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
});

/** The player's narration through the GM's pipeline; the price seeded into the move narration and the card's. */
async function playMove(interpretation, text) {
  control.interpretation = { adds: 0, rationale: 'test', mischiefApplied: false, ...interpretation };
  await table.client('pl-1').chat(text, { speaker: { actor: 'pc-pat' } });
  await table.settle();

  const [card] = table.cards(f => f.payThePriceCard);
  expect(card).toBeDefined();
  const shown = card.flags[MODULE_ID].oracleMemory.answer;            // the price the table sees and pays

  const narration = table.claude.calls.find(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText));
  expect(narration).toBeDefined();
  const seeded = [...narration.system.matchAll(/^Pay the Price: (.+)$/gm)].map(m => m[1]);
  return { seeded, shown };
}

describe('one result, one Pay the Price (issue #321 U03)', () => {
  it('a miss: the move narration is seeded with the price the card shows and the table pays, rolled once', async () => {
    const { seeded, shown } = await playMove(
      { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron' },
      'I sprint for the airlock before it seals.',
    );

    expect(shown).toBe(ENTRIES[0]);                                      // the first and only roll
    expect(seeded).toEqual([shown]);
    expect(control.ptpRolls).toBe(1);
  });

  it('Face Defeat: the narration depicts the card\'s price, rolled once', async () => {
    const { seeded, shown } = await playMove(
      { moveId: 'face_defeat', moveName: 'Face Defeat', statUsed: null },
      'I abandon the fight and fall back.',
    );

    expect(seeded).toEqual([shown]);
    expect(control.ptpRolls).toBe(1);
  });
});

// Issue #325 W03: every routed price was posted through a card written for
// Face Defeat — its oracle memory said the player asked "Face Defeat", and it
// asked for a follow-up narration of the price the move narration (seeded
// with it since U03) already depicts: two narrations, free to contradict.
describe('a routed price is narrated once, under the move that paid it (issue #325 W03)', () => {
  it('a Face Danger miss: no second narration, and the price is recorded under Face Danger', async () => {
    await playMove(
      { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron' },
      'I sprint for the airlock before it seals.',
    );
    await table.drain();

    const [card] = table.cards(f => f.payThePriceCard);
    expect(card.flags[MODULE_ID].oracleMemory.question).toBe('Face Danger');
    expect(card.content).toContain('<em>Face Danger</em>');
    expect(table.cards(f => f.oracleNarrationCard)).toHaveLength(0);
    const recorded = (table.world.campaignState().recentOracles ?? []).map(e => e.question);
    expect(recorded).toEqual(['Face Danger']);
    expect(table.claude.calls.filter(c => /Face Defeat/.test(`${c.system ?? ''}\n${c.userText ?? ''}`))).toHaveLength(0);
  });

  it('Face Defeat\'s own price is recorded under Face Defeat, and narrated once', async () => {
    await playMove(
      { moveId: 'face_defeat', moveName: 'Face Defeat', statUsed: null },
      'I abandon the fight and fall back.',
    );
    await table.drain();

    expect(table.cards(f => f.oracleNarrationCard)).toHaveLength(0);
    const recorded = (table.world.campaignState().recentOracles ?? []).map(e => e.question);
    expect(recorded).toEqual(['Face Defeat']);
  });
});

// Issue #321 U17 (WAYPOINT-MISS-NO-PTP): an Explore a Waypoint miss said "Pay
// the Price" and routed nothing — no card, no suffer route, no clock tick.
describe('an Explore a Waypoint miss pays the price (issue #321 U17)', () => {
  const WAYPOINT = { moveId: 'explore_a_waypoint', moveName: 'Explore A Waypoint', statUsed: 'wits' };

  it('a miss without a match posts the Pay the Price card — once, the price the narration depicts', async () => {
    control.dice = [0.85, 0.95, 0.0];                  // challenge 9, 10; action 1 + wits 2 — a miss, no match
    const { seeded, shown } = await playMove(WAYPOINT, 'I pick through the wreck for anything useful.');

    expect(seeded).toEqual([shown]);
    expect(control.ptpRolls).toBe(1);
  });

  it('control: a miss with a match offers Confront Chaos instead — no price is routed', async () => {
    control.dice = [0.95, 0.95, 0.0];                  // challenge 10, 10 — a match
    control.interpretation = { adds: 0, rationale: 'test', mischiefApplied: false, ...WAYPOINT };
    await table.client('pl-1').chat('I pick through the wreck for anything useful.', { speaker: { actor: 'pc-pat' } });
    await table.settle();

    expect(table.cards(f => f.payThePriceCard)).toHaveLength(0);
    expect(table.cards(f => f.moveResolution)[0].flags[MODULE_ID].waypointOracleCard).toBe('confront_chaos');
  });
});
