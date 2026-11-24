/**
 * STARFORGED COMPANION
 * tests/unit/sessionRecordRead.test.js — the session record, read with the table's corrections (issue #382, slice 1)
 *
 * `readRecord(scope, source)` is the one read of the record. It groups events
 * into beats by the ids they already carry (no id is threaded down the
 * pipeline) and applies the corrections in the design's order — removals,
 * strikes, names, cutaways — without changing what is stored. Its hash
 * moves with any correction, so a view made from an older read is stale.
 *
 * Unit-level: the source here is a page list as pages.js hands it over. The
 * composition — the real producers writing the events — is
 * sessionLogRecordComposition.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readRecord } from '../../src/record/read.js';

const S1 = 'sess-1';
const S2 = 'sess-2';
let n = 0;
/** An event as record.js stores it. */
const ev = (k, { s = S1, at, who = {}, ref = {}, d = {}, text, removed } = {}) => {
  n += 1;
  return {
    id: `e${String(n).padStart(3, '0')}`, k, at: at ?? n * 1000, seq: n, s, scene: 'sc-1',
    who: { user: who.user ?? null, actor: who.actor ?? null }, ref, d,
    ...(text !== undefined ? { text } : {}), ...(removed ? { removed: true } : {}),
  };
};
const page = (sessionId, events, { number = 1, story = '', createdAt = 1 } = {}) => ({
  pageId: `p-${sessionId}`, sessionId, number, name: `Session ${number}`, createdAt, story,
  record: events === null ? null : { v: 1, sessionId, seq: events.length, events: Object.fromEntries(events.map(e => [e.id, e])) },
});
const ACTORS = { 'pc-mira': 'Mira Kestrel', 'pc-juro': 'Juro' };
const source = (pages, extra = {}) => ({
  pages, currentSessionId: S1,
  nameOf: (id) => ACTORS[id] ?? null,
  otherNames: Object.values(ACTORS),
  ...extra,
});
const read = (pages, scope = { session: S1 }, extra) => readRecord(scope, source(pages, extra));

/**
 * The run's step a5 (design §4.4): a line, its move, a sheet change, the
 * telling, a truth it set — then `later()`'s events, made after them.
 */
function a5(later = () => []) {
  const base = [
    ev('line', { who: { user: 'u-ana', actor: 'pc-mira' }, ref: { line: 'msg-1' }, d: { via: 'typed' },
      text: 'Tamsin, I\'ll give you a fair cut of my salvage leads and first pick of whatever I haul.' }),
    ev('move.resolved', { who: { user: 'u-ana', actor: 'pc-mira' }, ref: { res: 'r1' },
      d: { moveId: 'compel', moveName: 'Compel', statUsed: 'heart', statValue: 2, actionDie: 5, challengeDice: [3, 6], actionScore: 7, outcome: 'strong_hit', target: { name: 'Tamsin', id: null } } }),
    ev('sheet.changed', { who: { actor: 'pc-mira' }, ref: { res: 'r1' }, d: { actorId: 'pc-mira', what: 'momentum', from: 2, to: 3, cause: { kind: 'move', res: 'r1' } } }),
    ev('narration', { who: { actor: 'pc-mira' }, ref: { nar: 'n1', res: 'r1', card: 'c1' }, d: { mode: 'move' }, text: '“First pick, and a fair cut,” Tamsin says.' }),
    ev('truth.set', { ref: { truth: 'tr-1', nar: 'n1' }, d: { subject: { kind: 'text', text: 'dark beacon\'s haulers' }, fact: 'carry water and medical stores', by: 'narrator' } }),
  ];
  return [...base, ...later()];
}

