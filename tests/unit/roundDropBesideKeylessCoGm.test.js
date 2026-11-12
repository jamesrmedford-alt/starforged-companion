/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundDropBesideKeylessCoGm.test.js
 *
 * Issue #347 ROUND-DROP-CHECK-KEYLESS-COGM (AB17's residual), settled by
 * AB19-STALE-CACHE-WRITES.
 *
 * AB17 discards a round narration whose GM's connection dropped while it was
 * out, when another GM is connected — the round's takeover may be writes the
 * page never heard. With only a keyless co-GM, who leaves a narrating round
 * for a keyed GM (D3), the residual said the reply was discarded and the round
 * waited for the keyed GM's reload, and proposed counting keyed co-GMs only.
 * Since the stand-down that wait is the design: the page back from the drop
 * is stale — its cache may lack an X-Card played meanwhile — so it posts and
 * writes nothing, and is asked to reload; counting only keyed co-GMs would
 * have had it post its reply from that cache. Its reload resumes the round:
 * narrated once, on its key, and closed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    // a strong hit: nothing to upgrade, the round goes straight to its narration
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

describe('the keyed GM narrating a round drops for a moment; the co-GM has no Claude key', () => {
  let table;
  let claude;
  const round = () => table.world.getSetting('batchMode.round');
  const roundCards = (pred = () => true) => table.cards(f => f.narratorCard && f.roundId && pred(f));

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
      // A live session: a GM's page that loads mid-session keeps it.
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [], lastSessionTimestamp: new Date().toISOString() },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');     // gm-2 has no key
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
    claude = scriptClaude(table, { fallback: () => REPLY });
    silenceConsoleErrors();
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
  });

  async function relay(userId, kind, payload) {
    const c = table.client(userId);
    const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
    const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
    await table.settle();
    return res;
  }

  it('its reply is discarded, the round waits, and its reload narrates the round once on its key', async () => {
    const narration = claude.hold(call => /THIS ROUND/.test(call.userText ?? ''));
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await narration.arrived;
    expect(round(), 'gm-1 narrates the round (setup)').toMatchObject({ number: 1, phase: 'narrating', resolverId: 'gm-1' });

    await table.leave('gm-1');
    await table.join('gm-1');                    // the same page: stale
    narration.release(REPLY);
    await table.settle(); await table.drain(5_000).catch(() => {}); await table.settle();

    expect(roundCards(), 'nothing posted from the stale page, nor by the keyless co-GM').toHaveLength(0);
    expect(round(), 'the round waits for a keyed GM').toMatchObject({ number: 1, phase: 'narrating' });
    expect(table.client('gm-1').dialogs.filter(d => d.title === 'Reload this page')).toHaveLength(1);

    await table.reload('gm-1');
    await table.settle(); await table.drain();
    expect(roundCards(f => !f.narrationFallback), 'narrated once, on its key').toHaveLength(1);
    expect(roundCards(f => f.narrationFallback)).toHaveLength(0);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(table.world.campaignState().pendingMove).toBe(false);
  }, 30_000);
});
