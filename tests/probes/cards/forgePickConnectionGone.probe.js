/* global silenceConsoleErrors */
/**
 * Twelfth audit — CARD area probe.
 *
 * CARD-4 FORGE-PICK-ROLLED-AFTER-CONNECTION-GONE (RULES / WRONG-DETAIL)
 *
 * A move card's "🔗 Forge a Bond" posts a connection picker (index.js
 * postConnectionPickerCard ~6003); its pick posts the forced Forge a Bond with
 * the connection's host id (cardActions.applyConnectionPick ~158,
 * `forcedMoveTargetId`). Every other roll started from a track names it by id
 * and is "not rolled" when that track was deleted or finished meanwhile —
 * rollMove's guard (movePipeline.js ~759-766: tickInfo.source combat /
 * expedition / vow / scene_challenge, issue #306 R06, #321 U02, #342 Z07).
 * Forge a Bond's source is "connection" and is not in that list:
 *
 *   - the connection was severed (`!sever` → record `active: false`) or
 *     deleted before the pick: enrichProgressTicks (statEnrichment.js ~687)
 *     resolves nothing for the id and scores 0 — the forge is rolled as a
 *     certain miss ("Conflicting motivation revealed. Recommit: …"), narrated
 *     as a failed bond with a connection that no longer exists, and the
 *     recommit offer it promises is silently skipped;
 *   - the connection was bonded since (a typed Forge a Bond, the sheet, a
 *     second picker): selectConnection's id rung ignores `unbonded`
 *     (developRelationship.js ~168), so the bonded track is scored; a hit
 *     posts "Bond forged. Legacy reward marked on bonds track. Choose:
 *     Bolster Influence (+2) OR Expand Influence…" while the forge branch
 *     skips it as already bonded (movePipeline.js ~970-982) — no legacy is
 *     marked, the card says it was.
 *
 * Driven on a booted table: the real picker from the real suggestion button,
 * the pick through the real pipeline (connectionSuggestionRoller.test.js's
 * set-up).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.0, 0.0] }));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => { throw new Error('interpreter called for a forced move'); }),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, sable;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.0, 0.0];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [], connectionIds: ['conn-sable'],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, hasPlayerOwner: true });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, hasPlayerOwner: true });
  sable = table.addActor({
    id: 'conn-sable', name: 'Sable', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-sable', name: 'Sable', rank: 'dangerous', role: 'Pilot',
      relationshipTicks: 24, bonded: false, active: true, history: [],
    } } },
  });
  scriptClaude(table, { fallback: () => 'Sable weighs the offer.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

/** Kira's Make a Connection card, as postMoveResult posts it, with its suggestion row. */
async function kirasConnectionCard() {
  const card = await table.client('gm-1').run(() => ChatMessage.create({
    content: '<div class="sf-move-result sf-strong-hit"><div class="sf-move-name">Make a Connection</div>'
      + '<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-develop-relationship">🤝 Develop Relationship</button>'
      + '<button type="button" class="sf-followup-btn" data-action="sf-forge-bond">🔗 Forge a Bond</button></div></div>',
    flags: { [MODULE_ID]: { moveResolution: true, resolutionId: 'res-kira', actorId: 'pc-kira',
      connectionSuggestion: { eligible: true, count: 1 } } },
  }));
  await table.settle();
  return card.id;
}

/** Kira's player presses 🔗 Forge a Bond; `between` runs once the picker is up; then she picks Sable. */
async function forgeSable(between) {
  const id = await kirasConnectionCard();
  table.client('pl-1').click(id, '[data-action="sf-forge-bond"]');
  await table.settle(); await table.drain();
  const picker = table.cards(f => f.connectionPicker).at(-1);
  expect(picker, 'the picker lists Sable (setup)').toBeTruthy();
  await between?.();
  table.client('pl-1').click(picker._id, '[data-action="sf-connection-pick"][data-host-id="conn-sable"]');
  await table.settle(); await table.drain();
}

const setSable = async (patch) => {
  const rec = sable.flags[MODULE_ID].connection;
  await table.client('gm-1').run(() => game.actors.get('conn-sable')
    .update({ [`flags.${MODULE_ID}.connection`]: { ...rec, ...patch } }));
  await table.settle();
};

const forgeResults = () => table.cards(f => f.moveResolution && f.resolutionId !== 'res-kira')
  .filter(m => /Forge a Bond/.test(String(m.content ?? '')));
const notRolledCards = () => table.cards(f => f.trackGoneCard);

describe('CARD-4 — a Forge a Bond pick whose connection changed after the picker was posted', () => {
  it('control: Sable unchanged — the pick is rolled and forges the bond', async () => {
    await forgeSable();
    expect(forgeResults()).toHaveLength(1);
    expect(sable.flags[MODULE_ID].connection.bonded).toBe(true);
  }, 30_000);

  it('Sable severed meanwhile — nothing is rolled, and the table is told (as a gone fight or vow is)', async () => {
    await forgeSable(() => setSable({ active: false }));
    expect({ rolled: forgeResults().length, told: notRolledCards().length }).toEqual({ rolled: 0, told: 1 });
  }, 30_000);

  it('Sable bonded meanwhile — the forge is not rolled again, and no card says a legacy reward was marked', async () => {
    await forgeSable(() => setSable({ bonded: true }));
    const said = forgeResults().map(m => String(m.content ?? '')).join('\n');
    expect(said).not.toContain('Legacy reward marked');
    expect(forgeResults()).toHaveLength(0);
  }, 30_000);
});
