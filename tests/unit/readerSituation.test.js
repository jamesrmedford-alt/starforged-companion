/**
 * STARFORGED COMPANION
 * tests/unit/readerSituation.test.js
 *
 * The whole situation a line is read against (src/moves/readerSituation.js
 * readLineSituation, buildReaderSituationBlock) — what the line reader is
 * told that today's two readers are not both told: the open fights with the
 * speaker's own position in each, the scene challenges and expeditions, the
 * place (the current location, the ship's position line, the scene frame, a
 * site, the X-Card), the charted places, the party and their vows, the
 * vehicles and companions. Each part from its real producer
 * (rules/reachability.md §3): a fight's position written by
 * setCombatTrackPosition, its track by addProgressTrack, the place as `!at`
 * writes it, a vow and a bond as the sheet holds them.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readLineSituation, buildReaderSituationBlock } from '../../src/moves/readerSituation.js';
import { buildSituationBlock } from '../../src/moves/situation.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const VOW = 'Find who is raiding the Cinder Expanse lanes';

const progressItem = (subtype, id, name, { rank = 2, ticks = 0, completed = false, flags = {} } = {}) => ({
  id, name, type: 'progress', flags: { [MODULE_ID]: flags }, system: { subtype, rank, current: ticks, completed },
});

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const store = { [`${MODULE_ID}.tracks`]: [] };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

function installPc(id, name, { system = {}, items = [] } = {}) {
  const pc = makeTestActor({ id, name, type: 'character', system: { health: { value: 5 }, spirit: { value: 5 }, supply: { value: 5 }, ...system }, items: { contents: items } });
  game.actors._set(pc.id, pc);
  invalidateActorCache(pc.id);
  return pc;
}
const installPlace = (id, type, data) => {
  const actor = makeTestActor({ id, name: data.name, type: 'location', flags: { [MODULE_ID]: { entityType: type, [type]: data } } });
  game.actors._set(id, actor);
  return actor;
};

let store;
let journal;
let savedJournal;
beforeAll(async () => {
  store = await import('../../src/ui/progressTracks.js');
});
beforeEach(() => {
  game.actors._reset();
  journal = makeTracksJournal();
  savedJournal = game.journal;
  game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null), get: () => null };
});
afterEach(() => { game.journal = savedJournal; });

describe('the speaker\'s sheet: the words both readers are told it in today', () => {
  it('the sheet\'s lines are situation.js\'s own', () => {
    const pc = installPc('pc-mira', 'Mira Kestrel', {
      system: { health: { value: 3 }, debility: { wounded: true } },
      items: [progressItem('vow', 'v1', VOW, { ticks: 8 }), progressItem('bond', 'b1', 'Tamsin Okoro', { ticks: 16 })],
    });
    const block = buildReaderSituationBlock(readLineSituation(pc, { campaignState: {} }));
    expect(block.startsWith(buildSituationBlock(pc, { campaignState: {} }))).toBe(true);
    expect(block).toContain('- Support vehicles: none. Companions: none.');
  });

  it('no player character behind the line: no sheet — and the world\'s parts all the same', async () => {
    const fight = await store.addProgressTrack({ label: 'Ashen Wake', type: 'combat', rank: 'dangerous' });
    const s = readLineSituation(null, { campaignState: {} });
    expect(s).toMatchObject({ speaker: null, sheet: null, fights: [{ id: fight.id, label: 'Ashen Wake' }] });
    expect(buildReaderSituationBlock(s)).toContain('SITUATION — no character sheet is known for the speaker: meters, vows and connections are unknown.\n- Other characters\' open vows: none.\n- Open fights: "Ashen Wake" (dangerous, 0 of 10 boxes).');
  });
});

describe('the open tracks, from the real store', () => {
  it('a fight, with the speaker\'s own position in it (setCombatTrackPosition)', async () => {
    const pc = installPc('pc-mira', 'Mira Kestrel');
    installPc('pc-karthik', 'Karthik Rao');
    const fight = await store.addProgressTrack({ label: 'Ashen Wake', type: 'combat', rank: 'formidable' });
    await store.setCombatTrackPosition(fight.id, 'in_control', 'pc-karthik');
    await store.setCombatTrackPosition(fight.id, 'bad_spot', 'pc-mira');
    const s = readLineSituation(pc, { campaignState: {} });
    expect(s.fights).toEqual([{ id: fight.id, label: 'Ashen Wake', rank: 'formidable', ticks: 0, position: 'bad_spot' }]);
    expect(s.position).toBe('bad_spot');
    expect(buildReaderSituationBlock(s)).toContain('- Open fights: "Ashen Wake" (formidable, 0 of 10 boxes, Mira Kestrel is in a bad spot).');
    // Karthik's own, read for Karthik — and the fight's last-set one for a character who has none.
    expect(readLineSituation(game.actors.get('pc-karthik'), { campaignState: {} }).position).toBe('in_control');
  });

  it('two fights where her positions differ: no one position (getActiveCombatPosition\'s rule)', async () => {
    const pc = installPc('pc-mira', 'Mira Kestrel');
    const a = await store.addProgressTrack({ label: 'Ashen Wake', type: 'combat', rank: 'dangerous' });
    const b = await store.addProgressTrack({ label: 'Boarders', type: 'combat', rank: 'dangerous' });
    await store.setCombatTrackPosition(a.id, 'bad_spot', 'pc-mira');
    await store.setCombatTrackPosition(b.id, 'in_control', 'pc-mira');
    const s = readLineSituation(pc, { campaignState: {} });
    expect(s.fights.map(f => f.position)).toEqual(['bad_spot', 'in_control']);
    expect(s.position).toBeNull();
    expect(await store.getActiveCombatPosition('pc-mira')).toBe(s.position);
  });

  it('a scene challenge and an expedition; a finished track is gone', async () => {
    const pc = installPc('pc-mira', 'Mira Kestrel');
    // A countdown's clock is given: the challenge's own clock is not this test's.
    const challenge = await store.addProgressTrack({ label: 'The Long Haggle', type: 'scene_challenge', rank: 'dangerous', tensionClockId: 'clock-1' });
    const expedition = await store.addProgressTrack({ label: 'The Ashfall Drift', type: 'expedition', rank: 'dangerous' });
    const done = await store.addProgressTrack({ label: 'The Old Run', type: 'expedition', rank: 'troublesome' });
    await store.markProgressById(expedition.id, 1);
    await store.completeProgressTrack(done.id);
    const s = readLineSituation(pc, { campaignState: {} });
    expect(s.challenges).toEqual([{ id: challenge.id, label: 'The Long Haggle', rank: 'dangerous', ticks: 0, type: 'scene_challenge', completed: false }]);
    expect(s.expeditions).toEqual([{ id: expedition.id, label: 'The Ashfall Drift', rank: 'dangerous', ticks: 8 }]);
    const block = buildReaderSituationBlock(s);
    expect(block).toContain('- Scene challenges: "The Long Haggle" (dangerous, 0 of 10 boxes).');
    expect(block).toContain('- Expeditions: "The Ashfall Drift" (dangerous, 2 of 10 boxes).');
    expect(block).toContain('- Open fights: none.');
  });
});

describe('the place', () => {
  it('the current location as `!at` writes it, the ship\'s position line, the scene frame and the charted places', () => {
    const pc = installPc('pc-mira', 'Mira Kestrel');
    installPlace('set-bleak', 'settlement', { name: 'Bleakhold Station', sectorId: 'sec-1' });
    installPlace('set-spire', 'settlement', { name: 'Hollow Spire', sectorId: 'sec-0' });
    installPlace('loc-vault', 'location', { name: 'Unexplored Site', status: 'unexplored', sectorId: 'sec-1' });
    installPlace('pl-ash', 'planet', { name: 'Ash', sectorId: 'sec-1' });
    const ship = makeTestActor({
      id: 'ship-1', name: 'Kobayashi IV', type: 'starship',
      flags: { [MODULE_ID]: { entityType: 'ship', ship: { name: 'Kobayashi IV', isCommandVehicle: true, integrity: 5, integrityMax: 5,
        position: { nearestSettlementId: 'set-bleak', updatedBy: 'at_command' } } } },
    });
    game.actors._set(ship.id, ship);
    const campaignState = {
      currentLocationId: 'set-bleak', currentLocationType: 'settlement', activeSectorId: 'sec-1',
      settlementIds: ['set-spire', 'set-bleak'], planetIds: ['pl-ash'], locationIds: ['loc-vault'], shipIds: ['ship-1'],
      sceneFrame: { location: 'The galley', present: ['Mira Kestrel'], situation: 'the hatch is sealed' },
    };
    const s = readLineSituation(pc, { campaignState });
    expect(s.place).toEqual({ name: 'Bleakhold Station', type: 'settlement' });
    expect(s.ship).toBe('Kobayashi IV docked at Bleakhold Station');
    // The active sector's first; an unexplored site is not charted.
    expect(s.charted).toEqual({ shown: ['Bleakhold Station', 'Ash', 'Hollow Spire'], more: 0 });
    const block = buildReaderSituationBlock(s);
    expect(block).toContain('- Place: Bleakhold Station (settlement). Ship: Kobayashi IV docked at Bleakhold Station.');
    expect(block).toContain('- Scene — where: The galley; present: Mira Kestrel; now: the hatch is sealed.');
    expect(block).toContain('- Charted places: Bleakhold Station, Ash, Hollow Spire.');
  });

  it('inside a site, the X-Card, and a long chart', () => {
    const pc = installPc('pc-mira', 'Mira Kestrel');
    installPlace('loc-saint', 'location', { name: 'The Hollow Saint', type: 'derelict', status: 'explored' });
    const ids = [];
    for (let i = 0; i < 14; i += 1) { installPlace(`set-${i}`, 'settlement', { name: `Haven ${i}` }); ids.push(`set-${i}`); }
    const s = readLineSituation(pc, { campaignState: { currentLocationId: 'loc-saint', currentLocationType: 'location', xCardActive: true, settlementIds: ids } });
    expect(s.site).toEqual({ kind: 'derelict', name: 'The Hollow Saint', status: 'explored' });
    const block = buildReaderSituationBlock(s);
    expect(block).toContain('- Place: The Hollow Saint (location). Inside the derelict "The Hollow Saint".');
    expect(block).toContain(', Haven 11, +2 more.');
    expect(block.endsWith('- The X-Card is active: the scene is paused.')).toBe(true);
  });

  it('nothing recorded is said so', () => {
    const block = buildReaderSituationBlock(readLineSituation(installPc('pc-mira', 'Mira Kestrel'), { campaignState: {} }));
    expect(block).toContain('- Place: none recorded.');
    expect(block).toContain('- Charted places: none recorded.');
    expect(block).not.toContain('Scene —');
  });
});

describe('the party, the vehicles and the companions', () => {
  it('the other player characters with their health, and their open vows — not a shared copy she holds too', () => {
    const shared = { vowId: 'vid-shared' };
    const pc = installPc('pc-mira', 'Mira Kestrel', { items: [progressItem('vow', 'v1', 'The shared oath', { flags: shared })] });
    installPc('pc-karthik', 'Karthik Rao', {
      system: { health: { value: 2 }, debility: { wounded: true } },
      items: [progressItem('vow', 'v2', 'The shared oath', { flags: shared }), progressItem('vow', 'v3', 'Bring Joss home')],
    });
    const npc = makeTestActor({ id: 'npc-1', name: 'Tamsin Okoro', type: 'character', flags: { [MODULE_ID]: { entityType: 'connection' } } });
    game.actors._set(npc.id, npc);
    const s = readLineSituation(pc, { campaignState: {} });
    expect(s.party).toEqual([{ actorId: 'pc-karthik', name: 'Karthik Rao', health: 2, wounded: true }]);
    expect(s.othersVows).toEqual([{ name: 'Bring Joss home', owner: 'Karthik Rao' }]);
    expect(buildReaderSituationBlock(s)).toContain('- Other characters\' open vows: "Bring Joss home" (Karthik Rao).');
  });

  it('a part that cannot be read is told as unknown — and the rest is read', () => {
    const pc = installPc('pc-mira', 'Mira Kestrel');
    const savedFilter = game.actors.filter;
    game.actors.filter = () => { throw new Error('the actors are not ready'); };
    try {
      const s = readLineSituation(pc, { campaignState: {} });
      expect(s.unread).toContain('the party');
      expect(buildReaderSituationBlock(s)).toContain('- Other characters\' open vows: unknown.');
      expect(s.sheet).toBeTruthy();
    } finally {
      game.actors.filter = savedFilter;
    }
    expect(getCapturedWarns().some(w => /line situation: the party could not be read/.test(w))).toBe(true);
  });
});
