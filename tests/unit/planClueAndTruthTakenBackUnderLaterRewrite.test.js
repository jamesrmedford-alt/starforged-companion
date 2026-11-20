/**
 * STARFORGED COMPANION
 * tests/unit/planClueAndTruthTakenBackUnderLaterRewrite.test.js
 *
 * Issue #364 PLAN-CLUE-TRUTH-NO-MARK (left open by
 * PLAN-STEP-REWRITTEN-BEFORE-BURN): a played escalation step carries the
 * narration that played it, so taking that narration back un-plays the step
 * even when another narration, or a GM, wrote the plan since. A clue shown
 * and a truth revealed carried no such mark: under a later writer's version
 * of the plan the undo found nothing of the removed narration's, and the clue
 * stayed shown, the truth revealed — every later narration told "the
 * characters know it" of a reveal the table had taken back.
 *
 * A shown clue now carries the narration that showed it, a revealed truth the
 * narration that revealed it (and showed its oracle rolls), and the undo takes
 * them back by those marks as it does a step. What the later writer wrote
 * stands; what the reveal wrote outside the plan — its scene fact, its Lore
 * entry — goes by the narration's stamp, exactly as when the plan's newest
 * version is the removed narration's. A clue or truth shown before the marks
 * were kept carries none, and behaves as before.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';
import { normaliseSkeleton, applyRevealToSkeleton, applyPlanToSkeleton } from '../../src/world/skeletons.js';

const TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const planOf = (id) => plansOf(table).find(p => p.id === id);
const plain = () => ({ prose: 'Silence.', sidecar: { newTruths: [], stateChanges: [] } });
const lastNarrationId = () => table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;
const sceneFact = () => (stored().sceneTruths ?? []).find(t => t.fact === TRUTH);

async function confirmedLore() {
  const { getConfirmedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
  return gmOf(table).run(() => getConfirmedLore(null)).filter(e => e.text === TRUTH);
}

/** A decided plan in this scene, filed as the canonical GM files one. */
async function seedPlan() {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH, wants: 'A name the crew carries.',
    escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down', 'A Choir sigil on its hull'],
    resolutions: ['Give it a false name'], oracleSeeds: ['Character Role: Scout', 'Character Disposition: Hostile'],
    sceneId: 'sc-1', sessionId: 's-1',
  }));
}

/** A move narration whose beat does `reveal` to the plan; its narration id. */
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

