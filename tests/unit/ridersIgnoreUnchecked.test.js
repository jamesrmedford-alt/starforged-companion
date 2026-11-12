/**
 * STARFORGED COMPANION
 * tests/unit/ridersIgnoreUnchecked.test.js
 *
 * RIDERS-IGNORE-UNCHECKED — consequence riders were extracted from every
 * ability the scan found and applied after the roll whatever stayed checked
 * on the confirm dialog: the Hoverbike's "+2 momentum on a strong hit" fired
 * with its add left unchecked. The confirm's box is now whether the ability
 * applies this turn — its effects on the outcome included. An ability that
 * carries riders is pre-checked (as one with an add is), so leaving the box
 * alone keeps them; a "choose one (before rolling)" ability unchecked still
 * offers its other options (issue #345 AA12 — chooseOneBeforeRollingSettled).
 *
 * The booted table: a GM and a player; the interpretation, the scan and the
 * extractor's output scripted to their contracts; the confirm answered
 * through the REAL form (renderMoveAbilitiesForm / readMoveAbilitiesForm) with
 * the boxes the test unchecks; the dice scripted (a strong hit).
 */

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], riders: [], abilities: [], uncheck: [] }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ moveId: 'face_danger', moveName: 'Face Danger',
    statUsed: 'edge', adds: 0, playerNarration: text, inputMethod: 'chat', rationale: 'test', mischiefApplied: false })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => structuredClone(control.abilities)),
}));
vi.mock('../../src/moves/consequenceRiders.js', async (original) => ({
  ...(await original()), extractRiders: vi.fn(async () => structuredClone(control.riders)),
}));
// The confirm dialog as its player answers it: the real form, the listed
// boxes unchecked, Accept read as MoveConfirmDialog #onAccept reads it.
vi.mock('../../src/ui/settingsPanel.js', async (original) => {
  const real = await original();
  const { parseHTML } = await import('../helpers/cardDom.js');
  return { ...real, confirmInterpretation: vi.fn(async (interp) => {
    const root = parseHTML(`<div>${real.renderMoveAbilitiesForm(interp.applicableAbilities ?? [], interp.statUsed)}</div>`);
    for (const cb of root.querySelectorAll('.sf-applicable-ability-cb')) {
      if (control.uncheck.includes(cb.dataset.key)) cb.checked = false;
    }
    const { total, applied, pickedStat } = real.readMoveAbilitiesForm(root);
    interp.appliedAbilityAdds = total;
    interp.appliedAbilityKeys = applied;
    interp.appliedStatReplacement = pickedStat || null;
    return true;
  }) };
});
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { dropUncheckedRiders } from '../../src/moves/consequenceRiders.js';
import { defaultChoices } from '../../src/moves/movePipeline.js';

// The Hoverbike's afterburner: an add, and an effect on the outcome.
const HOVERBIKE = { key: 'hb:1', assetId: 'hb', assetName: 'Hoverbike', abilityIndex: 1, source: 'character', adds: 2,
  text: 'When you Face Danger by using the hoverbike\'s speed, add +2 and take +2 momentum on a strong hit.' };
// A rider-only ability: no add, an effect on the outcome.
const FIELD_KIT = { key: 'kit:0', assetId: 'kit', assetName: 'Field Kit', abilityIndex: 0, source: 'character', adds: 0,
  text: 'When you Face Danger, take +1 supply on a strong hit.' };
const RIDERS = [
  { key: 'hb:1', assetName: 'Hoverbike', abilityName: '', riders: [
    { condition: 'strong_hit', resource: 'momentum', amount: 2, optional: false, choiceGroup: null, label: '+2 momentum' }] },
  { key: 'kit:0', assetName: 'Field Kit', abilityName: '', riders: [
    { condition: 'strong_hit', resource: 'supply', amount: 1, optional: false, choiceGroup: null, label: '+1 supply' }] },
];

describe('RIDERS-IGNORE-UNCHECKED — an unchecked ability applies no effect on the outcome (booted table)', () => {
  let table, kira;
  const riderSummary = () => table.cards(f => f.riderSummary).at(-1)?.content ?? '';

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'riu-s1', sessionNumber: 1,
        currentSceneId: 'riu-scene', sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-test');
    kira = table.addActor({ id: 'pc-kira-riu', name: 'Kira', ownership: { 'pl-1': 3 }, system: { edge: 2 } });
    scriptClaude(table, { fallback: () => 'The bike screams over the ridge.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
    control.abilities = [HOVERBIKE, FIELD_KIT];
    control.riders = RIDERS;
    control.uncheck = [];
    control.dice = [0.15, 0.25, 0.99];   // challenge 2, 3; action 6 — a strong hit, with or without the +2
  });
  afterEach(async () => {
    table.client('gm-1').answerDialogs(d => d.close());
    await table.drain().catch(() => {});
  });

  async function kiraRides() {
    await table.client('pl-1').chat('I gun the hoverbike across the scree.', { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
  }

  it("the Hoverbike unchecked: its +2 momentum does not land, the Field Kit's +1 supply does", async () => {
    control.uncheck = ['hb:1'];
    await kiraRides();
    expect(kira.system.momentum.value).toBe(2 + 1);   // Face Danger's strong hit only
    expect(kira.system.supply.value).toBe(3 + 1);
    expect(riderSummary()).not.toContain('+2 momentum');
    expect(riderSummary()).toContain('+1 supply');
  }, 60_000);

  it("a rider-only ability is pre-checked: left alone, its effect lands; unchecked, it does not", async () => {
    await kiraRides();
    expect(kira.system.momentum.value).toBe(2 + 1 + 2);
    expect(kira.system.supply.value).toBe(3 + 1);

    control.uncheck = ['kit:0'];
    await kiraRides();
    expect(kira.system.momentum.value).toBe(5 + 1 + 2);
    expect(kira.system.supply.value).toBe(4);
  }, 60_000);
});

describe('RIDERS-IGNORE-UNCHECKED — dropUncheckedRiders', () => {
  const abilities = [{ key: 'hb:1' }, { key: 'kit:0' }, { key: 'g:0', preRollChoice: { option: 'Pin them down', options: ['Pin them down', 'Make them hurt'] } }];
  const extracted = [{ key: 'hb:1', riders: [{}] }, { key: 'kit:0', riders: [{}] }, { key: 'g:0', riders: [{}] }];

  it('keeps the checked abilities, and a "choose one (before rolling)" whatever its box', () => {
    expect(dropUncheckedRiders(extracted, abilities, ['kit:0']).map(e => e.key)).toEqual(['kit:0', 'g:0']);
    expect(dropUncheckedRiders(extracted, abilities, []).map(e => e.key)).toEqual(['g:0']);
  });

  it('with no confirm read (no keys), every rider stands', () => {
    expect(dropUncheckedRiders(extracted, abilities, undefined)).toEqual(extracted);
    expect(dropUncheckedRiders(undefined, abilities, [])).toEqual([]);
  });

  it("a Batch Mode reading sent as read pre-checks an ability with riders, as the confirm does", () => {
    const reading = { abilities: [{ key: 'hb:1', adds: 2 }, { key: 'kit:0', adds: 0, hasRiders: true }, { key: 'x:0', adds: 0 }] };
    expect(defaultChoices(reading).abilityIds).toEqual(['hb:1', 'kit:0']);
  });
});
