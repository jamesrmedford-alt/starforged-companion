/**
 * STARFORGED COMPANION
 * tests/unit/narrativeSkeletonMechanics.test.js
 *
 * Issue #353 Phase 3 — the narrative skeleton tied to the module's mechanics,
 * on a simulated table (a keyed GM; Pat plays Kira):
 *   - Threat ↔ clock: a decided threat's escalation is paced by a clock it
 *     owns; when the clock fills, its trigger vignette plays the next step
 *     (marked played whatever the sidecar says), and the clock paces the step
 *     after it, or retires.
 *   - A countdown the prose starts (sidecar `countdown`) is a real tension
 *     clock tied to its plan — or a new mystery — and the GMs are offered a
 *     scene challenge whose tension clock it becomes.
 *   - A narration's clocks and plans leave with it: the X-Card, and a Burn
 *     Momentum / Improve Result that supersedes it.
 *   - Expedition ↔ progress track: an expedition begun asks its narration to
 *     plan it (waypoints, dangers, what waits at the end).
 *   - A chosen complication plays the in-scene plan's next escalation step.
 *   - Ask the Oracle about a planned subject (a GM's roll) takes its odds from
 *     the plan's truth.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution,
  narrateMoveOn, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed, expeditionPlanRequest } from '../../src/moves/resolver.js';
import { selectRelevantSkeletons, normaliseSkeleton, normaliseCountdown } from '../../src/world/skeletons.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const clocks = () => stored().clocks ?? [];
const planOf = (id) => plansOf(table).find(p => p.id === id);
const lastCall = () => narrationCallsOf(table).at(-1);
const reply = (sidecar, prose = 'The corridor holds its breath.') => () => ({ prose, sidecar: { newTruths: [], stateChanges: [], ...sidecar } });

async function secrets() { return gmOf(table).import('../../src/world/secrets.js'); }

/** A decided threat plan, filed as a narration files one (the plan's clock comes with its decision). */
async function decidedThreat(over = {}) {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: 'A Keeper drone collecting names.',
        escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down'], ...over }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  return plansOf(table).find(p => p.kind === 'threat');
}

describe('issue #353 Phase 3 — a threat\'s escalation is paced by its clock', () => {
  it('a decided threat gets a 4-segment tension clock, stamped with the narration that decided it', async () => {
    const plan = await decidedThreat();
    const clock = clocks().find(c => c._id === plan.clockId);
    expect(clock).toMatchObject({ name: 'the escort — escalation', type: 'tension', segments: 4, filled: 0, planId: plan.id });
    expect(clock.narrationId).toBe(plan.narrationId);
  }, 40_000);

  it('when the clock fills, its vignette plays the next step — marked played — and the clock paces the next, then retires', async () => {
    const plan = await decidedThreat();
    const { narrateClockAdvancement } = await gmOf(table).import('../../src/narration/narrator.js');
    const fill = (filled) => onGm(table, () => narrateClockAdvancement({
      clock: { _id: plan.clockId, name: 'the escort — escalation', type: 'tension', filled, segments: 4, triggered: true },
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
    }));
    table.replies = reply({});   // the sidecar says nothing of it: the step is marked all the same
    const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
    await onGm(table, () => clocks.adjustClockSegments(plan.clockId, 4));
    await fill(4);
    expect(lastCall().userText).toContain('its next escalation step — "It asks again, closer"');
    expect(lastCall().system).toContain(`(id ${plan.id})`);
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, false]);
    expect(stored().clocks.find(c => c._id === plan.clockId)).toMatchObject({ filled: 0, active: true });

    await onGm(table, () => clocks.adjustClockSegments(plan.clockId, 4));
    await fill(4);
    expect(lastCall().userText).toContain('"It seals the corridor"');
    expect(planOf(plan.id).escalation.every(e => e.done)).toBe(true);
    expect(stored().clocks.find(c => c._id === plan.clockId).active).toBe(false);
  }, 60_000);

  it('a significant threat\'s clock is the campaign\'s (6 segments, rolled at Begin a Session)', async () => {
    const s = await secrets();
    const threat = await onGm(table, () => s.createSkeleton({ kind: 'threat', subject: { type: 'threat', id: 'pg-1', name: 'The Pale Choir' },
      sceneId: 'sc-1', createdFrom: { trigger: 'significant_threat' } }));
    table.replies = reply({ plans: [{ id: threat.id, truth: 'A cult that eats names.', escalation: ['They reach the station'] }] });
    await narrateMoveOn(table, moveResolution({ playerNarration: 'We ask about the Pale Choir.' }));
    expect(clocks().find(c => c._id === planOf(threat.id).clockId)).toMatchObject({ type: 'campaign', segments: 6 });
  }, 40_000);
});

