/**
 * STARFORGED COMPANION
 * tests/unit/detectedPersonReadAsKnown.test.js
 *
 * Issue #362 D10 (DETECTED-PERSON-DROPPED-SILENTLY; the coverage appendix's
 * ENT D1 and D8), the maintainer's answer A, part (1): "New Entities card
 * lists a detected person read as a known one ("read as <known>") with a
 * "No — a new person" button".
 *
 * Since issue #354 P2-16 the detection filter and the draft gate read a
 * person the table knows under part of their name or a near spelling as that
 * person — "Archer" for Vuldar Archer, "Captain Sutton" for the PC Isaac
 * Sutton — and dropped them with no row and no notice: a PC's father
 * introduced by title and surname never got a card, and nothing told the GM.
 * Such a person is now listed on the card as read as the known one, with a
 * "No — a new person" button that makes them a pending row (`newPerson`).
 *
 * D8: a Confirm's own gate was the whole name — two names for one person in
 * one reply made two rows, and a stale "Archer" row pressed after "Vuldar
 * Archer" was made a second card and a second bond. A later name of one
 * reply is read as the earlier one, and Confirm reads the row as the known
 * person instead of making them twice (a row the GM made a new person is
 * made).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as extractor from '../../src/entities/entityExtractor.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE = 'starforged-companion';
const GM_CTX = { requesterIsGM: true, requesterId: 'gm-1' };

const npc = (id, name) => global.makeTestActor({
  id, type: 'character', name,
  flags: { [MODULE]: { entityType: 'connection', connection: { _id: `rec-${id}`, name, active: true, generativeTier: [] } } },
});
const person = (name, description = 'Someone on the comm.') => ({ type: 'connection', name, description, confidence: 'high' });
const cards = () => global.ChatMessage._created.filter(m => m.flags?.[MODULE]?.draftEntityCard);
/** The capture's New Entities card (asserted posted). */
function firstCard() {
  const [card] = cards();
  expect(card, 'a New Entities card').toBeTruthy();
  return card;
}
const rows = (card) => card.flags[MODULE].drafts.map(d => ({ name: d.name, status: d.status, readAs: d.readAs ?? null }));
const npcCards = (name) => global.game.actors.filter(a => a.name === name && a.flags?.[MODULE]?.entityType === 'connection');
const state = () => global.game.settings.get(MODULE, 'campaignState');
/** The GM's "No — a new person" press, as the relay hands it to the canonical GM. */
function newPerson(payload, ctx) {
  expect(extractor.applyDraftNewPersonFromRelay, 'the "No — a new person" handler').toBeTypeOf('function');
  return extractor.applyDraftNewPersonFromRelay(payload, ctx);
}

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'gm-1' };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.ChatMessage._reset();
  global.game.messages = {
    get contents() { return global.ChatMessage._created; },
    get: (id) => global.ChatMessage._created.find(m => m.id === id) ?? null,
  };
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE}.campaignState`, { ...CampaignStateSchema, connectionIds: ['npc-archer'], dismissedEntities: [] });
  global.game.settings._store.set(`${MODULE}.autoSeedConnection`, false);
  global.game.actors._set('pc-isaac', global.makeTestActor({ id: 'pc-isaac', type: 'character', name: 'Isaac Sutton' }));
  global.game.actors._set('npc-archer', npc('npc-archer', 'Vuldar Archer'));
});

describe('issue #362 D10 (1) — a detected person read as a known one is listed, not dropped', () => {
  it("a PC's father introduced by title and surname is listed as read as the player character, with \"No — a new person\"", async () => {
    const { queued } = await extractor.routeEntityDrafts([person('Captain Sutton', "Isaac's father, a retired hauler.")], state(),
      { autoCreateConnection: false, actorId: 'pc-isaac' });
    expect(queued).toEqual([]);
    const card = firstCard();
    expect(rows(card)).toEqual([{ name: 'Captain Sutton', status: 'known', readAs: 'Isaac Sutton' }]);
    const html = String(card.content);
    expect(html).toMatch(/Read as the player character <strong>Isaac Sutton<\/strong>/);
    expect(html).toMatch(/data-action="sf-draft-new-person"[^>]*data-index="0"[^>]*>No — a new person</);
    expect(html, 'not offered: no Confirm on the row').not.toMatch(/data-action="sf-draft-confirm"/);
  });

  it('the parse hands on the person it read as known; the capture lists them', async () => {
    const raw = JSON.stringify({ entities: [person('Archer', 'The dockmaster, gruff as ever.')], renames: [], worldJournal: {} });
    const detection = extractor.parseDetectionResponse(raw, state());
    expect(detection.entities).toEqual([]);
    expect((detection.readAs ?? []).map(e => [e.name, e.readAs])).toEqual([['Archer', 'Vuldar Archer']]);
    await extractor.routeEntityDrafts(detection.entities, state(), { autoCreateConnection: false, readAs: detection.readAs });
    expect(rows(firstCard())).toEqual([{ name: 'Archer', status: 'known', readAs: 'Vuldar Archer' }]);
  });

  it('control: someone who shares no name with anyone known is offered as before', async () => {
    const { queued } = await extractor.routeEntityDrafts([person('Ilsa Marr')], state(), { autoCreateConnection: false });
    expect(queued.map(e => e.name)).toEqual(['Ilsa Marr']);
    expect(rows(firstCard())).toEqual([{ name: 'Ilsa Marr', status: 'pending', readAs: null }]);
  });

  it('control: the known person\'s own name is still dropped silently — a duplicate, not a reading', async () => {
    await extractor.routeEntityDrafts([person('Vuldar Archer')], state(), { autoCreateConnection: false });
    expect(cards()).toEqual([]);
  });

  it('a person read as known is listed once: the narration that keeps using the short name adds no second row', async () => {
    await extractor.routeEntityDrafts([person('Archer')], state(), { autoCreateConnection: false });
    await extractor.routeEntityDrafts([person('Archer')], state(), { autoCreateConnection: false });
    expect(cards()).toHaveLength(1);
  });

  it('"No — a new person" makes the row a pending one; its Confirm makes the NPC card', async () => {
    await extractor.routeEntityDrafts([person('Captain Sutton', "Isaac's father, a retired hauler.")], state(),
      { autoCreateConnection: false, actorId: 'pc-isaac' });
    const card = firstCard();
    expect(await newPerson({ messageId: card.id, draftIndex: 0 }, GM_CTX)).toEqual({ applied: true });
    const row = card.flags[MODULE].drafts[0];
    expect({ status: row.status, newPerson: row.newPerson, readAs: row.readAs ?? null })
      .toEqual({ status: 'pending', newPerson: true, readAs: null });
    expect(String(card.content), 'now offered: whose connection, or No one').toMatch(/data-action="sf-draft-confirm"/);

    await extractor.applyDraftConfirmFromRelay({ messageId: card.id, draftIndex: 0, pick: '' }, GM_CTX);
    expect(npcCards('Captain Sutton'), 'the new person\'s card').toHaveLength(1);
    expect(card.flags[MODULE].drafts[0].status).toBe('confirmed');
  });

  it('"No — a new person" is a GM\'s press only — a player\'s relay changes nothing', async () => {
    await extractor.routeEntityDrafts([person('Archer')], state(), { autoCreateConnection: false });
    const card = firstCard();
    expect(await newPerson({ messageId: card.id, draftIndex: 0 }, { requesterIsGM: false, requesterId: 'pl-1' }))
      .toEqual({ applied: false });
    expect(card.flags[MODULE].drafts[0].status).toBe('known');
  });

  it('the X-Card withdraws a removed narration\'s read-as rows too', async () => {
    await extractor.routeEntityDrafts([person('Archer')], state(), { autoCreateConnection: false, narrationId: 'nar-1' });
    expect(await extractor.withdrawNarrationDrafts(['nar-1'])).toBe(1);
    expect(firstCard().flags[MODULE].drafts[0].status).toBe('xCarded');
  });
});

describe('issue #362 D10 (1) — the coverage\'s D8: one person is never made twice by a Confirm', () => {
  it('two names for one person in one reply: the fuller is offered, the shorter is read as them', async () => {
    const { queued } = await extractor.routeEntityDrafts([person('Mara Quill', 'A tug pilot.'), person('Quill', 'The pilot.')], state(),
      { autoCreateConnection: false });
    expect(queued.map(e => e.name)).toEqual(['Mara Quill']);
    expect(rows(firstCard())).toEqual([
      { name: 'Mara Quill', status: 'pending', readAs: null },
      { name: 'Quill', status: 'known', readAs: 'Mara Quill' },
    ]);
  });

  it('a stale "Archer" row pressed after Vuldar Archer was made: no second card — the row is read as him', async () => {
    // The row was posted before Vuldar Archer was on record.
    global.game.settings._store.set(`${MODULE}.campaignState`, { ...state(), connectionIds: [] });
    await extractor.routeEntityDrafts([person('Archer')], state(), { autoCreateConnection: false, actorId: 'pc-isaac' });
    global.game.settings._store.set(`${MODULE}.campaignState`, { ...state(), connectionIds: ['npc-archer'] });
    const card = firstCard();
    expect(card.flags[MODULE].drafts[0].status, 'pending (setup)').toBe('pending');

    await extractor.applyDraftConfirmFromRelay({ messageId: card.id, draftIndex: 0 }, GM_CTX);
    expect({ archers: npcCards('Archer').length, row: rows(card)[0] })
      .toEqual({ archers: 0, row: { name: 'Archer', status: 'known', readAs: 'Vuldar Archer' } });
  });
});
