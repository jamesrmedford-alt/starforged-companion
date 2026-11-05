/**
 * PROBE — NARRATION-D1 XCARD-AUTO-CREATED-CONNECTION (needs a decision)
 *
 * What the user does: a player's Make a Connection hits; its narration
 * introduces "Vex, a smuggler who runs the lower docks". The post-narration
 * pass (synchronous for a Make a Connection hit — runPostNarrationPasses →
 * runDiscoveryDetection → routeEntityDrafts with autoCreateConnection) creates
 * Vex as a connection Actor with the narration's description and puts a bond
 * Item on the roller's sheet. The table plays the X-Card on that narration.
 *
 * What happens: the X-Card retracts the narration's ledger facts, flags its
 * card, and undoes what its capture recorded by narration id — lore, threats,
 * factions, places, Session Log beats, tier details (issue #329 X01). The
 * connection it auto-created is none of those: `createConnection` stamps no
 * narration id, `retractNarrationCapture` does not look at Actors, and
 * nothing tells the GMs. Vex stays in the world with the removed prose as her
 * description, on the roster ([5b] ACTIVE SECTOR — "Established NPCs in this
 * sector … build the fiction around who they already are"), in every ENTITIES
 * IN SCENE card she matches, and as a live bond on the roller's sheet.
 *
 * What should happen — the maintainer's call (decisions.md U07: "the
 * narration an X-Card answers leaves narrator memory"; X01 lists what the
 * X-Card undoes and a connection it made is not among them):
 *   A. the X-Card dismisses the connection the removed narration created
 *      (the record stamped with the narration id at creation; the finish
 *      deletes the Actor and its bond Item when nothing else references it);
 *   B. the Actor stays — deleting a document is not a safety tool's job —
 *      but the X-Card's finish tells the GMs on a whispered card that "Vex, a
 *      connection the removed narration created, remains: dismiss her from
 *      the Entities panel if the table wants her gone".
 * Recommended: B. This probe asserts B: after the X-Card a GM-facing card or
 * notification names the connection.
 *
 * Control: the narration's own ledger truth is retracted by the X-Card.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narration/xcardAutoCreatedConnection.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../../src/api-proxy.js';
import { applyNarratorSidecar, postNarrationCard, runPostNarrationPasses } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';
import { listConnections } from '../../../src/entities/connection.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

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

let notices;
beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
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
  game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character', ownership: { 'pl-1': 3 } }));
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    if (/You are analysing an Ironsworn: Starforged narration/.test(user)) return reply(JSON.stringify(DETECTION));
    return reply('{"contradictions":[]}');
  });
});
afterEach(() => { delete global.ui; });

const connectionsNamed = (name) => listConnections(stored()).filter(c => c.name === name);
/** A GM-facing word after the X-Card naming the connection: a card posted since `sinceCount` messages existed, or a notification. */
function gmsToldAbout(name, sinceCount) {
  const after = ChatMessage._created.slice(sinceCount);
  const onACard = after.some(m => new RegExp(`\\b${name}\\b`).test(String(m.content ?? '')));
  const asANotice = notices.some(n => new RegExp(`\\b${name}\\b`).test(String(n)));
  return onACard || asANotice;
}

describe('PROBE NARRATION-D1 XCARD-AUTO-CREATED-CONNECTION', () => {
  it('the X-Card on a Make a Connection narration: the GMs are told the connection it created remains (option B)', async () => {
    const cs = stored();
    const text = applyNarratorSidecar(`${PROSE}\n\`\`\`json\n${JSON.stringify(SIDECAR)}\n\`\`\``, cs, { narrationId: 'nar-vex', matchedEntityIds: [] });
    await postNarrationCard(text, RESOLUTION, cs, { playerText: RESOLUTION.playerNarration, playerName: 'Kira', narrationId: 'nar-vex' });
    await runPostNarrationPasses(text, RESOLUTION, RELEVANCE, cs, { actorId: 'pc-kira', narrationId: 'nar-vex' });
    // control: the hit created Vex as a connection from the narration
    expect(connectionsNamed('Vex')).toHaveLength(1);
    expect(connectionsNamed('Vex')[0].description).toBe('A smuggler who runs the lower docks.');
    syncChat();
    const before = ChatMessage._created.length;

    expect(await suppressScene({}, { local: true })).toBe(true);
    // control: the narration's own truth is retracted
    expect(stored().sceneTruths.find(t => /lower docks/.test(t.fact))).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    // Vex stays (option B keeps her) …
    expect(connectionsNamed('Vex')).toHaveLength(1);
    // … and the GMs are told she came from the removed narration. Today: nothing says so.
    expect(gmsToldAbout('Vex', before)).toBe(true);
  });
});
