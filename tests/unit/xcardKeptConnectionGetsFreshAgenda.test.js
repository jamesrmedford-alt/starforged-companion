/**
 * STARFORGED COMPANION
 * tests/unit/xcardKeptConnectionGetsFreshAgenda.test.js
 *
 * Issue #364 XCARD-USED-NPC-AGENDA-DELETED (decided by the maintainer: a kept
 * NPC gets a fresh agenda).
 *
 * A Make a Connection hit's capture creates the NPC its narration names and
 * files her hidden agenda, stamped with that narration (entityExtractor.js →
 * secrets.js planNpcAgenda). The X-Card on that narration deletes her card
 * while nobody has used it — and keeps it, naming her to the GMs, when the
 * table has (connection.js retractNarrationConnections). But the capture
 * undo runs first (retractions.js retractNarrationCapture →
 * worldJournal.js undoNarrationEntries) and deletes every plan the removed
 * narration made, her agenda among them, before she is found to be kept; and
 * an agenda is filed only where an NPC is created, so nothing filed one again:
 * the NPC the table kept had no agenda for the rest of the campaign.
 *
 * Decided: when the X-Card keeps an NPC its narration introduced and she has
 * no plan, she gets a fresh agenda — new oracle rolls, no narration stamp,
 * nothing carried from the removed narration — filed by planNpcAgenda, whose
 * guards keep one plan an NPC. An unused NPC still goes with her agenda; one
 * kept with a plan still in play gets no second plan.
 *
 * The real pipeline: Kira Makes a Connection, rolls a weak hit, its
 * narration introduces Vex, and the X-Card is played on it.
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

const addHistory = async (card, text) => {
  const { addHistoryEntry } = await gmOf(table).import('../../src/entities/connection.js');
  await onGm(table, () => addHistoryEntry(card.id, text, 's-1'));
};
const keptNotices = () => table.cards(f => f.xcardConnectionNotice === true && !f.xcardBondNotice);

describe('issue #364 XCARD-USED-NPC-AGENDA-DELETED — the X-Card keeps the NPC the table used, and she gets a fresh agenda', () => {
  it('her card stays, and a fresh agenda is filed about it: new rolls, no narration stamp, nothing decided', async () => {
    const { vex, agenda, maker } = await kiraMeetsVex();
    await addHistory(vex, 'Kira paid her for the dock codes.');

    await playXCard(table);

    expect(vexCards().map(a => a.id), 'the table used her: she stays (issue #338 D6(ii))').toEqual([vex.id]);
    expect(keptNotices(), 'and the GMs are told').toHaveLength(1);
    const plans = plansAbout(vex);
    expect(plans, 'one agenda about her card').toHaveLength(1);
    const [fresh] = plans;
    expect(fresh.id, 'not the removed narration\'s plan').not.toBe(agenda.id);
    expect(plansOf(table).find(p => p.id === agenda.id), 'which went with its narration').toBeUndefined();
    expect(fresh).toMatchObject({ kind: 'npcAgenda', status: 'active', truth: '', truthRevealed: false, rollsShown: false,
      subject: { type: 'entity', id: vex.id, name: 'Vex' }, narrationId: null,
      createdFrom: { narrationId: null, trigger: 'xcard_kept_connection' } });
    expect(fresh.narrationId, 'no narration stamp').not.toBe(maker);
    expect(fresh.oracleSeeds.some(s => s.startsWith('What they hide — Action + Theme:')), 'its own oracle rolls').toBe(true);
    expect((await inPlay()).map(p => p.id), 'and it is in play').toContain(fresh.id);
  }, 120_000);

  it('the next narration she is in is asked to decide it', async () => {
    const { vex } = await kiraMeetsVex();
    await addHistory(vex, 'Kira paid her for the dock codes.');
    await playXCard(table);
    const [fresh] = plansAbout(vex);
    const { clearXCard } = await gmOf(table).import('../../src/context/safety.js');
    await onGm(table, () => clearXCard());
    table.replies = (call) => ({ prose: 'Vex counts the crates twice.', sidecar: { newTruths: [], stateChanges: [],
      ...(call.system.includes(`- id ${fresh.id}: NPC agenda — Vex.`) ? { plans: [{ id: fresh.id, truth: AGENDA_TRUTH }] } : {}) } });

    await narrateMoveOn(table, moveResolution({ playerNarration: 'I ask Vex about the missing crates.' }));

    expect(narrationCallsOf(table).at(-1).system).toContain(`- id ${fresh.id}: NPC agenda — Vex.`);
    expect(plansAbout(vex)).toHaveLength(1);
    expect(plansAbout(vex)[0]).toMatchObject({ id: fresh.id, truth: AGENDA_TRUTH });
  }, 120_000);

  it('control: an NPC nobody used is deleted with her agenda, and nothing is filed', async () => {
    await kiraMeetsVex();

    await playXCard(table);

    expect(vexCards()).toEqual([]);
    expect(plansOf(table)).toEqual([]);
  }, 120_000);

  it('control: an NPC kept with a plan still in play — her agenda a GM wrote since — gets no second plan', async () => {
    const { vex, agenda } = await kiraMeetsVex();
    await addHistory(vex, 'Kira paid her for the dock codes.');
    const { editSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => editSkeleton(agenda.id, { truth: AGENDA_TRUTH }));
    expect(plansAbout(vex)[0]).toMatchObject({ id: agenda.id, truth: AGENDA_TRUTH, narrationId: null });

    await playXCard(table);

    expect(vexCards().map(a => a.id)).toEqual([vex.id]);
    expect(plansAbout(vex).map(p => p.id), 'the GM\'s plan stands, alone').toEqual([agenda.id]);
    expect(plansAbout(vex)[0]).toMatchObject({ truth: AGENDA_TRUTH, status: 'active' });
  }, 120_000);
});
