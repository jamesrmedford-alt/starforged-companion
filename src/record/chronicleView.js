/**
 * STARFORGED COMPANION
 * src/record/chronicleView.js — the Chronicle's automatic entries, written from the session record (issue #382, slice 4)
 *
 * The Chronicle is the players' book (character/chronicle.js): one journal a
 * PC, its entries theirs to write, edit, pin and delete. What changes here is
 * where an automatic entry is written from. Five narration paths each handed
 * the scribe their prose and their player's line; the record now has the beat
 * — the move and its outcome, what changed on a sheet, what play did, what
 * was established — so there is one trigger: when a narration of play (a
 * move's, a paced line's, a Batch Mode round's) is written to the record, the
 * scribe is scheduled for its beat (`registerChronicleScribe`), and given
 * FACTS, the PLAYER'S LINE and the NARRATION as the telling
 * (character/chronicleWriter.js). What is kept is decided as before — the
 * salience floor, and a beat that changed something for good kept whatever it
 * is rated (the beat's `lasting`).
 *
 * An entry carries the narration event it was written from (`eventId`) and a
 * hash of what it was given (`sourceHash`), beside its `narrationId`. A
 * correction reaches it: a changed name at read (chronicle.js
 * getChronicleEntries), and a strike of a truth its beat established drops it
 * — unless a player pinned or edited it — by the narration that set the truth
 * (`narrationsOfTruths`), in place of the old word-overlap match. The X-Card
 * removes it by its narration, as before.
 *
 * Canonical GM: the record is written there, and the Chronicle's one writer
 * is there.
 */

import { readRecord, recordHash, narrationsOfTruths } from './read.js';
import { onRecordWritten } from './store.js';
import { storedCampaignState } from './pages.js';
import { OWN_WORDS, changeText, didText, moveText } from './phrasing.js';
import { writeNewNames } from '../factContinuity/nameChanges.js';
import { isCanonicalGM } from '../multiplayer/gmGate.js';

const MODULE_ID = 'starforged-companion';

/** The narrations of play the scribe writes an entry for — a move's, a paced line's, a round's. */
const SCRIBED_MODES = Object.freeze(new Set(['move', 'paced', 'round']));
const KIND_OF = Object.freeze({ move: 'move', paced: 'paced', round: 'round' });

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function subjectText(subject) {
  if (!subject || typeof subject !== 'object') return '';
  return clean(subject.text ?? subject.name ?? '');
}

/** One beat's facts, a line each: the move and its outcome, what changed, what play did, what was established. */
function factLines(beat, { named = false } = {}) {
  const lead = named && clean(beat.who?.name) ? `${clean(beat.who.name)}: ` : '';
  const lines = [];
  if (beat.move) lines.push(`${lead}${moveText(beat.move)}`);
  for (const c of beat.changes ?? []) {
    if (c.cause === 'mirror') continue;
    lines.push(`${lead}${c.actor && c.actor !== beat.who?.actor && c.name ? `${c.name}: ` : ''}${changeText(c)}`);
  }
  for (const d of beat.did ?? []) {
    const text = didText(d);
    if (text) lines.push(`${lead}${text}`);
  }
  for (const t of beat.established ?? []) {
    const subject = subjectText(t.subject);
    lines.push(`${lead}established: ${subject ? `${subject} — ` : ''}${clean(t.fact)}`);
  }
  return lines;
}

/** The player's own words of a beat, or ''. */
const ownWords = (beat) => (beat.line && !beat.line.repost && OWN_WORDS.has(beat.line.via) ? clean(beat.line.text) : '');

/**
 * What the scribe is given for a narration event, read from the record — or
 * null when it tells no beat of play (removed, superseded, or gone). Pure but
 * for its default source.
 *
 * @param {Object} event — the `narration` event as written
 * @param {Object} [read] — readRecord({ session: event.s })
 * @returns {Object|null} writeChronicleEntry's arguments
 */
