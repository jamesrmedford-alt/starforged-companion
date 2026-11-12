/**
 * STARFORGED COMPANION
 * tests/unit/xcardChronicle.test.js
 *
 * XCARD-CHRONICLE — an X-carded narration's Chronicle entry leaves with it.
 *
 * The scribe (scheduleChronicleEntry, ~2 s after a move, paced or Batch Mode
 * round narration) writes one entry from the prose to a PC's Chronicle. The
 * Chronicle feeds the campaign recap and, pinned, every narration's CHARACTER
 * block (issue #345 AA07), and the X-Card never touched it: the removed beat
 * came back at the next session start. Now the entry carries the narration's
 * id, the X-Card's finish removes it (retractNarrationChronicle — pinned or
 * not, the tier details' rule), and the scribe checks the stored
 * `xCardedNarrationIds` before it writes (the capture's XCARD-LATE-CAPTURE
 * rule), at the write's turn on the actor's chain too.
 */

/* global makeTestActor, getCapturedWarns */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { apiPost } from '../../src/api-proxy.js';
import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import {
  addChronicleEntry, getChronicleEntries, setChronicleEntryPinned, applyChronicleEditFromRelay,
} from '../../src/character/chronicle.js';
import { writeChronicleEntry } from '../../src/character/chronicleWriter.js';
import { readFileSync } from 'node:fs';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

function installChronicleJournals() {
  const journals = [];
  game.journal = {
    get contents() { return [...journals]; },
    getName: (n) => journals.find(j => j.name === n) ?? null,
    get: (id) => journals.find(j => j.id === id) ?? null,
    find: (fn) => journals.find(fn) ?? null,
    filter: (fn) => journals.filter(fn),
    [Symbol.iterator]: () => journals[Symbol.iterator](),
  };
  global.JournalEntry = { create: async (data) => {
    const journal = {
      id: `j-${journals.length + 1}`, name: data.name, flags: data.flags ?? {},
      pages: { contents: [], find: (fn) => journal.pages.contents.find(fn) },
      setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = val; },
      getFlag: (mod, key) => journal.flags?.[mod]?.[key],
      update: async (changes) => Object.assign(journal, changes),
      createEmbeddedDocuments: async (_type, docs) => docs.map(d => {
        const page = { ...d, flags: JSON.parse(JSON.stringify(d.flags ?? {})),
          setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
          getFlag: (mod, key) => page.flags?.[mod]?.[key] };
        journal.pages.contents.push(page);
        return page;
      }),
    };
    journals.push(journal);
    return journal;
  } };
  return journals;
}

let saved;
beforeEach(() => {
  saved = { journal: game.journal, create: global.JournalEntry?.create };
  installChronicleJournals();

  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, true);
  game.actors._reset();
  game.actors._set('pc-1', makeTestActor({ id: 'pc-1', name: 'Kira' }));
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
  apiPost.mockReset();
  apiPost.mockResolvedValue({ content: [{ type: 'text', text: '{"contradictions":[]}' }] });
});
afterEach(() => {
  game.journal = saved.journal;
  global.JournalEntry = { create: saved.create };
});

const SIDECAR = { newTruths: [], stateChanges: [], sceneFrame: { location: 'the cell', present: ['the prisoner'], situation: 'The torch hovers' } };

async function narrate(narrationId, prose) {
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify(SIDECAR)}\n\`\`\``, stored(), { narrationId, matchedEntityIds: [] });
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'I press the prisoner.', playerName: 'Kira', narrationId });
}

const texts = async () => (await getChronicleEntries('pc-1')).map(e => e.text);
const scribeReply = (text) => ({ content: [{ type: 'text', text: JSON.stringify({ type: 'scar', salience: 'defining', text }) }] });

describe('XCARD-CHRONICLE — the X-Card takes the narration\'s Chronicle entry with it', () => {
  it('the scribe stamps the narration\'s id on the entry it writes', async () => {
    apiPost.mockResolvedValue(scribeReply('The prisoner was burned.'));
    await writeChronicleEntry({ narrationText: 'The torch bites.', campaignState: stored(), kind: 'move', moveId: 'compel', narrationId: 'nar-torch' });
    expect((await getChronicleEntries('pc-1'))[0]).toMatchObject({ text: 'The prisoner was burned.', narrationId: 'nar-torch', automated: true });
  });

  it('an X-Card on the narration removes its entry — pinned too — and keeps the others', async () => {
    await addChronicleEntry('pc-1', { type: 'moment', text: 'An earlier beat.', automated: true, sessionId: SESSION, narrationId: 'nar-earlier' });
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.');
    await addChronicleEntry('pc-1', { type: 'scar', text: 'The prisoner was burned.', automated: true, sessionId: SESSION, narrationId: 'nar-torch' });
    const torch = (await getChronicleEntries('pc-1')).find(e => e.narrationId === 'nar-torch');
    await setChronicleEntryPinned('pc-1', torch.id, true);
    await addChronicleEntry('pc-1', { type: 'annotation', text: 'A player note.', automated: false, sessionId: SESSION });
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toContain('nar-torch');
    expect(await texts()).toEqual(['An earlier beat.', 'A player note.']);
  });

  it('a scribe whose call is out when the X-Card lands writes nothing', async () => {
    apiPost.mockImplementation(async () => {
      game.settings._store.set(KEY, { ...stored(), xCardedNarrationIds: ['nar-torch'] });
      return scribeReply('The prisoner was burned.');
    });
    const entry = await writeChronicleEntry({ narrationText: 'The torch bites.', campaignState: stored(), kind: 'move', narrationId: 'nar-torch' });
    expect(entry).toBeNull();
    expect(await texts()).toEqual([]);
  });

  it('an add reaching the canonical GM after the pause is refused, at its turn on the chain too', async () => {
    game.settings._store.set(KEY, { ...stored(), xCardedNarrationIds: ['nar-torch'] });
    const gm = { requesterId: 'gm-2', requester: { id: 'gm-2', isGM: true }, requesterIsGM: true };
    const res = await applyChronicleEditFromRelay({ op: 'add', actorId: 'pc-1',
      entry: { type: 'scar', text: 'The prisoner was burned.', automated: true, sessionId: SESSION, narrationId: 'nar-torch' } }, gm);
    expect(res).toMatchObject({ applied: false, reason: 'xcarded' });
    expect(await addChronicleEntry('pc-1', { type: 'scar', text: 'Again.', automated: true, narrationId: 'nar-torch' })).toBe(false);
    expect(await texts()).toEqual([]);
    expect(getCapturedWarns().join('\n')).toMatch(/not applied \(xcarded\)/);
  });

  it('control: a relayed GM add keeps the narration id', async () => {
    const gm = { requesterId: 'gm-2', requester: { id: 'gm-2', isGM: true }, requesterIsGM: true };
    await applyChronicleEditFromRelay({ op: 'add', actorId: 'pc-1',
      entry: { type: 'scar', text: 'Kept.', automated: true, sessionId: SESSION, narrationId: 'nar-kept' } }, gm);
    expect((await getChronicleEntries('pc-1'))[0]).toMatchObject({ text: 'Kept.', narrationId: 'nar-kept' });
  });

  it('every narration path hands the scribe its narration id', () => {
    const src = readFileSync('src/narration/narrator.js', 'utf8');
    const calls = src.split('scheduleChronicleEntry(').slice(1).map(c => c.slice(0, c.indexOf(');')));
    expect(calls.length).toBe(5);
    for (const call of calls) expect(call).toMatch(/narrationId/);
  });
});
