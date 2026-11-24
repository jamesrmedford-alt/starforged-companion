/**
 * STARFORGED COMPANION
 * tests/unit/sessionRecordEvents.test.js — the session record's table, swept against src/ (issue #382)
 *
 * The record ships no event kind without a writer and a reader — the
 * repo's own caution is `campaignState.sessionLogs`, a per-move log that grew
 * with every move while nothing read it (known-issues W58 PERSIST-DEAD-STEPS).
 * Shaped as worldSnapshot.test.js is for SNAPSHOT_EVENTS:
 *
 *   - every kind a production call names is a row of RECORD_EVENTS, and every
 *     row is written somewhere — at the sites listed here, and nowhere else
 *     (a new site is a line in SITES, in the same commit, with the flow doc);
 *   - every row is read: `readRecord` handles its kind, and its `readBy`
 *     names views that exist, each made from `readRecord`;
 *   - the stored events (`sessionRecord.events`) are opened by read.js alone;
 *   - every writer of `campaignState.nameChanges` (a `withNameChange(` call)
 *     puts the change on the record in the same function.
 */

import { describe, it, expect } from 'vitest';
import { productionSources, matchBracket } from '../helpers/sourceScan.js';
import { RECORD_EVENTS, RECORD_VIEWS } from '../../src/record/events.js';

/**
 * Where each kind is written. A call naming a kind outright —
 * `recordEvent("<kind>"`, `recordSessionEdge("<kind>"`, a resumed session's
 * `buildEvent("<kind>"`, the ledger differ's `kind: "<kind>"` — is a site; so
 * is a call of the two helpers that write one kind (`recordNameChanged(`,
 * `recordNarrationsRemoved(`).
 */
const SITES = {
  'session.begun':     ['src/safety/sessionLifecycleDialogs.js', 'src/record/record.js'],
  'session.ended':     ['src/safety/sessionLifecycleDialogs.js', 'src/session/lifecycle.js'],
  'line':              ['src/index.js', 'src/batch/driver.js'],
  'move.resolved':     ['src/moves/movePipeline.js', 'src/index.js', 'src/record/cards.js'],
  'move.upgraded':     ['src/moves/burnMomentum.js', 'src/moves/improveResult.js'],
  'move.kept':         ['src/moves/heldResult.js'],
  'sheet.changed':     ['src/record/sheetWatch.js'],
  'narration':         ['src/record/cards.js'],
  'truth.set':         ['src/record/ledgerDiff.js'],
  'truth.struck':      ['src/record/ledgerDiff.js'],
  'name.changed':      ['src/factContinuity/nameChanges.js', 'src/factContinuity/chatCommands.js', 'src/factContinuity/correctionDialog.js'],
  'narration.removed': ['src/record/record.js', 'src/context/safety.js', 'src/moves/resultUpgrade.js'],
};

const HELPER_KIND = { recordNameChanged: 'name.changed', recordNarrationsRemoved: 'narration.removed' };

const sources = productionSources();
const KINDS = new Set(RECORD_EVENTS.map(r => r.id));

/** Every site found: [kind, file]. */
function foundSites() {
  const out = [];
  const named = /\b(?:recordEvent|recordSessionEdge|buildEvent)\s*\(\s*(["'])([\w.]+)\1/g;
  const keyed = /\bkind:\s*(["'])((?:truth)\.[\w]+)\1/g;
  const helpers = /\b(recordNameChanged|recordNarrationsRemoved)\s*\(/g;
  for (const { file, code } of sources) {
    let m;
    while ((m = named.exec(code))) out.push([m[2], file]);
    if (file === 'src/record/ledgerDiff.js') while ((m = keyed.exec(code))) out.push([m[2], file]);
    while ((m = helpers.exec(code))) {
      // The helper's own definition is no call of it.
      const before = code.slice(Math.max(0, m.index - 30), m.index);
      if (/function\s+$/.test(before)) continue;
      out.push([HELPER_KIND[m[1]], file]);
    }
  }
  return out;
}

describe('every kind is a row, written where the table says', () => {
  const found = foundSites();

  it('every kind a production call names is a row of RECORD_EVENTS', () => {
    expect(found.filter(([kind]) => !KINDS.has(kind)).map(([kind, file]) => `${kind} (${file})`)).toEqual([]);
  });

  it('every row is written, and only at its listed sites', () => {
    expect(Object.keys(SITES).sort()).toEqual([...KINDS].sort());
    for (const [kind, files] of Object.entries(SITES)) {
      const at = new Set(found.filter(([k]) => k === kind).map(([, file]) => file));
      expect([...at].sort(), `${kind}'s sites`).toEqual([...files].sort());
    }
  });
});

describe('every row is read', () => {
  const read = sources.find(s => s.file === 'src/record/read.js');

  it('readRecord handles each kind', () => {
    for (const kind of KINDS) {
      expect(read.code.includes(`case '${kind}':`), `read.js has no case for "${kind}"`).toBe(true);
    }
  });

  it('each row names views that exist, and each view is made from readRecord', () => {
    for (const row of RECORD_EVENTS) {
      for (const view of row.readBy) expect(Object.keys(RECORD_VIEWS), `${row.id} → ${view}`).toContain(view);
    }
    for (const file of Object.values(RECORD_VIEWS)) {
      const src = sources.find(s => s.file === file);
      expect(src, file).toBeTruthy();
      expect(/\breadRecord\s*\(/.test(src.code), `${file} calls readRecord`).toBe(true);
    }
  });

  it('the stored events are opened by read.js alone', () => {
    const opens = /\b(?:record|rec|sessionRecord|meta\.record)\??\.events\b/;
    const readers = sources.filter(s => s.file !== 'src/record/read.js' && opens.test(s.mask)).map(s => s.file);
    expect(readers).toEqual([]);
  });
});

/** The top-level function of `code` that holds index `at`, as its source. */
function enclosingFunction({ code, mask }, at) {
  const header = /(?:^|\n)(?:export\s+)?(?:async\s+)?function\s*\*?\s*[\w$]+\s*\(/g;
  let best = null;
  let m;
  while ((m = header.exec(mask))) {
    const paren = m.index + m[0].length - 1;
    const close = matchBracket(mask, paren);
    const open = mask.indexOf('{', close);
    const end = open < 0 ? -1 : matchBracket(mask, open);
    if (end > 0 && m.index <= at && at <= end) best = code.slice(m.index, end + 1);
  }
  return best;
}

describe('a changed name is put on the record by every writer of the stored list', () => {
  it('each production function that calls withNameChange( also calls recordNameChanged(', () => {
    const missing = [];
    for (const source of sources) {
      if (source.file === 'src/record/read.js') continue;      // the record's own fold of its events
      const re = /\bwithNameChange\s*\(/g;
      let m;
      while ((m = re.exec(source.mask))) {
        const before = source.mask.slice(Math.max(0, m.index - 30), m.index);
        if (/function\s+$/.test(before)) continue;              // its definition
        const fn = enclosingFunction(source, m.index);
        if (!fn || !/\brecordNameChanged\s*\(/.test(fn)) missing.push(`${source.file} @${m.index}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
