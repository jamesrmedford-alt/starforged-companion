/**
 * NARP-01 · SNAPSHOT-ENTITY-DETAIL-REMOVE-NO-EVENT (INCOMPLETE-FIX)
 *
 * Scenario: the narrator's world snapshot (issue #357) holds an NPC's card,
 * with a narrator-added detail under NARRATOR-ADDED ("honour and build on
 * these"). The table takes that detail off the NPC in the Entities panel
 * ("Remove" — gmRelay "entity.edit", entityPanel.js applyEntityEditFromRelay),
 * then narrates again.
 *
 * Correct (rules/narrator-memory.md 7c, decisions.md → "The world snapshot":
 * "The snapshot must never keep asserting removed content … a path that
 * *rewrites* [a record] to take content back must report an event of its own"):
 * the next narration takes a new snapshot, so no cached block states the
 * removed detail.
 *
 * Today: Remove reports no snapshot event. The record still exists, so the
 * manifest's `record_removed` does not fire; the card rides under CHANGED
 * SINCE THE SNAPSHOT without the detail, while the cached snapshot block goes
 * on stating it as an established fact for the rest of the session (until some
 * unrelated event takes a new snapshot).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, narrationCallsOf, moveResolution, narrateMoveOn,
} from '../../helpers/skeletonTable.js';
import { SNAPSHOT_BLOCK_HEADING, CONTEXT_BLOCK_HEADING } from '../../../src/narration/narratorPrompt.js';

const DETAIL = 'SENTINEL-DETAIL: lost his left hand in the Bleakhold riots';

let table;
let restore;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => restore?.());

beforeEach(async () => {
  restore = await resetSkeletonTable(table, {}, { sessionNumber: 3 });
  const store  = await gmOf(table).import('../../src/narration/worldSnapshotStore.js');
  const events = await gmOf(table).import('../../src/narration/snapshotEvents.js');
  gmOf(table).run(() => { store._resetWorldSnapshotStoreForTests(); events._resetSnapshotEventsForTests(); });
});

const gm = () => gmOf(table);
const lastCall = () => narrationCallsOf(table).at(-1);
const blockOf = (call, heading) => call.body.system.find(b => b.text.startsWith(heading)) ?? null;
const narrate = (line) => narrateMoveOn(table, moveResolution({ playerNarration: line }));
const snapshotLog = () => gm().run(() => {
  const journal = game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets');
  const page = (journal?.pages?.contents ?? []).find(p => p.flags?.[MODULE_ID]?.worldSnapshot);
  return page?.flags?.[MODULE_ID]?.worldSnapshot?.log ?? [];
});

async function onTheGm(work) {
  const result = await gm().run(work);
  await table.settle();
  await table.drain();
  return result;
}

/** Vuldar Archer's NPC card, with one narrator-added detail from the real tier writer. Returns the card's id. */
async function vuldarWithDetail() {
  const { createConnection, getConnection } = await gm().import('../../src/entities/connection.js');
  const { appendDetailToTier } = await gm().import('../../src/entities/entityExtractor.js');
  return onTheGm(async () => {
    const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    await createConnection({ name: 'Vuldar Archer', role: 'Broker', pronouns: 'he/him' }, cs);
    const id = game.settings.get(MODULE_ID, 'campaignState').connectionIds.at(-1);
    const saved = await appendDetailToTier({ journalId: id, type: 'connection', name: 'Vuldar Archer', record: getConnection(id) },
      DETAIL, 's-1', 3, { narrationId: null });
    if (!saved) throw new Error('probe setup: the detail was not written to the card');
    return id;
  });
}

/** The Entities panel's Remove, as its relay handler runs it on the canonical GM. */
async function removeDetail(entityId) {
  const { applyEntityEditFromRelay } = await gm().import('../../src/ui/entityPanel.js');
  return onTheGm(() => applyEntityEditFromRelay({ op: 'remove', entityId, detail: DETAIL }, { requesterId: 'gm-1', requesterIsGM: true }));
}

describe('NARP-01 — a detail the table removed from an NPC is not left in the cached world snapshot', () => {
  it('control: the snapshot holds the narrator-added detail, and the Remove takes it off the card', async () => {
    const id = await vuldarWithDetail();
    await narrate('I ask Vuldar Archer what he knows.');
    expect(blockOf(lastCall(), SNAPSHOT_BLOCK_HEADING).text).toContain(DETAIL);

    const res = await removeDetail(id);
    expect(res).toEqual({ applied: true });
    const { getConnection } = await gm().import('../../src/entities/connection.js');
    const tier = gm().run(() => getConnection(id).generativeTier ?? []);
    expect(tier.some(e => e.detail === DETAIL)).toBe(false);
  }, 60_000);

  it('control: after the Remove, the card as it stands now (without the detail) is in the context', async () => {
    const id = await vuldarWithDetail();
    await narrate('I ask Vuldar Archer what he knows.');
    await removeDetail(id);
    await narrate('I ask Vuldar Archer again.');
    const context = blockOf(lastCall(), CONTEXT_BLOCK_HEADING).text;
    expect(context).not.toContain(DETAIL);
  }, 60_000);

  it('the narration after the Remove sends no cached block that still states the removed detail', async () => {
    const id = await vuldarWithDetail();
    await narrate('I ask Vuldar Archer what he knows.');
    expect(snapshotLog()).toHaveLength(1);
    await removeDetail(id);
    await narrate('I ask Vuldar Archer again.');

    // The whole request the narrator is sent: nothing in it states the detail the table took back.
    const sent = lastCall().body.system.map(b => b.text).join('\n');
    expect(sent).not.toContain(DETAIL);
  }, 60_000);

  it('a rewrite that takes content back takes a new snapshot (as a plan edit, a strike and the X-Card do)', async () => {
    const id = await vuldarWithDetail();
    await narrate('I ask Vuldar Archer what he knows.');
    await removeDetail(id);
    await narrate('I ask Vuldar Archer again.');
    expect(snapshotLog()).toHaveLength(2);
  }, 60_000);
});
