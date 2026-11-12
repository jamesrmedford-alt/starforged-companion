/**
 * STARFORGED COMPANION
 * tests/unit/recordRenamedOntoDismissedName.test.js
 *
 * Issue #345 AA55 (DISMISSED-NAME-HIDES-RENAMED-RECORD, the audit's R2F-1
 * probe). A draft card's Dismiss puts a NAME on campaignState.dismissedEntities
 * (entityExtractor handleDraftDismiss) — the help: it "tells the detector to
 * stop suggesting that name". But the relevance index leaves out every RECORD
 * whose full name is on that list (relevanceResolver indexNames — by design:
 * "Dismissed names are excluded so misclicked entities don't keep
 * returning", unit-pinned), and the hop that gives a record a vetoed name
 * never looked at the list: applyEntityRenames renamed a placeholder
 * connection onto the revealed name after checking only that no entity had
 * it. So: the narrator mentions "Sable Ortiz" in passing and the GM dismisses
 * her draft row; later the hooded figure lowers her hood — it is Sable Ortiz
 * — and her card is renamed. From then on she was invisible to the narrator:
 * asked about by name, no card of hers in the prompt, and what the narration
 * said about her filed as text, not on her card.
 *
 * Now a name a record takes comes off the Dismissed list
 * (entityExtractor.undismissRecordName) — the identity reveal's rename, and
 * the GM's own sidebar rename the rename sync copies into the record — as a
 * Make a Connection's once-dismissed name is (issue #345 AA19). The index's
 * own rule is unchanged.
 *
 * Driven end to end: the dismissal through the draft card's Dismiss button;
 * the rename through a player's @scene whose capture's detection reply
 * carries the reveal (scripted Claude replies), or the GM's sidebar rename;
 * the consequence through the next @scene's narrator request.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const FENCE = (truths = []) => `\n\`\`\`json\n${JSON.stringify({ newTruths: truths, stateChanges: [] })}\n\`\`\``;
const REVEAL = 'The hooded figure lowers her hood: it is Sable Ortiz, the salvage broker everyone talks about.';
const LATER  = 'Sable Ortiz counts her credits at the bar, one eye on the door.';
const DETECT = (patch = {}) => JSON.stringify({
  entities: [], renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
  ...patch,
});

let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
      connectionIds: [], dismissedEntities: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => {
    const user = call.userText ?? '';
    if (/ENTITY TYPES TO DETECT/.test(user)) {
      // The capture of the reveal names the placeholder's real name.
      return user.includes('lowers her hood')
        ? DETECT({ renames: [{ from: 'Hooded Figure', to: 'Sable Ortiz' }] })
        : DETECT();
    }
    if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) {
      return user.includes('What is Sable Ortiz doing now?')
        ? LATER + FENCE([{ subject: 'Sable Ortiz', fact: 'Is waiting for someone at the bar' }])
        : REVEAL + FENCE();
    }
    return '{}';
  } });
  // Earlier play: the table met a cloaked woman; her placeholder card exists.
  const gm = table.client('gm-1');
  const { createConnection } = await gm.import('../../src/entities/connection.js');
  await gm.run(() => createConnection(
    { name: 'Hooded Figure', description: 'A cloaked woman who watches the bar.', pronouns: 'she/her' },
    foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
  ));
  await table.settle();
});

const sableRecordIds = () => table.actors
  .filter(a => a?.flags?.[MODULE_ID]?.entityType === 'connection' && a.flags[MODULE_ID].connection?.name === 'Sable Ortiz')
  .map(a => a.id);
const hoodedFigure = () => table.actors
  .find(a => a?.flags?.[MODULE_ID]?.entityType === 'connection' && a.flags[MODULE_ID].connection?.name === 'Hooded Figure');
const sceneCallAbout = (re) => table.claude.calls.filter(c => c.model === NARRATION_MODEL && re.test(c.userText ?? '')).at(-1);
const dismissed = () => table.world.campaignState().dismissedEntities ?? [];

/** The narrator named these in passing; the GM pressed Dismiss on each draft row. */
async function gmDismissesDrafts(names = ['Sable Ortiz']) {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts(
    names.map(name => ({ type: 'connection', name, description: 'A salvage broker the dockhands gossip about.', confidence: 'high' })),
    game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false, actorId: 'pc-kira' },
  ));
  await table.settle();
  const [card] = table.cards(f => f.draftEntityCard);
  for (let i = 0; i < names.length; i += 1) {
    gm.click(card._id, '[data-action="sf-draft-dismiss"]');
    await table.drain();
  }
  expect([...dismissed()].sort(), 'the Dismiss landed (setup)').toEqual([...names].sort());
}

