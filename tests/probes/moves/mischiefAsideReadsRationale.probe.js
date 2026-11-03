/**
 * PROBE — MC-10 MISCHIEF-ASIDE-READS-RATIONALE (eighth bug audit, moves-core)
 *
 * What the user does: with the Mischief dial on Chaotic, types "I punch the
 * guard in the face and shove past him"; the Trickster reframes it as Gather
 * Information (mischiefApplied), with the rationale "The real goal is to learn
 * who sent the guard."
 *
 * What happens: the confirm dialog's wry aside is chosen from the model's
 * RATIONALE, not from what the player said. index.js calls
 * buildMischiefAside(interpretation.rationale, moveId, statUsed, dial), but
 * mischief.js documents and uses its first argument as "raw player narration"
 * — its chaotic asides key on the surface reading of the narration (a fight
 * narration reframed as a non-combat move: "You brought fists to a feelings
 * problem.", "Bold. Tactically irrelevant, but bold." …). Read from the
 * rationale, the fight branch never fires and a generic stat line is shown.
 *
 * What should happen: the pipeline passes the player's narration (`narration`
 * is in scope at the call).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'gather_information', moveName: 'Gather Information', statUsed: 'wits', adds: 0,
    rationale: 'The real goal is to learn who sent the guard.', mischiefApplied: true,
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
const seen = vi.hoisted(() => ({ interp: null }));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async (interp) => { seen.interp = interp; return false; }),
}));

import { registerChatHook } from '../../../src/index.js';
import { buildMischiefAside } from '../../../src/moves/mischief.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const PUNCH = 'I punch the guard in the face and shove past him.';
// mischief.js pickChaoticAside's fight-narration branch (a fight reframed as a
// non-combat move).
const FIGHT_ASIDES = [
  'That was never going to be a clean fight.',
  'You brought fists to a feelings problem.',
  'The real threat here isn\'t something you can shoot.',
  'Bold. Tactically irrelevant, but bold.',
];

beforeEach(() => {
  Hooks._handlers.clear();
  seen.interp = null;
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(`${MODULE_ID}.mischiefDial`, 'chaotic');
  game.settings._store.set(`${MODULE_ID}.campaignState`, { ...CampaignStateSchema, sessionActive: true, pendingMove: false });
  registerChatHook();
});

describe('the mischief aside reads what the player said', () => {
  it('control: given the player\'s narration, the chaotic aside is a fight-reframe line', () => {
    expect(FIGHT_ASIDES).toContain(buildMischiefAside(PUNCH, 'gather_information', 'wits', 'chaotic'));
  });

  it('the pipeline\'s aside for a punch reframed as Gather Information is a fight-reframe line', async () => {
    const handler = Hooks._handlers.get('createChatMessage').slice(-1)[0];
    await handler({ type: 'ic', content: PUNCH, author: { id: 'gm-1', isGM: true }, flags: {} });
    expect(seen.interp?._mischiefAside).toBeTruthy();
    expect(FIGHT_ASIDES).toContain(seen.interp._mischiefAside);
  });
});
