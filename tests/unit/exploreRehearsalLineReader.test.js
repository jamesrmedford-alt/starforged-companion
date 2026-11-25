/**
 * STARFORGED COMPANION
 * tests/unit/exploreRehearsalLineReader.test.js
 *
 * The rehearsal's stand-in (test/ci/playwright/lib/rehearsal.mjs) answers the
 * line reader (src/moves/reader.js) — the one call that reads a typed line
 * since the switch (issue #384) — in the reader's own reply, as parseReading
 * reads it, in each of the reader's modes: open (decidePacing → readAndRoute),
 * roll (a roll asked for) and chosen (a card's move). A line its script makes
 * a move comes out rolled, as it did under the two readers — the move, asked,
 * the script's stat and target — at any dial and after any run of rolls; a
 * line it offers a move for comes out offered; a plain line, and a Make a
 * Connection for someone already a connection, as no move. The two readers'
 * prompts, which nothing sends now, have no answer of their own.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/pacing/telemetry.js', () => ({ logPacingDecision: vi.fn(async () => {}) }));

import { apiPost } from '../../src/api-proxy.js';
import { decidePacing, resetRecentDensity, recordRecentDecision } from '../../src/pacing/router.js';
import { routeReading } from '../../src/pacing/readAndRoute.js';
import { buildReaderSystemPrompt, buildReaderUserMessage, parseReading, READING_MODES } from '../../src/moves/reader.js';
import { interpretMove } from '../../src/moves/interpreter.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';
import { createRehearsal } from '../../test/ci/playwright/lib/rehearsal.mjs';

const CHARTERS_DIR = path.resolve(__dirname, '../../test/ci/playwright/charters');
const CHARTERS = Object.fromEntries(fs.readdirSync(CHARTERS_DIR).filter(f => f.endsWith('.json'))
  .map(f => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(CHARTERS_DIR, f), 'utf8'))]));
const LONG_HAUL = CHARTERS['long-haul'];

const SYSTEM = buildReaderSystemPrompt();
const userFor = (text, mode = READING_MODES.OPEN, chosen = null) => buildReaderUserMessage({ mode, text, situation: {}, chosen: chosen ? { moveId: chosen } : null });
// The player's turn: a card with the entry's button where the entry presses one.
const turn = (beat, label = null) => ({ system: 'You are playtesting', tools: [{ name: 'take_action' }], messages: [{ role: 'user',
  content: `CURRENT BEAT: ${beat} of 30 [session 1] — x\n\nYOUR SCREEN NOW:\n[m1] Gamemaster: hello${label ? `\n     buttons: (1) "${label}"` : ''}` }] });
/** The stand-in with the entry the table is answering: its scripted player has played it. */
const standIn = (charter, entry) => {
  const r = createRehearsal({ charter: { ...charter, rehearsal: [entry] } });
  expect(r.reply(turn(entry.beat, entry.label ?? null)).content[0].input).toMatchObject({ action: entry.action });
  return r;
};
/** The stand-in's reply to a line-reader call, as the reader sends one (its system prompt a cached block). */
const replyTo = (r, user) => r.reply({ system: [{ type: 'text', text: SYSTEM }], messages: [{ role: 'user', content: user }] }).content[0].text;

// The lowest dials and the densest run of rolls: where a reading is offered, not rolled, unless it is asked for.
const LOWEST = { enabled: true, densityWindow: 5, dials: { combat: 0, investigation: 0, exploration: 0, social: 0, downtime: 0 }, sceneOverride: null };
const DEFAULTS = { enabled: true, densityWindow: 5, dials: { combat: 9, investigation: 6, exploration: 6, social: 5, downtime: 1 }, sceneOverride: null };
const DENSE = { count: 5, window: 5 };

const scripted = (pick) => Object.entries(CHARTERS).flatMap(([name, c]) => (c.rehearsal ?? []).filter(pick).map(entry => ({ name, charter: c, entry })));
const MOVE_LINES = scripted(e => e.action === 'say' && e.move);
const OFFER_LINES = scripted(e => e.action === 'say' && e.offer);
const PLAIN_LINES = scripted(e => e.action === 'say' && !e.move && !e.offer && !e.match && !/^[!@]/.test(String(e.text ?? '').trim()));

