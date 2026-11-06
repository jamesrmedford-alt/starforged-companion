/**
 * SESS-5 BATCH-IDLE-ROUND-RECOVERED-LIVE (eleventh audit, session).
 *
 * The table played in Batch Mode, a player submitted an action, and everyone
 * left without End a Session. The session is over once four hours pass with
 * no chat message (decisions "A session ends at End Session or after four
 * idle hours"), and "a collecting round that belongs to no active session is
 * closed" (decisions "Batch Mode"). At the next world load the canonical GM's
 * ready hook starts the mint (initSessionId — it awaits the summary finalise
 * and the scene close before it writes) and then installs the Batch Mode
 * driver, whose recoverRound("ready") reads the store as it is at that
 * moment: the idle session still has its gate open and its id, so the round
 * is "live". It gains participants, has its submissions read again on the
 * GM's key (readAction: Claude calls for last week's actions), and is
 * advanced — resolved, if every connected participant was ready — before the
 * mint lands and closes it.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ readings: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async ({ playerText }) => {
    control.readings.push(playerText);
    return { runMove: true, decision: 'MOVE', suggestedMove: null };
  }),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { createRound, submitEntry } from '../../../src/batch/round.js';

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const TEXT = 'I slip through the maintenance shaft before the drones turn.';

function yesterdaysRound() {
  const r = createRound({
    id: 'round-old', number: 4, sessionId: 'idle-s1', sceneId: 'sc-1', now: hoursAgo(20),
    participants: [{ userId: 'pl-1', userName: 'Pat', isGM: false, actorId: 'pc-kira', actorName: 'Kira' }],
  });
  return submitEntry(r, { userId: 'pl-1', text: TEXT, submissionId: 'sub-old', now: hoursAgo(20) });
}

let table;
const round = () => table.world.getSetting('batchMode.round');
const world = () => table.world.campaignState();

beforeAll(async () => {
  table = await simulateTable({
    users: [USERS.GM, { ...USERS.P1, active: false }],
    clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' } },
    world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
      combatTrackerEnabled: false,
      'batchMode.enabled': true,
      'batchMode.round':   yesterdaysRound(),
      campaignState: {
        ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: hoursAgo(22), currentSessionId: 'idle-s1',
        sessionStartedId: 'idle-s1', sessionNumber: 6, lastSessionTimestamp: hoursAgo(20),
        currentSceneId: null, sceneTruths: [],
      },
    } },
  });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  await table.settle();
  await table.drain();
}, 30_000);
afterAll(() => table?.teardown());

describe('SESS-5 — the load that ends an idle session recovers its collecting round as live first', () => {
  it('sanity: the load minted the next session and the old round ended up closed', () => {
    expect(world().currentSessionId).not.toBe('idle-s1');
    expect(world().sessionActive).toBe(false);
    expect(round()).toMatchObject({ id: 'round-old', phase: 'closed', closeReason: 'session-ended' });
  });

  it("the over session's submission is not read again at load (no reading for last session's action)", () => {
    expect(control.readings).toEqual([]);
  });
});

describe('SESS-5 control — a reload inside a live session', () => {
  let live;
  beforeAll(async () => {
    await table.teardown();
    control.readings = [];
    live = await simulateTable({
      users: [USERS.GM, { ...USERS.P1, active: false }],
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' } },
      world: { settings: {
        chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
        combatTrackerEnabled: false,
        'batchMode.enabled': true,
        'batchMode.round':   { ...yesterdaysRound(), sessionId: 'live-s1' },
        campaignState: {
          ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: hoursAgo(2), currentSessionId: 'live-s1',
          sessionStartedId: 'live-s1', sessionNumber: 6, lastSessionTimestamp: hoursAgo(1),
          currentSceneId: null, sceneTruths: [],
        },
      } },
    });
    live.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
    await live.settle();
    await live.drain();
  }, 30_000);
  afterAll(() => live?.teardown());

  it('control: the session goes on — its round stays open and the lost reading is started again', () => {
    expect(live.world.campaignState().currentSessionId).toBe('live-s1');
    expect(live.world.getSetting('batchMode.round')).toMatchObject({ phase: 'collecting' });
    expect(control.readings).toEqual([TEXT]);
  });
});
