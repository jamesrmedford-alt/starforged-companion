/**
 * STARFORGED COMPANION
 * tests/unit/factCommandStaleWrite.test.js
 *
 * `!truth` / `!state` on the canonical GM write only what they changed, onto
 * the store as it is then (issue #321 U06b).
 *
 * applyFactContinuityCommand (the canonical GM's `factContinuity.command`
 * relay handler) applies `!truth strike`, then AWAITS propagateRetraction
 * (entity-tier and World Journal lore writes). It used to write the whole
 * object it read before that await back to the setting, while gmRelay runs
 * `xcard.activate` UNQUEUED on the premise that no handler writes back a
 * snapshot held across an await (rules/reachability.md §9). So an X-Card
 * played meanwhile was cleared, and a move lock released meanwhile (the move
 * pipeline is not queued) was written back — every later move refused until
 * a reload. The command now works on a copy and persists only the ledger
 * field it changed, merged onto the latest store (persistSceneLedgerFields),
 * plus a Strike's regen mark on the stored rolling summary.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { recordLoreDiscovery, JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { suppressScene } from '../../src/context/safety.js';
import { persistSceneLedgerFields } from '../../src/factContinuity/sceneLifecycle.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

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

const truth = (id, text, fact) => ({
  id,
  subject: { kind: 'text', text },
  fact,
  sessionId: 'sess-1', sessionNum: 2, sceneId: 'sc-1', moveId: null,
  source: 'narrator_sidecar', asserter: 'narrator', createdAt: 1,
  retracted: false, retractedBy: null, retractedAt: null, correctedTo: null, migratedTo: null,
});

/**
 * Store a scene with one narrator truth plus this session's auto-confirmed
 * lore that states it, and make `duringLoreWrite` run while the strike's lore
 * write is in flight.
 */
async function seed(extraState, duringLoreWrite) {
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1',
    sceneTruths: [truth('tr-dock0001', 'the dockmaster', 'Is hiding a stolen data core')],
    sceneState: { bySubject: {}, sceneId: 'sc-1' },
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

/** Another writer stores a fresh copy with `changes` applied (as every relay handler does). */
async function storeMeanwhile(changes) {
  const latest = game.settings.get(MODULE_ID, 'campaignState');
  await game.settings.set(MODULE_ID, 'campaignState', { ...latest, ...changes(latest) });
}

describe('!truth strike on the canonical GM', () => {
  it('does not revert an X-Card that lands while the strike propagates', async () => {
    // A player plays the X-Card; the relayed xcard.activate runs unqueued.
    await seed({}, () => suppressScene({}, { local: true }));

    await applyFactContinuityCommand({ text: '!truth strike tr-dock0001' }, { requesterIsGM: true });

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.sceneTruths[0].retracted).toBe(true);   // the strike landed
    expect(stored.xCardActive).toBe(true);                 // …and so did the X-Card
  });

  it('does not re-take a move lock released while the strike propagates', async () => {
    // A move is narrating (lock held) when the GM types the strike; the move
    // finishes and releases its lock (releasePendingMoveLock writes a copy).
    await seed({ pendingMove: true }, () => storeMeanwhile(() => ({ pendingMove: false })));

    await applyFactContinuityCommand({ text: '!truth strike tr-dock0001' }, { requesterIsGM: true });

    expect(game.settings.get(MODULE_ID, 'campaignState').pendingMove).toBe(false);
  });

  it("keeps a narration's truth that lands while the strike propagates", async () => {
    await seed({}, () => storeMeanwhile((latest) => ({
      sceneTruths: [...latest.sceneTruths, truth('tr-vanc0002', 'Vance', 'Carries a Covenant signet')],
    })));

    await applyFactContinuityCommand({ text: '!truth strike tr-dock0001' }, { requesterIsGM: true });

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.sceneTruths.map(t => [t.id, t.retracted])).toEqual([
      ['tr-dock0001', true],
      ['tr-vanc0002', false],
    ]);
  });

  it('marks the stored rolling summary for a regen — a summary regenerated meanwhile keeps its text', async () => {
    await seed(
      { sessionSummary: { text: 'Old summary.', coveredCount: 30, sessionId: 'sess-1', updatedAt: '2026-10-31T10:00:00.000Z' } },
      () => storeMeanwhile(() => ({
        sessionSummary: { text: 'Newer summary.', coveredCount: 31, sessionId: 'sess-1', updatedAt: '2026-10-31T10:05:00.000Z' },
      })),
    );

    await applyFactContinuityCommand({ text: '!truth strike tr-dock0001' }, { requesterIsGM: true });

    expect(game.settings.get(MODULE_ID, 'campaignState').sessionSummary)
      .toMatchObject({ text: 'Newer summary.', coveredCount: 0 });
  });

  it('writes nothing when the strike matches no truth', async () => {
    await seed({}, async () => {});
    const set = vi.spyOn(game.settings, 'set');
    try {
      const line = await applyFactContinuityCommand({ text: '!truth strike tr-nomatch' }, { requesterIsGM: true });
      expect(line).toMatch(/No matching truth/);
      expect(set.mock.calls.filter(([, key]) => key === 'campaignState')).toEqual([]);
    } finally {
      set.mockRestore();
    }
  });

  it('does not change the cached setting value before its own write', async () => {
    await seed({}, async () => {});
    const cached = game.settings.get(MODULE_ID, 'campaignState');

    await applyFactContinuityCommand({ text: '!truth strike tr-dock0001' }, { requesterIsGM: true });

    expect(cached.sceneTruths[0].retracted).toBe(false);    // the old value was not mutated in place
    expect(game.settings.get(MODULE_ID, 'campaignState').sceneTruths[0].retracted).toBe(true);
  });
});