describe('the stand-in reads each scripted line as the line reader does, in the reader\'s own reply', () => {
  it('a line the script makes a move: that move, asked, with the script\'s stat, target and rank — rolled at the lowest dials and after the densest run of rolls', () => {
    expect(MOVE_LINES.length, 'the scripts make moves of their lines').toBeGreaterThan(20);
    for (const { name, charter, entry } of MOVE_LINES) {
      const at = `${name}: "${entry.text}"`;
      const reading = parseReading(replyTo(standIn(charter, entry), userFor(entry.text)), { mode: READING_MODES.OPEN, narration: entry.text });
      expect(reading, at).toMatchObject({ moveId: entry.move.id, asked: true, confidence: 'high', failed: null });
      if (entry.move.stat) expect(reading.interpretation.statUsed, at).toBe(entry.move.stat);
      if (entry.move.target) expect(reading.interpretation.moveTarget, at).toBe(entry.move.target);
      if (entry.move.rank) expect(reading.interpretation.combatRank, at).toBe(entry.move.rank);
      for (const pacingConfig of [LOWEST, DEFAULTS]) {
        expect(routeReading(reading, { pacingConfig, density: DENSE, fightOpen: false }), at).toMatchObject({ route: 'roll', moveId: entry.move.id, why: 'the player asked for it' });
      }
    }
  });

  it('a line the script offers a move for: that move unasked, offered on the card; a plain line: no move, narrated', () => {
    expect(OFFER_LINES.length).toBeGreaterThan(0);
    for (const { name, charter, entry } of OFFER_LINES) {
      const reading = parseReading(replyTo(standIn(charter, entry), userFor(entry.text)), { mode: READING_MODES.OPEN, narration: entry.text });
      expect(reading, `${name}: "${entry.text}"`).toMatchObject({ moveId: entry.offer.id, asked: false, failed: null });
      for (const pacingConfig of [LOWEST, DEFAULTS]) {
        expect(routeReading(reading, { pacingConfig, density: null, fightOpen: false }).route, entry.text).toBe('offer');
      }
    }
    expect(PLAIN_LINES.length).toBeGreaterThan(10);
    for (const { name, charter, entry } of PLAIN_LINES) {
      const reading = parseReading(replyTo(standIn(charter, entry), userFor(entry.text)), { mode: READING_MODES.OPEN, narration: entry.text });
      expect(reading, `${name}: "${entry.text}"`).toMatchObject({ moveId: null, failed: null });
      expect(routeReading(reading, { pacingConfig: DEFAULTS, density: null, fightOpen: true }).route).toBe('narrate');
    }
  });

  it('its reply is the reader\'s format: risk only on a rolled move, no key it would give as null or false, move always given', () => {
    const develop = LONG_HAUL.rehearsal.find(e => e.move?.id === 'develop_your_relationship');
    const gather = LONG_HAUL.rehearsal.find(e => e.move?.id === 'gather_information');
    const plain = LONG_HAUL.rehearsal.find(e => e.text === 'I look over the wreckage drifting off the ring.');
    const kept = (j) => Object.entries(j).filter(([k]) => k !== 'move').every(([, v]) => v !== null && v !== false);
    const of = (entry) => JSON.parse(replyTo(standIn(LONG_HAUL, entry), userFor(entry.text)));
    expect(of(gather)).toEqual({ move: 'gather_information', asked: true, risk: 'high', category: 'exploration', confidence: 'high', reason: 'Rehearsal: the script makes this line Gather Information.', stat: 'wits' });
    expect(of(develop), 'THE MOVES lists it as made with no roll: it has no risk').toEqual({ move: 'develop_your_relationship', asked: true, category: 'exploration', confidence: 'high', reason: 'Rehearsal: the script makes this line Develop Your Relationship.', target: 'Tamsin Okoro' });
    expect(of(plain)).toEqual({ move: null, category: 'social', confidence: 'high', reason: 'Rehearsal: narrated, no roll.' });
    for (const entry of [develop, gather, plain]) expect(kept(of(entry))).toBe(true);
  });

  it('a roll asked for is never no move; a chosen move is the card\'s, read with the script\'s stat and target where the script\'s move is that move', () => {
    const plain = LONG_HAUL.rehearsal.find(e => e.text === 'I look over the wreckage drifting off the ring.');
    const asked = parseReading(replyTo(standIn(LONG_HAUL, plain), userFor(plain.text, READING_MODES.ROLL)), { mode: READING_MODES.ROLL, narration: plain.text });
    expect(asked, 'Face Danger +wits, as the two readers\' stand-in read a roll of a plain line').toMatchObject({ moveId: 'face_danger', failed: null, interpretation: { statUsed: 'wits' } });
    const enter = LONG_HAUL.rehearsal.find(e => e.move?.id === 'enter_the_fray');
    expect(parseReading(replyTo(standIn(LONG_HAUL, enter), userFor(enter.text, READING_MODES.ROLL)), { mode: READING_MODES.ROLL, narration: enter.text }))
      .toMatchObject({ moveId: 'enter_the_fray', interpretation: { statUsed: 'edge', moveTarget: 'Ashen Wake', combatRank: 'dangerous' } });

    const milestone = CHARTERS['scenario-vow'].rehearsal.find(e => e.action === 'click' && e.move?.id === 'reach_a_milestone');
    const chosen = parseReading(replyTo(standIn(CHARTERS['scenario-vow'], milestone), userFor('I smooth out the torn ledger page.', READING_MODES.CHOSEN, 'reach_a_milestone')),
      { mode: READING_MODES.CHOSEN, chosen: { moveId: 'reach_a_milestone' }, narration: 'I smooth out the torn ledger page.' });
    expect(chosen).toMatchObject({ moveId: 'reach_a_milestone', failed: null, interpretation: { moveTarget: milestone.move.target } });
    // A card whose move the script does not make here: the card's move, with the move's own first stat.
    const other = parseReading(replyTo(standIn(LONG_HAUL, enter), userFor(enter.text, READING_MODES.CHOSEN, 'face_danger')), { mode: READING_MODES.CHOSEN, chosen: { moveId: 'face_danger' }, narration: enter.text });
    expect(other).toMatchObject({ moveId: 'face_danger', failed: null, interpretation: { moveTarget: null } });
  });

  it('the two readers\' prompts have no answer of their own: nothing sends them now', () => {
    const entry = LONG_HAUL.rehearsal.find(e => e.move?.id === 'gather_information');
    for (const system of ['You are the pacing pre-classifier for a Starforged table.', 'You are the move interpreter for a Starforged table.']) {
      expect(standIn(LONG_HAUL, entry).reply({ system, messages: [{ role: 'user', content: entry.text }] }).content[0].text).toBe('{}');
    }
  });
});

