/**
 * STARFORGED COMPANION
 * tests/unit/readersPlainLines.test.js
 *
 * The two readers on plain lines (decisions.md → "A player is never made to
 * name a move"): the parts of that test that decide something without a
 * browser, checked without one.
 *
 *   - the list that ships (test/ci/playwright/readers/plain-lines.json): it
 *     can run, no line of it names a move or uses a rules word, and every
 *     family and every line kept from the live run is in it;
 *   - what the list's own checks catch;
 *   - what a pair of replies comes to at the table, as the chat pipeline acts
 *     on them, and its score against the reading the line should get;
 *   - the run's numbers — per arm, per family, where the arms differ, where
 *     an arm disagrees with itself, cost and time — and its report;
 *   - the Claude harness's `model` option, by which an arm sends the readers'
 *     calls to another model.
 *
 * The run itself — one browser at a live Foundry world — is on demand
 * (test/ci/scripts/cloud.sh readers).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DECISION, OUTCOME, STATE_READ, casesToRun, contextMismatch, readingOf, report, scoreCase, sheetOf, stateNotSet, summarise, validateCases,
} from '../../test/ci/playwright/lib/readers.mjs';
import { movesNamedIn } from '../../test/ci/playwright/lib/moveNames.mjs';
import { createClaudeHarness } from '../../test/ci/playwright/lib/claude.mjs';
import { createBudget } from '../../test/ci/playwright/lib/budget.mjs';
import { MOVES } from '../../src/schemas.js';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const LIST   = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'readers/plain-lines.json'), 'utf8'));
const CONFIG = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'explore.config.json'), 'utf8'));
const PRICES = CONFIG.prices.usdPerMillionTokens;

const HAIKU  = 'claude-haiku-5-5';
const SONNET = 'claude-sonnet-5-5';

afterEach(() => vi.unstubAllGlobals());

// ── the list that ships ──────────────────────────────────────────────────────

describe('the plain lines that ship', () => {
  it('can run: the list\'s own checks find nothing', () => {
    expect(validateCases(LIST)).toEqual([]);
  });

  it('no line names a move or uses a rules word', () => {
    const named = LIST.cases.map(c => ({ id: c.id, named: movesNamedIn(c.line) })).filter(c => c.named.length);
    expect(named).toEqual([]);
  });

  it('is about fifty lines in five to seven contexts, each a scene in the second person', () => {
    expect(LIST.cases.length).toBeGreaterThanOrEqual(45);
    expect(LIST.cases.length).toBeLessThanOrEqual(60);
    const contexts = Object.entries(LIST.contexts);
    expect(contexts.length).toBeGreaterThanOrEqual(5);
    expect(contexts.length).toBeLessThanOrEqual(7);
    for (const [key, context] of contexts) {
      expect(context.scene.join(' '), `${key}: narration as the narrator writes it`).toMatch(/\b[Yy]ou(r)?\b/);
      expect(LIST.cases.some(c => c.context === key), `${key}: a context no case uses`).toBe(true);
    }
  });

  it('covers every family, with each move it names wanted by a line', () => {
    const wantedIn = (family) => new Set(LIST.cases.filter(c => c.family === family).flatMap(c => c.want.moves ?? []));
    const families = {
      'recovery':    ['heal', 'resupply', 'repair', 'hearten', 'sojourn'],
      'connection':  ['make_a_connection', 'develop_your_relationship', 'forge_a_bond', 'test_your_relationship'],
      'vow':         ['swear_an_iron_vow', 'reach_a_milestone', 'fulfill_your_vow'],
      'travel':      ['set_a_course', 'undertake_an_expedition', 'explore_a_waypoint'],
      'action':      ['gather_information', 'face_danger', 'secure_an_advantage', 'compel', 'check_your_gear'],
      'fight entry': ['enter_the_fray'],
    };
    for (const [family, moves] of Object.entries(families)) {
      for (const move of moves) expect(wantedIn(family).has(move), `${family}: no line wants ${move}`).toBe(true);
    }
    const controls = LIST.cases.filter(c => c.want.none === true);
    expect(controls.length).toBeGreaterThanOrEqual(9);
    expect(controls.every(c => c.family === 'control')).toBe(true);
  });

  it('a bond is forged only where the relationship track is full', () => {
    const forging = LIST.cases.filter(c => (c.want.moves ?? []).includes('forge_a_bond'));
    expect(forging.length).toBeGreaterThan(0);
    for (const c of forging) expect(LIST.contexts[c.context].state.connection).toMatchObject({ ticks: 40, bonded: false });
  });

  it('keeps the live run\'s lines, as plain as the player first tried them', () => {
    const kept = [
      ['I treat my wounds with the ship\'s medkit.', { moves: ['heal'] }, 'bleakhold-after-fight'],
      ['I plot the course and take the Kobayashi IV to Bleakhold Station.', { moves: ['set_a_course'] }, null],
      ['I work the docks asking traders who saw the raiders last, pressing hard even though it may cost me Tamsin\'s trust and draw the wrong eyes.', { moves: ['gather_information'] }, null],
      ['I raise Tamsin on the comm and trade news with her, asking how the docks have been.', { moves: ['develop_your_relationship'] }, null],
      ['I offer to watch Tamsin\'s counter for an hour while she rests.', { moves: ['develop_your_relationship'] }, 'spire-stall'],
      ['I now have proof the raids are fed by dock clerks selling cargo routes.', { moves: ['reach_a_milestone'] }, 'bleakhold-clerk'],
      ['I restock the ship at Bleakhold\'s market.', { moves: ['resupply'] }, 'bleakhold-after-fight'],
      ['I turn my sister Ilse\'s brass star-compass over in my palm — the one thing of hers I still carry.', { none: true }, null],
      ['I leave the cargo manifest with Tamsin for safekeeping.', { none: true }, null],
    ];
    for (const [line, want, context] of kept) {
      const found = LIST.cases.find(c => c.line === line);
      expect(found, line).toBeTruthy();
      expect(found.want).toEqual(want);
      expect(found.source, `${found.id}: its source in the run`).toMatch(/^run 2 a\d+/);
      if (context) expect(found.context).toBe(context);
    }
    // The wounded context says so: health 3 of 5, supply 2 of 5.
    expect(LIST.contexts['bleakhold-after-fight'].state).toMatchObject({ location: 'Bleakhold Station', health: 3, supply: 2 });
  });

  it('a step toward a vow is asked for with no fight open — one of them with none behind it either — and a thought about the quest is a control', () => {
    const steps = LIST.cases.filter(c => (c.want.moves ?? []).includes('reach_a_milestone'));
    expect(steps.map(c => c.id)).toEqual(['progress-1', 'progress-2', 'progress-3', 'progress-4']);
    for (const c of steps) {
      const state = LIST.contexts[c.context].state;
      expect(state.vow?.name, `${c.id}: a vow to step toward`).toBeTruthy();
      // No fight is open in any context: the pacing reader's rules for one do not apply.
      expect((state.tracks ?? []).some(t => t.type === 'combat'), `${c.id}: no fight open`).toBe(false);
    }
    // progress-3 follows a fight that is over; progress-4 is said alone at the dock, nothing attempted and nobody told.
    expect(steps.find(c => c.id === 'progress-4').context).toBe('aboard-at-spire');
    expect(LIST.contexts['aboard-at-spire'].scene.join(' ')).not.toMatch(/\b(?:cutter that jumped|volley|scrap now)\b/);
    // Its control: a line about the quest that is no step toward it, where the same vow is open.
    const musing = LIST.cases.find(c => c.id === 'none-vow-musing');
    expect(musing).toMatchObject({ family: 'control', context: 'aboard-at-spire', want: { none: true } });
    expect(LIST.contexts[musing.context].state.vow.name).toBe('Find who is raiding the Cinder Expanse lanes');
  });

  it('a run reads a context\'s lines together, and READERS_ONLY picks a pilot', () => {
    const { cases, unknown } = casesToRun(LIST);
    expect(unknown).toEqual([]);
    expect(cases).toHaveLength(LIST.cases.length);
    const order = cases.map(c => c.context);
    const switches = order.filter((key, i) => i === 0 || key !== order[i - 1]).length;
    expect(switches, 'the world is set once a context').toBe(Object.keys(LIST.contexts).length);

    const pilot = casesToRun(LIST, ['heal-1', 'course-1', 'nobody']);
    expect(pilot.cases.map(c => c.id).sort()).toEqual(['course-1', 'heal-1']);
    expect(pilot.unknown).toEqual(['nobody']);
  });

  it('the runner\'s default arms start with the readers\' own model — whichever the module asks for', () => {
    const root = path.resolve(__dirname, '../..');
    const modelOf = (file) => /const MODEL\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(root, file), 'utf8'))?.[1];
    const own = modelOf('src/pacing/classifier.js');
    expect(own, 'both readers run on one model').toBe(modelOf('src/moves/interpreter.js'));
    expect(own).toBe(SONNET);
    const runner = fs.readFileSync(path.join(PLAYWRIGHT, 'readers.mjs'), 'utf8');
    const arms = JSON.parse(/list\(process\.env\.READERS_ARMS, (\[[^\]]+\])\)/.exec(runner)[1]);
    expect(arms).toEqual([own, HAIKU]);
    for (const arm of arms) expect(PRICES[arm], `${arm} is priced: a live run refuses a model nobody priced`).toBeTruthy();
    // The script's own log line names the same default.
    const script = fs.readFileSync(path.resolve(PLAYWRIGHT, '../scripts/cloud.sh'), 'utf8');
    expect(script).toContain(`\${READERS_ARMS:-${arms.join(',')}}`);
  });

  it('says which of a state reaches a prompt, and what the runner leaves unset', () => {
    // The sheet's meters, the ship's integrity and a vow's progress reach both
    // readers now, in their SITUATION block: the runner sets them. (They were
    // "not read by either prompt", and the first run's contexts said a wound
    // only in their narration.)
    expect(Object.keys(STATE_READ).sort()).toEqual(
      ['battered', 'connection', 'frame', 'health', 'impacts', 'integrity', 'location', 'spirit', 'supply', 'tracks', 'vow']);
    for (const key of ['health', 'spirit', 'supply', 'impacts', 'integrity', 'battered', 'vow', 'connection']) {
      expect(STATE_READ[key], key).toMatch(/^both readers' SITUATION block/);
    }
    expect(stateNotSet(LIST.contexts['bleakhold-after-fight'].state)).toEqual([]);
    expect(stateNotSet(LIST.contexts['ashfall-drift'].state).map(n => n.key)).toEqual(['tracks[].ticks']);
    expect(stateNotSet({ weather: 'ion storm', vow: { name: 'V', swornTo: 'Tamsin Okoro' } }).map(n => n.key)).toEqual(['weather', 'vow.swornTo']);
    // Every context's state is set whole: nothing of the list is left to its narration alone.
    for (const [key, context] of Object.entries(LIST.contexts)) {
      expect(stateNotSet(context.state).map(n => n.key).filter(k => k !== 'tracks[].ticks'), key).toEqual([]);
    }
  });

  it('the sheet a state gives: what it says, and full, clear and unmarked for what it does not', () => {
    expect(sheetOf(LIST.contexts['bleakhold-after-fight'].state)).toEqual({
      health: 3, spirit: 3, supply: 2, impacts: { wounded: false, shaken: false, unprepared: false },
      integrity: 3, battered: false, vowTicks: 16,
    });
    expect(sheetOf({ impacts: ['shaken'], battered: true })).toEqual({
      health: 5, spirit: 5, supply: 5, impacts: { wounded: false, shaken: true, unprepared: false },
      integrity: 5, battered: true, vowTicks: 0,
    });
    expect(sheetOf(undefined)).toMatchObject({ health: 5, integrity: 5, battered: false, vowTicks: 0 });
    // The list's world has the ship whose integrity its contexts give.
    expect(LIST.world.ship).toEqual({ name: 'Kobayashi IV' });
  });
});

// ── the list's own checks ────────────────────────────────────────────────────

describe('validateCases', () => {
  const state = {
    location: 'Hollow Spire',
    connection: { name: 'Tamsin Okoro', rank: 'dangerous', ticks: 16, bonded: false },
    vow: { name: 'Find who is raiding the Cinder Expanse lanes' },
  };
  const file = (cases, contexts = { stall: { scene: ['You wait at the stall.'], state } }) => ({
    world: { settlements: [{ name: 'Hollow Spire' }] }, contexts, cases,
  });
  const good = { id: 'ok', family: 'action', context: 'stall', line: 'I go down the ledger line by line.', want: { moves: ['gather_information'] } };

  it('passes a list that can run', () => {
    expect(validateCases(file([good, { ...good, id: 'quiet', want: { none: true } }]))).toEqual([]);
  });

  it('finds an unknown context, an unknown move, a line that names a move, a case that wants nothing, and an id used twice', () => {
    const problems = validateCases(file([
      good,
      { ...good, id: 'lost', context: 'nowhere' },
      { ...good, id: 'made-up', want: { moves: ['gather_intel'] } },
      { ...good, id: 'named', line: 'I set a course for Bleakhold Station.' },
      { ...good, id: 'rules-word', line: 'That is a milestone, surely.' },
      { ...good, id: 'neither', want: {} },
      { ...good, id: 'both', want: { moves: ['compel'], none: true } },
      { ...good },
    ]));
    expect(problems).toEqual([
      'case "lost": unknown context "nowhere"',
      'case "made-up": unknown move id "gather_intel"',
      expect.stringMatching(/^case "named": its line names Set a Course/),
      expect.stringMatching(/^case "rules-word": its line names milestone/),
      'case "neither": it wants neither a move (want.moves) nor none (want.none)',
      'case "both": it wants both a move and none',
      'case "ok": its id is used twice',
    ]);
  });

  it('finds a wanted move its context cannot hold', () => {
    const bare = { scene: ['You drift.'], state: { location: null } };
    const problems = validateCases(file([
      { ...good, id: 'bond-early', want: { moves: ['forge_a_bond'] } },
      { ...good, id: 'no-one', context: 'bare', want: { moves: ['develop_your_relationship'] } },
      { ...good, id: 'no-vow', context: 'bare', want: { moves: ['reach_a_milestone'] } },
      { ...good, id: 'no-journey', context: 'bare', want: { moves: ['explore_a_waypoint'] } },
    ], { stall: { scene: ['You wait at the stall.'], state }, bare }));
    expect(problems).toEqual([
      expect.stringMatching(/^case "bond-early": forge_a_bond is wanted only where .* full relationship track/),
      'case "no-one": develop_your_relationship needs a connection in its context',
      'case "no-vow": reach_a_milestone needs a vow in its context',
      'case "no-journey": explore_a_waypoint needs an open expedition in its context',
    ]);
  });

  it('finds a context that is no scene, is nowhere the world has, or has a fight open', () => {
    const problems = validateCases(file([good], {
      stall:   { scene: ['You wait at the stall.'], state },
      empty:   { scene: [], state: {} },
      long:    { scene: ['One.', 'Two.', 'Three.'], state: {} },
      adrift:  { scene: ['You drift.'], state: { location: 'Nowhere Deep' } },
      brawl:   { scene: ['You duck.'], state: { tracks: [{ type: 'combat', label: 'The Cinder Wren' }] } },
      nobody:  { scene: ['You wait.'], state: { connection: { name: '', ticks: 99, rank: 'mighty' } } },
    }));
    expect(problems).toEqual([
      'context "empty": its scene is one or two paragraphs of narration',
      'context "long": its scene is one or two paragraphs of narration',
      'context "adrift": its location "Nowhere Deep" is not one of the world\'s settlements',
      'context "brawl": an open fight is not a context of this test',
      'context "nobody": its connection has no name',
      'context "nobody": its connection\'s rank "mighty" is not a rank',
      'context "nobody": its connection\'s ticks are a whole number from 0 to 40',
    ]);
    expect(validateCases({})).toEqual(['the list has no contexts', 'the list has no cases']);
  });

  it('finds a sheet that is no sheet: a meter off its scale, an impact the block does not name, a ship\'s state with no ship', () => {
    const scene = ['You wait at the stall.'];
    const problems = validateCases(file([good], {
      stall:    { scene, state },
      overfull: { scene, state: { health: 6, spirit: -1, supply: 2.5, integrity: 9 } },
      cursed:   { scene, state: { impacts: ['wounded', 'doomed'], battered: 'yes' } },
      far:      { scene, state: { vow: { name: 'V', ticks: 44 } } },
      holed:    { scene, state: { integrity: 3 } },
    }));
    expect(problems).toEqual([
      'context "overfull": its health is a whole number from 0 to 5',
      'context "overfull": its spirit is a whole number from 0 to 5',
      'context "overfull": its supply is a whole number from 0 to 5',
      'context "overfull": its integrity is a whole number from 0 to 5',
      'context "overfull": it gives the ship\'s state, and the world has no command vehicle (world.ship)',
      'context "cursed": its impacts are a list of wounded, shaken, unprepared',
      'context "cursed": battered is true or false',
      'context "cursed": it gives the ship\'s state, and the world has no command vehicle (world.ship)',
      'context "far": its vow\'s ticks are a whole number from 0 to 40',
      'context "holed": it gives the ship\'s state, and the world has no command vehicle (world.ship)',
    ]);
    // With a ship in the world, a context may say how it stands.
    const withShip = { ...file([good], { stall: { scene, state }, holed: { scene, state: { integrity: 3, battered: true } } }), world: { settlements: [{ name: 'Hollow Spire' }], ship: { name: 'Kobayashi IV' } } };
    expect(validateCases(withShip)).toEqual([]);
  });

  it('finds a recovery move wanted where the sheet has nothing for it to recover: both readers are told the meters', () => {
    const scene = ['You wait at the stall.'];
    const whole = { scene, state: { ...state, health: 5, spirit: 5, supply: 5 } };
    const hurt  = { scene, state: { ...state, health: 3, spirit: 5, supply: 5, impacts: ['shaken', 'unprepared'] } };
    const wanting = (id, context, move) => ({ ...good, id, context, line: 'I see to it.', want: { moves: [move] } });
    const list = (extra) => ({
      ...file([
        wanting('heal-whole', 'whole', 'heal'), wanting('hearten-whole', 'whole', 'hearten'), wanting('resupply-whole', 'whole', 'resupply'), wanting('repair-whole', 'whole', 'repair'),
        wanting('heal-hurt', 'hurt', 'heal'), wanting('hearten-shaken', 'hurt', 'hearten'), wanting('resupply-unprepared', 'hurt', 'resupply'),
        // Sojourn is not held to one meter: it is a stay, and what it mends is chosen on its hit.
        wanting('sojourn-whole', 'whole', 'sojourn'),
        ...extra,
      ], { whole, hurt, holed: { scene, state: { ...state, integrity: 4 } }, dented: { scene, state: { ...state, battered: true } } }),
      world: { settlements: [{ name: 'Hollow Spire' }], ship: { name: 'Kobayashi IV' } },
    });
    expect(validateCases(list([wanting('repair-holed', 'holed', 'repair'), wanting('repair-dented', 'dented', 'repair')]))).toEqual([
      'case "heal-whole": heal is wanted only where the context\'s sheet has something for it to recover',
      'case "hearten-whole": hearten is wanted only where the context\'s sheet has something for it to recover',
      'case "resupply-whole": resupply is wanted only where the context\'s sheet has something for it to recover',
      'case "repair-whole": repair is wanted only where the context\'s sheet has something for it to recover',
    ]);
    // The list that ships: every recovery line it wants has something to recover.
    const recovering = LIST.cases.filter(c => (c.want.moves ?? []).some(m => ['heal', 'hearten', 'resupply', 'repair'].includes(m)));
    expect(recovering.length).toBeGreaterThanOrEqual(7);
    expect(new Set(recovering.map(c => c.context))).toEqual(new Set(['bleakhold-after-fight']));
  });
});

describe('contextMismatch', () => {
  const context = LIST.contexts['ashfall-drift'];
  const applied = () => ({
    scene: context.scene.join('\n\n'),
    location: null,
    frame: { ...context.state.frame },
    sheet: { health: 5, spirit: 4, supply: 3, impacts: { wounded: false, shaken: false, unprepared: false } },
    vehicle: { name: 'Kobayashi IV', integrity: 5, battered: false },
    connections: [{ name: 'Tamsin Okoro', rank: 'dangerous', ticks: 16, bonded: false }],
    vows: [{ name: 'Find who is raiding the Cinder Expanse lanes', rank: 'dangerous', ticks: 8 }],
    tracks: [{ type: 'expedition', label: 'The Ashfall Drift' }],
  });

  it('is null when the readers\' sources hold what the context says', () => {
    expect(contextMismatch(context, applied())).toBeNull();
  });

  it('names the first thing that did not land', () => {
    expect(contextMismatch(context, { ...applied(), scene: context.scene[0] })).toMatch(/recent scene lacks "Ahead, half buried/);
    expect(contextMismatch(context, { ...applied(), location: 'Hollow Spire' })).toBe('the current location is Hollow Spire, not none');
    expect(contextMismatch(context, { ...applied(), frame: null })).toBe('the scene frame was not set');
    expect(contextMismatch(context, { ...applied(), connections: [{ name: 'Tamsin Okoro', ticks: 40, bonded: false }] })).toMatch(/Tamsin Okoro is not on the sheet as the context has it/);
    expect(contextMismatch(context, { ...applied(), connections: [...applied().connections, { name: 'Idris Vane', ticks: 0, bonded: false }] })).toMatch(/a connection is on the sheet/);
    expect(contextMismatch(context, { ...applied(), vows: [] })).toMatch(/open vows/);
    expect(contextMismatch(context, { ...applied(), tracks: [] })).toMatch(/open tracks/);
  });

  it('names a sheet that did not land: a meter, an impact, the vow\'s progress, the ship', () => {
    const sheet = applied().sheet;
    expect(contextMismatch(context, { ...applied(), sheet: { ...sheet, spirit: 5 } })).toBe("the sheet's spirit is 5, not 4");
    expect(contextMismatch(context, { ...applied(), sheet: undefined })).toBe("the sheet's health is unread, not 5");
    expect(contextMismatch(context, { ...applied(), sheet: { ...sheet, impacts: { ...sheet.impacts, wounded: true } } })).toBe('the sheet is marked wounded, against the context');
    expect(contextMismatch(context, { ...applied(), vows: [{ name: 'Find who is raiding the Cinder Expanse lanes', ticks: 0 }] })).toBe('the vow stands at 0 ticks, not 8');
    // The ship is checked where the context gives its state.
    expect(contextMismatch(context, { ...applied(), vehicle: null }), 'this context gives none').toBeNull();
    const fought = LIST.contexts['bleakhold-after-fight'];
    const after = () => ({
      scene: fought.scene.join('\n\n'), location: 'Bleakhold Station', frame: { ...fought.state.frame },
      sheet: { health: 3, spirit: 3, supply: 2, impacts: { wounded: false, shaken: false, unprepared: false } },
      vehicle: { name: 'Kobayashi IV', integrity: 3, battered: false },
      connections: [{ name: 'Tamsin Okoro', rank: 'dangerous', ticks: 16, bonded: false }],
      vows: [{ name: 'Find who is raiding the Cinder Expanse lanes', ticks: 16 }], tracks: [],
    });
    expect(contextMismatch(fought, after())).toBeNull();
    expect(contextMismatch(fought, { ...after(), vehicle: { integrity: 5, battered: false } })).toBe("the command vehicle's integrity is 5, not 3");
    expect(contextMismatch(fought, { ...after(), vehicle: { integrity: 3, battered: true } })).toBe('the command vehicle is battered, against the context');
    expect(contextMismatch(fought, { ...after(), vehicle: null })).toBe("the world has no command vehicle to hold the ship's state");
  });
});

// ── a reading, and its score ─────────────────────────────────────────────────

/** decidePacing's decision, as the page returns it. */
const pacingOf = (decision, move = null, more = {}) => ({
  runMove: decision === DECISION.MOVE,
  decision,
  suggestedMove: decision === DECISION.OFFER ? move : null,
  ...(decision === DECISION.MOVE ? { nominatedMove: move, classifierRead: true } : {}),
  category: 'downtime', confidence: 0.7, reasoning: 'the pacing reader\'s reason',
  ...more,
});
/** interpretMove's reading, as the page returns it. */
const moveOf = (moveId, more = {}) => ({ moveId, statUsed: 'wits', confidence: 'high', mischiefApplied: false, rationale: 'the move reader\'s reason', ...more });
const noMove = (more = {}) => ({ noMove: true, moveId: null, confidence: 'medium', mischiefApplied: false, rationale: 'plain talk', ...more });

