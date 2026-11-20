/**
 * STARFORGED COMPANION
 * tests/unit/keptPriceNewEnemyPlannedOnce.test.js
 *
 * Issue #364 KEPT-PRICE-NEW-ENEMY-PLANNED-TWICE (left open by
 * XCARD-PAUSED-NARRATION-PLAN-REQUESTS; read from the code, reproduced here).
 *
 * A Battle or Clash burned or improved to a weak hit keeps the price its roll
 * paid. When that price is "A new enemy is revealed" and the move's first
 * narration was never written — its reply was empty, its call failed, the
 * X-Card paused it — that exit files the enemy's plan with its rolls alone,
 * under no narration's stamp. The Burn / Improve re-narration then asked for
 * the enemy's plan again from its seeds (a second set of rolls), which carry
 * no subject id to know the first plan by: the one enemy was planned twice.
 *
 * A plan now keeps the resolution it was filed for
 * (`createdFrom.resolutionId` — for a re-narration, the resolution it
 * upgrades), on every path that files a move's plan, and a later narration of
 * the same move is put the plan already filed, to decide by its id, and told
 * the enemy by that plan's rolls. A plan filed before the field has none and
 * is found by nothing.
 *
 * The first block is the real pipeline: Kira (momentum 6, iron 1) Battles and
 * misses, pays the price, and burns the miss to a weak hit.
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
import { withPayThePriceSeed, upgradedOracleSeeds } from '../../src/moves/resolver.js';
import { normaliseSkeleton, planFiledFor, seedsWithPlannedEnemy } from '../../src/world/skeletons.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [47];   // 45–50: "A new enemy is revealed"
  // The price is paid and the result narrated at once, and a burn undoes or
  // keeps them — the flow this row is about (heldResultBeforePrice.test.js
  // has the default, where the one narration follows the choice).
  restore = await resetSkeletonTable(table, { holdResultForUpgrade: false });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { momentum: { value: 6 }, health: { value: 5 }, spirit: { value: 5 }, supply: { value: 5 }, iron: 1, edge: 1 } });
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 } });
  silenceConsoleErrors();
});
afterEach(() => restore?.());

const flags = (id) => table.world.message(id).flags[MODULE_ID];
const BURN = '[data-action="sf-burn-momentum"]';
// challenge 4 and 8; action die 1 — iron 1 → 2: a miss; momentum 6 beats one die (a weak hit).
const MISS = [0.35, 0.75, 0.0];
const threats = () => plansOf(table).filter(p => p.kind === 'threat');
const enemySeedLines = (text) => String(text ?? '').split('\n').filter(l => l.includes('The new enemy — '));
const emptyReply = () => ({ prose: '', sidecar: { newTruths: [], stateChanges: [] } });

/** A narrator that decides everything DECIDE NOW lists, each under its own name. */
const decideAllAsked = (call) => {
  const asked = [...String(call.system ?? '').matchAll(/^- id ([\w-]+): Threat — /gm)].map(m => m[1]);
  return { prose: 'A second shape detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
    plans: asked.map((id, i) => ({ id, subject: `raider ${i + 1}`, truth: `Truth decided for ${id}.` })) } };
};

async function kiraBattlesAndMisses() {
  control.interpretation = { moveId: 'battle', moveName: 'Battle', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false };
  control.dice = MISS;
  await onGm(table, () => table.client('pl-1').chat('Kira throws herself into the fight — Battle.', { speaker: { actor: 'pc-kira' } }));
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
  expect(table.world.message(card._id).content, 'a Battle burned to a weak hit keeps its price').toMatch(/Burned → Weak Hit[\s\S]*already rolled stands/);
}

