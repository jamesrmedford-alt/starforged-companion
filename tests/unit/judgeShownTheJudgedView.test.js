/**
 * STARFORGED COMPANION
 * tests/unit/judgeShownTheJudgedView.test.js
 *
 * Issue #399, slice 1 — stop the false findings. Round 9 (the long haul's
 * ninth live round, explorations/long-haul-live-20261127-041734) was the
 * judge's first live run. Its two passes acted on eleven findings, and none
 * was right: the pre-post judge re-asked four narrations and the audit posted
 * six ◈ Narrative Review cards. Thirteen of the audit's 44 findings quoted a
 * narration's closing offer line, eleven were on lines the code had already
 * held the narration to, and a93's closing cutaway to Tamsin was carded
 * against the characters' place. Measured here with no key, over the run's
 * own recorded narrations and requests:
 *   - D1, one judged view: every narration reaches a judge with no fact block
 *     and no closing offer line. The pre-post judge, asked again on each of
 *     its nineteen recorded requests, is sent none (seven held one), and its
 *     trip words are read without it. The audit, built for each narration
 *     the run gave lines, is sent none, nor a line the code already held the
 *     narration to (D2), and a cutaway is not held to the characters' place;
 *   - D2: the [dice] sentence says the fact is what the dice decided;
 *   - D5: the review card is no narration — no `narratorCard` — and its
 *     Retract button is still wired;
 *   - D7, holding: a judge verdict re-asks nothing and an obligation finding
 *     posts no card (narrationChecks, sceneObligationChecks,
 *     lineCannotOverruleTheDice, roundAndOracleNarrationsChecked and
 *     auditObligationKind pin those).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/pacing/telemetry.js', async (importOriginal) => ({
  ...(await importOriginal()),
  logConsistencyDecision: vi.fn(async () => {}),
}));
vi.mock('../../src/system/campaignTruths.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildCampaignTruthsBlock: vi.fn(async () => ''),
}));
// The narrator's call to the audit, seen; the audit itself runs as written.
vi.mock('../../src/factContinuity/consistencyCheck.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, runConsistencyCheck: vi.fn(actual.runConsistencyCheck) };
});
vi.mock('../../src/factContinuity/correctionDialog.js', async (importOriginal) => ({
  ...(await importOriginal()),
  openCorrectionDialog: vi.fn(async () => null),
}));

import { apiPost } from '../../src/api-proxy.js';
import { judgedView, judgeNarration, trippedLines } from '../../src/moves/contracts/checks.js';
import { obligationsFor, OBLIGATION_KINDS } from '../../src/moves/contracts/obligations.js';
import { runConsistencyCheck } from '../../src/factContinuity/consistencyCheck.js';
import { openCorrectionDialog } from '../../src/factContinuity/correctionDialog.js';
import { extractSidecar } from '../../src/factContinuity/sidecarParser.js';
import { narrateSessionVignette } from '../../src/narration/narrator.js';
import { parseHTML, StubElement } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const FOLDER = path.resolve(__dirname, '../../test/ci/playwright/explorations/long-haul-live-20261127-041734');
const RUN = JSON.parse(fs.readFileSync(path.join(FOLDER, 'replay.json'), 'utf8'));
const EX = RUN.recording.exchanges;
const replyOf = (x) => x.response.content.map(c => c.text ?? '').join('');
const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });

/** Every narration the run recorded that a judge reads: a beat's, a set-piece's, an oracle's, an @scene answer. */
const NARRATIONS = EX.filter(x => /^callNarratorAPI>(narratePacedInput|narrateResolution|narrateSessionVignette|narrateOracleFollowup|interrogateScene)$/.test(x.kind));

/** A narration's closing offer line — the rules' own, the one place a move may be named (checks.js bodyOf). */
const OFFER_LINE = /\s*[*_][^*_\n]{3,}[*_]\s*$/;
const offerLineOf = (text) => OFFER_LINE.exec(extractSidecar(text).prose ?? text)?.[0].trim() ?? null;

