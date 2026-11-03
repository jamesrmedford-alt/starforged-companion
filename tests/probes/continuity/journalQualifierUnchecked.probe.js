/**
 * PROBE — FC-08 JOURNAL-QUALIFIER-UNCHECKED
 * (src/world/worldJournal.js parseJournalCommand / executeJournalCommand;
 *  src/index.js handleJournalCommand)
 *
 * What the user does: types a `!journal` command with a qualifier outside the
 * documented vocabulary — a slip of one letter is enough:
 *   !journal threat "Iron Raiders" resolve — they scattered
 *   !journal faction "The Iron Compact" ally — they helped us
 *   !journal lore "The Gate" confirm — it opens at dawn
 * The help lists the vocabulary: threat severity looming / active /
 * immediate / resolved; faction attitude hostile / neutral / allied /
 * unknown; lore confirmed / rumour.
 *
 * What happens: nothing checks the qualifier. The command succeeds and posts
 * "World Journal updated: threat — Iron Raiders (resolve)":
 *   - the threat is stored with severity "resolve", which is not "resolved",
 *     so it stays ACTIVE (getActiveThreats) — the narrator keeps pressing a
 *     threat the GM ended;
 *   - the faction's World Journal attitude becomes "ally", which
 *     applyAttitudeToFactionRecord cannot map, so the faction record — the
 *     canonical stance (decisions.md "Faction stance: the entity record is
 *     canonical") — keeps its old stance: the two stores disagree;
 *   - any lore qualifier but "confirmed" is a rumour: "confirm" files the
 *     GM's ruling as unconfirmed.
 *
 * What should happen: an unknown qualifier is refused with the usage line
 * (as an unknown type already is), never stored as if it were valid.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseJournalCommand, executeJournalCommand, getActiveThreats, THREAT_SEVERITIES,
} from '../../../src/world/worldJournal.js';
import { installJournalMock } from '../../helpers/fullStateFixture.js';

const cs = { currentSessionId: 'sess-1', sessionNumber: 2, factionIds: [] };
const run = (text) => executeJournalCommand(parseJournalCommand(text), cs);

let journals;
beforeEach(() => { journals = installJournalMock(); });
afterEach(() => journals.restore());

describe('!journal refuses a qualifier outside its vocabulary', () => {
  it('control: "resolved" resolves the threat', async () => {
    await run('!journal threat "Iron Raiders" active — closing in');
    await run('!journal threat "Iron Raiders" resolved — they scattered');
    expect(getActiveThreats(cs).map(t => t.name)).not.toContain('Iron Raiders');
  });

  it('"resolve" is refused, not stored as an unknown severity that keeps the threat active', async () => {
    await run('!journal threat "Iron Raiders" active — closing in');
    const result = await run('!journal threat "Iron Raiders" resolve — they scattered');
    // Today: { severity: 'resolve', … } — and the threat is still in getActiveThreats().
    expect(result === null || THREAT_SEVERITIES.includes(result.severity)).toBe(true);
  });

  it('a faction attitude outside hostile / neutral / allied / unknown is refused', async () => {
    const result = await run('!journal faction "The Iron Compact" ally — they helped us');
    // Today: { attitude: 'ally', … } in the World Journal; a faction record would keep its stance.
    expect(result === null || ['hostile', 'neutral', 'allied', 'unknown'].includes(result.attitude)).toBe(true);
  });

  it('a lore qualifier other than confirmed / rumour is refused, not filed as a rumour', async () => {
    const result = await run('!journal lore "The Gate" confirm — it opens at dawn');
    // Today: recorded with confirmed: false (a rumour).
    expect(result === null || result.confirmed === true).toBe(true);
  });
});
