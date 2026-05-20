/**
 * STARFORGED COMPANION
 * tests/unit/sceneLifecycle.test.js
 *
 * Unit tests for the fact-continuity scene lifecycle (Phase C).
 * Stubs the IO collaborators (worldJournal.archiveSceneTruth and
 * entityExtractor.appendMigratedTruthToTier) so the tests focus on the
 * lifecycle logic itself.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.mock is hoisted — must live above the import of the module under test.
vi.mock('../../src/world/worldJournal.js', () => ({
  archiveSceneTruth: vi.fn(async (truth) => ({
    pageId:    `page-${truth?.id ?? 'auto'}`,
    journalId: 'journal-lore',
  })),
}));

vi.mock('../../src/entities/entityExtractor.js', () => ({
  appendMigratedTruthToTier: vi.fn(async () => true),
}));

import { startScene, endScene } from '../../src/factContinuity/sceneLifecycle.js';
import { archiveSceneTruth }    from '../../src/world/worldJournal.js';
import { appendMigratedTruthToTier } from '../../src/entities/entityExtractor.js';
import { applySidecar }         from '../../src/factContinuity/ledgers.js';


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeCampaignState(overrides = {}) {
  return {
    currentSessionId:  'ssn-test',
    currentSceneId:    null,
    sessionNumber:     1,
    dismissedEntities: [],
    sceneTruths:       [],
    sceneState:        { bySubject: {}, sceneId: null },
    ...overrides,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// startScene
// ─────────────────────────────────────────────────────────────────────────────

describe('startScene', () => {
  beforeEach(() => {
    archiveSceneTruth.mockClear();
    appendMigratedTruthToTier.mockClear();
  });

  it('assigns a fresh scene ID and mirrors it onto sceneState', async () => {
    const cs = makeCampaignState();
    const id = await startScene(cs, { reason: 'test' });
    expect(id).toMatch(/^sc-[a-zA-Z0-9-]+$/);
    expect(cs.currentSceneId).toBe(id);
    expect(cs.sceneState.sceneId).toBe(id);
  });

  it('initialises ledger shape when missing', async () => {
    const cs = { currentSessionId: 'ssn' }; // no sceneTruths / sceneState
    await startScene(cs, { reason: 'test' });
    expect(Array.isArray(cs.sceneTruths)).toBe(true);
    expect(cs.sceneState.bySubject).toEqual({});
    expect(cs.sceneState.sceneId).toBe(cs.currentSceneId);
  });

  it('flushes a leftover scene before assigning a new ID', async () => {
    const cs = makeCampaignState({ currentSceneId: 'sc-old' });
    applySidecar(
      { newTruths: [{ subject: 'scene', fact: 'a stale fact' }], stateChanges: [] },
      { campaignState: cs },
    );

    const id = await startScene(cs, { reason: 'fresh' });
    expect(archiveSceneTruth).toHaveBeenCalledTimes(1);
    expect(cs.sceneTruths).toEqual([]);             // discarded by endScene
    expect(cs.sceneState).toEqual({ bySubject: {}, sceneId: id }); // reseeded
    expect(cs.currentSceneId).toBe(id);
    expect(id).not.toBe('sc-old');
  });

  it('does not flush when both ledgers are empty', async () => {
    const cs = makeCampaignState({ currentSceneId: 'sc-old' });
    await startScene(cs, { reason: 'test' });
    expect(archiveSceneTruth).not.toHaveBeenCalled();
    expect(appendMigratedTruthToTier).not.toHaveBeenCalled();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// endScene
// ─────────────────────────────────────────────────────────────────────────────

describe('endScene', () => {
  beforeEach(() => {
    archiveSceneTruth.mockClear();
    appendMigratedTruthToTier.mockClear();
  });

  it('migrates entity-kind truths to the entity generative tier', async () => {
    const cs = makeCampaignState({ currentSceneId: 'sc-1' });
    const entities = [
      { entityId: 'JE.x7', entityType: 'connection', name: 'Vance' },
    ];
    applySidecar(
      { newTruths: [{ subject: 'Vance', fact: 'Walks with a limp' }], stateChanges: [] },
      { campaignState: cs, entities },
    );

    const summary = await endScene(cs, { reason: 'test' });
    expect(summary.migrated).toBe(1);
    expect(summary.archived).toBe(0);
    expect(appendMigratedTruthToTier).toHaveBeenCalledTimes(1);
    const [journalId, type, entry] = appendMigratedTruthToTier.mock.calls[0];
    expect(journalId).toBe('JE.x7');
    expect(type).toBe('connection');
    expect(entry).toMatchObject({
      detail:   'Walks with a limp',
      source:   'scene_truth_migration',
      pinned:   false,
      promoted: false,
    });
  });

  it('archives scene-kind truths to WJ Lore', async () => {
    const cs = makeCampaignState({ currentSceneId: 'sc-1' });
    applySidecar(
      { newTruths: [{ subject: 'scene', fact: 'The wind has died' }], stateChanges: [] },
      { campaignState: cs },
    );
    const summary = await endScene(cs, { reason: 'test' });
    expect(summary.archived).toBe(1);
    expect(archiveSceneTruth).toHaveBeenCalledTimes(1);
    const [truth] = archiveSceneTruth.mock.calls[0];
    expect(truth.subject).toEqual({ kind: 'scene', sceneId: 'sc-1' });
    expect(truth.fact).toBe('The wind has died');
  });

  it('archives free-text truths to WJ Lore', async () => {
    const cs = makeCampaignState({ currentSceneId: 'sc-1' });
    applySidecar(
      { newTruths: [{ subject: 'Covenant officer', fact: 'Carries a rusted blade' }], stateChanges: [] },
      { campaignState: cs },
    );
    const summary = await endScene(cs, { reason: 'test' });
    expect(summary.archived).toBe(1);
    expect(archiveSceneTruth.mock.calls[0][0].subject)
      .toEqual({ kind: 'text', text: 'Covenant officer' });
  });

  it('clears active ledgers and currentSceneId', async () => {
    const cs = makeCampaignState({ currentSceneId: 'sc-1' });
    applySidecar(
      {
        newTruths: [{ subject: 'scene', fact: 'fact' }],
        stateChanges: [{ subject: 'scene', attribute: 'lighting', value: 'dim' }],
      },
      { campaignState: cs },
    );
    await endScene(cs, { reason: 'test' });
    expect(cs.sceneTruths).toEqual([]);
    expect(cs.sceneState).toEqual({ bySubject: {}, sceneId: null });
    expect(cs.currentSceneId).toBeNull();
  });

  it('skips retracted and already-migrated truths', async () => {
    const cs = makeCampaignState({ currentSceneId: 'sc-1' });
    applySidecar(
      { newTruths: [
          { subject: 'scene', fact: 'kept' },
          { subject: 'scene', fact: 'retracted' },
          { subject: 'scene', fact: 'pre-migrated' },
        ],
        stateChanges: [],
      },
      { campaignState: cs },
    );
    cs.sceneTruths[1].retracted  = true;
    cs.sceneTruths[2].migratedTo = { kind: 'worldJournalLore', loreEntryId: 'page-old' };

    const summary = await endScene(cs, { reason: 'test' });
    expect(summary.archived).toBe(1);
    expect(summary.skipped).toBe(2);
    expect(archiveSceneTruth).toHaveBeenCalledTimes(1);
  });

  it('marks each migrated/archived truth with migratedTo before discarding', async () => {
    const cs = makeCampaignState({ currentSceneId: 'sc-1' });
    const entities = [
      { entityId: 'JE.x7', entityType: 'connection', name: 'Vance' },
    ];
    applySidecar(
      { newTruths: [
          { subject: 'Vance', fact: 'Limp' },
          { subject: 'scene', fact: 'fog' },
        ],
        stateChanges: [],
      },
      { campaignState: cs, entities },
    );

    // Snapshot the truths before endScene — endScene clears the array but the
    // mark happens before clearing, so we capture references first.
    const snapshot = cs.sceneTruths.slice();
    await endScene(cs, { reason: 'test' });
    expect(snapshot[0].migratedTo)
      .toEqual({ kind: 'entityGenerativeTier', entityId: 'JE.x7' });
    expect(snapshot[1].migratedTo).toMatchObject({ kind: 'worldJournalLore' });
  });

  it('returns zero counts when no truths are present', async () => {
    const cs = makeCampaignState({ currentSceneId: 'sc-1' });
    const summary = await endScene(cs, { reason: 'test' });
    expect(summary).toEqual({ migrated: 0, archived: 0, skipped: 0 });
    expect(archiveSceneTruth).not.toHaveBeenCalled();
    expect(appendMigratedTruthToTier).not.toHaveBeenCalled();
  });

  it('still discards ledgers when the migration helpers reject', async () => {
    archiveSceneTruth.mockResolvedValueOnce(null);              // simulate failure
    appendMigratedTruthToTier.mockResolvedValueOnce(false);     // simulate failure
    const cs = makeCampaignState({ currentSceneId: 'sc-1' });
    const entities = [{ entityId: 'JE.x7', entityType: 'connection', name: 'Vance' }];
    applySidecar(
      { newTruths: [
          { subject: 'Vance', fact: 'Limp' },
          { subject: 'scene', fact: 'fog' },
        ],
        stateChanges: [],
      },
      { campaignState: cs, entities },
    );
    const summary = await endScene(cs, { reason: 'test' });
    expect(summary.skipped).toBe(2);
    expect(cs.sceneTruths).toEqual([]);
    expect(cs.currentSceneId).toBeNull();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Round-trip: startScene → write → endScene → startScene
// ─────────────────────────────────────────────────────────────────────────────

describe('lifecycle round-trip', () => {
  beforeEach(() => {
    archiveSceneTruth.mockClear();
    appendMigratedTruthToTier.mockClear();
  });

  it('a fresh start after end produces a new ID and a clean ledger', async () => {
    const cs = makeCampaignState();
    const id1 = await startScene(cs, { reason: 'first' });
    applySidecar(
      { newTruths: [{ subject: 'scene', fact: 'first scene' }], stateChanges: [] },
      { campaignState: cs },
    );
    expect(cs.sceneTruths).toHaveLength(1);

    await endScene(cs, { reason: 'first_end' });
    expect(cs.currentSceneId).toBeNull();
    expect(cs.sceneTruths).toEqual([]);

    const id2 = await startScene(cs, { reason: 'second' });
    expect(id2).not.toBe(id1);
    expect(cs.sceneState.sceneId).toBe(id2);
  });
});
