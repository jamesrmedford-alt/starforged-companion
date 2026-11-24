/**
 * A player is never made to name a move (docs/decisions.md): the long haul's
 * AI player types only what its character does, and the run measures what
 * became of those lines.
 *
 * The long haul's second live run could not show how often a plain line goes
 * unread — the maintainer's main complaint on reading it — because its
 * charter had the player name its moves: the beats named them, and a player
 * note said "say the line again, plainly, as that move". From the first line
 * of most beats the player wrote "…, to Develop Your Relationship", and the
 * review marked those steps right. And twenty memory questions were typed as
 * lines of play, where the narrator is told to continue the fiction — so it
 * answered through an all-knowing voice. Most belong to `@scene`.
 *
 * Covered here: the move-name count (lib/moveNames.mjs), the charter as it
 * now reads, the observer's last resort (lib/beats.mjs), the player's prompt
 * (lib/player.mjs), what each line became (lib/review.mjs freeformOf), and a
 * question asked through `@scene` in the ledger (lib/ledger.mjs).
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { movesNamedIn, moveLabel } from '../../test/ci/playwright/lib/moveNames.mjs';
import { ATTACK_MOVES, BEAT_CHECKS, LAST_RESORT_AFTER, createPointer, isSceneQuestion } from '../../test/ci/playwright/lib/beats.mjs';
import { playerSystemPrompt } from '../../test/ci/playwright/lib/player.mjs';
import { isProbeLine, scoreLedger } from '../../test/ci/playwright/lib/ledger.mjs';
import { freeformOf, moveReadOf, pacingReadOf, scorecard } from '../../test/ci/playwright/lib/review.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const CHARTER = { name: 'long-haul', ...JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8')) };
const RUN_2 = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'explorations/long-haul-live-20261123-1459/replay.json'), 'utf8'));

// ── a move named in what a player typed ──────────────────────────────────────

describe('a move named in a line of play', () => {
  it('finds the names the second live run\'s player wrote — and none in its plain lines', () => {
    expect(movesNamedIn('I raise Tamsin Okoro on the comm and trade news with her, asking how the docks have been, to Develop Your Relationship.')).toEqual(['Develop Your Relationship']);
    expect(movesNamedIn('I heal my wounds: I use the medkit to Heal myself, rolling Heal.')).toEqual(['Heal', 'roll']);
    expect(movesNamedIn('I give up on the wound for now and restock the ship at Bleakhold\'s market instead, a Resupply.')).toEqual(['Resupply']);
    expect(movesNamedIn('Tamsin, I\'m asking again plainly: forge a bond with me.')).toEqual(['Forge a Bond']);
    expect(movesNamedIn('I mark progress on my vow: that is a milestone toward finding who is raiding the lanes.')).toEqual(['milestone', 'mark progress']);
    expect(movesNamedIn('I have found who is raiding the lanes. I fulfil my vow.'), 'any possessive, either spelling').toEqual(['Fulfill Your Vow']);
    for (const plain of [
      'I treat my wounds with the ship\'s medkit.',
      'I plot the course and take the Kobayashi IV to Bleakhold Station.',
      'I work the docks asking traders who saw the raiders last, pressing hard even though it may cost me Tamsin\'s trust and draw the wrong eyes.',
      'I look over the wreckage of the cutter and tell the table what I see drifting there.',
    ]) expect(movesNamedIn(plain), plain).toEqual([]);
  });

  it('a one-word move is a name only where it is written as one; a verb in the fiction is not', () => {
    expect(movesNamedIn('I strike at her drive section with the forward guns.')).toEqual([]);
    expect(movesNamedIn('Strike first, I tell myself, and bring the guns round.'), 'the first word of a sentence').toEqual([]);
    expect(movesNamedIn('I repair the coupling with what I have.')).toEqual([]);
    expect(movesNamedIn('I use the kit, a Repair.')).toEqual(['Repair']);
    expect(movesNamedIn('I roll out of the way of the falling spar.'), '"roll" as something a body does').toEqual([]);
    expect(movesNamedIn('I roll to see if I can shift it.')).toEqual(['roll']);
  });

  it('a command and a scene question are not lines of play', () => {
    expect(movesNamedIn('!oracle yes likely Do I pay the price for this?')).toEqual([]);
    expect(movesNamedIn('@scene Did I ever set a course for Bleakhold?')).toEqual([]);
    expect(isSceneQuestion('@scene Who has the manifest?')).toBe(true);
    expect(isSceneQuestion('Who has the manifest?')).toBe(false);
  });

  it('labels a move as the rules write it', () => {
    expect(moveLabel('develop_your_relationship')).toBe('Develop Your Relationship');
    expect(moveLabel('swear_an_iron_vow')).toBe('Swear an Iron Vow');
    expect(moveLabel('enter_the_fray')).toBe('Enter the Fray');
  });
});

// ── the charter as it now reads ──────────────────────────────────────────────

/** What a beat has the player type: the words it puts in quotes. */
const quoted = (text) => [...String(text ?? '').matchAll(/"([^"]+)"/g)].map(m => m[1]);

