/**
 * The oath scene and a confirmed connection belong to the PC who acted, not
 * the campaign's first PC (issue #321 U23).
 *
 * - narrateVowSwearing built its prompt for getActiveCharacter(campaignState)
 *   with no speaker, though the move pipeline that calls it knows the roller:
 *   Ren swore a vow and the oath scene was written for Kira (her CHARACTER
 *   block, and the PARTY roster marking her as "speaking this turn").
 * - Confirm on a draft card put the new connection's bond Item on the first
 *   PC. The card now carries the PC the narration was for.
 *
 * CLAUDE.md "Credit the roller, not the GM" / decisions.md "Multiplayer
 * attribution". On the multi-client harness (the real ready-hook wiring).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'swear_an_iron_vow', moveName: 'Swear an Iron Vow', statUsed: 'heart', adds: 0,
    rationale: 'test', mischiefApplied: false, moveTarget: 'Find the lost beacon',
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-5-5';

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

const bondNames = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);

describe('the vow-swearing scene is written for the character who swore', () => {
  it("Ren swears; the oath scene's CHARACTER block is Ren's", async () => {
    await table.client('pl-2').chat('I swear on the iron of my ship to find the lost beacon.', { speaker: { actor: 'pc-quinn' } });
    await table.settle();

    const move = table.claude.calls.find(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText));
    expect(move?.system).toMatch(/## CHARACTER\nName: Ren\b/);           // the move narration credits Ren…

    const oath = table.claude.calls.find(c => c.model === NARRATION_MODEL && /A character is swearing/.test(c.userText));
    expect(oath).toBeDefined();
    expect(oath.system).toMatch(/## CHARACTER\nName: Ren\b/);            // …and so does the oath scene
  });
});

describe("Confirm on a draft card puts the connection's bond on the PC the narration was for", () => {
  /** A narration for `actorId` queues a new NPC on the GM's draft card; the GM confirms it. */
  async function confirmDraftFrom(actorId) {
    const gm = table.client('gm-1');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => routeEntityDrafts(
      [{ type: 'connection', name: 'Vance Oduya', description: 'The dockmaster of the Hollow Spire.', confidence: 'high' }],
      game.settings.get(MODULE_ID, 'campaignState'),
      { autoCreateConnection: false, ...(actorId ? { actorId } : {}) },
    ));
    await table.settle();
    const [card] = table.cards(f => f.draftEntityCard);
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    return card;
  }

  it("Ren's narration introduced them: the bond is on Ren's sheet, not Kira's", async () => {
    const card = await confirmDraftFrom('pc-quinn');
    expect(card.flags[MODULE_ID].actorId).toBe('pc-quinn');
    expect({ ren: bondNames('pc-quinn'), kira: bondNames('pc-pat') }).toEqual({ ren: ['Vance Oduya'], kira: [] });
  });

  it("control: a card that names no PC falls back to the confirming GM's — the first PC", async () => {
    await confirmDraftFrom(null);
    expect({ ren: bondNames('pc-quinn'), kira: bondNames('pc-pat') }).toEqual({ ren: [], kira: ['Vance Oduya'] });
  });
});
