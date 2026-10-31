/**
 * A sheet edit of a PC no player owns reaches the next roll and the narrator
 * (issue #321 U01).
 *
 * actorBridge.readCharacterSnapshot caches per actor id; for an edit made on
 * the vendor sheet the only invalidation is the `updateActor` hook in
 * src/index.js registerActorHook(). It used to return before the
 * invalidation when `!actor.hasPlayerOwner` — and Foundry's hasPlayerOwner is
 * true only when a NON-GM user owns the actor, so it is false for every PC in
 * solo-GM play (the module's primary use case) and for a PC the GM plays at a
 * group table. A raised stat kept rolling the old value and the narrator's
 * CHARACTER block kept the old meters until some module write happened to drop
 * the cache. The hook now invalidates on every update; the owner gate guards
 * only the momentum recalc.
 *
 * Booted on the multi-client harness (the real ready-hook registrations).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table, gm, bridge;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM] });   // solo play: the GM is the only user
  gm = table.client('gm-1');
  bridge = await gm.import('../../src/character/actorBridge.js');   // resolved from tests/helpers
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
});

describe("a sheet edit of the solo GM's PC (hasPlayerOwner false) drops the cached snapshot", () => {
  it('a raised stat reaches the next snapshot', async () => {
    // Foundry: hasPlayerOwner is false — no non-GM user owns the solo GM's PC.
    const pc = table.addActor({ id: 'pc-solo', name: 'Kira', type: 'character', hasPlayerOwner: false, system: { iron: 3 } });
    expect(gm.run(() => bridge.readCharacterSnapshot(pc)).stats.iron).toBe(3);   // cached (as any narration does)

    await gm.run(() => pc.update({ 'system.iron': 4 }));   // the GM raises iron on the vendor sheet
    await table.settle();

    expect(gm.run(() => bridge.readCharacterSnapshot(pc)).stats.iron).toBe(4);
  }, 30_000);

  it('meters, impacts and pronouns edited on the sheet reach the next snapshot', async () => {
    const kira = table.addActor({ id: 'pc-solo', name: 'Kira', type: 'character', hasPlayerOwner: false,
      system: { pronouns: 'she/her' } });
    const before = await gm.run(() => bridge.readCharacterSnapshot(kira));
    expect(before.meters.health).toBe(5);

    // The GM drags health to 2, marks wounded and edits pronouns on the vendor sheet.
    await gm.run(() => kira.update({ 'system.health.value': 2, 'system.debility.wounded': true, 'system.pronouns': 'they/them' }));
    await table.settle();

    const after = await gm.run(() => bridge.readCharacterSnapshot(kira));
    expect({ health: after.meters.health, wounded: after.debilities.wounded, pronouns: after.pronouns })
      .toEqual({ health: 2, wounded: true, pronouns: 'they/them' });
  });

  it('the next move rolls the edited stat', async () => {
    const pc = table.addActor({ id: 'pc-solo', name: 'Kira', type: 'character', hasPlayerOwner: false, system: { iron: 3 } });
    gm.run(() => bridge.readCharacterSnapshot(pc));          // cached by an earlier narration
    await gm.run(() => pc.update({ 'system.iron': 4 }));     // sheet edit
    await table.settle();

    await gm.chat('I wrench the hatch open with everything I have.', { speaker: { actor: 'pc-solo' } });
    await table.settle(); await table.drain();

    const card = table.cards(f => f.moveResolution)[0];
    expect(card).toBeTruthy();
    expect(card.content).toContain('+iron (4)');
  }, 30_000);

  it('control: the same edit on a player-owned PC is seen', async () => {
    const mara = table.addActor({ id: 'pc-owned', name: 'Mara', type: 'character', hasPlayerOwner: true,
      system: { pronouns: 'she/her' } });
    await gm.run(() => bridge.readCharacterSnapshot(mara));
    await gm.run(() => mara.update({ 'system.health.value': 2, 'system.pronouns': 'they/them' }));
    await table.settle();
    const after = await gm.run(() => bridge.readCharacterSnapshot(mara));
    expect({ health: after.meters.health, pronouns: after.pronouns }).toEqual({ health: 2, pronouns: 'they/them' });
  });
});
