/**
 * STARFORGED COMPANION
 * tests/unit/loreRoutedToActiveSectorNamesake.test.js
 *
 * Issue #362 AC22 LORE-ROUTE-OLDER-SECTOR-NAMESAKE. Generated site names repeat
 * across sectors (every derelict is "Derelict Starship" or "Derelict
 * Settlement", numbered only within one sector). With the crew aboard the
 * active sector's derelict, a fact the detection pass files as entity lore
 * under "Derelict Starship" went to the OLDER sector's site:
 * findEntityForLoreRouting's exact rung returned the first record of the name
 * in creation order. Every other resolver leads with the active sector's
 * namesake (relevanceResolver.activeSectorNamesakeFirst, issue #342 Z15 / #345
 * AA06); lore routing now does too — and a name it cannot tell apart (no
 * namesake in the active sector, or two) is nobody's: it stays world lore.
 *
 * From the audit probe tests/probes/wj/loreRoutedToOlderSectorNamesake.probe.js.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { routeWorldJournalResults } from '../../src/entities/entityExtractor.js';
import * as wj from '../../src/world/worldJournal.js';

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
let recordLore;
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
  recordLore = vi.spyOn(wj, 'recordLoreDiscovery').mockResolvedValue(undefined);

  older  = site('loc-old',  'Derelict Starship', 'sec-1');   // the first sector's, made first
  here   = site('loc-here', 'Derelict Starship', 'sec-2');   // the active sector's — the crew is aboard it
  unique = site('loc-relay', 'Relay Nine', 'sec-2');
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1',
    activeSectorId: 'sec-2',
    sectors: [{ id: 'sec-1', name: 'Devil\'s Maw' }, { id: 'sec-2', name: 'Onyx Threshold' }, { id: 'sec-3', name: 'Ashen Reach' }],
    currentLocationId: 'loc-here', currentLocationType: 'location',
    sceneTruths: [], dismissedEntities: [], xCardActive: false,
    connectionIds: [], factionIds: [], settlementIds: [], planetIds: [], shipIds: [], creatureIds: [],
    locationIds: ['loc-old', 'loc-here', 'loc-relay'],
  });
});
afterEach(() => {
  game.journal.getName = orig.getName;
  game.journal.find = orig.find;
  vi.restoreAllMocks();
});

const REACTOR = 'Its reactor is still warm — someone restarted it within the week.';
const lore = (entityName, text) => ({ lore: [{ title: 'Reactor still warm', category: 'other', text, salience: 'significant', entityName }],
  threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] });
const withState = (over) => game.settings._store.set(KEY, { ...stored(), ...over });

describe('issue #362 AC22 — entity lore about a site whose name another sector\'s site shares', () => {
  it('control: a fact about a site of a unique name is filed on that site', async () => {
    await routeWorldJournalResults(lore('Relay Nine', 'The relay still answers on the old Covenant band.'), stored(), { narrationId: 'nar-0' });
    expect(details(unique)).toEqual(['The relay still answers on the old Covenant band.']);
  });

  it('control: a unique name in another sector is still that site\'s', async () => {
    const far = site('loc-far', 'Kovash Beacon', 'sec-1');
    withState({ locationIds: [...stored().locationIds, 'loc-far'] });
    await routeWorldJournalResults(lore('Kovash Beacon', 'The beacon repeats a Founder call sign.'), stored(), { narrationId: 'nar-0' });
    expect(details(far)).toEqual(['The beacon repeats a Founder call sign.']);
  });

  it('the fact is never filed on the other sector\'s namesake', async () => {
    await routeWorldJournalResults(lore('Derelict Starship', REACTOR), stored(), { narrationId: 'nar-1' });
    expect(details(older), 'Narrator-added details on the OLDER sector\'s Derelict Starship (the crew is not there)').toEqual([]);
  });

  it('the active sector\'s site — the one the crew is aboard — gets it', async () => {
    await routeWorldJournalResults(lore('Derelict Starship', REACTOR), stored(), { narrationId: 'nar-1' });
    expect(details(here), 'Narrator-added details on the ACTIVE sector\'s Derelict Starship').toEqual([REACTOR]);
    expect(recordLore).not.toHaveBeenCalled();
  });

  it('neither namesake in the active sector: nobody\'s — the fact stays world lore', async () => {
    withState({ activeSectorId: 'sec-3' });
    await routeWorldJournalResults(lore('Derelict Starship', REACTOR), stored(), { narrationId: 'nar-2' });
    expect({ older: details(older), here: details(here) }).toEqual({ older: [], here: [] });
    expect(recordLore).toHaveBeenCalledTimes(1);
  });

  it('two namesakes in the active sector: nobody\'s either', async () => {
    const twin = site('loc-twin', 'Derelict Starship', 'sec-2');
    withState({ locationIds: [...stored().locationIds, 'loc-twin'] });
    await routeWorldJournalResults(lore('Derelict Starship', REACTOR), stored(), { narrationId: 'nar-3' });
    expect({ older: details(older), here: details(here), twin: details(twin) }).toEqual({ older: [], here: [], twin: [] });
    expect(recordLore).toHaveBeenCalledTimes(1);
  });
});
