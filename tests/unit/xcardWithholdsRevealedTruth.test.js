/**
 * STARFORGED COMPANION
 * tests/unit/xcardWithholdsRevealedTruth.test.js
 *
 * Issue #364 XCARD-REVEAL-REREVEAL-NO-LORE (decided by the maintainer: the
 * X-Card's exclusion holds).
 *
 * The X-Card on a narration that revealed a hidden plan's truth puts the
 * truth back to hidden (by its `truthRevealedBy` mark) and retracts its Lore
 * entry — pending the GM since issue #402's change 1b, which also files no
 * scene fact of the reveal's own. The narrator was still given the truth
 * under UNREVEALED and asked to record "truth" when it comes out, so a later
 * narration revealed it again: the plan read "revealed" while its Lore entry
 * stayed retracted and the only scene fact for it was the X-Card's — the
 * records disagreed, and the X-carded content was back in the story.
 *
 * Decided: after the X-Card takes back a reveal of a plan's truth, that truth
 * is withheld from the narrator (`truthWithheldBy` on the plan record) — not
 * shown under UNREVEALED or in the world snapshot, not offered to reveal, a
 * clock no longer counts down to it, an oracle question is not answered from
 * it — and a narration's reveal of it is not recorded. The rest of the plan
 * stays in play. The GMs are told once, GM-only, which plan's truth is
 * withheld and how to lift it: a GM's edit of the truth in the Secrets
 * panel lifts it, and a GM's own Reveal now still reveals it.
 *
 * The real path: the skeleton table's narrator, the X-Card from Pat's
 * client, the GM's Resume.
 */

/* global silenceConsoleErrors */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';
import { formatUnrevealedBlock, formatSnapshotPlan } from '../../src/narration/narratorPrompt.js';
import { normaliseSkeleton } from '../../src/world/skeletons.js';

const TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';
const NEW_TRUTH = 'The escort is a salvaged courier that still carries its dead owner\'s orders.';
const LORE_TITLE = 'Threat: the escort';
const CLUE = 'A pulse that counts down';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  restore = await resetSkeletonTable(table);
  silenceConsoleErrors();
});
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const planOf = (id) => plansOf(table).find(p => p.id === id);
const plain = () => ({ prose: 'Silence.', sidecar: { newTruths: [], stateChanges: [] } });
const lastNarrationId = () => table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;
const liveFacts = (fact) => (stored().sceneTruths ?? []).filter(t => t.fact === fact && !t.retracted);
const notices = () => table.cards(f => f.xcardTruthWithheldNotice === true);
const rollsCards = () => table.cards(f => f.secretRollsCard === true && !f.rollsWithdrawn);

const loreEntries = () => {
  const journal = gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'lore')) ?? null;
  return (journal?.pages?.contents ?? []).map(p => p.flags?.[MODULE_ID]?.loreEntry).filter(Boolean);
};
async function confirmedLore(text) {
  const { getConfirmedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
  return gmOf(table).run(() => getConfirmedLore(null)).filter(e => e.text === text);
}

/** The Lore stating it, confirmed or pending the GM — a retracted entry is neither. */
async function loreStating(text) {
  const { getConfirmedLore, getNarratorAssertedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
  return gmOf(table).run(() => [...getConfirmedLore(null), ...getNarratorAssertedLore(null)]).filter(e => e.text === text);
}

/** A decided plan in this scene, filed as the canonical GM files one. */
async function seedPlan() {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH, wants: 'A name the crew carries.',
    escalation: ['It asks again, closer', 'It seals the corridor'], clues: [CLUE, 'A Choir sigil on its hull'],
    resolutions: ['Give it a false name'], oracleSeeds: ['Character Role: Scout', 'Character Disposition: Hostile'],
    sceneId: 'sc-1', sessionId: 's-1',
  }));
}

/** A move narration whose beat does `reveal` to the plan; its narration id. */
async function narrationReveals(plan, reveal) {
  // Its prose tells the plan's truth as it stands: a truth is revealed by
  // prose that tells it (secrets.js withoutUntoldTruths).
  const prose = `The escort turns. ${planOf(plan.id)?.truth ?? ''}`.trim();
  table.replies = () => ({ prose, sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plan.id, ...reveal }] } });
  await narrateMoveOn(table, moveResolution());
  table.replies = plain;
  return lastNarrationId();
}

async function liftXCard() {
  const { clearXCard } = await gmOf(table).import('../../src/context/safety.js');
  await onGm(table, () => clearXCard());
}

