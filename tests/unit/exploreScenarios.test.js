/**
 * STARFORGED COMPANION
 * tests/unit/exploreScenarios.test.js
 *
 * The suite of short scenarios (test/ci/playwright/suites/scenarios.json,
 * suite.mjs, lib/suite.mjs) — beside the long haul, not in place of it. The
 * long haul is the memory-stability test, with caps that are a settled
 * decision; a scenario starts from a seeded state of its own, so each flow is
 * tested whatever happens to the others (the long haul's third live run lost
 * five beats to one card that was never made).
 *
 * Held here: every scenario charter the suite ships can run in it (beats with
 * checks the observer knows, a seed the seed writer can make, caps within the
 * suite's ceiling, a rehearsal that walks every beat, no move named in what
 * the player is given to type); the suite runner's pure parts (which
 * scenarios run, whether the next may start, what each run's files say, the
 * summary); the checks the scenarios added (lib/beats.mjs), each with the
 * defect it catches; what the rehearsal's stand-in does for them
 * (lib/rehearsal.mjs).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CAP_KEYS, SCENARIO_BEATS, capsProblem, isButtonLabel, mayStart, scenarioProblem, scenarioResult, suitePlan, suiteSummary, summaryMarkdown,
} from '../../test/ci/playwright/lib/suite.mjs';
import { charterProblem } from '../../test/ci/playwright/lib/charter.mjs';
import { BEAT_CHECKS, createPointer } from '../../test/ci/playwright/lib/beats.mjs';
import { SEED_IMPACTS, seedProblem, seedSheet, seedVows } from '../../test/ci/playwright/lib/world.mjs';
import { createRehearsal, vowTruthsToTell } from '../../test/ci/playwright/lib/rehearsal.mjs';
import { movesNamedIn } from '../../test/ci/playwright/lib/moveNames.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, rel), 'utf8'));
const SUITE = { name: 'scenarios', ...read('suites/scenarios.json') };
const CHARTERS = Object.fromEntries(SUITE.scenarios.map(name => [name, { name, ...read(`charters/${name}.json`) }]));
const LONG_HAUL = read('charters/long-haul.json');

// ── the suite as it ships ────────────────────────────────────────────────────

describe('the scenarios suite, beside the long haul', () => {
  it('names its scenarios, each a charter of its own; the long haul is not one of them, and its caps are its own still', () => {
    expect(SUITE.scenarios).toEqual(['scenario-fight', 'scenario-connection', 'scenario-vow', 'scenario-recovery', 'scenario-expedition', 'scenario-scene-answer']);
    expect(new Set(SUITE.scenarios).size).toBe(SUITE.scenarios.length);
    expect(SUITE.scenarios).not.toContain('long-haul');
    expect(LONG_HAUL.caps, 'the long haul\'s caps are a settled decision').toEqual({ actions: 100, calls: 400, minutes: 60, usd: 15 });
    for (const name of SUITE.scenarios) expect(CHARTERS[name].name, 'a scenario\'s file and its name agree').toBe(name);
  });

  it('holds every scenario well under the long haul: its ceiling, and a total the scenarios\' caps fit in', () => {
    expect(SUITE.ceiling).toEqual({ actions: 15, calls: 60, minutes: 10, usd: 1.5 });
    for (const k of CAP_KEYS) expect(SUITE.ceiling[k]).toBeLessThan(LONG_HAUL.caps[k]);
    const sum = Object.values(CHARTERS).reduce((n, c) => n + c.caps.usd, 0);
    expect(sum, 'every scenario can run to its cap and the suite stays within its total').toBeLessThanOrEqual(SUITE.total.usd);
  });

  for (const name of Object.keys(CHARTERS)) {
    describe(name, () => {
      const c = CHARTERS[name];
      it('can run in the suite: beats with checks the observer knows, a seed that can be made, caps within the ceiling', () => {
        expect(scenarioProblem(c, SUITE)).toBeNull();
        expect(charterProblem(c)).toBeNull();
        expect(seedProblem(c.seed)).toBeNull();
        expect(c.beats.length).toBeGreaterThanOrEqual(SCENARIO_BEATS.min);
        expect(c.beats.length).toBeLessThanOrEqual(SCENARIO_BEATS.max);
        for (const b of c.beats) expect(BEAT_CHECKS[b.check.type], `${b.id}: ${b.check.type}`).toBeTypeOf('function');
        expect(c.flow, 'what it is about, for the summary').toBeTruthy();
      });

      it('begins with the table\'s own Begin a Session, and its rehearsal walks every beat', () => {
        expect(c.beats[0]).toMatchObject({ n: 1, check: { type: 'sessionBegun', n: 1 } });
        for (const b of c.beats) expect(c.rehearsal.some(e => e.beat === b.n), `beat ${b.n} (${b.id}) has a rehearsal entry`).toBe(true);
        expect(c.rehearsal.slice(0, 2).map(e => e.text ?? e.title)).toEqual(['!begin-session', 'Begin a Session']);
      });

      it('gives the player nothing to type that names a move — a beat that wants one says how to name it only as a last resort', () => {
        for (const b of c.beats) {
          for (const words of [...String(b.tell).matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(w => !isButtonLabel(w))) {
            expect(movesNamedIn(words), `beat ${b.n}: "${words}"`).toEqual([]);
          }
          if (b.wants) {
            expect(movesNamedIn(b.playerTitle ?? b.title), `beat ${b.n}'s title as the player sees it`).toEqual([]);
            expect(movesNamedIn(b.lastResort).length, `beat ${b.n}'s last resort names the move`).toBeGreaterThan(0);
          }
        }
        for (const e of c.rehearsal.filter(x => x.action === 'say')) expect(movesNamedIn(e.text), e.text).toEqual([]);
      });

      it('scripts only its decisive rolls, each armed by the move it names', () => {
        for (const b of c.beats.filter(x => x.dice)) {
          expect(['miss', 'weak_hit', 'strong_hit', 'burnable']).toContain(b.dice.roll);
          expect(b.dice.moves.length).toBeGreaterThan(0);
        }
      });
    });
  }

  it('says what each scenario seeds, through the seed writer: a fight\'s momentum, a wound', () => {
    expect(seedSheet(CHARTERS['scenario-fight'].seed)).toEqual({ meters: { momentum: 5 }, impacts: [] });
    expect(seedSheet(CHARTERS['scenario-recovery'].seed)).toEqual({ meters: { health: 3 }, impacts: ['wounded'] });
    expect(seedVows(CHARTERS['scenario-fight'].seed).map(v => v.name)).toEqual(['Find the lost colony ship Verity\'s Hope', 'Drive the raider cutters out of the Cinder Expanse']);
    for (const c of Object.values(CHARTERS)) expect(c.seed.pc.vows[0].name, 'the background vow first').toBe('Find the lost colony ship Verity\'s Hope');
  });

  it('lists what it does not test yet, each with why — and the summary says so', () => {
    expect(SUITE.toAdd.map(t => t.name)).toEqual(['scenario-oracle', 'scenario-scene-question', 'scenario-correction']);
    for (const t of SUITE.toAdd) expect(SUITE.scenarios).not.toContain(t.name);
    const md = summaryMarkdown(suiteSummary({ suite: SUITE, mode: 'rehearsal', startedAt: 't0', results: [] }));
    expect(md).toContain('## Not in the suite yet');
    expect(md).toContain('**scenario-oracle** — an oracle\'s yes/no that the narration must keep.');
  });
});

// ── the charter's own rules ──────────────────────────────────────────────────

describe('what a charter needs, and what a scenario needs besides', () => {
  const fight = CHARTERS['scenario-fight'];

  it('a charter with beats needs no fact — one without beats still needs one that decides it', () => {
    expect(charterProblem({ ...fight, facts: [] })).toBeNull();
    expect(charterProblem({ ...fight, beats: [], facts: [] })).toBe('it needs at least one required fact');
    expect(charterProblem({ ...fight, facts: [{ id: 'x', variants: [] }] })).toBe('every fact needs an id and its accepted variants');
    expect(charterProblem({ ...fight, persona: '' })).toBe('it needs a persona and a goal');
    expect(charterProblem({ ...fight, beats: [{ ...fight.beats[0], check: { type: 'nope' } }] })).toMatch(/a check the observer knows \(nope\)/);
    expect(charterProblem({ ...fight, beats: [{ ...fight.beats[1], needs: ['zz'] }] })).toMatch(/needs zz/);
    // The memory charter and the long haul are as they were.
    expect(charterProblem({ name: 'memory', ...read('charters/memory.json') })).toBeNull();
    expect(charterProblem({ name: 'long-haul', ...LONG_HAUL })).toBeNull();
  });

  it('a seed the seed writer cannot make is refused by name', () => {
    const seed = (pc, extra = {}) => ({ ...fight.seed, ...extra, pc: { ...fight.seed.pc, ...pc } });
    expect(seedProblem(seed({ meters: { health: 7 } }))).toBe('the character\'s health (7) is not 0 to 5');
    expect(seedProblem(seed({ meters: { momentum: -7 } }))).toBe('the character\'s momentum (-7) is not -6 to 10');
    expect(seedProblem(seed({ meters: { luck: 2 } }))).toBe('the character has no meter "luck"');
    expect(seedProblem(seed({ impacts: ['bruised'] }))).toBe('the sheet has no impact "bruised"');
    expect(seedProblem(seed({ vows: [{ name: 'A vow', rank: 'legendary' }] }))).toBe('the vow "A vow" has a rank the module does not know (legendary)');
    expect(seedProblem(seed({ vows: [{ name: ' ' }] }))).toBe('a vow has no name');
    expect(seedProblem(seed({ stats: { grit: 2 } }))).toBe('the character has no stat "grit"');
    expect(seedProblem(seed({}, { at: 'Nowhere' }))).toBe('the ship is put at "Nowhere", which the seed does not make');
    expect(seedProblem(seed({}, { map: { shipAt: 'Nowhere' } }))).toBe('the ship\'s token is put at "Nowhere", which the seed does not make');
    expect(SEED_IMPACTS).toEqual(expect.arrayContaining(['wounded', 'shaken', 'unprepared', 'battered']));
    // The long haul's and the memory charter's seeds are good as they are.
    expect(seedProblem(LONG_HAUL.seed)).toBeNull();
    expect(seedSheet(LONG_HAUL.seed), 'a seed that sets none leaves the sheet as a new character has it').toEqual({ meters: {}, impacts: [] });
  });

  it('a scenario: three to eight beats numbered in order, caps of its own within the ceiling, a rehearsal on its own beats', () => {
    expect(scenarioProblem({ ...fight, beats: fight.beats.slice(0, 2) }, SUITE)).toBe('a scenario has 3 to 8 beats, not 2');
    const gap = fight.beats.filter(b => b.id !== 'f2').map(({ needs: _needs, ...b }) => b);
    expect(scenarioProblem({ ...fight, beats: gap }, SUITE)).toMatch(/numbered 1, 3, 4, 5/);
    expect(scenarioProblem({ ...fight, caps: undefined }, SUITE)).toBe('its caps need actions (a positive number)');
    expect(scenarioProblem({ ...fight, caps: { ...fight.caps, usd: 2 } }, SUITE)).toBe('its usd cap (2) is above the suite\'s ceiling (1.5)');
    expect(scenarioProblem({ ...fight, caps: LONG_HAUL.caps }, SUITE), 'the long haul\'s caps are no scenario\'s').toMatch(/above the suite's ceiling/);
    expect(scenarioProblem({ ...fight, rehearsal: [] }, SUITE)).toBe('it has no rehearsal script');
    expect(scenarioProblem({ ...fight, rehearsal: [...fight.rehearsal, { beat: 9, action: 'wait' }] }, SUITE)).toBe('a rehearsal entry is on beat 9, which the charter does not have');
    expect(capsProblem({ actions: 15, calls: 60, minutes: 10, usd: 1.5 }, SUITE.ceiling)).toBeNull();
    expect(capsProblem({ actions: 0, calls: 60, minutes: 10, usd: 1.5 }, SUITE.ceiling)).toBe('its caps need actions (a positive number)');
  });

  it('a scenario never gives its player a move\'s name to type — a button may carry one', () => {
    const named = { ...fight, beats: fight.beats.map(b => (b.id === 'f3' ? { ...b, tell: 'Type exactly: "I Strike at the cutter with the forward guns."' } : b)) };
    expect(scenarioProblem(named, SUITE)).toMatch(/beat 3's tell gives the player "I Strike at the cutter with the forward guns\." to type, which names Strike/);
    const line = { ...fight, rehearsal: [...fight.rehearsal, { beat: 3, action: 'say', text: 'I face danger and dive for cover.' }] };
    expect(scenarioProblem(line, SUITE)).toMatch(/the rehearsal's line "I face danger and dive for cover\." names Face Danger/);
    const title = { ...fight, beats: fight.beats.map(b => (b.id === 'f2' ? { ...b, playerTitle: 'Enter the Fray' } : b)) };
    expect(scenarioProblem(title, SUITE)).toMatch(/shows the player the title "Enter the Fray"/);
    expect(['⚔ Begin the fight', '⚑ Mark milestone', '🗺 Finish the Expedition', 'Keep the result', 'Roll Heal', '!begin-session', '@scene Who?'].map(isButtonLabel)).toEqual([true, true, true, true, true, true, true]);
    expect(isButtonLabel('I clean the gash.')).toBe(false);
  });
});

// ── the suite runner's pure parts ────────────────────────────────────────────

describe('the suite runner: which scenarios run, whether the next may start, what came of each', () => {
  it('runs the suite\'s scenarios in its order — all, or those named, and names any it does not have', () => {
    expect(suitePlan(SUITE).run).toEqual(SUITE.scenarios);
    expect(suitePlan(SUITE, { only: ['scenario-recovery', 'scenario-fight'] })).toEqual({ run: ['scenario-fight', 'scenario-recovery'], unknown: [] });
    expect(suitePlan(SUITE, { only: ['scenario-fight', 'long-haul'] }).unknown).toEqual(['long-haul']);
    expect(suitePlan({}).run).toEqual([]);
  });

  it('starts a live scenario only when its dollar cap still fits under the suite\'s total; a rehearsal and a replay spend nothing', () => {
    expect(mayStart({ spent: 0, cap: 1.5, total: 9, mode: 'live' })).toEqual({ ok: true });
    expect(mayStart({ spent: 7.5, cap: 1.5, total: 9, mode: 'live' })).toEqual({ ok: true });
    expect(mayStart({ spent: 7.6, cap: 1.5, total: 9, mode: 'live' })).toMatchObject({ ok: false, why: expect.stringContaining('past its $9 total') });
    expect(mayStart({ spent: 100, cap: 1.5, total: 9, mode: 'replay' })).toEqual({ ok: true });
    expect(mayStart({ spent: 100, cap: 1.5, total: 9, mode: 'rehearsal' }), 'a rehearsal\'s dollars are a pricing, not a spend').toEqual({ ok: true });
    expect(mayStart({ spent: 3, cap: 1.5, total: null, mode: 'live' })).toEqual({ ok: true });
  });

  // A run's own files, as explore.mjs writes them for a long run.
  const RUN = {
    classification: 'pass', because: '5 of 5 beats done; no check violated, no fact lost or refused',
    goal: { status: 'walked', beats: { beats: 5, done: 5, failed: 0, notExercised: 0 }, checks: { made: 88, violated: 0 }, ledger: { facts: 0 } },
    budget: { calls: 41, actions: 12, minutes: 4.21, usd: 0.31234, stopped: null }, playerStopped: 'every beat has been walked',
    health: { failures: [] }, replay: 'EXPLORE_MODE=replay EXPLORE_REPLAY=artifacts/explore/suite-x/scenario-fight node explore.mjs',
  };
  const BEATS = [
    { id: 'f1', n: 1, title: 'Begin a Session', status: 'done', detail: 'session 1 is open' },
    { id: 'f2', n: 2, title: 'Enter a fight', status: 'done', detail: 'the fight is open' },
    { id: 'f3', n: 3, title: 'A miss', status: 'failed', detail: 'no price' },
    { id: 'f4', n: 4, title: 'A burn', status: 'current', detail: 'no such roll yet' },
    { id: 'f5', n: 5, title: 'The end', status: 'pending', detail: '' },
  ];

  it('reads a scenario\'s run from its own files: its class, each beat, its checks, its calls and cost', () => {
    const r = scenarioResult({ name: 'scenario-fight', flow: 'a fight', dir: 'artifacts/explore/suite-x/scenario-fight', run: RUN, beats: BEATS, mechanics: { checks: 88, violations: [] }, exitCode: 0 });
    expect(r).toMatchObject({
      name: 'scenario-fight', status: 'ran', classification: 'pass', calls: 41, actions: 12, usd: 0.3123, minutes: 4.21,
      beats: { of: 5, done: 2, failed: 1, notExercised: 2 }, checks: { made: 88, violated: 0 }, ledger: null, reproduced: null,
    });
    expect(r.beats.each.map(b => b.status), 'a beat left current or pending was not exercised').toEqual(['done', 'done', 'failed', 'not-exercised', 'not-exercised']);
    expect(r.replay).toContain('EXPLORE_MODE=replay');
    const replayed = scenarioResult({ name: 'scenario-fight', run: { ...RUN, replay: { reproduced: false } }, beats: BEATS });
    expect(replayed.reproduced).toBe(false);
  });

  it('a run that wrote nothing crashed; a scenario not started says why', () => {
    expect(scenarioResult({ name: 'scenario-vow', dir: 'd', run: null, exitCode: 1 })).toMatchObject({ status: 'crashed', why: 'no run.json was written (exit 1)' });
    expect(scenarioResult({ name: 'scenario-vow', skipped: 'over the total' })).toMatchObject({ status: 'skipped', why: 'over the total', dir: null });
  });

  it('sums the suite and never calls a scenario that did not run a pass', () => {
    const ran = scenarioResult({ name: 'scenario-fight', flow: 'a fight', dir: 'd/f', run: RUN, beats: BEATS, mechanics: { checks: 88, violations: [{ step: 'a4', check: 'burn', detail: 'twice' }] } });
    const pass = scenarioResult({ name: 'scenario-vow', flow: 'a vow', dir: 'd/v', run: { ...RUN, budget: { ...RUN.budget, usd: 0.2, calls: 20 } }, beats: BEATS.slice(0, 2) });
    const crashed = scenarioResult({ name: 'scenario-recovery', dir: 'd/r', run: null, exitCode: 1 });
    const s = suiteSummary({ suite: SUITE, mode: 'rehearsal', startedAt: 't0', finishedAt: 't1', results: [ran, pass, crashed], dir: 'd' });
    expect(s.totals).toMatchObject({ scenarios: 3, ran: 2, byClass: { pass: 2 }, beats: { of: 7, done: 4, failed: 1, notExercised: 2 }, calls: 61, actions: 24, usd: 0.5123 });
    expect(s.verdict).toBe('2 of 3 scenario(s) ran (scenario-recovery: crashed); 2 pass; 4 of 7 beats done, 1 failed, 2 not exercised');
    const md = summaryMarkdown(s);
    expect(md).toContain('# Suite scenarios — rehearsal');
    expect(md).toContain('A rehearsal: every model reply came from the stand-in');
    expect(md).toContain('| scenario-fight | a fight | pass | 2 / 1 / 2 of 5 | 88 / 0 | 41 | $0.3123 | 4.21 | d/f |');
    expect(md).toContain('| scenario-recovery |  | crashed: no run.json was written (exit 1) |');
    expect(md).toContain('| 3 (f3) | A miss | failed | no price |');
    expect(md).toContain('Checks violated: a4 burn: twice.');
    expect(suiteSummary({ suite: SUITE, mode: 'live', startedAt: 't0', results: [] }).verdict).toBe('nothing was run');
  });
});

// ── the checks the scenarios added ───────────────────────────────────────────

// The table as the observer records it (lib/table.mjs), in small.
const PC = { id: 'pc', name: 'Mira Kestrel', health: 5, spirit: 5, supply: 5, momentum: 2, momentumMax: 10, momentumReset: 2, debilities: [], vows: [], bonds: [], legacies: {} };
const tableOf = (over = {}) => ({
  session: { active: true, id: 's1', pendingMove: false, xCardActive: false, questFocus: '' }, location: { id: 'L1', name: 'Hollow Spire' },
  ship: { token: null, tokenAt: null }, pcs: [{ ...PC, ...(over.pc ?? {}) }], connections: [], entityCards: [], tracks: [],
  legacy: {}, scene: { truths: [], frame: null }, helpers: {}, plans: [], ...over, pc: undefined,
});
const markOf = (step, table, cards = []) => ({ step, phase: 'session-1', table, cards });
const moveCard = (id, name, diceLine, shown) => ({ id, move: { resolutionId: id, actorId: 'pc', name, diceLine, shown, burn: null, held: null } });
const narratedAs = (id, resolutionId, moveId, outcome, extra = {}) => ({ id, narration: { resolutionId, moveId, outcome, narrationId: `n-${id}`, ...extra } });
const line = (step, text) => ({ id: `l-${step}`, step, phase: 'session-1', text, fromPlayer: true, narrator: false, card: [] });
const said = (id, step, text, card = ['narratorCard', 'narrationText']) => ({ id, step, phase: 'session-1', text, fromPlayer: false, narrator: true, vignette: null, card });
/** One beat walked over the marks: its state after the last. */
function walk(beat, marks, messages = [], charter = { cast: {}, seed: { pc: { vows: [{ name: 'Find the lost colony ship Verity\'s Hope' }] } } }) {
  const pointer = createPointer([{ id: 'b', n: 1, session: 1, title: beat.check.type, ...beat }]);
  pointer.advance({ marks: marks.slice(0, 1), messages: [], actions: [], charter }, marks[0].step);
  pointer.advance({ marks, messages, actions: [], charter }, marks.at(-1).step);
  return pointer.state[0];
}

