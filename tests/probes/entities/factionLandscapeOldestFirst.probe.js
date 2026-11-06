/**
 * Eleventh audit — entities. FACTION-LANDSCAPE-OLDEST-FIRST.
 *
 * The narrator's [4e] FACTION LANDSCAPE is
 * `mergeFactionLandscape(listFactions(cs), getFactionLandscape(cs))`
 * (narrator.js buildNarratorExtras), capped at 4: faction RECORDS first, in
 * `factionIds` order — creation order, oldest first, never sorted — then the
 * World Journal's factions. faction-flow.md says the block "carries every
 * faction's stance line on every call" (§2), that the detection Haiku
 * "classifies against the same map the narrator writes with" (§2), and that
 * "the landscape block naturally rotates to recently updated factions" (§4).
 *
 * Once a campaign has confirmed four factions, [4e] is those four for good:
 * the fifth faction the GM confirms — however recently its stance changed —
 * and every faction the narration names afterwards (WJ-only, auto-surfaced)
 * never reach the block, while the detection pass's own view
 * (describeWorldJournalState → getFactionLandscape: the three most recently
 * updated WJ factions) is exactly those. Two maps again (the
 * FACTION-DETECTOR-ONLY-CONTEXT split), the newest politics on the wrong side.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { buildNarratorExtras } from '../../../src/narration/narrator.js';
import { getFactionLandscape } from '../../../src/world/worldJournal.js';

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

beforeEach(() => {
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  // Four factions confirmed in the first sessions; the Ember Wardens confirmed
  // last, their stance turned hostile in this session; the Lattice just named.
  const records = [
    factionJournal('f1', { name: 'Iron Syndicate',  relationship: 'does_business', type: 'Guild',        updatedAt: day(1) }),
    factionJournal('f2', { name: 'Keepers of Hollow', relationship: 'apathetic',   type: 'Dominion',     updatedAt: day(1) }),
    factionJournal('f3', { name: 'Ninefold Choir',  relationship: 'apathetic',     type: 'Fringe Group', updatedAt: day(2) }),
    factionJournal('f4', { name: 'Tether Guild',    relationship: 'open_alliance', type: 'Guild',        updatedAt: day(2) }),
    factionJournal('f5', { name: 'Ember Wardens',   relationship: 'antagonistic',  type: 'Dominion',     updatedAt: day(6) }),
  ];
  const wj = factionsWorldJournal([
    { factionName: 'Iron Syndicate',    attitude: 'neutral', updatedAt: day(1) },
    { factionName: 'Keepers of Hollow', attitude: 'neutral', updatedAt: day(1) },
    { factionName: 'Ninefold Choir',    attitude: 'neutral', updatedAt: hour(2, 9) },
    { factionName: 'Tether Guild',      attitude: 'allied',  updatedAt: hour(2, 15) },
    { factionName: 'Ember Wardens',     attitude: 'hostile', updatedAt: day(6) },
    { factionName: 'The Lattice',       attitude: 'hostile', updatedAt: day(7), knownGoal: 'seize the relay' },
  ]);
  const journals = [...records, wj];
  global.game.journal = {
    get: (id) => journals.find(j => j.id === id) ?? null,
    getName: (name) => journals.find(j => j.name === name) ?? null,
    find: (fn) => journals.find(fn) ?? null,
    contents: journals,
    [Symbol.iterator]: function* () { yield* journals; },
  };
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    currentSessionId: 's6', sessionNumber: 6,
    factionIds: ['f1', 'f2', 'f3', 'f4', 'f5'],
    connectionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
});

describe('[4e] FACTION LANDSCAPE with five confirmed factions', () => {
  it('carries the factions whose stance changed most recently — the Ember Wardens and the newly named Lattice', async () => {
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    // Control: the detection pass's view of the same world (describeWorldJournalState).
    expect(getFactionLandscape(cs).map(e => e.factionName)).toEqual(['The Lattice', 'Ember Wardens', 'Tether Guild']);

    const extras = await buildNarratorExtras('paced_narrative', cs, { playerNarration: 'We dock at the relay station.' });
    const names = (extras.factionLandscape ?? []).map(e => e.name);
    expect(names).toHaveLength(4);   // control: the block is built, at its cap
    expect.soft(names, 'the newest record, hostile since this session').toContain('Ember Wardens');
    expect(names, 'the faction the narration just named').toContain('The Lattice');
  });
});