/** The plan's truth is revealed, then the X-Card takes that narration back and the GM resumes. */
async function revealThenXCard(plan) {
  await patSpeaks(table);
  const revealer = await narrationReveals(plan, { revealed: ['truth'] });
  expect(planOf(plan.id), 'the narration revealed it (setup)').toMatchObject({ truthRevealed: true, truthRevealedBy: revealer });
  expect(await loreStating(TRUTH), 'and filed it as Lore (setup)').toHaveLength(1);
  await playXCard(table);
  await liftXCard();
  return revealer;
}

describe('issue #364 XCARD-REVEAL-REREVEAL-NO-LORE — the X-Card that took back a reveal withholds that truth from the narrator', () => {
  it('the X-Card marks the truth withheld, and tells the GMs once, GM-only, which plan and how to lift it', async () => {
    const plan = await seedPlan();
    const revealer = await revealThenXCard(plan);

    const record = planOf(plan.id);
    expect(record).toMatchObject({ truthRevealed: false, truthWithheldBy: revealer, truth: TRUTH, status: 'active' });
    expect(await loreStating(TRUTH), 'its Lore entry is retracted').toHaveLength(0);
    const [notice, ...more] = notices();
    expect(more, 'told once').toEqual([]);
    expect(notice, 'the GMs are told').toBeTruthy();
    expect(notice.whisper, 'GM-only').toEqual(['gm-1']);
    expect(notice.content).toContain('the escort');
    expect(notice.content).toMatch(/Edit/);
    expect(notice.content).toMatch(/Reveal now/);
    expect(notice.content, 'the notice never states the truth').not.toContain(TRUTH);
  }, 60_000);

  it('the next narration is not given the truth or offered to reveal it, and its reveal of it is not recorded — the rest of the plan stays in play', async () => {
    const plan = await seedPlan();
    const revealer = await revealThenXCard(plan);
    const rollsBefore = rollsCards().length;
    const noticesBefore = notices().length;

    await patSpeaks(table);
    // The narrator reveals the truth again, shows a clue and plays a step in the same beat.
    await narrationReveals(plan, { revealed: ['truth', 'c1'], advanced: 'e1' });

    const system = narrationCallsOf(table).at(-1).system ?? '';
    expect(system, 'the plan is still in play').toContain(`(id ${plan.id})`);
    expect(system, 'with its clues').toContain(CLUE);
    expect(system, 'never its truth').not.toContain(TRUTH);
    expect(system).not.toContain('(already revealed — the characters know it)');

    const record = planOf(plan.id);
    expect(record, 'the plan stays unrevealed, still withheld').toMatchObject({ truthRevealed: false, truthWithheldBy: revealer, truth: TRUTH });
    expect(record.clues[0].revealed, 'the clue the beat showed is recorded').toBe(true);
    expect(record.escalation[0].done, 'and the step it played').toBe(true);
    expect(await loreStating(TRUTH), 'nothing is filed as Lore').toHaveLength(0);
    expect(loreEntries().filter(e => e.title === LORE_TITLE), 'the X-Card\'s retracted entry is the only one').toHaveLength(1);
    expect(liveFacts(TRUTH), 'no scene fact states it').toEqual([]);
    expect(rollsCards().length, 'no rolls card is posted').toBe(rollsBefore);
    expect(notices().length, 'the GMs are not told again').toBe(noticesBefore);
  }, 90_000);

  it('the withheld mark is on the stored plan record, so it holds after a reload', async () => {
    const plan = await seedPlan();
    const revealer = await revealThenXCard(plan);
    const page = gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets'))
      .pages.contents.find(p => p.flags[MODULE_ID].secretEntry.id === plan.id);
    expect(page.flags[MODULE_ID].secretEntry.truthWithheldBy).toBe(revealer);
    // An older plan, stored before the mark existed, reads as not withheld.
    const older = { ...page.flags[MODULE_ID].secretEntry };
    delete older.truthWithheldBy;
    expect(normaliseSkeleton(older).truthWithheldBy).toBeNull();
  }, 60_000);

  it('neither the world snapshot nor a Private Channel story nor an oracle question is given the withheld truth', async () => {
    const plan = await seedPlan();
    const revealer = await revealThenXCard(plan);
    const record = planOf(plan.id);

    const snapshot = formatSnapshotPlan(record);
    expect(snapshot).toContain(`(id ${plan.id})`);
    expect(snapshot).toContain(CLUE);
    expect(snapshot).not.toContain(TRUTH);

    const block = formatUnrevealedBlock([record]);
    expect(block).not.toContain(TRUTH);
    expect(block, 'a withheld truth is not asked to be decided again').not.toContain('DECIDE NOW');

    const { planForQuestion } = await gmOf(table).import('../../src/oracles/oracleConsult.js');
    expect(gmOf(table).run(() => planForQuestion('Is the escort collecting names?')), 'no odds are set from it').toBeNull();

    // A countdown that had only the answer left no longer counts down to it.
    const { updateSkeleton, planForClock } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => updateSkeleton(plan.id, r => ({ ...r, clockId: 'clk-escort',
      escalation: r.escalation.map(e => ({ ...e, done: true })) }), { byGm: true }));
    expect(gmOf(table).run(() => planForClock('clk-escort'))).toMatchObject({ step: null, revealsTruth: false });
    expect(planOf(plan.id).truthWithheldBy, 'a GM write that leaves the truth alone keeps the mark').toBe(revealer);
  }, 60_000);
});

