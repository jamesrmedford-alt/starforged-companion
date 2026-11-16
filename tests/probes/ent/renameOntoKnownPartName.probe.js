/**
 * ENT-03 · RENAME-ONTO-KNOWN-PART-NAME
 *
 * Scenario: the table knows the NPC "Sable Ortiz" (and the PC "Isaac
 * Sutton"). A placeholder figure "Hooded Figure" is on record. The narration
 * reveals who it is — "the hood comes back: it is Sable" — and the detector
 * answers with the short name the prose used:
 * renames: [{ from: "Hooded Figure", to: "Sable" }].
 *
 * Correct: "Never rename onto a name that already belongs to another entity"
 * (applyEntityRenames; decisions.md → "Placeholder figures are renamed in
 * place; genuinely-named entities are never auto-merged"). Since issue #354
 * P2-16 "Sable" IS Sable Ortiz for the detection filter and the draft gate
 * (nameMatch.personNameMatch), so the rename is refused as a rename to "Sable
 * Ortiz" is: no second card answers to her name.
 *
 * Today: applyEntityRenames asks entityExistsAnyType(to, state) without the
 * `type: "connection"` that turns the part-name rule on, so the placeholder
 * card is renamed "Sable" — a second card under the established NPC's name,
 * which the name index and lore routing then take for every "Sable" (the
 * whole-name match wins), and announces it ("Hooded Figure is now known as
 * Sable").
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { applyEntityRenames, parseDetectionResponse } from '../../../src/entities/entityExtractor.js';

const MODULE = 'starforged-companion';

const npc = (id, name) => global.makeTestActor({
  id, type: 'character', name,
  flags: { [MODULE]: { entityType: 'connection', connection: { _id: `rec-${id}`, name, active: true, generativeTier: [] } } },
});
const CS = () => ({ connectionIds: ['npc-hood', 'npc-sable'], dismissedEntities: [], sceneTruths: [], sceneState: { bySubject: {}, sceneId: null } });
const nameOf = (id) => global.game.actors.get(id)?.getFlag(MODULE, 'connection')?.name;

beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'gm-1' };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.ChatMessage._reset();
  global.game.messages = { contents: [], get: () => null };
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE}.campaignState`, CS());
  global.game.actors._set('pc-isaac', global.makeTestActor({ id: 'pc-isaac', type: 'character', name: 'Isaac Sutton' }));
  global.game.actors._set('npc-hood', npc('npc-hood', 'Hooded Figure'));
  global.game.actors._set('npc-sable', npc('npc-sable', 'Sable Ortiz'));
});

describe('ENT-03 — an identity reveal never renames a placeholder onto a known person\'s name', () => {
  it('control: a new name is taken — "Hooded Figure" becomes "Vex"', async () => {
    const applied = await applyEntityRenames([{ from: 'Hooded Figure', to: 'Vex' }], CS());
    expect(applied.map(a => a.to)).toEqual(['Vex']);
    expect(nameOf('npc-hood')).toBe('Vex');
  });

  it('control: the established NPC\'s whole name is refused — the placeholder stays', async () => {
    const applied = await applyEntityRenames([{ from: 'Hooded Figure', to: 'Sable Ortiz' }], CS());
    expect(applied).toEqual([]);
    expect(nameOf('npc-hood')).toBe('Hooded Figure');
  });

  it('control: the detection filter already reads "Sable" as Sable Ortiz (P2-16)', () => {
    const raw = JSON.stringify({ entities: [{ type: 'connection', name: 'Sable', description: 'x', confidence: 'high' }], renames: [], worldJournal: {} });
    expect(parseDetectionResponse(raw, CS()).entities).toEqual([]);
  });

  it('her short name is refused too — no second card called "Sable"', async () => {
    const applied = await applyEntityRenames([{ from: 'Hooded Figure', to: 'Sable' }], CS());
    expect({ applied: applied.map(a => a.to), placeholder: nameOf('npc-hood') })
      .toEqual({ applied: [], placeholder: 'Hooded Figure' });
  });

  it('nor is a placeholder renamed onto a player character\'s first name', async () => {
    const applied = await applyEntityRenames([{ from: 'Hooded Figure', to: 'Isaac' }], CS());
    expect({ applied: applied.map(a => a.to), placeholder: nameOf('npc-hood') })
      .toEqual({ applied: [], placeholder: 'Hooded Figure' });
  });
});
