// tests/probes/narration/sceneQueryCaptureGate.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// SCENE-CAPTURE-UNGATED: `@scene` routes RUN_ON.CLAUDE, so at a table with no
// keyed GM it runs on the asking player's client (decisions / narrator-context
// flow §1). interrogateScene (src/narration/narrator.js) then schedules
// schedulePacedDetection + schedulePacedTierUpdate with no isCanonicalGM gate
// — unlike runPostNarrationPasses and scheduleNarrationCapture, which both
// gate. On the player's client the detection pass (a Haiku call on the
// player's key) writes World Journal pages / session-log beats into
// campaignState and the tier pass updates NPC Actors — world writes a player
// cannot make (permission errors; the lore and NPC developments are lost).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/multiplayer/gmGate.js', () => ({ isCanonicalGM: vi.fn(() => false) }));
vi.mock('../../../src/multiplayer/gmRelay.js', () => ({
  requestGmAction: vi.fn(async () => ({ ok: true })),
  hasActiveGM:     vi.fn(() => true),
}));
vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/factContinuity/consistencyCheck.js', () => ({ runConsistencyCheck: vi.fn(async () => {}) }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../../src/entities/entityExtractor.js', async () => {
  const actual = await vi.importActual('../../../src/entities/entityExtractor.js');
  return {
    ...actual,
    runCombinedDetectionPass:    vi.fn(async () => ({ worldJournal: {}, renames: [], entities: [] })),
    routeWorldJournalResults:    vi.fn(async () => {}),
    routeEntityDrafts:           vi.fn(async () => ({})),
    applyEntityRenames:          vi.fn(async () => {}),
    appendGenerativeTierUpdates: vi.fn(async () => []),
  };
});

import { interrogateScene } from '../../../src/narration/narrator.js';
import { apiPost } from '../../../src/api-proxy.js';
import { runCombinedDetectionPass, appendGenerativeTierUpdates } from '../../../src/entities/entityExtractor.js';

const MODULE_ID = 'starforged-companion';
let restoreUser;

beforeEach(() => {
  vi.useFakeTimers();
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-player-key');   // the player's own key
  global.game.messages = { contents: [] };
  game.actors._reset();
  game.actors._set('npc-kael', {
    id: 'npc-kael', name: 'Kael Dros', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-k', name: 'Kael Dros' } } },
    getFlag(mod, key) { return this.flags?.[mod]?.[key]; },
  });
  apiPost.mockResolvedValue({
    content: [{ type: 'text', text: 'Kael Dros squints at the hatch seals.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' }],
    stop_reason: 'end_turn',
  });
  restoreUser = asPlayer();      // a keyed player's client — no keyed GM is online
});

afterEach(() => {
  restoreUser?.();
  vi.useRealTimers();
});

describe('@scene narrated on a player\'s client runs no world-writing capture there', () => {
  it('neither the detection pass nor the tier pass runs on the non-canonical client', async () => {
    const answer = await interrogateScene('What is Kael Dros doing at the hatch?', {
      currentSessionId: 's1', sessionNumber: 2, currentSceneId: 'sc-1', connectionIds: ['npc-kael'],
    });
    expect(answer).toContain('Kael Dros squints');
    await vi.advanceTimersByTimeAsync(3000);

    expect({
      detection: runCombinedDetectionPass.mock.calls.length,
      tierPass:  appendGenerativeTierUpdates.mock.calls.length,
    }).toEqual({ detection: 0, tierPass: 0 });
  });
});