describe('a recovery move with nothing to recover is not offered (moveOffered)', () => {
  const offered = { check: { type: 'moveOffered', moves: ['heal'] } };
  const notOffered = { check: { type: 'moveOffered', moves: ['heal'], offered: false } };
  const healthy = tableOf();
  const tend = 'I go over the healed arm with the medkit once more, to be sure of it.';

  it('done when the line is narrated with no Heal on its card and none rolled — the sheet said', () => {
    const state = walk(notOffered, [markOf('a5', healthy), markOf('a6', healthy, [narratedAs('c6', null, null, null, { pacedNarrative: true, suggestedMove: null })])],
      [line('a6', tend), said('c6', 'a6', 'You check the dressing. It holds.')]);
    expect(state).toMatchObject({ status: 'done' });
    expect(state.detail).toBe('the line at a6 was narrated with nothing of Heal offered or rolled — Mira Kestrel at health 5, spirit 5, supply 5, no impact marked');
  });

  it('the beat brought about wrongly when Heal is offered on the card, or rolled — the third live run\'s road at 5 health of 5', () => {
    const card = narratedAs('c6', null, null, null, { pacedNarrative: true, suggestedMove: 'heal' });
    expect(walk(notOffered, [markOf('a5', healthy), markOf('a6', healthy, [card])], [line('a6', tend), said('c6', 'a6', 'You could see to it.')]))
      .toMatchObject({ status: 'failed', detail: 'Heal was offered on the narration\'s Roll button at a6, with Mira Kestrel at health 5, spirit 5, supply 5, no impact marked' });
    const rolled = [moveCard('h1', 'Heal', 'Action: 4 + 1 = 5 | Challenge: 2, 9', 'weak_hit'), narratedAs('nh', 'h1', 'heal', 'weak_hit')];
    expect(walk(notOffered, [markOf('a5', healthy), markOf('a6', healthy, rolled)], [line('a6', tend)])).toMatchObject({ status: 'failed', detail: expect.stringContaining('Heal was rolled (a weak hit) at a6') });
  });

  it('not yet while no line has been answered; and, wanted, an offer or a roll is the beat', () => {
    expect(walk(notOffered, [markOf('a5', healthy), markOf('a6', healthy)], [line('a6', tend)])).toMatchObject({ status: 'current', detail: 'no line of play has been answered yet' });
    const wounded = tableOf({ pc: { health: 3, debilities: ['wounded'] } });
    const card = narratedAs('c6', null, null, null, { pacedNarrative: true, suggestedMove: 'heal' });
    expect(walk(offered, [markOf('a5', wounded), markOf('a6', wounded, [card])])).toMatchObject({ status: 'done', detail: 'Heal was offered on the narration\'s Roll button at a6, with Mira Kestrel at health 3, spirit 5, supply 5, wounded' });
  });
});

