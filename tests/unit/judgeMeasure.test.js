/**
 * STARFORGED COMPANION
 * tests/unit/judgeMeasure.test.js
 *
 * Issue #399, slices 4 and 5 (D6, D7, D9, D10): the narration's judges are
 * measured on a labelled set — every narration the kept long hauls recorded
 * with the lines it was given, the reviews' labels, the lines written by hand
 * where a run predates them, and three seeded breaches a judge-class kind
 * (test/ci/playwright/judges/set.json, lib/judges.mjs). The measure needs a
 * key (test/ci/playwright/judges.mjs, live); its last verdicts are kept, and
 * this replays them with no key: every request the module builds now must be
 * one the kept run answered — a prompt changed since is a stale measure — and
 * the scores must be the kept ones. Authority follows the measure (D7): a
 * kind may act in a pass only where the bar passes it on the counts pooled
 * over the runs made with the current judge sentences (judges/pool.json; the
 * model samples at its default, so one run's flip is noise), and a pass is
 * asked about no other kind (D10). The harm check in code is scored on the
 * same set with no call (D9): it is certain, so it must hold the bar.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const kept = new Map();
const misses = [];
const fingerprint = (body) => createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 24);
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const reply = kept.get(fingerprint(body));
    if (!reply) { misses.push(body?.messages?.[0]?.content?.slice?.(0, 120) ?? body?.system?.slice?.(-200) ?? '?'); throw new Error('no kept verdict for this request'); }
    return reply;
  }),
}));

import { buildSet, judgePass, auditPass, scorePass, codeScore, poolScores, requestHash, JUDGE_KINDS } from '../../test/ci/playwright/lib/judges.mjs';
import { judgeMayAct, checkClassOf } from '../../src/moves/contracts/checks.js';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const SET = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'judges', 'set.json'), 'utf8'));
const RUNS = path.join(PLAYWRIGHT, 'judges', 'runs');
const LATEST = fs.readdirSync(RUNS).filter(d => d.startsWith('judges-live-')).sort().at(-1);
const VERDICTS = JSON.parse(fs.readFileSync(path.join(RUNS, LATEST, 'verdicts.json'), 'utf8'));
const RESULTS = JSON.parse(fs.readFileSync(path.join(RUNS, LATEST, 'results.json'), 'utf8'));
for (const c of VERDICTS.calls) kept.set(c.hash, { content: c.reply.content, stop_reason: c.reply.stop_reason, usage: c.usage });
const POOL = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'judges', 'pool.json'), 'utf8'));
const POOLED = poolScores(POOL.runs.map(r => JSON.parse(fs.readFileSync(path.join(RUNS, r, 'results.json'), 'utf8')).score));

const { entries, missing } = buildSet({ explorations: path.join(PLAYWRIGHT, 'explorations'), set: SET });

describe('the labelled set (issue #399, D6)', () => {
  it('every label and seed names a narration the kept runs hold, and every labelled line is on its entry', () => {
    expect(missing).toEqual([]);
    for (const e of entries) {
      for (const kind of Object.keys(e.labels)) {
        if (kind === 'harm') continue;   // the check in code, not a line
        expect(e.lines.some(o => o.kind === kind), `${e.id} [${kind}]`).toBe(true);
      }
    }
  });

  it('three seeded breaches for every kind a judge may be asked about, each a real narration edited by hand', () => {
    for (const kind of JUDGE_KINDS) {
      const seeds = entries.filter(e => e.seeded && e.labels[kind] === true);
      expect(seeds.length, kind).toBeGreaterThanOrEqual(3);
      for (const s of seeds) expect(s.edit, s.id).toBeTruthy();
    }
  });

  it('every line of a kind a judge may be asked about is rebuilt with its judge sentence', () => {
    for (const e of entries) for (const o of e.lines) if (JUDGE_KINDS.includes(o.kind)) expect(typeof o.judge, `${e.id} [${o.kind}]`).toBe('string');
  });

  it('round 9\'s false findings are in it, labelled kept', () => {
    const kept9 = (step, kind, line) => entries.find(e => e.run === 'long-haul-live-20261127-041734' && e.step === step && e.kind === kind && e.nth === 0)?.labels[line];
    for (const [step, kind, line] of [['a34', 'narrateResolution', 'dice'], ['a36', 'narrateResolution', 'dice'], ['a54', 'narratePacedInput', 'dice'],
      ['a5', 'narratePacedInput', 'offer'], ['a12', 'narratePacedInput', 'offer'], ['a62', 'narratePacedInput', 'offer'],
      ['a70', 'narratePacedInput', 'offer'], ['a77', 'narratePacedInput', 'offer'], ['a29', 'narratePacedInput', 'premise']]) {
      expect(kept9(step, kind, line), `${step} [${line}]`).toBe(false);
    }
  });
});

describe(`the kept measure (${LATEST})`, () => {
  it('the replay asks exactly what the kept run answered, and scores as it did', async () => {
    expect(fingerprint({ a: 1 })).toBe(requestHash({ a: 1 }));
    const results = { judge: new Map(), audit: new Map() };
    for (const e of entries) {
      results.judge.set(e.id, await judgePass(e, { apiKey: 'sk-replay' }));
      results.audit.set(e.id, await auditPass(e, { apiKey: 'sk-replay' }));
    }
    // A request the kept run never answered: a prompt changed since — measure again (judges.mjs, live).
    expect(misses, 'stale requests').toEqual([]);
    expect({ judge: scorePass(entries, results.judge, 'judge'), audit: scorePass(entries, results.audit, 'audit'), code: codeScore(entries) })
      .toEqual(RESULTS.score);
  }, 60000);

  it('the run replayed is the pool\'s newest, as the module ships', () => {
    expect(POOL.runs.at(-1)).toBe(LATEST);
    for (const r of POOL.runs) expect(fs.existsSync(path.join(RUNS, r, 'results.json')), r).toBe(true);
  });

  it('authority follows the measure (D7): a kind acts in a pass only where the pooled runs pass it there', () => {
    for (const pass of ['judge', 'audit']) {
      for (const kind of JUDGE_KINDS) {
        if (judgeMayAct(kind, pass)) expect(POOLED[pass][kind]?.passed, `${pass} [${kind}]`).toBe(true);
      }
    }
  });

  it('a pass is asked about no kind it may not act on (D10): the kept run asked the judge and the audit only those', () => {
    for (const kind of JUDGE_KINDS) {
      expect(RESULTS.score.judge[kind]?.asked ?? false, `judge [${kind}]`).toBe(judgeMayAct(kind, 'judge'));
      expect(checkClassOf(kind) === 'judge', `judge-class [${kind}]`).toBe(judgeMayAct(kind, 'judge'));
      expect(RESULTS.score.audit[kind]?.asked ?? false, `audit [${kind}]`).toBe(judgeMayAct(kind, 'audit'));
      // Not asked, never flagged.
      for (const pass of ['judge', 'audit']) if (!judgeMayAct(kind, pass)) expect(RESULTS.score[pass][kind]?.flags ?? 0, `${pass} [${kind}]`).toBe(0);
    }
  });

  it('the harm check in code holds the bar on the set (D9): it re-asks, so it must', () => {
    const { harm } = codeScore(entries);
    expect(harm.passed).toBe(true);
    expect(harm.wrongOnLabelled).toBe(0);
    // Round 8's three — each price fell on the ship — and a62/a63's cuts at full health, among them.
    for (const step of ['a40', 'a44', 'a46']) expect(harm.flagged, step).toContain(`long-haul-live-20261126-184225:${step}:narrateResolution:0`);
    for (const step of ['a62', 'a63']) expect(harm.flagged, step).toContain(`long-haul-live-20261124-213912:${step}:narratePacedInput:0`);
    // Round 8's a41 and a45, health lost and told: not flagged.
    for (const step of ['a41', 'a45']) expect(harm.flagged, step).not.toContain(`long-haul-live-20261126-184225:${step}:narrateResolution:0`);
  });
});