/** Pat asks who the hooded figure is; the narration reveals her, and its capture renames her card. */
async function revealHoodedFigure() {
  // The answer's capture runs 2 s after its card (narrator.js ASYNC_DETECTION_DELAY_MS).
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    await table.client('pl-1').chat('@scene Who is the hooded figure watching us?');
    await table.settle();
    await vi.advanceTimersByTimeAsync(2_100);
    await table.settle();
  } finally {
    vi.useRealTimers();
  }
  await table.drain();
  expect(sableRecordIds(), 'the placeholder card was renamed to Sable Ortiz (setup)').toHaveLength(1);
}

async function askAboutSable() {
  await table.client('pl-1').chat('@scene What is Sable Ortiz doing now?');
  await table.settle(); await table.drain();
  const call = sceneCallAbout(/What is Sable Ortiz doing now/);
  expect(call, 'the question was narrated (setup)').toBeTruthy();
  return { ...call, prompt: `${call.system ?? ''}\n${call.userText ?? ''}` };
}

function expectSableOnHerCard(call) {
  // What the narration said about her is filed under her card, not as text …
  const truth = (table.world.campaignState().sceneTruths ?? []).find(t => /waiting for someone/.test(t.fact ?? ''));
  expect(truth, 'the narration\'s truth about her was recorded (setup)').toBeTruthy();
  expect(truth.subject?.kind ?? null, 'the sidecar truth\'s subject').toBe('entity');
  expect(truth.subject?.entityId ?? null, 'filed on her card').toBe(sableRecordIds()[0]);
  // … and her card is in the narrator's ENTITIES IN SCENE when she is asked about.
  expect(call.prompt, 'her entity card').toMatch(/## SABLE ORTIZ — /);
}

describe('issue #345 AA55 — a record renamed onto a name the GM once dismissed from a draft card', () => {
  it('asked about by name, Sable Ortiz\'s card is in the narrator\'s ENTITIES IN SCENE — the reveal took her name off the Dismissed list', async () => {
    await gmDismissesDrafts();
    await revealHoodedFigure();
    expectSableOnHerCard(await askAboutSable());
    expect(dismissed(), 'her name is hers now, not dismissed').toEqual([]);
  }, 60_000);

  it('only the name the record took comes off — another dismissed name stays dismissed', async () => {
    await gmDismissesDrafts(['Sable Ortiz', 'Dock Rat Joss']);
    await revealHoodedFigure();
    expect(dismissed()).toEqual(['Dock Rat Joss']);
  }, 60_000);

  it('the GM renaming the placeholder\'s card in the sidebar onto the dismissed name — the same', async () => {
    await gmDismissesDrafts();
    const actor = hoodedFigure();
    expect(actor, 'the placeholder card (setup)').toBeTruthy();
    await table.client('gm-1').run(() => globalThis.game.actors.get(actor.id).update({ name: 'Sable Ortiz' }));
    await table.settle(); await table.drain();
    expect(sableRecordIds(), 'the record followed the sidebar rename (setup)').toEqual([actor.id]);
    expectSableOnHerCard(await askAboutSable());
    expect(dismissed(), 'her name is hers now, not dismissed').toEqual([]);
  }, 60_000);

  it('control: with no earlier dismissal the same reveal and question carry her card', async () => {
    await revealHoodedFigure();
    const call = await askAboutSable();

    expect(call.prompt).toMatch(/## SABLE ORTIZ — /);
    const truth = (table.world.campaignState().sceneTruths ?? []).find(t => /waiting for someone/.test(t.fact ?? ''));
    expect(truth?.subject?.kind ?? null).toBe('entity');
  }, 60_000);
});

let nextId = 0;

/** A JournalEntry that keeps its pages (the tests/setup.js stub keeps none). */
function makeJournal(data) {
  const id = `jrnl${String(++nextId).padStart(12, '0')}`;
  const journal = {
    id, name: data.name, folder: data.folder ?? null,
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    pages: { contents: [] },
    async createEmbeddedDocuments(_type, list) {
      return list.map((d) => {
        const page = {
          id: `page${String(++nextId).padStart(12, '0')}`,
          name: d.name, type: d.type ?? 'text', text: d.text ?? {},
          flags: JSON.parse(JSON.stringify(d.flags ?? {})),
          getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
          async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; return this; },
          async update(changes) { if (changes.text) this.text = changes.text; if (changes.name) this.name = changes.name; return this; },
        };
        journal.pages.contents.push(page);
        return page;
      });
    },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; return this; },
    async update(changes) { Object.assign(this, changes); return this; },
    async delete() { globalThis.game.journal.delete(this.id); return this; },
  };
  return journal;
}

