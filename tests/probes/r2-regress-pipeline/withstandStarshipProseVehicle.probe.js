/**
 * PROBE R2P-1 — WITHSTAND-STARSHIP-HIT-TAKEN-BY-MENTIONED-VEHICLE (WRONG-TARGET)
 * A regression of issue #342 Z53 (WITHSTAND-DAMAGE-COMMAND-VEHICLE-ONLY).
 *
 * Z53 made a Withstand Damage the support vehicle's when the move names one.
 * Two halves of the fix disagree about what a null target means:
 *   - src/moves/interpreter.js:180 (the interpreter's contract) — withstand_damage's
 *     moveTarget is "the vehicle taking the damage when it is one of the
 *     character's support vehicles, by its name … — null for the command
 *     starship".
 *   - src/moves/statEnrichment.js:485-491 selectNamedVehicleAsset — a target
 *     that names nothing (`!target.trim()`) falls back to the NARRATION and takes
 *     any support vehicle it mentions (namedOnce :324-340: the full name, or its
 *     first or last word — "Snub Fighter" by "fighter", "Service Pod" by "pod").
 *   So the starship's own hit — the null the contract asks for — is given to a
 *   support vehicle the line merely mentions: :149-156 sets statValue to that
 *   asset's track and vehicleItemId to it (vehicleActorId null), and the card's
 *   choices change that asset (sufferDialog.js:331-334
 *   applyVehicleAssetIntegrityChange), not the ship record.
 *   tests/unit/withstandDamageSupportVehicle.test.js's "a target naming the
 *   starship keeps the starship, whatever else the narration mentions" hand-sets
 *   moveTarget 'the Wayfarer' — the value the interpreter is told not to give.
 *
 * Scenario (booted GM + player table, the real pipeline, real resolveMove):
 *   1. Kira has the Snub Fighter asset (vendored shape: Support Vehicle, Integrity
 *      track). The crew's command vehicle Wayfarer is at integrity 4 of 5.
 *   2. In a dogfight Kira types "An enemy fighter rakes the Wayfarer's hull with
 *      cannon fire — I hold her together." The interpreter, as its prompt says
 *      for the starship, gives withstand_damage with moveTarget null.
 *   3. A miss; she takes the card's "-1 integrity".
 *   Expected: the starship's roll — the card's vehicle is the Wayfarer, its
 *     integrity 4 → 3, the Snub Fighter untouched (4).
 *   Actual: the Snub Fighter's roll (vehicleItemId) — its track 4 → 3, the
 *     Wayfarer still 4.
 *   The same with the Hoverbike by its full name ("The Wayfarer shudders as the
 *   hoverbike breaks loose in the hold.").
 *
 * Control: the same hit narrated without a vehicle word lands on the Wayfarer.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (narration) => ({ ...control.interpretation, playerNarration: narration, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'Sparks fly across the deck.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// d10 challenge dice 0.85 → 9, 0.95 → 10; d6 action die 0.2 → 2: a miss.
const MISS = [0.85, 0.95, 0.2];

let table, ship, asset;
const world = () => table.world.campaignState();
const sufferCards = () => table.cards(f => f.sufferCard && f.moveId === 'withstand_damage');
const shipIntegrity = () => ship.flags[MODULE_ID].ship.integrity;

/** A vendor-shaped support vehicle (json-packs/starforged-assets/<name>): Integrity track, Battered condition. */
function supportVehicle(id, name, value) {
  const item = {
    id, name, type: 'asset',
    system: { category: 'Support Vehicle', abilities: [],
      track: { enabled: true, name: 'Integrity', value, min: 0, max: 4 },
      conditions: [{ name: 'Battered', ticked: false }] },
    update: async (changes) => {
      if ('system.track.value' in changes) item.system.track.value = changes['system.track.value'];
    },
  };
  return item;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function setUp(vehicle) {
  control.dice = MISS;
  // The interpreter's contract for the command starship (interpreter.js:180): no target.
  control.interpretation = { moveId: 'withstand_damage', moveName: 'Withstand Damage', statUsed: 'integrity',
    moveTarget: null, adds: 0, rationale: 'probe', mischiefApplied: false, confidence: 'high' };
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'r2p1-s1', sessionNumber: 1,
      currentSceneId: 'r2p1-sc', sceneTruths: [], shipIds: ['ship-wayfarer'],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  asset = vehicle;
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [asset] } });
  ship = table.addActor({ id: 'ship-wayfarer', name: 'Wayfarer', type: 'starship', flags: { [MODULE_ID]: {
    entityType: 'ship',
    ship: { _id: 'ship-rec', name: 'Wayfarer', isCommandVehicle: true, integrity: 4, integrityMax: 5, battered: false },
  } } });
  scriptClaude(table, { fallback: () => REPLY });
}

/** Kira types the hit; the canonical GM's pipeline rolls it; she takes "-1 integrity" (option 0 on a miss). */
async function hitAndTakeIntegrityLoss(text) {
  await table.client('pl-1').chat(text, { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
  const cards = sufferCards();
  expect(cards, 'one Withstand Damage choice card').toHaveLength(1);
  const opts = cards[0].flags[MODULE_ID].executorOpts ?? {};
  table.client('pl-1').click(cards[0]._id, '[data-option-index="0"]');
  await table.settle(); await table.drain();
  return { vehicleItemId: opts.vehicleItemId ?? null, vehicleActorId: opts.vehicleActorId ?? null };
}

describe('R2P-1 — a starship Withstand Damage whose line mentions a support vehicle', () => {
  it('control: the starship\'s hit, narrated with no vehicle word, dents the Wayfarer', async () => {
    await setUp(supportVehicle('asset-snub', 'Snub Fighter', 4));
    const card = await hitAndTakeIntegrityLoss('A railgun slug rakes the Wayfarer\'s hull — I hold her together.');
    expect(world().pendingMove).toBe(false);
    expect(card).toEqual({ vehicleItemId: null, vehicleActorId: 'ship-wayfarer' });
    expect({ ship: shipIntegrity(), asset: asset.system.track.value }).toEqual({ ship: 3, asset: 4 });
  }, 60_000);

  it('"an enemy fighter rakes the Wayfarer\'s hull" is the Wayfarer\'s hit — not Kira\'s Snub Fighter\'s', async () => {
    await setUp(supportVehicle('asset-snub', 'Snub Fighter', 4));
    const card = await hitAndTakeIntegrityLoss('An enemy fighter rakes the Wayfarer\'s hull with cannon fire — I hold her together.');
    expect({ ...card, ship: shipIntegrity(), asset: asset.system.track.value })
      .toEqual({ vehicleItemId: null, vehicleActorId: 'ship-wayfarer', ship: 3, asset: 4 });
  }, 60_000);

  it('"the Wayfarer shudders as the hoverbike breaks loose" is the Wayfarer\'s hit — not the Hoverbike\'s', async () => {
    await setUp(supportVehicle('asset-hoverbike', 'Hoverbike', 3));
    const card = await hitAndTakeIntegrityLoss('The Wayfarer shudders as the hoverbike breaks loose in the hold.');
    expect({ ...card, ship: shipIntegrity(), asset: asset.system.track.value })
      .toEqual({ vehicleItemId: null, vehicleActorId: 'ship-wayfarer', ship: 3, asset: 3 });
  }, 60_000);
});
