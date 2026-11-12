/**
 * STARFORGED COMPANION
 * tests/unit/roundFigureOwnerAsksWhenRungsDisagree.test.js
 *
 * Issue #345 D2 ROUND-FIGURE-OWNER-RUNG-ORDER (the twelfth audit's R2M-5;
 * the maintainer's ruling B). Introduced by issue #342 Z09's fix
 * (ROUND-CAPTURE-CREDITS-FIRST-ROLLER).
 *
 * A Batch Mode round's Make a Connection hits each create "the figure its own
 * character met" (narrator.js runRoundNarrationPasses → connectionRollers).
 * Who met a figure is roundFigureOwner's ladder. It read the figure's
 * DETECTED DESCRIPTION before the narration's clause, and took a description
 * that names a PC as "that PC met them" — but the detection never says who
 * met a figure, and a description names a PC for any relation the prose gave
 * the NPC ("who once crewed with Ren"). So when Kira's hit met Orla Teague,
 * Orla was created as REN's connection — his seed, his bond Item — Kira's
 * Make a Connection made nothing, and Ren's real contact went to the card.
 *
 * Ruling B: when the description names one acting PC and the narration's
 * clause another, the round cannot tell — the figure goes to the New Entities
 * card, whose connection row asks whose connection it is (a button per acting
 * PC and No one — issue #342 D3). Where they agree, or one of them names no
 * one, the ladder stands. (The audit's probe asserted option C — the clause
 * before the description; rewritten to the ruling.)
 *
 * Real producers: narrateRound (the round's narration and capture on the
 * canonical GM) → runRoundNarrationPasses → runDiscoveryDetection →
 * routeEntityDrafts (connectionRollers) → createConnection /
 * registerConnectionOnActiveCharacter, and postDraftEntityCard for the
 * queued figure. Claude scripted at api-proxy (the narration and the
 * detection reply). Harness: tests/unit/roundConnectionBondHolder.test.js's.
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
import { parseHTML } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-5-5';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

const NARRATION =
  'Kira finds Orla Teague mending nets by the airlock, and the two of them talk until the shift bell. '
  + 'Across the concourse, Ren shares a bottle with Dace Mirren, a courier who owes nobody.' + SIDECAR;
const detection = (orlaDescription) => JSON.stringify({
  entities: [
    { name: 'Orla Teague', type: 'connection', description: orlaDescription },
    { name: 'Dace Mirren', type: 'connection', description: 'A courier who owes nobody.' },
  ],
  worldJournal: {},
  renames: [],
});

function script(narration, detectionReply) {
  apiPost.mockImplementation(async (_url, _headers, body) => {
    if (body?.model === NARRATION_MODEL) return reply(narration);
    const prompt = String(body?.messages?.[0]?.content ?? '');
    if (/entities/i.test(prompt) && /worldJournal|world journal/i.test(prompt)) return reply(detectionReply);
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

const ROUND = {
  id: 'round-7', number: 7, phase: 'narrating', acting: ['pl-1', 'pl-2'],
  entries: {
    'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I look for someone who knows the docks.', rolled: { narrationInput: makeAConnection('res-k') } },
    'pl-2': { userId: 'pl-2', actorId: 'pc-ren',  actorName: 'Ren',  text: 'I buy the courier a drink and make a friend.', rolled: { narrationInput: makeAConnection('res-r') } },
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
const createdNames = () => createConnection.mock.calls.map(([data]) => data.name);
const draftCards = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.draftEntityCard);

let kira, ren;
beforeEach(() => {
  vi.clearAllMocks();
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
  ren  = installPc('pc-ren', 'Ren');
});

const narrate = () => narrateRound({ round: structuredClone(ROUND), campaignState: structuredClone(game.settings.get(MODULE_ID, 'campaignState')) });

describe("issue #345 D2 — a round's figure whose description and narration name different characters waits on the draft card (ruling B)", () => {
  it('control: with descriptions that name no PC, each hit gets the figure the narration gives them', async () => {
    script(NARRATION, detection('A net-mender by the airlock.'));
    expect((await narrate()).posted).toBe('card');
    expect({ kira: bondsOf(kira), ren: bondsOf(ren) }).toEqual({ kira: ['Orla Teague'], ren: ['Dace Mirren'] });
  });

  it("Orla Teague, whom the narration gives Kira but whose description says she once crewed with Ren, is nobody's connection automatically", async () => {
    script(NARRATION, detection('A net-mender by the airlock who once crewed with Ren.'));
    expect((await narrate()).posted).toBe('card');
    expect.soft(bondsOf(ren), "Ren's bonds").not.toContain('Orla Teague');
    expect({ kira: bondsOf(kira), ren: bondsOf(ren) }).toEqual({ kira: [], ren: ['Dace Mirren'] });
    expect(createdNames()).toEqual(['Dace Mirren']);
  });

  it('she is offered on the New Entities card, whose Confirm has a button per acting PC and No one', async () => {
    script(NARRATION, detection('A net-mender by the airlock who once crewed with Ren.'));
    await narrate();
    const cards = draftCards();
    expect(cards).toHaveLength(1);
    const f = cards[0].flags[MODULE_ID];
    expect(f.drafts.map(d => [d.name, d.status])).toEqual([['Orla Teague', 'pending']]);
    expect(f.actorIds).toEqual(['pc-kira', 'pc-ren']);
    const row = parseHTML(cards[0].content).querySelectorAll('.sf-draft-row')[0];
    const buttons = [...row.querySelectorAll('[data-action="sf-draft-confirm"]')].map(b => [b.dataset.actorId, b.textContent]);
    expect(buttons).toEqual([['pc-kira', 'Kira'], ['pc-ren', 'Ren'], ['', 'No one']]);
  });

  it('control: a description that names the PC the narration gives her agrees — she is that PC\'s', async () => {
    script(NARRATION, detection('A net-mender by the airlock who took Kira in.'));
    await narrate();
    expect({ kira: bondsOf(kira), ren: bondsOf(ren) }).toEqual({ kira: ['Orla Teague'], ren: ['Dace Mirren'] });
    expect(draftCards()).toEqual([]);
  });

  it('control: a description that names a PC the narration does not contradict still places her', async () => {
    // The narration names Orla in a sentence with no PC: the description is the only word on who she is with.
    script(
      'Orla Teague mends nets by the airlock. Across the concourse, Ren shares a bottle with Dace Mirren, a courier who owes nobody.' + SIDECAR,
      detection('A net-mender by the airlock who is looking for Kira.'),
    );
    await narrate();
    expect({ kira: bondsOf(kira), ren: bondsOf(ren) }).toEqual({ kira: ['Orla Teague'], ren: ['Dace Mirren'] });
  });
});
