/* global makeTestActor */
/**
 * PROBE — CARDS-01 CARD-REPOST-AS-CLICKER (ninth audit, area cards)
 *
 * What the user does: the GM (or a crewmate) presses a forced-move button on
 * ANOTHER player's card — Pat's Strike card's "⚔ Attempt to Finish the
 * Fight", Pat's exploration hit's "🏁 Attempt to Fulfill Vow", the victory
 * card's "🏁 Attempt to Fulfill" for the fight Pat won, or the "⚔ Swear it
 * (roll)" on the card for the vow Pat made on their sheet.
 *
 * What happens: each of these buttons posts its forced move from the
 * clicker's client with NO speaker (src/index.js wireTakeDecisiveActionButton
 * ~7397, wireAttemptFulfillVowButton ~7619, wireFightVowButtons ~7527 (the
 * sf-fulfill-vow branch); src/session/swearVow.js registerPlayerVowSwearHook
 * ~805 / buildSwearMovePostForName ~712). The pipeline resolves the roller
 * from the message's author (resolveSpeakerActorId → resolveUserActorId:
 * the author's bound PC, else the first PC they own, else — for a GM — the
 * campaign's first PC). So the GM's press rolls the move as the GM's / the
 * first PC: Take Decisive Action's +1 momentum and bad-spot downgrade land
 * on and read from the wrong character (position is per character, issue
 * #322 V03); "Attempt to Fulfill Vow" (which also names no vow) scores and —
 * on a hit — completes and pays the first PC's sole open vow instead of
 * Pat's; the swear's +2/+1 momentum and oath scene are the first PC's.
 *
 * What should happen: the re-post speaks as the card's own PC — the move
 * card's `actorId` (stamped by postMoveResult), the victory card's `actorId`,
 * the vow Item's owner — as the paced Roll button (issue #325 W09) and the
 * relayed "⚑ Mark Progress on Vow" (issue #321 U20, the control below) do:
 * decisions.md → "Multiplayer attribution: roll effects credit the roller".
 *
 * Controls: the Take Decisive Action button still forwards its fight by id;
 * the milestone-suggestion relay posts its forced move as the card's roller.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/cardRepostAsClicker.probe.js
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import {
  wireTakeDecisiveActionButton,
  wireAttemptFulfillVowButton,
  wireFightVowButtons,
} from '../../../src/index.js';
import { applyMilestoneSuggestion } from '../../../src/moves/cardActions.js';
import { registerPlayerVowSwearHook } from '../../../src/session/swearVow.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true, active: true };
const P1 = { id: 'pl-1', isGM: false, active: true };

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], { get: (id) => users.find(u => u.id === id) ?? null });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

function makeCard(id, flags) {
  const msg = {
    id,
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

// Minimal DOM double: buttons keyed by data-action (the cardButtonWiring.test.js shape).
function makeRoot(buttons) {
  const root = { buttons: [] };
  const makeBtn = (spec) => {
    const btn = {
      action: spec.action, dataset: { ...(spec.dataset ?? {}) }, disabled: false, listeners: {},
      cloneNode() { return makeBtn({ action: this.action, dataset: this.dataset }); },
      replaceWith(next) { root.buttons[root.buttons.indexOf(btn)] = next; },
      addEventListener(ev, fn) { this.listeners[ev] = fn; },
      hasAttribute() { return false; },
    };
    return btn;
  };
  root.buttons = buttons.map(makeBtn);
  const matching = (sel) => {
    const m = /data-action="([^"]+)"/.exec(sel);
    return root.buttons.filter(b => b.action === m?.[1]);
  };
  root.querySelectorAll = (sel) => matching(sel);
  root.querySelector    = (sel) => matching(sel)[0] ?? null;
  return root;
}
const click = async (btn) => { await btn.listeners.click({ preventDefault() {}, stopPropagation() {} }); };
const btnFor = (root, action) => root.buttons.find(b => b.action === action);
const lastPost = () => ChatMessage._created.at(-1);

function makeVow(id, name, { vowId = id } = {}) {
  return {
    id, name, type: 'progress',
    system: { subtype: 'vow', rank: 2, current: 8, completed: false },
    flags: { [MODULE_ID]: { vowId } },
    update: async () => {}, setFlag: async () => {},
  };
}

let pcA, pcB;
const savedHTMLElement = globalThis.HTMLElement;

beforeAll(() => {
  // onChatMessageRender's shim tests `html instanceof HTMLElement`; the
  // single-client setup defines none.
  globalThis.HTMLElement ??= class HTMLElementStub {};
});
afterAll(() => {
  if (savedHTMLElement === undefined) delete globalThis.HTMLElement;
  else globalThis.HTMLElement = savedHTMLElement;
});

beforeEach(() => {
  ChatMessage._reset();
  game.socket?._reset?.();
  // A two-PC table: Ash (the first PC, the GM's fallback) and Bex (Pat's).
  pcA = makeTestActor({ id: 'pc-a', name: 'Ash', items: { contents: [makeVow('v-a', 'Find the archive')] } });
  pcB = makeTestActor({ id: 'pc-b', name: 'Bex', items: { contents: [makeVow('v-b', 'Break the Covenant')] } });
  pcB.ownership = { 'pl-1': 3 };
  game.actors._setAll([pcA, pcB]);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { ...CampaignStateSchema, characterIds: ['pc-a', 'pc-b'] });
  setUsers([GM, P1], 'gm-1');   // the GM presses the buttons on Pat's cards
});

describe('CARDS-01 a forced-move button pressed by someone else speaks as the card\'s PC', () => {
  it('"⚔ Attempt to Finish the Fight" on Bex\'s Strike card rolls Take Decisive Action as Bex', async () => {
    const card = makeCard('strike-1', { moveResolution: true, combatMoveCard: true, actorId: 'pc-b', combatTrackId: 'fight-1', combatTrackLabel: 'Raiders' });
    const root = makeRoot([{ action: 'sf-take-decisive-action' }]);
    wireTakeDecisiveActionButton(card, root);
    await click(btnFor(root, 'sf-take-decisive-action'));

    const post = lastPost();
    expect(post.flags[MODULE_ID].forcedMoveId).toBe('take_decisive_action');
    expect(post.flags[MODULE_ID].forcedMoveTargetId).toBe('fight-1');   // control: the fight rides by id
    // Expected: Bex (the card's roller). Today: no speaker — the author's (the GM's first PC, Ash) move.
    expect(post.speaker?.actor ?? null).toBe('pc-b');
  });

  it('"🏁 Attempt to Fulfill Vow" on Bex\'s move card rolls Fulfill Your Vow as Bex', async () => {
    const card = makeCard('explore-1', { moveResolution: true, milestoneSuggestion: { eligible: true, vowCount: 1 }, actorId: 'pc-b' });
    const root = makeRoot([{ action: 'sf-attempt-fulfill-vow' }]);
    wireAttemptFulfillVowButton(card, root);
    await click(btnFor(root, 'sf-attempt-fulfill-vow'));

    const post = lastPost();
    expect(post.flags[MODULE_ID].forcedMoveId).toBe('fulfill_your_vow');
    // Expected: Bex — selectFulfilVow then scores Bex's sole open vow. Today: no
    // speaker, so the GM's press scores (and on a hit completes and pays) Ash's.
    expect(post.speaker?.actor ?? null).toBe('pc-b');
  });

  it('the victory card\'s "🏁 Attempt to Fulfill" rolls as the PC who won the fight', async () => {
    const card = makeCard('fight-vow-1', { fightVowCard: true, vowName: 'Break the Covenant', vowId: 'v-b', marks: 1, actorId: 'pc-b' });
    const root = makeRoot([{ action: 'sf-mark-milestone' }, { action: 'sf-fulfill-vow' }]);
    wireFightVowButtons(card, root);
    await click(btnFor(root, 'sf-fulfill-vow'));

    const post = lastPost();
    expect(post.flags[MODULE_ID].forcedMoveId).toBe('fulfill_your_vow');
    expect(post.flags[MODULE_ID].forcedMoveTarget).toBe('Break the Covenant');   // control: the vow rides by name
    expect(post.speaker?.actor ?? null).toBe('pc-b');
  });

  it('"⚔ Swear it (roll)" on the card for Bex\'s sheet-made vow swears it as Bex', async () => {
    registerPlayerVowSwearHook();
    const card = makeCard('player-vow-1', { playerVowCard: true, vowName: 'Break the Covenant', vowId: 'v-b' });
    const root = makeRoot([{ action: 'sf-player-vow-swear' }]);
    Hooks.call('renderChatMessageHTML', card, [root]);
    await click(btnFor(root, 'sf-player-vow-swear'));

    const post = lastPost();
    expect(post.flags[MODULE_ID].forcedMoveId).toBe('swear_an_iron_vow');
    // Expected: the vow's owner (Bex holds vowId v-b). Today: no speaker — the
    // GM's press rolls +heart, takes the momentum and writes the oath scene for Ash.
    expect(post.speaker?.actor ?? null).toBe('pc-b');
  });

  it('control: the relayed "⚑ Mark Progress on Vow" posts its forced move as the card\'s roller', async () => {
    const card = makeCard('explore-2', { moveResolution: true, milestoneSuggestion: { eligible: true, vowCount: 1 }, actorId: 'pc-b' });
    game.messages = { get: (id) => (id === card.id ? card : null) };
    const res = await applyMilestoneSuggestion({ messageId: card.id, actorId: null }, { requesterId: 'gm-1', requester: GM, requesterIsGM: true });
    expect(res.posted).toBe(true);
    expect(lastPost().speaker?.actor).toBe('pc-b');
  });
});
