/**
 * PROBE — ENT-02 FACTION-DETECT-TWO-ENCOUNTERS (ninth audit, area entities)
 *
 * What the user does: plays on; a narration names a faction for the first
 * time ("the Iron Syndicate runs the docks").
 *
 * What happens: the detection prompt asks for every named faction twice —
 * as an `entities` row (type "faction") and as a `worldJournal.factionUpdates`
 * row ("include every named faction … even on its first mention"). The pass
 * routes the World Journal first (src/narration/narrator.js:924
 * routeWorldJournalResults → entityExtractor.js:800-804: no faction record
 * exists → recordFactionIntelligence, encounter #1), then the drafts
 * (narrator.js:928 routeEntityDrafts → entityExtractor.js:560-568: the
 * faction auto-surface, "the WJ entry gives the table an immediate, durable
 * home" → recordFactionIntelligence again, encounter #2). One narration, one
 * mention — two encounter rows on the Factions page, and the !journal /
 * landscape readers count them as two meetings.
 *
 * What should happen: one narration's mention is one encounter. The same
 * class as the known FACTION-CONFIRM-TWO-ENCOUNTERS (the Confirm's two
 * writes), at the detection pass instead of the Confirm — every new faction
 * starts its journal with a doubled first encounter.
 *
 * Control: a faction the detector reports only under factionUpdates gets
 * exactly one encounter.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installJournalMock } from '../../helpers/fullStateFixture.js';
import { routeWorldJournalResults, routeEntityDrafts } from '../../../src/entities/entityExtractor.js';
import { getFactionEntry } from '../../../src/world/worldJournal.js';

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

describe('ENT-02 a faction named once in a narration is one encounter on its World Journal page', () => {
  it('a new faction reported as an entity and in factionUpdates gets one encounter, not two', async () => {
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await runDetectionRouting(detectionFor({ asEntity: true }), cs);

    const entry = getFactionEntry('Iron Syndicate');
    expect(entry).toBeTruthy();                          // the WJ surface happened
    expect(entry.attitude).toBe('hostile');              // control: the narration's attitude stands
    // Expected: 1. Today: 2 — routeWorldJournalResults' factionUpdates row and
    // routeEntityDrafts' auto-surface each push an encounter.
    expect(entry.encounters).toHaveLength(1);
  });

  it('control: a faction reported only under factionUpdates gets exactly one encounter', async () => {
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await runDetectionRouting(detectionFor({ asEntity: false }), cs);
    expect(getFactionEntry('Iron Syndicate').encounters).toHaveLength(1);
  });
});
