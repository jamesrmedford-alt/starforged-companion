/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundResidualsMultigm.test.js
 *
 * Batch Mode residuals of issues #345 / #347, on a two-GM table (the real
 * driver, relays and pipeline; pacing, interpreter, ability scan and
 * detection mocked; dice scripted):
 *
 *   - ROUND-SEND-NOW-KEEPS-UNDER-XCARD: `requestSendNow` during the upgrade
 *     step applied Keep for everyone before its X-Card check. The X-Card is
 *     now checked first.
 *   - UPGRADE-WAIT-OTHER-GM: Send now waited five minutes only for an upgrade
 *     whose handler ran on the resolving GM's page; one running on another
 *     GM's page was kept after 60 s. The card's claim now names the GM whose
 *     page applies it (`consumedBy`), and a connected one counts as live.
 *   - BATCH-OFF-DIALOG-HANDOVER-WINDOW: "Discard the round" re-read the
 *     toggling GM's cached round, so a resolution the canonical GM was
 *     starting within the mode-off write's round trip was switched off under
 *     it. The canonical GM now decides on its own round chain
 *     (`batch.discardThenOff`).
 *   - ROUND-VOW-GONE-SAYS-FULFILLED: a round's refused "vow-gone" reading said
 *     the vow "is already fulfilled" for a forsaken vow named again.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    ...(control.interpretation ?? { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false }),
    playerNarration: narration, inputMethod: 'chat',
  })),
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, holdWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { selectFulfilVow, selectForsakeVow } from '../../src/moves/milestone.js';

const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK = [0.35, 0.75, 0.4];
const STRONG = [0.0, 0.0, 0.99];

let table;
const round = () => table.world.getSetting('batchMode.round');

function vowItem(id, name, { completed = false, forsaken = false } = {}) {
  return {
    id, type: 'progress', name, flags: { [MODULE_ID]: forsaken ? { forsaken: true } : {} },
    system: { subtype: 'vow', rank: 'dangerous', current: 12, completed },
    async update() { return this; },
    async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; return this; },
  };
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  control.interpretation = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vowItem('v-chen', 'Find Chen', { completed: true, forsaken: true })] } });
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

/** Kira's weak hit, with momentum 9 to burn: the round waits for her decision. */
async function weakHitWaitingForKira() {
  control.dice = [WEAK, STRONG];
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
  expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
  expect(round().entries['pl-1'].upgrade).toMatchObject({ decided: null });
}

/** The canonical GM's Send now, as the relay queue runs it. */
async function sendNow() {
  const gm = table.client('gm-1');
  const driver = await gm.import('../../src/batch/driver.js');
  const res = await gm.run(() => driver.requestSendNow());
  await table.settle();
  return res;
}

describe('ROUND-SEND-NOW-KEEPS-UNDER-XCARD — Send now during the upgrade step checks the X-Card first', () => {
  it('under the X-Card, Send now keeps nobody: the roller still decides', async () => {
    await weakHitWaitingForKira();
    await table.client('gm-1').run(() => game.settings.set(MODULE_ID, 'campaignState', {
      ...game.settings.get(MODULE_ID, 'campaignState'), xCardActive: true,
    }));
    await table.settle();

    const res = await sendNow();
    expect(res).toMatchObject({ ok: false, reason: 'x-card' });
    const cardId = round().entries['pl-1'].rolled.cardId;
    expect(round().entries['pl-1'].upgrade.decided, 'not kept under the X-Card').toBe(null);
    expect(table.world.message(cardId).flags[MODULE_ID].burn.roundClosed ?? false).toBe(false);
  }, 30_000);

  it('control: with no X-Card, Send now keeps the result', async () => {
    await weakHitWaitingForKira();
    const res = await sendNow();
    expect(res).toMatchObject({ ok: true });
    expect(round().entries?.['pl-1']?.upgrade?.decided ?? 'keep').toBe('keep');
  }, 30_000);
});

describe("UPGRADE-WAIT-OTHER-GM — an upgrade applied on another connected GM's page is waited for past the grace", () => {
  /** Kira's card claimed for a burn by `gmId`'s page (its handler still applying it): the round's upgrade is in flight. */
  async function burnInFlightOn(gmId, msAgo) {
    const held = holdWrites(table, (w) => w.kind === 'message.create'
      && w.data?.flags?.[MODULE_ID]?.moveResolution === true && w.data?.flags?.[MODULE_ID]?.roundUserId === 'pl-2');
    control.dice = [WEAK, STRONG];
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
    await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I vault the barricade.', submissionId: 'r1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
    await held.arrived;
    const cardId = round().entries['pl-1'].rolled.cardId;
    // The burn's claim, as resultUpgrade.js claimUpgradeCard writes it on the page applying it.
    await table.client(gmId).run(() => game.messages.get(cardId).update({
      [`flags.${MODULE_ID}.burn.consumed`]: true, [`flags.${MODULE_ID}.burn.consumedBy`]: gmId,
    }));
    await table.settle();
    held.release();
    await table.settle();
    expect(round()).toMatchObject({ phase: 'upgrading' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ inFlight: 'burn', decided: null });
    // As if `msAgo` had passed since it went in flight.
    const r = round();
    await table.client('gm-1').setSetting('batchMode.round', {
      ...r, entries: { ...r.entries, 'pl-1': { ...r.entries['pl-1'], upgrade: { ...r.entries['pl-1'].upgrade, inFlightSince: new Date(Date.now() - msAgo).toISOString() } } },
    });
    await table.settle();
  }

  it("two minutes on, Send now still waits for a burn gm-2's page is applying", async () => {
    await burnInFlightOn('gm-2', 2 * 60_000);
    await sendNow();
    expect(round().entries['pl-1'].upgrade.decided, "not kept while gm-2's handler may still run").toBe(null);
  }, 30_000);

  it('control: once gm-2 has left, the 60 s grace keeps it', async () => {
    await burnInFlightOn('gm-2', 2 * 60_000);
    await table.leave('gm-2');
    await sendNow();
    expect(round().entries?.['pl-1']?.upgrade?.decided ?? 'keep').toBe('keep');
  }, 30_000);
});

