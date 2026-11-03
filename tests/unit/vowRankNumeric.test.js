/**
 * A vow's rank as foundry-ironsworn stores it — a ChallengeRank NUMBER
 * (1 troublesome … 5 epic; `fields/ChallengeRank.ts` `_cast` turns "epic"
 * into 5) — pays and reads as that rank (issue #325 W01).
 *
 * The payoff read `item.system.rank` raw into legacyRewardTicks, whose
 * normalizeExpeditionRank knew rank names only: every vow paid a dangerous
 * vow's reward (an epic 2 quests ticks instead of 12, a troublesome 2 instead
 * of 1), and the "New vow recorded" card printed "(3)". The unit fixtures
 * wrote rank names, which hid it. The pipeline's item-only fulfil is covered
 * in vowRankNumericPipeline.test.js.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { payFulfilledVowNative } from '../../src/index.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { legacyRewardTicks, normalizeExpeditionRank } from '../../src/moves/expedition.js';
import { buildPlayerVowSetupHtml, registerPlayerVowHook } from '../../src/session/swearVow.js';

const MODULE_ID = 'starforged-companion';
const legacy = (track) => game.settings.get(MODULE_ID, 'campaignState').legacyTracks?.[track]?.ticks ?? 0;
const flush = () => new Promise(r => setTimeout(r, 0));

describe('legacyRewardTicks reads the vendor\'s numeric rank', () => {
  it('control: the rank name "epic" pays 3 boxes (12 ticks)', () => {
    expect(legacyRewardTicks('epic', 0)).toBe(12);
  });

  it('the numeric epic rank (5) pays 3 boxes too', () => {
    expect(legacyRewardTicks(5, 0)).toBe(12);
  });

  it('a weak hit on a numeric extreme vow (4) pays one rank lower: formidable, 1 box', () => {
    expect(legacyRewardTicks(4, 1)).toBe(4);
  });

  it('a numeric troublesome vow (1) pays 1 tick; a numeric string reads the same', () => {
    expect(legacyRewardTicks(1, 0)).toBe(1);
    expect(legacyRewardTicks('3', 0)).toBe(4);
  });

  it('a number outside 1–5, or none, keeps the dangerous fallback', () => {
    expect(normalizeExpeditionRank(9)).toBe('dangerous');
    expect(normalizeExpeditionRank(0)).toBe('dangerous');
    expect(normalizeExpeditionRank(null)).toBe('dangerous');
    expect(normalizeExpeditionRank('Extreme')).toBe('extreme');
  });
});

describe('a vow fulfilled on the sheet pays its rank\'s quests legacy', () => {
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

  it('a weak hit on a formidable vow (rank 3) pays one rank lower — 2 ticks', async () => {
    pcWithVow(3);
    await payFulfilledVowNative('Bring down the Hegemony', 'weak_hit', { actorId: 'pc-a' });
    expect(legacy('quests')).toBe(2);
  });
});

describe('the "New vow recorded" card names the vow\'s rank', () => {
  beforeEach(() => {
    game.actors._reset();
    ChatMessage._reset();
    game.user.isGM = true;
    game.ready = true;
    game.users._set?.([{ id: 'test-user-gm', isGM: true, active: true }]);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { connectionIds: [] });
    registerPlayerVowHook();
  });

  it('builder: the numeric rank prints as its name', () => {
    const html = buildPlayerVowSetupHtml({ name: 'Find the Wanderer', rank: 3 });
    expect(html).toContain('<em>(formidable)</em>');
    expect(html).not.toContain('<em>(3)</em>');
    expect(html).toContain('Rank formidable');
  });

  it('a sheet-made Formidable vow (rank 3) is posted as "(formidable)", not "(3)"', async () => {
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    game.actors._setAll([kira]);
    const item = { id: 'it-1', name: 'Find the Wanderer', type: 'progress', parent: kira,
      system: { subtype: 'vow', rank: 3, current: 0 }, flags: {} };
    item.setFlag = async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; };

    Hooks.call('createItem', item);
    for (let i = 0; i < 8; i++) await flush();

    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.playerVowCard);
    expect(card).toBeTruthy();
    expect(card.content).toContain('Rank formidable');
    expect(card.content).toContain('<em>(formidable)</em>');
  });
});
