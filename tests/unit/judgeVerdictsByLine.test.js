/**
 * STARFORGED COMPANION
 * tests/unit/judgeVerdictsByLine.test.js
 *
 * Issue #399, slice 3 — verdicts by line (D3), the classes declared once
 * (D4), and the bug audit's findings that belong with them (slice 2's list on
 * the issue):
 *   - D3: the judge's lines are numbered and it answers by number. Two lines
 *     of one kind are told apart (round 9's a36 had two [dice] lines; a Batch
 *     Mode round's two refusals are two [premise] lines). A verdict naming no
 *     line, or quoting words the judged view does not hold — the offer line
 *     among them — is dropped and logged, never silently.
 *   - D4: the class each kind's row declares is the class the code holds it
 *     to (consistency of the table and the checks).
 *   - The audit's row says whether the audit ran; the judge's error says why
 *     it did not; a reply cut at its cap is named so.
 *   - Rows are written for the narration that posted, after the caller's
 *     X-Card check, each with the draft it describes, one row a verdict.
 *   - A redraft with no prose keeps the first draft.
 *   - The re-ask names every line broken, each in its own words with its own
 *     quotes.
 *   - The offer line is no breach of any check.
 *   - [chosen-since] has the floor check its row declares.
 *   - An audit finding on an obligation line posts no card, whatever kind the
 *     model gave it.
 *   - The paced retry keeps the offer its first try had.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const replies = [];
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, _body, opts) => {
    const next = replies.shift();
    if (next instanceof Error) throw next;
    if (next && typeof next === 'object' && next.content) return next;
    return { content: [{ type: 'text', text: next ?? (opts?.label === 'consistencyCheck' ? '{"contradictions":[]}' : '{"violations":[]}') }], stop_reason: 'end_turn' };
  }),
}));
vi.mock('../../src/pacing/telemetry.js', async (importOriginal) => ({
  ...(await importOriginal()),
  logConsistencyDecision: vi.fn(async () => {}),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  applyStateTransition: vi.fn(async () => null),
}));

import { apiPost } from '../../src/api-proxy.js';
import { logConsistencyDecision } from '../../src/pacing/telemetry.js';
import { applyStateTransition } from '../../src/entities/entityExtractor.js';
import {
  judgeNarration, narrateKeepingObligations, redraftBlock, certainViolations, floorViolations, trippedLines, checkClassOf,
  judgeMayAct, judgeIsAsked, TRIPWIRES, CERTAIN_CHECKS,
} from '../../src/moves/contracts/checks.js';
import { OBLIGATION_KINDS, obligationsFor } from '../../src/moves/contracts/obligations.js';
import { sceneObligations } from '../../src/factContinuity/sceneTurns.js';
import { runConsistencyCheck } from '../../src/factContinuity/consistencyCheck.js';

const MODULE_ID = 'starforged-companion';
const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const sentTo = () => apiPost.mock.calls.at(-1)[2].messages[0].content;

/** A Batch Mode round's two refusals: two [premise] lines, the second the one it might break. */
const refused = (code, claim, never, why) => ({ moveId: 'x', code, hard: false, why, premise: { claim, never }, offer: null });
const TWO_PREMISES = [
  ...obligationsFor({ mode: 'round-entry', refusal: refused('recoverable-health', 'a wound to treat', 'a cut, a gash, blood or a dressing on them',
    'nothing to heal: Mira Kestrel\'s health is 5 of 5 and no wound is marked') }),
  ...obligationsFor({ mode: 'round-entry', refusal: refused('open-fight', 'a fight under way', 'a blow struck, a shot fired or a foe engaged in a fight',
    'no fight is under way') }),
].filter(o => o.kind === 'premise');
const A36 = 'You keep the medkit shut. Across the ring the cutter fires a salvo, and its shots walk up the berth toward you.\n\n*Breaking free would be a Face Danger.*';

