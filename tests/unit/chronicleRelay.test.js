/**
 * STARFORGED COMPANION
 * tests/unit/chronicleRelay.test.js
 *
 * Issue #306 R11 — the automatic writer creates a character's Chronicle on the
 * GM's client with no ownership for anyone else (Foundry's default: owning the
 * PC gives no ownership of its separate journal). The player's Chronicle panel
 * offered editing, notes and pins and wrote the journal's page directly, which
 * Foundry refuses for a player. Every Chronicle edit is now applied by the
 * canonical GM ("chronicle.edit"), the Chronicle's one writer.
 *
 * And issue #306 R02's second path: two writes that both read the entries
 * before either landed each saved their own list — the later erased the
 * other's entry. An actor's writes now run one at a time.
 *
 * The harness half runs on a booted GM + player table with a
 * permission-faithful Chronicle journal (tests/helpers/foundryPermissions.js
 * rules: the creator owns it, a write by anyone else who doesn't own it is
 * refused) whose page writes fire updateJournalEntryPage on every client.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID, currentClient } from '../helpers/multiClient.js';
import { permissionError, userOwnsDocument } from '../helpers/foundryPermissions.js';
import {
  addChronicleEntry,
  getChronicleEntries,
  setChronicleEntryPinned,
  applyChronicleEditFromRelay,
} from '../../src/character/chronicle.js';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// ─────────────────────────────────────────────────────────────────────────────
// The handler and the write chain, on one client
// ─────────────────────────────────────────────────────────────────────────────

describe('chronicle.edit — the canonical GM\'s handler (issue #306 R11)', () => {
  let journals, saved;
  const owner  = { id: 'pl-1', isGM: false };
  const other  = { id: 'pl-2', isGM: false };
  const gmUser = { id: 'gm-1', isGM: true };
  const as = (user) => ({ requesterId: user.id, requester: user, requesterIsGM: user.isGM });
  const texts = async () => (await getChronicleEntries('pc-1')).map(e => e.text);

  beforeEach(async () => {
    journals = [];
    saved = { journal: game.journal, create: JournalEntry.create };
    game.journal = {
      get contents() { return [...journals]; },
      getName: (n) => journals.find(j => j.name === n) ?? null,
      [Symbol.iterator]: () => journals[Symbol.iterator](),
    };
    JournalEntry.create = async (data) => {
      const journal = {
        id: `j-${journals.length + 1}`, name: data.name, flags: data.flags ?? {}, pages: { contents: [] },
        setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = val; },
        update: async (changes) => Object.assign(journal, changes),
        createEmbeddedDocuments: async (_type, docs) => docs.map(d => {
          const page = { ...d, flags: d.flags ?? {}, setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; } };
          journal.pages.contents.push(page);
          return page;
        }),
      };
      journals.push(journal);
      return journal;
    };
    game.actors._reset();
    game.actors._set('pc-1', makeTestActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 } }));
    await addChronicleEntry('pc-1', { type: 'moment', text: 'Original.', automated: true });
  });

  afterEach(() => {
    game.journal = saved.journal;
    JournalEntry.create = saved.create;
  });

  const entryId = async () => (await getChronicleEntries('pc-1'))[0].id;

  it('the PC\'s owner edits text, pins and adds a note', async () => {
    const id = await entryId();
    expect(await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'text', entryId: id, text: '  My correction.  ' }, as(owner)))
      .toEqual({ applied: true });
    expect(await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'pin', entryId: id, pinned: true }, as(owner)))
      .toEqual({ applied: true });
    expect(await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'add', entry: { text: 'A note.', sessionId: 's1' } }, as(owner)))
      .toEqual({ applied: true });

    const entries = await getChronicleEntries('pc-1');
    expect(entries.map(e => [e.text, e.pinned, e.playerEdited])).toEqual([
      ['My correction.', true, true],
      ['A note.', false, false],
    ]);
  });

  it('a player who does not own the PC changes nothing', async () => {
    const id = await entryId();
    for (const edit of [{ op: 'text', entryId: id, text: 'Not mine.' }, { op: 'pin', entryId: id, pinned: true }, { op: 'add', entry: { text: 'Intruder.' } }]) {
      expect(await applyChronicleEditFromRelay({ actorId: 'pc-1', ...edit }, as(other))).toEqual({ applied: false, reason: 'not-owner' });
    }
    expect(await texts()).toEqual(['Original.']);
  });

  it('re-type and delete are a GM\'s; the owner is refused', async () => {
    const id = await entryId();
    expect(await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'type', entryId: id, type: 'scar' }, as(owner)))
      .toEqual({ applied: false, reason: 'gm-only' });
    expect(await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'delete', entryId: id }, as(owner)))
      .toEqual({ applied: false, reason: 'gm-only' });
    expect(await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'type', entryId: id, type: 'scar' }, as(gmUser)))
      .toEqual({ applied: true });
    expect(await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'delete', entryId: id }, as(gmUser)))
      .toEqual({ applied: true });
    expect(await texts()).toEqual([]);
  });

  it('a player\'s add is an annotation — never an automated entry or another type', async () => {
    await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'add', entry: { text: 'Forged.', type: 'scar', automated: true, moveId: 'strike' } }, as(owner));
    const added = (await getChronicleEntries('pc-1')).at(-1);
    expect([added.type, added.automated, added.moveId]).toEqual(['annotation', false, null]);
  });

  it('refuses an empty text, an unknown op and a missing entry; clamps a long text', async () => {
    const id = await entryId();
    expect((await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'text', entryId: id, text: '   ' }, as(owner))).reason).toBe('invalid');
    expect((await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'rename', entryId: id }, as(gmUser))).reason).toBe('invalid');
    expect((await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'pin', entryId: 'gone', pinned: true }, as(owner))).reason).toBe('no-entry');
    await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'text', entryId: id, text: 'x'.repeat(5000) }, as(owner));
    expect((await getChronicleEntries('pc-1'))[0].text).toHaveLength(4000);
  });

  // Issue #306 R02, second path.
  it('two appends that overlap both survive', async () => {
    const page = journals[0].pages.contents[0];
    const write = page.setFlag;
    const held = deferred();
    const entered = deferred();
    let n = 0;
    page.setFlag = async (...args) => { if (++n === 1) { entered.resolve(); await held.promise; } return write(...args); };

    const first = addChronicleEntry('pc-1', { text: 'First incoming beat.' });
    await entered.promise;
    const second = addChronicleEntry('pc-1', { text: 'Second incoming beat.' });
    held.resolve();
    await Promise.all([first, second]);

    expect(await texts()).toEqual(['Original.', 'First incoming beat.', 'Second incoming beat.']);
  });

  it('a pin that overlaps an append keeps both', async () => {
    const id = await entryId();
    const page = journals[0].pages.contents[0];
    const write = page.setFlag;
    const held = deferred();
    let n = 0;
    page.setFlag = async (...args) => { if (++n === 1) await held.promise; return write(...args); };

    const append = addChronicleEntry('pc-1', { text: 'New automatic beat.' });
    const pin    = setChronicleEntryPinned('pc-1', id, true);
    held.resolve();
    await Promise.all([append, pin]);

    const entries = await getChronicleEntries('pc-1');
    expect(entries.map(e => [e.text, e.pinned])).toEqual([['Original.', true], ['New automatic beat.', false]]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A booted table: the player's own panel, relayed to the GM
// ─────────────────────────────────────────────────────────────────────────────

describe('a player edits their GM-created Chronicle from their own panel (issue #306 R11)', () => {
  let table, savedCreate, savedRender, rendered;

  /**
   * JournalEntry.create on whichever client calls it: Foundry's default
   * ownership (the creator OWNER, everyone else NONE). A page or journal
   * write by a user who doesn't own the journal is refused; a page write
   * fires updateJournalEntryPage on every client.
   */
  function permissionFaithfulJournals() {
    return async (data) => {
      const creator = currentClient()?.user;
      const journal = {
        id: `jrn-${table.journal.size + 1}`, name: data.name, flags: structuredClone(data.flags ?? {}),
        ownership: { default: 0, [creator.id]: 3 }, pages: { contents: [] },
      };
      const assertOwner = (what, id) => {
        const user = currentClient()?.user;
        if (!userOwnsDocument(user, journal)) throw permissionError(user, 'update', what, id, 'no OWNER permission on the journal');
      };
      journal.setFlag = async (mod, key, val) => { assertOwner('JournalEntry', journal.id); (journal.flags[mod] ??= {})[key] = val; };
      journal.update  = async (changes) => { assertOwner('JournalEntry', journal.id); Object.assign(journal, changes); };
      journal.createEmbeddedDocuments = async (_type, docs) => docs.map(d => {
        assertOwner('JournalEntryPage', 'new');
        const page = { ...d, id: `${journal.id}-p${journal.pages.contents.length + 1}`, parent: journal, flags: structuredClone(d.flags ?? {}) };
        page.setFlag = async (mod, key, val) => {
          assertOwner('JournalEntryPage', page.id);
          (page.flags[mod] ??= {})[key] = structuredClone(val);
          table.fireDocumentHook(currentClient().id, 'updateJournalEntryPage', page, { flags: { [mod]: { [key]: val } } });
        };
        journal.pages.contents.push(page);
        return page;
      });
      table.journal._set(journal);
      return journal;
    };
  }

  const entries = () => {
    const journal = table.journal.contents.find(j => j.flags?.[MODULE_ID]?.chronicleActorId === 'pc-pat');
    return journal?.pages.contents[0]?.flags?.[MODULE_ID]?.chronicle ?? [];
  };

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: { chronicleAutoEntry: false } } });
    table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
    savedCreate = JournalEntry.create;
    JournalEntry.create = permissionFaithfulJournals();
    // The panel stub's render: count renders, and mark the panel rendered.
    const { ApplicationV2 } = foundry.applications.api;
    savedRender = ApplicationV2.prototype.render;
    rendered = [];
    ApplicationV2.prototype.render = function () { this.rendered = true; rendered.push([currentClient()?.id, this]); };
    // An automatic entry, written on the GM: the Chronicle exists, created by the GM.
    const gm = table.client('gm-1');
    const { addChronicleEntry: addOnGm } = await gm.import('../../src/character/chronicle.js');
    await gm.run(() => addOnGm('pc-pat', { type: 'moment', text: 'Original automatic beat.', automated: true }));
    await table.settle();
  });

  afterEach(() => {
    for (const [, app] of rendered) app.rendered = false;   // closed: the next test opens a fresh panel
    JournalEntry.create = savedCreate;
    foundry.applications.api.ApplicationV2.prototype.render = savedRender;
  });

  /** The player opens their Chronicle panel; returns it. */
  async function playerPanel() {
    const player = table.client('pl-1');
    const { openChroniclePanel } = await player.import('../../src/character/chroniclePanel.js');
    player.run(() => openChroniclePanel('pc-pat'));
    const panel = rendered.findLast(([client]) => client === 'pl-1')[1];
    await player.run(() => panel._prepareContext());
    return panel;
  }

  const action = (panel, name, entryId) => table.client('pl-1').run(() =>
    panel.constructor.DEFAULT_OPTIONS.actions[name].call(panel, null, { dataset: { entryId } }));

  it('the GM created the journal, and the player cannot write it directly — Foundry\'s default', async () => {
    const page = table.journal.contents[0].pages.contents[0];
    await expect(table.client('pl-1').run(() => page.setFlag(MODULE_ID, 'chronicle', [])))
      .rejects.toThrow(/lacks permission to update JournalEntryPage/);
  });

  it('a pin and a note from the player\'s panel are applied by the GM', async () => {
    const panel = await playerPanel();
    const [original] = entries();
    await action(panel, 'togglePin', original.id);
    await action(panel, 'addAnnotation');
    await table.settle();

    expect(entries().map(e => [e.text, e.pinned])).toEqual([
      ['Original automatic beat.', true],
      ['New annotation — click to edit.', false],
    ]);
  });

  it('the player\'s open panel re-renders when the GM applies the edit — a relay has no ack', async () => {
    const panel = await playerPanel();
    const before = rendered.filter(([client, app]) => client === 'pl-1' && app === panel).length;
    await action(panel, 'togglePin', entries()[0].id);
    await table.settle();
    const after = rendered.filter(([client, app]) => client === 'pl-1' && app === panel).length;
    expect(after).toBeGreaterThan(before + 1);      // its own render after the click, then the hook's
  });

  it('with no GM connected the edit is not saved, and the player is told', async () => {
    const panel = await playerPanel();
    await table.leave('gm-1');
    await action(panel, 'togglePin', entries()[0].id);
    await table.settle();
    expect(entries()[0].pinned).toBe(false);
    expect(table.client('pl-1').notifications.map(n => n.message).join('\n')).toMatch(/no GM is connected/);
    await table.join('gm-1');
  });
});
