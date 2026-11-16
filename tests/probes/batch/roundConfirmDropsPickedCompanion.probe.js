/* global silenceConsoleErrors, structuredClone -- tests/setup.js */
/**
 * PROBE — BATCH · ROUND-CONFIRM-DROPS-PICKED-ASSET (INCOMPLETE-FIX of
 * COMPANION-TRIGGER-SWAP-UNCUED (b))
 *
 * Scenario: Batch Mode. Kira has two companions, the Rockhorn (health 5) and
 * the Glowcat (health 2); both offer "roll +its health" on her action. The
 * shared confirm form (settingsPanel.js renderMoveAbilitiesForm) shows a radio
 * per companion in her Round window, as it does in the confirm dialog. She
 * picks the Glowcat and presses Confirm.
 *
 * Correct (decisions.md COMPANION-TRIGGER-SWAP-UNCUED: "the confirm form shows
 * a radio per asset rather than rolling the healthiest"): the round rolls
 * +the Glowcat's health (2), as free-flow does
 * (tests/unit/companionTriggerSwap.test.js).
 *
 * Today: the Round window's Confirm reads `applied` and `pickedStat` from the
 * form and drops `pickedStatAssetId`; the round's choices
 * (round.js validateChoices → movePipeline.js interpretationForRoll) have no
 * place for it, so `appliedStatAssetId` is never set and the roll takes the
 * healthiest companion — the Rockhorn's 5 — whatever she picked.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { StubElement } from '../../helpers/cardDom.js';

const control = vi.hoisted(() => ({ dice: [], abilities: [] }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ moveId: 'face_danger', moveName: 'Face Danger',
    statUsed: 'edge', adds: 0, playerNarration: text, inputMethod: 'chat', rationale: 'test', mischiefApplied: false })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => structuredClone(control.abilities)),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (original) => ({
  ...(await original()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const ROCKHORN_TEXT = 'When you make a move by sending the rockhorn to charge a foe or batter an obstacle, roll +its health.';
const companion = (id, name, health, abilityHtml) => ({ id, name, type: 'asset',
  system: { category: 'Companion', abilities: [{ enabled: true, description: `<p>${abilityHtml}</p>` }],
    track: { enabled: true, name: 'Health', value: health, min: 0, max: 5 } } });

let table, savedDocument;
const round = () => table.world.getSetting('batchMode.round');

beforeAll(async () => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 60_000);
afterAll(() => { table?.teardown(); globalThis.document = savedDocument; });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'cts-s1', sessionNumber: 1,
      currentSceneId: 'cts-scene', sceneTruths: [], clocks: [] },
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
  control.dice = [0.05, 0.15, 0.55];   // challenge 1, 2; action die 4
  silenceConsoleErrors();
});

/**
 * Kira's player submits, then confirms the reading IN HER ROUND WINDOW: the
 * real window renders the shared form, `pick` sets its radios / boxes, and
 * the window's own Confirm action reads it and relays.
 */
async function kiraConfirmsInHerWindow(pick) {
  const c = table.client('pl-1');
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  await c.run(() => gmRelay.requestGmAction('batch.submit', { roundId: round().id, text: 'I send them both into the ruins.', submissionId: 'sub-k1' }));
  await table.settle(); await table.drain();
  expect(round().entries['pl-1'], 'setup: the reading offers both companions\' swap').toMatchObject({
    status: 'read', reading: { kind: 'move', moveId: 'face_danger', statOptions: ['companion_health'] } });

  const mod = await c.import('../../src/ui/roundWindow.js');
  const relayedChoices = await c.run(async () => {
    const app = new mod.RoundWindowApp();
    const root = await app._renderHTML(await app._prepareContext({}), {});
    app.element = root;
    const radios = [...root.querySelectorAll('input[name="sf-stat-sub"]')];
    expect(radios.map(r => r.getAttribute('value')), 'setup: a radio per companion').toEqual(
      ['', 'companion_health@asset-rockhorn', 'companion_health@asset-glowcat']);
    pick(root);
    await mod.RoundWindowApp.DEFAULT_OPTIONS.actions.confirm.call(app, null, null);
  });
  await table.settle(); await table.drain();
  return relayedChoices;
}

const moveCard = () => table.cards(f => f.moveResolution).at(-1);

describe('BATCH — two companions offer "+its health" in a round: the one picked in the Round window is rolled', () => {
  it('the Glowcat picked (both abilities left checked): the roll is its health (2), not the healthier Rockhorn\'s (5)', async () => {
    await kiraConfirmsInHerWindow((root) => {
      for (const r of root.querySelectorAll('input[name="sf-stat-sub"]')) r.checked = r.getAttribute('value') === 'companion_health@asset-glowcat';
    });
    const card = moveCard();
    expect(card, 'setup: the round rolled the move').toBeTruthy();
    const html = card.content.replace(/\s+/g, ' ');
    expect(html, 'setup: the roll took the companion-health swap').toMatch(/Action: 4 \+ \d = /);
    // FAILS today: "Action: 4 + 5 = 9" — the Rockhorn's health.
    expect(html).toMatch(/Action: 4 \+ 2 = <strong>6<\/strong>/);
  }, 60_000);

  it('control: with the Rockhorn\'s ability unchecked, the one companion left is the one rolled', async () => {
    await kiraConfirmsInHerWindow((root) => {
      for (const cb of root.querySelectorAll('.sf-applicable-ability-cb')) cb.checked = cb.dataset.key === 'asset-glowcat:0';
      for (const r of root.querySelectorAll('input[name="sf-stat-sub"]')) r.checked = r.getAttribute('value') === 'companion_health@asset-glowcat';
    });
    const html = moveCard().content.replace(/\s+/g, ' ');
    expect(html).toMatch(/Action: 4 \+ 2 = <strong>6<\/strong>/);
  }, 60_000);

  it('control: the swap not taken, the listed stat is rolled (+edge 1)', async () => {
    await kiraConfirmsInHerWindow(() => {});
    const html = moveCard().content.replace(/\s+/g, ' ');
    expect(html).toMatch(/Action: 4 \+ 1 = <strong>5<\/strong>/);
  }, 60_000);
});
