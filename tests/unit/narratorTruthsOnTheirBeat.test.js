/**
 * STARFORGED COMPANION
 * tests/unit/narratorTruthsOnTheirBeat.test.js
 *
 * NARRATOR-TRUTHS-NOT-ON-THEIR-BEAT (the long haul's free rehearsal,
 * `long-haul-rehearsal-20261124-200221`: all three paced narrations of session
 * 1 that established a truth). A narration's own truths were a beat of their
 * own on the session record — "At the table — established (by the narrator):
 * Mira Kestrel — carries a brass star-compass…" — beside the beat whose
 * telling it was. A paced narration's fact block is saved (and its truths
 * recorded, `ledgerDiff.js`) as its sidecar is applied, before its card posts
 * (and its narration is recorded, `cards.js`); `read.js` joined a `truth.set`
 * to its narration's beat by `ref.nar` only once it had read that narration.
 * So the session summary's and the campaign recap's sources split the beat's
 * facts from its telling, and credited the narrator's truth to the table.
 *
 * Read off the events: the order is a race. The sidecar's ledger save is sent
 * to the server before the card is; in Foundry the two are answered in the
 * order sent, so the truth is recorded first — the rehearsal's split. On the
 * test harness the card's create resolves first, so the narration is recorded
 * first and the beat came out whole; the test below holds the card until the
 * save has landed, as the server's order has it.
 *
 * Now an event a narration wrote joins that narration's beat whichever was
 * recorded first (design 5.3 rule 3): one recorded before its narration waits
 * for it. A truth no narration wrote (`!truth set`) is a table beat where it
 * stands, and what a narration the X-Card removed wrote goes with it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { withLiveDocuments } from '../helpers/liveDocuments.js';
import { scriptClaude, holdWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { readRecord } from '../../src/record/read.js';
import { beatFacts } from '../../src/record/recapView.js';
import { recordedEvent, recordSourceOf } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const SESSION = 'sess-1';
const LINE = "I check my sister Ilse's brass star-compass before we undock.";
const PROSE = 'The needle trembles, then settles toward the dark lane.';
const FACT = 'carries a brass star-compass that belonged to her sister Ilse';

const isClassifier = (call) => /pacing pre-classifier/.test(call.system ?? '');
const isNarration  = (call) => /SIDECAR|NARRATOR ROLE/.test(call.system ?? '');
const NARRATIVE = JSON.stringify({ decision: 'NARRATIVE', suggestedMove: null, category: 'exploration', confidence: 0.9, reasoning: 'test' });
const told = (prose, truths) => `${prose}\n\`\`\`json\n${JSON.stringify({ newTruths: truths, stateChanges: [] })}\n\`\`\``;

// ─── through the real save order, on a booted table ──────────────────────────

describe('a paced narration\'s truth is on its beat — through the real save order', () => {
  let table, script;
  const gm = () => table.client('gm-1');
  const storedEvents = () => Object.values(table.journal.contents
    .find(j => j.name === JOURNAL_NAMES.sessionLog)?.pages.contents
    .find(p => p.flags?.[MODULE_ID]?.sessionRecord?.sessionId === SESSION)?.flags?.[MODULE_ID]?.sessionRecord?.events ?? {})
    .sort((a, b) => (a.at - b.at) || (a.seq - b.seq));

  /** The GM's read of the session, once its record writes have landed. */
  async function sessionRead() {
    await table.settle(); await table.drain();
    const record = await gm().import('../../src/record/record.js');
    await gm().run(() => record.recordSettled());
    const read = await gm().import('../../src/record/read.js');
    return gm().run(() => read.readRecord({ session: SESSION }).sessions[0]);
  }

  beforeAll(async () => {
    table = withLiveDocuments(await simulateTable({ users: [USERS.GM, USERS.P1] }));
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: SESSION, sessionStartedId: SESSION,
        sessionNumber: 1, lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [] },
    } } });
    (await gm().import('../../src/record/record.js'))._resetRecordForTests();
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', type: 'character', ownership: { 'pl-1': 3 } });
    script = scriptClaude(table);
  });

  /** The paced narration's card, held on its way to the server. */
  const pacedCard = () => holdWrites(table, (w) => w.kind === 'message.create' && w.data?.flags?.[MODULE_ID]?.pacedNarrative === true);
  const recordedOrder = () => storedEvents().map(e => e.k).filter(k => k === 'truth.set' || k === 'narration');

  /** A paced line whose narration's card reaches the server after its fact block's save, as in Foundry. */
  async function narratedInFoundrysOrder(text = LINE) {
    const card = pacedCard();
    await table.client('pl-1').chat(text, { speaker: { actor: 'pc-mira' } });
    await card.arrived;
    await table.settle();              // the save, sent first, lands first
    card.release();
  }

  it('the line, its telling and the truth its fact block set are one beat — no "At the table" beat holds the truth', async () => {
    script.when(isClassifier, NARRATIVE).when(isNarration, told(PROSE, [{ subject: 'Mira Kestrel', fact: FACT }]));
    await narratedInFoundrysOrder();
    const session = await sessionRead();

    // The order the record holds them in: the fact block's truth, then the narration.
    expect(recordedOrder()).toEqual(['truth.set', 'narration']);

    const beat = session.beats.find(b => b.line?.text === LINE);
    expect(beat).toMatchObject({ kind: 'play', told: { mode: 'paced' } });
    expect(beat.established.map(t => t.fact)).toEqual([FACT]);                        // was: []
    expect(session.beats.filter(b => b.established.some(t => t.fact === FACT))).toHaveLength(1);
    expect(session.beats.some(b => b.kind === 'table')).toBe(false);                   // was: the truth's own beat

    // What the summary and the recap are given: the facts and the telling on one beat.
    const lines = session.beats.map(beatFacts).filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`the player wrote “${LINE}”`);
    expect(lines[0]).toContain(`established (by the narrator): Mira Kestrel — ${FACT}`);
    expect(lines.join('\n')).not.toContain('At the table');
  }, 30_000);

  it('control: with the card first — the harness\'s own order — the truth was on its beat already', async () => {
    script.when(isClassifier, NARRATIVE).when(isNarration, told(PROSE, [{ subject: 'Mira Kestrel', fact: FACT }]));
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-mira' } });
    const session = await sessionRead();
    expect(recordedOrder()).toEqual(['narration', 'truth.set']);
    expect(session.beats).toHaveLength(1);
    expect(session.beats[0].established.map(t => t.fact)).toEqual([FACT]);
  }, 30_000);

  it('the X-Card on that narration takes its truth with it: no beat is left holding it', async () => {
    script.when(isClassifier, NARRATIVE).when(isNarration, told(PROSE, [{ subject: 'Mira Kestrel', fact: FACT }]));
    await narratedInFoundrysOrder();
    await table.settle(); await table.drain();
    expect(recordedOrder()).toEqual(['truth.set', 'narration']);
    await table.client('pl-1').chat('!x');
    const session = await sessionRead();

    expect(session.beats.flatMap(b => b.established)).toEqual([]);
    expect(session.beats.map(beatFacts).join('\n')).not.toMatch(/compass|Ilse/);
  }, 30_000);
});

