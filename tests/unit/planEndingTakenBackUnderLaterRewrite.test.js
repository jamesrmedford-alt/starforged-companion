/**
 * STARFORGED COMPANION
 * tests/unit/planEndingTakenBackUnderLaterRewrite.test.js
 *
 * Issue #364 PLAN-RESOLVED-NO-MARK (found while fixing
 * PLAN-CLUE-TRUTH-NO-MARK, and reproduced): a narration whose beat ends a
 * hidden plan's story marks the plan resolved — it leaves play. Taking that
 * narration back (the X-Card, a Burn Momentum / Improve Result supersede) put
 * the plan back in play only while its newest version was that narration's.
 * After a GM's edit of the ended plan, the undo found nothing of the
 * narration's on it: the plan stayed resolved, out of every later narration,
 * for an ending the table had taken back.
 *
 * The ending now carries the narration that gave it (`resolvedBy`), as a
 * played step, a shown clue and a revealed truth carry theirs, and the undo
 * takes it back by that mark. A plan its subject's end or a GM closed carries
 * none and stays closed; so does one ended before the mark was kept.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';
import { normaliseSkeleton, applyRevealToSkeleton } from '../../src/world/skeletons.js';

const TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const clockOf = (id) => (stored().clocks ?? []).find(c => c._id === id);
const planOf = (id) => plansOf(table).find(p => p.id === id);
const plain = () => ({ prose: 'Silence.', sidecar: { newTruths: [], stateChanges: [] } });
const lastNarrationId = () => table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;

/** A decided plan in this scene, filed as the canonical GM files one. */
async function seedPlan() {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH, wants: 'A name the crew carries.',
    escalation: ['It asks again, closer'], clues: ['A pulse that counts down'], sceneId: 'sc-1', sessionId: 's-1',
  }));
}

/** A threat the fiction revealed and decided: it has a clock. */
async function threatWithClock() {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: TRUTH, escalation: ['It asks again, closer', 'It seals the corridor'] }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  table.replies = plain;
  return plansOf(table).find(p => p.kind === 'threat');
}

async function narrationReveals(plan, reveal) {
  table.replies = () => ({ prose: 'The escort turns.', sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plan.id, ...reveal }] } });
  await narrateMoveOn(table, moveResolution());
  table.replies = plain;
  return lastNarrationId();
}

async function supersede(narrationId) {
  const { retractSupersededNarrations } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
  await onGm(table, () => retractSupersededNarrations([narrationId], { label: 'burn' }));
}

