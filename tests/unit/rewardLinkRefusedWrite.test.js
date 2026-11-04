/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/rewardLinkRefusedWrite.test.js
 *
 * Issue #329 X07 (REWARD-LINK-REFUSED-WRITE) — a reward pick or a 🤝 Link
 * whose vow write the world refused is not reported as landed.
 *
 * The reward-choice card and the player-vow card's Link claim the GM-authored
 * card first (issue #325 W11); the write after the claim went unchecked:
 * setSharedVowReward's false and setVowLinkedConnection's swallowed refusal
 * were ignored, "🎁 Reward set" / "🤝 Linked …" posted and the card stayed
 * claimed — the vow held no reward (the fulfilment granted none) or no link
 * (nothing deepened), with no retry and no word to anyone. Now a write that
 * does not land — refused, or no copy of the vow to hold it — releases the
 * claim, posts no success card and whispers the presser and the GMs.
 *
 * (Converted from the ninth audit's probes
 * tests/probes/cards/rewardLinkRefusedWrite.probe.js and
 * tests/probes/sweep/claimBeforeRefusedWrite.probe.js.)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyRewardPickFromRelay, applyPlayerVowLinkFromRelay } from '../../src/session/swearVow.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true, active: true };
const GM_CTX = { requesterId: 'gm-1', requester: GM, requesterIsGM: true };
const OPTIONS = [
  { description: 'A salvaged jump drive', form: 'gear' },
  { description: 'Fresh supplies from the relay', form: 'supply' },
];

function makeCard(id, flags) {
  const msg = {
    id, author: GM,
    flags: { [MODULE_ID]: { ...flags } },
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        const parts = path.split('.').slice(2);
        let cur = msg.flags[MODULE_ID];
        for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {});
        cur[parts[parts.length - 1]] = val;
      }
    }),
  };
  return msg;
}

/** A vow Item whose flag writes are refused by the world when `refuse` is set. */
function makeVow({ refuse = false } = {}) {
  const item = {
    id: 'v1', name: 'Break the Covenant', type: 'progress',
    system: { subtype: 'vow', rank: 3, current: 16, completed: false },
    flags: { [MODULE_ID]: { vowId: 'v1' } },
  };
  item.setFlag = async (mod, key, val) => {
    if (refuse) throw new Error(`Item [v1] flag ${key}: the server refused the write`);
    (item.flags[mod] ??= {})[key] = val;
  };
  return item;
}

const cards = (pred) => ChatMessage._created.filter(m => pred(m.flags?.[MODULE_ID] ?? {}));
let vow;

beforeEach(() => {
  ChatMessage._reset();
  game.user = GM;
  game.users = Object.assign([GM], { get: (id) => (id === 'gm-1' ? GM : null) });
  game.settings._store.clear();
  const sable = makeTestActor({
    id: 'conn-sable', name: 'Sable', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-sable', name: 'Sable', rank: 'dangerous', relationshipTicks: 0, bonded: false, active: true, history: [],
    } } },
  });
  game.actors._setAll([sable]);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { ...CampaignStateSchema, connectionIds: ['conn-sable'] });
});

function addKira(vowItem) {
  const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [vowItem] } });
  game.actors._set('pc-kira', kira);
  return kira;
}

