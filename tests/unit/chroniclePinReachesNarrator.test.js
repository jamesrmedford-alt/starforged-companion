/**
 * STARFORGED COMPANION
 * tests/unit/chroniclePinReachesNarrator.test.js
 *
 * Issue #345 AA07 CHRONICLE-PIN-UNREAD (the twelfth audit's UI-9;
 * PRODUCED-BUT-DEAD).
 *
 * The Chronicle panel's 📌 / 📍 button pins an entry (chroniclePanel.js →
 * requestChronicleEdit op "pin" → the canonical GM's setChronicleEntryPinned),
 * and the help promises what that does — Character Management: "Pinned
 * entries always appear in the narrator's context"; the panel's own header
 * said the same. Nothing in production read an entry's `pinned`: the only
 * chronicle reader on the narrator's side is the campaign recap, which
 * ignores it (and whose cache by design does not change on a pin). The
 * 2026-10 audit deleted getChronicleForContext — the context assembler's
 * chronicle reader, pinned entries first — with the chronicleContextCount
 * setting; issues #306 R02 and R11 then made the pin save, for a player too,
 * onto a flag no one read. buildNarratorExtras now reads every PC's pinned
 * entries (the newest five, each clipped) and each CHARACTER block carries
 * its own PC's.
 *
 * Production entry points: the GM's game writes the automatic Chronicle
 * entry; the player pins it on their own Chronicle panel (relayed to the GM);
 * the next narration is a typed `@scene` (run on the keyed GM); Claude is
 * answered by the harness. The round's rendering is checked on the prompt
 * builder directly.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID, currentClient } from '../helpers/multiClient.js';
import { permissionError, userOwnsDocument } from '../helpers/foundryPermissions.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';

const PINNED = 'Kira swore over her sister\'s grave on Bleakhold never to fly for the Covenant.';
const UNPINNED = 'Kira traded her mother\'s compass for a working nav-core.';

let table;
let savedCreate;
let savedRender;
let rendered;

/** JournalEntry.create as Foundry does it: the creator owns it; page writes fire updateJournalEntryPage everywhere. */
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

const storedEntries = (actorId = 'pc-kira') => {
  const journal = table.journal.contents.find(j => j.flags?.[MODULE_ID]?.chronicleActorId === actorId);
  return journal?.pages.contents[0]?.flags?.[MODULE_ID]?.chronicle ?? [];
};

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 60_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    'factContinuity.consistencyCheck': false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-2', sessionNumber: 2, characterIds: ['pc-kira'] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  savedCreate = JournalEntry.create;
  JournalEntry.create = permissionFaithfulJournals();
  const { ApplicationV2 } = foundry.applications.api;
  savedRender = ApplicationV2.prototype.render;
  rendered = [];
  ApplicationV2.prototype.render = function () { this.rendered = true; rendered.push([currentClient()?.id, this]); };

  // The GM's game writes Kira's automatic entry: the Chronicle exists, the GM's.
  await addEntry('pc-kira', PINNED);
});

afterEach(() => {
  for (const [, app] of rendered) app.rendered = false;
  JournalEntry.create = savedCreate;
  foundry.applications.api.ApplicationV2.prototype.render = savedRender;
});

/** The GM's game writes an automatic Chronicle entry. */
async function addEntry(actorId, text) {
  const gm = table.client('gm-1');
  const { addChronicleEntry } = await gm.import('../../src/character/chronicle.js');
  await gm.run(() => addChronicleEntry(actorId, { type: 'moment', text, automated: true, sessionId: 'sess-1' }));
  await table.settle();
}

/** The canonical GM pins (or unpins) the entry with `text` — what the panel's relayed pin applies. */
async function pinOnGm(actorId, text, pinned = true) {
  const gm = table.client('gm-1');
  const { setChronicleEntryPinned } = await gm.import('../../src/character/chronicle.js');
  const entryId = storedEntries(actorId).find(e => e.text === text).id;
  await gm.run(() => setChronicleEntryPinned(actorId, entryId, pinned));
  await table.settle();
}

/** Kira's player pins the entry on their own Chronicle panel. */
async function pinOnPlayersPanel(entryId = storedEntries()[0].id) {
  const player = table.client('pl-1');
  const { openChroniclePanel } = await player.import('../../src/character/chroniclePanel.js');
  player.run(() => openChroniclePanel());
  const panel = rendered.findLast(([client]) => client === 'pl-1')[1];
  await player.run(() => panel._prepareContext());
  await player.run(() => panel.constructor.DEFAULT_OPTIONS.actions.togglePin.call(panel, null, { dataset: { entryId } }));
  await table.settle();
}

