/**
 * PROBE — PACED-ROLL-CREDITS-CLICKER (eighth audit, area index-commands-hooks)
 *
 * What the user does: at a two-player table Pat (PC Kira) types "I vault the
 * railing and sprint for the airlock." The pacing classifier answers
 * NARRATIVE_WITH_MOVE_AVAILABLE, so the narrator posts a paced card with a
 * "Roll Face Danger" button. The GM clicks it to move play along.
 *
 * What happens: the button handler (src/index.js ~7232) re-posts
 * `f.playerText` with `ChatMessage.create({ content, flags: { bypassPacing,
 * forcedMoveId } })` — no `speaker`. The paced card never recorded whose
 * narration it was (narrator.js postPacedNarrativeCard stamps `playerName`
 * only, though routePacedInput had `speakerActorId`), so the pipeline
 * resolves the speaker from the CLICKER (resolveSpeakerActorId → the GM's
 * resolveUserActorId → the first PC the GM owns, i.e. the first PC in the
 * world). Kira's action is rolled with Ren's stats and its consequences land
 * on Ren. A second player clicking it rolls it as their own PC the same way.
 * The which-fight pick already re-posts with `speaker: { actor: f.actorId }`
 * (decisions.md "Multiplayer attribution: roll effects credit the roller").
 *
 * What should happen: the forced move is the narrating player's — Kira rolls
 * it, whoever presses the button.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/commands/pacedRollButtonClicker.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      // challenge 2, 3; action 6 → a strong hit
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.15).mockReturnValueOnce(0.25).mockReturnValueOnce(0.99);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const isClassifier = (call) => /pacing pre-classifier/.test(call.system ?? '');
const NWMA = JSON.stringify({
  decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'face_danger',
  category: 'exploration', confidence: 0.7, reasoning: 'Risky, but the player may want to narrate it.',
});
const LEAP = 'I vault the railing and sprint for the airlock.';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  // Ren first: the first PC in the world.
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table).when(isClassifier, NWMA);
});

/** Pat narrates; the real classifier + narrator post the paced card. */
async function pacedCardForPat() {
  await table.client('pl-1').chat(LEAP, { speaker: { actor: 'pc-pat' } });
  await table.settle(); await table.drain();
  const [card] = table.cards(f => f.pacedNarrative && f.suggestedMove === 'face_danger');
  expect(card, 'the paced card was posted').toBeTruthy();
  return card._id ?? card.id;
}

const rolledFor = () => table.cards(f => f.moveResolution).map(c => c.flags[MODULE_ID].actorId);

describe('PROBE PACED-ROLL-CREDITS-CLICKER', () => {
  it("the GM pressing Roll on Pat's paced card rolls Kira's move", async () => {
    const id = await pacedCardForPat();

    table.client('gm-1').click(id, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();

    // Expected: ['pc-pat']. Today: ['pc-quinn'] — the GM's "first PC".
    expect(rolledFor()).toEqual(['pc-pat']);
  }, 30_000);

  it('control: Pat pressing it rolls Kira', async () => {
    const id = await pacedCardForPat();

    table.client('pl-1').click(id, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();

    expect(rolledFor()).toEqual(['pc-pat']);
  }, 30_000);
});