describe('issue #364 PLAN-CLUE-TRUTH-NO-MARK — a clue and a truth go back with the narration that showed them, whatever was written since', () => {
  it('a shown clue and a revealed truth carry the narration that showed them', async () => {
    const plan = await seedPlan();
    const shown = await narrationReveals(plan, { revealed: ['c1'] });
    const revealed = await narrationReveals(plan, { revealed: ['truth'] });

    const record = planOf(plan.id);
    expect(record.clues[0]).toMatchObject({ revealed: true, revealedBy: shown });
    expect(record.clues[1].revealed).toBe(false);
    expect(record.clues[1].revealedBy).toBeUndefined();
    expect(record).toMatchObject({ truthRevealed: true, truthRevealedBy: revealed, rollsShown: true, rollsShownBy: revealed });
  }, 60_000);

  it('a clue shown by a superseded narration, under a later narration\'s version: unshown — the later narration\'s step and clue stand', async () => {
    const plan = await seedPlan();
    const first = await narrationReveals(plan, { revealed: ['c1'] });
    const later = await narrationReveals(plan, { revealed: ['c2'], advanced: 'e1' });
    expect(planOf(plan.id).narrationId, 'the later narration\'s version is on top').toBe(later);

    await supersede(first);
    const record = planOf(plan.id);
    expect(record.clues[0].revealed, 'the taken-back narration\'s clue is unshown').toBe(false);
    expect(record.clues[0].revealedBy).toBeUndefined();
    expect(record.clues[1], 'the later narration\'s own clue stands').toMatchObject({ revealed: true, revealedBy: later });
    expect(record.escalation[0], 'and its step').toMatchObject({ done: true, playedBy: later });
    expect(record.narrationId, 'the plan is still the later narration\'s version').toBe(later);
  }, 60_000);

  it('a truth revealed by a superseded narration, under a later narration\'s version: unrevealed, its rolls unshown, its scene fact gone', async () => {
    const plan = await seedPlan();
    const revealer = await narrationReveals(plan, { revealed: ['truth'] });
    expect(sceneFact()?.narrationId).toBe(revealer);
    const later = await narrationReveals(plan, { advanced: 'e1' });

    await supersede(revealer);
    const record = planOf(plan.id);
    expect(record).toMatchObject({ truthRevealed: false, rollsShown: false, status: 'active' });
    expect(record.truthRevealedBy ?? null).toBeNull();
    expect(record.rollsShownBy ?? null).toBeNull();
    expect(record.truth, 'the plan keeps its truth, hidden again').toBe(TRUTH);
    expect(record.escalation[0], 'the later narration\'s step stands').toMatchObject({ done: true, playedBy: later });
    expect(sceneFact()?.retracted, 'the stated fact binds no later narration').toBe(true);

    // The next narration is told the truth is unrevealed again.
    await narrateMoveOn(table, moveResolution());
    const system = narrationCallsOf(table).at(-1).system ?? '';
    expect(system, 'the plan is in the narrator\'s prompt').toContain(TRUTH);
    expect(system).not.toContain('(already revealed — the characters know it)');
  }, 60_000);

  it('the X-Card on a revealing narration after a GM edited the plan: the reveal is undone as it is without the edit, and the edit stands', async () => {
    // Without the edit: the plan's newest version is the removed narration's.
    const control = await seedPlan();
    await patSpeaks(table);
    await narrationReveals(control, { revealed: ['truth', 'c2'] });
    await playXCard(table);
    const expected = { truthRevealed: false, rollsShown: false, status: 'active' };
    expect(planOf(control.id)).toMatchObject(expected);
    expect(planOf(control.id).clues[1].revealed).toBe(false);
    expect(await confirmedLore()).toHaveLength(0);
    expect(sceneFact()?.retracted).toBe(true);
  }, 60_000);

  it('…and with the edit: the same, under the GM\'s version', async () => {
    const plan = await seedPlan();
    await patSpeaks(table);   // the X-Card's beat begins here
    await narrationReveals(plan, { revealed: ['truth', 'c2'] });
    expect(await confirmedLore()).toHaveLength(1);
    await gmEdits(plan, { wants: 'Every name aboard.' });
    expect(planOf(plan.id)).toMatchObject({ truthRevealed: true, wants: 'Every name aboard.' });

    await playXCard(table);
    const record = planOf(plan.id);
    expect(record, 'the reveal is undone').toMatchObject({ truthRevealed: false, rollsShown: false, status: 'active' });
    expect(record.clues[1].revealed).toBe(false);
    expect(record.wants, 'the GM\'s edit stands').toBe('Every name aboard.');
    expect(await confirmedLore(), 'its Lore entry is retracted, by the narration\'s stamp').toHaveLength(0);
    expect(sceneFact()?.retracted, 'and its scene fact').toBe(true);
  }, 60_000);

  it('the X-Card on the later narration afterwards does not bring the clue back shown', async () => {
    const plan = await seedPlan();
    const first = await narrationReveals(plan, { revealed: ['c1', 'truth'] });
    await patSpeaks(table);
    await narrationReveals(plan, { advanced: 'e1' });
    await supersede(first);
    expect(planOf(plan.id).clues[0].revealed).toBe(false);

    await playXCard(table);   // removes the later narration: its version goes, the one before comes back
    const record = planOf(plan.id);
    expect(record.escalation[0].done, 'the later narration\'s step is gone with it').toBe(false);
    expect(record.clues[0].revealed, 'and the first narration\'s clue does not come back').toBe(false);
    expect(record.truthRevealed, 'nor its truth').toBe(false);
  }, 60_000);

  it('a clue and a truth shown before the marks were kept carry none: under a later version they stand, as before', async () => {
    const plan = await seedPlan();
    const first = await narrationReveals(plan, { revealed: ['c1', 'truth'] });
    // As a world from before the change stored it: shown, with no mark.
    await onGm(table, async () => {
      const journal = game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets');
      const page = journal.pages.contents.find(p => p.flags?.[MODULE_ID]?.secretEntry?.id === plan.id);
      const entry = page.flags[MODULE_ID].secretEntry;
      await page.setFlag(MODULE_ID, 'secretEntry', { ...entry, truthRevealedBy: null, rollsShownBy: null,
        clues: entry.clues.map(c => ({ id: c.id, text: c.text, revealed: c.revealed })) });
    });
    await narrationReveals(plan, { advanced: 'e1' });

    await supersede(first);
    const record = planOf(plan.id);
    expect(record.clues[0].revealed).toBe(true);
    expect(record.truthRevealed).toBe(true);
  }, 60_000);

  it('a GM\'s own Reveal now is not a narration\'s to take back', async () => {
    const plan = await seedPlan();
    const revealer = await narrationReveals(plan, { revealed: ['truth'] });
    const { revealSkeletonNow } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => revealSkeletonNow(plan.id));
    expect(planOf(plan.id).truthRevealedBy ?? null, 'the reveal is the GM\'s now').toBeNull();

    await supersede(revealer);
    expect(planOf(plan.id).truthRevealed, 'the GM\'s reveal stands').toBe(true);
  }, 60_000);

  it('a GM\'s edit that keeps a shown clue word for word keeps its mark', async () => {
    const plan = await seedPlan();
    const first = await narrationReveals(plan, { revealed: ['c1'] });
    await gmEdits(plan, { clues: ['A new first clue', 'A pulse that counts down'] });
    expect(planOf(plan.id).clues[1]).toMatchObject({ text: 'A pulse that counts down', revealed: true, revealedBy: first });

    await supersede(first);
    expect(planOf(plan.id).clues.map(c => c.revealed)).toEqual([false, false]);
  }, 60_000);
});

