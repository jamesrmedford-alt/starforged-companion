/**
 * STARFORGED COMPANION
 * tests/unit/openingFromTheRecord.test.js
 *
 * Overhaul 2, slice 6 (§9; OPENING-CONTRADICTS-WHERE-IT-STOPPED) — a
 * session's opening is told where the last session stopped from that
 * session's record: its last scene's place, who was with them at the end,
 * what binds there (the player's, the dice's, the GM's, the premise's — never
 * the narration's colour), the question still open and what play let go —
 * then the last narration as the table read it, its details the narration's
 * own. The fourth live run's a20 opened aboard with a fee slip "left on
 * Tamsin's counter" set against its own last narration; a6's colour had the
 * slip in Mira's hands, a7's line had her leave it on the counter.
 *
 * The events are run 4's session 1, with the basis the floor gives them: a6's
 * slip colour, a15's manifest the player's, a7's line its own fact.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { composeOpeningScene } from '../../src/session/galleyVignette.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { seedSessionRecord, seedLegacySessionPage, playedBeats, recordedEvent } from '../helpers/sessionRecordSeed.js';
import { _resetSummaryViewForTests } from '../../src/record/summaryView.js';
import { readRecord } from '../../src/record/read.js';
import { renderSessionLogBody } from '../../src/record/sessionLogView.js';
import { recordSourceOf } from '../helpers/sessionRecordSeed.js';

const S1 = 's-1';
const SCENE = `sc-${S1}`;
const OPEN = 'What will Mira tell the hauler crew about the raiders?';
const LET_GO = 'Who else knew Mira was coming to Hollow Spire?';

const actor = (name) => ({ id: `a-${name}`, name, type: 'character', system: { biography: '' } });
const mira = { active: [{ actor: actor('Mira Kestrel') }], absent: [] };
const opening = async (campaignState) => (await composeOpeningScene(mira, campaignState, { draw: () => 50 })).userMessage;

/** Run 4's session 1, as the record holds it once the floor has given each fact its basis. */
function sessionOne({ question = OPEN, answered = false } = {}) {
  const events = playedBeats(S1, [
    { said: 'I hand Tamsin the fee and wait for the slip.', told: 'Tamsin slides the fee slip across; Mira turns it over in her hand.' },
    { said: 'I leave the fee slip on Tamsin\'s counter and go.', told: 'The slip stays on the counter by Tamsin\'s ledger.' },
    { said: 'I leave the manifest with Tamsin for safekeeping.', told: 'Tamsin tucks the manifest under the counter.' },
  ], { actor: 'pc-mira', number: 1 });
  const nar = (i) => `nar-${S1}-${i}`;
  const truth = (id, i, subject, fact, basis) => recordedEvent(S1, 'truth.set', {
    ref: { truth: id, nar: nar(i) }, d: { subject: { kind: 'text', text: subject }, fact, by: 'narrator', basis },
  });
  return [
    events[0],
    recordedEvent(S1, 'scene.started', { d: { sceneId: SCENE, reason: 'session_vignette', cause: 'session', what: 'the session begins',
      place: { id: 'set-hollow', type: 'settlement', name: 'Hollow Spire' } } }),
    ...events.slice(1),
    truth('t-a6', 1, 'the fee slip', 'Mira holds it in her hand', 'narrator'),       // a6: colour
    truth('t-a7', 2, 'the fee slip', 'Mira left it on Tamsin\'s counter', 'player'), // a7: the line's own fact
    truth('t-a15', 3, 'the manifest', 'Mira left it with Tamsin for safekeeping', 'player'),
    recordedEvent(S1, 'frame', { ref: { nar: nar(3) }, d: { location: 'Tamsin\'s stall', present: ['Tamsin Vey'],
      situation: 'Tamsin keeps the manifest', question, questionAnswered: answered, letGo: [LET_GO] } }),
  ];
}

