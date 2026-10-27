/**
 * STARFORGED COMPANION
 * tests/unit/playthroughReplay.test.js
 *
 * Strict replay for the scripted playthroughs (issue #302 slice A), checked
 * without Foundry: the Claude harness (test/ci/playwright/lib/claude.mjs) is
 * driven the way the browsers drive it — a request body and the JS stack at
 * the call — and the first-session scenario's declarations are checked
 * against its recording on every PR.
 *
 * The acceptance cases of the issue, at the harness:
 *   1. a required recording removed → the step fails, naming the step and call;
 *   2. a required section removed from the prompt → a contract failure, though
 *      a recorded reply still answered the call;
 *   3. the same calls with other generated ids → the same replies;
 *   4. a recording from a failed run → refused, and a record run's capture
 *      names its steps and provenance.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AFTER_STEP, SETUP_STEP, createClaudeHarness, normalizeHeading, promptFingerprint,
  recordingProblem, requestContract, scenarioRevision, validateScenario,
} from '../../test/ci/playwright/lib/claude.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const SCENARIO   = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'playthroughs/first-session.json'), 'utf8'));
const RECORDING  = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'recordings/first-session.json'), 'utf8'));

const MODULE = 'http://foundry:30000/modules/starforged-companion/src';

/** The stack a module call of `kind` ("caller>function") has at the fetch. */
function stackFor(kind) {
  const [caller, fn] = kind.split('>');
  return [
    'Error',
    '    at window.fetch (http://foundry:30000/game:1:1)',
    `    at apiPost (${MODULE}/api-proxy.js:60:21)`,
    `    at ${caller} (${MODULE}/narration/narrator.js:200:9)`,
    `    at ${fn} (${MODULE}/narration/narrator.js:640:23)`,
  ].join('\n');
}

/** A harness attached to a fake page; returns it with a `send(kind, { system, user })`. */
function harnessFor(options) {
  const harness = createClaudeHarness({ log: () => {}, ...options });
  let bridge = null;
  harness.attach({ exposeFunction: async (_name, fn) => { bridge = fn; }, addInitScript: async () => {} }, 'gm');
  harness.send = async (kind, { system = '', user = '' } = {}) => {
    const body = JSON.stringify({ model: 'claude-test', system, messages: [{ role: 'user', content: user }] });
    const res = await bridge({ url: 'https://api.anthropic.com/v1/messages', headers: {}, body, stack: stackFor(kind) });
    return { status: res.status, text: (JSON.parse(res.body).content ?? []).map(c => c.text).join('') };
  };
  return harness;
}

/** A prompt that meets a declared call's contract. */
function promptFor(call) {
  const parts = [];
  for (const heading of call.carries ?? []) parts.push(`## ${heading}\n\nSomething.`);
  for (const [heading, texts] of Object.entries(call.section ?? {})) parts.push(`## ${heading}\n\n${[].concat(texts).join('\n')}`);
  for (const text of call.contains ?? []) parts.push(text);
  return parts.join('\n\n');
}

/** Every exchange of `step`, by kind, in recording order. */
const recordedFor = (recording, step) => recording.exchanges.filter(x => x.step === step);

/**
 * Play the scenario's calls through the harness, as the steps would make them:
 * each required call, then each optional call the recording has a reply for.
 * `tweak(stepId, call)` may return a replacement request or null (skip it).
 */
async function play(harness, scenario, recording, tweak = () => undefined) {
  const reports = {};
  for (const step of scenario.steps) {
    harness.setStep(step.id);
    const recorded = recordedFor(recording, step.id);
    const required = step.calls ?? [];
    const optional = recorded.filter(x => (step.optionalCalls ?? []).includes(x.kind)
      && recorded.filter(y => y.kind === x.kind).length > required.filter(c => c.kind === x.kind).length);
    for (const call of [...required, ...optional.map(x => ({ kind: x.kind }))]) {
      const user = recorded.find(x => x.kind === call.kind)?.user ?? '';
      const request = { system: promptFor(call), user };
      const changed = tweak(step.id, call, request);
      if (changed === null) continue;
      await harness.send(call.kind, changed ?? request);
    }
    reports[step.id] = harness.checkStep(step.id, step, scenario.optionalCalls ?? []);
  }
  return reports;
}

const failuresOf = (reports) => Object.values(reports).flatMap(r => r.failures);

