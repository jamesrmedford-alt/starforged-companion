/**
 * STARFORGED COMPANION
 * tests/unit/supersededThreatKeepsPlan.test.js
 *
 * Issue #364 BURN-DROPS-RECORDED-THREAT-PLAN (found with issue #364
 * BURN-OF-MAKE-A-CONNECTION-DROPS-AGENDA — the capture's other plan).
 *
 * A narration's capture records a threat it detects on the Threats journal,
 * and one rated significant or above gets a hidden plan about that page,
 * stamped with the narration (entityExtractor.js → secrets.js
 * planSignificantThreat). A Burn Momentum or Improve Result that supersedes
 * the narration leaves the page — the superseded narration's World Journal
 * records stand (decisions.md, issue #338 D8) — and took the plan back with
 * the narration's other plans (resultUpgrade.js undoSupersededPlans): the
 * threat stayed on the journal, and among the narrator's active threats, with
 * no plan, until a later narration's capture happened to record it again as
 * significant — and then under a new plan, with new rolls.
 *
 * Fixed: the supersede keeps the plan with the page it is about, as it keeps
 * an NPC's agenda with her card (plansKeptThroughSupersede) — filed with its
 * rolls alone, as filed. The X-Card, which deletes the page, still takes the
 * plan, and a plan the struck narration decided is still its own telling.
 *
 * The real pipeline: Kira (momentum 9, heart 1) Makes a Connection and rolls
 * a weak hit; its narration introduces Vex and the patrol hunting her; she
 * burns the weak hit to a strong hit, whose narration names no patrol.
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

const PROSE = 'Vex meets you under the gantry — a smuggler who runs the lower docks, with the harbour patrol an hour behind her.';
const VEX = { type: 'connection', name: 'Vex', description: 'A smuggler who runs the lower docks.', pronouns: 'she/her', role: 'smuggler', goal: null, confidence: 'high' };
const PATROL = { name: 'The harbour patrol', summary: 'An armed patrol sweeps the lower docks for Vex.', severity: 'active', salience: 'significant' };
const detection = (threats) => JSON.stringify({ entities: [VEX], renames: [],
  worldJournal: { lore: [], threats, factionUpdates: [], locationUpdates: [], stateTransitions: [] } });

let table;
let restore;
/** The threats each narration's capture detects, in order; none once they run out. */
let detected;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  // The result is narrated at once, and a burn supersedes that narration.
  restore = await resetSkeletonTable(table, { holdResultForUpgrade: false }, {
    connectionIds: [], sceneFrame: { location: 'the lower docks', present: ['Kira'], situation: 'Kira looks for a way in' },
  });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { momentum: { value: 9 }, health: { value: 5 }, spirit: { value: 5 }, supply: { value: 5 }, heart: 1, edge: 1 } });
  table.replies = () => ({ prose: PROSE, sidecar: { newTruths: [], stateChanges: [] } });
  detected = [[PATROL]];   // the weak hit's narration alone shows the patrol
  table.script.when(call => /You are analysing an Ironsworn: Starforged narration/.test(`${call.userText}`),
    () => detection(detected.shift() ?? []), { times: -1 });
  silenceConsoleErrors();
});
afterEach(() => restore?.());

const flags = (id) => table.world.message(id).flags[MODULE_ID];
const BURN = '[data-action="sf-burn-momentum"]';
// challenge 4 and 8; action die 5 — heart 1 → 6: a weak hit; momentum 9 beats both dice (a strong hit).
const WEAK_HIT = [0.35, 0.75, 0.7];
const narrationIds = () => table.cards(f => f.narratorCard === true && f.narrationId).map(m => m.flags[MODULE_ID].narrationId);
const threatPages = () => (gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'threats'))?.pages?.contents ?? [])
  .map(p => ({ id: p.id, name: p.name }));
const plansAbout = (page) => plansOf(table).filter(p => p.subject?.type === 'threat' && p.subject.id === page.id);
const planOf = (id) => plansOf(table).find(p => p.id === id);

