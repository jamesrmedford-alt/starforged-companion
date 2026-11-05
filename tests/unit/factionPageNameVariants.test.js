/**
 * STARFORGED COMPANION
 * tests/unit/factionPageNameVariants.test.js
 *
 * Issue #336 Y31 (FACTION-PAGE-IDENTITY-BY-EXACT-NAME) — one faction is one
 * World Journal page and one stance, whatever article, case or spacing the
 * detection used.
 *
 * The record is "Iron Syndicate"; the detection reply names it the way its
 * prompt says to, with the article — an attitudeShift for "The Iron
 * Syndicate". Pages were matched by exact name, the record by lowercase trim
 * and the entity gate by normalizeEntityName (no article strip): the shift
 * made a second page and never reached the record (the canonical stance), so
 * FACTION LANDSCAPE listed one faction with two stances. A new faction
 * reported as "Iron Syndicate" and "The Iron Syndicate" got two pages. Every
 * faction lookup by name now keys on factionNameKey (rules/reachability.md
 * §6).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installJournalMock, addFactionEntity } from '../helpers/fullStateFixture.js';
import { routeWorldJournalResults, routeEntityDrafts, entityExistsForName } from '../../src/entities/entityExtractor.js';
import { getFactionLandscape, getFactionEntry, recordFactionIntelligence, recordLoreDiscovery, JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { getFaction, listFactions, mergeFactionLandscape, factionNameKey, findFactionByName } from '../../src/entities/faction.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
let journalMock;

const cs = () => game.settings.get(MODULE_ID, 'campaignState');
const wj = (over = {}) => ({ lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [], ...over });
const factionPages = () => (journalMock.journals.get(JOURNAL_NAMES.factions)?.pages.contents ?? []).map(p => p.name);
const landscape    = () => mergeFactionLandscape(listFactions(cs()), getFactionLandscape(cs())).map(e => `${e.name} — ${e.stance}`);

beforeEach(() => {
  journalMock = installJournalMock();
  game.actors._reset();
  global.game.messages = { contents: [] };
  game.settings._store.clear();
  game.settings._store.set(KEY, {
    factionIds: [], connectionIds: [], settlementIds: [], shipIds: [], planetIds: [], locationIds: [], creatureIds: [],
    dismissedEntities: [], sectors: [], currentSessionId: 'sess-1',
  });
});
afterEach(() => journalMock?.restore());

describe('issue #336 Y31 — one faction is one page and one stance, whatever article or case the detection used', () => {
  it('control: an attitude shift under the record\'s exact name moves the canonical stance and FACTION LANDSCAPE shows one line', async () => {
    const { journalId } = addFactionEntity(journalMock.journals, { name: 'Iron Syndicate', relationship: 'apathetic' });
    cs().factionIds.push(journalId);
    await routeWorldJournalResults(wj({ stateTransitions: [
      { entryType: 'faction', name: 'Iron Syndicate', change: 'attitudeShift', newValue: 'hostile', summary: 'They turned on the crew.' },
    ] }), cs(), { narrationId: 'nar-1' });
    expect(getFaction(journalId).relationship).toBe('antagonistic');
    expect(landscape()).toEqual(['Iron Syndicate — antagonistic']);
  });

  it('an attitude shift for "The Iron Syndicate" reaches the "Iron Syndicate" record and makes no second page', async () => {
    const { journalId } = addFactionEntity(journalMock.journals, { name: 'Iron Syndicate', relationship: 'apathetic' });
    cs().factionIds.push(journalId);
    await routeWorldJournalResults(wj({ stateTransitions: [
      { entryType: 'faction', name: 'The Iron Syndicate', change: 'attitudeShift', newValue: 'hostile', summary: 'They turned on the crew.' },
    ] }), cs(), { narrationId: 'nar-1' });

    expect(landscape(), 'FACTION LANDSCAPE').toEqual(['Iron Syndicate — antagonistic']);
    expect(factionPages(), 'Factions journal pages').toEqual(['Iron Syndicate']);
    expect(getFaction(journalId).relationship, 'the canonical stance').toBe('antagonistic');
  });

  it.each([
    ['the article', 'The Iron Syndicate'],
    ['the case',    'Iron syndicate'],
  ])('a new faction reported as "Iron Syndicate" in factionUpdates and as an entity differing by %s gets one page', async (_what, entityName) => {
    await routeWorldJournalResults(wj({ factionUpdates: [
      { name: 'Iron Syndicate', attitude: 'hostile', summary: 'They run the docks', isNew: true },
    ] }), cs(), { narrationId: 'nar-1' });
    await routeEntityDrafts([{ type: 'faction', name: entityName, description: 'A smuggling cartel', confidence: 'high' }], cs(),
      { autoCreateConnection: false, source: 'move_resolution', actorId: null });

    expect(landscape(), 'FACTION LANDSCAPE').toHaveLength(1);
    expect(factionPages(), 'Factions journal pages').toEqual(['Iron Syndicate']);
    expect(getFactionEntry(entityName)?.factionName).toBe('Iron Syndicate');
  });

  it('a page and a record named apart (a page from before the record) list one line, the record\'s', async () => {
    await recordFactionIntelligence('The Iron Syndicate', { attitude: 'neutral', summary: 'Old intel' }, cs());
    const { journalId } = addFactionEntity(journalMock.journals, { name: 'Iron Syndicate', relationship: 'apathetic' });
    cs().factionIds.push(journalId);
    expect(factionPages()).toEqual(['The Iron Syndicate']);
    expect(landscape()).toEqual(['Iron Syndicate — apathetic']);
    // … and a later mention under the record's name updates that one page.
    await recordFactionIntelligence('Iron Syndicate', { attitude: 'hostile', summary: 'They turned' }, cs());
    expect(factionPages()).toEqual(['The Iron Syndicate']);
    expect(getFaction(journalId).relationship).toBe('antagonistic');
  });

  it('the key drops a leading article, case and spacing, and nothing else', () => {
    expect(factionNameKey('The Iron Syndicate')).toBe('iron syndicate');
    expect(factionNameKey('  iron   SYNDICATE ')).toBe('iron syndicate');
    expect(factionNameKey('An Order of Ash')).toBe('order of ash');
    expect(factionNameKey('Theocracy of Ash')).toBe('theocracy of ash');
    expect(factionNameKey('The')).toBe('the');
  });

  it('the same faction with its article is matched — a different one sharing words is not', async () => {
    const { journalId } = addFactionEntity(journalMock.journals, { name: 'Iron Syndicate', relationship: 'apathetic' });
    cs().factionIds.push(journalId);
    expect(findFactionByName('The Iron Syndicate Remnant', cs())).toBeNull();
    expect(findFactionByName('the iron syndicate', cs())?.id).toBe(journalId);
  });

  it('control: a faction named with a leading title still matches without it, as before', async () => {
    const { journalId } = addFactionEntity(journalMock.journals, { name: "Captain Vance's Crew", relationship: 'apathetic' });
    cs().factionIds.push(journalId);
    expect(entityExistsForName("Vance's Crew", 'faction', cs())).toBe(true);
  });

  it('control: the other World Journal categories keep their exact titles', async () => {
    await recordLoreDiscovery('The Rusty Lantern', { text: 'A bar on the ring.' }, cs());
    await recordLoreDiscovery('Rusty Lantern', { text: 'A bar on the ring.' }, cs());
    expect((journalMock.journals.get(JOURNAL_NAMES.lore)?.pages.contents ?? []).map(p => p.name).sort())
      .toEqual(['Rusty Lantern', 'The Rusty Lantern']);
  });
});
