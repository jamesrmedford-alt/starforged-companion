/**
 * STARFORGED COMPANION
 * tests/unit/judgeVerdictsByLine.test.js
 *
 * Issue #399, slice 3 — verdicts by line (D3), the classes declared once
 * (D4), and the bug audit's findings that belong with them (slice 2's list on
 * the issue):
 *   - D3: the judge's lines are numbered and it answers by number. Two [dice]
 *     lines are told apart. A verdict naming no line, or quoting words the
 *     judged view does not hold — the offer line among them — is dropped and
 *     logged, never silently.
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
} from '../../src/moves/contracts/checks.js';
import { OBLIGATION_KINDS, obligationsFor } from '../../src/moves/contracts/obligations.js';
import { sceneObligations } from '../../src/factContinuity/sceneTurns.js';
import { runConsistencyCheck } from '../../src/factContinuity/consistencyCheck.js';

const MODULE_ID = 'starforged-companion';
const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const sentTo = () => apiPost.mock.calls.at(-1)[2].messages[0].content;

/** Round 9's a36: two [dice] lines, the second the one it might break. */
const TWO_DICE = obligationsFor({ mode: 'paced', line: 'I hold the berth', dice: [
  { subject: 'Ashen Wake', fact: 'has the better angle on the Kobayashi IV', words: ['ashen', 'wake'] },
  { subject: 'Ashen Wake', fact: 'her guns are silent', words: ['ashen', 'wake'] },
] }).filter(o => o.kind === 'dice');
const A36 = 'Her fire thins across your pinned hull. The Ashen Wake\'s remaining guns still bear on you.\n\n*Breaking free would be a Face Danger.*';

