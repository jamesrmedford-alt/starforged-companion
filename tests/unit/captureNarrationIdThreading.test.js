/**
 * STARFORGED COMPANION
 * tests/unit/captureNarrationIdThreading.test.js
 *
 * Issue #329 X01 — the narration's id reaches the capture's writers.
 *
 * The X-Card undoes what a narration's capture recorded by the narration's
 * id (retractNarrationCapture), so every capture entry point must hand the
 * id down: the move path's post-narration passes, the paced / @scene
 * detection and tier passes, and the oracle / vignette / vow-scene capture
 * (runPacedDetection + runNarrationTierUpdate). Without it the records carry
 * no id and the X-Card cannot find them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/multiplayer/gmGate.js', () => ({ isCanonicalGM: vi.fn(() => true) }));
vi.mock('../../src/entities/entityExtractor.js', async () => {
  const actual = await vi.importActual('../../src/entities/entityExtractor.js');
  return {
    ...actual,
    runCombinedDetectionPass:    vi.fn(),
    routeWorldJournalResults:    vi.fn(async () => {}),
    routeEntityDrafts:           vi.fn(async () => ({ created: [], queued: [] })),
    applyEntityRenames:          vi.fn(async () => {}),
    appendGenerativeTierUpdates: vi.fn(async () => []),
  };
});

import {
  runPostNarrationPasses, schedulePacedDetection, schedulePacedTierUpdate, runPacedDetection,
} from '../../src/narration/narrator.js';
import { isCanonicalGM } from '../../src/multiplayer/gmGate.js';
import {
  runCombinedDetectionPass, routeWorldJournalResults, appendGenerativeTierUpdates,
  routeEntityDrafts, applyEntityRenames,
} from '../../src/entities/entityExtractor.js';

const STATE = { currentSessionId: 'sess-1', sessionNumber: 3 };
const WJ = { lore: [{ title: 'The rig', text: 'x' }], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.mocked(isCanonicalGM).mockReturnValue(true);
  vi.mocked(runCombinedDetectionPass).mockResolvedValue({ entities: [], renames: [], worldJournal: WJ });
});
afterEach(() => { vi.useRealTimers(); });

describe('issue #329 X01 — the capture is handed the narration id', () => {
  it('the paced / @scene detection pass routes its World Journal results with the id', async () => {
    schedulePacedDetection('The rig hums.', STATE, { actorId: 'pc-1', narrationId: 'nar-paced' });
    await vi.runAllTimersAsync();
    expect(routeWorldJournalResults).toHaveBeenCalledWith(WJ, STATE, { narrationId: 'nar-paced' });
  });

  it('the paced / @scene tier pass stamps the id on its details', async () => {
    schedulePacedTierUpdate('Vex smiles.', ['npc-vex'], ['connection'], STATE, { narrationId: 'nar-paced' });
    await vi.runAllTimersAsync();
    expect(appendGenerativeTierUpdates).toHaveBeenCalledWith(
      'Vex smiles.', [{ journalId: 'npc-vex', type: 'connection' }], 'sess-1', 3, { narrationId: 'nar-paced' });
  });

  it('runPacedDetection (the oracle / inciting capture) passes the id it was given', async () => {
    await runPacedDetection('The rig hums.', STATE, { narrationId: 'nar-oracle' });
    expect(routeWorldJournalResults).toHaveBeenCalledWith(WJ, STATE, { narrationId: 'nar-oracle' });
  });

  it("a move narration's interaction passes stamp the id on its lore and tier details", async () => {
    const relevance = { resolvedClass: 'interaction', entityIds: ['npc-vex'], entityTypes: ['connection'] };
    await runPostNarrationPasses('Vex lights the torch.', { moveId: 'compel', outcome: 'weak_hit' }, relevance, STATE,
      { actorId: 'pc-1', narrationId: 'nar-move' });
    await vi.runAllTimersAsync();
    expect(routeWorldJournalResults).toHaveBeenCalledWith(WJ, STATE, { narrationId: 'nar-move' });
    expect(appendGenerativeTierUpdates).toHaveBeenCalledWith(
      'Vex lights the torch.', [{ journalId: 'npc-vex', type: 'connection' }], 'sess-1', 3, { narrationId: 'nar-move' });
  });

  it("a Make a Connection hit's synchronous detection routes with the id", async () => {
    const relevance = { resolvedClass: 'discovery', entityIds: [], entityTypes: [] };
    await runPostNarrationPasses('You find Vex.', { moveId: 'make_a_connection', outcome: 'strong_hit' }, relevance, STATE,
      { actorId: 'pc-1', narrationId: 'nar-connect' });
    expect(routeWorldJournalResults).toHaveBeenCalledWith(WJ, STATE, { narrationId: 'nar-connect' });
  });

  // Issue #335 Y02 — the drafts (their faction surface) and the renames take it too.
  it('both detection passes hand the id to the renames and the drafts they route', async () => {
    await runPacedDetection('The rig hums.', STATE, { narrationId: 'nar-oracle' });
    expect(applyEntityRenames).toHaveBeenCalledWith([], STATE, { narrationId: 'nar-oracle' });
    expect(vi.mocked(routeEntityDrafts).mock.calls[0][2]).toMatchObject({ narrationId: 'nar-oracle' });

    const relevance = { resolvedClass: 'discovery', entityIds: [], entityTypes: [] };
    await runPostNarrationPasses('You find Vex.', { moveId: 'make_a_connection', outcome: 'strong_hit' }, relevance, STATE,
      { actorId: 'pc-1', narrationId: 'nar-connect' });
    expect(applyEntityRenames).toHaveBeenLastCalledWith([], STATE, { narrationId: 'nar-connect' });
    expect(vi.mocked(routeEntityDrafts).mock.calls[1][2]).toMatchObject({ narrationId: 'nar-connect', autoCreateConnection: true });
  });
});
