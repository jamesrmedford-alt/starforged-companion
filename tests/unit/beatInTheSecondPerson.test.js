/**
 * STARFORGED COMPANION
 * tests/unit/beatInTheSecondPerson.test.js
 *
 * BEAT-IN-THE-THIRD-PERSON, the seventh live round (2026-11-26;
 * explorations/long-haul-live-20261126-030646/): three beats of play told the
 * character by name under a second-person PERSPECTIVE — a11 "Mira turns the
 * brass star-compass over in her palm", a69 "Mira's hand lingers on the chit",
 * a72 "Mira's own entries from the stall". The certain [person] check held
 * set-pieces alone (issue #389 #4); it now holds every beat of play told in
 * the second person, and a draft that breaks it is asked again.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { obligationsFor, formatObligationsBlock } from '../../src/moves/contracts/obligations.js';
import { certainViolations, narrateKeepingObligations } from '../../src/moves/contracts/checks.js';
import { extractSidecar } from '../../src/factContinuity/sidecarParser.js';

const ROUND_7 = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  '../../test/ci/playwright/explorations/long-haul-live-20261126-030646/replay.json'), 'utf8'));
const narrationAt = (step) => ROUND_7.recording.exchanges.find(x => x.step === step && /narratePacedInput$|narrateResolution$/.test(x.kind))
  .response.content.map(c => c.text ?? '').join('');
const PERSON = { names: ['Mira Kestrel', 'Mira'] };

describe('NOT SO [person] on a beat of play told in the second person', () => {
  it('a paced line and a typed move are told it, by the character\'s names', () => {
    for (const mode of ['paced', 'move']) {
      const lines = obligationsFor({ mode, resolution: mode === 'move' ? { moveId: 'gather_information', outcome: 'weak_hit' } : null, person: PERSON });
      expect(lines.find(o => o.kind === 'person'), mode).toMatchObject({ list: 'NOT SO', names: ['Mira Kestrel', 'Mira'] });
      expect(formatObligationsBlock(lines), mode).toContain('- [person] The player\'s character is "you", for the whole narration: never "Mira Kestrel" or "Mira" outside quoted speech');
    }
  });
  it('none in the third person (no names given)', () => {
    expect(obligationsFor({ mode: 'paced' }).map(o => o.kind)).not.toContain('person');
    expect(obligationsFor({ mode: 'move', resolution: { moveId: 'strike', outcome: 'miss' } }).map(o => o.kind)).not.toContain('person');
  });
});

describe('the seventh round\'s three beats, held to it', () => {
  const lines = obligationsFor({ mode: 'paced', person: PERSON });
  const told = (step) => certainViolations(extractSidecar(narrationAt(step)).prose, lines).filter(v => v.tag === 'person').map(v => v.quote);

  it('a11, a69, a72 — the character by name', () => {
    expect(told('a11')[0]).toContain('Mira turns the brass star-compass');
    expect(told('a69')[0]).toContain('Mira\'s hand lingers on the chit');
    expect(told('a72')[0]).toContain('Mira\'s own entries');
  });
  it('controls: beats told "you" (a59, a60), and the name in a speaker\'s mouth', () => {
    expect(told('a59')).toEqual([]);
    expect(told('a60')).toEqual([]);
    expect(certainViolations('"Mira," Tamsin says, "sit down." You sit.', lines)).toEqual([]);
  });
  it('a draft that breaks it is asked again, and the second is held to it', async () => {
    const call = vi.fn(async (addendum) => (addendum ? 'You turn the brass star-compass over in your palm.' : narrationAt('a11')));
    const kept = await narrateKeepingObligations(call, lines, { judge: false });
    expect(kept).toMatchObject({ reasked: true, stillBroken: [] });
    expect(call.mock.calls[1][0]).toContain('- [person] The player\'s character is "you"');
  });
});
