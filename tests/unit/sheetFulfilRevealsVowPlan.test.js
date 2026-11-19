/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/sheetFulfilRevealsVowPlan.test.js
 *
 * Issue #364 NATIVE-FULFIL-NO-ENDING-TRACK. A Fulfill Your Vow typed in chat
 * hands its narration the vow it ends (`endingTrackIds`, the vow's stable id
 * — movePipeline.js), so the vow's hidden plan is in play to reveal what was
 * really behind it, resolved or not (issue #362 D4). The same roll made on
 * the character sheet (registerNativeProgressRollHook, src/index.js) named no
 * ending vow: its plan was in play only if the roll card's line happened to
 * carry the name the plan was filed under and the plan was still active. A
 * vow reworded since, or one already closed on the sheet (its plan resolved
 * in code), was fulfilled with its plan left out — and a reveal of a resolved
 * plan is not recorded.
 *
 * The sheet roll's hit now names the roller's own vow by its id. Driven on
 * the simulated table: the player rolls on Kira's sheet; the keyed GM
 * narrates it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm,
} from '../helpers/skeletonTable.js';

const TRUTH = 'SENTINEL-TRUTH: the ark is a prison, and something wants out.';
const VOW_ID = 'vow-ark-1';

let table;
let restore;
let arkVow;
let otherVow;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => restore?.());

function vowItem(id, name, itemFlags = {}) {
  const item = {
    id, type: 'progress', name, flags: itemFlags,
    system: { subtype: 'vow', rank: 'dangerous', current: 40, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split('.'); let t = item;
        for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
        t[parts.at(-1)] = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    async getFlag(scope, key) { return item.flags[scope]?.[key]; },
  };
  return item;
}

beforeEach(async () => {
  restore = await resetSkeletonTable(table);
  // Two quests open, no link or focus: no vow is the one the scene serves
  // (narrativeSkeletonVowFulfil.test.js's table, for the typed move).
  arkVow   = vowItem('it-ark', 'Find the lost ark', { [MODULE_ID]: { vowId: VOW_ID } });
  otherVow = vowItem('it-debt', 'Repay the Syndicate', { [MODULE_ID]: { vowId: 'vow-debt-1' } });
  table.addActor({ id: 'pc-kira', name: 'Kira', type: 'character', hasPlayerOwner: true, ownership: { 'pl-1': 3 },
    items: { contents: [arkVow], find: (fn) => [arkVow].find(fn) } });
  table.addActor({ id: 'pc-ren', name: 'Ren', type: 'character', hasPlayerOwner: true, ownership: { 'pl-2': 3 },
    items: { contents: [otherVow], find: (fn) => [otherVow].find(fn) } });
  silenceConsoleErrors();
});

const planOf = (id) => plansOf(table).find(p => p.id === id);
const lastCall = () => narrationCallsOf(table).at(-1);
/**
 * The narration's per-beat context — the last system block. Every active plan
 * is written out in the world snapshot before it (issue #357); the context
 * names, under UNREVEALED, the plans in play for this narration.
 */
const contextOf = (call) => call?.body?.system?.at(-1)?.text ?? '';

/** The vow's plan, decided in an earlier scene, filed under the vow's id and the name it had then. */
async function vowPlan() {
  const { createSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => createSkeleton({
    kind: 'vow', subject: { type: 'vow', id: VOW_ID, name: 'Find the lost ark' },
    truth: TRUTH, sceneId: 'sc-earlier', sessionId: 's-1',
  }, { byGm: true }));
}

function nativeProgressCard({ source, value, dice, actorId }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}

/** A player rolls `source` on their PC's sheet; the table settles through the narration's capture. */
async function rollOnSheet(source, { value, dice }, { userId = 'pl-1', actorId = 'pc-kira', alias = 'Kira' } = {}) {
  await onGm(table, () => table.client(userId).run(() => globalThis.ChatMessage.create({
    content: nativeProgressCard({ source, value, dice, actorId }),
    speaker: { actor: actorId, alias },
    rolls:   [{ formula: '{d10,d10}', total: 0 }],
  })));
  await table.settle();
  await table.drain();
}

const STRONG = { value: 10, dice: [1, 2] };
const MISS   = { value: 1, dice: [5, 8] };

describe('issue #364 NATIVE-FULFIL-NO-ENDING-TRACK — a vow fulfilled on the sheet has its plan in play', () => {
  it('a vow reworded since its plan was filed: the fulfilment\'s narration is shown the plan, by the vow\'s id', async () => {
    const plan = await vowPlan();
    arkVow.name = 'Bring the ark home';   // reworded on the sheet
    table.replies = () => ({ prose: 'The ark opens, and what was inside is gone.',
      sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await rollOnSheet('Bring the ark home', STRONG);

    expect(lastCall()?.userText ?? '').toContain('Resolving: Bring the ark home');
    expect(contextOf(lastCall()), 'the plan behind the vow is in play for the narration that ends it')
      .toMatch(new RegExp(`## UNREVEALED[\\s\\S]*\\(id ${plan.id}\\)`));
    expect(planOf(plan.id).truthRevealed).toBe(true);
  }, 60_000);

  it('a vow already closed on the sheet — its plan resolved in code — still has its end revealed, and recorded', async () => {
    const plan = await vowPlan();
    // Closed on the sheet first: the plan is resolved as its vow is completed (issue #362 D4).
    arkVow.system.completed = true;
    for (const id of ['gm-1', 'pl-1']) table.client(id).run(() => Hooks.callAll('updateItem', arkVow, { system: { completed: true } }, {}, 'pl-1'));
    await table.settle();
    await table.drain();
    expect(planOf(plan.id).status, 'setup: resolved with its vow').toBe('resolved');

    table.replies = () => ({ prose: 'The ark opens, and what was inside is gone.',
      sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await rollOnSheet('Find the lost ark', STRONG);

    // A resolved plan is in no world snapshot: the context writes it out.
    expect(contextOf(lastCall())).toMatch(new RegExp(`## UNREVEALED[\\s\\S]*\\(id ${plan.id}\\)`));
    expect(contextOf(lastCall())).toContain(TRUTH);
    expect(planOf(plan.id), 'the reveal of a plan its vow\'s end resolved is this narration\'s').toMatchObject({ status: 'resolved', truthRevealed: true });
  }, 60_000);

  it('control: a miss ends no vow — a reworded vow\'s plan is not brought in', async () => {
    const plan = await vowPlan();
    arkVow.name = 'Bring the ark home';
    await rollOnSheet('Bring the ark home', MISS);

    expect(lastCall()?.userText ?? '').toContain('Resolving: Bring the ark home');
    expect(contextOf(lastCall())).not.toContain(`(id ${plan.id})`);
  }, 60_000);

  it('control: only the vow rolled — another vow fulfilled on the sheet brings no other vow\'s plan in', async () => {
    const plan = await vowPlan();
    arkVow.name = 'Bring the ark home';
    table.replies = () => ({ prose: 'The debt is paid.', sidecar: { newTruths: [], stateChanges: [] } });
    await rollOnSheet('Repay the Syndicate', STRONG, { userId: 'pl-2', actorId: 'pc-ren', alias: 'Ren' });

    expect(lastCall()?.userText ?? '').toContain('Resolving: Repay the Syndicate');
    expect(contextOf(lastCall())).not.toContain(`(id ${plan.id})`);
  }, 60_000);
});
