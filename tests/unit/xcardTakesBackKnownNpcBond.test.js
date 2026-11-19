/**
 * STARFORGED COMPANION
 * tests/unit/xcardTakesBackKnownNpcBond.test.js
 *
 * Issue #364 DELETED-NPC-NAME-REFERENCES, the X-Card's half (the coverage
 * appendix's ENT D4; the maintainer's ruling: the X-Card takes the bond back).
 *
 * A Make a Connection hit with an NPC the table already knows — Kira's
 * contact Vance, an active listed card — makes no second card: it puts the
 * roller's bond Item on the known NPC (issue #345 AA19). The X-Card's removal
 * of what a narration's Make a Connection made reached only an NPC card the
 * narration created (`createdFromNarrationId`), so an X-Card on Ren's hit
 * with Vance removed the narration and left Ren's bond with Vance on his
 * sheet: CHARACTER STATE and the Connections tab went on listing a connection
 * made by a beat the table had removed.
 *
 * The bond the hit creates on a known NPC now carries the narration's id
 * (`bondedByNarrationId`), and the X-Card takes back the bonds stamped with
 * the removed narrations' ids — that bond alone: Vance's card and Kira's own
 * bond, from before the hit, stay; a bond the table has marked since stays
 * too, and the GMs are told.
 *
 * Single GM client: the real narration card, the real post-narration passes
 * (routeEntityDrafts → connectNamedFigure) and the real suppressScene; only
 * the Claude endpoint is scripted.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { applyNarratorSidecar, postNarrationCard, runPostNarrationPasses } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { readConnections } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-9';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => {
  const contents = ChatMessage._created.slice();
  global.game.messages = { contents, get: (id) => contents.find(m => m.id === id) ?? null };
};

const GM = { id: 'gm-1', isGM: true, active: true };
const NOTHING_NEW = { entities: [], renames: [], worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] } };
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const RELEVANCE = { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' };

let kira, ren, vance, origItemCreate;

/** A bond Item as the module makes one, deletable from its sheet. */
function bondOn(actor, { connectionId, name, current = 0 }) {
  const item = {
    id: `bond-${actor.id}-${connectionId}`, name, type: 'progress', parent: actor,
    system: { subtype: 'bond', rank: 'dangerous', current, completed: false },
    flags: { [MODULE_ID]: { connectionId } },
  };
  item.delete = async () => { const at = actor.items.contents.indexOf(item); if (at >= 0) actor.items.contents.splice(at, 1); };
  item.update = async (changes) => { if ('system.current' in changes) item.system.current = changes['system.current']; return item; };
  actor.items.contents.push(item);
  return item;
}
const bonds = (actor) => actor.items.contents.filter(i => i.type === 'progress' && i.system?.subtype === 'bond');
const stampOf = (item) => item?.flags?.[MODULE_ID]?.bondedByNarrationId ?? null;
const keptNotices = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.xcardBondNotice);

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [], get: () => null };
  global.game.users = Object.assign([GM], { get: (id) => (id === GM.id ? GM : null), filter: (fn) => [GM].filter(fn) });
  global.game.user = GM;
  global.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 9, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: ['npc-vance'], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
  kira  = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
  ren   = makeTestActor({ id: 'pc-ren', name: 'Ren', type: 'character' });
  vance = makeTestActor({ id: 'npc-vance', name: 'Vance', type: 'character', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-vance', name: 'Vance', rank: 'dangerous', role: 'Quartermaster', relationshipTicks: 0, bonded: false, active: true, history: [],
    } } } });
  for (const a of [kira, ren, vance]) game.actors._set(a.id, a);
  bondOn(kira, { connectionId: 'rec-vance', name: 'Vance' });   // Kira's contact, from before the hit
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    if (/You are analysing an Ironsworn: Starforged narration/.test(user)) return reply(JSON.stringify(NOTHING_NEW));
    return reply('{"contradictions":[]}');
  });
  origItemCreate = global.Item.create;
  global.Item.create = async (data, options) => {
    const item = await origItemCreate(data, options);
    item.delete = async () => {
      const list = options?.parent?.items?.contents;
      const i = list?.indexOf(item) ?? -1;
      if (i >= 0) list.splice(i, 1);
    };
    return item;
  };
});
afterEach(() => {
  delete global.ui;
  global.Item.create = origItemCreate;
});

