/* global makeTestActor */
/**
 * PROBE — CARDS-02 REWARD-LINK-REFUSED-WRITE (ninth audit, area cards)
 *
 * What the user does: picks a reward on the "🎁 Choose your reward" card, or
 * links the vow to a connection with 🤝 Link on the "🆕 New vow recorded"
 * card. The canonical GM applies the pick (gmRelay "vow.reward" →
 * applyRewardPickFromRelay; "vow.link" → applyPlayerVowLinkFromRelay), each
 * claiming the GM-authored card first (issue #325 W11).
 *
 * What happens: the write after the claim is not checked. setSharedVowReward
 * returns false when a copy's flag write is refused (src/character/
 * actorBridge.js:629-653) and setVowLinkedConnection swallows a refusal into
 * a console.warn (:655-677); applyRewardPickFromRelay (src/session/
 * swearVow.js:566-570) and applyPlayerVowLinkFromRelay (:884-888) ignore the
 * result and post "🎁 Reward set" / "🤝 Linked … fulfilling this vow will
 * deepen that bond" anyway, with the card claimed (`rewardChosen` /
 * `linkedConnection`) so every client's buttons stay disabled. The vow holds
 * no reward (so the fulfilment grants none, and says only "no reward was
 * chosen") and no link (so nothing is deepened) — and nobody is told.
 *
 * What should happen: a refused effect after a claim is never reported as
 * landed (decisions.md "No silent failures"; the #309 N07 / #311 P06 shape:
 * a write refused after the claim goes on the GMs' payoff card with a Retry,
 * or the claim is released so the press can be made again). The success card
 * must not post.
 *
 * Controls: with the writes accepted, each handler claims the card, writes
 * the vow and posts its card once.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/rewardLinkRefusedWrite.probe.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyRewardPickFromRelay, applyPlayerVowLinkFromRelay } from '../../../src/session/swearVow.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('CARDS-02 a reward pick whose vow write is refused', () => {
  it('does not say "Reward set", and the pick is not silently spent', async () => {
    vow = makeVow({ refuse: true });
    addKira(vow);
    const card = makeCard('reward-1', { rewardChoiceCard: true, vowId: 'v1', rewardOptions: OPTIONS });
    game.messages = { get: (id) => (id === card.id ? card : null) };

    const res = await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, GM_CTX);

    expect(vow.flags[MODULE_ID].reward).toBeUndefined();                       // nothing landed (the write was refused)
    // Today: "🎁 Reward set: A salvaged jump drive" is posted and the card is claimed.
    expect.soft(cards(f => f.rewardSetCard)).toHaveLength(0);
    expect.soft(res.applied).toBe(false);
    const claimed = card.flags[MODULE_ID].rewardChosen === true;
    const reported = cards(f => f.payoffFailureCard).length > 0;
    expect.soft(!claimed || reported).toBe(true);                             // released, or the GMs told with a Retry
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

describe('CARDS-02 a 🤝 Link whose vow write is refused', () => {
  it('does not say "Linked", and the link is not silently spent', async () => {
    vow = makeVow({ refuse: true });
    addKira(vow);
    const card = makeCard('player-vow-1', { playerVowCard: true, vowName: 'Break the Covenant', vowId: 'v1' });
    game.messages = { get: (id) => (id === card.id ? card : null) };

    const res = await applyPlayerVowLinkFromRelay({ messageId: card.id, connectionName: 'Sable' }, GM_CTX);

    expect(vow.flags[MODULE_ID].linkedConnectionName).toBeUndefined();
    // Today: "🤝 Linked to Sable — fulfilling this vow will deepen that bond" is posted, the card claimed.
    expect.soft(cards(f => f.vowLinkedCard)).toHaveLength(0);
    expect.soft(res.applied).toBe(false);
    const claimed = !!card.flags[MODULE_ID].linkedConnection;
    const reported = cards(f => f.payoffFailureCard).length > 0;
    expect.soft(!claimed || reported).toBe(true);
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