describe('readingOf', () => {
  it('a line the pacing reader narrates: no move, nothing offered', () => {
    expect(readingOf({ pacing: pacingOf(DECISION.NARRATIVE) })).toMatchObject({
      decision: 'NARRATIVE', suggested: null, move: null, noMove: false, offered: null, failed: null,
      category: 'downtime', confidence: 0.7, reasons: { pacing: 'the pacing reader\'s reason', move: '' },
    });
  });

  it('a line narrated with a move available: that move is offered', () => {
    expect(readingOf({ pacing: pacingOf(DECISION.OFFER, 'heal') })).toMatchObject({ decision: DECISION.OFFER, suggested: 'heal', offered: 'heal', move: null, noMove: false });
    // The pacing reader offered, and named no move the module knows: the card has no button.
    expect(readingOf({ pacing: pacingOf(DECISION.OFFER, null) })).toMatchObject({ suggested: null, offered: null });
    expect(readingOf({ pacing: pacingOf(DECISION.OFFER, 'patch_up') })).toMatchObject({ suggested: null, offered: null });
  });

  it('a line called a move: the move reader\'s move is the one rolled', () => {
    const reading = readingOf({ pacing: pacingOf(DECISION.MOVE, 'gather_information'), interpretation: moveOf('compel', { mischiefApplied: true }) });
    expect(reading).toMatchObject({ decision: 'MOVE', suggested: 'gather_information', move: 'compel', noMove: false, offered: null, mischief: true, failed: null });
    expect(reading.reasons.move).toBe('the move reader\'s reason');
  });

  it('the move reader reads no move: narrated, with the move the pacing reader named offered', () => {
    expect(readingOf({ pacing: pacingOf(DECISION.MOVE, 'compel'), interpretation: noMove() }))
      .toMatchObject({ move: null, noMove: true, unsure: false, offered: 'compel' });
    expect(readingOf({ pacing: pacingOf(DECISION.MOVE, null), interpretation: noMove() }))
      .toMatchObject({ move: null, noMove: true, offered: null });
  });

  it('the move reader is unsure of its reading: narrated, the pacing reader\'s move offered — else its own', () => {
    expect(readingOf({ pacing: pacingOf(DECISION.MOVE, 'heal'), interpretation: moveOf('hearten', { confidence: 'low' }) }))
      .toMatchObject({ move: null, noMove: true, unsure: true, offered: 'heal' });
    expect(readingOf({ pacing: pacingOf(DECISION.MOVE, null), interpretation: moveOf('hearten', { confidence: 'low' }) }))
      .toMatchObject({ move: null, noMove: true, unsure: true, offered: 'hearten' });
  });

  it('a scene-challenge move is the ordinary move it varies', () => {
    expect(readingOf({ pacing: pacingOf(DECISION.MOVE, 'face_danger_scene_challenge'), interpretation: moveOf('secure_an_advantage_scene_challenge') }))
      .toMatchObject({ suggested: 'face_danger', move: 'secure_an_advantage' });
  });

  it('a reader that did not read the line is a failed reading, not a reading', () => {
    // The pacing reader's fallback for a failed call or an unreadable reply sends the line on as a move.
    const fallback = pacingOf(DECISION.MOVE, null, { classifierRead: false, confidence: 0, reasoning: 'fallback: unparseable JSON' });
    expect(readingOf({ pacing: fallback, interpretation: moveOf('face_danger') }).failed).toMatch(/pacing reader did not read the line \(fallback: unparseable JSON\)/);
    expect(readingOf({ pacing: pacingOf(DECISION.MOVE, 'heal'), interpretation: moveOf('face_danger', { fallback: true, confidence: 'low' }) }).failed)
      .toBe('the move reader\'s reply could not be read');
    expect(readingOf({ pacing: pacingOf(DECISION.MOVE, 'heal'), interpretation: null, interpretError: 'Claude API error 529' }).failed)
      .toBe('the move reader gave no reading (Claude API error 529)');
    expect(readingOf({ pacing: pacingOf(DECISION.MOVE, 'heal'), interpretation: moveOf('tend_wounds') }).failed).toMatch(/named no move the module knows \(tend_wounds\)/);
    expect(readingOf({}).failed).toBe('the pacing reader gave no decision');
    // What a dry run's stub comes to: both readers' fallbacks.
    expect(scoreCase({ moves: ['face_danger'] }, readingOf({ pacing: fallback, interpretation: moveOf('face_danger', { fallback: true, confidence: 'low' }) }))).toBe(OUTCOME.FAILED);
  });
});

