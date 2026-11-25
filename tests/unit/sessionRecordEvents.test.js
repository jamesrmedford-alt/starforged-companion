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
  // Overhaul 2 §5.7: a truth whose basis rose to bind, seen by the same differ.
  'truth.confirmed':   ['src/record/ledgerDiff.js'],
  'name.changed':      ['src/factContinuity/nameChanges.js', 'src/factContinuity/chatCommands.js', 'src/factContinuity/correctionDialog.js'],
  'narration.removed': ['src/record/record.js', 'src/context/safety.js', 'src/moves/resultUpgrade.js'],
  // Slice 2
  'scene.started':     ['src/factContinuity/sceneLifecycle.js'],
  'scene.ended':       ['src/factContinuity/sceneLifecycle.js'],
  'frame':             ['src/record/ledgerDiff.js'],
  'question':          ['src/record/cards.js'],
  'choice':            ['src/multiplayer/gmRelay.js'],
  'track.begun':       ['src/record/trackDiff.js'],
  'progress.marked':   ['src/record/trackDiff.js', 'src/record/sheetWatch.js'],
  'position.changed':  ['src/record/trackDiff.js'],
  'track.ended':       ['src/record/trackDiff.js'],
  'fight.offered':     ['src/index.js'],
  'vow.sworn':         ['src/record/sheetWatch.js'],
  'vow.linked':        ['src/record/sheetWatch.js'],
  'vow.closed':        ['src/record/sheetWatch.js'],
  // Written where the bond Item is made (overhaul 4, D12) — the NPC card is a person.
  'connection.made':   ['src/character/actorBridge.js'],
  'connection.developed': ['src/entities/connection.js'],
  'connection.bonded': ['src/entities/connection.js'],
  'connection.lost':   ['src/entities/connection.js'],
  'entity.confirmed':  ['src/entities/entityExtractor.js'],
  'place.arrived':     ['src/index.js', 'src/record/tableSnapshot.js', 'src/moves/persistResolution.js', 'src/ui/entityPanel.js'],
  'oracle.asked':      ['src/index.js'],
  'clock.advanced':    ['src/clocks/clocks.js'],
  'reward.granted':    ['src/character/actorBridge.js'],
};

const HELPER_KIND = { recordNameChanged: 'name.changed', recordNarrationsRemoved: 'narration.removed', recordPlaceArrival: 'place.arrived' };

const sources = productionSources();
const KINDS = new Set(RECORD_EVENTS.map(r => r.id));

/** Every site found: [kind, file]. */
function foundSites() {
  const out = [];
  const named = /\b(?:recordEvent|recordSessionEdge|buildEvent)\s*\(\s*(["'])([\w.]+)\1/g;
  const keyed = /\bkind:\s*(["'])([\w.]+)\1/g;
  const helpers = /\b(recordNameChanged|recordNarrationsRemoved|recordPlaceArrival)\s*\(/g;
  const DIFFERS = new Set(['src/record/ledgerDiff.js', 'src/record/trackDiff.js']);
  for (const { file, code } of sources) {
    let m;
    while ((m = named.exec(code))) out.push([m[2], file]);
    if (DIFFERS.has(file)) while ((m = keyed.exec(code))) if (KINDS.has(m[2])) out.push([m[2], file]);
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

/**
 * The relay's card presses that are choices in play are recorded as `choice`
 * (a GM_ACTIONS row's `record: true`, gmRelay.js recordChoice); every other row
 * is named here with why it records none — its effect is another kind's, or it
 * is never recorded (rules: hidden plans, Private Lines, safety, Private
 * Channel turns, dismissals). A new row is one or the other, in the same commit.
 */
const UNRECORDED = {
  'xcard.activate':            'safety — the X-Card is recorded as narration.removed at its finish, never as a choice',
  'safety.setFlag':            'safety — a flag\'s text is never recorded',
  'session.takeBreak':         'safety — never recorded',
  'safety.syncPrivateLines':   'Private Lines are never recorded',
  'session.begin':             'session.begun',
  'session.end':               'session.ended',
  'bond.apply':                'the !bond roll is recorded from its card (move.resolved); its effects as sheet.changed',
  'factContinuity.command':    'truth.set / truth.struck / name.changed at the ledger save',
  'oracle.narrate':            'its narration card (narration)',
  'oracle.forgetResult':       'an X-Card\'s take-back of an oracle result',
  'repair.apply':              'sheet.changed',
  'payThePrice.advanceClocks': 'clock.advanced',
  'payThePrice.suffer':        'sheet.changed',
  'forcedMove.hold':           'a handover of held forced moves between GMs — no play',
  'record.append':             'the record\'s own relay',
  'narrator.sidecar':          'truth.set at the ledger save',
  'narrator.summary':          'a summary relayed to the GM to store — no play',
  'draft.confirm':             'entity.confirmed',
  'draft.dismiss':             'a dismissal is never recorded',
  'draft.newPerson':           'entity.confirmed',
  'move.burnMomentum':         'move.upgraded',
  'move.improveResult':        'move.upgraded',
  'move.keepResult':           'move.kept',
  'payoff.retry':              'a GM\'s Retry of a refused write: the write\'s own event when it lands',
  'journal.merge':             'journal housekeeping — no play',
  'chronicle.edit':            'the players\' own notes are read from the Chronicle',
  'progressTrack.edit':        'track events at the track save',
  'entity.edit':               'an edit of a card — no play',
  'privateChannel.createJournal': 'Private Channel turns are never recorded',
  'privateChannel.publish':    'a published reflection is a narration card',
  'batch.submit':              'a round\'s lines are recorded where the round takes them',
  'batch.withdraw':            'a round\'s entries are recorded where the round takes them',
  'batch.pass':                'a pass is no beat',
  'batch.confirm':             'a round\'s entries are recorded where the round takes them',
  'batch.reread':              'a reading — no play',
  'batch.keep':                'move.kept',
  'batch.sendNow':             'a GM\'s nudge of the round — no play',
  'batch.discard':             'a round discarded — nothing of it happened',
  'batch.discardThenOff':      'a round discarded — nothing of it happened',
};

describe('every relay row is a choice on the record, or says why not', () => {
  it('each GM_ACTIONS row is `record: true` or listed in UNRECORDED, and no row is both', async () => {
    const { GM_ACTIONS } = await import('../../src/multiplayer/gmRelay.js');
    const rows = Object.entries(GM_ACTIONS);
    const neither = rows.filter(([kind, row]) => row.record !== true && !(kind in UNRECORDED)).map(([k]) => k);
    const both = rows.filter(([kind, row]) => row.record === true && kind in UNRECORDED).map(([k]) => k);
    const gone = Object.keys(UNRECORDED).filter(kind => !(kind in GM_ACTIONS));
    expect({ neither, both, gone }).toEqual({ neither: [], both: [], gone: [] });
  });
});
