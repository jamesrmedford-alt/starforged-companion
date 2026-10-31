/**
 * PROBE — START-SCENE-STALE-SNAPSHOT (src/factContinuity/sceneLifecycle.js)
 *
 * Narrator paths call ensureSceneStarted(campaignState) with the snapshot they
 * hold — the move pipeline's is read when it claims the move lock, before the
 * confirm dialog, the interpretation / relevance calls and the move card. When
 * that snapshot predates a scene another narration started meanwhile (a paced
 * turn or `@scene` at the top of a session), startScene sees "no scene", mints
 * a second id and persists SCENE_FIELDS from the snapshot over the store
 * (mergeOwnedFields owns those fields outright). The live scene's truths,
 * state and frame are overwritten — neither kept nor migrated/archived.
 *
 * (persistSceneLedgerFields, the sidecar persist, refuses to write when the
 * scene changed meanwhile — SIDECAR-LEDGER-CLOBBER; startScene has no such
 * check.)
 *
 * Asserts the CORRECT behaviour (the live scene's truth survives somewhere);
 * fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startScene } from '../../../src/factContinuity/sceneLifecycle.js';
import { JOURNAL_NAMES } from '../../../src/world/worldJournal.js';
import { installJournalMock } from '../../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

let installed;
beforeEach(() => { installed = installJournalMock(); });
afterEach(() => { installed.restore(); game.settings._store.delete(KEY); });

describe('startScene from a snapshot older than the live scene', () => {
  it('does not wipe the scene another narration started meanwhile', async () => {
    // The move pipeline's snapshot, read before any scene existed.
    const snapshot = {
      currentSessionId: 'sess-1', sessionNumber: 3,
      currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
    };

    // Meanwhile a paced turn narrated: scene sc-live started, with a truth,
    // state and a frame persisted to the store.
    const truthA = {
      id: 'tr-live0001', subject: { kind: 'text', text: 'the dockmaster' },
      fact: 'Owes the PC a favour for the medkit', sessionId: 'sess-1', sessionNum: 3,
      sceneId: 'sc-live', moveId: null, source: 'narrator_sidecar', asserter: 'narrator',
      createdAt: 1, retracted: false, retractedBy: null, retractedAt: null, correctedTo: null, migratedTo: null,
    };
    game.settings._store.set(KEY, {
      ...snapshot,
      currentSceneId: 'sc-live',
      sceneTruths: [truthA],
      sceneState: { bySubject: { 'the dockmaster': [{ attribute: 'location', value: 'the cargo bay', updatedAt: 1 }] }, sceneId: 'sc-live' },
      sceneFrame: { location: 'Bleakhold docking ring', present: ['the dockmaster'], situation: 'Haggling over the medkit' },
    });

    // The move now narrates: ensureSceneStarted sees the snapshot's null id.
    await startScene(snapshot, { reason: 'first_narration_move_resolution' });

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    const keptInLedger = (stored.sceneTruths ?? []).some(t => t.id === truthA.id);
    const archived = (installed.journals.get(JOURNAL_NAMES.lore)?.pages.contents ?? [])
      .some(p => p.flags?.[MODULE_ID]?.loreEntry?.fact === truthA.fact);
    expect(keptInLedger || archived, 'the live scene\'s truth is kept or archived').toBe(true);
    expect.soft(stored.sceneFrame?.location, 'the live scene frame').toBe('Bleakhold docking ring');
  });
});
