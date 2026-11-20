/**
 * STARFORGED COMPANION
 * tests/unit/revertedPricePlanGoesWithIt.test.js
 *
 * Issue #364 REVERTED-PRICE-PLAN-STAYS-WAITING (left open by
 * XCARD-PAUSED-NARRATION-PLAN-REQUESTS; read from the code, reproduced here).
 *
 * A miss's Pay the Price — "A new enemy is revealed" — asks the move's
 * narration for the enemy's hidden plan. When that narration is never
 * written (an empty reply, a failed call, the X-Card's pause) its exit files
 * the plan with its rolls alone, under no narration's id. The player then
 * burns momentum (or improves the result) to an outcome that pays no price:
 * the price is reverted entirely — its card struck, its oracle result taken
 * out of the narrator's memory — but the supersede takes a narration's plans
 * back by the narration's id, and this plan has none. It stayed, waiting: an
 * enemy no price revealed, put to the next narration to decide.
 *
 * The plan keeps the resolution it was filed for
 * (`createdFrom.resolutionId`, KEPT-PRICE-NEW-ENEMY-PLANNED-TWICE), and the
 * revert takes the price's plan back by it — while it is still waiting. One
 * decided since is that writer's and stays; so do the expedition the same
 * move began, another move's enemy, and a plan filed before the field.
 *
 * The first block is the real pipeline: Kira (momentum 6, edge 1) Faces
 * Danger and misses, pays the price, and burns the miss to a weak hit.
 */

/* global silenceConsoleErrors */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [47] }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
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
vi.mock('../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== 'pay_the_price') return real.rollOracle(...args);
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, narrateMoveOn, moveResolution, playXCard,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [47];   // 45–50: "A new enemy is revealed"
  // The price is paid and the result narrated at once, and a burn undoes them
  // (heldResultBeforePrice.test.js has the default: nothing is paid or
  // narrated until the player has chosen).
  restore = await resetSkeletonTable(table, { holdResultForUpgrade: false });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { momentum: { value: 6 }, health: { value: 5 }, spirit: { value: 5 }, supply: { value: 5 }, iron: 1, edge: 1 } });
  silenceConsoleErrors();
});
afterEach(() => restore?.());

const flags = (id) => table.world.message(id).flags[MODULE_ID];
const BURN = '[data-action="sf-burn-momentum"]';
// challenge 4 and 8; action die 1 — edge 1 → 2: a miss; momentum 6 beats one die (a weak hit).
const MISS = [0.35, 0.75, 0.0];
const threats = () => plansOf(table).filter(p => p.kind === 'threat');
const emptyReply = () => ({ prose: '', sidecar: { newTruths: [], stateChanges: [] } });
const decideAllAsked = (call) => {
  const asked = [...String(call.system ?? '').matchAll(/^- id ([\w-]+): Threat — /gm)].map(m => m[1]);
  return { prose: 'A second shape detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
    plans: asked.map((id, i) => ({ id, subject: `raider ${i + 1}`, truth: `Truth decided for ${id}.` })) } };
};

async function kiraFacesDangerAndMisses() {
  control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test', mischiefApplied: false };
  control.dice = MISS;
  await onGm(table, () => table.client('pl-1').chat('Kira slips past the escort — Face Danger.', { speaker: { actor: 'pc-kira' } }));
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  expect(table.cards(f => f.payThePriceCard === true).at(-1).flags[MODULE_ID].oracleMemory)
    .toMatchObject({ answer: 'A new enemy is revealed', resolutionId: flags(card._id).resolutionId });
  return card;
}

async function kiraBurns(card) {
  await onGm(table, () => table.client('pl-1').click(card._id, BURN));
  await table.settle(); await table.drain();
  expect(flags(card._id).burn.consumed).toBe(true);
  expect(table.world.message(card._id).content).toMatch(/Burned → Weak Hit/);
  expect(table.cards(f => f.payThePriceCard === true).at(-1).flags[MODULE_ID].priceSuperseded, 'a Face Danger weak hit pays no price: it is reverted').toBe('burn');
}

describe('issue #364 REVERTED-PRICE-PLAN-STAYS-WAITING — the real pipeline: a Face Danger miss burned to a weak hit', () => {
  it('the first narration came back empty: the enemy its exit filed goes with the reverted price, and is put to no narration', async () => {
    table.replies = emptyReply;
    const card = await kiraFacesDangerAndMisses();
    const [waiting] = threats();
    expect(waiting, 'filed with its rolls alone, for the move').toMatchObject({ truth: '', status: 'active',
      createdFrom: { trigger: 'new_enemy', resolutionId: flags(card._id).resolutionId } });
    expect(waiting.narrationId ?? null, 'no narration\'s id to take it back by').toBeNull();

    table.replies = decideAllAsked;
    const before = narrationCallsOf(table).length;
    await kiraBurns(card);
    expect(plansOf(table), 'no price revealed an enemy: its plan is gone').toEqual([]);
    const call = narrationCallsOf(table).at(-1);
    expect(narrationCallsOf(table).length, 'the burned result is narrated').toBe(before + 1);
    expect(call.system, 'and the re-narration is asked to decide nothing').not.toMatch(/^- id [\w-]+: Threat — /m);
    expect(call.system).not.toContain(waiting.id);
  }, 90_000);

  it('control — the first narration was written and decided the enemy: the supersede takes that plan back by its narration, as before', async () => {
    table.replies = decideAllAsked;
    const card = await kiraFacesDangerAndMisses();
    expect(threats()).toHaveLength(1);
    expect(typeof threats()[0].narrationId).toBe('string');
    await kiraBurns(card);
    expect(plansOf(table)).toEqual([]);
  }, 90_000);
});

