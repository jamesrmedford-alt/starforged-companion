/**
 * PROBE UPG-1 — VEHICLE-COMPANION-MISS-FREE-AT-ZERO (RULES)
 *
 * Vendored Withstand Damage: "suffer -1 integrity … If your integrity is 0,
 * Lose Momentum equal to any remaining damage. … On a miss, it's worse than
 * you thought. Suffer an additional -1 integrity or Lose Momentum (-2)."
 * Vendored Companion Takes a Hit: "If your companion's health is 0, Lose
 * Momentum equal to any remaining harm. … On a miss … They suffer an
 * additional -1 health or you Lose Momentum (-2)."
 *
 * Issue #325 W14 (RESIST-MISS-FREE-AT-ZERO) fixed this for Endure Harm /
 * Endure Stress: their miss's "-1 health / -1 spirit" was a clamped meter
 * delta, free at 0, and now runs the executor so the overflow is momentum
 * (decisions.md issue #314 Q02 "Harm or stress past the meter is momentum").
 * The two sibling suffer moves were left as bare clamped deltas:
 *   src/moves/resolver.js:1018  withstand_damage miss → { integrity: -1 }
 *   src/moves/resolver.js:1045  companion_takes_a_hit miss → { companionHealth: -1 }
 *   src/moves/sufferDialog.js:331-344 runSufferCall "meter" → applyVehicleAssetIntegrityChange /
 *     applyVehicleIntegrity / applyCompanionHealthChange — each clamps at 0
 *   src/entities/ship.js:336 (updateShip clamps), src/character/actorBridge.js:635, :665
 * (Endure Harm's own miss runs the executor: sufferExecutor.js splitOverflow /
 * overflowToMomentum, endureHarm.)
 * So at 0 integrity (where the roll is +0 and a miss the likely result), or a
 * companion at 0 health, "-1 integrity" / "-1 companion health" costs nothing
 * — the card says "Applied: integrity -1" — while the other option costs 2
 * momentum.
 *
 * Scenario (booted GM + player table, the real pipeline, scripted dice):
 *   1. Kira's command vehicle is at integrity 0 (or her companion at health 0);
 *      momentum 2.
 *   2. She types Withstand Damage (Companion Takes a Hit); it misses.
 *   3. She picks "-1 integrity" ("-1 companion health") on the choice card.
 *   Expected: the damage the vehicle cannot take is Lose Momentum (2 → 1).
 *   Actual: momentum stays 2; nothing is paid.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({ ...control.interpretation, playerNarration: narration, inputMethod: 'chat' })),
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
      for (const r of control.dice) dice.mockReturnValueOnce(r);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'Metal screams as the hull buckles.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// d10 challenge dice 0.85 → 9, 0.95 → 10; d6 action die 0.2 → 2: a miss at +0..+3.
const MISS = [0.85, 0.95, 0.2];

let table, kira;
const world = () => table.world.campaignState();
const sufferCards = (moveId) => table.cards(f => f.sufferCard && f.moveId === moveId && !f.priceCard);

async function typedMove(interpretation, dice) {
  control.interpretation = interpretation;
  control.dice = dice;
  await table.client('pl-1').chat('It hits hard.', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

async function choose(moveId, i) {
  const cards = sufferCards(moveId);
  expect(cards, 'one suffer-choice card').toHaveLength(1);
  table.client('pl-1').click(cards[0]._id, `[data-option-index="${i}"]`);
  await table.settle();
  await table.drain();
  return table.world.message(cards[0]._id);
}

function companion(id, value) {
  const item = {
    id, name: id, type: 'asset',
    system: { category: 'Companion', abilities: [], track: { enabled: true, name: 'Health', value, min: 0, max: 3 } },
    update: async (changes) => {
      if ('system.track.value' in changes) item.system.track.value = changes['system.track.value'];
    },
  };
  return item;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'upg1-s1', sessionNumber: 1,
      currentSceneId: 'upg1-sc', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  scriptClaude(table, { fallback: () => REPLY });
});

describe('UPG-1 Withstand Damage — a miss at 0 integrity', () => {
  let ship;
  async function withShip(integrity) {
    kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2 } } });
    ship = table.addActor({ id: 'ship-wayfarer', name: 'Wayfarer', type: 'starship', flags: { [MODULE_ID]: {
      entityType: 'ship',
      ship: { _id: 'ship-rec', name: 'Wayfarer', isCommandVehicle: true, integrity, integrityMax: 5, battered: false },
    } } });
    await table.client('gm-1').run(() => game.settings.set(MODULE_ID, 'campaignState', { ...world(), shipIds: [ship.id] }));
  }
  const move = { moveId: 'withstand_damage', moveName: 'Withstand Damage', statUsed: 'integrity', adds: 0, confidence: 1 };
  const integrity = () => ship.flags[MODULE_ID].ship.integrity;

  it('control: above 0, the miss\'s "-1 integrity" dents the hull and costs no momentum', async () => {
    await withShip(2);
    await typedMove(move, MISS);
    const resolved = await choose('withstand_damage', 0);
    expect(resolved.content).toContain('integrity -1');
    expect({ integrity: integrity(), momentum: kira.system.momentum.value }).toEqual({ integrity: 1, momentum: 2 });
  }, 60_000);

  it('at 0 integrity, the damage the hull cannot take is Lose Momentum (-1)', async () => {
    await withShip(0);
    await typedMove(move, MISS);
    const resolved = await choose('withstand_damage', 0);
    expect(resolved.flags[MODULE_ID].resolved).toBe(true);
    expect(resolved.content).toContain('Applied: integrity -1');   // the card says it was paid
    expect(integrity()).toBe(0);
    // "If your integrity is 0, Lose Momentum equal to any remaining damage."
    expect(kira.system.momentum.value, 'the remaining damage is momentum').toBe(1);
  }, 60_000);
});

describe('UPG-1 Companion Takes a Hit — a miss at 0 companion health', () => {
  let glow;
  const move = { moveId: 'companion_takes_a_hit', moveName: 'Companion Takes a Hit', statUsed: 'companion_health', adds: 0, confidence: 1 };

  it('at 0 health, the harm the companion cannot take is Lose Momentum (-1)', async () => {
    glow = companion('glowcat', 0);
    kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2 } },
      items: { contents: [glow] } });
    await typedMove(move, MISS);
    const [card] = sufferCards('companion_takes_a_hit');
    expect(card.flags[MODULE_ID].executorOpts.companionItemId).toBe('glowcat');
    const resolved = await choose('companion_takes_a_hit', 0);
    expect(resolved.flags[MODULE_ID].resolved).toBe(true);
    expect(glow.system.track.value).toBe(0);
    // "If your companion's health is 0, Lose Momentum equal to any remaining harm."
    expect(kira.system.momentum.value, 'the remaining harm is momentum').toBe(1);
  }, 60_000);
});

describe('UPG-1 control — the human meter the module already charges (issue #325 W14)', () => {
  it('control: Endure Harm\'s resist miss at 0 health — "-1 health" costs a momentum', async () => {
    kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
      system: { momentum: { value: 2 }, health: { value: 0 }, iron: 0 } });
    await typedMove({ moveId: 'endure_harm', moveName: 'Endure Harm', statUsed: 'iron', adds: 0, confidence: 1 }, MISS);
    await choose('endure_harm', 0);
    expect({ health: kira.system.health.value, momentum: kira.system.momentum.value }).toEqual({ health: 0, momentum: 1 });
  }, 60_000);
});
