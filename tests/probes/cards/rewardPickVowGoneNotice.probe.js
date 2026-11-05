/* global makeTestActor */
/**
 * PROBE — CARDS-07 REWARD-PICK-VOW-GONE-NOTICE (tenth audit, area cards)
 *
 * What the user does: a player picks a reward on a "🎁 Choose your reward"
 * card for a vow no character holds any more — the vow Item was deleted
 * from the sheet (or its vowId flag never landed, the createItem hook's
 * swallowed setFlag). The pick lands on the canonical GM.
 *
 * What happens: setSharedVowReward finds no copy and reports "not landed"
 * (issue #329 X07's "no copy counts as not landed"), and
 * applyRewardPickFromRelay (src/session/swearVow.js) whispers the one text
 * it has for any failure: "The reward could not be saved on the vow —
 * nothing was promised. Choose it again." — and re-arms the card. Choosing
 * again fails the same way, forever: the advice is wrong and the real
 * reason (there is no such vow) is never said. The 🤝 Link has the same
 * shape ("Link it again").
 *
 * What should happen: the notice says why — no copy of the vow is held any
 * more — instead of asking for a retry that cannot succeed ("No silent
 * failures": the word to the user names the cause; ERROR-TEXT-BLAMES-KEY
 * is the same rule for a wrong cause).
 *
 * Control: a refused write on a vow that exists is told as "could not be
 * saved … Choose it again" — the retry can succeed.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/rewardPickVowGoneNotice.probe.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyRewardPickFromRelay, applyPlayerVowLinkFromRelay } from '../../../src/session/swearVow.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true, active: true };
const P1 = { id: 'pl-1', isGM: false, active: true };
const P1_CTX = { requesterId: 'pl-1', requester: P1, requesterIsGM: false };
const OPTIONS = [{ description: 'A salvaged jump drive', form: 'gear' }];

function makeCard(id, flags) {
  const msg = {
    id, author: GM,
    flags: { [MODULE_ID]: { ...flags } },
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) msg.flags[MODULE_ID][path.split('.').at(-1)] = val;
    }),
  };
  return msg;
}

function makeVow({ refuse = false } = {}) {
  const item = {
    id: 'v1', name: 'Break the Covenant', type: 'progress',
    system: { subtype: 'vow', rank: 3, current: 16, completed: false },
    flags: { [MODULE_ID]: { vowId: 'v1' } },
  };
  item.setFlag = async (mod, key, val) => {
    if (refuse) throw new Error('the server refused the write');
    (item.flags[mod] ??= {})[key] = val;
  };
  return item;
}

const notices = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.vowWriteRefusedNotice);

beforeEach(() => {
  ChatMessage._reset();
  game.user = GM;
  game.users = Object.assign([GM, P1], { get: (id) => [GM, P1].find(u => u.id === id) ?? null });
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

describe('CARDS-07 a reward pick or a Link for a vow no character holds', () => {
  it('the reward notice says the vow is gone, not "Choose it again"', async () => {
    game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [makeVow()] } }));
    const card = makeCard('reward-gone', { rewardChoiceCard: true, vowId: 'v-deleted', rewardOptions: OPTIONS });
    game.messages = { get: (id) => (id === card.id ? card : null) };

    const res = await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, P1_CTX);
    expect(res).toEqual({ applied: false, reason: 'write-refused' });
    expect(notices()).toHaveLength(1);
    // Expected: the cause — no copy of the vow is held any more. Actual: "could not be saved … Choose it again."
    expect(notices()[0].content).not.toMatch(/Choose it again/);
    expect.soft(notices()[0].content).toMatch(/no longer|not found|gone|no vow|deleted/i);
  });

  it('the Link notice says the vow is gone, not "Link it again"', async () => {
    game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [makeVow()] } }));
    const card = makeCard('vow-gone', { playerVowCard: true, vowName: 'Break the Covenant', vowId: 'v-deleted' });
    game.messages = { get: (id) => (id === card.id ? card : null) };

    const res = await applyPlayerVowLinkFromRelay({ messageId: card.id, connectionName: 'Sable' }, P1_CTX);
    expect(res).toEqual({ applied: false, reason: 'write-refused' });
    expect(notices()).toHaveLength(1);
    expect(notices()[0].content).not.toMatch(/Link it again/);
  });

  it('control: a refused write on a vow that exists is told as a save failure to retry', async () => {
    game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [makeVow({ refuse: true })] } }));
    const card = makeCard('reward-refused', { rewardChoiceCard: true, vowId: 'v1', rewardOptions: OPTIONS });
    game.messages = { get: (id) => (id === card.id ? card : null) };

    const res = await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, P1_CTX);
    expect(res).toEqual({ applied: false, reason: 'write-refused' });
    expect(notices()[0].content).toMatch(/could not be saved/);
    expect(notices()[0].whisper.sort()).toEqual(['gm-1', 'pl-1']);
  });
});
