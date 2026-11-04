/**
 * PROBE — ENT-03 SHIP-FINALISE-RESEEDS-AUTOSEEDED (ninth audit, area entities)
 *
 * What the user does: with Auto-Seed Starship on, the GM creates a starship;
 * the createActor seed writes its type / first look / mission, its Notes
 * introduction and (with a key) its portrait. Later the GM runs `!ship
 * envision` (a dated section appended to Notes) or edits the Notes tab, opens
 * the Entities panel and presses ✦ Finalise — the panel offers it for every
 * ship without `finalizedAt` (src/ui/entityPanel.js:433-442), and an
 * auto-seeded ship has none.
 *
 * What happens: finalizeEntity → finalizeViaSeed (src/entities/finalize.js
 * :125-146) checks only `finalizedAt`, so it runs seedStarshipActor again
 * (ship.js:543+): another narrator call for an introduction, and the whole
 * Notes replaced (keepNotesPortrait keeps the portrait block only) — the
 * envisioned section and the GM's edits are gone. The type / first look /
 * mission are kept (`existing.type || rolledType`), so the ship reads the same
 * while its Notes silently lose what was written since the seed.
 *
 * What should happen: issue #311 P07 made Finalise a completion contract and
 * gave the connection seed the rule for an already-seeded card ("a seeded
 * card's first Finalise stamps it, nothing else" — connection.js:382-392,
 * `existing.seeded && !force` → stamp finalizedAt only). A ship the Auto-Seed
 * already populated (starshipHasSeedDetail, ship.js:905-913 — the hook's own
 * skip predicate) should get the same: its first Finalise stamps
 * `finalizedAt`, asks the narrator nothing and leaves Notes alone; ↻
 * Regenerate (force) stays the way to write them again.
 *
 * Controls: a blank, light-registered ship's Finalise seeds it (one narrator
 * call, Notes written, finalizedAt stamped); a Finalise after the stamp asks
 * nothing (P07).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const PROSE = 'Your hauler hangs in the dark, hull plates scarred by a hundred dockings.';

vi.mock('../../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: PROSE }] })),
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
  getCanonicalAsset: vi.fn(async () => null),
}));

import { apiPost } from '../../../src/api-proxy.js';
import { finalizeEntity } from '../../../src/entities/finalize.js';
import { getShip, registerStarshipActorLight, starshipHasSeedDetail, ShipSchema } from '../../../src/entities/ship.js';
import { _resetFolderCache } from '../../../src/entities/folder.js';

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

describe('ENT-03 the first Finalise of an Auto-Seeded ship stamps it and leaves its Notes alone', () => {
  it('an auto-seeded ship with an envisioned section: Finalise asks the narrator nothing and keeps the Notes', async () => {
    const actor = makeStarship({ seeded: true });
    expect(starshipHasSeedDetail(actor)).toBe(true);                 // the Auto-Seed's own "already populated"
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');

    const result = await finalizeEntity('ship', actor.id, cs);
    expect(result.ok).toBe(true);
    expect.soft(getShip(actor.id).finalizedAt).toBeTruthy();         // stamped (today too)
    // Expected: no narrator call, the Notes as they were. Today: a second
    // introduction is written over them — the envisioned section is gone.
    expect.soft(apiPost).not.toHaveBeenCalled();
    expect.soft(String(actor.system.notes)).toContain('Envisioned captain');
    expect.soft(String(actor.system.notes)).toContain('freighter shanties');
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
});
