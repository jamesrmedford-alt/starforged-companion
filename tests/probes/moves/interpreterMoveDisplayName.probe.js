/**
 * PROBE — MC-18 INTERP-MOVE-NAME-FALLBACK (eighth bug audit, moves-core)
 *
 * What the user does: types narration; the model answers with the move's
 * display name in `moveId` ("Gather Information", or "gather-information").
 *
 * What happens: the confirm dialog proposes Face Danger +wits, "Fallback —
 * API response could not be parsed." parseInterpretation looks the moveId up
 * in MOVES as-is, and an unknown key falls back to Face Danger. Issue #321 U45
 * added schemas.js toMoveId — "the MOVES key a model-named move refers to —
 * the key or its display name in any case or separator" — for exactly this,
 * and wired it into the pacing classifier only; the interpreter, the other
 * model-named move, does not use it.
 *
 * What should happen: the moveId goes through toMoveId, so "Gather
 * Information" is gather_information.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { interpretMove } from '../../../src/moves/interpreter.js';
import { apiPost } from '../../../src/api-proxy.js';
import { toMoveId } from '../../../src/schemas.js';

function replyJson(obj) {
  apiPost.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ rationale: 'r', confidence: 'high', statUsed: 'wits', ...obj }) }] });
}
const OPTS = { campaignState: {}, mischiefLevel: 'lawful', apiKey: 'test-key' };

describe('the interpreter reads a move the model names by its display name', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('control: toMoveId maps the display name to the key', () => {
    expect(toMoveId('Gather Information')).toBe('gather_information');
  });

  it('"Gather Information" is read as gather_information, not the Face Danger fallback', async () => {
    replyJson({ moveId: 'Gather Information', moveName: 'Gather Information' });
    const r = await interpretMove('I comb the station archive for the courier\'s name.', OPTS);
    expect(r.moveId).toBe('gather_information');
  });
});
