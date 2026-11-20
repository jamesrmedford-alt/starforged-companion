/**
 * STARFORGED COMPANION
 * tests/unit/xcardDeletedNpcPlanRetired.test.js
 *
 * Issue #364 XCARD-NPC-DELETE-LEAVES-PLAN (left open by issue #364
 * XCARD-NPC-DELETE-SKIPS-TEARDOWN).
 *
 * A GM's delete of an NPC card retires the hidden plans about that card
 * (issue #362 D10). The X-Card's own delete of an NPC its narration created
 * (connection.js retractNarrationConnections) did not. The plans the removed
 * narration itself wrote are undone by its id before the card goes — so the
 * agenda its Make a Connection filed is deleted with it — but a plan about
 * the NPC that someone else owns by then stays when its maker is removed
 * (worldJournal.js undoNarrationEntries), and the X-Card deletes the NPC
 * while nobody has "used" her — which reads her record, her sheet and her
 * bond marks, never a plan.
 *
 * The case that is reachable: a GM opens the Secrets panel and writes the
 * NPC's waiting agenda (editSkeleton — the plan is the GM's from then on),
 * and the X-Card is then played on the narration that introduced her. She is
 * still unused, so her card goes; her plan stayed in play, about a subject
 * that no longer existed. A plan a kept narration decided is the same case
 * (reachable when the X-Card takes a struck first narration with its
 * upgraded beat, issue #347 D2).
 *
 * Harness: xcardDeletedNpcReferencesCleared.test.js's — the real narration
 * capture creates the NPC and files her agenda, the real panel edit rewrites
 * it, the real X-Card (safety.suppressScene) removes the narration.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { applyNarratorSidecar, postNarrationCard, runPostNarrationPasses } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { listConnections, addHistoryEntry } from '../../src/entities/connection.js';
import { listSkeletons, getSkeleton, editSkeleton, updateSkeleton, createSkeleton } from '../../src/world/secrets.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => {
  const contents = ChatMessage._created.slice();
  global.game.messages = { contents, get: (id) => contents.find(m => m.id === id) ?? null };
};

const GM = { id: 'gm-1', isGM: true, active: true };
const PL = { id: 'pl-1', isGM: false, active: true };

const PROSE = 'Vex meets you under the gantry — a smuggler who runs the lower docks, and who already knows your name.';
const SIDECAR = {
  newTruths:    [{ subject: 'Vex', fact: 'Runs the lower docks' }],
  stateChanges: [],
  sceneFrame:   { location: 'the lower docks', present: ['Kira', 'Vex'], situation: 'A first meeting' },
};
const DETECTION = {
  entities: [{ type: 'connection', name: 'Vex', description: 'A smuggler who runs the lower docks.', pronouns: 'she/her', role: 'smuggler', goal: null, confidence: 'high' }],
  renames:  [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
};
const RESOLUTION = { _id: 'res-vex', moveId: 'make_a_connection', outcome: 'strong_hit', playerNarration: 'I look for a smuggler who knows the docks.' };
const RELEVANCE  = { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' };

const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

let journals, origActorCreate, origItemCreate;
beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  journals = installJournalMock();   // journals that keep their pages: the Secrets journal holds the plans
  // Foundry's Document#delete for a plan's page (the fixture's does nothing).
  const createJournal = global.JournalEntry.create;
  global.JournalEntry.create = async (data) => {
    const journal = await createJournal(data);
    const makePages = journal.createEmbeddedDocuments;
    journal.createEmbeddedDocuments = async (type, docs) => {
      const pages = await makePages(type, docs);
      for (const page of pages) {
        page.delete = async () => {
          const i = journal.pages.contents.indexOf(page);
          if (i >= 0) journal.pages.contents.splice(i, 1);
        };
      }
      return pages;
    };
    return journal;
  };
  global.game.messages = { contents: [], get: () => null };
  global.game.users = Object.assign([GM, PL], { get: (id) => [GM, PL].find(u => u.id === id) ?? null });
  global.game.user = GM;
  global.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [], clocks: [],
    connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
  game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character', ownership: { 'pl-1': 3 } }));
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    if (/You are analysing an Ironsworn: Starforged narration/.test(user)) return reply(JSON.stringify(DETECTION));
    return reply('{"contradictions":[]}');
  });

  // Foundry's Document#delete for the Actors and Items the pass creates.
  origActorCreate = global.Actor.create;
  origItemCreate  = global.Item.create;
  global.Actor.create = async (data) => {
    const actor = await origActorCreate(data);
    actor.delete = async () => { game.actors._setAll(game.actors.contents.filter(a => a !== actor)); };
    return actor;
  };
  global.Item.create = async (data, options) => {
    const item = await origItemCreate(data, options);
    item.delete = async () => {
      const list = options?.parent?.items?.contents;
      const i = list?.indexOf(item) ?? -1;
      if (i >= 0) list.splice(i, 1);
    };
    return item;
  };
});
afterEach(() => {
  journals.restore();
  delete global.ui;
  global.Actor.create = origActorCreate;
  global.Item.create  = origItemCreate;
});

const npcCards = () => game.actors.contents.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
const plansInPlay = () => listSkeletons();
const everyPlan = () => listSkeletons({ includeInactive: true });
/** The narration a plan's newest version was written by, as stored on its page (null: a GM's). */
const stampOf = (planId) => [...journals.journals.values()].flatMap(j => j.pages?.contents ?? [])
  .map(p => p.flags?.[MODULE_ID]?.secretEntry).find(e => e?.id === planId)?.narrationId ?? null;

