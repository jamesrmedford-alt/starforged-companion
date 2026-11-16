/**
 * NARB-01 · WAYPOINT-PERIL-WRONG-EXPEDITION
 *
 * Scenario: an earlier expedition ("the Gap") is over — its track is complete —
 * but its hidden plan is still active with a danger not yet played (the plan is
 * only ever closed by the narrator's own `reveals: resolved`, which a finishing
 * narration may omit, fail to write or never run). A new expedition ("Bleakhold
 * Reach") is open and planned. On a weak hit its player chooses "Peril at the
 * waypoint" (sufferDialog → oracle follow-up, kind "complication", scope
 * "waypoint").
 *
 * Correct: the peril plays the next danger of the OPEN expedition's plan
 * ("a waypoint's peril is the open expedition's next danger" — narrator.js
 * complicationStep / oracleFollowup.js), and that plan's step is marked played.
 *
 * Today: complicationStep takes `withStep.find(r => r.kind === 'expedition')` —
 * the first active expedition plan in the Secrets journal, whatever track it is
 * about — so the beat is told to play the finished expedition's leftover danger,
 * that plan's step is marked played, and the open expedition's plan is untouched.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm,
} from '../../helpers/skeletonTable.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const planOf = (id) => plansOf(table).find(p => p.id === id);
const reply = () => ({ prose: 'The hull groans.', sidecar: { newTruths: [], stateChanges: [] } });

async function expeditionPlan(trackId, name, danger) {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'expedition', subject: { type: 'track', id: trackId, name },
    truth: `What waits at the end of ${name}.`, escalation: [{ text: danger }], clues: [{ text: 'A beacon' }],
    sceneId: 'sc-earlier', sessionId: 's-1',
  }));
}

async function chooseWaypointPeril() {
  const { runSufferResolution } = await gmOf(table).import('../../src/moves/sufferDialog.js');
  table.replies = reply;
  await onGm(table, () => runSufferResolution([{ kind: 'complication', scope: 'waypoint', label: 'Peril at the waypoint' }],
    game.actors.get('pc-kira')));
  return narrationCallsOf(table).find(c => /The player chose a complication/.test(c.userText ?? ''));
}

describe('NARB-01 — a waypoint\'s peril plays the open expedition\'s next danger', () => {
  it('control: with one expedition open and planned, its peril is that plan\'s next danger, marked played', async () => {
    const store = await gmOf(table).import('../../src/ui/progressTracks.js');
    const open = await onGm(table, () => store.addProgressTrack({ type: 'expedition', label: 'Bleakhold Reach', rank: 'dangerous' }));
    const plan = await expeditionPlan(open.id, 'Bleakhold Reach', 'Pirates shadow the ship');
    const call = await chooseWaypointPeril();
    expect(call?.userText).toContain('"Pirates shadow the ship"');
    expect(planOf(plan.id).escalation[0].done).toBe(true);
  }, 40_000);

  it('a finished expedition\'s leftover plan is not the one played', async () => {
    const store = await gmOf(table).import('../../src/ui/progressTracks.js');
    // The earlier expedition: finished (its track complete), its plan never closed.
    const old = await onGm(table, () => store.addProgressTrack({ type: 'expedition', label: 'the Gap', rank: 'dangerous' }));
    const stale = await expeditionPlan(old.id, 'the Gap', 'An ion storm closes on the Gap');
    await onGm(table, () => store.completeProgressTrack(old.id));
    // The expedition under way.
    const open = await onGm(table, () => store.addProgressTrack({ type: 'expedition', label: 'Bleakhold Reach', rank: 'dangerous' }));
    const live = await expeditionPlan(open.id, 'Bleakhold Reach', 'Pirates shadow the ship');
    expect(gmOf(table).run(() => store.listOpenProgressTracks()).map(t => t.id)).toEqual([open.id]);

    const call = await chooseWaypointPeril();
    expect(call, 'the complication was narrated').toBeTruthy();
    // The open expedition's danger — never the finished one's.
    expect(call.userText).not.toContain('An ion storm closes on the Gap');
    expect(call.userText).toContain('"Pirates shadow the ship"');
    expect(planOf(stale.id).escalation[0].done).toBe(false);
    expect(planOf(live.id).escalation[0].done).toBe(true);
  }, 40_000);
});
