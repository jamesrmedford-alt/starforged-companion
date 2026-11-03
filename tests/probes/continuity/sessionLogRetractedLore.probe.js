/**
 * PROBE — FC-12 SESSION-LOG-RETRACTED-LORE
 * (src/world/worldJournal.js writeSessionLog)
 *
 * What the user does: during a session the GM strikes a fact (`!truth
 * strike`), or a player plays the X-Card on a narration; the strike / X-Card
 * reaches the auto-confirmed World Journal lore that copied the fact
 * (propagateRetraction → retractSessionLore marks it retracted and
 * unconfirmed). Then someone ends the session.
 *
 * What happens: End a Session writes the Session Log's "Session summary"
 * (writeSessionLog). Its "Lore this session" list takes EVERY lore entry with
 * this session's id — `readEntries(...).filter(e => e.sessionId ===
 * sessionId)` — retracted ones included, so the struck (or X-carded) fact's
 * title is listed as this session's lore in the durable record, beside the
 * story-so-far summary that was rebuilt to leave it out.
 *
 * What should happen: a retracted entry is out of the session's lore list,
 * as it is out of ESTABLISHED LORE (getConfirmedLore) and the pending queue
 * (getNarratorAssertedLore) — "A struck fact stays struck" (help, Fact
 * Continuity); decisions.md "A strike reaches every copy of the fact".
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  recordLoreDiscovery, retractSessionLore, writeSessionLog, getConfirmedLore, JOURNAL_NAMES,
} from '../../../src/world/worldJournal.js';
import { installJournalMock } from '../../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const cs = { currentSessionId: 'sess-9', sessionNumber: 9 };

let journals;
beforeEach(() => { journals = installJournalMock(); });
afterEach(() => journals.restore());

const sessionLogSummary = () => journals.journals.get(JOURNAL_NAMES.sessionLog)
  .pages.contents[0].flags[MODULE_ID].sessionLogPage.summary;

describe("the End-Session log's lore list leaves struck lore out", () => {
  it('a lore entry the table struck this session is not listed under "Lore this session"', async () => {
    await recordLoreDiscovery('The Iron Gate', { text: 'The gate opens at dawn', confirmed: true, narratorAsserted: true }, cs);
    await recordLoreDiscovery('Vance is dead', { text: 'Vance died in the reactor fire', confirmed: true, narratorAsserted: true }, cs);
    // `!truth strike` (or the X-Card) on "Vance — is dead" reaches its lore copy:
    expect(await retractSessionLore('sess-9', (e) => e.title === 'Vance is dead')).toBe(1);
    expect(getConfirmedLore(cs).map(e => e.title)).toEqual(['The Iron Gate']);   // control: out of canon

    await writeSessionLog(cs);

    // Today: ['The Iron Gate', 'Vance is dead'].
    expect(sessionLogSummary().lore).toEqual(['The Iron Gate']);
  });
});
