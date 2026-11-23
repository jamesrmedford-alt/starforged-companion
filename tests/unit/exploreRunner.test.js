/**
 * STARFORGED COMPANION
 * tests/unit/exploreRunner.test.js
 *
 * AI exploration through the real UI (issue #302 slice D; #290 part 3) — the
 * parts of the runner (test/ci/playwright/explore.mjs) that decide something
 * without a browser, checked without one:
 *
 *   - the budget: every cap, and a call's worst cost reserved before it is
 *     sent, so calls in flight together cannot pass the dollar cap;
 *   - the Claude harness's gate: a module call the budget refuses is never
 *     sent, and the page still gets an answer;
 *   - the runner's own model calls: the request's shape, a refusal, a retry —
 *     each attempt budgeted, the key in a header and in no log;
 *   - the player: what a screen reads as, which actions a screen allows, and
 *     an action's id-free form for a replay;
 *   - the observer: a fact's variants, the memory goal scored layer by layer,
 *     health, and the run's class;
 *   - a rehearsal's stand-in for the model API: the charter's script through
 *     the player's own tool, a narrator that keeps the fact or keeps nothing;
 *   - the memory charter and the config that ship: runnable, and priced;
 *   - the live runs kept as replays: that each file is one the runner can
 *     take again, and that it holds what its result claims.
 *
 * The run itself — two browsers at a live Foundry table — is on demand
 * (test/ci/scripts/cloud.sh explore).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { costOf, worstCost, createBudget } from '../../test/ci/playwright/lib/budget.mjs';
import { createClaudeHarness } from '../../test/ci/playwright/lib/claude.mjs';
import { buildRequest, readReply, callClaude } from '../../test/ci/playwright/lib/anthropic.mjs';
import {
  ACTION_TOOL, MAX_WAIT_SECONDS, chooseAction, describeScreen, resolveScripted, scriptedForm, summariseAction, validateAction,
} from '../../test/ci/playwright/lib/player.mjs';
import {
  classifyRun, excerptOf, factIn, healthOf, scoreMemory, sectionsHolding, variantPattern,
} from '../../test/ci/playwright/lib/observer.mjs';
import { createRehearsal, installRehearsal } from '../../test/ci/playwright/lib/rehearsal.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const CONFIG  = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'explore.config.json'), 'utf8'));
const CHARTER = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/memory.json'), 'utf8'));

const PRICES = { opus: { input: 4, output: 20, cacheRead: 0.2 }, haiku: { input: 0.1, output: 0.5 } };
const CAPS   = { actions: 3, calls: 4, minutes: 20, usd: 1 };

afterEach(() => vi.unstubAllGlobals());

// ── the budget ───────────────────────────────────────────────────────────────

describe('the run\'s budget', () => {
  it('prices a call from its usage: input, cache writes at 1.25×, cache reads at their own rate, output', () => {
    const usage = { input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, output_tokens: 1_000_000 };
    expect(costOf(PRICES.opus, usage)).toBeCloseTo(4 + 5 + 0.2 + 20, 6);
    expect(costOf(PRICES.haiku, usage), 'no cache-read price: charged as input').toBeCloseTo(0.1 + 0.125 + 0.1 + 0.5, 6);
  });

  it('a call\'s worst cost is its whole prompt as a cache write and its whole max_tokens as output', () => {
    expect(worstCost(PRICES.opus, { promptChars: 2_000_000, maxTokens: 1_000_000 })).toBeCloseTo(5 + 20, 6);
  });

  it('reserves the worst cost before dispatch: calls in flight together cannot pass the dollar cap', () => {
    const budget = createBudget({ caps: { ...CAPS, calls: 100, usd: 0.05 }, prices: PRICES });
    const call = { model: 'opus', maxTokens: 1000, promptChars: 0 };          // up to $0.02 each
    const first = budget.reserve(call);
    const second = budget.reserve(call);
    const third = budget.reserve(call);
    expect([first.ok, second.ok, third.ok]).toEqual([true, true, false]);
    expect(third.reason).toMatch(/^usd: /);
    expect(budget.exhausted()).toMatchObject({ cap: 'usd' });
  });

  it('what a call used replaces its reservation', () => {
    const budget = createBudget({ caps: { ...CAPS, calls: 100, usd: 0.05 }, prices: PRICES });
    const call = { model: 'opus', maxTokens: 1000, promptChars: 0 };
    for (let i = 0; i < 10; i++) {
      const held = budget.reserve(call);
      expect(held.ok, `call ${i + 1}`).toBe(true);
      budget.settle(held.id, { usage: { input_tokens: 100, output_tokens: 10 } });   // $0.0006
    }
    expect(budget.report()).toMatchObject({ calls: 10, inFlightUsd: 0, stopped: null });
    expect(budget.report().usd).toBeCloseTo(0.006, 6);
  });

  it('a failed call is counted and not charged; its reservation is released', () => {
    const budget = createBudget({ caps: CAPS, prices: PRICES });
    const held = budget.reserve({ model: 'opus', maxTokens: 1000, role: 'player' });
    budget.settle(held.id, { usage: null });
    expect(budget.report()).toMatchObject({ calls: 1, usd: 0, inFlightUsd: 0, byRole: { player: { calls: 1, usd: 0 } } });
  });

  it('refuses a model nobody priced — and the run is over', () => {
    const budget = createBudget({ caps: CAPS, prices: PRICES });
    expect(budget.reserve({ model: 'claude-unlisted' })).toMatchObject({ ok: false, reason: expect.stringContaining('unpriced-model') });
    expect(budget.reserve({ model: 'opus' }).ok, 'the first cap reached ends the run').toBe(false);
  });

  it('stops at the call cap, the action cap and the clock — whichever comes first', () => {
    const calls = createBudget({ caps: CAPS, prices: PRICES });
    for (let i = 0; i < 4; i++) calls.settle(calls.reserve({ model: 'haiku' }).id, {});
    expect(calls.reserve({ model: 'haiku' })).toMatchObject({ ok: false, reason: expect.stringContaining('calls') });

    const actions = createBudget({ caps: CAPS, prices: PRICES });
    expect([actions.takeAction(), actions.takeAction(), actions.takeAction()]).toEqual([true, true, true]);
    expect(actions.canAct()).toBe(false);
    expect(actions.exhausted(), 'asking is not reaching').toBeNull();
    expect(actions.takeAction()).toBe(false);
    expect(actions.exhausted()).toMatchObject({ cap: 'actions' });

    let now = 0;
    const clock = createBudget({ caps: CAPS, prices: PRICES, now: () => now });
    expect(clock.canAct()).toBe(true);
    now = 20 * 60_000;
    expect(clock.canAct()).toBe(false);
    expect(clock.reserve({ model: 'haiku' })).toMatchObject({ ok: false, reason: expect.stringContaining('minutes') });
  });

  it('tallies by role: the module\'s calls and the player\'s', () => {
    const budget = createBudget({ caps: { ...CAPS, calls: 10 }, prices: PRICES });
    for (const role of ['module', 'player', 'player']) {
      budget.settle(budget.reserve({ model: 'haiku', role }).id, { usage: { input_tokens: 10, output_tokens: 5 } });
    }
    const { byRole } = budget.report();
    expect([byRole.module.calls, byRole.player.calls]).toEqual([1, 2]);
    expect(byRole.player).toMatchObject({ input: 20, output: 10 });
  });
});

// ── the harness's gate ───────────────────────────────────────────────────────

describe('the Claude harness under a budget (a live run\'s module calls)', () => {
  const STACK = [
    'Error', '    at window.fetch (http://foundry:30000/game:1:1)',
    '    at apiPost (http://foundry:30000/modules/starforged-companion/src/api-proxy.js:60:21)',
    '    at callNarratorAPI (http://foundry:30000/modules/starforged-companion/src/narration/narrator.js:200:9)',
    '    at narratePacedInput (http://foundry:30000/modules/starforged-companion/src/narration/narrator.js:640:23)',
  ].join('\n');

  function gated(budget, fetchImpl) {
    vi.stubGlobal('fetch', fetchImpl);
    const harness = createClaudeHarness({
      mode: 'record', apiKey: 'sk-test-key', log: () => {},
      gate: { before: (call) => budget.reserve({ ...call, role: 'module' }), after: (id, { usage }) => budget.settle(id, { usage }) },
    });
    let bridge = null;
    harness.attach({ exposeFunction: async (_n, fn) => { bridge = fn; }, addInitScript: async () => {} }, 'gm');
    const send = (model = 'opus') => bridge({
      url: 'https://api.anthropic.com/v1/messages', headers: { 'x-api-key': 'page-placeholder' }, stack: STACK,
      body: JSON.stringify({ model, max_tokens: 1000, system: '## NARRATOR ROLE AND VOICE', messages: [{ role: 'user', content: 'I look around.' }] }),
    });
    return { harness, send };
  }
  const reply = (usage) => new Response(JSON.stringify({ model: 'opus', content: [{ type: 'text', text: 'The dock hums.' }], stop_reason: 'end_turn', usage }), { status: 200 });

  it('a call is reserved before it leaves and settled with what it used', async () => {
    const budget = createBudget({ caps: CAPS, prices: PRICES });
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(budget.report().inFlightUsd, 'reserved while in flight').toBeGreaterThan(0);
      expect(init.headers['x-api-key'], 'the runner\'s key replaces the page\'s placeholder').toBe('sk-test-key');
      return reply({ input_tokens: 1000, output_tokens: 100 });
    });
    const { harness, send } = gated(budget, fetchImpl);
    const res = await send();
    expect(res.status).toBe(200);
    expect(budget.report()).toMatchObject({ calls: 1, inFlightUsd: 0, byRole: { module: { calls: 1, input: 1000, output: 100 } } });
    expect(budget.report().usd).toBeCloseTo(0.006, 6);
    expect(harness.requests[0]).toMatchObject({ source: 'live', status: 200, kind: 'callNarratorAPI>narratePacedInput' });
  });

  it('a call the budget refuses is never sent: the page gets the neutral stub and the entry says why', async () => {
    const budget = createBudget({ caps: { ...CAPS, usd: 0.001 }, prices: PRICES });
    const fetchImpl = vi.fn();
    const { harness, send } = gated(budget, fetchImpl);
    const res = await send();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).content[0].text).toContain('no recorded reply');
    expect(harness.requests[0].source).toMatch(/^refused \(usd: /);
    expect(budget.exhausted()).toMatchObject({ cap: 'usd' });
  });

  it('a call that fails keeps no reservation, and its status is on the entry', async () => {
    const budget = createBudget({ caps: CAPS, prices: PRICES });
    const { harness, send } = gated(budget, async () => new Response('{"type":"error"}', { status: 529 }));
    const res = await send();
    expect(res.status).toBe(529);
    expect(harness.requests[0].status).toBe(529);
    expect(budget.report()).toMatchObject({ calls: 1, usd: 0, inFlightUsd: 0 });
  });

  it('the recording a gated run writes names the runner that made it', async () => {
    const budget = createBudget({ caps: CAPS, prices: PRICES });
    const { harness, send } = gated(budget, async () => reply({ input_tokens: 10, output_tokens: 5 }));
    harness.setStep('a1');
    await send();
    const out = harness.recordingOut({ scenario: 'explore-memory', passed: true, runner: 'test/ci/playwright/explore.mjs' });
    expect(out.provenance.runner).toBe('test/ci/playwright/explore.mjs');
    expect(out.exchanges).toMatchObject([{ step: 'a1', kind: 'callNarratorAPI>narratePacedInput' }]);
    expect(JSON.stringify(out)).not.toContain('sk-test-key');
  });
});

// ── the runner's own model calls ─────────────────────────────────────────────

describe('the runner\'s model calls (the player\'s)', () => {
  const ok = (content, extra = {}) => new Response(JSON.stringify({ content, stop_reason: 'tool_use', usage: { input_tokens: 500, output_tokens: 50 }, ...extra }), { status: 200 });
  const base = { apiKey: 'sk-test-key', model: 'opus', effort: 'low', maxTokens: 1000, system: 'S', user: 'U', role: 'player', pause: async () => {} };

  it('the request: effort set, one strict tool, no forced choice, no sampling parameters, no fallback', () => {
    const body = buildRequest({ model: 'claude-opus-5-5', effort: 'low', maxTokens: 6000, system: 'S', user: 'U', tool: ACTION_TOOL });
    expect(body).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 6000, output_config: { effort: 'low' }, tool_choice: { type: 'auto', disable_parallel_tool_use: true } });
    expect(body.tools).toEqual([ACTION_TOOL]);
    for (const absent of ['temperature', 'top_p', 'thinking', 'fallbacks']) expect(body).not.toHaveProperty(absent);
  });

  it.each([['the player\'s', ACTION_TOOL]])('%s tool is strict: every property required, nothing extra', (_who, tool) => {
    const closed = (schema) => {
      if (schema.type === 'object') {
        expect(schema.additionalProperties).toBe(false);
        expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
        Object.values(schema.properties).forEach(closed);
      }
      if (schema.type === 'array') closed(schema.items);
    };
    expect(tool.strict).toBe(true);
    closed(tool.input_schema);
  });

  it('reads why a reply stopped before its content: a refusal has none', () => {
    expect(readReply({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] }, { toolName: 'take_action' }))
      .toMatchObject({ ok: false, problem: expect.stringContaining('refusal: cyber'), toolInput: null });
    expect(readReply({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Thinking it over' }] }, { toolName: 'take_action' }))
      .toMatchObject({ ok: false, problem: expect.stringContaining('max_tokens') });
    expect(readReply({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'take_action', input: { action: 'stop' } }] }, { toolName: 'take_action' }))
      .toMatchObject({ ok: true, toolInput: { action: 'stop' } });
    expect(readReply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'I would wait.' }] }, { toolName: 'take_action' }))
      .toMatchObject({ ok: true, toolInput: null, text: 'I would wait.' });
  });

  it('a call is budgeted, keyed in a header, and logged without one', async () => {
    const budget = createBudget({ caps: CAPS, prices: PRICES });
    const requestLog = [];
    const fetchImpl = vi.fn(async () => ok([{ type: 'tool_use', name: 'take_action', input: { action: 'stop' } }]));
    const res = await callClaude({ ...base, tool: ACTION_TOOL, budget, requestLog, fetchImpl });
    expect(res).toMatchObject({ ok: true, toolInput: { action: 'stop' } });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers).toMatchObject({ 'x-api-key': 'sk-test-key', 'anthropic-version': expect.any(String) });
    expect(JSON.stringify(requestLog)).not.toContain('sk-test-key');
    expect(requestLog[0]).toMatchObject({ role: 'player', status: 200, usage: { input_tokens: 500 }, reply: { toolInput: { action: 'stop' } } });
    expect(budget.report().byRole.player).toMatchObject({ calls: 1, input: 500, output: 50 });
  });

  it('retries an overloaded reply, each attempt its own budgeted call; gives up on a bad request', async () => {
    const budget = createBudget({ caps: { ...CAPS, calls: 10 }, prices: PRICES });
    const replies = [new Response('overloaded', { status: 529 }), ok([{ type: 'text', text: 'fine' }], { stop_reason: 'end_turn' })];
    const res = await callClaude({ ...base, budget, fetchImpl: async () => replies.shift() });
    expect(res).toMatchObject({ ok: true, text: 'fine' });
    expect(budget.report().calls).toBe(2);

    const bad = vi.fn(async () => new Response('{"type":"error"}', { status: 400 }));
    expect(await callClaude({ ...base, budget, fetchImpl: bad })).toMatchObject({ ok: false, kind: 'api', problem: expect.stringContaining('HTTP 400') });
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it('a call the budget cannot cover is not sent', async () => {
    const budget = createBudget({ caps: { ...CAPS, usd: 0.0001 }, prices: PRICES });
    const fetchImpl = vi.fn();
    expect(await callClaude({ ...base, budget, fetchImpl })).toMatchObject({ ok: false, kind: 'budget' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ── the player ───────────────────────────────────────────────────────────────

const SCREEN = {
  character: { name: 'Mira Kestrel', health: 5, spirit: 4, supply: 5, momentum: 2 },
  windows: [{ title: 'Begin a Session', text: 'Spotlight vignette', fields: [{ name: 'vignette', type: 'checkbox', label: 'Spotlight', value: 'false' }], buttons: ['Begin'] }],
  messages: [
    { ref: 'm1', id: 'idA', speaker: 'Gamemaster', text: 'Pay the price.', buttons: [{ n: 1, label: 'Endure Harm (-1)', disabled: false }, { n: 2, label: 'Lose Momentum (-1)', disabled: true }] },
    { ref: 'm2', id: 'idB', speaker: 'Mira Kestrel', text: 'I look around.', buttons: [] },
    { ref: 'm3', id: 'idC', speaker: 'Gamemaster', text: 'Pay the price again.', buttons: [{ n: 1, label: 'Endure Harm (-1)', disabled: false }] },
  ],
};

describe('the AI player', () => {
  it('reads its screen as text: its character, open windows with their fields and buttons, the chat with live buttons only', () => {
    const text = describeScreen(SCREEN);
    expect(text).toContain('YOUR CHARACTER: Mira Kestrel — health 5, spirit 4, supply 5, momentum 2');
    expect(text).toContain('OPEN WINDOW 1: "Begin a Session"');
    expect(text).toContain('field vignette (checkbox, "Spotlight") = "false"');
    expect(text).toContain('[m1] Gamemaster: Pay the price.');
    expect(text).toContain('(1) "Endure Harm (-1)"');
    expect(text, 'a disabled button is not offered').not.toContain('Lose Momentum');
    expect(describeScreen({ character: null, windows: [], messages: [] })).toContain('OPEN WINDOWS: none');
  });

  it.each([
    ['a line', { action: 'say', text: '  I ask the dockmaster.  ' }, { action: 'say', text: 'I ask the dockmaster.' }],
    ['a button on a card', { action: 'click', message: 'm3', button: 1 }, { action: 'click', messageId: 'idC', button: 1, label: 'Endure Harm (-1)' }],
    ['a window', { action: 'dialog', window: 1, text: 'Begin', fields: [{ name: 'vignette', value: 'true' }] }, { action: 'dialog', title: 'Begin a Session', press: 'Begin', fields: [{ name: 'vignette', value: 'true' }] }],
    ['a wait, held to its limit', { action: 'wait', seconds: 600 }, { action: 'wait', seconds: MAX_WAIT_SECONDS }],
    ['a stop', { action: 'stop', reason: 'done' }, { action: 'stop', reason: 'done' }],
  ])('allows %s the screen offers', (_what, input, action) => {
    expect(validateAction(input, SCREEN)).toMatchObject({ ok: true, action });
  });

  it.each([
    ['an empty line', { action: 'say', text: '   ' }, 'say needs text'],
    ['a message that is not on screen', { action: 'click', message: 'm9', button: 1 }, 'no message'],
    ['a disabled button', { action: 'click', message: 'm1', button: 2 }, 'disabled'],
    ['a button the window lacks', { action: 'dialog', window: 1, text: 'Cancel' }, 'no button "Cancel"'],
    ['a field the window lacks', { action: 'dialog', window: 1, text: 'Begin', fields: [{ name: 'gold', value: '9' }] }, 'no field gold'],
    ['a window that is not open', { action: 'dialog', window: 2, text: 'Begin' }, 'no open window'],
    ['an action it was never given', { action: 'setFlag' }, 'unknown action'],
  ])('refuses %s', (_what, input, problem) => {
    expect(validateAction(input, SCREEN)).toMatchObject({ ok: false, problem: expect.stringContaining(problem) });
  });

  it('a click is kept for a replay without its document id, and found again in another world', () => {
    const taken = validateAction({ action: 'click', message: 'm1', button: 1 }, SCREEN).action;
    const kept = scriptedForm(taken, SCREEN);
    expect(kept).toEqual({ action: 'click', label: 'Endure Harm (-1)', fromNewest: 1, reason: '' });
    const elsewhere = { ...SCREEN, messages: SCREEN.messages.map(m => ({ ...m, id: `${m.id}-other` })) };
    expect(resolveScripted(kept, elsewhere)).toMatchObject({ ok: true, action: { messageId: 'idA-other', button: 1 } });
    expect(resolveScripted(kept, { ...SCREEN, messages: [] })).toMatchObject({ ok: false, problem: expect.stringContaining('no message on screen offers') });
  });

  it('a scripted window action waits on the window: not open, it does not resolve', () => {
    const begin = { action: 'dialog', title: 'Begin a Session', fields: [], press: 'Begin' };
    expect(resolveScripted(begin, SCREEN)).toMatchObject({ ok: true, action: { title: 'Begin a Session', press: 'Begin' } });
    expect(resolveScripted(begin, { ...SCREEN, windows: [] })).toMatchObject({ ok: false, problem: expect.stringContaining('is not open') });
    expect(resolveScripted({ action: 'teleport' }, SCREEN).ok).toBe(false);
  });

  it('asks again once when the model answers without the tool or off the screen, then gives up', async () => {
    const budget = createBudget({ caps: { ...CAPS, calls: 10 }, prices: PRICES });
    const reply = (input) => new Response(JSON.stringify({ stop_reason: 'tool_use', usage: {}, content: input ? [{ type: 'tool_use', name: 'take_action', input }] : [{ type: 'text', text: 'Hm.' }] }), { status: 200 });
    const queue = [reply(null), reply({ action: 'say', text: 'I wait by the dock.' })];
    const asked = [];
    const fetchImpl = async (_url, init) => { asked.push(JSON.parse(init.body).messages[0].content); return queue.shift(); };
    const args = { apiKey: 'k', model: 'opus', effort: 'low', maxTokens: 1000, charter: CHARTER, history: [], snapshot: SCREEN, budget, fetchImpl };
    expect(await chooseAction(args)).toMatchObject({ action: { action: 'say', text: 'I wait by the dock.' }, attempts: 2 });
    expect(asked[1]).toContain('could not be used: the reply did not use take_action');

    const never = async () => reply({ action: 'click', message: 'm9', button: 1 });
    expect(await chooseAction({ ...args, fetchImpl: never })).toMatchObject({ action: null, kind: 'reply', attempts: 2 });
  });

  it('summarises an action in one line', () => {
    expect(summariseAction({ action: 'dialog', title: 'End a Session', fields: [{ name: 'questFocus', value: 'Find the courier' }], press: 'End Session' }))
      .toBe('in "End a Session" set questFocus=Find the courier and press "End Session"');
  });
});

// ── the observer ─────────────────────────────────────────────────────────────

const COMPASS = { id: 'compass', statement: 'Mira carries a star-compass.', variants: ['star-compass', 'compass'], required: true };
const SISTER  = { id: 'sister', statement: 'Her sister is Ilse.', variants: ['Ilse'], required: false };

describe('a planted fact', () => {
  it('is held by text whatever the case, spacing or hyphenation — and not by a longer word', () => {
    for (const text of ['the Star-Compass', 'her star compass', 'a starcompass', 'the star‑compass', 'star –compass']) expect(factIn(text, COMPASS), text).toBe(true);
    for (const text of ['she is encompassed by doubt', 'the stars', '']) expect(factIn(text, COMPASS), text).toBe(false);
    expect(factIn('Ilse\'s', SISTER)).toBe(true);
    expect(factIn('Ilsebeth', SISTER)).toBe(false);
    expect(new RegExp(variantPattern('C.O.D.')).test('CxOxDx'), 'a variant is text, not a pattern').toBe(false);
  });

  it('is excerpted with its surroundings, and placed in the prompt section that holds it', () => {
    expect(excerptOf('one two three compass four five', COMPASS, 6)).toBe('three compass four');
    const prompt = 'Preamble with no fact.\n## CHARACTER\nMira Kestrel\n## WORLD SNAPSHOT\nShe carries a brass star-compass.\n## RECENT SCENE\nThe dock hums.';
    expect(sectionsHolding(prompt, COMPASS)).toEqual(['WORLD SNAPSHOT']);
    expect(sectionsHolding('The compass, before any heading.', COMPASS)).toEqual(['(preamble)']);
  });
});

/** A run's record, as createObserver keeps it: one mark per step, the chat in order. */
function record(steps) {
  const marks = [];
  const messages = [];
  const requests = [];
  let n = 0;
  for (const s of steps) {
    marks.push({ step: s.step, phase: s.phase, session: { sceneId: s.scene ?? 'sc-1', locationId: 'loc-1' }, stores: s.stores ?? { compass: [], sister: [] } });
    if (s.line) messages.push({ id: `m${++n}`, step: s.step, phase: s.phase, fromPlayer: true, narrator: false, vignette: null, text: s.line });
    if (s.card) messages.push({ id: `m${++n}`, step: s.step, phase: s.phase, fromPlayer: false, narrator: false, vignette: null, text: s.card });
    if (s.vignette) messages.push({ id: `m${++n}`, step: s.step, phase: s.phase, fromPlayer: false, narrator: true, vignette: 'galley_begin', text: s.vignette });
    if (s.answer !== undefined) {
      messages.push({ id: `m${++n}`, step: s.step, phase: s.phase, fromPlayer: false, narrator: true, vignette: null, text: s.answer });
      requests.push({ step: s.step, kind: 'callNarratorAPI>narratePacedInput', system: s.prompt ?? '## CHARACTER\nMira Kestrel', user: s.line ?? '' });
    }
  }
  return { marks, messages, requests };
}

