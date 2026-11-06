/* global makeTestActor, structuredClone */
/**
 * CARD-1 — VOW-ID-NEVER-LANDED's reward pick throws when the createItem hook's
 * flag writes were refused (eleventh audit, cards).
 *
 * Kira writes "Break the Covenant" on her sheet. The canonical GM's createItem
 * hook (registerPlayerVowHook) stamps `vowSetupOffered` and `vowId` on the Item
 * — two `setFlag` writes, each `.catch(() => {})` — then posts the "🆕 New vow
 * recorded" card and the reward-choice card naming the vow by its Item id.
 * When the world refuses the Item's flag writes (the VOW-ID-NEVER-LANDED
 * scenario: "the createItem hook's swallowed setFlag"), the Item carries no
 * `flags["starforged-companion"]` at all. The fix made `isVowCopy` match the
 * Item by its own id, so `vowRewardStatuses` now reaches that Item — and reads
 * `item.flags[MODULE_ID].reward?.status` without optional chaining on the
 * namespace: TypeError. The pick never lands; the relayed press re-arms after
 * 15 s with no word, every time. (The unit test for the fix builds its vow with
 * `flags: { [MODULE_ID]: {} }`, an empty namespace, which hides it.)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { registerPlayerVowHook, applyRewardPickFromRelay } from '../../../src/session/swearVow.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true, active: true, name: 'GM' };
const P1 = { id: 'pl-1', isGM: false, active: true, name: 'Kira\'s player' };
const P1_CTX = { requesterId: 'pl-1', requester: P1, requesterIsGM: false };
const flush = () => new Promise(r => setTimeout(r, 0));

let kira;

/** A sheet-made vow Item; `refuseFlags` refuses every module flag write, as a world that refuses the Item update does. */
function sheetVow({ refuseFlags }) {
  const item = {
    id: 'v1', name: 'Break the Covenant', type: 'progress', parent: kira,
    system: { subtype: 'vow', rank: 3, current: 0, completed: false },
    flags: {},
  };
  item.setFlag = async (mod, key, val) => {
    if (refuseFlags) throw new Error('The server refused the Item update (test fault)');
    (item.flags[mod] ??= {})[key] = val;
  };
  return item;
}

async function swearOnSheet(item) {
  kira.items.contents.push(item);
  Hooks.call('createItem', item);
  for (let i = 0; i < 12; i++) await flush();
  const rewardCard = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.rewardChoiceCard);
  game.messages = { get: (id) => ChatMessage._created.find(m => m.id === id) ?? null };
  return rewardCard;
}

async function pick(rewardCard) {
  try {
    // The card's own write-your-own pick (with no key, proposeRewards offers none).
    return await applyRewardPickFromRelay({ messageId: rewardCard.id, own: 'A salvaged jump drive' }, P1_CTX);
  } catch (err) {
    return { threw: String(err?.message ?? err) };
  }
}

beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  game.ready = true;
  game.user = GM;
  game.users._set([GM, P1]);
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, structuredClone({ ...CampaignStateSchema, connectionIds: [] }));
  kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character', items: { contents: [] } });
  game.actors._setAll([kira]);
  registerPlayerVowHook();
});

describe('a reward pick on a sheet vow whose flag writes the world refused (VOW-ID-NEVER-LANDED)', () => {
  it('control: with the flag writes landed, the pick promises the reward on the vow', async () => {
    const vow = sheetVow({ refuseFlags: false });
    const card = await swearOnSheet(vow);
    expect(card, 'the reward-choice card names the vow by its Item id').toBeTruthy();
    expect(card.flags[MODULE_ID].vowId).toBe('v1');
    expect(await pick(card)).toEqual({ applied: true });
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised' });
  });

  it('with both flag writes refused, the pick still promises the reward (the fix\'s own case)', async () => {
    const vow = sheetVow({ refuseFlags: true });
    const card = await swearOnSheet(vow);
    // Setup is real: the hook swallowed both refusals and posted the cards.
    expect(card).toBeTruthy();
    expect(card.flags[MODULE_ID].vowId).toBe('v1');
    expect(vow.flags[MODULE_ID], 'the Item has no module flag namespace').toBeUndefined();
    // Once the vow's own flag write works again (the pick's setFlag), the reward lands.
    vow.setFlag = async (mod, key, val) => { (vow.flags[mod] ??= {})[key] = val; };

    const res = await pick(card);
    expect(res).toEqual({ applied: true });
    expect(vow.flags[MODULE_ID]?.reward).toMatchObject({ status: 'promised' });
  });
});
