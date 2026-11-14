/* global makeTestActor -- tests/setup.js and Node globals, as in tests/unit */
/**
 * Issue #342 D3 ROUND-DRAFT-BOND-HOLDER — the maintainer's ruling A (the
 * eleventh audit's NARR-D1 / BATCH-D1).
 *
 * A move narration's capture is handed the roller's PC (`actorId`, issue
 * #321 U23): a detected NPC's draft card carries it, and its Confirm files the
 * new connection (and its bond Item) on that PC's sheet. A round's narration
 * is several PCs', and the module cannot tell from the detection which of
 * them met whom; its capture used to hand the card the first entry's PC, so
 * Ren's smuggler was filed on Kira's sheet because Kira confirmed first.
 * Ruling A: the round's draft card carries every acting PC (`actorIds`), and a
 * connection row's Confirm asks which of them the NPC is a connection of — a
 * button per acting PC — or none, checked against the card's own choices as
 * the connection pickers check theirs. (BATCH-D1's probe asserted its own
 * option B, the discovery roller's PC; it is rewritten to the ruling.)
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { routeEntityDrafts, registerDraftCardHooks } from '../../src/entities/entityExtractor.js';
import { createConnection } from '../../src/entities/connection.js';
import { narrateRound } from '../../src/narration/narrator.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';
import { parseHTML, StubElement } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => {
  const contents = ChatMessage._created.slice();
  global.game.messages = { contents, get: (id) => contents.find(m => m.id === id) ?? null };
};

const REN_GATHER_STRONG = {
  kind: 'move', moveId: 'gather_information', moveName: 'Gather Information', statUsed: 'wits',
  outcome: 'strong_hit', outcomeLabel: 'Strong Hit', isMatch: false, loremasterContext: 'Gather Information: strong hit.',
  oracleSeeds: null, relevance: { resolvedClass: 'discovery', entityIds: [], entityTypes: [] }, resolutionId: 'res-r',
};
const DOSS  = { name: 'Doss', type: 'connection', description: 'An old mechanic.', confidence: 'high' };
const CHOIR = { name: 'The Iron Choir', type: 'faction', description: 'A guild of hull-singers.', confidence: 'high' };

function roundOf(order) {
  return {
    id: 'round-1', number: 1, phase: 'narrating', acting: order,
    entries: {
      'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I keep watch on the docking ring.', rolled: { narrationInput: { kind: 'narrative' } } },
      'pl-2': { userId: 'pl-2', actorId: 'pc-ren', actorName: 'Ren', text: 'I pull the manifest for who docked last night.', rolled: { narrationInput: REN_GATHER_STRONG } },
    },
  };
}

function installPc(id, name) {
  const pc = makeTestActor({ id, type: 'character', name, hasPlayerOwner: true, system: {}, items: { contents: [] } });
  game.actors._set(id, pc);
  invalidateActorCache(id);
  return pc;
}

const bondsOf = (id) => (game.actors.get(id)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);
const connectionActors = (name) => game.actors.contents.filter(a => a?.flags?.[MODULE_ID]?.entityType === 'connection' && a.name === name);
const draftCard = () => ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.draftEntityCard);
const rowStatus = (name) => game.messages.get(draftCard().id).flags[MODULE_ID].drafts.find(d => d.name === name)?.status;

/** The GM presses a button on the rendered card. */
async function press(selector) {
  const card = game.messages.get(draftCard().id);
  const root = parseHTML(card.content);
  Hooks.call('renderChatMessageHTML', card, [root]);
  const btn = root.querySelector(selector);
  expect(btn, selector).toBeTruthy();
  const statuses = () => JSON.stringify(game.messages.get(draftCard().id).flags[MODULE_ID].drafts.map(d => d.status ?? 'pending'));
  const before = statuses();
  btn.click();
  // The press runs through awaited writes and lazily imported modules, and a
  // first import takes real time (a cold run of this file alone took ~450 ms
  // to mark its row): wait until a row's status changes, or — for a press
  // that marks nothing — for a bounded while, then let the rest settle.
  const deadline = Date.now() + 1500;
  while (statuses() === before && Date.now() < deadline) await new Promise(r => setTimeout(r, 5));
  for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0));
}

