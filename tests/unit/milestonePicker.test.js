/**
 * STARFORGED COMPANION
 * tests/unit/milestonePicker.test.js
 *
 * Reach a Milestone picker card (several open vows, none named). A click on a
 * player's client used to disable the buttons and silently do nothing (the vow
 * write is GM-gated). It now relays "milestone.pick" to the canonical GM,
 * where applyMilestonePick (src/moves/milestonePicker.js) marks the vow, posts
 * the result card and resolves the picker — idempotently.
 *
 * The click across clients — the GM's pipeline posting the picker, a player
 * picking on their own client, a second pick, a non-owner, no GM connected —
 * runs on the multi-client harness (tests/helpers/multiClient.js, issue #282):
 * "across a booted table" below.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';

// The move pipeline, for the multi-client section: a scripted Reach a
// Milestone with no named vow, no pacing call, the confirm dialog accepted.
// Each mock spreads the real module, so src/index.js boots on every client.
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'reach_a_milestone', moveName: 'Reach a Milestone', statUsed: null, adds: 0,
    moveTarget: null, rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));

import { applyMilestonePick, postReachMilestoneCard } from '../../src/moves/milestonePicker.js';
import { wireMilestonePickerButtons } from '../../src/index.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true,  active: true };
const P1 = { id: 'pl-1', isGM: false, active: true };
const GM_CTX = { requesterId: 'gm-1', requester: GM, requesterIsGM: true };

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

function makeVow(id, name, rank, current = 0) {
  const item = {
    id, name, type: 'progress',
    system: { subtype: 'vow', rank, current },
    flags: {},
    update: async (changes) => {
      if ('system.current' in changes) item.system.current = changes['system.current'];
    },
  };
  return item;
}

const PICKER_CHOICES = [
  { vowId: 'v-b1', actorId: 'pc-b' },
  { vowId: 'v-b2', actorId: 'pc-b' },
  { vowId: 'v-missing', actorId: 'pc-b' },
];

function makePickerMessage(id = 'msg-1', resolved = false, extra = { choices: PICKER_CHOICES }) {
  const msg = {
    id,
    flags: { [MODULE_ID]: { milestonePicker: true, resolved, ...extra } },
    update: vi.fn(async (changes) => {
      if (changes[`flags.${MODULE_ID}.resolved`]) msg.flags[MODULE_ID].resolved = true;
    }),
  };
  return msg;
}

// Minimal DOM double for the picker card's buttons (node test environment).
function makeRoot(buttonData) {
  const root = { buttons: [] };
  const makeBtn = (dataset) => {
    const btn = {
      dataset: { ...dataset }, disabled: false, listeners: {},
      cloneNode() { return makeBtn(this.dataset); },
      replaceWith(next) { root.buttons[root.buttons.indexOf(btn)] = next; },
      addEventListener(ev, fn) { this.listeners[ev] = fn; },
    };
    return btn;
  };
  root.buttons = buttonData.map(makeBtn);
  root.querySelectorAll = () => [...root.buttons];
  return root;
}

let pcA, pcB, vowB1, vowB2, picker;

beforeEach(() => {
  ChatMessage._reset();
  game.socket._reset();
  vowB1 = makeVow('v-b1', 'Find the Archive', 'formidable');   // 4 ticks
  vowB2 = makeVow('v-b2', 'Avenge Kade', 'dangerous');         // 8 ticks
  pcA = makeTestActor({ id: 'pc-a', name: 'Ash' });
  pcB = makeTestActor({ id: 'pc-b', name: 'Bex', items: { contents: [vowB1, vowB2] } });
  game.actors._setAll([pcA, pcB]);
  picker = makePickerMessage();
  game.messages = { get: (id) => (id === picker.id ? picker : null) };
});

describe('applyMilestonePick (canonical GM handler)', () => {
  beforeEach(() => setUsers([GM, P1], 'gm-1'));

  it('marks the picked vow on the card\'s actor, posts the result card, resolves the picker', async () => {
    const res = await applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b1' }, GM_CTX);
    expect(res).toEqual({ marked: true, ticks: 4 });
    expect(vowB1.system.current).toBe(4);
    expect(vowB2.system.current).toBe(0);
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.reachMilestoneCard)).toHaveLength(1);
    expect(picker.flags[MODULE_ID].resolved).toBe(true);
  });

  it('is idempotent — a second pick on a resolved card marks nothing', async () => {
    await applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b1' }, GM_CTX);
    const again = await applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b2' }, GM_CTX);
    expect(again).toEqual({ marked: false, reason: 'already-resolved' });
    expect(vowB2.system.current).toBe(0);
  });

  it('two near-simultaneous picks mark only once', async () => {
    const [a, b] = await Promise.all([
      applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b1' }, GM_CTX),
      applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b2' }, GM_CTX),
    ]);
    expect([a.marked, b.marked].filter(Boolean)).toHaveLength(1);
    // Exactly one vow advanced (formidable +4 or dangerous +8), never both.
    expect([vowB1.system.current, vowB2.system.current].filter(t => t > 0)).toHaveLength(1);
  });

  it('warns and resolves the card when the offered vow is gone from the actor', async () => {
    const warn = vi.spyOn(console, 'warn');
    const res = await applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-missing' }, GM_CTX);
    expect(res.marked).toBe(false);
    expect(warn.mock.calls.some(c => /not found on actor/.test(String(c[0])))).toBe(true);
    expect(picker.flags[MODULE_ID].resolved).toBe(true);
  });

  it('warns when the picker card no longer exists', async () => {
    const warn = vi.spyOn(console, 'warn');
    const res = await applyMilestonePick({ messageId: 'gone', actorId: 'pc-b', vowId: 'v-b1' }, GM_CTX);
    expect(res).toEqual({ marked: false, reason: 'no-message' });
    expect(warn).toHaveBeenCalled();
    expect(vowB1.system.current).toBe(0);
  });

  it('refuses a vow that is not one of the card\'s buttons (forged relay) and leaves the card open', async () => {
    const vowA = makeVow('v-a1', 'Secret vow', 'epic');
    pcA.items.contents.push(vowA);
    const res = await applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-a', vowId: 'v-a1' }, GM_CTX);
    expect(res).toEqual({ marked: false, reason: 'not-on-card' });
    expect(vowA.system.current).toBe(0);
    expect(picker.flags[MODULE_ID].resolved).toBe(false);
  });

  it('refuses a requester who does not own the card\'s PC', async () => {
    pcB.ownership = { 'pl-2': 3 };
    const res = await applyMilestonePick(
      { messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b1' },
      { requesterId: 'pl-1', requester: P1, requesterIsGM: false },
    );
    expect(res).toEqual({ marked: false, reason: 'not-owner' });
    expect(vowB1.system.current).toBe(0);
    expect(picker.flags[MODULE_ID].resolved).toBe(false);
  });

  it('lets the owning player pick', async () => {
    pcB.ownership = { 'pl-1': 3 };
    const res = await applyMilestonePick(
      { messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b2' },
      { requesterId: 'pl-1', requester: P1, requesterIsGM: false },
    );
    expect(res).toEqual({ marked: true, ticks: 8 });
  });

  it('validates a card that predates the choices flag against its button HTML', async () => {
    picker = makePickerMessage('msg-old', false, {});
    picker.content = '<div class="sf-milestone-picker">'
      + '<button type="button" data-action="sf-milestone-pick" data-vow-id="v-b1" data-actor-id="pc-b">Find</button></div>';
    game.messages = { get: (id) => (id === picker.id ? picker : null) };
    expect((await applyMilestonePick({ messageId: 'msg-old', actorId: 'pc-b', vowId: 'v-b2' }, GM_CTX)).reason)
      .toBe('not-on-card');
    expect(await applyMilestonePick({ messageId: 'msg-old', actorId: 'pc-b', vowId: 'v-b1' }, GM_CTX))
      .toEqual({ marked: true, ticks: 4 });
  });
});

describe('postReachMilestoneCard', () => {
  it('posts the one shared result card', async () => {
    await postReachMilestoneCard({ name: 'Find <the> Archive', rank: 'formidable' }, 2);
    const card = ChatMessage._created[0];
    expect(card.flags[MODULE_ID].reachMilestoneCard).toBe(true);
    expect(card.content).toContain('Find &lt;the&gt; Archive');
    expect(card.content).toContain('+2 ticks (formidable rank)');
  });
});

describe('wireMilestonePickerButtons', () => {
  it('a resolved card renders disabled', () => {
    const root = makeRoot([{ actorId: 'pc-b', vowId: 'v-b1' }]);
    wireMilestonePickerButtons(makePickerMessage('msg-2', true), root);
    expect(root.buttons[0].disabled).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Across a booted table — the multi-client harness (issue #282)
// ─────────────────────────────────────────────────────────────────────────────

describe('across a booted table', () => {
  let table, archive, kade;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  }, 30_000);
  afterAll(() => table?.teardown());

  /** Pat (pl-1, owns Bex) narrates a Reach a Milestone; the GM's pipeline posts the picker. */
  async function pickerFromPipeline() {
    await table.reset({ world: { settings: {
      campaignState: { ...CampaignStateSchema, sessionActive: true },
    } } });
    archive = makeVow('v-b1', 'Find the Archive', 'formidable');   // 4 ticks
    kade    = makeVow('v-b2', 'Avenge Kade', 'dangerous');         // 8 ticks
    table.addActor({ id: 'pc-b', name: 'Bex', ownership: { 'pl-1': 3 }, items: { contents: [archive, kade] } });
    await table.client('pl-1').chat('Another step closer to the truth of it.', { speaker: { actor: 'pc-b' } });
    await table.settle();
    const pickers = table.cards(f => f.milestonePicker);
    expect(pickers.map(c => c.author)).toEqual(['gm-1']);
    return pickers[0];
  }

  const pick = (userId, card, vowId) =>
    table.client(userId).click(card._id, `[data-action="sf-milestone-pick"][data-vow-id="${vowId}"]`);

  it('the GM\'s pipeline posts the picker, offering exactly the open vows', async () => {
    const card = await pickerFromPipeline();
    expect(card.flags[MODULE_ID].choices).toEqual([
      { vowId: 'v-b1', actorId: 'pc-b' },
      { vowId: 'v-b2', actorId: 'pc-b' },
    ]);
  });

  it('a player picks on their own client: the GM marks that vow once, posts the result, resolves the picker everywhere', async () => {
    const card = await pickerFromPipeline();
    pick('pl-1', card, 'v-b1');
    await table.settle();
    expect(archive.system.current).toBe(4);
    expect(kade.system.current).toBe(0);
    expect(table.cards(f => f.reachMilestoneCard).map(c => c.author)).toEqual(['gm-1']);
    for (const c of table.clients) expect(c.message(card._id).flags[MODULE_ID].resolved, c.id).toBe(true);
    const others = table.client('pl-2').render(card._id).querySelectorAll('[data-action="sf-milestone-pick"]');
    expect(others.every(b => b.disabled)).toBe(true);
  });

  it('a second pick after the first landed marks nothing', async () => {
    const card = await pickerFromPipeline();
    pick('pl-1', card, 'v-b1');
    await table.settle();
    pick('gm-1', card, 'v-b2');   // the GM's re-rendered buttons are disabled too
    await table.settle();
    expect(kade.system.current).toBe(0);
    expect(table.cards(f => f.reachMilestoneCard)).toHaveLength(1);
  });

  it('a player who does not own the PC is refused — and the picker stays open', async () => {
    const card = await pickerFromPipeline();
    pick('pl-2', card, 'v-b2');
    await table.settle();
    expect(kade.system.current).toBe(0);
    expect(table.world.message(card._id).flags[MODULE_ID].resolved).toBe(false);
  });

  it('with no GM connected the pick is not lost silently — the buttons re-arm and nothing is marked', async () => {
    silenceConsoleErrors();
    const card = await pickerFromPipeline();
    await table.leave('gm-1');
    const btn = pick('pl-1', card, 'v-b1');
    await table.settle();
    expect(archive.system.current).toBe(0);
    expect(btn.disabled).toBe(false);
    expect(table.client('pl-1').notifications.some(n => /no GM is connected/.test(n.message))).toBe(true);
  });
});
