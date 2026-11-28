/**
 * STARFORGED COMPANION
 * tests/unit/revealedTruthLedgerFollowsCorrection.test.js
 *
 * Issue #362 AC13 REVEAL-LEDGER-STALE-TRUTH, under issue #402's change 1b. A
 * decided plan says the escort is a Keeper drone. On a strong hit the
 * narration reveals something else — "the escort is a human pilot" — and
 * records both in one sidecar: the correction (`plans: [{ id, truth }]`) and
 * the reveal (`reveals: [{ id, revealed: ["truth"] }]`). The ledger used to
 * get the plan's truth as a binding scene fact, read before the same
 * sidecar's correction applied — the old, contradicted truth. Since change 1b
 * a reveal files what the narration told: its own fact block in the ledger,
 * and the plan's truth — the one the sidecar leaves on it — as Lore pending
 * the GM. No scene fact is the plan's, stale or not.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';

const OLD_TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';
const NEW_TRUTH = 'The escort is a human pilot wearing a Keeper shell.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const liveTruths = () => (stored().sceneTruths ?? []).filter(t => !t.retracted).map(t => t.fact);
const planOf = (id) => plansOf(table).find(p => p.id === id);

async function seedPlan(over = {}) {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: OLD_TRUTH, wants: 'A name the crew carries.',
    clues: ['A pulse that counts down'], oracleSeeds: ['Character Role: Scout'],
    sceneId: 'sc-1', sessionId: 's-1', ...over,
  }));
}

async function confirmedLore() {
  const { getConfirmedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
  return gmOf(table).run(() => getConfirmedLore(null)).map(e => e.text);
}

/** The Lore entries pending the GM's confirmation. */
async function pendingLore() {
  const { getNarratorAssertedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
  return gmOf(table).run(() => getNarratorAssertedLore(null));
}

const strongHit = () => moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' });

describe('issue #362 AC13 / #402 1b — a truth corrected or decided and revealed in one beat', () => {
  it('control: a reveal with no correction files the plan\'s truth as Lore pending the GM, and no scene fact', async () => {
    const plan = await seedPlan();
    table.replies = () => ({ prose: 'The drone speaks in the Choir\'s voice.', sidecar: { newTruths: [], stateChanges: [],
      reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, strongHit());
    expect(planOf(plan.id).truthRevealed).toBe(true);
    expect(liveTruths()).not.toContain(OLD_TRUTH);
    expect(await confirmedLore()).not.toContain(OLD_TRUTH);
    expect((await pendingLore()).map(e => e.text)).toContain(OLD_TRUTH);
  }, 40_000);

  it('the lore holds the corrected truth; the scene holds only what the narration\'s block gave', async () => {
    const plan = await seedPlan();
    table.replies = () => ({ prose: 'The helmet comes off: the escort is human after all.', sidecar: {
      newTruths: [{ subject: 'the escort', fact: 'is human after all', from: 'result' }], stateChanges: [],
      plans:   [{ id: plan.id, truth: NEW_TRUTH }],
      reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, strongHit());

    expect(planOf(plan.id)).toMatchObject({ truth: NEW_TRUTH, truthRevealed: true });
    expect((await pendingLore()).map(e => e.text)).toContain(NEW_TRUTH);
    expect(liveTruths(), 'the superseded truth is not a scene fact').not.toContain(OLD_TRUTH);
    expect(liveTruths(), 'nor the plan\'s new one').not.toContain(NEW_TRUTH);
    expect(liveTruths(), 'the narration\'s own fact is').toContain('is human after all');
  }, 40_000);

  it('a plan decided and revealed in the same beat is Lore pending the GM, and no scene fact', async () => {
    const plan = await seedPlan({ truth: '', oracleSeeds: ['Character Role: Scout'] });
    table.replies = () => ({ prose: 'The helmet comes off: the escort is human.', sidecar: { newTruths: [], stateChanges: [],
      plans:   [{ id: plan.id, truth: NEW_TRUTH }],
      reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, strongHit());
    expect(planOf(plan.id)).toMatchObject({ truth: NEW_TRUTH, truthRevealed: true });
    expect((await pendingLore()).map(e => e.text)).toContain(NEW_TRUTH);
    expect(liveTruths()).not.toContain(NEW_TRUTH);
  }, 40_000);

  it('the lore carries the name the correction gave the subject, as the plan does', async () => {
    const plan = await seedPlan();
    table.replies = () => ({ prose: 'The helmet comes off: Pilot Ossa, not a drone at all.', sidecar: { newTruths: [], stateChanges: [],
      plans:   [{ id: plan.id, subject: 'Pilot Ossa', truth: NEW_TRUTH }],
      reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, strongHit());
    expect(planOf(plan.id).subject.name).toBe('Pilot Ossa');
    const lore = (await pendingLore()).find(e => e.text === NEW_TRUTH);
    expect(lore).toMatchObject({ title: 'Threat: Pilot Ossa', subject: 'Pilot Ossa', revealOf: plan.id });
  }, 40_000);
});