const STORED = { compass: [{ store: 'journal "Chronicle — Mira Kestrel" → page "Chronicle" (flags)', memory: true, excerpt: 'the brass star-compass' }], sister: [] };
const LOGGED = { compass: [{ store: 'journal "Pacing Telemetry" → page "Session 1"', memory: false, excerpt: 'the brass star-compass' }], sister: [] };
const SENT   = '## CHARACTER\nMira Kestrel\n## LAST SESSION\nShe showed her sister\'s brass star-compass.';

/** Two sessions: the fact stated, the session ended and begun again, the question asked. */
const twoSessions = ({ stores = STORED, prompt = SENT, answer = 'The star-compass, as always.', ask = 'What do I still carry that belonged to my sister?', extra = [] } = {}) => record([
  { step: '(setup)', phase: 'before' },
  { step: 'a1', phase: 'session-1', vignette: 'The galley is quiet.' },
  { step: 'a2', phase: 'session-1', line: 'I turn my sister Ilse\'s star-compass over in my palm.', answer: 'It sits warm in your hand.' },
  { step: 'a3', phase: 'session-1', line: 'We set a course for Bleakhold.', answer: 'The ship turns.', scene: 'sc-2' },
  { step: 'a4', phase: 'after-session-1', card: 'End a Session', stores },
  { step: 'a5', phase: 'session-2', vignette: 'Morning in the galley.', stores },
  ...extra,
  { step: 'a6', phase: 'session-2', line: ask, answer, prompt, stores },
]);

