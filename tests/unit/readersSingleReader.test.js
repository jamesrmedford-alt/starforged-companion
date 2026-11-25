/**
 * STARFORGED COMPANION
 * tests/unit/readersSingleReader.test.js
 *
 * The readers' plain-line test, extended to measure the one reader beside
 * today's two (issue #384 — decisions.md → "Overhauls 1 and 4", slice 1;
 * the scope's section 8.1): the parts that decide something without a
 * browser —
 *
 *   - the arms by design and model (`two:` / `one:`, a bare model is `two:`);
 *   - the list's new lines: the fights, each read with the character's
 *     position in it set; issue #383's kinds, two lines a kind; a named move
 *     after a run of moves (`recentMoves`, `named`, `want.rolled`); a plain
 *     question to a connection at low spirit;
 *   - the list's own checks of them;
 *   - what the one reader's reading comes to (its route), its score, and the
 *     run's new numbers: calls and time by where a line ended, a line's cost,
 *     the dials' share, the kinds, the fights — and the switch's criteria;
 *   - that the harness names the one reader's call by its function:
 *     `callReaderAPI>readLine`.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  OUTCOME, armsOf, compareDesigns, fightOf, positionLegal, readingOf, report, routeOf, scoreCase, summarise, validateCases,
} from '../../test/ci/playwright/lib/readers.mjs';
import { createClaudeHarness } from '../../test/ci/playwright/lib/claude.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const LIST   = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'readers/plain-lines.json'), 'utf8'));
const CONFIG = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'explore.config.json'), 'utf8'));
const PRICES = CONFIG.prices.usdPerMillionTokens;
const SONNET = 'claude-sonnet-5-5';

afterEach(() => vi.unstubAllGlobals());

const byId = (id) => LIST.cases.find(c => c.id === id);

// ── the arms ─────────────────────────────────────────────────────────────────

describe('armsOf — an arm is a design and a model', () => {
  it('two: today\'s two readers, one: the one reader; a bare model is two:, as runs named before read', () => {
    expect(armsOf(['two:claude-sonnet-5-5', 'one:claude-sonnet-5-5', 'one:claude-haiku-5-5', 'claude-haiku-5-5'])).toEqual({
      arms: [
        { id: 'two:claude-sonnet-5-5', design: 'two', model: SONNET },
        { id: 'one:claude-sonnet-5-5', design: 'one', model: SONNET },
        { id: 'one:claude-haiku-5-5', design: 'one', model: 'claude-haiku-5-5' },
        { id: 'claude-haiku-5-5', design: 'two', model: 'claude-haiku-5-5' },
      ],
      problems: [],
    });
    expect(armsOf(['three:claude-sonnet-5-5', 'one:', 'one:claude-sonnet-5-5', 'one:claude-sonnet-5-5']))
      .toEqual({ arms: [{ id: 'one:claude-sonnet-5-5', design: 'one', model: SONNET }], problems: ['arm "three:claude-sonnet-5-5": its design is two or one, not "three"', 'arm "one:" names no model'] });
  });

  it('the runner reads its arms this way, and knows the one reader\'s call by its function', () => {
    const runner = fs.readFileSync(path.join(PLAYWRIGHT, 'readers.mjs'), 'utf8');
    expect(runner).toContain('armsOf(ARM_SPECS)');
    expect(runner).toMatch(/\/readLine\/\.test\(kind/);
    expect(runner).toContain('two:claude-sonnet-5-5,one:claude-sonnet-5-5,one:claude-haiku-5-5');
  });
});

// ── the list's new lines ─────────────────────────────────────────────────────

describe('the plain lines that ship: what the one reader is measured on', () => {
  it('fights: an attack and a manoeuvre in each position, a danger that is no foe, a stated result, and an observation', () => {
    const fights = LIST.cases.filter(c => fightOf(LIST.contexts[c.context].state));
    const position = (c) => fightOf(LIST.contexts[c.context].state).position;
    expect(fights.map(c => [c.id, position(c), c.want.moves?.[0] ?? 'none'])).toEqual([
      ['fight-ahead-attack', 'in_control', 'strike'],
      ['fight-ahead-manoeuvre', 'in_control', 'gain_ground'],
      ['fight-ahead-stated', 'in_control', 'strike'],
      ['fight-ahead-fire', 'in_control', 'face_danger'],
      ['fight-pinned-attack', 'bad_spot', 'clash'],
      ['fight-pinned-manoeuvre', 'bad_spot', 'react_under_fire'],
      ['none-fight-watch', 'in_control', 'none'],
    ]);
    // The same fight, its position set by context: one track, by its label.
    expect(new Set(fights.map(c => fightOf(LIST.contexts[c.context].state).label))).toEqual(new Set(['The Cinder Wren']));
    expect(byId('none-fight-watch').family).toBe('control');
  });

  it('issue #383\'s kinds, two lines each: trust asked is talk; worth given is Develop; a claim the scene supports is a milestone, one it refutes is none; a move named after a run is rolled', () => {
    const kinds = {};
    for (const c of LIST.cases.filter(x => x.kind)) (kinds[c.kind] ??= []).push(c);
    expect(Object.fromEntries(Object.entries(kinds).map(([k, cs]) => [k, cs.map(c => c.id)]))).toEqual({
      'worth': ['develop-3', 'develop-5'],
      'claim-supported': ['progress-1', 'claim-supported'],
      'trust': ['trust-1', 'trust-2'],
      'claim-refuted': ['claim-refuted', 'claim-refuted-2'],
      'named-after-run': ['named-after-moves', 'named-after-moves-2'],
    });
    for (const c of [...kinds.trust, ...kinds['claim-refuted']]) expect(c, c.id).toMatchObject({ family: 'control', want: { none: true } });
    for (const c of kinds.worth) expect(c.want).toEqual({ moves: ['develop_your_relationship'] });
    for (const c of kinds['claim-supported']) expect(c.want).toEqual({ moves: ['reach_a_milestone'] });
    for (const c of kinds['named-after-run']) {
      expect(c.want.rolled, c.id).toBe(true);
      expect(c.recentMoves, `${c.id}: after a run of moves — three of the last five`).toBeGreaterThanOrEqual(3);
      expect(c.want.moves).toEqual([c.named]);
    }
    // The trust lines ask the connection the sheet already holds; the refuting scene says the opposite of the claim.
    for (const c of kinds.trust) expect(LIST.contexts[c.context].state.connection.name).toBe('Tamsin Okoro');
    expect(LIST.contexts['bleakhold-brig'].scene.join(' ')).toMatch(/Tamsin Okoro sold nothing/);
    expect(byId('trust-1').source).toBe('run 4 a5');
    expect(byId('claim-refuted').source).toBe('run 4 a70');
  });

  it('a plain question to her connection where spirit is below full: Hearten\'s "socialize" must not catch talk', () => {
    const c = byId('none-ask-shaken');
    expect(c).toMatchObject({ family: 'control', want: { none: true } });
    expect(LIST.contexts[c.context].state.spirit).toBeLessThan(5);
  });
});

// ── the list's own checks of them ────────────────────────────────────────────

describe('validateCases — fights, named lines, a run of moves, a line only a roll reads', () => {
  const state = { location: 'Hollow Spire', connection: { name: 'Tamsin Okoro', rank: 'dangerous', ticks: 16, bonded: false } };
  const fight = (position, extra = {}) => ({ scene: ['You duck the volley.'], state: { ...state, tracks: [{ type: 'combat', label: 'The Wren', position, ...extra }] } });
  const file = (cases, contexts) => ({ world: { settlements: [{ name: 'Hollow Spire' }] }, contexts, cases });
  const good = { id: 'ok', family: 'fight', context: 'ahead', line: 'I open up on her drive.', want: { moves: ['strike'] } };

  it('a fight gives the character\'s position; a position\'s move is wanted only in that position', () => {
    expect(validateCases(file([good, { ...good, id: 'pinned', context: 'pinned', want: { moves: ['clash'] } }], { ahead: fight('in_control'), pinned: fight('bad_spot') }))).toEqual([]);
    expect(validateCases(file([good], { ahead: fight(null) }))).toEqual([
      'context "ahead": an open fight gives the character\'s position in it (in_control or bad_spot)',
      'case "ok": strike is wanted only in a fight where the character is in control',
    ]);
    expect(validateCases(file([{ ...good, want: { moves: ['react_under_fire'] } }], { ahead: fight('in_control', { ticks: 41 }) }))).toEqual([
      'context "ahead": a track\'s ticks are a whole number from 0 to 40',
      'case "ok": react_under_fire is wanted only in a fight where the character is in a bad spot',
    ]);
    const two = { scene: ['You duck.'], state: { tracks: [{ type: 'combat', label: 'A', position: 'in_control' }, { type: 'combat', label: 'B', position: 'in_control' }, { type: 'expedition', label: 'C', position: 'bad_spot' }] } };
    expect(validateCases(file([{ ...good, context: 'two' }], { two }))).toEqual(['context "two": only a fight has a position', 'context "two": one fight at most']);
  });

  it('a named line says the move it names; a plain one still names none; recentMoves is a count; only a line wanting a move is held to a roll', () => {
    const ctx = { ahead: fight('in_control') };
    const c = (over) => ({ ...good, ...over });
    // A named line in a fight: named by the move's id, wanting it alone, rolled.
    expect(validateCases(file([c({ id: 'n1', line: 'I Strike at her drive.', named: 'strike', recentMoves: 3, want: { moves: ['strike'], rolled: true } })], ctx))).toEqual([]);
    expect(validateCases(file([
      c({ id: 'p1', line: 'I Strike at her drive.' }),
      c({ id: 'n2', line: 'I Strike at her drive.', named: true }),
      c({ id: 'n3', line: 'I open up on her drive.', named: 'strike', want: { moves: ['strike'], rolled: true } }),
      c({ id: 'n4', line: 'I Strike at her drive.', named: 'smite' }),
      c({ id: 'n5', line: 'I Strike at her drive.', named: 'strike' }),
      c({ id: 'r1', recentMoves: 2.5 }),
      c({ id: 'r2', recentMoves: 6 }),
      c({ id: 'w1', want: { none: true, rolled: true } }),
      c({ id: 'k1', kind: '' }),
    ], ctx))).toEqual([
      expect.stringMatching(/^case "p1": its line names Strike/),
      'case "n2": named "true" is no move the module knows',
      'case "n3": it is named for Strike, and its line does not name it',
      'case "n4": named "smite" is no move the module knows',
      'case "n5": a line that names Strike wants it alone, rolled (want: { moves: ["strike"], rolled: true })',
      'case "r1": its recentMoves is a whole number from 0 to 5 (the moves of the last 5 lines)',
      'case "r2": its recentMoves is a whole number from 0 to 5 (the moves of the last 5 lines)',
      'case "w1": want.rolled is true, and for a wanted move',
      'case "k1": its kind is a name',
    ]);
  });
});

// ── a reading of the one reader ──────────────────────────────────────────────

/** readAndRoute's decision, as the page returns it. */
const lineOf = (route, moveId, over = {}) => ({
  design: 'one',
  line: {
    runMove: route === 'roll', decision: { roll: 'MOVE', offer: 'NARRATIVE_WITH_MOVE_AVAILABLE', narrate: 'NARRATIVE' }[route],
    suggestedMove: route === 'offer' ? moveId : null, moveId: route === 'narrate' ? null : moveId,
    category: 'combat', confidence: 0.9, reasoning: 'r [why]', unmade: null,
    route: { route, why: 'the route\'s why', moveId: route === 'narrate' ? null : moveId },
    reading: { mode: 'open', moveId, asked: false, risk: 'high', category: 'combat', confidence: 'high', reason: 'the reader\'s reason', failed: null,
      interpretation: moveId ? { moveId, mischiefApplied: false } : null },
    ...over,
  },
});

