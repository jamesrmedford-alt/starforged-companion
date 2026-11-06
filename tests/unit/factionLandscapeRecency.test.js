/**
 * STARFORGED COMPANION
 * tests/unit/factionLandscapeRecency.test.js
 *
 * Issue #342 Z13 (FACTION-LANDSCAPE-OLDEST-FIRST). The narrator's [4e]
 * FACTION LANDSCAPE is `mergeFactionLandscape(listFactions(cs), WJ factions)`
 * (narrator.js buildNarratorExtras), capped at 4. It listed the faction
 * RECORDS first, in `factionIds` order — creation order, oldest first — then
 * the World Journal's three most recent. Once a campaign had confirmed four
 * factions, [4e] was those four for good: a fifth faction the GM confirmed,
 * however recently its stance turned, and every faction a narration named
 * afterwards (World Journal only, auto-surfaced) never reached the block —
 * while the detection pass's own view (describeWorldJournalState →
 * getFactionLandscape: the three most recently updated) was exactly those.
 *
 * The merge now ranks records and World Journal factions together by recency
 * (a faction's time is the later of its record's and its World Journal
 * entry's `updatedAt`), records still winning a shared name, and the narrator
 * hands it every World Journal faction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { buildNarratorExtras } from '../../src/narration/narrator.js';
import { getFactionLandscape } from '../../src/world/worldJournal.js';
import { mergeFactionLandscape } from '../../src/entities/faction.js';

const MODULE_ID = 'starforged-companion';

/** A faction record's journal (the shape getFaction reads). */
function factionJournal(id, record) {
  const page = { flags: { [MODULE_ID]: { faction: { _id: `rec-${id}`, ...record } } } };
  return { id, name: record.name, flags: { [MODULE_ID]: { entityType: 'faction', entityId: `rec-${id}` } }, pages: { contents: [page] } };
}

/** The World Journal — Factions journal (getFactionLandscape reads its pages' factionEntry flags). */
function factionsWorldJournal(entries) {
  return {
    id: 'wj-factions', name: 'World Journal — Factions',
    pages: { contents: entries.map((e, i) => ({ id: `wjp-${i}`, name: e.factionName, flags: { [MODULE_ID]: { factionEntry: e } } })) },
  };
}

const day = (n) => `2026-11-0${n}T12:00:00.000Z`;
const hour = (d, h) => `2026-11-0${d}T${String(h).padStart(2, '0')}:00:00.000Z`;

function installWorld({ records, wjEntries, factionIds }) {
  const journals = [...records, factionsWorldJournal(wjEntries)];
  global.game.journal = {
    get: (id) => journals.find(j => j.id === id) ?? null,
    getName: (name) => journals.find(j => j.name === name) ?? null,
    find: (fn) => journals.find(fn) ?? null,
    contents: journals,
    [Symbol.iterator]: function* () { yield* journals; },
  };
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    currentSessionId: 's6', sessionNumber: 6,
    factionIds,
    connectionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
}

beforeEach(() => {
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  // Four factions confirmed in the first sessions; the Ember Wardens confirmed
  // last, their stance turned hostile in this session; the Lattice just named.
  installWorld({
    records: [
      factionJournal('f1', { name: 'Iron Syndicate',    relationship: 'does_business', type: 'Guild',        updatedAt: day(1) }),
      factionJournal('f2', { name: 'Keepers of Hollow', relationship: 'apathetic',     type: 'Dominion',     updatedAt: day(1) }),
      factionJournal('f3', { name: 'Ninefold Choir',    relationship: 'apathetic',     type: 'Fringe Group', updatedAt: day(2) }),
      factionJournal('f4', { name: 'Tether Guild',      relationship: 'open_alliance', type: 'Guild',        updatedAt: day(2) }),
      factionJournal('f5', { name: 'Ember Wardens',     relationship: 'antagonistic',  type: 'Dominion',     updatedAt: day(6) }),
    ],
    wjEntries: [
      { factionName: 'Iron Syndicate',    attitude: 'neutral', updatedAt: day(1) },
      { factionName: 'Keepers of Hollow', attitude: 'neutral', updatedAt: day(1) },
      { factionName: 'Ninefold Choir',    attitude: 'neutral', updatedAt: hour(2, 9) },
      { factionName: 'Tether Guild',      attitude: 'allied',  updatedAt: hour(2, 15) },
      { factionName: 'Ember Wardens',     attitude: 'hostile', updatedAt: day(6) },
      { factionName: 'The Lattice',       attitude: 'hostile', updatedAt: day(7), knownGoal: 'seize the relay' },
    ],
    factionIds: ['f1', 'f2', 'f3', 'f4', 'f5'],
  });
});