const score = (run, askCues = ['sister', 'carry']) => scoreMemory({ facts: [COMPASS, SISTER], askCues, ...run });

describe('the memory goal, scored layer by layer', () => {
  it('achieved: stored, sent, and in the narrator\'s answer', () => {
    const outcome = score(twoSessions());
    expect(outcome).toMatchObject({ status: 'achieved', failingLayer: null });
    expect(outcome.milestones).toEqual({ sessionBegun: true, factEstablished: true, narratedAfter: true, sceneChanged: true, sessionEnded: true, sessionBegunAgain: true, askedLater: true });
    expect(outcome.asks[0].facts[0]).toMatchObject({ id: 'compass', stored: true, inPrompt: true, promptSections: ['LAST SESSION'], inAnswer: true, failingLayer: null });
    expect(outcome.asks[0].facts[1], 'a fact that is not required is reported, and does not decide').toMatchObject({ id: 'sister', required: false, inAnswer: false });
  });

  it.each([
    ['generation', {}, 'reached the narrator\'s prompt'],
    ['retrieval', { prompt: '## CHARACTER\nMira Kestrel' }, 'no prompt for the player\'s question carried it'],
    ['storage', { prompt: '## CHARACTER\nMira Kestrel', stores: { compass: [], sister: [] } }, 'in no store'],
  ])('not achieved — %s: the layer the fact was lost at', (layer, lost, reason) => {
    const outcome = score(twoSessions({ answer: 'You pat your pockets. Nothing comes to mind.', ...lost }));
    expect(outcome).toMatchObject({ status: 'not-achieved', failingLayer: layer, reason: expect.stringContaining(reason) });
  });

  it('a diagnostic log that kept the player\'s line is not memory', () => {
    const outcome = score(twoSessions({ answer: 'Nothing comes to mind.', prompt: '## CHARACTER\nMira Kestrel', stores: LOGGED }));
    expect(outcome.failingLayer).toBe('storage');
    expect(outcome.asks[0].facts[0]).toMatchObject({ stored: false, keptElsewhere: ['journal "Pacing Telemetry" → page "Session 1"'] });
  });

  it('the opening vignette of the second session is not an answer to the question', () => {
    const run = twoSessions({ answer: 'Nothing comes to mind.' });
    run.messages.find(m => m.vignette && m.phase === 'session-2').text = 'The star-compass swings from its hook.';
    expect(score(run).status).toBe('not-achieved');
  });

  it('asked twice: the goal is achieved if either answer holds it', () => {
    const first = { step: 'a5b', phase: 'session-2', line: 'What of my sister\'s do I carry?', answer: 'You are not sure.', prompt: SENT, stores: STORED };
    expect(score(twoSessions({ extra: [first] })).status).toBe('achieved');
  });

  it.each([
    ['never asked', (run) => { run.messages.pop(); run.messages.pop(); }, 'never asked about the fact'],
    ['asked about something else', (run) => { run.messages.at(-2).text = 'Where is the dockmaster?'; }, 'never asked about the fact'],
    ['named the fact in the question', (run) => { run.messages.at(-2).text = 'Do I still carry my sister\'s star-compass?'; }, 'named the fact itself'],
    ['never ended the first session', (run) => { for (const k of run.marks) if (k.phase === 'after-session-1') k.phase = 'session-1'; }, 'never ended'],
    ['never established the fact', (run) => { run.messages.find(m => m.fromPlayer).text = 'I look around the dock.'; }, 'never established the fact'],
  ])('not exercised — the player %s', (_what, change, reason) => {
    const run = twoSessions();
    change(run);
    const outcome = score(run);
    expect(outcome).toMatchObject({ status: 'not-exercised', failingLayer: null, reason: expect.stringContaining(reason) });
  });

  it('once the player names the fact, later questions prove nothing — earlier ones still count', () => {
    const leak = { step: 'a5b', phase: 'session-2', line: 'I check my star-compass.', answer: 'Its needle is steady.', prompt: SENT, stores: STORED };
    expect(score(twoSessions({ extra: [leak] })).status, 'the only question came after the leak').toBe('not-exercised');
    const run = twoSessions();
    run.marks.push({ step: 'a7', phase: 'session-2', session: {}, stores: STORED });
    run.messages.push({ id: 'late', step: 'a7', phase: 'session-2', fromPlayer: true, narrator: false, vignette: null, text: 'My star-compass again.' });
    expect(score(run).status, 'asked cleanly first').toBe('achieved');
  });

  it('a chat command and a card the player\'s client posted are not the player\'s lines', () => {
    const run = twoSessions();
    const at = run.messages.findIndex(m => m.phase === 'session-2' && m.vignette);
    run.messages.splice(at, 0, { id: 'cmd', step: 'a5', phase: 'session-2', fromPlayer: true, narrator: false, vignette: null, text: '!begin-session' });
    expect(score(run).asks).toHaveLength(1);
  });
});

