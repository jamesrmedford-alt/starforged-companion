/**
 * Every Claude call goes out with its model's thinking-off form (issue #325
 * W27; the Haiku 5.5 / Sonnet 5.5 upgrade).
 *
 * Haiku 5.5 and Sonnet 5.5 — the defaults — run adaptive thinking when a
 * request omits `thinking`, and thinking shares the `max_tokens` cap: the
 * classifier's 330-token decision, the chronicle scribe's 260, a seed's 220
 * could come back with no text block. Short calls on the narration model each
 * spread the rule into their body; the Haiku calls did not. api-proxy.js now
 * applies it to every body that sets no `thinking`, in the form each model
 * accepts (narration/thinking.js).
 *
 * The two readers of a typed line — the pacing classifier and the move
 * interpreter — run on Sonnet 5.5 (decisions.md → "The readers run on Sonnet
 * 5.5"; they ran on Haiku 5.5). Sonnet 5.5 answers `thinking: { type:
 * "disabled" }` with a 400, takes nothing beside `between_tools` in
 * `thinking`, and refuses a sampling parameter: what each reader's request
 * carries on the wire is checked here, through the readers themselves.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const sent = vi.hoisted(() => ({ bodies: [], reply: null }));
vi.mock('../../src/net/fetchWithTimeout.js', () => ({
  DEFAULT_TIMEOUT_MS: 60_000,
  fetchWithTimeout: vi.fn(async (_url, init) => {
    sent.bodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => sent.reply };
  }),
}));
vi.mock('../../src/logging/apiTransactionLog.js', () => ({ logApiTransaction: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { interpretMove } from '../../src/moves/interpreter.js';

const URL = 'https://api.anthropic.com/v1/messages';
const post = (body) => apiPost(URL, { 'x-api-key': 'sk-ant-test' }, body);

beforeEach(() => {
  sent.bodies.length = 0;
  sent.reply = { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' };
});

describe('apiPost sends each model its thinking-off form', () => {
  it('Haiku 5.5 (the detection passes and the other helper calls) is sent "disabled"', async () => {
    await post({ model: 'claude-haiku-5-5', max_tokens: 330, messages: [] });
    expect(sent.bodies[0].thinking).toEqual({ type: 'disabled' });
  });

  it('Sonnet 5.5 (the narration default, and the two readers) is sent "between_tools" — it 400s on "disabled"', async () => {
    await post({ model: 'claude-sonnet-5-5', max_tokens: 16000, messages: [] });
    expect(sent.bodies[0].thinking).toEqual({ type: 'between_tools' });
  });

  it('Sonnet 5 is sent "disabled"', async () => {
    await post({ model: 'claude-sonnet-5', max_tokens: 200, messages: [] });
    expect(sent.bodies[0].thinking).toEqual({ type: 'disabled' });
  });

  it('control: the older models are sent no thinking field', async () => {
    await post({ model: 'claude-sonnet-4-5-20250929', max_tokens: 200, messages: [] });
    await post({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, messages: [] });
    expect(sent.bodies.map(b => 'thinking' in b)).toEqual([false, false]);
  });

  it("a caller's own `thinking` is sent as it is", async () => {
    await post({ model: 'claude-sonnet-5-5', max_tokens: 1000, thinking: { type: 'adaptive' }, messages: [] });
    expect(sent.bodies[0].thinking).toEqual({ type: 'adaptive' });
  });

  it("the caller's body object is not changed", async () => {
    const body = { model: 'claude-haiku-5-5', max_tokens: 100, messages: [] };
    await post(body);
    expect(body.thinking).toBeUndefined();
  });
});

describe('the line reader goes out on Sonnet 5.5, in the form it accepts', () => {
  // What Sonnet 5.5 answers with a 400: `thinking: disabled`, any field beside
  // `between_tools` in `thinking`, an effort above `high` with thinking off, a
  // sampling parameter, a forced tool choice, an assistant prefill.
  const acceptable = (body) => {
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.thinking).toEqual({ type: 'between_tools' });
    for (const refused of ['temperature', 'top_p', 'top_k', 'output_config', 'tool_choice']) expect(body, refused).not.toHaveProperty(refused);
    expect(body.messages.at(-1).role).toBe('user');
  };

  it('one call reads the line (issue #384): Sonnet 5.5, `between_tools`, its 1300-token cap, the rules cached an hour — whatever model a world stored', async () => {
    sent.reply = { content: [{ type: 'text', text: JSON.stringify({ move: 'compel', category: 'social', confidence: 'high', reason: 'pressing', stat: 'heart' }) }], stop_reason: 'end_turn' };
    const reading = await interpretMove('I lean on the dockmaster to waive the fee.', {
      campaignState: { api: { model: 'claude-haiku-5-5', maxTokens: 1000, promptCachingEnabled: true } },
      mischiefLevel: 'lawful', apiKey: 'sk-ant-test',
    });
    expect(reading).toMatchObject({ moveId: 'compel', statUsed: 'heart' });
    expect(sent.bodies).toHaveLength(1);
    acceptable(sent.bodies[0]);
    expect(sent.bodies[0].max_tokens).toBe(1300);
    expect(sent.bodies[0].system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });
});

describe('a declined request', () => {
  it('is logged with its category and returned as it came', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sent.reply = { content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'general_harms' } };
    const data = await post({ model: 'claude-sonnet-5-5', max_tokens: 100, messages: [] });
    expect(data.stop_reason).toBe('refusal');
    expect(warn.mock.calls.map(c => c.join(' ')).join('\n')).toMatch(/declined the request \(refusal: general_harms\)/);
    warn.mockRestore();
  });
});