describe('readingOf — the one reader: its route is what the line comes to', () => {
  it('roll → the move rolled; offer → the move on the button; narrate → nothing', () => {
    expect(readingOf(lineOf('roll', 'clash'))).toMatchObject({ design: 'one', route: 'roll', move: 'clash', offered: null, failed: null, asked: false, risk: 'high', category: 'combat',
      reasons: { line: 'the reader\'s reason', route: 'the route\'s why' } });
    expect(readingOf(lineOf('offer', 'develop_your_relationship'))).toMatchObject({ move: null, offered: 'develop_your_relationship' });
    expect(readingOf(lineOf('narrate', null))).toMatchObject({ move: null, offered: null, failed: null });
    // A scene-challenge move is the ordinary move it varies, as for the two readers.
    expect(readingOf(lineOf('offer', 'face_danger_scene_challenge')).offered).toBe('face_danger');
  });

  it('what the gate refused rides with a narration', () => {
    const r = readingOf(lineOf('narrate', 'heal', { unmade: { moveId: 'heal', why: 'nothing to heal' }, moveId: null }));
    expect(r).toMatchObject({ move: null, offered: null, unmade: { moveId: 'heal', why: 'nothing to heal' } });
  });

  it('a reading the reader failed on is no reading, and is not scored', () => {
    const fallback = { design: 'one', line: { runMove: true, decision: 'MOVE', fallback: true, reasoning: 'fallback: the reply could not be read', moveId: null, route: null,
      reading: { failed: 'the reply could not be read' } } };
    expect(readingOf(fallback).failed).toBe('the line reader did not read the line (the reply could not be read)');
    expect(readingOf({ design: 'one', line: null, lineError: 'boom' }).failed).toBe('the line reader gave no reading (boom)');
    expect(scoreCase({ moves: ['strike'] }, readingOf(fallback))).toBe(OUTCOME.FAILED);
  });

  it('a line that asks to be rolled is read only when it is', () => {
    const want = { moves: ['set_a_course'], rolled: true };
    expect(scoreCase(want, readingOf(lineOf('roll', 'set_a_course')))).toBe(OUTCOME.ROLLED);
    expect(scoreCase(want, readingOf(lineOf('offer', 'set_a_course')))).toBe(OUTCOME.OFFERED_NOT_ROLLED);
    expect(scoreCase({ moves: ['set_a_course'] }, readingOf(lineOf('offer', 'set_a_course')))).toBe(OUTCOME.OFFERED);
    expect(scoreCase(want, readingOf(lineOf('offer', 'undertake_an_expedition')))).toBe(OUTCOME.ANOTHER_OFFERED);
  });

  it('positionLegal, routeOf', () => {
    expect([positionLegal('strike', 'in_control'), positionLegal('strike', 'bad_spot'), positionLegal('react_under_fire', 'in_control'), positionLegal('clash', 'bad_spot'), positionLegal('face_danger', 'bad_spot'), positionLegal('strike', null)])
      .toEqual([true, false, false, true, true, true]);
    expect([routeOf(readingOf(lineOf('roll', 'clash'))), routeOf(readingOf(lineOf('offer', 'heal'))), routeOf(readingOf(lineOf('narrate', null))), routeOf({ failed: 'x' })])
      .toEqual(['rolled', 'offered', 'narrated', null]);
  });
});

