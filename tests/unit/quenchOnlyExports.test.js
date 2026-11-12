/**
 * STARFORGED COMPANION
 * tests/unit/quenchOnlyExports.test.js
 *
 * QUENCH-ONLY-HELPERS (PRODUCED-BUT-DEAD). `isIronswornAvailable`
 * (system/ironswornAssets.js) and `listCanonicalEncounters`
 * (system/ironswornPacks.js) had no production caller — only the Quench suite
 * and their own unit tests called them — once issue #326 W82 stopped counting
 * their own log lines as consumers. Both are deleted
 * (rules/reachability.md: zero consumers → delete, wire, or mark UNWIRED).
 *
 * The whole tree is scanned as `node scripts/deadscan.mjs` scans it (src/ and
 * tests/, the module.json entry points): no export may be QUENCH-ONLY but the
 * one seam docs/flows/unreachable-code-audit.md keeps by choice.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { scan } from '../../scripts/deadscan.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

/** Every .js file under `dir`, keyed by its root-relative path as deadscan keys it. */
function readTree(dir, files = new Map()) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) readTree(rel, files);
    else if (e.name.endsWith('.js')) files.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  }
  return files;
}

/** The Quench seam kept by choice (unreachable-code-audit.md, "Still listed, by choice"). */
const KEPT_QUENCH_SEAMS = ['getLastJournalCommandPromise'];

describe('QUENCH-ONLY-HELPERS — no production export is reached by Quench alone', () => {
  it('the scan lists no QUENCH-ONLY export but the documented seam', () => {
    const files = readTree('src');
    readTree('tests', files);
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'module.json'), 'utf8'));
    const entries = Array.isArray(manifest.esmodules) && manifest.esmodules.length ? manifest.esmodules : ['src/index.js'];

    const r = scan({ files, entries });
    const quenchOnly = r.quenchOnly.map(row => row.name).filter(n => !KEPT_QUENCH_SEAMS.includes(n));

    expect(quenchOnly).toEqual([]);
    expect(quenchOnly).not.toContain('isIronswornAvailable');
    expect(quenchOnly).not.toContain('listCanonicalEncounters');
  }, 60_000);
});
