/**
 * Issue #345 D7 (VERSION-PIN-RULE-MINOR-BUMP) — the in-game help Changelog's
 * newest heading is never below the release that shipped its notes.
 *
 * CLAUDE.md's version-pinning rule: the newest `<h3>v…</h3>` names the
 * version the unreleased work ships under, and CONTENT_VERSION equals it.
 * The v1.8.0 release shipped notes headed v1.7.37 (CONTENT_VERSION "1.7.37"),
 * and the rule's old repair — rename the stale heading to vCURRENT + 1 —
 * would have filed them under v1.8.1 while CHANGELOG.md promoted them to
 * [1.8.0]. The maintainer chose option A: the heading takes the tag that
 * shipped it (v1.8.0 here), and new work goes under vCURRENT + 1.
 *
 * The tag check reads the tags merged into HEAD, so an older commit is judged
 * against the releases it had seen, not newer ones (the fix-sensitivity
 * script runs old commits in worktrees). It skips where no release tag is
 * fetched (CI's shallow checkout).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PAGES, CONTENT_VERSION } from '../../src/help/helpJournal.js';

const ROOT = path.resolve(__dirname, '../..');
const semver = (v) => String(v).replace(/^v/, '').split('.').map(Number);
const cmp = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

function newestMergedReleaseTag() {
  try {
    const out = execFileSync('git', ['tag', '--merged', 'HEAD', '--sort=-version:refname'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').map(t => t.trim()).find(t => /^v\d+\.\d+\.\d+$/.test(t)) ?? null;
  } catch {
    return null;   // not a git checkout
  }
}

const changelog = () => PAGES.find(p => p.name === 'Changelog').text.content;
const helpHeadings = () => [...changelog().matchAll(/<h3>(v\d+\.\d+\.\d+)<\/h3>/g)].map(m => m[1]);

const TAG = newestMergedReleaseTag();

describe('issue #345 D7 — the help Changelog heading follows the release tags', () => {
  it('control: CONTENT_VERSION equals the newest help heading', () => {
    expect(`v${CONTENT_VERSION}`).toBe(helpHeadings()[0]);
  });

  it('the v1.8.0 release\'s notes are headed v1.8.0 — no v1.7.37 heading was ever tagged', () => {
    expect(helpHeadings()).toContain('v1.8.0');
    expect(helpHeadings()).not.toContain('v1.7.37');
  });

  it.skipIf(!TAG)('the newest help heading is not below the newest release tag merged into HEAD', () => {
    const heading = helpHeadings()[0];
    expect({ heading, tag: TAG, belowTheTag: cmp(heading, TAG) < 0 })
      .toEqual({ heading, tag: TAG, belowTheTag: false });
  });
});