describe('the long-haul charter keeps its player in the fiction', () => {
  it('tells the player never to name a move, and no longer to "say the line again, plainly, as that move"', () => {
    const notes = CHARTER.playerNotes.join('\n');
    expect(notes).toContain('Never write a move\'s name, a stat or a rule word in it');
    expect(notes).toContain('LAST RESORT');
    expect(notes).not.toContain('as that move');
    expect(playerSystemPrompt(CHARTER)).toContain('What you type is in the fiction');
  });

  it('gives the player no line to type that names a move — in a beat\'s words to type or in the rehearsal\'s', () => {
    for (const beat of CHARTER.beats) {
      for (const words of quoted(beat.tell).filter(w => !/^[!@⚔⚑🏁🔥]/u.test(w) && !/^(?:Keep the result|A fight looms|Roll …|New vow recorded)$/.test(w))) {
        expect(movesNamedIn(words), `beat ${beat.n}: "${words}"`).toEqual([]);
      }
    }
    for (const step of CHARTER.rehearsal.filter(a => a.action === 'say' && a.text)) {
      expect(movesNamedIn(step.text), step.text).toEqual([]);
    }
  });

  it('shows the player a beat title that names no move, and says how to name it only as a last resort', () => {
    const prompt = playerSystemPrompt(CHARTER);
    for (const beat of CHARTER.beats.filter(b => b.wants)) {
      expect(beat.lastResort, `beat ${beat.n} wants a move of a plain line: it says how to name it at the last`).toBeTruthy();
      expect(movesNamedIn(beat.lastResort).length, `beat ${beat.n}'s last resort names the move`).toBeGreaterThan(0);
      const shown = beat.playerTitle ?? beat.title;
      expect(movesNamedIn(shown), `beat ${beat.n}'s title as the player sees it: "${shown}"`).toEqual([]);
      expect(prompt).toContain(`${beat.n}. [session ${beat.session}] ${shown}`);
      expect(prompt, 'the last resort is the observer\'s to give, not in the list of beats').not.toContain(beat.lastResort);
    }
    expect(CHARTER.beats.filter(b => b.wants).map(b => b.id)).toEqual(['b2', 'b4', 'b7a', 'b8', 'b9', 'b10', 'b11', 'b13', 'b21', 'b22', 'b23', 'b24']);
  });

  it('asks its memory questions through @scene — all but one of each set, and one of the two baits, kept as lines of play to compare', () => {
    const typed = CHARTER.beats.flatMap(b => quoted(b.tell));
    const asks = [...CHARTER.facts.flatMap(f => f.probes), ...CHARTER.baits];
    const how = asks.map((p) => {
      const scene = typed.includes(`@scene ${p.ask}`);
      const plain = typed.includes(p.ask);
      expect(scene !== plain, `"${p.ask}" is typed one way`).toBe(true);
      return { id: p.id, scene };
    });
    expect(how.filter(x => !x.scene).map(x => x.id).sort()).toEqual(['F3-C', 'F4-A', 'F6-B', 'bait-dock']);
    expect(how.filter(x => x.scene)).toHaveLength(asks.length - 4);
    // The rehearsal types them the same way.
    for (const step of CHARTER.rehearsal.filter(a => a.probe || a.bait)) {
      const ask = asks.find(p => step.text.endsWith(p.ask));
      expect(isSceneQuestion(step.text), step.text).toBe(how.find(x => x.id === ask.id).scene);
    }
  });

  it('a question typed with @scene is still the probe it is', () => {
    const probe = CHARTER.facts[0].probes[0];
    expect(isProbeLine(`@scene ${probe.ask}`, probe)).toBe(true);
  });
});

