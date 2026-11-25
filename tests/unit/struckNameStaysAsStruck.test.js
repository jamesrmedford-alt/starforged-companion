/**
 * STARFORGED COMPANION
 * tests/unit/struckNameStaysAsStruck.test.js
 *
 * Known-issues STRUCK-NAME-REWRITTEN-AS-THE-NEW-NAME — the long haul's fourth
 * live run (issue #383, `explorations/long-haul-live-20261124-213912/`), and
 * its free rehearsal 211946. The player set "raider cutter — is named the
 * Ashen Wake" (a37), struck it (a48, `!truth strike tr-085f5`) and set
 * "raider cutter — is named the Cinder Wren" (a49): a name corrected, Ashen
 * Wake → Cinder Wren. The record's read wrote every changed name as the new
 * one — the strike's words too — so Session 2's Session Log page read
 * "Struck: raider cutter — is named the Cinder Wren", beside the same truth
 * standing, and so did STRUCK BY THE TABLE in eight summary and recap
 * sources: the summary was told the name it should use did not happen. A
 * strike stays as struck; the name its words hold that changed since goes
 * beside it, "(now: Cinder Wren)".
 *
 * The events are the run's, as the record keeps them (ledgerDiff.js's
 * truth.set / truth.struck, nameChanges.js's name.changed).
 */

import { describe, it, expect } from 'vitest';
import { readRecord } from '../../src/record/read.js';
import { renderSessionLogBody } from '../../src/record/sessionLogView.js';
import { summarySource } from '../../src/record/summaryView.js';
import { recapSource } from '../../src/record/recapView.js';

const SESSION = 'sess-2';
const CUTTER = { kind: 'text', text: 'raider cutter' };

let n = 0;
const ev = (k, { who = {}, ref = {}, d = {}, text } = {}) => {
  n += 1;
  return { id: `e${String(n).padStart(3, '0')}`, k, at: n * 1000, seq: n, s: SESSION, scene: 'sc-2',
    who: { user: who.user ?? null, actor: who.actor ?? null }, ref, d, ...(text !== undefined ? { text } : {}) };
};

/** Session 2 of the run, as far as the ship's name: set, struck, set again — and the correction it made. */
function runEvents() {
  return [
    ev('session.begun', { d: { number: 2 } }),
    // a37: !truth set "raider cutter" is named the Ashen Wake
    ev('truth.set', { who: { user: 'pl-1' }, ref: { truth: 'tr-085f5' }, d: { subject: CUTTER, fact: 'is named the Ashen Wake', by: 'player' } }),
    // a38: the fight line, its move, its telling
    ev('line', { who: { user: 'pl-1', actor: 'pc-mira' }, ref: { line: 'm38' }, d: { via: 'typed' },
      text: 'The Ashen Wake drops out of the dark off Bleakhold\'s ring. I spin the Kobayashi IV to face her and bring the guns to bear.' }),
    ev('move.resolved', { who: { actor: 'pc-mira' }, ref: { res: 'res-38' }, d: { moveId: 'enter_the_fray', moveName: 'Enter the Fray', statUsed: 'iron', outcome: 'miss' } }),
    // a48: !truth strike tr-085f5
    ev('truth.struck', { ref: { truth: 'tr-085f5' }, d: { by: 'player' } }),
    // a49: !truth set "raider cutter" is named the Cinder Wren — a name corrected
    ev('truth.set', { who: { user: 'pl-1' }, ref: { truth: 'tr-cw' }, d: { subject: CUTTER, fact: 'is named the Cinder Wren', by: 'player' } }),
    ev('name.changed', { d: { from: 'Ashen Wake', to: 'Cinder Wren', how: 'corrected', about: 'raider cutter' } }),
  ];
}

const page = (events) => ({
  pageId: `p-${SESSION}`, sessionId: SESSION, number: 2, name: 'Session 2', createdAt: 2, story: '',
  record: { v: 1, sessionId: SESSION, seq: events.length, events: Object.fromEntries(events.map(e => [e.id, e])) },
});

const read = (events, scope = { session: SESSION }) => readRecord(scope, {
  pages: [page(events)], currentSessionId: 'sess-3',
  nameOf: (id) => (id === 'pc-mira' ? 'Mira Kestrel' : null), otherNames: ['Mira Kestrel', 'Kobayashi IV'],
});

