/**
 * STARFORGED COMPANION
 * tests/unit/renameOntoKnownPersonRefused.test.js
 *
 * Issue #362 AC40 RENAME-ONTO-KNOWN-PART-NAME (the audit's
 * ent/renameOntoKnownPartName probe; ENT-03).
 *
 * The table knows the NPC "Sable Ortiz" (and the PC "Isaac Sutton"). A
 * placeholder figure "Hooded Figure" is on record. The narration reveals who
 * it is — "the hood comes back: it is Sable" — and the detector answers with
 * the short name the prose used: renames: [{ from: "Hooded Figure", to: "Sable" }].
 *
 * "Never rename onto a name that already belongs to another entity"
 * (applyEntityRenames; decisions.md → "Placeholder figures are renamed in
 * place; genuinely-named entities are never auto-merged"). Since issue #354
 * P2-16 "Sable" IS Sable Ortiz for the detection filter and the draft gate,
 * but the rename's check was the whole-name one: the placeholder card was
 * renamed "Sable" — a second card under the established NPC's name, which the
 * name index and lore routing then took for every "Sable" — and announced.
 * Now the rename is refused as a rename to "Sable Ortiz" is, and the GMs are
 * whispered which known person the reveal named: whether the two are one is
 * theirs to say.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { applyEntityRenames, parseDetectionResponse } from '../../src/entities/entityExtractor.js';

const MODULE = 'starforged-companion';

const npc = (id, name) => global.makeTestActor({
  id, type: 'character', name,
  flags: { [MODULE]: { entityType: 'connection', connection: { _id: `rec-${id}`, name, active: true, generativeTier: [] } } },
});
const CS = () => ({ connectionIds: ['npc-hood', 'npc-sable', 'npc-escort'], dismissedEntities: [], sceneTruths: [], sceneState: { bySubject: {}, sceneId: null } });
const nameOf = (id) => global.game.actors.get(id)?.getFlag(MODULE, 'connection')?.name;
const refusedNotices = () => global.ChatMessage._created.filter(m => /Identity revealed — not renamed/.test(String(m.content ?? '')));
const revealNotices  = () => global.ChatMessage._created.filter(m => m.flags?.[MODULE]?.entityRenameCard);

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
  global.game.actors._set('npc-escort', npc('npc-escort', 'The Escort'));
});

describe("issue #362 AC40 — an identity reveal never renames a placeholder onto a known person's name", () => {
  it('control: a new name is taken — "Hooded Figure" becomes "Vex", announced, and the GMs are not told of a refusal', async () => {
    const applied = await applyEntityRenames([{ from: 'Hooded Figure', to: 'Vex' }], CS());
    expect(applied.map(a => a.to)).toEqual(['Vex']);
    expect(nameOf('npc-hood')).toBe('Vex');
    expect(revealNotices()).toHaveLength(1);
    expect(refusedNotices()).toEqual([]);
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

  it('the GMs are whispered which known person the reveal named — never announced as a reveal', async () => {
    await applyEntityRenames([{ from: 'Hooded Figure', to: 'Sable' }], CS());
    const [notice] = refusedNotices();
    expect(notice, 'the refused-rename notice').toBeTruthy();
    expect(notice.whisper).toEqual(['gm-1']);
    expect(String(notice.content)).toContain('<strong>Hooded Figure</strong> as <strong>Sable</strong>');
    expect(String(notice.content)).toContain('<strong>Sable Ortiz</strong>');
    expect(revealNotices()).toEqual([]);
  });

  it("a player character's name is named as one", async () => {
    await applyEntityRenames([{ from: 'Hooded Figure', to: 'Isaac' }], CS());
    expect(String(refusedNotices()[0]?.content)).toMatch(/player character <strong>Isaac Sutton<\/strong>/);
  });

  it('control: a placeholder is no namesake of its own — "The Escort" may be revealed as "Escort Rhee"', async () => {
    const applied = await applyEntityRenames([{ from: 'The Escort', to: 'Escort Rhee' }], CS());
    expect(applied.map(a => a.to)).toEqual(['Escort Rhee']);
    expect(nameOf('npc-escort')).toBe('Escort Rhee');
  });
});
