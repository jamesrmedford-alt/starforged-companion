/* global silenceConsoleErrors -- tests/setup.js */
/**
 * PROBE — R2T: ROUND-NARRATED-AFTER-END-MISSING-FROM-LAST-SESSION
 * (twelfth audit, round 2, 2026-11-10). Sibling of round 1's SESS-1
 * (END-REFRESH-LOST-STALE-LAST-SESSION) on a path SESS-1's first fix option
 * ("End stamps the summary it finalised") does not cover.
 *
 * Issue #342 Z23 (decisions.md → "a resolving round of an ended session
 * finishes unless its resolver is gone"): End a Session closes only a
 * COLLECTING round (driver.js onCampaignStateChanged, 1700-1702); a round
 * already resolving — narrating, or waiting on a roller's Burn / Keep —
 * finishes after the session has ended. Its narration is posted then, under
 * the ended session's id (narrateRound's working copy, narrator.js 945-1033;
 * the card's `sessionId`, 1288).
 *
 * But End a Session has already taken the session's measure: its forced
 * summary refresh ran over the cards in chat at that moment
 * (sessionLifecycleDialogs.js 650-656), and the mint at the next Begin a
 * Session (lifecycle.js rollSessionIfDue 328-338) brings an ENDED session's
 * summary up to date only when it has no text (`closing && (!ended ||
 * !summarised)` — Z41). The round card is one card past the debounce, so no
 * regen covers it either. LAST SESSION (previousSessionSummary) is End's
 * summary: the session's final round — its rolled moves and their narration —
 * never reaches the next session's narrator (the ring is session-scoped).
 *
 * Scenario (ordinary Batch Mode play): three narrations, then a round; while
 * its narration is being written the GM presses End a Session; the round's
 * card posts; next time the GM presses Begin a Session.
 *
 * Harness: the batch probes' (simulated GM + player, the real driver, relays
 * and pipeline; pacing, interpreter, ability scan, detection mocked; dice
 * scripted) with SESS-1's scripted summary (it quotes the [tag]s it was
 * given).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const S1 = 'rae-s1';
const OLDER = { sessionId: 'rae-s0', sessionNumber: 2, text: 'SESSION TWO — the crew slipped out of Bleakhold.', updatedAt: '2026-11-01T00:00:00.000Z' };
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit — no upgrade to decide.
const STRONG = [0.25, 0.35, 0.9];
// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK = [0.35, 0.75, 0.4];
const ROUND_NARRATION = 'Kira slams the breach seal home as the coolant boils past her boots [R1].\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
let claude;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const isSummaryCall = (call) => /continuity scribe/.test(call?.system ?? '');
const isRoundNarration = (call) => /## THIS ROUND/.test(call?.userText ?? '');

/** The scripted rolling summary: the tags of the passages it was given, in order. */
function summaryOf(call) {
  const tags = [...String(call?.userText ?? '').matchAll(/\[([AR]\d)\]/g)].map(m => m[1]);
  return `Summary of ${[...new Set(tags)].map(t => `[${t}]`).join(' ')}.`;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, sessionLogAutoWrite: false, autoRecapEnabled: false, combatTrackerEnabled: false,
    narratorSessionSummary: true,
    narratorContextCards: 2,             // the regen debounce: round(1.5 × 2) = 3 cards
    campaignState: {
      ...CampaignStateSchema, currentSessionId: S1, sessionNumber: 3, sessionActive: true,
      sessionStartedId: S1, sessionActiveStartedAt: new Date().toISOString(),
      lastSessionTimestamp: new Date().toISOString(), sessionEndedId: null,
      currentSceneId: 'sc-1', sceneTruths: [], previousSessionSummary: OLDER, sessionSummary: null,
      xCardActive: false, xCardPlays: 0, clocks: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  claude = scriptClaude(table, {
    fallback: (call) => {
      if (isSummaryCall(call)) return summaryOf(call);
      if (isRoundNarration(call)) return ROUND_NARRATION;
      return 'Vex polishes a rifle in the galley, humming.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    },
  });
  silenceConsoleErrors();
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
});

/** A narration the GM's pipeline posted in the session (the narrator card's flag family). */
async function narrate(tag, prose) {
  const text = `${prose} [${tag}]`;
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<p>${text}</p>`,
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: text, sessionId: S1, narrationId: `nar-${tag}` } },
  }));
  await table.settle(); await table.drain();
}

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle(); await table.drain();
  return res;
}

const endSession   = () => relay('gm-1', 'session.end', { questFocus: '', connectionFocus: '' });
const beginSession = () => relay('gm-1', 'session.begin', { vignetteRolled: false, includeGalley: false });

async function threeNarrations() {
  await narrate('A1', 'The dockmaster waves the Wayfarer in.');
  await narrate('A2', 'Kira trades the coolant for passage codes.');
  await narrate('A3', 'The Hegemony patrol hails the docks.');
  expect(world().sessionSummary).toMatchObject({ sessionId: S1, coveredCount: 3 });   // the debounced regen ran
}

/** Kira acts in the session's last round: submitted and confirmed — it resolves at once. */
async function kiraActs() {
  control.dice = [STRONG];
  expect(round()).toMatchObject({ number: 1, phase: 'collecting', sessionId: S1 });
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I seal the breach before the coolant floods the deck.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
}

const roundCards = () => table.cards(f => f.narratorCard && f.roundId);

describe('R2T — a Batch Mode round narrated after End a Session is missing from LAST SESSION', () => {
  it("End a Session pressed while the session's last round is being narrated: the next session's LAST SESSION still tells that round", async () => {
    await threeNarrations();
    const held = claude.hold(isRoundNarration);
    await kiraActs();
    await held.arrived;
    expect(round()).toMatchObject({ number: 1, phase: 'narrating' });

    await endSession();                                     // the GM ends the session meanwhile
    expect(world().sessionEndedId).toBe(S1);
    expect(round().phase, 'a resolving round finishes (Z23)').toBe('narrating');

    held.release(ROUND_NARRATION);
    await table.settle(); await table.drain();
    expect(roundCards()).toHaveLength(1);                   // the round's card posted …
    expect(roundCards()[0].flags[MODULE_ID].sessionId).toBe(S1);   // … in the ended session

    await beginSession();                                   // the next session's mint
    expect(world().currentSessionId).not.toBe(S1);
    expect(world().previousSessionSummary?.sessionId, 'LAST SESSION is the ended session').toBe(S1);
    expect(world().previousSessionSummary?.text ?? '', "LAST SESSION tells the session's final round").toMatch(/\[R1\]/);
  }, 60_000);

  it("End a Session pressed while a roller decides Burn or Keep: the round they then Keep is still in the next session's LAST SESSION", async () => {
    await threeNarrations();
    table.actors.get('pc-kira').system.momentum.value = 9;
    control.dice = [WEAK];
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I seal the breach before the coolant floods the deck.', submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });   // Kira may burn her weak hit

    await endSession();                                     // the GM ends the session while she decides
    expect(world().sessionEndedId).toBe(S1);
    await relay('pl-1', 'batch.keep', { roundId: round().id });   // she keeps it: the round is narrated now
    expect(roundCards()).toHaveLength(1);

    await beginSession();
    expect(world().previousSessionSummary?.sessionId).toBe(S1);
    expect(world().previousSessionSummary?.text ?? '', "LAST SESSION tells the session's final round").toMatch(/\[R1\]/);
  }, 60_000);

  it('control: the round is narrated before End a Session — LAST SESSION tells it', async () => {
    await threeNarrations();
    await kiraActs();
    await table.drain();
    expect(roundCards()).toHaveLength(1);
    await endSession();
    expect(world().sessionSummary?.text ?? '').toMatch(/\[R1\]/);
    await beginSession();
    expect(world().previousSessionSummary).toMatchObject({ sessionId: S1, sessionNumber: 3 });
    expect(world().previousSessionSummary.text).toMatch(/\[A1\].*\[R1\]/);
  }, 60_000);
});