/** A Make a Connection hit, as the move pipeline narrates and captures one, for the PC `actorId`. */
async function hitWithVance(actorId, narrationId = 'nar-mac') {
  await ChatMessage.create({ content: 'I go find Vance.', flags: {} });   // someone spoke: a new beat
  const resolution = { _id: `res-${narrationId}`, moveId: 'make_a_connection', outcome: 'strong_hit', playerNarration: 'I ask Vance to vouch for me with the guild.' };
  const cs = stored();
  const text = applyNarratorSidecar(`Vance looks you over, then nods: the guild will hear of you.\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [] })}\n\`\`\``,
    cs, { narrationId, matchedEntityIds: [] });
  await postNarrationCard(text, resolution, cs, { playerText: resolution.playerNarration, playerName: 'Ren', narrationId });
  syncChat();
  await runPostNarrationPasses(text, resolution, RELEVANCE, stored(), { actorId, narrationId });
  syncChat();
}
const playXCard = async () => { expect(await suppressScene({}, { local: true })).toBe(true); syncChat(); };

describe('issue #364 DELETED-NPC-NAME-REFERENCES — the X-Card takes back the bond a removed hit added to a known NPC', () => {
  it('control: the hit puts Ren\'s bond on the known NPC, stamped with its narration — no second card, Kira\'s bond as it was', async () => {
    await hitWithVance('pc-ren');
    expect(bonds(ren).map(i => i.name)).toEqual(['Vance']);
    expect(stampOf(bonds(ren)[0])).toBe('nar-mac');
    expect(stampOf(bonds(kira)[0]), 'a bond from before the hit carries no stamp').toBeNull();
    expect(game.actors.contents.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection')).toHaveLength(1);
  });

  it('the X-Card on that narration removes Ren\'s bond with Vance', async () => {
    await hitWithVance('pc-ren');
    await playXCard();
    expect(bonds(ren)).toEqual([]);
    // What the narrator's CHARACTER STATE reads off the sheet.
    expect(readConnections(ren).map(c => c.name)).toEqual([]);
  });

  it('Vance\'s card stays, listed, and Kira\'s own bond — from before the hit — is not touched', async () => {
    await hitWithVance('pc-ren');
    await playXCard();
    expect(game.actors.get('npc-vance')).toBeTruthy();
    expect(stored().connectionIds).toEqual(['npc-vance']);
    expect(bonds(kira).map(i => i.name)).toEqual(['Vance']);
    expect(keptNotices()).toEqual([]);
  });

  it('a hit by a PC who already holds the bond adds none, so the X-Card takes none', async () => {
    await hitWithVance('pc-kira');
    expect(bonds(kira)).toHaveLength(1);
    expect(stampOf(bonds(kira)[0])).toBeNull();
    await playXCard();
    expect(bonds(kira).map(i => i.name)).toEqual(['Vance']);
  });

  it('a bond the table has marked since stays, and the GMs are told whose', async () => {
    await hitWithVance('pc-ren');
    bonds(ren)[0].system.current = 8;   // Ren developed the relationship since
    await playXCard();
    expect(bonds(ren).map(i => [i.name, i.system.current])).toEqual([['Vance', 8]]);
    expect(keptNotices()).toHaveLength(1);
    expect(keptNotices()[0].whisper).toEqual(['gm-1']);
    expect(keptNotices()[0].content).toContain('Ren');
    expect(keptNotices()[0].content).toContain('Vance');
  });

  it('control: an X-Card on a later, other narration leaves the hit\'s bond', async () => {
    await hitWithVance('pc-ren');
    await ChatMessage.create({ content: 'I wait.', flags: {} });
    const cs = stored();
    const text = applyNarratorSidecar('The dock lights flicker.\n```json\n{"newTruths":[],"stateChanges":[]}\n```', cs, { narrationId: 'nar-later', matchedEntityIds: [] });
    await postNarrationCard(text, { _id: 'res-later', moveId: 'face_danger', outcome: 'weak_hit', playerNarration: 'I wait.' }, cs,
      { playerText: 'I wait.', playerName: 'Ren', narrationId: 'nar-later' });
    syncChat();
    await playXCard();
    expect(bonds(ren).map(i => i.name)).toEqual(['Vance']);
  });
});
