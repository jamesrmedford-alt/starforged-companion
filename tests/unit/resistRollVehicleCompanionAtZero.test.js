/**
 * STARFORGED COMPANION
 * tests/unit/resistRollVehicleCompanionAtZero.test.js
 *
 * Issue #362 D8 (RESIST-ROLL-AT-ZERO-FOR-SHIPS-AND-COMPANIONS; the
 * maintainer's answer A — issue #330 D3's shape for Withstand Damage and
 * Companion Takes a Hit at 0). The vendored moves: Withstand Damage — "If
 * your integrity is 0, Lose Momentum equal to any remaining damage. Then, if
 * your integrity is 0 or you choose to resist the damage, roll +integrity …
 * On a miss … If your integrity is 0, also suffer a cost according to the
 * vehicle type" (a command vehicle: battered or cursed, a module broken, a
 * broken module destroyed, or the vehicle-damage table; a support vehicle:
 * battered or the table); Companion Takes a Hit — "Then, if their health is
 * 0 … roll +your companion's health … On a miss … If your companion's health
 * is 0, they are out of action until given aid. If their health is 0 and you
 * rolled a miss with a match on this move, they are dead or destroyed".
 *
 * Before: a damage step at 0 rolled the vehicle-damage d100 at once (a Face
 * Danger miss could put "Immediate catastrophic destruction" on the table
 * with no Withstand Damage rolled), no resist roll was offered for either,
 * and "companion destroyed" keyed on the originating move's match. Now the
 * step takes the meter and the overflow; at 0 a card's press rolls the move
 * for that vehicle / companion, and only that roll's own miss offers the
 * vehicle's cost or says the companion's fate (with its own match).
 *
 * Booted GM + player table (tests/helpers/multiClient.js): the real
 * pipeline, the dice scripted at resolveMove's boundary.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
// A forced move skips the interpreter; its one-stat reading (issue #362 D11) reads nothing here.
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { applyPayThePriceSufferFromRelay } from '../../src/index.js';

// d10 challenge dice, then the d6 action die (resolveMove): at +0 a miss —
const MISS       = [0.85, 0.95, 0.2];   // 9, 10; action 2
const MISS_MATCH = [0.85, 0.85, 0.2];   // 9, 9 — a match; action 2

let table, kira, ship;
const gm = () => table.client('gm-1');
const gmCtx = { requesterId: 'gm-1', requesterIsGM: true };
const live = (card) => table.world.message(card._id);
const resistCards = (key) => table.cards(f => f.sufferCard && f.sufferPrompt?.resist === key);
const vehicleCostCards = () => table.cards(f => f.sufferCard && f.sufferPrompt?.atZero === 'integrity');
const tableCards = () => table.cards(f => f.suffer === 'impact_table');
const missCard = (moveId) => table.cards(f => f.sufferCard && f.moveId === moveId && !f.priceCard
  && f.sufferPrompt?.options?.some(o => o.atZeroChoice)).at(-1);

/** A vendor-shaped asset with a condition track (a Companion's Health, a Support Vehicle's Integrity). */
function trackAsset(id, category, trackName, value, max, conditions = []) {
  const item = {
    id, name: id.charAt(0).toUpperCase() + id.slice(1), type: 'asset',
    system: { category, abilities: [], track: { enabled: true, name: trackName, value, min: 0, max }, conditions },
    update: async (changes) => {
      if ('system.track.value' in changes) item.system.track.value = changes['system.track.value'];
      if ('system.conditions' in changes) item.system.conditions = changes['system.conditions'];
      return item;
    },
  };
  return item;
}

