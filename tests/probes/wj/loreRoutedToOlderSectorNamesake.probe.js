/**
 * WJ-02 · LORE-ROUTE-OLDER-SECTOR-NAMESAKE
 *
 * Scenario: the campaign has two sectors, each with a generated site named
 * "Derelict Starship" (generated site names repeat across sectors — every
 * derelict is "Derelict Starship" or "Derelict Settlement", numbered only
 * within one sector). The crew is in the newer sector (the active one),
 * aboard its derelict. A narration establishes a fact about it and the
 * detection pass returns it as entity lore: `entityName: "Derelict Starship"`.
 *
 * Correct: the fact is filed on the active sector's derelict — the rule every
 * other name resolver follows (activeSectorNamesakeFirst, issue #342 Z15 /
 * #345 AA06) — or, when the name cannot be told apart, on neither ("two
 * records answering is nobody's": it stays world lore). Never on the other
 * sector's site.
 *
 * Today: `findEntityForLoreRouting` walks `locationIds` in creation order and
 * returns the first record of that name — the older sector's derelict. The
 * fact lands on a site the crew is nowhere near; the card of the derelict
 * they are aboard (the one relevance hands the narrator) never gets it.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { routeWorldJournalResults } from '../../../src/entities/entityExtractor.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

function site(id, name, sectorId) {
  const actor = makeTestActor({ id, name, type: 'location', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'location', entityId: `rec-${id}`,
      location: { _id: `rec-${id}`, name, type: 'derelict', status: 'explored', sectorId, generativeTier: [] } } } });
  game.actors._set(actor.id, actor);
  return actor;
}
const details = (actor) => (actor.getFlag(MODULE_ID, 'location')?.generativeTier ?? []).map(e => e.detail);

let orig;
let older;
let here;
let unique;
beforeEach(() => {
  orig = { getName: game.journal.getName, find: game.journal.find };
  game.journal.getName = () => null;
  game.journal.find    = () => null;
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];

  older  = site('loc-old',  'Derelict Starship', 'sec-1');   // the first sector's, made first
  here   = site('loc-here', 'Derelict Starship', 'sec-2');   // the active sector's — the crew is aboard it
  unique = site('loc-relay', 'Relay Nine', 'sec-2');
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1',
    activeSectorId: 'sec-2',
    sectors: [{ id: 'sec-1', name: 'Devil\'s Maw' }, { id: 'sec-2', name: 'Onyx Threshold' }],
    currentLocationId: 'loc-here', currentLocationType: 'location',
    sceneTruths: [], dismissedEntities: [], xCardActive: false,
    connectionIds: [], factionIds: [], settlementIds: [], planetIds: [], shipIds: [], creatureIds: [],
    locationIds: ['loc-old', 'loc-here', 'loc-relay'],
  });
});
afterEach(() => { game.journal.getName = orig.getName; game.journal.find = orig.find; });

const lore = (entityName, text) => ({ lore: [{ title: 'Reactor still warm', category: 'other', text, salience: 'significant', entityName }],
  threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] });

describe('WJ-02 — entity lore about a site whose name another sector\'s site shares', () => {
  it('control: a fact about a site of a unique name is filed on that site', async () => {
    await routeWorldJournalResults(lore('Relay Nine', 'The relay still answers on the old Covenant band.'), stored(), { narrationId: 'nar-0' });
    expect(details(unique)).toEqual(['The relay still answers on the old Covenant band.']);
  });

  it('the fact is never filed on the other sector\'s namesake', async () => {
    await routeWorldJournalResults(lore('Derelict Starship', 'Its reactor is still warm — someone restarted it within the week.'), stored(), { narrationId: 'nar-1' });
    expect(details(older), 'Narrator-added details on the OLDER sector\'s Derelict Starship (the crew is not there)').toEqual([]);
  });

  it('the active sector\'s site — the one the crew is aboard — gets it', async () => {
    await routeWorldJournalResults(lore('Derelict Starship', 'Its reactor is still warm — someone restarted it within the week.'), stored(), { narrationId: 'nar-1' });
    expect(details(here), 'Narrator-added details on the ACTIVE sector\'s Derelict Starship').toEqual(['Its reactor is still warm — someone restarted it within the week.']);
  });
});
