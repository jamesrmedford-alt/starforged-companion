/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/cardRepostAsRoller.test.js
 *
 * Issue #329 X05 (CARD-REPOST-AS-CLICKER) — a forced-move button pressed by
 * someone else speaks as the card's PC.
 *
 * The GM (or a crewmate) presses a forced-move button on another player's
 * card: the move card's "⚔ Attempt to Finish the Fight" and "🏁 Attempt to
 * Fulfill Vow", the victory card's "🏁 Attempt to Fulfill", the expedition
 * card's "🗺 Finish the Expedition", or the player-vow card's "⚔ Swear it
 * (roll)". Each posted its move with no speaker, so the pipeline credited
 * the message's author — a GM's press fell to the campaign's first PC: 🏁
 * scored and paid that PC's vow, ⚔ rolled Take Decisive Action with their
 * position and momentum, the swear's momentum and oath scene went to them.
 * Now each post speaks as the card's roller (its `actorId`; the vow's holder
 * on the player-vow card), and the 🏁 buttons forward the roller's vow by
 * its Item id. decisions.md → "Multiplayer attribution".
 *
 * (Converted from the ninth audit's probe
 * tests/probes/cards/cardRepostAsClicker.probe.js.)
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import {
  wireTakeDecisiveActionButton,
  wireAttemptFulfillVowButton,
  wireFightVowButtons,
  wireFinishExpeditionButton,
} from '../../src/index.js';
import { applyMilestoneSuggestion } from '../../src/moves/cardActions.js';
import { registerPlayerVowSwearHook } from '../../src/session/swearVow.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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

