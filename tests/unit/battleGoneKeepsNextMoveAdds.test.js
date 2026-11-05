/**
 * STARFORGED COMPANION
 * tests/unit/battleGoneKeepsNextMoveAdds.test.js
 *
 * Issue #331 X17 (BATTLE-GONE-EATS-NEXT-MOVE-ADDS). Kira has a pending "+1 on
 * your next move" (Secure an Advantage, campaignState.nextMoveBonuses) and the
 * table has Take a Break's +1 pending (campaignState.nextMoveAdd). A Battle
 * forced against a fight by id reaches the pipeline after that fight ended —
 * the "⚔ Battle instead" press held behind the move lock while a Take
 * Decisive Action on the same fight was narrated (issue #325 W02), or any
 * forced Battle naming a finished fight. The pipeline consumed both +1s and
 * only then found the fight over and posted "Battle — not rolled": both paid
 * to a roll that never happened. Decided: the +1 goes to the next action roll
 * made, and a claim that adds nothing leaves it pending (issue #322 V02) — the
 * "not rolled" guards now come before any add is taken.
 *
 * On a booted table (tests/helpers/multiClient.js): the GM's real pipeline,
 * the forced move's stat-only reading and the dice scripted at their
 * boundaries.
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
// The forced Battle's stat-only reading (enrichForcedMoveStat, issue #321 U04).
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async () => ({ moveId: 'battle', moveName: 'Battle', statUsed: 'iron', rationale: 'test' })),
}));
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

const corsairs = (completed) => ({
  id: 'fight-1', label: 'Corsairs', type: 'combat', rank: 'dangerous', ticks: 16,
  completed, combatState: 'in_control', positions: { 'pc-kira': 'in_control' },
});

// Challenge 1 and 2, action die 6: a strong hit whatever the adds.
const STRONG = [0.0, 0.15, 0.99];

let table;
const world = () => table.world.campaignState();

async function forcedBattle() {
  control.dice = STRONG;
  await table.client('pl-1').chat('Battle — resolve the fight against Corsairs in a single, decisive clash.', {
    speaker: { actor: 'pc-kira', alias: 'Kira' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'battle', forcedMoveTargetId: 'fight-1', forcedMoveTarget: 'Corsairs' } },
  });
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'bat-s1', sessionNumber: 1,
      currentSceneId: 'bat-scene', sceneTruths: [], clocks: [],
      // Take a Break's table-wide +1 …
      nextMoveAdd: { value: 1, source: 'take_a_break', setAt: '2026-11-03T00:00:00.000Z' },
      // … and Kira's own "+1 on your next move" (Secure an Advantage).
      nextMoveBonuses: { 'pc-kira': { value: 1, sources: ['secure_an_advantage'], setAt: '2026-11-03T00:00:00.000Z' } },
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe('X17 — a forced Battle naming a finished fight is not rolled, and takes no +1', () => {
  it('leaves Take a Break\'s +1 and the roller\'s next-move bonus pending', async () => {
    silenceConsoleErrors();
    table.journal._set(makeTracksJournal([corsairs(true)]));

    await forcedBattle();

    // Sanity: the pipeline took the fight-over branch — "not rolled", no move card.
    expect(table.cards(f => f.trackGoneCard)).toHaveLength(1);
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);

    // Both +1s are still pending in the world, for the next action roll made.
    expect(world().nextMoveAdd?.value ?? null).toBe(1);
    expect(world().nextMoveBonuses?.['pc-kira']?.value ?? null).toBe(1);
  }, 30_000);

  it('a Battle naming a fight that was deleted leaves them pending too', async () => {
    silenceConsoleErrors();
    table.journal._set(makeTracksJournal([]));

    await forcedBattle();

    expect(table.cards(f => f.trackGoneCard)).toHaveLength(1);
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);
    expect(world().nextMoveAdd?.value ?? null).toBe(1);
    expect(world().nextMoveBonuses?.['pc-kira']?.value ?? null).toBe(1);
  }, 30_000);

  it('control: a Battle on an open fight rolls with both +1s and drops them', async () => {
    silenceConsoleErrors();
    table.journal._set(makeTracksJournal([corsairs(false)]));

    await forcedBattle();

    const [card] = table.cards(f => f.moveResolution);
    expect(card, 'the Battle rolled').toBeTruthy();
    expect(card.content).toMatch(/6 \+ 3 \+ 2\b/);                           // action 6 + iron 3 + the two adds
    expect(world().nextMoveAdd ?? null).toBeNull();
    expect(world().nextMoveBonuses?.['pc-kira'] ?? null).toBeNull();
  }, 30_000);
});