describe('a step toward the vow is marked (milestoneMarked)', () => {
  const vow = { id: 'v1', vowId: 'v1', name: 'Find who sold the convoy routes to the raiders', rank: 'troublesome', ticks: 0, completed: false };
  const background = { id: 'v0', vowId: 'seed-vow-1', name: 'Find the lost colony ship Verity\'s Hope', rank: 'epic', ticks: 0, completed: false };
  const at = (step, ticks, cards = [], bg = 0) => markOf(step, tableOf({ pc: { vows: [{ ...background, ticks: bg }, { ...vow, ticks }] } }), cards);
  const beat = { check: { type: 'milestoneMarked' } };

  it('done when the quest vow gains progress while the beat is current — and says the milestone was offered', () => {
    const offer = narratedAs('c2', null, null, null, { pacedNarrative: true, suggestedMove: 'reach_a_milestone' });
    expect(walk(beat, [at('a3', 0), at('a4', 0, [offer]), at('a5', 12)])).toMatchObject({ status: 'done', detail: 'the vow "Find who sold the convoy routes to the raiders" went from 0 to 12 ticks, the milestone offered at a4' });
  });

  it('not yet while offered and not marked, or neither — and the background vow\'s progress is not the quest\'s', () => {
    const offer = narratedAs('c2', null, null, null, { pacedNarrative: true, suggestedMove: 'reach_a_milestone' });
    expect(walk(beat, [at('a3', 0), at('a4', 0, [offer])])).toMatchObject({ status: 'current', progress: 1, detail: 'the vow "Find who sold the convoy routes to the raiders" stands at 0 ticks; the milestone was offered at a4 and is not marked' });
    expect(walk(beat, [at('a3', 0), at('a4', 0)]).detail).toBe('the vow "Find who sold the convoy routes to the raiders" stands at 0 ticks; no milestone has been offered or marked');
    expect(walk(beat, [at('a3', 0), at('a4', 0, [], 4)]).status, 'the background vow moved, not the quest').toBe('current');
  });
});