// ── the observer's last resort ───────────────────────────────────────────────

describe('the observer tells the player it may name a move only after plain lines have brought nothing', () => {
  const beat = { id: 'b1', n: 1, session: 1, title: 'Gather Information', playerTitle: 'Ask around the docks', tell: 'Work the docks.',
    check: { type: 'moveRolled', moves: ['gather_information'] }, lastResort: 'say that you gather information on the docks' };
  const mark = (step) => ({ step, phase: 'session-1', table: { pcs: [], connections: [], session: { active: true } }, cards: [] });
  const line = (step, text) => ({ id: step, step, phase: 'session-1', text, fromPlayer: true, card: [] });

  it('shows the player the title that names no move', () => {
    const pointer = createPointer([beat]);
    pointer.advance({ marks: [mark('(setup)')], messages: [], actions: [], charter: CHARTER }, '(setup)');
    expect(pointer.brief().title).toBe('Ask around the docks');
    expect(pointer.brief().note).not.toContain('LAST RESORT');
  });

  it(`says so after ${LAST_RESORT_AFTER} plain lines, and the beat keeps that it did`, () => {
    const pointer = createPointer([beat]);
    const marks = [mark('(setup)')];
    const messages = [];
    pointer.advance({ marks, messages, actions: [], charter: CHARTER }, '(setup)');
    const play = (step, text) => { marks.push(mark(step)); messages.push(line(step, text)); pointer.record(step); pointer.advance({ marks, messages, actions: [], charter: CHARTER }, step); };
    play('a1', 'I ask along the docks who saw the raiders last.');
    expect(pointer.brief().note, 'one plain line: say it another way first').not.toContain('LAST RESORT');
    expect(pointer.state[0].lastResort).toBe(false);
    play('a2', '@scene Who works these docks?');
    expect(pointer.brief().note, 'a scene question is not a line of play').not.toContain('LAST RESORT');
    play('a3', 'I lean on the water-seller until she tells me what she saw.');
    expect(pointer.brief().note).toContain('LAST RESORT — 2 plain lines have brought nothing about: this once you may name the move — say that you gather information on the docks');
    expect(pointer.state[0].lastResort).toBe(true);
  });

  it('a beat that names no last resort never offers one', () => {
    const pointer = createPointer([{ ...beat, lastResort: undefined }]);
    const marks = [mark('(setup)'), mark('a1'), mark('a2'), mark('a3')];
    const messages = [line('a1', 'One.'), line('a2', 'Two.'), line('a3', 'Three.')];
    pointer.advance({ marks: marks.slice(0, 1), messages: [], actions: [], charter: CHARTER }, '(setup)');
    pointer.advance({ marks, messages, actions: [], charter: CHARTER }, 'a3');
    expect(pointer.brief().note).not.toContain('LAST RESORT');
  });
});

// ── what each line of play became ────────────────────────────────────────────

