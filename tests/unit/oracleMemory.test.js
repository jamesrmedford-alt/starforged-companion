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
  formatOracleResultLine,
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


describe('formatOracleResultLine', () => {
  it('renders name, question, and answer', () => {
    expect(formatOracleResultLine({ name: 'Ask the Oracle (likely)', question: 'Guarded?', answer: 'YES' }))
      .toBe('Ask the Oracle (likely): "Guarded?" → YES');
  });

  it('omits the question segment when absent', () => {
    expect(formatOracleResultLine({ name: 'Pay the Price', question: '', answer: 'Your gear is damaged' }))
      .toBe('Pay the Price: → Your gear is damaged');
  });
});
