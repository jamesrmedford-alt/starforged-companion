/**
 * STARFORGED COMPANION
 * tests/unit/sidecarNoteNotProse.test.js
 *
 * Issue #389 #3, SIDECAR-NOTE-IN-THE-PROSE. The sixth live long haul's
 * session-2 opening (a17) was posted ending "Hmm — correction to the block
 * above, which should stand as written but with the first entry matching the
 * prose more exactly:". The reply was its prose, a JSON block, that sentence
 * and a second block: `extractSidecar` stripped both blocks and kept the text
 * between them as prose. The prose now ends at the first sidecar block; the
 * last block is still the sidecar.
 *
 * The reply is the run's own, from its kept replay.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractSidecar } from '../../src/factContinuity/sidecarParser.js';

const REPLAY = path.resolve(__dirname, '../../test/ci/playwright/explorations/long-haul-live-20261125-232143/replay.json');
const RUN = JSON.parse(fs.readFileSync(REPLAY, 'utf8'));
const A17 = RUN.recording.exchanges.find(x => x.step === 'a17' && /narrateSessionVignette/.test(x.kind))
  .response.content.map(c => c.text ?? '').join('');

describe('the prose ends at the first sidecar block (issue #389 #3)', () => {
  it('the sixth live run\'s a17 opening: its note to itself between two blocks is not posted', () => {
    expect(A17).toContain('Hmm — correction to the block above');
    const { prose, sidecar, parseError } = extractSidecar(A17);
    expect(parseError).toBeNull();
    expect(prose).not.toContain('Hmm');
    expect(prose).not.toContain('```');
    expect(prose.endsWith('Behind you, Tamsin\'s pen has not moved, and neither has the manifest.')).toBe(true);
    // The last block is the sidecar: its builtFrom is the corrected one.
    expect(sidecar.builtFrom.map(b => b.words)).toContain('Anyone watching would take you for a woman with no questions at all');
  });

  it('text after the only block is not prose either', () => {
    const text = 'The hatch seals behind you.\n\n```json\n{ "newTruths": [], "stateChanges": [] }\n```\n\nNote: the block above is complete.';
    expect(extractSidecar(text).prose).toBe('The hatch seals behind you.');
  });

  it('control: a reply that opens on its block keeps the prose after it', () => {
    const text = '```json\n{ "newTruths": [], "stateChanges": [] }\n```\n\nThe hatch seals behind you.';
    const { prose, sidecar } = extractSidecar(text);
    expect(sidecar).not.toBeNull();
    expect(prose.trim()).toBe('The hatch seals behind you.');
  });

  it('control: an unclosed block after the prose is still cut, and a bare one too', () => {
    expect(extractSidecar('The hatch seals behind you.\n\n```json\n{ "newTruths": [').prose).toBe('The hatch seals behind you.');
    expect(extractSidecar('The hatch seals behind you.\n{ "newTruths": [], "stateChanges": [] }').prose).toBe('The hatch seals behind you.');
  });
});
