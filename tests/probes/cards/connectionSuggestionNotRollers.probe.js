/**
 * CARD-3 — a move card's "🤝 Develop Relationship" / "🔗 Forge a Bond" is not
 * its roller's follow-up (eleventh audit, cards).
 *
 * At a two-PC table (Ren, created first — the campaign's "first PC"; Kira)
 * Kira's Make a Connection hits and her move card (its `actorId`: pc-kira)
 * offers "🤝 Develop Relationship". The press relays `connection.suggest`
 * (cardActions.applyConnectionSuggestion — no ownership check, no roller) and
 * the picker it posts names no roller (postConnectionPickerCard); the pick
 * (`connection.pick`, applyConnectionPick) speaks as the PRESSER's PC
 * (relayedClickerPc). So the GM's press — the usual way a GM runs the table's
 * buttons — develops the relationship as Ren (a GM's clicker PC is the first
 * PC), and Ren's player may press Kira's card and take her follow-up as Ren.
 * Decisions: "a card's forced follow-up is the card's roller's move, whoever
 * presses it" (issue #329 X05) and "is its roller's player's or a GM's to
 * press … a non-owner refused, posted as the roller" (issue #338 D1); issue
 * #335 Y11 moved Battle and the way-out off-ramps — two of W11's "shared"
 * buttons — to the card's roller on exactly this ground.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
const developPosts = () => table.cards(f => f.forcedMoveId === 'develop_your_relationship');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [], connectionIds: ['conn-sable'],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  // Ren first: the campaign's "first PC" — what a GM's own press resolves to.
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, hasPlayerOwner: true });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, hasPlayerOwner: true });
  table.addActor({
    id: 'conn-sable', name: 'Sable', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-sable', name: 'Sable', rank: 'dangerous', role: 'Pilot',
      relationshipTicks: 0, bonded: false, active: true, history: [],
    } } },
  });
  scriptClaude(table, { fallback: () => 'Sable laughs.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

/** Kira's Make a Connection result card, as postMoveResult posts it: her roll, the suggestion row. */
async function kirasConnectionCard() {
  const card = await table.client('gm-1').run(() => ChatMessage.create({
    content: '<div class="sf-move-result sf-strong-hit"><div class="sf-move-name">Make a Connection</div>'
      + '<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-develop-relationship">🤝 Develop Relationship</button>'
      + '<button type="button" class="sf-followup-btn" data-action="sf-forge-bond">🔗 Forge a Bond</button></div></div>',
    flags: { [MODULE_ID]: { moveResolution: true, resolutionId: 'res-kira', actorId: 'pc-kira', connectionSuggestion: { eligible: true, count: 1 } } },
  }));
  await table.settle();
  return card.id;
}

/** `userId` presses 🤝 Develop on the card, then picks Sable on the picker it posts. */
async function developSableFrom(userId, cardId) {
  table.client(userId).click(cardId, '[data-action="sf-develop-relationship"]');
  await table.settle(); await table.drain();
  const picker = table.cards(f => f.connectionPicker).at(-1);
  if (!picker) return null;
  table.client(userId).click(picker._id, '[data-action="sf-connection-pick"][data-host-id="conn-sable"]');
  await table.settle(); await table.drain();
  return picker;
}

describe('Kira\'s move card\'s 🤝 Develop Relationship is Kira\'s follow-up', () => {
  it('control: pressed and picked by Kira\'s own player, it develops Sable as Kira', async () => {
    const id = await kirasConnectionCard();
    expect(await developSableFrom('pl-1', id)).toBeTruthy();
    expect(developPosts().map(p => p.speaker?.actor ?? null)).toEqual(['pc-kira']);
  }, 30_000);

  it('the GM\'s press develops it as Kira, the card\'s roller — not the first PC', async () => {
    const id = await kirasConnectionCard();
    const picker = await developSableFrom('gm-1', id);
    expect(picker, 'the picker was posted').toBeTruthy();
    expect(developPosts().map(p => p.speaker?.actor ?? null)).toEqual(['pc-kira']);
  }, 30_000);

  it('Ren\'s player cannot take Kira\'s follow-up as Ren', async () => {
    const id = await kirasConnectionCard();
    await developSableFrom('pl-2', id);
    expect(developPosts().map(p => p.speaker?.actor ?? null)).not.toContain('pc-ren');
  }, 30_000);
});
