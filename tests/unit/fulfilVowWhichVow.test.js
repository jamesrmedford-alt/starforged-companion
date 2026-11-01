/**
 * STARFORGED COMPANION
 * tests/unit/fulfilVowWhichVow.test.js
 *
 * "🏁 Attempt to Fulfill Vow" names no vow (issue #321 U02). Enrichment
 * scored every PC's vows and fell back to "the sole open vow", so a shared
 * vow's two copies, two PCs' own vows, or a solo PC's background and inciting
 * vows all scored 0: a certain miss. The roller's own vow is scored now — a
 * shared vow's copies counted as one — and with several to choose from the
 * move is not rolled: a "Which vow?" card asks, and a pick, applied once on
 * the canonical GM, rolls that vow as the roller.
 *
 * End to end on a booted table (tests/helpers/multiClient.js): the player
 * clicks the GM-authored move card's button on their own client, the
 * canonical GM's real pipeline scores and resolves the move (scripted
 * challenge dice), and the pick relays through gmRelay "fulfilVow.pick".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Challenge dice 3 and 4: a progress score above 4 is a strong hit.
const control = vi.hoisted(() => ({ dice: [0.25, 0.35] }));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { resolveMove } from '../../src/moves/resolver.js';

const REPLY = 'The oath is kept.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table;

function vowItem(id, name, vowId, ticks) {
  const item = {
    id, name, type: 'progress',
    system: { subtype: 'vow', rank: 'formidable', current: ticks, completed: false },
    flags: { [MODULE_ID]: { vowId } },
    update: async (changes) => {
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
      if ('system.current' in changes) item.system.current = changes['system.current'];
    },
    setFlag: async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; },
  };
  return item;
}

/** The move card a quest-advancing hit posts, with its milestone row. */
async function postMoveCard() {
  const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-move-result sf-strong-hit"><div class="sf-move-name">Gather Information</div>`
      + `<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-attempt-fulfill-vow">🏁 Attempt to Fulfill Vow</button></div></div>`,
    flags: { [MODULE_ID]: { moveResolution: true, resolutionId: 'res-1', milestoneSuggestion: { eligible: true } } },
  }));
  await table.settle();
  return msg.id;
}

async function click(userId, cardId, selector) {
  table.client(userId).click(cardId, selector);
  await table.settle(); await table.drain();
}

const scored = () => resolveMove.mock.calls.map(([interp]) => ({ moveTargetId: interp.moveTargetId ?? null, statValue: interp.statValue }));

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.25, 0.35];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table, { fallback: () => REPLY });
  resolveMove.mockClear();
});

