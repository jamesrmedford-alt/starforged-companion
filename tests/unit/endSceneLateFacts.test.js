/**
 * A fact that reaches the scene while endScene migrates it is migrated, not
 * cleared (issue #325 W24).
 *
 * endScene worked on the object it was handed, awaited one archive / tier
 * write per truth and one per recorded character's whereabouts, then wrote
 * `sceneTruths: []`, an empty sceneState and `currentSceneId: null` onto the
 * latest store. A narration that finished inside that window persisted its
 * sidecar into the still-current scene, and the final write cleared it: never
 * migrated, archived or kept as LAST KNOWN. Every caller — `!scene end`, the
 * implicit end in startScene, the re-mint, End a Session, closeWorld. It now
 * re-reads the store before its final write and migrates what arrived.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ duringArchive: null }));

vi.mock('../../src/world/worldJournal.js', () => ({
  archiveSceneTruth: vi.fn(async (truth) => {
    const run = hooks.duringArchive;
    hooks.duringArchive = null;
    if (run) await run();
    return { pageId: `page-${truth?.id ?? 'auto'}`, journalId: 'journal-lore' };
  }),
}));
vi.mock('../../src/entities/entityExtractor.js', () => ({
  appendMigratedTruthToTier: vi.fn(async () => true),
}));

import { endScene, persistSceneLedgerFields } from '../../src/factContinuity/sceneLifecycle.js';
import { applySidecar } from '../../src/factContinuity/ledgers.js';
import { archiveSceneTruth } from '../../src/world/worldJournal.js';

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
    expect([...archived, ...kept]).toContain('Must reach Ironway before the gate seals at dawn');
  });

  it('the late fact is archived exactly once, and the scene still closes', async () => {
    hooks.duringArchive = narrationLands;
    await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });

    const archived = archiveSceneTruth.mock.calls.map(([t]) => t.fact);
    expect(archived.filter(f => /Ironway/.test(f))).toHaveLength(1);
    expect(stored().currentSceneId).toBeNull();
    expect(stored().sceneTruths).toEqual([]);
  });

  it('control: a fact persisted into a new scene after the store moved on is left to that scene', async () => {
    hooks.duringArchive = async () => {
      const cs = stored();
      game.settings._store.set(KEY, { ...cs, currentSceneId: 'sc-2', sceneTruths: [{
        id: 'tr-new00001', subject: { kind: 'text', text: 'the warden' }, fact: 'Locked the outer gate',
        sessionId: 'sess-5', sessionNum: 5, sceneId: 'sc-2', moveId: null, source: 'narrator_sidecar',
        asserter: 'narrator', createdAt: 2, retracted: false, retractedBy: null, retractedAt: null,
        correctedTo: null, migratedTo: null,
      }] });
    };
    await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
    expect(archiveSceneTruth.mock.calls.map(([t]) => t.fact)).not.toContain('Locked the outer gate');
  });
});
