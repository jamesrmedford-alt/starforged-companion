/**
 * STARFORGED COMPANION
 * tests/unit/truthOfAnEarlierSceneCorrected.test.js
 *
 * TRUTH-OF-AN-EARLIER-SCENE-UNCORRECTABLE (the long haul's free rehearsal at
 * 19fa9e37, `long-haul-rehearsal-20261125-133640`: the ledger's F6 refused at
 * the storage layer). Beat 16 corrects the cutter's name — `!truth list`, then
 * `!truth strike <id>`, then `!truth set "raider cutter" is named the Cinder
 * Wren` — but b16's wreckage line had turned the scene already, so the truth
 * "is named the Ashen Wake" had left the scene's ledger at its end: the list
 * said "No truths are recorded in this scene", nothing could be struck, the
 * strike + set name change (nameChanges.js nameCorrectionOf) never happened,
 * and the Session Log kept the old truth under "Established and standing"
 * beside the new one. Before scenes turned, a session was one scene.
 *
 * Now the list and the strike reach the session's earlier scenes, as the
 * session record keeps them (factContinuity/earlierScenes.js): the canonical
 * GM whispers the typist the active scene's truths and then each earlier
 * scene's, labelled by the scene; a strike of one is recorded against its own
 * recorded id, kept with the session's strikes, and takes back the copies its
 * scene's end filed; a set after it reads it as the name swap. And a scene's
 * cause — the Session Log's "A new scene — …" — is written with the new name.
 *
 * Through the real pipeline on a booted two-client table: the player sets the
 * truth, the night line turns the scene, the player lists, strikes by the
 * listed id and sets the new name.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { withLiveDocuments } from '../helpers/liveDocuments.js';
import { scriptClaude, isReaderCall, readerReply } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const SESSION = 'sess-2';
const OLD = 'is named the Ashen Wake';
const NEW = 'is named the Cinder Wren';
const NIGHT = 'I watch the Ashen Wake drift off the ring until the next morning.';
const HULL = 'I check the hull plates for scoring.';

describe('a truth an earlier scene of this session set is listed, struck by its id and renamed — through the real pipeline', () => {
  let table;
  const gm = () => table.client('gm-1');
  const player = () => table.client('pl-1');
  const cards = (verb) => table.cards(f => f.factContinuityCommand === true && (!verb || f.verb === verb));
  const lastCard = (verb) => cards(verb).at(-1)?.content ?? '';
  const quiet = async () => { await table.settle(); await table.drain(); };

  /** The GM's read of the session, once its record writes have landed. */
  async function settledRecord() {
    await quiet();
    const record = await gm().import('../../src/record/record.js');
    await gm().run(() => record.recordSettled());
    return gm().import('../../src/record/read.js');
  }
  const storedEvents = () => Object.values(table.journal.contents
    .find(j => j.name === JOURNAL_NAMES.sessionLog)?.pages.contents
    .find(p => p.flags?.[MODULE_ID]?.sessionRecord?.sessionId === SESSION)?.flags?.[MODULE_ID]?.sessionRecord?.events ?? {});

  beforeAll(async () => {
    table = withLiveDocuments(await simulateTable({ users: [USERS.GM, USERS.P1] }));
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: SESSION, sessionStartedId: SESSION,
        sessionNumber: 2, lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [] },
    } } });
    (await gm().import('../../src/record/record.js'))._resetRecordForTests();
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', type: 'character', ownership: { 'pl-1': 3 } });
    // The night line is read as no move, and narrated: the narration that turns the scene.
    scriptClaude(table).when(isReaderCall, readerReply({ category: 'downtime', reason: 'A night passes.' }), { times: 5 });
  });

  /** Scene 1: the GM's, with the player's truth set in it; then the night line turns it. Returns the truth's id. */
  async function setThenTurn() {
    await gm().chat('!scene start');
    await quiet();
    await player().chat(`!truth set "raider cutter" ${OLD}`);
    await quiet();
    const scene1 = table.world.campaignState().currentSceneId;
    const truth = table.world.campaignState().sceneTruths.find(t => t.fact === OLD);
    expect(truth, 'the truth set in scene 1').toBeTruthy();
    await player().chat(NIGHT, { speaker: { actor: 'pc-mira' } });
    await quiet();
    const now = table.world.campaignState();
    expect(now.currentSceneId, 'the night line turned the scene').not.toBe(scene1);
    expect(now.sceneBegan).toMatchObject({ cause: 'time', what: expect.stringContaining('Ashen Wake') });
    expect(now.sceneTruths.some(t => t.fact === OLD), 'the truth left with its scene').toBe(false);
    // A beat of the new scene: the Session Log heads it with why the scene began.
    await player().chat(HULL, { speaker: { actor: 'pc-mira' } });
    await quiet();
    return truth.id;
  }

  it('lists it under its scene, strikes it by the listed id, and the set after it is the name change — on the record, the Session Log and the recap\'s source', async () => {
    const id = await setThenTurn();

    // The list: the active scene has none, scene 1 has the truth, with the id the strike takes.
    await player().chat('!truth list');
    await quiet();
    const list = lastCard('list');
    expect(list).toContain('No truths are recorded in this scene.');
    expect(list).toContain('Earlier this session');
    expect(list).toMatch(/Scene 1 — the GM began a new scene/);
    expect(list).toContain(`<code>${id.slice(0, 8)}</code> raider cutter — ${OLD}`);
    expect(cards('list').at(-1).whisper, 'whispered to the typist').toEqual(['pl-1']);

    // The strike, by the listed id, as the rehearsal's player types it.
    await player().chat(`!truth strike ${id.slice(0, 8)}`);
    await quiet();
    expect(lastCard('strike')).toContain(`Truth <code>${id.slice(0, 8)}</code> struck — it was set in an earlier scene of this session.`);
    const kept = table.world.campaignState().sessionRetractions;
    expect(kept).toMatchObject({ sessionId: SESSION });
    expect(kept.facts.find(f => f.truthId === id)).toMatchObject({ label: 'raider cutter', fact: OLD, subjectKey: 'raider cutter', retractedBy: 'player' });

    // The new name.
    await player().chat(`!truth set "raider cutter" ${NEW}`);
    await quiet();
    expect(table.world.campaignState().nameChanges.at(-1)).toMatchObject({ from: expect.stringContaining('Ashen Wake'), to: expect.stringContaining('Cinder Wren') });

    const read = await settledRecord();
    // The record: the strike against the truth's own recorded id, and the name change.
    const events = storedEvents();
    expect(events.filter(e => e.k === 'truth.struck').map(e => e.ref.truth)).toEqual([id]);
    expect(events.find(e => e.k === 'name.changed')?.d).toMatchObject({ from: expect.stringContaining('Ashen Wake'), to: expect.stringContaining('Cinder Wren') });

    const session = gm().run(() => read.readRecord({ session: SESSION }).sessions[0]);
    expect(session.open.established.map(t => t.fact)).toEqual([NEW]);                 // was: OLD beside NEW
    expect(session.corrections.find(c => c.kind === 'strike')).toMatchObject({ fact: OLD });

    // The Session Log: the old truth not standing, the old name in no scene's label.
    const view = await gm().import('../../src/record/sessionLogView.js');
    const body = gm().run(() => view.renderSessionLogBody(session));
    const standing = body.split('<h3>Established and standing</h3>')[1]?.split('<h3>')[0] ?? '';
    expect(standing).toContain(NEW);
    expect(standing).not.toContain('Ashen Wake');
    const labels = [...body.matchAll(/<em>A new scene[^<]*<\/em>/g)].map(m => m[0]);
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(labels.join('\n')).toContain('Cinder Wren');
    expect(labels.join('\n'), 'the scene the night line began, labelled with the new name').not.toContain('Ashen Wake');

    // The recap's source agrees: the new name established, the old one only as struck.
    const recap = await gm().import('../../src/record/recapView.js');
    const source = gm().run(() => recap.recapSource({ read: read.readRecord({ session: 'campaign' }) })).text;
    const [told, struck = ''] = source.split('STRUCK BY THE TABLE');
    expect(told).toContain(NEW);
    expect(told).not.toContain(OLD);
    expect(struck).toContain(OLD);

    // A restatement of the struck truth stays blocked for the session, and its Lore is out of canon.
    const ledgers = await gm().import('../../src/factContinuity/ledgers.js');
    expect(gm().run(() => ledgers.findSessionStrike(table.world.campaignState(), { kind: 'text', text: 'raider cutter' }, OLD, ['raider cutter']))).toBeTruthy();
    const wj = await gm().import('../../src/world/worldJournal.js');
    const lore = await gm().run(() => wj.getConfirmedLore());
    expect(JSON.stringify(lore)).not.toContain('Ashen Wake');
  }, 60_000);

  it('controls: a truth of an earlier session is not listed, and an id no truth has is refused with a message', async () => {
    // A truth the last session's record holds.
    const record = await gm().import('../../src/record/record.js');
    gm().run(() => record.recordEvent('truth.set', {
      session: 'sess-1', scene: 'sc-old', ref: { truth: 'tr-oldses01' },
      d: { subject: { kind: 'text', text: 'the old hauler' }, fact: 'is named the Grey Gull', by: 'gm', basis: 'gm' },
    }));
    await gm().run(() => record.recordSettled());
    await setThenTurn();

    await player().chat('!truth list');
    await quiet();
    const list = lastCard('list');
    expect(list).toContain(OLD);                         // this session's earlier scene is listed
    expect(list).not.toContain('Grey Gull');             // the last session's is not
    expect(list).not.toContain('tr-oldse');

    await player().chat('!truth strike tr-oldses01');
    await quiet();
    expect(lastCard('strike')).toContain('No matching truth (id or unique 4+ char prefix required, and you must have permission).');
    await player().chat('!truth strike tr-zzzz9');
    await quiet();
    expect(lastCard('strike')).toContain('No matching truth');
    const read = await settledRecord();
    expect(storedEvents().some(e => e.k === 'truth.struck'), 'nothing struck').toBe(false);
    expect(gm().run(() => read.readRecord({ session: SESSION }).sessions[0].open.established.map(t => t.fact))).toEqual([OLD]);
  }, 60_000);
});
