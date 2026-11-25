/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/lateRoundTruthCarriedIntoNextSession.test.js
 *
 * Issue #364 LATE-ROUND-SCENE-AFTER-MINT — what becomes of the scene, and the
 * fact, of a Batch Mode round narrated after the world load minted the next
 * session (rules/narrator-memory.md invariant 6). Pinned as it stands; no
 * source change:
 *
 *   - The mint closes the ended session's scene (its facts migrated, and kept
 *     for that session). The late narration finds no scene and starts one of
 *     its own (ensureSceneStarted); the fact its sidecar records sits in that
 *     scene, stamped with the round's own session and number and with its
 *     narration's id (ROUND-CARD-SESSION-ID-AFTER-MINT).
 *   - Begin a Session neither ends that scene nor starts another — a scene is
 *     never minted over a live one — so it is the minted session's scene, as
 *     a scene opened by narration between sessions is: the fact is carried,
 *     live, into the ACTIVE SCENE block the session's first narration is
 *     given. Nothing dangles: the fact's scene is the current scene.
 *   - When that scene ends in the minted session the fact is closed with it,
 *     and kept on the minted session's unnamed list by its narration id.
 *   - Before or after that scene end, the X-Card still answers the late
 *     narration (XCARD-MISSES-LATE-ROUND-CARD): the fact is retracted in the
 *     ledger, or blocked for the session.
 *
 * On a booted table (tests/helpers/multiClient.js), the harness of
 * tests/unit/roundNarratedAfterMintKeepsItsSession.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
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
    // every roll a weak hit; Kira's momentum of 9 burns it to a strong hit
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { UPGRADE_IN_FLIGHT_GRACE_MS } from '../../src/batch/round.js';
import { holdWrites, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const VENT_FACT = 'The vent grille hangs loose.';
const REPLY = `Kira slips through.\n\`\`\`json\n{"newTruths":[{"subject":"vent","fact":"${VENT_FACT}"}],"stateChanges":[]}\n\`\`\``;
const EARLIER = 'The drones sweep the corridor in threes.';
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

/** A fact the ended session's scene holds at the mint, recorded by its earlier narration. */
const EARLIER_TRUTH = { id: 't-early', subject: { kind: 'text', text: 'corridor' }, fact: 'The corridor lights are dead.',
  sceneId: 'sc-1', sessionId: 'sess-1', sessionNum: 4, narrationId: 'nar-earlier', source: 'narrator_sidecar', asserter: 'narrator',
  retracted: false };

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const flagsOf = (m) => m?.flags?.[MODULE_ID] ?? null;
const roundCard = () => flagsOf(table.cards(f => f.narratorCard && f.roundId)[0]);
const ventTruth = () => (world().sceneTruths ?? []).find(t => t?.fact === VENT_FACT) ?? null;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());
afterEach(() => { vi.useRealTimers(); });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'sess-1', currentSessionId: 'sess-1', sessionNumber: 4,
      lastSessionTimestamp: ago(HOUR), currentSceneId: 'sc-1', sceneTruths: [EARLIER_TRUTH] },
    sessionActivity: { sessionId: 'sess-1', at: ago(1000) },
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

/** Kira's burn is still applying when Ren's roll ends: the round waits at its upgrade step. */
async function burnStillApplyingAtUpgradeStep() {
  const renCard = holdWrites(table, (w) => w.kind === 'message.create'
    && w.data?.flags?.[MODULE_ID]?.moveResolution === true && w.data?.flags?.[MODULE_ID]?.roundUserId === 'pl-2');
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I vault the barricade.', submissionId: 'r1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
  await renCard.arrived;
  const cardId = round().entries['pl-1'].rolled.cardId;
  const burnPay = holdWrites(table, (w) => w.kind === 'actor.update' && w.id === 'pc-kira' && w.client === 'gm-1');
  await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
  await burnPay.arrived;
  renCard.release();
  await table.settle();
  expect(round(), 'setup: at the upgrade step, in its own session').toMatchObject({ phase: 'upgrading', sessionId: 'sess-1' });
}

