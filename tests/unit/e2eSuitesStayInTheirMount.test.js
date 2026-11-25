/**
 * STARFORGED COMPANION
 * tests/unit/e2eSuitesStayInTheirMount.test.js
 *
 * The e2e job's Playwright container mounts test/ci/playwright alone, at /pw
 * (test/ci/docker-compose.e2e.yml). A suite CI runs there — the scripted
 * playthroughs, the multiplayer suite — that statically imports a file outside
 * that folder fails before its first scenario: PR #387's first e2e run ended
 * "Cannot find module '/src/narration/thinking.js' imported from
 * /pw/lib/claude.mjs" (a local cloud.sh run, from the repo, never shows it).
 * So a CI suite's static import graph stays inside test/ci/playwright; what
 * reaches src/ is loaded lazily, on a path only a local run takes
 * (lib/claude.mjs loadThinkingOff, for a model swap).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MOUNT = path.resolve(__dirname, '../../test/ci/playwright');
const STATIC_IMPORT = /^\s*import\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm;

/** Every file a suite reaches by static import, and each import that leaves the mount. */
function graphOf(entry) {
  const seen = new Set();
  const escapes = [];
  const stack = [path.join(MOUNT, entry)];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    for (const [, spec] of fs.readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      if (!spec.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), spec);
      if (!target.startsWith(MOUNT + path.sep)) escapes.push(`${path.relative(MOUNT, file)} → ${spec}`);
      else stack.push(target);
    }
  }
  return { seen, escapes };
}

describe('the suites CI runs in the Playwright container import nothing outside test/ci/playwright', () => {
  for (const suite of ['playthrough.mjs', 'multiplayer.mjs']) {
    it(`${suite}`, () => {
      const { seen, escapes } = graphOf(suite);
      expect(seen.size).toBeGreaterThan(1);
      expect(escapes).toEqual([]);
    });
  }

  it('control: a runner CI does not run there may reach src/ (the readers\' test, run from the repo)', () => {
    expect(graphOf('readers.mjs').escapes.length).toBeGreaterThan(0);
  });

  it('lib/claude.mjs reaches src/narration/thinking.js only lazily', () => {
    const source = fs.readFileSync(path.join(MOUNT, 'lib/claude.mjs'), 'utf8');
    expect(source).not.toMatch(/^\s*import\s[^;]*src\/narration\/thinking\.js/m);
    expect(source).toMatch(/import\("\.\.\/\.\.\/\.\.\/\.\.\/src\/narration\/thinking\.js"\)/);
  });
});
