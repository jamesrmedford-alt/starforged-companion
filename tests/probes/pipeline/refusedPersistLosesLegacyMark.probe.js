/**
 * PROBE — PIPELINE-03 REFUSED-PERSIST-LOSES-LEGACY-MARK (ninth audit, area pipeline)
 *
 * What the user does: Kira takes Make a Discovery (the waypoint match's 🔭
 * button, a forced no-roll move — Confront Chaos, a Forge a Bond's bonds
 * legacy or a fulfilment's quests legacy take the same path). The move's
 * "Discoveries legacy — Marked 2 ticks on your discoveries legacy track" card
 * is posted. Then the world refuses the move's record (a server error, a
 * dropped socket — the fault the fault matrix already drives).
 *
 * What happens: the legacy mark lives only on the pipeline's working copy
 * (applyOutcomeEffects → addLegacyTicks, src/index.js:2101–2117 / :4146) and
 * reaches the world in persistResolution's one write
 * (src/moves/persistResolution.js:114–119). When that write is refused the
 * exception falls to the pipeline's catch (:1758–1763): "Move interpretation
 * failed. Check your API key…" to the GM, the lock released — and the mark
 * is gone. The "Marked 2 ticks" card stands, the world's discoveries track
 * is unchanged, no GM is offered a Retry and the box XP is (rightly, W52)
 * never paid. The same write carries the arrival's currentLocationId and a
 * site reveal; the PC's meters, written before it, stand (fault matrix:
 * "the move's record is refused").
 *
 * What should happen: a write the world refused after the move resolved is
 * told to the GMs with a one-press Retry — the rule every other refused step
 * follows (decisions.md: #306 R04 payoff steps, #315 S08 rider steps, #316
 * T04 Begin's clocks, #326 W52 legacy XP: "a write the world refused is a
 * step on the GMs' payoff failure card, whose Retry applies that effect
 * alone"); "No silent failures": the card says the mark landed, so a refused
 * one must not vanish behind a key-blaming notice (ERROR-TEXT-BLAMES-KEY).
 *
 * Control: the same move with the write accepted puts 2 ticks on the world's
 * discoveries legacy and posts no failure card.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/pipeline/refusedPersistLosesLegacyMark.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude, failWrites, campaignStateWrite } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
const world = () => table.world.campaignState();
/** The move's record: the one campaignState write of the GM's that carries persistResolution's stamp. */
const persistWrite = (w) => campaignStateWrite('gm-1')(w) && !!w.value?.updatedAt && w.value.updatedAt !== (world().updatedAt ?? null);

async function kiraMakesADiscovery() {
  await table.client('pl-1').chat('Make a discovery — something wondrous in the ruin.', {
    speaker: { actor: 'pc-kira', alias: 'Kira' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'make_a_discovery' } },
  });
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'disc-s1', sessionNumber: 1,
      currentSceneId: 'disc-scene', sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => 'Light spills from the vault.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe('PIPELINE-03 the move\'s record is refused after a legacy mark', () => {
  it('the GMs are offered a Retry for the discoveries mark the card announced', async () => {
    expectConsoleError(/Move interpretation failed/);
    const refused = failWrites(table, persistWrite);

    await kiraMakesADiscovery();

    // Sanity: the move resolved, the player was told the mark landed, the record was refused once.
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(table.cards(f => f.legacyMarkCard && f.track === 'discoveries' && f.ticks === 2)).toHaveLength(1);
    expect(refused.refused).toBe(1);
    expect(world().legacyTracks?.discoveries?.ticks ?? 0).toBe(0);           // the mark never reached the world …

    // Expected: a GMs' payoff failure card with a Retry for the refused mark (the #306 R04 shape).
    // Actual: none — only "Move interpretation failed. Check your API key…" on the GM's screen.
    expect.soft(table.cards(f => f.payoffFailureCard)).toHaveLength(1);
    expect.soft(table.client('gm-1').notifications.some(n => /legacy|discoveries|not saved|retry/i.test(n.message))).toBe(true);
  }, 30_000);

  it('control: with the write accepted the world has the 2 ticks and no failure card', async () => {
    await kiraMakesADiscovery();

    expect(world().legacyTracks?.discoveries?.ticks ?? 0).toBe(2);
    expect(table.cards(f => f.payoffFailureCard)).toHaveLength(0);
  }, 30_000);
});
