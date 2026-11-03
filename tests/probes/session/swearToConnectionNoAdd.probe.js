/**
 * PROBE SC — SWEAR-CONNECTION-ADD-MISSING (RULES)
 *
 * Swear an Iron Vow (vendor json-packs/starforged-moves, rulebook p. 30):
 * "roll +heart. If you swear this vow to a connection, add +1; if you share a
 * bond, add +2."
 *
 * What the user does: the inciting incident's vow is sworn to the sector's
 * established connection (the prompt prefers the established NPC as the vow
 * target; swearSharedVowForAll links every copy to them), and the player
 * presses ⚔ Swear this vow — or swears a sheet-made vow linked to a
 * connection with "⚔ Swear it (roll)".
 *
 * What happens: the forced move the card posts (swearVow.js
 * buildSwearMovePost / buildSwearMovePostForName) carries the vow statement
 * and nothing about the connection, and the pipeline's adds are only the
 * confirm dialog's asset abilities, Take a Break's +1 and the roller's next-
 * move bonus (index.js, before resolveMove) — the model's own adds are
 * dropped (issue #322 V08) and the dialog has no adds input. The +1 / +2 is
 * never added; the swear rolls bare +heart.
 *
 * What should happen: a swear to a connection rolls +1, to a bonded one +2.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
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
import { buildSwearMovePost } from '../../../src/session/swearVow.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';

function connectionCard(id, name, bonded) {
  return makeTestActor({ id, name, type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection',
      connection: { _id: `rec-${id}`, name, rank: 'dangerous', bonded, active: true } } } });
}

function incitingCard(targetName) {
  return makeTestMessage({
    id: 'inc-1', content: '',
    flags: { [MODULE_ID]: { incitingIncidentCard: true, incitingMeta: {
      vow: { statement: 'I will find who sabotaged the relay', rank: 'formidable' },
      clock: null, immediateCrisis: null,
      target: { name: targetName, pronouns: 'she/her', description: 'the relay engineer' },
    } } },
  }, { author: 'gm-1' });
}

async function swearFrom(card) {
  const post = buildSwearMovePost(card);
  const handler = Hooks._handlers.get('createChatMessage').slice(-1)[0];
  await handler({ type: 'ic', content: post.content, author: { id: 'gm-1', isGM: true }, flags: post.flags });
  return resolveMove.mock.calls[0]?.[0] ?? null;
}

beforeEach(() => {
  Hooks._handlers.clear();
  resolveMove.mockClear();
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.actors._reset();
  silenceConsoleErrors();   // the mocked resolveMove throws to end the run
  registerChatHook();
});

function world(connections) {
  const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character', system: { heart: 2 } });
  game.actors._setAll([kira, ...connections]);
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    ...CampaignStateSchema, sessionActive: true, pendingMove: false,
    connectionIds: connections.map(c => c.id), characterIds: ['pc-kira'],
  });
}

describe('PROBE SWEAR-CONNECTION-ADD-MISSING', () => {
  it('control: a swear whose target is nobody the crew knows rolls +heart with no add', async () => {
    world([]);
    const interp = await swearFrom(incitingCard('A stranger'));
    expect(interp?.moveId).toBe('swear_an_iron_vow');
    expect(interp.adds ?? 0).toBe(0);
  });

  it('a vow sworn to a connection adds +1', async () => {
    world([connectionCard('npc-dani', 'Dani Okoro', false)]);
    const interp = await swearFrom(incitingCard('Dani Okoro'));
    expect(interp?.moveId).toBe('swear_an_iron_vow');
    expect(interp.adds ?? 0).toBe(1);        // actual: 0
  });

  it('a vow sworn to a bonded connection adds +2', async () => {
    world([connectionCard('npc-dani', 'Dani Okoro', true)]);
    const interp = await swearFrom(incitingCard('Dani Okoro'));
    expect(interp.adds ?? 0).toBe(2);        // actual: 0
  });
});
