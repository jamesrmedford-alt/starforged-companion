/**
 * SESS-01 · PLAYER-VOW-CARD-NAME-SNAPSHOT
 *
 * Scenario: Pat adds a vow from Kira's character sheet. The foundry-ironsworn
 * sheet's "+ Vow" button creates the Item first, named "Vow"
 * (vendor/foundry-ironsworn/src/module/vue/components/progress/progress-controls.vue
 * addProgressItem: `name: subtype.capitalize()`), and only then opens its sheet
 * for the player to type the vow. The canonical GM's createItem hook
 * (swearVow.js registerPlayerVowHook) posts the "🆕 New vow recorded" card at
 * that first moment, with `vowName: "Vow"` in its flags. Pat types the vow —
 * "Recover the stolen reactor core" — and presses the card's ⚔ Swear it (roll).
 *
 * Correct: the swear is for the vow as it stands on the sheet (the card knows
 * it by id, `vowId`): the forced Swear an Iron Vow names "Recover the stolen
 * reactor core", and its oath scene is asked to depict that vow.
 *
 * Today: applyPlayerVowSwearFromRelay builds the post from the card's
 * creation-time `vowName` — "Swear an iron vow: Vow." / forcedMoveTarget "Vow"
 * — so the move card, the oath scene ("A character is swearing "Vow"") and the
 * vow's hidden plan are all about "Vow".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, narrationCallsOf } from '../../helpers/skeletonTable.js';

const SWEAR = '[data-action="sf-player-vow-swear"]';
const REAL_NAME = 'Recover the stolen reactor core';

let table, restore, kira;
const swears   = () => table.cards(f => f.forcedMoveId === 'swear_an_iron_vow');
const vowCards = () => table.cards(f => f.playerVowCard);

/** A vow Item as the sheet makes it, on Kira. */
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

/** The Item was created: every client's createItem hook fires, as in Foundry. */
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

describe('SESS-01 — ⚔ Swear it (roll) on a vow the sheet created as "Vow" and the player then named', () => {
  it('the forced Swear an Iron Vow names the vow as it stands on the sheet', async () => {
    const vow = sheetVow('vow-new', 'Vow');           // the sheet's "+ Vow": Item.create({ name: "Vow", … })
    await created(vow);
    const [card] = vowCards();
    expect(card, 'the canonical GM posted the new-vow card').toBeTruthy();
    expect(card.flags[MODULE_ID].vowId).toBe('vow-new');

    vow.name = REAL_NAME;                             // Pat types the vow in the Item sheet the button opened

    await pressSwear(card._id ?? card.id);
    const [swear] = swears();
    expect(swear, 'the swear was posted').toBeTruthy();
    expect(swear.flags[MODULE_ID].forcedMoveTarget).toBe(REAL_NAME);
  }, 60_000);

  it('its oath scene is asked to depict that vow, not "Vow"', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    const [card] = vowCards();
    vow.name = REAL_NAME;

    await pressSwear(card._id ?? card.id);
    const oath = narrationCallsOf(table).find(c => /A character is swearing/.test(c.userText));
    expect(oath, 'the oath scene was narrated').toBeTruthy();
    expect(oath.userText).toContain(`A character is swearing "${REAL_NAME}"`);
  }, 60_000);

  it('control: a vow created with its name (Begin a Session\'s offer) is sworn under it', async () => {
    const vow = sheetVow('vow-named', 'Learn who sent the escort');
    await created(vow);
    const [card] = vowCards();
    expect(card.flags[MODULE_ID]).toMatchObject({ vowName: 'Learn who sent the escort', vowId: 'vow-named', actorId: 'pc-kira' });

    await pressSwear(card._id ?? card.id);
    const [swear] = swears();
    expect(swear.flags[MODULE_ID].forcedMoveTarget).toBe('Learn who sent the escort');
    expect(swear.speaker?.actor).toBe('pc-kira');
    const oath = narrationCallsOf(table).find(c => /A character is swearing/.test(c.userText));
    expect(oath?.userText).toContain('A character is swearing "Learn who sent the escort"');
  }, 60_000);
});