describe('issue #364 KEPT-PRICE-NEW-ENEMY-PLANNED-TWICE — the real pipeline: a Battle miss burned to a weak hit', () => {
  it('the first narration came back empty: its exit files the enemy with its rolls, for the move\'s resolution — and the burn\'s re-narration decides that plan, not a second', async () => {
    table.replies = emptyReply;
    const card = await kiraBattlesAndMisses();
    expect(threats(), 'the exit that wrote no narration files the price\'s new enemy').toHaveLength(1);
    const [waiting] = threats();
    expect(waiting).toMatchObject({ truth: '', status: 'active' });
    expect(waiting.narrationId ?? null, 'no card carries that narration\'s id').toBeNull();
    expect(waiting.createdFrom, 'filed for the move').toMatchObject({ trigger: 'new_enemy', resolutionId: flags(card._id).resolutionId });

    table.replies = decideAllAsked;
    const before = narrationCallsOf(table).length;
    await kiraBurns(card);
    const call = narrationCallsOf(table).at(-1);
    expect(narrationCallsOf(table).length, 'the burned result is narrated').toBe(before + 1);
    expect(call.system, 'the enemy is not asked for a second time').not.toMatch(/plan-[\w-]+-enemy/);
    expect(call.system, 'the plan already filed is put to the re-narration').toMatch(new RegExp(`^- id ${waiting.id}: Threat — `, 'm'));
    // The enemy is told by the rolls its plan was filed with, not a second set.
    expect(enemySeedLines(`${call.system}\n${call.userText}`), 'the seeds the narration is given').toEqual(waiting.oracleSeeds.map(s => expect.stringContaining(`The new enemy — ${s}`)));

    expect(threats(), 'one plan for the one enemy').toHaveLength(1);
    expect(threats()[0]).toMatchObject({ id: waiting.id, status: 'active', truth: `Truth decided for ${waiting.id}.`,
      oracleSeeds: waiting.oracleSeeds });
    const renarration = table.cards(f => f.narratorCard === true && f.upgradeOf === flags(card._id).resolutionId).at(-1);
    expect(threats()[0].narrationId, 'decided by the re-narration, under its id').toBe(renarration.flags[MODULE_ID].narrationId);
  }, 90_000);

  it('the re-narration comes back empty too: nothing is filed a second time', async () => {
    table.replies = emptyReply;
    const card = await kiraBattlesAndMisses();
    const [waiting] = threats();
    await kiraBurns(card);
    expect(threats(), 'still the one plan, waiting').toHaveLength(1);
    expect(threats()[0]).toMatchObject({ id: waiting.id, truth: '', status: 'active' });
  }, 90_000);

  it('control — the first narration was written and decided the enemy: the burn takes that plan back with it, and the re-narration decides the enemy anew', async () => {
    table.replies = decideAllAsked;
    const card = await kiraBattlesAndMisses();
    const [first] = threats();
    expect(first.truth).toMatch(/^Truth decided for plan-/);
    expect(first.createdFrom.resolutionId, 'a plan a narration files keeps its resolution too').toBe(flags(card._id).resolutionId);

    await kiraBurns(card);
    expect(narrationCallsOf(table).at(-1).system, 'asked for again: the first was taken back').toMatch(/^- id plan-[\w-]+-enemy: Threat — /m);
    expect(threats(), 'one plan for the one enemy').toHaveLength(1);
    expect(threats()[0].id).not.toBe(first.id);
    expect(threats()[0].createdFrom.resolutionId, 'the re-narration\'s plan is filed for the move it upgrades').toBe(flags(card._id).resolutionId);
  }, 90_000);
});

/** The burned Battle as burnMomentum.js builds it: a new resolution that upgrades the first and keeps its price. */
const burnedToWeakHit = (original) => moveResolution({
  moveId: 'battle', moveName: 'Battle', outcome: 'weak_hit', outcomeLabel: 'Weak Hit', upgradeOf: original._id, inputMethod: 'burn',
  playerNarration: '[Player burned momentum to upgrade the outcome]',
  oracleSeeds: upgradedOracleSeeds({ moveId: 'battle', outcome: 'weak_hit', isMatch: false, consequences: { routePayThePrice: true },
    price: 'A new enemy is revealed' }),
});
const battleMiss = () => moveResolution({ moveId: 'battle', moveName: 'Battle',
  oracleSeeds: withPayThePriceSeed(null, 'battle', 'A new enemy is revealed') });
