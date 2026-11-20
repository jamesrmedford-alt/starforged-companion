/**
 * STARFORGED COMPANION
 * tests/unit/xcardOnUpgradeWithholdsSupersededReveal.test.js
 *
 * Issue #364 XCARD-ON-UPGRADE-AFTER-SUPERSEDED-REVEAL (out of
 * XCARD-REVEAL-REREVEAL-NO-LORE).
 *
 * After the X-Card takes back a narration that revealed a hidden plan's
 * truth, the truth is withheld (`truthWithheldBy` — the maintainer's ruling).
 * A Burn Momentum / Improve Result that supersedes such a narration
 * un-reveals the truth first (resultUpgrade.js undoSupersededPlans) and left
 * no trace of it on the plan. The X-Card then played on the upgraded beat
 * takes the struck narration with it (issue #347 D2) — but found the truth
 * already hidden, so it withheld nothing: the narrator was given the truth
 * again under UNREVEALED, and a later narration's reveal of it was recorded,
 * with a new Lore entry — the X-carded content back in the story.
 *
 * The supersede now marks the plan with the narration whose reveal it took
 * back (`truthTakenBackBy`), and the X-Card that removes that narration reads
 * the mark as a reveal it took back: it withholds the truth and tells the GMs.
 * The burn alone withholds nothing (the burn is not the safety tool), and a
 * reveal after it is recorded as before.
 *
 * The real pipeline: Kira (momentum 6, edge 1) Faces Danger and misses, the
 * miss's narration reveals the truth, she burns the miss to a weak hit, and
 * Pat plays the X-Card on the beat on screen.
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
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, narrateMoveOn, moveResolution, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';

const TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';
const NEW_TRUTH = 'The escort is a salvaged courier that still carries its dead owner\'s orders.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [47];
  // The price is paid and the result narrated at once, and a burn undoes them.
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
const planOf = (id) => plansOf(table).find(p => p.id === id);
const plain = () => ({ prose: 'Silence.', sidecar: { newTruths: [], stateChanges: [] } });
const revealing = (plan) => () => ({ prose: 'The escort speaks in the Choir\'s voice.',
  sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plan.id, revealed: ['truth'] }] } });
const lastNarrationId = () => table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;
const notices = () => table.cards(f => f.xcardTruthWithheldNotice === true);

async function confirmedLore(text = TRUTH) {
  const { getConfirmedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
  return gmOf(table).run(() => getConfirmedLore(null)).filter(e => e.text === text || e.fact === text);
}

/** A decided plan in this scene, filed as the canonical GM files one. */
async function seedPlan() {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH, wants: 'A name the crew carries.',
    escalation: ['It asks again, closer'], clues: ['A pulse that counts down'],
    oracleSeeds: ['Character Role: Scout'], sceneId: 'sc-1', sessionId: 's-1',
  }));
}

