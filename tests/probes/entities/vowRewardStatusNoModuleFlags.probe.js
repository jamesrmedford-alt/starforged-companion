/* global makeTestActor */
/**
 * Eleventh audit — entities. VOW-ID-NEVER-LANDED's fix, incomplete.
 *
 * Kira writes "Break the Covenant" on her sheet. The canonical GM's createItem
 * hook (swearVow.registerPlayerVowHook) stamps two module flags on the Item —
 * `vowSetupOffered`, then `vowId` — each `.catch(() => {})`, and posts the
 * "🆕 New vow recorded" card and the reward-choice card naming the vow by its
 * Item id. VOW-ID-NEVER-LANDED made the reward / link writers and the
 * granted-or-lost check find that Item by its own id (actorBridge.isVowCopy)
 * when the `vowId` stamp never landed.
 *
 * But when neither stamp landed — the Item carries no `starforged-companion`
 * flag scope at all, the state a refused stamp leaves on a sheet-made vow —
 * swearVow.vowRewardStatuses matches the Item by its id and then reads
 * `item.flags[MODULE_ID].reward` unguarded: a TypeError, thrown out of
 * applyRewardPickFromRelay before the card is claimed. On the relay that is a
 * console.error on the GM's console only (gmRelay's socket listener), so every
 * reward pick on the card does nothing, silently — where before the fix the
 * card was at least closed with a notice.
 *
 * The fix's own test (tests/unit/vowIdNeverLanded.test.js) models the missing
 * stamp as an empty module scope `{}`, which is the control below.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyRewardPickFromRelay } from '../../../src/session/swearVow.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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
 * A sheet-made vow Item. `moduleScope: false` — neither createItem-hook stamp
 * landed, so the Item has no module flag scope (as Foundry leaves an Item no
 * module ever wrote); `moduleScope: true` — the fix's own model, an empty one.
 */
function makeSheetVow(id, { moduleScope }) {
  const item = {
    id, name: 'Break the Covenant', type: 'progress',
    system: { subtype: 'vow', rank: 3, current: 16, completed: false },
    flags: moduleScope ? { [MODULE_ID]: {} } : {},
  };
  item.setFlag = async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; };
  return item;
}

const onTheTable = (card) => { game.messages = { get: (id) => (id === card.id ? card : null) }; return card; };

function seat(vow) {
  const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [vow] } });
  game.actors._setAll([kira]);
}

beforeEach(() => {
  ChatMessage._reset();
  game.user = GM;
  game.users = Object.assign([GM, P1], { get: (id) => [GM, P1].find(u => u.id === id) ?? null });
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { ...CampaignStateSchema });
});

describe('a reward pick on a sheet-made vow neither of whose createItem stamps landed', () => {
  it('sets the reward on the vow, as for a vow whose vowId stamp alone was lost', async () => {
    const vow = makeSheetVow('v1', { moduleScope: false });
    seat(vow);
    const card = onTheTable(makeCard('reward-1', { rewardChoiceCard: true, vowId: 'v1', rewardOptions: [REWARD] }));

    const result = await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, P1_CTX)
      .catch(err => ({ threw: String(err?.message ?? err) }));

    expect(result).toEqual({ applied: true });
    expect(vow.flags[MODULE_ID]?.reward).toMatchObject({ status: 'promised', description: 'A salvaged jump drive' });
    expect(card.flags[MODULE_ID].rewardChosen).toBe(true);
  });

  it('control: the fix\'s own case — an empty module scope (vowSetupOffered landed, vowId did not) — works', async () => {
    const vow = makeSheetVow('v1', { moduleScope: true });
    seat(vow);
    const card = onTheTable(makeCard('reward-2', { rewardChoiceCard: true, vowId: 'v1', rewardOptions: [REWARD] }));

    expect(await applyRewardPickFromRelay({ messageId: card.id, idx: 0 }, P1_CTX)).toEqual({ applied: true });
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised' });
  });
});
