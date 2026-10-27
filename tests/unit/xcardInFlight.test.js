/**
 * STARFORGED COMPANION
 * tests/unit/xcardInFlight.test.js
 *
 * Issue #300 F13 — an X-Card played while a narration is being generated.
 * Every narrator entry point checked the X-Card on entry only; the reply
 * arrived seconds later and was posted (and its side-data written to the scene
 * ledger) although the table had played the card to stop it. Here the stubbed
 * Claude call plays the X-Card (the relay's write to the stored setting)
 * before it answers: no entry point may post the reply or apply its sidecar.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
// The consistency check is its own Claude call and a GM card; the usage page a journal write.
vi.mock('../../src/factContinuity/consistencyCheck.js', () => ({
  runConsistencyCheck: vi.fn(async () => undefined),
}));
vi.mock('../../src/pacing/telemetry.js', async () => ({
  ...(await vi.importActual('../../src/pacing/telemetry.js')),
  logNarratorUsage: vi.fn(async () => undefined),
}));

import { apiPost } from '../../src/api-proxy.js';
import {
  narrateResolution,
  interrogateScene,
  narratePacedInput,
  narrateOracleFollowup,
  narrateSessionVignette,
  narrateClockAdvancement,
  narrateVowSwearing,
  narrateIncitingIncident,
} from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';

const REPLY = {
  content: [{ type: 'text', text: 'The reactor screams as the hull splits.\n\n```json\n'
    + '{"newTruths":[{"subject":"scene","fact":"The hull is breached"}],"stateChanges":[]}\n```' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 10 },
};

const stored = () => game.settings._store.get(`${MODULE_ID}.campaignState`);

/** The Claude call: the X-Card is relayed to the GM while it runs, then the reply arrives. */
function xCardDuringCall() {
  apiPost.mockImplementation(async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...stored(), xCardActive: true });
    return REPLY;
  });
}

/** Cards posted that carry narration prose. */
const narrationCards = () => ChatMessage._created.filter(m => {
  const f = m.flags?.[MODULE_ID] ?? {};
  return f.narratorCard || f.sceneCard || f.pacedNarrativeCard || f.oracleNarrationCard;
});

const resolution = {
  _id: 'res-f13', moveId: 'face_danger', moveName: 'Face Danger',
  outcome: 'weak_hit', outcomeLabel: 'Weak Hit', consequences: {},
};

function snapshot() {
  return {
    xCardActive: false, currentSessionId: 's1', currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
  };
}

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
  game.settings._store.set(`${MODULE_ID}.campaignState`, snapshot());
  apiPost.mockReset();
});

describe('an X-Card played while the narration is generated discards the reply', () => {
  it('move narration: the paused notice, no narrator card, no sidecar facts', async () => {
    xCardDuringCall();
    expect(await narrateResolution(resolution, snapshot())).toBeNull();
    expect(narrationCards()).toEqual([]);
    expect(ChatMessage._created.at(-1).flags[MODULE_ID].narrationPaused).toBe(true);
    await new Promise(r => setTimeout(r, 0));
    expect(stored().sceneTruths).toEqual([]);
  });

  it('@scene: the paused fallback card, no answer', async () => {
    xCardDuringCall();
    expect(await interrogateScene('What do I see?', snapshot())).toBeNull();
    expect(narrationCards()).toEqual([]);
    expect(ChatMessage._created.at(-1).content).toContain('X-Card is active');
  });

  it('paced narration, the oracle follow-up, vignettes, clocks, vow scenes and the inciting incident return nothing', async () => {
    xCardDuringCall();
    const results = [
      await narratePacedInput('I look around the hangar.', snapshot()),
      await narrateOracleFollowup({ kind: 'oracle_yes_no', oracleName: 'Ask the Oracle', rolledLine: 'd100 = 12 → Yes', campaignState: snapshot() }),
      await narrateSessionVignette({ userMessage: 'The crew in the galley.', campaignState: snapshot() }),
      await narrateClockAdvancement({ clock: { name: 'Reactor', type: 'scene', filled: 2, segments: 4, triggered: false }, campaignState: snapshot() }),
      await narrateVowSwearing({ vow: { name: 'Seal the breach' }, campaignState: snapshot() }),
      await narrateIncitingIncident({ userMessage: 'Open the campaign.', campaignState: snapshot() }),
    ];
    expect(results).toEqual([null, null, null, null, null, null]);
    expect(narrationCards()).toEqual([]);
  });

  it('without an X-Card the same reply is narrated', async () => {
    apiPost.mockResolvedValue(REPLY);
    expect(await narrateResolution(resolution, snapshot())).toBe('The reactor screams as the hull splits.');
    expect(narrationCards()).toHaveLength(1);
  });
});
