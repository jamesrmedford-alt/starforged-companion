/**
 * STARFORGED COMPANION
 * tests/unit/keepMakesItBinding.test.js
 *
 * Overhaul 2, slice 3 (§5.3 "Raised", §5.7, D7) — colour binds when the table
 * takes it up: a GM's Keep (the correction dialog's button on a colour row,
 * ledgers.js confirmTruth) or a later fact block's restatement whose tag the
 * floor bears out. Each is a ledger save; the save's merge keeps the rise
 * (sceneLifecycle.js mergeSceneLedgers — it kept the store's entry whole),
 * and the record sees it as `truth.confirmed` (ledgerDiff.js), which the read
 * applies on the beat that set the truth. There is no lexical "uptake" test
 * of later lines: "I give up on the pilot for a moment" names the pilot.
 */

import { describe, it, expect } from 'vitest';
import { confirmTruth } from '../../src/factContinuity/ledgers.js';
import { mergeSceneLedgers } from '../../src/factContinuity/sceneLifecycle.js';
import { ledgerEvents } from '../../src/record/ledgerDiff.js';
import { readRecord } from '../../src/record/read.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';

const colour = () => ({ id: 't1', subject: { kind: 'text', text: 'Tamsin Vey' }, fact: 'runs the ledger stall', retracted: false,
  asserter: 'narrator', basis: 'narrator', narrationId: 'nar-1', said: ['nar-1'], createdAt: 1 });
const state = (truths) => ({ currentSessionId: 's1', currentSceneId: 'sc-1', sceneTruths: truths, sceneState: { bySubject: {}, sceneId: 'sc-1' } });

describe('overhaul 2 §5.3 — a GM\'s Keep raises colour to bind', () => {
  it('confirmTruth: the GM\'s alone, colour alone, a retracted truth never', () => {
    const cs = state([colour()]);
    expect(confirmTruth('t1', cs, { isGM: false })).toBeNull();
    expect(confirmTruth('t1', cs, { isGM: true })).toMatchObject({ id: 't1', basis: 'gm' });
    expect(buildLedgerBlock(cs).binds).toContain('Tamsin Vey — runs the ledger stall (the GM)');
    expect(confirmTruth('t1', cs, { isGM: true })).toBeNull();                 // already binding
    expect(confirmTruth('t2', cs, { isGM: true })).toBeNull();
    const struck = state([{ ...colour(), retracted: true }]);
    expect(confirmTruth('t1', struck, { isGM: true })).toBeNull();
  });

  it('the save keeps the rise: the merge carries a raised basis and the narrations that said it', () => {
    const latest = state([colour()]);
    const working = state([{ ...colour(), basis: 'gm', confirmedAt: 5, said: ['nar-2', 'nar-1'] }]);
    mergeSceneLedgers(working, latest);
    expect(working.sceneTruths[0]).toMatchObject({ basis: 'gm', said: ['nar-2', 'nar-1'] });
    // Nothing lowers a binding truth: a stale copy's colour does not.
    const bound = state([{ ...colour(), basis: 'player' }]);
    const stale = state([colour()]);
    mergeSceneLedgers(stale, bound);
    expect(stale.sceneTruths[0].basis).toBe('player');
  });

  it('the record sees it as truth.confirmed, and the read establishes it on its own beat', () => {
    const before = state([colour()]);
    const after = state([{ ...colour(), basis: 'gm' }]);
    const events = ledgerEvents(before, after);
    expect(events).toEqual([{ kind: 'truth.confirmed', payload: { session: 's1', scene: 'sc-1', ref: { truth: 't1' }, d: { basis: 'gm', by: 'gm' } } }]);

    let n = 0;
    const ev = (k, ref, d, text) => ({ id: `e${++n}`, k, at: n, seq: n, s: 's1', scene: 'sc-1', who: { user: null, actor: 'pc-mira' }, ref, d, ...(text ? { text } : {}) });
    const recorded = [
      ev('session.begun', {}, { number: 1 }),
      ev('narration', { nar: 'nar-1' }, { mode: 'paced', actorId: 'pc-mira' }, 'Tamsin runs her stall.'),
      ev('truth.set', { truth: 't1', nar: 'nar-1' }, { subject: { kind: 'text', text: 'Tamsin Vey' }, fact: 'runs the ledger stall', by: 'narrator', basis: 'narrator' }),
    ];
    const source = (events2) => ({ pages: [{ pageId: 'p', sessionId: 's1', number: 1, name: 'Session 1', createdAt: 1, story: '',
      record: { v: 1, sessionId: 's1', seq: n, events: Object.fromEntries(events2.map(e => [e.id, e])), views: {} } }], currentSessionId: 's1', nameOf: () => null, otherNames: [] });
    expect(readRecord({ session: 's1' }, source(recorded)).sessions[0].open.established).toEqual([]);
    const kept = [...recorded, ev('truth.confirmed', { truth: 't1' }, { basis: 'gm', by: 'gm' })];
    expect(readRecord({ session: 's1' }, source(kept)).sessions[0].open.established).toEqual([
      expect.objectContaining({ fact: 'runs the ledger stall', basis: 'gm' }),
    ]);
  });
});
