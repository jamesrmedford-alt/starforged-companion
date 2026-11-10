/**
 * UI-8 HELP-CHANGELOG-UNTAGGED-VERSION (twelfth audit, ui area; DOC-DRIFT).
 *
 * CLAUDE.md's version-pinning rule: the help Changelog's newest
 * `<h3>v…</h3>` names the version the unreleased work ships under, and
 * CONTENT_VERSION equals it; "If the latest help heading is BELOW the fetched
 * latest tag … it represents work that already shipped under a higher tag
 * without the heading being updated". This commit (22bdbeb) IS the v1.8.0
 * release, and the in-game help it ships heads its Changelog "v1.7.37" with
 * CONTENT_VERSION "1.7.37" (src/help/helpJournal.js:3, :106) — a version
 * that was never tagged: a v1.8.0 table reads v1.7.37 as the newest release
 * notes (Batch Mode and the 74 issue-#342 fixes under it), and the docs call
 * the work "the v1.7.37 cycle". The rule's own repair (rename the heading to
 * vCURRENT + 1 = v1.8.1 at the next change) would then file v1.8.0's notes
 * under a version that ships later, while CHANGELOG.md's promotion gives them
 * [1.8.0] — the two changelogs would disagree for good.
 *
 * Read-only git (the local tags).
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { PAGES, CONTENT_VERSION } from '../../../src/help/helpJournal.js';

const ROOT = path.resolve(__dirname, '../../..');
const semver = (v) => String(v).replace(/^v/, '').split('.').map(Number);
const cmp = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

const latestTag = () => execSync('git tag --sort=-version:refname', { cwd: ROOT }).toString().split('\n').find(t => /^v\d+\.\d+\.\d+$/.test(t.trim()))?.trim();
const newestHelpHeading = () => /<h3>(v\d+\.\d+\.\d+)<\/h3>/.exec(PAGES.find(p => p.name === 'Changelog').text.content)?.[1];

describe('UI-8: the help Changelog\'s newest heading vs the release tags', () => {
  it('control: CONTENT_VERSION equals the newest help heading (rule step 3)', () => {
    expect(`v${CONTENT_VERSION}`).toBe(newestHelpHeading());
  });

  it('the newest help heading should not be below the latest release tag', () => {
    const tag = latestTag();
    const heading = newestHelpHeading();
    expect(tag).toMatch(/^v\d+\.\d+\.\d+$/);   // setup: the tags are there
    expect({ heading, tag, belowTheTag: cmp(heading, tag) < 0 }).toEqual({ heading, tag, belowTheTag: false });
  });
});
