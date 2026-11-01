/**
 * STARFORGED COMPANION
 * tests/unit/chroniclePanel.test.js
 *
 * Issue #306 R02 — the Chronicle panel's pin, delete and re-type mapped the
 * panel's own copy of the entries (made when it rendered) and saved that whole
 * list. An entry written after the panel opened — the automatic entry after
 * the next narration — was erased by any of the three. Each now changes one
 * entry, by id, on the entries as stored when it writes.
 *
 * The panel runs for real: its context, its HTML (on the minimal DOM of
 * tests/helpers/cardDom.js) and its action handlers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addChronicleEntry, getChronicleEntries } from '../../src/character/chronicle.js';
import { ChroniclePanelApp, openChroniclePanel } from '../../src/character/chroniclePanel.js';
import { StubElement, StubEvent, setListenerResultSink } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';

let journals, saved, pending;

beforeEach(() => {
  journals = [];
  pending = [];
  saved = { journal: game.journal, create: JournalEntry.create, user: game.user, users: game.users, document: globalThis.document };
  game.journal = {
    get contents() { return [...journals]; },
    get: (id) => journals.find(j => j.id === id) ?? null,
    getName: (n) => journals.find(j => j.name === n) ?? null,
    [Symbol.iterator]: () => journals[Symbol.iterator](),
  };
  JournalEntry.create = async (data) => {
    const journal = {
      id: `j-${journals.length + 1}`, name: data.name, flags: data.flags ?? {},
      pages: { contents: [] },
      setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = val; },
      update: async (changes) => Object.assign(journal, changes),
      createEmbeddedDocuments: async (_type, docs) => docs.map(d => {
        const page = {
          ...d, flags: d.flags ?? {},
          setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
        };
        journal.pages.contents.push(page);
        return page;
      }),
    };
    journals.push(journal);
    return journal;
  };
  game.user = { id: 'gm-1', isGM: true, active: true };
  game.users = Object.assign([game.user], { get: (id) => (id === 'gm-1' ? game.user : null) });   // the canonical GM
  game.actors._reset();
  game.actors._set('pc-1', makeTestActor({ id: 'pc-1', name: 'Kira' }));
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  setListenerResultSink(p => pending.push(p));
});

afterEach(() => {
  game.journal = saved.journal;
  JournalEntry.create = saved.create;
  game.user = saved.user;
  game.users = saved.users;
  globalThis.document = saved.document;
  setListenerResultSink(null);
});

const texts = async () => (await getChronicleEntries('pc-1')).map(e => e.text);

/** Open the panel on the current entries; then a new automatic entry is written. */
async function openThenNewEntry() {
  await addChronicleEntry('pc-1', { type: 'annotation', text: 'Original.' });
  const panel = new ChroniclePanelApp('pc-1');
  const context = await panel._prepareContext();
  await addChronicleEntry('pc-1', { type: 'moment', text: 'New automatic beat.', automated: true });
  const original = context.entries.find(e => e.text === 'Original.');
  return { panel, context, original };
}

const action = (name, panel, entryId) =>
  ChroniclePanelApp.DEFAULT_OPTIONS.actions[name].call(panel, null, { dataset: { entryId } });

describe('Chronicle panel actions keep entries written after the panel opened (issue #306 R02)', () => {
  it('pinning an older entry keeps the newer one, and pins only the chosen entry', async () => {
    const { panel, original } = await openThenNewEntry();
    await action('togglePin', panel, original.id);

    const entries = await getChronicleEntries('pc-1');
    expect(entries.map(e => e.text)).toEqual(['Original.', 'New automatic beat.']);
    expect(entries.map(e => e.pinned)).toEqual([true, false]);
  });

  it('deleting an older entry keeps the newer one', async () => {
    const { panel, original } = await openThenNewEntry();
    await action('deleteEntry', panel, original.id);
    expect(await texts()).toEqual(['New automatic beat.']);
  });

  it('re-typing an older entry from the type select keeps the newer one', async () => {
    const { panel, context, original } = await openThenNewEntry();
    const content = new StubElement('div');
    panel._replaceHTML(await panel._renderHTML(context), content);

    const select = content.querySelector(`[data-entry-id="${original.id}"] .sf-chronicle-type-select`);
    select.value = 'scar';
    select.dispatchEvent(new StubEvent('change'));
    await Promise.all(pending);

    const entries = await getChronicleEntries('pc-1');
    expect(entries.map(e => e.text)).toEqual(['Original.', 'New automatic beat.']);
    expect(entries.map(e => e.type)).toEqual(['scar', 'moment']);
  });

  it('a second pin click unpins — the write applies the pin the row showed, flipped', async () => {
    const { panel, original } = await openThenNewEntry();
    await action('togglePin', panel, original.id);
    await panel._prepareContext();                  // the panel re-renders after an action
    await action('togglePin', panel, original.id);
    expect((await getChronicleEntries('pc-1')).map(e => e.pinned)).toEqual([false, false]);
  });

  it('an entry deleted meanwhile is not brought back by a pin', async () => {
    const { panel, original } = await openThenNewEntry();
    await action('deleteEntry', panel, original.id);
    await action('togglePin', panel, original.id);
    expect(await texts()).toEqual(['New automatic beat.']);
  });
});

