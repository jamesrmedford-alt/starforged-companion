/**
 * STARFORGED COMPANION
 * tests/unit/judgeOnlyLogs.test.js
 *
 * Issue #402, change 5 (the maintainer's call: "execute issue 402"; decision
 * D5, which amends #399's D7 and D10): the judge only logs. Over rounds 9
 * and 10 the two passes acted on 13 findings and none was right. Round 10's
 * one re-ask took Okoro's line for the character's ([unsaid], a77), and its
 * redraft posted a note about the draft to the table; its one review card
 * held an `@scene` answer that looked back to where the characters are
 * (a49). Now:
 *   - a judge verdict asks for nothing again, and an obligation finding posts
 *     no card — each is asked for and logged (checks.js JUDGE_KINDS_ASKED,
 *     JUDGE_KINDS_THAT_ACT);
 *   - the audit's place check is not asked of a scene question's answer, as
 *     it is not of a cutaway, and a place finding with no place given is
 *     dropped;
 *   - the code's checks keep their re-ask; the re-ask block ends "Reply with
 *     the narration alone", and a certain check reads a narration for talk of
 *     its drafting — of the kept runs' narrations it flags round 10's a77
 *     redraft and round 8's a17 opening, and no other.
 * Read from the kept runs' recorded calls.
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

import { apiPost } from '../../src/api-proxy.js';
import { narrateKeepingObligations, certainViolations, redraftBlock, judgeMayAct, judgeIsAsked, judgedView, CERTAIN_CHECKS } from '../../src/moves/contracts/checks.js';
import { OBLIGATION_KINDS } from '../../src/moves/contracts/obligations.js';
import { runConsistencyCheck } from '../../src/factContinuity/consistencyCheck.js';
import { extractSidecar } from '../../src/factContinuity/sidecarParser.js';
import { interrogateScene } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const runOf = (folder) => JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'explorations', folder, 'replay.json'), 'utf8'));
const R10 = runOf('long-haul-live-20261127-202557');
const R8 = runOf('long-haul-live-20261126-184225');
const replyOf = (x) => x.response.content.map(c => c.text ?? '').join('');
const of = (run, step, kind) => run.recording.exchanges.filter(x => x.step === step && kind.test(x.kind));
const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });
const DRAFTING = 'the narration speaks of its own drafting: tell the story alone';

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

const auditCalls = () => apiPost.mock.calls.filter(c => c[3]?.label === 'consistencyCheck');
const auditPrompt = () => auditCalls().at(-1)?.[2]?.system ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.factContinuity.consistencyCheck`, true);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
});

describe('no judge verdict acts (D5): each pass is asked about the measure\'s kinds, and logs', () => {
  it('no kind acts in either pass; the kinds asked are the measure\'s, and the judge-class kinds are the judge\'s', () => {
    for (const kind of Object.keys(OBLIGATION_KINDS)) {
      expect(judgeMayAct(kind, 'judge') || judgeMayAct(kind, 'audit'), kind).toBe(false);
      expect(OBLIGATION_KINDS[kind].check === 'judge', kind).toBe(judgeIsAsked(kind, 'judge'));
    }
    for (const kind of ['unsaid', 'whereabouts', 'premise']) expect(judgeIsAsked(kind, 'judge'), kind).toBe(true);
    for (const kind of ['cost', 'offer', 'state']) expect(judgeIsAsked(kind, 'audit'), kind).toBe(true);
  });

  it('round 10\'s a77: the verdict on Okoro\'s line is logged, and the first draft — which was right — posts', async () => {
    const [first, second] = of(R10, 'a77', /^callNarratorAPI>narrateResolution$/);
    const verdict = replyOf(of(R10, 'a77', /^judgeNarration>/)[0]);
    expect(verdict).toBe('{"violations":[{"line":1,"quote":"\\"Hold the line,\\" she says at last."}]}');
    apiPost.mockImplementation(async (_url, _headers, _body, opts) => {
      if (opts?.label === 'obligationJudge') return reply(verdict);
      throw new Error(`unexpected call ${opts?.label}`);
    });
    const lines = linesOf(first.user);
    expect(lines.map(o => o.kind)).toEqual(expect.arrayContaining(['unsaid', 'whereabouts']));
    const call = vi.fn(async (addendum) => (addendum ? replyOf(second) : replyOf(first)));
    const kept = await narrateKeepingObligations(call, lines, { apiKey: 'sk-ant-test' });
    expect(apiPost.mock.calls.filter(c => c[3]?.label === 'obligationJudge')).toHaveLength(1);
    expect(call).toHaveBeenCalledTimes(1);
    expect(kept).toMatchObject({ raw: replyOf(first), reasked: false, stillBroken: [] });
    expect(kept.verdicts).toContainEqual(expect.objectContaining({ class: 'judge', tag: 'unsaid', quote: '"Hold the line," she says at last.', action: 'logged' }));
    expect(extractSidecar(kept.raw).prose).toMatch(/^Okoro's pen sets down\./);
  });
});

describe('the narration speaking of its own drafting is a certain [apparatus] breach', () => {
  it('round 10\'s a77 redraft — "The draft says nothing in your voice. The break is…" — would not post: it adds a certain breach', () => {
    const [first, second] = of(R10, 'a77', /^callNarratorAPI>narrateResolution$/);
    const lines = linesOf(first.user);
    const redraft = extractSidecar(replyOf(second)).prose;
    expect(redraft).toMatch(/^The draft says nothing in your voice\. The break is Okoro's/);
    expect(certainViolations(redraft, lines).filter(v => v.note === DRAFTING)).toHaveLength(1);
    expect(certainViolations(extractSidecar(replyOf(first)).prose, lines)).toEqual([]);
  });

  it('round 8\'s a17 opening, which began with the model\'s notes on its material, is flagged too', () => {
    const [draft] = of(R8, 'a17', /^callNarratorAPI>narrateSessionVignette$/);
    const prose = extractSidecar(replyOf(draft)).prose;
    expect(prose).toContain('Result 1: "Follow Balance" can be read as Mira trying to keep things even');
    expect(CERTAIN_CHECKS.apparatus(prose).filter(v => v.note === DRAFTING)).toHaveLength(1);
  });

  it('of every narration the kept runs and recordings hold, it flags those two alone', () => {
    const files = [];
    for (const sub of ['explorations', 'recordings']) {
      const dir = path.join(PLAYWRIGHT, sub);
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) { if (fs.existsSync(path.join(p, 'replay.json'))) files.push(path.join(p, 'replay.json')); }
        else if (name.endsWith('.json')) files.push(p);
      }
    }
    const flagged = [];
    let read = 0;
    for (const f of files) {
      const run = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const x of run?.recording?.exchanges ?? run?.exchanges ?? []) {
        if (!/narrate|interrogateScene|callNarratorAPI>call$/.test(x.kind ?? '')) continue;
        read++;
        const body = judgedView(replyOf(x)).text;
        if (CERTAIN_CHECKS.apparatus(body).some(v => v.note === DRAFTING)) flagged.push(`${path.relative(PLAYWRIGHT, f)} ${x.step}`);
      }
    }
    expect(read).toBeGreaterThan(800);
    expect(flagged).toEqual([
      'explorations/long-haul-live-20261126-184225/replay.json a17',
      'explorations/long-haul-live-20261127-202557/replay.json a77',
    ]);
  });

  it('the re-ask block ends by asking for the narration alone', () => {
    const block = redraftBlock('You wait by the hatch.', [{ tag: 'person', quote: 'Mira waits' }], [{ kind: 'person', list: 'NOT SO', text: 'The player\'s character is "you".' }]);
    expect(block.trim().endsWith('Reply with the narration alone — no note about the draft or what changed.')).toBe(true);
  });
});

describe('a scene question\'s answer is not held to the characters\' place — round 10\'s a49', () => {
  const A49 = of(R10, 'a49', /^callNarratorAPI>interrogateScene$/)[0];
  const AUDIT = replyOf(of(R10, 'a49', /runConsistencyCheck/)[0]);
  const placeLine = "Place:    Bleakhold Station — where the characters are, by the table's record";
  const scene = (over = {}) => ({
    currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-3', currentLocationId: 'set-bleak', dismissedEntities: [],
    sceneTruths: [{ id: 'tr-ledger01', subject: { kind: 'text', text: 'Tamsin Okoro' }, fact: 'keeps a ledger stall on the Hollow Spire docks',
      sessionId: 'sess-3', sceneId: 'sc-3', asserter: 'narrator', basis: 'player', retracted: false, correctedTo: null, createdAt: 1 }],
    sceneState: { bySubject: {}, sceneId: 'sc-3' },
    ...over,
  });

  beforeEach(() => {
    game.actors._reset();
    game.actors._set('set-bleak', makeTestActor({ id: 'set-bleak', name: 'Bleakhold Station', type: 'location',
      flags: { [MODULE_ID]: { settlement: { name: 'Bleakhold Station' } } } }));
  });
  afterEach(() => game.actors._reset());

  it('the recorded answer and the audit\'s finding on it, as round 10 posted them', () => {
    expect(replyOf(A49)).toMatch(/^Back at Hollow Spire, the only dock trader the story has recorded as yours is Tamsin Okoro/);
    expect(AUDIT).toContain('"kind":"place","confidence":"high"');
  });

  it('its audit is sent no place, and the recorded place finding posts no card — dropped, as no place was given', async () => {
    apiPost.mockImplementation(async (_url, _headers, _body, opts) => {
      if (opts?.label === 'consistencyCheck') return reply(AUDIT);
      throw new Error(`unexpected call ${opts?.label}`);
    });
    const out = await runConsistencyCheck(replyOf(A49), scene(), { narrationKind: 'scene-answer' });
    expect(auditPrompt()).not.toContain(placeLine);
    expect(auditPrompt()).toMatch(/THE PLACE \([^)]*\):\n\(none\)/);
    expect(out.dispatched).toBe(false);
    expect(out.contradictions).toEqual([expect.objectContaining({ kind: 'place', action: 'dropped', why: 'no place was given' })]);
    // Control: a narration of play is still held to the place.
    apiPost.mockClear();
    await runConsistencyCheck(replyOf(A49), scene(), {});
    expect(auditPrompt()).toContain(placeLine);
  });

  it('the narrator tells the audit an @scene answer is a scene answer', async () => {
    global.game.messages = { contents: [] };
    global.game.user = { id: 'gm-1', isGM: true };
    global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
    game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
    game.settings._store.set(`${MODULE_ID}.campaignState`, scene());
    apiPost.mockImplementation(async (_url, _headers, _body, opts) => (opts?.label === 'consistencyCheck'
      ? reply('{"contradictions":[]}') : reply(replyOf(A49))));
    await interrogateScene('Who do I count as a friend among the dock traders back where this began?', game.settings.get(MODULE_ID, 'campaignState'));
    await vi.waitFor(() => expect(runConsistencyCheck).toHaveBeenCalledTimes(1));
    expect(runConsistencyCheck.mock.calls[0][2].narrationKind).toBe('scene-answer');
  });
});