const liftXCard = async () => {
  const { clearXCard } = await gmOf(table).import('../../src/context/safety.js');
  await onGm(table, () => clearXCard());
};

describe('issue #364 KEPT-PRICE-NEW-ENEMY-PLANNED-TWICE — the other narrations that were never written', () => {
  it('the X-Card paused the first narration: the re-narration decides the plan the pause filed', async () => {
    await playXCard(table);
    const original = battleMiss();
    await narrateMoveOn(table, original);
    const [waiting] = threats();
    expect(waiting.createdFrom).toMatchObject({ trigger: 'new_enemy', resolutionId: original._id });
    expect(waiting.narrationId ?? null).toBeNull();

    await liftXCard();
    table.replies = decideAllAsked;
    await narrateMoveOn(table, burnedToWeakHit(original));
    expect(narrationCallsOf(table).at(-1).system).not.toMatch(/plan-[\w-]+-enemy/);
    expect(threats()).toHaveLength(1);
    expect(threats()[0]).toMatchObject({ id: waiting.id, truth: `Truth decided for ${waiting.id}.` });
  }, 90_000);

  it('the X-Card pauses the re-narration as well: the pause files no second plan', async () => {
    await playXCard(table);
    const original = battleMiss();
    await narrateMoveOn(table, original);
    await narrateMoveOn(table, burnedToWeakHit(original));
    expect(threats(), 'one plan, still waiting').toHaveLength(1);
  }, 90_000);

  it('a GM retired the waiting plan before the burn: it is not asked for again, nor brought back', async () => {
    table.replies = emptyReply;
    const original = battleMiss();
    await narrateMoveOn(table, original);
    const [waiting] = threats();
    const { updateSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => updateSkeleton(waiting.id, r => ({ ...r, status: 'retired' }), { byGm: true }));

    table.replies = decideAllAsked;
    await narrateMoveOn(table, burnedToWeakHit(original));
    const call = narrationCallsOf(table).at(-1);
    expect(call.system).not.toMatch(/plan-[\w-]+-enemy/);
    expect(call.system, 'a retired plan is not put to the narration').not.toContain(waiting.id);
    expect(threats()).toHaveLength(1);
    expect(threats()[0]).toMatchObject({ id: waiting.id, status: 'retired', truth: '' });
  }, 90_000);

  it('another move\'s price revealed its own enemy: each resolution has its own plan', async () => {
    table.replies = emptyReply;
    const first = battleMiss();
    const second = battleMiss();
    await narrateMoveOn(table, first);
    await narrateMoveOn(table, second);
    expect(threats().map(p => p.createdFrom.resolutionId).sort()).toEqual([first._id, second._id].sort());

    // The second move's own later narration is asked for nothing; a third move is asked for its own.
    table.replies = decideAllAsked;
    await narrateMoveOn(table, battleMiss());
    expect(narrationCallsOf(table).at(-1).system).toMatch(/^- id plan-[\w-]+-enemy: Threat — /m);
    expect(threats()).toHaveLength(3);
  }, 90_000);

  it('a plan filed before plans kept their resolution behaves as before: the re-narration asks for the enemy again', async () => {
    const original = battleMiss();
    const { createSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => createSkeleton({ kind: 'threat', subject: { type: 'name', id: null, name: 'the new enemy this price reveals' },
      oracleSeeds: ['Character Role: Bandit', 'Character Goal: Seize power', 'Character Disposition: Hostile'],
      sceneId: 'sc-1', sessionId: 's-1', createdFrom: { narrationId: null, moveId: 'battle', trigger: 'new_enemy' } }));
    expect(threats()[0].createdFrom.resolutionId ?? null).toBeNull();

    table.replies = decideAllAsked;
    await narrateMoveOn(table, burnedToWeakHit(original));
    expect(narrationCallsOf(table).at(-1).system, 'no resolution to know it by').toMatch(/^- id plan-[\w-]+-enemy: Threat — /m);
    expect(threats()).toHaveLength(2);
  }, 90_000);
});

