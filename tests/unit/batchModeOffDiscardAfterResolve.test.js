/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchModeOffDiscardAfterResolve.test.js
 *
 * Issue #345 AA36 TOGGLE-OFF-DIALOG-STALE-ROUND (the twelfth audit's BATCH-1).
 *
 * The toolbar's Batch Mode switch (src/ui/roundWindow.js toggleBatchMode)
 * read the round once, BEFORE its "Turn Batch Mode off" dialog: with actions
 * submitted to a collecting round it asks "Send now, then turn off / Discard
 * the round / Cancel". The dialog is modal on the GM's screen only — the
 * players keep playing — and when the GM answered "Discard the round" the
 * switch wrote `batchMode.enabled = false` without looking at the round
 * again.
 *
 * If the last player confirmed while the dialog was open, the round is no
 * longer collecting: it is resolving. The mode was switched off
 * mid-resolution — what issue #342 Z04 fixed for the switch pressed while a
 * round resolves (it only marks `modeOffAfter`):
 *   - the round is not discarded (closeCollectingRound refuses a resolving
 *     round): its moves are rolled and it waits for the roller's upgrade
 *     decision;
 *   - every Round window closed and could not be reopened while the mode was
 *     off — the roller's Keep and the GM's Send now live only there;
 *   - so the round sat in "upgrading" with no narration.
 *
 * The fix: the switch reads the round again once the dialog is answered; a
 * round resolving by then finishes, then the mode turns off (Z04's path).
 *
 * Harness: batchModeOffWhileUpgrading.test.js's (a GM and two players on the
 * simulated table, the real driver, relays and pipeline; pacing, interpreter,
 * ability scan and detection mocked; dice scripted). The dialog's responder
 * lets Ren confirm before the GM answers — the players' side of the race.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK = [0.35, 0.75, 0.4];
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit (no upgrade offered).
const STRONG = [0.25, 0.35, 0.9];
const TOLD = 'Starforged Companion: the round is being resolved — Batch Mode turns off when it finishes.';

let table;
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.actors.get('pc-kira').system.momentum.value = 9;
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/** Kira has confirmed her action (a weak hit she may burn); Ren's is read, not yet confirmed. */
async function kiraReadyRenReading() {
  control.dice = [WEAK, STRONG];
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I cover the hatch behind her.', submissionId: 'r1' });
  await table.drain();
  expect(round().entries['pl-1'].status).toBe('ready');
  expect(round().entries['pl-2'].status).toBe('read');
}

/**
 * The GM presses the toolbar's switch. Its dialog asks Send / Discard / Cancel;
 * `meanwhile` runs while the dialog is open (the players keep playing), then
 * the GM answers `choice`.
 */
async function gmSwitchesOff(choice, meanwhile = async () => {}) {
  const gm = table.client('gm-1');
  gm.answerDialogs(async (d) => {
    await meanwhile();
    return d.choose(choice);
  });
  const mod = await gm.import('../../src/ui/roundWindow.js');
  await gm.run(() => mod.toggleBatchMode());
  await table.settle();
  await table.drain();
}

const renConfirms = async () => {
  await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
  await table.drain();
};

describe('issue #345 AA36 — "Discard the round" answered after the round began resolving finishes it, then turns the mode off', () => {
  it('control: answered while the round still collects, Discard closes the round and turns the mode off', async () => {
    await kiraReadyRenReading();
    await gmSwitchesOff('discard');
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
    expect(round()).toMatchObject({ phase: 'closed', closeReason: 'mode-off' });
    expect(table.cards(f => f.moveResolution)).toEqual([]);
  }, 60_000);

  it('control: Ren confirming while the dialog is open starts the resolution — Kira is deciding Burn / Keep', async () => {
    await kiraReadyRenReading();
    await gmSwitchesOff('cancel', renConfirms);
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ decided: null });
    expect(table.world.getSetting('batchMode.enabled')).toBe(true);
  }, 60_000);

  it('the GM then answers Discard: the mode is not switched off under the resolving round — it is marked to turn off after it, as Z04', async () => {
    await kiraReadyRenReading();
    await gmSwitchesOff('discard', renConfirms);
    // The round was not discarded — it is resolving, waiting for Kira.
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
    expect(table.cards(f => f.moveResolution && f.roundId === round().id)).toHaveLength(2);
    expect({
      enabled:      table.world.getSetting('batchMode.enabled'),
      modeOffAfter: round().modeOffAfter === true,
    }).toEqual({ enabled: true, modeOffAfter: true });
    expect(table.client('gm-1').notifications.map(n => n.message)).toContain(TOLD);
  }, 60_000);

  it('the GM can still reach the round that is waiting: the Round window opens, and it goes on', async () => {
    await kiraReadyRenReading();
    await gmSwitchesOff('discard', renConfirms);
    // The GM reaches Send now (keep the rest) from the toolbar's Round tool.
    const gm = table.client('gm-1');
    const mod = await gm.import('../../src/ui/roundWindow.js');
    const opened = await gm.run(() => mod.openRoundWindow());
    await table.settle();
    await table.drain();
    expect({ windowOpened: opened != null, phase: round().phase, narrated: narrations().length })
      .toEqual({ windowOpened: true, phase: 'upgrading', narrated: 0 });
  }, 60_000);

  it('Kira keeps her result in her window: the round is narrated, then the mode turns off', async () => {
    await kiraReadyRenReading();
    await gmSwitchesOff('discard', renConfirms);
    // Her Keep lives in her Round window: it must still open.
    const kira = table.client('pl-1');
    const mod = await kira.import('../../src/ui/roundWindow.js');
    expect(await kira.run(() => mod.openRoundWindow())).not.toBeNull();
    await table.settle();
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    await table.drain();
    expect(narrations()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 1, phase: 'closed' });
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
  }, 60_000);
});
