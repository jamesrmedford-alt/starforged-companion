/**
 * STARFORGED COMPANION
 * tests/unit/supersededConnectionKeepsAgenda.test.js
 *
 * Issue #364 BURN-OF-MAKE-A-CONNECTION-DROPS-AGENDA.
 *
 * A Make a Connection hit's capture creates the NPC its narration names and
 * files her hidden agenda — a plan about her card, stamped with that
 * narration (entityExtractor.js routeEntityDrafts → secrets.js
 * planNpcAgenda). When the roller then burns momentum or improves the result,
 * the supersede takes back the plans the struck narration wrote, by its id
 * (resultUpgrade.js undoSupersededPlans → worldJournal.js
 * undoNarrationEntries, the Secrets category). The agenda was one of them:
 * its page was deleted, while her card stayed — a supersede deletes no
 * connection, unlike the X-Card. An agenda is filed only where an NPC is
 * created (the auto-create and a draft's Confirm), and the re-narration's
 * capture reads her as someone known, so nothing filed it again: she had no
 * agenda for the rest of the campaign.
 *
 * Fixed: the supersede keeps a plan the struck narration filed about a card
 * that is still there (`keepPlanAbout`) while it was filed with its rolls
 * alone — as the agenda is — as that narration filed it. What the narration
 * did to the plan beyond filing it is still taken back by its marks, a plan
 * it decided as it filed it is its own telling and still goes, and the
 * X-Card — which deletes the NPC — still takes the plan.
 *
 * The other subjects a move's narration plans are not affected, and stay as
 * they were: an expedition's plan is taken back and asked of the re-narration
 * again (upgradeKeepsExpeditionPlan.test.js, issue #362 AC04); a vow's plan
 * is its oath scene's, a narration no upgrade supersedes (the control below).
 *
 * The first block is the real pipeline: Kira (momentum 9, heart 1) Makes a
 * Connection, rolls a weak hit, its narration introduces Vex, and she burns
 * the weak hit to a strong hit.
 */

/* global silenceConsoleErrors */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
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

import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, narrateMoveOn, moveResolution, playXCard,
} from '../helpers/skeletonTable.js';

const PROSE = 'Vex meets you under the gantry — a smuggler who runs the lower docks, and who already knows your name.';
const DETECTION = {
  entities: [{ type: 'connection', name: 'Vex', description: 'A smuggler who runs the lower docks.', pronouns: 'she/her', role: 'smuggler', goal: null, confidence: 'high' }],
  renames:  [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
};
const AGENDA_TRUTH = 'Vex sells the dock codes to both sides.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  // The result is narrated at once, and a burn supersedes that narration.
  restore = await resetSkeletonTable(table, { holdResultForUpgrade: false }, {
    connectionIds: [], sceneFrame: { location: 'the lower docks', present: ['Kira'], situation: 'Kira looks for a way in' },
  });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { momentum: { value: 9 }, health: { value: 5 }, spirit: { value: 5 }, supply: { value: 5 }, heart: 1, edge: 1 } });
  table.replies = () => ({ prose: PROSE, sidecar: { newTruths: [{ subject: 'Vex', fact: 'Runs the lower docks' }], stateChanges: [] } });
  // The capture's detection pass names Vex, for every narration that does.
  table.script.when(call => /You are analysing an Ironsworn: Starforged narration/.test(`${call.userText}`), JSON.stringify(DETECTION), { times: -1 });
  silenceConsoleErrors();
});
afterEach(() => restore?.());

const flags = (id) => table.world.message(id).flags[MODULE_ID];
const BURN = '[data-action="sf-burn-momentum"]';
// challenge 4 and 8; action die 5 — heart 1 → 6: a weak hit; momentum 9 beats both dice (a strong hit).
const WEAK_HIT = [0.35, 0.75, 0.7];
const vexCards = () => table.actors.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection' && a.name === 'Vex');
const plansAbout = (card) => plansOf(table).filter(p => p.subject?.type === 'entity' && p.subject.id === card.id);
const narrationIds = () => table.cards(f => f.narratorCard === true && f.narrationId).map(m => m.flags[MODULE_ID].narrationId);
const inPlay = async () => {
  const { listSkeletons } = await gmOf(table).import('../../src/world/secrets.js');
  return gmOf(table).run(() => listSkeletons());
};

