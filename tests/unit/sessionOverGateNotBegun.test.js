/**
 * STARFORGED COMPANION
 * tests/unit/sessionOverGateNotBegun.test.js
 *
 * Issue #362 D14 (SESSION-OVER-PLAY-CONTINUES; the maintainer's answer A) —
 * after four idle hours with the GM's game left loaded, nothing mints: the
 * boundary is applied only at a canonical GM's world load or at Begin a
 * Session (decisions.md "A session ends at End Session or after four idle
 * hours" rejects a mint at the first message). The chat gate read only the
 * session-active flag, so play went on in a session the Session panel read as
 * "Over", and the first reload then closed it mid-scene. The gate now treats
 * an over session as not begun: the line is not narrated, the notice points
 * at Begin a Session, and Begin takes the boundary when play resumes.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9] }));   // challenge 3, 4; action 6 — a strong hit
vi.mock('../../src/pacing/router.js', async (orig) => ({
  ...(await orig()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (orig) => ({
  ...(await orig()), interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (orig) => {
  const real = await orig();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
// A namespace import: the gate's own composition tests below load without it.
import * as lifecycle from '../../src/session/lifecycle.js';

const { SESSION_IDLE_HOURS } = lifecycle;
const sessionInPlay = (...args) => lifecycle.sessionInPlay(...args);

const HOUR = 3_600_000;
const LINE = 'Kira slips past the sentry and forces the hatch open.';
const ago = (ms) => new Date(Date.now() - ms).toISOString();

describe('issue #362 D14 — sessionInPlay, the chat gate\'s question', () => {
  const begun = (extra = {}) => ({ sessionActive: true, currentSessionId: 's-1', lastSessionTimestamp: ago(HOUR), ...extra });

  it('a begun session last seen within the idle limit is in play', () => {
    expect(sessionInPlay(begun())).toBe(true);
  });

  it(`a begun session ${SESSION_IDLE_HOURS} idle hours on is over: not in play`, () => {
    expect(sessionInPlay(begun({ lastSessionTimestamp: ago(SESSION_IDLE_HOURS * HOUR + 60_000) }))).toBe(false);
  });

  it('a closed gate, and a session End a Session marked, are not in play', () => {
    expect(sessionInPlay(begun({ sessionActive: false }))).toBe(false);
    expect(sessionInPlay(begun({ sessionEndedId: 's-1' }))).toBe(false);
  });

  it('a begun session with no known sighting is not taken as over (the gate fails open)', () => {
    expect(sessionInPlay({ sessionActive: true, currentSessionId: 's-1' })).toBe(true);
  });
});

describe('issue #362 D14 — the chat gate treats an over session as not begun', () => {
  let table;
  const moveCards = () => table.cards(f => f.moveResolution);
  const notices = () => table.cards(f => f.sessionGateNotice);

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());

  async function reset({ lastSeen, activity = null }) {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'od-s1', currentSessionId: 'od-s1', sessionNumber: 3,
        lastSessionTimestamp: lastSeen, currentSceneId: 'od-scene', sceneTruths: [], clocks: [] },
      ...(activity ? { sessionActivity: { sessionId: 'od-s1', at: activity } } : {}),
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-test');
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
    scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
    silenceConsoleErrors();
  }

  async function typeLine() {
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();
  }

  it('control: a line typed in a session seen an hour ago is rolled and narrated', async () => {
    await reset({ lastSeen: ago(HOUR) });
    await typeLine();
    expect(moveCards()).toHaveLength(1);
    expect(notices()).toEqual([]);
  }, 30_000);

  it('control: chat an hour ago keeps a session minted six hours ago in play', async () => {
    await reset({ lastSeen: ago(6 * HOUR), activity: ago(HOUR) });
    await typeLine();
    expect(moveCards()).toHaveLength(1);
  }, 30_000);

  it('a line typed after four idle hours is not narrated, and its author is told to Begin a Session', async () => {
    await reset({ lastSeen: ago(5 * HOUR) });
    await typeLine();

    expect(moveCards(), 'nothing was rolled into the over session').toHaveLength(0);
    const notice = notices().at(-1);
    expect(notice, 'the author is told').toBeTruthy();
    expect(notice.whisper).toContain('pl-1');
    expect(notice.content).toMatch(/over/i);
    expect(notice.content).toMatch(/Begin a Session/);
    // The stored session is left as it was: the boundary is Begin's to take.
    expect(table.world.campaignState().currentSessionId).toBe('od-s1');
  }, 30_000);
});
