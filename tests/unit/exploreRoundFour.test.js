/**
 * STARFORGED COMPANION
 * tests/unit/exploreRoundFour.test.js
 *
 * What the long haul's fourth live run (2026-11-24,
 * explorations/long-haul-live-20261124-213912/; issue #383) found wrong with
 * the runner and the charter — known-issues EXPLORE-ROUND-4-RUNNER and the
 * runner's and the charter's halves of the rows beside it — each mended and
 * held here, by the run's own steps where they can be:
 *
 *   1. the GM's rules record a cast member's draft with no bond — "No one"
 *      where the card offers it, else its Confirm, never a character's button
 *      — so that the player's Make a Connection is what makes her a
 *      connection, on today's card and on the moves-as-contracts overhaul's;
 *      the beats
 *      that need the connection ask the world for it, not for beat 2's roll;
 *      and the rehearsal can walk either road (CONNECTION-MADE-BY-CONFIRMING-
 *      A-DRAFT, #1 a and b).
 *   2. the recovery beat is aimed at what the sheet holds spent, Repair among
 *      what it wants (NOTHING-TO-RECOVER-UNTOLD, #2 d);
 *   3. the vow beat's proof is said only once the story has shown it
 *      (CLAIMED-PROOF-OFFERED-A-MILESTONE, #3 c);
 *   4. the fight is fought where the ship lies, in her berth at Bleakhold's
 *      ring (SHIP-POSITION-AND-FRAME-DISAGREE, #8);
 *   6. the observer tells the last resort once, and the line that names the
 *      move spends it; it sees a move made with no roll as a move; and it
 *      names the cards that wait on the player — a held result's "Keep the
 *      result", the milestone's "Which vow advances?" (EXPLORE-ROUND-4-RUNNER,
 *      #16 a–c; the Keep half of HELD-RESULT-NARRATED-AFTER-THE-NEXT-LINE).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DRAFT_HOLDERS, draftConfirmSelectors, draftHolderFor, draftToConfirm } from '../../test/ci/playwright/lib/gm.mjs';
import { castMembers } from '../../test/ci/playwright/lib/cast.mjs';
import { BEAT_CHECKS, LAST_RESORT_AFTER, RECOVER_MOVES, STALL_ACTIONS, beatView, createPointer, sheetSpent, unmetRequirements } from '../../test/ci/playwright/lib/beats.mjs';
import { recheckBeats } from '../../test/ci/playwright/lib/longrun.mjs';
import { charterProblem } from '../../test/ci/playwright/lib/charter.mjs';
import { createRehearsal } from '../../test/ci/playwright/lib/rehearsal.mjs';
import { playerTurnPrompt } from '../../test/ci/playwright/lib/player.mjs';
import { readCards, readTable } from '../../test/ci/playwright/lib/table.mjs';
import { movesNamedIn } from '../../test/ci/playwright/lib/moveNames.mjs';

const ROOT = path.resolve(__dirname, '../..');
const PLAYWRIGHT = path.join(ROOT, 'test/ci/playwright');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, file), 'utf8'));
const CHARTER = { name: 'long-haul', ...readJson('charters/long-haul.json') };
const CONNECTION = { name: 'scenario-connection', ...readJson('charters/scenario-connection.json') };
const RUN_4_FOLDER = path.join(PLAYWRIGHT, 'explorations/long-haul-live-20261124-213912');
const RUN_4 = JSON.parse(fs.readFileSync(path.join(RUN_4_FOLDER, 'replay.json'), 'utf8'));
/** What the fourth run's module was answered at a step, by call kind. */
const said = (step, kind) => RUN_4.recording.exchanges.filter(x => x.step === step && kind.test(x.kind)).map(x => x.response.content.map(c => c.text ?? '').join('')).join('\n');

// The table as the observer records it (lib/table.mjs), in small.
const PC = { id: 'pc', name: 'Mira Kestrel', health: 5, spirit: 5, supply: 5, momentum: 2, momentumMax: 10, momentumReset: 2, debilities: [], vows: [], bonds: [], legacies: {} };
const tableOf = (over = {}) => ({
  session: { active: true, id: 's1', pendingMove: false, xCardActive: false, questFocus: '' }, location: { id: 'L1', name: 'Hollow Spire' },
  ship: { token: null, tokenAt: null }, pcs: [{ ...PC, ...(over.pc ?? {}) }], connections: [], entityCards: [], tracks: [],
  legacy: {}, scene: { truths: [] }, helpers: {}, plans: [], ...over, pc: undefined,
});
const markOf = (step, table, cards = []) => ({ step, phase: 'session-1', table, cards });
const moveCard = (id, name, diceLine, shown, extra = {}) => ({ id, move: { resolutionId: id, actorId: 'pc', name, diceLine, shown, burn: null, held: null, ...extra } });
const narratedAs = (id, resolutionId, moveId, outcome) => ({ id, narration: { resolutionId, moveId, outcome, narrationId: `n-${id}` } });
const line = (step, text, phase = 'session-1') => ({ id: `l-${step}`, step, phase, text, fromPlayer: true, card: [] });

// Tamsin Vey as the fourth run's GM made her (a4): a card, and a bond Item on Mira's sheet.
const TAMSIN = { hostId: 'A1', recordId: 'r1', name: 'Tamsin Vey', rank: 'dangerous', bonded: false, active: true, ticks: 0 };
const BOND = { id: 'i1', name: 'Tamsin Vey', rank: 'dangerous', ticks: 0, completed: false, connectionId: 'r1', lost: false };
const VOW = { id: 'v1', vowId: 'v1', name: 'Find who is raiding the Cinder Expanse lanes', rank: 'dangerous', ticks: 0, completed: false, linkedConnectionId: null, linkedConnectionName: null };
/** She is recorded (a card) — and, with `bond`, Mira's connection. */
const recorded = ({ bond = false, ticks = 0, vows = [VOW] } = {}) => tableOf({
  connections: [{ ...TAMSIN, ticks }], entityCards: [{ id: 'A1', name: 'Tamsin Vey', entityType: 'connection' }],
  pc: { vows, bonds: bond ? [{ ...BOND, ticks }] : [] },
});