describe('a beat is computed at read from the ids its events carry', () => {
  it('the line, its move, what changed, the telling and what it established are one beat, in that order', () => {
    const [session] = read([page(S1, a5())]).sessions;
    expect(session.beats).toHaveLength(1);
    const [beat] = session.beats;
    expect(beat.kind).toBe('play');
    expect(beat.who).toMatchObject({ user: 'u-ana', actor: 'pc-mira', name: 'Mira Kestrel' });
    expect(beat.line.text).toMatch(/first pick of whatever I haul/);          // the player's own words
    expect(beat.move).toMatchObject({ name: 'Compel', stat: 'heart', score: 7, outcome: 'strong_hit', dice: { action: 5, challenge: [3, 6] } });
    expect(beat.changes).toEqual([expect.objectContaining({ actor: 'pc-mira', what: 'momentum', from: 2, to: 3, cause: 'move' })]);
    expect(beat.told).toEqual({ text: '“First pick, and a fair cut,” Tamsin says.', mode: 'move' });
    expect(beat.established).toEqual([expect.objectContaining({ truthId: 'tr-1', fact: 'carry water and medical stores', by: 'narrator' })]);
    expect(beat.events).toHaveLength(5);
  });

  it('an effect recorded before its roll card (an effect lands, then the card posts) is still the move\'s', () => {
    const events = a5();
    const change = events.splice(2, 1)[0];
    change.at = events[0].at + 1;             // before move.resolved
    events.splice(1, 0, change);
    const [beat] = read([page(S1, events)]).sessions[0].beats;
    expect(beat.move?.outcome).toBe('strong_hit');
    expect(beat.changes.map(c => c.what)).toEqual(['momentum']);
  });

  it('a paced narration joins its speaker\'s line; a card\'s Roll that posts the line again is that beat while nothing came of it', () => {
    const events = [
      ev('line', { who: { actor: 'pc-juro' }, ref: { line: 'm1' }, d: { via: 'typed' }, text: 'I wait by the hatch, listening.' }),
      ev('narration', { who: { actor: 'pc-juro' }, ref: { nar: 'n1' }, d: { mode: 'paced', actorId: 'pc-juro' }, text: 'The hatch ticks as it cools.' }),
      ev('line', { who: { actor: 'pc-mira' }, ref: { line: 'm2' }, d: { via: 'typed' }, text: 'I try to talk the guard down.' }),
      ev('line', { who: { actor: 'pc-mira' }, ref: { line: 'm3' }, d: { via: 'narrate-only', repost: true }, text: 'I try to talk the guard down.' }),
      ev('narration', { who: { actor: 'pc-mira' }, ref: { nar: 'n2' }, d: { mode: 'paced', actorId: 'pc-mira' }, text: 'The guard hesitates.' }),
    ];
    const beats = read([page(S1, events)]).sessions[0].beats;
    expect(beats.map(b => [b.who.name, b.line?.text, b.told?.text])).toEqual([
      ['Juro', 'I wait by the hatch, listening.', 'The hatch ticks as it cools.'],
      ['Mira Kestrel', 'I try to talk the guard down.', 'The guard hesitates.'],
    ]);
  });

  it('a Batch Mode round\'s one telling goes on the round\'s beats; an X-Card on it takes every line it told', () => {
    const events = [
      ev('line', { who: { actor: 'pc-mira' }, ref: { round: 'rd-1' }, d: { via: 'round' }, text: 'Mira covers the door.' }),
      ev('move.resolved', { who: { actor: 'pc-mira' }, ref: { res: 'r-m', round: 'rd-1' }, d: { moveId: 'face_danger', outcome: 'weak_hit' } }),
      ev('line', { who: { actor: 'pc-juro' }, ref: { round: 'rd-1' }, d: { via: 'round' }, text: 'Juro slices the lock.' }),
      ev('narration', { ref: { nar: 'n-rd', round: 'rd-1' }, d: { mode: 'round' }, text: 'The door holds; the lock gives.' }),
    ];
    const beats = read([page(S1, events)]).sessions[0].beats;
    expect(beats).toHaveLength(2);
    expect(beats.filter(b => b.told).map(b => b.told.text)).toEqual(['The door holds; the lock gives.']);

    const removed = [...events, ev('narration.removed', { d: { narrationIds: ['n-rd'], by: 'xcard' } })];
    const after = read([page(S1, removed)]).sessions[0];
    expect(after.beats.map(b => [b.removed, b.line, b.told])).toEqual([['xcard', null, null], ['xcard', null, null]]);
    expect(after.beats[0].move.outcome).toBe('weak_hit');                   // the move happened
  });
});

