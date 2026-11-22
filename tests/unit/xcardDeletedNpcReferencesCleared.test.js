/**
 * STARFORGED COMPANION
 * tests/unit/xcardDeletedNpcReferencesCleared.test.js
 *
 * Issue #364 XCARD-NPC-DELETE-SKIPS-TEARDOWN (left open by issue #364
 * WON-FIGHT-CARD-DELETED-NPC).
 *
 * A GM's delete of an NPC card clears what names the NPC: the vows linked to
 * them (a vow's link is the connection's name) and the "🤝 Deepen your bond
 * with …" of the victory cards already in chat (connection.js
 * tearDownDeletedConnection). The X-Card's own delete of an NPC its narration
 * created (retractNarrationConnections) tells the deleteActor hook to stand
 * down — it deletes the bond Items before the card, and runs in step with the
 * X-Card's finish — and skipped that clearing with it.
 *
 * The case that is reachable: the X-Card deletes only an NPC nobody has used
 * (issue #338 D6(ii) — connectionUsed reads the NPC's record, its sheet and
 * its bond Items' marks). A vow linked to the NPC since its narration — the
 * player-vow card's Link picker, which posts no narration — writes the vow,
 * not the NPC, so the NPC is still "unused" and goes with the X-Card: the vow
 * kept naming a connection that no longer exists, and its fulfilment listed a
 * deepen no Retry could land. (A victory card for that vow needs a fight won
 * with no narration posted since the NPC's own — the X-Card answers the
 * latest narration — so it is the rarer case; the clearing is one function
 * for both, and both are pinned here.)
 *
 * Harness: xcardAutoCreatedConnection.test.js's — the real narration capture
 * creates the NPC, the real Link handler links the vow, the real X-Card
 * (safety.suppressScene) removes the narration.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { applyNarratorSidecar, postNarrationCard, runPostNarrationPasses } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { listConnections, addHistoryEntry } from '../../src/entities/connection.js';
import { applyPlayerVowLinkFromRelay } from '../../src/session/swearVow.js';
import { applyFightVowDeepenBond } from '../../src/moves/cardActions.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const VOW = 'Break the dock blockade';
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

let kira, vow, origActorCreate, origItemCreate;
beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [], get: () => null };
  global.game.users = Object.assign([GM, PL], { get: (id) => [GM, PL].find(u => u.id === id) ?? null });
  global.game.user = GM;
  global.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
  kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character', ownership: { 'pl-1': 3 } });
  // Kira swore this vow earlier; its card in chat carries the Link picker.
  vow = {
    id: 'v-dock', name: VOW, type: 'progress',
    system: { subtype: 'vow', rank: 'formidable', current: 8, completed: false },
    flags: { [MODULE_ID]: { vowId: 'v-dock' } },
    setFlag: async (mod, key, value) => { (vow.flags[mod] ??= {})[key] = value; },
  };
  kira.items.contents.push(vow);
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
const npcCards = () => game.actors.contents.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
const linkOf   = () => vow.flags[MODULE_ID].linkedConnectionName ?? null;
const notices  = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.vowLinkClearedNotice);

/** The Make a Connection narration and its synchronous capture (the hit creates Vex). */
async function makeAConnection() {
  const cs = stored();
  const text = applyNarratorSidecar(`${PROSE}\n\`\`\`json\n${JSON.stringify(SIDECAR)}\n\`\`\``, cs, { narrationId: 'nar-vex', matchedEntityIds: [] });
  await postNarrationCard(text, RESOLUTION, cs, { playerText: RESOLUTION.playerNarration, playerName: 'Kira', narrationId: 'nar-vex' });
  await runPostNarrationPasses(text, RESOLUTION, RELEVANCE, cs, { actorId: 'pc-kira', narrationId: 'nar-vex' });
  expect(connectionsNamed('Vex'), 'the hit created Vex (setup)').toHaveLength(1);
}

/** A player picks Vex on the vow card's Link picker: the canonical GM links the vow. No narration follows. */
async function linkTheVowToVex() {
  const card = await ChatMessage.create({ content: '<div class="sf-player-vow">A vow sworn</div>',
    flags: { [MODULE_ID]: { playerVowCard: true, vowId: 'v-dock' } } });
  syncChat();
  expect(await applyPlayerVowLinkFromRelay({ messageId: card.id, connectionName: 'Vex' }, { requesterId: 'pl-1' }),
    'the Link landed (setup)').toMatchObject({ applied: true });
  expect(linkOf(), 'the vow serves Vex (setup)').toBe('Vex');
}

/** The X-Card: it answers the latest narration — the one that created Vex. */
async function xCard() {
  syncChat();
  expect(await suppressScene({}, { local: true })).toBe(true);
}

