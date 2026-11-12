/**
 * STARFORGED COMPANION
 * tests/unit/tdaCostOneRoll.test.js
 *
 * Known-issues TDA-COST-DOUBLE-ROLL — a Take Decisive Action weak hit's cost
 * is rolled once (the issue #321 U03 shape). resolveMove's oracle seeds
 * rolled one decisive-action cost for the move narration, and the pipeline's
 * cost card rolled another — the one whose suffer route the table paid. The
 * narration now depicts the card's cost, and the table is rolled once.
 *
 * End to end on a booted table (tests/helpers/multiClient.js), as
 * payThePriceOneRoll.test.js: a player's narration goes through the GM's real
 * pipeline with the interpretation and dice scripted at their boundaries, and
 * the cost table answering two different entries in roll order.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ costRolls: 0, interpretation: null, dice: null }));
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
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});
// Two cost entries, in roll order — with no suffer route, so no suffer card
// gets in the way. Every other table rolls for real.
const ENTRIES = ['You are separated from your allies', 'Your victory is fleeting'];
vi.mock('../../src/oracles/roller.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    rollOracle: vi.fn((tableId, ...rest) => {
      if (tableId !== 'decisive_action_cost') return original.rollOracle(tableId, ...rest);
      const result = ENTRIES[control.costRolls % ENTRIES.length];
      control.costRolls += 1;
      return { roll: 60 + control.costRolls, result, sufferRoutes: [], tableName: 'Take Decisive Action — Weak Hit Cost' };
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';

let table;

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const flags = {};
  return {
    id:      'tracks-journal',
    name:    'Starforged Progress Tracks',
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = JSON.parse(JSON.stringify(value)); },
  };
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.costRolls = 0;
  control.dice = null;
  await table.reset({ world: { settings: { chronicleAutoEntry: false, campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.journal._set(makeTracksJournal());
});

describe('a Take Decisive Action weak hit rolls its cost once (TDA-COST-DOUBLE-ROLL)', () => {
  it('the move narration is seeded with the cost the card shows and the table pays', async () => {
    const gm = table.client('gm-1');
    const store = await gm.import('../../src/ui/progressTracks.js');
    await gm.run(async () => {
      const t = await store.addProgressTrack({ label: 'Boarders', type: 'combat', rank: 'dangerous' });
      await store.updateTrackFields(t.id, { ticks: 24, combatState: 'in_control' });
    });

    // Score 6 (24 ticks) against challenge dice 3 and 9 — a weak hit.
    control.dice = [0.25, 0.85];
    control.interpretation = {
      moveId: 'take_decisive_action', moveName: 'Take Decisive Action', statUsed: null, adds: 0,
      isProgressMove: true, moveTarget: 'Boarders', rationale: 'test', mischiefApplied: false,
    };
    await table.client('pl-1').chat('I drive them back through the breach.', { speaker: { actor: 'pc-pat' } });
    await table.settle();

    const [card] = table.cards(f => f.decisiveActionCostCard);
    expect(card, 'the cost card').toBeDefined();
    expect(card.content).toContain(ENTRIES[0]);                         // the first and only roll

    const narration = table.claude.calls.find(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText));
    expect(narration).toBeDefined();
    const seeded = [...narration.system.matchAll(/^Decisive-action cost: (.+)$/gm)].map(m => m[1]);
    expect(seeded).toEqual([ENTRIES[0]]);
    expect(control.costRolls).toBe(1);
  });
});
