/**
 * STARFORGED COMPANION
 * tests/unit/waypointPerilOpenExpedition.test.js
 *
 * Issue #362 AC11 (WAYPOINT-PERIL-WRONG-EXPEDITION): a chosen "Peril at the
 * waypoint" plays the next danger of an expedition's hidden plan, marked
 * played (decisions.md Phase 3: "a waypoint's peril the open expedition's").
 * complicationStep took the first active expedition plan in the Secrets
 * journal's page order — a finished expedition's leftover plan, or another
 * open one's — never checked against the open tracks. It now plays the plan of
 * the expedition the move was on (its choice card's `expeditionTrackId`),
 * else an open expedition's.
 *
 * From the fourteenth audit's probe (narb/waypointPerilWrongExpedition).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm,
} from '../helpers/skeletonTable.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const planOf = (id) => plansOf(table).find(p => p.id === id);
const reply = () => ({ prose: 'The hull groans.', sidecar: { newTruths: [], stateChanges: [] } });
const tracks = () => gmOf(table).import('../../src/ui/progressTracks.js');

async function expeditionPlan(trackId, name, danger) {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'expedition', subject: { type: 'track', id: trackId, name },
    truth: `What waits at the end of ${name}.`, escalation: [{ text: danger }], clues: [{ text: 'A beacon' }],
    sceneId: 'sc-earlier', sessionId: 's-1',
  }));
}

async function openExpedition(label) {
  const store = await tracks();
  return onGm(table, () => store.addProgressTrack({ type: 'expedition', label, rank: 'dangerous' }));
}

/** The player picks "Peril at the waypoint" on the choice card; `opts` are the card's executor opts. */
async function chooseWaypointPeril(opts = {}) {
  const { runSufferResolution } = await gmOf(table).import('../../src/moves/sufferDialog.js');
  table.replies = reply;
  await onGm(table, () => runSufferResolution([{ kind: 'complication', scope: 'waypoint', label: 'Peril at the waypoint' }],
    game.actors.get('pc-kira'), opts));
  return narrationCallsOf(table).filter(c => /The player chose a complication/.test(c.userText ?? '')).at(-1);
}

describe('issue #362 AC11 — a waypoint\'s peril plays the expedition under way', () => {
  it('control: with one expedition open and planned, its peril is that plan\'s next danger, marked played', async () => {
    const open = await openExpedition('Bleakhold Reach');
    const plan = await expeditionPlan(open.id, 'Bleakhold Reach', 'Pirates shadow the ship');
    const call = await chooseWaypointPeril();
    expect(call?.userText).toContain('"Pirates shadow the ship"');
    expect(planOf(plan.id).escalation[0].done).toBe(true);
  }, 40_000);

  it('a finished expedition\'s leftover plan is not the one played', async () => {
    const store = await tracks();
    const old = await openExpedition('the Gap');
    const stale = await expeditionPlan(old.id, 'the Gap', 'An ion storm closes on the Gap');
    await onGm(table, () => store.completeProgressTrack(old.id));
    const open = await openExpedition('Bleakhold Reach');
    const live = await expeditionPlan(open.id, 'Bleakhold Reach', 'Pirates shadow the ship');
    expect(gmOf(table).run(() => store.listOpenProgressTracks()).map(t => t.id)).toEqual([open.id]);

    const call = await chooseWaypointPeril();
    expect(call, 'the complication was narrated').toBeTruthy();
    expect(call.userText).not.toContain('An ion storm closes on the Gap');
    expect(call.userText).toContain('"Pirates shadow the ship"');
    expect(planOf(stale.id).escalation[0].done).toBe(false);
    expect(planOf(live.id).escalation[0].done).toBe(true);
  }, 40_000);

  it('two expeditions open: the peril is the one the move was on, carried on its choice card', async () => {
    const first  = await openExpedition('Bleakhold Reach');
    const second = await openExpedition('the Drift');
    const onFirst  = await expeditionPlan(first.id, 'Bleakhold Reach', 'Pirates shadow the ship');
    const onSecond = await expeditionPlan(second.id, 'the Drift', 'The ice field closes behind them');
    // The move was on the Drift: the card names it — not the first plan in the journal.
    const call = await chooseWaypointPeril({ expeditionTrackId: second.id });
    expect(call.userText).toContain('"The ice field closes behind them"');
    expect(planOf(onSecond.id).escalation[0].done).toBe(true);
    expect(planOf(onFirst.id).escalation[0].done).toBe(false);
    // The card carries it, so the GM that narrates it reads it there.
    const card = table.cards(f => f.complication === true && f.scope === 'waypoint').at(-1);
    expect(card.flags['starforged-companion'].oracleNarration.trackId).toBe(second.id);

    // The next peril named for the other one plays that one's danger.
    const next = await chooseWaypointPeril({ expeditionTrackId: first.id });
    expect(next.userText).toContain('"Pirates shadow the ship"');
    expect(planOf(onFirst.id).escalation[0].done).toBe(true);
  }, 40_000);

  it('an expedition removed from the panel leaves no peril to play: the scene\'s plan is played instead', async () => {
    const store = await tracks();
    const gone = await openExpedition('the Gap');
    await expeditionPlan(gone.id, 'the Gap', 'An ion storm closes on the Gap');
    const removed = await onGm(table, () => store.applyProgressTrackEditFromRelay({ op: 'remove', trackId: gone.id },
      { requesterIsGM: true, requesterId: 'gm-1' }));
    expect(removed).toMatchObject({ applied: true });
    expect(gmOf(table).run(() => store.listOpenProgressTracks())).toEqual([]);
    const secrets = await gmOf(table).import('../../src/world/secrets.js');
    const scenePlan = await onGm(table, () => secrets.createSkeleton({
      kind: 'threat', subject: { type: 'name', id: null, name: 'the escort' }, truth: 'A Keeper drone.',
      escalation: [{ text: 'It asks again, closer' }], sceneId: 'sc-1', sessionId: 's-1',
    }, { byGm: true }));
    const call = await chooseWaypointPeril();
    expect(call.userText).not.toContain('An ion storm closes on the Gap');
    expect(call.userText).toContain('"It asks again, closer"');
    expect(planOf(scenePlan.id).escalation[0].done).toBe(true);
  }, 40_000);
});