/** The Make a Connection narration and its synchronous capture: the hit creates Vex and files her agenda. */
async function makeAConnection() {
  const cs = stored();
  const text = applyNarratorSidecar(`${PROSE}\n\`\`\`json\n${JSON.stringify(SIDECAR)}\n\`\`\``, cs, { narrationId: 'nar-vex', matchedEntityIds: [] });
  await postNarrationCard(text, RESOLUTION, cs, { playerText: RESOLUTION.playerNarration, playerName: 'Kira', narrationId: 'nar-vex' });
  await runPostNarrationPasses(text, RESOLUTION, RELEVANCE, cs, { actorId: 'pc-kira', narrationId: 'nar-vex' });
  expect(listConnections(stored()).filter(c => c.name === 'Vex'), 'the hit created Vex (setup)').toHaveLength(1);
  const [vex] = npcCards();
  const [agenda] = plansInPlay();
  expect(agenda,'her agenda is planned, about her card, by the narration that made her (setup)').toMatchObject({
    kind: 'npcAgenda', status: 'active', truth: '', subject: { type: 'entity', id: vex.id, name: 'Vex' },
  });
  expect(stampOf(agenda.id), 'stamped with that narration: its X-Card takes the plan back').toBe('nar-vex');
  return { vex, agenda };
}

/** The X-Card: it answers the latest narration — the one that created Vex. */
async function xCard() {
  syncChat();
  expect(await suppressScene({}, { local: true })).toBe(true);
}

describe('issue #364 XCARD-NPC-DELETE-LEAVES-PLAN — the X-Card\'s delete of an NPC retires the plans about her card', () => {
  it('a GM wrote her agenda in the Secrets panel since: she is still unused and goes with the X-Card, and her plan leaves play', async () => {
    const { vex, agenda } = await makeAConnection();
    const edited = await editSkeleton(agenda.id, { truth: 'She sells the dock codes to both sides.', wants: 'A way off the docks.' });
    expect(edited, 'the plan is the GM\'s now: no narration\'s to take back').toMatchObject({ truth: 'She sells the dock codes to both sides.', status: 'active' });
    expect(stampOf(agenda.id)).toBeNull();

    await xCard();

    expect(npcCards(), 'the edit is on the plan, not on Vex: nobody "used" her, so she went with the narration').toEqual([]);
    expect(plansInPlay(), 'no plan is in play about a card that no longer exists').toEqual([]);
    expect(getSkeleton(agenda.id), 'retired, as a GM\'s delete of the card retires it: kept in the journal with what the GM wrote')
      .toMatchObject({ status: 'retired', truth: 'She sells the dock codes to both sides.', subject: { type: 'entity', id: vex.id } });
  });

  it('a kept narration decided her agenda since: retired too', async () => {
    const { agenda } = await makeAConnection();
    // As a later narration's decision writes it (applyPlanSideData): its version on top of the maker's.
    await updateSkeleton(agenda.id, r => ({ ...r, truth: 'She answers to the harbour master.' }), { narrationId: 'nar-later' });
    expect(getSkeleton(agenda.id).status).toBe('active');
    expect(stampOf(agenda.id)).toBe('nar-later');

    await xCard();

    expect(npcCards()).toEqual([]);
    expect(plansInPlay()).toEqual([]);
    expect(getSkeleton(agenda.id)).toMatchObject({ status: 'retired', truth: 'She answers to the harbour master.' });
  });

  it('control: untouched, her agenda is the removed narration\'s own and is deleted with it, as before', async () => {
    await makeAConnection();

    await xCard();

    expect(npcCards()).toEqual([]);
    expect(everyPlan(), 'undone by the narration\'s id: no page is left').toEqual([]);
  });

  it('control: an NPC the table has used stays with the X-Card, and the plan the GM wrote stays in play', async () => {
    const { vex, agenda } = await makeAConnection();
    await editSkeleton(agenda.id, { truth: 'She sells the dock codes to both sides.' });
    await addHistoryEntry(vex.id, 'Kira paid her for the dock codes.', SESSION);

    await xCard();

    expect(npcCards().map(a => a.id)).toEqual([vex.id]);
    expect(plansInPlay().map(p => p.id)).toEqual([agenda.id]);
  });

  it('control: only the plans about her card go — another NPC\'s agenda and a plan about a name stay in play', async () => {
    const { agenda } = await makeAConnection();
    await editSkeleton(agenda.id, { truth: 'She sells the dock codes to both sides.' });
    const other = await createSkeleton({ kind: 'npcAgenda', subject: { type: 'entity', id: 'conn-other', name: 'Orrin' }, truth: 'He owes the Syndicate.' }, { byGm: true });
    const named = await createSkeleton({ kind: 'threat', subject: { type: 'name', name: 'the dock blockade' }, truth: 'It is a bluff.' }, { byGm: true });

    await xCard();

    expect(npcCards()).toEqual([]);
    expect(plansInPlay().map(p => p.id).sort()).toEqual([other.id, named.id].sort());
  });
});
