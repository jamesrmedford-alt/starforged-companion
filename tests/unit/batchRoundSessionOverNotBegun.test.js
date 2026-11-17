/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundSessionOverNotBegun.test.js
 *
 * Issue #362 D14 (SESSION-OVER-PLAY-CONTINUES; the maintainer's answer A —
 * "the chat gate treats an over session as not begun"), Batch Mode's path.
 * After four idle hours with the GM's game left loaded nothing mints, and the
 * chat gate now refuses a line typed into the over session
 * (sessionOverGateNotBegun.test.js). The round driver still read only the
 * session-active flag (`roundSessionOver`, `openRoundIfDue`,
 * `onCampaignStateChanged`): a round opened, collected and recovered in a
 * session the Session panel read as "Over". It now asks the gate's question
 * (lifecycle.js `sessionInPlay`): no round opens in an over session, its
 * collecting round closes as at End a Session, and the Round window says no
 * session has begun.
 *
 * Driven on a booted GM + player table (tests/helpers/multiClient.js).
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { ROUND_NOTICES } from '../../src/batch/roundView.js';

const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const REPLY = 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');

/** A begun session, last seen `lastSeen` ago (its mint) — and its last chat activity, when given. */
async function fresh({ lastSeen, activity = null }) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'rs-1', currentSessionId: 'rs-1',
      sessionNumber: 2, lastSessionTimestamp: ago(lastSeen), currentSceneId: 'rs-scene', sceneTruths: [] },
    ...(activity != null ? { sessionActivity: { sessionId: 'rs-1', at: ago(activity) } } : {}),
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
}

const on = async () => { await table.client('gm-1').setSetting('batchMode.enabled', true); await table.settle(); await table.drain(); };

/** The Round window's view on a client, as its window would render it. */
async function windowView(userId) {
  const c = table.client(userId);
  const mod = await c.import('../../src/ui/roundWindow.js');
  const app = await c.run(() => mod.RoundWindowApp.open());
  return (await c.run(() => app._prepareContext({}))).view;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe('issue #362 D14 — a round opens only in a session in play', () => {
  it('control: Batch Mode switched on in a session seen an hour ago opens round 1', async () => {
    await fresh({ lastSeen: HOUR });
    await on();
    expect(round()).toMatchObject({ number: 1, phase: 'collecting', sessionId: 'rs-1' });
  }, 30_000);

  it('Batch Mode switched on after four idle hours opens no round, and the window says no session has begun', async () => {
    await fresh({ lastSeen: 5 * HOUR });
    await on();
    expect(round(), 'no round opened into the over session').toBeUndefined();
    const view = await windowView('pl-1');
    expect(view.mode).toBe('no-session');
    expect(view.banners.map(b => b.text)).toContain(ROUND_NOTICES.noSession);
  }, 30_000);

  it('Begin a Session after the idle hours opens round 1 of the new session', async () => {
    await fresh({ lastSeen: 5 * HOUR });
    await on();
    // Begin's mint: the next session, its gate open, stamped now.
    await table.client('gm-1').setSetting('campaignState', {
      ...world(), currentSessionId: 'rs-2', sessionStartedId: 'rs-2', sessionNumber: 3, lastSessionTimestamp: ago(0),
    });
    await table.settle(); await table.drain();
    expect(round()).toMatchObject({ number: 1, phase: 'collecting', sessionId: 'rs-2' });
  }, 30_000);
});

describe('issue #362 D14 — a collecting round of a session gone over is closed', () => {
  beforeEach(async () => {
    // Minted six hours ago, chat an hour ago: in play, so the round opens.
    await fresh({ lastSeen: 6 * HOUR, activity: HOUR });
    await on();
    expect(round()).toMatchObject({ phase: 'collecting', sessionId: 'rs-1' });
  });

  it('the next campaignState write after four idle hours closes it, as End a Session does', async () => {
    // Nothing said in chat since: the session's last sighting is five hours ago.
    await table.client('gm-1').setSetting('sessionActivity', { sessionId: 'rs-1', at: ago(5 * HOUR) });
    await table.client('gm-1').setSetting('campaignState', { ...world(), updatedAt: ago(0) });
    await table.settle(); await table.drain();
    expect(round()).toMatchObject({ phase: 'closed', closeReason: 'session-ended' });
  }, 30_000);

  it('a recovery after four idle hours closes it (roundSessionOver)', async () => {
    await table.client('gm-1').setSetting('sessionActivity', { sessionId: 'rs-1', at: ago(5 * HOUR) });
    const gm = table.client('gm-1');
    const driver = await gm.import('../../src/batch/driver.js');
    await gm.run(() => driver.recoverRound('keyed-gm'));
    await table.settle(); await table.drain();
    expect(round()).toMatchObject({ phase: 'closed', closeReason: 'session-ended' });
  }, 30_000);

  it('control: a recovery while the session is in play leaves the round collecting', async () => {
    const gm = table.client('gm-1');
    const driver = await gm.import('../../src/batch/driver.js');
    await gm.run(() => driver.recoverRound('keyed-gm'));
    await table.settle(); await table.drain();
    expect(round()).toMatchObject({ phase: 'collecting', sessionId: 'rs-1' });
  }, 30_000);
});