describe('what each line of play became — from the readers\' own replies', () => {
  const reply = (step, kind, json) => ({ step, kind, response: { content: [{ type: 'text', text: JSON.stringify(json) }] } });
  const say = (step, text) => ({ step, text, fromPlayer: true });

  it('reads a reply: the pacing reader\'s decision and move, the move reader\'s move or none', () => {
    expect(pacingReadOf(reply('a1', 'callClassifierAPI>classifyInput', { decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'set_a_course', reasoning: 'r' })))
      .toMatchObject({ decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggested: 'set_a_course' });
    expect(pacingReadOf({ response: { content: [{ type: 'text', text: 'not json' }] } })).toBeNull();
    expect(moveReadOf(reply('a1', 'callClaudeAPI>interpretMove', { moveId: 'heal', mischiefApplied: true }))).toEqual({ moveId: 'heal', noMove: false, mischief: true });
    expect(moveReadOf(reply('a1', 'callClaudeAPI>interpretMove', { noMove: true, rationale: 'talk' }))).toMatchObject({ moveId: null, noMove: true });
  });

  it('the second live run\'s recovery and bond beats, by its recorded replies: one plain line ignored, the rest named', () => {
    const steps = { a49: 'I treat my wounds with the ship\'s medkit.', a50: 'I heal my wounds: I use the medkit to Heal myself, rolling Heal.',
      a59: 'I raise Tamsin Okoro on the comm and trade news with her, asking how the docks have been, to Develop Your Relationship.',
      a63: 'I keep Tamsin talking on the comm and describe the clerk\'s face to her, to Develop Your Relationship.',
      a65: 'Tamsin, I ask you to forge a bond with me, to Forge a Bond.',
      a71: 'I now have proof the raids are fed by dock clerks selling cargo routes; that is a milestone on my vow to find who is raiding the Cinder Expanse lanes.' };
    const exchanges = RUN_2.recording.exchanges.filter(x => steps[x.step]);
    expect(exchanges.filter(x => /classifyInput$/.test(x.kind)).map(x => x.step).sort()).toEqual(Object.keys(steps).sort());
    const beats = [{ id: 'b21', n: 21, steps: ['a49', 'a50'] }, { id: 'b22', n: 22, steps: ['a59', 'a63', 'a65'] }, { id: 'b24', n: 24, steps: ['a71'] }];
    const f = freeformOf({ messages: Object.entries(steps).map(([step, text]) => say(step, text)), exchanges, beats, charter: CHARTER });
    const at = (step) => f.lines.find(l => l.step === step);
    expect(at('a49')).toMatchObject({ named: [], became: 'narrated', move: null, right: false });
    expect(at('a50')).toMatchObject({ named: ['Heal', 'roll'], became: 'rolled', move: 'heal', right: true });
    expect(at('a59')).toMatchObject({ became: 'rolled', move: 'develop_your_relationship', right: true });
    expect(at('a63'), 'the same wording, offered and not made').toMatchObject({ became: 'offered', move: 'develop_your_relationship', right: true });
    expect(at('a65'), 'a named Forge a Bond read as another move').toMatchObject({ became: 'rolled', move: 'make_a_connection', right: false });
    expect(at('a71')).toMatchObject({ named: ['milestone'], became: 'narrated', right: false });
    expect(f.wanted).toMatchObject({ lines: 6, rolled: 2, offered: 1, anotherMove: 1, narrated: 2 });
    expect(f.plain, 'the one line that named nothing went unread').toMatchObject({ lines: 1, rolled: 0, offered: 0, narrated: 1 });
    expect(f.named.map(n => n.step)).toEqual(['a50', 'a59', 'a63', 'a65', 'a71']);
  });

  it('a beat\'s set-up line wants no move; a memory question typed as play is counted apart; @scene is not a line of play', () => {
    const beats = [{ id: 'b2', n: 2, steps: ['a1', 'a2'] }, { id: 'b7', n: 7, steps: ['a3', 'a4'] }];
    const messages = [
      say('a1', 'On the docks I find Tamsin Vey at her ledger stall.'),
      say('a2', 'I offer Tamsin Vey first pick of my salvage, if she will deal with me from here on.'),
      say('a3', 'By when did I promise to return?'),
      say('a4', '@scene Who is holding the cargo manifest I was carrying?'),
    ];
    const exchanges = [
      reply('a1', 'callClassifierAPI>classifyInput', { decision: 'NARRATIVE', suggestedMove: null }),
      reply('a2', 'callClassifierAPI>classifyInput', { decision: 'MOVE', suggestedMove: 'make_a_connection' }),
      reply('a2', 'callClaudeAPI>interpretMove', { moveId: 'make_a_connection' }),
      reply('a3', 'callClassifierAPI>classifyInput', { decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'gather_information' }),
    ];
    const f = freeformOf({ messages, exchanges, beats, charter: CHARTER });
    expect(f.lines.map(l => l.step)).toEqual(['a1', 'a2', 'a3']);
    expect(f.lines[0]).toMatchObject({ wanted: [], right: null, became: 'narrated' });
    expect(f.lines[1]).toMatchObject({ wanted: ['make_a_connection'], right: true, became: 'rolled' });
    expect(f.lines[2]).toMatchObject({ question: true, wanted: [], became: 'offered', move: 'gather_information' });
    expect(f.wanted).toMatchObject({ lines: 1, rolled: 1 });
    expect(f.questionsAsPlay).toEqual({ lines: 1, offered: 1, rolled: 0 });
    expect(f.sceneQuestions).toBe(1);
  });

  it('the scorecard says it in one row, lists every line, and names the beats that came to their last resort', () => {
    const beats = [{ id: 'b21', n: 21, steps: ['a1', 'a2'], status: 'done', lastResort: true }];
    const messages = [say('a1', 'I treat my wounds with the ship\'s medkit.'), say('a2', 'I Heal my wounds with the medkit.')];
    const exchanges = [
      reply('a1', 'callClassifierAPI>classifyInput', { decision: 'NARRATIVE', suggestedMove: null }),
      reply('a2', 'callClassifierAPI>classifyInput', { decision: 'MOVE', suggestedMove: 'heal' }),
      reply('a2', 'callClaudeAPI>interpretMove', { moveId: 'heal' }),
    ];
    const text = scorecard({ charter: CHARTER, run: { id: 'r', mode: 'live' }, beats, freeform: freeformOf({ messages, exchanges, beats, charter: CHARTER }) });
    expect(text).toContain('| Plain lines | 2 line(s) where a move was wanted: 1 rolled, 0 offered it, 0 read as another move, 1 narrated with nothing offered; 1 line(s) named a move (plain lines alone: 0 of 1 read); 1 beat(s) at last resort; 0 memory question(s) asked as play, 0 as @scene |');
    expect(text).toContain('## What each line of play became');
    expect(text).toContain('| a1 | 21 | I treat my wounds with the ship\'s medkit. |  | narrated — **not what was wanted** |  | heal / resupply / sojourn / hearten |');
    expect(text).toContain('Beats that came to their last resort (the move named, after plain lines brought nothing): 21.');
  });
});