async function kiraFacesDangerAndMisses() {
  control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test', mischiefApplied: false };
  control.dice = MISS;
  await onGm(table, () => table.client('pl-1').chat('Kira slips past the escort — Face Danger.', { speaker: { actor: 'pc-kira' } }));
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function kiraBurns(card) {
  await onGm(table, () => table.client('pl-1').click(card._id, BURN));
  await table.settle(); await table.drain();
  expect(flags(card._id).burn.consumed).toBe(true);
}

/** The miss's narration reveals the truth; Kira burns it to a weak hit whose narration reveals nothing. Its narration id. */
async function revealThenBurn(plan) {
  table.replies = revealing(plan);
  const card = await kiraFacesDangerAndMisses();
  const struck = lastNarrationId();
  expect(planOf(plan.id), 'the miss revealed it (setup)').toMatchObject({ truthRevealed: true, truthRevealedBy: struck });
  table.replies = plain;
  await kiraBurns(card);
  expect(table.cards(f => f.narratorCard === true && f.narrationId === struck)[0].flags[MODULE_ID].burnSuperseded,
    'the miss narration is struck (setup)').toBe(true);
  expect(planOf(plan.id), 'the burn hid the truth again (setup)').toMatchObject({ truthRevealed: false, truth: TRUTH });
  return struck;
}

async function liftXCard() {
  const { clearXCard } = await gmOf(table).import('../../src/context/safety.js');
  await onGm(table, () => clearXCard());
}

/** After Resume: a narration that reveals the truth again — what it was given, and its narration id. */
async function narrationRevealsAgain(plan) {
  await patSpeaks(table);
  table.replies = revealing(plan);
  await narrateMoveOn(table, moveResolution());
  table.replies = plain;
  return { system: narrationCallsOf(table).at(-1).system ?? '', id: lastNarrationId() };
}

describe('issue #364 XCARD-ON-UPGRADE-AFTER-SUPERSEDED-REVEAL — the X-Card on an upgraded beat withholds the truth its struck narration revealed', () => {
  it('the X-Card that takes the struck narration with the beat withholds the truth and tells the GMs once', async () => {
    const plan = await seedPlan();
    const struck = await revealThenBurn(plan);
    expect(planOf(plan.id), 'the burn left its mark (setup)').toMatchObject({ truthTakenBackBy: struck, truthWithheldBy: null });

    await playXCard(table);
    const removed = gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState')).xCardedNarrationIds ?? [];
    expect(removed, 'the struck narration is removed with the beat (setup)').toContain(struck);

    expect(planOf(plan.id)).toMatchObject({ truth: TRUTH, truthRevealed: false, truthWithheldBy: struck, status: 'active' });
    const [notice, ...more] = notices();
    expect(more, 'told once').toEqual([]);
    expect(notice, 'the GMs are told').toBeTruthy();
    expect(notice.whisper, 'GM-only').toEqual(['gm-1']);
    expect(notice.content).toContain('the escort');
    expect(notice.content, 'the notice never states the truth').not.toContain(TRUTH);
  }, 120_000);

  it('after Resume the narrator is not given the truth, and a reveal of it is not recorded', async () => {
    const plan = await seedPlan();
    const struck = await revealThenBurn(plan);
    await playXCard(table);
    await liftXCard();

    const again = await narrationRevealsAgain(plan);
    expect(again.system, 'the plan is still in play').toContain(`(id ${plan.id})`);
    expect(again.system, 'never its truth').not.toContain(TRUTH);
    expect(planOf(plan.id)).toMatchObject({ truthRevealed: false, truthWithheldBy: struck });
    expect(await confirmedLore(), 'no Lore entry states it').toEqual([]);
  }, 120_000);
});

describe('issue #364 XCARD-ON-UPGRADE-AFTER-SUPERSEDED-REVEAL — controls', () => {
  it('the burn alone withholds nothing: the narrator is given the truth again, and its reveal is recorded as before', async () => {
    const plan = await seedPlan();
    await revealThenBurn(plan);
    expect(notices()).toEqual([]);

    const again = await narrationRevealsAgain(plan);
    expect(again.system, 'the narrator is given the truth').toContain(TRUTH);
    expect(planOf(plan.id), 'the reveal clears the mark').toMatchObject({ truthRevealed: true, truthRevealedBy: again.id, truthWithheldBy: null, truthTakenBackBy: null });
    expect(await confirmedLore(), 'one confirmed Lore entry').toHaveLength(1);
  }, 120_000);

  it('an X-Card on a later beat, which leaves the struck narration, withholds nothing', async () => {
    const plan = await seedPlan();
    const struck = await revealThenBurn(plan);
    await patSpeaks(table);
    await narrateMoveOn(table, moveResolution());   // a later beat, revealing nothing

    await playXCard(table);
    expect(planOf(plan.id)).toMatchObject({ truthRevealed: false, truthWithheldBy: null, truthTakenBackBy: struck });
    expect(notices()).toEqual([]);
  }, 120_000);

  it('a GM\'s edit of the truth after the burn clears the mark: the X-Card on the beat then withholds the new truth from nobody', async () => {
    const plan = await seedPlan();
    await revealThenBurn(plan);
    const { editSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => editSkeleton(plan.id, { truth: NEW_TRUTH }));
    expect(planOf(plan.id)).toMatchObject({ truth: NEW_TRUTH, truthTakenBackBy: null });

    await playXCard(table);
    expect(planOf(plan.id), 'the new truth was never on screen').toMatchObject({ truth: NEW_TRUTH, truthRevealed: false, truthWithheldBy: null });
    expect(notices()).toEqual([]);
  }, 120_000);
});