describe('a strike stays as struck — the changed name beside it (STRUCK-NAME-REWRITTEN-AS-THE-NEW-NAME)', () => {
  it('the read: the strike keeps its words, the new name rides beside it; the set truth stands with it', () => {
    const [session] = read(runEvents()).sessions;
    const strike = session.corrections.find(c => c.kind === 'strike');
    expect(strike).toMatchObject({ fact: 'is named the Ashen Wake', now: ['Cinder Wren'], replacedBy: null });
    expect(strike.subject).toMatchObject({ text: 'raider cutter' });
    expect(session.open.established.map(t => t.fact)).toEqual(['is named the Cinder Wren']);
    // Everything else is written as the new name, as before.
    expect(session.beats.find(b => b.line)?.line.text).toMatch(/^The Cinder Wren drops out of the dark/);
  });

  it('Session 2\'s Session Log page: "Struck: raider cutter — is named the Ashen Wake (now: Cinder Wren)"', () => {
    const [session] = read(runEvents()).sessions;
    const body = renderSessionLogBody(session);
    expect(body).toContain('<li>Struck: raider cutter — <s>is named the Ashen Wake</s> (now: Cinder Wren)</li>');
    expect(body).not.toContain('<s>is named the Cinder Wren</s>');
    expect(body).toContain('<strong>raider cutter</strong> — is named the Cinder Wren <em>(set by a player)</em>');
  });

  it('the summary\'s source: STRUCK BY THE TABLE names the struck name, not the one that stands', () => {
    const [session] = read(runEvents()).sessions;
    const { text } = summarySource(session);
    const struck = text.slice(text.indexOf('## STRUCK BY THE TABLE'));
    expect(struck).toContain('- raider cutter — is named the Ashen Wake (now: Cinder Wren)');
    expect(struck).not.toContain('is named the Cinder Wren');
  });

  it('the recap\'s source: the same', () => {
    const source = recapSource({ read: read(runEvents(), { session: 'campaign' }), currentSessionId: 'sess-3' });
    const struck = source.text.slice(source.text.indexOf('STRUCK BY THE TABLE'));
    expect(struck).toContain('- raider cutter — is named the Ashen Wake (now: Cinder Wren)');
    expect(struck).not.toMatch(/- raider cutter — is named the Cinder Wren/);
  });

  it('a Replace keeps its struck words and is followed by its replacement, written with the new names', () => {
    const events = [
      ev('session.begun', { d: { number: 2 } }),
      ev('truth.set', { ref: { truth: 'tr-a' }, d: { subject: CUTTER, fact: 'is named the Ashen Wake', by: 'player' } }),
      ev('truth.set', { ref: { truth: 'tr-b' }, d: { subject: CUTTER, fact: 'is named the Cinder Wren', by: 'gm', replaces: 'tr-a' } }),
      ev('truth.struck', { ref: { truth: 'tr-a' }, d: { by: 'gm', replacedBy: 'tr-b' } }),
      ev('name.changed', { d: { from: 'Ashen Wake', to: 'Cinder Wren', how: 'corrected', about: 'raider cutter' } }),
    ];
    const [session] = read(events).sessions;
    const strike = session.corrections.find(c => c.kind === 'strike');
    expect(strike).toMatchObject({ fact: 'is named the Ashen Wake', replacedBy: 'is named the Cinder Wren', now: [] });
    expect(renderSessionLogBody(session)).toContain('Struck: raider cutter — <s>is named the Ashen Wake</s> — now: is named the Cinder Wren');
  });

  it('control: a strike no change reaches says nothing beside it', () => {
    const events = [
      ev('session.begun', { d: { number: 2 } }),
      ev('truth.set', { ref: { truth: 'tr-x' }, d: { subject: CUTTER, fact: 'carries six crew', by: 'narrator' } }),
      ev('truth.struck', { ref: { truth: 'tr-x' }, d: { by: 'gm' } }),
      ev('name.changed', { d: { from: 'Ashen Wake', to: 'Cinder Wren', how: 'corrected' } }),
    ];
    const [session] = read(events).sessions;
    expect(session.corrections.find(c => c.kind === 'strike')).toMatchObject({ fact: 'carries six crew', now: [] });
    expect(renderSessionLogBody(session)).toContain('<li>Struck: raider cutter — <s>carries six crew</s></li>');
  });
});
