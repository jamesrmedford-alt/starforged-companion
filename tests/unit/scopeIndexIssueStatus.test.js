// STARFORGED COMPANION
// tests/unit/scopeIndexIssueStatus.test.js
//
// docs/scope-index.md is "the single-glance status of all features", read
// first every session, and CLAUDE.md → "Scope documents are GitHub issues"
// says the status comes from the issue: "open = planned / in progress;
// closed-completed = shipped". The "Phone Play on The Forge" row (#293) still
// read 🔄 IN PROGRESS weeks after the maintainer closed #293 as completed, so a
// session orienting from the index treated the phone work as open scope to
// continue (issue #342 Z71, SCOPE-INDEX-293-STALE).
//
// The issue states are GitHub's, not the tree's, so they are recorded here as
// read (GitHub REST, 2026-11-06). A row whose issue changes state is
// re-checked by hand and this table updated with it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ISSUE_STATE = {
  293: { state: 'closed', state_reason: 'completed' },   // closed 2026-10-25
  340: { state: 'closed', state_reason: 'completed' },
};
const BADGE_FOR = { 'closed/completed': '✅ COMPLETE', 'closed/not_planned': '🔧 SUPERSEDED' };

const index = readFileSync('docs/scope-index.md', 'utf8');
const rowFor = (n) => index.split('\n').find(l => l.startsWith('|') && l.includes(`[#${n}](`)) ?? '';
const badge = (row) => row.match(/✅ COMPLETE|🔄 IN PROGRESS|📋 PLANNED|🔧 SUPERSEDED/)?.[0] ?? null;
const expected = (n) => BADGE_FOR[`${ISSUE_STATE[n].state}/${ISSUE_STATE[n].state_reason}`];

describe("the scope index's status follows the issue (issue #342 Z71)", () => {
  it('control: the Batch Mode row (#340, closed completed) reads ✅ COMPLETE', () => {
    expect(badge(rowFor(340))).toBe(expected(340));
  });

  it('the Phone Play on The Forge row (#293, closed completed) reads ✅ COMPLETE', () => {
    const row = rowFor(293);
    expect(row).toMatch(/Phone Play on The Forge/);
    expect(badge(row)).toBe(expected(293));
  });

  it('the phone checks still to make point at their known-issues rows, not at open scope', () => {
    const row = rowFor(293);
    expect(row).not.toMatch(/Remaining: the rest of the test pass on the phone/);
    expect(row).toMatch(/PHONE-LAYOUT/);
    expect(row).toMatch(/PHONE-PINCH-MAP/);
    const known = readFileSync('docs/known-issues.md', 'utf8');
    expect(known).toMatch(/^\| PHONE-LAYOUT \|/m);
    expect(known).toMatch(/^\| PHONE-PINCH-MAP \|/m);
  });
});
