/**
 * STARFORGED COMPANION
 * tests/unit/playerKeyNarrationPlanRequests.test.js
 *
 * Issue #364 PLAYER-KEY-PLAN-REQUESTS-UNFILTERED. The row: a narration on a
 * player's own key reads no plan (issue #362 D1), so narrator.js
 * `unplannedRequests` cannot drop a request whose subject is already planned
 * (issue #362 AC04), and that narration would be asked to decide it again.
 *
 * Checked against the code, no narration takes that path: a plan request
 * about a known subject — an expedition's track, a vow — is made by the move
 * pipeline, a burn or an improvement, a held result, a Batch Mode round or a
 * vow's swearing scene, and each of those runs on the canonical GM, which
 * reads the plans. The one move narration that runs on a player's own key is
 * the sheet roll's (no keyed GM connected), and it carries no plan request.
 * So no relay answer was added (rules/reachability.md §4 — no surface for a
 * path nothing takes). These tests pin both halves:
 *
 *   1. the path that exists — a keyed player's sheet-rolled vow, narrated on
 *      their own client — asks the narrator to decide nothing, and leaves the
 *      GM's plans as they were;
 *   2. were a player-key narration ever handed such a request, its relayed
 *      answer cannot double or rewrite the plan: the canonical GM joins it to
 *      the plan the subject has, whose truth stands (issue #362 AC14).
 *
 * A change that makes (1) carry a request about a known subject fails here:
 * that is the day the row's relay answer is owed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution,
} from '../helpers/skeletonTable.js';

const TRUTH = 'SENTINEL-TRUTH: Chen left of her own will.';
const VOW_ID = 'vow-chen-1';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  // The scripted narrations tell Kira by name: the third person, as told — a
  // second-person beat that names its character is asked again (BEAT-IN-THE-THIRD-PERSON).
  restore = await resetSkeletonTable(table, { narrationPerspective: 'third_person' });
  table.addActor({
    id: 'pc-kira', name: 'Kira', type: 'character', hasPlayerOwner: true, ownership: { 'pl-1': 3 },
    items: { contents: [
      { id: 'item-vow-1', type: 'progress', name: 'Find Chen', system: { subtype: 'vow', rank: 'dangerous', current: 4 },
        flags: { [MODULE_ID]: { vowId: VOW_ID } } },
    ] },
  });
  // The vow's plan, decided, on the GM — the only client that reads plans.
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  await onGm(table, () => secrets.createSkeleton({
    kind: 'vow', subject: { type: 'vow', id: VOW_ID, name: 'Find Chen' }, truth: TRUTH,
    oracleSeeds: ['What is behind it — Action + Theme: Abandon Truth'], sceneId: 'sc-1', sessionId: 's-1',
  }, { byGm: true }));
  // No keyed GM: narration runs on the player's own key.
  await table.setClaudeKey('gm-1', '');
  await table.setClaudeKey('pl-1', 'sk-ant-pat');
});
afterEach(() => restore?.());

const narrationCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);

function nativeProgressCard({ source, value, dice, actorId }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}

async function settleAll() {
  for (let i = 0; i < 3; i += 1) { await table.settle(); await table.drain(); }
}

describe('issue #364 PLAYER-KEY-PLAN-REQUESTS-UNFILTERED — the move narration that runs on a player\'s own key', () => {
  it('a keyed player\'s sheet-rolled vow is narrated on their client and asks the narrator to decide no plan', async () => {
    await table.client('pl-1').run(() => globalThis.ChatMessage.create({
      content: nativeProgressCard({ source: 'Find Chen', value: 1, dice: [5, 8], actorId: 'pc-kira' }),
      speaker: { actor: 'pc-kira', alias: 'Kira' },
      rolls: [{ formula: '{d10,d10}', total: 0 }],
    }));
    await settleAll();

    const calls = narrationCalls();
    expect(calls.map(c => c.client), 'narrated once, on the player\'s own key').toEqual(['pl-1']);
    expect(calls[0].system, 'a player\'s client reads no plan (issue #362 D1)').not.toContain(TRUTH);
    expect(calls[0].system, 'and it is asked to decide none').not.toContain('DECIDE NOW');
    const plans = plansOf(table);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'vow', truth: TRUTH, subject: { id: VOW_ID } });
  }, 60_000);
});

describe('issue #364 PLAYER-KEY-PLAN-REQUESTS-UNFILTERED — were one to carry a request about a planned subject', () => {
  it('its relayed answer joins the plan the subject has: no second plan, and the truth stands', async () => {
    table.replies = (call) => {
      const ref = /- id (plan-[\w-]+):/.exec(call.system ?? '')?.[1];
      return { prose: 'Kira swears it again, quieter.', sidecar: { newTruths: [], stateChanges: [],
        ...(ref ? { plans: [{ id: ref, subject: 'Find Chen', truth: 'FORGED: Chen was taken.', wants: 'To be found.' }] } : {}) } };
    };
    const client = table.client('pl-1');
    const { narrateResolution } = await client.import('../../src/narration/narrator.js');
    await client.run(() => narrateResolution(moveResolution({
      moveId: 'swear_an_iron_vow', moveName: 'Swear an Iron Vow', outcome: 'strong_hit', outcomeLabel: 'Strong Hit',
      playerNarration: 'I swear to find Chen.',
      skeletonRequests: [{ ref: 'plan-res-x-vow', kind: 'vow', trigger: 'vow', label: 'what is really behind the vow "Find Chen"',
        subject: { type: 'vow', id: VOW_ID, name: 'Find Chen' }, oracleSeeds: ['What is behind it — Action + Theme: Seize Power'] }],
    }), foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
    await settleAll();

    expect(narrationCalls().map(c => c.client)).toEqual(['pl-1']);
    const plans = plansOf(table).filter(p => p.kind === 'vow');
    expect(plans, 'one plan for the vow — the relayed answer made no second').toHaveLength(1);
    expect(plans[0].truth, 'a decided plan keeps its truth').toBe(TRUTH);
    expect(plans[0].wants, 'and takes only what it lacked').toBe('To be found.');
  }, 60_000);
});
