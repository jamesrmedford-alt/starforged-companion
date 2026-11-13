/**
 * STARFORGED COMPANION
 * tests/unit/trackVowLinkPanel.test.js
 *
 * Issue #353 R3 — "Let an expedition or a scene challenge be linked to a vow
 * when it is created, as a fight can be." The Progress Tracks panel — on
 * every user's toolbar — offers the open vows in its add form (any track it
 * creates) and on each open expedition's or scene challenge's row: an
 * expedition the move pipeline began has no other place to be linked. A
 * fight's vow is chosen when it is begun (its ⚔ threshold card, or the add
 * form) and is not offered on its row.
 *
 * A player's choice is relayed to the canonical GM (`progressTrack.edit`),
 * which checks the vow is open as the sheets stand and stores the link as the
 * vow's id and name. Multi-client harness: Pat clicks, the GM writes.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { StubElement } from '../helpers/cardDom.js';
import { userOwnsDocument, permissionError } from '../helpers/foundryPermissions.js';

const MODULE_ID = 'starforged-companion';
let table;
let journal;
let kira;
let savedDocument;

const vowItem = (id, name, { completed = false, flags = {} } = {}) => ({
  id, type: 'progress', name, system: { subtype: 'vow', rank: 'dangerous', current: 0, completed }, flags,
});

/** The Progress Tracks journal — the GM's (ownership NONE), permission-faithful. */
function makeTracksJournal(tracks) {
  const flags = { [MODULE_ID]: { tracks: structuredClone(tracks) } };
  const j = {
    id: 'pt-journal', name: 'Starforged Progress Tracks', ownership: { default: 0 },
    getFlag: (mod, key) => flags[mod]?.[key],
    async setFlag(mod, key, value) {
      const user = globalThis.game?.user;
      if (!userOwnsDocument(user, j)) throw permissionError(user, 'update', 'JournalEntry', j.id, 'needs OWNER permission');
      flags[mod] ??= {};
      flags[mod][key] = structuredClone(value);
    },
  };
  return j;
}

const stored = () => journal.getFlag(MODULE_ID, 'tracks');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  await table.reset({ world: { settings: { campaignState: { sessionActive: true, clocks: [] } } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [
    vowItem('bg-kira', 'Avenge the Iron Hollow'),
    vowItem('v-beacon', 'Find the lost beacon', { flags: { [MODULE_ID]: { vowId: 'v-beacon' } } }),
  ] } });
  journal = makeTracksJournal([
    { id: 'exp-1', label: 'Toward the gap', type: 'expedition', rank: 'dangerous', ticks: 4, completed: false, createdAt: 1 },
    { id: 'fight-1', label: 'Corsairs', type: 'combat', rank: 'dangerous', ticks: 0, completed: false, createdAt: 2 },
  ]);
  table.journal.set(journal.id, journal);
});

afterEach(() => { globalThis.document = savedDocument; });

/** Run a panel action on `userId`'s client against `app` (its element stubbed by the test). */
async function click(userId, action, dataset, app) {
  const client = table.client(userId);
  const { ProgressTrackApp } = await client.import('../../src/ui/progressTracks.js');
  await client.run(() => ProgressTrackApp.DEFAULT_OPTIONS.actions[action].call(app, {}, { dataset }));
  await table.settle();
}

/** A panel whose add form holds `values` (by field name). */
function addFormApp(values) {
  const inputs = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value, focus() {} }]));
  const panel  = { querySelector: (sel) => inputs[/name="(\w+)"/.exec(sel)?.[1]] ?? null };
  return { app: { render() {}, element: { querySelector: () => panel } }, inputs };
}

