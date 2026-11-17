/**
 * STARFORGED COMPANION
 * tests/unit/swearItUsesTheVowAsNamed.test.js
 *
 * Issue #362 AC23 PLAYER-VOW-CARD-NAME-SNAPSHOT (and the coverage appendix's
 * SESS D5). The foundry-ironsworn sheet's "+ Vow" button creates the Item
 * first, named "Vow" (vendor progress-controls.vue addProgressItem: `name:
 * subtype.capitalize()`), and only then opens its sheet for the player to
 * type the vow. The canonical GM's createItem hook posts the "🆕 New vow
 * recorded" card at that first moment, with `vowName: "Vow"` in its flags;
 * the ⚔ Swear it (roll) press built its post from that snapshot — "Swear an
 * iron vow: Vow." — so the move card, the oath scene and the vow's hidden
 * plan were all about "Vow". The press now reads the vow as it stands on the
 * sheet (by the card's `vowId`), and a card made for a vow still to be named
 * says so — no name, no rank's stakes — with its rewards proposed for no
 * name (the conservative choice: the card is not re-posted on the rename).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, narrationCallsOf, plansOf } from '../helpers/skeletonTable.js';
import { buildPlayerVowSetupHtml } from '../../src/session/swearVow.js';

const SWEAR = '[data-action="sf-player-vow-swear"]';
const REAL_NAME = 'Recover the stolen reactor core';

let table, restore, kira;
const swears   = () => table.cards(f => f.forcedMoveId === 'swear_an_iron_vow');
const vowCards = () => table.cards(f => f.playerVowCard);
const rewardCalls = () => table.claude.calls.filter(c => /has just sworn a vow/.test(c.userText ?? ''));

function sheetVow(id, name) {
  const item = {
    id, type: 'progress', name, parent: kira, flags: {},
    system: { subtype: 'vow', rank: 1, current: 0, completed: false },
    async update(changes) { if (typeof changes?.name === 'string') item.name = changes.name; return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  kira.items.contents.push(item);
  return item;
}

async function created(item) {
  for (const c of table.connectedClients) c.run(() => Hooks.callAll('createItem', item, {}, 'pl-1'));
  await table.settle(); await table.drain();
}

async function pressSwear(cardId) {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    table.client('pl-1').click(cardId, SWEAR);
    for (let i = 0; i < 4; i += 1) { await table.settle(); await vi.advanceTimersByTimeAsync(2_100); }
    await table.settle();
  } finally {
    vi.useRealTimers();
    await table.drain();
  }
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  restore = await resetSkeletonTable(table, {}, { connectionIds: [] });
  kira = table.actors.get('pc-kira');
  globalThis.silenceConsoleErrors();
});
afterEach(() => restore?.());

describe('issue #362 AC23 — ⚔ Swear it (roll) on a vow the sheet created as "Vow" and the player then named', () => {
  it('the forced Swear an Iron Vow names the vow as it stands on the sheet', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    const [card] = vowCards();
    expect(card, 'the canonical GM posted the new-vow card').toBeTruthy();
    expect(card.flags[MODULE_ID].vowId).toBe('vow-new');

    vow.name = REAL_NAME;
    await pressSwear(card._id ?? card.id);
    const [swear] = swears();
    expect(swear, 'the swear was posted').toBeTruthy();
    expect(swear.flags[MODULE_ID].forcedMoveTarget).toBe(REAL_NAME);
  }, 60_000);

  it('its oath scene is asked to depict that vow, and its hidden plan is about it', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    const [card] = vowCards();
    vow.name = REAL_NAME;

    await pressSwear(card._id ?? card.id);
    const oath = narrationCallsOf(table).find(c => /A character is swearing/.test(c.userText));
    expect(oath, 'the oath scene was narrated').toBeTruthy();
    expect(oath.userText).toContain(`A character is swearing "${REAL_NAME}"`);
    expect(plansOf(table).find(p => p.kind === 'vow')?.subject).toMatchObject({ type: 'vow', id: 'vow-new', name: REAL_NAME });
  }, 60_000);

  it('the card made before the vow was named says so — no "Vow", no rank\'s stakes — and its rewards are proposed for no name', async () => {
    await created(sheetVow('vow-new', 'Vow'));
    const [card] = vowCards();
    expect(card.content).toContain('name it and set its rank on its sheet');
    expect(card.content).not.toContain('"Vow"');
    expect(card.content).not.toContain('sf-stakes');
    expect(rewardCalls()).toHaveLength(1);
    expect(rewardCalls()[0].userText).not.toContain('involving');
  }, 60_000);

  it('control: a vow created with its name (Begin a Session\'s offer) is sworn under it, and its card and rewards name it', async () => {
    const vow = sheetVow('vow-named', 'Learn who sent the escort');
    await created(vow);
    const [card] = vowCards();
    expect(card.flags[MODULE_ID]).toMatchObject({ vowName: 'Learn who sent the escort', vowId: 'vow-named', actorId: 'pc-kira' });
    expect(card.content).toContain('"Learn who sent the escort"');
    expect(card.content).toContain('sf-stakes');
    expect(rewardCalls()[0]?.userText).toContain('involving "Learn who sent the escort"');

    await pressSwear(card._id ?? card.id);
    const [swear] = swears();
    expect(swear.flags[MODULE_ID].forcedMoveTarget).toBe('Learn who sent the escort');
    expect(swear.speaker?.actor).toBe('pc-kira');
    const oath = narrationCallsOf(table).find(c => /A character is swearing/.test(c.userText));
    expect(oath?.userText).toContain('A character is swearing "Learn who sent the escort"');
  }, 60_000);
});

describe('buildPlayerVowSetupHtml — a vow still to be named', () => {
  it('is worded without a name or a rank', () => {
    const html = buildPlayerVowSetupHtml({ name: 'Vow', rank: 1, unnamed: true });
    expect(html).toContain('A new vow — name it and set its rank on its sheet');
    expect(html).toContain('sf-player-vow-swear');
    expect(html).not.toContain('"Vow"');
  });
});
