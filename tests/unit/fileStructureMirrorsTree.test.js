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

// The Progress Tracks row described the position toggle as "mirrored to the
// clicker's assigned character (`game.user.character`)" — the W56 bug
// (issue #326), since fixed in the code and in combat-flow.md: the toggle
// sends the clicker's PC as resolveUserActorId resolves it, and the PC's own
// position is the one cycled. Its opening also listed track types the panel
// doesn't show (vows, connections, legacy) — issue #342 Z72.
describe("docs/file-structure.md's Progress Tracks row says what the panel does (issue #342 Z72)", () => {
  const row   = doc.split('\n').find(l => l.startsWith('| `progressTracks.js` |')) ?? '';
  const panel = fs.readFileSync(path.join(root, 'src/ui/progressTracks.js'), 'utf8');

  it('control: the toggle sends resolveUserActorId\'s PC, and the combat flow map says so', () => {
    const toggle = panel.split('static #onToggleCombatState(')[1]?.split('\n  }\n')[0] ?? '';
    expect(toggle).toMatch(/resolveUserActorId\(game\.user, game\.settings\.get\(MODULE_ID, 'campaignState'\)\)/);
    expect(fs.readFileSync(path.join(root, 'docs/flows/combat-flow.md'), 'utf8').replace(/\s+/g, ' '))
      .toMatch(/the clicker's PC resolved by `resolveUserActorId`/);
    expect(row).toMatch(/the fight position toggle/);                     // the row is found
  });

  it('the row names the toggle\'s PC as resolveUserActorId resolves it, not `game.user.character`', () => {
    expect(row).not.toMatch(/assigned character \(`game\.user\.character`\)/);
    expect(row).toMatch(/`resolveUserActorId`/);
  });

  it('the row lists the track types the panel shows (PANEL_TRACK_TYPES)', () => {
    const types = panel.split('const PANEL_TRACK_TYPES = {')[1]?.split('};')[0] ?? '';
    const labels = [...types.matchAll(/:\s*'([^']+)'/g)].map(m => m[1]);
    expect(labels).toEqual(['Combat', 'Expedition', 'Scene Challenge']);
    const opening = row.split('). ')[0];
    expect(opening).toMatch(/fights, expeditions, scene challenges/);
    expect(opening).not.toMatch(/vows\/expeditions\/combats\/connections\/legacy/);
  });
});
