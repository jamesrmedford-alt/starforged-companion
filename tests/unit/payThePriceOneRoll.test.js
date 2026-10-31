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

const control = vi.hoisted(() => ({ ptpRolls: 0, interpretation: null }));
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
      // challenge 10, 10; action 1 → a miss
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.95).mockReturnValueOnce(0.95).mockReturnValueOnce(0.0);
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
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.ptpRolls = 0;
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
