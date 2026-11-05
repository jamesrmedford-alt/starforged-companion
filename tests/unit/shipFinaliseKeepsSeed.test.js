/**
 * STARFORGED COMPANION
 * tests/unit/shipFinaliseKeepsSeed.test.js
 *
 * Issue #331 X34 (SHIP-FINALISE-RESEEDS-AUTOSEEDED). With Auto-Seed Starship
 * on, a new ship is fully seeded at creation — type / first look / mission,
 * Notes introduction, portrait — but carries no `finalizedAt`, so the
 * Entities panel offers ✦ Finalise. Pressing it ran seedStarshipActor again:
 * another narrator call and the whole Notes replaced (only the portrait block
 * kept) — a `!ship envision` / `!ship history` section and the GM's edits
 * gone. Issue #311 P07 gave the connection seed the rule for an
 * already-seeded card ("a seeded card's first Finalise stamps it, nothing
 * else"); a ship whose Notes already hold its introduction now gets it too
 * (one with a rolled type but empty Notes is still seeded — the P07 test).
 * ↻ Regenerate stays the re-write path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const PROSE = 'Your hauler hangs in the dark, hull plates scarred by a hundred dockings.';

vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: PROSE }] })),
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
  getCanonicalAsset: vi.fn(async () => null),
}));

import { apiPost } from '../../src/api-proxy.js';
import { finalizeEntity } from '../../src/entities/finalize.js';
import { getShip, registerStarshipActorLight, starshipHasSeedDetail, ShipSchema } from '../../src/entities/ship.js';
import { _resetFolderCache } from '../../src/entities/folder.js';

const MODULE_ID = 'starforged-companion';
const SEEDED_NOTES =
  '<p>A battered hauler, all patched plates and stubborn engines.</p><p><em>Hauler — Heavy transport &middot; Heavy armor</em></p>' +
  '<hr><h4>✦ Envisioned captain — 2026-11-01</h4><p>The captain hums old freighter shanties on the night watch.</p>';

function makeStarship({ seeded }) {
  const actor = global.makeTestActor({
    type: 'starship', name: 'Kestrel',
    system: { notes: seeded ? SEEDED_NOTES : '' },
    flags: seeded ? { [MODULE_ID]: { entityType: 'ship', entityId: 'rec-kestrel', ship: {
      ...ShipSchema, _id: 'rec-kestrel', name: 'Kestrel',
      type: 'Hauler — Heavy transport', firstLook: 'Heavy armor', mission: 'Transport cargo',
      portraitSourceDescription: 'Hauler — Heavy transport. Heavy armor',
    } } } : {},
  });
  actor.createEmbeddedDocuments = async () => [];
  global.game.actors._set(actor.id, actor);
  return actor;
}

beforeEach(() => {
  apiPost.mockClear();
  _resetFolderCache();
  global.game.actors._reset();
  global.game.folders._reset();
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  global.game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [], sectors: [], activeSectorId: null });
});

describe('X34 — the first Finalise of an Auto-Seeded ship stamps it and leaves its Notes alone', () => {
  it('an auto-seeded ship with an envisioned section: Finalise asks the narrator nothing and keeps the Notes', async () => {
    const actor = makeStarship({ seeded: true });
    expect(starshipHasSeedDetail(actor)).toBe(true);                 // the Auto-Seed's own "already populated"
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');

    const result = await finalizeEntity('ship', actor.id, cs);
    expect(result).toMatchObject({ ok: true, reason: 'finalized', artTriggered: false });   // the panel's success line
    expect(getShip(actor.id).finalizedAt).toBeTruthy();
    // No narrator call, the Notes as they were (a second introduction was
    // written over them — the envisioned section gone).
    expect(apiPost).not.toHaveBeenCalled();
    expect(String(actor.system.notes)).toContain('Envisioned captain');
    expect(String(actor.system.notes)).toContain('freighter shanties');
    expect(getShip(actor.id).type).toBe('Hauler — Heavy transport');

    // A second press: already finalised.
    expect((await finalizeEntity('ship', actor.id, cs)).reason).toBe('already-finalized');
  });

  it('↻ Regenerate (force) still re-seeds an auto-seeded ship', async () => {
    const actor = makeStarship({ seeded: true });
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    const result = await finalizeEntity('ship', actor.id, cs, { force: true });
    expect(result).toMatchObject({ ok: true, reason: 'regenerated' });
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(String(actor.system.notes)).toContain('hull plates scarred');
  });

  it('control: a blank light-registered ship is seeded by its first Finalise, and a second Finalise asks nothing (P07)', async () => {
    const actor = makeStarship({ seeded: false });
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await registerStarshipActorLight(actor, cs);
    expect(starshipHasSeedDetail(actor)).toBe(false);

    const first = await finalizeEntity('ship', actor.id, cs);
    expect(first).toMatchObject({ ok: true, reason: 'finalized' });
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(String(actor.system.notes)).toContain('hull plates scarred');
    expect(getShip(actor.id).finalizedAt).toBeTruthy();

    const second = await finalizeEntity('ship', actor.id, cs);
    expect(second.reason).toBe('already-finalized');
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('a ship whose Notes hold only its portrait is seeded, its rolled identity kept', async () => {
    const actor = makeStarship({ seeded: true });
    actor.system.notes = '<p><img src="portrait.webp"></p>';
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    const result = await finalizeEntity('ship', actor.id, cs);
    expect(result).toMatchObject({ ok: true, reason: 'finalized' });
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(String(actor.system.notes)).toContain('hull plates scarred');
    expect(getShip(actor.id).type).toBe('Hauler — Heavy transport');
  });
});
