/**
 * PROBE — MC-14 BOND-ADDS-NOT-ROLLED (eighth bug audit, moves-core)
 *
 * What the user does: tests their relationship with a connection they share a
 * bond with — "Kira finds out I sold the data; I try to win back her trust" —
 * through the move pipeline.
 *
 * What happens: the roll is +heart with no add. Test Your Relationship's text
 * (vendored starforged-moves): "roll +heart. If you share a bond, add +1." —
 * and Swear an Iron Vow's: "If you swear this vow to a connection, add +1; if
 * you share a bond, add +2." The pipeline rolls these moves itself (the
 * confirm dialog has no adds input — decisions.md, issue #322 V02), and
 * nothing adds the move's own bonus: the adds are only the dialog's asset
 * abilities and the pending +1s. The connection IS resolved for Test Your
 * Relationship — after the dice, in the develop branch (selectConnection on
 * moveTarget) — and for Develop Your Relationship before them
 * (statEnrichment.enrichBondedDevelop).
 *
 * What should happen: resolve the connection before the dice (as
 * enrichBondedDevelop does) and add +1 to a bonded Test Your Relationship;
 * likewise +1 / +2 to a vow sworn to a connection / a bond.
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
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    ...CampaignStateSchema, sessionActive: true, pendingMove: false, connectionIds: ['npc-kira'],
  });
  silenceConsoleErrors();   // the mocked resolveMove throws to end the run
  registerChatHook();
});

async function play(text) {
  const handler = Hooks._handlers.get('createChatMessage').slice(-1)[0];
  await handler({ type: 'ic', content: text, author: { id: 'gm-1', isGM: true }, speaker: { actor: 'pc-a' }, flags: {} });
  expect(resolveMove).toHaveBeenCalledTimes(1);
  return resolveMove.mock.calls[0][0];
}

describe('a bonded connection\'s add reaches the roll', () => {
  it('control: Develop Your Relationship with the bonded Kira rolls +rank (+2, dangerous)', async () => {
    control.interpret = { moveId: 'develop_your_relationship', moveName: 'Develop Your Relationship', statUsed: null, adds: 0, moveTarget: 'Kira', rationale: 't' };
    const interp = await play('I stand with Kira through the blockade.');
    expect(interp).toMatchObject({ statUsed: 'dangerous', statValue: 2, rollKind: 'action' });
  });

  it('Test Your Relationship with the bonded Kira adds +1', async () => {
    control.interpret = { moveId: 'test_your_relationship', moveName: 'Test Your Relationship', statUsed: 'heart', adds: 0, moveTarget: 'Kira', rationale: 't' };
    const interp = await play('Kira finds out I sold the data; I try to win back her trust.');
    expect(interp.adds).toBe(1);
  });
});
