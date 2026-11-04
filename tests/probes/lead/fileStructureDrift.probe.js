/**
 * PROBE — LEAD-01 FILE-STRUCTURE-DRIFT (DOC-DRIFT, low)
 *
 * What the user does: a new session starts and follows CLAUDE.md's startup
 * checklist, step 4 — read `docs/file-structure.md`, "the single authoritative
 * file-structure reference … what each file exports and does".
 *
 * What happens: ten production modules under `src/` (and the whole
 * `src/logging/` directory) are not in it at all: `dice/diceAnimation.js`,
 * `entities/starshipModules.js`, `logging/apiTransactionLog.js`,
 * `logging/errorLog.js`, `moves/combatThreshold.js`, `moves/rewards.js`,
 * `narration/spotlight.js`, `oracles/oracleMemory.js`,
 * `session/campaignStart.js`, `world/salience.js`. A session that trusts the
 * reference does not know these exist (the spotlight, the rewards plan, the
 * API transaction log and the campaign-start flow are each a feature with a
 * decisions.md entry and help text).
 *
 * What should happen: every `src/**\/*.js` module has a row (the oracle tables
 * are covered by their `tables/*.js` row), as `docs/file-structure.md`'s own
 * header promises — the doc is a write-through mirror of the tree.
 *
 * Control: every module the doc names exists in the tree, so the drift is
 * one-directional (files added without a row), not stale rows.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const doc = fs.readFileSync(path.join(root, 'docs/file-structure.md'), 'utf8');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : /\.m?js$/.test(d.name) ? [path.join(dir, d.name)] : []);
}

describe('LEAD-01 docs/file-structure.md mirrors the src tree', () => {
  it('control: every module the doc names exists in the tree (no stale rows)', () => {
    const named = [...new Set([...doc.matchAll(/`([A-Za-z0-9_.-]+\.m?js)`/g)].map(m => m[1]))]
      .filter(n => !n.includes('*'));
    expect(named.length).toBeGreaterThan(100);
    const tree = new Set(['src', 'tests', 'test', 'scripts'].flatMap(d => walk(path.join(root, d)))
      .map(f => path.basename(f)).concat(fs.readdirSync(root)));
    const missing = named.filter(n => !tree.has(n));
    expect(missing).toEqual([]);
  });

  it('every production module under src/ has a row (tables/*.js counted as one)', () => {
    const files = walk(path.join(root, 'src')).map(f => path.relative(root, f))
      .filter(f => !f.startsWith('src/integration/'));
    const unlisted = files.filter(f => {
      if (f.startsWith('src/oracles/tables/')) return !doc.includes('tables/*.js');
      return !doc.includes(path.basename(f));
    });
    // Today: ten files — dice/diceAnimation.js, entities/starshipModules.js,
    // logging/apiTransactionLog.js, logging/errorLog.js, moves/combatThreshold.js,
    // moves/rewards.js, narration/spotlight.js, oracles/oracleMemory.js,
    // session/campaignStart.js, world/salience.js.
    expect(unlisted).toEqual([]);
  });
});
