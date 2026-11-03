// tests/unit/sessionLogLoreRetracted.test.js
// The Session Log's "Lore this session" leaves struck lore out (issue #326
// W64). writeSessionLog listed every lore entry carrying the session's id,
// retracted ones included: a fact the table struck or X-carded was recorded
// as the session's lore beside the summary that was rebuilt to leave it out.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  recordLoreDiscovery, retractSessionLore, writeSessionLog, getConfirmedLore, JOURNAL_NAMES,
} from '../../src/world/worldJournal.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const cs = { currentSessionId: 'sess-9', sessionNumber: 9 };

let journals;
beforeEach(() => { journals = installJournalMock(); });
afterEach(() => journals.restore());

const sessionLogSummary = () => journals.journals.get(JOURNAL_NAMES.sessionLog)
  .pages.contents[0].flags[MODULE_ID].sessionLogPage.summary;

describe("the End-Session log's lore list leaves struck lore out (issue #326 W64)", () => {
  it('a lore entry the table struck this session is not listed under "Lore this session"', async () => {
    await recordLoreDiscovery('The Iron Gate', { text: 'The gate opens at dawn', confirmed: true, narratorAsserted: true }, cs);
    await recordLoreDiscovery('Vance is dead', { text: 'Vance died in the reactor fire', confirmed: true, narratorAsserted: true }, cs);
    // `!truth strike` (or the X-Card) on "Vance — is dead" reaches its lore copy:
    expect(await retractSessionLore('sess-9', (e) => e.title === 'Vance is dead')).toBe(1);
    expect(getConfirmedLore(cs).map(e => e.title)).toEqual(['The Iron Gate']);   // control: out of canon

    await writeSessionLog(cs);

    // It listed ['The Iron Gate', 'Vance is dead'].
    expect(sessionLogSummary().lore).toEqual(['The Iron Gate']);
  });
  it('control: a rumour recorded this session is listed; another session\'s lore is not', async () => {
    await recordLoreDiscovery('Whispers in the vents', { text: 'Something moves in the ducts', confirmed: false }, cs);
    await recordLoreDiscovery('Old news', { text: 'From last session', confirmed: true }, { ...cs, currentSessionId: 'sess-8' });
    await writeSessionLog(cs);
    expect(sessionLogSummary().lore).toEqual(['Whispers in the vents']);
  });
});
