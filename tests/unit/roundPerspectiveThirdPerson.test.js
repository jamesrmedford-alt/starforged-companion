/**
 * Issue #342 Z40 ROUND-SECOND-PERSON-TWO-ACTORS (the eleventh audit's NARR-5)
 * — a Batch Mode round with two acting PCs is narrated in the third person,
 * whoever is connected.
 *
 * Batch Mode's participants are the connected users with a PC of their own,
 * "a GM only with an assigned PC" (decisions.md → Batch Mode). A GM playing
 * Ash beside one player's Kira is a two-PC round. Perspective "auto"
 * (resolveNarrationPerspective) counted active NON-GM users — one — and
 * resolved to second person: the system prompt said 'Address the player
 * character directly as "you"' over two CHARACTER blocks, while its own PARTY
 * block says 'never merge the player characters into a single "you"'. The
 * perspective decision: third person "for multiplayer where multiple
 * characters are present and 'you' becomes ambiguous" — in a round, one
 * narration tells both characters' actions. "auto" now counts the acting PCs
 * a narration speaks for too; an explicit setting still wins.
 */

/* global makeTestActor, structuredClone */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { narrateRound } from '../../src/narration/narrator.js';
import { resolveNarrationPerspective } from '../../src/narration/narratorPrompt.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const CS = { currentSessionId: 's1', sessionNumber: 1, currentSceneId: 'sc-1' };

function installPc(id, name) {
  game.actors._set(id, makeTestActor({ id, type: 'character', name, hasPlayerOwner: true }));
  invalidateActorCache(id);
}

const round = () => ({
  id: 'round-2', number: 2, phase: 'narrating', acting: ['gm-1', 'pl-1'],
  entries: {
    'gm-1': { userId: 'gm-1', actorId: 'pc-ash',  actorName: 'Ash',  text: 'I take the helm and bank us hard to port.', rolled: { narrationInput: { kind: 'narrative' } } },
    'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I brace the cargo before it shifts.', rolled: { narrationInput: { kind: 'narrative' } } },
  },
});

const systemPrompt = () => {
  const call = apiPost.mock.calls.find(([, , body]) => Array.isArray(body?.system));
  return String(call?.[2]?.system?.[0]?.text ?? '');
};

beforeEach(() => {
  vi.clearAllMocks();
  apiPost.mockImplementation(async () => reply('Ash banks the ship as Kira braces the cargo.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'));
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  game.settings._store.set(`${MODULE_ID}.campaignState`, structuredClone(CS));
  global.game.messages = { contents: [], get: () => null };
  ChatMessage._reset();
  installPc('pc-ash', 'Ash');
  installPc('pc-kira', 'Kira');
});

describe('Z40 — a two-PC round at a one-player table', () => {
  it('the GM\'s Ash and the player\'s Kira act in one round: it is narrated in the third person, by name', async () => {
    global.game.users = [{ id: 'gm-1', isGM: true, active: true }, { id: 'pl-1', isGM: false, active: true }];
    const res = await narrateRound({ round: round(), campaignState: structuredClone(CS) });
    expect(res.posted).toBe('card');
    const system = systemPrompt();
    expect(system.match(/^## CHARACTER$/gm)).toHaveLength(2);              // control: both acting PCs' blocks
    expect(system).toContain('never merge the player characters into a single "you"');   // control: the PARTY block
    expect(system).not.toContain('Address the player character directly as "you"');      // was: the second-person line
    expect(system).toContain('Refer to characters by name.');
  });

  it('control: at a two-player table the same round is third person', async () => {
    global.game.users = [{ id: 'gm-1', isGM: true, active: true }, { id: 'pl-1', isGM: false, active: true }, { id: 'pl-2', isGM: false, active: true }];
    await narrateRound({ round: round(), campaignState: structuredClone(CS) });
    expect(systemPrompt()).toContain('Refer to characters by name.');
  });

  it('a GM who chose second person keeps it — only "auto" follows the round', async () => {
    global.game.users = [{ id: 'gm-1', isGM: true, active: true }, { id: 'pl-1', isGM: false, active: true }];
    game.settings._store.set(`${MODULE_ID}.narrationPerspective`, 'second_person');
    await narrateRound({ round: round(), campaignState: structuredClone(CS) });
    expect(systemPrompt()).toContain('Address the player character directly as "you"');
  });

  it("control: a round with one acting PC at a one-player table is second person, as that player's free-flow narration is", async () => {
    global.game.users = [{ id: 'gm-1', isGM: true, active: true }, { id: 'pl-1', isGM: false, active: true }];
    const one = round();
    one.acting = ['pl-1'];
    delete one.entries['gm-1'];
    await narrateRound({ round: one, campaignState: structuredClone(CS) });
    expect(systemPrompt().match(/^## CHARACTER$/gm)).toHaveLength(1);
    expect(systemPrompt()).toContain('Address the player character directly as "you"');
  });
});

describe('resolveNarrationPerspective', () => {
  it('"auto" is third person for a narration that speaks for two or more PCs, whoever is connected', () => {
    global.game.users = [{ id: 'gm-1', isGM: true, active: true }, { id: 'pl-1', isGM: false, active: true }];
    expect(resolveNarrationPerspective('auto')).toBe('second_person');
    expect(resolveNarrationPerspective('auto', { actingCharacters: 1 })).toBe('second_person');
    expect(resolveNarrationPerspective('auto', { actingCharacters: 2 })).toBe('third_person');
    expect(resolveNarrationPerspective('second_person', { actingCharacters: 2 })).toBe('second_person');
  });
});
