/**
 * STARFORGED COMPANION
 * tests/unit/bondItemRename.test.js
 *
 * Known-issues BOND-ITEM-NAME-STALE (mirror drift). A connection's record is
 * canonical and each PC's bond Item its write-through mirror (ticks, rank,
 * loss, forge — connection-flow.md). A rename — `updateConnection` (a
 * placeholder revealed by narration, an X-Card's undo of it) or the GM
 * renaming the NPC card in the sidebar (`syncEntityRecordNameOnUpdate`) —
 * renamed the record and the card but not the Items: the vendor Connections
 * tab and CHARACTER STATE kept the old name. The Items `bondItemsFor` finds
 * (by the record's id, else an unkeyed Item by the OLD name) now take the new
 * name in the same write.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/moves/interpreter.js', () => ({ interpretMove: vi.fn() }));
vi.mock('../../src/pacing/router.js', () => ({ routePacedInput: vi.fn() }));

import { updateConnection } from '../../src/entities/connection.js';
import { syncEntityRecordNameOnUpdate } from '../../src/index.js';

const MODULE_ID = 'starforged-companion';

function bondItem(id, name, connectionId) {
  const item = {
    id, name, type: 'progress',
    system: { subtype: 'bond', rank: 'dangerous', current: 8, completed: false },
    flags: { [MODULE_ID]: connectionId ? { connectionId } : {} },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split('.');
        let at = item;
        for (const p of parts.slice(0, -1)) at = (at[p] ??= {});
        at[parts.at(-1)] = v;
      }
      return item;
    },
  };
  return item;
}

function npcCard(id, name) {
  const actor = makeTestActor({
    id, name, type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: `rec-${id}`, name, rank: 'dangerous', active: true, history: [] } } },
  });
  actor.getFlag = (mod, key) => actor.flags[mod]?.[key];
  actor.setFlag = async (mod, key, value) => { (actor.flags[mod] ??= {})[key] = value; };
  game.actors._set(id, actor);
  return actor;
}

let kirasBond, rensBond, otherSable;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise(r => setTimeout(r, 0)); };

beforeEach(() => {
  game.actors._reset();
  game.user = { isGM: true, id: 'test-user-gm' };
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  npcCard('npc-sable', 'Sable');
  npcCard('npc-sable2', 'Sable');
  kirasBond  = bondItem('b-kira', 'Sable', 'rec-npc-sable');            // keyed to the record
  rensBond   = bondItem('b-ren', 'Sable', null);                         // seeded before the key existed
  otherSable = bondItem('b-other', 'Sable', 'rec-npc-sable2');          // keyed to the other Sable
  game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [kirasBond, otherSable] } }));
  game.actors._set('pc-ren',  makeTestActor({ id: 'pc-ren',  name: 'Ren',  items: { contents: [rensBond] } }));
});

describe('a connection\'s rename reaches the PCs\' bond Items (BOND-ITEM-NAME-STALE)', () => {
  it('updateConnection: the keyed Item and an unkeyed one of the old name take the new name', async () => {
    await updateConnection('npc-sable', { name: 'Vex' });

    expect(kirasBond.name).toBe('Vex');
    expect(rensBond.name).toBe('Vex');
    expect(otherSable.name).toBe('Sable');                              // another connection's Item, keyed to it
  });

  it('a sidebar rename of the NPC card: the record, then its bond Items', async () => {
    const card = game.actors.get('npc-sable');
    card.name = 'Vex';                                                   // Foundry applies the change before updateActor fires

    syncEntityRecordNameOnUpdate(card, { name: 'Vex' }, {}, 'test-user-gm');
    await flush();

    expect(card.flags[MODULE_ID].connection.name).toBe('Vex');
    expect(kirasBond.name).toBe('Vex');
    expect(otherSable.name).toBe('Sable');
  });

  it('control: an update that does not rename leaves the Items\' names', async () => {
    await updateConnection('npc-sable', { rank: 'formidable' });

    expect(kirasBond.name).toBe('Sable');
    expect(rensBond.name).toBe('Sable');
  });
});