const kira = () => game.actors.get('pc-kira');
const newEnemyMiss = (over = {}) => moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed'), ...over });

/** The price of `resolutionId` reverted entirely, as a burn or an improvement to an outcome that pays none reverts it. */
async function revertThePrice(resolutionId, kind = 'burn') {
  const { revertPayThePrice } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
  await onGm(table, () => revertPayThePrice({ clocksAdvanced: [], sufferMeterDeltas: [] }, kira(), { kind, resolutionId }));
}
const liftXCard = async () => {
  const { clearXCard } = await gmOf(table).import('../../src/context/safety.js');
  await onGm(table, () => clearXCard());
};

describe('issue #364 REVERTED-PRICE-PLAN-STAYS-WAITING — what the revert takes, and what it leaves', () => {
  it('the X-Card paused the first narration: the plan the pause filed goes with the price an Improve Result reverts', async () => {
    await playXCard(table);
    const move = newEnemyMiss();
    await narrateMoveOn(table, move);
    expect(threats()).toHaveLength(1);
    expect(threats()[0].narrationId ?? null).toBeNull();
    await liftXCard();
    await revertThePrice(move._id, 'improve');
    expect(plansOf(table)).toEqual([]);
  }, 90_000);

  it('the narration was written but decided nothing: its plan, filed stamped and still waiting, goes too', async () => {
    const move = newEnemyMiss();
    await narrateMoveOn(table, move);   // the default reply decides no plan
    expect(threats()[0]).toMatchObject({ truth: '', createdFrom: { resolutionId: move._id } });
    expect(typeof threats()[0].narrationId).toBe('string');
    await revertThePrice(move._id);
    expect(plansOf(table)).toEqual([]);
  }, 90_000);

  it('a plan a later narration decided before the burn stays: it is that narration\'s now', async () => {
    await playXCard(table);
    const move = newEnemyMiss();
    await narrateMoveOn(table, move);
    const [waiting] = threats();
    await liftXCard();
    table.replies = decideAllAsked;
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit', playerNarration: 'I face the new enemy.' }));
    expect(threats()[0]).toMatchObject({ id: waiting.id, truth: `Truth decided for ${waiting.id}.` });

    await revertThePrice(move._id);
    expect(threats(), 'decided since: left as it is').toHaveLength(1);
    expect(threats()[0]).toMatchObject({ id: waiting.id, status: 'active', truth: `Truth decided for ${waiting.id}.` });
  }, 90_000);

  it('a plan a GM retired stays retired, and the expedition the same move began stands', async () => {
    table.replies = emptyReply;
    const move = newEnemyMiss({ moveId: 'undertake_an_expedition', moveName: 'Undertake an Expedition' });
    move.skeletonRequests = [{ ref: `plan-${move._id}-expedition`, kind: 'expedition', trigger: 'expedition', label: 'the expedition to Vault 1',
      subject: { type: 'track', id: 'track-1', name: 'Reach Vault 1' }, oracleSeeds: ['What waits at the end — Action + Theme: Guard Relic'] }];
    await narrateMoveOn(table, move);
    expect(plansOf(table).map(p => `${p.kind}:${p.createdFrom.resolutionId}`).sort()).toEqual([`expedition:${move._id}`, `threat:${move._id}`]);
    const { updateSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => updateSkeleton(threats()[0].id, r => ({ ...r, status: 'retired' }), { byGm: true }));

    await revertThePrice(move._id);
    expect(plansOf(table).map(p => `${p.kind}:${p.status}`).sort(), 'the price\'s own waiting plan is the only one it takes').toEqual(['expedition:active', 'threat:retired']);
  }, 90_000);

  it('another move\'s enemy stays, and so does a plan filed before plans kept their resolution', async () => {
    table.replies = emptyReply;
    const reverted = newEnemyMiss();
    const other = newEnemyMiss();
    await narrateMoveOn(table, reverted);
    await narrateMoveOn(table, other);
    const { createSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => createSkeleton({ kind: 'threat', subject: { type: 'name', id: null, name: 'an older enemy' },
      oracleSeeds: ['Character Role: Bandit'], sceneId: 'sc-1', sessionId: 's-1',
      createdFrom: { narrationId: null, moveId: 'face_danger', trigger: 'new_enemy' } }));
    expect(threats()).toHaveLength(3);

    await revertThePrice(reverted._id);
    expect(threats().map(p => p.createdFrom.resolutionId ?? null).sort(), 'only the reverted move\'s').toEqual([null, other._id].sort());
    // A revert that names no move takes nothing.
    await revertThePrice(null);
    expect(threats()).toHaveLength(2);
  }, 90_000);

  it('only the canonical GM takes the plan back', async () => {
    table.replies = emptyReply;
    const move = newEnemyMiss();
    await narrateMoveOn(table, move);
    const { revertPayThePrice } = await table.client('pl-1').import('../../src/moves/resultUpgrade.js');
    await table.client('pl-1').run(() => revertPayThePrice({ clocksAdvanced: [], sufferMeterDeltas: [] }, null, { kind: 'burn', resolutionId: move._id }));
    await table.settle(); await table.drain();
    expect(threats(), 'a player\'s client writes no journal').toHaveLength(1);
  }, 90_000);
});
