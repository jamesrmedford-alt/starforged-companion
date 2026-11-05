/**
 * STARFORGED COMPANION
 * tests/unit/regenerateKeepsNotesPortrait.test.js
 *
 * Issue #322 V30 (the audit's regenerateStripsNotesPortrait probe,
 * REGENERATE-STRIPS-NOTES-PORTRAIT): the art pipeline embeds a large copy of a
 * connection's (and a ship's) portrait at the top of its Notes. ↻ Regenerate
 * flavour runs finalizeEntity(…, { force: true }) → seedConnectionActor /
 * seedStarshipActor, which wrote `system.notes` from scratch; generatePortrait
 * then returned the record's existing asset without attaching it again
 * (generate-once), so the embedded portrait was gone from Notes for good.
 * The seeds keep the old Notes' portrait block now — since issue #338 D4 as
 * they keep everything on the tab but their own marked introduction
 * (entities/seedIntro.js writeSeedIntro).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/art/storage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadArtAsset: vi.fn(async (id) => ({ _id: id, locked: false, regenerationUsed: false })),
}));

import { finalizeEntity } from '../../src/entities/finalize.js';
import { markSeedIntro, writeSeedIntro } from '../../src/entities/seedIntro.js';

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
    // The introduction an earlier seed wrote, marked as the seed's own (issue #338 D4).
    system: { notes: `${PORTRAIT}${markSeedIntro('<p>Sable weighs you up from behind a salvage counter.</p>')}` },
    flags: { [MODULE]: { entityType: 'connection', entityId: 'rec-1', connection: {
      _id: 'rec-1', name: 'Sable Ortiz', role: 'Salvage broker', goal: 'Pay off a debt', firstLook: ['Scarred hands'],
      disposition: 'Wary', pronouns: 'she/her', seeded: true, finalizedAt: '2026-10-01T00:00:00.000Z',
      portraitId: 'art-1', portraitSourceDescription: 'a woman. Scarred hands. Salvage broker',
    } } },
  });
  global.game.actors._set(npc.id, npc);
});

describe('Regenerate flavour keeps the embedded portrait (REGENERATE-STRIPS-NOTES-PORTRAIT)', () => {
  it("Regenerate flavour keeps the NPC card's embedded portrait", async () => {
    const result = await finalizeEntity('connection', 'npc-1', {}, { force: true });
    expect(result.ok).toBe(true);

    const notes = String(global.game.actors.get('npc-1').system.notes ?? '');
    expect(notes).toContain('npc-1-art-1.png');
  });
  it("the new Notes replace the old prose under the kept portrait — one block, not two", async () => {
    await finalizeEntity('connection', 'npc-1', {}, { force: true });
    const notes = String(global.game.actors.get('npc-1').system.notes ?? '');
    expect(notes.startsWith('<div class="sf-ship-portrait"')).toBe(true);
    expect(notes.match(/sf-ship-portrait/g)).toHaveLength(1);
    expect(notes).not.toContain('weighs you up from behind a salvage counter');
  });
});

describe("writeSeedIntro keeps the portrait block", () => {
  const BLOCK = '<div class="sf-ship-portrait"><img src="a.png"/></div>';
  const intro = markSeedIntro("<p>new</p>");
  it("carries the old block onto new Notes, once", () => {
    expect(writeSeedIntro(`${BLOCK}${markSeedIntro("<p>old</p>")}`, intro)).toBe(`${BLOCK}${intro}`);
    expect(writeSeedIntro(`${BLOCK}<p>mine</p>`, intro)).toBe(`${BLOCK}${intro}<p>mine</p>`);
  });
  it("old Notes with no block get the introduction at their top", () => {
    expect(writeSeedIntro(markSeedIntro("<p>old</p>"), intro)).toBe(intro);
    expect(writeSeedIntro(undefined, intro)).toBe(intro);
  });
});
