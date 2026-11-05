// STARFORGED COMPANION
// tests/unit/fileStructureMirrorsTree.test.js
//
// The developer references the startup checklist sends every session to match
// the tree (issue #331 X61).
//
// `docs/file-structure.md` — "the single authoritative file-structure
// reference … what each file exports and does" — had no row for ten
// production modules (the whole `src/logging/` directory among them), so a
// session that trusted it did not know the spotlight, the rewards plan, the
// API transaction log or the campaign-start flow existed. And
// `rules/foundry-api.md`'s v12 → v13 table still marked `Dialog.confirm()`
// "⚠️ Not yet fixed" though no call remains in `src/` and known-issues.md
// records DIALOG-001 as resolved. The doc is a write-through mirror of the
// tree: every module has a row, and every row names a module that exists.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionSources } from '../helpers/sourceScan.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const doc  = fs.readFileSync(path.join(root, 'docs/file-structure.md'), 'utf8');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : /\.m?js$/.test(d.name) ? [path.join(dir, d.name)] : []);
}

describe('docs/file-structure.md mirrors the src tree (issue #331 X61)', () => {
  it('every module the doc names exists in the tree (no stale rows)', () => {
    const named = [...new Set([...doc.matchAll(/`([A-Za-z0-9_.-]+\.m?js)`/g)].map(m => m[1]))]
      .filter(n => !n.includes('*'));
    expect(named.length).toBeGreaterThan(100);
    const tree = new Set(['src', 'tests', 'test', 'scripts'].flatMap(d => walk(path.join(root, d)))
      .map(f => path.basename(f)).concat(fs.readdirSync(root)));
    expect(named.filter(n => !tree.has(n))).toEqual([]);
  });

  it('every production module under src/ has a row of its own (tables/*.js counted as one)', () => {
    const files = walk(path.join(root, 'src')).map(f => path.relative(root, f).split(path.sep).join('/'))
      .filter(f => !f.startsWith('src/integration/'));
    // A row names the module in backticks — by its name in its directory's
    // table, or by its path under src/ (the top-level table's `net/…` rows).
    // A mention inside another module's row is not its row.
    const rowNames = new Set([...doc.matchAll(/^\|([^|\n]+)\|/gm)]
      .flatMap(m => [...m[1].matchAll(/`([^`]+)`/g)].map(n => n[1])));
    const unlisted = files.filter(f => f.startsWith('src/oracles/tables/')
      ? !rowNames.has('tables/*.js')
      : !rowNames.has(path.basename(f)) && !rowNames.has(f.slice('src/'.length)));
    expect(unlisted).toEqual([]);
  });
});

describe("rules/foundry-api.md's v12 → v13 table says what the code does (issue #331 X61)", () => {
  it('the Dialog.confirm() row is fixed — and no call remains in src/', () => {
    const rules = fs.readFileSync(path.join(root, 'rules/foundry-api.md'), 'utf8');
    const row = rules.split('\n').find(l => l.startsWith('| `Dialog.confirm()`')) ?? '';
    expect(row).toMatch(/✅ Fixed/);
    const calls = productionSources().filter(({ code }) => /(?<![\w.])Dialog\.confirm\s*\(/.test(code)).map(s => s.file);
    expect(calls).toEqual([]);
  });
});
