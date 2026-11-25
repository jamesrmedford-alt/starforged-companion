/**
 * STARFORGED COMPANION
 * tests/unit/exploreRoundThree.test.js
 *
 * What the long haul's third live run (2026-11-24,
 * explorations/long-haul-live-20261124-0321/) found wrong with the runner
 * itself — known-issues EXPLORE-ROUND-3-RUNNER — each mended and held here by
 * the run's own steps, read from its kept recording:
 *
 *   1. a cast member's draft card is confirmed under a part of the name, and
 *      everything that then looks for that card finds it (a5: "Tamsin");
 *   2. a player that has rolled is told plainly when the roll was not the
 *      beat's, and that waiting will not finish it (a5–a11, a30–a37);
 *   3. a fact that was never planted is not scored (F7 at a57 and a72);
 *   4. a narration the X-Card took back leaves the player's screen (a42);
 *   5. the character comes with a background vow, and beat 2 seeks a tie, not
 *      a bargain;
 *   6. a line of play's wait is counted apart from a scene question's.
 *
 * And what the round added: the review's count of what a session's
 * narrations keep returning to (lib/review.mjs refrainsOf), and the
 * expedition beat (charters/long-haul.json `b7a`, lib/beats.mjs
 * BEAT_CHECKS.expedition).
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { castMemberFor, castMembers, isWholeWordPart, optionFor } from '../../test/ci/playwright/lib/cast.mjs';
import { draftToConfirm } from '../../test/ci/playwright/lib/gm.mjs';
import { BEAT_CHECKS, WAITS_BEFORE_TOLD, castCardId, createPointer, wantsOf } from '../../test/ci/playwright/lib/beats.mjs';
import { playerSystemPrompt, playerTurnPrompt, screenOf, validateAction } from '../../test/ci/playwright/lib/player.mjs';
import { scoreLedger } from '../../test/ci/playwright/lib/ledger.mjs';
import { scoreLongRun } from '../../test/ci/playwright/lib/longrun.mjs';
import { REFRAIN_SHARE, refrainsOf, scorecard, speedOf } from '../../test/ci/playwright/lib/review.mjs';
import { seedVows } from '../../test/ci/playwright/lib/world.mjs';
import { createRehearsal } from '../../test/ci/playwright/lib/rehearsal.mjs';
import { movesNamedIn } from '../../test/ci/playwright/lib/moveNames.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const CHARTER = { name: 'long-haul', ...JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8')) };
const RUN_3_FOLDER = path.join(PLAYWRIGHT, 'explorations/long-haul-live-20261124-0321');
const RUN_2_FOLDER = path.join(PLAYWRIGHT, 'explorations/long-haul-live-20261123-1459');
const RUN_3 = JSON.parse(fs.readFileSync(path.join(RUN_3_FOLDER, 'replay.json'), 'utf8'));
/** What the third run's module was answered at a step, by call kind. */
const said = (step, kind) => RUN_3.recording.exchanges.filter(x => x.step === step && kind.test(x.kind)).map(x => x.response.content.map(c => c.text ?? '').join('')).join('\n');
/** What a beat has the player type or press: the words it puts in quotes. */
const quoted = (text) => [...String(text ?? '').matchAll(/"([^"]+)"/g)].map(m => m[1]);
/** A narration's prose, without the sidecar the narrator is made to append. */
const prose = (text) => text.split('\n```json')[0].trim();

// The table as the observer records it (lib/table.mjs), in small.
const PC = { id: 'pc', name: 'Mira Kestrel', health: 5, spirit: 5, supply: 5, momentum: 2, momentumMax: 10, momentumReset: 2, vows: [], bonds: [], legacies: {} };
const tableOf = (over = {}) => ({
  session: { active: true, id: 's1', pendingMove: false, xCardActive: false, questFocus: '' }, location: { id: 'L1', name: 'Hollow Spire' },
  ship: { token: { x: 1, y: 1 }, tokenAt: 'Hollow Spire' }, pcs: [{ ...PC, ...(over.pc ?? {}) }], connections: [], entityCards: [], tracks: [],
  legacy: {}, scene: { truths: [] }, helpers: {}, plans: [], ...over, pc: undefined,
});
const markOf = (step, table, cards = []) => ({ step, phase: 'session-1', table, cards });
const moveCard = (id, name, diceLine, shown, extra = {}) => ({ id, move: { resolutionId: id, actorId: 'pc', name, diceLine, shown, burn: null, held: null, ...extra } });
const narratedAs = (id, resolutionId, moveId, outcome) => ({ id, narration: { resolutionId, moveId, outcome, narrationId: `n-${id}` } });
const line = (step, text, phase = 'session-1') => ({ id: `l-${step}`, step, phase, text, fromPlayer: true, card: [] });
/** One beat, checked against the marks so far: the pointer's state for it. */
const checked = (beat, marks, { charter = CHARTER, messages = [] } = {}) => {
  const pointer = createPointer([{ id: 'b', n: 1, session: 1, title: beat.check.type, ...beat }]);
  pointer.advance({ marks: marks.slice(0, 1), messages: [], actions: [], charter }, marks[0].step);
  pointer.advance({ marks, messages, actions: [], charter }, marks.at(-1).step);
  return pointer.state[0];
};

// ── 1. a cast member's card, under a part of the name ────────────────────────

