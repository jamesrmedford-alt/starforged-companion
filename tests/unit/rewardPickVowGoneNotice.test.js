/* global makeTestActor */
/**
 * Issue #336 Y27 — REWARD-PICK-VOW-GONE-NOTICE.
 *
 * A reward pick (🎁) or a 🤝 Link for a vow no character holds any more — the
 * vow Item deleted from the sheet, or its vowId flag never landed — was
 * whispered issue #329 X07's one text: "The reward could not be saved on the
 * vow — nothing was promised. Choose it again." / "… Link it again.", and the
 * card re-armed: a retry that can never succeed, the cause never said.
 * setSharedVowReward / setVowLinkedConnection folded "no copy" and "refused"
 * into one `false`. They now report `{ ok, reason: "refused" | "no-copy" }`,
 * and the notice is worded by reason: a vow nobody holds closes the card
 * ("No character holds this vow any more …"); a refused write is still the
 * retryable "could not be saved".
 *
 * Control: a refused write on a vow that exists is told as a save failure to
 * retry, whispered to the presser and the GM.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyRewardPickFromRelay, applyPlayerVowLinkFromRelay } from '../../src/session/swearVow.js';
import { setSharedVowReward, setVowLinkedConnection } from '../../src/character/actorBridge.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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
const onTheTable = (card) => { game.messages = { get: (id) => (id === card.id ? card : null) }; return card; };

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

describe('issue #336 Y27 — the vow writers say why a write did not land', () => {
  it('setSharedVowReward / setVowLinkedConnection report "no-copy", "refused" or ok', async () => {
    game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [makeVow()] } }));
    expect(await setSharedVowReward('v-deleted', OPTIONS[0])).toEqual({ ok: false, reason: 'no-copy' });
    expect(await setVowLinkedConnection('v-deleted', 'Sable')).toEqual({ ok: false, reason: 'no-copy' });
    expect(await setSharedVowReward('v1', OPTIONS[0])).toEqual({ ok: true });
    expect(await setVowLinkedConnection('v1', 'Sable')).toEqual({ ok: true });

    game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [makeVow({ refuse: true })] } }));
    expect(await setSharedVowReward('v1', OPTIONS[0])).toEqual({ ok: false, reason: 'refused' });
    expect(await setVowLinkedConnection('v1', 'Sable')).toEqual({ ok: false, reason: 'refused' });
  });
});

describe('issue #336 Y27 — a reward pick or a Link for a vow no character holds', () => {
  it('the reward notice says no character holds the vow, and the card is closed', async () => {
    game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [makeVow()] } }));
    const card = onTheTable(makeCard('reward-gone', { rewardChoiceCard: true, vowId: 'v-deleted', rewardOptions: OPTIONS }));

    const res = await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, P1_CTX);
    expect(res).toEqual({ applied: false, reason: 'no-copy' });
    expect(notices()).toHaveLength(1);
    expect(notices()[0].content).not.toMatch(/Choose it again/);
    expect(notices()[0].content).toMatch(/No character holds this vow any more — nothing to promise; the card is closed\./);
    expect(notices()[0].whisper.sort()).toEqual(['gm-1', 'pl-1']);
    expect(card.flags[MODULE_ID].rewardChosen).toBe('no-vow');                 // closed, not released

    expect(await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, P1_CTX))
      .toEqual({ applied: false, reason: 'already-chosen' });
    expect(notices()).toHaveLength(1);
  });

  it('the Link notice says no character holds the vow, and the Link is closed', async () => {
    game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [makeVow()] } }));
    const card = onTheTable(makeCard('vow-gone', { playerVowCard: true, vowName: 'Break the Covenant', vowId: 'v-deleted' }));

    const res = await applyPlayerVowLinkFromRelay({ messageId: card.id, connectionName: 'Sable' }, P1_CTX);
    expect(res).toEqual({ applied: false, reason: 'no-copy' });
    expect(notices()).toHaveLength(1);
    expect(notices()[0].content).not.toMatch(/Link it again/);
    expect(notices()[0].content).toMatch(/No character holds this vow any more — nothing to link; the card is closed\./);
    // Closed — and not claiming a link the vow never took.
    expect(card.flags[MODULE_ID]).toMatchObject({ vowGone: true, linkedConnection: null });

    expect(await applyPlayerVowLinkFromRelay({ messageId: card.id, connectionName: 'Sable' }, P1_CTX))
      .toEqual({ applied: false, reason: 'no-copy' });
    expect(notices()).toHaveLength(1);
  });

  it('control: a refused write on a vow that exists is told as a save failure to retry', async () => {
    game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [makeVow({ refuse: true })] } }));
    const card = onTheTable(makeCard('reward-refused', { rewardChoiceCard: true, vowId: 'v1', rewardOptions: OPTIONS }));

    const res = await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, P1_CTX);
    expect(res).toEqual({ applied: false, reason: 'write-refused' });
    expect(notices()[0].content).toMatch(/could not be saved .* Choose it again/);
    expect(notices()[0].whisper.sort()).toEqual(['gm-1', 'pl-1']);
    expect(card.flags[MODULE_ID].rewardChosen ?? null).toBeNull();            // released for another pick
  });

  it('control: a refused Link on a vow that exists is released, to link again', async () => {
    game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [makeVow({ refuse: true })] } }));
    const card = onTheTable(makeCard('vow-refused', { playerVowCard: true, vowName: 'Break the Covenant', vowId: 'v1' }));

    const res = await applyPlayerVowLinkFromRelay({ messageId: card.id, connectionName: 'Sable' }, P1_CTX);
    expect(res).toEqual({ applied: false, reason: 'write-refused' });
    expect(notices()[0].content).toMatch(/Link it again/);
    expect(card.flags[MODULE_ID].linkedConnection ?? null).toBeNull();
    expect(card.flags[MODULE_ID].vowGone ?? false).toBe(false);
  });
});