export function scribeArgsFor(event, read = readRecord({ session: event?.s })) {
  const session = read?.sessions?.[0] ?? null;
  if (!session || !event?.id) return null;
  const beat = session.beats.find(b => (b.events ?? []).includes(event.id));
  if (!beat || beat.removed || !beat.told || beat.kind !== 'play') return null;
  const narrationText = clean(beat.told.text);
  // The beat is still told by this narration: one a later telling of the beat
  // replaced is that telling's to write (and that one schedules its own). The
  // read wrote every changed name as the new one, so the event's own text is
  // compared as the read corrected it.
  const ownText = clean(writeNewNames(String(event.text ?? ''), read.names ?? [], { otherNames: read.otherNames ?? [] }));
  if (!narrationText || narrationText !== ownText) return null;
  const mode = event.d?.mode;
  const round = event.ref?.round ?? null;
  const base = {
    narrationText,
    narrationId: event.ref?.nar ?? null,
    eventId: event.id,
    campaignState: { ...(storedCampaignState() ?? {}), currentSessionId: session.sessionId },
  };
  if (mode === 'round' && round) {
    const beats = session.beats.filter(b => b.round === round && !b.removed);
    const facts = beats.flatMap(b => factLines(b, { named: true }));
    return {
      ...base, kind: KIND_OF.round, facts,
      characters: beats.filter(b => b.who?.actor).map(b => ({ actorId: b.who.actor, name: clean(b.who.name), text: ownWords(b) })),
      lasting: beats.map(b => b.lasting).find(Boolean) ?? null,
      sourceHash: recordHash([facts, beats.map(ownWords), narrationText]),
    };
  }
  const facts = factLines(beat);
  return {
    ...base,
    kind: beat.move ? KIND_OF.move : KIND_OF.paced,
    moveId: beat.move?.moveId ?? undefined,
    outcome: beat.move?.outcome ?? undefined,
    actorId: beat.who?.actor ?? null,
    playerText: ownWords(beat),
    lasting: beat.lasting ?? null,
    facts,
    sourceHash: recordHash([facts, ownWords(beat), narrationText]),
  };
}

/**
 * Write the Chronicle from the record, and take back what a strike unsays.
 * Registered once at `ready` (index.js); acts on the canonical GM.
 */
export function registerChronicleScribe() {
  if (registerChronicleScribe._installed) return;
  registerChronicleScribe._installed = true;
  onRecordWritten((_sessionIds, events) => {
    if (!isCanonicalGM()) return;
    for (const e of events) {
      if (e.k === 'narration' && SCRIBED_MODES.has(e.d?.mode) && e.removed !== true) scribeBeatOf(e);
    }
    const struck = events.filter(e => e.k === 'truth.struck' && typeof e.ref?.truth === 'string' && e.ref.truth).map(e => e.ref.truth);
    if (struck.length) retractStruck(struck);
  });
}

/** Schedule the scribe for a narration's beat: read once its write and the beat's other writes have landed. */
function scribeBeatOf(event) {
  import('../character/chronicleWriter.js')
    .then(({ scheduleChronicleEntry }) => scheduleChronicleEntry(() => scribeArgsFor(event)))
    .catch(err => console.warn(`${MODULE_ID} | chronicle: the scribe could not be scheduled:`, err?.message ?? err));
}

/** A strike of truths: the entries their narrations' beats wrote go, unless a player pinned or edited them. */
async function retractStruck(truthIds) {
  try {
    const { narrationIds, eventIds } = narrationsOfTruths(truthIds);
    if (!narrationIds.length && !eventIds.length) return;
    const { retractChronicleOfNarrations } = await import('../character/chronicle.js');
    await retractChronicleOfNarrations({ narrationIds, eventIds });
  } catch (err) {
    console.warn(`${MODULE_ID} | chronicle: a struck truth's entries could not be taken back:`, err?.message ?? err);
  }
}
