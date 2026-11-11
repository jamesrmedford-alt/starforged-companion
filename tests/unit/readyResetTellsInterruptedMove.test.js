/**
 * STARFORGED COMPANION
 * tests/unit/readyResetTellsInterruptedMove.test.js
 *
 * A move lock the `ready` reset clears is told to the GMs (issue #347 AB14).
 *
 * A sole GM who reloaded while a move narrated (it looks stuck) — or whose
 * page crashed — had the lock reset at the next load in silence, though the
 * move's card was posted and its progress marks and Pay the Price applied:
 * the roller's meters, the move record and the Burn / Improve stamp never
 * landed, its card's Burn read "available once recorded" for good, and a
 * retyped line rolled again on top of the first roll's marks. The two-GM
 * handover already told the GMs (W25's card). Both ready resets now post
 * that card: the canonical GM's, and a co-GM's own earlier page's (AB04).
 */
/* global silenceConsoleErrors */
import { describe, it, expect, afterEach, vi } from 'vitest';

// gather_information strong hit: challenge dice 1 and 2, action die 6 → +2 momentum.
const control = vi.hoisted(() => ({ dice: [0.0, 0.15, 0.99] }));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
afterEach(() => { table?.teardown(); });

const world = () => table.world.campaignState();
const isNarration = (call) => /SIDECAR|NARRATOR ROLE/.test(call?.system ?? '');
const SETTINGS = { chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: false, 'factContinuity.enabled': false };
const liveSession = () => ({
  ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
  currentSessionId: 'sess-1', sessionStartedId: 'sess-1', sessionNumber: 1,
  lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
});
const FORCED = { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'gather_information' } };
const LINE = 'I comb the archive for word of Chen.';

/** A notice to the GMs that a move was cut short (the handover's card, or any wording of it). */
const interruptedMoveNotices = () => table.cards((f, m) =>
  f.moveLockReleasedCard === true || /move lock released|may be incomplete|was interrupted|not recorded/i.test(String(m.content ?? '')));

describe('a move cut short by its GM\'s reload (issue #347 AB14)', () => {
  it('the sole GM reloads while a move is being narrated: the lock is reset and the GMs are told the move may be incomplete', async () => {
    silenceConsoleErrors();
    table = await simulateTable({
      users: [USERS.GM, USERS.P1],
      world: { settings: { ...SETTINGS, campaignState: liveSession() } },
    });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    const kira = table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 } });
    const momentumBefore = kira.system?.momentum?.value;
    const claude = scriptClaude(table);
    const held = claude.hold(isNarration);

    table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-1', alias: 'Kira' }, flags: FORCED });
    await held.arrived;
    await table.settle();

    // The move card is on the table, the lock is held — and the strong hit's
    // +2 momentum is not on the sheet yet (free-flow records after narrating).
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(world().pendingMove).toBe(true);
    expect(kira.system?.momentum?.value, 'the result is not recorded while the narration is in flight').toBe(momentumBefore);

    // The GM's page goes (a reload): the world keeps the lock, the page's pipeline is gone.
    await table.leave('gm-1');
    const stored = world();
    expect(stored.pendingMove).toBe(true);
    table.teardown();

    // The same GM loads the world again.
    table = await simulateTable({
      users: [USERS.GM, USERS.P1], boot: false,
      world: { settings: { ...SETTINGS, campaignState: stored } },
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' } },
    });
    await table.client('gm-1').boot();
    await table.client('pl-1').boot();
    await table.settle(); await table.drain();

    expect(world().pendingMove, 'the stale lock is reset at load').toBe(false);
    expect(interruptedMoveNotices().length, 'the GMs are told a move was cut short').toBeGreaterThan(0);
  }, 60_000);

  it('control: with a second GM connected, the handover releases the lock and tells the GMs', async () => {
    silenceConsoleErrors();
    table = await simulateTable({
      users: [USERS.GM, USERS.GM2, USERS.P1],
      world: { settings: { ...SETTINGS, campaignState: liveSession() } },
    });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 } });
    const claude = scriptClaude(table);
    const held = claude.hold(isNarration);

    table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-1', alias: 'Kira' }, flags: FORCED });
    await held.arrived;
    await table.settle();
    expect(world().pendingMove).toBe(true);

    await table.leave('gm-1');
    await table.settle();

    expect(world().pendingMove).toBe(false);
    expect(interruptedMoveNotices()).toHaveLength(1);
  }, 60_000);
  it("a co-GM who is not canonical frees its own earlier page's lock at its load and tells the GMs too", async () => {
    silenceConsoleErrors();
    table = await simulateTable({
      users: [USERS.GM, USERS.GM2, USERS.P1], boot: false,
      world: { settings: { ...SETTINGS, keyedGmUserIds: ['gm-1', 'gm-2'],
        campaignState: { ...liveSession(), pendingMove: true, pendingMoveBy: 'gm-2', pendingMoveClaim: 'gm2-earlier-page' } } },
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' }, 'gm-2': { claudeApiKey: 'sk-ant-gus' } },
    });
    await table.client('gm-1').boot();
    await table.client('gm-2').boot();
    await table.client('pl-1').boot();
    await table.settle(); await table.drain();

    expect(world().pendingMove).toBe(false);
    expect(interruptedMoveNotices()).toHaveLength(1);
    expect(String(interruptedMoveNotices()[0].content)).toMatch(/may be incomplete/);
  }, 60_000);

  it('control: a load that finds no lock tells nobody anything', async () => {
    silenceConsoleErrors();
    table = await simulateTable({
      users: [USERS.GM, USERS.P1], boot: false,
      world: { settings: { ...SETTINGS, campaignState: liveSession() } },
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' } },
    });
    await table.client('gm-1').boot();
    await table.client('pl-1').boot();
    await table.settle(); await table.drain();
    expect(interruptedMoveNotices()).toHaveLength(0);
  }, 60_000);
});
