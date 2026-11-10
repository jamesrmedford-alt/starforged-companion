/* global silenceConsoleErrors -- tests/setup.js */
/**
 * PROBE R2C — END-SESSION-ROUND-NARRATED-AFTER-SUMMARY (LOSE-PLOT)
 * Twelfth audit, round 2, cross-feature compositions (Batch Mode × End a
 * Session × the next session's LAST SESSION). Sibling path of SESS-1.
 *
 * Batch Mode's rule (help, decisions.md "Batch Mode", issue #342 Z23): End a
 * Session closes a COLLECTING round, but "a round already resolving finishes
 * first" (src/batch/driver.js onCampaignStateChanged :1696-1724 closes only a
 * collecting round; recoverRound's CLOSES_RESOLVING_ROUND :1641). So a round
 * waiting on a roller's Burn / Keep when the GM ends the session is narrated
 * AFTER End a Session has run: after End's forced rolling-summary refresh
 * (src/safety/sessionLifecycleDialogs.js:649-654), its Session Log write and
 * its closing vignette. The round's card carries the ended session's id
 * (narrator.js postRoundNarrationCard — campaignState.currentSessionId, not
 * yet re-minted), so it is that session's narration: its last round of play.
 *
 * The next session's mint (rollSessionIfDue, src/session/lifecycle.js:328-352)
 * brings an ENDED session's summary up to date only when it has no text
 * (:332-334 `closing && (!ended || !summarised)`), on the premise
 * (:317-318) that an End "left with text … lacks only End's own closing
 * vignette, not worth a second summary call". With the round finishing after
 * End that premise is false: the summary misses the session's whole last
 * round, and mintSession (:259-305) keeps it as LAST SESSION. The new
 * session's ring is session-scoped, so the narrator of the next session has
 * no memory of that round at all. finalizeSessionSummary (narrator.js
 * :2341-2353) would have covered it (covered < total) — it is never called.
 *
 * SESS-1 (round 1) is the same consumer with a different producer: End's own
 * refresh FAILED. Its first proposed fix ("End stamps the summary it
 * finalised; the mint finalises unless End's refresh landed") does not cover
 * this path — here End's refresh did land, and the round came after it.
 *
 * Scenario (booted GM + two players, Batch Mode on, real driver / relays /
 * End and Begin handlers; pacing, interpreter, ability scan and detection
 * mocked, dice scripted, Claude answered by the harness):
 *   1. Two narrations this session ([A1], [A2]).
 *   2. Round 1: Kira's Face Danger is a weak hit she may burn (momentum 9);
 *      Ren passes. The round waits on Kira's Burn / Keep (upgrading).
 *   3. The GM ends the session: summary refreshed ("[A1] [A2]"), gate shut.
 *   4. Kira keeps. The round is narrated ([R1]) into the ended session.
 *   5. Begin a Session: the mint keeps LAST SESSION.
 *   Expected: LAST SESSION tells the session's last round ([R1]).
 *   Actual: it is End's summary, "[A1] [A2]" only.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'probe',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
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
    // challenge 4 and 8, action 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const S1 = 'r2c-s1';
const OLDER = { sessionId: 'r2c-s0', sessionNumber: 2, text: 'SESSION TWO — the crew slipped out of Bleakhold.', updatedAt: '2026-11-01T00:00:00.000Z' };
const ACTION = 'I slip through the vent before the drones turn.';

let table, claude;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const isSummaryCall = (call) => /continuity scribe/.test(call?.system ?? '');

/** The scripted summary: the tags of the passages it was given, in order. */
function summaryOf(call) {
  const tags = [...String(call?.userText ?? '').matchAll(/\[([ARV]\d)\]/g)].map(m => m[1]);
  return `Summary of ${[...new Set(tags)].map(t => `[${t}]`).join(' ')}.`;
}