describe('a cast member\'s draft card is confirmed under a part of the name (the third live run, a5)', () => {
  const members = castMembers(CHARTER.cast);
  // The run's own step: the player had named "Tamsin Vey" in full, the
  // narrator wrote "Tamsin", and the module's detector proposed that.
  const proposed = JSON.parse(said('a5', /Detection/)).entities.find(e => e.type === 'connection');
  const draft = { messageId: 'PwOaYRXn72eLRMgh', index: 0, name: proposed.name, type: proposed.type };

  it('the run\'s draft was "Tamsin", for the Tamsin Vey the player had named', () => {
    expect(proposed.name).toBe('Tamsin');
    expect(JSON.parse(said('a5', /interpretMove/)).moveTarget).toBe('Tamsin Vey');
  });

  it('a name is a whole-word part of another: its words side by side in it, and not the whole of it', () => {
    expect([isWholeWordPart('Tamsin', 'Tamsin Vey'), isWholeWordPart('Vey', 'Tamsin Vey'), isWholeWordPart('tamsin', 'TAMSIN VEY')]).toEqual([true, true, true]);
    expect([isWholeWordPart('Tam', 'Tamsin Vey'), isWholeWordPart('Tamsin V', 'Tamsin Vey'), isWholeWordPart('Tamsin Vey', 'Tamsin Vey'), isWholeWordPart('', 'Tamsin Vey')]).toEqual([false, false, false, false]);
    expect(isWholeWordPart('Vey Tamsin', 'Tamsin Vey'), 'in order').toBe(false);
  });

  it('the cast is one person under two names: the name she is made under, and the one the table gives her later', () => {
    expect(members.map(m => m.names)).toEqual([['Tamsin Vey', 'Tamsin Okoro']]);
    expect(castMemberFor('Tamsin', members)?.name).toBe('Tamsin Vey');
    expect(castMemberFor('Tamsin Okoro', members)?.name, 'her later name is hers').toBe('Tamsin Vey');
    expect(castMemberFor('Okoro', members)?.name).toBe('Tamsin Vey');
    expect(castMemberFor('Tam', members)).toBeNull();
    expect(castMemberFor('Juro', members)).toBeNull();
  });

  it('the GM\'s rule confirms it — once, for a person, and never for a part that could be two people\'s', () => {
    expect(draftToConfirm([draft], members)).toMatchObject({ draft: { name: 'Tamsin' }, member: { name: 'Tamsin Vey' }, exact: false });
    expect(draftToConfirm([{ ...draft, name: 'Tamsin Vey' }], members)).toMatchObject({ exact: true });
    // The other drafts the run raised are nobody's, and are left.
    expect(draftToConfirm([{ messageId: 'x', index: 0, name: 'Dark Lane', type: 'location' }, { messageId: 'y', index: 0, name: 'Wake', type: 'ship' }], members)).toBeNull();
    // A cast member who has a card gets no second one — under either name, or a part of one.
    for (const card of ['Tamsin', 'Tamsin Vey', 'Tamsin Okoro']) expect(draftToConfirm([draft], members, [card]), card).toBeNull();
    expect(draftToConfirm([draft], members, ['Kobayashi IV', 'Hollow Spire'])).not.toBeNull();
    // A part of her name on a draft that is no person is not her.
    expect(draftToConfirm([{ ...draft, type: 'location' }], members)).toBeNull();
    expect(draftToConfirm([{ ...draft, name: 'Tamsin Vey', type: 'location' }], members), 'the exact name was always confirmed, whatever the draft').not.toBeNull();
    // Two people who share a word: the word alone is neither's.
    const two = castMembers({ a: { name: 'Tamsin Vey' }, b: { name: 'Tamsin Reyes' } });
    expect(draftToConfirm([draft], two)).toBeNull();
    expect(draftToConfirm([{ ...draft, name: 'Reyes' }], two)).toMatchObject({ member: { name: 'Tamsin Reyes' } });
  });

  // A replay carries its run's charter, cast and all. The third run's cast
  // lists her two names as two entries and does not say they are one person:
  // "Tamsin" is then part of two members' names, so its replay leaves the
  // draft as the run's GM left it — and reproduces the run.
  // The detector is given the player's line now (its PLAYER'S LINE block,
  // issue #380), and the line holds the name in full. The long haul's
  // rehearsal on that module proposed "Tamsin Vey" and walked the exact-name
  // road; a script entry's `detects` is what the stand-in detector reports
  // for the member it names, so the rehearsal still walks the road the third
  // live run walked.
  it('the rehearsal\'s detector reports a cast member as the script has it, though the player\'s line names her in full', () => {
    const entry = CHARTER.rehearsal.find(e => e.beat === 2 && e.detects && !e.move);
    expect(entry.detects).toEqual(['Tamsin']);
    const detection = (user) => ({ system: '', messages: [{ role: 'user', content: `You are analysing an Ironsworn: Starforged narration.\n${user}` }] });
    const turn = { system: 'You are playtesting', tools: [{ name: 'take_action' }], messages: [{ role: 'user', content: 'CURRENT BEAT: 2 of 27 [session 1] — Meet someone\n\nYOUR SCREEN NOW:\n[m1] Gamemaster: hello' }] };
    const asked = `PLAYER'S LINE:\n${entry.text}\n\nNarration:\nThe salvage broker looks up from her ledger. Tamsin is there, watching how you take it.`;
    const r = createRehearsal({ charter: { ...CHARTER, rehearsal: [entry] } });
    r.reply(turn);
    expect(JSON.parse(r.reply(detection(asked)).content[0].text).entities.map(e => e.name)).toEqual(['Tamsin']);
    // A line the script gives no `detects` is read as the table has it: the full name, where it stands.
    const plain = createRehearsal({ charter: { ...CHARTER, rehearsal: [{ ...entry, detects: undefined }] } });
    plain.reply(turn);
    expect(JSON.parse(plain.reply(detection(asked)).content[0].text).entities.map(e => e.name)).toEqual(['Tamsin Vey']);
  });

  it('a run kept from before the rule replays as it was played: its own cast leaves the draft', () => {
    expect(RUN_3.charter.cast.renamed.was).toBeUndefined();
    const then = castMembers(RUN_3.charter.cast);
    expect(then.map(m => m.name)).toEqual(['Tamsin Vey', 'Tamsin Okoro']);
    expect(draftToConfirm([draft], then)).toBeNull();
    expect(draftToConfirm([{ ...draft, name: 'Tamsin Vey' }], then), 'the first two runs\' draft, under her exact name').toMatchObject({ exact: true });
    expect(RUN_3.expected.beats).toMatchObject({ b2: 'not-exercised', b3: 'not-exercised', b18: 'not-exercised', b22: 'not-exercised', b23: 'not-exercised' });
  });

  describe('and everything that looks for her card finds it', () => {
    const card = { hostId: 'A1', recordId: 'r1', name: 'Tamsin', rank: 'dangerous', bonded: false, active: true, ticks: 0 };
    const bond = { id: 'i1', name: 'Tamsin', rank: 'dangerous', ticks: 0, completed: false, connectionId: 'r1' };
    const vow = { id: 'v1', vowId: 'v1', name: 'Find who is raiding the Cinder Expanse lanes', rank: 'dangerous', ticks: 0, completed: false, linkedConnectionId: null, linkedConnectionName: null };
    const setup = markOf('a4', tableOf());
    const made = (extra = {}) => tableOf({ connections: [{ ...card, ...extra }], entityCards: [{ id: 'A1', name: extra.name ?? 'Tamsin', entityType: 'connection' }], pc: { bonds: [{ ...bond, name: extra.name ?? 'Tamsin', ticks: extra.ticks ?? 0, completed: extra.bonded === true }] } });
    const rolled = moveCard('r0', 'Make a Connection', 'Action: 6 + 2 = 8 | Challenge: 1, 2', 'strong_hit');

    it('beat 2: the connection is made — one card, whatever part of her name it carries', () => {
      const state = checked({ check: { type: 'connectionMade', name: 'Tamsin Vey', move: 'make_a_connection' } }, [setup, markOf('a5', made(), [rolled])]);
      expect(state).toMatchObject({ status: 'done' });
      expect(state.detail).toContain('Tamsin Vey — the card was made as "Tamsin" — is a dangerous connection held by Mira Kestrel');
      // With no cast to say whose it is, a card called "Tamsin" is not Tamsin Vey's.
      expect(checked({ check: { type: 'connectionMade', name: 'Tamsin Vey' } }, [setup, markOf('a5', made())], { charter: {} })).toMatchObject({ status: 'current', detail: 'Tamsin Vey has no connection card yet' });
      // One person, two cards: under the part, and under the whole.
      const twice = tableOf({ connections: [card], entityCards: [{ id: 'A1', name: 'Tamsin', entityType: 'connection' }, { id: 'A2', name: 'Tamsin Vey', entityType: 'connection' }], pc: { bonds: [bond] } });
      expect(checked({ check: { type: 'connectionMade', name: 'Tamsin Vey' } }, [setup, markOf('a5', twice)])).toMatchObject({ status: 'failed', detail: '2 cards are Tamsin Vey\'s: "Tamsin", "Tamsin Vey"' });
    });

    it('beat 3: the vow\'s Link offers "Tamsin", and the player who asks for Tamsin Vey gets it', () => {
      const screen = { character: null, windows: [], messages: [{ ref: 'e1', id: 'idV', speaker: 'Gamemaster', text: 'New vow recorded', buttons: [{ n: 1, label: 'Link', disabled: false }],
        selects: [{ n: 1, label: 'For a connection?', value: '— none —', options: ['— none —', 'Tamsin'] }] }] };
      expect(validateAction({ action: 'choose', message: 'e1', button: 1, option: 'Tamsin Vey' }, screen)).toMatchObject({ ok: true, action: { action: 'choose', select: 1, option: 'Tamsin' } });
      expect(optionFor('Tamsin Vey', ['— none —', 'Tamsin'])).toBe('Tamsin');
      expect(optionFor('Tamsin', ['— none —', 'Tamsin Okoro']), 'the other way round, after a rename').toBe('Tamsin Okoro');
      expect(optionFor('Tamsin Vey', ['Tamsin Vey', 'Tamsin']), 'as written, where it is offered as written').toBe('Tamsin Vey');
      expect(optionFor('Tamsin Vey', ['Tamsin', 'Vey']), 'two it could be: neither').toBeNull();
      expect(validateAction({ action: 'choose', message: 'e1', button: 1, option: 'Vance Oduya' }, screen)).toMatchObject({ ok: false, problem: expect.stringContaining('has no option "Vance Oduya"') });
      // The rehearsal's scripted player picks it the same way.
      const r = createRehearsal({ charter: { ...CHARTER, rehearsal: [{ beat: 3, action: 'choose', option: 'Tamsin Vey' }] } });
      const turn = { system: 'You are playtesting', tools: [{ name: 'take_action' }], messages: [{ role: 'user', content: 'CURRENT BEAT: 3 of 27 [session 1] — Link\n\nYOUR SCREEN NOW:\n[e1] Gamemaster: New vow recorded\n     buttons: (1) "Link"\n     dropdown (1) "For a connection?" = "— none —" options: — none — | Tamsin' }] };
      expect(r.reply(turn).content[0].input).toMatchObject({ action: 'choose', message: 'e1', button: 1, option: 'Tamsin' });
      // …and the vow, linked to that card by its id, is the beat.
      const linked = tableOf({ connections: [card], pc: { vows: [{ ...vow, linkedConnectionId: 'A1', linkedConnectionName: 'Tamsin' }] } });
      expect(checked({ check: { type: 'vowLinked', name: 'Tamsin Vey' } }, [setup, markOf('a5', made()), markOf('a7', linked)])).toMatchObject({ status: 'done', detail: expect.stringContaining('is linked to Tamsin\'s card') });
    });

    it('beat 18: the card the GM renames is the one she was made as, and the check follows it by its id', () => {
      const marks = [setup, markOf('a5', made())];
      expect(castCardId(marks, CHARTER.cast, 'Tamsin Vey')).toBe('A1');
      expect(castCardId(marks, CHARTER.cast, 'Tamsin Okoro'), 'by either of her names').toBe('A1');
      expect(castCardId(marks, CHARTER.cast, 'Juro')).toBeNull();
      expect(castCardId([setup], CHARTER.cast, 'Tamsin Vey'), 'no card yet').toBeNull();
      const interruption = (after) => {
        const pointer = createPointer([{ id: 'b18', n: 19, session: 2, title: 'rename', interruption: 'rename', check: { type: 'renamed', from: 'Tamsin Vey', to: 'Tamsin Okoro' } }]);
        pointer.advance({ marks, messages: [], actions: [], charter: CHARTER }, 'a5');
        pointer.interrupted();
        pointer.advance({ marks: [...marks, after], messages: [], actions: [], charter: CHARTER }, 'x19');
        return pointer.state[0];
      };
      expect(interruption(markOf('x19', made({ name: 'Tamsin Okoro' })))).toMatchObject({ status: 'done', detail: expect.stringContaining('Tamsin Vey is now Tamsin Okoro') });
      // The rename that found no card — it looked for "Tamsin Vey" — is not the beat.
      expect(interruption(markOf('x19', made()))).toMatchObject({ status: 'failed', detail: 'no connection is named Tamsin Okoro' });
      // Another card given the new name is not hers renamed.
      const other = tableOf({ connections: [card, { ...card, hostId: 'A9', recordId: 'r9', name: 'Tamsin Okoro' }], entityCards: [{ id: 'A1', name: 'Tamsin', entityType: 'connection' }, { id: 'A9', name: 'Tamsin Okoro', entityType: 'connection' }] });
      expect(interruption(markOf('x19', other)).detail).toContain('is another card');
    });

    it('beats 22 and 23: the relationship grown and the bond forged are that card\'s, renamed since', () => {
      const marks = [setup, markOf('a5', made()), markOf('x19', made({ name: 'Tamsin Okoro' }))];
      expect(checked({ check: { type: 'bondForged' } }, [...marks, markOf('a60', made({ name: 'Tamsin Okoro', ticks: 32 }))]).detail).toBe('the relationship with Tamsin Okoro stands at 32 of 40 ticks');
      expect(checked({ check: { type: 'bondForged' } }, [...marks, markOf('a61', made({ name: 'Tamsin Okoro', ticks: 40, bonded: true }))])).toMatchObject({ status: 'done' });
    });

    it('the ledger\'s fact about her new name is planted where that rename was done', () => {
      const beats = [{ id: 'b18', n: 19, status: 'done', doneAt: 'x19', steps: ['x19'] }];
      const marks = [{ step: 'x19', phase: 'session-2', stores: {}, helpers: {}, table: made({ name: 'Tamsin Okoro' }) }];
      const long = scoreLongRun({ charter: { ...CHARTER, beats: CHARTER.beats.filter(b => b.id === 'b18') }, beats, marks, messages: [], actions: [], requests: [] });
      expect(long.ledger.facts.find(f => f.id === 'F7')).toMatchObject({ plantedAt: 'x19', verdict: 'not-probed' });
    });
  });
});