/** The lines a narrator request was given (formatObligationsBlock), read back: `{ kind, list, text }`. */
function linesOf(user) {
  const at = String(user ?? '').indexOf('WHAT THIS NARRATION MUST TELL, AND MUST NOT');
  if (at < 0) return [];
  const out = [];
  let list = null;
  for (const row of user.slice(at).split('\n').slice(1)) {
    const head = /^(TELL|NOT YET|NOT SO) — /.exec(row);
    if (head) { list = head[1]; continue; }
    const line = /^- \[([a-z-]+)\] (.+)$/.exec(row);
    if (line && list) { out.push({ kind: line[1], list, text: line[2] }); continue; }
    if (row.trim()) break;
  }
  return out;
}

/** The pre-post judge's recorded requests: its tripped lines and the narration it was sent. */
const JUDGED = EX.filter(x => x.kind.startsWith('judgeNarration>')).map((x) => {
  const [head, told] = x.user.split('\n\nNARRATION:\n');
  return {
    step: x.step,
    narration: /^"""([\s\S]*)"""$/.exec(told)[1],
    lines: [...head.matchAll(/^- \[([a-z-]+)\] \(([A-Z ]+)\) (.*)$/gm)].map(m => ({ kind: m[1], list: m[2], text: m[3] })),
  };
});

const CERTAIN = Object.entries(OBLIGATION_KINDS).filter(([, k]) => k.check === 'certain').map(([kind]) => kind);

/** A scene with a truth that binds — the audit runs only when the ledger holds something. */
const sceneState = (over = {}) => ({
  currentSessionId: 'sess-4', sessionNumber: 4, currentSceneId: 'sc-4', dismissedEntities: [],
  sceneTruths: [{ id: 'tr-ledger01', subject: { kind: 'text', text: 'Tamsin Okoro' }, fact: 'keeps a ledger stall on the Hollow Spire docks',
    sessionId: 'sess-4', sceneId: 'sc-4', asserter: 'narrator', basis: 'player', retracted: false, correctedTo: null, createdAt: 1 }],
  sceneState: { bySubject: {}, sceneId: 'sc-4' },
  ...over,
});
const auditCalls = () => apiPost.mock.calls.filter(c => c[3]?.label === 'consistencyCheck');
const auditPrompt = () => auditCalls().at(-1)?.[2]?.system ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.factContinuity.consistencyCheck`, true);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  apiPost.mockImplementation(async (_url, _headers, _body, opts) => {
    if (opts?.label === 'consistencyCheck') return reply('{"contradictions":[]}');
    if (opts?.label === 'obligationJudge') return reply('{"violations":[]}');
    throw new Error(`unexpected call ${opts?.label}`);
  });
});

describe('D1 — the one judged view', () => {
  it('is the narration without its fact block and its closing offer line, and nothing else; and says whether it is a cutaway', () => {
    const raw = 'The clerk has backed against a berth lamp.\n\n*Meeting her fire in the berth would be an Enter the Fray.*\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    expect(judgedView(raw)).toEqual({ text: 'The clerk has backed against a berth lamp.', cutaway: false });
    expect(judgedView('The lounge is empty.', { kind: 'cutaway' })).toEqual({ text: 'The lounge is empty.', cutaway: true });
    expect(judgedView('She *does* answer.', { kind: 'session_vignette' })).toMatchObject({ text: 'She *does* answer.', cutaway: false });
    expect(judgedView(null).text).toBe('');
  });

  it('round 9\'s every narration reaches a judge with no fact block and no offer line — twenty of its 86 ended on one', () => {
    expect(NARRATIONS).toHaveLength(86);
    const offered = NARRATIONS.filter(x => offerLineOf(replyOf(x)));
    expect(offered.map(x => x.step)).toEqual(['a5', 'a12', 'a13', 'a29', 'a29', 'a57', 'a60', 'a62', 'a64', 'a66', 'a66', 'a68',
      'a70', 'a70', 'a72', 'a74', 'a76', 'a77', 'a79', 'a81']);
    for (const x of NARRATIONS) {
      const raw = replyOf(x);
      const prose = (extractSidecar(raw).prose ?? raw).trim();
      const { text } = judgedView(raw);
      expect(text, x.step).not.toMatch(/```|"newTruths"|"sceneFrame"/);
      expect(offerLineOf(text), x.step).toBeNull();
      const offer = offerLineOf(raw);
      // The rest is the narration as told: only the offer line is taken off.
      expect(text, x.step).toBe(offer ? prose.slice(0, prose.lastIndexOf(offer)).trim() : prose);
    }
  });
});

