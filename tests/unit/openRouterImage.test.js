// tests/unit/openRouterImage.test.js
//
// Unit coverage for src/art/openRouterImage.js — the OpenRouter image transport
// used by the entity-portrait pipeline. This module was previously untested
// (src/art/* is excluded from coverage thresholds in vitest.config.js).
//
// These tests pin the response-shape extraction so the Quench stub fixtures
// (in src/integration/quench.js, portraitGeneration batch) stay aligned with
// the production code.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateOpenRouterImage } from '../../src/art/openRouterImage.js';

const SMALL_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status:  200,
    headers: { 'Content-Type': 'application/json' },
  });
}

let realFetch;

beforeEach(() => {
  realFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('generateOpenRouterImage — required inputs', () => {
  it('throws when apiKey is missing', async () => {
    await expect(
      generateOpenRouterImage({ prompt: 'a portrait' }),
    ).rejects.toThrow(/api key/i);
  });

  it('throws when prompt is missing', async () => {
    await expect(
      generateOpenRouterImage({ apiKey: 'sk-or-x' }),
    ).rejects.toThrow(/prompt/i);
  });
});

describe('generateOpenRouterImage — payload extraction', () => {
  it('returns the raw base64 when the model embeds a data: URL in images[0].image_url.url', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({
      choices: [{
        message: {
          images: [{ image_url: { url: `data:image/png;base64,${SMALL_B64}` } }],
        },
      }],
    }));

    const out = await generateOpenRouterImage({
      apiKey: 'sk-or-test',
      prompt: 'portrait of a quartermaster',
    });

    expect(out).toBe(SMALL_B64);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(/openrouter\.ai\/api\/v1\/chat\/completions$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-or-test');
  });

  it('fetches and base64-encodes an https URL returned in image_url.url', async () => {
    // Build an ArrayBuffer the second fetch will return as image bytes.
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252]);
    const expectedB64 = Buffer.from(bytes).toString('base64');

    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('openrouter.ai')) {
        return jsonResponse({
          choices: [{
            message: {
              images: [{ image_url: { url: 'https://example.com/generated.png' } }],
            },
          }],
        });
      }
      // Second call — fetch the image URL.
      return new Response(bytes.buffer, { status: 200 });
    });

    const out = await generateOpenRouterImage({
      apiKey: 'sk-or-test',
      prompt: 'portrait of a quartermaster',
    });

    expect(out).toBe(expectedB64);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns null when the model emits no recognisable image payload', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: 'sorry, no image today' } }],
    }));

    const out = await generateOpenRouterImage({
      apiKey: 'sk-or-test',
      prompt: 'portrait of a quartermaster',
    });

    expect(out).toBeNull();
  });
});

describe('generateOpenRouterImage — error surfaces', () => {
  it('throws when OpenRouter returns a non-2xx', async () => {
    globalThis.fetch = vi.fn(async () => new Response('rate limited', { status: 429 }));

    await expect(generateOpenRouterImage({
      apiKey: 'sk-or-test',
      prompt: 'portrait',
    })).rejects.toThrow(/OpenRouter API error 429/);
  });

  it('wraps network errors with a recognisable prefix', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('socket hang up'); });

    await expect(generateOpenRouterImage({
      apiKey: 'sk-or-test',
      prompt: 'portrait',
    })).rejects.toThrow(/OpenRouter network error/);
  });
});
