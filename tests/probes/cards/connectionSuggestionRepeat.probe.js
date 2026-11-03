/**
 * PROBE — IC CONNECTION-SUGGESTION-REPEAT
 *
 * What the user does: a connection move's hit (Make a Connection, Test Your
 * Relationship) carries "🤝 Develop Relationship" / "🔗 Forge a Bond"
 * (renderConnectionSuggestionHtml). The player presses "🤝 Develop
 * Relationship" and picks Sable; the GM — on their own screen, where the
 * button is still live — presses it too (or the player does again after the
 * card re-renders: the pipeline's own `originalApplied` stamp re-renders
 * every move card a moment after it is posted).
 *
 * What happens: wireConnectionSuggestionButtons (src/index.js ~7125) disables
 * the button in the clicker's DOM only and claims nothing on the card; each
 * press posts a NEW picker card (postConnectionPickerCard, from the clicker's
 * client), each one-shot on its own, so each press develops the relationship
 * again — the shape issue #321 U20 fixed for "⚑ Mark Progress on Vow" and
 * "🔁 Recommit" (SUGGESTION-BUTTONS-REPEAT), not applied to these two.
 *
 * What should happen: one development per move card — the suggestion claimed
 * on the GM-authored card (a relayed kind, as milestone.suggestion), or the
 * button closed for everyone once its picker exists.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.65] }));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => { throw new Error('interpreter called for a forced move'); }),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, sable;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
    connectionIds: ['conn-sable'],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-bex', name: 'Bex', ownership: { 'pl-1': 3 } });
  sable = table.addActor({
    id: 'conn-sable', name: 'Sable', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-sable', name: 'Sable', rank: 'dangerous', role: 'Pilot',
      relationshipTicks: 0, bonded: false, active: true, history: [],
    } } },
  });
  silenceConsoleErrors();
});

const ticks = () => sable.flags[MODULE_ID].connection.relationshipTicks;

async function postConnectionMoveCard() {
  const card = await table.client('gm-1').run(() => ChatMessage.create({
    content: `<div class="sf-move-result sf-strong-hit"><div class="sf-move-name">Make a Connection</div>`
      + `<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-develop-relationship">🤝 Develop Relationship</button>`
      + `<button type="button" class="sf-followup-btn" data-action="sf-forge-bond">🔗 Forge a Bond</button></div></div>`,
    flags: { [MODULE_ID]: { moveResolution: true, resolutionId: 'res-1', actorId: 'pc-bex', connectionSuggestion: { eligible: true, count: 1 } } },
  }));
  await table.settle();
  return card.id;
}

async function developFrom(userId, cardId) {
  const before = table.cards(f => f.connectionPicker).map(c => c._id);
  table.client(userId).click(cardId, '[data-action="sf-develop-relationship"]');
  await table.settle(); await table.drain();
  const picker = table.cards(f => f.connectionPicker).find(c => !before.includes(c._id));
  if (!picker) return false;
  table.client(userId).click(picker._id, '[data-action="sf-connection-pick"][data-host-id="conn-sable"]');
  await table.settle(); await table.drain();
  return true;
}

describe('PROBE IC CONNECTION-SUGGESTION-REPEAT', () => {
  it('the player and the GM each pressing "🤝 Develop Relationship" on one move card develop Sable once', async () => {
    const id = await postConnectionMoveCard();

    await developFrom('pl-1', id);
    expect(ticks()).toBe(8);                    // one Dangerous mark

    await developFrom('gm-1', id);
    // Expected: still one mark for one card. Today: a second picker, a second develop.
    expect(ticks()).toBe(8);
  }, 30_000);

  it('the player\'s own button is live again after the card re-renders', async () => {
    const id = await postConnectionMoveCard();
    await developFrom('pl-1', id);
    const root = table.client('pl-1').render(id);
    expect(root.querySelector('[data-action="sf-develop-relationship"]').disabled).toBe(true);
  }, 30_000);
});
