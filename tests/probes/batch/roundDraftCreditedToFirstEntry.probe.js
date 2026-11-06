/* global makeTestActor -- tests/setup.js and Node globals, as in tests/unit */
/**
 * Probe — BATCH-D1 ROUND-CAPTURE-ACTOR (eleventh audit; a decision row).
 *
 * A move narration's capture pass is handed the roller's PC (`actorId`, issue
 * #321 U23): a detected NPC's draft card carries it, and its Confirm puts the
 * new connection on that PC's sheet. A round's one capture pass is handed
 * `lead.actorId` — the Make a Connection hit's roller, else the FIRST entry
 * to confirm. So in a round where Kira (first) only keeps watch and Ren's
 * Gather Information strong hit turns up the smuggler, the smuggler's draft
 * is Kira's: Confirm files the connection on Kira's sheet. Which PC a round's
 * discovered NPC belongs to is the maintainer's call (see the decision row);
 * this pins that today it is simply whoever confirmed first.
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
    runCombinedDetectionPass:    vi.fn(async () => ({ entities: [{ name: 'Vess', entityType: 'connection' }], renames: [], worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] } })),
    routeWorldJournalResults:    vi.fn(async () => {}),
    routeEntityDrafts:           vi.fn(async () => ({ created: [], queued: [] })),
    applyEntityRenames:          vi.fn(async () => {}),
    appendGenerativeTierUpdates: vi.fn(async () => []),
  };
});

import { apiPost } from '../../../src/api-proxy.js';
import { routeEntityDrafts } from '../../../src/entities/entityExtractor.js';
import { narrateRound } from '../../../src/narration/narrator.js';
import { invalidateActorCache } from '../../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

const REN_GATHER_STRONG = {
  kind: 'move', moveId: 'gather_information', moveName: 'Gather Information', statUsed: 'wits',
  outcome: 'strong_hit', outcomeLabel: 'Strong Hit', isMatch: false, loremasterContext: 'Gather Information: strong hit.',
  oracleSeeds: null, relevance: { resolvedClass: 'discovery', entityIds: [], entityTypes: [] }, resolutionId: 'res-r',
};

function roundOf(order) {
  return {
    id: 'round-1', number: 1, phase: 'narrating', acting: order,
    entries: {
      'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I keep watch on the docking ring.', rolled: { narrationInput: { kind: 'narrative' } } },
      'pl-2': { userId: 'pl-2', actorId: 'pc-ren', actorName: 'Ren', text: 'I pull the manifest for who docked last night.', rolled: { narrationInput: REN_GATHER_STRONG } },
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
    content: [{ type: 'text', text: 'Kira watches the ring; Ren finds that Vess, a smuggler, docked at midnight.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' }],
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

async function draftsActorFor(order) {
  await narrateRound({ round: roundOf(order), campaignState: game.settings.get(MODULE_ID, 'campaignState') });
  await vi.advanceTimersByTimeAsync(3000);
  expect(routeEntityDrafts).toHaveBeenCalledTimes(1);
  return routeEntityDrafts.mock.calls[0][2]?.actorId ?? null;
}

describe('BATCH-D1 — whose PC a round\'s discovered NPC is filed under', () => {
  it('control: Ren (the discovering move) confirmed first — the draft is Ren\'s', async () => {
    expect(await draftsActorFor(['pl-2', 'pl-1'])).toBe('pc-ren');
  });

  it('Kira (no roll) confirmed first — the draft is still the discovering move\'s roller, not the first entry\'s', async () => {
    expect(await draftsActorFor(['pl-1', 'pl-2'])).toBe('pc-ren');
  });
});