describe('issue #364 KEPT-PRICE-NEW-ENEMY-PLANNED-TWICE — every path that files a move\'s plan keeps its resolution', () => {
  const expeditionRequest = (resolutionId) => ({
    ref: `plan-${resolutionId}-expedition`, kind: 'expedition', trigger: 'expedition', label: 'the expedition to Vault 1',
    subject: { type: 'track', id: 'track-1', name: 'Reach Vault 1' }, oracleSeeds: ['What waits at the end — Action + Theme: Guard Relic'],
  });

  it('a narration that was written: the enemy it decided and the expedition its move began', async () => {
    table.replies = (call) => {
      const asked = [...String(call.system ?? '').matchAll(/^- id (plan-[\w-]+): /gm)].map(m => m[1]);
      return { prose: 'The crossing begins.', sidecar: { newTruths: [], stateChanges: [],
        plans: asked.map(id => ({ id, subject: id.endsWith('-enemy') ? 'the escort' : '', truth: `Truth of ${id}.` })) } };
    };
    const move = moveResolution({ moveId: 'undertake_an_expedition', moveName: 'Undertake an Expedition',
      oracleSeeds: withPayThePriceSeed(null, 'undertake_an_expedition', 'A new enemy is revealed') });
    move.skeletonRequests = [expeditionRequest(move._id)];
    await narrateMoveOn(table, move);
    const plans = plansOf(table);
    expect(plans.map(p => p.kind).sort()).toEqual(['expedition', 'threat']);
    for (const plan of plans) {
      expect(typeof plan.narrationId, `"${plan.subject.name}" is stamped`).toBe('string');
      expect(plan.createdFrom.resolutionId, `"${plan.subject.name}"`).toBe(move._id);
    }
  }, 90_000);

  it('fact continuity switched off: the request filed with its rolls alone, stamped, keeps it', async () => {
    restore?.();
    restore = await resetSkeletonTable(table, { 'factContinuity.enabled': false });
    const move = battleMiss();
    await narrateMoveOn(table, move);
    expect(threats()).toHaveLength(1);
    expect(typeof threats()[0].narrationId).toBe('string');
    expect(threats()[0].createdFrom.resolutionId).toBe(move._id);
  }, 90_000);

  const roundEntry = (userId, actorId, actorName, text) => ({
    userId, actorId, actorName, userName: actorName, text,
    rolled: { narrationInput: {
      kind: 'move', resolutionId: `res-${userId}`, moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge',
      outcome: 'miss', outcomeLabel: 'Miss', isMatch: false, loremasterContext: '[MOVE: Face Danger +edge] [OUTCOME: Miss]',
      oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed'),
      skeletonRequests: userId === 'pl-1' ? [expeditionRequest('res-pl-1')] : [], endingTrackIds: [],
      relevance: { resolvedClass: 'interaction', entityIds: [], entityTypes: [] },
    } },
  });
  const round = () => ({
    id: 'round-1', number: 1, phase: 'narrating', acting: ['pl-1', 'pl-2'],
    entries: {
      'pl-1': roundEntry('pl-1', 'pc-kira', 'Kira', 'I slip past the escort.'),
      'pl-2': roundEntry('pl-2', 'pc-ren', 'Ren', 'I cut the tether.'),
    },
  });
  const narrateTheRound = async () => {
    const { narrateRound } = await gmOf(table).import('../../src/narration/narrator.js');
    return onGm(table, () => narrateRound({ round: round(), campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')) }));
  };
  const byResolution = () => plansOf(table).map(p => `${p.kind}:${p.createdFrom.resolutionId}`).sort();

  it('a Batch Mode round: each entry\'s plans keep their own entry\'s resolution', async () => {
    expect((await narrateTheRound()).posted).toBe('card');
    expect(byResolution()).toEqual(['expedition:res-pl-1', 'threat:res-pl-1', 'threat:res-pl-2']);
  }, 90_000);

  it('a round the X-Card paused: the same, unstamped', async () => {
    await playXCard(table);
    expect((await narrateTheRound()).posted).toBe('paused');
    expect(byResolution()).toEqual(['expedition:res-pl-1', 'threat:res-pl-1', 'threat:res-pl-2']);
    for (const plan of plansOf(table)) expect(plan.narrationId ?? null).toBeNull();
  }, 90_000);
});

describe('issue #364 KEPT-PRICE-NEW-ENEMY-PLANNED-TWICE — the plan model', () => {
  const record = (over = {}) => normaliseSkeleton({ id: 'sk-1', kind: 'threat', subject: { name: 'the new enemy this price reveals' },
    oracleSeeds: ['Character Role: Bandit', 'Character Goal: Seize power'],
    createdFrom: { narrationId: null, moveId: 'battle', trigger: 'new_enemy', resolutionId: 'res-1' }, ...over });

  it('a plan keeps the resolution it was filed for, bounded; one stored without it has none', () => {
    expect(record().createdFrom).toEqual({ narrationId: null, moveId: 'battle', trigger: 'new_enemy', resolutionId: 'res-1' });
    expect(record({ createdFrom: { trigger: 'new_enemy' } }).createdFrom.resolutionId).toBeNull();
    expect(record({ createdFrom: { trigger: 'new_enemy', resolutionId: 'x'.repeat(65) } }).createdFrom.resolutionId).toBeNull();
    expect(record({ createdFrom: { trigger: 'new_enemy', resolutionId: 7 } }).createdFrom.resolutionId).toBeNull();
  });

  it('planFiledFor: the same kind, trigger and resolution — and nothing for a request or a plan that names no resolution', () => {
    const request = { kind: 'threat', trigger: 'new_enemy', resolutionId: 'res-1' };
    expect(planFiledFor([record()], request)?.id).toBe('sk-1');
    expect(planFiledFor([record({ status: 'retired' })], request)?.id, 'a retired plan was still filed').toBe('sk-1');
    expect(planFiledFor([record()], { ...request, resolutionId: 'res-2' })).toBeNull();
    expect(planFiledFor([record()], { ...request, kind: 'discovery' })).toBeNull();
    expect(planFiledFor([record()], { ...request, trigger: 'narrated_enemy' })).toBeNull();
    expect(planFiledFor([record()], { kind: 'threat', trigger: 'new_enemy' })).toBeNull();
    expect(planFiledFor([record({ createdFrom: { trigger: 'new_enemy' } })], request), 'a plan from before the field').toBeNull();
    expect(planFiledFor([record({ createdFrom: { trigger: 'new_enemy' } })], { kind: 'threat', trigger: 'new_enemy', resolutionId: null })).toBeNull();
  });

  it('seedsWithPlannedEnemy: the enemy\'s lines become the plan\'s rolls, where the price put them', () => {
    const seeds = { context: 'battle weak_hit', results: ['Pay the Price: A new enemy is revealed',
      'The new enemy — Character Role: Scholar', 'The new enemy — Character Goal: Find a home', 'The new enemy — Character Disposition: Friendly',
      'Combat Action: Block a path'] };
    expect(seedsWithPlannedEnemy(seeds, [record()])).toEqual({ context: 'battle weak_hit', results: ['Pay the Price: A new enemy is revealed',
      'The new enemy — Character Role: Bandit', 'The new enemy — Character Goal: Seize power', 'Combat Action: Block a path'] });
    expect(seedsWithPlannedEnemy(seeds, [record({ oracleSeeds: [] })]), 'a plan that keeps no roll').toBe(seeds);
    expect(seedsWithPlannedEnemy(seeds, [record({ kind: 'expedition', createdFrom: { trigger: 'expedition', resolutionId: 'res-1' } })])).toBe(seeds);
    const none = { results: ['Pay the Price: You are delayed or put at a disadvantage'] };
    expect(seedsWithPlannedEnemy(none, [record()])).toBe(none);
  });
});