// ── the run's new numbers, and the switch ────────────────────────────────────

const usage = (input, output, cacheRead = 0) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0 });

/** One reading of a made-up run, by an arm of either design. */
function result(armId, c, replies, { ms = [1300, 3000], line = 2100 } = {}) {
  const [design, model] = armId.split(':');
  const reading = readingOf(replies);
  const calls = design === 'one'
    ? [{ reader: 'line', model, ms: line, usage: usage(1400, 200, 7000) }]
    : [{ reader: 'pacing', model, ms: ms[0], usage: usage(850, 120, 6300) },
      ...(replies.pacing?.decision === 'MOVE' ? [{ reader: 'move', model, ms: ms[1], usage: usage(870, 380, 6500) }] : [])];
  return { arm: armId, design, model, id: c.id, family: c.family, ...(c.kind ? { kind: c.kind } : {}), fight: c.fight ?? null, line: c.line, want: c.want,
    outcome: scoreCase(c.want, reading), reading, calls };
}
const two = (decision, move = null, interp = null) => ({
  pacing: { runMove: decision === 'MOVE', decision, suggestedMove: decision === 'NARRATIVE_WITH_MOVE_AVAILABLE' ? move : null,
    ...(decision === 'MOVE' ? { nominatedMove: move, classifierRead: true } : {}), category: 'combat', confidence: 0.8, reasoning: 'p' },
  interpretation: interp ? { moveId: interp, statUsed: 'iron', confidence: 'high', mischiefApplied: false, rationale: 'm' } : null,
});

