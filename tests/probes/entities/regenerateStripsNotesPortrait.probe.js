/**
 * PROBE — REGENERATE-STRIPS-NOTES-PORTRAIT
 *
 * The art pipeline embeds a large copy of a connection's (and a ship's)
 * portrait at the top of its Notes tab (art/generator.js
 * attachPortraitToActor → withPortraitInNotes, the `sf-ship-portrait`
 * block). The Entity Panel's "Regenerate flavour" runs
 * finalizeEntity(type, id, cs, { force: true }) → seedConnectionActor /
 * seedStarshipActor, which write `system.notes` from scratch (the new intro
 * or the oracle bullet list) and then call generatePortrait — which, the
 * record already holding a portraitId, returns the existing asset WITHOUT
 * re-attaching it (generate-once policy). The embedded portrait is gone from
 * Notes for good; nothing puts it back.
 *
 * Correct behaviour (asserted): regenerating an NPC card's flavour keeps
 * the portrait at the top of its Notes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/art/storage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadArtAsset: vi.fn(async (id) => ({ _id: id, locked: false, regenerationUsed: false })),
}));

import { finalizeEntity } from '../../../src/entities/finalize.js';

const MODULE = 'starforged-companion';
const PORTRAIT = '<div class="sf-ship-portrait" style="text-align:center;margin-bottom:0.5em;">' +
  '<img src="worlds/test/npc-1-art-1.png" alt="Ship portrait" style="max-width:100%;border-radius:6px;"/></div>';

beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.game.settings._store.set(`${MODULE}.openRouterApiKey`, 'sk-or-test');
  global.game.settings._store.delete(`${MODULE}.claudeApiKey`);   // no Claude key → oracle-list Notes
  const npc = global.makeTestActor({
    id: 'npc-1', type: 'character', name: 'Sable Ortiz',
    system: { notes: `${PORTRAIT}<p>Sable weighs you up from behind a salvage counter.</p>` },
    flags: { [MODULE]: { entityType: 'connection', entityId: 'rec-1', connection: {
      _id: 'rec-1', name: 'Sable Ortiz', role: 'Salvage broker', goal: 'Pay off a debt', firstLook: ['Scarred hands'],
      disposition: 'Wary', pronouns: 'she/her', seeded: true, finalizedAt: '2026-10-01T00:00:00.000Z',
      portraitId: 'art-1', portraitSourceDescription: 'a woman. Scarred hands. Salvage broker',
    } } },
  });
  global.game.actors._set(npc.id, npc);
});

describe('PROBE REGENERATE-STRIPS-NOTES-PORTRAIT', () => {
  it("Regenerate flavour keeps the NPC card's embedded portrait", async () => {
    const result = await finalizeEntity('connection', 'npc-1', {}, { force: true });
    expect(result.ok).toBe(true);

    const notes = String(global.game.actors.get('npc-1').system.notes ?? '');
    expect(notes).toContain('npc-1-art-1.png');
  });
});
