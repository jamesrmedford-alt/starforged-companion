/**
 * PROBE SC — REWARD-REPROMISED-AFTER-GRANT (DUPLICATE)
 *
 * What the user does: the crew swears a vow and picks its reward on the
 * "🎁 Choose your reward" card. A fight linked to the vow is won, and the
 * reward is granted ("🎁 Reward earned"; the vow's `flags.reward.status`
 * flips to "granted" so a re-win can't re-grant it — index.js
 * grantLinkedVowReward). Later someone presses a reward button on the old
 * card again — another client's buttons were never disabled, and every
 * re-render (a reload) re-arms them (the disable is local DOM only).
 *
 * What happens: registerRewardChoiceHook's `store` calls
 * setSharedVowReward(vowId, { status: "promised", … }) (actorBridge.js), which
 * overwrites the vow's reward whatever its status — the granted reward is
 * "promised" again, and the next linked win or the fulfilment grants a
 * second reward (grantLinkedVowReward takes any "promised" reward).
 * A forsaken vow's "lost" reward is re-promised the same way.
 *
 * What should happen: a reward already granted or lost is not re-promised —
 * the pick is refused (and the card claimed once, on the GM).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StubElement, parseHTML } from '../../helpers/cardDom.js';
import { registerRewardChoiceHook } from '../../../src/session/swearVow.js';
import { buildRewardChoiceHtml } from '../../../src/moves/rewards.js';

const MODULE_ID = 'starforged-companion';
const flush = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };

const OPTIONS = [
  { description: 'A salvaged jump drive', form: 'gear' },
  { description: 'Fresh supplies from the relay', form: 'supply' },
];

function vowItem(reward) {
  const item = {
    id: 'vow-1', name: 'Break the Covenant', type: 'progress',
    system: { subtype: 'vow', rank: 3, current: 16, completed: false },
    flags: { [MODULE_ID]: { vowId: 'v1', sharedVow: true, reward } },
  };
  item.setFlag = async (mod, key, val) => { item.flags[mod][key] = val; };
  return item;
}

let savedHTMLElement;
beforeEach(() => {
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  game.actors._reset();
  ChatMessage._reset();
  game.user.isGM = true;
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);   // the canonical GM
  registerRewardChoiceHook();
});
afterEach(() => { globalThis.HTMLElement = savedHTMLElement; });

function renderRewardCard() {
  const msg  = { id: 'rc-1', flags: { [MODULE_ID]: { rewardChoiceCard: true, vowId: 'v1', rewardOptions: OPTIONS } } };
  const root = parseHTML(buildRewardChoiceHtml(OPTIONS));
  Hooks.call('renderChatMessageHTML', msg, root);
  return root;
}

describe('PROBE REWARD-REPROMISED-AFTER-GRANT', () => {
  it('control: a first pick promises the chosen reward on the vow', async () => {
    const item = vowItem(undefined);
    game.actors._setAll([makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [item] } })]);
    renderRewardCard().querySelectorAll('[data-action="sf-reward-pick"]')[0].click();
    await settle();
    expect(item.flags[MODULE_ID].reward).toMatchObject({ status: 'promised', description: 'A salvaged jump drive' });
  });

  it('a pick on the card after the reward was granted does not promise it again', async () => {
    const granted = { status: 'granted', description: 'A salvaged jump drive', form: 'gear' };
    const item = vowItem({ ...granted });
    game.actors._setAll([makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [item] } })]);

    // A reload later: the card renders with live buttons; the other option is pressed.
    renderRewardCard().querySelectorAll('[data-action="sf-reward-pick"]')[1].click();
    await settle();

    // Actual: { status: "promised", description: "Fresh supplies from the relay" } —
    // the fulfilment (or the next linked win) grants a second reward.
    expect(item.flags[MODULE_ID].reward).toMatchObject(granted);
  });
});