const C = {
  attack:  { id: 'fight-pinned-attack', family: 'fight', fight: 'bad_spot', line: 'I return fire.', want: { moves: ['clash'] } },
  watch:   { id: 'none-fight-watch', family: 'control', fight: 'in_control', line: 'I watch.', want: { none: true } },
  trust:   { id: 'trust-1', family: 'control', kind: 'trust', line: 'Will you be that?', want: { none: true } },
  worth:   { id: 'develop-5', family: 'connection', kind: 'worth', line: 'It is hers.', want: { moves: ['develop_your_relationship'] } },
  gather:  { id: 'gather-2', family: 'action', line: 'I go down the ledger.', want: { moves: ['gather_information'] } },
};

function madeUpRun({ oneGathers = 'roll', oneClash = 'clash' } = {}) {
  return [
    result('two:claude-sonnet-5-5', C.attack, two('MOVE', 'clash', 'clash')),
    result('one:claude-sonnet-5-5', C.attack, lineOf('roll', oneClash)),
    result('two:claude-sonnet-5-5', C.watch, two('NARRATIVE')),
    result('one:claude-sonnet-5-5', C.watch, lineOf('narrate', null)),
    result('two:claude-sonnet-5-5', C.trust, two('NARRATIVE_WITH_MOVE_AVAILABLE', 'develop_your_relationship')),
    result('one:claude-sonnet-5-5', C.trust, lineOf('narrate', null)),
    result('two:claude-sonnet-5-5', C.worth, two('NARRATIVE')),
    result('one:claude-sonnet-5-5', C.worth, lineOf('offer', 'develop_your_relationship')),
    result('two:claude-sonnet-5-5', C.gather, two('MOVE', 'gather_information', 'gather_information')),
    result('one:claude-sonnet-5-5', C.gather, lineOf(oneGathers, 'gather_information')),
  ];
}

