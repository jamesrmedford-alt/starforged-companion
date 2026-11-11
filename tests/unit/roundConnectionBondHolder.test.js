/**
 * Issue #342 Z09 ROUND-CAPTURE-CREDITS-FIRST-ROLLER (the eleventh audit's
 * NARR-3; CONT-6's table run is roundConnectionWrongNpc.test.js).
 *
 * A Batch Mode round's capture used to run for one PC: the first Make a
 * Connection hit's roller (narrator.js runRoundNarrationPasses: `lead =
 * connection ?? entries[0]`). routeEntityDrafts auto-created the first
 * connection the detection listed — whoever met them — with that roller's
 * seed and bond, and a second hit's contact went to the draft card as the
 * first roller's. Now each hit creates the figure its own character met
 * (the roller's own line names them, else their description and the
 * narration's clauses naming them, together, name that character alone —
 * issue #345 D2 sends a figure they disagree on to the card), with its own
 * seed, bonded to its own roller; a figure the round cannot place waits on the
 * draft card. CLAUDE.md "credit the roller"; decisions.md (Multiplayer
 * attribution, U23).
 */

/* global makeTestActor, structuredClone */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createConnection: vi.fn(async (data) => ({
    _id: `conn-${String(data.name).toLowerCase().replace(/\s+/g, '-')}`, name: data.name, rank: 'dangerous',
  })),
}));

import { apiPost } from '../../src/api-proxy.js';
import { createConnection } from '../../src/entities/connection.js';
import { narrateRound } from '../../src/narration/narrator.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';

const NARRATION =
  'Kira finds Orla Teague mending nets by the airlock; across the concourse Vex shares a drink with Dace Mirren, a courier who owes nobody.'
  + '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const DETECTION = JSON.stringify({
  entities: [
    { name: 'Orla Teague', type: 'connection', description: 'A net-mender by the airlock — Kira\'s new contact.' },
    { name: 'Dace Mirren', type: 'connection', description: 'A courier Vex drinks with — Vex\'s new contact.' },
  ],
  worldJournal: {},
  renames: [],
});

const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

const makeAConnection = (resolutionId, connectionSeed = null) => ({
  kind: 'move', moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart',
  outcome: 'strong_hit', outcomeLabel: 'Strong Hit', isMatch: false,
  loremasterContext: 'Make a Connection (+heart): strong hit — you create a connection.',
  oracleSeeds: connectionSeed ? { connectionSeed } : null, resolutionId,
  relevance: { resolvedClass: 'discovery', entityIds: [], entityTypes: [] },
});

const ROUND = {
  id: 'round-7', number: 7, phase: 'narrating', acting: ['pl-1', 'pl-2'],
  entries: {
    'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I look for someone who knows the docks.', rolled: { narrationInput: makeAConnection('res-k') } },
    'pl-2': { userId: 'pl-2', actorId: 'pc-vex',  actorName: 'Vex',  text: 'I buy the courier a drink and make a friend.', rolled: { narrationInput: makeAConnection('res-v') } },
  },
};

function installPc(id, name) {
  const pc = makeTestActor({ id, type: 'character', name, hasPlayerOwner: true });
  game.actors._set(id, pc);
  invalidateActorCache(id);
  return pc;
}

/** Script the narration and the detection reply. */
function script(narration, detection) {
  apiPost.mockImplementation(async (_url, _headers, body) => {
    if (body?.model === NARRATION_MODEL) return reply(narration);
    const prompt = String(body?.messages?.[0]?.content ?? '');
    if (/entities/i.test(prompt) && /worldJournal|world journal/i.test(prompt)) return reply(detection);
    return reply('{}');
  });
}

const bondsOf = (actor) => actor.items.contents
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond')
  .map(i => i.name);
const draftCards = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.draftEntityCard);
const createdNames = () => createConnection.mock.calls.map(([data]) => data.name);