/** End a Session, and a load that mints the next session while the round still waits. */
async function roundLeftWaitingAcrossTheMint() {
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<p>${EARLIER}</p>`,
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: EARLIER, sessionId: 'sess-1', sessionNumber: 4, narrationId: 'nar-earlier' } },
  }));
  await table.settle();
  await burnStillApplyingAtUpgradeStep();
  await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: false, sessionEndedId: 'sess-1' });
  await table.settle();
  await table.reload('gm-1');
  await table.settle();
  expect(world().sessionNumber, 'setup: the load minted session 5').toBe(5);
  const r = round();
  table.world.setSetting('batchMode.round', {
    ...r, entries: { ...r.entries, 'pl-1': { ...r.entries['pl-1'], upgrade: { ...r.entries['pl-1'].upgrade,
      inFlightSince: ago(UPGRADE_IN_FLIGHT_GRACE_MS + 1000) } } },
  });
}

/** The GM's Send now: the old round is narrated, late, into its own session. */
async function lateRoundNarrated() {
  const gm = table.client('gm-1');
  const driver = await gm.import('../../src/batch/driver.js');
  await gm.run(() => driver.requestSendNow());
  await table.settle();
  expect(roundCard(), 'setup: the late round\'s card is its own session\'s').toMatchObject({ sessionId: 'sess-1', sessionNumber: 4 });
}

/** Begin a Session, from the Session panel (no vignette, no galley). */
async function beginTheSession() {
  const gm = table.client('gm-1');
  const gmRelay = await gm.import('../../src/multiplayer/gmRelay.js');
  await gm.run(() => gmRelay.requestGmAction('session.begin', { vignetteRolled: false, includeGalley: false }));
  await table.settle();
  expect(world(), 'setup: the minted session is begun').toMatchObject({ sessionActive: true, sessionStartedId: world().currentSessionId, sessionNumber: 5 });
}

/** The session's scene ends (the scene lifecycle's own end, on the GM). */
async function theSceneEnds() {
  const gm = table.client('gm-1');
  const sceneLifecycle = await gm.import('../../src/factContinuity/sceneLifecycle.js');
  await gm.run(() => sceneLifecycle.endScene({ ...world() }, { reason: 'scene_change' }));
  await table.settle();
}

async function playXCard() {
  await table.client('pl-1').chat('!x');
  await table.settle();
  expect(world().xCardActive, 'the scene is paused').toBe(true);
}

describe('issue #364 LATE-ROUND-SCENE-AFTER-MINT — the scene and the fact of a round narrated after the next session was minted', () => {
  it('the mint closed the ended session\'s scene; the late narration starts one of its own, and its fact is its own session\'s', async () => {
    await roundLeftWaitingAcrossTheMint();
    // The mint's close: no scene left open, the ended session's fact kept for that session.
    expect(world().currentSceneId).toBeNull();
    expect(world().sceneTruths).toEqual([]);
    expect(world().sessionRetractions).toMatchObject({ sessionId: 'sess-1', narrated: [{ truthId: 't-early', narrationId: 'nar-earlier' }] });

    await lateRoundNarrated();

    const scene = world().currentSceneId;
    expect(scene, 'a scene of its own, started after the mint\'s close').toEqual(expect.any(String));
    expect(scene).not.toBe('sc-1');
    expect(world().sceneTruths).toHaveLength(1);
    expect(ventTruth()).toMatchObject({
      sessionId: 'sess-1', sessionNum: 4, sceneId: scene, narrationId: roundCard().narrationId, retracted: false,
    });
    expect(world().sceneState?.sceneId).toBe(scene);
    // The minted session stays unbegun, and the ended session's kept list is untouched.
    expect(world()).toMatchObject({ sessionNumber: 5, sessionActive: false });
    expect(world().sessionRetractions).toMatchObject({ sessionId: 'sess-1' });
  }, 60_000);

  it('Begin a Session keeps that scene as the session\'s own: the fact is carried, live, into its first narration\'s ACTIVE SCENE', async () => {
    await roundLeftWaitingAcrossTheMint();
    await lateRoundNarrated();
    const scene = world().currentSceneId;
    const fact = ventTruth();

    await beginTheSession();

    expect(world().currentSceneId, 'no scene ended, none started over it').toBe(scene);
    expect(world().sceneState?.sceneId).toBe(scene);
    expect(world().sceneTruths, 'the fact as the late narration recorded it — its own session\'s').toEqual([fact]);
    const gm = table.client('gm-1');
    const prompt = await gm.import('../../src/narration/narratorPrompt.js');
    const ledger = await gm.run(() => prompt.buildLedgerBlock(world(), { matchedEntityIds: [], currentLocationId: null, maxTokens: Infinity }));
    expect(ledger.described, 'the session\'s next narration is told it as the scene\'s (the narration\'s own)').toContain(`vent — ${VENT_FACT}`);
  }, 60_000);

  it('after Begin a Session the X-Card still answers the late narration: its fact in the session\'s scene is retracted', async () => {
    await roundLeftWaitingAcrossTheMint();
    await lateRoundNarrated();
    await beginTheSession();

    await playXCard();

    expect(roundCard().xCarded).toBe(true);
    expect(ventTruth()).toMatchObject({ retracted: true, retractedBy: 'xcard', sessionId: 'sess-1' });
  }, 60_000);

  it('when that scene ends in the minted session the fact is closed with it, kept by its narration id — and the X-Card then blocks it', async () => {
    await roundLeftWaitingAcrossTheMint();
    await lateRoundNarrated();
    const narrationId = roundCard().narrationId;
    const truthId = ventTruth().id;
    await beginTheSession();

    await theSceneEnds();

    expect(world().currentSceneId).toBeNull();
    expect(world().sceneTruths).toEqual([]);
    // Kept for the session it closed in — the minted one — so the X-Card can still take it back.
    expect(world().sessionRetractions).toMatchObject({
      sessionId: world().currentSessionId,
      narrated: [{ fact: VENT_FACT, narrationId, truthId }],
    });

    await playXCard();

    expect(roundCard().xCarded).toBe(true);
    expect(world().sessionRetractions.narrated).toEqual([]);
    expect(world().sessionRetractions.blocked).toEqual([expect.objectContaining({ fact: VENT_FACT, narrationId, truthId })]);
  }, 60_000);
});
