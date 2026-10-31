/**
 * PROBE — NATIVE-BOND-ROLL-UNNARRATED
 *
 * A connection's progress roll made from the foundry-ironsworn sheet (the
 * Connections tab's roll button → ProgressModel.fulfill()) carries no
 * moveDsId — the vendor sets one only for subtype "vow"
 * (vendor/.../item/subtypes/progress.ts fulfill()). classifyProgressRoll then
 * falls back to the caller's subtype lookup. Connection progress Items are
 * subtype "bond" (vendor sf-connections.vue newConnection, actorBridge.js
 * createBondItem). The GM-side consequence hook's lookup accepts "bond"
 * (index.js ~4338), but the narration hook's lookup (index.js ~2260) accepts
 * only "vow" / "connection" — so the roller's client never narrates a
 * sheet-rolled Forge a Bond, while the canonical GM pays it.
 *
 * Correct behaviour (asserted): the roller's keyed client narrates a native
 * connection progress roll as it narrates a vow's.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
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

describe('PROBE NATIVE-BOND-ROLL-UNNARRATED', () => {
  it('control: a vow rolled on the sheet (no moveDsId) is narrated by the roller', async () => {
    await rollOnSheet('Find Chen');
    expect(table.claude.by('gm-1').filter(c => /Resolving: Find Chen/.test(c.userText))).toHaveLength(1);
    expect(table.cards(f => f.narratorCard && f.moveId === 'fulfill_your_vow')).toHaveLength(1);
  }, 30_000);

  it('a connection (subtype "bond") rolled on the sheet is narrated by the roller', async () => {
    await rollOnSheet('Sable');
    // Expected: one narration call for the Forge a Bond roll. Actual: none —
    // the roll is classified "not-vow-or-connection" and skipped.
    expect(table.claude.by('gm-1').filter(c => /Resolving: Sable/.test(c.userText))).toHaveLength(1);
    expect(table.cards(f => f.narratorCard && f.moveId === 'forge_a_bond')).toHaveLength(1);
  }, 30_000);
});