describe('summarise — the one reader\'s numbers beside the two\'s', () => {
  const s = summarise(madeUpRun(), { prices: PRICES });

  it('each arm knows its design and model; the kinds; the fights', () => {
    expect(s.kinds).toEqual(['trust', 'worth']);
    expect(s.byArm['one:claude-sonnet-5-5']).toMatchObject({ design: 'one', model: SONNET, byKind: { trust: { readings: 1, wanted: 1 }, worth: { readings: 1, wanted: 1 } } });
    expect(s.byArm['two:claude-sonnet-5-5']).toMatchObject({ design: 'two', byKind: { trust: { readings: 1, wanted: 0 }, worth: { readings: 1, wanted: 0 } } });
    expect(s.byArm['one:claude-sonnet-5-5'].fights).toEqual({ readings: 2, wanting: 1, read: 1, illegal: 0, controls: 1, controlsRolled: 0 });
    // A Strike rolled in a bad spot is a reading no position allows.
    expect(summarise(madeUpRun({ oneClash: 'strike' }), { prices: PRICES }).byArm['one:claude-sonnet-5-5'].fights).toMatchObject({ read: 0, illegal: 1 });
  });

  it('calls a line, time by where the line ended, a line\'s cost, and the dials\' share', () => {
    const one = s.byArm['one:claude-sonnet-5-5'];
    const two_ = s.byArm['two:claude-sonnet-5-5'];
    expect(one.spend).toMatchObject({ calls: 5, lineCalls: 5, pacingCalls: 0, moveCalls: 0, callsPerLine: 1 });
    expect(two_.spend).toMatchObject({ calls: 7, pacingCalls: 5, moveCalls: 2, callsPerLine: 1.4 });
    expect(two_.spend.routes).toMatchObject({ rolled: { n: 2, medianMs: 4300 }, narrated: { n: 2, medianMs: 1300 }, offered: { n: 1, medianMs: 1300 } });
    expect(one.spend.routes).toMatchObject({ rolled: { n: 2, medianMs: 2100 }, offered: { n: 1 }, narrated: { n: 2 } });
    expect(one.spend.lineUsd.n).toBe(5);
    expect(one.spend.lineUsd.median).toBeGreaterThan(0);
    // The mean beside the median: two readers' lines of one call and of two make a mix the median hides.
    expect(two_.spend.lineUsd.mean).toBeGreaterThan(two_.spend.lineUsd.median);
    expect(one.spend.lineUsd.mean).toBeCloseTo(one.spend.usd / 5, 10);
    // Of the lines read whose move makes an action roll: both arms rolled the Clash and the Gather Information.
    expect([one.actionRead, one.actionRolled, one.rolledShare]).toEqual([2, 2, 1]);
    expect(two_.rolledShare).toBe(1);
  });
});

