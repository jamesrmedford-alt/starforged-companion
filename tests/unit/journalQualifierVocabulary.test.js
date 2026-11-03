// tests/unit/journalQualifierVocabulary.test.js
// `!journal` refuses a qualifier outside its type's vocabulary (issue #326
// W62). parseJournalCommand took any word: `threat … resolve` stored
// severity "resolve" (not "resolved"), so the threat stayed active; `faction
// … ally` stored an attitude no faction record maps, so the two stores
// disagreed; `lore … confirm` filed the GM's ruling as a rumour. An unknown
// qualifier is now refused with the usage line, as an unknown type is.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseJournalCommand, executeJournalCommand, getActiveThreats, THREAT_SEVERITIES,
} from '../../src/world/worldJournal.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const cs = { currentSessionId: 'sess-1', sessionNumber: 2, factionIds: [] };
const run = (text) => executeJournalCommand(parseJournalCommand(text), cs);

let journals;
beforeEach(() => { journals = installJournalMock(); });
afterEach(() => journals.restore());

describe('!journal refuses a qualifier outside its vocabulary (issue #326 W62)', () => {
  it('control: "resolved" resolves the threat', async () => {
    await run('!journal threat "Iron Raiders" active — closing in');
    await run('!journal threat "Iron Raiders" resolved — they scattered');
    expect(getActiveThreats(cs).map(t => t.name)).not.toContain('Iron Raiders');
  });

  it('"resolve" is refused, not stored as an unknown severity that keeps the threat active', async () => {
    await run('!journal threat "Iron Raiders" active — closing in');
    const result = await run('!journal threat "Iron Raiders" resolve — they scattered');
    // It stored { severity: 'resolve', … } — and the threat stayed in getActiveThreats().
    expect(result).toBeNull();
    expect(parseJournalCommand('!journal threat "Iron Raiders" resolve — they scattered')).toBeNull();
    expect(getActiveThreats(cs).map(t => t.name)).toContain('Iron Raiders');   // unchanged: still active
  });

  it('a faction attitude outside hostile / neutral / allied / unknown is refused', async () => {
    const result = await run('!journal faction "The Iron Compact" ally — they helped us');
    // It stored { attitude: 'ally', … }, which no faction record maps.
    expect(result).toBeNull();
  });

  it('a lore qualifier other than confirmed / rumour is refused, not filed as a rumour', async () => {
    const result = await run('!journal lore "The Gate" confirm — it opens at dawn');
    // It was recorded with confirmed: false (a rumour).
    expect(result).toBeNull();
  });
  it('control: each vocabulary word is accepted — and a location type is free text', () => {
    for (const sev of THREAT_SEVERITIES) expect(parseJournalCommand(`!journal threat Raiders ${sev} — x`)?.qualifier).toBe(sev);
    for (const att of ['hostile', 'neutral', 'allied', 'unknown']) expect(parseJournalCommand(`!journal faction Compact ${att} — x`)?.qualifier).toBe(att);
    expect(parseJournalCommand('!journal lore Gate rumour — x')?.qualifier).toBe('rumour');
    expect(parseJournalCommand('!journal lore Gate Confirmed — x')?.qualifier).toBe('confirmed');
    expect(parseJournalCommand('!journal location Bleakhold orbital-station — x')?.qualifier).toBe('orbital-station');
  });
});