// Issue #321 U23 — the toolbar opened the first PC's Chronicle for every
// player not bound to a character (`game.user.character ?? getPlayerActors()[0]`).
describe("the toolbar opens the viewer's own PC's Chronicle", () => {
  let opened;
  beforeEach(() => {
    opened = [];
    vi.spyOn(ChroniclePanelApp.prototype, 'render').mockImplementation(function () { opened.push(this.actorId); });
    game.actors._setAll([
      makeTestActor({ id: 'pc-1',   name: 'Kira', ownership: { 'pl-2': 3 } }),   // the first PC
      makeTestActor({ id: 'pc-ren', name: 'Ren',  ownership: { 'pl-1': 3 } }),
    ]);
  });

  it("an unbound player who owns Ren opens Ren's, not the first PC's", () => {
    game.user = { id: 'pl-1', isGM: false, active: true, character: null };
    openChroniclePanel();
    expect(opened).toEqual(['pc-ren']);
  });

  it("a player with no PC of their own is told so, and opens no one else's", () => {
    game.user = { id: 'pl-9', isGM: false, active: true, character: null };
    const warn = vi.spyOn(ui.notifications, 'warn');
    openChroniclePanel();
    expect(opened).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/No player character found/));
  });

  it("control: the GM with no bound PC opens the first PC's", () => {
    openChroniclePanel();   // game.user is the setup's GM
    expect(opened).toEqual(['pc-1']);
  });
});

// Issue #322 V33 — the GM's type select listed the six hand-set types, but the
// automatic scribe writes 'discovery' and 'moment' entries too. With no option
// selected the select shows its first, so those entries read as "Revelation",
// and once re-typed they could not be set back (the re-type refused both).
describe("the GM's type select offers every type an entry can have (issue #322 V33)", () => {
  /** The rendered select of the entry with this text. */
  async function selectFor(text) {
    const panel = new ChroniclePanelApp('pc-1');
    const context = await panel._prepareContext();
    const content = new StubElement('div');
    panel._replaceHTML(await panel._renderHTML(context), content);
    const entry = context.entries.find(e => e.text === text);
    return { select: content.querySelector(`[data-entry-id="${entry.id}"] .sf-chronicle-type-select`), entry };
  }
  const shown = (select) => select.querySelectorAll('option').find(o => o.hasAttribute('selected'))?.textContent;

  it("a scribe's 'moment' and 'discovery' entries show as themselves, not as Revelation", async () => {
    await addChronicleEntry('pc-1', { type: 'moment', text: 'Kira held the line.', automated: true });
    await addChronicleEntry('pc-1', { type: 'discovery', text: 'A beacon in the Rift.', automated: true });
    await addChronicleEntry('pc-1', { type: 'scar', text: 'A burn across the palm.', automated: true });

    const moment = (await selectFor('Kira held the line.')).select;
    expect(moment.value).toBe('moment');                     // was 'revelation' — the first option
    expect(shown(moment)).toBe('Moment');
    const discovery = (await selectFor('A beacon in the Rift.')).select;
    expect(discovery.value).toBe('discovery');
    expect(shown(discovery)).toBe('Discovery');
    expect((await selectFor('A burn across the palm.')).select.value).toBe('scar');   // control: a listed type
  });

  it('a GM can re-type a moment to a scar and set it back', async () => {
    await addChronicleEntry('pc-1', { type: 'moment', text: 'Kira held the line.', automated: true });

    for (const type of ['scar', 'moment', 'discovery']) {
      const { select } = await selectFor('Kira held the line.');
      select.value = type;
      select.dispatchEvent(new StubEvent('change'));
      await Promise.all(pending);
      expect((await getChronicleEntries('pc-1'))[0].type, type).toBe(type);   // 'moment' / 'discovery' were refused
    }
  });

  it('every type the automatic scribe writes is offered, with a label', async () => {
    const { CHRONICLE_AUTO_TYPES, CHRONICLE_ENTRY_TYPES } = await import('../../src/character/chronicle.js');
    for (const type of CHRONICLE_AUTO_TYPES) {
      await addChronicleEntry('pc-1', { type, text: `A ${type} beat.`, automated: true });
    }
    for (const type of CHRONICLE_AUTO_TYPES) {
      expect(CHRONICLE_ENTRY_TYPES, type).toContain(type);
      const { select } = await selectFor(`A ${type} beat.`);
      expect(select.value, type).toBe(type);
      expect(shown(select), type).not.toBe(type);   // a label, not the raw id
    }
  });

  it('a stored type outside the list is shown as itself, never as the first option', async () => {
    await addChronicleEntry('pc-1', { type: 'omen', text: 'The stars dimmed.' });
    const { select } = await selectFor('The stars dimmed.');
    expect(select.value).toBe('omen');
    expect(select.querySelectorAll('option').map(o => o.value)).toContain('revelation');   // the list is still offered
  });
});
