/**
 * STARFORGED COMPANION
 * tests/unit/postNarrationGmGate.test.js
 *
 * Multiplayer hardening: the post-narration side-effects perform world-scoped
 * writes (World Journal JournalEntryPages, entity generative tiers, the
 * campaignState Setting). Players and non-canonical GMs lack permission for
 * those — an un-gated run on their client floods the server log with
 * "lacks permission to create JournalEntryPage" / "lacks permission to update
 * Setting" errors (observed in the 3-player playtest on pre-fix code).
 *
 * In production the pipeline entry is already isCanonicalGM-gated; these tests
 * pin the belt-and-suspenders guards at the write sites themselves so a future
 * un-gated caller on a non-GM client cannot reproduce the errors.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before the imports they affect (vi.mock is hoisted).
// ---------------------------------------------------------------------------

vi.mock('../../src/multiplayer/gmGate.js', () => ({
  isCanonicalGM: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/entities/entityExtractor.js', () => ({
  runCombinedDetectionPass:    vi.fn().mockResolvedValue({ worldJournal: {}, renames: [], entities: [] }),
  routeEntityDrafts:           vi.fn().mockResolvedValue(undefined),
  routeWorldJournalResults:    vi.fn().mockResolvedValue(undefined),
  appendGenerativeTierUpdates: vi.fn().mockResolvedValue(undefined),
  applyEntityRenames:          vi.fn().mockResolvedValue(undefined),
  PACED_NARRATIVE_MOVE_ID:     'paced_narrative',
  PACED_NARRATIVE_OUTCOME:     'paced',
}));

// The consistency check makes an API call + posts a GM review card — silence it.
vi.mock('../../src/factContinuity/consistencyCheck.js', () => ({
  runConsistencyCheck: vi.fn().mockResolvedValue(undefined),
}));

import {
  runPostNarrationPasses,
  applyNarratorSidecar,
} from '../../src/narration/narrator.js';
import { isCanonicalGM }            from '../../src/multiplayer/gmGate.js';
import { runCombinedDetectionPass } from '../../src/entities/entityExtractor.js';
import { runConsistencyCheck }      from '../../src/factContinuity/consistencyCheck.js';

const MODULE_ID = 'starforged-companion';

beforeEach(() => {
  vi.clearAllMocks();
  // Re-establish mock return values (a global afterEach may reset implementations).
  vi.mocked(isCanonicalGM).mockReturnValue(true);
  vi.mocked(runConsistencyCheck).mockResolvedValue(undefined);
  vi.mocked(runCombinedDetectionPass).mockResolvedValue({ worldJournal: {}, renames: [], entities: [] });
  game.settings._store.clear();
});

// ---------------------------------------------------------------------------
// runPostNarrationPasses — gates ALL detection→World-Journal/tier writes
// ---------------------------------------------------------------------------

describe('runPostNarrationPasses — canonical-GM gate', () => {
  // make_a_connection on a hit runs detection synchronously (no setTimeout),
  // so the call is observable within the awaited promise.
  const resolution = { moveId: 'make_a_connection', outcome: 'strong_hit', _id: 'r1' };
  const relevance  = { resolvedClass: 'discovery', entityIds: [], entityTypes: [] };

  it('runs detection on the canonical GM', async () => {
    vi.mocked(isCanonicalGM).mockReturnValue(true);
    await runPostNarrationPasses('Some prose.', resolution, relevance, { currentSessionId: 's' });
    expect(runCombinedDetectionPass).toHaveBeenCalledOnce();
  });

  it('no-ops (no detection / world writes) when not the canonical GM', async () => {
    vi.mocked(isCanonicalGM).mockReturnValue(false);
    await runPostNarrationPasses('Some prose.', resolution, relevance, { currentSessionId: 's' });
    expect(runCombinedDetectionPass).not.toHaveBeenCalled();
  });

  it('still no-ops for a non-GM even on an interaction-class narration', async () => {
    vi.mocked(isCanonicalGM).mockReturnValue(false);
    await runPostNarrationPasses(
      'Some prose.',
      { moveId: 'compel', outcome: 'strong_hit', _id: 'r2' },
      { resolvedClass: 'interaction', entityIds: ['e1'], entityTypes: ['connection'] },
      { currentSessionId: 's' },
    );
    expect(runCombinedDetectionPass).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// applyNarratorSidecar — canonical-GM gate on the campaignState persist
// ---------------------------------------------------------------------------

describe('applyNarratorSidecar — canonical-GM gate on campaignState persist', () => {
  const raw = 'Narrator prose here.\n\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  const baseCampaign = () => ({
    currentSessionId: 's',
    currentSceneId:   'sc',
    sceneState:       { bySubject: {}, sceneId: 'sc' },
    sceneTruths:      [],
  });

  let origSet;
  beforeEach(() => {
    origSet = game.settings.set;
    game.settings.set = vi.fn().mockResolvedValue(undefined);
  });
  afterEach(() => { game.settings.set = origSet; });

  it('persists campaignState on the canonical GM and returns clean prose', () => {
    vi.mocked(isCanonicalGM).mockReturnValue(true);
    const cs = baseCampaign();
    const prose = applyNarratorSidecar(raw, cs, {});
    expect(prose).toBe('Narrator prose here.');
    const wroteCampaign = game.settings.set.mock.calls.some(
      c => c[0] === MODULE_ID && c[1] === 'campaignState',
    );
    expect(wroteCampaign).toBe(true);
  });

  it('does NOT persist campaignState off the canonical GM, but still returns clean prose', () => {
    vi.mocked(isCanonicalGM).mockReturnValue(false);
    const prose = applyNarratorSidecar(raw, baseCampaign(), {});
    // The clean prose (fence stripped) is still returned — a non-GM caller
    // gets correct display text with no failed server write.
    expect(prose).toBe('Narrator prose here.');
    const wroteCampaign = game.settings.set.mock.calls.some(c => c[1] === 'campaignState');
    expect(wroteCampaign).toBe(false);
  });
});