// ── a question asked through @scene, in the ledger ───────────────────────────

describe('a memory question asked through @scene is scored like any other', () => {
  const COMPASS = {
    id: 'F1', kind: 'a possession', statement: 'Mira carries her sister\'s brass star-compass.', variants: ['star-compass', 'compass'],
    probes: [{ id: 'F1-A', set: 'A', ask: 'What do I still carry that belonged to my sister?' }],
  };
  const message = (step, phase, who, text) => ({ id: `${step}-${who}`, step, phase, text, fromPlayer: who === 'player', narrator: who === 'narrator', vignette: null });
  const messages = [
    message('a9', 'session-1', 'player', 'I turn my sister Ilse\'s brass star-compass over in my palm.'),
    message('a9', 'session-1', 'narrator', 'Tamsin watches the brass catch the lamp.'),
    message('a16', 'session-2', 'player', '@scene What do I still carry that belonged to my sister?'),
    message('a16', 'session-2', 'narrator', 'Ilse\'s brass star-compass, in your coat pocket.'),
  ];
  const marks = [{ step: '(setup)', phase: 'before', stores: {}, helpers: {} }, { step: 'a9', phase: 'session-1', stores: {}, helpers: {} },
    { step: 'a16', phase: 'session-2', stores: { F1: [{ store: 'campaign state → previousSessionSummary', memory: true, excerpt: 'her brass star-compass' }] }, helpers: {} }];

  it('its answer is the scene card, and its prompt is the scene question\'s call', () => {
    const scene = { step: 'a16', kind: 'callNarratorAPI>interrogateScene', system: '## ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE\nMira carries the star-compass.', user: '## PLAYER QUESTION' };
    const probe = scoreLedger({ facts: [COMPASS], marks, messages, requests: [scene] }).facts[0].probes[0];
    expect(probe).toMatchObject({ asked: true, step: 'a16', answered: true, inAnswer: true, inPrompt: true });
    expect(probe.promptSections).toEqual(['ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE']);
  });
});