describe('issue #345 AA55 — a faction renamed in the Journal sidebar onto a name the GM once dismissed', () => {
  let savedJournalEntry;
  beforeEach(() => {
    savedJournalEntry = globalThis.JournalEntry;
    globalThis.JournalEntry = {
      async create(data) {
        const j = makeJournal(data);
        globalThis.game.journal._set(j.id, j);
        return j;
      },
    };
  });
  afterEach(() => { globalThis.JournalEntry = savedJournalEntry; });

  /** A narration's detection naming one faction, routed as the capture routes it. */
  async function detectFaction(name) {
    const gm = table.client('gm-1');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => routeEntityDrafts(
      [{ confidence: 'high', type: 'faction', name, description: 'A smuggling cartel.' }],
      game.settings.get(MODULE_ID, 'campaignState'),
      { autoCreateConnection: false },
    ));
    await table.settle();
    return table.cards(f => f.draftEntityCard).at(-1);
  }

  /** "Ashen Hand" dismissed from one draft card; "Iron Syndicate" confirmed from the next — its journal. */
  async function dismissThenConfirm() {
    const gm = table.client('gm-1');
    gm.click((await detectFaction('Ashen Hand'))._id, '[data-action="sf-draft-dismiss"]');
    await table.drain();
    gm.click((await detectFaction('Iron Syndicate'))._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    const journal = table.journal.contents.find(j => j.flags?.[MODULE_ID]?.entityType === 'faction');
    expect(journal, 'the Confirm made the faction (setup)').toBeTruthy();
    expect(dismissed(), 'the Dismiss landed (setup)').toEqual(['Ashen Hand']);
    return journal;
  }

  /** The faction the narrator's name index resolves "Ashen Hand" to (null for none). */
  async function narratorResolves(name) {
    const gm = table.client('gm-1');
    const { collectAllEntities, resolveEntityName } = await gm.import('../../src/context/relevanceResolver.js');
    return gm.run(async () => {
      const state = game.settings.get(MODULE_ID, 'campaignState');
      return resolveEntityName(name, await collectAllEntities(state), state.dismissedEntities ?? []);
    });
  }

  it('the renamed faction is in the narrator\'s name index, its name off the Dismissed list', async () => {
    const journal = await dismissThenConfirm();
    // The GM's sidebar rename, fanned out as Foundry does.
    await journal.update({ name: 'Ashen Hand' });
    table.fireDocumentHook('gm-1', 'updateJournalEntry', journal, { name: 'Ashen Hand' });
    await table.settle(); await table.drain();
    expect(journal.pages.contents[0].flags[MODULE_ID].faction.name, 'the record followed its journal (setup)').toBe('Ashen Hand');

    expect((await narratorResolves('Ashen Hand'))?.entityType ?? null, 'the narrator resolves the name to the faction').toBe('faction');
    expect(dismissed()).toEqual([]);
  }, 60_000);

  it('a rename the world load repairs (no GM ran the live sync) does the same', async () => {
    const journal = await dismissThenConfirm();
    await journal.update({ name: 'Ashen Hand' });   // no updateJournalEntry reached a GM
    const gm = table.client('gm-1');
    const { syncEntityRecordNames } = await gm.import('../../src/entities/migrator.js');
    await gm.run(() => syncEntityRecordNames(game.settings.get(MODULE_ID, 'campaignState')));
    await table.settle(); await table.drain();
    expect(journal.pages.contents[0].flags[MODULE_ID].faction.name, 'the load repair renamed the record (setup)').toBe('Ashen Hand');

    expect((await narratorResolves('Ashen Hand'))?.entityType ?? null).toBe('faction');
    expect(dismissed()).toEqual([]);
  }, 60_000);
});
