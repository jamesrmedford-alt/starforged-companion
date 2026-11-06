/**
 * Issue #342 Z10 ROUND-TIER-PASS-SKIPS-UNROLLED-ENTRIES (the eleventh audit's
 * NARR-4) — a Batch Mode round's tier pass (an NPC's NARRATOR-ADDED
 * developments).
 *
 * narrateRound used to build the capture's relevance from the move entries
 * alone, and runPostNarrationPasses ran the tier pass only at the
 * interaction class with entities in that relevance: an entry with no roll —
 * "I ask Vance where the shipment went", narrated as paced narration is
 * (widestRoundClass) — matched Vance into the PROMPT (buildNarratorExtras
 * 'round_resolution') but never into the tier pass, and one discovery-class
 * roll in the round sent the whole capture down the discovery branch, which
 * has none. Now the round's tier pass runs whatever the widest class is, each
 * entry as its free-flow narration's would: an unrolled action brings what the
 * prompt matched (paced's rule, schedulePacedTierUpdate); a rolled
 * interaction-class move its own relevance (the move pass's rule —
 * architecture §8.2).
 */

/* global structuredClone */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../src/multiplayer/gmGate.js', async (importOriginal) => ({
  ...(await importOriginal()), isCanonicalGM: vi.fn(() => true),
}));
// The lexical name index: "Vance" and "Doss" name the recorded connections npc-vance and npc-doss.
vi.mock('../../src/context/relevanceResolver.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveRelevance: vi.fn(async (text) => {
      const ids = [/\bVance\b/, /\bDoss\b/].map((re, i) => (re.test(String(text ?? '')) ? ['npc-vance', 'npc-doss'][i] : null)).filter(Boolean);
      return ids.length
        ? { resolvedClass: 'interaction', entityIds: ids, entityTypes: ids.map(() => 'connection'), matchedNames: [], needsClarification: false, referenceType: 'named' }
        : { resolvedClass: 'embellishment', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' };
    }),
  };
});
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass:    vi.fn(async () => ({ entities: [], renames: [], worldJournal: {} })),
  routeWorldJournalResults:    vi.fn(async () => {}),
  routeEntityDrafts:           vi.fn(async () => ({ created: [], queued: [] })),
  applyEntityRenames:          vi.fn(async () => {}),
  appendGenerativeTierUpdates: vi.fn(async () => []),
}));

import { apiPost } from '../../src/api-proxy.js';
import { narrateRound, narratePacedInput } from '../../src/narration/narrator.js';
import { appendGenerativeTierUpdates } from '../../src/entities/entityExtractor.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'Vance looks away and admits he sold the shipment to the Syndicate.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const CS = { currentSessionId: 's1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' } };

const ROUND = {
  id: 'round-4', number: 4, phase: 'narrating', acting: ['pl-1', 'pl-2'],
  entries: {
    'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I ask Vance where the shipment went.', rolled: { narrationInput: { kind: 'narrative' } } },
    'pl-2': { userId: 'pl-2', actorId: 'pc-ren',  actorName: 'Ren',  text: 'I keep the corridor covered.', rolled: { narrationInput: { kind: 'narrative' } } },
  },
};

const COMPEL_ON_VANCE = {
  kind: 'move', moveId: 'compel', moveName: 'Compel', statUsed: 'heart', outcome: 'weak_hit', outcomeLabel: 'Weak Hit',
  relevance: { resolvedClass: 'interaction', entityIds: ['npc-vance'], entityTypes: ['connection'] }, resolutionId: 'res-k',
};
const GATHER_INFORMATION = {
  kind: 'move', moveId: 'gather_information', moveName: 'Gather Information', statUsed: 'wits', outcome: 'strong_hit', outcomeLabel: 'Strong Hit',
  relevance: { resolvedClass: 'discovery', entityIds: [], entityTypes: [] }, resolutionId: 'res-r',
};

const tierRefs = () => vi.mocked(appendGenerativeTierUpdates).mock.calls.flatMap(c => (c[1] ?? []).map(r => r.journalId));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  apiPost.mockImplementation(async () => reply(PROSE));
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  game.settings._store.set(`${MODULE_ID}.campaignState`, structuredClone(CS));
  global.game.messages = { contents: [], get: () => null };
  ChatMessage._reset();
});
afterEach(() => { vi.useRealTimers(); });

