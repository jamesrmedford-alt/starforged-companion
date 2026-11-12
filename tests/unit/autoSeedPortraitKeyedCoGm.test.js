/**
 * STARFORGED COMPANION
 * tests/unit/autoSeedPortraitKeyedCoGm.test.js
 *
 * Known-issues AUTOSEED-KEYLESS-CANONICAL. With Auto-Seed NPC on at a two-GM
 * table where only the non-canonical GM held an OpenRouter key, a new card
 * got no automatic portrait: the seed runs on the canonical GM (chosen by the
 * Claude key), and its portrait was gated on that client's own OpenRouter
 * key. Issue #342 Z67 fixed the same shape for the ElevenLabs key; this
 * follows it — each GM advertises its OpenRouter key in `artKeyedGmUserIds`
 * (ids only), and a keyless seed asks the lowest-id keyed GM
 * (gmGate.isArtGM) for the portrait over the module socket, who makes it.
 *
 * Driven on a booted table of two GMs and a player: the real seed hook, the
 * real key registries and socket, the image generator's entry point stubbed
 * (recording which client made each portrait).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const art = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../src/art/generator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  generatePortrait: vi.fn(async (hostId, typeKey, record) => {
    art.calls.push({ hostId, typeKey, on: globalThis.game?.user?.id ?? null, source: record?.portraitSourceDescription ?? '' });
    return null;
  }),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  art.calls.length = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    autoSeedConnection: true,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', connectionIds: [] },
  } } });
  for (const id of ['gm-1', 'gm-2', 'pl-1']) await table.client(id).setSetting('openRouterApiKey', '');
  await table.settle();
});

const VANCE = { type: 'connection', name: 'Vance Oduya', description: 'The dockmaster of the Hollow Spire.', confidence: 'high' };
const vance = () => table.actors.find(a => a.name === 'Vance Oduya' && a.flags?.[MODULE_ID]?.entityType === 'connection');
const portraitsOf = (actor) => art.calls.filter(c => c.hostId === actor.id);
const registry = () => table.world.getSetting('artKeyedGmUserIds') ?? [];

async function setOpenRouterKey(id, key) {
  await table.client(id).setSetting('openRouterApiKey', key);
  await table.settle();
}

/** A Make a Connection hit auto-creates Vance on the canonical GM (Gina); the seed hook seeds him. */
async function autoCreate() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts([VANCE], game.settings.get(MODULE_ID, 'campaignState'), { autoCreateConnection: true }));
  await table.drain();
}

describe('AUTOSEED-KEYLESS-CANONICAL — a new card\'s portrait is made where the OpenRouter key lives', () => {
  it('with the key on the co-GM (Gus) only, the new card gets its portrait — made on Gus\'s client', async () => {
    await setOpenRouterKey('gm-2', 'sk-or-gus');
    expect(registry(), 'Gus\'s game told the table it holds the key').toEqual(['gm-2']);

    await autoCreate();

    expect(vance()).toBeTruthy();
    // The canonical GM's seed skipped the portrait: no OpenRouter key on Gina's client.
    expect(portraitsOf(vance())).toHaveLength(1);
    expect(portraitsOf(vance())[0]).toMatchObject({ typeKey: 'connection', on: 'gm-2' });
    expect(portraitsOf(vance())[0].source).toMatch(/dockmaster of the Hollow Spire/);
  });

  it('control: with the key on the canonical GM, the seed makes the portrait there, once', async () => {
    await setOpenRouterKey('gm-1', 'sk-or-gina');
    await autoCreate();
    expect(portraitsOf(vance())).toHaveLength(1);
    expect(portraitsOf(vance())[0].on).toBe('gm-1');
  });

  it('control: with a key on both GMs, one portrait, made by the canonical GM that seeds', async () => {
    await setOpenRouterKey('gm-2', 'sk-or-gus');
    await setOpenRouterKey('gm-1', 'sk-or-gina');
    await autoCreate();
    expect(portraitsOf(vance())).toHaveLength(1);
    expect(portraitsOf(vance())[0].on).toBe('gm-1');
  });

  it('control: with no key anywhere, no portrait is asked for', async () => {
    await autoCreate();
    expect(vance()).toBeTruthy();
    expect(art.calls).toEqual([]);
  });

  it('a GM who clears the key leaves the registry; a player\'s key is never advertised', async () => {
    await setOpenRouterKey('gm-2', 'sk-or-gus');
    await setOpenRouterKey('gm-2', '');
    await setOpenRouterKey('pl-1', 'sk-or-pat');
    expect(registry()).toEqual([]);
  });
});