beforeEach(() => {
  replies.length = 0;
  vi.clearAllMocks();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.factContinuity.consistencyCheck`, true);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
});

describe('D3 — verdicts by line', () => {
  it('the lines are numbered, and the judge is asked to answer by number with the narration\'s own words', async () => {
    await judgeNarration(A36, TWO_PREMISES, { apiKey: 'sk-test' });
    expect(sentTo()).toMatch(/^LINES:\n1\. \[premise\] BREACH: The narration tells a wound to treat as real \(a cut, a gash, blood or a dressing on them\)\. It is not so/);
    expect(sentTo()).toContain('\n2. [premise] BREACH: The narration tells a fight under way as real (a blow struck, a shot fired or a foe engaged in a fight). It is not so — no fight is under way.');
    expect(apiPost.mock.calls.at(-1)[2].system).toMatch(/"line":\s*<the line's number>/);
  });

  it('N1: a judge sentence is put as the breach itself, never under its NOT SO — a line with none keeps its list', async () => {
    // [dice] has no judge sentence since the measure retired it (D10): no pass is sent it.
    const dice = obligationsFor({ mode: 'paced', line: 'I hold the berth', dice: [{ subject: 'Ashen Wake', fact: 'has the better angle' }] }).find(o => o.kind === 'dice');
    expect(dice.judge).toBeUndefined();
    await judgeNarration('Her guns are open.', [TWO_PREMISES[0], dice], { apiKey: 'sk-test' });
    expect(sentTo()).not.toContain('(NOT SO)');
    expect(sentTo()).toContain('1. [premise] BREACH: ');
    expect(sentTo()).toContain(`2. [dice] NOT SO: ${dice.text}`);
    expect(apiPost.mock.calls.at(-1)[2].system).toContain('A BREACH line describes a breach: the narration breaks it when it does what the line says.');
    expect(apiPost.mock.calls.at(-1)[2].system).toContain('a thing about to happen, feared, offered or merely possible breaks nothing');
  });

  it('two lines of one kind are told apart: line 2\'s verdict is line 2\'s', async () => {
    replies.push('{"violations":[{"line":2,"quote":"the cutter fires a salvo"}]}');
    const v = await judgeNarration(A36, TWO_PREMISES, { apiKey: 'sk-test' });
    expect(v).toMatchObject({ judged: true, dropped: [] });
    expect(v.violations).toEqual([{ tag: 'premise', line: 2, quote: 'the cutter fires a salvo', text: TWO_PREMISES[1].text }]);
  });

  it('a verdict naming no line, or quoting words the judged view does not hold, is dropped and logged — never silently', async () => {
    replies.push(JSON.stringify({ violations: [
      { line: 7, quote: 'the cutter fires a salvo' },                                     // no line 7
      { tag: '[premise] a fight under way', quote: 'the cutter fires a salvo' },          // round 9's a54: a tag no line has
      { line: 1, quote: 'Breaking free would be a Face Danger' },                        // the offer line: not in the judged view
      { line: 1, quote: 'the cutter rams you' },                                         // words the narration never said
    ] }));
    // a36 was offered a move: its closing line is the rules' own (the audit's N32).
    const v = await judgeNarration(A36, TWO_PREMISES, { apiKey: 'sk-test', offer: true });
    expect(v.violations).toEqual([]);
    expect(v.dropped.map(d => d.why)).toEqual(['names no line', 'names no line', 'not in the narration', 'not in the narration']);
    expect(v.judged).toBe(true);
  });

  it('a quote is matched in the narration\'s words whatever its emphasis, quotes or spacing', async () => {
    replies.push('{"violations":[{"line":2,"quote":"The Ashen Wake’s remaining guns  still bear on you."}]}');
    const v = await judgeNarration('The *Ashen Wake*\'s remaining guns still bear on you.', TWO_PREMISES, { apiKey: 'sk-test' });
    expect(v.violations).toHaveLength(1);
  });

  it('the old answer by tag is taken only where it names exactly one line', async () => {
    replies.push('{"violations":[{"tag":"premise","quote":"the cutter fires a salvo"}]}');
    expect((await judgeNarration(A36, TWO_PREMISES, { apiKey: 'sk-test' })).dropped).toEqual([expect.objectContaining({ why: 'names no line' })]);
    replies.push('{"violations":[{"tag":"[premise]","quote":"the cutter fires a salvo"}]}');
    expect((await judgeNarration(A36, TWO_PREMISES.slice(1), { apiKey: 'sk-test' })).violations).toEqual([expect.objectContaining({ tag: 'premise', line: 1 })]);
  });
});

describe('the judge says why it did not judge', () => {
  it('N7: at its cutoff the judge\'s request is cancelled, not left to run on', async () => {
    vi.useFakeTimers();
    let signal = null;
    apiPost.mockImplementationOnce((_url, _headers, _body, opts) => { signal = opts?.signal ?? null; return new Promise(() => {}); });
    const pending = judgeNarration(A36, TWO_PREMISES, { apiKey: 'sk-test' });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toMatchObject({ judged: false, error: 'timeout' });
    expect(signal?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it('a timeout, an error, an unparsed reply and a reply cut at its cap each name their cause', async () => {
    replies.push(new Error('Anthropic API error 529: overloaded'));
    expect(await judgeNarration(A36, TWO_PREMISES, { apiKey: 'sk-test' })).toMatchObject({ judged: false, error: 'error: Anthropic API error 529: overloaded' });
    replies.push('I think it is fine.');
    expect(await judgeNarration(A36, TWO_PREMISES, { apiKey: 'sk-test' })).toMatchObject({ judged: false, error: 'unparsed' });
    replies.push('{"violations": [ {"line": 1');
    expect(await judgeNarration(A36, TWO_PREMISES, { apiKey: 'sk-test' })).toMatchObject({ judged: false, error: 'unparsed' });
    replies.push({ content: [{ type: 'text', text: '{"violations":[{"line":1,"quote":"still' }], stop_reason: 'max_tokens' });
    expect(await judgeNarration(A36, TWO_PREMISES, { apiKey: 'sk-test' })).toMatchObject({ judged: false, error: 'cut off at its token cap' });
  });
});

describe('the rows a narration\'s check writes', () => {
  const DRAFT = `Blood beads on the dressing at your wrist as the cutter fires a salvo.${SIDECAR}`;
  const ctx = {};

  it('one row a verdict, each with the draft it describes; the judge\'s summary row holds no copy of its verdicts', async () => {
    replies.push('{"violations":[{"line":1,"quote":"Blood beads on the dressing"}]}');
    const call = vi.fn(async () => DRAFT);
    const kept = await narrateKeepingObligations(call, TWO_PREMISES, { apiKey: 'sk-test', ctx });
    const judgeRows = kept.verdicts.filter(v => v.class === 'judge');
    // [premise] passed the measure, so it is asked about (D10); its verdict
    // is logged and asks for nothing again (issue #402, change 5).
    expect(judgeRows).toEqual([
      { class: 'judge', draft: 1, tripped: ['premise', 'premise'], judged: true, error: null },
      { class: 'judge', draft: 1, tag: 'premise', line: 1, quote: 'Blood beads on the dressing', action: 'logged' },
    ]);
    expect(call).toHaveBeenCalledTimes(1);
    expect(kept).toMatchObject({ raw: DRAFT, reasked: false, stillBroken: [] });
  });

  it('a dropped verdict is a row of its own, with why', async () => {
    replies.push('{"violations":[{"line":9,"quote":"x"}]}');
    const kept = await narrateKeepingObligations(async () => DRAFT, TWO_PREMISES, { apiKey: 'sk-test', ctx });
    expect(kept.verdicts).toContainEqual(expect.objectContaining({ class: 'judge', action: 'dropped', why: 'names no line', draft: 1 }));
  });

  it('a narration the X-Card stopped is not judged and writes no row', async () => {
    const onVerdict = vi.fn();
    let stopped = false;
    const call = vi.fn(async () => { stopped = true; return DRAFT; });
    const kept = await narrateKeepingObligations(call, TWO_PREMISES, { apiKey: 'sk-test', ctx, onVerdict, stopped: () => stopped });
    expect(apiPost).not.toHaveBeenCalled();
    expect(onVerdict).not.toHaveBeenCalled();
    expect(kept.raw).toBe(DRAFT);
  });

  it('a re-ask the X-Card stopped writes no row of a re-ask that never ran', async () => {
    const onVerdict = vi.fn();
    let stopped = false;
    const BAD = `It is a strong hit, and the lock gives.${SIDECAR}`;
    const call = vi.fn(async (addendum) => { if (addendum) { stopped = true; return null; } return BAD; });
    await narrateKeepingObligations(call, obligationsFor({ mode: 'move', resolution: { moveId: 'face_danger', outcome: 'strong_hit' } }),
      { apiKey: 'sk-test', onVerdict, stopped: () => stopped });
    expect(onVerdict).not.toHaveBeenCalled();
  });

  it('the redraft\'s certain and floor breaches are both counted against the draft that posts, marked draft 2', async () => {
    const BAD = `It is a strong hit, and the lock gives.${SIDECAR}`;
    const vowLines = obligationsFor({ mode: 'move', resolution: { moveId: 'face_danger', outcome: 'strong_hit' } });
    const kept = await narrateKeepingObligations(async () => BAD, [...vowLines, { kind: 'vow', list: 'TELL', text: '' }],
      { apiKey: 'sk-test', ctx: { vowName: 'Find who is raiding the Cinder lanes' } });
    expect(kept.stillBroken.map(v => [v.tag, v.class, v.draft])).toEqual([['apparatus', 'certain', 2], ['vow', 'floor', 2]]);
  });
});

describe('the audit\'s N9 and N10: which draft posts, and the one judge call on it', () => {
  const HEAL_REFUSAL = { moveId: 'heal', code: 'recoverable-health', hard: false, why: 'nothing to heal: Mira Kestrel\'s health is 5 of 5 and no wound is marked',
    premise: { claim: 'a wound to treat', never: 'a cut, a gash, blood or a dressing on them' }, offer: null };

  it('N9: a redraft that adds a certain breach the first draft did not have is not posted — the first draft is', async () => {
    const lines = [...obligationsFor({ mode: 'move', resolution: { moveId: 'face_danger', outcome: 'strong_hit' } }), { kind: 'vow', list: 'TELL', text: '' }];
    const FIRST = `She waits by the hatch.${SIDECAR}`;
    const SECOND = `It is a strong hit, and the lock gives.${SIDECAR}`;
    const call = vi.fn(async (addendum) => (addendum ? SECOND : FIRST));
    const kept = await narrateKeepingObligations(call, lines, { apiKey: 'sk-test', judge: false, ctx: { vowName: 'Find who is raiding the Cinder lanes' } });
    expect(call).toHaveBeenCalledTimes(2);
    expect(kept).toMatchObject({ raw: FIRST, reasked: true });
    expect(kept.stillBroken.map(v => [v.tag, v.class, v.draft])).toEqual([['vow', 'floor', 1]]);
    expect(kept.verdicts).toContainEqual(expect.objectContaining({ tag: 'apparatus', class: 'certain', draft: 2, action: 'redraft not posted' }));
  });

  it('N9, control: a redraft that keeps the first draft\'s certain breach still posts — the one re-ask was spent', async () => {
    const BAD = `It is a strong hit, and the lock gives.${SIDECAR}`;
    const kept = await narrateKeepingObligations(async () => BAD, obligationsFor({ mode: 'move', resolution: { moveId: 'face_danger', outcome: 'strong_hit' } }), { apiKey: 'sk-test' });
    expect(kept.stillBroken.map(v => [v.tag, v.draft])).toEqual([['apparatus', 2]]);
    expect(kept.verdicts.some(v => v.action === 'redraft not posted')).toBe(false);
  });

  it('N10: a narration the code re-asked has the draft that posts judged — once, its verdict logged, with no second re-ask', async () => {
    const lines = obligationsFor({ mode: 'paced', refusal: HEAL_REFUSAL });
    const FIRST = `It is a strong hit: the medkit opens.${SIDECAR}`;
    const SECOND = `She thumbs the medkit open and lays the binding out on the bench.${SIDECAR}`;
    replies.push('{"violations":[{"line":1,"quote":"lays the binding out on the bench"}]}');
    const call = vi.fn(async (addendum) => (addendum ? SECOND : FIRST));
    const kept = await narrateKeepingObligations(call, lines, { apiKey: 'sk-test', ctx: { refusalCode: 'recoverable-health' } });
    expect(call).toHaveBeenCalledTimes(2);
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(kept.raw).toBe(SECOND);
    expect(kept.verdicts).toContainEqual({ class: 'judge', draft: 2, tripped: ['premise'], judged: true, error: null });
    // A judge verdict acts on nothing (issue #402, change 5): it is logged, and tells the GM of nothing still broken.
    expect(kept.verdicts).toContainEqual(expect.objectContaining({ class: 'judge', draft: 2, tag: 'premise', action: 'logged' }));
    expect(kept.stillBroken.filter(v => v.class === 'judge')).toEqual([]);
  });

  it('D9: one judge call a narration — a draft the code passed is judged once, and its verdict re-asks nothing', async () => {
    const lines = obligationsFor({ mode: 'paced', refusal: HEAL_REFUSAL });
    const JUDGED = `She thumbs the medkit open and lays the binding out on the bench.${SIDECAR}`;
    replies.push('{"violations":[{"line":1,"quote":"lays the binding out on the bench"}]}');
    const kept = await narrateKeepingObligations(async () => JUDGED, lines, { apiKey: 'sk-test', ctx: { refusalCode: 'recoverable-health' } });
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(kept).toMatchObject({ raw: JUDGED, reasked: false });
  });
});

describe('a redraft with no prose', () => {
  it('keeps the first draft: a reply that is only a fact block is no narration', async () => {
    const BAD = `It is a strong hit, and the lock gives.${SIDECAR}`;
    const call = vi.fn(async (addendum) => (addendum ? SIDECAR.trim() : BAD));
    const kept = await narrateKeepingObligations(call, obligationsFor({ mode: 'move', resolution: { moveId: 'face_danger', outcome: 'strong_hit' } }), { apiKey: 'sk-test' });
    expect(call).toHaveBeenCalledTimes(2);
    expect(kept).toMatchObject({ raw: BAD, reasked: true });
    expect(kept.stillBroken.map(v => v.tag)).toEqual(['apparatus']);
  });
});

describe('the re-ask names every line broken, each in its own words', () => {
  it('two lines of one kind, each with its own words and quote', () => {
    const block = redraftBlock('Draft.', [{ tag: 'premise', line: 1, quote: 'q1', text: TWO_PREMISES[0].text }, { tag: 'premise', line: 2, quote: 'q2', text: TWO_PREMISES[1].text }], TWO_PREMISES);
    expect(block).toContain(`- [premise] ${TWO_PREMISES[0].text} (it says: "q1")`);
    expect(block).toContain(`- [premise] ${TWO_PREMISES[1].text} (it says: "q2")`);
  });

  it('two breaches of one line: both quotes', () => {
    const apparatus = obligationsFor({ mode: 'move', resolution: { moveId: 'face_danger', outcome: 'strong_hit' } });
    const told = 'It is a strong hit, and the lock gives under your hands at last. The corridor beyond is dark and full of smoke, '
      + 'and the hum of the station is a long way off now. Wits 3 is a lot of thinking for one door.';
    const found = certainViolations(told, apparatus);
    expect(found.map(v => v.tag)).toEqual(['apparatus', 'apparatus']);
    const block = redraftBlock(told, found, apparatus);
    expect(block.match(/- \[apparatus\]/g)).toHaveLength(1);
    expect(block).toMatch(/\(it says: "[^"]*strong hit[^"]*"; "[^"]*Wits 3[^"]*"\)/);
  });
});

describe('the offer line is no breach of any check — where the narration was offered a move', () => {
  // Its lines hold [offer] (checks.js offerMayBeGiven): only there is the closing line the rules' own (the audit's N32).
  const OFFER = { kind: 'offer', list: 'NOT YET', text: 'Set a Course is only offered.' };
  const OFFERED = 'Tamsin shrugs and goes back to her ledger. The berth is quiet.\n\n*Flying your skiff to Hollow Spire is a Set a Course.*';
  it('[here]: an offer to fly there moves no one', () => {
    const here = { kind: 'here', list: 'NOT SO', text: 't', here: 'Bleakhold Station', places: [{ id: 'p2', name: 'Hollow Spire' }], people: [], markers: [] };
    expect(certainViolations(OFFERED, [here, OFFER])).toEqual([]);
    // Control: the same words told as done do.
    expect(certainViolations('You fly your skiff to Hollow Spire and dock at noon.', [here, OFFER]).map(v => v.tag)).toEqual(['here']);
  });
  it('[match], [quote] and the floors read the body', () => {
    expect(certainViolations('She waits.\n\n*Seeing whether her story matches the manifest would be a Gather Information.*', [{ kind: 'match' }, OFFER])).toEqual([]);
    expect(floorViolations('She waits by the hatch.\n\n*Asking about the raiders would be Gather Information.*', [{ kind: 'vow' }, OFFER],
      { vowName: 'Find who is raiding the Cinder Expanse lanes' }).reask).toEqual([{ tag: 'vow', quote: '' }]);
  });
  it('N32: a narration offered no move closes on narration — its closing italic line is read; a bold offer line is one', () => {
    // A move narration's closing comm line, in italics: the story's, so the checks read it.
    const comm = 'The lock gives.\n\n*"A strong hit, if ever I saw one," the dockmaster says over the comm.*';
    expect(certainViolations(comm, [{ kind: 'apparatus' }]).map(v => v.tag)).toEqual(['apparatus']);
    expect(certainViolations(comm, [{ kind: 'apparatus' }, OFFER])).toEqual([]);
    // The line in bold is the offer line too, where one was offered.
    const bold = 'She waits by the hatch.\n\n**Asking about the raiders would be a Gather Information.**';
    expect(certainViolations(bold, [{ kind: 'apparatus' }, OFFER])).toEqual([]);
    expect(certainViolations(bold, [{ kind: 'apparatus' }]).map(v => v.tag)).toEqual(['apparatus']);
  });
});

describe('D4 — the class a row declares is the class the code holds it to', () => {
  const LINE_OF = {
    premise: { kind: 'premise', list: 'NOT SO', text: 'A wound to treat is not so.' },
    oracle: { kind: 'oracle', list: 'NOT SO', text: 'The answer is no.' },
    cost: { kind: 'cost', list: 'NOT YET', text: 'THE COST — health: harm' },
    price: { kind: 'price', list: 'NOT YET', text: 'THE PRICE. A shot rakes the hull.' },
    whereabouts: { kind: 'whereabouts', list: 'NOT SO', text: 't', words: ['hollow', 'spire'] },
  };
  const CTX = { refusalCode: 'recoverable-health', question: 'Is anyone left alive aboard?' };

  it('every kind the code holds to a line is declared on a row, scene lines with them', () => {
    const scene = sceneObligations({ sceneBegan: { cause: 'fight', what: 'the raiders struck', sceneId: 'sc' }, currentSceneId: 'sc', sceneFrame: { sceneId: 'sc', letGo: [{ text: 'the amber light', stems: ['amber'] }] } },
      { ship: 'Kobayashi IV docked at Bleakhold Station' });
    expect(scene.map(o => o.kind).sort()).toEqual(['letgo', 'place', 'scene']);
    for (const o of scene) expect(OBLIGATION_KINDS[o.kind], o.kind).toBeTruthy();
    // [place] was retired from both judges by the measure (D10): told to the narrator, read by no judge.
    expect(checkClassOf('place')).toBe('logged');
    expect(judgeMayAct('place', 'audit')).toBe(false);
    expect(checkClassOf('letgo')).toBe('floor');
    expect(checkClassOf('scene')).toBe('logged');
  });

  it('every judge-class kind trips on words, and has trip words of its own; no other class is sent to the judge', () => {
    const judgeClass = Object.entries(OBLIGATION_KINDS).filter(([, r]) => r.check === 'judge').map(([k]) => k).sort();
    expect(Object.keys(TRIPWIRES).sort()).toEqual(judgeClass);
    for (const kind of judgeClass) {
      const line = kind === 'foe' || kind === 'unsaid' || kind === 'fight' ? { kind, list: 'NOT SO', text: '' } : LINE_OF[kind];
      expect(line, kind).toBeTruthy();
      const words = { premise: 'cuts', oracle: 'alive', cost: 'blood', price: 'rakes', whereabouts: 'hollow', foe: 'wreck', unsaid: 'tell', fight: 'salvo' }[kind];
      expect(trippedLines(`a sentence with ${words} in it`, [line], CTX).map(o => o.kind), kind).toEqual([kind]);
    }
    // A certain or logged line whose list is NOT SO is never a judge's: [sheet], and the kinds the measure retired.
    expect(trippedLines('the antiseptic stings on the cuts', [{ kind: 'sheet', list: 'NOT SO', text: 'nothing heals' }], CTX)).toEqual([]);
    expect(trippedLines('the Ashen Wake fires from the clamps; no fight', [
      { kind: 'dice', list: 'NOT SO', text: 'What the dice decided stands — Ashen Wake: has the better angle.', words: ['ashen', 'wake'] },
      { kind: 'place', list: 'NOT SO', text: 'Kobayashi IV is docked at Bleakhold Station by the ship\'s record.' },
      { kind: 'state', list: 'NOT SO', text: 'No fight is under way.' },
    ], CTX)).toEqual([]);
  });

  it('D10: a pass is asked about a kind only where the measure passed it — and every such kind has a judge sentence; none acts', () => {
    for (const [kind, row] of Object.entries(OBLIGATION_KINDS)) {
      // The judge-class kinds are exactly the kinds the pre-post judge is asked about.
      expect(row.check === 'judge', kind).toBe(judgeIsAsked(kind, 'judge'));
      // A kind either pass may be asked about says its breach to the judge.
      if (judgeIsAsked(kind, 'judge') || judgeIsAsked(kind, 'audit')) expect(typeof row.judge, kind).toBe('function');
      // Issue #402, change 5: no verdict re-asks, and no obligation finding posts a card.
      expect(judgeMayAct(kind, 'judge') || judgeMayAct(kind, 'audit'), `${kind} acts`).toBe(false);
    }
    // [dice] and [place] passed neither: no judge reads them, so they have no judge sentence.
    for (const kind of ['dice', 'place']) {
      expect(judgeIsAsked(kind, 'judge') || judgeIsAsked(kind, 'audit'), kind).toBe(false);
      expect(OBLIGATION_KINDS[kind].judge, kind).toBeUndefined();
    }
  });

  it('every certain-class kind has a check, and every floor-class kind a floor', () => {
    const certain = Object.entries(OBLIGATION_KINDS).filter(([, r]) => r.check === 'certain').map(([k]) => k).sort();
    const floor = Object.entries(OBLIGATION_KINDS).filter(([, r]) => r.check === 'floor').map(([k]) => k).sort();
    expect(certain).toEqual(['apparatus', 'arrival', 'here', 'match', 'material', 'person', 'quote', 'sheet']);
    expect(Object.keys(CERTAIN_CHECKS).sort()).toEqual(certain);
    // [clue], [culprit] and [escalation]: a vow's plan played toward (issue #402, change 4) — logged floors.
    expect(floor).toEqual(['chosen', 'chosen-since', 'clue', 'culprit', 'escalation', 'letgo', 'vow']);
    // [chosen-since] (round play's cost chosen since the last narration) logs when no word of its meter is told.
    const pick = { who: 'Mira', labels: ['Endure Harm (-1 health)'] };
    const since = obligationsFor({ mode: 'paced', line: 'I wait', chosenSince: [pick] }).filter(o => o.kind === 'chosen-since');
    expect(since).toHaveLength(1);
    expect(floorViolations('She waits by the hatch.', since).logged).toEqual([{ tag: 'chosen-since', quote: '' }]);
    expect(floorViolations('The wound in her side throbs as she waits.', since).logged).toEqual([]);
  });
});

describe('the audit: its row says whether it ran; an obligation finding posts no card whatever its kind', () => {
  const STATE = () => ({
    currentSessionId: 'sess-1', currentSceneId: `sc-${Math.random().toString(36).slice(2, 8)}`, dismissedEntities: [],
    sceneTruths: [{ id: 'tr-1', subject: { kind: 'text', text: 'Vance' }, fact: 'walks with a limp', basis: 'player', retracted: false, sessionId: 'sess-1' }],
    sceneState: { bySubject: {} },
  });
  const lines = obligationsFor({ mode: 'move', resolution: { moveId: 'face_danger', outcome: 'weak_hit' } });

  it('a failed audit is logged as not run, with why; an unparsed reply too; a clean one as run', async () => {
    replies.push(new Error('Anthropic API error 529: overloaded'));
    await runConsistencyCheck('Vance waits.', STATE());
    expect(logConsistencyDecision.mock.calls.at(-1)[0]).toMatchObject({ audited: false, error: 'error: Anthropic API error 529: overloaded', contradictions: [] });
    replies.push('I could not decide.');
    await runConsistencyCheck('Vance waits.', STATE());
    expect(logConsistencyDecision.mock.calls.at(-1)[0]).toMatchObject({ audited: false, error: 'unparsed' });
    await runConsistencyCheck('Vance waits.', STATE());
    expect(logConsistencyDecision.mock.calls.at(-1)[0]).toMatchObject({ audited: true, error: null });
  });

  it('a finding on an obligation line labelled as a truth posts no card', async () => {
    replies.push('{"contradictions":[{"subject":"[outcome]","violated":"the weak hit\'s cost","evidence":"Vance waits","kind":"truth","confidence":"high"}]}');
    const out = await runConsistencyCheck('Vance waits.', STATE(), { obligations: lines });
    expect(out.dispatched).toBe(false);
    expect(applyStateTransition).not.toHaveBeenCalled();
  });

  it('control: a truth\'s finding still posts its card', async () => {
    replies.push('{"contradictions":[{"subject":"Vance","violated":"walks with a limp","evidence":"Vance waits","kind":"truth","confidence":"high"}]}');
    const out = await runConsistencyCheck('Vance waits.', STATE(), { obligations: lines });
    expect(out.dispatched).toBe(true);
  });
});

describe('a Batch Mode round: each line carries its own refusal and vow (the audit\'s N13)', () => {
  const refused = (code, claim) => ({ moveId: 'x', code, hard: false, why: 'no', premise: { claim, never: null }, offer: null });
  it('two refusals trip each on its own words; two fulfilments each hold their own vow', () => {
    const lines = [
      ...obligationsFor({ mode: 'round-entry', refusal: refused('recoverable-health', 'a wound to treat') }),
      ...obligationsFor({ mode: 'round-entry', refusal: refused('open-fight', 'a fight under way') }),
    ].filter(o => o.kind === 'premise');
    expect(lines.map(o => o.refusalCode)).toEqual(['recoverable-health', 'open-fight']);
    // The round's context names one refusal — the first — and each line its own.
    const ctx = { refusalCode: 'recoverable-health' };
    expect(trippedLines('Blood beads on the dressing.', lines, ctx).map(o => o.refusalCode)).toEqual(['recoverable-health']);
    expect(trippedLines('The cutter fires a salvo.', lines, ctx).map(o => o.refusalCode)).toEqual(['open-fight']);
    const vows = ['Find who is raiding the Cinder lanes', 'Bring the ledger home to Hollow Spire']
      .flatMap(v => obligationsFor({ mode: 'round-entry', resolution: { kind: 'move', moveId: 'fulfill_your_vow', outcome: 'strong_hit', moveTarget: v } }))
      .filter(o => o.kind === 'vow');
    expect(vows.map(o => o.vowName)).toEqual(['Find who is raiding the Cinder lanes', 'Bring the ledger home to Hollow Spire']);
    const told = 'The raiders\' hand is named at last.';
    expect(floorViolations(told, vows, { vowName: 'Find who is raiding the Cinder lanes' }).reask).toEqual([{ tag: 'vow', quote: '' }]);
  });
});

describe('the Consistency Check page shows what each row did (the audit\'s N5, N17, N18)', () => {
  function installPage() {
    const flags = {};
    const page = { id: 'p1', name: 'Consistency Check', getFlag: (m, k) => flags[`${m}.${k}`],
      setFlag: vi.fn(async (m, k, v) => { flags[`${m}.${k}`] = v; }), update: vi.fn(async () => {}) };
    flags[`${MODULE_ID}.consistencyCheckTelemetry`] = { entries: [] };
    const journal = { id: 'j1', name: 'Pacing Telemetry', pages: { contents: [page] }, createEmbeddedDocuments: vi.fn(async () => []) };
    const prev = game.journal.getName;
    game.journal.getName = (n) => (n === 'Pacing Telemetry' ? journal : prev(n));
    return { page, restore: () => { game.journal.getName = prev; } };
  }
  it('an audit that did not run, a check before posting by what its verdicts did, and an audit\'s held findings', async () => {
    const real = await vi.importActual('../../src/pacing/telemetry.js');
    game.user.isGM = true;
    const { page, restore } = installPage();
    try {
      await real.logConsistencyDecision({ sceneId: 'sc', prose: 'x', contradictions: [], audited: false, error: 'unparsed' });
      await real.logConsistencyDecision({ sceneId: 'sc', prose: '[obligations paced]', obligations: 'paced', contradictions: [
        { class: 'judge', judged: false, error: 'timeout', tripped: ['dice'] },
        { class: 'floor', tag: 'letgo', action: 'logged' },
      ] });
      await real.logConsistencyDecision({ sceneId: 'sc', prose: 'y', audited: true, contradictions: [{ confidence: 'high', kind: 'obligation', action: 'held' }] });
      const html = page.update.mock.calls.at(-1)[0]['text.content'];
      expect(html).toContain('not audited (unparsed)');
      expect(html).toContain('paced: 1 logged · not judged (timeout)');
      expect(html).toContain('1 high / 1 total · 1 held');
    } finally { restore(); }
  });
});
