/**
 * PROBE — PIPELINE-01 BATTLE-GONE-EATS-NEXT-MOVE-ADDS (ninth audit, area pipeline)
 *
 * What the user does: Kira has a pending "+1 on your next move" (Secure an
 * Advantage's strong hit, campaignState.nextMoveBonuses["pc-kira"]) and the
 * table has Take a Break's +1 pending (campaignState.nextMoveAdd). A Battle
 * forced against a fight by id reaches the pipeline after that fight has
 * ended — the "⚔ Battle instead" press that met the move lock while a Take
 * Decisive Action on the same fight was being narrated (held with
 * `deferWhileBusy`, issue #325 W02, and replayed by drainDeferredForcedMoves
 * once the lock frees), or any forced Battle naming a finished fight.
 *
 * What happens (src/index.js): the pipeline consumes both +1s BEFORE it
 * decides not to roll — takeNextMoveAdd + clearPersistedNextMoveAdd at
 * :1151–1155 (the store write lands) and consumeNextMoveBonus at :1159
 * (claimed on the store first) — and only then, at :1192–1199, finds the
 * fight over, posts the "Battle — not rolled" card and returns. Nothing is
 * rolled, and the +1s are gone from the world: Take a Break's "you or an ally
 * may add +1 on the next move" and the roller's "+1 on your next move" are
 * paid to a roll that never happened. (The same guard for progress moves at
 * :1182–1188 is harmless — a progress move takes no action add — so only
 * Battle, an action move whose fight-over guard was added by #325 W11 after
 * the adds, loses them.)
 *
 * What should happen: a move that is not rolled takes no add — decisions.md
 * "Take a Break's +1 applies to the next action roll" / "The roller's +1 on
 * the next move is applied automatically": the +1 is added to the next ACTION
 * ROLL and "a refused claim adds nothing and leaves it pending". A not-rolled
 * Battle must leave both pending for the roller's next action roll.
 *
 * Controls: a Battle on an open fight takes both +1s (the card shows "+ 2"
 * and the world drops them) — pins the consumption the fix must keep.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/pipeline/battleGoneEatsNextMoveAdds.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
// The forced Battle's stat-only reading (enrichForcedMoveStat, issue #321 U04).
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async () => ({ moveId: 'battle', moveName: 'Battle', statUsed: 'iron', rationale: 'test' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('PIPELINE-01 a forced Battle naming a finished fight is not rolled', () => {
  it('leaves Take a Break\'s +1 and the roller\'s next-move bonus pending', async () => {
    silenceConsoleErrors();
    table.journal._set(makeTracksJournal([corsairs(true)]));

    await forcedBattle();

    // Sanity: the pipeline took the fight-over branch — "not rolled", no move card.
    expect(table.cards(f => f.trackGoneCard)).toHaveLength(1);
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);

    // Expected: both +1s still pending in the world. Actual: both consumed by a roll that never happened.
    expect.soft(world().nextMoveAdd?.value ?? null).toBe(1);                     // actual: null (cleared on the store at :1154)
    expect.soft(world().nextMoveBonuses?.['pc-kira']?.value ?? null).toBe(1);   // actual: null (claimed on the store at :1159)
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
