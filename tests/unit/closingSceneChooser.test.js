/**
 * STARFORGED COMPANION
 * tests/unit/closingSceneChooser.test.js
 *
 * Issue #381, slice 2 — whom End a Session's closing cutaway shows, and what
 * it is built from. A fixed priority (bonded connection → significant
 * connection → threat → any connection → "the architect of" the sector's
 * trouble → "a familiar adversary you can't quite name") gave the same
 * answer at every End a Session: the long haul's second live run closed on
 * Tamsin three times, its third on an unnamed woman three times. Now:
 *
 *   1. the table's connection focus, when it names a connection in play;
 *   2. else a die among the campaign's people, weighted as the old priority
 *      ranked them (bonded 3, rank dangerous or above 2, a threat 2, else 1);
 *   3. never the one the last closing showed, while there is another;
 *   4. never one the session's last scene had with the characters — with
 *      everyone the campaign has beside them, a place (issue #388 #3);
 *   5. with nobody else, a settlement of the active sector other than where
 *      the characters are; with none, no closing.
 *
 * The records are the stores' own readers, mocked at their source; the dice
 * are scripted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listConnections: vi.fn(() => []),
}));
vi.mock('../../src/entities/settlement.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getSettlement: vi.fn(() => null),
}));
vi.mock('../../src/world/worldJournal.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getActiveThreats: vi.fn(() => []),
}));

import { listConnections } from '../../src/entities/connection.js';
import { getSettlement } from '../../src/entities/settlement.js';
import { getActiveThreats } from '../../src/world/worldJournal.js';
import {
  chooseClosingSubject, composeClosingScene, buildEndSessionVignetteUserMessage,
} from '../../src/session/endSessionVignette.js';

const MODULE_ID = 'starforged-companion';

const TAMSIN = { _id: 'c-tamsin', name: 'Tamsin Vey', bonded: true, rank: 'dangerous', pronouns: 'she/her', role: 'Broker',
  lastKnown: { location: { value: 'her ledger stall at Hollow Spire', sessionNum: 2 } } };
const DORAN  = { _id: 'c-doran', name: 'Doran Iske', bonded: false, rank: 'troublesome', role: 'Pilot' };
const VANCE  = { _id: 'c-vance', name: 'Vance', bonded: true, active: false, rank: 'formidable' };
const CHOIR  = { name: 'The Cinder Choir', summary: 'Raiders who sing on open comms.', severity: 'active' };

const SECTOR = {
  activeSectorId: 'sec-1',
  sectors: [{ id: 'sec-1', name: 'Cinder Expanse', settlements: [
    { id: 'st-spire', name: 'Hollow Spire', trouble: 'Water is rationed', firstLook: ['A rationing board by the docks'] },
    { id: 'st-bleak', name: 'Bleakhold Station', trouble: 'Raiders in the lanes' },
  ] }],
};

/** A draw that hands out `faces` in order and records the dice it was asked for. */
function scripted(faces) {
  const queue = [...faces];
  const asked = [];
  return Object.assign((sides) => { asked.push(sides); if (!queue.length) throw new Error('out of dice'); return queue.shift(); },
    { asked, left: () => queue.length });
}

const closingCard = (builtFrom, extra = {}) => ({ flags: { [MODULE_ID]: {
  sessionVignetteCard: true, vignetteKind: 'npc_end', narratorCard: true, narrationText: 'Far off.', ...builtFrom, ...extra,
} } });
const shown = (ref, name) => closingCard({ builtFrom: [{ slot: 'subject', label: 'Who it shows', from: 'state', source: "the campaign's people", tables: [], result: name, ref }] });

beforeEach(() => {
  vi.clearAllMocks();
  listConnections.mockReturnValue([]);
  getActiveThreats.mockReturnValue([]);
  getSettlement.mockReturnValue(null);
});

