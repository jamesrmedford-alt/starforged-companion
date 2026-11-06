/**
 * NARR-3 ROUND-CAPTURE-CREDITS-FIRST-ENTRY (eleventh audit, narration) — a
 * Batch Mode round's one capture pass is run for one PC: the first Make a
 * Connection hit's roller, else the round's first entry
 * (narrator.js runRoundNarrationPasses: `lead = connection ?? entries[0]`,
 * `actorId: lead.actorId`). Every NPC the round's narration introduces goes on
 * a draft card carrying that PC, and Confirm puts the connection's bond Item
 * on that PC's sheet (entityExtractor.js confirmDraft reads `flags.actorId`).
 *
 * Two players each Make a Connection in one round, both strong hits. Kira's
 * contact is auto-created and bonded to Kira; Vex's contact goes to the draft
 * card stamped with KIRA's actor id, so the GM's Confirm makes Vex's contact
 * Kira's connection — and Vex, whose strong hit "creates a connection", has
 * none. CLAUDE.md "credit the roller"; decisions.md (Multiplayer attribution,
 * U23): "A new connection's bond Item goes on the roller's PC (Make a
 * Connection) or the PC a draft card carries (`actorId`, stamped by every
 * detection path that knows its narration's PC)".
 */

/* global makeTestActor, structuredClone */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createConnection: vi.fn(async (data) => ({
    _id: `conn-${String(data.name).toLowerCase().replace(/\s+/g, '-')}`, name: data.name, rank: 'dangerous',
  })),
}));

import { apiPost } from '../../../src/api-proxy.js';
import { narrateRound } from '../../../src/narration/narrator.js';
import { invalidateActorCache } from '../../../src/character/actorBridge.js';

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

const makeAConnection = (resolutionId) => ({
  kind: 'move', moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart',
  outcome: 'strong_hit', outcomeLabel: 'Strong Hit', isMatch: false,
  loremasterContext: 'Make a Connection (+heart): strong hit — you create a connection.',
  oracleSeeds: null, resolutionId,
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

const bondsOf = (actor) => actor.items.contents
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond')
  .map(i => i.name);
const draftCards = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.draftEntityCard);

let kira;
let vex;

beforeEach(() => {
  vi.clearAllMocks();
  apiPost.mockImplementation(async (_url, _headers, body) => {
    if (body?.model === NARRATION_MODEL) return reply(NARRATION);
    const prompt = String(body?.messages?.[0]?.content ?? '');
    if (/entities/i.test(prompt) && /worldJournal|world journal/i.test(prompt)) return reply(DETECTION);
    return reply('{}');
  });
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

describe('NARR-3 — a round\'s capture is credited to its first Make a Connection roller', () => {
  it('two Make a Connection strong hits in one round: the second roller\'s contact is bonded to the second roller', async () => {
    const res = await narrateRound({ round: ROUND, campaignState: structuredClone(game.settings.get(MODULE_ID, 'campaignState')) });
    expect(res.posted).toBe('card');

    // Control: the first hit's contact is auto-created and bonded to its roller.
    expect(bondsOf(kira)).toContain('Orla Teague');

    // Vex's contact — today on the round's draft card, whose Confirm bonds the
    // card's actorId (confirmDraft) — is Vex's: bonded to Vex (auto-created, as
    // a free-flow hit would be) or queued for a Confirm that bonds Vex.
    const daceCard = draftCards().find(c => c.flags[MODULE_ID].drafts.some(d => d.name === 'Dace Mirren'));
    const daceHolder = bondsOf(vex).includes('Dace Mirren') ? 'pc-vex'
      : bondsOf(kira).includes('Dace Mirren') ? 'pc-kira'
        : (daceCard?.flags[MODULE_ID].actorId ?? null);
    expect(daceHolder).toBe('pc-vex');   // today: 'pc-kira' — the draft card carries the first roller
  });

  it('control: one Make a Connection in a round is credited to its roller, wherever its entry stands', async () => {
    const round = structuredClone(ROUND);
    round.entries['pl-1'].rolled.narrationInput = { kind: 'narrative' };
    round.entries['pl-1'].text = 'I keep watch on the concourse.';
    apiPost.mockImplementation(async (_url, _headers, body) => {
      if (body?.model === NARRATION_MODEL) return reply(NARRATION);
      const prompt = String(body?.messages?.[0]?.content ?? '');
      if (/entities/i.test(prompt) && /worldJournal|world journal/i.test(prompt)) {
        return reply(JSON.stringify({ entities: [{ name: 'Dace Mirren', type: 'connection', description: 'A courier.' }], worldJournal: {}, renames: [] }));
      }
      return reply('{}');
    });
    const res = await narrateRound({ round, campaignState: structuredClone(game.settings.get(MODULE_ID, 'campaignState')) });
    expect(res.posted).toBe('card');
    expect(bondsOf(vex)).toContain('Dace Mirren');
    expect(bondsOf(kira)).not.toContain('Dace Mirren');
  });
});

describe('NARR-D1 (decision) — the bond holder of an NPC a round introduces', () => {
  it('a round where Vex (second entry) talks to a new NPC: the draft card does not silently credit the first entry\'s PC (option A: it carries every acting PC)', async () => {
    const round = structuredClone(ROUND);
    round.entries['pl-1'].rolled.narrationInput = {
      kind: 'move', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', outcome: 'weak_hit', outcomeLabel: 'Weak Hit',
      relevance: { resolvedClass: 'interaction', entityIds: [], entityTypes: [] }, resolutionId: 'res-k',
    };
    round.entries['pl-1'].text = 'I squeeze through the maintenance crawlway.';
    round.entries['pl-2'].rolled.narrationInput = { kind: 'narrative' };
    round.entries['pl-2'].text = 'I ask the old mechanic, Doss, where the part went.';
    apiPost.mockImplementation(async (_url, _headers, body) => {
      if (body?.model === NARRATION_MODEL) return reply('Kira squeezes through the crawlway while Vex corners Doss, the old mechanic.\n```json\n{"newTruths":[],"stateChanges":[]}\n```');
      const prompt = String(body?.messages?.[0]?.content ?? '');
      if (/entities/i.test(prompt) && /worldJournal|world journal/i.test(prompt)) {
        return reply(JSON.stringify({ entities: [{ name: 'Doss', type: 'connection', description: 'An old mechanic Vex questions.' }], worldJournal: {}, renames: [] }));
      }
      return reply('{}');
    });
    vi.useFakeTimers();
    try {
      const res = await narrateRound({ round, campaignState: structuredClone(game.settings.get(MODULE_ID, 'campaignState')) });
      expect(res.posted).toBe('card');
      await vi.advanceTimersByTimeAsync(2500);   // the interaction-class detection runs ~2 s after the card
    } finally {
      vi.useRealTimers();
    }
    const card = draftCards().find(c => c.flags[MODULE_ID].drafts.some(d => d.name === 'Doss'));
    expect(card).toBeTruthy();
    // Option A: the card names the round's acting PCs, so Confirm can ask whose connection Doss is.
    expect(card.flags[MODULE_ID].actorIds ?? [card.flags[MODULE_ID].actorId]).toEqual(['pc-kira', 'pc-vex']);   // today: ['pc-kira']
  });
});