// ── 2. a roll is not the end of a beat ───────────────────────────────────────

describe('a player that has rolled is told when the roll was not the beat\'s (the third live run, a5–a11 and a30–a37)', () => {
  const b2 = CHARTER.beats.find(b => b.id === 'b2');
  const b10 = CHARTER.beats.find(b => b.id === 'b10');
  // The run's own a5: the line was read as Compel, and came up a strong hit.
  const read = JSON.parse(said('a5', /interpretMove/));
  const compel = [moveCard('VcyAFwwR91BbhFGP', 'Compel', 'Action: 6 + 2 = 8 | Challenge: 2, 7', 'strong_hit'), narratedAs('n5', 'VcyAFwwR91BbhFGP', read.moveId, 'strong_hit')];
  const walk = (beat, entered = tableOf()) => {
    const pointer = createPointer([{ ...beat, needs: [] }]);
    const marks = [markOf('a3', entered)];
    const messages = [];
    pointer.advance({ marks, messages, actions: [], charter: CHARTER }, 'a3');
    const act = (step, action, cards = [], table = tableOf()) => {
      if (action.action === 'say') messages.push(line(step, action.text));
      pointer.record(step, action);
      marks.push(markOf(step, table, cards));
      pointer.advance({ marks, messages, actions: [], charter: CHARTER }, step);
      return pointer.brief();
    };
    return { pointer, act };
  };

  it('the run read the line as Compel — a bargain — where the beat wanted a connection made', () => {
    expect(read.moveId).toBe('compel');
    expect(wantsOf(b2)).toEqual(['make_a_connection']);
  });

  it('says so plainly: what was rolled, that it is not what the beat needs, that the beat is NOT done and waiting will not finish it', () => {
    const { pointer, act } = walk(b2);
    expect(act('a4', { action: 'say', text: 'I dock at Hollow Spire and walk the docks to the ledger stall of Tamsin Vey, the salvage broker, and greet her by her full name.' }).alert).toBe('');
    const told = act('a5', { action: 'say', text: 'Tamsin, I\'ll give you a fair cut of my salvage leads and first pick of whatever I haul. Let me deal with you from here on.' }, compel);
    expect(told.alert).toBe('A ROLL WAS MADE — Compel, a strong hit — AND IT IS NOT WHAT THIS BEAT NEEDS. The beat is NOT done, and waiting will not finish it: do what the beat asks again, in other words.');
    expect(told.note).toContain('the observer sees: Tamsin Vey has no connection card yet');
    // The last resort is unlocked by the roll: two lines typed, where the beat asks three before it.
    expect(b2.lastResortAfter).toBe(3);
    expect(told.note).toContain('LAST RESORT — a roll came that is not this beat\'s: this once you may name the move — say that you set out to make a connection with Tamsin Vey');
    expect(pointer.state[0].lastResort).toBe(true);
    // …and it stands on a line of its own in what the player is sent, above the count.
    const prompt = playerTurnPrompt({ history: [], snapshot: { character: null, windows: [], messages: [] }, beat: told });
    expect(prompt).toContain('\nTHE OBSERVER: A ROLL WAS MADE — Compel, a strong hit — AND IT IS NOT WHAT THIS BEAT NEEDS.');
    expect(prompt.indexOf('THE OBSERVER:')).toBeLessThan(prompt.indexOf('(2 actions spent on this beat so far'));
    // The standing instructions say what such a line means.
    expect(playerSystemPrompt(CHARTER)).toContain('A roll is not the end of a beat');
    expect(CHARTER.playerNotes.join('\n')).toContain('When it says the beat is NOT done, do not wait');
  });

  it('a roll the beat wants raises nothing; a stray one is said only until the beat moves again', () => {
    const right = [moveCard('r1', 'Make a Connection', 'Action: 1 + 2 = 3 | Challenge: 10, 9', 'miss'), narratedAs('n1', 'r1', 'make_a_connection', 'miss')];
    const a = walk(b2);
    a.act('a4', { action: 'say', text: 'I greet Tamsin Vey.' });
    expect(a.act('a5', { action: 'say', text: 'I ask her to be someone I can come back to.' }, right)).toMatchObject({ alert: '' });
    // Beat 24's road in the run: a step toward the vow read as Gather
    // Information (a61–a62), then the milestone marked from its card (a63) —
    // walked on the beat as the run had it. Since the fourth live run the beat
    // has the player find the proof out first, and wants the search (issue
    // #383 #3): the same roll on it now raises nothing.
    const b24 = { ...CHARTER.beats.find(b => b.id === 'b24'), wants: ['reach_a_milestone', 'fulfill_your_vow'] };
    const vow = { id: 'v1', vowId: 'v1', name: 'Find who is raiding the Cinder Expanse lanes', rank: 'dangerous', ticks: 8, completed: false };
    const b = walk(b24, tableOf({ pc: { vows: [vow] } }));
    const gathered = [moveCard('g1', 'Gather Information', 'Action: 4 + 3 = 7 | Challenge: 2, 9', 'weak_hit'), narratedAs('ng', 'g1', 'gather_information', 'weak_hit')];
    expect(b.act('a62', { action: 'click', label: 'Roll Gather Information' }, gathered, tableOf({ pc: { vows: [vow] } })).alert).toContain('Gather Information, a weak hit');
    expect(b.act('a63', { action: 'click', label: '⚑ Mark Progress on Vow' }, [], tableOf({ pc: { vows: [{ ...vow, ticks: 16 }] } })).alert, 'the vow moved: the stray roll is behind it').toBe('');
    const now = walk(CHARTER.beats.find(x => x.id === 'b24'), tableOf({ pc: { vows: [vow] } }));
    expect(now.act('a62', { action: 'click', label: 'Roll Gather Information' }, gathered, tableOf({ pc: { vows: [vow] } })).alert, 'the beat wants the search now').toBe('');
  });

  it(`after ${WAITS_BEFORE_TOLD} waits running on a beat that has not moved, it is told that too — and the last resort is unlocked`, () => {
    // The run's a30–a37: one attack, its result kept, then six waits ("Nothing to choose; await observer").
    const { pointer, act } = walk(b10);
    const gain = [moveCard('c1', 'Gain Ground', 'Action: 3 + 2 = 5 | Challenge: 9, 8', 'miss', { held: { open: true } }), narratedAs('n30', 'c1', 'gain_ground', 'miss')];
    expect(act('a30', { action: 'say', text: 'I press my advantage and drive the Kobayashi IV in close, raking the Ashen Wake\'s engines with everything I\'ve got.' }, gain).alert, 'Gain Ground is an attack the beat takes').toBe('');
    expect(act('a32', { action: 'wait', seconds: 5 }).alert, 'one wait: the table may be answering').toBe('');
    const told = act('a33', { action: 'wait', seconds: 5 });
    expect(told.alert).toBe('YOU HAVE WAITED 2 TIMES RUNNING AND NOTHING HAS CHANGED. The beat is NOT done, and waiting will not finish it: act.');
    expect(told.note).toContain('LAST RESORT — waiting has brought nothing about: this once you may name the move');
    expect(pointer.state[0].lastResort).toBe(true);
    // An action that is not a wait starts the count again.
    expect(act('a34', { action: 'click', label: 'Keep the result' }).alert).toBe('');
  });

  it('a beat that is the table\'s is left alone: there waiting is right', () => {
    const reload = CHARTER.beats.find(b => b.id === 'b12');
    const pointer = createPointer([{ ...reload, needs: [] }]);
    const marks = [markOf('a39', tableOf())];
    pointer.advance({ marks, messages: [], actions: [], charter: CHARTER }, 'a39');
    for (const step of ['a40', 'a41', 'a42']) { pointer.record(step, { action: 'wait', seconds: 5 }); marks.push(markOf(step, tableOf())); }
    expect(pointer.brief()).toMatchObject({ alert: '' });
    expect(pointer.brief().note).not.toContain('LAST RESORT');
    expect(reload.tell).toContain('The table\'s, not yours');
  });
});

