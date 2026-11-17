/**
 * STARFORGED COMPANION
 * tests/unit/snapshotSectorlessPeopleOnRoster.test.js
 *
 * Issue #362 AC29 SNAPSHOT-SECTORLESS-NPCS-OFF-ROSTER — an NPC the story made
 * in play is still in the cast the snapshot's reuse rule points at.
 *
 * A confirmed draft and Make a Connection's auto-create call
 * `createConnection` with no `sectorId` (connection.js files them under the
 * top-level NPCs folder, "a narrator-named NPC with no charted home").
 * Without a world snapshot, [5b] ACTIVE SECTOR lists them under "Established
 * NPCs in this sector" (`!c.sectorId || c.sectorId === id`) and its CAST
 * DISCIPLINE rule says to reuse "one of the NPCs listed above". With a
 * snapshot that section is not sent (rules/narrator-memory.md 7c: a per-beat
 * section the snapshot covers is left out — so the snapshot must cover it),
 * and the SECTORS section listed a sector's People by `sectorId` alone: every
 * NPC made in play was in no one's roster. The SECTORS section now has a unit
 * for the people with no sector of their own, after the sectors, and the
 * rule names it.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, narrationCallsOf, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';
import { SNAPSHOT_BLOCK_HEADING, CONTEXT_BLOCK_HEADING } from '../../src/narration/narratorPrompt.js';

const SECTOR = { id: 'sec-1', name: 'Devil\'s Maw', region: 'outlands', regionLabel: 'Outlands',
  mapData: { settlements: [], passages: [], discoveries: [] } };

let table;
let restore;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => restore?.());

const gm = () => gmOf(table);
const blockOf = (heading) => narrationCallsOf(table).at(-1).body.system.find(b => b.text.startsWith(heading))?.text ?? '';
/** One `### ` section of the snapshot block. */
const snapshotSection = (name) => {
  const text = blockOf(SNAPSHOT_BLOCK_HEADING);
  const at = text.indexOf(`### ${name}`);
  if (at < 0) return '';
  const next = text.indexOf('\n### ', at + 4);
  return text.slice(at, next < 0 ? undefined : next);
};

async function setUp(settings = {}, { lost = false } = {}) {
  restore = await resetSkeletonTable(table, settings, { sessionNumber: 3, sectors: [SECTOR], activeSectorId: 'sec-1' });
  const store  = await gm().import('../../src/narration/worldSnapshotStore.js');
  const events = await gm().import('../../src/narration/snapshotEvents.js');
  gm().run(() => { store._resetWorldSnapshotStoreForTests(); events._resetSnapshotEventsForTests(); });
  const { createConnection } = await gm().import('../../src/entities/connection.js');
  await gm().run(async () => {
    const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    // The sector generator's local connection: it knows its sector.
    await createConnection({ name: 'Mother Oriel', role: 'Prophet', sectorId: 'sec-1' }, cs);
    // An NPC the story made — as a confirmed draft or Make a Connection creates one: no sectorId.
    await createConnection({ name: 'Kael Dros', role: 'Dockmaster', description: 'Runs the Bleakhold docks.' }, cs);
    // A connection made in play and since lost (`!sever`): listed apart, never as cast to reuse.
    if (lost) await createConnection({ name: 'Wren Hale', role: 'Smuggler', active: false }, cs);
  });
  await table.settle();
  await table.drain();
}
const narrate = () => narrateMoveOn(table, moveResolution({ playerNarration: 'I look for someone who can get us a berth.' }));

describe('issue #362 AC29 — an NPC made in play is still in the cast the reuse rule points at', () => {
  it('control: an NPC made in play has no sector, and the sector generator\'s has one', async () => {
    await setUp();
    const { listConnections } = await gm().import('../../src/entities/connection.js');
    const bySector = gm().run(() => Object.fromEntries(listConnections(game.settings.get(MODULE_ID, 'campaignState')).map(c => [c.name, c.sectorId ?? null])));
    expect(bySector).toEqual({ 'Mother Oriel': 'sec-1', 'Kael Dros': null });
  }, 60_000);

  it('control: with the snapshot off, ACTIVE SECTOR lists both among the sector\'s established NPCs', async () => {
    await setUp({ worldSnapshot: false });
    await narrate();
    const context = blockOf(CONTEXT_BLOCK_HEADING);
    const roster = context.slice(context.indexOf('## ACTIVE SECTOR'), context.indexOf('CAST DISCIPLINE'));
    expect(roster).toContain('Established NPCs in this sector');
    expect(roster).toContain('- Mother Oriel — Prophet');
    expect(roster).toContain('- Kael Dros — Dockmaster');
  }, 60_000);

  it('control: with the snapshot, the sector\'s own NPC is on its People line and both have cards', async () => {
    await setUp();
    await narrate();
    expect(snapshotSection('SECTORS')).toMatch(/People: [^\n]*Mother Oriel — Prophet/);
    const cards = snapshotSection('RECORDED PEOPLE, PLACES AND SHIPS');
    expect(cards).toContain('#### MOTHER ORIEL — Connection');
    expect(cards).toContain('#### KAEL DROS — Connection');
    expect(blockOf(CONTEXT_BLOCK_HEADING)).not.toContain('## ACTIVE SECTOR');
  }, 60_000);

  it('with the snapshot, the section that carries the reuse rule names the NPC made in play', async () => {
    await setUp();
    await narrate();
    const sectors = snapshotSection('SECTORS');
    expect(sectors).toContain('CAST DISCIPLINE');
    // The rule's cast: "the people listed for the active sector or with no sector of their own".
    expect(sectors.includes('Kael Dros'), 'the SECTORS section (the cast the reuse rule points at) names Kael Dros').toBe(true);
    expect(sectors).toContain('one of the people listed for the active sector or with no sector of their own');
    // Their own unit, after every sector's: not on the sector's People line.
    const unit = sectors.slice(sectors.indexOf('#### People with no sector of their own')).trim();
    expect(sectors.indexOf('#### People with no sector of their own')).toBeGreaterThan(sectors.indexOf('#### Devil\'s Maw (id sec-1)'));
    expect(unit).toMatch(/^#### People with no sector of their own\nPeople: Kael Dros — Dockmaster$/);
    expect(sectors).not.toMatch(/People: [^\n]*Mother Oriel[^\n]*Kael Dros/);
  }, 60_000);

  it('a connection made in play and since lost is listed apart, never as cast to reuse', async () => {
    await setUp({}, { lost: true });
    await narrate();
    const sectors = snapshotSection('SECTORS');
    const unit = sectors.slice(sectors.indexOf('#### People with no sector of their own')).trim();
    expect(unit).toContain('People: Kael Dros — Dockmaster');
    expect(unit).toMatch(/\nLost connections \(the bond with the crew is broken — not cast to reuse as friends\): Wren Hale — Smuggler$/);
    expect(unit).not.toMatch(/People: [^\n]*Wren Hale/);
  }, 60_000);
});