describe("Z10 — a round's tier pass covers what its interaction-class entries were about", () => {
  it("a round of two actions with no roll, one naming Vance: Vance's developments are captured, as paced narration's are", async () => {
    const res = await narrateRound({ round: ROUND, campaignState: structuredClone(CS) });
    expect(res.posted).toBe('card');
    // Control: Vance reached the prompt (his card is matched for the narration).
    const narration = apiPost.mock.calls.find(([, , body]) => Array.isArray(body?.system));
    expect(String(narration?.[2]?.messages?.[0]?.content ?? '')).toContain('I ask Vance where the shipment went.');
    expect(res.card.flags[MODULE_ID].matchedEntityIds).toContain('npc-vance');
    await vi.advanceTimersByTimeAsync(2500);   // the interaction-class passes run ~2 s after the card
    expect(tierRefs()).toContain('npc-vance');   // was: [] — the tier pass never ran
    // …stamped with the round's narration, so an X-Card on it takes the details off again.
    expect(vi.mocked(appendGenerativeTierUpdates).mock.calls[0][4]).toEqual({ narrationId: res.narrationId });
  });

  it("a round with a discovery-class roll beside an interaction-class Compel on Vance: Vance's developments are still captured", async () => {
    const round = structuredClone(ROUND);
    round.entries['pl-1'].text = 'I press Vance to tell me where the shipment went.';
    round.entries['pl-1'].rolled.narrationInput = COMPEL_ON_VANCE;
    round.entries['pl-2'].text = 'I search the derelict hold for the manifest.';
    round.entries['pl-2'].rolled.narrationInput = GATHER_INFORMATION;
    const res = await narrateRound({ round, campaignState: structuredClone(CS) });
    expect(res.posted).toBe('card');
    await vi.advanceTimersByTimeAsync(2500);
    // In free-flow the Compel's own narration runs the tier pass over Vance (runPostNarrationPasses,
    // interaction); the round used to run only the widest class's — discovery, which has none.
    expect(tierRefs()).toContain('npc-vance');   // was: []
  });

  it("a rolled move's tier pass keeps to its own relevance — not the names another line matched (architecture §8.2)", async () => {
    const round = structuredClone(ROUND);
    round.entries['pl-1'].text = 'I press Vance to tell me where the shipment went.';
    round.entries['pl-1'].rolled.narrationInput = COMPEL_ON_VANCE;
    round.entries['pl-2'].text = 'I ask around the dock for Doss.';
    round.entries['pl-2'].rolled.narrationInput = GATHER_INFORMATION;
    const res = await narrateRound({ round, campaignState: structuredClone(CS) });
    expect(res.card.flags[MODULE_ID].matchedEntityIds).toEqual(expect.arrayContaining(['npc-vance', 'npc-doss']));   // the prompt saw both
    await vi.advanceTimersByTimeAsync(2500);
    expect(tierRefs()).toEqual(['npc-vance']);   // the Gather Information's Doss is discovery: no tier pass, as in free-flow
  });

  it('control: a round of one embellishment-class roll runs no tier pass', async () => {
    const round = structuredClone(ROUND);
    round.acting = ['pl-1'];
    round.entries['pl-1'].rolled.narrationInput = {
      kind: 'move', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', outcome: 'strong_hit', outcomeLabel: 'Strong Hit',
      relevance: { resolvedClass: 'embellishment', entityIds: [], entityTypes: [] }, resolutionId: 'res-k',
    };
    await narrateRound({ round, campaignState: structuredClone(CS) });
    await vi.advanceTimersByTimeAsync(2500);
    expect(appendGenerativeTierUpdates).not.toHaveBeenCalled();
  });

  it('control: the same line in free-flow (a paced narration) runs the tier pass over Vance', async () => {
    await narratePacedInput('I ask Vance where the shipment went.', structuredClone(CS), {});
    await vi.advanceTimersByTimeAsync(2500);
    expect(tierRefs()).toContain('npc-vance');
  });
});
