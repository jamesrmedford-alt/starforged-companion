/**
 * PROBE — FC-CMD-STALE-WRITE (src/factContinuity/chatCommands.js)
 *
 * applyFactContinuityCommand (the canonical GM's `factContinuity.command`
 * relay handler) reads the cached campaignState, applies `!truth strike`,
 * then AWAITS propagateRetraction (entity-tier and World Journal lore writes)
 * and finally writes the whole object it read back to the setting.
 *
 * gmRelay runs `xcard.activate` UNQUEUED on the premise that "no handler
 * writes back a campaignState snapshot held across an await"
 * (src/multiplayer/gmRelay.js header; rules/reachability.md §9). This handler
 * does exactly that, so anything stored while the strike propagates is
 * reverted by its final whole-object write:
 *   - an X-Card played meanwhile — the table saw "paused", the stored flag is
 *     cleared and the narrator carries on;
 *   - the move pipeline's lock release (the move pipeline is not queued) —
 *     pendingMove: true is written back and every later move is refused with
 *     "A move is already being resolved" until a reload.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyFactContinuityCommand } from '../../../src/factContinuity/chatCommands.js';
import { recordLoreDiscovery, JOURNAL_NAMES } from '../../../src/world/worldJournal.js';
import { suppressScene } from '../../../src/context/safety.js';
import { installJournalMock } from '../../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

let installed;
beforeEach(() => {
  installed = installJournalMock();
  global.ChatMessage._reset();
});
afterEach(() => {
  installed.restore();
  game.settings._store.delete(KEY);
});

/**
 * Store a scene with one narrator truth plus this session's auto-confirmed
 * lore that states it, and make `duringLoreWrite` run while the strike's lore
 * write is in flight.
 */
async function seed(extraState, duringLoreWrite) {
  const truth = {
    id: 'tr-dock0001',
    subject: { kind: 'text', text: 'the dockmaster' },
    fact: 'Is hiding a stolen data core',
    sessionId: 'sess-1', sessionNum: 2, sceneId: 'sc-1', moveId: null,
    source: 'narrator_sidecar', asserter: 'narrator', createdAt: 1,
    retracted: false, retractedBy: null, retractedAt: null, correctedTo: null, migratedTo: null,
  };
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1',
    sceneTruths: [truth], sceneState: { bySubject: {}, sceneId: 'sc-1' },
    xCardActive: false, xCardPlays: 0,
    ...extraState,
  });
  await recordLoreDiscovery("The dockmaster's secret", {
    text: 'The dockmaster is hiding a stolen data core', confirmed: true, narratorAsserted: true, sessionId: 'sess-1',
  }, game.settings.get(MODULE_ID, 'campaignState'));
  const page = installed.journals.get(JOURNAL_NAMES.lore).pages.contents[0];
  const originalSetFlag = page.setFlag;
  page.setFlag = async (...args) => {
    await duringLoreWrite();
    return originalSetFlag(...args);
  };
}

describe('!truth strike on the canonical GM', () => {
  it('does not revert an X-Card that lands while the strike propagates', async () => {
    // A player plays the X-Card; the relayed xcard.activate runs unqueued.
    await seed({}, () => suppressScene({}, { local: true }));

    await applyFactContinuityCommand({ text: '!truth strike tr-dock0001' }, { requesterIsGM: true });

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.sceneTruths[0].retracted).toBe(true);   // the strike landed
    expect(stored.xCardActive).toBe(true);                 // …and so must the X-Card
  });

  it('does not re-take a move lock released while the strike propagates', async () => {
    // A move is narrating (lock held) when the GM types the strike; the move
    // finishes and releases its lock (releasePendingMoveLock writes a copy).
    await seed({ pendingMove: true }, async () => {
      const latest = game.settings.get(MODULE_ID, 'campaignState');
      await game.settings.set(MODULE_ID, 'campaignState', { ...latest, pendingMove: false });
    });

    await applyFactContinuityCommand({ text: '!truth strike tr-dock0001' }, { requesterIsGM: true });

    expect(game.settings.get(MODULE_ID, 'campaignState').pendingMove).toBe(false);
  });
});
