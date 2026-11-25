/**
 * STARFORGED COMPANION
 * tests/unit/auditReadsWhatBinds.test.js
 *
 * Overhaul 2, slice 3 (§5.7–5.8, D15) — the consistency audit and the views
 * read what binds alone:
 *
 *   - the audit is given THE PLACE (the characters' and the ship's, by the
 *     table's record), WHAT BINDS, CORRECTED, STANDING NOW and the recorded
 *     identities — never what the narration described, which a later
 *     narration may change without contradicting anything; its `frame` and
 *     `ship` kinds are one, `place`, whose review card points at `!at`;
 *   - a session's established truths, and so the summary's, the recap's, the
 *     Session Log's and the Chronicle's facts, are the binding ones,
 *     labelled by what they rest on; the record keeps colour on its beat;
 *   - WHERE THINGS STAND tells binding state only.
 */

import { describe, it, expect } from 'vitest';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { buildAuditPrompt, parseAuditResponse, describeContradiction } from '../../src/factContinuity/consistencyCheck.js';
import { readRecord } from '../../src/record/read.js';
import { beatFacts, standingLines } from '../../src/record/recapView.js';

const scene = () => ({
  currentSessionId: 's1', currentSceneId: 'sc-1',
  sceneFrame: { sceneId: 'sc-1', location: 'the market deck', present: ['Tamsin Vey'], situation: 'Tamsin weighs it', narrationId: 'n1' },
  sceneTruths: [
    { id: 't1', subject: { kind: 'text', text: 'Tamsin Vey' }, fact: 'holds the manifest', basis: 'player', retracted: false, createdAt: 1 },
    { id: 't2', subject: { kind: 'text', text: 'Tamsin Vey' }, fact: 'wears a copper earring', basis: 'narrator', retracted: false, createdAt: 2, said: ['n1'] },
  ],
  sceneState: { sceneId: 'sc-1', bySubject: { 'tamsin vey': [
    { attribute: 'location', value: 'her ledger stall', basis: 'player', updatedAt: 1 },
    { attribute: 'mood', value: 'wary', basis: 'narrator', updatedAt: 2, narrationId: 'n1' },
  ] } },
});

describe('overhaul 2 §5.8 — the audit reads what binds', () => {
  it('the prompt holds what binds and standing state, never the narration\'s colour or its Where', () => {
    const ledger = buildLedgerBlock(scene(), { maxTokens: Infinity });
    const prompt = buildAuditPrompt(ledger.binds, ledger.standing, 'Tamsin, earring gone, shrugs.', { place: ledger.place, corrections: ledger.corrections });
    expect(prompt).toContain('WHAT BINDS (what the player said, the dice decided or the GM set):');
    expect(prompt).toContain('Tamsin Vey — holds the manifest (the player)');
    expect(prompt).toContain('STANDING NOW:');
    expect(prompt).toContain('location: her ledger stall');
    expect(prompt).not.toContain('copper earring');
    expect(prompt).not.toContain('mood: wary');
    expect(prompt).not.toContain('the market deck');
    expect(prompt).toContain('"kind": "truth" | "state" | "place" | "retraction" | "identity"');
  });

  it('the frame and ship kinds are one: place', () => {
    const [frame, ship, state] = parseAuditResponse(JSON.stringify({ contradictions: [
      { subject: 'scene', violated: 'x', evidence: 'y', kind: 'frame', confidence: 'high' },
      { subject: 'ship', violated: 'x', evidence: 'y', kind: 'ship', confidence: 'high' },
      { subject: 'Tamsin Vey', violated: 'location', evidence: 'y', kind: 'state', confidence: 'high' },
    ] }));
    expect([frame.kind, ship.kind, state.kind]).toEqual(['place', 'place', 'state']);
  });

  it('a standing line\'s basis label is no part of the value a review card shows', () => {
    const ledger = buildLedgerBlock(scene(), { maxTokens: Infinity });
    const shown = describeContradiction({ subject: 'tamsin vey', violated: 'location', evidence: 'on the dock', kind: 'state' }, scene(), ledger);
    expect(shown.recorded).toBe('location: her ledger stall');
  });
});

describe('overhaul 2 §5.7 — the views tell what binds, labelled by what it rests on', () => {
  let n = 0;
  const ev = (k, ref, d, text) => ({ id: `e${++n}`, k, at: n, seq: n, s: 's1', scene: 'sc-1', who: { user: null, actor: 'pc-mira' }, ref, d, ...(text ? { text } : {}) });
  const source = (events) => ({ pages: [{ pageId: 'p', sessionId: 's1', number: 1, name: 'Session 1', createdAt: 1, story: '',
    record: { v: 1, sessionId: 's1', seq: n, events: Object.fromEntries(events.map(e => [e.id, e])), views: {} } }],
  currentSessionId: 's1', nameOf: () => 'Mira Kestrel', otherNames: ['Mira Kestrel'] });

  it('colour stays on its beat; established and the beat\'s facts are what binds; an old narrator truth reads as colour', () => {
    const events = [
      ev('session.begun', {}, { number: 1 }),
      ev('line', { line: 'm1' }, { via: 'typed' }, 'I leave the cargo manifest with Tamsin for safekeeping.'),
      ev('narration', { nar: 'n1' }, { mode: 'paced', actorId: 'pc-mira' }, 'Tamsin tucks it under her ledger.'),
      ev('truth.set', { truth: 't1', nar: 'n1' }, { subject: { kind: 'text', text: 'Tamsin Vey' }, fact: 'holds the manifest', by: 'narrator', basis: 'player' }),
      ev('truth.set', { truth: 't2', nar: 'n1' }, { subject: { kind: 'text', text: 'Tamsin Vey' }, fact: 'wears a copper earring', by: 'narrator', basis: 'narrator' }),
      ev('truth.set', { truth: 't3', nar: 'n1' }, { subject: { kind: 'text', text: 'the lamps' }, fact: 'burn amber', by: 'narrator' }),
      ev('truth.set', { truth: 't4' }, { subject: { kind: 'text', text: 'raider cutter' }, fact: 'is named the Cinder Wren', by: 'gm' }),
    ];
    const session = readRecord({ session: 's1' }, source(events)).sessions[0];
    expect(session.open.established.map(t => [t.fact, t.basis])).toEqual([['holds the manifest', 'player'], ['is named the Cinder Wren', 'gm']]);
    const facts = session.beats.map(beatFacts).join('\n');
    expect(facts).toContain('established (said by the player): Tamsin Vey — holds the manifest');
    expect(facts).toContain('established (the GM): raider cutter — is named the Cinder Wren');
    expect(facts).not.toContain('copper earring');
    expect(facts).not.toContain('burn amber');
  });

  it('WHERE THINGS STAND tells binding state only', async () => {
    const lines = await standingLines(scene());
    expect(lines.join('\n')).toContain('location: her ledger stall');
    expect(lines.join('\n')).not.toContain('mood: wary');
  });
});