describe('issue #364 XCARD-NPC-DELETE-SKIPS-TEARDOWN — the X-Card\'s delete of an NPC clears what names them', () => {
  it('a vow linked to the NPC since its narration loses the link when the X-Card removes the NPC', async () => {
    await makeAConnection();
    await linkTheVowToVex();

    await xCard();

    // The link is on the vow, not on Vex's record: nobody "used" her, so she went with the narration.
    expect(npcCards(), 'Vex is gone').toEqual([]);
    expect(linkOf(), 'the vow no longer names a connection that does not exist').toBeNull();
  });

  it('the GMs are told once which vow no longer serves a connection', async () => {
    await makeAConnection();
    await linkTheVowToVex();

    await xCard();

    expect(notices()).toHaveLength(1);
    expect(notices()[0].whisper).toEqual(['gm-1']);
    expect(notices()[0].content).toContain('Vex');
    expect(notices()[0].content).toContain(VOW);
  });

  it('a victory card already in chat for that vow stops offering to deepen the bond', async () => {
    await makeAConnection();
    await linkTheVowToVex();
    // A fight won for the vow, its moves narrated by nothing since (the card is the pipeline's won-fight card).
    const card = await ChatMessage.create({
      content: '<div class="sf-card sf-fight-vow"><button data-action="sf-deepen-bond">🤝 Deepen your bond with Vex</button></div>',
      flags: { [MODULE_ID]: { fightVowCard: true, vowName: VOW, vowId: 'v-dock', vowRank: 'formidable', actorId: 'pc-kira', connectionName: 'Vex', marks: 2 } },
    });

    await xCard();

    expect(card.flags[MODULE_ID].deepenRetired, 'the card is stamped: its button renders disabled').toBe(true);
    // A press from a window that had not re-rendered deepens nothing and tells the GMs nothing.
    const before = ChatMessage._created.length;
    expect(await applyFightVowDeepenBond({ messageId: card.id }, { requesterId: 'pl-1' })).toMatchObject({ applied: false });
    expect(ChatMessage._created.slice(before)).toEqual([]);
  });

  /** Another NPC card that goes by Vex — not the narration's. */
  function addAnotherVex() {
    game.actors._set('conn-vex-2', makeTestActor({ id: 'conn-vex-2', name: 'Vex', type: 'character',
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-vex-2', name: 'Vex', active: true, history: [] } } } }));
    game.settings._store.set(KEY, { ...stored(), connectionIds: [...stored().connectionIds, 'conn-vex-2'] });
  }

  // The Link stamps the NPC card's id on the vow (known-issues
  // VOW-CONNECTION-LINK-BY-NAME): the vow was sworn to the narration's Vex,
  // and another card of that name is not her.
  it('a namesake is left: the vow was linked to the removed card, not to the name — it loses its link', async () => {
    await makeAConnection();
    await linkTheVowToVex();
    expect(vow.flags[MODULE_ID].linkedConnectionId, 'the Link stamped the narration\'s card (setup)').toBeTruthy();
    addAnotherVex();

    await xCard();

    expect(npcCards().map(a => a.id), 'the narration\'s Vex is gone, the other is not').toEqual(['conn-vex-2']);
    expect(linkOf()).toBe(null);
    expect(vow.flags[MODULE_ID].linkedConnectionId ?? null).toBe(null);
    expect(notices()).toHaveLength(1);
  });

  it('a namesake is left, and the vow\'s link is by name alone (made before links carried a card\'s id): the name still means someone, so it keeps its link', async () => {
    await makeAConnection();
    vow.flags[MODULE_ID].linkedConnectionName = 'Vex';
    addAnotherVex();

    await xCard();

    expect(npcCards().map(a => a.id), 'the narration\'s Vex is gone, the other is not').toEqual(['conn-vex-2']);
    expect(linkOf()).toBe('Vex');
    expect(notices()).toEqual([]);
  });

  it('control: an NPC the table has used stays with the X-Card, and so does the vow\'s link', async () => {
    await makeAConnection();
    await linkTheVowToVex();
    await addHistoryEntry(npcCards()[0].id, 'Kira paid her for the dock codes.', SESSION);

    await xCard();

    expect(connectionsNamed('Vex')).toHaveLength(1);
    expect(linkOf()).toBe('Vex');
    expect(notices()).toEqual([]);
  });

  it('control: with no vow linked to her, the X-Card removes the NPC and tells the GMs nothing about vows', async () => {
    await makeAConnection();

    await xCard();

    expect(npcCards()).toEqual([]);
    expect(linkOf()).toBeNull();
    expect(notices()).toEqual([]);
  });
});