function reply(call) {
  if (isSummaryCall(call)) return summaryOf(call);
  if (String(call?.userText ?? '').includes('slip through the vent')) {
    return 'Kira squeezes through the vent as the drones swing round, scraped and late. [R1]\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  }
  if (/CLOSING VIGNETTE/.test(call?.userText ?? '')) {
    return 'Somewhere far off, a dockhand sweeps the same corner twice. [V1]\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  }
  return '{}';
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    narratorSessionSummary: true, combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, currentSessionId: S1, sessionNumber: 3, sessionActive: true,
      sessionStartedId: S1, sessionActiveStartedAt: new Date().toISOString(),
      lastSessionTimestamp: new Date().toISOString(), sessionEndedId: null,
      currentSceneId: 'r2c-sc1', sceneTruths: [], previousSessionSummary: OLDER, sessionSummary: null,
      xCardActive: false, xCardPlays: 0, clocks: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.actors.get('pc-kira').system.momentum.value = 9;
  claude = scriptClaude(table, { fallback: reply });
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle(); await table.drain();
  return res;
}

/** A narration the GM's pipeline posted earlier in the session (the narrator card's flag family). */
async function narrate(tag, prose) {
  const text = `${prose} [${tag}]`;
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<p>${text}</p>`,
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: text, sessionId: S1, narrationId: `nar-${tag}` } },
  }));
  await table.settle(); await table.drain();
}

async function kiraWeakHitWaitingOnBurn() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: ACTION, submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
  expect(round().entries['pl-1'].upgrade).toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
}

const endSession   = () => relay('gm-1', 'session.end', { questFocus: '', connectionFocus: '' });
const beginSession = () => relay('gm-1', 'session.begin', { vignetteRolled: false, includeGalley: false });
const kiraKeeps    = () => relay('pl-1', 'batch.keep', { roundId: round().id });
const roundCards   = () => table.cards(f => f.roundId && f.narratorCard);

describe('R2C — End a Session while a Batch round waits on a Burn decision', () => {
  beforeEach(async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
  });

  it("control: the round is narrated before End — End's summary and the next LAST SESSION tell it", async () => {
    await narrate('A1', 'The dockmaster waves the Wayfarer in.');
    await narrate('A2', 'Kira trades the coolant for passage codes.');
    await kiraWeakHitWaitingOnBurn();
    await kiraKeeps();
    expect(roundCards()).toHaveLength(1);
    await endSession();
    expect(world().sessionSummary.text).toMatch(/\[R1\]/);
    await beginSession();
    expect(world().currentSessionId).not.toBe(S1);
    expect(world().previousSessionSummary).toMatchObject({ sessionId: S1, sessionNumber: 3 });
    expect(world().previousSessionSummary.text).toMatch(/\[A1\].*\[R1\]/);
  }, 60_000);

  it("the round End let finish is the ended session's last beat — the next session's LAST SESSION tells it", async () => {
    await narrate('A1', 'The dockmaster waves the Wayfarer in.');
    await narrate('A2', 'Kira trades the coolant for passage codes.');
    await kiraWeakHitWaitingOnBurn();

    await endSession();                                     // the round is resolving: it finishes first
    expect(world().sessionEndedId).toBe(S1);
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
    expect(world().sessionSummary.text).not.toMatch(/\[R1\]/);   // End's refresh landed, before the round

    await kiraKeeps();                                      // the round is narrated now, after End
    expect(roundCards()).toHaveLength(1);
    expect(roundCards()[0].flags[MODULE_ID].sessionId, 'the round card is the ended session\'s').toBe(S1);

    await beginSession();                                   // the next session's mint
    expect(world().currentSessionId).not.toBe(S1);
    expect(world().previousSessionSummary?.sessionId, 'LAST SESSION is the ended session').toBe(S1);
    expect(world().previousSessionSummary?.text ?? '', "LAST SESSION tells the session's last round").toMatch(/\[R1\]/);
  }, 60_000);
});

describe('R2C — the free-flow sibling: End a Session while a typed move is being narrated', () => {
  const isNarration = (call) => /SIDECAR|NARRATOR ROLE/.test(call?.system ?? '') && String(call?.userText ?? '').includes('slip through the vent');

  it("control: the move is narrated before End — the next LAST SESSION tells it", async () => {
    await narrate('A1', 'The dockmaster waves the Wayfarer in.');
    await narrate('A2', 'Kira trades the coolant for passage codes.');
    await table.client('pl-1').chat(ACTION, { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();
    expect(table.cards(f => f.narratorCard && /\[R1\]/.test(f.narrationText ?? ''))).toHaveLength(1);
    await endSession();
    await beginSession();
    expect(world().previousSessionSummary?.text ?? '').toMatch(/\[R1\]/);
  }, 60_000);

  it("a move whose narration lands while End a Session runs is in the next session's LAST SESSION", async () => {
    await narrate('A1', 'The dockmaster waves the Wayfarer in.');
    await narrate('A2', 'Kira trades the coolant for passage codes.');
    const held = claude.hold(isNarration);
    await table.client('pl-1').chat(ACTION, { speaker: { actor: 'pc-kira' } });
    await held.arrived;                                     // rolled; the narration is being written
    // The GM ends the session meanwhile (the relay's own run; the move's
    // narration is still held, so the table is not drained here).
    const gm = table.client('gm-1');
    const gmRelay = await gm.import('../../src/multiplayer/gmRelay.js');
    await gm.run(() => gmRelay.requestGmAction('session.end', { questFocus: '', connectionFocus: '' }));
    await table.settle();
    expect(world().sessionEndedId).toBe(S1);
    expect(world().sessionSummary?.text ?? '').toMatch(/\[A2\]/);   // End's refresh landed
    held.release();
    await table.settle(); await table.drain();
    const card = table.cards(f => f.narratorCard && /\[R1\]/.test(f.narrationText ?? ''));
    expect(card).toHaveLength(1);
    expect(card[0].flags[MODULE_ID].sessionId).toBe(S1);
    await beginSession();
    expect(world().previousSessionSummary?.sessionId).toBe(S1);
    expect(world().previousSessionSummary?.text ?? '', "LAST SESSION tells the session's last move").toMatch(/\[R1\]/);
  }, 60_000);
});