// ── through the module: decidePacing → readAndRoute, and interpretMove ──────

describe('a scripted line through the module\'s own reading, with the stand-in answering the call', () => {
  let savedFind;
  let rehearsal = null;
  const world = (text, { connections = [] } = {}) => {
    const items = connections.map((name, i) => ({ id: `bond-${i}`, type: 'progress', name, system: { subtype: 'bond', rank: 'dangerous', progress: 0 } }));
    const pc = makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel', type: 'character', system: { health: { value: 5 }, spirit: { value: 5 }, supply: { value: 5 } }, items: { contents: items } });
    game.actors._set(pc.id, pc);
    invalidateActorCache(pc.id);
    return { playerText: text, campaignState: { currentSessionId: 's1', pacing: { enabled: true, forceNextAsMove: false } }, character: { name: 'Mira Kestrel', actorId: pc.id }, apiKey: 'rehearsal-not-a-key', mischiefLevel: 'serious' };
  };
  const answering = (charter, entry) => {
    rehearsal = standIn(charter, entry);
    apiPost.mockImplementation(async (_url, _headers, body) => ({ ...rehearsal.reply(body), usage: {} }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    game.actors._reset();
    resetRecentDensity();
    savedFind = game.journal.find;
    game.journal.find = () => null;
  });
  afterEach(() => { game.journal.find = savedFind; rehearsal = null; });

  it('a line the script makes a move is read once, by the line reader, and rolled — its reading carried to the roll — after a dense run of rolls too', async () => {
    const entry = LONG_HAUL.rehearsal.find(e => e.move?.id === 'gather_information');
    answering(LONG_HAUL, entry);
    for (let i = 0; i < 5; i += 1) recordRecentDecision({ decision: 'MOVE', sceneTag: 's1', window: 5 });
    const d = await decidePacing(world(entry.text));
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost.mock.calls[0][2].system[0].text).toMatch(/^You are the line reader\b/);
    expect(apiPost.mock.calls[0][3]).toMatchObject({ label: 'lineReader' });
    expect(d).toMatchObject({ runMove: true, decision: 'MOVE', moveId: 'gather_information', route: { route: 'roll', why: 'the player asked for it' } });
    expect(d.reading).toMatchObject({ asked: true, failed: null, interpretation: { moveId: 'gather_information', statUsed: 'wits' } });
  });

  it('a plain line is narrated with nothing offered; a Make a Connection for someone already a connection is narrated, for no one else it is rolled', async () => {
    const plain = LONG_HAUL.rehearsal.find(e => e.text === 'I look over the wreckage drifting off the ring.');
    answering(LONG_HAUL, plain);
    expect(await decidePacing(world(plain.text))).toMatchObject({ runMove: false, decision: 'NARRATIVE', suggestedMove: null, reading: { moveId: null } });

    const connect = LONG_HAUL.rehearsal.find(e => e.move?.id === 'make_a_connection');
    answering(LONG_HAUL, connect);
    const held = await decidePacing(world(connect.text, { connections: ['Tamsin Vey'] }));
    expect(held).toMatchObject({ runMove: false, reading: { moveId: null, reason: expect.stringContaining('Tamsin Vey is already among the connections') } });
    answering(LONG_HAUL, connect);
    expect(await decidePacing(world(connect.text, { connections: ['Idris Vane'] }))).toMatchObject({ runMove: true, moveId: 'make_a_connection', reading: { interpretation: { statUsed: 'heart', moveTarget: 'Tamsin Vey' } } });
  });

  it('interpretMove\'s two modes: a card\'s chosen move read with the script\'s stat, and a roll asked for of a plain line', async () => {
    const swear = LONG_HAUL.rehearsal.find(e => e.action === 'click' && e.move?.id === 'swear_an_iron_vow');
    answering(LONG_HAUL, swear);
    const { campaignState } = world('');
    const vow = await interpretMove('I swear to find who is raiding the Cinder Expanse lanes.', { campaignState, mischiefLevel: 'serious', apiKey: 'rehearsal-not-a-key', expectedMoveSlug: 'swear_an_iron_vow' });
    expect(apiPost.mock.calls.at(-1)[2].messages[0].content).toMatch(/^MODE — THE MOVE IS CHOSEN: swear_an_iron_vow\b/);
    expect(vow).toMatchObject({ moveId: 'swear_an_iron_vow', statUsed: 'heart' });

    const plain = LONG_HAUL.rehearsal.find(e => e.text === 'I look over the wreckage drifting off the ring.');
    answering(LONG_HAUL, plain);
    const rolled = await interpretMove(plain.text, { campaignState, mischiefLevel: 'serious', apiKey: 'rehearsal-not-a-key', allowNoMove: false });
    expect(apiPost.mock.calls.at(-1)[2].messages[0].content).toMatch(/^MODE — A ROLL WAS ASKED FOR\b/);
    expect(rolled).toMatchObject({ moveId: 'face_danger', statUsed: 'wits' });
  });
});
