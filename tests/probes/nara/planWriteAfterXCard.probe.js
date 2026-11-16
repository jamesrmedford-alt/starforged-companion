/**
 * NARA-05 · XCARD-LATE-PLAN-WRITE
 *
 * Scenario: a move's price reveals a new enemy; its narration decides the
 * enemy's hidden plan in its fact block and its card posts. The plan's
 * journal write is still on its way to the server when a player plays the
 * X-Card on that narration (the plan writes are fire-and-forget:
 * narrator.js applySidecarSideData `void applyPlanSideData(…)`, several
 * server round trips after the card is on screen).
 *
 * Correct (rules/narrator-memory.md 6b, XCARD-LATE-CAPTURE: a writer that
 * takes a narration's id "checks the stored `xCardedNarrationIds` right
 * before it writes … so a capture still running when the card is played
 * writes nothing more"): nothing more is written for the removed narration —
 * no plan of the removed beat, and no escalation clock for it.
 *
 * Today: secrets.js createSkeleton / updateSkeleton and the clock they make
 * (ensureThreatClock → clocks.js createClock) never check isNarrationXCarded.
 * The X-Card's undo (undoNarrationEntries) runs while the page does not exist
 * yet; the page is then created — a decided plan of the content the table
 * removed, in play for every later narration of the scene — and its tension
 * clock starts, to fire a trigger vignette that plays the removed enemy's
 * next step.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { withPayThePriceSeed } from '../../../src/moves/resolver.js';
import { skeletonTable, withSidecar, move, pageCreate, MODULE_ID } from './_skeletonTable.js';

let h;

beforeAll(async () => { h = await skeletonTable(); }, 30_000);
afterAll(() => h?.teardown());
beforeEach(async () => { await h.reset(); });
afterEach(() => h.restore());

const TRUTH = 'SENTINEL-TRUTH: the escort is a Keeper drone collecting names';
const decides = (call) => {
  const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
  return withSidecar('A second shape detaches from the dark: an escort, waiting.', {
    newTruths: [], stateChanges: [],
    ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: TRUTH, wants: 'A name.',
      escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down'] }] } : {}),
  });
};
const newEnemyMiss = () => move({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') });
const stored = () => h.table.world.campaignState();

async function playXCard() {
  await h.table.client('pl-1').chat('!x');
  await h.table.settle();
  await h.table.drain();
}

describe('NARA-05 — a plan write still on its way when the X-Card removes its narration is not made', () => {
  it('control: the plan was written before the X-Card — the X-Card takes the plan and its clock back', async () => {
    h.reply = decides;
    await h.narrateMove(newEnemyMiss());
    expect(h.plans()).toHaveLength(1);
    expect((stored().clocks ?? []).filter(c => c.planId)).toHaveLength(1);

    await playXCard();
    expect(h.plans()).toEqual([]);
    expect((stored().clocks ?? []).filter(c => c.planId)).toEqual([]);
  }, 40_000);

  it('the plan\'s page write lands after the X-Card — no plan and no clock of the removed narration is left', async () => {
    let release;
    pageCreate.gate = new Promise((resolve) => { release = resolve; });
    h.reply = decides;
    await h.narrateMove(newEnemyMiss());

    // The narration is on screen; its plan is still being written.
    const card = h.table.cards(f => f.narratorCard === true && f.narrationId).at(-1);
    const narrationId = card?.flags?.[MODULE_ID]?.narrationId;
    expect(narrationId).toBeTruthy();
    expect(h.plans()).toEqual([]);

    await playXCard();
    expect(stored().xCardActive).toBe(true);
    expect(stored().xCardedNarrationIds ?? []).toContain(narrationId);

    // The server answers the page write now.
    release();
    pageCreate.gate = null;
    for (let i = 0; i < 5; i += 1) { await h.table.settle(); await h.table.drain(); }

    const left = {
      plans:  h.plans().map(p => p.truth),
      clocks: (stored().clocks ?? []).filter(c => c.narrationId === narrationId).map(c => c.name),
    };
    expect(left, 'nothing of the narration the X-Card removed is left: no plan, no escalation clock').toEqual({ plans: [], clocks: [] });
  }, 40_000);
});