async function reset({ items = [], shipIntegrity = null } = {}) {
  await table.reset({ world: { settings: {
    holdResultForUpgrade: false, chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'd8-s1', sessionNumber: 1,
      currentSceneId: 'd8-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { momentum: { value: 3 }, health: { value: 5 } }, items: { contents: items } });
  ship = null;
  if (shipIntegrity !== null) {
    ship = table.addActor({ id: 'ship-wayfarer', name: 'Wayfarer', type: 'starship',
      system: { debility: { battered: false, cursed: false } },
      flags: { [MODULE_ID]: { entityType: 'ship',
        ship: { _id: 'ship-rec', name: 'Wayfarer', isCommandVehicle: true, integrity: shipIntegrity, integrityMax: 5,
          battered: false, cursed: false, integritySheetReconciled: true } } } });
    await gm().run(() => game.settings.set(MODULE_ID, 'campaignState', { ...table.world.campaignState(), shipIds: [ship.id] }));
    await table.settle();
  }
  scriptClaude(table, { fallback: () => 'Metal screams.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
}
const integrity = () => ship.flags[MODULE_ID].ship.integrity;

async function click(card, selector) {
  await table.client('pl-1').click(card._id, selector);
  await table.settle(); await table.drain();
}
const pressFirst = (card) => click(card, '[data-action="sf-suffer-pick"][data-option-index="0"]');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe('issue #362 D8 — Withstand Damage at 0 owes the resist roll; its own miss offers the vehicle\'s cost', () => {
  beforeEach(() => reset({ shipIntegrity: 1 }));

  it('a Pay the Price "Your vehicle suffers damage" at 1 integrity: integrity 0, no vehicle-damage d100 — a resist card for the ship', async () => {
    const res = await gm().run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: 'withstand_damage', amount: 1 }], actorId: kira.id }, gmCtx));
    await table.settle(); await table.drain();
    expect(integrity()).toBe(0);
    expect(res.landed[0]).toMatchObject({ after: 0, atZero: true, resistOwed: true });
    expect(tableCards(), 'the vehicle-damage table is rolled by no step').toEqual([]);
    const [resist] = resistCards('integrity');
    expect(resist, 'the resist card').toBeTruthy();
    expect(resist.flags[MODULE_ID].executorOpts.vehicleActorId).toBe(ship.id);
    expect(vehicleCostCards()).toEqual([]);
  }, 30_000);

  it('its press rolls Withstand Damage as Kira (+the ship\'s 0); the miss\'s "-1 integrity" at 0 offers the cost, not another resist card', async () => {
    await gm().run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: 'withstand_damage', amount: 1 }], actorId: kira.id }, gmCtx));
    await table.settle(); await table.drain();
    const [resist] = resistCards('integrity');
    control.dice = MISS;
    await pressFirst(resist);
    const [post] = table.cards(f => f.forcedMoveId === 'withstand_damage');
    expect(table.world.message(post._id).speaker?.actor).toBe(kira.id);
    expect(post.flags[MODULE_ID].forcedMoveTargetId ?? null, 'the command vehicle is the default').toBeNull();
    const rolled = table.cards(f => f.moveResolution).at(-1);
    expect(rolled.content).toMatch(/Withstand Damage/);
    expect(rolled.content.replace(/\s+/g, ' ')).toMatch(/Action: 2 \+ 0 = <strong>2<\/strong>/);

    const miss = missCard('withstand_damage');
    expect(miss, 'the miss card').toBeTruthy();
    await pressFirst(miss);                         // "-1 integrity": 0 → 0, a momentum
    expect(kira.system.momentum.value).toBe(2);
    const [cost] = vehicleCostCards();
    expect(cost, 'the vehicle-type cost').toBeTruthy();
    expect(cost.flags[MODULE_ID].sufferPrompt.options.map(o => o.label)).toEqual([
      'Mark the vehicle as battered', 'Mark the vehicle as cursed', 'Mark a module as broken (on the starship sheet)',
      'Destroy a broken module (discard it on the starship sheet)', 'Roll on the vehicle-damage table']);
    expect(live(cost).content).toMatch(/At 0 integrity Wayfarer suffers a cost by its type/);
    expect(resistCards('integrity'), 'no second resist roll').toHaveLength(1);
    expect(tableCards()).toEqual([]);
  }, 30_000);

  it('the cost card marks the ship battered — the canonical native impact — and then offers battered no more', async () => {
    await gm().run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: 'withstand_damage', amount: 1 }], actorId: kira.id }, gmCtx));
    await table.settle(); await table.drain();
    control.dice = MISS;
    await pressFirst(resistCards('integrity')[0]);
    await pressFirst(missCard('withstand_damage'));
    const [cost] = vehicleCostCards();
    await pressFirst(cost);
    expect(ship.system.debility.battered).toBe(true);
    expect(live(cost).flags[MODULE_ID].resolved).toBe(true);
    expect(live(cost).content).toMatch(/marked the vehicle battered/);
  }, 30_000);

  it('…or rolls the vehicle-damage table once, its row on the card and in the narrator\'s memory', async () => {
    await gm().run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: 'withstand_damage', amount: 1 }], actorId: kira.id }, gmCtx));
    await table.settle(); await table.drain();
    control.dice = MISS;
    await pressFirst(resistCards('integrity')[0]);
    await pressFirst(missCard('withstand_damage'));
    const [cost] = vehicleCostCards();
    await click(cost, '[data-action="sf-suffer-pick"][data-option-index="4"]');
    const rolled = tableCards();
    expect(rolled).toHaveLength(1);
    expect(rolled[0].flags[MODULE_ID]).toMatchObject({ table: 'vehicle_damage', oracleMemory: { name: 'Vehicle Damage' } });
    expect(live(cost).content).toMatch(/rolled the vehicle-damage table/);
  }, 30_000);

  it('control: damage that leaves integrity above 0 owes nothing', async () => {
    await reset({ shipIntegrity: 3 });
    await gm().run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: 'withstand_damage', amount: 1 }], actorId: kira.id }, gmCtx));
    await table.settle(); await table.drain();
    expect(integrity()).toBe(2);
    expect(resistCards('integrity')).toEqual([]);
    expect(tableCards()).toEqual([]);
  }, 30_000);
});