describe('compareDesigns — the switch\'s criteria, model by model', () => {
  it('pairs a one: arm with the two: arm on its model, and says which criteria hold', () => {
    const [pair] = compareDesigns(summarise(madeUpRun(), { prices: PRICES }));
    expect(pair).toMatchObject({ model: SONNET, two: 'two:claude-sonnet-5-5', one: 'one:claude-sonnet-5-5' });
    const by = Object.fromEntries(pair.criteria.map(c => [c.n, c]));
    expect(by[1]).toMatchObject({ pass: true });                 // read 3 against 2
    expect(by[2]).toMatchObject({ pass: true, detail: '0 of 2 against 1 of 2' });
    expect(by[3].pass).toBe(true);
    // Three readings of four, rounded up: one of one holds.
    expect(by[4]).toMatchObject({ pass: true, detail: 'trust 1 of 1; worth 1 of 1' });
    expect(by[5]).toMatchObject({ pass: true });
    expect(by[6].detail).toMatch(/^rolled 2\.10 s against 4\.30 s; narrated 2\.10 s against 1\.30 s$/);
    expect(by[6].pass, 'a narrated line 0.8 s slower is too slow').toBe(false);
    // The median as the criterion words it decides; the mean is told beside it.
    expect(by[7].detail).toMatch(/^\$\d\.\d{4} against \$\d\.\d{4}; the mean line \$\d\.\d{4} against \$\d\.\d{4}$/);
    expect(by[8]).toMatchObject({ pass: true });
    expect(by[9]).toMatchObject({ pass: true, detail: '0 of 5' });
    expect(pair.verdict).toBe('do not switch');
  });

  it('a criterion with nothing to measure is open, and the verdict says the run did not measure it all', () => {
    const run = madeUpRun().filter(r => !r.fight && !r.kind);
    const [pair] = compareDesigns(summarise(run, { prices: PRICES }));
    expect(pair.criteria.find(c => c.n === 4)).toMatchObject({ pass: null, detail: 'no kind was read' });
    expect(pair.criteria.find(c => c.n === 5)).toMatchObject({ pass: null, detail: 'no fight line was read' });
    expect(['do not switch', 'not measured in full']).toContain(pair.verdict);
    expect(compareDesigns(summarise(run.filter(r => r.design === 'two'), { prices: PRICES }))).toEqual([]);
  });

  it('the dials\' share strays: an arm that offers what the other rolls', () => {
    const [pair] = compareDesigns(summarise(madeUpRun({ oneGathers: 'offer' }), { prices: PRICES }));
    expect(pair.criteria.find(c => c.n === 8)).toMatchObject({ pass: false, detail: '50% (1 of 2) against 100% (2 of 2)' });
  });
});

