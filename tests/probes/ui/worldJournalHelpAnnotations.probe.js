/**
 * UI-6 WJ-HELP-ANNOTATIONS-DELETED (twelfth audit, ui area; DOC-DRIFT).
 *
 * The in-game help's World Journal page (src/help/helpJournal.js PAGES,
 * "World Journal") ends with an "Annotations" section:
 *   "Any player can annotate any world journal entry. Annotations are marked
 *    with your name and date. The module's auto-generated content is fully
 *    editable — this is your world record."
 * Neither holds:
 *  - The annotation feature is gone: `annotateEntry` and its `annotations`
 *    writes were deleted as dead surface in the 2026-10 audit (known-issues
 *    AUDIT-DEAD-SURFACE); nothing in src/ writes or renders an annotation on a
 *    World Journal entry, and the journals are created with Foundry's default
 *    ownership (src/world/worldJournal.js:122-126, :1344-1347 — no player
 *    ownership), so a player has no way to edit one.
 *  - An entry's page body is a rendering of its record flag: every module
 *    write re-renders it (writeEntryPage :998-1005, upsertPage :1382-1395),
 *    and everything the narrator reads comes from the flag (readEntries
 *    :1449-1452). A GM who edits the page text changes nothing the narrator
 *    sees, and the next write of that entry erases the edit. (The page's own
 *    "How entries are created" paragraph rightly says to correct an entry
 *    with !journal.)
 * A probe in the style of the eleventh audit's Z69–Z74 doc rows, plus the
 * behaviour the "fully editable" sentence promises.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PAGES } from '../../../src/help/helpJournal.js';
import { installJournalMock } from '../../helpers/fullStateFixture.js';
import { recordLoreDiscovery, promoteLoreToConfirmed, getConfirmedLore, JOURNAL_NAMES } from '../../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const SRC = path.resolve(__dirname, '../../../src');

const wjHelp = () => PAGES.find(p => p.name === 'World Journal').text.content;

/** Production source files under src/ (Quench and the help text excluded). */
function productionSources() {
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (ent.name !== 'integration' && ent.name !== 'help') walk(p); continue; }
      if (p.endsWith('.js')) out.push(p);
    }
  };
  walk(SRC);
  return out;
}

describe('UI-6: the help\'s World Journal "Annotations" section', () => {
  it('control: the help page does promise player annotations', () => {
    expect(wjHelp()).toMatch(/Any player can annotate any world journal entry/);
  });

  it('the annotation it promises should exist: some production code writes an annotation on a World Journal entry', () => {
    const writers = productionSources()
      .filter(p => p.includes(`${path.sep}world${path.sep}`))
      .filter(p => /annotat/i.test(fs.readFileSync(p, 'utf8')))
      .map(p => path.relative(SRC, p));
    expect(writers).not.toEqual([]);
  });

  describe('"fully editable — this is your world record"', () => {
    let journals;
    beforeEach(() => {
      journals = installJournalMock();
      game.user.isGM = true;
      game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 'sess-2', sessionNumber: 2 });
    });
    afterEach(() => {
      journals.restore();
      game.settings._store.delete(`${MODULE_ID}.campaignState`);
    });

    const lorePage = (title) => game.journal.getName(JOURNAL_NAMES.lore).pages.contents.find(p => p.name === title);

    it('control: a !journal-style correction of the record reaches what the narrator reads', async () => {
      const cs = game.settings.get(MODULE_ID, 'campaignState');
      await recordLoreDiscovery('The Iron Choir', { text: 'Shipwrights who sing to reactors.', confirmed: true }, cs);
      await recordLoreDiscovery('The Iron Choir', { text: 'Shipwrights who sing to dying stars.', confirmed: true }, cs);
      expect(getConfirmedLore(cs).find(e => e.title === 'The Iron Choir').text).toBe('Shipwrights who sing to dying stars.');
    });

    it('a GM\'s edit of the entry\'s page should stand — it is erased by the next write of that entry', async () => {
      const cs = game.settings.get(MODULE_ID, 'campaignState');
      await recordLoreDiscovery('The Iron Choir', { text: 'Shipwrights who sing to reactors.', narratorAsserted: true }, cs);
      // The GM edits the page in Foundry's journal sheet.
      await lorePage('The Iron Choir').update({ text: { format: 1, content: '<p>GM: the Choir are a front for the Covenant.</p>' } });

      // A later narration's capture re-confirms the entry.
      await promoteLoreToConfirmed('The Iron Choir', cs, { byNarrator: true });

      expect(lorePage('The Iron Choir').text.content).toContain('a front for the Covenant');
    });
  });
});
