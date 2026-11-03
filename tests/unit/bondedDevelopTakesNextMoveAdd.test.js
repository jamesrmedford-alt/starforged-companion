// tests/unit/bondedDevelopTakesNextMoveAdd.test.js
// A bonded Develop Your Relationship takes the next-move adds (issue #326
// W48). The bonded development is an action roll "+their rank", marked
// `rollKind: "action"` by statEnrichment.enrichBondedDevelop (issue #316
// T05). Take a Break's +1 and the roller's own "+1 on your next move" were
// taken before that enrichment and asked isActionRollMove of the move's
// data ("none" for develop_your_relationship), so the roll went without the
// +1 and a later roll took it. The adds are now taken after the
// enrichment, on the roll kind it resolved.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
const control = vi.hoisted(() => ({ interpret: null }));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ ...control.interpret })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveMove: vi.fn(() => { throw new Error('stop-after-resolve'); }),
}));

import { registerChatHook } from '../../src/index.js';
import { resolveMove } from '../../src/moves/resolver.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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

describe('Take a Break\'s +1 and the bonded Develop Your Relationship roll (issue #326 W48)', () => {
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
  it("the roller's own \"+1 on your next move\" is taken by a bonded development too", async () => {
    game.settings._store.set(KEY, {
      ...game.settings._store.get(KEY), nextMoveAdd: undefined,
      nextMoveBonuses: { 'pc-a': { value: 1, sources: ['secure_an_advantage'], setAt: '2026-11-01T00:00:00.000Z' } },
    });
    control.interpret = { moveId: 'develop_your_relationship', moveName: 'Develop Your Relationship', statUsed: null, adds: 0, moveTarget: 'Kira', rationale: 't' };
    const interp = await play('I stand with Kira through the blockade.');
    expect(interp.adds).toBe(1);
    expect(game.settings._store.get(KEY).nextMoveBonuses?.['pc-a']).toBeUndefined();
  });

  it('control: an un-bonded development (no roll) leaves the +1 pending', async () => {
    const kira = game.actors.get('npc-kira');
    kira.flags[MODULE_ID].connection.bonded = false;
    control.interpret = { moveId: 'develop_your_relationship', moveName: 'Develop Your Relationship', statUsed: null, adds: 0, moveTarget: 'Kira', rationale: 't' };
    const interp = await play('I stand with Kira through the blockade.');
    expect(interp.rollKind ?? null).not.toBe('action');
    expect(interp.adds ?? 0).toBe(0);
    expect(game.settings._store.get(KEY).nextMoveAdd).toMatchObject({ value: 1 });
  });
});
