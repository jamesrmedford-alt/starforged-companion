/* global makeTestActor */
/**
 * Known-issues VOW-ID-NEVER-LANDED (found while fixing issue #338) — a
 * sheet-made vow whose `vowId` flag never landed is still the vow its cards
 * name.
 *
 * Kira writes "Break the Covenant" on her sheet. The createItem hook posts
 * its "🆕 New vow recorded" card and reward-choice card naming the vow by
 * its Item's own id (`vowId: item.id`), and stamps the same id on the Item as
 * its `vowId` flag — a write that can fail (it is caught and dropped). With
 * the flag missing, the reward and link writers (actorBridge
 * setSharedVowReward / setVowLinkedConnection) and the granted-or-lost check
 * (swearVow vowRewardStatuses) matched copies by the flag alone: the pick said
 * "No character holds this vow any more" and closed the card while the vow
 * sat on the sheet, and a granted reward could be promised again. Each now
 * also matches the Item whose id is the card's `vowId`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyRewardPickFromRelay, applyPlayerVowLinkFromRelay } from '../../src/session/swearVow.js';
import { setSharedVowReward, setVowLinkedConnection } from '../../src/character/actorBridge.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true, active: true };
const P1 = { id: 'pl-1', isGM: false, active: true };
const P1_CTX = { requesterId: 'pl-1', requester: P1, requesterIsGM: false };
const REWARD = { description: 'A salvaged jump drive', form: 'gear' };

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

/**
 * A vow Item; `vowIdFlag: null` is a sheet-made vow whose createItem-hook
 * stamp never landed. `moduleScope: false` — neither stamp landed, so the
 * Item has no module flag scope at all, as Foundry leaves an Item no module
 * ever wrote (issue #342 Z55: the empty scope this fixture used hid a throw).
 */
function makeVow(id, { vowIdFlag = id, reward = null, moduleScope = true } = {}) {
  const item = {
    id, name: 'Break the Covenant', type: 'progress',
    system: { subtype: 'vow', rank: 3, current: 16, completed: false },
    flags: moduleScope
      ? { [MODULE_ID]: { ...(vowIdFlag ? { vowId: vowIdFlag } : {}), ...(reward ? { reward } : {}) } }
      : {},
  };
  item.setFlag = async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; };
  return item;
}

const notices = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.vowWriteRefusedNotice);
const onTheTable = (card) => { game.messages = { get: (id) => (id === card.id ? card : null) }; return card; };
let vow;

beforeEach(() => {
  ChatMessage._reset();
  game.user = GM;
  game.users = Object.assign([GM, P1], { get: (id) => [GM, P1].find(u => u.id === id) ?? null });
  game.settings._store.clear();
  vow = makeVow('v1', { vowIdFlag: null });
  const kira  = makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [vow] } });
  const sable = makeTestActor({
    id: 'conn-sable', name: 'Sable', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-sable', name: 'Sable', rank: 'dangerous', relationshipTicks: 0, bonded: false, active: true, history: [],
    } } },
  });
  game.actors._setAll([kira, sable]);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { ...CampaignStateSchema, connectionIds: ['conn-sable'] });
});