/** Kira Makes a Connection and rolls a weak hit: its capture records the patrol and files the patrol's plan. */
async function kiraMeetsVexUnderWatch() {
  control.interpretation = { moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart', adds: 0, rationale: 'test', mischiefApplied: false };
  control.dice = WEAK_HIT;
  await onGm(table, () => table.client('pl-1').chat('Kira looks for a smuggler who knows the docks — Make a Connection.', { speaker: { actor: 'pc-kira' } }));
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  expect(flags(card._id).burn.originalOutcome, 'a weak hit (setup)').toBe('weak_hit');
  // Foundry's Document#delete, for the X-Card's removal of the NPC the hit created and of her bond Item
  // (the simulated table's documents have none).
  const vex = table.actors.find(a => a.flags?.[MODULE_ID]?.entityType === 'connection' && a.name === 'Vex');
  vex.delete = async () => { table.actors.delete(vex.id); };
  const bonds = table.actors.get('pc-kira').items;
  for (const item of [...(bonds?.contents ?? [])]) {
    item.delete ??= async () => { const i = bonds.contents.indexOf(item); if (i >= 0) bonds.contents.splice(i, 1); };
  }
  const maker = narrationIds().at(-1);
  const [page] = threatPages();
  expect(page, 'the capture recorded the patrol on the Threats journal (setup)').toMatchObject({ name: 'The harbour patrol' });
  const [plan] = plansAbout(page);
  expect(plan, 'a significant threat: its plan is filed about its page, by the narration that showed it (setup)').toMatchObject({
    kind: 'threat', status: 'active', truth: '', narrationId: maker,
    subject: { type: 'threat', id: page.id }, createdFrom: { trigger: 'significant_threat', narrationId: maker },
  });
  return { card, page, plan, maker };
}

async function kiraBurns(card) {
  await onGm(table, () => table.client('pl-1').click(card._id, BURN));
  await table.settle(); await table.drain();
  expect(flags(card._id).burn.consumed).toBe(true);
  expect(table.world.message(card._id).content).toMatch(/Burned → Strong Hit/);
}

describe('issue #364 BURN-DROPS-RECORDED-THREAT-PLAN — the real pipeline: the weak hit that showed the threat is burned to a strong hit', () => {
  it('the threat stays on the Threats journal, and so does its plan — the one its recording filed, with its rolls', async () => {
    const { card, page, plan, maker } = await kiraMeetsVexUnderWatch();

    await kiraBurns(card);

    expect(table.cards(f => f.narratorCard === true && f.narrationId === maker)[0].flags[MODULE_ID].burnSuperseded, 'the weak hit\'s narration is superseded').toBe(true);
    expect(threatPages(), 'the superseded narration\'s World Journal records stand (issue #338 D8)').toEqual([page]);
    const kept = plansAbout(page);
    expect(kept.map(p => p.id), 'one plan, the one the threat\'s recording filed').toEqual([plan.id]);
    expect(kept[0]).toMatchObject({ kind: 'threat', status: 'active', truth: '', oracleSeeds: plan.oracleSeeds, narrationId: maker });
  }, 120_000);

  it('a later narration that shows the threat again files no second plan: the one kept is the threat\'s', async () => {
    const { card, page, plan } = await kiraMeetsVexUnderWatch();
    await kiraBurns(card);

    detected = [[PATROL]];
    await narrateMoveOn(table, moveResolution({ moveId: 'make_a_connection', moveName: 'Make a Connection', outcome: 'strong_hit', outcomeLabel: 'Strong Hit',
      playerNarration: 'I ask Vex who is hunting her.', loremasterContext: '[MOVE: Make a Connection +heart] [OUTCOME: Strong Hit]' }));

    expect(threatPages()).toEqual([page]);
    expect(plansAbout(page).map(p => p.id), 'before the fix a new plan was filed here, with new rolls').toEqual([plan.id]);
  }, 120_000);

  it('control: the X-Card on the upgraded beat still removes the threat\'s page, and its plan with it', async () => {
    const { card } = await kiraMeetsVexUnderWatch();
    await kiraBurns(card);
    expect(threatPages()).toHaveLength(1);

    await playXCard(table);

    expect(threatPages(), 'the page the removed beat\'s capture made is deleted (issue #347 D2)').toEqual([]);
    expect(plansOf(table), 'and no plan is left about a page that no longer exists').toEqual([]);
  }, 120_000);
});

describe('issue #364 BURN-DROPS-RECORDED-THREAT-PLAN — what the supersede still takes back', () => {
  const secrets = () => gmOf(table).import('../../src/world/secrets.js');
  async function supersede(narrationId) {
    const { retractSupersededNarrations } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
    await onGm(table, () => retractSupersededNarrations([narrationId], { label: 'burn' }));
  }

  it('control: a plan about the page the struck narration decided as it filed it — a price\'s new enemy — is its own telling, and is still taken back', async () => {
    const { page, plan, maker } = await kiraMeetsVexUnderWatch();
    const { createSkeleton } = await secrets();
    const told = await onGm(table, () => createSkeleton({ kind: 'threat', subject: { type: 'threat', id: page.id, name: 'the patrol captain' },
      truth: 'The patrol captain is on the Syndicate\'s payroll.', oracleSeeds: ['Character Role: Enforcer'], sceneId: 'sc-1', sessionId: 's-1',
      createdFrom: { narrationId: maker, moveId: 'make_a_connection', trigger: 'new_enemy', resolutionId: 'res-x' } }, { narrationId: maker }));
    expect(planOf(told.id)).toMatchObject({ truth: 'The patrol captain is on the Syndicate\'s payroll.', narrationId: maker });

    await supersede(maker);

    expect(planOf(told.id), 'what the struck narration told goes with it').toBeUndefined();
    expect(plansAbout(page).map(p => p.id), 'the threat\'s own plan, filed with its rolls alone, stays').toEqual([plan.id]);
  }, 120_000);

  it('control: a plan the struck narration filed about a Threats page that is gone is taken back', async () => {
    const { maker } = await kiraMeetsVexUnderWatch();
    const { createSkeleton } = await secrets();
    const orphan = await onGm(table, () => createSkeleton({ kind: 'threat', subject: { type: 'threat', id: 'page-gone', name: 'The reef pirates' },
      oracleSeeds: ['Its agenda — Action + Theme: Seize / Trade'], sceneId: 'sc-1', sessionId: 's-1',
      createdFrom: { narrationId: maker, moveId: null, trigger: 'significant_threat' } }, { narrationId: maker }));
    expect(planOf(orphan.id)).toBeTruthy();

    await supersede(maker);

    expect(planOf(orphan.id)).toBeUndefined();
  }, 120_000);
});
