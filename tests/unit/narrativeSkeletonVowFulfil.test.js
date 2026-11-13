/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/narrativeSkeletonVowFulfil.test.js
 *
 * Issue #353 Phase 4 — a vow's plan is in play in the narration that fulfils
 * it. A vow's plan is about the vow by its stable id (every copy's `vowId`);
 * with several vows open, nothing else may bring it in — its subject's name
 * may not be the vow's (a narrated correction renames it), and the player's
 * line need not name it. Fulfill Your Vow hands the narration the vow's id
 * among the tracks the beat ends (movePipeline → narrationInputFrom →
 * endingTrackIds), as Finish an Expedition hands its track's.
 *
 * Driven on a booted table: the victory card's 🏁 Attempt to Fulfill, the
 * forced Fulfill Your Vow through the real pipeline (challenge dice 1 and 1 —
 * a strong hit on two boxes), its narration on the GM.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.05, 0.05] }));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf, narrationCallsOf, onGm } from '../helpers/skeletonTable.js';

function makeVow(id, name, vowId) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId } },
    system: { subtype: 'vow', rank: 'dangerous', current: 8, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        if (k === 'system.current') item.system.current = v;
        if (k === 'system.completed') item.system.completed = v;
        if (k === 'system.rank') item.system.rank = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    async getFlag(scope, key) { return item.flags[scope]?.[key]; },
  };
  return item;
}

const TRUTH = 'Chen walked into the Syndicate\'s vault of her own will.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = [0.05, 0.05];
  restore = await resetSkeletonTable(table);
  // Two vows open: neither is the sole open vow.
  table.actors.get('pc-kira').items.contents.push(makeVow('vow-kira', 'Find Chen', 'vid-kira'));
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 }, items: { contents: [makeVow('vow-ren', 'Repay the Syndicate', 'vid-ren')] } });
  silenceConsoleErrors();
});
afterEach(() => restore?.());

/** A decided plan about Kira's vow, by its id, under a name no line will say. */
async function vowPlan() {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'vow', subject: { type: 'vow', id: 'vid-kira', name: 'the Syndicate vault bargain' }, truth: TRUTH,
    sceneId: 'sc-old', sessionId: 's-0',
  }));
}

async function attemptToFulfil() {
  const gm = gmOf(table);
  const index = await gm.import('../../src/index.js');
  await gm.run(() => index.postFightVowMilestoneCard('Find Chen', 1, 'pc-kira'));
  await table.settle();
  const [card] = table.cards(f => f.fightVowCard);
  await onGm(table, async () => {});
  table.client('pl-1').click(card._id, '[data-action="sf-fulfill-vow"]');
  for (let i = 0; i < 3; i += 1) { await table.settle(); await table.drain(); }
}

describe('issue #353 Phase 4 — a vow\'s plan in the narration that fulfils it', () => {
  it('Fulfill Your Vow brings the vow\'s plan in by its id', async () => {
    await vowPlan();
    await attemptToFulfil();
    expect(table.cards(f => f.forcedMoveId === 'fulfill_your_vow')).toHaveLength(1);
    const call = narrationCallsOf(table).find(c => /Fulfill Your Vow/.test(c.userText ?? ''));
    expect(call, 'the fulfil was narrated').toBeTruthy();
    expect(call.system).toContain('## UNREVEALED');
    expect(call.system).toContain(TRUTH);
    expect(call.system).toContain('When the vow is fulfilled or forsaken, its story ends');
  }, 60_000);

  it('control: another move by Kira does not bring it in', async () => {
    await vowPlan();
    const { narrateResolution } = await gmOf(table).import('../../src/narration/narrator.js');
    await onGm(table, () => narrateResolution({ _id: 'res-x', moveId: 'face_danger', moveName: 'Face Danger', outcome: 'miss',
      outcomeLabel: 'Miss', playerNarration: 'I check the reactor.', loremasterContext: '[MOVE: Face Danger]', oracleSeeds: null },
    foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
    const call = narrationCallsOf(table).at(-1);
    expect(call).toBeTruthy();
    expect(call.system).not.toContain(TRUTH);
  }, 40_000);
});