// ── 3. a fact that was never planted ─────────────────────────────────────────

describe('a fact that was never planted is not scored (the third live run, F7 at a57 and a72)', () => {
  const F7 = CHARTER.facts.find(f => f.id === 'F7');
  // The run's own questions and answers: the rename was never made (its beat
  // needed the connection), and the narrator answered rightly both times.
  const asked = (step, phase, ask, answer) => [
    { id: `q-${step}`, step, phase, text: ask, fromPlayer: true, narrator: false, vignette: null },
    { id: `a-${step}`, step, phase, text: answer, fromPlayer: false, narrator: true, vignette: null },
  ];
  const messages = [
    ...asked('a57', 'session-3', '@scene What surname does my broker friend go by these days?', prose(said('a57', /interrogateScene/))),
    ...asked('a72', 'session-3', '@scene What is my bonded friend\'s full name now?', prose(said('a72', /interrogateScene/))),
  ];
  const marks = [{ step: '(setup)', phase: 'before', stores: {}, helpers: {} }, { step: 'a57', phase: 'session-3', stores: {}, helpers: {} }, { step: 'a72', phase: 'session-3', stores: {}, helpers: {} }];

  it('the run\'s answers were right — "Vey. Tamsin Vey", "Her name is Tamsin Vey." — and hold the name F7 forbids', () => {
    expect(messages[1].text).toMatch(/^Vey\. Tamsin Vey, as you greeted her at the ledger stall/);
    expect(messages[3].text).toMatch(/^Her name is Tamsin Vey\./);
    expect(F7.refusals[0].anywhere).toEqual(['Tamsin Vey', 'Vey']);
    expect(RUN_3.expected.beats.b18, 'the rename\'s beat was never exercised').toBe('not-exercised');
  });

  it('is reported not-planted: its questions shown as asked, counted for nothing, and no refusal raised from their answers', () => {
    const scored = scoreLedger({ facts: [F7], marks, messages, requests: [], planted: {}, probeSteps: { B: ['a57'], C: ['a72'] } });
    const fact = scored.facts[0];
    expect(fact).toMatchObject({ verdict: 'not-planted', plantedAt: null, refusals: [], failingLayer: null });
    expect(fact.probes.map(p => p.id)).toEqual(['F7-B', 'F7-C']);
    for (const probe of fact.probes) {
      expect(probe).toMatchObject({ asked: true, answered: true, counted: false, notPlanted: true, refused: false, refusals: [], inAnswer: false, failingLayer: null });
    }
    expect(fact.probes[0].answerExcerpt).toContain('Vey. Tamsin Vey');
    expect(scored.totals).toMatchObject({ notPlanted: 1, refused: 0, lost: 0, refusals: 0, probesAsked: 2, probesCounted: 0 });
    const card = scorecard({ charter: CHARTER, run: { id: 'r', mode: 'live' }, ledger: scored });
    expect(card).toContain('| F7 | F7-B | a57 |  |  |  |  | no — the fact was never planted | Vey. Tamsin Vey');
    expect(card).not.toContain('REFUSED');
    expect(card).not.toContain('### Refusals — each to be read');
  });

  it('planted, the same answers refuse it: the check is unchanged where the table was told', () => {
    const renamed = scoreLedger({ facts: [F7], marks: [{ step: 'x18', phase: 'session-2', stores: {}, helpers: {} }, ...marks.slice(1)], messages, requests: [], planted: { F7: 'x18' } });
    expect(renamed.facts[0]).toMatchObject({ verdict: 'refused', plantedAt: 'x18' });
    expect(renamed.facts[0].probes.every(p => p.refused && !p.notPlanted)).toBe(true);
  });

  it('a long run plants a world\'s fact only where its beat was done', () => {
    const beats = [{ id: 'b18', n: 18, status: 'not-exercised', doneAt: 'a46', steps: [] }, { id: 'b20', n: 20, status: 'done', steps: ['a57'] }, { id: 'b25', n: 25, status: 'done', steps: ['a72'] }];
    const charter = { ...CHARTER, facts: [F7], baits: [], beats: CHARTER.beats.filter(b => ['b18', 'b20', 'b25'].includes(b.id)) };
    const long = scoreLongRun({ charter, beats, marks: marks.map(k => ({ ...k, table: tableOf() })), messages, actions: [], requests: [] });
    expect(long.ledger.facts[0]).toMatchObject({ id: 'F7', verdict: 'not-planted', refusals: [] });
    expect(long.ledger.totals.refusals).toBe(0);
  });
});

