/**
 * PROBE — MC-04 INTERP-STAT-OFF-LIST (eighth bug audit, moves-core)
 *
 * What the user does: types narration with the Mischief dial on Chaotic (or
 * Balanced) — e.g. "I comb the station archive for the courier's name." The
 * chaotic framing tells the model to "Consider unusual stats", and its
 * fallback heuristic is "Find the stat that seems least relevant to what the
 * player described and make a compelling case for it" (mischief.js).
 *
 * What happens: the model answers Gather Information +iron (or Check Your
 * Gear +wits, Set a Course +edge …) and the move is rolled with that stat.
 * interpreter.js parseInterpretation checks the stat only against every stat
 * and meter name the module knows (STATS + supply/integrity/health/spirit/
 * companion_health), not against the stats the MOVE lists; only a move
 * already chosen (expectedMoveSlug, issue #321 U04) is held to its list. The
 * confirm dialog shows the stat as text — it has no stat picker — and the
 * pipeline reads the sheet value of whatever stat was named.
 *
 * What should happen: a stat the move does not list gives way to one it does
 * (its first), as the expected-move path already does — Gather Information is
 * always +wits, Check Your Gear and Set a Course +supply.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { interpretMove } from '../../../src/moves/interpreter.js';
import { apiPost } from '../../../src/api-proxy.js';

function replyJson(obj) {
  apiPost.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ rationale: 'r', confidence: 'high', mischiefApplied: true, ...obj }) }] });
}
const OPTS = { campaignState: {}, mischiefLevel: 'chaotic', apiKey: 'test-key' };

describe('a typed move rolls a stat the move lists', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('control: Gather Information +wits comes back as read', async () => {
    replyJson({ moveId: 'gather_information', statUsed: 'wits' });
    const r = await interpretMove('I comb the station archive for the courier\'s name.', OPTS);
    expect(r).toMatchObject({ moveId: 'gather_information', statUsed: 'wits' });
  });

  it('control: the chaotic framing asks the model for unusual stats', async () => {
    replyJson({ moveId: 'gather_information', statUsed: 'wits' });
    await interpretMove('I comb the station archive for the courier\'s name.', OPTS);
    expect(apiPost.mock.calls[0][2].messages[0].content).toMatch(/Consider unusual stats|least relevant/);
  });

  it('Gather Information named with +iron rolls +wits (the only stat it lists)', async () => {
    replyJson({ moveId: 'gather_information', statUsed: 'iron' });
    const r = await interpretMove('I comb the station archive for the courier\'s name.', OPTS);
    expect(r.statUsed).toBe('wits');
  });

  it('Check Your Gear named with +wits rolls +supply', async () => {
    replyJson({ moveId: 'check_your_gear', statUsed: 'wits' });
    const r = await interpretMove('Do I still have the plasma cutter in my kit?', OPTS);
    expect(r.statUsed).toBe('supply');
  });

  it('Strike named with +heart rolls a stat Strike lists (+iron or +edge)', async () => {
    replyJson({ moveId: 'strike', statUsed: 'heart' });
    const r = await interpretMove('I rally my courage and drive the blade home.', OPTS);
    expect(['iron', 'edge']).toContain(r.statUsed);
  });
});
