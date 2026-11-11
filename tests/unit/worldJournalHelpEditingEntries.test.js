/**
 * STARFORGED COMPANION
 * tests/unit/worldJournalHelpEditingEntries.test.js
 *
 * Issue #345 AA69 (WJ-HELP-ANNOTATIONS-DELETED, the audit's UI-5 probe;
 * DOC-DRIFT). The in-game help's World Journal page ended with an
 * "Annotations" section:
 *   "Any player can annotate any world journal entry. Annotations are marked
 *    with your name and date. The module's auto-generated content is fully
 *    editable — this is your world record."
 * Neither held. The annotation feature is gone (`annotateEntry` and its
 * writes were deleted as dead surface — known-issues AUDIT-DEAD-SURFACE), and
 * the journals are created with no player ownership. And an entry's page body
 * is a rendering of its record flag, by decision (decisions.md V31: "a
 * rendered mirror of its record ... as the World Journal's pages are"): the
 * narrator reads the flag, and every write of the entry re-renders the page,
 * so a GM's edit of the page text reaches nothing and is erased by the next
 * write.
 *
 * Now the help says what happens: an edit typed into a page reaches nothing
 * and is replaced; corrections go through `!journal` (or the panel); there
 * are no annotations.
 *
 * Probe adaptation: the probe's "some production code writes an annotation"
 * and "a GM's page edit should stand" asserted the false promise (the second
 * against V31, as the refuter pass notes); they are inverted into the help's
 * new claims and the decided behaviour it now describes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PAGES } from '../../src/help/helpJournal.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { recordLoreDiscovery, promoteLoreToConfirmed, getConfirmedLore, JOURNAL_NAMES } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';

const wjHelp = () => PAGES.find(p => p.name === 'World Journal').text.content;

describe('issue #345 AA69 — the help\'s World Journal page says what editing an entry does', () => {
  it('promises no annotations and no editable pages', () => {
    expect(wjHelp()).not.toMatch(/can annotate|Annotations are marked/i);
    expect(wjHelp()).not.toMatch(/fully editable/i);
    expect(wjHelp()).toMatch(/There are no annotations/);
  });

  it('says a page edit does not reach the narrator and is replaced, and that !journal is the way to correct an entry', () => {
    const editing = wjHelp().split('<h3>Editing entries</h3>')[1] ?? '';
    expect(editing, 'an "Editing entries" section').not.toBe('');
    expect(editing).toMatch(/narrator reads the record, not the page/);
    expect(editing).toMatch(/replaced by the entry&rsquo;s next update/);
    expect(editing).toMatch(/<code>!journal<\/code>/);
  });

  describe('what it describes', () => {
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

    it('a GM\'s edit of the entry\'s page reaches nothing the narrator reads, and the next write of the entry replaces it', async () => {
      const cs = game.settings.get(MODULE_ID, 'campaignState');
      await recordLoreDiscovery('The Iron Choir', { text: 'Shipwrights who sing to reactors.', narratorAsserted: true }, cs);
      // The GM edits the page in Foundry's journal sheet.
      await lorePage('The Iron Choir').update({ text: { format: 1, content: '<p>GM: the Choir are a front for the Covenant.</p>' } });
      await promoteLoreToConfirmed('The Iron Choir', cs, { byNarrator: true });

      expect(getConfirmedLore(cs).find(e => e.title === 'The Iron Choir').text, 'the narrator reads the record').toBe('Shipwrights who sing to reactors.');
      expect(lorePage('The Iron Choir').text.content, 'the page re-rendered from the record').not.toContain('a front for the Covenant');
      expect(lorePage('The Iron Choir').text.content).toContain('Shipwrights who sing to reactors.');
    });
  });
});