describe('issue #342 Z13 — [4e] FACTION LANDSCAPE with five confirmed factions', () => {
  it('carries the factions whose stance changed most recently — the Ember Wardens and the newly named Lattice', async () => {
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    // Control: the detection pass's view of the same world (describeWorldJournalState).
    expect(getFactionLandscape(cs).map(e => e.factionName)).toEqual(['The Lattice', 'Ember Wardens', 'Tether Guild']);

    const extras = await buildNarratorExtras('paced_narrative', cs, { playerNarration: 'We dock at the relay station.' });
    const names = (extras.factionLandscape ?? []).map(e => e.name);
    expect(names).toHaveLength(4);   // control: the block is built, at its cap
    expect.soft(names, 'the newest record, hostile since this session').toContain('Ember Wardens');
    expect(names, 'the faction the narration just named').toContain('The Lattice');
    // The most recent first; the detection pass's three are all in the narrator's block.
    expect(names).toEqual(['The Lattice', 'Ember Wardens', 'Tether Guild', 'Ninefold Choir']);
    // The record's line wins its name: the canonical stance, not the World Journal's attitude.
    expect(extras.factionLandscape.find(e => e.name === 'Ember Wardens').stance).toBe('antagonistic');
    expect(extras.factionLandscape.find(e => e.name === 'The Lattice').detail).toBe('goal: seize the relay');
  });

  it("records lifted by their World Journal entries' times, and a World Journal faction fourth there still beats an older record", async () => {
    // Four old records; a narration just recorded intelligence on three of them (their
    // World Journal entries, no stance change), then named the Red Wake. The Red Wake is
    // fourth on the World Journal — past the detection pass's three — and newer than the
    // Keepers' record, so it takes the block's last place.
    installWorld({
      records: [
        factionJournal('f1', { name: 'Iron Syndicate',    relationship: 'does_business', updatedAt: day(1) }),
        factionJournal('f2', { name: 'Keepers of Hollow', relationship: 'apathetic',     updatedAt: day(1) }),
        factionJournal('f3', { name: 'Ninefold Choir',    relationship: 'apathetic',     updatedAt: day(1) }),
        factionJournal('f4', { name: 'Tether Guild',      relationship: 'open_alliance', updatedAt: day(1) }),
      ],
      wjEntries: [
        { factionName: 'Iron Syndicate',    attitude: 'neutral', updatedAt: hour(7, 18) },
        { factionName: 'Keepers of Hollow', attitude: 'neutral', updatedAt: day(1) },
        { factionName: 'Ninefold Choir',    attitude: 'neutral', updatedAt: hour(7, 17) },
        { factionName: 'Tether Guild',      attitude: 'allied',  updatedAt: hour(7, 16) },
        { factionName: 'Red Wake',          attitude: 'hostile', updatedAt: hour(7, 15) },
      ],
      factionIds: ['f1', 'f2', 'f3', 'f4'],
    });
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    // Control: the detection pass's three.
    expect(getFactionLandscape(cs).map(e => e.factionName)).toEqual(['Iron Syndicate', 'Ninefold Choir', 'Tether Guild']);
    const extras = await buildNarratorExtras('paced_narrative', cs, { playerNarration: 'We hail the Wake.' });
    expect(extras.factionLandscape.map(e => e.name)).toEqual(['Iron Syndicate', 'Ninefold Choir', 'Tether Guild', 'Red Wake']);
    expect(extras.factionLandscape[0].stance).toBe('does business');   // the record's line
  });
});

describe('mergeFactionLandscape — recency across records and World Journal factions', () => {
  it('ranks by the later of a record\'s and its World Journal entry\'s time; equal times keep records first', () => {
    const records = [
      { name: 'Old Guard',  relationship: 'warring',   updatedAt: day(1) },
      { name: 'New Blood',  relationship: 'apathetic', updatedAt: day(5) },
    ];
    const wj = [
      { factionName: 'The Old Guard', attitude: 'hostile', updatedAt: day(6) },   // the record's key — lifts it past New Blood
      { factionName: 'Drifters',      attitude: 'neutral', updatedAt: day(7) },   // World Journal only, and the newest
    ];
    expect(mergeFactionLandscape(records, wj).map(e => `${e.name} — ${e.stance}`))
      .toEqual(['Drifters — neutral', 'Old Guard — warring', 'New Blood — apathetic']);
    expect(mergeFactionLandscape(records, wj, 2).map(e => e.name)).toEqual(['Drifters', 'Old Guard']);
    // No times at all: records first, then the World Journal's, as given.
    expect(mergeFactionLandscape([{ name: 'A' }, { name: 'B' }], [{ factionName: 'C' }]).map(e => e.name))
      .toEqual(['A', 'B', 'C']);
  });
});
