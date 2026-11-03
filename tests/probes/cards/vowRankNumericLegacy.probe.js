/**
 * PROBE — IC VOW-RANK-NUMERIC-LEGACY
 *
 * What the user does: fulfils a vow that is not Dangerous — rolled on the
 * foundry-ironsworn sheet (the native consequence hook → payFulfilledVowNative)
 * or through the move pipeline (a "Which vow?" pick, "🏁 Attempt to Fulfill",
 * typed narration → the fulfil branch → completeVowItemByName).
 *
 * What happens: foundry-ironsworn's ProgressModel stores `system.rank` as a
 * ChallengeRank NUMBER (vendor/foundry-ironsworn/src/module/fields/ChallengeRank.ts
 * casts "epic" → 5; issue #321 U62 fixed readVows for this). The payoffs read
 * the raw Item rank and hand it to legacyRewardTicks (src/moves/expedition.js),
 * whose normalizeExpeditionRank only knows rank NAMES: "5" falls back to
 * "dangerous". Every fulfilled vow pays the Dangerous Quests legacy (2 ticks,
 * 1 on a weak hit) — an Epic vow 2 instead of 12. On the pipeline path the
 * same numeric rank reaches postFulfillVowCard, whose `track.rank.charAt`
 * throws: the "⚑ Vow Fulfilled" card is never posted.
 *
 * What should happen: the legacy is the vow's own rank's (Epic strong hit →
 * 12 ticks — play kit "Earn Experience": 1 tick troublesome … 3 boxes epic),
 * and the pipeline posts its fulfil card.
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
  const actor = makeTestActor({ id: 'pc-a', name: 'Kira', items: { contents: [] } });
  game.actors._set('pc-a', actor);
  const vow = {
    id: 'v1', name: 'Avenge Kade', type: 'progress',
    // A vow fulfilled on the sheet: completed, its rank as the vendor stores it.
    system: { subtype: 'vow', rank, current: 40, completed: true },
    flags: { [MODULE_ID]: { vowId: 'v1' } },
    setFlag: async (mod, key, value) => { (vow.flags[mod] ??= {})[key] = value; },
  };
  actor.items.contents.push(vow);
  return vow;
}

describe('PROBE IC VOW-RANK-NUMERIC-LEGACY — the Quests legacy follows the vow\'s rank', () => {
  it('an Epic vow (stored rank 5) fulfilled on the sheet pays 12 Quests ticks', async () => {
    pcWithVow(5);
    await payFulfilledVowNative('Avenge Kade', 'strong_hit', { actorId: 'pc-a' });
    expect(legacy('quests')).toBe(12);
  });

  it('a Formidable vow (stored rank 3) fulfilled with a weak hit pays one rank lower — 2 ticks, Dangerous', async () => {
    pcWithVow(3);
    await payFulfilledVowNative('Avenge Kade', 'weak_hit', { actorId: 'pc-a' });
    expect(legacy('quests')).toBe(2);
  });

  it('a Troublesome vow (stored rank 1) pays 1 tick', async () => {
    pcWithVow(1);
    await payFulfilledVowNative('Avenge Kade', 'strong_hit', { actorId: 'pc-a' });
    expect(legacy('quests')).toBe(1);
  });

  it('control: the same vow with a rank NAME (as unit fixtures write it) pays 12', async () => {
    pcWithVow('epic');
    await payFulfilledVowNative('Avenge Kade', 'strong_hit', { actorId: 'pc-a' });
    expect(legacy('quests')).toBe(12);
  });
});
