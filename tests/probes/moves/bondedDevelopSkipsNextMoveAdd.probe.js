/**
 * PROBE — MC-15 BONDED-DEVELOP-SKIPS-PLUS-ONE (eighth bug audit, moves-core)
 *
 * What the user does: takes Take a Break → "Move on" (+1 on the next move,
 * not a progress move), then develops their relationship with a connection
 * they share a bond with — the bonded Develop Your Relationship, an action
 * roll "+their rank".
 *
 * What happens: the roll is +rank with no +1, and the +1 stays pending for a
 * later roll. The pipeline takes the add with nextMoveAdd.takeNextMoveAdd /
 * consumeNextMoveBonus, which ask isActionRollMove(moveId) — schemas.js
 * moveRollKind of the move's DATA, "none" for develop_your_relationship —
 * BEFORE statEnrichment.enrichBondedDevelop marks the interpretation
 * `rollKind: "action"` (decisions.md issue #316 T05: "a bonded Develop Your
 * Relationship, the one no-stat move that rolls, is marked rollKind: "action"
 * by its enrichment" — the resolver honours it; the adds do not).
 *
 * What should happen: the bonded development is the next action roll and
 * takes the +1 (Take a Break: "You or an ally may add +1 on the next move
 * (not a progress move)").
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
const control = vi.hoisted(() => ({ interpret: null }));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ ...control.interpret })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveMove: vi.fn(() => { throw new Error('stop-after-resolve'); }),
}));

import { registerChatHook } from '../../../src/index.js';
import { resolveMove } from '../../../src/moves/resolver.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

beforeEach(() => {
  Hooks._handlers.clear();
  resolveMove.mockClear();
  game.actors._reset();
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.actors._set('pc-a', makeTestActor({ id: 'pc-a', name: 'Ash' }));
  game.actors._set('npc-kira', makeTestActor({
    id: 'npc-kira', name: 'Kira', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'c-kira', name: 'Kira', rank: 'dangerous', bonded: true, active: true, relationshipTicks: 40,
    } } },
  }));
  game.settings._store.set(KEY, {
    ...CampaignStateSchema, sessionActive: true, pendingMove: false, connectionIds: ['npc-kira'],
    nextMoveAdd: { value: 1, source: 'take_a_break', setAt: '2026-11-01T00:00:00.000Z' },
  });
  silenceConsoleErrors();
  registerChatHook();
});

async function play(text) {
  const handler = Hooks._handlers.get('createChatMessage').slice(-1)[0];
  await handler({ type: 'ic', content: text, author: { id: 'gm-1', isGM: true }, speaker: { actor: 'pc-a' }, flags: {} });
  expect(resolveMove).toHaveBeenCalledTimes(1);
  return resolveMove.mock.calls[0][0];
}

describe('Take a Break\'s +1 and the bonded Develop Your Relationship roll', () => {
  it('control: an ordinary action roll (Face Danger) takes the +1', async () => {
    control.interpret = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 't' };
    const interp = await play('I brace against the hull and push through the breach.');
    expect(interp.adds).toBe(1);
  });

  it('the bonded development (+rank, an action roll) takes the +1 too', async () => {
    control.interpret = { moveId: 'develop_your_relationship', moveName: 'Develop Your Relationship', statUsed: null, adds: 0, moveTarget: 'Kira', rationale: 't' };
    const interp = await play('I stand with Kira through the blockade.');
    expect(interp.rollKind).toBe('action');
    expect(interp.adds).toBe(1);
    expect(game.settings._store.get(KEY).nextMoveAdd).toBeUndefined();
  });
});
