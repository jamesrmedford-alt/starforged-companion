/**
 * STARFORGED COMPANION
 * tests/unit/tagReadCounts.test.js
 *
 * Issue #402, change 1c: the read of every tagged fact of the kept long hauls
 * of rounds 5 to 10, kept beside the judges' set
 * (`test/ci/playwright/judges/tags.json`), its counts in decisions.md — the
 * counts D1 was decided from. Pinned here so the file stays whole: one row
 * for each fact a narrator's fact block tagged `from` "result" or "line", as
 * the runs recorded them (the review tool's own count, `provenanceOf`), each
 * labelled; and the counts the decision quotes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../../test/ci/playwright/judges/tags.json', import.meta.url));
const RUNS = fileURLToPath(new URL('../../test/ci/playwright/explorations/', import.meta.url));
const read = JSON.parse(readFileSync(FILE, 'utf8'));

/** The tagged facts a run's narrator replies hold, as review.mjs provenanceOf counts them. */
function taggedIn(run) {
  const exchanges = JSON.parse(readFileSync(`${RUNS}${run}/replay.json`, 'utf8')).recording.exchanges;
  const out = [];
  for (const x of exchanges) {
    if (!/^callNarratorAPI>/.test(String(x?.kind ?? ''))) continue;
    const text = (x?.response?.content ?? []).filter(c => c?.type === 'text').map(c => c.text).join('');
    const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
    if (!blocks.length) continue;
    let block = null;
    try { block = JSON.parse(blocks.at(-1)[1]); } catch { block = null; }
    for (const e of Array.isArray(block?.newTruths) ? block.newTruths : []) {
      if (['line', 'result'].includes(String(e?.from ?? '').trim().toLowerCase())) out.push({ step: x.step, fact: e.fact });
    }
  }
  return out;
}

describe('the tag read of rounds 5 to 10 (issue #402, change 1c)', () => {
  it('holds one labelled row for every tagged fact the kept runs recorded — 355', () => {
    const runs = [...new Set(read.labels.map(l => l.run))];
    expect(runs).toEqual([
      'long-haul-live-20261125-164201', 'long-haul-live-20261125-225635', 'long-haul-live-20261125-232143',
      'long-haul-live-20261126-030646', 'long-haul-live-20261126-184225', 'long-haul-live-20261127-041734',
      'long-haul-live-20261127-202557',
    ]);
    for (const run of runs) {
      const recorded = taggedIn(run);
      const rows = read.labels.filter(l => l.run === run);
      expect(rows.map(l => [l.step, l.fact]), run).toEqual(recorded.map(t => [t.step, t.fact]));
    }
    expect(read.labels).toHaveLength(355);
    for (const l of read.labels) {
      expect(['right', 'wrong', 'unclear'], `${l.run} ${l.step}`).toContain(l.label);
      expect(['kept', 'refused']).toContain(l.floor);
    }
  });

  it('gives the counts the decision quotes', () => {
    expect(read.counts).toEqual({
      'result-rolled':   { kept: { right: 44, wrong: 111 }, refused: { right: 1, wrong: 6 } },
      'result-unrolled': { kept: { right: 2, wrong: 5 }, refused: { wrong: 66 } },
      line:              { kept: { right: 82, wrong: 33, unclear: 2 }, refused: { wrong: 3 } },
    });
    const decisions = readFileSync(fileURLToPath(new URL('../../docs/decisions.md', import.meta.url)), 'utf8');
    expect(decisions).toContain('| `result`, a rolled move | 155 (44 · 111) | 7 (1 · 6) |');
    expect(decisions).toContain('| `line` | 117 (82 · 33, 2 unclear) | 3 (0 · 3) |');
  });
});