describe('corrections, in order — the stored events never change', () => {
  it('an X-Card: the beat keeps its move and its change, marked removed; its line, its telling and its truth are gone', () => {
    const events = a5(() => [ev('narration.removed', { d: { narrationIds: ['n1'], by: 'xcard' } })]);
    const before = JSON.stringify(events);
    const result = read([page(S1, events)]);
    const [session] = result.sessions;
    const [beat] = session.beats;
    expect(beat).toMatchObject({ removed: 'xcard', line: null, told: null, established: [] });
    expect(beat.move.outcome).toBe('strong_hit');
    expect(beat.changes.map(c => [c.what, c.from, c.to])).toEqual([['momentum', 2, 3]]);
    expect(session.corrections).toEqual([{ kind: 'removed', count: 1 }]);
    // Nothing the X-Card removed is anywhere in the read — not even named.
    expect(JSON.stringify(result)).not.toMatch(/fair cut|medical stores|whatever I haul/);
    expect(JSON.stringify(events)).toBe(before);
  });

  it('an X-Card reaches an earlier session\'s record, whichever page recorded it', () => {
    const later = [ev('narration.removed', { s: S2, d: { narrationIds: ['n1'], by: 'xcard' } })];
    const result = read([page(S1, a5()), page(S2, later, { number: 2, createdAt: 2 })]);
    expect(result.sessions[0].beats[0].removed).toBe('xcard');
  });

  it('an upgrade: the superseded telling and what it set are dropped, the re-narration stands in the beat, the move ends upgraded', () => {
    const events = a5(() => [
      ev('move.upgraded', { ref: { res: 'r1' }, d: { how: 'burn', from: 'strong_hit', to: 'strong_hit' } }),
    ]);
    events[1].d.outcome = 'miss';
    events.at(-1).d = { how: 'burn', from: 'miss', to: 'strong_hit', momentum: { from: 6, to: 2 } };
    events.push(
      ev('narration.removed', { ref: { res: 'r1' }, d: { narrationIds: ['n1'], by: 'superseded' } }),
      ev('narration', { ref: { nar: 'n1b', res: 'r1' }, d: { mode: 'move', upgradeOf: 'r1' }, text: 'Tamsin takes the deal after all.' }),
    );
    const [beat] = read([page(S1, events)]).sessions[0].beats;
    expect(beat.move).toMatchObject({ outcome: 'strong_hit', upgraded: { how: 'burn', from: 'miss', to: 'strong_hit' } });
    expect(beat.told.text).toBe('Tamsin takes the deal after all.');
    expect(beat.established).toEqual([]);
    expect(beat.removed).toBeNull();
  });

  it('a strike: the truth leaves what stands; its replacement stands; the beat that told it is given what to leave out', () => {
    const events = a5(() => [
      ev('truth.set', { ref: { truth: 'tr-2' }, d: { subject: { kind: 'text', text: 'dark beacon\'s haulers' }, fact: 'carry only water', by: 'gm', replaces: 'tr-1' } }),
      ev('truth.struck', { ref: { truth: 'tr-1' }, d: { by: 'gm', replacedBy: 'tr-2' } }),
    ]);
    const [session] = read([page(S1, events)]).sessions;
    expect(session.open.established.map(t => t.fact)).toEqual(['carry only water']);
    expect(session.beats[0].leaveOut).toEqual(['carry water and medical stores']);
    expect(session.corrections).toEqual([expect.objectContaining({ kind: 'strike', fact: 'carry water and medical stores', replacedBy: 'carry only water', by: 'gm' })]);
  });

  it('one truth is set once — a save that carried it back is no second truth', () => {
    const events = a5(() => [ev('truth.set', { ref: { truth: 'tr-1', nar: 'n1' }, d: { fact: 'carry water and medical stores', by: 'narrator' } })]);
    expect(read([page(S1, events)]).sessions[0].open.established).toHaveLength(1);
  });

  it('names: a changed name is written as the new one in every words, label and prose field — and its short form (decision D5)', () => {
    const events = [
      ev('line', { who: { actor: 'pc-mira' }, ref: { line: 'm1' }, d: { via: 'typed' }, text: 'I check beside the Wake\'s registry.' }),
      ev('narration', { who: { actor: 'pc-mira' }, ref: { nar: 'n1' }, d: { mode: 'paced', actorId: 'pc-mira' }, text: 'The Ashen Wake\'s crew watches you.' }),
      ev('truth.set', { ref: { truth: 'tr-1', nar: 'n1' }, d: { subject: { kind: 'text', text: 'the Ashen Wake' }, fact: 'is a salvage hauler', by: 'narrator' } }),
    ];
    const later = [ev('name.changed', { s: S2, d: { from: 'Ashen Wake', to: 'Cinder Wren', how: 'corrected', about: 'the ship' } })];
    const result = read([page(S1, events), page(S2, later, { number: 2, createdAt: 2 })], { session: 'campaign' });
    const text = JSON.stringify(result.sessions[0]);
    expect(text).not.toMatch(/Ashen|Wake/);
    expect(result.sessions[0].beats[0].line.text).toBe('I check beside the Cinder Wren\'s registry.');
    expect(result.sessions[0].beats[0].told.text).toBe('The Cinder Wren\'s crew watches you.');
    expect(result.sessions[0].open.established[0].subject.text).toBe('the Cinder Wren');
    // The change itself is the later session's correction, the new name only.
    expect(result.sessions[1].corrections).toEqual([expect.objectContaining({ kind: 'name', to: 'Cinder Wren', how: 'corrected' })]);
  });

  it('names: a name changed twice reads as its newest; a change undone reads as the first', () => {
    const base = [ev('line', { who: { actor: 'pc-mira' }, ref: { line: 'm1' }, d: { via: 'typed' }, text: 'I hail Tamsin Vey.' })];
    const twice = [...base,
      ev('name.changed', { d: { from: 'Tamsin Vey', to: 'Tamsin Okoro', how: 'renamed' } }),
      ev('name.changed', { d: { from: 'Tamsin Okoro', to: 'Tamsin Hale', how: 'renamed' } })];
    expect(read([page(S1, twice)]).sessions[0].beats[0].line.text).toBe('I hail Tamsin Hale.');
    const undone = [...base,
      ev('name.changed', { d: { from: 'Tamsin Vey', to: 'Tamsin Okoro', how: 'renamed' } }),
      ev('name.changed', { d: { from: 'Tamsin Okoro', to: 'Tamsin Vey', how: 'renamed' } })];
    expect(read([page(S1, undone)]).sessions[0].beats[0].line.text).toBe('I hail Tamsin Vey.');
  });

  it('a character\'s name is the record\'s current one, read through their id', () => {
    const [beat] = read([page(S1, a5())], { session: S1 }, { nameOf: (id) => (id === 'pc-mira' ? 'Mira Okafor' : null) }).sessions[0].beats;
    expect(beat.who.name).toBe('Mira Okafor');
  });

  it('a closing vignette is a cutaway — an NPC elsewhere, not something the characters did', () => {
    const events = [ev('narration', { ref: { nar: 'n-v' }, d: { mode: 'vignette_close' }, text: 'On the quay, Vance mends a net.' })];
    expect(read([page(S1, events)]).sessions[0].beats[0].kind).toBe('cutaway');
  });
});