/** An earlier narration's ◈ New Entities card with these connection rows still pending. */
function installPendingCard(names) {
  const msg = {
    id: 'draft-earlier', content: '',
    flags: { [MODULE_ID]: { draftEntityCard: true, drafts: names.map((name, index) => ({ name, type: 'connection', description: 'A face from the docks.', index, status: 'pending' })) } },
    update: async (data) => { Object.assign(msg, data); return msg; },
    setFlag: async (mod, key, val) => { msg.flags[mod][key] = val; return msg; },
  };
  global.game.messages = { contents: [msg], get: (id) => (id === msg.id ? msg : null) };
  return msg;
}

let kira;
let vex;

beforeEach(() => {
  vi.clearAllMocks();
  script(NARRATION, DETECTION);
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    currentSessionId: 's1', sessionNumber: 1, currentSceneId: 'sc-1', connectionIds: [],
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
  });
  global.game.user = { id: 'gm-1', isGM: true };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.game.messages = { contents: [], get: () => null };
  ChatMessage._reset();
  kira = installPc('pc-kira', 'Kira');
  vex  = installPc('pc-vex', 'Vex');
});

const narrate = (round) => narrateRound({ round, campaignState: structuredClone(game.settings.get(MODULE_ID, 'campaignState')) });

describe("Z09 — each Make a Connection hit in a round creates the connection its own roller met", () => {
  it("two Make a Connection strong hits in one round: the second roller's contact is bonded to the second roller", async () => {
    const res = await narrate(ROUND);
    expect(res.posted).toBe('card');

    // Control: the first hit's contact is auto-created and bonded to its roller.
    expect(bondsOf(kira)).toContain('Orla Teague');

    // Vex's contact is Vex's: bonded to Vex (auto-created, as a free-flow hit
    // would be), never the first roller's.
    const daceCard = draftCards().find(c => c.flags[MODULE_ID].drafts.some(d => d.name === 'Dace Mirren'));
    const daceHolder = bondsOf(vex).includes('Dace Mirren') ? 'pc-vex'
      : bondsOf(kira).includes('Dace Mirren') ? 'pc-kira'
        : (daceCard?.flags[MODULE_ID].actorId ?? null);
    expect(daceHolder).toBe('pc-vex');   // was: 'pc-kira' — the draft card carried the first roller
    expect(bondsOf(kira)).not.toContain('Dace Mirren');
  });

  it("each hit's connection is seeded from its own roller's Make a Connection", async () => {
    const round = structuredClone(ROUND);
    round.entries['pl-1'].rolled.narrationInput = makeAConnection('res-k', { role: 'Net-mender', goal: 'Find her brother' });
    round.entries['pl-2'].rolled.narrationInput = makeAConnection('res-v', { role: 'Courier', goal: 'Clear a debt' });
    await narrate(round);
    const made = Object.fromEntries(createConnection.mock.calls.map(([data]) => [data.name, { role: data.role, goal: data.goal }]));
    expect(made).toEqual({
      'Orla Teague': { role: 'Net-mender', goal: 'Find her brother' },
      'Dace Mirren': { role: 'Courier', goal: 'Clear a debt' },
    });
  });

  it('control: one Make a Connection in a round is credited to its roller, wherever its entry stands', async () => {
    const round = structuredClone(ROUND);
    round.entries['pl-1'].rolled.narrationInput = { kind: 'narrative' };
    round.entries['pl-1'].text = 'I keep watch on the concourse.';
    script(NARRATION, JSON.stringify({ entities: [{ name: 'Dace Mirren', type: 'connection', description: 'A courier.' }], worldJournal: {}, renames: [] }));
    const res = await narrate(round);
    expect(res.posted).toBe('card');
    expect(bondsOf(vex)).toContain('Dace Mirren');
    expect(bondsOf(kira)).not.toContain('Dace Mirren');
  });

  it('a figure the round cannot place is not given to either roller — it waits on the draft card', async () => {
    script(
      'Kira and Vex find Orla Teague by the airlock.\n```json\n{"newTruths":[],"stateChanges":[]}\n```',
      JSON.stringify({ entities: [{ name: 'Orla Teague', type: 'connection', description: 'A net-mender.' }], worldJournal: {}, renames: [] }),
    );
    await narrate(ROUND);
    expect(createdNames()).toEqual([]);
    expect(bondsOf(kira)).toEqual([]);
    expect(bondsOf(vex)).toEqual([]);
    expect(draftCards().flatMap(c => c.flags[MODULE_ID].drafts.map(d => d.name))).toEqual(['Orla Teague']);
  });

  it("a round with one acting character keeps free-flow's rule: its first connection is the hit's", async () => {
    const round = structuredClone(ROUND);
    round.acting = ['pl-1'];
    delete round.entries['pl-2'];
    script(
      'A net-mender named Orla Teague looks up from her work.\n```json\n{"newTruths":[],"stateChanges":[]}\n```',
      JSON.stringify({ entities: [{ name: 'Orla Teague', type: 'connection', description: 'A net-mender.' }], worldJournal: {}, renames: [] }),
    );
    await narrate(round);
    expect(bondsOf(kira)).toEqual(['Orla Teague']);
  });

  it("a pending draft row is confirmed for the hit whose roller met it, never for another player's line", async () => {
    const card = installPendingCard(['Dace Mirren', 'Orla Teague']);
    const round = structuredClone(ROUND);
    round.entries['pl-1'].text = 'I look for Orla Teague by the airlock.';
    round.entries['pl-2'].rolled.narrationInput = { kind: 'narrative' };
    round.entries['pl-2'].text = 'I buy Dace Mirren a drink.';
    script(
      'Orla Teague waves Kira over; Vex and Dace Mirren share a bottle at the bar.\n```json\n{"newTruths":[],"stateChanges":[]}\n```',
      JSON.stringify({ entities: [], worldJournal: {}, renames: [] }),   // pending names are left out of the reply
    );
    await narrate(round);
    expect(bondsOf(kira)).toEqual(['Orla Teague']);
    expect(bondsOf(vex)).toEqual([]);
    expect(Object.fromEntries(card.flags[MODULE_ID].drafts.map(d => [d.name, d.status])))
      .toEqual({ 'Dace Mirren': 'pending', 'Orla Teague': 'confirmed' });
  });
});

