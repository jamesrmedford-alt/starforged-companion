/**
 * ENT-02 · NEAR-SPELLING-MERGES-DISTINCT-NAMES
 *
 * Scenario: the table knows the NPC "Soren Okoro". The narration introduces
 * his sister "Seren Okoro" (or: "Maria Vance" is known and "Mario Vance"
 * arrives; "Petra" and "Peter"; "Talen" and "Talon").
 *
 * Correct: two people. nameMatch.misspelledWord is "deliberately narrow —
 * maren and marek are two people", and tests/unit/nameMatch.test.js pins
 * "two people … whose short names differ by a letter, stay two people". The
 * second person is offered on a New Entities card, and a fact the detector
 * files under her name is not written onto his card.
 *
 * Today: the "near spelling" rule compares a word's consonant skeleton (its
 * first letter, then its consonants) and allows two edits, so any two names of
 * five letters or more that differ only in their vowels are one name. The
 * detection filter and the draft gate drop the second person — no card row,
 * no notice, and no other way to make an NPC card — and lore routing files
 * her facts on the one record that "answers" (his).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { routeEntityDrafts, parseDetectionResponse, routeWorldJournalResults } from '../../../src/entities/entityExtractor.js';
import { personNameMatch, misspelledWord } from '../../../src/entities/nameMatch.js';
import * as wj from '../../../src/world/worldJournal.js';

const MODULE = 'starforged-companion';

const npc = (id, name) => global.makeTestActor({
  id, type: 'character', name,
  flags: { [MODULE]: { entityType: 'connection', connection: { _id: `rec-${id}`, name, active: true, generativeTier: [] } } },
});
const person = (name, description = 'Someone on the comm.') => ({ type: 'connection', name, description, confidence: 'high' });
const CS = () => ({ connectionIds: ['npc-soren', 'npc-archer'], dismissedEntities: [], currentSessionId: 's1', sessionNumber: 1 });

let spies;
beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'gm-1' };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.ChatMessage._reset();
  global.game.messages = { contents: [], get: () => null };
  global.game.settings._store.clear();
  global.game.actors._set('pc-isaac', global.makeTestActor({ id: 'pc-isaac', type: 'character', name: 'Isaac Sutton' }));
  global.game.actors._set('npc-soren', npc('npc-soren', 'Soren Okoro'));
  global.game.actors._set('npc-archer', npc('npc-archer', 'Vuldar Archer'));
  spies = {
    recordLoreDiscovery:     vi.spyOn(wj, 'recordLoreDiscovery').mockResolvedValue(undefined),
    appendSessionLogBeat:    vi.spyOn(wj, 'appendSessionLogBeat').mockResolvedValue(undefined),
    getConfirmedLore:        vi.spyOn(wj, 'getConfirmedLore').mockReturnValue([]),
    getNarratorAssertedLore: vi.spyOn(wj, 'getNarratorAssertedLore').mockReturnValue([]),
  };
});
afterEach(() => vi.restoreAllMocks());

describe('ENT-02 — two names that differ only in a vowel are two people', () => {
  it('control: a typo of a known name is that person — "Valdur Archer" is not offered', async () => {
    const { queued } = await routeEntityDrafts([person('Valdur Archer')], CS(), { autoCreateConnection: false });
    expect(queued.map(e => e.name)).toEqual([]);
    expect(misspelledWord('sutton', 'suton')).toBe(true);
  });

  it('control: the rule the unit test pins — Maren and Marek, Kira and Kora stay two people', () => {
    expect(personNameMatch('Maren', 'Marek')).toBeNull();
    expect(personNameMatch('Kira', 'Kora')).toBeNull();
  });

  it('pure rule: Maria / Mario, Petra / Peter, Talen / Talon, Jonas / Jones are different names', () => {
    const pairs = [['Maria', 'Mario'], ['Petra', 'Peter'], ['Talen', 'Talon'], ['Jonas', 'Jones'], ['Soren', 'Seren']];
    expect(pairs.filter(([a, b]) => personNameMatch(a, b) !== null).map(p => p.join(' = '))).toEqual([]);
  });

  it('Seren Okoro, introduced beside the established Soren Okoro, is offered on the New Entities card', async () => {
    const { queued } = await routeEntityDrafts(
      [person('Seren Okoro', "Soren's sister, a courier pilot.")], CS(), { autoCreateConnection: false });
    expect(queued.map(e => e.name)).toEqual(['Seren Okoro']);
  });

  it('the detection parse keeps her too', () => {
    const raw = JSON.stringify({ entities: [person('Seren Okoro', "Soren's sister, a courier pilot.")], renames: [], worldJournal: {} });
    expect(parseDetectionResponse(raw, CS()).entities.map(e => e.name)).toEqual(['Seren Okoro']);
  });

  it("a fact the detector files under her name is not written onto Soren's card", async () => {
    await routeWorldJournalResults({
      lore: [{ title: 'Seren Okoro flies for the Compact', text: 'Seren Okoro flies courier runs for the Compact.',
        entityName: 'Seren Okoro', salience: 'significant' }],
    }, CS());
    const sorensTier = (global.game.actors.get('npc-soren').getFlag(MODULE, 'connection')?.generativeTier ?? []).map(e => e.detail);
    expect(sorensTier, "Soren's narrator-added details").toEqual([]);
  });
});
