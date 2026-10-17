/**
 * STARFORGED COMPANION
 * tests/unit/persistResolution.test.js
 *
 * Regression coverage for actor attribution. persistResolution once read
 * `campaignState.activeCharacterId` — a field nothing in the module ever
 * wrote — and silently no-op'd the entire meter-apply block in solo-GM mode
 * (same defect shape as RECAP-003). Attribution is now: the rolling player's
 * actor (speakerActorId) → the first player character. The dead
 * activeCharacterId read was removed (2026-10).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { persistResolution } from '../../src/moves/persistResolution.js';

function baseResolution(overrides = {}) {
  return {
    _id:           'res-1',
    moveId:        'gather_information',
    moveName:      'Gather Information',
    statUsed:      'wits',
    statValue:     0,
    adds:          0,
    actionDie:     3,
    actionScore:   3,
    challengeDice: [2, 7],
    outcome:       'weak_hit',
    outcomeLabel:  'Weak Hit',
    isMatch:       false,
    isProgressMove: false,
    momentumBurned: false,
    momentumBurnedFrom: 0,
    consequences: {
      momentumChange:      1,
      healthChange:        0,
      spiritChange:        0,
      supplyChange:        0,
      otherEffect:         'New insight but also complicates quest. Take +1 momentum.',
      sufferMoveTriggered: null,
    },
    ...overrides,
  };
}

function baseCampaignState(overrides = {}) {
  return {
    currentSessionId: 'sess-1',
    sessionLogs:      {},
    ...overrides,
  };
}

function pc(id, momentum = 2) {
  return makeTestActor({
    id, type: 'character', hasPlayerOwner: true,
    system: { momentum: { value: momentum, max: 10, min: -6, resetValue: 2 } },
  });
}

function lastMomentumWrite(actor) {
  return actor._updateHistory
    .map(h => h['system.momentum.value'])
    .filter(v => v !== undefined)
    .at(-1);
}

beforeEach(() => {
  game.actors._reset();
  game.user.character = null;
  game.settings._store.clear();
});

describe('persistResolution — actor attribution', () => {
  it('applies meter changes to the first player character when no speaker resolved', async () => {
    const actor = pc('pc-1');
    game.actors._set('pc-1', actor);

    await persistResolution(baseResolution(), baseCampaignState());

    // momentum +1 applied (the weak-hit "Take +1 momentum" finally lands)
    expect(lastMomentumWrite(actor)).toBe(3);
  });

  it('applies meter changes in solo-GM mode where no character is player-owned', async () => {
    // RECAP-003 conditions: hasPlayerOwner is false on every character
    // because there are no non-GM users. The pre-fix path returned null
    // and silently skipped persistence.
    const actor = makeTestActor({
      id:   'pc-solo',
      name: 'Solo Mae',
      type: 'character',
      hasPlayerOwner: false,
      system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 } },
    });
    game.actors._set('pc-solo', actor);

    await persistResolution(baseResolution(), baseCampaignState());

    expect(lastMomentumWrite(actor)).toBe(3);
  });

  it('ignores a stale campaignState.activeCharacterId (never written; removed)', async () => {
    const a1 = pc('a1');
    const a2 = pc('a2', 5);
    game.actors._set('a1', a1);
    game.actors._set('a2', a2);

    await persistResolution(baseResolution(), baseCampaignState({ activeCharacterId: 'a2' }));

    // No speaker → first PC, regardless of the vestigial field.
    expect(lastMomentumWrite(a1)).toBe(3);
    expect(a2._updateHistory.length).toBe(0);
  });

  it("does not fall back to this client's bound character (the GM's own PC)", async () => {
    const first = pc('first-pc');
    const gmPc  = pc('gm-bound-pc');
    game.actors._set('first-pc', first);
    game.actors._set('gm-bound-pc', gmPc);
    game.user.character = gmPc;

    await persistResolution(baseResolution(), baseCampaignState());

    expect(lastMomentumWrite(first)).toBe(3);
    expect(gmPc._updateHistory.length).toBe(0);
  });

  it('attributes meters to the speaker actor, not the first player actor (multiplayer bug)', async () => {
    // The GM's client runs persistResolution on behalf of every player. Without
    // the speaker, the +1 momentum would land on getPlayerActors()[0] — the
    // GM's own PC — instead of the rolling player's character. Threading
    // speakerActorId through fixes the "GM gains everyone's momentum" bug.
    const gmPc     = pc('gm-pc');
    const playerPc = pc('player-pc');
    game.actors._set('gm-pc', gmPc);          // first → the buggy getPlayerActors()[0] fallback
    game.actors._set('player-pc', playerPc);

    await persistResolution(baseResolution(), baseCampaignState(), 'player-pc');

    // The rolling player's PC gets the +1 momentum; the GM's PC is untouched.
    expect(gmPc._updateHistory.length).toBe(0);
    expect(lastMomentumWrite(playerPc)).toBe(3);
  });

  it('no-ops cleanly when no character exists at all', async () => {
    await expect(
      persistResolution(baseResolution(), baseCampaignState()),
    ).resolves.toBeDefined();
  });

  it('appends a session log entry regardless of actor presence', async () => {
    const out = await persistResolution(baseResolution(), baseCampaignState());
    expect(out.campaignState.sessionLogs['sess-1']).toHaveLength(1);
    expect(out.campaignState.sessionLogs['sess-1'][0].moveId).toBe('gather_information');
  });

  // ── Progress is not this module's job ───────────────────────────────────
  // The old consequences.progressTrackId / progressMarked route (vow items,
  // legacy XP, journal tracks, combat position) was never set by any resolver
  // and was deleted. Vow / legacy / combat progress are applied by the
  // pipeline (src/index.js applyReachMilestone, addLegacyTicks, the combat
  // lifecycle) — covered by milestone.test.js and flowDefectFixes.test.js.
  it('does not mark vow progress or legacy tracks itself (pipeline-owned)', async () => {
    const vowUpdate = vi.fn();
    const actor = makeTestActor({
      id: 'pc-ms', type: 'character', hasPlayerOwner: true,
      items: { contents: [{ id: 'vow-1', type: 'progress', system: { subtype: 'vow', rank: 2, current: 0 }, update: vowUpdate }] },
    });
    game.actors._set('pc-ms', actor);

    const resolution = baseResolution({
      moveId: 'reach_a_milestone',
      consequences: { ...baseResolution().consequences, momentumChange: 0, reachMilestone: true },
    });
    const out = await persistResolution(resolution, baseCampaignState(), 'pc-ms');

    expect(vowUpdate).not.toHaveBeenCalled();
    expect(out.campaignState.legacyTracks).toBeUndefined();
  });
});