describe('health, and the run\'s class', () => {
  const clients = (errors = []) => [{ label: 'gm', errors }, { label: 'player', errors: [] }];
  const achieved = { status: 'achieved', reason: 'held', failingLayer: null };

  it('healthy: the lock free, no error of the module\'s, every step settled', () => {
    expect(healthOf({ endSession: { pendingMove: false }, clients: clients(['Failed to load resource: 404']) })).toMatchObject({ failures: [], errors: [{ module: false }] });
  });

  it('a held move lock, a module error and a stall each fail it; an error keyed as known does not', () => {
    const own = 'starforged-companion | narratePacedInput failed: TypeError';
    const health = healthOf({ endSession: { pendingMove: true }, clients: clients([own, 'pageerror: x is not defined']), stalls: [{ step: 'a4', detail: 'still busy' }] });
    expect(health.failures).toHaveLength(3);
    expect(health.failures.join(' | ')).toMatch(/move lock.*2 error\(s\).*a4 never settled/);
    const known = healthOf({ endSession: { pendingMove: false }, clients: clients([own]), knownErrors: [{ id: 'KNOWN-1', match: 'narratePacedInput failed' }] });
    expect(known).toMatchObject({ failures: [], knownFailures: ['KNOWN-1'] });
  });

  it('a table left waiting on a question put to the GM is the run\'s limit, not the module\'s failure — the lock it holds is the question\'s', () => {
    // The module asks the GM "Who are you interacting with?" before the dice
    // and holds the move until it is answered (decisions.md, issue #347 D1).
    const waiting = healthOf({ endSession: { pendingMove: true }, clients: clients(), stalls: [{ step: 'a4', detail: 'waiting', waitingOnGm: ['Who are you interacting with?'] }] });
    expect(waiting).toMatchObject({ failures: [], waitingOnGm: ['Who are you interacting with?'] });
    const outcome = { status: 'not-exercised', reason: 'the first session was never ended', failingLayer: null };
    expect(classifyRun({ outcome, health: waiting })).toMatchObject({ classification: 'not-exercised', because: expect.stringContaining('"Who are you interacting with?", which the run\'s GM autopilot does not answer') });
    expect(classifyRun({ outcome, health: waiting, budgetStop: { cap: 'minutes', detail: '20' } }).classification, 'the unanswered question, not the clock, is why').toBe('not-exercised');
    // With no window to explain it, a held lock and a stall are failures.
    expect(healthOf({ endSession: { pendingMove: true }, clients: clients(), stalls: [{ step: 'a4', detail: 'still busy', waitingOnGm: [] }] }).failures).toHaveLength(2);
  });

  it.each([
    ['pass', { outcome: achieved }],
    ['infrastructure-error', { outcome: achieved, infrastructure: 'the player model could not be reached', health: { failures: ['x'] } }],
    ['product-failure', { outcome: achieved, health: { failures: ['the move lock was still held'] } }],
    ['not-exercised', { outcome: { status: 'not-exercised', reason: 'never asked' } }],
    ['budget-exhausted', { outcome: { status: 'not-exercised', reason: 'never asked' }, budgetStop: { cap: 'usd', detail: '$10' } }],
    ['suspected-quality-issue', { outcome: { status: 'not-achieved', reason: 'lost', failingLayer: 'retrieval' } }],
    ['pass', { outcome: achieved, budgetStop: { cap: 'actions', detail: '30' } }],
  ])('%s', (classification, input) => {
    expect(classifyRun({ health: { failures: [] }, ...input }).classification).toBe(classification);
  });
});