describe('issue #329 X07 — a reward pick whose vow write is refused', () => {
  it('does not say "Reward set", and the pick is not silently spent', async () => {
    vow = makeVow({ refuse: true });
    addKira(vow);
    const card = makeCard('reward-1', { rewardChoiceCard: true, vowId: 'v1', rewardOptions: OPTIONS });
    game.messages = { get: (id) => (id === card.id ? card : null) };

    const res = await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, GM_CTX);

    expect(vow.flags[MODULE_ID].reward).toBeUndefined();                       // nothing landed (the write was refused)
    // No "🎁 Reward set", the claim released for another pick, and the presser told.
    expect(cards(f => f.rewardSetCard)).toHaveLength(0);
    expect(res).toEqual({ applied: false, reason: 'write-refused' });
    expect(card.flags[MODULE_ID].rewardChosen ?? null).toBeNull();
    const notice = cards(f => f.vowWriteRefusedNotice);
    expect(notice).toHaveLength(1);
    expect(notice[0].whisper).toEqual(['gm-1']);
    expect(notice[0].content).toMatch(/could not be saved/);
  });

  it('a pick for a vow no character holds any more is not reported as set', async () => {
    addKira(makeVow());
    const card = makeCard('reward-3', { rewardChoiceCard: true, vowId: 'v-gone', rewardOptions: OPTIONS });
    game.messages = { get: (id) => (id === card.id ? card : null) };
    const res = await applyRewardPickFromRelay({ messageId: card.id, idx: 1 }, GM_CTX);
    expect(res).toEqual({ applied: false, reason: 'write-refused' });
    expect(cards(f => f.rewardSetCard)).toHaveLength(0);
  });

  it('a player\'s pick that is refused is whispered to them and the GMs', async () => {
    vow = makeVow({ refuse: true });
    addKira(vow);
    const card = makeCard('reward-4', { rewardChoiceCard: true, vowId: 'v1', rewardOptions: OPTIONS });
    game.messages = { get: (id) => (id === card.id ? card : null) };
    await applyRewardPickFromRelay({ messageId: card.id, own: 'A favour from the dockmaster' },
      { requesterId: 'pl-1', requester: { id: 'pl-1', isGM: false }, requesterIsGM: false });
    expect(cards(f => f.vowWriteRefusedNotice)[0].whisper.sort()).toEqual(['gm-1', 'pl-1']);
  });

  it('control: an accepted write promises the reward once and says so', async () => {
    vow = makeVow();
    addKira(vow);
    const card = makeCard('reward-2', { rewardChoiceCard: true, vowId: 'v1', rewardOptions: OPTIONS });
    game.messages = { get: (id) => (id === card.id ? card : null) };

    const res = await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, GM_CTX);
    expect(res.applied).toBe(true);
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised', description: 'A salvaged jump drive' });
    expect(card.flags[MODULE_ID].rewardChosen).toBe(true);
    expect(cards(f => f.rewardSetCard)).toHaveLength(1);
  });
});

describe('issue #329 X07 — a 🤝 Link whose vow write is refused', () => {
  it('does not say "Linked", and the link is not silently spent', async () => {
    vow = makeVow({ refuse: true });
    addKira(vow);
    const card = makeCard('player-vow-1', { playerVowCard: true, vowName: 'Break the Covenant', vowId: 'v1' });
    game.messages = { get: (id) => (id === card.id ? card : null) };

    const res = await applyPlayerVowLinkFromRelay({ messageId: card.id, connectionName: 'Sable' }, GM_CTX);

    expect(vow.flags[MODULE_ID].linkedConnectionName).toBeUndefined();
    // No "🤝 Linked to Sable", the claim released, the presser told.
    expect(cards(f => f.vowLinkedCard)).toHaveLength(0);
    expect(res).toEqual({ applied: false, reason: 'write-refused' });
    expect(card.flags[MODULE_ID].linkedConnection ?? null).toBeNull();
    expect(cards(f => f.vowWriteRefusedNotice)).toHaveLength(1);
  });

  it('control: an accepted write links the vow once and says so', async () => {
    vow = makeVow();
    addKira(vow);
    const card = makeCard('player-vow-2', { playerVowCard: true, vowName: 'Break the Covenant', vowId: 'v1' });
    game.messages = { get: (id) => (id === card.id ? card : null) };

    const res = await applyPlayerVowLinkFromRelay({ messageId: card.id, connectionName: 'Sable' }, GM_CTX);
    expect(res.applied).toBe(true);
    expect(vow.flags[MODULE_ID].linkedConnectionName).toBe('Sable');
    expect(card.flags[MODULE_ID].linkedConnection).toBe('Sable');
    expect(cards(f => f.vowLinkedCard)).toHaveLength(1);
  });
});
