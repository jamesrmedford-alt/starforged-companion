/**
 * ENT-04 · LORE-NPC-RECORD-LOSES-TO-PC-PART-NAME
 *
 * Scenario: the PC is "Isaac Sutton". His father is on record as the NPC
 * "Captain Sutton" (the inciting vow's target; a sector's connection). A
 * narration establishes a fact about the father and the detector files it
 * under the NPC's exact established name: entityName "Captain Sutton".
 *
 * Correct: a record of exactly that name exists — the fact goes on that
 * record's card (findEntityForLoreRouting takes an exact name first). Only a
 * player character's own doings are the Session Log's (issue #354 P2-17).
 *
 * Today: routeWorldJournalResults asks loreIsAboutPlayerCharacter BEFORE it
 * looks for the record, and that test is the part-name rule ("sutton" is the
 * last name of "isaac sutton"), so the NPC's fact is written to the Session
 * Log as a PC's doing and never reaches his card — whatever its salience.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { routeWorldJournalResults } from '../../../src/entities/entityExtractor.js';
import * as wj from '../../../src/world/worldJournal.js';

const MODULE = 'starforged-companion';

const npc = (id, name) => global.makeTestActor({
  id, type: 'character', name,
  flags: { [MODULE]: { entityType: 'connection', connection: { _id: `rec-${id}`, name, active: true, generativeTier: [] } } },
});
const CS = () => ({ connectionIds: ['npc-father', 'npc-archer'], dismissedEntities: [], currentSessionId: 's1', sessionNumber: 1 });
const tierOf = (id) => (global.game.actors.get(id).getFlag(MODULE, 'connection')?.generativeTier ?? []).map(e => e.detail);

let spies;
beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'gm-1' };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.ChatMessage._reset();
  global.game.messages = { contents: [], get: () => null };
  global.game.settings._store.clear();
  global.game.actors._set('pc-isaac', global.makeTestActor({ id: 'pc-isaac', type: 'character', name: 'Isaac Sutton' }));
  global.game.actors._set('npc-father', npc('npc-father', 'Captain Sutton'));
  global.game.actors._set('npc-archer', npc('npc-archer', 'Vuldar Archer'));
  spies = {
    recordLoreDiscovery:     vi.spyOn(wj, 'recordLoreDiscovery').mockResolvedValue(undefined),
    appendSessionLogBeat:    vi.spyOn(wj, 'appendSessionLogBeat').mockResolvedValue(undefined),
    getConfirmedLore:        vi.spyOn(wj, 'getConfirmedLore').mockReturnValue([]),
    getNarratorAssertedLore: vi.spyOn(wj, 'getNarratorAssertedLore').mockReturnValue([]),
  };
});
afterEach(() => vi.restoreAllMocks());

describe('ENT-04 — a fact about an NPC on record is the NPC\'s, even when a PC shares the surname', () => {
  it('control: a fact about another NPC, under part of his name, reaches his card', async () => {
    await routeWorldJournalResults({
      lore: [{ title: 'Archer owes the Compact', text: 'Archer owes the Compact a debt.', entityName: 'Archer', salience: 'significant' }],
    }, CS());
    expect(tierOf('npc-archer')).toEqual(['Archer owes the Compact a debt.']);
    expect(spies.appendSessionLogBeat).not.toHaveBeenCalled();
  });

  it('control: the PC\'s own doing, named in full, is the Session Log\'s', async () => {
    await routeWorldJournalResults({
      lore: [{ title: 'Isaac Sutton committed the Savela', text: 'Isaac Sutton committed the Savela to the run.', entityName: 'Isaac Sutton', salience: 'significant' }],
    }, CS());
    expect(spies.appendSessionLogBeat).toHaveBeenCalledTimes(1);
  });

  it('a fact filed under the NPC\'s exact recorded name goes on his card, not the Session Log', async () => {
    await routeWorldJournalResults({
      lore: [{ title: 'Captain Sutton sold the charts', text: 'Captain Sutton sold the survey charts to the Compact.',
        entityName: 'Captain Sutton', salience: 'significant' }],
    }, CS());
    expect({ card: tierOf('npc-father'), sessionLogBeats: spies.appendSessionLogBeat.mock.calls.length })
      .toEqual({ card: ['Captain Sutton sold the survey charts to the Compact.'], sessionLogBeats: 0 });
  });
});