/** Kira Makes a Connection and rolls a weak hit: its narration introduces Vex, and the capture files her agenda. */
async function kiraMeetsVex() {
  control.interpretation = { moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart', adds: 0, rationale: 'test', mischiefApplied: false };
  control.dice = WEAK_HIT;
  await onGm(table, () => table.client('pl-1').chat('Kira looks for a smuggler who knows the docks — Make a Connection.', { speaker: { actor: 'pc-kira' } }));
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  expect(flags(card._id).burn.originalOutcome, 'a weak hit (setup)').toBe('weak_hit');
  const [vex] = vexCards();
  expect(vex, 'the hit\'s capture created Vex (setup)').toBeTruthy();
  // Foundry's Document#delete, for the X-Card's removal of her card and of the bond Item on Kira's sheet
  // (the simulated table's documents have none).
  vex.delete = async () => { table.actors.delete(vex.id); };
  const bonds = table.actors.get('pc-kira').items;
  for (const item of [...(bonds?.contents ?? [])]) {
    item.delete ??= async () => { const i = bonds.contents.indexOf(item); if (i >= 0) bonds.contents.splice(i, 1); };
  }
  const maker = narrationIds().at(-1);   // the move's narration, the newest
  const [agenda] = plansAbout(vex);
  expect(agenda, 'her agenda is filed about her card, by the narration that made her (setup)').toMatchObject({
    kind: 'npcAgenda', status: 'active', truth: '', narrationId: maker,
    subject: { type: 'entity', id: vex.id, name: 'Vex' }, createdFrom: { trigger: 'make_a_connection', narrationId: maker },
  });
  return { card, vex, agenda, maker };
}

async function kiraBurns(card) {
  await onGm(table, () => table.client('pl-1').click(card._id, BURN));
  await table.settle(); await table.drain();
  expect(flags(card._id).burn.consumed).toBe(true);
  expect(table.world.message(card._id).content).toMatch(/Burned → Strong Hit/);
}

describe('issue #364 BURN-OF-MAKE-A-CONNECTION-DROPS-AGENDA — the real pipeline: the weak hit that introduced her is burned to a strong hit', () => {
  it('her card stays, and so does her agenda — the plan the capture filed, with its rolls', async () => {
    const { card, vex, agenda, maker } = await kiraMeetsVex();

    await kiraBurns(card);

    expect(table.cards(f => f.narratorCard === true && f.narrationId === maker)[0].flags[MODULE_ID].burnSuperseded, 'the weak hit\'s narration is superseded').toBe(true);
    expect(vexCards().map(a => a.id), 'a supersede deletes no connection').toEqual([vex.id]);
    const kept = plansAbout(vex);
    expect(kept.map(p => p.id), 'one agenda, the one her creation filed').toEqual([agenda.id]);
    expect(kept[0]).toMatchObject({ kind: 'npcAgenda', status: 'active', truth: '', oracleSeeds: agenda.oracleSeeds,
      subject: { type: 'entity', id: vex.id, name: 'Vex' } });
    expect((await inPlay()).map(p => p.id), 'and it is in play').toContain(agenda.id);
  }, 120_000);

  it('the strong hit\'s own narration is asked to decide it', async () => {
    const { card, vex, agenda } = await kiraMeetsVex();
    table.replies = (call) => {
      const asked = call.system.includes(`- id ${agenda.id}: NPC agenda — Vex.`);
      return { prose: PROSE, sidecar: { newTruths: [], stateChanges: [],
        ...(asked ? { plans: [{ id: agenda.id, truth: AGENDA_TRUTH, wants: 'A way off the docks.' }] } : {}) } };
    };

    await kiraBurns(card);

    expect(narrationCallsOf(table).at(-1).system, 'the re-narration is given her agenda to decide').toContain(`- id ${agenda.id}: NPC agenda — Vex.`);
    expect(plansAbout(vex)).toHaveLength(1);
    expect(plansAbout(vex)[0]).toMatchObject({ id: agenda.id, truth: AGENDA_TRUTH, wants: 'A way off the docks.', narrationId: narrationIds().at(-1) });
  }, 120_000);

  it('control: a vow\'s plan is its oath scene\'s, which no upgrade supersedes — it stays through the burn as it was', async () => {
    const { narrateAndPostVowSwearing } = await gmOf(table).import('../../src/narration/narrator.js');
    await onGm(table, () => narrateAndPostVowSwearing({ vow: { name: 'Free the Kessan miners', vowId: 'vow-kessan' },
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), speakerActorId: 'pc-kira' }));
    const vowPlans = () => plansOf(table).filter(p => p.kind === 'vow');
    expect(vowPlans(), 'the vow\'s plan is filed, about the vow by its id (setup)').toHaveLength(1);
    expect(vowPlans()[0].subject).toMatchObject({ type: 'vow', id: 'vow-kessan' });
    const before = JSON.parse(JSON.stringify(vowPlans()[0]));
    expect(table.cards(f => f.vowSceneCard === true).map(m => m.flags[MODULE_ID].resolutionId ?? null),
      'the oath scene is no move\'s narration: a burn finds no card of it to strike').toEqual([null]);

    const { card, vex, agenda } = await kiraMeetsVex();
    await kiraBurns(card);

    expect(vowPlans()).toEqual([before]);
    expect(plansAbout(vex).map(p => p.id)).toEqual([agenda.id]);
  }, 120_000);

  it('control: the X-Card on the upgraded beat still removes her, and her agenda with her', async () => {
    const { card } = await kiraMeetsVex();
    await kiraBurns(card);
    expect(vexCards()).toHaveLength(1);

    await playXCard(table);

    expect(vexCards(), 'nobody has used her: she goes with the beat that made her (issue #347 D2)').toEqual([]);
    expect(plansOf(table), 'and no plan is left about a card that no longer exists').toEqual([]);
  }, 120_000);

  it('control: the X-Card on the narration that made her (no burn) deletes her and her agenda, as before', async () => {
    await kiraMeetsVex();

    await playXCard(table);

    expect(vexCards()).toEqual([]);
    expect(plansOf(table)).toEqual([]);
  }, 120_000);
});