// ── the third live run, kept: the first with a player that names no move ─────

describe('the third live run of the long haul, kept as a replay (explorations/long-haul-live-20261124-0321)', () => {
  const FOLDER = path.join(PLAYWRIGHT, 'explorations/long-haul-live-20261124-0321');
  const RAW = fs.readFileSync(path.join(FOLDER, 'replay.json'), 'utf8');
  const RUN = JSON.parse(RAW);
  const said = (step, kind = /narrate|interrogateScene/) => RUN.recording.exchanges.filter(x => x.step === step && kind.test(x.kind)).map(x => x.response.content.map(c => c.text ?? '').join('')).join('\n');

  it('is a run the runner can take again: 78 actions with no document id, its dice, and every reply filed under a step', () => {
    expect(RUN.actions).toHaveLength(78);
    for (const a of RUN.actions) expect(Object.keys(a)).not.toContain('messageId');
    expect(RUN.dice.length).toBeGreaterThan(0);
    expect(RUN.recording.provenance).toMatchObject({ runner: 'test/ci/playwright/explore.mjs', commit: expect.stringMatching(/^[0-9a-f]{40}$/) });
    const steps = new Set([...RUN.actions.map((_, i) => `a${i + 1}`), ...RUN.charter.beats.filter(b => b.interruption).map(b => `x${b.n}`), '(setup)', '(after)']);
    expect(RUN.recording.exchanges.filter(x => !steps.has(x.step)).map(x => `${x.step} ${x.kind}`)).toEqual([]);
    expect(RAW).not.toMatch(/sk-ant-/);
  });

  it('its player named no move in anything it typed, and asked its questions as the charter says', () => {
    const typed = RUN.actions.filter(a => a.action === 'say' && a.text);
    expect(typed.filter(a => movesNamedIn(a.text).length).map(a => a.text)).toEqual([]);
    expect(typed.filter(a => isSceneQuestion(a.text))).toHaveLength(16);
  });

  it('expects what the corrected check found: the connection\'s five beats not exercised, the fight done, no rule broken', () => {
    const notDone = Object.entries(RUN.expected.beats).filter(([, s]) => s !== 'done').map(([b]) => b);
    expect(notDone).toEqual(['b2', 'b3', 'b18', 'b22', 'b23']);
    expect(RUN.expected).toMatchObject({ violations: [], healthFailed: false, classification: 'suspected-quality-issue' });
    // The run's own verdict had beat 10 not exercised too: its check wanted Strike or Clash.
    expect(RUN.rescored).toMatchObject({ commit: expect.stringMatching(/^[0-9a-f]{40}$/), was: { beats: { done: 20, notExercised: 6 } } });
    const now = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8'));
    expect(RUN.charter.facts).toEqual(now.facts);
    expect(RUN.charter.baits).toEqual(now.baits);
    // By beat id: a beat added since the run (the expedition, b7a) is no part of it.
    const checksById = (beats) => Object.fromEntries(beats.filter(b => RUN.charter.beats.some(x => x.id === b.id)).map(b => [b.id, b.check]));
    expect(checksById(RUN.charter.beats)).toEqual(checksById(now.beats));
    expect(now.beats.filter(b => !RUN.charter.beats.some(x => x.id === b.id)).map(b => b.id)).toEqual(['b7a']);
  });

  it('a fight beat takes any attack the readers make of a plain line: "I press my advantage" was Gain Ground', () => {
    expect(said('a30', /interpretMove/)).toMatch(/"moveId":\s*"gain_ground"/);
    expect(ATTACK_MOVES).toEqual(expect.arrayContaining(['strike', 'clash', 'gain_ground', 'react_under_fire']));
    const mark = (step, cards = []) => ({ step, phase: 'session-2', table: { pcs: [], connections: [], session: { active: true } }, cards });
    const miss = { id: 'c1', move: { name: 'Gain Ground', shown: 'miss', diceLine: 'Action: 3 + 2 = 5 | Challenge: 9, 8' } };
    const price = { id: 'c2', price: { text: 'Pay the Price Gain Ground As stated before the roll: the Wake\'s return fire catches the flank. Routes to Withstand Damage (-1).' } };
    const run = { marks: [mark('a29'), mark('a30', [miss]), mark('a31', [price])], messages: [], actions: [], charter: CHARTER, from: 'a29' };
    const pointer = createPointer([{ id: 'b10', n: 10, session: 2, title: 't', check: { type: 'sufferPaid', moves: ['strike', 'clash'] } }]);
    pointer.advance({ ...run, marks: run.marks.slice(0, 1) }, 'a29');
    const changes = pointer.advance(run, 'a31');
    expect(changes.map(c => c.status), JSON.stringify(pointer.state[0].detail)).toEqual(['done']);
    expect(BEAT_CHECKS.sufferPaid).toBeTypeOf('function');
  });

  it('holds what its review says of it, in the recorded replies', () => {
    // A person the player named in full got a card under half her name, from the narrator's prose alone.
    expect(said('a5', /Detection/)).toMatch(/"name":\s*"Tamsin"/);
    expect(said('a5', /interpretMove/)).toMatch(/"moveId":\s*"compel"/);
    // A step toward the vow, read as another move.
    expect(said('a61', /classifyInput/)).toMatch(/gather_information/);
    // The oracle's NO, narrated as yes — and the corrected name's short form, one step after the correction.
    expect(said('a46')).toContain('which means someone is aboard');
    expect(said('a46')).toContain("The Wake's boarding lock");
    // The vow fulfilled with nobody named.
    expect(said('a64')).toContain('both are named now');
    // A scene question answered by the narrator; a question typed as play answered by a voice in the story.
    expect(said('a73')).toContain('What you left with Tamsin was the manifest');
    expect(said('a56')).toContain('"Cinder Wren. Registered out of nowhere you\'ve heard of."');
    // The match, written as a thing in the scene.
    expect(said('a27')).toContain('The match flares bright on the scope');
  });

  it('its review is written: the cold read first, every step noted, the questions answered', () => {
    const card = fs.readFileSync(path.join(FOLDER, 'scorecard.md'), 'utf8');
    const notes = fs.readFileSync(path.join(FOLDER, 'annotated-transcript.md'), 'utf8');
    expect(card.indexOf('## The cold read')).toBeGreaterThan(-1);
    expect(card.indexOf('## The cold read')).toBeLessThan(card.indexOf('## What this run was to answer'));
    expect(card).toContain('| Plain lines | 8 line(s) where a move was wanted: 4 rolled, 2 offered it, 2 read as another move, 0 narrated with nothing offered; 0 line(s) named a move; 0 beat(s) at last resort; 4 memory question(s) asked as play, 16 as @scene');
    expect(`${card}\n${notes}`).not.toContain('_To write');
    expect(fs.existsSync(path.join(FOLDER, 'cold-read.md'))).toBe(true);
    expect(fs.existsSync(path.join(FOLDER, 'review-notes.md'))).toBe(true);
  });
});
