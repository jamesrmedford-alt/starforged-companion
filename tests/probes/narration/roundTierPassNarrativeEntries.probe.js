/**
 * NARR-4 ROUND-TIER-PASS-SKIPS-UNROLLED-ENTRIES (eleventh audit, narration) —
 * a Batch Mode round's tier pass (an NPC's NARRATOR-ADDED developments) runs
 * only over the entities a ROLLED entry's relevance named.
 *
 * narrateRound builds `relevance` from the move entries alone
 * (narrator.js:960-970) and hands that to runRoundNarrationPasses →
 * runPostNarrationPasses, whose interaction-class tier pass runs only when
 * `relevance.entityIds` is non-empty. An entry with no roll — "I ask Vance
 * where the shipment went", the round's paced narration — counts as
 * interaction (widestRoundClass) and its text is matched lexically into the
 * PROMPT (buildNarratorExtras 'round_resolution': Vance's card is in ENTITIES
 * IN SCENE), but never into the capture: a round of unrolled actions records
 * nothing on the NPCs it develops. The same line in free-flow is a paced
 * narration, whose tier pass runs over everything the prompt matched
 * (schedulePacedTierUpdate(text, extras.matchedEntityIds, …)). The Batch
 * Mode decision: an action with no roll "is narrated as paced narration is,
 * at interaction" (widestRoundClass's doc) — its capture is not.
 */

/* global structuredClone */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../../src/multiplayer/gmGate.js', async (importOriginal) => ({
  ...(await importOriginal()), isCanonicalGM: vi.fn(() => true),
}));
// The lexical name index: "Vance" names the recorded connection npc-vance.
vi.mock('../../../src/context/relevanceResolver.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveRelevance: vi.fn(async (text) => (/\bVance\b/.test(String(text ?? ''))
      ? { resolvedClass: 'interaction', entityIds: ['npc-vance'], entityTypes: ['connection'], matchedNames: ['Vance'], needsClarification: false, referenceType: 'named' }
      : { resolvedClass: 'embellishment', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' })),
  };
});
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass:    vi.fn(async () => ({ entities: [], renames: [], worldJournal: {} })),
  routeWorldJournalResults:    vi.fn(async () => {}),
  routeEntityDrafts:           vi.fn(async () => ({ created: [], queued: [] })),
  applyEntityRenames:          vi.fn(async () => {}),
  appendGenerativeTierUpdates: vi.fn(async () => []),
}));

import { apiPost } from '../../../src/api-proxy.js';
import { narrateRound, narratePacedInput } from '../../../src/narration/narrator.js';
import { appendGenerativeTierUpdates } from '../../../src/entities/entityExtractor.js';

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

describe('NARR-4 — a round\'s unrolled actions get no tier pass', () => {
  it('a round of two actions with no roll, one naming Vance: Vance\'s developments are captured, as paced narration\'s are', async () => {
    const res = await narrateRound({ round: ROUND, campaignState: structuredClone(CS) });
    expect(res.posted).toBe('card');
    // Control: Vance reached the prompt (his card is matched for the narration).
    const narration = apiPost.mock.calls.find(([, , body]) => Array.isArray(body?.system));
    expect(String(narration?.[2]?.messages?.[0]?.content ?? '')).toContain('I ask Vance where the shipment went.');
    expect(res.card.flags[MODULE_ID].matchedEntityIds).toContain('npc-vance');
    await vi.advanceTimersByTimeAsync(2500);   // the interaction-class passes run ~2 s after the card
    expect(tierRefs()).toContain('npc-vance');   // today: [] — the tier pass never ran
  });

  it('a round with a discovery-class roll beside an interaction-class Compel on Vance: Vance\'s developments are still captured', async () => {
    const round = structuredClone(ROUND);
    round.entries['pl-1'].text = 'I press Vance to tell me where the shipment went.';
    round.entries['pl-1'].rolled.narrationInput = {
      kind: 'move', moveId: 'compel', moveName: 'Compel', statUsed: 'heart', outcome: 'weak_hit', outcomeLabel: 'Weak Hit',
      relevance: { resolvedClass: 'interaction', entityIds: ['npc-vance'], entityTypes: ['connection'] }, resolutionId: 'res-k',
    };
    round.entries['pl-2'].text = 'I search the derelict hold for the manifest.';
    round.entries['pl-2'].rolled.narrationInput = {
      kind: 'move', moveId: 'gather_information', moveName: 'Gather Information', statUsed: 'wits', outcome: 'strong_hit', outcomeLabel: 'Strong Hit',
      relevance: { resolvedClass: 'discovery', entityIds: [], entityTypes: [] }, resolutionId: 'res-r',
    };
    const res = await narrateRound({ round, campaignState: structuredClone(CS) });
    expect(res.posted).toBe('card');
    await vi.advanceTimersByTimeAsync(2500);
    // In free-flow the Compel's own narration runs the tier pass over Vance (runPostNarrationPasses,
    // interaction); the round runs the widest class — discovery — whose branch has no tier pass.
    expect(tierRefs()).toContain('npc-vance');   // today: []
  });

  it('control: the same line in free-flow (a paced narration) runs the tier pass over Vance', async () => {
    await narratePacedInput('I ask Vance where the shipment went.', structuredClone(CS), {});
    await vi.advanceTimersByTimeAsync(2500);
    expect(tierRefs()).toContain('npc-vance');
  });
});
