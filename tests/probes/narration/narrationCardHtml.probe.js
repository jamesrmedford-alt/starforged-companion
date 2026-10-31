// tests/probes/narration/narrationCardHtml.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NARR-CARD-UNESCAPED: postNarrationCard / postPacedNarrativeCard /
// postSceneCard (src/narration/narrator.js) put the model's prose into the
// card HTML through stripMarkup (src/audio/segments.js), which only removes
// <npc> tags — nothing is escaped. Sci-fi prose routinely writes comm and
// system text in angle brackets ("<signal lost>", "<ACCESS DENIED>"): the
// browser parses each as an unknown element and the words vanish from the
// card (narrationText keeps them, so the narrator remembers text the table
// never saw). The oracle follow-up and vow-scene cards already escape.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { postNarrationCard } from '../../../src/narration/narrator.js';

beforeEach(() => { ChatMessage._reset(); });

describe('narration card HTML keeps the prose the narrator wrote', () => {
  it('angle-bracketed comm text is escaped, not parsed as markup', async () => {
    const prose = 'The comm crackles once: <signal lost>. Then only the hum of the reactor.';
    await postNarrationCard(prose, { moveId: 'face_danger', outcome: 'weak_hit', _id: 'r1' }, { currentSessionId: 's1' });
    const content = ChatMessage._created.at(-1).content;
    expect(content).toContain('&lt;signal lost&gt;');
    expect(content).not.toContain('<signal lost>');
  });
});
