/**
 * Issue #347 AB19 (XCARD-MISSED-BY-RETURNING-GM) — a narration in flight when
 * its GM's connection drops is discarded.
 *
 * Every narrator entry point re-checks the X-Card when its Claude reply is in
 * (watchXCard / isXCardActive, src/narration/narrator.js — issue #300 F13,
 * #306 R01): "the table must not read or hear what the card was played to
 * stop". The check reads the caller's snapshot and THIS client's cached
 * campaignState. A world-setting write that lands while a client's socket is
 * down never reaches that client's cache (Foundry replays nothing on a
 * reconnect; it reloads the page only after a drop of five seconds or more).
 * So at a two-GM table, when the GM narrating a move dropped for a moment and
 * a player played the X-Card meanwhile (the other GM, canonical for that
 * moment, recorded the pause), the first GM — back on the same page — read
 * "not active, same play count" from its stale cache: the narration was
 * posted under the X-Card and its sidecar applied.
 *
 * The watch now counts this client's connection drops (socket.io's
 * `disconnect`, src/multiplayer/connectionWatch.js): a narration whose call
 * straddled one is discarded — nothing posted but the paused notice, saying
 * why; its sidecar never applied. The move's own record and the lock
 * release, written from the same stale cache, would still have lifted the
 * pause the cache missed: the page back from the drop now writes nothing
 * until it reloads (issue #347 AB19-STALE-CACHE-WRITES).
 *
 * The harness models the reconnect with leave / join, as the X08 rows do; a
 * client that leaves sees `disconnect` on its own socket. A reload is
 * table.reload.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const STRONG = [0.25, 0.35, 0.9];
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const [c1, c2, action] = STRONG;
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(c1).mockReturnValueOnce(c2).mockReturnValueOnce(action);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, traceTable } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[{"subject":"scene","fact":"The breach is sealed."}],"stateChanges":[]}\n```';
const isNarration = (call) => call.model === NARRATION_MODEL;

let table;
const world = () => table.world.campaignState();
const narrated = () => table.cards(f => f.narratorCard && !f.narrationFallback);
const paused = () => table.cards(f => f.narrationPaused);
const pausedNotice = () => table.world.messages().find(m => m.flags?.[MODULE_ID]?.narrationPaused)?.content ?? '';

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  if (!table.client('gm-1').connected) await table.join('gm-1');
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
      // A live session: a GM's page that loads mid-session keeps it.
      lastSessionTimestamp: new Date().toISOString(),
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
  silenceConsoleErrors();
});

async function move() {
  await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-pat' } });
  await table.settle();
}

describe('the X-Card and a narration in flight on a GM whose socket drops', () => {
  it('control: an X-Card played while the narrating GM stays connected stops the narration, and the pause stands', async () => {
    const narration = scriptClaude(table, { fallback: () => REPLY }).hold(isNarration);
    await move();
    await narration.arrived;

    await table.client('pl-2').chat('!x');
    await table.settle();
    expect(world().xCardActive).toBe(true);

    narration.release(REPLY);
    await table.settle(); await table.drain();

    expect(narrated()).toHaveLength(0);
    expect(paused()).toHaveLength(1);
    expect(world().xCardActive).toBe(true);
    expect(world().pendingMove).toBe(false);
  }, 30_000);

  it('an X-Card played while the narrating GM is off the server for a moment still stops its narration', async () => {
    const trace = traceTable(table);
    const narration = scriptClaude(table, { fallback: () => REPLY }).hold(isNarration);
    await move();
    await narration.arrived;
    expect(world().pendingMove, 'gm-1 is narrating the move (setup)').toBe(true);

    trace.mark("gm-1's socket drops");
    await table.leave('gm-1');
    await table.settle();

    trace.mark("Ren's player plays the X-Card — the other GM records the pause");
    await table.client('pl-2').chat('!x');
    await table.settle();
    expect(world().xCardActive, 'the X-Card is active in the world (setup)').toBe(true);

    trace.mark('gm-1 is back (the same page); its narration reply arrives');
    await table.join('gm-1');
    narration.release(REPLY);
    await table.settle();
    await table.drain(5_000).catch(() => {});
    await table.settle();

    expect(narrated(), 'no narration posted under the X-Card').toHaveLength(0);
    expect((world().sceneTruths ?? []).filter(t => !t.retracted && /breach is sealed/i.test(t.fact ?? '')),
      'the discarded reply\'s facts are not recorded').toEqual([]);
    expect(paused()).toHaveLength(1);
    expect(pausedNotice(), 'the notice says why').toMatch(/connection to the server dropped while it was being written/);
  }, 30_000);

  it('a narration whose GM dropped off the server for a moment is discarded even with no X-Card: its cache cannot say', async () => {
    const narration = scriptClaude(table, { fallback: () => REPLY }).hold(isNarration);
    await move();
    await narration.arrived;
    await table.leave('gm-1');
    await table.join('gm-1');
    narration.release(REPLY);
    await table.settle();
    await table.drain(5_000).catch(() => {});
    await table.settle();
    expect(narrated()).toHaveLength(0);
    expect(pausedNotice()).toMatch(/connection to the server dropped while it was being written/);
    expect(world().pendingMove).toBe(false);
  }, 30_000);

  it('control: the next move after the GM has reloaded is narrated as usual', async () => {
    await table.leave('gm-1');
    await table.reload('gm-1');
    scriptClaude(table, { fallback: () => REPLY });
    await move();
    await table.settle(); await table.drain();
    expect(narrated()).toHaveLength(1);
  }, 30_000);
});
