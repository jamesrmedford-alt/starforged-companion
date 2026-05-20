/**
 * STARFORGED COMPANION
 * tests/unit/apiProxy.test.js
 *
 * Coverage for src/api-proxy.js — the defensive trim on `x-api-key`
 * and the 401 hint logging added in response to the v1.3.4 401
 * cascade.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiPost } from '../../src/api-proxy.js';

const URL = 'https://api.anthropic.com/v1/messages';

beforeEach(() => {
  // Default: fetch returns 200 with empty JSON. Tests override as needed.
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok:     true,
    status: 200,
    json:   async () => ({ content: [] }),
    text:   async () => '',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});


describe('apiPost — x-api-key trimming', () => {
  it('trims surrounding whitespace from x-api-key before sending', async () => {
    await apiPost(URL, { 'x-api-key': '   sk-ant-xyz   ' }, {});
    const sent = globalThis.fetch.mock.calls[0][1].headers;
    expect(sent['x-api-key']).toBe('sk-ant-xyz');
  });

  it('strips trailing newlines (the common copy-paste failure mode)', async () => {
    await apiPost(URL, { 'x-api-key': 'sk-ant-xyz\n' }, {});
    const sent = globalThis.fetch.mock.calls[0][1].headers;
    expect(sent['x-api-key']).toBe('sk-ant-xyz');
  });

  it('passes already-clean keys through unchanged', async () => {
    await apiPost(URL, { 'x-api-key': 'sk-ant-xyz' }, {});
    expect(globalThis.fetch.mock.calls[0][1].headers['x-api-key']).toBe('sk-ant-xyz');
  });

  it('ignores x-api-key trim when it is not a string', async () => {
    // Defensive — if some caller accidentally passes a non-string we
    // should not crash. The header just gets passed through.
    await apiPost(URL, { 'x-api-key': undefined }, {});
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('always includes the anthropic-dangerous-direct-browser-access header', async () => {
    await apiPost(URL, { 'x-api-key': 'k' }, {});
    const sent = globalThis.fetch.mock.calls[0][1].headers;
    expect(sent['anthropic-dangerous-direct-browser-access']).toBe('true');
  });
});


describe('apiPost — 401 surface', () => {
  it('logs a key-prefix hint on 401 (caller still gets the thrown error)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok:     false,
      status: 401,
      text:   async () => '{"type":"error","message":"invalid x-api-key"}',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      apiPost(URL, { 'x-api-key': 'sk-or-v1-mistake' }, {}),
    ).rejects.toThrow(/401/);

    // Hint should mention "sk-or-v" (the OpenRouter prefix the user pasted)
    // and the contrasting "sk-ant-" requirement.
    const messages = warn.mock.calls.map(c => c.join(' ')).join('\n');
    expect(messages).toMatch(/sk-or-v/);
    expect(messages).toMatch(/sk-ant-/);
  });

  it('non-401 errors do not emit the key-prefix hint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok:     false,
      status: 500,
      text:   async () => 'server error',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      apiPost(URL, { 'x-api-key': 'sk-ant-xyz' }, {}),
    ).rejects.toThrow(/500/);
    const messages = warn.mock.calls.map(c => c.join(' ')).join('\n');
    expect(messages).not.toMatch(/key prefix/);
  });

  it('handles empty key on 401 without crashing the hint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok:     false,
      status: 401,
      text:   async () => 'unauthorized',
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(apiPost(URL, { 'x-api-key': '' }, {})).rejects.toThrow(/401/);
  });
});