describe('the Progress Tracks panel links a track to the vow it serves (issue #353 R3)', () => {
  it("Pat's Add with a vow chosen: the GM creates the scene challenge serving it", async () => {
    const { app } = addFormApp({ newLabel: 'The standoff', newType: 'scene_challenge', newRank: 'formidable', newVow: 'v-beacon' });
    await click('pl-1', 'addTrack', {}, app);
    expect(stored().find(t => t.label === 'The standoff')).toMatchObject({
      type: 'scene_challenge', linkedVowId: 'v-beacon', linkedVowName: 'Find the lost beacon',
    });
  });

  it("a vow fulfilled since the form was drawn: nothing is added, Pat is told on his own screen, and keeps what he typed", async () => {
    kira.items.contents.find(i => i.id === 'v-beacon').system.completed = true;
    const { app, inputs } = addFormApp({ newLabel: 'The standoff', newType: 'scene_challenge', newRank: 'formidable', newVow: 'v-beacon' });
    await click('pl-1', 'addTrack', {}, app);
    expect(stored().map(t => t.id)).toEqual(['exp-1', 'fight-1']);
    expect(table.client('pl-1').notifications.map(n => n.message))
      .toContainEqual(expect.stringMatching(/that vow is no longer open — nothing was changed/));
    expect(inputs.newLabel.value).toBe('The standoff');
    // Nothing was relayed: the refusal is the presser's, where he can see it.
    expect(table.socketLog.filter(e => e.payload?.kind === 'gmRelay.progressTrack.edit')).toEqual([]);
  });

  it("the GM checks again: a relayed Add naming a closed vow adds nothing", async () => {
    const beacon = kira.items.contents.find(i => i.id === 'v-beacon');
    beacon.system.completed = true;
    const { requestGmAction } = await table.client('pl-1').import('../../src/multiplayer/gmRelay.js');
    const relayAdd = async () => {
      await table.client('pl-1').run(() => requestGmAction('progressTrack.edit',
        { op: 'add', label: 'The standoff', type: 'scene_challenge', rank: 'formidable', vowId: 'v-beacon' }));
      await table.settle();
    };
    await relayAdd();
    expect(stored().map(t => t.id)).toEqual(['exp-1', 'fight-1']);
    // Control: the same relayed Add, the vow open again, lands linked.
    beacon.system.completed = false;
    await relayAdd();
    expect(stored().find(t => t.label === 'The standoff')).toMatchObject({ linkedVowId: 'v-beacon' });
  });

  it("Pat's 🔗 on the expedition the pipeline began links it; — no vow — unlinks it", async () => {
    const select = { value: 'v-beacon' };
    const app = { render() {}, element: { querySelector: (sel) => (sel.includes('data-track-id="exp-1"') ? select : null) } };
    await click('pl-1', 'linkTrackVow', { trackId: 'exp-1' }, app);
    expect(stored().find(t => t.id === 'exp-1')).toMatchObject({ linkedVowId: 'v-beacon', linkedVowName: 'Find the lost beacon' });

    select.value = '';
    await click('pl-1', 'linkTrackVow', { trackId: 'exp-1' }, app);
    expect(stored().find(t => t.id === 'exp-1')).toMatchObject({ linkedVowId: null, linkedVowName: null });
  });

  it('the panel offers the open vows in its add form and on the expedition\'s row — not on the fight\'s', async () => {
    const client = table.client('pl-1');
    const { ProgressTrackApp } = await client.import('../../src/ui/progressTracks.js');
    journal = makeTracksJournal([
      ...stored(),
      { id: 'exp-2', label: 'Into the Shroud', type: 'expedition', rank: 'dangerous', ticks: 0, completed: false,
        linkedVowId: 'v-beacon', linkedVowName: 'Find the lost beacon', createdAt: 3 },
    ]);
    table.journal.set(journal.id, journal);
    const html = await client.run(async () => {
      const app = new ProgressTrackApp();
      return (await app._renderHTML(await app._prepareContext({}), {})).outerHTML;
    });
    expect(html).toMatch(/<select class="track-select track-vow" name="newVow"/);
    expect(html).toContain('<option value="v-beacon">Find the lost beacon</option>');
    expect(html).toContain('<option value="bg-kira">Avenge the Iron Hollow</option>');
    expect(html).toContain('name="trackVow" data-track-id="exp-1"');
    expect(html).toContain('name="trackVow" data-track-id="exp-2"');
    expect(html).toContain('<option value="v-beacon" selected>Find the lost beacon</option>');
    expect(html).toContain('Expedition · Dangerous · serves “Find the lost beacon”');
    expect(html).not.toContain('data-track-id="fight-1" title="Link');
    expect(html).not.toContain('name="trackVow" data-track-id="fight-1"');
  });
});
