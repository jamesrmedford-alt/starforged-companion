/**
 * STARFORGED COMPANION
 * tests/unit/mysteriesSurviveATurn.test.js
 *
 * Overhaul 2, slice 2 (§4.4, D16 — amends issue #362 D4): under scenes that
 * turn on their own, a walk from the market to the dock would retire the
 * mystery just posed. A turn retires none of the scene's unanswered
 * mysteries: they go on in the next scene — made in it and about it, so in
 * play there — and retire at the GM's `!scene end` as before (the ends #362
 * D4 named, read as the session's).
 *
 * The simulated table: the real narration poses the mystery (its fact block's
 * `openQuestions`, filed in the Secrets journal), the characters' place
 * changes as `!at` writes it, the next line turns the scene, `!scene end`
 * ends it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf, onGm, plansOf } from '../helpers/skeletonTable.js';

describe('overhaul 2 D16 — a scene\'s unanswered mysteries outlive its turn', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    restore = await resetSkeletonTable(table, {}, {
      currentSceneId: null, sceneFrame: null, sceneState: { bySubject: {}, sceneId: null },
      currentLocationId: 'set-bleak', currentLocationType: 'settlement',
    });
  });
  afterEach(() => restore?.());

  const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
  const mysteries = () => plansOf(table).filter(p => p.kind === 'mystery');
  async function narrateLine(line) {
    const { narratePacedInput } = await gmOf(table).import('../../src/narration/narrator.js');
    return onGm(table, () => narratePacedInput(line,
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
  }

  it('posed at the market, it goes on at the docks, and retires at the GM\'s `!scene end`', async () => {
    table.replies = () => ({ prose: 'Tamsin asks who else knew you were coming.', sidecar: { newTruths: [], stateChanges: [],
      sceneFrame: { location: 'the market deck', present: ['Kira', 'Tamsin Vey'], situation: 'Tamsin asks a question' },
      openQuestions: [{ question: 'Who else knew Kira was coming?', about: "Kira's arrival" }] } });
    await narrateLine('I nod to Tamsin across the counter.');
    const market = stored().currentSceneId;
    expect(mysteries()).toHaveLength(1);
    expect(mysteries()[0]).toMatchObject({ status: 'active', subject: { type: 'scene', id: market } });

    // The characters walk to the docks — `!at`'s write — and the next line turns the scene.
    await gmOf(table).run(async () => {
      const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
      await game.settings.set(MODULE_ID, 'campaignState', { ...cs, currentLocationId: 'set-hollow', currentLocationType: 'settlement' });
    });
    await table.settle();
    table.replies = () => ({ prose: 'The docks creak.', sidecar: { newTruths: [], stateChanges: [],
      sceneFrame: { location: 'the docks', present: ['Kira'], situation: 'Kira walks the docks' } } });
    await narrateLine('I walk down to the docks.');
    const docks = stored().currentSceneId;
    expect(docks).not.toBe(market);
    expect(mysteries()[0]).toMatchObject({ status: 'active', subject: { type: 'scene', id: docks }, sceneId: docks });

    await gmOf(table).chat('!scene end');
    await table.settle();
    await table.drain();
    expect(mysteries()[0].status).toBe('retired');
  }, 90_000);
});
