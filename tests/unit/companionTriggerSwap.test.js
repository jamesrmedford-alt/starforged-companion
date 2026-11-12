/**
 * STARFORGED COMPANION
 * tests/unit/companionTriggerSwap.test.js
 *
 * COMPANION-TRIGGER-SWAP-UNCUED (issue #345 AA10's residual).
 *
 * (a) General-trigger companion abilities — "When you make a move by sending
 *     the rockhorn …, roll +its health" (Rockhorn, Utility Bot, Voidglider) —
 *     name no move, so only the model's pass offered their swap, and not at
 *     all when another ability linked the move. A structured rule now offers
 *     one on an action move whose line names that companion (its asset's name
 *     or the name the player gave it), with its "+its health".
 * (b) Two checked abilities offering "+its health" stamped no asset, so the
 *     healthiest companion was rolled. The confirm form now has a radio per
 *     companion, and the roll is the one picked.
 */

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], abilities: [], pick: null }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ moveId: 'face_danger', moveName: 'Face Danger',
    statUsed: 'edge', adds: 0, playerNarration: text, inputMethod: 'chat', rationale: 'test', mischiefApplied: false })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => {
  const real = await original();
  return { ...real, scanForApplicableAbilities: vi.fn(async (args) => (control.abilities ? structuredClone(control.abilities) : real.scanForApplicableAbilities(args))) };
});
// The confirm dialog: the real form, the radio `control.pick` checked, Accept read as #onAccept reads it.
vi.mock('../../src/ui/settingsPanel.js', async (original) => {
  const real = await original();
  const { parseHTML } = await import('../helpers/cardDom.js');
  return { ...real, confirmInterpretation: vi.fn(async (interp) => {
    const root = parseHTML(`<div>${real.renderMoveAbilitiesForm(interp.applicableAbilities ?? [], interp.statUsed)}</div>`);
    for (const r of root.querySelectorAll('input[name="sf-stat-sub"]')) r.checked = r.getAttribute('value') === control.pick;
    const { total, applied, pickedStat, pickedStatAssetId } = real.readMoveAbilitiesForm(root);
    interp.appliedAbilityAdds = total;
    interp.appliedAbilityKeys = applied;
    interp.appliedStatReplacement = pickedStat || null;
    interp.appliedStatAssetId = pickedStatAssetId || null;
    return true;
  }) };
});
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { companionTriggerMatches, extractStatReplacement, scanForApplicableAbilities } from '../../src/moves/abilityScanner.js';
import { parseHTML } from './../helpers/cardDom.js';
import { renderMoveAbilitiesForm, readMoveAbilitiesForm } from '../../src/ui/settingsPanel.js';

const ROCKHORN_TEXT = 'When you make a move by sending the rockhorn to charge a foe or batter an obstacle, roll +its health.';
const companion = (id, name, health, abilityHtml, given = null) => ({ id, name, type: 'asset',
  system: { category: 'Companion', abilities: [{ enabled: true, description: `<p>${abilityHtml}</p>` }],
    track: { enabled: true, name: 'Health', value: health, min: 0, max: 5 }, ...(given ? { fields: [{ name: 'Name', value: given }] } : {}) } });

describe('COMPANION-TRIGGER-SWAP-UNCUED (a) — a companion\'s general trigger', () => {
  beforeEach(() => { control.abilities = null; });   // the real scan
  const kira = () => ({ id: 'pc-kira', name: 'Kira', type: 'character', system: { edge: 2, heart: 2, iron: 1, shadow: 1, wits: 2 },
    items: { contents: [
      companion('asset-rockhorn', 'Rockhorn', 4, ROCKHORN_TEXT, 'Bruno'),
      { id: 'asset-ace', name: 'Ace', type: 'asset', system: { category: 'Path', abilities: [{ enabled: true,
        description: '<p>When you @Compendium[foundry-ironsworn.starforgedmoves.x]{Face Danger}, add +1.</p>' }] } },
    ] } });

  it('its own "roll +its health" is the swap', () => {
    expect(extractStatReplacement(ROCKHORN_TEXT, 'Face Danger')).toBe('companion_health');
  });

  it('applies to a line naming the companion — by its asset name or its given name — and to no other', async () => {
    const actor = kira();
    const all = [{ key: 'asset-rockhorn:0', assetId: 'asset-rockhorn', source: 'character', text: ROCKHORN_TEXT }];
    expect(companionTriggerMatches(all, 'The rockhorn smashes the gate', actor).map(a => a.key)).toEqual(['asset-rockhorn:0']);
    expect(companionTriggerMatches(all, 'Bruno smashes the gate', actor).map(a => a.key)).toEqual(['asset-rockhorn:0']);
    expect(companionTriggerMatches(all, 'I smash the gate myself', actor)).toEqual([]);
  });

  it('offered beside an ability the move links, with its swap and asset — no model pass needed', async () => {
    const found = await scanForApplicableAbilities({ moveId: 'face_danger', moveName: 'Face Danger',
      narration: 'I send the rockhorn at the barricade', characterActor: kira(), commandShipActor: null, apiKey: '' });
    const rock = found.find(a => a.assetName === 'Rockhorn');
    expect(found.map(a => a.assetName).sort()).toEqual(['Ace', 'Rockhorn']);
    expect(rock).toMatchObject({ statReplacement: 'companion_health', assetId: 'asset-rockhorn', detection: 'structured' });
  });

  it('control: a progress move takes no swap', async () => {
    const found = await scanForApplicableAbilities({ moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow',
      narration: 'The rockhorn carries me home', characterActor: kira(), commandShipActor: null, apiKey: '' });
    expect(found.find(a => a.assetName === 'Rockhorn')).toBeUndefined();
  });
});

