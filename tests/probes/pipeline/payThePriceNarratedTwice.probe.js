/**
 * PROBE — IP-03 PTP-NARRATED-TWICE / PTP-FACE-DEFEAT-LABEL (eighth audit, area
 * index-pipeline)
 *
 * What the user does: a player's move misses and its result routes Pay the
 * Price — here a Face Danger miss (the same branch serves every
 * `routePayThePrice`: Strike / Clash / Gain Ground / React Under Fire misses,
 * Undertake an Expedition and Set a Course misses, Battle, Face Defeat …).
 *
 * What happens: the pipeline's routePayThePrice branch (src/index.js) calls
 * postFaceDefeatPayThePriceCard for every such result. That function was
 * written for Face Defeat and still hard-codes it: its card's oracleMemory is
 * `{ name: "Pay the Price", question: "Face Defeat" }` and it asks for an
 * oracle follow-up narration with `question: "Face Defeat"`. Since issue #321
 * U03 the move's own narration is seeded with that same price
 * (withPayThePriceSeed), so the table now gets the price narrated twice — the
 * move narration and a second "oracle follow-up" narrator card (a second
 * Claude call, written independently, free to contradict the first) — and
 * the narrator is told, in RECENT ORACLE RESULTS and as the follow-up's
 * player line, that the player asked "Face Defeat": a defeat that never
 * happened.
 *
 * What should happen: one narration per result — the move narration already
 * depicts the price (U03) — and the price is recorded under the move that
 * paid it, not "Face Defeat".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
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
    // challenge 10, 10; action 1 + iron 3 = 4: a miss (with a match).
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.95).mockReturnValueOnce(0.95).mockReturnValueOnce(0.0);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});
// A Pay the Price entry with no suffer route, so no suffer card gets in the way.
vi.mock('../../../src/oracles/roller.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    rollOracle: vi.fn((tableId, ...rest) => (tableId === 'pay_the_price'
      ? { roll: 41, result: "A trusted ally is put in harm's way", sufferRoutes: [], tableName: 'Pay the Price' }
      : original.rollOracle(tableId, ...rest))),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The airlock grinds shut on your fingers.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => REPLY });
  control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false };
});

describe('IP-03 a move\'s Pay the Price is narrated once, under the move that paid it', () => {
  it('a Face Danger miss: one narration of the price, and no "Face Defeat" in the narrator\'s memory', async () => {
    await table.client('pl-1').chat('I sprint for the airlock before it seals.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await table.drain();

    expect(table.cards(f => f.payThePriceCard)).toHaveLength(1);
    expect(table.cards(f => f.narratorCard && f.moveId === 'face_danger')).toHaveLength(1);   // the move narration (seeded with the price — U03)
    expect.soft(table.cards(f => f.oracleNarrationCard)).toHaveLength(0);                      // actual: 1 — the price narrated a second time
    const recorded = (table.world.campaignState().recentOracles ?? []).map(e => e.question);
    expect.soft(recorded).not.toContain('Face Defeat');                                        // actual: ["Face Defeat"]
    const followUps = table.claude.calls.filter(c => /Face Defeat/.test(c.userText ?? ''));
    expect.soft(followUps).toHaveLength(0);                                                    // actual: the follow-up's prompt says the player asked "Face Defeat"
    const moveNarration = table.claude.calls.find(c => /Narrate the consequence/.test(c.userText ?? ''));
    expect.soft(moveNarration?.system ?? '').not.toMatch(/Pay the Price: "Face Defeat"/);       // actual: the move narration's RECENT ORACLE RESULTS names "Face Defeat"
  }, 30_000);
});