let origHTMLElement;
beforeAll(() => {
  origHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  registerDraftCardHooks();
});
afterAll(() => {
  if (origHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = origHTMLElement;
});

const GM = { id: 'gm-1', isGM: true, active: true };
beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  game.settings._store.set(KEY, {
    currentSessionId: 's1', sessionNumber: 1, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, dismissedEntities: [],
    connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
  global.game.users = Object.assign([GM], { get: (id) => (id === GM.id ? GM : null), filter: (fn) => [GM].filter(fn) });
  global.game.user = GM;
  global.game.messages = { contents: [], get: () => null };
  global.ui = { notifications: { warn: vi.fn(), info: () => {}, error: () => {} } };
  apiPost.mockImplementation(async () => ({ content: [{ type: 'text', text: '{}' }], usage: {}, stop_reason: 'end_turn' }));
  installPc('pc-kira', 'Kira');
  installPc('pc-ren', 'Ren');
});
afterEach(() => { delete global.ui; });

describe("D3 — a round's capture hands its draft card every acting PC (BATCH-D1, rewritten to ruling A)", () => {
  const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'end_turn' });

  /** The round narrated and captured; the card its capture posted. */
  async function roundDraftCard(order) {
    apiPost.mockImplementation(async (_url, _headers, body) => {
      const user = String(body?.messages?.[0]?.content ?? '');
      if (/You are analysing an Ironsworn: Starforged narration/.test(user)) {
        return reply(JSON.stringify({ entities: [{ ...DOSS, name: 'Vess', description: 'A smuggler who docked at midnight.' }], renames: [], worldJournal: {} }));
      }
      return reply('Kira watches the ring; Ren finds that Vess, a smuggler, docked at midnight.\n```json\n{"newTruths":[],"stateChanges":[]}\n```');
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await narrateRound({ round: roundOf(order), campaignState: stored() });
      await vi.advanceTimersByTimeAsync(3000);   // the discovery-class detection fires ~2 s after the card
    } finally {
      vi.useRealTimers();
    }
    return ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.draftEntityCard);
  }

  it.each([
    ['Kira (no roll) confirmed first', ['pl-1', 'pl-2'], ['pc-kira', 'pc-ren']],
    ['Ren (the discovering move) confirmed first', ['pl-2', 'pl-1'], ['pc-ren', 'pc-kira']],
  ])('%s — the draft is filed under neither: it carries both acting PCs', async (_label, order, expected) => {
    const card = await roundDraftCard(order);
    expect(card?.flags[MODULE_ID].drafts.map(d => d.name)).toEqual(['Vess']);
    expect(card.flags[MODULE_ID].actorIds).toEqual(expected);
    expect(card.flags[MODULE_ID].actorId).toBeUndefined();   // was: 'pc-kira' when Kira confirmed first
  });
});