describe('scoreCase', () => {
  const heal = { moves: ['heal'] };
  const either = { moves: ['face_danger', 'undertake_an_expedition'] };
  const control = { none: true };
  const rolled = (move, nominated = move) => readingOf({ pacing: pacingOf(DECISION.MOVE, nominated), interpretation: moveOf(move) });
  const offered = (move) => readingOf({ pacing: pacingOf(DECISION.OFFER, move) });
  const narrated = readingOf({ pacing: pacingOf(DECISION.NARRATIVE) });

  it('a line that wants a move: rolled, offered, another move, or nothing', () => {
    expect(scoreCase(heal, rolled('heal'))).toBe('rolled');
    expect(scoreCase(heal, offered('heal'))).toBe('offered');
    expect(scoreCase(heal, rolled('hearten', 'heal')), 'the move reader\'s move is the one rolled').toBe('another move rolled');
    expect(scoreCase(heal, offered('repair'))).toBe('another move offered');
    expect(scoreCase(heal, narrated)).toBe('nothing');
    expect(scoreCase(heal, offered(null)), 'offered, with no move on the button').toBe('nothing');
    expect(scoreCase(either, rolled('undertake_an_expedition')), 'either of two readings is right').toBe('rolled');
  });

  it('a move the move reader declined is offered when the pacing reader named a wanted one', () => {
    expect(scoreCase(heal, readingOf({ pacing: pacingOf(DECISION.MOVE, 'heal'), interpretation: noMove() }))).toBe('offered');
    expect(scoreCase(heal, readingOf({ pacing: pacingOf(DECISION.MOVE, 'repair'), interpretation: noMove() }))).toBe('another move offered');
    expect(scoreCase(heal, readingOf({ pacing: pacingOf(DECISION.MOVE, null), interpretation: noMove() }))).toBe('nothing');
    expect(scoreCase(heal, readingOf({ pacing: pacingOf(DECISION.MOVE, null), interpretation: moveOf('heal', { confidence: 'low' }) })), 'an unsure reading is offered, not rolled').toBe('offered');
  });

  it('a control: narrated is right; a move offered or rolled is not', () => {
    expect(scoreCase(control, narrated)).toBe('narrated');
    expect(scoreCase(control, offered('gather_information'))).toBe('a move offered');
    expect(scoreCase(control, rolled('compel'))).toBe('a move rolled');
    expect(scoreCase(control, readingOf({ pacing: pacingOf(DECISION.MOVE, 'compel'), interpretation: noMove() })), 'declined, but its button offers one').toBe('a move offered');
    expect(scoreCase(control, readingOf({ pacing: pacingOf(DECISION.MOVE, null), interpretation: noMove() }))).toBe('narrated');
  });

  it('a failed reading is not scored', () => {
    expect(scoreCase(heal, readingOf({}))).toBe('reader failed');
    expect(scoreCase(control, null)).toBe('reader failed');
  });
});