describe("BATCH-OFF-DIALOG-HANDOVER-WINDOW — the canonical GM decides \"Discard the round\" on its own round chain", () => {
  /** Kira confirmed, Ren read but not confirmed. */
  async function kiraReadyRenReading() {
    control.dice = [WEAK, STRONG];
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I cover the hatch behind her.', submissionId: 'r1' });
    await table.drain();
    expect(round().entries['pl-2'].status).toBe('read');
  }

  it("gm-2 answers Discard while gm-1 is starting the round's resolution: the round finishes, then the mode turns off", async () => {
    await kiraReadyRenReading();
    // The round's lock claim is out on gm-1 (its write held): the round still reads collecting everywhere.
    const claim = holdWrites(table, (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.campaignState`
      && w.client === 'gm-1' && w.value?.pendingMove === true);
    const gm2 = table.client('gm-2');
    gm2.answerDialogs(async (d) => {
      await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
      await claim.arrived;
      expect(round().phase, 'still collecting as gm-2 reads it (setup)').toBe('collecting');
      return d.choose('discard');
    });
    const mod = await gm2.import('../../src/ui/roundWindow.js');
    const toggled = gm2.run(() => mod.toggleBatchMode());
    await claim.arrived;
    await toggled;
    await table.settle();
    claim.release();
    await table.settle();
    await table.drain();

    expect(round().number).toBe(1);
    expect(round().phase, 'the round resolves — not switched off under it').not.toBe('closed');
    expect({ enabled: table.world.getSetting('batchMode.enabled'), modeOffAfter: round().modeOffAfter === true })
      .toEqual({ enabled: true, modeOffAfter: true });
  }, 60_000);

  it('control: answered while nothing is starting, Discard turns the mode off and closes the round', async () => {
    await kiraReadyRenReading();
    const gm2 = table.client('gm-2');
    gm2.answerDialogs(async (d) => d.choose('discard'));
    const mod = await gm2.import('../../src/ui/roundWindow.js');
    await gm2.run(() => mod.toggleBatchMode());
    await table.settle();
    await table.drain();
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
    expect(round()).toMatchObject({ phase: 'closed', closeReason: 'mode-off' });
    expect(table.cards(f => f.moveResolution)).toEqual([]);
  }, 60_000);
});

describe('ROUND-VOW-GONE-SAYS-FULFILLED — a refused reading of a closed vow says how it closed', () => {
  it("a round's Fulfill Your Vow naming a forsaken vow says it was forsaken, not fulfilled", async () => {
    control.interpretation = { moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', statUsed: null, adds: 0,
      isProgressMove: true, moveTarget: 'Find Chen', rationale: 'test', mischiefApplied: false };
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I see my vow to find Chen through.', submissionId: 'k1' });
    await table.drain();
    expect(round().entries['pl-1'].reading.blocked).toBe('vow-forsaken');

    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await sendNow();
    await table.drain();
    const refused = table.cards(f => f.roundRefusedCard).at(-1)?.content ?? '';
    expect(refused).toMatch(/The vow it named was forsaken/);
    expect(refused).not.toMatch(/already fulfilled/);
  }, 30_000);

  it('the vow selectors say whether the closed vow was forsaken', () => {
    const vows = [
      { id: 'a', name: 'Find Chen', completed: true, forsaken: true, actorId: 'pc-kira' },
      { id: 'b', name: 'Guard the Relay', completed: true, actorId: 'pc-kira' },
    ];
    expect(selectFulfilVow(vows, 'Find Chen', { rollerActorId: 'pc-kira' })).toMatchObject({ completed: true, forsaken: true });
    expect(selectFulfilVow(vows, 'Guard the Relay', { rollerActorId: 'pc-kira' }).forsaken ?? false).toBe(false);
    expect(selectForsakeVow(vows, 'Find Chen', { rollerActorId: 'pc-kira' })).toMatchObject({ completed: true, forsaken: true });
  });
});
