/**
 * PROBE — MC-01 FULFIL-LEGACY-NUMERIC-RANK (eighth bug audit, moves-core)
 *
 * What the user does: a PC fulfils an epic vow (a vow Item on their sheet —
 * every vow sworn today is an Item; the panel no longer makes journal vow
 * tracks) with Fulfill Your Vow, typed through the move pipeline or rolled on
 * the foundry-ironsworn sheet.
 *
 * What happens: the quests legacy gets 2 ticks — a dangerous vow's reward —
 * whatever the vow's rank. The vendor stores a vow Item's rank as a
 * ChallengeRank NUMBER (1 troublesome … 5 epic, ChallengeRank._cast turns a
 * written "epic" into 5). The payoff passes that number to
 * expedition.js legacyRewardTicks, whose normalizeExpeditionRank only knows
 * the rank NAMES: "5" is unknown, so every vow pays as "dangerous" (2 ticks on
 * a strong hit, 1 on a weak hit). An epic vow should pay 3 boxes (12 ticks),
 * an extreme 2 boxes, a formidable 1 box, a troublesome 1 tick.
 *
 * What should happen: the reward follows the vow's rank, numeric or named
 * (schemas.js rankName / rankTicks already accept both).
 *
 * The pipeline case is driven on a booted table (tests/helpers/multiClient.js)
 * like tests/unit/vowAttribution.test.js, whose fixtures carry the string
 * rank "dangerous" — the one rank the bug pays correctly.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Challenge dice 3 and 4 (a full track scores 10: a strong hit).
const control = vi.hoisted(() => ({ dice: [0.25, 0.35], interpret: null }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ ...control.interpret })),
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
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { resolveMove } from '../../../src/moves/resolver.js';
import { legacyRewardTicks } from '../../../src/moves/expedition.js';

const MODULE_ID = 'starforged-companion';
const EPIC = 5;   // foundry-ironsworn ChallengeRank.RANK.Epic

describe('legacyRewardTicks and the vendor rank (unit hop)', () => {
  it('control: the rank name "epic" pays 3 boxes (12 ticks)', () => {
    expect(legacyRewardTicks('epic', 0)).toBe(12);
  });

  it('the vendor\'s numeric epic rank (5) pays 3 boxes too', () => {
    expect(legacyRewardTicks(EPIC, 0)).toBe(12);
  });

  it('a weak hit on a numeric extreme vow (4) pays one rank lower: formidable, 1 box', () => {
    expect(legacyRewardTicks(4, 1)).toBe(4);
  });
});

describe('a Fulfill Your Vow strong hit on an epic vow Item pays the epic reward', () => {
  let table;
  let vow;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
    } } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    vow = {
      id: 'v-epic', name: 'Bring down the Hegemony', type: 'progress',
      // As the live system stores it: rank is a ChallengeRank number.
      system: { subtype: 'vow', rank: EPIC, current: 40, completed: false },
      flags: { [MODULE_ID]: { vowId: 'vid-epic' } },
      update: async (changes) => {
        if ('system.completed' in changes) vow.system.completed = changes['system.completed'];
        if ('system.current' in changes) vow.system.current = changes['system.current'];
      },
      setFlag: async (mod, key, val) => { (vow.flags[mod] ??= {})[key] = val; },
    };
    table.addActor({ id: 'pc-bex', name: 'Bex', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
    resolveMove.mockClear();
  });

  it('pipeline: the quests legacy gets 12 ticks (3 boxes), not a dangerous vow\'s 2', async () => {
    control.interpret = {
      moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', statUsed: null, adds: 0,
      isProgressMove: true, moveTarget: 'Bring down the Hegemony', rationale: 'test', mischiefApplied: false,
    };
    await table.client('pl-1').chat('At last the Hegemony falls, as I swore it would.', { speaker: { actor: 'pc-bex' } });
    await table.settle();

    expect(resolveMove).toHaveBeenCalledTimes(1);
    expect(resolveMove.mock.results[0].value.outcome).toBe('strong_hit');
    expect(vow.system.completed).toBe(true);                   // the vow did close
    const cs = table.world.campaignState();
    expect(cs.legacyTracks?.quests?.ticks ?? 0).toBe(12);
  });

  it('control: with the rank NAME on the Item (as unit fixtures write it), the card is posted and 12 ticks paid', async () => {
    vow.system.rank = 'epic';
    control.interpret = {
      moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', statUsed: null, adds: 0,
      isProgressMove: true, moveTarget: 'Bring down the Hegemony', rationale: 'test', mischiefApplied: false,
    };
    await table.client('pl-1').chat('At last the Hegemony falls, as I swore it would.', { speaker: { actor: 'pc-bex' } });
    await table.settle();
    expect(table.cards(f => f.fulfillVowCard)[0]?.content ?? '').toContain('Vow Fulfilled: Bring down the Hegemony');
    expect(table.world.campaignState().legacyTracks?.quests?.ticks ?? 0).toBe(12);
  });

  it('pipeline: the "⚑ Vow Fulfilled" card is posted for the epic vow', async () => {
    silenceConsoleErrors();
    control.interpret = {
      moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', statUsed: null, adds: 0,
      isProgressMove: true, moveTarget: 'Bring down the Hegemony', rationale: 'test', mischiefApplied: false,
    };
    await table.client('pl-1').chat('At last the Hegemony falls, as I swore it would.', { speaker: { actor: 'pc-bex' } });
    await table.settle();

    expect(vow.system.completed).toBe(true);
    // postFulfillVowCard capitalises `track.rank` with String#charAt: the
    // vendor's number throws, the pipeline's catch only warns, no card.
    const card = table.cards(f => f.fulfillVowCard)[0];
    expect(card?.content ?? '').toContain('Vow Fulfilled: Bring down the Hegemony');
  });
});
