/**
 * PROBE — ENT-05 SEVER-BOND-ITEM-STAYS (ninth audit, area entities) — NEEDS A DECISION
 *
 * What the user does: the GM types `!sever Vex — she betrayed the crew at
 * Bleakhold`. The connection record is marked lost (`active: false`, a
 * history entry); the sector roster lists her apart as "connection lost"
 * (issue #325 W37) and the end-session vignette skips her (U61).
 *
 * What happens: the PC's bond Item — the write-through mirror of the
 * connection (connection-flow.md: "Two mirrors exist … a PC `progress` Item
 * with subtype bond", kept in step by setBondItemTicks / setBondItemRank) —
 * is not touched by loseConnection (src/entities/connection.js:291-301). The
 * vendor sheet's Connections tab and CHARACTER STATE (actorBridge.readConnections
 * → narratorPrompt's bonds list) keep showing "Vex (dangerous, progress 3/10)"
 * as a live bond, and a `!bond` / Develop Your Relationship that resolves by
 * the Item's name still finds her. The record says lost; its mirror says bonded.
 *
 * What should happen: rules/reachability.md §5 — a mirrored fact is written
 * through on EVERY change to the canonical value. The decision to make:
 *   A. loseConnection writes through to the bond Items bondItemsFor finds
 *      (mark them `completed`, as a vow's copies are closed), so the sheet
 *      and CHARACTER STATE stop listing a live bond; or
 *   B. the Items stay as the sheet's history and readConnections marks a
 *      bond whose record is `active: false` as lost, so CHARACTER STATE and
 *      the selectors skip it.
 * This probe asserts the outcome both share: after a sever, the PC's
 * connections snapshot lists no LIVE bond to the severed connection.
 *
 * Control: the record itself is marked lost with its history entry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionSchema } from '../../../src/schemas.js';
import { loseConnection, getConnection } from '../../../src/entities/connection.js';
import { createCharacterBondItem, readConnections } from '../../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

function setup() {
  const pc = global.makeTestActor({ id: 'pc-kira', type: 'character', name: 'Kira' });
  const npc = global.makeTestActor({
    id: 'npc-vex', type: 'character', name: 'Vex',
    flags: { [MODULE_ID]: { entityType: 'connection', entityId: 'conn-vex', connection: {
      ...ConnectionSchema, _id: 'conn-vex', name: 'Vex', rank: 'dangerous', bonded: true, active: true,
      relationshipTicks: 12, history: [],
    } } },
  });
  global.game.actors._set(pc.id, pc);
  global.game.actors._set(npc.id, npc);
  return { pc, npc };
}

beforeEach(() => {
  global.game.actors._reset();
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE_ID}.campaignState`, { connectionIds: ['npc-vex'] });
});

describe('ENT-05 a severed connection is no longer a live bond on the PC', () => {
  it('after !sever, the PC\'s connections snapshot lists no live bond to Vex', async () => {
    const { pc, npc } = setup();
    const item = await createCharacterBondItem(pc, { name: 'Vex', rank: 'dangerous', connectionId: 'conn-vex' });
    expect(item).toBeTruthy();
    await item.update?.({ 'system.current': 12 }).catch(() => {});

    await loseConnection(npc.id, 'she betrayed the crew at Bleakhold', 'sess-1');

    // control: the canonical record is lost, with its history
    const record = getConnection(npc.id);
    expect(record.active).toBe(false);
    expect(record.history.at(-1)?.entry).toMatch(/Connection lost/);

    // Expected: no live bond to Vex. Today: the Item is untouched — still a
    // dangerous bond at 3/10 on the sheet and in CHARACTER STATE.
    const live = readConnections(pc).filter(b => b.name === 'Vex' && !b.completed);
    expect(live).toHaveLength(0);
  });
});
