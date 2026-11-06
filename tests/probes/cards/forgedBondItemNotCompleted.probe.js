/**
 * CARD-4 — a bond forged through the module never reaches the PC's bond Item
 * (eleventh audit, cards).
 *
 * The connection record is canonical and each PC's `progress` Item with
 * `system.subtype: "bond"` is its write-through mirror (connection-flow.md;
 * BOND-ITEM-MIRROR): ticks (`setBondItemTicks`), rank (`setBondItemRank`) and
 * a loss (`setBondItemLost`, issue #330 D10 — "a module flag, not the
 * vendor's `system.completed`, which the sheet renders as a forged bond").
 * A Forge a Bond hit flips the record (`forgeBond`: `bonded: true`) and
 * writes nothing to the Items, so Kira's sheet keeps Sable an unforged
 * connection and CHARACTER STATE (readConnections → `completed`) never says
 * the bond is forged, while the ENTITIES IN SCENE card says it is.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Challenge dice 1 and 2 against a full track (score 10): a strong hit.
const control = vi.hoisted(() => ({ dice: [0.0, 0.15] }));
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
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, sable, bondItem;

function makeBondItem() {
  const item = {
    id: 'bond-sable', name: 'Sable', type: 'progress',
    system: { subtype: 'bond', rank: 2, current: 40, completed: false },
    flags: { [MODULE_ID]: { connectionId: 'rec-sable' } },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split('.');
        let at = item;
        for (const p of parts.slice(0, -1)) at = (at[p] ??= {});
        at[parts.at(-1)] = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.0, 0.15];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [], connectionIds: ['conn-sable'],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  bondItem = makeBondItem();
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [bondItem] } });
  sable = table.addActor({
    id: 'conn-sable', name: 'Sable', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-sable', name: 'Sable', rank: 'dangerous', role: 'Pilot',
      relationshipTicks: 40, bonded: false, active: true, history: [],
    } } },
  });
  scriptClaude(table, { fallback: () => 'Sable clasps your hand.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

/** Kira's Forge a Bond with Sable, as the connection picker posts it: forced, Sable by host id. */
async function forgeWithSable() {
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: 'Forge a bond with Sable.',
    speaker: { actor: 'pc-kira', alias: 'Kira' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'forge_a_bond', deferWhileBusy: true,
      forcedMoveTarget: 'Sable', forcedMoveTargetId: 'conn-sable' } },
  }));
  await table.settle(); await table.drain();
}

describe('a Forge a Bond hit through the pipeline', () => {
  it('control: the record is forged (bonded) and the forge card posts', async () => {
    await forgeWithSable();
    expect(sable.flags[MODULE_ID].connection.bonded).toBe(true);
    expect(table.cards(f => f.forgeABondCard || f.forgeBondCard).length + table.cards(f => f.moveResolution).length).toBeGreaterThan(0);
  }, 30_000);

  it('Kira\'s bond Item — the record\'s mirror — shows the bond forged', async () => {
    await forgeWithSable();
    expect(sable.flags[MODULE_ID].connection.bonded).toBe(true);
    expect(bondItem.system.completed).toBe(true);
  }, 30_000);
});