describe('issue #364 BURN-OF-MAKE-A-CONNECTION-DROPS-AGENDA — what the supersede still takes back', () => {
  const secrets = () => gmOf(table).import('../../src/world/secrets.js');
  async function supersede(narrationId) {
    const { retractSupersededNarrations } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
    await onGm(table, () => retractSupersededNarrations([narrationId], { label: 'burn' }));
  }
  const planOf = (id) => plansOf(table).find(p => p.id === id);

  it('what the struck narration did to the plan beyond filing it goes back by its marks, and the rolls card of its reveal is withdrawn', async () => {
    const { vex, agenda, maker } = await kiraMeetsVex();
    const { updateSkeleton } = await secrets();
    // A guard: the capture files the agenda after the narration's own side-data, so the pipeline writes no
    // mark of that narration on it. Written here as one narration's writes land on a plan it made (one
    // version a narration): its rolls shown, its story ended — each under the narration's own mark — and
    // the card of those rolls on the table, as a reveal posts it.
    await onGm(table, () => updateSkeleton(agenda.id, r => ({ ...r, rollsShown: true, rollsShownBy: maker,
      status: 'resolved', resolvedBy: maker }), { narrationId: maker }));
    await onGm(table, () => ChatMessage.create({ content: '<p>The oracle, behind the scenes</p>',
      flags: { [MODULE_ID]: { secretRollsCard: true, skeletonId: agenda.id, narrationId: maker } } }));
    expect(planOf(agenda.id)).toMatchObject({ rollsShown: true, status: 'resolved', narrationId: maker });

    await supersede(maker);

    const kept = planOf(agenda.id);
    expect(kept, 'the plan about her card stays, in play again').toMatchObject({ kind: 'npcAgenda', status: 'active',
      rollsShown: false, oracleSeeds: agenda.oracleSeeds, subject: { type: 'entity', id: vex.id } });
    expect(kept.rollsShownBy ?? null).toBeNull();
    expect(kept.resolvedBy ?? null).toBeNull();
    expect(kept.narrationId, 'still the narration that made her: an X-Card that removes her takes it').toBe(maker);
    expect(table.cards(f => f.secretRollsCard === true).map(m => m.flags[MODULE_ID].rollsWithdrawn),
      'the card of the rolls that reveal showed is withdrawn (issue #364 TAKEN-BACK-PLAN-ROLLS-CARD-STAYS)').toEqual(['reveal']);
  }, 120_000);

  it('control: a plan about her card the struck narration decided as it filed it is its own telling, and is still taken back', async () => {
    const { vex, agenda, maker } = await kiraMeetsVex();
    const { createSkeleton } = await secrets();
    const told = await onGm(table, () => createSkeleton({ kind: 'threat', subject: { type: 'entity', id: vex.id, name: 'Vex' },
      truth: 'Vex is the harbour master\'s informer.', oracleSeeds: ['Character Role: Informer'], sceneId: 'sc-1', sessionId: 's-1',
      createdFrom: { narrationId: maker, moveId: 'make_a_connection', trigger: 'narrated_enemy' } }, { narrationId: maker }));
    expect(planOf(told.id)).toMatchObject({ truth: 'Vex is the harbour master\'s informer.', narrationId: maker });

    await supersede(maker);

    expect(planOf(told.id), 'what the struck narration told about her goes with it').toBeUndefined();
    expect(plansAbout(vex).map(p => p.id), 'her agenda, filed with its rolls alone, stays').toEqual([agenda.id]);
  }, 120_000);

  it('control: a later narration that decided her agenda is superseded — the agenda goes back to waiting, as before', async () => {
    const { vex, agenda, maker } = await kiraMeetsVex();
    table.replies = (call) => ({ prose: 'Vex counts the crates twice.', sidecar: { newTruths: [], stateChanges: [],
      ...(call.system.includes(`- id ${agenda.id}: NPC agenda — Vex.`) ? { plans: [{ id: agenda.id, truth: AGENDA_TRUTH }] } : {}) } });
    await narrateMoveOn(table, moveResolution({ playerNarration: 'I ask Vex about the missing crates.' }));
    const decider = narrationIds().at(-1);
    expect(planOf(agenda.id)).toMatchObject({ truth: AGENDA_TRUTH, narrationId: decider });

    await supersede(decider);

    expect(plansAbout(vex).map(p => p.id)).toEqual([agenda.id]);
    expect(planOf(agenda.id)).toMatchObject({ truth: '', status: 'active', narrationId: maker });
  }, 120_000);

  it('control: a plan the struck narration filed about a name — an enemy its prose introduced — is still taken back', async () => {
    const { vex, agenda, maker } = await kiraMeetsVex();
    const { createSkeleton } = await secrets();
    const enemy = await onGm(table, () => createSkeleton({ kind: 'threat', subject: { type: 'name', id: null, name: 'the harbour patrol' },
      oracleSeeds: ['Character Role: Enforcer'], sceneId: 'sc-1', sessionId: 's-1',
      createdFrom: { narrationId: maker, moveId: 'make_a_connection', trigger: 'narrated_enemy' } }, { narrationId: maker }));
    expect(planOf(enemy.id)).toBeTruthy();

    await supersede(maker);

    expect(planOf(enemy.id), 'what the struck narration told goes with it').toBeUndefined();
    expect(plansAbout(vex).map(p => p.id), 'her agenda stays').toEqual([agenda.id]);
  }, 120_000);

  it('control: a plan the struck narration filed about a card that is gone is taken back', async () => {
    const { maker } = await kiraMeetsVex();
    const { createSkeleton } = await secrets();
    const orphan = await onGm(table, () => createSkeleton({ kind: 'npcAgenda', subject: { type: 'entity', id: 'actor-gone', name: 'Orrin' },
      oracleSeeds: ['Character Disposition: Wary'], sceneId: 'sc-1', sessionId: 's-1',
      createdFrom: { narrationId: maker, moveId: null, trigger: 'make_a_connection' } }, { narrationId: maker }));
    expect(planOf(orphan.id)).toBeTruthy();

    await supersede(maker);

    expect(planOf(orphan.id)).toBeUndefined();
  }, 120_000);
});
