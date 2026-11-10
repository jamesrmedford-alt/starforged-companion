/**
 * UI-10 CHRONICLE-PIN-UNREAD (twelfth audit, ui area; PRODUCED-BUT-DEAD).
 *
 * The Chronicle panel's 📌 / 📍 button pins an entry
 * (src/character/chroniclePanel.js:178-190 → requestChronicleEdit op "pin" →
 * the canonical GM's setChronicleEntryPinned, src/character/chronicle.js:67-68),
 * and the help promises what that does — Character Management: "Pinned
 * entries always appear in the narrator's context" and "Recent chronicle
 * entries are included in every narration context packet"; the panel's own
 * header (:8) says the same. Nothing in production reads an entry's `pinned`:
 * the only chronicle reader on the narrator's side is the campaign recap
 * (narrator.js _collectAllChronicleEntries / formatRecapEntries :4819-4901),
 * which ignores it — and whose cache by design does not change on a pin (the
 * help's Previously On page). The 2026-10 audit deleted
 * getChronicleForContext, the context assembler's chronicle reader, with the
 * chronicleContextCount setting (chronicle.js:446-449); issues #306 R02 and
 * R11 then made the pin save, for a player too — onto a flag no one reads.
 *
 * Scenario: the GM's game writes Kira's automatic Chronicle entry; Kira's
 * player pins it on their Chronicle panel; the next narration is asked.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID, currentClient } from '../../helpers/multiClient.js';
import { permissionError, userOwnsDocument } from '../../helpers/foundryPermissions.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const PINNED = 'Kira swore over her sister\'s grave on Bleakhold never to fly for the Covenant.';

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

const storedEntries = () => {
  const journal = table.journal.contents.find(j => j.flags?.[MODULE_ID]?.chronicleActorId === 'pc-kira');
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
  const gm = table.client('gm-1');
  const { addChronicleEntry } = await gm.import('../../src/character/chronicle.js');
  await gm.run(() => addChronicleEntry('pc-kira', { type: 'vow', text: PINNED, automated: true, sessionId: 'sess-1' }));
  await table.settle();
});

afterEach(() => {
  for (const [, app] of rendered) app.rendered = false;
  JournalEntry.create = savedCreate;
  foundry.applications.api.ApplicationV2.prototype.render = savedRender;
});

/** Kira's player pins the entry on their own Chronicle panel. */
async function pinOnPlayersPanel() {
  const player = table.client('pl-1');
  const { openChroniclePanel } = await player.import('../../src/character/chroniclePanel.js');
  player.run(() => openChroniclePanel());
  const panel = rendered.findLast(([client]) => client === 'pl-1')[1];
  await player.run(() => panel._prepareContext());
  const entryId = storedEntries()[0].id;
  await player.run(() => panel.constructor.DEFAULT_OPTIONS.actions.togglePin.call(panel, null, { dataset: { entryId } }));
  await table.settle();
}

/** The GM asks the narrator about the scene; what it sent (system prompt and user message). */
async function nextNarrationPrompt() {
  await table.client('gm-1').chat('@scene What is Kira thinking about as the station comes into view?');
  await table.settle();
  await table.drain();
  const calls = table.claude.by('gm-1').filter(c => /@scene|thinking about/.test(c.userText));
  const call = calls.at(-1);
  return call ? `${call.system}\n${call.userText}` : '';
}

describe('UI-10: a pinned Chronicle entry reaches the narrator', () => {
  it('control: the player\'s pin is saved on the entry (through the GM)', async () => {
    await pinOnPlayersPanel();
    expect(storedEntries().map(e => [e.text, e.pinned])).toEqual([[PINNED, true]]);
  }, 60_000);

  it('the pinned entry should appear in the next narration\'s context, as the help says', async () => {
    await pinOnPlayersPanel();
    const prompt = await nextNarrationPrompt();
    expect(prompt.length).toBeGreaterThan(0);          // setup: a narration was asked
    expect(prompt).toContain(PINNED);
  }, 60_000);
});