describe('D3 (ruling A) — the bond holder of an NPC a round introduces', () => {
  it("a round where Vex (second entry) talks to a new NPC: the draft card names every acting PC, so Confirm can ask whose connection Doss is", async () => {
    const round = structuredClone(ROUND);
    round.entries['pl-1'].rolled.narrationInput = {
      kind: 'move', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', outcome: 'weak_hit', outcomeLabel: 'Weak Hit',
      relevance: { resolvedClass: 'interaction', entityIds: [], entityTypes: [] }, resolutionId: 'res-k',
    };
    round.entries['pl-1'].text = 'I squeeze through the maintenance crawlway.';
    round.entries['pl-2'].rolled.narrationInput = { kind: 'narrative' };
    round.entries['pl-2'].text = 'I ask the old mechanic, Doss, where the part went.';
    script(
      'Kira squeezes through the crawlway while Vex corners Doss, the old mechanic.\n```json\n{"newTruths":[],"stateChanges":[]}\n```',
      JSON.stringify({ entities: [{ name: 'Doss', type: 'connection', description: 'An old mechanic Vex questions.' }], worldJournal: {}, renames: [] }),
    );
    vi.useFakeTimers();
    try {
      const res = await narrate(round);
      expect(res.posted).toBe('card');
      await vi.advanceTimersByTimeAsync(2500);   // the interaction-class detection runs ~2 s after the card
    } finally {
      vi.useRealTimers();
    }
    const card = draftCards().find(c => c.flags[MODULE_ID].drafts.some(d => d.name === 'Doss'));
    expect(card).toBeTruthy();
    // Ruling A: the card names the round's acting PCs — not silently the first entry's.
    expect(card.flags[MODULE_ID].actorIds ?? [card.flags[MODULE_ID].actorId]).toEqual(['pc-kira', 'pc-vex']);   // was: ['pc-kira']
    expect(card.flags[MODULE_ID].actorId).toBeUndefined();
    // …and Doss's row asks whose connection she is, a button per acting PC and No one.
    expect(card.content).toContain('Confirm — whose connection?');
    expect(card.content).toMatch(/data-actor-id="pc-kira">Kira</);
    expect(card.content).toMatch(/data-actor-id="pc-vex">Vex</);
    expect(card.content).toMatch(/data-actor-id="">No one</);
  });
});