describe('the first-session scenario and its recording agree', () => {
  it('is strict, and every step has a unique id', () => {
    expect(SCENARIO.strict).toBe(true);
    expect(validateScenario(SCENARIO)).toEqual([]);
  });

  it('every recorded exchange names a step of the scenario', () => {
    const ids = new Set(SCENARIO.steps.map(s => s.id));
    expect(RECORDING.exchanges.filter(x => !ids.has(x.step)).map(x => `${x.step} ${x.kind}`)).toEqual([]);
    expect(recordingProblem(RECORDING, { strict: true })).toBeNull();
  });

  it('every required call has a recorded reply in its step, and every recording is declared', async () => {
    const harness = harnessFor({ mode: 'replay', recording: RECORDING, strict: true });
    const reports = await play(harness, SCENARIO, RECORDING);
    expect(failuresOf(reports)).toEqual([]);
    expect(harness.summary().unusedRecordings).toEqual([]);
    expect(harness.requests.every(r => r.source.startsWith('recording #'))).toBe(true);
  });
});

describe('strict replay fails what a permissive replay only reported', () => {
  it('a required recording removed: the step fails, naming the step and the call (acceptance 1)', async () => {
    const recording = structuredClone(RECORDING);
    recording.exchanges = recording.exchanges.filter(x => !(x.step === 'gather' && x.kind === 'callHaiku>defaultCallDetectionAPI'));
    const harness = harnessFor({ mode: 'replay', recording, strict: true });
    const reports = await play(harness, SCENARIO, recording);
    expect(reports.gather.failures).toEqual([
      expect.stringMatching(/^UNRECORDED callHaiku>defaultCallDetectionAPI \(call #\d+\) — required by step "gather", answered by the neutral stub$/),
    ]);
    // The reply meant for the next step's detection call was not taken.
    expect(reports['ask-vance'].failures).toEqual([]);
  });

  it('a required section dropped from the prompt fails its contract, though a recorded reply answered (acceptance 2)', async () => {
    const harness = harnessFor({ mode: 'replay', recording: RECORDING, strict: true });
    const reports = await play(harness, SCENARIO, RECORDING, (step, call, request) =>
      (step === 'gather' && call.kind === 'callNarratorAPI>narrateResolution'
        ? { ...request, system: request.system.replace('## MOVE OUTCOME', '## SOMETHING ELSE') }
        : undefined));
    const narration = harness.requests.find(r => r.step === 'gather' && r.kind === 'callNarratorAPI>narrateResolution');
    expect(narration.source).toMatch(/^recording #/);
    expect(reports.gather.failures).toEqual([
      expect.stringMatching(/^CONTRACT callNarratorAPI>narrateResolution \(call #\d+\) in step "gather": lacks MOVE OUTCOME$/),
    ]);
  });

  it('a fact that must reach the next session is missing from its prompt: CONTRACT', async () => {
    const harness = harnessFor({ mode: 'replay', recording: RECORDING, strict: true });
    const reports = await play(harness, SCENARIO, RECORDING, (step, call, request) =>
      (step === 'reopen' && call.kind === 'callNarratorAPI>narrateSessionVignette'
        ? { ...request, system: '## LAST SESSION (SESSION 1)\n\nA quiet session.' }
        : undefined));
    expect(reports.reopen.failures).toEqual([
      expect.stringMatching(/CONTRACT callNarratorAPI>narrateSessionVignette .* LAST SESSION should say "Vance Oduya"$/),
    ]);
  });

  it('a call nothing declared fails as UNEXPECTED; a required call never made fails as MISSING', async () => {
    const harness = harnessFor({ mode: 'replay', recording: RECORDING, strict: true });
    const reports = await play(harness, SCENARIO, RECORDING, (step, call) =>
      (step === 'course-bleakhold' && call.kind === 'callChronicleAPI>writeChronicleEntry' ? null : undefined));
    expect(reports['course-bleakhold'].failures).toEqual(['MISSING callChronicleAPI>writeChronicleEntry — step "course-bleakhold" never made this call']);

    harness.setStep('confirm-vance');
    await harness.send('callHaiku>defaultCallDetectionAPI', { user: 'Vance Oduya' });
    expect(harness.checkStep('confirm-vance', SCENARIO.steps[2], []).failures).toEqual([
      expect.stringMatching(/^UNEXPECTED callHaiku>defaultCallDetectionAPI \(call #\d+\) in step "confirm-vance" — not declared; answered by stub$/),
    ]);
  });

  it('a declared optional call is reported, not failed — whether or not a reply was recorded', async () => {
    const recording = structuredClone(RECORDING);
    recording.exchanges = recording.exchanges.filter(x => !(x.step === 'open' && x.kind === 'callHaiku>defaultCallTierAPI'));
    const harness = harnessFor({ mode: 'replay', recording, strict: true });
    harness.setStep('open');
    await harness.send('callNarratorAPI>narrateSessionVignette', { system: 'SHIP POSITION: Kobayashi IV docked at Hollow Spire' });
    await harness.send('callHaiku>defaultCallTierAPI', { user: 'galley' });
    const report = harness.checkStep('open', SCENARIO.steps[0], []);
    expect(report.failures).toEqual([]);
    expect(report.variations).toEqual([expect.stringMatching(/^OPTIONAL callHaiku>defaultCallTierAPI \(call #2\) in step "open" — stub$/)]);
  });

  it('a slow page: a strict step waits until its required calls have started (CI run 245)', async () => {
    const harness = harnessFor({ mode: 'replay', recording: RECORDING, strict: true });
    const gather = SCENARIO.steps[1];
    harness.setStep('gather');
    // The step's calls start late — the passes' timers fire after the action returned.
    gather.calls.forEach((call, k) => setTimeout(() => { harness.send(call.kind, { system: promptFor(call) }); }, 60 * (k + 1)));
    await expect(harness.waitForCalls('gather', gather, [], { timeoutMs: 2_000 })).resolves.toBe(true);
    await harness.idle({ quietMs: 50 });
    expect(harness.checkStep('gather', gather, []).failures).toEqual([]);

    // A required call that never starts: the wait gives up, and the check names it.
    harness.setStep('drag-home');
    await expect(harness.waitForCalls('drag-home', SCENARIO.steps[6], [], { timeoutMs: 300 })).resolves.toBe(false);
    expect(harness.checkStep('drag-home', SCENARIO.steps[6], []).failures).toHaveLength(2);
  });

  it('and for the optional calls its recording made in that step, so they do not start in the next one', async () => {
    const harness = harnessFor({ mode: 'replay', recording: RECORDING, strict: true });
    const open = SCENARIO.steps[0];
    harness.setStep('open');
    await harness.send(open.calls[0].kind, { system: promptFor(open.calls[0]) });
    let tierStarted = false;
    setTimeout(() => { tierStarted = true; harness.send('callHaiku>defaultCallTierAPI', { user: 'galley' }); }, 300);
    await expect(harness.waitForCalls('open', open, [], { timeoutMs: 2_000 })).resolves.toBe(true);
    expect(tierStarted).toBe(true);
    expect(harness.checkStep('open', open, []).variations).toEqual([
      expect.stringMatching(/^OPTIONAL callHaiku>defaultCallTierAPI \(call #2\) in step "open" — recording #2$/),
    ]);
  });

  it('an optional kind the recording did not make in that step is not waited for', async () => {
    const recording = structuredClone(RECORDING);
    recording.exchanges = recording.exchanges.filter(x => !(x.step === 'open' && x.kind === 'callHaiku>defaultCallTierAPI'));
    const harness = harnessFor({ mode: 'replay', recording, strict: true });
    const open = SCENARIO.steps[0];
    harness.setStep('open');
    await harness.send(open.calls[0].kind, { system: promptFor(open.calls[0]) });
    const t0 = Date.now();
    await expect(harness.waitForCalls('open', open, [], { timeoutMs: 5_000 })).resolves.toBe(true);
    expect(Date.now() - t0).toBeLessThan(1_000);
  });

  it('calls before the first step or after the last are UNEXPECTED unless the scenario allows them', async () => {
    const harness = harnessFor({ mode: 'replay', recording: RECORDING, strict: true });
    await harness.send('callHaiku>defaultCallTierAPI', { user: 'setup' });
    harness.setStep(AFTER_STEP);
    await harness.send('callHaiku>defaultCallTierAPI', { user: 'after' });
    expect(harness.checkStep(SETUP_STEP, {}, []).failures).toHaveLength(1);
    expect(harness.checkStep(AFTER_STEP, {}, ['callHaiku>defaultCallTierAPI']).failures).toEqual([]);
  });
});

describe('matching by step and kind', () => {
  const recording = {
    exchanges: [
      { step: 'a', kind: 'callHaiku>defaultCallTierAPI', user: 'alpha words only', response: { content: [{ type: 'text', text: 'reply A' }] } },
      { step: 'b', kind: 'callHaiku>defaultCallTierAPI', user: 'bravo words only', response: { content: [{ type: 'text', text: 'reply B' }] } },
      { kind: 'callHaiku>defaultCallTierAPI', user: 'untagged legacy words here', response: { content: [{ type: 'text', text: 'reply U' }] } },
    ],
  };

  it('a call takes its own step\'s recording, however its words drifted', async () => {
    const harness = harnessFor({ mode: 'replay', recording, strict: true });
    harness.setStep('b');
    expect((await harness.send('callHaiku>defaultCallTierAPI', { user: 'completely different prompt text' })).text).toBe('reply B');
  });

  it('never a later step\'s recording; an untagged one only on half its words', async () => {
    const harness = harnessFor({ mode: 'replay', recording, strict: true });
    harness.setStep('a');
    expect((await harness.send('callHaiku>defaultCallTierAPI', { user: 'alpha' })).text).toBe('reply A');
    expect((await harness.send('callHaiku>defaultCallTierAPI', { user: 'nothing in common' })).text).not.toMatch(/^reply/);
    expect((await harness.send('callHaiku>defaultCallTierAPI', { user: 'the untagged legacy words' })).text).toBe('reply U');
    expect(harness.requests.map(r => r.source)).toEqual(['recording #1', 'stub', 'recording #3']);
  });

  it('permissive replay still lets a late background call take an earlier step\'s recording, on the word floor', async () => {
    const harness = harnessFor({ mode: 'replay', recording, strict: false });
    harness.setStep('c');
    expect((await harness.send('callHaiku>defaultCallTierAPI', { user: 'bravo words only' })).text).toBe('reply B');
  });

  it('two recordings of a step that match equally are reported as AMBIGUOUS; the earlier answers', async () => {
    const twin = { exchanges: [
      { step: 'a', kind: 'callHaiku>defaultCallTierAPI', user: 'same', response: { content: [{ type: 'text', text: 'first' }] } },
      { step: 'a', kind: 'callHaiku>defaultCallTierAPI', user: 'same', response: { content: [{ type: 'text', text: 'second' }] } },
    ] };
    const harness = harnessFor({ mode: 'replay', recording: twin, strict: true });
    harness.setStep('a');
    expect((await harness.send('callHaiku>defaultCallTierAPI', { user: 'same' })).text).toBe('first');
    expect(harness.checkStep('a', { optionalCalls: ['callHaiku>defaultCallTierAPI'] }).variations)
      .toEqual([expect.stringMatching(/^OPTIONAL/), expect.stringMatching(/^AMBIGUOUS .*#1 and #2 match equally/)]);
  });

  it('a fresh world\'s generated ids change nothing: the same calls get the same replies (acceptance 3)', async () => {
    const replies = [];
    for (const id of ['Ab12Cd34Ef56Gh78', 'Zz99Yy88Xx77Ww66']) {
      const harness = harnessFor({ mode: 'replay', recording: RECORDING, strict: true });
      harness.setStep('ask-vance');
      const user = `## VANCE ODUYA — Connection (id: ${id})\n\nI lean on the counter.`;
      replies.push((await harness.send('callHaiku>defaultCallTierAPI', { user })).text);
    }
    expect(replies[0]).toContain('eleven years of tithe');
    expect(replies[1]).toBe(replies[0]);
  });
});

describe('prompt fingerprints ignore what differs between worlds', () => {
  it('entity ids and numbers are normalised away', () => {
    expect(normalizeHeading('LAST SESSION (SESSION 3)')).toBe(normalizeHeading('LAST SESSION (SESSION 12)'));
    expect(normalizeHeading('VANCE ODUYA — Connection (id: Ab12Cd)')).toBe('VANCE ODUYA — Connection (id)');
    expect(promptFingerprint(['MOVE OUTCOME', 'LAST SESSION (SESSION 1)']))
      .toBe(promptFingerprint(['MOVE OUTCOME', 'LAST SESSION (SESSION 2)']));
    expect(promptFingerprint(['MOVE OUTCOME'])).not.toBe(promptFingerprint(['MOVE OUTCOME', 'CLOCKS']));
  });

  it('a recording is STALE only when a section really came or went', async () => {
    const recording = { exchanges: [{ step: 'a', kind: 'callHaiku>defaultCallTierAPI', user: 'x', sections: ['LAST SESSION (SESSION 1)', 'CLOCKS'], response: { content: [] } }] };
    const same = harnessFor({ mode: 'replay', recording, strict: true });
    same.setStep('a');
    await same.send('callHaiku>defaultCallTierAPI', { system: '## LAST SESSION (SESSION 4)\n\nx\n\n## CLOCKS\n\ny' });
    expect(same.warnings).toEqual([]);
    const drifted = harnessFor({ mode: 'replay', recording, strict: true });
    drifted.setStep('a');
    await drifted.send('callHaiku>defaultCallTierAPI', { system: '## LAST SESSION (SESSION 4)\n\nx' });
    expect(drifted.warnings).toEqual([expect.stringMatching(/^STALE .*-\[CLOCKS\]/)]);
  });
});

describe('recordings carry where they came from, and a failed run is never the baseline', () => {
  it('a recording captured from a failed run is refused; a strict scenario needs step-tagged exchanges (acceptance 4)', () => {
    expect(recordingProblem({ passed: false, exchanges: [] })).toMatch(/FAILED/);
    expect(recordingProblem({ exchanges: [{ kind: 'k>f' }] }, { strict: true })).toMatch(/tagged with its step/);
    expect(recordingProblem({ exchanges: [{ kind: 'k>f' }] }, { strict: false })).toBeNull();
  });

  it('a record run tags each exchange with its step and fingerprint, and names its models, commit and scenario revision', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
      model: 'claude-live-model', content: [{ type: 'text', text: 'Vance (id: Q1w2E3r4) nods.' }], stop_reason: 'end_turn', usage: null,
    }), { status: 200 });
    try {
      const harness = harnessFor({ mode: 'record', apiKey: 'sk-ant-test', strict: true });
      harness.setStep('gather');
      await harness.send('callNarratorAPI>narrateResolution', {
        system: '## MOVE OUTCOME\n\nStrong hit.\n\n## VANCE ODUYA — Connection (id: Q1w2E3r4)\n\nThe dockmaster.',
        user: 'I ask the dockmaster.',
      });
      const out = harness.recordingOut({ scenario: 'first-session', scenarioFile: 'first-session.json', revision: scenarioRevision(SCENARIO), passed: true, commit: 'abc123' });
      expect(out).toMatchObject({ source: 'recorded', passed: true, strict: true, scenarioRevision: scenarioRevision(SCENARIO) });
      expect(out.provenance).toMatchObject({ commit: 'abc123', models: ['claude-live-model'] });
      expect(out.exchanges).toMatchObject([{
        step: 'gather', kind: 'callNarratorAPI>narrateResolution',
        sections: ['MOVE OUTCOME', 'VANCE ODUYA — Connection (id: Q1w2E3r4)'],
        fingerprint: promptFingerprint(['MOVE OUTCOME', 'VANCE ODUYA — Connection (id: Q1w2E3r4)']),
      }]);
      // The id the model echoed is stored as the entity's name: ids differ per world.
      expect(out.exchanges[0].response.content[0].text).toBe('Vance (id: VANCE ODUYA) nods.');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('the scenario revision follows what the replies depend on, not the checks', () => {
    const base = scenarioRevision(SCENARIO);
    const checksEdited = structuredClone(SCENARIO);
    checksEdited.steps[1].then = [];
    checksEdited.steps[1].calls = [];
    expect(scenarioRevision(checksEdited)).toBe(base);
    const lineEdited = structuredClone(SCENARIO);
    lineEdited.steps[1].text = 'I ask the dockmaster something else.';
    expect(scenarioRevision(lineEdited)).not.toBe(base);
  });
});

describe('requestContract', () => {
  const request = { system: '## CHARACTER\n\nName: Mira Kestrel\n\n## PARTY\n\nNobody', user: '## MOVE OUTCOME\n\nStrong hit' };

  it('names each thing the prompt lacks or carries against its contract', () => {
    expect(requestContract(request, {
      carries: ['MOVE OUTCOME', 'CLOCKS'],
      lacks: ['PARTY'],
      section: { CHARACTER: 'Name: Mira Kestrel', 'ACTIVE SCENE': 'x' },
      sectionLacks: { PARTY: 'Nobody' },
      contains: ['Strong hit', 'SHIP POSITION'],
    })).toEqual([
      'lacks CLOCKS',
      'carries PARTY',
      'lacks ACTIVE SCENE',
      'doesn\'t say "SHIP POSITION"',
      'PARTY should not say "Nobody"',
    ]);
  });

  it('an empty contract holds for any request', () => {
    expect(requestContract(request, {})).toEqual([]);
  });
});