describe('issue #362 D8 — a support vehicle\'s resist roll is its own', () => {
  it('the Hoverbike at 0: its resist card rolls +its integrity, not the ship\'s, and its cost is battered or the table', async () => {
    const bike = trackAsset('hoverbike', 'Support Vehicle', 'Integrity', 1, 5, [{ name: 'Battered', ticked: false }]);
    await reset({ items: [bike], shipIntegrity: 5 });
    const { withstandDamage } = await gm().import('../../src/moves/sufferExecutor.js');
    const step = await gm().run(() => withstandDamage(kira, 'hoverbike', 1, {}));
    await table.settle(); await table.drain();
    expect(step).toMatchObject({ after: 0, resistOwed: true, isCommandVehicle: false });
    expect(integrity(), 'the ship untouched').toBe(5);
    const [resist] = resistCards('integrity');
    expect(resist.flags[MODULE_ID].executorOpts.vehicleItemId).toBe('hoverbike');

    control.dice = MISS;
    await pressFirst(resist);
    const [post] = table.cards(f => f.forcedMoveId === 'withstand_damage');
    expect(post.flags[MODULE_ID]).toMatchObject({ forcedMoveTargetId: 'hoverbike', forcedMoveTarget: 'Hoverbike' });
    const rolled = table.cards(f => f.moveResolution).at(-1);
    // +the Hoverbike's 0 — the ship's 5 would be "2 + 5 = 7".
    expect(rolled.content.replace(/\s+/g, ' ')).toMatch(/Action: 2 \+ 0 = <strong>2<\/strong>/);

    await pressFirst(missCard('withstand_damage'));
    const [cost] = vehicleCostCards();
    expect(cost.flags[MODULE_ID].executorOpts.vehicleItemId).toBe('hoverbike');
    expect(cost.flags[MODULE_ID].sufferPrompt.options.map(o => o.label)).toEqual(['Mark the vehicle as battered', 'Roll on the vehicle-damage table']);
    await pressFirst(cost);
    expect(bike.system.conditions).toEqual([{ name: 'Battered', ticked: true }]);
    expect(ship.system.debility.battered, 'not the ship').toBe(false);
  }, 30_000);
});

