/**
 * SKEL — REVEAL-TRUTH-BEFORE-DECIDED  (LLM-OUTPUT → LEAK)
 *
 * Scenario: an enemy's plan is waiting to be decided (filed with its oracle
 * rolls, no truth — every `newThreats` / unanswered-request plan starts so).
 * A narration's sidecar marks it `reveals: [{ id, revealed: ["truth"] }]`
 * without deciding it — the plan is listed under DECIDE NOW with its id, and
 * the reveals instruction offers "truth" for any id shown. (The same entry
 * can arrive over the `narrator.sidecar` relay from a client.) A later
 * narration then decides the plan: its truth, what it wants.
 *
 * Correct: a truth that does not exist yet cannot be revealed. The plan stays
 * unrevealed; when it is decided its truth and its wants are hidden, and the
 * players' Session panel ("What's open → Standing demands", which lists a
 * threat's wants only once its truth is revealed) does not show them.
 *
 * Today: skeletons.js applyRevealToSkeleton sets `truthRevealed` whenever the
 * reveal names "truth", decided or not. Nothing is told to the table then (no
 * lore, no ledger truth, no rolls card — those are gated on a truth), but the
 * flag stays. Once the next narration decides the plan, its secret `wants`
 * appears on every player's Session panel, the narrator is told the truth is
 * "already revealed — the characters know it", and the reveal that never
 * happened can never be recorded (revealedTruthsOf / truthNow skip a plan
 * already marked revealed).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { StubElement } from '../../helpers/cardDom.js';
import {
  resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn,
} from '../../helpers/skeletonTable.js';

const TRUTH = 'SENTINEL-TRUTH: a Keeper drone collecting names for the Pale Choir.';
const WANTS = 'SENTINEL-WANTS: the name Kira carries';

let table;
let restore;
let savedDocument;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  restore = await resetSkeletonTable(table);
});
afterEach(() => { restore?.(); globalThis.document = savedDocument; });

const planOf = (id) => plansOf(table).find(p => p.id === id);

/** The Session panel's HTML as `userId`'s client renders it. */
async function panelHtml(userId) {
  const client = table.client(userId);
  const { SessionPanelApp } = await client.import('../../src/ui/sessionPanel.js');
  return client.run(async () => {
    const app = new SessionPanelApp();
    const root = await app._renderHTML(await app._prepareContext({}), {});
    return root.outerHTML;
  });
}

async function undecidedEnemy() {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', id: null, name: 'the escort' },
    oracleSeeds: ['Character Role: Scout', 'Character Goal: Collect a debt'], sceneId: 'sc-1', sessionId: 's-1',
    createdFrom: { trigger: 'narrated_enemy' },
  }));
}

const decides = (id) => () => ({ prose: 'The escort holds position.', sidecar: { newTruths: [], stateChanges: [],
  plans: [{ id, truth: TRUTH, wants: WANTS }] } });

describe('SKEL REVEAL-TRUTH-BEFORE-DECIDED — a truth not yet decided cannot be marked revealed', () => {
  it('control: decided with no reveal, the plan is hidden — a player\'s Session panel shows nothing of it', async () => {
    const plan = await undecidedEnemy();
    table.replies = decides(plan.id);
    await narrateMoveOn(table, moveResolution());
    expect(planOf(plan.id)).toMatchObject({ truth: TRUTH, wants: WANTS, truthRevealed: false });
    const html = await panelHtml('pl-1');
    expect(html).toContain("What's open");
    expect(html).not.toContain('SENTINEL');
  }, 60_000);

  it('a "truth" reveal on an undecided plan reveals nothing — its wants stay off the players\' panel once it is decided', async () => {
    const plan = await undecidedEnemy();
    // A beat marks the truth revealed, though nothing is decided yet.
    table.replies = () => ({ prose: 'The escort turns its lamps on the hull.', sidecar: { newTruths: [], stateChanges: [],
      reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, moveResolution());
    expect(planOf(plan.id).truth).toBe('');

    // The next beat decides it (it is still listed under DECIDE NOW).
    table.replies = decides(plan.id);
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(narrationCallsOf(table).at(-1).system).toContain(`- id ${plan.id}:`);
    expect(planOf(plan.id)).toMatchObject({ truth: TRUTH, wants: WANTS });

    // Correct: nothing was ever revealed to the table…
    expect(table.cards(f => f.secretRollsCard === true || f.secretRevealCard === true)).toEqual([]);
    // …so the plan is unrevealed, and no player's panel shows what the enemy wants.
    expect(await panelHtml('pl-1'), 'the player\'s Session panel').not.toContain('SENTINEL-WANTS');
    expect(planOf(plan.id).truthRevealed, 'the plan is marked revealed').toBe(false);
  }, 60_000);
});
