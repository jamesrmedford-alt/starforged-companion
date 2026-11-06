/**
 * UI-8 SCOPE-INDEX-293-STALE (eleventh audit, ui).
 *
 * docs/scope-index.md is "the single-glance status of all features", and
 * CLAUDE.md → "Scope documents are GitHub issues" says the status comes from
 * the issue: "open = planned / in progress; closed-completed = shipped". The
 * "Phone Play on The Forge" row (#293) still reads 🔄 IN PROGRESS with
 * "Remaining: the rest of the test pass on the phone …" — last edited
 * 2026-10-24 (22299b9). The maintainer closed #293 as completed on
 * 2026-10-25 (GitHub REST, read 2026-11-06: `state: closed`,
 * `state_reason: completed`, `closed_at: 2026-10-25T00:13:34Z`). Every other
 * row's badge matches its issue's state (the audit compared all of them).
 *
 * The issue state is GitHub's, not the tree's, so it is recorded here as read.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Read from GitHub on 2026-11-06 (gh api repos/…/issues/293, …/issues/340).
const ISSUE_STATE = {
  293: { state: 'closed', state_reason: 'completed' },
  340: { state: 'closed', state_reason: 'completed' },
};
const BADGE_FOR = { 'closed/completed': '✅ COMPLETE', 'closed/not_planned': '🔧 SUPERSEDED' };

const index = readFileSync('docs/scope-index.md', 'utf8');
const rowFor = (n) => index.split('\n').find(l => l.startsWith('|') && l.includes(`[#${n}](`)) ?? '';
const badge = (row) => row.match(/✅ COMPLETE|🔄 IN PROGRESS|📋 PLANNED|🔧 SUPERSEDED/)?.[0] ?? null;

describe('UI-8: the scope index\'s status follows the issue', () => {
  it('control: the Batch Mode row (#340, closed completed) reads ✅ COMPLETE', () => {
    const s = ISSUE_STATE[340];
    expect(badge(rowFor(340))).toBe(BADGE_FOR[`${s.state}/${s.state_reason}`]);
  });

  it('the Phone Play on The Forge row (#293, closed completed) reads ✅ COMPLETE', () => {
    const row = rowFor(293);
    expect(row).toMatch(/Phone Play on The Forge/);                       // control: the row
    const s = ISSUE_STATE[293];
    expect(badge(row)).toBe(BADGE_FOR[`${s.state}/${s.state_reason}`]);
  });
});