// ── 4. an X-Carded narration leaves the player's screen ──────────────────────

describe('a narration the X-Card took back is not on the player\'s screen (the third live run, a42)', () => {
  const MODULE_ID = 'starforged-companion';
  const carded = prose(said('a42', /narratePacedInput/));
  const message = (id, content, flags = {}) => ({ id, visible: true, alias: 'Gamemaster', author: { name: 'Gamemaster' }, content, flags: { [MODULE_ID]: flags } });
  const page = (messages) => {
    globalThis.game = { user: { character: null }, messages: { contents: messages } };
    globalThis.document = { querySelectorAll: () => [], querySelector: () => null };
  };
  afterEach(() => { delete globalThis.game; delete globalThis.document; });
  const args = { chatTail: 12, openEarlier: 6, ignoreWindows: [], moduleId: MODULE_ID };

  it('the run\'s narration — the stamp on the crate lid — came back as the vow\'s proof nineteen steps on', () => {
    expect(carded).toContain('Stenciled on a drifting crate lid, the Bleakhold manifest stamp');
    expect(RUN_3.actions[60]).toMatchObject({ action: 'say', text: expect.stringContaining('stamp') });
  });

  it('flagged as the module flags it, it is not shown: the screen reads as if it had not been said', () => {
    const before = message('H7UD', 'I step back and look over the wreckage of the Ashen Wake, and tell what I see drifting around her dead hull.');
    const after = message('RvA0', 'X-Card cleared The GM has resumed narration.', { xcardClearedCard: true });
    page([before, message('OgrzNu9M', `<p>${carded}</p>`, { narratorCard: true, narrationText: carded }), after]);
    expect(screenOf(args).messages.map(m => m.id), 'before the card is played').toEqual(['H7UD', 'OgrzNu9M', 'RvA0']);
    page([before, message('OgrzNu9M', `<p>${carded}</p>`, { narratorCard: true, narrationText: carded, xCarded: true }), after]);
    const screen = screenOf(args);
    expect(screen.messages.map(m => m.id)).toEqual(['H7UD', 'RvA0']);
    expect(screen.messages.map(m => m.text).join(' ')).not.toContain('manifest stamp');
    expect(screen.messages.map(m => m.ref), 'the rest are numbered as the player sees them').toEqual(['m1', 'm2']);
  });

  it('the view\'s last twelve are twelve messages the player is shown', () => {
    const lines = Array.from({ length: 13 }, (_, i) => message(`m-${i}`, `Line ${i}.`));
    lines[9].flags[MODULE_ID].xCarded = true;
    page(lines);
    const screen = screenOf(args);
    expect(screen.messages).toHaveLength(12);
    expect(screen.messages.map(m => m.id)).not.toContain('m-9');
    expect(screen.messages[0].id, 'one more from further up takes its place').toBe('m-0');
  });
});

// ── 5. a background vow, and a tie that is no bargain ────────────────────────

describe('the charter\'s character has a background vow, and beat 2 seeks a tie (the third live run, a19, a50 and a5)', () => {
  it('a seed\'s vows are made as the module makes a vow: named, ranked, and marked as made — the first is the background vow', () => {
    expect(seedVows(CHARTER.seed)).toEqual([{ name: 'Find the lost colony ship Verity\'s Hope', rank: 'epic', vowId: 'seed-vow-1' }]);
    expect(seedVows({ pc: { vows: [{ name: '  Clear my   name ', rank: 'Formidable' }, { name: '' }, { name: 'Another', rank: 'legendary' }] } }))
      .toEqual([{ name: 'Clear my name', rank: 'formidable', vowId: 'seed-vow-1' }, { name: 'Another', rank: 'dangerous', vowId: 'seed-vow-2' }]);
    expect(seedVows({ pc: { name: 'Mira' } }), 'a seed with none: the kept runs\'').toEqual([]);
    expect(seedVows(RUN_3.charter.seed)).toEqual([]);
    expect(seedVows(undefined)).toEqual([]);
  });

  it('it touches no fact the run asks about, and the player is told it is not the quest', () => {
    const vow = CHARTER.seed.pc.vows[0].name;
    for (const fact of CHARTER.facts) for (const word of [...fact.variants, ...(fact.anchor ?? [])]) expect(vow.toLowerCase(), `${fact.id}: ${word}`).not.toContain(word.toLowerCase());
    expect(CHARTER.playerNotes.join('\n')).toContain('her background vow, to find the lost colony ship Verity\'s Hope');
    expect(CHARTER.beats.find(b => b.id === 'b9').tell).toContain('choose your vow about the raids');
    expect(CHARTER.beats.find(b => b.id === 'b24').tell).toContain('If a card asks which vow, choose the one about the raids');
  });

  it('the beats read the quest, not the background vow: sworn, marked and fulfilled', () => {
    const background = { id: 'v0', vowId: 'seed-vow-1', name: 'Find the lost colony ship Verity\'s Hope', rank: 'epic', ticks: 0, completed: false };
    const quest = { id: 'v1', vowId: 'v1', name: 'Find who is raiding the Cinder Expanse lanes', rank: 'dangerous', ticks: 24, completed: false };
    const setup = markOf('a60', tableOf({ pc: { vows: [background, quest] } }));
    const state = checked({ check: { type: 'vowFulfilled' } }, [setup, markOf('a61', tableOf({ pc: { vows: [background, quest] } }))]);
    expect(state.detail, 'the vow it reports is the quest, at its own ticks').toBe('the vow "Find who is raiding the Cinder Expanse lanes" stands at 24 ticks');
    expect(state.progress).toBe(24);
    const fulfil = moveCard('r2', 'Fulfill Your Vow', 'Progress: 6 | Challenge: 1, 2', 'strong_hit');
    expect(checked({ check: { type: 'vowFulfilled' } }, [setup, markOf('a64', tableOf({ pc: { vows: [background, { ...quest, completed: true }] } }), [fulfil])]))
      .toMatchObject({ status: 'done', detail: 'the vow "Find who is raiding the Cinder Expanse lanes" is fulfilled (strong_hit)' });
    // Begin a Session's vow is the one sworn in it, whatever the rank of the one she came with.
    const sameRank = { ...background, rank: 'dangerous' };
    const begun = checked({ check: { type: 'sessionBegun', n: 1, vow: { rank: 'dangerous' }, sworn: true } }, [markOf('(setup)', tableOf({ session: { active: false, id: null }, pc: { vows: [sameRank] } })), markOf('a2', tableOf({ pc: { vows: [sameRank] } }))]);
    expect(begun.detail).toBe('the session is open; no dangerous vow is on Mira Kestrel\'s sheet');
  });

  it('beat 2 has the player seek a lasting tie, offer nothing for it, and name no move', () => {
    const b2 = CHARTER.beats.find(b => b.id === 'b2');
    expect(b2.tell).toContain('someone on these docks you can come back to, and who can count on you in turn');
    expect(b2.tell).toContain('Offer no payment and strike no bargain');
    for (const bargain of ['fair cut', 'first pick', 'for her help']) expect(b2.tell, bargain).not.toContain(bargain);
    for (const words of quoted(b2.tell)) expect(movesNamedIn(words), words).toEqual([]);
    expect(movesNamedIn(b2.tell.replace(/A roll should follow/, '')), 'the tell speaks of a roll; it gives no move\'s name').toEqual([]);
    expect(movesNamedIn(b2.playerTitle)).toEqual([]);
    expect(movesNamedIn(b2.lastResort)).toEqual(['Make a Connection']);
    const scripted = CHARTER.rehearsal.find(e => e.beat === 2 && e.move);
    expect(scripted).toMatchObject({ move: { id: 'make_a_connection' } });
    expect(scripted.text).not.toMatch(/first pick|cut of/);
    expect(movesNamedIn(scripted.text)).toEqual([]);
  });
});