describe('whom the closing shows — a die among the campaign\'s people', () => {
  it('weighted as the old priority ranked them: bonded 3, dangerous or above 2, a threat 2, any other 1', () => {
    listConnections.mockReturnValue([TAMSIN, DORAN]);
    getActiveThreats.mockReturnValue([CHOIR]);
    // Faces 1–3 Tamsin, 4 Doran, 5–6 the Choir: a d6.
    const pick = (face) => chooseClosingSubject({}, { messages: [], draw: scripted([face]) });
    expect([1, 3, 4, 5, 6].map(f => pick(f).option.name)).toEqual(['Tamsin Vey', 'Tamsin Vey', 'Doran Iske', 'The Cinder Choir', 'The Cinder Choir']);
    const { seed } = pick(4);
    expect(seed).toMatchObject({
      slot: 'subject', label: 'Who it shows', from: 'state', source: 'the campaign\'s people', result: 'Doran Iske',
      ref: 'connection:c-doran', kind: 'connection', tables: [{ id: null, name: 'the campaign\'s people', roll: 4, die: 6, result: 'Doran Iske' }],
    });
  });

  it('a severed or lost connection is never shown (issue #321 U61)', () => {
    listConnections.mockReturnValue([VANCE, DORAN]);
    const draw = scripted([]);
    expect(chooseClosingSubject({}, { messages: [], draw }).option.name).toBe('Doran Iske');
    // One left is no choice: no die is drawn.
    expect(draw.asked).toEqual([]);
  });

  it('never the one the last closing showed, while there is another — by its stable ref', () => {
    listConnections.mockReturnValue([TAMSIN, DORAN]);
    // Renamed since: the ref still says who it was.
    const last = [shown('connection:c-tamsin', 'Tamsin Okoro')];
    const draw = scripted([]);
    expect(chooseClosingSubject({}, { messages: last, draw }).option.name).toBe('Doran Iske');
    expect(draw.asked).toEqual([]);
  });

  it('…and by the name it featured, on a closing card from before', () => {
    listConnections.mockReturnValue([TAMSIN, DORAN]);
    const old = [closingCard({ vignetteNpc: 'Tamsin Vey' })];
    expect(chooseClosingSubject({}, { messages: old, draw: scripted([]) }).option.name).toBe('Doran Iske');
  });

  it('…and a closing the X-Card removed was not shown', () => {
    listConnections.mockReturnValue([TAMSIN, DORAN]);
    const removed = [shown('connection:c-doran', 'Doran Iske'), { ...shown('connection:c-tamsin', 'Tamsin Vey'), flags: { [MODULE_ID]: { ...shown('connection:c-tamsin', 'Tamsin Vey').flags[MODULE_ID], xCarded: true } } }];
    expect(chooseClosingSubject({}, { messages: removed, draw: scripted([]) }).option.name).toBe('Tamsin Vey');
  });

  it('with only the one the last closing showed, it is shown again rather than nobody', () => {
    listConnections.mockReturnValue([TAMSIN]);
    expect(chooseClosingSubject({}, { messages: [shown('connection:c-tamsin', 'Tamsin Vey')], draw: scripted([]) }).option.name).toBe('Tamsin Vey');
  });

  it('never one the session\'s last scene had with the characters, while there is another', () => {
    listConnections.mockReturnValue([TAMSIN, DORAN]);
    const frame = { location: 'Hollow Spire docks', present: ['Mira', 'Tamsin'], situation: 'Haggling' };
    expect(chooseClosingSubject({}, { frame, messages: [], draw: scripted([]) }).option.name).toBe('Doran Iske');
  });

  it('the table\'s connection focus names whom it shows — no die, whatever the last closing showed', () => {
    listConnections.mockReturnValue([TAMSIN, DORAN]);
    const draw = scripted([]);
    const { option, seed } = chooseClosingSubject({}, { connectionFocus: 'Ask Tamsin about the ledger', messages: [shown('connection:c-tamsin', 'Tamsin Vey')], draw });
    expect(option.name).toBe('Tamsin Vey');
    expect(seed).toMatchObject({ from: 'state', source: 'the table\'s connection focus', tables: [], ref: 'connection:c-tamsin' });
    expect(draw.asked).toEqual([]);
  });

  it('a focus that names nobody in play, or two people, is no choice: the die decides', () => {
    listConnections.mockReturnValue([TAMSIN, { ...DORAN, name: 'Tamsin Ro', _id: 'c-ro' }]);
    expect(chooseClosingSubject({}, { connectionFocus: 'Ask Tamsin', messages: [], draw: scripted([4]) }).seed.tables).toHaveLength(1);
    expect(chooseClosingSubject({}, { connectionFocus: 'Repair the hull', messages: [], draw: scripted([1]) }).seed.source).toBe('the campaign\'s people');
  });
});