describe('issue #362 D8 — Companion Takes a Hit at 0 owes the resist roll; its own miss says the companion\'s fate', () => {
  let glow, rock;
  beforeEach(async () => {
    glow = trackAsset('glowcat', 'Companion', 'Health', 1, 3);
    rock = trackAsset('rockhorn', 'Companion', 'Health', 4, 5);
    await reset({ items: [glow, rock] });
  });

  async function harmTheGlowcat() {
    const { companionTakesAHit } = await gm().import('../../src/moves/sufferExecutor.js');
    const step = await gm().run(() => companionTakesAHit(kira, 'glowcat', 1, { isMiss: true, isMissWithMatch: true }));
    await table.settle(); await table.drain();
    return step;
  }

  it('the harm step at 0 owes the resist roll for that companion — never "destroyed" on the originating move\'s match', async () => {
    const step = await harmTheGlowcat();
    expect(step).toMatchObject({ after: 0, atZero: true, resistOwed: true });
    expect(glow.system.track.value).toBe(0);
    expect(table.cards(f => f.destroyed === true)).toEqual([]);
    const [resist] = resistCards('companionHealth');
    expect(resist.flags[MODULE_ID].executorOpts.companionItemId).toBe('glowcat');
    expect(live(resist).content).toMatch(/Test Glowcat's resilience — roll Companion Takes a Hit/);
  }, 30_000);

  it('its press rolls +the Glowcat\'s health (0, not the Rockhorn\'s 4); a miss with a match leaves it dead or destroyed', async () => {
    await harmTheGlowcat();
    control.dice = MISS_MATCH;
    await pressFirst(resistCards('companionHealth')[0]);
    const [post] = table.cards(f => f.forcedMoveId === 'companion_takes_a_hit');
    expect(post.flags[MODULE_ID]).toMatchObject({ forcedMoveTargetId: 'glowcat', forcedMoveTarget: 'Glowcat' });
    const rolled = table.cards(f => f.moveResolution).at(-1);
    expect(rolled.content.replace(/\s+/g, ' ')).toMatch(/Action: 2 \+ 0 = <strong>2<\/strong>/);

    const miss = missCard('companion_takes_a_hit');
    expect(miss.flags[MODULE_ID].executorOpts).toMatchObject({ isMissWithMatch: true, companionItemId: 'glowcat' });
    await pressFirst(miss);                         // "-1 companion health": 0 → 0, a momentum
    const [fate] = table.cards(f => f.suffer === 'companion_takes_a_hit' && f.atZero === true && 'destroyed' in f);
    expect(fate.flags[MODULE_ID].destroyed).toBe(true);
    expect(fate.content).toMatch(/Glowcat is dead or destroyed/);
    expect(rock.system.track.value).toBe(4);
    expect(resistCards('companionHealth'), 'no second resist roll').toHaveLength(1);
  }, 30_000);

  it('a miss with no match leaves it out of action until given aid', async () => {
    await harmTheGlowcat();
    control.dice = MISS;
    await pressFirst(resistCards('companionHealth')[0]);
    await click(missCard('companion_takes_a_hit'), '[data-action="sf-suffer-pick"][data-option-index="1"]');   // Lose Momentum (-2)
    const [fate] = table.cards(f => f.suffer === 'companion_takes_a_hit' && f.atZero === true && 'destroyed' in f);
    expect(fate.flags[MODULE_ID].destroyed).toBe(false);
    expect(fate.content).toMatch(/Glowcat is out of action until given aid/);
  }, 30_000);

  it('control: harm that leaves the companion above 0 owes nothing', async () => {
    const { companionTakesAHit } = await gm().import('../../src/moves/sufferExecutor.js');
    const step = await gm().run(() => companionTakesAHit(kira, 'rockhorn', 1, {}));
    await table.settle(); await table.drain();
    expect(step).toMatchObject({ after: 3, atZero: false });
    expect(step.resistOwed ?? false).toBe(false);
    expect(resistCards('companionHealth')).toEqual([]);
  }, 30_000);
});