// ── the run's numbers, and its report ────────────────────────────────────────

const usage = (input, output, cacheRead = 0) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0 });

/** One reading of a made-up run: the case, the arm, what the readers said. */
function result(arm, c, replies, { repeat = 1, ms = [800, 1600] } = {}) {
  const reading = readingOf(replies);
  const calls = [{ reader: 'pacing', model: arm, ms: ms[0], usage: usage(1000, 100, 4000) }];
  if (replies.pacing?.decision === DECISION.MOVE) calls.push({ reader: 'move', model: arm, ms: ms[1], usage: usage(1100, 400, 5000) });
  return { arm, id: c.id, family: c.family, context: 'stall', line: c.line, want: c.want, ...(c.source ? { source: c.source } : {}), repeat, outcome: scoreCase(c.want, reading), reading, calls };
}

const CASES = {
  heal:    { id: 'heal-1', family: 'recovery', line: 'I treat my wounds with the ship\'s medkit.', want: { moves: ['heal'] }, source: 'run 2 a49' },
  restock: { id: 'resupply-1', family: 'recovery', line: 'I restock the ship at Bleakhold\'s market.', want: { moves: ['resupply'] } },
  course:  { id: 'course-1', family: 'travel', line: 'I plot the course and take the Kobayashi IV to Bleakhold Station.', want: { moves: ['set_a_course'] } },
  gather:  { id: 'gather-1', family: 'action', line: 'I go down the ledger line by line.', want: { moves: ['gather_information'] } },
  compass: { id: 'none-compass', family: 'control', line: 'I turn the compass over in my palm.', want: { none: true } },
  tea:     { id: 'none-tea', family: 'control', line: 'I ask Tamsin about her tea.', want: { none: true } },
};

