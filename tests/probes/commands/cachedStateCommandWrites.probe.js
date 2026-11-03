/**
 * PROBE — COMMAND-CACHED-STATE-MUTATION (eighth audit, area index-commands-hooks)
 *
 * rules/foundry-api.md: `game.settings.get` returns an object setting's cached
 * value by reference — set nothing on it before a write that can fail (the
 * issue #321 U58 / #302 shape; U58 fixed `!at` and `!sector <name>` beside
 * these). Three more writers in this area still mutate the cached
 * campaignState and then write it:
 *
 *   - `!pace hot|quiet|clear` — handlePaceCommand (src/index.js ~3230) hands
 *     the cached object to applyPaceCommand (src/pacing/router.js ~305), which
 *     sets `pacing.sceneOverride` on it; `persist` swallows a refused write
 *     (console.warn only), so the card still says "Pacing override set to hot".
 *   - `!roll` — handleRollCommand (src/index.js ~5534) → markForceNextAsMove
 *     sets `pacing.forceNextAsMove` on the cached object; same swallow, the
 *     card still says the next input will route to the move interpreter.
 *   - the oracle-memory capture hook (src/index.js ~3517) — recordOracleResult
 *     pushes onto the cached `recentOracles` before its write.
 *
 * What the user sees after a refused write: the card claims the change; the
 * typing GM's client holds it (its own pipeline honours it) while the world
 * and every other client do not — until any later world write replaces the
 * cache and it silently vanishes, or the GM's next whole-object write carries
 * it into the world after all.
 *
 * Correct behaviour (asserted): after a refused write this client's cache
 * still equals the world, and the card does not claim the change.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/commands/cachedStateCommandWrites.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
  } } } });
});

/** Refuse every campaignState write the GM's client makes (a server error, a dropped socket). */
function refuseGmCampaignStateWrites() {
  table.interceptWrites(w => (w.kind === 'setting' && w.key === KEY && w.client === 'gm-1')
    ? new Error('Setting [campaignState] could not be saved: the server refused the write')
    : undefined);
}

const gmCache = () => table.client('gm-1').getSetting('campaignState');
const world   = () => table.world.campaignState();

describe('PROBE COMMAND-CACHED-STATE-MUTATION', () => {
  it('!pace hot: a refused write leaves no override in the GM\'s cache, and the card does not claim one', async () => {
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('!pace hot');
    await table.settle();

    expect(world().pacing?.sceneOverride ?? null).toBeNull();
    // Expected: null (the cache equals the world). Today: { modifier: 3, … }.
    expect(gmCache().pacing?.sceneOverride ?? null).toBeNull();
    const card = table.cards(f => f.paceCommandCard).at(-1);
    expect(card.content).not.toMatch(/override set to/i);
  }, 30_000);

  it('!roll: a refused write leaves no force flag in the GM\'s cache, and the card does not claim one', async () => {
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('!roll');
    await table.settle();

    expect(world().pacing?.forceNextAsMove ?? false).toBe(false);
    // Expected: false. Today: true on the GM only.
    expect(gmCache().pacing?.forceNextAsMove ?? false).toBe(false);
    const card = table.cards(f => f.rollCommandCard).at(-1);
    expect(card.content).not.toMatch(/will route to the move interpreter/i);
  }, 30_000);

  it('oracle memory: a refused capture leaves the GM\'s cached recentOracles equal to the world\'s', async () => {
    refuseGmCampaignStateWrites();
    await table.client('pl-1').chat('!oracle yes likely is the hatch sealed');
    await table.settle();

    expect(world().recentOracles ?? []).toEqual([]);
    // Expected: [] (as the world). Today: the GM's cache holds the result.
    expect(gmCache().recentOracles ?? []).toEqual([]);
  }, 30_000);

  it('control: without a refusal each lands in the world', async () => {
    await table.client('gm-1').chat('!pace hot');
    await table.settle();
    expect(world().pacing?.sceneOverride?.modifier).toBe(3);
  }, 30_000);
});