// ── a rehearsal ──────────────────────────────────────────────────────────────

describe('a rehearsal\'s stand-in for the model API', () => {
  const NARRATOR = '## NARRATOR ROLE AND VOICE\n\n## RESPONSE FORMAT — MANDATORY SIDECAR';
  const ask = (rehearsal, system, user, tool = null) => rehearsal.reply({ system, messages: [{ role: 'user', content: user }], tools: tool ? [tool] : undefined });
  const textOf = (reply) => reply.content.map(c => c.text ?? '').join('');
  const fact = CHARTER.facts[0];

  it('gives the charter\'s script back through the player\'s own tool: every action is one its screen allows', () => {
    const rehearsal = createRehearsal({ charter: CHARTER });
    const taken = [];
    for (const scripted of CHARTER.rehearsal) {
      const screen = { character: null, messages: [], windows: scripted.action === 'dialog'
        ? [{ title: 'Welcome back', text: '', fields: [], buttons: ['Save'] }, { title: scripted.title, text: '', fields: (scripted.fields ?? []).map(f => ({ name: f.name, type: 'text', label: '', value: '' })), buttons: [scripted.press] }]
        : [] };
      const reply = ask(rehearsal, 'You are playtesting', `YOUR SCREEN NOW:\n${describeScreen(screen)}`, ACTION_TOOL);
      expect(reply.stop_reason).toBe('tool_use');
      const checked = validateAction(reply.content[0].input, screen);
      expect(checked, JSON.stringify(scripted)).toMatchObject({ ok: true });
      taken.push(checked.action);
    }
    expect(taken.map(a => a.action)).toEqual(CHARTER.rehearsal.map(a => a.action));
    expect(taken.filter(a => a.action === 'dialog').map(a => `${a.title}:${a.press}`)).toEqual(['Begin a Session:Begin', 'End a Session:End Session', 'Begin a Session:Begin']);
    expect(ask(rehearsal, '', '', ACTION_TOOL).content[0].input.action, 'past its end, the script stops').toBe('stop');
  });

  it('remembering: once the fact is in front of it, everything it writes carries it — prose, fact block, chronicle, summary', () => {
    const rehearsal = createRehearsal({ charter: CHARTER });
    const narrated = textOf(ask(rehearsal, NARRATOR, 'I turn the brass star-compass over.'));
    expect(factIn(narrated, fact)).toBe(true);
    expect(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(narrated)[1]).newTruths).toEqual([{ subject: 'Mira Kestrel', fact: fact.statement }]);
    expect(JSON.parse(textOf(ask(rehearsal, 'You are the chronicle scribe', 'the star compass')))).toMatchObject({ salience: 'notable', text: fact.statement });
    expect(factIn(textOf(ask(rehearsal, 'You are the continuity scribe', 'her star-compass')), fact)).toBe(true);
    expect(factIn(textOf(ask(rehearsal, NARRATOR, 'What do I still carry?')), fact), 'not in front of it: it does not invent it').toBe(false);
    expect(factIn(textOf(ask(rehearsal, `${NARRATOR}\n## LAST SESSION\nThe brass star-compass.`, 'What do I still carry?')), fact), 'sent by the module: it answers with it').toBe(true);
  });

  it('forgetful: nothing it writes carries the fact', () => {
    const rehearsal = createRehearsal({ charter: CHARTER, forget: true });
    const narrated = textOf(ask(rehearsal, NARRATOR, 'I turn the brass star-compass over.'));
    expect(factIn(narrated, fact)).toBe(false);
    expect(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(narrated)[1]).newTruths).toEqual([]);
    expect(JSON.parse(textOf(ask(rehearsal, 'You are the chronicle scribe', 'the star compass'))).salience).toBe('trivial');
    expect(factIn(textOf(ask(rehearsal, 'You are the continuity scribe', 'her star-compass')), fact)).toBe(false);
  });

  it('answers the module\'s helpers in a shape each can read, and narrates every line without a roll', () => {
    const rehearsal = createRehearsal({ charter: CHARTER });
    expect(JSON.parse(textOf(ask(rehearsal, 'You are the pacing pre-classifier', 'a line')))).toMatchObject({ decision: 'NARRATIVE', confidence: 0.9 });
    expect(textOf(ask(rehearsal, 'Return only the JSON object — no prose.', 'detect'))).toBe('{}');
    expect(textOf(ask(rehearsal, '## NARRATOR ROLE AND VOICE', 'a recap, no fact block')), 'no fact block where none is asked for').not.toContain('```json');
  });

  it('installed, it answers api.anthropic.com in this process and leaves every other host alone', async () => {
    const real = vi.fn(async () => new Response('elsewhere', { status: 200 }));
    vi.stubGlobal('fetch', real);
    const stand = installRehearsal({ charter: CHARTER });
    const body = JSON.stringify({ model: 'claude-sonnet-5-5', system: NARRATOR, messages: [{ role: 'user', content: 'I wait.' }] });
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body });
    const data = await res.json();
    expect(data).toMatchObject({ type: 'message', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: expect.any(Number), output_tokens: expect.any(Number) } });
    expect(real).not.toHaveBeenCalled();
    await fetch('https://foundry.example/join');
    expect(real).toHaveBeenCalledTimes(1);
    expect(stand.asked).toEqual([{ model: 'claude-sonnet-5-5', tool: null }]);
    stand.restore();
    expect(globalThis.fetch).toBe(real);
  });
});

