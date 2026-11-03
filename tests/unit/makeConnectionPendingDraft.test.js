/**
 * A Make a Connection hit on an NPC whose draft card is still pending makes
 * the connection, bonded to the roller (issue #325 W23).
 *
 * The make_a_connection auto-create runs through the detection pass, whose
 * prompt tells the model not to return a pending draft's name and whose parse
 * and routeEntityDrafts drop it — before the auto-create branch. The move card
 * said "Connection made"; nothing was made, and a later Confirm of the old
 * card gave the bond to the PC of the old narration. The pending row the
 * move's narration names is now confirmed, with the bond on the roller.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const DETECTION = JSON.stringify({
  entities: [{ type: 'connection', name: 'Sable Ortiz', description: 'A scarred salvage broker.',
    pronouns: 'she/her', role: 'salvage broker', goal: null, confidence: 'high' }],
  renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const NARRATION = 'Sable Ortiz looks you over, then shakes your hand: she will vouch for you.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let detectionPrompts = [];
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const user = JSON.stringify(body?.messages ?? []);
    if (user.includes('ENTITY TYPES TO DETECT')) detectionPrompts.push(user);
    const text = user.includes('ENTITY TYPES TO DETECT') ? DETECTION
      : String(body?.model ?? '').includes('haiku') ? '{}'
      : NARRATION;
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  }),
}));

import { narrateResolution } from '../../src/narration/narrator.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE = 'starforged-companion';

function pc(id, name) {
  const a = global.makeTestActor({ id, type: 'character', name });
  global.game.actors._set(id, a);
  return a;
}
const bondItems = (actor) => (actor.items.contents ?? []).filter(i => i.type === 'progress' && i.system?.subtype === 'bond');
const sableCard = () => global.game.actors.find(a => a.name === 'Sable Ortiz' && a.flags?.[MODULE]?.entityType === 'connection');

/** The earlier narration's GM draft card: Sable proposed, not yet confirmed (posted for Kira's narration). */
function pendingDraftCard() {
  return {
    id: 'msg-draft-1',
    flags: { [MODULE]: { draftEntityCard: true, source: 'move_resolution', actorId: 'pc-kira',
      drafts: [{ type: 'connection', name: 'Sable Ortiz', description: 'A broker at the salvage yard.', index: 0, status: 'pending' }] } },
  };
}

const RESOLUTION = {
  _id: 'res-1', moveId: 'make_a_connection', moveName: 'Make a Connection',
  outcome: 'strong_hit', outcomeLabel: 'Strong Hit', statUsed: 'heart', statValue: 2,
  playerNarration: 'I ask Sable Ortiz to vouch for me with the salvage guild.',
};
const RELEVANCE = { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [],
  needsClarification: false, referenceType: 'none' };

beforeEach(() => {
  detectionPrompts = [];
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  global.ChatMessage._reset();
  const store = global.game.settings._store;
  store.clear();
  store.set(`${MODULE}.claudeApiKey`, 'sk-ant-test');
  store.set(`${MODULE}.chronicleAutoEntry`, false);
  store.set(`${MODULE}.campaignState`, {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
    connectionIds: [],
  });
});

afterEach(() => { delete global.game.messages; });

describe('Make a Connection and a pending draft', () => {
  it('control: with no pending draft, a Make a Connection hit creates Sable with the bond on the roller', async () => {
    silenceConsoleErrors();   // unrelated best-effort passes log in this bare unit env
    pc('pc-kira', 'Kira');
    const ren = pc('pc-ren', 'Ren');
    global.game.messages = { contents: [], get: () => null };

    await narrateResolution(RESOLUTION, global.game.settings.get(MODULE, 'campaignState'),
      { relevance: RELEVANCE, speakerActorId: 'pc-ren' });

    expect(sableCard()).toBeTruthy();
    expect(bondItems(ren).map(i => i.name)).toEqual(['Sable Ortiz']);
  });

  it('a Make a Connection hit on an NPC whose draft card is still pending creates the connection, bonded to the roller', async () => {
    silenceConsoleErrors();
    const kira = pc('pc-kira', 'Kira');
    const ren  = pc('pc-ren', 'Ren');
    const card = pendingDraftCard();
    global.game.messages = { contents: [card], get: (id) => (id === card.id ? card : null) };

    await narrateResolution(RESOLUTION, global.game.settings.get(MODULE, 'campaignState'),
      { relevance: RELEVANCE, speakerActorId: 'pc-ren' });

    // The detection prompt itself told the model to leave her out.
    expect(detectionPrompts.join('\n')).toMatch(/PENDING DRAFTS[\s\S]*Sable Ortiz/);

    expect({ created: !!sableCard(), ren: bondItems(ren).map(i => i.name), kira: bondItems(kira).map(i => i.name) })
      .toEqual({ created: true, ren: ['Sable Ortiz'], kira: [] });
  });

  it('the pending row is marked confirmed on its card', async () => {
    silenceConsoleErrors();
    pc('pc-kira', 'Kira');
    pc('pc-ren', 'Ren');
    const card = pendingDraftCard();
    card.update = async (changes) => { if (typeof changes?.content === 'string') card.content = changes.content; return card; };
    card.setFlag = async (mod, key, value) => { card.flags[mod][key] = value; return card; };
    global.game.messages = { contents: [card], get: (id) => (id === card.id ? card : null) };

    await narrateResolution(RESOLUTION, global.game.settings.get(MODULE, 'campaignState'),
      { relevance: RELEVANCE, speakerActorId: 'pc-ren' });

    expect(card.flags[MODULE].drafts[0].status).toBe('confirmed');
  });

  it('control: a pending draft the narration does not name is left for the GM', async () => {
    silenceConsoleErrors();
    pc('pc-kira', 'Kira');
    pc('pc-ren', 'Ren');
    const card = pendingDraftCard();
    card.flags[MODULE].drafts[0].name = 'Mara Voss';
    global.game.messages = { contents: [card], get: (id) => (id === card.id ? card : null) };

    await narrateResolution(RESOLUTION, global.game.settings.get(MODULE, 'campaignState'),
      { relevance: RELEVANCE, speakerActorId: 'pc-ren' });

    expect(card.flags[MODULE].drafts[0].status).toBe('pending');
    expect(global.game.actors.find(a => a.name === 'Mara Voss')).toBeFalsy();
  });
});