/** A run of two arms over six lines: Haiku reads three of four, Sonnet all four; each misreads one control differently. */
function madeUpRun() {
  const narrate = { pacing: pacingOf(DECISION.NARRATIVE, null, { reasoning: 'an everyday action at a dial of 1' }) };
  return [
    result(HAIKU,  CASES.heal,    narrate),
    result(SONNET, CASES.heal,    { pacing: pacingOf(DECISION.OFFER, 'heal', { reasoning: 'treating a wound changes the sheet' }) }),
    result(HAIKU,  CASES.restock, { pacing: pacingOf(DECISION.OFFER, 'resupply') }),
    result(SONNET, CASES.restock, { pacing: pacingOf(DECISION.OFFER, 'resupply') }),
    result(HAIKU,  CASES.course,  { pacing: pacingOf(DECISION.MOVE, 'set_a_course'), interpretation: moveOf('set_a_course') }),
    result(SONNET, CASES.course,  { pacing: pacingOf(DECISION.MOVE, 'set_a_course'), interpretation: moveOf('set_a_course') }),
    result(HAIKU,  CASES.gather,  { pacing: pacingOf(DECISION.MOVE, 'gather_information'), interpretation: moveOf('compel', { mischiefApplied: true }) }),
    result(SONNET, CASES.gather,  { pacing: pacingOf(DECISION.MOVE, 'gather_information'), interpretation: moveOf('compel', { rationale: 'she is pressing Tamsin' }) }),
    result(HAIKU,  CASES.compass, narrate),
    result(SONNET, CASES.compass, narrate),
    result(HAIKU,  CASES.tea,     narrate),
    result(SONNET, CASES.tea,     { pacing: pacingOf(DECISION.OFFER, 'develop_your_relationship') }),
  ];
}

