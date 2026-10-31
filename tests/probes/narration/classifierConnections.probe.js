// tests/probes/narration/classifierConnections.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// CLASSIFIER-CONNECTIONS-JOURNAL: the pacing classifier's CHARACTER section
// lists the campaign's connections so its "If the addressee is a Connection
// ... bias toward MOVE in the social category" rule can fire. formatConnections
// (src/pacing/classifier.js) reads each id from game.journal → page flags, but
// connections are Actor-hosted (src/entities/registry.js HOST_COLLECTION:
// connection → 'actor'; FOLDER-002). The id never resolves in game.journal, so
// the classifier is only ever told "N active (names unavailable)".

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { buildClassifierContext } from '../../../src/pacing/classifier.js';

const MODULE_ID = 'starforged-companion';

beforeEach(() => {
  game.actors._reset();
});

describe('pacing classifier — connection names reach the CHARACTER section', () => {
  it('names an Actor-hosted connection (the only way connections are stored today)', () => {
    // The connection record as createConnection stores it: flags on the NPC
    // card Actor (character type, entityType-tagged).
    game.actors._set('conn-actor-1', {
      id:   'conn-actor-1',
      name: 'Kael Dros',
      type: 'character',
      flags: { [MODULE_ID]: {
        entityType: 'connection',
        connection: { _id: 'rec-1', name: 'Kael Dros', relationshipType: 'ally', role: 'dockmaster' },
      } },
      getFlag(mod, key) { return this.flags?.[mod]?.[key]; },
    });

    const { userMessage } = buildClassifierContext({
      playerText:        'I lean on Kael Dros for the docking codes.',
      campaignState:     { connectionIds: ['conn-actor-1'] },
      character:         { name: 'Kira' },
      recentMoveDensity: { count: 0, window: 5 },
      pacingConfig:      { dials: { combat: 9, investigation: 6, exploration: 6, social: 5, downtime: 1 }, sceneOverride: null },
    });

    // Correct: the classifier is told who the connections are.
    const connectionsLine = userMessage.split('\n').find(l => l.startsWith('Connections:'));
    expect(connectionsLine).toContain('Kael Dros');
    expect(connectionsLine).not.toContain('names unavailable');
  });
});