describe('issue #353 Phase 3 — a countdown the prose starts is a real clock', () => {
  it('tied to the plan it is about, and the GMs are offered a scene challenge whose clock it becomes', async () => {
    const plan = await decidedThreat({ escalation: [] });
    table.replies = reply({ countdown: { label: 'Archer\'s count', about: plan.id } });
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    const count = clocks().find(c => c.name === 'Archer\'s count');
    expect(count).toMatchObject({ type: 'tension', segments: 4, planId: plan.id });
    expect(planOf(plan.id).clockId).toBe(count._id);

    const offer = table.cards(f => !!f.sceneChallengeOffer).at(-1);
    expect(offer, 'the offer').toBeTruthy();
    expect(offer.whisper).toEqual(['gm-1']);
    const { applySceneChallengeOffer } = await gmOf(table).import('../../src/moves/sceneChallengeOffer.js');
    const begun = await onGm(table, () => applySceneChallengeOffer({ messageId: offer._id ?? offer.id }, { requesterIsGM: true, requesterId: 'gm-1' }));
    expect(begun.applied).toBe(true);
    const tracks = gmOf(table).run(() => game.journal.find(j => Array.isArray(j.getFlag?.(MODULE_ID, 'tracks')))?.getFlag(MODULE_ID, 'tracks')) ?? [];
    expect(tracks.find(t => t.type === 'scene_challenge')).toMatchObject({ label: 'Archer\'s count', tensionClockId: count._id });
    expect(clocks().filter(c => c.name === 'Archer\'s count')).toHaveLength(1);   // no second clock
    // Pressed again: claimed once.
    expect((await onGm(table, () => applySceneChallengeOffer({ messageId: offer._id ?? offer.id }, { requesterIsGM: true }))).applied).toBe(false);
  }, 60_000);

  it('a countdown about nothing planned becomes a mystery — what happens when it runs out — with the clock; a second one of that name is not', async () => {
    table.replies = reply({ countdown: { label: 'The hull\'s groan', about: 'the old hull' } });
    await narrateMoveOn(table, moveResolution());
    const [mystery] = plansOf(table);
    expect(mystery).toMatchObject({ kind: 'mystery', question: 'What happens when The hull\'s groan runs out?', truth: '' });
    expect(clocks().find(c => c.planId === mystery.id)?.name).toBe('The hull\'s groan');
    await narrateMoveOn(table, moveResolution());
    expect(clocks().filter(c => c.name === 'The hull\'s groan')).toHaveLength(1);
  }, 40_000);

  it('bad countdowns are dropped', () => {
    expect(normaliseCountdown(null)).toBeNull();
    expect(normaliseCountdown({ about: 'x' })).toBeNull();
    expect(normaliseCountdown({ label: 'Count', segments: 9 })).toEqual({ label: 'Count', about: '', segments: 4 });
  });
});

describe('issue #353 Phase 3 — a narration\'s clocks and plans leave with it', () => {
  it('the X-Card on the narration that started a countdown removes its clock and the plan it made', async () => {
    await patSpeaks(table);
    table.replies = reply({ countdown: { label: 'Archer\'s count', about: 'Archer' } });
    await narrateMoveOn(table, moveResolution());
    expect(clocks().some(c => c.name === 'Archer\'s count')).toBe(true);
    await playXCard(table);
    expect(clocks().some(c => c.name === 'Archer\'s count')).toBe(false);
    expect(plansOf(table)).toEqual([]);
  }, 40_000);

  it('a narration a burn supersedes takes back the plan and the clock it made (the price did not happen)', async () => {
    const plan = await decidedThreat();
    const { retractSupersededNarrations } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
    await onGm(table, () => retractSupersededNarrations([plan.narrationId], { label: 'burn' }));
    expect(planOf(plan.id)).toBeUndefined();
    expect(clocks().some(c => c._id === plan.clockId)).toBe(false);
  }, 40_000);
});