describe('skeletons — the marks on a shown clue and a revealed truth', () => {
  const base = () => normaliseSkeleton({
    id: 'plan-1', kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH,
    escalation: ['It asks again'], clues: ['A pulse', 'A sigil'],
  });

  it('applyRevealToSkeleton marks what this beat shows, and leaves what was shown before alone', () => {
    const once = applyRevealToSkeleton(base(), { revealed: ['c1'], advanced: null, resolved: false }, { narrationId: 'narr-a' });
    expect(once.clues[0]).toMatchObject({ revealed: true, revealedBy: 'narr-a' });
    expect(once.truthRevealed).toBe(false);
    const twice = applyRevealToSkeleton(once, { revealed: ['c1', 'c2', 'truth'], advanced: null, resolved: false }, { narrationId: 'narr-b' });
    expect(twice.clues[0].revealedBy, 'shown before: the first narration\'s').toBe('narr-a');
    expect(twice.clues[1].revealedBy).toBe('narr-b');
    expect(twice).toMatchObject({ truthRevealed: true, truthRevealedBy: 'narr-b' });
    const again = applyRevealToSkeleton(twice, { revealed: ['truth'], advanced: null, resolved: false }, { narrationId: 'narr-c' });
    expect(again.truthRevealedBy, 'revealed before: the earlier narration\'s').toBe('narr-b');
  });

  it('a reveal with no narration marks nothing', () => {
    const next = applyRevealToSkeleton(base(), { revealed: ['c1', 'truth'], advanced: null, resolved: false });
    expect(next.clues[0].revealed).toBe(true);
    expect(next.clues[0].revealedBy).toBeUndefined();
    expect(normaliseSkeleton(next)).toMatchObject({ truthRevealed: true, truthRevealedBy: null });
  });

  it('normaliseSkeleton keeps a mark only on what is shown', () => {
    const record = normaliseSkeleton({ ...base(), truthRevealed: false, truthRevealedBy: 'narr-a', rollsShown: false, rollsShownBy: 'narr-a',
      clues: [{ id: 'c1', text: 'A pulse', revealed: false, revealedBy: 'narr-a' }, { id: 'c2', text: 'A sigil', revealed: true, revealedBy: 'narr-b' }] });
    expect(record.truthRevealedBy).toBeNull();
    expect(record.rollsShownBy).toBeNull();
    expect(record.clues[0].revealedBy).toBeUndefined();
    expect(record.clues[1].revealedBy).toBe('narr-b');
    expect(normaliseSkeleton({ ...base(), truthRevealed: true, truthRevealedBy: 'narr-a', rollsShown: true, rollsShownBy: 'narr-a' }))
      .toMatchObject({ truthRevealedBy: 'narr-a', rollsShownBy: 'narr-a' });
  });

  it('applyPlanToSkeleton keeps the mark of a clue repeated word for word', () => {
    const shown = applyRevealToSkeleton(base(), { revealed: ['c2'], advanced: null, resolved: false }, { narrationId: 'narr-a' });
    const next = applyPlanToSkeleton(shown, { subject: '', truth: '', wants: '', knows: '', escalation: [], resolutions: [], clues: ['A sigil', 'A new clue'] });
    expect(next.clues[0]).toMatchObject({ text: 'A sigil', revealed: true, revealedBy: 'narr-a' });
    expect(next.clues[1].revealed).toBe(false);
    expect(next.clues[1].revealedBy).toBeUndefined();
  });
});