// ── 1. a cast member recorded with "No one"; beats gated on the connection ───

describe('the GM\'s rules record a cast member\'s draft with no bond (the fourth live run, a4)', () => {
  it('the run\'s GM pressed the character\'s button: a bond with no Make a Connection — and every plea for a tie was then Develop Your Relationship', () => {
    const notes = fs.readFileSync(path.join(RUN_4_FOLDER, 'annotated-transcript.md'), 'utf8');
    expect(notes).toContain('confirmed the draft for Tamsin Vey, as the player character\'s connection');
    expect(said('a5', /interpretMove/)).toMatch(/"moveId":\s*"develop_your_relationship"/);
    expect(RUN_4.expected.beats).toMatchObject({ b2: 'not-exercised', b3: 'not-exercised', b18: 'not-exercised', b22: 'not-exercised', b23: 'not-exercised' });
  });

  /**
   * Which of a row's Confirm buttons the selectors press, as the page does
   * (the first selector any button matches, the first such button): each
   * button by its `data-actor-id` — an actor's id, "" for "No one", absent
   * for a plain Confirm.
   */
  const pressedOf = (buttons, selectors) => {
    for (const s of selectors) {
      const hit = buttons.find(b => (s === '' ? true : s === '[data-actor-id=""]' ? b.actorId === '' : s === ':not([data-actor-id])' ? b.actorId === undefined : s === `[data-actor-id="${b.actorId}"]`));
      if (hit) return hit.label;
    }
    return null;
  };
  const CARDS = {
    // Today's card (renderDraftCardHtml): a person's row asks whose connection — a button per character, and "No one" …
    'today, with the card\'s character': [{ label: 'Mira Kestrel', actorId: 'P1' }, { label: 'No one', actorId: '' }],
    // … or, where the card names none, a plain Confirm (the confirming user's own character's) and "No one".
    'today, with no character on the card': [{ label: 'Confirm' }, { label: 'No one', actorId: '' }],
    // The moves-as-contracts overhaul's card (decision D4): its Confirm records the person; Make a Connection rolls the move.
    'the overhaul\'s card': [{ label: 'Confirm' }],
    'a place or a ship': [{ label: 'Confirm' }],
    'a row that offers only a character\'s button': [{ label: 'Mira Kestrel', actorId: 'P1' }],
  };

  it('records the person with no bond: "No one" where the row offers it, else its own Confirm — never a character\'s button', () => {
    expect(DRAFT_HOLDERS).toEqual(['none', 'pc']);
    const rule = draftConfirmSelectors({ pcId: 'P1' });
    expect(rule).toEqual(['[data-actor-id=""]', ':not([data-actor-id])']);
    expect(Object.fromEntries(Object.entries(CARDS).map(([card, buttons]) => [card, pressedOf(buttons, rule)]))).toEqual({
      'today, with the card\'s character': 'No one',
      'today, with no character on the card': 'No one',
      'the overhaul\'s card': 'Confirm',
      'a place or a ship': 'Confirm',
      'a row that offers only a character\'s button': null,
    });
    // The rule the kept runs were made under, kept for their replays: the character's button, else the first Confirm.
    const before = draftConfirmSelectors({ pcId: 'P1', holder: 'pc' });
    expect(before).toEqual(['[data-actor-id="P1"]', '']);
    expect(pressedOf(CARDS['today, with the card\'s character'], before)).toBe('Mira Kestrel');
    expect(pressedOf(CARDS['the overhaul\'s card'], before), 'no character\'s button on that card: its Confirm').toBe('Confirm');
    // Which draft is confirmed is unchanged: the cast member's, once.
    const members = castMembers(CHARTER.cast);
    expect(draftToConfirm([{ messageId: 'm', index: 0, name: 'Tamsin Vey', type: 'connection' }], members)).toMatchObject({ member: { name: 'Tamsin Vey' }, exact: true });
  });

  it('the module\'s draft card marks its buttons as the rule reads them: "No one" by an empty actor id, a character\'s by theirs', () => {
    // src/entities/entityExtractor.js renderDraftCardHtml (issue #354 P2-16), today's card.
    const source = fs.readFileSync(path.join(ROOT, 'src/entities/entityExtractor.js'), 'utf8');
    expect(source).toContain('`<button class="sf-draft-btn sf-draft-confirm sf-draft-no-bond" data-action="sf-draft-confirm" `');
    expect(source).toContain('data-actor-id="" title="Add them with no connection on anyone\'s sheet">No one</button>');
    expect(source).toContain('`data-index="${e.index}" data-actor-id="${escapeHtml(h.actorId)}">${escapeHtml(h.name)}</button>`');
    expect(source).toContain('`data-action="sf-draft-confirm" data-index="${e.index}">Confirm</button>`');
  });

  it('a run records her with no bond; a rehearsal may ask for the fourth run\'s road; a replay plays under its own run\'s rule', () => {
    expect(draftHolderFor({ mode: 'live', env: {} })).toBe('none');
    expect(draftHolderFor({ mode: 'rehearsal', env: {} })).toBe('none');
    expect(draftHolderFor({ mode: 'rehearsal', env: { EXPLORE_DRAFT_HOLDER: 'pc' } })).toBe('pc');
    expect(draftHolderFor({ mode: 'rehearsal', env: { EXPLORE_DRAFT_HOLDER: ' PC ' } })).toBe('pc');
    expect(() => draftHolderFor({ mode: 'rehearsal', env: { EXPLORE_DRAFT_HOLDER: 'tamsin' } })).toThrow(/EXPLORE_DRAFT_HOLDER is one of none, pc/);
    expect(() => draftHolderFor({ mode: 'live', env: { EXPLORE_DRAFT_HOLDER: 'pc' } }), 'a live run never presses a character\'s button').toThrow(/is for a rehearsal: a live run's GM records a cast member with no bond/);
    expect(draftHolderFor({ mode: 'replay', earlier: { gm: { draftHolder: 'none' } } })).toBe('none');
    expect(draftHolderFor({ mode: 'replay', earlier: { gm: { draftHolder: 'none' } }, env: { EXPLORE_DRAFT_HOLDER: 'pc' } }), 'not the environment\'s').toBe('none');
    // The kept runs were made before the rule was written down: they replay as they were played.
    expect(RUN_4.gm).toBeUndefined();
    expect(draftHolderFor({ mode: 'replay', earlier: RUN_4 })).toBe('pc');
  });
});

describe('the beats that need the connection ask the world for it, not for beat 2\'s roll (#1 b)', () => {
  const b2 = CHARTER.beats.find(b => b.id === 'b2');
  const b3 = CHARTER.beats.find(b => b.id === 'b3');
  const REQUIRES = [{ type: 'connectionMade', name: 'Tamsin Vey' }];

  it('beats 3, 19 and 23 require her to be the character\'s connection — whichever road made her one; beat 24 needs beat 23\'s bond', () => {
    for (const id of ['b3', 'b18', 'b22']) {
      const beat = CHARTER.beats.find(b => b.id === id);
      expect(beat.requires, id).toEqual(REQUIRES);
      expect(beat.needs ?? [], id).not.toContain('b2');
    }
    expect(b3.needs).toEqual(['b1']);
    expect(CHARTER.beats.find(b => b.id === 'b23').needs).toEqual(['b22']);
    expect(CHARTER.beats.filter(b => (b.needs ?? []).includes('b2')).map(b => b.id), 'nothing waits on beat 2\'s roll').toEqual([]);
    // Beat 2 itself still wants the roll: its check is the kept runs' own.
    expect(b2.check).toEqual({ type: 'connectionMade', name: 'Tamsin Vey', move: 'make_a_connection' });
    expect(charterProblem(CHARTER)).toBeNull();
  });

  it('the connection scenario likewise: its favours and its bond need her made, not the roll that should make her', () => {
    for (const id of ['c3', 'c4', 'c5']) {
      const beat = CONNECTION.beats.find(b => b.id === id);
      expect(beat.requires, id).toEqual(REQUIRES);
      expect(beat.needs ?? [], id).not.toContain('c2');
    }
    expect(CONNECTION.beats.find(b => b.id === 'c2').check).toEqual({ type: 'connectionMade', name: 'Tamsin Vey', move: 'make_a_connection' });
    expect(charterProblem(CONNECTION)).toBeNull();
  });

  it('a charter may require only what a check the observer knows can see', () => {
    const odd = { ...CONNECTION, beats: CONNECTION.beats.map(b => (b.id === 'c3' ? { ...b, requires: [{ type: 'friendship' }] } : b)) };
    expect(charterProblem(odd)).toBe('a beat requires of the world what no check the observer knows can see (c3 requires what a "friendship" check would see)');
    expect(BEAT_CHECKS.connectionMade).toBeTypeOf('function');
  });

  /** Beats 2 and 3 walked over the marks: beat 2 left to stall, then beat 3 (its need of beat 1 set aside: beat 1 is not walked here). */
  const walk = (marks, beat3 = { ...b3, needs: [] }) => {
    const pointer = createPointer([{ ...b2, needs: [] }, beat3]);
    const run = (upTo) => ({ marks: marks.slice(0, upTo + 1), messages: [], actions: [], charter: CHARTER });
    pointer.advance(run(0), marks[0].step);
    for (let i = 1; i < marks.length; i++) {
      pointer.record(marks[i].step, { action: 'wait', seconds: 3 });
      pointer.advance(run(i), marks[i].step);
    }
    return pointer.state;
  };
  // Her card and her bond from a4, and no Make a Connection ever rolled: the fourth run's road.
  const drafted = [markOf('a3', tableOf({ pc: { vows: [VOW] } })), ...Array.from({ length: STALL_ACTIONS + 2 }, (_, i) => markOf(`a${4 + i}`, recorded({ bond: true })))];

  it('the fourth run\'s road: beat 2 is not exercised — no Make a Connection could come — and beat 3 is walked all the same', () => {
    const [two, three] = walk(drafted);
    expect(two).toMatchObject({ status: 'not-exercised' });
    expect(two.detail).toContain('Tamsin Vey has a card and a bond Item; make_a_connection has not been rolled');
    expect(three.status, 'beat 3 is current: the vow is to be linked').toBe('current');
    expect(three.detail).toBe('no vow is linked to a connection');
    // As the run had it — gated on beat 2 — it was lost with beat 2.
    const [, lost] = walk(drafted, { ...b3, requires: undefined, needs: ['b2'] });
    expect(lost).toMatchObject({ status: 'not-exercised', detail: 'it needs beat 2, which was not done' });
  });

  it('the other road missed too: with no connection at all, beat 3 is not exercised, and says what it needed of the world', () => {
    const none = [markOf('a3', tableOf({ pc: { vows: [VOW] } })), ...Array.from({ length: STALL_ACTIONS + 2 }, (_, i) => markOf(`a${4 + i}`, recorded({ bond: false })))];
    const [, three] = walk(none);
    expect(three).toMatchObject({ status: 'not-exercised' });
    expect(three.detail).toBe('it needs Tamsin Vey to be Mira Kestrel\'s connection, which the world does not hold (Tamsin Vey has a card; Mira Kestrel holds no bond Item for it)');
    expect(unmetRequirements(b3, beatView({ marks: drafted, messages: [], actions: [], charter: CHARTER, from: 'a4' }))).toEqual([]);
  });

  it('a re-score asks it the same way, over the steps the run gave the beat', () => {
    const marks = drafted.slice(0, 3);
    const was = [{ id: 'b3', n: 3, status: 'not-exercised', actions: 0, steps: [], enteredAt: 'a5', doneAt: 'a5', detail: 'x' }];
    const charter = { ...CHARTER, beats: [{ ...b3, needs: [] }] };
    expect(recheckBeats({ charter, beats: was, marks, messages: [], actions: [] })[0]).toMatchObject({ status: 'not-exercised', detail: 'no vow is linked to a connection' });
    const bare = [markOf('a3', tableOf()), markOf('a4', tableOf()), markOf('a5', tableOf())];
    expect(recheckBeats({ charter, beats: was, marks: bare, messages: [], actions: [] })[0]).toMatchObject({ status: 'not-exercised', detail: 'it needs Tamsin Vey to be Mira Kestrel\'s connection, which the world does not hold (Tamsin Vey has no connection card yet)' });
  });
});

describe('the rehearsal walks either road: its readers refuse a connection already made, and its player keeps to its beats', () => {
  const entry = CHARTER.rehearsal.find(e => e.beat === 2 && e.move?.id === 'make_a_connection');
  const turn = (beat) => ({ system: 'You are playtesting', tools: [{ name: 'take_action' }], messages: [{ role: 'user', content: `CURRENT BEAT: ${beat} of 27 [session 1] — Meet someone\n\nYOUR SCREEN NOW:\n[m1] Gamemaster: hello` }] });
  const pacing = (connections) => ({ system: 'You are the pacing pre-classifier for a Starforged table.', messages: [{ role: 'user', content: `## CHARACTER\nName: Mira Kestrel\nSITUATION — Mira Kestrel's sheet as it stands:\n- Meters: Health 5 of 5 (full, not wounded).\n- Connections: ${connections}.\n\n## PLAYER INPUT\n${entry.text}` }] });
  const reading = (r, connections) => JSON.parse(r.reply(pacing(connections)).content[0].text);
  const rehearse = () => { const r = createRehearsal({ charter: { ...CHARTER, rehearsal: [entry] } }); r.reply(turn(2)); return r; };

  it('makes the scripted Make a Connection where she is no one\'s connection yet — the "No one" road', () => {
    expect(entry.move).toMatchObject({ id: 'make_a_connection', target: 'Tamsin Vey' });
    expect(reading(rehearse(), 'none')).toMatchObject({ decision: 'MOVE', suggestedMove: 'make_a_connection' });
  });

  it('narrates it where the sheet already holds her — under her name, or the part of it her card was made under', () => {
    for (const held of ['"Tamsin Vey" (dangerous, relationship 0 of 10 boxes)', '"Tamsin" (dangerous, relationship 0 of 10 boxes)']) {
      const r = rehearse();
      expect(reading(r, held), held).toMatchObject({ decision: 'NARRATIVE', suggestedMove: null, reasoning: expect.stringContaining('is already among the connections') });
      const asked = { system: 'You are the move interpreter.', messages: [{ role: 'user', content: `Connections:\n- Connections: ${held}.` }] };
      expect(JSON.parse(r.reply(asked).content[0].text)).toMatchObject({ noMove: true, moveId: null });
    }
    // Someone else held is no reason to refuse her.
    expect(reading(rehearse(), '"Idris Vane" (troublesome, relationship 0 of 10 boxes)')).toMatchObject({ decision: 'MOVE' });
  });

  it('its scripted player waits for a later beat\'s entry until that beat comes, and does not spend its patience on it', () => {
    const later = CHARTER.rehearsal.find(e => e.beat === 3 && e.action === 'choose');
    const r = createRehearsal({ charter: { ...CHARTER, rehearsal: [later] } });
    const screen = (beat) => ({ ...turn(beat), messages: [{ role: 'user', content: `CURRENT BEAT: ${beat} of 27 [session 1] — Link\n\nYOUR SCREEN NOW:\n[e1] Gamemaster: New vow recorded\n     buttons: (1) "Link"\n     dropdown (1) "For a connection?" = "— none —" options: — none — | Tamsin Vey` }] });
    for (let i = 0; i < 6; i++) expect(r.reply(screen(2)).content[0].input, `turn ${i + 1}`).toMatchObject({ action: 'wait', reason: 'waiting for beat 3: beat 2 is not over' });
    expect(r.reply(screen(3)).content[0].input).toMatchObject({ action: 'choose', option: 'Tamsin Vey' });
    expect(r.skipped).toEqual([]);
  });
});

/**
 * Run a page function as the page would, with the globals it reads stood in
 * for: `game`, and a DOMParser that knows no markup (a card's text is then
 * its content with the tags taken out). Restored after.
 */
async function withPage(globals, fn) {
  const names = ['DOMParser', ...Object.keys(globals)];
  const saved = Object.fromEntries(names.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  globalThis.DOMParser = class { parseFromString(html) { const text = String(html).replace(/<[^>]+>/g, ' '); return { querySelector: () => null, querySelectorAll: () => [], body: { textContent: text } }; } };
  Object.assign(globalThis, globals);
  try { return await fn(); } finally {
    for (const [k, d] of Object.entries(saved)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
  }
}

// ── 6. the observer: the last resort spent once, a move with no roll, the cards that wait ──

describe('the last resort is told once and spent by the line that names the move (the fourth live run, beat 22: a64, a66, a68)', () => {
  const b21 = CHARTER.beats.find(b => b.id === 'b21');
  /** A beat walked line by line: each line typed, the table read, the pointer moved, the player briefed. */
  const walkLines = (beat, entered = tableOf()) => {
    const pointer = createPointer([{ ...beat, needs: [], requires: undefined }]);
    const marks = [markOf('a61', entered)];
    const messages = [];
    pointer.advance({ marks, messages, actions: [], charter: CHARTER }, 'a61');
    const say = (step, text, cards = [], table = entered) => {
      messages.push(line(step, text));
      pointer.record(step, { action: 'say', text });
      marks.push(markOf(step, table, cards));
      pointer.advance({ marks, messages, actions: [], charter: CHARTER }, step);
      return pointer.brief();
    };
    return { pointer, say };
  };

  it('two plain lines unlock it; the line that names the move spends it, and it is not told again while the beat stands still', () => {
    const { pointer, say } = walkLines(b21);
    say('a62', RUN_4.actions[61].text);
    const told = say('a63', RUN_4.actions[62].text);
    expect(told.note).toContain(`LAST RESORT — ${LAST_RESORT_AFTER} plain lines have brought nothing about: this once you may name the move — ${b21.lastResort}`);
    // The run's a64, named: nothing came of it (there was nothing to heal).
    expect(movesNamedIn(RUN_4.actions[63].text)).toEqual(['Heal']);
    const spent = say('a64', RUN_4.actions[63].text);
    expect(spent.note).not.toContain('LAST RESORT —');
    expect(spent.note).toContain('the last resort was spent on your line at a64: say what you do in plain lines again');
    expect(pointer.state[0]).toMatchObject({ lastResort: true, lastResortSpent: ['a64'] });
    // a65, plain: in the run the last resort was told again here, and a66 named Resupply.
    const after = say('a65', RUN_4.actions[64].text);
    expect(after.note).not.toContain('LAST RESORT —');
    expect(after.note).toContain('the last resort was spent on your line at a64');
  });

  it('once the beat moves, the next roll it needs starts from plain lines again — and the last resort can be told for it', () => {
    const gather = { id: 'bx', n: 4, session: 1, title: 'Gather Information', playerTitle: 'Ask around the docks', tell: 'Work the docks.',
      check: { type: 'moveRolled', moves: ['gather_information'], outcome: 'strong_hit' }, lastResort: 'say that you gather information on the docks' };
    const { say } = walkLines(gather);
    say('a1', 'I ask along the docks who saw the raiders last.');
    expect(say('a2', 'I lean on the water-seller until she tells me what she saw.').note).toContain('LAST RESORT —');
    // Named, and rolled — a weak hit: the beat moves, but is not done.
    const weak = [moveCard('g3', 'Gather Information', 'Action: 4 + 3 = 7 | Challenge: 2, 9', 'weak_hit'), narratedAs('n3', 'g3', 'gather_information', 'weak_hit')];
    const moved = say('a3', 'I gather information on the docks.', weak);
    expect(moved.note).not.toContain('LAST RESORT —');
    expect(moved.note, 'the beat moved: nothing is spent').not.toContain('was spent');
    expect(say('a4', 'I try the harbour office next.').note).not.toContain('LAST RESORT —');
    expect(say('a5', 'I buy the clerk a drink and ask again.').note).toContain('LAST RESORT — 2 plain lines have brought nothing about');
  });
});

describe('a move made with no roll is a move: the stray alert sees it (the fourth live run, a5–a7)', () => {
  const b2 = CHARTER.beats.find(b => b.id === 'b2');

  it('a Develop Your Relationship on the beat that wants a connection made raises the alert, and unlocks the last resort', () => {
    // The run's a5: the move reader read the plea for a tie as Develop, with no action roll.
    expect(said('a5', /interpretMove/)).toMatch(/"moveId":\s*"develop_your_relationship"/);
    const pointer = createPointer([{ ...b2, needs: [] }]);
    const marks = [markOf('a3', tableOf())];
    const messages = [];
    pointer.advance({ marks, messages, actions: [], charter: CHARTER }, 'a3');
    const say = (step, text, cards, table) => { messages.push(line(step, text)); pointer.record(step, { action: 'say', text }); marks.push(markOf(step, table, cards)); pointer.advance({ marks, messages, actions: [], charter: CHARTER }, step); return pointer.brief(); };
    expect(say('a4', RUN_4.actions[3].text, [], recorded({ bond: true })).alert).toBe('');
    const develop = [moveCard('d5', 'Develop Your Relationship', '', null), narratedAs('n5', 'd5', 'develop_your_relationship', null)];
    const told = say('a5', RUN_4.actions[4].text, develop, recorded({ bond: true, ticks: 8 }));
    expect(told.alert).toBe('A MOVE WAS MADE — Develop Your Relationship, with no roll — AND IT IS NOT WHAT THIS BEAT NEEDS. The beat is NOT done, and waiting will not finish it: do what the beat asks again, in other words.');
    expect(told.note).toContain(`LAST RESORT — a move came that is not this beat's: this once you may name the move — ${b2.lastResort}`);
    expect(pointer.state[0].rolled).toEqual([{ step: 'a5', moveId: 'develop_your_relationship', outcome: null, noRoll: true }]);
  });

  it('a no-roll move the beat wants raises nothing — Reach a Milestone on the vow beat', () => {
    const b24 = CHARTER.beats.find(b => b.id === 'b24');
    const pointer = createPointer([{ ...b24, needs: [] }]);
    const marks = [markOf('a72', tableOf({ pc: { vows: [VOW] } }))];
    pointer.advance({ marks, messages: [], actions: [], charter: CHARTER }, 'a72');
    pointer.record('a73', { action: 'say', text: 'x' });
    marks.push(markOf('a73', tableOf({ pc: { vows: [{ ...VOW, ticks: 8 }] } }), [moveCard('rm', 'Reach a Milestone', '', null), narratedAs('nm', 'rm', 'reach_a_milestone', null)]));
    pointer.advance({ marks, messages: [line('a73', RUN_4.actions[72].text)], actions: [], charter: CHARTER }, 'a73');
    expect(pointer.brief().alert).toBe('');
  });
});

describe('a card that waits on the player is said on a line of its own (the fourth live run: Keep skipped at a38, "Which vow advances?" at a71)', () => {
  const b9 = CHARTER.beats.find(b => b.id === 'b9');
  const b24 = CHARTER.beats.find(b => b.id === 'b24');
  const MISS = { open: true, resolvedBy: null, resolution: { moveId: 'enter_the_fray', outcome: 'miss' } };
  const fray = (held) => moveCard('m38', 'Enter the Fray', 'Action: 3 + 1 = 4 | Challenge: 6, 7', 'miss', { held });
  const looms = { id: 't38', threshold: { label: 'The Ashen Wake', position: 'bad_spot' } };
  const brief = (beat, steps) => {
    const pointer = createPointer([{ ...beat, needs: [] }]);
    const marks = [markOf('a37', tableOf())];
    pointer.advance({ marks, messages: [], actions: [], charter: CHARTER }, 'a37');
    for (const [step, cards] of steps) { pointer.record(step, { action: 'click' }); marks.push(markOf(step, tableOf({ pc: { vows: [VOW] } }), cards)); pointer.advance({ marks, messages: [], actions: [], charter: CHARTER }, step); }
    return pointer.brief();
  };

  it('a held result: press "Keep the result" before typing anything else — and the turn prompt says so above the count', () => {
    const told = brief(b9, [['a38', [fray(MISS), looms]]]);
    expect(told.waiting).toBe('the result of Enter the Fray (a miss) is held on its card, and nothing comes of it until you choose: press "Keep the result" on it — or "🔥 Burn Momentum", where this beat tells you to burn. Answer it before you type anything else.');
    const prompt = playerTurnPrompt({ history: [], snapshot: { character: null, windows: [], messages: [] }, beat: told });
    expect(prompt).toContain('\nWAITING ON YOU: the result of Enter the Fray (a miss) is held on its card');
    expect(prompt.indexOf('WAITING ON YOU:')).toBeLessThan(prompt.indexOf('action spent on this beat so far'));
    expect(CHARTER.playerNotes.join('\n')).toContain('If a card offers "Keep the result", press it');
    // Kept: nothing waits.
    expect(brief(b9, [['a38', [fray(MISS), looms]], ['a39', [fray({ ...MISS, open: false, resolvedBy: 'keep' })]]]).waiting).toBe('');
  });

  it('the milestone\'s vow picker, and a connection\'s: press the one the beat is about — and a picker answered waits for nothing', () => {
    const picker = (resolved) => ({ id: 'mp71', milestonePicker: { resolved, choices: [{ vowId: 'v0', actorId: 'pc', marks: 1 }, { vowId: 'v1', actorId: 'pc', marks: 1 }] } });
    const pressed = [moveCard('rm71', 'Reach a Milestone', '', null), picker(false)];
    expect(brief(b24, [['a71', pressed]]).waiting).toBe('"⚑ Reach a Milestone — Which vow advances?" asks which of your vows: press the one this beat is about. Answer it before you type anything else.');
    expect(brief(b24, [['a71', pressed], ['a72', [picker(true)]]]).waiting).toBe('');
    const develop = { id: 'cp', picker: { pickAction: 'develop', resolved: false, choices: [{ hostId: 'A1', name: 'Tamsin Vey' }] } };
    expect(brief(b24, [['a71', [develop]]]).waiting).toBe('a card asks which connection: press the one this beat is about. Answer it before you type anything else.');
  });

  it('a picker from before the beat came is no longer this beat\'s; one posted in the step that brought it is; on a beat that is the table\'s nothing is said', () => {
    const cp = { id: 'cp', picker: { pickAction: 'develop', resolved: false, choices: [] } };
    const walkTwo = (cardsAtA1, cardsAtA2) => {
      const pointer = createPointer([{ id: 'p1', n: 1, session: 1, title: 'x', check: { type: 'oracleAsked' } }, { ...b24, n: 2, needs: [] }]);
      const marks = [markOf('a1', tableOf(), cardsAtA1), markOf('a2', tableOf(), [...cardsAtA2, { id: 'o2', oracle: { answer: 'yes' } }]), markOf('a3', tableOf())];
      pointer.advance({ marks: marks.slice(0, 1), messages: [], actions: [], charter: CHARTER }, 'a1');
      pointer.advance({ marks: marks.slice(0, 2), messages: [], actions: [], charter: CHARTER }, 'a2');
      pointer.advance({ marks, messages: [], actions: [], charter: CHARTER }, 'a3');
      expect(pointer.current().beat.id).toBe('b24');
      return pointer.brief().waiting;
    };
    expect(walkTwo([cp], []), 'posted before the beat before it was done').toBe('');
    expect(walkTwo([], [cp]), 'posted in the step that brought the beat').toContain('which connection');
    const reload = CHARTER.beats.find(b => b.id === 'b12');
    expect(brief(reload, [['a38', [fray(MISS)]]]).waiting).toBe('');
  });

  it('the table read keeps the milestone picker the module posts — whether it was answered, and its choices', async () => {
    const MODULE = 'starforged-companion';
    const game = { messages: { contents: [
      { id: 'mp', timestamp: 1, content: '<div class="sf-ptp-card"><strong>⚑ Reach a Milestone</strong><p>Which vow advances?</p></div>', flags: { [MODULE]: { milestonePicker: true, resolved: false, choices: [{ vowId: 'v1', actorId: 'pc', marks: 1 }] } } },
      { id: 'cp', timestamp: 2, content: '<div></div>', flags: { [MODULE]: { connectionPicker: true, pickAction: 'develop', resolved: true, choices: [] } } },
    ] } };
    const cards = await withPage({ game }, () => readCards({ page: { evaluate: async (fn, arg) => fn(arg) } }));
    expect(cards[0]).toMatchObject({ id: 'mp', milestonePicker: { resolved: false, choices: [{ vowId: 'v1', actorId: 'pc', marks: 1 }] } });
    expect(cards[1]).toMatchObject({ id: 'cp', picker: { pickAction: 'develop', resolved: true } });
    expect(cards[1].milestonePicker).toBeUndefined();
  });
});

// ── 2. the recovery beat, aimed at what the sheet holds spent ────────────────

/** One beat, checked against the marks so far: the pointer's state for it. */
const checked = (beat, marks, { charter = CHARTER, messages = [] } = {}) => {
  const pointer = createPointer([{ id: 'b', n: 1, session: 1, title: beat.check.type, ...beat }]);
  pointer.advance({ marks: marks.slice(0, 1), messages: [], actions: [], charter }, marks[0].step);
  pointer.advance({ marks, messages, actions: [], charter }, marks.at(-1).step);
  return pointer.state[0];
};
const SHIP = (over = {}) => ({ token: null, tokenAt: null, name: 'Kobayashi IV', integrity: 5, integrityMax: 5, battered: false, ...over });

describe('the recovery beat is aimed at what the sheet holds spent (the fourth live run, beat 22: a62–a69)', () => {
  const b21 = CHARTER.beats.find(b => b.id === 'b21');
  // The sheet the readers were shown at a62, from the run's own request.
  const shown = RUN_4.recording.exchanges.find(x => x.step === 'a62' && /classifyInput/.test(x.kind)).user;

  it('the run came to it with spirit and the hull spent, health and supply full — and its lines tended wounds the sheet did not hold', () => {
    expect(shown).toContain('- Meters: Health 5 of 5 (full, not wounded); Spirit 1 of 5 (not shaken); Supply 5 of 5 (full, not unprepared).');
    expect(shown).toContain('- Command vehicle: "Kobayashi IV", integrity 4 of 5 (not battered).');
    expect(RUN_4.actions[61].text).toContain('cleaning the cuts and binding up the worst of them');
    expect(RUN_4.charter.beats.find(b => b.id === 'b21').tell).toContain('say you treat your wounds with the ship\'s medkit, or that you restock the ship');
  });

  it('what of the sheet is spent: each meter below its maximum or its impact marked, and the ship\'s integrity', () => {
    const run4 = tableOf({ pc: { spirit: 1 }, ship: SHIP({ integrity: 4 }) });
    expect(sheetSpent(run4)).toEqual({ spent: ['spirit', 'integrity'], text: 'Mira Kestrel\'s health 5 of 5, spirit 1 of 5, supply 5 of 5; the Kobayashi IV\'s integrity 4 of 5 — spent: spirit, the ship\'s integrity' });
    expect(sheetSpent(tableOf({ ship: SHIP() })).text).toBe('Mira Kestrel\'s health 5 of 5, spirit 5 of 5, supply 5 of 5; the Kobayashi IV\'s integrity 5 of 5 — nothing on the sheet is spent');
    expect(sheetSpent(tableOf({ pc: { debilities: ['wounded'] } })), 'an impact marked at a full meter').toMatchObject({ spent: ['health'] });
    expect(sheetSpent(tableOf({ ship: SHIP({ battered: true }) })).spent, 'a battered hull at full integrity').toEqual(['integrity']);
    expect(sheetSpent(tableOf()).text, 'no ship recorded: the meters alone').toBe('Mira Kestrel\'s health 5 of 5, spirit 5 of 5, supply 5 of 5 — nothing on the sheet is spent');
    expect(sheetSpent(null)).toEqual({ text: '', spent: [] });
  });

  it('until a recover move comes, the observer says what is spent — and a Repair counts, by the beat\'s wants', () => {
    const run4 = tableOf({ pc: { spirit: 1 }, ship: SHIP({ integrity: 4 }) });
    const setup = markOf('a61', run4);
    expect(checked(b21, [setup, markOf('a62', run4)]).detail).toBe('no recover move yet — Mira Kestrel\'s health 5 of 5, spirit 1 of 5, supply 5 of 5; the Kobayashi IV\'s integrity 4 of 5 — spent: spirit, the ship\'s integrity');
    const repair = [moveCard('r1', 'Repair', 'Action: 5 + 3 = 8 | Challenge: 2, 6', 'strong_hit'), narratedAs('n1', 'r1', 'repair', 'strong_hit')];
    expect(checked(b21, [setup, markOf('a63', run4, repair)])).toMatchObject({ status: 'done', detail: 'repair came up strong_hit at a63' });
    // The check is the kept runs' own; Repair is the beat's, not the check's.
    expect(b21.check).toEqual({ type: 'recovered', moves: ['heal', 'resupply', 'sojourn', 'hearten'] });
    expect(checked({ ...b21, wants: undefined }, [setup, markOf('a63', run4, repair)]), 'a beat that does not want it').toMatchObject({ status: 'current' });
    expect(RECOVER_MOVES).toEqual(['sojourn', 'heal', 'hearten', 'resupply', 'repair']);
  });

  it('the charter: every recover move wanted; the tell aims at what is spent and invents nothing; the last resort names each', () => {
    expect([...b21.wants].sort()).toEqual([...RECOVER_MOVES].sort());
    expect(b21.tell).toContain('The observer\'s note below names what of your sheet is spent');
    expect(b21.tell).toContain('Never tend a wound you do not have, or restock what is full');
    expect(b21.tell).toContain('type !repair and spend its points');
    expect(b21.tell).not.toMatch(/say you treat your wounds/);
    expect(movesNamedIn(b21.lastResort)).toEqual(['Heal', 'Hearten', 'Resupply', 'Repair']);
    expect(CHARTER.playerNotes.join('\n')).toContain('never tend a wound she does not have');
  });

  it('the table read keeps the command vehicle\'s integrity, as the readers\' SITUATION block reads it', async () => {
    const MODULE = 'starforged-companion';
    const ship = { id: 'S1', type: 'starship', name: 'Kobayashi IV', flags: { [MODULE]: { entityType: 'ship', ship: { name: 'Kobayashi IV', isCommandVehicle: true, integrity: 4, integrityMax: 5, battered: false } } }, items: { contents: [] }, system: {} };
    const pc = { id: 'pc', type: 'character', name: 'Mira Kestrel', flags: {}, items: { contents: [] }, system: { health: { value: 5 }, spirit: { value: 1 }, supply: { value: 5 }, momentum: { value: 2 }, debility: {} } };
    const actors = [pc, ship];
    const game = {
      settings: { get: (_m, key) => (key === 'campaignState' ? { shipIds: ['S1'], connectionIds: [] } : undefined) },
      actors: { contents: actors, get: (id) => actors.find(a => a.id === id) },
      journal: { contents: [] }, scenes: { contents: [] },
    };
    const table = await withPage({ game }, () => readTable({ page: { evaluate: async (fn, arg) => fn(arg) } }));
    expect(table.ship).toEqual({ token: null, tokenAt: null, name: 'Kobayashi IV', integrity: 4, integrityMax: 5, battered: false });
    expect(sheetSpent(table).spent).toEqual(['spirit', 'integrity']);
  });
});

// ── 3. the vow's proof, only once the story has shown it ─────────────────────

describe('the vow beat states a proof only once the story has shown it (the fourth live run, beat 25: a70–a75)', () => {
  const b24 = CHARTER.beats.find(b => b.id === 'b24');

  it('the run\'s player claimed a proof nothing had found, as its beat asked — and the narration refuted it', () => {
    expect(RUN_4.charter.beats.find(b => b.id === 'b24').tell).toContain('Play a line that says what you have now proved about the raids');
    expect(RUN_4.actions[69].text).toContain('I\'ve traced her orders back to the broker who sold the lane schedules. That\'s the proof I came for.');
    expect(said('a70', /narrate/)).toContain('"Tamsin Vey sold nothing," she says.');
  });

  it('its tell: find it out first; say as proof only what the story has told; never a proof refuted — the check is the kept runs\' own', () => {
    expect(b24.tell).toMatch(/^Bring your vow to its end — on what the story has shown you, and on nothing more\. First find it out/);
    expect(b24.tell).toContain('Only once the narrator\'s answer has shown you something, say in a line of play what that proves');
    expect(b24.tell).toContain('Never claim a proof the story has not given you, nor one someone in the scene has just denied');
    expect(b24.tell).toContain('If a card asks which vow, choose the one about the raids');
    expect(b24.tell).not.toContain('what you have now proved');
    expect(b24.check).toEqual({ type: 'vowFulfilled' });
    // The search is the beat's own: a roll of it is no stray.
    expect(b24.wants).toEqual(['reach_a_milestone', 'fulfill_your_vow', 'gather_information']);
    // The rehearsal searches before it claims.
    expect(CHARTER.rehearsal.filter(e => e.beat === 25 && e.move).map(e => e.move.id)).toEqual(['gather_information', 'reach_a_milestone', 'fulfill_your_vow']);
  });
});

// ── 4. the fight, fought where the ship lies ─────────────────────────────────

describe('the fight is fought where the ship lies — in her berth at Bleakhold\'s ring (the fourth live run, a34–a38)', () => {
  const [b8, b9, b10, b11] = ['b8', 'b9', 'b10', 'b11'].map(id => CHARTER.beats.find(b => b.id === id));
  const AWAY = /off Bleakhold|drops? out of the dark|jumps you|my bow|come about/;

  it('the run docked her at a34, and the charter\'s next line had the cutter jump her off the station', () => {
    expect(said('a34', /narrate/)).toContain('the station takes hold of her with a hard clunk');
    expect(RUN_4.charter.beats.find(b => b.id === 'b9').tell).toContain('jumps you off Bleakhold');
    expect(RUN_4.actions[37].text).toContain('The Ashen Wake drops out of the dark off Bleakhold\'s ring.');
    expect(b8.check).toEqual({ type: 'arrived', settlement: 'Bleakhold Station' });
  });

  it('now the cutter comes to the ring and the ship stays in her berth through the fight — in its tells and in the rehearsal\'s lines', () => {
    expect(b9.tell).toContain('comes in along Bleakhold\'s docking ring while the Kobayashi IV lies in her berth there');
    expect(b9.tell).toContain('your ship stays in her berth through it');
    expect(b10.tell).toContain('from the Kobayashi IV\'s berth on the ring');
    expect(b11.tell).toContain('still from the berth');
    for (const b of [b9, b10, b11]) expect(b.tell, b.id).not.toMatch(AWAY);
    const lines = CHARTER.rehearsal.filter(e => [10, 11, 12, 16].includes(e.beat) && e.action === 'say' && !e.text.startsWith('!')).map(e => e.text);
    expect(lines).toHaveLength(4);
    for (const text of lines) expect(text).not.toMatch(AWAY);
    // What the round before held of the fight's tell still holds.
    expect(b9.tell).toContain('choose your vow about the raids');
    expect(b9.tell).toContain('!truth set "raider cutter" is named the Ashen Wake');
  });
});
