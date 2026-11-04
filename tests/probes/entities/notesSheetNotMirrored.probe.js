/**
 * PROBE — ENT-06 NOTES-SHEET-NOT-MIRRORED (ninth audit, area entities)
 *
 * What the user does: the GM opens an NPC card's or the ship's sheet and
 * writes in its Notes tab — "She is secretly on the Syndicate's payroll",
 * "the hold is full of contraband" — expecting the narrator to know (the help
 * Changelog v1.7.36: "An NPC's or a ship's notes reach the narrator as
 * text"). The Auto-Seed itself writes the narrator introduction and the
 * portrait into that same Notes tab (`system.notes`, rules/foundry-ironsworn.md
 * §10; ship.js:632, connection.js:457).
 *
 * What happens: the ENTITIES IN SCENE card's Notes row reads the RECORD's
 * `notes` flag (narratorPrompt.js:766-772 → formatEntityCard :931), a second
 * store that only `updateShip({ notes })` (an `!ship envision` / `!ship
 * history` append, shipEnvision.js:303-325) and the Entities panel's
 * promote-to-notes (entityPanel.js:1274) write. The seed writes `system.notes`
 * alone (ship.js:632-636, connection.js:452-462); a sheet edit writes
 * `system.notes` alone (the rename-sync hook mirrors `name` only, index.js
 * :2617-2631); nothing mirrors it back. So the narrator's Notes row is empty
 * for every seeded NPC and ship, and the GM's Notes-tab edits never reach
 * it — until an Envision happens to copy `system.notes` into the flag, after
 * which the row is frozen at that copy. One fact, two stores, no canonical
 * one named (decisions.md names none; rules/reachability.md §5).
 *
 * What should happen: what the sheet's Notes tab holds reaches the narrator's
 * Notes row (the sheet is what the GM edits and what the seed writes) — read
 * `system.notes` for the Actor-hosted types, or write it through to the flag
 * on every change.
 *
 * Control: an `!ship envision` append reaches the row (it writes both stores).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const PROSE = 'Your hauler hangs in the dark, hull plates scarred by a hundred dockings.';
const NPC_PROSE = 'Vex meets your eye and does not look away.';

vi.mock('../../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => ({
    content: [{ type: 'text', text: /introduction to an NPC/.test(body?.system?.[0]?.text ?? '') ? NPC_PROSE : PROSE }],
  })),
}));
vi.mock('../../../src/oracles/roller.js', async (importOriginal) => ({
  ...(await importOriginal()),
  rollOracle: vi.fn((id) => ({
    tableId: id,
    result: ({
      starship_type: 'Hauler — Heavy transport', starship_first_look: 'Heavy armor', starship_mission_terminus: 'Transport cargo',
      character_role: 'Smuggler', character_goal: 'Pay off a debt', character_first_look: 'Scarred hands', character_disposition: 'Wary',
    })[id] ?? '—',
  })),
}));
vi.mock('../../../src/system/ironswornPacks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCanonicalAsset: vi.fn(async () => null),
}));

import { seedStarshipActor, getShip, ShipSchema } from '../../../src/entities/ship.js';
import { seedConnectionActor, getConnection } from '../../../src/entities/connection.js';
import { appendNotesSection } from '../../../src/entities/shipEnvision.js';
import { formatEntityCard } from '../../../src/narration/narratorPrompt.js';
import { ConnectionSchema } from '../../../src/schemas.js';
import { _resetFolderCache } from '../../../src/entities/folder.js';

const MODULE_ID = 'starforged-companion';
const notesRow = (card) => (card.split('\n').find(l => /^\s*Notes:/.test(l)) ?? '').trim();

function makeShip() {
  const actor = global.makeTestActor({
    type: 'starship', name: 'Kestrel',
    flags: { [MODULE_ID]: { entityType: 'ship', entityId: 'rec-kestrel', ship: { ...ShipSchema, _id: 'rec-kestrel', name: 'Kestrel' } } },
  });
  actor.createEmbeddedDocuments = async () => [];
  global.game.actors._set(actor.id, actor);
  return actor;
}
function makeNpc() {
  const actor = global.makeTestActor({
    id: 'npc-vex', type: 'character', name: 'Vex',
    flags: { [MODULE_ID]: { entityType: 'connection', entityId: 'conn-vex', connection: { ...ConnectionSchema, _id: 'conn-vex', name: 'Vex', rank: 'dangerous' } } },
  });
  global.game.actors._set(actor.id, actor);
  return actor;
}

beforeEach(() => {
  _resetFolderCache();
  global.game.actors._reset();
  global.game.folders._reset();
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  global.game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [], connectionIds: ['npc-vex'], sectors: [], activeSectorId: null });
});

describe("ENT-06 the sheet's Notes tab reaches the narrator's Notes row", () => {
  it("a ship: the seed's introduction and a GM's Notes-tab edit reach ENTITIES IN SCENE", async () => {
    const actor = makeShip();
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    await seedStarshipActor(actor, cs);
    expect(String(actor.system.notes)).toContain('hull plates scarred');              // the seed wrote the sheet

    // Expected: the Notes row carries the sheet's Notes. Today: no Notes row —
    // the record's `notes` flag is "".
    expect.soft(notesRow(formatEntityCard(getShip(actor.id), 'ship'))).toContain('hull plates scarred');

    await actor.update({ 'system.notes': `${actor.system.notes}<p>The hold is full of contraband.</p>` });
    expect.soft(notesRow(formatEntityCard(getShip(actor.id), 'ship'))).toContain('contraband');
  });

  it("an NPC card: the seed's introduction and a GM's Notes-tab edit reach ENTITIES IN SCENE", async () => {
    const npc = makeNpc();
    const cs = global.game.settings.get(MODULE_ID, 'campaignState');
    const seeded = await seedConnectionActor(npc, cs);
    expect(seeded?.seeded).toBe(true);
    expect(String(npc.system.notes)).toContain('does not look away');                 // the seed wrote the sheet

    expect.soft(notesRow(formatEntityCard(getConnection(npc.id), 'connection'))).toContain('does not look away');

    await npc.update({ 'system.notes': `${npc.system.notes}<p>She is secretly on the Syndicate's payroll.</p>` });
    expect.soft(notesRow(formatEntityCard(getConnection(npc.id), 'connection'))).toContain('payroll');
  });

  it('control: an `!ship envision` append reaches the row (it writes both stores)', async () => {
    const actor = makeShip();
    await appendNotesSection(actor, 'History', '<p>Once a smuggler, always a smuggler.</p>');
    expect(notesRow(formatEntityCard(getShip(actor.id), 'ship'))).toContain('Once a smuggler');
  });
});
