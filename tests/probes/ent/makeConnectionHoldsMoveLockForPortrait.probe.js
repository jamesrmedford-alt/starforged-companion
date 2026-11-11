/**
 * PROBE (thirteenth audit, area ENT) — ENT: a Make a Connection hit holds the
 * table's move lock — and withholds the move's record and the roller's bond —
 * until the new NPC's portrait has been generated.
 *
 * The chain, every hop awaited:
 *   src/index.js onMessage (holds `pendingMove`)
 *     → await narrateResolution                      (index.js ~1069)
 *       → await runPostNarrationPasses               (narrator.js ~871)
 *         → runDiscoveryDetection → await routeEntityDrafts   (narrator.js ~1565)
 *           → await createConnection
 *           → await postCreationEnrichment           (entityExtractor.js ~600)
 *             → await generatePortrait               (the OpenRouter image, its
 *               optional neutral-prompt retry, the image download, the Art
 *               Cache journal write, the file upload)
 *           → registerConnectionOnActiveCharacter    (the bond — only after)
 *     → recordMove (meters, the record, Burn / Improve opened) — only after
 *     → releasePendingMoveLock — only after
 * With "Auto-Seed NPC / Connection Details" off (the default) and an
 * OpenRouter key on the resolving GM's browser, the creator owns the portrait
 * (seedHookOwnsPortrait is false), so every such hit waits for the image.
 * The narration card is already in chat; a move typed meanwhile is refused
 * ("A move is already being resolved").
 *
 * Scenario (booted table, the real pipeline; interpreter / pacing / confirm /
 * dice mocked, Claude scripted; the image call is a promise the test holds):
 *   1. Kira makes a connection with Sable Ortiz — a strong hit. The narration
 *      posts; Sable's card is created; her portrait is being generated.
 *   2. While the image is out: the move lock should be free and Kira should
 *      hold the bond.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const art = vi.hoisted(() => {
  const state = { calls: [], gate: null, called: null };
  state.arm = () => {
    state.calls.length = 0;
    let open, seen;
    state.gate = new Promise(resolve => { open = resolve; });
    state.called = new Promise(resolve => { seen = resolve; });
    state.release = () => open(null);
    state.seen = seen;
  };
  state.arm();
  return state;
});
vi.mock('../../../src/art/generator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // The image request: out until the test releases it.
  generatePortrait: vi.fn(async (hostId, typeKey) => {
    art.calls.push({ hostId, typeKey });
    art.seen();
    return art.gate;
  }),
}));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart', adds: 0,
    rationale: 'a new contact', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      // challenge dice 3 and 4, action die 6: a strong hit.
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const NARRATION = 'Sable Ortiz looks you over, then shakes your hand: she will vouch for you with the guild.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SABLE = { type: 'connection', name: 'Sable Ortiz', description: 'A scarred salvage broker.',
  pronouns: 'she/her', role: 'salvage broker', goal: null, confidence: 'high' };
const DETECTION = JSON.stringify({
  entities: [SABLE], renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const LINE = 'I ask Sable Ortiz to vouch for me with the salvage guild.';
const isNarration = (call) => call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '');

let table;
const world = () => table.world.campaignState();
const sable = () => table.actors.find(a => a?.name === 'Sable Ortiz' && a.flags?.[MODULE_ID]?.entityType === 'connection');
const bondNames = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);
const narrationPosted = () => table.cards(f => f.narratorCard && !f.narrationFallback).length > 0;
const moveCard = () => table.world.messages().find(m => /Connection made/.test(m.content ?? ''));

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(async () => { art.release?.(); await table?.teardown(); });

async function resetWith({ openRouterKey }) {
  art.release?.();
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
      connectionIds: [],
    },
  } } });
  art.arm();
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.client('gm-1').setSetting('openRouterApiKey', openRouterKey);
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => {
    if (/ENTITY TYPES TO DETECT/.test(call.userText)) return DETECTION;
    if (isNarration(call)) return NARRATION;
    return '{}';
  } });
  await table.settle();
}

describe('ENT — a Make a Connection hit and the new NPC\'s portrait', () => {
  it('control: with no image key the hit resolves — lock released, bond on Kira', async () => {
    await resetWith({ openRouterKey: '' });
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.drain();

    expect(art.calls, 'no image is requested without a key').toHaveLength(0);
    expect(moveCard(), 'the move card').toBeTruthy();
    expect(sable(), "Sable Ortiz's card").toBeTruthy();
    expect(world().pendingMove).toBe(false);
    expect(bondNames('pc-kira')).toEqual(['Sable Ortiz']);
  }, 60_000);

  it('while the portrait is still being generated, the move lock is free and Kira holds the bond', async () => {
    await resetWith({ openRouterKey: 'sk-or-test' });
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await art.called;                 // the image request is out
    await table.settle();             // everything that can run without it has run

    // Setup: the move is narrated and her card exists — only the image is outstanding.
    expect(art.calls).toEqual([{ hostId: sable()?.id, typeKey: 'connection' }]);
    expect(narrationPosted(), 'the narration card is in chat (setup)').toBe(true);
    expect(moveCard(), 'the move card says "Connection made" (setup)').toBeTruthy();

    const whileImageIsOut = { pendingMove: world().pendingMove, bonds: bondNames('pc-kira') };

    art.release();                    // the image comes back (none, here)
    await table.settle(); await table.drain();
    expect(world().pendingMove, 'the lock is released once the image returns (setup)').toBe(false);
    expect(bondNames('pc-kira'), 'the bond lands once the image returns (setup)').toEqual(['Sable Ortiz']);

    // The lock is the finding; the bond waiting behind the image is its second symptom.
    expect.soft(whileImageIsOut.pendingMove, 'the move lock is free while the image is generated').toBe(false);
    expect.soft(whileImageIsOut.bonds, 'the roller holds the bond while the image is generated').toEqual(['Sable Ortiz']);
  }, 60_000);
});
