/**
 * STARFORGED COMPANION
 * tests/unit/factionDetectOneEncounter.test.js
 *
 * Issue #331 X33 (FACTION-DETECT-TWO-ENCOUNTERS). A narration names a new
 * faction once. The detection prompt reports it twice — an `entities` row and
 * a `factionUpdates` row, both asked for — and runDiscoveryDetection routes
 * the World Journal first (factionUpdates → recordFactionIntelligence,
 * encounter #1) and then the drafts (the faction auto-surface in
 * routeEntityDrafts → recordFactionIntelligence again, encounter #2): every
 * new faction's page started with a doubled first encounter. The auto-surface
 * now skips a faction the journal already has.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { routeWorldJournalResults, routeEntityDrafts } from '../../src/entities/entityExtractor.js';
import { getFactionEntry } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
let journalMock;

const detectionFor = ({ asEntity = true } = {}) => ({
  entities: asEntity
    ? [{ type: 'faction', name: 'Iron Syndicate', description: 'A smuggling cartel that runs the docks', confidence: 'high' }]
    : [],
  renames: [],
  worldJournal: {
    lore: [], threats: [], locationUpdates: [], stateTransitions: [],
    factionUpdates: [{ name: 'Iron Syndicate', attitude: 'hostile', summary: 'They run the docks', isNew: true }],
  },
});

// The order narrator.js runDiscoveryDetection uses (lines 924-928).
async function runDetectionRouting(detection, cs) {
  await routeWorldJournalResults(detection.worldJournal, cs);
  await routeEntityDrafts(detection.entities, cs, { autoCreateConnection: false, source: 'move_resolution', actorId: null });
}

beforeEach(() => {
  journalMock = installJournalMock();
  global.game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE_ID}.campaignState`, {
    factionIds: [], connectionIds: [], settlementIds: [], shipIds: [], planetIds: [], locationIds: [], creatureIds: [],
    dismissedEntities: [], sectors: [], currentSessionId: 'sess-1',
  });
});
afterEach(() => journalMock?.restore());

describe('X33 — a faction named once in a narration is one encounter on its World Journal page', () => {
  it('a new faction reported as an entity and in factionUpdates gets one encounter, not two', async () => {
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await runDetectionRouting(detectionFor({ asEntity: true }), cs);

    const entry = getFactionEntry('Iron Syndicate');
    expect(entry).toBeTruthy();                          // the WJ surface happened
    expect(entry.attitude).toBe('hostile');              // control: the narration's attitude stands
    // It was 2 — routeWorldJournalResults' factionUpdates row and
    // routeEntityDrafts' auto-surface each pushed an encounter.
    expect(entry.encounters).toHaveLength(1);
  });

  it('a faction reported only as an entity is still surfaced to the journal, once', async () => {
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    const detection = detectionFor({ asEntity: true });
    detection.worldJournal.factionUpdates = [];
    await runDetectionRouting(detection, cs);
    const entry = getFactionEntry('Iron Syndicate');
    expect(entry).toBeTruthy();
    expect(entry.encounters).toHaveLength(1);
  });

  it('control: a faction reported only under factionUpdates gets exactly one encounter', async () => {
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await runDetectionRouting(detectionFor({ asEntity: false }), cs);
    expect(getFactionEntry('Iron Syndicate').encounters).toHaveLength(1);
  });
});