describe('a sheet-made vow whose vowId flag never landed (VOW-ID-NEVER-LANDED)', () => {
  it('the writers find it by its Item id: the reward and the link land on it', async () => {
    expect(await setSharedVowReward('v1', REWARD)).toEqual({ ok: true });
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised', description: 'A salvaged jump drive' });
    expect(await setVowLinkedConnection('v1', 'Sable')).toEqual({ ok: true });
    expect(vow.flags[MODULE_ID].linkedConnectionName).toBe('Sable');
  });

  it('a reward pick sets the reward — not "no character holds this vow" and a closed card', async () => {
    const card = onTheTable(makeCard('reward-1', { rewardChoiceCard: true, vowId: 'v1', rewardOptions: [REWARD] }));
    expect(await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, P1_CTX)).toEqual({ applied: true });
    expect(notices()).toHaveLength(0);
    expect(card.flags[MODULE_ID].rewardChosen).toBe(true);
    expect(ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.rewardSetCard)).toBe(true);
  });

  it('a 🤝 Link links it — the card is not closed as a vow nobody holds', async () => {
    const card = onTheTable(makeCard('vow-card-1', { playerVowCard: true, vowName: 'Break the Covenant', vowId: 'v1' }));
    expect(await applyPlayerVowLinkFromRelay({ messageId: card.id, connectionName: 'Sable' }, P1_CTX)).toEqual({ applied: true });
    expect(card.flags[MODULE_ID]).toMatchObject({ linkedConnection: 'Sable' });
    expect(card.flags[MODULE_ID].vowGone ?? false).toBe(false);
  });

  it('a reward already granted on it is never promised again (vowRewardStatuses reads it by its id)', async () => {
    vow.flags[MODULE_ID].reward = { status: 'granted', description: 'A salvaged jump drive', form: 'gear' };
    const card = onTheTable(makeCard('reward-2', { rewardChoiceCard: true, vowId: 'v1', rewardOptions: [REWARD] }));
    expect(await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, P1_CTX)).toEqual({ applied: false, reason: 'granted' });
    expect(vow.flags[MODULE_ID].reward.status).toBe('granted');
  });

  it('control: a vow deleted from the sheet is still "no copy"', async () => {
    expect(await setSharedVowReward('v-deleted', REWARD)).toEqual({ ok: false, reason: 'no-copy' });
    expect(await setVowLinkedConnection('v-deleted', 'Sable')).toEqual({ ok: false, reason: 'no-copy' });
  });

  it('control: a shared vow\'s copies are still found by their flag, each copy once', async () => {
    const a = makeVow('item-a', { vowIdFlag: 'shared-1' });
    const b = makeVow('item-b', { vowIdFlag: 'shared-1' });
    game.actors._setAll([
      makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [a] } }),
      makeTestActor({ id: 'pc-ren',  name: 'Ren',  items: { contents: [b] } }),
    ]);
    expect(await setSharedVowReward('shared-1', REWARD)).toEqual({ ok: true });
    expect([a, b].map(i => i.flags[MODULE_ID].reward?.status)).toEqual(['promised', 'promised']);
  });
});

// Issue #342 Z55: when neither createItem stamp landed — `vowSetupOffered`
// and `vowId` are back-to-back writes of the same Item, so a world that
// refuses one typically refuses both — the Item carries no module flag scope.
// isVowCopy finds it by its id, and vowRewardStatuses read
// `item.flags[MODULE_ID].reward` unguarded: a TypeError out of the reward
// pick before its card was claimed, a GM-console line on the relay, and every
// retry the same (the cards auditor's CARD-1 drives it from the createItem
// hook: rewardPickNoFlagNamespace.test.js).
describe('a reward pick on a sheet-made vow neither of whose createItem stamps landed', () => {
  it('sets the reward on the vow, as for a vow whose vowId stamp alone was lost', async () => {
    const bare = makeVow('v1', { vowIdFlag: null, moduleScope: false });
    game.actors._setAll([makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [bare] } })]);
    const card = onTheTable(makeCard('reward-3', { rewardChoiceCard: true, vowId: 'v1', rewardOptions: [REWARD] }));

    const result = await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, P1_CTX)
      .catch(err => ({ threw: String(err?.message ?? err) }));

    expect(result).toEqual({ applied: true });
    expect(bare.flags[MODULE_ID]?.reward).toMatchObject({ status: 'promised', description: 'A salvaged jump drive' });
    expect(card.flags[MODULE_ID].rewardChosen).toBe(true);
  });

  it('control: the fix\'s own case — an empty module scope (vowSetupOffered landed, vowId did not) — works', async () => {
    const card = onTheTable(makeCard('reward-4', { rewardChoiceCard: true, vowId: 'v1', rewardOptions: [REWARD] }));
    expect(await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, P1_CTX)).toEqual({ applied: true });
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised' });
  });
});
