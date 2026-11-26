/**
 * STARFORGED COMPANION
 * tests/unit/repairPointsSpentFromTheCard.test.js
 *
 * Issue #389 #5, REPAIR-POINTS-UNREACHABLE. The sixth live long haul's a62
 * Repair, a strong hit, posted "Gain repair points: facility 5, field 3, under
 * fire 2. Spend: …" with no button: the points are spent in the repair dialog,
 * which only a typed `!repair` opened, and the card never said so. The ship
 * stayed at integrity 4 of 5 to the end of the run while the narration and
 * the recap had her flank patched.
 *
 * Now a Repair hit's card carries "🔧 Spend repair points". It opens the
 * dialog on the clicker's client, set to the roll's outcome. Apply relays the
 * spends to the GM, as `!repair` does, and the GM stamps the card spent: a
 * roll's points are spent once. A miss earns none and has no button.
 *
 * On a booted table: the pipeline's own roll, the reading and the dice
 * scripted at their boundaries (the harness of everyCardFollowsItsRoll.test.js).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({ ...control.interpretation, playerNarration: narration, inputMethod: 'chat' })),
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
import { repairPointsOf } from '../../src/index.js';

const REPLY = 'You patch the plating.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// Challenge 1 and 2: a strong hit on 6 + 3. Challenge 10 and 9: a miss.
const STRONG = [0.05, 0.15, 0.9];
const MISS = [0.95, 0.85, 0.9];
const REPAIR = { moveId: 'repair', moveName: 'Repair', statUsed: 'wits' };

let table, ship;
const player = () => table.client('pl-1');
const rollCard = () => table.cards(f => f.moveResolution === true)[0];
const idOf = (m) => m?._id ?? m?.id;
const repairCards = () => table.cards(f => f.repairCard === true);

async function say(line, dice) {
  control.interpretation = { adds: 0, rationale: 'test', mischiefApplied: false, ...REPAIR };
  control.dice = dice;
  await player().chat(line, { speaker: { actor: 'pc-mira' } });
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'rp-s3', sessionNumber: 3,
      currentSceneId: 'rp-sc', sceneTruths: [], shipIds: ['ship-1'] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table, { fallback: () => REPLY });
  table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', ownership: { 'pl-1': 3 },
    system: { wits: 3, iron: 1, edge: 2, heart: 2, supply: { value: 5 }, momentum: { value: 2 } } });
  ship = table.addActor({ id: 'ship-1', type: 'starship', name: 'Kobayashi IV',
    system: { debility: { battered: false } },
    flags: { [MODULE_ID]: { entityType: 'ship',
      ship: { _id: 'ship-guid', name: 'Kobayashi IV', integrity: 4, integrityMax: 5, battered: false, isCommandVehicle: true } } } });
});

describe('a Repair hit\'s points are spent from its card (issue #389 #5)', () => {
  it('names the points a hit earns, and none for a miss or another move', () => {
    expect(repairPointsOf({ moveId: 'repair', outcome: 'strong_hit' })).toEqual({ outcome: 'strong' });
    expect(repairPointsOf({ moveId: 'repair', outcome: 'weak_hit' })).toEqual({ outcome: 'weak' });
    expect(repairPointsOf({ moveId: 'repair', outcome: 'miss' })).toBeNull();
    expect(repairPointsOf({ moveId: 'heal', outcome: 'strong_hit' })).toBeNull();
  });

  it('a62 — the strong hit\'s card offers "🔧 Spend repair points"; the dialog opens on the strong hit, the spend lands, and the card is spent', async () => {
    await say('I go over the scorched flank and the gun feed, patching the plating.', STRONG);
    const card = rollCard();
    expect(card.content).toMatch(/Repair[\s\S]*Strong Hit/);
    expect(card.content).toContain('data-action="sf-repair-spend"');
    expect(card.flags[MODULE_ID].repairPoints).toEqual({ outcome: 'strong' });

    let shown = null;
    player().answerDialogs((d) => {
      shown = d;
      return d.submit({ 'select[name="situation"]': 'facility', 'input[name="integrity"]': '1' });
    });
    player().click(idOf(card), '[data-action="sf-repair-spend"]');
    await table.settle(); await table.drain();

    expect(shown, 'the Repair dialog opened on the clicker\'s client').toBeTruthy();
    expect(shown.form.querySelector('select[name="outcome"]').value).toBe('strong');
    expect(repairCards()).toHaveLength(1);
    expect(ship.flags[MODULE_ID].ship.integrity).toBe(5);
    expect(rollCard().flags[MODULE_ID].repairSpent).toBe(true);
  }, 30_000);

  it('once spent, the button is spent on every client', async () => {
    await say('I patch the plating.', STRONG);
    const card = rollCard();
    player().answerDialogs(d => d.submit({ 'select[name="situation"]': 'facility', 'input[name="integrity"]': '1' }));
    player().click(idOf(card), '[data-action="sf-repair-spend"]');
    await table.settle(); await table.drain();

    let again = false;
    player().answerDialogs(() => { again = true; return null; });
    const btn = player().render(idOf(card)).querySelector('[data-action="sf-repair-spend"]');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('🔧 Repair points spent');
    expect(again).toBe(false);
  }, 30_000);

  it('control: a miss earns no points and offers no button', async () => {
    await say('I patch the plating.', MISS);
    const card = rollCard();
    expect(card.content).toMatch(/Repair[\s\S]*Miss/);
    expect(card.content).not.toContain('sf-repair-spend');
    expect(card.flags[MODULE_ID].repairPoints).toBeUndefined();
  }, 30_000);
});
