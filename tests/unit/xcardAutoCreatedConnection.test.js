/**
 * STARFORGED COMPANION
 * tests/unit/xcardAutoCreatedConnection.test.js
 *
 * Issue #338 D6(ii) (option A, narrowed) — the X-Card on a Make a Connection
 * narration takes away the connection it created while nobody has used it.
 *
 * A Make a Connection hit's narration introduces Vex; the post-narration pass
 * (runPostNarrationPasses → runDiscoveryDetection → routeEntityDrafts with
 * autoCreateConnection) creates her as a connection Actor with the
 * narration's description and a bond Item on the roller's sheet. The X-Card
 * used to leave all of it: no narration id on the record, and
 * retractNarrationCapture never looks at Actors. The record now carries
 * `createdFromNarrationId`, and the X-Card's finish deletes the Actor, its
 * bond Item and its `connectionIds` entry when the record holds nothing
 * beyond its creation and the Item no ticks; otherwise the connection stays
 * and the GMs are whispered once, naming it (option B's notice).
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { applyNarratorSidecar, postNarrationCard, runPostNarrationPasses } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { listConnections, addHistoryEntry } from '../../src/entities/connection.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => {
  const contents = ChatMessage._created.slice();
  global.game.messages = { contents, get: (id) => contents.find(m => m.id === id) ?? null };
};

const GM = { id: 'gm-1', isGM: true, active: true };
const PL = { id: 'pl-1', isGM: false, active: true };

const PROSE = 'Vex meets you under the gantry — a smuggler who runs the lower docks, and who already knows your name.';
const SIDECAR = {
  newTruths:    [{ subject: 'Vex', fact: 'Runs the lower docks' }],
  stateChanges: [],
  sceneFrame:   { location: 'the lower docks', present: ['Kira', 'Vex'], situation: 'A first meeting' },
};
const DETECTION = {
  entities: [{ type: 'connection', name: 'Vex', description: 'A smuggler who runs the lower docks.', pronouns: 'she/her', role: 'smuggler', goal: null, confidence: 'high' }],
  renames:  [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
};
const RESOLUTION = { _id: 'res-vex', moveId: 'make_a_connection', outcome: 'strong_hit', playerNarration: 'I look for a smuggler who knows the docks.' };
const RELEVANCE  = { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' };

const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

let notices, kira, origActorCreate, origItemCreate;
beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [], get: () => null };
  global.game.users = Object.assign([GM, PL], { get: (id) => [GM, PL].find(u => u.id === id) ?? null });
  global.game.user = GM;
  notices = [];
  global.ui = { notifications: { warn: (m) => notices.push(m), info: (m) => notices.push(m), error: (m) => notices.push(m) } };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
  kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character', ownership: { 'pl-1': 3 } });
  game.actors._set('pc-kira', kira);
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    if (/You are analysing an Ironsworn: Starforged narration/.test(user)) return reply(JSON.stringify(DETECTION));
    return reply('{"contradictions":[]}');
  });

  // Foundry's Document#delete for the Actors and Items the pass creates.
  origActorCreate = global.Actor.create;
  origItemCreate  = global.Item.create;
  global.Actor.create = async (data) => {
    const actor = await origActorCreate(data);
    actor.delete = async () => { game.actors._setAll(game.actors.contents.filter(a => a !== actor)); };
    return actor;
  };
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
  global.Actor.create = origActorCreate;
  global.Item.create  = origItemCreate;
});

const connectionsNamed = (name) => listConnections(stored()).filter(c => c.name === name);
const vexActors  = () => game.actors.contents.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
const kiraBonds  = () => kira.items.contents.filter(i => i.system?.subtype === 'bond');
/** A GM-facing word after the X-Card naming the connection: a card posted since `sinceCount` messages existed, or a notification. */
function gmsToldAbout(name, sinceCount) {
  const after = ChatMessage._created.slice(sinceCount);
  const onACard = after.some(m => new RegExp(`\\b${name}\\b`).test(String(m.content ?? '')));
  const asANotice = notices.some(n => new RegExp(`\\b${name}\\b`).test(String(n)));
  return onACard || asANotice;
}

/** The Make a Connection narration and its synchronous capture (the hit creates Vex). */
async function makeAConnection() {
  const cs = stored();
  const text = applyNarratorSidecar(`${PROSE}\n\`\`\`json\n${JSON.stringify(SIDECAR)}\n\`\`\``, cs, { narrationId: 'nar-vex', matchedEntityIds: [] });
  await postNarrationCard(text, RESOLUTION, cs, { playerText: RESOLUTION.playerNarration, playerName: 'Kira', narrationId: 'nar-vex' });
  await runPostNarrationPasses(text, RESOLUTION, RELEVANCE, cs, { actorId: 'pc-kira', narrationId: 'nar-vex' });
}

describe('issue #338 D6(ii) — the connection a removed Make a Connection narration created', () => {
  it('control: the hit creates Vex from the narration, with a bond on the roller\'s sheet', async () => {
    await makeAConnection();
    expect(connectionsNamed('Vex')).toHaveLength(1);
    expect(connectionsNamed('Vex')[0].description).toBe('A smuggler who runs the lower docks.');
    expect(kiraBonds().map(i => i.name)).toEqual(['Vex']);
  });

  it('the record carries the narration that created it', async () => {
    await makeAConnection();
    expect(connectionsNamed('Vex')[0].createdFromNarrationId).toBe('nar-vex');
  });

  it('untouched since, it leaves with the X-Card: the NPC card, the bond Item and the roster entry', async () => {
    await makeAConnection();
    const vexId = vexActors()[0].id;
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    // control: the narration's own truth is retracted
    expect(stored().sceneTruths.find(t => /lower docks/.test(t.fact))).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    expect(vexActors()).toEqual([]);
    expect(kiraBonds()).toEqual([]);
    expect(stored().connectionIds).not.toContain(vexId);
  });

  it('marked on the sheet since, it stays, and the GMs are told once that it came from the removed narration', async () => {
    await makeAConnection();
    kiraBonds()[0].system.current = 4;   // a tick on the bond — the table used her
    syncChat();
    const before = ChatMessage._created.length;

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(connectionsNamed('Vex')).toHaveLength(1);
    expect(kiraBonds()).toHaveLength(1);
    expect(gmsToldAbout('Vex', before)).toBe(true);
    const notice = ChatMessage._created.slice(before).filter(m => m.flags?.[MODULE_ID]?.xcardConnectionNotice);
    expect(notice).toHaveLength(1);
    expect(notice[0].whisper).toEqual(['gm-1']);
    expect(notice[0].content).not.toMatch(/\b(she|her|he|him|his)\b/i);
  });

  it('with a history entry since, it stays and the GMs are told', async () => {
    await makeAConnection();
    await addHistoryEntry(vexActors()[0].id, 'Smuggled the crew past the blockade', SESSION);
    syncChat();
    const before = ChatMessage._created.length;

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(connectionsNamed('Vex')).toHaveLength(1);
    expect(gmsToldAbout('Vex', before)).toBe(true);
  });
});
