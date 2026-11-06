/**
 * Two keyed GMs loading at once both stay in the keyed-GM registry (issue #342
 * Z68, KEYED-GM-REGISTRY-LOST-UPDATE).
 *
 * The keyed-GM registry (`keyedGmUserIds`, a world setting of GM user ids) is
 * written by every keyed GM at `ready` (advertiseClaudeKeyPresence,
 * src/multiplayer/gmGate.js): read the list, write `[...ids, self]`. Two GMs
 * who load at once — the session's start, both pressing Join — each read the
 * list before the other's write lands, and the later write dropped the
 * earlier GM's id. Nothing re-advertised it: the next advertise was the next
 * load, and re-saving the same key runs no onChange (decisions: Y40's
 * "reload"). While the listed GM stayed the table routed correctly; once that
 * GM left, the registry named no active GM, so hasKeyedActiveGM() was false
 * with a keyed GM at the table: RUN_ON.CLAUDE commands (`@scene`, `!recap`,
 * `!incite`) ran on the typist's key or failed, oracle follow-ups narrated on
 * the author's client, Batch Mode said "No GM with a Claude key is connected".
 * Every GM now re-advertises on hearing a registry write
 * (registerKeyRegistryHealing): a write only when the list misstates it, so
 * the registry converges. The ElevenLabs-key registry (issue #342 Z67) heals
 * the same way.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { holdWrites } from '../helpers/faults.js';

const KEYS = {
  'gm-1': { claudeApiKey: 'sk-ant-gina', elevenLabsApiKey: 'sk_el_gina' },
  'gm-2': { claudeApiKey: 'sk-ant-gus',  elevenLabsApiKey: 'sk_el_gus' },
};
let table = null;

afterEach(async () => {
  await table?.teardown();
  table = null;
});

const registryWrite = (client, key = 'keyedGmUserIds') => (w) =>
  w.kind === 'setting' && w.key === `${MODULE_ID}.${key}` && w.client === client;

async function hasKeyedActiveGMOn(id) {
  const c = table.client(id);
  const gate = await c.import('../../src/multiplayer/gmGate.js');
  return c.run(() => gate.hasKeyedActiveGM());
}

/** Gina's first write to `key` is still in flight when Gus loads; then it lands, last. */
async function loadTogether(key) {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1], boot: false, clientSettings: KEYS });
  const held = holdWrites(table, registryWrite('gm-1', key));
  await table.client('gm-1').boot();          // reads [], writes [gm-1] — in flight
  await held.arrived;
  await table.client('gm-2').boot();          // reads [] too, writes [gm-2]
  held.release();                             // Gina's [gm-1] lands last
  await table.settle();
  await table.client('pl-1').boot();
  await table.settle();
}

describe('two keyed GMs loading at once', () => {
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
    await loadTogether('keyedGmUserIds');

    // Only Gina was listed: her late write dropped Gus.
    expect([...table.world.getSetting('keyedGmUserIds')].sort()).toEqual(['gm-1', 'gm-2']);
    // And the consequence: with Gina gone, the table still has a keyed GM.
    await table.leave('gm-1');
    expect(await hasKeyedActiveGMOn('pl-1')).toBe(true);
  }, 30_000);

  it('the ElevenLabs-key registry heals the same way', async () => {
    await loadTogether('audioKeyedGmUserIds');

    expect([...table.world.getSetting('audioKeyedGmUserIds')].sort()).toEqual(['gm-1', 'gm-2']);
    expect([...table.world.getSetting('keyedGmUserIds')].sort()).toEqual(['gm-1', 'gm-2']);
  }, 30_000);

  it('the healing converges: a registry write that leaves every GM rightly listed starts no other', async () => {
    await loadTogether('keyedGmUserIds');
    const writes = [];
    table.interceptWrites(async (w) => {
      if (w.kind === 'setting' && w.key === `${MODULE_ID}.keyedGmUserIds`) writes.push(w.client);
      return undefined;
    });

    // A GM rewrites the list with both ids, in another order: nobody's entry is wrong.
    await table.client('gm-2').setSetting('keyedGmUserIds', ['gm-2', 'gm-1']);
    await table.settle();

    expect(writes).toEqual(['gm-2']);   // its own write, and no answering one
    expect([...table.world.getSetting('keyedGmUserIds')].sort()).toEqual(['gm-1', 'gm-2']);
  }, 30_000);

  it('a GM wrongly listed without a key takes itself out when it hears the registry change', async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1], boot: false,
      clientSettings: { 'gm-1': KEYS['gm-1'], 'gm-2': { claudeApiKey: '' } } });
    await table.client('gm-1').boot();
    await table.client('gm-2').boot();
    await table.settle();
    expect(table.world.getSetting('keyedGmUserIds')).toEqual(['gm-1']);

    // A stale write lists the keyless Gus (the mirror case: a key cleared while another was added).
    await table.client('gm-1').setSetting('keyedGmUserIds', ['gm-1', 'gm-2']);
    await table.settle();

    expect(table.world.getSetting('keyedGmUserIds')).toEqual(['gm-1']);
  }, 30_000);
});
