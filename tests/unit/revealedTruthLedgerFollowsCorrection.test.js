/**
 * STARFORGED COMPANION
 * tests/unit/revealedTruthLedgerFollowsCorrection.test.js
 *
 * Issue #362 AC13 REVEAL-LEDGER-STALE-TRUTH. A decided plan says the escort
 * is a Keeper drone. On a strong hit the narration reveals something else —
 * "the escort is a human pilot" — and, as UNREVEALED tells it to, records
 * both in one sidecar: the correction (`plans: [{ id, truth }]` — "your
 * narration stands: record the change") and the reveal (`reveals: [{ id,
 * revealed: ["truth"] }]`). narrator.js applySidecarSideData read the truth
 * for the ledger (`revealedTruthsOf(sidecar)`) synchronously, before the
 * fire-and-forget applyPlanSideData applied the same sidecar's correction: the
 * ledger got the plan's OLD truth — the one the prose had just contradicted —
 * as a binding scene truth, while Lore (filed after the correction) held the
 * new one; and a plan decided and revealed in one beat got Lore and no scene
 * fact. The ledger now reads the truth the sidecar leaves on the plan.
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

const strongHit = () => moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' });

describe('issue #362 AC13 — a truth corrected or decided and revealed in one beat', () => {
  it('control: a reveal with no correction puts the plan\'s truth in the ledger and in lore', async () => {
    const plan = await seedPlan();
    table.replies = () => ({ prose: 'The drone speaks in the Choir\'s voice.', sidecar: { newTruths: [], stateChanges: [],
      reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, strongHit());
    expect(planOf(plan.id).truthRevealed).toBe(true);
    expect(liveTruths()).toContain(OLD_TRUTH);
    expect(await confirmedLore()).toContain(OLD_TRUTH);
  }, 40_000);

  it('the ledger holds the truth the narration told — the corrected one — as lore does', async () => {
    const plan = await seedPlan();
    table.replies = () => ({ prose: 'The helmet comes off: the escort is human after all.', sidecar: { newTruths: [], stateChanges: [],
      plans:   [{ id: plan.id, truth: NEW_TRUTH }],
      reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, strongHit());

    expect(planOf(plan.id)).toMatchObject({ truth: NEW_TRUTH, truthRevealed: true });
    expect(await confirmedLore()).toContain(NEW_TRUTH);
    expect(liveTruths(), 'the superseded truth is not a scene fact').not.toContain(OLD_TRUTH);
    expect(liveTruths(), 'the revealed truth is a scene fact').toContain(NEW_TRUTH);
  }, 40_000);

  it('a plan decided and revealed in the same beat is a scene fact too, not lore alone', async () => {
    const plan = await seedPlan({ truth: '', oracleSeeds: ['Character Role: Scout'] });
    table.replies = () => ({ prose: 'The helmet comes off: the escort is human.', sidecar: { newTruths: [], stateChanges: [],
      plans:   [{ id: plan.id, truth: NEW_TRUTH }],
      reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, strongHit());
    expect(planOf(plan.id)).toMatchObject({ truth: NEW_TRUTH, truthRevealed: true });
    expect(await confirmedLore()).toContain(NEW_TRUTH);
    expect(liveTruths(), 'the revealed truth is a scene fact').toContain(NEW_TRUTH);
  }, 40_000);

  it('the scene fact carries the name the correction gave the subject, as the plan and its lore do', async () => {
    const plan = await seedPlan();
    table.replies = () => ({ prose: 'The helmet comes off: Pilot Ossa, not a drone at all.', sidecar: { newTruths: [], stateChanges: [],
      plans:   [{ id: plan.id, subject: 'Pilot Ossa', truth: NEW_TRUTH }],
      reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, strongHit());
    expect(planOf(plan.id).subject.name).toBe('Pilot Ossa');
    const truth = (stored().sceneTruths ?? []).find(t => t.fact === NEW_TRUTH);
    expect(JSON.stringify(truth?.subject)).toMatch(/Pilot Ossa/);
  }, 40_000);
});
