/**
 * ENT-06 · ENTITY-LORE-EMPTY-TEXT-BLANK-DETAIL
 *
 * Scenario: the detector returns a fact about an established NPC with the
 * fact in its "title" and an empty "text" — { title: "Archer smuggles for the
 * Compact", text: "", entityName: "Vuldar Archer", salience: "significant" }.
 *
 * Correct: the fact reaches his card — the title is the fallback
 * (routeWorldJournalResults: `detail: lore.text ?? lore.title`; world lore's
 * writer uses `entry.text || existing.text`).
 *
 * Today: `??` keeps the empty string, so a narrator-added detail with no
 * words is appended to the card — and a second one each time it happens (the
 * duplicate check skips a detail with no words) — while the fact itself is
 * recorded nowhere: not on the card, not in the Lore journal, not in the
 * Session Log.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { routeWorldJournalResults } from '../../../src/entities/entityExtractor.js';
import * as wj from '../../../src/world/worldJournal.js';

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

describe('ENT-06 — an entity fact with an empty "text" is filed by its title', () => {
  it('control: with no "text" key at all, the title is the detail', async () => {
    await routeWorldJournalResults({
      lore: [{ title: 'Archer smuggles for the Compact', entityName: 'Vuldar Archer', salience: 'significant' }],
    }, CS());
    expect(tier()).toEqual(['Archer smuggles for the Compact']);
  });

  it('with "text": "" the title is the detail too — never a blank line on the card', async () => {
    const lore = { title: 'Archer smuggles for the Compact', text: '', entityName: 'Vuldar Archer', salience: 'significant' };
    await routeWorldJournalResults({ lore: [lore] }, CS());
    await routeWorldJournalResults({ lore: [{ ...lore }] }, CS());
    expect(tier()).toEqual(['Archer smuggles for the Compact']);
  });
});