describe('summarise', () => {
  const summary = summarise(madeUpRun(), { prices: PRICES });

  it('counts each arm: read is rolled and offered together, over the lines wanting a move', () => {
    expect(summary).toMatchObject({ arms: [HAIKU, SONNET], families: ['recovery', 'travel', 'action', 'control'], lines: 6, readings: 12 });
    expect(summary.byArm[HAIKU]).toMatchObject({
      readings: 6, failed: 0, wanting: 4, read: 2, rolled: 1, offered: 1, wrong: 1, anotherRolled: 1, anotherOffered: 0, mischief: 1, nothing: 1,
      controls: 2, controlsRight: 2, controlsOffered: 0, controlsRolled: 0,
    });
    expect(summary.byArm[HAIKU].readRate).toBeCloseTo(0.5, 6);
    expect(summary.byArm[HAIKU].controlRate).toBe(1);
    expect(summary.byArm[SONNET]).toMatchObject({ wanting: 4, read: 3, rolled: 1, offered: 2, wrong: 1, mischief: 0, nothing: 0, controls: 2, controlsRight: 1, controlsOffered: 1 });
    expect(summary.byArm[SONNET].readRate).toBeCloseTo(0.75, 6);
    expect(summary.byArm[SONNET].controlRate).toBeCloseTo(0.5, 6);
  });

  it('counts each family within an arm', () => {
    expect(summary.byArm[HAIKU].byFamily.recovery).toMatchObject({ wanting: 2, read: 1, offered: 1, nothing: 1 });
    expect(summary.byArm[SONNET].byFamily.recovery).toMatchObject({ wanting: 2, read: 2, offered: 2, nothing: 0 });
    expect(summary.byArm[HAIKU].byFamily.control).toMatchObject({ wanting: 0, controls: 2, controlsRight: 2 });
    expect(summary.byArm[SONNET].byFamily.action).toMatchObject({ wanting: 1, read: 0, anotherRolled: 1 });
  });

  it('lists the lines the arms read differently, the lines no arm read, and the controls read as a move', () => {
    expect(summary.differing.map(l => l.id)).toEqual(['heal-1', 'none-tea']);
    expect(summary.differing[0]).toMatchObject({
      line: CASES.heal.line, source: 'run 2 a49', want: { moves: ['heal'] },
      arms: { [HAIKU]: { verdict: 'nothing', outcomes: ['nothing'] }, [SONNET]: { verdict: 'offered', outcomes: ['offered'] } },
    });
    expect(summary.differing[0].arms[SONNET].reading.reasons.pacing).toBe('treating a wound changes the sheet');
    expect(summary.agreement).toEqual({ lines: 4, allRead: 2, noneRead: 1, someRead: 1 });
    expect(summary.unreadByAll.map(l => l.id)).toEqual(['gather-1']);
    expect(summary.controlsMisread.map(l => l.id)).toEqual(['none-tea']);
  });

  it('a failed reading is in no rate, and makes no difference between arms', () => {
    const failed = readingOf({});
    const run = [
      ...madeUpRun().filter(r => !(r.arm === SONNET && r.id === 'course-1')),
      { arm: SONNET, id: 'course-1', family: 'travel', line: CASES.course.line, want: CASES.course.want, repeat: 1, outcome: scoreCase(CASES.course.want, failed), reading: failed, calls: [] },
    ];
    const s = summarise(run, { prices: PRICES });
    expect(s.byArm[SONNET]).toMatchObject({ readings: 6, failed: 1, wanting: 3, read: 2 });
    expect(s.byArm[SONNET].readRate).toBeCloseTo(2 / 3, 6);
    expect(s.differing.map(l => l.id)).not.toContain('course-1');
    expect(s.agreement.lines, 'a line an arm failed to read is not compared').toBe(3);
  });

  it('says where an arm disagrees with itself across repeats, and takes what most repeats came to', () => {
    const offer = { pacing: pacingOf(DECISION.OFFER, 'heal') };
    const narrate = { pacing: pacingOf(DECISION.NARRATIVE) };
    const run = [
      result(HAIKU, CASES.heal, offer, { repeat: 1 }), result(HAIKU, CASES.heal, narrate, { repeat: 2 }), result(HAIKU, CASES.heal, narrate, { repeat: 3 }),
      result(HAIKU, CASES.compass, narrate, { repeat: 1 }), result(HAIKU, CASES.compass, narrate, { repeat: 2 }), result(HAIKU, CASES.compass, narrate, { repeat: 3 }),
      result(SONNET, CASES.heal, offer, { repeat: 1 }), result(SONNET, CASES.heal, offer, { repeat: 2 }), result(SONNET, CASES.heal, offer, { repeat: 3 }),
    ];
    const s = summarise(run, { prices: PRICES });
    expect(s.byArm[HAIKU].consistency).toMatchObject({ repeated: 2, same: 1, disagreeing: [{ id: 'heal-1', outcomes: ['offered', 'nothing', 'nothing'] }] });
    expect(s.byArm[HAIKU].consistency.rate).toBeCloseTo(0.5, 6);
    expect(s.byArm[SONNET].consistency).toMatchObject({ repeated: 1, same: 1, disagreeing: [] });
    expect(s.differing.map(l => l.id)).toEqual(['heal-1']);
    expect(s.differing[0].arms[HAIKU]).toMatchObject({ verdict: 'nothing', outcomes: ['offered', 'nothing', 'nothing'] });
    // One reading each: nothing to be consistent about.
    expect(summarise(madeUpRun()).byArm[HAIKU].consistency).toMatchObject({ repeated: 0, rate: null });
  });

  it('prices each arm\'s calls from their usage, at the table explore.mjs uses, and times each reader', () => {
    const haiku = summary.byArm[HAIKU].spend;
    // Six pacing calls, and a move call for each of the two lines called a move.
    expect(haiku).toMatchObject({ calls: 8, pacingCalls: 6, moveCalls: 2, unpriced: 0, models: [HAIKU] });
    expect(haiku.tokens).toEqual({ input: 6 * 1000 + 2 * 1100, cacheRead: 6 * 4000 + 2 * 5000, cacheWrite: 0, output: 6 * 100 + 2 * 400 });
    const price = PRICES[HAIKU];
    const dollars = (haiku.tokens.input * price.input + haiku.tokens.cacheRead * price.cacheRead + haiku.tokens.output * price.output) / 1_000_000;
    expect(haiku.usd).toBeCloseTo(dollars, 9);
    expect(summary.byArm[SONNET].spend.usd, 'the same tokens, a dearer model').toBeGreaterThan(haiku.usd * 10);
    expect(summary.usd).toBeCloseTo(haiku.usd + summary.byArm[SONNET].spend.usd, 9);
    expect(haiku.pacing, 'each pacing call').toMatchObject({ n: 6, medianMs: 800 });
    expect(haiku.move, 'each move call').toMatchObject({ n: 2, medianMs: 1600 });
    expect(haiku.line, 'each line: its calls together').toMatchObject({ n: 6, medianMs: 800, maxMs: 2400 });
    // A model with no price, or a call with no usage (a dry run's stub), is counted and not priced.
    const dry = summarise([{ ...madeUpRun()[0], calls: [{ reader: 'pacing', model: HAIKU, ms: 5, usage: null }, { reader: 'move', model: 'claude-nobody-priced', ms: 5, usage: usage(10, 10) }] }], { prices: PRICES });
    expect(dry.byArm[HAIKU].spend).toMatchObject({ calls: 2, unpriced: 2, usd: 0 });
  });
});

