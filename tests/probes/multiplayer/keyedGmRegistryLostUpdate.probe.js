/**
 * Eleventh audit — multiplayer probe (MP-7).
 *
 * The keyed-GM registry (`keyedGmUserIds`, a world setting of GM user ids) is
 * written by every keyed GM at `ready` (advertiseClaudeKeyPresence,
 * src/multiplayer/gmGate.js): read the list, write `[...ids, self]`. Two GMs
 * who load at once — the session's start, both pressing Join — each read the
 * list before the other's write lands, and the later write drops the earlier
 * GM's id. Nothing re-advertises it: the next advertise is the next load, and
 * re-saving the same key runs no onChange (decisions: Y40's "reload"). While
 * the listed GM is connected the table routes correctly (the pipeline runs on
 * a keyed GM); once that GM leaves, the registry names no active GM, so
 * hasKeyedActiveGM() is false with a keyed GM at the table: RUN_ON.CLAUDE
 * commands (`@scene`, `!recap`, `!incite`) run on the typist's key or fail,
 * oracle follow-ups narrate on the author's client, Batch Mode says "No GM
 * with a Claude key is connected, so the round can't be read".
 *
 * Correct: both keyed GMs are in the registry however their loads interleave.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { holdWrites } from '../../helpers/faults.js';

const KEYS = { 'gm-1': { claudeApiKey: 'sk-ant-gina' }, 'gm-2': { claudeApiKey: 'sk-ant-gus' } };
let table = null;

afterEach(async () => {
  await table?.teardown();
  table = null;
});

const registryWrite = (client) => (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.keyedGmUserIds` && w.client === client;

async function hasKeyedActiveGMOn(id) {
  const c = table.client(id);
  const gate = await c.import('../../src/multiplayer/gmGate.js');
  return c.run(() => gate.hasKeyedActiveGM());
}

describe('MP-7 — two keyed GMs loading at once', () => {
  it('control: loaded one after the other, both are registered, and Gus is keyed once Gina leaves', async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1], boot: false, clientSettings: KEYS });
    await table.client('gm-1').boot();
    await table.client('gm-2').boot();
    await table.client('pl-1').boot();
    expect([...table.world.getSetting('keyedGmUserIds')].sort()).toEqual(['gm-1', 'gm-2']);
    await table.leave('gm-1');
    expect(await hasKeyedActiveGMOn('gm-2')).toBe(true);
  }, 30_000);

  it('Gina\'s registry write still in flight when Gus loads: both stay registered', async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1], boot: false, clientSettings: KEYS });
    const held = holdWrites(table, registryWrite('gm-1'));
    await table.client('gm-1').boot();          // reads [], writes [gm-1] — in flight
    await held.arrived;
    await table.client('gm-2').boot();          // reads [] too, writes [gm-2]
    held.release();                             // Gina's [gm-1] lands last
    await table.settle();
    await table.client('pl-1').boot();

    // Correct: both keyed GMs are listed. Today only Gina is.
    expect([...table.world.getSetting('keyedGmUserIds')].sort()).toEqual(['gm-1', 'gm-2']);
    // And the consequence: with Gina gone, the table still has a keyed GM.
    await table.leave('gm-1');
    expect(await hasKeyedActiveGMOn('pl-1')).toBe(true);
  }, 30_000);
});
