/**
 * PROBE — IC VOW-RANK-NUMERIC-LEGACY (pipeline half)
 *
 * What the user does: Fulfill Your Vow through the move pipeline (here the
 * won-fight card's / a "Which vow?" pick's forced move; typed narration takes
 * the same branch) on a vow whose rank the vendor stores as a number — every
 * live vow Item: ProgressModel's `rank` is a ChallengeRank NumberField, so the
 * module's own "epic" is saved as 5.
 *
 * What happens: the fulfil branch (src/index.js ~1382–1400) takes
 * `itemDone.rank` from completeVowItemByName — the raw Item rank, 5 — into
 * legacyRewardTicks, which reads only rank NAMES and defaults to Dangerous
 * (2 ticks), then into postFulfillVowCard, whose `track.rank.charAt(0)`
 * throws on a number: the "⚑ Vow Fulfilled" card is swallowed by its
 * `.catch` (console warning only).
 *
 * What should happen: an Epic vow's strong hit marks 12 Quests ticks and the
 * table sees the fulfil card.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Challenge dice 3 and 4: a full track (score 10) is a strong hit.
const control = vi.hoisted(() => ({ dice: [0.25, 0.35] }));
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The oath is kept.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table;

function vowItem(rank) {
  const item = {
    id: 'v-kade', name: 'Avenge Kade', type: 'progress',
    system: { subtype: 'vow', rank, current: 40, completed: false },
    flags: { [MODULE_ID]: { vowId: 'vid-kade' } },
    update: async (changes) => {
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
      if ('system.current' in changes) item.system.current = changes['system.current'];
    },
    setFlag: async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; },
  };
  return item;
}

async function fulfil() {
  await table.client('pl-1').chat('Attempt to fulfill your vow.', {
    speaker: { actor: 'pc-kira', alias: 'Kira' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'fulfill_your_vow', forcedMoveTarget: 'Avenge Kade' } },
  });
  await table.settle(); await table.drain();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.25, 0.35];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

describe('PROBE IC VOW-RANK-NUMERIC-LEGACY — pipeline fulfil of a vow whose rank the vendor stores as a number', () => {
  it('an Epic vow (rank 5) fulfilled with a strong hit marks 12 Quests ticks and posts its fulfil card', async () => {
    const vow = vowItem(5);
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });

    await fulfil();

    expect(vow.system.completed).toBe(true);                       // the roll hit and closed the vow
    expect(table.world.campaignState().legacyTracks?.quests?.ticks ?? 0).toBe(12);
    expect(table.cards(f => f.fulfillVowCard)).toHaveLength(1);
  }, 30_000);

  it('the same Epic vow (rank 5): the "⚑ Vow Fulfilled" card is posted', async () => {
    const vow = vowItem(5);
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });

    await fulfil();

    expect(vow.system.completed).toBe(true);
    expect(table.cards(f => f.fulfillVowCard)).toHaveLength(1);
  }, 30_000);

  it('control: the same vow with the rank NAME "epic" pays 12 and posts the card', async () => {
    const vow = vowItem('epic');
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });

    await fulfil();

    expect(vow.system.completed).toBe(true);
    expect(table.world.campaignState().legacyTracks?.quests?.ticks ?? 0).toBe(12);
    expect(table.cards(f => f.fulfillVowCard)).toHaveLength(1);
  }, 30_000);
});
