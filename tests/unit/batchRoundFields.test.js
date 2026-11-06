/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundFields.test.js
 *
 * Every field a Batch Mode round stores has a reader in production (issue
 * #342 Z37, ROUND-FIELDS-WRITE-ONLY; the sweep auditor's probe). The round is
 * its own world setting (`batchMode.round`), so campaignStateFields.test.js —
 * the check that every stored field has a writer and a reader — never sees
 * it. Two fields it stored had a writer and no reader: `sceneId` (the scene
 * the round opened in; the narration uses the scene current when it runs) and
 * `resolverClaim` (the resolving GM's move-lock claim; recovery reads
 * `resolverId`). Both are retired (rules/reachability.md §1: "a producer with
 * zero consumers is a bug … a schema field"; the tenth audit's Y44).
 *
 * How the check works: the round's shape is not hand-listed — it is what the
 * round's own transitions (src/batch/round.js) store over a round's whole
 * life: the round's keys, an entry's, and the objects an entry holds (its
 * roll, upgrade, offer, read-as and set-aside). Each key needs a read in the
 * production files that touch the round — `<round>.key` / `<entry>.key` /
 * `.offer.key` …, comments stripped, an assignment not counted. A timestamp
 * kept for the record is listed below with its reason; an entry whose field
 * gains a reader fails the stale-entry test.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '../../scripts/deadscan.mjs';
import { maskLiterals, matchBracket } from '../helpers/sourceScan.js';
import * as R from '../../src/batch/round.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

// Every production file that touches the round (imports a batch module, or is one).
const ROUND_FILES = [
  'src/batch/round.js', 'src/batch/driver.js', 'src/batch/relay.js', 'src/batch/roundView.js',
  'src/ui/roundWindow.js', 'src/ui/companionToolbar.js', 'src/narration/narrator.js',
  'src/moves/movePipeline.js', 'src/multiplayer/gmRelay.js', 'src/index.js',
];

// The names each kind of object is held under in those files.
const NAMES = {
  round:    ['round', 'r', 'latest', 'next', 'prev', 'previous', 'stored', 'before', 'after', 'closed', 'opened', 'finished', 'fixed', 'written'],
  entry:    ['entry', 'e', 'mine', 'own', 'a', 'b', 'x', 'participant'],
  rolled:   ['rolled'],
  upgrade:  ['upgrade', 'u'],
  offer:    ['offer'],
  readAs:   ['readAs'],
  setAside: ['setAside'],
};

/** Write-only on purpose: a timestamp kept on the stored round for the record. Each needs its reason. */
const FOR_THE_RECORD = {
  'round.openedAt':      'when the round opened — for a GM reading the stored round; nothing decides on it',
  'round.resolvingAt':   'when the round began resolving — for the record',
  'round.narrationAt':   'when the narration was claimed — for the record (the claim itself is `narrationClaim`)',
  'round.closedAt':      'when the round closed — for the record (why is `closeReason`)',
  'round.closeReason':   'why the round closed, beside `closedAt` — for the record: the window gives back an action the round did not roll whatever the reason (issue #342 Z31), and the closing whisper takes the reason from its caller',
  'entry.readyAt':       'when the entry was confirmed — for the record (the confirm order is `order`)',
  'offer.at':            'when the card\'s move was offered — for the record',
  'setAside.at':         'when an owed roll set the action aside — for the record',
  'upgrade.decidedAt':   'when the roller decided — for the record (the decision is `decided`)',
  'rolled.recordedAt':   'when the entry was recorded — for the record (its status says it is)',
  'rolled.upgradedBy':   'which upgrade replaced the narration input — for the record (the input itself is replaced)',
};

const NOW = '2026-11-06T10:00:00.000Z';
const READING = { kind: R.READING_KIND.MOVE, moveId: 'face_danger', moveName: 'Face Danger', abilities: [], statOptions: [], targetChoices: null, interpretation: {} };

/** Every round the transitions produce over a round's life, with every kind of entry. */
function aRoundsLife() {
  const out = [];
  const keep = (r) => { out.push(r); return r; };
  const parts = ['pl-1', 'pl-2', 'pl-3', 'pl-4'].map(id => ({ userId: id, userName: id, actorId: `pc-${id}`, actorName: id }));
  let r = keep(R.createRound({ id: 'r1', number: 1, sessionId: 's1', now: NOW, participants: parts.slice(0, 3) }));
  r = keep(R.addParticipant(r, parts[3]));
  r = keep(R.submitEntry(r, { userId: 'pl-1', text: 'I act.', submissionId: 'a', now: NOW }));
  r = keep(R.recordReading(r, { userId: 'pl-1', submissionId: 'a', reading: READING }));
  r = keep(R.offerForcedMove(r, { userId: 'pl-1', text: 'Card move.', forced: { moveId: 'face_danger' }, submissionId: 'f', now: NOW, messageId: 'm1' }).round);
  r = keep(R.confirmEntry(r, { userId: 'pl-1', submissionId: 'a', choices: {}, now: NOW }));
  r = keep(R.submitEntry(r, { userId: 'pl-2', text: 'I act too.', submissionId: 'b', now: NOW }));
  r = keep(R.offerForcedMove(r, { userId: 'pl-2', text: 'I resist.', forced: { moveId: 'endure_harm', owed: true }, submissionId: 'o', now: NOW, messageId: 'm2' }).round);
  r = keep(R.recordReading(r, { userId: 'pl-2', submissionId: 'o', reading: READING }));
  r = keep(R.confirmEntry(r, { userId: 'pl-2', submissionId: 'o', choices: {}, now: NOW }));
  r = keep(R.submitEntry(r, { userId: 'pl-3', text: 'Read me.', submissionId: 'c', now: NOW }));
  r = keep(R.recordReading(r, { userId: 'pl-3', submissionId: 'c', reading: { kind: R.READING_KIND.NARRATIVE, suggestedMove: 'compel', suggestedTargetId: 't' } }));
  r = keep(R.rereadEntry(r, { userId: 'pl-3', submissionId: 'c', newSubmissionId: 'c2', now: NOW, moveId: 'compel' }));
  r = keep(R.readingFailed(r, { userId: 'pl-3', submissionId: 'c2', error: 'overloaded' }));
  r = keep(R.passEntry(r, { userId: 'pl-4' }));
  r = keep(R.takeCardMoves(r, { acting: ['pl-1', 'pl-2'] }).round);
  r = keep(R.markModeOffAfter(r));
  r = keep(R.beginResolution(r, { resolverId: 'gm-1', now: NOW, sendNow: true }));
  r = keep(R.fixActing(r));
  // As driver.js rollEntry stores it.
  r = keep(R.markRolled(r, { userId: 'pl-1', rolled: { resolutionId: 'res', cardId: 'card', moveId: 'face_danger', outcome: 'weak_hit', narrationInput: { kind: 'move' } } }));
  r = keep(R.markRecorded(r, { userId: 'pl-1', recordedAt: NOW }));
  r = keep(R.markRefused(r, { userId: 'pl-2', reason: 'gone', narrationInput: { kind: 'refused' }, recordedAt: NOW }));
  r = keep(R.beginUpgrades(r, { offers: { 'pl-1': { burn: { momentum: 9, previewOutcome: 'strong_hit' }, improve: null, cardId: 'card' } } }));
  r = keep(R.decideUpgrade(r, { userId: 'pl-1', decision: 'burn', narrationInput: { kind: 'move' }, now: NOW }));
  r = keep(R.beginNarration(r));
  r = keep(R.claimNarration(r, { narrationClaim: 'claim', now: NOW }));
  keep(R.closeRound(r, { reason: 'resolved', now: NOW }));
  return out;
}

/**
 * The top-level keys of the object literal that follows `anchor` in a file —
 * a payload the driver builds for a transition to store (an entry's roll, an
 * upgrade offer), so a key added there is checked too.
 */
function literalKeys(file, anchor) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const mask = maskLiterals(source);
  const at = mask.search(anchor);
  if (at < 0) throw new Error(`${file}: no ${anchor}`);
  const open = mask.indexOf('{', at + mask.slice(at).match(anchor)[0].length - 1);
  const body = mask.slice(open + 1, matchBracket(mask, open));
  const keys = [];
  let depth = 0;
  for (const part of body.split(/(,|[{}()[\]])/)) {
    if (/^[{([]$/.test(part)) depth++;
    else if (/^[})\]]$/.test(part)) depth--;
    else if (depth === 0) {
      const m = /^\s*([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(part);
      if (m && part.trim()) keys.push(m[1]);
    }
  }
  return keys;
}

/** The stored shape: kind → the keys stored under it. */
function storedShape() {
  const shape = { round: new Set(), entry: new Set(), rolled: new Set(), upgrade: new Set(), offer: new Set(), readAs: new Set(), setAside: new Set() };
  // What the driver hands the transitions to store.
  for (const k of literalKeys('src/batch/driver.js', /function rolledInfoFrom\(\{[^}]*\}\) \{\s*return \{/)) shape.rolled.add(k);
  for (const k of literalKeys('src/batch/driver.js', /offers\[userId\] = \{/)) shape.upgrade.add(k);
  for (const round of aRoundsLife()) {
    for (const k of Object.keys(round)) shape.round.add(k);
    for (const e of Object.values(round.entries ?? {})) {
      for (const k of Object.keys(e)) shape.entry.add(k);
      for (const nested of ['rolled', 'upgrade', 'offer', 'readAs', 'setAside']) {
        if (e[nested] && typeof e[nested] === 'object') for (const k of Object.keys(e[nested])) shape[nested].add(k);
      }
    }
  }
  return shape;
}

const code = Object.fromEntries(ROUND_FILES.map(f => [f, stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))]));

/** Reads of `<name>.field` (an access that is not the left side of an assignment) for one kind. */
function readsOf(kind, field) {
  const names = NAMES[kind].join('|');
  const parent = kind === 'round' || kind === 'entry' ? null : kind;
  const holder = parent ? `(?:\\b(?:${names})|\\.${parent})` : `\\b(?:${names})`;
  const re = new RegExp(`${holder}\\??\\.${field}\\b(?!\\s*=[^=>])`, 'g');
  return ROUND_FILES.flatMap(f => [...code[f].matchAll(re)].map(m => `${f}: ${m[0]}`));
}

const shape = storedShape();
const fields = Object.entries(shape).flatMap(([kind, keys]) => [...keys].map(k => ({ kind, field: k, key: `${kind}.${k}` })));

describe('every field a round stores is read (issue #342 Z37)', () => {
  it('finds the shape (sanity): the round, an entry and what an entry holds', () => {
    expect([...shape.round]).toEqual(expect.arrayContaining(['id', 'phase', 'entries', 'acting', 'resolverId', 'closeReason']));
    expect([...shape.entry]).toEqual(expect.arrayContaining(['status', 'text', 'submissionId', 'offer', 'setAside', 'rolled', 'upgrade']));
    expect([...shape.offer]).toEqual(expect.arrayContaining(['text', 'forced', 'messageId']));
    expect(literalKeys('src/batch/driver.js', /function rolledInfoFrom\(\{[^}]*\}\) \{\s*return \{/)).toEqual(['resolutionId', 'cardId', 'moveId', 'outcome', 'narrationInput']);
    expect(literalKeys('src/batch/driver.js', /offers\[userId\] = \{/)).toEqual(['burn', 'improve', 'cardId']);
    expect(readsOf('round', 'resolverId').length).toBeGreaterThan(0);   // control: recovery leaves a connected resolver alone
    expect(readsOf('entry', 'submissionId').length).toBeGreaterThan(0); // control: a reading lands only on its own submission
  });

  it('the scene it opened in and the resolver\'s lock claim are no longer stored', () => {
    expect(shape.round.has('sceneId')).toBe(false);
    expect(shape.round.has('resolverClaim')).toBe(false);
  });

  it.each(fields.filter(f => !FOR_THE_RECORD[f.key]).map(f => [f.key, f]))('%s has a reader', (_key, f) => {
    expect(readsOf(f.kind, f.field), `${f.key} is stored on the round and read nowhere — retire it, or wire its reader`).not.toEqual([]);
  });

  it('every field listed as kept for the record is still stored and still unread', () => {
    for (const key of Object.keys(FOR_THE_RECORD)) {
      const [kind, field] = key.split('.');
      expect(shape[kind]?.has(field), `${key} is no longer stored — remove it from FOR_THE_RECORD`).toBe(true);
      expect(readsOf(kind, field), `${key} has a reader now — remove it from FOR_THE_RECORD`).toEqual([]);
    }
  });
});