describe('issue #329 X05 — a forced-move button pressed by someone else speaks as the card\'s PC', () => {
  it('"⚔ Attempt to Finish the Fight" on Bex\'s Strike card rolls Take Decisive Action as Bex', async () => {
    const card = makeCard('strike-1', { moveResolution: true, combatMoveCard: true, actorId: 'pc-b', combatTrackId: 'fight-1', combatTrackLabel: 'Raiders' });
    const root = makeRoot([{ action: 'sf-take-decisive-action' }]);
    wireTakeDecisiveActionButton(card, root);
    await click(btnFor(root, 'sf-take-decisive-action'));

    const post = lastPost();
    expect(post.flags[MODULE_ID].forcedMoveId).toBe('take_decisive_action');
    expect(post.flags[MODULE_ID].forcedMoveTargetId).toBe('fight-1');   // control: the fight rides by id
    // Bex, the card's roller — not the author's (the GM's first PC, Ash) move.
    expect(post.speaker?.actor ?? null).toBe('pc-b');
  });

  it('"🏁 Attempt to Fulfill Vow" on Bex\'s move card rolls Fulfill Your Vow as Bex', async () => {
    const card = makeCard('explore-1', { moveResolution: true, milestoneSuggestion: { eligible: true, vowCount: 1, vowItemId: 'v-b' }, actorId: 'pc-b' });
    game.messages = { get: (id) => (id === card.id ? card : null) };   // the GM claims the card (FULFIL-BUTTON-LOCAL-DISABLE)
    const root = makeRoot([{ action: 'sf-attempt-fulfill-vow' }]);
    wireAttemptFulfillVowButton(card, root);
    await click(btnFor(root, 'sf-attempt-fulfill-vow'));

    const post = lastPost();
    expect(post.flags[MODULE_ID].forcedMoveId).toBe('fulfill_your_vow');
    // Bex — and Bex's sole open vow by its Item id; the GM's press scored
    // (and on a hit completed and paid) Ash's.
    expect(post.speaker?.actor ?? null).toBe('pc-b');
    expect(post.flags[MODULE_ID].forcedMoveTargetId).toBe('v-b');
  });

  it('the victory card\'s "🏁 Attempt to Fulfill" rolls as the PC who won the fight', async () => {
    const card = makeCard('fight-vow-1', { fightVowCard: true, vowName: 'Break the Covenant', vowId: 'v-b', marks: 1, actorId: 'pc-b' });
    game.messages = { get: (id) => (id === card.id ? card : null) };
    const root = makeRoot([{ action: 'sf-mark-milestone' }, { action: 'sf-fulfill-vow' }]);
    wireFightVowButtons(card, root);
    await click(btnFor(root, 'sf-fulfill-vow'));

    const post = lastPost();
    expect(post.flags[MODULE_ID].forcedMoveId).toBe('fulfill_your_vow');
    expect(post.flags[MODULE_ID].forcedMoveTarget).toBe('Break the Covenant');   // control: the vow rides by name
    expect(post.speaker?.actor ?? null).toBe('pc-b');
    expect(post.flags[MODULE_ID].forcedMoveTargetId).toBe('v-b');                // …and Bex's copy by its Item id
  });

  it('"🗺 Finish the Expedition" on the card for Bex\'s expedition progress finishes it as Bex', async () => {
    const card = makeCard('exp-1', { expeditionProgressCard: true, trackLabel: 'The Drift', trackId: 'exp-track-1', actorId: 'pc-b' });
    const root = makeRoot([{ action: 'sf-finish-expedition' }]);
    wireFinishExpeditionButton(card, root);
    await click(btnFor(root, 'sf-finish-expedition'));

    const post = lastPost();
    expect(post.flags[MODULE_ID]).toMatchObject({ forcedMoveId: 'finish_an_expedition', forcedMoveTargetId: 'exp-track-1' });
    expect(post.speaker?.actor ?? null).toBe('pc-b');
  });

  it('a card that names no roller (an older card) posts as its author, as before', async () => {
    const card = makeCard('strike-old', { moveResolution: true, combatMoveCard: true, combatTrackId: 'fight-1' });
    const root = makeRoot([{ action: 'sf-take-decisive-action' }]);
    wireTakeDecisiveActionButton(card, root);
    await click(btnFor(root, 'sf-take-decisive-action'));
    expect(lastPost().speaker).toBeUndefined();
  });

  it('"⚔ Swear it (roll)" on the card for Bex\'s sheet-made vow swears it as Bex', async () => {
    registerPlayerVowSwearHook();
    const card = makeCard('player-vow-1', { playerVowCard: true, vowName: 'Break the Covenant', vowId: 'v-b' });
    const root = makeRoot([{ action: 'sf-player-vow-swear' }]);
    Hooks.call('renderChatMessageHTML', card, [root]);
    await click(btnFor(root, 'sf-player-vow-swear'));

    const post = lastPost();
    expect(post.flags[MODULE_ID].forcedMoveId).toBe('swear_an_iron_vow');
    // The vow's holder (Bex holds vowId v-b) — an older card carries no actorId.
    expect(post.speaker?.actor ?? null).toBe('pc-b');
  });

  it('"⚔ Swear it (roll)" on a card that names the vow\'s holder speaks as them', async () => {
    registerPlayerVowSwearHook();
    const card = makeCard('player-vow-2', { playerVowCard: true, vowName: 'Find the archive', vowId: 'v-a', actorId: 'pc-a' });
    const root = makeRoot([{ action: 'sf-player-vow-swear' }]);
    setUsers([GM, P1], 'pl-1');   // a crewmate presses it
    Hooks.call('renderChatMessageHTML', card, [root]);
    await click(btnFor(root, 'sf-player-vow-swear'));
    expect(lastPost().speaker?.actor ?? null).toBe('pc-a');
  });

  it('control: the relayed "⚑ Mark Progress on Vow" posts its forced move as the card\'s roller', async () => {
    const card = makeCard('explore-2', { moveResolution: true, milestoneSuggestion: { eligible: true, vowCount: 1 }, actorId: 'pc-b' });
    game.messages = { get: (id) => (id === card.id ? card : null) };
    const res = await applyMilestoneSuggestion({ messageId: card.id, actorId: null }, { requesterId: 'gm-1', requester: GM, requesterIsGM: true });
    expect(res.posted).toBe(true);
    expect(lastPost().speaker?.actor).toBe('pc-b');
  });
});