describe('overhaul 2 §9 — an opening is told where the last session stopped, from its record', () => {
  const minted = { currentSessionId: 's-2', sessionNumber: 2 };
  let journals;
  beforeEach(() => {
    journals = installJournalMock();
    _resetSummaryViewForTests();
  });
  afterEach(() => journals.restore());

  it('run 4\'s session 1: the manifest with Tamsin and the slip on her counter — never a6\'s slip in Mira\'s hands', async () => {
    await seedSessionRecord(S1, sessionOne(), { number: 1 });
    const msg = await opening(minted);
    expect(msg).toContain('WHERE THE LAST SESSION STOPPED — session 1\'s record, the table\'s facts:');
    expect(msg).toContain('  Place: Hollow Spire.');
    expect(msg).toContain('  With them at the end: Tamsin Vey.');
    expect(msg).toContain('the fee slip — Mira left it on Tamsin\'s counter (the player)');
    expect(msg).toContain('the manifest — Mira left it with Tamsin for safekeeping (the player)');
    expect(msg).not.toContain('Mira holds it in her hand');
    expect(msg).toContain(`  Still open: ${OPEN} (the player's)`);
    expect(msg).toContain(`  Let go — never bring these back: "${LET_GO}".`);
    // The summary paragraph is not told here (it stays in the system prompt, as narrative texture).
    expect(msg).not.toContain('as its summary has it');
  });

  it('the rule binds what binds; the last narration is how it read', async () => {
    await seedSessionRecord(S1, sessionOne(), { number: 1 });
    const msg = await opening(minted);
    expect(msg).toMatch(/Nothing in this scene contradicts what binds, above\. The last narration is\s+how it read: its details are the narration's own and may be left out\./);
    expect(msg).not.toMatch(/Do not contradict it, do not/);
  });

  it('the ending is the material\'s — and never on what play let go', async () => {
    await seedSessionRecord(S1, sessionOne(), { number: 1 });
    expect(await opening(minted)).toMatch(/How it ends is the material's[^\n]*\. It never ends on anything under Let go\./);
  });

  it('with the question answered, nothing is open — and still nothing play let go is ended on', async () => {
    await seedSessionRecord(S1, sessionOne({ answered: true }), { number: 1 });
    const msg = await opening(minted);
    expect(msg).not.toContain('Still open:');
    expect(msg).toContain('It never ends on anything under Let go.');
  });

  it('control: a session from before the record is told by its summary, as before', async () => {
    await seedLegacySessionPage(S1, 'Mira left the manifest with Tamsin at Hollow Spire.', { number: 1 });
    const msg = await opening(minted);
    expect(msg).toContain('WHERE THE LAST SESSION STOPPED (session 1, as its summary has it):');
    expect(msg).toContain('Mira left the manifest with Tamsin at Hollow Spire.');
    expect(msg).not.toContain('the table\'s facts');
    expect(msg).not.toContain('under Let go');
  });
});

describe('a cutaway after the last scene is no place play stopped (issue #388 #1, OPENING-TOLD-FROM-THE-CUTAWAY)', () => {
  // The fifth live long haul's session 2: its last played frame had Mira alone
  // at the Bleakhold docking ring, with the oracle's survivor binding; the a46
  // closing started a scene of its own, "Tamsin Okoro" in an observation
  // lounge on Hollow Spire, and a48's opening was told "With them at the end:
  // Tamsin Okoro." with nothing of what bound.
  const S2 = 's-2';
  const minted = { currentSessionId: 's-3', sessionNumber: 3 };
  const cut = (k, opts) => ({ ...recordedEvent(S2, k, opts), scene: 'sc-cut' });
  const SURVIVOR = 'has at least one crew member alive aboard, trapped behind the jammed hatch';
  function sessionTwo({ cutaway = true } = {}) {
    const events = playedBeats(S2, [
      { said: 'I look over the wreckage of the cutter.', told: 'The hatch hangs jammed halfway.' },
    ], { actor: 'pc-mira', number: 2 });
    return [
      events[0],
      recordedEvent(S2, 'scene.started', { d: { sceneId: `sc-${S2}`, reason: 'fight_end', cause: 'fight', what: 'the fight with The Cinder Wren is over',
        place: { id: 'set-bleak', type: 'settlement', name: 'Bleakhold Station' } } }),
      ...events.slice(1),
      recordedEvent(S2, 'truth.set', { ref: { truth: 't-alive', nar: `nar-${S2}-1` }, d: { subject: { kind: 'text', text: 'Cinder Wren' }, fact: SURVIVOR, by: 'narrator', basis: 'dice' } }),
      recordedEvent(S2, 'frame', { ref: { nar: `nar-${S2}-1` }, d: { location: 'Bleakhold Station docking ring', present: ['Mira Kestrel'],
        situation: 'The Kobayashi IV drifts beside the disabled Cinder Wren', question: 'Is anyone left alive aboard the wreck?' } }),
      ...(cutaway ? [
        cut('scene.started', { d: { sceneId: 'sc-cut', reason: 'session_vignette', cause: 'cutaway', what: 'a cutaway',
          place: { id: 'set-bleak', type: 'settlement', name: 'Bleakhold Station' } } }),
        cut('narration', { ref: { nar: 'nar-cut', card: 'card-cut' }, d: { mode: 'vignette_close' },
          text: 'Tamsin has found the observation lounge on the Hollow Spire\'s upper ring empty.' }),
        cut('frame', { ref: { nar: 'nar-cut' }, d: { location: 'Observation lounge, Hollow Spire upper ring', present: ['Tamsin Okoro'],
          situation: 'Tamsin kneels on the lounge floor reaching for a gear' } }),
      ] : []),
    ];
  }

  let journals;
  beforeEach(() => {
    journals = installJournalMock();
    _resetSummaryViewForTests();
    globalThis.game.actors._set('pc-mira', globalThis.makeTestActor({ id: 'pc-mira', type: 'character', name: 'Mira Kestrel' }));
  });
  afterEach(() => journals.restore());

  it('the opening is told the last played scene: its place, what binds and the question still open — never the cutaway\'s company', async () => {
    await seedSessionRecord(S2, sessionTwo(), { number: 2 });
    const msg = await opening(minted);
    expect(msg).toContain('WHERE THE LAST SESSION STOPPED — session 2\'s record, the table\'s facts:');
    expect(msg).toContain('  Place: Bleakhold Station.');
    expect(msg).toContain(`  What binds: Cinder Wren — ${SURVIVOR} (the dice).`);
    expect(msg).toContain('  Still open: Is anyone left alive aboard the wreck? (the player\'s)');
    expect(msg).not.toContain('With them at the end: Tamsin Okoro');
    expect(msg).not.toContain('Observation lounge');
  });

  it('the characters are not "with them": the frame\'s own PC is left out of who was there', async () => {
    await seedSessionRecord(S2, sessionTwo(), { number: 2 });
    expect(await opening(minted)).not.toMatch(/With them at the end:[^\n]*Mira Kestrel/);
  });

  it('control: the same session with no cutaway is told the same', async () => {
    await seedSessionRecord(S2, sessionTwo({ cutaway: false }), { number: 2 });
    const msg = await opening(minted);
    expect(msg).toContain(`  What binds: Cinder Wren — ${SURVIVOR} (the dice).`);
    expect(msg).toContain('  Place: Bleakhold Station.');
  });

  it('the Session Log heads the cutaway as one — "A cutaway — …" — never as a scene the characters played', () => {
    const [session] = readRecord({ session: S2 }, recordSourceOf(S2, sessionTwo(), { number: 2 })).sessions;
    const body = renderSessionLogBody(session);
    expect(body).toContain('<li><em>A cutaway — Observation lounge, Hollow Spire upper ring.</em></li>');
    expect(body).not.toContain('A new scene — Observation lounge');
    expect(body).toContain('<li><em>A new scene — the fight with The Cinder Wren is over (Bleakhold Station docking ring).</em></li>');
  });
});