describe('report', () => {
  const summary = summarise(madeUpRun(), { prices: PRICES });
  const meta = {
    runId: 'readers-live-20261124-120000', mode: 'live', startedAt: '2026-11-24T12:00:00.000Z', commit: 'ddc4b40d1234567890', repeats: 1, planned: 12,
    questions: ['How often is a plain line read right?', 'How much of the failure is the model?'],
    notSet: [{ key: 'tracks[].ticks', why: '…' }, { key: 'tracks[].ticks', why: '…' }, { key: 'vow.swornTo', why: '…' }],
    dials: { mischiefDial: 'balanced', downtime: 1 },
    thinking: { [HAIKU]: 'disabled', [SONNET]: 'between_tools' },
    own: [SONNET],
  };
  const text = report(summary, meta);

  it('opens with what ran and the questions the run was to answer', () => {
    expect(text).toMatch(/^# The readers on plain lines — readers-live-20261124-120000\n/);
    expect(text).toContain('A live run, 2026-11-24T12:00:00.000Z, at commit `ddc4b40d1234`: 6 line(s), read 1 time(s) each by `claude-haiku-5-5` and `claude-sonnet-5-5` — 12 reading(s).');
    expect(text).toContain('## What this run was to answer\n\n1. How often is a plain line read right?\n2. How much of the failure is the model?');
    expect(text).not.toContain('The readings below are stubs');
  });

  it('says that rolled and offered both count as read', () => {
    expect(text).toContain('**Rolled and offered both count as read**');
  });

  it('has the headline table: arm by read, rolled, offered, another move, nothing, controls right', () => {
    expect(text).toContain('| Arm | Lines wanting a move | Read | rolled | offered | Another move | Nothing | Controls right | Reader failed |');
    expect(text).toContain('| `claude-haiku-5-5` | 4 | **2 of 4 (50%)** | 1 | 1 | 1 (1 rolled, 1 of them on purpose; 0 offered) | 1 | 2 of 2 (100%) | 0 |');
    expect(text).toContain('| `claude-sonnet-5-5` | 4 | **3 of 4 (75%)** | 1 | 2 | 1 (1 rolled; 0 offered) | 0 | 1 of 2 (50%) | 0 |');
    expect(text).toContain('**2** every arm read right, **1** some did and some did not, **1** none did');
  });

  it('has the table by family', () => {
    expect(text).toContain('| Family | `claude-haiku-5-5` | `claude-sonnet-5-5` |');
    expect(text).toContain('| recovery | 1 of 2 (50%) read (0 rolled, 1 offered); 0 another move, 1 nothing | 2 of 2 (100%) read (0 rolled, 2 offered); 0 another move, 0 nothing |');
    expect(text).toContain('| control | 2 of 2 (100%) narrated; 0 offered a move, 0 rolled | 1 of 2 (50%) narrated; 1 offered a move, 0 rolled |');
  });

  it('gives each differing line with both readings and the readers\' stated reasons', () => {
    const differ = text.slice(text.indexOf('## Where the arms differ'), text.indexOf('## Lines no arm read'));
    expect(differ).toContain('**`heal-1`** — recovery · wants Heal · context stall · from run 2 a49');
    expect(differ).toContain('> I treat my wounds with the ship\'s medkit.');
    expect(differ).toContain('- `claude-haiku-5-5` — **nothing**: the pacing reader narrates it, with no move offered (downtime, 0.70) — “an everyday action at a dial of 1”');
    expect(differ).toContain('- `claude-sonnet-5-5` — **offered**: the pacing reader narrates it and offers Heal (downtime, 0.70) — “treating a wound changes the sheet”');
    expect(differ).toContain('**`none-tea`** — control · wants no move');
    expect(differ).not.toContain('course-1');
  });

  it('lists the lines no arm read and the controls read as a move, with the move reader\'s reason', () => {
    const unread = text.slice(text.indexOf('## Lines no arm read'), text.indexOf('## Controls read as a move'));
    expect(unread).toContain('**`gather-1`**');
    expect(unread).toContain('the move reader makes it Compel (a misread on purpose, it says) — “the move reader\'s reason”');
    expect(unread).toContain('the pacing reader calls it a move, naming Gather Information (downtime, 0.70)');
    expect(unread).toContain('the move reader makes it Compel — “she is pressing Tamsin”');
    expect(text.slice(text.indexOf('## Controls read as a move'), text.indexOf('## Cost and time'))).toContain('**`none-tea`**');
  });

  it('gives cost and time by arm, and says what the test does not show', () => {
    expect(text).toContain('| `claude-haiku-5-5` | 8 (6 + 2) | 8200 | 34000 | 0 | 1400 |');
    expect(text).toMatch(/Total: \$0\.\d{4}, by the price table in explore\.config\.json/);
    const limits = text.slice(text.indexOf('## What this test does not show'));
    expect(limits).toContain('**Nothing is rolled or narrated.**');
    expect(limits).toContain('**One reading of a line is one sample**');
    expect(limits).toContain('(mischiefDial balanced, downtime 1)');
    // The sheet reaches both readers now, and the runner sets it: said as a limit of its own.
    expect(limits).toContain('**The sheet is set by hand.** Each context\'s health, spirit, supply and impacts, its vow\'s progress and the ship\'s integrity are written to the world before its lines are read, and both readers are told them (their SITUATION block).');
    expect(limits).toContain('(not set in the world: tracks[].ticks, vow.swornTo)');
    expect(limits).not.toContain('The sheet does not reach the readers');
    // The prompts are the readers' own model's, wherever that arm stands in the list.
    expect(limits).toContain('**Only the model changes between arms.** Each arm reads the same prompts, written for the readers\' own model (`claude-sonnet-5-5`);');
    expect(report(summary, { ...meta, own: undefined })).toContain('written for the readers\' own model; a prompt tuned to another model');
    expect(limits).toContain('**No arm thinks first.** The readers turn thinking off, each model in its own form (`claude-haiku-5-5`: disabled; `claude-sonnet-5-5`: between_tools)');
    expect(text, 'no self-consistency section for one reading a line').not.toContain('## Self-consistency');
  });

  it('a dry run says its readings are stubs; a stopped run and a repeated one say so', () => {
    const failed = readingOf({ pacing: pacingOf(DECISION.MOVE, null, { classifierRead: false, reasoning: 'fallback: unknown decision: undefined' }), interpretation: moveOf('face_danger', { fallback: true }) });
    const stubbed = [HAIKU, SONNET].map(arm => ({ arm, id: 'heal-1', family: 'recovery', line: CASES.heal.line, want: CASES.heal.want, repeat: 1, outcome: scoreCase(CASES.heal.want, failed), reading: failed, calls: [{ reader: 'pacing', model: HAIKU, ms: 4, usage: null }] }));
    const dry = report(summarise(stubbed, { prices: PRICES }), { mode: 'dry', repeats: 1, planned: 110, stopped: 'the usd cap was reached ($2.00)', strays: 1 });
    expect(dry).toContain('> **The readings below are stubs.**');
    expect(dry).toContain('2 reading(s) of the 110 planned.');
    expect(dry).toContain('**Stopped early:** the usd cap was reached ($2.00).');
    expect(dry).toContain('_No questions were given');
    expect(dry).toContain('| `claude-haiku-5-5` | 0 | **–** | 0 | 0 | 0 | 0 | – | 1 |');
    expect(dry).toContain('_No reading was scored: a dry run\'s are all stubs._');
    expect(dry, 'no list of lines that would read as a result').not.toMatch(/## Lines no arm read|## Where the arms differ|## Controls read as a move/);
    expect(report(summarise([], { prices: PRICES }), { mode: 'live', questions: ['Q?'] })).toMatch(/## No line was read\n\nThe run ended before its first reading/);
    expect(dry).toContain('a dry run spends nothing');
    expect(dry).toContain('**1 call(s) that were not a reader\'s were made, and reached no model**');

    const offer = { pacing: pacingOf(DECISION.OFFER, 'heal') };
    const narrate = { pacing: pacingOf(DECISION.NARRATIVE) };
    const repeated = report(summarise([result(HAIKU, CASES.heal, offer, { repeat: 1 }), result(HAIKU, CASES.heal, narrate, { repeat: 2 })], { prices: PRICES }), { mode: 'live', repeats: 2 });
    expect(repeated).toContain('## Self-consistency');
    expect(repeated).toContain('- `claude-haiku-5-5`: 0 of 1 (0%) line(s) came out the same every time. Not the same: `heal-1` (offered, nothing).');
    expect(repeated).toContain('## Lines not read');
    expect(repeated).not.toContain('## Where the arms differ');
    expect(repeated).toContain('**A few readings of a line are a small sample**');
  });

  it('names only moves the module has', () => {
    for (const c of LIST.cases) for (const id of c.want.moves ?? []) expect(MOVES[id], id).toBeTruthy();
  });
});

// ── the harness's model option ───────────────────────────────────────────────

describe('the Claude harness sends a call to the model an arm names', () => {
  const stack = (caller, fn, file) => [
    'Error',
    '    at window.fetch (http://foundry:30000/game:1:1)',
    '    at apiPost (http://foundry:30000/modules/starforged-companion/src/api-proxy.js:60:21)',
    `    at ${caller} (http://foundry:30000/modules/starforged-companion/src/${file}:200:9)`,
    `    at ${fn} (http://foundry:30000/modules/starforged-companion/src/${file}:640:23)`,
  ].join('\n');
  const PACING   = stack('callClassifierAPI', 'classifyInput', 'pacing/classifier.js');
  const MOVE     = stack('callClaudeAPI', 'interpretMove', 'moves/interpreter.js');
  const NARRATOR = stack('callNarratorAPI', 'narratePacedInput', 'narration/narrator.js');
  const bodyOf = (model) => JSON.stringify({ model, max_tokens: 330, system: [{ type: 'text', text: 'Return ONLY a valid JSON object.' }], messages: [{ role: 'user', content: '"I treat my wounds."' }] });

  function harnessWith(options) {
    const sent = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      sent.push({ body: init.body, key: init.headers['x-api-key'] });
      const model = JSON.parse(init.body).model;
      return new Response(JSON.stringify({ model, content: [{ type: 'text', text: '{"decision":"NARRATIVE"}' }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 } }), { status: 200 });
    }));
    const harness = createClaudeHarness({ mode: 'record', apiKey: 'sk-test-key', log: () => {}, ...options });
    let bridge = null;
    harness.attach({ exposeFunction: async (_n, fn) => { bridge = fn; }, addInitScript: async () => {} }, 'gm');
    const send = (stackText, model = HAIKU, body = bodyOf(model)) => bridge({ url: 'https://api.anthropic.com/v1/messages', headers: { 'x-api-key': 'page-placeholder' }, stack: stackText, body });
    return { harness, send, sent };
  }

  it('rewrites the body\'s model for the kinds the arm names, and leaves every other call as it is', async () => {
    const asked = [];
    const { harness, send, sent } = harnessWith({
      model: (kind, liveModel) => { asked.push([kind, liveModel]); return /classifyInput|interpretMove/.test(kind) ? SONNET : null; },
    });
    await send(PACING);
    await send(MOVE);
    await send(NARRATOR);
    expect(asked).toEqual([['callClassifierAPI>classifyInput', HAIKU], ['callClaudeAPI>interpretMove', HAIKU], ['callNarratorAPI>narratePacedInput', HAIKU]]);
    expect(sent.map(s => JSON.parse(s.body).model)).toEqual([SONNET, SONNET, HAIKU]);
    // Nothing else of the request changes, and the runner's key still replaces the page's.
    expect(JSON.parse(sent[0].body)).toEqual({ ...JSON.parse(bodyOf(HAIKU)), model: SONNET });
    expect(sent[2].body).toBe(bodyOf(HAIKU));
    expect(sent.every(s => s.key === 'sk-test-key')).toBe(true);
    // The entry and the recording carry the model the call went to; the entry keeps the one asked for.
    expect(harness.requests.map(r => [r.model, r.modelAsked ?? null])).toEqual([[SONNET, HAIKU], [SONNET, HAIKU], [HAIKU, null]]);
    expect(harness.recordingOut({ scenario: 'readers', passed: true }).exchanges.map(x => x.model)).toEqual([SONNET, SONNET, HAIKU]);
  });

  it('gives the body the thinking-off form of the model it is sent to: each model has its own, and rejects the other\'s', async () => {
    const sentWith = async (from, to, thinking) => {
      const { send, sent } = harnessWith({ model: () => to });
      const body = JSON.parse(bodyOf(from));
      if (thinking !== undefined) body.thinking = thinking;
      await send(PACING, from, JSON.stringify(body));
      return JSON.parse(sent[0].body);
    };
    // A call asked of Haiku 5.5 carries thinking "disabled", which Sonnet 5.5 answers with a 400.
    expect(await sentWith(HAIKU, SONNET, { type: 'disabled' })).toMatchObject({ model: SONNET, thinking: { type: 'between_tools' }, max_tokens: 330 });
    // …and the other way, as src/api-proxy.js sends a reader's call now: Sonnet 5.5 with "between_tools", which only it takes.
    expect(await sentWith(SONNET, HAIKU, { type: 'between_tools' })).toMatchObject({ model: HAIKU, thinking: { type: 'disabled' } });
    // A model with no thinking-off form the module knows is sent none.
    expect(await sentWith(HAIKU, 'claude-opus-5-5', { type: 'disabled' })).not.toHaveProperty('thinking');
    // A model that needs none, asked without one, gains the new model's.
    expect(await sentWith('claude-haiku-4-5', SONNET)).toMatchObject({ thinking: { type: 'between_tools' } });
    // A `thinking` that is not the asked model's off form is the caller's own: left as it is.
    expect(await sentWith(HAIKU, SONNET, { type: 'adaptive' })).toMatchObject({ model: SONNET, thinking: { type: 'adaptive' } });
    expect(await sentWith(HAIKU, SONNET), 'a body with no `thinking` where its model has an off form: the caller\'s choice').not.toHaveProperty('thinking');
  });

  it('the budget gate reserves and settles the call at the model it is sent to', async () => {
    const budget = createBudget({ caps: { actions: 0, calls: 10, minutes: 20, usd: 1 }, prices: PRICES });
    const reserved = [];
    const { send } = harnessWith({
      model: () => SONNET,
      gate: {
        before: (call) => { reserved.push(call.model); return budget.reserve({ ...call, role: 'sonnet arm' }); },
        after: (id, { usage }) => budget.settle(id, { usage }),
      },
    });
    await send(PACING);
    expect(reserved).toEqual([SONNET]);
    const price = PRICES[SONNET];
    expect(budget.report().usd, 'priced as Sonnet, not as the Haiku the reader asked for').toBeCloseTo((1000 * price.input + 100 * price.output) / 1_000_000, 4);
    // A model nobody priced is refused before it is sent, as any unpriced model is.
    const unpriced = harnessWith({ model: () => 'claude-nobody-priced', gate: { before: (call) => budget.reserve(call), after: () => {} } });
    const res = await unpriced.send(PACING);
    expect(unpriced.sent).toEqual([]);
    expect(res.status).toBe(200);
    expect(unpriced.harness.requests[0]).toMatchObject({ model: 'claude-nobody-priced', modelAsked: HAIKU });
    expect(unpriced.harness.requests[0].source).toMatch(/^refused \(unpriced-model: /);
  });

  it('an arm that is the reader\'s own model, or no option at all, sends the call untouched', async () => {
    const same = harnessWith({ model: (kind, liveModel) => (HAIKU !== liveModel ? HAIKU : null) });
    await same.send(PACING);
    expect(same.sent[0].body).toBe(bodyOf(HAIKU));
    expect(same.harness.requests[0]).toMatchObject({ model: HAIKU });
    expect(same.harness.requests[0].modelAsked).toBeUndefined();

    const named = harnessWith({ model: () => HAIKU });
    await named.send(PACING);
    expect(named.sent[0].body, 'naming the model it already has changes nothing').toBe(bodyOf(HAIKU));
    expect(named.harness.requests[0].modelAsked).toBeUndefined();

    const plain = harnessWith({});
    await plain.send(PACING);
    expect(plain.sent[0].body).toBe(bodyOf(HAIKU));
    expect(plain.harness.requests[0].modelAsked).toBeUndefined();
  });

  it('applies to calls that are forwarded: a replayed call is answered as before', async () => {
    const model = vi.fn(() => SONNET);
    const harness = createClaudeHarness({ mode: 'replay', log: () => {}, model });
    let bridge = null;
    harness.attach({ exposeFunction: async (_n, fn) => { bridge = fn; }, addInitScript: async () => {} }, 'gm');
    const res = await bridge({ url: 'https://api.anthropic.com/v1/messages', headers: {}, stack: PACING, body: bodyOf(HAIKU) });
    expect(JSON.parse(res.body).content[0].text, 'the neutral stub for a JSON helper').toBe('{}');
    expect(model).not.toHaveBeenCalled();
    expect(harness.requests[0]).toMatchObject({ model: HAIKU, source: 'stub' });
  });
});
