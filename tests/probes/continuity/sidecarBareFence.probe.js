/**
 * PROBE — SIDECAR-BARE-FENCE (src/factContinuity/sidecarParser.js)
 *
 * extractSidecar only recognises a fence whose info string is literally
 * "json" right after the backticks (FENCE_PATTERN /```json…```/ and the
 * truncation fallback /```json\b/). A response whose block is fenced as a bare
 * ``` (or "``` json") is treated as having NO sidecar: the turn's truths,
 * state changes and scene frame are dropped, AND the raw JSON — fences and
 * all — is returned as prose, so it is posted on the narrator card for every
 * player and stored as the card's narrationText (recent-narration ring,
 * rolling summary, audio narration).
 *
 * Invariant (rules/narrator-memory.md #2): parsing is tolerant.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect } from 'vitest';
import { extractSidecar } from '../../../src/factContinuity/sidecarParser.js';

const json = JSON.stringify({
  newTruths: [{ subject: 'Vance', fact: 'Walks with a limp' }],
  stateChanges: [{ subject: 'Vance', attribute: 'location', value: 'the cargo bay' }],
  sceneFrame: { location: 'Bleakhold docking ring', present: ['Vance'], situation: 'Vance limps in' },
}, null, 2);

describe('extractSidecar on a block fenced without the json tag', () => {
  for (const [label, raw] of [
    ['bare ``` fence', `Vance limps into the cargo bay.\n\n\`\`\`\n${json}\n\`\`\``],
    ['"``` json" fence', `Vance limps into the cargo bay.\n\n\`\`\` json\n${json}\n\`\`\``],
  ]) {
    it(`${label}: parses the sidecar and keeps the JSON out of the posted prose`, () => {
      const { prose, sidecar } = extractSidecar(raw);
      expect.soft(sidecar?.newTruths?.[0]?.fact, 'sidecar parsed').toBe('Walks with a limp');
      expect(prose).not.toContain('"newTruths"');
    });
  }
});