describe('the pre-post judge is sent the judged view (D1)', () => {
  it('asked again on each of round 9\'s nineteen requests, it is sent no closing offer line — seven held one', async () => {
    expect(JUDGED).toHaveLength(19);
    expect(JUDGED.filter(j => offerLineOf(j.narration)).map(j => j.step)).toEqual(['a29', 'a60', 'a70', 'a72', 'a74', 'a76', 'a77']);
    for (const j of JUDGED) {
      apiPost.mockClear();
      await judgeNarration(j.narration, j.lines, { apiKey: 'sk-test' });
      const sent = apiPost.mock.calls[0][2].messages[0].content;
      const told = /NARRATION:\n"""([\s\S]*)"""$/.exec(sent)[1];
      expect(offerLineOf(told), j.step).toBeNull();
      const offer = offerLineOf(j.narration);
      if (offer) expect(sent, j.step).not.toContain(offer);
      expect(told, j.step).toBe(judgedView(j.narration).text);
    }
  });

  it('a29: its three lines were tripped by the offer line\'s "fire" alone — read in the judged view, none trips and no judge is called', () => {
    // a29's narration offered Enter the Fray to a line refused for "no fight is under way".
    const a29 = JUDGED.find(j => j.step === 'a29');
    const ctx = { refusalCode: 'open-fight', offer: 'enter_the_fray' };
    expect(offerLineOf(a29.narration)).toBe('*Meeting her fire in the berth would be an Enter the Fray.*');
    expect(trippedLines(a29.narration, a29.lines, ctx).map(o => o.kind)).toEqual(['premise', 'offer', 'state']);
    expect(trippedLines(judgedView(a29.narration).text, a29.lines, ctx)).toEqual([]);
  });

  it('a70: Tamsin\'s own "A bond" still trips [offer], so the judge is asked — but not shown the offer line its verdict quoted', async () => {
    const a70 = JUDGED.find(j => j.step === 'a70');
    const verdict = JSON.parse(replyOf(EX.find(x => x.step === 'a70' && x.kind.startsWith('judgeNarration>'))));
    expect(verdict.violations).toEqual([{ tag: 'offer', quote: '*Binding her to you for good would be a Forge a Bond.*' }]);
    const offer = a70.lines.filter(o => o.kind === 'offer');
    expect(trippedLines(judgedView(a70.narration).text, offer, { offer: 'forge_a_bond' }).map(o => o.kind)).toEqual(['offer']);
    await judgeNarration(a70.narration, offer, { apiKey: 'sk-test' });
    expect(apiPost.mock.calls.at(-1)[2].messages[0].content).not.toContain('Binding her to you for good');
  });
});

describe('D2 — the [dice] sentence, written for the judge', () => {
  // Slice 3 (the audit's N1): written as the breach, and put to the judge as a BREACH, never under NOT SO.
  it('a34\'s line as the judge reads it now: the breach is saying the opposite of what the dice decided', async () => {
    const a34 = JUDGED.find(j => j.step === 'a34');
    const recorded = a34.lines.find(o => o.kind === 'dice').text;
    // As round 9 sent it — the fact after the dash read as the thing denied (a34, a36, a54).
    const [, subject, fact] = /^The narration tells as true something this result of the dice denies — ([^:]+): (.+)\.$/.exec(recorded);
    expect([subject, fact]).toEqual(['Ashen Wake', 'has the better angle on the Kobayashi IV, which is pinned by the docking clamps']);
    const lines = obligationsFor({ mode: 'paced', line: 'I hold the line', dice: [{ subject, fact, words: ['ashen', 'wake'] }] });
    const dice = lines.find(o => o.kind === 'dice');
    expect(dice.judge).toBe('The narration says the opposite of what the dice decided. The dice decided: Ashen Wake — has the better angle '
      + 'on the Kobayashi IV, which is pinned by the docking clamps. A narration that tells this as so, or does not mention it, breaks nothing.');
    await judgeNarration(a34.narration, [dice], { apiKey: 'sk-test' });
    const sent = apiPost.mock.calls.at(-1)[2].messages[0].content;
    expect(sent).toContain(`1. [dice] BREACH: ${dice.judge}`);
    expect(sent).not.toContain('(NOT SO)');
    expect(sent).not.toContain('denies');
  });
});

