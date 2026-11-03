/**
 * A typed move rolls a stat it lists — under the Lawful and Balanced dials
 * (issue #325 W19).
 *
 * parseInterpretation checked the model's stat only against every stat and
 * meter name the module knows; only a move already chosen (expectedMoveSlug,
 * issue #321 U04) was held to the move's list. The model answered Gather
 * Information +iron or Check Your Gear +wits, the confirm dialog showed the
 * stat as text (no picker), and the pipeline read that stat's sheet value.
 * Now a stat the move does not list gives way to its first. The Chaotic
 * dial's Trickster framing deliberately asks for unusual stats ("Consider
 * unusual stats", mischief.js): the maintainer kept that departure from the
 * move text (2026-11-03), so under Chaotic the unlisted stat stands.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { interpretMove } from '../../src/moves/interpreter.js';
import { apiPost } from '../../src/api-proxy.js';

function replyJson(obj) {
  apiPost.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ rationale: 'r', confidence: 'high', mischiefApplied: false, ...obj }) }] });
}
const opts = (mischiefLevel) => ({ campaignState: {}, mischiefLevel, apiKey: 'test-key' });

describe.each(['lawful', 'balanced'])('the %s dial holds a typed move to its listed stats', (dial) => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('control: Gather Information +wits comes back as read', async () => {
    replyJson({ moveId: 'gather_information', statUsed: 'wits' });
    expect(await interpretMove('I comb the station archive.', opts(dial))).toMatchObject({ moveId: 'gather_information', statUsed: 'wits' });
  });

  it('Gather Information named with +iron rolls +wits (the only stat it lists)', async () => {
    replyJson({ moveId: 'gather_information', statUsed: 'iron' });
    expect((await interpretMove('I comb the station archive.', opts(dial))).statUsed).toBe('wits');
  });

  it('Check Your Gear named with +wits rolls +supply', async () => {
    replyJson({ moveId: 'check_your_gear', statUsed: 'wits' });
    expect((await interpretMove('Do I still have the plasma cutter?', opts(dial))).statUsed).toBe('supply');
  });

  it('Strike named with +heart rolls a stat Strike lists', async () => {
    replyJson({ moveId: 'strike', statUsed: 'heart' });
    expect(['iron', 'edge']).toContain((await interpretMove('I drive the blade home.', opts(dial))).statUsed);
  });
});

describe('the Chaotic dial (maintainer decision: the Trickster may argue for an unusual stat)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('keeps an unlisted stat the model chose', async () => {
    replyJson({ moveId: 'gather_information', statUsed: 'iron', mischiefApplied: true });
    expect((await interpretMove('I comb the station archive.', opts('chaotic'))).statUsed).toBe('iron');
  });

  it('control: the framing asks the model for unusual stats', async () => {
    replyJson({ moveId: 'gather_information', statUsed: 'wits' });
    await interpretMove('I comb the station archive.', opts('chaotic'));
    expect(apiPost.mock.calls[0][2].messages[0].content).toMatch(/Consider unusual stats|least relevant/);
  });
});
