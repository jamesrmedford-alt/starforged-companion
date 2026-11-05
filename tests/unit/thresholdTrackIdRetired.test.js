/**
 * Issue #337 Y44 THRESHOLD-TRACK-ID-DEAD — the fight-threshold card no
 * longer records the fight's track id.
 *
 * ⚔ Enter the Fray on the "A fight looms" card: after the fight's track was
 * created, the canonical GM's handler (applyCombatThresholdChoice) made a
 * second world write to the card, `flags[MODULE].thresholdTrackId =
 * track.id`, and nothing read that key — not the render hook, the way-out /
 * Battle / Finish the Fight paths, nor the won-fight card. A per-fight write
 * with zero consumers (rules/reachability.md §1); retired, as issue #331
 * X50 / X55 / X66 retired theirs ("a field nothing reads is retired, not
 * kept"). The claim beside it, `thresholdTaken`, is written and read.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { productionSources } from '../helpers/sourceScan.js';

/** Production references to a module flag key, split into writes and reads (by the surrounding line). */
function flagUses(key) {
  const writes = [];
  const reads  = [];
  for (const src of productionSources()) {
    for (const m of src.code.matchAll(new RegExp(`\\b${key}\\b`, 'g'))) {
      const lineStart = src.code.lastIndexOf('\n', m.index) + 1;
      const line = src.code.slice(lineStart, src.code.indexOf('\n', m.index));
      const loc  = `${src.file}:${src.code.slice(0, m.index).split('\n').length}`;
      // A write: `flags.${MODULE_ID}.key` in an update path, or `key:` inside a flags literal.
      if (/flags\.\$\{MODULE_ID\}\.\w+`\s*\]\s*:/.test(line) || new RegExp(`\\b${key}\\s*:`).test(line)) writes.push(loc);
      else reads.push(loc);
    }
  }
  return { writes, reads };
}

describe('the fight-threshold card keeps no dead track id (issue #337 Y44)', () => {
  it('no production code writes or reads thresholdTrackId (comments aside)', () => {
    expect(flagUses('thresholdTrackId')).toEqual({ writes: [], reads: [] });
  });

  it('nor does the combat flow map say the card records it', () => {
    expect(readFileSync('docs/flows/combat-flow.md', 'utf8')).not.toMatch(/thresholdTrackId/);
  });

  it('control: the claim flag thresholdTaken is both written and read', () => {
    const { writes, reads } = flagUses('thresholdTaken');
    expect(writes.length).toBeGreaterThan(0);
    expect(reads.length).toBeGreaterThan(0);
  });
});
