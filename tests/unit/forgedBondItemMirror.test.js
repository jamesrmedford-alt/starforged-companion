/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/forgedBondItemMirror.test.js
 *
 * Issue #342 Z57 (FORGED-BOND-ITEM-NOT-MIRRORED) — a bond forged through the
 * module reaches the PC's bond Item.
 *
 * The connection record is canonical and each PC's `progress` Item with
 * `system.subtype: "bond"` is its write-through mirror (connection-flow.md;
 * BOND-ITEM-MIRROR): ticks (`setBondItemTicks`), rank (`setBondItemRank`) and
 * a loss (`setBondItemLost`, issue #330 D10 — "a module flag, not the
 * vendor's `system.completed`, which the sheet renders as a forged bond").
 * A Forge a Bond hit flipped the record (`forgeBond`: `bonded: true`) and
 * wrote nothing to the Items, so Kira's sheet kept Sable an unforged
 * connection and CHARACTER STATE (readConnections → `completed`) never said
 * the bond was forged, while the ENTITIES IN SCENE card said it was. The
 * forge now writes through (`setBondItemForged` — `system.completed`), and
 * CHARACTER STATE names a completed bond "bonded", not "fulfilled".
 *
 * Driven on a booted table: the forced `forge_a_bond` the 🔗 picker posts,
 * through the real pipeline, scripted strong hit.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Challenge dice 1 and 2 against a full track (score 10): a strong hit.
const control = vi.hoisted(() => ({ dice: [0.0, 0.15] }));
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
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, sable, bondItem, rensBond;

function makeBondItem(id) {
  const item = {
    id, name: 'Sable', type: 'progress',
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
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
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
  bondItem = makeBondItem('bond-sable');
  rensBond = makeBondItem('bond-sable-ren');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [bondItem] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [rensBond] } });
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

  it('every PC\'s bond Item for the connection follows the record, as its ticks and rank do', async () => {
    await forgeWithSable();
    expect([bondItem, rensBond].map(i => i.system.completed)).toEqual([true, true]);
  }, 30_000);

  it('CHARACTER STATE, read from the sheet, says the bond is forged — "bonded", not "fulfilled"', async () => {
    await forgeWithSable();
    const gm = table.client('gm-1');
    const { readCharacterSnapshot } = await gm.import('../../src/character/actorBridge.js');
    const { buildNarratorSystemPrompt } = await gm.import('../../src/narration/narratorPrompt.js');
    const prompt = await gm.run(() => buildNarratorSystemPrompt(
      { safety: { lines: [], veils: [], privateLines: [] }, worldTruths: {}, connectionIds: [] },
      { narrationTone: 'wry', narrationLevity: 'default', narrationPerspective: 'auto', narrationLength: 3, narrationInstructions: '' },
      readCharacterSnapshot(game.actors.get('pc-kira')), '', { mode: 'paced_narrative' }));
    expect(prompt).toContain('Connections: Sable (dangerous, progress 10/10, bonded)');
    expect(prompt).not.toMatch(/Sable \([^)]*fulfilled/);
  }, 30_000);
});