describe('with nobody — a place the table knows (D6)', () => {
  it('a die among the active sector\'s settlements, other than where the characters are', () => {
    const frame = { location: 'Space off Bleakhold Station', present: ['Mira'] };
    const draw = scripted([]);
    const { option, seed } = chooseClosingSubject(SECTOR, { frame, messages: [], draw });
    expect(option).toMatchObject({ name: 'Hollow Spire', kind: 'settlement' });
    expect(option.hint).toBe('Trouble: Water is rationed · First look: A rationing board by the docks');
    expect(seed).toMatchObject({ label: 'Where it shows', source: 'the active sector\'s settlements', ref: 'settlement:st-spire' });
    expect(draw.asked).toEqual([]);
    // Neither is where they are: a d2.
    expect(chooseClosingSubject(SECTOR, { frame: { location: 'Deep space' }, messages: [], draw: scripted([2]) }).option.name).toBe('Bleakhold Station');
  });

  it('a settlement\'s record is the canonical store, under its host\'s id; the sector\'s own list stands in when none can be read', () => {
    getSettlement.mockImplementation((id) => (id === 'act-spire' ? { _id: 'rec-1', name: 'Hollow Spire', sectorId: 'sec-1', trouble: 'A quarantine' } : null));
    const state = { ...SECTOR, settlementIds: ['act-spire'] };
    const { option } = chooseClosingSubject(state, { messages: [], draw: scripted([]) });
    expect(option).toMatchObject({ name: 'Hollow Spire', ref: 'settlement:act-spire', hint: 'Trouble: A quarantine' });
    // `!at Hollow Spire` names that host: the characters are there, and there is nowhere else.
    expect(chooseClosingSubject({ ...state, currentLocationId: 'act-spire' }, { messages: [], draw: scripted([]) })).toBeNull();
  });

  it('not the place the last closing showed, while there is another', () => {
    const last = [closingCard({ builtFrom: [{ slot: 'subject', from: 'state', result: 'Hollow Spire', ref: 'settlement:st-spire', tables: [] }] })];
    expect(chooseClosingSubject(SECTOR, { frame: { location: 'Deep space' }, messages: last, draw: scripted([]) }).option.name).toBe('Bleakhold Station');
  });

  it('no sector, or no settlement but the one the characters are at: no closing', () => {
    expect(chooseClosingSubject({}, { messages: [], draw: scripted([]) })).toBeNull();
    const one = { ...SECTOR, sectors: [{ ...SECTOR.sectors[0], settlements: [SECTOR.sectors[0].settlements[1]] }] };
    expect(chooseClosingSubject(one, { frame: { location: 'Docked at Bleakhold Station' }, messages: [], draw: scripted([]) })).toBeNull();
    expect(chooseClosingSubject({ ...one, currentLocationId: 'st-bleak' }, { messages: [], draw: scripted([]) })).toBeNull();
    expect(composeClosingScene({}, { draw: scripted([]) })).toBeNull();
  });
});