// ─── the read, by the order the events were recorded in ──────────────────────

describe('an event a narration wrote joins its beat, whichever was recorded first', () => {
  const who = { actor: 'pc-mira' };
  const names = { 'pc-mira': 'Mira Kestrel' };
  const line = () => recordedEvent(SESSION, 'line', { who, d: { via: 'typed' }, text: LINE });
  const narration = (nar = 'nar-1') => recordedEvent(SESSION, 'narration', { who, ref: { nar }, d: { mode: 'paced', actorId: 'pc-mira' }, text: PROSE });
  const truth = (id, nar, fact = FACT, by = 'narrator') => recordedEvent(SESSION, 'truth.set', {
    ref: { truth: id, ...(nar ? { nar } : {}) }, d: { subject: { kind: 'text', text: 'Mira Kestrel' }, fact, by },
  });
  const read = (events) => readRecord({ session: SESSION }, recordSourceOf(SESSION, events, { names })).sessions[0];

  it('recorded before its narration, a truth waits for it and is on its beat', () => {
    const s = read([line(), truth('t-1', 'nar-1'), narration('nar-1')]);
    expect(s.beats).toHaveLength(1);
    expect(s.beats[0]).toMatchObject({ kind: 'play', told: { mode: 'paced' } });
    expect(s.beats[0].established.map(t => t.truthId)).toEqual(['t-1']);
  });

  it('control: recorded after its narration, it is on its beat as before', () => {
    const s = read([line(), narration('nar-1'), truth('t-1', 'nar-1')]);
    expect(s.beats).toHaveLength(1);
    expect(s.beats[0].established.map(t => t.truthId)).toEqual(['t-1']);
  });

  it('a truth no narration wrote — `!truth set` — is a table beat where it stands', () => {
    const s = read([truth('t-gm', null, 'the dock is sealed', 'gm'), line(), truth('t-1', 'nar-1'), narration('nar-1')]);
    expect(s.beats.map(b => [b.kind, b.established.map(t => t.truthId)])).toEqual([['table', ['t-gm']], ['play', ['t-1']]]);
  });

  it('a strike of a truth recorded before its narration takes it off that beat, and names it struck', () => {
    const s = read([line(), truth('t-1', 'nar-1'), narration('nar-1'),
      recordedEvent(SESSION, 'truth.struck', { ref: { truth: 't-1' }, d: { by: 'gm' } })]);
    expect(s.beats[0].established).toEqual([]);
    expect(s.beats[0].leaveOut).toEqual([FACT]);
    expect(s.corrections.filter(c => c.kind === 'strike').map(c => c.fact)).toEqual([FACT]);
  });

  it('a save that carries a truth back is no second truth, whichever came first', () => {
    const s = read([line(), truth('t-1', 'nar-1'), truth('t-1', 'nar-1'), narration('nar-1')]);
    expect(s.beats[0].established.map(t => t.truthId)).toEqual(['t-1']);
  });

  it('the X-Card on a narration takes the truth it wrote before it was recorded', () => {
    const s = read([line(), truth('t-1', 'nar-1'), narration('nar-1'),
      recordedEvent(SESSION, 'narration.removed', { d: { narrationIds: ['nar-1'], by: 'xcard' } })]);
    expect(s.beats.flatMap(b => b.established)).toEqual([]);
    expect(s.beats[0].removed).toBe('xcard');
  });

  it('what else a narration wrote before it was recorded — a connection it made — is on its beat too', () => {
    const made = recordedEvent(SESSION, 'connection.made', { who, ref: { conn: 'npc-tamsin', nar: 'nar-1' }, d: { name: 'Tamsin', rank: 'dangerous' } });
    const s = read([line(), made, narration('nar-1')]);
    expect(s.beats).toHaveLength(1);
    expect(s.beats[0].did.map(d => d.kind)).toEqual(['connection.made']);
    expect(s.beats[0].lasting).toBe('a connection made');
  });
});