describe('a favour moves the relationship forward (relationshipDeveloped)', () => {
  const card = (ticks) => ({ hostId: 'A1', recordId: 'r1', name: 'Tamsin', rank: 'dangerous', bonded: false, active: true, ticks });
  const charter = { cast: { connection: { name: 'Tamsin Vey' } }, seed: { pc: { vows: [] } } };
  const at = (step, ticks, cards = []) => markOf(step, tableOf({ connections: [card(ticks)], entityCards: [{ id: 'A1', name: 'Tamsin', entityType: 'connection' }] }), cards);
  const beat = { check: { type: 'relationshipDeveloped' } };

  it('done when the cast\'s connection — the card made under a part of her name — gains progress', () => {
    expect(walk(beat, [at('a6', 0), at('a7', 8)], [], charter)).toMatchObject({ status: 'done', detail: 'the relationship with Tamsin went from 0 to 8 of 40 ticks' });
  });

  it('not yet while the track stands still — offered, or not', () => {
    const offer = narratedAs('c7', null, null, null, { pacedNarrative: true, suggestedMove: 'develop_your_relationship' });
    expect(walk(beat, [at('a6', 8), at('a7', 8, [offer])], [], charter)).toMatchObject({ status: 'current', progress: 1, detail: 'the relationship with Tamsin stands at 8 of 40 ticks; Develop Your Relationship was offered at a7' });
    expect(walk(beat, [at('a6', 8), at('a7', 8)], [], { cast: {}, seed: { pc: {} } }).detail, 'with nobody in the cast, no card is hers').toBe('no such connection');
  });
});