// ── the live runs kept as replays ────────────────────────────────────────────

// Each went the whole way with real narrator replies. The first (2026-11-22)
// is the run issue #374's review was made from, one move rolled; the second
// (2026-11-23) is the re-run after that issue's fixes, four moves rolled.
const KEPT_RUNS = [
  { name: 'memory-live-20261122', rolls: 1 },
  { name: 'memory-live-20261123', rolls: 4 },
];

describe.each(KEPT_RUNS)('a live run of the memory charter, kept as a replay (explorations/$name)', ({ name, rolls }) => {
  const FILE = path.join(PLAYWRIGHT, 'explorations', name, 'replay.json');
  const RUN  = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const compass = RUN.charter.facts.find(f => f.id === 'compass');
  const actions = RUN.actions.map((a, i) => ({ ...a, step: `a${i + 1}` }));
  const says = actions.filter(a => a.action === 'say');
  const secondBegin = says.filter(a => a.text === '!begin-session')[1];
  const secondSession = says.filter(a => Number(a.step.slice(1)) > Number(secondBegin.step.slice(1)));
  const replies = (step, kind) => RUN.recording.exchanges.filter(x => x.step === step && x.kind === kind)
    .map(x => x.response.content.map(c => c.text ?? '').join('')).join('\n');

  it('is a run the runner can take again: its actions carry no document id, and every recorded reply belongs to one of them', () => {
    expect(RUN.expected).toMatchObject({ status: 'achieved', failingLayer: null, healthFailed: false });
    expect(RUN.recording.provenance).toMatchObject({ runner: 'test/ci/playwright/explore.mjs', commit: expect.stringMatching(/^[0-9a-f]{40}$/) });
    expect(actions.map(a => a.action)).toEqual(['say', 'dialog', 'say', 'say', 'say', 'say', 'say', 'dialog', 'say', 'dialog', 'say', 'stop']);
    for (const a of actions) expect(Object.keys(a), a.step).not.toContain('messageId');
    const steps = new Set(actions.map(a => a.step));
    expect(RUN.recording.exchanges.filter(x => !steps.has(x.step)).map(x => `${x.step} ${x.kind}`)).toEqual([]);
    expect(RUN.dice, 'each move rolled: two challenge dice and the action die').toHaveLength(3 * rolls);
  });

  it('holds what its result claims: the fact stated in the first session, never named in the second, and in the narrator\'s replies there', () => {
    expect(says.filter(a => Number(a.step.slice(1)) < Number(secondBegin.step.slice(1))).some(a => factIn(a.text, compass)), 'established in the first session').toBe(true);
    expect(secondSession.filter(a => factIn(a.text, compass)).map(a => a.text), 'the player\'s lines of the second session').toEqual([]);
    const ask = secondSession.at(-1);
    expect(RUN.charter.ask.cues.some(cue => ask.text.toLowerCase().includes(cue)), 'the last line is the question').toBe(true);
    expect(factIn(replies(ask.step, 'callNarratorAPI>narratePacedInput'), compass), 'the narrator\'s answer').toBe(true);
    // The better evidence: the second session's opening had it before anyone asked.
    const opened = actions.find(a => a.action === 'dialog' && Number(a.step.slice(1)) > Number(secondBegin.step.slice(1)));
    expect(factIn(replies(opened.step, 'callNarratorAPI>narrateSessionVignette'), compass), 'the second session\'s opening vignette').toBe(true);
  });

  it('carries no key, and every model it recorded has a price', () => {
    expect(fs.readFileSync(FILE, 'utf8')).not.toMatch(/sk-ant-/);
    expect(Object.keys(CONFIG.prices.usdPerMillionTokens)).toEqual(expect.arrayContaining(RUN.recording.provenance.models));
  });
});

