// tests/unit/sceneQueryCaptureGate.test.js
//
// `@scene` routes RUN_ON.CLAUDE, so at a table with no keyed GM it runs on the
// asking player's client (narrator-context flow, "Where each call runs").
// interrogateScene used to schedule the detection pass and the tier pass there
// with no canonical-GM gate — unlike runPostNarrationPasses and
// scheduleNarrationCapture — so the player's client attempted World Journal,
// session-log and NPC-card writes it cannot make (issue #321 U36). The capture
// was then gated to a GM's client, the answer's ledger facts reaching the GM
// through the sidecar relay.
//
// Since known-issues SCENE-ANSWER-NOT-A-CAMERA an `@scene` answer is not
// written back at all: no capture on any client, and no fact block relayed —
// the answer is the fact, and the fact is recorded already. What this file
// held as a gate it now holds as "nowhere".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/multiplayer/gmGate.js', () => ({ isCanonicalGM: vi.fn(() => false) }));
vi.mock('../../src/multiplayer/gmRelay.js', () => ({
  requestGmAction: vi.fn(async () => ({ ok: true })),
  hasActiveGM:     vi.fn(() => true),
}));
vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/factContinuity/consistencyCheck.js', () => ({ runConsistencyCheck: vi.fn(async () => {}) }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../src/entities/entityExtractor.js', async () => {
  const actual = await vi.importActual('../../src/entities/entityExtractor.js');
  return {
    ...actual,
    runCombinedDetectionPass:    vi.fn(async () => ({ worldJournal: {}, renames: [], entities: [] })),
    routeWorldJournalResults:    vi.fn(async () => {}),
    routeEntityDrafts:           vi.fn(async () => ({})),
    applyEntityRenames:          vi.fn(async () => {}),
    appendGenerativeTierUpdates: vi.fn(async () => []),
  };
});

import { interrogateScene } from '../../src/narration/narrator.js';
import { apiPost } from '../../src/api-proxy.js';
import { isCanonicalGM } from '../../src/multiplayer/gmGate.js';
import { requestGmAction } from '../../src/multiplayer/gmRelay.js';
import { runCombinedDetectionPass, appendGenerativeTierUpdates } from '../../src/entities/entityExtractor.js';
import { runConsistencyCheck } from '../../src/factContinuity/consistencyCheck.js';

const MODULE_ID = 'starforged-companion';
let restoreUser;

const answer = (sidecar) => ({
  content: [{ type: 'text', text: `Kael Dros squints at the hatch seals.\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\`` }],
  stop_reason: 'end_turn',
});

const state = () => ({
  currentSessionId: 's1', sessionNumber: 2, currentSceneId: 'sc-1', connectionIds: ['npc-kael'],
});

const passCounts = () => ({
  detection: runCombinedDetectionPass.mock.calls.length,
  tierPass:  appendGenerativeTierUpdates.mock.calls.length,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-player-key');   // the asker's own key
  global.game.messages = { contents: [] };
  game.actors._reset();
  game.actors._set('npc-kael', {
    id: 'npc-kael', name: 'Kael Dros', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-k', name: 'Kael Dros' } } },
    getFlag(mod, key) { return this.flags?.[mod]?.[key]; },
  });
  apiPost.mockResolvedValue(answer({ newTruths: [], stateChanges: [] }));
});

afterEach(() => {
  restoreUser?.();
  restoreUser = null;
  isCanonicalGM.mockReturnValue(false);
  vi.useRealTimers();
});

describe('an @scene answer is mined on no client, and relays nothing', () => {
  it('a keyed player\'s client (no keyed GM online) runs neither the detection pass nor the tier pass', async () => {
    restoreUser = asPlayer();
    const reply = await interrogateScene('What is Kael Dros doing at the hatch?', state());
    expect(reply).toContain('Kael Dros squints');
    await vi.advanceTimersByTimeAsync(3000);

    expect(passCounts()).toEqual({ detection: 0, tierPass: 0 });
  });

  it('there a fact block the reply carries anyway is relayed to no one — and is not on the card', async () => {
    restoreUser = asPlayer();
    apiPost.mockResolvedValue(answer({ newTruths: [{ subject: 'Kael Dros', fact: 'is hiding a datachip' }], stateChanges: [] }));
    const reply = await interrogateScene('What is Kael Dros doing at the hatch?', state());
    await vi.advanceTimersByTimeAsync(3000);

    expect(reply).toBe('Kael Dros squints at the hatch seals.');
    expect(requestGmAction.mock.calls.filter(([kind]) => kind === 'narrator.sidecar')).toEqual([]);
    expect(passCounts()).toEqual({ detection: 0, tierPass: 0 });
  });

  it('the canonical GM mines nothing either, and writes nothing of the block to the scene', async () => {
    isCanonicalGM.mockReturnValue(true);
    apiPost.mockResolvedValue(answer({
      newTruths: [{ subject: 'Kael Dros', fact: 'is hiding a datachip' }], stateChanges: [],
      sceneFrame: { location: 'the hatch', present: ['Kael Dros'], situation: 'Kael squints at the seals', question: 'What is he hiding?' },
    }));
    const cs = state();
    await interrogateScene('What is Kael Dros doing at the hatch?', cs);
    await vi.advanceTimersByTimeAsync(3000);

    expect(passCounts()).toEqual({ detection: 0, tierPass: 0 });
    expect(cs.sceneTruths ?? []).toEqual([]);
    expect(cs.sceneFrame ?? null).toBeNull();
    // It is still read against the ledger: the one check an answer keeps.
    expect(runConsistencyCheck).toHaveBeenCalledTimes(1);
    expect(runConsistencyCheck.mock.calls[0][0]).toBe('Kael Dros squints at the hatch seals.');
  });

  it('with fact continuity off a block is still kept off the card, and nothing is checked against a ledger nobody keeps', async () => {
    isCanonicalGM.mockReturnValue(true);
    game.settings._store.set(`${MODULE_ID}.factContinuity.enabled`, false);
    apiPost.mockResolvedValue(answer({ newTruths: [{ subject: 'Kael Dros', fact: 'is hiding a datachip' }], stateChanges: [] }));
    const reply = await interrogateScene('What is Kael Dros doing at the hatch?', state());
    await vi.advanceTimersByTimeAsync(3000);

    expect(reply).toBe('Kael Dros squints at the hatch seals.');
    expect(runConsistencyCheck).not.toHaveBeenCalled();
    expect(passCounts()).toEqual({ detection: 0, tierPass: 0 });
  });
});
