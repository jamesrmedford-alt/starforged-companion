/**
 * STARFORGED COMPANION
 * tests/unit/plansCloseWithTheirSubject.test.js
 *
 * Issue #362 D4 (PLANS-NEVER-CLOSE, decided A): nothing closed a hidden plan
 * but the narrator's own `resolved` or a GM's Retire, so a finished
 * expedition's, a fulfilled or forsaken vow's and an old scene's mystery plan
 * stayed active when the closing narration omitted it, failed or was paused —
 * in every world snapshot, under every player's Unanswered questions, and the
 * plan a waypoint's peril picked (AC11). The code now closes a plan as its
 * subject ends: an expedition's when its track completes (resolved) or is
 * removed (retired), a vow's when its vow is completed — fulfilled or forsaken
 * — (resolved) or its last copy deleted (retired), and a scene's unanswered
 * mysteries, with their clocks, when the scene ends (retired). The narration
 * that ends a track or a vow still has its plan in play to reveal its end.
 *
 * The coverage appendix's NARB "Nothing closes a plan", SKEL 5, SESS D4 and
 * FC D2, on a simulated table.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const clockOf = (id) => (stored().clocks ?? []).find(c => c._id === id);
const planOf = (id) => plansOf(table).find(p => p.id === id);
const lastCall = () => narrationCallsOf(table).at(-1);
const secrets = () => gmOf(table).import('../../src/world/secrets.js');
const tracks = () => gmOf(table).import('../../src/ui/progressTracks.js');
const reply = (sidecar, prose = 'The corridor holds its breath.') => () => ({ prose, sidecar: { newTruths: [], stateChanges: [], ...sidecar } });

async function expeditionWithPlan(label = 'Bleakhold Reach') {
  const store = await tracks();
  const track = await onGm(table, () => store.addProgressTrack({ type: 'expedition', label, rank: 'dangerous' }));
  const { createSkeleton } = await secrets();
  const plan = await onGm(table, () => createSkeleton({
    kind: 'expedition', subject: { type: 'track', id: track.id, name: label },
    truth: `A drowned Precursor vault waits at the end of ${label}.`, escalation: [{ text: 'Pirates shadow the ship' }],
    clues: [{ text: 'A beacon' }], sceneId: 'sc-earlier', sessionId: 's-1',
  }));
  return { store, track, plan };
}

describe('issue #362 D4 — an expedition\'s plan closes with its track', () => {
  it('control: a plan stays active while its track is open', async () => {
    const { plan } = await expeditionWithPlan();
    table.replies = reply({});
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(planOf(plan.id).status).toBe('active');
    expect(lastCall().system, 'an open expedition\'s plan is in play').toContain(`(id ${plan.id})`);
  }, 40_000);

  it('the track completed: the plan is resolved — and the Finish an Expedition narration still reveals its end', async () => {
    const { store, track, plan } = await expeditionWithPlan();
    await onGm(table, () => store.completeProgressTrack(track.id));
    expect(planOf(plan.id).status, 'resolved in code, whatever the narration does').toBe('resolved');

    table.replies = reply({ reveals: [{ id: plan.id, revealed: ['truth'], resolved: true }] }, 'The vault rises from the dark water.');
    await narrateMoveOn(table, moveResolution({ moveId: 'finish_an_expedition', moveName: 'Finish an Expedition',
      outcome: 'strong_hit', outcomeLabel: 'Strong Hit', endingTrackIds: [track.id] }));
    expect(lastCall().system, 'the finishing narration has it in play').toContain(`(id ${plan.id})`);
    expect(planOf(plan.id)).toMatchObject({ status: 'resolved', truthRevealed: true });
    expect((stored().sceneTruths ?? []).map(t => t.fact), 'its truth a stated fact').toContain(plan.truth);

    // A later beat does not see it.
    table.replies = reply({});
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(lastCall().system).not.toContain(`(id ${plan.id})`);
  }, 40_000);

  it('the track removed from the panel: its plan is retired', async () => {
    const { store, track, plan } = await expeditionWithPlan();
    const removed = await onGm(table, () => store.applyProgressTrackEditFromRelay({ op: 'remove', trackId: track.id },
      { requesterIsGM: true, requesterId: 'gm-1' }));
    expect(removed).toMatchObject({ applied: true });
    expect(planOf(plan.id).status).toBe('retired');
  }, 40_000);

  it('the panel\'s Complete resolves it too', async () => {
    const { store, track, plan } = await expeditionWithPlan();
    await onGm(table, () => store.applyProgressTrackEditFromRelay({ op: 'complete', trackId: track.id },
      { requesterIsGM: true, requesterId: 'gm-1' }));
    expect(planOf(plan.id).status).toBe('resolved');
  }, 40_000);
});

describe('issue #362 D4 — a vow\'s plan closes with its vow', () => {
  /** A shared vow — a copy on Kira and one on Ren — with its plan about the vow, by id. */
  async function sharedVowWithPlan() {
    const copy = (id, actorId) => ({ id, type: 'progress', name: 'Find the lost ark', parent: null,
      system: { subtype: 'vow', completed: false, current: 0, rank: 2 },
      flags: { [MODULE_ID]: { vowId: 'vow-ark-1', sharedVow: true } }, actorId });
    const kira = gmOf(table).run(() => game.actors.get('pc-kira'));
    const kiraCopy = copy('it-kira', 'pc-kira');
    kira.items = { contents: [kiraCopy], find: (fn) => [kiraCopy].find(fn) };
    const renCopy = copy('it-ren', 'pc-ren');
    const ren = table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-1': 3 } });
    ren.items = { contents: [renCopy], find: (fn) => [renCopy].find(fn) };
    const { createSkeleton } = await secrets();
    const plan = await onGm(table, () => createSkeleton({
      kind: 'vow', subject: { type: 'vow', id: 'vow-ark-1', name: 'Find the lost ark' },
      truth: 'The ark is a prison, and something wants out.', sceneId: 'sc-earlier', sessionId: 's-1',
    }));
    return { kira, ren, kiraCopy, renCopy, plan };
  }

  /** Foundry's update / delete hook for a vow Item, as every client fires it. */
  async function itemHook(name, item, change) {
    for (const id of ['gm-1', 'pl-1']) table.client(id).run(() => Hooks.callAll(name, item, change, {}, 'gm-1'));
    await table.settle();
    await table.drain();
  }

  it('a vow completed (fulfilled or forsaken) resolves its plan once no copy of it is open', async () => {
    const { kira, ren, kiraCopy, renCopy, plan } = await sharedVowWithPlan();
    kiraCopy.system.completed = true;
    await itemHook('updateItem', kiraCopy, { system: { completed: true } });
    expect(planOf(plan.id).status, 'Ren\'s copy is still open').toBe('active');
    renCopy.system.completed = true;
    await itemHook('updateItem', renCopy, { system: { completed: true } });
    expect(planOf(plan.id).status).toBe('resolved');
    expect(kira && ren).toBeTruthy();
  }, 40_000);

  it('its last copy deleted retires it', async () => {
    const { kira, ren, kiraCopy, renCopy, plan } = await sharedVowWithPlan();
    kira.items = { contents: [], find: () => undefined };
    await itemHook('deleteItem', kiraCopy, {});
    expect(planOf(plan.id).status, 'Ren still holds a copy').toBe('active');
    ren.items = { contents: [], find: () => undefined };
    await itemHook('deleteItem', renCopy, {});
    expect(planOf(plan.id).status).toBe('retired');
  }, 40_000);

  it('the Fulfill Your Vow narration that ends it still has it in play', async () => {
    const { kiraCopy, renCopy, plan } = await sharedVowWithPlan();
    kiraCopy.system.completed = true;
    renCopy.system.completed = true;
    await itemHook('updateItem', kiraCopy, { system: { completed: true } });
    expect(planOf(plan.id).status).toBe('resolved');
    // The prose tells the truth it reveals (secrets.js withoutUntoldTruths).
    table.replies = reply({ reveals: [{ id: plan.id, revealed: ['truth'] }] }, 'The ark opens: it was a prison, and what was inside is gone.');
    await narrateMoveOn(table, moveResolution({ moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow',
      outcome: 'strong_hit', outcomeLabel: 'Strong Hit', endingTrackIds: ['vow-ark-1'] }));
    expect(lastCall().system).toContain(`(id ${plan.id})`);
    expect(planOf(plan.id).truthRevealed).toBe(true);
  }, 40_000);
});