describe('issue #353 Phase 3 — an expedition is planned', () => {
  it('the narration of the move that began it decides its waypoints, dangers and end — about its track', async () => {
    const request = expeditionPlanRequest({ id: 'trk-1', label: 'the Gap' }, stored(), 'res-1');
    expect(request).toMatchObject({ kind: 'expedition', subject: { type: 'track', id: 'trk-1', name: 'the Gap' } });
    expect(request.oracleSeeds.filter(sd => /^A waypoint — Space Sighting \(Terminus\): /.test(sd))).toHaveLength(2);
    table.replies = (call) => ({ prose: 'The Gap opens ahead.', sidecar: { newTruths: [], stateChanges: [],
      ...(call.system.includes(`- id ${request.ref}:`) ? { plans: [{ id: request.ref, subject: 'something else', truth: 'A dead Choir ark.',
        clues: ['A beacon', 'A debris trail'], escalation: ['Ion storm'] }] } : {}) } });
    await narrateMoveOn(table, moveResolution({ moveId: 'undertake_an_expedition', moveName: 'Undertake an Expedition',
      outcome: 'strong_hit', outcomeLabel: 'Strong Hit', skeletonRequests: [request] }));
    expect(lastCall().system).toContain('Its truth is what waits at the end, its clues are 2-4 waypoints in order');
    const [plan] = plansOf(table);
    expect(plan).toMatchObject({ kind: 'expedition', truth: 'A dead Choir ark.', subject: { type: 'track', id: 'trk-1', name: 'the Gap' } });
  }, 40_000);

  it('in play while its track is open, and in the narration that finishes it — with its ending to reveal', () => {
    const plan = normaliseSkeleton({ id: 'sk-x', kind: 'expedition', subject: { type: 'track', id: 'trk-1', name: 'the Gap' },
      truth: 'A dead ark.', sceneId: 'sc-old', status: 'active' });
    expect(selectRelevantSkeletons([plan], { sceneId: 'sc-1', openTrackIds: ['trk-1'] })).toHaveLength(1);
    expect(selectRelevantSkeletons([plan], { sceneId: 'sc-1', endingTrackIds: ['trk-1'] })).toHaveLength(1);
    expect(selectRelevantSkeletons([plan], { sceneId: 'sc-1' })).toHaveLength(0);
  });
});

describe('issue #353 Phase 3 — a chosen complication plays the plan\'s next step', () => {
  it('its beat is told the step, and the step is marked played', async () => {
    const plan = await decidedThreat();
    const { runSufferResolution } = await gmOf(table).import('../../src/moves/sufferDialog.js');
    table.replies = reply({});
    await onGm(table, () => runSufferResolution([{ kind: 'complication', scope: 'destination', label: 'Complication at destination' }],
      game.actors.get('pc-kira')));
    const call = narrationCallsOf(table).find(c => /The player chose a complication/.test(c.userText ?? ''));
    expect(call.userText).toContain('It is the next escalation step of the escort under UNREVEALED: "It asks again, closer"');
    expect(planOf(plan.id).escalation[0].done).toBe(true);
  }, 40_000);
});

describe('issue #353 Phase 3 — Ask the Oracle about a planned subject', () => {
  const consults = () => table.claude.calls.filter(c => /You set the odds for an oracle/.test(c.system ?? ''));

  it('a GM\'s yes/no about it is rolled at odds its truth sets', async () => {
    await decidedThreat();
    table.script.when((c) => /You set the odds/.test(c.system ?? ''), 'almost_certain');
    await onGm(table, () => gmOf(table).chat('!oracle yes 50/50 Is the escort a drone?'));
    expect(consults()).toHaveLength(1);
    expect(consults()[0].userText).toContain('A Keeper drone collecting names.');
    expect(table.cards(f => f.oracleCommandCard === true && /Ask the Oracle/.test(f.oracleNarration?.oracleName ?? '')).at(-1)
      .content).toContain('Ask the Oracle (almost certain)');
  }, 40_000);

  it('a question naming no plan, or a player\'s roll, consults nothing', async () => {
    await decidedThreat();
    await onGm(table, () => gmOf(table).chat('!oracle yes Is the hatch sealed?'));
    await onGm(table, () => table.client('pl-1').chat('!oracle yes Is the escort a drone?'));
    expect(consults()).toEqual([]);
  }, 40_000);
});