describe('Attempt to Fulfill Vow names no vow (issue #321 U02)', () => {
  it('a shared vow held by two PCs is one vow: the button scores it, nothing asked', async () => {
    const bexCopy = vowItem('v-bex', 'Rescue Dani', 'vid-dani', 32);
    const ashCopy = vowItem('v-ash', 'Rescue Dani', 'vid-dani', 32);
    table.addActor({ id: 'pc-ash', name: 'Ash', ownership: { 'pl-2': 3 }, items: { contents: [ashCopy] } });
    table.addActor({ id: 'pc-bex', name: 'Bex', ownership: { 'pl-1': 3 }, items: { contents: [bexCopy] } });

    await click('pl-1', await postMoveCard(), '[data-action="sf-attempt-fulfill-vow"]');

    expect(table.cards(f => f.whichVowCard)).toHaveLength(0);
    expect(scored()).toEqual([{ moveTargetId: null, statValue: 32 }]);   // was 0 — a certain miss
    expect(bexCopy.system.completed).toBe(true);
  }, 30_000);

  it('two PCs\' own vows: the roller\'s is scored', async () => {
    table.addActor({ id: 'pc-ash', name: 'Ash', ownership: { 'pl-2': 3 }, items: { contents: [vowItem('v-ash', 'Repay the Syndicate', 'vid-debt', 4)] } });
    const bexVow = vowItem('v-bex', 'Find my sister', 'vid-sis', 24);
    table.addActor({ id: 'pc-bex', name: 'Bex', ownership: { 'pl-1': 3 }, items: { contents: [bexVow] } });

    await click('pl-1', await postMoveCard(), '[data-action="sf-attempt-fulfill-vow"]');

    expect(table.cards(f => f.whichVowCard)).toHaveLength(0);
    expect(scored()).toEqual([{ moveTargetId: null, statValue: 24 }]);
  }, 30_000);

  it('a solo PC\'s two vows: nothing rolled — "Which vow?" asks; the pick rolls that vow, once, as the roller', async () => {
    const background = vowItem('v-bg', 'Background Vow', 'vid-bg', 8);
    const inciting   = vowItem('v-inc', 'Rescue Dani', 'vid-dani', 32);
    table.addActor({ id: 'pc-bex', name: 'Bex', ownership: { 'pl-1': 3 }, items: { contents: [background, inciting] } });

    await click('pl-1', await postMoveCard(), '[data-action="sf-attempt-fulfill-vow"]');

    expect(resolveMove).not.toHaveBeenCalled();
    expect(table.world.campaignState().pendingMove).toBe(false);
    const [card] = table.cards(f => f.whichVowCard);
    expect(card.flags[MODULE_ID]).toMatchObject({ actorId: 'pc-bex' });
    expect(card.flags[MODULE_ID].choices.map(c => c.itemId)).toEqual(['v-bg', 'v-inc']);

    // The player picks; then the GM presses another vow on the same card.
    await click('pl-1', card._id, '[data-action="sf-which-vow"][data-item-id="v-inc"]');
    await click('gm-1', card._id, '[data-action="sf-which-vow"][data-item-id="v-bg"]');

    expect(scored()).toEqual([{ moveTargetId: 'v-inc', statValue: 32 }]);
    expect(inciting.system.completed).toBe(true);
    expect(background.system.completed).toBe(false);
    const forced = table.cards(f => f.forcedMoveId === 'fulfill_your_vow' && f.forcedMoveTargetId);
    expect(forced).toHaveLength(1);
    expect(forced[0].speaker?.actor).toBe('pc-bex');

    // A fresh render of the card shows it used.
    const root = table.client('pl-1').render(card._id);
    expect(root.querySelectorAll('[data-action="sf-which-vow"]').every(b => b.disabled)).toBe(true);
  }, 30_000);

  it('only the roller\'s player (or a GM) may pick for them', async () => {
    table.addActor({ id: 'pc-ash', name: 'Ash', ownership: { 'pl-2': 3 }, items: { contents: [] } });
    table.addActor({ id: 'pc-bex', name: 'Bex', ownership: { 'pl-1': 3 }, items: {
      contents: [vowItem('v-bg', 'Background Vow', 'vid-bg', 8), vowItem('v-inc', 'Rescue Dani', 'vid-dani', 32)],
    } });
    await click('pl-1', await postMoveCard(), '[data-action="sf-attempt-fulfill-vow"]');
    const [card] = table.cards(f => f.whichVowCard);

    silenceConsoleErrors();
    await click('pl-2', card._id, '[data-action="sf-which-vow"][data-item-id="v-inc"]');

    expect(resolveMove).not.toHaveBeenCalled();
    expect(table.world.message(card._id).flags[MODULE_ID].resolved ?? false).toBe(false);
  }, 30_000);

  it('a picked vow fulfilled before the pick lands is not rolled — and says so', async () => {
    const background = vowItem('v-bg', 'Background Vow', 'vid-bg', 8);
    const inciting   = vowItem('v-inc', 'Rescue Dani', 'vid-dani', 32);
    table.addActor({ id: 'pc-bex', name: 'Bex', ownership: { 'pl-1': 3 }, items: { contents: [background, inciting] } });
    await click('pl-1', await postMoveCard(), '[data-action="sf-attempt-fulfill-vow"]');
    const [card] = table.cards(f => f.whichVowCard);

    inciting.system.completed = true;                     // fulfilled on the sheet meanwhile
    await click('pl-1', card._id, '[data-action="sf-which-vow"][data-item-id="v-inc"]');

    expect(resolveMove).not.toHaveBeenCalled();
    expect(table.cards(f => f.trackGoneCard)).toHaveLength(1);
  }, 30_000);
});