describe('issue #362 D4 — a scene\'s unanswered mysteries leave with it', () => {
  /** A narration poses a question and starts a countdown: two mysteries of the scene, one with a clock. */
  async function sceneWithMysteries() {
    table.replies = reply({ openQuestions: [{ question: 'Who sent the distress call?' }],
      countdown: { label: 'the reactor count', about: '' } });
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    const mysteries = plansOf(table).filter(p => p.kind === 'mystery');
    expect(mysteries).toHaveLength(2);
    const countdown = mysteries.find(p => p.clockId);
    expect(clockOf(countdown.clockId)).toMatchObject({ active: true });
    return { mysteries, countdown };
  }

  async function endTheScene() {
    const { endScene } = await gmOf(table).import('../../src/factContinuity/sceneLifecycle.js');
    await onGm(table, () => endScene(foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { reason: 'scene_command' }));
  }

  it('the scene ends: its unanswered mysteries are retired, and the countdown\'s clock with them', async () => {
    const { mysteries, countdown } = await sceneWithMysteries();
    await endTheScene();
    for (const m of mysteries) expect(planOf(m.id).status, m.question).toBe('retired');
    expect(clockOf(countdown.clockId).active, 'no price turns the ended scene\'s countdown').toBe(false);
  }, 40_000);

  it('an answered mystery is left as it is; another scene\'s is not touched', async () => {
    const { mysteries } = await sceneWithMysteries();
    const question = mysteries.find(p => !p.clockId);
    const { createSkeleton, updateSkeleton } = await secrets();
    await onGm(table, () => updateSkeleton(question.id, r => ({ ...r, truth: 'The escort sent it.', truthRevealed: true }), { byGm: true }));
    const elsewhere = await onGm(table, () => createSkeleton({
      kind: 'mystery', subject: { type: 'scene', id: 'sc-other', name: 'the dock' }, question: 'Why is the dock empty?',
      sceneId: 'sc-other', sessionId: 's-1',
    }));
    await endTheScene();
    expect(planOf(question.id).status, 'answered').toBe('active');
    expect(planOf(elsewhere.id).status, 'another scene\'s').toBe('active');
  }, 40_000);

  it('a countdown a scene challenge holds is the challenge\'s: its mystery retires, its clock runs on', async () => {
    const { countdown } = await sceneWithMysteries();
    const offer = table.cards(f => !!f.sceneChallengeOffer).at(-1);
    const { applySceneChallengeOffer } = await gmOf(table).import('../../src/moves/sceneChallengeOffer.js');
    await onGm(table, () => applySceneChallengeOffer({ messageId: offer._id ?? offer.id }, { requesterIsGM: true, requesterId: 'gm-1' }));
    await endTheScene();
    expect(planOf(countdown.id).status).toBe('retired');
    expect(clockOf(countdown.clockId).active).toBe(true);
  }, 40_000);

  it('a scene replaced while it held no facts ends its mysteries too', async () => {
    const { mysteries } = await sceneWithMysteries();
    expect(stored().sceneTruths ?? []).toEqual([]);
    const { startScene } = await gmOf(table).import('../../src/factContinuity/sceneLifecycle.js');
    await onGm(table, () => startScene(foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { reason: 'scene_command' }));
    expect(stored().currentSceneId).not.toBe('sc-1');
    for (const m of mysteries) expect(planOf(m.id).status).toBe('retired');
  }, 40_000);
});