describe('COMPANION-TRIGGER-SWAP-UNCUED (b) — two companions offer "+its health": the form asks which', () => {
  const two = [
    { key: 'asset-rockhorn:0', assetId: 'asset-rockhorn', assetName: 'Rockhorn', source: 'character', statReplacement: 'companion_health', adds: 0 },
    { key: 'asset-glowcat:0',  assetId: 'asset-glowcat',  assetName: 'Glowcat',  source: 'character', statReplacement: 'companion_health', adds: 0 },
  ];

  it('a radio per companion, each naming it; the pick names the companion', () => {
    const root = parseHTML(`<div>${renderMoveAbilitiesForm(two, 'edge')}</div>`);
    const values = [...root.querySelectorAll('input[name="sf-stat-sub"]')].map(r => r.getAttribute('value'));
    expect(values).toEqual(['', 'companion_health@asset-rockhorn', 'companion_health@asset-glowcat']);
    expect(root.textContent).toMatch(/\(Glowcat\)/);
    for (const r of root.querySelectorAll('input[name="sf-stat-sub"]')) r.checked = r.getAttribute('value') === 'companion_health@asset-glowcat';
    expect(readMoveAbilitiesForm(root)).toMatchObject({ pickedStat: 'companion_health', pickedStatAssetId: 'asset-glowcat' });
  });

  it('control: one companion keeps the one plain radio', () => {
    const root = parseHTML(`<div>${renderMoveAbilitiesForm(two.slice(0, 1), 'edge')}</div>`);
    expect([...root.querySelectorAll('input[name="sf-stat-sub"]')].map(r => r.getAttribute('value'))).toEqual(['', 'companion_health']);
  });
});

describe('COMPANION-TRIGGER-SWAP-UNCUED (b) — the picked companion is rolled (booted table)', () => {
  let table;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'cts-s1', currentSceneId: 'cts-scene', sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-test');
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { edge: 1 }, items: { contents: [
      companion('asset-rockhorn', 'Rockhorn', 5, ROCKHORN_TEXT),
      companion('asset-glowcat', 'Glowcat', 2, 'When you make a move by sending the glowcat to scout ahead, roll +its health.'),
    ] } });
    scriptClaude(table, { fallback: () => 'The beasts move.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
    control.abilities = [
      { key: 'asset-rockhorn:0', assetId: 'asset-rockhorn', assetName: 'Rockhorn', source: 'character', category: 'Companion', statReplacement: 'companion_health', adds: 0, text: ROCKHORN_TEXT, detection: 'structured' },
      { key: 'asset-glowcat:0',  assetId: 'asset-glowcat',  assetName: 'Glowcat',  source: 'character', category: 'Companion', statReplacement: 'companion_health', adds: 0, text: 'x', detection: 'structured' },
    ];
    control.dice = [0.05, 0.15, 0.55];   // challenge 1, 2; action 4
  });
  afterEach(async () => { await table.drain().catch(() => {}); });

  it("the Glowcat picked: the roll is its health (2), not the healthier Rockhorn's (5)", async () => {
    control.pick = 'companion_health@asset-glowcat';
    await table.client('pl-1').chat('I send them both into the ruins.', { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(card.content.replace(/\s+/g, ' ')).toMatch(/\(2\)<\/div>/);
    expect(card.content.replace(/\s+/g, ' ')).toMatch(/Action: 4 \+ 2 = <strong>6<\/strong>/);
  }, 60_000);
});