describe('!state set on the canonical GM', () => {
  // Control: a state command has no await between its read and its write, so
  // this held before the fix too; it pins that the owned-field write still lands.
  it('writes the state ledger onto the latest store and nothing it did not change', async () => {
    game.settings._store.set(KEY, {
      currentSessionId: 'sess-1', currentSceneId: 'sc-1',
      sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
      xCardActive: true, safety: { lines: ['L'], veils: [], privateLines: [] },
    });

    await applyFactContinuityCommand({ text: '!state set scene lighting=red emergency' }, { requesterIsGM: true });

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.sceneState.bySubject.scene).toEqual([expect.objectContaining({ attribute: 'lighting', value: 'red emergency' })]);
    expect(stored.xCardActive).toBe(true);
    expect(stored.safety.lines).toEqual(['L']);
  });
});

describe('persistSceneLedgerFields — a further owned change (opts.onto)', () => {
  it('makes the change on the latest store, in the same write as the merged ledgers', async () => {
    game.settings._store.set(KEY, { currentSceneId: 'sc-1', sceneTruths: [], xCardActive: true, premise: 'old' });
    const working = { currentSceneId: 'sc-1', sceneTruths: [truth('tr-a', 'scene', 'It is raining')], xCardActive: false };

    const wrote = await persistSceneLedgerFields(working, ['sceneTruths'], 'test', {
      onto: (target) => { target.premise = 'new'; },
    });

    expect(wrote).toBe(true);
    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored).toMatchObject({ premise: 'new', xCardActive: true });
    expect(stored.sceneTruths.map(t => t.id)).toEqual(['tr-a']);
  });

  it('still writes the change when the scene changed meanwhile, but not the ledgers', async () => {
    game.settings._store.set(KEY, { currentSceneId: 'sc-2', sceneTruths: [], premise: 'old' });
    const working = { currentSceneId: 'sc-1', sceneTruths: [truth('tr-a', 'scene', 'It is raining')] };

    const wrote = await persistSceneLedgerFields(working, ['sceneTruths'], 'test', {
      onto: (target) => { target.premise = 'new'; },
    });

    expect(wrote).toBe(false);
    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored).toMatchObject({ currentSceneId: 'sc-2', sceneTruths: [], premise: 'new' });
  });

  // Control: the sidecar persist's existing behaviour (SIDECAR-LEDGER-CLOBBER), unchanged.
  it('writes nothing when the scene changed and there is no further change', async () => {
    const latest = { currentSceneId: 'sc-2', sceneTruths: [] };
    game.settings._store.set(KEY, latest);

    expect(await persistSceneLedgerFields({ currentSceneId: 'sc-1', sceneTruths: [] }, ['sceneTruths'], 'test')).toBe(false);
    expect(game.settings.get(MODULE_ID, 'campaignState')).toBe(latest);
  });
});
