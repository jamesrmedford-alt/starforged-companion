/**
 * PROBE — RENAME-FACTS-TEXT-BOUND (EN)
 *
 * What the user does: the crew met a figure recorded as "Unknown Suited
 * Figure" (a placeholder NPC card). A later narration reveals her name —
 * "she pulls back the visor: Vex" — and its sidecar records her identity
 * anchor under the name it now uses, "Vex". The detection pass that follows
 * emits `renames: [{ from: "Unknown Suited Figure", to: "Vex" }]` and the
 * card is renamed in place (decisions.md, "Placeholder figures are renamed
 * in place").
 *
 * What happens: the facts the revealing narration recorded under "Vex" stay
 * a text subject. When that narration's sidecar ran there was no card named
 * Vex, so resolveSubject (src/factContinuity/ledgers.js ~263) made them
 * `{ kind: "text", text: "Vex" }`; applyEntityRenames
 * (src/entities/entityExtractor.js ~601) renames the card but never re-keys
 * them — promoteNewEntityLedgerSubjects, which does exactly that for a new
 * entity (issue #286 A3), is called by Confirm, the make_a_connection
 * auto-create and the inciting vow target, never by a rename. The facts do
 * not render on Vex's card and do not migrate to it at scene end.
 *
 * What should happen: a rename re-keys the scene ledgers' text-subject facts
 * recorded under the revealed name to the renamed card's host id, on the
 * stored campaignState, as a new entity's creation does.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { applyEntityRenames } from '../../../src/entities/entityExtractor.js';
import { createConnection } from '../../../src/entities/connection.js';
import { resolveSubject } from '../../../src/factContinuity/ledgers.js';
import { collectAllEntities } from '../../../src/context/relevanceResolver.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('PROBE RENAME-FACTS-TEXT-BOUND', () => {
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
});
