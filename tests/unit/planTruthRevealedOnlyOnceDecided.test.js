/**
 * STARFORGED COMPANION
 * tests/unit/planTruthRevealedOnlyOnceDecided.test.js
 *
 * Issue #362 AC16 REVEAL-TRUTH-BEFORE-DECIDED. An enemy's plan waiting to be
 * decided (filed with its oracle rolls, no truth — every `newThreats` and
 * unanswered-request plan starts so) is listed under DECIDE NOW with its id,
 * and the reveals instruction offers "truth" for any id shown. A sidecar that
 * marked it `reveals: [{ id, revealed: ["truth"] }]` without deciding it set
 * `truthRevealed` for good (skeletons.js applyRevealToSkeleton): nothing was
 * told to the table then, but once a later narration decided the plan, its
 * secret wants showed on every player's Session panel as a standing demand,
 * the narrator was told the truth was "already revealed", and the reveal that
 * never happened could never be recorded. A truth not yet decided cannot be
 * revealed: the reveal changes nothing, and a stored flag on a plan with no
 * truth does not stand.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { StubElement } from '../helpers/cardDom.js';
import {
  resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';
import { applyRevealToSkeleton, normaliseSkeleton } from '../../src/world/skeletons.js';

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

const revealsTruthOf = (id) => () => ({ prose: 'The escort turns its lamps on the hull.', sidecar: { newTruths: [], stateChanges: [],
  reveals: [{ id, revealed: ['truth'] }] } });

describe('issue #362 AC16 — a truth not yet decided cannot be marked revealed', () => {
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
    table.replies = revealsTruthOf(plan.id);
    await narrateMoveOn(table, moveResolution());
    expect(planOf(plan.id)).toMatchObject({ truth: '', truthRevealed: false });

    // The next beat decides it (it is still listed under DECIDE NOW).
    table.replies = decides(plan.id);
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(narrationCallsOf(table).at(-1).system).toContain(`- id ${plan.id}:`);
    expect(planOf(plan.id)).toMatchObject({ truth: TRUTH, wants: WANTS, truthRevealed: false });
    expect(table.cards(f => f.secretRollsCard === true || f.secretRevealCard === true)).toEqual([]);
    expect(await panelHtml('pl-1'), 'the player\'s Session panel').not.toContain('SENTINEL-WANTS');
  }, 60_000);

  it('once decided, the truth can still be revealed — and is then told to the table', async () => {
    const plan = await undecidedEnemy();
    table.replies = revealsTruthOf(plan.id);
    await narrateMoveOn(table, moveResolution());
    table.replies = decides(plan.id);
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));

    table.replies = revealsTruthOf(plan.id);
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));
    expect(planOf(plan.id).truthRevealed).toBe(true);
    expect(table.cards(f => f.secretRollsCard === true)).toHaveLength(1);
    expect(await panelHtml('pl-1')).toContain(`<span class="thread-name">the escort</span> wants: ${WANTS}`);
  }, 60_000);
});

describe('the record\'s rule (skeletons.js)', () => {
  const record = (over = {}) => normaliseSkeleton({ id: 'sk-1', kind: 'threat', subject: { name: 'the escort' }, ...over });

  it('applyRevealToSkeleton takes "truth" only when the plan has one', () => {
    expect(applyRevealToSkeleton(record(), { revealed: ['truth'], advanced: null, resolved: false }).truthRevealed).toBe(false);
    expect(applyRevealToSkeleton(record({ truth: TRUTH }), { revealed: ['truth'], advanced: null, resolved: false }).truthRevealed).toBe(true);
  });

  it('a stored "revealed" flag on a plan with no truth does not stand', () => {
    expect(record({ truthRevealed: true }).truthRevealed).toBe(false);
    expect(record({ truthRevealed: true, truth: TRUTH }).truthRevealed).toBe(true);
  });
});
