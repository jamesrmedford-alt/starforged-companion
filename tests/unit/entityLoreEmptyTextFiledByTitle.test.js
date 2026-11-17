/**
 * STARFORGED COMPANION
 * tests/unit/entityLoreEmptyTextFiledByTitle.test.js
 *
 * Issue #362 AC45 ENTITY-LORE-EMPTY-TEXT-BLANK-DETAIL. The detector returned a
 * fact about an established NPC with the fact in its "title" and an empty
 * "text" — { title: "Archer smuggles for the Compact", text: "", entityName:
 * "Vuldar Archer" }. routeWorldJournalResults filed `lore.text ?? lore.title`:
 * `??` kept the empty string, so a narrator-added detail with no words went
 * on his card (another each time — the duplicate check skips a detail with no
 * words) and the fact was recorded nowhere. The fact is now its text, else its
 * title; an item with neither files nothing.
 *
 * From the audit probe tests/probes/ent/loreWithEmptyTextBlankCardDetail.probe.js.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { routeWorldJournalResults } from '../../src/entities/entityExtractor.js';
import * as wj from '../../src/world/worldJournal.js';

const MODULE = 'starforged-companion';
const CS = () => ({ connectionIds: ['npc-archer'], dismissedEntities: [], currentSessionId: 's1', sessionNumber: 1 });
const tier = () => (global.game.actors.get('npc-archer').getFlag(MODULE, 'connection')?.generativeTier ?? []).map(e => e.detail);

let spies;
beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'gm-1' };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.game.settings._store.clear();
  global.game.actors._set('npc-archer', global.makeTestActor({
    id: 'npc-archer', type: 'character', name: 'Vuldar Archer',
    flags: { [MODULE]: { entityType: 'connection', connection: { _id: 'rec-archer', name: 'Vuldar Archer', active: true, generativeTier: [] } } },
  }));
  spies = {
    recordLoreDiscovery:     vi.spyOn(wj, 'recordLoreDiscovery').mockResolvedValue(undefined),
    appendSessionLogBeat:    vi.spyOn(wj, 'appendSessionLogBeat').mockResolvedValue(undefined),
    getConfirmedLore:        vi.spyOn(wj, 'getConfirmedLore').mockReturnValue([]),
    getNarratorAssertedLore: vi.spyOn(wj, 'getNarratorAssertedLore').mockReturnValue([]),
  };
});
afterEach(() => vi.restoreAllMocks());

const FACT = 'Archer smuggles for the Compact';

describe('issue #362 AC45 — an entity fact with an empty "text" is filed by its title', () => {
  it('control: with no "text" key at all, the title is the detail', async () => {
    await routeWorldJournalResults({ lore: [{ title: FACT, entityName: 'Vuldar Archer', salience: 'significant' }] }, CS());
    expect(tier()).toEqual([FACT]);
  });

  it('control: a "text" with words is the detail, not the title', async () => {
    await routeWorldJournalResults({ lore: [{ title: 'Archer smuggles', text: 'Archer runs Compact cargo past the blockade.', entityName: 'Vuldar Archer', salience: 'significant' }] }, CS());
    expect(tier()).toEqual(['Archer runs Compact cargo past the blockade.']);
  });

  it('with "text": "" the title is the detail — never a blank line on the card, and once only', async () => {
    const lore = { title: FACT, text: '', entityName: 'Vuldar Archer', salience: 'significant' };
    await routeWorldJournalResults({ lore: [lore] }, CS());
    await routeWorldJournalResults({ lore: [{ ...lore }] }, CS());
    expect(tier()).toEqual([FACT]);
  });

  it('a "text" of blanks is no text either: the title is filed, trimmed', async () => {
    await routeWorldJournalResults({ lore: [{ title: `  ${FACT} `, text: '   ', entityName: 'Vuldar Archer', salience: 'significant' }] }, CS());
    expect(tier()).toEqual([FACT]);
  });

  it('an item with neither a text nor a title of words files nothing on the card', async () => {
    await routeWorldJournalResults({ lore: [{ title: '   ', text: '', entityName: 'Vuldar Archer', salience: 'significant' }] }, CS());
    expect(tier()).toEqual([]);
  });
});
