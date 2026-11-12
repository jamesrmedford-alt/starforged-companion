/**
 * PROMOTE-SUBJECTS-CACHED-MUTATE (known-issues; the U58 shape).
 * `promoteNewEntityLedgerSubjects` re-keys the scene ledgers' text-subject
 * truths and state recorded under a new entity's name to that entity (issue
 * #286 A3). It promoted the CACHED campaignState it read — and, when the
 * caller handed it the cached setting (a draft card's Confirm does), the
 * caller's copy — in place, before the write. A refused write left the re-key
 * on the GM's cache: the GM's client rendered and migrated the facts as the
 * card's while the world still held them as text (rules/foundry-api.md:
 * "set nothing on it before a write that can fail"). The store's two ledgers
 * are deep-copied at the chain turn, the copy promoted and written.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promoteNewEntityLedgerSubjects } from '../../src/entities/entityExtractor.js';
import { createConnection } from '../../src/entities/connection.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE = 'starforged-companion';
const KEY = `${MODULE}.campaignState`;
const cached = () => global.game.settings.get(MODULE, 'campaignState');
const VEX = { kind: 'text', text: 'Vex' };

let record, hostId;
beforeEach(async () => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.ChatMessage._reset();
  global.game.settings._store.clear();
  global.game.settings._store.set(KEY, {
    ...CampaignStateSchema, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {} }, connectionIds: [],
  });
  record = await createConnection({ name: 'Vex', description: 'A smuggler with a scarred cheek.' }, cached());
  hostId = cached().connectionIds[0];
  // The narration before the card existed recorded Vex as a text subject.
  global.game.settings._store.set(KEY, {
    ...cached(),
    sceneTruths: [{ id: 't-vex', subject: VEX, fact: 'Works for the Compact', sceneId: 'sc-1', createdAt: 1 }],
    sceneState: { bySubject: { vex: [{ attribute: 'condition', value: 'wounded', updatedAt: 1 }] }, sceneId: 'sc-1' },
  });
});

describe('PROMOTE-SUBJECTS-CACHED-MUTATE — the re-key is written on a copy', () => {
  it('control: the store\'s facts about the name are promoted to the card', async () => {
    await promoteNewEntityLedgerSubjects('Vex', 'connection', record, cached());
    expect(cached().sceneTruths[0].subject).toEqual({ kind: 'entity', entityId: hostId, entityType: 'connection' });
    expect(Object.keys(cached().sceneState.bySubject)).toEqual([`entity:${hostId}`]);
  });

  it('a refused write leaves the GM\'s cache as the world has it — the facts still the name\'s', async () => {
    const before = cached();
    const set = vi.spyOn(global.game.settings, 'set').mockImplementation(async (mod, key) => {
      if (key === 'campaignState') throw new Error('Setting [campaignState] could not be saved: the server refused the write');
    });
    await promoteNewEntityLedgerSubjects('Vex', 'connection', record, before);
    set.mockRestore();
    expect(cached()).toBe(before);                               // nothing was stored
    expect(cached().sceneTruths[0].subject).toEqual(VEX);        // was: re-keyed in place on the cache
    expect(Object.keys(cached().sceneState.bySubject)).toEqual(['vex']);
  });

  it('a caller\'s own working copy is promoted too (the move pipeline writes its ledgers back later)', async () => {
    const working = foundry.utils.deepClone(cached());
    await promoteNewEntityLedgerSubjects('Vex', 'connection', record, working);
    expect(working.sceneTruths[0].subject).toEqual({ kind: 'entity', entityId: hostId, entityType: 'connection' });
    expect(cached().sceneTruths[0].subject.kind).toBe('entity');
  });
});
