// tests/probes/narration/payThePriceDoubleRoll.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NARR-PTP-DOUBLE-ROLL: a miss on any of the 19 PAY_THE_PRICE_ON_MISS moves
// rolls Pay the Price TWICE:
//   1. resolveMove → buildOracleSeeds (src/moves/resolver.js:1418) rolls it as
//      an "advisory" oracle seed → the move narration's [3] ORACLE SEEDS block
//      (formatOracleSeedsBlock, src/narration/narratorPrompt.js);
//   2. the pipeline (src/index.js routePayThePrice → postFaceDefeatPayThePriceCard)
//      rolls it again for the visible card, applies THAT entry's suffer route
//      and clock advance, and narrates it again as an oracle follow-up.
// The move narration depicts price #1 while the table is shown — and pays —
// price #2: two different consequences for one miss.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ ptpRolls: 0 }));
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
      // challenge 10, 10; action 1 → a miss (Face Danger → Pay the Price)
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.95).mockReturnValueOnce(0.95).mockReturnValueOnce(0.0);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});
// Two real Pay the Price entries, in roll order — with no suffer route, so no
// suffer dialog or card gets in the way. Every other table rolls for real.
vi.mock('../../../src/oracles/roller.js', async (importOriginal) => {
  const original = await importOriginal();
  const ENTRIES = ['A trusted ally is put in harm\'s way', 'You are separated from something or someone'];
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

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('one miss, one Pay the Price', () => {
  it('the move narration depicts the price the table is shown and pays', async () => {
    await table.client('pl-1').chat('I sprint for the airlock before it seals.', { speaker: { actor: 'pc-pat' } });
    await table.settle();

    const [card] = table.cards(f => f.payThePriceCard);
    expect(card).toBeDefined();
    const shown = card.flags[MODULE_ID].oracleMemory.answer;            // the price the table sees and pays

    const narration = table.claude.calls.find(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText));
    expect(narration).toBeDefined();
    const seeded = [...narration.system.matchAll(/^Pay the Price: (.+)$/gm)].map(m => m[1]);

    // Correct: one roll — whatever the narrator is seeded with is the card's price.
    expect({ seeded, shown }).toEqual({ seeded: seeded.length ? [shown] : [], shown });
    expect(control.ptpRolls).toBe(1);
  });
});
