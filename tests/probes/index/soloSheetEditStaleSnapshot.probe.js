/**
 * PROBE — SNAPSHOT-STALE-NO-PLAYER-OWNER
 *
 * registerActorHook's updateActor handler (src/index.js ~2099) returns before
 * invalidateActorCache when `!actor.hasPlayerOwner`. Foundry's
 * Actor#hasPlayerOwner is true only when a NON-GM user owns the actor, so it
 * is false for every PC in solo-GM play — the module's primary use case
 * (known-issues RECAP-003 #2 fixed getPlayerActors for exactly this) — and for
 * a PC the GM plays at a group table. A vendor-sheet edit of such a PC's
 * stats or meters never drops actorBridge's snapshot cache, so the move
 * pipeline keeps rolling the old stat (resolveStatValue reads
 * readCharacterSnapshot) and the narrator's CHARACTER block keeps the old
 * meters, until some module write or Item change happens to invalidate it.
 *
 * Correct behaviour (asserted): after the GM raises iron 3 → 4 on the sheet,
 * the next snapshot / Strike roll uses iron 4.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: null }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const [c1, c2, action] = control.dice;
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(c1).mockReturnValueOnce(c2).mockReturnValueOnce(action);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table, pc;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM] });   // solo play: the GM is the only user
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.25, 0.35, 0.1];   // challenge 3, 4; action 1
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table, { fallback: () => REPLY });
  // Foundry: hasPlayerOwner is false — no non-GM user owns the solo GM's PC.
  pc = table.addActor({ id: 'pc-solo', name: 'Kira', type: 'character', hasPlayerOwner: false, system: { iron: 3 } });
  silenceConsoleErrors();
});

describe('PROBE SNAPSHOT-STALE-NO-PLAYER-OWNER', () => {
  it("a sheet edit of the solo GM's PC reaches the next snapshot", async () => {
    const gm = table.client('gm-1');
    const bridge = await gm.import('../../src/character/actorBridge.js');
    expect(gm.run(() => bridge.readCharacterSnapshot(pc)).stats.iron).toBe(3);   // cached (as any narration does)

    await gm.run(() => pc.update({ 'system.iron': 4 }));   // the GM raises iron on the vendor sheet
    await table.settle();

    // Expected 4. Actual 3 — the updateActor hook never invalidated the cache.
    expect(gm.run(() => bridge.readCharacterSnapshot(pc)).stats.iron).toBe(4);
  }, 30_000);

  it('the next move rolls the edited stat', async () => {
    const gm = table.client('gm-1');
    const bridge = await gm.import('../../src/character/actorBridge.js');
    gm.run(() => bridge.readCharacterSnapshot(pc));          // cached by an earlier narration
    await gm.run(() => pc.update({ 'system.iron': 4 }));     // sheet edit
    await table.settle();

    await gm.chat('I wrench the hatch open with everything I have.', { speaker: { actor: 'pc-solo' } });
    await table.settle(); await table.drain();

    const card = table.cards(f => f.moveResolution)[0];
    expect(card).toBeTruthy();
    // Expected "+iron (4)"; actual "+iron (3)".
    expect(card.content).toContain('+iron (4)');
  }, 30_000);
});