describe('what the closing is built from — and its message', () => {
  // Subject d6=1 (Tamsin), then Action/Theme ×2, Descriptor/Focus ×2.
  const FACES = [1, 14, 20, 5, 6, 63, 18, 7, 8];

  it('their LAST KNOWN place, then Action + Theme and Descriptor + Focus — each oracle pair with its second', () => {
    listConnections.mockReturnValue([TAMSIN, DORAN]);
    getActiveThreats.mockReturnValue([CHOIR]);
    const draw = scripted(FACES);
    const { seeds, userMessage, subject } = composeClosingScene({}, { draw });
    expect(subject.name).toBe('Tamsin Vey');
    expect(draw.left()).toBe(0);
    expect(draw.asked).toEqual([6, 100, 100, 100, 100, 100, 100, 100, 100]);
    expect(seeds.map(s => [s.slot, s.result])).toEqual([
      ['subject', 'Tamsin Vey'], ['place', 'her ledger stall at Hollow Spire'], ['busy', 'Bolster Debt'], ['thing', 'Makeshift Container'],
    ]);
    expect(seeds[1]).toMatchObject({ from: 'state', source: 'LAST KNOWN on their card', tables: [] });
    expect(userMessage).toContain('1. Who it shows — the campaign\'s people (d6: 1): Tamsin Vey');
    expect(userMessage).toContain('2. Where Tamsin Vey is — LAST KNOWN on their card: her ledger stall at Hollow Spire');
    expect(userMessage).toContain('3. What Tamsin Vey is busy with — Action + Theme (14, 20): Bolster Debt');
    expect(userMessage).toContain('4. The thing in hand, or close by — Descriptor + Focus (63, 18): Makeshift Container');
  });

  it('with no LAST KNOWN place — or one the characters were just in — a settlement zone and its area are rolled', () => {
    listConnections.mockReturnValue([DORAN]);
    // Zone 40 Living, area 12 "Galley or kitchen"; its second: zone 70 Operations, area 30.
    const draw = scripted([40, 12, 70, 30, 14, 20, 5, 6, 63, 18, 7, 8]);
    const { seeds, userMessage } = composeClosingScene({}, { draw });
    expect(seeds[1]).toMatchObject({ slot: 'place', label: 'Where Doran Iske is', from: 'oracle', result: 'Galley or kitchen (Living)' });
    expect(seeds[1].tables.map(t => t.id)).toEqual(['derelict_zone_settlement', 'derelict_area_living']);
    expect(userMessage).toContain('2. Where Doran Iske is — Settlement zone + area (40, 12): Galley or kitchen (Living)');
    expect(draw.left()).toBe(0);
  });

  it('a place cutaway: where in it, what someone there is busy with, one thing there', () => {
    const draw = scripted([2, 40, 12, 70, 30, 14, 20, 5, 6, 63, 18, 7, 8]);
    const { seeds, userMessage } = composeClosingScene(SECTOR, { frame: { location: 'Deep space' }, draw });
    expect(seeds.map(s => s.label)).toEqual(['Where it shows', 'Where in Bleakhold Station', 'What someone there is busy with', 'One thing there']);
    expect(userMessage).toMatch(/^Subject \(settlement\): Bleakhold Station\. Context: Trouble: Raiders in the lanes$/m);
    expect(userMessage).toMatch(/A cutaway to Bleakhold Station, away from the characters: the place going on without them/);
  });

  it('the message names whom it shows as the counts read it, and where the characters are', () => {
    listConnections.mockReturnValue([TAMSIN]);
    const frame = { location: 'Space off Bleakhold Station', present: ['Mira'] };
    const { userMessage } = composeClosingScene({}, { frame, draw: scripted([14, 20, 5, 6, 63, 18, 7, 8]) });
    expect(userMessage.split('\n')[0]).toBe('CLOSING VIGNETTE — end-session cutaway.');
    expect(userMessage).toMatch(/^Subject \(bonded_connection\): Tamsin Vey\. Context: Pronouns: she\/her · Role: Broker$/m);
    expect(userMessage).toContain('Where the characters are as the session ends: Space off Bleakhold Station.');
    expect(userMessage).not.toMatch(/Ship's sector when the session ended/);
  });

  it('the closing\'s fixed stock is gone: no list of tasks, no list of gestures, no sandwich, no architect', () => {
    listConnections.mockReturnValue([TAMSIN]);
    const { userMessage } = composeClosingScene({}, { draw: scripted([14, 20, 5, 6, 63, 18, 7, 8]) });
    const old = buildEndSessionVignetteUserMessage({ kind: 'connection', name: 'Vuldar Archer', hint: '' }, {}, { earlier: [] });
    for (const msg of [userMessage, old]) {
      expect(msg).not.toMatch(/eating, tidying|watering a plant|reading the same page|queueing for fuel/);
      expect(msg).not.toMatch(/a shrug, a half-smile|switching a light\s+off|looking out a window/);
      expect(msg).not.toMatch(/cosmic threat|ordinary person finishing an ordinary minute/);
      expect(msg).not.toMatch(/architect of|familiar adversary/);
      // How it ends is its material's (known-issues SET-PIECES-SHAPED-BY-THEIR-PROMPT).
      expect(msg).not.toMatch(/put down/);
      expect(msg).toMatch(/How it ends is the material's: its last sentence stays with whichever result the scene reaches last/);
    }
  });
});

describe('the one person the campaign has, with the characters at the end — a place, never her (issue #388 #3)', () => {
  // The fifth live long haul's a94: its last frame had Tamsin beside Mira at
  // Bleakhold's dispatch terminal, and the closing walked her through Hollow
  // Spire's market, its prompt saying "Tamsin Okoro is not with them".
  const AT_BLEAKHOLD = { location: 'Bleakhold Station dispatch terminal', present: ['Mira Kestrel', 'Tamsin Vey'] };

  it('shows a settlement elsewhere — Hollow Spire, not Bleakhold — with no die', () => {
    listConnections.mockReturnValue([TAMSIN]);
    const draw = scripted([]);
    const { option, seed } = chooseClosingSubject(SECTOR, { frame: AT_BLEAKHOLD, messages: [], draw });
    expect(option).toMatchObject({ name: 'Hollow Spire', kind: 'settlement' });
    expect(seed).toMatchObject({ label: 'Where it shows' });
    expect(draw.asked).toEqual([]);
  });

  it('a connection focus naming her, while she was with them, is no choice either', () => {
    listConnections.mockReturnValue([TAMSIN]);
    const { option } = chooseClosingSubject(SECTOR, { connectionFocus: 'Ask Tamsin about the ledger', frame: AT_BLEAKHOLD, messages: [], draw: scripted([]) });
    expect(option).toMatchObject({ name: 'Hollow Spire', kind: 'settlement' });
  });

  it('control: with her elsewhere at the end she is shown, focus or none', () => {
    listConnections.mockReturnValue([TAMSIN]);
    const alone = { location: 'Bleakhold Station docking ring', present: ['Mira Kestrel'] };
    expect(chooseClosingSubject(SECTOR, { frame: alone, messages: [], draw: scripted([]) }).option.name).toBe('Tamsin Vey');
    expect(chooseClosingSubject(SECTOR, { connectionFocus: 'Ask Tamsin', frame: alone, messages: [], draw: scripted([]) }).seed.source).toBe('the table\'s connection focus');
  });

  it('the prompt then names a place and no person "not with them"', () => {
    listConnections.mockReturnValue([TAMSIN]);
    const scene = composeClosingScene({ ...SECTOR, currentLocationId: null }, { frame: AT_BLEAKHOLD, draw: () => 1 });
    expect(scene.userMessage).toMatch(/^Subject \(settlement\): Hollow Spire\./m);
    expect(scene.userMessage).not.toContain('Tamsin Vey is not with them');
  });
});
