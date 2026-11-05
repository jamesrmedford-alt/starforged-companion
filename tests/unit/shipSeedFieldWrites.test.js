/**
 * STARFORGED COMPANION
 * tests/unit/shipSeedFieldWrites.test.js
 *
 * Issue #331 X32 (SHIP-SEED-STALE-RECORD-WRITE). With Auto-Seed Starship on
 * (a sidebar starship) or on a ship's ✦ Finalise / ↻ Regenerate flavour,
 * seedStarshipActor read the ship record before it awaited the module install
 * and the Notes' narrator call, then wrote `flags.ship` WHOLE from that
 * snapshot: a `!at` / Set a Course position, a `!repair` or Withstand Damage
 * integrity change, the STARSHIP asset's command-vehicle sync, a tier detail
 * or a rename that landed during the call was reverted. Issue #326 W69 fixed
 * exactly this for the connection seed (tests/unit/autoSeedFieldWrites.test.js);
 * the ship seed now writes its fields by path too.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const control = vi.hoisted(() => ({ pending: [] }));

vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(() => new Promise(resolve => { control.pending.push(resolve); })),
}));
vi.mock('../../src/oracles/roller.js', async (importOriginal) => ({
  ...(await importOriginal()),
  rollOracle: vi.fn((id) => ({
    tableId: id,
    result: ({
      starship_type:             'Hauler — Heavy transport',
      starship_first_look:       'Heavy armor',
      starship_mission_terminus: 'Transport cargo',
    })[id] ?? '—',
  })),
}));
vi.mock('../../src/system/ironswornPacks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCanonicalAsset: vi.fn(async () => null),   // no compendium in the harness — nothing installed
}));

import { seedStarshipActor, updateShip, getShip, syncCommandVehicleFlag, ShipSchema } from '../../src/entities/ship.js';
import { _resetFolderCache } from '../../src/entities/folder.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'Your hauler hangs in the dark, hull plates scarred by a hundred dockings.';

function makeShip() {
  const actor = global.makeTestActor({
    type: 'starship', name: 'Kestrel',
    flags: { [MODULE_ID]: { entityType: 'ship', entityId: 'rec-kestrel', ship: {
      ...ShipSchema, _id: 'rec-kestrel', name: 'Kestrel', integrity: 5, integrityMax: 5,
    } } },
  });
  // installModulesForRolledIdentity needs the embedded-document API; nothing is installed here.
  actor.createEmbeddedDocuments = async () => [];
  global.game.actors._set(actor.id, actor);
  return actor;
}

// Time-bounded, not turn-bounded: the file's first seed pays its dynamic
// imports, which a loaded worker can stretch past a fixed number of turns.
const untilClaudeCallIsOut = async () => {
  const deadline = Date.now() + 4000;
  while (control.pending.length === 0 && Date.now() < deadline) await new Promise(r => setTimeout(r, 2));
  if (!control.pending.length) throw new Error('the seed never reached its Notes call');
};
const releaseClaude = () => control.pending.splice(0).forEach(resolve =>
  resolve({ content: [{ type: 'text', text: PROSE }] }));

beforeEach(() => {
  control.pending.length = 0;
  _resetFolderCache();
  global.game.actors._reset();
  global.game.folders._reset();
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');   // the Notes call happens
  global.game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [], sectors: [], activeSectorId: null });
});

describe('X32 — the ship seed writes only what it seeds, onto the record as it is when the write lands', () => {
  it('a position, an integrity change and the command-vehicle sync that land during the Notes call survive the seed', async () => {
    const actor = makeShip();
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');

    const seed = seedStarshipActor(actor, cs);
    await untilClaudeCallIsOut();

    // While the narrator writes the introduction: `!at Bleakhold` lands …
    await updateShip(actor.id, { position: {
      ...ShipSchema.position, sectorId: 'sec-1', nearestSettlementId: 'stl-bleakhold',
      freeText: 'docked at Bleakhold', updatedAt: '2026-11-04T10:00:00.000Z', updatedBy: 'at_command',
    } });
    // … a Withstand Damage choice costs integrity …
    await updateShip(actor.id, { integrity: 3 });
    // … and the GM drags the STARSHIP asset onto the sheet (the createItem hook's sync).
    actor.items.contents.push({ type: 'asset', name: 'Starship', system: { category: 'Command Vehicle' } });
    await syncCommandVehicleFlag(actor, cs);
    expect(getShip(actor.id)).toMatchObject({ integrity: 3, isCommandVehicle: true });   // the writes landed
    expect(getShip(actor.id).position.nearestSettlementId).toBe('stl-bleakhold');

    releaseClaude();
    const seeded = await seed;
    expect(seeded).toBeTruthy();

    const record = getShip(actor.id);
    expect(record.type).toBe('Hauler — Heavy transport');                       // the seed wrote its fields
    expect(record.firstLook).toBe('Heavy armor');
    expect(record.mission).toBe('Transport cargo');
    expect(String(actor.system.notes)).toContain('hull plates scarred');        // and the Notes
    // The writes that landed during the call stand (the pre-call snapshot was
    // written whole — position null, integrity 5, isCommandVehicle false).
    expect(record.position.nearestSettlementId).toBe('stl-bleakhold');
    expect(record.position.updatedBy).toBe('at_command');
    expect(record.integrity).toBe(3);
    expect(record.isCommandVehicle).toBe(true);
    // The returned record is the one written.
    expect(seeded).toMatchObject({ type: 'Hauler — Heavy transport', integrity: 3, isCommandVehicle: true });
  });

  it('a rename during the call is the name the record keeps', async () => {
    const actor = makeShip();
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    const seed = seedStarshipActor(actor, cs);
    await untilClaudeCallIsOut();
    actor.name = 'Wayfarer';
    releaseClaude();
    await seed;
    expect(getShip(actor.id).name).toBe('Wayfarer');
  });

  it('a starship with no record yet gets the whole record, the schema filling what the seed does not roll', async () => {
    const actor = global.makeTestActor({ type: 'starship', name: 'Gull' });
    actor.createEmbeddedDocuments = async () => [];
    global.game.actors._set(actor.id, actor);
    const seed = seedStarshipActor(actor, global.game.settings.get(MODULE_ID, 'campaignState'));
    await untilClaudeCallIsOut();
    releaseClaude();
    const seeded = await seed;
    const record = getShip(actor.id);
    expect(record).toMatchObject({ name: 'Gull', type: 'Hauler — Heavy transport', integrity: ShipSchema.integrity });
    expect(typeof record._id).toBe('string');
    expect(record._id).toBe(seeded._id);
    expect(record.createdAt).toBeTruthy();
  });

  it('control: a position written BEFORE the seed starts is kept by it', async () => {
    const actor = makeShip();
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await updateShip(actor.id, { position: { ...ShipSchema.position, nearestSettlementId: 'stl-early', updatedBy: 'at_command' } });

    const seed = seedStarshipActor(actor, cs);
    await untilClaudeCallIsOut();
    releaseClaude();
    await seed;

    expect(getShip(actor.id).position.nearestSettlementId).toBe('stl-early');
    expect(getShip(actor.id).type).toBe('Hauler — Heavy transport');
  });
});
