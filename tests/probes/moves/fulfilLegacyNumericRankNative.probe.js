/**
 * PROBE — MC-01 FULFIL-LEGACY-NUMERIC-RANK, the sheet-roll entry point
 * (eighth bug audit, moves-core). See fulfilLegacyNumericRank.probe.js.
 *
 * What the user does: rolls Fulfill Your Vow on an epic vow from the
 * foundry-ironsworn character sheet; the canonical GM's consequence hook pays
 * it through payFulfilledVowNative.
 *
 * What happens: payFulfilledVowCopies reads `item.system.rank` — the vendor's
 * ChallengeRank number, 5 — into legacyRewardTicks, which knows rank names
 * only, and pays a dangerous vow's 2 quests ticks.
 *
 * What should happen: 12 ticks (3 boxes) for an epic vow's strong hit.
 * tests/unit/nativePayoffOnce.test.js uses rank "dangerous", the one rank the
 * bug pays right.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { payFulfilledVowNative } from '../../../src/index.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const legacy = (track) => game.settings.get(MODULE_ID, 'campaignState').legacyTracks?.[track]?.ticks ?? 0;

beforeEach(() => {
  game.actors._reset();
  game.user = { id: 'gm-1', isGM: true, active: true };
  game.users = Object.assign([game.user], { get: (id) => (id === 'gm-1' ? game.user : null) });
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, structuredClone({ ...CampaignStateSchema, currentSessionId: 's1' }));
});

function pcWithVow(rank) {
  const actor = makeTestActor({ id: 'pc-a', name: 'Ash', items: { contents: [] } });
  game.actors._set('pc-a', actor);
  const vow = {
    id: 'v1', name: 'Bring down the Hegemony', type: 'progress',
    system: { subtype: 'vow', rank, current: 40, completed: true },
    flags: { [MODULE_ID]: { vowId: 'v1' } },
    setFlag: async (mod, key, value) => { vow.flags[mod][key] = value; },
  };
  actor.items.contents.push(vow);
  return vow;
}

describe('a vow fulfilled on the sheet pays its rank\'s quests legacy', () => {
  it('control: an epic vow written with the rank name pays 12 ticks', async () => {
    pcWithVow('epic');
    await payFulfilledVowNative('Bring down the Hegemony', 'strong_hit', { actorId: 'pc-a' });
    expect(legacy('quests')).toBe(12);
  });

  it('an epic vow as the system stores it (rank 5) pays 12 ticks', async () => {
    pcWithVow(5);
    await payFulfilledVowNative('Bring down the Hegemony', 'strong_hit', { actorId: 'pc-a' });
    expect(legacy('quests')).toBe(12);
  });

  it('a troublesome vow (rank 1) pays 1 tick, not 2', async () => {
    pcWithVow(1);
    await payFulfilledVowNative('Bring down the Hegemony', 'strong_hit', { actorId: 'pc-a' });
    expect(legacy('quests')).toBe(1);
  });
});
