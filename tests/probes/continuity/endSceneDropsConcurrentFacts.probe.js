/**
 * PROBE — FC-04 ENDSCENE-DROPS-CONCURRENT-FACTS
 * (src/factContinuity/sceneLifecycle.js endScene → persistCampaignStateFields)
 *
 * What the user does: the GM types `!scene end` (or End a Session, or the
 * session re-mint closes the scene) while a player's move is being narrated.
 *
 * What happens: endScene works on the object it was handed, awaits one
 * archive / tier write per truth plus one write per recorded character's
 * whereabouts, and only then writes `sceneTruths: []`, an empty sceneState
 * and `currentSceneId: null` onto the latest store (mergeOwnedFields). The
 * narration that finishes inside that window persists its sidecar into the
 * still-current scene (persistSceneLedgerFields: same scene id → union), and
 * endScene's final write then clears it: those truths and that state were
 * never migrated, archived or kept as LAST KNOWN — they are gone. The facts
 * the narrator was REQUIRED to record (an NPC's location, the stakes) vanish
 * from every store.
 *
 * What should happen: a fact that reached the scene before it closed is
 * migrated or archived like the rest of the scene (or survives into the next
 * scene) — never dropped. Related to, but not the same site as, the excluded
 * END-SESSION-STALE-ENDSCENE (End a Session's pre-await snapshot): this is
 * endScene's own write after its own awaits, on every caller (`!scene end`,
 * the implicit end in startScene, rollSessionIfDue, End a Session,
 * closeWorld).
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ duringArchive: null }));

vi.mock('../../../src/world/worldJournal.js', () => ({
  archiveSceneTruth: vi.fn(async (truth) => {
    const run = hooks.duringArchive;
    hooks.duringArchive = null;
    if (run) await run();
    return { pageId: `page-${truth?.id ?? 'auto'}`, journalId: 'journal-lore' };
  }),
}));
vi.mock('../../../src/entities/entityExtractor.js', () => ({
  appendMigratedTruthToTier: vi.fn(async () => true),
}));

import { endScene, persistSceneLedgerFields } from '../../../src/factContinuity/sceneLifecycle.js';
import { applySidecar } from '../../../src/factContinuity/ledgers.js';
import { archiveSceneTruth } from '../../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

beforeEach(() => {
  archiveSceneTruth.mockClear();
  hooks.duringArchive = null;
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-5', sessionNumber: 5, currentSceneId: 'sc-1', dismissedEntities: [],
    sceneTruths: [{
      id: 'tr-old00001', subject: { kind: 'text', text: 'the dockmaster' }, fact: 'Owes the crew a favour',
      sessionId: 'sess-5', sessionNum: 5, sceneId: 'sc-1', moveId: null, source: 'narrator_sidecar',
      asserter: 'narrator', createdAt: 1, retracted: false, retractedBy: null, retractedAt: null,
      correctedTo: null, migratedTo: null,
    }],
    sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
  });
});

/** A move's narration finishing: its sidecar applied to the pipeline's copy and persisted as narrator.js does. */
async function narrationLands() {
  const working = foundry.utils.deepClone(stored());
  applySidecar({
    newTruths: [{ subject: 'the courier', fact: 'Must reach Ironway before the gate seals at dawn' }],
    stateChanges: [],
  }, { campaignState: working, narrationId: 'nar-late' });
  await persistSceneLedgerFields(working, ['sceneTruths', 'sceneState', 'sceneFrame'], 'narrator sidecar');
}

describe('a fact that reaches the scene while it is being closed is not lost', () => {
  it('control: a fact that landed before `!scene end` started is archived with the rest', async () => {
    await narrationLands();
    await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
    expect(archiveSceneTruth.mock.calls.map(([t]) => t.fact)).toContain('Must reach Ironway before the gate seals at dawn');
  });

  it('a fact the narration persists while endScene is migrating is archived, migrated or kept — not cleared', async () => {
    hooks.duringArchive = narrationLands;     // lands while the first truth's lore page is written

    await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });

    const archived = archiveSceneTruth.mock.calls.map(([t]) => t.fact);
    const kept     = (stored().sceneTruths ?? []).map(t => t.fact);
    // Today: archived = ['Owes the crew a favour'], kept = [] — the courier's deadline is in no store.
    expect([...archived, ...kept]).toContain('Must reach Ironway before the gate seals at dawn');
  });
});
