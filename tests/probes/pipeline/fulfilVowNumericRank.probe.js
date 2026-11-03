/**
 * PROBE — IP-01 FULFIL-VOW-NUMERIC-RANK (eighth audit, area index-pipeline)
 *
 * What the user does: a player types a Fulfill Your Vow for a vow on their
 * character sheet (an Item — every vow in a current world; the panel offers
 * no journal "vow" track any more), and the progress roll is a strong hit.
 *
 * What happens: the vendor stores a progress Item's rank as a ChallengeRank
 * NUMBER (vendor/foundry-ironsworn/src/module/fields/ChallengeRank.ts — its
 * _cast turns "extreme" into 4; schemas.js says so above RANK_KEY_BY_NUMBER).
 * The pipeline's item-only fulfil branch (src/index.js, the `else if
 * (itemDone)` arm) hands that number to legacyRewardTicks, whose
 * normalizeExpeditionRank("4") falls back to "dangerous": an extreme vow pays
 * 2 quests ticks instead of 8 (an epic 2 instead of 12, a troublesome 2
 * instead of 1). Then postFulfillVowCard calls `track.rank.charAt(...)` on
 * the number, which throws before its try — the "⚑ Vow Fulfilled" card is
 * never posted (the pipeline's .catch only warns).
 *
 * What should happen: the quests legacy pays the vow's own rank (play kit,
 * Fulfill Your Vow: troublesome 1 tick, dangerous 2, formidable 1 box,
 * extreme 2 boxes, epic 3 boxes; a weak hit one rank lower) and the fulfil
 * card is posted naming the rank.
 *
 * The control runs the same move with the rank written as the string the
 * unit-test fixtures use ("extreme") — it passes today, so the defect is
 * exactly the vendor's numeric form.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ ...control.interpretation })),
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
    // Challenge dice 3 and 4 against a full track (score 10): a strong hit.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The oath is kept.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table;

function vowItem(rank) {
  const item = {
    id: 'v-archive', name: 'Find the archive', type: 'progress',
    system: { subtype: 'vow', rank, current: 40, completed: false },
    flags: { [MODULE_ID]: { vowId: 'vid-archive' } },
    update: async (changes) => {
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
      if ('system.current' in changes) item.system.current = changes['system.current'];
    },
    setFlag: async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; },
  };
  return item;
}

async function fulfil(rank) {
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vowItem(rank)] } });
  control.interpretation = {
    moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', statUsed: null, isProgressMove: true,
    moveTarget: 'Find the archive', adds: 0, rationale: 'test', mischiefApplied: false,
  };
  await table.client('pl-1').chat('I lay the archive coordinates before the council: my vow is kept.', { speaker: { actor: 'pc-pat' } });
  await table.settle();
  await table.drain();
}

const questTicks = () => table.world.campaignState().legacyTracks?.quests?.ticks ?? 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table, { fallback: () => REPLY });
});

describe('IP-01 a fulfilled vow pays its own rank and posts its card', () => {
  it('an extreme vow (the vendor stores rank 4) pays 2 boxes of quests legacy and posts the fulfil card', async () => {
    await fulfil(4);

    expect(table.cards(f => f.moveResolution)[0]?.flags?.[MODULE_ID]).toBeDefined();   // the move rolled
    expect.soft(questTicks()).toBe(8);                                     // actual: 2 (read as "dangerous")
    expect.soft(table.cards(f => f.fulfillVowCard)).toHaveLength(1);       // actual: 0 (charAt on a number threw)
  }, 30_000);

  it('control: the same vow with its rank written as the string "extreme" pays 8 ticks and posts the card', async () => {
    await fulfil('extreme');

    expect(questTicks()).toBe(8);
    expect(table.cards(f => f.fulfillVowCard)).toHaveLength(1);
  }, 30_000);
});