describe('the hash a view is keyed by', () => {
  it('is the same for the same read, and moves with a correction', () => {
    const events = a5();
    const h1 = read([page(S1, events)]).hash;
    expect(read([page(S1, events)]).hash).toBe(h1);
    const struck = read([page(S1, [...events, ev('truth.struck', { ref: { truth: 'tr-1' }, d: { by: 'player' } })])]).hash;
    expect(struck).not.toBe(h1);
    const renamed = read([page(S1, [...events, ev('name.changed', { d: { from: 'Tamsin', to: 'Tamsin Hale', how: 'renamed' } })])]).hash;
    expect(renamed).not.toBe(h1);
  });

  it('`through` reads no event past its counter: more play since leaves an older view\'s span — and its hash — as it was', () => {
    const events = a5();
    const through = events[2].seq;
    const early = readRecord({ session: S1, through }, source([page(S1, events)]));
    const later = readRecord({ session: S1, through }, source([page(S1, [...events, ev('line', { d: { via: 'typed' }, text: 'more play' })])]));
    expect(later.hash).toBe(early.hash);
    expect(early.sessions[0].beats[0].told).toBeNull();
  });
});

describe('a session played before the record', () => {
  it('is read as it is, labelled legacy, with the story its page holds and no beats', () => {
    const result = read([page(S1, null, { story: 'The crew reached Bleakhold.' })]);
    expect(result.sessions[0]).toMatchObject({ legacy: true, beats: [], story: 'The crew reached Bleakhold.' });
  });

  it('"campaign" reads every session, oldest first', () => {
    const result = read([page(S2, [], { number: 2, createdAt: 20 }), page(S1, a5(), { number: 1, createdAt: 10 })], { session: 'campaign' });
    expect(result.sessions.map(s => s.sessionId)).toEqual([S1, S2]);
  });
});
