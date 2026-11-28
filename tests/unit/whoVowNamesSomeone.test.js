/**
 * STARFORGED COMPANION
 * tests/unit/whoVowNamesSomeone.test.js
 *
 * VOW-FULFILLED-UNANSWERED — five live long hauls running (rounds 3–7), the
 * campaign's "Find who is raiding the Cinder Expanse lanes" was fulfilled
 * with no one named: round 7's a75 told "No name is written yet. Who sits at
 * the head of that trade stays unsaid." The vow's plan had been decided as
 * "The raids are staged by a faction inside the lanes' own water trade …" —
 * no name — and the fulfilment rule may tell nothing more than the plan's
 * truth ("Where the Truth line gives no name, there is no name").
 *
 * A vow that asks who is won by a name: its plan's decision is told so
 * (DECIDE NOW). A decided plan whose truth names no one was given the one
 * behind it from the name oracle when it was filed (namedIfAWhoVow) — round
 * 10's vow was won by such a name, "Talia Tolari", whom the table never saw.
 * Since issue #402's change 4 the oath is asked for a name once more instead
 * (narrator.js whoPlanNamingAsk; plansPlayedToward.test.js), and the plan is
 * filed as decided: nothing draws a name.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { resetSkeletonTable, gmOf, plansOf, onGm } from '../helpers/skeletonTable.js';
import { truthNamesSomeone } from '../../src/world/skeletons.js';
import { vowAsksWho } from '../../src/world/tellingWords.js';
import { formatUnrevealedBlock } from '../../src/narration/narratorPrompt.js';

const VOW = 'Find who is raiding the Cinder Expanse lanes';
const ROUND_7_TRUTH = 'The raids are staged by a faction inside the lanes\' own water trade, using the raiders\' ambushes to push haulers into '
  + 'dependence on a single supplier. The attacks near the drifting beacon are meant to keep any survey away from it.';

describe('a vow that asks who, and a truth that names someone', () => {
  it('asks who: find who, whose, unmask, identify; a vow to find a ship does not', () => {
    expect(vowAsksWho(VOW)).toBe(true);
    expect(vowAsksWho('Learn whose hand signed the Cinder Wren\'s tasking')).toBe(true);
    expect(vowAsksWho('Unmask the broker selling lane schedules')).toBe(true);
    expect(vowAsksWho('Find the lost colony ship Verity\'s Hope')).toBe(false);
  });
  it('round 7\'s truth names no one; nor does round 4\'s "Someone inside Bleakhold\'s Corporate offices"', () => {
    expect(truthNamesSomeone(ROUND_7_TRUTH, { notNames: [VOW] })).toBe(false);
    expect(truthNamesSomeone('Someone inside Bleakhold\'s Corporate offices writes the convoy schedules.', { notNames: ['Bleakhold Station', VOW] })).toBe(false);
    expect(truthNamesSomeone('The Ashen Wake\'s captain sells the routes.', { notNames: ['Ashen Wake'] })).toBe(false);
  });
  it('a name it gives, a titled one, or one of the story\'s people names someone', () => {
    expect(truthNamesSomeone('Captain Joss Varrow sells the lanes to the raiders.', { notNames: [VOW] })).toBe(true);
    expect(truthNamesSomeone('Broker Okoro sells the schedules.', { notNames: [VOW] })).toBe(true);
    expect(truthNamesSomeone('Ilse Marrow, a clerk at the water exchange, sells the convoy schedules.', { notNames: [VOW] })).toBe(true);
    expect(truthNamesSomeone('Tamsin sells the schedules.', { people: ['Tamsin Okoro'] })).toBe(true);
  });
});

describe('DECIDE NOW tells a who-vow\'s plan to name the one behind it', () => {
  it('a vow request that asks who is told; one that does not is not', () => {
    const block = (label) => formatUnrevealedBlock([], {
      planRequests: [{ ref: 'plan-res-1-vow', kind: 'vow', trigger: 'vow', label, oracleSeeds: ['What is behind it — Action + Theme: Debate Greed'] }],
    });
    // With no people met yet, any name; a new one is shown before the truth comes out (VOW-WON-BY-A-STRANGER).
    expect(block(`what is really behind the vow "${VOW}"`)).toContain('Its truth names the one behind it — a person, by name: someone the story has met, or a new name; a new one is shown in play, by name, before the truth is revealed.');
    expect(block('what is really behind the vow "Find the lost colony ship Verity\'s Hope"')).not.toContain('Its truth names the one behind it');
  });
});

describe('filed: a who-vow\'s plan is filed as decided — no name is drawn (issue #402, change 4)', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => { restore = await resetSkeletonTable(table); });
  afterEach(() => restore?.());

  const file = async (vowName, truth) => {
    const secrets = await gmOf(table).import('../../src/world/secrets.js');
    const ref = 'plan-res-vow-1-vow';
    return onGm(table, () => secrets.applyPlanSideData({ plans: [{ id: ref, subject: vowName, truth, wants: 'To keep the lanes afraid.' }] }, {
      campaignState: foundry.utils.deepClone(game.settings.get('starforged-companion', 'campaignState')), narrationId: 'nar-swear',
      planRequests: [{ ref, kind: 'vow', trigger: 'vow', label: `what is really behind the vow "${vowName}"`,
        subject: { type: 'vow', id: 'vow-raid-1', name: vowName }, oracleSeeds: ['What is behind it — Action + Theme: Debate Greed'] }],
    }));
  };

  it('round 7\'s truth, filed: as it was decided, with no name drawn for it', async () => {
    await file(VOW, ROUND_7_TRUTH);
    const [plan] = plansOf(table);
    expect(plan).toMatchObject({ kind: 'vow', subject: { id: 'vow-raid-1' } });
    expect(plan.truth).toBe(ROUND_7_TRUTH);
  }, 60_000);

  it('a truth that names someone is filed as it is; so is a vow that asks no who', async () => {
    await file(VOW, 'Captain Joss Varrow sells the lanes to the raiders.');
    expect(plansOf(table)[0].truth).toBe('Captain Joss Varrow sells the lanes to the raiders.');
    restore?.();
    restore = await resetSkeletonTable(table);
    await file('Find the lost colony ship Verity\'s Hope', 'The ship drifts dark in the Cinder Expanse, her crew long gone.');
    expect(plansOf(table)[0].truth).toBe('The ship drifts dark in the Cinder Expanse, her crew long gone.');
  }, 60_000);
});
