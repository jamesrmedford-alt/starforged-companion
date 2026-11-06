/**
 * ROUND-CHARACTER-BLOCK-GONE-PC (found while fixing issue #342) — a Batch
 * Mode round's CHARACTER blocks are the acting PCs' own, and no one else's.
 *
 * narrateRound built a CHARACTER block per entry with getActiveCharacter,
 * which, for an actor id that no longer resolves, falls back to the
 * campaign's first PC. An entry whose PC was deleted after the round opened
 * is refused, not rolled (issue #342 Z35), and still narrated as an action
 * with no roll — so its fallback brought another PC's block into the round's
 * prompt: a PC who sat the round out, whose stats, meters and notes the
 * narrator was then handed as though they had acted (and whose block made
 * the round "two acting characters" for the perspective rule, Z40). A
 * round's blocks are now built only for entries whose PC is still in the
 * game.
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
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const CS = { currentSessionId: 's1', sessionNumber: 1, currentSceneId: 'sc-1' };

function installPc(id, name) {
  game.actors._set(id, makeTestActor({ id, type: 'character', name, hasPlayerOwner: true }));
  invalidateActorCache(id);
}

// Ash's player acted, then Ash was deleted: the driver refused the entry
// ("Its character is no longer in the game."). Kira acted too. Vex — the
// campaign's first PC — sat the round out.
const round = () => ({
  id: 'round-3', number: 3, phase: 'narrating', acting: ['pl-ash', 'pl-kira'],
  entries: {
    'pl-ash':  {
      userId: 'pl-ash', actorId: 'pc-ash', actorName: 'Ash', text: 'I cut the docking clamps.',
      rolled: { narrationInput: { kind: 'refused', moveId: 'face_danger', moveName: 'Face Danger', reason: 'Its character is no longer in the game.' } },
    },
    'pl-kira': {
      userId: 'pl-kira', actorId: 'pc-kira', actorName: 'Kira', text: 'I brace the cargo before it shifts.',
      rolled: { narrationInput: { kind: 'narrative' } },
    },
  },
});

const systemPrompt = () => {
  const call = apiPost.mock.calls.find(([, , body]) => Array.isArray(body?.system));
  return String(call?.[2]?.system?.[0]?.text ?? '');
};
const characterNames = (system) => [...system.matchAll(/^## CHARACTER\nName: ([^\n(]+)/gm)].map(m => m[1].trim());

beforeEach(() => {
  vi.clearAllMocks();
  apiPost.mockImplementation(async () => reply('Kira braces the cargo as the clamps let go.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'));
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  game.settings._store.set(`${MODULE_ID}.campaignState`, structuredClone(CS));
  global.game.messages = { contents: [], get: () => null };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }, { id: 'pl-kira', isGM: false, active: true }];
  ChatMessage._reset();
  installPc('pc-vex', 'Vex');      // the campaign's first PC — not acting
  installPc('pc-kira', 'Kira');
});

describe('ROUND-CHARACTER-BLOCK-GONE-PC — a gone PC\'s entry brings no other PC\'s block', () => {
  it('Ash is gone and refused: the prompt has Kira\'s block alone, not Vex\'s in Ash\'s place', async () => {
    const res = await narrateRound({ round: round(), campaignState: structuredClone(CS) });
    expect(res.posted).toBe('card');
    const system = systemPrompt();
    expect(characterNames(system)).toEqual(['Kira']);        // was ['Vex', 'Kira']
    // One CHARACTER block: the perspective rule counts one acting character.
    expect(system).toContain('Address the player character directly as "you"');
  });

  it('control: with every acting PC still in the game, each has its own block, in the round\'s order', async () => {
    installPc('pc-ash', 'Ash');
    const ok = round();
    ok.entries['pl-ash'].rolled = { narrationInput: { kind: 'narrative' } };
    await narrateRound({ round: ok, campaignState: structuredClone(CS) });
    expect(characterNames(systemPrompt())).toEqual(['Ash', 'Kira']);
  });

  it('control: the gone PC\'s action is still narrated, as not rolled, under the name the round copied', async () => {
    await narrateRound({ round: round(), campaignState: structuredClone(CS) });
    const call = apiPost.mock.calls.find(([, , body]) => Array.isArray(body?.system));
    const user = String(call?.[2]?.messages?.[0]?.content ?? '');
    expect(user).toContain('Ash — Face Danger: not rolled');
    expect(user).toContain('Kira — no roll');
    expect(user).not.toContain('Vex');
  });
});
