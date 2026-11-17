/* global silenceConsoleErrors, structuredClone -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundConfirmKeepsPickedAsset.test.js
 *
 * Issue #362 AC61 ROUND-CONFIRM-DROPS-PICKED-ASSET (an incomplete fix of
 * COMPANION-TRIGGER-SWAP-UNCUED (b)). Kira has two companions, the Rockhorn
 * (health 5) and the Glowcat (health 2); both offer "roll +its health" on her
 * action. The shared confirm form (settingsPanel.js renderMoveAbilitiesForm)
 * shows a radio per companion — in the confirm dialog and in her Round
 * window. decisions.md COMPANION-TRIGGER-SWAP-UNCUED: "the confirm form shows
 * a radio per asset rather than rolling the healthiest". The dialog stores the
 * pick (`appliedStatAssetId`); the Round window's Confirm read `applied` and
 * `pickedStat` only, the round's choices had no place for the asset
 * (round.js validateChoices → movePipeline.js interpretationForRoll), and
 * the round rolled the healthiest companion whatever she picked. The pick now
 * rides the choices (`statAssetId`), checked against the abilities the
 * reading offered, onto the interpretation the round rolls.
 *
 * The table cases drive the real RoundWindowApp confirm on the player's client
 * and the real round (from the audit's probe,
 * tests/probes/batch/roundConfirmDropsPickedCompanion.probe.js); the last
 * block pins the validation a forged confirm meets.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';

const control = vi.hoisted(() => ({ dice: [], abilities: [] }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ moveId: 'face_danger', moveName: 'Face Danger',
    statUsed: 'edge', adds: 0, playerNarration: text, inputMethod: 'chat', rationale: 'test', mischiefApplied: false })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => structuredClone(control.abilities)),
}));
vi.mock('../../src/entities/entityExtractor.js', async (original) => ({
  ...(await original()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { validateChoices, READING_KIND, RoundRefusal } from '../../src/batch/round.js';
import { interpretationForRoll } from '../../src/moves/movePipeline.js';

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
    // Not "Action: 4 + 5 = 9" — the Rockhorn's health (AC61).
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

describe('issue #362 AC61 — the round\'s choices carry the asset picked, checked against the reading', () => {
  const READING = {
    kind: READING_KIND.MOVE, moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge',
    abilities: [
      { key: 'rock', assetId: 'asset-rockhorn', assetName: 'Rockhorn', source: 'character', adds: 0, statReplacement: 'companion_health' },
      { key: 'glow', assetId: 'asset-glowcat',  assetName: 'Glowcat',  source: 'character', adds: 0, statReplacement: 'companion_health' },
    ],
    statOptions: ['companion_health'],
    targetChoices: null,
    interpretation: { moveId: 'face_danger', statUsed: 'edge' },
  };
  const refusedWith = (fn, reason) => {
    try { fn(); } catch (err) {
      expect(err).toBeInstanceOf(RoundRefusal);
      expect(err.reason).toBe(reason);
      return;
    }
    throw new Error(`expected a refusal "${reason}"`);
  };

  it('a picked asset whose checked ability offers the stat is kept, and is the one the roll names', () => {
    const choices = validateChoices(READING, { abilityIds: ['rock', 'glow'], statReplacement: 'companion_health', statAssetId: 'asset-glowcat' });
    expect(choices).toEqual({ abilityIds: ['rock', 'glow'], statReplacement: 'companion_health', statAssetId: 'asset-glowcat', targetId: null });
    expect(interpretationForRoll(READING, choices)).toMatchObject({
      appliedStatReplacement: 'companion_health', appliedStatAssetId: 'asset-glowcat' });
  });

  it('an asset whose ability is unchecked is dropped; one no ability offered the stat for is refused', () => {
    expect(validateChoices(READING, { abilityIds: ['rock'], statReplacement: 'companion_health', statAssetId: 'asset-glowcat' }))
      .toEqual({ abilityIds: ['rock'], statReplacement: 'companion_health', targetId: null });
    refusedWith(() => validateChoices(READING, { abilityIds: ['rock'], statReplacement: 'companion_health', statAssetId: 'asset-hound' }), 'bad-stat');
  });

  it('control: no swap taken, no asset kept — the listed stat is rolled', () => {
    const choices = validateChoices(READING, { abilityIds: ['rock', 'glow'], statReplacement: null, statAssetId: 'asset-glowcat' });
    expect(choices).toEqual({ abilityIds: ['rock', 'glow'], statReplacement: null, targetId: null });
    const interpretation = interpretationForRoll(READING, choices);
    expect(interpretation.appliedStatReplacement).toBeNull();
    expect(interpretation.appliedStatAssetId).toBeUndefined();
  });
});
