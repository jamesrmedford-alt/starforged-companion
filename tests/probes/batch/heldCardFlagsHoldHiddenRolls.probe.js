/**
 * PROBE — BATCH · HELD-CARD-FLAGS-HOLD-HIDDEN-ROLLS (LEAK; the free-flow twin of
 * ROUND-SETTING-HOLDS-HIDDEN-ROLLS — found tracing the same value)
 *
 * Scenario: free-flow play, "Ask before paying and narrating" on (the
 * default). A player's Undertake an Expedition begins an expedition and its
 * result can be upgraded (a weak hit a burn would raise), so the result is
 * held (issue #354 P2-10): the move card is posted — to the whole table — with
 * `flags.awaitingUpgrade.resolution`, a copy of the whole resolution.
 *
 * Correct (decisions.md → "Hidden oracle rolls (decided): GM-only until the
 * plan's truth is revealed … No hidden roll is on a player-visible card or a
 * card's flags otherwise"): the card's flags carry no hidden roll.
 *
 * Today: the resolution copied onto the card carries `skeletonRequests` — the
 * expedition's plan request, with its hidden seeds (two waypoint sightings and
 * "What waits at the end — Action + Theme: …"). Every client holds every
 * public message's flags.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
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

// challenge 3 and 7, action die 4 (+2): a weak hit — momentum 9 burns it to a strong hit, so it is held.
const WEAK   = [0.25, 0.65, 0.5];
// challenge 1 and 2: a strong hit — nothing to upgrade, nothing held.
const STRONG = [0.05, 0.15, 0.9];
const HIDDEN_ROLL = /What waits at the end — Action \+ Theme|A waypoint — Space Sighting|The new enemy — Character/;

let table, pc;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'held-s1', sessionNumber: 1,
      currentSceneId: 'held-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  pc = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

async function beginExpedition(dice) {
  control.interpretation = { moveId: 'undertake_an_expedition', moveName: 'Undertake an Expedition', statUsed: 'wits', adds: 0,
    moveTarget: 'the Kepler drift', rationale: 'test', mischiefApplied: false };
  control.dice = dice;
  await table.client('pl-1').chat('I chart a course into the Kepler drift.', { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

describe('BATCH (free-flow twin) — a held result\'s card and the hidden rolls behind a plan', () => {
  it('the held move card another player\'s client holds carries no hidden roll in its flags', async () => {
    const card = await beginExpedition(WEAK);
    const held = table.world.message(card._id).flags[MODULE_ID].awaitingUpgrade;
    expect(held, 'setup: the weak hit is held for Burn / Keep').toMatchObject({ open: true, resolution: { moveId: 'undertake_an_expedition', outcome: 'weak_hit' } });
    expect(table.cards(f => f.expeditionProgressCard), 'setup: the move began an expedition').toHaveLength(1);

    // Ren's player's replica of the public card.
    const onRensClient = table.client('pl-2').message(card._id);
    expect(onRensClient, 'setup: the card is on the other player\'s client').toBeTruthy();
    // FAILS today: flags.awaitingUpgrade.resolution.skeletonRequests[0].oracleSeeds.
    expect(JSON.stringify(onRensClient.flags)).not.toMatch(HIDDEN_ROLL);
  }, 60_000);

  it('control: a result that is not held puts no hidden roll on any card', async () => {
    const card = await beginExpedition(STRONG);
    expect(table.world.message(card._id).flags[MODULE_ID].awaitingUpgrade).toBeUndefined();
    expect(table.cards(f => f.expeditionProgressCard)).toHaveLength(1);
    for (const m of table.cards()) expect(JSON.stringify(m.flags ?? {}) + String(m.content ?? '')).not.toMatch(HIDDEN_ROLL);
  }, 60_000);
});
