/**
 * PROBE — ENT-01 SHIP-SEED-STALE-RECORD-WRITE (ninth audit, area entities)
 *
 * What the user does: with Auto-Seed Starship on, the GM creates a starship
 * from the sidebar — or presses ✦ Finalise / ↻ Regenerate flavour on a ship
 * in the Entities panel (finalize.js finalizeViaSeed → seedStarshipActor).
 * While the seed's narrator call for the Notes introduction is out (several
 * seconds), something else writes the ship record: a `!at <place>` or a Set a
 * Course arrival (the position), a `!repair` / Withstand Damage choice (the
 * integrity), the STARSHIP asset dragged onto the sheet (the command-vehicle
 * sync, index.js registerCommandVehicleHook → syncCommandVehicleFlag).
 *
 * What happens: seedStarshipActor (src/entities/ship.js:543-651) reads
 * `existing = actor.flags[MODULE].ship` BEFORE it awaits the module install
 * and the Notes' Claude call, builds `ship = { ...ShipSchema, ...existing,
 * ... }` from that snapshot (`isCommandVehicle` is evaluated there too), and
 * after the awaits writes `flags.<module>.ship: ship` WHOLE (ship.js:613-618).
 * Every record write that landed during the call — the position, the
 * integrity, `isCommandVehicle`, a tier detail, a rename — is reverted. The
 * card then says "docked at Bleakhold" while the record (and the narrator's
 * SHIP POSITION line) is back where it was.
 *
 * What should happen: the seed writes only the fields it seeds, by flag path,
 * onto the record as it is when the write lands — the contract issue #326 W69
 * gave seedConnectionActor (connection.js:439-448 "only these are written —
 * by path, onto the record as it is when the write lands") and
 * rules/reachability.md §9 (a long-running writer writes only what it owns).
 * The W69 fix and its test (tests/unit/autoSeedFieldWrites.test.js) covered
 * the connection seed only; the ship seed kept the whole-snapshot write.
 *
 * Controls: the seeded fields and Notes land; a write that lands BEFORE the
 * seed starts is kept (the snapshot is honest when nothing races it).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const control = vi.hoisted(() => ({ pending: [] }));

vi.mock('../../../src/api-proxy.js', () => ({
  apiPost: vi.fn(() => new Promise(resolve => { control.pending.push(resolve); })),
}));
vi.mock('../../../src/oracles/roller.js', async (importOriginal) => ({
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
vi.mock('../../../src/system/ironswornPacks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCanonicalAsset: vi.fn(async () => null),   // no compendium in the harness — nothing installed
}));

import { seedStarshipActor, updateShip, getShip, syncCommandVehicleFlag, ShipSchema } from '../../../src/entities/ship.js';
import { _resetFolderCache } from '../../../src/entities/folder.js';

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

const untilClaudeCallIsOut = async () => {
  for (let i = 0; i < 200 && control.pending.length === 0; i++) await new Promise(r => setTimeout(r, 0));
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

describe('ENT-01 the ship seed writes only what it seeds, onto the record as it is when the write lands', () => {
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
    expect.soft(record.type).toBe('Hauler — Heavy transport');                       // control: the seed wrote its fields
    expect.soft(String(actor.system.notes)).toContain('hull plates scarred');        // control: and the Notes
    // Expected: the writes that landed during the call stand. Today: the
    // pre-call snapshot is written whole — position null, integrity 5,
    // isCommandVehicle false.
    expect.soft(record.position.nearestSettlementId).toBe('stl-bleakhold');
    expect.soft(record.position.updatedBy).toBe('at_command');
    expect.soft(record.integrity).toBe(3);
    expect.soft(record.isCommandVehicle).toBe(true);
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