/** The GM asks the narrator about the scene; the CHARACTER blocks it sent, and the whole prompt. */
async function nextNarration(question = 'What is Kira thinking about as the station comes into view?') {
  const before = table.claude.by('gm-1').length;
  await table.client('gm-1').chat(`@scene ${question}`);
  await table.settle();
  await table.drain();
  const call = table.claude.by('gm-1').slice(before).find(c => /PLAYER QUESTION/.test(c.userText ?? ''));
  const system = call?.system ?? '';
  return {
    prompt: call ? `${system}\n${call.userText}` : '',
    characters: system.split('\n\n---\n\n').filter(s => s.startsWith('## CHARACTER')),
  };
}

describe('issue #345 AA07 — a pinned Chronicle entry reaches the narrator', () => {
  it('control: the player\'s pin is saved on the entry (through the GM)', async () => {
    await pinOnPlayersPanel();
    expect(storedEntries().map(e => [e.text, e.pinned])).toEqual([[PINNED, true]]);
  }, 60_000);

  it('the pinned entry appears in the next narration\'s context — in Kira\'s CHARACTER block, as the help says', async () => {
    await pinOnPlayersPanel();
    const { prompt, characters } = await nextNarration();
    expect(prompt.length).toBeGreaterThan(0);          // setup: a narration was asked
    expect(characters).toHaveLength(1);
    expect(characters[0]).toMatch(/Name: Kira/);
    expect(characters[0]).toContain(`Pinned in their Chronicle (moments the player wants kept in mind):\n  - ${PINNED}`);
  }, 60_000);

  it('control: an entry nobody pinned stays out — and one unpinned leaves', async () => {
    await addEntry('pc-kira', UNPINNED);
    await pinOnGm('pc-kira', PINNED);
    await pinOnGm('pc-kira', PINNED, false);
    const { prompt } = await nextNarration();
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).not.toContain(PINNED);
    expect(prompt).not.toContain(UNPINNED);
  }, 60_000);

  it('bounded: the five newest pins, in the Chronicle\'s order, each on one clipped line', async () => {
    const long = `Kira's long confession: ${'the void hums back at her '.repeat(20)}`.trim();
    const texts = ['Pin one.', 'Pin two.', 'Pin three.', 'Pin four.', 'Pin five.', long];
    for (const t of texts) await addEntry('pc-kira', t);
    await pinOnGm('pc-kira', PINNED);
    for (const t of texts) await pinOnGm('pc-kira', t);

    const { characters } = await nextNarration();
    const block = characters[0] ?? '';
    const lines = block.split('\n').filter(l => l.startsWith('  - '));
    expect(lines.slice(0, 4)).toEqual(['  - Pin two.', '  - Pin three.', '  - Pin four.', '  - Pin five.']);
    expect(lines).toHaveLength(5);
    expect(lines[4].length).toBeLessThanOrEqual(4 + 300);
    expect(lines[4].endsWith('…')).toBe(true);
    expect(block).not.toContain(PINNED);                // the oldest of six pins left the block
  }, 60_000);

  it('each CHARACTER block carries its own PC\'s pins: Ren\'s stay out of Kira\'s narration', async () => {
    table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-absent': 3 }, items: { contents: [] } });
    const REN = 'Ren still owes the Hollow Spire docks a ship.';
    await addEntry('pc-ren', REN);
    await pinOnGm('pc-ren', REN);
    await pinOnGm('pc-kira', PINNED);

    const { prompt, characters } = await nextNarration();
    expect(characters).toHaveLength(1);
    expect(characters[0]).toMatch(/Name: Kira/);
    expect(characters[0]).toContain(PINNED);
    expect(prompt).not.toContain(REN);
  }, 60_000);
});

describe('issue #345 AA07 — a round\'s CHARACTER blocks each carry their PC\'s pins', () => {
  it('two acting PCs: each block lists its own pinned entries, none of the other\'s', () => {
    const kira = { actorId: 'pc-kira', name: 'Kira' };
    const ren  = { actorId: 'pc-ren', name: 'Ren' };
    const system = buildNarratorSystemPrompt({}, { narrationPerspective: 'third_person' }, null, '', {
      mode: 'round_resolution',
      roundCharacters: [kira, ren],
      pinnedChronicle: { 'pc-kira': ['Kira never flies for the Covenant.'], 'pc-ren': ['Ren owes the docks a ship.'] },
    });
    const blocks = system.split('\n\n---\n\n').filter(s => s.startsWith('## CHARACTER'));
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('  - Kira never flies for the Covenant.');
    expect(blocks[0]).not.toContain('Ren owes the docks a ship.');
    expect(blocks[1]).toContain('  - Ren owes the docks a ship.');
    expect(blocks[1]).not.toContain('Kira never flies for the Covenant.');
  });

  it('control: no pins, no pinned line', () => {
    const system = buildNarratorSystemPrompt({}, {}, { actorId: 'pc-kira', name: 'Kira' }, '', { mode: 'paced_narrative', pinnedChronicle: {} });
    expect(system).toMatch(/## CHARACTER\nName: Kira/);
    expect(system).not.toContain('Pinned in their Chronicle');
  });
});
