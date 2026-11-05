/**
 * Known-issues SWEAR-ROLL-VOW-GONE (found while fixing issue #338) — a "🆕 New
 * vow recorded" card's ⚔ Swear it (roll) refuses a vow nobody holds any more,
 * and says so.
 *
 * Kira's player wrote "Find Chen" on her sheet; the card offered ⚔ Swear it
 * (roll). She deleted the vow Item, then pressed it: the swear still rolled —
 * +2 momentum on a strong hit and an oath scene for a vow that no longer
 * exists. The card's 🤝 Link and reward pick already close a vow nobody holds
 * (`vowGone`, issue #336 Y27); the swear now does the same: refused when no
 * character holds the card's vow or the card is `vowGone`, the card closed,
 * and the presser and the GMs whispered why.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const SWEAR = '[data-action="sf-player-vow-swear"]';

let table, kiraItems;
const swears = () => table.cards(f => f.forcedMoveId === 'swear_an_iron_vow');
const flags  = (id) => table.world.message(id).flags[MODULE_ID];
const told   = () => table.cards(f => f.vowWriteRefusedNotice);

function makeVow(id, name) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId: id } },
    system: { subtype: 'vow', rank: 'dangerous', current: 0, completed: false },
    async update() { return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

/** Kira's "🆕 New vow recorded" card, as the createItem hook posts it on the canonical GM. */
async function postVowCard(extra = {}) {
  const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-card sf-player-vow"><div class="sf-card-body">`
      + `<p><button type="button" class="entity-btn" data-action="sf-player-vow-swear">⚔ Swear it (roll)</button></p></div></div>`,
    flags: { [MODULE_ID]: { playerVowCard: true, vowName: 'Find Chen', vowId: 'vow-kira', actorId: 'pc-kira', ...extra } },
  }));
  await table.settle();
  return msg.id;
}

async function press(userId, id) {
  table.client(userId).click(id, SWEAR);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sg-s1', sessionNumber: 1,
      currentSceneId: 'sg-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kiraItems = [makeVow('vow-kira', 'Find Chen')];
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, hasPlayerOwner: true, items: { contents: kiraItems } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, hasPlayerOwner: true });
  scriptClaude(table, { fallback: () => 'The oath hangs in the air.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe('⚔ Swear it (roll) on a vow nobody holds any more (SWEAR-ROLL-VOW-GONE)', () => {
  it('its vow Item deleted: nothing is sworn, the card is closed, and Kira\'s player and the GMs are told why', async () => {
    const id = await postVowCard();
    kiraItems.splice(0);                                   // Kira deletes "Find Chen" from her sheet

    await press('pl-1', id);

    expect(swears(), 'no swear posted — no momentum, no oath scene').toHaveLength(0);
    expect(flags(id).vowGone, 'the card is closed').toBe(true);
    expect(flags(id).swearRolled ?? false).toBe(false);
    const [note, ...more] = told();
    expect(more).toHaveLength(0);
    expect(note.content).toMatch(/No character holds this vow any more/);
    expect(new Set(note.whisper)).toEqual(new Set(['pl-1', 'gm-1']));
  }, 30_000);

  it('once closed, the button renders disabled everywhere and a later press swears nothing', async () => {
    const id = await postVowCard();
    kiraItems.splice(0);
    await press('pl-1', id);

    expect(table.client('pl-1').render(id).querySelector(SWEAR).disabled).toBe(true);
    await press('gm-1', id);
    expect(swears()).toHaveLength(0);
  }, 30_000);

  it('a card the 🤝 Link already closed (`vowGone`) is refused too, and says so', async () => {
    const id = await postVowCard({ vowGone: true });
    // A stale render (or another client) still shows the button armed.
    await table.client('gm-1').run(async () => {
      const { applyPlayerVowSwearFromRelay } = await table.client('gm-1').import('../../src/session/swearVow.js');
      return applyPlayerVowSwearFromRelay({ messageId: id }, { requesterId: 'gm-1', requester: { id: 'gm-1', isGM: true }, requesterIsGM: true });
    });
    await table.settle(); await table.drain();
    expect(swears()).toHaveLength(0);
    expect(told().map(n => n.content).join(' ')).toMatch(/No character holds this vow any more/);
  }, 30_000);

  it('control: with the vow on her sheet, Kira\'s press swears it once, as Kira', async () => {
    const id = await postVowCard();
    await press('pl-1', id);
    expect(swears().map(m => m.speaker?.actor)).toEqual(['pc-kira']);
    expect(flags(id).vowGone ?? false).toBe(false);
    expect(told()).toHaveLength(0);
  }, 30_000);
});
