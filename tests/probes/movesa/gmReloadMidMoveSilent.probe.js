/**
 * PROBE (thirteenth audit, area "moves A") — MOVA: a move cut off between its
 * roll and its record by the resolving GM's own reload is dropped in silence.
 *
 * Free-flow order (index.js onMessage → movePipeline.js): rollMove applies the
 * outcome's effects and posts the result card; the narration's Claude call
 * runs (seconds to a minute); only then recordMove writes the roller's meters
 * and the working copy's record (legacy marks, an arrival, a site reveal) and
 * opens the card's Burn / Improve (`originalApplied`). If the canonical GM's
 * page reloads or crashes in that window — at a one-GM table, the usual one —
 * the pipeline is gone: the card on the table says "Strong Hit … +2 momentum",
 * nothing of it was recorded, its Burn / Improve stay "Available once the
 * move's result is recorded" for good, and the lock stays held.
 *
 * At a two-GM table the next canonical GM releases the lock and whispers the
 * GMs "that move's narration or its result may be incomplete — check its card"
 * (index.js releaseLockOfDisconnectedGM, issue #325 W25). The same GM's own
 * reload — the ready reset (index.js "Reset stale pendingMove lock on ready")
 * — clears the lock with a console line only: nobody is told a move was cut
 * short, and nothing offers its unrecorded result again.
 *
 * Correct behaviour asserted: the load that clears a stale move lock tells the
 * GMs, as the handover does.
 */
/* global silenceConsoleErrors */
import { describe, it, expect, afterEach, vi } from 'vitest';

// gather_information strong hit: challenge dice 1 and 2, action die 6.
const control = vi.hoisted(() => ({ dice: [0.0, 0.15, 0.99] }));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
afterEach(() => table?.teardown());

const world = () => table.world.campaignState();
const SETTINGS = { chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: false };
const liveSession = (extra = {}) => ({
  ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
  currentSessionId: 'rl-s1', sessionStartedId: 'rl-s1', sessionNumber: 1,
  lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [], clocks: [],
  ...extra,
});
const isNarration = (call) => /SIDECAR|NARRATOR ROLE/.test(call?.system ?? '');
const momentumOf = (id) => Number(table.actors.get(id)?.system?.momentum?.value ?? table.actors.get(id)?.system?.momentum ?? NaN);

/** The one GM loads a world whose stored lock her own earlier page left behind. */
async function reloadWithOwnStaleLock() {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1], boot: false,
    world: { settings: { ...SETTINGS, campaignState: liveSession({
      pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: 'claim-of-the-page-that-reloaded',
    }) } },
  });
  await table.client('gm-1').boot();
  await table.client('pl-1').boot();
  await table.settle(); await table.drain();
}

describe('the resolving GM reloads between a move\'s roll and its record (one-GM table)', () => {
  it('control: what the cut-off move leaves — its card on the table, nothing recorded, the lock held', async () => {
    silenceConsoleErrors();
    table = await simulateTable({
      users: [USERS.GM, USERS.P1],
      world: { settings: { ...SETTINGS, campaignState: liveSession() } },
    });
    table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    const claude = scriptClaude(table);
    const held = claude.hold(isNarration);       // the narration never comes back: the page is gone
    const before = momentumOf('pc-1');
    expect(Number.isFinite(before), 'the PC has a momentum value').toBe(true);

    table.client('pl-1').chat('I comb the archive for word of Chen.', {
      speaker: { actor: 'pc-1', alias: 'Kira' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'gather_information' } },
    });
    await held.arrived;
    await table.settle();
    await table.leave('gm-1');                   // the GM's tab reloads / crashes mid-narration

    const [card] = table.cards(f => f.moveResolution);
    expect(card, 'the strong hit\'s card is on the table').toBeTruthy();
    expect(card.content).toMatch(/Strong Hit/);
    expect(momentumOf('pc-1'), 'its +2 momentum was never written').toBe(before);
    expect(world().pendingMove).toBe(true);
    expect(world().pendingMoveBy).toBe('gm-1');
  }, 60_000);

  it('control: the GM\'s next load clears her own stale lock — the table can move again', async () => {
    silenceConsoleErrors();
    await reloadWithOwnStaleLock();
    expect(world().pendingMove).toBe(false);
  }, 60_000);

  it('the load that clears the stale lock tells the GMs a move was cut short (as the two-GM handover does)', async () => {
    silenceConsoleErrors();
    await reloadWithOwnStaleLock();
    expect(world().pendingMove).toBe(false);

    // FAILS today: the ready reset logs "Reset stale pendingMove lock on ready" to the console and nothing else.
    const told = table.world.messages().filter(m =>
      m.flags?.[MODULE_ID]?.moveLockReleasedCard === true
      || /move lock|move was being resolved|may be incomplete|not recorded/i.test(String(m.content ?? '')));
    expect(told.length, 'a card tells the GMs the interrupted move may be incomplete').toBeGreaterThan(0);
  }, 60_000);
});
