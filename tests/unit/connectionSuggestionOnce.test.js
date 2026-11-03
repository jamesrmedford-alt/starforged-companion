/**
 * A move card's "🤝 Develop Relationship" develops the relationship once
 * (issue #325 W11).
 *
 * Each press posted a fresh connection picker from the clicker's client and
 * stamped nothing on the move card, so the player and the GM each pressing it
 * — or one press after a re-render — gave two pickers and developed Sable
 * twice. The press now relays to the canonical GM, which claims the move card
 * (`connectionSuggestionTaken`) before posting the one picker.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.65] }));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => { throw new Error('interpreter called for a forced move'); }),
}));
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
import { CampaignStateSchema } from '../../src/schemas.js';

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

describe('the connection suggestion buttons', () => {
  it('the player and the GM each pressing "🤝 Develop Relationship" on one move card develop Sable once', async () => {
    const id = await postConnectionMoveCard();

    await developFrom('pl-1', id);
    expect(ticks()).toBe(8);                    // one Dangerous mark

    await developFrom('gm-1', id);
    // Still one mark for one card.
    expect(ticks()).toBe(8);
  }, 30_000);

  it('the player\'s own button is live again after the card re-renders', async () => {
    const id = await postConnectionMoveCard();
    await developFrom('pl-1', id);
    const root = table.client('pl-1').render(id);
    expect(root.querySelector('[data-action="sf-develop-relationship"]').disabled).toBe(true);
  }, 30_000);
});