beforeEach(() => {
  replies.length = 0;
  vi.clearAllMocks();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.factContinuity.consistencyCheck`, true);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
});

describe('D3 — verdicts by line', () => {
  it('the lines are numbered, and the judge is asked to answer by number with the narration\'s own words', async () => {
    await judgeNarration(A36, TWO_DICE, { apiKey: 'sk-test' });
    expect(sentTo()).toMatch(/^LINES:\n1\. \[dice\] BREACH: The narration says the opposite of what the dice decided\. The dice decided: Ashen Wake — has the better angle/);
    expect(sentTo()).toContain('\n2. [dice] BREACH: The narration says the opposite of what the dice decided. The dice decided: Ashen Wake — her guns are silent.');
    expect(apiPost.mock.calls.at(-1)[2].system).toMatch(/"line":\s*<the line's number>/);
  });

  it('N1: a judge sentence is put as the breach itself, never under its NOT SO — a line with none keeps its list', async () => {
    const offer = obligationsFor({ mode: 'paced', offer: 'enter_the_fray', line: 'I wait' }).find(o => o.kind === 'offer');
    await judgeNarration('Her guns are open.', [TWO_DICE[0], offer], { apiKey: 'sk-test' });
    expect(sentTo()).not.toContain('(NOT SO)');
    expect(sentTo()).toContain(`2. [offer] NOT YET: ${offer.text}`);
    expect(apiPost.mock.calls.at(-1)[2].system).toContain('A BREACH line describes a breach: the narration breaks it when it does what the line says.');
    expect(apiPost.mock.calls.at(-1)[2].system).toContain('a thing about to happen, feared, offered or merely possible breaks nothing');
  });

  it('two [dice] lines are told apart: line 2\'s verdict is line 2\'s', async () => {
    replies.push('{"violations":[{"line":2,"quote":"remaining guns still bear on you"}]}');
    const v = await judgeNarration(A36, TWO_DICE, { apiKey: 'sk-test' });
    expect(v).toMatchObject({ judged: true, dropped: [] });
    expect(v.violations).toEqual([{ tag: 'dice', line: 2, quote: 'remaining guns still bear on you', text: TWO_DICE[1].text }]);
  });

  it('a verdict naming no line, or quoting words the judged view does not hold, is dropped and logged — never silently', async () => {
    replies.push(JSON.stringify({ violations: [
      { line: 7, quote: 'still bear on you' },                                          // no line 7
      { tag: '[dice] Cinder Wren: has at least one survivor', quote: 'still bear on you' }, // round 9's a54: a tag no line has
      { line: 1, quote: 'Breaking free would be a Face Danger' },                        // the offer line: not in the judged view
      { line: 1, quote: 'the cutter rams you' },                                         // words the narration never said
    ] }));
    const v = await judgeNarration(A36, TWO_DICE, { apiKey: 'sk-test' });
    expect(v.violations).toEqual([]);
    expect(v.dropped.map(d => d.why)).toEqual(['names no line', 'names no line', 'not in the narration', 'not in the narration']);
    expect(v.judged).toBe(true);
  });

  it('a quote is matched in the narration\'s words whatever its emphasis, quotes or spacing', async () => {
    replies.push('{"violations":[{"line":1,"quote":"The Ashen Wake’s remaining guns  still bear on you."}]}');
    const v = await judgeNarration('The *Ashen Wake*\'s remaining guns still bear on you.', TWO_DICE, { apiKey: 'sk-test' });
    expect(v.violations).toHaveLength(1);
  });

  it('the old answer by tag is taken only where it names exactly one line', async () => {
    replies.push('{"violations":[{"tag":"dice","quote":"still bear on you"}]}');
    expect((await judgeNarration(A36, TWO_DICE, { apiKey: 'sk-test' })).dropped).toEqual([expect.objectContaining({ why: 'names no line' })]);
    replies.push('{"violations":[{"tag":"[dice]","quote":"still bear on you"}]}');
    expect((await judgeNarration(A36, TWO_DICE.slice(0, 1), { apiKey: 'sk-test' })).violations).toEqual([expect.objectContaining({ tag: 'dice', line: 1 })]);
  });
});

describe('the judge says why it did not judge', () => {
  it('a timeout, an error, an unparsed reply and a reply cut at its cap each name their cause', async () => {
    replies.push(new Error('Anthropic API error 529: overloaded'));
    expect(await judgeNarration(A36, TWO_DICE, { apiKey: 'sk-test' })).toMatchObject({ judged: false, error: 'error: Anthropic API error 529: overloaded' });
    replies.push('I think it is fine.');
    expect(await judgeNarration(A36, TWO_DICE, { apiKey: 'sk-test' })).toMatchObject({ judged: false, error: 'unparsed' });
    replies.push('{"violations": [ {"line": 1');
    expect(await judgeNarration(A36, TWO_DICE, { apiKey: 'sk-test' })).toMatchObject({ judged: false, error: 'unparsed' });
    replies.push({ content: [{ type: 'text', text: '{"violations":[{"line":1,"quote":"still' }], stop_reason: 'max_tokens' });
    expect(await judgeNarration(A36, TWO_DICE, { apiKey: 'sk-test' })).toMatchObject({ judged: false, error: 'cut off at its token cap' });
  });
});

describe('the rows a narration\'s check writes', () => {
  const DRAFT = `The Ashen Wake's remaining guns still bear on you.${SIDECAR}`;
  const ctx = {};

  it('one row a verdict, each with the draft it describes; the judge\'s summary row holds no copy of its verdicts', async () => {
    replies.push('{"violations":[{"line":1,"quote":"remaining guns still bear on you"}]}');
    const kept = await narrateKeepingObligations(async () => DRAFT, TWO_DICE, { apiKey: 'sk-test', ctx });
    const judgeRows = kept.verdicts.filter(v => v.class === 'judge');
    expect(judgeRows).toEqual([
      { class: 'judge', draft: 1, tripped: ['dice', 'dice'], judged: true, error: null },
      { class: 'judge', draft: 1, tag: 'dice', line: 1, quote: 'remaining guns still bear on you', action: 'logged' },
    ]);
  });

  it('a dropped verdict is a row of its own, with why', async () => {
    replies.push('{"violations":[{"line":9,"quote":"x"}]}');
    const kept = await narrateKeepingObligations(async () => DRAFT, TWO_DICE, { apiKey: 'sk-test', ctx });
    expect(kept.verdicts).toContainEqual(expect.objectContaining({ class: 'judge', action: 'dropped', why: 'names no line', draft: 1 }));
  });

  it('a narration the X-Card stopped is not judged and writes no row', async () => {
    const onVerdict = vi.fn();
    let stopped = false;
    const call = vi.fn(async () => { stopped = true; return DRAFT; });
    const kept = await narrateKeepingObligations(call, TWO_DICE, { apiKey: 'sk-test', ctx, onVerdict, stopped: () => stopped });
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
  it('two [dice] lines, each with its own fact and quote', () => {
    const block = redraftBlock('Draft.', [{ tag: 'dice', line: 1, quote: 'q1', text: TWO_DICE[0].text }, { tag: 'dice', line: 2, quote: 'q2', text: TWO_DICE[1].text }], TWO_DICE);
    expect(block).toContain(`- [dice] ${TWO_DICE[0].text} (it says: "q1")`);
    expect(block).toContain(`- [dice] ${TWO_DICE[1].text} (it says: "q2")`);
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

describe('the offer line is no breach of any check', () => {
  const OFFERED = 'Tamsin shrugs and goes back to her ledger. The berth is quiet.\n\n*Flying your skiff to Hollow Spire is a Set a Course.*';
  it('[here]: an offer to fly there moves no one', () => {
    const here = { kind: 'here', list: 'NOT SO', text: 't', here: 'Bleakhold Station', places: [{ id: 'p2', name: 'Hollow Spire' }], people: [], markers: [] };
    expect(certainViolations(OFFERED, [here])).toEqual([]);
    // Control: the same words told as done do.
    expect(certainViolations('You fly your skiff to Hollow Spire and dock at noon.', [here]).map(v => v.tag)).toEqual(['here']);
  });
  it('[match], [quote] and the floors read the body', () => {
    expect(certainViolations('She waits.\n\n*Seeing whether her story matches the manifest would be a Gather Information.*', [{ kind: 'match' }])).toEqual([]);
    expect(floorViolations('She waits by the hatch.\n\n*Asking about the raiders would be Gather Information.*', [{ kind: 'vow' }],
      { vowName: 'Find who is raiding the Cinder Expanse lanes' }).reask).toEqual([{ tag: 'vow', quote: '' }]);
  });
});

describe('D4 — the class a row declares is the class the code holds it to', () => {
  const LINE_OF = {
    premise: { kind: 'premise', list: 'NOT SO', text: 'A wound to treat is not so.' },
    offer: { kind: 'offer', list: 'NOT YET', text: 'Heal is only offered.' },
    oracle: { kind: 'oracle', list: 'NOT SO', text: 'The answer is no.' },
    cost: { kind: 'cost', list: 'NOT YET', text: 'THE COST — health: harm' },
    price: { kind: 'price', list: 'NOT YET', text: 'THE PRICE. A shot rakes the hull.' },
    state: { kind: 'state', list: 'NOT SO', text: 'No fight is under way.' },
    dice: { ...TWO_DICE[0] },
    whereabouts: { kind: 'whereabouts', list: 'NOT SO', text: 't', words: ['hollow', 'spire'] },
  };
  const CTX = { refusalCode: 'recoverable-health', offer: 'heal', question: 'Is anyone left alive aboard?' };

  it('every kind the code holds to a line is declared on a row, scene lines with them', () => {
    const scene = sceneObligations({ sceneBegan: { cause: 'fight', what: 'the raiders struck', sceneId: 'sc' }, currentSceneId: 'sc', sceneFrame: { sceneId: 'sc', letGo: [{ text: 'the amber light', stems: ['amber'] }] } },
      { ship: 'Kobayashi IV docked at Bleakhold Station' });
    expect(scene.map(o => o.kind).sort()).toEqual(['letgo', 'place', 'scene']);
    for (const o of scene) expect(OBLIGATION_KINDS[o.kind], o.kind).toBeTruthy();
    expect(checkClassOf('place')).toBe('judge');
    expect(checkClassOf('letgo')).toBe('floor');
    expect(checkClassOf('scene')).toBe('logged');
  });

  it('every judge-class kind trips on words; no other class is sent to the judge', () => {
    for (const [kind, row] of Object.entries(OBLIGATION_KINDS)) {
      if (row.check !== 'judge') continue;
      const line = kind === 'place' ? sceneObligations({ sceneBegan: { cause: 'fight', what: 'the raiders struck', sceneId: 'sc' }, currentSceneId: 'sc' }, { ship: 'Kobayashi IV docked at Bleakhold Station' }).find(o => o.kind === 'place')
        : kind === 'foe' || kind === 'unsaid' || kind === 'fight' ? { kind, list: 'NOT SO', text: '' } : LINE_OF[kind];
      expect(line, kind).toBeTruthy();
      const words = { premise: 'cuts', offer: 'wound', oracle: 'alive', cost: 'blood', price: 'rakes', state: 'fire', dice: 'ashen', whereabouts: 'hollow',
        place: 'docked', foe: 'wreck', unsaid: 'tell', fight: 'salvo' }[kind];
      expect(trippedLines(`a sentence with ${words} in it`, [line], CTX).map(o => o.kind), kind).toEqual([kind]);
    }
    // A certain or logged line whose list is NOT SO is never a judge's.
    expect(trippedLines('the antiseptic stings on the cuts', [{ kind: 'sheet', list: 'NOT SO', text: 'nothing heals' }], CTX)).toEqual([]);
  });

  it('every certain-class kind has a check, and every floor-class kind a floor', () => {
    const certain = Object.entries(OBLIGATION_KINDS).filter(([, r]) => r.check === 'certain').map(([k]) => k).sort();
    const floor = Object.entries(OBLIGATION_KINDS).filter(([, r]) => r.check === 'floor').map(([k]) => k).sort();
    expect(certain).toEqual(['apparatus', 'arrival', 'here', 'match', 'material', 'person', 'quote']);
    expect(floor).toEqual(['chosen', 'chosen-since', 'letgo', 'vow']);
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
