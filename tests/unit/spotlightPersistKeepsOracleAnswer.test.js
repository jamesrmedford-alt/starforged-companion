/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/spotlightPersistKeepsOracleAnswer.test.js
 *
 * CAMPSTATE-CHAIN-PARTIAL (found while fixing issue #342 Z17) — the spotlight
 * persist.
 *
 * A paced narration advances the multiplayer spotlight and persists its
 * pointer — `{ ...cached, spotlight }`, a whole-object write (narrator.js
 * maybeAdvanceSpotlight). Sent while the GM's oracle capture was on its way,
 * it was built from a cache without the answer and, applied after it, erased
 * the answer from RECENT ORACLE RESULTS. The persist now runs on the client's
 * campaignState write chain.
 *
 * The harness applies a write at once, so the GM's campaignState writes are
 * held and released in the order the client sent them (the server applies
 * them in that order) — the round trip the harness does not model. The
 * narration carries no fact block, so no sidecar persist follows it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { campaignStateWrite, deferred, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const NARRATIVE = JSON.stringify({
  decision: 'NARRATIVE', suggestedMove: null, sceneChallenge: null,
  category: 'social', confidence: 0.9, reasoning: 'conversation, no move',
});

let table;
let gates = [];
const world = () => table.world.campaignState();
const questions = () => (world().recentOracles ?? []).map(e => e.question);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());
afterEach(async () => {
  for (const g of gates) g.resolve(undefined);
  gates = [];
  await table.settle(); await table.drain();
});

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    // Rotating Spotlight is off by default (issue #354 P2-07): this table has it on.
    narratorSpotlightRotation: true,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
      sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null, recentOracles: [], spotlight: null,
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, {
    fallback: (call) => {
      if (/pacing pre-classifier/.test(call?.system ?? '')) return NARRATIVE;
      if (call?.model === NARRATION_MODEL) return 'The dockmaster scratches his chin and waves Kira through.';
      return '{}';
    },
  });
  silenceConsoleErrors();
});

/** Hold the GM's campaignState writes (the round trip): each released in the order it was sent. */
function holdGmCampaignStateWrites() {
  const held = [];
  table.interceptWrites((w) => {
    if (!campaignStateWrite('gm-1')(w)) return undefined;
    const gate = deferred();
    gates.push(gate);
    held.push({ value: w.value, gate });
    return gate.promise;
  });
  return held;
}

async function releaseInOrder(held) {
  for (let i = 0; i < held.length; i++) {
    held[i].gate.resolve(undefined);
    await table.settle();
  }
  await table.drain();
}

/** The GM asks the oracle (its follow-up narration is not part of this); the d100 lands on YES. */
async function gmAsks() {
  const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);   // d100 = 11
  try {
    await table.client('gm-1').chat('!oracle yes likely is the hatch sealed');
    await table.settle();
  } finally {
    dice.mockRestore();
  }
}

describe('CAMPSTATE-CHAIN-PARTIAL — a paced narration\'s spotlight persist', () => {
  it('Kira\'s line narrated while an oracle answer is on its way: the spotlight\'s pointer and the answer both stand', async () => {
    const held = holdGmCampaignStateWrites();
    await gmAsks();
    expect(held[0]?.value?.recentOracles?.map(e => e.question), 'the capture\'s write is in flight').toEqual(['is the hatch sealed']);

    await table.client('pl-1').chat('I lean on the counter and ask the dockmaster about berths.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await releaseInOrder(held);

    // Sanity: the line was narrated, and the spotlight moved.
    expect(table.cards(f => f.narratorCard && !f.narrationFallback).length).toBeGreaterThan(0);
    expect(held.some(h => h.value?.spotlight?.lastActorId), 'the spotlight was persisted').toBe(true);
    expect(world().spotlight?.lastActorId).toBeTruthy();
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);
});