async function gmEdits(plan, fields) {
  const { editSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
  await onGm(table, () => editSkeleton(plan.id, fields));
}

describe('issue #364 PLAN-RESOLVED-NO-MARK — an ending goes back with the narration that gave it, whatever was written since', () => {
  it('an ended plan carries the narration that ended it', async () => {
    const plan = await seedPlan();
    const ender = await narrationReveals(plan, { resolved: true });
    expect(planOf(plan.id)).toMatchObject({ status: 'resolved', resolvedBy: ender });
  }, 60_000);

  it('a superseded narration\'s ending, under a GM\'s edit of the plan: the plan is in play again, the edit stands', async () => {
    const plan = await seedPlan();
    const ender = await narrationReveals(plan, { resolved: true });
    await gmEdits(plan, { wants: 'Every name aboard.' });
    expect(planOf(plan.id)).toMatchObject({ status: 'resolved', wants: 'Every name aboard.' });

    await supersede(ender);
    const record = planOf(plan.id);
    expect(record.status, 'the ending is taken back').toBe('active');
    expect(record.resolvedBy ?? null).toBeNull();
    expect(record.wants, 'the GM\'s edit stands').toBe('Every name aboard.');

    // The next narration is told the plan again.
    await narrateMoveOn(table, moveResolution());
    expect(narrationCallsOf(table).at(-1).system ?? '').toContain(TRUTH);
  }, 60_000);

  it('the X-Card on the ending narration after a GM\'s edit: the plan is back, and the clock its ending retired runs again', async () => {
    const plan = await threatWithClock();
    const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
    await onGm(table, () => clocks.adjustClockSegments(plan.clockId, 2));
    await patSpeaks(table);   // the X-Card's beat begins here
    const ender = await narrationReveals(plan, { resolved: true });
    expect(clockOf(plan.clockId)).toMatchObject({ active: false, pacedBy: ender });
    await gmEdits(plan, { wants: 'Every name aboard.' });

    await playXCard(table);
    expect(planOf(plan.id)).toMatchObject({ status: 'active', wants: 'Every name aboard.' });
    expect(clockOf(plan.clockId), 'the clock paces the plan again').toMatchObject({ active: true, filled: 2 });
  }, 90_000);

  it('a later narration\'s ending stands when an earlier narration is taken back', async () => {
    const plan = await seedPlan();
    const first = await narrationReveals(plan, { revealed: ['c1'] });
    const ender = await narrationReveals(plan, { resolved: true });

    await supersede(first);
    const record = planOf(plan.id);
    expect(record, 'the later narration\'s own write stands').toMatchObject({ status: 'resolved', resolvedBy: ender });
    expect(record.clues[0].revealed, 'the earlier narration\'s clue is unshown').toBe(false);
  }, 60_000);

  it('a GM\'s Retire after the ending is the GM\'s: the plan stays out of play', async () => {
    const plan = await seedPlan();
    const ender = await narrationReveals(plan, { resolved: true });
    const { retireSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => retireSkeleton(plan.id));
    expect(planOf(plan.id).status).toBe('retired');

    await supersede(ender);
    expect(planOf(plan.id).status).toBe('retired');
  }, 60_000);

  it('a plan ended before the mark was kept carries none: under a later version it stays resolved, as before', async () => {
    const plan = await seedPlan();
    const ender = await narrationReveals(plan, { resolved: true });
    await onGm(table, async () => {
      const journal = game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets');
      const page = journal.pages.contents.find(p => p.flags?.[MODULE_ID]?.secretEntry?.id === plan.id);
      await page.setFlag(MODULE_ID, 'secretEntry', { ...page.flags[MODULE_ID].secretEntry, resolvedBy: null });
    });
    await gmEdits(plan, { wants: 'Every name aboard.' });

    await supersede(ender);
    expect(planOf(plan.id).status).toBe('resolved');
  }, 60_000);
});

describe('skeletons — the mark on an ended plan', () => {
  const base = (over = {}) => normaliseSkeleton({
    id: 'plan-1', kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH, escalation: ['It asks again'], ...over,
  });

  it('applyRevealToSkeleton marks the ending only when this beat gives it', () => {
    const ended = applyRevealToSkeleton(base(), { revealed: [], advanced: null, resolved: true }, { narrationId: 'narr-a' });
    expect(ended).toMatchObject({ status: 'resolved', resolvedBy: 'narr-a' });
    // A plan its subject's end already resolved: the beat that tells it is not what ended it.
    const already = applyRevealToSkeleton(base({ status: 'resolved' }), { revealed: [], advanced: null, resolved: true }, { narrationId: 'narr-b' });
    expect(normaliseSkeleton(already)).toMatchObject({ status: 'resolved', resolvedBy: null });
    const untouched = applyRevealToSkeleton(base(), { revealed: [], advanced: 'e1', resolved: false }, { narrationId: 'narr-a' });
    expect(normaliseSkeleton(untouched)).toMatchObject({ status: 'active', resolvedBy: null });
  });

  it('normaliseSkeleton keeps the mark only on a resolved plan', () => {
    expect(base({ status: 'resolved', resolvedBy: 'narr-a' }).resolvedBy).toBe('narr-a');
    expect(base({ status: 'retired', resolvedBy: 'narr-a' }).resolvedBy).toBeNull();
    expect(base({ status: 'active', resolvedBy: 'narr-a' }).resolvedBy).toBeNull();
  });
});
