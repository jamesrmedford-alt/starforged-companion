/**
 * STARFORGED COMPANION
 * tests/unit/fightThresholdCardFollowsItsRoll.test.js
 *
 * Known-issues FIGHT-COMMIT-CARD-AFTER-THE-ROLL — the long haul's second live
 * run (2026-11-23, steps a24–a32).
 *
 * The player typed "…I turn the Kobayashi IV to face her and enter the fray."
 * The move was rolled (Enter the Fray, a weak hit; "You are in control"
 * chosen), and the "⚔ A fight looms" card — which makes the fight's track —
 * was posted ABOVE the roll card, its button labelled "⚔ Enter the Fray", the
 * move just rolled. The player chose the vow on it and waited: the roll read
 * as the fight begun. No track was made, and the five beats of the fight
 * (a miss and its price, a burn, a reload mid-fight, the decisive action) had
 * nothing to act on.
 *
 * The card is now posted after its roll card, says the roll has not made the
 * fight's track, and its button is "⚔ Begin the fight". The track is still
 * made only by that button (decisions.md "Combat is offered, not forced").
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    ...control.interpretation, playerNarration: narration, inputMethod: 'chat',
  })),
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
      for (const r of control.dice) dice.mockReturnValueOnce(r);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { buildCombatThresholdHtml, BEGIN_FIGHT_LABEL } from '../../src/moves/combatThreshold.js';

const REPLY = 'The cutter slides into your forward view.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table, journal;

function makeTracksJournal() {
  const flags = {};
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = JSON.parse(JSON.stringify(value)); },
  };
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat', name: 'Mira Kestrel', ownership: { 'pl-1': 3 } });
  journal = makeTracksJournal();
  table.journal._set(journal);
  scriptClaude(table, { fallback: () => REPLY });
});

// Enter the Fray +edge: challenge 2 and 3, action 6 + edge 2 = 8 — a strong hit (in control).
const FRAY_STRONG = [0.15, 0.25, 0.9];

describe('the fight threshold card follows the Enter the Fray it answers (FIGHT-COMMIT-CARD-AFTER-THE-ROLL)', () => {
  it('is posted after the roll card, and its button is not the move\'s name', async () => {
    control.interpretation = {
      moveId: 'enter_the_fray', moveName: 'Enter the Fray', statUsed: 'edge', adds: 0,
      moveTarget: 'Ashen Wake', combatRank: 'dangerous', rationale: 'test', mischiefApplied: false,
    };
    control.dice = FRAY_STRONG;
    await table.client('pl-1').chat('The raider cutter Ashen Wake jumps me off Bleakhold; I turn to face her and enter the fray.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    await table.drain();

    const all = table.cards();
    const roll = all.findIndex(m => m.flags?.[MODULE_ID]?.moveResolution === true);
    const threshold = all.findIndex(m => m.flags?.[MODULE_ID]?.combatThresholdCard === true);
    expect(roll, 'the roll card').toBeGreaterThanOrEqual(0);
    expect(threshold, 'the threshold card').toBeGreaterThanOrEqual(0);
    expect(threshold, 'the threshold card stands below its roll').toBeGreaterThan(roll);

    const content = all[threshold].content;
    expect(content).toContain(`>${BEGIN_FIGHT_LABEL}</button>`);
    expect(content).not.toContain('>⚔ Enter the Fray</button>');
    expect(content).toMatch(/Your Enter the Fray is rolled, but the fight's track is not made yet/);
    // Still the card that makes the track — nothing made by the roll itself.
    expect(journal.getFlag(MODULE_ID, 'tracks') ?? []).toEqual([]);
  });
});

describe('the card says the roll has not made the fight', () => {
  it('names its button, and offers the way out', () => {
    const html = buildCombatThresholdHtml({ label: 'Ashen Wake', suggestedRank: 'dangerous', vowNames: ['Find the raiders'], position: 'in_control' });
    expect(html).toContain('⚔ A fight looms — Ashen Wake');
    expect(html).toContain('data-action="sf-enter-fray">⚔ Begin the fight</button>');
    expect(html).toContain('data-action="sf-way-out">🚪 Find another way</button>');
    expect(html).toMatch(/press <strong>⚔ Begin the fight<\/strong> to begin it — or look for a way out instead/);
    expect(html).not.toMatch(/Commit to the fight, or look for a way out/);
  });
});