// ── 6. a line of play's wait, and a scene question's ─────────────────────────

describe('a line\'s wait is counted for lines of play apart from scene questions (the third live run)', () => {
  // The run's own waits, in milliseconds from what was typed to its reply.
  const SCENE = [2852, 3013, 3286, 3458, 3486, 3503, 3505, 3579, 3603, 3703, 3922, 4193, 4208, 4553, 4769, 4773];
  const PLAY = [4659, 4734, 4768, 5192, 5392, 5451, 5810, 5995, 6229, 7118, 7946, 8533, 9103, 9618, 10444];
  const actions = [
    ...SCENE.map((ms, i) => ({ step: `s${i}`, action: { action: 'say', text: '@scene Who is holding the cargo manifest I was carrying?' }, saidAt: 1000, repliedAt: 1000 + ms })),
    ...PLAY.map((ms, i) => ({ step: `p${i}`, action: { action: 'say', text: 'I work the docks for who saw the raiders last.' }, saidAt: 1000, repliedAt: 1000 + ms })),
    { step: 'c1', action: { action: 'say', text: '!recap' }, saidAt: 1000, repliedAt: 2000 },
    { step: 'a30', action: { action: 'say', text: 'I press my advantage.' }, saidAt: 1000, repliedAt: null },
  ];

  it('reports both: fifteen lines of play at 6.0 s, sixteen scene questions at 3.6 s — where one figure said 4.7 s of thirty-one', () => {
    expect(RUN_3.actions.filter(a => a.action === 'say' && /^@scene\b/.test(a.text))).toHaveLength(SCENE.length);
    const speed = speedOf({ requests: [], actions });
    expect(speed.lineToReply).toMatchObject({ n: 15, p50: 5995, p95: 10444 });
    expect(speed.sceneQuestionToReply).toMatchObject({ n: 16, p50: 3579, p95: 4773 });
    expect(speed.unanswered).toEqual(['a30']);
    const card = scorecard({ charter: CHARTER, run: { id: 'r', mode: 'live' }, speed });
    expect(card).toContain('| Speed | a line of play to its reply: p50 6.0 s, p95 10.4 s (15 lines); a scene question to its answer: p50 3.6 s, p95 4.8 s (16) |');
    expect(card).toContain('A line of play to its reply: p50 6.0 s, p95 10.4 s, longest 10.4 s over 15 lines. A scene question to its answer: p50 3.6 s, p95 4.8 s, longest 4.8 s over 16. Unanswered: a30.');
  });

  it('a run with no scene question says nothing of them', () => {
    const speed = speedOf({ requests: [], actions: actions.filter(a => a.step.startsWith('p')) });
    expect(speed.sceneQuestionToReply.n).toBe(0);
    expect(scorecard({ charter: CHARTER, run: { id: 'r', mode: 'live' }, speed })).toContain('| Speed | a line of play to its reply: p50 6.0 s, p95 10.4 s (15 lines) |');
  });
});

// ── what a session's narrations keep returning to ────────────────────────────

