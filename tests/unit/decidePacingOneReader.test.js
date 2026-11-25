/**
 * STARFORGED COMPANION
 * tests/unit/decidePacingOneReader.test.js
 *
 * decidePacing after the switch (issue #384, slice 2 — decisions.md →
 * "Overhauls 1 and 4"): the master switch and `!roll` as before, then one
 * call — the line reader's — read against the whole situation and routed by
 * code (pacing/readAndRoute.js), the move contracts' gate as its row 2, the
 * density window and the telemetry as before. Its return keeps today's shape
 * and carries the reading: a line routed to a roll is not read again.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/pacing/telemetry.js', () => ({ logPacingDecision: vi.fn(async () => {}) }));

import { apiPost } from '../../src/api-proxy.js';
import { logPacingDecision } from '../../src/pacing/telemetry.js';
import { decidePacing, resetRecentDensity, getRecentMoveDensity, recordRecentDecision } from '../../src/pacing/router.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const reply = (body) => ({ content: [{ type: 'text', text: JSON.stringify(body) }], stop_reason: 'end_turn', usage: {} });
const reading = (over = {}) => reply({ move: null, category: 'social', confidence: 'high', reason: 'Talk.', ...over });
const isReader = (call) => /^You are the line reader\b/.test(call?.[2]?.system?.[0]?.text ?? '');

let savedFind;
let state;
function world({ pacing = {} } = {}) {
  const pc = makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel', type: 'character', system: { health: { value: 5 }, spirit: { value: 5 }, supply: { value: 5 } }, items: { contents: [] } });
  game.actors._set(pc.id, pc);
  invalidateActorCache(pc.id);
  state = { currentSessionId: 's1', pacing: { enabled: true, forceNextAsMove: false, ...pacing } };
  return { playerText: 'I ask the dockhand about the cutter.', campaignState: state, character: { name: 'Mira Kestrel', actorId: pc.id }, apiKey: 'k', mischiefLevel: 'serious' };
}

beforeEach(() => {
  vi.clearAllMocks();
  game.actors._reset();
  resetRecentDensity();
  savedFind = game.journal.find;
  game.journal.find = () => null;
});
afterEach(() => { game.journal.find = savedFind; });

describe('decidePacing reads a line once, with the line reader', () => {
  it('a line with no move: narrated, nothing offered, the reading carried, the decision recorded and logged', async () => {
    apiPost.mockResolvedValueOnce(reading());
    const d = await decidePacing(world());
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(isReader(apiPost.mock.calls[0])).toBe(true);
    expect(d).toMatchObject({ runMove: false, decision: 'NARRATIVE', suggestedMove: null, reading: { moveId: null, failed: null } });
    expect(getRecentMoveDensity(5)).toEqual({ count: 0, window: 5 });
    expect(logPacingDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: 'NARRATIVE', fallback: false }));
  });

  it('a move asked for is rolled at any dial, its reading carried for readMove (no second call there)', async () => {
    apiPost.mockResolvedValueOnce(reading({ move: 'gather_information', asked: true, risk: 'plain', category: 'investigation', stat: 'wits',
      stakes: { hit: 'You learn who flies her.', miss: 'Word gets back to the raiders.' } }));
    const d = await decidePacing(world());
    expect(d).toMatchObject({ runMove: true, decision: 'MOVE', suggestedMove: null, moveId: 'gather_information', route: { route: 'roll' } });
    expect(d.reading.interpretation).toMatchObject({ moveId: 'gather_information', statUsed: 'wits' });
    expect(getRecentMoveDensity(5).count).toBe(1);
  });

  it('a move with no roll is offered on the card, never rolled', async () => {
    apiPost.mockResolvedValueOnce(reading({ move: 'ask_the_oracle' }));
    expect(await decidePacing(world())).toMatchObject({ runMove: false, decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'ask_the_oracle' });
  });

  it('a dense run of rolls offers an unasked roll; a round is told no density and adds none', async () => {
    for (let i = 0; i < 3; i += 1) recordRecentDecision({ decision: 'MOVE', sceneTag: 's1', window: 5 });
    const plain = { move: 'gather_information', risk: 'high', category: 'investigation', stat: 'wits' };
    apiPost.mockResolvedValueOnce(reading(plain));
    expect((await decidePacing(world())).route).toMatchObject({ route: 'offer', why: expect.stringMatching(/a dense run of rolls/) });
    apiPost.mockResolvedValueOnce(reading(plain));
    const before = getRecentMoveDensity(5).count;
    expect(await decidePacing({ ...world(), round: [] })).toMatchObject({ runMove: true, decision: 'MOVE' });
    expect(getRecentMoveDensity(5).count, 'a round adds nothing to the window').toBe(before);
  });

  it('a move the contracts\' gate refuses is narrated and told why; the move its refusal offers is the card\'s', async () => {
    // A Strike with no fight open (overhaul 4, D6): refused, with Enter the Fray offered in its place.
    apiPost.mockResolvedValueOnce(reading({ move: 'strike', asked: true, risk: 'high', category: 'combat', stat: 'iron' }));
    const d = await decidePacing(world());
    expect(d.runMove).toBe(false);
    expect(d.refused).toMatchObject({ moveId: 'strike' });
    if (d.refused.offer) expect(d).toMatchObject({ decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: d.refused.offer });
    else expect(d).toMatchObject({ decision: 'NARRATIVE', suggestedMove: null });
  });

  it('a reading that failed keeps the move pipeline running: a MOVE with no reading to carry, read again under the lock', async () => {
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text: 'I would call this a Compel.' }], stop_reason: 'end_turn', usage: {} });
    const d = await decidePacing(world());
    expect(d).toMatchObject({ runMove: true, decision: 'MOVE', fallback: true, reading: { failed: 'the reply could not be read' } });
    expect(logPacingDecision).toHaveBeenCalledWith(expect.objectContaining({ fallback: true }));
  });

  it('pacing off and `!roll` decide without a reading', async () => {
    await game.settings.set(MODULE_ID, 'pacing.enabled', false);
    try {
      expect(await decidePacing(world())).toMatchObject({ runMove: true, pacingDisabled: true });
    } finally {
      await game.settings.set(MODULE_ID, 'pacing.enabled', true);
    }
    const forced = world({ pacing: { forceNextAsMove: true } });
    expect(await decidePacing(forced)).toMatchObject({ runMove: true, forced: true });
    expect(apiPost).not.toHaveBeenCalled();
  });
});
