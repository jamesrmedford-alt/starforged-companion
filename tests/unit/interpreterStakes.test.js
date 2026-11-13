/**
 * STARFORGED COMPANION
 * tests/unit/interpreterStakes.test.js
 *
 * Issue #353 R1 — the interpreter states what a hit gets and what a miss
 * costs, from the scene, before the roll. Its `stakes` reach the
 * interpretation bounded (stakes.js normaliseStakes) and with their price
 * source fixed (`priceStated`), for a move that rolls a stat only — a
 * progress move or a move with no roll has none. The rest of the R1 chain is
 * statedStakes.test.js.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { interpretMove } from '../../src/moves/interpreter.js';
import { apiPost } from '../../src/api-proxy.js';

afterEach(() => vi.restoreAllMocks());

function reply(obj) {
  apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
}

const OPTS = { campaignState: {}, mischiefLevel: 'serious', apiKey: 'sk-ant-test' };
const STAKES = { hit: 'You pull the route.', miss: 'The core shocks you.', missSuffer: { move: 'endure_harm', amount: 1 } };

describe('issue #353 R1 — the interpreter\'s stakes', () => {
  it('the prompt asks for them, with the suffer moves a miss may name', async () => {
    reply({ moveId: 'gather_information', statUsed: 'wits', rationale: 'r', stakes: STAKES });
    await interpretMove('I pull the logs.', OPTS);
    const system = apiPost.mock.calls[0][2].system[0].text;
    expect(system).toContain('"stakes": {');
    expect(system).toContain('make the most obvious negative outcome happen');
    for (const move of ['endure_harm', 'endure_stress', 'lose_momentum', 'sacrifice_resources', 'withstand_damage', 'companion_takes_a_hit']) {
      expect(system).toContain(`"${move}"`);
    }
  });

  it('a rolled move keeps them, its price source fixed', async () => {
    reply({ moveId: 'gather_information', statUsed: 'wits', rationale: 'r', stakes: STAKES });
    const interp = await interpretMove('I pull the logs.', OPTS);
    expect(interp.stakes).toEqual({ ...STAKES, priceStated: true });
  });

  it('a progress move, or a move with no roll, has none', async () => {
    reply({ moveId: 'fulfill_your_vow', statUsed: null, rationale: 'r', stakes: { hit: 'Done.', miss: 'Not yet.' } });
    expect((await interpretMove('I keep my word.', OPTS)).stakes).toBeNull();
    reply({ moveId: 'reach_a_milestone', statUsed: null, rationale: 'r', stakes: { hit: 'Done.' } });
    expect((await interpretMove('A step closer.', OPTS)).stakes).toBeNull();
  });

  it('none given, or unusable, is none; an unparseable reply\'s fallback has none', async () => {
    reply({ moveId: 'face_danger', statUsed: 'edge', rationale: 'r' });
    expect((await interpretMove('I run.', OPTS)).stakes).toBeNull();
    reply({ moveId: 'face_danger', statUsed: 'edge', rationale: 'r', stakes: 'high' });
    expect((await interpretMove('I run.', OPTS)).stakes).toBeNull();
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] });
    expect((await interpretMove('I run.', OPTS)).stakes).toBeNull();
  });
});