describe('a scene question is answered and nothing of it written back (sceneAnswered)', () => {
  const beat = { check: { type: 'sceneAnswered' } };
  const answerCard = { id: 'c4', narration: { narrationId: 'n-scene', sceneResponse: true } };
  const ask = '@scene Remind me, which keepsake of my sister\'s is on me?';
  const answer = said('c4', 'a4', 'Her brass star-compass. It is on you.', ['sceneResponse', 'narratorCard', 'narrationText']);

  it('done when the answer came and the scene\'s record is as it was', () => {
    const state = walk(beat, [markOf('a3', tableOf()), markOf('a4', tableOf(), [answerCard])], [line('a4', ask), answer]);
    expect(state).toMatchObject({ status: 'done', detail: 'the scene question at a4 was answered in 2 sentence(s), and nothing of the answer was written back: "Her brass star-compass. It is on you."' });
  });

  it('the beat brought about wrongly when the answer is written back — a truth of it, a draft card, a plan, the frame', () => {
    const truth = tableOf({ scene: { truths: [{ id: 't1', subject: 'Mira Kestrel', fact: 'The star-compass sits in her left coat pocket.', retracted: false, narrationId: 'n-scene' }], frame: null } });
    expect(walk(beat, [markOf('a3', tableOf()), markOf('a4', truth, [answerCard])], [line('a4', ask), answer]))
      .toMatchObject({ status: 'failed', detail: 'the scene question at a4 was answered and written back: 1 truth(s) of it stand ("The star-compass sits in her left coat pocket.")' });
    const draft = { id: 'd4', drafts: [{ name: 'Ilse', type: 'connection', status: 'pending', index: 0 }] };
    expect(walk(beat, [markOf('a3', tableOf()), markOf('a4', tableOf(), [answerCard, draft])], [line('a4', ask), answer]).detail).toContain('a draft card was raised from it ("Ilse")');
    const framed = tableOf({ scene: { truths: [], frame: { location: 'the galley', question: 'Where did Ilse get it?' } } });
    expect(walk(beat, [markOf('a3', tableOf()), markOf('a4', framed, [answerCard])], [line('a4', ask), answer]).detail).toContain('the scene\'s frame changed');
    const planned = tableOf({ plans: [{ id: 'sk-1', kind: 'mystery', subject: 'the compass', truth: 'It was stolen.', truthRevealed: false }] });
    expect(walk(beat, [markOf('a3', tableOf()), markOf('a4', planned, [answerCard])], [line('a4', ask), answer]).detail).toContain('a hidden plan was decided in its step ("the compass")');
  });

  it('not yet with no scene question, or none answered — a line of play is not one', () => {
    expect(walk(beat, [markOf('a3', tableOf()), markOf('a4', tableOf())], [line('a4', 'I look at the compass.')]).detail).toBe('no scene question has been asked');
    expect(walk(beat, [markOf('a3', tableOf()), markOf('a4', tableOf())], [line('a4', ask)]).detail).toBe('the scene question at a4 has had no answer');
  });
});

