/**
 * PROBE SC — LEGACY-XP-OFF-SHEET (PRODUCED-BUT-DEAD / MIRROR-DRIFT)
 *
 * What the user does: fulfils a vow / forges a bond / makes a discovery, so a
 * legacy box fills. The module posts "Quests legacy — box filled: +2 XP
 * earned … Spend it on new assets or upgrades".
 *
 * What happens: the ticks land in `campaignState.legacyTracks` (no module UI
 * renders it) and the XP in each PC's `system.xp` (actorBridge.awardXP). The
 * Starforged character sheet the module pins for PCs
 * (STARFORGED_CHARACTER_SHEET — vendor sf-charactersheet.vue) shows neither:
 * it has no `system.xp` field (that is the classic sheet's header track,
 * vendor character-header.vue `xp-track-classic`); its Legacies tab
 * (sf-legacies.vue → legacy-track.vue) draws each legacy from the PC's own
 * `system.legacies.<track>` ticks and derives "XP earned" from them
 * (2 a box, 1 a box past 40), with `<track>XpSpent` the boxes spent.
 * Nothing in src/ reads or writes `system.legacies` (grep), so the sheet's
 * legacy tracks stay at 0, "XP earned" at 0, and the XP the card promises
 * can neither be seen nor spent on the sheet.
 *
 * What should happen: the shared legacy track is written through to every
 * PC's sheet legacy (`system.legacies.<track>` = cycles × 40 + ticks), where
 * the Starforged sheet shows the boxes and the XP they earned.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addLegacyTicks } from '../../../src/index.js';

const MODULE_ID = 'starforged-companion';

function starforgedPc(id, name) {
  const pc = makeTestActor({ id, name, type: 'character', system: { xp: 0 } });
  // vendor CharacterModel.legacies (subtypes/character.ts) — the Starforged
  // sheet's Legacies tab reads these.
  pc.system.legacies = { quests: 0, questsXpSpent: 0, bonds: 0, bondsXpSpent: 0, discoveries: 0, discoveriesXpSpent: 0 };
  pc.flags.core = { sheetClass: 'ironsworn.StarforgedCharacterSheet' };
  return pc;
}

beforeEach(() => {
  game.actors._reset();
  ChatMessage._reset();
});

describe('PROBE LEGACY-XP-OFF-SHEET', () => {
  it('control: three filled quests boxes award 6 XP to each PC — into system.xp', async () => {
    const kira = starforgedPc('pc-kira', 'Kira');
    const ren  = starforgedPc('pc-ren', 'Ren');
    game.actors._setAll([kira, ren]);
    const cs = { legacyTracks: {} };
    const res = addLegacyTicks(cs, 'quests', 12);
    expect(res.boxes).toBe(3);
    await vi.waitFor(() => expect(ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.legacyXpCard)).toBe(true));
    expect(kira.system.xp).toBe(6);
    expect(ren.system.xp).toBe(6);
  });

  it("the filled boxes reach the Starforged sheet's own legacy track (where its XP is shown and spent)", async () => {
    const kira = starforgedPc('pc-kira', 'Kira');
    const ren  = starforgedPc('pc-ren', 'Ren');
    game.actors._setAll([kira, ren]);
    const cs = { legacyTracks: {} };
    addLegacyTicks(cs, 'quests', 12);
    await vi.waitFor(() => expect(ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.legacyXpCard)).toBe(true));
    // Expected: 12 (3 boxes → "XP earned 6" on the sheet). Actual: 0 — never written.
    expect(kira.system.legacies.quests).toBe(12);
    expect(ren.system.legacies.quests).toBe(12);
  });
});
