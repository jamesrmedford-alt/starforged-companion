/**
 * STARFORGED COMPANION
 * tests/unit/sessionVignetteCard.test.js
 *
 * Regression for F9a / F22a: the session vignette cards must strip the
 * `<npc>…</npc>` audio voice-split markup before posting to chat. The tags
 * are an audio-pipeline concern (src/audio/segments.js) and must never render
 * literally in the card. The inner NPC text is preserved verbatim.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { postGalleyVignetteCard } from '../../src/session/galleyVignette.js';
import { postEndSessionVignetteCard } from '../../src/session/endSessionVignette.js';

beforeEach(() => {
  ChatMessage._reset();
});

const WITH_TAGS =
  'Oakes leans in. <npc>Chen again, probably.</npc> She grins.';

describe('session vignette cards strip <npc> markup (F9a / F22a)', () => {
  it('galley (begin) card drops the tags but keeps the dialogue', async () => {
    await postGalleyVignetteCard({ text: WITH_TAGS, kind: 'galley' });

    const card = ChatMessage._created.at(-1);
    expect(card.content).not.toContain('<npc>');
    expect(card.content).not.toContain('npc>');
    // inner NPC text survives verbatim
    expect(card.content).toContain('Chen again, probably.');
  });

  it('end-session card drops the tags but keeps the dialogue', async () => {
    await postEndSessionVignetteCard({
      text: WITH_TAGS,
      npcName: 'Evander Sato',
    });

    const card = ChatMessage._created.at(-1);
    expect(card.content).not.toContain('<npc>');
    expect(card.content).not.toContain('npc>');
    expect(card.content).toContain('Chen again, probably.');
    // the (markup-free) NPC name still renders in the heading
    expect(card.content).toContain('Evander Sato');
  });
});