describe('a vow fulfilled with its truth told (vowFulfilled, told)', () => {
  const vow = { id: 'v1', vowId: 'v1', name: 'Find who sold the convoy routes to the raiders', rank: 'troublesome', ticks: 12, completed: false };
  const truth = 'Odile Marr, a clerk of the Hollow Spire harbour office, copied the convoy routes and sold them to the raiders.';
  const plan = (truthRevealed) => ({ id: 'sk-v', kind: 'vow', subject: vow.name, truth, truthRevealed, status: 'resolved' });
  const fulfil = [moveCard('f1', 'Fulfill Your Vow', 'Progress: 3 | Challenge: 1, 2', 'strong_hit'), narratedAs('nf', 'f1', 'fulfill_your_vow', 'strong_hit')];
  const at = (step, done, plans = [], cards = []) => markOf(step, tableOf({ pc: { vows: [{ ...vow, completed: done }] }, plans }), cards);
  const beat = { check: { type: 'vowFulfilled', told: true } };
  const prose = said('nf', 'a6', `Your word is kept. ${truth}`);

  it('done when the plan decided for the vow is revealed by its fulfilment — the narration quoted', () => {
    const state = walk(beat, [at('a5', false, [plan(false)]), at('a6', true, [plan(true)], fulfil)], [prose]);
    expect(state.status).toBe('done');
    expect(state.detail).toBe(`the vow "${vow.name}" is fulfilled (strong_hit); its truth is told ("${truth.slice(0, 120)}") — the narration: "${prose.text.slice(0, 160)}"`);
  });

  it('brought about wrongly when the truth stays untold — the third live run\'s "both are named now" — or no plan was ever decided', () => {
    const named = said('nf', 'a6', 'The thing you swore to find has a hand and a seal, and both are named now.');
    expect(walk(beat, [at('a5', false, [plan(false)]), at('a6', true, [plan(false)], fulfil)], [named]))
      .toMatchObject({ status: 'failed', detail: expect.stringContaining('its truth was not told') });
    expect(walk(beat, [at('a5', false), at('a6', true, [], fulfil)], [named])).toMatchObject({ status: 'failed', detail: expect.stringContaining('no plan was ever decided for it') });
  });

  it('not yet while its narration has not come; and without `told` the fulfilment alone is the beat, as the long haul has it', () => {
    expect(walk(beat, [at('a5', false, [plan(false)]), at('a6', true, [plan(false)], [fulfil[0]])]).detail).toContain('its narration has not come');
    expect(walk({ check: { type: 'vowFulfilled' } }, [at('a5', false), at('a6', true, [], fulfil)])).toMatchObject({ status: 'done', detail: `the vow "${vow.name}" is fulfilled (strong_hit)` });
  });
});

