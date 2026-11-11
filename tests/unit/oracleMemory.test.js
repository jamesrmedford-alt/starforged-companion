/**
 * STARFORGED COMPANION
 * tests/unit/oracleMemory.test.js
 *
 * Raw oracle-result memory (narrator-context audit 2026-07): the append ring
 * on campaignState.recentOracles, its session-scoped read, and the prompt
 * line formatter. Pure JS — no Foundry globals.
 */

import { describe, it, expect } from 'vitest';

import {
  RECENT_ORACLE_CAP,
  recordOracleResult,
  readRecentOracleResults,
  dropOracleResultsOf,
  dropOracleResultsFor,
} from '../../src/oracles/oracleMemory.js';


function makeCampaignState(overrides = {}) {
  return {
    currentSessionId: 'ssn-a',
    recentOracles:    [],
    ...overrides,
  };
}


describe('recordOracleResult', () => {
  it('appends an entry stamped with the current session id', () => {
    const cs = makeCampaignState();
    const stored = recordOracleResult(cs, {
      name: 'Ask the Oracle (likely)', question: 'Is the dock guarded?', answer: 'YES',
    });
    expect(stored).not.toBeNull();
    expect(cs.recentOracles).toHaveLength(1);
    expect(cs.recentOracles[0]).toMatchObject({
      name:      'Ask the Oracle (likely)',
      question:  'Is the dock guarded?',
      answer:    'YES',
      sessionId: 'ssn-a',
    });
  });

  it('creates the ring when the field is missing (pre-migration state)', () => {
    const cs = { currentSessionId: 'ssn-a' };
    recordOracleResult(cs, { name: 'Pay the Price', answer: 'A trusted friend is put in danger' });
    expect(cs.recentOracles).toHaveLength(1);
  });

  it('ignores entries with neither name nor answer', () => {
    const cs = makeCampaignState();
    expect(recordOracleResult(cs, { question: 'anything?' })).toBeNull();
    expect(recordOracleResult(cs, null)).toBeNull();
    expect(recordOracleResult(null, { name: 'x', answer: 'y' })).toBeNull();
    expect(cs.recentOracles).toHaveLength(0);
  });

  it('caps the ring, dropping oldest first', () => {
    const cs = makeCampaignState();
    for (let i = 1; i <= RECENT_ORACLE_CAP + 3; i += 1) {
      recordOracleResult(cs, { name: `Oracle ${i}`, answer: 'YES' });
    }
    expect(cs.recentOracles).toHaveLength(RECENT_ORACLE_CAP);
    expect(cs.recentOracles[0].name).toBe('Oracle 4');
    expect(cs.recentOracles.at(-1).name).toBe(`Oracle ${RECENT_ORACLE_CAP + 3}`);
  });
});


describe('readRecentOracleResults', () => {
  it('returns only current-session entries, oldest first, up to the limit', () => {
    const cs = makeCampaignState({
      recentOracles: [
        { name: 'Old',  answer: 'NO',  sessionId: 'ssn-z' },
        { name: 'One',  answer: 'YES', sessionId: 'ssn-a' },
        { name: 'Two',  answer: 'NO',  sessionId: 'ssn-a' },
        { name: 'Three', answer: 'YES (MATCH)', sessionId: 'ssn-a' },
      ],
    });
    const out = readRecentOracleResults(cs, 2);
    expect(out.map(e => e.name)).toEqual(['Two', 'Three']);
  });

  it('tolerates junk rings and junk entries', () => {
    expect(readRecentOracleResults(null)).toEqual([]);
    expect(readRecentOracleResults({ recentOracles: 'nope' })).toEqual([]);
    const cs = makeCampaignState({
      recentOracles: [null, 42, { sessionId: 'ssn-a' }, { name: 'Real', answer: 'YES', sessionId: 'ssn-a' }],
    });
    expect(readRecentOracleResults(cs)).toEqual([
      { name: 'Real', question: '', answer: 'YES' },
    ]);
  });

  it('includes everything when no session id is set (fresh world)', () => {
    const cs = makeCampaignState({
      currentSessionId: null,
      recentOracles: [{ name: 'A', answer: 'YES', sessionId: 'ssn-old' }],
    });
    expect(readRecentOracleResults(cs)).toHaveLength(1);
  });
});




// Issue #342 Z11: a move's Pay the Price carries its move's resolution id, so
// a Burn Momentum or Improve Result that reverts the price takes it back out.
describe('dropOracleResultsOf', () => {
  it("keeps a price's resolution id and drops that resolution's entries only", () => {
    const cs = makeCampaignState();
    recordOracleResult(cs, { name: 'Pay the Price', question: 'Face Danger', answer: 'You are harmed', resolutionId: 'res-1' });
    recordOracleResult(cs, { name: 'Ask the Oracle (likely)', question: 'Is the hatch sealed?', answer: 'YES' });
    recordOracleResult(cs, { name: 'Pay the Price', question: 'Strike', answer: 'You are stressed', resolutionId: 'res-2' });
    expect(cs.recentOracles[0].resolutionId).toBe('res-1');

    const ring = cs.recentOracles;
    expect(dropOracleResultsOf(cs, 'res-1')).toBe(1);
    expect(cs.recentOracles.map(e => e.answer)).toEqual(['YES', 'You are stressed']);
    expect(ring).toHaveLength(3);                       // the old ring is not changed in place
    expect(dropOracleResultsOf(cs, 'res-1')).toBe(0);   // nothing left to drop
    expect(dropOracleResultsOf(cs, '')).toBe(0);
    expect(dropOracleResultsOf({}, 'res-2')).toBe(0);
  });
});


// Issue #345 AA01: every entry keeps the id of the card it came from, and the
// X-Card drops what its removed narrations told — by that card id (an oracle
// follow-up) or by a move's resolution (its Pay the Price).
describe('dropOracleResultsFor', () => {
  it("keeps a card id and drops the entries of the named cards and resolutions only", () => {
    const cs = makeCampaignState();
    recordOracleResult(cs, { name: 'Ask the Oracle (likely)', question: 'Is the child dead?', answer: 'YES', cardId: 'card-1' });
    recordOracleResult(cs, { name: 'Pay the Price', question: 'Face Danger', answer: 'You are harmed', resolutionId: 'res-1', cardId: 'card-2' });
    recordOracleResult(cs, { name: 'Ask the Oracle (50/50)', question: 'Is the hatch sealed?', answer: 'NO', cardId: 'card-3' });
    recordOracleResult(cs, { name: 'Pay the Price', question: 'Strike', answer: 'You are stressed', resolutionId: 'res-2' });
    expect(cs.recentOracles[0].cardId).toBe('card-1');
    expect(cs.recentOracles[3]).not.toHaveProperty('cardId');

    const ring = cs.recentOracles;
    expect(dropOracleResultsFor(cs, { cardIds: ['card-1'], resolutionIds: ['res-2'] })).toBe(2);
    expect(cs.recentOracles.map(e => e.answer)).toEqual(['You are harmed', 'NO']);
    expect(ring).toHaveLength(4);                                                // the old ring is not changed in place
    expect(dropOracleResultsFor(cs, { cardIds: ['card-1'] })).toBe(0);           // nothing left to drop
    expect(dropOracleResultsFor(cs, { cardIds: ['', null], resolutionIds: [] })).toBe(0);
    expect(dropOracleResultsFor(cs)).toBe(0);
    expect(dropOracleResultsFor(null, { cardIds: ['card-3'] })).toBe(0);
    expect(cs.recentOracles).toHaveLength(2);
  });
});
