/**
 * STARFORGED COMPANION
 * tests/unit/supersedeKeepsPlanLinkToItsCard.test.js
 *
 * Issue #364 SUPERSEDE-UNLINKS-EARLIER-PLAN (left open by
 * BURN-OF-MAKE-A-CONNECTION-DROPS-AGENDA; read from the code, reproduced
 * here).
 *
 * A plan filed about a name — an enemy an earlier narration introduced as
 * "Vex" — is linked to the NPC card a later capture makes for that name
 * (secrets.js planNpcAgenda: no second plan, the plan's subject becomes the
 * card), as a new version stamped with that capture's narration; a threat
 * recorded as significant links the same way to its Threats page
 * (planSignificantThreat). A Burn Momentum or Improve Result that supersedes
 * the narration took back its plan writes by that stamp
 * (resultUpgrade.js undoSupersededPlans → worldJournal.js
 * undoNarrationEntries): the version before the link was put back, the plan
 * about the name again, while the card stayed — a supersede deletes no NPC.
 * Nothing made the link again, so the Entities panel's "has a plan" marker and
 * a delete's retiring of the card's plans (by subject id) no longer reached
 * the plan.
 *
 * Fixed: the link carries the narration that made it (`subjectLinkedBy`). A
 * supersede keeps it while the card or page stands (the reading that keeps a
 * plan filed about a card, `keepPlanAbout`); an undo that keeps nothing — the
 * X-Card — undoes it by that mark, so the X-Card on the upgraded beat, which
 * deletes the card the struck narration made (issue #347 D2), puts the
 * earlier plan back about the name, as the X-Card does without the burn,
 * instead of retiring it with the card.
 *
 * The real pipeline: an earlier narration's plan about "Vex", then Kira's
 * Make a Connection weak hit whose narration introduces Vex, burned to a
 * strong hit.
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
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, narrateMoveOn, moveResolution, playXCard,
} from '../helpers/skeletonTable.js';

const PROSE = 'Vex meets you under the gantry — a smuggler who runs the lower docks, and who already knows your name.';
const DETECTION = {
  entities: [{ type: 'connection', name: 'Vex', description: 'A smuggler who runs the lower docks.', pronouns: 'she/her', role: 'smuggler', goal: null, confidence: 'high' }],
  renames:  [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
};

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

async function kiraBurns(card) {
  await onGm(table, () => table.client('pl-1').click(card._id, BURN));
  await table.settle(); await table.drain();
  expect(flags(card._id).burn.consumed).toBe(true);
  expect(table.world.message(card._id).content).toMatch(/Burned → Strong Hit/);
}


const ENEMY_TRUTH = 'Vex sold the crew\'s route to the Iron Syndicate.';
const planOf = (id) => plansOf(table).find(p => p.id === id);
const byName = (p) => p.subject?.type === 'name' && p.subject.name === 'Vex';

/**
 * An earlier narration's plan about the name "Vex" (decided — an enemy the
 * story introduced), then Kira Makes a Connection and rolls a weak hit: its
 * narration introduces Vex, the capture creates her card, and — a plan
 * already about her — links that plan to the card instead of filing an agenda.
 */
