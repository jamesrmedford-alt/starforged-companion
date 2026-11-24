// tests/unit/sessionLogLoreRetracted.test.js
// The Session Log page lists no struck fact as the session's (issue #326 W64).
// writeSessionLog listed every lore entry carrying the session's id, retracted
// ones included: a fact the table struck was recorded as the session's beside
// the summary rebuilt to leave it out. Since issue #382 (decision D6) the page
// holds no copied lore list at all: its "Established and standing" is the
// session record's view — the truths set and not struck, read with the
// table's corrections — and a strike is named under "Corrected by the table".
// Through the real `!truth` command and the real page render.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { renderSessionLog } from '../../src/record/sessionLogView.js';
import { recordSettled, _resetRecordForTests } from '../../src/record/record.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { getRollingSessionSummary } from '../../src/narration/narrator.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { citedSummaryReply } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-9';

let journals;
beforeEach(() => {
  journals = installJournalMock();
  _resetRecordForTests();
  game.user = { isGM: true, id: 'test-user-gm' };
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 9, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
  });
});
afterEach(() => {
  journals.restore();
  game.settings._store.delete(KEY);
});

const page = () => journals.journals.get(JOURNAL_NAMES.sessionLog)?.pages.contents
  .find(p => p.flags?.[MODULE_ID]?.sessionLogPage?.sessionId === SESSION) ?? null;
const section = (html, heading) => {
  const at = html.indexOf(`<h3>${heading}</h3>`);
  if (at < 0) return '';
  const next = html.indexOf('<h3>', at + 1);
  return html.slice(at, next < 0 ? undefined : next);
};

async function settledPage() {
  await recordSettled();
  await renderSessionLog(SESSION);
  return page()?.text?.content ?? '';
}

describe('the Session Log lists no struck fact as the session\'s (issue #326 W64)', () => {
  it('a truth the table struck this session is not "Established and standing" — it is named as struck', async () => {
    await applyFactContinuityCommand({ text: '!truth set "The Iron Gate" opens at dawn' }, { requesterIsGM: true });
    await applyFactContinuityCommand({ text: '!truth set Vance is dead' }, { requesterIsGM: true });
    const vance = game.settings.get(MODULE_ID, 'campaignState').sceneTruths.find(t => /dead/.test(t.fact));
    await applyFactContinuityCommand({ text: `!truth strike ${vance.id}` }, { requesterIsGM: true });

    const html = await settledPage();
    expect(section(html, 'Established and standing')).toContain('opens at dawn');
    expect(section(html, 'Established and standing')).not.toContain('is dead');
    expect(section(html, 'Corrected by the table')).toMatch(/Struck: .*<s>is dead<\/s>/);
  });

  it('the page\'s "Session summary" is the session summary — a view of the record — and copies no lore list (decision D6)', async () => {
    await applyFactContinuityCommand({ text: '!truth set "The Iron Gate" opens at dawn' }, { requesterIsGM: true });
    await settledPage();
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true, status: 200, text: async () => '',
      json: async () => ({ content: [{ type: 'text', text: citedSummaryReply(['The crew waited for dawn at the Iron Gate.']) }], usage: {} }),
    }));
    try {
      await getRollingSessionSummary(game.settings.get(MODULE_ID, 'campaignState'), { forceRefresh: true });
    } finally {
      fetch.mockRestore();
      game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    }
    const html = await settledPage();

    expect(page().flags[MODULE_ID].sessionLogPage.summary ?? null).toBeNull();   // nothing is copied onto the page's flag
    expect(page().flags[MODULE_ID].sessionRecord.views.summary.text).toBe('The crew waited for dawn at the Iron Gate.');
    expect(section(html, 'Session summary')).toContain('waited for dawn');
    expect(section(html, 'Established and standing')).toContain('opens at dawn');
  });
});
