// tests/unit/xcardLateReview.test.js
// XCARD-LATE-REVIEW: the background consistency check posted the GM-only
// ◈ Narrative Review card, and logged its telemetry line, for a narration the
// X-Card removed while the audit's Haiku call was out — quoting the removed
// prose. It now checks the stored `xCardedNarrationIds` when the reply
// returns (isNarrationXCarded, the capture's XCARD-LATE-CAPTURE rule), and
// the narrator passes the audited narration's id.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/pacing/telemetry.js', () => ({ logConsistencyDecision: vi.fn(async () => {}) }));

import { apiPost } from '../../src/api-proxy.js';
import { logConsistencyDecision } from '../../src/pacing/telemetry.js';
import { runConsistencyCheck } from '../../src/factContinuity/consistencyCheck.js';
import { readFileSync } from 'node:fs';

const MODULE_ID = 'starforged-companion';
const TRUTH = {
  id: 'tr-limp0001', subject: { kind: 'text', text: 'Vance' }, fact: 'walks with a limp',
  sessionId: 'sess-1', sceneId: 'sc-9', asserter: 'narrator', retracted: false, correctedTo: null,
};
const REPLY = { content: [{ type: 'text', text: JSON.stringify({ contradictions: [
  { subject: 'Vance', violated: 'walks with a limp', evidence: 'Vance sprints across the hangar', kind: 'truth', confidence: 'high' },
] }) }] };

function campaignState(extra = {}) {
  return { currentSessionId: 'sess-1', currentSceneId: 'sc-9', sceneTruths: [TRUTH], sceneState: { bySubject: {} }, ...extra };
}

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.factContinuity.consistencyCheck`, true);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  apiPost.mockReset();
  logConsistencyDecision.mockClear();
});

describe('XCARD-LATE-REVIEW — no review card for a narration the X-Card removed', () => {
  it('an X-Card played while the audit is out: no card, no telemetry', async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, campaignState());
    apiPost.mockImplementation(async () => {
      // The X-Card lands while the Haiku call is out.
      game.settings._store.set(`${MODULE_ID}.campaignState`, campaignState({ xCardedNarrationIds: ['nar-removed1'] }));
      return REPLY;
    });
    const out = await runConsistencyCheck('Vance sprints across the hangar.', campaignState(), { narrationId: 'nar-removed1' });
    expect(out.dispatched).toBe(false);
    expect(ChatMessage._created.length).toBe(0);
    expect(logConsistencyDecision).not.toHaveBeenCalled();
  });

  it('control: another narration removed — the card posts and the audit is logged', async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, campaignState({ xCardedNarrationIds: ['nar-other'] }));
    apiPost.mockResolvedValue(REPLY);
    // Another scene: the in-memory dedup keys on (scene, subject, fact).
    const out = await runConsistencyCheck('Vance sprints across the hangar.', campaignState({ currentSceneId: 'sc-10' }), { narrationId: 'nar-kept' });
    expect(out.dispatched).toBe(true);
    expect(ChatMessage._created.length).toBe(1);
    expect(logConsistencyDecision).toHaveBeenCalledTimes(1);
  });

  it('the narrator passes the audited narration\'s id to the check', () => {
    const src = readFileSync('src/narration/narrator.js', 'utf8');
    const call = src.slice(src.indexOf('runConsistencyCheck(prose'), src.indexOf('runConsistencyCheck(prose') + 400);
    expect(call).toMatch(/narrationId:\s+typeof ctx\.narrationId === 'string'/);
  });
});