describe('report — the one reader\'s sections', () => {
  const summary = summarise(madeUpRun(), { prices: PRICES });
  const text = report(summary, { mode: 'live', repeats: 1, questions: ['Does the one reader read as well as the two?'] });

  it('says how an arm of the one design is scored, and gives its line in words with asked and risk', () => {
    expect(text).toContain('An arm `one:<model>` reads each line with the one reader instead');
    expect(text).toContain(`**${OUTCOME.OFFERED_NOT_ROLLED}**`);
    expect(text).toMatch(/- `one:claude-sonnet-5-5` — \*\*narrated\*\*: the line reader narrates it, with no move offered/);
    expect(text).toContain('the line reader narrates it, with no move offered (combat, risk high) — “the reader\'s reason” [the route\'s why]');
  });

  it('has calls and time by where a line ended, the dials\' share, the kinds, the fights and the switch\'s criteria', () => {
    for (const heading of ['## Calls and time by where a line ended', '## The dials\' share', '## By kind', '## Fights', '## Against the switch criteria']) expect(text).toContain(heading);
    expect(text).toContain('| `one:claude-sonnet-5-5` | 1.00 | ');
    expect(text).toContain('| `two:claude-sonnet-5-5` | 1.40 | 1.3 s (2) | 1.3 s (1) | 4.3 s (2) |');
    expect(text).toContain('| trust | 0 of 1 | 1 of 1 |');
    expect(text).toContain('### `one:claude-sonnet-5-5` against `two:claude-sonnet-5-5` — do not switch');
    expect(text).toContain('| 6 | time: a rolled line 1 s faster, a narrated one no more than 0.3 s slower | **no** |');
    expect(text).toContain('| `one:claude-sonnet-5-5` | 5 (the line reader) |');
    // The limits say the fights are set by hand, and the density by the case.
    expect(text).toContain('A fight is one track with the character\'s position in it set by hand');
    expect(text).toContain('and set, before a line whose case says it follows a run of moves (`recentMoves`), to that many moves of the last five');
  });
});

// ── the harness names the one reader's call by its function ──────────────────

describe('the Claude harness names the line reader\'s call', () => {
  it('callReaderAPI>readLine — the kind the runner\'s gate lets through and an arm sends to its model', async () => {
    const stack = [
      'Error',
      '    at window.fetch (http://foundry:30000/game:1:1)',
      '    at apiPost (http://foundry:30000/modules/starforged-companion/src/api-proxy.js:60:21)',
      '    at callReaderAPI (http://foundry:30000/modules/starforged-companion/src/moves/reader.js:300:9)',
      '    at async readLine (http://foundry:30000/modules/starforged-companion/src/moves/reader.js:270:23)',
      '    at async readAndRoute (http://foundry:30000/modules/starforged-companion/src/pacing/readAndRoute.js:150:15)',
    ].join('\n');
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => new Response(JSON.stringify({ model: JSON.parse(init.body).model, content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 })));
    const asked = [];
    const harness = createClaudeHarness({ mode: 'record', apiKey: 'sk-test', log: () => {}, model: (kind) => { asked.push(kind); return 'claude-haiku-5-5'; } });
    let bridge = null;
    harness.attach({ exposeFunction: async (_n, fn) => { bridge = fn; }, addInitScript: async () => {} }, 'gm');
    await bridge({ url: 'https://api.anthropic.com/v1/messages', headers: {}, stack, body: JSON.stringify({ model: SONNET, max_tokens: 1300, messages: [] }) });
    expect(asked).toEqual(['callReaderAPI>readLine']);
    expect(harness.requests[0]).toMatchObject({ kind: 'callReaderAPI>readLine', model: 'claude-haiku-5-5', modelAsked: SONNET });
  });
});