describe('issue #364 XCARD-REVEAL-REREVEAL-NO-LORE — controls', () => {
  it('a truth never X-carded is revealed as before: the plan reads revealed, one Lore entry pending the GM, no scene fact of its own', async () => {
    const plan = await seedPlan();
    await narrateMoveOn(table, moveResolution());
    expect(narrationCallsOf(table).at(-1).system, 'the narrator is given the truth').toContain(TRUTH);

    const revealer = await narrationReveals(plan, { revealed: ['truth'] });

    expect(planOf(plan.id)).toMatchObject({ truthRevealed: true, truthRevealedBy: revealer, truthWithheldBy: null });
    expect(await loreStating(TRUTH)).toHaveLength(1);
    expect(await confirmedLore(TRUTH), 'pending the GM').toHaveLength(0);
    expect(liveFacts(TRUTH), 'the reveal files only what the narration\'s block gave').toHaveLength(0);
    expect(notices()).toEqual([]);
  }, 60_000);

  it('a GM\'s edit of the truth lifts the withholding: the next narration is given the new truth, and its reveal is recorded with one Lore entry', async () => {
    const plan = await seedPlan();
    await revealThenXCard(plan);
    const { editSkeleton } = await gmOf(table).import('../../src/world/secrets.js');

    // An edit that leaves the truth's text as it is lifts nothing.
    await onGm(table, () => editSkeleton(plan.id, { truth: TRUTH, wants: 'A name, any name.' }));
    expect(planOf(plan.id).truthWithheldBy, 'the truth unchanged: still withheld').toBeTruthy();

    await onGm(table, () => editSkeleton(plan.id, { truth: NEW_TRUTH }));
    expect(planOf(plan.id)).toMatchObject({ truth: NEW_TRUTH, truthRevealed: false, truthWithheldBy: null });

    await patSpeaks(table);
    const revealer = await narrationReveals(plan, { revealed: ['truth'] });

    expect(narrationCallsOf(table).at(-1).system, 'the narrator is given the new truth').toContain(NEW_TRUTH);
    expect(planOf(plan.id)).toMatchObject({ truthRevealed: true, truthRevealedBy: revealer, truthWithheldBy: null });
    expect(await loreStating(NEW_TRUTH), 'one Lore entry, stating the new truth, pending the GM').toHaveLength(1);
    expect(loreEntries().filter(e => e.title === LORE_TITLE && !e.retracted), 'the X-Card\'s retraction lifted').toHaveLength(1);
    expect(liveFacts(NEW_TRUTH)).toHaveLength(0);
  }, 90_000);

  it('a GM\'s Reveal now still reveals the withheld truth, as the GM\'s decision', async () => {
    const plan = await seedPlan();
    await revealThenXCard(plan);
    const { revealSkeletonNow } = await gmOf(table).import('../../src/world/secrets.js');

    await onGm(table, () => revealSkeletonNow(plan.id));

    expect(planOf(plan.id)).toMatchObject({ truthRevealed: true, truthRevealedBy: null, truthWithheldBy: null });
    expect(table.cards(f => f.secretRevealCard === true && f.skeletonId === plan.id), 'the reveal card is posted').toHaveLength(1);
    expect(await confirmedLore(TRUTH), 'and it is canon').toHaveLength(1);

    await narrateMoveOn(table, moveResolution());
    expect(narrationCallsOf(table).at(-1).system).toContain(`${TRUTH} (already revealed — the characters know it)`);
  }, 90_000);
});