describe('the audit is sent the judged view, and no line the code already held the narration to (D1, D2)', () => {
  it('built for each narration round 9 gave lines: no closing offer line, no certain-class line; every other line, in its judge words', async () => {
    const given = NARRATIONS.filter(x => linesOf(x.user).length);
    expect(given.length).toBe(58);
    // Round 9's eleven audit findings on code-checked lines were on these.
    expect(CERTAIN).toEqual(expect.arrayContaining(['apparatus', 'person', 'here', 'arrival']));
    let certainGiven = 0;
    for (const x of given) {
      apiPost.mockClear();
      const lines = linesOf(x.user);
      certainGiven += lines.filter(o => CERTAIN.includes(o.kind)).length;
      await runConsistencyCheck(replyOf(x), sceneState(), { obligations: lines });
      const system = auditPrompt();
      expect(system, x.step).toContain(judgedView(replyOf(x)).text);
      const offer = offerLineOf(replyOf(x));
      if (offer) expect(system, x.step).not.toContain(offer);
      for (const kind of CERTAIN) expect(system, `${x.step} [${kind}]`).not.toContain(`[${kind}]`);
      for (const o of lines.filter(l => !CERTAIN.includes(l.kind))) expect(system, `${x.step} [${o.kind}]`).toContain(`${o.list} [${o.kind}] ${o.text.trim()}`);
    }
    expect(certainGiven).toBeGreaterThan(50);
  });

  it('a line with a judge sentence is sent the audit in it, not in the narrator\'s instruction', async () => {
    const lines = obligationsFor({ mode: 'paced', line: 'I hold the line', dice: [{ subject: 'Ashen Wake', fact: 'has the better angle', words: ['ashen', 'wake'] }] });
    const dice = lines.find(o => o.kind === 'dice');
    await runConsistencyCheck('The Ashen Wake holds off.', sceneState(), { obligations: lines });
    expect(auditPrompt()).toMatch(new RegExp(`\\d+\\. BREACH \\[dice\\] ${dice.judge.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(auditPrompt()).not.toContain(dice.text);
  });
});

describe('a cutaway is not held to the characters\' place (D1) — a93, the session-closing cutaway to Tamsin', () => {
  const A93 = NARRATIONS.find(x => x.step === 'a93' && /narrateSessionVignette/.test(x.kind));
  const placeLine = "Place:    Bleakhold Station — where the characters are, by the table's record";

  beforeEach(() => {
    game.actors._reset();
    game.actors._set('set-bleak', makeTestActor({ id: 'set-bleak', name: 'Bleakhold Station', type: 'location',
      flags: { [MODULE_ID]: { settlement: { name: 'Bleakhold Station' } } } }));
  });
  afterEach(() => game.actors._reset());

  it('its audit is sent no place line; an ordinary narration\'s still is', async () => {
    expect(A93.user).toMatch(/^CLOSING VIGNETTE/);
    expect(replyOf(A93)).toMatch(/^The observation lounge at Hollow Spire/);
    await runConsistencyCheck(replyOf(A93), sceneState({ currentLocationId: 'set-bleak' }), { narrationKind: 'cutaway' });
    expect(auditPrompt()).not.toContain(placeLine);
    expect(auditPrompt()).toMatch(/THE PLACE \([^)]*\):\n\(none\)/);
    expect(auditPrompt()).toContain('Tamsin Okoro — keeps a ledger stall on the Hollow Spire docks');

    apiPost.mockClear();
    await runConsistencyCheck(replyOf(A93), sceneState({ currentLocationId: 'set-bleak' }), { narrationKind: 'session_vignette' });
    expect(auditPrompt()).toContain(placeLine);
  });

  it('with nothing but the place to hold it to, a cutaway is not audited at all', async () => {
    const out = await runConsistencyCheck(replyOf(A93), sceneState({ currentLocationId: 'set-bleak', sceneTruths: [] }), { narrationKind: 'cutaway' });
    expect(out).toEqual({ contradictions: [], dispatched: false });
    expect(auditCalls()).toHaveLength(0);
    await runConsistencyCheck(replyOf(A93), sceneState({ currentLocationId: 'set-bleak', sceneTruths: [] }), {});
    expect(auditCalls()).toHaveLength(1);
  });

  it('the narrator tells the audit a closing or a spotlight is a cutaway, and an opening is not', async () => {
    global.game.messages = { contents: [] };
    global.game.user = { id: 'gm-1', isGM: true };
    global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
    game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
    apiPost.mockImplementation(async (_url, _headers, _body, opts) => (opts?.label === 'consistencyCheck'
      ? reply('{"contradictions":[]}') : reply(replyOf(A93))));
    const told = [];
    for (const userMessage of ['CLOSING VIGNETTE — end-session cutaway.', 'SPOTLIGHT VIGNETTE — begin-session.', 'OPENING VIGNETTE — begin-session.']) {
      runConsistencyCheck.mockClear();
      game.settings._store.set(`${MODULE_ID}.campaignState`, sceneState({ currentLocationId: 'set-bleak' }));
      const text = await narrateSessionVignette({ userMessage, campaignState: game.settings.get(MODULE_ID, 'campaignState') });
      expect(text, userMessage).toMatch(/^The observation lounge at Hollow Spire/);
      expect(runConsistencyCheck, userMessage).toHaveBeenCalledTimes(1);
      told.push(runConsistencyCheck.mock.calls[0][2].narrationKind);
    }
    expect(told).toEqual(['cutaway', 'cutaway', null]);
  });
});

describe('D5 — the review card is not a narration', () => {
  const VANCE = { id: 'tr-limp0001', subject: { kind: 'text', text: 'Vance' }, fact: 'walks with a limp',
    sessionId: 'sess-4', sceneId: 'sc-4', asserter: 'narrator', basis: 'player', retracted: false, correctedTo: null, createdAt: 1 };
  let hadHTMLElement;
  beforeEach(() => { hadHTMLElement = globalThis.HTMLElement; globalThis.HTMLElement = StubElement; });
  afterEach(() => { globalThis.HTMLElement = hadHTMLElement; });

  async function postReviewCard() {
    apiPost.mockImplementation(async () => reply(JSON.stringify({ contradictions: [
      { subject: 'Vance', violated: 'walks with a limp', evidence: 'Vance sprints across the hangar', kind: 'truth', confidence: 'high' },
    ] })));
    // A scene of its own each time: one card per scene, subject and fact (the audit's dedup).
    const sceneId = `sc-review-${ChatMessage._created.length}-${Math.random().toString(36).slice(2, 8)}`;
    const { dispatched } = await runConsistencyCheck('Vance sprints across the hangar.',
      sceneState({ currentSceneId: sceneId, sceneTruths: [{ ...VANCE, sceneId }], sceneState: { bySubject: {}, sceneId } }));
    expect(dispatched).toBe(true);
    return ChatMessage._created.at(-1);
  }

  it('it carries factContinuityReview and no narratorCard — round 9\'s runner counted each as a second narration of its line', async () => {
    const card = await postReviewCard();
    expect(card.content).toContain('◈ Narrative Review');
    expect(card.flags[MODULE_ID]).toMatchObject({ worldJournalContradiction: true, factContinuityReview: true });
    expect(card.flags[MODULE_ID]).not.toHaveProperty('narratorCard');
  });

  it('its Retract button still opens the correction dialog: the hook reads factContinuityReview', async () => {
    await import('../../src/index.js');
    const card = await postReviewCard();
    const root = parseHTML(card.content);
    Hooks.call('renderChatMessageHTML', card, root);
    root.querySelector('[data-action="openCorrectionDialog"]').click();
    expect(openCorrectionDialog).toHaveBeenCalledWith(card);
  });
});
