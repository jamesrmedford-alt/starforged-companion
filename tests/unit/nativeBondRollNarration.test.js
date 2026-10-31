/**
 * A connection's progress roll made from the foundry-ironsworn sheet is
 * narrated as Forge a Bond (issue #321 U21).
 *
 * The Connections tab's roll button (ProgressModel.fulfill()) carries no
 * moveDsId — the vendor sets one only for subtype "vow" — so
 * classifyProgressRoll falls back to the caller's subtype lookup. Connection
 * progress Items are subtype "bond" (vendor sf-connections.vue newConnection,
 * actorBridge createCharacterBondItem). The canonical GM's payoff hook
 * accepted "bond", but the narration hook accepted only "vow" / "connection",
 * so a sheet-rolled Forge a Bond was paid and never narrated. Both hooks now
 * share one lookup (nativeProgressSubtypeLookup, src/index.js).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;

// The vendor roll card: JSON HTML-escaped inside a single-quoted attribute.
function nativeProgressCard({ source, value, dice, moveDsId }) {
  const roll = {
    preRollOptions: { progress: { source, value }, actorId: 'pc-1', ...(moveDsId ? { moveDsId } : {}) },
    rawChallengeDiceValues: dice,
  };
  const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: true } } } });
  table.addActor({
    id: 'pc-1', name: 'Kira', type: 'character', hasPlayerOwner: true,
    items: { contents: [
      { id: 'vow-1', type: 'progress', name: 'Find Chen', system: { subtype: 'vow', rank: 'dangerous', current: 0 }, flags: {} },
      { id: 'bond-1', type: 'progress', name: 'Sable', system: { subtype: 'bond', rank: 'dangerous', current: 0 }, flags: {} },
    ] },
  });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  silenceConsoleErrors();   // narration internals may warn on the stub world; assertions are on Claude calls
});

async function rollOnSheet(source) {
  const gm = table.client('gm-1');
  // A miss: no payoff on the GM side, so only the narration path is exercised.
  await gm.run(() => globalThis.ChatMessage.create({
    content: nativeProgressCard({ source, value: 1, dice: [5, 8] }),
    speaker: { actor: 'pc-1', alias: 'Kira' },
    // The vendor posts its roll card with the Roll attached (ironsworn-roll-message.ts),
    // which keeps it out of the move pipeline (isPlayerNarration).
    rolls: [{ formula: '{d10,d10}', total: 0 }],
  }));
  await table.settle();
}

describe('a progress roll made on the sheet is narrated by its subtype', () => {
  it('control: a vow (no moveDsId) is narrated as Fulfill Your Vow', async () => {
    await rollOnSheet('Find Chen');
    expect(table.claude.by('gm-1').filter(c => /Resolving: Find Chen/.test(c.userText))).toHaveLength(1);
    expect(table.cards(f => f.narratorCard && f.moveId === 'fulfill_your_vow')).toHaveLength(1);
  }, 30_000);

  it('a connection (subtype "bond") is narrated as Forge a Bond', async () => {
    await rollOnSheet('Sable');
    expect(table.claude.by('gm-1').filter(c => /Resolving: Sable/.test(c.userText))).toHaveLength(1);
    expect(table.cards(f => f.narratorCard && f.moveId === 'forge_a_bond')).toHaveLength(1);
  }, 30_000);
});