describe("D3 — a round card's connection row asks whose connection the NPC is", () => {
  const postRoundCard = () => routeEntityDrafts([DOSS, CHOIR], stored(), { actorIds: ['pc-kira', 'pc-ren'], narrationId: 'nar-round' })
    .then(syncChat);

  it('the connection row offers each acting PC and No one; another type keeps its one Confirm', async () => {
    await postRoundCard();
    const root = parseHTML(draftCard().content);
    const rows = root.querySelectorAll('.sf-draft-row');
    const dossButtons = [...rows[0].querySelectorAll('[data-action="sf-draft-confirm"]')].map(b => [b.dataset.actorId, b.textContent]);
    expect(dossButtons).toEqual([['pc-kira', 'Kira'], ['pc-ren', 'Ren'], ['', 'No one']]);
    expect(rows[0].textContent).toContain('Confirm — whose connection?');
    const choirButtons = [...rows[1].querySelectorAll('[data-action="sf-draft-confirm"]')].map(b => b.textContent);
    expect(choirButtons).toEqual(['Confirm']);
  });

  it("the GM picks Ren: Doss is Ren's connection, not the first entry's", async () => {
    await postRoundCard();
    await press('[data-action="sf-draft-confirm"][data-index="0"][data-actor-id="pc-ren"]');
    expect(connectionActors('Doss')).toHaveLength(1);
    expect(bondsOf('pc-ren')).toEqual(['Doss']);
    expect(bondsOf('pc-kira')).toEqual([]);
    expect(rowStatus('Doss')).toBe('confirmed');
    // The card re-renders still asking for the row that is left (here: none — a faction row has one Confirm).
    expect(game.messages.get(draftCard().id).content).not.toMatch(/data-index="0"/);
  });

  it('No one: Doss is made with no bond on any sheet', async () => {
    await postRoundCard();
    await press('[data-action="sf-draft-confirm"][data-index="0"][data-actor-id=""]');
    expect(connectionActors('Doss')).toHaveLength(1);
    expect(bondsOf('pc-ren')).toEqual([]);
    expect(bondsOf('pc-kira')).toEqual([]);
    expect(rowStatus('Doss')).toBe('confirmed');
  });

  it('a press naming no PC the card offers creates nothing, and says why', async () => {
    await postRoundCard();
    const card = game.messages.get(draftCard().id);
    card.content = card.content.replace('data-actor-id="pc-ren"', 'data-actor-id="pc-stranger"');
    await press('[data-action="sf-draft-confirm"][data-index="0"][data-actor-id="pc-stranger"]');
    expect(connectionActors('Doss')).toEqual([]);
    expect(rowStatus('Doss')).toBe('pending');
    expect(global.ui.notifications.warn).toHaveBeenCalled();
  });

  it('a Doss made meanwhile (another GM, or a refused Confirm the world load listed): the pick still puts the bond on the PC picked', async () => {
    await postRoundCard();
    await createConnection({ name: 'Doss', description: 'An old mechanic.' }, stored());
    await press('[data-action="sf-draft-confirm"][data-index="0"][data-actor-id="pc-kira"]');
    expect(connectionActors('Doss')).toHaveLength(1);
    expect(bondsOf('pc-kira')).toEqual(['Doss']);
    expect(bondsOf('pc-ren')).toEqual([]);
  });

  it("re-rendered after another row's Confirm, the connection row still asks", async () => {
    await postRoundCard();
    await press('[data-action="sf-draft-confirm"][data-index="1"]');   // the faction row
    expect(rowStatus('The Iron Choir')).toBe('confirmed');
    const content = game.messages.get(draftCard().id).content;
    expect(content).toContain('Confirm — whose connection?');
    expect(content).toMatch(/data-index="0" data-actor-id="pc-ren">Ren</);
  });

  // Issue #354 P2-16 amends D3's "free-flow cards keep their one Confirm": a
  // free-flow card's person row offers its narration's PC by name, and "No
  // one" — a Confirm that always bonded put a hostile stranger on a PC's sheet.
  it("a free-flow card carries its narration's PC: its row offers that PC, whose button bonds them, and No one", async () => {
    await routeEntityDrafts([DOSS], stored(), { actorId: 'pc-ren', narrationId: 'nar-move' }).then(syncChat);
    expect(draftCard().flags[MODULE_ID]).toMatchObject({ actorId: 'pc-ren' });
    expect(draftCard().flags[MODULE_ID].actorIds).toBeUndefined();
    const content = draftCard().content;
    expect(content).toContain('Confirm — whose connection?');
    expect(content).toMatch(/data-index="0" data-actor-id="pc-ren">Ren</);
    expect(content).toMatch(/data-actor-id=""[^>]*>No one</);
    expect(content).not.toMatch(/data-actor-id="pc-kira"/);
    await press('[data-action="sf-draft-confirm"][data-index="0"]');
    expect(bondsOf('pc-ren')).toEqual(['Doss']);
  });

  it('No one on a free-flow card: the person is made with no bond on any sheet', async () => {
    await routeEntityDrafts([DOSS], stored(), { actorId: 'pc-ren', narrationId: 'nar-move' }).then(syncChat);
    await press('.sf-draft-no-bond');
    expect(rowStatus('Doss')).toBe('confirmed');
    expect(bondsOf('pc-ren')).toEqual([]);
    expect(bondsOf('pc-kira')).toEqual([]);
  });
});
