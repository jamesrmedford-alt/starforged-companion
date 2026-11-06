/**
 * Probe — BATCH-3 ROUND-CAPTURE-LEAD-CONNECTION-MISS (eleventh audit).
 *
 * A round's narration gets one capture pass (runRoundNarrationPasses →
 * runPostNarrationPasses) at the round's widest class, with the move of a
 * "lead" entry: a Make a Connection hit when there is one, else the FIRST
 * acting entry. runPostNarrationPasses returns with no pass at all for a
 * discovery-class narration whose move is Make a Connection and whose outcome
 * is a miss (scope §9: "no entity creation on a miss") — a rule about that
 * one move. So when the first entry to confirm is a Make a Connection miss,
 * the whole round's capture is skipped: Ren's Gather Information strong hit
 * (discovery) in the same round records no lore, threat or NPC draft. Swap
 * the confirm order and the same round is captured.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../../src/entities/entityExtractor.js', async () => {
  const actual = await vi.importActual('../../../src/entities/entityExtractor.js');
  return {
    ...actual,
    runCombinedDetectionPass:    vi.fn(async () => ({ entities: [], renames: [], worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] } })),
    routeWorldJournalResults:    vi.fn(async () => {}),
    routeEntityDrafts:           vi.fn(async () => ({ created: [], queued: [] })),
    applyEntityRenames:          vi.fn(async () => {}),
    appendGenerativeTierUpdates: vi.fn(async () => []),
  };
});

import { apiPost } from '../../../src/api-proxy.js';
import { runCombinedDetectionPass } from '../../../src/entities/entityExtractor.js';
import { narrateRound } from '../../../src/narration/narrator.js';
import { invalidateActorCache } from '../../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

const KIRA_CONNECTION_MISS = {
  kind: 'move', moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart',
  outcome: 'miss', outcomeLabel: 'Miss', isMatch: false, loremasterContext: 'Make a Connection: miss.',
  oracleSeeds: null, relevance: { resolvedClass: 'discovery', entityIds: [], entityTypes: [] }, resolutionId: 'res-k',
};
const REN_GATHER_STRONG = {
  kind: 'move', moveId: 'gather_information', moveName: 'Gather Information', statUsed: 'wits',
  outcome: 'strong_hit', outcomeLabel: 'Strong Hit', isMatch: false, loremasterContext: 'Gather Information: strong hit.',
  oracleSeeds: null, relevance: { resolvedClass: 'discovery', entityIds: [], entityTypes: [] }, resolutionId: 'res-r',
};

function roundOf(order) {
  return {
    id: 'round-1', number: 1, phase: 'narrating', acting: order,
    entries: {
      'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I hail the dockmaster and ask for a name.', rolled: { narrationInput: KIRA_CONNECTION_MISS } },
      'pl-2': { userId: 'pl-2', actorId: 'pc-ren', actorName: 'Ren', text: 'I pull the station manifest for who docked last night.', rolled: { narrationInput: REN_GATHER_STRONG } },
    },
  };
}

function installPc(id, name) {
  const pc = makeTestActor({ id, type: 'character', name, hasPlayerOwner: true, system: {} });
  game.actors._set(id, pc);
  invalidateActorCache(id);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  apiPost.mockImplementation(async () => ({
    content: [{ type: 'text', text: 'The dockmaster turns away; Ren finds the smuggler\'s berth in the manifest.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' }],
    usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'end_turn',
  }));
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1', sessionNumber: 1, currentSceneId: 'sc-1' });
  ChatMessage._reset();
  installPc('pc-kira', 'Kira');
  installPc('pc-ren', 'Ren');
});
afterEach(() => { vi.useRealTimers(); });

async function narrate(order) {
  const res = await narrateRound({ round: roundOf(order), campaignState: game.settings.get(MODULE_ID, 'campaignState') });
  await vi.advanceTimersByTimeAsync(3000);   // the async detection fires ~2 s after the card
  return res;
}

describe('BATCH-3 — a round whose first entry is a Make a Connection miss', () => {
  it('control: Ren confirmed first — the round narration gets its discovery capture pass', async () => {
    const res = await narrate(['pl-2', 'pl-1']);
    expect(res.posted).toBe('card');
    expect(runCombinedDetectionPass).toHaveBeenCalledTimes(1);
  });

  it('Kira confirmed first — Ren\'s Gather Information hit is still captured', async () => {
    const res = await narrate(['pl-1', 'pl-2']);
    expect(res.posted).toBe('card');
    // The same round, the same narration, the same widest class (discovery).
    expect(runCombinedDetectionPass).toHaveBeenCalledTimes(1);
  });
});