/** A kept run's narrations, as the observer's messages hold them, read from its transcript. */
function narrationsOf(folder) {
  const out = [];
  for (const block of fs.readFileSync(path.join(folder, 'transcript.md'), 'utf8').split(/\n---\n/)) {
    const head = /\*([a-z(][\w()]*) · ([\w-]+)\*/.exec(block);
    if (!head) continue;
    for (const m of block.matchAll(/\*\*NARRATOR — [^*]+\*\*\n\n([\s\S]+?)(?=\n\n\*\*|\s*$)/g)) out.push({ step: head[1], phase: head[2], narrator: true, vignette: null, text: m[1].trim() });
  }
  return out;
}

describe('the review counts what a run\'s narrations keep returning to', () => {
  const third = refrainsOf(narrationsOf(RUN_3_FOLDER));
  const second = refrainsOf(narrationsOf(RUN_2_FOLDER));
  const session = (r, phase) => r.sessions.find(x => x.phase === phase);

  it('the third run\'s session 3: the speaker over the hatch, the drawer, the galley lamp', () => {
    const s3 = session(third, 'session-3');
    expect(s3).toMatchObject({ narrations: 23, counted: true });
    // "over the hatch": seventeen of twenty-three narrations, eleven of them running.
    const hatch = s3.refrains.phrases.find(p => p.what === 'over the hatch');
    expect(hatch).toMatchObject({ in: 17, of: 23, run: 11 });
    expect(hatch.steps.slice(0, 10)).toEqual(['a50', 'a51', 'a52', 'a53', 'a54', 'a55', 'a56', 'a57', 'a58', 'a59']);
    expect(s3.refrains.phrases.find(p => p.what === 'speaker over the hatch')).toMatchObject({ in: 11 });
    expect(s3.refrains.words.find(w => w.what === 'hatch')).toMatchObject({ in: 18, run: 11 });
    // The drawer that "slides open its inch": nine narrations.
    expect(s3.refrains.words.find(w => w.what === 'drawer')).toMatchObject({ in: 9, of: 23 });
    expect(s3.phrases.find(p => p.what === 'slides open its inch')).toMatchObject({ in: 4, steps: ['a53', 'a58', 'a61', 'a64'] });
    // The galley lamp: six, under a third — counted, and listed below the refrains.
    expect(s3.phrases.find(p => p.what === 'galley lamp')).toMatchObject({ in: 6, steps: ['a63', 'a66', 'a67', 'a69', 'a70', 'a72'] });
    expect(s3.refrains.phrases.some(p => p.what === 'galley lamp'), `under ${Math.round(REFRAIN_SHARE * 100)}%`).toBe(false);
    expect(s3.endings).toMatchObject({ waiting: 7, of: 23 });
    expect(s3.endings.steps.map(e => e.step)).toEqual(['a53', 'a55', 'a56', 'a57', 'a64', 'a69', 'a73']);
    expect(third.worst).toMatchObject({ phase: 'session-3', what: 'hatch', in: 18, of: 23 });
  });

  it('the second run: "visitor at the hatch" through session 2, "Tamsin\'s chair creaks" closing a73–a85', () => {
    const s2 = session(second, 'session-2');
    expect(s2.refrains.phrases.find(p => p.what === 'visitor at the hatch')).toMatchObject({ in: 6, of: 11, run: 5, steps: ['a17', 'a18', 'a19', 'a20', 'a21', 'a24'] });
    expect(s2.refrains.words.find(w => w.what === 'intercom')).toMatchObject({ in: 8 });
    const creaks = session(second, 'session-3').phrases.find(p => p.what === 'tamsin\'s chair creaks');
    expect(creaks).toMatchObject({ in: 7, of: 34, steps: ['a73', 'a75', 'a80', 'a81', 'a82', 'a84', 'a85'] });
    expect(session(second, 'session-3').endings).toMatchObject({ waiting: 13, of: 34 });
    // Who a session is about is in most of its narrations, and is no refrain for that.
    expect(session(second, 'session-3').refrains.words.find(w => w.what === 'tamsin')).toMatchObject({ in: 25, name: true });
    expect(second.worst).toMatchObject({ phase: 'session-2', what: 'hatch' });
  });

  it('the opening and closing scenes are apart, and a session of a few narrations is not counted', () => {
    const say = (step, phase, text, vignette = null) => ({ step, phase, narrator: true, vignette, text });
    const r = refrainsOf([
      say('a2', 'session-1', 'The kettle ticks over the hatch.', 'galley_begin'),
      say('a3', 'session-1', 'The speaker over the hatch crackles.'),
      say('a4', 'session-1', 'Over the hatch, the speaker clears its throat and waits.'),
      say('a5', 'session-1', 'You tap the plate. Nothing over the hatch answers.'),
      say('a6', 'session-1', 'The dock is loud tonight.'),
      { step: 'a6', phase: 'session-1', fromPlayer: true, text: 'I look over the hatch.' },
      say('a7', 'after-session-1', 'A woman darns a sock over the hatch.', 'npc_end'),
      say('a8', 'session-2', 'The hatch.'), say('a9', 'session-2', 'The hatch.'), say('a10', 'session-2', 'The hatch.'),
    ]);
    expect(r.sessions.map(x => `${x.phase}:${x.narrations}:${x.counted}`)).toEqual(['session-1:4:true', 'session-2:3:false']);
    expect(r.sessions[0].refrains.phrases).toMatchObject([{ what: 'over the hatch', in: 3, of: 4, run: 3, steps: ['a3', 'a4', 'a5'] }]);
    expect(r.sessions[0].endings).toMatchObject({ waiting: 1, steps: [{ step: 'a4' }] });
    expect(r.sessions[1].refrains, 'three narrations are no session to count in').toEqual({ words: [], phrases: [] });
    expect(refrainsOf([])).toEqual({ sessions: [], worst: null });
  });

  it('the scorecard has its row and its section: per session, what is in a third or more with its steps, and the endings', () => {
    const card = scorecard({ charter: CHARTER, run: { id: 'r', mode: 'live' }, refrains: third });
    expect(card).toContain('| Refrains | "hatch" in 18 of session-3\'s 23 narrations (11 in a row); ');
    expect(card).toMatch(/\| Refrains \|[^|]*; 11 of 45 narrations end on someone waiting, watching or still \|/);
    expect(card).toContain('## Refrains — what each session\'s narrations keep returning to');
    expect(card).toContain('### session-3 — 23 narrations');
    expect(card).toContain('| phrase | over the hatch | 17 of 23 (74%) | 11 | a50 a51 a52 a53 a54 a55 a56 a57 a58 a59 a61 a63 a68 a69 a71 a72 a74 |');
    expect(card).toContain('| word | drawer | 9 of 23 (39%) | 4 |');
    expect(card).toContain('| name | tamsin | 9 of 23 (39%) | 3 |');
    expect(card).toMatch(/Phrases in fewer: "galley lamp" 6 \(a63 a66 a67 a69 a70 a72\)/);
    expect(card).toContain('Endings that leave someone waiting, watching or still: 7 of 23 — a53: …');
    // A run that was not counted has neither.
    const none = scorecard({ charter: CHARTER, run: { id: 'r', mode: 'live' } });
    expect(none).not.toContain('Refrains');
  });
});

// ── the expedition beat ──────────────────────────────────────────────────────

describe('the expedition beat (b7a): off the charted lane, a waypoint looked over, the journey finished', () => {
  const beat = CHARTER.beats.find(b => b.id === 'b7a');
  const track = (extra = {}) => ({ id: 't2', label: 'the source of the distress call', type: 'expedition', rank: 'dangerous', ticks: 8, completed: false, siteId: null, ...extra });
  const setup = markOf('a20', tableOf());
  const undertaken = [moveCard('u1', 'Undertake an Expedition', 'Action: 5 + 3 = 8 | Challenge: 3, 6', 'strong_hit'), narratedAs('nu', 'u1', 'undertake_an_expedition', 'strong_hit')];
  const explored = (shown = 'strong_hit', dice = 'Action: 3 + 3 = 6 | Challenge: 2, 4') => [moveCard('w1', 'Explore a Waypoint', dice, shown), narratedAs('nw', 'w1', 'explore_a_waypoint', shown)];
  const choice = (resolved) => ({ id: 'c1', suffer: { resolved, picked: resolved ? [0] : [], moveId: 'explore_a_waypoint', resolutionId: 'w1', options: [{ label: 'Mark expedition progress' }, { label: '+2 momentum' }] } });
  const finished = (shown = 'strong_hit') => [moveCard('f1', 'Finish an Expedition', 'Progress: 4 | Challenge: 1, 2', shown), narratedAs('nf', 'f1', 'finish_an_expedition', shown)];
  const at = (step, tracks, cards = [], over = {}) => markOf(step, tableOf({ tracks, ...over }), cards);
  const check = (marks, c = beat.check) => checked({ check: c }, marks);

  it('stands eighth, in session 2, between the first memory questions and the course for Bleakhold', () => {
    const ids = CHARTER.beats.map(b => b.id);
    expect([ids[ids.indexOf('b7a') - 1], ids[ids.indexOf('b7a') + 1]]).toEqual(['b7', 'b8']);
    expect(beat).toMatchObject({ n: 8, session: 2, check: { type: 'expedition', finished: true }, wants: ['undertake_an_expedition', 'explore_a_waypoint', 'finish_an_expedition'] });
    expect(CHARTER.beats.find(b => b.id === 'b7').check).toMatchObject({ type: 'probesAsked', set: 'A' });
    expect(CHARTER.beats.find(b => b.id === 'b8').check).toMatchObject({ type: 'arrived', settlement: 'Bleakhold Station' });
    expect(BEAT_CHECKS.expedition).toBeTypeOf('function');
  });

  it('gives the player nothing to type that names a move: the title it is shown, the tell, the rehearsal\'s lines — only its last resort does', () => {
    expect(movesNamedIn(beat.title).sort(), 'its own title names them').toEqual(['Explore a Waypoint', 'Undertake an Expedition']);
    expect(movesNamedIn(beat.playerTitle)).toEqual([]);
    // What it puts in quotes is two buttons' labels — a button may name a move — and neither is a move's name as the rules write it.
    expect(quoted(beat.tell)).toEqual(['Mark expedition progress', '🗺 Finish the Expedition']);
    for (const words of quoted(beat.tell)) expect(movesNamedIn(words), words).toEqual([]);
    expect(movesNamedIn(beat.tell).filter(m => m !== 'roll'), 'it speaks of a roll, and names no move').toEqual([]);
    expect(movesNamedIn(beat.lastResort)).toEqual(['Undertake an Expedition']);
    const scripted = CHARTER.rehearsal.filter(e => e.beat === beat.n);
    expect(scripted.map(e => e.move?.id ?? e.label)).toEqual(['undertake_an_expedition', 'explore_a_waypoint', 'Mark expedition progress', 'finish_an_expedition']);
    for (const e of scripted.filter(x => x.action === 'say')) expect(movesNamedIn(e.text), e.text).toEqual([]);
    expect(scripted.length, 'a handful of actions').toBeLessThanOrEqual(5);
  });

  it('ends its expedition with the run\'s seventh scripted roll: the finish\'s progress roll, one and two', () => {
    expect(beat.dice).toEqual({ moves: ['finish_an_expedition'], roll: 'strong_hit', kind: 'progress' });
    expect(CHARTER.beats.filter(b => b.dice)).toHaveLength(7);
    // The rehearsal rolls its other two for it, so that it walks one road.
    expect(CHARTER.rehearsalDice[0].moves).toEqual(expect.arrayContaining(['undertake_an_expedition', 'explore_a_waypoint']));
    expect(CHARTER.caps, 'the run\'s caps are a settled decision').toEqual({ actions: 100, calls: 400, minutes: 60, usd: 15 });
  });

  // The module records an expedition's destination as a place — a site, with
  // its location, which the finish then docks at — only in a sector that has
  // map data (src/sectors/siteDiscovery.js recordUnchartedDestination). The
  // runner's hand-made sector had none: the first rehearsal's finish arrived
  // nowhere, and the sheet still said Hollow Spire.
  it('the seed\'s sector has map data, so the place she sets out for becomes one', () => {
    expect(CHARTER.seed.sector.mapData).toEqual({ settlements: [], discoveries: [] });
    expect(RUN_3.charter.seed.sector.mapData, 'the kept runs\' sector, as it was').toBeUndefined();
  });

  it('its check: an expedition begun while the beat was current, progress marked on it, a waypoint explored, and the expedition finished', () => {
    expect(check([setup, at('a21', [])])).toMatchObject({ status: 'current', detail: 'no expedition is under way', progress: 0 });
    const begun = at('a21', [track()], undertaken);
    expect(check([setup, begun])).toMatchObject({ status: 'current', detail: 'the dangerous expedition "the source of the distress call" stands at 2 of 10 boxes; no waypoint has been explored' });
    const looked = at('a22', [track()], [...explored(), choice(false)]);
    expect(check([setup, begun, looked]).detail).toBe('the dangerous expedition "the source of the distress call" stands at 2 of 10 boxes; a waypoint was explored (a strong hit) and its choice is not made');
    const marked = at('a23', [track({ ticks: 16 })], [choice(true)]);
    expect(check([setup, begun, looked, marked]).detail).toBe('the dangerous expedition "the source of the distress call" stands at 4 of 10 boxes, a waypoint explored at a22 (a strong hit); the expedition is still open');
    // Its Finish pressed, and the roll not come yet (a card's press reaches the GM by a relay).
    const pressed = at('a24', [track({ ticks: 16 })], [{ id: 'e1', expedition: { created: true, trackId: 't2', trackLabel: 'the source of the distress call', expeditionFinishAttempted: true } }]);
    expect(check([setup, begun, looked, marked, pressed]).detail).toContain('its Finish was pressed and has not been rolled');
    const ended = at('a24', [track({ ticks: 16, completed: true, siteId: 'site-1' })], finished(), { location: { id: 'L9', name: 'Source of the Distress Call' } });
    const done = check([setup, begun, looked, marked, ended]);
    expect(done).toMatchObject({ status: 'done', doneAt: 'a24' });
    expect(done.detail).toBe('the dangerous expedition "the source of the distress call" was begun at a21 and marked to 4 of 10 boxes, a waypoint explored at a22 (a strong hit) — and finished (a strong hit), the ship at Source of the Distress Call');
    // Each part moves it: the beat is given its eight actions again from there.
    expect([check([setup, begun]).progress, check([setup, begun, looked]).progress, check([setup, begun, looked, marked]).progress]).toEqual([3, 4, 5]);
  });

  it('what a waypoint offers on each result: a strong hit\'s choice must be made; a weak hit and a miss ask nothing of the check', () => {
    const begun = at('a21', [track()], undertaken);
    const end = at('a23', [track({ completed: true })], finished('weak_hit'));
    for (const [shown, dice] of [['weak_hit', 'Action: 1 + 3 = 4 | Challenge: 2, 9'], ['miss', 'Action: 1 + 3 = 4 | Challenge: 8, 9']]) {
      expect(check([setup, begun, at('a22', [track()], explored(shown, dice)), end]), shown).toMatchObject({ status: 'done', detail: expect.stringContaining('marked to 2 of 10 boxes') });
    }
    // A result momentum could improve is held: nothing comes of it until it is kept.
    const held = [moveCard('w1', 'Explore a Waypoint', 'Action: 1 + 3 = 4 | Challenge: 2, 9', 'weak_hit', { held: { open: true } })];
    expect(check([setup, begun, at('a22', [track()], held)]).detail).toContain('the waypoint\'s result is held');
  });

  it('what is not the beat: a miss that began nothing, a finish that missed, an expedition from before, two for one journey', () => {
    const missed = [moveCard('u0', 'Undertake an Expedition', 'Action: 1 + 3 = 4 | Challenge: 8, 9', 'miss'), narratedAs('nu0', 'u0', 'undertake_an_expedition', 'miss')];
    expect(check([setup, at('a21', [], missed)])).toMatchObject({ status: 'current', detail: 'Undertake an Expedition came up a miss at a21; no expedition is under way', progress: 1 });
    const road = [setup, at('a21', [track()], undertaken), at('a22', [track({ ticks: 16 })], explored('weak_hit', 'Action: 1 + 3 = 4 | Challenge: 2, 9'))];
    expect(check([...road, at('a23', [track({ ticks: 16 })], finished('miss'))]).detail).toContain('Finish an Expedition came up a miss and the expedition is still open');
    expect(check([...road, at('a23', [track({ ticks: 16 })], [...finished('miss'), { id: 'rc', recommit: { trackId: 't2', trackLabel: 'the source of the distress call' } }])]).detail).toContain('the expedition is still open — a recommit is offered');
    // In a sector with no map data the table records no place for it: finished all the same, and said.
    expect(check([...road, at('a23', [track({ ticks: 16, completed: true })], finished('weak_hit'))]).detail).toContain('and finished (a weak hit), its destination no place on the map');
    // A beat that does not end it is done with the expedition open.
    expect(check(road, { type: 'expedition' })).toMatchObject({ status: 'done', detail: expect.not.stringContaining('finished') });
    // An expedition that was already on the table is not this beat's.
    const old = track({ id: 't0', label: 'an older journey', ticks: 24 });
    expect(check([markOf('a20', tableOf({ tracks: [old] })), at('a21', [old], explored())]).detail).toBe('no expedition is under way');
    expect(check([setup, at('a21', [track(), track({ id: 't3', label: 'the gap' })], undertaken)])).toMatchObject({ status: 'failed', detail: '2 expeditions were begun for one journey: "the source of the distress call", "the gap"' });
    // Begun by the waypoint's own mark, with no crossing rolled: said as that.
    const byMark = check([setup, at('a21', [track()], [...explored(), choice(true)])], { type: 'expedition' });
    expect(byMark.detail).toContain('was begun by the waypoint\'s own mark');
  });

  it('a roll that is none of its three is told to the player as not the beat\'s', () => {
    const pointer = createPointer([beat]);
    const marks = [setup];
    pointer.advance({ marks, messages: [], actions: [], charter: CHARTER }, 'a20');
    pointer.record('a21', { action: 'say', text: 'I take her off the lane.' });
    marks.push(at('a21', [], [moveCard('d1', 'Face Danger', 'Action: 4 + 2 = 6 | Challenge: 2, 9', 'weak_hit'), narratedAs('nd', 'd1', 'face_danger', 'weak_hit')]));
    pointer.advance({ marks, messages: [line('a21', 'I take her off the lane.')], actions: [], charter: CHARTER }, 'a21');
    expect(pointer.brief().alert).toContain('A ROLL WAS MADE — Face Danger, a weak hit — AND IT IS NOT WHAT THIS BEAT NEEDS');
    expect(pointer.brief().note).toContain('this once you may name the move — say that you undertake an expedition to the source of the distress call');
  });
});
