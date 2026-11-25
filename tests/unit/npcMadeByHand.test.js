/**
 * STARFORGED COMPANION
 * tests/unit/npcMadeByHand.test.js
 *
 * Issue #362 D10 (DETECTED-PERSON-DROPPED-SILENTLY; the coverage appendix's
 * ENT D1), the maintainer's answer A, part (2): "a GM create path for an NPC
 * card".
 *
 * createConnection's only callers were the detection pass, a draft Confirm,
 * sector creation and the inciting vow, and a character Actor made by hand in
 * the Actors sidebar is taken for a player character (issue #342 Z73): a
 * person the detection never offered — read as someone else, or simply never
 * named — could not be given an NPC card at all. The Entities panel's
 * "＋ New NPC" (GM only) asks for a name and posts a New Entities card with
 * that one row, offered to each player character and No one, so its Confirm
 * makes the NPC as a detected one is made (offerNewPerson → confirmDraft).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as extractor from '../../src/entities/entityExtractor.js';
import { EntityPanelApp } from '../../src/ui/entityPanel.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { StubElement } from '../helpers/cardDom.js';

const MODULE = 'starforged-companion';
const GM_CTX = { requesterIsGM: true, requesterId: 'gm-1' };

const npc = (id, name) => global.makeTestActor({
  id, type: 'character', name,
  flags: { [MODULE]: { entityType: 'connection', connection: { _id: `rec-${id}`, name, active: true, generativeTier: [] } } },
});
const cards = () => global.ChatMessage._created.filter(m => m.flags?.[MODULE]?.draftEntityCard);
/** The GM's create path. */
function offer(person) {
  expect(extractor.offerNewPerson, 'the GM\'s create path').toBeTypeOf('function');
  return extractor.offerNewPerson(person);
}
/** The Entities panel's "＋ New NPC" action. */
function newNpcAction() {
  const action = EntityPanelApp.DEFAULT_OPTIONS.actions.newNpc;
  expect(action, 'the panel\'s New NPC action').toBeTypeOf('function');
  return action;
}
const npcCards = (name) => global.game.actors.filter(a => a.name === name && a.flags?.[MODULE]?.entityType === 'connection');
const bondNames = (actor) => (actor.items.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);

let savedDialog;
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
  global.game.actors._set('pc-kira', global.makeTestActor({ id: 'pc-kira', type: 'character', name: 'Kira' }));
  global.game.actors._set('npc-archer', npc('npc-archer', 'Vuldar Archer'));
  savedDialog = global.foundry.applications.api.DialogV2;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
});
afterEach(() => {
  global.foundry.applications.api.DialogV2 = savedDialog;
  delete globalThis.document;
});

/** The GM types `fields` into the New NPC dialog and presses Add. */
function dialogAnswers(fields) {
  global.foundry.applications.api.DialogV2 = {
    prompt: async ({ ok }) => ok.callback({}, { form: { querySelector: (sel) => {
      const name = /name="(\w+)"/.exec(sel)?.[1];
      return name in fields ? { value: fields[name] } : null;
    } } }),
  };
}

describe('issue #362 D10 (2) — a GM makes an NPC card by hand', () => {
  it('the NPC waits on a New Entities card: Confirm records them, and each player character is offered Make a Connection (D4)', async () => {
    const card = await offer({ name: '  Captain   Sutton ', description: "Isaac's father, a retired hauler." });
    expect(card, 'a card').toBeTruthy();
    const [row] = card.flags[MODULE].drafts;
    expect({ name: row.name, status: row.status, newPerson: row.newPerson, actorIds: card.flags[MODULE].actorIds })
      .toEqual({ name: 'Captain Sutton', status: 'pending', newPerson: true, actorIds: ['pc-isaac', 'pc-kira'] });
    const html = String(card.content);
    expect(html).toMatch(/data-actor-id="pc-isaac"[^>]*>🤝 Make a Connection \(Isaac Sutton\)</);
    expect(html).toMatch(/data-actor-id="pc-kira"[^>]*>🤝 Make a Connection \(Kira\)</);
    expect(html).not.toContain('No one');
  });

  it('its Confirm makes the card and no bond — a name like a known person\'s is the GM\'s to give (D4)', async () => {
    const card = await offer({ name: 'Captain Sutton', description: "Isaac's father." });
    await extractor.applyDraftConfirmFromRelay({ messageId: card.id, draftIndex: 0 }, GM_CTX);
    expect({ cards: npcCards('Captain Sutton').length, kira: bondNames(global.game.actors.get('pc-kira')) })
      .toEqual({ cards: 1, kira: [] });
  });

  it('a name an NPC already has is refused — no card', async () => {
    expect(await offer({ name: 'Vuldar Archer' })).toBeNull();
    expect(cards()).toEqual([]);
  });

  it('a player cannot make one', async () => {
    global.game.user = { isGM: false, id: 'pl-1' };
    expect(await offer({ name: 'Mara Quill' })).toBeNull();
    expect(cards()).toEqual([]);
  });

  it('the Entities panel\'s "＋ New NPC" asks for the name and posts the card (GM only)', async () => {
    const panel = new EntityPanelApp();
    const listHtml = async () => (await panel._renderHTML(await panel._prepareContext({}), {})).outerHTML;
    expect(await listHtml()).toMatch(/data-action="newNpc"[^>]*>＋ New NPC</);

    dialogAnswers({ name: 'Mara Quill', description: 'A tug pilot who owes Kira a favour.' });
    await newNpcAction().call(panel, {}, {});
    expect(cards().map(c => c.flags[MODULE].drafts.map(d => [d.name, d.description, d.status])))
      .toEqual([[['Mara Quill', 'A tug pilot who owes Kira a favour.', 'pending']]]);

    global.game.user = { isGM: false, id: 'pl-1' };
    expect(await listHtml(), 'no button on a player\'s panel').not.toMatch(/data-action="newNpc"/);
  });

  it('control: a dialog closed without a name posts nothing', async () => {
    global.foundry.applications.api.DialogV2 = { prompt: async () => null };
    await newNpcAction().call(new EntityPanelApp(), {}, {});
    expect(cards()).toEqual([]);
  });
});
