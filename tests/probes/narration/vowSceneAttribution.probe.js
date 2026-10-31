// tests/probes/narration/vowSceneAttribution.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// VOWSCENE-FIRST-PC: narrateVowSwearing (src/narration/narrator.js) builds its
// prompt for getActiveCharacter(campaignState) with no speaker — the first PC
// in the world — and narrateAndPostVowSwearing takes no actor at all, though
// the move pipeline that calls it (src/index.js, swear_an_iron_vow) knows the
// roller. In a multiplayer game, Ren swears a vow and the oath scene is
// written for Kira: Kira's CHARACTER block (pronouns, vows, bonds) and the
// PARTY roster marking Kira as "speaking this turn". CLAUDE.md "Credit the
// roller, not the GM" / decisions.md "Multiplayer attribution".

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'swear_an_iron_vow', moveName: 'Swear an Iron Vow', statUsed: 'heart', adds: 0,
    rationale: 'test', mischiefApplied: false, moveTarget: 'Find the lost beacon',
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
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
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });   // first PC in the world
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
});

describe('the vow-swearing scene is written for the character who swore', () => {
  it('Ren swears; the oath scene\'s CHARACTER block is Ren\'s', async () => {
    await table.client('pl-2').chat('I swear on the iron of my ship to find the lost beacon.', { speaker: { actor: 'pc-quinn' } });
    await table.settle();

    const move = table.claude.calls.find(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText));
    expect(move?.system).toMatch(/## CHARACTER\nName: Ren\b/);           // the move narration credits Ren…

    const oath = table.claude.calls.find(c => c.model === NARRATION_MODEL && /A character is swearing/.test(c.userText));
    expect(oath).toBeDefined();
    expect(oath.system).toMatch(/## CHARACTER\nName: Ren\b/);            // …and so must the oath scene
  });
});