// ── what the rehearsal's stand-in does for the scenarios ─────────────────────

describe('the stand-in: an offered move, a fact block sent unasked, a vow\'s truth told when the prompt asks', () => {
  const classifier = { system: 'You are the pacing pre-classifier for a narrator.', messages: [{ role: 'user', content: 'Line: I smooth out the torn ledger page.' }] };
  const playerTurn = (screen) => ({ system: 'You are playtesting', tools: [{ name: 'take_action' }], messages: [{ role: 'user', content: `CURRENT BEAT: 2 of 3 [session 1] — x\n\nYOUR SCREEN NOW:\n${screen}` }] });
  const reply = (r, body) => r.reply(body).content[0];

  it('a line the script offers a move for is read as a move available, not one made', () => {
    const vow = CHARTERS['scenario-vow'];
    const r = createRehearsal({ charter: { ...vow, rehearsal: [vow.rehearsal.find(e => e.offer)] } });
    reply(r, playerTurn('[m1] Gamemaster: hello'));
    expect(JSON.parse(reply(r, classifier).text)).toMatchObject({ decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'reach_a_milestone' });
  });

  it('a fact block the script sends is sent whether or not the prompt asked for one', () => {
    const scene = CHARTERS['scenario-scene-answer'];
    const entry = scene.rehearsal.find(e => e.sidecar && e.probe);
    const r = createRehearsal({ charter: { ...scene, rehearsal: [entry] } });
    reply(r, playerTurn('[m1] Gamemaster: hello'));
    const answer = reply(r, { system: 'NARRATOR ROLE AND VOICE — an answer, not narration.', messages: [{ role: 'user', content: `QUESTION: ${entry.text}\nMira Kestrel carries her sister Ilse's brass star-compass.` }] }).text;
    expect(answer).toContain('```json');
    expect(JSON.parse(answer.split('```json')[1].split('```')[0])).toMatchObject({ newTruths: [{ fact: 'The star-compass sits in Mira\'s left coat pocket, wrapped in oilcloth.' }], sceneFrame: { question: 'Where did Ilse get the compass?' } });
  });

  // The prompt as narratorPrompt.js writes it: the plan under UNREVEALED, and
  // THIS BEAT ENDS A VOW naming it by id (vowEndingLines).
  const TRUTH = 'Odile Marr, a clerk of the Hollow Spire harbour office, copied the convoy routes and sold them to the raiders to clear her brother\'s debt.';
  const SYSTEM = [
    'NARRATOR ROLE AND VOICE', '## UNREVEALED', '### Vow — Find who sold the convoy routes to the raiders (id sk-vow1)', `Truth: ${TRUTH}`, 'Wants: to stay hidden',
    '', '### THIS BEAT ENDS A VOW', 'The move this beat narrates fulfils Vow — Find who sold the convoy routes to the raiders (id sk-vow1). What that vow set out', 'to find, do or learn is told now.',
    '', '## RESPONSE FORMAT — MANDATORY SIDECAR',
  ].join('\n');

  it('reads which vow truths a prompt asks to have told — none where it asks for none', () => {
    expect(vowTruthsToTell(SYSTEM)).toEqual([{ id: 'sk-vow1', truth: TRUTH }]);
    expect(vowTruthsToTell(SYSTEM.replace('### THIS BEAT ENDS A VOW', '### SOMETHING ELSE'))).toEqual([]);
    expect(vowTruthsToTell('')).toEqual([]);
  });

  it('tells it, and records it told, where the charter\'s stand-in is one that does — the long haul\'s is not', () => {
    const vow = CHARTERS['scenario-vow'];
    expect(vow.rehearsalPlan.tellsVowTruth).toBe(true);
    const entry = vow.rehearsal.find(e => e.move?.id === 'fulfill_your_vow');
    const r = createRehearsal({ charter: { ...vow, rehearsal: [entry] } });
    reply(r, playerTurn('[m1] Gamemaster: hello'));
    const text = reply(r, { system: SYSTEM, messages: [{ role: 'user', content: entry.text }] }).text;
    expect(text.split('```json')[0]).toContain(TRUTH);
    expect(JSON.parse(text.split('```json')[1].split('```')[0]).reveals).toEqual([{ id: 'sk-vow1', revealed: ['truth'], resolved: true }]);
    expect(LONG_HAUL.rehearsalPlan.tellsVowTruth).toBeUndefined();
    const haul = createRehearsal({ charter: { ...LONG_HAUL, rehearsal: [{ beat: 25, action: 'say', text: 'My word is kept.', move: { id: 'fulfill_your_vow', progress: true } }] } });
    reply(haul, playerTurn('[m1] Gamemaster: hello'));
    expect(reply(haul, { system: SYSTEM, messages: [{ role: 'user', content: 'My word is kept.' }] }).text.split('```json')[0]).not.toContain(TRUTH);
  });
});
