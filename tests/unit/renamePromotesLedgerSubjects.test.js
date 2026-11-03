// tests/unit/renamePromotesLedgerSubjects.test.js
// A placeholder's rename re-keys the facts recorded under its new name
// (issue #326 W68). "Unknown Suited Figure" → "Vex": the revealing
// narration's sidecar recorded "Vex" facts as a text subject (no card was
// named Vex yet), and promoteNewEntityLedgerSubjects ran for a new entity
// (Confirm, the auto-create, the vow target) but never for a rename, so the
// facts neither rendered on the card nor migrated to it at scene end.

import { describe, it, expect, beforeEach } from 'vitest';
import { applyEntityRenames } from '../../src/entities/entityExtractor.js';
import { createConnection } from '../../src/entities/connection.js';
import { resolveSubject } from '../../src/factContinuity/ledgers.js';
import { collectAllEntities } from '../../src/context/relevanceResolver.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE = 'starforged-companion';

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.ChatMessage._reset();
  const store = global.game.settings._store;
  store.clear();
  store.set(`${MODULE}.campaignState`, {
    ...CampaignStateSchema, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {} }, connectionIds: [],
  });
});

describe('a placeholder renamed by the narration takes the facts recorded under its new name (issue #326 W68)', () => {
  it('the revealing narration’s facts about the new name join the renamed card', async () => {
    await createConnection({ name: 'Unknown Suited Figure', description: 'A figure in a sealed vac-suit.' },
      global.game.settings.get(MODULE, 'campaignState'));
    const hostId = global.game.settings.get(MODULE, 'campaignState').connectionIds[0];

    // The revealing narration's sidecar subject, as it resolved then: no card named Vex yet.
    const before = global.game.settings.get(MODULE, 'campaignState');
    const subject = resolveSubject('Vex', before, collectAllEntities(before));
    expect(subject).toEqual({ kind: 'text', text: 'Vex' });          // control
    global.game.settings._store.set(`${MODULE}.campaignState`, {
      ...before,
      sceneTruths: [{ id: 't-vex', fact: 'Vex — she/her, a scar across one cheek, works for the Compact',
        subject, sceneId: 'sc-1', createdAt: Date.now() }],
      sceneState: { bySubject: { vex: [{ attribute: 'condition', value: 'wounded', subject, updatedAt: Date.now() }] } },
    });

    // The detection pass after that narration (runDiscoveryDetection → applyEntityRenames).
    const applied = await applyEntityRenames([{ from: 'Unknown Suited Figure', to: 'Vex' }],
      global.game.settings.get(MODULE, 'campaignState'));
    expect(applied.map(a => a.to)).toEqual(['Vex']);                 // control: the card was renamed
    expect(global.game.actors.get(hostId).name).toBe('Vex');

    const stored = global.game.settings.get(MODULE, 'campaignState');
    expect({
      truthSubject: stored.sceneTruths[0].subject,
      stateKeys:    Object.keys(stored.sceneState.bySubject),
    }).toEqual({
      truthSubject: { kind: 'entity', entityId: hostId, entityType: 'connection' },
      stateKeys:    [`entity:${hostId}`],
    });
  });
  it('control: facts about another text subject are left as they were', async () => {
    await createConnection({ name: 'Unknown Suited Figure', description: 'A figure in a sealed vac-suit.' },
      global.game.settings.get(MODULE, 'campaignState'));
    const before = global.game.settings.get(MODULE, 'campaignState');
    global.game.settings._store.set(`${MODULE}.campaignState`, {
      ...before,
      sceneTruths: [{ id: 't-other', fact: 'The dockmaster is nervous', subject: { kind: 'text', text: 'the dockmaster' }, sceneId: 'sc-1', createdAt: 1 }],
    });
    await applyEntityRenames([{ from: 'Unknown Suited Figure', to: 'Vex' }], global.game.settings.get(MODULE, 'campaignState'));
    expect(global.game.settings.get(MODULE, 'campaignState').sceneTruths[0].subject).toEqual({ kind: 'text', text: 'the dockmaster' });
  });
});