async function vexPlannedByNameThenMet() {
  await narrateMoveOn(table, moveResolution({ playerNarration: 'Kira asks the dockhands who runs the lower docks.' }));
  const earlier = narrationIds().at(-1);
  const { createSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
  const plan = await onGm(table, () => createSkeleton({ kind: 'threat', subject: { type: 'name', id: null, name: 'Vex' },
    truth: ENEMY_TRUTH, wants: 'A cut of every cargo.', oracleSeeds: ['Character Role: Smuggler'], sceneId: 'sc-1', sessionId: 's-1',
    createdFrom: { narrationId: earlier, moveId: null, trigger: 'narrated_enemy' } }, { narrationId: earlier }));
  expect(planOf(plan.id), 'the earlier narration\'s plan, about the name (setup)').toMatchObject({ narrationId: earlier,
    subject: { type: 'name', name: 'Vex' } });

  control.interpretation = { moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart', adds: 0, rationale: 'test', mischiefApplied: false };
  control.dice = WEAK_HIT;
  await onGm(table, () => table.client('pl-1').chat('Kira looks for a smuggler who knows the docks — Make a Connection.', { speaker: { actor: 'pc-kira' } }));
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  expect(flags(card._id).burn.originalOutcome, 'a weak hit (setup)').toBe('weak_hit');
  const [vex] = vexCards();
  expect(vex, 'the hit\'s capture created Vex (setup)').toBeTruthy();
  vex.delete = async () => { table.actors.delete(vex.id); };
  const bonds = table.actors.get('pc-kira').items;
  for (const item of [...(bonds?.contents ?? [])]) {
    item.delete ??= async () => { const i = bonds.contents.indexOf(item); if (i >= 0) bonds.contents.splice(i, 1); };
  }
  const maker = narrationIds().at(-1);
  expect(plansAbout(vex).map(p => p.id), 'the plan is linked to her card — no agenda beside it (setup)').toEqual([plan.id]);
  expect(planOf(plan.id)).toMatchObject({ narrationId: maker, truth: ENEMY_TRUTH,
    subject: { type: 'entity', id: vex.id, name: 'Vex' } });
  return { card, vex, plan, earlier, maker };
}

const plannedSubjects = async () => {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return gmOf(table).run(() => secrets.plannedSubjects());
};

describe('issue #364 SUPERSEDE-UNLINKS-EARLIER-PLAN — a supersede keeps the link its capture made while the card stands', () => {
  it('the burn: the plan stays linked to her card, back to the earlier narration\'s version', async () => {
    const { card, vex, plan, earlier, maker } = await vexPlannedByNameThenMet();

    await kiraBurns(card);

    expect(vexCards().map(a => a.id), 'a supersede deletes no connection').toEqual([vex.id]);
    const record = planOf(plan.id);
    expect(record.subject, 'still about her card').toEqual({ type: 'entity', id: vex.id, name: 'Vex' });
    expect(record).toMatchObject({ narrationId: earlier, truth: ENEMY_TRUTH, status: 'active' });
    expect(record.subjectLinkedBy, 'the link keeps its mark: an undo that takes the struck narration back undoes it').toBe(maker);
    expect(plansAbout(vex).map(p => p.id)).toEqual([plan.id]);
    expect([...(await plannedSubjects()).ids], 'the Entities panel marks her as planned').toContain(vex.id);
  }, 120_000);

  it('then the X-Card on the upgraded beat: her card goes, and the plan goes back to the name — not retired with the card', async () => {
    const { card, plan } = await vexPlannedByNameThenMet();
    await kiraBurns(card);

    await playXCard(table);

    expect(vexCards(), 'nobody used her: she goes with the beat that made her (issue #347 D2)').toEqual([]);
    const record = planOf(plan.id);
    expect(byName(record), 'about the name again, as without the burn').toBe(true);
    expect(record).toMatchObject({ status: 'active', truth: ENEMY_TRUTH });
    expect(record.subjectLinkedBy ?? null).toBeNull();
  }, 120_000);
});

describe('issue #364 SUPERSEDE-UNLINKS-EARLIER-PLAN — controls', () => {
  it('the X-Card with no burn unlinks as before: her card goes, the plan is about the name, in play', async () => {
    const { plan, earlier } = await vexPlannedByNameThenMet();

    await playXCard(table);

    expect(vexCards()).toEqual([]);
    const record = planOf(plan.id);
    expect(byName(record)).toBe(true);
    expect(record).toMatchObject({ status: 'active', narrationId: earlier });
    expect(record.subjectLinkedBy ?? null).toBeNull();
  }, 120_000);

  it('the link of a plan whose card was deleted is not kept', async () => {
    const { vex, plan, earlier, maker } = await vexPlannedByNameThenMet();
    table.actors.delete(vex.id);   // her card is gone before the supersede (no hooks: the plan stays linked)
    expect(planOf(plan.id).subject.id).toBe(vex.id);
    const { retractSupersededNarrations } = await gmOf(table).import('../../src/moves/resultUpgrade.js');

    await onGm(table, () => retractSupersededNarrations([maker], { label: 'burn' }));

    const record = planOf(plan.id);
    expect(byName(record), 'back to the name').toBe(true);
    expect(record).toMatchObject({ narrationId: earlier, status: 'active' });
    expect(record.subjectLinkedBy ?? null).toBeNull();
  }, 120_000);
});

describe('issue #364 SUPERSEDE-UNLINKS-EARLIER-PLAN — a recorded threat\'s page, linked the same way', () => {
  it('a plan about a name linked to the Threats page a capture recorded keeps the link through the supersede while the page stands', async () => {
    await narrateMoveOn(table, moveResolution());
    const earlier = narrationIds().at(-1);
    const secrets = await gmOf(table).import('../../src/world/secrets.js');
    const wj = await gmOf(table).import('../../src/world/worldJournal.js');
    const plan = await onGm(table, () => secrets.createSkeleton({ kind: 'threat', subject: { type: 'name', id: null, name: 'the Hollow Fleet' },
      truth: 'The Hollow Fleet is crewed by the Choir\'s dead.', oracleSeeds: ['Character Role: Raider'], sceneId: 'sc-1', sessionId: 's-1',
      createdFrom: { narrationId: earlier, moveId: null, trigger: 'narrated_enemy' } }, { narrationId: earlier }));
    await narrateMoveOn(table, moveResolution());
    const capture = narrationIds().at(-1);
    const page = await onGm(table, () => wj.recordThreat('the Hollow Fleet', { severity: 'active', summary: 'Raiders on the lanes.' },
      game.settings.get(MODULE_ID, 'campaignState')));
    await onGm(table, () => secrets.planSignificantThreat({ name: 'the Hollow Fleet', pageId: page.pageId }, { narrationId: capture }));
    expect(planOf(plan.id), 'linked to the page by the capture (setup)').toMatchObject({ narrationId: capture,
      subject: { type: 'threat', id: page.pageId } });
    const { retractSupersededNarrations } = await gmOf(table).import('../../src/moves/resultUpgrade.js');

    await onGm(table, () => retractSupersededNarrations([capture], { label: 'burn' }));

    expect(planOf(plan.id).subject, 'the page stands, and so does the link').toMatchObject({ type: 'threat', id: page.pageId });
    expect(planOf(plan.id)).toMatchObject({ narrationId: earlier, status: 'active' });
  }, 120_000);
});
