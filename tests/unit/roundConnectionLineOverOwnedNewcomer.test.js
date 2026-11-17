/**
 * STARFORGED COMPANION
 * tests/unit/roundConnectionLineOverOwnedNewcomer.test.js
 *
 * Issue #362 AC19 MAKE-CONNECTION-FIRST-DETECTED — the Batch Mode round's path
 * (found by the AC19 fix: the free-flow hit now chooses its figure before
 * anything is made, the newly detected people counted in; a round's did not).
 *
 * Kira rolls Make a Connection in a round, a strong hit: "I ask Vance Oduya to
 * keep a berth open for me." Vance is an NPC the table knows. The narration
 * brings a new face along — "… waves over his deckhand, Ilsa Marr …" — and the
 * detector lists her. The round's slot took any newcomer its roller "owns"
 * (roundFigureOwner — in a one-PC round every figure is the roller's) in the
 * loop over the detected people, before connectNamedFigure — which reads the
 * hit's own line — was tried: Ilsa got the card and Kira's bond, and Vance,
 * the one the move was with, got nothing.
 *
 * A round's hit now chooses as free-flow's does (chooseConnectionFigure), by
 * its own entry's line, among the newcomers its roller met and the NPCs its
 * line and the narration name: the one the line names; else the first
 * newcomer its roller met.
 *
 * Harness: roundConnectionOwnLineNames.test.js's (narrateRound with Claude
 * scripted at api-proxy).
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
const NARRATION_MODEL = 'claude-sonnet-5-5';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const ILSA = { name: 'Ilsa Marr', type: 'connection', description: 'Vance Oduya\'s deckhand, logging berths.' };
const DACE = { name: 'Dace Varn', type: 'connection', description: 'A raider drinking at the bar.' };
const detection = (entities) => JSON.stringify({ entities, worldJournal: {}, renames: [] });

function script(narration, entities) {
  apiPost.mockImplementation(async (_url, _headers, body) => {
    if (body?.model === NARRATION_MODEL) return reply(narration + SIDECAR);
    const prompt = String(body?.messages?.[0]?.content ?? '');
    if (/entities/i.test(prompt) && /worldJournal|world journal/i.test(prompt)) return reply(detection(entities));
    return reply('{}');
  });
}

const makeAConnection = (resolutionId) => ({
  kind: 'move', moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart',
  outcome: 'strong_hit', outcomeLabel: 'Strong Hit', isMatch: false,
  loremasterContext: 'Make a Connection (+heart): strong hit — you create a connection.',
  oracleSeeds: null, resolutionId,
  relevance: { resolvedClass: 'discovery', entityIds: [], entityTypes: [] },
});

/** Kira's Make a Connection hit, and — in a two-PC round — Vex's action with no roll. */
function round(kiraLine, { vexLine = null } = {}) {
  const entries = {
    'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: kiraLine, rolled: { narrationInput: makeAConnection('res-k') } },
  };
  if (vexLine) entries['pl-2'] = { userId: 'pl-2', actorId: 'pc-vex', actorName: 'Vex', text: vexLine, rolled: { narrationInput: { kind: 'narrative' } } };
  return { id: 'round-9', number: 9, phase: 'narrating', acting: Object.keys(entries), entries };
}

function installPc(id, name) {
  const pc = makeTestActor({ id, type: 'character', name, hasPlayerOwner: true });
  game.actors._set(id, pc);
  invalidateActorCache(id);
  return pc;
}

const bondsOf = (actor) => actor.items.contents
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond')
  .map(i => i.name);
const createdNames = () => createConnection.mock.calls.map(([data]) => data.name);
const queuedNames = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.draftEntityCard)
  .flatMap(m => (m.flags[MODULE_ID].drafts ?? []).filter(d => d.status === 'pending').map(d => d.name));
const severalNotices = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.knownNpcsConnectionNotice);

const VANCE_LINE = 'I ask Vance Oduya to keep a berth open for me.';
const VANCE_NARRATION = 'Vance Oduya studies Kira a long moment, then waves over his deckhand, Ilsa Marr, to log the berth he will keep open.';

let kira;
beforeEach(() => {
  vi.clearAllMocks();
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  // Vance Oduya: an NPC the table knows — a listed connection card.
  game.actors._set('npc-vance', makeTestActor({
    id: 'npc-vance', type: 'character', name: 'Vance Oduya',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-vance', name: 'Vance Oduya', active: true, role: 'dockmaster' } } },
  }));
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    currentSessionId: 's1', sessionNumber: 1, currentSceneId: 'sc-1', connectionIds: ['npc-vance'],
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
  });
  global.game.user = { id: 'gm-1', isGM: true };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.game.messages = { contents: [], get: () => null };
  ChatMessage._reset();
  kira = installPc('pc-kira', 'Kira');
});

const narrate = (r) => narrateRound({ round: r, campaignState: structuredClone(game.settings.get(MODULE_ID, 'campaignState')) });

describe("issue #362 AC19 (a round's hit) — the NPC the hit's own line names, not a newcomer its roller met", () => {
  it('control: a hit whose line names no one takes the newcomer its roller met, as before', async () => {
    script('Ilsa Marr looks up from the berth log and agrees to keep one open for Kira.', [ILSA]);
    expect((await narrate(round('I look for someone who can keep a berth open for me.'))).posted).toBe('card');
    expect({ created: createdNames(), kira: bondsOf(kira) }).toEqual({ created: ['Ilsa Marr'], kira: ['Ilsa Marr'] });
  });

  it('control: a hit whose line names the newcomer takes her', async () => {
    script(VANCE_NARRATION, [ILSA]);
    await narrate(round('I ask Ilsa Marr to log a berth for me.'));
    expect({ created: createdNames(), kira: bondsOf(kira) }).toEqual({ created: ['Ilsa Marr'], kira: ['Ilsa Marr'] });
  });

  it('a one-PC round: the known NPC the line names is the connection; the deckhand waits on the card', async () => {
    script(VANCE_NARRATION, [ILSA]);
    expect((await narrate(round(VANCE_LINE))).posted).toBe('card');
    expect({ created: createdNames(), kira: bondsOf(kira), queued: queuedNames() })
      .toEqual({ created: [], kira: ['Vance Oduya'], queued: ['Ilsa Marr'] });
  });

  it('a two-PC round: the hit\'s own line decides, whoever else acted', async () => {
    installPc('pc-vex', 'Vex');
    script(`${VANCE_NARRATION} Vex keeps watch on the concourse.`, [ILSA]);
    await narrate(round(VANCE_LINE, { vexLine: 'I keep watch on the concourse.' }));
    expect({ created: createdNames(), kira: bondsOf(kira), queued: queuedNames() })
      .toEqual({ created: [], kira: ['Vance Oduya'], queued: ['Ilsa Marr'] });
  });

  it('the line names two newcomers: none is guessed — both wait on the card, and the GMs are told', async () => {
    script('Dace Varn and Ilsa Marr trade a look across the bar; one of them will keep a berth open for Kira.', [DACE, ILSA]);
    await narrate(round('I ask Dace Varn and Ilsa Marr to keep a berth open for me.'));
    expect({ created: createdNames(), kira: bondsOf(kira), queued: queuedNames().sort() })
      .toEqual({ created: [], kira: [], queued: ['Dace Varn', 'Ilsa Marr'] });
    expect(severalNotices()).toHaveLength(1);
  });
});
