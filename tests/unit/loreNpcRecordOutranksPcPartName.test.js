/**
 * STARFORGED COMPANION
 * tests/unit/loreNpcRecordOutranksPcPartName.test.js
 *
 * Issue #362 AC41 LORE-NPC-RECORD-LOSES-TO-PC-PART-NAME. The PC is "Isaac
 * Sutton"; his father is on record as the NPC "Captain Sutton". A fact the
 * detector files under the NPC's exact name went to the Session Log as the
 * PC's doing: routeWorldJournalResults asked loreIsAboutPlayerCharacter — the
 * part-name rule ("sutton", title aside, is the PC's last name) — before it
 * looked the record up, so the NPC's card never got it.
 *
 * Who a fact is about now: a PC named in full is the PC; a record of exactly
 * the name the detector used (a title aside) is that record's; only then a
 * PC by part of their name (or leading the title); then a record the name
 * answers to.
 *
 * From the audit probe tests/probes/ent/loreAboutNpcFiledAsPlayerCharacters.probe.js.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { routeWorldJournalResults } from '../../src/entities/entityExtractor.js';
import * as wj from '../../src/world/worldJournal.js';

const MODULE = 'starforged-companion';

const npc = (id, name) => global.makeTestActor({
  id, type: 'character', name,
  flags: { [MODULE]: { entityType: 'connection', connection: { _id: `rec-${id}`, name, active: true, generativeTier: [] } } },
});
const pc = (id, name) => global.game.actors._set(id, global.makeTestActor({ id, type: 'character', name }));
let connectionIds;
const CS = () => ({ connectionIds, dismissedEntities: [], currentSessionId: 's1', sessionNumber: 1 });
const tierOf = (id) => (global.game.actors.get(id).getFlag(MODULE, 'connection')?.generativeTier ?? []).map(e => e.detail);
const fact = (entityName, text, title = text) => ({ lore: [{ title, text, entityName, salience: 'significant' }] });

let spies;
beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'gm-1' };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.ChatMessage._reset();
  global.game.messages = { contents: [], get: () => null };
  global.game.settings._store.clear();
  pc('pc-isaac', 'Isaac Sutton');
  global.game.actors._set('npc-father', npc('npc-father', 'Captain Sutton'));
  global.game.actors._set('npc-archer', npc('npc-archer', 'Vuldar Archer'));
  connectionIds = ['npc-father', 'npc-archer'];
  spies = {
    recordLoreDiscovery:     vi.spyOn(wj, 'recordLoreDiscovery').mockResolvedValue(undefined),
    appendSessionLogBeat:    vi.spyOn(wj, 'appendSessionLogBeat').mockResolvedValue(undefined),
    getConfirmedLore:        vi.spyOn(wj, 'getConfirmedLore').mockReturnValue([]),
    getNarratorAssertedLore: vi.spyOn(wj, 'getNarratorAssertedLore').mockReturnValue([]),
  };
});
afterEach(() => vi.restoreAllMocks());

const beats = () => spies.appendSessionLogBeat.mock.calls.length;
const CHARTS = 'Captain Sutton sold the survey charts to the Compact.';

describe('issue #362 AC41 — a fact about an NPC on record is the NPC\'s, even when a PC shares the surname', () => {
  it('control: a fact about another NPC, under part of his name, reaches his card', async () => {
    await routeWorldJournalResults(fact('Archer', 'Archer owes the Compact a debt.', 'Archer owes the Compact'), CS());
    expect(tierOf('npc-archer')).toEqual(['Archer owes the Compact a debt.']);
    expect(beats()).toBe(0);
  });

  it('control: the PC\'s own doing, named in full, is the Session Log\'s', async () => {
    await routeWorldJournalResults(fact('Isaac Sutton', 'Isaac Sutton committed the Savela to the run.'), CS());
    expect({ beats: beats(), card: tierOf('npc-father') }).toEqual({ beats: 1, card: [] });
  });

  it('control: a title the PC leads, with no entity named, is the Session Log\'s', async () => {
    await routeWorldJournalResults({ lore: [{ title: 'Isaac Sutton: chose the long way round', text: 'He took the Savela the long way.', salience: 'significant' }] }, CS());
    expect(beats()).toBe(1);
  });

  it('a fact filed under the NPC\'s exact recorded name goes on his card, not the Session Log', async () => {
    await routeWorldJournalResults(fact('Captain Sutton', CHARTS, 'Captain Sutton sold the charts'), CS());
    expect({ card: tierOf('npc-father'), sessionLogBeats: beats() }).toEqual({ card: [CHARTS], sessionLogBeats: 0 });
  });

  it('the exact name in another case is still the NPC\'s', async () => {
    await routeWorldJournalResults(fact('captain sutton', CHARTS, 'Captain Sutton sold the charts'), CS());
    expect({ card: tierOf('npc-father'), sessionLogBeats: beats() }).toEqual({ card: [CHARTS], sessionLogBeats: 0 });
  });

  it('a PC whose whole name is the NPC\'s name without its title: "Sutton" is the PC, "Captain Sutton" the NPC', async () => {
    global.game.actors._reset();
    pc('pc-sutton', 'Sutton');
    global.game.actors._set('npc-father', npc('npc-father', 'Captain Sutton'));
    connectionIds = ['npc-father'];
    await routeWorldJournalResults(fact('Sutton', 'Sutton swore to find the Founders.'), CS());
    expect({ beats: beats(), card: tierOf('npc-father') }).toEqual({ beats: 1, card: [] });
    await routeWorldJournalResults(fact('Captain Sutton', CHARTS), CS());
    expect({ beats: beats(), card: tierOf('npc-father') }).toEqual({ beats: 1, card: [CHARTS] });
  });

  it('control: a part name a PC and an NPC both answer to, with no record of that name, is still the PC\'s', async () => {
    global.game.actors._set('npc-mara', npc('npc-mara', 'Mara Sutton'));
    connectionIds = ['npc-mara', 'npc-archer'];
    await routeWorldJournalResults(fact('Sutton', 'Sutton refused the Compact\'s offer.'), CS());
    expect({ beats: beats(), card: tierOf('npc-mara') }).toEqual({ beats: 1, card: [] });
  });
});
