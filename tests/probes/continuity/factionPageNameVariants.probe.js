/**
 * PROBE — CONT-05 FACTION-PAGE-IDENTITY-BY-EXACT-NAME
 *
 * What the user does: the table's faction record is "Iron Syndicate" (made
 * from the Entities panel or a confirmed draft — stance apathetic). A
 * narration has the Syndicate turn on the crew; the detection reply names the
 * faction the way the prompt itself tells it to ("the Compact", "the Devoted"
 * — with the article): a `stateTransitions` attitudeShift for "The Iron
 * Syndicate". Or a new faction is reported twice in one reply, as
 * `factionUpdates` "Iron Syndicate" and as an entity "The Iron Syndicate" /
 * "Iron syndicate".
 *
 * What happens: World Journal — Factions pages are matched by exact page
 * name (worldJournal.js findPageByName: `p.name === pageName`, although
 * getFactionEntry's own doc says "case-insensitive"), the record by
 * lowercased trimmed name (faction.js findFactionByName) and the entity gate
 * by normalizeEntityName, which strips titles but not articles — so "The Iron
 * Syndicate" matches neither the page nor the record. The attitude shift
 * creates a second Factions page and never reaches the record (the canonical
 * stance, decisions.md "Faction stance: the entity record is canonical"), and
 * FACTION LANDSCAPE lists both: "Iron Syndicate — stance: apathetic" beside
 * "The Iron Syndicate — stance: hostile", one faction with two stances in one
 * prompt. A new faction named with and without the article gets two pages
 * (issue #331 X33's fix skips only an exact-title page).
 *
 * What should happen: one faction, one page, one stance — identity resolves
 * through the same bounded ladder the ledger uses for narrator subjects
 * (relevanceResolver.resolveEntityName strips a leading article;
 * rules/reachability.md §6: a name match must never mint a duplicate or
 * silently hit the wrong target).
 *
 * Control: the exact name reaches the record and the page.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/continuity/factionPageNameVariants.probe.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installJournalMock, addFactionEntity } from '../../helpers/fullStateFixture.js';
import { routeWorldJournalResults, routeEntityDrafts } from '../../../src/entities/entityExtractor.js';
import { getFactionLandscape, JOURNAL_NAMES } from '../../../src/world/worldJournal.js';
import { getFaction, listFactions, mergeFactionLandscape } from '../../../src/entities/faction.js';

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

describe('CONT-05 — one faction is one page and one stance, whatever article or case the detection used', () => {
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

    expect.soft(landscape(), 'FACTION LANDSCAPE').toEqual(['Iron Syndicate — antagonistic']);
    expect.soft(factionPages(), 'Factions journal pages').not.toContain('The Iron Syndicate');
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

    expect.soft(landscape(), 'FACTION LANDSCAPE').toHaveLength(1);
    expect(factionPages(), 'Factions journal pages').toEqual(['Iron Syndicate']);
  });
});
