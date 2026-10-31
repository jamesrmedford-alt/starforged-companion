// tests/probes/infra/segmentsUnclosedTag.probe.test.js
//
// PROBE (infra audit) — NPC-TAG-UNCLOSED-LEAKS.
//
// splitSegments / stripMarkup only recognise a complete `<npc>…</npc>` pair.
// A narration that ends mid-dialogue (max_tokens truncation) or where the model
// drops one half of a pair keeps the literal tag:
//   - stripMarkup leaves "<npc>" in the prose. On every audio-enabled client
//     onNarratorCardRendered writes that prose with textContent, so players
//     SEE "<npc>" in the card; the vignette cards escape it and show it to
//     everyone.
//   - splitSegments sends "<npc>" / "</npc>" to ElevenLabs inside a narrator
//     segment (and the clip is spoken in the narrator voice).
//
// Asserts no tag text survives either helper. FAILS today.

import { describe, it, expect } from 'vitest';
import { splitSegments, stripMarkup } from '../../../src/audio/segments.js';

const TRUNCATED = 'Vance leans in. <npc>"There is something you need to know about the';
const STRAY_CLOSE = 'Kira looks up. "We leave at dawn."</npc> The engines whine.';

describe('PROBE NPC-TAG-UNCLOSED-LEAKS — half a tag pair', () => {
  it('stripMarkup removes an unclosed opening tag', () => {
    // Actual today: 'Vance leans in. <npc>"There is something…'
    expect(stripMarkup(TRUNCATED)).not.toMatch(/<\/?npc>/i);
  });

  it('stripMarkup removes a stray closing tag', () => {
    expect(stripMarkup(STRAY_CLOSE)).not.toMatch(/<\/?npc>/i);
  });

  it('splitSegments never sends tag text to the TTS engine', () => {
    const texts = [...splitSegments(TRUNCATED), ...splitSegments(STRAY_CLOSE)].map(s => s.text);
    expect(texts.join(' ')).not.toMatch(/<\/?npc>/i);
  });
});
