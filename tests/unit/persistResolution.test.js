/**
 * STARFORGED COMPANION
 * tests/unit/persistResolution.test.js
 *
 * Regression coverage for the active-character fallback. The pre-fix
 * persistResolution read `campaignState.activeCharacterId` — a field
 * nothing in the module ever wrote — and silently no-op'd the entire
 * meter-apply block in solo-GM mode. Same defect shape as RECAP-003.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { persistResolution } from '../../src/moves/persistResolution.js';

const MODULE_ID = 'starforged-companion';

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
      progressMarked:      0,
      progressTrackId:     null,
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

beforeEach(() => {
  game.actors._reset();
  game.user.character = null;
  game.settings._store.clear();
});

describe('persistResolution — active character fallback', () => {
  it('applies meter changes when activeCharacterId is missing but a player-owned character exists', async () => {
    const actor = makeTestActor({
      id:   'pc-1',
      name: 'Mae',
      type: 'character',
      hasPlayerOwner: true,
      system: {
        momentum: { value: 2, max: 10, min: -6, resetValue: 2 },
      },
    });
    game.actors._set('pc-1', actor);

    await persistResolution(baseResolution(), baseCampaignState());

    // momentum +1 applied (the weak-hit "Take +1 momentum" finally lands)
    const momentumWrites = actor._updateHistory
      .map(h => h['system.momentum.value'])
      .filter(v => v !== undefined);
    expect(momentumWrites.at(-1)).toBe(3);
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

    const momentumWrites = actor._updateHistory
      .map(h => h['system.momentum.value'])
      .filter(v => v !== undefined);
    expect(momentumWrites.at(-1)).toBe(3);
  });

  it('prefers an explicit activeCharacterId when set', async () => {
    const a1 = makeTestActor({
      id: 'a1', type: 'character', hasPlayerOwner: true,
      system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 } },
    });
    const a2 = makeTestActor({
      id: 'a2', type: 'character', hasPlayerOwner: true,
      system: { momentum: { value: 5, max: 10, min: -6, resetValue: 2 } },
    });
    game.actors._set('a1', a1);
    game.actors._set('a2', a2);

    await persistResolution(baseResolution(), baseCampaignState({ activeCharacterId: 'a2' }));

    // Only the explicit a2 should have received the update.
    expect(a1._updateHistory.length).toBe(0);
    expect(a2._updateHistory.length).toBeGreaterThan(0);
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
});
