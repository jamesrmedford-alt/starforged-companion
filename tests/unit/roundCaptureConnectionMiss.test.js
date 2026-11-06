/* global makeTestActor -- tests/setup.js and Node globals, as in tests/unit */
/**
 * Issue #342 Z08 ROUND-CAPTURE-LEAD-CONNECTION-MISS (the eleventh audit's
 * BATCH-3).
 *
 * A Batch Mode round's narration gets one capture pass, routed for the round
 * (runRoundNarrationPasses). Make a Connection is discovery-class by the move
 * table even on a miss, and a miss creates no one (scope §9) — a rule about
 * that one entry. It used to be the round's: the capture took the first entry
 * to confirm as its "lead", and a lead that was a Make a Connection miss
 * skipped the whole round's capture, so Ren's Gather Information strong hit in
 * the same round recorded no lore, threat or NPC draft; swap the confirm order
 * and the same round was captured. Now the miss only withholds its own
 * auto-create: the rest of the round is captured whatever the order.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../src/entities/entityExtractor.js', async () => {
  const actual = await vi.importActual('../../src/entities/entityExtractor.js');
  return {
    ...actual,
    runCombinedDetectionPass:    vi.fn(async () => ({ entities: [], renames: [], worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] } })),
    routeWorldJournalResults:    vi.fn(async () => {}),
    routeEntityDrafts:           vi.fn(async () => ({ created: [], queued: [] })),
    applyEntityRenames:          vi.fn(async () => {}),
    appendGenerativeTierUpdates: vi.fn(async () => []),
  };
});

import { apiPost } from '../../src/api-proxy.js';
import { runCombinedDetectionPass, routeEntityDrafts } from '../../src/entities/entityExtractor.js';
import { narrateRound } from '../../src/narration/narrator.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

const connectionMove = (outcome) => ({
  kind: 'move', moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart',
  outcome, outcomeLabel: outcome === 'miss' ? 'Miss' : 'Strong Hit', isMatch: false, loremasterContext: `Make a Connection: ${outcome}.`,
  oracleSeeds: null, relevance: { resolvedClass: 'discovery', entityIds: [], entityTypes: [] }, resolutionId: 'res-k',
});
const REN_GATHER_STRONG = {
  kind: 'move', moveId: 'gather_information', moveName: 'Gather Information', statUsed: 'wits',
  outcome: 'strong_hit', outcomeLabel: 'Strong Hit', isMatch: false, loremasterContext: 'Gather Information: strong hit.',
  oracleSeeds: null, relevance: { resolvedClass: 'discovery', entityIds: [], entityTypes: [] }, resolutionId: 'res-r',
};

function roundOf(order, { kira = connectionMove('miss'), ren = REN_GATHER_STRONG } = {}) {
  return {
    id: 'round-1', number: 1, phase: 'narrating', acting: order,
    entries: {
      'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I hail the dockmaster and ask for a name.', rolled: { narrationInput: kira } },
      'pl-2': { userId: 'pl-2', actorId: 'pc-ren', actorName: 'Ren', text: 'I pull the station manifest for who docked last night.', rolled: { narrationInput: ren } },
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

async function narrate(round) {
  const res = await narrateRound({ round, campaignState: game.settings.get(MODULE_ID, 'campaignState') });
  await vi.advanceTimersByTimeAsync(3000);   // the async detection fires ~2 s after the card
  return res;
}

describe('Z08 — a round whose first entry is a Make a Connection miss', () => {
  it('control: Ren confirmed first — the round narration gets its discovery capture pass', async () => {
    const res = await narrate(roundOf(['pl-2', 'pl-1']));
    expect(res.posted).toBe('card');
    expect(runCombinedDetectionPass).toHaveBeenCalledTimes(1);
  });

  it("Kira confirmed first — Ren's Gather Information hit is still captured", async () => {
    const res = await narrate(roundOf(['pl-1', 'pl-2']));
    expect(res.posted).toBe('card');
    // The same round, the same narration, the same widest class (discovery).
    expect(runCombinedDetectionPass).toHaveBeenCalledTimes(1);
    // …and the miss creates no one: nothing is auto-created for Kira.
    const opts = routeEntityDrafts.mock.calls[0][2] ?? {};
    expect(opts.autoCreateConnection === true || (opts.connectionRollers ?? []).length > 0).toBe(false);
  });

  it('a round whose only entry is a Make a Connection miss is captured as a free-flow miss is — not at all', async () => {
    const round = roundOf(['pl-1']);
    delete round.entries['pl-2'];
    const res = await narrate(round);
    expect(res.posted).toBe('card');
    expect(runCombinedDetectionPass).not.toHaveBeenCalled();
  });

  it("a miss beside another player's hit leaves the hit's auto-create its own", async () => {
    const round = roundOf(['pl-1', 'pl-2'], { ren: { ...connectionMove('strong_hit'), resolutionId: 'res-r' } });
    const res = await narrate(round);
    expect(res.posted).toBe('card');
    expect(runCombinedDetectionPass).toHaveBeenCalledTimes(1);
    const opts = routeEntityDrafts.mock.calls[0][2] ?? {};
    const rollers = opts.connectionRollers ?? (opts.autoCreateConnection ? [{ actorId: opts.actorId }] : []);
    expect(rollers.map(r => r.actorId)).toEqual(['pc-ren']);
  });
});