// ── what ships ───────────────────────────────────────────────────────────────

describe('the memory charter and the run\'s config', () => {
  it('the caps are the issue\'s: 30 actions, 100 model calls, 20 minutes, $10', () => {
    expect(CONFIG.caps).toEqual({ actions: 30, calls: 100, minutes: 20, usd: 10 });
  });

  it('the player is the model the maintainer chose, and the run calls no model to review it', () => {
    // 2026-11-23: the AI player on Sonnet 5.5; a run is reviewed by the agent
    // that made it, which reads the prompts and records a transcript-only
    // reviewer was never shown — the API reviewer is deleted, not switched
    // off (decisions.md → "AI exploration").
    expect(CONFIG.player).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'low' });
    expect(CONFIG).not.toHaveProperty('reviewer');
    expect(fs.existsSync(path.join(PLAYWRIGHT, 'lib/reviewer.mjs'))).toBe(false);
    expect(fs.readFileSync(path.join(PLAYWRIGHT, 'explore.mjs'), 'utf8')).not.toMatch(/reviewTranscript|review\.json/);
  });

  it('every model the run calls has a price — the player\'s and the module\'s own', () => {
    const priced = Object.keys(CONFIG.prices.usdPerMillionTokens);
    expect(priced).toEqual(expect.arrayContaining([CONFIG.player.model]));
    const recorded = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'recordings/first-session.json'), 'utf8'));
    expect(priced, 'the models the module called when first-session was recorded').toEqual(expect.arrayContaining([...new Set(recorded.exchanges.map(x => x.model))]));
    for (const price of Object.values(CONFIG.prices.usdPerMillionTokens)) expect(price.output).toBeGreaterThan(price.input);
  });

  it('the charter names a required fact, and its goal does not ask the player to judge it', () => {
    expect(CHARTER.facts.filter(f => f.required !== false).map(f => f.id)).toEqual(['compass']);
    expect(CHARTER.goal).toMatch(/!begin-session/);
    expect(CHARTER.goal).toMatch(/!end-session/);
    expect(CHARTER.playerNotes.join(' ')).toMatch(/never write the words compass or Ilse/);
  });

  it('its rehearsal script walks the whole goal: scored on a table that answers, it is exercised — and achieved only when the answer holds the fact', () => {
    const says = CHARTER.rehearsal.filter(a => a.action === 'say').map(a => a.text);
    const stated = says.find(t => factIn(t, CHARTER.facts[0]));
    const ask = says.at(-1);
    expect(stated, 'the script states the fact').toBeTruthy();
    expect(factIn(ask, CHARTER.facts[0]), 'and does not name it when it asks').toBe(false);
    const run = (answer) => record([
      { step: 'a2', phase: 'session-1', vignette: 'Galley.' },
      { step: 'a3', phase: 'session-1', line: stated, answer: 'Noted.' },
      { step: 'a6', phase: 'after-session-1', card: 'End a Session' },
      { step: 'a8', phase: 'session-2', vignette: 'Galley again.' },
      { step: 'a9', phase: 'session-2', line: ask, answer },
    ]);
    const scored = (answer) => scoreMemory({ facts: CHARTER.facts, askCues: CHARTER.ask.cues, ...run(answer) }).status;
    expect(scored('The brass star-compass, your sister\'s.')).toBe('achieved');
    expect(scored('The narrator pauses.')).toBe('not-achieved');
  });
});
